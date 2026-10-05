import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCourse, makeSessions, checkSessions, courseOut, enrollOut, exportRows, ENROLL_STATUS_LABEL,
  checkTypedIdent, rosterIdentity, rosterIdent, maybeDupIds, seatsOpened, waitOrder,
  eduChief, checkStaffIds, staffByCourse, staffCandidateOut, EDU_STAFF_MAX,
  eduAttendRate, checkAttendState, attendKinds, checkStaffKind, staffRolesFor, EDU_TEACHER_ROLES, pickSession, attendCounts,
  attendSummary, attendExportRows, attendSessionOut, kstDate, ATTEND_STATES }
  from "../supabase/functions/church-admin/edu-rules.ts";
import { readFileSync } from "node:fs";

test("checkCourse — 기본값과 다듬기", () => {
  const r = checkCourse({ title: "  제자훈련  1단계 ", kind: "regular", capacity: "20", mode: "auto",
    apply_from: "2027-01-03", apply_to: "2027-01-24", attend_pct: 80 });
  assert.equal(r.ok, true);
  assert.equal(r.row.title, "제자훈련 1단계");
  assert.equal(r.row.capacity, 20);
  assert.equal(r.row.waitlist, true);
  assert.equal(r.row.status, "draft");
  assert.deepEqual(r.row.prereq_tracks, []);
});

test("checkCourse — 틀린 값", () => {
  assert.equal(checkCourse({ title: "", kind: "regular" }).error, "no-title");
  assert.equal(checkCourse({ title: "a", kind: "x" }).error, "bad-kind");
  assert.equal(checkCourse({ title: "a", kind: "lecture", capacity: 0 }).error, "bad-capacity");
  assert.equal(checkCourse({ title: "a", kind: "lecture", mode: "x" }).error, "bad-mode");
  assert.equal(checkCourse({ title: "a", kind: "lecture", apply_from: "2027-13-01" }).error, "bad-date");
  assert.equal(checkCourse({ title: "a", kind: "lecture", apply_from: "2027-02-01", apply_to: "2027-01-01" }).error, "bad-range");
  assert.equal(checkCourse({ title: "a", kind: "lecture", attend_pct: 101 }).error, "bad-pct");
  assert.equal(checkCourse({ title: "가".repeat(81), kind: "lecture" }).error, "too-long");
  assert.equal(checkCourse({ title: "a", kind: "lecture", status: "x" }).error, "bad-status");
});

test("checkCourse — 교육 기간(starts_on·ends_on)", () => {
  const ok = checkCourse({ title: "a", kind: "lecture", starts_on: "2027-03-03", ends_on: "2027-05-19" });
  assert.equal(ok.row.starts_on, "2027-03-03");
  assert.equal(ok.row.ends_on, "2027-05-19");
  const empty = checkCourse({ title: "a", kind: "lecture", starts_on: "", ends_on: "  " });
  assert.equal(empty.row.starts_on, null);
  assert.equal(empty.row.ends_on, null);
  assert.equal(checkCourse({ title: "a", kind: "lecture" }).row.starts_on, null);
  assert.equal(checkCourse({ title: "a", kind: "lecture", starts_on: "2027-03-03" }).ok, true);          // 한쪽만도 된다
  assert.equal(checkCourse({ title: "a", kind: "lecture", starts_on: "2027-03-03", ends_on: "2027-03-03" }).ok, true);   // 같은 날
  assert.equal(checkCourse({ title: "a", kind: "lecture", starts_on: "2027-13-01" }).error, "bad-date");
  assert.equal(checkCourse({ title: "a", kind: "lecture", ends_on: "내일" }).error, "bad-date");
  assert.equal(checkCourse({ title: "a", kind: "lecture", starts_on: "2027-05-19", ends_on: "2027-03-03" }).error, "bad-period");
  const o = courseOut({ id: "c1", title: "t", kind: "lecture", status: "open", starts_on: "2027-03-03", ends_on: null }, { confirmed: 0, waitlisted: 0, applied: 0 });
  assert.equal(o.startsOn, "2027-03-03");
  assert.equal(o.endsOn, null);
});

test("checkCourse — 정원 빈칸은 제한 없음(null)", () => {
  assert.equal(checkCourse({ title: "a", kind: "lecture", capacity: "" }).row.capacity, null);
});

