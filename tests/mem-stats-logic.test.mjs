// 📊 성경암송 통계 화면 논리(js/menus/memorize/stats-logic.js · 2026-10-13) — 순수 시험 · preflight 가 돈다.
//   옛 성경암송 admin-stats.html 네 화면(기간별·구절별·도전·축복 기도문)의 거르기·차례·합계·글이 그대로인지 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { TABS, QUICK, MSG, nText, sumOf, addDays, quickRange, defaultRange, quickOf, rangeText, dateText, gubunCls,
  USAGE_KPI, usageCols, usageCell, usageBars, barPct, verseLabels, verseLabel, verseView,
  sosokOptions, challengeView, sosokLabel, blessingView, blessingWho } from "../js/menus/memorize/stats-logic.js";
import { GU_ORDER, BU_ORDER } from "../js/menus/bibleevent/roster-logic.js";

test("보기 넷 · 빠른 기간 셋(옛 화면의 단추 이름)", () => {
  assert.deepEqual(TABS.map(([k]) => k), ["usage", "verses", "challenge", "blessing"]);
  assert.deepEqual(TABS.map(([, t]) => t), ["기간별 사용현황", "구절별 현황", "도전 현황", "축복 기도문 사용현황"]);
  assert.deepEqual(QUICK.map(([, t]) => t), ["전체기간", "이번 달", "최근 7일"]);
});

test("수 글 — 천 단위 쉼표 · 빈 값은 0 · 합계", () => {
  assert.equal(nText(112681), "112,681");
  assert.equal(nText(null), "0");
  assert.equal(nText("12"), "12");
  assert.equal(sumOf([{ a: 1 }, { a: "2" }, { a: null }, {}], "a"), 3);
  assert.equal(sumOf(null, "a"), 0);
});

test("기간 — 날짜 더하기(달·해 넘김) · 빠른 기간 · 처음 기간(최근 30일)", () => {
  assert.equal(addDays("2026-10-13", -6), "2026-10-07");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-01-05", -29), "2025-12-07");
  assert.equal(addDays("x", 1), "");
  assert.deepEqual(quickRange("all", "2026-10-13"), { from: "", to: "" });
  assert.deepEqual(quickRange("month", "2026-10-13"), { from: "2026-10-01", to: "2026-10-13" });
  assert.deepEqual(quickRange("week", "2026-10-13"), { from: "2026-10-07", to: "2026-10-13" });
  assert.equal(quickRange("nope", "2026-10-13"), null);
  assert.deepEqual(defaultRange("2026-10-13"), { from: "2026-09-14", to: "2026-10-13" });
});

test("지금 기간이 빠른 기간이면 그 이름 — 단추에 불을 켠다", () => {
  const t = "2026-10-13";
  assert.equal(quickOf("", "", t), "all");
  assert.equal(quickOf("2026-10-01", t, t), "month");
  assert.equal(quickOf("2026-10-07", t, t), "week");
  assert.equal(quickOf("2026-09-14", t, t), "");       // 처음 기간(최근 30일)은 단추가 아니다
  assert.equal(quickOf("2026-10-01", "", t), "");
});

test("기간 한 줄 — 옛 화면 rangeTxt 그대로", () => {
  assert.equal(rangeText("", ""), "전체 기간");
  assert.equal(rangeText("2026-10-01", "2026-10-13"), "2026-10-01 ~ 2026-10-13");
  assert.equal(rangeText("2026-10-01", ""), "2026-10-01 ~ 오늘");
  assert.equal(rangeText("", "2026-10-13"), "처음 ~ 2026-10-13");
});

test("날짜 단추 글 — 올해는 요일까지 · 다른 해는 해를 앞에 · 비면 열린 끝", () => {
  assert.equal(dateText("2026-10-13", "2026-10-13", "오늘까지"), "10월 13일 (화)");
  assert.equal(dateText("2025-12-07", "2026-01-05", "처음부터"), "2025년 12월 7일");
  assert.equal(dateText("", "2026-10-13", "처음부터"), "처음부터");
  assert.equal(dateText("2026-02-30", "2026-10-13", "처음부터"), "처음부터");
});

