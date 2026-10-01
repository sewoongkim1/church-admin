// 📋 종이 명단 — CSV 읽기(2026-10-01). 원문은 쉼표로만 나누고 UTF-8 로만 읽었다:
// 「"이사, 전출"」이 「"이사」로 잘려 뒤 칸이 밀렸고, 한국어 엑셀의 「CSV(쉼표로 분리)」(EUC-KR)는 한글이 깨졌다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mpSplit, mpCsvLines, mpParse } from "../js/menus/ministry/paper.js";

// 가짜 이름 · 한 줄 = 12칸(교구…사유)
const LINE = '믿음,3,가나다,집사,010-1111-2222,찬양팀,,,,,취소,"이사, 전출"';
const HEAD = "교구,목장,이름,직분,휴대폰,사역팀,부서(선택),하위 선택(선택),신청일(선택),임명일(선택),상태(선택),사유(취소일 때)";
// LINE 을 cp949(EUC-KR)로 — 한국어 엑셀이 「CSV(쉼표로 분리)」로 저장한 꼴
const EUCKR = Uint8Array.from([0xb9,0xcf,0xc0,0xbd,0x2c,0x33,0x2c,0xb0,0xa1,0xb3,0xaa,0xb4,0xd9,0x2c,0xc1,0xfd,0xbb,0xe7,0x2c,
  0x30,0x31,0x30,0x2d,0x31,0x31,0x31,0x31,0x2d,0x32,0x32,0x32,0x32,0x2c,0xc2,0xf9,0xbe,0xe7,0xc6,0xc0,0x2c,0x2c,0x2c,0x2c,0x2c,
  0xc3,0xeb,0xbc,0xd2,0x2c,0x22,0xc0,0xcc,0xbb,0xe7,0x2c,0x20,0xc0,0xfc,0xc3,0xe2,0x22]);

test("mpSplit — 따옴표 안 쉼표는 한 칸 · 겉 따옴표·「\"\"」 · 탭 줄", () => {
  const c = mpSplit(LINE);
  assert.equal(c.length, 12);
  assert.equal(c[10], "취소");
  assert.equal(c[11], "이사, 전출");
  assert.deepEqual(mpSplit('a,"그는 ""네""라고",c'), ["a", '그는 "네"라고', "c"]);
  assert.deepEqual(mpSplit(" 믿음 \t 3 \t 가나다 "), ["믿음", "3", "가나다"]);
  assert.deepEqual(mpSplit("믿음\t이사, 전출"), ["믿음", "이사, 전출"], "탭 줄의 쉼표는 나누지 않는다");
});

test("mpCsvLines — UTF-8(BOM) · EUC-KR · UTF-16LE 모두 같은 칸", () => {
  const want = mpSplit(LINE);
  const utf8 = new TextEncoder().encode("﻿" + HEAD + "\r\n" + LINE + "\r\n");
  const u = mpCsvLines(utf8);
  assert.equal(u[0][0], "교구", "BOM 이 첫 칸에 남지 않는다");
  assert.deepEqual(u[1], want);
  assert.deepEqual(mpCsvLines(EUCKR)[0], want, "EUC-KR 한글이 깨지지 않는다");
  const s = "﻿" + LINE;
  const u16 = new Uint8Array(s.length * 2);
  for (let i = 0; i < s.length; i++) { u16[i * 2] = s.charCodeAt(i) & 255; u16[i * 2 + 1] = s.charCodeAt(i) >> 8; }
  assert.deepEqual(mpCsvLines(u16)[0], want, "엑셀 「유니코드 텍스트」(UTF-16LE)");
});

test("CSV 파일 → 붙여넣기 칸(탭) → mpParse — 사유가 제자리 · 머리글은 버린다", () => {
  const lines = mpCsvLines(new TextEncoder().encode(HEAD + "\n" + LINE + "\n"));
  const text = lines.filter((r) => r.some(Boolean)).map((r) => r.join("\t")).join("\n");   // paper.js handleFile 과 같은 길
  const rows = mpParse(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "가나다");
  assert.equal(rows[0].status, "취소");
  assert.equal(rows[0].note, "이사, 전출");
});

test("mpParse — 붙여넣은 CSV 글(탭 없음)도 따옴표를 안다", () => {
  const rows = mpParse(LINE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].phone, "010-1111-2222");
  assert.equal(rows[0].note, "이사, 전출");
});
