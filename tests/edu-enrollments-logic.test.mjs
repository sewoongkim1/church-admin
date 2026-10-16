import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByStatus, actionsFor, capacityLine, errorWord, exportFileName, addDoneText, confirmTextFor, hasErrorWord, pickArgs, shortApplied,
  dupBadge, DUP_TEXT, TYPED_SUB_HINT } from "../js/menus/education/enrollments-logic.js";

const course = { capacity: 2, mode: "auto", counts: { confirmed: 2, waitlisted: 1, applied: 0 } };

test("groupByStatus — 대기는 순서대로", () => {
  const g = groupByStatus([{ id: 1, status: "waitlisted", waitNo: 2 }, { id: 2, status: "waitlisted", waitNo: 1 }, { id: 3, status: "confirmed" }]);
  assert.deepEqual(g.waitlisted.map((e) => e.id), [2, 1]);
  assert.equal(g.confirmed.length, 1);
});

test("actionsFor — 상태마다 단추", () => {
  assert.deepEqual(actionsFor({ status: "applied" }, course).map((a) => a.op), ["confirm", "waitlist", "decline"]);
  assert.deepEqual(actionsFor({ status: "waitlisted" }, course).map((a) => a.op), ["confirm", "cancel"]);
  assert.deepEqual(actionsFor({ status: "confirmed" }, course).map((a) => a.op), ["cancel"]);
  assert.deepEqual(actionsFor({ status: "cancelled" }, course).map((a) => a.op), ["reopen"]);
  assert.deepEqual(actionsFor({ status: "declined" }, course).map((a) => a.op), ["reopen"]);
});

test("capacityLine", () => {
  assert.equal(capacityLine(course), "정원 2 · 확정 2 · 대기 1");
  assert.equal(capacityLine({ capacity: null, counts: { confirmed: 5, waitlisted: 0, applied: 3 } }), "정원 제한 없음 · 확정 5 · 승인 기다림 3");
});

test("errorWord", () => {
  assert.equal(errorWord("full"), "정원이 찼어요");
  assert.equal(errorWord("too-late"), "이미 시작한 강좌예요");
  assert.equal(errorWord("changed"), "명부가 바뀌었어요. 다시 찾아 주세요");
  assert.equal(errorWord("x"), "저장하지 못했어요 (x)");
});

test("exportFileName — 파일 이름에 못 쓰는 글자는 뺀다", () => {
  assert.equal(exportFileName("제자훈련 1단계", "2026-10-05"), "교육신청_제자훈련 1단계_2026-10-05.xlsx");
  assert.equal(exportFileName('a/b\c:d*e?f"g<h>i|j', "2026-10-05"), "교육신청_abcdefghij_2026-10-05.xlsx");
  assert.equal(exportFileName("///", "2026-10-05"), "교육신청_강좌_2026-10-05.xlsx");
});

test("addDoneText — 대신 등록 결과 문구", () => {
  assert.equal(addDoneText({ ok: true, already: true }), "이미 명단에 있어요");
  assert.equal(addDoneText({ ok: true, revived: true }), "다시 받았어요");
  assert.equal(addDoneText({ ok: true, status: "confirmed" }), "등록했어요");
});

test("confirmTextFor — 확인 창 문구", () => {
  assert.equal(confirmTextFor("cancel", "홍길동"), "홍길동 님의 신청을 취소할까요? 선착순 강좌면 대기 첫 분이 확정돼요.");
  assert.equal(confirmTextFor("decline", "홍길동"), "홍길동 님의 신청을 반려할까요?");
  assert.equal(confirmTextFor("waitlist", "홍길동"), "홍길동 님을 대기로 돌릴까요? 대기 줄 맨 뒤로 가요.");
  assert.equal(confirmTextFor("confirm", "홍길동"), "");
});

test("hasErrorWord — 아는 코드만", () => {
  assert.equal(hasErrorWord("full"), true);
  assert.equal(hasErrorWord("was-declined"), true);
  assert.equal(hasErrorWord("network"), false);
  assert.equal(hasErrorWord(undefined), false);
  assert.equal(hasErrorWord("toString"), false);
});

test("exportFileName — 제어 글자·끝의 점과 빈칸을 빼고 길이를 줄인다", () => {
  assert.equal(exportFileName("a\u0000b\nc\u007fd", "2026-10-05"), "교육신청_abcd_2026-10-05.xlsx");
  assert.equal(exportFileName("제목... ", "2026-10-05"), "교육신청_제목_2026-10-05.xlsx");
  const long = exportFileName("가".repeat(100), "2026-10-05");
  assert.equal(long, "교육신청_" + "가".repeat(60) + "_2026-10-05.xlsx");
  assert.equal(exportFileName("가".repeat(59) + " .", "2026-10-05"), "교육신청_" + "가".repeat(59) + "_2026-10-05.xlsx");
});

test("pickArgs — 찾은 글자·차례·소속 확인값 다섯 칸", () => {
  assert.deepEqual(pickArgs("홍길동", 1, { name: "홍길동", who_type: "교구", group: "1교구", sub: "2목장", church_mok: "소망", position: "집사" }),
    { name: "홍길동", pick: 1, check: { who_type: "교구", group: "1교구", sub: "2목장", church_mok: "소망", position: "집사" } });
  assert.deepEqual(pickArgs("김", 0, { name: "김" }).check, { who_type: "", group: "", sub: "", church_mok: "", position: "" });
  assert.deepEqual(pickArgs("김", 0, null).check, { who_type: "", group: "", sub: "", church_mok: "", position: "" });
});

