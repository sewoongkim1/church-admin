import { test } from "node:test";
import assert from "node:assert/strict";
import { MINISTRY_STATUS, statusPatch } from "../supabase/functions/church-admin/ministry.ts";

const NOW = "2026-09-28T01:00:00.000Z";

test("상태는 넷 — 미채택·모르는 값은 막는다", () => {
  assert.deepEqual(MINISTRY_STATUS, ["신청완료", "접수완료", "임명확정", "취소"]);
  assert.deepEqual(statusPatch("신청완료", "미채택", undefined, NOW), { ok: false, error: "invalid-status" });
  assert.deepEqual(statusPatch("신청완료", "", undefined, NOW), { ok: false, error: "invalid-status" });
  assert.deepEqual(statusPatch("신청완료", 3, undefined, NOW), { ok: false, error: "invalid-status" });
});

test("접수 — 결정이 아니라 번호·결정일을 건드리지 않는다", () => {
  const r = statusPatch("신청완료", "접수완료", undefined, NOW);
  assert.deepEqual(r, { ok: true, patch: { status: "접수완료", updated_at: NOW }, notify: false });
});

test("임명 — 결정일을 찍고 번호를 지우고 알림을 요청", () => {
  const r = statusPatch("접수완료", "임명확정", undefined, NOW);
  assert.deepEqual(r, { ok: true, patch: { status: "임명확정", updated_at: NOW, decided_at: NOW, phone: null }, notify: true });
});

test("이미 임명인데 다시 임명 — 알림 판단은 서버(api)가 한 사람 한 해 한 번으로 거른다", () => {
  assert.equal(statusPatch("임명확정", "임명확정", undefined, NOW).notify, true);
});

test("취소는 사유가 있어야 — 공백만은 없는 것", () => {
  assert.deepEqual(statusPatch("신청완료", "취소", undefined, NOW), { ok: false, error: "cancel-note-required" });
  assert.deepEqual(statusPatch("신청완료", "취소", "   ", NOW), { ok: false, error: "cancel-note-required" });
  const r = statusPatch("신청완료", "취소", "  부서장 요청  ", NOW);
  assert.deepEqual(r, { ok: true, patch: { status: "취소", updated_at: NOW, decided_at: NOW, phone: null, note: "부서장 요청" }, notify: false });
});

test("임명에서 물러나면 알림 기록을 지운다(다시 임명하면 다시 보낼 수 있게)", () => {
  const r = statusPatch("임명확정", "접수완료", undefined, NOW);
  assert.deepEqual(r.patch, { status: "접수완료", updated_at: NOW, notified_at: null });
});

test("메모는 보내온 때만 고친다 · 500자까지", () => {
  assert.equal("note" in statusPatch("신청완료", "접수완료", undefined, NOW).patch, false);
  assert.equal(statusPatch("신청완료", "접수완료", "", NOW).patch.note, "");
  assert.deepEqual(statusPatch("신청완료", "취소", "가".repeat(501), NOW), { ok: false, error: "note-too-long" });
});
