// 사역 이력(ministry_history) — 명단 줄을 교인명부(church_people)와 맞대는 규칙(순수 함수 · 2026-10-01)
//   설계: 성경암송 저장소 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md §4
//   서버(Deno, history-db.ts)와 시험(Node, tests/history-match.test.mjs · tools/history/check_real.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum 금지, node --experimental-strip-types 가 그대로 읽는다).
// ⚠️ 2026-10-01 독립 검증 다섯 갈래에서 나온 규칙이다. 규칙을 바꾸면 대조 시험(check_real)의 기대값도 함께 본다.
// ⚠️ 이 모듈은 교인ID 를 돌려준다 — 부르는 쪽(history-db.ts)이 역할에 따라 응답에서 가린다(설계 §5).
// 2026-10-04 2010~2021 명단을 더하며 그 해들에만 느슨한 규칙을 얹었다(LOOSE_LAST_YEAR · 친구 결정 「틀리더라도 이어 두고
//   성도님이 사역현황에서 확인」). 새로 이은 줄은 모두 근거 약함(WEAK_RE)이다. 2022~2026 결과는 한 줄도 바뀌지 않는다.
import { mokNumber, nameKey as pmNameKey, KID_KIND2 } from "./people-match.ts";

export const GU7 = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨"];
const TYPO: Record<string, string> = { "가쁨": "기쁨", "믿은": "믿음" };
const YOUTH_MOK1 = ["청년부", "청년공동체", "청년새가족"];
const YOUTH_KIND2 = ["청년", "청년군대/유학"];
const KID_POS = ["학생", "어린이", "고등부", "중등부"];
// 숫자 교구 「3-12」(교구-목장)를 쓰던 마지막 해 — 2016년에 숫자 교구 9개를 이름 교구 4개로 다시 나눴다(번호 하나가 여러 교구로
//   갈라져 「3교구 = 소망」 같은 표는 못 만든다). 그래서 목장 하나하나를 「그 목장 사람들이 지금 있는 교구」로 읽는다(oldMokHints).
export const OLD_MOK_LAST_YEAR = 2015;
const OLD_MOK_RE = /^\d+-\d+$/;
// 느슨한 규칙을 쓰는 마지막 해 — 2022~2026 은 2026-10-01 독립 검증을 거친 규칙 그대로 둔다.
export const LOOSE_LAST_YEAR = 2021;
// 목장 → 지금 교구 표의 문턱 — 그 목장에서 명부에 같은 이름이 어른 한 분뿐인 줄이 2줄 이상이고, 가장 많은 교구가 절반 이상이며 둘째보다 많을 때
const HINT_MIN_VOTES = 2;
const HINT_MIN_SHARE = 0.5;

// ── 사람(교인명부 한 분) — 부르는 쪽이 church_people 에서 이 모양으로 옮긴다(history-db.ts toHPerson)
export type HPerson = {
  person_id: number; name: string; gender: string; kind2: string; mok1: string; mok3: string; school_dept: string;
  position: string; position_detail: string;
  birth_year: number | null; birth_month: number | null; reg_year: number | null;
  household: string;            // 가족 열쇠(세대주 교인ID 글자) · 없으면 ""
};
// ── 명단 줄 — ministry_history 한 줄(필요한 칸만)
export type HRow = {
  id: number; year: number; committee: string; team: string; name: string; position: string; mok: string; renewal: string;
  link_how: "auto" | "manual" | "none"; person_id: number | null;
};
export type HResult = { id: number; person_id: number | null; match_basis: string; match_reason: string };

// ── 다듬기 ─────────────────────────────────────────────────────────
export const nfc = (s: unknown): string => String(s ?? "").normalize("NFC").trim();
const nospace = (s: unknown): string => nfc(s).replace(/\s+/g, "");
// 이름 열쇠 — people-match nameKey(NFC·띄어쓰기 없음) + 끝 영문자(동명이인 표시 「홍길동a」)는 대문자로
export function hKey(s: unknown): string {
  return pmNameKey(s).replace(/([가-힣])([a-z])$/, (_m, h, l) => h + l.toUpperCase());
}
const hasSuffix = (k: string): boolean => /[가-힣][A-Z]$/.test(k);
const stripSuffix = (k: string): string => k.replace(/([가-힣])[A-Z]$/, "$1");
const stripParen = (k: string): string => k.replace(/\(.*?\)/g, "");

// 같은 줄 열쇠(설계 §3.2) — 해|부서|팀|이름|목장|직분 · 칸마다 NFC·띄어쓰기 없음 · 이름은 hKey
export function srcKey(r: { year: number; committee: string; team: string; name: string; mok: string; position: string }): string {
  return [String(r.year), nospace(r.committee), nospace(r.team), hKey(r.name), nospace(r.mok), nospace(r.position)].join("|");
}

