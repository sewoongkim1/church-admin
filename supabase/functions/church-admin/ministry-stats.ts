// 교회 어드민 — 📊 사역 통계: 세는 규칙(순수 함수 · 2026-10-06)
//   설계 v2 docs/superpowers/specs/2026-10-06-ministry-stats-design.md §4·§5. 서버(Deno, index.ts)와 시험(Node)이 **같은 파일**을 읽는다.
//   ⚠️ Deno 전용 API·원격 import·enum 을 쓰지 않는다 — node --experimental-strip-types 가 그대로 읽어야 한다.
//   재료(facts)는 SQL ministry_stats_facts() 가 준다. 사람은 **그 부름 안에서만 뜻이 있는 번호**다(교인ID·이름이 아니다).
//   ⚠️ 여기서 나가는 것은 묶음 숫자와 부서·팀 이름뿐이다 — 사람 번호·태어난 해를 응답에 싣지 않는다(시험이 지킨다).
//   ⚠️ 세는 법을 바꾸면 화면의 「세는 법」 글(js/menus/ministry/stats-logic.js HOW)과 설계 §5 도 함께.

export type Facts = {
  years?: number[];
  map: [string, string, string, string][];             // [큰 분류, 계열, 중분류, 표준 팀] — 번호 = 자리
  seats: [number, number, number][];                   // [사람 번호, 해, map 번호] — 사역 이력 한 줄
  people: [string, number | null, string, string][];   // [종류 m 교인·g 떠난 분·u 아직 못 정함, 태어난 해, 성별, 직분 글자] — 번호 = 사람 번호
  gaps?: [string, number, number | null][];            // 명단이 일부인 해 [scope, 시작 해, 끝 해(null = 계속)]
  unmapped?: [string, string, number][];               // 이음표에 없는 [부서 원문, 팀 원문, 줄 수]
  source_date?: string | null;                         // 교인명부 기준일
};

export const THREE = ["찬양", "교회학교", "그 밖"];                    // 「전체」 = 이 셋(사역 자리) — 목양·기관은 따로
export const GROUPS = ["찬양", "교회학교", "그 밖", "목양", "기관"];
export const ALL = "all3";
export const AGE_BANDS = ["39세까지", "40대", "50대", "60대", "70세부터", "모름"];
export const SEXES = ["남", "여", "모름"];
export const POSITIONS = ["장로", "안수집사", "권사", "집사", "그 밖", "모름"];
export const KEEP_MIN = 5;      // 견준 해 봉사자가 이보다 적으면 유지율을 내지 않는다
export const DEMO_MIN = 30;     // 그 해 봉사자가 이보다 적으면 나이·성별·직분을 내지 않는다
export const MASK_BELOW = 5;    // 나이·성별·직분 칸이 1 이상 이 수 미만이면 가린다
export const MASKED = -1;       // 가린 칸(화면 「5 미만」)

// 직분 글자 → 칸. 은퇴·명예·협동·서리가 붙어도 같은 칸(「은퇴안수집사」→안수집사 · 「서리집사」→집사). 차례가 뜻이다 — 「안수집사」를 「집사」보다 먼저.
export function positionBucket(s: unknown): string {
  const t = String(s ?? "").normalize("NFC").replace(/\s+/g, "");
  if (!t || t === "-") return "모름";
  if (t.includes("장로")) return "장로";
  if (t.includes("안수집사")) return "안수집사";
  if (t.includes("권사")) return "권사";
  if (t.includes("집사")) return "집사";
  return "그 밖";
}

// 그 해 나이 → 나이대. 태어난 해를 모르거나 이치에 안 맞으면(0 미만·120 초과) 「모름」.
export function ageOf(year: number, birthYear: number | null | undefined): number | null {
  if (birthYear === null || birthYear === undefined || !Number.isFinite(Number(birthYear))) return null;
  const a = year - Number(birthYear);
  return a < 0 || a > 120 ? null : a;
}
export function ageBand(age: number | null): string {
  if (age === null) return "모름";
  if (age < 40) return "39세까지";
  if (age < 50) return "40대";
  if (age < 60) return "50대";
  if (age < 70) return "60대";
  return "70세부터";
}

const mask = (n: number): number => (n > 0 && n < MASK_BELOW ? MASKED : n);
const groupKey = (g: string): string => "g:" + g;
const familyKey = (f: string): string => "f:" + f;

// 한 자리가 드는 단위 — 그 큰 분류 · 그 계열 · (찬양·교회학교·그 밖이면) 전체
function unitsOf(m: [string, string, string, string]): string[] {
  const u = [groupKey(m[0]), familyKey(m[1])];
  if (THREE.includes(m[0])) u.push(ALL);
  return u;
}

