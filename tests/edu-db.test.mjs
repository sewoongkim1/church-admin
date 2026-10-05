import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEdu } from "../supabase/functions/church-admin/edu-db.ts";

const COURSE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

// 가짜 db — 이어 붙인 질의를 기록하고, 신청 줄 조회에는 prev 를 돌려주고, edu_apply 를 부른 횟수를 센다
function setup({ prev = [], pick, applyRes, rows } = {}) {
  const log = { q: [], rpc: [], audit: [], writes: 0 };
  const chain = (table) => {
    const c = { calls: [] };
    const m = new Proxy(c, { get(_, k) {
      if (k === "then") return (res) => res({ data: prev, error: null });
      if (k === "update" || k === "insert" || k === "delete") log.writes++;
      return (...a) => { c.calls.push([k, ...a]); return m; };
    } });
    log.q.push({ table, c });
    return m;
  };
  const db = { from: chain, rpc: async (fn, args) => { log.rpc.push([fn, args]); return { data: applyRes ?? { ok: true, id: 5, status: "confirmed" }, error: null }; } };
  const audit = async (_c, action, target, detail) => { log.audit.push([action, target, detail]); };
  const deps = { peopleLookup: async () => ({}), allRows: async () => rows ?? [],
    personPick: async () => pick ?? { ok: true, ident: { name: "홍", who_type: "교구", group_name: "기쁨", sub_name: "3", ident_key: "person|9" }, appUserId: null } };
  return { edu: makeEdu(db, audit, deps), log };
}
const has = (log, ...call) => log.q[0].c.calls.some((x) => x.length === call.length && x.every((v, i) => v === call[i]));

test("반려 확인 조회 — 앱 계정이면 user_id 로, 아니면 user_id is null + ident_key 로", async () => {
  const a = setup({ pick: { ok: true, ident: { name: "홍", ident_key: "person|9" }, appUserId: USER } });
  await a.edu.eduEnrollAdd({}, { course_id: COURSE, name: "홍", pick: 0, check: {} });
  assert.ok(has(a.log, "eq", "user_id", USER)); assert.ok(!has(a.log, "is", "user_id", null));
  const b = setup();
  await b.edu.eduEnrollAdd({}, { course_id: COURSE, name: "홍", pick: 0, check: {} });
  assert.ok(has(b.log, "is", "user_id", null)); assert.ok(has(b.log, "eq", "ident_key", "person|9"));
});

test("반려했던 분 — force 없으면 was-declined(edu_apply 안 부름) · force:true 면 부르고 revived", async () => {
  const a = setup({ prev: [{ id: 5, status: "declined" }] });
  assert.deepEqual(await a.edu.eduEnrollAdd({}, { course_id: COURSE, name: "홍", pick: 0, check: {} }), { ok: false, error: "was-declined" });
  assert.equal(a.log.rpc.length, 0); assert.equal(a.log.audit.length, 0);
  const b = setup({ prev: [{ id: 5, status: "declined" }], applyRes: { ok: true, id: 5, status: "confirmed" } });
  const r = await b.edu.eduEnrollAdd({}, { course_id: COURSE, name: "홍", pick: 0, check: {}, force: true });
  assert.equal(b.log.rpc[0][0], "edu_apply"); assert.equal(b.log.rpc[0][1].p_staff, true);
  assert.equal(r.revived, true); assert.equal(b.log.audit[0][2].revived, true);
});

test("취소했던 분 — 묻지 않고 되살리고 revived · 새 분은 revived 없음 · 이미 있는 분은 revived 아님", async () => {
  const a = setup({ prev: [{ id: 5, status: "cancelled" }] });
  const r = await a.edu.eduEnrollAdd({}, { course_id: COURSE, name: "홍", pick: 0, check: {} });
  assert.equal(r.ok, true); assert.equal(r.revived, true); assert.equal(a.log.rpc.length, 1);
  const n = setup();
  assert.equal("revived" in (await n.edu.eduEnrollAdd({}, { course_id: COURSE, name: "홍", pick: 0, check: {} })), false);
  const d = setup({ prev: [{ id: 5, status: "confirmed" }], applyRes: { ok: true, id: 5, status: "confirmed", already: true } });
  assert.equal("revived" in (await d.edu.eduEnrollAdd({}, { course_id: COURSE, name: "홍", pick: 0, check: {} })), false);
});

