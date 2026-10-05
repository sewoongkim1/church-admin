// 교육신청 — 표를 읽고 쓰는 쪽(서버 · 2026-10-05 · 설계 v2 docs/superpowers/specs/2026-10-05-education-courses-design.md §8)
//   규칙·칸 지도는 edu-rules.ts(순수), 정원·대기·취소는 SQL 함수(성경암송 supabase/edu.sql). index.ts 의 switch 가 makeEdu(...) 의 함수를 부른다.
// ⚠️ npm import 를 두지 않는다 — db(supabase 클라이언트)를 받아 쓴다(Node 시험이 이 파일을 import 할 수 있게).
// ⚠️ 응답에 user_id·ident_key 를 싣지 않는다(courseOut·enrollOut). 기록(audit) detail 에 이름을 싣지 않는다(id·수만).
// ⚠️ 강좌별 담당자(2026-10-05 · SQL 011 edu_course_staff): 교육 담당(educourse)은 **맡은 강좌만** — 강좌·신청을 건드리는 액션은
//    모두 mayTouch 를 먼저 지난다(아니면 not-assigned · 아무것도 쓰지 않는다). 교육 총괄(education)·총괄 관리자(super)는 지나간다.
//    액션 권한(어느 역할이 부르나)은 authz.ts ACTION_ROLES — 여기는 「어느 강좌인가」만 본다.
import { checkCourse, checkSessions, checkStaffIds, checkTypedIdent, courseOut, eduChief, EDU_STAFF_ROLES, enrollOut, exportRows, maybeDupIds,
  seatsOpened, staffByCourse, staffCandidateOut, waitOrder, whoOf } from "./edu-rules.ts";
import { norm } from "./authz.ts";

type Db = any;
type Audit = (ctx: any, action: string, target: string, detail?: Record<string, unknown>) => Promise<void>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COURSE_COLS = "id,track,title,kind,term,description,teacher_label,place,fee_note,target,capacity,mode,waitlist,apply_from,apply_to,starts_on,ends_on,prereq_tracks,attend_pct,check_label,status,created_at,updated_at";
const ENROLL_COLS = "id,course_id,user_id,name,who_type,group_name,sub_name,status,source,waitlist_at,applied_at,decided_at,cancelled_at,fee_paid,staff_note";
// 강좌 담당자 줄 + 이름(admin_members 한 칸만 붙여 읽는다 — auth_user_id·카카오 칸은 읽지 않는다)
const STAFF_SEL = "course_id,member_id,admin_members(name)";
const NOT_ASSIGNED = { ok: false as const, error: "not-assigned" };

