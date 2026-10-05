// 교육신청 — 표를 읽고 쓰는 쪽(서버 · 2026-10-05 · 설계 v2 docs/superpowers/specs/2026-10-05-education-courses-design.md §8)
//   규칙·칸 지도는 edu-rules.ts(순수), 정원·대기·취소는 SQL 함수(성경암송 supabase/edu.sql). index.ts 의 switch 가 makeEdu(...) 의 함수를 부른다.
// ⚠️ npm import 를 두지 않는다 — db(supabase 클라이언트)를 받아 쓴다(Node 시험이 이 파일을 import 할 수 있게).
// ⚠️ 응답에 user_id·ident_key 를 싣지 않는다(courseOut·enrollOut). 기록(audit) detail 에 이름을 싣지 않는다(id·수만).
import { checkCourse, checkSessions, courseOut, enrollOut, exportRows, whoOf } from "./edu-rules.ts";
import { norm } from "./authz.ts";

type Db = any;
type Audit = (ctx: any, action: string, target: string, detail?: Record<string, unknown>) => Promise<void>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COURSE_COLS = "id,track,title,kind,term,description,teacher_label,place,fee_note,target,capacity,mode,waitlist,apply_from,apply_to,prereq_tracks,attend_pct,check_label,status,created_at,updated_at";
const ENROLL_COLS = "id,course_id,user_id,name,who_type,group_name,sub_name,status,source,waitlist_at,applied_at,decided_at,cancelled_at,fee_paid,staff_note";

