// 「📮 정정 신청」 — 담당자 처리 액션을 개발 서버에 대고 본다(2026-10-01).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/history-requests.dev.test.mjs
// ⚠️ 공용 server.dev.test.mjs 는 여러 세션이 고친다 — PROBE 두 줄만 거기 두고 나머지는 여기.
// 시험 자료: 담당자(이메일 로그인 ca-test-hr-…) · 기록 한 줄(src_key ca-test-hr-<STAMP>-a) · 신청 넷(지어낸 user_id) — 끝나면 모두 지운다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { REQUEST_ADMIN_OUT_KEYS } from "../supabase/functions/church-admin/history-check.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const U1 = crypto.randomUUID(), U2 = crypto.randomUUID();
const st = { staff: null, memberId: null, rowId: null, q: {} };

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t }; } }
async function rest(path, method, data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method, headers: { ...svc, Prefer: "return=representation" },
    body: data ? JSON.stringify(data) : undefined });
  const x = await body(r);
  assert.ok(r.ok, path + " " + JSON.stringify(x));
  return x;
}
async function call(action, extra = {}) {
  const r = await fetch(FN, { method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + st.staff.token },
    body: JSON.stringify({ ...extra, action }) });
  return { status: r.status, body: await body(r) };
}
const listOf = async (status) => (await call("historyRequestList", { status })).body;
const mine = (list) => (list || []).filter((x) => Object.values(st.q).includes(x.id));
const reqRow = async (id) => (await rest(`ministry_history_requests?select=updated_at,status&id=eq.${id}`, "GET"))[0];

before(async () => {
  const email = `ca-test-hr-${STAMP}@example.test`, password = "T" + STAMP + "!x";
  const u = await body(await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }) }));
  assert.ok(u.id, "사용자 만들기 실패: " + JSON.stringify(u));
  const s = await body(await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  assert.ok(s.access_token, "로그인 실패");
  st.staff = { uid: u.id, token: s.access_token };
  const [m] = await rest("admin_members", "POST", { auth_user_id: u.id, name: "시험-정정", gu: "사랑", mok: "1", status: "active" });
  st.memberId = m.id;
  await rest("admin_role_grants", "POST", { member_id: m.id, role_id: "ministry" });
  const [h] = await rest("ministry_history", "POST", { src_key: `ca-test-hr-${STAMP}-a`, name: `ca-test-hr-${STAMP}-가`, year: 2025,
    committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사", mok: "", person_id: null, deleted_at: null });
  st.rowId = h.id;
  const base = { who_type: "교구", who_group: "기쁨", who_sub: "12", who_name: `ca-test-hr-${STAMP}-가`, detail: "", year: null, team_text: "", person_id: null };
  const rows = await rest("ministry_history_requests", "POST", [
    { ...base, user_id: U1, kind: "not_mine", history_id: h.id, detail: "제 기록이 아니에요" },
    { ...base, user_id: U1, kind: "missing", history_id: null, year: 2023, team_text: "찬양위원회 호산나찬양대" },
    { ...base, user_id: U2, kind: "find_me", history_id: null, who_sub: "99" },
  ]);
  [st.q.notMine, st.q.missing, st.q.find] = rows.map((r) => r.id);
});

after(async () => {
  const ids = Object.values(st.q).filter(Boolean);
  const errs = [];
  const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(label + " — " + (e?.message ?? e)); } };
  if (ids.length) await step("기록", () => rest(`admin_audit?action=eq.history.request&target=in.(${ids.join(",")})`, "DELETE"));
  await step("신청", () => rest(`ministry_history_requests?user_id=in.(${U1},${U2})`, "DELETE"));
  await step("사역 이력 줄", () => rest(`ministry_history?src_key=like.ca-test-hr-${STAMP}-*`, "DELETE"));
  if (st.memberId) {
    await step("담당자 역할", () => rest(`admin_role_grants?member_id=eq.${st.memberId}`, "DELETE"));
    await step("담당자", () => rest(`admin_members?id=eq.${st.memberId}`, "DELETE"));
  }
  if (st.staff?.uid) await step("로그인 계정", async () => {
    const r = await fetch(URL_ + "/auth/v1/admin/users/" + st.staff.uid, { method: "DELETE", headers: svc });
    if (!r.ok) throw new Error(r.status + " " + await r.text());
  });
  if (errs.length) throw new Error("정리 실패 " + errs.length + "건: " + errs.join(" / "));
});

