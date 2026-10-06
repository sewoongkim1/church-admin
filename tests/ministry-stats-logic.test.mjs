// 📊 사역 통계(2026-10-06) — 화면 논리(js/menus/ministry/stats-logic.js · 순수) · preflight 가 돈다.
//   서버 응답은 진짜 buildStats 로 만든다(재료를 손으로 만들어) — 서버와 화면의 칸 이름이 어긋나면 여기서 잡힌다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as S from "../supabase/functions/church-admin/ministry-stats.ts";
import { ALL, AGE_BANDS, SEXES, POSITIONS, MASKED, MASK_TEXT, FLOW_HEAD, HOW, MAIN, SIDE, cardsOf, cellText, chartBars, chartSvg, demoRows, familiesOf, familyTabs,
  flowRow, gapText, groupOf, heatRows, heatStyle, innerOf, keepText, lastRow, legendHtml, metaLines, nText, pctText, statsFileName, statsSheets, tabUnits, CHART }
  from "../js/menus/ministry/stats-logic.js";

const MAP = [
  ["찬양", "찬양", "찬양대", "시온찬양대"], ["찬양", "찬양", "예배 찬양팀", "금요찬양"], ["교회학교", "교회학교", "아동", "유년1부"],
  ["그 밖", "전도·중보기도", "", "전도대"], ["그 밖", "부설기관", "도서관", "도서관(책마을)"], ["목양", "목양", "리더", "L-12 리더"],
];
// 찬양대 36명이 2024~2026년 내내 · 2025년에 두 분이 나가고(한 분은 전도로 옮김) 2026년에 한 분이 돌아옴 · 전도 6명 · 도서관 3명 · 목양 2명
function facts() {
  const people = [], seats = [];
  const P = (kind, by, sex, pos) => { people.push([kind, by, sex, pos]); return people.length - 1; };
  const choir = Array.from({ length: 36 }, (_, i) => P("m", 1950 + i, i % 3 ? "여" : "남", i < 12 ? "장로" : i < 30 ? "권사" : "집사"));
  for (const y of [2024, 2025, 2026]) for (const [i, p] of choir.entries()) {
    if (y === 2025 && (i === 0 || i === 1)) continue;       // 0번·1번이 2025년에 나감
    if (y === 2026 && i === 1) continue;                    // 0번은 2026년에 돌아옴 · 1번은 그대로 없음
    seats.push([p, y, 0]);
  }
  seats.push([choir[1], 2025, 3], [choir[1], 2026, 3]);     // 1번은 전도대로 옮김
  seats.push([choir[2], 2026, 1]);                          // 2번은 2026년에 금요찬양도(두 자리)
  const evan = Array.from({ length: 6 }, () => P("m", 1970, "여", "집사"));
  for (const y of [2024, 2025, 2026]) for (const p of evan) seats.push([p, y, 3]);
  const lib = [P("m", 1980, "여", "집사"), P("g", null, "", "성도"), P("u", null, "", "")];
  for (const p of lib) seats.push([p, 2024, 4]);
  seats.push([lib[0], 2025, 4], [lib[0], 2026, 4]);
  const mok = [P("m", 1965, "남", "안수집사"), P("m", 1966, "남", "안수집사")];
  for (const p of mok) seats.push([p, 2024, 5]);
  return { years: [2024, 2025, 2026], map: MAP, people, seats, gaps: [["g:교회학교", 2025, 2025], ["f:부설기관", 2026, null], ["*", 2021, 2021]],
    unmapped: [["새부서", "새 팀", 3], ["", "", 1]], source_date: "2026-09-29" };
}
const D = S.buildStats(facts());

test("서버와 같은 칸 이름 · 가린 칸", () => {
  assert.deepEqual([ALL, AGE_BANDS, SEXES, POSITIONS, MASKED], [S.ALL, S.AGE_BANDS, S.SEXES, S.POSITIONS, S.MASKED]);
  assert.deepEqual([cellText(MASKED), cellText(0), cellText(1234), MASK_TEXT], ["5 미만", "0", "1,234", "5 미만"]);
  assert.deepEqual([nText(null), nText(undefined), pctText(87), pctText(null)], ["", "", "87%", "—"]);
});

test("범위 단추 — 재료에 있는 것만 · 계열 단추는 계열이 둘 이상인 큰 분류에서만", () => {
  assert.deepEqual(tabUnits(D), { main: [ALL, "g:찬양", "g:그 밖"], side: ["g:목양"] });       // 교회학교·기관 줄이 없는 재료
  assert.deepEqual([MAIN, SIDE], [[ALL, "g:찬양", "g:교회학교", "g:그 밖"], ["g:목양", "g:기관"]]);
  assert.deepEqual(familiesOf(D, "g:그 밖"), ["f:전도·중보기도", "f:부설기관"]);                // 자리 합이 많은 차례
  assert.deepEqual(familyTabs(D, "g:그 밖"), ["f:전도·중보기도", "f:부설기관"]);
  assert.deepEqual(familyTabs(D, "f:부설기관"), ["f:전도·중보기도", "f:부설기관"]);             // 계열을 보고 있어도 같은 줄
  assert.deepEqual([familyTabs(D, "g:찬양"), familyTabs(D, ALL)], [[], []]);
  assert.deepEqual([groupOf(D, "f:부설기관"), groupOf(D, "g:찬양"), groupOf(D, ALL)], ["g:그 밖", "g:찬양", ALL]);
});

