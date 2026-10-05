// 수료(교육신청 3단계 · 2026-10-05) — 개발 서버에 대고 도는 시험. 네트워크와 개발 비밀 키가 필요해 preflight 에는 넣지 않는다(이름의 .dev.).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/certs.dev.test.mjs
// 하는 일: 교육 총괄 한 분 · 교육 담당 M(강좌 A 의 manager) · 교육 담당 D(강좌 B 의 manager) · 강사 T(강좌 A 의 teacher)
//   (이메일 로그인 ca-test-cert-…@example.test)와 시험 강좌 A·B 를 만들고 —
//   확인 체크·후보 → 수료 확정(이름 가나다 차례로 번호) → 다시 확정(같은 번호) → 취소(번호 남음) → 되살림(같은 번호) → 인쇄 자료 ·
//   (검토 반영) 수료 취소 뒤 신청 취소는 된다 — 번호는 그 줄에 남고 새 확정은 그 번호를 받지 않는다 · 살아 있는 수료는 has-cert ·
//   강사는 문에서 forbidden · 다른 강좌 교육 담당은 not-assigned(아무것도 안 바뀜) · 수료증 설정은 총괄만 · 바뀐 기록(이름·번호·이미지 없음)을 본다.
//   끝나면(실패해도) 출석 → 신청 → 회차 → 담당 줄 → 강좌 → 그 네 분의 기록·역할·담당자 → auth 사용자를 지우고 0 줄인지 보며,
//   수료증 설정 한 줄과 그 해 번호 차례(edu_cert_seq)를 시작 전 값으로 되돌린다(개발에서만 — 운영 차례는 늘기만 한다).
// ⚠️ 키·비밀번호를 찍지 않는다. 개발(ktpwthwqzgcqcrmsafdo)에만 돈다. v2 supabase/edu.sql 3단계가 개발에 들어가 있어야 한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eduCertNoValid, eduAttendRate } from "../supabase/functions/church-admin/edu-rules.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const TAG = "ca-test-cert-";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const PNG1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

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
const tail = (no) => Number(String(no).split("-")[2]);

const made = { users: [], members: [], courses: [] };
const chief = {}, M = {}, D = {}, T = {};
const W = {};   // 강좌 A·B · 회차 s(A) · 신청 e[0..3](A — 다·가·나·라) · eB
const SNAP = { settings: null, year: Number(kst(0).slice(0, 4)), seq: undefined };

// 지난번이 도중에 멈춰 남긴 시험 강좌(한 시간 넘은 것만 — 다른 세션이 돌리는 중인 것은 건드리지 않는다)
async function sweepCourses(ids) {
  if (!ids.length) return;
  const cs = ids.join(",");
  const ss = (await rest(`edu_sessions?select=id&course_id=in.(${cs})`)).map((s) => s.id);
  if (ss.length) await rest(`edu_attendance?session_id=in.(${ss.join(",")})`, "DELETE");
  await rest(`edu_enrollments?course_id=in.(${cs})`, "DELETE");
  await rest(`edu_sessions?course_id=in.(${cs})`, "DELETE");
  await rest(`edu_course_staff?course_id=in.(${cs})`, "DELETE");
  await rest(`edu_courses?id=in.(${cs})`, "DELETE");
}