test("목록 — 끝나지 않은 것 · 정해진 칸만 · user_id·person_id·uuid 없음 · 기록 줄 요약", async () => {
  const j = await listOf("open");
  assert.equal(j.ok, true);
  const got = mine(j.list);
  assert.equal(got.length, 3);
  for (const x of got) assert.deepEqual(Object.keys(x).sort(), REQUEST_ADMIN_OUT_KEYS);
  const nm = got.find((x) => x.id === st.q.notMine);
  assert.deepEqual(nm.row, { id: st.rowId, year: 2025, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사", deleted: false });
  assert.equal(nm.found, false);
  assert.equal(got.find((x) => x.id === st.q.find).row, null);
  assert.ok(!UUID_RE.test(JSON.stringify(got)), "uuid 가 샜다");
  assert.ok(typeof j.counts["신청"] === "number" && j.counts["신청"] >= 3);
  assert.equal((await listOf("nope")).error, "bad-status");
});

test("처리 — 확인 중 · 반영 안 함은 답 · 충돌", async () => {
  let cur = await reqRow(st.q.missing);
  const a = await call("historyRequestSet", { id: st.q.missing, status: "확인 중", expect: cur.updated_at });
  assert.equal(a.body.ok, true, JSON.stringify(a.body));
  assert.equal(a.body.row.status, "확인 중");
  assert.equal(a.body.row.handled_at, null);
  cur = await reqRow(st.q.missing);
  assert.equal((await call("historyRequestSet", { id: st.q.missing, status: "반영 안 함", answer: "", expect: cur.updated_at })).body.error, "need-answer");
  assert.equal((await call("historyRequestSet", { id: st.q.missing, status: "반영", expect: "2000-01-01T00:00:00+00:00" })).body.error, "conflict");
  const b = await call("historyRequestSet", { id: st.q.missing, status: "반영 안 함", answer: "2023 명단 원본에 없어 부서에 여쭤보고 있어요", expect: cur.updated_at });
  assert.equal(b.body.ok, true);
  assert.ok(b.body.row.handled_at);
});

test("「내 것이 아니에요」 반영은 본인 확인 · 기록에 남는다(이름·답 없이)", async () => {
  const cur = await reqRow(st.q.notMine);
  assert.equal((await call("historyRequestSet", { id: st.q.notMine, status: "반영", expect: cur.updated_at })).body.error, "need-verified");
  const r = await call("historyRequestSet", { id: st.q.notMine, status: "반영", answer: "확인 뒤 뺐어요", verified: true, expect: cur.updated_at });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  const [log] = await rest(`admin_audit?select=member_id,detail&action=eq.history.request&target=eq.${st.q.notMine}&order=id.desc&limit=1`, "GET");
  assert.equal(log.member_id, st.memberId);
  assert.deepEqual(log.detail, { id: st.q.notMine, kind: "not_mine", from: "신청", to: "반영", verified: true });
});

test("다시 열기 — 같은 줄에 열린 신청이 있으면 already-open", async () => {
  await rest("ministry_history_requests", "POST", { user_id: U1, kind: "wrong_team", history_id: st.rowId, who_type: "교구",
    who_group: "기쁨", who_sub: "12", who_name: `ca-test-hr-${STAMP}-가`, detail: "", year: null, team_text: "", person_id: null });
  const cur = await reqRow(st.q.notMine);
  assert.equal((await call("historyRequestSet", { id: st.q.notMine, status: "확인 중", expect: cur.updated_at })).body.error, "already-open");
  const done = mine((await listOf("done")).list).map((x) => x.id);
  assert.ok(done.includes(st.q.notMine) && done.includes(st.q.missing));
});