// ── 명단 줄 읽기(설계 §4.1) ──────────────────────────────────────────
export type Affil = {
  kind: "교구" | "새가족" | "청년" | "학생" | "모름";
  gu: string; mok: number | null; men: boolean; ttae: number | null;   // ttae = 「NN또래」의 NN
  raw: string;                                                          // 목장 글자(띄어쓰기 없음) — 「같은 목장 글자」 견주기
  notes: string[];
  hinted: boolean;                                                      // 옛 「N-M」 목장을 지금 교구로 읽었다(목장은 모름)
};
const GU_RE = new RegExp("^(" + GU7.join("|") + ")-?(.*)$");
// 목장 → 지금 교구 표의 열쇠 — 해마다 따로(같은 「3-12」라도 해가 다르면 다른 목장일 수 있다)
const hintKey = (year: number, mokText: unknown): string => `${year}|${nospace(mokText)}`;
// hints — matchAll 이 명부와 명단에서 만든 「옛 목장 → 지금 교구」 표(oldMokHints). 없으면 옛 「N-M」 목장은 모름 그대로.
export function parseRow(year: number, mokText: unknown, position: unknown, hints?: Map<string, string>): Affil {
  let t = nospace(mokText);
  const notes: string[] = [];
  for (const [bad, good] of Object.entries(TYPO)) {
    if (t.startsWith(bad)) { t = good + t.slice(bad.length); notes.push("목장 오타 고쳐 읽음"); }
  }
  const a: Affil = { kind: "모름", gu: "", mok: null, men: false, ttae: null, raw: t, notes, hinted: false };
  const m = GU_RE.exec(t);
  if (m) {
    a.kind = "교구"; a.gu = m[1];
    const rest = m[2];
    if (rest.includes("남성")) { a.men = true; a.mok = mokNumber(rest); }
    else if (/^\d+(목장)?$/.test(rest)) a.mok = Number(/^\d+/.exec(rest)![0]);
    // ⚠️ 2025년 이전 명단의 「기쁨-1」은 목장을 모를 때 쓰던 자리 표시로 본다(교구도 모름 · 2026-10-01 검증 · 친구 확인)
    if (year <= 2025 && a.gu === "기쁨" && a.mok === 1 && !a.men) {
      a.kind = "모름"; a.gu = ""; a.mok = null; notes.push("옛 「기쁨-1」은 목장 모름");
    }
    return a;
  }
  if (t === "새가족") { a.kind = "새가족"; a.gu = "새가족"; return a; }
  const tt = /^(?:청년)?(\d{2})또래$/.exec(t);
  if (tt) { a.kind = "청년"; a.ttae = Number(tt[1]); return a; }
  if (t.startsWith("청년")) { a.kind = "청년"; return a; }
  if (t === "학생") { a.kind = "학생"; return a; }
  const p = nfc(position);
  if (p === "청년") a.kind = "청년";
  else if (KID_POS.includes(p)) a.kind = "학생";
  else if (hints && year <= OLD_MOK_LAST_YEAR && OLD_MOK_RE.test(t)) {
    const g = hints.get(hintKey(year, t));
    if (g) { a.kind = "교구"; a.gu = g; a.hinted = true; notes.push("옛 목장의 지금 교구로 읽음"); }
  }
  return a;   // 「2교구 20목장」·「6교구-7」 같은 숫자 교구 · 빈칸 · 「-」 → 모름
}

const cleanPos = (p: unknown): string => { const s = nfc(p); return s === "-" ? "" : s; };
// 직분 → 성별(권사=여 · 장로·안수집사=남 · 남성 목장=남)
export function rowSex(position: unknown, a: Affil): string {
  const p = cleanPos(position);
  if (p.includes("권사")) return "여";
  if (p.includes("장로") || p.includes("안수집사")) return "남";
  if (a.men) return "남";
  return "";
}
// 직분 계급 — 0 없음·성도·청년 / 1 집사·서리집사 / 2 권사·안수집사 / 3 장로 (은퇴·명예·협동·이명은 계급 유지)
export function rank(position: unknown): number {
  const p = cleanPos(position);
  if (p.includes("장로")) return 3;
  if (p.includes("권사") || p.includes("안수집사")) return 2;
  if (p.includes("집사")) return 1;
  return 0;
}
const isKidPos = (p: string): boolean => KID_POS.includes(p);
// 어른 줄 — 직분이 있고(학생·어린이 등 아님) 또는 청년·새가족 줄
const rowAdult = (pos: string, a: Affil): boolean => (pos !== "" && !isKidPos(pos)) || a.kind === "청년" || a.kind === "새가족";

// ── 사람 쪽 판정 ─────────────────────────────────────────────────────
type P = HPerson & { key: string; sex: string; men: boolean; youthKind: boolean };
const ageAt = (c: P, year: number): number | null => (c.birth_year ? year - c.birth_year : null);
const kidAt = (c: P, year: number): boolean => {
  const age = ageAt(c, year);
  return age !== null ? age < 19 : KID_KIND2.includes(c.kind2);
};
function prep(p: HPerson): P {
  const mok3 = nfc(p.mok3);
  return {
    ...p, name: nfc(p.name), kind2: nfc(p.kind2), mok1: nfc(p.mok1), mok3, school_dept: nfc(p.school_dept),
    position: nfc(p.position), position_detail: nfc(p.position_detail),
    key: hKey(p.name), sex: nfc(p.gender).replace(/[^남여]/g, ""), men: /남성/.test(mok3),
    youthKind: (YOUTH_KIND2.includes(nfc(p.kind2)) || YOUTH_MOK1.includes(nfc(p.mok1)) || nfc(p.school_dept) === "청년공동체"),
  };
}

