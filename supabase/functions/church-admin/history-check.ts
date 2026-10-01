// 사역 이력 확인 · 정정 신청 — 순수 함수(2026-10-01)
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §4·§5
//   서버(Deno, index.ts)와 시험(Node, tests/history-check.test.mjs)이 같은 파일을 읽는다 — 원격 import·enum 금지.
// ⚠️ 성경암송 앱(성도님)께 나가는 응답의 모양을 여기서 정한다 — 교인ID·user_id·맞춤 근거·그때 목장은 싣지 않는다.
// ⚠️ kind·status 글자는 SQL 008 CHECK·성경암송 app.js MH_* 와 같다(세 곳).
import type { LoginWho } from "./people-match.ts";

// 「직분이 틀려요」(wrong_position)는 넣지 않는다 — 직분은 교적 기준(친구 결정 2026-10-01). 직분이 틀리면 교적에서 고친다.
export const REQ_LINE_KINDS = ["not_mine", "wrong_team", "other"];
export const REQ_KINDS = [...REQ_LINE_KINDS, "missing", "find_me"];
export const REQ_STATUS = ["신청", "확인 중", "반영", "반영 안 함"];
export const REQ_OPEN = ["신청", "확인 중"];
export const REQ_DETAIL_MAX = 200;
export const REQ_TEAM_MAX = 100;
export const REQ_OPEN_MAX = 20;
// 직분은 성도님 앱에 보내지 않는다(2026-10-01 친구 요청 · 화면에서도 뺐다).
export const HISTORY_SELECT = "id,year,committee,team,role_title";
// committee_text — 빠진 사역 「부서」 칸(2026-10-02 두 칸 · SQL 009) · null 이면 옛 한 칸 신청(team_text 에 「부서·팀」 글)
export const REQUEST_SELECT = "id,history_id,kind,detail,year,committee_text,team_text,status,answer,created_at";
export const HISTORY_OUT_KEYS = ["committee", "id", "role_title", "team", "year"];
export const REQUEST_OUT_KEYS = ["answer", "committee_text", "created_at", "detail", "history_id", "id", "kind", "status", "team_text", "year"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tidy = (s: unknown): string => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

// 서비스 키 대조 — 길이가 같으면 글자마다 끝까지 본다(성경암송 api sameSecret 과 같은 식)
export function internalKeyOk(given: string | null, expected: string): boolean {
  const a = String(given ?? ""), b = String(expected ?? "");
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function hcUserId(x: unknown): string | null {
  const s = String(x ?? "").trim();
  return UUID_RE.test(s) ? s : null;
}

// 성경암송 api 가 users 줄에서 꺼내 넘긴 로그인 소속·이름 — 모양이 틀리면 null
export function readLoginWho(x: any): LoginWho | null {
  if (!x || typeof x !== "object") return null;
  const type = tidy(x.type);
  if (type !== "교구" && type !== "교회학교") return null;
  const name = tidy(x.name);
  if (!name) return null;
  return { type, gu: tidy(x.gu), mok: tidy(x.mok), bu: tidy(x.bu), grade: tidy(x.grade), name };
}

// 빠진 사역(kind missing)의 부서·팀 — 두 가지 꼴(2026-10-02 친구 요청 「네 두칸으로 해주세요」 · SQL 009):
//   committee_text = null  : 옛 한 칸 신청 — team_text 에 「부서·팀」 글(담당자 쪽이 history-db.ts parseTeamText 로 나눈다)
//   committee_text = 글자  : 두 칸 신청 — committee_text 가 부서, team_text 가 팀(둘 다 빈 글자일 수 있다 · 나누지 않는다)
//   다른 종류는 늘 null.
export type ReqIn = { history_id: number | null; kind: string; detail: string; year: number | null; committee_text: string | null; team_text: string };

export function parseRequest(b: any): { ok: true; req: ReqIn } | { ok: false; error: string } {
  const kind = tidy(b?.kind);
  if (!REQ_KINDS.includes(kind)) return { ok: false, error: "bad-kind" };
  const detail = tidy(b?.detail);
  if (detail.length > REQ_DETAIL_MAX) return { ok: false, error: "too-long" };
  if (REQ_LINE_KINDS.includes(kind)) {
    const id = Number(b?.history_id);
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "no-row" };
    if (kind === "other" && !detail) return { ok: false, error: "need-detail" };
    return { ok: true, req: { history_id: id, kind, detail, year: null, committee_text: null, team_text: "" } };
  }
  if (kind === "missing") {
    const year = Number(tidy(b?.year));
    if (!Number.isInteger(year) || year < 1950 || year > 2100) return { ok: false, error: "bad-year" };
    // 두 칸 — committee_text 가 글자일 때만(성경암송 api 가 글자일 때만 넘긴다 · 옛 캐시 앱은 보내지 않는다 → 아래 한 칸)
    if (typeof b?.committee_text === "string") {
      const committee = tidy(b.committee_text), team = tidy(b?.team_text);
      if (!committee && !team) return { ok: false, error: "need-team" };
      if (committee.length > REQ_TEAM_MAX || team.length > REQ_TEAM_MAX) return { ok: false, error: "too-long" };
      return { ok: true, req: { history_id: null, kind, detail, year, committee_text: committee, team_text: team } };
    }
    const team = tidy(b?.team_text);
    if (!team) return { ok: false, error: "need-team" };
    if (team.length > REQ_TEAM_MAX) return { ok: false, error: "too-long" };
    return { ok: true, req: { history_id: null, kind, detail, year, committee_text: null, team_text: team } };
  }
  return { ok: true, req: { history_id: null, kind, detail, year: null, committee_text: null, team_text: "" } };   // find_me
}

// 넣기 전 막기 — 화면이 미리 알리지만 정하는 것은 여기다. null = 넣어도 된다.
//   found: 로그인으로 교인을 찾았나 · mine: 이분 것인 기록 줄 id(빼 둔 줄 제외) · open: 이 계정의 끝나지 않은 신청
export function requestBlock(req: ReqIn, found: boolean, mine: Set<number>,
  open: { history_id: number | null; kind: string }[]): string | null {
  if (req.kind === "find_me") {
    if (found) return "already-found";
    if (open.some((o) => o.kind === "find_me")) return "already-open";
  } else {
    if (!found) return "not-found";
    if (req.history_id !== null) {
      if (!mine.has(req.history_id)) return "not-yours";
      if (open.some((o) => o.history_id === req.history_id)) return "already-open";
    }
  }
  if (open.length >= REQ_OPEN_MAX) return "too-many";
  return null;
}

export function requestInsert(req: ReqIn, userId: string, personId: number | null, w: LoginWho): Record<string, unknown> {
  const school = w.type === "교회학교";
  return {
    user_id: userId, person_id: personId, history_id: req.history_id, kind: req.kind, detail: req.detail,
    year: req.year, committee_text: req.committee_text, team_text: req.team_text,
    who_type: w.type, who_group: school ? w.bu : w.gu, who_sub: school ? w.grade : w.mok, who_name: w.name,
  };
}

export function historyRowOut(r: any) {
  return {
    id: Number(r.id), year: Number(r.year), committee: String(r.committee ?? ""), team: String(r.team ?? ""),
    role_title: String(r.role_title ?? ""),
  };
}

// committee_text: null(옛 한 칸 신청 · 칸 없음) 또는 글자 — 화면에 보일 글은 「부서 · 팀」(빈 칸 뺌) 또는 team_text(성경암송 mhReqOut·담당자 targetText)
const committeeOut = (v: unknown): string | null => (v == null ? null : String(v));

export function requestOut(r: any) {
  return {
    id: Number(r.id), history_id: r.history_id == null ? null : Number(r.history_id), kind: String(r.kind ?? ""),
    detail: String(r.detail ?? ""), year: r.year == null ? null : Number(r.year), committee_text: committeeOut(r.committee_text),
    team_text: String(r.team_text ?? ""),
    status: String(r.status ?? ""), answer: String(r.answer ?? ""), created_at: String(r.created_at ?? ""),
  };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);   // 코드 포인트 차례(localeCompare 는 ICU 에 따라 달라진다)
export function sortHistory<T extends { year: number; committee: string; team: string; id: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.year - a.year || cmp(a.committee, b.committee) || cmp(a.team, b.team) || a.id - b.id);
}

