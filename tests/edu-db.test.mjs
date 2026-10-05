import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEdu } from "../supabase/functions/church-admin/edu-db.ts";
import { eduAttendRate } from "../supabase/functions/church-admin/edu-rules.ts";

const COURSE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const COURSE_B = "33333333-3333-4333-8333-333333333333";
const STAFF_M = "44444444-4444-4444-8444-444444444444";   // 교육 담당(맡은 강좌) — admin_members.id
const CHIEF_M = "55555555-5555-4555-8555-555555555555";
// 부르는 분(ctx) — 교육 총괄은 강좌 확인을 건너뛰고(질의 없음), 교육 담당은 edu_course_staff 줄이 있어야 한다
const CHIEF = { member: { id: CHIEF_M }, roles: ["education"] };
const STAFF = { member: { id: STAFF_M }, roles: ["educourse"] };

// 가짜 db — 이어 붙인 질의를 기록하고, 표마다 tables[표] 를(없으면 prev 를) 돌려주고, edu_apply 를 부른 횟수를 센다
//   allRows(쪽 넘기기)는 build() 의 표를 보고 — 신청 줄(edu_enrollments)이면 rows, 그 밖은 tables[표] 를 돌려준다.
//   staffRows 를 주면 edu_course_staff 는 **거르기를 지킨다**(eq·in) — 몸통의 course_id 가 아니라 서버가 고른 강좌로 물었는지 본다(IDOR 시험).
const honour = (list, calls) => list.filter((r) => calls.every(([k, col, v]) =>
  k === "eq" ? r[col] === v : k === "in" ? v.includes(r[col]) : true));
//   확정 알림(4단계) — deps.eduNotify 는 부른 것을 log.notify 에 [ids, promoted, 그때까지 부른 SQL 함수 수, 그때까지 기록 수] 로 남긴다
//   (저장·기록 **뒤**에만 불렸는지 본다) · notifyRes 로 돌려줄 값(기본 {sent: ids 수}) · notifyThrows 면 던진다 · noNotify 면 dep 를 안 준다.
function setup({ prev = [], pick, applyRes, rows, tables = {}, staffRows, notifyRes, notifyThrows, noNotify } = {}) {
  const log = { q: [], rpc: [], audit: [], writes: 0, lookups: 0, notify: [] };
  const chain = (table) => {
    const c = { calls: [] };
    const m = new Proxy(c, { get(_, k) {
      if (k === "then") return (res) => res({ data: table === "edu_course_staff" && staffRows ? honour(staffRows, c.calls)
        : table in tables ? tables[table] : prev, error: null });
      if (k === "update" || k === "insert" || k === "delete" || k === "upsert") log.writes++;
      return (...a) => { c.calls.push([k, ...a]); return m; };
    } });
    log.q.push({ table, c });
    return m;
  };
  const db = { from: chain, rpc: async (fn, args) => { log.rpc.push([fn, args]); return { data: applyRes ?? { ok: true, id: 5, status: "confirmed" }, error: null }; } };
  const audit = async (_c, action, target, detail) => { log.audit.push([action, target, detail]); };
  const deps = { peopleLookup: async () => { log.lookups++; return { ok: true, people: [] }; },
    allRows: async (build) => {
      const n = log.q.length; build();
      const t = log.q[n].table;
      return t === "edu_enrollments" ? rows ?? [] : tables[t] ?? [];
    },
    personPick: async () => pick ?? { ok: true, ident: { name: "홍", who_type: "교구", group_name: "기쁨", sub_name: "3", ident_key: "person|9" }, appUserId: null } };
  if (!noNotify) deps.eduNotify = async (ids, promoted) => {
    log.notify.push([ids, promoted, log.rpc.length, log.audit.length]);
    if (notifyThrows) throw new Error("api down");
    return notifyRes === undefined ? { sent: ids.length } : notifyRes;
  };
  return { edu: makeEdu(db, audit, deps), log };
}
const has = (log, ...call) => log.q[0].c.calls.some((x) => x.length === call.length && x.every((v, i) => v === call[i]));

test("반려 확인 조회 — 앱 계정이면 user_id 로, 아니면 user_id is null + ident_key 로", async () => {
  const a = setup({ pick: { ok: true, ident: { name: "홍", ident_key: "person|9" }, appUserId: USER } });
  await a.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍", pick: 0, check: {} });
  assert.ok(has(a.log, "eq", "user_id", USER)); assert.ok(!has(a.log, "is", "user_id", null));
  const b = setup();
  await b.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍", pick: 0, check: {} });
  assert.ok(has(b.log, "is", "user_id", null)); assert.ok(has(b.log, "eq", "ident_key", "person|9"));
});

