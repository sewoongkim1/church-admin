// 교육신청 — 순수 규칙(2026-10-05 · 설계 v2 docs/superpowers/specs/2026-10-05-education-courses-design.md §5·§6)
//   서버(edu-db.ts)와 시험(tests/edu-rules.test.mjs)이 같은 파일을 읽는다 — Deno 전용 API·원격 import 금지 · enum 금지.
//   ⚠️ 정원·대기·취소 마감은 여기 없다 — 성경암송 supabase/edu.sql 의 SQL 함수 한 곳(edu_apply·edu_cancel·edu_staff_set).
//   ⚠️ 응답 칸 지도(courseOut·enrollOut)에 user_id·ident_key 를 싣지 않는다(API 에 JWT 가 없다).
import { norm } from "./authz.ts";

export const EDU_KINDS = ["regular", "lecture", "training"] as const;
export const EDU_KIND_LABEL: Record<string, string> = { regular: "정규 과정", lecture: "특강·세미나", training: "교사·사역자 교육" };
export const EDU_STATUS = ["draft", "open", "closed", "running", "done", "archived"] as const;
export const EDU_STATUS_LABEL: Record<string, string> = {
  draft: "준비 중", open: "모집 중", closed: "모집 끝", running: "진행 중", done: "끝", archived: "보관",
};
export const ENROLL_STATUS_LABEL: Record<string, string> = {
  applied: "신청", confirmed: "확정", waitlisted: "대기", cancelled: "취소", declined: "반려",
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const LIMITS: Record<string, number> = { title: 80, term: 30, description: 2000, teacher_label: 60, place: 80, fee_note: 120, target: 120, track: 40, check_label: 40 };

function isDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// 강좌 입력 → DB 줄(edu_courses). 칸·제약은 성경암송 supabase/edu.sql 이 정한다.
export function checkCourse(x: any): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const o = x && typeof x === "object" ? x : {};
  const txt = (k: string) => norm(o[k]);
  const desc = (o.description ?? "").toString().normalize("NFC").trim();   // 설명은 줄바꿈을 살린다
  const title = txt("title");
  if (!title) return { ok: false, error: "no-title" };
  for (const k of Object.keys(LIMITS)) {
    const v = k === "description" ? desc : txt(k);
    if (v.length > LIMITS[k]) return { ok: false, error: "too-long" };
  }
  const kind = txt("kind");
  if (!(EDU_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "bad-kind" };
  const capRaw = o.capacity;
  let capacity: number | null = null;
  if (capRaw !== null && capRaw !== undefined && capRaw !== "") {
    capacity = Number(capRaw);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000) return { ok: false, error: "bad-capacity" };
  }
  const mode = txt("mode") || "auto";
  if (mode !== "auto" && mode !== "approve") return { ok: false, error: "bad-mode" };
  const from = txt("apply_from"), to = txt("apply_to");
  if ((from && !isDate(from)) || (to && !isDate(to))) return { ok: false, error: "bad-date" };
  if (from && to && from > to) return { ok: false, error: "bad-range" };
  const sOn = txt("starts_on"), eOn = txt("ends_on");   // 교육 기간(신청 기간과 별개) — 비어도 된다
  if ((sOn && !isDate(sOn)) || (eOn && !isDate(eOn))) return { ok: false, error: "bad-date" };
  if (sOn && eOn && sOn > eOn) return { ok: false, error: "bad-period" };
  const pct = o.attend_pct === undefined || o.attend_pct === "" ? 80 : Number(o.attend_pct);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return { ok: false, error: "bad-pct" };
  const status = txt("status") || "draft";
  if (!(EDU_STATUS as readonly string[]).includes(status)) return { ok: false, error: "bad-status" };
  const prereq = Array.isArray(o.prereq_tracks) ? o.prereq_tracks.map((s: unknown) => norm(s)).filter(Boolean).slice(0, 10) : [];
  return {
    ok: true,
    row: {
      title, kind, term: txt("term"), description: desc, teacher_label: txt("teacher_label"), place: txt("place"),
      fee_note: txt("fee_note"), target: txt("target"), track: txt("track"), capacity, mode,
      waitlist: o.waitlist === undefined ? true : o.waitlist === true,
      apply_from: from || null, apply_to: to || null, starts_on: sOn || null, ends_on: eOn || null, prereq_tracks: prereq, attend_pct: pct,
      check_label: txt("check_label") || null, status,
    },
  };
}

