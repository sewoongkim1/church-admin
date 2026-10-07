// 📅 당번 명단 달력(2026-10-07 친구 요청 — 「어드민에서도 달력으로 확인」)
//   공휴일 표(holidays.js) · 달력 규칙(duty-logic.js cal*) · 달력 조각(roster-cal.js) · 명단 화면의 이음(roster.js — 가짜 화면으로 실제로 눌러 본다) · 색
//   이름은 가짜(성도1 …)만. 실제 브라우저에서의 모양·대비·굴리기는 손으로 본다(성경암송 docs/notes/duty-roster.md 「공휴일」·「어드민 달력」).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { HOL_UNTIL, HOLIDAYS, holidayName, holItems } from "../js/menus/duty/holidays.js";
import {
  CAL_MIN, calUse, calMonths, calTitle, calMonthWord, calMonth, calCell, calMark, calLabel, calPick, calStep, olderPick, olderText, revealBy,
  dayChip, initialDay, maxBack, addDays,
} from "../js/menus/duty/duty-logic.js";
import { calHtml } from "../js/menus/duty/roster-cal.js";
import { render } from "../js/menus/duty/roster.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const TODAY = "2026-10-07";   // 수요일
const who = (id, x = {}) => ({ id, name: `성도${id}`, who: "화평 1목장", source: "app", hasApp: true, hasPush: true, ...x });
const slot = (id, x = {}) => ({ id, lineId: 1, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, off: false, leftover: false, signups: [], ended: [], ...x });
// 그날 줄 — need 는 서버(성경암송 duty_roster)와 같은 규칙으로 센다: 쉬는 자리·남은 자리를 뺀 빈 칸
const day = (date, slots = [], x = {}) => ({ date, off: false, note: "", confirmed: false, locked: false, cutoff: `${addDays(date, -1)}T10:00:00Z`, past: date < TODAY,
  afterUntil: false, notYet: false, asks: 0, slots, need: slots.filter((s) => !s.off && !s.leftover).reduce((k, s) => k + Math.max(0, s.capacity - s.signups.length), 0), ...x });
const DAYS = [
  day("2026-09-27", [slot(1, { signups: [who(1), who(2)] })]),
  day("2026-10-04", [slot(2, { signups: [who(3)] })]),
  day("2026-10-09", [slot(3, { signups: [who(4)] })]),                                                    // 금요일 · 한글날
  day("2026-10-11", [slot(4, { signups: [who(5), who(6)] }), slot(5, { capacity: 1, task: "배식" })]),
  day("2026-10-18", [slot(6, { signups: [who(7)] })], { off: true, note: "교회 행사" }),
  day("2026-10-25", [slot(7, { signups: [who(8), who(9, { asked: true, why: "cant" })] })], { confirmed: true, locked: true, asks: 1 }),
  day("2026-11-01", [slot(8, { signups: [who(10), who(11)] })]),
  day("2026-11-08", []),
  day("2026-12-25", [slot(9)]),                                                                           // 금요일 · 성탄절
];
const D = (date) => DAYS.find((d) => d.date === date);

