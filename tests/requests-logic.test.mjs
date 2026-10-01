import { test } from "node:test";
import assert from "node:assert/strict";
import { KIND_TEXT, FILTERS, SET_STATUS, ANSWER_MAX, whoText, targetText, dayText, rowHtml, formHtml, formCheck, linkOf, countsText, msgOf }
  from "../js/menus/ministry/requests-logic.js";
import { resendSame, historyNote } from "../js/menus/ministry/requests-logic.js";
// 2026-10-02 — 빠진 사역 고쳐서 반영(줄 상자) · 신청 삭제
import { lineBoxHtml, lineOf, lineRead, lineCheck, lineDirty, LINE_MAX, deleteConfirmText, deleteNote } from "../js/menus/ministry/requests-logic.js";
import { HISTORY_FIELD_MAX } from "../supabase/functions/church-admin/history-db.ts";
// 2026-10-02 최종 검토 — 고쳤을 때만 줄을 보낸다(lineBody) · requests.js 의 「삭제」 깃발·확인 창 가드는 글자로 맞댄다
import { lineBody } from "../js/menus/ministry/requests-logic.js";
import { readFileSync } from "node:fs";
import { REQ_SET_STATUS, REQ_ANSWER_MAX, REQ_KINDS } from "../supabase/functions/church-admin/history-check.ts";

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

// 2026-10-02 친구 요청 「네 두칸으로 해주세요」 — 두 칸 신청(committee_text 가 글자)은 「부서 · 팀」(빈 칸은 뺀다) ·
//   옛 한 칸 신청(committee_text null · 옛 서버 응답처럼 칸이 없음)은 team_text 그대로 — 성경암송 앱 목록 머리와 같은 규칙
test("targetText — 빠진 사역 두 칸(부서 · 팀) · 한 칸만 적은 두 칸 · 옛 한 칸 신청은 글 그대로", () => {
  const M = (o) => Q({ kind: "missing", row: null, year: 2023, ...o });
  assert.equal(targetText(M({ committee_text: "찬양위원회", team_text: "시온성가대" })), "빠진 사역 2023 — 찬양위원회 · 시온성가대");
  assert.equal(targetText(M({ committee_text: "새가족부", team_text: "" })), "빠진 사역 2023 — 새가족부");
  assert.equal(targetText(M({ committee_text: "", team_text: "시온성가대" })), "빠진 사역 2023 — 시온성가대");
  assert.equal(targetText(M({ committee_text: null, team_text: "찬양위원회 시온성가대" })), "빠진 사역 2023 — 찬양위원회 시온성가대");
  assert.equal(targetText(M({ team_text: "찬양위원회 · 시온성가대" })), "빠진 사역 2023 — 찬양위원회 · 시온성가대");   // 칸 없음 = 한 칸
  // 목록 줄·처리 창도 같은 글(escape 해서)
  const two = M({ committee_text: "<찬양>위원회", team_text: "시온성가대" });
  assert.ok(rowHtml(two).includes("빠진 사역 2023 — &lt;찬양&gt;위원회 · 시온성가대"));
  assert.ok(formHtml(two).includes("빠진 사역 2023 — &lt;찬양&gt;위원회 · 시온성가대"));
});

test("rowHtml — 값은 escape · 줄 열쇠는 id 숫자", () => {
  const h = rowHtml(Q({ detail: "<b>x</b>", who: { type: "교구", group: "기쁨", sub: "12", name: "<i>" } }));
  assert.ok(h.includes('data-id="5"'));
  assert.ok(h.includes("&lt;b&gt;x&lt;/b&gt;") && h.includes("&lt;i&gt;") && !h.includes("<b>x"));
  assert.ok(h.includes("팀·부서가 틀려요") && h.includes("신청"));
});

