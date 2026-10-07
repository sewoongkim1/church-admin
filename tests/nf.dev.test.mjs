// 새가족(1단계 · 2026-10-07) — 개발 서버에 대고 도는 시험. 네트워크와 개발 비밀 키가 필요해 preflight 에는 넣지 않는다(이름의 .dev.).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/nf.dev.test.mjs
// 하는 일: 운영팀 한 분 · 대기 중인 세 분(영접팀 G · 정착팀 총무 L · 섬김이 H — 이메일 로그인 ca-test-nf-…@example.test)을 만들고
//   승인(nfteam 하나만) → 하는 일마다 보는 것 · 카드 넣기·고치기(changed·dup·has-progress) · 사진(비공개) · 배정 · 수료 대상 · 기록(이름 없음) ·
//   공개 키로는 안 열림을 본다. 이름은 모두 지어낸 것(시험-새가족-…).
//   끝나면(실패해도) 사진 → 교육 줄 → 카드(사람·인도자 딸림) → 섬김이 줄 → 하는 일 → 기록·역할·담당자 → auth 사용자를 지우고 0 줄인지 본다.
// ⚠️ 키·비밀번호를 찍지 않는다. 개발(ktpwthwqzgcqcrmsafdo)에만 돈다. SQL 016 이 개발에 들어가 있어야 한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const TAG = "ca-test-nf-";
const NAME = `시험새가족${String(STAMP).slice(-6)}`;   // 지어낸 이름 — 이번 실행의 줄만 가린다
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
async function makeMember(p, name, roles, status = "active") {
  const [m] = await rest("admin_members", "POST", { auth_user_id: p.uid, name, gu: "사랑", mok: "1", status });
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

const made = { users: [], members: [], cards: [], helpers: [], ceremonies: [] };
const chief = {}, G = {}, L = {}, H = {}, O = {};   // O = 다른 역할만 가진 분(교육 담당)
const W = {};
const seen = [];
const got = (r) => { seen.push(r.body); return r; };
// 가장 작은 JPEG 머리(FF D8 FF …) — 서버는 크기와 머리만 본다
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).toString("base64");

const card = (over = {}) => ({
  consent: true, reg_date: kst(-3), service: "3부", address: "시험시 시험구 시험로 1",
  people: [{ name: NAME + "가", gender: "여", birth: "1959-10-15", phone: "010-0000-" + String(STAMP).slice(-4), target: true },
    { name: NAME + "나", relation: "자녀", birth: "2018-03-01", target: false }],
  guides: [{ name: "시험인도", mok: "기쁨-25", phone: "010-0000-0001" }],
  ...over,
});

async function sweep() {
  for (const id of made.cards) {
    await fetch(`${URL_}/storage/v1/object/newfamily/cards/${id}/card.jpg`, { method: "DELETE", headers: svc });
    await fetch(`${URL_}/storage/v1/object/newfamily/cards/${id}/welcome.jpg`, { method: "DELETE", headers: svc });
  }
  await rest(`nf_cards?id=in.(${[...made.cards, ZERO].join(",")})`, "DELETE");
  await rest(`nf_people?name=like.${NAME}*`, "DELETE");
  if (made.members.length) {
    const ms = made.members.join(",");
    await rest(`nf_helpers?member_id=in.(${ms})`, "DELETE");
    await rest(`nf_staff?member_id=in.(${ms})`, "DELETE");
  }
  await rest(`nf_helpers?id=in.(${[...made.helpers, ZERO].join(",")})`, "DELETE");
  await rest(`nf_ceremonies?id=in.(${[...made.ceremonies, ZERO].join(",")})`, "DELETE");
  // 확정 시험이 올린 그해 다음 번호를 되돌린다 — 그사이 다른 확정이 없었을 때만(값이 우리가 올린 그대로일 때)
  if (W.restoreNo) await rest(`nf_settings?year=eq.${W.restoreNo.y}&next_no=eq.${W.restoreNo.before + 1}`, "PATCH", { next_no: W.restoreNo.before });
}

before(async () => {
  Object.assign(chief, await makeUser("chief"));
  await makeMember(chief, "시험-새가족운영", ["newfamily"]);
  for (const [p, label, name] of [[G, "g", "시험-영접"], [L, "l", "시험-총무"], [H, "h", "시험-섬김이"]]) {
    Object.assign(p, await makeUser(label));
    await makeMember(p, name, [], "pending");
  }
  Object.assign(O, await makeUser("o"));
  await makeMember(O, "시험-교육담당", ["educourse"]);
});

