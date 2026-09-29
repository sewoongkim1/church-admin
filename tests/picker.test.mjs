// 공용 고르개(js/core/picker.js)의 순수 도우미 — 달력 칸·시각 목록·글자·자리 잡기.
// DOM 을 쓰는 부분(pickOne·pickMany·pickDate·pickTime)은 여기서 시험하지 않는다(브라우저에서 본다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { monthGrid, timeSlots, fmtDateLabel, fmtTimeLabel, hourLabel, kstToday, addMonth, placePopover }
  from "../js/core/picker.js";

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
