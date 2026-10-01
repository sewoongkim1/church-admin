// 사역 이력 — 표 쪽(history-db.ts)의 순수한 부분: 줄 다듬기·검사 · 응답 칸 지도(교인ID 가리기) · 쓰지 않고 끝나는 입력
import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyHistoryRow, rowOut, makeHistory, HISTORY_FIELD_MAX } from "../supabase/functions/church-admin/history-db.ts";

test("tidyHistoryRow — 해·이름 검사 · 칸 다듬기(NFC·빈칸 접기)", () => {
  assert.equal(tidyHistoryRow({ year: 1900, name: "가" }).error, "bad-year");
  assert.equal(tidyHistoryRow({ year: "2024", name: "  " }).error, "no-name");
  const t = tidyHistoryRow({ year: "2024", name: "가나다".normalize("NFD"), team: "  가브리엘   찬양대 ", mok: "기쁨-19" });
  assert.equal(t.error, "");
  assert.deepEqual([t.row.year, t.row.name, t.row.team, t.row.mok, t.row.position], [2024, "가나다", "가브리엘 찬양대", "기쁨-19", ""]);
  assert.equal(tidyHistoryRow({ year: 2024, name: "가", team: "x".repeat(HISTORY_FIELD_MAX + 1) }).error, "history-too-long");
  assert.equal(tidyHistoryRow({ year: 2024, name: "가", src_note: "x".repeat(501) }).error, "note-too-long");
});

test("rowOut — 사역신청 역할에게는 교인ID 가 없다 · 교인명부·총괄에게만", () => {
  const r = { id: 3, year: 2024, committee: "찬양부", team: "가", role_title: "", name: "가나다", position: "집사", mok: "기쁨-19",
    renewal: "유지", src_note: "", person_id: 12345, link_how: "auto", match_basis: "같은 교구(목장 다름)", match_reason: "",
    source: "excel", updated_at: "t" };
  const basic = rowOut(r, false), full = rowOut(r, true);
  assert.equal("person_id" in basic, false);
  assert.equal(JSON.stringify(basic).includes("12345"), false);
  assert.equal(full.person_id, 12345);
  assert.deepEqual([basic.linked, basic.weak], [true, true]);
});

test("쓰지 않고 끝나는 입력 — 빈 올리기 · 확인 없는 다시 맞추기 · 없는 줄", async () => {
  const touched = [];
  const db = { from: (t) => { touched.push(t); throw new Error("표를 건드리면 안 된다: " + t); }, rpc: () => { throw new Error("rpc"); } };
  const audits = [];
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  assert.equal((await H.upload(ctx, { rows: [] }, true)).saved, 0);
  assert.equal((await H.upload(ctx, { rows: [] }, false)).ok, true);
  assert.equal((await H.rematch(ctx, {})).error, "needs-confirm");
  assert.equal((await H.rowSave(ctx, { id: 0 })).error, "not-found");
  assert.equal((await H.rowDelete(ctx, { id: 0 })).error, "not-found");
  assert.equal((await H.rowAdd(ctx, { row: {} })).error, "bad-year");
  assert.equal((await H.upload(ctx, { rows: new Array(3001).fill({}) }, false)).error, "history-too-many");
  assert.deepEqual([touched, audits], [[], []]);
});
