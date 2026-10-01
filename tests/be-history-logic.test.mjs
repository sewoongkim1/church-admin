// 👤 사람별 이력·통계(성경필사(암송)) — 순수 함수 시험. 숫자는 서버(events-stats.ts)가 내고, 여기서는 고르기·표·내려받기 꼴을 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPROX, MIN_REPEAT, QUICK, quickKey, quickIds, quickChips, chipOn, labelMap, barRows, crossTable, repeatChoices,
  repeatersAt, statsCsv, csvName, histSummary, histRowText,
} from "../js/menus/bibleevent/history-logic.js";
import { quickPick } from "../supabase/functions/church-admin/events-stats.ts";
import { errorText } from "../js/core/ui.js";
import { MENUS } from "../js/menus/registry.js";

// 회차 목록(evEvents 차례 — 마감일 늦은 것 먼저). id 는 운영 회차 모양 그대로(개인정보 아님).
// 통계 이름표(labelMap)는 제목에서 — 「2026 사순절 성경필사」 → 「2026 사순절」(2026-10-01 친구 「왼쪽에 년도」)
const EVS = [
  { id: "autumn-2026", title: "가을 말씀 동행", short_title: "가을 동행", opens_on: "2026-10-27", closes_on: "2026-11-28", count: 0 },
  { id: "summer-2026", title: "2026 썸머 써 바이블", short_title: "", opens_on: "2026-05-01", closes_on: "2026-08-31", count: 199 },
  { id: "lent-booklet-2026", title: "2026 사순절 소책자", short_title: "소책자 26", opens_on: "2026-02-18", closes_on: "2026-04-05", count: 80 },
  { id: "lent-2026", title: "2026 사순절 성경필사", short_title: "사순절 26", opens_on: "2026-02-18", closes_on: "2026-04-05", count: 515 },
  { id: "lent-2025", title: "2025 사순절 성경필사", short_title: "사순절 25", opens_on: "2025-03-05", closes_on: "2025-04-20", count: 400 },
];
// evStats 모양(CONTRACT 5절) — repeaters[].label 은 **소속만**(evWho 꼴), events 는 회차 id
const STATS = {
  perEvent: [{ id: "lent-2026", title: "2026 사순절 성경필사", count: 3 }, { id: "lent-2025", title: "2025 사순절 성경필사", count: 0 },
    { id: "summer-2026", title: "2026 썸머 써 바이블", count: 1 }],
  byGroup: [
    { who_type: "교구", group_name: "화평", counts: { "lent-2026": 2, "summer-2026": 1 }, total: 3 },
    { who_type: "교구", group_name: "기쁨", counts: { "lent-2026": 1 }, total: 1 },
    { who_type: "교회학교", group_name: "청년부", counts: {}, total: 0 },
  ],
  repeaters: [
    { n: 1, name: "홍길동", label: "화평 20목장", times: 5, events: ["lent-2026", "summer-2026", "없는-회차"] },
    { n: 2, name: "ca-test-이", label: "기쁨 3목장", times: 3, events: ["lent-2026"] },
  ],
};

test("빠른 고르기 — 서버 events-stats.ts quickPick 과 같은 id 에서 같은 답", () => {
  const ids = ["lent-booklet-2024", "lent-booklet-2025", "lent-booklet-2026", "lent-2022", "lent-2023", "lent-2024",
    "lent-2025", "lent-2026", "summer-2024", "summer-2025", "summer-2026", "autumn-2026", "lent", "lentx-2026",
    "summerx", "booklet-lent-2024", "ca-test-1", ""];
  for (const id of ids) assert.equal(quickKey(id), quickPick(id), id);
  assert.equal(quickKey("lent-booklet-2026"), "소책자");
  assert.equal(quickKey("lent-2026"), "사순절");
  assert.equal(quickKey("summer-2026"), "썸머");
  assert.equal(quickKey("autumn-2026"), null);
  assert.equal(quickKey(undefined), null);
  assert.deepEqual(QUICK.map(([k]) => k), ["소책자", "사순절", "썸머"]);
});

test("quickIds · quickChips — 묶음마다 회차(차례 그대로) · 회차 없는 묶음은 칩을 안 낸다", () => {
  assert.deepEqual(quickIds(EVS, "사순절"), ["lent-2026", "lent-2025"]);
  assert.deepEqual(quickIds(EVS, "소책자"), ["lent-booklet-2026"]);
  assert.deepEqual(quickChips(EVS).map((c) => [c.key, c.n]), [["소책자", 1], ["사순절", 2], ["썸머", 1]]);
  assert.deepEqual(quickChips(EVS.filter((e) => !e.id.startsWith("summer-"))).map((c) => c.key), ["소책자", "사순절"]);
  assert.deepEqual(quickChips([]), []);
});

