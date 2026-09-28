import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, affiliation, kstTime, errorText } from "../js/core/ui.js";

test("esc", () => assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;"));

test("affiliation — 「화평 20목장」·「중등부 3학년」", () => {
  assert.equal(affiliation({ type: "교구", gu: "화평", mok: "20" }), "화평 20목장");
  assert.equal(affiliation({ type: "교구", gu: "화평", mok: "20목장" }), "화평 20목장");
  assert.equal(affiliation({ type: "교회학교", bu: "중등부", grade: "3학년" }), "중등부 3학년");
  assert.equal(affiliation(null), "");
});

test("kstTime — 한국 시각", () => {
  assert.equal(kstTime("2026-09-28T05:05:00Z"), "2026.09.28 14:05");
  assert.equal(kstTime(""), "");
  assert.equal(kstTime("nope"), "");
});

test("errorText — 코드는 괄호로 덧붙인다", () => {
  assert.equal(errorText({ error: "forbidden" }), "이 메뉴를 쓸 권한이 없어요");
  assert.equal(errorText({ error: "server", code: "42P01" }), "서버에서 문제가 생겼어요 (42P01)");
  assert.equal(errorText({ error: "???" }), "처리하지 못했어요");
});