// deps — peopleLookup: 교인명부에서 이름으로 찾기(후보 모양 · 교인ID 없음) · personPick: 같은 찾기를 서버가 다시 돌려 pick 번째 분의 신원을 만든다
//        (교인ID 는 서버 안에만 둔다 — 화면은 이름·몇 번째·소속 확인값만 보낸다) · allRows: 1,000줄 쪽 넘기기(index.ts)
export function makeEdu(db: Db, audit: Audit, deps: {
  peopleLookup: (ctx: any, b: any) => Promise<any>;
  personPick: (name: unknown, pick: unknown, check: any) => Promise<{ ok: false; error: string } | { ok: true; ident: any; appUserId: string | null }>;
  allRows: (build: () => any) => Promise<any[]>;
}) {
  async function countsOf(ids: string[]) {
    const out: Record<string, { confirmed: number; waitlisted: number; applied: number }> = {};
    for (const id of ids) out[id] = { confirmed: 0, waitlisted: 0, applied: 0 };
    if (!ids.length) return out;
    // SQL 함수 한 번(POST 본문 · 1,000줄 한도·주소 길이 한도에 안 걸린다)
    const { data, error } = await db.rpc("edu_course_counts", { p_ids: ids });
    if (error) throw error;
    for (const r of data ?? []) out[r.course_id] = { confirmed: r.confirmed, waitlisted: r.waitlisted, applied: r.applied };
    return out;
  }

  // ---------- 강좌별 담당자 ----------
  const memberId = (ctx: any): string => {
    const id = String(ctx?.member?.id ?? "");
    return UUID.test(id) ? id : "";
  };
  // 이 분이 이 강좌를 만져도 되나 — 총괄(super·education)은 늘 · 그 밖은 (강좌, 나, manager) 줄이 있을 때만
  async function mayTouch(ctx: any, courseId: string): Promise<boolean> {
    if (eduChief(ctx?.roles)) return true;
    const mid = memberId(ctx);
    if (!mid || !UUID.test(courseId)) return false;
    const { data, error } = await db.from("edu_course_staff").select("course_id")
      .eq("course_id", courseId).eq("member_id", mid).eq("kind", "manager").limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  }
  // 신청 줄 하나를 건드리기 전 — 그 줄의 강좌를 먼저 읽어 맡은 강좌인지 본다(총괄은 읽지 않고 지나간다). 통과면 null.
  async function guardEnrollment(ctx: any, id: number): Promise<null | { ok: false; error: string }> {
    if (eduChief(ctx?.roles)) return null;
    const { data, error } = await db.from("edu_enrollments").select("course_id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data?.course_id) return { ok: false, error: "not-found" };
    return (await mayTouch(ctx, String(data.course_id))) ? null : NOT_ASSIGNED;
  }
  // 강좌 id 들의 담당자(manager) — 한 질의(쪽 넘기기)로 읽어 강좌별로 묶는다(강좌마다 부르지 않는다).
  //   강좌가 50개까지면 그 강좌만 거르고, 더 많으면 주소가 길어지지 않게 담당 줄 전부를 읽는다(표가 작다 — 강좌마다 몇 분).
  async function staffOf(ids: string[]) {
    if (!ids.length) return new Map<string, { id: string; name: string }[]>();
    const rows = await deps.allRows(() => {
      let q = db.from("edu_course_staff").select(STAFF_SEL).eq("kind", "manager");
      if (ids.length <= 50) q = q.in("course_id", ids);
      return q.order("course_id").order("member_id");
    });
    return staffByCourse(rows);
  }

  // 강좌 목록 — 총괄은 모든 강좌, 담당은 맡은 강좌만(학기 목록도 맡은 강좌의 것만). scope 로 어느 쪽인지 알린다.
  async function eduCourses(ctx: any, b: any) {
    const chief = eduChief(ctx?.roles);
    let rows: any[];
    if (chief) {
      const { data, error } = await db.from("edu_courses").select(COURSE_COLS).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      rows = (data ?? []) as any[];
    } else {
      const mid = memberId(ctx);
      if (!mid) return { ok: true, scope: "assigned", terms: [], courses: [] };
      const { data: mine, error: e0 } = await db.from("edu_course_staff").select("course_id")
        .eq("member_id", mid).eq("kind", "manager").limit(500);
      if (e0) throw e0;
      const ids = [...new Set(((mine ?? []) as any[]).map((r) => String(r.course_id)))];
      if (!ids.length) return { ok: true, scope: "assigned", terms: [], courses: [] };
      const { data, error } = await db.from("edu_courses").select(COURSE_COLS).in("id", ids).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      const allowed = new Set(ids);
      rows = ((data ?? []) as any[]).filter((r) => allowed.has(String(r.id)));   // 거른 결과를 한 번 더(질의가 틀려도 남의 강좌가 새지 않게)
    }
    const terms = [...new Set(rows.map((r) => r.term).filter(Boolean))];
    const want = norm(b?.term);
    const list = want ? rows.filter((r) => r.term === want) : rows;
    const counts = await countsOf(list.map((r) => r.id));
    const staff = await staffOf(list.map((r) => r.id));
    return { ok: true, scope: chief ? "all" : "assigned", terms, courses: list.map((r) => courseOut(r, counts[r.id], staff.get(r.id) || [])) };
  }

  // 담당자 후보 — 교육 담당(educourse)·교육 총괄(education) 역할이 있는 **사용 중**인 분. id·이름·소속·교육 역할만.
  async function eduStaffCandidates() {
    const { data: gs, error } = await db.from("admin_role_grants").select("member_id,role_id").in("role_id", EDU_STAFF_ROLES);
    if (error) throw error;
    const rolesBy = new Map<string, string[]>();
    for (const g of (gs ?? []) as any[]) rolesBy.set(g.member_id, [...(rolesBy.get(g.member_id) ?? []), String(g.role_id)]);
    if (!rolesBy.size) return { ok: true, members: [] };
    const { data: ms, error: e2 } = await db.from("admin_members").select("id,name,type,gu,mok,bu,grade")
      .in("id", [...rolesBy.keys()]).eq("status", "active");
    if (e2) throw e2;
    const members = ((ms ?? []) as any[]).map((m) => staffCandidateOut(m, rolesBy.get(m.id) ?? []))
      .sort((a, z) => a.name.localeCompare(z.name, "ko") || a.who.localeCompare(z.who, "ko") || (a.id < z.id ? -1 : 1));
    return { ok: true, members };
  }

  // 강좌의 담당자(manager)를 통째로 바꾼다 — 빈 배열이면 담당자 없음. 강좌가 있어야 하고, 모두 사용 중 · 교육 역할이 있어야 한다.
  //   바뀐 것만 빼고 더한다(바뀐 것이 없으면 쓰지도 기록하지도 않는다 · changed:false). 기록 edu.staff.set 은 {course, count}(이름 없음).
  async function eduStaffSet(ctx: any, b: any) {
    const course = norm(b?.course_id);
    if (!UUID.test(course)) return { ok: false, error: "bad-id" };
    const s = checkStaffIds(b?.member_ids);
    if (!s.ok) return s;
    const { data: c, error } = await db.from("edu_courses").select("id").eq("id", course).maybeSingle();
    if (error) throw error;
    if (!c) return { ok: false, error: "not-found" };
    if (s.ids.length) {
      const can = new Set((await eduStaffCandidates()).members.map((m: any) => m.id));
      if (s.ids.some((id) => !can.has(id))) return { ok: false, error: "bad-member" };
    }
    const { data: cur, error: e1 } = await db.from("edu_course_staff").select("member_id").eq("course_id", course).eq("kind", "manager");
    if (e1) throw e1;
    const before = new Set(((cur ?? []) as any[]).map((r) => String(r.member_id)));
    const add = s.ids.filter((id) => !before.has(id));
    const del = [...before].filter((id) => !s.ids.includes(id));
    if (!add.length && !del.length) return { ok: true, count: s.ids.length, changed: false };
    if (del.length) {
      const { error: ed } = await db.from("edu_course_staff").delete().eq("course_id", course).eq("kind", "manager").in("member_id", del);
      if (ed) throw ed;
    }
    if (add.length) {
      // 두 창에서 같은 분을 동시에 더해도 기본 키(course_id, member_id, kind) 충돌로 500 이 나지 않게
      const { error: ea } = await db.from("edu_course_staff")
        .upsert(add.map((member_id) => ({ course_id: course, member_id, kind: "manager" })), { onConflict: "course_id,member_id,kind", ignoreDuplicates: true });
      if (ea) throw ea;
    }
    await audit(ctx, "edu.staff.set", course, { course, count: s.ids.length });
    return { ok: true, count: s.ids.length, changed: true };
  }

  async function eduCourseSave(ctx: any, b: any) {
    const c = checkCourse(b?.course);
    if (!c.ok) return c;
    const id = norm(b?.course?.id);
    if (id) {
      if (!UUID.test(id)) return { ok: false, error: "bad-id" };
      const { data: before, error: e0 } = await db.from("edu_courses").select("capacity,mode").eq("id", id).maybeSingle();
      if (e0) throw e0;
      if (!before) return { ok: false, error: "not-found" };
      const { data, error } = await db.from("edu_courses").update({ ...c.row, updated_at: new Date().toISOString() })
        .eq("id", id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return { ok: false, error: "not-found" };
      // 자리가 늘었으면(정원 ↑ · 제한 없음 · 선착순으로) 대기하신 분부터 채운다 — 안 그러면 다음 앱 신청이 먼저 확정된다(새치기).
      //   선착순·끝나지 않은 강좌만 SQL 함수가 올린다(승인 강좌는 0). 화면이 「대기하신 N분이 확정됐어요」를 띄운다.
      let promoted = 0;
      if (seatsOpened(before, c.row)) {
        const { data: rf, error: er } = await db.rpc("edu_course_refill", { p_course: id });
        if (er) throw er;
        promoted = rf?.ok ? Number(rf.promoted) || 0 : 0;
      }
      await audit(ctx, "edu.course.save", id, { status: c.row.status, promoted });
      return { ok: true, id, promoted };
    }
    const { data, error } = await db.from("edu_courses").insert(c.row).select("id").single();
    if (error) throw error;
    await audit(ctx, "edu.course.save", data.id, { status: c.row.status, created: true });
    return { ok: true, id: data.id };
  }

  async function eduCourseCopy(ctx: any, b: any) {
    const id = norm(b?.id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    const { data: src, error } = await db.from("edu_courses").select(COURSE_COLS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!src) return { ok: false, error: "not-found" };
    const { id: _i, created_at: _c, updated_at: _u, ...rest } = src;
    const term = norm(b?.term) || src.term;
    if (term.length > 30) return { ok: false, error: "too-long" };      // checkCourse 의 학기 한도와 같다
    const row = { ...rest, term, status: "draft", apply_from: null, apply_to: null };
    const { data: made, error: e2 } = await db.from("edu_courses").insert(row).select("id").single();
    if (e2) throw e2;
    // 회차를 못 옮기면 반쪽짜리 강좌가 남지 않게 새 초안을 지우고 오류를 그대로 올린다
    try {
      const { data: ss, error: e3 } = await db.from("edu_sessions").select("no,on_date,start_time,end_time,topic,place").eq("course_id", id);
      if (e3) throw e3;
      if ((ss ?? []).length) {
        const { error: e4 } = await db.from("edu_sessions").insert((ss as any[]).map((s) => ({ ...s, course_id: made.id })));
        if (e4) throw e4;
      }
    } catch (err) {
      await db.from("edu_courses").delete().eq("id", made.id);
      throw err;
    }
    await audit(ctx, "edu.course.copy", made.id, { from: id });
    return { ok: true, id: made.id };
  }

  async function eduSessions(ctx: any, b: any) {
    const id = norm(b?.course_id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    if (!(await mayTouch(ctx, id))) return NOT_ASSIGNED;
    const { data, error } = await db.from("edu_sessions").select("no,on_date,start_time,end_time,topic,place").eq("course_id", id).order("no");
    if (error) throw error;
    return { ok: true, sessions: (data ?? []).map((s: any) => ({ ...s, start_time: s.start_time?.slice(0, 5) ?? null, end_time: s.end_time?.slice(0, 5) ?? null })) };
  }

  async function eduSessionsSave(ctx: any, b: any) {
    const id = norm(b?.course_id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    const s = checkSessions(b?.sessions);
    if (!s.ok) return s;
    // 한 트랜잭션 · 같은 번호는 id 를 지킨다 · 끝난 강좌는 course-closed (SQL 함수 edu_sessions_replace)
    const { data: r, error } = await db.rpc("edu_sessions_replace", { p_course: id, p_rows: s.rows });
    if (error) throw error;
    if (r?.ok) await audit(ctx, "edu.sessions", id, { count: r.count });
    return r;
  }

  async function eduEnrollList(ctx: any, b: any) {
    const id = norm(b?.course_id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    if (!(await mayTouch(ctx, id))) return NOT_ASSIGNED;
    const { data: c, error } = await db.from("edu_courses").select(COURSE_COLS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!c) return { ok: false, error: "not-found" };
    const rows = await deps.allRows(() => db.from("edu_enrollments").select(ENROLL_COLS).eq("course_id", id)
      .order("applied_at").order("id"));
    const waiting = rows.filter((r) => r.status === "waitlisted").sort(waitOrder).map((r) => r.id);
    const counts = await countsOf([id]);
    const staff = await staffOf([id]);
    const dup = maybeDupIds(rows);   // 앱 줄 ↔ 대신 등록 줄 같은 이름(같은 분이 두 자리일 수 있다)
    return { ok: true, course: courseOut(c, counts[id], staff.get(id) || []),
      enrollments: rows.map((r) => enrollOut(r, r.status === "waitlisted" ? waiting.indexOf(r.id) + 1 : null, dup.has(r.id))) };
  }

  async function eduEnrollSet(ctx: any, b: any) {
    const id = Number(b?.id);
    if (!Number.isInteger(id) || id < 1) return { ok: false, error: "bad-id" };
    const op = norm(b?.op);
    const map: Record<string, string> = { confirm: "confirmed", waitlist: "waitlisted", decline: "declined", reopen: "applied" };
    if (op !== "cancel" && !map[op]) return { ok: false, error: "bad-op" };
    const no = await guardEnrollment(ctx, id);
    if (no) return no;
    const { data: r, error } = op === "cancel"
      ? await db.rpc("edu_cancel", { p_enrollment: id, p_staff: true })
      : await db.rpc("edu_staff_set", { p_enrollment: id, p_status: map[op], p_force: b?.force === true });
    if (error) throw error;
    if (r.ok) await audit(ctx, "edu.enroll.set", String(id), { op, force: b?.force === true, promoted: r.promoted ?? null });
    return r;
  }

  // 대신 등록 — 두 갈래: (1) 교인명부에서 고른 분 {name, pick, check} (2) 직접 적은 새가족 {ident}
  //   반려했던 분은 force:true 로 다시 보낼 때만 되살린다(was-declined) · 취소했던 분은 바로 되살린다(revived)
  async function eduEnrollAdd(ctx: any, b: any) {
    const course = norm(b?.course_id);
    if (!UUID.test(course)) return { ok: false, error: "bad-id" };
    if (!(await mayTouch(ctx, course))) return NOT_ASSIGNED;   // 명부 찾기(personPick)도 하기 전에
    let ident: any, user: string | null = null;
    if (b?.ident === undefined || b?.ident === null) {
      const p = await deps.personPick(b?.name, b?.pick, b?.check);
      if (!p.ok) return p;
      ident = p.ident; user = p.appUserId;
    } else {
      const t = checkTypedIdent(b.ident);
      if (!t.ok) return t;
      ident = t.ident;
    }
    // 같은 분의 옛 줄(edu_apply 와 같은 찾기) — 반려 확인과 되살림 표시용
    let q = db.from("edu_enrollments").select("id,status").eq("course_id", course);
    q = user ? q.eq("user_id", user) : q.is("user_id", null).eq("ident_key", ident.ident_key);
    const { data: prev, error: ep } = await q.order("id", { ascending: false }).limit(1);
    if (ep) throw ep;
    const was = prev?.[0]?.status as string | undefined;
    if (was === "declined" && b?.force !== true) return { ok: false, error: "was-declined" };
    const { data, error } = await db.rpc("edu_apply", { p_course: course, p_user: user, p_ident: ident, p_staff: true });
    if (error) throw error;
    if (data?.ok) {
      const revived = !data.already && (was === "declined" || was === "cancelled");
      await audit(ctx, "edu.enroll.add", String(data.id), { course, app: !!user, status: data.status, already: !!data.already, revived });
      return revived ? { ...data, revived: true } : data;
    }
    return data;
  }

  async function eduFeeSet(ctx: any, b: any) {
    const id = Number(b?.id);
    if (!Number.isInteger(id) || id < 1) return { ok: false, error: "bad-id" };
    if (typeof b?.paid !== "boolean" && typeof b?.note !== "string") return { ok: false, error: "nothing" };   // 바꿀 것이 없으면 쓰지도 기록하지도 않는다
    const no = await guardEnrollment(ctx, id);
    if (no) return no;
    const patch: any = { updated_at: new Date().toISOString() };
    if (typeof b?.paid === "boolean") patch.fee_paid = b.paid;       // 메모만 저장할 때 납부 표시를 지우지 않는다
    if (typeof b?.note === "string") {
      const note = b.note.normalize("NFC").trim();
      if (note.length > 500) return { ok: false, error: "too-long" };
      patch.staff_note = note;
    }
    const { data, error } = await db.from("edu_enrollments").update(patch).eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: "not-found" };
    await audit(ctx, "edu.enroll.fee", String(id), { paid: "fee_paid" in patch ? patch.fee_paid : null, note: "staff_note" in patch });
    return { ok: true };
  }

  async function eduExport(ctx: any, b: any) {
    const r = await eduEnrollList(ctx, b);   // 맡은 강좌 확인도 여기서(not-assigned 면 기록 없이 그대로)
    if (!r.ok) return r;
    await audit(ctx, "edu.export", String(b.course_id), { count: r.enrollments.length });
    return { ok: true, rows: exportRows(r.course, r.enrollments) };
  }

  // 대신 등록의 명부 찾기 — 담당은 맡은 강좌의 창에서만(course_id 를 함께 보낸다). 총괄은 그대로.
  //   교육 담당 역할만으로 교인명부를 이름으로 떠볼 수 없게(맡은 강좌가 없으면 not-assigned).
  async function eduPeopleLookup(ctx: any, b: any) {
    if (!eduChief(ctx?.roles) && !(await mayTouch(ctx, norm(b?.course_id)))) return NOT_ASSIGNED;
    return deps.peopleLookup(ctx, b);
  }

  return { eduCourses, eduCourseSave, eduCourseCopy, eduSessions, eduSessionsSave, eduEnrollList, eduEnrollSet,
    eduEnrollAdd, eduFeeSet, eduExport, eduPeopleLookup, eduStaffCandidates, eduStaffSet, _mayTouch: mayTouch, _whoOf: whoOf };
}
