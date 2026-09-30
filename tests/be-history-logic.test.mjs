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
const EVS = [
  { id: "autumn-2026", title: "가을 말씀 동행", short_title: "가을 동행", closes_on: "2026-11-28", count: 0 },
  { id: "summer-2026", title: "2026 썸머 써 바이블", short_title: "", closes_on: "2026-08-31", count: 199 },
  { id: "lent-booklet-2026", title: "2026 사순절 소책자", short_title: "소책자 26", closes_on: "2026-04-05", count: 80 },
  { id: "lent-2026", title: "2026 사순절 성경필사", short_title: "사순절 26", closes_on: "2026-04-05", count: 515 },
  { id: "lent-2025", title: "2025 사순절 성경필사", short_title: "사순절 25", closes_on: "2025-04-20", count: 400 },
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

test("labelMap — 짧은 이름 → 제목 → id", () => {
  const m = labelMap(EVS);
  assert.equal(m.get("lent-2026"), "사순절 26");
  assert.equal(m.get("summer-2026"), "2026 썸머 써 바이블");
  assert.equal(labelMap([{ id: "x-1", title: "", short_title: "" }]).get("x-1"), "x-1");
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
  assert.deepEqual(x.cols, [{ id: "lent-2026", label: "사순절 26" }, { id: "lent-2025", label: "사순절 25" }, { id: "summer-2026", label: "2026 썸머 써 바이블" }]);
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

test("statsCsv — BOM · \\r\\n · 세 표 · 따옴표 · 회차 id 는 짧은 이름으로 · 여러 번 참여는 「이름」「소속」 두 칸 · 근삿값 안내", () => {
  const csv = statsCsv(STATS, labelMap(EVS), 4);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.deepEqual(csv.slice(1).split("\r\n"), [
    '"회차별 인원"',
    '"회차","인원"',
    '"2026 사순절 성경필사","3"',
    '"2025 사순절 성경필사","0"',
    '"2026 썸머 써 바이블","1"',
    "",
    '"교구(부서) × 회차 — 명단 줄 수"',
    '"구분","소속","사순절 26","사순절 25","2026 썸머 써 바이블","합계"',
    '"교구","화평","2","0","1","3"',
    '"교구","기쁨","1","0","0","1"',
    '"교회학교","청년부","0","0","0","0"',
    '"합계","","3","0","1","4"',
    "",
    `"여러 번 참여한 분 — 4회 이상 · ${APPROX}"`,
    '"이름","소속","횟수","참여 회차"',
    '"홍길동","화평 20목장","5","사순절 26 · 2026 썸머 써 바이블 · 없는-회차"',
  ]);
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