after(async () => {
  const errs = [];
  const step = async (name, fn) => { try { await fn(); } catch (e) { errs.push(name + ": " + String(e?.message).slice(0, 160)); } };
  await step("새가족 줄", sweep);
  if (made.members.length) {
    const ms = made.members.join(",");
    await step("기록", () => rest(`admin_audit?member_id=in.(${ms})`, "DELETE"));
    await step("역할", () => rest(`admin_role_grants?member_id=in.(${ms})`, "DELETE"));
    await step("담당자", () => rest(`admin_members?id=in.(${ms})`, "DELETE"));
  }
  for (const uid of made.users) await step("auth 사용자", async () => {
    const x = await fetch(URL_ + "/auth/v1/admin/users/" + uid, { method: "DELETE", headers: svc });
    assert.ok(x.ok, "auth delete " + x.status);
  });
  await step("0 줄 확인", async () => {
    assert.equal((await rest(`nf_people?select=id&name=like.${NAME}*`)).length, 0, "nf_people");
    assert.equal((await rest(`nf_cards?select=id&id=in.(${[...made.cards, ZERO].join(",")})`)).length, 0, "nf_cards");
    if (made.members.length) {
      const ms = made.members.join(",");
      for (const t of ["admin_members?select=id&id", "admin_role_grants?select=member_id&member_id", "nf_staff?select=member_id&member_id", "nf_helpers?select=id&member_id"]) {
        assert.equal((await rest(`${t}=in.(${ms})`)).length, 0, t);
      }
    }
  });
  if (errs.length) throw new Error("정리 실패 " + errs.length + "건: " + errs.join(" / "));
});

test("공개 키로는 새가족 표가 열리지 않는다", async () => {
  for (const t of ["nf_cards", "nf_people", "nf_guides", "nf_lessons", "nf_helpers", "nf_staff", "nf_ceremonies", "nf_settings"]) {
    const r = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON, Authorization: "Bearer " + ANON } });
    const x = await body(r);
    assert.ok(!r.ok || (Array.isArray(x) && x.length === 0), t + " 가 공개 키로 읽힌다");
  }
  // 로그인만 한 분(카카오 계정만 있는 것과 같다)의 토큰으로도
  const r = await fetch(`${URL_}/rest/v1/nf_people?select=*&limit=1`, { headers: { apikey: ANON, Authorization: "Bearer " + G.token } });
  const x = await body(r);
  assert.ok(!r.ok || (Array.isArray(x) && x.length === 0), "nf_people 가 로그인 토큰으로 읽힌다");
});

test("함께 쓰는 분 — 운영팀이 대기 중인 분을 승인하며 nfteam 하나만 준다", async () => {
  let r = got(await call(chief.token, "nfStaffList"));
  assert.equal(r.body.ok, true);
  for (const p of [G, L, H]) assert.ok(r.body.pending.some((m) => m.id === p.memberId), "대기 줄");
  assert.ok(!r.body.pending.some((m) => m.id === O.memberId));

  // 섬김이는 이름만으로 먼저 넣는다
  r = got(await call(chief.token, "nfHelperSave", { name: "시험-섬김이", services: "3부" }));
  assert.equal(r.body.ok, true);
  W.helper = r.body.id; made.helpers.push(W.helper);
  r = got(await call(chief.token, "nfHelperSave", { name: "시험-쉬는분", resting: true }));
  W.resting = r.body.id; made.helpers.push(W.resting);

  assert.equal((await call(chief.token, "nfStaffApprove", { member_id: G.memberId, kinds: [] })).body.error, "no-kind");
  assert.equal((await call(chief.token, "nfStaffApprove", { member_id: G.memberId, kinds: ["super"] })).body.error, "bad-kind");
  // 몸통에 역할 이름을 실어 보내도 받지 않는다
  r = got(await call(chief.token, "nfStaffApprove", { member_id: G.memberId, kinds: ["greeter"], roles: ["super", "directory"] }));
  assert.equal(r.body.ok, true);
  assert.deepEqual((await rest(`admin_role_grants?select=role_id&member_id=eq.${G.memberId}`)).map((x) => x.role_id), ["nfteam"]);
  assert.equal((await rest(`admin_members?select=status&id=eq.${G.memberId}`))[0].status, "active");

  assert.equal((await call(chief.token, "nfStaffApprove", { member_id: L.memberId, kinds: ["lead"] })).body.ok, true);
  assert.equal((await call(chief.token, "nfStaffApprove", { member_id: H.memberId, kinds: ["helper"], helper_id: W.helper })).body.ok, true);
  assert.equal((await rest(`nf_helpers?select=member_id&id=eq.${W.helper}`))[0].member_id, H.memberId);

  // 이미 승인된 분 · 다른 역할만 가진 분은 건드리지 못한다
  assert.equal((await call(chief.token, "nfStaffApprove", { member_id: G.memberId, kinds: ["greeter"] })).body.error, "not-pending");
  assert.equal((await call(chief.token, "nfStaffSet", { member_id: O.memberId, kinds: ["pastor"] })).body.error, "not-team");
  assert.deepEqual((await rest(`admin_role_grants?select=role_id&member_id=eq.${O.memberId}`)).map((x) => x.role_id), ["educourse"]);

  // 섬김(nfteam)은 함께 쓰는 분을 못 본다 — 문에서 막힌다
  assert.equal((await call(G.token, "nfStaffList")).body.error, "forbidden");
  assert.equal((await call(L.token, "nfStaffApprove", { member_id: ZERO, kinds: ["greeter"] })).body.error, "forbidden");

  r = got(await call(chief.token, "nfStaffList"));
  assert.deepEqual(r.body.team.find((m) => m.id === H.memberId).kinds, ["helper"]);
  assert.equal(r.body.team.find((m) => m.id === H.memberId).helperId, W.helper);
  assert.equal(r.body.helpers.find((h) => h.id === W.helper).linked, true);
});