// ── 담당자 처리 「📮 정정 신청」(2026-10-01) ──
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md §3·§4
//   ⚠️ 응답에 user_id·person_id·handled_by 를 싣지 않는다(requestAdminOut 이 정한다 — 시험이 키 집합을 대조).
export const REQ_FILTERS = ["open", "done", "all"];
export const REQ_SET_STATUS = ["확인 중", "반영", "반영 안 함"];   // 「신청」은 성도님이 낸 상태 — 담당자가 고르지 않는다
export const REQ_ANSWER_MAX = 300;
export const REQ_LIST_MAX = 500;
export const REQUEST_ADMIN_SELECT =
  "id,kind,detail,year,committee_text,team_text,status,answer,created_at,updated_at,handled_at,who_type,who_group,who_sub,who_name,person_id,history_id";
export const ROW_ADMIN_SELECT = "id,year,committee,team,role_title,position,deleted_at";
// line — 빠진 사역의 「사역 이력에 넣을 내용」 미리 채움(2026-10-02 · history-db.ts requestLineOut · 다른 종류는 null)
// committee_text — 빠진 사역 「부서」 칸(2026-10-02 두 칸 · null 이면 옛 한 칸 신청)
export const REQUEST_ADMIN_OUT_KEYS = ["answer", "committee_text", "created_at", "detail", "found", "handled_at", "id", "kind", "line", "row",
  "status", "team_text", "updated_at", "who", "year"];

