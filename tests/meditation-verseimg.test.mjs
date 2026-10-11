// 🌿 매일 묵상 · 🖼️ 연상 그림 화면의 순수 함수(2026-10-11)
import test from "node:test";
import assert from "node:assert/strict";
import { dayDiff, todayIndex, boldOnly } from "../js/menus/memorize/meditation.js";
import { altFor, canSave, CHECKS, PAIR_PRE, SLOTS } from "../js/menus/memorize/verseimg.js";

test("묵상 — 설교 다음 날(월)부터 7일이 그 설교의 주차", () => {
  assert.equal(dayDiff("2026-10-11", "2026-10-12"), 1);
  assert.equal(todayIndex("2026-10-11", "2026-10-11"), -1, "설교 당일(일)은 아직 지난주 것");
  assert.equal(todayIndex("2026-10-11", "2026-10-12"), 0, "월");
  assert.equal(todayIndex("2026-10-11", "2026-10-18"), 6, "다음 일요일");
  assert.equal(todayIndex("2026-10-11", "2026-10-19"), -1);
  assert.equal(todayIndex("", "2026-10-12"), -1);
  assert.equal(todayIndex("2026-12-27", "2027-01-02"), 5, "해를 넘겨도");
});
test("묵상 — 굵게만 살리고 나머지는 글자 그대로", () => {
  assert.equal(boldOnly("**하나** <b>x</b>"), "<b>하나</b> &lt;b&gt;x&lt;/b&gt;");
});
test("연상 그림 — 칸 이름 · 짝 그림 앞머리", () => {
  assert.deepEqual(SLOTS.map(([v]) => v), ["a", "b", "c"]);
  assert.equal(altFor("a", "구아슈·색연필 화풍 — 강어귀"), "강어귀");
  assert.equal(altFor("b", "강어귀"), PAIR_PRE + "강어귀");
  assert.equal(altFor("c", PAIR_PRE + "강어귀"), PAIR_PRE + "강어귀", "두 번 붙이지 않는다");
});
test("연상 그림 — 확인표를 다 채우고 설명이 있어야 저장", () => {
  assert.equal(CHECKS.length, 6);
  assert.equal(canSave(6, "a", "강어귀"), true);
  assert.equal(canSave(5, "a", "강어귀"), false);
  assert.equal(canSave(6, "a", " "), false);
  assert.equal(canSave(6, "b", PAIR_PRE), false, "앞머리만으로는 설명이 아니다");
  assert.equal(canSave(6, "b", PAIR_PRE + "강어귀"), true);
  assert.equal(canSave(6, "a", "가".repeat(81)), false, "api 는 80자까지 받는다");
});