// 매주(everyDays 간격) 회차 목록 만들기
export function makeSessions(start: string, count: number, everyDays = 7, t: { start_time?: string; end_time?: string } = {}) {
  const out = [];
  const base = Date.parse(start + "T00:00:00Z");
  for (let i = 0; i < count; i++) {
    out.push({ no: i + 1, on_date: new Date(base + i * everyDays * 86400000).toISOString().slice(0, 10),
      start_time: t.start_time || null, end_time: t.end_time || null, topic: "", place: "" });
  }
  return out;
}

export function checkSessions(list: any[]): { ok: true; rows: any[] } | { ok: false; error: string } {
  if (!Array.isArray(list)) return { ok: false, error: "bad-no" };
  if (list.length > 200) return { ok: false, error: "too-many" };
  const seen = new Set<number>();
  const rows = [];
  for (const s of list) {
    const no = Number(s?.no);
    if (!Number.isInteger(no) || no < 1 || no > 200) return { ok: false, error: "bad-no" };
    if (seen.has(no)) return { ok: false, error: "dup-no" };
    seen.add(no);
    const d = norm(s?.on_date);
    if (!isDate(d)) return { ok: false, error: "bad-date" };
    const st = norm(s?.start_time), et = norm(s?.end_time);
    if ((st && !TIME_RE.test(st)) || (et && !TIME_RE.test(et))) return { ok: false, error: "bad-date" };
    rows.push({ no, on_date: d, start_time: st || null, end_time: et || null,
      topic: norm(s?.topic).slice(0, 80), place: norm(s?.place).slice(0, 80) });
  }
  rows.sort((a, b) => a.no - b.no);
  return { ok: true, rows };
}

export function whoOf(r: { who_type?: string; group_name?: string; sub_name?: string }): string {
  const g = norm(r.group_name), s = norm(r.sub_name);
  if (r.who_type === "교회학교") return [g, s].filter(Boolean).join(" ");
  if (!g && !s) return "";
  return g + (s ? " " + (/^\d+$/.test(s) ? s + "목장" : s) : "");
}

