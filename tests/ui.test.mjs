import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, affiliation, kstTime, errorText, dialog } from "../js/core/ui.js";

test("esc", () => assert.equal(esc(`<a href="x">'&`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;"));

test("affiliation — 「화평 20목장」·「중등부 3학년」", () => {
  assert.equal(affiliation({ type: "교구", gu: "화평", mok: "20" }), "화평 20목장");
  assert.equal(affiliation({ type: "교구", gu: "화평", mok: "20목장" }), "화평 20목장");
  assert.equal(affiliation({ type: "교회학교", bu: "중등부", grade: "3학년" }), "중등부 3학년");
  assert.equal(affiliation(null), "");
});

test("kstTime — 한국 시각", () => {
  assert.equal(kstTime("2026-09-28T05:05:00Z"), "2026.09.28 14:05");
  assert.equal(kstTime(""), "");
  assert.equal(kstTime("nope"), "");
});

test("errorText — 코드는 괄호로 덧붙인다", () => {
  assert.equal(errorText({ error: "forbidden" }), "이 메뉴를 쓸 권한이 없어요");
  assert.equal(errorText({ error: "server", code: "42P01" }), "서버에서 문제가 생겼어요 (42P01)");
  assert.equal(errorText({ error: "???" }), "처리하지 못했어요");
});

// dialog 는 DOM 을 쓴다 — 여기는 DOM 이 없으니 querySelector 가 고른 이름마다 가짜 요소를 돌려주는 작은 흉내로 잰다
function withFakeDom(fn) {
  const mk = () => {
    const cl = new Set();
    const q = {};
    return { hidden: false, textContent: "", innerHTML: "", addEventListener() {}, remove() {},
      classList: { add: (...c) => c.forEach((x) => cl.add(x)), has: (c) => cl.has(c), size: () => cl.size },
      querySelector: (sel) => (q[sel] ||= mk()) };
  };
  const dims = [];
  const old = globalThis.document;
  globalThis.document = { createElement: () => mk(), addEventListener() {}, removeEventListener() {},
    body: { appendChild: (d) => dims.push(d) } };
  try { return fn(dims); } finally { if (old === undefined) delete globalThis.document; else globalThis.document = old; }
}

test("dialog — cls 는 .dlg 에 클래스로 · 빈 제목이면 h3 를 숨긴다 · 기존 호출은 그대로", () => withFakeDom((dims) => {
  dialog({ title: "", html: "<p>본문</p>", ok: "닫기", cancel: null, cls: "pd  pd-x" });
  const a = dims[0];
  assert.equal(a.querySelector(".dlg").classList.has("pd"), true);
  assert.equal(a.querySelector(".dlg").classList.has("pd-x"), true);
  assert.equal(a.querySelector(".dlg").classList.size(), 2);
  assert.equal(a.querySelector("h3").hidden, true);
  dialog({ title: "지울까요?", text: "되돌릴 수 없어요" });
  const b = dims[1];
  assert.equal(b.querySelector(".dlg").classList.size(), 0);
  assert.equal(b.querySelector("h3").hidden, false);
  assert.equal(b.querySelector("h3").textContent, "지울까요?");
  assert.equal(b.querySelector(".body").textContent, "되돌릴 수 없어요");
}));
