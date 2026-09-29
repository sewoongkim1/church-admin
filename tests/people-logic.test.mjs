import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceLine, affText, initialOf, csvText, EXPORT_COLS, detailRows, searchPayload, pageInfo, exportName, familyOrder,
  pickSummary, filterChoices, sameSet, nextSort, SORTS }
  from "../js/menus/people/people-logic.js";
import { churchBadgeHtml, hasChurch } from "../js/menus/people/church-badge.js";

test("sourceLine — 없음 · 기준일 · 90일 넘으면 오래됨", () => {
  assert.deepEqual(sourceLine(null, "2026-09-29"), { text: "아직 명부가 없어요 — 새 명단을 올려 주세요", stale: true });
  assert.deepEqual(sourceLine({ source_date: "2026-09-29", total: 8672 }, "2026-10-01"),
    { text: "명부 기준일 2026-09-29 · 8,672명", stale: false });
  assert.equal(sourceLine({ source_date: "2026-06-01", total: 1 }, "2026-09-29").stale, true);
});

test("affText — 교구 목장 · 새가족 · 청년 · 교회학교", () => {
  assert.equal(affText({ mok1: "기쁨", mok3: "기쁨-12목장" }), "기쁨 12목장");
  assert.equal(affText({ mok1: "기쁨", mok3: "기쁨-01목장" }), "기쁨 1목장");
  assert.equal(affText({ mok1: "새가족", mok3: "3월" }), "새가족 3월");
  assert.equal(affText({ mok1: "청년부", mok3: "청년-03" }), "청년부 청년-03");
  assert.equal(affText({ mok1: "", mok3: "", school_dept: "고등부" }), "고등부");
  assert.equal(affText({}), "");
});

test("initialOf · pageInfo · exportName · searchPayload", () => {
  assert.equal(initialOf("김철수"), "김");
  assert.equal(initialOf(""), "?");
  assert.deepEqual(pageInfo(120, 1, 50), { from: 51, to: 100, hasPrev: true, hasNext: true });
  assert.deepEqual(pageInfo(0, 0, 50), { from: 0, to: 0, hasPrev: false, hasNext: false });
  assert.equal(exportName({ source_date: "2026-09-29" }, 12), "교인명부_2026-09-29_12명.csv");
  assert.deepEqual(searchPayload({ q: "김", mok1: [], kind2: [], kind3: [], position: [], noPhoto: 1, page: 2 }),
    { q: "김", mok1: [], kind2: [], kind3: [], position: [], noPhoto: true, household: null, page: 2, sort: "name", dir: "asc" });
  assert.deepEqual([searchPayload({ sort: "age", dir: "desc" }).sort, searchPayload({ sort: "age", dir: "desc" }).dir], ["age", "desc"]);
  assert.equal(searchPayload({ household: 45458 }).household, 45458);
  // 거르기는 배열 — 여러 개 · 빈 값 빼기 · 문자열 하나(옛 조건)는 한 칸짜리로 · 없으면 빈 배열
  const p = searchPayload({ mok1: ["기쁨", "", "소망"], kind2: "청년" });
  assert.deepEqual(p.mok1, ["기쁨", "소망"]);
  assert.deepEqual(p.kind2, ["청년"]);
  assert.deepEqual(p.kind3, []);
  assert.deepEqual(p.position, []);
  const src = { mok1: ["기쁨"] };
  searchPayload(src).mok1.push("x");
  assert.deepEqual(src.mok1, ["기쁨"], "화면 상태를 건드리지 않는다(사본)");
});

test("nextSort — 같은 머리는 방향만 바꾸고, 다른 머리는 그 머리의 오름차순", () => {
  assert.deepEqual(nextSort({ sort: "name", dir: "asc" }, "name"), { sort: "name", dir: "desc" });
  assert.deepEqual(nextSort({ sort: "name", dir: "desc" }, "name"), { sort: "name", dir: "asc" });
  assert.deepEqual(nextSort({ sort: "name", dir: "desc" }, "age"), { sort: "age", dir: "asc" });
  assert.deepEqual(nextSort({ sort: "age", dir: "asc" }, "kind2"), { sort: "kind2", dir: "asc" });
  assert.deepEqual(nextSort({}, "name"), { sort: "name", dir: "desc" });      // 없으면 기본(이름·오름)으로 본다
  assert.deepEqual(nextSort({}, "aff"), { sort: "aff", dir: "asc" });
  assert.deepEqual(SORTS.map(([k]) => k), ["name", "age", "aff", "kind2"]);   // 서버 people-query.ts SORT_KEYS 와 같게
});

