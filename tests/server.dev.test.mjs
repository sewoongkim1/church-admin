// 개발 서버에 대고 도는 시험 — 네트워크와 개발 비밀 키가 필요해 preflight 에는 넣지 않는다(이름의 .dev.).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/server.dev.test.mjs
// 시험용 사람은 이메일 로그인으로 만들고(ca-test-…@example.test) 끝나면 지운다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTION_ROLES, knownRoles } from "../supabase/functions/church-admin/authz.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const ZERO = "00000000-0000-0000-0000-000000000000";
const people = {};

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t }; } }

async function makeUser(label) {
  const email = `ca-test-${label}-${STAMP}@example.test`, password = "T" + STAMP + "!x";
  const u = await body(await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }) }));
  assert.ok(u.id, "사용자 만들기 실패: " + JSON.stringify(u));
  const s = await body(await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  assert.ok(s.access_token, "로그인 실패: " + JSON.stringify(s));
  return { uid: u.id, token: s.access_token };
}

async function rest(path, method, data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method, headers: { ...svc, Prefer: "return=representation" },
    body: data ? JSON.stringify(data) : undefined });
  const x = await body(r);
  assert.ok(r.ok, path + " " + JSON.stringify(x));
  return x;
}

async function makeMember(p, status, roles) {
  const [m] = await rest("admin_members", "POST", { auth_user_id: p.uid, name: "시험-" + status, gu: "사랑", mok: "1", status });
  for (const role_id of roles) await rest("admin_role_grants", "POST", { member_id: m.id, role_id });
  p.memberId = m.id;
}

async function call(token, action, extra = {}) {
  const r = await fetch(FN, { method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ ...extra, action }) });
  return { status: r.status, body: await body(r) };
}

// super 액션마다 「통과하면 아무것도 안 바뀌는」 입력 — 없는 사람(ZERO)을 가리킨다
const PROBE = {
  membersList: {},
  membersApprove: { member_id: ZERO, roles: ["ministry"] },
  membersSetRoles: { member_id: ZERO, roles: ["ministry"] },
  membersSetStatus: { member_id: ZERO, status: "disabled" },
  auditList: { limit: 1 },
};
const GATES = ["unknown-action", "not-registered", "pending", "disabled", "forbidden"];

before(async () => {
  for (const k of ["none", "pending", "disabled", "ministry", "super"]) people[k] = await makeUser(k);
  await makeMember(people.pending, "pending", []);
  await makeMember(people.disabled, "disabled", ["super"]);
  await makeMember(people.ministry, "active", ["ministry"]);
  await makeMember(people.super, "active", ["super"]);
});

after(async () => {
  for (const p of Object.values(people)) {
    if (p.uid) await fetch(URL_ + "/auth/v1/admin/users/" + p.uid, { method: "DELETE", headers: svc });
  }
});

test("역할이 필요한 액션마다 시험 입력(PROBE)이 있다", () => {
  for (const [a, role] of Object.entries(ACTION_ROLES)) if (role) assert.ok(a in PROBE, "PROBE 에 없음: " + a);
});

test("서버가 아는 역할이 admin_roles 표에 있다", async () => {
  const rows = await rest("admin_roles?select=id", "GET");
  const ids = rows.map((r) => r.id);
  for (const r of knownRoles()) assert.ok(ids.includes(r), "admin_roles 에 없음: " + r);
});

test("토큰 없음·공개 키를 토큰처럼 → 401", async () => {
  assert.equal((await call(null, "me")).status, 401);
  assert.equal((await call(ANON, "me")).status, 401);
});

test("모르는 액션 → 400", async () => {
  const r = await call(people.super.token, "nope");
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "unknown-action");
});

