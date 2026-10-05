import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATES, STATE_LABEL, STATE_MARK, NO_MARK, mdw, courseLabel, courseHint, orderCourses, courseOptions, initialCourse, sessionChip, sessionLine, isFuture,
  countRows, countsLine, nextState, remaining, bulkLabel, bulkAsk, bulkDoneText, buttonAria, attendErrorText, reloadAfter,
  summaryHead, belowCount, personCounts, pctText, cellsFor, attendFileName, EMPTY_ASSIGNED, NO_SESSIONS, NO_PEOPLE, CLOSED_NOTE,
} from "../js/menus/education/attendance-logic.js";
import { ATTEND_STATES, ATTEND_LABEL, ATTEND_MARK } from "../supabase/functions/church-admin/edu-rules.ts";
import { exportFileName } from "../js/menus/education/enrollments-logic.js";

test("상태 값·이름표·엑셀 표시가 서버(edu-rules.ts)와 같다", () => {
  assert.deepEqual(STATES, ATTEND_STATES);
  assert.deepEqual(STATE_LABEL, ATTEND_LABEL);
  assert.deepEqual(STATE_MARK, ATTEND_MARK);
  assert.equal(NO_MARK, "·");
});

test("mdw — 「11/8(일)」 · 틀린 날짜는 빈 글", () => {
  assert.equal(mdw("2026-11-08"), "11/8(일)");
  assert.equal(mdw("2026-10-25"), "10/25(일)");
  assert.equal(mdw("2027-03-03"), "3/3(수)");
  assert.equal(mdw("2026-02-30"), "");
  assert.equal(mdw(""), "");
  assert.equal(mdw(null), "");
});

const C = (id, o = {}) => ({ id, title: "강좌" + id, term: "2026 하반기", statusLabel: "진행 중", confirmed: 20, sessionsCount: 8, nextDate: "2026-11-08", hasToday: false, ...o });

test("강좌 — 오늘 수업이 있는 강좌가 먼저(그 밖의 차례는 서버 그대로) · 고르개 글", () => {
  const list = [C("a"), C("b", { hasToday: true }), C("c"), C("d", { hasToday: true })];
  assert.deepEqual(orderCourses(list).map((c) => c.id), ["b", "d", "a", "c"]);
  assert.deepEqual(orderCourses(null), []);
  assert.equal(courseLabel(C("a")), "강좌a · 2026 하반기 · 진행 중");
  assert.equal(courseLabel({ title: "t", term: "", statusLabel: "모집 중" }), "t · 학기 없음 · 모집 중");
  assert.equal(courseHint(C("a", { hasToday: true })), "오늘 수업 · 확정 20분");
  assert.equal(courseHint(C("a")), "다음 11/8(일) · 확정 20분");
  assert.equal(courseHint(C("a", { nextDate: null })), "회차를 모두 마쳤어요 · 확정 20분");
  assert.equal(courseHint(C("a", { nextDate: null, sessionsCount: 0, confirmed: 0 })), "회차 없음 · 확정 0분");
  assert.deepEqual(courseOptions(list).map((o) => o.value), ["b", "d", "a", "c"]);
  assert.deepEqual(courseOptions([C("a")])[0], { value: "a", label: "강좌a · 2026 하반기 · 진행 중", hint: "다음 11/8(일) · 확정 20분" });
});

test("initialCourse — 지난번 강좌 → 오늘 수업 → 하나뿐이면 그것 → 없음", () => {
  const list = [C("a"), C("b", { hasToday: true }), C("c")];
  assert.equal(initialCourse(list, "c").id, "c");
  assert.equal(initialCourse(list, "zz").id, "b");          // 기억한 강좌가 없어졌으면 오늘 수업
  assert.equal(initialCourse(list, "").id, "b");
  assert.equal(initialCourse([C("a"), C("c")], ""), null);   // 오늘 수업이 없고 여럿이면 고르게 한다
  assert.equal(initialCourse([C("a")], "").id, "a");
  assert.equal(initialCourse([], "a"), null);
});

