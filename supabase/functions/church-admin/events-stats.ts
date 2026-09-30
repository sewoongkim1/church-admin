// 성경필사(암송) — 사람 묶음(합집합) · 통계 · 빠른 고르기(순수 함수 · 2026-09-29)
//   설계: 성경암송 저장소 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §2
//   「사람 묶음(이력·통계) — 근삿값임을 화면에 적는다」 · 「통계의 빠른 고르기」.
//   서버(Deno, index.ts)와 시험(Node, tests/events-stats.test.mjs)이 **같은 파일**을 읽는다(authz.ts 와 같은 제약).
//
// ⚠️ 묶음 이름표는 **순번**만 쓴다. user_id 를 이름표·열쇠로 응답에 실으면 그것 하나로 그분 행세가 된다
//    (성경암송 api 는 JWT 없이 user_id 를 믿는다 — CLAUDE.md 「보안」).
// ⚠️ index.ts 는 이미 people-query.ts 의 statsOf(교인명부 현황)를 들여온다 — 이 파일의 statsOf 는
//    `import { statsOf as eventStatsOf } from "./events-stats.ts"` 로만 들여온다(CONTRACT §5).
import { BE_GU } from "./events-rules.ts";
import { legacyNorm } from "./paper.ts";
import { nameKey } from "./people-match.ts";

export type StatIn = { event_id: string; user_id: string | null; who_type: string; group_name: string; sub_name: string; name: string; position: string };

// 다듬은 신원 — 구분 · 소속(NFC·띄어쓰기 없음) · 목장 숫자(「07」·「7목장」→7 · 「남성」) · 이름(NFC·띄어쓰기 없음).
// 교회학교는 학년을 넣지 않는다 — 해마다 바뀌고 표기도 제각각이라(「1」·「1학년」·빈칸) 같은 아이가 해마다 갈라진다.
export function personKey(r: { who_type: string; group_name: string; sub_name: string; name: string }): string {
  const who = legacyNorm(r.who_type);
  let sub = "";
  if (who !== "교회학교") {
    const s = nameKey(r.sub_name);
    const m = /^(\d+)(목장)?$/.exec(s);
    sub = /남성/.test(s) ? "남성" : m ? m[1].replace(/^0+(?=\d)/, "") : s;
  }
  return [who, nameKey(r.group_name), sub, nameKey(r.name)].join("|");
}

// 소속 한 줄(**소속만** — 이름은 넣지 않는다) — 서버 evWho(Task 5 index.ts)와 글자까지 같은 규칙:
//   교구 줄은 목장이 숫자일 때만 「목장」 · 소속(교구·부서)이 비면 「(소속 없음)」.
//   「화평 20목장」 · 「소망 남성」 · 「새가족」 · 「중등부」 · 「중등부 3학년」 · 「(소속 없음)」
//   통계의 repeaters[].label 과 이력(evHistory)의 groups[].label(`${이름} · ${소속}`)이 같은 글자를 쓰게 — CONTRACT §5.
export function affLabel(r: { who_type: string; group_name: string; sub_name: string }): string {
  const g = legacyNorm(r.group_name), s = legacyNorm(r.sub_name);
  if (!g) return "(소속 없음)";
  if (legacyNorm(r.who_type) === "교구" && /^\d+$/.test(s)) return g + " " + s + "목장";
  return s ? g + " " + s : g;
}

// 줄마다 사람 묶음 순번(0부터, 처음 나온 차례). **user_id 가 같거나 다듬은 신원이 같으면** 한 묶음 —
// 합집합이라 「계정 없던 해(이관 줄) — 계정 있는 해(앱 줄)」가 한 사람으로 이어진다.
// 같은 분이 해마다 목장을 옮겼으면 둘로 셀 수 있다(근삿값 — 화면에 적는다).
export function personGroups(rows: StatIn[]): number[] {
  const parent = rows.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const join = (a: number, b: number): void => {
    const x = find(a), y = find(b);
    if (x !== y) parent[Math.max(x, y)] = Math.min(x, y);
  };
  const byUser = new Map<string, number>(), byKey = new Map<string, number>();
  rows.forEach((r, i) => {
    const u = r.user_id ? String(r.user_id) : "";
    if (u) {
      const j = byUser.get(u);
      if (j === undefined) byUser.set(u, i); else join(i, j);
    }
    const k = personKey(r);
    const j2 = byKey.get(k);
    if (j2 === undefined) byKey.set(k, i); else join(i, j2);
  });
  const label = new Map<number, number>();
  return rows.map((_, i) => {
    const root = find(i);
    if (!label.has(root)) label.set(root, label.size);
    return label.get(root) as number;
  });
}