test("chipOn — null·전부는 all · 빠른 고르기와 같으면 그 열쇠(차례 무관) · 그 밖은 custom", () => {
  assert.equal(chipOn(EVS, null), "all");
  assert.equal(chipOn(EVS, EVS.map((e) => e.id)), "all");
  assert.equal(chipOn(EVS, ["lent-2025", "lent-2026"]), "사순절");
  assert.equal(chipOn(EVS, ["summer-2026"]), "썸머");
  assert.equal(chipOn(EVS, ["lent-2026"]), "custom");
  assert.equal(chipOn(EVS, ["lent-2026", "summer-2026"]), "custom");
  assert.equal(chipOn(EVS, ["autumn-2026"]), "custom");
});

// 운영 회차 열두 개(2026-10-01 · id·시작일·제목·짧은 이름 — 개인정보 아님). 요청에 시작일이 없던 소책자 2025 는
// 2024·2026 소책자처럼 그해 사순절과 같은 날로 둔다. 마감일은 운영 값을 몰라 「같은 해 같은 날 시작한 둘」을 같은 마감일로 둔다.
const PROD = [
  { id: "lent-2022", opens_on: "2022-03-02", closes_on: "2022-04-16", title: "2022 사순절 마태복음 완서자", short_title: "사순절 완서자" },
  { id: "lent-2023", opens_on: "2023-02-22", closes_on: "2023-04-08", title: "2023 사순절 마가복음 완서자", short_title: "사순절 마가복음 완서자" },
  { id: "lent-2024", opens_on: "2024-02-14", closes_on: "2024-03-30", title: "2024 사순절 누가복음 완서자", short_title: "사순절 누가복음 완서자" },
  { id: "lent-booklet-2024", opens_on: "2024-02-14", closes_on: "2024-03-30", title: "2024 사순절 소책자 이벤트 참여자", short_title: "사순절 소책자 이벤트" },
  { id: "summer-2024", opens_on: "2024-06-01", closes_on: "2024-08-31", title: "2024 썸머 써 바이블 잠언 완서자", short_title: "썸머 써 바이블 완서자" },
  { id: "lent-2025", opens_on: "2025-03-05", closes_on: "2025-04-19", title: "2025 사순절 요한복음 완서자", short_title: "사순절 요한복음 완서자" },
  { id: "lent-booklet-2025", opens_on: "2025-03-05", closes_on: "2025-04-19", title: "2025 사순절 소책자 이벤트 참여자", short_title: "사순절 소책자 이벤트" },
  { id: "summer-2025", opens_on: "2025-06-01", closes_on: "2025-08-31", title: "2025 썸머 써 바이블 롬/갈 완서자", short_title: "썸머 써 바이블 완서자" },
  { id: "lent-2026", opens_on: "2026-02-18", closes_on: "2026-04-04", title: "2026 사순절 마가복음 성경필사 완서자", short_title: "사순절 마가복음 완서자" },
  { id: "lent-booklet-2026", opens_on: "2026-02-18", closes_on: "2026-04-04", title: "2026 사순절 소책자 이벤트 참여자", short_title: "사순절 소책자 이벤트" },
  { id: "summer-2026", opens_on: "2026-05-01", closes_on: "2026-08-31", title: "2026 썸머 써 바이블 옵/말 완서자", short_title: "썸머 써 바이블 완서자" },
  { id: "autumn-2026", opens_on: "2026-10-27", closes_on: "2026-11-28", title: "2026 가을 말씀 동행", short_title: "가을 말씀 동행" },
];

test("labelMap — 운영 회차 열둘: 제목에서 연도(시작일) + 이름 · 「완서자」「이벤트」「참여자」「성경필사」는 뺀다(2026-10-01 친구)", () => {
  const m = labelMap(PROD);
  assert.deepEqual(PROD.map((e) => m.get(e.id)), [
    "2022 사순절 마태복음",          // 짧은 이름(「사순절 완서자」)이 아니라 제목 — 「2022년은 마태복음입니다」
    "2023 사순절 마가복음",
    "2024 사순절 누가복음",
    "2024 사순절 소책자",
    "2024 썸머 써 바이블 잠언",
    "2025 사순절 요한복음",
    "2025 사순절 소책자",
    "2025 썸머 써 바이블 롬/갈",
    "2026 사순절 마가복음",
    "2026 사순절 소책자",
    "2026 썸머 써 바이블 옵/말",
    "2026 가을 말씀 동행",
  ]);
  // 같은 이름이 두 해에 있어도 이름표는 다르다(2023·2026 사순절 마가복음)
  assert.equal(new Set(m.values()).size, PROD.length);
});