test("카드 넷 — 자리가 있는 가장 늦은 해 · 견줄 해가 없으면 「—」", () => {
  const c = cardsOf(D.units["g:찬양"].rows);
  assert.deepEqual(c.map((x) => x.title), ["2026년 봉사자", "작년에도 한 분", "처음 오신 분", "돌아오신 분"]);
  assert.deepEqual(c.map((x) => x.value), ["35명", "100%", "0명", "1명"]);
  assert.equal(c[0].sub, "자리 36 · 두 자리 이상 1명");
  assert.equal(c[1].sub, "2025년 34명 가운데 34명");
  assert.equal(c[2].sub, "사역이 처음 0 · 다른 곳에서 0");
  const mok = cardsOf(D.units["g:목양"].rows);                       // 2024년 한 해뿐 — 견줄 해가 없다
  assert.deepEqual(mok.map((x) => x.value), ["2명", "—", "—", "—"]);
  assert.equal(mok[0].title, "2024년 봉사자");
  assert.equal(lastRow(D.units["g:목양"].rows).year, 2024);
  assert.deepEqual(cardsOf([]), []);
  const lib = cardsOf(D.units["f:부설기관"].rows);                    // 2026년은 명단 일부 — 한 칸 요약은 「—」, 아래 줄에 표시
  assert.equal(lib[1].value, "—");
  assert.ok(lib[1].sub.endsWith("명단 일부"));
});

test("해마다 수 — 줄의 칸 글자 · 견준 해를 건너뛴 표시", () => {
  assert.deepEqual(FLOW_HEAD, ["해", "자리", "봉사자", "계속", "돌아옴", "처음", "나감", "유지율", "견준 해"]);
  const rows = D.units["g:찬양"].rows.map(flowRow);
  assert.equal(rows[0].flow, null);
  assert.deepEqual(rows[1].flow, { stay: "34", back: "0", first: "0", firstSub: "사역 처음 0", left: "2", leftSub: "옮김 1 · 쉼 1 · 떠남 0", keep: "94%", prev: "2024", skipped: false });
  assert.deepEqual([rows[2].flow.back, rows[2].flow.left, rows[2].flow.keep], ["1", "0", "100%"]);
  const lib = D.units["f:부설기관"].rows.map(flowRow);
  assert.deepEqual([lib[1].flow.leftSub, lib[1].flow.keep], ["옮김 0 · 쉼 1 · 떠남 1", "—"]);    // 견준 해 3명 — 유지율을 내지 않는다
  assert.deepEqual([lib[2].gap, keepText(D.units["f:부설기관"].rows[2], true), keepText(null)], [true, "—", "—"]);
});

test("막대 — 계속·돌아옴·처음을 쌓고, 견줄 해가 없으면 한 덩이, 명단 일부면 빗금", () => {
  const bars = chartBars(D.units["g:찬양"].rows);
  assert.deepEqual(bars.map((b) => b.segs.map((s) => s.kind)), [["none"], ["stay"], ["stay", "back"]]);
  const b = bars[2], h = b.segs.reduce((a, s) => a + s.h, 0);
  assert.ok(Math.abs(h - (CHART.H - CHART.BASE - b.top)) < 1e-6);                 // 쌓은 높이 = 봉사자 높이
  assert.ok(Math.abs(bars[0].top - CHART.TOP) < 1e-6);                             // 가장 많은 해가 맨 위
  assert.deepEqual(chartBars(D.units["f:부설기관"].rows)[2].segs.map((s) => s.kind), ["gap"]);
  const svg = chartSvg(D.units["g:찬양"].rows);
  assert.ok(svg.startsWith("<svg") && svg.includes(">36<") && svg.includes(">24<") && !svg.includes("NaN"));
  assert.ok(chartSvg(D.units["f:부설기관"].rows).includes("26※"));
  assert.deepEqual(chartBars([]), []);
  assert.ok(legendHtml().includes("명단이 일부인 해"));
});

