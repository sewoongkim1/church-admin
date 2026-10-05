// 교인명부 「🎓 교육」 탭 · 📊 교육 통계(교육신청 4단계 B·C · 2026-10-06) — 개발 서버에 대고 도는 시험. 네트워크와 개발 비밀 키가 필요해
//   preflight 에는 넣지 않는다(이름의 .dev.).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/edu-tab-stats.dev.test.mjs
// 하는 일: 교육 총괄·교인명부·교육 담당 세 분(이메일 로그인 ca-test-etab-…@example.test) · 가짜 교인 둘(같은 이름 · 시험 7목장/8목장 ·
//   고정 교인ID 990007701·990007702) · 앱 계정 다섯(7목장 둘 — 하나는 이름에 빈칸 · 8목장 · 목장 모름 99 · 비슷한 다른 이름) ·
//   시험 학기 강좌 X·Y · 신청 줄(앱 계정 · 명부 대신 등록 person|ID · 남의 계정에 붙은 person|ID · 직접 입력) · 출석 · 수료 하나를 만들고
//   ① 「자세히」 창 history.education 이 이분 것만(이어진 계정의 신청 + person|이분) ② 칸 지도(메모·계정·신원 키 없음)
//   ③ 교육 통계 수 = 줄을 직접 센 수 ④ 문(교육 통계는 교육 총괄만 · 「자세히」 창은 교인명부만)을 본다.
//   끝나면(실패해도) 출석 → 신청 → 회차 → 강좌 → 앱 계정 → 교인 → 번호 차례 되돌리기 → 기록·역할·담당자 → auth 사용자를 지우고 0 줄인지 본다.
// ⚠️ 키·비밀번호를 찍지 않는다. 개발(ktpwthwqzgcqcrmsafdo)에만 돈다. v2 supabase/edu.sql(4단계 C edu_stats)이 개발에 들어가 있어야 한다.
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
const TAG = "ca-test-etab-";
const NAME = `${TAG}${STAMP}`;            // 교인 둘·앱 계정의 이름(이름 열쇠)
const TERM = `${TAG}t${STAMP}`;           // 시험 학기(30자 안 · NAME 을 품지 않는다)
const PID = [990007701, 990007702];       // 고정 교인ID — 지난번 찌꺼기는 before 가 지운다
const ITEM_KEYS = ["attendPct", "certNo", "certRevoked", "status", "statusLabel", "term", "title"];
const kst = (d = 0) => new Date(Date.now() + 9 * 3600000 + d * 86400000).toISOString().slice(0, 10);

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200) }; } }
async function rest(path, method = "GET", data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method, headers: { ...svc, Prefer: "return=representation" },
    body: data ? JSON.stringify(data) : undefined });
  const x = await body(r);
  assert.ok(r.ok, path + " " + r.status + " " + JSON.stringify(x).slice(0, 200));
  return x;
}
const rpc = (fn, args) => rest("rpc/" + fn, "POST", args);
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

