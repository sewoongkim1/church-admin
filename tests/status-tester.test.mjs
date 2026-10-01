// 신청 현황의 🧪 시험 딱지(2026-10-01) — 시험 참여자(app_config.ministryTesters)의 신청을 진짜 신청과 가른다.
// 서버 ministryList 가 줄마다 tester 를 싣고, 화면은 카드·표·사람별 묶음 머리에 딱지를 붙인다. 찾기 「시험」은 시험 신청만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardHtml, tableHtml, groupsHtml } from "../js/menus/ministry/status-ui.js";
import { filterRows } from "../js/menus/ministry/status-logic.js";

const ROW = (o = {}) => ({ id: 7, at: "2026-10-01", who: "화평 20목장", name: "홍길동", church: null, status: "신청완료", canPush: false,
  notified_at: null, phone: "010-0000-0000", position: "집사", note: "", source: "app", committee: "제자양육부", team: "신앙운동",
  option: "", tester: false, ...o });
const has = (h) => h.includes("🧪");

test("카드 — 시험 참여자의 신청에만 🧪 시험(건별·사역별 카드) · 사람별 카드는 머리에 있으니 뺀다", () => {
  assert.equal(has(cardHtml(ROW({ tester: true }))), true);
  assert.equal(has(cardHtml(ROW())), false);
  assert.equal(has(cardHtml(ROW({ tester: true }), "team")), true);
  assert.equal(has(cardHtml(ROW({ tester: true }), "person")), false);
});

test("PC 표 — 시험 줄에만", () => {
  const h = tableHtml([ROW({ id: 1, tester: true }), ROW({ id: 2, name: "김철수" })], new Map());
  assert.equal((h.match(/🧪/g) || []).length, 1);
});

test("사람별 묶음 머리 — 그분 신청 중 하나라도 시험이면 머리에 딱지", () => {
  const h = groupsHtml([ROW({ id: 1, tester: true }), ROW({ id: 2, team: "찬양" })], "person", new Set(), new Map());
  const head = h.slice(h.indexOf("<summary"), h.indexOf("</summary>"));
  assert.equal(has(head), true);
  const h2 = groupsHtml([ROW({ id: 1 })], "person", new Set(), new Map());
  assert.equal(has(h2.slice(h2.indexOf("<summary"), h2.indexOf("</summary>"))), false);
});

test("찾기 「시험」 — 시험 참여자의 신청만 걸린다", () => {
  const rows = [ROW({ id: 1, name: "가", tester: true }), ROW({ id: 2, name: "나" })];
  assert.deepEqual(filterRows(rows, { stOn: [], range: "all", q: "시험" }).map((r) => r.name), ["가"]);
  assert.deepEqual(filterRows(rows, { stOn: [], range: "all", q: "" }).map((r) => r.name), ["가", "나"]);
});