test("makeSessions — 매주 수요일 8회", () => {
  const s = makeSessions("2027-03-03", 8, 7, { start_time: "19:30", end_time: "21:00" });
  assert.equal(s.length, 8);
  assert.deepEqual(s[0], { no: 1, on_date: "2027-03-03", start_time: "19:30", end_time: "21:00", topic: "", place: "" });
  assert.equal(s[7].on_date, "2027-04-21");
});

test("checkSessions — 번호·날짜·중복", () => {
  assert.equal(checkSessions([{ no: 1, on_date: "2027-03-03" }, { no: 1, on_date: "2027-03-10" }]).error, "dup-no");
  assert.equal(checkSessions([{ no: 0, on_date: "2027-03-03" }]).error, "bad-no");
  assert.equal(checkSessions([{ no: 1, on_date: "x" }]).error, "bad-date");
  assert.equal(checkSessions(Array.from({ length: 201 }, (_, i) => ({ no: i + 1, on_date: "2027-03-03" }))).error, "too-many");
  assert.equal(checkSessions([{ no: 1, on_date: "2027-03-03", start_time: "19:30" }]).ok, true);
});

test("courseOut·enrollOut — user_id·ident_key 를 싣지 않는다", () => {
  const c = courseOut({ id: "c1", title: "t", kind: "lecture", status: "open", capacity: 10, created_at: "x" }, { confirmed: 3, waitlisted: 1, applied: 0 });
  assert.equal(c.counts.confirmed, 3);
  const e = enrollOut({ id: 7, user_id: "u", ident_key: "k", name: "홍길동", who_type: "교구", group_name: "믿음", sub_name: "3",
    status: "waitlisted", source: "app", applied_at: "t", fee_paid: false, staff_note: "" }, 2);
  assert.equal(e.waitNo, 2);
  assert.equal(e.who, "믿음 3목장");
  assert.equal("user_id" in e, false);
  assert.equal("ident_key" in e, false);
  assert.equal(e.hasApp, true);
  assert.equal(e.maybeDup, false);
  assert.equal(enrollOut({ id: 8, user_id: null, name: "홍길동", status: "confirmed" }, null, true).maybeDup, true);
});

test("exportRows — 머리와 줄", () => {
  const rows = exportRows({ title: "제자훈련", term: "2027 상반기" },
    [{ name: "홍길동", who: "믿음 3목장", status: "confirmed", fee_paid: true, applied_at: "2027-01-05T01:00:00Z", source: "app", staff_note: "" }]);
  assert.deepEqual(rows[0], ["강좌", "학기", "이름", "소속", "상태", "교재비", "신청한 곳", "신청 시각(한국)", "메모"]);
  assert.deepEqual(rows[1].slice(0, 7), ["제자훈련", "2027 상반기", "홍길동", "믿음 3목장", ENROLL_STATUS_LABEL.confirmed, "냄", "앱"]);
});

test("rosterIdent — 소속 없음은 person|교인ID · 앱 계정은 정확히 하나일 때만", () => {
  const none = rosterIdent({ who_type: "", group: "", sub: "", name: "홍길동" }, 77, 1);
  assert.deepEqual(none, { ident: { name: "홍길동", who_type: "", group_name: "", sub_name: "", ident_key: "person|77" }, use_app: false });
  const kid = rosterIdent({ who_type: "교회학교", group: "청년부", sub: "", name: "김하나" }, 5, 1);   // 학년 없음 → 잇지 않는다
  assert.equal(kid.use_app, false); assert.equal(kid.ident.ident_key, "person|5"); assert.equal(rosterIdentity({ who_type: "교회학교", group: "청년부", sub: "", name: "김하나" }), null);
  const kid2 = rosterIdent({ who_type: "교회학교", group: "중등부", sub: "2", name: "김하나" }, 6, 1);
  assert.deepEqual([kid2.use_app, kid2.ident.who_type, kid2.ident.group_name, kid2.ident.sub_name], [true, "교회학교", "중등부", "2"]);
  const one = rosterIdent({ who_type: "교구", group: "기쁨", sub: "3", name: "이순신" }, 9, 1);
  assert.deepEqual([one.use_app, one.ident.ident_key, one.ident.group_name, one.ident.sub_name], [true, "person|9", "기쁨", "3"]);
  assert.equal(rosterIdent({ who_type: "교구", group: "기쁨", sub: "3", name: "이순신" }, 9, 0).use_app, false);
  assert.equal(rosterIdent({ who_type: "교구", group: "기쁨", sub: "3", name: "이순신" }, 9, 2).use_app, false);
  assert.deepEqual(rosterIdentity({ who_type: "교구", group: "기쁨", sub: "3", name: "이순신" }),
    { type: "교구", gu: "기쁨", mok: "3", bu: "", grade: "", name: "이순신" });
});

