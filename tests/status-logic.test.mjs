import { test } from "node:test";
import assert from "node:assert/strict";
import { STATES, SHORT, kstToday, rangeDates, filterRows, personKey, teamKey, dupMap, dupOthers, teamCounts, statusCounts, phoneClearCount }
  from "../js/menus/ministry/status-logic.js";

const R = (o) => ({ id: 1, name: "", who: "", position: "", committee: "", team: "", option: "", status: "신청완료", at: "2026-09-20", phone: "", ...o });
const NOW = new Date("2026-09-28T03:00:00Z");   // 한국 12시

test("상태·짧은 이름", () => {
  assert.deepEqual(STATES, ["신청완료", "접수완료", "임명확정", "취소"]);
  assert.equal(SHORT["임명확정"], "임명");
});

test("신청일 범위 — 한국 날짜", () => {
  assert.equal(kstToday(new Date("2026-09-27T16:00:00Z")), "2026-09-28");
  assert.deepEqual(rangeDates("all", "", "", NOW), ["", ""]);
  assert.deepEqual(rangeDates("today", "", "", NOW), ["2026-09-28", "2026-09-28"]);
  assert.deepEqual(rangeDates("7d", "", "", NOW), ["2026-09-22", "2026-09-28"]);
  assert.deepEqual(rangeDates("custom", "2026-09-01", "2026-09-10", NOW), ["2026-09-01", "2026-09-10"]);
});

test("거르기 — 상태(비면 전체) · 신청일 · 찾기 다섯 칸", () => {
  const rows = [R({ id: 1, name: "김철수", who: "화평 20목장", position: "집사", committee: "찬양부", team: "할렐루야", status: "신청완료", at: "2026-09-27" }),
                R({ id: 2, name: "이영희", who: "믿음 3목장", committee: "전도부", team: "행복전도대", status: "임명확정", at: "2026-09-10" })];
  const f = (o) => filterRows(rows, { stOn: [], range: "all", from: "", to: "", q: "", ...o }, NOW).map((r) => r.id);
  assert.deepEqual(f({}), [1, 2]);
  assert.deepEqual(f({ stOn: ["신청완료"] }), [1]);
  assert.deepEqual(f({ range: "7d" }), [1]);
  assert.deepEqual(f({ q: "집사" }), [1]);
  assert.deepEqual(f({ q: "전도" }), [2]);
  assert.deepEqual(f({ q: "믿음" }), [2]);
});

test("열쇠", () => {
  assert.equal(personKey(R({ name: "김철수", who: "화평 20목장" })), "김철수/화평 20목장");
  assert.equal(teamKey(R({ committee: "찬양부", team: "할렐루야" })), "찬양부 · 할렐루야");
});

test("같은 번호 — 명단 전체로 · 같은 이름이면 「소속」, 다르면 「사람」 · 숫자만 비교", () => {
  const all = [R({ id: 1, name: "김철수", who: "화평 20목장", phone: "010-1111-2222" }),
               R({ id: 2, name: "김철수", who: "사랑 1목장", phone: "01011112222" }),
               R({ id: 3, name: "김영희", who: "화평 20목장", phone: "010 1111 2222" }),
               R({ id: 4, name: "박민수", who: "믿음 3목장", phone: "" })];
  const m = dupMap(all);
  assert.equal(m.size, 1);
  const o = dupOthers(m, all[0]);
  assert.deepEqual(o.map((x) => x.kind).sort(), ["사람", "소속"]);
  assert.equal(o.find((x) => x.kind === "소속").label, "사랑 1목장");
  assert.equal(o.find((x) => x.kind === "사람").label, "김영희 · 화평 20목장");
  assert.deepEqual(dupOthers(m, all[3]), []);
  assert.deepEqual(dupOthers(m, [all[0], all[1]]).map((x) => x.kind), ["사람"]);   // 묶음(사람별)은 자기 둘을 빼고
});

test("팀별 수(많은 순) · 상태별 수", () => {
  const rows = [R({ committee: "찬양부", team: "A" }), R({ committee: "찬양부", team: "A" }), R({ committee: "전도부", team: "B", status: "취소" })];
  assert.deepEqual(teamCounts(rows), [["찬양부 · A", 2], ["전도부 · B", 1]]);
  assert.deepEqual(statusCounts(rows), { 신청완료: 2, 접수완료: 0, 임명확정: 0, 취소: 1 });
});

test("phoneClearCount — 결정된(임명·미채택·취소) 신청 가운데 번호가 남은 것(서버 ministryPhoneClear 와 같은 셈)", () => {
  const rows = [{ status: "임명확정", phone: "010-0000-0001" }, { status: "취소", phone: "" }, { status: "접수완료", phone: "010-0000-0002" },
    { status: "미채택", phone: "x" }, { status: "취소", phone: "010-0000-0003" }, { status: "신청완료", phone: "" }];
  assert.equal(phoneClearCount(rows), 3);
  assert.equal(phoneClearCount([]), 0);
  assert.equal(phoneClearCount(null), 0);
});