// 같은 소속(설계 §4.3 차례 1) — people-match.ts sameAffiliation 의 교구 규칙(남성 목장 포함) + 새가족·청년·학생
function sameAffil(c: P, a: Affil, year: number): boolean {
  if (a.kind === "교구") {
    if (c.mok1 !== a.gu) return false;
    if (a.men) return !kidAt(c, year) && c.men && (a.mok === null || mokNumber(c.mok3) === a.mok);
    if (a.mok === null) return false;
    return !c.men && mokNumber(c.mok3) === a.mok;
  }
  if (a.kind === "새가족") return c.mok1 === "새가족";
  if (a.kind === "청년") return c.youthKind && !kidAt(c, year);
  // 학생 줄 — 나이 띠(12~19세)는 빼기 단계에서 이미 걸렀다(출생연도 있으면). 생년을 모르면 kind2 로만(장년 추정 금지)
  if (a.kind === "학생") return ageAt(c, year) !== null || KID_KIND2.includes(c.kind2);
  return false;
}

// ── 한 줄 맞추기(1차) ────────────────────────────────────────────────
type Pick = { pid: number | null; basis: string; reason: string; strength: number; notes: string[]; cands: P[] };
const S = { MANUAL: 9, SAME: 5, TIE: 4, CROSS: 4, GU: 2, ONLY: 1, NONE: 0 };

const R_NONE = "교인명부에 같은 이름이 없음";
const R_KID = "교인명부의 같은 이름은 교회학교 학생·직분 없는 청년뿐 — 다른 분으로 봄";
const R_MISFIT = "교인명부의 같은 이름은 직분과 성별(또는 등록일·나이)이 맞지 않음 — 다른 분으로 봄";
const R_CLASH = "같은 해에 다른 교구의 같은 이름 줄이 있고 명부엔 한 분 — 어느 줄인지 못 가림";
export const R_MANUAL_NONE = "이분 아님(담당자 확인)";

type Ctx = {
  byKey: Map<string, P[]>; bySuffixBase: Map<string, P[]>; byGu: Map<string, P[]>; byHousehold: Map<string, P[]>;
  // 같은 해·같은 이름 열쇠·같은 목장 글자 줄이 있는가(가족 근거) — `${year}|${key}|${raw}`
  rowSig: Set<string>;
  // 목장 → 지금 교구 표(oldMokHints) — 해|목장 글자 → 교구
  hints: Map<string, string>;
};

// 목장 → 지금 교구 표(2026-10-04) — 「그 목장 사람들이 지금 어느 교구에 있나」. 2021년까지 줄만 센다.
//   옛 「N-M」 목장(2015년까지)은 이 표로 교구를 읽고(목장은 모름), 이름 교구 목장(2016~2021)은 적힌 교구로 못 가릴 때 보조로 쓴다
//   (그 해들은 교구가 4개 → 6개 → 7개로 바뀌어 적힌 교구가 지금 명부와 57~72%만 맞았다 · 목장 단위 다수는 83~88%).
//   표는 명부에 같은 이름이 어른 한 분뿐인 줄(빼기 전)과 사람이 이은 줄로 센다 — 「이분 아님」 줄은 세지 않는다.
//   ⚠️ 명단 전체로 만든다 — matchAll 은 늘 모든 해·모든 줄로 부른다(history-db rematchHistoryRows · 살펴보기).
function oldMokHints(rows: HRow[], ctx: Omit<Ctx, "hints">, byId: Map<number, P>): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (r.year > LOOSE_LAST_YEAR || r.link_how === "none") continue;
    const t = nospace(r.mok);
    const old = r.year <= OLD_MOK_LAST_YEAR && OLD_MOK_RE.test(t);
    if (!old && !(/\d/.test(t) && parseRow(r.year, t, r.position).kind === "교구")) continue;
    let gu = "";
    if (r.link_how === "manual") gu = byId.get(r.person_id ?? -1)?.mok1 ?? "";
    else {
      const c = (ctx.byKey.get(hKey(r.name)) ?? []).filter((p) => !kidAt(p, r.year) && GU7.includes(p.mok1));
      if (c.length === 1) gu = c[0].mok1;
    }
    if (!GU7.includes(gu)) continue;
    const k = hintKey(r.year, t);
    const m = votes.get(k) ?? new Map<string, number>();
    m.set(gu, (m.get(gu) ?? 0) + 1);
    votes.set(k, m);
  }
  const out = new Map<string, string>();
  for (const [k, m] of votes) {
    const tally = [...m.entries()].sort((x, y) => y[1] - x[1]);
    const total = tally.reduce((s, [, n]) => s + n, 0);
    const [gu, n] = tally[0];
    if (total >= HINT_MIN_VOTES && n / total >= HINT_MIN_SHARE && n > (tally[1]?.[1] ?? 0)) out.set(k, gu);
  }
  return out;
}

function candidatesOf(k: string, ctx: Ctx, notes: string[]): P[] {
  let c = [...(ctx.byKey.get(k) ?? [])];
  if (!hasSuffix(k)) c.push(...(ctx.bySuffixBase.get(k) ?? []));
  if (!c.length && hasSuffix(k)) {
    const b = stripSuffix(k);
    c = [...(ctx.byKey.get(b) ?? []), ...(ctx.bySuffixBase.get(b) ?? [])];
    if (c.length) notes.push("이름 끝 영문자 떼고");
  }
  if (!c.length && k.includes("(")) {
    c = [...(ctx.byKey.get(stripParen(k)) ?? [])];
    if (c.length) notes.push("이름 괄호 떼고");
  }
  const seen = new Set<number>();
  return c.filter((p) => (seen.has(p.person_id) ? false : (seen.add(p.person_id), true)));
}