test("formHtml — 그 줄 열기 주소 · 본인 확인 칸은 내 것이 아니에요만 · 찾아 주세요 안내 · 답 안내 · 새 탭 · 다시 열기 안내", () => {
  assert.ok(formHtml(Q({})).includes('href="#/mn-history?row=9"'));
  assert.ok(formHtml(Q({})).includes('target="_blank"') && formHtml(Q({})).includes('rel="noopener"'));
  assert.ok(formHtml(Q({})).includes("그 줄 열기(새 탭)"));
  assert.ok(!formHtml(Q({})).includes('id="hr-ver"'));
  assert.ok(formHtml(Q({ kind: "not_mine" })).includes('id="hr-ver"'));
  assert.ok(formHtml(Q({ kind: "find_me", row: null })).includes("로그인 정보변경"));
  assert.ok(formHtml(Q({})).includes("같은 이름·소속으로 앱에 들어오는 사람에게도 보여요"));
  assert.ok(!formHtml(Q({ status: "신청" })).includes("다시 열 수 있어요"));
  assert.ok(formHtml(Q({ status: "반영" })).includes("끝난 신청은 [확인 중]을 눌러 다시 열 수 있어요."));
  assert.ok(formHtml(Q({ status: "반영 안 함" })).includes("끝난 신청은 [확인 중]을 눌러 다시 열 수 있어요."));
  assert.equal(linkOf(Q({ kind: "missing", row: null, who: { name: "홍 길동" } })), "#/mn-history?q=" + encodeURIComponent("홍 길동"));
});

test("formCheck — 서버와 같은 규칙 · 이미 반영된 줄의 답만 고칠 때는 본인 확인을 다시 묻지 않는다", () => {
  assert.equal(formCheck(Q({}), { status: "", answer: "" }), "bad-status");
  assert.equal(formCheck(Q({}), { status: "반영 안 함", answer: " " }), "need-answer");
  assert.equal(formCheck(Q({}), { status: "반영", answer: "가".repeat(301) }), "answer-too-long");
  assert.equal(formCheck(Q({ kind: "not_mine" }), { status: "반영", answer: "", verified: false }), "need-verified");
  assert.equal(formCheck(Q({ kind: "not_mine" }), { status: "반영", answer: "", verified: true }), null);
  assert.equal(formCheck(Q({ kind: "not_mine", status: "반영" }), { status: "반영", answer: "고쳐 적음", verified: false }), null);
  assert.equal(formCheck(Q({}), { status: "확인 중", answer: "" }), null);
});

test("countsText·msgOf", () => {
  assert.equal(countsText({ "신청": 3, "확인 중": 1 }), "신청 3 · 확인 중 1");
  assert.match(msgOf({ error: "need-verified" }), /본인/);
  assert.match(msgOf({ error: "already-open" }), /내 기록 찾아 주세요/);
  assert.equal(msgOf({ error: "network" }), null);
});

test("화면↔서버 규칙 맞대기 — SET_STATUS·ANSWER_MAX·종류가 서버와 같다", () => {
  assert.deepEqual(SET_STATUS, REQ_SET_STATUS);
  assert.equal(ANSWER_MAX, REQ_ANSWER_MAX);
  assert.deepEqual(Object.keys(KIND_TEXT).sort(), [...REQ_KINDS].sort());
});

// 빠진 사역을 「반영」하면 그 해 사역 이력에 줄을 더한다(2026-10-01) — 저장 뒤 안내 · 같아도 보내는 경우
test("formHtml — 빠진 사역에만 「반영하면 사역 이력에 한 줄」 안내(고친 내용대로 · 성도님 글은 그대로)", () => {
  const h = formHtml(Q({ kind: "missing", row: null, year: 2023, team_text: "호산나찬양대" }));
  assert.ok(h.includes("「반영」하면 「사역 이력에 넣을 내용」대로 「📜 사역 이력」에 한 줄 더해요"), h);
  assert.ok(!h.includes("글에서 부서·팀·직분을 읽어요"), "옛 안내가 남았다");
  assert.ok(!formHtml(Q({})).includes("한 줄 더해요"));
});