test("nfMe — 하는 일과 이어진 섬김이 줄", async () => {
  assert.deepEqual(got(await call(G.token, "nfMe")).body.kinds, ["greeter"]);
  const h = got(await call(H.token, "nfMe")).body;
  assert.deepEqual(h.kinds, ["helper"]);
  assert.equal(h.helper.id, W.helper);
  const c = got(await call(chief.token, "nfMe")).body;
  assert.equal(c.chief, true);
  assert.equal(got(await call(O.token, "nfMe")).body.error, "forbidden");
});

test("카드 — 영접팀이 넣고, 총무는 읽기만, 섬김이는 못 본다", async () => {
  assert.equal((await call(L.token, "nfCardSave", card())).body.error, "not-assigned");
  assert.equal((await call(H.token, "nfCardSave", card())).body.error, "not-assigned");
  assert.equal((await call(G.token, "nfCardSave", card({ consent: false }))).body.error, "no-consent");
  assert.equal((await call(G.token, "nfCardSave", card({ people: [{ name: NAME + "가" }] }))).body.error, "no-target");

  let r = got(await call(G.token, "nfCardSave", card()));
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  W.card = r.body.card_id; made.cards.push(W.card);

  // 같은 이름 + 전화 뒷자리 → dup, force 로만
  r = await call(G.token, "nfCardSave", card());
  assert.equal(r.body.error, "dup");
  r = got(await call(G.token, "nfCardSave", card({ force: true, people: [{ name: NAME + "가", phone: "010-0000-" + String(STAMP).slice(-4), target: true }] })));
  assert.equal(r.body.ok, true);
  W.card2 = r.body.card_id; made.cards.push(W.card2);

  r = got(await call(L.token, "nfCardGet", { card_id: W.card }));
  assert.equal(r.body.ok, true);
  assert.equal(r.body.card.address, "시험시 시험구 시험로 1");
  assert.equal(r.body.people.length, 2);
  assert.equal(r.body.people[0].stage, "wait_helper");
  assert.equal(r.body.people[1].stage, "info");
  assert.equal(r.body.guides[0].phone, "010-0000-0001");
  W.p1 = r.body.people[0].id; W.p2 = r.body.people[1].id; W.base = r.body.card.updatedAt;
  assert.equal((await call(H.token, "nfCardGet", { card_id: W.card })).body.error, "not-assigned");
  assert.equal((await call(G.token, "nfCardGet", { card_id: ZERO })).body.error, "not-found");
});

