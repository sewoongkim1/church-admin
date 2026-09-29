import { test } from "node:test";
import assert from "node:assert/strict";
import { findLeaks, PHONE_LIMIT } from "../tools/leak-scan.mjs";

// 번호는 여기서 만들어 쓴다 — 이 파일 자체가 검사에 걸리지 않게
const phones = (n) => Array.from({ length: n }, (_, i) => `010-5${String(i).padStart(3, "0")}-4321`).join("\n");

test("서로 다른 휴대폰 번호가 스무 개 넘게 든 글 파일은 걸린다", () => {
  const out = findLeaks([{ path: "notes/list.md", text: phones(PHONE_LIMIT) }]);
  assert.equal(out.length, 1);
  assert.match(out[0], /notes\/list\.md/);
});

test("스무 개 아래거나 같은 번호를 되풀이한 시험 파일은 안 걸린다", () => {
  assert.deepEqual(findLeaks([{ path: "tests/a.mjs", text: phones(PHONE_LIMIT - 1) }]), []);
  assert.deepEqual(findLeaks([{ path: "tests/b.mjs", text: "010-0000-0000\n".repeat(200) }]), []);
});

test("표 파일(xls·xlsx·csv)은 빈 양식 말고는 걸린다", () => {
  assert.equal(findLeaks([{ path: "files/사역명단_올리기_양식.xlsx", text: null }]).length, 0);
  assert.equal(findLeaks([{ path: "교인목록.xls", text: null }]).length, 1);
  assert.equal(findLeaks([{ path: "out/명단.CSV", text: "" }]).length, 1);
});

test("그림처럼 글이 아닌 파일(text=null)은 넘어간다", () => {
  assert.deepEqual(findLeaks([{ path: "img/og-admin.png", text: null }]), []);
});