test("labelMap — 연도는 시작일(opens_on)에서 · 제목 앞 연도는 떼고 한 번만 · 시작일이 없으면 제목 앞 연도 · 둘 다 없으면 연도 없이", () => {
  const one = (e) => labelMap([{ id: "x", ...e }]).get("x");
  assert.equal(one({ title: "사순절 마가복음 완서자", opens_on: "2023-02-22" }), "2023 사순절 마가복음", "제목에 연도가 없으면 시작일 연도를 붙인다");
  assert.equal(one({ title: "2026 썸머 써 바이블", opens_on: "2026-05-01" }), "2026 썸머 써 바이블", "두 번 붙이지 않는다");
  assert.equal(one({ title: "2025 사순절", opens_on: "2026-02-18" }), "2026 사순절", "다르면 시작일 연도 — 제목 앞 연도는 뗀다");
  assert.equal(one({ title: "2026년 사순절", opens_on: "2026-02-18" }), "2026 사순절", "「2026년」도 앞 연도로 본다");
  assert.equal(one({ title: "사순절 2026", opens_on: "2026-02-18" }), "2026 사순절", "뒤에 같은 연도가 한 번 더 있어도 한 번만");
  assert.equal(one({ title: "2024 사순절 완서자" }), "2024 사순절", "시작일이 없으면 제목 앞 연도");
  for (const bad of ["", null, "x", "2026-3-1", "2026-13-01", "2026/03/01", "20260301"]) {
    assert.equal(one({ title: "2024 사순절", opens_on: bad }), "2024 사순절", "시작일이 꼴이 아니면 제목 앞 연도: " + bad);
    assert.equal(one({ title: "가을 말씀 동행", opens_on: bad }), "가을 말씀 동행", "둘 다 없으면 연도 없이: " + bad);
  }
  assert.equal(one({ title: " 2026  가을   말씀 동행 ", opens_on: " 2026-10-27 " }), "2026 가을 말씀 동행", "빈칸은 하나로");
  // 담당자가 띄어 쓰지 않고 적은 제목(검토 M1) — 연도가 두 번 붙지 않는다
  assert.equal(one({ title: "2027사순절 마가복음 완서자", opens_on: "2027-02-10" }), "2027 사순절 마가복음", "연도를 붙여 써도 한 번만");
  assert.equal(one({ title: "2026년도 사순절", opens_on: "2026-02-18" }), "2026 사순절", "「2026년도」도 앞 연도");
  assert.equal(one({ title: "2026년도사순절", opens_on: "2026-02-18" }), "2026 사순절", "「2026년도」를 붙여 써도");
  assert.equal(one({ title: "2026년", opens_on: "2026-02-18" }), "2026", "연도만 있는 제목은 연도 하나");
  assert.equal(one({ title: "2026", opens_on: "2026-02-18" }), "2026", "숫자 연도만이어도 연도 하나");
  assert.equal(one({ title: "2026사순절" }), "2026 사순절", "시작일이 없으면 붙여 쓴 앞 연도");
});

test("labelMap — 뺄 말은 따로 선 낱말만 · 다 빼면 비는 이름은 빼기 전 그대로 · 제목 → 짧은 이름 → id", () => {
  const one = (e) => labelMap([{ id: "x-1", ...e }]).get("x-1");
  assert.equal(one({ title: "완서자 모임 이벤트성 참여자들", opens_on: "2026-01-01" }), "2026 모임 이벤트성 참여자들",
    "따로 선 「완서자」만 빼고 붙어 있는 말(이벤트성·참여자들)은 그대로");
  assert.equal(one({ title: "2026 완서자 이벤트", opens_on: "2026-03-01" }), "2026 완서자 이벤트", "다 빼면 비니 빼기 전 그대로");
  assert.equal(one({ title: "완서자", opens_on: "2026-03-01" }), "2026 완서자");
  assert.equal(one({ title: "", short_title: "2024 썸머 완서자", opens_on: "2024-06-01" }), "2024 썸머", "제목이 비면 짧은 이름");
  assert.equal(one({ title: "", short_title: "", opens_on: "2024-06-01" }), "2024 x-1", "그것도 비면 id");
  assert.equal(one({ title: "", short_title: "" }), "x-1");
  assert.equal(one({ title: "2026", opens_on: "2026-03-01" }), "2026", "연도뿐인 제목이 「2026 2026」이 되지 않게");
  assert.deepEqual([...labelMap(null)], []);
});