before(async () => {
  const stale = new Date(Date.now() - 3600 * 1000).toISOString();
  await sweepCourses((await rest(`edu_courses?select=id&title=like.${TAG}*&created_at=lt.${stale}`)).map((c) => c.id));
  // 되돌릴 값 — 수료증 설정 한 줄 · 그 해 번호 차례(없으면 null)
  [SNAP.settings] = await rest("edu_cert_settings?select=issuer,body,seal&id=eq.1");
  assert.ok(SNAP.settings, "edu_cert_settings 한 줄이 없다 — v2 edu.sql 3단계를 개발에 먼저");
  const [sq] = await rest(`edu_cert_seq?select=last&year=eq.${SNAP.year}`);
  SNAP.seq = sq ? sq.last : null;
  Object.assign(chief, await makeUser("chief")); await makeMember(chief, "시험-교육총괄", ["education"]);
  Object.assign(M, await makeUser("m"));         await makeMember(M, "시험-교육담당A", ["educourse"]);
  Object.assign(D, await makeUser("d"));         await makeMember(D, "시험-교육담당B", ["educourse"]);
  Object.assign(T, await makeUser("t"));         await makeMember(T, "시험-강사", ["teacher"]);
  const mk = async (tag, extra = {}) => {
    const r = await call(chief.token, "eduCourseSave", { course: { title: `${TAG}${tag}-${STAMP}`, kind: "regular", term: "시험", status: "running",
      mode: "auto", attend_pct: 80, ...extra } });
    assert.equal(r.body.ok, true, "강좌 " + JSON.stringify(r.body));
    made.courses.push(r.body.id);
    return r.body.id;
  };
  W.A = await mk("A", { check_label: "과제" }); W.B = await mk("B");
  let r = await call(chief.token, "eduSessionsSave", { course_id: W.A, sessions: [{ no: 1, on_date: kst(-7) }, { no: 2, on_date: kst(0) }] });
  assert.deepEqual(r.body, { ok: true, count: 2 });
  r = await call(chief.token, "eduSessionsSave", { course_id: W.B, sessions: [{ no: 1, on_date: kst(0) }] });
  assert.equal(r.body.ok, true);
  W.s = (await call(chief.token, "eduSessions", { course_id: W.A })).body.sessions.map((s) => s.id);
  for (const [course, ids, kind] of [[W.A, [M.memberId], "manager"], [W.B, [D.memberId], "manager"], [W.A, [T.memberId], "teacher"]]) {
    r = await call(chief.token, "eduStaffSet", { course_id: course, member_ids: ids, kind });
    assert.equal(r.body.ok, true, "담당 " + JSON.stringify(r.body));
  }
  const enroll = async (course, k) => {
    const x = await call(chief.token, "eduEnrollAdd", { course_id: course, ident: { name: `${TAG}${STAMP}-${k}`, who_type: "새가족", group_name: "시험", sub_name: "1" } });
    assert.equal(x.body.status, "confirmed", "신청 " + JSON.stringify(x.body));
    return x.body.id;
  };
  // 신청 차례(id)와 이름 가나다 차례가 다르게 — 다·가·나·라
  W.e = [await enroll(W.A, "다"), await enroll(W.A, "가"), await enroll(W.A, "나"), await enroll(W.A, "라")];
  W.eB = await enroll(W.B, "마");
  // 출석: 다·가 = 출석 둘(100%) · 나 = 출석·결석(50%) · 라 = 체크 없음(null)
  for (const [eid, a, b] of [[W.e[0], "present", "present"], [W.e[1], "present", "late"], [W.e[2], "present", "absent"]]) {
    for (const [sid, st] of [[W.s[0], a], [W.s[1], b]]) {
      const x = await call(chief.token, "eduAttendSet", { session_id: sid, enrollment_id: eid, state: st });
      assert.equal(x.body.ok, true, "출석 " + JSON.stringify(x.body));
    }
  }
});

after(async () => {
  const errs = [];
  const step = async (name, fn) => { try { await fn(); } catch (e) { errs.push(name + ": " + String(e?.message).slice(0, 160)); } };
  await step("시험 강좌", () => sweepCourses(made.courses));
  await step("수료증 설정 되돌리기", () => SNAP.settings && rest("edu_cert_settings?id=eq.1", "PATCH", { ...SNAP.settings, updated_at: new Date().toISOString() }));
  await step("번호 차례 되돌리기", () => SNAP.seq === undefined ? null
    : SNAP.seq === null ? rest(`edu_cert_seq?year=eq.${SNAP.year}`, "DELETE") : rest(`edu_cert_seq?year=eq.${SNAP.year}`, "PATCH", { last: SNAP.seq }));
  if (made.members.length) {
    const ms = made.members.join(",");
    await step("기록(시험 네 분 것)", () => rest(`admin_audit?member_id=in.(${ms})`, "DELETE"));
    await step("역할", () => rest(`admin_role_grants?member_id=in.(${ms})`, "DELETE"));
    await step("담당자", () => rest(`admin_members?id=in.(${ms})`, "DELETE"));
  }
  for (const uid of made.users) await step("auth 사용자", async () => {
    const x = await fetch(URL_ + "/auth/v1/admin/users/" + uid, { method: "DELETE", headers: svc });
    assert.ok(x.ok, "auth delete " + x.status);
  });
  await step("0 줄·되돌림 확인", async () => {
    if (made.courses.length) {
      const cs = made.courses.join(",");
      for (const [t, col] of [["edu_courses", "id"], ["edu_sessions", "course_id"], ["edu_enrollments", "course_id"], ["edu_course_staff", "course_id"]]) {
        assert.equal((await rest(`${t}?select=${col}&${col}=in.(${cs})`)).length, 0, t);
      }
    }
    assert.equal((await rest(`edu_enrollments?select=id&name=like.${TAG}${STAMP}*`)).length, 0, "신청");
    if (made.members.length) {
      const ms = made.members.join(",");
      for (const t of ["admin_members?select=id&id", "admin_role_grants?select=member_id&member_id", "admin_audit?select=id&member_id"]) {
        assert.equal((await rest(`${t}=in.(${ms})`)).length, 0, t);
      }
    }
    for (const uid of made.users) assert.equal((await fetch(URL_ + "/auth/v1/admin/users/" + uid, { headers: svc })).status, 404, "auth 사용자");
    if (SNAP.settings) assert.deepEqual((await rest("edu_cert_settings?select=issuer,body,seal&id=eq.1"))[0], SNAP.settings, "수료증 설정");
    if (SNAP.seq !== undefined) {
      const [sq] = await rest(`edu_cert_seq?select=last&year=eq.${SNAP.year}`);
      assert.equal(sq ? sq.last : null, SNAP.seq, "번호 차례");
    }
  });
  if (errs.length) throw new Error("정리 실패 " + errs.length + "건: " + errs.join(" / "));
});