export type Row = {
  year: number; seats: number; people: number; multi: number; gap: boolean;
  prev: number | null; base: number | null;
  stay: number | null; back: number | null; first: number | null; firstEver: number | null; firstOther: number | null;
  left: number | null; moved: number | null; rest: number | null; gone: number | null; keep: number | null;
  demo: null | { ageAvg: number | null; bands: number[]; sex: number[]; position: number[] };
};

export function buildStats(f: Facts) {
  const map = f.map || [], seats = f.seats || [], people = f.people || [];
  const years = [...new Set([...(f.years || []), ...seats.map((s) => s[1])])].sort((a, b) => a - b);
  const gaps = (f.gaps || []).map(([scope, from, to]) => ({ scope: String(scope), from: Number(from), to: to === null || to === undefined ? null : Number(to) }));

  // 단위 → 해 → (사람 → 자리 수)
  const present = new Map<string, Map<number, Map<number, number>>>();
  const seatN = new Map<string, Map<number, number>>();
  const anyYear = new Map<number, Set<number>>();          // 해 → 다섯 분류 어디든 한 자리라도 있는 사람
  const famGroup = new Map<string, Map<string, number>>(); // 계열 단위 → 큰 분류별 자리 수(계열이 속한 큰 분류를 고른다)
  const bump = <K>(m: Map<K, number>, k: K, n = 1) => m.set(k, (m.get(k) || 0) + n);
  for (const [p, y, mi] of seats) {
    const m = map[mi];
    if (!m) continue;
    if (!anyYear.has(y)) anyYear.set(y, new Set());
    anyYear.get(y)!.add(p);
    for (const u of unitsOf(m)) {
      if (!present.has(u)) { present.set(u, new Map()); seatN.set(u, new Map()); }
      const py = present.get(u)!;
      if (!py.has(y)) py.set(y, new Map());
      bump(py.get(y)!, p);
      bump(seatN.get(u)!, y);
    }
    const fk = familyKey(m[1]);
    if (!famGroup.has(fk)) famGroup.set(fk, new Map());
    bump(famGroup.get(fk)!, m[0]);
  }
  const groupOf = (u: string): string => {
    if (!u.startsWith("f:")) return u;
    const by = [...(famGroup.get(u) || new Map()).entries()].sort((a, b) => b[1] - a[1]);
    return by.length ? groupKey(by[0][0]) : u;
  };
  const isGap = (u: string, y: number): boolean => {
    const g = groupOf(u);
    return gaps.some((r) => (r.scope === "*" || r.scope === u || (u.startsWith("f:") && r.scope === g)) && y >= r.from && (r.to === null || y <= r.to));
  };

  // 어느 사역이든 그 해 앞에 한 적이 있는 사람(「사역이 처음」을 가른다) — 해를 차례로 훑으며 쌓는다
  const servedBeforeAt = new Map<number, Set<number>>();
  { const acc = new Set<number>(); for (const y of years) { servedBeforeAt.set(y, new Set(acc)); for (const p of anyYear.get(y) || []) acc.add(p); } }

  const demoOf = (y: number, ps: Iterable<number>, n: number): Row["demo"] => {
    if (n < DEMO_MIN) return null;
    const bands = AGE_BANDS.map(() => 0), sex = SEXES.map(() => 0), pos = POSITIONS.map(() => 0);
    let ageSum = 0, ageN = 0;
    for (const p of ps) {
      const who = people[p] || ["u", null, "", ""];
      const a = who[0] === "m" ? ageOf(y, who[1]) : null;      // 나이·성별은 교인명부에 있는 분만 — 떠난 분·못 정한 분은 「모름」
      bands[AGE_BANDS.indexOf(ageBand(a))]++;
      if (a !== null) { ageSum += a; ageN++; }
      const sx = who[0] === "m" && (who[2] === "남" || who[2] === "여") ? who[2] : "모름";
      sex[SEXES.indexOf(sx)]++;
      pos[POSITIONS.indexOf(positionBucket(who[3]))]++;
    }
    return { ageAvg: ageN >= MASK_BELOW ? Math.round(ageSum * 10 / ageN) / 10 : null, bands: bands.map(mask), sex: sex.map(mask), position: pos.map(mask) };
  };

  const units: Record<string, { label: string; group: string; rows: Row[] }> = {};
  for (const u of present.keys()) {
    const py = present.get(u)!, sn = seatN.get(u)!;
    const dataYears = [...py.keys()].sort((a, b) => a - b);
    const seen = new Set<number>();                          // 이 단위에서 그 해 앞에 한 번이라도 있던 사람
    const rows: Row[] = [];
    for (const y of years) {
      const P = py.get(y) || new Map<number, number>();
      const gap = isGap(u, y);
      const prevs = dataYears.filter((q) => q < y && !isGap(u, q));
      const prev = prevs.length ? prevs[prevs.length - 1] : null;
      const row: Row = { year: y, seats: sn.get(y) || 0, people: P.size, multi: [...P.values()].filter((n) => n >= 2).length, gap,
        prev: null, base: null, stay: null, back: null, first: null, firstEver: null, firstOther: null,
        left: null, moved: null, rest: null, gone: null, keep: null, demo: demoOf(y, P.keys(), P.size) };
      if (prev !== null && P.size) {
        const Q = py.get(prev)!, served = servedBeforeAt.get(y)!, here = anyYear.get(y) || new Set<number>();
        let stay = 0, back = 0, firstEver = 0, firstOther = 0, moved = 0, rest = 0, gone = 0;
        for (const p of P.keys()) {
          if (Q.has(p)) stay++;
          else if (seen.has(p)) back++;
          else if (served.has(p)) firstOther++;
          else firstEver++;
        }
        for (const p of Q.keys()) {
          if (P.has(p)) continue;
          if (here.has(p)) moved++;
          else if ((people[p] || [])[0] === "g") gone++;
          else rest++;
        }
        Object.assign(row, { prev, base: Q.size, stay, back, first: firstEver + firstOther, firstEver, firstOther,
          left: moved + rest + gone, moved, rest, gone, keep: Q.size >= KEEP_MIN ? Math.round(stay * 100 / Q.size) : null });
      }
      rows.push(row);
      for (const p of P.keys()) seen.add(p);
    }
    const label = u === ALL ? "전체" : u.slice(2);
    units[u] = { label, group: u === ALL ? ALL : groupOf(u), rows };
  }

  // 안쪽 나눔 — 중분류가 있는 계열(찬양 · 교회학교 · 부설기관)의 중분류·표준 팀 × 해 자리 수. 계열이 하나뿐인 큰 분류는 그 열쇠로도 싣는다.
  const inner: Record<string, { mids: { label: string; seats: number[] }[]; teams: { label: string; mid: string; seats: number[] }[] }> = {};
  const yi = new Map(years.map((y, i) => [y, i] as [number, number]));
  const famMids = new Map<string, Map<string, number[]>>(), famTeams = new Map<string, Map<string, number[]>>();
  for (const [, y, mi] of seats) {
    const m = map[mi];
    if (!m) continue;
    const fk = familyKey(m[1]);
    if (!famMids.has(fk)) { famMids.set(fk, new Map()); famTeams.set(fk, new Map()); }
    const add = (mm: Map<string, number[]>, k: string) => { if (!mm.has(k)) mm.set(k, years.map(() => 0)); mm.get(k)![yi.get(y)!]++; };
    add(famMids.get(fk)!, m[2]);
    add(famTeams.get(fk)!, m[2] + "\u0000" + m[3]);
  }
  const total = (a: number[]) => a.reduce((s, n) => s + n, 0);
  for (const [fk, mids] of famMids) {
    if (![...mids.keys()].some((k) => k !== "")) continue;
    inner[fk] = {
      mids: [...mids.entries()].sort((a, b) => total(b[1]) - total(a[1])).map(([label, s]) => ({ label, seats: s })),
      teams: [...famTeams.get(fk)!.entries()].sort((a, b) => total(b[1]) - total(a[1]))
        .map(([k, s]) => ({ label: k.split("\u0000")[1], mid: k.split("\u0000")[0], seats: s })),
    };
  }
  for (const g of GROUPS) {
    const fams = [...famGroup.keys()].filter((fk) => groupOf(fk) === groupKey(g));
    if (fams.length === 1 && inner[fams[0]]) inner[groupKey(g)] = inner[fams[0]];
  }

  // 덧붙임 — 이음표에 없는 줄 · 아직 못 정한 줄 · 떠난 분 수(묶음)
  const used = new Set(seats.map((s) => s[0]));
  let unsureSeats = 0;
  for (const [p] of seats) if ((people[p] || [])[0] === "u") unsureSeats++;
  const kindCount = (k: string) => [...used].filter((p) => (people[p] || [])[0] === k).length;
  const unmapped = (f.unmapped || []).map(([committee, team, n]) => ({ committee: String(committee ?? ""), team: String(team ?? ""), n: Number(n) || 0 }));
  return {
    years, sourceDate: f.source_date ?? null, units, inner,
    meta: { unmapped, unmappedSeats: unmapped.reduce((s, x) => s + x.n, 0), unsureSeats, unsurePeople: kindCount("u"), gonePeople: kindCount("g"),
      gaps: gaps.map((g) => ({ scope: g.scope, from: g.from, to: g.to })) },
  };
}
