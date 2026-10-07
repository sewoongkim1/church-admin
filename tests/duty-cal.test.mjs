// 📅 당번 명단 달력(2026-10-07 친구 요청 — 「어드민에서도 달력으로 확인」)
//   공휴일 표(holidays.js) · 달력 규칙(duty-logic.js cal*) · 달력 조각(roster-cal.js) · 명단 화면의 이음(roster.js — 가짜 화면으로 실제로 눌러 본다) · 색
//   이름은 가짜(성도1 …)만. 실제 브라우저에서의 모양·대비·굴리기는 손으로 본다(성경암송 docs/notes/duty-roster.md 「공휴일」·「어드민 달력」).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { HOL_FROM, HOL_UNTIL, HOLIDAYS, holidayName, holItems, holOutside, holOutsideText } from "../js/menus/duty/holidays.js";
import {
  CAL_MIN, calUse, calMonths, calTitle, calMonthWord, calMonth, calCell, calMark, calLabel, calPick, calStep, olderPick, olderText, revealBy, calSettle,
  rosterFrom, olderBack, dayChip, initialDay, maxBack, addDays,
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
  const H = HOLIDAYS, keys = Object.keys(H), from = HOL_FROM, until = HOL_UNTIL;
  const utc = (s) => new Date(s + "T00:00:00Z"), dow = (s) => utc(s).getUTCDay(), next = (s) => addDays(s, 1);
  // 이름은 정해 둔 낱말만(선거일·임시공휴일이 생기면 그 이름으로 — 「…선거」·「임시공휴일」). 노동절·제헌절은 2026년 5월부터 공휴일이다(공휴일에 관한 법률 제2조 개정).
  const NAMES = ["신정", "설날", "삼일절", "노동절", "어린이날", "부처님오신날", "현충일", "제헌절", "광복절", "추석", "개천절", "한글날", "성탄절", "대체공휴일", "임시공휴일"];
  assert.ok(keys.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(until) && utc(until).toISOString().slice(0, 10) === until, "HOL_UNTIL");
  assert.ok(/^\d{4}-\d{2}-01$/.test(from) && utc(from).toISOString().slice(0, 10) === from && from < until, "HOL_FROM — 달의 1일(달을 반만 덮으면 그 달의 풀이가 틀린 말을 한다)");
  keys.forEach((k, i) => {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(k) && !isNaN(utc(k).getTime()) && utc(k).toISOString().slice(0, 10) === k, `${k} — 실제 날짜가 아니다`);
    assert.ok(k >= from, `${k} — 표가 시작하기(HOL_FROM) 전의 날짜`);
    assert.ok(k <= until, `${k} — 표 끝(HOL_UNTIL) 뒤의 날짜`);
    if (i) assert.ok(keys[i - 1] < k, `${k} — 날짜 차례가 아니다`);
    assert.ok(NAMES.includes(H[k]) || /선거$/.test(H[k]), `${k} — 모르는 이름: ${H[k]}`);
  });
  // 표가 통째로 덮는 해마다: 양력 공휴일 열(그날이 추석 연휴와 겹치면 추석으로 적혀 있다 — 2028-10-03) · 설날·추석은 이어진 사흘 · 부처님오신날은 꼭 하루.
  //   「통째로 덮는 해」는 **표의 범위**(HOL_FROM ~ HOL_UNTIL)로 정한다 — 그 해의 줄이 있나로 고르면, 새 해를 더하다 1월 1일을 빠뜨리거나 HOL_UNTIL 만 올린 표가
  //   그 해의 검사를 통째로 건너뛴다(지문은 표가 바뀌면 늘 떨어지며 새 값을 보여 주므로, 새 줄을 지키는 것은 이 규칙 검사뿐이다 — 독립 검토 반영 2026-10-07).
  //   ⚠️ 이 검사가 못 보는 것: **음력 날짜 자체**(설날·부처님오신날·추석이 며칠인가)와 **선거일**(있는 해인가 · 며칠인가) — 근거 자료에서 옮기고 눈으로 맞댄다.
  const FIXED = { "01-01": "신정", "03-01": "삼일절", "05-01": "노동절", "05-05": "어린이날", "06-06": "현충일", "07-17": "제헌절", "08-15": "광복절", "10-03": "개천절", "10-09": "한글날", "12-25": "성탄절" };
  const lunar = (name) => name === "설날" || name === "추석";
  const first = Number(from.slice(0, 4)), last = Number(until.slice(0, 4)), full = [];
  for (let y = first; y <= last; y++) if (y > first || from.slice(5) === "01-01") full.push(y);
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
    // 부처님오신날이 양력 공휴일(어린이날 등)과 겹치는 해가 오면 그 해의 줄 이름에 맞춰 여기에 예외를 적는다(이 표의 해에는 없다)
    assert.equal(keys.filter((k) => k.startsWith(`${y}-`) && H[k] === "부처님오신날").length, 1, `${y}년 부처님오신날 — 하루여야 한다(빠졌거나 두 번 적혔다)`);
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
  //   지문은 범위(HOL_FROM~HOL_UNTIL)도 싣는다 — 달력의 풀이가 그 범위를 말하므로(「…까지만 빨갛게 보여요」) 범위만 달라도 두 달력이 다른 말을 한다.
  const print = createHash("sha256").update([`${from}~${until}`, ...keys.map((k) => `${k}=${H[k]}`)].join("\n")).digest("hex").slice(0, 12);
  assert.equal(print, "9c07bd766842", "공휴일 표(또는 그 범위)가 바뀌었다 — 성경암송 js/duty.js 의 DUTY_HOLIDAYS·DUTY_HOL_FROM·DUTY_HOL_UNTIL 도 같게 고치고, 두 저장소 시험의 지문을 같은 값으로 바꾼다");
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
  // 표가 덮지 않는 달 — 빨간 날짜가 없는 것이 「공휴일이 없다」는 뜻이 아니다(달력의 풀이가 그렇게 말한다). 1년짜리 당번은 표 끝의 한 해 전부터 그 뒤의 달을 보여 준다
  assert.equal(holOutside(HOL_FROM.slice(0, 7)), ""); assert.equal(holOutside(HOL_UNTIL.slice(0, 7)), ""); assert.equal(holOutside("2027-06"), "");
  assert.equal(holOutside(addDays(HOL_UNTIL, 1).slice(0, 7)), "after"); assert.equal(holOutside(addDays(HOL_FROM, -1).slice(0, 7)), "before"); assert.equal(holOutside("2031-03"), "after");
  for (const bad of ["", null, undefined, "x", "2029", "2029-1", "2029-01-01", 202901]) assert.equal(holOutside(bad), "", String(bad));
  assert.equal(holOutsideText("after"), "이 달의 공휴일은 아직 표시되지 않아요(2028년 12월까지만 빨갛게 보여요).");
  assert.equal(holOutsideText("before"), "이 달의 공휴일은 표시되지 않아요(2026년 10월부터 빨갛게 보여요).");
  assert.equal(holOutsideText(""), ""); assert.equal(holOutsideText(undefined), "");
});

