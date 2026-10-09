// 봉사 당번 — 화면 규칙 시험(js/menus/duty/duty-logic.js · 2026-10-06)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS_OPTIONS, STATUS_LABEL, LEAD_STATUS_OPTIONS, leadCanSetStatus, WEEKDAY_OPTIONS, weekdayText, openDaysText, openDaysOptions,
  isDate, dayLabel, dayShort, addDays, cutoffText, slotName, timeRange, lineText, linesSummary, formToLine, lineToForm, lineSavedText, lineRemovedText,
  formToBoard, boardToForm, countsLine, boardRest, contactHtml, maxBack, boardSavedText, initialDay, dayActive, dayChip, dayStateText, dayActions, slotCount, signupBadges,
  askText, endedText, moveOptions, forceAsk, needsForce, confirmDayAsk, unconfirmAsk, offAsk, removeAsk, slotOffAsk, hideAsk, HIDE_PAST, STATUS_PAST_HINT, DRAFT_NO_PAST, notifyTail, addDoneText,
  movedText, dateAddedText, offDoneText, hasWord, dutyWord, needsReload, lostBoard, fileTitle, exportFileName, exportRanges,
  dayHiddenText, restoreAsk, restoredText, openWarn, afterAsk, draftNote, appNote, APP_LIVE, NOTIFY_LIVE, STALE_BOARD, TESTERS_SEE_NAMES, ADD_NOTE,
  emptyWhy, emptyChip, liveLineCount, emptyKind, seenOfCounts, seenOfRoster, addNote, PLAY_HIDDEN, PLAY_NOTE,
  notifyFailed, confirmDoneText, notifyBadges, DUP_REMOVE_NOAPP, DUP_REMOVE_APP, slotTwins, addEndedNote, CONFIRM_RETRY,
} from "../js/menus/duty/duty-logic.js";
import { boardCard } from "../js/menus/duty/boards.js";
import { DUTY_STATUS, DUTY_STATUS_LABEL } from "../supabase/functions/church-admin/duty-rules.ts";

test("상태 — 서버(duty-rules.ts)와 같은 값·같은 말 · 담당은 받는 중↔지원 멈춤만", () => {
  assert.deepEqual(STATUS_OPTIONS.map((o) => o.value), [...DUTY_STATUS]);
  for (const s of DUTY_STATUS) assert.equal(STATUS_LABEL[s], DUTY_STATUS_LABEL[s], s);
  assert.deepEqual(LEAD_STATUS_OPTIONS.map((o) => o.value), ["open", "closed"]);
  assert.equal(leadCanSetStatus("open"), true); assert.equal(leadCanSetStatus("closed"), true);
  assert.equal(leadCanSetStatus("draft"), false); assert.equal(leadCanSetStatus("archived"), false);
});

test("요일 — 0=주일 … 6=토 · 빈 값은 「날짜를 골라」", () => {
  assert.deepEqual(WEEKDAY_OPTIONS.map((o) => o.value), ["0", "1", "2", "3", "4", "5", "6", ""]);
  assert.equal(WEEKDAY_OPTIONS[0].label, "매주 주일"); assert.equal(WEEKDAY_OPTIONS[6].label, "매주 토요일");
  assert.equal(weekdayText(0), "매주 주일"); assert.equal(weekdayText("3"), "매주 수요일");
  assert.equal(weekdayText(null), "날짜를 골라"); assert.equal(weekdayText(""), "날짜를 골라");
});

test("보이는 기간 — 날 수 ↔ 말 · 목록에 없는 값은 한 줄 더", () => {
  assert.equal(openDaysText(56), "8주"); assert.equal(openDaysText(28), "4주"); assert.equal(openDaysText(100), "100일"); assert.equal(openDaysText(null), "56일");
  assert.deepEqual(openDaysOptions(56).map((o) => o.value), ["14", "28", "56", "84", "182", "364"]);
  assert.deepEqual(openDaysOptions(100).at(-1), { value: "100", label: "앞으로 100일" });
});

test("날짜 글 — 「10월 18일(일)」·「10/18(일)」· 며칠 뒤 · 마감 시각(한국)", () => {
  assert.equal(isDate("2026-10-18"), true); assert.equal(isDate("2026-10-8"), false); assert.equal(isDate(null), false);
  assert.equal(dayLabel("2026-10-18"), "10월 18일(일)"); assert.equal(dayLabel("2026-10-17"), "10월 17일(토)"); assert.equal(dayLabel("x"), "");
  assert.equal(dayShort("2026-10-18"), "10/18(일)");
  assert.equal(addDays("2026-10-30", 3), "2026-11-02"); assert.equal(addDays("2026-03-01", -1), "2026-02-28"); assert.equal(addDays("x", 1), "");
  assert.equal(cutoffText("2026-10-17T10:00:00+00:00"), "10월 17일(토) 저녁 7시");      // 전날 19:00 KST
  assert.equal(cutoffText("2026-10-17T00:30:00Z"), "10월 17일(토) 오전 9시 30분");
  assert.equal(cutoffText("2026-10-17T03:00:00Z"), "10월 17일(토) 오후 12시");
  assert.equal(cutoffText(""), "");
});

test("자리 틀 글 · 요약", () => {
  const l = { service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, active: true };
  assert.equal(slotName(l), "2부 설거지"); assert.equal(slotName({ service: "김장", task: "" }), "김장");
  assert.equal(timeRange(l), "11:30~12:30");
  assert.equal(lineText(l), "매주 주일 · 2부 설거지 · 11:30~12:30 · 2명");
  assert.equal(lineText({ service: "김장", task: "", start: "09:00", end: "13:00", capacity: 30, weekday: null }), "날짜를 골라 · 김장 · 09:00~13:00 · 30명");
  assert.equal(linesSummary([]), "자리 틀이 아직 없어요");
  assert.equal(linesSummary([l, { ...l, service: "1부", start: "09:00" }]), "주일 2부 설거지 11:30 2명 · 주일 1부 설거지 09:00 2명");
  assert.equal(linesSummary([l, l, l, l, l]).endsWith("외 2개"), true);
  assert.equal(linesSummary([{ ...l, active: false }]), "자리 틀이 아직 없어요");
});

test("formToLine — 한국말 거절 · 다듬은 값 · lineToForm 과 오간다", () => {
  const ok = { service: " 2부 ", task: "설거지", start: "11:30", end: "12:30", capacity: "2", weekday: "0", sort: "0" };
  assert.deepEqual(formToLine(ok), { line: { service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, sort: 0 } });
  assert.deepEqual(formToLine({ ...ok, id: "7", weekday: "" }).line, { id: 7, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: null, sort: 0 });
  for (const [patch, word] of [[{ service: "" }, "예배·조 이름"], [{ service: "가".repeat(13) }, "12자"], [{ task: "가".repeat(21) }, "20자"], [{ start: "" }, "시작 시각"],
    [{ end: "11:30" }, "끝 시각"], [{ end: "09:00" }, "끝 시각"], [{ capacity: "" }, "정원"], [{ capacity: "0" }, "정원"], [{ capacity: "두명" }, "정원"], [{ capacity: "201" }, "정원"]]) {
    const r = formToLine({ ...ok, ...patch });
    assert.ok(r.error && r.error.includes(word), JSON.stringify(patch) + " → " + r.error);
  }
  const f = lineToForm({ id: 7, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, sort: 1 });
  assert.deepEqual(f, { id: "7", service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: "2", weekday: "0", sort: "1" });
  assert.deepEqual(formToLine(f).line, { id: 7, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, sort: 1 });
  assert.equal(lineToForm({ id: 8, service: "김장", weekday: null }).weekday, "");
  assert.deepEqual([lineToForm(null).weekday, lineToForm(null).capacity], ["0", "2"], "새 틀은 매주 주일 · 2명부터");
});

test("틀 저장·빼기 뒤 한 줄", () => {
  assert.equal(lineSavedText({ made: 8, updated: 0, kept: 0 }, true), "자리 틀을 더했어요 · 자리 8개를 만들었어요");
  assert.equal(lineSavedText({ made: 0, updated: 3, kept: 0 }, false), "자리 틀을 고쳤어요 · 앞날 자리 3개의 정원을 바꿨어요");
  assert.ok(lineSavedText({ made: 7, updated: 0, kept: 2 }, false).includes("지원이 있는 2개는 남겨"));
  assert.equal(lineRemovedText({ deleted: true, kept: 0 }), "자리 틀을 지웠어요");
  assert.ok(lineRemovedText({ deleted: false, kept: 2 }).includes("앞날 자리 2개는 남겨"));
  assert.ok(lineRemovedText({ deleted: false, kept: 0 }).includes("지난 자리는 기록"));
});

test("formToBoard · boardToForm — 서버 칸 이름으로 · 비운 칸은 null/빈 글자", () => {
  const v = { id: "b1", title: " 식당 봉사 ", description: "설명", place: "식당", contact: "사무실", openDays: "28", untilDate: "2026-12-31", maxAhead: "4", status: "open" };
  assert.deepEqual(formToBoard(v), { board: { id: "b1", title: "식당 봉사", description: "설명", place: "식당", contact_note: "사무실", open_days: 28,
    until_date: "2026-12-31", max_ahead: 4, status: "open" } });
  assert.deepEqual(formToBoard({ title: "주차" }).board, { title: "주차", description: "", place: "", contact_note: "", open_days: 56, until_date: "", max_ahead: null, status: "draft" });
  assert.ok(formToBoard({ title: "" }).error.includes("당번 이름"));
  assert.ok(formToBoard({ title: "가".repeat(41) }).error.includes("40자"));
  for (const maxAhead of ["0", "많이", "201", "1.5"]) assert.ok(formToBoard({ title: "식당", maxAhead }).error.includes("1~200"), maxAhead);
  const back = boardToForm({ id: "b1", title: "식당 봉사", description: "설명", place: "식당", contact: "사무실", openDays: 28, untilDate: "2026-12-31", maxAhead: 4, status: "open" });
  assert.deepEqual(back, { id: "b1", title: "식당 봉사", description: "설명", place: "식당", contact: "사무실", openDays: "28", untilDate: "2026-12-31", maxAhead: "4", status: "open" });
  assert.deepEqual(boardToForm(null), { id: "", title: "", description: "", place: "", contact: "", openDays: "56", untilDate: "", maxAhead: "", status: "draft" });
});