test("checkTypedIdent — | 는 모든 칸에서 막고 길이는 40자", () => {
  const ok = checkTypedIdent({ name: "새가족1", who_type: "", group_name: "기쁨", sub_name: "3" });
  assert.equal(ok.ok, true); assert.equal(ok.ident.ident_key, "staff|새가족|기쁨|3|새가족1");
  for (const bad of [{ name: "a|b" }, { name: "a\\b" }, { name: "x", who_type: "a|b" }, { name: "x", group_name: "a|b" }, { name: "x", sub_name: "a|b" },
    { name: "" }, { name: "가".repeat(41) }, { name: "x", group_name: "가".repeat(41) }, { name: "x", sub_name: "1".repeat(41) },
    { name: "x", who_type: "가".repeat(41) }, { name: 'a"b' }]) {
    assert.deepEqual(checkTypedIdent(bad), { ok: false, error: "bad-ident" }, JSON.stringify(bad));
  }
  assert.equal(checkTypedIdent({ name: "가".repeat(40), group: "가".repeat(40) }).ok, true);
});

// 최종 검토(2026-10-05) — 앱 줄 ↔ 대신 등록 줄이 같은 이름이면 「같은 분일 수 있어요」
test("maybeDupIds — 살아 있는 앱 줄과 대신 등록 줄이 같은 이름일 때만(NFC·앞뒤 빈칸)", () => {
  const nfd = "홍길동".normalize("NFD");
  const rows = [
    { id: 1, name: "홍길동", user_id: "u1", status: "confirmed" },
    { id: 2, name: ` ${nfd} `, user_id: null, status: "waitlisted" },     // 자모 분리·빈칸 — 같은 이름으로 본다
    { id: 3, name: "김하나", user_id: "u2", status: "applied" },
    { id: 4, name: "김하나", user_id: "u3", status: "confirmed" },        // 앱 줄끼리 — 서로 다른 계정
    { id: 5, name: "이순신", user_id: null, status: "confirmed" },
    { id: 6, name: "이순신", user_id: null, status: "confirmed" },        // 대신 등록 줄끼리 — 신원 키가 다르다
    { id: 7, name: "박하나", user_id: "u4", status: "confirmed" },
    { id: 8, name: "박하나", user_id: null, status: "cancelled" },        // 취소된 줄은 자리가 없다
    { id: 9, name: "최믿음", user_id: "u5", status: "declined" },
    { id: 10, name: "최믿음", user_id: null, status: "applied" },         // 반려된 줄도
  ];
  assert.deepEqual([...maybeDupIds(rows)].sort((a, b) => a - b), [1, 2]);
  assert.equal(maybeDupIds([]).size, 0);
  assert.equal(maybeDupIds([{ id: 1, name: "", user_id: "u", status: "confirmed" }, { id: 2, name: " ", user_id: null, status: "confirmed" }]).size, 0);
  const three = maybeDupIds([{ id: 1, name: "a", user_id: "u", status: "confirmed" }, { id: 2, name: "a", user_id: null, status: "applied" },
    { id: 3, name: "a", user_id: "v", status: "waitlisted" }]);
  assert.deepEqual([...three].sort(), [1, 2, 3]);
});

test("waitOrder — 시각 이른 순 · 시각 없는 줄은 맨 뒤 · 같으면 id 순(edu_promote 와 같다)", () => {
  const rows = [
    { id: 1, waitlist_at: null },
    { id: 2, waitlist_at: "2027-01-05T01:00:00.000002+00:00" },
    { id: 3, waitlist_at: "2027-01-05T01:00:00.000001+00:00" },   // 마이크로초까지 본다
    { id: 4, waitlist_at: null },
    { id: 5, waitlist_at: "2027-01-05T01:00:00.000001+00:00" },
    { id: 6 },
  ];
  assert.deepEqual(rows.slice().sort(waitOrder).map((r) => r.id), [3, 5, 2, 1, 4, 6]);
});

