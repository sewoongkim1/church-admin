import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapChurchPerson, positionFromChurch, lookupView,
} from "../supabase/functions/church-admin/events-people.ts";

// 시험용 명부 한 분 — 가짜 값만(진짜 명단은 저장소에 넣지 않는다)
const P = (o = {}) => ({ name_key: "홍길동", kind2: "장년", mok1: "", mok3: "", school_dept: "", position: "", position_detail: "", ...o });

test("mapChurchPerson 규칙 1 — 아이는 kind2 를 먼저 본다(가족의 교구·목장이 있어도 부서로)", () => {
  assert.deepEqual(mapChurchPerson(P({ kind2: "교회학교", mok1: "화평", mok3: "화평-20목장", school_dept: "중등부" })),
    { who_type: "교회학교", group_name: "중등부", sub_name: "" });
  assert.deepEqual(mapChurchPerson(P({ kind2: "학생", mok1: "기쁨", mok3: "기쁨-03목장", school_dept: "고등부" })),
    { who_type: "교회학교", group_name: "고등부", sub_name: "" });
  // 부서가 없는 아이 — 부모 목장으로 보내지 않고 소속을 정하지 않는다
  assert.equal(mapChurchPerson(P({ kind2: "교회학교", mok1: "화평", mok3: "화평-20목장", school_dept: "" })), null);
});

test("mapChurchPerson 규칙 2 — 7교구 · 목장 = mok3 끝 숫자 · 「남성」 · 숫자 없으면 교구만", () => {
  assert.deepEqual(mapChurchPerson(P({ mok1: "기쁨", mok3: "기쁨-01목장" })), { who_type: "교구", group_name: "기쁨", sub_name: "1" });
  assert.deepEqual(mapChurchPerson(P({ mok1: "화평", mok3: "화평-20목장" })), { who_type: "교구", group_name: "화평", sub_name: "20" });
  assert.deepEqual(mapChurchPerson(P({ mok1: "소망", mok3: "소망-남성1" })), { who_type: "교구", group_name: "소망", sub_name: "남성" });
  assert.deepEqual(mapChurchPerson(P({ mok1: "화평", mok3: "화평-남성목장" })), { who_type: "교구", group_name: "화평", sub_name: "남성" });
  assert.deepEqual(mapChurchPerson(P({ mok1: "은혜", mok3: "은혜" })), { who_type: "교구", group_name: "은혜", sub_name: "" });
  assert.deepEqual(mapChurchPerson(P({ mok1: "은혜", mok3: "" })), { who_type: "교구", group_name: "은혜", sub_name: "" });
  for (const g of ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨"]) {
    assert.equal(mapChurchPerson(P({ mok1: g, mok3: g + "-05목장" })).sub_name, "5", g);
  }
  // 청년이라도 명부 mok1 이 교구면 규칙 2 가 먼저다(설계 차례 그대로)
  assert.deepEqual(mapChurchPerson(P({ kind2: "청년", mok1: "화평", mok3: "화평-20목장" })),
    { who_type: "교구", group_name: "화평", sub_name: "20" });
  // 자모분리·빈칸이 섞여 와도 완성형으로 맞춘다
  assert.deepEqual(mapChurchPerson(P({ mok1: " " + "기쁨".normalize("NFD") + " ", mok3: "기쁨-12목장" })),
    { who_type: "교구", group_name: "기쁨", sub_name: "12" });
});

test("mapChurchPerson 규칙 3 — 청년부·청년공동체·청년새가족 → 교회학교 청년부", () => {
  for (const m of ["청년부", "청년공동체", "청년새가족"]) {
    assert.deepEqual(mapChurchPerson(P({ kind2: "청년", mok1: m, mok3: "청년-03" })),
      { who_type: "교회학교", group_name: "청년부", sub_name: "" }, m);
  }
});

test("mapChurchPerson 규칙 4 — 그 밖에는 부서가 있으면 부서 · 없으면 null(새가족·임시교구)", () => {
  assert.deepEqual(mapChurchPerson(P({ mok1: "", school_dept: "사랑부" })), { who_type: "교회학교", group_name: "사랑부", sub_name: "" });
  assert.equal(mapChurchPerson(P({ mok1: "새가족", mok3: "3월" })), null);
  assert.equal(mapChurchPerson(P({ mok1: "임시교구", mok3: "임시-1" })), null);
  assert.equal(mapChurchPerson(P({})), null);
});

test("positionFromChurch 규칙 5 — 대분류 + 명예·은퇴·원로 · 서리·시무·협동은 뗀다", () => {
  const cases = [
    ["권사", "은퇴협동권사", "은퇴권사"],
    ["집사", "서리집사은퇴", "은퇴집사"],
    ["장로", "원로장로", "원로장로"],
    ["권사", "명예권사", "명예권사"],
    ["안수집사", "은퇴안수집사", "은퇴안수집사"],
    ["집사", "서리집사", "집사"],
    ["권사", "시무권사", "권사"],
    ["장로", "시무장로", "장로"],
    ["권사", "협동권사", "권사"],
    ["성도", "", "성도"],
    [" 집사 ", "", "집사"],
    ["", "은퇴권사", ""],                 // 대분류가 비면 채우지 않는다
    ["", "", ""],
  ];
  for (const [position, position_detail, want] of cases) {
    assert.equal(positionFromChurch(P({ position, position_detail })), want, `${position}/${position_detail}`);
  }
});

