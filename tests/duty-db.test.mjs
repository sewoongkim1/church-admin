// 봉사 당번 — 서버 액션 시험(duty-db.ts · 2026-10-06). 가짜 db(메모리 표 · 거르기를 지킨다)로 「맡은 당번만」·칸 고르기·기록·알림 차례를 본다.
//   정원·겹침·잠금 같은 규칙은 SQL(성경암송 supabase/tests/duty_rules.dev.sql)이 본다 — 여기는 SQL 함수에 무엇을 넘기고 답에서 무엇을 싣는지.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDuty } from "../supabase/functions/church-admin/duty-db.ts";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";      // 담당 L 이 맡은 당번
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";      // 맡지 않은 당번
const Z = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";      // 보관한 당번(L 이 맡음)
const LEAD_M = "11111111-1111-4111-8111-111111111111";
const CHIEF_M = "22222222-2222-4222-8222-222222222222";
const OTHER_M = "33333333-3333-4333-8333-333333333333";
const USER = "99999999-9999-4999-8999-999999999999";   // 앱 계정(성도님)
const CHIEF = { member: { id: CHIEF_M }, roles: ["duty"] };
const SUPER = { member: { id: CHIEF_M }, roles: ["super"] };
const LEAD = { member: { id: LEAD_M }, roles: ["dutylead"] };

