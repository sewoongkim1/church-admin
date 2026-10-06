// 📊 사역 통계(2026-10-06) — 세는 규칙(ministry-stats.ts buildStats · 순수) · preflight 가 돈다.
//   설계 v2 docs/superpowers/specs/2026-10-06-ministry-stats-design.md §4·§5. 재료(facts)는 SQL ministry_stats_facts() 의 모양 그대로 손으로 만든다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildStats, positionBucket, ageBand, ageOf, AGE_BANDS, SEXES, POSITIONS, KEEP_MIN, DEMO_MIN, MASKED, ALL } from "../supabase/functions/church-admin/ministry-stats.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// [큰 분류, 계열, 중분류, 표준 팀]
const MAP = [
  ["찬양", "찬양", "찬양대", "시온찬양대"],          // 0
  ["찬양", "찬양", "예배 찬양팀", "금요찬양"],        // 1
  ["교회학교", "교회학교", "아동", "유년1부"],        // 2
  ["그 밖", "전도·중보기도", "", "전도대"],           // 3
  ["그 밖", "재정", "", "계수"],                     // 4
  ["목양", "목양", "리더", "L-12 리더"],             // 5
  ["그 밖", "미정", "", "새 팀"],                    // 6 이음표에 없는 쌍
];
// [종류, 태어난 해, 성별, 직분]
const PEOPLE = [
  ["m", 1960, "남", "장로"],        // 0
  ["m", 1975, "여", "권사"],        // 1
  ["m", 1980, "여", "집사"],        // 2
  ["g", null, "", "집사"],          // 3 떠난 분
  ["u", null, "", "성도"],          // 4 아직 못 정함
  ["m", 1990, "남", ""],            // 5
  ["m", 1950, "여", "은퇴권사"],    // 6
];
const SEATS = [
  [0, 2020, 0], [1, 2020, 0], [3, 2020, 0], [5, 2020, 3], [6, 2020, 4],
  [0, 2021, 0], [1, 2021, 1], [2, 2021, 0], [6, 2021, 4],
  [0, 2022, 0], [0, 2022, 1], [2, 2022, 2], [4, 2022, 0], [5, 2022, 0], [6, 2022, 4],
  [0, 2023, 0], [1, 2023, 0], [4, 2023, 0], [5, 2023, 0], [2, 2023, 2],
];
const facts = (over = {}) => ({ years: [2020, 2021, 2022, 2023], map: MAP, people: PEOPLE, seats: SEATS, gaps: [], unmapped: [], source_date: "2026-09-29", ...over });
const rowOf = (out, unit, year) => out.units[unit].rows.find((r) => r.year === year);
const flow = (r) => [r.prev, r.stay, r.back, r.firstEver, r.firstOther, r.moved, r.rest, r.gone];

test("자리 · 봉사자 · 두 자리 이상 — 단위마다 따로 센다", () => {
  const out = buildStats(facts());
  assert.deepEqual(out.years, [2020, 2021, 2022, 2023]);
  assert.equal(out.sourceDate, "2026-09-29");
  const r = rowOf(out, "g:찬양", 2022);
  assert.deepEqual([r.seats, r.people, r.multi], [4, 3, 1]);          // 0번 분이 찬양대와 금요찬양 둘
  assert.deepEqual([rowOf(out, ALL, 2022).seats, rowOf(out, ALL, 2022).people], [6, 5]);   // 전체 = 찬양 + 교회학교 + 그 밖
  assert.equal(out.units[ALL].label, "전체");
  assert.equal(out.units["f:전도·중보기도"].group, "g:그 밖");
  assert.equal(out.units["g:목양"], undefined);                        // 목양 자리가 없는 재료
});

test("흐름 — 계속 · 돌아옴 · 처음(사역이 처음 / 다른 곳에서) · 나감(옮김 / 쉼 / 떠남)", () => {
  const out = buildStats(facts());
  const u = "g:찬양";
  assert.equal(rowOf(out, u, 2020).prev, null);                                       // 첫 해 — 견줄 해가 없다
  assert.equal(rowOf(out, u, 2020).stay, null);
  //                                      견준 해 계속 돌아옴 사역처음 다른곳 옮김 쉼 떠남
  assert.deepEqual(flow(rowOf(out, u, 2021)), [2020, 2, 0, 1, 0, 0, 0, 1]);            // 3번(떠난 분)이 나감
  assert.deepEqual(flow(rowOf(out, u, 2022)), [2021, 1, 0, 1, 1, 1, 1, 0]);            // 4번 사역이 처음 · 5번은 전도에서 옴 · 2번은 교회학교로 옮김 · 1번은 쉼
  assert.deepEqual(flow(rowOf(out, u, 2023)), [2022, 3, 1, 0, 0, 0, 0, 0]);            // 1번이 돌아옴
  const r = rowOf(out, u, 2022);
  assert.deepEqual([r.first, r.left, r.base], [2, 2, 3]);
});

