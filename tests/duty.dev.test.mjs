// 봉사 당번(1단계 · 2026-10-06) — 개발 서버에 대고 도는 시험. 네트워크와 개발 비밀 키가 필요해 preflight 에는 넣지 않는다(이름의 .dev.).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/duty.dev.test.mjs
// 하는 일: 당번 총괄 한 분·당번 담당 L 한 분(이메일 로그인 ca-test-duty-…@example.test)과 시험 당번 A·B 를 만들고, L 을 A 의 담당으로 지정한 뒤
//   맡은 당번만(board_id·자리 번호·지원 번호·틀 번호로) · 자리 틀 → 자리가 저절로 · 넣기(정원 넘기기) · 옮기기 · 빼기 · 메모 · 확정·풀기 ·
//   쉬는 날(세기 → 쓰기 → 다시 열기) · 정원 · 날짜 더하기·자리 지우기 · 끝 날짜 · 엑셀 · 기록(이름 없음) · 공개 키로는 안 열림을 본다.
//   (2026-10-06 검토 반영) 다시 넣기 · 겹침(다른 당번·같은 당번) · 자리 없는 날 확정 · 먼 날짜(notYet) · 끝 날짜 당기기(has-after) · appOpen.
//   끝나면(실패해도) 지원 → 자리 → 날짜 → 틀 → 담당 줄 → 당번 → 그 두 분의 기록·역할·담당자 → auth 사용자를 지우고 0 줄인지 본다.
// ⚠️ 키·비밀번호를 찍지 않는다. 개발(ktpwthwqzgcqcrmsafdo)에만 돈다. v2 supabase/duty.sql 과 SQL 015 가 개발에 들어가 있어야 한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const TAG = "ca-test-duty-";
const ZERO = "00000000-0000-0000-0000-000000000000";

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200) }; } }
async function rest(path, method = "GET", data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method, headers: { ...svc, Prefer: "return=representation" },
    body: data ? JSON.stringify(data) : undefined });
  const x = await body(r);
  assert.ok(r.ok, path + " " + r.status + " " + JSON.stringify(x).slice(0, 200));
  return x;
}
async function makeUser(label) {
  const email = `${TAG}${label}-${STAMP}@example.test`, password = "T" + STAMP + "!x";
  const u = await body(await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }) }));
  assert.ok(u.id, "사용자 만들기 실패");
  made.users.push(u.id);
  const s = await body(await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  assert.ok(s.access_token, "로그인 실패");
  return { uid: u.id, token: s.access_token };
}
async function makeMember(p, name, roles) {
  const [m] = await rest("admin_members", "POST", { auth_user_id: p.uid, name, gu: "사랑", mok: "1", status: "active" });
  made.members.push(m.id);
  for (const role_id of roles) await rest("admin_role_grants", "POST", { member_id: m.id, role_id });
  p.memberId = m.id;
}
async function call(token, action, extra = {}) {
  const r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + token },
    body: JSON.stringify({ ...extra, action }) });
  return { status: r.status, body: await body(r) };
}
const kst = (d = 0) => new Date(Date.now() + 9 * 3600000 + d * 86400000).toISOString().slice(0, 10);
const dow = (ds) => new Date(ds + "T00:00:00Z").getUTCDay();

const made = { users: [], members: [], boards: [] };
const chief = {}, L = {};
const W = {};   // A·B(당번 id) · line(A 의 틀 id) · lineB · d2·d9(날짜) · s2·s9(A 의 자리) · sB(B 의 자리) · e(지원 번호들)
const seen = [];   // 받은 응답들 — 끝에서 새는 칸이 없는지 본다
const got = (r) => { seen.push(r.body); return r; };

async function sweepBoards(ids) {
  if (!ids.length) return;
  const bs = ids.join(",");
  const slots = (await rest(`duty_slots?select=id&board_id=in.(${bs})`)).map((s) => s.id);
  if (slots.length) await rest(`duty_signups?slot_id=in.(${slots.join(",")})`, "DELETE");
  await rest(`duty_slots?board_id=in.(${bs})`, "DELETE");
  await rest(`duty_days?board_id=in.(${bs})`, "DELETE");
  await rest(`duty_lines?board_id=in.(${bs})`, "DELETE");
  await rest(`duty_board_staff?board_id=in.(${bs})`, "DELETE");
  await rest(`duty_boards?id=in.(${bs})`, "DELETE");
}

before(async () => {
  // 지난번이 도중에 멈춰 남긴 시험 당번(한 시간 넘은 것만 — 다른 세션이 돌리는 중인 것은 건드리지 않는다)
  const stale = new Date(Date.now() - 3600 * 1000).toISOString();
  await sweepBoards((await rest(`duty_boards?select=id&title=like.${TAG}*&created_at=lt.${stale}`)).map((b) => b.id));
  Object.assign(chief, await makeUser("chief"));
  await makeMember(chief, "시험-당번총괄", ["duty"]);
  Object.assign(L, await makeUser("lead"));
  await makeMember(L, "시험-당번담당", ["dutylead"]);
  W.d2 = kst(2); W.d9 = kst(9);
});