test("확인 체크·후보 — 확인 항목(과제)이 있으면 체크해야 후보 · 출석률(eduAttendRate) 기준 80 · 교육 담당 M(manager 줄)도 체크한다", async () => {
  const { A, e } = W;
  let r = await call(chief.token, "eduCertList", { course_id: A });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.deepEqual([r.body.course.attendPct, r.body.course.checkLabel, r.body.course.from, r.body.course.to], [80, "과제", kst(-7), kst(0)]);
  assert.deepEqual(r.body.counts, { total: 4, candidates: 0, completed: 0, revoked: 0 }, "체크 전에는 후보 없음");
  const by = Object.fromEntries(r.body.people.map((p) => [p.id, p]));
  assert.deepEqual([e[0], e[1], e[2], e[3]].map((id) => by[id].attend.pct), [100, 100, 50, null]);
  assert.equal(by[e[2]].attend.pct, eduAttendRate({ present: 1, absent: 1 }).pct);
  assert.deepEqual(r.body.people.map((p) => p.name.slice(-1)), ["가", "나", "다", "라"], "이름 가나다");
  for (const id of [e[0], e[1], e[2]]) assert.deepEqual((await call(M.token, "eduCheckSet", { enrollment_id: id, done: true })).body, { ok: true, done: true });
  assert.deepEqual((await call(M.token, "eduCheckSet", { enrollment_id: e[0], done: "yes" })).body, { ok: false, error: "bad-done" });
  r = await call(M.token, "eduCertList", { course_id: A });
  const c = Object.fromEntries(r.body.people.map((p) => [p.id, p.candidate]));
  assert.deepEqual([c[e[0]], c[e[1]], c[e[2]], c[e[3]]], [true, true, false, false]);
  assert.equal(r.body.counts.candidates, 2);
  assert.ok(!/user_id|ident_key|staff_note/.test(JSON.stringify(r.body)));
});

