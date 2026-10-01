// 📜 사역 이력 화면의 순수 함수(history-logic.js) — 엑셀 머리 찾기 · 해 정하기 · 나눠 보내기 · 표시 · 내려받기 모양
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findHeader, parseHistorySheet, yearFromName, sendParts, textToAoa, linkState, mergeChecks, exportAoa, exportName,
  editPatch, WEAK_RE, MAX_SEND, EXPORT_HEAD, EDIT_KEYS, REMATCH_KEYS, STATE_TEXT, STATE_CLASS, uploadSummary, deepLink,
} from "../js/menus/ministry/history-logic.js";
import { WEAK_RE as SERVER_WEAK_RE } from "../supabase/functions/church-admin/history-match.ts";
import { HISTORY_MAX_UPLOAD, HISTORY_EDIT_KEYS, HISTORY_REMATCH_KEYS } from "../supabase/functions/church-admin/history-db.ts";
import { errorText } from "../js/core/ui.js";

// 원본 해마다 파일의 꼴 — 1행 제목 · 2행 빈 줄 · 3행 머리(A열은 빈칸) · H열 메모는 머리 없음
const raw2022 = [
  ["", "2022년 사역임명"], [],
  ["   ", "부서", "팀명", "이름", "직분", "목장", "신규 / 유지"],
  ["", "찬양부", "가브리엘찬양대", "가나다", "집사", "기쁨-19", "신규", "검색결과 없음"],
  ["", "찬양부", "가브리엘찬양대", "라마바", "권사", "화평-3", "유지"],
  ["", "", "", "", "", "", ""],
];

test("findHeader — 「이름」과 「팀명」이 함께 든 첫 줄 · 머리 없는 칸은 원본 메모로", () => {
  const h = findHeader(raw2022);
  assert.equal(h.index, 2);
  assert.deepEqual([h.cols.committee, h.cols.team, h.cols.name, h.cols.position, h.cols.mok, h.cols.renewal], [1, 2, 3, 4, 5, 6]);
  assert.ok(h.blankCols.includes(7));
  assert.equal(findHeader([["가", "나"], ["다"]]), null);
});

test("parseHistorySheet — 해는 파일 이름에서 · 빈 줄 버림 · 메모 모음", () => {
  const p = parseHistorySheet(raw2022, "2022년 사역신청 명단_3차(사역순).xlsx");
  assert.equal(p.error, "");
  assert.equal(p.rows.length, 2);
  assert.deepEqual([p.rows[0].year, p.rows[0].name, p.rows[0].mok, p.rows[0].src_note], [2022, "가나다", "기쁨-19", "검색결과 없음"]);
  assert.equal(p.needYear, false);
  assert.equal(parseHistorySheet(raw2022, "명단.xlsx").needYear, true);
});

test("parseHistorySheet — 통합 파일(「년도」 칸) · 내려받은 파일의 「비고」는 원본 메모가 아니다", () => {
  const merged = [["년도", "부서", "팀명", "이름", "직분", "목장", "신규 / 유지", "비고"], [2024, "찬양부", "가", "가나다", "집사", "기쁨-1", "유지", "메모"]];
  const m = parseHistorySheet(merged, "통합.xlsx").rows[0];
  assert.deepEqual([m.year, m.src_note], [2024, "메모"]);
  const exported = [EXPORT_HEAD, [2024, "찬양부", "가", "가나다", "", "교인명부에 같은 이름이 없음", "집사", "기쁨-1", "유지", "", "", "", ""]];
  const r = parseHistorySheet(exported, "사역이력_2024.xlsx").rows[0];
  assert.deepEqual([r.name, r.src_note], ["가나다", ""]);
});

test("yearFromName · textToAoa", () => {
  assert.equal(yearFromName("2024년+사역신청+명단+6차.xlsx"), 2024);
  assert.equal(yearFromName("사역명단.xlsx"), null);
  assert.deepEqual(textToAoa("이름\t팀명\r\n가\t나"), [["이름", "팀명"], ["가", "나"]]);
});

