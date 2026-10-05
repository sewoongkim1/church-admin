import { test } from "node:test";
import assert from "node:assert/strict";
import { formToCourse, courseToForm, sessionsSummary, KIND_OPTIONS, makeSessionRows, sessionErrorText, courseErrorText, checkFormNumbers, sessionHeadLine, courseSavedText, periodSummary,
  staffLine, staffOptions, staffFieldText, sameIds, staffSaveFailText, STAFF_NO_CAND, staffBits, STALE_MARK, STALE_HINT } from "../js/menus/education/courses-logic.js";

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

test("교육 기간 — 폼 ↔ 서버 값 되돌림 · 빈 값 · 오류 글", () => {
  const c = { id: "x", title: "t", kind: "regular", startsOn: "2027-03-03", endsOn: "2027-05-19" };
  const f = courseToForm(c);
  assert.equal(f.startsOn, "2027-03-03");
  const back = formToCourse(f);
  assert.equal(back.starts_on, "2027-03-03");
  assert.equal(back.ends_on, "2027-05-19");
  const none = formToCourse(courseToForm({ id: "y", title: "t", kind: "regular", startsOn: null, endsOn: null }));
  assert.equal(none.starts_on, "");
  assert.equal(none.ends_on, "");
  assert.equal(courseErrorText({ error: "bad-period" }), "교육 종료일이 시작일보다 빨라요");
});

