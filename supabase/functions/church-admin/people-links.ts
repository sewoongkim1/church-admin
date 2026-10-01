// 교인명부 — 사역신청·성경필사 기록을 교인과 잇는 규칙 · 「자세히」 창 탭의 칸 지도(순수 함수 · 2026-10-01)
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §2·§3·§5
//   서버(Deno, index.ts)와 시험(Node, tests/people-links.test.mjs)이 **같은 파일**을 읽는다 — authz.ts 와 같은 제약
//   (원격 import·enum·namespace 금지 · node --experimental-strip-types 가 그대로 읽는다).
// ⚠️ 「같은 소속」을 새로 만들지 않는다 — 명단의 교적 표시와 같은 판정(사역 줄 sameAffiliation · 성경필사 줄 signupSame)이다.
//    그래서 이은 기록 = 명단의 「교적 ✓」(같은 소속 한 분)이고, 사역 줄만 번호가 딱 한 분과 맞을 때 더 잇는다.
// ⚠️ 「이름이 명부에 한 분뿐이면 그분」(events-person.ts personPickFor ②)은 **잇지 않는다**(2026-10-01 친구 결정) —
//    소속이 다르면 명부에 없는 다른 분일 수 있다. 그 줄은 「자세히」 창 「아직 안 이어진 기록」에서 사람이 「이분 것」으로 잇는다.
// ⚠️ manual·none(사람이 정한 줄)은 여기서 고르지 않는다(needsAuto) — DB 쪽에서도 people_links_auto() 의 where 가 한 번 더 막는다.
// ⚠️ 응답은 아래 …Item 칸 지도로만 — user_id·ident_key·memo·phone·answers·note 는 어느 모양에도 없다(스프레드 금지).
import { applicantFromSignup, applicantFromWho, mokToConfirm, nameKey, phoneDigits, sameAffiliation, toCand,
  type Applicant, type Cand } from "./people-match.ts";
import { signupSame, type SignupRow } from "./events-person.ts";

export const LINK_KINDS = ["order", "signup", "history"];   // peopleLink 이 받는 kind — history 는 b6 사역 이력 표(계획 Task 10)
export const LINK_HOWS = ["manual", "none", "auto"];
export const BASIS_SAME = "맞음";
export const BASIS_PHONE = "번호";
export const BASIS_MANUAL = "사람이 이음";

export type LinkKind = "order" | "signup";
export type LinkHow = "auto" | "manual" | "none";
export type LinkCand = Cand & { person_id: number };
export type LinkRow = { kind: string; row_id: number; person_id: number | null; link_how: LinkHow; match_basis: string; import_id: number | null };
export type AutoRec = { kind: LinkKind; row_id: number; person_id: number | null; match_basis: string; import_id: number };
// idx = 이름 키 → 명부 후보 · asked = 명부에 물어본 이름 키(없는 이름도) · importId = 지금 명부(church_people_imports 마지막 id)
export type LinkLook = { idx: Map<string, LinkCand[]>; asked: Set<string>; importId: number };
export type OrderIn = { id: number | string; name: string; who: string; phone?: string | null };
export type SignupIn = SignupRow & { id: number | string; name: string };
export type MinistryItem = { kind: "order" | "history"; row: number; year: number; committee: string; team: string; option: string;
  role_title: string; status: string; how: LinkHow };
export type BibleItem = { kind: "signup"; row: number; event_id: string; title: string; short_title: string; opens_on: string;
  who_type: string; group: string; sub: string; position: string; how: LinkHow };
export type PersonHistory = { counts: { ministry: number; bible: number }; ministry: MinistryItem[]; bible: BibleItem[] };

const s = (v: unknown): string => String(v ?? "").normalize("NFC").trim();
const howOf = (v: unknown): LinkHow => (v === "manual" || v === "none" ? v : "auto");
const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
};
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);   // 코드 포인트 차례(localeCompare 는 ICU 에 따라 다르다)

export function toLinkCand(r: any): LinkCand {
  return { ...toCand(r), person_id: Number(r?.person_id) };
}
export function linkRowOf(r: any): LinkRow {
  return { kind: s(r?.kind), row_id: Number(r?.row_id), person_id: intOrNull(r?.person_id), link_how: howOf(r?.link_how),
    match_basis: s(r?.match_basis), import_id: intOrNull(r?.import_id) };
}
// 표가 아직 없다 — Postgres 42P01 · PostgREST 12 의 PGRST205(「schema cache 에 없는 표」)
export const missingTable = (e: any): boolean => !!e && (e.code === "42P01" || e.code === "PGRST205");