test("당번 카드·머리의 한 줄", () => {
  assert.equal(countsLine({ lines: 0 }), "자리 틀을 먼저 넣어 주세요");
  assert.equal(countsLine({ lines: 2, slots: 16, need: 5, asks: 0, after: 0 }), "앞날 자리 16 · 빈 자리 5");
  assert.equal(countsLine({ lines: 2, slots: 16, need: 5, asks: 1, after: 2 }), "앞날 자리 16 · 빈 자리 5 · 못 온다는 분 1 · 끝 날짜 뒤에 선 분 2");
  assert.equal(boardRest({ place: "식당", contact: "사무실", openDays: 56, untilDate: "2026-12-31", maxAhead: 4 }), "앞으로 8주까지 보여요 · 12월 31일(목)까지 · 한 분 4자리까지");
  assert.equal(boardRest({ openDays: 28 }), "앞으로 4주까지 보여요");
  assert.equal(boardRest(null), "");
  // 문의 — 전화번호만 눌러서 걸리게 · 나머지 글자는 모두 이스케이프(담당자가 적은 글이 그대로 HTML 이 되지 않게)
  assert.equal(contactHtml("홍길동 집사 010-1234-5678 (저녁)"), '홍길동 집사 <a href="tel:01012345678">010-1234-5678</a> (저녁)');
  assert.equal(contactHtml("교회 사무실 02-000-0000"), '교회 사무실 <a href="tel:020000000">02-000-0000</a>');
  assert.equal(contactHtml("교회 사무실로"), "교회 사무실로");
  assert.equal(contactHtml('<img src=x onerror=alert(1)> 010-1234-5678 "a"'), '&lt;img src=x onerror=alert(1)&gt; <a href="tel:01012345678">010-1234-5678</a> &quot;a&quot;');
  assert.equal(contactHtml(null), "");
  // 지난 날 불러오기 한도
  assert.equal(maxBack(), 364); assert.equal(maxBack(56), 364);   // 지난 날은 52주까지 — 앞날과 따로(서버가 따로 자른다)
  assert.ok(boardSavedText({ after: 0 }, true).includes("자리 틀을 넣어"));
  assert.equal(boardSavedText({ after: 0 }, false), "저장했어요");
  assert.ok(boardSavedText({ after: 3 }, false).includes("끝 날짜 뒤에 지원 3건이 있어요"));
});

const DAYS = [
  { date: "2026-10-11", off: false, note: "", confirmed: false, locked: true, cutoff: "2026-10-10T10:00:00Z", past: true, need: 1, asks: 0, slots: [{ id: 1, signups: [{ id: 1 }], capacity: 2 }] },
  { date: "2026-10-18", off: false, note: "추수감사주일", confirmed: false, locked: false, cutoff: "2026-10-17T10:00:00Z", past: false, need: 1, asks: 0,
    slots: [{ id: 11, service: "1부", task: "설거지", start: "09:00", end: "10:00", capacity: 2, off: false, signups: [{ id: 101, name: "가" }] },
            { id: 12, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 1, off: false, signups: [{ id: 102, name: "나" }] },
            { id: 13, service: "2부", task: "배식", start: "11:30", end: "12:30", capacity: 1, off: true, signups: [] }] },
  { date: "2026-10-25", off: true, note: "교회 행사", confirmed: false, locked: false, cutoff: "2026-10-24T10:00:00Z", past: false, need: 0, asks: 0,
    slots: [{ id: 21, service: "1부", task: "설거지", start: "09:00", end: "10:00", capacity: 2, off: false, signups: [{ id: 201 }] }] },
  { date: "2026-11-01", off: false, note: "", confirmed: true, locked: true, cutoff: "2026-10-31T10:00:00Z", past: false, need: 0, asks: 2,
    slots: [{ id: 31, service: "1부", task: "설거지", start: "09:00", end: "10:00", capacity: 2, off: false, signups: [{ id: 301 }, { id: 302 }] }] },
];

test("initialDay — 바라는 날 → 오늘 이후 첫 날 → 마지막 날", () => {
  assert.equal(initialDay(DAYS, "2026-10-12"), "2026-10-18");
  assert.equal(initialDay(DAYS, "2026-10-18"), "2026-10-18");
  assert.equal(initialDay(DAYS, "2026-12-01"), "2026-11-01");
  assert.equal(initialDay(DAYS, "2026-10-12", "2026-11-01"), "2026-11-01");
  assert.equal(initialDay(DAYS, "2026-10-12", "2027-01-01"), "2026-10-18", "없는 날을 바라면 무시");
  assert.equal(initialDay([], "2026-10-12"), "");
});

test("dayChip — 쉼 → 지난 날 → 못 온다 → 빈 자리 → 다 참 · 잠긴 날 표시", () => {
  assert.deepEqual(dayChip(DAYS[0]), { date: "2026-10-11", label: "10/11(일)", lock: false, today: false, kind: "past", tag: "지난 날" });
  assert.deepEqual(dayChip(DAYS[1]), { date: "2026-10-18", label: "10/18(일)", lock: false, today: false, kind: "need", tag: "빈 자리 1" });
  assert.deepEqual(dayChip(DAYS[2]), { date: "2026-10-25", label: "10/25(일)", lock: false, today: false, kind: "off", tag: "쉼" });
  assert.deepEqual(dayChip(DAYS[3]), { date: "2026-11-01", label: "11/1(일)", lock: true, today: false, kind: "ask", tag: "못 온다 2" });
  assert.equal(dayChip(DAYS[1], "2026-10-18").today, true); assert.equal(dayChip(DAYS[1], "2026-10-12").today, false);
  assert.equal(dayChip({ ...DAYS[3], asks: 0 }).kind, "full");
  assert.equal(dayChip({ date: "2026-11-08", slots: [] }).kind, "none");
  // 자리를 하나씩 모두 쉬게 한 날 — 빈 자리 0 이라고 「다 찼어요」가 아니다
  const allOff = { ...DAYS[1], need: 0, slots: DAYS[1].slots.map((s) => ({ ...s, off: true })) };
  assert.deepEqual([dayChip(allOff).kind, dayChip(allOff).tag], ["off", "자리 쉼"]);
  assert.equal(dayChip(DAYS[1]).kind, "need", "자리 하나만 쉬면 그대로");
  // 쉬지 않는 자리가 모두 남은 자리(뺀 틀·요일을 바꾼 틀)인 날 — 빈 자리 수 0 이지만 「다 찼어요」가 아니다
  const left = { ...DAYS[1], need: 0, slots: DAYS[1].slots.map((s) => ({ ...s, leftover: !s.off })) };
  assert.deepEqual([dayChip(left).kind, dayChip(left).tag], ["none", "남은 자리"]);
  assert.equal(dayChip({ ...left, asks: 1 }).kind, "ask", "못 온다는 분이 있으면 그것이 먼저");
  assert.equal(dayChip({ ...DAYS[1], slots: DAYS[1].slots.map((s, i) => ({ ...s, leftover: i === 0 })) }).kind, "need", "살아 있는 자리가 하나라도 있으면 그대로");
  // 앱에 안 보이는 날의 까닭 한 줄 — 끝 날짜 뒤 · 보이는 기간 밖 · 지난 날은 말하지 않는다
  assert.ok(dayHiddenText({ ...DAYS[1], afterUntil: true }).startsWith("끝 날짜 뒤라"));
  assert.ok(dayHiddenText({ ...DAYS[1], notYet: true }).startsWith("보이는 기간 밖이라"));
  assert.ok(dayHiddenText({ ...DAYS[1], afterUntil: true, notYet: true }).startsWith("끝 날짜 뒤라"), "둘 다면 끝 날짜가 먼저");
  assert.equal(dayHiddenText(DAYS[1]), ""); assert.equal(dayHiddenText({ ...DAYS[0], afterUntil: true }), ""); assert.equal(dayHiddenText(null), "");
  assert.equal(dayActive(DAYS[1]), 2); assert.equal(dayActive(null), 0);
});

