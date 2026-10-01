// 「📮 정정 신청」 — 담당자 처리 액션을 개발 서버에 대고 본다(2026-10-01).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/history-requests.dev.test.mjs
// ⚠️ 공용 server.dev.test.mjs 는 여러 세션이 고친다 — PROBE 두 줄만 거기 두고 나머지는 여기.
// 시험 자료: 담당자(이메일 로그인 ca-test-hr-…) · 기록 한 줄(src_key ca-test-hr-<STAMP>-a) · 신청 넷(지어낸 user_id) — 끝나면 모두 지운다.
//   빠진 사역 고쳐서 반영·신청 삭제 시험(2026-10-02)은 제 자료(교인명부 990000092 · 신청 넷 · 줄 req:<id>)를 그 시험 안에서 만들고 지운다.
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

  // 2026-10-01: 반영 뒤 같은 상태·같은 답으로 다시 저장하면 쓰지도 기록하지도 않는다
  const countBefore = (await rest(`admin_audit?select=id&action=eq.history.request&target=eq.${st.q.notMine}`, "GET")).length;
  const cur2 = await reqRow(st.q.notMine);
  const same = await call("historyRequestSet", { id: st.q.notMine, status: "반영", answer: "확인 뒤 뺐어요", expect: cur2.updated_at });
  assert.deepEqual(same.body, { ok: true, same: true });
  const countAfterSame = (await rest(`admin_audit?select=id&action=eq.history.request&target=eq.${st.q.notMine}`, "GET")).length;
  assert.equal(countAfterSame, countBefore);

  // 답만 바꿔 verified 없이 저장 — 이미 반영된 줄이라 다시 묻지 않는다(기록 하나 더)
  const cur3 = await reqRow(st.q.notMine);
  const changed = await call("historyRequestSet", { id: st.q.notMine, status: "반영", answer: "확인 뒤 뺐어요(다시 확인)", expect: cur3.updated_at });
  assert.equal(changed.body.ok, true, JSON.stringify(changed.body));
  const countAfterChanged = (await rest(`admin_audit?select=id&action=eq.history.request&target=eq.${st.q.notMine}`, "GET")).length;
  assert.equal(countAfterChanged, countBefore + 1);
});

test("다시 열기 — 같은 줄에 열린 신청이 있으면 already-open", async () => {
  await rest("ministry_history_requests", "POST", { user_id: U1, kind: "wrong_team", history_id: st.rowId, who_type: "교구",
    who_group: "기쁨", who_sub: "12", who_name: `ca-test-hr-${STAMP}-가`, detail: "", year: null, team_text: "", person_id: null });
  const cur = await reqRow(st.q.notMine);
  assert.equal((await call("historyRequestSet", { id: st.q.notMine, status: "확인 중", expect: cur.updated_at })).body.error, "already-open");
  const done = mine((await listOf("done")).list).map((x) => x.id);
  assert.ok(done.includes(st.q.notMine) && done.includes(st.q.missing));
});

// ── 2026-10-02 — 빠진 사역을 고쳐서 반영 · 살아 있는 줄 고치기 · 손으로 뺀 줄은 되살리지 않는다 · 신청 삭제 ──
//   교적을 찾은 분의 신청이어야 줄이 들어간다(no-person) — 신청 줄을 REST 로 바로 넣고 person_id 는 고정 교인ID 990000092(교인명부 시험 줄 ·
//   server.dev 의 정정 신청 시험 990000091 과 겹치지 않게). 앱 계정 자리는 지어낸 uuid · 끝나면 신청·줄·기록·명부 줄을 모두 지운다.
const HX = { pid: 990000092, uid: crypto.randomUUID(), name: `ca-test-hr-${STAMP}-나` };
const hxRows = (id) => rest(`ministry_history?select=id,year,committee,team,role_title,position,name,mok,person_id,link_how,deleted_at,updated_at&src_key=eq.req:${id}`, "GET");
const hxReq = async (id) => (await rest(`ministry_history_requests?select=id,updated_at,status&id=eq.${id}`, "GET"))[0];
const hxFind = async (id) => (await listOf("all")).list.find((x) => x.id === id);
const hxMake = async (o) => (await rest("ministry_history_requests", "POST", { user_id: HX.uid, person_id: HX.pid, kind: "missing", history_id: null,
  detail: "", who_type: "교구", who_group: "기쁨", who_sub: "99", who_name: HX.name, ...o }))[0].id;

