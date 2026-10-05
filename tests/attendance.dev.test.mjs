// 출석부(교육신청 2단계 · 2026-10-05) — 개발 서버에 대고 도는 시험. 네트워크와 개발 비밀 키가 필요해 preflight 에는 넣지 않는다(이름의 .dev.).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/attendance.dev.test.mjs
// 하는 일: 교육 총괄 한 분·강사 T 한 분(이메일 로그인 ca-test-att-…@example.test)과 시험 강좌 A·B 를 만들고,
//   T 를 A 의 강사로 지정한 뒤 출석부 일곱 액션 · 강사 거절 · 회차 id 로 지우고 당기기 · 확정 아닌 줄 지우기를 본다.
//   끝나면(실패해도) 출석 → 신청 → 회차 → 강사 줄 → 강좌 → 그 두 분의 기록·역할·담당자 → auth 사용자를 지우고 0 줄인지 본다.
// ⚠️ 키·비밀번호를 찍지 않는다. 개발(ktpwthwqzgcqcrmsafdo)에만 돈다. v2 supabase/edu.sql 2단계와 SQL 012 가 개발에 들어가 있어야 한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { eduAttendRate } from "../supabase/functions/church-admin/edu-rules.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const TAG = "ca-test-att-";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

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

const made = { users: [], members: [], courses: [] };
const chief = {}, T = {};
const W = {};   // 강좌·회차·신청 id — A, B, s[1..4](A 회차 id), sB, e[0..3](A 신청), eB

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
  Object.assign(chief, await makeUser("chief"));
  await makeMember(chief, "시험-교육총괄", ["education"]);
  Object.assign(T, await makeUser("teacher"));
  await makeMember(T, "시험-강사", ["teacher"]);
  const mk = async (tag) => {
    const r = await call(chief.token, "eduCourseSave", { course: { title: `${TAG}${tag}-${STAMP}`, kind: "lecture", term: "시험", status: "running", mode: "auto", attend_pct: 80 } });
    assert.equal(r.body.ok, true, "강좌 " + JSON.stringify(r.body));
    made.courses.push(r.body.id);
    return r.body.id;
  };
  W.A = await mk("A"); W.B = await mk("B");
  let r = await call(chief.token, "eduSessionsSave", { course_id: W.A, sessions: [1, 2, 3, 4].map((no) => ({ no, on_date: kst((no - 1) * 7) })) });
  assert.deepEqual(r.body, { ok: true, count: 4 });
  r = await call(chief.token, "eduSessionsSave", { course_id: W.B, sessions: [{ no: 1, on_date: kst(0) }] });
  assert.equal(r.body.ok, true);
  // 회차 id 는 eduSessions 가 준다(화면도 이것을 받아 고칠 회차에 실어 보낸다)
  r = await call(chief.token, "eduSessions", { course_id: W.A });
  W.s = [null, ...r.body.sessions.map((s) => s.id)];
  assert.ok(W.s.slice(1).every((id) => Number.isInteger(id)), "eduSessions 가 회차 id 를 주지 않는다");
  W.sB = (await call(chief.token, "eduSessions", { course_id: W.B })).body.sessions[0].id;
  const enroll = async (course, k) => {
    const x = await call(chief.token, "eduEnrollAdd", { course_id: course, ident: { name: `${TAG}${STAMP}-${k}`, who_type: "새가족", group_name: "시험", sub_name: "1" } });
    assert.equal(x.body.status, "confirmed", "신청 " + JSON.stringify(x.body));
    return x.body.id;
  };
  W.e = [await enroll(W.A, "가"), await enroll(W.A, "나"), await enroll(W.A, "다"), await enroll(W.A, "라")];
  W.eB = await enroll(W.B, "마");
});

after(async () => {
  const errs = [];
  const step = async (name, fn) => { try { await fn(); } catch (e) { errs.push(name + ": " + String(e?.message).slice(0, 160)); } };
  await step("시험 강좌", () => sweepCourses(made.courses));
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
  // 0 줄 확인
  await step("0 줄 확인", async () => {
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
  });
  if (errs.length) throw new Error("정리 실패 " + errs.length + "건: " + errs.join(" / "));
});