test("sendParts — 해마다 · 3,000줄씩(서버 상한과 같다)", () => {
  assert.equal(MAX_SEND, HISTORY_MAX_UPLOAD);
  const rows = [...Array(3001)].map(() => ({ year: 2024 })).concat([{ year: 2022 }]);
  assert.deepEqual(sendParts(rows).map((p) => [p.year, p.rows.length]), [[2022, 1], [2024, 3000], [2024, 1]]);
});

test("WEAK_RE·고치기 칸·다시 맞추는 칸 — 화면과 서버가 같은 글", () => {
  assert.equal(WEAK_RE.source, SERVER_WEAK_RE.source);
  assert.deepEqual([...EDIT_KEYS], [...HISTORY_EDIT_KEYS]);
  // 줄 창이 「고른 분」을 막는 칸 = 서버가 고친 뒤 다시 맞추는 칸(서버에만 더하면 화면이 낡은 지문으로 고른다)
  assert.deepEqual([...REMATCH_KEYS], [...HISTORY_REMATCH_KEYS]);
  assert.ok(REMATCH_KEYS.every((k) => EDIT_KEYS.includes(k)));
});

test("linkState · mergeChecks · editPatch", () => {
  assert.equal(linkState({ linked: false }), "none");
  assert.equal(linkState({ linked: true, weak: true, link_how: "auto" }), "weak");
  assert.equal(linkState({ linked: true, weak: true, link_how: "manual" }), "ok");
  const m = mergeChecks([
    { d: { counts: { total: 3, add: 2, same: 1, deleted: 0, dup: 0, bad: 0 }, preview: { linked: 1, unlinked: 1, reasons: [["가", 1]] } } },
    { d: { counts: { total: 1, add: 1, same: 0, deleted: 0, dup: 0, bad: 0 }, preview: { linked: 0, unlinked: 1, reasons: [["가", 1]] } } },
  ]);
  assert.deepEqual([m.total, m.add, m.linked, m.unlinked, m.reasons], [4, 3, 1, 2, [["가", 2]]]);
  assert.deepEqual(editPatch({ year: 2024, name: "가", mok: "기쁨-1" }, { year: "2024", name: " 가 ", mok: "기쁨-11" }), { mok: "기쁨-11" });
});

test("exportAoa — 교적ID 는 full 일 때만 · 비고는 못 맞춘 줄만 · 맞춤 근거는 맞춘 줄만", () => {
  const r = { year: 2024, committee: "찬양부", team: "가", name: "가나다", person_id: 7, linked: true, match_basis: "같은 소속",
    match_reason: "", position: "집사", mok: "기쁨-19", renewal: "유지", role_title: "", src_note: "", source_file: "a.xlsx" };
  const u = { ...r, person_id: undefined, linked: false, match_basis: "", match_reason: "교인명부에 같은 이름이 없음" };
  const full = exportAoa([r, u], true), basic = exportAoa([r], false);
  assert.deepEqual(full[0], EXPORT_HEAD);
  assert.deepEqual([full[1][4], full[1][5], full[1][12]], [7, "", "같은 소속"]);
  assert.deepEqual([full[2][4], full[2][5], full[2][12]], ["", "교인명부에 같은 이름이 없음", ""]);
  assert.equal(basic[1][4], "");
  const d0 = new Date("2026-10-01T00:00:00Z");
  assert.match(exportName([2024, 2022], "", "", d0), /^사역이력_2022-2024_20261001\.xlsx$/);
  // 교적으로 거른 채·찾기로 거른 채 내려받으면 파일 이름에도 적는다(「모든 줄」과 헷갈리지 않게)
  assert.match(exportName([2024], "none", "", d0), /^사역이력_2024_못맞춤_20261001\.xlsx$/);
  assert.match(exportName([], "weak", "", d0), /^사역이력_모든해_근거약함_20261001\.xlsx$/);
  assert.match(exportName([2024], "", "가나다", d0), /^사역이력_2024_찾기_20261001\.xlsx$/);
  assert.match(exportName([2024], "none", "가나다", d0), /^사역이력_2024_못맞춤_찾기_20261001\.xlsx$/);
});