test("공휴일 표 — 꼴 · 해마다 있어야 하는 날 · 대체공휴일을 규칙으로 다시 셈한 것과 같다 · 성경암송 앱의 표와 같은 지문", () => {
  const H = HOLIDAYS, keys = Object.keys(H), until = HOL_UNTIL;
  const utc = (s) => new Date(s + "T00:00:00Z"), dow = (s) => utc(s).getUTCDay(), next = (s) => addDays(s, 1);
  // 이름은 정해 둔 낱말만(선거일·임시공휴일이 생기면 그 이름으로 — 「…선거」·「임시공휴일」). 노동절·제헌절은 2026년 5월부터 공휴일이다(공휴일에 관한 법률 제2조 개정).
  const NAMES = ["신정", "설날", "삼일절", "노동절", "어린이날", "부처님오신날", "현충일", "제헌절", "광복절", "추석", "개천절", "한글날", "성탄절", "대체공휴일", "임시공휴일"];
  assert.ok(keys.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(until) && utc(until).toISOString().slice(0, 10) === until, "HOL_UNTIL");
  keys.forEach((k, i) => {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(utc(k).getTime()) && utc(k).toISOString().slice(0, 10) === k, `${k} — 실제 날짜가 아니다`);
    assert.ok(k <= until, `${k} — 표 끝(HOL_UNTIL) 뒤의 날짜`);
    if (i) assert.ok(keys[i - 1] < k, `${k} — 날짜 차례가 아니다`);
    assert.ok(NAMES.includes(H[k]) || /선거$/.test(H[k]), `${k} — 모르는 이름: ${H[k]}`);
  });
  // 표가 통째로 덮는 해마다: 양력 공휴일 열(그날이 추석 연휴와 겹치면 추석으로 적혀 있다 — 2028-10-03) · 설날·추석은 이어진 사흘 · 부처님오신날은 많아야 하루
  const FIXED = { "01-01": "신정", "03-01": "삼일절", "05-01": "노동절", "05-05": "어린이날", "06-06": "현충일", "07-17": "제헌절", "08-15": "광복절", "10-03": "개천절", "10-09": "한글날", "12-25": "성탄절" };
  const lunar = (name) => name === "설날" || name === "추석";
  const first = Number(keys[0].slice(0, 4)), last = Number(until.slice(0, 4)), full = [];
  for (let y = first; y <= last; y++) if (H[`${y}-01-01`] && (y < last || until.slice(5) === "12-31")) full.push(y);
  assert.ok(full.length >= 1, "통째로 덮는 해가 하나는 있어야 한다(없으면 이 검사가 아무것도 보지 않는다)");
  assert.equal(until.slice(5), "12-31", "표 끝은 그 해의 마지막 날이어야 한다(해를 반만 덮으면 「없는 날」과 「아직 안 적은 날」을 가를 수 없다)");
  let ranged = 0;
  for (const y of full) {
    for (const md of Object.keys(FIXED)) assert.ok(H[`${y}-${md}`] === FIXED[md] || lunar(H[`${y}-${md}`]), `${y}-${md} ${FIXED[md]} — 표에는 ${H[`${y}-${md}`]}`);
    for (const name of ["설날", "추석"]) {
      const ds = keys.filter((k) => k.startsWith(`${y}-`) && H[k] === name);
      assert.equal(ds.length, 3, `${y}년 ${name} — 사흘이어야 한다`);
      assert.ok(next(ds[0]) === ds[1] && next(ds[1]) === ds[2], `${y}년 ${name} — 이어진 사흘이어야 한다`);
      // 이어진 같은 이름은 풀이에서 범위로 적힌다(한 달 안에 든 연휴만 본다)
      if (ds[0].slice(0, 7) === ds[2].slice(0, 7)) { ranged++; assert.ok(holItems(calMonth(ds[0].slice(0, 7))).includes(`${Number(ds[0].slice(8))}~${Number(ds[2].slice(8))}일 ${name}`), `${y}년 ${name} 범위`); }
    }
    assert.ok(keys.filter((k) => k.startsWith(`${y}-`) && H[k] === "부처님오신날").length <= 1, `${y}년 부처님오신날`);
  }
  assert.ok(ranged >= 1, "범위로 적히는 연휴를 하나는 보았다");
  // 대체공휴일 — 「관공서의 공휴일에 관한 규정」 제3조(대통령령 제36290호 · 2026-04-30)를 여기서 다시 셈해 표와 맞댄다(성경암송 tests/duty-front.test.cjs 와 같은 셈):
  //   ① 국경일(삼일절·제헌절·광복절·개천절·한글날)·부처님오신날·노동절·어린이날·성탄절이 토요일·일요일과 겹치면 ② 설날·추석 연휴의 하루가 일요일과 겹치면
  //   ③ 연휴의 하루가 다른 공휴일과 겹치면 → 그 공휴일(연휴) 다음의 첫 비공휴일. 신정·현충일·선거일은 대체공휴일이 없다.
  const base = keys.filter((k) => H[k] !== "대체공휴일"), want = new Set();
  const free = (d) => { let x = next(d); while (dow(x) === 0 || dow(x) === 6 || base.includes(x) || want.has(x)) x = next(x); return x; };
  const WEEKEND = ["삼일절", "제헌절", "광복절", "개천절", "한글날", "부처님오신날", "노동절", "어린이날", "성탄절"];
  const blockEnd = (k) => { let e = k; while (H[next(e)] === H[k]) e = next(e); return e; };
  for (const k of base) {
    if (lunar(H[k])) { if (dow(k) === 0 || WEEKEND.includes(FIXED[k.slice(5)])) want.add(free(blockEnd(k))); }
    else if (WEEKEND.includes(H[k]) && (dow(k) === 0 || dow(k) === 6)) want.add(free(k));
  }
  assert.deepEqual(keys.filter((k) => H[k] === "대체공휴일"), [...want].filter((d) => d <= until).sort(), "대체공휴일이 규칙으로 셈한 것과 다르다(빠졌거나 더 들었다)");
  // ⚠️ 표는 두 저장소에 있다 — 성경암송 tests/duty-front.test.cjs 의 지문과 **같은 값**이어야 한다. 표를 고치면 두 표와 두 지문을 함께 고친다.
  const print = createHash("sha256").update(keys.map((k) => `${k}=${H[k]}`).join("\n")).digest("hex").slice(0, 12);
  assert.equal(print, "187ca2cf84fc", "공휴일 표가 바뀌었다 — 성경암송 js/duty.js 의 DUTY_HOLIDAYS 도 같은 표로 고치고, 두 저장소 시험의 지문을 같은 값으로 바꾼다");
});

test("공휴일 이름 · 풀이 조각 — 표에 있는 날짜만 · 틀린 값과 객체의 물려받은 이름은 빈 글", () => {
  assert.equal(holidayName("2026-10-09"), "한글날"); assert.equal(holidayName("2026-10-05"), "대체공휴일"); assert.equal(holidayName("2026-10-06"), "");
  assert.equal(holidayName("2026-10-09T00:00:00+09:00"), "한글날", "날짜로 시작하는 글");
  for (const bad of ["", null, undefined, "2026-10-9", "toString", "__proto__", "constructor", 20261009]) assert.equal(holidayName(bad), "", String(bad));
  assert.equal(holidayName(addDays(HOL_UNTIL, 1)), "", "표 끝 뒤의 날짜는 공휴일이라고도 아니라고도 하지 않는다");
  assert.deepEqual(holItems(calMonth("2026-10")), ["3일 개천절", "5일 대체공휴일", "9일 한글날"]);
  assert.deepEqual(holItems(calMonth("2026-11")), []); assert.deepEqual(holItems(calMonth("2026-12")), ["25일 성탄절"]);
  // 2026년 5월부터 공휴일이 된 두 날 — 2027년에는 둘 다 토요일이라 월요일이 대체공휴일이다(옛 지식으로 만든 표에는 이 넷이 빠진다)
  assert.deepEqual(holItems(calMonth("2027-05")), ["1일 노동절", "3일 대체공휴일", "5일 어린이날", "13일 부처님오신날"]);
  assert.deepEqual(holItems(calMonth("2027-07")), ["17일 제헌절", "19일 대체공휴일"]);
  assert.equal(holidayName("2027-05-01"), "노동절"); assert.equal(holidayName("2027-07-17"), "제헌절");
  // 설날은 한국 음력이다 — 2027·2028년은 중국 춘절보다 하루 늦다(2027-02-07 · 2028-01-27). 2028-10-03 은 추석이면서 개천절(이름은 추석) · 선거일도 공휴일이다
  assert.deepEqual(holItems(calMonth("2027-02")), ["6~8일 설날", "9일 대체공휴일"]); assert.deepEqual(holItems(calMonth("2028-01")), ["1일 신정", "26~28일 설날"]);
  assert.deepEqual(holItems(calMonth("2028-10")), ["2~4일 추석", "5일 대체공휴일", "9일 한글날"]); assert.deepEqual(holItems(calMonth("2028-04")), ["12일 국회의원 선거"]);
  assert.equal(holidayName("2027-06-07"), "", "현충일은 대체공휴일이 없다"); assert.equal(holidayName("2028-01-03"), "", "신정도 없다");
  assert.deepEqual(holItems(null), []); assert.deepEqual(holItems([{ date: "", n: 0 }, null]), []);
});