// 빼기(설계 §4.2) — 다른 분으로 본다. kid=아이·직분 없는 청년 때문에 빠졌는가
// teenIds — 「학생으로 봄」 carve-out 으로 통과한 교인ID 를 모은다(최종 고른 분이 이 중 하나일 때만 결과 근거에 적는다 · matchOne 참고)
function excluded(c: P, r: HRow, a: Affil, pos: string, teenIds: Set<number>): "" | "kid" | "misfit" {
  const y = r.year;
  const sx = rowSex(pos, a);
  if (sx && c.sex && sx !== c.sex) return "misfit";
  if (c.reg_year && c.reg_year > y) return "misfit";
  const age = ageAt(c, y);
  if (a.kind === "학생") {
    if (age !== null && (age < 12 || age > 19)) return "misfit";
  } else if (kidAt(c, y)) {
    if (rowAdult(pos, a)) return "kid";
    // 직분이 빈 교구 줄 — 그해 14세 이상이고 가족 목장 글자가 같은 아이만(부모와 함께 섬기는 도우미)
    const famSame = a.kind === "교구" && c.mok1 === a.gu && !c.men && a.mok !== null && mokNumber(c.mok3) === a.mok;
    if (!(famSame && age !== null && age >= 14)) return "kid";
    teenIds.add(c.person_id);
  }
  // 집사 이상 줄 ↔ 직분 없는 청년·아이(kind2 교회학교·학생 포함 — 낡은 kind2 도) · 검증: 같은 소속 3,294줄 중 반례 0
  if (rank(pos) >= 1 && !c.position && (c.youthKind || KID_KIND2.includes(c.kind2) || kidAt(c, y))) return "kid";
  // 권사·안수집사·장로 줄 ↔ 명부 직분 없음 + 그해 40세 미만(임직은 거꾸로 가지 않고, 강한 맞춤의 권사는 48세·안수집사는 45세 아래가 없다)
  if (rank(pos) >= 2 && !c.position && age !== null && age < 40) return "misfit";
  if (a.kind === "청년" && age !== null && age >= 45) return "misfit";
  if (a.ttae !== null && c.birth_year) {
    const yy = c.birth_year % 100;
    const ok = yy === a.ttae || (yy === (a.ttae + 1) % 100 && (c.birth_month ?? 0) >= 1 && (c.birth_month ?? 0) <= 2);
    if (!ok) return "misfit";
  }
  return "";
}

// 여럿 남았을 때(설계 §4.3 차례 4·5) — 직분 갈래 → 가족이 같은 해 같은 목장 글자
function tieBreak(list: P[], r: HRow, a: Affil, pos: string, ctx: Ctx): { one: P | null; how: string } {
  let cur = list;
  let how = "";
  const fam = pos.includes("권사") ? "권사" : pos.includes("목사") ? "목사" : "";
  if (fam) {
    const f = cur.filter((c) => c.position.includes(fam));
    if (f.length === 1) return { one: f[0], how: "직분으로 가림" };
    if (f.length > 1) cur = f;
  }
  if (a.raw) {
    const h = cur.filter((c) => c.household && (ctx.byHousehold.get(c.household) ?? []).some((m) =>
      m.person_id !== c.person_id && ctx.rowSig.has(`${r.year}|${m.key}|${a.raw}`)));
    if (h.length === 1) return { one: h[0], how: "가족이 같은 해 같은 목장" };
  }
  return { one: null, how };
}

