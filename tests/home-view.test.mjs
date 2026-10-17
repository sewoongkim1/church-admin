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
test("메뉴마다 선 아이콘(core/icons.js MENU_ICON) · 줄 끝 › — 메뉴를 더하면 그림도 한 줄(2026-10-17 성경앱 스타일)", async () => {
  const { MENUS } = await import("../js/menus/registry.js");
  const { MENU_ICON, ICON } = await import("../js/core/icons.js");
  const missing = MENUS.filter((m) => !MENU_ICON[m.id]).map((m) => m.id);
  assert.deepEqual(missing, [], "그림이 없는 메뉴");
  for (const [id, name] of Object.entries(MENU_ICON)) assert.ok(ICON[name], `${id} → ${name} 그림이 없다`);
  const h = homeHtml({ member, rolesInfo: [], roles: ["super"], menus: menusFor(["super"]) });
  assert.equal((h.match(/class="hc-chev"/g) || []).length, (h.match(/home-card/g) || []).length);
  assert.equal((h.match(/<svg /g) || []).length, (h.match(/<svg [^>]*width="20" height="20"/g) || []).length, "그림마다 크기를 박는다(CSS 가 옛것이어도 화면 가득 커지지 않게)");
});
test("super 는 모든 묶음 · 빈 상태 두 글", () => {
  const h = homeHtml({ member, rolesInfo: [], roles: ["super"], menus: menusFor(["super"]) });
  assert.equal((h.match(/class="home-grid"/g) || []).length, 9);
  assert.equal((h.match(/class="home-group"/g) || []).length, 9);
  assert.ok(homeHtml({ member, roles: ["x"], menus: [] }).includes("곧 열려요"));
  assert.ok(homeHtml({ member, roles: [], menus: [] }).includes("역할을 받아"));
});