test("수료 확정 — 이름 가나다 차례로 번호(보낸 차례와 상관없이) · 다시 확정은 같은 번호 · 취소(번호 남음) · 되살림(같은 번호) · 확정 아님·번호 줄 상태 바꾸기 거절", async () => {
  const { A, e } = W;
  let r = await call(M.token, "eduCertIssue", { course_id: A, enrollment_ids: [e[0], e[1]] });    // 보낸 차례 다 → 가
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.deepEqual(r.body.issued.map((x) => [x.id, x.how]), [[e[1], "new"], [e[0], "new"]], "가 → 다");
  const [noGa, noDa] = [r.body.issued[0].certNo, r.body.issued[1].certNo];
  assert.ok(eduCertNoValid(noGa) && eduCertNoValid(noDa), noGa + " " + noDa);
  assert.ok(noGa.startsWith(`고척-${SNAP.year}-`));
  assert.equal(tail(noDa), tail(noGa) + 1, "이어서");
  assert.equal(tail(noGa), (SNAP.seq ?? 0) + 1, "그 해 차례 다음");
  // 다시 확정 — 같은 번호(already) · 차례를 먹지 않는다
  r = await call(chief.token, "eduCertIssue", { course_id: A, enrollment_ids: [e[0]] });
  assert.deepEqual(r.body, { ok: true, issued: [{ id: e[0], certNo: noDa, how: "already" }] });
  // 취소 — 번호 남음 · 목록에 revoked · 후보 수에서 빠짐 · 인쇄에서 빠짐
  r = await call(M.token, "eduCertRevoke", { enrollment_id: e[0] });
  assert.deepEqual(r.body, { ok: true, certNo: noDa });
  assert.deepEqual((await call(M.token, "eduCertRevoke", { enrollment_id: e[0] })).body, { ok: true, already: true, certNo: noDa });
  let l = await call(chief.token, "eduCertList", { course_id: A });
  const da = l.body.people.find((p) => p.id === e[0]);
  assert.deepEqual([da.completed, da.revoked, da.certNo, da.candidate], [false, true, noDa, true]);
  assert.deepEqual(l.body.counts, { total: 4, candidates: 0, completed: 1, revoked: 1 }, "취소한 분은 「후보 N분」에 안 든다");
  let p = await call(M.token, "eduCertPrint", { course_id: A });
  assert.deepEqual(p.body.people.map((x) => [x.id, x.certNo]), [[e[1], noGa]]);
  // 되살림 — 같은 번호
  r = await call(M.token, "eduCertIssue", { course_id: A, enrollment_ids: [e[0]] });
  assert.deepEqual(r.body, { ok: true, issued: [{ id: e[0], certNo: noDa, how: "restored" }] });
  const [sq] = await rest(`edu_cert_seq?select=last&year=eq.${SNAP.year}`);
  assert.equal(sq.last, tail(noDa), "되살림·다시 확정이 차례를 먹지 않았다");
  p = await call(M.token, "eduCertPrint", { course_id: A });
  assert.deepEqual(p.body.people.map((x) => [x.id, x.certNo, x.issuedOn]), [[e[1], noGa, kst(0)], [e[0], noDa, kst(0)]]);
  assert.deepEqual(p.body.course, { id: A, title: `${TAG}A-${STAMP}`, term: "시험", from: kst(-7), to: kst(0) });
  assert.ok(!p.body.body.includes("{과정}") && p.body.body.includes(`${TAG}A-${STAMP}`), "문안의 {과정}");
  assert.ok(!/user_id|ident_key/.test(JSON.stringify(p.body)));
  // 확정 아님 — 통째로 거절(ids) · 살아 있는 수료 줄은 상태를 못 바꾼다(has-cert)
  assert.equal((await call(chief.token, "eduEnrollSet", { id: e[3], op: "cancel" })).body.ok, true);
  r = await call(chief.token, "eduCertIssue", { course_id: A, enrollment_ids: [e[2], e[3]] });
  assert.deepEqual(r.body, { ok: false, error: "not-confirmed", ids: [e[3]] });
  assert.equal((await rest(`edu_enrollments?select=completed,cert_no&id=eq.${e[2]}`))[0].cert_no, null, "거절했는데 썼다");
  assert.deepEqual((await call(chief.token, "eduEnrollSet", { id: e[1], op: "cancel" })).body, { ok: false, error: "has-cert" });
  assert.deepEqual((await call(chief.token, "eduEnrollSet", { id: e[1], op: "waitlist" })).body, { ok: false, error: "has-cert" });
  r = await call(chief.token, "eduCertIssue", { course_id: A, enrollment_ids: [W.eB] });
  assert.deepEqual(r.body, { ok: false, error: "wrong-course", ids: [W.eB] });
});