test("lookupView — 다섯 칸만(이름·구분·소속·세부·직분)", () => {
  const p = P({ kind2: "장년", mok1: "화평", mok3: "화평-20목장", position: "권사", position_detail: "은퇴협동권사" });
  const v = lookupView(p, " 홍길동 ");
  assert.deepEqual(v, { name: "홍길동", who_type: "교구", group_name: "화평", sub_name: "20", position: "은퇴권사" });
  assert.deepEqual(Object.keys(v).sort(), ["group_name", "name", "position", "sub_name", "who_type"]);
  assert.deepEqual(lookupView(P({ mok1: "새가족", mok3: "3월", position: "성도" }), "홍길동"),
    { name: "홍길동", who_type: "", group_name: "", sub_name: "", position: "성도" });
  // 명부의 원래 칸(name_key·kind2·mok1·mok3·position_detail)은 따라 나가지 않는다
  const s = JSON.stringify(lookupView(P({ kind2: "교회학교", school_dept: "중등부", mok1: "화평", mok3: "화평-20목장" }), "홍길동"));
  for (const bad of ["name_key", "kind2", "mok1", "mok3", "position_detail", "school_dept", "화평-20목장"]) assert.ok(!s.includes(bad), bad);
});

// ── 빈칸 채우기 ────────────────────────────────────────────────────
// import 는 모듈 맨 위로 끌어올려진다 — 맨 위 import 블록을 고치지 않고 새 문으로 들여온다.
import { fillDecision } from "../supabase/functions/church-admin/events-people.ts";

const ADULT = P({ kind2: "장년", mok1: "화평", mok3: "화평-20목장", position: "권사", position_detail: "은퇴협동권사" });
const KID = P({ kind2: "교회학교", mok1: "화평", mok3: "화평-20목장", school_dept: "유년부" });
const YOUTH = P({ kind2: "청년", mok1: "청년부", mok3: "청년-03", position: "성도" });
const NEWBIE = P({ kind2: "장년", mok1: "새가족", mok3: "3월", position: "성도" });
const W = (o = {}) => ({ who_type: "교구", group_name: "", sub_name: "", name: "홍길동", position: "", ...o });
const NONE = (reason) => ({ patch: null, reason });

test("fillDecision — 명부에 없음 · 동명이인", () => {
  assert.deepEqual(fillDecision(W(), []), NONE("not-in-directory"));
  assert.deepEqual(fillDecision(W(), [ADULT, ADULT]), NONE("same-name"));
  // 소속이 적힌 줄도 same-name — 그 줄을 넣을지(add)는 부르는 쪽(Task 8)이 정한다
  assert.deepEqual(fillDecision(W({ group_name: "화평", sub_name: "20" }), [ADULT, ADULT]), NONE("same-name"));
});

test("fillDecision — 소속이 빈 줄은 구분·소속·세부 한 벌과 빈 직분을 명부대로", () => {
  assert.deepEqual(fillDecision(W(), [ADULT]),
    { patch: { who_type: "교구", group_name: "화평", sub_name: "20", position: "은퇴권사" }, reason: "filled" });
  assert.deepEqual(fillDecision(W(), [KID]),
    { patch: { who_type: "교회학교", group_name: "유년부", sub_name: "" }, reason: "filled" });   // 아이는 부모 목장이 아니라 부서로
  assert.deepEqual(fillDecision(W(), [YOUTH]),
    { patch: { who_type: "교회학교", group_name: "청년부", sub_name: "", position: "성도" }, reason: "filled" });
  assert.deepEqual(fillDecision({ name: "홍길동" }, [ADULT]),                          // 칸이 아예 없어도 빈칸으로 본다
    { patch: { who_type: "교구", group_name: "화평", sub_name: "20", position: "은퇴권사" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ who_type: "" }), [KID]),                           // 올리기에서 교구 칸이 비었던 줄(구분 "")
    { patch: { who_type: "교회학교", group_name: "유년부", sub_name: "" }, reason: "filled" });
  const r = fillDecision(W(), [ADULT]);
  assert.ok(!("name" in r.patch));
});