test("dayStateText · dayActions — 서버가 준 잠김·마감 그대로", () => {
  assert.equal(dayStateText(DAYS[1]), "10월 17일(토) 저녁 7시에 자동으로 확정돼요 — 추수감사주일");
  assert.equal(dayStateText(DAYS[2]), "😴 쉬는 날 — 교회 행사");
  assert.equal(dayStateText(DAYS[3]), "🔒 담당자 확정");
  assert.equal(dayStateText({ ...DAYS[3], confirmed: false }), "🔒 전날 저녁에 자동으로 확정됐어요");
  assert.equal(dayStateText(DAYS[0]), "지난 날");
  const acts = (d, o) => dayActions(d, o).map((a) => a.act);
  const before = Date.parse("2026-10-13T00:00:00Z");
  assert.deepEqual(acts(DAYS[1], { now: before }), ["confirm", "off", "note"]);
  assert.deepEqual(acts(DAYS[2], { now: before }), ["reopen", "note"], "쉬는 날은 확정 단추가 없다");
  assert.deepEqual(acts(DAYS[3], { now: before }), ["unconfirm", "off", "note"], "담당자가 확정했고 마감 전이면 풀 수 있다");
  assert.deepEqual(acts(DAYS[3], { now: Date.parse("2026-10-31T11:00:00Z") }), ["off", "note"], "마감이 지나면 풀기 단추가 없다");
  assert.deepEqual(acts({ ...DAYS[3], confirmed: false }, { now: before }), ["off", "note"], "저절로 잠긴 날은 풀 것이 없다");
  assert.deepEqual(acts(DAYS[0], { now: before }), ["note"], "지난 날은 메모만");
  // 지난 **쉬는 날**에는 「다시 열기」가 있다(「지난 봉사」 확인 반영 — 쉬는 날의 줄은 성도님 앱의 지난 봉사에서 빠지므로, 잘못 걸린 날을 지난 뒤에도 바로잡는다) · 「쉬는 날로」는 없다
  assert.deepEqual(acts({ ...DAYS[0], off: true }, { now: before }), ["reopen", "note"], "지난 쉬는 날");
  assert.deepEqual(dayActions({ ...DAYS[0], off: true }, { now: before })[0], { act: "reopen", label: "다시 열기" });
  assert.equal(acts({ ...DAYS[0], off: true }, { now: before }).includes("off") || acts(DAYS[0], { now: before }).includes("off"), false, "지난 날을 쉬는 날로 거는 단추는 없다(서버도 거절한다)");
  assert.deepEqual(acts({ ...DAYS[0], off: true, confirmed: true, locked: true }, { now: before }), ["reopen", "note"], "지난 날에는 확정·풀기가 없다");
  assert.deepEqual(acts({ ...DAYS[0], off: true }, { archived: true }), [], "보관한 당번은 단추가 없다");
  assert.deepEqual(acts(DAYS[1], { archived: true }), []);
  assert.equal(dayActions(DAYS[1], { now: before }).find((a) => a.act === "note").label, "메모 고치기");
  assert.equal(dayActions(DAYS[3], { now: before }).find((a) => a.act === "note").label, "메모");
  // 서버가 늘 거절할 단추는 두지 않는다 — 자리가 없는 날의 확정(no-slots)
  assert.deepEqual(acts({ ...DAYS[1], slots: [] }, { now: before }), ["off", "note"], "자리 없는 날은 확정 없음");
});

test("slotCount · signupBadges · askText · endedText", () => {
  assert.deepEqual(slotCount({ capacity: 2, signups: [{}] }), { n: 1, cap: 2, need: 1, over: false, text: "1/2명" });
  assert.deepEqual(slotCount({ capacity: 2, signups: [{}, {}, {}] }), { n: 3, cap: 2, need: 0, over: true, text: "3/2명" });
  const texts = (e) => signupBadges(e).map((b) => b.text);
  assert.deepEqual(texts({ source: "app", hasApp: true, hasPush: true }), ["앱"]);
  assert.deepEqual(texts({ source: "staff", hasApp: false }), ["담당자", "앱 없음"]);
  // 「알림 꺼짐」은 앱 알림이 실제로 나가는 때(3단계)에만 — 그전에는 딱지 없는 분께 알림이 간다는 뜻으로 읽힌다
  assert.equal(NOTIFY_LIVE, true, "2026-10-06 3단계(internalDutyNotify)를 운영에 올렸다 — 알림을 되돌리면 false 로(이 줄도 함께)");
  const e5 = { source: "app", hasApp: true, hasPush: false, afterLock: true, moved: true, maybeDup: true };
  assert.deepEqual(signupBadges(e5, { notify: false }).map((b) => b.text), ["앱", "확정 뒤 들어옴", "옮김", "같은 분일 수 있어요"]);
  assert.deepEqual(texts(e5), signupBadges(e5, { notify: NOTIFY_LIVE }).map((b) => b.text), "기본값은 스위치를 따른다");
  assert.deepEqual(signupBadges(e5, { notify: true }).map((b) => b.text), ["앱", "알림 꺼짐", "확정 뒤 들어옴", "옮김", "같은 분일 수 있어요"]);
  assert.deepEqual(signupBadges({ source: "staff", hasApp: false, hasPush: false }, { notify: true }).map((b) => b.text), ["담당자", "앱 없음"], "앱 없음이면 알림 딱지는 겹쳐 달지 않는다");
  assert.deepEqual(texts({ source: "app", hasApp: true, hasPush: true, overlap: true }), ["앱", "시간 겹침"]);
  assert.equal(signupBadges({ source: "app", hasApp: true, hasPush: true, overlap: true })[1].cls, "warn");
  assert.equal(askText({ asked: true, why: "cant" }), "⚠️ 사정이 생겨 못 온대요");
  assert.equal(askText({ asked: true, why: "notme" }), "⚠️ 본인이 지원한 것이 아니래요");
  assert.equal(askText({ asked: true, why: null }), "⚠️ 못 온다고 알렸어요");
  assert.equal(askText({ asked: false }), "");
  assert.equal(endedText({ reason: "staff" }), "담당자가 뺌"); assert.equal(endedText({ reason: "self" }), "본인 취소"); assert.equal(endedText({ reason: "merge" }), "기록을 합치며 정리");
});

test("moveOptions — 같은 당번의 다른 자리 · 쉬는 날·쉬는 자리·지난 날 빼고 · 같은 날 먼저", () => {
  const o = moveOptions(DAYS, 11, "2026-10-18");
  assert.deepEqual(o.map((x) => x.value), ["12", "31"]);
  assert.equal(o[0].label, "10월 18일(일) · 2부 설거지 11:30"); assert.equal(o[0].hint, "1/1명 · 다 찼어요");
  assert.equal(o[1].hint, "2/2명 · 다 찼어요 · 확정된 날");
  // 지난 날의 줄은 그날의 다른 자리로는 옮길 수 있다(어제 1부가 아니라 2부에 서셨다)
  const past = [{ ...DAYS[0], slots: [{ id: 1, service: "1부", task: "", start: "09:00", capacity: 2, off: false, signups: [] }, { id: 2, service: "2부", task: "", start: "11:00", capacity: 2, off: false, signups: [] }] }, DAYS[1]];
  assert.deepEqual(moveOptions(past, 1, "2026-10-11").map((x) => x.value), ["2", "11", "12"]);
  assert.deepEqual(moveOptions([], 1, "2026-10-11"), []);
  // 끝 날짜 뒤 날(앱에 안 보인다)로는 옮기지 않는다 — 그날 안에서 자리만 바꾸는 것은 된다
  const late = DAYS.map((d) => (d.date === "2026-11-01" ? { ...d, afterUntil: true, slots: [...d.slots, { id: 32, service: "2부", task: "설거지", start: "11:30", capacity: 2, off: false, signups: [] }] } : d));
  assert.deepEqual(moveOptions(late, 11, "2026-10-18").map((x) => x.value), ["12"]);
  assert.deepEqual(moveOptions(late, 31, "2026-11-01").map((x) => x.value), ["32", "11", "12"]);
});

test("forceAsk — 정원·겹침을 한 번에 알린다 · 남의 당번이면 이름 없이", () => {
  assert.equal(needsForce({ ok: false, error: "full" }), true); assert.equal(needsForce({ ok: false, error: "overlap" }), true);
  assert.equal(needsForce({ ok: false, error: "off" }), false); assert.equal(needsForce({ ok: true }), false);
  assert.equal(forceAsk({ error: "full", active: 2, capacity: 2 }), "정원(2명)이 찼어요(지금 2분). 그래도 넣을까요?");
  assert.equal(forceAsk({ error: "overlap", with: { same: true, label: "2부 배식 11:30" } }, "옮길까요"), "같은 날 겹치는 자리(2부 배식 11:30)에 이미 서 계세요. 그래도 옮길까요?");
  assert.equal(forceAsk({ error: "overlap", with: { same: false, label: "" } }), "같은 날 다른 당번의 겹치는 시간에 이미 서 계세요. 그래도 넣을까요?");
  assert.equal(forceAsk({ error: "full", active: 3, capacity: 2, with: { same: true, label: "2부 배식 11:30" } }),
    "정원(2명)이 찼어요(지금 3분). 같은 날 겹치는 자리(2부 배식 11:30)에 이미 서 계세요. 그래도 넣을까요?");
  assert.equal(forceAsk({ error: "off" }), "");
});