test("유지율 — 견준 해 봉사자가 다섯 분이 안 되면 내지 않는다", () => {
  const out = buildStats(facts());
  assert.equal(KEEP_MIN, 5);
  assert.equal(rowOf(out, "g:찬양", 2021).keep, null);                 // 견준 해 3명
  const all = rowOf(out, ALL, 2021);                                   // 2020년 다섯 분 가운데 셋이 계속
  assert.deepEqual([all.base, all.stay, all.keep], [5, 3, 60]);
  assert.deepEqual(flow(all), [2020, 3, 0, 1, 0, 0, 1, 1]);
});

test("명단이 일부인 해 — 견주는 해로 쓰지 않는다('*' · 큰 분류 · 계열 · 끝이 없는 것)", () => {
  const star = buildStats(facts({ gaps: [["*", 2021, 2021]] }));
  assert.equal(rowOf(star, ALL, 2021).gap, true);
  assert.equal(rowOf(star, ALL, 2021).prev, 2020);                     // 일부인 해 자신도 수는 낸다
  const r = rowOf(star, ALL, 2022);
  assert.deepEqual(flow(r), [2020, 3, 1, 1, 0, 0, 1, 1]);              // 2020년과 견준다 — 2번은 2021년에 본 분이라 돌아옴
  assert.equal(r.gap, false);
  assert.equal(rowOf(star, "f:재정", 2022).prev, 2020);                // '*' 는 모든 단위에

  const grp = buildStats(facts({ gaps: [["g:찬양", 2021, 2021]] }));
  assert.equal(rowOf(grp, "g:찬양", 2022).prev, 2020);
  assert.equal(rowOf(grp, "f:찬양", 2022).prev, 2020);                 // 큰 분류의 것은 그 안의 계열에도
  assert.equal(rowOf(grp, "f:찬양", 2021).gap, true);
  assert.equal(rowOf(grp, ALL, 2022).prev, 2021);                      // 전체에는 걸리지 않는다
  assert.equal(rowOf(grp, "g:교회학교", 2023).prev, 2022);

  const open = buildStats(facts({ gaps: [["f:재정", 2021, null]] }));
  assert.deepEqual(out3(open, "f:재정"), [[2020, false, null], [2021, true, 2020], [2022, true, 2020], [2023, true, null]]);   // 2023년은 재정 자리가 없다 — 흐름을 내지 않는다
  assert.equal(rowOf(open, "g:그 밖", 2022).prev, 2021);               // 계열의 것은 큰 분류에 걸리지 않는다
});
const out3 = (out, unit) => out.units[unit].rows.map((r) => [r.year, r.gap, r.prev]);

test("이음표에 없는 줄은 「그 밖 · 미정」으로 — 덧붙임에 쌍과 줄 수", () => {
  const out = buildStats(facts({ seats: [...SEATS, [1, 2023, 6], [2, 2023, 6]], unmapped: [["새부서", "새 팀", 2]] }));
  assert.deepEqual([rowOf(out, "f:미정", 2023).seats, out.units["f:미정"].group], [2, "g:그 밖"]);
  assert.deepEqual(out.meta.unmapped, [{ committee: "새부서", team: "새 팀", n: 2 }]);
  assert.equal(out.meta.unmappedSeats, 2);
  assert.deepEqual([out.meta.unsureSeats, out.meta.unsurePeople, out.meta.gonePeople], [2, 1, 1]);
});

test("안쪽 나눔 — 중분류가 있는 계열만 · 계열이 하나뿐인 큰 분류는 그 열쇠로도", () => {
  const out = buildStats(facts());
  assert.deepEqual(Object.keys(out.inner).sort(), ["f:교회학교", "f:찬양", "g:교회학교", "g:찬양"]);
  assert.deepEqual(out.inner["g:찬양"].mids, [{ label: "찬양대", seats: [3, 2, 3, 4] }, { label: "예배 찬양팀", seats: [0, 1, 1, 0] }]);
  assert.deepEqual(out.inner["g:찬양"].teams[0], { label: "시온찬양대", mid: "찬양대", seats: [3, 2, 3, 4] });
  assert.equal(out.inner["g:그 밖"], undefined);
});