test("resendSame — 빠진 사역은 상태·답이 같아도 보낸다(반영이면 이력 줄을 채우고 · 아니면 남은 줄을 다시 뺀다) · 다른 종류는 아니다", () => {
  assert.equal(resendSame(Q({ kind: "missing", status: "반영" }), { status: "반영" }), true);
  // 「반영」에서 벗어나다 줄 빼기가 실패했으면 같은 상태로 한 번 더 저장해 다시 뺀다(2026-10-02 최종 검토 #1)
  assert.equal(resendSame(Q({ kind: "missing", status: "확인 중" }), { status: "확인 중" }), true);
  assert.equal(resendSame(Q({ kind: "missing", status: "반영 안 함" }), { status: "반영 안 함" }), true);
  assert.equal(resendSame(Q({ kind: "not_mine", status: "반영" }), { status: "반영" }), false);
  assert.equal(resendSame(Q({ kind: "wrong_team", status: "확인 중" }), { status: "확인 중" }), false);
});

test("historyNote — 더했어요(해) · 뺐어요 · 못 했으면 창(더하기·빼기·채우기) · 지운 줄 · 이력 칸 없으면 null", () => {
  const q = Q({ kind: "missing", row: null, year: 2023, team_text: "찬양위원회 시온성가대" });
  const add = { status: "반영" }, back = { status: "확인 중" };
  assert.equal(historyNote({ ok: true }, q, add), null);
  assert.deepEqual(historyNote({ ok: true, history: { id: 3, year: 2023, created: true } }, q, add), { toast: "사역 이력 2023년에 더했어요" });
  assert.deepEqual(historyNote({ ok: true, history: { id: 3, year: 2024, restored: true } }, q, add), { toast: "사역 이력 2024년에 더했어요" });
  assert.deepEqual(historyNote({ ok: true, history: { id: 3, created: true } }, q, add), { toast: "사역 이력 2023년에 더했어요" });
  assert.deepEqual(historyNote({ ok: true, history: { id: 3, year: 2023, removed: true } }, q, back), { toast: "사역 이력에서 뺐어요" });
  assert.equal(historyNote({ ok: true, history: { id: 3, year: 2023, created: false } }, q, add), null);   // 이미 있음 — 평소 안내
  assert.equal(historyNote({ ok: true, history: { removed: false } }, q, back), null);
  // 더하다 실패(D6) — 상태는 이미 저장됐다 · 반영을 한 번 더 누르면 채운다 · 채우기만 했으면(same) 「상태는 저장했지만」을 뺀다
  //   고친 내용은 창이 닫히며 사라진다 — 다시 열어 「사역 이력에 넣을 내용」을 확인하라고(2026-10-02 최종 검토 #7)
  //   그 말은 고친 내용(line)을 보냈을 때만(넷째 인자 · 안 고치고 「반영」만 눌렀으면 잃은 것이 없다 · 2026-10-02 검증 2차 #4)
  assert.deepEqual(historyNote({ ok: true, history: { error: "history-failed" } }, q, add, true),
    { dialog: "상태는 저장했지만 사역 이력에 넣지 못했어요 — 고친 내용도 들어가지 않았어요. 잠시 뒤 다시 열어 「사역 이력에 넣을 내용」을 확인하고 「반영」을 한 번 더 눌러 주세요" });
  assert.deepEqual(historyNote({ ok: true, same: true, history: { error: "history-failed" } }, q, add, true),
    { dialog: "사역 이력에 넣지 못했어요 — 고친 내용도 들어가지 않았어요. 잠시 뒤 다시 열어 「사역 이력에 넣을 내용」을 확인하고 「반영」을 한 번 더 눌러 주세요" });
  for (const sent of [false, undefined]) {
    assert.deepEqual(historyNote({ ok: true, history: { error: "history-failed" } }, q, add, sent),
      { dialog: "상태는 저장했지만 사역 이력에 넣지 못했어요 — 잠시 뒤 「반영」을 한 번 더 눌러 주세요" }, String(sent));
    assert.deepEqual(historyNote({ ok: true, same: true, history: { error: "history-failed" } }, q, add, sent),
      { dialog: "사역 이력에 넣지 못했어요 — 잠시 뒤 「반영」을 한 번 더 눌러 주세요" }, String(sent));
  }
  assert.match(historyNote({ ok: true, history: { error: "history-failed" } }, q, back).dialog, /빼지 못했어요/);
  assert.match(historyNote({ ok: true, history: { error: "history-deleted" } }, q, add).dialog, /지워 달라는 요청/);
});

