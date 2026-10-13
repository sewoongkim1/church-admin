// 📣 알림 현황 · 🩺 시스템 상태 글자(js/menus/memorize/status-format.js) — 2026-10-13
import { test } from "node:test";
import assert from "node:assert/strict";
import { pushModeLabel, pushWhen, kstShort, monitorText, monitorRows } from "../js/menus/memorize/status-format.js";

test("발송 종류는 한글 · 모르는 것은 그대로", () => {
  assert.equal(pushModeLabel("daily"), "아침 알림");
  assert.equal(pushModeLabel("weekly-verse"), "주일 말씀 알림");
  assert.equal(pushModeLabel("duty-applied"), "봉사 당번 — 지원");
  assert.equal(pushModeLabel("edu-first-day"), "교육 — 첫날 알림");
  assert.equal(pushModeLabel("new-kind"), "new-kind");
  assert.equal(pushModeLabel(""), "발송");
});

test("발송 이력 시각은 sent_at(push_log) — created_at 은 대신", () => {
  const t = "2026-10-12T23:00:02.371Z";   // 한국 10/13 08:00
  assert.match(pushWhen({ sent_at: t }), /10\. 13\./);
  assert.match(pushWhen({ sent_at: t }), /8:00/);
  assert.equal(pushWhen({ created_at: t }), pushWhen({ sent_at: t }));
  assert.equal(pushWhen({}), "");
  assert.equal(kstShort("엉뚱한 값"), "");
});

test("시스템 상태 — 칸마다 읽는 글", () => {
  assert.equal(monitorText("db", "up"), "정상");
  assert.equal(monitorText("subscribers", 34), "34대");
  assert.equal(monitorText("songToday", true), "정해졌어요");
  assert.equal(monitorText("latestVerseDate", null), "기록 없음");
  assert.match(monitorText("todayPush", { sent: 3, failed: 0, total: 3, sent_at: "2026-10-12T23:00:02Z" }), /^보냄 3 · 실패 0 · 대상 3 · 10\. 13\./);
  assert.match(monitorText("weeklyReportLastRun", { status: "succeeded", startTime: "2026-10-08T23:00:00Z" }), /^성공 · 10\. 9\./);
  assert.equal(monitorText("activity", { logRows: 199655, aggRows: 3861, aggSum: 199655 }), "기록 199,655줄 · 집계 합 199,655(맞음) · 집계 3,861줄");
  assert.match(monitorText("activity", { logRows: 10, aggRows: 1, aggSum: 9 }), /어긋남/);
  assert.match(monitorText("monitorWatch", { state: "ok", at: "2026-10-13T03:00:00Z" }), /^정상 · 10\. 13\./);
  assert.match(monitorText("dutyRemind", { day: "2026-10-13", sent: 0, missed: 0, runs: 2, at: "2026-10-12T10:20:00Z", off: true }), /2026-10-13 몫 · 보냄 0 · 놓침 0 · 2번 실행 · .* · 꺼 둠$/);
});

test("모르는 칸은 이름 그대로 + JSON · ok/problems/error 는 빼고", () => {
  const rows = monitorRows({ ok: true, problems: [], newThing: { a: 1 }, db: "up" });
  assert.deepEqual(rows, [{ label: "newThing", text: '{"a":1}' }, { label: "데이터베이스", text: "정상" }]);
});
