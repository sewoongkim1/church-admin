import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHash } from "../js/core/router.js";

test("parseHash", () => {
  assert.deepEqual(parseHash(""), { menu: "", sub: "", query: {} });
  assert.deepEqual(parseHash("#/"), { menu: "", sub: "", query: {} });
  assert.deepEqual(parseHash("#/members"), { menu: "members", sub: "", query: {} });
  assert.deepEqual(parseHash("#/ministry/list?view=people&q=%EA%B9%80"),
    { menu: "ministry", sub: "list", query: { view: "people", q: "김" } });
});
