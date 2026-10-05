import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEdu } from "../supabase/functions/church-admin/edu-db.ts";

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
function setup({ prev = [], pick, applyRes, rows, tables = {} } = {}) {
  const log = { q: [], rpc: [], audit: [], writes: 0, lookups: 0 };
  const chain = (table) => {
    const c = { calls: [] };
    const m = new Proxy(c, { get(_, k) {
      if (k === "then") return (res) => res({ data: table in tables ? tables[table] : prev, error: null });
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
  const staffRows = [{ course_id: COURSE, member_id: STAFF_M, admin_members: { name: "박담당" } },
    { course_id: COURSE, member_id: CHIEF_M, admin_members: { name: "김총괄" } }];
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
  const c = setup({ applyRes: [], tables: { edu_courses: [A, B], edu_course_staff: staffRows } });
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