test("shortApplied — 한국 시각 짧게", () => {
  assert.equal(shortApplied("2027-01-22T10:00:00Z"), "1/22 19:00 신청");
  assert.equal(shortApplied(""), "");
  assert.equal(shortApplied("x"), "");
});

// 최종 검토(2026-10-05)
test("errorWord — 끝난 강좌의 상태 바꾸기(course-closed)", () => {
  assert.equal(errorWord("course-closed"), "끝난·보관된 강좌라 바꿀 수 없어요");
  assert.equal(hasErrorWord("course-closed"), true);
});

test("dupBadge — 서버가 maybeDup 을 준 줄에만 「같은 분일 수 있어요」", () => {
  assert.equal(DUP_TEXT, "같은 분일 수 있어요");
  assert.ok(dupBadge({ maybeDup: true }).includes("같은 분일 수 있어요"));
  assert.equal(dupBadge({ maybeDup: false }), "");
  assert.equal(dupBadge({}), "");
  assert.equal(dupBadge(null), "");
});

test("TYPED_SUB_HINT — 직접 입력 세부 칸 안내", () => {
  assert.equal(TYPED_SUB_HINT, "같은 이름의 새가족이 있으면 세부(예: 연락할 분·반)를 적어 주세요");
});

// ---------- 여러 명 한꺼번에(2026-10-16) — 붙여 넣은 명단 · 힌트 · 저절로 고르기 ----------
test("여러 명 — 붙여 넣은 명단에서 이름만(제목 줄 · 「2대」 · 줄 끝 인원 수는 뺀다) · 같은 이름 한 번", async () => {
  const { parseNameList } = await import("../js/menus/education/enrollments-logic.js");
  const r = parseNameList("권사제자양육 신청자 - 권사제자양육 신청자\n이양덕,차계섬\n윤여남,김정화  8\n\n2대\n시험가, 시험가\n김경희 섬김-18\n최옥주(사랑 30목장)\n이정미 18\n홍길동 3명");
  assert.deepEqual(r.items.map((x) => x.name), ["이양덕", "차계섬", "윤여남", "김정화", "시험가", "김경희", "최옥주", "이정미", "홍길동"]);
  assert.deepEqual(r.items.find((x) => x.name === "김경희").hint, "섬김-18");
  assert.deepEqual(r.items.find((x) => x.name === "최옥주").hint, "사랑 30목장");
  assert.deepEqual(r.items.find((x) => x.name === "이정미").hint, "18");     // 빈칸 하나 뒤의 수는 목장 힌트
  assert.deepEqual(r.items.find((x) => x.name === "김정화").hint, "");       // 빈칸 둘 뒤의 수는 인원 수
  assert.deepEqual(r.items.find((x) => x.name === "홍길동").hint, "");       // 「3명」도 인원 수
  assert.deepEqual(r.skipped, ["권사제자양육 신청자 - 권사제자양육 신청자", "2대"]);
});

test("여러 명 — 힌트 읽기 · 후보 맞추기 · 저절로 고르기", async () => {
  const { hintOf, candFits, autoPick, bulkWhyText, bulkDoneText } = await import("../js/menus/education/enrollments-logic.js");
  assert.deepEqual(hintOf("섬김-18목장"), { gu: "섬김", num: 18, pos: "" });
  assert.deepEqual(hintOf("섬김교구 18목장 시무권사"), { gu: "섬김", num: 18, pos: "권사" });
  assert.deepEqual(hintOf("화평"), { gu: "화평", num: null, pos: "" });
  const c = [
    { church_mok: "섬김-10목장", position: "권사", group: "섬김", sub: "10" },
    { church_mok: "섬김-18목장", position: "권사", group: "섬김", sub: "18" },
    { church_mok: "사랑-34목장", position: "", group: "사랑", sub: "34" },
  ];
  assert.equal(candFits(c[1], "섬김 18"), true);
  assert.equal(candFits(c[0], "섬김 18"), false);
  assert.equal(candFits({ church_mok: "", group: "섬김", sub: "18" }, "섬김-18"), true);   // 교적 목장이 비면 앱 꼴 소속으로
  assert.deepEqual(autoPick(c, "섬김-18"), { pick: 1, why: "hint" });
  assert.deepEqual(autoPick(c, ""), { pick: null, why: "many" });
  assert.deepEqual(autoPick(c, "권사"), { pick: null, why: "many" });                  // 권사가 둘
  assert.deepEqual(autoPick(c, "사랑"), { pick: 2, why: "hint" });
  assert.deepEqual(autoPick([c[0]], ""), { pick: 0, why: "one" });
  assert.deepEqual(autoPick([c[0]], "화평"), { pick: null, why: "hint-none" });          // 한 분이어도 힌트가 다르면 고르지 않는다
  assert.deepEqual(autoPick([], ""), { pick: null, why: "none" });
  assert.equal(bulkWhyText("many"), "여러 분 — 골라 주세요");
  assert.equal(bulkDoneText({ ok: true, status: "confirmed" }), "등록했어요 · 확정");
  assert.equal(bulkDoneText({ ok: true, already: true, status: "confirmed" }), "이미 명단에 있어요 · 확정");
  assert.match(bulkDoneText({ ok: false, error: "was-declined" }), /하나씩/);
  assert.equal(bulkDoneText({ ok: false, error: "full" }), "");
});
