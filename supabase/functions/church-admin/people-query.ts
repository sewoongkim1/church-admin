// 교인명부 — 찾기 조건 풀기 · 현황 세기(순수 함수 · 2026-09-29). authz.ts 와 같은 제약.
import { MATCH_GU } from "./people-match.ts";

export const PAGE_SIZE = 50;    // 목록 한 쪽
export const PHOTO_TTL = 600;   // 사진 주소 만료(초) — 새어 나가도 10분 뒤 닫힌다

// 거르기 넷(교구·구분·출석·직분)은 여러 개 — 빈 배열이면 거르지 않는다(2026-09-29 체크박스)
export const FILTER_KEYS = ["mok1", "kind2", "kind3", "position"] as const;
export const FILTER_MAX = 50;   // 한 거르기에 고를 수 있는 값 — 가장 긴 목록(직분·교구)도 이보다 짧다

// 정렬(2026-09-29 표 머리 누르기) — 화면 people-logic.js SORTS 와 같은 차례. 기본은 이름 오름.
export const SORT_KEYS = ["name", "age", "aff", "kind2"] as const;
export type SortKey = typeof SORT_KEYS[number];
export type Dir = "asc" | "desc";

export type Search = {
  name: string; tail: string; mok1: string[]; kind2: string[]; kind3: string[]; position: string[]; noPhoto: boolean;
  household: number | null;   // 가족 보기 — 신앙세대주의 교인ID
  page: number;
  sort: SortKey; dir: Dir;
};

const clean = (s: unknown, max = 20): string => String(s ?? "").normalize("NFC").trim().slice(0, max);

// 거르기 값 목록 — 문자열 하나(옛 화면)는 한 칸짜리로. 값마다 NFC·trim·20자, 빈 값·겹침은 뺀다.
// ⚠️ supabase-js .in() 은 , ( ) 는 따옴표로 싸 주지만 " 와 \ 는 이스케이프하지 않는다 — 그런 값은 받지 않는다.
//    괄호가 든 값(「청년(대예배출석)」)은 실제로 있으니 받아야 한다.
function cleanList(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  const raw = typeof v === "string" ? [v] : Array.isArray(v) ? v : null;
  if (!raw || raw.length > FILTER_MAX * 4) return null;   // 겹침·빈 값을 감안해도 이보다 길 까닭이 없다 — 훑지 않고 막는다
  const out = new Set<string>();
  for (const x of raw) {
    if (x === null || x === undefined) continue;
    if (typeof x !== "string") return null;
    const t = x.normalize("NFC");
    if (t.includes('"') || t.includes("\\")) return null;
    const c = clean(t);
    if (!c) continue;
    out.add(c);
    if (out.size > FILTER_MAX) return null;               // 한도를 넘는 즉시 멈춘다
  }
  return [...out];
}

// 정렬 값 — 없거나 빈 값은 기본, 모르는 값은 null(invalid)
function pick<T extends string>(v: unknown, allowed: readonly T[], dflt: T): T | null {
  if (v === undefined || v === null || v === "") return dflt;
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? v as T : null;
}

// 검색어 하나로 이름과 전화 뒷자리를 가른다 — 숫자(띄어쓰기·- 빼고)만 4~11자리면 전화, 그 밖은 이름.
// 이름은 한글·영문·숫자·- 만 남긴다(ilike 의 % _ 가 사용자 글자로 들어가지 않게).
export function parseSearch(b: any): { ok: true; s: Search } | { ok: false; error: string } {
  const raw = clean(b?.q, 40);
  const digits = raw.replace(/[\s-]/g, "");
  const tail = /^\d{4,11}$/.test(digits) ? digits : "";
  const name = tail ? "" : raw.replace(/[^가-힣A-Za-z0-9-]/g, "");   // - 는 남긴다(시험 이름 ca-test-… · ilike 에 무해)
  const page = b?.page === undefined || b?.page === null ? 0 : Number(b.page);
  if (!Number.isSafeInteger(page) || page < 0 || page > 1000) return { ok: false, error: "invalid" };
  const hv = b?.household;
  const household = hv === undefined || hv === null || hv === "" ? null : Number(hv);
  if (household !== null && (!Number.isSafeInteger(household) || household <= 0)) return { ok: false, error: "invalid" };
  const sort = pick(b?.sort, SORT_KEYS, "name");
  const dir = pick(b?.dir, ["asc", "desc"] as const, "asc");
  if (!sort || !dir) return { ok: false, error: "invalid" };
  const f: Record<string, string[]> = {};
  for (const k of FILTER_KEYS) {
    const list = cleanList(b?.[k]);
    if (!list) return { ok: false, error: "invalid" };
    f[k] = list;
  }
  return { ok: true, s: { name, tail, mok1: f.mok1, kind2: f.kind2, kind3: f.kind3, position: f.position,
    noPhoto: b?.noPhoto === true, household, page, sort, dir } };
}