test("권한 표: 사람 다섯 × 역할이 필요한 액션", async () => {
  const want = { none: "not-registered", pending: "pending", disabled: "disabled", ministry: "forbidden", super: null };
  for (const [a, payload] of Object.entries(PROBE)) {
    for (const [who, gate] of Object.entries(want)) {
      const r = await call(people[who].token, a, payload);
      if (gate) {
        assert.equal(r.status, 403, `${who} ${a} ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error, gate, `${who} ${a}`);
      } else {
        assert.notEqual(r.status, 500, `${who} ${a} ${JSON.stringify(r.body)}`);
        assert.ok(!GATES.includes(r.body.error), `${who} ${a} ${JSON.stringify(r.body)}`);
      }
    }
  }
});

test("me: 다섯 사람 모두 자기 상태를 안다 · 정지된 분에게는 역할을 알려 주지 않는다", async () => {
  const want = { none: [false, null], pending: [true, "pending"], disabled: [true, "disabled"], ministry: [true, "active"], super: [true, "active"] };
  for (const [who, [reg, st]] of Object.entries(want)) {
    const r = await call(people[who].token, "me");
    assert.equal(r.body.ok, true, who);
    assert.equal(r.body.registered, reg, who);
    assert.equal(r.body.status, st, who);
  }
  assert.deepEqual((await call(people.disabled.token, "me")).body.roles, []);
  const m = await call(people.ministry.token, "me");
  assert.deepEqual(m.body.roles, ["ministry"]);
  assert.equal(m.body.roles_info[0].label, "사역신청 담당");
  assert.equal("auth_user_id" in m.body.member, false);
});

test("공개 키·로그인 사용자 모두 admin_* 표를 직접 못 읽는다", async () => {
  for (const t of ["admin_members", "admin_roles", "admin_role_grants", "admin_audit"]) {
    const a = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON } });
    assert.notEqual(a.status, 200, "공개 키로 열림: " + t);
    const b = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`,
      { headers: { apikey: ANON, Authorization: "Bearer " + people.super.token } });
    assert.notEqual(b.status, 200, "로그인 사용자로 열림: " + t);
  }
});

test("register: 틀린 칸 → 등록 → 대기 중엔 고치기 → 승인된 분은 못 바꿈", async () => {
  const bad = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", name: "" } });
  assert.equal(bad.body.error, "name-required");
  const r1 = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", mok: "1", name: "시험등록" } });
  assert.equal(r1.body.status, "pending");
  const r2 = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", mok: "2", name: "시험등록" } });
  assert.equal(r2.body.member.mok, "2");
  const r3 = await call(people.ministry.token, "register", { identity: { type: "교구", gu: "사랑", mok: "1", name: "바꿔치기" } });
  assert.equal(r3.body.error, "already-registered");
});

test("승인 · 역할 · 정지 한 바퀴 + 스스로 잠그지 않기 + 기록", async () => {
  const s = people.super.token;
  const list = await call(s, "membersList");
  assert.equal(list.body.ok, true);
  const target = list.body.members.find((m) => m.name === "시험등록");
  assert.ok(target, "대기 목록에 시험등록이 있어야 한다");
  assert.equal("auth_user_id" in target, false);
  assert.equal((await call(s, "membersApprove", { member_id: target.id, roles: ["root"] })).body.error, "unknown-role");
  assert.equal((await call(s, "membersApprove", { member_id: target.id, roles: ["ministry"] })).body.ok, true);
  assert.equal((await call(s, "membersApprove", { member_id: target.id, roles: ["ministry"] })).body.error, "not-pending");
  assert.deepEqual((await call(people.none.token, "me")).body.roles, ["ministry"]);
  assert.equal((await call(s, "membersSetRoles", { member_id: target.id, roles: ["ministry", "super"] })).body.ok, true);
  assert.equal((await call(s, "membersSetRoles", { member_id: target.id, roles: ["ministry"] })).body.ok, true);
  assert.equal((await call(s, "membersSetStatus", { member_id: target.id, status: "disabled" })).body.ok, true);
  assert.equal((await call(people.none.token, "membersList")).body.error, "disabled");
  assert.equal((await call(s, "membersSetStatus", { member_id: people.super.memberId, status: "disabled" })).body.error, "self");
  assert.equal((await call(s, "membersSetRoles", { member_id: people.super.memberId, roles: ["ministry"] })).body.error, "self-super");
  assert.equal((await call(s, "membersSetStatus", { member_id: people.pending.memberId, status: "active" })).body.error, "use-approve");
  const acts = (await call(s, "auditList", { limit: 20 })).body.rows.map((r) => r.action);
  for (const a of ["register", "register.update", "members.approve", "members.roles", "members.status"]) {
    assert.ok(acts.includes(a), "기록에 없음: " + a + " — " + JSON.stringify(acts));
  }
});