function matchOne(r: HRow, ctx: Ctx): Pick {
  const pos = cleanPos(r.position);
  const a = parseRow(r.year, r.mok, pos, ctx.hints);
  const baseNotes = [...a.notes];
  const teenIds = new Set<number>();   // 「학생으로 봄」으로 통과한 교인ID — 최종 고른 분일 때만 근거에 적는다
  const k = hKey(r.name);
  const all = candidatesOf(k, ctx, baseNotes);
  if (!all.length) return { pid: null, basis: "", reason: R_NONE, strength: S.NONE, notes: baseNotes, cands: [] };
  const why: string[] = [];
  const cands = all.filter((c) => { const e = excluded(c, r, a, pos, teenIds); if (e) why.push(e); return !e; });
  if (!cands.length) {
    return { pid: null, basis: "", reason: why.includes("misfit") ? R_MISFIT : R_KID, strength: S.NONE, notes: baseNotes, cands };
  }
  const mk = (pid: number | null, basis: string, reason: string, strength: number, cands2: P[]): Pick => ({
    pid, basis, reason, strength, cands: cands2,
    notes: pid !== null && teenIds.has(pid) ? [...baseNotes, "학생으로 봄"] : baseNotes,
  });

  const label = a.kind === "청년" ? "같은 구분(청년)" : a.kind === "학생" ? "같은 구분(학생)" : "같은 소속";
  const same = cands.filter((c) => sameAffil(c, a, r.year));
  if (same.length === 1) return mk(same[0].person_id, label, "", S.SAME, cands);
  if (same.length > 1) {
    const t = tieBreak(same, r, a, pos, ctx);
    if (t.one) return mk(t.one.person_id, `${label} · ${t.how}`, "", S.TIE, cands);
    const where = a.kind === "교구" ? "같은 목장" : `같은 소속(${a.kind})`;
    return mk(null, "", `${where}에 같은 이름 ${same.length}명 — 누군지 못 가림`, S.NONE, cands);
  }
  if (a.kind === "교구") {
    // 옛 목장 표로 읽은 교구는 「지금 교구」 어림이라, 그해 직분보다 계급이 낮은 분은 고르지 않는다(임직은 거꾸로 가지 않는다 —
    //   안 그러면 권사 줄이 같은 교구의 집사에게 가 버린다). 그런 분만 남으면 아래 직분 가림이 본다.
    const gu = cands.filter((c) => c.mok1 === a.gu && (!a.hinted || rank(c.position) >= rank(pos)));
    const base = a.mok === null && !a.men ? "같은 교구(목장 모름)" : "같은 교구(목장 다름)";
    const elsewhere = all.some((c) => c.mok1 !== a.gu && !kidAt(c, r.year)) ? " · 다른 교구에 같은 이름" : "";
    if (gu.length === 1) return mk(gu[0].person_id, base + elsewhere, "", S.GU, cands);
    if (gu.length > 1) {
      const t = tieBreak(gu, r, a, pos, ctx);
      if (t.one) return mk(t.one.person_id, `같은 교구 · ${t.how}`, "", S.GU, cands);
      return mk(null, "", `같은 교구에 같은 이름 ${gu.length}명(목장은 명부와 다름) — 누군지 못 가림`, S.NONE, cands);
    }
    // 2021년까지 이름 교구 줄 — 적힌 교구에 아무도 없고 여럿이면, 그 목장 사람들이 지금 있는 교구로 가린다(oldMokHints)
    if (!a.hinted && r.year <= LOOSE_LAST_YEAR && cands.length > 1) {
      const hg = ctx.hints.get(hintKey(r.year, r.mok));
      const h = hg && hg !== a.gu ? cands.filter((c) => c.mok1 === hg && rank(c.position) >= rank(pos)) : [];
      if (h.length === 1) return mk(h[0].person_id, "같은 교구(옛 목장 사람들의 지금 교구)", "", S.GU, cands);
    }
  }
  if (cands.length === 1) {
    return mk(cands[0].person_id, a.kind === "모름" ? "이름이 한 분뿐(소속 모름)" : "이름이 한 분뿐(소속 다름)", "", S.ONLY, cands);
  }
  const t = tieBreak(cands, r, a, pos, ctx);
  if (t.one) return mk(t.one.person_id, `${t.how}(소속 다름)`, "", S.ONLY, cands);
  return mk(null, "", `교인명부에 같은 이름 ${cands.length}명, 적힌 소속과 같은 분이 없음 — 누군지 못 가림`, S.NONE, cands);
}

// ── 팀 이름 다듬기(다른 해 같은 팀) ─────────────────────────────────────
export function teamKey(t: unknown): string {
  let s = nospace(t).replace(/^(사역팀|미취학|아동|청소년)-/, "");
  s = s.replace(/^주일찬양\((\d)부\)$/, "주일$1부찬양");
  return s.replace(/[()]/g, "");
}