test("회차 칩 「3회 11/8(일) · 12/20」 · 회차 한 줄 · 앞날 회차", () => {
  assert.equal(sessionChip({ no: 3, date: "2026-11-08", marked: 12 }, 20), "3회 11/8(일) · 12/20");
  assert.equal(sessionChip({ no: 1, date: "", marked: 0 }, 0), "1회 · 0/0");
  assert.equal(sessionLine({ no: 3, date: "2026-11-08", start: "14:00", end: "15:30", topic: "성화" }), "3회 · 11/8(일) 14:00~15:30 · 성화");
  assert.equal(sessionLine({ no: 1, date: "2026-10-25", start: "14:00", end: null, topic: "" }), "1회 · 10/25(일) 14:00");
  assert.equal(sessionLine({ no: 2, date: "2026-11-01", start: null, end: null, topic: "" }), "2회 · 11/1(일)");
  assert.equal(sessionLine(null), "");
  assert.equal(isFuture({ date: "2026-11-08" }, "2026-10-25"), true);
  assert.equal(isFuture({ date: "2026-10-25" }, "2026-10-25"), false);
  assert.equal(isFuture({ date: "2026-10-18" }, "2026-10-25"), false);
  assert.equal(isFuture({ date: "" }, "2026-10-25"), false);
});

test("countRows · countsLine — 「체크 12/20 · 출석 10 · 지각 1 · 결석 1 · 공결 0」", () => {
  const rows = [
    ...Array.from({ length: 10 }, () => ({ state: "present" })), { state: "late" }, { state: "absent" },
    ...Array.from({ length: 8 }, () => ({ state: null })),
  ];
  const c = countRows(rows);
  assert.deepEqual(c, { present: 10, late: 1, absent: 1, excused: 0, marked: 12, total: 20 });
  assert.equal(countsLine(c), "체크 12/20 · 출석 10 · 지각 1 · 결석 1 · 공결 0");
  assert.deepEqual(countRows([{ state: "x" }, { state: "excused" }]), { present: 0, late: 0, absent: 0, excused: 1, marked: 1, total: 2 });
  assert.deepEqual(countRows(null), { present: 0, late: 0, absent: 0, excused: 0, marked: 0, total: 0 });
});

test("nextState — 다른 단추는 그 상태 · 켜진 단추를 다시 누르면 지움(null) · 모르는 값은 그대로", () => {
  assert.equal(nextState(null, "present"), "present");
  assert.equal(nextState("present", "late"), "late");
  assert.equal(nextState("present", "present"), null);
  assert.equal(nextState("excused", "excused"), null);
  assert.equal(nextState("late", "x"), "late");
  assert.equal(nextState(undefined, "x"), null);
});

test("「남은 N분 모두 출석」 — 수 · 단추 글 · 확인 글 · 끝난 뒤 알림", () => {
  assert.equal(remaining({ total: 20, marked: 12 }), 8);
  assert.equal(remaining({ total: 3, marked: 3 }), 0);
  assert.equal(remaining({ total: 1, marked: 5 }), 0);
  assert.equal(remaining(null), 0);
  assert.equal(bulkLabel(8), "남은 8분 모두 출석");
  assert.equal(bulkAsk(8), "아직 체크하지 않은 8분을 모두 「출석」으로 할까요? 이미 체크한 분은 그대로예요.");
  assert.equal(bulkDoneText(8), "8분을 출석으로 체크했어요");
  assert.equal(bulkDoneText(0), "새로 체크할 분이 없었어요");
  assert.equal(buttonAria("가나다", "late", false), "가나다 지각");
  assert.equal(buttonAria("가나다", "present", true), "가나다 출석 (다시 누르면 지워요)");
});