test("구분 딱지 — 교회학교만 금빛", () => {
  assert.equal(gubunCls("교구"), "ms-gb");
  assert.equal(gubunCls("교회학교"), "ms-gb school");
  assert.equal(gubunCls(""), "ms-gb");
});

const USAGE = [
  { gubun: "교구", sosok: "화평", newCount: 2, participants: 10, typing: 30, voice: 5, card: 4, total: 35 },
  { gubun: "교회학교", sosok: "유년부", newCount: 1, participants: 3, typing: 50, voice: 0, card: 0, total: 50 },
  { gubun: "교구", sosok: "믿음", newCount: 0, participants: 2, typing: 1, voice: 1, card: null, total: 2 },
];

test("① 기간별 — 수 카드 여섯(이 메뉴의 원래 차례) · 합계", () => {
  assert.deepEqual(USAGE_KPI.map(([k]) => k), ["newCount", "participants", "total", "typing", "voice", "card"]);
  assert.deepEqual(USAGE_KPI.map(([k]) => sumOf(USAGE, k)), [3, 15, 87, 81, 6, 4]);
});

test("① 기간별 — 표 칸은 받은 키 차례 · 구분·소속은 글 열 · 나머지는 수 열(빈 칸 있어도)", () => {
  const cols = usageCols(USAGE);
  assert.deepEqual(cols.map((c) => c.key), ["gubun", "sosok", "newCount", "participants", "typing", "voice", "card", "total"]);
  assert.deepEqual(cols.map((c) => c.label), ["구분", "소속", "신규", "참여", "타이핑", "음성", "카드", "합계"]);
  assert.deepEqual(cols.map((c) => c.num), [false, false, true, true, true, true, true, true]);
  assert.equal(usageCols([{ zz: "a" }])[0].label, "zz");          // 모르는 키는 그대로
  assert.equal(usageCell(1234), "1,234");
  assert.equal(usageCell("화평"), "화평");
  assert.equal(usageCell(null), "");
  assert.equal(usageCell(false), "false");
});

test("① 기간별 — 소속별 막대는 총 도전 큰 차례 · 교회학교는 🏫 · 막대 길이 %", () => {
  assert.deepEqual(usageBars(USAGE), [{ label: "🏫 유년부", v: 50 }, { label: "화평", v: 35 }, { label: "믿음", v: 2 }]);
  assert.equal(barPct(35, 50), 70);
  assert.equal(barPct(0, 0), 0);
});

test("② 구절별 — 말씀 이름(짧은 장절 · 설교 제목) · 없는 순번은 No.순번", () => {
  const map = verseLabels([
    { no: 1, refShort: "요 3:16", refFull: "요한복음 3장 16절", sermonTitle: "사랑" },
    { no: "2", refShort: "", refFull: "시편 23편 1절", sermonTitle: "" },
    { no: 3, refShort: "", refFull: "", sermonTitle: "" },
    { no: "x" },
  ]);
  assert.deepEqual(map, { 1: "요 3:16 · 사랑", 2: "시편 23편 1절", 3: "No.3" });
  assert.equal(verseLabel(map, "01"), "요 3:16 · 사랑");     // 순번 글자는 수로 맞춘다(옛 String(Number(no)))
  assert.equal(verseLabel(map, 1001), "No.1001");
  assert.equal(verseLabel(null, 7), "No.7");
});

test("② 구절별 — 서버 차례 그대로 · 사용된 구절 수 · 총 참여횟수 · 이름 없는 줄 수", () => {
  const map = { 1: "요 3:16 · 사랑" };
  const v = verseView([{ no: 1, participants: 4, count: 9 }, { no: 1001, participants: 2, count: "3" }], map);
  assert.deepEqual(v.rows.map((r) => [r.no, r.label, r.participants, r.count, r.named]),
    [[1, "요 3:16 · 사랑", 4, 9, true], [1001, "No.1001", 2, 3, false]]);
  assert.equal(v.used, 2);
  assert.equal(v.count, 12);
  assert.equal(v.unnamed, 1);
  assert.equal(verseView([], map).used, 0);
});

