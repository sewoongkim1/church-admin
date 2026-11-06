// 📊 성경암송 통계 화면 논리(js/menus/memorize/stats-logic.js · 2026-10-13) — 순수 시험 · preflight 가 돈다.
//   옛 성경암송 admin-stats.html 네 화면(기간별·구절별·도전·축복 기도문)의 거르기·차례·합계·글이 그대로인지 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TABS, QUICK, MSG, nText, sumOf, addDays, quickRange, defaultRange, quickOf, rangeText, dateText, gubunCls,
  USAGE_KPI, usageCols, usageCell, usageBars, barPct, verseLabels, verseLabel, verseView,
  sosokOptions, challengeView, sosokLabel, blessingView, blessingWho, usageView, USAGE_NOTE } from "../js/menus/memorize/stats-logic.js";
import { GU_ORDER, BU_ORDER } from "../js/menus/bibleevent/roster-logic.js";

test("보기 다섯(⑤ 는 2026-11 · 이름 featureUsage — usage 는 ① 이 쓴다) · 빠른 기간 셋(옛 화면의 단추 이름)", () => {
  assert.deepEqual(TABS.map(([k]) => k), ["usage", "verses", "challenge", "blessing", "featureUsage"]);
  assert.deepEqual(TABS.map(([, t]) => t), ["기간별 사용현황", "구절별 현황", "도전 현황", "축복 기도문 사용현황", "📤 보내기 · 💬 게시판"]);
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

// ⑤ 📤 보내기 · 💬 게시판 — 성경암송 api featureUsage 의 답(설계 2-5 꼴 · user_id 없음 · 어린 부서 줄은 api 가 뺀다)
const FEATURE = {
  ok: true,
  summary: { board: { people: 2, count: 9 }, share: { people: 1, count: "3" } },
  byKind: [
    { item: 1, label: "가정 축복 기도문", open: 4, kakao: 0, sheet: 2, save: 1, people: 1 },
    { item: 3, label: "이번 주 말씀", open: 1, kakao: 1, sheet: 0, save: 0, people: 1 },
  ],
  byUser: [
    { gubun: "교구", sosok: "화평", sebu: "20", name: "<b>나</b>", boardDays: 2, boardCount: 7, open: 5, kakao: 1, sheet: 2, save: 1, last: "2026-11-06",
      user_id: "00000000-0000-0000-0000-000000000001" },   // 서버가 잘못 실어 보내도 화면 꼴에는 들어오지 않아야 한다
    { gubun: "교회학교", sosok: "중등부", sebu: 2, name: "가", boardDays: 1, boardCount: 2, open: 0, kakao: 0, sheet: 0, save: 0, last: "2026-11-05" },
  ],
};

test("⑤ 보내기·게시판 — 서버 답을 화면 꼴로 · 이름은 원값 그대로(esc 는 그릴 때) · 차례는 서버 그대로 · user_id 는 싣지 않는다", () => {
  const d = usageView(FEATURE);
  assert.deepEqual(d.summary, { boardPeople: 2, boardCount: 9, sharePeople: 1, shareCount: 3 });
  assert.equal(d.empty, false);
  assert.deepEqual(d.byKind.map((k) => [k.item, k.label, k.open, k.kakao, k.sheet, k.save, k.people]),
    [[1, "가정 축복 기도문", 4, 0, 2, 1, 1], [3, "이번 주 말씀", 1, 1, 0, 0, 1]]);
  assert.deepEqual(d.byUser.map((u) => u.name), ["<b>나</b>", "가"]);
  assert.deepEqual(Object.keys(d.byUser[0]), ["gubun", "sosok", "sebu", "name", "boardDays", "boardCount", "open", "kakao", "sheet", "save", "last"]);
  for (const u of d.byUser) assert.ok(!("user_id" in u), "user_id 를 화면 꼴에 싣지 않는다");
  assert.equal(d.byUser[1].sebu, "2");
  assert.equal(blessingWho(d.byUser[0]), "화평-20");   // 소속 칸은 ④ 와 같은 꼴(gubun · sosok · sebu)
  assert.deepEqual([d.byUser[1].boardDays, d.byUser[1].last], [1, "2026-11-05"]);
});

test("⑤ 보내기·게시판 — 빈 답(표가 아직 없는 DB 도 서버가 이 꼴로 준다) · 게시판만 쓴 기간 · 이름 없는 종류", () => {
  const none = usageView({ ok: true, summary: { board: { people: 0, count: 0 }, share: { people: 0, count: 0 } }, byKind: [], byUser: [] });
  assert.deepEqual(none.summary, { boardPeople: 0, boardCount: 0, sharePeople: 0, shareCount: 0 });
  assert.equal(none.empty, true);
  assert.equal(usageView({}).empty, true);
  assert.equal(usageView(null).empty, true);
  const board = usageView({ summary: { board: { people: 1, count: 1 } }, byUser: [{ name: "가", boardDays: 1, boardCount: 1, last: "2026-11-06" }] });
  assert.equal(board.empty, false);
  assert.deepEqual(board.summary, { boardPeople: 1, boardCount: 1, sharePeople: 0, shareCount: 0 });
  assert.deepEqual(board.byKind, []);
  assert.deepEqual([board.byUser[0].open, board.byUser[0].kakao, board.byUser[0].gubun, board.byUser[0].sosok], [0, 0, "", ""]);
  assert.equal(usageView({ byKind: [{ item: 9, sheet: 1 }] }).byKind[0].label, "종류 9");
});

test("⑤ 화면 안내 한 줄 — 앱이 알 수 있는 것까지만(이름 표 글자 그대로) · 종류가 없을 때 · 누가 표는 참고", () => {
  assert.equal(USAGE_NOTE, "카톡인지 문자인지, 실제로 보냈는지는 앱이 알 수 없어요 · 날짜까지만 남아요 · 만 14세 미만 어린 부서는 남기지 않아요");
  assert.equal(MSG.noShare, "이 기간에 보내기 기록이 없어요.");
  assert.equal(MSG.usageWho, "이 표는 앱이 남긴 기록을 그대로 센 것이라, 참고로만 봐 주세요.");
});

test("⑤ 화면(stats.js) — featureUsage 를 기간과 함께 부르고 · 실패면 그 답 그대로(다른 탭과 같은 errorText) · 그 탭을 그리고 · 글은 모두 esc", () => {
  const src = readFileSync(new URL("../js/menus/memorize/stats.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(src.includes('if (t === "featureUsage") { const r = await call("featureUsage", p); return r.ok ? { ok: true, ...usageView(r) } : r; }'),
    "fetchTab 에 featureUsage 갈래가 없다");
  assert.ok(src.includes(': tab === "featureUsage" ? featureUsageHtml(d, from, to)'), "draw 에 featureUsage 갈래가 없다");
  const at = src.indexOf("function featureUsageHtml(");
  const end = src.indexOf("\n}\n", at);
  assert.ok(at > 0 && end > at, "featureUsageHtml 이 없다");
  const body = src.slice(at, end);
  assert.ok(body.includes("esc(USAGE_NOTE)"), "안내 한 줄이 없다");
  assert.ok(body.includes("esc(MSG.usageWho)"), "누가 표 안내가 없다");
  assert.ok(!/\$\{(r|d|s)\.[a-zA-Z]+/.test(body), "이름·소속·종류 글을 esc 없이 끼우지 않는다(td · tag · kpis 를 거친다)");
  assert.ok(!body.includes("user_id"));
});

test("안내 글은 해요체 · 「전체」 소속 안내", () => {
  for (const t of Object.values(MSG)) assert.match(t, /요\.$/);
  assert.match(MSG.allSosok, /교구나 교회학교를 고르면/);
});

test("개인정보 안내(privacy.html) 1번 — 성경암송 메뉴에서 게시판을 연 기록·보내기 기록을 이름·소속별로 본다는 한 줄(2026-11)", () => {
  const pv = readFileSync(new URL("../privacy.html", import.meta.url), "utf8");
  const s1 = pv.indexOf("<h3>1. "), s2 = pv.indexOf("<h3>2. ");
  assert.ok(s1 > 0 && s2 > s1);
  const p1 = pv.slice(s1, s2).replace(/\s+/g, " ");
  assert.ok(p1.includes("총괄 관리자와 「성경암송 관리」 역할을 드린 담당자는 이 화면의 성경암송 메뉴에서 성경암송 앱의 열람 기록 가운데 게시판을 연 날·횟수와 보내기 기록("),
    "1번에 성경암송 기록 보기 한 줄이 없다");
  assert.ok(p1.includes(")을 이름·소속별로 볼 수 있어요. 무엇을 남기고 얼마나 두는지는 앱의 안내를 따라요."));
  // featureUsage 는 다섯 값만 읽는다 — 쉴만한 물가·매일 묵상 같은 다른 열람 기록까지 이름으로 보는 것처럼 쓰지 않는다
  assert.ok(!p1.includes("앱의 열람 기록(게시판"), "열람 기록 전부를 이름으로 보는 것처럼 읽힌다");
});
