import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { MENUS, menusFor } from "../js/menus/registry.js";
import { knownRoles } from "../supabase/functions/church-admin/authz.ts";

test("메뉴 역할은 서버가 아는 역할", () => {
  for (const m of MENUS) assert.ok(knownRoles().includes(m.role), `${m.id}: ${m.role}`);
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

test("menusFor — super 는 전부, 역할 없으면 없음", () => {
  assert.equal(menusFor([]).length, 0);
  assert.equal(menusFor(undefined).length, 0);
  assert.equal(menusFor(["super"]).length, MENUS.length);
  assert.equal(menusFor(["ministry"]).length, MENUS.filter((m) => m.role === "ministry").length);
});
