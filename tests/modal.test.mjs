// 직접 만든 입력 창(js/core/modal.js)의 순수 부분. 창을 여닫는 DOM 동작(뒤로 가기·Esc·바깥·창 안 확인)은
// 브라우저에서 본다(Task 9 Step 8 · Task 14 점검표).
import { test } from "node:test";
import assert from "node:assert/strict";
import { submitOutcome, DIRTY_TEXT, openForm, closeAllForms } from "../js/core/modal.js";

test("submitOutcome — ok 면 닫고 value 로 · value 가 없으면 true · null 은 null(바뀐 것 없음)", () => {
  assert.deepEqual(submitOutcome({ ok: true, value: { id: 7 } }), { close: true, value: { id: 7 }, message: "" });
  assert.deepEqual(submitOutcome({ ok: true }), { close: true, value: true, message: "" });
  assert.deepEqual(submitOutcome({ ok: true, value: null }), { close: true, value: null, message: "" });
});

test("submitOutcome — 실패는 창을 두고 빨간 줄: message 가 먼저, 없으면 오류 코드를 한국말로(번호는 괄호)", () => {
  assert.deepEqual(submitOutcome({ ok: false, message: "적으신 것을 적어 두세요" }),
    { close: false, value: null, message: "적으신 것을 적어 두세요" });
  assert.deepEqual(submitOutcome({ ok: false, error: "conflict", message: "직접 쓴 글" }),
    { close: false, value: null, message: "직접 쓴 글" });
  assert.equal(submitOutcome({ ok: false, error: "conflict" }).message, "다른 분이 먼저 바꿨어요 — 새로 불러올게요");
  assert.equal(submitOutcome({ ok: false, error: "server", code: "42P01" }).message, "서버에서 문제가 생겼어요 (42P01)");
  assert.equal(submitOutcome({ ok: false, error: "모르는-코드" }).message, "처리하지 못했어요");
});

test("submitOutcome — {ok:false} 만이거나 답이 없으면 창을 두고 줄도 없다(두 단계 확인의 첫 단계)", () => {
  assert.deepEqual(submitOutcome({ ok: false }), { close: false, value: null, message: "" });
  assert.deepEqual(submitOutcome(undefined), { close: false, value: null, message: "" });
  assert.deepEqual(submitOutcome(null), { close: false, value: null, message: "" });
});

test("DIRTY_TEXT — 설계 문구 그대로", () => {
  assert.equal(DIRTY_TEXT, "저장하지 않은 내용이 있어요 — 닫을까요?");
});

test("Node 에서 불러와도 document·history 를 만지지 않는다 · 열린 창이 없으면 closeAllForms 는 아무 일도 안 한다", () => {
  assert.equal(typeof openForm, "function");
  closeAllForms();
});