test("달력을 쓸 때 · 달 — 날짜가 넷 이상 · 날짜가 있는 달만 · 주를 채운 칸", () => {
  assert.equal(CAL_MIN, 4);
  assert.equal(calUse(DAYS), true); assert.equal(calUse(DAYS.slice(0, 4)), true); assert.equal(calUse(DAYS.slice(0, 3)), false);
  assert.equal(calUse([]), false); assert.equal(calUse(null), false); assert.equal(calUse([null, {}, { date: "" }, { date: "2026-10-11" }]), false, "날짜 없는 줄은 세지 않는다");
  assert.deepEqual(calMonths(DAYS), ["2026-09", "2026-10", "2026-11", "2026-12"]);
  assert.deepEqual(calMonths([{ date: "2026-11-01" }, { date: "2026-10-11" }, null, { date: "x" }, {}]), ["2026-10", "2026-11"]);
  assert.equal(calTitle("2026-10"), "2026년 10월"); assert.equal(calTitle("2027-02"), "2027년 2월"); assert.equal(calTitle("x"), ""); assert.equal(calTitle(null), "");
  assert.equal(calMonthWord("2026-09"), "9월"); assert.equal(calMonthWord(""), "");
  const oct = calMonth("2026-10");   // 1일이 목요일
  assert.equal(oct.length, 35);
  assert.deepEqual(oct.slice(0, 5), [{ date: "", n: 0 }, { date: "", n: 0 }, { date: "", n: 0 }, { date: "", n: 0 }, { date: "2026-10-01", n: 1 }]);
  assert.deepEqual(oct[34], { date: "2026-10-31", n: 31 });
  const nov = calMonth("2026-11");   // 1일이 일요일 · 30일 — 마지막 주를 빈칸으로 채운다
  assert.deepEqual(nov[0], { date: "2026-11-01", n: 1 }); assert.equal(nov.length, 35); assert.deepEqual(nov.slice(30), Array(5).fill({ date: "", n: 0 }));
  assert.equal(calMonth("2028-02").filter((c) => c.date).length, 29, "윤년");
  for (const bad of ["", null, "2026-13", "2026-00", "2026-1", "x"]) assert.deepEqual(calMonth(bad), [], String(bad));
  for (const ym of ["2026-08", "2027-02", "2027-05"]) assert.equal(calMonth(ym).length % 7, 0, ym);
});

test("달력 칸(calCell) — 칩의 판정 그대로 + 「채워진 인원 / 필요 인원」: 필요 − 채워진 = 서버의 빈 자리", () => {
  for (const d of DAYS) {
    const c = calCell(d, TODAY), chip = dayChip(d, TODAY);
    for (const k of Object.keys(chip)) assert.deepEqual(c[k], chip[k], `${d.date} ${k} — 칩과 같은 판정이어야 한다`);
    if (!d.off) assert.equal(c.cap - c.n, d.need, `${d.date} — 필요 − 채워진 = 빈 자리`);
  }
  assert.deepEqual([calCell(D("2026-10-11")).n, calCell(D("2026-10-11")).cap, calCell(D("2026-10-11")).kind], [2, 3, "need"]);
  assert.deepEqual([calCell(D("2026-10-04")).kind, calMark(calCell(D("2026-10-04")))], ["past", "1/2"], "지난 날도 수를 보여 준다(누가 섰는지 확인하는 날)");
  assert.deepEqual([calCell(D("2026-10-18")).kind, calMark(calCell(D("2026-10-18")))], ["off", "쉼"]);
  assert.deepEqual([calCell(D("2026-10-25")).kind, calCell(D("2026-10-25")).lock, calMark(calCell(D("2026-10-25")))], ["ask", true, "2/2"]);
  assert.deepEqual([calCell(D("2026-11-01")).kind, calMark(calCell(D("2026-11-01")))], ["full", "2/2"]);
  assert.deepEqual([calCell(D("2026-11-08")).kind, calMark(calCell(D("2026-11-08")))], ["none", "–"], "자리가 없는 날");
  // 쉬는 자리는 세지 않는다 · 남은 자리는 서 있는 분만 · 정원을 넘겨 넣은 자리는 정원까지만
  const mixed = day("2026-11-15", [slot(1, { signups: [who(1)] }), slot(2, { off: true, signups: [who(2)] }), slot(3, { leftover: true, capacity: 3, signups: [who(3)] }),
    slot(4, { capacity: 1, signups: [who(4), who(5), who(6)] })]);
  assert.deepEqual([calCell(mixed).n, calCell(mixed).cap], [3, 4]);   // 1/2 + (쉼) + 1/1(남은 자리) + 1/1(넘김)
  assert.equal(calCell(mixed).cap - calCell(mixed).n, mixed.need);
  const onlyLeft = day("2026-11-22", [slot(1, { leftover: true })]);
  assert.deepEqual([calCell(onlyLeft).kind, calMark(calCell(onlyLeft))], ["none", "–"], "아무도 없는 남은 자리뿐인 날은 셀 것이 없다");
  assert.deepEqual([calCell({ date: "2026-11-29" }).n, calCell({ date: "2026-11-29" }).cap, calCell({ date: "2026-11-29" }).kind], [0, 0, "none"]);
  assert.equal(calMark(null), "–"); assert.equal(calMark({ kind: "off", cap: 3, n: 1 }), "쉼");
  // 낭독 — 칩의 말 · 수 · 확정 · 공휴일 · 오늘
  assert.equal(calLabel(D("2026-10-11"), calCell(D("2026-10-11"), TODAY)), "10월 11일(일) — 빈 자리 1 · 필요 3명 가운데 2명 채워졌어요");
  assert.equal(calLabel(D("2026-10-09"), calCell(D("2026-10-09"), "2026-10-09"), "한글날"), "10월 9일(금) — 빈 자리 1 · 필요 2명 가운데 1명 채워졌어요 · 공휴일(한글날) · 오늘");
  assert.equal(calLabel(D("2026-10-25"), calCell(D("2026-10-25"), TODAY)), "10월 25일(일) — 못 온다 1 · 필요 2명 가운데 2명 채워졌어요 · 확정된 날");
  assert.equal(calLabel(D("2026-10-18"), calCell(D("2026-10-18"), TODAY)), "10월 18일(일) — 쉼", "쉬는 날은 수를 읽지 않는다");
  assert.equal(calLabel(D("2026-11-08"), calCell(D("2026-11-08"), TODAY)), "11월 8일(일) — 자리 없음");
});