test("반려했던 분 — force 없으면 was-declined(edu_apply 안 부름) · force:true 면 부르고 revived", async () => {
  const a = setup({ prev: [{ id: 5, status: "declined" }] });
  assert.deepEqual(await a.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍", pick: 0, check: {} }), { ok: false, error: "was-declined" });
  assert.equal(a.log.rpc.length, 0); assert.equal(a.log.audit.length, 0);
  const b = setup({ prev: [{ id: 5, status: "declined" }], applyRes: { ok: true, id: 5, status: "confirmed" } });
  const r = await b.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍", pick: 0, check: {}, force: true });
  assert.equal(b.log.rpc[0][0], "edu_apply"); assert.equal(b.log.rpc[0][1].p_staff, true);
  assert.equal(r.revived, true); assert.equal(b.log.audit[0][2].revived, true);
});

test("취소했던 분 — 묻지 않고 되살리고 revived · 새 분은 revived 없음 · 이미 있는 분은 revived 아님", async () => {
  const a = setup({ prev: [{ id: 5, status: "cancelled" }] });
  const r = await a.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍", pick: 0, check: {} });
  assert.equal(r.ok, true); assert.equal(r.revived, true); assert.equal(a.log.rpc.length, 1);
  const n = setup();
  assert.equal("revived" in (await n.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍", pick: 0, check: {} })), false);
  const d = setup({ prev: [{ id: 5, status: "confirmed" }], applyRes: { ok: true, id: 5, status: "confirmed", already: true } });
  assert.equal("revived" in (await d.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍", pick: 0, check: {} })), false);
});

test("고르기 단계의 changed 는 그대로 나오고 아무것도 부르지 않는다 · 직접 적은 신원은 규칙 검사", async () => {
  const a = setup({ pick: { ok: false, error: "changed" } });
  assert.deepEqual(await a.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍", pick: 3, check: {} }), { ok: false, error: "changed" });
  assert.equal(a.log.rpc.length, 0); assert.equal(a.log.q.length, 0);
  const b = setup();
  assert.deepEqual(await b.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, ident: { name: "a|b" } }), { ok: false, error: "bad-ident" });
  assert.equal(b.log.rpc.length, 0);
});

test("eduFeeSet — paid 도 note 도 없으면 nothing · 쓰지도 기록하지도 않는다", async () => {
  const a = setup();
  assert.deepEqual(await a.edu.eduFeeSet(CHIEF, { id: 3 }), { ok: false, error: "nothing" });
  assert.equal(a.log.writes, 0); assert.equal(a.log.audit.length, 0); assert.equal(a.log.q.length, 0);
  const b = setup({ prev: { id: 3 } });
  assert.deepEqual(await b.edu.eduFeeSet(CHIEF, { id: 3, note: "메모" }), { ok: true });   // 메모만 저장 — fee_paid 는 patch 에 없다
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
  for (const x of [a, b, c, d, n]) assert.equal(x.log.notify.length, 0, "올린 번호(ids)가 없는데 알림을 부탁했다");
});

// ---------- 확정 알림(4단계 · 2026-10-05) — 저장이 끝난 뒤에만 성경암송 api 에 부탁 · 실패는 삼켜 notifyError 로 ----------
test("확정 알림 — eduEnrollSet: 확정은 그 줄(promoted false) · 다른 op 가 올린 분(promoted)은 「자리가 나서」(true) · 저장·기록 뒤에만", async () => {
  const a = setup({ applyRes: { ok: true, promoted: null } });
  assert.deepEqual(await a.edu.eduEnrollSet(CHIEF, { id: 7, op: "confirm" }), { ok: true, promoted: null, notified: 1, notifyError: null });
  assert.deepEqual(a.log.notify, [[[7], false, 1, 1]], "저장(SQL 함수 1번)·기록(1줄) 뒤에 한 번");
  for (const op of ["cancel", "waitlist", "decline", "reopen"]) {
    const b = setup({ applyRes: { ok: true, promoted: 9 } });
    assert.deepEqual(await b.edu.eduEnrollSet(CHIEF, { id: 7, op }), { ok: true, promoted: 9, notified: 1, notifyError: null }, op);
    assert.deepEqual(b.log.notify, [[[9], true, 1, 1]], op + " — 올라간 분께 promoted:true");
    const c = setup({ applyRes: { ok: true, promoted: null } });
    assert.deepEqual(await c.edu.eduEnrollSet(CHIEF, { id: 7, op }), { ok: true, promoted: null }, op + " — 올라간 분이 없으면 그대로");
    assert.equal(c.log.notify.length, 0, op);
  }
  // 저장이 거절되면(정원·끝난 강좌·수료 줄) 부르지 않는다 — 응답도 그대로
  for (const res of [{ ok: false, error: "full" }, { ok: false, error: "course-closed" }, { ok: false, error: "has-cert" }]) {
    const d = setup({ applyRes: res });
    assert.deepEqual(await d.edu.eduEnrollSet(CHIEF, { id: 7, op: "confirm" }), res);
    assert.equal(d.log.notify.length, 0, res.error); assert.equal(d.log.audit.length, 0);
  }
  // 틀린 입력·맡지 않은 강좌도 부르지 않는다
  const e = setup();
  assert.deepEqual(await e.edu.eduEnrollSet(CHIEF, { id: 7, op: "zzz" }), { ok: false, error: "bad-op" });
  assert.equal(e.log.notify.length, 0);
});

test("확정 알림 — 이미 그 상태면(edu_staff_set already · 낡은 화면에서 다시 누름) 부탁하지 않는다 · 응답은 SQL 그대로(검토 반영 2026-10-06)", async () => {
  for (const op of ["confirm", "waitlist", "decline", "reopen"]) {
    const a = setup({ applyRes: { ok: true, promoted: null, already: true } });
    assert.deepEqual(await a.edu.eduEnrollSet(CHIEF, { id: 7, op }), { ok: true, promoted: null, already: true }, op);
    assert.equal(a.log.notify.length, 0, op + " — 바뀐 것이 없는데 알림을 부탁했다");
    assert.deepEqual(a.log.rpc.map((x) => x[0]), ["edu_staff_set"], op);
  }
  // force 로 다시 눌러도 같다(정원 넘김 확인 뒤 — 이미 확정이면 바뀐 것 없음)
  const f = setup({ applyRes: { ok: true, promoted: null, already: true } });
  assert.deepEqual(await f.edu.eduEnrollSet(CHIEF, { id: 7, op: "confirm", force: true }), { ok: true, promoted: null, already: true });
  assert.equal(f.log.notify.length, 0);
  // already 가 없으면(상태가 바뀜) 예전처럼 부탁한다
  const g = setup({ applyRes: { ok: true, promoted: null } });
  assert.deepEqual(await g.edu.eduEnrollSet(CHIEF, { id: 7, op: "confirm" }), { ok: true, promoted: null, notified: 1, notifyError: null });
  assert.equal(g.log.notify.length, 1);
});

test("확정 알림 — 실패는 삼킨다(던져도·null 이어도): 저장 응답은 ok · notified 0 · notifyError notify-failed · 기록은 남는다 · dep 가 없으면 그대로", async () => {
  for (const opt of [{ notifyThrows: true }, { notifyRes: null }]) {
    const a = setup({ ...opt, applyRes: { ok: true, promoted: null } });
    assert.deepEqual(await a.edu.eduEnrollSet(CHIEF, { id: 7, op: "confirm" }), { ok: true, promoted: null, notified: 0, notifyError: "notify-failed" });
    assert.equal(a.log.audit.length, 1, "저장 기록은 그대로");
    const b = setup({ ...opt, prev: { capacity: 1, mode: "auto" }, applyRes: { ok: true, promoted: 2, ids: [11, 12] } });
    assert.deepEqual(await b.edu.eduCourseSave({}, { course: { id: COURSE, title: "제자훈련", kind: "regular", capacity: 3, mode: "auto" } }),
      { ok: true, id: COURSE, promoted: 2, notified: 0, notifyError: "notify-failed" });
  }
  const z = setup({ noNotify: true, applyRes: { ok: true, promoted: null } });
  assert.deepEqual(await z.edu.eduEnrollSet(CHIEF, { id: 7, op: "confirm" }), { ok: true, promoted: null });
  // api 가 받았지만 이미 알렸거나 앱 계정이 없어 0 이면 notified 0 · notifyError null
  const s = setup({ notifyRes: { sent: 0 }, applyRes: { ok: true, promoted: null } });
  assert.deepEqual(await s.edu.eduEnrollSet(CHIEF, { id: 7, op: "confirm" }), { ok: true, promoted: null, notified: 0, notifyError: null });
});

test("확정 알림 — eduEnrollAdd: 앱 계정이 있는 분이 확정으로 들어갈 때만(already·대기·거절·새가족·명부 줄은 안 부른다)", async () => {
  const app = { ok: true, ident: { name: "홍", ident_key: "교구|기쁨|3|||홍" }, appUserId: USER };
  const a = setup({ pick: app, applyRes: { ok: true, id: 5, status: "confirmed" } });
  assert.deepEqual(await a.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍", pick: 0, check: {} }), { ok: true, id: 5, status: "confirmed", notified: 1, notifyError: null });
  assert.deepEqual(a.log.notify, [[[5], false, 1, 1]], "edu_apply·기록 뒤에");
  const r = setup({ pick: app, prev: [{ id: 5, status: "cancelled" }], applyRes: { ok: true, id: 5, status: "confirmed" } });
  assert.deepEqual(await r.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍", pick: 0, check: {} }),
    { ok: true, id: 5, status: "confirmed", revived: true, notified: 1, notifyError: null }, "되살린 분도");
  for (const [why, opt, body] of [
    ["already", { pick: app, applyRes: { ok: true, id: 5, status: "confirmed", already: true } }, { name: "홍", pick: 0, check: {} }],
    ["대기", { pick: app, applyRes: { ok: true, id: 5, status: "waitlisted" } }, { name: "홍", pick: 0, check: {} }],
    ["거절", { pick: app, applyRes: { ok: false, error: "not-open" } }, { name: "홍", pick: 0, check: {} }],
    ["명부 줄(앱 계정 없음)", { applyRes: { ok: true, id: 5, status: "confirmed" } }, { name: "홍", pick: 0, check: {} }],
    ["새가족(직접 적음)", { applyRes: { ok: true, id: 5, status: "confirmed" } }, { ident: { name: "새가족", who_type: "새가족" } }],
  ]) {
    const x = setup(opt);
    const out = await x.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, ...body });
    assert.equal(x.log.notify.length, 0, why);
    assert.ok(!("notified" in (out || {})) && !("notifyError" in (out || {})), why + " — 응답에 알림 칸이 없다");
  }
});

test("확정 알림 — eduCourseSave: 정원을 늘려 올라간 분들(edu_course_refill ids)께 promoted:true · 저장·기록 뒤에", async () => {
  const body = { course: { id: COURSE, title: "제자훈련", kind: "regular", capacity: 3, mode: "auto" } };
  const a = setup({ prev: { capacity: 1, mode: "auto" }, applyRes: { ok: true, promoted: 2, ids: [11, 12] } });
  assert.deepEqual(await a.edu.eduCourseSave({}, body), { ok: true, id: COURSE, promoted: 2, notified: 2, notifyError: null });
  assert.deepEqual(a.log.notify, [[[11, 12], true, 1, 1]]);
  const b = setup({ prev: { capacity: 1, mode: "auto" }, applyRes: { ok: true, promoted: 0, ids: [] } });
  assert.deepEqual(await b.edu.eduCourseSave({}, body), { ok: true, id: COURSE, promoted: 0 });
  assert.equal(b.log.notify.length, 0);
  const c = setup({ prev: { capacity: 1, mode: "auto" }, applyRes: { ok: false, error: "not-found" } });
  assert.deepEqual(await c.edu.eduCourseSave({}, body), { ok: true, id: COURSE, promoted: 0 }, "refill 이 거절하면 올린 분도 없다");
  assert.equal(c.log.notify.length, 0);
});

test("eduEnrollList — 대기 번호는 시각 없는 줄이 맨 뒤 · 앱 줄 ↔ 대신 등록 줄 같은 이름에 maybeDup · user_id 안 나감", async () => {
  const rows = [
    { id: 1, name: "홍길동", user_id: USER, status: "confirmed", waitlist_at: null },
    { id: 2, name: "홍길동 ", user_id: null, status: "waitlisted", waitlist_at: null },
    { id: 3, name: "김하나", user_id: null, status: "waitlisted", waitlist_at: "2027-01-05T01:00:00+00:00" },
    { id: 4, name: "이순신", user_id: USER, status: "waitlisted", waitlist_at: "2027-01-05T02:00:00+00:00" },
  ];
  const a = setup({ prev: { id: COURSE, title: "t", kind: "lecture", status: "open" }, applyRes: [], rows });
  const r = await a.edu.eduEnrollList(CHIEF, { course_id: COURSE });
  const by = Object.fromEntries(r.enrollments.map((e) => [e.id, e]));
  assert.deepEqual([by[3].waitNo, by[4].waitNo, by[2].waitNo], [1, 2, 3]);
  assert.deepEqual(r.enrollments.map((e) => e.maybeDup), [true, true, false, false]);
  assert.equal(JSON.stringify(r).includes(USER), false);
});

// ---------- 강좌별 담당자(2026-10-05 · SQL 011 edu_course_staff) — 교육 담당은 맡은 강좌만(not-assigned · 아무것도 안 씀) ----------
const ASSIGNED = { edu_course_staff: [{ course_id: COURSE }] };   // 가짜 db 는 거르기를 안 하므로 「줄이 있다/없다」로만 가른다
const NONE = { edu_course_staff: [] };
const COURSE_ROW = { id: COURSE, title: "제자훈련", kind: "regular", status: "open", term: "2027 상반기" };

test("담당 확인 — 맡은 강좌면 지나간다(edu_course_staff 를 강좌·나·manager 로 묻는다)", async () => {
  const a = setup({ prev: COURSE_ROW, applyRes: [], rows: [], tables: { ...ASSIGNED } });
  const r = await a.edu.eduEnrollList(STAFF, { course_id: COURSE });
  assert.equal(r.ok, true);
  const q = a.log.q[0];
  assert.equal(q.table, "edu_course_staff");
  for (const call of [["eq", "course_id", COURSE], ["eq", "member_id", STAFF_M], ["eq", "kind", "manager"]]) {
    assert.ok(q.c.calls.some((x) => x.length === call.length && x.every((v, i) => v === call[i])), JSON.stringify(call));
  }
  const add = setup({ tables: { ...ASSIGNED, edu_enrollments: [] } });
  assert.equal((await add.edu.eduEnrollAdd(STAFF, { course_id: COURSE, name: "홍", pick: 0, check: {} })).ok, true);
  assert.equal(add.log.rpc[0][0], "edu_apply");
  const fee = setup({ prev: { id: 3 }, tables: { ...ASSIGNED, edu_enrollments: { id: 3, course_id: COURSE } } });
  assert.deepEqual(await fee.edu.eduFeeSet(STAFF, { id: 3, paid: true }), { ok: true });
  assert.equal(fee.log.writes, 1);
  const set = setup({ tables: { ...ASSIGNED, edu_enrollments: { course_id: COURSE } }, applyRes: { ok: true } });
  assert.equal((await set.edu.eduEnrollSet(STAFF, { id: 7, op: "confirm" })).ok, true);
  assert.equal(set.log.rpc[0][0], "edu_staff_set");
  const look = setup({ tables: { ...ASSIGNED } });
  assert.equal((await look.edu.eduPeopleLookup(STAFF, { name: "홍", course_id: COURSE })).ok, true);
  assert.equal(look.log.lookups, 1);
});

test("담당 확인 — 맡지 않은 강좌는 not-assigned · 쓰기·SQL 함수·기록·명부 찾기 모두 0", async () => {
  const NA = { ok: false, error: "not-assigned" };
  const calls = [
    ["eduEnrollList", { course_id: COURSE_B }],
    ["eduSessions", { course_id: COURSE_B }],
    ["eduExport", { course_id: COURSE_B }],
    ["eduEnrollAdd", { course_id: COURSE_B, name: "홍", pick: 0, check: {} }],
    ["eduEnrollAdd", { course_id: COURSE_B, ident: { name: "새가족" } }],
    ["eduEnrollSet", { id: 7, op: "confirm" }],
    ["eduEnrollSet", { id: 7, op: "cancel" }],
    ["eduFeeSet", { id: 7, paid: true, note: "메모" }],
    ["eduPeopleLookup", { name: "홍", course_id: COURSE_B }],
    ["eduPeopleLookup", { name: "홍" }],                            // 강좌 없이 명부를 떠보는 것도 막는다
  ];
  for (const [fn, body] of calls) {
    const a = setup({ prev: COURSE_ROW, applyRes: [], tables: { ...NONE, edu_enrollments: { course_id: COURSE_B } } });
    assert.deepEqual(await a.edu[fn](STAFF, body), NA, fn);
    assert.equal(a.log.writes, 0, fn + " 썼다");
    assert.equal(a.log.rpc.length, 0, fn + " SQL 함수를 불렀다");
    assert.equal(a.log.audit.length, 0, fn + " 기록했다");
    assert.equal(a.log.lookups, 0, fn + " 명부를 찾았다");
    assert.equal(a.log.notify.length, 0, fn + " 확정 알림을 부탁했다");
    assert.ok(!a.log.q.some((q) => q.table === "edu_courses"), fn + " 강좌를 읽었다");
  }
  // 역할만 있고 담당자 줄도 사람 id 도 없는 ctx — 같은 답
  const z = setup({ tables: { ...ASSIGNED } });
  assert.deepEqual(await z.edu.eduEnrollList({ roles: ["educourse"] }, { course_id: COURSE }), NA);
  // 없는 신청 줄은 not-found(강좌를 알 수 없다) · 그래도 아무것도 안 쓴다
  const g = setup({ tables: { ...ASSIGNED, edu_enrollments: null } });
  assert.deepEqual(await g.edu.eduFeeSet(STAFF, { id: 9, paid: true }), { ok: false, error: "not-found" });
  assert.equal(g.log.writes, 0);
});

test("담당 확인 — 교육 총괄·총괄 관리자는 edu_course_staff 를 묻지 않고 지나간다", async () => {
  for (const ctx of [CHIEF, { member: { id: CHIEF_M }, roles: ["super"] }, { member: { id: CHIEF_M }, roles: ["educourse", "education"] }]) {
    const a = setup({ prev: COURSE_ROW, applyRes: [], rows: [], tables: { ...NONE } });
    assert.equal((await a.edu.eduEnrollList(ctx, { course_id: COURSE_B })).ok, true);
    const b = setup({ tables: { ...NONE }, applyRes: { ok: true } });
    assert.equal((await b.edu.eduEnrollSet(ctx, { id: 7, op: "confirm" })).ok, true);
    const c = setup({ tables: { ...NONE } });
    assert.equal((await c.edu.eduPeopleLookup(ctx, { name: "홍" })).ok, true);
    for (const x of [b, c]) assert.ok(!x.log.q.some((q) => q.table === "edu_course_staff"), "총괄인데 담당 줄을 물었다");
    assert.ok(!b.log.q.some((q) => q.table === "edu_enrollments"), "총괄인데 신청 줄의 강좌를 미리 읽었다");
  }
});

test("eduCourses — 교육 담당은 맡은 강좌만(학기도 그것만 · scope assigned) · 총괄은 전부 · 담당자 이름이 붙는다", async () => {
  const A = { ...COURSE_ROW, id: COURSE, term: "2027 상반기" };
  const B = { ...COURSE_ROW, id: COURSE_B, title: "새가족반", term: "2027 하반기" };
  const staffRows = [{ course_id: COURSE, member_id: STAFF_M, admin_members: { name: "박담당", status: "active" } },
    { course_id: COURSE, member_id: CHIEF_M, admin_members: { name: "김총괄", status: "active" } }];
  const eduGrants = [{ member_id: STAFF_M, role_id: "educourse" }, { member_id: CHIEF_M, role_id: "education" }];
  // 담당 — 맡은 강좌 id 를 먼저 묻고 그 id 로 강좌를 거른다(가짜 db 가 B 까지 돌려줘도 응답에서 다시 거른다)
  const a = setup({ applyRes: [], tables: { edu_course_staff: [{ course_id: COURSE }], edu_courses: [A, B] } });
  a.log.q.length = 0;
  const r = await a.edu.eduCourses(STAFF, {});
  assert.equal(r.ok, true); assert.equal(r.scope, "assigned");
  assert.deepEqual(r.courses.map((c) => c.id), [COURSE]);
  assert.deepEqual(r.terms, ["2027 상반기"]);
  const mine = a.log.q.find((q) => q.table === "edu_course_staff");
  assert.ok(mine.c.calls.some((x) => x[0] === "eq" && x[1] === "member_id" && x[2] === STAFF_M));
  const cq = a.log.q.find((q) => q.table === "edu_courses");
  assert.ok(cq.c.calls.some((x) => x[0] === "in" && x[1] === "id" && JSON.stringify(x[2]) === JSON.stringify([COURSE])));
  // 맡은 강좌가 없으면 강좌 표를 읽지도 않는다
  const e = setup({ tables: { edu_course_staff: [] } });
  assert.deepEqual(await e.edu.eduCourses(STAFF, {}), { ok: true, scope: "assigned", terms: [], courses: [] });
  assert.ok(!e.log.q.some((q) => q.table === "edu_courses"));
  // 총괄 — 전부 · 담당자 줄은 한 번(쪽 넘기기)으로 읽어 강좌마다 붙인다(N+1 없음) · 이름 차례 · id·이름만
  const c = setup({ applyRes: [], tables: { edu_courses: [A, B], edu_course_staff: staffRows, admin_role_grants: eduGrants } });
  const all = await c.edu.eduCourses(CHIEF, {});
  assert.equal(all.scope, "all");
  assert.deepEqual(all.courses.map((x) => x.id), [COURSE, COURSE_B]);
  assert.deepEqual(all.courses[0].staff, [{ id: CHIEF_M, name: "김총괄" }, { id: STAFF_M, name: "박담당" }]);
  assert.deepEqual(all.courses[1].staff, []);
  assert.equal(c.log.q.filter((q) => q.table === "edu_course_staff").length, 1);
  assert.ok(!c.log.q.some((q) => q.table === "edu_course_staff" && q.c.calls.some((x) => x[0] === "eq" && x[1] === "member_id")));
});

test("eduStaffSet — 강좌 확인 · 후보(사용 중 · 교육 역할)만 · 바뀐 것만 빼고 더함 · 바뀐 것 없으면 기록 없음 · 기록에 이름 없음", async () => {
  const grants = [{ member_id: STAFF_M, role_id: "educourse" }];
  const members = [{ id: STAFF_M, name: "박담당", type: "교구", gu: "기쁨", mok: "3" }];
  // 틀린 입력 — 아무것도 안 읽고 안 쓴다
  const bad = setup();
  assert.deepEqual(await bad.edu.eduStaffSet(CHIEF, { course_id: "x", member_ids: [] }), { ok: false, error: "bad-id" });
  assert.deepEqual(await bad.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: "x" }), { ok: false, error: "bad-id" });
  assert.deepEqual(await bad.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: ["nope"] }), { ok: false, error: "bad-id" });
  assert.equal(bad.log.q.length, 0);
  // 없는 강좌
  const nf = setup({ tables: { edu_courses: null } });
  assert.deepEqual(await nf.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [STAFF_M] }), { ok: false, error: "not-found" });
  assert.equal(nf.log.writes, 0);
  // 후보가 아닌 분(역할 없음·정지 — 가짜 db 의 admin_members 에 없다)
  const bm = setup({ tables: { edu_courses: { id: COURSE }, admin_role_grants: grants, admin_members: [] } });
  assert.deepEqual(await bm.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [STAFF_M] }), { ok: false, error: "bad-member" });
  assert.equal(bm.log.writes, 0); assert.equal(bm.log.audit.length, 0);
  // 더하기 — upsert 한 번 · 기록 {course, count}
  const add = setup({ tables: { edu_courses: { id: COURSE }, admin_role_grants: grants, admin_members: members, edu_course_staff: [] } });
  assert.deepEqual(await add.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [STAFF_M, STAFF_M.toUpperCase()] }), { ok: true, count: 1, changed: true });
  const up = add.log.q.find((q) => q.c.calls.some((x) => x[0] === "upsert")).c.calls.find((x) => x[0] === "upsert");
  assert.deepEqual(up[1], [{ course_id: COURSE, member_id: STAFF_M, kind: "manager" }]);
  assert.deepEqual(add.log.audit, [["edu.staff.set", COURSE, { course: COURSE, count: 1 }]]);
  assert.equal(JSON.stringify(add.log.audit).includes("박담당"), false);
  // 그대로 — 쓰지도 기록하지도 않는다
  const same = setup({ tables: { edu_courses: { id: COURSE }, admin_role_grants: grants, admin_members: members, edu_course_staff: [{ member_id: STAFF_M }] } });
  assert.deepEqual(await same.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [STAFF_M] }), { ok: true, count: 1, changed: false });
  assert.equal(same.log.writes, 0); assert.equal(same.log.audit.length, 0);
  // 비우기 — 후보 확인 없이 delete 한 번(manager 줄만)
  const clr = setup({ tables: { edu_courses: { id: COURSE }, edu_course_staff: [{ member_id: STAFF_M }] } });
  assert.deepEqual(await clr.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [] }), { ok: true, count: 0, changed: true });
  const del = clr.log.q.find((q) => q.c.calls.some((x) => x[0] === "delete"));
  assert.ok(del.c.calls.some((x) => x[0] === "eq" && x[1] === "kind" && x[2] === "manager"));
  assert.ok(del.c.calls.some((x) => x[0] === "in" && x[1] === "member_id" && x[2][0] === STAFF_M));
  assert.equal(clr.log.writes, 1);
  assert.ok(!clr.log.q.some((q) => q.table === "admin_role_grants"));
});

