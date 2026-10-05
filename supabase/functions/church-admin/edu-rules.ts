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
      apply_from: from || null, apply_to: to || null, prereq_tracks: prereq, attend_pct: pct,
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

export function courseOut(r: any, counts: { confirmed: number; waitlisted: number; applied: number }) {
  return {
    id: r.id, title: r.title, kind: r.kind, kindLabel: EDU_KIND_LABEL[r.kind] || r.kind, term: r.term || "",
    description: r.description || "", teacher: r.teacher_label || "", place: r.place || "", fee: r.fee_note || "",
    target: r.target || "", track: r.track || "", capacity: r.capacity ?? null, mode: r.mode, waitlist: !!r.waitlist,
    applyFrom: r.apply_from || null, applyTo: r.apply_to || null, prereq: r.prereq_tracks || [],
    attendPct: r.attend_pct, checkLabel: r.check_label || null, status: r.status,
    statusLabel: EDU_STATUS_LABEL[r.status] || r.status, updatedAt: r.updated_at || null,
    counts: { confirmed: counts.confirmed || 0, waitlisted: counts.waitlisted || 0, applied: counts.applied || 0 },
  };
}

export function enrollOut(r: any, waitNo: number | null) {
  return {
    id: r.id, name: r.name, who: whoOf(r), status: r.status, statusLabel: ENROLL_STATUS_LABEL[r.status] || r.status,
    source: r.source, hasApp: !!r.user_id, appliedAt: r.applied_at, decidedAt: r.decided_at || null,
    feePaid: !!r.fee_paid, note: r.staff_note || "", waitNo,
  };
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