test("달 옮기기 — 그 달에서 고를 날은 칩과 같은 차례(오늘 이후 첫 날 → 마지막 날) · 날짜가 없는 쪽은 빈 글", () => {
  assert.equal(calPick(DAYS, "2026-10", TODAY), "2026-10-09"); assert.equal(calPick(DAYS, "2026-09", TODAY), "2026-09-27"); assert.equal(calPick(DAYS, "2026-11", TODAY), "2026-11-01");
  assert.equal(calPick(DAYS, "2027-01", TODAY), ""); assert.equal(calPick(null, "2026-10", TODAY), "");
  assert.equal(calPick(DAYS, "2026-10", TODAY), initialDay(DAYS.filter((d) => d.date.startsWith("2026-10")), TODAY));
  assert.equal(calStep(DAYS, "2026-10-11", "next", TODAY), "2026-11-01"); assert.equal(calStep(DAYS, "2026-10-11", "prev", TODAY), "2026-09-27");
  assert.equal(calStep(DAYS, "2026-11-08", "next", TODAY), "2026-12-25");
  assert.equal(calStep(DAYS.filter((d) => !d.date.startsWith("2026-11")), "2026-10-11", "next", TODAY), "2026-12-25", "날짜가 없는 달(11월)은 건너뛴다");
  assert.equal(calStep(DAYS, "2026-12-25", "next", TODAY), ""); assert.equal(calStep(DAYS, "2026-09-27", "prev", TODAY), "");
  assert.equal(calStep(DAYS, "2027-03-01", "next", TODAY), "", "고른 날의 달이 명단에 없으면 가지 않는다"); assert.equal(calStep([], "", "prev", TODAY), "");
});

test("지난 날 더 보기 — 보던 달에 새 날짜가 생기면 그대로 · 아니면 새로 생긴 앞 달로 · 새 날짜가 없으면 그렇다고 말한다", () => {
  const before = ["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"], at = (ds) => ds.map((date) => ({ date }));
  assert.equal(olderPick(before, at(["2026-09-27", ...before]), "2026-10-11", TODAY), "2026-09-27", "앞 달에만 새 날짜 → 그 달의 마지막 날");
  assert.equal(olderPick(before, at(["2026-09-27", "2026-10-02", ...before]), "2026-10-11", TODAY), "2026-10-11", "보던 달에도 새 날짜 → 그대로");
  assert.equal(olderPick(before, at(before), "2026-10-11", TODAY), "2026-10-11", "새 날짜 없음 → 그대로");
  assert.equal(olderPick(before, at([...before, "2026-11-01"]), "2026-10-11", TODAY), "2026-10-11", "그사이 저절로 생긴 앞날 자리는 지난 날짜가 아니다");
  assert.equal(olderPick([], at(["2026-09-06"]), "", TODAY), "", "고른 날이 없으면(빈 명단에서 불러옴) 그대로 — 그리기가 고른다");
  assert.equal(olderText(before, at(["2026-09-20", "2026-09-27", ...before]), 42, TODAY), "지난 날짜 2개를 더 불러왔어요");
  assert.equal(olderText(before, at(before), 42, TODAY), "지난 6주 안에는 더 지난 날짜가 없어요");
  assert.equal(olderText(before, at([...before, "2026-11-01"]), 70, TODAY), "지난 10주 안에는 더 지난 날짜가 없어요", "앞날 자리는 세지 않는다");
  assert.equal(olderText([], [], maxBack(), TODAY), "지난 52주 안에는 더 지난 날짜가 없어요");
  assert.equal(olderText(null, null, undefined, ""), "지난 0주 안에는 더 지난 날짜가 없어요");
});

test("굴리기(revealBy) — 그날 판이 화면 아래에 가려 있을 때만, 모자란 만큼만 · 머리줄 아래로는 올리지 않는다", () => {
  assert.equal(revealBy(300, 667), 0, "이미 220px 넘게 보인다");
  assert.equal(revealBy(447, 667), 0, "꼭 220px");
  assert.equal(revealBy(620, 667), 173, "47px 만 보인다 → 173px 굴린다");
  assert.equal(revealBy(900, 667), 453, "화면 아래에 있다");
  assert.equal(revealBy(120, 300), 40, "화면이 낮아도 모자란 만큼(40px)을 올릴 자리가 있으면 그만큼");
  assert.equal(revealBy(100, 250), 36, "화면이 낮다 → 70px 가 모자라도 판을 머리줄 밑까지만 올린다(100 − 56 − 8 = 36)");
  assert.equal(revealBy(70, 200), 6, "머리줄 바로 아래 — 더 올리지 않는다");
  assert.equal(revealBy(40, 200), 0, "이미 머리줄에 붙었다");
  assert.equal(revealBy(620, 667, { keep: 100 }), 53); assert.equal(revealBy(620, 667, { head: 0, keep: 700 }), 612);
  for (const bad of [[NaN, 667], [620, 0], [620, NaN], [undefined, 667], ["x", "y"]]) assert.equal(revealBy(...bad), 0, String(bad));
});

