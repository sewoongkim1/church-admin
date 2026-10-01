// 사역 이력 확인 · 정정 신청 — 순수 함수 시험(2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md)
//   node --experimental-strip-types --test tests/history-check.test.mjs
// ⚠️ 이름은 지어낸 것만(홍길동). 공용 people-match.test.mjs 는 다른 세션이 고치는 중이라 이 파일에 둔다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applicantFromLogin, loginNameKey, matchLoginPerson } from "../supabase/functions/church-admin/people-match.ts";
import {
  HISTORY_OUT_KEYS, REQUEST_OUT_KEYS, REQ_KINDS, REQ_LINE_KINDS, REQ_OPEN_MAX, hcUserId, historyRowOut, internalKeyOk, parseRequest,
  readLoginWho, requestBlock, requestInsert, requestOut, sortHistory,
  REQ_FILTERS, REQ_SET_STATUS, REQUEST_ADMIN_OUT_KEYS, filterRequests, parseRequestSet, requestAdminOut, requestAuditDetail,
  requestCounts, requestSetBlock, requestSetPatch,
} from "../supabase/functions/church-admin/history-check.ts";
import { ACTION_ROLES, canCall } from "../supabase/functions/church-admin/authz.ts";

const P = (id, o) => ({ person_id: id, kind2: "장년", mok1: "", mok3: "", school_dept: "", phone_digits: "", ...o });
const W = (o) => ({ type: "교구", gu: "기쁨", mok: "12", bu: "", grade: "", name: "홍길동", ...o });

test("교구 — 같은 교구·같은 목장에 한 분이면 그분", () => {
  const rows = [P(1, { mok1: "기쁨", mok3: "기쁨-12목장" }), P(2, { mok1: "소망", mok3: "소망-12목장" })];
  assert.deepEqual(matchLoginPerson(rows, W()), { personId: 1, why: "" });
});

test("교구 — 같은 교구 다른 목장뿐이면 찾지 못함(목장까지 본다 · 친구 결정)", () => {
  assert.deepEqual(matchLoginPerson([P(1, { mok1: "기쁨", mok3: "기쁨-3목장" })], W()), { personId: null, why: "없음" });
});

test("교구 — 같은 목장에 같은 이름 둘이면 찾지 못함(여럿)", () => {
  const rows = [P(1, { mok1: "기쁨", mok3: "기쁨-12목장" }), P(2, { mok1: "기쁨", mok3: "기쁨-12목장" })];
  assert.deepEqual(matchLoginPerson(rows, W()), { personId: null, why: "여럿" });
});

test("교구 — 목장 99·빈칸은 찾지 못함(목장을 모르는 로그인)", () => {
  const rows = [P(1, { mok1: "기쁨", mok3: "기쁨-12목장" })];
  assert.equal(matchLoginPerson(rows, W({ mok: "99" })).personId, null);
  assert.equal(matchLoginPerson(rows, W({ mok: "" })).personId, null);
});

test("교구 — 「남성」은 교적 남성 목장 한 분(그 목장 칸의 아이는 빼고 센다)", () => {
  const rows = [P(1, { mok1: "소망", mok3: "소망-남성1" }), P(2, { kind2: "교회학교", mok1: "소망", mok3: "소망-남성1" })];
  assert.deepEqual(matchLoginPerson(rows, W({ gu: "소망", mok: "남성" })), { personId: 1, why: "" });
});

test("새가족 — 교구만 본다(명부 목장 칸이 연도·월이다)", () => {
  assert.equal(matchLoginPerson([P(1, { mok1: "새가족", mok3: "2026-09" })], W({ gu: "새가족", mok: "99" })).personId, 1);
});

test("교회학교 — 부서와 이름(학년은 보지 않는다)", () => {
  const w = W({ type: "교회학교", gu: "", mok: "", bu: "중등부", grade: "2학년" });
  assert.equal(matchLoginPerson([P(1, { kind2: "학생", school_dept: "중등부" })], w).personId, 1);
  assert.equal(matchLoginPerson([P(1, { kind2: "학생", school_dept: "고등부" })], w).personId, null);
});