test("계열별 자리 수 — 전체와 계열이 둘 이상인 큰 분류에서만 · 올해가 명단 일부면 유지율 「—」", () => {
  assert.deepEqual(heatRows(D, ALL).map((r) => [r.label, r.group, r.seats, r.keep]),
    [["찬양", "찬양", [36, 34, 36], "100%"], ["전도·중보기도", "그 밖", [6, 7, 7], "100%"], ["부설기관", "그 밖", [3, 1, 1], "—"]]);
  assert.deepEqual(heatRows(D, "g:그 밖").map((r) => r.key), ["f:전도·중보기도", "f:부설기관"]);
  assert.deepEqual(heatRows(D, "f:부설기관").map((r) => r.key), ["f:전도·중보기도", "f:부설기관"]);
  assert.deepEqual([heatRows(D, "g:찬양"), heatRows(D, "g:목양")], [[], []]);
  assert.equal(heatStyle(0, 10), "");
  assert.ok(heatStyle(10, 10).includes("color:#fff") && heatStyle(1, 100).includes("color:#222"));
});

test("안쪽 나눔 — 중분류가 있는 단위만", () => {
  assert.deepEqual(innerOf(D, "g:찬양").mids.map((m) => m.label), ["찬양대", "예배 찬양팀"]);
  assert.equal(innerOf(D, "f:부설기관").teams[0].label, "도서관(책마을)");
  assert.deepEqual([innerOf(D, ALL), innerOf(D, "g:그 밖"), innerOf(D, "f:전도·중보기도")], [null, null, null]);
});

test("나이 · 성별 · 직분 — 30명 이상인 해만 · 가린 칸은 「5 미만」", () => {
  const rows = demoRows(D.units["g:찬양"].rows);
  assert.deepEqual(rows.map((r) => [r.year, r.people]), [[2024, 36], [2025, 34], [2026, 35]]);
  assert.equal(rows[0].bands.length, AGE_BANDS.length);
  assert.ok(rows[0].bands.includes("5 미만"));
  assert.match(rows[0].ageAvg, /^\d+\.\d$/);
  assert.deepEqual(rows[0].position, ["12", "0", "18", "6", "0", "0"]);
  assert.deepEqual(demoRows(D.units["g:목양"].rows), []);
});

test("명단이 일부인 해 · 덧붙임 글", () => {
  assert.deepEqual(D.meta.gaps.map(gapText), ["교회학교 2025년", "부설기관 2026년부터", "2021년 전체"]);
  assert.equal(gapText({ scope: "g:교회학교", from: 2023, to: 2024 }), "교회학교 2023~2024년");
  const lines = metaLines(D);
  assert.equal(lines[0], "교인명부 기준일 2026-09-29");
  assert.ok(lines[1].startsWith("명단이 일부인 해"));
  assert.equal(lines[2], "떠난 분(교인명부에 없는 분) 1명 · 아직 누군지 못 정한 줄 1줄(1명으로 셈)");
  assert.ok(lines[3].startsWith("이음표에 없는 부서·팀 2가지 · 4줄") && lines[3].includes("새부서 / 새 팀 3") && lines[3].includes("(부서 빈칸) / (팀 빈칸) 1"));
  assert.equal(metaLines({ meta: {} }).length, 1);
  assert.ok(HOW.length >= 6 && HOW.every((t) => typeof t === "string" && t.length > 10));
});

test("엑셀 — 다섯 장 · 수는 숫자 칸 · 가린 칸은 글자", () => {
  const sheets = statsSheets(D);
  assert.deepEqual(sheets.map(([n]) => n), ["해마다", "계열별 자리", "안쪽 나눔", "나이·성별·직분", "세는 법"]);
  const flow = sheets[0][1];
  assert.equal(flow[0].length, 17);
  assert.deepEqual(flow[1].slice(0, 5), ["전체", 2024, 45, 45, 0]);
  assert.equal(flow[1][5], "");                                                       // 견줄 해가 없는 해 — 빈칸
  const choir26 = flow.find((r) => r[0] === "찬양" && r[1] === 2026);
  assert.deepEqual(choir26.slice(2), [36, 35, 1, 34, 1, 0, 0, 0, 0, 0, 0, 0, 100, 2025, ""]);
  assert.ok(flow.some((r) => r[0] === "그 밖 > 부설기관" && r[1] === 2026 && r[16] === "일부"));
  assert.ok(!flow.some((r) => r[0] === "목양" && r[1] === 2025));                      // 자리가 없는 해는 줄을 내지 않는다
  assert.deepEqual(sheets[1][1][0], ["큰 분류", "계열", 2024, 2025, 2026, "합"]);
  assert.deepEqual(sheets[1][1][1], ["찬양", "찬양", 36, 34, 36, 106]);
  assert.deepEqual(sheets[2][1].find((r) => r[0] === "부설기관"), ["부설기관", "도서관", "(모두)", 3, 1, 1]);   // 계열 이름 가나다 차례 — 목양이 먼저 온다
  const demo = sheets[3][1];
  assert.equal(demo[0].length, 4 + AGE_BANDS.length + SEXES.length + POSITIONS.length);
  assert.ok(demo.slice(1).every((r) => typeof r[2] === "number"));
  assert.ok(demo.some((r) => r.includes("5 미만")));
  assert.equal(sheets[4][1][0][0], "세는 법");
  assert.equal(statsFileName("2026-10-06"), "사역통계_2026-10-06.xlsx");
});