test("확인 창 글 — 확정 · 쉬는 날 · 빼기 · 숨기기", () => {
  assert.ok(confirmDayAsk(DAYS[1]).startsWith("10월 18일(일)을 확정할까요?"));
  assert.ok(confirmDayAsk(DAYS[1]).includes("지금 지원 2건 · 빈 자리 1"), "줄 수는 「건」으로(한 분이 두 자리에 서면 2 다)");
  // 「빈 자리 지원은 계속 받아요」는 받는 중 당번에서만 참이다 — 지원 멈춤 당번은 앱 지원을 받지 않는다(담당자가 넣는다 · 검증 2026-10-06)
  assert.ok(confirmDayAsk(DAYS[1]).includes("빈 자리 지원은 계속 받아요") && confirmDayAsk(DAYS[1], "open").includes("빈 자리 지원은 계속 받아요"));
  for (const s of ["closed", "draft"]) assert.ok(confirmDayAsk(DAYS[1], s).includes("빈 자리는 담당자가 「넣기」로 채워요") && !confirmDayAsk(DAYS[1], s).includes("지원은 계속 받아요"), s);
  assert.ok(unconfirmAsk(DAYS[3]).includes("10월 31일(토) 저녁 7시에는 다시 자동으로 확정"), "마감 시각은 서버가 준 값으로");
  assert.ok(unconfirmAsk(DAYS[3]).includes("담당자가 넣은 분은 그대로 못 빼요"));
  assert.ok(unconfirmAsk({ date: "2026-11-01" }).includes("전날 저녁에는 다시 자동으로 확정"));
  assert.ok(offAsk({ from: "2026-10-18", to: "2026-10-18", off: true, active: 2, days: 1 }).startsWith("10월 18일(일)을 쉬는 날로 바꿀까요? 이미 들어온 지원 2건은 그분들 앱에 「이날은 쉬어요」로 보여요"));
  assert.ok(offAsk({ from: "2026-08-02", to: "2026-08-16", off: true, active: 0, days: 3 }).startsWith("8월 2일(일) ~ 8월 16일(일) 3일을 쉬는 날로 바꿀까요? 아직 지원한 분은 없어요"));
  assert.ok(offAsk({ from: "2026-08-02", to: "2026-08-16", off: false, active: 4, days: 3 }).includes("쉬기 전의 지원 4건이 그대로 살아나요."));
  assert.ok(offAsk({ from: "2026-08-03", to: "2026-08-04", off: true, active: 0, days: 0 }).includes("쉬게 할 날이 없어요"));
  assert.ok(offAsk({ from: "2026-08-03", to: "2026-08-04", off: false, active: 0, days: 0 }).includes("다시 열 날이 없어요"));
  assert.ok(offAsk({ from: "2026-10-25", to: "2026-10-25", off: false, active: 1, days: 1, tail: "적어 둔 메모(「교회 행사」)도 함께 지워요." }).endsWith("살아나요. 적어 둔 메모(「교회 행사」)도 함께 지워요."));
  assert.ok(!offAsk({ from: "2026-10-25", to: "2026-10-25", off: true, active: 1, days: 1, tail: "꼬리" }).includes("꼬리"), "쉬는 날로 바꿀 때는 덧붙이지 않는다");
  // 지난 날을 다시 열 때(날 판의 「다시 열기」) — 살아나는 것은 앞날의 당번이 아니라 그분들 앱의 「지난 봉사」다 · 알림은 가지 않는다
  assert.equal(offAsk({ from: "2026-10-04", to: "2026-10-04", off: false, active: 2, days: 1, past: true }),
    "10월 4일(일)을 다시 열까요? 지난 날이에요 — 그날 서 있던 지원 2건이 그분들 앱의 「지난 봉사」에 다시 보여요(앱 알림은 가지 않아요).");
  assert.equal(offAsk({ from: "2026-10-04", to: "2026-10-04", off: false, active: 0, days: 1, past: true }), "10월 4일(일)을 다시 열까요? 지난 날이에요(그날 서 있던 분은 없어요).");
  assert.ok(offAsk({ from: "2026-10-04", to: "2026-10-04", off: false, active: 1, days: 1, past: true, tail: "적어 둔 메모(「행사」)도 함께 지워요." }).endsWith("(앱 알림은 가지 않아요). 적어 둔 메모(「행사」)도 함께 지워요."));
  assert.ok(!offAsk({ from: "2026-10-04", to: "2026-10-04", off: false, active: 1, days: 1, past: true }).includes("살아나요"), "지난 날에는 「살아나요」(앞날의 당번)라고 하지 않는다");
  assert.ok(offAsk({ from: "2026-10-04", to: "2026-10-04", off: false, active: 0, days: 0, past: true }).includes("다시 열 날이 없어요"), "바뀔 날이 없으면 그 말이 먼저");
  assert.ok(offAsk({ from: "2026-10-25", to: "2026-10-25", off: true, active: 1, days: 1, past: true }).includes("쉬는 날로 바꿀까요"), "쉬는 날로 거는 글은 past 를 보지 않는다(지난 날에는 걸 수 없다)");
  assert.ok(removeAsk({ name: "가상하나" }, DAYS[1], DAYS[1].slots[0]).startsWith("가상하나 님을 10월 18일(일) 1부 설거지에서 뺄까요?"));
  // 「스스로 다시 지원할 수 없어요」는 앱 계정이 이어진 분께만 맞는 말이다 · 되돌릴 길(빠진 분 → 다시 넣기)은 늘 알린다
  assert.ok(removeAsk({ name: "가상하나", hasApp: true }, DAYS[1], DAYS[1].slots[0]).includes("스스로 다시 지원할 수 없어요"));
  assert.ok(!removeAsk({ name: "가상하나", hasApp: false }, DAYS[1], DAYS[1].slots[0]).includes("스스로 다시 지원"));
  assert.ok(removeAsk({ name: "가상하나", hasApp: false }, DAYS[1], DAYS[1].slots[0]).includes("「빠진 분」에서 다시 넣을 수 있어요"));
  // 지난 날의 줄(성경암송 앱 「지난 봉사」 2026-10-07 — 지난 날짜의 당번표에 남아 있는 줄을 센다): 앱에 이어진 분의 줄을 빼면 그분의 이력에서도 빠진다고 말한다 ·
  //   지난 날에는 「스스로 다시 지원할 수 없어요」를 말하지 않는다(누구도 지난 날에 지원하지 못한다) · 앱 없는 분의 줄에는 어느 쪽도 말하지 않는다
  const pastDay = { ...DAYS[1], past: true };
  const pastAsk = removeAsk({ name: "가상하나", hasApp: true }, pastDay, pastDay.slots[0]);
  assert.ok(pastAsk.includes("지난 날짜의 줄을 빼면 그분 앱의 「지난 봉사」에 남지 않아요") && !pastAsk.includes("스스로 다시 지원") && pastAsk.includes("「빠진 분」에서 다시 넣을 수 있어요"), pastAsk);
  assert.ok(!removeAsk({ name: "가상하나", hasApp: false }, pastDay, pastDay.slots[0]).includes("지난 봉사"), "앱에 안 이어진 줄은 그분의 앱에 없다");
  assert.ok(!removeAsk({ name: "가상하나", hasApp: true }, DAYS[1], DAYS[1].slots[0]).includes("지난 봉사"), "앞날의 줄에는 말하지 않는다");
  // 지난 날의 「넣기」 안내 — 「앱에는 보이지 않아요」라고만 하면 사실이 아니다(앱 당번표에는 없지만 그분의 「지난 봉사」에는 보인다)
  assert.equal(addNote({ past: true }), "지난 날짜예요 — 앱 당번표에는 보이지 않아요(명단에 기록으로 남고, 앱을 쓰는 분께는 「지난 봉사」에 보여요 — 준비 중 당번은 빼고)");
  // 같은 이름의 줄이 또 있는 날 — 앱에 이어진 줄을 빼려 하면 어느 줄을 빼야 하는지 말한다(앱 없는 줄을 뺄 때는 말하지 않는다)
  // 고침 검토 반영(2026-10-07) — 겹친 줄 안내는 서버가 「빼 드렸어요」를 거르는 범위와 같다: **같은 자리**에 같은 이름의 살아 있는 줄이 또 있을 때만
  const twinSlot = (others) => ({ service: "1부", task: "설거지", signups: [{ id: 1, name: "가상하나", hasApp: true }, ...others] });
  const meApp = { id: 1, name: "가상하나", hasApp: true, maybeDup: true }, D1 = DAYS[1];
  assert.deepEqual(slotTwins(meApp, twinSlot([{ id: 2, name: "가상 하나", hasApp: false }])), { any: true, noApp: true }, "띄어쓰기는 무시한다(서버 dup 과 같다)");
  assert.deepEqual(slotTwins(meApp, twinSlot([{ id: 2, name: "가상하나", hasApp: true }])), { any: true, noApp: false });
  assert.deepEqual(slotTwins(meApp, twinSlot([{ id: 2, name: "가상둘", hasApp: false }])), { any: false, noApp: false });
  assert.deepEqual(slotTwins(meApp, twinSlot([])), { any: false, noApp: false }, "자기 줄은 세지 않는다"); assert.deepEqual(slotTwins({ id: 1, name: "" }, twinSlot([{ id: 2, name: "" }])), { any: false, noApp: false });
  assert.deepEqual(slotTwins(meApp, null), { any: false, noApp: false });
  // ① 같은 자리 · 남는 줄에 「앱 없음」 줄이 있다 — 어느 줄을 빼야 하는지 · 아예 빼려면 차례
  assert.ok(removeAsk(meApp, D1, twinSlot([{ id: 2, name: "가상하나", hasApp: false }])).endsWith(DUP_REMOVE_NOAPP));
  assert.ok(DUP_REMOVE_NOAPP.includes("이 줄(앱에 이어진 줄)은 두고 「앱 없음」 줄을 빼 주세요") && DUP_REMOVE_NOAPP.includes("그분을 아예 빼려면 「앱 없음」 줄을 먼저 빼 주세요(이 줄을 먼저 빼면 앱 알림을 보내지 않아요)") && DUP_REMOVE_NOAPP.includes("다른 분이면 따로 알려 주세요"));
  // 회귀 확인 반영(2026-10-07) — 알림이 **간다고** 약속하지 않는다: 준비 중 당번·지난 날·끝난 자리에서는 차례를 지켜도 알림이 없다(같은 창이 그 상태에서도 뜬다)
  for (const t of [DUP_REMOVE_NOAPP, DUP_REMOVE_APP]) assert.equal(/알림이 가요|알림을 보내요|알림이 갑니다/.test(t), false, t);
  assert.equal(removeAsk(meApp, DAYS[0], twinSlot([{ id: 2, name: "가상하나", hasApp: false }])).endsWith(DUP_REMOVE_NOAPP), true, "지난 날에도 같은 글이 뜬다 — 그래서 어느 경우에도 참이어야 한다");
  // ② 같은 자리 · 남는 줄이 모두 앱 줄(동명이인 · 옛·새 계정) — 있지도 않은 「앱 없음」 줄을 가리키지 않는다
  const both = removeAsk(meApp, D1, twinSlot([{ id: 2, name: "가상하나", hasApp: true }]));
  assert.ok(both.endsWith(DUP_REMOVE_APP) && !both.includes("「앱 없음」"), both); assert.ok(DUP_REMOVE_APP.includes("빼는 분께 따로 알려 주세요"));
  for (const t of [DUP_REMOVE_NOAPP, DUP_REMOVE_APP]) assert.ok(t.includes("같은 이름의 줄이 남아 있는 동안에는 이 줄을 빼도 그분께 앱 알림이 가지 않아요"), "어느 쪽이든 서버 규칙을 그대로 말한다");
  // ③ 다른 자리에만 같은 이름이 있다(한 분의 두 당번 — 딱지 maybeDup 은 켜져 있다) — 말하지 않는다(다른 당번의 줄을 빼라고 하게 된다)
  assert.ok(!removeAsk(meApp, D1, twinSlot([])).includes("같은 이름의 줄"), "다른 자리의 같은 이름");
  // ④ 계정 없는 줄을 뺄 때는 말하지 않는다(그 줄에는 원래 알림이 없다)
  assert.ok(!removeAsk({ id: 2, name: "가상하나", hasApp: false, maybeDup: true }, D1, twinSlot([{ id: 2, name: "가상하나", hasApp: false }])).includes("같은 이름의 줄"));
  assert.ok(restoreAsk({ name: "가상하나" }, DAYS[1], DAYS[1].slots[0]).startsWith("가상하나 님을 10월 18일(일) 1부 설거지에 다시 넣을까요?"));
  assert.equal(restoredText({ ok: true, id: 1 }, "가상하나"), "가상하나 — 다시 넣었어요");
  assert.equal(restoredText({ ok: true, already: true }, "가상하나"), "가상하나 — 이미 서 계세요");
  assert.equal(restoredText({ ok: true, id: 1, notified: 1, notifyError: null }, "가상하나"), "가상하나 — 다시 넣었어요 · 1분께 앱 알림을 보냈어요");
  assert.ok(slotOffAsk(DAYS[1].slots[0], true).includes("지원한 1분께는"));
  assert.equal(slotOffAsk(DAYS[1].slots[2], true), "2부 배식 자리만 쉬게 할까요?");
  assert.ok(slotOffAsk(DAYS[1].slots[0], false).includes("다시 열까요"));
  assert.ok(hideAsk(3, "archived").startsWith("앞날에 지원 3건이 있어요.") && hideAsk(3, "archived").includes("「보관」"));
  // 지난 날의 자리(「지난 봉사」 확인 반영) — 앱 어디에도 「쉬어요」가 보이지 않는다. 바뀌는 것은 그분들 앱의 「지난 봉사」다
  const agoDay = { ...DAYS[0], past: true };
  assert.equal(slotOffAsk(DAYS[1].slots[0], true, agoDay), "1부 설거지 자리만 쉬게 할까요? 지난 날의 자리예요 — 쉬게 하면 여기 선 1분의 앱 「지난 봉사」에서 이 자리가 빠져요(다시 열면 돌아와요).");
  assert.equal(slotOffAsk(DAYS[1].slots[0], false, agoDay), "1부 설거지 자리를 다시 열까요? 지난 날의 자리예요 — 여기 선 1분의 앱 「지난 봉사」에 이 자리가 다시 보여요.");
  assert.equal(slotOffAsk(DAYS[1].slots[2], true, agoDay), "2부 배식 자리만 쉬게 할까요? 지난 날의 자리예요.", "선 분이 없으면 지난 봉사 말이 없다");
  assert.ok(!slotOffAsk(DAYS[1].slots[0], true, agoDay).includes("「쉬어요」로 보여요"), "지난 자리에는 「쉬어요로 보여요」라고 하지 않는다");
  assert.equal(slotOffAsk(DAYS[1].slots[0], true, DAYS[1]), slotOffAsk(DAYS[1].slots[0], true), "앞날의 자리는 그대로");
  assert.ok(slotOffAsk(DAYS[1].slots[0], true, DAYS[1]).includes("지원한 1분께는 「쉬어요」로 보여요"));
  // 당번을 숨길 때 — 보관: 앞날의 줄은 날짜가 지나도 세지 않고 끝난 봉사는 남는다 · 준비 중: 그동안에는 모두 안 보인다
  assert.ok(hideAsk(3, "archived").endsWith("사라져요(지원 줄은 지우지 않아요)." + HIDE_PAST.archived) && HIDE_PAST.archived.includes("날짜가 지나도 그분들의 「지난 봉사」로 세지 않고") && HIDE_PAST.archived.includes("이미 끝난 봉사는 「지난 봉사」에 그대로 남아요"));
  assert.ok(hideAsk(2, "draft").endsWith(HIDE_PAST.draft) && HIDE_PAST.draft.includes("준비 중인 동안에는") && HIDE_PAST.draft.includes("보이지 않아요(다시 열면 보여요)"));
  assert.ok(hideAsk(1, "closed").endsWith("(지원 줄은 지우지 않아요)."), "모르는 상태에는 덧붙이지 않는다");
  // 상태 풀이 — 보관을 「앱에 안 보인다」고만 하지 않는다(끝난 봉사는 선 분의 지난 봉사에 남는다) · 설정 창의 상태 칸에 한 줄(당번 총괄만 — 준비 중·보관은 총괄의 선택지다)
  assert.equal(STATUS_OPTIONS.find((o) => o.value === "archived").hint, "앱 당번표에 안 보이고 고칠 수 없어요");
  assert.ok(STATUS_PAST_HINT.includes("보관해도 그때까지 끝난 봉사는 선 분의 앱 「지난 봉사」에 남아요") && STATUS_PAST_HINT.includes("뺄 줄은 보관하기 전에") && STATUS_PAST_HINT.includes("준비 중인 동안에는 안 보여요"));
  assert.ok(draftNote(true).includes(DRAFT_NO_PAST) && draftNote(false).includes(DRAFT_NO_PAST) && DRAFT_NO_PAST.includes("「지난 봉사」에 보이지 않아요"), "준비 중 안내 — 그동안에는 지난 봉사도 안 보인다");
  // 끝 날짜 당기기 — 그 뒤에 선 분 수와 새 끝 날짜를 함께
  assert.ok(afterAsk(4, "2026-10-31").startsWith("새 끝 날짜(10월 31일(토)) 뒤에 지원 4건이 있어요."));
  assert.ok(afterAsk(4, "2026-10-31").includes("지원 줄은 지우지 않아요"));
  assert.ok(afterAsk(2, "").startsWith("새 끝 날짜 뒤에 지원 2건이"), "날짜를 못 읽어도 빈 괄호를 남기지 않는다");
  // 「받는 중」 확인 — 앱에 아직 안 열렸으면 「바로 보여요」라고 말하지 않는다
  const LIVE = { live: true };
  assert.ok(openWarn(true, LIVE).includes("바로 보이고 지원을 받아요") && !openWarn(true, LIVE).includes("시험 참여자"));
  assert.ok(openWarn(true, LIVE).includes("성경암송 앱의 🙋 봉사 당번 신청에"), "앱의 단추 이름 그대로(2026-10-07 「봉사 당번 신청」으로 바뀌었다)");
  assert.ok(openWarn(false, LIVE).includes("아직 성도님 앱에 열지 않아서") && openWarn(false, LIVE).includes("시험 참여자에게만"));
  // 앱에 화면이 아직 없으면(2단계 전) 「시험 참여자에게 보여요」라고 말하지 않는다 — 누구에게도 안 보인다
  assert.equal(APP_LIVE, true, "2026-10-06 2단계(앱 화면 + api)를 운영에 올렸다 — 앱 쪽을 되돌리면 false 로(이 줄도 함께)");
  // 문이 닫힌 동안 — 선 분의 이름이 시험 참여자에게 보인다는 것과 「진짜 명단은 준비 중에」를 저장 확인·화면 머리 두 곳에서 말한다
  for (const t of [openWarn(false, LIVE), appNote(false, { live: true, notify: false }), appNote(false, { live: true, notify: true })]) {
    assert.ok(t.includes(TESTERS_SEE_NAMES) && t.includes("시험 참여자 앱에 보여요") && t.includes("「준비 중」"), t);
  }
  for (const t of [openWarn(true, LIVE), appNote(true, { live: true, notify: false }), openWarn(false, { live: false }), appNote(false, { live: false, notify: false })]) {
    assert.equal(t.includes(TESTERS_SEE_NAMES), false, "앱에 열린 뒤·앱 화면이 없을 때는 그 말을 하지 않는다");
  }
  // 넣기 창 — 넣은 분의 이름이 앱 당번표에 보인다 · 「못 가게 됐어요」는 명단의 표시(따로 알림이 오지 않는다)
  assert.ok(ADD_NOTE.includes("이름은 받는 중·지원 멈춤 당번이면 성경암송 앱 당번표에 보여요") && ADD_NOTE.includes("따로 알림은 오지 않아요") && ADD_NOTE.includes("스스로 뺄 수 없어요"));
  for (const open of [true, false]) {
    assert.ok(openWarn(open, { live: false }).includes("아직 봉사 당번 화면이 없어서") && !openWarn(open, { live: false }).includes("시험 참여자"));
    assert.ok(appNote(open, { live: false, notify: false }).includes("아직 봉사 당번 화면이 없어요") && !appNote(open, { live: false, notify: false }).includes("시험 참여자"));
    assert.ok(appNote(open, { live: false, notify: false }).includes("따로 알려 주세요"));
  }
  assert.equal(openWarn(false), openWarn(false, { live: APP_LIVE }));
  // 화면 머리 한 줄 — 문과 알림은 따로다(문을 열어도 알림이 올라가기 전에는 「따로 알려 주세요」가 남는다)
  assert.ok(appNote(false, { live: true, notify: false }).includes("시험 참여자만 볼 수 있어요") && appNote(false, { live: true, notify: false }).includes("따로 알려 주세요"));
  // 알림이 나가는 때에도 문이 닫힌 동안에는 시험 참여자에게만 간다 — 그렇게 말한다(다른 분께는 따로 알려야 한다)
  assert.ok(appNote(false, { live: true, notify: true }).includes("시험 참여자만") && appNote(false, { live: true, notify: true }).includes("앱 알림도 시험 참여자에게만 가요 — 다른 분께는"));
  assert.equal(appNote(false, { live: true, notify: true }).includes("아직 보내지 않으니"), false);
  assert.ok(appNote(true, { live: true, notify: false }).startsWith("🔕") && appNote(true, { live: true, notify: false }).includes("따로 알려 주세요"));
  assert.equal(appNote(true, { live: true, notify: true }), "");
  assert.ok(STALE_BOARD.includes("다른 분이") && STALE_BOARD.includes("새로 불러왔어요"));
  // 준비 중 안내 — 총괄은 스스로 열고, 담당은 총괄께 부탁한다(담당은 준비 중을 못 바꾼다)
  assert.ok(draftNote(true).includes("「당번 설정」에서 상태를 「받는 중」으로"));
  assert.ok(draftNote(false).includes("당번 총괄께") && !draftNote(false).includes("「당번 설정」에서"));
  for (const c of [true, false]) assert.ok(draftNote(c).endsWith("준비 중에는 넣기·확정을 해도 앱 알림이 가지 않아요."), "준비 중 당번에는 알림이 가지 않는다고 말한다");
});