export function makeEdu(db: Db, audit: Audit, deps: { peopleLookup: (ctx: any, b: any) => Promise<any>; personIdent: (personId: number) => Promise<any | null> }) {
  async function countsOf(ids: string[]) {
    const out: Record<string, { confirmed: number; waitlisted: number; applied: number }> = {};
    for (const id of ids) out[id] = { confirmed: 0, waitlisted: 0, applied: 0 };
    if (!ids.length) return out;
    const { data, error } = await db.from("edu_enrollments").select("course_id,status").in("course_id", ids)
      .in("status", ["confirmed", "waitlisted", "applied"]);
    if (error) throw error;
    for (const r of data ?? []) (out[r.course_id] as any)[r.status]++;
    return out;
  }

  async function eduCourses(b: any) {
    const { data, error } = await db.from("edu_courses").select(COURSE_COLS).order("created_at", { ascending: false }).limit(500);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    const terms = [...new Set(rows.map((r) => r.term).filter(Boolean))];
    const want = norm(b?.term);
    const list = want ? rows.filter((r) => r.term === want) : rows;
    const counts = await countsOf(list.map((r) => r.id));
    return { ok: true, terms, courses: list.map((r) => courseOut(r, counts[r.id])) };
  }

  async function eduCourseSave(ctx: any, b: any) {
    const c = checkCourse(b?.course);
    if (!c.ok) return c;
    const id = norm(b?.course?.id);
    if (id) {
      if (!UUID.test(id)) return { ok: false, error: "bad-id" };
      const { data, error } = await db.from("edu_courses").update({ ...c.row, updated_at: new Date().toISOString() })
        .eq("id", id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return { ok: false, error: "not-found" };
      await audit(ctx, "edu.course.save", id, { status: c.row.status });
      return { ok: true, id };
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
    const row = { ...rest, term: norm(b?.term) || src.term, status: "draft", apply_from: null, apply_to: null };
    const { data: made, error: e2 } = await db.from("edu_courses").insert(row).select("id").single();
    if (e2) throw e2;
    const { data: ss, error: e3 } = await db.from("edu_sessions").select("no,on_date,start_time,end_time,topic,place").eq("course_id", id);
    if (e3) throw e3;
    if ((ss ?? []).length) {
      const { error: e4 } = await db.from("edu_sessions").insert((ss as any[]).map((s) => ({ ...s, course_id: made.id })));
      if (e4) throw e4;
    }
    await audit(ctx, "edu.course.copy", made.id, { from: id });
    return { ok: true, id: made.id };
  }

  async function eduSessions(b: any) {
    const id = norm(b?.course_id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    const { data, error } = await db.from("edu_sessions").select("no,on_date,start_time,end_time,topic,place").eq("course_id", id).order("no");
    if (error) throw error;
    return { ok: true, sessions: (data ?? []).map((s: any) => ({ ...s, start_time: s.start_time?.slice(0, 5) ?? null, end_time: s.end_time?.slice(0, 5) ?? null })) };
  }

  async function eduSessionsSave(ctx: any, b: any) {
    const id = norm(b?.course_id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    const s = checkSessions(b?.sessions);
    if (!s.ok) return s;
    const { error: e1 } = await db.from("edu_sessions").delete().eq("course_id", id);
    if (e1) throw e1;
    if (s.rows.length) {
      const { error: e2 } = await db.from("edu_sessions").insert(s.rows.map((r) => ({ ...r, course_id: id })));
      if (e2) throw e2;
    }
    await audit(ctx, "edu.sessions", id, { count: s.rows.length });
    return { ok: true, count: s.rows.length };
  }

  async function eduEnrollList(b: any) {
    const id = norm(b?.course_id);
    if (!UUID.test(id)) return { ok: false, error: "bad-id" };
    const { data: c, error } = await db.from("edu_courses").select(COURSE_COLS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!c) return { ok: false, error: "not-found" };
    const { data, error: e2 } = await db.from("edu_enrollments").select(ENROLL_COLS).eq("course_id", id).order("applied_at");
    if (e2) throw e2;
    const rows = (data ?? []) as any[];
    const waiting = rows.filter((r) => r.status === "waitlisted")
      .sort((a, z) => (a.waitlist_at || "").localeCompare(z.waitlist_at || "") || a.id - z.id).map((r) => r.id);
    const counts = await countsOf([id]);
    return { ok: true, course: courseOut(c, counts[id]),
      enrollments: rows.map((r) => enrollOut(r, r.status === "waitlisted" ? waiting.indexOf(r.id) + 1 : null)) };
  }

  async function eduEnrollSet(ctx: any, b: any) {
    const id = Number(b?.id);
    if (!Number.isInteger(id) || id < 1) return { ok: false, error: "bad-id" };
    const op = norm(b?.op);
    const map: Record<string, string> = { confirm: "confirmed", waitlist: "waitlisted", decline: "declined", reopen: "applied" };
    if (op !== "cancel" && !map[op]) return { ok: false, error: "bad-op" };
    const { data: r, error } = op === "cancel"
      ? await db.rpc("edu_cancel", { p_enrollment: id, p_staff: true })
      : await db.rpc("edu_staff_set", { p_enrollment: id, p_status: map[op], p_force: b?.force === true });
    if (error) throw error;
    if (r.ok) await audit(ctx, "edu.enroll.set", String(id), { op, force: b?.force === true, promoted: r.promoted ?? null });
    return r;
  }

  async function eduEnrollAdd(ctx: any, b: any) {
    const course = norm(b?.course_id);
    if (!UUID.test(course)) return { ok: false, error: "bad-id" };
    let ident: any, user: string | null = null;
    if (b?.person_id !== undefined && b?.person_id !== null) {
      const p = await deps.personIdent(Number(b.person_id));     // {ident, appUserId|null}
      if (!p) return { ok: false, error: "not-found" };
      ident = p.ident; user = p.appUserId;
    } else {
      const o = b?.ident || {};
      const name = norm(o.name);
      if (!name || name.length > 40 || /["\\,()|]/.test(name)) return { ok: false, error: "bad-ident" };
      const group = norm(o.group_name), sub = norm(o.sub_name);
      ident = { name, who_type: norm(o.who_type) || "새가족", group_name: group, sub_name: sub,
        ident_key: ["staff", norm(o.who_type) || "새가족", group, sub, name].join("|") };
    }
    const { data, error } = await db.rpc("edu_apply", { p_course: course, p_user: user, p_ident: ident, p_staff: true });
    if (error) throw error;
    if (data?.ok) await audit(ctx, "edu.enroll.add", String(data.id), { course, app: !!user, status: data.status, already: !!data.already });
    return data;
  }

  async function eduFeeSet(ctx: any, b: any) {
    const id = Number(b?.id);
    if (!Number.isInteger(id) || id < 1) return { ok: false, error: "bad-id" };
    const patch: any = { fee_paid: b?.paid === true, updated_at: new Date().toISOString() };
    if (typeof b?.note === "string") {
      const note = b.note.normalize("NFC").trim();
      if (note.length > 500) return { ok: false, error: "too-long" };
      patch.staff_note = note;
    }
    const { data, error } = await db.from("edu_enrollments").update(patch).eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: "not-found" };
    await audit(ctx, "edu.enroll.fee", String(id), { paid: patch.fee_paid, note: "staff_note" in patch });
    return { ok: true };
  }

  async function eduExport(ctx: any, b: any) {
    const r = await eduEnrollList(b);
    if (!r.ok) return r;
    await audit(ctx, "edu.export", String(b.course_id), { count: r.enrollments.length });
    return { ok: true, rows: exportRows(r.course, r.enrollments) };
  }

  return { eduCourses, eduCourseSave, eduCourseCopy, eduSessions, eduSessionsSave, eduEnrollList, eduEnrollSet,
    eduEnrollAdd, eduFeeSet, eduExport, eduPeopleLookup: deps.peopleLookup, _whoOf: whoOf };
}
