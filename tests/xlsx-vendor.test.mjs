// 저장소에 넣은 SheetJS 빌드가 두 화면의 읽기를 그대로 해내는지 — 네트워크 없이(FE-6 · 2026-09-30).
// 브라우저처럼 <script> 한 벌을 전역에서 돌려 window.XLSX 대신 전역 XLSX 를 받는다(vm.runInThisContext — 같은 realm 이라 Date 도 같다).
// 파일은 같은 판으로 **여기서 써서** 읽는다(표 파일은 명단 검사가 막으니 저장소에 두지 않는다).
// 한국 시간대로 돈다 — 0.18.5 는 한국에서 엑셀 날짜 칸을 하루 앞으로 읽었다(1899년 서울 지방시 +8:27:52 가 섞였다).
process.env.TZ = "Asia/Seoul";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { XLSX_VERSION, XLSX_FILE } from "../js/core/xlsx.js";
import { sheetText, parseSheet } from "../js/menus/bibleevent/upload-logic.js";
import { mpCell } from "../js/menus/ministry/paper.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
runInThisContext(readFileSync(path.join(ROOT, XLSX_FILE), "utf8"), { filename: XLSX_FILE });
const X = globalThis.XLSX;

// 두 화면이 파일을 읽는 방법 그대로(upload.js readFile · paper.js handleFile) — 「명단」 시트가 있으면 그것부터
function readLikeScreens(bytes) {
  const u8 = new Uint8Array(bytes);
  const wb = X.read(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), { type: "array", cellDates: true });
  const sheet = wb.SheetNames.indexOf("명단") >= 0 ? "명단" : wb.SheetNames[0];
  return X.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, raw: true });
}

// 안내 시트가 앞, 「명단」 시트가 뒤 — 이름·소속은 한글, 신청일 하나는 진짜 날짜 칸(엑셀 일련번호 + 날짜 서식), 하나는 글자
function sampleBook() {
  const ws = X.utils.aoa_to_sheet([
    ["교구", "목장", "이름", "직분", "휴대폰", "사역팀", "부서(선택)", "하위 선택(선택)", "신청일(선택)", "임명일(선택)", "상태(선택)", "사유(취소일 때)"],
    ["1교구", "3목장", "가나다", "집사", "", "찬양팀", "", "", 46371, "2026-12-20", "임명", ""],
    ["2교구", "", "라마바", "", "", "안내팀", "", "", "", "", "취소", "이사, 전출"],
    ["↑ 위 줄은 예시예요", "", "", "", "", "", "", "", "", "", "", ""],
  ]);
  ws.I2.z = "yyyy-mm-dd";
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["적는 법"], ["이 시트는 읽지 않아요"]]), "적는 법");
  X.utils.book_append_sheet(wb, ws, "명단");
  return wb;
}

test("판 — 전역 XLSX 가 생기고 판이 js/core/xlsx.js 와 같다", () => {
  assert.equal(typeof X?.read, "function");
  assert.equal(X.version, XLSX_VERSION);
});

for (const bookType of ["xlsx", "biff8"]) {
  const ext = bookType === "xlsx" ? ".xlsx" : ".xls";
  test(`${ext} — 같은 판으로 쓴 파일을 두 화면처럼 읽는다(「명단」 시트 · 한글 · 날짜 칸 2026-12-15 그대로)`, () => {
    const rows = readLikeScreens(X.write(sampleBook(), { type: "array", bookType }));
    // 📋 종이 명단(paper.js) — mpCell 로 다듬은 줄
    const cells = rows.map((r) => (r || []).map(mpCell));
    assert.deepEqual(cells[0].slice(0, 3), ["교구", "목장", "이름"]);
    assert.deepEqual(cells[1].slice(0, 11), ["1교구", "3목장", "가나다", "집사", "", "찬양팀", "", "", "2026-12-15", "2026-12-20", "임명"]);
    assert.equal(cells[2][11], "이사, 전출");
    assert.ok(rows[1][8] instanceof Date, "날짜 칸은 Date 로 온다(cellDates)");
    // 📤 명단 올리기(upload.js) — sheetText → parseSheet(「교구 · 목장 · 이름 · 직분」 차례 · 머리글·↑ 줄은 버린다)
    assert.equal(sheetText(rows).split("\n")[1].split("\t")[8], "2026-12-15");
    assert.deepEqual(parseSheet(sheetText(rows), "gmnp"), [
      { gu: "1교구", mok: "3목장", name: "가나다", pos: "집사" },
      { gu: "2교구", mok: "", name: "라마바", pos: "" },
    ]);
  });
}

test("CSV — UTF-8(BOM) 바이트를 파일처럼(arrayBuffer · type:array) 주면 따옴표 안 쉼표·한글·빈 칸을 읽는다", () => {
  const csv = "﻿이름,교구,목장,직분\n가나다,1교구,3목장,집사\n\"라마, 바\",2교구,,권사\n";
  const u8 = new TextEncoder().encode(csv);
  const wb = X.read(u8.buffer, { type: "array" });
  const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, raw: false, defval: "" });
  assert.deepEqual(rows, [["이름", "교구", "목장", "직분"], ["가나다", "1교구", "3목장", "집사"], ["라마, 바", "2교구", "", "권사"]]);
});
