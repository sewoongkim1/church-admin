// 🚩 게시판 관리 — 📢 공지 쓰기 · 관리자 답글의 순수 규칙(2026-10-13 · js/menus/memorize/board-logic.js)
//   길이·빈 글은 성경암송 api boardPost·boardReply 와 같아야 한다(trim 뒤 String.length ≤ 2000).
import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_MAX, NAME_MAX, NOTICE_NAME, boardLen, countInfo, contentProblem, noticeBody, replyBody,
  looksLikeHtml, noticeHints, excerpt, noticeConfirmHtml, replyConfirmHtml, boardErrorText,
} from "../js/menus/memorize/board-logic.js";
import { reasonText } from "../js/menus/memorize/board.js";

test("길이 — 서버처럼 앞뒤 빈칸을 빼고 UTF-16 으로 센다(이모지 하나 = 2)", () => {
  assert.equal(BOARD_MAX, 2000);
  assert.equal(NAME_MAX, 40);
  assert.equal(boardLen("  안녕  "), 2);
  assert.equal(boardLen("🙏"), 2, "api 의 content.length 와 같게");
  assert.equal(boardLen(null), 0);
  assert.deepEqual(countInfo("가".repeat(1234)), { n: 1234, over: false, text: "1,234 / 2,000자" });
  assert.equal(countInfo("가".repeat(2001)).over, true);
  assert.equal(countInfo(" " + "가".repeat(2000) + "\n").over, false, "앞뒤 빈칸·줄바꿈은 안 센다");
});

test("본문 검사 — 비었나 · 2,000자를 넘나", () => {
  assert.equal(contentProblem(""), "내용을 적어 주세요");
  assert.equal(contentProblem(" \n "), "내용을 적어 주세요");
  assert.equal(contentProblem("가".repeat(2000)), null);
  assert.equal(contentProblem("가".repeat(2001)), "2,000자까지 올릴 수 있어요 — 지금 2,001자예요");
  assert.equal(contentProblem("🙏".repeat(1001)), "2,000자까지 올릴 수 있어요 — 지금 2,002자예요", "이모지 1,001개는 서버가 거절한다");
});

test("공지 — 글쓴이를 비우면 「제자양육부」 · 40자로 자름 · rich 는 참일 때만", () => {
  assert.equal(NOTICE_NAME, "제자양육부");
  assert.deepEqual(noticeBody({ name: "  ", content: "  알림  ", rich: true }),
    { ok: true, body: { name: "제자양육부", content: "알림", rich: true } });
  assert.equal(noticeBody({ name: "가".repeat(50), content: "x" }).body.name.length, 40);
  assert.equal(noticeBody({ name: "교육부", content: "x", rich: "true" }).body.rich, false, "체크 칸의 참만");
  assert.deepEqual(noticeBody({ name: "교육부", content: "" }), { ok: false, message: "내용을 적어 주세요" });
  assert.equal(noticeBody().ok, false);
});

test("답글 — 글 번호와 내용", () => {
  assert.deepEqual(replyBody(12, "  감사해요 "), { ok: true, body: { post_id: 12, id: 12, content: "감사해요" } });
  assert.deepEqual(replyBody("12", "감사해요").body.post_id, 12);
  assert.equal(replyBody(0, "x").ok, false);
  assert.equal(replyBody("abc", "x").ok, false);
  assert.equal(replyBody(1.5, "x").ok, false);
  assert.deepEqual(replyBody(3, ""), { ok: false, message: "내용을 적어 주세요" });
  assert.equal(replyBody(3, "가".repeat(2001)).ok, false);
});