// ---------- 강좌별 담당자(2026-10-05 · SQL 011 edu_course_staff) ----------
// 교육 총괄 — 모든 강좌를 만지는 역할(총괄 관리자 super 와 교육 총괄 education). 그 밖(educourse)은 맡은 강좌만(edu-db.ts mayTouch).
export const EDU_CHIEF_ROLES = ["super", "education"];
export const eduChief = (roles: unknown): boolean => Array.isArray(roles) && roles.some((r) => EDU_CHIEF_ROLES.includes(String(r)));
// 담당자로 지정할 수 있는 역할 — 교육 담당(맡은 강좌)이 본래 자리이고, 교육 총괄도 지정할 수 있다(이름을 카드에 적어 두려고)
export const EDU_STAFF_ROLES = ["educourse", "education"];
export const EDU_STAFF_MAX = 20;
// 강사(출석부 · 2단계 2026-10-05 · SQL 012) — 강사로 지정할 수 있는 역할: 강사가 본래 자리 · 교육 총괄·교육 담당도(직접 가르치는 분)
export const EDU_TEACHER_ROLES = ["teacher", "education", "educourse"];
export const EDU_STAFF_KINDS = ["manager", "teacher"];
// kind(manager|teacher) → 그 kind 로 지정할 수 있는 역할(후보·stale 판정이 같은 목록을 본다)
export const staffRolesFor = (kind: string): string[] => (kind === "teacher" ? EDU_TEACHER_ROLES : EDU_STAFF_ROLES);
// 지정 kind 확인 — 없으면 manager(1단계 화면은 kind 를 안 보낸다)
export function checkStaffKind(x: unknown): { ok: true; kind: string } | { ok: false; error: string } {
  if (x === undefined || x === null || x === "") return { ok: true, kind: "manager" };
  const k = norm(x);
  return EDU_STAFF_KINDS.includes(k) ? { ok: true, kind: k } : { ok: false, error: "bad-kind" };
}
// 출석부 액션에서 「맡은 강좌」로 셀 담당 줄 kind — 총괄(super·education)은 이것을 보기 전에 지나간다(edu-db.ts mayTouch).
//   강사 줄(teacher)은 늘 센다(출석부 액션을 부를 수 있는 분 = 강사·교육 담당 · canCall 이 이미 걸렀다 — 교육 담당도 강사로 지정될 수 있다).
//   담당 줄(manager)은 교육 담당(educourse) 역할이 있을 때만 — 역할을 잃고 강사만 남은 분의 옛 담당 줄(stale)로 출석부가 열리지 않게.
export function attendKinds(roles: unknown): string[] {
  const rs = Array.isArray(roles) ? roles.map(String) : [];
  return rs.includes("educourse") ? ["manager", "teacher"] : ["teacher"];
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// 지정 목록 확인 — uuid 배열(겹친 것은 하나로) · 빈 배열 = 담당자 없음
export function checkStaffIds(x: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(x)) return { ok: false, error: "bad-id" };
  const ids = [...new Set(x.map((v) => norm(v).toLowerCase()))];
  if (ids.some((v) => !UUID_RE.test(v))) return { ok: false, error: "bad-id" };
  if (ids.length > EDU_STAFF_MAX) return { ok: false, error: "too-many" };
  return { ok: true, ids: ids.sort() };
}
// edu_course_staff 줄(admin_members(name,status) 을 붙여 읽은 것) → 강좌 id 별 [{id, name, stale?}](이름 차례) — 응답에는 담당자 id·이름(+stale)만
//   eduMembers = 교육 역할(educourse·education)을 가진 담당자 id 들. 사용 중(active)이 아니거나 그 역할이 없으면 stale:true
//   (역할을 뺐거나 정지 — 줄은 남긴다 · 화면이 흐리게 「(역할 없음)」 · 검토 반영 2026-10-05).
export function staffByCourse(rows: any[], eduMembers: Set<string> = new Set()): Map<string, { id: string; name: string; stale?: true }[]> {
  const by = new Map<string, { id: string; name: string; stale?: true }[]>();
  for (const r of rows || []) {
    if (!r?.course_id || !r?.member_id) continue;
    const list = by.get(r.course_id) || [];
    const stale = r.admin_members?.status !== "active" || !eduMembers.has(String(r.member_id));
    list.push(stale ? { id: r.member_id, name: norm(r.admin_members?.name), stale: true } : { id: r.member_id, name: norm(r.admin_members?.name) });
    by.set(r.course_id, list);
  }
  for (const list of by.values()) list.sort((a, b) => a.name.localeCompare(b.name, "ko") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return by;
}
// 담당자 후보 한 분 — id·이름·소속(동명이인을 가리려고)·교육 역할만. auth_user_id·카카오 칸은 싣지 않는다.
//   allowed — 보여 줄 역할(담당 후보는 EDU_STAFF_ROLES · 강사 후보는 EDU_TEACHER_ROLES · staffRolesFor(kind))
export function staffCandidateOut(m: { id: string; name?: string; type?: string; gu?: string; mok?: string; bu?: string; grade?: string }, roles: string[],
  allowed: string[] = EDU_STAFF_ROLES) {
  const school = m.type === "교회학교";
  const who = whoOf({ who_type: school ? "교회학교" : "교구", group_name: school ? m.bu : m.gu, sub_name: school ? m.grade : m.mok });
  return { id: m.id, name: norm(m.name), who, roles: roles.filter((r) => allowed.includes(r)).sort() };
}

// teachers — 강사(계정 · edu_course_staff kind teacher)[{id, name, stale?}] · 화면용 글 teacher(teacher_label)와 별개
export function courseOut(r: any, counts: { confirmed: number; waitlisted: number; applied: number }, staff: { id: string; name: string; stale?: boolean }[] = [],
  teachers: { id: string; name: string; stale?: boolean }[] = []) {
  return {
    id: r.id, title: r.title, kind: r.kind, kindLabel: EDU_KIND_LABEL[r.kind] || r.kind, term: r.term || "",
    description: r.description || "", teacher: r.teacher_label || "", place: r.place || "", fee: r.fee_note || "",
    target: r.target || "", track: r.track || "", capacity: r.capacity ?? null, mode: r.mode, waitlist: !!r.waitlist,
    applyFrom: r.apply_from || null, applyTo: r.apply_to || null, startsOn: r.starts_on || null, endsOn: r.ends_on || null, prereq: r.prereq_tracks || [],
    attendPct: r.attend_pct, checkLabel: r.check_label || null, status: r.status,
    statusLabel: EDU_STATUS_LABEL[r.status] || r.status, updatedAt: r.updated_at || null,
    counts: { confirmed: counts.confirmed || 0, waitlisted: counts.waitlisted || 0, applied: counts.applied || 0 },
    staff: (staff || []).map((x) => (x.stale === true ? { id: x.id, name: x.name, stale: true } : { id: x.id, name: x.name })),
    teachers: (teachers || []).map((x) => (x.stale === true ? { id: x.id, name: x.name, stale: true } : { id: x.id, name: x.name })),
  };
}

// maybeDup — maybeDupIds 가 고른 줄이면 true(화면이 「같은 분일 수 있어요」를 붙인다)
export function enrollOut(r: any, waitNo: number | null, maybeDup = false) {
  return {
    id: r.id, name: r.name, who: whoOf(r), status: r.status, statusLabel: ENROLL_STATUS_LABEL[r.status] || r.status,
    source: r.source, hasApp: !!r.user_id, appliedAt: r.applied_at, decidedAt: r.decided_at || null,
    feePaid: !!r.fee_paid, note: r.staff_note || "", waitNo, maybeDup: maybeDup === true,
  };
}

// 대기 차례 — SQL edu_promote 와 같다: waitlist_at 이른 순 · 시각 없는 줄(null)은 맨 뒤 · 같으면 id 순(성경암송 api eduWaitNo 도 같다).
//   시각은 PostgREST 가 같은 꼴(+00:00 · 마이크로초)로 주므로 글자로 견준다(Date.parse 는 밀리초에서 잘린다).
export function waitOrder(a: { id: number; waitlist_at?: string | null }, z: { id: number; waitlist_at?: string | null }): number {
  const x = a.waitlist_at || null, y = z.waitlist_at || null;
  if (x !== y) {
    if (x === null) return 1;
    if (y === null) return -1;
    return x < y ? -1 : 1;
  }
  return a.id - z.id;
}

// 같은 분이 두 줄일 수 있다(최종 검토 2026-10-05) — 앱으로 신청한 줄과 담당자가 대신 등록한 줄(앱 계정 없음)이
//   같은 이름으로 함께 살아 있으면(신청·확정·대기) 한 분이 정원 두 자리를 차지했을 수 있다. edu_apply 는 두 길을 잇지 않는다.
//   이름만 본다(NFC · 앞뒤 빈칸 · 가운데 빈칸 하나로) — 동명이인일 수 있어 막지 않고 표시만 한다. 돌려주는 것은 그 줄들의 id.
//   앱 줄끼리·대신 등록 줄끼리 같은 이름은 고르지 않는다(앱 줄은 계정마다, 대신 등록 줄은 신원 키마다 이미 한 줄이다).
const LIVE_ENROLL = new Set(["applied", "confirmed", "waitlisted"]);
export function maybeDupIds(rows: { id: number; name?: string; status?: string; user_id?: string | null }[]): Set<number> {
  const by = new Map<string, { app: boolean; staff: boolean; ids: number[] }>();
  for (const r of rows || []) {
    if (!LIVE_ENROLL.has(String(r?.status))) continue;
    const key = norm(r.name);
    if (!key) continue;
    const g = by.get(key) || { app: false, staff: false, ids: [] };
    if (r.user_id) g.app = true; else g.staff = true;
    g.ids.push(r.id);
    by.set(key, g);
  }
  const out = new Set<number>();
  for (const g of by.values()) if (g.app && g.staff) for (const id of g.ids) out.add(id);
  return out;
}

// 강좌를 고친 뒤 대기하신 분을 올릴 때인가(edu_course_refill) — 자리가 늘었거나(정원 ↑ · 제한 없음으로) 선착순으로 바뀌었을 때만.
//   다른 칸만 고쳤을 때는 부르지 않는다 — 담당자가 일부러 빈자리 옆 대기로 둔 분이 제목 하나 고쳤다고 확정되지 않게.
export function seatsOpened(before: { capacity?: number | null; mode?: string }, after: { capacity?: unknown; mode?: unknown }): boolean {
  if (after?.mode !== "auto") return false;
  if (before?.mode !== "auto") return true;
  const was = before.capacity ?? null, now = after.capacity ?? null;
  if (was === null) return false;                 // 이미 제한 없음 — 늘 자리가 있다
  return now === null || Number(now) > Number(was);
}

const kstStamp = (iso: string) => {
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  return new Date(t + 9 * 3600000).toISOString().slice(0, 16).replace("T", " ");
};

// 엑셀 줄(머리 포함) — 입력은 DB 줄(fee_paid…)도 enrollOut 결과(feePaid…)도 받는다
export function exportRows(course: { title: string; term?: string }, list: any[]): string[][] {
  const head = ["강좌", "학기", "이름", "소속", "상태", "교재비", "신청한 곳", "신청 시각(한국)", "메모"];
  return [head, ...list.map((e) => [course.title, course.term || "", e.name, e.who, ENROLL_STATUS_LABEL[e.status] || e.status,
    e.fee_paid || e.feePaid ? "냄" : "", e.source === "staff" ? "담당자" : "앱", kstStamp(e.applied_at || e.appliedAt || ""),
    e.staff_note || e.note || ""])];
}

// ---------- 대신 등록: 신원 만들기 (검토 반영 · 2026-10-05) ----------
const ID_FIELD_MAX = 40;
const NAME_BAD = /["\\,()|]/;

// 담당자가 직접 적은 신원 — 새가족. ident_key 는 「staff|구분|소속|세부|이름」 이라 어느 칸에도 | 가 들어가면 키가 갈라진다.
export function checkTypedIdent(o: any):
  { ok: true; ident: { name: string; who_type: string; group_name: string; sub_name: string; ident_key: string } } | { ok: false; error: string } {
  const name = norm(o?.name);
  const who = norm(o?.who_type) || "새가족";
  const group = norm(o?.group_name ?? o?.group), sub = norm(o?.sub_name ?? o?.sub);
  if (!name || name.length > ID_FIELD_MAX || NAME_BAD.test(name)) return { ok: false, error: "bad-ident" };
  for (const f of [who, group, sub]) if (f.length > ID_FIELD_MAX || f.includes("|")) return { ok: false, error: "bad-ident" };
  return { ok: true, ident: { name, who_type: who, group_name: group, sub_name: sub, ident_key: ["staff", who, group, sub, name].join("|") } };
}

// 교인명부 한 분 → 앱 계정을 찾을 때 쓸 신원(교구/교회학교 · 소속과 세부가 다 있을 때만, 없으면 null = 계정을 잇지 않는다)
export function rosterIdentity(c: { who_type?: string; group?: string; sub?: string; name?: string }):
  { type: string; gu: string; mok: string; bu: string; grade: string; name: string } | null {
  const g = norm(c?.group), s = norm(c?.sub), name = norm(c?.name);
  if (!g || !s || !name) return null;
  if (c.who_type === "교구") return { type: "교구", gu: g, mok: s, bu: "", grade: "", name };
  if (c.who_type === "교회학교") return { type: "교회학교", gu: "", mok: "", bu: g, grade: s, name };
  return null;
}

// 명부 줄 + 같은 신원의 앱 계정 수 → 등록할 신원. 계정이 **정확히 하나**일 때만 use_app, 그 밖(소속 없음·세부 없음·0개·둘 이상)은
// 앱 계정을 잇지 않는다. ident_key 는 늘 「person|교인ID」 — 같은 목장 동명이인이 키를 나눠 갖지 않고, 명부를 다시 올려도 안 바뀐다.
export function rosterIdent(c: { who_type?: string; group?: string; sub?: string; name?: string }, personId: number, appMatches: number) {
  const known = rosterIdentity(c) !== null;
  return {
    ident: { name: norm(c?.name), who_type: known ? String(c.who_type) : "", group_name: known ? norm(c.group) : "",
      sub_name: known ? norm(c.sub) : "", ident_key: "person|" + personId },
    use_app: known && appMatches === 1,
  };
}

// ---------- 출석부(2단계 · 2026-10-05 · 계획 v2 docs/superpowers/plans/2026-10-05-education-stage2-attendance.md) ----------
// 출석·지각·결석·공결 — 칸 값은 성경암송 supabase/edu.sql 의 edu_attendance.state CHECK 와 같다(체크 안 한 칸은 줄이 없다 = null).
export const ATTEND_STATES = ["present", "late", "absent", "excused"];
export const ATTEND_LABEL: Record<string, string> = { present: "출석", late: "지각", absent: "결석", excused: "공결" };
export const ATTEND_MARK: Record<string, string> = { present: "○", late: "지", absent: "결", excused: "공" };   // 엑셀 칸

// 출석률 — 친구 결정(2026-10-05): 지각 = 출석 · 공결은 분모에서 뺀다 · 아직 체크 안 한 회차는 분모에 넣지 않는다.
//   ⚠️ 아래 함수 몸통은 성경암송 js/edu.js(순수 함수 표식 사이)와 **한 글자도 같게** 둔다 — 두 앱이 같은 규칙(시험이 같은 경우를 본다:
//      이쪽 tests/edu-rules.test.mjs · 그쪽 tests/edu-front.test.cjs · 그쪽 api 의 복사본은 edu-front 가 js/edu.js 와 글자로 맞대 본다).
//      그래서 export 를 함수 앞에 붙이지 않고 아래 줄에서 내보낸다. 고칠 때는 세 곳을 같은 커밋 차례로.
//   반올림은 출석×100÷분모(×100 을 먼저 — 29/200 같은 값이 부동소수 때문에 14 로 내려가지 않게).
function eduAttendRate(c) {
  var n = function (v) { var x = Number(v); return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0; };
  var o = c || {};
  var attended = n(o.present) + n(o.late);
  var denom = attended + n(o.absent);
  return { attended: attended, denom: denom, pct: denom > 0 ? Math.round(attended * 100 / denom) : null };
}
export { eduAttendRate };

// 한 칸 상태 확인 — null·빈 값은 「지움」(allowNull 일 때만) · 그 밖은 네 값 가운데 하나
export function checkAttendState(x: unknown, allowNull = true): { ok: true; state: string | null } | { ok: false; error: string } {
  if (x === undefined || x === null || x === "") return allowNull ? { ok: true, state: null } : { ok: false, error: "bad-state" };
  const s = norm(x);
  return ATTEND_STATES.includes(s) ? { ok: true, state: s } : { ok: false, error: "bad-state" };
}

// 한국 날짜(YYYY-MM-DD) — 서버 시계(UTC)에서
export const kstDate = (ms: number = Date.now()): string => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);

// 출석부를 열 때 고를 회차 — 오늘 회차가 있으면 그것, 없으면 다음 회차, 다 지났으면 마지막 회차(없으면 null).
//   sessions 는 {id, no, on_date} — 날짜·번호 차례로 본다.
export function pickSession(sessions: { id: number; no: number; on_date: string }[], today: string): number | null {
  const ss = [...(sessions || [])].sort((a, b) => (a.on_date < b.on_date ? -1 : a.on_date > b.on_date ? 1 : a.no - b.no));
  if (!ss.length) return null;
  const t = ss.find((s) => s.on_date === today) || ss.find((s) => s.on_date > today) || ss[ss.length - 1];
  return t.id;
}

// 회차 한 줄(응답) — id(출석 쓰기에 쓴다)·번호·날짜·시각·주제·장소
export function attendSessionOut(s: any) {
  return { id: s.id, no: s.no, date: s.on_date, start: s.start_time ? String(s.start_time).slice(0, 5) : null,
    end: s.end_time ? String(s.end_time).slice(0, 5) : null, topic: s.topic || "", place: s.place || "" };
}

// 네 칸 수 + marked(체크한 칸 수) + 출석률(eduAttendRate)
export function attendCounts(states: (string | null | undefined)[]) {
  const k: Record<string, number> = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const s of states || []) if (s && s in k) k[s]++;
  const r = eduAttendRate(k);
  return { present: k.present, late: k.late, absent: k.absent, excused: k.excused,
    marked: k.present + k.late + k.absent + k.excused, attended: r.attended, denom: r.denom, pct: r.pct };
}