test("pickSummary — 없음 「전체」 · 1~2개는 잇고 · 3개 이상은 「첫째 외 N」", () => {
  assert.equal(pickSummary([]), "전체");
  assert.equal(pickSummary(undefined), "전체");
  assert.equal(pickSummary(["기쁨"]), "기쁨");
  assert.equal(pickSummary(["기쁨", "소망"]), "기쁨 · 소망");
  assert.equal(pickSummary(["기쁨", "소망", "믿음"]), "기쁨 외 2");
  assert.equal(pickSummary(["a", "b", "c", "d", "e"]), "a 외 4");
});

test("filterChoices — 현황(stats)에서 [값, 인원] · 「없음」 칸은 뺀다", () => {
  const c = filterChoices({
    gu: [{ gu: "믿음", n: 3, moks: 1 }, { gu: "기쁨", n: 2, moks: 2 }, { gu: "(목장 없음)", n: 9, moks: 0 }],
    kind2: [["장년", 4], ["(없음)", 2], ["청년", 1]],
    kind3: [["출석교인", 5]],
    position: [["집사", 2], ["(없음)", 7]],
  });
  assert.deepEqual(c.mok1, [["믿음", 3], ["기쁨", 2]]);
  assert.deepEqual(c.kind2, [["장년", 4], ["청년", 1]]);
  assert.deepEqual(c.kind3, [["출석교인", 5]]);
  assert.deepEqual(c.position, [["집사", 2]]);
  assert.deepEqual(filterChoices({}), { mok1: [], kind2: [], kind3: [], position: [] });
});

test("sameSet — 판이 닫힐 때 고른 것이 바뀌었나(차례는 보지 않는다)", () => {
  assert.equal(sameSet([], []), true);
  assert.equal(sameSet(["a", "b"], ["b", "a"]), true);
  assert.equal(sameSet(["a"], ["a", "b"]), false);
  assert.equal(sameSet(["a"], ["b"]), false);
});

test("familyOrder — 세대주가 맨 앞, 그다음 나이 많은 차례, 같으면 가나다", () => {
  const out = familyOrder([
    { person_id: 3, name: "다", age: 10 }, { person_id: 2, name: "나", age: 40 },
    { person_id: 1, name: "가", age: 38 }, { person_id: 4, name: "라", age: null },
  ], 1);
  assert.deepEqual(out.map((x) => x.person_id), [1, 2, 3, 4]);
  assert.deepEqual(familyOrder([], 1), []);
});

test("csvText — BOM · 머리글 · 따옴표 · 사진 있음/없음", () => {
  const csv = csvText([{ person_id: 1, name: '김"철수', has_photo: true }, { person_id: 2, name: "이영희", has_photo: false }]);
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], EXPORT_COLS.map(([, h]) => `"${h}"`).join(","));
  assert.ok(lines[1].startsWith('"1","김""철수"'));
  assert.ok(lines[1].endsWith('"있음"'));
  assert.ok(lines[2].endsWith('"없음"'));
});

test("detailRows — 빈 칸은 빼고 연락처는 전화 표시", () => {
  const rows = detailRows({ position: "집사", position_detail: "서리집사", phone1: "010-1111-2222", phone2: "", address: "시험로 1" });
  assert.deepEqual(rows.find(([k]) => k === "직분"), ["직분", "집사 · 서리집사"]);
  assert.deepEqual(rows.find(([k]) => k === "연락처"), ["연락처", "010-1111-2222", "tel"]);
  assert.equal(rows.some(([k]) => k === "연락처 2"), false);
});

test("churchBadgeHtml — 셋 · null 은 빈 글자 · reason 은 esc", () => {
  assert.equal(churchBadgeHtml(null), "");
  assert.match(churchBadgeHtml({ state: "맞음", reason: "" }), /cb-ok.*교적 ✓/);
  assert.match(churchBadgeHtml({ state: "확인 필요", reason: "<b>소속 다름" }), /&lt;b&gt;소속 다름/);
  assert.match(churchBadgeHtml({ state: "없음", reason: "" }), /cb-none.*교적 없음/);
  assert.equal(hasChurch([{ church: null }, {}]), false);
  assert.equal(hasChurch([{ church: { state: "없음", reason: "" } }]), true);
});