test("빠진 사역 — 고친 내용으로 반영(직분은 교적 · 목장 99 는 교구만 · 신청 글은 그대로) · 줄 고치기 · 손으로 뺀 줄은 되살리지 않는다 · 신청 삭제는 줄을 빼 둔다", async () => {
  const reqIds = [], rowIds = new Set();
  try {
    await rest(`church_people?person_id=eq.${HX.pid}`, "DELETE");     // 지난번 찌꺼기(고정 ID)
    await rest("church_people", "POST", { person_id: HX.pid, name: HX.name, name_key: HX.name, kind2: "장년",
      mok1: "기쁨", mok3: "기쁨-99목장", position: "권사" });
    const reqId = await hxMake({ year: 2003, team_text: "찬양위원회 시온성가대 집사" });
    reqIds.push(reqId);

    // ① 목록 — 줄이 없으니 draft(성도님 글에서 읽음 · 끝의 직분 낱말은 뗀다) · 정해진 칸만
    let q = await hxFind(reqId);
    assert.deepEqual(Object.keys(q).sort(), REQUEST_ADMIN_OUT_KEYS);
    assert.deepEqual(q.line, { state: "draft", year: 2003, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "", expect: "" });
    assert.ok(!JSON.stringify(q).includes(String(HX.pid)), "목록에 교인ID 가 실렸다");

    // ② 틀린 내용은 아무것도 쓰지 않는다 — 상태도 그대로 · 줄도 없음
    let cur = await hxReq(reqId);
    assert.equal((await call("historyRequestSet", { id: reqId, status: "반영", answer: "", expect: cur.updated_at,
      line: { year: 2003, committee: " ", team: "", role_title: "", expect: "" } })).body.error, "need-team");
    assert.equal((await call("historyRequestSet", { id: reqId, status: "반영", answer: "", expect: cur.updated_at,
      line: { year: 1900, committee: "", team: "가", role_title: "", expect: "" } })).body.error, "bad-year");
    assert.equal((await hxReq(reqId)).status, "신청");
    assert.equal((await hxRows(reqId)).length, 0);

    // ③ 고친 내용으로 반영 — 연도·부서·팀·직책은 고친 대로 · 직분은 교적(글의 「집사」가 아니라 권사) · 목장 99 는 교구만 · 신청 글은 그대로
    const a = (await call("historyRequestSet", { id: reqId, status: "반영", answer: "", expect: cur.updated_at,
      line: { year: "2004", committee: "교육위원회", team: "유년부", role_title: "부장", expect: "" } })).body;
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.deepEqual([a.history.created, a.history.year], [true, 2004], JSON.stringify(a));
    let rows = await hxRows(reqId);
    rowIds.add(rows[0].id);
    assert.deepEqual(
      [rows.length, rows[0].year, rows[0].committee, rows[0].team, rows[0].role_title, rows[0].position, rows[0].mok, rows[0].person_id, rows[0].link_how],
      [1, 2004, "교육위원회", "유년부", "부장", "권사", "기쁨", HX.pid, "manual"]);
    const [kept] = await rest(`ministry_history_requests?select=year,team_text&id=eq.${reqId}`, "GET");
    assert.deepEqual(kept, { year: 2003, team_text: "찬양위원회 시온성가대 집사" }, "성도님 신청 글이 바뀌었다");
    const [addLog] = await rest(`admin_audit?select=member_id,detail&action=eq.history.add&target=eq.${rows[0].id}&order=id.desc&limit=1`, "GET");
    assert.equal(addLog.member_id, st.memberId);
    assert.deepEqual(addLog.detail, { year: 2004, from: "request", request: reqId });

    // ④ 목록 — in · 교적 직분 · 그 줄의 updated_at 이 expect
    q = await hxFind(reqId);
    assert.deepEqual([q.line.state, q.line.year, q.line.team, q.line.position, q.line.expect],
      ["in", 2004, "유년부", "권사", rows[0].updated_at]);

    // ⑤ 반영에 머문 채 고치기 — 줄만 고친다(same + edited · history.edit · 신청 줄은 그대로) · 낡은 expect 는 line-conflict(쓰지 않는다)
    cur = await hxReq(reqId);
    const e = (await call("historyRequestSet", { id: reqId, status: "반영", answer: "", expect: cur.updated_at,
      line: { year: 2004, committee: "교육위원회", team: "초등부", role_title: "부장", expect: q.line.expect } })).body;
    assert.deepEqual([e.ok, e.same, e.history.edited, e.history.fields], [true, true, true, ["team"]], JSON.stringify(e));
    assert.equal((await hxReq(reqId)).updated_at, cur.updated_at, "줄만 고쳤는데 신청 줄이 바뀌었다");
    rows = await hxRows(reqId);
    assert.equal(rows[0].team, "초등부");
    const [editLog] = await rest(`admin_audit?select=detail&action=eq.history.edit&target=eq.${rows[0].id}&order=id.desc&limit=1`, "GET");
    assert.deepEqual(editLog.detail, { year: 2004, fields: ["team"], from: "request", request: reqId });
    const stale = (await call("historyRequestSet", { id: reqId, status: "반영", answer: "", expect: cur.updated_at,
      line: { year: 2004, committee: "교육위원회", team: "유치부", role_title: "부장", expect: q.line.expect } })).body;
    assert.equal(stale.history?.error, "line-conflict", JSON.stringify(stale));
    assert.equal((await hxRows(reqId))[0].team, "초등부");

    // ⑥ 「📜 사역 이력」에서 손으로 뺀다 → 답만 고쳐 저장(반영 그대로) — 되살리지 않는다(history-removed)
    const live = (await hxRows(reqId))[0];
    const hand = (await call("historyRowDelete", { id: live.id, expect: live.updated_at })).body;
    assert.equal(hand.ok, true, JSON.stringify(hand));
    cur = await hxReq(reqId);
    const ans = (await call("historyRequestSet", { id: reqId, status: "반영", answer: "확인했어요", expect: cur.updated_at })).body;
    assert.equal(ans.ok, true, JSON.stringify(ans));
    assert.equal(ans.history?.error, "history-removed", JSON.stringify(ans));
    assert.ok((await hxRows(reqId))[0].deleted_at, "손으로 뺀 줄이 답만 고쳤는데 되살아났다");
    // 확인 중 → 반영 으로 다시 들어와도 — 마지막 빼기가 손이라 되살리지 않는다
    cur = await hxReq(reqId);
    assert.equal((await call("historyRequestSet", { id: reqId, status: "확인 중", answer: "확인했어요", expect: cur.updated_at })).body.ok, true);
    cur = await hxReq(reqId);
    const back = (await call("historyRequestSet", { id: reqId, status: "반영", answer: "확인했어요", expect: cur.updated_at })).body;
    assert.equal(back.history?.error, "history-removed", JSON.stringify(back));
    assert.ok((await hxRows(reqId))[0].deleted_at, "손으로 뺀 줄이 되살아났다");

    // ⑦ 신청 삭제 — 신청은 사라지고 · 「반영」으로 더한 살아 있는 줄은 빼 둔다 · 기록은 번호·종류·상태만
    const req2 = await hxMake({ year: 2005, team_text: "새가족부 · 운영" });
    reqIds.push(req2);
    cur = await hxReq(req2);
    const a2 = (await call("historyRequestSet", { id: req2, status: "반영", answer: "", expect: cur.updated_at })).body;
    assert.equal(a2.history?.created, true, JSON.stringify(a2));
    const r2 = (await hxRows(req2))[0];
    rowIds.add(r2.id);
    assert.deepEqual([r2.committee, r2.team, r2.position], ["새가족부", "운영", "권사"]);
    cur = await hxReq(req2);
    assert.equal((await call("historyRequestDelete", { id: req2, expect: "2000-01-01T00:00:00+00:00" })).body.error, "conflict");
    assert.ok(await hxReq(req2), "충돌인데 신청이 지워졌다");
    const d = (await call("historyRequestDelete", { id: req2, expect: cur.updated_at })).body;
    assert.deepEqual(d, { ok: true, history: { removed: true, id: r2.id, year: 2005 } });
    assert.equal(await hxReq(req2), undefined, "신청이 남았다");
    assert.ok(!(await listOf("all")).list.some((x) => x.id === req2), "지운 신청이 목록에 보인다");
    assert.ok((await hxRows(req2))[0].deleted_at, "신청을 지웠는데 그 줄이 살아 있다");
    const [dLog] = await rest(`admin_audit?select=member_id,detail&action=eq.history.request.delete&target=eq.${req2}&order=id.desc&limit=1`, "GET");
    assert.equal(dLog.member_id, st.memberId);
    assert.deepEqual(dLog.detail, { id: req2, kind: "missing", status: "반영" });
    const [rLog] = await rest(`admin_audit?select=detail&action=eq.history.delete&target=eq.${r2.id}&order=id.desc&limit=1`, "GET");
    assert.deepEqual(rLog.detail, { year: 2005, from: "request", request: req2, why: "request-deleted" });
    assert.equal((await call("historyRequestDelete", { id: req2, expect: cur.updated_at })).body.error, "not-found");
    assert.equal((await call("historyRequestDelete", { id: reqId, expect: "" })).body.error, "conflict");   // 본 것 없이 지우지 않는다

    // ⑧ 되살리다 실패한 뒤 「반영」 한 번 더 — 상태는 「반영」인데 줄은 정정 신청 쪽이 빼 둔 채(확인 중→반영 에서 되살리기 쓰기가
    //   DB 오류로 실패한 자리와 같다 · 그 자리는 REST 로 상태만 「반영」으로 바꿔 만든다) → 반영에 머문 채 다시 누르면 되살린다(2026-10-02)
    const req3 = await hxMake({ year: 2006, team_text: "봉사위원회 주차팀" });
    reqIds.push(req3);
    cur = await hxReq(req3);
    const a3 = (await call("historyRequestSet", { id: req3, status: "반영", answer: "", expect: cur.updated_at })).body;
    assert.equal(a3.history?.created, true, JSON.stringify(a3));
    const r3 = (await hxRows(req3))[0];
    rowIds.add(r3.id);
    cur = await hxReq(req3);
    const off3 = (await call("historyRequestSet", { id: req3, status: "확인 중", answer: "", expect: cur.updated_at })).body;
    assert.equal(off3.history?.removed, true, JSON.stringify(off3));
    await rest(`ministry_history_requests?id=eq.${req3}`, "PATCH", { status: "반영" });
    cur = await hxReq(req3);
    const again = (await call("historyRequestSet", { id: req3, status: "반영", answer: "", expect: cur.updated_at })).body;
    assert.deepEqual(again, { ok: true, same: true, history: { id: r3.id, year: 2006, restored: true } });
    assert.equal((await hxRows(req3))[0].deleted_at, null, "정정 신청 쪽이 뺀 줄인데 반영 한 번 더로 되살아나지 않았다");
    const [reLog] = await rest(`admin_audit?select=detail&action=eq.history.add&target=eq.${r3.id}&order=id.desc&limit=1`, "GET");
    assert.deepEqual(reLog.detail, { year: 2006, from: "request", request: req3, restored: true });

    // ⑨ 두 칸 신청(committee_text 가 글자 · 2026-10-02 · SQL 009) — 목록에 committee_text · draft 는 칸 그대로(나누지 않는다 · 끝의 「집사」도 팀에 둔다)
    //   · 고친 내용 없이 반영하면 칸 그대로 들어간다 · 신청 글은 그대로
    const req4 = await hxMake({ year: 2007, committee_text: "봉사위원회", team_text: "주차팀 집사" });
    reqIds.push(req4);
    q = await hxFind(req4);
    assert.deepEqual(Object.keys(q).sort(), REQUEST_ADMIN_OUT_KEYS);
    assert.deepEqual([q.committee_text, q.team_text], ["봉사위원회", "주차팀 집사"]);
    assert.deepEqual(q.line, { state: "draft", year: 2007, committee: "봉사위원회", team: "주차팀 집사", role_title: "", position: "", expect: "" });
    assert.equal((await hxFind(reqId)).committee_text, null, "옛 한 칸 신청의 committee_text 는 null");
    cur = await hxReq(req4);
    const a4 = (await call("historyRequestSet", { id: req4, status: "반영", answer: "", expect: cur.updated_at })).body;
    assert.equal(a4.history?.created, true, JSON.stringify(a4));
    assert.equal(a4.row.committee_text, "봉사위원회");
    const r4 = (await hxRows(req4))[0];
    rowIds.add(r4.id);
    assert.deepEqual([r4.year, r4.committee, r4.team, r4.position], [2007, "봉사위원회", "주차팀 집사", "권사"]);
    const [kept4] = await rest(`ministry_history_requests?select=year,committee_text,team_text&id=eq.${req4}`, "GET");
    assert.deepEqual(kept4, { year: 2007, committee_text: "봉사위원회", team_text: "주차팀 집사" }, "성도님 신청 글이 바뀌었다");

    // 기록에 이름·교인ID 가 실리지 않는다
    const logs = await rest(`admin_audit?select=detail&target=in.(${[...reqIds, ...rowIds].join(",")})&action=in.(history.add,history.edit,history.delete,history.request,history.request.delete)`, "GET");
    assert.ok(logs.length >= 6, JSON.stringify(logs));
    assert.ok(!JSON.stringify(logs).includes(HX.name) && !JSON.stringify(logs).includes(String(HX.pid)), "기록에 이름·교인ID 가 실렸다");
  } finally {
    const errs = [];
    const step = async (label, fn) => { try { await fn(); } catch (err) { errs.push(label + " — " + (err?.message ?? err)); } };
    for (const id of reqIds) await step("이력 줄 " + id, () => rest(`ministry_history?src_key=eq.req:${id}`, "DELETE"));
    if (reqIds.length) await step("신청 기록", () => rest(`admin_audit?action=in.(history.request,history.request.delete)&target=in.(${reqIds.join(",")})`, "DELETE"));
    if (rowIds.size) await step("이력 기록", () => rest(`admin_audit?action=in.(history.add,history.edit,history.delete)&target=in.(${[...rowIds].join(",")})`, "DELETE"));
    await step("신청", () => rest(`ministry_history_requests?user_id=eq.${HX.uid}`, "DELETE"));
    await step("교인명부", () => rest(`church_people?person_id=eq.${HX.pid}`, "DELETE"));
    if (errs.length) throw new Error("정리 실패 " + errs.length + "건: " + errs.join(" / "));
  }
});