test("barRows — 가장 많은 회차가 100% · 0명은 0% · 적어도 2% · 이름은 짧은 이름", () => {
  const b = barRows([{ id: "a", title: "A", count: 400 }, { id: "b", title: "B", count: 1 }, { id: "c", title: "C", count: 0 },
    { id: "d", title: "D", count: 100 }], new Map([["a", "에이"]]));
  assert.deepEqual(b.map((x) => [x.id, x.label, x.count, x.pct]), [["a", "에이", 400, 100], ["b", "B", 1, 2], ["c", "C", 0, 0], ["d", "D", 100, 25]]);
  assert.deepEqual(barRows([{ id: "z", title: "Z", count: 0 }]).map((x) => x.pct), [0]);
  assert.deepEqual(barRows([]), []);
});

test("crossTable — 열은 회차 차례 · 구분이 바뀌는 곳에 머리 줄 · 빈 칸은 0 · 맨 아래 합계", () => {
  const x = crossTable(STATS, labelMap(EVS));
  assert.deepEqual(x.cols, [{ id: "lent-2026", label: "2026 사순절" }, { id: "lent-2025", label: "2025 사순절" }, { id: "summer-2026", label: "2026 썸머 써 바이블" }]);
  assert.deepEqual(x.rows, [
    { head: true, label: "교구" },
    { head: false, label: "화평", cells: [2, 0, 1], total: 3 },
    { head: false, label: "기쁨", cells: [1, 0, 0], total: 1 },
    { head: true, label: "교회학교" },
    { head: false, label: "청년부", cells: [0, 0, 0], total: 0 },
  ]);
  assert.deepEqual(x.foot, { cells: [3, 0, 1], total: 4 });
  assert.deepEqual(crossTable({ perEvent: [], byGroup: [], repeaters: [] }, new Map()), { cols: [], rows: [], foot: { cells: [], total: 0 } });
});

test("여러 번 참여 — 「N회 이상」 칩은 3회부터 가장 많은 횟수까지 · 거르기", () => {
  assert.equal(MIN_REPEAT, 3);
  assert.deepEqual(repeatChoices(STATS.repeaters), [{ min: 3, n: 2 }, { min: 4, n: 1 }, { min: 5, n: 1 }]);
  assert.deepEqual(repeatChoices([]), []);
  assert.deepEqual(repeatersAt(STATS.repeaters, 4).map((p) => p.n), [1]);
  assert.deepEqual(repeatersAt(STATS.repeaters, 3).map((p) => p.n), [1, 2]);
  assert.deepEqual(repeatersAt(undefined, 3), []);
});

test("statsCsv — BOM · \\r\\n · 세 표 · 따옴표 · 회차는 세 표 모두 막대와 같은 이름표(연도 + 이름) · 여러 번 참여는 「이름」「소속」 두 칸 · 근삿값 안내", () => {
  const csv = statsCsv(STATS, labelMap(EVS), 4);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.deepEqual(csv.slice(1).split("\r\n"), [
    '"회차별 인원"',
    '"회차","인원"',
    '"2026 사순절","3"',
    '"2025 사순절","0"',
    '"2026 썸머 써 바이블","1"',
    "",
    '"교구(부서) × 회차 — 명단 줄 수"',
    '"구분","소속","2026 사순절","2025 사순절","2026 썸머 써 바이블","합계"',
    '"교구","화평","2","0","1","3"',
    '"교구","기쁨","1","0","0","1"',
    '"교회학교","청년부","0","0","0","0"',
    '"합계","","3","0","1","4"',
    "",
    `"여러 번 참여한 분 — 4회 이상 · ${APPROX}"`,
    '"이름","소속","횟수","참여 회차"',
    '"홍길동","화평 20목장","5","2026 사순절 · 2026 썸머 써 바이블 · 없는-회차"',
  ]);
  // 회차 목록에 없는 회차(이름표 없음)는 서버가 준 제목 → id
  assert.ok(statsCsv(STATS, new Map(), 4).includes('"2026 사순절 성경필사","3"'));
  assert.ok(statsCsv({ ...STATS, repeaters: [{ n: 1, name: '홍"길동', label: "x", times: 9, events: [] }] }, new Map(), 3)
    .includes('"홍""길동"'));
});