test("앱 당번표에 무엇이 보이나 — 지원할 날짜가 없는 까닭을 가른다(받는 중·지원 멈춤만) · 「날짜가 안 보여요」는 보이는 자리가 0 일 때만", () => {
  const K = (status, lines, shown, later = 0, untilPast = false) => emptyKind(status, { lines, shown, later, untilPast });
  // 당번 설정만 저장하고 「받는 중」으로 열었다 — 앱에는 날짜가 하나도 없다(친구 제보 2026-10-06)
  assert.equal(K("open", 0, 0), "no-lines"); assert.equal(K("closed", 0, 0), "no-lines");
  assert.ok(emptyWhy("open", { lines: 0 }).startsWith("자리 틀이 아직 없어요") && emptyWhy("open", { lines: 0 }).includes("앱 당번표에 날짜가 보이지 않아 지원할 수 없어요"));
  assert.equal(emptyChip("open", { lines: 0 }), "자리 틀 없음 — 앱에 날짜가 안 보여요");
  assert.equal(K("open", 2, 14), ""); assert.equal(K("open", 2, 14, 30), ""); assert.equal(emptyWhy("open", { lines: 2, shown: 14 }), ""); assert.equal(emptyChip("open", { lines: 2, shown: 14 }), "");
  // 틀을 뺐어도 남은 자리(지원이 달려 못 지운 자리)의 날짜·이름은 앱에 보인다 — 「날짜가 안 보여요」라고 하지 않는다(검증 S-1)
  assert.equal(K("open", 0, 3), "leftover");
  assert.ok(emptyWhy("open", { lines: 0, shown: 3 }).includes("남은 자리의 날짜와 선 분 이름만 보이고") && !emptyWhy("open", { lines: 0, shown: 3 }).includes("날짜가 보이지 않아"));
  assert.equal(emptyChip("open", { lines: 0, shown: 3 }), "자리 틀 없음 — 앱에 남은 자리만 보여요");
  // 더한 날짜가 보이는 기간 밖뿐이다(김장 — 날짜를 골라 넣는 틀 · 60일 뒤) — 가까워지면 저절로 보인다(검증 S-2)
  assert.equal(K("open", 1, 0, 1), "later");
  assert.ok(emptyWhy("open", { lines: 1, shown: 0, later: 1 }).startsWith("앞날 자리가 모두 보이는 기간 밖이에요") && emptyWhy("open", { lines: 1, shown: 0, later: 1 }).includes("날이 가까워지면 저절로 보여요"));
  assert.equal(emptyChip("open", { lines: 1, shown: 0, later: 1 }), "보이는 기간 밖 — 앱에 아직 날짜가 안 보여요");
  // 끝 날짜가 지났다 · 틀은 있는데 날짜가 없다(날짜를 골라 넣는 틀에 아직 안 더함)
  assert.equal(K("open", 1, 0, 0, true), "until-past"); assert.equal(K("open", 0, 0, 0, true), "until-past");
  assert.ok(emptyWhy("open", { lines: 1, untilPast: true }).includes("끝 날짜를 늦추거나 비워")); assert.equal(emptyChip("open", { lines: 1, untilPast: true }), "끝 날짜 지남 — 앱에 날짜가 안 보여요");
  assert.equal(K("open", 1, 0), "no-dates"); assert.ok(emptyWhy("open", { lines: 1 }).includes("「날짜 더하기」")); assert.equal(emptyChip("open", { lines: 1 }), "날짜 없음 — 앱에 날짜가 안 보여요");
  // 준비 중·보관은 앱에 없다(따로 안내가 있다) · 빈 값
  for (const s of ["draft", "archived", "", undefined]) { assert.equal(K(s, 0, 0), ""); assert.equal(emptyWhy(s, { lines: 0 }), ""); assert.equal(emptyChip(s, {}), ""); }
  assert.equal(emptyKind("open"), "no-lines"); assert.equal(emptyKind("open", null), "no-lines");
  // 어느 말도 보이는 자리가 있는데 「날짜가 안 보여요」라고 하지 않는다
  for (const lines of [0, 1]) for (const later of [0, 2]) for (const untilPast of [false, true]) {
    const t = emptyWhy("open", { lines, shown: 5, later, untilPast }) + emptyChip("open", { lines, shown: 5, later, untilPast });
    assert.equal(/날짜가 (안 보여요|보이지 않아)/.test(t), false, t);
  }
  assert.equal(liveLineCount([{ active: true }, { active: false }, {}, null]), 2); assert.equal(liveLineCount(null), 0);
});

