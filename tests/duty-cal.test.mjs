// 📅 당번 명단 달력(2026-10-07 친구 요청 — 「어드민에서도 달력으로 확인」)
//   공휴일 표(holidays.js) · 달력 규칙(duty-logic.js cal*) · 달력 조각(roster-cal.js) · 명단 화면의 이음(roster.js — 가짜 화면으로 실제로 눌러 본다) · 색
//   이름은 가짜(성도1 …)만. 실제 브라우저에서의 모양·대비·굴리기는 손으로 본다(성경암송 docs/notes/duty-roster.md 「공휴일」·「어드민 달력」).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HOL_FROM, HOL_UNTIL, HOLIDAYS, holidayName, holItems, holOutside, holOutsideText } from "../js/menus/duty/holidays.js";
import {
  CAL_MIN, calUse, calMonths, calTitle, calMonthWord, calMonth, calCell, calMark, calLabel, calPick, calStep, olderPick, olderText, revealBy, calSettle,
  rosterFrom, rosterFromKeep, olderBack, dayChip, initialDay, maxBack, addDays, isSunday,
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
  //   지문은 범위(HOL_FROM~HOL_UNTIL)도 싣는다 — 달력의 풀이가 그 범위를 말하므로(「…다른 공휴일은 2028년 12월까지만 표시돼요」) 범위만 달라도 두 달력이 다른 말을 한다.
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
  // 표가 덮지 않는 달 — 평일이 빨갛지 않은 것이 「공휴일이 없다」는 뜻이 아니다(달력의 풀이가 그렇게 말한다 · 일요일은 표와 상관없이 어느 달이나 빨갛다). 1년짜리 당번은 표 끝의 한 해 전부터 그 뒤의 달을 보여 준다
  assert.equal(holOutside(HOL_FROM.slice(0, 7)), ""); assert.equal(holOutside(HOL_UNTIL.slice(0, 7)), ""); assert.equal(holOutside("2027-06"), "");
  assert.equal(holOutside(addDays(HOL_UNTIL, 1).slice(0, 7)), "after"); assert.equal(holOutside(addDays(HOL_FROM, -1).slice(0, 7)), "before"); assert.equal(holOutside("2031-03"), "after");
  for (const bad of ["", null, undefined, "x", "2029", "2029-1", "2029-01-01", 202901]) assert.equal(holOutside(bad), "", String(bad));
  assert.equal(holOutsideText("after"), "이 달은 일요일만 빨갛게 보여요(다른 공휴일은 2028년 12월까지만 표시돼요).");
  assert.equal(holOutsideText("before"), "이 달은 일요일만 빨갛게 보여요(다른 공휴일은 2026년 10월부터 표시돼요).");
  assert.equal(holOutsideText(""), ""); assert.equal(holOutsideText(undefined), "");
});