test("statsCsv — 수식으로 안 읽히게(roster-logic.js csvCell) — 이름·소속이 = + - @ 로 시작하면 앞에 '", () => {
  const csv = statsCsv({ ...STATS, repeaters: [
    { n: 1, name: '=HYPERLINK("x")', label: "화평 20목장", times: 4, events: [] },
    { n: 2, name: "홍길동", label: "-소망 남성", times: 3, events: [] },
  ] }, new Map(), 3);
  assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'), csv);
  assert.ok(csv.includes('"\'-소망 남성"'), csv);
});

test("csvName — 한국 날짜(UTC 자정 넘은 저녁은 다음 날)", () => {
  assert.equal(csvName(new Date("2026-09-29T14:59:00Z")), "성경필사_통계_20260929.csv");
  assert.equal(csvName(new Date("2026-09-29T15:00:00Z")), "성경필사_통계_20260930.csv");
});

test("이력 — 몇 분·모두 몇 회 · 한 줄의 소속·직분(📋 회차·명단 whoText 꼴)", () => {
  const groups = [{ n: 1, label: "홍길동 · 화평 20목장", rows: [{}, {}, {}] }, { n: 2, label: "홍길동 · 청년부", rows: [{}] }];
  assert.deepEqual(histSummary(groups), { people: 2, times: 4 });
  assert.deepEqual(histSummary([]), { people: 0, times: 0 });
  assert.equal(histRowText({ who_type: "교구", group: "화평", sub: "20", position: "집사" }), "화평 20목장 · 집사");
  assert.equal(histRowText({ who_type: "교구", group: "소망", sub: "남성", position: "" }), "소망 남성");
  assert.equal(histRowText({ who_type: "교회학교", group: "청년부", sub: "", position: "" }), "청년부");
});

test("이 화면이 보일 오류 코드는 모두 한국말이 있다(ui.js MESSAGES · Task 10)", () => {
  for (const code of ["no-name", "bad-char", "too-long", "bad-event-id"]) {
    assert.notEqual(errorText({ error: code }), "처리하지 못했어요", code);
  }
});

test("메뉴 — 성경필사(암송) 세 메뉴가 사역신청 뒤·시스템 앞에 차례대로 · CONTRACT 줄 그대로 · 역할 bibleevent", () => {
  // 2026-09-30 친구: 교인명부를 맨 위로 — 그래서 성경필사(암송) 뒤는 교인명부가 아니라 시스템이다(tests/registry.test.mjs 묶음 차례)
  const ids = MENUS.map((m) => m.id);
  const i = ids.indexOf("be-roster");
  assert.deepEqual(ids.slice(i, i + 3), ["be-roster", "be-upload", "be-history"]);
  assert.equal(MENUS.filter((m) => m.group === "성경필사(암송)").length, 3);
  // 다른 세션이 사역신청·교인명부에 메뉴를 더해도 깨지지 않게 — 옆 메뉴의 id 가 아니라 묶음으로 본다
  assert.equal(MENUS[i - 1].group, "사역신청");
  assert.equal(MENUS[i + 3].group, "시스템");
  const m = MENUS.find((x) => x.id === "be-history");
  assert.deepEqual([m.group, m.icon, m.label, m.desc, m.role],
    ["성경필사(암송)", "👤", "사람별 이력·통계", "이름으로 찾기 · 회차별·교구별 · 여러 번 참여", "bibleevent"]);
  const groups = [...new Set(MENUS.map((x) => x.group))];
  assert.equal(groups.indexOf("성경필사(암송)"), groups.indexOf("사역신청") + 1);
  assert.equal(groups.indexOf("시스템"), groups.indexOf("성경필사(암송)") + 1);
});

test("화면 모듈이 Node 에서 읽힌다 — import 한 이름이 모두 있다(틀리면 여기서 SyntaxError)", async () => {
  const m = await import("../js/menus/bibleevent/history.js");
  assert.equal(typeof m.render, "function");
});

// ---------- 작은 지적 C(2026-09-30) ----------
import * as historyLogic from "../js/menus/bibleevent/history-logic.js";