const made = { users: [], members: [], courses: [], appUsers: [] };
const chief = {}, dir = {}, staff = {};
const W = {};   // 강좌 X·Y · 회차 s · 앱 계정 u[1..5] · 신청 줄 이름표 → id
const SNAP = { year: Number(kst(0).slice(0, 4)), seq: undefined };

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
  // 지난번이 도중에 멈춰 남긴 것(한 시간 넘은 것만 — 다른 세션이 돌리는 중인 것은 건드리지 않는다) · 고정 교인ID
  const stale = new Date(Date.now() - 3600 * 1000).toISOString();
  await sweepCourses((await rest(`edu_courses?select=id&title=like.${TAG}*&created_at=lt.${stale}`)).map((c) => c.id));
  await rest(`users?name=like.${TAG}*&created_at=lt.${stale}`, "DELETE");
  await rest(`church_people?person_id=in.(${PID.join(",")})`, "DELETE");
  const [sq] = await rest(`edu_cert_seq?select=last&year=eq.${SNAP.year}`);
  SNAP.seq = sq ? sq.last : null;

  Object.assign(chief, await makeUser("chief")); await makeMember(chief, "시험-교육총괄", ["education"]);
  Object.assign(dir, await makeUser("dir"));     await makeMember(dir, "시험-교인명부", ["directory"]);
  Object.assign(staff, await makeUser("staff")); await makeMember(staff, "시험-교육담당", ["educourse"]);

  // 교인 둘 — 같은 이름 · 시험 7목장 / 8목장(가짜 · 연락처·주소 없음)
  for (const [pid, mok] of [[PID[0], "7"], [PID[1], "8"]]) {
    await rest("church_people", "POST", { person_id: pid, name: NAME, name_key: NAME, kind2: "장년", mok1: "시험", mok3: `시험-${mok}목장`, position: "집사" });
  }
  // 앱 계정 다섯 — 1: 7목장(→ 첫째 분) · 2: 7목장 이름에 빈칸(→ 첫째 분) · 3: 8목장(→ 둘째 분) · 4: 목장 모름 99(→ 아무에게도) · 5: 비슷한 다른 이름(→ 아무에게도)
  const app = (k, name, mok) => ({ type: "교구", gu: "시험", mok, name, identity_key: `교구|시험|${mok}|||${name}` });
  const names = { 1: [NAME, "7"], 2: [NAME.replace(TAG, TAG + " "), "7"], 3: [NAME, "8"], 4: [NAME, "99"], 5: [NAME + "x", "7"] };
  W.u = {};
  for (const [k, [name, mok]] of Object.entries(names)) {
    const [u] = await rest("users", "POST", app(k, name, mok));
    W.u[k] = u; made.appUsers.push(u.id);
  }

  // 강좌 X(진행 중 · 회차 둘) · Y(모집 중) — 같은 시험 학기
  const mk = async (tag, status) => {
    const r = await call(chief.token, "eduCourseSave", { course: { title: `${TAG}${tag}-${STAMP}`, kind: "regular", term: TERM, status, mode: "auto", attend_pct: 80 } });
    assert.equal(r.body.ok, true, "강좌 " + JSON.stringify(r.body));
    made.courses.push(r.body.id);
    return r.body.id;
  };
  W.X = await mk("X", "running"); W.Y = await mk("Y", "open");
  let r = await call(chief.token, "eduSessionsSave", { course_id: W.X, sessions: [{ no: 1, on_date: kst(-7) }, { no: 2, on_date: kst(0) }] });
  assert.deepEqual(r.body, { ok: true, count: 2 });
  W.s = (await call(chief.token, "eduSessions", { course_id: W.X })).body.sessions.map((s) => s.id);

  // 신청 줄 — 계정 줄은 SQL edu_apply(담당자 길 · 계정과 신원을 직접 준다) · 직접 입력은 교회 어드민 대신 등록 그대로
  const ident = (u, key) => ({ name: u ? u.name : NAME, who_type: "교구", group_name: "시험", sub_name: u ? u.mok : "7", ident_key: key ?? u.identity_key });
  const apply = async (label, course, u, key) => {
    const x = await rpc("edu_apply", { p_course: course, p_user: u ? u.id : null, p_ident: ident(u, key), p_staff: true });
    assert.equal(x.ok, true, label + " " + JSON.stringify(x));
    W[label] = Number(x.id);
  };
  await apply("a1", W.X, W.u[1]);                          // 첫째 분 · 앱 계정 1
  await apply("a2", W.Y, W.u[2]);                          // 첫째 분 · 빈칸 계정 2(뒤에 취소)
  await apply("p1", W.Y, null, `person|${PID[0]}`);        // 첫째 분 · 명부에서 대신 등록
  await apply("p1u3", W.X, W.u[3], `person|${PID[0]}`);    // 첫째 분 · 둘째 분 계정에 붙은 person|첫째(담당자가 첫째 분을 골랐다)
  await apply("b3", W.Y, W.u[3]);                          // 둘째 분 · 앱 계정 3
  await apply("p2", W.X, null, `person|${PID[1]}`);        // 둘째 분 · 명부에서 대신 등록
  await apply("n4", W.X, W.u[4]);                          // 아무에게도(목장 모름)
  await apply("n5", W.X, W.u[5]);                          // 아무에게도(다른 이름)
  r = await call(chief.token, "eduEnrollAdd", { course_id: W.X, ident: { name: NAME, who_type: "새가족", group_name: "", sub_name: "" } });
  assert.equal(r.body.status, "confirmed", "직접 입력 " + JSON.stringify(r.body));
  W.t = Number(r.body.id);                                 // 아무에게도(직접 입력 staff|…)
  r = await call(chief.token, "eduEnrollSet", { id: W.a2, op: "cancel" });
  assert.equal(r.body.ok, true, "취소 " + JSON.stringify(r.body));
  // 출석 — a1: 출석·결석 → 50% · p2: 공결뿐 → 출석률 없음
  for (const [eid, sid, st] of [[W.a1, W.s[0], "present"], [W.a1, W.s[1], "absent"], [W.p2, W.s[0], "excused"]]) {
    const x = await call(chief.token, "eduAttendSet", { session_id: sid, enrollment_id: eid, state: st });
    assert.equal(x.body.ok, true, "출석 " + JSON.stringify(x.body));
  }
  // 수료 — a1 (번호는 개발 차례에서 하나 · after 가 되돌린다)
  r = await call(chief.token, "eduCertIssue", { course_id: W.X, enrollment_ids: [W.a1] });
  assert.equal(r.body.ok, true, "수료 " + JSON.stringify(r.body));
  W.cert = r.body.issued[0].certNo;
});

