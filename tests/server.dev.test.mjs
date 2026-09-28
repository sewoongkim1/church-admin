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
  ministryAppointed: {},
  ministryList: {},
  ministrySetStatus: { id: 0, status: "접수완료" },
  ministryDelete: { id: 0 },
};
const GATES = ["unknown-action", "not-registered", "pending", "disabled", "forbidden"];

// 신청 현황(3단계) 시험 자료 — users 한 줄 + ministry_orders 두 줄(서로 다른 사역팀)
let minTestUserId = null;
const minTestOrderIds = [];

before(async () => {
  for (const k of ["none", "pending", "disabled", "ministry", "super"]) people[k] = await makeUser(k);
  await makeMember(people.pending, "pending", []);
  await makeMember(people.disabled, "disabled", ["super"]);
  await makeMember(people.ministry, "active", ["ministry"]);
  await makeMember(people.super, "active", ["super"]);

  const [u] = await rest("users", "POST", {
    type: "교구", gu: "시험", mok: "0", name: "ca-test-min",
    identity_key: "교구|시험|0|||ca-test-min-" + STAMP,
  });
  minTestUserId = u.id;
  // team_id 는 not null + (year,user_id,team_id) 유일 제약이 있다 — 가짜 id 를 만들지 않고
  // 개발 ministry_catalog 에서 서로 다른 두 줄의 id 를 그대로 읽어 쓴다.
  const cats = await rest("ministry_catalog?select=id&order=id&limit=2", "GET");
  assert.ok(cats.length >= 2, "ministry_catalog 에 팀이 둘 이상 있어야 한다");
  const cfg = await rest("app_config?select=value&key=eq.ministry", "GET");
  const year = Number(cfg[0]?.value?.year) || 2027;
  for (const [team_id, team] of [[cats[0].id, "시험팀A"], [cats[1].id, "시험팀B"]]) {
    const [row] = await rest("ministry_orders", "POST", {
      year, user_id: minTestUserId, team_id, committee: "시험부", team,
      status: "신청완료", phone: "010-0000-0000", source: "app",
    });
    minTestOrderIds.push(row.id);
  }
});

after(async () => {
  for (const p of Object.values(people)) {
    if (p.uid) await fetch(URL_ + "/auth/v1/admin/users/" + p.uid, { method: "DELETE", headers: svc });
  }
  // ministry_orders 먼저, 그다음 users — 이미 지워진(id) 것이 있어도 오류로 보지 않는다
  for (const id of minTestOrderIds) await rest("ministry_orders?id=eq." + id, "DELETE");
  if (minTestUserId) await rest("users?id=eq." + minTestUserId, "DELETE");
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
  const want = (who, role) => ({
    none: "not-registered", pending: "pending", disabled: "disabled",
    ministry: role === "ministry" ? null : "forbidden", super: null,
  })[who];
  for (const [a, payload] of Object.entries(PROBE)) {
    const role = ACTION_ROLES[a];
    for (const who of ["none", "pending", "disabled", "ministry", "super"]) {
      const gate = want(who, role);
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
  const badChar = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", mok: "1", name: '김,"' } });
  assert.equal(badChar.body.error, "bad-char");
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

test("임명현황: 임명확정만 · 여덟 칸만 · 개수가 DB 와 같다", async () => {
  const r = await call(people.ministry.token, "ministryAppointed");
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.ok(Number.isInteger(r.body.year));
  const allowed = ["name", "who", "committee", "team", "option", "at", "decided_at", "source"];
  for (const row of r.body.rows) {
    assert.deepEqual(Object.keys(row).sort(), [...allowed].sort());
    assert.match(row.at, /^(\d{4}-\d{2}-\d{2})?$/);
    assert.ok(row.source === "app" || row.source === "paper");
  }
  // 옛 화면과 같은 명단인지 — 서비스 키로 DB 를 직접 세어 맞댄다
  const res = await fetch(`${URL_}/rest/v1/ministry_orders?select=id&year=eq.${r.body.year}&status=eq.${encodeURIComponent("임명확정")}`,
    { headers: { ...svc, Prefer: "count=exact", Range: "0-0" } });
  const total = Number((res.headers.get("content-range") || "").split("/")[1]);
  assert.equal(r.body.rows.length, total, "DB 의 임명확정 수와 다르다");
});

test("신청 현황: 목록 모양 · 동시 수정 · 취소 사유 · 임명 알림(개발 api 내부 액션) · 삭제 · 바꾼 기록", async () => {
  const m = people.ministry.token;
  const list = await call(m, "ministryList");
  assert.equal(list.body.ok, true);
  const mine = list.body.list.filter((x) => x.name === "ca-test-min");
  assert.equal(mine.length, 2);
  for (const x of mine) {
    assert.equal("user_id" in x, false);
    assert.equal(x.phone, "010-0000-0000");
    assert.equal(x.canPush, false);
  }
  const [a, bRow] = mine.sort((x, y) => x.team.localeCompare(y.team));
  // 접수 → 같은 expect 로 한 번 더 → conflict
  assert.equal((await call(m, "ministrySetStatus", { id: a.id, status: "접수완료", expect: "신청완료" })).body.ok, true);
  const c = await call(m, "ministrySetStatus", { id: a.id, status: "임명확정", expect: "신청완료" });
  assert.equal(c.body.error, "conflict");
  assert.equal(c.body.status, "접수완료");
  // 임명 → 알림 안 켜심(시험 사용자는 구독이 없다) · 번호 지움
  const ap = await call(m, "ministrySetStatus", { id: a.id, status: "임명확정", expect: "접수완료" });
  assert.equal(ap.body.ok, true, JSON.stringify(ap.body));
  assert.equal(ap.body.pushed, 0);
  assert.equal(ap.body.pushError, "not-subscribed");
  assert.equal(ap.body.phoneCleared, true);
  // 취소 — 사유 없이는 안 됨
  assert.equal((await call(m, "ministrySetStatus", { id: bRow.id, status: "취소", expect: "신청완료" })).body.error, "cancel-note-required");
  assert.equal((await call(m, "ministrySetStatus", { id: bRow.id, status: "취소", expect: "신청완료", note: "시험 취소" })).body.ok, true);
  const after = (await call(m, "ministryList")).body.list.filter((x) => x.name === "ca-test-min");
  assert.equal(after.find((x) => x.id === bRow.id).note, "시험 취소");
  assert.equal(after.find((x) => x.id === bRow.id).phone, "");
  // 삭제
  const del = await call(m, "ministryDelete", { id: bRow.id });
  assert.equal(del.body.ok, true);
  assert.equal(del.body.deleted.name, "ca-test-min");
  assert.equal((await call(m, "ministryDelete", { id: bRow.id })).body.error, "not-found");
  const acts = (await call(people.super.token, "auditList", { limit: 20 })).body.rows.map((r) => r.action);
  assert.ok(acts.includes("ministry.status") && acts.includes("ministry.delete"), JSON.stringify(acts));
});
