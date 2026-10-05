// 📊 교육 통계 화면 논리(js/menus/education/stats-logic.js · 교육신청 4단계 C · 2026-10-06) — 순수 시험 · preflight 가 돈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { termOptions, termLabel, pctText, nText, COURSE_COLS, cellText, courseSub, groupLabel, groupKind, sortGroups, groupRate, groupTotal,
  statsSheets, statsFileName, NO_COURSES, NO_TERM_COURSES, STATS_NOTE } from "../js/menus/education/stats-logic.js";
import { statsOut } from "../supabase/functions/church-admin/edu-rules.ts";

const D = statsOut({
  term: null,
  courses: [
    { id: "c2", title: "교사 대학", term: "2027 상반기", status: "running", applied: 0, confirmed: 3, waitlisted: 0, cancelled: 1, declined: 0,
      completed: 2, attend_n: 2, attend_sum: 175 },
    { id: "c1", title: "제자훈련 1단계", term: "", status: "open", applied: 2, confirmed: 0, waitlisted: 1, cancelled: 1, declined: 1,
      completed: 0, attend_n: 0, attend_sum: 0 },
  ],
  groups: [
    { who_type: "새가족", group_name: "", confirmed: 1, completed: 0 },
    { who_type: "교회학교", group_name: "중등부", confirmed: 1, completed: 1 },
    { who_type: "교구", group_name: "화평", confirmed: 1, completed: 1 },
    { who_type: "", group_name: "", confirmed: 1, completed: 0 },
    { who_type: "교구", group_name: "믿음", confirmed: 0, completed: 0 },
    { who_type: "교회학교", group_name: "소년2부", confirmed: 1, completed: 0 },
    { who_type: "교회학교", group_name: "유년부", confirmed: 1, completed: 0 },
    { who_type: "교구", group_name: "청년", confirmed: 1, completed: 0 },
  ],
  terms: ["2027 상반기"],
});

test("학기 고르기 — 「전체」(값 \"\") + 서버 학기 차례 그대로 · 단추 글", () => {
  assert.deepEqual(termOptions(["2027 상반기", "2026 하반기"]), [{ value: "", label: "전체" }, { value: "2027 상반기", label: "2027 상반기" },
    { value: "2026 하반기", label: "2026 하반기" }]);
  assert.deepEqual(termOptions(undefined), [{ value: "", label: "전체" }]);
  assert.equal(termLabel(""), "전체");
  assert.equal(termLabel("2027 상반기"), "2027 상반기");
});

test("숫자·% 글 — 천 단위 쉼표 · 나눌 것이 없으면 「—」 · 표 칸 여덟(신청·확정·대기·취소·반려·평균 출석률·수료·수료율)", () => {
  assert.equal(nText(1234), "1,234");
  assert.equal(nText(undefined), "0");
  assert.equal(pctText(87), "87%");
  assert.equal(pctText(0), "0%");
  assert.equal(pctText(null), "—");
  assert.equal(pctText(NaN), "—");
  assert.deepEqual(COURSE_COLS.map(([, l]) => l), ["신청", "확정", "대기", "취소", "반려", "평균 출석률", "수료", "수료율"]);
  assert.deepEqual(COURSE_COLS.map(([k]) => cellText(D.courses[0], k)), ["0", "3", "0", "1", "0", "88%", "2", "67%"]);
  assert.deepEqual(COURSE_COLS.map(([k]) => cellText(D.courses[1], k)), ["2", "0", "1", "1", "1", "—", "0", "—"]);
  assert.deepEqual(COURSE_COLS.map(([k]) => cellText(D.total, k)), ["2", "3", "1", "2", "1", "88%", "2", "67%"]);
});

test("강좌 아래 작은 줄 — 「전체」를 볼 때만 학기(빈 학기는 「학기 없음」) · 상태는 늘", () => {
  assert.equal(courseSub(D.courses[0], true), "2027 상반기 · 진행 중");
  assert.equal(courseSub(D.courses[1], true), "학기 없음 · 모집 중");
  assert.equal(courseSub(D.courses[0], false), "진행 중");
});