test("강사 지정 — 강사 후보(kind teacher)에 T · 담당 후보에는 없음 · A 에 강사로 · 강좌 카드 teachers", async () => {
  let r = await call(chief.token, "eduStaffCandidates", { kind: "teacher" });
  assert.ok(r.body.members.some((m) => m.id === T.memberId && m.roles.includes("teacher")), JSON.stringify(r.body));
  r = await call(chief.token, "eduStaffCandidates", {});
  assert.ok(!r.body.members.some((m) => m.id === T.memberId), "담당 후보에 강사만 있는 분이 나왔다");
  r = await call(chief.token, "eduStaffSet", { course_id: W.A, member_ids: [T.memberId], kind: "teacher" });
  assert.deepEqual(r.body, { ok: true, count: 1, changed: true });
  r = await call(chief.token, "eduCourses", {});
  const card = r.body.courses.find((c) => c.id === W.A);
  assert.deepEqual(card.teachers, [{ id: T.memberId, name: "시험-강사" }]);
  assert.deepEqual(card.staff, []);
});

test("강사 T — 출석부: 강좌·회차·한 장 · 출석·지각·공결 · 남은 분 모두 · 다시 누르면 지움 · 현황 pct = eduAttendRate · 엑셀", async () => {
  const { A, s, e } = W;
  let r = await call(T.token, "eduAttendCourses");
  assert.equal(r.body.scope, "assigned");
  assert.deepEqual(r.body.courses.map((c) => c.id), [A]);
  assert.deepEqual([r.body.courses[0].hasToday, r.body.courses[0].confirmed, r.body.courses[0].sessionsCount], [true, 4, 4]);
  r = await call(T.token, "eduAttendSessions", { course_id: A });
  assert.equal(r.body.pick, s[1], "오늘 회차");
  assert.deepEqual(r.body.sessions.map((x) => x.marked), [0, 0, 0, 0]);
  r = await call(T.token, "eduAttendSheet", { course_id: A, session_id: s[1] });
  assert.equal(r.body.rows.length, 4);
  assert.ok(r.body.rows.every((x) => x.state === null && Object.keys(x).sort().join() === "id,name,state,who"));
  for (const [eid, st] of [[e[0], "present"], [e[1], "late"], [e[2], "excused"]]) {
    r = await call(T.token, "eduAttendSet", { session_id: s[1], enrollment_id: eid, state: st });
    assert.deepEqual(r.body, { ok: true, state: st });
  }
  r = await call(T.token, "eduAttendBulk", { session_id: s[1], state: "present" });
  assert.deepEqual(r.body, { ok: true, count: 1 }, "체크 안 한 한 분만");
  r = await call(T.token, "eduAttendSheet", { course_id: A, session_id: s[1] });
  assert.deepEqual(Object.fromEntries(r.body.rows.map((x) => [x.id, x.state])), { [e[0]]: "present", [e[1]]: "late", [e[2]]: "excused", [e[3]]: "present" });
  assert.deepEqual([r.body.counts.marked, r.body.counts.total], [4, 4]);
  assert.deepEqual((await call(T.token, "eduAttendSet", { session_id: s[2], enrollment_id: e[0], state: "absent" })).body, { ok: true, state: "absent" });
  assert.deepEqual((await call(T.token, "eduAttendSet", { session_id: s[4], enrollment_id: e[1], state: "present" })).body, { ok: true, state: "present" });
  await call(T.token, "eduAttendSet", { session_id: s[2], enrollment_id: e[3], state: "present" });
  assert.deepEqual((await call(T.token, "eduAttendSet", { session_id: s[2], enrollment_id: e[3], state: null })).body, { ok: true, state: null, cleared: true });
  assert.deepEqual((await call(T.token, "eduAttendSet", { session_id: s[2], enrollment_id: e[3], state: "" })).body, { ok: false, error: "bad-state" }, "빈 글자는 지우기가 아니다");
  r = await call(T.token, "eduAttendSessions", { course_id: A });
  assert.deepEqual(r.body.sessions.map((x) => x.marked), [4, 1, 0, 1]);
  r = await call(T.token, "eduAttendSummary", { course_id: A });
  const by = Object.fromEntries(r.body.people.map((p) => [p.id, p]));
  assert.equal(by[e[0]].pct, eduAttendRate({ present: 1, absent: 1 }).pct); assert.equal(by[e[0]].pct, 50); assert.equal(by[e[0]].below, true);
  assert.equal(by[e[1]].pct, eduAttendRate({ late: 1, present: 1 }).pct); assert.equal(by[e[1]].pct, 100);
  assert.equal(by[e[2]].pct, null, "공결만");
  assert.equal(by[e[3]].marked, 1, "지운 칸은 안 센다");
  assert.deepEqual(by[e[0]].cells, ["present", "absent", null, null]);
  const txt = JSON.stringify(r.body);
  assert.ok(!/marked_by|user_id|ident_key/.test(txt) && !txt.includes(T.memberId) && !txt.includes(chief.memberId));
  r = await call(T.token, "eduAttendExport", { course_id: A });
  assert.equal(r.body.rows.length, 5);
  assert.ok(r.body.rows[0][4].startsWith("1회 "));
});