test("달력 조각(calHtml) — 칸 = 단추(data-day) · 칩과 같은 뜻 · ⚠·🔒 · 오늘 · 공휴일은 hol · 앞뒤 달 단추 · 풀이는 있는 표시만", () => {
  const oct = calHtml(DAYS, "2026-10-11", TODAY, { older: true });
  assert.ok(oct.startsWith('<div class="dty-cal" role="group" aria-label="날짜 고르기">'));
  assert.ok(oct.includes("<b>2026년 10월</b>"));
  assert.ok(oct.includes('<span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>'));
  assert.equal((oct.match(/<button type="button" class="dty-cal-c has /g) || []).length, 5, "10월의 당번 날짜 다섯(4·9·11·18·25일)");
  assert.equal((oct.match(/class="dty-cal-c[^"]*"/g) || []).length, 35, "칸은 서른다섯(빈칸 넷 + 31일)");
  assert.ok(oct.includes('<button type="button" class="dty-cal-c has k-need on" data-day="2026-10-11" aria-pressed="true" aria-label="10월 11일(일) — 빈 자리 1 · 필요 3명 가운데 2명 채워졌어요"><span>11</span><i aria-hidden="true">2/3</i></button>'), "고른 날");
  assert.ok(oct.includes('<button type="button" class="dty-cal-c has k-need hol" data-day="2026-10-09" aria-pressed="false" aria-label="10월 9일(금) — 빈 자리 1 · 필요 2명 가운데 1명 채워졌어요 · 공휴일(한글날)"><span>9</span><i aria-hidden="true">1/2</i></button>'),
    "당번이 있는 공휴일 — 칸의 뜻(k-need)은 그대로이고 hol 이 붙는다");
  assert.ok(oct.includes('class="dty-cal-c has k-past" data-day="2026-10-04" aria-pressed="false" aria-label="10월 4일(일) — 지난 날 · 필요 2명 가운데 1명 채워졌어요"><span>4</span><i aria-hidden="true">1/2</i></button>'), "지난 날");
  assert.ok(oct.includes('class="dty-cal-c has k-off" data-day="2026-10-18" aria-pressed="false" aria-label="10월 18일(일) — 쉼"><span>18</span><i aria-hidden="true">쉼</i></button>'), "쉬는 날");
  assert.ok(oct.includes('class="dty-cal-c has k-ask lock" data-day="2026-10-25" aria-pressed="false" aria-label="10월 25일(일) — 못 온다 1 · 필요 2명 가운데 2명 채워졌어요 · 확정된 날">' +
    '<span>25</span><i aria-hidden="true">2/2</i><em class="wn" aria-hidden="true">⚠</em><em class="lk" aria-hidden="true">🔒</em></button>'), "못 온다는 분 + 확정");
  assert.ok(oct.includes('<span class="dty-cal-c today" aria-current="date"><span>7</span></span>'), "오늘(당번 없는 날)");
  assert.ok(oct.includes('<span class="dty-cal-c hol" title="개천절"><span>3</span></span>') && oct.includes('<span class="dty-cal-c hol" title="대체공휴일"><span>5</span></span>'), "당번이 없는 공휴일도 빨갛게");
  assert.ok(oct.includes('<span class="dty-cal-c"><span>10</span></span>') && oct.includes('<span class="dty-cal-c"><span>6</span></span>'), "토요일·평일은 그대로");
  assert.equal((oct.match(/ hol"/g) || []).length, 3, "10월의 빨간 날짜는 셋(3·5·9일) — 일요일은 따로 칠하지 않는다");
  assert.ok(oct.includes('<button type="button" class="btn dty-cal-nav l" data-cal="prev" aria-label="2026년 9월 보기">◀ 9월</button>'));
  assert.ok(oct.includes('<button type="button" class="btn dty-cal-nav r" data-cal="next" aria-label="2026년 11월 보기">11월 ▶</button>'));
  assert.ok(oct.includes('<p class="dty-cal-k">숫자는 채워진 인원 / 필요 인원이에요.<br><span class="ki"><span class="k need" aria-hidden="true"></span>빈 자리가 있는 날</span> · ' +
    '<span class="ki"><span class="wn" aria-hidden="true">⚠</span> 못 온다는 분이 있는 날</span> · <span class="ki">🔒 확정된 날</span> · <span class="ki"><span class="k today" aria-hidden="true"></span>오늘</span><br>' +
    '<span class="hd">빨간 날짜</span>는 공휴일이에요(<span class="ki">3일 개천절</span> · <span class="ki">5일 대체공휴일</span> · <span class="ki">9일 한글날</span>).<br>날짜를 누르면 그날의 명단이 보여요.</p>'), "풀이");
  // 오늘이 당번 날이면 단추에 today · aria-current · 「오늘」
  const onDuty = calHtml(DAYS, "2026-10-09", "2026-10-09");
  assert.ok(onDuty.includes('class="dty-cal-c has k-need on today hol" data-day="2026-10-09" aria-pressed="true" aria-current="date" aria-label="10월 9일(금) — 빈 자리 1 · 필요 2명 가운데 1명 채워졌어요 · 공휴일(한글날) · 오늘"'));
  // 첫 달 — 앞 달이 없으면 「◀ 지난 날」(더 불러올 수 있을 때만) · 마지막 달 — 오른쪽 단추 없음
  const sep = calHtml(DAYS, "2026-09-27", TODAY, { older: true });
  assert.ok(sep.includes('<button type="button" class="btn dty-cal-nav l" data-act="older" aria-label="지난 날 더 보기">◀ 지난 날</button>') && sep.includes('data-cal="next"') && !sep.includes('data-cal="prev"'));
  assert.ok(calHtml(DAYS, "2026-09-27", TODAY, { older: false }).includes('<div class="dty-cal-h"><span></span><b>2026년 9월</b>'), "52주를 다 불러왔으면 왼쪽 단추가 없다");
  assert.ok(calHtml(DAYS, "2026-09-27", TODAY).includes('<div class="dty-cal-h"><span></span>'), "older 를 안 주면 없다");
  const dec = calHtml(DAYS, "2026-12-25", TODAY, { older: true });
  assert.ok(dec.includes('<b>2026년 12월</b><span></span></div>') && dec.includes('data-cal="prev" aria-label="2026년 11월 보기">◀ 11월'), "마지막 달");
  assert.ok(dec.includes('공휴일이에요(<span class="ki">25일 성탄절</span>).') && dec.includes('class="dty-cal-c has k-need on hol" data-day="2026-12-25"'));
  // 공휴일·오늘이 없는 달에는 그 말이 없다 · 풀이의 표시(빈 자리·⚠·🔒)는 이 당번 전체에서 본다(달마다 풀이가 들쭉날쭉하지 않게)
  const nov = calHtml(DAYS, "2026-11-01", TODAY);
  assert.equal(nov.includes("빨간 날짜"), false); assert.equal(nov.includes(">오늘<"), false); assert.equal(/ hol"/.test(nov), false);
  assert.ok(nov.includes("빈 자리가 있는 날") && nov.includes("못 온다는 분이 있는 날") && nov.includes("🔒 확정된 날"));
  assert.ok(nov.includes('class="dty-cal-c has k-full on" data-day="2026-11-01"') && nov.includes('class="dty-cal-c has k-none" data-day="2026-11-08" aria-pressed="false" aria-label="11월 8일(일) — 자리 없음"><span>8</span><i aria-hidden="true">–</i>'));
  // 표시가 없는 당번 — 풀이는 누르는 법만
  const plain = calHtml([day("2026-11-08"), day("2026-11-15"), day("2026-11-22"), day("2026-11-29")], "2026-11-08", TODAY);
  assert.ok(plain.includes('<p class="dty-cal-k">날짜를 누르면 그날의 명단이 보여요.</p>'));
  assert.equal(calHtml([], "", TODAY).includes("<button"), false, "날짜가 없으면 누를 것이 없다");
  assert.equal(calHtml(null, null, null).includes("dty-cal-g"), true, "틀린 값에도 죽지 않는다");
});

// ── 명단 화면의 이음(roster.js) — 가짜 화면에 실제로 그리고 눌러 본다 ──
function screen(give = {}) {
  const handlers = {}, asked = [];
  const el = { innerHTML: "", classList: { add() {} }, addEventListener: (t, fn) => { handlers[t] = fn; }, querySelectorAll: () => [],
    querySelector: (sel) => { asked.push(sel); return give[sel] || null; } };
  const click = (map) => handlers.click({ target: { closest: (sel) => map[sel] || null } });
  return { el, asked, click,
    nav: (dir) => click({ "button[data-cal]": { dataset: { cal: dir } } }),
    pick: (date, inCal = true) => click({ "[data-day]": { dataset: { day: date }, classList: { contains: (c) => inCal && c === "dty-cal-c" } } }),
    older: (inCal = true) => click({ "button[data-act]": { dataset: { act: "older" }, classList: { contains: (c) => inCal && c === "dty-cal-nav" } } }) };
}
// 가짜 서버 — from(오늘 − 불러온 날 수) 뒤의 날짜만 준다. fail 을 켜 두면 명단을 못 읽는다.
function server(id, all) {
  const calls = [], state = { fail: false };
  const call = async (action, body) => {
    calls.push([action, body]);
    if (action === "dutyBoardList") return { ok: true, scope: "all", today: TODAY, boards: [{ id, title: "식당 봉사", status: "open", statusLabel: "받는 중" }] };
    if (action === "dutyRoster") {
      if (state.fail) return { ok: false, error: "network" };
      return { ok: true, chief: true, appOpen: false, today: TODAY, staff: [], lines: [{ id: 1, active: true, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, sort: 0 }],
        board: { id, title: "식당 봉사", status: "open", statusLabel: "받는 중", openDays: 56, untilDate: "", place: "", contact: "", maxAhead: null },
        days: all.filter((d) => d.date >= body.from) };
    }
    return { ok: false, error: "unknown-action" };
  };
  return { call, calls, state, froms: () => calls.filter((c) => c[0] === "dutyRoster").map((c) => c[1].from) };
}
// 토스트(core/ui.js)는 document 를 쓴다 — 마지막 글만 받는 가짜. 4초 뒤 숨기는 타이머는 시험 동안 걸지 않는다(파일이 4초 더 돌지 않게).
async function withPage(fn) {
  const said = { textContent: "", hidden: true, setAttribute() {} }, scrolls = [];
  const keep = { document: globalThis.document, window: globalThis.window, setTimeout: globalThis.setTimeout };
  globalThis.document = { querySelector: () => said, createElement: () => said, body: { appendChild() {} } };
  globalThis.window = { innerHeight: 667, matchMedia: () => ({ matches: true }), scrollBy: (o) => scrolls.push(o) };
  globalThis.setTimeout = () => 0;
  try { return await fn({ said, scrolls }); } finally { Object.assign(globalThis, keep); if (keep.document === undefined) delete globalThis.document; if (keep.window === undefined) delete globalThis.window; }
}
const title = (el) => (el.innerHTML.match(/<div class="dty-cal-h">.*?<b>([^<]*)<\/b>/s) || [])[1] || "";
const chosen = (el) => (el.innerHTML.match(/class="dty-cal-c has [^"]* on[^"]*" data-day="([^"]*)"/) || [])[1] || "";

test("명단 화면 — 날짜가 넷 이상이면 달력(칩 줄 없음) · 달 단추와 날짜 누름은 서버를 부르지 않는다 · 그날 판은 달력 옆(.dty-split)", async () => {
  await withPage(async ({ scrolls }) => {
    const back = [day("2026-08-30"), day("2026-09-06"), day("2026-09-13"), day("2026-09-20")], sv = server("cal-a", [...back, ...DAYS]);
    const focused = [], btn = (name) => ({ focus: (o) => focused.push([name, o]) });
    const sc = screen({ ".dty-cal-nav.r": btn("r"), ".dty-cal-nav.l": btn("l"), ".dty-cal-c.on": btn("on") });
    await render(sc.el, { call: sv.call, query: {} });
    assert.deepEqual(sv.froms(), ["2026-09-23"], "처음에는 지난 14일부터");
    assert.ok(sc.el.innerHTML.includes('<div class="dty-split"><div class="dty-cal" role="group"') && sc.el.innerHTML.includes('</div><div class="dty-day"><div class="dty-bar">'), "달력 옆에 그날 판");
    assert.equal(sc.el.innerHTML.includes("dty-chips-d"), false, "칩 줄은 그리지 않는다");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 10월", "2026-10-09"], "처음 고르는 날은 칩과 같다(오늘 이후 첫 날)");
    assert.ok(sc.el.innerHTML.includes("<b>10월 9일(금)</b>"), "그날 판의 머리");
    assert.deepEqual(focused, [], "처음 그릴 때는 초점을 옮기지 않는다");
    await sc.nav("next");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 11월", "2026-11-01"]);
    assert.deepEqual(focused, [["r", { preventScroll: true }]], "다시 그린 뒤 같은 쪽 달 단추로 초점을 돌려준다(화면은 굴리지 않는다)");
    await sc.nav("prev"); await sc.nav("prev");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 9월", "2026-09-27"], "지난 달은 마지막 날");
    assert.ok(sc.el.innerHTML.includes('data-act="older" aria-label="지난 날 더 보기">◀ 지난 날</button>'), "더 앞 달이 없으면 「◀ 지난 날」");
    await sc.nav("prev");
    assert.equal(title(sc.el), "2026년 9월", "그쪽에 달이 없으면 그대로");
    assert.equal(focused.length, 3, "달이 안 바뀌면 다시 그리지 않는다");
    await sc.pick("2026-09-27");
    assert.equal(focused.length, 3, "이미 고른 날 — 다시 그리지 않는다");
    await sc.nav("next");
    await sc.pick("2026-10-25");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 10월", "2026-10-25"]);
    assert.deepEqual(focused[focused.length - 1], ["on", { preventScroll: true }], "날짜를 누른 뒤에는 고른 날로 초점");
    assert.ok(sc.el.innerHTML.includes("<b>10월 25일(일)</b>") && sc.el.innerHTML.includes("🔒 담당자 확정"), "그날 판이 바뀐다");
    assert.deepEqual(sv.froms(), ["2026-09-23"], "달 단추·날짜 누름은 서버를 부르지 않는다");
    assert.deepEqual(scrolls, [], "그날 판(.dty-day)을 못 찾으면 굴리지 않는다");
    // 달력과 상관없는 그리기(탭 바꾸기)에서는 초점을 옮기지 않는다 — 초점 표식은 한 번 쓰고 지운다
    const n = focused.length;
    await sc.click({ "[data-tab]": { dataset: { tab: "lines" } } });
    assert.ok(sc.el.innerHTML.includes("자리 틀 하나가 매주 같은 요일의 자리를 만들어요") && !sc.el.innerHTML.includes("dty-cal"), "자리 틀 탭");
    await sc.click({ "[data-tab]": { dataset: { tab: "roster" } } });
    assert.deepEqual([title(sc.el), chosen(sc.el), focused.length], ["2026년 10월", "2026-10-25", n], "돌아오면 보던 날 그대로 · 초점은 그대로");
    // 메뉴를 나갔다 와도 보던 달·날짜를 기억한다 — 달 단추로 옮긴 날도(칩과 같은 기억)
    await sc.nav("next");
    const again = screen();
    await render(again.el, { call: sv.call, query: {} });
    assert.deepEqual([title(again.el), chosen(again.el)], ["2026년 11월", "2026-11-01"], "달 단추로 옮긴 날을 기억한다");
    await again.pick("2026-11-08");
    const third = screen();
    await render(third.el, { call: sv.call, query: {} });
    assert.equal(chosen(third.el), "2026-11-08", "달력에서 누른 날을 기억한다");
  });
});

test("명단 화면 — 달력에서 날짜를 누르면 가려진 그날 판이 보일 만큼만 굴린다(이미 고른 날을 다시 눌러도) · 칩은 굴리지 않는다", async () => {
  await withPage(async ({ scrolls }) => {
    const sv = server("cal-b", DAYS), panel = { top: 620 };
    const sc = screen({ ".dty-day": { getBoundingClientRect: () => ({ top: panel.top }) } });
    await render(sc.el, { call: sv.call, query: {} });
    await sc.pick("2026-10-11");
    assert.deepEqual(scrolls, [{ top: 173, behavior: "auto" }], "47px 만 보여 173px 굴린다(움직임 줄이기를 켠 기기는 바로)");
    await sc.pick("2026-10-11");
    assert.equal(scrolls.length, 2, "이미 고른 날을 다시 눌러도 그날 판을 보여 준다");
    panel.top = 300;
    await sc.pick("2026-10-25");
    assert.equal(scrolls.length, 2, "이미 보이면 그대로(PC — 달력 옆)");
    panel.top = 620;
    await sc.pick("2026-10-11", false);
    assert.equal(scrolls.length, 2, "칩(달력이 아닌 날짜 단추)은 굴리지 않는다");
    await sc.nav("next");
    assert.equal(scrolls.length, 2, "달 단추는 굴리지 않는다");
  });
});

test("명단 화면 — 「◀ 지난 날」: 4주 더 불러와 보던 달에 새 날짜가 없으면 앞 달로 · 못 불러왔으면 「없어요」라고 하지 않고 다음에 같은 만큼 다시", async () => {
  await withPage(async ({ said }) => {
    // 보던 달(10월)에는 새 날짜가 없고 9월에만 생긴다 → 9월의 마지막 날로
    const sv = server("cal-c", [day("2026-09-06"), day("2026-09-13"), ...DAYS.filter((d) => d.date >= "2026-10-04" && d.date <= "2026-11-08")]);
    const focused = [], btn = (name) => ({ focus: () => focused.push(name) }), sc = screen({ ".dty-cal-nav.l": btn("l"), ".dty-cal-c.on": btn("on") });
    await render(sc.el, { call: sv.call, query: {} });
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 10월", "2026-10-09"]);
    assert.ok(sc.el.innerHTML.includes('class="btn dty-cal-nav l" data-act="older"'), "첫 달 — 「◀ 지난 날」");
    sv.state.fail = true;
    await sc.older();
    assert.equal(said.textContent, "인터넷 연결을 확인해 주세요", "못 불러온 까닭을 말한다");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 10월", "2026-10-09"], "화면은 그대로");
    await sc.click({ "[data-tab]": { dataset: { tab: "lines" } } }); await sc.click({ "[data-tab]": { dataset: { tab: "roster" } } });
    assert.deepEqual(focused, [], "못 불러온 뒤의 다른 그리기에서 초점이 튀지 않는다(쓰지 못한 초점 표식을 지운다)");
    sv.state.fail = false;
    await sc.older();
    assert.deepEqual(sv.froms(), ["2026-09-23", "2026-08-26", "2026-08-26"], "실패한 만큼은 다음에 다시(불러온 날 수를 되돌린다)");
    assert.equal(said.textContent, "지난 날짜 2개를 더 불러왔어요");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 9월", "2026-09-13"], "새로 생긴 앞 달의 마지막 날로");
    assert.ok(focused.length >= 1 && focused.every((x) => x === "l"), "다시 그린 뒤 초점은 왼쪽 달 단추로");
    await sc.older();
    assert.equal(said.textContent, "지난 10주 안에는 더 지난 날짜가 없어요", "새 날짜가 없으면 그렇다고 말한다");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 9월", "2026-09-13"]);
  });
  await withPage(async ({ said }) => {
    // 보던 달(9월)에 새 날짜가 생긴다 → 그대로 두고 왼쪽 단추가 「◀ 8월」로 바뀐다
    const sv = server("cal-d", [day("2026-08-30"), day("2026-09-06"), day("2026-09-13"), day("2026-09-20"), ...DAYS]), sc = screen();
    await render(sc.el, { call: sv.call, query: {} });
    await sc.nav("prev");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 9월", "2026-09-27"]);
    await sc.older();
    assert.equal(said.textContent, "지난 날짜 4개를 더 불러왔어요");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 9월", "2026-09-27"], "보던 달에 새 날짜가 생겼으면 그대로");
    assert.ok(sc.el.innerHTML.includes('data-cal="prev" aria-label="2026년 8월 보기">◀ 8월</button>'));
  });
});

test("명단 화면 — 날짜가 셋 이하면 칩 줄 그대로 · 날짜가 없어도 지난 날은 더 불러올 수 있다(끝난 한 번짜리 모집)", async () => {
  await withPage(async ({ said }) => {
    const sv = server("cal-e", [day("2026-10-11", [slot(1)]), day("2026-10-18", [slot(2)]), day("2026-10-25", [slot(3)])]), sc = screen();
    await render(sc.el, { call: sv.call, query: {} });
    assert.ok(sc.el.innerHTML.includes('<div class="dty-chips-d" role="group" aria-label="날짜">') && sc.el.innerHTML.includes('class="dty-chipd more" data-act="older"'), "칩 줄");
    assert.equal(sc.el.innerHTML.includes("dty-cal"), false); assert.equal(sc.el.innerHTML.includes("dty-split"), false);
    await sc.pick("2026-10-18", false);
    assert.ok(sc.el.innerHTML.includes("<b>10월 18일(일)</b>"), "칩 누름은 그대로 된다");
    await sc.older(false);
    assert.equal(said.textContent, "지난 6주 안에는 더 지난 날짜가 없어요", "칩 줄의 「지난 날 더 보기」도 같은 말을 한다");
  });
  await withPage(async ({ said }) => {
    // 칩 줄에서 「지난 날 더 보기」 — 날짜가 넷이 되어 달력으로 바뀌어도 고른 날은 그대로 둔다(칩의 「더 보기」는 보던 날을 옮기지 않았다)
    const sv = server("cal-g", [day("2026-09-13", [slot(9)]), day("2026-10-11", [slot(1)]), day("2026-10-18", [slot(2)]), day("2026-10-25", [slot(3)])]), sc = screen();
    await render(sc.el, { call: sv.call, query: {} });
    assert.ok(sc.el.innerHTML.includes("dty-chips-d") && sc.el.innerHTML.includes("<b>10월 11일(일)</b>"));
    await sc.older(false);
    assert.equal(said.textContent, "지난 날짜 1개를 더 불러왔어요");
    assert.deepEqual([title(sc.el), chosen(sc.el), sc.el.innerHTML.includes("dty-chips-d")], ["2026년 10월", "2026-10-11", false], "달력으로 바뀌고 보던 날은 그대로");
  });
  await withPage(async ({ said }) => {
    // 더 불러오는 사이 앞날 자리가 저절로 생겨도(보이는 기간이 하루 늘었다) 「지난 날짜를 더 불러왔어요」라고 하지 않는다
    const all = [day("2026-10-11", [slot(1)]), day("2026-10-18", [slot(2)]), day("2026-10-25", [slot(3)]), day("2026-11-01", [slot(4)])], sv = server("cal-h", all), sc = screen();
    await render(sc.el, { call: sv.call, query: {} });
    all.push(day("2026-12-06", [slot(5)]));
    await sc.older();
    assert.equal(said.textContent, "지난 6주 안에는 더 지난 날짜가 없어요");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 10월", "2026-10-11"], "보던 날 그대로");
    assert.ok(sc.el.innerHTML.includes('data-cal="next" aria-label="2026년 11월 보기"'), "새로 생긴 앞날 자리는 명단에 들어온다");
  });
  await withPage(async ({ said }) => {
    const sv = server("cal-f", [day("2026-09-05", [slot(1, { signups: [who(1)] })])]), sc = screen();   // 한 달 전에 끝난 모집
    await render(sc.el, { call: sv.call, query: {} });
    assert.ok(sc.el.innerHTML.includes("이 기간에는 자리가 없어요") && sc.el.innerHTML.includes('<button type="button" class="btn wide" data-act="older">◀ 지난 날 더 보기</button>'));
    await sc.older(false);
    assert.equal(said.textContent, "지난 날짜 1개를 더 불러왔어요");
    assert.ok(sc.el.innerHTML.includes("<b>9월 5일(토)</b>") && sc.el.innerHTML.includes("성도1"), "끝난 모집의 명단이 보인다");
  });
});

test("색 — 달력은 이미 쓰는 값만 쓴다(새 색 없음) · 공휴일은 --error · 고른 날 위에서는 --danger-bd", () => {
  const css = read("css/admin.css"), from = css.indexOf("/* 달력(2026-10-07"), to = css.indexOf("/* 그날 판 */");
  assert.ok(from > 0 && to > from, "달력 규칙 묶음");
  const block = css.slice(from, to), rest = css.slice(0, from) + css.slice(to);
  const hex = [...new Set((block.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((x) => x.toLowerCase()))].sort();
  assert.deepEqual(hex, ["#7a5200", "#fff", "#fff3d6"], "글자 값으로 적은 색은 이 셋뿐(모두 봉사 당번 칩이 이미 쓰는 값) — 나머지는 토큰");
  for (const h of hex) assert.ok(rest.toLowerCase().includes(h), `${h} — 다른 규칙이 이미 쓰는 값이어야 한다`);
  for (const rule of [".dty-cal-c.hol > span{color:var(--error)}", ".dty-cal-c.on.hol > span{color:var(--danger-bd)}", ".dty-cal-k .hd{color:var(--error);font-weight:700}",
    ".dty-cal-c.k-need{background:#fff3d6;border-color:var(--gold)}", ".dty-cal-c.k-ask{background:var(--danger-bg);border-color:var(--danger-bd)}",
    ".dty-cal-c.on{background:var(--navy);border-color:var(--navy);color:#fff}", ".dty-cal-c.today{border-color:var(--navy);border-width:2px}"]) assert.ok(block.includes(rule), rule);
  assert.ok(block.indexOf(".dty-cal-c.on{") > block.indexOf(".dty-cal-c.k-ask{") && block.indexOf(".dty-cal-c.on{") > block.indexOf(".dty-cal-c.hol > span{"), "고른 날의 색이 뜻 색·공휴일 색 뒤에 온다(같은 무게라 뒤가 이긴다)");
  assert.ok(/min-height:4[4-9]px|min-height:5\dpx/.test(block.match(/\.dty-cal-c\{[^}]*\}/)[0]), "칸은 44px 이상(폰에서 누르는 크기)");
  assert.ok(css.includes(".dty-split{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr)"), "PC — 달력 옆에 그날 판");
});
