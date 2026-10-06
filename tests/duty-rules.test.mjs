// 봉사 당번 — 순수 규칙 시험(서버 duty-rules.ts · 2026-10-06)
import { test } from "node:test";
import assert from "node:assert/strict";
import { boardOrder, boardOut, boardPatchFor, checkBoard, checkLine, checkLineIds, checkNote, dutyChief, DUTY_LIMITS, DUTY_STAFF_ROLES, identHasCtrl, staffNames,
  DUTY_STATUS, DUTY_STATUS_LABEL, exportSheets, hidesFromApp, isDate, lineOrder, lineRowOut, overlapForStaff, placeOut, rosterOut, sameNameIds,
  slotLabel, staffByBoard, dutyNotifyOut } from "../supabase/functions/church-admin/duty-rules.ts";

test("isDate — 꼴과 실제 날짜", () => {
  assert.equal(isDate("2026-10-18"), true);
  assert.equal(isDate("2026-02-30"), false);
  assert.equal(isDate("2026-1-5"), false);
  assert.equal(isDate(""), false);
  assert.equal(isDate(20261018), false);
  assert.equal(isDate(null), false);
  // 해 범위 2000~2100 — 0000-01-01 은 JS 는 받지만 DB 가 못 받는다(500 대신 여기서 거른다)
  assert.equal(isDate("0000-01-01"), false); assert.equal(isDate("1999-12-31"), false);
  assert.equal(isDate("2000-01-01"), true); assert.equal(isDate("2100-12-31"), true); assert.equal(isDate("2101-01-01"), false);
});

test("dutyChief — 총괄 관리자·당번 총괄만", () => {
  assert.equal(dutyChief(["super"]), true);
  assert.equal(dutyChief(["duty"]), true);
  assert.equal(dutyChief(["dutylead"]), false);
  assert.equal(dutyChief(["education", "ministry"]), false);
  assert.equal(dutyChief(null), false);
  assert.deepEqual(DUTY_STAFF_ROLES, ["dutylead", "duty"]);
  for (const s of DUTY_STATUS) assert.ok(DUTY_STATUS_LABEL[s], s);
});

