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

test("toCand — 전화 칸을 번호 목록으로 · kind2 도 읽는다(성경필사 「옮겨 적은 줄」 판정용)", () => {
  // 2026-09-30 kind2 를 더했다(events-person.ts transcribedSame 이 mapChurchPerson 으로 옮겨 적어 보려고) — 판정에만 쓴다
  assert.deepEqual(C({ mok1: "기쁨", mok3: "기쁨-12목장", phone_digits: "01011112222 026861234" }),
    { kind2: "", mok1: "기쁨", mok3: "기쁨-12목장", school_dept: "", phones: ["01011112222", "026861234"] });
  assert.equal(toCand({ kind2: " 교회학교 " }).kind2, "교회학교");
  assert.equal(toCand({}).kind2, "");
});

test("applicantFromWho — 신청 현황의 소속 글자를 푼다", () => {
  // men(목장 칸에 「남성」) — 2026-09-30 더했다. 숫자 목장·교회학교 줄은 false
  assert.deepEqual(applicantFromWho("김철수", "기쁨 12목장", "010-1111-2222"),
    { type: "교구", gu: "기쁨", mok: 12, men: false, bu: "", name: "김철수", phone: "010-1111-2222" });
  assert.deepEqual(applicantFromWho("이영희", "고등부 1학년", ""),
    { type: "교회학교", gu: "", mok: null, men: false, bu: "고등부", name: "이영희", phone: "" });
  assert.deepEqual(applicantFromWho("김철수", "소망 남성", ""),
    { type: "교구", gu: "소망", mok: null, men: true, bu: "", name: "김철수", phone: "" });
  assert.equal(applicantFromWho("김철수", "소망 남성목장", "").men, true);
  assert.deepEqual([applicantFromWho("김철수", "소망 남성2목장", "").men, applicantFromWho("김철수", "소망 남성2목장", "").mok], [true, 2]);
  const t = applicantFromWho("x", "시험 0목장", "");               // 목록에 없는 교구라도 「N목장」이면 교구
  assert.equal(t.type, "교구"); assert.equal(t.gu, "시험"); assert.equal(t.mok, 0);
  assert.equal(applicantFromWho("x", "새가족", "").type, "교구");
  assert.equal(applicantFromWho("x", "청년부 청년1", "").bu, "청년부");
});

