import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceLine, affText, initialOf, csvText, EXPORT_COLS, detailRows, searchPayload, pageInfo, exportName, familyOrder }
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
  assert.deepEqual(searchPayload({ q: "김", mok1: "", kind2: "", kind3: "", position: "", noPhoto: 1, page: 2 }),
    { q: "김", mok1: "", kind2: "", kind3: "", position: "", noPhoto: true, household: null, page: 2 });
  assert.equal(searchPayload({ household: 45458 }).household, 45458);
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