test("seatsOpened — 선착순에서 자리가 늘 때만(정원 ↑ · 제한 없음으로 · 승인→선착순)", () => {
  assert.equal(seatsOpened({ capacity: 1, mode: "auto" }, { capacity: 3, mode: "auto" }), true);
  assert.equal(seatsOpened({ capacity: 3, mode: "auto" }, { capacity: null, mode: "auto" }), true);
  assert.equal(seatsOpened({ capacity: 3, mode: "approve" }, { capacity: 3, mode: "auto" }), true);
  assert.equal(seatsOpened({ capacity: 3, mode: "auto" }, { capacity: 3, mode: "auto" }), false, "제목만 고쳤다 — 일부러 대기로 둔 분을 올리지 않는다");
  assert.equal(seatsOpened({ capacity: 3, mode: "auto" }, { capacity: 2, mode: "auto" }), false);
  assert.equal(seatsOpened({ capacity: null, mode: "auto" }, { capacity: null, mode: "auto" }), false);
  assert.equal(seatsOpened({ capacity: null, mode: "auto" }, { capacity: 5, mode: "auto" }), false);
  assert.equal(seatsOpened({ capacity: 1, mode: "auto" }, { capacity: 9, mode: "approve" }), false, "승인 강좌는 올리지 않는다");
});

// ---------- 강좌별 담당자(2026-10-05) ----------
const M1 = "44444444-4444-4444-8444-444444444444", M2 = "55555555-5555-4555-8555-555555555555";

test("eduChief — super·education 만 모든 강좌 · educourse·다른 역할·이상한 값은 아니다", () => {
  assert.equal(eduChief(["education"]), true);
  assert.equal(eduChief(["super"]), true);
  assert.equal(eduChief(["educourse", "education"]), true);
  assert.equal(eduChief(["educourse"]), false);
  assert.equal(eduChief(["ministry", "directory"]), false);
  assert.equal(eduChief([]), false);
  assert.equal(eduChief(undefined), false);
  assert.equal(eduChief("education"), false);   // 글자 하나는 배열이 아니다(includes 로 「education」 안의 글자를 맞추지 않게)
});

test("checkStaffIds — uuid 배열만 · 겹친 것·대소문자는 하나로 · 빈 배열 = 담당자 없음 · 20분까지", () => {
  assert.deepEqual(checkStaffIds([]), { ok: true, ids: [] });
  assert.deepEqual(checkStaffIds([M2, M1, M1.toUpperCase(), ` ${M2} `]), { ok: true, ids: [M1, M2] });
  assert.deepEqual(checkStaffIds("x"), { ok: false, error: "bad-id" });
  assert.deepEqual(checkStaffIds(null), { ok: false, error: "bad-id" });
  assert.deepEqual(checkStaffIds([M1, "nope"]), { ok: false, error: "bad-id" });
  assert.deepEqual(checkStaffIds([M1, null]), { ok: false, error: "bad-id" });
  const many = Array.from({ length: EDU_STAFF_MAX + 1 }, (_, i) => `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`);
  assert.deepEqual(checkStaffIds(many), { ok: false, error: "too-many" });
  assert.equal(checkStaffIds(many.slice(0, EDU_STAFF_MAX)).ok, true);
});

test("staffByCourse · courseOut staff — 강좌별 [{id, name}] 이름 차례 · 없으면 빈 배열 · id·이름(·stale) 밖의 칸은 안 나간다", () => {
  const edu = new Set([M1, M2]);
  const by = staffByCourse([
    { course_id: "c1", member_id: M2, admin_members: { name: "박담당", status: "active" }, auth_user_id: "x" },
    { course_id: "c1", member_id: M1, admin_members: { name: "김담당", status: "active" } },
    { course_id: "c2", member_id: M1, admin_members: null },
    { course_id: null, member_id: M1 },
  ], edu);
  assert.deepEqual(by.get("c1"), [{ id: M1, name: "김담당" }, { id: M2, name: "박담당" }]);
  assert.deepEqual(by.get("c2"), [{ id: M1, name: "", stale: true }]);   // 담당자 줄을 못 읽으면 사용 중으로 보지 않는다
  const row = { id: "c1", title: "t", kind: "lecture", status: "open" }, n = { confirmed: 0, waitlisted: 0, applied: 0 };
  assert.deepEqual(courseOut(row, n).staff, []);
  assert.deepEqual(courseOut(row, n, [{ id: M1, name: "김담당", extra: 1 }]).staff, [{ id: M1, name: "김담당" }]);
  assert.deepEqual(courseOut(row, n, [{ id: M1, name: "김담당", stale: true, status: "disabled" }]).staff, [{ id: M1, name: "김담당", stale: true }]);
});

