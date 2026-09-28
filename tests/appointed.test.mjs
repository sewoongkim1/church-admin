import { test } from "node:test";
import assert from "node:assert/strict";
import { whoShort, label, guOf, mokOf, filterRows, csvText } from "../js/menus/ministry/appointed.js";

const R = (o) => ({ name: "", who: "", committee: "", team: "", option: "", at: "", decided_at: null, source: "app", ...o });

test("사람은 「김세웅-화평20」 한 가지 꼴", () => {
  assert.equal(whoShort("화평 20목장"), "화평20");
  assert.equal(whoShort("유년부 3학년"), "유년부3학년");
  assert.equal(label(R({ name: "김세웅", who: "화평 20목장" })), "김세웅-화평20");
  assert.equal(label(R({ who: "화평 20목장" })), "이름 없음-화평20");
});

test("교구·목장 뽑기", () => {
  assert.equal(guOf(R({ who: "화평 20목장" })), "화평");
  assert.equal(guOf(R({ who: "" })), "그 밖");
  assert.equal(mokOf(R({ who: "화평 20목장" })), 20);
  assert.equal(mokOf(R({ who: "화평 남성목장" })), 9999);
});

test("찾기는 이름·소속·사역팀·부서·표시 어디에 걸려도", () => {
  const rows = [R({ name: "김세웅", who: "화평 20목장", committee: "찬양부", team: "할렐루야찬양대" }),
                R({ name: "이영희", who: "믿음 3목장", committee: "전도부", team: "행복전도대" })];
  assert.equal(filterRows(rows, "").length, 2);
  assert.equal(filterRows(rows, "할렐").length, 1);
  assert.equal(filterRows(rows, "믿음").length, 1);
  assert.equal(filterRows(rows, "김세웅-화평20").length, 1);
  assert.equal(filterRows(rows, "전도").length, 1);
});

test("CSV — BOM · 머리글 · 따옴표 이스케이프 · 부서→사역팀→이름 차례 · 종이/앱", () => {
  const csv = csvText([
    R({ name: "이영희", who: "믿음 3목장", committee: "전도부", team: "행복전도대", at: "2026-09-17", decided_at: "2026-09-18T01:00:00Z", source: "paper" }),
    R({ name: '김"세웅', who: "화평 20목장", committee: "찬양부", team: "할렐루야찬양대", option: "1부", at: "2026-09-16" }),
  ]);
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], '"표시","이름","소속","교구","부서","사역팀","하위 선택","신청일","임명일","들어온 길"');
  assert.ok(lines[1].startsWith('"이영희-믿음3","이영희"'));          // 가나다: 전도부(ㅈ)가 찬양부(ㅊ)보다 먼저
  assert.ok(lines[1].endsWith('"2026-09-17","2026-09-18","종이"'));   // 임명일은 한국 날짜
  assert.ok(lines[2].startsWith('"김""세웅-화평20","김""세웅"'));     // 따옴표는 두 번
  assert.ok(lines[2].endsWith('"2026-09-16","","앱"'));
});
