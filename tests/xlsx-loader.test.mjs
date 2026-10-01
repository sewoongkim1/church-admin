// 엑셀 읽는 도구(SheetJS) 한 곳 — js/core/xlsx.js 의 판·파일·integrity 가 저장소에 넣은 파일과 맞는지,
// 두 화면(📤 명단 올리기 · 📋 종이 명단 올리기)이 그 한 곳만 부르는지, 못 받으면 no-cdn·no-xlsx 로 끝나는지(FE-6 · 2026-09-30).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import {
  XLSX_VERSION, XLSX_FILE, XLSX_INTEGRITY, XLSX_SOURCE, xlsxUrl, loadXlsx,
} from "../js/core/xlsx.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

test("판 — 0.20.2 이상(CVE-2023-30533 은 0.19.3 · CVE-2024-22363 은 0.20.2 에서 고쳐졌다)", () => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(XLSX_VERSION);
  assert.ok(m, "판은 0.20.3 꼴");
  const [maj, min, pat] = m.slice(1).map(Number);
  assert.ok(maj > 0 || min > 20 || (min === 20 && pat >= 2), `0.20.2 이상이어야 한다 — ${XLSX_VERSION}`);
});

test("파일 — vendor/xlsx-<판>.full.min.js 가 저장소에 있고 머리에 같은 판이 적혀 있다", () => {
  assert.equal(XLSX_FILE, `vendor/xlsx-${XLSX_VERSION}.full.min.js`);
  assert.ok(existsSync(path.join(ROOT, XLSX_FILE)), XLSX_FILE + " 이 없다");
  const text = read(XLSX_FILE);
  assert.ok(text.startsWith("/*! xlsx.js (C) 2013-present SheetJS"), "SheetJS 빌드가 아니다");
  assert.ok(text.includes(`"${XLSX_VERSION}"`), "파일 안의 판이 다르다");
  assert.ok(!/sourceMappingURL/.test(text), "지도 파일(.map)을 부르지 않는다 — 함께 넣지 않았다");
});

test("integrity — 저장소 파일의 sha384 와 같다(파일만 바꾸고 값을 안 바꾸면 여기서 막힌다)", () => {
  const got = "sha384-" + createHash("sha384").update(readFileSync(path.join(ROOT, XLSX_FILE))).digest("base64");
  assert.equal(XLSX_INTEGRITY, got);
});

test("받은 곳 — cdn.sheetjs.com 의 같은 판 주소(주석이 아니라 값으로 남겨 둔다)", () => {
  assert.equal(XLSX_SOURCE, `https://cdn.sheetjs.com/xlsx-${XLSX_VERSION}/package/dist/xlsx.full.min.js`);
});

test("라이선스 — Apache-2.0 전문을 함께 싣는다(파일을 나눠 줄 때의 조건)", () => {
  const lic = read("vendor/SHEETJS-LICENSE");
  assert.ok(/Apache License\s+Version 2\.0/.test(lic));
});

test("xlsxUrl — 모듈 주소(?v= 해시가 붙어도)에서 사이트 뿌리의 vendor/ 로 푼다", () => {
  assert.equal(xlsxUrl("https://admin.onlybible.kr/js/core/xlsx.js?v=0123456789"),
    `https://admin.onlybible.kr/vendor/xlsx-${XLSX_VERSION}.full.min.js`);
  assert.equal(xlsxUrl("http://localhost:8881/js/core/xlsx.js"),
    `http://localhost:8881/vendor/xlsx-${XLSX_VERSION}.full.min.js`);
  // 하위 경로에 올려도(github.io/church-admin/) 뿌리를 넘지 않는다
  assert.equal(xlsxUrl("https://example.github.io/church-admin/js/core/xlsx.js"),
    `https://example.github.io/church-admin/vendor/xlsx-${XLSX_VERSION}.full.min.js`);
  // 기본값(이 모듈 자신의 주소) — 저장소의 그 파일을 가리킨다
  assert.equal(xlsxUrl(), pathToFileURL(path.join(ROOT, XLSX_FILE)).href);
});

test("배포 — deploy.yml 이 vendor 를 _site 로 복사한다(빠지면 운영에서 404 → 엑셀을 못 읽는다)", () => {
  const cp = read(".github/workflows/deploy.yml").split("\n").find((l) => /\bcp -r\b.*_site\/?\s*$/.test(l));
  assert.ok(cp, "cp 줄이 없다");
  assert.ok(/\svendor\s/.test(cp + " "), "cp 목록에 vendor 가 없다 — " + cp.trim());
});

test("두 화면이 한 곳만 부른다 — 사본 loadXlsx·옛 CDN 주소(jsdelivr xlsx)가 js/ 어디에도 없다(loadxlsx-copy)", () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") && files.push(p); } };
  walk(path.join(ROOT, "js"));
  for (const f of files) {
    const t = readFileSync(f, "utf8"), rel = path.relative(ROOT, f).replace(/\\/g, "/");
    assert.ok(!/https:\/\/cdn\.jsdelivr\.net\/npm\/xlsx/.test(t) && !/\bXLSX_CDN\b/.test(t), rel + " 에 옛 CDN 주소가 남았다");
    if (rel !== "js/core/xlsx.js") assert.ok(!/function\s+loadXlsx\b/.test(t), rel + " 에 loadXlsx 사본이 있다");
  }
  for (const rel of ["js/menus/bibleevent/upload.js", "js/menus/ministry/paper.js", "js/menus/ministry/history.js"]) {
    assert.match(read(rel), /import \{ loadXlsx \} from "\.\.\/\.\.\/core\/xlsx\.js";/, rel + " 이 core/xlsx.js 를 부르지 않는다");
  }
});

// ── loadXlsx — 문서·창을 흉내 내어 <script> 모양과 못 받았을 때의 까닭(no-cdn·no-xlsx)을 본다 ──
function fakeDom() {
  const added = [];
  globalThis.window = {};
  globalThis.document = {
    createElement: (tag) => ({ tag }),
    head: { appendChild: (s) => { added.push(s); return s; } },
  };
  return added;
}
function restore() { delete globalThis.window; delete globalThis.document; }

test("loadXlsx — <script> 에 저장소 파일 주소·integrity·crossorigin 을 단다", async () => {
  const added = fakeDom();
  try {
    const p = loadXlsx();
    assert.equal(added.length, 1);
    const s = added[0];
    assert.equal(s.tag, "script");
    assert.equal(s.src, xlsxUrl());
    assert.equal(s.integrity, XLSX_INTEGRITY);
    assert.equal(s.crossOrigin, "anonymous");
    window.XLSX = { version: XLSX_VERSION };
    s.onload();
    assert.equal((await p).version, XLSX_VERSION);
    // 한 번 받은 뒤에는 다시 부르지 않는다
    assert.equal((await loadXlsx()).version, XLSX_VERSION);
    assert.equal(added.length, 1);
  } finally { restore(); }
});

test("loadXlsx — 못 받으면(망 막힘·integrity 어긋남) no-cdn · 받았는데 XLSX 가 없으면 no-xlsx", async () => {
  let added = fakeDom();
  try {
    const p = loadXlsx();
    added[0].onerror();
    await assert.rejects(p, { message: "no-cdn" });
  } finally { restore(); }
  added = fakeDom();
  try {
    const p = loadXlsx();
    added[0].onload();
    await assert.rejects(p, { message: "no-xlsx" });
  } finally { restore(); }
});