test("강사 T — 맡지 않은 강좌 B 는 not-assigned(쓰기 0) · 신청 현황·강좌 관리 액션은 403 forbidden", async () => {
  const { A, B, sB, eB, e } = W;
  assert.equal((await call(T.token, "eduAttendSessions", { course_id: B })).body.error, "not-assigned");
  assert.equal((await call(T.token, "eduAttendSet", { session_id: sB, enrollment_id: eB, state: "present" })).body.error, "not-assigned");
  assert.equal((await call(T.token, "eduAttendSet", { session_id: sB, enrollment_id: e[0], state: "present", course_id: A })).body.error, "not-assigned",
    "B 회차 × A 신청(몸통에 A) — 회차의 강좌로 본다");
  assert.equal((await call(T.token, "eduAttendBulk", { session_id: sB, state: "present" })).body.error, "not-assigned");
  assert.equal((await call(T.token, "eduAttendSummary", { course_id: B })).body.error, "not-assigned");
  assert.equal((await rest(`edu_attendance?select=enrollment_id&session_id=eq.${sB}`)).length, 0);
  for (const [a, extra] of [["eduEnrollList", { course_id: A }], ["eduCourses", {}], ["eduSessions", { course_id: A }], ["eduSessionsSave", { course_id: A, sessions: [] }],
    ["eduEnrollSet", { id: e[0], op: "cancel" }], ["eduExport", { course_id: A }]]) {
    const r = await call(T.token, a, extra);
    assert.deepEqual([r.status, r.body.error], [403, "forbidden"], a);
  }
});