test("카드 고치기 — 화면이 본 때(base)가 다르면 changed · 남의 카드의 사람 번호는 bad-id", async () => {
  const edit = card({ card_id: W.card, address: "시험시 고친로 2",
    people: [{ id: W.p1, name: NAME + "가", gender: "여", phone: "010-0000-" + String(STAMP).slice(-4), target: true },
      { id: W.p2, name: NAME + "나", relation: "자녀", target: false }] });
  assert.equal((await call(G.token, "nfCardSave", { ...edit, base: "2000-01-01T00:00:00+00:00" })).body.error, "changed");
  const other = (await call(chief.token, "nfCardGet", { card_id: W.card2 })).body.people[0].id;
  assert.equal((await call(G.token, "nfCardSave", { ...edit, base: W.base, people: [{ ...edit.people[0], id: other }] })).body.error, "bad-id");
  const r = got(await call(G.token, "nfCardSave", { ...edit, base: W.base }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  const g = (await call(chief.token, "nfCardGet", { card_id: W.card })).body;
  assert.equal(g.card.address, "시험시 고친로 2");
  assert.equal(g.people.length, 2);
  assert.equal(g.people[0].id, W.p1);
  W.base = g.card.updatedAt;
});

test("사진 — 비공개 칸 · 영접팀이 올리고 총무·운영팀이 보고 섬김이는 못 본다", async () => {
  assert.equal((await call(G.token, "nfPhotoPut", { card_id: W.card, which: "card", data: Buffer.from("not a jpeg").toString("base64") })).body.error, "bad-photo");
  assert.equal((await call(L.token, "nfPhotoPut", { card_id: W.card, which: "card", data: JPEG })).body.error, "not-assigned");
  assert.equal((await call(G.token, "nfPhotoUrl", { card_id: W.card, which: "card" })).body.error, "no-photo");
  assert.equal(got(await call(G.token, "nfPhotoPut", { card_id: W.card, which: "card", data: JPEG })).body.ok, true);
  assert.equal((await call(H.token, "nfPhotoUrl", { card_id: W.card, which: "card" })).body.error, "not-assigned");
  const r = await call(L.token, "nfPhotoUrl", { card_id: W.card, which: "card" });
  assert.equal(r.body.ok, true);
  assert.ok((await fetch(r.body.url)).ok, "서명 주소로 열린다");
  // 서명 없이는 안 열린다
  assert.ok(!(await fetch(`${URL_}/storage/v1/object/public/newfamily/cards/${W.card}/card.jpg`)).ok);
  assert.ok(!(await fetch(`${URL_}/storage/v1/object/newfamily/cards/${W.card}/card.jpg`, { headers: { apikey: ANON, Authorization: "Bearer " + G.token } })).ok);
  assert.equal((await call(chief.token, "nfCardGet", { card_id: W.card })).body.card.hasCardPhoto, true);
});

test("배정 — 총무·운영팀만 · 수료 대상만 · 쉬는 중인 섬김이는 안 된다", async () => {
  assert.equal((await call(G.token, "nfAssign", { person_id: W.p1, helper_id: W.helper })).body.error, "not-assigned");
  assert.equal((await call(H.token, "nfAssign", { person_id: W.p1, helper_id: W.helper })).body.error, "not-assigned");
  assert.equal((await call(L.token, "nfAssign", { person_id: W.p2, helper_id: W.helper })).body.error, "not-target");
  assert.equal((await call(L.token, "nfAssign", { person_id: W.p1, helper_id: W.resting })).body.error, "resting");
  assert.equal((await call(L.token, "nfAssign", { person_id: W.p1, helper_id: ZERO })).body.error, "not-found");

  // 배정 전 — 섬김이의 명단은 비어 있다
  assert.equal(got(await call(H.token, "nfList")).body.people.length, 0);
  assert.equal(got(await call(L.token, "nfAssign", { person_id: W.p1, helper_id: W.helper })).body.ok, true);

  const mine = got(await call(H.token, "nfList")).body;
  assert.equal(mine.scope, "mine");
  assert.equal(mine.people.length, 1);
  assert.equal(mine.people[0].id, W.p1);
  assert.equal(mine.people[0].stage, "learning");
  assert.deepEqual(mine.helpers, []);
  for (const k of ["address", "birth", "tel", "baptized"]) assert.equal(k in mine.people[0], false, k);
  assert.deepEqual(mine.people[0].guides, [{ name: "시험인도", mok: "기쁨-25" }]);

  const all = got(await call(L.token, "nfList")).body;
  assert.equal(all.scope, "all");
  assert.ok(all.people.some((p) => p.id === W.p2));
  assert.equal(all.people.find((p) => p.id === W.p1).address, "시험시 고친로 2");
  assert.equal(all.helpers.find((h) => h.id === W.helper).load, 1);
  // 영접팀은 명단은 보지만 섬김이 목록은 받지 않는다
  assert.deepEqual(got(await call(G.token, "nfList")).body.helpers, []);
});

test("카드 고치기로 진행 중인 분을 지우지 못한다(has-progress)", async () => {
  const r = await call(G.token, "nfCardSave", card({ card_id: W.card, base: W.base,
    people: [{ id: W.p2, name: NAME + "나", target: false }] }));
  assert.equal(r.body.error, "has-progress");
});

test("수료 대상·멈춤 — 운영팀만", async () => {
  assert.equal((await call(L.token, "nfPersonSet", { person_id: W.p1, target: false })).body.error, "forbidden");
  const p = (await call(chief.token, "nfCardGet", { card_id: W.card })).body.people[0];
  assert.equal((await call(chief.token, "nfPersonSet", { person_id: W.p1, base: "x", stopped: true })).body.error, "changed");
  let r = got(await call(chief.token, "nfPersonSet", { person_id: W.p1, base: p.updatedAt, stopped: true, reason: "이사" }));
  assert.equal(r.body.ok, true);
  let now = (await call(chief.token, "nfCardGet", { card_id: W.card })).body.people[0];
  assert.equal(now.stage, "stopped");
  assert.equal(now.stopReason, "이사");
  assert.equal((await call(L.token, "nfAssign", { person_id: W.p1, helper_id: "" })).body.error, "stopped");
  r = await call(chief.token, "nfPersonSet", { person_id: W.p1, base: r.body.updatedAt, stopped: false });
  assert.equal(r.body.ok, true);
  now = (await call(chief.token, "nfCardGet", { card_id: W.card })).body.people[0];
  assert.equal(now.stage, "learning");
});

test("2단계 — 교육 줄 네 번 → 목사님 교육 → 보고서 보내기·돌려보내기 → 교구 배정", async () => {
  const stage = async () => (await call(chief.token, "nfCardGet", { card_id: W.card })).body.people[0].stage;
  const MEMO = "시험기록-" + STAMP;
  // 섬김이만 적는다 · 남의 분·수료 대상이 아닌 분에게는 못 적는다
  assert.equal((await call(L.token, "nfLessonSave", { person_id: W.p1, content: MEMO })).body.error, "not-assigned");
  assert.equal((await call(G.token, "nfLessonSave", { person_id: W.p1, content: MEMO })).body.error, "not-assigned");
  assert.equal((await call(H.token, "nfLessonSave", { person_id: W.p2, content: MEMO })).body.error, "not-assigned");
  assert.equal((await call(H.token, "nfLessonSave", { person_id: W.p1, met_on: kst(1) })).body.error, "bad-date");
  let r = got(await call(H.token, "nfLessonSave", { person_id: W.p1, content: MEMO, note: "비고" }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.equal(r.body.kind, "lesson");
  W.l1 = r.body.id;
  assert.equal((await call(H.token, "nfLessonSave", { person_id: W.p1 })).body.error, "same-day");   // 같은 날 두 번
  // 아직 네 번이 안 됐다 — 목사님 교육·보고서는 안 된다
  assert.equal((await call(chief.token, "nfPastorClass", { person_id: W.p1, on: true })).body.error, "not-ready");
  assert.equal((await call(H.token, "nfReportSend", { person_id: W.p1 })).body.error, "not-ready");
  for (const d of [-1, -2, -3]) assert.equal((await call(H.token, "nfLessonSave", { person_id: W.p1, met_on: kst(d), content: MEMO })).body.ok, true);
  assert.equal(await stage(), "wait_class");
  // 줄 고치기 — 같은 날로 옮기면 same-day
  assert.equal((await call(H.token, "nfLessonSave", { person_id: W.p1, id: W.l1, met_on: kst(-1) })).body.error, "same-day");
  assert.equal((await call(H.token, "nfLessonSave", { person_id: W.p1, id: W.l1, content: MEMO + " 고침" })).body.ok, true);

  // 줄의 내용은 그분의 섬김이·운영팀만(목사님 역할은 운영팀이 겸한다) — 총무·영접팀은 못 읽는다
  assert.equal((await call(L.token, "nfLessons", { person_id: W.p1 })).body.error, "not-assigned");
  assert.equal((await call(G.token, "nfLessons", { person_id: W.p1 })).body.error, "not-assigned");
  r = got(await call(H.token, "nfLessons", { person_id: W.p1 }));
  assert.equal(r.body.lessons.length, 4);
  assert.deepEqual(r.body.lessons.map((l) => l.metOn), [kst(-3), kst(-2), kst(-1), kst(0)]);
  assert.equal(r.body.lessons[3].writtenBy, "시험-섬김이");
  assert.equal(r.body.canWrite, true);
  assert.equal(r.body.canSend, false);
  assert.equal(r.body.canPastor, false);
  // 명단의 영접팀·총무 줄에는 몇 번째인지만
  const forLead = (await call(L.token, "nfList")).body.people.find((x) => x.id === W.p1);
  assert.equal(forLead.lessons, 4);
  assert.equal(JSON.stringify(forLead).includes(MEMO), false);

  // 목사님 교육 — 섬김이는 못 한다 · 참석 표시 뒤에는 줄을 지워 네 번 아래로 내리지 못한다
  assert.equal((await call(H.token, "nfPastorClass", { person_id: W.p1, on: true })).body.error, "not-assigned");
  assert.equal((await call(chief.token, "nfPastorClass", { person_id: W.p1, on: true, date: kst(1) })).body.error, "bad-date");
  assert.equal(got(await call(chief.token, "nfPastorClass", { person_id: W.p1, on: true })).body.ok, true);
  assert.equal(await stage(), "wait_report");
  assert.equal((await call(H.token, "nfLessonDelete", { person_id: W.p1, id: W.l1 })).body.error, "class-done");
  // 덧붙인 줄(다섯째)은 extra — 같은 날이어도 된다
  r = await call(H.token, "nfLessonSave", { person_id: W.p1, content: "덧붙임" });
  assert.equal(r.body.kind, "extra");

  // 보고서 보내기 → 잠김
  assert.equal((await call(L.token, "nfReportSend", { person_id: W.p1 })).body.error, "not-assigned");
  assert.equal(got(await call(H.token, "nfReportSend", { person_id: W.p1 })).body.ok, true);
  assert.equal(await stage(), "wait_parish");
  assert.equal((await call(H.token, "nfLessonSave", { person_id: W.p1, id: W.l1, content: "x" })).body.error, "sent");
  assert.equal((await call(H.token, "nfReportSend", { person_id: W.p1 })).body.error, "sent");
  assert.equal((await call(L.token, "nfAssign", { person_id: W.p1, helper_id: "" })).body.error, "sent");
  assert.equal((await call(chief.token, "nfPastorClass", { person_id: W.p1, on: false })).body.error, "sent");

  // 돌려보내기 — 한마디가 있어야 · 돌려보내면 섬김이가 다시 고친다
  assert.equal((await call(H.token, "nfReportReturn", { person_id: W.p1, note: "x" })).body.error, "not-assigned");
  assert.equal((await call(chief.token, "nfReportReturn", { person_id: W.p1, note: " " })).body.error, "no-note");
  assert.equal(got(await call(chief.token, "nfReportReturn", { person_id: W.p1, note: "한 줄만 더 적어 주세요" })).body.ok, true);
  assert.equal(await stage(), "wait_report");
  r = await call(H.token, "nfLessons", { person_id: W.p1 });
  assert.equal(r.body.reportReturn, "한 줄만 더 적어 주세요");
  assert.equal(r.body.canSend, true);
  assert.equal((await call(H.token, "nfLessonSave", { person_id: W.p1, id: W.l1, content: MEMO })).body.ok, true);
  assert.equal((await call(H.token, "nfReportSend", { person_id: W.p1 })).body.ok, true);

  // 교구 배정 — 목사님 일 · 목록(교인명부의 목장)에 있는 글자만
  assert.equal((await call(H.token, "nfParishSet", { person_id: W.p1, parish: "믿음-35" })).body.error, "not-assigned");
  assert.equal((await call(H.token, "nfParishList")).body.error, "not-assigned");
  assert.equal((await call(chief.token, "nfParishSet", { person_id: W.p1, parish: "아무데나" })).body.error, "bad-parish");
  assert.equal((await call(chief.token, "nfParishSet", { person_id: W.p2, parish: "믿음-35" })).body.ok, false);   // 수료 대상이 아닌 분(보고서가 없다)
  const list = got(await call(chief.token, "nfParishList")).body.list;
  assert.ok(Array.isArray(list));
  const parish = list[0] || "믿음-35";
  assert.equal(got(await call(chief.token, "nfParishSet", { person_id: W.p1, parish })).body.ok, true);
  const done = (await call(chief.token, "nfCardGet", { card_id: W.card })).body.people[0];
  assert.equal(done.stage, "registered");
  assert.equal(done.parish, parish);
  assert.equal((await call(chief.token, "nfReportReturn", { person_id: W.p1, note: "x" })).body.error, "has-parish");

  // 기록에는 교육 내용이 남지 않는다
  const audit = JSON.stringify(await rest(`admin_audit?select=action,detail&member_id=in.(${made.members.join(",")})&action=like.nf.*`));
  for (const k of ["nf.lesson", "nf.class", "nf.report", "nf.parish"]) assert.ok(audit.includes(k), k);
  assert.equal(audit.includes(MEMO), false);
  assert.equal(audit.includes("한 줄만 더"), false);
});

test("3단계 — 등록식: 후보에서 담기 → 참석 표시 → 확정(수료번호) → 엑셀 · 지우기", async () => {
  // 섬김(nfteam)은 등록식을 못 본다 — 문에서 막힌다
  assert.equal((await call(H.token, "nfCeremonyList")).body.error, "forbidden");
  assert.equal((await call(chief.token, "nfCeremonySave", { held_on: "2026-13-01" })).body.error, "bad-date");
  let r = got(await call(chief.token, "nfCeremonySave", { held_on: kst(7), note: "시험 등록식" }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  W.cer = r.body.id; made.ceremonies.push(W.cer);

  r = got(await call(chief.token, "nfCeremonyList"));
  assert.ok(r.body.candidates.some((p) => p.id === W.p1), "교구 배정이 끝난 분이 후보에");
  assert.ok(!r.body.candidates.some((p) => p.id === W.p2));
  const mine = r.body.ceremonies.find((c) => c.id === W.cer);
  assert.equal(mine.confirmed, false);
  assert.match(mine.nextNo, /^\d\d-\d{3,}$/);

  // 담기 — 수료 대상이 아닌 분(교구 없음)은 건너뛴다
  r = got(await call(chief.token, "nfCeremonyPeople", { ceremony_id: W.cer, add: [W.p1, W.p2] }));
  assert.equal(r.body.added, 1);
  assert.equal(r.body.skipped, 1);
  // 못 오심으로 두면 확정할 분이 없다 → empty · 화면이 본 수와 다르면 changed
  assert.equal((await call(chief.token, "nfCeremonyPeople", { ceremony_id: W.cer, attend: [{ id: W.p1, on: false }] })).body.ok, true);
  assert.equal((await call(chief.token, "nfCeremonyConfirm", { ceremony_id: W.cer, expect: 1 })).body.error, "changed");
  assert.equal((await call(chief.token, "nfCeremonyPeople", { ceremony_id: W.cer, attend: [{ id: W.p1, on: true }] })).body.ok, true);
  // 빼면 다시 후보로
  assert.equal((await call(chief.token, "nfCeremonyPeople", { ceremony_id: W.cer, remove: [W.p1] })).body.ok, true);
  assert.ok((await call(chief.token, "nfCeremonyList")).body.candidates.some((p) => p.id === W.p1));
  assert.equal((await call(chief.token, "nfCeremonyPeople", { ceremony_id: W.cer, add: [W.p1] })).body.added, 1);

  // 확정 — 수료번호가 붙고, 그해 다음 번호가 하나 늘어난다
  const y = Number(kst(7).slice(0, 4));
  const before = (await rest(`nf_settings?select=next_no&year=eq.${y}`))[0]?.next_no ?? 1;
  r = got(await call(chief.token, "nfCeremonyConfirm", { ceremony_id: W.cer, expect: 1 }));
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.equal(r.body.count, 1);
  const want = `${String(y % 100).padStart(2, "0")}-${String(before).padStart(3, "0")}`;
  assert.equal(r.body.first, want);
  assert.equal((await rest(`nf_settings?select=next_no&year=eq.${y}`))[0].next_no, before + 1);
  W.restoreNo = { y, before };
  const p = (await call(chief.token, "nfCardGet", { card_id: W.card })).body.people[0];
  assert.equal(p.stage, "done");
  assert.equal(p.certNo, want);
  // 확정 뒤에는 아무것도 못 바꾼다
  assert.equal((await call(chief.token, "nfCeremonyConfirm", { ceremony_id: W.cer, expect: 1 })).body.error, "already");
  assert.equal((await call(chief.token, "nfCeremonyPeople", { ceremony_id: W.cer, remove: [W.p1] })).body.error, "confirmed");
  assert.equal((await call(chief.token, "nfCeremonySave", { id: W.cer, delete: true })).body.error, "confirmed");
  assert.equal((await call(chief.token, "nfParishSet", { person_id: W.p1, parish: p.parish })).body.error, "confirmed");
  assert.equal((await call(chief.token, "nfPersonDelete", { person_id: W.p1, base: p.updatedAt })).body.error, "confirmed");

  // 엑셀 — 머리줄 + 한 줄 · 수료번호가 들어 있다
  r = await call(chief.token, "nfExport", { ceremony_id: W.cer });
  assert.equal(r.body.table.length, 2);
  assert.equal(r.body.table[0][1], "수료번호");
  assert.equal(r.body.table[1][1], want);
  assert.equal(r.body.table[1][10], p.parish);

  // 지우기 — 수료 대상이 아닌 분(p2)은 지워진다 · 카드에는 p1 이 남아 카드는 그대로
  const p2 = (await call(chief.token, "nfCardGet", { card_id: W.card })).body.people[1];
  assert.equal((await call(L.token, "nfPersonDelete", { person_id: W.p2, base: p2.updatedAt })).body.error, "forbidden");
  assert.equal((await call(chief.token, "nfPersonDelete", { person_id: W.p2, base: "x" })).body.error, "changed");
  r = await call(chief.token, "nfPersonDelete", { person_id: W.p2, base: p2.updatedAt });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.cardGone, false);
  assert.equal((await call(chief.token, "nfCardGet", { card_id: W.card })).body.people.length, 1);
  // 혼자인 카드(card2)의 한 분을 지우면 카드도 사라진다
  const solo = (await call(chief.token, "nfCardGet", { card_id: W.card2 })).body.people[0];
  r = await call(chief.token, "nfPersonDelete", { person_id: solo.id, base: solo.updatedAt });
  assert.equal(r.body.cardGone, true);
  assert.equal((await call(chief.token, "nfCardGet", { card_id: W.card2 })).body.error, "not-found");
});

test("4단계 — 통계: 운영팀·목사님만 · 숫자뿐", async () => {
  assert.equal((await call(H.token, "nfStats")).body.error, "not-assigned");
  assert.equal((await call(G.token, "nfStats")).body.error, "not-assigned");
  assert.equal((await call(chief.token, "nfStats", { basis: "x" })).body.error, "bad-input");
  const y = Number(kst(-3).slice(0, 4));
  for (const basis of ["card", "parish", "ceremony"]) {
    const r = await call(chief.token, "nfStats", { basis, year: basis === "ceremony" ? Number(kst(7).slice(0, 4)) : y });
    assert.equal(r.body.ok, true, basis + " " + JSON.stringify(r.body).slice(0, 200));
    assert.equal(r.body.basis, basis);
    assert.ok(r.body.years.reduce((n, x) => n + x.done, 0) >= 1, basis + " — 등록을 마친 분이 한 분은 있다");
    assert.ok(r.body.helpers.some((h) => h.name === "시험-섬김이"));
    const s = JSON.stringify(r.body);
    for (const bad of [NAME, "010-0000", "시험시", W.p1]) assert.equal(s.includes(bad), false, basis + " 에 " + bad);
  }
});

test("하는 일을 빼면 — nfteam 역할과 줄만 빠지고, 그 뒤로는 아무것도 못 한다", async () => {
  assert.equal(got(await call(chief.token, "nfStaffSet", { member_id: L.memberId, kinds: [] })).body.ok, true);
  assert.deepEqual(await rest(`admin_role_grants?select=role_id&member_id=eq.${L.memberId}`), []);
  assert.equal((await rest(`admin_members?select=status&id=eq.${L.memberId}`))[0].status, "active");   // 승인 상태는 그대로
  assert.equal((await call(L.token, "nfList")).body.error, "forbidden");
  // 섬김이를 빼도 섬김이 줄과 배정은 남는다(이어진 것만 풀린다)
  assert.equal((await call(chief.token, "nfStaffSet", { member_id: H.memberId, kinds: [] })).body.ok, true);
  const h = await rest(`nf_helpers?select=member_id&id=eq.${W.helper}`);
  assert.equal(h[0].member_id, null);
  assert.equal((await call(chief.token, "nfCardGet", { card_id: W.card })).body.people[0].helperId, W.helper);
});

test("응답·기록에 새는 칸이 없다", async () => {
  const s = JSON.stringify(seen);
  for (const bad of ["auth_user_id", "church_person_id", "created_by", "member_id", chief.uid, G.uid, H.uid]) assert.equal(s.includes(bad), false, bad);
  // 섬김이에게 간 응답에는 주소가 없다(위에서 칸으로 봤다) · 기록에는 새가족 이름·전화가 없다
  const ms = made.members.join(",");
  const audit = JSON.stringify(await rest(`admin_audit?select=action,target,detail&member_id=in.(${ms})&action=like.nf.*`));
  assert.ok(audit.includes("nf.card") && audit.includes("nf.assign") && audit.includes("nf.staff"));
  for (const bad of [NAME, "010-0000", "시험시"]) assert.equal(audit.includes(bad), false, "기록에 " + bad);
});