test("청년부 — 명부의 목장 첫 칸(mok1)", () => {
  const w = W({ type: "교회학교", gu: "", mok: "", bu: "청년부" });
  assert.equal(matchLoginPerson([P(1, { mok1: "청년부", mok3: "청년-03" })], w).personId, 1);
});

test("후보가 없으면 없음 · undefined 도 견딘다", () => {
  assert.deepEqual(matchLoginPerson([], W()), { personId: null, why: "없음" });
  assert.deepEqual(matchLoginPerson(undefined, W()), { personId: null, why: "없음" });
});

test("applicantFromLogin — 교구는 교구·목장, 교회학교는 부서", () => {
  assert.deepEqual(applicantFromLogin(W()), { type: "교구", gu: "기쁨", mok: 12, men: false, bu: "", name: "홍길동", phone: "" });
  assert.deepEqual(applicantFromLogin(W({ type: "교회학교", bu: "중등부" })),
    { type: "교회학교", gu: "", mok: null, men: false, bu: "중등부", name: "홍길동", phone: "" });
});

test("loginNameKey — 띄어쓰기·자모분리(NFD)를 맞추고, 물을 수 없는 글자·빈 이름은 null", () => {
  assert.equal(loginNameKey(W({ name: " 홍 길동 " })), "홍길동");
  assert.equal(loginNameKey(W({ name: "홍길동".normalize("NFD") })), "홍길동");
  assert.equal(loginNameKey(W({ name: "홍(길동)" })), null);
  assert.equal(loginNameKey(W({ name: "" })), null);
});

test("internalKeyOk — 같은 값만 · 빈 값·길이 다름은 false", () => {
  assert.equal(internalKeyOk("abc123", "abc123"), true);
  assert.equal(internalKeyOk("abc124", "abc123"), false);
  assert.equal(internalKeyOk("abc12", "abc123"), false);
  assert.equal(internalKeyOk("", ""), false);
  assert.equal(internalKeyOk(null, "abc123"), false);
});

test("hcUserId — uuid 꼴만", () => {
  assert.equal(hcUserId("0f8fad5b-d9cb-469f-a165-70867728950e"), "0f8fad5b-d9cb-469f-a165-70867728950e");
  assert.equal(hcUserId(" 0f8fad5b-d9cb-469f-a165-70867728950e "), "0f8fad5b-d9cb-469f-a165-70867728950e");
  assert.equal(hcUserId("abc"), null);
  assert.equal(hcUserId(undefined), null);
});

test("readLoginWho — 구분은 교구·교회학교만 · 이름 필수 · NFC·빈칸 정리", () => {
  assert.deepEqual(readLoginWho({ type: "교구", gu: "기쁨", mok: "12", name: " 홍  길동 " }),
    { type: "교구", gu: "기쁨", mok: "12", bu: "", grade: "", name: "홍 길동" });
  assert.equal(readLoginWho({ type: "교역자", name: "홍길동" }), null);
  assert.equal(readLoginWho({ type: "교구", name: "" }), null);
  assert.equal(readLoginWho(null), null);
  assert.equal(readLoginWho("교구"), null);
});

test("parseRequest — 줄 정정은 history_id 필수 · 「그 밖에」는 설명 필수", () => {
  assert.deepEqual(parseRequest({ kind: "not_mine", history_id: "12" }),
    { ok: true, req: { history_id: 12, kind: "not_mine", detail: "", year: null, team_text: "" } });
  assert.deepEqual(parseRequest({ kind: "wrong_team" }), { ok: false, error: "no-row" });
  assert.deepEqual(parseRequest({ kind: "wrong_team", history_id: -1 }), { ok: false, error: "no-row" });
  assert.deepEqual(parseRequest({ kind: "other", history_id: 3, detail: "  " }), { ok: false, error: "need-detail" });
  assert.equal(parseRequest({ kind: "other", history_id: 3, detail: "그해엔\n알토" }).req.detail, "그해엔 알토");
});