// ── 전체 맞추기 ─────────────────────────────────────────────────────
// rows: 맞출 줄과 근거가 될 줄 모두(뺀 줄 제외) · people: 그 이름들의 교인명부(가족 근거를 쓰려면 가족도)
// auto 줄만 결과를 바꾼다 — manual·none 줄은 그대로 돌려주고, manual 은 다른 해 근거로 쓴다.
export function matchAll(rows: HRow[], people: HPerson[]): HResult[] {
  const ps = people.map(prep);
  const ctx: Ctx = { byKey: new Map(), bySuffixBase: new Map(), byGu: new Map(), byHousehold: new Map(), rowSig: new Set(), hints: new Map() };
  const push = (m: Map<string, P[]>, k: string, p: P) => { const l = m.get(k); if (l) l.push(p); else m.set(k, [p]); };
  for (const p of ps) {
    push(ctx.byKey, p.key, p);
    if (hasSuffix(p.key)) push(ctx.bySuffixBase, stripSuffix(p.key), p);
    if (p.mok1) push(ctx.byGu, p.mok1, p);
    if (p.household) push(ctx.byHousehold, p.household, p);
  }
  ctx.hints = oldMokHints(rows, ctx, new Map(ps.map((p) => [p.person_id, p])));
  // 줄 읽기 — 옛 목장 표까지(목장 글자 raw 와 청년 여부는 표와 무관하다 · rowSig·group·sameRowPerson 은 표 없이 읽어도 같다)
  const parse = (r: HRow): Affil => parseRow(r.year, r.mok, r.position, ctx.hints);
  for (const r of rows) ctx.rowSig.add(`${r.year}|${hKey(r.name)}|${parseRow(r.year, r.mok, r.position).raw}`);

  // 1차
  const pick = new Map<number, Pick>();
  for (const r of rows) {
    if (r.link_how === "manual") pick.set(r.id, { pid: r.person_id, basis: "사람이 이음", reason: "", strength: S.MANUAL, notes: [], cands: [] });
    else if (r.link_how === "none") pick.set(r.id, { pid: null, basis: "", reason: R_MANUAL_NONE, strength: S.MANUAL, notes: [], cands: [] });
    else pick.set(r.id, matchOne(r, ctx));
  }
  // id 로 정렬 — 이 차례가 뒤 단계(다른 해로 잇기)에서 반복해 쓰인다. pick 을 도는 중 고쳐 가므로 입력 줄 차례가 그대로면
  // 결과가 입력 순서에 따라 갈릴 수 있다(2026-10-01 검토 지적) — 항상 같은(id) 차례로 돈다.
  const auto = rows.filter((r) => r.link_how === "auto").sort((x, y) => x.id - y.id);
  // anchor = 다른 줄의 근거가 될 만큼 강한 맞춤(같은 소속·직분 가림·다른 해로 이미 이은 것·사람이 이음) — 「같은 팀」·「같은 목장」 두 경로가 같은 문턱을 쓴다
  const isAnchor = (p: Pick): boolean => p.pid !== null && p.strength >= S.TIE;

  // 다른 해로 잇기(설계 §4.4) — 사슬이라 바뀜이 없을 때까지(최대 4번)
  const group = (r: HRow): string => (parseRow(r.year, r.mok, r.position).kind === "청년" ? "청년" : "어른");
  // 이름 끝 영문자(「가나다A」·「가나다B」) — 둘 다 글자가 있고 다르면 다른 사람으로 본다(동명이인 표시). 한쪽만 있으면(붙임말 없는 줄) 잇는다.
  const suffixLetter = (name: unknown): string => { const sk = hKey(name); return hasSuffix(sk) ? sk.slice(-1) : ""; };
  const diffSuffix = (n1: unknown, n2: unknown): boolean => {
    const a1 = suffixLetter(n1), a2 = suffixLetter(n2);
    return a1 !== "" && a2 !== "" && a1 !== a2;
  };
  const sameTeamYear = new Map<string, HRow[]>();
  for (const r of rows) {
    const k = `${r.year}|${teamKey(r.team)}|${stripSuffix(hKey(r.name))}`;
    const l = sameTeamYear.get(k); if (l) l.push(r); else sameTeamYear.set(k, [r]);
  }
  const byName = new Map<string, HRow[]>();
  for (const r of rows) {
    const k = stripSuffix(hKey(r.name));
    const l = byName.get(k); if (l) l.push(r); else byName.set(k, [r]);
  }
  for (let round = 0; round < 4; round++) {
    let changed = 0;
    for (const r of auto) {
      const cur = pick.get(r.id)!;
      if (cur.pid !== null && cur.strength > S.GU) continue;     // 강한 줄은 덮지 않는다(약한 줄·빈 줄만)
      if (!cur.cands.length) continue;                         // 같은 이름이 명부에 없거나 모두 빠졌다
      const allowed = new Set(cur.cands.map((c) => c.person_id));
      const nk = stripSuffix(hKey(r.name));
      const tk = teamKey(r.team);
      const g = group(r);
      const peers = (sameTeamYear.get(`${r.year}|${tk}|${nk}`) ?? []).filter((x) => group(x) === g);
      const found = new Set<number>();
      let how = "";
      if (peers.length === 1) {
        for (const s of byName.get(nk) ?? []) {
          if (Math.abs(s.year - r.year) !== 1 || teamKey(s.team) !== tk || group(s) !== g) continue;
          if (diffSuffix(r.name, s.name)) continue;             // 「가나다A」↔「가나다B」는 안 잇는다
          const later = s.year > r.year ? s : r;
          if (nfc(later.renewal) !== "유지") continue;
          const sp = pick.get(s.id)!;
          if (isAnchor(sp)) found.add(sp.pid!);
        }
        if (found.size) how = "다른 해 같은 팀";
      }
      if (!found.size) {
        // 표 없이 읽는다 — 옛 「N-M」 줄끼리는 예전처럼 「모름·같은 목장 글자」로 잇는다(해마다 표가 달라 한쪽만 교구로 읽히면 못 잇는다)
        const parsed = parseRow(r.year, r.mok, r.position);
        const raw = parsed.raw;
        const pos = cleanPos(r.position);
        for (const s of byName.get(nk) ?? []) {
          if (Math.abs(s.year - r.year) !== 1 || !raw) continue;
          if (diffSuffix(r.name, s.name)) continue;             // 「가나다A」↔「가나다B」는 안 잇는다
          const sParsed = parseRow(s.year, s.mok, s.position);
          // raw 글자만 보면 2025년 이전 「기쁨-1」(자리 표시 · kind 모름)과 2026 진짜 「기쁨-1」목장(kind 교구)이 같은 글자로 겹친다 —
          // 읽은 kind 까지 같아야 잇는다(설계 §4.1 경계).
          if (sParsed.raw !== raw || sParsed.kind !== parsed.kind || cleanPos(s.position) !== pos) continue;
          const sp = pick.get(s.id)!;
          if (isAnchor(sp)) found.add(sp.pid!);
        }
        if (found.size) how = "다른 해 같은 목장";
      }
      if (found.size !== 1) continue;
      const pid = [...found][0];
      if (!allowed.has(pid)) continue;                          // 빼기를 통과한 분이어야 한다
      if (cur.pid === pid) continue;                             // 이미 그분 — 근거는 그대로
      pick.set(r.id, { pid, basis: how, reason: "", strength: S.CROSS, notes: cur.notes, cands: cur.cands });
      changed++;
    }
    if (!changed) break;
  }

  // 오타(설계 §4.5) — 「교인명부에 같은 이름이 없음」 교구 줄만
  //   2021년까지 줄은 느슨하게(2026-10-04) — 목장 모름(옛 목장 표로 읽은 줄 포함)도 보고, 목장 대신 교구만 같으면 된다
  //   (그 해들의 목장 번호는 지금 명부와 거의 안 맞는다). 다른 해 같은 팀에 그분이 강하게 붙어 있어야 하는 것은 같다.
  const anchoredTeams = new Map<number, Set<string>>();       // 교인ID → 붙은 팀(해 포함)
  for (const r of rows) {
    const p = pick.get(r.id)!;
    if (p.pid === null || !isAnchor(p)) continue;
    const s = anchoredTeams.get(p.pid) ?? new Set<string>(); s.add(`${r.year}|${teamKey(r.team)}`); anchoredTeams.set(p.pid, s);
  }
  for (const r of auto) {
    const cur = pick.get(r.id)!;
    if (cur.pid !== null || cur.reason !== R_NONE) continue;
    const a = parse(r);
    const loose = r.year <= LOOSE_LAST_YEAR;
    if (a.kind !== "교구" || (a.mok === null && !a.men && !loose)) continue;
    const k = hKey(r.name);
    const tk = teamKey(r.team);
    const near = (ctx.byGu.get(a.gu) ?? []).filter((c) => {
      if (c.key.length !== k.length || kidAt(c, r.year) || !(loose ? c.mok1 === a.gu : sameAffil(c, a, r.year))) return false;
      let diff = 0;
      for (let i = 0; i < k.length; i++) if (c.key[i] !== k[i]) diff++;
      if (diff !== 1) return false;
      const teams = anchoredTeams.get(c.person_id);
      if (!teams) return false;
      const other = [...teams].some((t) => t.endsWith(`|${tk}`) && !t.startsWith(`${r.year}|`));
      return other && !teams.has(`${r.year}|${tk}`);
    });
    if (near.length === 1 && !excluded(near[0], r, a, cleanPos(r.position), new Set())) {
      pick.set(r.id, { pid: near[0].person_id, basis: "이름 한 글자 다름(오타로 봄)", reason: "", strength: S.ONLY, notes: cur.notes, cands: near });
    }
  }

  // 같은 해 같은 줄 사람 — 오타로 붙은 줄과 해·이름·목장 글자·직분이 같은데 같은 이름이 명부에 없던 줄(팀 이름이 바뀌어 오타 규칙이 못 본 줄)
  const sameRowPerson = (r: HRow): string => `${r.year}|${hKey(r.name)}|${parseRow(r.year, r.mok, r.position).raw}|${cleanPos(r.position)}`;
  const typoBy = new Map<string, Set<number>>();
  for (const r of auto) {
    const p = pick.get(r.id)!;
    if (p.pid !== null && p.basis === "이름 한 글자 다름(오타로 봄)") {
      const k = sameRowPerson(r); const s = typoBy.get(k) ?? new Set<number>(); s.add(p.pid); typoBy.set(k, s);
    }
  }
  for (const r of auto) {
    const p = pick.get(r.id)!;
    if (p.pid !== null || p.reason !== R_NONE) continue;
    const s = typoBy.get(sameRowPerson(r));
    if (s && s.size === 1) pick.set(r.id, { ...p, pid: [...s][0], basis: "이름 한 글자 다름(오타로 봄) · 같은 해 다른 팀 줄과 같은 분", reason: "", strength: S.ONLY });
  }

  // 2021년까지 줄 — 명부에 같은 이름이 여럿이라 못 가린 줄을 두 가지로 더 가린다(2026-10-04 · 둘 다 근거 약함)
  //   ① 다른 해 같은 이름: 다른 해의 같은 이름 줄이 그 후보 가운데 한 분에게만 강하게 붙어 있으면 그분
  //   ② 직분 계급: 임직은 거꾸로 가지 않는다 — 그해 직분 계급 이상인 후보가 한 분뿐이면 그분(집사 이상 줄만)
  for (const r of auto) {
    const cur = pick.get(r.id)!;
    if (r.year > LOOSE_LAST_YEAR || cur.pid !== null || cur.cands.length < 2) continue;
    const allowed = new Set(cur.cands.map((c) => c.person_id));
    const nk = stripSuffix(hKey(r.name));
    const g = group(r);
    const found = new Set<number>();
    for (const s of byName.get(nk) ?? []) {
      if (s.year === r.year || group(s) !== g || diffSuffix(r.name, s.name)) continue;
      const sp = pick.get(s.id)!;
      if (isAnchor(sp) && allowed.has(sp.pid!)) found.add(sp.pid!);
    }
    if (found.size === 1) {
      pick.set(r.id, { ...cur, pid: [...found][0], basis: "다른 해 같은 이름", reason: "", strength: S.ONLY });
      continue;
    }
    const rk = rank(r.position);
    const up = rk >= 1 ? cur.cands.filter((c) => rank(c.position) >= rk) : [];
    if (up.length === 1) pick.set(r.id, { ...cur, pid: up[0].person_id, basis: "직분으로 가림(소속 다름)", reason: "", strength: S.ONLY });
  }

  // 같은 해 겹침(설계 §4.6) — 다른 교구(또는 어른/청년)인 줄이 한 분으로 모이면 약한 쪽을 비운다
  //   옛 목장 표로 읽은 줄은 넣지 않는다 — 표는 「지금 교구」라 그해 교구가 아니다(같은 해 다른 목장 두 줄이 서로를 지우지 않게)
  const sig = (r: HRow): string | null => {
    const a = parse(r);
    if (a.hinted) return null;
    if (a.kind === "교구") return a.gu;
    if (a.kind === "모름") return null;
    return a.kind;
  };
  const byYearPid = new Map<string, HRow[]>();
  for (const r of rows) {
    const p = pick.get(r.id)!;
    if (p.pid === null) continue;
    const k = `${r.year}|${p.pid}`;
    const l = byYearPid.get(k); if (l) l.push(r); else byYearPid.set(k, [r]);
  }
  for (const list of byYearPid.values()) {
    const sigs = new Set(list.map(sig).filter((s): s is string => s !== null));
    if (sigs.size <= 1) continue;
    const best = new Map<string, number>();
    for (const r of list) { const s = sig(r); if (s !== null) best.set(s, Math.max(best.get(s) ?? 0, pick.get(r.id)!.strength)); }
    const top = Math.max(...best.values());
    const winners = [...best.entries()].filter(([, v]) => v === top).map(([s]) => s);
    for (const r of list) {
      const s = sig(r);
      const p = pick.get(r.id)!;
      if (s === null || r.link_how !== "auto") continue;
      if (winners.length > 1 || s !== winners[0]) pick.set(r.id, { ...p, pid: null, basis: "", reason: R_CLASH, strength: S.NONE });
    }
  }

  // 결과 — 메모(목장 오타·영문자·괄호·기쁨-1·학생으로 봄)는 근거 뒤에 · 로, 사유 뒤에는 ( ) 로
  return rows.map((r) => {
    const p = pick.get(r.id)!;
    if (r.link_how !== "auto") return { id: r.id, person_id: r.person_id, match_basis: p.basis, match_reason: p.reason };
    const extra = [...new Set(p.notes)].join(" · ");
    return p.pid !== null
      ? { id: r.id, person_id: p.pid, match_basis: p.basis + (extra ? " · " + extra : ""), match_reason: "" }
      : { id: r.id, person_id: null, match_basis: "", match_reason: p.reason + (extra ? ` (${extra})` : "") };
  });
}