const RANK = [
  { name: "나", gubun: "교구", sosok: "화평", sebu: "20", count: 5, typing: 4, voice: 1 },
  { name: "가", gubun: "교구", sosok: "믿음", sebu: "3", count: 5, typing: 5, voice: 0 },
  { name: "다", gubun: "교회학교", sosok: "유년부", sebu: "3", count: 9, typing: 9, voice: 0 },
  { name: "라", gubun: "교회학교", sosok: "소년2부", sebu: "1", count: 1, typing: 0, voice: 1 },
  { name: "마", gubun: "교구", sosok: "화평", sebu: "7", count: 2, typing: null, voice: 2 },
];

test("③ 도전 — 도전횟수 많은 차례 · 같으면 이름 차례 · 합계", () => {
  const v = challengeView(RANK);
  assert.deepEqual(v.rows.map((r) => r.name), ["다", "가", "나", "마", "라"]);
  assert.deepEqual([v.people, v.typing, v.voice, v.count], [5, 18, 4, 22]);
});

test("③ 도전 — 구분으로 거르기 · 소속은 여러 개(비면 전체) · 「전체」에서는 소속을 보지 않는다", () => {
  assert.deepEqual(challengeView(RANK, { gubun: "교구" }).rows.map((r) => r.name), ["가", "나", "마"]);
  assert.deepEqual(challengeView(RANK, { gubun: "교구", sosok: ["화평"] }).rows.map((r) => r.name), ["나", "마"]);
  assert.deepEqual(challengeView(RANK, { gubun: "교회학교", sosok: ["유년부", "소년2부"] }).rows.map((r) => r.name), ["다", "라"]);
  assert.equal(challengeView(RANK, { gubun: "전체", sosok: ["화평"] }).people, 5);
  assert.equal(challengeView(RANK, { gubun: "교구", sosok: ["없는 곳"] }).people, 0);
  assert.equal(challengeView(null).people, 0);
});

test("③ 도전 — 소속 고르기 목록: 교구·부서 차례 + 기록에만 있는 소속은 뒤에 · 참여자 수", () => {
  const gu = sosokOptions("교구", RANK);
  assert.deepEqual(gu.map((o) => o.value), GU_ORDER);
  assert.equal(gu.find((o) => o.value === "화평").n, 2);
  assert.equal(gu.find((o) => o.value === "소망").n, 0);
  const bu = sosokOptions("교회학교", RANK);
  assert.deepEqual(bu.map((o) => o.value), [...BU_ORDER, "소년2부"]);
  assert.equal(bu.at(-1).n, 1);
  assert.deepEqual(sosokOptions("전체", RANK), []);
  assert.deepEqual(sosokOptions("교구", null).map((o) => o.n), GU_ORDER.map(() => 0));
  assert.deepEqual(["전체", "교구", "교회학교"].map(sosokLabel), ["교구/교회학교", "교구", "부서"]);
});

test("④ 축복 기도문 — 본 사람이 0 이면 빈 기간 · 소속 칸 「소속-세부」", () => {
  const d = blessingView({ summary: { people: 2, total: 7, days: 3 }, byPrayer: [{ no: 1 }], byUser: [{ name: "가" }] });
  assert.deepEqual(d.summary, { people: 2, total: 7, days: 3 });
  assert.equal(d.empty, false);
  assert.equal(d.byPrayer.length, 1);
  assert.equal(blessingView({ summary: { people: 0, total: 0, days: 0 }, byPrayer: [], byUser: [] }).empty, true);
  assert.equal(blessingView({}).empty, true);
  assert.equal(blessingWho({ sosok: "화평", sebu: "20" }), "화평-20");
  assert.equal(blessingWho({ sosok: "유년부", sebu: "" }), "유년부");
  assert.equal(blessingWho({}), "-");
});

test("안내 글은 해요체 · 「전체」 소속 안내", () => {
  for (const t of Object.values(MSG)) assert.match(t, /요\.$/);
  assert.match(MSG.allSosok, /교구나 교회학교를 고르면/);
});
