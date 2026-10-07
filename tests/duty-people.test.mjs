// 👥 봉사자 — 화면의 말·차례·거르기 시험(js/menus/duty/people-logic.js · 2026-10-07 · 독립 검토 반영 2026-10-08)
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_YEAR, PEOPLE_SORTS, SPLIT_NOTE, YEAR_TITLE, peopleNote, sortPeople, filterPeople, isIdle, idleNote, yearWord, yearOptions, countLine, dateWord, personBadges,
  peopleSum, peopleEmpty, peopleFileName, exportDone, historyParts, whyText, historyBadges, rowPlace, historyTotals, historyScope, widenLabel, historyCut,
} from "../js/menus/duty/people-logic.js";

const P = (o) => ({ id: 1, name: "가", who: "", hasApp: false, directory: false, served: 0, inYear: 0, upcoming: 0, last: null, next: null, ...o });

test("sortPeople — 많이 선 순(그해 · 최근 · 이름) · 최근에 선 순(선 적 없는 분은 끝) · 이름순 · 새 배열", () => {
  const list = [P({ id: 1, name: "다", served: 2, inYear: 1, last: "2026-09-01" }), P({ id: 2, name: "가", served: 5, inYear: 1, last: "2026-08-01" }),
    P({ id: 3, name: "나", served: 2, inYear: 2, last: "2026-07-01" }), P({ id: 4, name: "라", served: 0 }), P({ id: 5, name: "마", served: 2, inYear: 1, last: "2026-10-01" })];
  assert.deepEqual(sortPeople(list, "served").map((p) => p.id), [2, 3, 5, 1, 4]);
  assert.deepEqual(sortPeople(list, "recent").map((p) => p.id), [5, 1, 2, 3, 4]);
  assert.deepEqual(sortPeople(list, "name").map((p) => p.id), [2, 3, 1, 4, 5]);
  assert.deepEqual(sortPeople(list, "모름").map((p) => p.id), [2, 3, 5, 1, 4], "모르는 차례는 많이 선 순");
  assert.deepEqual(list.map((p) => p.id), [1, 2, 3, 4, 5], "받은 배열은 그대로");
  assert.deepEqual(sortPeople(null, "name"), []);
  assert.deepEqual(PEOPLE_SORTS.map((s) => s.value), ["served", "recent", "name"]);
});

test("filterPeople — 이름·소속 · 띄어쓰기·대소문자 무시 · 빈 찾기는 모두", () => {
  const list = [P({ id: 1, name: "홍길동", who: "기쁨 3목장" }), P({ id: 2, name: "Kim Lee", who: "유년부 2학년" }), P({ id: 3, name: "김철수", who: "" })];
  assert.deepEqual(filterPeople(list, "길동").map((p) => p.id), [1]);
  assert.deepEqual(filterPeople(list, "기쁨3").map((p) => p.id), [1], "「기쁨3」도 「기쁨 3목장」에");
  assert.deepEqual(filterPeople(list, " kimlee ").map((p) => p.id), [2]);
  assert.deepEqual(filterPeople(list, "유년").map((p) => p.id), [2]);
  assert.deepEqual(filterPeople(list, "  ").map((p) => p.id), [1, 2, 3]);
  assert.deepEqual(filterPeople(list, "없는분"), []);
  assert.deepEqual(filterPeople(list, "홍").map((p) => p.id), [1], "맥에서 온 자모 나뉜 글(NFD)도 맞춘다");
});

test("isIdle · idleNote — 선 날도 앞날도 없는 분(취소·빠짐만 있는 분)은 기본으로 숨긴다", () => {
  assert.deepEqual([P({}), P({ served: 1 }), P({ upcoming: 2 }), P({ served: 0, upcoming: 0, last: "2026-10-01" })].map(isIdle), [true, false, false, true]);
  assert.equal(isIdle(null), true);
  assert.equal(idleNote(3, false), "선 날도 앞으로 설 날도 없는 3분(취소했거나 빠진 기록만 있는 분)은 숨겼어요");
  assert.equal(idleNote(3, true), "선 날도 앞으로 설 날도 없는 3분도 함께 보고 있어요");
});