test("eduStaffCandidates — 사용 중인 교육 역할 분만 · id·이름·소속·교육 역할만(auth id·카카오 칸 없음)", async () => {
  const a = setup({ tables: {
    admin_role_grants: [{ member_id: STAFF_M, role_id: "educourse" }, { member_id: CHIEF_M, role_id: "education" }, { member_id: CHIEF_M, role_id: "educourse" }],
    admin_members: [{ id: STAFF_M, name: "박담당", type: "교구", gu: "기쁨", mok: "3", auth_user_id: USER, kakao_nickname: "x" },
      { id: CHIEF_M, name: "김총괄", type: "교회학교", bu: "중등부", grade: "2학년" }],
  } });
  const r = await a.edu.eduStaffCandidates();
  assert.deepEqual(r, { ok: true, members: [
    { id: CHIEF_M, name: "김총괄", who: "중등부 2학년", roles: ["education", "educourse"] },
    { id: STAFF_M, name: "박담당", who: "기쁨 3목장", roles: ["educourse"] },
  ] });
  assert.equal(JSON.stringify(r).includes(USER), false);
  const g = a.log.q.find((q) => q.table === "admin_role_grants");
  assert.ok(g.c.calls.some((x) => x[0] === "in" && x[1] === "role_id" && x[2].includes("educourse") && x[2].includes("education") && !x[2].includes("super")));
  const m = a.log.q.find((q) => q.table === "admin_members");
  assert.ok(m.c.calls.some((x) => x[0] === "eq" && x[1] === "status" && x[2] === "active"));
  assert.ok(!m.c.calls.some((x) => x[0] === "select" && /auth_user_id|kakao/.test(x[1])));
  const none = setup({ tables: { admin_role_grants: [] } });
  assert.deepEqual(await none.edu.eduStaffCandidates(), { ok: true, members: [] });
});

// ---------- 검토 반영(2026-10-05) ----------
const OTHER_M = "66666666-6666-4666-8666-666666666666";