after(async () => {
  const errs = [];
  const step = async (name, fn) => { try { await fn(); } catch (e) { errs.push(name + ": " + String(e?.message).slice(0, 160)); } };
  await step("시험 당번", () => sweepBoards(made.boards));
  if (made.members.length) {
    const ms = made.members.join(",");
    await step("기록(시험 두 분 것)", () => rest(`admin_audit?member_id=in.(${ms})`, "DELETE"));
    await step("역할", () => rest(`admin_role_grants?member_id=in.(${ms})`, "DELETE"));
    await step("담당자", () => rest(`admin_members?id=in.(${ms})`, "DELETE"));
  }
  for (const uid of made.users) await step("auth 사용자", async () => {
    const x = await fetch(URL_ + "/auth/v1/admin/users/" + uid, { method: "DELETE", headers: svc });
    assert.ok(x.ok, "auth delete " + x.status);
  });
  await step("0 줄 확인", async () => {
    if (made.boards.length) {
      const bs = made.boards.join(",");
      for (const [t, col] of [["duty_boards", "id"], ["duty_lines", "board_id"], ["duty_days", "board_id"], ["duty_slots", "board_id"], ["duty_board_staff", "board_id"]]) {
        assert.equal((await rest(`${t}?select=${col}&${col}=in.(${bs})`)).length, 0, t);
      }
    }
    assert.equal((await rest(`duty_signups?select=id&name=like.${TAG}${STAMP}*`)).length, 0, "지원 줄");
    if (made.members.length) {
      const ms = made.members.join(",");
      for (const t of ["admin_members?select=id&id", "admin_role_grants?select=member_id&member_id", "admin_audit?select=id&member_id"]) {
        assert.equal((await rest(`${t}=in.(${ms})`)).length, 0, t);
      }
    }
    for (const uid of made.users) assert.equal((await fetch(URL_ + "/auth/v1/admin/users/" + uid, { headers: svc })).status, 404, "auth 사용자");
  });
  if (errs.length) throw new Error("정리 실패 " + errs.length + "건: " + errs.join(" / "));
});

test("당번 만들기 — 총괄만 · 담당은 chief-only · 담당자 지정 뒤에야 담당의 목록에 보인다", async () => {
  let r = got(await call(L.token, "dutyBoardSave", { board: { title: `${TAG}X-${STAMP}` } }));
  assert.deepEqual(r.body, { ok: false, error: "chief-only" });
  for (const k of ["A", "B"]) {
    r = got(await call(chief.token, "dutyBoardSave", { board: { title: `${TAG}${k}-${STAMP}`, place: "시험 식당", contact_note: "시험 문의", status: "draft" } }));
    assert.equal(r.body.ok, true, JSON.stringify(r.body));
    W[k] = r.body.id; made.boards.push(r.body.id);
  }
  r = got(await call(L.token, "dutyBoardList"));
  assert.deepEqual([r.body.ok, r.body.scope, r.body.chief, r.body.boards.length], [true, "assigned", false, 0]);
  // 담당자 지정 — 담당은 못 부른다(문에서 forbidden) · 후보에 L · 지정 뒤 L 의 목록에 A 만
  assert.equal((await call(L.token, "dutyStaffSet", { board_id: W.A, member_ids: [L.memberId] })).body.error, "forbidden");
  r = got(await call(chief.token, "dutyStaffCandidates"));
  assert.ok(r.body.members.some((m) => m.id === L.memberId && m.roles.includes("dutylead")), JSON.stringify(r.body).slice(0, 200));
  r = got(await call(chief.token, "dutyStaffSet", { board_id: W.A, member_ids: [L.memberId] }));
  assert.deepEqual(r.body, { ok: true, count: 1, changed: true });
  r = got(await call(L.token, "dutyBoardList"));
  assert.deepEqual(r.body.boards.map((b) => b.id), [W.A]);
  assert.deepEqual(r.body.boards[0].staff, [{ name: "시험-당번담당" }], "담당에게는 담당자 번호를 싣지 않는다(이름만)");
  r = got(await call(chief.token, "dutyBoardList"));
  assert.ok(r.body.boards.some((b) => b.id === W.B) && r.body.scope === "all" && r.body.chief === true);
  assert.deepEqual(r.body.boards.find((b) => b.id === W.A).staff, [{ id: L.memberId, name: "시험-당번담당" }], "총괄은 담당자를 고를 때 번호가 필요하다");
  assert.equal(typeof r.body.appOpen, "boolean", "성도님 앱에 열렸는가를 함께 준다");
});