test("오류 말 — 출석부가 받는 코드 · 모르면 빈 글(공용 errorText 로) · 무엇을 다시 불러올지", () => {
  assert.equal(attendErrorText({ error: "course-closed" }), "마친 강좌는 출석을 고칠 수 없어요");
  assert.equal(attendErrorText({ error: "not-confirmed" }), "확정된 분만 체크할 수 있어요");
  assert.equal(attendErrorText({ error: "not-assigned" }), "맡은 강좌가 아니에요");
  for (const c of ["wrong-course", "bad-state", "not-found", "bad-id"]) assert.ok(attendErrorText({ error: c }), c);
  assert.equal(attendErrorText({ error: "network" }), "");
  assert.equal(attendErrorText(null), "");
  assert.equal(reloadAfter("not-assigned"), "courses");
  for (const c of ["course-closed", "not-confirmed", "wrong-course", "not-found"]) assert.equal(reloadAfter(c), "sheet", c);
  for (const c of ["network", "bad-state", "server", undefined]) assert.equal(reloadAfter(c), "", String(c));
});

test("출석 현황 — 머리 · 기준 미달 수 · 한 분 줄 · 출석률 글", () => {
  const people = [{ below: true }, { below: false }, { below: true }];
  assert.equal(summaryHead({ attendPct: 80 }, [1, 2, 3], people), "확정 3분 · 회차 3 · 수료 기준 80%");
  assert.equal(summaryHead({ attendPct: null }, [], []), "확정 0분 · 회차 0");
  assert.equal(belowCount(people), 2);
  assert.equal(belowCount(null), 0);
  assert.equal(personCounts({ present: 5, late: 1, absent: 1, excused: 0 }), "출석 5 · 지각 1 · 결석 1 · 공결 0");
  assert.equal(personCounts({}), "출석 0 · 지각 0 · 결석 0 · 공결 0");
  assert.equal(pctText({ pct: 86 }), "86%");
  assert.equal(pctText({ pct: 0 }), "0%");
  assert.equal(pctText({ pct: null }), "—");
});

test("cellsFor — 회차 차례로 ○·지·결·공·「·」", () => {
  const sessions = [{ no: 1, date: "2026-10-25" }, { no: 2, date: "2026-11-01" }, { no: 3, date: "2026-11-08" }, { no: 4, date: "2026-11-15" }, { no: 5, date: "2026-11-22" }];
  const cells = cellsFor({ cells: ["present", "late", null, "excused", "bogus"] }, sessions);
  assert.deepEqual(cells.map((c) => c.mark), ["○", "지", "·", "공", "·"]);
  assert.deepEqual(cells.map((c) => c.label), ["출석", "지각", "체크 전", "공결", "체크 전"]);
  assert.deepEqual(cells[0], { no: 1, date: "10/25(일)", state: "present", mark: "○", label: "출석" });
  assert.deepEqual(cellsFor({ cells: [] }, sessions.slice(0, 1)).map((c) => c.mark), ["·"]);   // 칸이 모자라면 체크 전
  assert.equal(cellsFor({ cells: ["absent"] }, sessions.slice(0, 1))[0].mark, "결");
});

test("attendFileName — 출석_{제목}_{오늘}.xlsx · 제목 다듬기는 신청 현황 엑셀과 같다", () => {
  assert.equal(attendFileName("구원론 3차", "2026-10-25"), "출석_구원론 3차_2026-10-25.xlsx");
  assert.equal(attendFileName('a/b\\c:d*e?f"g<h>i|j', "2026-10-25"), "출석_abcdefghij_2026-10-25.xlsx");
  assert.equal(attendFileName("///", "2026-10-25"), "출석_강좌_2026-10-25.xlsx");
  assert.equal(attendFileName("끝에 점. ", "2026-10-25"), "출석_끝에 점_2026-10-25.xlsx");
  for (const t of ["제자 훈련", "a/b", "...", "가".repeat(80)]) {
    assert.equal(attendFileName(t, "d").replace(/^출석_/, ""), exportFileName(t, "d").replace(/^교육신청_/, ""), t);
  }
});

test("안내 글 — 해요체 · 비어 있지 않다", () => {
  for (const t of [EMPTY_ASSIGNED, NO_SESSIONS, NO_PEOPLE, CLOSED_NOTE]) assert.match(t, /요$/);
});