test("수료를 취소한 분(검토 반영) — 담당자가 신청을 취소할 수 있다 · 번호는 그 줄에 남고 새 확정은 그 번호를 받지 않는다 · 살아 있는 수료는 여전히 has-cert", async () => {
  const { A, B, e } = W;
  let r = await call(M.token, "eduCertIssue", { course_id: A, enrollment_ids: [e[2]] });   // 나(50% — 기준 밖이어도 사람이 정한다)
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.equal(r.body.issued[0].how, "new");
  const noNa = r.body.issued[0].certNo;
  assert.deepEqual((await call(chief.token, "eduEnrollSet", { id: e[2], op: "cancel" })).body, { ok: false, error: "has-cert" }, "살아 있는 수료는 막힌다");
  assert.deepEqual((await call(M.token, "eduCertRevoke", { enrollment_id: e[2] })).body, { ok: true, certNo: noNa });
  const c = await call(chief.token, "eduEnrollSet", { id: e[2], op: "cancel" });
  assert.equal(c.body.ok, true, "수료를 취소한 뒤에는 신청 취소가 된다 " + JSON.stringify(c.body));
  const [row] = await rest(`edu_enrollments?select=status,cert_no,cert_revoked,completed&id=eq.${e[2]}`);
  assert.deepEqual(row, { status: "cancelled", cert_no: noNa, cert_revoked: true, completed: false }, "번호는 그 줄에 남는다(진위 확인 「취소됨」)");
  // 취소된 줄은 다시 확정 안 됨 · 새 확정(B 의 마)은 차례 다음 번호 — 남겨 둔 번호를 다시 쓰지 않는다
  assert.deepEqual((await call(M.token, "eduCertIssue", { course_id: A, enrollment_ids: [e[2]] })).body, { ok: false, error: "not-confirmed", ids: [e[2]] });
  r = await call(chief.token, "eduCertIssue", { course_id: B, enrollment_ids: [W.eB] });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  const noMa = r.body.issued[0].certNo;
  assert.notEqual(noMa, noNa);
  assert.equal(tail(noMa), tail(noNa) + 1, "차례 다음 번호");
  assert.equal((await rest(`edu_enrollments?select=id&cert_no=eq.${encodeURIComponent(noNa)}`)).length, 1, "남겨 둔 번호의 줄은 하나");
  // 수료 화면(확정자만)·인쇄에서는 빠진다
  assert.ok(!(await call(M.token, "eduCertList", { course_id: A })).body.people.some((p) => p.id === e[2]));
  assert.ok(!(await call(M.token, "eduCertPrint", { course_id: A })).body.people.some((p) => p.id === e[2]));
});

test("강사 T — 수료 액션은 모두 문에서 403 forbidden(맡은 강좌 A 여도)", async () => {
  const { A, e } = W;
  for (const [a, extra] of [["eduCertList", { course_id: A }], ["eduCheckSet", { enrollment_id: e[2], done: false }],
    ["eduCertIssue", { course_id: A, enrollment_ids: [e[2]] }], ["eduCertRevoke", { enrollment_id: e[1] }], ["eduCertPrint", { course_id: A }],
    ["eduCertSettings", {}], ["eduCertSettingsSave", { issuer: "x" }]]) {
    const r = await call(T.token, a, extra);
    assert.deepEqual([r.status, r.body.error], [403, "forbidden"], a);
  }
});

test("다른 강좌 교육 담당 D — A 의 수료 액션은 not-assigned · 아무것도 안 바뀜 · 설정은 403 · 자기 강좌 B 는 된다", async () => {
  const { A, B, e } = W;
  const before = await rest(`edu_enrollments?select=id,check_done,completed,cert_no,cert_revoked&course_id=eq.${A}&order=id`);
  for (const [a, extra] of [["eduCertList", { course_id: A }], ["eduCheckSet", { enrollment_id: e[2], done: false }],
    ["eduCheckSet", { enrollment_id: e[2], done: false, course_id: B }],
    ["eduCertIssue", { course_id: A, enrollment_ids: [e[2]] }], ["eduCertRevoke", { enrollment_id: e[1] }], ["eduCertPrint", { course_id: A }]]) {
    const r = await call(D.token, a, extra);
    assert.deepEqual(r.body, { ok: false, error: "not-assigned" }, a);
  }
  assert.deepEqual(await rest(`edu_enrollments?select=id,check_done,completed,cert_no,cert_revoked&course_id=eq.${A}&order=id`), before, "바뀌었다");
  for (const a of ["eduCertSettings", "eduCertSettingsSave"]) {
    const r = await call(D.token, a, { issuer: "x" });
    assert.deepEqual([r.status, r.body.error], [403, "forbidden"], a);
  }
  const own = await call(D.token, "eduCertList", { course_id: B });
  assert.equal(own.body.ok, true);
  assert.deepEqual(own.body.people.map((p) => p.id), [W.eB]);
});