// 가짜 db — 표는 줄 배열. eq·in·is 거르기를 지키고(서버가 고른 값으로 물었는지 본다), insert·update·delete·upsert 를 실제로 한다.
//   rpc 는 rpcs[이름](args) 또는 값을 돌려준다(없으면 {ok:true}). log: q(질의) · rpc · writes · audit · notify · lookups.
function setup({ rpcs = {}, tables = {}, pick, notifyRes, notifyThrows, noNotify = false } = {}) {
  const t = {
    duty_boards: [
      { id: A, title: "식당 봉사", description: "", place: "식당", contact_note: "", open_days: 56, until_date: null, max_ahead: null, status: "open", created_at: "2026-10-01", updated_at: "u" },
      { id: B, title: "주차 봉사", description: "", place: "", contact_note: "", open_days: 56, until_date: null, max_ahead: null, status: "open", created_at: "2026-10-02", updated_at: "u" },
      { id: Z, title: "옛 당번", description: "", place: "", contact_note: "", open_days: 56, until_date: null, max_ahead: null, status: "archived", created_at: "2026-09-01", updated_at: "u" },
    ],
    duty_board_staff: [
      { board_id: A, member_id: LEAD_M, admin_members: { name: "가상담당", status: "active" } },
      { board_id: Z, member_id: LEAD_M, admin_members: { name: "가상담당", status: "active" } },
      { board_id: B, member_id: OTHER_M, admin_members: { name: "가상다른", status: "active" } },
    ],
    duty_lines: [
      { id: 1, board_id: A, sort: 0, service: "1부", task: "설거지", start_time: "09:00:00", end_time: "10:00:00", capacity: 2, weekday: 0, active: true },
      { id: 2, board_id: B, sort: 0, service: "주차", task: "", start_time: "08:00:00", end_time: "09:00:00", capacity: 4, weekday: 0, active: true },
      { id: 3, board_id: A, sort: 0, service: "옛 틀", task: "", start_time: "07:00:00", end_time: "08:00:00", capacity: 1, weekday: 0, active: false },
    ],
    duty_slots: [{ id: 10, board_id: A }, { id: 20, board_id: B }, { id: 30, board_id: Z }],
    duty_signups: [{ id: 100, slot_id: 10, staff_note: "" }, { id: 200, slot_id: 20, staff_note: "" }, { id: 300, slot_id: 30, staff_note: "" }],
    admin_role_grants: [{ member_id: LEAD_M, role_id: "dutylead" }, { member_id: CHIEF_M, role_id: "duty" }, { member_id: OTHER_M, role_id: "education" }],
    admin_members: [
      { id: LEAD_M, name: "가상담당", type: "교구", gu: "기쁨", mok: "3", bu: "", grade: "", status: "active" },
      { id: CHIEF_M, name: "가상총괄", type: "교구", gu: "화평", mok: "1", bu: "", grade: "", status: "active" },
      { id: OTHER_M, name: "가상다른", type: "교구", gu: "사랑", mok: "2", bu: "", grade: "", status: "active" },
    ],
    ...tables,
  };
  const log = { q: [], rpc: [], writes: [], audit: [], notify: [], lookups: 0, picks: 0 };
  const from = (table) => {
    const st = { table, filters: [], op: "select", payload: null, one: false, lim: null };
    const rowsOf = () => (t[table] ??= []);
    const match = (r) => st.filters.every(([k, col, v]) => k === "eq" ? String(r[col]) === String(v)
      : k === "in" ? v.map(String).includes(String(r[col])) : k === "is" ? r[col] === v : true);
    const run = () => {
      let rows = rowsOf().filter(match);
      if (st.op === "insert") {
        rows = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((x, i) => ({ id: x.id ?? `new-${rowsOf().length + i + 1}`, ...x }));
        rowsOf().push(...rows);
        log.writes.push([table, "insert", st.payload]);
      } else if (st.op === "upsert") {
        rows = st.payload.map((x) => ({ ...x }));
        rowsOf().push(...rows);
        log.writes.push([table, "upsert", st.payload]);
      } else if (st.op === "update") {
        rows.forEach((r) => Object.assign(r, st.payload));
        log.writes.push([table, "update", st.payload, rows.map((r) => r.id)]);
      } else if (st.op === "delete") {
        t[table] = rowsOf().filter((r) => !match(r));
        log.writes.push([table, "delete", rows.map((r) => r.member_id ?? r.id)]);
      }
      if (st.lim != null) rows = rows.slice(0, st.lim);
      rows = rows.map((r) => ({ ...r }));          // 읽은 줄은 사본(진짜 db 처럼 — 뒤의 update 가 앞서 읽은 값을 바꾸지 않는다)
      return { data: st.one ? (rows[0] ?? null) : rows, error: null };
    };
    const api = {
      select() { return api; }, order() { return api; },
      eq(c, v) { st.filters.push(["eq", c, v]); return api; },
      in(c, v) { st.filters.push(["in", c, v]); return api; },
      is(c, v) { st.filters.push(["is", c, v]); return api; },
      limit(n) { st.lim = n; return api; },
      insert(p) { st.op = "insert"; st.payload = p; return api; },
      update(p) { st.op = "update"; st.payload = p; return api; },
      delete() { st.op = "delete"; return api; },
      upsert(p) { st.op = "upsert"; st.payload = p; return api; },
      maybeSingle() { st.one = true; return Promise.resolve(run()); },
      single() { st.one = true; return Promise.resolve(run()); },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    log.q.push(st);
    return api;
  };
  const db = { from, rpc: async (fn, args) => {
    log.rpc.push([fn, args]);
    const r = rpcs[fn];
    return { data: typeof r === "function" ? r(args) : r === undefined ? (fn === "duty_board_counts" ? {} : { ok: true }) : r, error: null };
  } };
  const audit = async (_c, action, target, detail) => { log.audit.push([action, target, detail]); };
  const deps = {
    peopleLookup: async () => { log.lookups++; return { ok: true, source: { date: "2026-09-28", total: 1 }, people: [] }; },
    personPick: async () => { log.picks++; return pick ?? { ok: true, ident: { name: "가상하나", who_type: "교구", group_name: "기쁨", sub_name: "3", ident_key: "person|9" }, appUserId: null }; },
    allRows: async (build) => (await build()).data,
  };
  if (!noNotify) deps.dutyNotify = async (kind, ids) => {
    log.notify.push([kind, ids, log.rpc.length, log.audit.length]);
    if (notifyThrows) throw new Error("api down");
    return notifyRes === undefined ? { sent: ids.length } : notifyRes;
  };
  return { duty: makeDuty(db, audit, deps), log, t };
}
const NOT_ASSIGNED = { ok: false, error: "not-assigned" };
const rpcNames = (log) => log.rpc.map((x) => x[0]);
// 당번 요약 수(duty_board_counts) 말고 실제로 무엇을 바꾸는 SQL 함수를 불렀나
const wrote = (log) => rpcNames(log).filter((n) => n !== "duty_board_counts" && n !== "duty_roster").length + log.writes.length;
const queried = (log, table) => log.q.filter((x) => x.table === table);

// ---------- 맡은 당번만 ----------
// 맡지 않은 당번(B)을 겨눈 요청 — board_id 로 · 자리 번호로 · 지원 번호로 · 틀 번호로
const TARGET_B = {
  dutyBoardSave: { board: { id: B, title: "주차 봉사", status: "closed" } },
  dutyLineSave: { board_id: B, line: { service: "3부", start: "13:00", end: "14:00", capacity: 1, weekday: 0 } },
  dutyLineRemove: { id: 2 },
  dutyDateAdd: { board_id: B, date: "2026-12-25", line_ids: [2] },
  dutyRoster: { board_id: B },
  dutyExport: { board_id: B },
  dutyDaySet: { board_id: B, date: "2026-10-18", op: "confirm" },
  dutyDaysOff: { board_id: B, from: "2026-10-18", to: "2026-10-18", off: true, expect: 0 },
  dutySlotSet: { slot_id: 20, capacity: 9 },
  dutySlotDelete: { slot_id: 20 },
  dutySignAdd: { slot_id: 20, name: "가상하나", pick: 0, check: {} },
  dutySignRemove: { id: 200 },
  dutySignMove: { id: 200, to_slot: 10 },
  dutySignNote: { id: 200, note: "메모" },
  dutyAskClear: { id: 200 },
  dutyPeopleLookup: { board_id: B, name: "가상하나" },
};

test("당번 담당 — 맡지 않은 당번은 어느 길로 와도 not-assigned · 아무것도 쓰지 않고 부르지 않고 기록하지 않는다", async () => {
  for (const [action, body] of Object.entries(TARGET_B)) {
    const { duty, log } = setup();
    assert.deepEqual(await duty[action](LEAD, body), NOT_ASSIGNED, action);
    assert.equal(log.rpc.length, 0, action + " — SQL 함수를 불렀다");
    assert.equal(log.writes.length, 0, action + " — 표에 썼다");
    assert.equal(log.audit.length, 0, action + " — 기록을 남겼다");
    assert.equal(log.notify.length, 0, action);
    assert.equal(log.lookups + log.picks, 0, action + " — 교인명부를 찾았다");
  }
});

test("당번 담당 — 몸통의 board_id 를 맡은 당번(A)으로 속여도 줄 번호의 당번(B)을 서버가 읽는다", async () => {
  const lie = {
    dutySlotSet: { board_id: A, slot_id: 20, capacity: 9 },
    dutySlotDelete: { board_id: A, slot_id: 20 },
    dutySignAdd: { board_id: A, slot_id: 20, ident: { name: "가상새가족" } },
    dutySignRemove: { board_id: A, id: 200 },
    dutySignMove: { board_id: A, id: 200, to_slot: 10 },
    dutySignNote: { board_id: A, id: 200, note: "메모" },
    dutyAskClear: { board_id: A, id: 200 },
    dutyLineRemove: { board_id: A, id: 2 },
  };
  for (const [action, body] of Object.entries(lie)) {
    const { duty, log } = setup();
    assert.deepEqual(await duty[action](LEAD, body), NOT_ASSIGNED, action);
    assert.equal(wrote(log), 0, action);
    assert.equal(log.audit.length, 0, action);
  }
});

test("당번 담당 — 맡은 당번(A)은 지나간다 · 총괄(당번 총괄·총괄 관리자)은 담당 줄을 묻지 않고 지나간다", async () => {
  const a = setup();
  assert.equal((await a.duty.dutySlotSet(LEAD, { slot_id: 10, capacity: 3 })).ok, true);
  assert.equal(queried(a.log, "duty_board_staff").length, 1);
  const st = queried(a.log, "duty_board_staff")[0].filters;
  assert.deepEqual(st, [["eq", "board_id", A], ["eq", "member_id", LEAD_M]], "서버가 읽은 당번·부른 분으로 물어야 한다");
  for (const ctx of [CHIEF, SUPER]) {
    const c = setup();
    assert.equal((await c.duty.dutySlotSet(ctx, { slot_id: 20, capacity: 3 })).ok, true);
    assert.equal(queried(c.log, "duty_board_staff").length, 0);
  }
  // 담당자 id 가 없는 분(ctx.member 없음)은 총괄이 아니면 못 지난다
  const n = setup();
  assert.deepEqual(await n.duty.dutyRoster({ roles: ["dutylead"] }, { board_id: A }), NOT_ASSIGNED);
  assert.deepEqual(await n.duty.dutyRoster({ member: { id: "zz" }, roles: ["dutylead"] }, { board_id: A }), NOT_ASSIGNED);
});

test("없는 줄 번호는 not-found · 틀린 꼴은 bad-id(글자 숫자·0·소수도) — 아무것도 부르지 않는다", async () => {
  const { duty, log } = setup();
  assert.deepEqual(await duty.dutySlotSet(CHIEF, { slot_id: 999, capacity: 2 }), { ok: false, error: "not-found" });
  assert.deepEqual(await duty.dutySignRemove(CHIEF, { id: 999 }), { ok: false, error: "not-found" });
  assert.deepEqual(await duty.dutyLineRemove(CHIEF, { id: 999 }), { ok: false, error: "not-found" });
  for (const id of ["10", 0, -1, 1.5, null, undefined, {}]) {
    assert.deepEqual(await duty.dutySlotDelete(CHIEF, { slot_id: id }), { ok: false, error: "bad-id" }, String(id));
    assert.deepEqual(await duty.dutySignRemove(CHIEF, { id }), { ok: false, error: "bad-id" }, String(id));
    assert.deepEqual(await duty.dutySignMove(CHIEF, { id: 100, to_slot: id }), { ok: false, error: "bad-id" }, String(id));
  }
  for (const board_id of ["", "식당", "aaaaaaaa", null, 5]) {
    assert.deepEqual(await duty.dutyRoster(CHIEF, { board_id }), { ok: false, error: "bad-id" }, String(board_id));
    assert.deepEqual(await duty.dutyPeopleLookup(CHIEF, { board_id, name: "가" }), { ok: false, error: "bad-id" }, String(board_id));
  }
  assert.equal(log.rpc.length, 0); assert.equal(log.audit.length, 0);
});

// ---------- 당번 목록 ----------
test("dutyBoardList — 총괄은 전부 · 담당은 맡은 당번만(남의 당번·담당자가 응답에 없다) · 수·담당자·살아 있는 틀이 붙는다", async () => {
  const counts = { [A]: { lines: 1, slots: 8, need: 3, asks: 1, active: 5, after: 0 } };
  const c = setup({ rpcs: { duty_board_counts: counts } });
  const all = await c.duty.dutyBoardList(CHIEF);
  assert.deepEqual([all.ok, all.scope, all.chief], [true, "all", true]);
  assert.deepEqual(all.boards.map((x) => x.title), ["식당 봉사", "주차 봉사", "옛 당번"]);       // 받는 중(가나다) → 보관
  assert.deepEqual(all.boards[0].counts, { lines: 1, slots: 8, need: 3, asks: 1, active: 5, after: 0 });
  assert.deepEqual(all.boards[0].staff, [{ id: LEAD_M, name: "가상담당" }]);
  assert.equal(all.appOpen, false);
  assert.deepEqual(all.boards[1].staff, [{ id: OTHER_M, name: "가상다른", stale: true }], "당번 역할이 없는 분은 stale");
  assert.deepEqual(all.boards[0].lines.map((l) => l.service), ["1부"], "뺀 틀(active false)은 카드에 없다");
  assert.match(all.today, /^\d{4}-\d{2}-\d{2}$/);

  const l = setup({ rpcs: { duty_board_counts: counts } });
  const mine = await l.duty.dutyBoardList(LEAD);
  assert.deepEqual([mine.scope, mine.chief], ["assigned", false]);
  assert.deepEqual(mine.boards.map((x) => x.id).sort(), [A, Z].sort());
  assert.deepEqual(mine.boards.find((x) => x.id === A).staff, [{ name: "가상담당" }], "당번 담당에게는 담당자 id 를 싣지 않는다");
  assert.equal(JSON.stringify(mine).includes("주차"), false);
  assert.equal(JSON.stringify(mine).includes("가상다른"), false);
  assert.deepEqual(l.log.rpc[0], ["duty_board_counts", { p_ids: [A, Z] }]);

  const none = setup();
  assert.deepEqual((await none.duty.dutyBoardList({ member: { id: OTHER_M }, roles: ["dutylead"] })).boards.map((x) => x.id), [B]);
  assert.deepEqual((await none.duty.dutyBoardList({ roles: ["dutylead"] })).boards, []);
  const txt = JSON.stringify([all, mine]);
  for (const w of ["auth_user_id", "user_id", "ident_key", "created_at"]) assert.equal(txt.includes(w), false, w);
});

// ---------- 당번 만들기·고치기 ----------
test("dutyBoardSave — 만들기는 총괄만(chief-only) · 고칠 때 이름·준비·보관도 총괄만 · 담당은 받는 중↔지원 멈춤과 그 밖의 칸", async () => {
  const mk = { board: { title: "김장 봉사", status: "draft" } };
  const l = setup();
  assert.deepEqual(await l.duty.dutyBoardSave(LEAD, mk), { ok: false, error: "chief-only" });
  assert.equal(l.log.writes.length, 0);
  const c = setup();
  const made = await c.duty.dutyBoardSave(CHIEF, mk);
  assert.equal(made.ok, true); assert.ok(made.id);
  assert.deepEqual(c.log.audit[0][2], { status: "draft", created: true });
  assert.equal(c.t.duty_boards.at(-1).title, "김장 봉사");

  const edit = (patch) => ({ board: { id: A, title: "식당 봉사", status: "open", place: "식당", ...patch } });
  const a = setup();
  assert.deepEqual(await a.duty.dutyBoardSave(LEAD, edit({ title: "식당" })), { ok: false, error: "chief-only" });
  assert.deepEqual(await a.duty.dutyBoardSave(LEAD, edit({ status: "draft" })), { ok: false, error: "chief-only" });
  assert.deepEqual(await a.duty.dutyBoardSave(LEAD, edit({ status: "archived" })), { ok: false, error: "chief-only" });
  assert.equal(a.log.writes.length, 0); assert.equal(a.log.audit.length, 0);
  assert.deepEqual(await a.duty.dutyBoardSave(LEAD, edit({ status: "closed", place: "1층 식당", contact_note: "교회 사무실", max_ahead: 4 })), { ok: true, id: A, after: 0 });
  const row = a.t.duty_boards.find((x) => x.id === A);
  assert.deepEqual([row.status, row.place, row.contact_note, row.max_ahead], ["closed", "1층 식당", "교회 사무실", 4]);
  assert.deepEqual(a.log.audit[0], ["duty.board.save", A, { status: "closed", was: "open" }]);
  // 틀린 입력은 맡은 당번 확인보다 먼저(아무것도 읽지 않는다)
  const b = setup();
  assert.deepEqual(await b.duty.dutyBoardSave(LEAD, { board: { id: A, title: "" } }), { ok: false, error: "no-title" });
  assert.deepEqual(await b.duty.dutyBoardSave(CHIEF, { board: { id: "zz", title: "식당" } }), { ok: false, error: "bad-id" });
  assert.equal(b.log.q.length, 0);
  assert.deepEqual(await b.duty.dutyBoardSave(CHIEF, { board: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", title: "식당" } }), { ok: false, error: "not-found" });
});

test("dutyBoardSave — 앱에서 안 보이게 되는 저장은 앞날에 선 분이 있으면 force 를 받아야 쓴다(has-upcoming) · 보관한 당번은 상태부터", async () => {
  const body = (status, force) => ({ board: { id: A, title: "식당 봉사", status }, ...(force ? { force: true } : {}) });
  const a = setup({ rpcs: { duty_board_counts: { [A]: { active: 4, after: 0 } } } });
  assert.deepEqual(await a.duty.dutyBoardSave(CHIEF, body("archived")), { ok: false, error: "has-upcoming", active: 4 });
  assert.deepEqual(await a.duty.dutyBoardSave(CHIEF, body("draft")), { ok: false, error: "has-upcoming", active: 4 });
  assert.equal(a.log.writes.length, 0); assert.equal(a.log.audit.length, 0);
  assert.deepEqual(await a.duty.dutyBoardSave(CHIEF, body("archived", true)), { ok: true, id: A, after: 0 });
  assert.equal(a.t.duty_boards.find((x) => x.id === A).status, "archived");
  // 지원 멈춤으로 바꾸는 것은 앱에 그대로 보이므로 묻지 않는다 · 선 분이 없으면 묻지 않는다
  const b = setup({ rpcs: { duty_board_counts: { [A]: { active: 4, after: 0 } } } });
  assert.equal((await b.duty.dutyBoardSave(CHIEF, body("closed"))).ok, true);
  const n = setup({ rpcs: { duty_board_counts: { [A]: { active: 0, after: 0 } } } });
  assert.equal((await n.duty.dutyBoardSave(CHIEF, body("draft"))).ok, true);
  // 보관한 당번 — 보관인 채로는 고치지 않는다(쓰기 거절) · 총괄이 상태를 바꾸는 저장은 된다
  const z = setup();
  const zb = (status) => ({ board: { id: Z, title: "옛 당번", status, place: "새 장소" } });
  assert.deepEqual(await z.duty.dutyBoardSave(CHIEF, zb("archived")), { ok: false, error: "archived" });
  assert.deepEqual(await z.duty.dutyBoardSave(LEAD, zb("archived")), { ok: false, error: "archived" });
  assert.deepEqual(await z.duty.dutyBoardSave(LEAD, zb("open")), { ok: false, error: "chief-only" });
  assert.equal(z.log.writes.length, 0);
  assert.equal((await z.duty.dutyBoardSave(CHIEF, zb("draft"))).ok, true);
  // 끝 날짜를 당기는(새로 두는) 저장 — 그 뒤에 선 분이 있으면 먼저 묻는다(has-after) · force 로 넘기면 쓰고 after 로 다시 알린다
  const u = setup({ rpcs: { duty_board_counts: { [A]: { active: 6, after: 2 } }, duty_after_count: (x) => (x.p_date === "2026-12-31" ? 2 : 0) } });
  const ub = (until_date) => ({ board: { id: A, title: "식당 봉사", status: "open", until_date } });
  assert.deepEqual(await u.duty.dutyBoardSave(LEAD, ub("2026-12-31")), { ok: false, error: "has-after", active: 2 });
  assert.deepEqual(u.log.rpc[0], ["duty_after_count", { p_board: A, p_date: "2026-12-31" }]);
  assert.equal(u.log.writes.length, 0); assert.equal(u.log.audit.length, 0);
  assert.deepEqual(await u.duty.dutyBoardSave(LEAD, { ...ub("2026-12-31"), force: true }), { ok: false, error: "has-after", active: 2 },
    "상태 확인(force)은 끝 날짜 확인을 대신하지 않는다 — 한 번의 「바꾸기」가 두 물음에 함께 답하지 않게");
  assert.deepEqual(await u.duty.dutyBoardSave(LEAD, { ...ub("2026-12-31"), force_after: true }), { ok: true, id: A, after: 2 });
  assert.equal(u.t.duty_boards.find((x) => x.id === A).until_date, "2026-12-31");
  // 그 뒤에 선 분이 없으면 묻지 않는다 · 끝 날짜를 늦추거나 지우는 저장은 세지도 않는다
  assert.equal((await u.duty.dutyBoardSave(LEAD, ub("2026-11-30"))).ok, true);
  const before = u.log.rpc.filter((x) => x[0] === "duty_after_count").length;
  assert.equal((await u.duty.dutyBoardSave(LEAD, ub("2027-01-31"))).ok, true);
  assert.equal((await u.duty.dutyBoardSave(LEAD, ub(""))).ok, true);
  assert.equal(u.log.rpc.filter((x) => x[0] === "duty_after_count").length, before, "늦추거나 지울 때는 세지 않는다");
  // 안 보이게 하면서 끝 날짜도 당기는 저장 — 두 확인을 차례로 받는다(force → force_after)
  const both = setup({ rpcs: { duty_board_counts: { [A]: { active: 8, after: 5 } }, duty_after_count: 5 } });
  const bb = { board: { id: A, title: "식당 봉사", status: "draft", until_date: "2026-10-31" } };
  assert.deepEqual(await both.duty.dutyBoardSave(CHIEF, bb), { ok: false, error: "has-upcoming", active: 8 });
  assert.deepEqual(await both.duty.dutyBoardSave(CHIEF, { ...bb, force: true }), { ok: false, error: "has-after", active: 5 });
  assert.equal(both.log.writes.length, 0);
  assert.equal((await both.duty.dutyBoardSave(CHIEF, { ...bb, force: true, force_after: true })).ok, true);
  // 설정 창을 연 뒤 다른 분이 고쳤으면 changed — 낡은 창이 보관·지원 멈춤·끝 날짜를 되돌리지 않는다(base = 창을 열 때 본 updated_at)
  const st = setup({ tables: { duty_boards: [{ id: A, title: "식당 봉사", description: "", place: "", contact_note: "", open_days: 56, until_date: null, max_ahead: null,
    status: "archived", created_at: "2026-10-01", updated_at: "2026-10-06T10:00:00.123456+00:00" }] } });
  const sb = { board: { id: A, title: "식당 봉사", status: "open", place: "새 식당" } };
  assert.deepEqual(await st.duty.dutyBoardSave(CHIEF, { ...sb, base: "2026-10-05T09:00:00+00:00" }), { ok: false, error: "changed" });
  assert.equal(st.log.writes.length, 0); assert.equal(st.log.audit.length, 0);
  assert.equal((await st.duty.dutyBoardSave(CHIEF, { ...sb, base: "2026-10-06T10:00:00.123+00:00" })).ok, true, "같은 때(밀리초까지)면 지나간다");
  // 읽은 상태를 조건으로 쓴다 — 그사이 다른 분이 상태를 바꿨으면 changed(되돌리지 않는다)
  const w = setup();
  await w.duty.dutyBoardSave(LEAD, { board: { id: A, title: "식당 봉사", status: "closed" } });
  assert.deepEqual(w.log.q.find((x) => x.table === "duty_boards" && x.op === "update").filters, [["eq", "id", A], ["eq", "status", "open"]]);
  // 저장 뒤의 수 세기가 실패해도 저장은 성공으로 답한다(화면이 담당자 지정을 이어 간다)
  const cf = setup({ rpcs: { duty_board_counts: () => { throw new Error("counts down"); } } });
  assert.deepEqual(await cf.duty.dutyBoardSave(LEAD, { board: { id: A, title: "식당 봉사", status: "open", place: "새 식당" } }), { ok: true, id: A, after: 0 });
  assert.equal(cf.log.audit.length, 1);
});

// ---------- 담당자 지정 ----------
test("dutyStaffCandidates · dutyStaffSet — 총괄만 · 새로 더하는 분만 후보 확인 · 이미 맡은 분(stale 포함)은 보낸 목록대로 · 바뀐 것만 쓴다", async () => {
  const l = setup();
  assert.deepEqual(await l.duty.dutyStaffCandidates(LEAD), { ok: false, error: "chief-only" });
  assert.deepEqual(await l.duty.dutyStaffSet(LEAD, { board_id: A, member_ids: [] }), { ok: false, error: "chief-only" });
  assert.equal(l.log.q.length, 0);

  const c = setup();
  const cand = await c.duty.dutyStaffCandidates(CHIEF);
  assert.deepEqual(cand.members, [{ id: LEAD_M, name: "가상담당", who: "기쁨 3목장", roles: ["dutylead"] }, { id: CHIEF_M, name: "가상총괄", who: "화평 1목장", roles: ["duty"] }]);
  // 당번 역할이 없는 분을 새로 더하면 bad-member(아무것도 안 쓴다)
  assert.deepEqual(await c.duty.dutyStaffSet(CHIEF, { board_id: A, member_ids: [LEAD_M, OTHER_M] }), { ok: false, error: "bad-member" });
  assert.equal(c.log.writes.length, 0);
  // 그대로 보내면 쓰지도 기록하지도 않는다
  assert.deepEqual(await c.duty.dutyStaffSet(CHIEF, { board_id: A, member_ids: [LEAD_M] }), { ok: true, count: 1, changed: false });
  assert.equal(c.log.writes.length, 0); assert.equal(c.log.audit.length, 0);
  // 한 분 더하고(총괄도 지정할 수 있다) 기록은 수만
  assert.deepEqual(await c.duty.dutyStaffSet(CHIEF, { board_id: A, member_ids: [LEAD_M, CHIEF_M] }), { ok: true, count: 2, changed: true });
  assert.deepEqual(c.log.writes, [["duty_board_staff", "upsert", [{ board_id: A, member_id: CHIEF_M }]]]);
  assert.deepEqual(c.log.audit[0], ["duty.staff.set", A, { count: 2 }]);
  // 이미 맡은 분(역할을 잃어 stale)은 보낸 목록에 있으면 남는다 · 빼면 빠진다
  const s = setup();
  assert.deepEqual(await s.duty.dutyStaffSet(CHIEF, { board_id: B, member_ids: [OTHER_M] }), { ok: true, count: 1, changed: false });
  assert.deepEqual(await s.duty.dutyStaffSet(CHIEF, { board_id: B, member_ids: [] }), { ok: true, count: 0, changed: true });
  assert.deepEqual(s.log.writes, [["duty_board_staff", "delete", [OTHER_M]]]);
  // 더하기와 빼기가 함께면 더하기 먼저(더하기가 실패하면 아무것도 안 바뀐다 — 맡은 분이 조용히 빠지지 않게)
  const o = setup();
  assert.deepEqual(await o.duty.dutyStaffSet(CHIEF, { board_id: A, member_ids: [CHIEF_M] }), { ok: true, count: 1, changed: true });
  assert.deepEqual(o.log.writes.map((w) => w[1]), ["upsert", "delete"]);
  assert.equal(s.t.duty_board_staff.filter((r) => r.board_id === A).length, 1, "다른 당번의 담당 줄은 건드리지 않는다");
  // 틀린 입력
  assert.deepEqual(await s.duty.dutyStaffSet(CHIEF, { board_id: "zz", member_ids: [] }), { ok: false, error: "bad-id" });
  assert.deepEqual(await s.duty.dutyStaffSet(CHIEF, { board_id: A, member_ids: "x" }), { ok: false, error: "bad-id" });
  assert.deepEqual(await s.duty.dutyStaffSet(CHIEF, { board_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", member_ids: [] }), { ok: false, error: "not-found" });
});

// ---------- 자리 틀 · 날짜 ----------
test("dutyLineSave · dutyLineRemove · dutyDateAdd — 검사 뒤 SQL 함수에 다듬은 값을 넘기고 기록은 id·수만", async () => {
  const a = setup({ rpcs: { duty_line_save: { ok: true, id: 7, kept: 1, updated: 3, made: 8, extra: "x" } } });
  const line = { service: " 2부 ", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0 };
  assert.deepEqual(await a.duty.dutyLineSave(LEAD, { board_id: A, line, apply_future: "yes" }), { ok: true, id: 7, kept: 1, updated: 3, made: 8 });
  assert.deepEqual(a.log.rpc[0], ["duty_line_save", { p_board: A, p_line: { service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, sort: 0 }, p_apply_future: false }]);
  assert.deepEqual(a.log.audit[0], ["duty.line.save", A, { line: 7, created: true, kept: 1, updated: 3, made: 8 }]);
  await a.duty.dutyLineSave(LEAD, { board_id: A, line: { ...line, id: 1 }, apply_future: true });
  assert.equal(a.log.rpc[1][1].p_apply_future, true); assert.equal(a.log.rpc[1][1].p_line.id, 1);
  assert.equal(a.log.audit[1][2].created, false);
  // 틀린 틀은 SQL 을 부르지 않는다 · SQL 의 거절은 error 만 옮긴다
  const b = setup({ rpcs: { duty_line_save: { ok: false, error: "dup-line", secret: 1 } } });
  assert.deepEqual(await b.duty.dutyLineSave(LEAD, { board_id: A, line: { ...line, capacity: 0 } }), { ok: false, error: "bad-capacity" });
  assert.equal(b.log.rpc.length, 0);
  assert.deepEqual(await b.duty.dutyLineSave(LEAD, { board_id: A, line }), { ok: false, error: "dup-line" });
  assert.equal(b.log.audit.length, 0);

  const r = setup({ rpcs: { duty_line_remove: { ok: true, deleted: false, kept: 2 } } });
  assert.deepEqual(await r.duty.dutyLineRemove(LEAD, { id: 1 }), { ok: true, deleted: false, kept: 2 });
  assert.deepEqual(r.log.rpc[0], ["duty_line_remove", { p_line: 1 }]);
  assert.deepEqual(r.log.audit[0], ["duty.line.remove", A, { line: 1, deleted: false, kept: 2 }]);

  const d = setup({ rpcs: { duty_date_add: (x) => (x.p_date === "2026-12-25" ? { ok: true, made: 2, existed: 1, reopened: 0 } : { ok: false, error: "after-until" }) } });
  assert.deepEqual(await d.duty.dutyDateAdd(LEAD, { board_id: A, date: "2026-12-25", line_ids: [1, "3", 1] }), { ok: true, made: 2, existed: 1, reopened: 0 });
  assert.deepEqual(d.log.rpc[0], ["duty_date_add", { p_board: A, p_date: "2026-12-25", p_line_ids: [1, 3] }]);
  assert.deepEqual(d.log.audit[0], ["duty.date.add", A, { date: "2026-12-25", made: 2, existed: 1, reopened: 0 }]);
  const ro = setup({ rpcs: { duty_date_add: { ok: true, made: 0, existed: 0, reopened: 1 } } });
  assert.deepEqual(await ro.duty.dutyDateAdd(LEAD, { board_id: A, date: "2026-12-25", line_ids: [1] }), { ok: true, made: 0, existed: 0, reopened: 1 });
  assert.deepEqual(await d.duty.dutyDateAdd(LEAD, { board_id: A, date: "2027-01-01", line_ids: [1] }), { ok: false, error: "after-until" });
  assert.deepEqual(await d.duty.dutyDateAdd(LEAD, { board_id: A, date: "12/25", line_ids: [1] }), { ok: false, error: "bad-date" });
  assert.deepEqual(await d.duty.dutyDateAdd(LEAD, { board_id: A, date: "2026-12-25", line_ids: [] }), { ok: false, error: "bad-lines" });
  assert.equal(d.log.audit.length, 1);
});

// ---------- 명단 · 엑셀 ----------
const SQL_ROSTER = {
  ok: true, today: "2026-10-12", from: "2026-10-12", to: "2026-12-07",
  board: { id: A, title: "식당 봉사", description: "", place: "식당", contact: "", openDays: 56, untilDate: null, maxAhead: null, status: "open" },
  lines: [{ id: 1, sort: 0, service: "1부", task: "설거지", start: "09:00", end: "10:00", capacity: 2, weekday: 0, active: true }],
  days: [{ date: "2026-10-18", off: false, note: "", confirmed: false, locked: false, cutoff: "c", past: false, afterUntil: false, need: 1, asks: 0,
    slots: [{ id: 10, lineId: 1, service: "1부", task: "설거지", start: "09:00", end: "10:00", capacity: 2, off: false,
      signups: [{ id: 100, name: "가상하나", whoType: "교구", group: "기쁨", sub: "3", pk: "abc123", source: "app", hasApp: true, hasPush: true, note: "담당자 메모", moved: false,
        asked: false, why: null, appliedAt: "t", afterLock: false, user_id: "LEAK-UID", ident_key: "LEAK-KEY" }],
      ended: [] }] }],
};

test("dutyRoster — SQL 함수 한 번 · 칸을 골라 싣는다(pk·계정 번호 없음) · 담당자·chief 를 붙인다 · 날짜 꼴", async () => {
  const a = setup({ rpcs: { duty_roster: SQL_ROSTER } });
  const r = await a.duty.dutyRoster(LEAD, { board_id: A, from: "2026-10-12", to: "2026-11-30" });
  assert.deepEqual(a.log.rpc[0], ["duty_roster", { p_board: A, p_from: "2026-10-12", p_to: "2026-11-30" }]);
  assert.deepEqual([r.ok, r.chief, r.board.title, r.days.length], [true, false, "식당 봉사", 1]);
  assert.deepEqual(r.staff, [{ name: "가상담당" }], "당번 담당에게는 담당자 id 를 싣지 않는다(이름만)");
  assert.equal(r.appOpen, false, "dutyOpen 이 없으면 닫힘");
  assert.equal(r.days[0].slots[0].signups[0].who, "기쁨 3목장");
  const txt = JSON.stringify(r);
  for (const w of ["LEAK", "abc123", "user_id", "ident_key", "\"pk\""]) assert.equal(txt.includes(w), false, w);
  assert.equal(a.log.audit.length, 0, "읽기는 기록하지 않는다");
  const c = setup({ rpcs: { duty_roster: SQL_ROSTER } });
  const cr = await c.duty.dutyRoster(CHIEF, { board_id: A });
  assert.equal(cr.chief, true);
  assert.deepEqual(cr.staff, [{ id: LEAD_M, name: "가상담당" }], "총괄에게는 id 도(담당자 고르기)");
  const op = setup({ rpcs: { duty_roster: SQL_ROSTER }, tables: { app_config: [{ key: "dutyOpen", value: true }, { key: "eduOpen", value: false }] } });
  assert.equal((await op.duty.dutyRoster(LEAD, { board_id: A })).appOpen, true);
  assert.equal((await op.duty.dutyBoardList(LEAD)).appOpen, true);
  const cl = setup({ tables: { app_config: [{ key: "dutyOpen", value: "true" }] } });
  assert.equal((await cl.duty.dutyBoardList(CHIEF)).appOpen, false, "true 하나일 때만 열림(글자 true 는 아니다)");
  assert.deepEqual(c.log.rpc[0][1], { p_board: A, p_from: null, p_to: null });
  assert.deepEqual(await c.duty.dutyRoster(CHIEF, { board_id: A, from: "10/12" }), { ok: false, error: "bad-date" });
  const e = setup({ rpcs: { duty_roster: { ok: false, error: "bad-range" } } });
  assert.deepEqual(await e.duty.dutyRoster(CHIEF, { board_id: A }), { ok: false, error: "bad-range" });
});

test("dutyExport — 두 시트 · 메모·pk 없음 · 기록은 기간과 줄 수", async () => {
  const a = setup({ rpcs: { duty_roster: SQL_ROSTER } });
  const r = await a.duty.dutyExport(LEAD, { board_id: A });
  assert.deepEqual([r.ok, r.title, r.from, r.to], [true, "식당 봉사", "2026-10-12", "2026-12-07"]);
  assert.deepEqual(r.table[1], ["10월 18일(일)", "가상하나, (빈 자리)", ""]);
  assert.deepEqual(r.list[1], ["식당 봉사", "10월 18일(일)", "1부 설거지", "09:00~10:00", "가상하나", "기쁨 3목장", "앱"]);
  assert.deepEqual(a.log.audit[0], ["duty.export", A, { from: "2026-10-12", to: "2026-12-07", count: 1 }]);
  const txt = JSON.stringify(r);
  for (const w of ["담당자 메모", "LEAK", "abc123"]) assert.equal(txt.includes(w), false, w);
  const e = setup({ rpcs: { duty_roster: { ok: false, error: "not-found" } } });
  assert.deepEqual(await e.duty.dutyExport(CHIEF, { board_id: A }), { ok: false, error: "not-found" });
  assert.equal(e.log.audit.length, 0);
});

// ---------- 확정 · 쉬는 날 ----------
test("dutyDaySet — 확정은 누가 했는지(p_by) 넘기고 저장·기록 뒤에 알림 부탁 · 응답에 지원 번호 없음 · already 는 조용히", async () => {
  const a = setup({ rpcs: { duty_day_set: { ok: true, ids: [100, 101], active: 3 } } });
  assert.deepEqual(await a.duty.dutyDaySet(LEAD, { board_id: A, date: "2026-10-18", op: "confirm" }), { ok: true, active: 3, notified: 2, notifyError: null });
  assert.deepEqual(a.log.rpc[0], ["duty_day_set", { p_board: A, p_date: "2026-10-18", p_op: "confirm", p_by: LEAD_M, p_note: null }]);
  assert.deepEqual(a.log.audit[0], ["duty.day.set", A, { date: "2026-10-18", op: "confirm", active: 3 }]);
  assert.deepEqual(a.log.notify, [["confirmed", [100, 101], 1, 1]], "저장(SQL 1번)·기록(1줄) 뒤에 한 번");
  // 이미 잠긴 날 — 쓰지도 기록하지도 알리지도 않는다
  const b = setup({ rpcs: { duty_day_set: { ok: true, already: true } } });
  assert.deepEqual(await b.duty.dutyDaySet(LEAD, { board_id: A, date: "2026-10-18", op: "confirm" }), { ok: true, already: true });
  assert.equal(b.log.audit.length, 0); assert.equal(b.log.notify.length, 0);
  // 풀기·메모는 알리지 않는다
  const c = setup({ rpcs: { duty_day_set: { ok: true } } });
  assert.deepEqual(await c.duty.dutyDaySet(LEAD, { board_id: A, date: "2026-10-18", op: "unconfirm" }), { ok: true });
  assert.deepEqual(await c.duty.dutyDaySet(LEAD, { board_id: A, date: "2026-10-18", op: "note", note: " 추수감사주일 " }), { ok: true });
  assert.equal(c.log.rpc[1][1].p_note, "추수감사주일");
  assert.deepEqual(c.log.audit.map((x) => x[2]), [{ date: "2026-10-18", op: "unconfirm" }, { date: "2026-10-18", op: "note" }], "메모 글은 기록에 싣지 않는다");
  assert.equal(c.log.notify.length, 0);
  // 거절
  const d = setup({ rpcs: { duty_day_set: { ok: false, error: "too-late" } } });
  assert.deepEqual(await d.duty.dutyDaySet(LEAD, { board_id: A, date: "2026-10-18", op: "unconfirm" }), { ok: false, error: "too-late" });
  assert.deepEqual(await d.duty.dutyDaySet(LEAD, { board_id: A, date: "2026-10-18", op: "lock" }), { ok: false, error: "bad-op" });
  assert.deepEqual(await d.duty.dutyDaySet(LEAD, { board_id: A, date: "어제", op: "confirm" }), { ok: false, error: "bad-date" });
  assert.deepEqual(await d.duty.dutyDaySet(LEAD, { board_id: A, date: "2026-10-18", op: "note" }), { ok: false, error: "bad-note" });
  assert.deepEqual(await d.duty.dutyDaySet(LEAD, { board_id: A, date: "2026-10-18", op: "note", note: "가".repeat(61) }), { ok: false, error: "too-long" });
  assert.equal(d.log.rpc.length, 1); assert.equal(d.log.audit.length, 0);
});

test("dutyDaysOff — expect 없이 오면 세기만(기록·알림 없음) · expect 로 다시 보내면 쓰고 알린다 · changed 는 지금 수를 싣는다", async () => {
  const body = { board_id: A, from: "2026-08-02", to: "2026-08-16", off: true, note: "여름 휴가" };
  const a = setup({ rpcs: { duty_days_off: (x) => (x.p_expect === null ? { ok: true, dry: true, active: 4, days: 3 }
    : x.p_expect === 4 ? { ok: true, days: 3, active: 4, ids: [100, 101, 102] } : { ok: false, error: "changed", active: 4 }) } });
  assert.deepEqual(await a.duty.dutyDaysOff(LEAD, body), { ok: true, dry: true, active: 4, days: 3 });
  assert.equal(a.log.audit.length, 0); assert.equal(a.log.notify.length, 0);
  assert.deepEqual(a.log.rpc[0], ["duty_days_off", { p_board: A, p_from: "2026-08-02", p_to: "2026-08-16", p_off: true, p_note: "여름 휴가", p_expect: null }]);
  assert.deepEqual(await a.duty.dutyDaysOff(LEAD, { ...body, expect: 2 }), { ok: false, error: "changed", active: 4 });
  assert.equal(a.log.audit.length, 0);
  assert.deepEqual(await a.duty.dutyDaysOff(LEAD, { ...body, expect: 4 }), { ok: true, days: 3, active: 4, notified: 3, notifyError: null });
  assert.deepEqual(a.log.audit[0], ["duty.days.off", A, { from: "2026-08-02", to: "2026-08-16", off: true, days: 3, active: 4 }]);
  assert.deepEqual(a.log.notify[0].slice(0, 2), ["off", [100, 101, 102]]);
  // 다시 열기는 reopen · 메모를 안 보내면 null(그대로)
  const b = setup({ rpcs: { duty_days_off: { ok: true, days: 1, active: 1, ids: [100] } } });
  await b.duty.dutyDaysOff(LEAD, { board_id: A, from: "2026-08-02", to: "2026-08-02", off: false, expect: 1 });
  assert.equal(b.log.rpc[0][1].p_note, null);
  assert.equal(b.log.notify[0][0], "reopen");
  // 틀린 입력
  const c = setup();
  assert.deepEqual(await c.duty.dutyDaysOff(LEAD, { ...body, off: "yes" }), { ok: false, error: "bad-op" });
  assert.deepEqual(await c.duty.dutyDaysOff(LEAD, { ...body, from: "8/2" }), { ok: false, error: "bad-date" });
  assert.deepEqual(await c.duty.dutyDaysOff(LEAD, { ...body, expect: -1 }), { ok: false, error: "bad-expect" });
  assert.deepEqual(await c.duty.dutyDaysOff(LEAD, { ...body, expect: "4" }), { ok: false, error: "bad-expect" });
  assert.deepEqual(await c.duty.dutyDaysOff(LEAD, { ...body, expect: 100001 }), { ok: false, error: "bad-expect" });
  assert.deepEqual(await c.duty.dutyDaysOff(LEAD, { ...body, from: "0000-01-01" }), { ok: false, error: "bad-date" });
  assert.deepEqual(await c.duty.dutyDaysOff(LEAD, { ...body, note: "가\n나" }), { ok: false, error: "bad-char" });
  assert.equal(c.log.rpc.length, 0);
});

test("dutySlotSet · dutySlotDelete — 바꿀 칸만 넘긴다 · 쉼이 바뀌면 알린다 · 거절의 수(active)를 싣는다", async () => {
  const a = setup({ rpcs: { duty_slot_set: { ok: true, capacity: 3, off: false, active: 2, ids: [] } } });
  assert.deepEqual(await a.duty.dutySlotSet(LEAD, { slot_id: 10, capacity: 3 }), { ok: true, capacity: 3, off: false, active: 2 });
  assert.deepEqual(a.log.rpc[0], ["duty_slot_set", { p_slot: 10, p_capacity: 3, p_off: null, p_expect: null }]);
  assert.deepEqual(a.log.audit[0], ["duty.slot.set", A, { slot: 10, capacity: 3, active: 2 }]);
  assert.equal(a.log.notify.length, 0, "정원만 바꾸면 알리지 않는다");
  const b = setup({ rpcs: { duty_slot_set: { ok: true, capacity: 2, off: true, active: 2, ids: [100, 101] } } });
  assert.deepEqual(await b.duty.dutySlotSet(LEAD, { slot_id: 10, off: true, expect: 2 }), { ok: true, capacity: 2, off: true, active: 2, notified: 2, notifyError: null });
  assert.deepEqual(b.log.rpc[0][1], { p_slot: 10, p_capacity: null, p_off: true, p_expect: 2 });
  assert.deepEqual(b.log.audit[0][2], { slot: 10, off: true, active: 2 });
  assert.equal(b.log.notify[0][0], "off");
  for (const res of [{ ok: false, error: "changed", active: 3 }, { ok: false, error: "below-count", active: 3 }]) {
    const c = setup({ rpcs: { duty_slot_set: res } });
    assert.deepEqual(await c.duty.dutySlotSet(LEAD, { slot_id: 10, capacity: 1, off: true, expect: 2 }), res);
    assert.equal(c.log.audit.length, 0);
  }
  const d = setup();
  assert.deepEqual(await d.duty.dutySlotSet(LEAD, { slot_id: 10 }), { ok: false, error: "nothing" });
  for (const capacity of [0, 201, "3", 2.5]) assert.deepEqual(await d.duty.dutySlotSet(LEAD, { slot_id: 10, capacity }), { ok: false, error: "bad-capacity" }, String(capacity));
  assert.deepEqual(await d.duty.dutySlotSet(LEAD, { slot_id: 10, off: 1 }), { ok: false, error: "bad-op" });
  assert.deepEqual(await d.duty.dutySlotSet(LEAD, { slot_id: 10, off: true, expect: "2" }), { ok: false, error: "bad-expect" });
  assert.deepEqual(await d.duty.dutySlotSet(LEAD, { slot_id: 10, off: true, expect: 2 ** 31 }), { ok: false, error: "bad-expect" });
  assert.equal(d.log.q.length, 0, "틀린 입력은 아무것도 읽지 않는다");

  const e = setup({ rpcs: { duty_slot_delete: (x) => (x.p_slot === 10 ? { ok: true } : { ok: false, error: "has-signups" }) } });
  assert.deepEqual(await e.duty.dutySlotDelete(LEAD, { slot_id: 10 }), { ok: true });
  assert.deepEqual(e.log.audit[0], ["duty.slot.delete", A, { slot: 10 }]);
  assert.deepEqual(await e.duty.dutySlotDelete(CHIEF, { slot_id: 20 }), { ok: false, error: "has-signups" });
  assert.equal(e.log.audit.length, 1);
});

// ---------- 넣기 · 빼기 · 옮기기 · 메모 ----------
test("dutySignAdd — 명부에서 고른 분 / 직접 적은 분 · 담당자 길(p_staff)로 · force 는 true 일 때만 · 기록에 이름 없음", async () => {
  const a = setup({ rpcs: { duty_apply: { ok: true, id: 501, locked: false } } });
  assert.deepEqual(await a.duty.dutySignAdd(LEAD, { slot_id: 10, name: "가상하나", pick: 0, check: {}, force: "yes" }), { ok: true, id: 501, locked: false });
  assert.deepEqual(a.log.rpc[0], ["duty_apply", { p_slot: 10, p_user: null,
    p_ident: { name: "가상하나", who_type: "교구", group_name: "기쁨", sub_name: "3", ident_key: "person|9" }, p_staff: true, p_force: false, p_ack_locked: false }]);
  assert.deepEqual(a.log.audit[0], ["duty.sign.add", A, { slot: 10, signup: 501, app: false, revived: false, force: false, locked: false }]);
  assert.equal(JSON.stringify(a.log.audit).includes("가상하나"), false);
  // 앱 계정이 정확히 하나로 맞은 분 — 그 계정에(p_user)
  const u = setup({ pick: { ok: true, ident: { name: "가상하나", ident_key: "person|9" }, appUserId: USER }, rpcs: { duty_apply: { ok: true, id: 502, locked: false, revived: true } } });
  assert.deepEqual(await u.duty.dutySignAdd(LEAD, { slot_id: 10, name: "가상하나", pick: 0, check: {}, force: true }), { ok: true, id: 502, locked: false, revived: true });
  assert.equal(u.log.rpc[0][1].p_user, USER); assert.equal(u.log.rpc[0][1].p_force, true);
  assert.deepEqual(u.log.audit[0][2], { slot: 10, signup: 502, app: true, revived: true, force: true, locked: false });
  assert.equal(u.log.notify.length, 0, "잠기지 않은 날은 알리지 않는다");
  // 직접 적은 분(새가족) — 명부를 찾지 않는다
  const t = setup({ rpcs: { duty_apply: { ok: true, id: 503, locked: true } } });
  await t.duty.dutySignAdd(LEAD, { slot_id: 10, ident: { name: " 가상새가족 ", group: "새가족부" } });
  assert.equal(t.log.picks, 0);
  assert.deepEqual(t.log.rpc[0][1].p_ident, { name: "가상새가족", who_type: "새가족", group_name: "새가족부", sub_name: "", ident_key: "staff|새가족|새가족부||가상새가족" });
  assert.equal(t.log.notify.length, 0, "앱 계정이 없는 줄은 알릴 곳이 없다");
  // 틀린 신원 · 고르기 단계의 changed 는 그대로(SQL 을 부르지 않는다)
  const e = setup({ pick: { ok: false, error: "changed" } });
  assert.deepEqual(await e.duty.dutySignAdd(LEAD, { slot_id: 10, ident: { name: "a|b" } }), { ok: false, error: "bad-ident" });
  assert.deepEqual(await e.duty.dutySignAdd(LEAD, { slot_id: 10, ident: { name: "가상\u0000하나" } }), { ok: false, error: "bad-ident" });
  assert.equal(e.log.audit.length, 0);
  assert.deepEqual(await e.duty.dutySignAdd(LEAD, { slot_id: 10, name: "가상하나", pick: 3, check: {} }), { ok: false, error: "changed" });
  assert.equal(e.log.rpc.length, 0);
  // 명부에서 고르는 길이 거절로 끝나도 한 줄 남는다(people.lookup · from duty · pick) — 명부와 맞았는지를 기록 없이 떠볼 수 없게
  assert.deepEqual(e.log.audit, [["people.lookup", "", { q: "가상하나", count: 0, from: "duty", pick: true }]]);
  const f = setup({ rpcs: { duty_apply: { ok: false, error: "off" } } });
  assert.deepEqual(await f.duty.dutySignAdd(LEAD, { slot_id: 10, name: " 가상하나 ", pick: 0, check: {} }), { ok: false, error: "off" });
  assert.deepEqual(f.log.audit, [["people.lookup", "", { q: "가상하나", count: 1, from: "duty", pick: true }]]);
  const g = setup({ rpcs: { duty_apply: { ok: false, error: "off" } } });
  await g.duty.dutySignAdd(LEAD, { slot_id: 10, ident: { name: "가상새가족" } });
  assert.equal(g.log.audit.length, 0, "직접 적은 분의 거절은 명부를 찾지 않았으니 남기지 않는다");
  // 보관한 당번의 자리 — 명부를 찾기 전에 거절(명부 떠보기 길이 되지 않게)
  const z = setup();
  assert.deepEqual(await z.duty.dutySignAdd(LEAD, { slot_id: 30, name: "가상하나", pick: 0, check: {} }), { ok: false, error: "archived" });
  assert.equal(z.log.picks, 0); assert.equal(z.log.rpc.length, 0); assert.equal(z.log.audit.length, 0);
});

test("dutySignAdd — 잠긴 날에 앱 계정이 있는 분을 넣으면 그분께 알린다(저장·기록 뒤) · 이미 선 분은 기록·알림 없음", async () => {
  const pick = { ok: true, ident: { name: "가상하나", ident_key: "person|9" }, appUserId: USER };
  const a = setup({ pick, rpcs: { duty_apply: { ok: true, id: 510, locked: true } } });
  assert.deepEqual(await a.duty.dutySignAdd(LEAD, { slot_id: 10, name: "가상하나", pick: 0, check: {} }), { ok: true, id: 510, locked: true, notified: 1, notifyError: null });
  assert.deepEqual(a.log.notify, [["added", [510], 1, 1]]);
  const b = setup({ pick, rpcs: { duty_apply: { ok: true, id: 510, locked: true, already: true } } });
  assert.deepEqual(await b.duty.dutySignAdd(LEAD, { slot_id: 10, name: "가상하나", pick: 0, check: {} }), { ok: true, id: 510, locked: true, already: true });
  assert.equal(b.log.audit.length, 0); assert.equal(b.log.notify.length, 0);
  // 계정 없는 줄로 서 있던 분에게 이번에 앱 계정을 이었다(linked) — 「이미 서 계세요」지만 쓴 것이 있다 → 기록 한 줄 · 잠긴 날이면 알림
  const l = setup({ pick, rpcs: { duty_apply: { ok: true, id: 510, locked: true, already: true, linked: true } } });
  assert.deepEqual(await l.duty.dutySignAdd(LEAD, { slot_id: 10, name: "가상하나", pick: 0, check: {} }), { ok: true, id: 510, locked: true, already: true, notified: 1, notifyError: null });
  assert.deepEqual(l.log.audit, [["duty.sign.add", A, { slot: 10, signup: 510, app: true, revived: false, force: false, locked: true, linked: true }]]);
  assert.deepEqual(l.log.notify.map((x) => [x[0], x[1]]), [["added", [510]]]);
  const l2 = setup({ pick, rpcs: { duty_apply: { ok: true, id: 510, locked: false, already: true, linked: true } } });
  await l2.duty.dutySignAdd(LEAD, { slot_id: 10, name: "가상하나", pick: 0, check: {} });
  assert.equal(l2.log.audit.length, 1); assert.equal(l2.log.notify.length, 0, "잠기지 않은 날은 알리지 않는다");
});

test("dutySignAdd·dutySignMove — 겹침은 같은 당번일 때만 자리 이름을 싣는다(남의 당번 이름이 응답에 없다) · 정원 거절은 수를 싣는다", async () => {
  const other = { ok: false, error: "overlap", with: { board: "비밀 당번", service: "2부", task: "안내", start: "11:00", same_board: false, draft: true } };
  const same = { ok: false, error: "overlap", with: { board: "식당 봉사", service: "2부", task: "배식", start: "11:30", same_board: true, draft: false } };
  for (const [fn, body, rpc] of [["dutySignAdd", { slot_id: 10, ident: { name: "가상하나" } }, "duty_apply"], ["dutySignMove", { id: 100, to_slot: 10 }, "duty_move"]]) {
    const a = setup({ rpcs: { [rpc]: other } });
    const r = await a.duty[fn](LEAD, body);
    assert.deepEqual(r, { ok: false, error: "overlap", with: { same: false, label: "" } }, fn);
    assert.equal(JSON.stringify(r).includes("비밀"), false, fn);
    assert.equal(JSON.stringify(r).includes("안내"), false, fn);
    const b = setup({ rpcs: { [rpc]: same } });
    assert.deepEqual(await b.duty[fn](LEAD, body), { ok: false, error: "overlap", with: { same: true, label: "2부 배식 11:30" } }, fn);
    const c = setup({ rpcs: { [rpc]: { ok: false, error: "full", active: 2, capacity: 2, leak: "x" } } });
    assert.deepEqual(await c.duty[fn](LEAD, body), { ok: false, error: "full", active: 2, capacity: 2 }, fn);
    // 정원과 겹침이 함께 걸리면 full 에 겹친 자리도(같은 규칙으로 걸러서 — 남의 당번이면 이름 없이)
    const d = setup({ rpcs: { [rpc]: { ok: false, error: "full", active: 2, capacity: 2, with: same.with } } });
    assert.deepEqual(await d.duty[fn](LEAD, body), { ok: false, error: "full", active: 2, capacity: 2, with: { same: true, label: "2부 배식 11:30" } }, fn);
    const e = setup({ rpcs: { [rpc]: { ok: false, error: "full", active: 2, capacity: 2, with: other.with } } });
    const re = await e.duty[fn](LEAD, body);
    assert.deepEqual(re, { ok: false, error: "full", active: 2, capacity: 2, with: { same: false, label: "" } }, fn);
    assert.equal(JSON.stringify(re).includes("비밀"), false, fn);
    for (const x of [a, b, c, d, e]) { assert.equal(x.log.audit.length, 0, fn); assert.equal(x.log.notify.length, 0, fn); }
  }
});

test("dutySignRemove — 담당자 길로 빼고(p_staff) 앱 계정이 있는 분께만 알린다 · SQL 거절은 그대로", async () => {
  const a = setup({ rpcs: { duty_cancel: { ok: true, date: "2026-10-18", locked: true, hadUser: true } } });
  assert.deepEqual(await a.duty.dutySignRemove(LEAD, { id: 100 }), { ok: true, date: "2026-10-18", locked: true, notified: 1, notifyError: null });
  assert.deepEqual(a.log.rpc[0], ["duty_cancel", { p_signup: 100, p_user: null, p_staff: true }]);
  assert.deepEqual(a.log.audit[0], ["duty.sign.remove", A, { signup: 100, date: "2026-10-18", locked: true }]);
  assert.deepEqual(a.log.notify[0].slice(0, 2), ["removed", [100]]);
  const b = setup({ rpcs: { duty_cancel: { ok: true, date: "2026-10-18", locked: false, hadUser: false } } });
  assert.deepEqual(await b.duty.dutySignRemove(LEAD, { id: 100 }), { ok: true, date: "2026-10-18", locked: false });
  assert.equal(b.log.notify.length, 0);
  const c = setup({ rpcs: { duty_cancel: { ok: false, error: "not-active" } } });
  assert.deepEqual(await c.duty.dutySignRemove(LEAD, { id: 100 }), { ok: false, error: "not-active" });
  assert.equal(c.log.audit.length, 0);
});

test("dutySignMove — 떠나는 줄의 당번만 확인하고(같은 당번 안은 SQL wrong-board 가 본다) 옮긴 자리를 골라 싣는다", async () => {
  const res = { ok: true, from: { date: "2026-10-18", service: "2부", task: "설거지", start: "11:30", x: 1 }, to: { date: "2026-10-18", service: "1부", task: "설거지", start: "09:00" },
    hadUser: true, locked: false };
  const a = setup({ rpcs: { duty_move: res } });
  assert.deepEqual(await a.duty.dutySignMove(LEAD, { id: 100, to_slot: 11, force: true }), { ok: true,
    from: { date: "2026-10-18", service: "2부", task: "설거지", start: "11:30" }, to: { date: "2026-10-18", service: "1부", task: "설거지", start: "09:00" },
    locked: false, notified: 1, notifyError: null });
  assert.deepEqual(a.log.rpc[0], ["duty_move", { p_signup: 100, p_to_slot: 11, p_force: true }]);
  assert.deepEqual(a.log.audit[0], ["duty.sign.move", A, { signup: 100, from: "2026-10-18", to: "2026-10-18", slot: 11, force: true }]);
  assert.equal(a.log.notify[0][0], "moved");
  // 맡은 당번의 줄을 남의 당번 자리로 — 서버는 SQL 에 넘기고 SQL 이 wrong-board 로 막는다
  const w = setup({ rpcs: { duty_move: { ok: false, error: "wrong-board" } } });
  assert.deepEqual(await w.duty.dutySignMove(LEAD, { id: 100, to_slot: 20 }), { ok: false, error: "wrong-board" });
  assert.equal(w.log.audit.length, 0);
  const s = setup({ rpcs: { duty_move: { ok: true, already: true } } });
  assert.deepEqual(await s.duty.dutySignMove(LEAD, { id: 100, to_slot: 10 }), { ok: true, already: true });
  assert.equal(s.log.audit.length, 0); assert.equal(s.log.notify.length, 0);
});

test("dutySignNote — SQL 함수(duty_note_set)로 쓴다(지원 줄에 직접 쓰지 않는다) · 기록에 글 없음 · 보관한 당번은 SQL 이 거절", async () => {
  const a = setup({ rpcs: { duty_note_set: (x) => (x.p_signup === 300 ? { ok: false, error: "archived" } : { ok: true }) } });
  assert.deepEqual(await a.duty.dutySignNote(LEAD, { id: 100, note: " 전화로 받음\n2부도 가능 " }), { ok: true });
  assert.deepEqual(a.log.rpc[0], ["duty_note_set", { p_signup: 100, p_note: "전화로 받음\n2부도 가능" }]);
  assert.equal(a.log.writes.length, 0, "duty_signups 에 직접 update 하지 않는다 — 잠금 차례가 뒤집힌다");
  assert.deepEqual(a.log.audit[0], ["duty.sign.note", A, { signup: 100, has: true }]);
  assert.deepEqual(await a.duty.dutySignNote(LEAD, { id: 100, note: "" }), { ok: true });
  assert.deepEqual(a.log.audit[1][2], { signup: 100, has: false });
  assert.deepEqual(await a.duty.dutySignNote(LEAD, { id: 100, note: "가".repeat(501) }), { ok: false, error: "too-long" });
  assert.deepEqual(await a.duty.dutySignNote(LEAD, { id: 100 }), { ok: false, error: "bad-note" });
  assert.deepEqual(await a.duty.dutySignNote(LEAD, { id: 300, note: "메모" }), { ok: false, error: "archived" });
  assert.equal(a.log.writes.length, 0); assert.equal(a.log.rpc.length, 3); assert.equal(a.log.audit.length, 2, "거절은 기록하지 않는다");
});

test("dutyAskClear — 표시를 거두면 기록 · 표시가 없던 줄이면 기록 없음", async () => {
  const a = setup({ rpcs: { duty_ask_clear: { ok: true, cleared: true } } });
  assert.deepEqual(await a.duty.dutyAskClear(LEAD, { id: 100 }), { ok: true, cleared: true });
  assert.deepEqual(a.log.rpc[0], ["duty_ask_clear", { p_signup: 100 }]);
  assert.deepEqual(a.log.audit[0], ["duty.sign.askclear", A, { signup: 100 }]);
  const b = setup({ rpcs: { duty_ask_clear: { ok: true, cleared: false } } });
  assert.deepEqual(await b.duty.dutyAskClear(LEAD, { id: 100 }), { ok: true, cleared: false });
  assert.equal(b.log.audit.length, 0);
  const c = setup({ rpcs: { duty_ask_clear: { ok: false, error: "not-active" } } });
  assert.deepEqual(await c.duty.dutyAskClear(LEAD, { id: 100 }), { ok: false, error: "not-active" });
});

test("dutyPeopleLookup — 맡은 당번의 창에서만(총괄도 board_id 필수) · 보관한 당번은 찾지 않는다", async () => {
  const a = setup();
  assert.equal((await a.duty.dutyPeopleLookup(LEAD, { board_id: A, name: "가상하나" })).ok, true);
  assert.equal(a.log.lookups, 1);
  assert.deepEqual(await a.duty.dutyPeopleLookup(LEAD, { board_id: Z, name: "가상하나" }), { ok: false, error: "archived" });
  assert.deepEqual(await a.duty.dutyPeopleLookup(CHIEF, { name: "가상하나" }), { ok: false, error: "bad-id" });
  assert.deepEqual(await a.duty.dutyPeopleLookup(CHIEF, { board_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "가" }), { ok: false, error: "not-found" });
  assert.equal(a.log.lookups, 1, "거절된 요청은 명부를 찾지 않는다");
});

// ---------- 알림 ----------
test("알림 — dep 가 없으면(1단계) 응답 그대로 · 부르지 못하면 notifyError · 던져도 저장은 성공", async () => {
  const rpcs = { duty_day_set: { ok: true, ids: [100], active: 1 } };
  const body = { board_id: A, date: "2026-10-18", op: "confirm" };
  const none = setup({ rpcs, noNotify: true });
  assert.deepEqual(await none.duty.dutyDaySet(LEAD, body), { ok: true, active: 1 });
  const nul = setup({ rpcs, notifyRes: null });
  assert.deepEqual(await nul.duty.dutyDaySet(LEAD, body), { ok: true, active: 1, notified: 0, notifyError: "notify-failed" });
  const thr = setup({ rpcs, notifyThrows: true });
  assert.deepEqual(await thr.duty.dutyDaySet(LEAD, body), { ok: true, active: 1, notified: 0, notifyError: "notify-failed" });
  assert.equal(thr.log.audit.length, 1, "기록은 이미 남았다");
  // 알릴 번호가 없으면 부르지 않는다 · 번호는 양의 정수만 · 겹친 번호는 한 번
  const zero = setup({ rpcs: { duty_day_set: { ok: true, ids: [], active: 0 } } });
  assert.deepEqual(await zero.duty.dutyDaySet(LEAD, body), { ok: true, active: 0 });
  assert.equal(zero.log.notify.length, 0);
  const odd = setup({ rpcs: { duty_day_set: { ok: true, ids: [100, "100", 0, -3, "x", 101.5, 102], active: 2 } } });
  await odd.duty.dutyDaySet(LEAD, body);
  assert.deepEqual(odd.log.notify[0][1], [100, 102]);
});

test("모든 응답 — 계정 번호·신원 키·교인ID 꼴이 없다(성공·거절 모두)", async () => {
  const rpcs = { duty_roster: SQL_ROSTER, duty_apply: { ok: true, id: 1, locked: false, user_id: "LEAK-UID" }, duty_cancel: { ok: true, date: "2026-10-18", locked: false, hadUser: true, user_id: "LEAK-UID" },
    duty_move: { ok: true, from: {}, to: {}, hadUser: false, locked: false, ident_key: "LEAK-KEY" }, duty_day_set: { ok: true, ids: [1], active: 1, confirmed_by: "LEAK-BY" },
    duty_days_off: { ok: true, days: 1, active: 1, ids: [1] }, duty_slot_set: { ok: true, capacity: 1, off: false, active: 0, ids: [] } };
  const out = [];
  for (const ctx of [LEAD, CHIEF]) {
    const { duty } = setup({ rpcs });
    out.push(await duty.dutyBoardList(ctx), await duty.dutyRoster(ctx, { board_id: A }), await duty.dutyExport(ctx, { board_id: A }),
      await duty.dutySignAdd(ctx, { slot_id: 10, name: "가상하나", pick: 0, check: {} }), await duty.dutySignRemove(ctx, { id: 100 }),
      await duty.dutySignMove(ctx, { id: 100, to_slot: 10 }), await duty.dutyDaySet(ctx, { board_id: A, date: "2026-10-18", op: "confirm" }),
      await duty.dutyDaysOff(ctx, { board_id: A, from: "2026-10-18", to: "2026-10-18", off: true, expect: 1 }), await duty.dutySlotSet(ctx, { slot_id: 10, capacity: 1 }));
  }
  const txt = JSON.stringify(out);
  for (const w of ["LEAK", "user_id", "ident_key", "confirmed_by", "person|", "auth_user_id", "\"pk\""]) assert.equal(txt.includes(w), false, w);
  assert.ok(out.every((r) => r && r.ok === true), "준비한 요청은 모두 성공해야 한다");
});

// ---------- 검토 반영(2026-10-06) ----------
test("dutySignRestore — 빠진 줄을 그 줄 그대로 · 정원·겹침은 넣기와 같이 force · 맡지 않은 당번은 not-assigned · 이미 살아 있으면 조용히", async () => {
  const a = setup({ rpcs: { duty_restore: { ok: true, id: 100, date: "2026-10-18", locked: true, hadUser: true, user_id: "LEAK-UID" } } });
  assert.deepEqual(await a.duty.dutySignRestore(LEAD, { id: 100 }), { ok: true, date: "2026-10-18", locked: true, notified: 1, notifyError: null });
  assert.deepEqual(a.log.rpc[0], ["duty_restore", { p_signup: 100, p_force: false }]);
  assert.deepEqual(a.log.audit[0], ["duty.sign.restore", A, { signup: 100, date: "2026-10-18", force: false, locked: true }]);
  assert.deepEqual(a.log.notify[0].slice(0, 2), ["added", [100]], "앱 계정이 있는 분께 「다시 넣어 드렸어요」(3단계)");
  const k = setup({ rpcs: { duty_restore: { ok: true, id: 100, date: "2026-10-18", locked: false, hadUser: false } } });
  assert.deepEqual(await k.duty.dutySignRestore(LEAD, { id: 100, force: true }), { ok: true, date: "2026-10-18", locked: false });
  assert.equal(k.log.rpc[0][1].p_force, true); assert.equal(k.log.notify.length, 0);
  const f = setup({ rpcs: { duty_restore: { ok: false, error: "full", active: 2, capacity: 2, with: { board: "비밀 당번", service: "x", task: "", start: "09:00", same_board: false, draft: false } } } });
  assert.deepEqual(await f.duty.dutySignRestore(LEAD, { id: 100 }), { ok: false, error: "full", active: 2, capacity: 2, with: { same: false, label: "" } });
  assert.equal(f.log.audit.length, 0);
  const s = setup({ rpcs: { duty_restore: { ok: true, already: true } } });
  assert.deepEqual(await s.duty.dutySignRestore(LEAD, { id: 100 }), { ok: true, already: true });
  assert.equal(s.log.audit.length, 0); assert.equal(s.log.notify.length, 0);
  const n = setup();
  assert.deepEqual(await n.duty.dutySignRestore(LEAD, { id: 200 }), NOT_ASSIGNED);
  assert.deepEqual(await n.duty.dutySignRestore(LEAD, { board_id: A, id: 200 }), NOT_ASSIGNED);
  assert.deepEqual(await n.duty.dutySignRestore(LEAD, { id: "100" }), { ok: false, error: "bad-id" });
  assert.deepEqual(await n.duty.dutySignRestore(CHIEF, { id: 999 }), { ok: false, error: "not-found" });
  assert.equal(n.log.rpc.length, 0);
  for (const err of ["off", "archived", "already-there", "overlap"]) {
    const e = setup({ rpcs: { duty_restore: { ok: false, error: err, ...(err === "overlap" ? { with: { same_board: true, service: "2부", task: "배식", start: "11:30" } } : {}) } } });
    const r = await e.duty.dutySignRestore(LEAD, { id: 100 });
    assert.equal(r.error, err); assert.equal(e.log.audit.length, 0, err);
    if (err === "overlap") assert.deepEqual(r.with, { same: true, label: "2부 배식 11:30" });
  }
});