// ── 2026-10-02 — 빠진 사역을 고쳐서 반영(「사역 이력에 넣을 내용」 상자) · 신청 삭제 · 기록 줄 ──
const LN = (o) => ({ state: "draft", year: 2023, committee: "찬양위원회", team: "호산나찬양대", role_title: "", position: "", expect: "", ...o });
const QM = (o) => Q({ kind: "missing", row: null, year: 2023, team_text: "찬양위원회 호산나찬양대", line: LN(), ...o });
// 창 안의 칸을 흉내 낸 아주 작은 상자(querySelector 만)
const fakeBox = (vals) => ({ querySelector: (sel) => {
  const k = /data-hl="([a-z_]+)"/.exec(sel)?.[1];
  return k && k in vals ? { value: vals[k] } : null;
} });

test("lineBoxHtml — 네 칸(연도·부서·팀·직책) 미리 채움 · 값은 escape · in/out/draft 안내 · 교적 직분은 읽기만 · shown 아니면 hidden", () => {
  const draft = lineBoxHtml(QM({ line: LN({ committee: "<b>위원회</b>", team: '"팀"' }) }), true);
  assert.ok(draft.includes("사역 이력에 넣을 내용"));
  for (const k of ["year", "committee", "team", "role_title"]) assert.ok(draft.includes(`data-hl="${k}"`), k);
  assert.ok(draft.includes('value="2023"'));
  assert.ok(draft.includes("&lt;b&gt;위원회&lt;/b&gt;") && !draft.includes("<b>위원회"));
  assert.ok(draft.includes("&quot;팀&quot;"));
  assert.ok(draft.includes("연도") && draft.includes("부서") && draft.includes("팀") && draft.includes("직책(있으면)"));
  assert.ok(draft.includes("성도님 글에서 읽어 채웠어요 — 고쳐서 「반영」하면 이 내용으로 그 해 사역 이력에 들어가요"));
  assert.ok(draft.includes("직분은 교적(교인명부)의 직분으로 넣어요"));
  assert.ok(!draft.includes("(교적)</"), "draft 에는 교적 직분 줄이 없다");
  assert.ok(!/class="hr-line-box"[^>]*hidden/.test(draft));
  const inn = lineBoxHtml(QM({ status: "반영", line: LN({ state: "in", position: "안수<집사>", expect: "U1" }) }), true);
  assert.ok(inn.includes("지금 「📜 사역 이력」에 있는 줄이에요 — 고쳐서 저장하면 그 줄이 바뀌어요"));
  assert.ok(inn.includes("직분 안수&lt;집사&gt;(교적)"));
  const out = lineBoxHtml(QM({ line: LN({ state: "out", position: "권사" }) }), true);
  assert.ok(out.includes("빼 둔 줄이에요 — 「반영」으로 저장하면 다시 넣어요(「📜 사역 이력」에서 직접 뺀 줄은 다시 넣지 않아요)"));
  assert.ok(out.includes("직분 권사(교적)"));
  assert.ok(/class="hr-line-box"[^>]*hidden/.test(lineBoxHtml(QM({}), false)));
  // 서버가 line 을 안 준 옛 응답 — 신청 해만 채우고 깨지지 않는다
  assert.deepEqual(lineOf(QM({ line: null })), { state: "draft", year: 2023, committee: "", team: "", role_title: "", position: "", expect: "" });
});