test("고르기 단계의 changed 는 그대로 나오고 아무것도 부르지 않는다 · 직접 적은 신원은 규칙 검사", async () => {
  const a = setup({ pick: { ok: false, error: "changed" } });
  assert.deepEqual(await a.edu.eduEnrollAdd({}, { course_id: COURSE, name: "홍", pick: 3, check: {} }), { ok: false, error: "changed" });
  assert.equal(a.log.rpc.length, 0); assert.equal(a.log.q.length, 0);
  const b = setup();
  assert.deepEqual(await b.edu.eduEnrollAdd({}, { course_id: COURSE, ident: { name: "a|b" } }), { ok: false, error: "bad-ident" });
  assert.equal(b.log.rpc.length, 0);
});

test("eduFeeSet — paid 도 note 도 없으면 nothing · 쓰지도 기록하지도 않는다", async () => {
  const a = setup();
  assert.deepEqual(await a.edu.eduFeeSet({}, { id: 3 }), { ok: false, error: "nothing" });
  assert.equal(a.log.writes, 0); assert.equal(a.log.audit.length, 0); assert.equal(a.log.q.length, 0);
  const b = setup({ prev: { id: 3 } });
  assert.deepEqual(await b.edu.eduFeeSet({}, { id: 3, note: "메모" }), { ok: true });   // 메모만 저장 — fee_paid 는 patch 에 없다
  const upd = b.log.q[0].c.calls.find((x) => x[0] === "update");
  assert.equal("fee_paid" in upd[1], false); assert.equal("staff_note" in upd[1], true);
});

// 최종 검토(2026-10-05) — 정원을 늘리면 대기하신 분부터(edu_course_refill)
test("eduCourseSave — 자리가 늘면 edu_course_refill 을 부르고 promoted 를 돌려준다 · 다른 칸만 고치면 안 부른다", async () => {
  const body = (cap, mode = "auto") => ({ course: { id: COURSE, title: "제자훈련", kind: "regular", capacity: cap, mode } });
  const a = setup({ prev: { capacity: 1, mode: "auto" }, applyRes: { ok: true, promoted: 2 } });
  assert.deepEqual(await a.edu.eduCourseSave({}, body(3)), { ok: true, id: COURSE, promoted: 2 });
  assert.deepEqual(a.log.rpc, [["edu_course_refill", { p_course: COURSE }]]);
  assert.equal(a.log.audit[0][2].promoted, 2);
  const b = setup({ prev: { capacity: 3, mode: "auto" } });
  assert.deepEqual(await b.edu.eduCourseSave({}, body(3)), { ok: true, id: COURSE, promoted: 0 });
  assert.equal(b.log.rpc.length, 0, "정원 그대로인데 대기자를 올렸다");
  const c = setup({ prev: { capacity: 1, mode: "approve" } });
  assert.equal((await c.edu.eduCourseSave({}, body(5, "approve"))).promoted, 0);
  assert.equal(c.log.rpc.length, 0, "승인 강좌인데 불렀다");
  const d = setup({ prev: null });
  assert.deepEqual(await d.edu.eduCourseSave({}, body(3)), { ok: false, error: "not-found" });
  assert.equal(d.log.writes, 0); assert.equal(d.log.rpc.length, 0);
  const n = setup({ prev: { id: "new" } });   // 새 강좌는 신청이 없다 — 부르지 않는다
  const { id: _i, ...fresh } = body(3).course;
  await n.edu.eduCourseSave({}, { course: fresh });
  assert.equal(n.log.rpc.length, 0);
});

test("eduEnrollList — 대기 번호는 시각 없는 줄이 맨 뒤 · 앱 줄 ↔ 대신 등록 줄 같은 이름에 maybeDup · user_id 안 나감", async () => {
  const rows = [
    { id: 1, name: "홍길동", user_id: USER, status: "confirmed", waitlist_at: null },
    { id: 2, name: "홍길동 ", user_id: null, status: "waitlisted", waitlist_at: null },
    { id: 3, name: "김하나", user_id: null, status: "waitlisted", waitlist_at: "2027-01-05T01:00:00+00:00" },
    { id: 4, name: "이순신", user_id: USER, status: "waitlisted", waitlist_at: "2027-01-05T02:00:00+00:00" },
  ];
  const a = setup({ prev: { id: COURSE, title: "t", kind: "lecture", status: "open" }, applyRes: [], rows });
  const r = await a.edu.eduEnrollList({ course_id: COURSE });
  const by = Object.fromEntries(r.enrollments.map((e) => [e.id, e]));
  assert.deepEqual([by[3].waitNo, by[4].waitNo, by[2].waitNo], [1, 2, 3]);
  assert.deepEqual(r.enrollments.map((e) => e.maybeDup), [true, true, false, false]);
  assert.equal(JSON.stringify(r).includes(USER), false);
});