// 정렬 차례 — [칸, 옵션] 목록(supabase-js .order 에 그대로). 쪽 넘기기·내려받기가 같은 것을 쓴다.
// 마지막은 늘 person_id — 같은 값끼리 쪽마다 차례가 흔들려 한 분이 두 쪽에 나오거나 빠지지 않게.
// 나이 모르는 분은 오름·내림 모두 맨 뒤(nullsFirst:false — Postgres 는 내림에서 null 을 맨 앞에 둔다).
// ⚠️ 소속·구분은 그렇게 못 한다 — mok1·mok3·school_dept·kind2·kind3 칸은 null 이 아니라 빈 글자('' · not null default '')라
//   nullsFirst 가 듣지 않는다. 그래서 빈 분(교회학교만 있는 분 · 구분 없는 분)은 오름에서 맨 앞, 내림에서 맨 뒤다(오름의 정확한 역순).
//   「빈 분은 늘 맨 뒤」로 맞추려면 칸을 하나 더 만들어야 한다(예: 생성 칸 mok1 = '' 을 먼저 정렬) — 표를 바꾸는 일이라 따로 정한다.
type Order = [string, { ascending: boolean; nullsFirst?: boolean }];
export function sortOrder(s: Search): Order[] {
  const d = { ascending: s.dir === "asc" }, A = { ascending: true };
  const head: Order[] =
    s.sort === "age" ? [["age", { ...d, nullsFirst: false }], ["name_key", A]]
    : s.sort === "aff" ? [["mok1", d], ["mok3", d], ["school_dept", d], ["name_key", A]]
    : s.sort === "kind2" ? [["kind2", d], ["kind3", d], ["name_key", A]]
    : [["name_key", d]];
  return [...head, ["person_id", A]];
}

// 열람 기록에 남길 거르기 — 빈 것은 뺀다. 여러 개는 배열 그대로(바꾼 기록 화면이 「기쁨·소망」으로 잇는다)
export function searchDetail(s: Search): Record<string, string[] | string | boolean> {
  const out: Record<string, string[] | string | boolean> = {};
  for (const k of FILTER_KEYS) if (s[k].length) out[k] = [...s[k]];
  if (s.noPhoto) out.noPhoto = true;
  if (s.household) out.household = String(s.household);
  if (s.sort !== "name" || s.dir !== "asc") { out.sort = s.sort; out.dir = s.dir; }   // 기본 정렬은 남기지 않는다
  return out;
}

export const AGE_BANDS = ["10살 아래", "10대", "20대", "30대", "40대", "50대", "60대", "70대", "80살 이상", "모름"];
export function ageBand(age: unknown): string {
  if (age === null || age === undefined || age === "") return "모름";
  const n = Number(age);
  if (!Number.isFinite(n) || n < 0 || n > 120) return "모름";
  if (n < 10) return "10살 아래";
  if (n >= 80) return "80살 이상";
  return `${Math.floor(n / 10) * 10}대`;
}

type Pair = [string, number];
const NONE = "(없음)";
function countBy(rows: any[], f: (r: any) => string): Pair[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = f(r) || NONE; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}
const guRank = (g: string) => { const i = MATCH_GU.indexOf(g); return i < 0 ? 99 : i; };

// 성별 칸 — 연령대 표의 남·여·모름(「남」「여」가 아니면 모두 모름)
export const SEXES = ["남", "여", "모름"];
const sexIndex = (g: unknown) => (g === "남" ? 0 : g === "여" ? 1 : 2);