test("HTML 처럼 보이나 · 안내", () => {
  assert.equal(looksLikeHtml("<b>굵게</b>"), true);
  assert.equal(looksLikeHtml("줄<br/>바꿈"), true);
  assert.equal(looksLikeHtml('<span style="color:red">x</span>'), true);
  assert.equal(looksLikeHtml("1 < 2 > 0"), false);
  assert.equal(looksLikeHtml("<3 사랑해요"), false);
  assert.equal(looksLikeHtml("<하나님의 사랑>"), false, "책 이름 꺾쇠는 태그가 아니다");
  // 끈 채 태그를 쓰면 — 글자 그대로 보인다는 안내
  assert.equal(noticeHints({ content: "<b>x</b>", rich: false }).length, 1);
  assert.deepEqual(noticeHints({ content: "그냥 글\n둘째 줄", rich: false }), []);
  // 켠 채 엔터만으로 줄을 바꾸면 — 이어져 보인다는 안내
  assert.equal(noticeHints({ content: "<b>첫 줄</b>\n둘째 줄", rich: true }).length, 1);
  assert.deepEqual(noticeHints({ content: "<p>첫 줄</p>\n<p>둘째 줄</p>", rich: true }), []);
  assert.deepEqual(noticeHints({ content: "첫 줄<br>\n둘째 줄", rich: true }), []);
  assert.deepEqual(noticeHints({ content: "<b>한 줄</b>\n", rich: true }), [], "끝의 줄바꿈 하나는 안 센다");
  assert.deepEqual(noticeHints(), []);
});

test("확인 창 — 글은 esc · 앞부분만 · 숨긴 글이면 알린다", () => {
  assert.equal(excerpt("  가\n\n나  "), "가 나");
  assert.equal(excerpt("가".repeat(130)), "가".repeat(120) + "…");
  const n = noticeConfirmHtml({ name: "<제자>", content: "<script>x</script>", rich: true });
  assert.ok(n.includes("&lt;제자&gt;") && n.includes("&lt;script&gt;"), "이름·글을 글자로");
  assert.ok(!n.includes("<script>"));
  assert.ok(n.includes("HTML 로 그려요"));
  assert.ok(!noticeConfirmHtml({ name: "a", content: "b", rich: false }).includes("HTML 로 그려요"));
  assert.ok(!replyConfirmHtml({ content: "x" }, { hidden: false, deleted: false }).includes("보이지 않아요"));
  assert.ok(replyConfirmHtml({ content: "x" }, { hidden: true }).includes("숨김 상태라"));
  assert.ok(replyConfirmHtml({ content: "x" }, { deleted: true }).includes("삭제 상태라"));
  assert.ok(replyConfirmHtml({ content: "<i>x</i>" }, undefined).includes("&lt;i&gt;"));
});

test("오류 문장 — 게시판 오류는 여기서 · 나머지는 공용 errorText", () => {
  assert.equal(boardErrorText({ ok: false, error: "empty" }), "내용을 적어 주세요");
  assert.equal(boardErrorText({ ok: false, error: "too-long" }), "2,000자까지 올릴 수 있어요", "공용의 「한 칸에 40자」가 아니다");
  assert.equal(boardErrorText({ ok: false, error: "no-post" }), "답글을 달 글을 찾지 못했어요 — 새로 불러와 주세요");
  assert.match(boardErrorText({ ok: false, error: "no-user" }), /관리자 글로 받지 않았어요.*\(no-user\)/);
  assert.equal(boardErrorText({ ok: false, error: "network" }), "인터넷 연결을 확인해 주세요");
  assert.equal(boardErrorText({ ok: false, error: "forbidden" }), "이 메뉴를 쓸 권한이 없어요");
  assert.equal(boardErrorText({ error: "insert or update on table violates foreign key" }), "처리하지 못했어요");
});

test("신고 까닭(reasonText) — 그대로 · { 코드: 건수 } 와 옛 배열", () => {
  assert.equal(reasonText({ spam: 2, rude: 1 }, { spam: "광고", rude: "무례" }), "광고 2 · 무례");
  assert.equal(reasonText(["spam", { reason: "rude" }], { spam: "광고" }), "광고 · rude");
  assert.equal(reasonText(null), "");
});