test("yearWord · yearOptions — 올해/그해 · 봉사 당번이 생긴 해까지", () => {
  assert.equal(yearWord(2026, "2026-10-07"), "올해");
  assert.equal(yearWord(2025, "2026-10-07"), "2025년");
  assert.deepEqual(yearOptions("2026-10-07"), [2026]);
  assert.deepEqual(yearOptions("2028-01-02"), [2028, 2027, 2026]);
  assert.deepEqual(yearOptions(""), [FIRST_YEAR]);
  assert.deepEqual(yearOptions("2019-01-01"), [FIRST_YEAR], "생긴 해 앞은 없다");
  assert.match(YEAR_TITLE, /횟수/);
});

test("countLine — 그해 · 지금까지 · 마지막 · 앞으로(첫날) · 오늘이면 「오늘」 · 다른 해의 날짜에는 해", () => {
  assert.equal(countLine(P({ inYear: 3, served: 5, last: "2026-10-04", upcoming: 1, next: "2026-10-11" }), 2026, "2026-10-07"),
    "올해 3번 · 지금까지 5번 · 마지막 10월 4일(일) · 앞으로 1번(10월 11일(일)부터)");
  assert.equal(countLine(P({}), 2025, "2026-10-07"), "2025년 0번 · 지금까지 0번");
  // 오늘 끝난 자리는 바로 「섰던 날」이다(서버) — 그날 보면 「마지막 오늘」 · 아직 안 끝난 오늘 자리는 「오늘부터」
  assert.equal(countLine(P({ inYear: 1, served: 1, last: "2026-10-11", upcoming: 1, next: "2026-10-11" }), 2026, "2026-10-11"), "올해 1번 · 지금까지 1번 · 마지막 오늘 · 앞으로 1번(오늘부터)");
  // 해가 넘어간 뒤 — 마지막으로 선 날이 지난 해면 해를 붙인다 · 앞으로의 첫날이 다음 해여도
  assert.equal(countLine(P({ inYear: 0, served: 2, last: "2026-12-27" }), 2027, "2027-01-03"), "올해 0번 · 지금까지 2번 · 마지막 2026년 12월 27일(일)");
  assert.equal(countLine(P({ upcoming: 1, next: "2027-01-03" }), 2026, "2026-12-30"), "올해 0번 · 지금까지 0번 · 앞으로 1번(2027년 1월 3일(일)부터)");
  assert.equal(dateWord("2026-10-04", "2026-10-07"), "10월 4일(일)");
  assert.equal(dateWord("2025-10-05", "2026-10-07"), "2025년 10월 5일(일)");
});

test("personBadges · peopleSum · peopleEmpty · peopleFileName · exportDone", () => {
  assert.deepEqual(personBadges(P({ hasApp: true, directory: true })).map((b) => b.text), ["앱 계정", "명부에서 넣음"], "글자만으로 뜻이 서게(명단의 「앱」 딱지와 뜻이 다르다)");
  assert.deepEqual(personBadges(P({})).map((b) => b.text), ["직접 적음"]);
  assert.equal(peopleSum(12, 12), "12분");
  assert.equal(peopleSum(3, 12), "3분(모두 12분)");
  assert.equal(peopleEmpty("", 0), "아직 이 범위의 당번에 이름이 오른 분이 없어요");
  assert.equal(peopleEmpty(" 홍 ", 5), "「홍」에 맞는 분이 없어요");
  assert.equal(peopleEmpty("", 5, 0), "선 날이나 앞으로 설 날이 있는 분이 아직 없어요", "모두 숨긴 분뿐일 때");
  assert.equal(peopleFileName("식당 봉사", 2026, "2026-10-07"), "봉사자_2026년_식당 봉사_2026-10-07.xlsx");
  assert.equal(peopleFileName("", 2026, "2026-10-07"), "봉사자_2026년_모든 당번_2026-10-07.xlsx");
  assert.equal(peopleFileName("", 2026, "2026-10-07", "맡은 당번"), "봉사자_2026년_맡은 당번_2026-10-07.xlsx", "담당의 엑셀은 「모든 당번」이 아니다");
  assert.equal(peopleFileName("a/b:c", 2026, "2026-10-07"), "봉사자_2026년_a b c_2026-10-07.xlsx");
  assert.equal(exportDone(12), "12분을 내려받았어요");
  assert.equal(exportDone(12, { hidden: 3 }), "12분을 내려받았어요 — 선 날도 앞날도 없는 3분은 뺐어요");
  assert.equal(exportDone(12, { searching: true, hidden: 3 }), "12분을 내려받았어요 — 선 날도 앞날도 없는 3분은 뺐어요 — 찾기 글과 상관없이 이 범위의 모든 분이에요");
  assert.equal(exportDone(0, { searching: true }), "0분을 내려받았어요 — 찾기 글과 상관없이 이 범위의 모든 분이에요");
});