test("parseRequest — 빠진 사역은 연도·부서팀 필수 · 찾아 주세요는 줄 없이", () => {
  assert.deepEqual(parseRequest({ kind: "missing", year: "2023", team_text: " 시온성가대 ", history_id: 9 }),
    { ok: true, req: { history_id: null, kind: "missing", detail: "", year: 2023, team_text: "시온성가대" } });
  assert.deepEqual(parseRequest({ kind: "missing", year: "", team_text: "시온성가대" }), { ok: false, error: "bad-year" });
  assert.deepEqual(parseRequest({ kind: "missing", year: 1900, team_text: "시온성가대" }), { ok: false, error: "bad-year" });
  assert.deepEqual(parseRequest({ kind: "missing", year: 2023, team_text: "" }), { ok: false, error: "need-team" });
  assert.deepEqual(parseRequest({ kind: "missing", year: 2023, team_text: "가".repeat(101) }), { ok: false, error: "too-long" });
  assert.deepEqual(parseRequest({ kind: "find_me", history_id: 5, detail: "목장이 바뀌었어요" }),
    { ok: true, req: { history_id: null, kind: "find_me", detail: "목장이 바뀌었어요", year: null, team_text: "" } });
});

test("parseRequest — 모르는 종류·긴 설명", () => {
  assert.deepEqual(parseRequest({ kind: "delete_all" }), { ok: false, error: "bad-kind" });
  assert.deepEqual(parseRequest({}), { ok: false, error: "bad-kind" });
  assert.deepEqual(parseRequest({ kind: "not_mine", history_id: 1, detail: "가".repeat(201) }), { ok: false, error: "too-long" });
  assert.equal(parseRequest({ kind: "not_mine", history_id: 1, detail: "가".repeat(200) }).ok, true);
});

test("requestBlock — 찾았나 · 이분 줄인가 · 이미 열린 신청 · 20건", () => {
  const line = { history_id: 7, kind: "not_mine", detail: "", year: null, team_text: "" };
  const find = { history_id: null, kind: "find_me", detail: "", year: null, team_text: "" };
  const miss = { history_id: null, kind: "missing", detail: "", year: 2023, team_text: "팀" };
  const mine = new Set([7]);
  assert.equal(requestBlock(line, true, mine, []), null);
  assert.equal(requestBlock(line, false, mine, []), "not-found");
  assert.equal(requestBlock(miss, false, mine, []), "not-found");
  assert.equal(requestBlock(line, true, new Set([8]), []), "not-yours");
  assert.equal(requestBlock(line, true, mine, [{ history_id: 7, kind: "wrong_team" }]), "already-open");
  assert.equal(requestBlock(find, true, mine, []), "already-found");
  assert.equal(requestBlock(find, false, mine, []), null);
  assert.equal(requestBlock(find, false, mine, [{ history_id: null, kind: "find_me" }]), "already-open");
  const many = Array.from({ length: REQ_OPEN_MAX }, (_, i) => ({ history_id: 100 + i, kind: "not_mine" }));
  assert.equal(requestBlock(line, true, mine, many), "too-many");
  assert.equal(requestBlock(miss, true, mine, many.slice(1)), null);
});

test("requestInsert — 신청 때 소속·이름 사본(교구는 교구·목장, 교회학교는 부서·학년)", () => {
  const req = { history_id: 7, kind: "not_mine", detail: "", year: null, team_text: "" };
  const uid = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.deepEqual(requestInsert(req, uid, 5, { type: "교구", gu: "기쁨", mok: "12", bu: "", grade: "", name: "홍길동" }), {
    user_id: uid, person_id: 5, history_id: 7, kind: "not_mine", detail: "", year: null, team_text: "",
    who_type: "교구", who_group: "기쁨", who_sub: "12", who_name: "홍길동",
  });
  const s = requestInsert(req, uid, null, { type: "교회학교", gu: "", mok: "", bu: "중등부", grade: "2학년", name: "홍길동" });
  assert.equal(s.who_group, "중등부"); assert.equal(s.who_sub, "2학년"); assert.equal(s.person_id, null);
});

