// 교인명부 — 찾기 조건 풀기 · 현황 세기(순수 함수 · 2026-09-29). authz.ts 와 같은 제약.
import { MATCH_GU } from "./people-match.ts";

export const PAGE_SIZE = 50;    // 목록 한 쪽
export const PHOTO_TTL = 600;   // 사진 주소 만료(초) — 새어 나가도 10분 뒤 닫힌다

export type Search = {
  name: string; tail: string; mok1: string; kind2: string; kind3: string; position: string; noPhoto: boolean;
  household: number | null;   // 가족 보기 — 신앙세대주의 교인ID
  page: number;
};

const clean = (s: unknown, max = 20): string => String(s ?? "").normalize("NFC").trim().slice(0, max);

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
  return { ok: true, s: { name, tail, mok1: clean(b?.mok1), kind2: clean(b?.kind2), kind3: clean(b?.kind3),
    position: clean(b?.position), noPhoto: b?.noPhoto === true, household, page } };
}

// 열람 기록에 남길 거르기 — 빈 것은 뺀다
export function searchDetail(s: Search): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const k of ["mok1", "kind2", "kind3", "position"] as const) if (s[k]) out[k] = s[k];
  if (s.noPhoto) out.noPhoto = true;
  if (s.household) out.household = String(s.household);
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
  };
}
