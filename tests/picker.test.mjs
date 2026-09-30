// 공용 고르개(js/core/picker.js)의 순수 도우미 — 달력 칸·시각 목록·글자·자리 잡기.
// DOM 을 쓰는 부분(pickOne·pickMany·pickDate·pickTime)은 여기서 시험하지 않는다(브라우저에서 본다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthGrid, timeSlots, fmtDateLabel, fmtTimeLabel, hourLabel, kstToday, addMonth, placePopover, dayAllowed,
  popHeight, POP_MAX_H, calStart, timeColumns, shiftTime, timeScrollTarget } from "../js/core/picker.js";

test("monthGrid — 일요일 시작 · 앞뒤 빈칸 · 한 주 7칸", () => {
  // 2026년 9월 1일은 화요일
  const g = monthGrid(2026, 9);
  assert.equal(g.length, 5);
  assert.deepEqual(g[0], [null, null, 1, 2, 3, 4, 5]);
  assert.deepEqual(g[4], [27, 28, 29, 30, null, null, null]);
  g.forEach((w) => assert.equal(w.length, 7));
});

test("monthGrid — 딱 4주(2026년 2월 · 1일이 일요일)와 6주(2026년 8월 · 1일이 토요일)", () => {
  const feb = monthGrid(2026, 2);
  assert.equal(feb.length, 4);
  assert.deepEqual(feb[0], [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(feb[3], [22, 23, 24, 25, 26, 27, 28]);
  const aug = monthGrid(2026, 8);
  assert.equal(aug.length, 6);
  assert.deepEqual(aug[0], [null, null, null, null, null, null, 1]);
  assert.deepEqual(aug[5], [30, 31, null, null, null, null, null]);
});

test("monthGrid — 윤년 2월은 29일까지 · 어느 달도 6주를 넘지 않는다", () => {
  const g = monthGrid(2028, 2);
  assert.equal(Math.max(...g.flat().filter(Boolean)), 29);
  for (let y = 2024; y <= 2030; y++) for (let m = 1; m <= 12; m++) {
    const w = monthGrid(y, m);
    assert.ok(w.length >= 4 && w.length <= 6, `${y}-${m}`);
    assert.ok(w[0].some(Boolean) && w[w.length - 1].some(Boolean), `${y}-${m} 빈 주`);
  }
});

test("addMonth — 해를 넘긴다", () => {
  assert.deepEqual(addMonth(2026, 12, 1), [2027, 1]);
  assert.deepEqual(addMonth(2026, 1, -1), [2025, 12]);
  assert.deepEqual(addMonth(2026, 9, 1), [2026, 10]);
});

test("timeSlots — 시 24개 · 분은 step 간격", () => {
  const t = timeSlots(5);
  assert.equal(t.hours.length, 24);
  assert.equal(t.hours[0], "00");
  assert.equal(t.hours[23], "23");
  assert.deepEqual(t.minutes, ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]);
  assert.deepEqual(timeSlots(15).minutes, ["00", "15", "30", "45"]);
  assert.equal(timeSlots(0).minutes.length, 60);   // 잘못된 값이면 1분 간격
});

test("fmtDateLabel — 「9월 29일 (화)」", () => {
  assert.equal(fmtDateLabel("2026-09-29"), "9월 29일 (화)");
  assert.equal(fmtDateLabel("2026-10-04"), "10월 4일 (일)");
  assert.equal(fmtDateLabel(""), "");
  assert.equal(fmtDateLabel("nope"), "");
  // 없는 날은 빈 글자 — 2월 30일 · 윤년이 아닌 해의 2월 29일
  assert.equal(fmtDateLabel("2026-02-30"), "");
  assert.equal(fmtDateLabel("2027-02-29"), "");
  assert.equal(fmtDateLabel("2028-02-29"), "2월 29일 (화)");
});

test("fmtTimeLabel — 「오전 9:05」 · 자정·정오", () => {
  assert.equal(fmtTimeLabel("09:05"), "오전 9:05");
  assert.equal(fmtTimeLabel("13:30"), "오후 1:30");
  assert.equal(fmtTimeLabel("12:00"), "오후 12:00");
  assert.equal(fmtTimeLabel("00:10"), "오전 12:10");
  assert.equal(fmtTimeLabel("9:5"), "");
  assert.equal(fmtTimeLabel(""), "");
  assert.equal(fmtTimeLabel("25:00"), "");
});

test("hourLabel — 「오전 9시」", () => {
  assert.equal(hourLabel("09"), "오전 9시");
  assert.equal(hourLabel("00"), "오전 12시");
  assert.equal(hourLabel("12"), "오후 12시");
  assert.equal(hourLabel("18"), "오후 6시");
});

test("kstToday — 한국 시각 기준 오늘", () => {
  assert.equal(kstToday(new Date("2026-09-28T15:30:00Z")), "2026-09-29");   // 한국은 이미 29일 0시 30분
  assert.equal(kstToday(new Date("2026-09-28T14:59:00Z")), "2026-09-28");
  // 해·달 넘김
  assert.equal(kstToday(new Date("2026-12-31T15:00:00Z")), "2027-01-01");
  assert.equal(kstToday(new Date("2026-09-30T15:00:00Z")), "2026-10-01");
});

test("dayAllowed — 기간 고르기: 시작일보다 앞선 끝날 · 끝날보다 뒤의 시작일은 막는다", () => {
  assert.equal(dayAllowed("2026-09-15", "", ""), true);
  assert.equal(dayAllowed("2026-09-01", "2026-09-01", ""), true);    // 같은 날은 된다
  assert.equal(dayAllowed("2026-08-31", "2026-09-01", ""), false);
  assert.equal(dayAllowed("2026-09-30", "", "2026-09-29"), false);
  assert.equal(dayAllowed("2026-09-29", "", "2026-09-29"), true);
  assert.equal(dayAllowed("2026-09-10", "2026-09-01", "2026-09-29"), true);
  assert.equal(dayAllowed("2026-09-10", "nope", ""), true);           // 이상한 한계는 없는 것으로
});

test("placePopover — 단추 아래 · 밑이 모자라면 위로 · 오른쪽이 넘치면 안쪽으로", () => {
  const vp = { width: 1200, height: 800 };
  // 넉넉한 자리 — 단추 바로 아래, 왼쪽 맞춤
  assert.deepEqual(placePopover({ left: 100, top: 100, bottom: 144, right: 300 }, { width: 280, height: 300 }, vp),
    { left: 100, top: 150 });
  // 밑이 모자라다 → 단추 위
  assert.deepEqual(placePopover({ left: 100, top: 600, bottom: 644, right: 300 }, { width: 280, height: 300 }, vp),
    { left: 100, top: 294 });
  // 오른쪽이 넘친다 → 화면 안쪽(8px 여백)
  assert.deepEqual(placePopover({ left: 1100, top: 100, bottom: 144, right: 1180 }, { width: 280, height: 300 }, vp),
    { left: 912, top: 150 });
  // 위도 아래도 모자라다 → 넓은 쪽(아래 462px)에 두고 높이를 줄인다
  assert.deepEqual(placePopover({ left: 10, top: 200, bottom: 244, right: 100 }, { width: 280, height: 700 }, { width: 400, height: 720 }),
    { left: 10, top: 250, maxHeight: 462 });
  // 위가 더 넓다 → 위 여백에 붙이고 높이를 줄인다(단추를 덮지 않는다)
  assert.deepEqual(placePopover({ left: 10, top: 438, bottom: 482, right: 400 }, { width: 340, height: 435 }, { width: 1280, height: 800 }),
    { left: 10, top: 8, maxHeight: 424 });
  // 어느 쪽도 240px 이 안 된다 → 화면 안으로 올려 덮는다
  assert.deepEqual(placePopover({ left: 10, top: 150, bottom: 194, right: 100 }, { width: 280, height: 300 }, { width: 400, height: 400 }),
    { left: 10, top: 92 });
});

test("popHeight — 판 높이는 CSS 상한(480px)·화면 높이-16 으로 자른다", () => {
  assert.equal(POP_MAX_H, 480);
  assert.equal(popHeight(100, 200, 900), 300);          // 넉넉하면 제 키
  assert.equal(popHeight(100, 900, 900), 480);          // 긴 목록 — 480 에서 멈춘다
  assert.equal(popHeight(100, 900, 400), 384);          // 낮은 화면 — 화면-16
  assert.equal(popHeight(0, 0, 10), 0);
});

test("popHeight + placePopover — 긴 목록을 단추 위에 붙여도 틈이 없다(2바퀴 지적 ⑥)", () => {
  // 단추가 화면 아래쪽(top 700) · 목록 제 키 900(자르기 전) → 자르면 480, 위 자리(686)에 들어간다
  const a = { left: 20, top: 700, bottom: 744, right: 300 };
  const vp = { width: 1366, height: 900 };
  const h = popHeight(120, 780, vp.height);
  const r = placePopover(a, { width: 300, height: h }, vp);
  assert.equal(h, 480);
  assert.equal(r.maxHeight, undefined);
  assert.equal(r.top + h, a.top - 6);                   // 판 아래 끝이 단추 위 6px 에 딱 붙는다
});

test("calStart — 처음 보여 줄 달: 지금 값 → 오늘 → min → max", () => {
  const today = "2026-09-29";
  assert.deepEqual(calStart({ value: "2026-03-15", today }), [2026, 3]);                        // 지금 값
  assert.deepEqual(calStart({ value: "", today }), [2026, 9]);                                    // 오늘
  assert.deepEqual(calStart({ value: "nope", today }), [2026, 9]);                                // 이상한 값은 없는 것
  assert.deepEqual(calStart({ today, min: "2026-11-02" }), [2026, 11]);                           // 오늘이 시작일 앞 → min
  assert.deepEqual(calStart({ today, max: "2026-07-31" }), [2026, 7]);                            // 오늘이 끝날 뒤 → max
  assert.deepEqual(calStart({ today, min: "2026-09-01", max: "2026-10-31" }), [2026, 9]);         // 기간 안이면 오늘
  assert.deepEqual(calStart({ value: "2025-12-25", today, min: "2026-11-02" }), [2025, 12]);      // 지금 값이 늘 먼저
  assert.deepEqual(calStart({ today, min: "bad", max: "2026-07-31" }), [2026, 7]);                // 이상한 min 은 없는 것
});

test("timeColumns — 간격에 안 맞는 지금 값(09:07)은 분 목록에 끼운다", () => {
  const a = timeColumns(5, "09:07");
  assert.equal(a.h, "09");
  assert.equal(a.mi, "07");
  assert.deepEqual(a.minutes.slice(0, 4), ["00", "05", "07", "10"]);
  assert.equal(a.minutes.length, 13);
  const b = timeColumns(5, "09:30");                    // 맞는 값은 그대로
  assert.equal(b.minutes.length, 12);
  const c = timeColumns(15, "");                        // 빈 값
  assert.equal(c.h, "");
  assert.equal(c.mi, "");
  assert.deepEqual(c.minutes, ["00", "15", "30", "45"]);
  assert.equal(timeColumns(5, "9:07").h, "");           // 꼴이 아니면 빈 값
  assert.equal(timeColumns(15, "23:59").minutes.at(-1), "59");
});

test("shiftTime — 한 시간 앞뒤 · 하루 밖으로 안 나간다", () => {
  assert.equal(shiftTime("09:30", 60), "10:30");
  assert.equal(shiftTime("10:30", -60), "09:30");
  assert.equal(shiftTime("23:30", 60), "23:59");
  assert.equal(shiftTime("00:20", -60), "00:00");
  assert.equal(shiftTime("", 60), "");
  assert.equal(shiftTime("9:30", 60), "");
});

test("timeScrollTarget — 지금 값 → near → 오전 9시", () => {
  const minutes = timeSlots(5).minutes;
  assert.deepEqual(timeScrollTarget({ h: "14", mi: "05", minutes, near: "10:30" }), { h: "14", m: "05" });   // 지금 값이 먼저
  assert.deepEqual(timeScrollTarget({ minutes, near: "10:30" }), { h: "10", m: "30" });                      // 끝 시각 = 시작+1시간
  assert.deepEqual(timeScrollTarget({ minutes, near: "10:32" }), { h: "10", m: "30" });                      // 가장 가까운 칸
  assert.deepEqual(timeScrollTarget({ minutes: ["00", "15", "30", "45"], near: "10:50" }), { h: "10", m: "45" });
  assert.deepEqual(timeScrollTarget({ minutes, near: "" }), { h: "09", m: "00" });
  assert.deepEqual(timeScrollTarget({ minutes, near: "bad" }), { h: "09", m: "00" });
});

// ---------- 콤보 작은 지적 C(2026-09-30 · 리뷰 3d5fa47 M-2) ----------
import * as picker from "../js/core/picker.js";
import { readFileSync } from "node:fs";
test("pickOne wrap — 긴 선택지(회차 제목 전체)면 판에 pk-wrap · 안 주면 전과 같은 pk-one(다른 부르는 곳 그대로 · M-2)", () => {
  assert.equal(typeof picker.oneCls, "function", "picker.js 가 oneCls 를 내보내야 한다");
  assert.equal(picker.oneCls(), "pk-one");
  assert.equal(picker.oneCls(false), "pk-one");
  assert.equal(picker.oneCls(true), "pk-one pk-wrap");
});
test("pk-wrap CSS — PC 작은 판만 너비 상한 640px(누른 단추가 더 넓으면 단추 너비 — min-width 가 이긴다) · 글은 띄어쓰기에서 줄바꿈 · 폰 시트·기본 판 규칙은 그대로(M-2)", () => {
  // 윈도 checkout(core.autocrlf)이면 CRLF — 줄 끝을 \n 으로 맞춘 뒤 줄마다 본다
  const css = readFileSync(new URL("../css/admin.css", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(css.includes(".pk-dim.pop .pk.pk-wrap{max-width:min(640px,calc(100vw - 16px))}"), "PC 판 너비 상한");
  assert.match(css, /\.pk-dim\.pop \.pk-wrap \.pk-opt\{padding-block:8px\}/, "여러 줄이 되면 위아래 여백");
  assert.match(css, /\.pk-dim\.pop \.pk-wrap \.pk-opt-t\{word-break:keep-all;overflow-wrap:anywhere\}/, "한글은 띄어쓰기에서 · 띄어쓰기 없는 긴 글만 anywhere");
  // 기본 판(다른 고르개) 규칙은 한 글자도 그대로
  assert.ok(css.includes(".pk-dim.pop .pk{position:fixed;max-width:calc(100vw - 16px);max-height:min(480px,calc(100vh - 16px));"));
  // pk-wrap 규칙은 모두 PC 판(.pk-dim.pop) 안에만 — 폰 바텀 시트는 전과 같다
  const rules = css.split("\n").filter((l) => /^[^/ ].*\.pk-wrap/.test(l));
  assert.ok(rules.length >= 3, rules.join("\n"));
  for (const l of rules) assert.ok(l.startsWith(".pk-dim.pop "), l);
});
test("placePopover — 너비 상한이 붙으면 판이 콤보 왼쪽에 맞는다(1024px · 콤보 597 · 전엔 898 이라 옆 메뉴 위로 밀렸다 · M-2)", () => {
  const combo = { left: 272, top: 124, bottom: 206, right: 869 };
  const vp = { width: 1024, height: 800 };
  const wide = placePopover(combo, { width: 898, height: 203 }, vp);           // 전: 한 줄 너비 그대로
  assert.ok(wide.left < 240, "전에는 옆 메뉴(240px) 위까지 밀렸다");
  const capped = Math.max(597, Math.min(898, 640));                           // min-width(단추) · max-width(640)
  assert.equal(capped, 640);
  assert.deepEqual(placePopover(combo, { width: capped, height: 260 }, vp), { left: 272, top: 212 });
  // 1280px · 콤보 720 — 판 = 콤보 너비(720) 로 딱 맞는다
  assert.equal(Math.max(720, Math.min(891, 640)), 720);
  assert.deepEqual(placePopover({ left: 272, top: 124, bottom: 184, right: 992 }, { width: 720, height: 260 }, { width: 1280, height: 860 }),
    { left: 272, top: 190 });
});