test("formHtml — 빠진 사역에만 줄 상자 · 「반영」일 때만 보인다(확인 중·반영 안 함·신청이면 hidden)", () => {
  const box = (h) => /<div class="hr-line-box"([^>]*)>/.exec(h);
  assert.equal(box(formHtml(QM({ status: "반영" })))[1].includes("hidden"), false);
  for (const status of ["신청", "확인 중", "반영 안 함"]) assert.equal(box(formHtml(QM({ status })))[1].includes("hidden"), true, status);
  assert.equal(box(formHtml(Q({}))), null);
  assert.equal(box(formHtml(Q({ kind: "find_me", row: null }))), null);
});

test("lineRead·lineCheck·lineDirty — 칸 읽기 · 서버와 같은 검사(연도·부서나 팀·100자 · NFC·빈칸 접기) · 미리 채운 것과 다르면 바뀜", () => {
  const v = lineRead(fakeBox({ year: " 2024 ", committee: "찬양위원회", team: "시온성가대", role_title: "" }));
  assert.deepEqual(v, { year: " 2024 ", committee: "찬양위원회", team: "시온성가대", role_title: "" });
  assert.deepEqual(lineRead(fakeBox({})), { year: "", committee: "", team: "", role_title: "" });
  assert.equal(LINE_MAX, HISTORY_FIELD_MAX);
  assert.equal(lineCheck(v), null);
  for (const year of ["", "1949", "2101", "20x3", "2023.5"]) assert.equal(lineCheck({ ...v, year }), "bad-year", year);
  assert.equal(lineCheck({ ...v, committee: " ", team: "" }), "need-team");
  assert.equal(lineCheck({ ...v, committee: "새가족부", team: "" }), null);
  assert.equal(lineCheck({ ...v, team: "가".repeat(LINE_MAX) }), null);
  assert.equal(lineCheck({ ...v, team: "가".repeat(LINE_MAX + 1) }), "history-too-long");
  assert.equal(lineCheck({ ...v, role_title: "가".repeat(LINE_MAX + 1) }), "history-too-long");
  assert.equal(lineCheck({ ...v, team: "가" + " ".repeat(300) + "나" }), null);                     // 빈칸은 접은 뒤에 센다
  assert.equal(lineCheck({ ...v, team: "가".normalize("NFD").repeat(LINE_MAX) }), null);            // NFD 자모도 완성형으로 센다
  assert.equal(msgOf({ error: "need-team" }), "부서나 팀을 적어 주세요");
  assert.equal(msgOf({ error: "bad-year" }), null);              // ui.js MESSAGES 의 것을 그대로 쓴다(openForm 이 errorText 로)
  assert.equal(msgOf({ error: "history-too-long" }), null);
  const q = QM({});
  assert.equal(lineDirty(q, { year: "2023", committee: "찬양위원회", team: "호산나찬양대", role_title: "" }), false);
  assert.equal(lineDirty(q, { year: "2024", committee: "찬양위원회", team: "호산나찬양대", role_title: "" }), true);
  assert.equal(lineDirty(q, { year: "2023", committee: "찬양위원회", team: "호산나찬양대", role_title: "팀장" }), true);
});