test("staffByCourse — stale: 정지·대기(사용 중 아님) 또는 교육 역할 없음 · 역할 목록을 안 주면 모두 stale", () => {
  const rows = [
    { course_id: "c1", member_id: M1, admin_members: { name: "가", status: "active" } },
    { course_id: "c1", member_id: M2, admin_members: { name: "나", status: "disabled" } },
  ];
  assert.deepEqual(staffByCourse(rows, new Set([M1, M2])).get("c1"), [{ id: M1, name: "가" }, { id: M2, name: "나", stale: true }]);
  assert.deepEqual(staffByCourse(rows, new Set([M2])).get("c1"), [{ id: M1, name: "가", stale: true }, { id: M2, name: "나", stale: true }]);
  assert.deepEqual(staffByCourse(rows).get("c1").map((x) => x.stale), [true, true]);
});

test("staffCandidateOut — id·이름·소속(교구 「기쁨 3목장」 · 교회학교 「중등부 2학년」)·교육 역할만", () => {
  assert.deepEqual(staffCandidateOut({ id: M1, name: " 김  담당 ", type: "교구", gu: "기쁨", mok: "3", auth_user_id: "x", kakao_avatar: "y" }, ["educourse", "ministry"]),
    { id: M1, name: "김 담당", who: "기쁨 3목장", roles: ["educourse"] });
  assert.deepEqual(staffCandidateOut({ id: M2, name: "박", type: "교회학교", bu: "중등부", grade: "2학년", gu: "x" }, ["education", "educourse"]),
    { id: M2, name: "박", who: "중등부 2학년", roles: ["education", "educourse"] });
});

// ---------- 출석부(2단계 · 2026-10-05) ----------
// 출석률 시험 경우 — 성경암송 tests/edu-front.test.cjs 와 같은 목록(두 앱이 같은 결과 · 고치면 두 곳을 함께)
const ATTEND_RATE_CASES = [
  [{ present: 5, late: 1, absent: 1, excused: 1 }, { attended: 6, denom: 7, pct: 86 }],
  [{ present: 0, late: 0, absent: 0, excused: 0 }, { attended: 0, denom: 0, pct: null }],
  [{ excused: 3 }, { attended: 0, denom: 0, pct: null }],
  [{ absent: 2 }, { attended: 0, denom: 2, pct: 0 }],
  [{ present: 2, late: 1 }, { attended: 3, denom: 3, pct: 100 }],
  [{ late: 4, absent: 1, excused: 2 }, { attended: 4, denom: 5, pct: 80 }],
  [{ present: 1, absent: 7 }, { attended: 1, denom: 8, pct: 13 }],
  [{ present: 29, absent: 171 }, { attended: 29, denom: 200, pct: 15 }],
  [{ present: 2, absent: 1 }, { attended: 2, denom: 3, pct: 67 }],
  [{ present: "3", late: null, absent: -1, excused: "x" }, { attended: 3, denom: 3, pct: 100 }],
  [{ present: 2.7, absent: 1.2 }, { attended: 2, denom: 3, pct: 67 }],
  [null, { attended: 0, denom: 0, pct: null }],
  [undefined, { attended: 0, denom: 0, pct: null }],
];

test("eduAttendRate — 지각=출석 · 공결은 분모에서 뺌 · 체크 안 한 회차는 없음 · 분모 0 이면 pct null · 반올림은 ×100 먼저", () => {
  for (const [input, want] of ATTEND_RATE_CASES) assert.deepEqual(eduAttendRate(input), want, JSON.stringify(input));
});