test("총괄 — B 회차 × A 신청은 SQL 이 wrong-course · 회차는 id 로: 출석 있는 가운데 회차는 못 빼고, 출석 없는 가운데 회차는 빼고 당겨도 출석이 제 날짜에", async () => {
  const { A, B, s, sB, e } = W;
  assert.equal((await call(chief.token, "eduAttendSet", { session_id: sB, enrollment_id: e[0], state: "present" })).body.error, "wrong-course");
  const row = (i, no) => ({ id: s[i], no, on_date: kst((i - 1) * 7) });
  // 출석 있는 2회를 빼며 3·4 → 2·3 → has-attendance(지금 번호 [2]) · 그대로
  let r = await call(chief.token, "eduSessionsSave", { course_id: A, sessions: [row(1, 1), row(3, 2), row(4, 3)] });
  assert.deepEqual(r.body, { ok: false, error: "has-attendance", nos: [2] });
  assert.deepEqual((await call(chief.token, "eduSessions", { course_id: A })).body.sessions.map((x) => [x.id, x.no]), [[s[1], 1], [s[2], 2], [s[3], 3], [s[4], 4]]);
  // 출석 없는 3회를 빼며 4 → 3 으로 당기기 → 된다 · id 그대로 · 4회 칸(e1 출석)은 4회 날짜에 그대로
  r = await call(chief.token, "eduSessionsSave", { course_id: A, sessions: [row(1, 1), row(2, 2), row(4, 3)] });
  assert.deepEqual(r.body, { ok: true, count: 3 });
  const ss = (await call(chief.token, "eduSessions", { course_id: A })).body.sessions;
  assert.deepEqual(ss.map((x) => [x.id, x.no, x.on_date]), [[s[1], 1, kst(0)], [s[2], 2, kst(7)], [s[4], 3, kst(21)]]);
  const sum = (await call(chief.token, "eduAttendSummary", { course_id: A })).body;
  assert.deepEqual(sum.sessions.map((x) => [x.id, x.no, x.date]), [[s[1], 1, kst(0)], [s[2], 2, kst(7)], [s[4], 3, kst(21)]]);
  const by = Object.fromEntries(sum.people.map((p) => [p.id, p]));
  assert.deepEqual(by[e[1]].cells, ["late", null, "present"], "4회(이제 3회) 칸이 제 회차에");
  assert.deepEqual(by[e[0]].cells, ["present", "absent", null]);
  // 맞바꾸기(1 ↔ 2)도 unique 에 안 걸린다 · 다른 강좌 회차 id 는 bad-rows
  r = await call(chief.token, "eduSessionsSave", { course_id: A, sessions: [row(1, 2), row(2, 1), row(4, 3)] });
  assert.deepEqual(r.body, { ok: true, count: 3 });
  r = await call(chief.token, "eduSessionsSave", { course_id: A, sessions: [row(1, 1), row(2, 2), row(4, 3), { id: sB, no: 4, on_date: kst(28) }] });
  assert.deepEqual(r.body, { ok: false, error: "bad-rows" });
  assert.equal((await call(chief.token, "eduSessions", { course_id: B })).body.sessions.length, 1);
});

test("확정이 아닌 줄 — 쓰기는 not-confirmed · 지우기(null)는 된다(합치기 merge-edu-attendance 를 푸는 길)", async () => {
  const { s, e } = W;
  const c = await call(chief.token, "eduEnrollSet", { id: e[2], op: "cancel" });
  assert.equal(c.body.ok, true);
  assert.deepEqual((await call(T.token, "eduAttendSet", { session_id: s[1], enrollment_id: e[2], state: "present" })).body, { ok: false, error: "not-confirmed" });
  assert.deepEqual((await call(T.token, "eduAttendSet", { session_id: s[1], enrollment_id: e[2], state: null })).body, { ok: true, state: null, cleared: true });
  assert.equal((await rest(`edu_attendance?select=state&enrollment_id=eq.${e[2]}`)).length, 0);
});

test("바뀐 기록 — 강사 것은 edu.attend.set·bulk·export · detail 은 id·수만(이름 없음)", async () => {
  const logs = await rest(`admin_audit?select=action,target,detail&member_id=eq.${T.memberId}&action=like.edu.attend.*&order=id`);
  const n = (a) => logs.filter((l) => l.action === a).length;
  assert.deepEqual([n("edu.attend.set"), n("edu.attend.bulk"), n("edu.attend.export")], [8, 1, 1]);
  assert.ok(!JSON.stringify(logs).includes(TAG + STAMP), "기록에 이름");
  const bulk = logs.find((l) => l.action === "edu.attend.bulk");
  assert.deepEqual(Object.keys(bulk.detail).sort(), ["count", "course", "no", "session"]);
  assert.ok(logs.every((l) => !UUID_RE.test(JSON.stringify(l.detail).replace(W.A, ""))), "강좌 id 밖의 UUID 꼴 값");
});
