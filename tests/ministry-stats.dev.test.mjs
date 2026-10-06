// 📊 사역 통계(2026-10-06) — 개발 서버에 대고 도는 시험. 네트워크와 개발 비밀 키가 필요해 preflight 에는 넣지 않는다(이름의 .dev.).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/ministry-stats.dev.test.mjs
// 하는 일: 사역신청 담당 한 분 · 역할 없는 분 한 분(이메일 로그인 ca-test-mst-…@example.test)을 만들고
//   ① 문(역할 없는 분은 403 · 사역신청 담당은 200) ② 응답 모양(묶음 숫자와 부서·팀 이름뿐 — 재료·사람 번호·교인ID·이름 칸이 없다)
//   ③ 해마다 자리 수의 합 = 사역 이력 줄 수(빼 둔 줄 제외 · 줄을 직접 센다)를 본다. 아무것도 바꾸지 않는다(읽기만).
//   끝나면(실패해도) 역할 → 담당자 → auth 사용자를 지운다.
// ⚠️ 키·비밀번호를 찍지 않는다. 개발(ktpwthwqzgcqcrmsafdo)에만 돈다. SQL 013·013b 가 개발에 들어가 있어야 한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { GROUPS, ALL } from "../supabase/functions/church-admin/ministry-stats.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const TAG = "ca-test-mst-";

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200) }; } }
async function rest(path, method = "GET", data, prefer = "return=representation") {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method, headers: { ...svc, Prefer: prefer }, body: data ? JSON.stringify(data) : undefined });
  const x = await body(r);
  assert.ok(r.ok, path + " " + r.status + " " + JSON.stringify(x).slice(0, 200));
  return { data: x, range: r.headers.get("content-range") };
}
const made = { users: [], members: [] };
async function makeUser(label, roles) {
  const email = `${TAG}${label}-${STAMP}@example.test`, password = "T" + STAMP + "!x";
  const u = await body(await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc, body: JSON.stringify({ email, password, email_confirm: true }) }));
  assert.ok(u.id, "사용자 만들기 실패");
  made.users.push(u.id);
  const s = await body(await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  assert.ok(s.access_token, "로그인 실패");
  const [m] = (await rest("admin_members", "POST", { auth_user_id: u.id, name: `시험-${label}`, gu: "사랑", mok: "1", status: "active" })).data;
  made.members.push(m.id);
  for (const role_id of roles) await rest("admin_role_grants", "POST", { member_id: m.id, role_id });
  return s.access_token;
}
async function call(token, action, extra = {}) {
  const r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + token },
    body: JSON.stringify({ ...extra, action }) });
  return { status: r.status, body: await body(r) };
}

const who = {};
before(async () => {
  who.ministry = await makeUser("min", ["ministry"]);
  who.none = await makeUser("none", []);
});
after(async () => {
  if (made.members.length) {
    const ids = made.members.join(",");
    await rest(`admin_role_grants?member_id=in.(${ids})`, "DELETE");
    await rest(`admin_members?id=in.(${ids})`, "DELETE");
  }
  for (const id of made.users) await fetch(URL_ + "/auth/v1/admin/users/" + id, { method: "DELETE", headers: svc });
});

test("문 — 역할 없는 분은 막히고 사역신청 담당은 본다", async () => {
  const no = await call(who.none, "ministryStats");
  assert.deepEqual([no.status, no.body.error], [403, "forbidden"]);
  const ok = await call(who.ministry, "ministryStats");
  assert.equal(ok.status, 200, JSON.stringify(ok.body).slice(0, 200));
  assert.equal(ok.body.ok, true);
});

test("응답 — 묶음 숫자와 부서·팀 이름뿐", async () => {
  const b = (await call(who.ministry, "ministryStats")).body;
  assert.deepEqual(Object.keys(b).sort(), ["inner", "meta", "ok", "sourceDate", "units", "years"]);
  assert.deepEqual(Object.keys(b.meta).sort(), ["gaps", "gonePeople", "unmapped", "unmappedSeats", "unsurePeople", "unsureSeats"]);
  for (const [u, v] of Object.entries(b.units)) {
    assert.ok(u === ALL || u.startsWith("g:") || u.startsWith("f:"), u);
    assert.deepEqual(Object.keys(v).sort(), ["group", "label", "rows"]);
    assert.equal(v.rows.length, b.years.length);
    for (const r of v.rows) for (const [k, x] of Object.entries(r)) {
      if (k === "demo") { assert.ok(x === null || (Array.isArray(x.bands) && Array.isArray(x.sex) && Array.isArray(x.position)), "demo"); continue; }
      assert.ok(x === null || typeof x === "number" || typeof x === "boolean", `${u} ${k} ${typeof x}`);
    }
  }
  const s = JSON.stringify(b);
  for (const bad of ["person_id", "personId", '"name"', '"seats":[[', '"people":[[', '"map":', "birth", "phone"]) assert.ok(!s.includes(bad), bad);
});

test("해마다 자리 수 — 큰 분류의 합이 사역 이력 줄 수와 같다", async () => {
  const b = (await call(who.ministry, "ministryStats")).body;
  for (const [i, y] of b.years.entries()) {
    const sum = GROUPS.reduce((a, g) => a + (b.units["g:" + g]?.rows[i].seats || 0), 0);
    const { range } = await rest(`ministry_history?select=id&year=eq.${y}&deleted_at=is.null&limit=1`, "GET", undefined, "count=exact");
    assert.equal(sum, Number(String(range).split("/")[1]), `${y}년`);
  }
  const three = ["찬양", "교회학교", "그 밖"];
  for (const [i] of b.years.entries()) {
    const sum = three.reduce((a, g) => a + (b.units["g:" + g]?.rows[i].seats || 0), 0);
    assert.equal(b.units[ALL]?.rows[i].seats || 0, sum);
  }
});