// 한 줄을 명부 한 분에 잇는다 — ① 같은 소속 딱 한 분(맞음) ② (번호가 있으면) 같은 소속 안에서, 같은 소속이 없으면 같은 이름 전부에서
// (목장 모르는 줄은 같은 교구가 있으면 그 안에서 — personPickFor 와 같은 차례) 번호가 딱 한 분과 맞으면(번호) ③ 그 밖 null.
// isSame — 성경필사 줄은 signupSame(명단의 교적 표시와 같은 판정)을 넘긴다. 넘기지 않으면 sameAffiliation(사역 줄).
export function autoLink(cands: LinkCand[] | undefined, a: Applicant, opts: { isSame?: (c: Cand) => boolean } = {}):
  { person_id: number | null; basis: string } {
  const all = [...(cands ?? [])].sort((x, y) => x.person_id - y.person_id);
  const judge = opts.isSame ?? ((c: Cand) => sameAffiliation(c, a));
  const same = all.filter((c) => judge(c));
  if (same.length === 1) return { person_id: same[0].person_id, basis: BASIS_SAME };
  const ph = phoneDigits(a?.phone);
  if (ph) {
    const gu = !same.length && mokToConfirm(a) && a.gu ? all.filter((c) => c.mok1 === a.gu) : [];
    const pool = same.length ? same : gu.length ? gu : all;
    const hit = pool.filter((c) => c.phones.includes(ph));
    if (hit.length === 1) return { person_id: hit[0].person_id, basis: BASIS_PHONE };
  }
  return { person_id: null, basis: "" };
}

// 다시 맞출 줄인가 — 줄이 없거나(아직 맞춰 보지 않음) · auto 인데 맞춘 명부가 지금 명부와 다르면(새 명부 · 지워진 시험 명부) ·
// all(기록 잇기 맞추기)이면 auto 전부. manual·none 은 어떤 경우에도 아니다.
export function needsAuto(cur: LinkRow | undefined, importId: number, all = false): boolean {
  if (!cur) return true;
  if (cur.link_how !== "auto") return false;
  return all || cur.import_id !== importId;
}

// 번호로 이은 줄은 나중에 번호를 지워도 그대로 남는다(설계 §3.1-3) — 그 신청의 번호가 비었으면(📵 단추·결정 뒤 180일 작업이 지웠다)
// 다시 맞추지 않는다(새 명부가 와서 import_id 가 달라도 · 「기록 잇기 맞추기」(all)여도). 번호 없이 다시 맞추면 person_id 가 null 로 덮여 끊긴다
// (12월 새 명단에서 번호로 이은 줄이 모두 끊기는 길). 번호가 남아 있으면 평소처럼 다시 맞춘다.
// 사람이 「풀기」하면(peopleLink auto — cur 없이 부른다) 번호 없이 다시 맞춘다(사람이 고른 일).
// 그분이 새 명부에서 빠져도 이 줄은 남는다 — 설계 §11 「끊김」과 같다(창에는 그분이 없으니 보이지 않는다).
export function phoneLinkKept(cur: LinkRow | undefined, phone: unknown): boolean {
  return !!cur && cur.link_how === "auto" && cur.match_basis === BASIS_PHONE && cur.person_id !== null && !phoneDigits(phone);
}

function recsOf(kind: LinkKind, rows: any[], look: LinkLook, cur: Map<number, LinkRow>, all: boolean,
  pick: (r: any, cands: LinkCand[] | undefined) => { person_id: number | null; basis: string },
  keep?: (r: any, c: LinkRow | undefined) => boolean): AutoRec[] {
  const out = new Map<number, AutoRec>();
  for (const r of rows ?? []) {
    const id = Number(r?.id);
    if (!Number.isSafeInteger(id) || id <= 0 || out.has(id)) continue;
    const key = nameKey(r?.name);
    if (!key || !look.asked.has(key)) continue;     // 명부에 물어보지 않은 이름 — 「못 맞춤」으로 적지 않는다
    if (!needsAuto(cur.get(id), look.importId, all)) continue;
    if (keep && keep(r, cur.get(id))) continue;     // 그대로 둘 줄(사역 — phoneLinkKept)
    const l = pick(r, look.idx.get(key));
    out.set(id, { kind, row_id: id, person_id: l.person_id, match_basis: l.basis, import_id: look.importId });
  }
  return [...out.values()];
}
// 사역신청 줄 — 신청 현황의 교적 표시와 같은 맞대는 줄(applicantFromWho(이름, who, 번호) · 이름·소속이 빈 옛 줄은 부르는 쪽이 앱 계정으로 채운다)
// ⚠️ 번호로 이은 줄은 번호가 지워졌으면 건너뛴다(phoneLinkKept) — 이 인자를 빼면 「기록 잇기 맞추기」·새 명부에서 그 줄이 끊긴다.
export function orderAutoRecs(rows: OrderIn[], look: LinkLook, cur: Map<number, LinkRow>, all = false): AutoRec[] {
  return recsOf("order", rows, look, cur, all, (r, cands) => autoLink(cands, applicantFromWho(r.name, r.who, r.phone ?? "")),
    (r, c) => phoneLinkKept(c, r.phone));
}
// 성경필사 줄 — 명단의 교적 표시와 같은 signupSame(교구 줄 아이 빼기 · 옮겨 적은 줄 맞음) · 번호 없음
export function signupAutoRecs(rows: SignupIn[], look: LinkLook, cur: Map<number, LinkRow>, all = false): AutoRec[] {
  return recsOf("signup", rows, look, cur, all, (r, cands) => autoLink(cands, applicantFromSignup(r), { isSame: signupSame(r, cands) }));
}

