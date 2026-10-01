// 사역 이력 — 표 쪽(history-db.ts)의 순수한 부분: 줄 다듬기·검사 · 응답 칸 지도(교인ID 가리기) · 쓰지 않고 끝나는 입력
//   + 검토 반영(2026-10-01 과제 4): 쓴 뒤 바로 기록(쓰기·기록 순서) · 갱신이 줄을 못 맞혔을 때(not-found) 기록 없음.
//   db 를 쓰는 부분은 실제 DB 없이는 전부 보기 어렵다 — 쪽(table)·부른 메서드 이름만 보고 답을 주는 아주 작은 가짜 쿼리빌더로
//   딱 이 두 자리(쓴 뒤 기록 · 갱신 0행)만 확인한다. 더 큰 흐름(올리기 한 바퀴·고르기·오타 후보)은 개발 서버 시험(과제 7)에서.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyHistoryRow, rowOut, makeHistory, HISTORY_FIELD_MAX } from "../supabase/functions/church-admin/history-db.ts";

// 아주 작은 가짜 쿼리빌더 — supabase-js 체인(.select().eq()... await)을 흉내만 낸다.
// resolver(table, 부른 메서드 이름 배열) 가 {data,error} 를 돌려주거나 던진다(DB 오류를 흉내).
class FakeQB {
  constructor(table, resolver) { this.table = table; this.resolver = resolver; this.calls = []; }
  _push(name, args) { this.calls.push(name); return this; }
  select(...a) { return this._push("select", a); }
  insert(...a) { return this._push("insert", a); }
  update(...a) { return this._push("update", a); }
  eq(...a) { return this._push("eq", a); }
  in(...a) { return this._push("in", a); }
  is(...a) { return this._push("is", a); }
  not(...a) { return this._push("not", a); }
  order(...a) { return this._push("order", a); }
  range(...a) { return this._push("range", a); }
  maybeSingle() { return this._push("maybeSingle"); }
  single() { return this._push("single"); }
  then(onRes, onRej) { return Promise.resolve().then(() => this.resolver(this.table, this.calls)).then(onRes, onRej); }
}
const fakeDb = (resolver) => ({ from: (t) => new FakeQB(t, resolver), rpc: async () => { throw new Error("이 시험은 rpc 를 쓰지 않는다"); } });

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

test("rowOut — in_directory(지금 명부에 있는지) · person_id 없으면 늘 null · basic 엔 그래도 person_id 없음", () => {
  const r = { id: 1, year: 2024, committee: "", team: "", role_title: "", name: "가", position: "", mok: "", renewal: "",
    src_note: "", person_id: 5, link_how: "auto", match_basis: "", match_reason: "", source: "excel", updated_at: "t" };
  assert.equal(rowOut(r, false, true).in_directory, true);
  assert.equal(rowOut(r, false, false).in_directory, false);
  assert.equal(rowOut(r, false).in_directory, null);                         // 안 넘기면(알 수 없음) null
  assert.equal(rowOut({ ...r, person_id: null }, false, true).in_directory, null); // 교적 자체가 없으면 늘 null
  assert.equal("person_id" in rowOut(r, false, true), false);
  assert.equal(rowOut(r, true, true).person_id, 5);
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

test("올리기(저장) — 쓴 뒤 바로 기록(history.upload) · 뒤이은 다시 맞추기가 실패해도 기록은 남고 rematched:false", async () => {
  const audits = [];
  const db = fakeDb((table, calls) => {
    if (table === "church_people") throw new Error("시험 — 명부 읽기 실패(다시 맞추기 첫 걸음)");
    if (table === "ministry_history_imports") {
      if (calls.includes("insert")) return { data: { id: 1 }, error: null };
      if (calls.includes("update")) return { error: null };
    }
    if (table === "ministry_history") {
      if (calls.includes("insert")) return { error: null };          // 줄 넣기
      if (calls.includes("range")) return { data: [], error: null }; // judgeUpload 의 같은 줄 찾기(빈 표)
    }
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  const res = await H.upload(ctx, { rows: [{ year: 2024, name: "가나다", team: "찬양대" }], file_name: "x.xlsx" }, true);
  assert.equal(res.ok, true);
  assert.equal(res.saved, 1);
  assert.equal(res.rematched, false);
  assert.equal("linked" in res, false);                               // 실패했으니 붙음/안 붙음 수는 안 싣는다
  assert.equal(audits.length, 1);
  assert.equal(audits[0][1], "history.upload");                       // 다시 맞추기 전에 이미 기록됨
});

test("잇기 — 그사이 빠진 줄(갱신 0행)은 not-found · 기록을 남기지 않는다", async () => {
  const audits = [];
  const db = fakeDb((table, calls) => {
    if (table === "ministry_history") {
      if (calls.includes("maybeSingle")) return { data: { id: 7, year: 2024, person_id: null, deleted_at: null }, error: null };
      if (calls.includes("update")) return { data: [], error: null }; // .select("id") 가 빈 배열 — 갱신이 줄을 못 찾음
    }
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  const res = await H.link(ctx, { id: 7, op: "none" });
  assert.equal(res.ok, false);
  assert.equal(res.error, "not-found");
  assert.equal(audits.length, 0);
});