test("historyRowOut·requestOut — 정해진 칸만(교인ID·user_id·그때 목장·맞춤 근거가 새지 않는다)", () => {
  const h = historyRowOut({ id: "3", year: 2025, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사",
    person_id: 990000001, mok: "기쁨-12", match_basis: "맞음", link_how: "auto", src_note: "x", name: "홍길동" });
  assert.deepEqual(Object.keys(h).sort(), HISTORY_OUT_KEYS);
  assert.equal(h.id, 3);
  const q = requestOut({ id: 1, history_id: null, kind: "find_me", detail: "", year: null, team_text: "", status: "신청",
    answer: "", created_at: "2026-10-01T00:00:00Z", user_id: "u", person_id: 5, handled_by: "m", who_name: "홍길동" });
  assert.deepEqual(Object.keys(q).sort(), REQUEST_OUT_KEYS);
  assert.equal(q.history_id, null);
});

test("sortHistory — 연도 내림차순 · 같은 해는 부서·팀·id 차례", () => {
  const r = (id, year, committee, team) => ({ id, year, committee, team });
  const out = sortHistory([r(1, 2025, "나", "가"), r(2, 2026, "나", "나"), r(3, 2026, "가", "다"), r(4, 2026, "나", "나")]);
  assert.deepEqual(out.map((x) => x.id), [3, 2, 4, 1]);
});

test("내부 액션 둘은 역할 표에 없다 — 카카오 토큰으로 부르면 unknown-action", () => {
  for (const a of ["internalMyHistory", "internalHistoryRequest"]) {
    assert.ok(!(a in ACTION_ROLES), a);
    assert.equal(canCall(a, { status: "active", roles: ["super"] }), "unknown-action");
  }
});

test("직분은 정정하지 않는다 — 「직분이 틀려요」(wrong_position)는 종류에 없다(교적 기준 · 2026-10-01)", () => {
  assert.deepEqual(REQ_LINE_KINDS, ["not_mine", "wrong_team", "other"]);
  assert.deepEqual(REQ_KINDS, ["not_mine", "wrong_team", "other", "missing", "find_me"]);
  assert.deepEqual(parseRequest({ kind: "wrong_position", history_id: 1 }), { ok: false, error: "bad-kind" });
});

test("parseRequestSet — id·상태·답 300자·expect", () => {
  assert.deepEqual(parseRequestSet({ id: "7", status: "반영", answer: " 고쳤어요 ", verified: true, expect: "2026-10-01T00:00:00+00:00" }),
    { ok: true, set: { id: 7, status: "반영", answer: "고쳤어요", verified: true, expect: "2026-10-01T00:00:00+00:00" } });
  assert.deepEqual(parseRequestSet({ id: 0, status: "반영", expect: "x" }), { ok: false, error: "bad-id" });
  assert.deepEqual(parseRequestSet({ id: 1, status: "신청", expect: "x" }), { ok: false, error: "bad-status" });
  assert.deepEqual(parseRequestSet({ id: 1, status: "반영", answer: "가".repeat(301), expect: "x" }), { ok: false, error: "answer-too-long" });
  assert.deepEqual(parseRequestSet({ id: 1, status: "반영", expect: "" }), { ok: false, error: "conflict" });
  assert.equal(parseRequestSet({ id: 1, status: "반영", verified: "true", expect: "x" }).set.verified, false);   // 참은 true 하나만
  assert.deepEqual(REQ_SET_STATUS, ["확인 중", "반영", "반영 안 함"]);
  assert.deepEqual(REQ_FILTERS, ["open", "done", "all"]);
});