test("eduStaffSet — 역할을 잃은(stale) 분을 그대로 두고 저장하면 된다 · 새로 더하는 분만 후보 확인 · 새 분이 후보가 아니면 bad-member(아무것도 안 씀)", async () => {
  // 이미 맡은 STAFF_M 이 역할을 잃었다(후보 목록에 없다)
  const keep = setup({ tables: { edu_courses: { id: COURSE }, edu_course_staff: [{ member_id: STAFF_M }], admin_role_grants: [], admin_members: [] } });
  assert.deepEqual(await keep.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [STAFF_M] }), { ok: true, count: 1, changed: false });
  assert.equal(keep.log.writes, 0);
  assert.ok(!keep.log.q.some((q) => q.table === "admin_role_grants"), "더하는 분이 없는데 후보를 확인했다");
  // stale 분을 남기고 후보 한 분을 더한다 — 더하는 분만 upsert · 빼는 것 없음
  const add = setup({ tables: { edu_courses: { id: COURSE }, edu_course_staff: [{ member_id: STAFF_M }],
    admin_role_grants: [{ member_id: CHIEF_M, role_id: "education" }], admin_members: [{ id: CHIEF_M, name: "김총괄" }] } });
  assert.deepEqual(await add.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [STAFF_M, CHIEF_M] }), { ok: true, count: 2, changed: true });
  const up = add.log.q.flatMap((q) => q.c.calls).filter((x) => x[0] === "upsert");
  assert.deepEqual(up.map((x) => x[1]), [[{ course_id: COURSE, member_id: CHIEF_M, kind: "manager" }]]);
  assert.equal(add.log.writes, 1);
  // stale 분을 남기고 후보가 아닌 분을 새로 더하려 하면 bad-member — 지우기·더하기·기록 없음
  const bad = setup({ tables: { edu_courses: { id: COURSE }, edu_course_staff: [{ member_id: STAFF_M }],
    admin_role_grants: [{ member_id: CHIEF_M, role_id: "education" }], admin_members: [{ id: CHIEF_M, name: "김총괄" }] } });
  assert.deepEqual(await bad.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [STAFF_M, OTHER_M] }), { ok: false, error: "bad-member" });
  assert.equal(bad.log.writes, 0); assert.equal(bad.log.audit.length, 0);
  // 빼는 것도 된다(stale 분을 목록에서 빼면 그 줄만 delete)
  const out = setup({ tables: { edu_courses: { id: COURSE }, edu_course_staff: [{ member_id: STAFF_M }, { member_id: CHIEF_M }] } });
  assert.deepEqual(await out.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [CHIEF_M] }), { ok: true, count: 1, changed: true });
  const del = out.log.q.find((q) => q.c.calls.some((x) => x[0] === "delete"));
  assert.ok(del.c.calls.some((x) => x[0] === "in" && x[1] === "member_id" && JSON.stringify(x[2]) === JSON.stringify([STAFF_M])));
});

test("staffOf — 사용 중이 아니거나 교육 역할이 없으면 stale:true · 칸은 id·name(·stale)만", async () => {
  const M2 = "77777777-7777-4777-8777-777777777777", M3 = "88888888-8888-4888-8888-888888888888";
  const a = setup({ applyRes: [], tables: {
    edu_courses: [{ ...COURSE_ROW, id: COURSE }],
    edu_course_staff: [
      { course_id: COURSE, member_id: STAFF_M, admin_members: { name: "가담당", status: "active" } },
      { course_id: COURSE, member_id: M2, admin_members: { name: "나역할뺌", status: "active" } },
      { course_id: COURSE, member_id: M3, admin_members: { name: "다정지", status: "disabled" } },
    ],
    admin_role_grants: [{ member_id: STAFF_M, role_id: "educourse" }, { member_id: M3, role_id: "educourse" }],
  } });
  const r = await a.edu.eduCourses(CHIEF, {});
  assert.deepEqual(r.courses[0].staff, [
    { id: STAFF_M, name: "가담당" },
    { id: M2, name: "나역할뺌", stale: true },
    { id: M3, name: "다정지", stale: true },
  ]);
  const g = a.log.q.find((q) => q.table === "admin_role_grants");
  assert.ok(g.c.calls.some((x) => x[0] === "in" && x[1] === "role_id" && x[2].includes("educourse") && x[2].includes("education")));
  // 담당 줄이 없으면 역할 표를 읽지 않는다
  const e = setup({ applyRes: [], tables: { edu_courses: [{ ...COURSE_ROW, id: COURSE }], edu_course_staff: [] } });
  assert.deepEqual((await e.edu.eduCourses(CHIEF, {})).courses[0].staff, []);
  assert.ok(!e.log.q.some((q) => q.table === "admin_role_grants"));
});

test("IDOR — 몸통의 course_id 가 맡은 강좌(A)여도 신청 줄의 강좌(B)로 묻는다 → not-assigned · 쓰기 0 · A 줄이면 통과", async () => {
  const staffRows = [{ course_id: COURSE, member_id: STAFF_M, kind: "manager" }];
  for (const [fn, body] of [["eduEnrollSet", { id: 7, op: "confirm", course_id: COURSE }], ["eduFeeSet", { id: 7, paid: true, note: "x", course_id: COURSE }]]) {
    const a = setup({ staffRows, tables: { edu_enrollments: { id: 7, course_id: COURSE_B } }, applyRes: { ok: true } });
    assert.deepEqual(await a.edu[fn](STAFF, body), { ok: false, error: "not-assigned" }, fn);
    assert.equal(a.log.writes, 0, fn); assert.equal(a.log.rpc.length, 0, fn); assert.equal(a.log.audit.length, 0, fn);
    const sq = a.log.q.filter((q) => q.table === "edu_course_staff");
    assert.equal(sq.length, 1, fn);
    assert.ok(sq[0].c.calls.some((x) => x[0] === "eq" && x[1] === "course_id" && x[2] === COURSE_B), fn + " B 로 묻지 않았다");
    assert.ok(!sq[0].c.calls.some((x) => x[0] === "eq" && x[1] === "course_id" && x[2] === COURSE), fn + " 몸통의 A 로 물었다");
    // 같은 몸통 · 신청 줄이 A 면 통과
    const ok = setup({ staffRows, tables: { edu_enrollments: { id: 7, course_id: COURSE } }, applyRes: { ok: true } });
    assert.equal((await ok.edu[fn](STAFF, body)).ok, true, fn);
    assert.equal(ok.log.rpc.length + ok.log.writes, 1, fn);
  }
  // 거르기를 지키는 가짜라도 다른 담당자·다른 kind 줄로는 통과하지 않는다
  const t = setup({ staffRows: [{ course_id: COURSE, member_id: OTHER_M, kind: "manager" }, { course_id: COURSE, member_id: STAFF_M, kind: "teacher" }],
    tables: { edu_enrollments: { id: 7, course_id: COURSE } } });
  assert.deepEqual(await t.edu.eduFeeSet(STAFF, { id: 7, paid: true }), { ok: false, error: "not-assigned" });
  assert.equal(t.log.writes, 0);
});

test("eduPeopleLookup — 담당은 맡은 강좌 + 끝·보관이 아닌 강좌만(course-closed) · 맡지 않은 강좌는 강좌를 읽지도 않는다 · 총괄은 course_id 없이도", async () => {
  const staffRows = [{ course_id: COURSE, member_id: STAFF_M, kind: "manager" }];
  for (const status of ["done", "archived"]) {
    const a = setup({ staffRows, tables: { edu_courses: { status } } });
    assert.deepEqual(await a.edu.eduPeopleLookup(STAFF, { name: "홍", course_id: COURSE }), { ok: false, error: "course-closed" }, status);
    assert.equal(a.log.lookups, 0, status);
  }
  for (const status of ["draft", "open", "closed", "running"]) {
    const a = setup({ staffRows, tables: { edu_courses: { status } } });
    assert.equal((await a.edu.eduPeopleLookup(STAFF, { name: "홍", course_id: COURSE })).ok, true, status);
    assert.equal(a.log.lookups, 1, status);
  }
  const nb = setup({ staffRows, tables: { edu_courses: { status: "open" } } });
  assert.deepEqual(await nb.edu.eduPeopleLookup(STAFF, { name: "홍", course_id: COURSE_B }), { ok: false, error: "not-assigned" });
  assert.ok(!nb.log.q.some((q) => q.table === "edu_courses")); assert.equal(nb.log.lookups, 0);
  const gone = setup({ staffRows, tables: { edu_courses: null } });
  assert.deepEqual(await gone.edu.eduPeopleLookup(STAFF, { name: "홍", course_id: COURSE }), { ok: false, error: "not-found" });
  // 총괄 — course_id 없이 바로 찾는다(강좌·담당 줄 읽지 않음) · 끝난 강좌의 창에서는 같은 course-closed
  const c = setup({ tables: { edu_courses: { status: "done" } } });
  assert.equal((await c.edu.eduPeopleLookup(CHIEF, { name: "홍" })).ok, true);
  assert.equal(c.log.q.length, 0);
  assert.deepEqual(await c.edu.eduPeopleLookup(CHIEF, { name: "홍", course_id: COURSE }), { ok: false, error: "course-closed" });
});

test("eduExport — 기록 target 은 다듬은 강좌 id(몸통 글자 그대로가 아니다)", async () => {
  const a = setup({ prev: COURSE_ROW, applyRes: [], rows: [] });
  assert.equal((await a.edu.eduExport(CHIEF, { course_id: `  ${COURSE}  ` })).ok, true);
  assert.deepEqual(a.log.audit, [["edu.export", COURSE, { count: 0 }]]);
});

// ---------- 출석부(2단계 · 2026-10-05) — 강사(teacher)는 강사 줄이 있는 강좌만 · 쓰기는 SQL 함수 · 기록은 id·수만 ----------
const TEACH_M = "99999999-9999-4999-8999-999999999999";
const TEACHER = { member: { id: TEACH_M }, roles: ["teacher"] };
const T_ROWS = [{ course_id: COURSE, member_id: TEACH_M, kind: "teacher" }];   // 강사 T 는 강좌 A(COURSE)만
const SESS_A = { id: 5, course_id: COURSE, no: 1, on_date: "2026-10-25" };
const SESS_B = { id: 6, course_id: COURSE_B, no: 1, on_date: "2026-10-26" };
const asked = (q, ...call) => q.c.calls.some((x) => x.length === call.length && x.every((v, i) => v === call[i]));