// 「새로 이음 N · 바뀜 K · 못 맞춤 M」 — cur 는 쓰기 전 잇기 줄
export function syncCounts(cur: Map<number, LinkRow>, recs: AutoRec[]): { added: number; changed: number; unmatched: number } {
  let added = 0, changed = 0, unmatched = 0;
  for (const r of recs) {
    const before = cur.get(r.row_id)?.person_id ?? null;
    if (r.person_id === null) unmatched++;
    if (before === null && r.person_id !== null) added++;
    else if (before !== null && r.person_id !== before) changed++;
  }
  return { added, changed, unmatched };
}

// 사역 이력으로 넘긴 신청 — 그 신청은 사역 탭에서 신청 쪽으로 읽지 않는다(두 번 보이지 않게 · 줄 단위)
export function movedOrderIds(rows: { order_id?: unknown }[]): Set<number> {
  return new Set((rows ?? []).map((r) => intOrNull(r?.order_id)).filter((x): x is number => x !== null));
}

// ---------- 탭 칸 지도 ----------
export function orderItem(o: any, how: unknown): MinistryItem {
  return { kind: "order", row: Number(o?.id), year: Number(o?.year) || 0, committee: s(o?.committee), team: s(o?.team),
    option: s(o?.option), role_title: "", status: s(o?.status), how: howOf(how) };
}
// 사역 이력(b6 · 섬긴 사역 = 임명만) — 상태는 「임명확정」(신청 현황과 같은 칩 「임명」)
export function historyItem(h: any): MinistryItem {
  return { kind: "history", row: Number(h?.id), year: Number(h?.year) || 0, committee: s(h?.committee), team: s(h?.team),
    option: "", role_title: s(h?.role_title), status: "임명확정", how: howOf(h?.link_how) };
}
export function signupItem(r: any, ev: any, how: unknown): BibleItem {
  return { kind: "signup", row: Number(r?.id), event_id: s(r?.event_id), title: s(ev?.title), short_title: s(ev?.short_title),
    opens_on: s(ev?.opens_on), who_type: s(r?.who_type), group: s(r?.group_name), sub: s(r?.sub_name), position: s(r?.position),
    how: howOf(how) };
}
const byYear = (a: any, b: any) => (Number(b.year) || 0) - (Number(a.year) || 0) || cmp(a.committee, b.committee) ||
  cmp(a.team, b.team) || cmp(a.kind, b.kind) || a.row - b.row;
const byOpens = (a: any, b: any) => cmp(b.opens_on, a.opens_on) || cmp(a.event_id, b.event_id) || a.row - b.row;
const liveSignup = (evBy: Map<string, any>) => (r: any) => { const e = evBy.get(s(r?.event_id)); return !!e && e.status !== "draft"; };

