import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nameKey, phoneDigits, mokNumber, toCand, applicantFromWho, applicantFromPaper,
  sameAffiliation, matchChurch, churchFor, lookupKeys,
} from "../supabase/functions/church-admin/people-match.ts";

const C = (o) => toCand({ mok1: "", mok3: "", school_dept: "", phone_digits: "", ...o });
const A = (o) => ({ type: "교구", gu: "", mok: null, bu: "", name: "김철수", phone: "", ...o });

test("nameKey — 띄어쓰기를 없애고 자모분리(NFD)를 완성형으로", () => {
  assert.equal(nameKey(" 김 철수 "), "김철수");
  assert.equal(nameKey("김철수"), "김철수");
  assert.equal(nameKey(null), "");
  assert.equal(phoneDigits("010-1234 5678"), "01012345678");
});

test("mokNumber — 명부 「기쁨-12목장」과 앱 「12」·「12목장」이 같은 수", () => {
  assert.equal(mokNumber("기쁨-12목장"), 12);
  assert.equal(mokNumber("기쁨-01목장"), 1);
  assert.equal(mokNumber("12"), 12);
  assert.equal(mokNumber("12목장"), 12);
  assert.equal(mokNumber("0목장"), 0);
  assert.equal(mokNumber("청년-03"), 3);
  assert.equal(mokNumber("화평 남성목장"), null);
  assert.equal(mokNumber("3월"), null);
  assert.equal(mokNumber(""), null);
});

test("toCand — 전화 칸을 번호 목록으로", () => {
  assert.deepEqual(C({ mok1: "기쁨", mok3: "기쁨-12목장", phone_digits: "01011112222 026861234" }),
    { mok1: "기쁨", mok3: "기쁨-12목장", school_dept: "", phones: ["01011112222", "026861234"] });
});

test("applicantFromWho — 신청 현황의 소속 글자를 푼다", () => {
  assert.deepEqual(applicantFromWho("김철수", "기쁨 12목장", "010-1111-2222"),
    { type: "교구", gu: "기쁨", mok: 12, bu: "", name: "김철수", phone: "010-1111-2222" });
  assert.deepEqual(applicantFromWho("이영희", "고등부 1학년", ""),
    { type: "교회학교", gu: "", mok: null, bu: "고등부", name: "이영희", phone: "" });
  const t = applicantFromWho("x", "시험 0목장", "");               // 목록에 없는 교구라도 「N목장」이면 교구
  assert.equal(t.type, "교구"); assert.equal(t.gu, "시험"); assert.equal(t.mok, 0);
  assert.equal(applicantFromWho("x", "새가족", "").type, "교구");
  assert.equal(applicantFromWho("x", "청년부 청년1", "").bu, "청년부");
});

test("applicantFromPaper — 종이 명단 줄", () => {
  assert.deepEqual(applicantFromPaper({ gu: "화평", mok: "20목장", name: "박하나", phone: "010-1234-5678" }),
    { type: "교구", gu: "화평", mok: 20, bu: "", name: "박하나", phone: "010-1234-5678" });
});

test("sameAffiliation — 교구·목장 / 새가족은 교구만 / 교회학교는 부서 또는 청년부", () => {
  assert.equal(sameAffiliation(C({ mok1: "기쁨", mok3: "기쁨-12목장" }), A({ gu: "기쁨", mok: 12 })), true);
  assert.equal(sameAffiliation(C({ mok1: "기쁨", mok3: "기쁨-13목장" }), A({ gu: "기쁨", mok: 12 })), false);
  assert.equal(sameAffiliation(C({ mok1: "소망", mok3: "소망-12목장" }), A({ gu: "기쁨", mok: 12 })), false);
  assert.equal(sameAffiliation(C({ mok1: "기쁨", mok3: "기쁨-12목장" }), A({ gu: "기쁨", mok: null })), false);
  assert.equal(sameAffiliation(C({ mok1: "새가족", mok3: "3월" }), A({ gu: "새가족" })), true);
  assert.equal(sameAffiliation(C({ school_dept: "고등부" }), A({ type: "교회학교", bu: "고등부" })), true);
  assert.equal(sameAffiliation(C({ mok1: "청년부", mok3: "청년-03" }), A({ type: "교회학교", bu: "청년부" })), true);
  assert.equal(sameAffiliation(C({ school_dept: "중등부" }), A({ type: "교회학교", bu: "고등부" })), false);
});

test("matchChurch — 없음 · 맞음 · 같은 소속 여럿 · 소속 다름(전화) · 같은 이름 N명", () => {
  const a = A({ gu: "기쁨", mok: 12, phone: "010-1111-2222" });
  assert.deepEqual(matchChurch(undefined, a), { state: "없음", reason: "" });
  assert.deepEqual(matchChurch([], a), { state: "없음", reason: "" });
  assert.deepEqual(matchChurch([C({ mok1: "기쁨", mok3: "기쁨-12목장" })], a), { state: "맞음", reason: "" });
  assert.deepEqual(matchChurch([C({ mok1: "기쁨", mok3: "기쁨-12목장" }), C({ mok1: "기쁨", mok3: "기쁨-12목장" })], a),
    { state: "확인 필요", reason: "같은 소속에 같은 이름 2명" });
  assert.deepEqual(matchChurch([C({ mok1: "소망", mok3: "소망-3목장", phone_digits: "01011112222" })], a),
    { state: "확인 필요", reason: "소속 다름" });
  assert.deepEqual(matchChurch([C({ mok1: "소망", mok3: "소망-3목장" }), C({ mok1: "사랑", mok3: "사랑-1목장" })], a),
    { state: "확인 필요", reason: "같은 이름 2명" });
});

test("churchFor — 명부 없음은 null · 이름에 .in() 을 깨는 글자가 있으면 null · 결과는 두 칸만", () => {
  const idx = new Map([["김철수", [C({ mok1: "기쁨", mok3: "기쁨-12목장", phone_digits: "01099998888" })]]]);
  assert.equal(churchFor(null, A({ gu: "기쁨", mok: 12 })), null);
  assert.equal(churchFor(idx, A({ name: '김,"철수' })), null);
  assert.equal(churchFor(idx, A({ name: "" })), null);
  const r = churchFor(idx, A({ name: "김 철수", gu: "기쁨", mok: 12 }));
  assert.deepEqual(Object.keys(r).sort(), ["reason", "state"]);
  assert.equal(r.state, "맞음");
  assert.deepEqual(churchFor(idx, A({ name: "박없음" })), { state: "없음", reason: "" });
});

test("lookupKeys — 겹침·빈 것·깨는 글자를 뺀다", () => {
  assert.deepEqual(lookupKeys(["김 철수", "김철수", "", null, "이(영희)"]), ["김철수"]);
});

test("교구·목장·부서도 완성형(NFC)·앞뒤 빈칸을 맞춰 비교한다", () => {
  const giNFD = "기쁨";          // 「기쁨」 자모분리
  assert.equal(sameAffiliation(C({ mok1: giNFD, mok3: " 기쁨-12목장 " }), A({ gu: "기쁨", mok: 12 })), true);
  assert.equal(sameAffiliation(C({ school_dept: " 고등부 " }), A({ type: "교회학교", bu: "고등부" })), true);
  const w = applicantFromWho("김철수", giNFD + " 12목장", "");
  assert.equal(w.type, "교구");
  assert.equal(w.gu, "기쁨");
  assert.equal(applicantFromPaper({ gu: " " + giNFD + " ", mok: "12", name: "김철수", phone: "" }).gu, "기쁨");
  assert.equal(toCand({ mok1: giNFD }).mok1, "기쁨");
});