test("일요일인가(isSunday) — 날짜만 있는 값이라 UTC 로 읽는다(기기의 시간대에 밀리지 않는다) · 달력 칸의 첫 열과 같다 · 틀린 값은 거짓", () => {
  for (const d of ["2026-10-04", "2026-10-11", "2027-02-07", "2028-12-31", "2029-01-07", "2024-02-25"]) assert.equal(isSunday(d), true, d);
  for (const d of ["2026-10-03", "2026-10-05", "2026-10-10", "2026-12-25", "", null, undefined, "x", "2026-10-1", "2026-13-01", "2026-02-30", "2026-02-29", "2026-10-11T00:00:00+09:00", 20261011]) assert.equal(isSunday(d), false, String(d));   // 2026-02-29 는 없는 날 — 넘겨 읽으면 3월 1일(일요일)이 된다
  let n = 0;
  for (let i = 0; i < 800; i++) {   // 두 해 남짓을 하루씩 — 이레마다 꼭 한 번 · 달력 칸(calMonth)의 첫 열과 같다
    const d = addDays("2026-10-01", i), col = calMonth(d.slice(0, 7)).findIndex((c) => c.date === d) % 7;
    assert.equal(isSunday(d), col === 0, d); n += isSunday(d) ? 1 : 0;
  }
  assert.equal(n, 114, "800일 가운데 일요일 114번");
  // 다른 시간대의 기기에서도 같은 답인가(올리기 전 확인 반영 2026-10-07) — 이 시험이 도는 PC(한국)와 배포 전 검사(UTC)에서는 getDay 와 getUTCDay 가 같은 값이라,
  //   요일을 기기 시각으로 읽게 바꿔도 여기까지는 모두 통과한다. UTC 서쪽·날짜선 양쪽 시간대의 자식 node 에서 모듈을 다시 읽어 일요일 판정 · 요일 글자(dayLabel) · 달력의 열(calMonth)을 함께 본다.
  //   ⚠️ 손으로 볼 때 Git Bash 의 `TZ=… node` 는 node 에 닿지 않는다 — 자식의 env 로 준다.
  const DS = ["2026-10-10", "2026-10-11", "2026-10-12", "2027-01-03", "2027-01-04", "2028-12-31", "2029-01-01"];
  const child = `import { isSunday, dayLabel, calMonth } from "./js/menus/duty/duty-logic.js"; const D = ${JSON.stringify(DS)};
    process.stdout.write(JSON.stringify({ sun: D.map(isSunday), label: D.map(dayLabel), col: D.map((d) => calMonth(d.slice(0, 7)).findIndex((c) => c.date === d) % 7) }));`;
  for (const tz of ["America/Los_Angeles", "Pacific/Pago_Pago", "Pacific/Kiritimati"]) {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", child], { cwd: fileURLToPath(new URL("../", import.meta.url)), env: { ...process.env, TZ: tz }, encoding: "utf8" });
    assert.equal(r.status, 0, `${tz} — ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), { sun: [false, true, false, true, false, true, false], label: ["10월 10일(토)", "10월 11일(일)", "10월 12일(월)", "1월 3일(일)", "1월 4일(월)", "12월 31일(일)", "1월 1일(월)"], col: [6, 0, 1, 0, 1, 0, 1] }, tz);
  }
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

test("읽은 범위는 줄이지 않는다(rosterFromKeep) — 화면을 연 채 날이 바뀌어도 읽던 달이 통째로 빠지지 않는다 · 서버가 자르는 곳 앞으로는 가지 않는다(올리기 전 확인 반영)", () => {
  // 10월 14일에 열어 9월 1일부터 읽었다. 15일이 되면 「오늘 − 14일」이 10월 1일이라 rosterFrom 은 한 달 뒤로 뛴다 — 9월의 날을 보던 판이 저장 뒤 다른 날로 바뀌었다
  assert.equal(rosterFrom("2026-10-14", 14), "2026-09-01"); assert.equal(rosterFrom("2026-10-15", 14), "2026-10-01");
  assert.equal(rosterFromKeep("2026-10-15", 14, "2026-09-01"), "2026-09-01", "이미 읽은 처음보다 뒤로 가지 않는다");
  assert.equal(rosterFromKeep("2026-10-15", 14, ""), "2026-10-01", "읽은 것이 없으면(처음 · 다른 당번) rosterFrom 그대로");
  assert.equal(rosterFromKeep("2026-10-15", 14), "2026-10-01"); assert.equal(rosterFromKeep("2026-10-15", 14, null), "2026-10-01"); assert.equal(rosterFromKeep("2026-10-15", 14, "x"), "2026-10-01");
  assert.equal(rosterFromKeep("2026-10-15", 42, "2026-10-01"), "2026-09-01", "더 불러올 때는 앞으로 간다(읽은 처음이 더 뒤)");
  assert.equal(rosterFromKeep("2026-10-15", 14, "2026-10-01"), "2026-10-01");
  // 서버는 오늘 − 400일에서 자른다 — 읽은 처음이 그보다 앞이 될 만큼 오래 열어 둔 화면은 52주가 든 달의 1일까지만(달 가운데서 잘린 명단을 받지 않게)
  assert.equal(rosterFrom("2027-12-20", maxBack()), "2026-12-01"); assert.equal(rosterFromKeep("2027-12-20", 14, "2026-10-01"), "2026-12-01", "한 해 넘게 연 화면");
  assert.equal(rosterFromKeep("", 14, "2026-09-01"), "", "오늘을 모르면 보내지 않는다");
  for (let i = 0; i < 366; i++) {   // 어느 날이든: 읽은 처음보다 뒤가 아니고 · rosterFrom 보다 뒤가 아니고 · 서버가 자르는 곳보다 뒤(달의 1일)
    const t = addDays("2027-01-01", i), read = rosterFrom(addDays(t, -40), 14), got = rosterFromKeep(t, 14, read);
    assert.ok(got <= rosterFrom(t, 14) && got <= read && got > addDays(t, -400) && got.endsWith("-01"), `${t} ${read} → ${got}`);
  }
  // 「지난 날」은 **읽은 처음보다 앞 달**이 될 때까지 간다 — 날이 바뀐 뒤(읽은 처음 9/1 · 「오늘 − 14일」의 달은 10월)에 4주만 더하면 9월을 다시 읽고 「없어요」라고만 한다
  assert.equal(olderBack("2026-10-15", 14, 28, "2026-09-01"), 70, "9/3(같은 9월 — 오늘 − 42일)을 지나 8/6(8월)까지"); assert.equal(rosterFrom("2026-10-15", 70), "2026-08-01");
  assert.equal(olderBack("2026-10-15", 14, 28, ""), 42, "읽은 것을 모르면 「오늘 − back」의 달에서"); assert.equal(olderBack("2026-10-15", 14, 28, "2026-10-01"), 42);
  assert.equal(olderBack("2026-10-15", 14, 28, "2026-11-01"), 42, "읽은 처음이 더 뒤라는 값은 믿지 않는다"); assert.equal(olderBack("2026-10-15", 14, 28, "x"), 42);
  assert.equal(olderBack("2026-11-13", 14, 28, "2026-11-01"), 70, "…믿으면 10/30 − 28일 = 10/2(같은 10월)에서 멈춰 같은 달을 다시 읽는다");
  assert.equal(olderBack("2026-10-15", 350, 28, "2025-11-01"), maxBack(), "52주에서 멈춘다");
  // 명단 화면의 잇기 — 가짜 화면으로는 「같은 범위로 다시 읽기」(메모·빼기 뒤 — 창이 뜬다)를 일으킬 수 없어 글자로 본다(끝까지는 진짜 브라우저 탐침이 본다):
  //   읽을 때 같은 당번이면 앞서 읽은 처음을 넘기고 · 읽은 뒤에만 적고 · 당번이 풀리면 버리고 · 「지난 날」과 날짜 더하기도 실제로 읽은 처음과 견준다
  const src = read("js/menus/duty/roster.js");
  for (const line of ['const from = today ? rosterFromKeep(today, back, cur && cur.id === b.id ? readFrom : "") : "";', "cur = b; ros = r; today = r.today || today; readFrom = from;",
    'const drop = () => { cur = null; ros = null; day = ""; readFrom = ""; lastBoardId = ""; lastDay = ""; };', "back = olderBack(today, back, BACK_STEP, readFrom);",
    "if (got.date < (readFrom || rosterFrom(today, back))) back = Math.min(maxBack(), Math.max(back, 35));"]) assert.ok(src.includes(line), line);
  assert.equal(src.split("readFrom = ").length - 1, 3, "읽은 처음을 적는 곳은 셋뿐 — 처음 값 · 읽은 뒤 · 당번이 풀릴 때(못 읽은 때에는 적지 않는다)");
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
  // ② + 자판(올리기 전 확인 반영) — 붙어 있던 달력 안의 초점(칸·달 단추)은 문서를 굴려도 화면에서 제자리다: 자판 보정을 하지 않는다(하면 판이 가운데로 튄다 — 1610 → 1085)
  const pin = { y0: 1610, y: 1610, splitTop: -1202, panelTop: -1202, panelBottom: 1900, stuck: 64, reveal: true, focusTop: 315, focusBottom: 367 };
  assert.deepEqual(S({ ...pin, kb: true }), { to: 344, by: 0, grow: 0 }, "붙은 달력에서 Enter: 마우스와 같은 자리(판의 위가 붙은 선 64 에)");
  assert.deepEqual(S({ ...pin, kb: true }), S({ ...pin, kb: false }), "붙어 있었으면 자판과 마우스가 같다");
  assert.equal(S({ ...pin, kb: true, focusTop: 700, focusBottom: 752, viewH: 720 }).to, 344, "붙은 달력의 아래쪽 칸이어도(화면 아래 가까이) 판을 다시 내리지 않는다");
  assert.equal(S({ ...pin, kb: true, stuck: null }).to, 1610, "붙어 있지 않았으면 굴린 자리 그대로(초점이 보이면)");
  // ⑤ 달력을 누르지 않았는데 보이는 날이 바뀐 그리기(moved — 「옮기기」로 다른 날에 · 날짜 더하기): 굴린 자리를 지키지 않는다 · 문서를 늘리지 않는다
  assert.deepEqual(S({ moved: true, y0: 2332, y: 1157, viewH: 844, endBottom: 844, splitTop: -330, splitH: 1070, panelTop: 164, panelBottom: 844 }), { to: 1157, by: 0, grow: 0 },
    "폰: 짧은 새 판으로 문서가 줄어 브라우저가 1157 로 잘랐다 → 그대로 둔다(새 판이 보인다). 2332 로 되돌리고 늘리면 빈 화면만 남는다");
  assert.deepEqual(S({ y0: 2332, y: 1157, viewH: 844, endBottom: 844, splitTop: -330, splitH: 1070, panelTop: 164, panelBottom: 844 }), { to: 2332, by: 0, grow: 2245 },
    "같은 값에서 moved 가 아니면(같은 날을 다시 그림) 굴린 자리를 지킨다 — 이것이 다른 날에 쓰이면 「옮기기」 뒤 빈 화면이다");
  assert.deepEqual(S({ moved: true, y0: 1500, y: 1500, splitTop: -1291, panelTop: -800, panelBottom: 1200 }), { to: 636, by: 0, grow: 0 }, "긴 판 → 긴 판: 새 판의 위가 머리줄 아래 선(64)에 오게 올린다(1500 − 800 − 64)");
  assert.deepEqual(S({ moved: true, y0: 100, y: 100, splitTop: 309, panelTop: 309 }), { to: 100, by: 0, grow: 0 }, "새 판의 위가 이미 보이면 그대로 — 아래로는 굴리지 않는다");
  assert.deepEqual(S({ moved: true, y0: 420, y: 100, viewH: 720, endBottom: 720, splitTop: 309, panelTop: 309, splitH: 400 }), { to: 100, by: 0, grow: 0 }, "문서가 줄었어도 늘리지 않는다(지킬 손끝이 없다)");
  assert.deepEqual(S({ moved: true, y0: 790, y: 790, splitTop: -381, panelTop: -200, stuck: 64, reveal: true, kb: true, focusTop: 30, focusBottom: 82 }), { to: 526, by: 0, grow: 0 },
    "moved 는 다른 셈(붙음·보이기·자판)보다 앞선다 — 판의 위(−200)를 선에(790 − 200 − 64) · 붙은 선 셈이면 345 다");
  assert.deepEqual(S({ moved: true, y0: 500, y: 500, panelTop: null, splitTop: null }), { to: 500, by: 0, grow: 0 }, "판을 잴 수 없으면 제자리");
  assert.equal(S({ moved: true, y0: 30, y: 30, panelTop: 20, splitTop: 20 }).to, 0, "0 아래로는 가지 않는다");
  // ⑤ + 방금 옮긴 분의 줄(rowTop·rowBottom · 마지막 확인 반영) — 그 줄이 보이는 것이 먼저다. 줄이 「보인다」의 위쪽 끝은 머리줄 선(64) + 붙는 날짜 줄(barH) 아래 · 아래쪽 끝은 화면 − 8
  const mv = { moved: true, y0: 1988, y: 1988, splitTop: -1700, panelTop: -1200, panelBottom: 900, barH: 58 };   // 긴 판 → 긴 판(같은 자리의 다음 주일로) · 화면 900 → 줄은 122~892 사이면 다 보인다
  assert.deepEqual(S({ ...mv, rowTop: 644, rowBottom: 760 }), { to: 1988, by: 0, grow: 0 }, "옮긴 줄이 그 자리에서 다 보인다 → 그대로(판의 맨 위 724 로 튀지 않는다 — 운영하던 판과 같은 자리)");
  assert.deepEqual(S({ ...mv }), { to: 724, by: 0, grow: 0 }, "줄을 모르면(거절 · 날짜 더하기 · 남은 당번이 열림) 새 판의 위로(1988 − 1200 − 64)");
  assert.deepEqual(S({ ...mv, rowTop: 122, rowBottom: 238 }), { to: 1988, by: 0, grow: 0 }, "날짜 줄 바로 아래(64 + 58)에 딱 걸친 줄 — 보인다");
  assert.deepEqual(S({ ...mv, rowTop: 100, rowBottom: 216 }), { to: 1312, by: 0, grow: 0 },
    "머리줄 선보다는 아래지만 붙은 날짜 줄 밑에 깔린 줄(100 < 122) — 보이는 것이 아니다 → 판의 위(724)로 간 뒤 줄이 화면 아래(1480 > 892)라 588px 내린다(줄의 아래끝이 화면 − 8 에)");
  assert.deepEqual(S({ ...mv, rowTop: 100, rowBottom: 216, barH: null }), { to: 1988, by: 0, grow: 0 }, "날짜 줄을 잴 수 없으면 머리줄 선(64)만 본다");
  assert.deepEqual(S({ ...mv, rowTop: 40, rowBottom: 156, barH: -40 }), { to: 1252, by: 0, grow: 0 }, "음수 높이는 0 으로 — 머리줄 선(64) 밑에 깔린 줄(40)은 보이는 것이 아니다(724 로 간 뒤 528px 내린다)");
  assert.deepEqual(S({ ...mv, rowTop: 776, rowBottom: 892 }), { to: 1988, by: 0, grow: 0 }, "화면 아래끝 − 8 에 딱 걸친 줄 — 보인다");
  assert.deepEqual(S({ ...mv, rowTop: 780, rowBottom: 896 }), { to: 1992, by: 0, grow: 0 }, "아래로 4px 잘린 줄 → 4px 만 더 내린 자리(판의 위로 갔다가 줄이 보일 만큼 — 결과는 가장 덜 움직인 자리)");
  assert.deepEqual(S({ ...mv, rowTop: -300, rowBottom: -184 }), { to: 912, by: 0, grow: 0 }, "화면 위로 지나간 줄(다섯째 자리에서 셋째 자리로) → 판의 위(724)에서는 화면 아래(1080)라 188px 내린다");
  assert.deepEqual(S({ ...mv, rowTop: -1000, rowBottom: -884 }), { to: 724, by: 0, grow: 0 }, "판의 첫 화면에 드는 줄(첫 자리로) → 새 판을 맨 위부터(줄은 264~380 에 보인다)");
  assert.deepEqual(S({ moved: true, y0: 500, y: 500, viewH: 844, splitTop: -200, panelTop: 300, panelBottom: 2400, rowTop: 1200, rowBottom: 1316, barH: 58 }), { to: 980, by: 0, grow: 0 },
    "폰(달력 아래에 판): 판의 위는 보이는데 옮긴 줄이 화면 아래 → 480px 내린다(1316 − 836) · 달력을 누른 것이 아니어도 줄은 보여 준다");
  assert.deepEqual(S({ moved: true, viewH: 300, panelTop: 100, panelBottom: 1500, rowTop: 500, rowBottom: 900, barH: 58 }), { to: 378, by: 0, grow: 0 },
    "화면보다 긴 줄 — 줄의 위가 날짜 줄 밑으로 들어가지는 않게(500 − 122)만 내린다");
  assert.deepEqual(S({ ...mv, rowTop: 760, rowBottom: 644 }), { to: 724, by: 0, grow: 0 }, "뒤집힌 값·한쪽만 온 값은 줄을 모르는 것으로");
  assert.deepEqual(S({ ...mv, rowTop: 644, rowBottom: null }), { to: 724, by: 0, grow: 0 }); assert.deepEqual(S({ ...mv, rowTop: "644", rowBottom: 760 }), { to: 724, by: 0, grow: 0 });
  assert.deepEqual(S({ ...mv, rowTop: 0, rowBottom: 0 }), { to: 724, by: 0, grow: 0 }, "높이가 없는 줄(떼어진 화면 · 접힌 줄)은 줄을 모르는 것으로");
  assert.deepEqual(S({ ...mv, moved: false, rowTop: -300, rowBottom: -184 }), { to: 1988, by: 0, grow: 0 }, "같은 날의 다시 그리기(moved 아님)는 줄을 보지 않는다 — 굴린 자리 그대로");
  for (const rt of [-2000, -500, 0, 63, 64, 121, 122, 400, 775, 777, 900, 3000]) {   // 어디에 있든: 갈 자리는 0 이상의 정수 · 늘리지 않는다 · 간 뒤 줄의 위는 날짜 줄 아래(판의 위에 머문 때는 판 안)
    const r = S({ ...mv, rowTop: rt, rowBottom: rt + 116 });
    assert.ok(Number.isInteger(r.to) && r.to >= 0 && r.by === 0 && r.grow === 0, `rowTop ${rt}`);
    const top = rt + (mv.y - r.to), bottom = top + 116;
    assert.ok(bottom <= 892 + 0.5 && (top >= 122 - 0.5 || r.to === 724), `rowTop ${rt} → 간 뒤 ${top}~${bottom}`);
  }
  // 맨 위(갈 자리 0)에서는 늘리지 않는다(올리기 전 확인 반영) — 내용이 화면에 다 들어가는 큰 화면의 처음 그리기: 늘리면 올림 탓에 문서가 화면보다 1px 길어져 없던 굴림줄이 생긴다
  assert.deepEqual(S({ viewH: 1080, endBottom: 986.2, splitTop: 409, panelTop: 409, panelBottom: 700 }), { to: 0, by: 0, grow: 0 }, "굴린 적이 없고 내용이 화면보다 짧다 → min-height 없음");
  assert.deepEqual(S({ y0: 1, y: 0, viewH: 1080, endBottom: 986.2, splitTop: 409, panelTop: 409, panelBottom: 700 }), { to: 1, by: 0, grow: 655 }, "1px 이라도 굴려 두었으면 그 자리를 지킨다(1 + 1080 − 986.2 = 94.8px 모자란다)");
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
  assert.ok(oct.includes('<div class="dty-cal-w" aria-hidden="true"><span class="sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>'));
  assert.equal((oct.match(/<button type="button" class="dty-cal-c has /g) || []).length, 5, "10월의 당번 날짜 다섯(4·9·11·18·25일)");
  assert.equal((oct.match(/class="dty-cal-c[^"]*"/g) || []).length, 35, "칸은 서른다섯(빈칸 넷 + 31일)");
  assert.ok(oct.includes('<button type="button" class="dty-cal-c has k-need on sun" data-day="2026-10-11" aria-pressed="true" aria-label="10월 11일(일) — 빈 자리 1 · 필요 3명 가운데 2명 채워졌어요"><span>11</span><i aria-hidden="true">2/<wbr>3</i></button>'), "고른 날");
  assert.ok(oct.includes('<button type="button" class="dty-cal-c has k-need hol" data-day="2026-10-09" aria-pressed="false" aria-label="10월 9일(금) — 빈 자리 1 · 필요 2명 가운데 1명 채워졌어요 · 공휴일(한글날)"><span>9</span><i aria-hidden="true">1/<wbr>2</i></button>'),
    "당번이 있는 공휴일 — 칸의 뜻(k-need)은 그대로이고 hol 이 붙는다");
  assert.ok(oct.includes('class="dty-cal-c has k-past sun" data-day="2026-10-04" aria-pressed="false" aria-label="10월 4일(일) — 지난 날 · 필요 2명 가운데 1명 채워졌어요"><span>4</span><i aria-hidden="true">1/<wbr>2</i></button>'), "지난 날");
  assert.ok(oct.includes('class="dty-cal-c has k-off sun" data-day="2026-10-18" aria-pressed="false" aria-label="10월 18일(일) — 쉼"><span>18</span><i aria-hidden="true">쉼</i></button>'), "쉬는 날");
  assert.ok(oct.includes('class="dty-cal-c has k-ask lock sun" data-day="2026-10-25" aria-pressed="false" aria-label="10월 25일(일) — 못 온다 1 · 필요 2명 가운데 2명 채워졌어요 · 확정된 날">' +
    '<span>25</span><i aria-hidden="true">2/<wbr>2</i><em class="wn" aria-hidden="true">⚠</em><em class="lk" aria-hidden="true">🔒</em></button>'), "못 온다는 분 + 확정");
  assert.ok(oct.includes('<span class="dty-cal-c today" aria-current="date"><span>7</span></span>'), "오늘(당번 없는 날)");
  assert.ok(oct.includes('<span class="dty-cal-c hol" title="개천절"><span>3</span></span>') && oct.includes('<span class="dty-cal-c hol" title="대체공휴일"><span>5</span></span>'), "당번이 없는 공휴일도 빨갛게");
  assert.ok(oct.includes('<span class="dty-cal-c"><span>10</span></span>') && oct.includes('<span class="dty-cal-c"><span>6</span></span>'), "토요일·평일은 그대로");
  assert.equal((oct.match(/ hol"/g) || []).length, 3, "10월의 공휴일은 셋(3·5·9일)");
  // 일요일도 빨갛다(친구 결정 2026-10-07 「네 빨갛게」) — 공휴일 표식(hol · 이름)과는 따로인 표식(sun): 날짜 숫자만 빨갛고 칸의 뜻은 그대로다 · 당번이 없는 일요일도
  assert.equal((oct.match(/ sun"/g) || []).length, 4, "10월의 일요일은 넷(4·11·18·25일 — 모두 당번 날)");
  assert.equal(/class="dty-cal-c[^"]* sun[^"]*" title=/.test(oct), false, "일요일에는 이름(title)이 없다 — 이름은 공휴일에만");
  assert.ok(oct.includes('<button type="button" class="btn dty-cal-nav l" data-cal="prev" aria-label="2026년 9월 보기">◀ 9월</button>'));
  assert.ok(oct.includes('<button type="button" class="btn dty-cal-nav r" data-cal="next" aria-label="2026년 11월 보기">11월 ▶</button>'));
  assert.ok(oct.includes('<p class="dty-cal-k">숫자는 채워진 인원 / 필요 인원이에요.<br><span class="ki"><span class="k need" aria-hidden="true"></span>빈 자리가 있는 날</span> · ' +
    '<span class="ki"><span class="wn" aria-hidden="true">⚠</span> 못 온다는 분이 있는 날</span> · <span class="ki">🔒 확정된 날</span> · <span class="ki"><span class="k today" aria-hidden="true"></span>오늘</span><br>' +
    '<span class="hd">빨간 날짜</span>는 일요일과 공휴일이에요(<span class="ki">3일 개천절</span> · <span class="ki">5일 대체공휴일</span> · <span class="ki">9일 한글날</span>).<br>날짜를 누르면 그날의 명단이 보여요.</p>'), "풀이");
  // 오늘이 당번 날이면 단추에 today · aria-current · 「오늘」
  const onDuty = calHtml(DAYS, "2026-10-09", "2026-10-09");
  // 오늘이 **일요일**인 칸 — today 와 sun 이 함께 붙는다(고른 오늘 · 고르지 않은 오늘 · 당번이 없는 오늘). 오늘인 칸에서만 sun 이 빠져도 다른 단언은 모두 통과했다(올리기 전 확인 반영)
  assert.ok(calHtml(DAYS, "2026-10-25", "2026-10-11").includes('class="dty-cal-c has k-need today sun" data-day="2026-10-11" aria-pressed="false" aria-current="date"'), "고르지 않은 오늘(일요일)");
  assert.ok(calHtml(DAYS, "2026-10-11", "2026-10-11").includes('class="dty-cal-c has k-need on today sun" data-day="2026-10-11" aria-pressed="true" aria-current="date"'), "고른 오늘(일요일)");
  assert.ok(calHtml(DAYS, "2026-11-01", "2026-11-15").includes('<span class="dty-cal-c today sun" aria-current="date"><span>15</span></span>'), "당번이 없는 오늘(일요일)");
  assert.ok(onDuty.includes('class="dty-cal-c has k-need on today hol" data-day="2026-10-09" aria-pressed="true" aria-current="date" aria-label="10월 9일(금) — 빈 자리 1 · 필요 2명 가운데 1명 채워졌어요 · 공휴일(한글날) · 오늘"'));
  // 첫 달 — 앞 달이 없으면 「◀ 지난 날」(더 불러올 수 있을 때만) · 마지막 달 — 오른쪽 단추 없음
  const sep = calHtml(DAYS, "2026-09-27", TODAY, { older: true });
  assert.ok(sep.includes('<span class="dty-cal-c sun"><span>6</span></span>') && sep.includes('<span class="dty-cal-c sun"><span>20</span></span>') && sep.includes('class="dty-cal-c has k-past on sun" data-day="2026-09-27"'), "당번이 없는 일요일도 · 지난 날도");
  assert.ok(sep.includes('<button type="button" class="btn dty-cal-nav l" data-act="older" aria-label="지난 날 더 보기">◀ 지난 날</button>') && sep.includes('data-cal="next"') && !sep.includes('data-cal="prev"'));
  assert.ok(calHtml(DAYS, "2026-09-27", TODAY, { older: false }).includes('<div class="dty-cal-h"><span></span><b>2026년 9월</b>'), "52주를 다 불러왔으면 왼쪽 단추가 없다");
  assert.ok(calHtml(DAYS, "2026-09-27", TODAY).includes('<div class="dty-cal-h"><span></span>'), "older 를 안 주면 없다");
  const dec = calHtml(DAYS, "2026-12-25", TODAY, { older: true });
  assert.ok(dec.includes('<b>2026년 12월</b><span></span></div>') && dec.includes('data-cal="prev" aria-label="2026년 11월 보기">◀ 11월'), "마지막 달");
  assert.ok(dec.includes('공휴일이에요(<span class="ki">25일 성탄절</span>).') && dec.includes('class="dty-cal-c has k-need on hol" data-day="2026-12-25"'));
  // 공휴일·오늘이 없는 달에는 그 말이 없다 · 풀이의 표시(빈 자리·⚠·🔒)는 이 당번 전체에서 본다(달마다 풀이가 들쭉날쭉하지 않게)
  const nov = calHtml(DAYS, "2026-11-01", TODAY);
  assert.equal(nov.includes("빨간 날짜"), false, "공휴일이 없는 달에는 그 말이 없다(일요일은 요일 줄의 빨간 「일」이 말한다)"); assert.equal(nov.includes(">오늘<"), false); assert.equal(/ hol"/.test(nov), false);
  assert.equal((nov.match(/ sun"/g) || []).length, 5, "11월의 일요일은 다섯(1·8·15·22·29일) — 당번이 있든 없든");
  // 일요일이면서 공휴일인 날(2027-02-07 설날) — sun 과 hol 이 함께(hol 이 뒤 · 이름은 그대로) · 토요일인 설날(6일)은 hol 만
  const feb = calHtml([day("2027-02-07", [slot(1)], { off: true }), day("2027-02-14", [slot(2)]), day("2027-02-21"), day("2027-02-28")], "2027-02-14", TODAY);
  assert.ok(feb.includes('class="dty-cal-c has k-off sun hol" data-day="2027-02-07" aria-pressed="false" aria-label="2월 7일(일) — 쉼 · 공휴일(설날)"') && feb.includes('<span class="dty-cal-c hol" title="설날"><span>6</span></span>'), "주일인 설날 · 토요일인 설날");
  assert.ok(feb.includes('는 일요일과 공휴일이에요(<span class="ki">6~8일 설날</span> · <span class="ki">9일 대체공휴일</span>).'));
  assert.ok(nov.includes("빈 자리가 있는 날") && nov.includes("못 온다는 분이 있는 날") && nov.includes("🔒 확정된 날"));
  assert.ok(nov.includes('class="dty-cal-c has k-full on sun" data-day="2026-11-01"') && nov.includes('class="dty-cal-c has k-none sun" data-day="2026-11-08" aria-pressed="false" aria-label="11월 8일(일) — 자리 없음"><span>8</span><i aria-hidden="true">–</i>'));
  // 표시가 없는 당번 — 풀이는 누르는 법만
  const plain = calHtml([day("2026-11-08"), day("2026-11-15"), day("2026-11-22"), day("2026-11-29")], "2026-11-08", TODAY);
  assert.ok(plain.includes('<p class="dty-cal-k">날짜를 누르면 그날의 명단이 보여요.</p>'));
  assert.equal(calHtml([], "", TODAY).includes("<button"), false, "날짜가 없으면 누를 것이 없다");
  assert.equal(calHtml(null, null, null).includes("dty-cal-g"), true, "틀린 값에도 죽지 않는다");
  // 인원 글은 「/」 뒤에서 줄을 바꿀 수 있다(<wbr>) — 칸에 한 줄로 못 들 때만 두 줄(「100/120」 · 좁은 폰). 글자는 그대로(낭독의 수도) · 「쉼」·「–」에는 넣을 자리가 없다
  const crowd = (n) => Array.from({ length: n }, (_, i) => who(i + 1));
  const big = calHtml([day("2026-11-08", [slot(1, { capacity: 120, signups: crowd(100) })]), day("2026-11-15", [slot(2)], { off: true }), day("2026-11-22"), day("2026-11-29")], "2026-11-08", TODAY);
  assert.ok(big.includes('class="dty-cal-c has k-need on sun" data-day="2026-11-08" aria-pressed="true" aria-label="11월 8일(일) — 빈 자리 20 · 필요 120명 가운데 100명 채워졌어요"><span>8</span><i aria-hidden="true">100/<wbr>120</i></button>'));
  assert.ok(big.includes('<i aria-hidden="true">쉼</i>') && big.includes('<i aria-hidden="true">–</i>'));
  assert.equal((oct.match(/<wbr>/g) || []).length, 4, "10월 — 수가 적힌 칸마다 하나(4·9·11·25일 · 쉬는 18일에는 없다)");
  // 공휴일 표가 덮지 않는 달 — 풀이가 그렇게 말한다(평일이 빨갛지 않은 것이 「공휴일이 없다」로 읽히지 않게 — 일요일은 그 달에도 빨갛다 · 1년짜리 당번은 표 끝의 한 해 전부터 그 뒤의 달을 보여 준다)
  const far = [day("2028-12-24", [slot(1)]), day("2028-12-31", [slot(2)]), day("2029-01-07", [slot(3)]), day("2029-01-14", [slot(4)])];
  const jan29 = calHtml(far, "2029-01-07", TODAY);
  assert.ok(jan29.includes("<br>이 달은 일요일만 빨갛게 보여요(다른 공휴일은 2028년 12월까지만 표시돼요).<br>날짜를 누르면 그날의 명단이 보여요.</p>"), "표 끝 뒤의 달");
  assert.equal(/ hol"/.test(jan29) || jan29.includes("빨간 날짜"), false, "공휴일 표식은 없다(1월 1일도)");
  assert.equal((jan29.match(/ sun"/g) || []).length, 4, "표 밖의 달에도 일요일은 빨갛다(7·14·21·28일 — 표가 아니라 요일로 본다)");
  const dec28 = calHtml(far, "2028-12-24", TODAY);
  assert.ok(dec28.includes('는 일요일과 공휴일이에요(<span class="ki">25일 성탄절</span>).') && !dec28.includes("일요일만"), "표 안의 마지막 달은 그대로");
  assert.ok(calHtml(DAYS, "2026-09-27", TODAY).includes("<br>이 달은 일요일만 빨갛게 보여요(다른 공휴일은 2026년 10월부터 표시돼요).<br>"), "표가 시작하기 전의 달(지난 날을 더 불러와 본 2026년 9월)");
  assert.equal(nov.includes("일요일만") || oct.includes("일요일만") || nov.includes("표시돼요"), false, "표 안의 달에는 그 말이 없다(공휴일이 없는 11월도)");
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
// 가짜 서버 — from(서버 duty_roster 와 같은 자르기) 뒤의 날짜만 준다. fail 을 켜 두면 명단을 못 읽는다. today = 서버가 말하는 오늘
//   (state.today 를 바꾸면 그 뒤의 답이 새 「오늘」을 말한다 — 화면을 연 채 날이 바뀐 것).
function server(id, all, today = TODAY) {
  const calls = [], state = { fail: false, today };
  const call = async (action, body) => {
    calls.push([action, body]);
    if (action === "dutyBoardList") return { ok: true, scope: "all", today: state.today, boards: [{ id, title: "식당 봉사", status: "open", statusLabel: "받는 중" }] };
    if (action === "dutyRoster") {
      if (state.fail) return { ok: false, error: "network" };
      return { ok: true, chief: true, appOpen: false, today: state.today, staff: [], lines: [{ id: 1, active: true, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, sort: 0 }],
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
    assert.ok(sc.el.innerHTML.includes('class="dty-cal-c has k-past sun" data-day="2026-10-04"') && sc.el.innerHTML.includes('<span>4</span><i aria-hidden="true">1/<wbr>2</i>'), "10월 4일은 처음부터 단추 칸이다(선 분의 수가 보인다)");
    assert.equal(/<span class="dty-cal-c[^"]*"><span>4<\/span><\/span>/.test(sc.el.innerHTML), false, "「당번 없는 날」 칸(맨 숫자)으로 그리지 않는다 — 일요일 표식(sun)이 붙어도");
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
  await withPage(async ({ said }) => {
    // 올리기 전 확인 반영 — 화면을 연 채 날이 바뀐 뒤의 「◀ 지난 날」: **이미 읽은 처음보다 앞 달**이 될 때까지 간다.
    //   10/14 에 열어 7월까지 불러온 탭을 두었다가 11/20 에 돌아왔다(화면이 아는 오늘은 답을 받을 때 바뀐다): 「오늘 − back」의 달(8월)만 보고 4주를 더하면
    //   이미 읽은 7월을 다시 읽고 「더 지난 날짜가 없어요」라고만 한다
    const P = { past: true };
    const all = [day("2026-06-07", [slot(1)], P), day("2026-07-05", [slot(2)], P), day("2026-08-09", [slot(3)], P), day("2026-09-20", [slot(4)], P), day("2026-10-18", [slot(5)]), day("2026-10-25", [slot(6)]), day("2026-11-22", [slot(7)])];
    const sv = server("cal-r", all, "2026-10-14"), sc = screen();
    await render(sc.el, { call: sv.call, query: {} });
    await sc.older();
    assert.deepEqual([sv.froms(), said.textContent], [["2026-09-01", "2026-08-01"], "지난 날짜 1개를 더 불러왔어요"], "10/14: 9월 1일부터 → 「지난 날」 한 번에 8월까지 읽는다(9/2 는 같은 9월이라 한 걸음 더)");
    assert.deepEqual([title(sc.el), chosen(sc.el)], ["2026년 9월", "2026-09-20"], "보던 달(10월)의 앞 달로 간다");
    sv.state.today = "2026-11-20";
    await sc.older();
    assert.deepEqual([sv.froms()[2], chosen(sc.el)], ["2026-07-01", "2026-08-09"], "이번 요청은 아직 옛 오늘(10/14)로 셈한다 — 답을 받으며 오늘이 11/20 이 된다");
    await sc.older();
    assert.deepEqual([sv.froms()[3], title(sc.el), chosen(sc.el), said.textContent], ["2026-06-01", "2026년 7월", "2026-07-05", "지난 날짜 1개를 더 불러왔어요"],
      "11/20 의 「오늘 − 98일」은 8월이지만 이미 7월 1일부터 읽었다 → 6월까지 읽는다(7월을 다시 읽고 「없어요」라고 하지 않는다)");
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
      // 달력을 누르지 않았는데 **보이는 날이 바뀐** 그리기(올리기 전 확인 반영 — 「옮기기」로 다른 날에 · 날짜 더하기 · 서버가 거절해 다시 읽은 때): 굴린 자리를 지키지 않는다.
      //   가짜 화면에서는 달력 칸이 아닌 날짜 단추의 누름이 그 꼴이다(view 없음 + 날이 바뀜 — draw 가 지난번 그린 날과 견준다).
      //   긴 판을 2332 까지 굴렸다 → 짧은 판의 날로 바뀌어 문서가 줄고 브라우저가 1157 로 잘랐다: 그대로 둔다(되돌리고 늘리면 새 판이 화면 위로 사라져 빈 화면만 남는다)
      split.style.minHeight = undefined; win.scrollY = 2332; Object.assign(geo, { splitTop: -1900, panelTop: -1900, panelBottom: 700, docH: 3232 });
      geo.next = { y: 1157, geo: { splitTop: -330, panelTop: 164, panelBottom: 844, docH: 2001 } };
      await sc.pick("2026-11-01", false);
      assert.equal(chosen(sc.el), "2026-11-01", "보이는 날이 바뀌었다");
      assert.deepEqual([jumps, split.style.minHeight, win.scrollY], [[345, 345], undefined, 1157], "굴린 자리로 되돌리지 않고 문서도 늘리지 않는다 — 브라우저가 둔 자리에서 새 판이 보인다");
      // 긴 판 → 긴 판: 새 판의 위가 머리줄 아래 선(64)보다 위에 있으면 그 선까지 올린다(새 날의 판을 위부터 본다)
      win.scrollY = 1500; Object.assign(geo, { splitTop: -1291, panelTop: -800, panelBottom: 1200, docH: 4000 });
      await sc.pick("2026-10-25", false);
      assert.deepEqual([jumps, split.style.minHeight], [[345, 345, 636], undefined], "1500 − 800 − 64 = 636 · 늘리지 않는다");
      // 같은 날을 다시 그리는 것(탭 바꾸기 · 빼기·메모 뒤의 다시 읽기)은 여전히 굴린 자리를 지킨다
      win.scrollY = 900; Object.assign(geo, { splitTop: -691, panelTop: -200, panelBottom: 1800, docH: 4000 });
      await sc.click({ "[data-tab]": { dataset: { tab: "lines" } } }); await sc.click({ "[data-tab]": { dataset: { tab: "roster" } } });
      assert.deepEqual([jumps, win.scrollY], [[345, 345, 636], 900], "같은 날이면 판의 위가 가려 있어도 올리지 않는다(읽던 줄이 그대로 있다)");
    }, { win: { innerHeight: 900, scrollY: 0 }, css: (x) => (x === cal ? { position: "sticky", top: "64px" } : { position: "static", top: "auto" }) });
  }
  // 붙은 달력(PC) + 자판(올리기 전 확인 반영) — 긴 판을 굴린 채 달력의 다른 날에서 Enter: 마우스와 같은 자리(판의 위가 붙은 선에). 초점(붙은 달력 안의 칸)은 문서를 굴려도 제자리라 보정하지 않는다
  {
    const cal = {}, focus = { getBoundingClientRect: () => ({ top: 315, bottom: 367 }) }, geo = { splitTop: 409, panelTop: 409, panelBottom: 3200, docH: 4000 };
    const split = { style: {}, getBoundingClientRect: () => ({ top: geo.splitTop, height: 2800 }), querySelector: (q) => (q === ".dty-cal" ? cal : null) };
    const panel = { getBoundingClientRect: () => ({ top: geo.panelTop, bottom: geo.panelBottom }) };
    for (const detail of [0, 1]) {
      await withPage(async ({ scrolls, jumps, win }) => {
        const sv = server("cal-p" + detail, DAYS), sc = screen({ ".dty-split": split, ".dty-day": panel }, { contains: (x) => x === focus, box: () => ({ bottom: geo.docH - win.scrollY }) });
        Object.assign(geo, { splitTop: 409, panelTop: 409 }); split.style.minHeight = undefined;
        await render(sc.el, { call: sv.call, query: {} });
        win.scrollY = 1610; Object.assign(geo, { splitTop: -1202, panelTop: -1202 });
        await sc.pick("2026-10-25", true, { detail });
        assert.deepEqual([jumps, scrolls, split.style.minHeight], [[344], [], undefined], detail ? "마우스: 판의 위가 붙은 선에(1610 − 1202 − 64)" : "자판(Enter): 마우스와 같은 자리 — 1085 로 튀지 않는다");
        Object.assign(geo, { splitTop: -1202, panelTop: -1202 }); win.scrollY = 1610;
        await sc.pick("2026-10-25", true, { detail });
        assert.deepEqual(jumps, [344, 344], "이미 고른 날을 다시 눌러도 같다");
      }, { win: { innerHeight: 900, scrollY: 0 }, doc: { activeElement: focus }, css: (x) => (x === cal ? { position: "sticky", top: "64px" } : { position: "static", top: "auto" }) });
    }
  }
  // 큰 화면(1080p)의 짧은 명단 — 내용이 화면에 다 들어간다(올리기 전 확인 반영): 처음 그릴 때도 · 달·날짜를 바꿔도 묶음을 늘리지 않는다(늘리면 문서가 화면보다 1px 길어져 없던 굴림줄이 생긴다)
  {
    const cal = {}, split = { style: {}, getBoundingClientRect: () => ({ top: 409, height: 482.4 }), querySelector: (q) => (q === ".dty-cal" ? cal : null) };
    const panel = { getBoundingClientRect: () => ({ top: 409, bottom: 700 }) };
    await withPage(async ({ scrolls, jumps }) => {
      const sv = server("cal-q", DAYS), sc = screen({ ".dty-split": split, ".dty-day": panel }, { box: () => ({ bottom: 986.2 }) });
      await render(sc.el, { call: sv.call, query: {} });
      assert.deepEqual([jumps, scrolls, split.style.minHeight], [[], [], undefined], "처음 그리기 — min-height 없음");
      await sc.nav("next"); await sc.pick("2026-11-08"); await sc.nav("prev");
      assert.deepEqual([jumps, scrolls, split.style.minHeight], [[], [], undefined], "달·날짜를 바꿔도 맨 위에서는 늘리지 않는다");
    }, { win: { innerHeight: 1080, scrollY: 0 }, css: (x) => (x === cal ? { position: "sticky", top: "64px" } : { position: "static", top: "auto" }) });
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

test("명단 화면 — 날·당번이 바뀐 그리기의 잇기: 떼어진 화면은 건드리지 않는다 · 맡은 당번에서 빠져 남은 당번이 열려도(저장 길 안에서) 새 판을 위부터 · 옮긴 줄의 잇기(마지막 확인 반영)", async () => {
  // ① 떼어진 화면 — 명단을 불러오는 사이 다른 메뉴로 옮기면(main.js route 가 section 을 갈아 끼운다) 늦게 온 답이 떼어진 화면에 그린다. 떼어진 요소의 상자는 모두 0 이라,
  //    재면 「새 판의 위가 머리줄 선보다 위」로 읽혀 지금 보이는 다른 메뉴를 64px 올린다 — 재지도 굴리지도 않는다.
  await withPage(async ({ scrolls, jumps, win }) => {
    const zero = { getBoundingClientRect: () => ({ top: 0, bottom: 0, height: 0 }) }, split = { style: {}, ...zero, querySelector: () => null };
    const sv = server("cal-x", DAYS), sc = screen({ ".dty-split": split, ".dty-day": zero }, { box: () => ({ bottom: 0 }) });
    sc.el.isConnected = false;
    await render(sc.el, { call: sv.call, query: {} });   // 늦게 온 처음 그리기 — 그 사이 다른 메뉴를 500 까지 굴려 두었다
    assert.deepEqual([jumps, scrolls, split.style.minHeight, win.scrollY], [[], [], undefined, 500], "떼어진 화면의 처음 그리기는 다른 메뉴를 굴리지 않는다");
    await sc.pick("2026-11-01", false);
    assert.deepEqual([chosen(sc.el), jumps], ["2026-11-01", []], "날이 바뀐 그리기도(「옮기기」 저장 중에 메뉴를 옮긴 때)");
    sc.el.isConnected = true;
    await sc.pick("2026-10-25", false);
    assert.deepEqual(jumps, [436], "붙어 있는 화면이면 같은 값에서 굴린다(500 − 64) — 위 둘이 조용했던 것은 떼어져 있어서다");
  }, { win: { innerHeight: 900, scrollY: 500 } });
  // ② 맡은 당번에서 빠져 남은 당번이 저절로 열림 — 저장 길(once · busy 안) 그대로: 「이 날 확정」을 눌러 확인 창에서 「확정」→ 서버가 not-assigned → 당번 목록부터 다시 →
  //    하나 남은 당번이 열린다. **날은 같고 당번만 바뀐다**(두 당번의 날짜가 같다) — 날만 견주거나, 저장 길에서 「바뀐 그리기」를 놓치면 옛 당번에서 굴려 둔 자리를 지켜 빈 화면이 남는다.
  //    확인 창(core/ui.js dialog)은 가짜 문서가 뜨자마자 「확정」을 누른다.
  {
    const geo = { splitTop: 409, panelTop: 409, panelBottom: 1900, docH: 4000 }, asked = [];
    const split = { style: {}, getBoundingClientRect: () => ({ top: geo.splitTop, height: 1600 }), querySelector: () => null };
    const panel = { getBoundingClientRect: () => ({ top: geo.panelTop, bottom: geo.panelBottom }) };
    const dim = () => { const on = {}, parts = {}; return { className: "", innerHTML: "", remove() {}, addEventListener: (t, fn) => { (on[t] ||= []).push(fn); },
      querySelector: (q) => (parts[q] ||= { textContent: "", hidden: false, innerHTML: "", classList: { add() {} } }),
      press: (v) => { asked.push(parts["h3"].textContent); on.click.forEach((fn) => fn({ target: { closest: () => ({ dataset: { v } }) } })); } }; };
    const doc = { createElement: dim, addEventListener() {}, removeEventListener() {}, body: { appendChild: (x) => { if (x.press) x.press("1"); } } };
    await withPage(async ({ said, scrolls, jumps, win }) => {
      const calls = [], st = { lost: false }, row = (id, title) => ({ id, title, status: "open", statusLabel: "받는 중" });
      const call = async (action, body) => {
        calls.push(action + (body && body.board_id ? ":" + body.board_id : ""));
        if (action === "dutyBoardList") return { ok: true, scope: "assigned", today: TODAY, boards: st.lost ? [row("two-b", "주차 봉사")] : [row("two-a", "식당 봉사"), row("two-b", "주차 봉사")] };
        if (action === "dutyDaySet") { st.lost = true; return { ok: false, error: "not-assigned" }; }
        if (action === "dutyRoster") return st.lost && body.board_id === "two-a" ? { ok: false, error: "not-assigned" } : { ok: true, chief: false, appOpen: false, today: TODAY, staff: [],
          lines: [{ id: 1, active: true, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 2, weekday: 0, sort: 0 }],
          board: { ...row(body.board_id, body.board_id === "two-a" ? "식당 봉사" : "주차 봉사"), openDays: 56, untilDate: "", place: "", contact: "", maxAhead: null }, days: DAYS.filter((d) => d.date >= body.from) };
        return { ok: false, error: "unknown-action" };
      };
      const sc = screen({ ".dty-split": split, ".dty-day": panel }, { box: () => ({ bottom: geo.docH - win.scrollY }) });
      await render(sc.el, { call, query: { b: "two-a" } });
      assert.ok(sc.el.innerHTML.includes("식당 봉사 · 받는 중") && chosen(sc.el) === "2026-10-09", "첫 당번의 10/9");
      win.scrollY = 1500; Object.assign(geo, { splitTop: -1291, panelTop: -800, panelBottom: 1200 });   // 긴 판을 굴려 둔 채
      await sc.click({ "button[data-dact]": { dataset: { dact: "confirm" } } });
      assert.deepEqual(asked, ["🔒 이 날 확정"], "확인 창이 한 번 떴다");
      assert.deepEqual(calls.slice(-3), ["dutyDaySet:two-a", "dutyBoardList", "dutyRoster:two-b"], "거절 → 당번 목록부터 다시 → 남은 당번");
      assert.ok(sc.el.innerHTML.includes("주차 봉사 · 받는 중") && chosen(sc.el) === "2026-10-09", "남은 당번이 열렸다 — 날은 같다(10/9)");
      assert.equal(said.textContent, "맡은 당번이 아니에요 — 목록을 새로 불러올게요");
      assert.deepEqual([jumps, scrolls, split.style.minHeight], [[636], [], undefined], "새 판의 위를 머리줄 선에(1500 − 800 − 64) — 굴린 자리(1500)를 지키지 않고 늘리지도 않는다");
    }, { win: { innerHeight: 900, scrollY: 0 }, doc });
  }
  // ③ 가짜 화면으로 못 일으키는 잇기(고르개가 뜨는 「옮기기」 · 입력 창이 뜨는 날짜 더하기)는 글자로 본다 — 끝까지는 진짜 브라우저에서(CLAUDE.md 「화면 자리를 고치면 다시 잴 길」)
  const src = read("js/menus/duty/roster.js");
  for (const line of ["const key = `${cur.id}|${day}`, moved = drawnKey !== key;", "settleView(y0, view ? { ...view, stuck } : moved ? { moved: true, row } : null);",
    'const want = calFocus, view = calView, row = showRow; calFocus = ""; calView = null; showRow = "";', "if (r.ok) showRow = String(e.id);",
    'await settle(r, r.ok ? movedText(r, e.name) : "", target ? target.date : day);', "await busy(el, () => reload(got.date));", "if (el.isConnected === false) return;",
    'const rr = sid ? rect(el.querySelector(`[data-sid="${sid}"]`)) : null, br = rr ? rect(el.querySelector(".dty-bar")) : null;',
    "rowTop: rr ? rr.top : null, rowBottom: rr ? rr.bottom : null, barH: br ? br.height : null });", "if (lack >= 1 && !moved && sp && sp.style && sr) {"]) assert.ok(src.includes(line), line);
  assert.ok(src.indexOf("if (r.ok) showRow = String(e.id);") < src.indexOf('await settle(r, r.ok ? movedText(r, e.name) : "", target ? target.date : day);'), "표식은 다시 그리기 전에 적는다");
  assert.ok(src.includes('data-sid="${esc(e.id)}"'), "살아 있는 줄은 data-sid 로 찾는다(옮겨도 줄 번호는 그대로 — 성경암송 duty_move 가 같은 줄을 고친다)");
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
  for (const rule of [".dty-cal-c.hol > span{color:var(--error)}", ".dty-cal-c.on.hol > span,.dty-cal-c.on.sun > span{color:var(--danger-bd)}", ".dty-cal-k .hd{color:var(--error);font-weight:700}",
    ".dty-cal-c.sun > span,.dty-cal-w .sun{color:var(--error)}",   // 일요일은 공휴일과 같은 값 — 요일 줄의 「일」도
    ".dty-cal-c.k-need{background:#fff3d6;border-color:var(--gold)}", ".dty-cal-c.k-ask{background:var(--danger-bg);border-color:var(--danger-bd)}",
    ".dty-cal-c.on{background:var(--navy);border-color:var(--navy);color:#fff}", ".dty-cal-c.today{border-color:var(--navy);box-shadow:inset 0 0 0 1px var(--navy)}",   // 오늘 — 2px 로 보이되 상자는 다른 칸과 같다(테두리 1px + 안쪽 그림자 1px)
    "@media (forced-colors:active){.dty-cal-c.today{border-width:2px}}", ".dty-cal-c.on.today{box-shadow:inset 0 0 0 2px var(--gold)}"]) assert.ok(block.includes(rule), rule);
  // 오늘 칸의 상자를 바꾸는 규칙(테두리 굵기·안쪽 여백)은 강제 색 갈래에만 — 테두리를 2px 로 굵히면 오늘 칸만 안쪽이 2px 좁아 「10/12」가 그 칸에서만 두 줄이 되고 숫자가 1px 내려간다(올리기 전 확인 반영)
  const plain = block.replace(/\/\*[\s\S]*?\*\//g, "").replace("@media (forced-colors:active){.dty-cal-c.today{border-width:2px}}", "");
  assert.equal(/\.dty-cal-c[^{}]*\.today[^{}]*\{[^}]*(border-width|border:|padding|margin)/.test(plain), false, "오늘 칸의 상자는 다른 칸과 같다(굵기·여백을 따로 주지 않는다)");
  assert.ok(block.indexOf(".dty-cal-c.on.today{") > block.indexOf(".dty-cal-c.today{"), "고른 오늘(금색 안쪽 테)이 오늘(남색 안쪽 그림자) 뒤에 온다");
  assert.ok(block.indexOf(".dty-cal-c.on{") > block.indexOf(".dty-cal-c.k-ask{") && block.indexOf(".dty-cal-c.on{") > block.indexOf(".dty-cal-c.hol > span{"), "고른 날의 색이 뜻 색·공휴일 색 뒤에 온다(같은 무게라 뒤가 이긴다)");
  // 날짜 숫자(칸 > span)의 색을 정하는 규칙을 차례대로 모아서 본다 — 같은 무게(클래스 둘)의 규칙은 **뒤가 이긴다**:
  //   ① 공휴일·일요일 색 뒤에 오는 숫자 색 규칙은 고른 날(.on) 것뿐이어야 한다(흐린 숫자 규칙이나 새 색 규칙이 그 뒤로 가면 지난·쉬는 일요일·공휴일이 빨갛지 않게 된다)
  //   ② 그 앞의 규칙은 클래스 둘까지(셋으로 무게를 올리면 차례와 상관없이 이긴다). 찾는 글자(닻)로 견주면 그 글자가 바뀔 때 검사가 소리 없이 꺼진다 — indexOf 는 못 찾으면 -1 이다(올리기 전 확인 반영)
  const bare = block.replace(/\/\*[\s\S]*?\*\//g, "");
  const numRules = [...bare.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ parts: m[1].split(",").map((x) => x.trim()).filter((x) => /^\.dty-cal-c[^ ]* > span$/.test(x)), body: m[2] }))
    .filter((r) => r.parts.length && /(^|;)\s*color:/.test(r.body));
  const at = (sel) => numRules.findIndex((r) => r.parts.includes(sel)), iHol = at(".dty-cal-c.hol > span"), iSun = at(".dty-cal-c.sun > span"), iDim = at(".dty-cal-c.k-past > span");
  assert.ok(iHol >= 0 && iSun >= 0 && iDim >= 0 && numRules.length >= 5, `숫자 색 규칙을 찾았다(공휴일 ${iHol} · 일요일 ${iSun} · 흐린 숫자 ${iDim} · 모두 ${numRules.length})`);
  assert.ok(iDim < Math.min(iHol, iSun), "지난 날·쉬는 날의 흐린 숫자 규칙이 공휴일·일요일 색 앞에 온다");
  numRules.forEach((r, i) => r.parts.forEach((sel) => {
    const red = sel === ".dty-cal-c.hol > span" || sel === ".dty-cal-c.sun > span", on = sel.includes(".on"), classes = (sel.match(/\./g) || []).length;
    if (i > Math.min(iHol, iSun) && !red) assert.ok(on, `${sel} — 공휴일·일요일 색 뒤에 오는 숫자 색 규칙은 고른 날(.on) 것뿐이어야 한다`);
    if (!on) assert.ok(classes <= 2, `${sel} — 고른 날이 아닌 숫자 색 규칙은 클래스 둘까지(무게를 올리면 일요일·공휴일 색을 이긴다)`);
  }));
  assert.ok(block.includes(".dty-cal-w span{") && block.indexOf(".dty-cal-c.sun > span,.dty-cal-w .sun{") > 0, "요일 줄의 「일」은 무게로 이긴다(.dty-cal-w .sun 이 .dty-cal-w span 보다 무겁다 — 차례와 무관)");
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
  // 물려받는 nowrap 도 걸지 않는다 — 달력 상자·격자·칸에 걸면 인원 글이 물려받는다. 크롬은 nowrap 아래에서도 <wbr> 에서 줄을 바꿔 크롬 탐침은 지나가지만
  //   사파리·파이어폭스에서는 「100/120」이 다시 칸을 넘친다(올리기 전 확인이 세 엔진으로 잰 것). 달 제목·달 단추·풀이 조각(.dty-cal-h b · .dty-cal-nav · .ki)의 nowrap 은 괜찮다
  const inherits = /\.dty-cal(-g|-c)?(?![-\w])[^{}]*\{[^}]*nowrap/;
  assert.equal(inherits.test(block), false, "달력 상자·격자·칸에 nowrap 을 걸지 않는다(인원 글이 물려받는다)");
  for (const bad of [".dty-cal-c{white-space:nowrap}", ".dty-cal-c.has{display:grid;white-space:nowrap}", ".dty-cal-g{white-space:nowrap}", ".dty-cal{white-space:nowrap}", ".dty-cal-c.k-need > i{white-space:nowrap}"]) assert.ok(inherits.test(bad), bad);
  for (const fine of [".dty-cal-h b{white-space:nowrap}", ".dty-cal-nav{white-space:nowrap}", ".dty-cal-k .ki{white-space:nowrap}"]) assert.equal(inherits.test(fine), false, fine);
  // ⚠ 는 첫 열·🔒 는 둘째 열 — 열을 못 박지 않으면 빈 띠(::before)가 첫 줄의 두 열을 다 차지해 기호가 셋째 열로 밀리고 숫자가 옆으로 치우친다
  assert.ok(block.includes(".dty-cal-c > em.wn{grid-column:1;justify-self:start;") && block.includes(".dty-cal-c > em.lk{grid-column:2;justify-self:end;"), "기호의 열");
  // 인원 글에 음수 여백을 주지 않는다 — 테두리까지 쓰게 하면 글씨를 키운 브라우저(최소 글꼴 14~16px)에서 ⚠·🔒 가 함께 붙은 칸의 글이 칸 밖으로 나간다(올리기 전 확인이 잰 것)
  assert.equal(/\.dty-cal-c[^{}]*> i\{[^}]*margin[^;}]*-\d/.test(block), false, "인원 글에 음수 여백 없음");
  assert.ok(/\.dty-cal-c\.has\{display:grid;grid-template-columns:1fr 1fr;align-content:start;/.test(block), "단추 칸은 세 줄(기호 띠 · 숫자 · 인원)");
  const size = (sel) => block.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{[^}]*\\}"))[0].match(/font-size:[^;}]+/)[0];
  assert.equal(size(".dty-cal-c > em"), size(".dty-cal-c.has::before"), "빈 띠와 기호가 같은 글꼴 크기 — 기호가 없는 칸도 같은 높이를 비운다");
  // 달력 + 그날 판의 묶음 — 폰에서는 flow-root(끝 자리의 아래 여백이 묶음 밖으로 새면, 묶음을 늘려 화면 자리를 지킬 때 그만큼 어긋난다) · PC 규칙(두 칸)이 그 뒤에 온다
  assert.ok(block.includes(".dty-split{display:flow-root}") && css.indexOf(".dty-split{display:flow-root}") < css.indexOf(".dty-split{display:grid;"), "묶음은 flow-root → PC 에서 grid");
  assert.equal(/\.dty-cal-c[^{}]*\{[^}]*overflow:hidden/.test(block), false, "칸을 잘라 내지 않는다(넘친 수가 잘리면 「00/12」처럼 틀린 수로 읽힌다)");
  assert.ok(block.indexOf(".dty-cal-c.on > span,.dty-cal-c.on > i,.dty-cal-c.on > em.wn{color:#fff}") > block.indexOf(".dty-cal-c > em.wn{"), "고른 날의 흰 ⚠ 가 붉은 ⚠ 뒤에 온다");
});