// ⚠️ 2026-10-01 검토 반영(task-5-brief 가 아닌 contract-notes) — history-db.ts 가 in_directory 를 보내기 시작해서 더함.
test("linkState — gone(교인명부에서 빠진 분, manual 이어도 우선) · in_directory 없으면 그대로", () => {
  assert.equal(linkState({ linked: true, in_directory: false, link_how: "manual" }), "gone");
  assert.equal(linkState({ linked: true, in_directory: false, link_how: "auto", weak: false }), "gone");
  assert.equal(linkState({ linked: true, in_directory: false, link_how: "auto", weak: true }), "gone");
  assert.equal(linkState({ linked: false, in_directory: false }), "none");
  assert.equal(linkState({ linked: true, in_directory: null, link_how: "manual" }), "ok");
  assert.equal(linkState({ linked: true, in_directory: true, link_how: "auto", weak: true }), "weak");
  assert.equal(STATE_TEXT.gone, "⚠ 명부에 없음");
  assert.equal(STATE_CLASS.gone, "cb-check");
});

test("mergeChecks — noDirectory(명부가 아직 없음)", () => {
  const withNo = mergeChecks([
    { d: { counts: { total: 1, add: 1, same: 0, deleted: 0, dup: 0, bad: 0 }, preview: { linked: 0, unlinked: 1, reasons: [], noDirectory: true } } },
  ]);
  assert.equal(withNo.noDirectory, true);
  const withoutNo = mergeChecks([
    { d: { counts: { total: 1, add: 1, same: 0, deleted: 0, dup: 0, bad: 0 }, preview: { linked: 1, unlinked: 0, reasons: [] } } },
  ]);
  assert.equal(withoutNo.noDirectory, false);
  const mixed = mergeChecks([
    { d: { counts: { total: 1, add: 1, same: 0, deleted: 0, dup: 0, bad: 0 }, preview: { linked: 1, unlinked: 0, reasons: [] } } },
    { d: { counts: { total: 1, add: 1, same: 0, deleted: 0, dup: 0, bad: 0 }, preview: { linked: 0, unlinked: 1, reasons: [], noDirectory: true } } },
  ]);
  assert.equal(mixed.noDirectory, true);
});

test("화면 모듈 — render 를 내보낸다(문법·import 경로)", async () => {
  globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const m = await import("../js/menus/ministry/history.js");
  assert.equal(typeof m.render, "function");
});

// ⚠️ 2026-10-01 검토 반영(task-5-brief 가 아닌 contract-notes) — 오류 문구 일곱 가지가 「처리하지 못했어요」로 안 떨어지는지
test("errorText — 사역 이력 오류 코드 일곱 가지가 각자 문구를 낸다(모르는 코드 뜻풀이로 안 떨어진다)", () => {
  for (const c of ["history-too-many", "history-too-long", "history-exists", "history-deleted", "bad-year", "candidates-changed", "no-directory"]) {
    assert.notEqual(errorText({ error: c }), "처리하지 못했어요", c);
  }
  // history.js 는 이 코드로 따로 가르지 않는다(갈라 처리하는 것은 STALE 의 conflict·not-found 뿐) — 그래도
  // 사용자가 그대로 읽는 안내문이라, 적어도 이 둘은 글자 그대로 못 박는다
  assert.equal(errorText({ error: "history-deleted" }), "같은 줄을 전에 뺐어요 — 빼 둔 줄은 되살리지 않아요(이름·목장 등을 달리 적어 주세요)");
  assert.equal(errorText({ error: "candidates-changed" }), "그사이 교인명부가 바뀌었어요 — 창을 닫고 다시 열어 주세요");
});