test("checkBoard — 기본값·다듬기", () => {
  const r = checkBoard({ title: "  식당   봉사 ", description: " 설거지\n배식 ", place: "식당", contact_note: "교회 사무실 02-000-0000" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.row, { title: "식당 봉사", description: "설거지\n배식", place: "식당", contact_note: "교회 사무실 02-000-0000",
    open_days: 56, until_date: null, max_ahead: null, status: "draft" });
  const m = checkBoard({ title: "주차", open_days: "28", until_date: "2026-12-31", max_ahead: 4, status: "open" });
  assert.deepEqual([m.row.open_days, m.row.until_date, m.row.max_ahead, m.row.status], [28, "2026-12-31", 4, "open"]);
  // 자모분리(NFD) 이름은 완성형으로
  assert.equal(checkBoard({ title: "\u1109\u1175\u11A8\u1103\u1161\u11BC" }).row.title, "식당");
});

test("checkBoard — 거절", () => {
  const bad = (x, e) => assert.deepEqual(checkBoard(x), { ok: false, error: e }, JSON.stringify(x));
  bad(null, "no-title");
  bad({ title: "  " }, "no-title");
  bad({ title: "가".repeat(DUTY_LIMITS.title + 1) }, "too-long");
  bad({ title: "식당", place: "가".repeat(41) }, "too-long");
  bad({ title: "식당", contact_note: "가".repeat(61) }, "too-long");
  bad({ title: "식당", description: "가".repeat(1001) }, "too-long");
  bad({ title: "식당\u202E봉사" }, "bad-char");
  bad({ title: "식당", place: "1층\n식당" }, "bad-char");
  bad({ title: "식당", contact_note: "문의 " + String.fromCharCode(0x061c) + "010-0000-0000" }, "bad-char");   // 방향 바꿈 글자 하나(아랍 글자 표식)도
  bad({ title: "식당" + String.fromCharCode(0x2028) + "봉사" }, "bad-char");                                  // 한 줄 칸의 줄 가름 글자
  bad({ title: "식당", open_days: 6 }, "bad-days");
  bad({ title: "식당", open_days: 371 }, "bad-days");
  bad({ title: "식당", open_days: "8주" }, "bad-days");
  bad({ title: "식당", open_days: null }, "bad-days");
  bad({ title: "식당", open_days: true }, "bad-days");
  bad({ title: "식당", until_date: "2026-13-01" }, "bad-date");
  bad({ title: "식당", max_ahead: 0 }, "bad-max");
  bad({ title: "식당", max_ahead: 201 }, "bad-max");
  bad({ title: "식당", max_ahead: "많이" }, "bad-max");
  bad({ title: "식당", status: "running" }, "bad-status");
  // 설명은 줄바꿈·탭을 받는다 — 널·그 밖의 제어·방향 바꿈 글자는 안 받는다(널은 DB 가 못 받아 500 이 된다)
  assert.equal(checkBoard({ title: "식당", description: "첫 줄\n둘째 줄\t끝" }).ok, true);
  bad({ title: "식당", description: "널\u0000글자" }, "bad-char");
  bad({ title: "식당", description: "방향\u202E바꿈" }, "bad-char");
  bad({ title: "식당", until_date: "0000-01-01" }, "bad-date");
  bad({ title: "식당", max_ahead: 1e23 }, "bad-max");
});

test("boardPatchFor — 총괄은 전부 · 담당은 이름·준비·보관을 못 바꾼다(chief-only)", () => {
  const row = (title, status) => ({ title, status, description: "", place: "", contact_note: "", open_days: 56, until_date: null, max_ahead: null });
  assert.equal(boardPatchFor(true, { title: "식당", status: "draft" }, row("주차", "archived")).ok, true);
  const lead = (before, after) => boardPatchFor(false, before, after);
  assert.equal(lead({ title: "식당", status: "open" }, row("식당", "open")).ok, true);
  assert.equal(lead({ title: "식당", status: "open" }, row("식당", "closed")).ok, true);       // 받는 중 ↔ 지원 멈춤
  assert.equal(lead({ title: "식당", status: "closed" }, row("식당", "open")).ok, true);
  assert.deepEqual(lead({ title: "식당", status: "open" }, row("식당 봉사", "open")), { ok: false, error: "chief-only" });
  assert.deepEqual(lead({ title: "식당", status: "draft" }, row("식당", "open")), { ok: false, error: "chief-only" });
  assert.deepEqual(lead({ title: "식당", status: "open" }, row("식당", "draft")), { ok: false, error: "chief-only" });
  assert.deepEqual(lead({ title: "식당", status: "open" }, row("식당", "archived")), { ok: false, error: "chief-only" });
  assert.equal(lead({ title: "식당", status: "draft" }, row("식당", "draft")).ok, true);       // 준비 중인 당번의 설명·장소는 고친다
  // 이름은 다듬은 뒤 견준다(빈칸 차이로 chief-only 가 되지 않게)
  assert.equal(lead({ title: " 식당  봉사", status: "open" }, row("식당 봉사", "open")).ok, true);
});

test("hidesFromApp — 받는 중·지원 멈춤 → 준비·보관만", () => {
  assert.equal(hidesFromApp("open", "draft"), true);
  assert.equal(hidesFromApp("closed", "archived"), true);
  assert.equal(hidesFromApp("open", "closed"), false);
  assert.equal(hidesFromApp("draft", "archived"), false);
  assert.equal(hidesFromApp("archived", "open"), false);
});

test("checkLine — 다듬기·기본값", () => {
  const r = checkLine({ service: " 2부 ", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0 });
  assert.deepEqual(r, { ok: true, line: { service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, sort: 0 } });
  const k = checkLine({ id: "12", service: "김장", start: "09:00", end: "13:00", capacity: "30", weekday: null, sort: "-3" });
  assert.deepEqual(k.line, { id: 12, service: "김장", task: "", start: "09:00", end: "13:00", capacity: 30, weekday: null, sort: -3 });
  assert.equal(checkLine({ service: "토요", start: "08:00", end: "09:00", capacity: 1, weekday: 6 }).line.weekday, 6);
});

test("checkLine — 거절", () => {
  const base = { service: "2부", task: "", start: "11:00", end: "12:00", capacity: 2, weekday: 0 };
  const bad = (patch, e) => assert.deepEqual(checkLine({ ...base, ...patch }), { ok: false, error: e }, JSON.stringify(patch));
  bad({ id: 0 }, "bad-id");
  bad({ id: "x" }, "bad-id");
  bad({ id: 1e23 }, "bad-id");
  bad({ id: "99999999999999999999" }, "bad-id");
  bad({ service: "" }, "no-service");
  bad({ service: "가".repeat(13) }, "too-long");
  bad({ task: "가".repeat(21) }, "too-long");
  bad({ service: "2부\u200B" }, "bad-char");
  bad({ start: "9:00" }, "bad-time");
  bad({ start: "24:00" }, "bad-time");
  bad({ start: "12:00", end: "12:00" }, "bad-time");
  bad({ start: "23:00", end: "01:00" }, "bad-time");       // 자정을 넘는 자리는 23:59 에서 끊는다
  bad({ capacity: 0 }, "bad-capacity");
  bad({ capacity: 201 }, "bad-capacity");
  bad({ capacity: null }, "bad-capacity");
  bad({ capacity: "두 명" }, "bad-capacity");
  bad({ weekday: 7 }, "bad-weekday");
  bad({ weekday: -1 }, "bad-weekday");
  bad({ weekday: "주일" }, "bad-weekday");
  bad({ sort: 1000 }, "bad-sort");
  assert.deepEqual(checkLine(null), { ok: false, error: "no-service" });
});

test("checkLineIds · checkNote", () => {
  assert.deepEqual(checkLineIds([3, "5", 3]), { ok: true, ids: [3, 5] });
  for (const x of [[], null, "3", [0], [-1], ["a"], [1.5], [1e23], Array.from({ length: 51 }, (_, i) => i + 1)]) {
    assert.deepEqual(checkLineIds(x), { ok: false, error: "bad-lines" }, JSON.stringify(x));
  }
  assert.deepEqual(checkNote(" 여름 휴가 ", 60, true), { ok: true, note: "여름 휴가" });
  assert.deepEqual(checkNote("", 60, true), { ok: true, note: "" });
  assert.deepEqual(checkNote("가".repeat(61), 60, true), { ok: false, error: "too-long" });
  assert.deepEqual(checkNote("첫 줄\n둘째", 60, true), { ok: false, error: "bad-char" });
  for (const c of [0x2028, 0x2029, 0x061c]) assert.deepEqual(checkNote("첫 줄" + String.fromCharCode(c) + "둘째", 60, true), { ok: false, error: "bad-char" }, c.toString(16));
  assert.deepEqual(checkNote("메모" + String.fromCharCode(0x061c), 500, false), { ok: false, error: "bad-char" });
  assert.deepEqual(checkNote("첫 줄\n둘째", 500, false), { ok: true, note: "첫 줄\n둘째" });   // 담당자 메모는 줄바꿈을 살린다
  assert.deepEqual(checkNote(null, 60, true), { ok: false, error: "bad-note" });
  assert.deepEqual(checkNote(undefined, 500, false), { ok: false, error: "bad-note" });
  assert.deepEqual(checkNote("메모\u0000", 500, false), { ok: false, error: "bad-char" });      // 여러 줄 메모에도 널·제어 글자는 안 된다
  assert.deepEqual(checkNote("메모\u202E", 500, false), { ok: false, error: "bad-char" });
  assert.deepEqual(checkNote("탭\t과\r\n줄바꿈", 500, false).ok, true);
  // 직접 적은 신원의 제어 글자 · 담당자 이름만 남기기
  assert.equal(identHasCtrl({ name: "가상\u0000", who_type: "새가족", group_name: "", sub_name: "" }), true);
  assert.equal(identHasCtrl({ name: "가상하나", who_type: "새가족", group_name: "시험\n", sub_name: "" }), true);
  assert.equal(identHasCtrl({ name: "가상하나", who_type: "새가족", group_name: "시험", sub_name: "1" }), false);
  assert.deepEqual(staffNames([{ id: "m1", name: "가", stale: true }, { id: "m2", name: "나" }]), [{ name: "가", stale: true }, { name: "나" }]);
  assert.deepEqual(staffNames(null), []);
});

test("boardOut — 칸을 골라 옮긴다(없는 수는 0 · 담당자는 id·이름·stale · 틀은 시작 시각 차례)", () => {
  const o = boardOut({ id: "b1", title: "식당 봉사", description: "설명", place: "식당", contact_note: "사무실", open_days: 28, until_date: "2026-12-31",
    max_ahead: 3, status: "open", updated_at: "t", secret: "x" },
    { lines: 2, slots: 16, need: 5, asks: 1, active: 9, after: 2, extra: 7 },
    [{ id: "m1", name: "가", stale: true, auth_user_id: "zz" }, { id: "m2", name: "나" }],
    [{ id: 2, board_id: "b1", sort: 0, service: "2부", task: "설거지", start_time: "11:30:00", end_time: "12:30:00", capacity: 2, weekday: 0, active: true },
     { id: 1, board_id: "b1", sort: 0, service: "1부", task: "", start_time: "09:00:00", end_time: "10:00:00", capacity: 3, weekday: 0, active: true }]);
  assert.deepEqual(o, { id: "b1", title: "식당 봉사", description: "설명", place: "식당", contact: "사무실", openDays: 28, untilDate: "2026-12-31", maxAhead: 3,
    status: "open", statusLabel: "받는 중", updatedAt: "t", counts: { lines: 2, slots: 16, need: 5, asks: 1, active: 9, after: 2 },
    staff: [{ id: "m1", name: "가", stale: true }, { id: "m2", name: "나" }],
    lines: [{ id: 1, sort: 0, service: "1부", task: "", start: "09:00", end: "10:00", capacity: 3, weekday: 0, active: true },
            { id: 2, sort: 0, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, active: true }] });
  const e = boardOut({ id: "b2", title: "주차", status: "draft" });
  assert.deepEqual(e.counts, { lines: 0, slots: 0, need: 0, asks: 0, active: 0, after: 0 });
  // shown(성도님 앱 당번표가 보여 주는 기간의 자리 수)은 SQL 이 줄 때만 싣는다 — 옛 SQL 이면 칸이 없고 화면은 slots 로 본다(0 을 지어내면 모든 당번에 「앱에 날짜가 안 보여요」가 뜬다)
  assert.equal("shown" in e.counts, false); assert.equal("shown" in o.counts, false);
  assert.deepEqual(boardOut({ id: "b3", status: "open" }, { slots: 3, shown: 0 }).counts, { lines: 0, slots: 3, need: 0, asks: 0, active: 0, after: 0, shown: 0 });
  assert.equal(boardOut({ id: "b3", status: "open" }, { slots: 3, shown: "2" }).counts.shown, 2); assert.equal("shown" in boardOut({ id: "b3" }, { shown: null }).counts, false);
  assert.deepEqual([e.openDays, e.untilDate, e.maxAhead, e.staff, e.lines, e.statusLabel], [56, null, null, [], [], "준비 중"]);
  assert.equal(JSON.stringify(o).includes("zz"), false);
});

test("boardOrder · lineOrder · lineRowOut", () => {
  const bs = [{ id: "3", status: "archived", title: "가" }, { id: "2", status: "draft", title: "나" }, { id: "1", status: "open", title: "다" },
    { id: "4", status: "closed", title: "라" }, { id: "5", status: "open", title: "가" }];
  assert.deepEqual(bs.sort(boardOrder).map((b) => b.id), ["5", "1", "4", "2", "3"]);
  const ls = [{ id: 3, start: "11:00", sort: 1 }, { id: 2, start: "11:00", sort: 0 }, { id: 1, start: "09:00", sort: 5 }, { id: 4, start: "11:00", sort: 0 }];
  assert.deepEqual(ls.sort(lineOrder).map((l) => l.id), [1, 2, 4, 3]);
  assert.deepEqual(lineRowOut({ id: 7, sort: 2, service: "김장", task: "", start_time: "09:00:00", end_time: "13:00:00", capacity: 30, weekday: null, active: false }),
    { id: 7, sort: 2, service: "김장", task: "", start: "09:00", end: "13:00", capacity: 30, weekday: null, active: false });
});

test("staffByBoard — 당번별로 묶고 이름 차례 · 역할 없음·정지는 stale", () => {
  const rows = [
    { board_id: "b1", member_id: "m2", admin_members: { name: "나", status: "active" } },
    { board_id: "b1", member_id: "m1", admin_members: { name: "가", status: "active" } },
    { board_id: "b1", member_id: "m3", admin_members: { name: "다", status: "disabled" } },
    { board_id: "b2", member_id: "m4", admin_members: { name: "라", status: "active" } },
    { board_id: "", member_id: "m9", admin_members: { name: "없음", status: "active" } },
  ];
  const by = staffByBoard(rows, new Set(["m1", "m2", "m3"]));
  assert.deepEqual(by.get("b1"), [{ id: "m1", name: "가" }, { id: "m2", name: "나" }, { id: "m3", name: "다", stale: true }]);
  assert.deepEqual(by.get("b2"), [{ id: "m4", name: "라", stale: true }]);   // 당번 역할을 잃은 분
  assert.equal(by.size, 2);
});

test("sameNameIds — 이름은 같은데 표식(pk)이 다른 줄만 · 같은 분의 두 자리는 고르지 않는다", () => {
  const ids = sameNameIds([
    { id: 1, name: "홍길동", pk: "aaa" }, { id: 2, name: "홍 길동", pk: "bbb" },      // 앱 줄 + 담당자 줄(빈칸 차이는 같은 이름)
    { id: 3, name: "김영희", pk: "ccc" }, { id: 4, name: "김영희", pk: "ccc" },        // 같은 분이 1부·2부
    { id: 5, name: "이철수", pk: "ddd" }, { id: 6, name: "", pk: "eee" },
  ]);
  assert.deepEqual([...ids].sort(), [1, 2]);
  assert.equal(sameNameIds(null).size, 0);
});

// SQL duty_roster 가 주는 꼴(지어낸 값) — pk·모르는 칸은 화면으로 나가지 않는다
const ROSTER = {
  ok: true, today: "2026-10-12", from: "2026-10-12", to: "2026-12-07",
  board: { id: "b1", title: "식당 봉사", description: "", place: "식당", contact: "사무실", openDays: 56, untilDate: null, maxAhead: null, status: "open", secret: 1,
    updatedAt: "2026-10-06T10:00:00.123456+00:00" },
  lines: [{ id: 1, sort: 0, service: "1부", task: "설거지", start: "09:00", end: "10:00", capacity: 2, weekday: 0, active: true },
          { id: 2, sort: 1, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, active: true }],
  days: [
    { date: "2026-10-18", off: false, note: "추수감사주일", confirmed: true, locked: true, cutoff: "2026-10-17T10:00:00+00:00", past: false, afterUntil: false, notYet: false, need: 1, asks: 1,
      slots: [
        { id: 11, lineId: 1, service: "1부", task: "설거지", start: "09:00", end: "10:00", capacity: 2, off: false,
          signups: [
            { id: 101, name: "가상하나", whoType: "교구", group: "기쁨", sub: "3", pk: "p1", source: "app", hasApp: true, hasPush: true, note: "", moved: false,
              asked: true, why: "cant", appliedAt: "2026-10-10T01:00:00+00:00", afterLock: false, overlap: true, user_id: "SECRET-UID", ident_key: "SECRET-KEY" },
            { id: 102, name: "가상하나", whoType: "", group: "", sub: "", pk: "p2", source: "staff", hasApp: false, hasPush: false, note: "전화로 받음", moved: true,
              asked: false, why: null, appliedAt: "2026-10-11T01:00:00+00:00", afterLock: true },
          ],
          ended: [{ id: 103, name: "가상셋", whoType: "교회학교", group: "청년부", sub: "1", source: "app", hasApp: true, status: "removed", reason: "staff", endedAt: "2026-10-11T02:00:00+00:00", confirmed_by: "SECRET-BY" }] },
        { id: 12, lineId: 2, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, off: false, leftover: true,
          signups: [{ id: 104, name: "가상하나", whoType: "교구", group: "기쁨", sub: "3", pk: "p1", source: "app", hasApp: true, hasPush: false, note: "", moved: false, asked: false, why: null, appliedAt: "x", afterLock: false }],
          ended: [] },
      ] },
    { date: "2026-10-25", off: true, note: "교회 행사", confirmed: false, locked: false, cutoff: "c", past: false, afterUntil: true, notYet: true, need: 0, asks: 0,
      slots: [{ id: 21, lineId: 1, service: "1부", task: "설거지", start: "09:00", end: "10:00", capacity: 2, off: false, signups: [], ended: [] }] },
  ],
};

test("rosterOut — 칸을 골라 옮기고 소속은 한 줄로 · pk·계정 번호·신원 키·확정한 사람은 싣지 않는다", () => {
  const o = rosterOut(ROSTER);
  const txt = JSON.stringify(o);
  for (const w of ["SECRET", "pk", "user_id", "ident_key", "confirmed_by", "whoType", "secret"]) assert.equal(txt.includes(w), false, w);
  assert.deepEqual(o.board, { id: "b1", title: "식당 봉사", description: "", place: "식당", contact: "사무실", openDays: 56, untilDate: null, maxAhead: null,
    status: "open", statusLabel: "받는 중", updatedAt: "2026-10-06T10:00:00.123456+00:00" });   // updatedAt — 설정 창이 dutyBoardSave 의 base 로 되돌려 보낸다
  assert.equal(o.lines.length, 2);
  const d = o.days[0];
  assert.deepEqual([d.date, d.off, d.note, d.confirmed, d.locked, d.past, d.afterUntil, d.need, d.asks], ["2026-10-18", false, "추수감사주일", true, true, false, false, 1, 1]);
  const s = d.slots[0].signups;
  assert.deepEqual(s[0], { id: 101, name: "가상하나", who: "기쁨 3목장", source: "app", hasApp: true, hasPush: true, note: "", moved: false, asked: true,
    why: "cant", appliedAt: "2026-10-10T01:00:00+00:00", afterLock: false, overlap: true, maybeDup: true });
  assert.deepEqual([s[1].overlap, d.slots[0].leftover, d.slots[1].leftover, d.notYet, o.days[1].notYet], [false, false, true, false, true]);
  assert.deepEqual([s[1].who, s[1].source, s[1].note, s[1].moved, s[1].afterLock, s[1].maybeDup], ["", "staff", "전화로 받음", true, true, true]);
  // 같은 분(pk 같음)의 다른 자리 줄도 「같은 이름 · 다른 표식」 묶음에 들어 있으면 표시된다 — 누구와 견줘야 하는지 세 줄 모두 보여 준다
  assert.equal(d.slots[1].signups[0].maybeDup, true);
  assert.deepEqual(d.slots[0].ended[0], { id: 103, name: "가상셋", who: "청년부 1", source: "app", hasApp: true, status: "removed", reason: "staff", endedAt: "2026-10-11T02:00:00+00:00" });
  assert.equal(o.days[1].afterUntil, true);
  // 빈·틀린 입력도 죽지 않는다
  const e = rosterOut(null);
  assert.deepEqual([e.days, e.lines, e.board.title], [[], [], ""]);
});

test("overlapForStaff — 같은 당번이면 자리 이름 · 다른 당번이면 이름을 싣지 않는다", () => {
  assert.deepEqual(overlapForStaff({ board: "식당 봉사", service: "2부", task: "배식", start: "11:30", same_board: true, draft: false }), { same: true, label: "2부 배식 11:30" });
  assert.deepEqual(overlapForStaff({ board: "주차 봉사", service: "2부", task: "", start: "11:00", same_board: false, draft: false }), { same: false, label: "" });
  assert.deepEqual(overlapForStaff(null), { same: false, label: "" });
  assert.equal(JSON.stringify(overlapForStaff({ board: "남의 당번", service: "x", same_board: false })).includes("남의 당번"), false);
});

test("placeOut · slotLabel", () => {
  assert.deepEqual(placeOut({ date: "2026-10-18", service: "2부", task: "설거지", start: "11:30", extra: 1 }), { date: "2026-10-18", service: "2부", task: "설거지", start: "11:30" });
  assert.equal(slotLabel({ service: "2부", task: "설거지" }), "2부 설거지");
  assert.equal(slotLabel({ service: "김장", task: "" }), "김장");
});

test("exportSheets — 「당번표」는 이름만 · 빈 자리 표시 · 쉬는 날 · 「명단」은 소속·넣은 곳(메모 없음)", () => {
  const { table, list } = exportSheets(rosterOut(ROSTER));
  assert.deepEqual(table[0], ["날짜", "1부 설거지 09:00", "2부 설거지 11:30", "상태"]);
  assert.deepEqual(table[1], ["10월 18일(일)", "가상하나, 가상하나", "가상하나, (빈 자리)", "확정 · 추수감사주일"]);
  assert.deepEqual(table[2], ["10월 25일(일)", "쉼", "", "쉬는 날 · 교회 행사"]);
  assert.deepEqual(list[0], ["당번", "날짜", "자리", "시각", "이름", "소속", "넣은 곳"]);
  assert.deepEqual(list[1], ["식당 봉사", "10월 18일(일)", "1부 설거지", "09:00~10:00", "가상하나", "기쁨 3목장", "앱"]);
  assert.deepEqual(list[2].slice(4), ["가상하나", "", "담당자"]);
  assert.equal(list.length, 4);                                    // 살아 있는 세 줄(빠진 분·쉬는 날 줄 없음)
  const all = JSON.stringify({ table, list });
  assert.equal(all.includes("전화로 받음"), false, "담당자 메모가 엑셀에 실렸다");
  assert.equal(all.includes("가상셋"), false, "빠진 분이 엑셀에 실렸다");
  // 당번표 시트에는 소속·넣은 곳이 없다(벽에 붙는다)
  assert.equal(JSON.stringify(table).includes("기쁨"), false);
  assert.equal(JSON.stringify(table).includes("담당자"), false);
});

test("exportSheets — 이 자리만 쉼 · 그 기간에 자리가 없는 틀은 칸이 없다 · 칸 차례는 자리 틀 차례", () => {
  const r = { board: { title: "주차" }, lines: [{ id: 2 }, { id: 1 }, { id: 9 }],
    days: [{ date: "2026-11-01", off: false, locked: false, note: "",
      slots: [{ lineId: 1, service: "1부", task: "", start: "09:00", end: "10:00", capacity: 1, off: true, signups: [{ name: "가", who: "", source: "app" }] },
              { lineId: 2, service: "2부", task: "", start: "11:00", end: "12:00", capacity: 2, off: false, signups: [] }] }] };
  const { table, list } = exportSheets(r);
  assert.deepEqual(table[0], ["날짜", "2부 11:00", "1부 09:00", "상태"]);
  assert.deepEqual(table[1], ["11월 1일(일)", "(빈 자리), (빈 자리)", "쉼", ""]);
  assert.equal(list.length, 1, "쉬는 자리의 줄은 명단에 넣지 않는다");
});

test("dutyNotifyOut — 성경암송 api 의 답을 옮긴다(옛 api 는 missed·off·held 가 없다 · held 는 꺼 둔 답의 수일 때만)", () => {
  assert.equal(dutyNotifyOut(null), null); assert.equal(dutyNotifyOut(undefined), null);
  assert.deepEqual(dutyNotifyOut({ ok: true, sent: 2 }), { sent: 2, missed: 0, off: false }, "옛 api");
  assert.deepEqual(dutyNotifyOut({ ok: true, sent: 1, missed: 3 }), { sent: 1, missed: 3, off: false }, "missed 를 sent 에 더하지 않는다");
  assert.deepEqual(dutyNotifyOut({ ok: true, sent: 0, missed: 0, off: true }), { sent: 0, missed: 0, off: true }, "held 를 모른다");
  assert.deepEqual(dutyNotifyOut({ ok: true, sent: 0, missed: 0, off: true, held: 0 }), { sent: 0, missed: 0, off: true, held: 0 });
  assert.deepEqual(dutyNotifyOut({ ok: true, sent: 0, missed: 0, off: true, held: 2.7 }), { sent: 0, missed: 0, off: true, held: 2 });
  for (const h of ["2", null, -1, NaN, {}]) assert.deepEqual(dutyNotifyOut({ sent: 0, off: true, held: h }), { sent: 0, missed: 0, off: true }, "수가 아닌 held 는 싣지 않는다: " + String(h));
  assert.deepEqual(dutyNotifyOut({ sent: 3, missed: 1, held: 5 }), { sent: 3, missed: 1, off: false }, "꺼 둔 답이 아니면 held 를 싣지 않는다");
  for (const o of ["true", 1, null]) assert.equal(dutyNotifyOut({ sent: 0, off: o }).off, false, "off 는 true 하나일 때만");
  assert.deepEqual(dutyNotifyOut({ sent: "x", missed: "y" }), { sent: 0, missed: 0, off: false });
});