test("나이 · 성별 · 직분 — 봉사자 30명부터 · 1~4명 칸은 가린다 · 떠난 분은 모름", () => {
  assert.deepEqual([DEMO_MIN, MASKED], [30, -1]);
  // 2024년 찬양대 33명: 교인 30명(1950년생 남 장로 12 · 1970년생 여 권사 15 · 1990년생 여 집사 3) + 떠난 분 2명(그때 직분 집사) + 못 정한 분 1명
  const people = [], seats = [];
  const add = (n, who) => { for (let i = 0; i < n; i++) { people.push(who); seats.push([people.length - 1, 2024, 0]); } };
  add(12, ["m", 1950, "남", "장로"]); add(15, ["m", 1970, "여", "협동권사"]); add(3, ["m", 1990, "여", "서리집사"]);
  add(2, ["g", null, "", "집사"]); add(1, ["u", null, "", ""]);
  const out = buildStats({ map: MAP, people, seats });
  const d = rowOf(out, "g:찬양", 2024).demo;
  assert.deepEqual(AGE_BANDS, ["39세까지", "40대", "50대", "60대", "70세부터", "모름"]);
  assert.deepEqual(d.bands, [MASKED, 0, 15, 0, 12, MASKED]);           // 34세 3명 · 54세 15명 · 74세 12명 · 모름 3명
  assert.equal(d.ageAvg, Math.round((12 * 74 + 15 * 54 + 3 * 34) * 10 / 30) / 10);
  assert.deepEqual(SEXES, ["남", "여", "모름"]);
  assert.deepEqual(d.sex, [12, 18, MASKED]);
  assert.deepEqual(POSITIONS, ["장로", "안수집사", "권사", "집사", "그 밖", "모름"]);
  assert.deepEqual(d.position, [12, 0, 15, 5, 0, MASKED]);             // 서리집사 3 + 떠난 분의 그때 직분 집사 2
  assert.equal(rowOf(buildStats(facts()), "g:찬양", 2022).demo, null);  // 3명 — 내지 않는다
});

test("직분 칸 · 나이대", () => {
  const b = (s) => positionBucket(s);
  assert.deepEqual(["장로", "은퇴장로", "안수집사", "은퇴 안수집사", "협동안수집사", "권사", "명예권사", "집사", "서리집사", "은퇴집사"].map(b),
    ["장로", "장로", "안수집사", "안수집사", "안수집사", "권사", "권사", "집사", "집사", "집사"]);
  assert.deepEqual(["성도", "청년", "학생", "목사", "사모", "", "-", null, undefined].map(b), ["그 밖", "그 밖", "그 밖", "그 밖", "그 밖", "모름", "모름", "모름", "모름"]);
  assert.deepEqual([39, 40, 49, 50, 59, 60, 69, 70, 95].map(ageBand), ["39세까지", "40대", "40대", "50대", "50대", "60대", "60대", "70세부터", "70세부터"]);
  assert.equal(ageBand(null), "모름");
  assert.deepEqual([ageOf(2026, 1970), ageOf(2026, null), ageOf(2026, 2030), ageOf(2026, 1800)], [56, null, null, null]);
});

test("응답에 사람 번호 · 태어난 해 · 재료가 실리지 않는다", () => {
  const out = buildStats(facts());
  assert.deepEqual(Object.keys(out).sort(), ["inner", "meta", "sourceDate", "units", "years"]);
  const s = JSON.stringify(out);
  for (const bad of ["1960", "1975", "1980", "1990", "1950", '"seats":[[', '"people":[[', '"map"']) assert.ok(!s.includes(bad), bad);
  for (const u of Object.values(out.units)) for (const r of u.rows) assert.equal(typeof r.people, "number");
});

test("재료가 비어도 넘어지지 않는다", () => {
  const out = buildStats({ map: [], seats: [], people: [] });
  assert.deepEqual([out.years, out.units, out.inner], [[], {}, {}]);
  assert.deepEqual(out.meta, { unmapped: [], unmappedSeats: 0, unsureSeats: 0, unsurePeople: 0, gonePeople: 0, gaps: [] });
});

// 못 이은 까닭 — SQL 013 은 history-match.ts 의 상수 글자 **앞머리**로 떠난 분을 가른다. 상수가 바뀌면 SQL 도 바뀌어야 한다.
test("떠난 분을 가르는 글자가 SQL 013 과 history-match.ts 에 함께 있다", () => {
  const sql = readFileSync(path.join(ROOT, "supabase/sql/013_ministry_stats.sql"), "utf8");
  const ts = readFileSync(path.join(ROOT, "supabase/functions/church-admin/history-match.ts"), "utf8");
  const likes = [...sql.matchAll(/h\.match_reason like '([^%']+)%'/g)].map((m) => m[1]);
  assert.deepEqual(likes, ["교인명부에 같은 이름이 없음", "교인명부의 같은 이름은", "같은 목장·이름 줄을 담당자가", "이분 아님"]);
  const consts = [...ts.matchAll(/const (R_[A-Z_]+) = "([^"]+)"/g)].map((m) => [m[1], m[2]]);
  const startsWith = (name) => { const c = consts.find(([n]) => n === name); assert.ok(c, name); return likes.some((l) => c[1].startsWith(l)); };
  for (const name of ["R_NONE", "R_KID", "R_MISFIT", "R_HAND_NONE", "R_MANUAL_NONE"]) assert.ok(startsWith(name), name + " 을 가르는 글자가 SQL 에 없다");
  assert.ok(!startsWith("R_CLASH"), "「못 가림」은 떠난 분이 아니다");
  for (const l of likes) assert.ok(consts.some(([, v]) => v.startsWith(l)), "SQL 의 글자가 상수에 없다: " + l);
});