// 「자세히」 창 탭 — links = 이분께 이어진 잇기 줄(auto·manual) · orders·signups = 그 줄의 원래 줄(없어진 줄은 저절로 빠진다) ·
// history = 사역 이력에서 이분께 이어진 줄 · moved = 이력으로 넘긴 신청 id
export function historyTabs(x: { links?: any[]; orders?: any[]; signups?: any[]; events?: any[]; history?: any[]; moved?: Set<number> }): PersonHistory {
  const how = new Map((x.links ?? []).map((l) => [`${s(l?.kind)}:${Number(l?.row_id)}`, l?.link_how]));
  const evBy = new Map((x.events ?? []).map((e) => [s(e?.id), e]));
  const moved = x.moved ?? new Set<number>();
  const ministry = [
    ...(x.orders ?? []).filter((o) => !moved.has(Number(o?.id))).map((o) => orderItem(o, how.get(`order:${Number(o?.id)}`))),
    ...(x.history ?? []).map(historyItem),
  ].sort(byYear);
  const bible = (x.signups ?? []).filter(liveSignup(evBy))
    .map((r) => signupItem(r, evBy.get(s(r?.event_id)), how.get(`signup:${Number(r?.id)}`))).sort(byOpens);
  return { counts: { ministry: ministry.length, bible: bible.length }, ministry, bible };
}

// 「이름이 같고 아직 안 이어진 기록」 — 아무에게도 안 이어진 줄(how auto)과 「이분 아님」으로 둔 줄(how none · 화면이 따로 묶는다).
// 다른 분께 이어진 줄(person_id 있음)은 빼고, 넘긴 신청·초안 회차도 뺀다. history = 사역 이력에서 person_id 가 빈 줄(Task 10).
export function unlinkedRows(x: { orders?: any[]; signups?: any[]; events?: any[]; orderLinks?: Map<number, LinkRow>;
  signupLinks?: Map<number, LinkRow>; moved?: Set<number>; history?: any[] }): Record<string, unknown>[] {
  const open = (l?: LinkRow): LinkHow | null => (!l ? "auto" : l.link_how === "none" ? "none" : l.person_id === null ? "auto" : null);
  const evBy = new Map((x.events ?? []).map((e) => [s(e?.id), e]));
  const moved = x.moved ?? new Set<number>();
  const orders = (x.orders ?? []).filter((o) => !moved.has(Number(o?.id))).flatMap((o) => {
    const h = open(x.orderLinks?.get(Number(o?.id)));
    return h ? [{ kind: "order", row: Number(o?.id), year: Number(o?.year) || 0, committee: s(o?.committee), team: s(o?.team),
      option: s(o?.option), status: s(o?.status), who: s(o?.who), position: s(o?.position), how: h }] : [];
  });
  const hist = (x.history ?? []).map((h) => ({ kind: "history", row: Number(h?.id), year: Number(h?.year) || 0,
    committee: s(h?.committee), team: s(h?.team), role_title: s(h?.role_title), position: s(h?.position), mok: s(h?.mok),
    how: h?.link_how === "none" ? "none" : "auto" }));
  const sig = (x.signups ?? []).filter(liveSignup(evBy)).flatMap((r) => {
    const h = open(x.signupLinks?.get(Number(r?.id)));
    return h ? [signupItem(r, evBy.get(s(r?.event_id)), h)] : [];
  });
  return [...[...orders, ...hist].sort(byYear), ...sig.sort(byOpens)];
}

// ---------- peopleLink(「이분 것」·「이분 아님」·「풀기」) ----------
export function parseLink(b: unknown): { ok: true; kind: string; row: number; person: number; how: LinkHow } | { ok: false; error: string } {
  const o = (b && typeof b === "object" && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
  const kind = String(o.kind ?? ""), how = String(o.how ?? ""), row = Number(o.row), person = Number(o.person);
  if (!LINK_KINDS.includes(kind) || !LINK_HOWS.includes(how)) return { ok: false, error: "invalid" };
  if (!Number.isSafeInteger(row) || row <= 0 || !Number.isSafeInteger(person) || person <= 0) return { ok: false, error: "invalid" };
  return { ok: true, kind, row, person, how: how as LinkHow };
}
// 사람이 정한 줄 — manual(이분 것) · none(이분 아님). 자동이 다시 덮지 않는다(link_how).
export function linkPatch(kind: LinkKind, row: number, how: "manual" | "none", personId: number, memberId: string | null, nowIso: string) {
  return { kind, row_id: row, person_id: how === "manual" ? personId : null, link_how: how,
    match_basis: how === "manual" ? BASIS_MANUAL : "", import_id: null, linked_by: memberId, linked_at: nowIso, updated_at: nowIso };
}
// 풀기 — auto 로 되돌리고 지금 명부로 그 줄만 다시 맞춘 값(사람이 정한 흔적은 지운다)
export function unlinkRec(kind: LinkKind, row: number, l: { person_id: number | null; basis: string }, importId: number, nowIso: string) {
  return { kind, row_id: row, person_id: l.person_id, link_how: "auto", match_basis: l.basis, import_id: importId,
    linked_by: null, linked_at: null, updated_at: nowIso };
}