test("historyNote — 고쳤어요 · 직접 뺀 줄 · 그사이 바뀜 · 교적 못 찾음 · 되살리며 고친 것도 「더했어요」", () => {
  const q = QM({});
  const add = { status: "반영" };
  assert.deepEqual(historyNote({ ok: true, history: { id: 3, year: 2024, edited: true, fields: ["team"] } }, q, add), { toast: "사역 이력 줄을 고쳤어요" });
  assert.deepEqual(historyNote({ ok: true, same: true, history: { id: 3, year: 2024, edited: true, fields: ["team"] } }, q, add), { toast: "사역 이력 줄을 고쳤어요" });
  assert.deepEqual(historyNote({ ok: true, history: { id: 3, year: 2024, restored: true, fields: ["team"] } }, q, add), { toast: "사역 이력 2024년에 더했어요" });
  assert.deepEqual(historyNote({ ok: true, history: { error: "history-removed" } }, q, add),
    { dialog: "「📜 사역 이력」에서 직접 뺀 줄이라 다시 넣지 않았어요 — 꼭 넣어야 하면 「📜 사역 이력」에서 「＋ 한 줄 더하기」로 넣어 주세요" });
  assert.deepEqual(historyNote({ ok: true, same: true, history: { error: "line-conflict" } }, q, add),
    { dialog: "그사이 「📜 사역 이력」에서 그 줄이 바뀌었어요 — 새로 불러와 다시 고쳐 주세요" });
  assert.deepEqual(historyNote({ ok: true, history: { error: "no-person" } }, q, add),
    { dialog: "교적을 찾지 못한 신청이라 사역 이력에 넣지 않았어요 — 「📜 사역 이력」에서 「＋ 한 줄 더하기」로 넣어 주세요" });
  // 빼다 실패 — 손으로 빼라고 하지 않는다(손으로 뺀 줄은 다시 「반영」해도 돌아오지 않는다) · 같은 상태로 한 번 더 저장하면 서버가 다시 뺀다
  //   (2026-10-02 최종 검토 #1) · 같은 상태로 다시 저장했으면(same) 「상태는 바꿨지만」을 뺀다
  for (const st of ["확인 중", "반영 안 함"]) {
    assert.deepEqual(historyNote({ ok: true, history: { error: "history-failed" } }, q, { status: st }),
      { dialog: "상태는 바꿨지만 사역 이력에서 빼지 못했어요 — 잠시 뒤 같은 상태로 한 번 더 저장해 주세요" }, st);
    assert.deepEqual(historyNote({ ok: true, same: true, history: { error: "history-failed" } }, q, { status: st }),
      { dialog: "사역 이력에서 빼지 못했어요 — 잠시 뒤 같은 상태로 한 번 더 저장해 주세요" }, st);
  }
  // 같은 상태로 한 번 더 저장해 남은 줄을 뺐다
  assert.deepEqual(historyNote({ ok: true, same: true, history: { id: 3, year: 2023, removed: true } }, q, { status: "확인 중" }),
    { toast: "사역 이력에서 뺐어요" });
});

test("historyNote — 교적 직분을 못 읽고 넣었으면 창(직분을 채워 주세요 · 2026-10-02 최종 검토 #9)", () => {
  const q = QM({}), add = { status: "반영" };
  const text = "사역 이력 2023년에 더했지만 교적에서 직분을 읽지 못했어요 — 「📜 사역 이력」에서 직분을 채워 주세요";
  assert.deepEqual(historyNote({ ok: true, history: { id: 3, year: 2023, created: true, positionFailed: true } }, q, add), { dialog: text });
  assert.deepEqual(historyNote({ ok: true, same: true, history: { id: 3, year: 2023, created: true, positionFailed: true } }, q, add), { dialog: text });
  assert.deepEqual(historyNote({ ok: true, history: { id: 3, year: 2023, created: true } }, q, add), { toast: "사역 이력 2023년에 더했어요" });
});

test("historyNote — 「반영 한 번 더」 사이에 다른 분이 신청을 지웠다(not-found) · 넣은 줄을 다시 빼지 못했으면 창(2026-10-02 최종 검토 #2)", () => {
  const q = QM({ status: "반영" }), add = { status: "반영" };
  assert.equal(historyNote({ ok: false, error: "not-found" }, q, add), null);   // 평소 안내(「그 신청을 찾지 못했어요」)
  assert.deepEqual(historyNote({ ok: false, error: "not-found", history: { error: "history-failed" } }, q, add),
    { dialog: "그사이 다른 분이 이 신청을 지웠는데, 사역 이력에 넣은 줄을 빼지 못했어요 — 「📜 사역 이력」에서 그 줄을 빼 주세요" });
});

