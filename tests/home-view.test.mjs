import { test } from "node:test";
import assert from "node:assert/strict";
import { homeHtml } from "../js/home-view.js";
import { menusFor } from "../js/menus/registry.js";

const member = { name: "<b>김</b>", type: "교구", gu: "화평", mok: "20" };
test("권한 메뉴를 대분류 구역으로 나누고 이름은 이스케이프", () => {
  const h = homeHtml({ member, rolesInfo: [{ label: "교육 총괄" }], roles: ["education"], menus: menusFor(["education"]) });
  assert.equal((h.match(/class="home-grid"/g) || []).length, 1);
  assert.equal((h.match(/class="home-group"/g) || []).length, 1);
  assert.equal((h.match(/class="home-g"/g) || []).length, 1);
  assert.equal((h.match(/home-card/g) || []).length, 5);   // 강좌 관리 · 신청 현황 · 출석부 · 수료 · 교육 통계(4단계 C)
  assert.ok(!h.includes("<b>김</b>") && h.includes("&lt;b&gt;김"));
  assert.ok(h.includes("화평 20목장 · 교육 총괄"));
});
test("super 는 모든 묶음 · 빈 상태 두 글", () => {
  const h = homeHtml({ member, rolesInfo: [], roles: ["super"], menus: menusFor(["super"]) });
  assert.equal((h.match(/class="home-grid"/g) || []).length, 8);
  assert.equal((h.match(/class="home-group"/g) || []).length, 8);
  assert.ok(homeHtml({ member, roles: ["x"], menus: [] }).includes("곧 열려요"));
  assert.ok(homeHtml({ member, roles: [], menus: [] }).includes("역할을 받아"));
});