after(async () => {
  const errs = [];
  const step = async (name, fn) => { try { await fn(); } catch (e) { errs.push(name + ": " + String(e?.message).slice(0, 160)); } };
  await step("시험 강좌", () => sweepCourses(made.courses));
  if (made.appUsers.length) await step("앱 계정", () => rest(`users?id=in.(${made.appUsers.join(",")})`, "DELETE"));
  await step("교인", () => rest(`church_people?person_id=in.(${PID.join(",")})`, "DELETE"));
  await step("번호 차례 되돌리기", () => SNAP.seq === undefined ? null
    : SNAP.seq === null ? rest(`edu_cert_seq?year=eq.${SNAP.year}`, "DELETE") : rest(`edu_cert_seq?year=eq.${SNAP.year}`, "PATCH", { last: SNAP.seq }));
  if (made.members.length) {
    const ms = made.members.join(",");
    await step("기록(시험 세 분 것)", () => rest(`admin_audit?member_id=in.(${ms})`, "DELETE"));
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
    assert.equal((await rest(`edu_courses?select=id&term=eq.${encodeURIComponent(TERM)}`)).length, 0, "시험 학기 강좌");
    assert.equal((await rest(`users?select=id&name=like.${TAG}*`)).filter((u) => made.appUsers.includes(u.id)).length, 0, "앱 계정");
    assert.equal((await rest(`church_people?select=person_id&person_id=in.(${PID.join(",")})`)).length, 0, "교인");
    if (made.members.length) {
      const ms = made.members.join(",");
      for (const t of ["admin_members?select=id&id", "admin_role_grants?select=member_id&member_id", "admin_audit?select=id&member_id"]) {
        assert.equal((await rest(`${t}=in.(${ms})`)).length, 0, t);
      }
    }
    for (const uid of made.users) assert.equal((await fetch(URL_ + "/auth/v1/admin/users/" + uid, { headers: svc })).status, 404, "auth 사용자");
    if (SNAP.seq !== undefined) {
      const [sq] = await rest(`edu_cert_seq?select=last&year=eq.${SNAP.year}`);
      assert.equal(sq ? sq.last : null, SNAP.seq, "번호 차례");
    }
  });
  if (errs.length) throw new Error("정리 실패 " + errs.length + "건: " + errs.join(" / "));
});

const titleOf = (c) => `${TAG}${c}-${STAMP}`;
const summary = (items) => items.map((x) => [x.title, x.statusLabel, x.attendPct, x.certNo, x.certRevoked].join("|")).sort();

test("「자세히」 창 🎓 교육 — 첫째 분: 이어진 계정 둘(빈칸 이름 포함)의 신청 + person|첫째 줄(남의 계정에 붙은 것도) · 그 밖은 없다", async () => {
  const r = await call(dir.token, "peoplePerson", { id: PID[0] });
  assert.equal(r.body.ok, true, JSON.stringify(r.body).slice(0, 300));
  const h = r.body.history;
  assert.ok(Array.isArray(h?.education), "history.education 이 없다 " + JSON.stringify(h).slice(0, 200));
  assert.equal(h.counts.education, 4);
  assert.deepEqual(summary(h.education), [
    `${titleOf("X")}|확정|50|${W.cert}|false`,     // a1 — 계정 1 · 출석 50% · 수료
    `${titleOf("X")}|확정|||false`,              // p1u3 — 둘째 분 계정에 붙은 person|첫째
    `${titleOf("Y")}|취소|||false`,              // a2 — 빈칸 계정 2 · 취소
    `${titleOf("Y")}|확정|||false`,              // p1 — 명부 대신 등록
  ].sort());
  for (const it of h.education) {
    assert.deepEqual(Object.keys(it).sort(), ITEM_KEYS);
    assert.equal(it.term, TERM);
  }
  const s = JSON.stringify(h.education);
  for (const leak of [...made.appUsers, "person|", "staff|", "identity", "user_id", "ident_key", "staff_note", NAME]) assert.ok(!s.includes(leak), "샌 것: " + leak);
  // 사역·성경필사 탭은 그대로(이 시험 교인은 기록 0)
  assert.deepEqual([h.counts.ministry, h.counts.bible], [0, 0]);
});