test("출석 — 강사 T 는 맡은 강좌 A 의 칸을 쓴다(SQL edu_attendance_set · p_by = T · 기록 id 만) · 지우기 · 한꺼번에", async () => {
  const a = setup({ staffRows: T_ROWS, tables: { edu_sessions: SESS_A }, applyRes: { ok: true, state: "present" } });
  assert.deepEqual(await a.edu.eduAttendSet(TEACHER, { session_id: 5, enrollment_id: 7, state: "present" }), { ok: true, state: "present" });
  assert.deepEqual(a.log.rpc, [["edu_attendance_set", { p_session: 5, p_enrollment: 7, p_state: "present", p_by: TEACH_M }]]);
  assert.deepEqual(a.log.audit, [["edu.attend.set", "7", { course: COURSE, session: 5, no: 1, enrollment: 7 }]]);
  const sq = a.log.q.find((q) => q.table === "edu_course_staff");
  for (const call of [["eq", "course_id", COURSE], ["eq", "member_id", TEACH_M], ["eq", "kind", "teacher"]]) assert.ok(asked(sq, ...call), JSON.stringify(call));
  assert.equal(a.log.writes, 0, "표에 직접 쓰지 않는다(SQL 함수만)");
  // 지우기 — state:null 을 그대로 넘긴다 · 칸이 아예 없으면 bad-state(실수로 지우지 않게 · 아무것도 안 읽음)
  const c = setup({ staffRows: T_ROWS, tables: { edu_sessions: SESS_A }, applyRes: { ok: true, state: null, cleared: true } });
  assert.deepEqual(await c.edu.eduAttendSet(TEACHER, { session_id: 5, enrollment_id: 7, state: null }), { ok: true, state: null, cleared: true });
  assert.equal(c.log.rpc[0][1].p_state, null);
  const u = setup({ staffRows: T_ROWS, tables: { edu_sessions: SESS_A } });
  assert.deepEqual(await u.edu.eduAttendSet(TEACHER, { session_id: 5, enrollment_id: 7 }), { ok: false, error: "bad-state" });
  assert.deepEqual(await u.edu.eduAttendSet(TEACHER, { session_id: 5, enrollment_id: 7, state: "" }), { ok: false, error: "bad-state" }, "빈 글자는 지우기가 아니다");
  assert.deepEqual(await u.edu.eduAttendSet(TEACHER, { session_id: 5, enrollment_id: 7, state: "here" }), { ok: false, error: "bad-state" });
  assert.deepEqual(await u.edu.eduAttendSet(TEACHER, { session_id: 0, enrollment_id: 7, state: "late" }), { ok: false, error: "bad-id" });
  assert.equal(u.log.q.length + u.log.rpc.length, 0);
  // 한꺼번에 — null 상태는 bad-state · count 를 기록
  const b = setup({ staffRows: T_ROWS, tables: { edu_sessions: SESS_A }, applyRes: { ok: true, count: 3 } });
  assert.deepEqual(await b.edu.eduAttendBulk(TEACHER, { session_id: 5, state: null }), { ok: false, error: "bad-state" });
  assert.deepEqual(await b.edu.eduAttendBulk(TEACHER, { session_id: 5, state: "present" }), { ok: true, count: 3 });
  assert.deepEqual(b.log.rpc, [["edu_attendance_bulk", { p_session: 5, p_state: "present", p_by: TEACH_M }]]);
  assert.deepEqual(b.log.audit, [["edu.attend.bulk", "5", { course: COURSE, session: 5, no: 1, count: 3 }]]);
  // SQL 이 거절하면(not-confirmed 등) 그대로 돌려주고 기록하지 않는다
  const r = setup({ staffRows: T_ROWS, tables: { edu_sessions: SESS_A }, applyRes: { ok: false, error: "not-confirmed" } });
  assert.deepEqual(await r.edu.eduAttendSet(TEACHER, { session_id: 5, enrollment_id: 7, state: "present" }), { ok: false, error: "not-confirmed" });
  assert.equal(r.log.audit.length, 0);
});

test("출석 — 강사 T 는 맡지 않은 강좌 B 에서 not-assigned · 쓰기·SQL 함수·기록 0 · 강좌·명단·출석을 읽지도 않는다", async () => {
  const NA = { ok: false, error: "not-assigned" };
  for (const [fn, body] of [
    ["eduAttendSet", { session_id: 6, enrollment_id: 7, state: "present" }],
    ["eduAttendSet", { session_id: 6, enrollment_id: 7, state: null }],
    ["eduAttendBulk", { session_id: 6, state: "present" }],
    ["eduAttendSessions", { course_id: COURSE_B }],
    ["eduAttendSheet", { course_id: COURSE_B, session_id: 6 }],
    ["eduAttendSummary", { course_id: COURSE_B }],
    ["eduAttendExport", { course_id: COURSE_B }],
  ]) {
    const a = setup({ staffRows: T_ROWS, tables: { edu_sessions: SESS_B }, applyRes: { ok: true } });
    assert.deepEqual(await a.edu[fn](TEACHER, body), NA, fn);
    assert.equal(a.log.writes, 0, fn + " 썼다");
    assert.equal(a.log.rpc.length, 0, fn + " SQL 함수를 불렀다");
    assert.equal(a.log.audit.length, 0, fn + " 기록했다");
    for (const t of ["edu_courses", "edu_enrollments", "edu_attendance"]) assert.ok(!a.log.q.some((q) => q.table === t), fn + " " + t + " 를 읽었다");
  }
});

test("출석 — B 회차 × A 신청: 회차의 강좌(B)로 맡은 강좌를 본다(몸통의 course_id·신청 줄을 믿지 않는다) → not-assigned · 둘 다 맡았으면 SQL 이 wrong-course", async () => {
  // 강사 T 는 A 만 — 몸통에 course_id: A 를 실어 보내도 회차 6(B)의 강좌로 묻는다
  const a = setup({ staffRows: T_ROWS, tables: { edu_sessions: SESS_B }, applyRes: { ok: true } });
  assert.deepEqual(await a.edu.eduAttendSet(TEACHER, { session_id: 6, enrollment_id: 7, state: "present", course_id: COURSE }), { ok: false, error: "not-assigned" });
  const sq = a.log.q.filter((q) => q.table === "edu_course_staff");
  assert.equal(sq.length, 1);
  assert.ok(asked(sq[0], "eq", "course_id", COURSE_B), "B 로 묻지 않았다");
  assert.ok(!asked(sq[0], "eq", "course_id", COURSE), "몸통의 A 로 물었다");
  assert.equal(a.log.rpc.length + a.log.writes + a.log.audit.length, 0);
  // A·B 둘 다 맡은 강사 — 앞 검사는 지나가고 같은 강좌 확인은 SQL 함수(edu_attendance_set)가 한다 → wrong-course 그대로 · 기록 없음
  const both = [...T_ROWS, { course_id: COURSE_B, member_id: TEACH_M, kind: "teacher" }];
  const b = setup({ staffRows: both, tables: { edu_sessions: SESS_B }, applyRes: { ok: false, error: "wrong-course" } });
  assert.deepEqual(await b.edu.eduAttendSet(TEACHER, { session_id: 6, enrollment_id: 7, state: "present" }), { ok: false, error: "wrong-course" });
  assert.deepEqual(b.log.rpc, [["edu_attendance_set", { p_session: 6, p_enrollment: 7, p_state: "present", p_by: TEACH_M }]]);
  assert.equal(b.log.audit.length, 0);
  // 출석부 한 장 — 몸통의 회차가 다른 강좌 것이면 not-found(명단·출석을 읽지 않는다)
  const s = setup({ staffRows: both, tables: { edu_courses: { id: COURSE, title: "A", status: "running" }, edu_sessions: SESS_B } });
  assert.deepEqual(await s.edu.eduAttendSheet(TEACHER, { course_id: COURSE, session_id: 6 }), { ok: false, error: "not-found" });
  assert.ok(!s.log.q.some((q) => q.table === "edu_enrollments" || q.table === "edu_attendance"));
});

test("출석 강좌 확인 kind — 강사만 있는 분의 옛 담당(manager) 줄로는 안 열린다 · 교육 담당은 강사 줄로도 열린다 · 총괄은 묻지 않는다", async () => {
  const oldMgr = [{ course_id: COURSE, member_id: TEACH_M, kind: "manager" }];
  const a = setup({ staffRows: oldMgr, tables: { edu_sessions: SESS_A }, applyRes: { ok: true } });
  assert.deepEqual(await a.edu.eduAttendSet(TEACHER, { session_id: 5, enrollment_id: 7, state: "present" }), { ok: false, error: "not-assigned" });
  assert.equal(a.log.rpc.length, 0);
  const dc = setup({ staffRows: [{ course_id: COURSE, member_id: STAFF_M, kind: "teacher" }], tables: { edu_sessions: SESS_A }, applyRes: { ok: true, state: "late" } });
  assert.equal((await dc.edu.eduAttendSet(STAFF, { session_id: 5, enrollment_id: 7, state: "late" })).ok, true);
  const sq = dc.log.q.find((q) => q.table === "edu_course_staff");
  assert.ok(sq.c.calls.some((x) => x[0] === "in" && x[1] === "kind" && JSON.stringify(x[2]) === JSON.stringify(["manager", "teacher"])));
  const dm = setup({ staffRows: [{ course_id: COURSE, member_id: STAFF_M, kind: "manager" }], tables: { edu_sessions: SESS_A }, applyRes: { ok: true, state: "late" } });
  assert.equal((await dm.edu.eduAttendSet(STAFF, { session_id: 5, enrollment_id: 7, state: "late" })).ok, true);
  for (const ctx of [CHIEF, { member: { id: CHIEF_M }, roles: ["super"] }]) {
    const c = setup({ staffRows: [], tables: { edu_sessions: SESS_B }, applyRes: { ok: true, state: "present" } });
    assert.equal((await c.edu.eduAttendSet(ctx, { session_id: 6, enrollment_id: 7, state: "present" })).ok, true);
    assert.ok(!c.log.q.some((q) => q.table === "edu_course_staff"), "총괄인데 담당 줄을 물었다");
  }
  // 신청 현황 쪽 확인(기본 manager)은 강사 줄로 열리지 않는다
  const m = setup({ staffRows: [{ course_id: COURSE, member_id: STAFF_M, kind: "teacher" }] });
  assert.equal(await m.edu._mayTouch(STAFF, COURSE), false);
});