test("명단을 어디서부터 읽나 — 달을 통째로(그 날이 든 달의 1일) · 「지난 날」은 불러오는 달이 실제로 앞으로 갈 때까지 · 52주까지", () => {
  assert.equal(rosterFrom("2026-10-07", 14), "2026-09-01", "오늘 − 14일(9/23)이 든 달의 1일");
  assert.equal(rosterFrom("2026-10-25", 14), "2026-10-01", "달 끝 무렵 — 그 달의 첫 주일들도 처음부터 읽는다(달력에 「당번 없는 날」처럼 보이던 날)");
  assert.equal(rosterFrom("2026-10-15", 14), "2026-10-01"); assert.equal(rosterFrom("2026-10-14", 14), "2026-09-01");
  assert.equal(rosterFrom("2027-01-05", 14), "2026-12-01", "해를 넘는다"); assert.equal(rosterFrom("2026-10-07", 0), "2026-10-01");
  assert.equal(rosterFrom("2026-10-30", -5), "2026-10-01", "음수는 0 으로(앞날로 가지 않는다 — 11/4 의 달이 아니다)"); assert.equal(rosterFrom("2026-10-07", undefined), "2026-10-01");
  assert.equal(rosterFrom("", 14), ""); assert.equal(rosterFrom(null, 14), ""); assert.equal(rosterFrom("x", 14), "");
  // 가장 멀어도 서버가 자르는 곳(오늘 − 400일) 안쪽 — 한 해의 어느 날이든
  for (let i = 0; i < 366; i++) { const t = addDays("2027-01-01", i); assert.ok(rosterFrom(t, maxBack()) > addDays(t, -400), t); assert.ok(rosterFrom(t, maxBack()) <= addDays(t, -maxBack()), t); }
  assert.equal(olderBack("2026-10-07", 14), 42, "9/23 → 8/26: 앞 달(8월)로 갔다"); assert.equal(olderBack("2026-10-07", 42), 70);
  // 달의 29~31일에서 4주를 빼면 같은 달이다 — 한 번 더 간다(안 그러면 눌러도 같은 것을 다시 읽는다)
  assert.equal(rosterFrom("2026-11-13", 14), "2026-10-01"); assert.equal(rosterFrom("2026-11-13", 42), "2026-10-01", "10/30 − 28일 = 10/2 — 같은 달");
  assert.equal(olderBack("2026-11-13", 14), 70, "같은 달이면 4주 더(9월)"); assert.equal(rosterFrom("2026-11-13", 70), "2026-09-01");
  // 어느 날 어느 만큼에서 눌러도: 달이 앞으로 가거나 52주에 닿는다 · 7의 배수(「지난 N주」) · 줄지 않는다
  for (let i = 0; i < 366; i++) {
    const t = addDays("2027-01-01", i);
    for (let b = 14, n = 0; b < maxBack(); n++) {
      const nb = olderBack(t, b);
      assert.ok(nb > b && nb <= maxBack() && nb % 7 === 0, `${t} ${b} → ${nb}`);
      assert.ok(nb === maxBack() || rosterFrom(t, nb) < rosterFrom(t, b), `${t} ${b} → ${nb} — 달이 앞으로 가야 한다`);
      assert.ok(n < 14, "열네 번 안에 52주에 닿는다");
      b = nb;
    }
  }
  assert.equal(olderBack("2026-10-07", maxBack()), maxBack(), "52주에서는 그대로"); assert.equal(olderBack("2026-10-07", 350), maxBack());
  assert.equal(olderBack("", 14), 42, "오늘을 모르면 4주만"); assert.equal(olderBack("2026-10-07", 14, 0), 42, "틀린 걸음은 4주로");
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

test("다시 그린 뒤의 화면 자리(calSettle) — 굴린 자리를 지킨다 · 붙은 달력 옆의 판은 맨 위부터 · 폰은 판이 보일 만큼 · 자판은 초점이 가려지지 않게", () => {
  const base = { y0: 0, y: 0, viewH: 900, endBottom: 3000, splitTop: 409, splitH: 560, panelTop: 409, panelBottom: 1500, focusTop: null, focusBottom: null, stuck: null, reveal: false, kb: false };
  const S = (x) => calSettle({ ...base, ...x });
  // ① 굴린 자리를 지킨다 — 문서가 줄어 브라우저가 잘라 냈으면(y < y0) 되돌리고, 모자란 만큼 .dty-split 을 늘린다
  assert.deepEqual(S({}), { to: 0, by: 0, grow: 0 }, "굴리지 않았고 문서도 넉넉하다 — 그대로");
  assert.deepEqual(S({ y0: 420, y: 100, viewH: 720, endBottom: 720, splitTop: 309, panelTop: 309, splitH: 400 }), { to: 420, by: 0, grow: 720 },
    "붙지 않는 PC(낮은 화면): 420 에서 눌렀는데 짧은 판으로 문서가 줄어 100 으로 잘렸다 → 420 으로 되돌리고 320px 늘린다(달력이 손끝에 그대로)");
  assert.deepEqual(S({ y0: 300, y: 300, endBottom: 900 }), { to: 300, by: 0, grow: 0 }, "문서가 꼭 맞으면 늘리지 않는다");
  assert.deepEqual(S({ y0: 300, y: 300, endBottom: 899 }), { to: 300, by: 0, grow: 561 }, "1px 모자라면 1px");
  assert.deepEqual(S({ y0: undefined, y: 250 }), { to: 250, by: 0, grow: 0 }, "그리기 전 자리를 모르면 지금 자리");
  // ② 붙은 달력(PC) — 그날 판의 위를 붙은 선(64)에 맞춘다: 달력은 제자리이고 판은 맨 위부터 보인다
  assert.deepEqual(S({ y0: 790, y: 790, splitTop: -381, panelTop: -381, stuck: 64 }), { to: 345, by: 0, grow: 0 }, "긴 판을 굴린 채 다른 날을 눌렀다 → 판의 위가 64 에 오게 올린다(790 − 381 − 64)");
  assert.deepEqual(S({ y0: 790, y: 178, endBottom: 900, splitTop: 231, panelTop: 231, panelBottom: 531, stuck: 64 }), { to: 345, by: 0, grow: 727 },
    "새 판이 짧아 문서가 줄었다(790 → 178) → 판의 위를 64 에 두고(345) 문서를 167px 늘린다 — 붙어 있던 달력이 내려가지 않는다");
  assert.deepEqual(S({ y0: 2561, y: 0, viewH: 1080, endBottom: 860, splitTop: 409, splitH: 440, panelTop: 409, panelBottom: 607, stuck: 64 }), { to: 345, by: 0, grow: 1005 },
    "큰 화면(1080): 새 문서가 화면보다 짧아 아예 굴릴 수 없게 됐다(0) → 내용의 끝(860)에서 모자란 565px 를 늘린다(문서 높이로 재면 화면 높이가 나와 덜 늘린다)");
  assert.equal(S({ y0: 790, y: 790, splitTop: -381, panelTop: -381, stuck: null }).to, 790, "붙어 있지 않았으면 올리지 않는다(눌렀던 칸이 손끝에서 달아난다)");
  assert.equal(S({ y0: 30, y: 30, splitTop: 20, panelTop: 20, stuck: 64 }).to, 0, "0 아래로는 가지 않는다");
  // ③ 폰(달력 아래에 판) — 날짜를 눌렀으면 판이 220px 보일 만큼만 내린다 · 짧은 판은 그 끝이 보일 때까지만 · 달 단추(reveal 아님)는 내리지 않는다
  const phone = { y0: 350, y: 350, viewH: 740, endBottom: 2150, splitTop: 50, splitH: 2000, panelTop: 540, panelBottom: 2050 };
  assert.deepEqual(S({ ...phone, reveal: true }), { to: 350, by: 20, grow: 0 }, "200px 만 보인다 → 20px");
  assert.deepEqual(S({ ...phone }), { to: 350, by: 0, grow: 0 }, "달 단추는 내리지 않는다");
  assert.deepEqual(S({ ...phone, reveal: true, panelBottom: 700 }), { to: 350, by: 0, grow: 0 }, "짧은 판이 이미 다 보인다 — 그대로");
  assert.deepEqual(S({ ...phone, y0: 0, y: 0, viewH: 640, endBottom: 900, panelTop: 700, panelBottom: 850, reveal: true }), { to: 0, by: 218, grow: 0 }, "화면 아래의 짧은 판 — 끝이 보일 때까지만(280 이 아니라 218)");
  assert.deepEqual(S({ ...phone, y0: 350, y: 300, endBottom: 740, splitTop: 100, splitH: 650, panelTop: 590, panelBottom: 750, reveal: true }), { to: 350, by: 0, grow: 700 },
    "문서가 줄어 잘렸다 → 달력을 제자리에 두고(350) 늘린다 — 짧은 판은 그 자리에서 다 보인다");
  assert.equal(S({ viewH: 600, reveal: true }).by, 0, "달력 옆에 판(PC 두 칸)이면 내리지 않는다 — 달력이 보이면 판도 같은 높이에서 보인다");
  // ④ 자판 — 초점이 머리줄 밑·화면 밖에 남지 않게
  assert.deepEqual(S({ y0: 233, y: 233, viewH: 475, splitTop: 50, panelTop: 565, panelBottom: 2000, reveal: true, kb: true, focusTop: 250, focusBottom: 302 }), { to: 233, by: 186, grow: 0 },
    "낮은 화면(200% 확대)에서 날짜를 Enter 로: 310px 를 내리면 고른 칸이 화면 밖으로 나간다 → 칸이 머리줄 바로 아래에 남는 만큼만(250 − 64)");
  assert.equal(S({ y0: 233, y: 233, viewH: 475, splitTop: 50, panelTop: 565, panelBottom: 2000, reveal: true, kb: false, focusTop: 250, focusBottom: 302 }).by, 310, "마우스·터치로 눌렀으면 그날 판을 보여 준다(초점을 보지 않는다)");
  assert.deepEqual(S({ viewH: 650, endBottom: 900, kb: true, focusTop: 659, focusBottom: 711 }), { to: 69, by: 0, grow: 0 }, "끝 달로 가 초점이 고른 날로 옮겨졌는데 화면 아래다 → 보일 만큼(711 − 642)");
  assert.deepEqual(S({ y0: 500, y: 500, kb: true, focusTop: 30, focusBottom: 82 }), { to: 466, by: 0, grow: 0 }, "머리줄 밑이면 올린다");
  assert.deepEqual(S({ y0: 500, y: 500, kb: true, focusTop: 300, focusBottom: 352 }), { to: 500, by: 0, grow: 0 }, "보이면 그대로");
  assert.equal(S({ viewH: 100, kb: true, focusTop: 70, focusBottom: 140 }).to, 6, "초점이 화면보다 커도 머리줄 밑으로 넘기지는 않는다(70 − 64)");
  // 잴 수 없을 때 — 굴린 자리를 모르면 ③ 만(옛 브라우저·시험의 가짜 화면) · 화면 높이를 모르면 아무것도 하지 않는다
  assert.deepEqual(calSettle({ y: undefined, viewH: 667, panelTop: 620, reveal: true }), { to: null, by: 173, grow: 0 });
  assert.deepEqual(calSettle({ y: undefined, viewH: 667, panelTop: 620, splitTop: 620, reveal: true }), { to: null, by: 0, grow: 0 });
  assert.deepEqual(calSettle({ y: undefined, viewH: 667, panelTop: 620 }), { to: null, by: 0, grow: 0 });
  for (const bad of [null, undefined, {}, { y: 0 }, { y: 0, viewH: 0 }, { y: 0, viewH: NaN }, { y: 0, viewH: "900" }]) assert.deepEqual(calSettle(bad), { to: null, by: 0, grow: 0 }, JSON.stringify(bad));
  assert.deepEqual(calSettle({ y: 120, viewH: 900 }), { to: 120, by: 0, grow: 0 }, "잴 것이 없으면 제자리");
});

test("달력 조각(calHtml) — 칸 = 단추(data-day) · 칩과 같은 뜻 · ⚠·🔒 · 오늘 · 공휴일은 hol · 앞뒤 달 단추 · 풀이는 있는 표시만", () => {
  const oct = calHtml(DAYS, "2026-10-11", TODAY, { older: true });
  assert.ok(oct.startsWith('<div class="dty-cal" role="group" aria-label="날짜 고르기">'));
  assert.ok(oct.includes("<b>2026년 10월</b>"));
  assert.ok(oct.includes('<span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span>'));
  assert.equal((oct.match(/<button type="button" class="dty-cal-c has /g) || []).length, 5, "10월의 당번 날짜 다섯(4·9·11·18·25일)");
  assert.equal((oct.match(/class="dty-cal-c[^"]*"/g) || []).length, 35, "칸은 서른다섯(빈칸 넷 + 31일)");
  assert.ok(oct.includes('<button type="button" class="dty-cal-c has k-need on" data-day="2026-10-11" aria-pressed="true" aria-label="10월 11일(일) — 빈 자리 1 · 필요 3명 가운데 2명 채워졌어요"><span>11</span><i aria-hidden="true">2/<wbr>3</i></button>'), "고른 날");
  assert.ok(oct.includes('<button type="button" class="dty-cal-c has k-need hol" data-day="2026-10-09" aria-pressed="false" aria-label="10월 9일(금) — 빈 자리 1 · 필요 2명 가운데 1명 채워졌어요 · 공휴일(한글날)"><span>9</span><i aria-hidden="true">1/<wbr>2</i></button>'),
    "당번이 있는 공휴일 — 칸의 뜻(k-need)은 그대로이고 hol 이 붙는다");
  assert.ok(oct.includes('class="dty-cal-c has k-past" data-day="2026-10-04" aria-pressed="false" aria-label="10월 4일(일) — 지난 날 · 필요 2명 가운데 1명 채워졌어요"><span>4</span><i aria-hidden="true">1/<wbr>2</i></button>'), "지난 날");
  assert.ok(oct.includes('class="dty-cal-c has k-off" data-day="2026-10-18" aria-pressed="false" aria-label="10월 18일(일) — 쉼"><span>18</span><i aria-hidden="true">쉼</i></button>'), "쉬는 날");
  assert.ok(oct.includes('class="dty-cal-c has k-ask lock" data-day="2026-10-25" aria-pressed="false" aria-label="10월 25일(일) — 못 온다 1 · 필요 2명 가운데 2명 채워졌어요 · 확정된 날">' +
    '<span>25</span><i aria-hidden="true">2/<wbr>2</i><em class="wn" aria-hidden="true">⚠</em><em class="lk" aria-hidden="true">🔒</em></button>'), "못 온다는 분 + 확정");
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
  // 인원 글은 「/」 뒤에서 줄을 바꿀 수 있다(<wbr>) — 칸에 한 줄로 못 들 때만 두 줄(「100/120」 · 좁은 폰). 글자는 그대로(낭독의 수도) · 「쉼」·「–」에는 넣을 자리가 없다
  const crowd = (n) => Array.from({ length: n }, (_, i) => who(i + 1));
  const big = calHtml([day("2026-11-08", [slot(1, { capacity: 120, signups: crowd(100) })]), day("2026-11-15", [slot(2)], { off: true }), day("2026-11-22"), day("2026-11-29")], "2026-11-08", TODAY);
  assert.ok(big.includes('class="dty-cal-c has k-need on" data-day="2026-11-08" aria-pressed="true" aria-label="11월 8일(일) — 빈 자리 20 · 필요 120명 가운데 100명 채워졌어요"><span>8</span><i aria-hidden="true">100/<wbr>120</i></button>'));
  assert.ok(big.includes('<i aria-hidden="true">쉼</i>') && big.includes('<i aria-hidden="true">–</i>'));
  assert.equal((oct.match(/<wbr>/g) || []).length, 4, "10월 — 수가 적힌 칸마다 하나(4·9·11·25일 · 쉬는 18일에는 없다)");
  // 공휴일 표가 덮지 않는 달 — 풀이가 그렇게 말한다(빨간 날짜가 없는 것이 「공휴일이 없다」로 읽히지 않게 · 1년짜리 당번은 표 끝의 한 해 전부터 그 뒤의 달을 보여 준다)
  const far = [day("2028-12-24", [slot(1)]), day("2028-12-31", [slot(2)]), day("2029-01-07", [slot(3)]), day("2029-01-14", [slot(4)])];
  const jan29 = calHtml(far, "2029-01-07", TODAY);
  assert.ok(jan29.includes("<br>이 달의 공휴일은 아직 표시되지 않아요(2028년 12월까지만 빨갛게 보여요).<br>날짜를 누르면 그날의 명단이 보여요.</p>"), "표 끝 뒤의 달");
  assert.equal(/ hol"/.test(jan29) || jan29.includes("빨간 날짜"), false);
  const dec28 = calHtml(far, "2028-12-24", TODAY);
  assert.ok(dec28.includes('공휴일이에요(<span class="ki">25일 성탄절</span>).') && !dec28.includes("표시되지 않아요"), "표 안의 마지막 달은 그대로");
  assert.ok(calHtml(DAYS, "2026-09-27", TODAY).includes("<br>이 달의 공휴일은 표시되지 않아요(2026년 10월부터 빨갛게 보여요).<br>"), "표가 시작하기 전의 달(지난 날을 더 불러와 본 2026년 9월)");
  assert.equal(nov.includes("표시되지 않아요") || oct.includes("표시되지 않아요"), false, "표 안의 달에는 그 말이 없다(공휴일이 없는 11월도)");
});

// ── 명단 화면의 이음(roster.js) — 가짜 화면에 실제로 그리고 눌러 본다 ──
//   give = 고르개(선택자)마다 돌려줄 가짜 요소 · onDraw = 화면을 갈아 끼울 때마다 부른다(브라우저가 문서가 줄어 굴린 자리를 잘라 내는 것을 흉내 낸다) ·
//   box = 이 화면의 상자(아래끝 = 내용의 끝) · 누름에 ev 를 얹을 수 있다({ detail: 0 } = 자판으로 누름)
function screen(give = {}, { onDraw = null, contains = null, box = null } = {}) {
  const handlers = {}, asked = [];
  let html = "";
  const el = { get innerHTML() { return html; }, set innerHTML(v) { html = v; if (onDraw) onDraw(v); }, classList: { add() {} }, addEventListener: (t, fn) => { handlers[t] = fn; }, querySelectorAll: () => [],
    querySelector: (sel) => { asked.push(sel); return give[sel] || null; }, ...(contains ? { contains } : {}), ...(box ? { getBoundingClientRect: box } : {}) };
  const click = (map, ev = {}) => handlers.click({ target: { closest: (sel) => map[sel] || null }, ...ev });
  return { el, asked, click,
    nav: (dir, ev) => click({ "button[data-cal]": { dataset: { cal: dir } } }, ev),
    pick: (date, inCal = true, ev) => click({ "[data-day]": { dataset: { day: date }, classList: { contains: (c) => inCal && c === "dty-cal-c" } } }, ev),
    older: (inCal = true, ev) => click({ "button[data-act]": { dataset: { act: "older" }, classList: { contains: (c) => inCal && c === "dty-cal-nav" } } }, ev) };
}
// 가짜 서버 — from(서버 duty_roster 와 같은 자르기) 뒤의 날짜만 준다. fail 을 켜 두면 명단을 못 읽는다. today = 서버가 말하는 오늘.
function server(id, all, today = TODAY) {
  const calls = [], state = { fail: false };
  const call = async (action, body) => {
    calls.push([action, body]);
    if (action === "dutyBoardList") return { ok: true, scope: "all", today, boards: [{ id, title: "식당 봉사", status: "open", statusLabel: "받는 중" }] };
    if (action === "dutyRoster") {
      if (state.fail) return { ok: false, error: "network" };
      return { ok: true, chief: true, appOpen: false, today, staff: [], lines: [{ id: 1, active: true, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, sort: 0 }],
        board: { id, title: "식당 봉사", status: "open", statusLabel: "받는 중", openDays: 56, untilDate: "", place: "", contact: "", maxAhead: null },
        days: all.filter((d) => d.date >= body.from) };
    }
    return { ok: false, error: "unknown-action" };
  };
  return { call, calls, state, froms: () => calls.filter((c) => c[0] === "dutyRoster").map((c) => c[1].from) };
}
// 토스트(core/ui.js)는 document 를 쓴다 — 마지막 글만 받는 가짜. 4초 뒤 숨기는 타이머는 시험 동안 걸지 않는다(파일이 4초 더 돌지 않게).
//   win·doc = 가짜 창·문서에 얹을 것(win.scrollY 를 숫자로 주면 굴린 자리를 재고 옮길 수 있는 창이 된다 — jumps 에 scrollTo 로 간 자리가 쌓인다) · css = 가짜 getComputedStyle
async function withPage(fn, { win = {}, doc = {}, css = null } = {}) {
  const said = { textContent: "", hidden: true, setAttribute() {} }, scrolls = [], jumps = [];
  const keep = { document: globalThis.document, window: globalThis.window, setTimeout: globalThis.setTimeout, getComputedStyle: globalThis.getComputedStyle };
  const w = { innerHeight: 667, matchMedia: () => ({ matches: true }), scrollBy: (o) => scrolls.push(o), ...win };
  if (typeof w.scrollY === "number") w.scrollTo = (x, y) => { jumps.push(y); w.scrollY = y; };
  globalThis.document = { querySelector: () => said, createElement: () => said, body: { appendChild() {} }, ...doc };
  globalThis.window = w;
  if (css) globalThis.getComputedStyle = css;
  globalThis.setTimeout = () => 0;
  try { return await fn({ said, scrolls, jumps, win: w }); } finally {
    Object.assign(globalThis, keep);
    for (const k of ["document", "window", "getComputedStyle"]) if (keep[k] === undefined) delete globalThis[k];
  }
}
const title = (el) => (el.innerHTML.match(/<div class="dty-cal-h">.*?<b>([^<]*)<\/b>/s) || [])[1] || "";
const chosen = (el) => (el.innerHTML.match(/class="dty-cal-c has [^"]* on[^"]*" data-day="([^"]*)"/) || [])[1] || "";

test("명단 화면 — 날짜가 넷 이상이면 달력(칩 줄 없음) · 달 단추와 날짜 누름은 서버를 부르지 않는다 · 그날 판은 달력 옆(.dty-split)", async () => {
  await withPage(async ({ scrolls }) => {
    const back = [day("2026-08-30"), day("2026-09-06"), day("2026-09-13"), day("2026-09-20")], sv = server("cal-a", [...back, ...DAYS]);
    const focused = [], btn = (name) => ({ focus: (o) => focused.push([name, o]) });
    const sc = screen({ ".dty-cal-nav.r": btn("r"), ".dty-cal-nav.l": btn("l"), ".dty-cal-c.on": btn("on") });
    await render(sc.el, { call: sv.call, query: {} });
    assert.deepEqual(sv.froms(), ["2026-09-01"], "처음에는 지난 14일(9/23)이 든 달의 1일부터 — 달을 통째로 읽는다");
    assert.ok(sc.el.innerHTML.includes('data-cal="prev" aria-label="2026년 9월 보기"') && !sc.el.innerHTML.includes('data-day="2026-08-30"'), "8월은 아직 읽지 않았다");
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
    assert.deepEqual(sv.froms(), ["2026-09-01"], "달 단추·날짜 누름은 서버를 부르지 않는다");
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

test("명단 화면 — 「◀ 지난 날」: 앞 달을 통째로 더 불러와 그 달로 간다 · 못 불러왔으면 「없어요」라고 하지 않고 다음에 같은 만큼 다시", async () => {
  await withPage(async ({ said }) => {
    // 9월에는 날짜가 없고 8월에 있다 → 처음에는 10월이 맨 앞 달(「◀ 지난 날」) · 더 불러오면 8월의 마지막 날로
    const sv = server("cal-c", [day("2026-08-09"), day("2026-08-16"), ...DAYS.filter((d) => d.date >= "2026-10-04" && d.date <= "2026-11-08")]);
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
    assert.deepEqual(sv.froms(), ["2026-09-01", "2026-08-01", "2026-08-01"], "실패한 만큼은 다음에 다시(불러온 날 수를 되돌린다) · 앞 달도 1일부터");
    assert.equal(said.textContent, "지난 날짜 2개를 더 불러왔어요");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 8월", "2026-08-16"], "새로 생긴 앞 달의 마지막 날로");
    assert.ok(focused.length >= 1 && focused.every((x) => x === "l"), "다시 그린 뒤 초점은 왼쪽 달 단추로");
    await sc.older();
    assert.equal(said.textContent, "지난 10주 안에는 더 지난 날짜가 없어요", "새 날짜가 없으면 그렇다고 말한다");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 8월", "2026-08-16"]);
    assert.equal(sv.froms()[3], "2026-07-01");
  });
  await withPage(async ({ said }) => {
    // 독립 검토 반영 — 달 끝 무렵(오늘 10/25): 그 달의 첫 주일들도 처음부터 읽는다. 전에는 오늘 − 14일(10/11)부터 읽어 10월 4일이 「당번 없는 날」과 같은 칸이었고,
    //   「◀ 지난 날」을 눌러야 「1/2」 칸으로 나타났다(달력이 그날 명단이 없었다고 말하는 꼴).
    const T = "2026-10-25", P = { past: true };
    const all = [day("2026-09-20", [slot(1)], P), day("2026-09-27", [slot(2)], P), day("2026-10-04", [slot(3, { signups: [who(1)] })], P), day("2026-10-11", [slot(4)], P), day("2026-10-18", [slot(5)], P),
      day("2026-10-25", [slot(6)]), day("2026-11-01", [slot(7)])];
    const sv = server("cal-d", all, T), sc = screen();
    await render(sc.el, { call: sv.call, query: {} });
    assert.deepEqual(sv.froms(), ["2026-10-01"], "오늘 − 14일(10/11)이 든 달의 1일");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 10월", "2026-10-25"]);
    assert.ok(sc.el.innerHTML.includes('class="dty-cal-c has k-past" data-day="2026-10-04"') && sc.el.innerHTML.includes('<span>4</span><i aria-hidden="true">1/<wbr>2</i>'), "10월 4일은 처음부터 단추 칸이다(선 분의 수가 보인다)");
    assert.equal(sc.el.innerHTML.includes('<span class="dty-cal-c"><span>4</span></span>'), false, "「당번 없는 날」 칸으로 그리지 않는다");
    for (const d of ["2026-10-11", "2026-10-18", "2026-10-25"]) assert.ok(sc.el.innerHTML.includes(`data-day="${d}"`), d);
    assert.ok(sc.el.innerHTML.includes('class="btn dty-cal-nav l" data-act="older"'), "9월은 아직 읽지 않았다 — 왼쪽 단추는 「◀ 지난 날」");
    await sc.older();
    assert.deepEqual(sv.froms(), ["2026-10-01", "2026-09-01"], "앞 달을 통째로");
    assert.equal(said.textContent, "지난 날짜 2개를 더 불러왔어요");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 9월", "2026-09-27"], "새로 생긴 앞 달의 마지막 날로");
    assert.ok(sc.el.innerHTML.includes('data-day="2026-09-20"') && sc.el.innerHTML.includes('data-day="2026-09-27"'), "그 달의 날짜가 모두 있다");
  });
  await withPage(async ({ said }) => {
    // 달의 29~31일에서 4주를 빼면 같은 달이다(오늘 11/13: 10/30 → 10/2) — 한 번 눌러 앞 달(9월)까지 간다(같은 것을 다시 읽고 「없어요」라고만 하지 않는다)
    const T = "2026-11-13", P = { past: true };
    const all = [day("2026-09-27", [slot(1)], P), day("2026-10-04", [slot(2)], P), day("2026-10-11", [slot(3)], P), day("2026-10-18", [slot(4)], P), day("2026-11-15", [slot(5)])];
    const sv = server("cal-k", all, T), sc = screen();
    await render(sc.el, { call: sv.call, query: {} });
    await sc.nav("prev");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 10월", "2026-10-18"]);
    await sc.older();
    assert.deepEqual(sv.froms(), ["2026-10-01", "2026-09-01"]);
    assert.equal(said.textContent, "지난 날짜 1개를 더 불러왔어요");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 9월", "2026-09-27"]);
  });
});

test("명단 화면 — 다시 그려도 달력은 제자리: 붙은 달력 옆의 판은 맨 위부터 · 문서가 줄면 그만큼 늘린다 · 자판으로 눌렀으면 초점이 가려지지 않게(독립 검토 반영)", async () => {
  // PC — 달력이 머리줄 아래(64px)에 붙어 있다. 가짜 화면은 「화면을 갈아 끼우면 문서가 줄어 브라우저가 굴린 자리를 잘라 내는 것」을 onDraw 로 흉내 낸다.
  {
    const cal = {}, geo = { splitTop: 409, panelTop: 409, panelBottom: 1900, docH: 3000, next: null };
    const split = { style: {}, getBoundingClientRect: () => ({ top: geo.splitTop, height: 560 }), querySelector: (s) => (s === ".dty-cal" ? cal : null) };
    const panel = { getBoundingClientRect: () => ({ top: geo.panelTop, bottom: geo.panelBottom }) };
    await withPage(async ({ scrolls, jumps, win }) => {
      const sv = server("cal-j", DAYS);
      const sc = screen({ ".dty-split": split, ".dty-day": panel }, { box: () => ({ bottom: geo.docH - win.scrollY }), onDraw: () => { if (geo.next) { const n = geo.next; geo.next = null; win.scrollY = n.y; Object.assign(geo, n.geo); } } });
      await render(sc.el, { call: sv.call, query: {} });
      assert.deepEqual([jumps, scrolls, split.style.minHeight], [[], [], undefined], "처음 그릴 때는 아무것도 옮기지 않는다");
      // 긴 판을 790 까지 굴렸다(달력은 붙어 있다) → 「11월 ▶」: 새 판이 짧아 문서가 줄고 브라우저가 178 로 잘랐다
      win.scrollY = 790; Object.assign(geo, { splitTop: -381, panelTop: -381, panelBottom: 1110 });
      geo.next = { y: 178, geo: { splitTop: 231, panelTop: 231, panelBottom: 531, docH: 1078 } };
      await sc.nav("next");
      assert.deepEqual(jumps, [345], "그날 판의 위가 붙은 선(64)에 오는 자리로 — 판이 맨 위부터 보인다");
      assert.equal(split.style.minHeight, "727px", "모자란 167px 만큼 문서를 늘린다 — 붙어 있던 달력이 내려가지 않아 같은 자리에 「▶」가 남는다");
      assert.deepEqual(scrolls, [], "달 단추는 더 굴리지 않는다");
      // 그 자리(달력이 제 높이 — 붙은 것이 아니다)에서 날짜를 누른다: 올리지 않고 굴린 자리만 지킨다
      Object.assign(geo, { splitTop: 64, panelTop: 64, panelBottom: 364, docH: 1245 });
      geo.next = { y: 200, geo: { splitTop: 209, panelTop: 209, panelBottom: 420, docH: 1100 } };
      await sc.pick("2026-11-08");
      assert.deepEqual(jumps, [345, 345], "굴린 자리(345)를 지킨다");
      assert.equal(split.style.minHeight, "705px", "345 + 900 − 1100 = 145px 모자란다");
      assert.deepEqual(scrolls, [], "달력 옆에 판이 있으면 내리지 않는다");
      // 달력과 상관없는 그리기(탭 바꾸기)도 굴린 자리를 지킨다 · 붙은 달력이어도 올리지 않는다
      Object.assign(geo, { splitTop: -100, panelTop: -100, panelBottom: 800, docH: 3000 }); win.scrollY = 509;
      await sc.click({ "[data-tab]": { dataset: { tab: "lines" } } }); await sc.click({ "[data-tab]": { dataset: { tab: "roster" } } });
      assert.deepEqual(jumps, [345, 345], "문서가 넉넉하면 아무것도 옮기지 않는다 — 붙은 달력이어도(달력을 누른 것이 아니다)");
    }, { win: { innerHeight: 900, scrollY: 0 }, css: (x) => (x === cal ? { position: "sticky", top: "64px" } : { position: "static", top: "auto" }) });
  }
  // 폰·낮은 화면 — 달력 아래에 판. 자판(Enter)으로 날짜를 고르면 고른 칸이 화면에 남는 만큼만 내린다 · 마우스·터치는 그날 판을 보여 준다
  {
    const geo = { splitTop: 50, panelTop: 565, panelBottom: 2000, docH: 3000 }, focus = { getBoundingClientRect: () => ({ top: 250, bottom: 302 }) };
    const split = { style: {}, getBoundingClientRect: () => ({ top: geo.splitTop, height: 2000 }), querySelector: () => ({}) };
    const panel = { getBoundingClientRect: () => ({ top: geo.panelTop, bottom: geo.panelBottom }) };
    await withPage(async ({ scrolls, jumps }) => {
      const sv = server("cal-l", DAYS), sc = screen({ ".dty-split": split, ".dty-day": panel }, { contains: (x) => x === focus, box: () => ({ bottom: geo.docH - 233 }) });
      await render(sc.el, { call: sv.call, query: {} });
      await sc.pick("2026-10-11", true, { detail: 0 });
      assert.deepEqual(scrolls, [{ top: 186, behavior: "auto" }], "자판: 310px 를 내리면 고른 칸(250~302)이 머리줄 위로 나간다 → 186px(250 − 64)만");
      await sc.pick("2026-10-25", true, { detail: 1 });
      assert.deepEqual(scrolls[1], { top: 310, behavior: "auto" }, "마우스·터치: 그날 판이 220px 보일 만큼");
      await sc.pick("2026-10-25", true, { detail: 1 });
      assert.equal(scrolls.length, 3, "이미 고른 날을 다시 눌러도 그날 판을 보여 준다");
      await sc.nav("next", { detail: 0 });
      assert.equal(scrolls.length, 3, "달 단추는 내리지 않는다(초점이 보이는 동안)");
      assert.deepEqual(jumps, [], "굴린 자리는 그대로 — 붙는 꼴(position: sticky)이 아닌 달력은 위로 끌어올리지 않는다");
    }, { win: { innerHeight: 475, scrollY: 233 }, doc: { activeElement: focus }, css: () => ({ position: "static", top: "64px" }) });
  }
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
    const sv = server("cal-g", [day("2026-08-16", [slot(9)]), day("2026-10-11", [slot(1)]), day("2026-10-18", [slot(2)]), day("2026-10-25", [slot(3)])]), sc = screen();
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
    const sv = server("cal-f", [day("2026-08-15", [slot(1, { signups: [who(1)] })])]), sc = screen();   // 두 달 전에 끝난 모집
    await render(sc.el, { call: sv.call, query: {} });
    assert.ok(sc.el.innerHTML.includes("이 기간에는 자리가 없어요") && sc.el.innerHTML.includes('<button type="button" class="btn wide" data-act="older">◀ 지난 날 더 보기</button>'));
    await sc.older(false);
    assert.equal(said.textContent, "지난 날짜 1개를 더 불러왔어요");
    assert.ok(sc.el.innerHTML.includes("<b>8월 15일(토)</b>") && sc.el.innerHTML.includes("성도1"), "끝난 모집의 명단이 보인다");
  });
  await withPage(async ({ said }) => {
    // 지난달에 끝난 모집은 처음부터 보인다(달을 통째로 읽는다 — 9/5 는 오늘 − 14일(9/23)이 든 달이다)
    const sv = server("cal-m", [day("2026-09-05", [slot(1, { signups: [who(1)] })])]), sc = screen();
    await render(sc.el, { call: sv.call, query: {} });
    assert.ok(sc.el.innerHTML.includes("<b>9월 5일(토)</b>") && sc.el.innerHTML.includes("dty-chips-d") && !said.textContent);
  });
});

test("명단 화면 — 달력 밖의 「지난 날 더 보기」(빈 명단의 단추 · 칩 줄의 칩): 다시 그린 뒤 초점을 그 단추로 · 단추가 사라졌으면 고른 날로 · 못 불러왔으면 남기지 않는다(독립 검토 반영)", async () => {
  const focusLog = () => { const log = []; return { log, btn: (name) => ({ focus: (o) => log.push([name, o]) }) }; };
  await withPage(async ({ said }) => {
    // 넉 달 전에 끝난 모집 — 4주씩(앞 달이 통째로 들어올 때까지) 여러 번 눌러야 한다. 누를 때마다 다시 그려지고 초점은 그 단추로 돌아온다(전에는 맨 위로 떨어졌다)
    const sv = server("cal-i", [day("2026-06-06", [slot(1, { signups: [who(1)] })])]), f = focusLog();
    const sc = screen({ '[data-act="older"]': f.btn("older"), ".dty-chipd.on": f.btn("chip") });
    await render(sc.el, { call: sv.call, query: {} });
    assert.deepEqual(f.log, [], "처음 그릴 때는 초점을 옮기지 않는다");
    await sc.older(false);
    assert.equal(said.textContent, "지난 6주 안에는 더 지난 날짜가 없어요");
    assert.deepEqual(f.log, [["older", { preventScroll: true }]], "새 날짜가 없어도 화면은 다시 그려졌다 — 초점은 그 단추로");
    await sc.older(false);
    assert.equal(said.textContent, "지난 10주 안에는 더 지난 날짜가 없어요");
    await sc.older(false);
    assert.deepEqual(sv.froms(), ["2026-09-01", "2026-08-01", "2026-07-01", "2026-06-01"], "7월 1일(오늘 − 98일)은 앞에서 읽은 달이다 — 한 번에 6월까지 간다");
    assert.equal(said.textContent, "지난 날짜 1개를 더 불러왔어요");
    assert.deepEqual(f.log.map((x) => x[0]), ["older", "older", "older"], "날짜가 나온 뒤에도 「더 보기」가 있으면 그 단추로");
    sv.state.fail = true;
    await sc.older(false);
    await sc.click({ "[data-tab]": { dataset: { tab: "lines" } } }); await sc.click({ "[data-tab]": { dataset: { tab: "roster" } } });
    assert.equal(f.log.length, 3, "못 불러온 뒤의 다른 그리기에서 초점이 튀지 않는다");
  });
  await withPage(async () => {
    // 「더 보기」가 사라졌으면(52주를 다 읽었다 · 달력으로 바뀌어 맨 앞 달이 아니다) 고른 날로
    const sv = server("cal-n", [day("2026-08-15", [slot(1)])]), f = focusLog(), sc = screen({ ".dty-chipd.on": f.btn("chip"), ".dty-cal-c.on": f.btn("cell") });
    await render(sc.el, { call: sv.call, query: {} });
    await sc.older(false);
    assert.deepEqual(f.log, [["cell", { preventScroll: true }]], "달력의 고른 날이 먼저 · 없으면 고른 칩");
    const g = focusLog(), sc2 = screen({ ".dty-chipd.on": g.btn("chip") });
    await render(sc2.el, { call: sv.call, query: {} });
    await sc2.older(false);
    assert.deepEqual(g.log.map((x) => x[0]), ["chip"]);
  });
  await withPage(async () => {
    // 자판으로 칩 줄의 「더 보기」를 눌렀으면 줄을 처음으로 돌린다(고른 칩을 가운데 두느라 그 칩이 줄 밖으로 밀려나 초점이 안 보이지 않게) · 마우스·터치는 그대로
    const sv = server("cal-o", [day("2026-08-15", [slot(9)]), day("2026-10-11", [slot(1)]), day("2026-10-18", [slot(2)])]);
    const more = { focus() {} }, row = { scrollLeft: 99, contains: (x) => x === more }, sc = screen({ '[data-act="older"]': more, ".dty-chips-d": row });
    await render(sc.el, { call: sv.call, query: {} });
    await sc.older(false, { detail: 1 });
    assert.equal(row.scrollLeft, 99, "마우스·터치로 눌렀으면 줄을 건드리지 않는다");
    await sc.older(false, { detail: 0 });
    assert.equal(row.scrollLeft, 0, "자판으로 눌렀으면 줄을 처음으로");
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

test("모양(독립 검토 반영) — 초점 테는 남색 · 단추 칸의 기호 띠는 흐름 안의 한 줄(띄워 놓지 않는다) · 인원 글은 못 들면 줄을 바꾼다(잘라 내지 않는다)", () => {
  const css = read("css/admin.css"), from = css.indexOf("/* 달력(2026-10-07"), to = css.indexOf("/* 그날 판 */"), block = css.slice(from, to).replace(/\/\*[\s\S]*?\*\//g, "");
  // 초점 테 — 옅은 하늘색(--ghost-bd)은 흰 바탕과 1.8:1 이라 자판으로 쓰는 분께 초점이 안 보였다. 달 단추는 제 테두리와 같은 색이 됐다
  assert.ok(block.includes(".dty-cal-c.has:focus-visible,.dty-cal-nav:focus-visible{outline:3px solid var(--navy);outline-offset:1px}"), "달력 칸·달 단추의 초점 테");
  assert.ok(css.includes(".dty-chipd:focus-visible,.dty-board:focus-visible{outline:3px solid var(--navy);outline-offset:1px}"), "칩·당번 고르기도 같은 값(한 화면의 초점 테가 하나)");
  assert.equal(/\.dty-(cal|chipd|board)[^{}]*:focus-visible[^{}]*\{[^}]*--ghost-bd/.test(css), false, "옅은 초점 테를 되살리지 않는다");
  // 기호 띠 — 띄워 놓으면(position:absolute + 11px 띠) 브라우저가 글씨를 키운 분(최소 글꼴 크기 16px)께 ⚠·🔒 가 날짜 숫자를 덮는다
  assert.equal(/position:absolute/.test(block), false, "기호를 띄워 놓지 않는다");
  for (const rule of [".dty-cal-c > em{grid-row:1;font-style:normal;font-size:10px;line-height:1}", '.dty-cal-c.has::before{content:"\\200b";grid-area:1 / 1 / 2 / -1;font-size:10px;line-height:1}',
    ".dty-cal-c.has > span{grid-area:2 / 1 / 3 / -1;font-weight:700}", ".dty-cal-c.has > i{grid-area:3 / 1 / 4 / -1}"]) assert.ok(block.includes(rule), rule);
  assert.equal(/\.dty-cal-c[^{}]*> i\{[^}]*nowrap/.test(block), false, "인원 글에 nowrap 을 걸지 않는다(한 줄에 못 들면 「/」 뒤에서 줄을 바꾼다 — 넘쳐 이웃 칸에 묻히지 않게)");
  assert.ok(/\.dty-cal-c\.has\{display:grid;grid-template-columns:1fr 1fr;align-content:start;/.test(block), "단추 칸은 세 줄(기호 띠 · 숫자 · 인원)");
  const size = (sel) => block.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{[^}]*\\}"))[0].match(/font-size:[^;}]+/)[0];
  assert.equal(size(".dty-cal-c > em"), size(".dty-cal-c.has::before"), "빈 띠와 기호가 같은 글꼴 크기 — 기호가 없는 칸도 같은 높이를 비운다");
  // 달력 + 그날 판의 묶음 — 폰에서는 flow-root(끝 자리의 아래 여백이 묶음 밖으로 새면, 묶음을 늘려 화면 자리를 지킬 때 그만큼 어긋난다) · PC 규칙(두 칸)이 그 뒤에 온다
  assert.ok(block.includes(".dty-split{display:flow-root}") && css.indexOf(".dty-split{display:flow-root}") < css.indexOf(".dty-split{display:grid;"), "묶음은 flow-root → PC 에서 grid");
  assert.equal(/\.dty-cal-c[^{}]*\{[^}]*overflow:hidden/.test(block), false, "칸을 잘라 내지 않는다(넘친 수가 잘리면 「00/12」처럼 틀린 수로 읽힌다)");
  assert.ok(block.indexOf(".dty-cal-c.on > span,.dty-cal-c.on > i,.dty-cal-c.on > em.wn{color:#fff}") > block.indexOf(".dty-cal-c > em.wn{"), "고른 날의 흰 ⚠ 가 붉은 ⚠ 뒤에 온다");
});