test("앱 당번표에 무엇이 보이나 — 재료: 당번 카드는 서버의 shown(옛 서버면 slots) · 명단은 날짜의 past·notYet·afterUntil 로 앱과 같은 범위를 센다", () => {
  const T0 = "2026-10-06";
  const B = (counts, x) => ({ status: "open", lines: [{ id: 1 }], untilDate: null, counts, ...x });
  assert.deepEqual(seenOfCounts(B({ lines: 1, slots: 5, shown: 2 }), T0), { lines: 1, shown: 2, later: 3, untilPast: false });
  assert.deepEqual(seenOfCounts(B({ lines: 1, slots: 1, shown: 0 }), T0), { lines: 1, shown: 0, later: 1, untilPast: false }, "김장 — 자리는 있는데 보이는 기간 밖");
  assert.deepEqual(seenOfCounts(B({ lines: 1, slots: 5 }), T0), { lines: 1, shown: 5, later: 0, untilPast: false }, "옛 서버(shown 칸 없음) — slots 로 본다");
  assert.deepEqual(seenOfCounts(B({ slots: 0, shown: 0 }, { lines: [], untilDate: "2026-10-05" }), T0), { lines: 0, shown: 0, later: 0, untilPast: true });
  assert.equal(seenOfCounts(B({}, { untilDate: T0 }), T0).untilPast, false, "끝 날짜가 오늘이면 아직 지나지 않았다");
  assert.equal(seenOfCounts(B({}, { untilDate: "2026-10-05" }), "").untilPast, false, "오늘을 모르면 지났다고 하지 않는다");
  assert.deepEqual(seenOfCounts(null, T0), { lines: 0, shown: 0, later: 0, untilPast: false });
  const S = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
  const ros = { board: { untilDate: "2026-11-30" }, lines: [{ id: 1, active: true }, { id: 2, active: false }], days: [
    { date: "2026-10-04", past: true, slots: S(2) }, { date: "2026-10-11", slots: S(2) }, { date: "2026-10-18", slots: S(3) },
    { date: "2026-11-29", notYet: true, slots: S(4) }, { date: "2026-12-06", notYet: true, afterUntil: true, slots: S(5) }, { date: "2026-12-13", afterUntil: true, slots: S(1) }, null] };
  assert.deepEqual(seenOfRoster(ros, T0), { lines: 1, shown: 5, later: 4, untilPast: false }, "지난 날·끝 날짜 뒤는 세지 않는다 · 보이는 기간 밖은 later 로");
  assert.equal(emptyKind("open", seenOfRoster(ros, T0)), "");
  assert.equal(emptyKind("open", seenOfRoster({ ...ros, days: ros.days.filter((d) => d && (d.past || d.notYet)) }, T0)), "later");
  assert.equal(emptyKind("open", seenOfRoster({ ...ros, lines: [], days: ros.days.filter((d) => d && !d.notYet) }, T0)), "leftover");
  assert.deepEqual(seenOfRoster({ board: {}, lines: [], days: [] }, T0), { lines: 0, shown: 0, later: 0, untilPast: false });
  assert.deepEqual(seenOfRoster(null), { lines: 0, shown: 0, later: 0, untilPast: false });
});