test("eduAttendRate — 함수 몸통은 export 없이 한 덩이(성경암송 js/edu.js 에 같은 글자로 옮겨 둔다)", () => {
  const src = readFileSync(new URL("../supabase/functions/church-admin/edu-rules.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const a = src.indexOf("function eduAttendRate(c) {");
  const b = src.indexOf("\n}\n", a);
  assert.ok(a > 0 && b > a, "함수를 못 찾았다");
  const body = src.slice(a, b + 2);
  assert.ok(!/:\s*(any|number|string|boolean)\b|=>/.test(body), "타입 표기·화살표 함수가 들어가면 성경암송(브라우저) 복사본과 같은 글자가 못 된다");
  assert.ok(src.includes("export { eduAttendRate };"));
});

test("checkAttendState — 네 값 · null·빈 값은 지움(allowNull) · 그 밖은 bad-state", () => {
  for (const s of ATTEND_STATES) assert.deepEqual(checkAttendState(s), { ok: true, state: s });
  assert.deepEqual(checkAttendState(" late "), { ok: true, state: "late" });
  assert.deepEqual(checkAttendState(null), { ok: true, state: null });
  assert.deepEqual(checkAttendState(""), { ok: true, state: null });
  assert.deepEqual(checkAttendState(null, false), { ok: false, error: "bad-state" });
  assert.deepEqual(checkAttendState("here"), { ok: false, error: "bad-state" });
  assert.deepEqual(checkAttendState("PRESENT"), { ok: false, error: "bad-state" });
});

test("attendKinds — 강사는 teacher 줄만 · 교육 담당은 manager·teacher · 담당 줄은 educourse 역할이 있을 때만", () => {
  assert.deepEqual(attendKinds(["teacher"]), ["teacher"]);
  assert.deepEqual(attendKinds(["educourse"]), ["manager", "teacher"]);
  assert.deepEqual(attendKinds(["educourse", "teacher"]), ["manager", "teacher"]);
  assert.deepEqual(attendKinds(["ministry"]), ["teacher"]);
  assert.deepEqual(attendKinds(null), ["teacher"]);
});

test("checkStaffKind·staffRolesFor — 없으면 manager · teacher · 그 밖은 bad-kind · 강사 후보는 강사·총괄·담당", () => {
  assert.deepEqual(checkStaffKind(undefined), { ok: true, kind: "manager" });
  assert.deepEqual(checkStaffKind("teacher"), { ok: true, kind: "teacher" });
  assert.deepEqual(checkStaffKind("manager"), { ok: true, kind: "manager" });
  assert.deepEqual(checkStaffKind("boss"), { ok: false, error: "bad-kind" });
  assert.deepEqual(staffRolesFor("manager"), ["educourse", "education"]);
  assert.deepEqual([...staffRolesFor("teacher")].sort(), ["education", "educourse", "teacher"]);
  assert.equal(EDU_TEACHER_ROLES.includes("super"), false);
  assert.deepEqual(staffCandidateOut({ id: "m", name: "강", type: "교구", gu: "기쁨", mok: "3" }, ["teacher", "ministry"], staffRolesFor("teacher")).roles, ["teacher"]);
  assert.deepEqual(staffCandidateOut({ id: "m", name: "강" }, ["teacher"]).roles, [], "담당 후보 목록(기본)에는 강사 역할을 보이지 않는다");
});

test("courseOut teachers — 강사 계정 [{id, name, stale?}] · 없으면 빈 배열 · 화면 글 teacher(teacher_label)와 별개", () => {
  const n = { confirmed: 0, waitlisted: 0, applied: 0 };
  const row = { id: "c1", title: "t", kind: "lecture", status: "open", teacher_label: "○○○ 목사" };
  assert.deepEqual(courseOut(row, n).teachers, []);
  const o = courseOut(row, n, [], [{ id: "m1", name: "강사", extra: 1 }, { id: "m2", name: "옛강사", stale: true, status: "disabled" }]);
  assert.deepEqual(o.teachers, [{ id: "m1", name: "강사" }, { id: "m2", name: "옛강사", stale: true }]);
  assert.equal(o.teacher, "○○○ 목사");
});

test("pickSession — 오늘 → 다음 → 마지막 · 날짜 차례 · 회차가 없으면 null", () => {
  const ss = [{ id: 30, no: 3, on_date: "2026-11-08" }, { id: 10, no: 1, on_date: "2026-10-25" }, { id: 20, no: 2, on_date: "2026-11-01" }];
  assert.equal(pickSession(ss, "2026-11-01"), 20);
  assert.equal(pickSession(ss, "2026-10-20"), 10);
  assert.equal(pickSession(ss, "2026-10-26"), 20);
  assert.equal(pickSession(ss, "2026-12-01"), 30);
  assert.equal(pickSession([], "2026-10-25"), null);
});

test("attendSessionOut·kstDate — 칸 · 시각 앞 다섯 자 · 한국 날짜", () => {
  assert.deepEqual(attendSessionOut({ id: 7, course_id: "c", no: 2, on_date: "2026-10-25", start_time: "19:30:00", end_time: null, topic: null }),
    { id: 7, no: 2, date: "2026-10-25", start: "19:30", end: null, topic: "", place: "" });
  assert.equal(kstDate(Date.parse("2026-10-24T15:00:00Z")), "2026-10-25");
  assert.equal(kstDate(Date.parse("2026-10-24T14:59:59Z")), "2026-10-24");
});

test("attendCounts·attendSummary — 사람마다 네 칸 수·출석률(eduAttendRate)·회차별 칸 · 다른 회차·모르는 값 무시 · 기준 미달 below · 칸 지도", () => {
  assert.deepEqual(attendCounts(["present", "late", null, "absent", "excused", "x"]),
    { present: 1, late: 1, absent: 1, excused: 1, marked: 4, attended: 2, denom: 3, pct: 67 });
  const sessions = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const people = [
    { id: 11, name: "나", who_type: "교구", group_name: "기쁨", sub_name: "3", user_id: "u1", ident_key: "k" },
    { id: 12, name: "가", who_type: "교구", group_name: "소망", sub_name: "1" },
    { id: 13, name: "다", who_type: "교회학교", group_name: "중등부", sub_name: "2학년" },
  ];
  const rows = [
    { enrollment_id: 11, session_id: 1, state: "present" }, { enrollment_id: 11, session_id: 2, state: "late" }, { enrollment_id: 11, session_id: 3, state: "absent" },
    { enrollment_id: 12, session_id: 1, state: "excused" },
    { enrollment_id: 12, session_id: 99, state: "absent" },          // 다른 강좌 회차 — 칸에 안 들어간다
    { enrollment_id: 99, session_id: 1, state: "present" },          // 확정이 아닌 분(명단 밖)
    { enrollment_id: 13, session_id: 2, state: "bogus" },
  ];
  const out = attendSummary(sessions, people, rows, 80);
  assert.deepEqual(out.map((p) => p.name), ["가", "나", "다"]);   // 이름 차례
  const by = Object.fromEntries(out.map((p) => [p.id, p]));
  assert.deepEqual(by[11].cells, ["present", "late", "absent"]);
  const { cells: _c, ...rest } = by[11];
  assert.deepEqual(rest, { id: 11, name: "나", who: "기쁨 3목장", present: 1, late: 1, absent: 1, excused: 0,
    marked: 3, attended: 2, denom: 3, pct: 67, below: true });
  assert.equal(by[11].pct, eduAttendRate({ present: 1, late: 1, absent: 1, excused: 0 }).pct);
  assert.deepEqual(by[12].cells, ["excused", null, null]);
  assert.equal(by[12].pct, null); assert.equal(by[12].below, false);   // 공결만 — 분모 0
  assert.deepEqual(by[13].cells, [null, null, null]);
  assert.equal(by[13].marked, 0);
  assert.equal(JSON.stringify(out).includes("u1") || JSON.stringify(out).includes("ident_key"), false);
  assert.deepEqual(Object.keys(by[11]).sort(), ["absent", "attended", "below", "cells", "denom", "excused", "id", "late", "marked", "name", "pct", "present", "who"]);
  // 기준이 없으면 below 는 늘 false
  assert.equal(attendSummary(sessions, people, rows, null).find((p) => p.id === 11).below, false);
});

test("attendExportRows — 머리(회차·날짜) · ○/지/결/공 · 빈칸 · 수 · 출석률(없으면 빈칸)", () => {
  const sessions = [{ no: 1, date: "2026-10-25" }, { no: 2, date: "2026-11-01" }];
  const people = [{ name: "가", who: "기쁨 3목장", cells: ["present", null], present: 1, late: 0, absent: 0, excused: 0, pct: 100 },
    { name: "나", who: "", cells: [null, "excused"], present: 0, late: 0, absent: 0, excused: 1, pct: null }];
  assert.deepEqual(attendExportRows({ title: "구원론", term: "2026 가을" }, sessions, people), [
    ["강좌", "학기", "이름", "소속", "1회 10/25", "2회 11/1", "출석", "지각", "결석", "공결", "출석률"],
    ["구원론", "2026 가을", "가", "기쁨 3목장", "○", "", "1", "0", "0", "0", "100%"],
    ["구원론", "2026 가을", "나", "", "", "공", "0", "0", "0", "1", ""],
  ]);
});