test("peopleNote · SPLIT_NOTE — 어느 당번의 기록인지부터 말한다(총괄 · 담당 · 좁힌 당번) · 성도님 앱과 다를 수 있다는 말", () => {
  assert.match(peopleNote("all"), /^모든 당번의 기록을 사람마다 모았어요\. /);
  assert.match(peopleNote("assigned"), /^맡은 당번의 기록을 사람마다 모았어요\(다른 당번에서 선 날은 여기 없어요\)\. /);
  assert.match(peopleNote("all", "식당 봉사"), /^「식당 봉사」 당번의 기록만 사람마다 모았어요/, "좁혔으면 총괄에게도 「모든 당번」이라고 하지 않는다");
  assert.match(peopleNote("assigned", "식당 봉사"), /^「식당 봉사」 당번의 기록만/);
  for (const s of ["all", "assigned"]) {
    assert.match(peopleNote(s), /지난 봉사/, "성도님 앱의 수와 다를 수 있다는 말");
    assert.match(peopleNote(s), /오늘 끝난 자리도 바로/, "오늘 끝난 자리는 곧 센다");
    assert.match(peopleNote(s), /보관한 뒤의 자리는 세지 않아요/);
  }
  assert.match(SPLIT_NOTE, /이 범위 안에서 확인되지 않았을 때/);
});

const R = (o) => ({ id: 1, date: "2026-10-04", board: "식당 봉사", boardStatus: "open", service: "2부", task: "설거지", start: "11:30", end: "12:30", kind: "served",
  why: null, off: false, asked: false, askWhy: null, moved: false, source: "app", ...o });

test("historyParts — 앞으로는 가까운 날부터 · 같은 자리의 두 줄은 한 번 · 빠진 기록은 그대로", () => {
  const rows = [R({ id: 9, date: "2026-10-18", kind: "upcoming" }), R({ id: 8, date: "2026-10-11", kind: "upcoming", start: "13:00", end: "14:00" }),
    R({ id: 7, date: "2026-10-11", kind: "upcoming" }), R({ id: 6, date: "2026-10-04" }), R({ id: 5, date: "2026-10-04", source: "staff" }),
    R({ id: 4, date: "2026-09-27", kind: "missed", why: "self" }), R({ id: 3, date: "2026-09-27", kind: "missed", why: "staff" }), R({ id: 2, date: "2026-09-20" })];
  const p = historyParts(rows);
  assert.deepEqual(p.up.map((r) => r.id), [7, 8, 9]);
  assert.deepEqual(p.served.map((r) => r.id), [6, 2], "한 자리의 두 줄(앱 줄 · 명부 줄)은 한 번");
  assert.deepEqual(p.missed.map((r) => r.id), [4, 3], "빠진 기록은 줄마다");
  assert.deepEqual(historyParts(null), { up: [], served: [], missed: [] });
});