test("자리 틀 — 담당이 맡은 당번에 넣으면 자리가 저절로 생긴다 · 맡지 않은 당번은 not-assigned · 같은 이름 틀은 dup-line", async () => {
  const line = { service: "2부", task: "설거지", start: "11:00", end: "12:00", capacity: 2, weekday: dow(W.d2) };
  let r = got(await call(L.token, "dutyLineSave", { board_id: W.A, line }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.ok(r.body.made >= 8, "8주 치 자리: " + r.body.made);
  W.line = r.body.id;
  assert.deepEqual(got(await call(L.token, "dutyLineSave", { board_id: W.A, line })).body, { ok: false, error: "dup-line" });
  assert.deepEqual(got(await call(L.token, "dutyLineSave", { board_id: W.B, line })).body, { ok: false, error: "not-assigned" });
  r = got(await call(L.token, "dutyLineSave", { board_id: W.A, line: { service: "1부", task: "설거지", start: "09:00", end: "10:00", capacity: 1, weekday: dow(W.d2) } }));
  W.line1 = r.body.id;
  r = got(await call(chief.token, "dutyLineSave", { board_id: W.B, line: { ...line, service: "주차" } }));
  W.lineB = r.body.id;
  // 명단 — 맡은 당번은 보이고(자리 두 개씩) 맡지 않은 당번은 not-assigned
  r = got(await call(L.token, "dutyRoster", { board_id: W.A }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body).slice(0, 200));
  assert.deepEqual([r.body.chief, r.body.board.status, r.body.lines.length], [false, "draft", 2]);
  const d2 = r.body.days.find((d) => d.date === W.d2), d9 = r.body.days.find((d) => d.date === W.d9);
  assert.ok(d2 && d9, "모레·9일 뒤 자리");
  assert.deepEqual(d2.slots.map((s) => s.service), ["1부", "2부"], "시작 시각 차례");
  W.s1 = d2.slots[0].id; W.s2 = d2.slots[1].id; W.s9 = d9.slots[1].id;
  assert.deepEqual(got(await call(L.token, "dutyRoster", { board_id: W.B })).body, { ok: false, error: "not-assigned" });
  r = got(await call(chief.token, "dutyRoster", { board_id: W.B }));
  W.sB = r.body.days.find((d) => d.date === W.d2).slots[0].id;
  assert.equal(r.body.chief, true);
});

test("당번 설정 — 담당은 받는 중으로 못 연다(chief-only) · 총괄이 연 뒤 담당은 받는 중↔지원 멈춤과 다른 칸을 고친다", async () => {
  const base = { id: W.A, title: `${TAG}A-${STAMP}`, place: "시험 식당", contact_note: "시험 문의" };
  assert.deepEqual(got(await call(L.token, "dutyBoardSave", { board: { ...base, status: "open" } })).body, { ok: false, error: "chief-only" });
  assert.deepEqual(got(await call(L.token, "dutyBoardSave", { board: { ...base, title: "다른 이름", status: "draft" } })).body, { ok: false, error: "chief-only" });
  assert.deepEqual(got(await call(chief.token, "dutyBoardSave", { board: { ...base, status: "open" } })).body, { ok: true, id: W.A, after: 0 });
  assert.deepEqual(got(await call(L.token, "dutyBoardSave", { board: { ...base, status: "closed", max_ahead: 3, open_days: 28 } })).body, { ok: true, id: W.A, after: 0 });
  assert.deepEqual(got(await call(L.token, "dutyBoardSave", { board: { ...base, status: "open", open_days: 56 } })).body, { ok: true, id: W.A, after: 0 });
  assert.deepEqual(got(await call(L.token, "dutyBoardSave", { board: { ...base, id: W.B, status: "open" } })).body, { ok: false, error: "not-assigned" });
});

test("넣기 — 직접 입력 · 두 번은 already · 정원이 차면 full → force · 남의 당번 자리 번호는 not-assigned", async () => {
  const ident = (k) => ({ name: `${TAG}${STAMP}-${k}`, who_type: "새가족", group_name: "시험", sub_name: "1" });
  let r = got(await call(L.token, "dutySignAdd", { slot_id: W.s2, ident: ident("가") }));
  assert.deepEqual([r.body.ok, r.body.locked], [true, false], JSON.stringify(r.body));
  W.e1 = r.body.id;
  r = got(await call(L.token, "dutySignAdd", { slot_id: W.s2, ident: ident("가") }));
  assert.deepEqual(r.body, { ok: true, id: W.e1, locked: false, already: true });
  W.e2 = got(await call(L.token, "dutySignAdd", { slot_id: W.s2, ident: ident("나") })).body.id;
  r = got(await call(L.token, "dutySignAdd", { slot_id: W.s2, ident: ident("다") }));
  assert.deepEqual(r.body, { ok: false, error: "full", active: 2, capacity: 2 });
  r = got(await call(L.token, "dutySignAdd", { slot_id: W.s2, ident: ident("다"), force: true }));
  assert.equal(r.body.ok, true); W.e3 = r.body.id;
  // 같은 분을 같은 날 겹치지 않는 자리(1부 09~10)에는 넣는다 · 그 자리가 차 있으면 full
  r = got(await call(L.token, "dutySignAdd", { slot_id: W.s1, ident: ident("가") }));
  assert.equal(r.body.ok, true); W.e4 = r.body.id;
  assert.equal(got(await call(L.token, "dutySignAdd", { slot_id: W.s1, ident: ident("나") })).body.error, "full");
  // 맡지 않은 당번의 자리 — board_id 를 속여도 서버가 자리의 당번을 읽는다
  assert.deepEqual(got(await call(L.token, "dutySignAdd", { board_id: W.A, slot_id: W.sB, ident: ident("라") })).body, { ok: false, error: "not-assigned" });
  assert.deepEqual(got(await call(L.token, "dutySlotSet", { board_id: W.A, slot_id: W.sB, capacity: 9 })).body, { ok: false, error: "not-assigned" });
  assert.equal((await rest(`duty_signups?select=id&slot_id=eq.${W.sB}`)).length, 0, "남의 당번에 줄이 생겼다");
  // 틀린 신원
  assert.deepEqual(got(await call(L.token, "dutySignAdd", { slot_id: W.s2, ident: { name: "a|b" } })).body, { ok: false, error: "bad-ident" });
});

test("명단 — 넣은 곳·앱 없음 · 같은 이름·다른 표식이 아니면 표시 없음 · 메모 · 옮기기(정원 넘기기) · 빼기", async () => {
  let r = got(await call(L.token, "dutyRoster", { board_id: W.A, from: W.d2, to: W.d9 }));
  const d2 = r.body.days.find((d) => d.date === W.d2);
  const two = d2.slots.find((s) => s.id === W.s2);
  assert.deepEqual([two.capacity, two.signups.length, d2.need], [2, 3, 0], "1부 1/1 · 2부 3/2 → 빈 자리 0");
  const a = two.signups.find((e) => e.id === W.e1);
  assert.deepEqual([a.source, a.hasApp, a.hasPush, a.who, a.maybeDup], ["staff", false, false, "시험 1목장", false]);   // 소속 한 줄은 교육과 같은 규칙(whoOf — 숫자 세부에 「목장」)
  // 메모
  assert.deepEqual(got(await call(L.token, "dutySignNote", { id: W.e1, note: "전화로 받음" })).body, { ok: true });
  // 옮기기 — 다 찬 9일 뒤 자리가 아니라 빈 자리로: 9일 뒤 2부(0/2)
  r = got(await call(L.token, "dutySignMove", { id: W.e3, to_slot: W.s9 }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.deepEqual([r.body.from.date, r.body.to.date, r.body.to.service], [W.d2, W.d9, "2부"]);
  // 남의 당번 자리로는 wrong-board · 남의 당번의 줄은 not-assigned
  assert.equal(got(await call(L.token, "dutySignMove", { id: W.e2, to_slot: W.sB })).body.error, "wrong-board");
  // 빼기
  r = got(await call(L.token, "dutySignRemove", { id: W.e2 }));
  assert.deepEqual(r.body, { ok: true, date: W.d2, locked: false });
  assert.equal(got(await call(L.token, "dutySignRemove", { id: W.e2 })).body.error, "not-active");
  r = got(await call(L.token, "dutyRoster", { board_id: W.A, from: W.d2, to: W.d9 }));
  const s2 = r.body.days.find((d) => d.date === W.d2).slots.find((s) => s.id === W.s2);
  assert.deepEqual([s2.signups.map((e) => e.id), s2.ended.map((e) => e.id), s2.ended[0].reason], [[W.e1], [W.e2], "staff"]);
  assert.equal(s2.signups[0].note, "전화로 받음");
  const moved = r.body.days.find((d) => d.date === W.d9).slots.find((s) => s.id === W.s9).signups[0];
  assert.deepEqual([moved.id, moved.moved], [W.e3, true]);
});

test("다시 넣기 — 뺀 줄을 그대로 되살린다 · 두 번은 already · 정원이 차 있으면 full → force", async () => {
  let r = got(await call(L.token, "dutySignRestore", { id: W.e2 }));
  assert.deepEqual(r.body, { ok: true, date: W.d2, locked: false }, JSON.stringify(r.body));
  assert.deepEqual(got(await call(L.token, "dutySignRestore", { id: W.e2 })).body, { ok: true, already: true });
  r = got(await call(L.token, "dutyRoster", { board_id: W.A, from: W.d2, to: W.d2 }));
  const s2 = r.body.days[0].slots.find((s) => s.id === W.s2);
  assert.deepEqual([s2.signups.map((e) => e.id).sort((a, z) => a - z), s2.ended.length], [[W.e1, W.e2].sort((a, z) => a - z), 0]);
  assert.equal(got(await call(L.token, "dutySignRemove", { id: W.e2 })).body.ok, true);
  // 정원이 찬 자리로는 full(수) → force 로 넘긴다(넣기·옮기기와 같은 규칙)
  assert.equal(got(await call(L.token, "dutySignRemove", { id: W.e4 })).body.ok, true);
  const tmp = got(await call(L.token, "dutySignAdd", { slot_id: W.s1, ident: { name: `${TAG}${STAMP}-아` } })).body.id;
  assert.ok(tmp, "1부에 다른 분");
  assert.deepEqual(got(await call(L.token, "dutySignRestore", { id: W.e4 })).body, { ok: false, error: "full", active: 1, capacity: 1 });
  assert.deepEqual(got(await call(L.token, "dutySignRestore", { id: W.e4, force: true })).body, { ok: true, date: W.d2, locked: false });
  assert.equal(got(await call(L.token, "dutySignRemove", { id: tmp })).body.ok, true);
  assert.equal(got(await call(L.token, "dutySignRestore", { id: 0 })).body.error, "bad-id");
});

test("확정·풀기 · 메모 · 쉬는 날(세기 → 쓰기 → 다시 열기) · 정원 · 이 자리만 쉬기", async () => {
  let r = got(await call(L.token, "dutyDaySet", { board_id: W.A, date: W.d2, op: "confirm" }));
  assert.deepEqual(r.body, { ok: true, active: 2 }, JSON.stringify(r.body));       // 알림은 3단계 — 지금은 부탁하지 않는다
  assert.deepEqual(got(await call(L.token, "dutyDaySet", { board_id: W.A, date: W.d2, op: "confirm" })).body, { ok: true, already: true });
  r = got(await call(L.token, "dutyRoster", { board_id: W.A, from: W.d2, to: W.d2 }));
  assert.deepEqual([r.body.days[0].confirmed, r.body.days[0].locked], [true, true]);
  assert.deepEqual(got(await call(L.token, "dutyDaySet", { board_id: W.A, date: W.d2, op: "unconfirm" })).body, { ok: true });
  assert.deepEqual(got(await call(L.token, "dutyDaySet", { board_id: W.A, date: W.d2, op: "note", note: "시험 메모" })).body, { ok: true });
  assert.equal(got(await call(L.token, "dutyDaySet", { board_id: W.B, date: W.d2, op: "confirm" })).body.error, "not-assigned");
  // 자리가 없는 날은 확정할 것이 없다(no-slots) · 풀 것·지울 메모가 없으면 already(날짜 줄을 만들지 않는다)
  assert.deepEqual(got(await call(L.token, "dutyDaySet", { board_id: W.A, date: kst(3), op: "confirm" })).body, { ok: false, error: "no-slots" });
  assert.deepEqual(got(await call(L.token, "dutyDaySet", { board_id: W.A, date: kst(3), op: "unconfirm" })).body, { ok: true, already: true });
  assert.deepEqual(got(await call(L.token, "dutyDaySet", { board_id: W.A, date: kst(3), op: "note", note: "" })).body, { ok: true, already: true });
  assert.equal((await rest(`duty_days?select=on_date&board_id=eq.${W.A}&on_date=eq.${kst(3)}`)).length, 0, "빈 날에 날짜 줄이 생겼다");
  // 쉬는 날 — 먼저 세고(아무것도 안 바꿈) → 수가 다르면 changed → 맞으면 쓴다 → 지원 줄은 그대로
  r = got(await call(L.token, "dutyDaysOff", { board_id: W.A, from: W.d9, to: W.d9, off: true, note: "시험 쉼" }));
  assert.deepEqual(r.body, { ok: true, dry: true, active: 1, days: 1 });
  assert.deepEqual(got(await call(L.token, "dutyDaysOff", { board_id: W.A, from: W.d9, to: W.d9, off: true, expect: 0 })).body, { ok: false, error: "changed", active: 1 });
  assert.deepEqual(got(await call(L.token, "dutyDaysOff", { board_id: W.A, from: W.d9, to: W.d9, off: true, note: "시험 쉼", expect: 1 })).body, { ok: true, days: 1, active: 1 });
  assert.equal(got(await call(L.token, "dutySignAdd", { slot_id: W.s9, ident: { name: `${TAG}${STAMP}-마` } })).body.error, "off");
  r = got(await call(L.token, "dutyRoster", { board_id: W.A, from: W.d9, to: W.d9 }));
  assert.deepEqual([r.body.days[0].off, r.body.days[0].note, r.body.days[0].slots.find((s) => s.id === W.s9).signups.length], [true, "시험 쉼", 1]);
  assert.deepEqual(got(await call(L.token, "dutyDaysOff", { board_id: W.A, from: W.d9, to: W.d9, off: false, note: "", expect: 1 })).body, { ok: true, days: 1, active: 1 });
  r = got(await call(L.token, "dutyRoster", { board_id: W.A, from: W.d9, to: W.d9 }));
  assert.deepEqual([r.body.days[0].off, r.body.days[0].note], [false, ""]);
  // 정원 — 찬 수 아래로는 못 줄인다 · 이 자리만 쉬기는 선 분 수(expect)가 맞아야
  assert.equal(got(await call(L.token, "dutySlotSet", { slot_id: W.s2, capacity: 5 })).body.capacity, 5);
  await call(L.token, "dutySignAdd", { slot_id: W.s2, ident: { name: `${TAG}${STAMP}-바` } });
  assert.deepEqual(got(await call(L.token, "dutySlotSet", { slot_id: W.s2, capacity: 1 })).body, { ok: false, error: "below-count", active: 2 });
  assert.deepEqual(got(await call(L.token, "dutySlotSet", { slot_id: W.s2, off: true })).body, { ok: false, error: "changed", active: 2 });
  assert.equal(got(await call(L.token, "dutySlotSet", { slot_id: W.s2, off: true, expect: 2 })).body.off, true);
  assert.equal(got(await call(L.token, "dutySlotSet", { slot_id: W.s2, off: false })).body.off, false);
  assert.deepEqual(got(await call(L.token, "dutySlotSet", { slot_id: W.s2 })).body, { ok: false, error: "nothing" });
});

test("날짜 더하기 · 자리 지우기 · 끝 날짜(그 뒤는 after-until · 선 분 수 after) · 「못 가게 됐어요」 표시 거두기", async () => {
  const extra = kst(4);
  let r = got(await call(L.token, "dutyDateAdd", { board_id: W.A, date: extra, line_ids: [W.line, W.line] }));
  assert.deepEqual(r.body, { ok: true, made: 1, existed: 0 });
  assert.deepEqual(got(await call(L.token, "dutyDateAdd", { board_id: W.A, date: extra, line_ids: [W.line] })).body, { ok: true, made: 0, existed: 1 });
  assert.equal(got(await call(L.token, "dutyDateAdd", { board_id: W.A, date: extra, line_ids: [W.lineB] })).body.error, "bad-lines", "남의 당번 틀");
  r = got(await call(L.token, "dutyRoster", { board_id: W.A, from: extra, to: extra }));
  const sx = r.body.days[0].slots[0].id;
  assert.deepEqual(got(await call(L.token, "dutySlotDelete", { slot_id: sx })).body, { ok: true });
  assert.equal(got(await call(L.token, "dutySlotDelete", { slot_id: W.s9 })).body.error, "has-signups");
  assert.equal(got(await call(L.token, "dutySlotDelete", { slot_id: W.sB })).body.error, "not-assigned");
  // 끝 날짜를 모레 뒤로 당기면 — 그 뒤(9일 뒤)에 선 한 분을 after 로 알리고, 그 뒤 날짜 더하기는 after-until
  const base = { id: W.A, title: `${TAG}A-${STAMP}`, place: "시험 식당", contact_note: "시험 문의", status: "open" };
  //   끝 날짜를 당기는 저장은 그 뒤에 선 분이 있으면 먼저 묻는다(has-after · 수) → force 로 저장한다
  r = got(await call(L.token, "dutyBoardSave", { board: { ...base, until_date: kst(5) } }));
  assert.deepEqual(r.body, { ok: false, error: "has-after", active: 1 });
  r = got(await call(L.token, "dutyBoardSave", { board: { ...base, until_date: kst(5) }, force: true }));
  assert.deepEqual(r.body, { ok: true, id: W.A, after: 1 });
  assert.deepEqual(got(await call(L.token, "dutyBoardSave", { board: { ...base, until_date: kst(5) } })).body, { ok: true, id: W.A, after: 1 }, "같은 끝 날짜로 다시 저장하면 묻지 않는다");
  assert.equal(got(await call(L.token, "dutyDateAdd", { board_id: W.A, date: kst(6), line_ids: [W.line] })).body.error, "after-until");
  r = got(await call(L.token, "dutyRoster", { board_id: W.A, from: W.d9, to: W.d9 }));
  assert.equal(r.body.days[0].afterUntil, true);
  assert.deepEqual(got(await call(L.token, "dutyBoardSave", { board: { ...base, until_date: "" } })).body, { ok: true, id: W.A, after: 0 });
  // 표시 거두기 — 표시가 없는 줄이면 cleared:false(기록 없음) · 표시를 직접 켜 두고(앱은 2단계) 거둔다
  assert.deepEqual(got(await call(L.token, "dutyAskClear", { id: W.e1 })).body, { ok: true, cleared: false });
  await rest(`duty_signups?id=eq.${W.e1}`, "PATCH", { ask_at: new Date().toISOString(), ask_why: "cant" });
  r = got(await call(L.token, "dutyRoster", { board_id: W.A, from: W.d2, to: W.d2 }));
  assert.equal(r.body.days[0].asks, 1);
  assert.deepEqual(got(await call(L.token, "dutyAskClear", { id: W.e1 })).body, { ok: true, cleared: true });
});

test("겹침 — 다른 당번이면 이름 없이 · 같은 당번이면 자리 이름 · 명단에 겹침 표시 · 남의 당번 줄은 빼기·되살리기 모두 not-assigned", async () => {
  const ga = { name: `${TAG}${STAMP}-가`, who_type: "새가족", group_name: "시험", sub_name: "1" };   // A 의 2부(11~12)에 서 있는 분
  let r = got(await call(chief.token, "dutySignAdd", { slot_id: W.sB, ident: ga }));
  assert.deepEqual(r.body, { ok: false, error: "overlap", with: { same: false, label: "" } }, JSON.stringify(r.body));
  r = got(await call(chief.token, "dutySignAdd", { slot_id: W.sB, ident: ga, force: true }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  W.eB = r.body.id;
  const inA = async () => {
    const x = got(await call(L.token, "dutyRoster", { board_id: W.A, from: W.d2, to: W.d2 }));
    return x.body.days[0].slots;
  };
  let slots = await inA();
  assert.equal(slots.find((s) => s.id === W.s2).signups.find((e) => e.id === W.e1).overlap, true, "11~12 가 겹친다");
  assert.equal(slots.find((s) => s.id === W.s1).signups.find((e) => e.id === W.e4).overlap, false, "09~10 은 안 겹친다");
  r = got(await call(chief.token, "dutyRoster", { board_id: W.B, from: W.d2, to: W.d2 }));
  assert.equal(r.body.days[0].slots[0].signups[0].overlap, true);
  // 담당 L 은 남의 당번(B)의 줄을 빼지도 되살리지도 못한다
  assert.deepEqual(got(await call(L.token, "dutySignRemove", { id: W.eB })).body, { ok: false, error: "not-assigned" });
  assert.deepEqual(got(await call(L.token, "dutySignRestore", { id: W.eB })).body, { ok: false, error: "not-assigned" });
  assert.equal(got(await call(chief.token, "dutySignRemove", { id: W.eB })).body.ok, true);
  slots = await inA();
  assert.equal(slots.find((s) => s.id === W.s2).signups.find((e) => e.id === W.e1).overlap, false, "뺀 뒤에는 겹침이 아니다");
  // 같은 당번 — 겹치는 틀(11:30~12:30)을 더해 그 자리에 같은 분을 넣으려 하면 자리 이름과 함께 알린다
  r = got(await call(L.token, "dutyLineSave", { board_id: W.A, line: { service: "2부", task: "배식", start: "11:30", end: "12:30", capacity: 2, weekday: dow(W.d2) } }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  const lineX = r.body.id;
  const sx = (await inA()).find((s) => s.task === "배식").id;
  assert.deepEqual(got(await call(L.token, "dutySignAdd", { slot_id: sx, ident: ga })).body, { ok: false, error: "overlap", with: { same: true, label: "2부 설거지 11:00" } });
  r = got(await call(L.token, "dutyLineRemove", { id: lineX }));
  assert.deepEqual([r.body.ok, r.body.deleted], [true, true], "지원이 없던 틀은 통째로 지운다: " + JSON.stringify(r.body));
});

test("먼 날짜 — 보이는 기간 밖에 더한 날도 명단에는 보인다(notYet) · 앱에 열렸는지(appOpen)를 함께 준다", async () => {
  const far = kst(120);
  let r = got(await call(L.token, "dutyDateAdd", { board_id: W.A, date: far, line_ids: [W.line] }));
  assert.deepEqual(r.body, { ok: true, made: 1, existed: 0 });
  r = got(await call(L.token, "dutyRoster", { board_id: W.A }));
  const d = r.body.days.find((x) => x.date === far);
  assert.ok(d, "기본 기간에 먼 날짜가 들어온다");
  assert.deepEqual([d.notYet, d.afterUntil, r.body.days.find((x) => x.date === W.d2).notYet], [true, false, false]);
  assert.equal(typeof r.body.appOpen, "boolean");
  assert.deepEqual(got(await call(L.token, "dutySlotDelete", { slot_id: d.slots[0].id })).body, { ok: true });
});

test("자리 틀 고치기·빼기 — 정원을 앞날 자리에도 · 지원이 있는 틀은 남긴다 · 남의 당번 틀 번호는 not-assigned", async () => {
  let r = got(await call(L.token, "dutyLineSave", { board_id: W.A, apply_future: true,
    line: { id: W.line1, service: "1부", task: "설거지", start: "09:00", end: "10:00", capacity: 3, weekday: dow(W.d2) } }));
  assert.equal(r.body.ok, true); assert.ok(r.body.updated >= 7, "앞날 자리 정원: " + JSON.stringify(r.body));
  assert.deepEqual(got(await call(L.token, "dutyLineRemove", { id: W.lineB })).body, { ok: false, error: "not-assigned" });
  r = got(await call(L.token, "dutyLineRemove", { id: W.line1 }));
  assert.deepEqual([r.body.ok, r.body.deleted, r.body.kept], [true, false, 1], "지원이 있는 모레 자리 하나는 남긴다");
  assert.equal(got(await call(L.token, "dutyLineRemove", { id: 0 })).body.error, "bad-id");
});

test("교인명부 찾기 — 맡은 당번의 창에서만 · 총괄도 board_id 가 있어야 한다", async () => {
  assert.equal(got(await call(L.token, "dutyPeopleLookup", { board_id: W.B, name: "ca-test-없음" })).body.error, "not-assigned");
  assert.equal(got(await call(chief.token, "dutyPeopleLookup", { name: "ca-test-없음" })).body.error, "bad-id");
  assert.equal(got(await call(chief.token, "dutyPeopleLookup", { board_id: ZERO, name: "ca-test-없음" })).body.error, "not-found");
  const r = got(await call(L.token, "dutyPeopleLookup", { board_id: W.A, name: "ca-test-없음" }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.deepEqual(r.body.people, []);
});

test("엑셀 — 두 시트 · 메모 없음 · 맡지 않은 당번은 not-assigned", async () => {
  const r = got(await call(L.token, "dutyExport", { board_id: W.A, from: W.d2, to: W.d9 }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.table[0][0], "날짜"); assert.equal(r.body.list[0][4], "이름");
  assert.ok(r.body.list.length >= 3, "살아 있는 줄");
  assert.equal(JSON.stringify(r.body).includes("전화로 받음"), false, "담당자 메모가 엑셀에 실렸다");
  assert.equal(got(await call(L.token, "dutyExport", { board_id: W.B })).body.error, "not-assigned");
});

test("앱에서 안 보이게 되는 저장 — 앞날에 선 분이 있으면 has-upcoming · force 로 보관 · 보관한 당번은 쓰기 거절", async () => {
  const base = { id: W.A, title: `${TAG}A-${STAMP}`, place: "시험 식당", contact_note: "시험 문의" };
  let r = got(await call(chief.token, "dutyBoardSave", { board: { ...base, status: "archived" } }));
  assert.equal(r.body.error, "has-upcoming"); assert.ok(r.body.active >= 3, JSON.stringify(r.body));
  assert.equal(got(await call(chief.token, "dutyBoardSave", { board: { ...base, status: "archived" }, force: true })).body.ok, true);
  assert.equal(got(await call(L.token, "dutySignAdd", { slot_id: W.s2, ident: { name: `${TAG}${STAMP}-사` } })).body.error, "archived");
  assert.equal(got(await call(L.token, "dutySignNote", { id: W.e1, note: "x" })).body.error, "archived");
  assert.equal(got(await call(L.token, "dutyPeopleLookup", { board_id: W.A, name: "가" })).body.error, "archived");
  assert.equal(got(await call(chief.token, "dutyBoardSave", { board: { ...base, status: "archived", place: "다른 곳" } })).body.error, "archived");
  assert.equal(got(await call(L.token, "dutyRoster", { board_id: W.A })).body.ok, true, "보관한 당번도 명단은 읽힌다");
});

test("기록 — duty.* 가 남고 이름이 없다 · 응답 어디에도 계정 번호·신원 키·표식이 없다", async () => {
  const rows = await rest(`admin_audit?select=action,target,detail&member_id=in.(${made.members.join(",")})&order=id`);
  const acts = new Set(rows.map((x) => x.action));
  for (const a of ["duty.board.save", "duty.staff.set", "duty.line.save", "duty.line.remove", "duty.date.add", "duty.day.set", "duty.days.off", "duty.slot.set",
    "duty.slot.delete", "duty.sign.add", "duty.sign.remove", "duty.sign.restore", "duty.sign.move", "duty.sign.note", "duty.sign.askclear", "duty.export", "people.lookup"]) {
    assert.ok(acts.has(a), "기록 없음: " + a);
  }
  const duty = rows.filter((x) => x.action.startsWith("duty."));
  assert.equal(JSON.stringify(duty).includes(`${TAG}${STAMP}`), false, "기록에 이름이 실렸다");
  assert.equal(JSON.stringify(duty).includes("전화로 받음"), false, "기록에 메모 글이 실렸다");
  assert.ok(duty.every((x) => made.boards.includes(x.target)), "기록의 target 은 당번 id");
  assert.equal(rows.find((x) => x.action === "people.lookup").detail.from, "duty");
  const txt = JSON.stringify(seen);
  for (const w of ["user_id", "ident_key", "confirmed_by", "auth_user_id", "\"pk\"", "staff|", "person|"]) assert.equal(txt.includes(w), false, w);
});

test("공개 키·로그인만 한 사용자는 당번 표·함수를 직접 못 연다", async () => {
  for (const key of [ANON]) {
    const h = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
    for (const t of ["duty_boards", "duty_lines", "duty_days", "duty_slots", "duty_signups", "duty_notify_log", "duty_board_staff"]) {
      const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: h });
      const x = await body(r);
      assert.ok(!r.ok || (Array.isArray(x) && x.length === 0), `${t} 가 공개 키로 읽힌다: ${r.status}`);
      assert.ok(r.status === 401 || r.status === 403 || r.status === 404, `${t}: ${r.status}`);
    }
    for (const [fn, args] of [["duty_apply", { p_slot: W.s2, p_user: null, p_ident: { name: "x", ident_key: "staff|x" }, p_staff: true }],
      ["duty_roster", { p_board: W.A }], ["duty_board_view", { p_board: W.A }], ["duty_list_view", {}], ["duty_cancel", { p_signup: W.e1, p_staff: true }]]) {
      const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(args) });
      assert.ok(r.status === 401 || r.status === 403 || r.status === 404, `rpc/${fn}: ${r.status}`);
    }
  }
  // 로그인한 사용자(authenticated)의 토큰으로도 같다 — 2026-09-28 부터 카카오 계정만 있으면 누구나 authenticated 다
  const h = { apikey: ANON, Authorization: "Bearer " + L.token, "Content-Type": "application/json" };
  for (const t of ["duty_signups", "duty_boards", "duty_board_staff"]) {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: h });
    assert.ok(r.status === 401 || r.status === 403 || r.status === 404, `${t}(로그인 사용자): ${r.status}`);
  }
  const r = await fetch(`${URL_}/rest/v1/rpc/duty_roster`, { method: "POST", headers: h, body: JSON.stringify({ p_board: W.A }) });
  assert.ok(r.status === 401 || r.status === 403 || r.status === 404, `rpc/duty_roster(로그인 사용자): ${r.status}`);
});