test("fillDecision — 소속을 명부로 채우면 적혀 있던 목장도 명부 값으로 바꾼다", () => {
  assert.deepEqual(fillDecision(W({ sub_name: "21" }), [ADULT]),
    { patch: { who_type: "교구", group_name: "화평", sub_name: "20", position: "은퇴권사" }, reason: "filled" });
  assert.equal(fillDecision(W({ sub_name: "20" }), [ADULT]).patch.sub_name, "20");    // 같아도 한 벌로 싣는다
  const noMok = P({ kind2: "장년", mok1: "은혜", mok3: "은혜", position: "집사" });   // 명부에 목장 숫자가 없는 분
  assert.deepEqual(fillDecision(W({ sub_name: "5" }), [noMok]),
    { patch: { who_type: "교구", group_name: "은혜", sub_name: "", position: "집사" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ sub_name: "3" }), [KID]),                          // 아이 — 적힌 목장을 부서 줄에 남기지 않는다
    { patch: { who_type: "교회학교", group_name: "유년부", sub_name: "" }, reason: "filled" });
});

test("fillDecision — 소속이 같으면 빈 칸만 채운다(적힌 칸은 덮지 않는다)", () => {
  assert.deepEqual(fillDecision(W({ group_name: "화평", sub_name: "20", position: "집사" }), [ADULT]), NONE("nothing-blank"));
  assert.deepEqual(fillDecision(W({ group_name: "화평", sub_name: "20" }), [ADULT]),
    { patch: { position: "은퇴권사" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ group_name: "화평", position: "집사" }), [ADULT]),   // 같은 교구면 빈 목장을
    { patch: { sub_name: "20" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ group_name: "화평", sub_name: "21" }), [ADULT]),     // 같은 교구 다른 목장 — 목장은 그대로 · 직분만
    { patch: { position: "은퇴권사" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ group_name: "새가족" }), [NEWBIE]),                  // 새가족끼리 — 직분만(목장 칸은 연도·월)
    { patch: { position: "성도" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "청년부" }), [YOUTH]),
    { patch: { position: "성도" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "청년부", position: "성도" }), [YOUTH]), NONE("nothing-blank"));
});

test("fillDecision — 적힌 소속이 명부와 다르면 아무것도 채우지 않는다(different-affiliation)", () => {
  assert.deepEqual(fillDecision(W({ group_name: "기쁨" }), [ADULT]), NONE("different-affiliation"));        // 직분도 채우지 않는다
  assert.deepEqual(fillDecision(W({ group_name: "기쁨", position: "집사" }), [ADULT]), NONE("different-affiliation"));
  assert.deepEqual(fillDecision(W({ group_name: "새가족" }), [ADULT]), NONE("different-affiliation"));
  assert.deepEqual(fillDecision(W({ group_name: "화평" }), [NEWBIE]), NONE("different-affiliation"));
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "청년부" }), [KID]), NONE("different-affiliation"));
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "중등부" }), [P({ kind2: "학생", school_dept: "고등부" })]),
    NONE("different-affiliation"));
  // 명부가 소속을 못 정하는 분(임시교구)이면 같은지 알 수 없다 → no-affiliation(역시 채우지 않는다)
  assert.deepEqual(fillDecision(W({ group_name: "화평" }), [P({ mok1: "임시교구", mok3: "임시-1", position: "성도" })]),
    NONE("no-affiliation"));
});

test("fillDecision — 아이↔어른은 다른 사람으로 본다(kid-adult)", () => {
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "중등부" }), [ADULT]), NONE("kid-adult"));
  assert.deepEqual(fillDecision(W({ position: "학생" }), [ADULT]), NONE("kid-adult"));
  assert.deepEqual(fillDecision(W({ position: "어린이" }), [ADULT]), NONE("kid-adult"));
  assert.deepEqual(fillDecision(W({ group_name: "화평", sub_name: "20" }), [KID]), NONE("kid-adult"));
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "" }), [ADULT]), NONE("kid-adult"));
  // 아이 줄 + 명부 아이 → 채운다
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "" }), [KID]),
    { patch: { who_type: "교회학교", group_name: "유년부", sub_name: "" }, reason: "filled" });
  assert.deepEqual(fillDecision(W({ position: "학생" }), [P({ kind2: "학생", school_dept: "고등부" })]),
    { patch: { who_type: "교회학교", group_name: "고등부", sub_name: "" }, reason: "filled" });
});

test("fillDecision — 명단은 청년부인데 명부는 교구면 청년부를 둔다(youth-parish)", () => {
  const parishYouth = P({ kind2: "청년", mok1: "화평", mok3: "화평-20목장", position: "성도" });
  assert.deepEqual(fillDecision(W({ who_type: "교회학교", group_name: "청년부" }), [parishYouth]), NONE("youth-parish"));
});

test("fillDecision — 소속이 빈 줄인데 명부도 소속을 못 정하면 no-affiliation", () => {
  assert.deepEqual(fillDecision(W(), [NEWBIE]), NONE("no-affiliation"));
  assert.deepEqual(fillDecision(W(), [P({ kind2: "교회학교", mok1: "화평", mok3: "화평-20목장" })]),
    NONE("no-affiliation"));            // 부서 없는 아이 — 부모 목장으로 채우지 않는다
  assert.deepEqual(fillDecision(W({ position: "집사" }), [P({ mok1: "임시교구", mok3: "임시-1", position: "집사" })]),
    NONE("no-affiliation"));
});
