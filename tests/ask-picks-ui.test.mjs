// 🤖 성도 묻기 — 고르기 칸 화면 순수 도우미(js/menus/people/ask-logic.js · 2026-10-19). DOM 없이 돈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PICK_FROM, picksToSend, pickSummary } from "../js/menus/people/ask-logic.js";
import { PICK_FROM as SERVER_PICK_FROM } from "../supabase/functions/church-admin/ask-people.ts";

const OPTS = ["장로 전체", "시무장로", "은퇴장로", "직분 없음"];

test("PICK_FROM — 화면과 서버가 글자까지 같다", () => {
  assert.deepEqual(PICK_FROM, SERVER_PICK_FROM);
});

test("picksToSend — 안 고름 · 일부 · 모두(= 조건 없음) · 목록 밖 값 · 겹친 값", () => {
  assert.deepEqual(picksToSend([], OPTS), []);
  assert.deepEqual(picksToSend(["시무장로", "장로 전체"], OPTS), ["시무장로", "장로 전체"]);
  assert.deepEqual(picksToSend([...OPTS], OPTS), []);
  assert.deepEqual(picksToSend(["없는 값", "시무장로"], OPTS), ["시무장로"]);
  assert.deepEqual(picksToSend(["시무장로", "시무장로"], OPTS), ["시무장로"]);
  assert.deepEqual(picksToSend(["시무장로"], []), []);   // 목록을 아직 못 받았으면 보내지 않는다
});

test("pickSummary — 전체 · 하나 · 여럿 · 모두", () => {
  assert.equal(pickSummary([], OPTS), "전체");
  assert.equal(pickSummary(["시무장로"], OPTS), "시무장로");
  assert.equal(pickSummary(["시무장로", "은퇴장로", "직분 없음"], OPTS), "시무장로 외 2");
  assert.equal(pickSummary([...OPTS], OPTS), "모두");
});