test("historyNote — 「한 번 더」 사이에 다른 분이 상태를 바꿨다(conflict) · 서버가 새 상태로 한 번 다시 맞췄으면 평소 안내 · 못 맞췄으면 창(2026-10-02 검증 2차 #1)", () => {
  const q = QM({ status: "확인 중" });
  for (const f of [{ status: "확인 중" }, { status: "반영" }]) {
    assert.equal(historyNote({ ok: false, error: "conflict" }, q, f), null);   // 평소 안내(「다른 분이 먼저 바꿨어요」)
    assert.equal(historyNote({ ok: false, error: "conflict", history: { id: 3, year: 2023, restored: true } }, q, f), null);
    assert.equal(historyNote({ ok: false, error: "conflict", history: { id: 3, year: 2023, removed: true } }, q, f), null);
    assert.deepEqual(historyNote({ ok: false, error: "conflict", history: { error: "history-failed" } }, q, f),
      { dialog: "그사이 다른 분이 이 신청의 상태를 바꿨는데, 사역 이력 줄을 그 상태에 맞추지 못했어요 — 새로 불러와 지금 상태 그대로 한 번 더 저장해 주세요" });
    assert.match(historyNote({ ok: false, error: "conflict", history: { error: "history-deleted" } }, q, f).dialog, /지워 달라는 요청/);
  }
});

test("lineBody — 「사역 이력에 넣을 내용」은 고쳤을 때만 보낸다(안 고쳤으면 서버가 줄·신청 글 그대로 · 헛 「그사이 바뀌었어요」를 막는다 · 2026-10-02 최종 검토 #6)", () => {
  const q = QM({ status: "반영", line: LN({ state: "in", expect: "U0" }) });
  const same = { year: "2023", committee: "찬양위원회", team: "호산나찬양대", role_title: "" };
  assert.deepEqual(lineBody(q, same), {});
  assert.deepEqual(lineBody(q, null), {});                                   // 상자가 숨었다(반영이 아니다)
  assert.deepEqual(lineBody(q, { ...same, team: "시온성가대" }), { line: { ...same, team: "시온성가대", expect: "U0" } });
  assert.deepEqual(lineBody(QM({}), { ...same, role_title: "팀장" }), { line: { ...same, role_title: "팀장", expect: "" } });   // draft
});

