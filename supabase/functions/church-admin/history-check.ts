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
export const HISTORY_SELECT = "id,year,committee,team,role_title,position";
export const REQUEST_SELECT = "id,history_id,kind,detail,year,team_text,status,answer,created_at";
export const HISTORY_OUT_KEYS = ["committee", "id", "position", "role_title", "team", "year"];
export const REQUEST_OUT_KEYS = ["answer", "created_at", "detail", "history_id", "id", "kind", "status", "team_text", "year"];

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

export type ReqIn = { history_id: number | null; kind: string; detail: string; year: number | null; team_text: string };

export function parseRequest(b: any): { ok: true; req: ReqIn } | { ok: false; error: string } {
  const kind = tidy(b?.kind);
  if (!REQ_KINDS.includes(kind)) return { ok: false, error: "bad-kind" };
  const detail = tidy(b?.detail);
  if (detail.length > REQ_DETAIL_MAX) return { ok: false, error: "too-long" };
  if (REQ_LINE_KINDS.includes(kind)) {
    const id = Number(b?.history_id);
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "no-row" };
    if (kind === "other" && !detail) return { ok: false, error: "need-detail" };
    return { ok: true, req: { history_id: id, kind, detail, year: null, team_text: "" } };
  }
  if (kind === "missing") {
    const year = Number(tidy(b?.year));
    if (!Number.isInteger(year) || year < 1950 || year > 2100) return { ok: false, error: "bad-year" };
    const team = tidy(b?.team_text);
    if (!team) return { ok: false, error: "need-team" };
    if (team.length > REQ_TEAM_MAX) return { ok: false, error: "too-long" };
    return { ok: true, req: { history_id: null, kind, detail, year, team_text: team } };
  }
  return { ok: true, req: { history_id: null, kind, detail, year: null, team_text: "" } };   // find_me
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
    year: req.year, team_text: req.team_text,
    who_type: w.type, who_group: school ? w.bu : w.gu, who_sub: school ? w.grade : w.mok, who_name: w.name,
  };
}

export function historyRowOut(r: any) {
  return {
    id: Number(r.id), year: Number(r.year), committee: String(r.committee ?? ""), team: String(r.team ?? ""),
    role_title: String(r.role_title ?? ""), position: String(r.position ?? ""),
  };
}

export function requestOut(r: any) {
  return {
    id: Number(r.id), history_id: r.history_id == null ? null : Number(r.history_id), kind: String(r.kind ?? ""),
    detail: String(r.detail ?? ""), year: r.year == null ? null : Number(r.year), team_text: String(r.team_text ?? ""),
    status: String(r.status ?? ""), answer: String(r.answer ?? ""), created_at: String(r.created_at ?? ""),
  };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);   // 코드 포인트 차례(localeCompare 는 ICU 에 따라 달라진다)
export function sortHistory<T extends { year: number; committee: string; team: string; id: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.year - a.year || cmp(a.committee, b.committee) || cmp(a.team, b.team) || a.id - b.id);
}