test("fitRepeat — 새 통계에 맞춘 「N회 이상」: 없으면 3 · 있으면 그대로 · 가장 많은 횟수보다 크면 그 횟수 · 작으면 처음(minrepeat-reset)", () => {
  const { fitRepeat } = historyLogic;
  assert.equal(typeof fitRepeat, "function", "history-logic.js 가 fitRepeat 를 내보내야 한다");
  assert.equal(fitRepeat([], 5), MIN_REPEAT);
  assert.equal(fitRepeat([], 5), 3);
  assert.equal(fitRepeat([{ min: 3 }, { min: 4 }], 5), 4);
  assert.equal(fitRepeat([{ min: 3 }, { min: 4 }, { min: 5 }], 4), 4);
  assert.equal(fitRepeat([{ min: 3 }, { min: 4 }], 2), 3);
  assert.equal(fitRepeat(repeatChoices([{ times: 3 }, { times: 6 }]), 9), 6);   // 칩 목록(repeatChoices) 그대로 받는다
});

// ---------- 회차 콤보(2026-09-30) — 「통계에 넣을 회차」 고르개도 📋 회차·명단 콤보와 같은 글 ----------
import * as rosterLogicH from "../js/menus/bibleevent/roster-logic.js";

test("statsPickOptions — 「통계에 넣을 회차」 선택지: 「연·월 · 제목 전체」 · 「인원명 · 상태」(+ 👁) · 시작일 최근 먼저", () => {
  const { statsPickOptions } = historyLogic;
  assert.equal(typeof statsPickOptions, "function", "history-logic.js 가 statsPickOptions 를 내보내야 한다");
  const evs = [
    { id: "lent-2023", title: "사순절 마가복음 완서자", short_title: "완서자", opens_on: "2023-02-22", closes_on: "2023-04-09", status: "archived", count: 180, listedNow: false },
    { id: "lent-2026", title: "사순절 마가복음 완서자", short_title: "완서자", opens_on: "2026-03-01", closes_on: "2026-04-05", status: "closed", count: 231, listedNow: true },
    { id: "autumn-2026", title: "가을 말씀 동행", opens_on: "2026-10-27", closes_on: "2026-11-28", status: "draft", count: 0, listedNow: false, hasEligibility: true },
  ];
  const o = statsPickOptions(evs);
  assert.deepEqual(o.map((x) => x.value), ["autumn-2026", "lent-2026", "lent-2023"], "자격 회차도 통계에는 넣는다");
  assert.deepEqual(o[1], { value: "lent-2026", label: "2026년 3월 · 사순절 마가복음 완서자", hint: "231명 · 마감 · 👁" });
  assert.equal(o[2].label, "2023년 2월 · 사순절 마가복음 완서자");
  assert.equal(o[2].hint, "180명 · 보관");
  for (const x of o) {
    const e = evs.find((y) => y.id === x.value);
    assert.equal(x.label, rosterLogicH.evPickLabel(e));
    assert.equal(x.hint, rosterLogicH.evPickHint(e));
  }
  assert.deepEqual(statsPickOptions(null), []);
});

// ---------- 회차 차례(2026-10-01 · 친구 「순서는 연도 일자별 내림차순으로」) ----------
// 서버 statsOf 는 기간 차례(마감일 오름차순)로 준다 — 화면이 history-logic.js 한 곳에서 최근 회차 먼저로 다시 세운다.
test("recentIds — 시작일 늦은 것 먼저 → 마감일 늦은 것 먼저 → id(abc 순) · 날짜 없는 회차는 뒤 · 목록에 없는 id 는 맨 뒤 받은 차례 · 받은 배열은 그대로", () => {
  const { recentIds } = historyLogic;
  assert.equal(typeof recentIds, "function", "history-logic.js 가 recentIds 를 내보내야 한다");
  const ids = PROD.map((e) => e.id);   // 시작일 오름차순
  const labels = labelMap(PROD);
  assert.deepEqual(recentIds(ids, PROD).map((id) => labels.get(id)), [
    "2026 가을 말씀 동행",
    "2026 썸머 써 바이블 옵/말",
    "2026 사순절 마가복음",   // 시작일(2026-02-18)·마감일이 같은 둘 → id 차례: "lent-2026" < "lent-booklet-2026" → 마가복음이 먼저
    "2026 사순절 소책자",
    "2025 썸머 써 바이블 롬/갈",
    "2025 사순절 요한복음",   // 2025 도 같은 날 시작·같은 마감 → id 차례
    "2025 사순절 소책자",
    "2024 썸머 써 바이블 잠언",
    "2024 사순절 누가복음",
    "2024 사순절 소책자",
    "2023 사순절 마가복음",
    "2022 사순절 마태복음",
  ]);
  assert.equal(ids[0], "lent-2022", "받은 배열은 그대로");
  // 같은 날 시작하면 마감일 늦은 것이 먼저 — id 보다 먼저 본다
  const same = [{ id: "a", opens_on: "2026-02-18", closes_on: "2026-04-04" }, { id: "b", opens_on: "2026-02-18", closes_on: "2026-05-01" }];
  assert.deepEqual(recentIds(["a", "b"], same), ["b", "a"]);
  // 시작일이 비었거나 꼴이 아니면 날짜 있는 회차 뒤(그 안에서는 마감일 → id)
  const undated = [{ id: "n", opens_on: "" }, { id: "x", opens_on: "x" }, { id: "m", opens_on: "2026-13-01" }, { id: "d", opens_on: "2020-01-01" }];
  assert.deepEqual(recentIds(["x", "n", "m", "d"], undated), ["d", "m", "n", "x"]);
  // 회차 목록에 없는 id 는 맨 뒤, 받은 차례 그대로
  assert.deepEqual(recentIds(["zz", "lent-2022", "aa", "summer-2026"], PROD), ["summer-2026", "lent-2022", "zz", "aa"]);
  assert.deepEqual(recentIds(null, PROD), []);
  assert.deepEqual(recentIds(["b", "a"], null), ["b", "a"]);
});