// 거르기용 숫자 묶음(2026-09-30 친구 요청 「교구별·직분별 출석 필터 · 연령별 성별 출석 및 교구 필터」).
// 화면(js/menus/people/stats-logic.js)이 출석·교구를 고를 때마다 이것으로 표를 **다시 센다** — 서버를 다시 부르지 않는다.
//   dict = 값 사전(칸마다 목록) · 줄 = [값 번호…, 인원]. 번호는 dict 의 그 칸 목록 자리다.
//     gu       [교구, 목장, 출석, 인원]   — 목장 수는 더할 수 없는 값이라(출석 둘을 고르면 겹치는 목장) 목장 칸까지 둔다
//     position [직분, 출석, 인원]
//     age      [연령대, 성별, 출석, 교구, 인원] — 연령대는 dict.band(= AGE_BANDS) · 성별은 dict.sex(= SEXES) 자리
//   dict.gu·kind3·position 은 아래 gu·kind3·position 표와 같은 차례(화면이 교구 차례를 그대로 쓴다).
//   교구 없음은 「(목장 없음)」, 출석·직분 없음은 「(없음)」, 목장 없음은 빈 글자 ""(목장 수에 안 센다) — 위 표들과 같은 규칙.
// ⚠️ 숫자·분류 값만 — 이름·연락처·교인ID·세대주 번호를 넣지 않는다(tests/people-query.test.mjs 가 JSON 을 훑는다).
// ⚠️ 거르기 없이 다시 센 결과가 gu·position·age 와 **똑같아야** 한다(tests/people-stats.test.mjs 가 대조한다) —
//   위 표의 규칙(교구·출석 없음 이름, 목장 빈 글자 빼기, ageBand)을 바꾸면 여기도 함께.
function factsOf(rows: any[], guOrder: string[], kind3Order: string[], positionOrder: string[]) {
  const mok: string[] = [], mokAt = new Map<string, number>();
  const at = (list: string[]) => new Map(list.map((v, i) => [v, i]));
  const guAt = at(guOrder), k3At = at(kind3Order), posAt = at(positionOrder), bandAt = at(AGE_BANDS);
  const mokIndex = (m: string) => {
    if (!mokAt.has(m)) { mokAt.set(m, mok.length); mok.push(m); }
    return mokAt.get(m)!;
  };
  const gu = new Map<string, number>(), position = new Map<string, number>(), age = new Map<string, number>();
  const add = (m: Map<string, number>, key: number[]) => { const k = key.join(","); m.set(k, (m.get(k) ?? 0) + 1); };
  for (const r of rows) {
    const g = guAt.get(r.mok1 || "(목장 없음)")!, k = k3At.get(r.kind3 || NONE)!;
    add(gu, [g, mokIndex(r.mok3 || ""), k]);
    add(position, [posAt.get(r.position || NONE)!, k]);
    add(age, [bandAt.get(ageBand(r.age))!, sexIndex(r.gender), k, g]);
  }
  const lines = (m: Map<string, number>) => [...m.entries()].map(([k, n]) => [...k.split(",").map(Number), n]);
  return {
    dict: { gu: guOrder, mok, kind3: kind3Order, position: positionOrder, band: AGE_BANDS, sex: SEXES },
    gu: lines(gu), position: lines(position), age: lines(age),
  };
}

// 숫자만 — 이름·연락처는 담지 않는다
export function statsOf(rows: any[]) {
  const byGu = new Map<string, { n: number; moks: Set<string> }>();
  for (const r of rows) {
    const g = r.mok1 || "(목장 없음)";
    if (!byGu.has(g)) byGu.set(g, { n: 0, moks: new Set() });
    const x = byGu.get(g)!;
    x.n++;
    if (r.mok3) x.moks.add(r.mok3);
  }
  const gu = [...byGu.entries()].map(([g, v]) => ({ gu: g, n: v.n, moks: v.moks.size }))
    .sort((a, b) => guRank(a.gu) - guRank(b.gu) || b.n - a.n || a.gu.localeCompare(b.gu, "ko"));
  const kind2 = countBy(rows, (r) => r.kind2);
  const kind3 = countBy(rows, (r) => r.kind3);
  const position = countBy(rows, (r) => r.position);
  const age = AGE_BANDS.map((band) => {
    const inB = rows.filter((r) => ageBand(r.age) === band);
    return { band, m: inB.filter((r) => r.gender === "남").length, f: inB.filter((r) => r.gender === "여").length,
      x: inB.filter((r) => r.gender !== "남" && r.gender !== "여").length };
  });
  const keys = (pairs: Pair[]) => pairs.map(([k]) => k).filter((k) => k !== NONE);
  return {
    total: rows.length,
    noPhoto: rows.filter((r) => !r.has_photo).length,
    households: new Set(rows.map((r) => r.household_id).filter(Boolean)).size,   // 신앙세대주 교인ID 기준
    gu, kind2, kind3, position,
    school: countBy(rows.filter((r) => r.school_dept), (r) => r.school_dept),
    age,
    options: { mok1: gu.map((g) => g.gu).filter((g) => g !== "(목장 없음)"), kind2: keys(kind2), kind3: keys(kind3), position: keys(position) },
    facts: factsOf(rows, gu.map((g) => g.gu), kind3.map(([k]) => k), position.map(([k]) => k)),
  };
}