test("applicantFromPaper — 종이 명단 줄", () => {
  assert.deepEqual(applicantFromPaper({ gu: "화평", mok: "20목장", name: "박하나", phone: "010-1234-5678" }),
    { type: "교구", gu: "화평", mok: 20, men: false, bu: "", name: "박하나", phone: "010-1234-5678" });
  assert.deepEqual(applicantFromPaper({ gu: "화평", mok: " 남성 ", name: "박하나", phone: "" }),
    { type: "교구", gu: "화평", mok: null, men: true, bu: "", name: "박하나", phone: "" });
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

test("목장 「남성」·「99」(목장 없음) 신청 — 「맞음」으로 억지로 맞추지 않고, 「소속 다름」이라는 틀린 말도 내지 않는다", () => {
  const nam = applicantFromWho("김철수", "기쁨 남성목장", "010-1111-2222");
  const n99 = applicantFromWho("김철수", "기쁨 99목장", "010-1111-2222");
  assert.equal(nam.type, "교구"); assert.equal(nam.mok, null);
  assert.equal(n99.mok, 99);
  const one = [C({ mok1: "기쁨", mok3: "기쁨-12목장", phone_digits: "01011112222" })];
  // 같은 교구 후보 1명, 전화도 같다 → 목장을 확인하라고(소속 다름 아님)
  assert.deepEqual(matchChurch(one, nam), { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
  assert.deepEqual(matchChurch(one, n99), { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
  assert.equal(sameAffiliation(one[0], nam), false);
  assert.equal(sameAffiliation(one[0], n99), false);
  // 명부에 99목장이 정말 있어도 맞음으로 치지 않는다(99 는 「목장 없음」 표시)
  assert.equal(sameAffiliation(C({ mok1: "기쁨", mok3: "기쁨-99목장" }), n99), false);
  // 같은 교구 둘 + 다른 교구 하나 → 같은 교구 수만
  const three = [...one, C({ mok1: "기쁨", mok3: "기쁨-3목장" }), C({ mok1: "소망", mok3: "소망-3목장" })];
  assert.deepEqual(matchChurch(three, nam), { state: "확인 필요", reason: "목장 확인(같은 교구 2명)" });
  // 같은 교구 후보가 없으면 예전 규칙(전화 → 소속 다름 · 아니면 같은 이름 N명)
  assert.deepEqual(matchChurch([C({ mok1: "소망", mok3: "소망-3목장", phone_digits: "01011112222" })], nam),
    { state: "확인 필요", reason: "소속 다름" });
  // 새가족은 그대로 교구만 본다
  assert.deepEqual(matchChurch([C({ mok1: "새가족", mok3: "3월" })], applicantFromWho("김철수", "새가족", "")),
    { state: "맞음", reason: "" });
  // 목장이 제대로 있는데 같은 교구 다른 목장이면 이 규칙을 타지 않는다
  assert.deepEqual(matchChurch([C({ mok1: "기쁨", mok3: "기쁨-13목장", phone_digits: "01011112222" })],
    applicantFromWho("김철수", "기쁨 12목장", "010-1111-2222")), { state: "확인 필요", reason: "소속 다름" });
});

// ── 성경필사(암송) 명단 줄(2026-09-29) ─────────────────────────────
// 맨 위 import 블록은 그대로 두고 새 이름만 새 문으로 들여온다(import 는 모듈 맨 위로 끌어올려진다).
import { applicantFromSignup } from "../supabase/functions/church-admin/people-match.ts";

test("applicantFromSignup — 성경필사(암송) 명단 줄 → Applicant(전화 없음)", () => {
  assert.deepEqual(applicantFromSignup({ who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동" }),
    { type: "교구", gu: "화평", mok: 20, men: false, bu: "", name: "홍길동", phone: "" });
  assert.deepEqual(applicantFromSignup({ who_type: "교회학교", group_name: "청년부", sub_name: "", name: "홍길동" }),
    { type: "교회학교", gu: "", mok: null, men: false, bu: "청년부", name: "홍길동", phone: "" });
  assert.equal(applicantFromSignup({ who_type: "교구", group_name: "화평", sub_name: "07", name: "x" }).mok, 7);
  assert.equal(applicantFromSignup({ who_type: "교구", group_name: "소망", sub_name: "남성", name: "x" }).mok, null);
  assert.equal(applicantFromSignup({ who_type: "교구", group_name: "소망", sub_name: "남성", name: "x" }).men, true);
  assert.equal(applicantFromSignup({ who_type: "교구", group_name: "소망", sub_name: "", name: "x" }).men, false);
  assert.equal(applicantFromSignup({ who_type: "교구", group_name: "소망", sub_name: "", name: "x" }).mok, null);
  assert.equal(applicantFromSignup({ who_type: "교구", group_name: "화평".normalize("NFD"), sub_name: "20", name: "x" }).gu, "화평");
  assert.equal(applicantFromSignup({ who_type: "교회학교", group_name: " 중등부 ", sub_name: "1", name: "x" }).bu, "중등부");
  assert.deepEqual(Object.keys(applicantFromSignup({ who_type: "교구", group_name: "화평", sub_name: "20", name: "x" })).sort(),
    ["bu", "gu", "men", "mok", "name", "phone", "type"]);
});

test("applicantFromSignup + churchFor — 명단 줄의 교적 표시", () => {
  const idx = new Map([
    ["홍길동", [C({ mok1: "화평", mok3: "화평-20목장" })]],
    ["김철수", [C({ mok1: "청년부", mok3: "청년-03" })]],
    ["도하늘", [C({ mok1: "소망", mok3: "소망-남성1" }), C({ mok1: "소망", mok3: "소망-3목장" })]],
  ]);
  const S = (o) => applicantFromSignup({ who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동", ...o });
  assert.deepEqual(churchFor(idx, S({})), { state: "맞음", reason: "" });
  assert.deepEqual(churchFor(idx, S({ sub_name: "21" })), { state: "확인 필요", reason: "같은 이름 1명" });  // 전화가 없어 「소속 다름」이 아니다
  assert.deepEqual(churchFor(idx, S({ who_type: "교회학교", group_name: "청년부", sub_name: "", name: "김철수" })),
    { state: "맞음", reason: "" });                                   // 청년부는 명부의 목장 첫 칸
  // 2026-09-30 까지는 「목장 확인(같은 교구 2명)」이었다 — 「남성」을 목장 모름으로 봤다. 이제 교적 남성 목장(소망-남성1)과 맞댄다
  assert.deepEqual(churchFor(idx, S({ group_name: "소망", sub_name: "남성", name: "도하늘" })), { state: "맞음", reason: "" });
  assert.deepEqual(churchFor(idx, S({ name: "박하나" })), { state: "없음", reason: "" });
  assert.equal(churchFor(null, S({})), null);
});

// ── 「남성」 목장(2026-09-30 친구 제보) ─────────────────────────────
// 교적에 한 분뿐인 「소망-남성1」 분의 성경필사 줄(소망 · 남성)이 「목장 확인(같은 교구 1명)」으로 떴다 — 「남성」을 목장 모름으로 봤다.
// 이제 신청 쪽 「남성」(men)은 교적 목장 칸에 「남성」이 든 분(candMen)과 맞댄다. 교적 표기는 운영 교적에서 센 일곱 꼴 그대로.
import { candMen, mokToConfirm, mokUnknown } from "../supabase/functions/church-admin/people-match.ts";

const SG = (group_name, sub_name, name = "김철수") => applicantFromSignup({ who_type: "교구", group_name, sub_name, name });

test("남성 — 교적 남성 목장 일곱 꼴(「믿음-남성」·「소망-남성1」·「은혜-남성목장」 …)과 맞는다 · 번호 목장과는 안 맞는다", () => {
  const forms = [["믿음", "믿음-남성"], ["사랑", "사랑-남성"], ["섬김", "섬김-남성"], ["소망", "소망-남성1"], ["소망", "소망-남성2"],
    ["은혜", "은혜-남성목장"], ["화평", "화평-남성"]];
  for (const [gu, mok3] of forms) {
    const c = C({ mok1: gu, mok3 });
    assert.equal(candMen(c), true, mok3);
    assert.equal(sameAffiliation(c, SG(gu, "남성")), true, mok3);
    assert.deepEqual(matchChurch([c], SG(gu, "남성")), { state: "맞음", reason: "" }, mok3);
    assert.equal(sameAffiliation(c, SG(gu === "믿음" ? "소망" : "믿음", "남성")), false, "교구가 다르면 아니다 " + mok3);
  }
  // 친구 제보 그대로 — 「소망 남성」 ↔ 「소망-남성1」 · 「믿음 남성」 ↔ 「믿음-남성」 · 「은혜 남성」 ↔ 「은혜-남성목장」
  assert.deepEqual(matchChurch([C({ mok1: "소망", mok3: "소망-남성1" })], SG("소망", "남성")), { state: "맞음", reason: "" });
  assert.deepEqual(matchChurch([C({ mok1: "믿음", mok3: "믿음-남성" })], SG("믿음", "남성")), { state: "맞음", reason: "" });
  assert.deepEqual(matchChurch([C({ mok1: "은혜", mok3: "은혜-남성목장" })], SG("은혜", "남성")), { state: "맞음", reason: "" });
  // 「남성목장」으로 적은 줄도 같다
  assert.deepEqual(matchChurch([C({ mok1: "소망", mok3: "소망-남성1" })], SG("소망", "남성목장")), { state: "맞음", reason: "" });
  // 남성은 이제 「목장 모름」이 아니다 · 99·빈칸은 그대로 모름
  assert.equal(mokUnknown(SG("소망", "남성")), false);
  assert.equal(mokUnknown(SG("소망", "99")), true);
  assert.equal(mokUnknown(SG("소망", "")), true);
  assert.equal(candMen(C({ mok1: "소망", mok3: "소망-3목장" })), false);
});

test("남성 — 교적 소망-남성1·소망-남성2 에 같은 이름 둘 → 「같은 소속에 같은 이름 2명」 · 신청에 번호까지 있으면 그 번호만", () => {
  const two = [C({ mok1: "소망", mok3: "소망-남성1" }), C({ mok1: "소망", mok3: "소망-남성2" }), C({ mok1: "소망", mok3: "소망-3목장" })];
  assert.deepEqual(matchChurch(two, SG("소망", "남성")), { state: "확인 필요", reason: "같은 소속에 같은 이름 2명" });
  // 사역신청 who 「소망 남성2목장」 같은 꼴 — 남성이면서 번호가 있으면 번호도 같아야
  assert.deepEqual(matchChurch(two, applicantFromWho("김철수", "소망 남성2목장", "")), { state: "맞음", reason: "" });
  assert.equal(sameAffiliation(two[0], applicantFromWho("김철수", "소망 남성2목장", "")), false);
  assert.equal(sameAffiliation(C({ mok1: "은혜", mok3: "은혜-남성목장" }), applicantFromWho("김철수", "은혜 남성2목장", "")), false,
    "번호 없는 교적 남성 목장은 번호가 적힌 신청과 맞대지 않는다");
});

test("⚠️ 「소망 1목장」 신청 ↔ 교적 「소망-남성1」 은 같은 소속이 아니다(mokNumber 가 1 을 내던 함정) · 동명이인 「소망-1목장」이 있으면 그분만", () => {
  const men1 = C({ mok1: "소망", mok3: "소망-남성1" }), mok1 = C({ mok1: "소망", mok3: "소망-1목장" });
  assert.equal(mokNumber("소망-남성1"), 1, "mokNumber 자체는 그대로 — 그래서 sameAffiliation 이 candMen 을 먼저 본다");
  for (const a of [SG("소망", "1"), SG("소망", "01"), SG("소망", "1목장"), applicantFromWho("김철수", "소망 1목장", ""),
    applicantFromPaper({ gu: "소망", mok: "1", name: "김철수", phone: "" })]) {
    assert.equal(sameAffiliation(men1, a), false, JSON.stringify(a));
    assert.equal(sameAffiliation(mok1, a), true, JSON.stringify(a));
    assert.deepEqual(matchChurch([men1, mok1], a), { state: "맞음", reason: "" }, "동명이인 중 1목장 분만");
    assert.deepEqual(matchChurch([men1], a), { state: "확인 필요", reason: "같은 이름 1명" }, "남성1 목장 분 한 분뿐이면 맞음이 아니다");
  }
  // 소망-남성2 도 2목장이 아니다
  assert.equal(sameAffiliation(C({ mok1: "소망", mok3: "소망-남성2" }), SG("소망", "2")), false);
});

test("남성 — 교적은 숫자 목장뿐이면 사실대로 「목장 확인(같은 교구 N명)」 · 99·빈 목장은 예전대로", () => {
  // 「화평 남성」인데 교적은 「화평-12목장」 한 분
  const one = [C({ mok1: "화평", mok3: "화평-12목장" })];
  assert.deepEqual(matchChurch(one, SG("화평", "남성")), { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
  assert.equal(mokToConfirm(SG("화평", "남성")), true);
  // 같은 교구 남성 목장 분이 하나라도 있으면 그쪽(목장 확인 아님)
  assert.deepEqual(matchChurch([...one, C({ mok1: "화평", mok3: "화평-남성" })], SG("화평", "남성")), { state: "맞음", reason: "" });
  // 99·빈 목장은 예전 그대로 「목장 확인」 — 교적이 남성 목장이어도 맞음으로 치지 않는다
  const menDir = [C({ mok1: "소망", mok3: "소망-남성1" })];
  assert.deepEqual(matchChurch(menDir, SG("소망", "99")), { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
  assert.deepEqual(matchChurch(menDir, SG("소망", "")), { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
  assert.deepEqual(matchChurch(one, SG("화평", "99")), { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
  // 새가족은 교구만(남성이라 적어도)
  assert.equal(mokToConfirm(SG("새가족", "남성")), false);
  assert.deepEqual(matchChurch([C({ mok1: "새가족", mok3: "2026-09" })], SG("새가족", "")), { state: "맞음", reason: "" });
  // 교회학교 줄은 「남성」과 상관없다
  assert.equal(mokToConfirm({ type: "교회학교", gu: "", mok: null, men: false, bu: "중등부", name: "x", phone: "" }), false);
});

test("남성 — 사역 who(applicantFromWho)·종이 명단(applicantFromPaper)도 같은 규칙", () => {
  const dir = [C({ mok1: "소망", mok3: "소망-남성1" }), C({ mok1: "소망", mok3: "소망-3목장" })];
  assert.deepEqual(matchChurch(dir, applicantFromWho("김철수", "소망 남성", "")), { state: "맞음", reason: "" });
  assert.deepEqual(matchChurch(dir, applicantFromWho("김철수", "소망 남성목장", "")), { state: "맞음", reason: "" });
  assert.deepEqual(matchChurch(dir, applicantFromPaper({ gu: "소망", mok: "남성", name: "김철수", phone: "" })), { state: "맞음", reason: "" });
  assert.deepEqual(matchChurch(dir, applicantFromPaper({ gu: "소망", mok: "남성목장", name: "김철수", phone: "" })), { state: "맞음", reason: "" });
  // 교적 남성 목장이 없는 교구(기쁨)에 「남성」 — 같은 교구 숫자 목장 분이 있으면 목장 확인
  assert.deepEqual(matchChurch([C({ mok1: "기쁨", mok3: "기쁨-4목장" })], applicantFromWho("김철수", "기쁨 남성", "")),
    { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
});

test("남성 — 전화가 있어도 차례는 ① 같은 소속(남성 목장) ② 같은 교구 「목장 확인」 ③ 전화 「소속 다름」 ④ 같은 이름 N명", () => {
  const ph = "010-0000-0007";
  // ① 소망-남성1 분(번호 다름)과 믿음 분(번호 같음) — 번호보다 같은 소속이 먼저
  assert.deepEqual(matchChurch([C({ mok1: "소망", mok3: "소망-남성1", phone_digits: "01000000001" }),
    C({ mok1: "믿음", mok3: "믿음-3목장", phone_digits: "01000000007" })], applicantFromWho("김철수", "소망 남성", ph)),
  { state: "맞음", reason: "" });
  // ② 같은 교구 숫자 목장 분의 번호가 같아도 「소속 다름」이 아니라 「목장 확인」
  assert.deepEqual(matchChurch([C({ mok1: "화평", mok3: "화평-12목장", phone_digits: "01000000007" })], applicantFromWho("김철수", "화평 남성", ph)),
    { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
  // ③ 같은 교구 후보가 없고 번호가 맞으면 「소속 다름」
  assert.deepEqual(matchChurch([C({ mok1: "믿음", mok3: "믿음-남성", phone_digits: "01000000007" })], applicantFromWho("김철수", "화평 남성", ph)),
    { state: "확인 필요", reason: "소속 다름" });
  // ④ 아무것도 아니면 같은 이름 N명
  assert.deepEqual(matchChurch([C({ mok1: "믿음", mok3: "믿음-남성" })], applicantFromWho("김철수", "화평 남성", ph)),
    { state: "확인 필요", reason: "같은 이름 1명" });
  // 숫자 목장 신청이 남성 목장 분 번호와 맞으면 「소속 다름」(같은 소속으로 치지 않았으니)
  assert.deepEqual(matchChurch([C({ mok1: "소망", mok3: "소망-남성1", phone_digits: "01000000007" })], applicantFromWho("김철수", "소망 1목장", ph)),
    { state: "확인 필요", reason: "소속 다름" });
});

test("matchChurch·churchFor 의 셋째 인자(isSame) — 「같은 소속」 판정을 통째로 바꾼다 · 넘기지 않으면 예전 그대로(sameAffiliation)", () => {
  // 2026-09-30 오전엔 「더할 분」(more · sameAffiliation 과 또는)이었다 — 성경필사 줄이 교구 줄에서 아이를 **빼야** 해서 판정 전체를 받는다
  const a = SG("화평", "");
  const dir = [C({ mok1: "화평", mok3: "화평-" }), C({ mok1: "소망", mok3: "소망-3목장" })];
  assert.deepEqual(matchChurch(dir, a), { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
  assert.deepEqual(matchChurch(dir, a, (c) => c.mok3 === "화평-"), { state: "맞음", reason: "" });
  assert.deepEqual(matchChurch(dir, a, () => true), { state: "확인 필요", reason: "같은 소속에 같은 이름 2명" });
  assert.deepEqual(matchChurch(dir, a, () => false), matchChurch(dir, a));
  // 더하기가 아니라 바꾸기다 — sameAffiliation 이 맞다는 분도 isSame 이 아니라면 같은 소속이 아니다(뒤 단계로 간다)
  const n20 = [C({ mok1: "화평", mok3: "화평-20목장" })];
  assert.deepEqual(matchChurch(n20, SG("화평", "20")), { state: "맞음", reason: "" });
  assert.deepEqual(matchChurch(n20, SG("화평", "20"), () => false), { state: "확인 필요", reason: "같은 이름 1명" });
  const idx = new Map([["김철수", dir]]);
  assert.deepEqual(churchFor(idx, a, (c) => c.mok3 === "화평-"), { state: "맞음", reason: "" });
  assert.equal(churchFor(null, a, () => true), null, "명부 없음은 여전히 null");
  assert.equal(churchFor(idx, { ...a, name: "김(철수)" }, () => true), null, "물을 수 없는 이름도 null");
});

// ── 명부의 아이(kind2 교회학교·학생 · 2026-09-30 옮겨 적기 검토 2·4) ─────────────────
// 명부에는 아이도 가족의 교구·목장이 있다(events-people.ts ⚠️). 「남성」 갈래(2026-09-30 새로 연 것)는 아이를 뺀다 — 사역 줄도.
// 숫자 목장 갈래는 사역 줄 표시가 함께 바뀌는 오래된 동작이라 그대로 둔다(성경필사 줄은 events-person.ts signupSame 이 뺀다).
import { KID_KIND2, candKid } from "../supabase/functions/church-admin/people-match.ts";
import { mapChurchPerson } from "../supabase/functions/church-admin/events-people.ts";

test("KID_KIND2 — events-people.ts 의 아이 목록(mapChurchPerson 규칙 1)과 같다", () => {
  // events-people.ts 의 KID_KIND2 는 내보내지 않는다(그 파일이 이 파일을 import 한다) — 옮겨 적기 결과로 맞대 본다
  for (const kind2 of ["교회학교", "학생", "장년", "청년", "노년", "유아", "교역자", "", " 학생 ", "학생".normalize("NFD")]) {
    const p = { name_key: "x", kind2, mok1: "소망", mok3: "소망-3목장", school_dept: "중등부", position: "", position_detail: "" };
    assert.equal(candKid(toCand(p)), mapChurchPerson(p)?.who_type === "교회학교", JSON.stringify(kind2));
  }
  assert.deepEqual(KID_KIND2, ["교회학교", "학생"]);
});

test("남성 — 가족 목장 칸이 「소망-남성1」인 아이는 「소망 남성」 줄과 같은 소속이 아니다(성경필사·사역 줄 모두) · 숫자 목장은 예전 그대로", () => {
  const kid = C({ kind2: "학생", mok1: "소망", mok3: "소망-남성1", school_dept: "중등부" });
  const adult = C({ kind2: "장년", mok1: "소망", mok3: "소망-남성1" });
  for (const a of [SG("소망", "남성"), applicantFromWho("김철수", "소망 남성", ""), applicantFromPaper({ gu: "소망", mok: "남성", name: "김철수", phone: "" })]) {
    assert.equal(sameAffiliation(kid, a), false, JSON.stringify(a));
    assert.equal(sameAffiliation(adult, a), true, JSON.stringify(a));
    // 아이 한 분뿐이면 이 갈래를 열기 전 결과 그대로 「목장 확인(같은 교구 1명)」
    assert.deepEqual(matchChurch([kid], a), { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
    // 어른과 아이 동명이인 — 어른 한 분이 같은 소속(「같은 소속에 같은 이름 2명」이 아니다)
    assert.deepEqual(matchChurch([kid, adult], a), { state: "맞음", reason: "" });
  }
  assert.equal(sameAffiliation(C({ kind2: "교회학교", mok1: "소망", mok3: "소망-남성2", school_dept: "유년부" }), applicantFromWho("김철수", "소망 남성2목장", "")), false);
  // ⚠️ 숫자 목장 갈래는 아이를 빼지 않는다(사역 줄 표시가 바뀐다 — 친구에게 물을 일). 바꾸면 이 줄이 알려 준다
  assert.equal(sameAffiliation(C({ kind2: "학생", mok1: "소망", mok3: "소망-3목장", school_dept: "중등부" }), applicantFromWho("김철수", "소망 3목장", "")), true);
});
