// 사역 이력 확인 · 정정 신청 — 순수 함수 시험(2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md)
//   node --experimental-strip-types --test tests/history-check.test.mjs
// ⚠️ 이름은 지어낸 것만(홍길동). 공용 people-match.test.mjs 는 다른 세션이 고치는 중이라 이 파일에 둔다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applicantFromLogin, loginNameKey, matchLoginPerson } from "../supabase/functions/church-admin/people-match.ts";

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