test("orderStats — 막대·교구×회차 열·내려받기(세 표)·여러 번 참여한 분의 참여 회차가 한 차례(최근 회차 먼저) · 받은 통계는 그대로", () => {
  const { orderStats } = historyLogic;
  assert.equal(typeof orderStats, "function", "history-logic.js 가 orderStats 를 내보내야 한다");
  const o = orderStats(STATS, EVS);
  assert.deepEqual(o.perEvent.map((e) => e.id), ["summer-2026", "lent-2026", "lent-2025"]);
  assert.deepEqual(o.byGroup, STATS.byGroup, "교구 줄 차례는 서버 그대로(열만 바뀐다)");
  assert.deepEqual(o.repeaters.map((p) => p.events), [["summer-2026", "lent-2026", "없는-회차"], ["lent-2026"]]);
  assert.deepEqual(o.repeaters.map((p) => [p.n, p.name, p.label, p.times]), STATS.repeaters.map((p) => [p.n, p.name, p.label, p.times]));
  assert.deepEqual(STATS.perEvent.map((e) => e.id), ["lent-2026", "lent-2025", "summer-2026"], "받은 통계는 그대로");
  assert.deepEqual(STATS.repeaters[0].events, ["lent-2026", "summer-2026", "없는-회차"]);

  const labels = labelMap(EVS);
  assert.deepEqual(barRows(o.perEvent, labels).map((b) => [b.label, b.count]), [["2026 썸머 써 바이블", 1], ["2026 사순절", 3], ["2025 사순절", 0]]);
  const x = crossTable(o, labels);
  assert.deepEqual(x.cols.map((c) => c.label), ["2026 썸머 써 바이블", "2026 사순절", "2025 사순절"]);
  assert.deepEqual(x.rows[1], { head: false, label: "화평", cells: [1, 2, 0], total: 3 });
  assert.deepEqual(x.foot, { cells: [1, 3, 0], total: 4 });
  const lines = statsCsv(o, labels, 4).slice(1).split("\r\n");
  assert.deepEqual(lines.slice(2, 5), ['"2026 썸머 써 바이블","1"', '"2026 사순절","3"', '"2025 사순절","0"']);
  assert.equal(lines[7], '"구분","소속","2026 썸머 써 바이블","2026 사순절","2025 사순절","합계"');
  assert.equal(lines[8], '"교구","화평","1","2","0","3"');
  assert.equal(lines.at(-1), '"홍길동","화평 20목장","5","2026 썸머 써 바이블 · 2026 사순절 · 없는-회차"');

  // 운영 열둘 — 서버 차례(마감일 오름차순)로 와도 막대는 최근 회차 먼저, 가을 말씀 동행이 맨 위·2022 마태복음이 맨 아래
  const per = [...PROD].sort((a, b) => a.closes_on.localeCompare(b.closes_on) || a.id.localeCompare(b.id))
    .map((e) => ({ id: e.id, title: e.title, count: 1 }));
  const bars = barRows(orderStats({ perEvent: per, byGroup: [], repeaters: [] }, PROD).perEvent, labelMap(PROD)).map((b) => b.label);
  assert.equal(bars[0], "2026 가을 말씀 동행");
  assert.deepEqual(bars.slice(1, 4), ["2026 썸머 써 바이블 옵/말", "2026 사순절 마가복음", "2026 사순절 소책자"]);
  assert.equal(bars.at(-1), "2022 사순절 마태복음");
  for (const b of bars) assert.match(b, /^20\d\d /, "모든 막대 이름이 연도로 시작: " + b);
  assert.deepEqual(orderStats({}, EVS), { perEvent: [], byGroup: [], repeaters: [] });
});