test("whyText — 빠진 기록의 까닭 · 보관한 당번의 오늘·앞날은 「서지 않는 날」 · 지난 날은 「보관한 뒤의 자리」", () => {
  const t = "2026-10-07";
  assert.equal(whyText(R({ kind: "missed", why: "self" }), t), "본인이 취소했어요");
  assert.equal(whyText(R({ kind: "missed", why: "staff" }), t), "담당자가 뺐어요");
  assert.equal(whyText(R({ kind: "missed", why: "off-day" }), t), "쉬는 날이 됐어요");
  assert.equal(whyText(R({ kind: "missed", why: "off-slot" }), t), "그 자리를 쉬었어요");
  assert.equal(whyText(R({ kind: "missed", why: "archived", boardStatus: "archived", date: "2026-10-07" }), t), "보관한 당번이라 서지 않는 날이에요");
  assert.equal(whyText(R({ kind: "missed", why: "archived", boardStatus: "archived", date: "2026-10-20" }), t), "보관한 당번이라 서지 않는 날이에요");
  assert.equal(whyText(R({ kind: "missed", why: "archived", boardStatus: "archived", date: "2026-10-01" }), t), "당번을 보관한 뒤의 자리예요");
  assert.equal(whyText(R({ kind: "missed", why: "hidden" }), t), "", "처음 판의 이름(hidden)은 이제 없다 — 준비 중 당번은 살아 있는 명단이다");
  assert.equal(whyText(R({ kind: "missed", why: null }), t), "");
  assert.equal(whyText(null, t), "");
});

test("historyBadges · rowPlace · historyTotals · historyCut", () => {
  assert.deepEqual(historyBadges(R({ kind: "upcoming", off: true, asked: true, askWhy: "cant", moved: true, source: "staff", boardStatus: "draft" })).map((b) => b.text),
    ["쉼", "⚠️ 사정이 생겨 못 온대요", "옮김", "담당자가 넣음", "준비 중 당번"]);
  assert.deepEqual(historyBadges(R({ off: true, asked: true, askWhy: "x", boardStatus: "archived" })).map((b) => b.text), ["⚠️ 못 온다고 알렸어요", "보관한 당번"],
    "쉼 딱지는 앞으로 줄에만(섰던 날·빠진 기록의 쉼은 까닭이 말한다)");
  assert.equal(historyBadges(R({ asked: true, askWhy: "cant" }))[0].cls, "warn");
  assert.deepEqual(historyBadges(null), []);
  assert.equal(rowPlace(R({})), "식당 봉사 · 2부 설거지 · 11:30~12:30");
  assert.equal(rowPlace(R({ task: "" })), "식당 봉사 · 2부 · 11:30~12:30");
  assert.equal(historyTotals({ inYear: 2, served: 4, upcoming: 1 }, 2026, "2026-10-07"), "올해 2번 · 지금까지 4번 · 앞으로 1번");
  assert.equal(historyCut({ total: 450, rows: new Array(400) }), "가장 가까운 400줄만 보여요(모두 450줄)");
  assert.equal(historyCut({ total: 3, rows: [1, 2, 3] }), "");
});

test("historyScope · widenLabel — 「지금까지 N번」이 어느 당번 안의 수인지 서버가 준 범위로 말한다 · 담당에게 「모든 당번」이라고 하지 않는다", () => {
  assert.equal(historyScope({ scope: "all", narrowed: false, boards: 5 }), "모든 당번(5개)의 기록이에요");
  assert.equal(historyScope({ scope: "assigned", narrowed: false, boards: 2 }), "맡은 당번(2개)의 기록이에요 — 다른 당번에서 선 날은 여기 없어요");
  assert.equal(historyScope({ scope: "assigned", narrowed: true, boards: 1 }, "식당 봉사"), "「식당 봉사」 당번의 기록만 보고 있어요");
  assert.equal(historyScope({ scope: "all", narrowed: true, boards: 1 }, ""), "「고른」 당번의 기록만 보고 있어요");
  assert.equal(historyScope({ scope: "all", narrowed: false }), "모든 당번의 기록이에요", "당번 수를 모르면 수 없이");
  assert.equal(widenLabel({ scope: "assigned" }), "맡은 당번 모두의 기록 보기");
  assert.equal(widenLabel({ scope: "all" }), "모든 당번 기록 보기");
});