test("출석 현황 — 출석률은 eduAttendRate(지각=출석 · 공결 뺌 · 체크 안 한 회차 뺌) · 회차별 칸 · 기준 미달 · user_id·marked_by 없음 · 엑셀 기록은 수만", async () => {
  const course = { id: COURSE, title: "구원론", term: "2026 가을", status: "running", attend_pct: 80 };
  const sessions = [{ id: 51, course_id: COURSE, no: 1, on_date: "2026-10-25", start_time: "19:30:00" }, { id: 52, course_id: COURSE, no: 2, on_date: "2026-11-01" },
    { id: 53, course_id: COURSE, no: 3, on_date: "2026-11-08" }];
  const people = [{ id: 71, name: "홍길동", who_type: "교구", group_name: "기쁨", sub_name: "3", user_id: USER },
    { id: 72, name: "김하나", who_type: "교구", group_name: "소망", sub_name: "1" }];
  const att = [{ enrollment_id: 71, session_id: 51, state: "present", marked_by: STAFF_M }, { enrollment_id: 71, session_id: 52, state: "late" },
    { enrollment_id: 71, session_id: 53, state: "absent" }, { enrollment_id: 72, session_id: 51, state: "excused" }, { enrollment_id: 72, session_id: 52, state: "present" }];
  const mk = () => setup({ rows: people, tables: { edu_courses: course, edu_sessions: sessions, edu_attendance: att } });
  const a = mk();
  const r = await a.edu.eduAttendSummary(CHIEF, { course_id: COURSE });
  assert.equal(r.ok, true);
  assert.deepEqual(r.sessions.map((s) => [s.id, s.no, s.date, s.start]), [[51, 1, "2026-10-25", "19:30"], [52, 2, "2026-11-01", null], [53, 3, "2026-11-08", null]]);
  const by = Object.fromEntries(r.people.map((p) => [p.id, p]));
  assert.deepEqual(by[71].cells, ["present", "late", "absent"]);
  assert.deepEqual([by[71].present, by[71].late, by[71].absent, by[71].excused, by[71].marked], [1, 1, 1, 0, 3]);
  assert.equal(by[71].pct, eduAttendRate({ present: 1, late: 1, absent: 1, excused: 0 }).pct);
  assert.equal(by[71].pct, 67); assert.equal(by[71].below, true);
  assert.equal(by[72].pct, eduAttendRate({ present: 1, late: 0, absent: 0, excused: 1 }).pct);
  assert.equal(by[72].pct, 100); assert.equal(by[72].below, false);
  assert.deepEqual(r.course, { id: COURSE, title: "구원론", term: "2026 가을", status: "running", statusLabel: "진행 중", place: "", startsOn: null, endsOn: null, attendPct: 80, closed: false });
  const txt = JSON.stringify(r);
  for (const bad of [USER, STAFF_M, "marked_by", "user_id", "ident_key"]) assert.equal(txt.includes(bad), false, bad);
  // 사람×회차는 쪽 넘기기(allRows)로 — 출석 줄을 회차 id 로 · 기본 키 차례
  const aq = a.log.q.find((q) => q.table === "edu_attendance");
  assert.ok(aq.c.calls.some((x) => x[0] === "in" && x[1] === "session_id" && JSON.stringify(x[2]) === "[51,52,53]"));
  assert.ok(!aq.c.calls.some((x) => x[0] === "select" && /marked_by/.test(x[1])), "marked_by 를 읽었다");
  const eq = a.log.q.find((q) => q.table === "edu_enrollments");
  assert.ok(asked(eq, "eq", "status", "confirmed"));
  assert.ok(!eq.c.calls.some((x) => x[0] === "select" && /user_id|ident_key/.test(x[1])), "신청 줄의 user_id·ident_key 를 읽었다");
  assert.equal(a.log.audit.length, 0, "현황 보기는 기록하지 않는다");
  // 엑셀 — 같은 현황에서 · 기록 edu.attend.export {course, count, sessions}
  const x = mk();
  const ex = await x.edu.eduAttendExport(CHIEF, { course_id: COURSE });
  assert.equal(ex.ok, true);
  assert.deepEqual(ex.rows[0], ["강좌", "학기", "이름", "소속", "1회 10/25", "2회 11/1", "3회 11/8", "출석", "지각", "결석", "공결", "출석률"]);
  assert.deepEqual(ex.rows[1], ["구원론", "2026 가을", "김하나", "소망 1목장", "공", "○", "", "1", "0", "0", "1", "100%"]);
  assert.deepEqual(ex.rows[2], ["구원론", "2026 가을", "홍길동", "기쁨 3목장", "○", "지", "결", "1", "1", "1", "0", "67%"]);
  assert.deepEqual(x.log.audit, [["edu.attend.export", COURSE, { course: COURSE, count: 2, sessions: 3 }]]);
});

test("출석부 한 장·회차 목록 — 확정자 이름·소속·그 회차 상태 · 체크 수(지금 확정된 분만) · 고를 회차", async () => {
  const course = { id: COURSE, title: "구원론", term: "", status: "running", attend_pct: 80 };
  const people = [{ id: 71, name: "홍길동", who_type: "교구", group_name: "기쁨", sub_name: "3" }, { id: 72, name: "김하나", who_type: "교구", group_name: "소망", sub_name: "1" }];
  const s = setup({ staffRows: T_ROWS, rows: people, tables: { edu_courses: course, edu_sessions: SESS_A, edu_attendance: [{ enrollment_id: 71, session_id: 5, state: "late" }] } });
  const r = await s.edu.eduAttendSheet(TEACHER, { course_id: COURSE, session_id: 5 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows, [{ id: 72, name: "김하나", who: "소망 1목장", state: null }, { id: 71, name: "홍길동", who: "기쁨 3목장", state: "late" }]);
  assert.deepEqual(r.counts, { present: 0, late: 1, absent: 0, excused: 0, marked: 1, total: 2 });
  assert.deepEqual(r.session, { id: 5, no: 1, date: "2026-10-25", start: null, end: null, topic: "", place: "" });
  // 회차 목록 — 확정이 아닌 분(99)의 출석 줄은 세지 않는다
  const sessions = [{ id: 51, course_id: COURSE, no: 1, on_date: "2000-01-02" }, { id: 52, course_id: COURSE, no: 2, on_date: "2999-01-09" }];
  const l = setup({ staffRows: T_ROWS, rows: people, tables: { edu_courses: course, edu_sessions: sessions,
    edu_attendance: [{ enrollment_id: 71, session_id: 51, state: "present" }, { enrollment_id: 72, session_id: 51, state: "absent" }, { enrollment_id: 99, session_id: 51, state: "present" }] } });
  const ls = await l.edu.eduAttendSessions(TEACHER, { course_id: COURSE });
  assert.equal(ls.ok, true);
  assert.equal(ls.confirmed, 2);
  assert.deepEqual(ls.sessions.map((x) => [x.id, x.marked, x.isToday]), [[51, 2, false], [52, 0, false]]);
  assert.equal(ls.pick, 52, "다음 회차");
  assert.equal(l.log.audit.length + l.log.rpc.length + l.log.writes, 0);
});

test("eduAttendCourses — 강사는 강사 줄이 있는 강좌만(보관 빼고) · 진행 중 먼저 · 총괄은 모든 강좌(담당 줄을 묻지 않음)", async () => {
  const A = { id: COURSE, title: "구원론", term: "", status: "open", attend_pct: 80 };
  const B = { id: COURSE_B, title: "새가족반", term: "", status: "running", attend_pct: 80 };
  const t = setup({ staffRows: T_ROWS, applyRes: [], tables: { edu_courses: [A, B], edu_sessions: [{ id: 5, course_id: COURSE, no: 1, on_date: "2999-01-01" }] } });
  const r = await t.edu.eduAttendCourses(TEACHER);
  assert.equal(r.ok, true); assert.equal(r.scope, "assigned");
  assert.deepEqual(r.courses.map((c) => c.id), [COURSE], "가짜 db 가 B 까지 줘도 다시 거른다");
  assert.deepEqual([r.courses[0].sessionsCount, r.courses[0].nextDate, r.courses[0].hasToday, r.courses[0].confirmed], [1, "2999-01-01", false, 0]);
  const sq = t.log.q.find((q) => q.table === "edu_course_staff");
  assert.ok(asked(sq, "eq", "member_id", TEACH_M));
  assert.ok(sq.c.calls.some((x) => x[0] === "in" && x[1] === "kind" && JSON.stringify(x[2]) === '["teacher"]'));
  const none = setup({ staffRows: [] });
  assert.deepEqual((await none.edu.eduAttendCourses(TEACHER)).courses, []);
  assert.ok(!none.log.q.some((q) => q.table === "edu_courses"));
  const c = setup({ applyRes: [], tables: { edu_courses: [A, B], edu_sessions: [] } });
  const all = await c.edu.eduAttendCourses(CHIEF);
  assert.equal(all.scope, "all");
  assert.deepEqual(all.courses.map((x) => x.id), [COURSE_B, COURSE], "진행 중 먼저");
  assert.ok(!c.log.q.some((q) => q.table === "edu_course_staff"));
  assert.ok(c.log.q.find((q) => q.table === "edu_courses").c.calls.some((x) => x[0] === "neq" && x[1] === "status" && x[2] === "archived"));
});

test("eduStaffSet·eduStaffCandidates kind:'teacher' — 강사 줄만 빼고 더함 · 강사 후보(teacher·education·educourse) · 기록에 kind · 틀린 kind 는 bad-kind", async () => {
  const bad = setup();
  assert.deepEqual(await bad.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [], kind: "boss" }), { ok: false, error: "bad-kind" });
  assert.deepEqual(await bad.edu.eduStaffCandidates({ kind: "boss" }), { ok: false, error: "bad-kind" });
  assert.equal(bad.log.q.length, 0);
  const grants = [{ member_id: TEACH_M, role_id: "teacher" }];
  const members = [{ id: TEACH_M, name: "이강사", type: "교구", gu: "기쁨", mok: "3" }];
  const cand = setup({ tables: { admin_role_grants: grants, admin_members: members } });
  assert.deepEqual(await cand.edu.eduStaffCandidates({ kind: "teacher" }), { ok: true, members: [{ id: TEACH_M, name: "이강사", who: "기쁨 3목장", roles: ["teacher"] }] });
  const g = cand.log.q.find((q) => q.table === "admin_role_grants");
  assert.ok(g.c.calls.some((x) => x[0] === "in" && x[1] === "role_id" && ["teacher", "education", "educourse"].every((r) => x[2].includes(r)) && !x[2].includes("super")));
  // 담당 후보(kind 없음)에는 강사 역할만 가진 분이 안 나온다(역할 목록이 다르다)
  const mg = setup({ tables: { admin_role_grants: grants, admin_members: members } });
  await mg.edu.eduStaffCandidates({});
  assert.ok(!mg.log.q.find((q) => q.table === "admin_role_grants").c.calls.some((x) => x[0] === "in" && x[2].includes("teacher")));
  // 더하기 — 강사 줄(kind teacher)만 묻고·더한다 · 기록 {course, count, kind}
  const add = setup({ tables: { edu_courses: { id: COURSE }, admin_role_grants: grants, admin_members: members, edu_course_staff: [] } });
  assert.deepEqual(await add.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [TEACH_M], kind: "teacher" }), { ok: true, count: 1, changed: true });
  const cur = add.log.q.find((q) => q.table === "edu_course_staff");
  assert.ok(asked(cur, "eq", "kind", "teacher"));
  const up = add.log.q.flatMap((q) => q.c.calls).filter((x) => x[0] === "upsert");
  assert.deepEqual(up.map((x) => x[1]), [[{ course_id: COURSE, member_id: TEACH_M, kind: "teacher" }]]);
  assert.deepEqual(add.log.audit, [["edu.staff.set", COURSE, { course: COURSE, count: 1, kind: "teacher" }]]);
  // 강사 후보가 아닌 분(담당 역할만 있어도 — 그분은 후보다 · 여기선 역할 없는 분) → bad-member
  const no = setup({ tables: { edu_courses: { id: COURSE }, admin_role_grants: [], admin_members: [], edu_course_staff: [] } });
  assert.deepEqual(await no.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [OTHER_M], kind: "teacher" }), { ok: false, error: "bad-member" });
  assert.equal(no.log.writes, 0);
  // 빼기 — 강사 줄만 지운다(담당 줄은 그대로)
  const out = setup({ tables: { edu_courses: { id: COURSE }, edu_course_staff: [{ member_id: TEACH_M }] } });
  assert.deepEqual(await out.edu.eduStaffSet(CHIEF, { course_id: COURSE, member_ids: [], kind: "teacher" }), { ok: true, count: 0, changed: true });
  const del = out.log.q.find((q) => q.c.calls.some((x) => x[0] === "delete"));
  assert.ok(asked(del, "eq", "kind", "teacher"));
});