// ---------- 이름표가 잘리지 않게(2026-10-01 · 「사순절 마가복음 완서:」로 잘려 보였다) ----------
import { readFileSync } from "node:fs";
const CSS = readFileSync(new URL("../css/admin.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const cssRule = (sel) => {
  const m = CSS.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{([^}]*)\\}"));
  assert.ok(m, "css/admin.css 에 " + sel + " 규칙");
  return m[1];
};

test("막대 이름표 — 말줄임 없이 낱말 단위로 줄을 바꾼다 · 13px 이상 · 누르는 자리 36px(--chip) · 폰 칸 10em · PC(640px~) 칸 14em", () => {
  const bl = cssRule(".be-hi-bl");
  assert.doesNotMatch(bl, /ellipsis|nowrap|overflow:hidden/, "자르지 않는다");
  assert.match(bl, /min-height:var\(--chip\)/, "누르는 자리 36px");
  assert.match(bl, /word-break:keep-all/, "낱말 단위로 줄바꿈(연도가 늘 첫 줄 맨 앞)");
  assert.match(bl, /overflow-wrap:anywhere/, "아주 긴 낱말만 끊는다(칸을 넘치지 않게)");
  const bar = cssRule(".be-hi-bar");
  const px = bar.match(/font-size:(\d+)px/);
  assert.ok(px && Number(px[1]) >= 13, "13px 이상: " + bar);
  assert.match(bar, /grid-template-columns:minmax\(0,10em\) minmax\(0,1fr\) minmax\(4em,auto\)/,
    "폰 — 이름 10em(360px 에서도 막대가 남는다) · 숫자 칸 4em 이상(줄마다 막대 길이가 같게)");
  assert.match(CSS, /@media \(min-width:640px\)\{\.be-hi-bar\{grid-template-columns:minmax\(0,14em\) minmax\(0,1fr\) minmax\(4em,auto\)\}\}/, "PC 이름 14em");
  assert.match(cssRule(".be-hi-bar b"), /text-align:right/);
});

test("교구×회차 표 머리 칸 — 회차 이름은 줄을 바꾼다(6~8em — 운영 이름표가 두 줄) · 표는 옆으로 밀리는 칸(.be-hi-wrap) 안에만 · 13px 이상", () => {
  const xc = cssRule(".be-hi-xc");
  assert.match(xc, /white-space:normal/);
  assert.match(xc, /word-break:keep-all/);
  assert.match(xc, /overflow-wrap:anywhere/);
  assert.match(xc, /min-width:6em/);
  assert.match(xc, /max-width:8em/);
  assert.match(cssRule(".be-hi-wrap"), /overflow-x:auto/);
  const th = cssRule(".be-hi-x thead th");
  const px = th.match(/font-size:(\d+)px/);
  assert.ok(px && Number(px[1]) >= 13, th);
  assert.match(th, /vertical-align:bottom/, "줄 수가 달라도 숫자 바로 위에 붙는다");
});

test("history.js — 차례는 통계를 받은 한 곳(orderStats) · 고른 회차 줄도 같은 차례(recentIds) · 표 머리 칸은 .be-hi-xc · 막대 링크는 그대로 회차 id", () => {
  const src = readFileSync(new URL("../js/menus/bibleevent/history.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.equal((src.match(/orderStats\(/g) || []).length, 1, "통계를 받은 곳 한 번만 — 그리기·내려받기는 그 결과를 쓴다");
  assert.match(src, /stats = orderStats\(\{ perEvent: d\.perEvent \|\| \[\], byGroup: d\.byGroup \|\| \[\], repeaters: d\.repeaters \|\| \[\] \}, events\)/);
  assert.match(src, /recentIds\(ids, events\)\.map\(\(id\) => labels\.get\(id\) \|\| id\)/);
  assert.match(src, /<th><span class="be-hi-xc">\$\{esc\(c\.label\)\}<\/span><\/th>/);
  assert.match(src, /<a class="be-hi-bl" href="\$\{rosterHref\(b\.id\)\}">\$\{esc\(b\.label\)\}<\/a>/, "명단 링크는 이름표가 아니라 id");
});