test("requestSetBlock — 충돌 · 반영 안 함은 답 · 내 것이 아니에요 반영은 본인 확인", () => {
  const S = (o) => ({ id: 1, status: "반영", answer: "", verified: false, expect: "T1", ...o });
  assert.equal(requestSetBlock(S({}), { kind: "wrong_team", updated_at: "T1" }), null);
  assert.equal(requestSetBlock(S({ expect: "T0" }), { kind: "wrong_team", updated_at: "T1" }), "conflict");
  assert.equal(requestSetBlock(S({ status: "반영 안 함" }), { kind: "wrong_team", updated_at: "T1" }), "need-answer");
  assert.equal(requestSetBlock(S({ status: "반영 안 함", answer: "원본이 맞아요" }), { kind: "wrong_team", updated_at: "T1" }), null);
  assert.equal(requestSetBlock(S({}), { kind: "not_mine", updated_at: "T1" }), "need-verified");
  assert.equal(requestSetBlock(S({ verified: true }), { kind: "not_mine", updated_at: "T1" }), null);
  assert.equal(requestSetBlock(S({ status: "확인 중" }), { kind: "not_mine", updated_at: "T1" }), null);
  assert.equal(requestSetBlock(S({ status: "반영 안 함", answer: "본인이 아니래요" }), { kind: "not_mine", updated_at: "T1" }), null);
});

test("requestSetPatch — 끝난 상태만 handled_at · 확인 중은 null · updated_at 은 늘", () => {
  const set = { id: 1, status: "반영", answer: "고쳤어요", verified: false, expect: "T" };
  assert.deepEqual(requestSetPatch(set, "m1", "2026-10-01T01:00:00.000Z"),
    { status: "반영", answer: "고쳤어요", handled_by: "m1", handled_at: "2026-10-01T01:00:00.000Z", updated_at: "2026-10-01T01:00:00.000Z" });
  assert.equal(requestSetPatch({ ...set, status: "확인 중" }, "m1", "N").handled_at, null);
});

test("requestAuditDetail — 이름·답 없이 id·종류·전후·확인", () => {
  assert.deepEqual(requestAuditDetail({ kind: "not_mine", status: "신청" }, { id: 3, status: "반영", answer: "개인 사정", verified: true, expect: "T" }),
    { id: 3, kind: "not_mine", from: "신청", to: "반영", verified: true });
});

test("requestAdminOut — 정해진 칸만(user_id·person_id·handled_by 없음) · found · 빼 둔 줄", () => {
  const r = { id: "5", kind: "wrong_team", detail: "d", year: null, team_text: "", status: "신청", answer: "", created_at: "C", updated_at: "U",
    handled_at: null, who_type: "교구", who_group: "기쁨", who_sub: "12", who_name: "홍길동", person_id: 990000001, history_id: 9,
    user_id: "0f8fad5b-d9cb-469f-a165-70867728950e", handled_by: "m1" };
  const row = { id: 9, year: 2025, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사", deleted_at: "2026-10-01", person_id: 1, mok: "기쁨-12" };
  const o = requestAdminOut(r, row);
  assert.deepEqual(Object.keys(o).sort(), REQUEST_ADMIN_OUT_KEYS);
  assert.deepEqual(o.who, { type: "교구", group: "기쁨", sub: "12", name: "홍길동" });
  assert.equal(o.found, true);
  assert.deepEqual(o.row, { id: 9, year: 2025, committee: "찬양위원회", team: "시온성가대", role_title: "", position: "집사", deleted: true });
  assert.ok(!JSON.stringify(o).includes("990000001") && !JSON.stringify(o).includes("0f8fad5b") && !JSON.stringify(o).includes("기쁨-12"));
  assert.equal(requestAdminOut({ ...r, person_id: null }, null).found, false);
  assert.equal(requestAdminOut(r, null).row, null);
});

test("filterRequests·requestCounts — 끝나지 않은 것은 오래된 것부터 · 끝난 것·전부는 최근 것부터", () => {
  const q = (id, status, created_at) => ({ id, status, created_at });
  const rows = [q(1, "반영", "2026-09-01"), q(2, "신청", "2026-09-03"), q(3, "확인 중", "2026-09-02"), q(4, "반영 안 함", "2026-09-04")];
  assert.deepEqual(filterRequests(rows, "open").map((x) => x.id), [3, 2]);
  assert.deepEqual(filterRequests(rows, "done").map((x) => x.id), [4, 1]);
  assert.deepEqual(filterRequests(rows, "all").map((x) => x.id), [4, 2, 3, 1]);
  assert.deepEqual(requestCounts(rows), { "신청": 1, "확인 중": 1 });
});