test("당번 카드 — 경고 칩은 앱에서 지원할 날짜가 없을 때만 · 수 칩 줄은 틀이 없어도 남은 자리·못 온다는 분이 있으면 그린다", () => {
  const C = (x) => boardCard({ id: "b1", title: "식당 봉사", status: "open", statusLabel: "받는 중", staff: [], openDays: 56, untilDate: null,
    lines: [{ id: 1, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0 }], counts: { lines: 1, slots: 16, shown: 8, need: 5, asks: 0, after: 0 }, ...x }, "2026-10-06");
  const healthy = C();
  assert.equal(/앱에 (아직 )?(날짜가 안 보여요|남은 자리만 보여요)/.test(healthy), false, "건강한 당번에는 경고가 없다"); assert.ok(healthy.includes("앞날 자리 16") && healthy.includes("빈 자리 5"));
  // 자리 틀도 자리도 없다
  const none = C({ lines: [], counts: { lines: 0, slots: 0, shown: 0, need: 0, asks: 0, after: 0 } });
  assert.ok(none.includes("자리 틀 없음 — 앱에 날짜가 안 보여요") && !none.includes("앞날 자리"));
  // 틀을 뺐지만 남은 자리에 서 있는 분·못 온다는 분이 있다 — 경고는 「남은 자리만 보여요」, 수 칩 줄은 그대로 보인다(검증 S-1)
  const left = C({ lines: [], counts: { lines: 0, slots: 3, shown: 3, need: 0, asks: 1, after: 0 } });
  assert.ok(left.includes("자리 틀 없음 — 앱에 남은 자리만 보여요") && left.includes("앞날 자리 3") && left.includes("못 온다는 분 1") && !left.includes("앱에 날짜가 안 보여요"));
  // 자리가 보이는 기간 밖에만 있다(김장) — 경고가 뜬다(검증 S-2) · 옛 서버(shown 없음)면 예전처럼 slots 로 본다
  const later = C({ counts: { lines: 1, slots: 1, shown: 0, need: 30, asks: 0, after: 0 } });
  assert.ok(later.includes("보이는 기간 밖 — 앱에 아직 날짜가 안 보여요") && later.includes("앞날 자리 1"));
  assert.equal(C({ counts: { lines: 1, slots: 1, need: 30, asks: 0, after: 0 } }).includes("보이는 기간 밖"), false);
  // 끝 날짜가 지났다(오늘을 받아야 안다) · 준비 중·보관에는 경고가 없다
  assert.ok(C({ untilDate: "2026-10-01", counts: { lines: 1, slots: 0, shown: 0, need: 0, asks: 0, after: 2 } }).includes("끝 날짜 지남 — 앱에 날짜가 안 보여요"));
  for (const status of ["draft", "archived"]) assert.equal(/앱에 (아직 )?날짜가 안 보여요/.test(C({ status, statusLabel: "x", lines: [], counts: { lines: 0, slots: 0, shown: 0 } })), false, status);
  assert.equal(boardCard({ id: "b9", title: "t", status: "open", statusLabel: "받는 중", lines: [{ id: 1 }], counts: { lines: 1, slots: 2, shown: 2 } }).includes("앱에 날짜가 안 보여요"), false, "오늘을 안 줘도 그린다");
});

test("「받는 중」 확인 글 — 열어도 앱에 지원할 날짜가 없으면 그 까닭을 덧붙인다 · 플레이스토어 앱에서는 시험 참여자에게도 안 보인다는 말 · 넣기 창", () => {
  for (const o of [{ live: true }, { live: false }]) for (const open of [true, false]) {
    for (const kind of ["no-lines", "leftover", "until-past", "later", "no-dates"]) {
      const t = openWarn(open, { ...o, kind });
      assert.ok(t.startsWith(openWarn(open, o)) && t.length > openWarn(open, o).length && t.includes("⚠️ "), kind);
    }
    assert.equal(openWarn(open, { ...o, kind: "" }), openWarn(open, o)); assert.equal(openWarn(open, { ...o, kind: "zzz" }), openWarn(open, o));
    assert.equal(openWarn(open, o).includes("자리 틀이 아직 없어요"), false);
  }
  assert.ok(openWarn(true, { kind: "no-lines" }).includes("자리 틀이 아직 없어요") && openWarn(true, { kind: "leftover" }).includes("남은 자리의 날짜만 보이고"));
  assert.equal(openWarn(true, { kind: "leftover" }).includes("날짜가 보이지 않아"), false, "남은 자리의 날짜는 보인다");
  assert.ok(openWarn(true, { kind: "later" }).includes("날이 가까워질 때까지") && openWarn(true, { kind: "until-past" }).includes("끝 날짜가 지났어요") && openWarn(true, { kind: "no-dates" }).includes("「날짜 더하기」"));
  // 플레이스토어 앱에서는 🙋 단추를 숨겨 두었다 — 문이 닫힌 동안(시험 참여자만)의 두 글이 그렇게 말한다
  assert.equal(PLAY_HIDDEN, false, "2026-10-09 성경암송 app.js 의 MINISTRY_HIDE_ON_PLAY 를 false 로 뒤집었다 — 이 값도 false");
  for (const t of [openWarn(false, { live: true, play: true }), appNote(false, { live: true, notify: false, play: true }), appNote(false, { live: true, notify: true, play: true })]) assert.ok(t.includes(PLAY_NOTE), t);
  for (const t of [openWarn(false, { live: true, play: false }), appNote(false, { live: true, notify: false, play: false }), openWarn(true, { live: true, play: true }),
    appNote(true, { live: true, notify: false, play: true }), openWarn(false, { live: false, play: true }), appNote(false, { live: false, play: true })]) assert.equal(t.includes("플레이스토어"), false, t);
  assert.equal(openWarn(false), openWarn(false, { live: APP_LIVE, play: PLAY_HIDDEN }));
  // 넣기 창 — 그날이 앱 당번표에 실리는 날일 때만 「이름이 보여요」(지난 날·끝 날짜 뒤·보이는 기간 밖에도 넣기가 있다 · 검증 S-5)
  assert.equal(addNote({ date: "2026-10-18" }), ADD_NOTE); assert.equal(addNote(null), ADD_NOTE); assert.equal(addNote(), ADD_NOTE);
  assert.ok(addNote({ past: true }).startsWith("지난 날짜예요") && !addNote({ past: true }).includes("당번표에 보여요") && !addNote({ past: true }).includes("못 가게 됐어요"));
  assert.ok(addNote({ afterUntil: true }).includes("끝 날짜 뒤라 이 날짜는 앱 당번표에 보이지 않아요") && addNote({ afterUntil: true }).includes("스스로 뺄 수 없어요") && !addNote({ afterUntil: true }).includes("당번표에 보여요(이름만)"));
  assert.ok(addNote({ notYet: true }).includes("앱 당번표에 아직 안 보여요") && addNote({ notYet: true }).includes("「내 당번」에는 보이고") && !addNote({ notYet: true }).includes("당번표에 보여요(이름만)"));
  assert.ok(addNote({ notYet: true, afterUntil: true }).includes("끝 날짜 뒤라"), "끝 날짜 뒤가 먼저");
});

test("저장 뒤 한 줄 — 알림(3단계)이 붙으면 덧붙인다", () => {
  assert.equal(notifyTail({ ok: true }), ""); assert.equal(notifyTail({ notified: 2, notifyError: null }), " · 2분께 앱 알림을 보냈어요");
  assert.equal(notifyTail({ notified: 0, notifyError: null }), ""); assert.equal(notifyTail({ notified: 0, notifyError: "notify-failed" }), " · 앱 알림은 보내지 못했어요 — 그분께 따로 알려 주세요");
  // 검토 반영(2026-10-07) — 「보냈어요」는 실제로 나간 분 수로만 · 가지 않은 분(받는 기기 없음)은 따로 말한다(「알림 꺼짐」 딱지와 어긋나지 않게)
  assert.equal(notifyTail({ notified: 0, missed: 1, notifyError: null }), " · 1분께는 앱 알림이 가지 않았어요 — 따로 알려 주세요", "한 분도 못 받았으면 「보냈어요」라고 하지 않는다");
  assert.equal(notifyTail({ notified: 1, missed: 2, notifyError: null }), " · 1분께 앱 알림을 보냈어요 · 2분께는 앱 알림이 가지 않았어요 — 따로 알려 주세요");
  assert.equal(notifyTail({ notified: 3, missed: 0, notifyError: null }), " · 3분께 앱 알림을 보냈어요");
  assert.equal(notifyTail({ notified: 0, notifyError: "notify-off" }), " · 앱 알림은 지금 꺼 두었어요 — 그분께 따로 알려 주세요");
  assert.equal(notifyFailed({ notifyError: "notify-failed" }), true); assert.equal(notifyFailed({ notifyError: "notify-off" }), true);
  assert.equal(notifyFailed({ notified: 0, missed: 2, notifyError: null }), false, "가지 않은 분이 있는 것은 실패가 아니다(토스트로 말한다)"); assert.equal(notifyFailed({ ok: true }), false); assert.equal(notifyFailed(null), false);
  assert.equal(confirmDoneText({ ok: true, already: true }, "2026-10-18"), "이미 확정된 날이에요");
  assert.equal(confirmDoneText({ ok: true, active: 2, notified: 1, missed: 1, notifyError: null }, "2026-10-18"), "10월 18일(일)을 확정했어요 · 1분께 앱 알림을 보냈어요 · 1분께는 앱 알림이 가지 않았어요 — 따로 알려 주세요");
  // 고침 검토 반영(2026-10-07) — 다시 보내기는 약속하지 않는다(다시 확정해 가는 것은 아직 잡히지 않은 줄뿐) · 준비 중·보관 당번에서는 말하지 않는다
  assert.equal(confirmDoneText({ ok: true, active: 2, notified: 0, notifyError: "notify-failed" }, "2026-10-18"),
    "10월 18일(일)을 확정했어요 · 앱 알림은 보내지 못했어요 — 그분께 따로 알려 주세요" + CONFIRM_RETRY);
  assert.ok(CONFIRM_RETRY.includes("한 번 더 보내 봐요") && CONFIRM_RETRY.includes("뜨지 않으면 다시 보내지 못한 것이니 따로 알려 주세요") && !CONFIRM_RETRY.includes("다시 보내요)"));
  for (const s of ["open", "closed"]) assert.ok(confirmDoneText({ ok: true, notified: 0, notifyError: "notify-failed" }, "2026-10-18", s).endsWith(CONFIRM_RETRY), s);
  for (const s of ["draft", "archived", ""]) assert.equal(confirmDoneText({ ok: true, notified: 0, notifyError: "notify-failed" }, "2026-10-18", s),
    "10월 18일(일)을 확정했어요 · 앱 알림은 보내지 못했어요 — 그분께 따로 알려 주세요", s + " — 알림이 없는 당번에서는 다시 확정해도 가지 않는다");
  assert.ok(!confirmDoneText({ ok: true, notified: 0, notifyError: "notify-off" }, "2026-10-18").includes("다시 확정하면"), "꺼 둔 동안에는 다시 확정해도 가지 않는다");
  assert.equal(confirmDoneText({ ok: true, active: 0 }, "2026-10-18"), "10월 18일(일)을 확정했어요");
  // 「알림 꺼짐」 딱지는 받는 중·지원 멈춤 당번에서만 — 준비 중·보관 당번의 줄에는 어떤 알림도 가지 않는다
  assert.deepEqual(["open", "closed", "draft", "archived", ""].map((s) => notifyBadges(s, true)), [true, true, false, false, false]);
  assert.equal(notifyBadges("open", false), false); assert.equal(notifyBadges("open"), NOTIFY_LIVE);
  assert.equal(addDoneText({ ok: true, id: 1, locked: false }, "가상하나"), "가상하나 — 넣었어요");
  assert.equal(addDoneText({ ok: true, id: 1, locked: true, notified: 1, notifyError: null }, "가상하나"), "가상하나 — 넣었어요 (확정된 날) · 1분께 앱 알림을 보냈어요");
  assert.equal(addDoneText({ ok: true, id: 1, locked: true, already: true }, "가상하나"), "가상하나 — 이미 이 자리에 서 계세요");
  assert.equal(addDoneText({ ok: true, id: 1, locked: false, revived: true }, "가상하나"), "가상하나 — 다시 넣었어요");
  assert.equal(movedText({ ok: true, to: { date: "2026-10-25", service: "1부", task: "설거지", start: "09:00" } }, "가상하나"), "가상하나 — 10월 25일(일) 1부 설거지(09:00)로 옮겼어요");
  assert.equal(movedText({ ok: true, already: true }, "가상하나"), "같은 자리예요");
  assert.equal(dateAddedText({ made: 2, existed: 1 }, "2026-12-25"), "12월 25일(금)에 자리 2개를 만들었어요 · 이미 있던 1개는 그대로예요");
  assert.equal(dateAddedText({ made: 0, existed: 2 }, "2026-12-25"), "12월 25일(금)에는 고른 자리가 이미 있어요");
  assert.equal(dateAddedText({ made: 0, existed: 0, reopened: 1 }, "2026-12-25"), "12월 25일(금)의 남은 자리 1개를 다시 열었어요");
  assert.equal(dateAddedText({ made: 1, existed: 1, reopened: 1 }, "2026-12-25"), "12월 25일(금)에 자리 1개를 만들었어요 · 남은 자리 1개를 다시 열었어요 · 이미 있던 1개는 그대로예요");
  assert.equal(offDoneText({ days: 3 }, true), "3일을 쉬는 날로 바꿨어요"); assert.equal(offDoneText({ days: 1 }, false), "1일을 다시 열었어요");
  assert.equal(offDoneText({ days: 0 }, true), "바뀐 날이 없어요");
});

