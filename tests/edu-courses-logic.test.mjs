import { test } from "node:test";
import assert from "node:assert/strict";
import { formToCourse, courseToForm, sessionsSummary, KIND_OPTIONS, makeSessionRows, sessionErrorText, courseErrorText } from "../js/menus/education/courses-logic.js";

test("formToCourse — 빈 정원은 null · 숫자는 숫자", () => {
  assert.equal(formToCourse({ title: "a", kind: "lecture", capacity: "" }).capacity, null);
  assert.equal(formToCourse({ title: "a", kind: "lecture", capacity: "12" }).capacity, 12);
  assert.equal(formToCourse({ title: "a", kind: "lecture", waitlist: "off" }).waitlist, false);
});

test("courseToForm ↔ formToCourse 되돌림", () => {
  const c = { id: "x", title: "제자훈련", kind: "regular", term: "2027 상반기", capacity: 20, mode: "approve", waitlist: true,
    applyFrom: "2027-01-03", applyTo: "2027-01-24", attendPct: 80, checkLabel: "과제", status: "open", description: "설명",
    teacher: "○○○ 목사", place: "3층", fee: "교재비 1만 원", target: "새가족반 수료", track: "discipleship-1", prereq: [] };
  const back = formToCourse(courseToForm(c));
  assert.equal(back.mode, "approve");
  assert.equal(back.apply_to, "2027-01-24");
  assert.equal(back.check_label, "과제");
  assert.equal(back.teacher_label, "○○○ 목사");
  assert.equal(back.fee_note, "교재비 1만 원");
  assert.equal(back.attend_pct, 80);
  assert.equal(back.id, "x");
});

test("sessionsSummary", () => {
  assert.equal(sessionsSummary([]), "회차 없음");
  assert.equal(sessionsSummary([{ no: 1, on_date: "2027-03-03" }]), "3/3(수) 1회");
  assert.equal(sessionsSummary([1, 2, 3].map((n, i) => ({ no: n, on_date: ["2027-03-03", "2027-03-10", "2027-03-17"][i] }))), "3/3(수) ~ 3/17(수) · 3회");
});

test("KIND_OPTIONS — 세 종류", () => {
  assert.deepEqual(KIND_OPTIONS.map((o) => o.value), ["regular", "lecture", "training"]);
});

test("makeSessionRows — 매주 8회 · 3/3(수) ~ 4/21(수)", () => {
  const rows = makeSessionRows("2027-03-03", 8, 7, { start_time: "19:30", end_time: "21:00" });
  assert.equal(rows.length, 8);
  assert.equal(rows[7].on_date, "2027-04-21");
  assert.equal(rows[0].start_time, "19:30");
  assert.equal(sessionsSummary(rows), "3/3(수) ~ 4/21(수) · 8회");
  assert.deepEqual(makeSessionRows("", 3), []);
  assert.deepEqual(makeSessionRows("2027-03-03", 0), []);
});

test("오류 글 — 회차·강좌", () => {
  assert.equal(sessionErrorText({ error: "course-closed" }), "끝난 강좌는 회차를 바꿀 수 없어요");
  assert.equal(sessionErrorText({ error: "bad-rows" }), "회차 칸을 확인해 주세요");
  for (const e of ["bad-no", "bad-date", "dup-no", "too-many"]) assert.ok(sessionErrorText({ error: e }), e);
  assert.equal(sessionErrorText({ error: "zzz" }), "");
  assert.ok(courseErrorText({ error: "bad-range" }));
});
