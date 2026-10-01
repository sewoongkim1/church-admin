import { test } from "node:test";
import assert from "node:assert/strict";
import { KIND_TEXT, FILTERS, SET_STATUS, whoText, targetText, dayText, rowHtml, formHtml, formCheck, linkOf, countsText, msgOf }
  from "../js/menus/ministry/requests-logic.js";

const Q = (o) => ({ id: 5, kind: "wrong_team", detail: "", year: null, team_text: "", status: "신청", answer: "", created_at: "2026-09-30T16:30:00Z",
  updated_at: "U", handled_at: null, who: { type: "교구", group: "기쁨", sub: "12", name: "홍길동" }, found: true,
  row: { id: 9, year: 2025, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사", deleted: false }, ...o });

test("종류 — 직분 정정은 없다(교적 기준) · 거르기 셋 · 고를 상태 셋", () => {
  assert.deepEqual(Object.keys(KIND_TEXT).sort(), ["find_me", "missing", "not_mine", "other", "wrong_team"]);
  assert.deepEqual(FILTERS.map((f) => f.value), ["open", "done", "all"]);
  assert.deepEqual(SET_STATUS, ["확인 중", "반영", "반영 안 함"]);
});

test("whoText·dayText — 목장 99 는 교구만 · 교회학교 부서·학년 · 한국 날짜", () => {
  assert.equal(whoText(Q({}).who), "기쁨-12 홍길동");
  assert.equal(whoText({ type: "교구", group: "기쁨", sub: "99", name: "홍길동" }), "기쁨 홍길동");
  assert.equal(whoText({ type: "교회학교", group: "중등부", sub: "2학년", name: "홍길동" }), "중등부 2학년 홍길동");
  assert.equal(dayText("2026-09-30T16:30:00Z"), "10/01");
});

test("targetText — 줄 · 빼 둔 줄 · 빠진 사역 · 찾아 주세요 · 지워진 줄", () => {
  assert.equal(targetText(Q({})), "2025 찬양위원회 · 시온성가대");
  assert.equal(targetText(Q({ row: { ...Q({}).row, role_title: "팀장", deleted: true } })), "2025 찬양위원회 · 시온성가대 팀장 (빼 둔 기록)");
  assert.equal(targetText(Q({ kind: "missing", row: null, year: 2023, team_text: "호산나찬양대" })), "빠진 사역 2023 — 호산나찬양대");
  assert.equal(targetText(Q({ kind: "find_me", row: null })), "기록을 찾지 못한 분");
  assert.equal(targetText(Q({ row: null })), "(지워진 기록)");
});

test("rowHtml — 값은 escape · 줄 열쇠는 id 숫자", () => {
  const h = rowHtml(Q({ detail: "<b>x</b>", who: { type: "교구", group: "기쁨", sub: "12", name: "<i>" } }));
  assert.ok(h.includes('data-id="5"'));
  assert.ok(h.includes("&lt;b&gt;x&lt;/b&gt;") && h.includes("&lt;i&gt;") && !h.includes("<b>x"));
  assert.ok(h.includes("팀·부서가 틀려요") && h.includes("신청"));
});

test("formHtml — 그 줄 열기 주소 · 본인 확인 칸은 내 것이 아니에요만 · 찾아 주세요 안내 · 답 안내", () => {
  assert.ok(formHtml(Q({})).includes('href="#/mn-history?row=9"'));
  assert.ok(!formHtml(Q({})).includes('id="hr-ver"'));
  assert.ok(formHtml(Q({ kind: "not_mine" })).includes('id="hr-ver"'));
  assert.ok(formHtml(Q({ kind: "find_me", row: null })).includes("로그인 정보변경"));
  assert.ok(formHtml(Q({})).includes("같은 이름·소속으로 앱에 들어오는 사람에게도 보여요"));
  assert.equal(linkOf(Q({ kind: "missing", row: null, who: { name: "홍 길동" } })), "#/mn-history?q=" + encodeURIComponent("홍 길동"));
});

test("formCheck — 서버와 같은 규칙", () => {
  assert.equal(formCheck(Q({}), { status: "", answer: "" }), "bad-status");
  assert.equal(formCheck(Q({}), { status: "반영 안 함", answer: " " }), "need-answer");
  assert.equal(formCheck(Q({}), { status: "반영", answer: "가".repeat(301) }), "answer-too-long");
  assert.equal(formCheck(Q({ kind: "not_mine" }), { status: "반영", answer: "", verified: false }), "need-verified");
  assert.equal(formCheck(Q({ kind: "not_mine" }), { status: "반영", answer: "", verified: true }), null);
  assert.equal(formCheck(Q({}), { status: "확인 중", answer: "" }), null);
});

test("countsText·msgOf", () => {
  assert.equal(countsText({ "신청": 3, "확인 중": 1 }), "신청 3 · 확인 중 1");
  assert.match(msgOf({ error: "need-verified" }), /본인/);
  assert.equal(msgOf({ error: "network" }), null);
});