test("오류 말 — 서버(duty-db.ts · duty.sql)가 돌려주는 코드마다 한국말이 있다", () => {
  const codes = ["not-assigned", "chief-only", "has-upcoming", "archived", "no-title", "bad-days", "bad-max", "bad-status", "bad-char", "too-long", "no-service", "bad-time",
    "bad-capacity", "bad-weekday", "bad-line", "dup-line", "bad-date", "after-until", "bad-lines", "bad-range", "changed", "past", "too-late", "below-count", "has-signups",
    "use-off", "off", "full", "overlap", "already-there", "wrong-board", "not-active", "bad-ident", "bad-note", "bad-member", "nothing",
    "no-slots", "too-many-lines", "has-after", "to-past"];
  for (const c of codes) { assert.equal(hasWord(c), true, c); assert.ok(dutyWord(c).length > 4, c); }
  assert.equal(hasWord("server"), false); assert.equal(dutyWord("zzz"), "");
  assert.equal(hasWord("toString"), false);
  assert.equal(needsReload("changed"), true); assert.equal(needsReload("not-active"), true); assert.equal(needsReload("full"), false);
  assert.equal(lostBoard("not-assigned"), true); assert.equal(lostBoard("not-found"), false);
});

test("엑셀 — 파일 이름 · 기간 고르기", () => {
  assert.equal(fileTitle('식당/봉사: "주일"'), "식당 봉사 주일"); assert.equal(fileTitle(""), "당번");
  assert.equal(exportFileName("식당 봉사", "2026-10-12"), "봉사당번_식당 봉사_2026-10-12.xlsx");
  const r = exportRanges("2026-10-12", 56);
  assert.deepEqual(r.map((x) => [x.value, x.from, x.to]), [["next4", "2026-10-12", "2026-11-08"], ["all", "2026-10-12", "2026-12-07"], ["prev4", "2026-09-14", "2026-10-11"]]);
  assert.equal(r[1].label, "앞으로 8주(보이는 기간 전체)");
});

test("고침 검토 반영(2026-10-07) — 넣기 창: 이 자리의 빠진 분에 앱 줄이 있으면 「빠진 분 → 다시 넣기」를 권한다(넣기 전에)", () => {
  assert.equal(addEndedNote({ ended: [] }), ""); assert.equal(addEndedNote({}), ""); assert.equal(addEndedNote(null), "");
  assert.equal(addEndedNote({ ended: [{ id: 1, name: "가상하나", hasApp: false, reason: "staff" }] }), "", "앱에 안 이어진 줄만 빠져 있으면 말하지 않는다");
  const one = addEndedNote({ ended: [{ id: 1, name: "가상하나", hasApp: true, reason: "staff" }, { id: 2, name: "가상둘", hasApp: false }] });
  assert.ok(one.includes("(가상하나)") && one.includes("「빠진 분 → 다시 넣기」") && one.includes("새 줄이 될 수 있어요") && one.includes("그분을 다시 넣으려면"), one);
  const many = addEndedNote({ ended: ["가", "나", "다", "라", "가"].map((n, i) => ({ id: i, name: n, hasApp: true })) });
  assert.ok(many.includes("(가 · 나 · 다 외 1분)"), "이름은 셋까지 · 같은 이름은 한 번: " + many);
});

test("고침 검토 반영(2026-10-07) — 배선: 화면·함수가 그 규칙을 실제로 쓴다(되돌려도 아무도 모르던 줄)", async () => {
  const fs = await import("node:fs");
  const read = (p) => fs.readFileSync(new URL("../" + p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const roster = read("js/menus/duty/roster.js"), forms = read("js/menus/duty/roster-forms.js"), index = read("supabase/functions/church-admin/index.ts");
  // 명단: 딱지에 당번 상태 · 저장 뒤 말은 sayDone(실패는 창) · 확정 글에 당번 상태 · 빼기 창이 자리(s)를 넘긴다
  assert.ok(roster.includes("signupBadges(e, { notify })") && roster.includes("notifyBadges(ros.board.status)"), "「알림 꺼짐」 딱지는 당번 상태를 본다");
  assert.ok(roster.includes("if (okText) await sayDone(okText, r);"), "settle — 실패는 창으로");
  assert.ok(roster.includes("confirmDoneText(r, d.date, ros.board.status)"), "확정 뒤 글 — 당번 상태");
  assert.ok(roster.includes("text: removeAsk(e, d, s)"), "빼기 확인 — 그 자리의 줄들을 본다");
  assert.equal((roster.match(/await sayDone\(offDoneText\(/g) || []).length, 3, "쉬는 날·다시 열기 세 곳");
  assert.ok(roster.includes("draftNote(ros.chief === true)"), "준비 중 안내");
  // 「지난 봉사」 확인 반영의 잇기 — 자리 쉬기 글에 그날을 넘긴다 · 날 판의 「다시 열기」가 지난 날인지 넘긴다 · 보관 안내와 자리 틀 안내가 「지난 봉사」를 말한다
  assert.ok(roster.includes("text: slotOffAsk(s, off, d), ok:"), "자리 쉬기 확인 — 그날(지난 날인가)을 넘긴다");
  assert.ok(roster.includes("off: false, past: d.past === true, ...(d.note ?"), "날 판의 다시 열기 — 지난 날인가");
  assert.ok(/archived: "보관한 당번이에요[^"]*보관하기 전에 끝난 봉사는 선 분의 앱 「지난 봉사」에 남아 있어요[^"]*상태를 먼저 바꿔 주세요\."/.test(roster), "명단의 보관 안내");
  assert.ok(roster.includes("지난 날의 명단과 성도님 앱의 「지난 봉사」에도 새 이름·시각으로 보여요 — 일이 아예 바뀐 것이면 고치지 말고 틀을 빼고 새로 만들어 주세요."), "자리 틀 안내");
  assert.ok(forms.includes("const text = offAsk({ from, to, off, active: d.active, days: d.days, tail, past: past && !off });"), "쉬는 날 흐름 — 다시 열 때만 past");
  const bform = read("js/menus/duty/board-form.js");
  assert.ok(bform.includes('"고르기", false, chief ? STATUS_PAST_HINT : "")'), "설정 창의 상태 칸 풀이는 당번 총괄에게만");
  for (const f of ["restoredText(r, e.name)", "movedText(r, e.name)", "`${e.name} — 뺐어요${notifyTail(r)}`"]) assert.ok(roster.includes(f), f);
  // 넣기 창: 실패는 창으로(세 곳) · 빠진 분의 앱 줄 안내
  assert.ok(forms.includes('if (notifyFailed(r)) await dialog({ title: "앱 알림을 보내지 못했어요", text, ok: "확인", cancel: null });') && forms.includes("else toast(text);"), "sayDone");
  assert.equal((forms.match(/await sayDone\(addDoneText\(/g) || []).length, 3, "넣기 세 곳");
  assert.ok(forms.includes("addEndedNote(slot)"), "넣기 창 머리의 안내");
  // 함수: api 의 답을 옮기는 것은 순수 함수 하나 · 당번 규칙에 알림 길을 넘긴다
  assert.ok(index.includes('return dutyNotifyOut(await appApiInternal({ action: "internalDutyNotify", kind, signup_ids: ids }, "notifyDuty"));'));
  assert.ok(/makeDuty\(db, audit, \{[^}]*dutyNotify: notifyDuty/.test(index), "makeDuty 에 dutyNotify 를 넘긴다");
});