test("수료증 설정 — 총괄만 · 보낸 칸 가운데 바뀐 것만 · 인쇄 자료에 명의·문안({과정} 채움)·직인 · 틀린 직인 거절 · 직인 지우기", async () => {
  const { A } = W;
  let r = await call(chief.token, "eduCertSettings");
  assert.equal(r.body.ok, true);
  assert.deepEqual(Object.keys(r.body).sort(), ["body", "issuer", "ok", "seal", "updatedAt"]);
  const issuer = `${TAG}명의-${STAMP}`.slice(0, 60), text = `시험 문안 — 「{과정}」 을 마침 ${STAMP}`;
  r = await call(chief.token, "eduCertSettingsSave", { issuer, body: text, seal: PNG1 });
  assert.deepEqual(r.body, { ok: true, changed: true, fields: ["issuer", "body", "seal"] });
  r = await call(chief.token, "eduCertSettingsSave", { issuer, body: text });
  assert.deepEqual(r.body, { ok: true, changed: false, fields: [] }, "그대로면 안 쓴다");
  r = await call(chief.token, "eduCertSettings");
  assert.deepEqual([r.body.issuer, r.body.body, r.body.seal], [issuer, text, PNG1]);
  const p = await call(M.token, "eduCertPrint", { course_id: A });
  assert.deepEqual([p.body.issuer, p.body.body, p.body.seal], [issuer, `시험 문안 — 「${TAG}A-${STAMP}」 을 마침 ${STAMP}`, PNG1]);
  for (const [seal, err] of [["data:image/svg+xml;base64,PHN2Zz4=", "bad-seal"], ["data:image/png;base64,PHN2Zz4=", "bad-seal"],
    ["data:image/png;base64,iVBORw0KGgo" + "A".repeat(409600), "seal-too-big"]]) {
    assert.equal((await call(chief.token, "eduCertSettingsSave", { seal })).body.error, err, err);
  }
  assert.equal((await call(chief.token, "eduCertSettings")).body.seal, PNG1, "거절했는데 바뀌었다");
  r = await call(chief.token, "eduCertSettingsSave", { seal: null });
  assert.deepEqual(r.body, { ok: true, changed: true, fields: ["seal"] });
  assert.equal((await call(chief.token, "eduCertSettings")).body.seal, null);
  assert.deepEqual((await call(M.token, "eduCertSettingsSave", { issuer: "x" })).status, 403, "교육 담당은 설정 못 함");
});

test("바뀐 기록 — edu.cert.check·issue·revoke·print·settings · detail 은 id·수·칸 이름만(이름·번호·이미지 없음)", async () => {
  const ms = [chief.memberId, M.memberId].join(",");
  const logs = await rest(`admin_audit?select=action,target,detail,member_id&member_id=in.(${ms})&action=like.edu.cert.*&order=id`);
  const n = (a) => logs.filter((l) => l.action === a).length;
  // check 셋(M) · issue 넷(새 둘 · 되살림 하나 · 나 · 마 — already 만인 것·거절은 기록 안 함) · revoke 둘(already 는 기록 안 함) ·
  //   print 넷 · settings 둘(바뀐 것 없는 저장은 기록 안 함)
  assert.deepEqual([n("edu.cert.check"), n("edu.cert.issue"), n("edu.cert.revoke"), n("edu.cert.print"), n("edu.cert.settings")], [3, 4, 2, 4, 2]);
  const issue = logs.filter((l) => l.action === "edu.cert.issue");
  assert.deepEqual(issue.map((l) => [l.detail.count, l.detail.fresh, l.detail.restored]), [[2, 2, 0], [1, 0, 1], [1, 1, 0], [1, 1, 0]]);
  assert.deepEqual(logs.filter((l) => l.action === "edu.cert.settings").map((l) => l.detail), [{ fields: ["issuer", "body", "seal"] }, { fields: ["seal"] }]);
  const txt = JSON.stringify(logs.map((l) => l.detail));
  assert.ok(!txt.includes(TAG + STAMP) && !txt.includes("base64") && !txt.includes("고척-") && !txt.includes("명의"), "기록에 이름·이미지·번호·글");
  assert.ok(logs.every((l) => !UUID_RE.test(JSON.stringify(l.detail).replace(W.A, "").replace(W.B, ""))), "강좌 id 밖의 UUID 꼴 값");
});