test("periodSummary — 기간이 있으면 「교육 3/3(수) ~ 5/19(수)」, 없으면 회차 요약", () => {
  assert.equal(periodSummary({ startsOn: "2027-03-03", endsOn: "2027-05-19" }, []), "교육 3/3(수) ~ 5/19(수) · 회차 없음");
  assert.equal(periodSummary({ startsOn: "2027-03-03", endsOn: "2027-05-19" }, [{ no: 1, on_date: "2027-03-03" }, { no: 2, on_date: "2027-03-10" }]), "교육 3/3(수) ~ 5/19(수) · 2회");
  assert.equal(periodSummary({ startsOn: "2027-03-03", endsOn: "2027-03-03" }, []), "교육 3/3(수) · 회차 없음");
  assert.equal(periodSummary({ startsOn: "2027-03-03" }, []), "교육 3/3(수)부터 · 회차 없음");
  assert.equal(periodSummary({ endsOn: "2027-05-19" }, []), "교육 5/19(수)까지 · 회차 없음");
  assert.equal(periodSummary({}, []), "회차 없음");
  const ss = [{ no: 1, on_date: "2027-03-03" }, { no: 2, on_date: "2027-03-10" }];
  assert.equal(periodSummary({ startsOn: null, endsOn: null }, ss), sessionsSummary(ss));
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

import { courseFormHtml } from "../js/menus/education/courses.js";

// 폼 HTML 의 data-f 칸을 읽어 값으로(브라우저 readForm 과 같은 일 — DOM 없이)
const fieldsOf = (html) => Object.fromEntries([...html.matchAll(/data-f="(\w+)"[^>]*?value="([^"]*)"/g)].map((m) => [m[1], m[2]]));

test("고치기 폼 — id 가 폼 값에 실리고 payload 까지 살아남는다(없으면 새 강좌가 생긴다)", () => {
  const c = { id: "11111111-1111-1111-1111-111111111111", title: "제자훈련", kind: "regular", term: "t", capacity: 20, mode: "auto",
    waitlist: true, applyFrom: null, applyTo: null, attendPct: 80, checkLabel: null, status: "draft", description: "", teacher: "", place: "",
    fee: "", target: "", track: "", prereq: [] };
  const vals = fieldsOf(courseFormHtml(courseToForm(c), false));
  assert.equal(vals.id, c.id);
  assert.equal(formToCourse(vals).id, c.id);
  assert.equal(vals.title, "제자훈련");
});

test("고치기 폼 — 교육 시작일·종료일이 폼 칸에 실리고 payload 까지 간다", () => {
  const c = { id: "11111111-1111-1111-1111-111111111111", title: "t", kind: "regular", term: "", capacity: null, mode: "auto", waitlist: true,
    applyFrom: "2027-02-01", applyTo: "2027-02-28", startsOn: "2027-03-03", endsOn: "2027-05-19", attendPct: 80, status: "draft", prereq: [] };
  const html = courseFormHtml(courseToForm(c), false);
  const vals = fieldsOf(html);
  assert.equal(vals.startsOn, "2027-03-03");
  assert.equal(vals.endsOn, "2027-05-19");
  assert.ok(html.includes("교육 시작일") && html.includes("교육 종료일"));
  assert.ok(html.indexOf("신청 마감일") < html.indexOf("교육 시작일"), "신청 기간 다음에 온다");
  const body = formToCourse(vals);
  assert.equal(body.starts_on, "2027-03-03");
  assert.equal(body.ends_on, "2027-05-19");
});

test("새 강좌 폼 — id 칸은 비고 payload 에 id 가 없다", () => {
  const vals = fieldsOf(courseFormHtml({ id: "", title: "", kind: "regular", term: "", capacity: "", mode: "auto", waitlist: "on", status: "draft",
    attendPct: 80, applyFrom: "", applyTo: "", prereq: [] }, true));
  assert.equal(vals.id, "");
  assert.equal("id" in formToCourse(vals), false);
});

test("checkFormNumbers — 정원·출석률", () => {
  assert.equal(checkFormNumbers({ capacity: "", attendPct: "" }), "");
  assert.equal(checkFormNumbers({ capacity: "12", attendPct: "80" }), "");
  assert.equal(checkFormNumbers({ capacity: "20명", attendPct: "" }), "정원은 숫자로 적어 주세요");
  assert.equal(checkFormNumbers({ capacity: "", attendPct: "abc" }), "출석률은 0~100 숫자로 적어 주세요");
  assert.equal(checkFormNumbers({ capacity: "", attendPct: "101" }), "출석률은 0~100 숫자로 적어 주세요");
  assert.equal(formToCourse({ title: "a", capacity: "", attendPct: "" }).attend_pct, 80);
  assert.equal(formToCourse({ title: "a", capacity: "" }).capacity, null);
});

test("sessionHeadLine — 「2회 · 3/10(수) 19:30~21:00」", () => {
  assert.equal(sessionHeadLine({ no: 2, on_date: "2027-03-10", start_time: "19:30", end_time: "21:00" }), "2회 · 3/10(수) 19:30~21:00");
  assert.equal(sessionHeadLine({ no: 1, on_date: "2027-03-10", start_time: "19:30", end_time: "" }), "1회 · 3/10(수) 19:30");
  assert.equal(sessionHeadLine({ no: 3, on_date: "", start_time: "", end_time: "" }), "3회 · 날짜를 골라 주세요");
});

test("courseSavedText — 정원을 늘려 대기하신 분이 확정되면 그 수를 함께(최종 검토 2026-10-05)", () => {
  assert.equal(courseSavedText(0), "저장했어요");
  assert.equal(courseSavedText(undefined), "저장했어요");
  assert.equal(courseSavedText(2), "저장했어요 — 대기하신 2분이 확정됐어요");
});

// ---------- 강좌별 담당자(2026-10-05) ----------
test("staffLine — 「담당 김OO, 박OO」 · 없으면 「담당 없음」", () => {
  assert.equal(staffLine({ staff: [{ id: "a", name: "김담당" }, { id: "b", name: "박담당" }] }), "담당 김담당, 박담당");
  assert.equal(staffLine({ staff: [] }), "담당 없음");
  assert.equal(staffLine({}), "담당 없음");
  assert.equal(staffLine(null), "담당 없음");
});

test("staffOptions — 후보(소속 · 교육 총괄 표시) + 지금 맡았지만 후보가 아닌 분(stale)은 「역할 없음 — 빼 주세요」", () => {
  const cands = [{ id: "a", name: "김담당", who: "기쁨 3목장", roles: ["educourse"] }, { id: "b", name: "박총괄", who: "", roles: ["education", "educourse"] }];
  assert.deepEqual(staffOptions(cands, [{ id: "a", name: "김담당" }, { id: "z", name: "옛담당", stale: true }]), [
    { value: "a", label: "김담당", hint: "기쁨 3목장" },
    { value: "b", label: "박총괄", hint: "교육 총괄" },
    { value: "z", label: "옛담당", hint: "역할 없음 — 빼 주세요", stale: true },
  ]);
  // 후보에 들어 있는데 서버가 stale 로 준 경우(드묾)도 표시는 stale 로
  assert.deepEqual(staffOptions(cands, [{ id: "a", name: "김담당", stale: true }])[0], { value: "a", label: "김담당", hint: STALE_HINT, stale: true });
  assert.deepEqual(staffOptions([], []), []);
  assert.deepEqual(staffOptions(null, null), []);
});

test("staffFieldText · sameIds · staffSaveFailText · 안내 글", () => {
  const opts = [{ value: "a", label: "김담당" }, { value: "b", label: "박담당" }];
  assert.equal(staffFieldText(["b", "a"], opts), "박담당, 김담당");
  assert.equal(staffFieldText([], opts), "담당자 없음");
  assert.equal(staffFieldText(["x"], opts), "담당자 없음");
  assert.equal(sameIds(["a", "b"], ["b", "a"]), true);
  assert.equal(sameIds(["a"], ["a", "b"]), false);
  assert.equal(sameIds([], undefined), true);
  assert.match(staffSaveFailText("맡은 강좌가 아니에요"), /^강좌는 저장했어요 — 담당자는 저장하지 못했어요 \(맡은 강좌가 아니에요\)/);
  assert.equal(STAFF_NO_CAND, "⚙️ 담당자·역할에서 「교육 담당(맡은 강좌)」 역할을 먼저 주세요");
});

test("고치기 폼 — 담당자 칸(고른 분 이름 · 숨은 칸 JSON) · 후보가 없으면 역할 안내 · 후보를 못 불러오면 잠금", () => {
  const v = { id: "x", title: "t", kind: "regular", term: "", capacity: "", mode: "auto", waitlist: "on", status: "draft", attendPct: 80, applyFrom: "", applyTo: "", prereq: [] };
  const opts = [{ value: "a", label: "김담당" }, { value: "b", label: "박담당" }];
  const html = courseFormHtml(v, false, { ids: ["b"], opts, cands: [{ id: "a" }, { id: "b" }] });
  assert.ok(html.includes("담당자") && html.includes("data-staff") && html.includes("박담당"));
  assert.ok(html.includes('data-f="staff" value="[&quot;b&quot;]"'), "고른 id 가 숨은 칸에");
  assert.ok(!html.includes(STAFF_NO_CAND));
  assert.ok(html.indexOf("강사") < html.indexOf("data-staff"), "강사 칸 다음에 온다");
  const none = courseFormHtml(v, false, { ids: [], opts: [], cands: [] });
  assert.ok(none.includes("담당자 없음") && none.includes("⚙️ 담당자·역할에서"));
  assert.ok(none.includes("「교육 담당(맡은 강좌)」 역할을 먼저 주세요"));
  const failed = courseFormHtml(v, false, { ids: [], opts: [], cands: null });
  assert.ok(failed.includes("담당자 후보를 불러오지 못했어요") && /data-staff[^>]*disabled/.test(failed));
  // 옛 부름(셋째 인자 없음)도 그린다 — 후보 없음으로
  assert.ok(courseFormHtml(v, true).includes("data-staff"));
  // 담당자는 강좌 저장(formToCourse)에 섞이지 않는다 — eduStaffSet 이 따로 보낸다
  assert.equal("staff" in formToCourse({ ...v, staff: ["a"] }), false);
});

test("stale 담당 — 카드 글 「이름(역할 없음)」 · staffBits · 폼 단추 글에도 표시", () => {
  const c = { staff: [{ id: "a", name: "김담당" }, { id: "z", name: "옛담당", stale: true }, { id: "y", name: "" }] };
  assert.deepEqual(staffBits(c), [{ name: "김담당", stale: false }, { name: "옛담당", stale: true }]);
  assert.equal(staffLine(c), "담당 김담당, 옛담당(역할 없음)");
  assert.equal(STALE_MARK, "(역할 없음)");
  const opts = staffOptions([{ id: "a", name: "김담당", who: "", roles: ["educourse"] }], c.staff);
  assert.equal(staffFieldText(["a", "z"], opts), "김담당, 옛담당(역할 없음)");
});

// ---------- 강사(출석부 · 2단계 2026-10-05) ----------
import { teacherBits, teacherLine, TEACHER_NO_CAND, TEACHER_ROLE_HINTS, TEACHER_BAD_MEMBER, STAFF_ROLE_HINTS } from "../js/menus/education/courses-logic.js";

test("회차 창 has-attendance — 「출석이 있는 회차(3회, 5회)는 지울 수 없어요」(창은 그대로)", () => {
  assert.equal(sessionErrorText({ ok: false, error: "has-attendance", nos: [3, 5] }), "출석이 있는 회차(3회, 5회)는 지울 수 없어요");
  assert.equal(sessionErrorText({ ok: false, error: "has-attendance", nos: [8] }), "출석이 있는 회차(8회)는 지울 수 없어요");
  assert.equal(sessionErrorText({ ok: false, error: "has-attendance", nos: ["2", "x", -1] }), "출석이 있는 회차(2회)는 지울 수 없어요");
  assert.equal(sessionErrorText({ ok: false, error: "has-attendance" }), "출석이 있는 회차는 지울 수 없어요");
});

test("teacherBits · teacherLine — 「강사 김OO, 박OO(역할 없음)」 · 없으면 빈 글(카드에 줄 없음) · 글 칸 teacher 와 별개", () => {
  const c = { teacher: "가나다 목사", teachers: [{ id: "t1", name: "김강사" }, { id: "t2", name: "옛강사", stale: true }, { id: "t3", name: "" }] };
  assert.deepEqual(teacherBits(c), [{ name: "김강사", stale: false }, { name: "옛강사", stale: true }]);
  assert.equal(teacherLine(c), "강사 김강사, 옛강사(역할 없음)");
  assert.equal(teacherLine({ teacher: "가나다 목사", teachers: [] }), "");   // 화면용 글(teacher_label)은 카드 강사 줄이 아니다
  assert.equal(teacherLine({}), "");
  assert.equal(teacherLine(null), "");
});

test("강사 후보 고르개 — 역할 표시는 교육 총괄 → 교육 담당 차례로 하나 · 강사만이면 소속만 · stale 은 「역할 없음 — 빼 주세요」", () => {
  const cands = [{ id: "a", name: "김강사", who: "기쁨 3목장", roles: ["teacher"] }, { id: "b", name: "박담당", who: "", roles: ["educourse", "teacher"] },
    { id: "c", name: "이총괄", who: "소망 1목장", roles: ["education", "educourse"] }];
  assert.deepEqual(staffOptions(cands, [{ id: "z", name: "옛강사", stale: true }], TEACHER_ROLE_HINTS), [
    { value: "a", label: "김강사", hint: "기쁨 3목장" },
    { value: "b", label: "박담당", hint: "교육 담당" },
    { value: "c", label: "이총괄", hint: "소망 1목장 · 교육 총괄" },
    { value: "z", label: "옛강사", hint: STALE_HINT, stale: true },
  ]);
  // 담당 후보(기본)는 예전 그대로 — 교육 총괄만 덧붙인다
  assert.deepEqual(STAFF_ROLE_HINTS, [["education", "교육 총괄"]]);
  assert.equal(staffOptions(cands, [])[1].hint, "");
  assert.equal(staffFieldText([], [], "강사 없음"), "강사 없음");
  assert.equal(staffFieldText(["a"], staffOptions(cands, [], TEACHER_ROLE_HINTS), "강사 없음"), "김강사");
  assert.match(staffSaveFailText(TEACHER_BAD_MEMBER, "강사"), /^강좌는 저장했어요 — 강사는 저장하지 못했어요 \(강사 역할이 없거나/);
  assert.equal(TEACHER_NO_CAND, "⚙️ 담당자·역할에서 「강사」 역할을 먼저 주세요");
});

test("고치기 폼 — 「강사(출석부)」 칸은 담당자 칸 아래(숨은 칸 tstaff) · 후보가 없으면 역할 안내 · 못 불러오면 잠금 · 강좌 저장에 안 섞인다", () => {
  const v = { id: "x", title: "t", kind: "regular", term: "", capacity: "", mode: "auto", waitlist: "on", status: "draft", attendPct: 80, applyFrom: "", applyTo: "", prereq: [] };
  const sopts = [{ value: "a", label: "김담당" }], topts = [{ value: "t1", label: "김강사" }, { value: "t2", label: "박강사" }];
  const html = courseFormHtml(v, false, { ids: ["a"], opts: sopts, cands: [{ id: "a" }] }, { ids: ["t2"], opts: topts, cands: [{ id: "t1" }, { id: "t2" }] });
  assert.ok(html.indexOf("data-staff") < html.indexOf("data-tstaff"), "담당자 칸 다음에 강사(출석부) 칸");
  assert.ok(html.includes("강사(출석부)") && html.includes("박강사"));
  assert.ok(html.includes('data-f="tstaff" value="[&quot;t2&quot;]"'), "고른 강사 id 가 숨은 칸에");
  assert.ok(!html.includes(TEACHER_NO_CAND));
  assert.ok(html.includes("앱에 보이는 글"), "글 칸 「강사」는 앱에 보이는 글이라고 적는다");
  const none = courseFormHtml(v, false, { ids: [], opts: [], cands: [{ id: "a" }] }, { ids: [], opts: [], cands: [] });
  assert.ok(none.includes("강사 없음") && none.includes(TEACHER_NO_CAND));
  const failed = courseFormHtml(v, false, { ids: [], opts: [], cands: [] }, { ids: [], opts: [], cands: null });
  assert.ok(failed.includes("강사 후보를 불러오지 못했어요") && /data-tstaff[^>]*disabled/.test(failed));
  assert.ok(!/data-staff [^>]*disabled/.test(failed), "담당자 칸은 잠그지 않는다");
  assert.equal("tstaff" in formToCourse({ ...v, tstaff: ["t1"] }), false);
});
