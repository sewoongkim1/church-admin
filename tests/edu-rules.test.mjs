import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCourse, makeSessions, checkSessions, courseOut, enrollOut, exportRows, ENROLL_STATUS_LABEL,
  checkTypedIdent, rosterIdentity, rosterIdent }
  from "../supabase/functions/church-admin/edu-rules.ts";

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
  for (const bad of [{ name: "a|b" }, { name: "x", who_type: "a|b" }, { name: "x", group_name: "a|b" }, { name: "x", sub_name: "a|b" },
    { name: "" }, { name: "가".repeat(41) }, { name: "x", group_name: "가".repeat(41) }, { name: "x", sub_name: "1".repeat(41) },
    { name: "x", who_type: "가".repeat(41) }, { name: 'a"b' }]) {
    assert.deepEqual(checkTypedIdent(bad), { ok: false, error: "bad-ident" }, JSON.stringify(bad));
  }
  assert.equal(checkTypedIdent({ name: "가".repeat(40), group: "가".repeat(40) }).ok, true);
});