// 2026-10-02 — 찾기 칸의 #교인ID 는 교인명부·총괄만(서버 historyFilter 가 사역신청 역할에게 need-directory) · 목록 자리에 이 문장
test("errorText — need-directory(#교인ID 로 찾기)는 교인명부 역할 안내", () => {
  assert.equal(errorText({ error: "need-directory" }), "교인ID 로 찾기는 교인명부 역할이 있어야 해요");
});

// ⚠️ 2026-10-01 최종 검토 — 여러 해를 넣으면 묶음마다 받은 수는 다른 해로 이어진 줄을 못 센다 → 넣은 뒤 해마다 요약(최종)으로
test("uploadSummary — 올린 해 전체의 최종 수(해마다 요약에서) · 실패 · 요약이 없으면 넣은 줄 수만", () => {
  const ys = [
    { year: 2024, total: 900, linked: 890, none: 10, weak: 3 },
    { year: 2023, total: 800, linked: 780, none: 20, weak: 5 },
    { year: 2022, total: 700, linked: 650, none: 50, weak: 9 },
  ];
  assert.equal(uploadSummary([2023, 2022], 1500, 0, ys),
    "1,500줄 넣었어요 — 올린 해 전체: 교적 이어짐 1,430 · 못 맞춤 70\n(2022·2023년 · 모두 1,500줄)");
  assert.equal(uploadSummary([2024], 5, 2, ys), "5줄 넣었어요 — 올린 해 전체: 교적 이어짐 890 · 못 맞춤 10 · 실패 2\n(2024년 · 모두 900줄)");
  assert.equal(uploadSummary([2024], 5, 0, null), "5줄 넣었어요");
  assert.equal(uploadSummary([2021], 5, 1, ys), "5줄 넣었어요 · 실패 1");
});

// 「📮 정정 신청」 메뉴가 #/mn-history?row=<id>&q=<이름> 으로 연다 — row 는 양의 안전 정수만, q 는 다듬고 NFC·40자로
test("deepLink — row 는 양의 안전 정수만 · q 는 다듬고 NFC·40자로 · 없으면 null/빈 글", () => {
  assert.deepEqual(deepLink({ row: "42" }), { row: 42, q: "" });
  assert.equal(deepLink({ row: "0" }).row, null);
  assert.equal(deepLink({ row: "-3" }).row, null);
  assert.equal(deepLink({ row: "abc" }).row, null);
  assert.equal(deepLink({ row: "1.5" }).row, null);
  assert.equal(deepLink({ row: "99999999999999999999" }).row, null);   // Number.MAX_SAFE_INTEGER 밖
  assert.equal(deepLink({ q: "  ca-test-가나다  " }).q, "ca-test-가나다");
  assert.equal(deepLink({ q: "가".repeat(50) }).q, "가".repeat(40));
  assert.deepEqual(deepLink({}), { row: null, q: "" });
  assert.deepEqual(deepLink(undefined), { row: null, q: "" });
  assert.deepEqual(deepLink(), { row: null, q: "" });
  // 띄어 쓴 낱말(이름 + 목장)은 그대로 둔다 — 서버가 낱말마다 함께 찾는다(2026-10-02) · 주소의 「+」는 URLSearchParams 가 빈칸으로 푼다
  assert.equal(deepLink({ q: " 김세웅 화평-20 " }).q, "김세웅 화평-20");
  assert.equal(deepLink(Object.fromEntries(new URLSearchParams("q=%EA%B9%80%EC%84%B8%EC%9B%85+%ED%99%94%ED%8F%89-20"))).q, "김세웅 화평-20");
  assert.equal(deepLink({ q: "가나다 #123" }).q, "가나다 #123");
});