test("소속 — 이름·구분 · 차례(교구 GU 차례 → 그 밖 교구 → 교회학교 BU 차례 → 그 밖 부서 → 직접 입력 → 소속 없음)", () => {
  const list = sortGroups(D.groups);
  assert.deepEqual(list.map(groupLabel), ["믿음", "화평", "청년", "유년부", "중등부", "소년2부", "새가족", "소속 없음"]);
  assert.deepEqual(list.map(groupKind), ["교구", "교구", "교구", "교회학교", "교회학교", "교회학교", "직접 입력", ""]);
  assert.equal(groupLabel({ whoType: "새가족", group: "10월" }), "새가족 · 10월");
  assert.equal(groupLabel({ whoType: "교구", group: "" }), "소속 없음");
  assert.equal(groupRate({ confirmed: 3, completed: 2 }), 67);
  assert.equal(groupRate({ confirmed: 0, completed: 0 }), null);
  assert.deepEqual(groupTotal(D.groups), { confirmed: 7, completed: 2, completeRate: 29 });
  assert.equal(D.groups[0].whoType, "새가족", "sortGroups 는 받은 배열을 바꾸지 않는다");
});

test("엑셀 두 장 — 강좌별(학기·강좌·상태·수 여덟 · 맨 아래 합계) · 교구·부서별(구분·소속·확정·수료·수료율 · 합계) · 수는 숫자 칸 · 없는 %는 빈칸", () => {
  const s = statsSheets(D);
  assert.deepEqual(s.courses[0], ["학기", "강좌", "상태", "신청", "확정", "대기", "취소", "반려", "평균 출석률(%)", "수료", "수료율(%)"]);
  assert.deepEqual(s.courses[1], ["2027 상반기", "교사 대학", "진행 중", 0, 3, 0, 1, 0, 88, 2, 67]);
  assert.deepEqual(s.courses[2], ["", "제자훈련 1단계", "모집 중", 2, 0, 1, 1, 1, "", 0, ""]);
  assert.deepEqual(s.courses[3], ["합계", "강좌 2개", "", 2, 3, 1, 2, 1, 88, 2, 67]);
  assert.equal(s.courses.length, 4);
  assert.deepEqual(s.groups[0], ["구분", "교구·부서", "확정", "수료", "수료율(%)"]);
  assert.deepEqual(s.groups[1], ["교구", "믿음", 0, 0, ""]);
  assert.deepEqual(s.groups[2], ["교구", "화평", 1, 1, 100]);
  assert.deepEqual(s.groups.at(-1), ["합계", "", 7, 2, 29]);
  assert.equal(s.groups.length, 10);
  for (const row of [...s.courses, ...s.groups]) for (const v of row) assert.ok(typeof v === "number" || typeof v === "string", JSON.stringify(row));
  const e = statsSheets(statsOut(null));
  assert.deepEqual(e.courses.at(-1), ["합계", "강좌 0개", "", 0, 0, 0, 0, 0, "", 0, ""]);
});

test("파일 이름 — 교육통계_{학기 또는 전체}_{오늘}.xlsx · 학기는 신청 현황·출석 엑셀과 같은 다듬기(못 쓰는 글자 빼기)", () => {
  assert.equal(statsFileName("", "2026-10-06"), "교육통계_전체_2026-10-06.xlsx");
  assert.equal(statsFileName("2027 상반기", "2026-10-06"), "교육통계_2027 상반기_2026-10-06.xlsx");
  assert.equal(statsFileName('2027/1:"상"', "2026-10-06"), "교육통계_20271상_2026-10-06.xlsx");
});

test("빈 화면·안내 글은 해요체 한 줄", () => {
  for (const s of [NO_COURSES, NO_TERM_COURSES, STATS_NOTE]) {
    assert.equal(/[\r\n]/.test(s), false);
    assert.ok(/요/.test(s), s);
  }
});