// 출석 현황 — 확정된 분마다 네 칸 수·출석률·회차별 칸(sessions 차례). 출석 줄은 그 강좌 회차·그 분 것만 센다.
//   attendPct(강좌의 수료 기준 %)보다 낮으면 below:true(체크한 회차가 없으면 pct null · below false).
//   people 은 신청 줄 {id, name, who_type, group_name, sub_name} — 응답에는 id(신청 번호)·이름·소속만(user_id·ident_key 없음).
export function attendSummary(sessions: { id: number }[], people: any[], rows: { enrollment_id: number; session_id: number; state: string }[], attendPct: number | null) {
  const at = new Map<number, Map<number, string>>();
  for (const r of rows || []) {
    if (!ATTEND_STATES.includes(r?.state)) continue;
    const m = at.get(r.enrollment_id) || new Map<number, string>();
    m.set(r.session_id, r.state);
    at.set(r.enrollment_id, m);
  }
  const out = (people || []).map((p) => {
    const mine = at.get(p.id) || new Map<number, string>();
    const cells = (sessions || []).map((s) => mine.get(s.id) ?? null);
    const c = attendCounts(cells);
    const below = c.pct !== null && typeof attendPct === "number" && c.pct < attendPct;
    return { id: p.id, name: norm(p.name), who: whoOf(p), ...c, below, cells };
  });
  out.sort((a, b) => a.name.localeCompare(b.name, "ko") || a.who.localeCompare(b.who, "ko") || a.id - b.id);
  return out;
}

// 출석 현황 엑셀 줄(머리 포함) — 이름·소속·회차마다 ○/지/결/공(빈칸 = 체크 안 함)·네 칸 수·출석률
const mdOf = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? Number(d.slice(5, 7)) + "/" + Number(d.slice(8, 10)) : "");
export function attendExportRows(course: { title: string; term?: string }, sessions: { no: number; date?: string; on_date?: string }[], people: any[]): string[][] {
  const head = ["강좌", "학기", "이름", "소속", ...(sessions || []).map((s) => `${s.no}회 ${mdOf(String(s.date ?? s.on_date ?? ""))}`.trim()),
    "출석", "지각", "결석", "공결", "출석률"];
  return [head, ...(people || []).map((p) => [course.title, course.term || "", p.name, p.who,
    ...(p.cells || []).map((s: string | null) => (s ? ATTEND_MARK[s] || "" : "")),
    String(p.present ?? 0), String(p.late ?? 0), String(p.absent ?? 0), String(p.excused ?? 0), p.pct === null || p.pct === undefined ? "" : p.pct + "%"])];
}