test("requests.js — 「삭제」 깃발은 try/finally 로 내린다 · requestSubmit 이 없으면 submit 을 직접(옛 사파리) · 확인 창 뒤 창이 닫혔으면 지우지 않는다(FE-4)", () => {
  const src = readFileSync(new URL("../js/menus/ministry/requests.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const del = src.slice(src.indexOf('querySelector(".hr-del")'), src.indexOf("isDirty:"));
  assert.match(del, /deleting = true;\s*try \{[\s\S]*requestSubmit[\s\S]*\} finally \{ deleting = false; \}/, del);
  assert.match(del, /box\.requestSubmit \? box\.requestSubmit\(\) : box\.dispatchEvent\(new Event\("submit", \{ cancelable: true \}\)\)/, del);
  const at = src.indexOf('const yes = await dialog({ title: "신청 삭제"');
  assert.ok(at > 0, "삭제 확인 창이 없다");
  const after = src.slice(at, src.indexOf('call("historyRequestDelete"', at));
  assert.match(after, /if \(!box\.isConnected\) return \{ ok: false \};/, after);
  // 고친 내용(line)은 lineBody 로만 싣는다 · 보냈는지를 historyNote 에 넘긴다(「고친 내용도 들어가지 않았어요」는 보냈을 때만 · 검증 2차 #4)
  assert.ok(src.includes("const lb = lineBody(q, line);") && src.includes("...lb })"), "historyRequestSet 이 lineBody 를 거치지 않는다");
  assert.equal((src.match(/historyNote\(r, q, f, !!lb\.line\)/g) ?? []).length, 2, "historyNote 에 line 을 보냈는지 넘기지 않는다");
  // 신청 삭제의 not-found 도 deleteNote 를 거친다(이미 지워진 신청의 남은 줄을 뺐으면 알린다 · 검증 2차 #3)
  assert.ok(src.includes('return { ok: true, value: { kind: r.error, note: deleteNote(r) } }'), "삭제 not-found 가 deleteNote 를 거치지 않는다");
});

test("formHtml — 「삭제」 단추는 「반영 안 함」 바로 뒤 같은 줄(.hr-sts) · 상태 단추가 아니다(aria-pressed·data-st 없음)", () => {
  for (const q of [Q({}), QM({ status: "반영" }), Q({ kind: "find_me", row: null, status: "반영 안 함" })]) {
    const h = formHtml(q);
    const sts = /<div class="hr-sts"[^>]*>([\s\S]*?)<\/div>/.exec(h)[1];
    assert.ok(/data-st="반영 안 함"[^>]*>반영 안 함<\/button><button type="button" class="btn danger hr-del">삭제<\/button>$/.test(sts), sts);
    const del = /<button[^>]*hr-del[^>]*>/.exec(h)[0];
    assert.ok(!del.includes("aria-pressed") && !del.includes("data-st"), del);
  }
});

test("deleteConfirmText — 완전히 지움 · 앱에서도 사라짐 · 빠진 사역이 「📜 사역 이력」에 들어가 있을 때만 「더한 줄도 빠져요」", () => {
  const base = "이 신청을 완전히 지워요. 성도님 앱 「내 정정 신청」에서도 사라지고 되돌릴 수 없어요.";
  const more = "「반영」으로 「📜 사역 이력」에 더한 줄도 빠져요(빼 둔 줄이 돼요).";
  assert.equal(deleteConfirmText(Q({})), base);
  assert.equal(deleteConfirmText(QM({ status: "반영", line: LN({ state: "in" }) })), base + " " + more);
  for (const state of ["out", "draft"]) assert.equal(deleteConfirmText(QM({ line: LN({ state }) })), base, state);
  assert.equal(deleteConfirmText(QM({ line: null })), base);
  assert.equal(deleteConfirmText(Q({ line: LN({ state: "in" }) })), base);   // 빠진 사역이 아니면 줄이 없다
});

test("deleteNote — 지웠어요 · 사역 이력에서도 뺐어요 · 빼지 못했으면 창", () => {
  assert.deepEqual(deleteNote({ ok: true }), { toast: "신청을 지웠어요" });
  assert.deepEqual(deleteNote({ ok: true, history: { removed: true, id: 3, year: 2023 } }), { toast: "신청을 지웠어요 · 사역 이력에서도 뺐어요" });
  assert.deepEqual(deleteNote({ ok: true, history: { error: "history-failed" } }),
    { dialog: "신청은 지웠지만 사역 이력에서 그 줄을 빼지 못했어요 — 「📜 사역 이력」에서 빼 주세요" });
  // 이미 지워진 신청 — 서버가 남은 줄을 뺐으면 그것도 알린다 · 아니면 평소 안내(「그 신청을 찾지 못했어요」 · 2026-10-02 검증 2차 #3)
  assert.equal(deleteNote({ ok: false, error: "not-found" }), null);
  assert.equal(deleteNote({ ok: false, error: "conflict" }), null);
  assert.deepEqual(deleteNote({ ok: false, error: "not-found", history: { removed: true, id: 3, year: 2023 } }),
    { toast: "신청은 이미 지워졌어요 · 사역 이력에서도 뺐어요" });
});

test("rowHtml — 빠진 사역이 「📜 사역 이력」에 들어가 있으면 그 줄 한 줄(해 부서 · 팀 직책) · 빼 둔 줄·draft 는 없음 · escape", () => {
  const h = rowHtml(QM({ status: "반영", line: LN({ state: "in", committee: "찬양<위원회>", team: "호산나찬양대", role_title: "팀장", year: 2024 }) }));
  assert.ok(h.includes('<span class="hr-line">📜 2024 찬양&lt;위원회&gt; · 호산나찬양대 팀장</span>'), h);
  assert.ok(rowHtml(QM({ line: LN({ state: "in", committee: "", team: "호산나찬양대", year: 2024 }) })).includes("📜 2024 호산나찬양대</span>"));
  for (const state of ["out", "draft"]) assert.ok(!rowHtml(QM({ line: LN({ state }) })).includes("hr-line"), state);
  assert.ok(!rowHtml(Q({})).includes("hr-line"));
});