test("강좌 카드 teachers — 강사 줄은 teachers 로(담당 staff 와 따로) · 강사 역할을 잃으면 stale · 한 질의", async () => {
  const c = setup({ applyRes: [], tables: {
    edu_courses: [{ ...COURSE_ROW, id: COURSE }],
    edu_course_staff: [
      { course_id: COURSE, member_id: STAFF_M, kind: "manager", admin_members: { name: "박담당", status: "active" } },
      { course_id: COURSE, member_id: TEACH_M, kind: "teacher", admin_members: { name: "이강사", status: "active" } },
      { course_id: COURSE, member_id: OTHER_M, kind: "teacher", admin_members: { name: "최옛강사", status: "active" } },
    ],
    admin_role_grants: [{ member_id: STAFF_M, role_id: "educourse" }, { member_id: TEACH_M, role_id: "teacher" }],
  } });
  const r = await c.edu.eduCourses(CHIEF, {});
  assert.deepEqual(r.courses[0].staff, [{ id: STAFF_M, name: "박담당" }]);
  assert.deepEqual(r.courses[0].teachers, [{ id: TEACH_M, name: "이강사" }, { id: OTHER_M, name: "최옛강사", stale: true }]);
  assert.equal(c.log.q.filter((q) => q.table === "edu_course_staff").length, 1);
});

test("회차는 id 로 — eduSessions 는 회차마다 id 를 준다 · eduSessionsSave 는 id 를 그대로 SQL 에 넘긴다 · has-attendance 는 그대로 · 기록 안 함", async () => {
  const a = setup({ staffRows: [], tables: { edu_sessions: [{ id: 51, no: 1, on_date: "2027-03-03", start_time: "19:30:00", end_time: null, topic: "", place: "" },
    { id: 53, no: 2, on_date: "2027-03-17", start_time: null, end_time: null, topic: "", place: "" }] } });
  const r = await a.edu.eduSessions(CHIEF, { course_id: COURSE });
  assert.deepEqual(r.sessions.map((s) => [s.id, s.no, s.start_time]), [[51, 1, "19:30"], [53, 2, null]]);
  const sel = a.log.q.find((q) => q.table === "edu_sessions").c.calls.find((x) => x[0] === "select");
  assert.ok(/(^|,)id(,|$)/.test(sel[1]), "eduSessions 가 id 를 읽지 않는다");
  // 저장 — 가운데(2회 id 52)를 빼고 3회(id 53)를 2회로 당긴 목록 + 새 회차
  const s = setup({ applyRes: { ok: true, count: 3 } });
  const body = { course_id: COURSE, sessions: [{ id: 51, no: 1, on_date: "2027-03-03" }, { id: 53, no: 2, on_date: "2027-03-17" }, { no: 3, on_date: "2027-03-24" }] };
  assert.deepEqual(await s.edu.eduSessionsSave(CHIEF, body), { ok: true, count: 3 });
  assert.equal(s.log.rpc[0][0], "edu_sessions_replace");
  assert.deepEqual(s.log.rpc[0][1].p_rows.map((x) => [x.id ?? null, x.no]), [[51, 1], [53, 2], [null, 3]]);
  assert.deepEqual(s.log.audit, [["edu.sessions", COURSE, { count: 3 }]]);
  // SQL 이 거절하면(has-attendance) 그대로 돌려주고 기록하지 않는다
  const h = setup({ applyRes: { ok: false, error: "has-attendance", nos: [2] } });
  assert.deepEqual(await h.edu.eduSessionsSave(CHIEF, body), { ok: false, error: "has-attendance", nos: [2] });
  assert.equal(h.log.audit.length, 0);
  // 틀린 id 는 SQL 에 가기 전에 bad-rows
  const b = setup();
  assert.deepEqual(await b.edu.eduSessionsSave(CHIEF, { course_id: COURSE, sessions: [{ id: "x", no: 1, on_date: "2027-03-03" }] }), { ok: false, error: "bad-rows" });
  assert.equal(b.log.rpc.length, 0);
});

// ---------- 수료(3단계 · 2026-10-05) — 총괄 + 그 강좌 교육 담당(manager 줄) · 강사 아님 · 쓰기는 SQL 함수 · 기록은 id·수·칸 이름만 ----------
const M_ROWS = [{ course_id: COURSE, member_id: STAFF_M, kind: "manager" }];   // 교육 담당 STAFF 는 강좌 A(COURSE)만
const CERT_COURSE = { id: COURSE, title: "구원론", term: "2026 가을", status: "running", attend_pct: 80, check_label: "과제", starts_on: null, ends_on: null };
const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("수료 — 교육 담당은 맡지 않은 강좌(B)에서 not-assigned · 쓰기·SQL 함수·기록 0 · 강좌·명단을 읽지도 않는다 · 신청 줄은 그 줄의 강좌로", async () => {
  const NA = { ok: false, error: "not-assigned" };
  for (const [fn, body] of [
    ["eduCertList", { course_id: COURSE_B }],
    ["eduCertIssue", { course_id: COURSE_B, enrollment_ids: [7, 8] }],
    ["eduCertPrint", { course_id: COURSE_B }],
    ["eduCheckSet", { enrollment_id: 7, done: true, course_id: COURSE }],     // 몸통에 A 를 실어도 신청 줄(B)의 강좌로 본다
    ["eduCertRevoke", { enrollment_id: 7, course_id: COURSE }],
  ]) {
    const a = setup({ staffRows: M_ROWS, tables: { edu_enrollments: { id: 7, course_id: COURSE_B } }, applyRes: { ok: true, issued: [] } });
    assert.deepEqual(await a.edu[fn](STAFF, body), NA, fn);
    assert.equal(a.log.writes, 0, fn + " 썼다");
    assert.equal(a.log.rpc.length, 0, fn + " SQL 함수를 불렀다");
    assert.equal(a.log.audit.length, 0, fn + " 기록했다");
    assert.ok(!a.log.q.some((q) => q.table === "edu_courses" || q.table === "edu_attendance" || q.table === "edu_cert_settings"), fn + " 강좌·출석·설정을 읽었다");
    const sq = a.log.q.filter((q) => q.table === "edu_course_staff");
    assert.equal(sq.length, 1, fn);
    assert.ok(asked(sq[0], "eq", "course_id", COURSE_B) && asked(sq[0], "eq", "kind", "manager"), fn + " B·manager 로 묻지 않았다");
  }
  // 강사(teacher 줄)로는 수료가 안 열린다 — 문(ACTION_ROLES)에서도 막히지만 강좌 확인도 manager 줄만 본다
  const t = setup({ staffRows: [{ course_id: COURSE, member_id: TEACH_M, kind: "teacher" }], applyRes: { ok: true, issued: [] } });
  assert.deepEqual(await t.edu.eduCertIssue({ member: { id: TEACH_M }, roles: ["teacher", "educourse"] }, { course_id: COURSE, enrollment_ids: [7] }), NA);
  assert.equal(t.log.rpc.length, 0);
});

test("eduCertIssue — 이름 가나다 차례로 세워 SQL 에(배열 차례대로 번호) · p_by = 나 · 기록은 새로·되살린 줄의 id·수만 · 모두 already 면 기록 없음", async () => {
  const rows = [
    { id: 71, name: "홍길동", who_type: "교구", group_name: "기쁨", sub_name: "3", user_id: USER },
    { id: 72, name: "김하나", who_type: "교구", group_name: "소망", sub_name: "1" },
    { id: 73, name: "박둘", who_type: "", group_name: "", sub_name: "" },
    { id: 74, name: "김하나", who_type: "교구", group_name: "기쁨", sub_name: "2" },
  ];
  const issued = [{ id: 74, certNo: "고척-2026-0001", how: "new" }, { id: 72, certNo: "고척-2026-0002", how: "new" },
    { id: 73, certNo: "고척-2025-0004", how: "restored" }, { id: 71, certNo: "고척-2026-0003", how: "already" }];
  const a = setup({ staffRows: M_ROWS, rows, applyRes: { ok: true, issued } });
  const r = await a.edu.eduCertIssue(STAFF, { course_id: COURSE, enrollment_ids: [71, "72", 73, 74, 71] });
  assert.deepEqual(r, { ok: true, issued });
  assert.equal(a.log.rpc.length, 1);
  assert.deepEqual(a.log.rpc[0], ["edu_issue_certs", { p_course: COURSE, p_ids: [74, 72, 73, 71], p_by: STAFF_M }], "김하나(기쁨) → 김하나(소망) → 박둘 → 홍길동");
  assert.deepEqual(a.log.audit, [["edu.cert.issue", COURSE, { course: COURSE, count: 3, fresh: 2, restored: 1, ids: [74, 72, 73] }]]);
  assert.equal(JSON.stringify(a.log.audit).includes("김하나") || JSON.stringify(a.log.audit).includes("고척-"), false, "기록에 이름·번호");
  assert.equal(a.log.writes, 0, "표에 직접 쓰지 않는다(SQL 함수만)");
  // 이름은 그 강좌의 신청 줄 전부에서(쪽 넘기기) — id 목록을 주소에 싣지 않는다
  const eq = a.log.q.find((q) => q.table === "edu_enrollments");
  assert.ok(asked(eq, "eq", "course_id", COURSE) && !eq.c.calls.some((x) => x[0] === "in"));
  assert.ok(!eq.c.calls.some((x) => x[0] === "select" && /user_id|ident_key/.test(x[1])));
  // 모두 already — 기록 없음
  const s = setup({ staffRows: M_ROWS, rows, applyRes: { ok: true, issued: [{ id: 71, certNo: "고척-2026-0003", how: "already" }] } });
  assert.equal((await s.edu.eduCertIssue(STAFF, { course_id: COURSE, enrollment_ids: [71] })).ok, true);
  assert.equal(s.log.audit.length, 0);
  // SQL 거절(확정 아님 등)은 그대로 · 기록 없음
  const n = setup({ staffRows: M_ROWS, rows, applyRes: { ok: false, error: "not-confirmed", ids: [73] } });
  assert.deepEqual(await n.edu.eduCertIssue(STAFF, { course_id: COURSE, enrollment_ids: [73] }), { ok: false, error: "not-confirmed", ids: [73] });
  assert.equal(n.log.audit.length, 0);
  // 틀린 입력 — 아무것도 안 읽는다
  const b = setup();
  assert.deepEqual(await b.edu.eduCertIssue(CHIEF, { course_id: "x", enrollment_ids: [1] }), { ok: false, error: "bad-id" });
  assert.deepEqual(await b.edu.eduCertIssue(CHIEF, { course_id: COURSE, enrollment_ids: [] }), { ok: false, error: "bad-ids" });
  assert.deepEqual(await b.edu.eduCertIssue(CHIEF, { course_id: COURSE, enrollment_ids: [0] }), { ok: false, error: "bad-ids" });
  assert.equal(b.log.q.length + b.log.rpc.length, 0);
  // 총괄은 담당 줄을 묻지 않는다
  const c = setup({ rows, applyRes: { ok: true, issued: [] } });
  await c.edu.eduCertIssue(CHIEF, { course_id: COURSE, enrollment_ids: [72] });
  assert.ok(!c.log.q.some((q) => q.table === "edu_course_staff"));
  assert.equal(c.log.rpc[0][1].p_by, CHIEF_M);
});

