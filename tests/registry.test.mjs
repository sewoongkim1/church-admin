import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { MENUS, menusFor, menuRoles, GROUP_ICON, menuGroups } from "../js/menus/registry.js";
import { knownRoles } from "../supabase/functions/church-admin/authz.ts";

test("메뉴 역할은 서버가 아는 역할 — 메뉴마다 하나 이상", () => {
  for (const m of MENUS) {
    const rs = menuRoles(m);
    assert.ok(rs.length > 0, `${m.id}: 역할 없음`);
    for (const r of rs) assert.ok(knownRoles().includes(r), `${m.id}: ${r}`);
  }
});

test("menuRoles — roles 배열 · role 배열 · role 글자 하나", () => {
  assert.deepEqual(menuRoles({ roles: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(menuRoles({ role: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(menuRoles({ role: "a" }), ["a"]);
  assert.deepEqual(menuRoles({}), []);
});

test("메뉴 id 는 겹치지 않고 주소에 쓸 수 있다", () => {
  const ids = MENUS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9-]*$/);
});

test("메뉴 모듈 파일이 있다", () => {
  for (const m of MENUS) {
    const p = String(m.load).match(/import\(["'](.+?)["']\)/)[1];
    assert.ok(existsSync(new URL(p, new URL("../js/menus/", import.meta.url))), `${m.id}: ${p}`);
  }
});

test("묶음 차례 — 교인명부가 맨 위(친구 2026-09-30) · 사역신청 · 성경필사(암송) · 교육 · 시스템", () => {
  assert.deepEqual([...new Set(MENUS.map((m) => m.group))], ["교인명부", "사역신청", "성경필사(암송)", "교육", "시스템"]);
  // 한 묶음의 메뉴는 붙어 있다 — 왼쪽 메뉴·처음 화면이 묶음 머리 아래 모아 보인다
  const seen = [];
  for (const m of MENUS) { if (seen.at(-1) !== m.group) seen.push(m.group); }
  assert.equal(seen.length, new Set(seen).size);
});

test("묶음(대분류)마다 아이콘이 있다", () => {
  for (const g of new Set(MENUS.map((m) => m.group))) assert.ok(GROUP_ICON[g], `${g}: 아이콘 없음`);
});

test("menuGroups — 받은 메뉴만 묶음 차례대로 · 빈 묶음은 없다", () => {
  const gs = menuGroups(menusFor(["super"]));
  assert.deepEqual(gs.map((g) => g.group), ["교인명부", "사역신청", "성경필사(암송)", "교육", "시스템"]);
  assert.equal(gs[0].icon, GROUP_ICON["교인명부"]);
  assert.deepEqual(gs[0].menus.map((m) => m.id), MENUS.filter((m) => m.group === "교인명부").map((m) => m.id));
  const be = menuGroups(menusFor(["bibleevent"]));
  assert.deepEqual(be.map((g) => g.group), ["성경필사(암송)"]);
  assert.deepEqual(menuGroups([]), []);
});

test("menusFor — super 는 전부, 역할 없으면 없음", () => {
  assert.equal(menusFor([]).length, 0);
  assert.equal(menusFor(undefined).length, 0);
  assert.equal(menusFor(["super"]).length, MENUS.length);
  assert.equal(menusFor(["ministry"]).length, MENUS.filter((m) => menuRoles(m).includes("ministry")).length);
});

test("교육 묶음 — 강좌 관리(교육 총괄만) 다음에 신청 현황(교육 총괄·교육 담당) 다음에 출석부(교육 총괄·교육 담당·강사) 다음에 수료(교육 총괄·교육 담당) 다음에 교육 통계(교육 총괄만 · 맨 끝)", () => {
  const edu = MENUS.filter((m) => m.group === "교육");
  assert.deepEqual(edu.map((m) => m.id), ["edu-courses", "edu-enroll", "edu-attend", "edu-cert", "edu-stats"]);
  assert.deepEqual(edu.map((m) => m.label), ["강좌 관리", "신청 현황", "출석부", "수료", "교육 통계"]);
  assert.deepEqual(edu.map((m) => m.icon), ["📚", "📝", "✅", "🎓", "📊"]);
  assert.deepEqual(menuRoles(edu[0]), ["education"]);
  assert.deepEqual([...menuRoles(edu[1])].sort(), ["education", "educourse"]);
  assert.deepEqual([...menuRoles(edu[2])].sort(), ["education", "educourse", "teacher"]);
  assert.deepEqual([...menuRoles(edu[3])].sort(), ["education", "educourse"]);
  assert.deepEqual(menuRoles(edu[4]), ["education"]);
  assert.deepEqual(menusFor(["education"]).map((m) => m.id), ["edu-courses", "edu-enroll", "edu-attend", "edu-cert", "edu-stats"]);
  // 교육 담당(맡은 강좌)은 신청 현황·출석부·수료 — 강좌 관리·교육 통계는 안 보인다(서버도 eduCourseSave·eduStats 를 forbidden 으로 막는다)
  assert.deepEqual(menusFor(["educourse"]).map((m) => m.id), ["edu-enroll", "edu-attend", "edu-cert"]);
  assert.deepEqual(menuGroups(menusFor(["educourse"])).map((g) => g.group), ["교육"]);
  assert.deepEqual(menusFor(["ministry", "educourse"]).filter((m) => m.group === "교육").map((m) => m.id), ["edu-enroll", "edu-attend", "edu-cert"]);
  // 강사는 출석부만 — 신청 현황(이름·상태·교재비·메모)도 수료(확정·번호·인쇄)도 교육 통계도 안 보인다(서버도 eduEnrollList·eduCert*·eduStats 를 forbidden 으로 막는다)
  assert.deepEqual(menusFor(["teacher"]).map((m) => m.id), ["edu-attend"]);
  assert.deepEqual(menuGroups(menusFor(["teacher"])).map((g) => g.group), ["교육"]);
  // 교인명부 역할은 교육 묶음이 없다(🎓 교육 탭은 「자세히」 창 안에서 본다 — 메뉴가 아니다)
  assert.deepEqual(menusFor(["directory"]).filter((m) => m.group === "교육").map((m) => m.id), []);
  assert.equal(GROUP_ICON["교육"], "🎓");
});