// 통계의 빠른 고르기 — id 앞글자로. 셋에 안 드는 회차(가을 말씀 동행 등)는 개별로만 고른다.
// ⚠️ 「lent-booklet-」 을 「lent-」 보다 먼저 본다(소책자도 lent- 로 시작한다).
export function quickPick(eventId: string): "소책자" | "사순절" | "썸머" | null {
  const id = String(eventId ?? "");
  if (id.startsWith("lent-booklet-")) return "소책자";
  if (id.startsWith("lent-")) return "사순절";
  if (id.startsWith("summer-")) return "썸머";
  return null;
}

// 글자 차례(코드 포인트) — 한글 완성형은 이 차례가 곧 가나다 차례다. localeCompare 는 Deno·Node 의 ICU 에 따라 달라질 수 있어 쓰지 않는다.
// index.ts evHistory 도 이것으로 정렬한다 — 이력의 「가장 최근 줄」과 통계의 「가장 최근 줄」이 같은 차례여야 이름표가 같다.
export const codeCmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const cmp = codeCmp;

// 고른 회차들의 통계 — 모두 **숫자와 이름·소속**만(user_id·ident_key 는 내보내지 않는다 · StatIn 의 user_id 는 묶기에만).
//   perEvent  : 회차별 인원(줄 수) — 기간 차례(closes_on 오름차순, 같으면 id)
//   byGroup   : 교구(부서) × 회차 — 교구는 BE_GU 차례 → 교회학교 부서(가나다) → 모르는 이름(가나다)
//               counts 에는 고른 회차가 **모두** 들어 있다(없으면 0)
//   repeaters : 여러 번 참여한 분 — 사람 묶음(personGroups)마다 **서로 다른 회차 수** ≥ minRepeat(기본 3), 많은 차례 → 이름 → 순번.
//               한 줄 = { n, name, label, times, events } — name·label 은 가장 최근 회차의 줄에서,
//               label 은 소속만(affLabel · 「화평 20목장」) · 화면은 「이름 · 소속」, CSV 는 「이름」「소속」 두 칸.
//               events 는 회차 id 들(기간 차례 — 화면이 perEvent 의 title 로 바꿔 보인다).
//               n = personGroups 순번 + 1(1부터 — evHistory 의 groups[].n 과 같은 셈법 · user_id 대신 쓰는 이름표).
// rows 중 events 에 없는 회차의 줄은 세지 않는다.
export function statsOf(rows: StatIn[], events: { id: string; title: string; closes_on: string }[], minRepeat?: number): {
  perEvent: { id: string; title: string; count: number }[];
  byGroup: { who_type: string; group_name: string; counts: Record<string, number>; total: number }[];
  repeaters: { n: number; name: string; label: string; times: number; events: string[] }[];
} {
  const min = Number.isInteger(minRepeat) && (minRepeat as number) >= 1 ? (minRepeat as number) : 3;
  const evs = [...events].sort((a, b) => cmp(String(a.closes_on), String(b.closes_on)) || cmp(a.id, b.id));
  const order = new Map<string, number>(evs.map((e, i) => [e.id, i]));
  const use = rows.filter((r) => order.has(r.event_id));

  const perEvent = evs.map((e) => ({ id: e.id, title: e.title, count: use.filter((r) => r.event_id === e.id).length }));

  const bag = new Map<string, { who_type: string; group_name: string; counts: Record<string, number>; total: number }>();
  for (const r of use) {
    const who = legacyNorm(r.who_type), g = legacyNorm(r.group_name);
    const k = who + "|" + g;
    let b = bag.get(k);
    if (!b) {
      b = { who_type: who, group_name: g, counts: Object.fromEntries(evs.map((e) => [e.id, 0])), total: 0 };
      bag.set(k, b);
    }
    b.counts[r.event_id] += 1;
    b.total += 1;
  }
  const rank = (b: { who_type: string; group_name: string }): number[] => {
    if (b.who_type === "교구" && BE_GU.includes(b.group_name)) return [0, BE_GU.indexOf(b.group_name)];
    if (b.who_type === "교회학교" && b.group_name) return [1, 0];
    return [2, 0];
  };
  const byGroup = [...bag.values()].sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || cmp(a.group_name, b.group_name) || cmp(a.who_type, b.who_type);
  });

  const grp = personGroups(use);
  const members = new Map<number, number[]>();
  grp.forEach((g, i) => {
    const list = members.get(g);
    if (list) list.push(i); else members.set(g, [i]);
  });
  const ord = (i: number): number => order.get(use[i].event_id) as number;
  const repeaters: { n: number; name: string; label: string; times: number; events: string[] }[] = [];
  for (const [n, idx] of members) {
    const ids = [...new Set(idx.map((i) => use[i].event_id))].sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
    if (ids.length < min) continue;
    const latest = idx.reduce((best, i) => (ord(i) >= ord(best) ? i : best), idx[0]);
    repeaters.push({ n: n + 1, name: legacyNorm(use[latest].name), label: affLabel(use[latest]), times: ids.length, events: ids });
  }
  repeaters.sort((a, b) => b.times - a.times || cmp(a.name, b.name) || a.n - b.n);

  return { perEvent, byGroup, repeaters };
}
