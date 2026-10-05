import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByStatus, actionsFor, capacityLine, errorWord, exportFileName, addDoneText, confirmTextFor } from "../js/menus/education/enrollments-logic.js";

const course = { capacity: 2, mode: "auto", counts: { confirmed: 2, waitlisted: 1, applied: 0 } };

test("groupByStatus — 대기는 순서대로", () => {
  const g = groupByStatus([{ id: 1, status: "waitlisted", waitNo: 2 }, { id: 2, status: "waitlisted", waitNo: 1 }, { id: 3, status: "confirmed" }]);
  assert.deepEqual(g.waitlisted.map((e) => e.id), [2, 1]);
  assert.equal(g.confirmed.length, 1);
});

test("actionsFor — 상태마다 단추", () => {
  assert.deepEqual(actionsFor({ status: "applied" }, course).map((a) => a.op), ["confirm", "waitlist", "decline"]);
  assert.deepEqual(actionsFor({ status: "waitlisted" }, course).map((a) => a.op), ["confirm", "cancel"]);
  assert.deepEqual(actionsFor({ status: "confirmed" }, course).map((a) => a.op), ["cancel"]);
  assert.deepEqual(actionsFor({ status: "cancelled" }, course).map((a) => a.op), ["reopen"]);
  assert.deepEqual(actionsFor({ status: "declined" }, course).map((a) => a.op), ["reopen"]);
});

test("capacityLine", () => {
  assert.equal(capacityLine(course), "정원 2 · 확정 2 · 대기 1");
  assert.equal(capacityLine({ capacity: null, counts: { confirmed: 5, waitlisted: 0, applied: 3 } }), "정원 제한 없음 · 확정 5 · 승인 기다림 3");
});

test("errorWord", () => {
  assert.equal(errorWord("full"), "정원이 찼어요");
  assert.equal(errorWord("too-late"), "이미 시작한 강좌예요");
  assert.equal(errorWord("changed"), "명부가 바뀌었어요. 다시 찾아 주세요");
  assert.equal(errorWord("x"), "저장하지 못했어요 (x)");
});

test("exportFileName — 파일 이름에 못 쓰는 글자는 뺀다", () => {
  assert.equal(exportFileName("제자훈련 1단계", "2026-10-05"), "교육신청_제자훈련 1단계_2026-10-05.xlsx");
  assert.equal(exportFileName('a/b\c:d*e?f"g<h>i|j', "2026-10-05"), "교육신청_abcdefghij_2026-10-05.xlsx");
  assert.equal(exportFileName("///", "2026-10-05"), "교육신청_강좌_2026-10-05.xlsx");
});

test("addDoneText — 대신 등록 결과 문구", () => {
  assert.equal(addDoneText({ ok: true, already: true }), "이미 명단에 있어요");
  assert.equal(addDoneText({ ok: true, revived: true }), "다시 받았어요");
  assert.equal(addDoneText({ ok: true, status: "confirmed" }), "등록했어요");
});

test("confirmTextFor — 확인 창 문구", () => {
  assert.equal(confirmTextFor("cancel", "홍길동"), "홍길동 님의 신청을 취소할까요? 선착순 강좌면 대기 첫 분이 확정돼요.");
  assert.equal(confirmTextFor("decline", "홍길동"), "홍길동 님의 신청을 반려할까요?");
  assert.equal(confirmTextFor("waitlist", "홍길동"), "홍길동 님을 대기로 돌릴까요? 대기 줄 맨 뒤로 가요.");
  assert.equal(confirmTextFor("confirm", "홍길동"), "");
});
