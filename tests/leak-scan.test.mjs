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

test("띄어 쓰거나 점을 찍은 휴대폰 번호도 센다", () => {
  const spaced = Array.from({ length: PHONE_LIMIT }, (_, i) => `010 5${String(i).padStart(3, "0")} 4321`).join("\n");
  const dotted = Array.from({ length: PHONE_LIMIT }, (_, i) => `010.5${String(i).padStart(3, "0")}.4321`).join("\n");
  assert.equal(findLeaks([{ path: "notes/a.md", text: spaced }]).length, 1);
  assert.equal(findLeaks([{ path: "notes/b.md", text: dotted }]).length, 1);
  // 더 긴 숫자 줄의 한가운데는 번호가 아니다
  const long = Array.from({ length: PHONE_LIMIT }, (_, i) => `9010-5${String(i).padStart(3, "0")}-43219`).join("\n");
  assert.deepEqual(findLeaks([{ path: "notes/c.md", text: long }]), []);
});

test("사진 파일(jpg·photos 폴더)은 걸린다 — 교인 사진은 <교인ID>.jpg 로 받는다", () => {
  assert.equal(findLeaks([{ path: "990000001.jpg", text: null }]).length, 1);
  assert.equal(findLeaks([{ path: "x/사진.JPEG", text: null }]).length, 1);
  assert.equal(findLeaks([{ path: "work/photos/a.webp", text: null }]).length, 1);
  assert.deepEqual(findLeaks([{ path: "img/og-admin.png", text: null }]), []);
});