test("「자세히」 창 🎓 교육 — 둘째 분: 계정 3 의 Y 신청 + person|둘째 줄만(계정 3 에 붙은 person|첫째 줄은 안 보인다)", async () => {
  const r = await call(dir.token, "peoplePerson", { id: PID[1] });
  assert.equal(r.body.ok, true);
  assert.deepEqual(summary(r.body.history.education), [`${titleOf("X")}|확정|||false`, `${titleOf("Y")}|확정|||false`].sort());
  assert.equal(r.body.history.counts.education, 2);
});

test("문 — 「자세히」 창은 교인명부만(교육 총괄은 forbidden) · 교육 통계는 교육 총괄만(교인명부·교육 담당은 forbidden)", async () => {
  assert.equal((await call(chief.token, "peoplePerson", { id: PID[0] })).body.error, "forbidden");
  assert.equal((await call(dir.token, "eduStats", { term: TERM })).body.error, "forbidden");
  assert.equal((await call(staff.token, "eduStats", { term: TERM })).body.error, "forbidden");
});

test("📊 교육 통계 — 시험 학기의 수 = 줄을 직접 센 수(강좌별 상태·수료·평균 출석률 · 소속별 확정·수료 · 합계)", async () => {
  const r = await call(chief.token, "eduStats", { term: TERM });
  assert.equal(r.body.ok, true, JSON.stringify(r.body).slice(0, 300));
  const st = r.body;
  assert.equal(st.term, TERM);
  assert.ok(st.terms.includes(TERM), "학기 목록에 시험 학기");
  assert.deepEqual(st.courses.map((c) => c.id).sort(), [W.X, W.Y].sort());
  // 줄을 직접 센다(서비스 키 · 시험 강좌 둘뿐)
  const rows = await rest(`edu_enrollments?select=id,course_id,status,completed,who_type,group_name&course_id=in.(${W.X},${W.Y})`);
  const att = await rest(`edu_attendance?select=enrollment_id,state&enrollment_id=in.(${rows.map((x) => x.id).join(",")})`);
  for (const c of st.courses) {
    const mine = rows.filter((x) => x.course_id === c.id);
    for (const s of ["applied", "confirmed", "waitlisted", "cancelled", "declined"]) assert.equal(c[s], mine.filter((x) => x.status === s).length, `${c.title} ${s}`);
    assert.equal(c.completed, mine.filter((x) => x.completed).length, c.title + " 수료");
    const pcts = mine.filter((x) => x.status === "confirmed").map((x) => {
      const k = { present: 0, late: 0, absent: 0, excused: 0 };
      for (const a of att) if (a.enrollment_id === x.id) k[a.state]++;
      return eduAttendRate(k).pct;
    }).filter((p) => p !== null);
    assert.equal(c.attendN, pcts.length, c.title + " 센 분");
    assert.equal(c.attendSum, pcts.reduce((a, b) => a + b, 0), c.title + " 출석률 합");
    assert.equal(c.attendAvg, pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null, c.title + " 평균");
  }
  const X = st.courses.find((c) => c.id === W.X), Y = st.courses.find((c) => c.id === W.Y);
  assert.deepEqual([X.confirmed, X.completed, X.attendN, X.attendAvg, X.completeRate], [6, 1, 1, 50, 17], "X: a1·p1u3·p2·n4·n5·직접 입력 · 수료 a1 · 출석 a1 만(p2 는 공결뿐)");
  assert.deepEqual([Y.confirmed, Y.cancelled, Y.completed, Y.attendAvg], [2, 1, 0, null], "Y: p1·b3 확정 · a2 취소");
  assert.deepEqual([st.total.confirmed, st.total.cancelled, st.total.completed, st.total.attendAvg], [8, 1, 1, 50]);
  // 소속별 — 확정 줄만 · 교구/시험 일곱 · 새가족(직접 입력) 하나
  const want = new Map();
  for (const x of rows.filter((x) => x.status === "confirmed")) {
    const k = `${x.who_type.normalize("NFC").trim()}|${x.group_name.normalize("NFC").trim()}`;
    const g = want.get(k) || { confirmed: 0, completed: 0 };
    g.confirmed++; if (x.completed) g.completed++;
    want.set(k, g);
  }
  assert.deepEqual(new Map(st.groups.map((g) => [`${g.whoType}|${g.group}`, { confirmed: g.confirmed, completed: g.completed }])), want);
  assert.deepEqual(want.get("교구|시험"), { confirmed: 7, completed: 1 });
  assert.deepEqual(want.get("새가족|"), { confirmed: 1, completed: 0 });
  const s = JSON.stringify(st);
  for (const leak of [...made.appUsers, NAME, "user_id", "ident_key", "staff_note"]) assert.ok(!s.includes(leak), "샌 것: " + leak);
});