// ── 사람이 잇기·풀기(설계 §7 — 사역 이력 메뉴와 교인명부 자세히 창이 함께 쓴다) ───────────────────────
export function historyLinkPatch(personId: number | null, memberId: string | null, nowIso: string) {
  return {
    person_id: personId, link_how: personId ? "manual" : "none", linked_by: memberId, linked_at: nowIso,
    match_basis: personId ? "사람이 이음" : "", match_reason: personId ? "" : R_MANUAL_NONE, updated_at: nowIso,
  };
}
export function historyUnlinkPatch(nowIso: string) {
  return { link_how: "auto", linked_by: null, linked_at: null, updated_at: nowIso };
}

// ── 서버가 쓰는 도우미(history-db.ts) ───────────────────────────────────
// church_people 에서 읽는 칸 — 맞춤에 쓰는 것만(연락처·주소·사진은 읽지 않는다)
export const HISTORY_PEOPLE_COLS =
  "person_id,name,gender,kind2,mok1,mok3,school_dept,position,position_detail,birth,birth_date,registered,registered_date,household_id";
const yearOf = (s: unknown): number | null => {
  const m = /^(\d{4})/.exec(nfc(s));
  return m && m[1] !== "0000" ? Number(m[1]) : null;
};
const monthOf = (s: unknown): number | null => {
  const m = /^\d{4}-(\d{2})/.exec(nfc(s));
  return m ? Number(m[1]) : null;
};
// church_people 한 줄 → HPerson(생년·등록은 날짜 칸이 있으면 그것, 없으면 원본 글자의 앞 네 자리 · 「0000」은 모름)
export function toHPerson(r: any): HPerson {
  return {
    person_id: Number(r?.person_id), name: nfc(r?.name), gender: nfc(r?.gender), kind2: nfc(r?.kind2),
    mok1: nfc(r?.mok1), mok3: nfc(r?.mok3), school_dept: nfc(r?.school_dept),
    position: nfc(r?.position), position_detail: nfc(r?.position_detail),
    birth_year: yearOf(r?.birth_date) ?? yearOf(r?.birth), birth_month: monthOf(r?.birth_date) ?? monthOf(r?.birth),
    reg_year: yearOf(r?.registered_date) ?? yearOf(r?.registered),
    household: Number(r?.household_id) > 0 ? String(Number(r.household_id)) : "",
  };
}
// 후보 목록의 지문 — 화면에 보인 글자(이름·소속·직분·교적 목장)로만 만든다(교인ID 를 넣지 않는다 — 사역신청 역할에게 가는 값이라
//   교인ID 로 만들면 몇 안 되는 후보의 ID 를 거꾸로 찾아낼 수 있다). FNV-1a 32비트 · 16진 8자리.
export function candFp(lines: string[]): string {
  let h = 0x811c9dc5;
  const s = lines.join("\n");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
// 근거가 약한 맞춤 — 화면의 「△ 확인」·「근거 약한 줄만」(history-logic.js WEAK_RE 와 같은 글 · 시험이 맞댄다)
export const WEAK_RE = /^(같은 교구|이름이 한 분뿐|직분으로 가림\(소속 다름\)|가족이 같은 해 같은 목장\(소속 다름\)|다른 해|이름 한 글자 다름)/;
// 같은 이름의 명부 열쇠들 — church_people.name_key(NFC·띄어쓰기 없음 · 끝 영문자는 원본 그대로)로 물을 것
// candidatesOf 의 hasSuffix 는 영문자 A~Z 아무거나 받는다(동명이인 표시 「홍길동a」~「홍길동z」) — 서버 후보 창이
// matchAll 이 실제로 고를 수 있는 분을 전부 담도록 A~D 만이 아니라 A~Z(대·소문자) 모두 더한다.
export function nameKeyVariants(name: unknown): string[] {
  const k = hKey(name);
  const base = stripSuffix(k);
  const out = new Set<string>([k, base, stripParen(k)]);
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    out.add(base + c); out.add(base + c.toLowerCase());
  }
  return [...out].filter(Boolean);
}