test("eduCheckSet·eduCertRevoke — SQL 함수로만 · bad-done · 기록 id 만 · 이미 취소면 기록 없음", async () => {
  const tables = { edu_enrollments: { id: 7, course_id: COURSE } };
  const a = setup({ staffRows: M_ROWS, tables, applyRes: { ok: true, done: true } });
  assert.deepEqual(await a.edu.eduCheckSet(STAFF, { enrollment_id: 7, done: true }), { ok: true, done: true });
  assert.deepEqual(a.log.rpc, [["edu_check_set", { p_enrollment: 7, p_done: true }]]);
  assert.deepEqual(a.log.audit, [["edu.cert.check", "7", { enrollment: 7, done: true }]]);
  const bad = setup({ staffRows: M_ROWS, tables });
  for (const done of [undefined, null, "true", 1]) assert.deepEqual(await bad.edu.eduCheckSet(STAFF, { enrollment_id: 7, done }), { ok: false, error: "bad-done" }, String(done));
  assert.deepEqual(await bad.edu.eduCheckSet(STAFF, { enrollment_id: 0, done: true }), { ok: false, error: "bad-id" });
  assert.equal(bad.log.q.length + bad.log.rpc.length, 0);
  const nc = setup({ staffRows: M_ROWS, tables, applyRes: { ok: false, error: "not-confirmed" } });
  assert.deepEqual(await nc.edu.eduCheckSet(STAFF, { enrollment_id: 7, done: true }), { ok: false, error: "not-confirmed" });
  assert.equal(nc.log.audit.length, 0);
  const r = setup({ staffRows: M_ROWS, tables, applyRes: { ok: true, certNo: "고척-2026-0001" } });
  assert.deepEqual(await r.edu.eduCertRevoke(STAFF, { enrollment_id: 7 }), { ok: true, certNo: "고척-2026-0001" });
  assert.deepEqual(r.log.rpc, [["edu_revoke_cert", { p_enrollment: 7, p_by: STAFF_M }]]);
  assert.deepEqual(r.log.audit, [["edu.cert.revoke", "7", { enrollment: 7 }]]);
  const al = setup({ staffRows: M_ROWS, tables, applyRes: { ok: true, already: true, certNo: "고척-2026-0001" } });
  assert.equal((await al.edu.eduCertRevoke(STAFF, { enrollment_id: 7 })).already, true);
  assert.equal(al.log.audit.length, 0);
});

test("eduCertList — 확정자만·출석률(eduAttendRate)·후보·수료 칸 · 강좌 기준·기간 · user_id·ident_key 를 읽지도 싣지도 않는다", async () => {
  const people = [
    { id: 71, name: "홍길동", who_type: "교구", group_name: "기쁨", sub_name: "3", check_done: true, completed: true, completed_at: "2026-10-05T01:00:00+00:00", cert_no: "고척-2026-0001", cert_revoked: false, user_id: USER },
    { id: 72, name: "김하나", who_type: "교구", group_name: "소망", sub_name: "1", check_done: false, completed: false, cert_no: null, cert_revoked: false },
  ];
  const sessions = [{ id: 51, course_id: COURSE, no: 1, on_date: "2026-10-25" }, { id: 52, course_id: COURSE, no: 2, on_date: "2026-11-01" }];
  const att = [{ enrollment_id: 71, session_id: 51, state: "present" }, { enrollment_id: 72, session_id: 51, state: "present" }, { enrollment_id: 72, session_id: 52, state: "present" }];
  const a = setup({ staffRows: M_ROWS, rows: people, tables: { edu_courses: CERT_COURSE, edu_sessions: sessions, edu_attendance: att } });
  const r = await a.edu.eduCertList(STAFF, { course_id: COURSE });
  assert.equal(r.ok, true);
  assert.deepEqual(r.course, { id: COURSE, title: "구원론", term: "2026 가을", status: "running", statusLabel: "진행 중", attendPct: 80, checkLabel: "과제",
    from: "2026-10-25", to: "2026-11-01", archived: false });
  assert.deepEqual(r.counts, { total: 2, candidates: 0, completed: 1, revoked: 0 });
  assert.deepEqual(r.people.map((p) => [p.id, p.candidate, p.checkDone, p.completed, p.certNo, p.attend.pct]), [[72, false, false, false, null, 100], [71, true, true, true, "고척-2026-0001", 100]]);
  assert.equal(JSON.stringify(r).includes(USER) || /user_id|ident_key|staff_note/.test(JSON.stringify(r)), false);
  const eq = a.log.q.find((q) => q.table === "edu_enrollments");
  assert.ok(asked(eq, "eq", "status", "confirmed"));
  assert.ok(!eq.c.calls.some((x) => x[0] === "select" && /user_id|ident_key|staff_note/.test(x[1])));
  assert.equal(a.log.audit.length + a.log.rpc.length + a.log.writes, 0, "보기는 기록하지 않는다");
  const nf = setup({ tables: { edu_courses: null } });
  assert.deepEqual(await nf.edu.eduCertList(CHIEF, { course_id: COURSE }), { ok: false, error: "not-found" });
});

test("eduCertPrint — 수료(취소 아님)만 · 문안의 {과정}을 제목으로 · 명의·직인 · 기간 · 기록 edu.cert.print {course, count}", async () => {
  const rows = [
    { id: 71, name: "홍길동", completed: true, cert_revoked: false, cert_no: "고척-2026-0002", completed_at: "2026-10-05T01:00:00+00:00", user_id: USER },
    { id: 72, name: "김하나", completed: true, cert_revoked: false, cert_no: "고척-2026-0001", completed_at: "2026-10-05T01:00:00+00:00" },
    { id: 73, name: "박둘", completed: false, cert_revoked: true, cert_no: "고척-2026-0003", completed_at: "2026-10-05T01:00:00+00:00" },
  ];
  const a = setup({ staffRows: M_ROWS, rows, tables: { edu_courses: { ...CERT_COURSE, starts_on: "2026-10-01", ends_on: "2026-12-20" }, edu_sessions: [],
    edu_cert_settings: { issuer: "고척교회", body: "위 사람은 「{과정}」 과정을 마쳤습니다.", seal: PNG1, updated_at: "2026-10-05T00:00:00Z" } } });
  const r = await a.edu.eduCertPrint(STAFF, { course_id: COURSE });
  assert.deepEqual(r, { ok: true, course: { id: COURSE, title: "구원론", term: "2026 가을", from: "2026-10-01", to: "2026-12-20" },
    issuer: "고척교회", body: "위 사람은 「구원론」 과정을 마쳤습니다.", seal: PNG1,
    people: [{ id: 72, name: "김하나", certNo: "고척-2026-0001", issuedOn: "2026-10-05" }, { id: 71, name: "홍길동", certNo: "고척-2026-0002", issuedOn: "2026-10-05" }] });
  assert.deepEqual(a.log.audit, [["edu.cert.print", COURSE, { course: COURSE, count: 2 }]]);
  const eq = a.log.q.find((q) => q.table === "edu_enrollments");
  assert.ok(asked(eq, "eq", "completed", true) && asked(eq, "eq", "cert_revoked", false));
  assert.equal(JSON.stringify(r).includes(USER), false);
});

test("수료증 설정 — 교육 총괄만(교육 담당·강사는 forbidden · 아무것도 안 읽고 안 씀) · 보낸 칸 가운데 바뀐 것만 upsert · 기록은 칸 이름만(이미지 없음) · 직인 검사", async () => {
  const cur = { issuer: "고척교회", body: "위 사람은 「{과정}」 과정을 마쳤습니다.", seal: null, updated_at: "2026-10-05T00:00:00Z" };
  for (const ctx of [STAFF, TEACHER, { member: { id: STAFF_M }, roles: ["educourse", "teacher"] }]) {
    const a = setup({ tables: { edu_cert_settings: cur } });
    assert.deepEqual(await a.edu.eduCertSettingsSave(ctx, { issuer: "x" }), { ok: false, error: "forbidden" });
    assert.deepEqual(await a.edu.eduCertSettings(ctx), { ok: false, error: "forbidden" });
    assert.equal(a.log.q.length + a.log.writes + a.log.audit.length, 0);
  }
  // 읽기 — {과정} 이 든 그대로
  const g = setup({ tables: { edu_cert_settings: cur } });
  assert.deepEqual(await g.edu.eduCertSettings(CHIEF), { ok: true, issuer: "고척교회", body: cur.body, seal: null, updatedAt: cur.updated_at });
  // 저장 — 명의 그대로 · 직인만 바뀜 → upsert 에 seal(+id·updated_at)만 · 기록 {fields:["seal"]}
  const s = setup({ tables: { edu_cert_settings: cur } });
  assert.deepEqual(await s.edu.eduCertSettingsSave(CHIEF, { issuer: "고척교회", seal: PNG1 }), { ok: true, changed: true, fields: ["seal"] });
  const up = s.log.q.flatMap((q) => q.c.calls).find((x) => x[0] === "upsert");
  assert.deepEqual(Object.keys(up[1]).sort(), ["id", "seal", "updated_at"]);
  assert.equal(up[1].id, 1); assert.equal(up[1].seal, PNG1);
  assert.deepEqual(s.log.audit, [["edu.cert.settings", "1", { fields: ["seal"] }]]);
  assert.equal(JSON.stringify(s.log.audit).includes("base64"), false, "기록에 이미지");
  // 바뀐 것 없음 — 쓰지도 기록하지도 않는다
  const n = setup({ tables: { edu_cert_settings: cur } });
  assert.deepEqual(await n.edu.eduCertSettingsSave(CHIEF, { issuer: "고척교회", seal: null }), { ok: true, changed: false, fields: [] });
  assert.equal(n.log.writes + n.log.audit.length, 0);
  // 직인·글 검사 — 읽기 전에 거절
  for (const [body, err] of [[{ seal: "data:image/svg+xml;base64,PHN2Zz4=" }, "bad-seal"], [{ seal: "data:image/png;base64,PHN2Zz4=" }, "bad-seal"],
    [{ seal: "data:image/png;base64,iVBORw0KGgo" + "A".repeat(409600) }, "seal-too-big"], [{ body: "" }, "no-body"], [{}, "nothing"]]) {
    const x = setup({ tables: { edu_cert_settings: cur } });
    assert.equal((await x.edu.eduCertSettingsSave(CHIEF, body)).error, err, err);
    assert.equal(x.log.q.length + x.log.writes + x.log.audit.length, 0, err);
  }
  // 총괄 관리자(super)도 된다
  const sp = setup({ tables: { edu_cert_settings: cur } });
  assert.equal((await sp.edu.eduCertSettingsSave({ member: { id: CHIEF_M }, roles: ["super"] }, { issuer: "고척교회 담임목사" })).changed, true);
});