export type ReqSet = { id: number; status: string; answer: string; verified: boolean; expect: string };

export function parseRequestSet(b: any): { ok: true; set: ReqSet } | { ok: false; error: string } {
  const id = Number(b?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "bad-id" };
  const status = tidy(b?.status);
  if (!REQ_SET_STATUS.includes(status)) return { ok: false, error: "bad-status" };
  const answer = tidy(b?.answer);
  if (answer.length > REQ_ANSWER_MAX) return { ok: false, error: "answer-too-long" };
  const expect = String(b?.expect ?? "").trim();
  if (!expect) return { ok: false, error: "conflict" };   // 무엇을 보고 바꾸는지 모르면 덮어쓰지 않는다
  return { ok: true, set: { id, status, answer, verified: b?.verified === true, expect } };
}

// 지금 줄(cur)에 비춰 막기 — null 이면 써도 된다
export function requestSetBlock(set: ReqSet, cur: { kind: string; status: string; updated_at: string }): string | null {
  if (String(cur.updated_at) !== set.expect) return "conflict";
  if (set.status === "반영 안 함" && !set.answer) return "need-answer";
  // 「내 것이 아니에요」는 남의 이름으로 들어와서도 낼 수 있다 — 반영(=그 줄을 그분에게서 떼기) 전에 본인 확인(친구 결정)
  // 이미 반영된 줄의 답만 고칠 때는 다시 묻지 않는다 — 2026-10-01 친구 결정
  if (set.status === "반영" && cur.kind === "not_mine" && cur.status !== "반영" && !set.verified) return "need-verified";
  return null;
}

// 상태·답이 지금 줄과 같으면 참 — 쓰지도 기록하지도 않는다(답은 저장될 때 이미 tidy 됐다)
export function requestSetNoop(set: ReqSet, cur: { status: string; answer: string }): boolean {
  return set.status === cur.status && set.answer === String(cur.answer ?? "");
}

export function requestSetPatch(set: ReqSet, memberId: string | null, nowIso: string) {
  const done = set.status !== "확인 중";
  return { status: set.status, answer: set.answer, handled_by: memberId, handled_at: done ? nowIso : null, updated_at: nowIso };
}

export function requestAuditDetail(cur: { kind: string; status: string }, set: ReqSet) {
  return { id: set.id, kind: cur.kind, from: cur.status, to: set.status, verified: set.verified };
}

// line: 빠진 사역이면 requestLineOut 의 모양 — 여기서 일곱 칸만 다시 고른다(교인ID·이름·목장이 끼어들 수 없게)
export function requestAdminOut(r: any, row: any | null, line: any | null = null) {
  return {
    id: Number(r.id), kind: String(r.kind ?? ""), detail: String(r.detail ?? ""), year: r.year == null ? null : Number(r.year),
    committee_text: committeeOut(r.committee_text), team_text: String(r.team_text ?? ""), status: String(r.status ?? ""), answer: String(r.answer ?? ""),
    created_at: String(r.created_at ?? ""), updated_at: String(r.updated_at ?? ""), handled_at: r.handled_at ? String(r.handled_at) : null,
    who: { type: String(r.who_type ?? ""), group: String(r.who_group ?? ""), sub: String(r.who_sub ?? ""), name: String(r.who_name ?? "") },
    found: r.person_id != null,
    row: row ? {
      id: Number(row.id), year: Number(row.year), committee: String(row.committee ?? ""), team: String(row.team ?? ""),
      role_title: String(row.role_title ?? ""), position: String(row.position ?? ""), deleted: !!row.deleted_at,
    } : null,
    line: line ? {
      state: String(line.state ?? ""), year: line.year == null ? null : Number(line.year), committee: String(line.committee ?? ""),
      team: String(line.team ?? ""), role_title: String(line.role_title ?? ""), position: String(line.position ?? ""),
      expect: String(line.expect ?? ""),
    } : null,
  };
}

// 끝나지 않은 것은 오래된 것부터(먼저 온 신청을 먼저) · 끝난 것·전부는 최근 것부터 · 최대 REQ_LIST_MAX
export function filterRequests<T extends { id: number; status: string; created_at: string }>(rows: T[], filter: string): T[] {
  const open = (r: T) => REQ_OPEN.includes(r.status);
  const pick = filter === "open" ? rows.filter(open) : filter === "done" ? rows.filter((r) => !open(r)) : [...rows];
  const dir = filter === "open" ? 1 : -1;
  return pick.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id) * dir)
    .slice(0, REQ_LIST_MAX);
}

export function requestCounts(rows: { status: string }[]) {
  return { "신청": rows.filter((r) => r.status === "신청").length, "확인 중": rows.filter((r) => r.status === "확인 중").length };
}
