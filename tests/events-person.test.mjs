// 성경필사(암송) 이름을 누르면 교적 창(evPerson) — 순수 함수 시험(preflight 가 돈다 · 계획 Task 16)
// 이름·교인ID 는 모두 지어낸 것(홍길동 · 11~). 교인명부 칸 모양은 서버가 읽는 EV_PERSON_COLS 그대로.
import { test } from "node:test";
import assert from "node:assert/strict";
import { personAsk, personPick, personLabel, personOut } from "../supabase/functions/church-admin/events-person.ts";
import { matchChurch, toCand, applicantFromSignup } from "../supabase/functions/church-admin/people-match.ts";
import { LOOKUP_MAX } from "../supabase/functions/church-admin/events-upload.ts";

// 교인명부 한 분 — 서버가 읽는 칸(person_id·name + ChurchPerson 일곱)만
const P = (person_id, o = {}) => ({ person_id, name: "홍길동", name_key: "홍길동", kind2: "장년", mok1: "화평", mok3: "화평-20목장",
  school_dept: "", position: "집사", position_detail: "", ...o });
const ask = (who_type, group_name, sub_name, name = "홍길동") => ({ who_type, group_name, sub_name, name });

test("personAsk — 한 줄로 다듬고 40자로 자른다 · 구분은 교구·교회학교 밖이면 비운다 · 이름은 받은 그대로(검사는 lookupName)", () => {
  assert.deepEqual(personAsk({ who_type: " 교구 ", group: " 화평 ", sub: "20", name: "무시" }, "홍길동"),
    { who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동" });
  assert.deepEqual(personAsk({ who_type: "교회학교", group: "청년부", sub: "" }, "홍 길동"),
    { who_type: "교회학교", group_name: "청년부", sub_name: "", name: "홍 길동" });
  assert.equal(personAsk({ who_type: "아무개" }, "홍길동").who_type, "");
  assert.equal(personAsk({ group: "가".repeat(60) }, "홍길동").group_name.length, 40);
  assert.deepEqual(personAsk(null, "홍길동"), { who_type: "", group_name: "", sub_name: "", name: "홍길동" });
  assert.deepEqual(personAsk([1, 2], "홍길동"), { who_type: "", group_name: "", sub_name: "", name: "홍길동" });
});

test("personPick — ① 소속까지 같은 분 한 분이면 그분 ② 같은 소속이 없고 이름이 한 분뿐이면 그분 ③ 그 밖은 고르지 않는다", () => {
  const a = P(12, { mok3: "화평-20목장" }), b = P(11, { mok1: "소망", mok3: "소망-3목장" }), c = P(13, { mok3: "화평-20목장" });
  // ① 같은 소속 한 분 — 동명이인이 있어도 그분이 앞에 오고 고른다
  const one = personPick([a, b], ask("교구", "화평", "20"));
  assert.equal(one.pick, 0);
  assert.deepEqual(one.list.map((p) => p.person_id), [12, 11]);
  // 「07」·「7목장」처럼 적힌 목장도 같은 소속(sameAffiliation 이 mokNumber 로 본다)
  assert.equal(personPick([P(1, { mok3: "화평-7목장" }), b], ask("교구", "화평", "07")).pick, 0);
  // ② 같은 소속이 없어도 이름이 한 분뿐이면 그분
  assert.equal(personPick([b], ask("교구", "화평", "20")).pick, 0);
  // ③ 같은 소속 둘 · 소속 다른 동명이인 둘 · 명부에 없음 → 고르지 않는다
  const two = personPick([c, a, b], ask("교구", "화평", "20"));
  assert.equal(two.pick, null);
  assert.deepEqual(two.list.map((p) => p.person_id), [12, 13, 11], "같은 소속 먼저 · 안에서는 교인ID 차례");
  assert.equal(personPick([a, b], ask("교구", "화평", "5")).pick, null);
  assert.deepEqual(personPick([], ask("교구", "화평", "20")), { pick: null, list: [] });
  // 목장을 모르는 줄(「남성」·빈칸)은 같은 소속으로 보지 않는다 — 명부에 한 분뿐일 때만 그분
  assert.equal(personPick([a, b], ask("교구", "화평", "남성")).pick, null);
  assert.equal(personPick([a], ask("교구", "화평", "")).pick, 0);
  // 교회학교 — 부서가 같으면(청년부는 명부의 교구 칸에 있다)
  const y = P(21, { kind2: "청년", mok1: "청년부", mok3: "청년-3", position: "" });
  assert.equal(personPick([y, a], ask("교회학교", "청년부", "")).pick, 0);
  assert.equal(personPick([y, a], ask("교회학교", "청년부", "")).list[0].person_id, 21);
  // 받은 배열은 그대로
  const input = [c, a, b];
  personPick(input, ask("교구", "화평", "20"));
  assert.deepEqual(input.map((p) => p.person_id), [13, 12, 11]);
});

test("personPick — 명단의 교적 표시와 같은 규칙: 「맞음」이면 늘 고르고, 고른 분이 같은 소속의 그 한 분이다", () => {
  const dir = [P(12), P(11, { mok1: "소망", mok3: "소망-3목장" }), P(14, { mok1: "소망", mok3: "소망-3목장" }), P(15, { mok1: "믿음", mok3: "믿음-1목장" })];
  const asks = [ask("교구", "화평", "20"), ask("교구", "소망", "3"), ask("교구", "믿음", "1"), ask("교구", "기쁨", "2"),
    ask("교구", "화평", "남성"), ask("교회학교", "중등부", "")];
  for (const q of asks) {
    for (const cands of [dir, dir.slice(0, 1), dir.slice(1, 3), []]) {
      const st = matchChurch(cands.map(toCand), applicantFromSignup(q)).state;
      const { pick, list } = personPick(cands, q);
      if (st === "맞음") {
        assert.equal(pick, 0, JSON.stringify(q));
        assert.equal(matchChurch([toCand(list[0])], applicantFromSignup(q)).state, "맞음", "고른 분이 같은 소속의 그분");
      }
      if (st === "없음") assert.equal(pick, null);
      if (pick === 0 && st !== "맞음") assert.equal(cands.length, 1, "맞음이 아닌데 고르는 것은 명부에 한 분뿐일 때만");
    }
  }
});

test("personLabel — 명단과 같은 소속 한 줄 · 옮겨 적기가 소속을 못 정하면 명부 교구(부서) 칸 그대로", () => {
  assert.equal(personLabel(P(1)), "화평 20목장");
  assert.equal(personLabel(P(1, { mok1: "소망", mok3: "소망-남성1" })), "소망 남성");
  assert.equal(personLabel(P(1, { kind2: "교회학교", mok1: "화평", school_dept: "중등부" })), "중등부");
  assert.equal(personLabel(P(1, { mok1: "새가족", mok3: "2026-09" })), "새가족");
  assert.equal(personLabel(P(1, { mok1: "", mok3: "" })), "(소속 없음)");
});

test("personOut full — 교인ID·이름·소속 한 줄·직분 넷뿐 · 고르면 그 한 분만 · 못 고르면 스무 분까지 · total 은 자르기 전 수", () => {
  const a = P(12, { position: "권사", position_detail: "은퇴협동권사" }), b = P(11, { mok1: "소망", mok3: "소망-3목장" });
  const o = personOut([b, a], ask("교구", "화평", "20"), true);
  assert.deepEqual(o, { mode: "full", pick: 0, total: 2, candidates: [{ person_id: 12, name: "홍길동", label: "화평 20목장", position: "은퇴권사" }] });
  const many = Array.from({ length: 25 }, (_, i) => P(100 + i, { mok3: "화평-1목장" }));
  const m = personOut(many, ask("교구", "화평", "20"), true);
  assert.equal(m.pick, null);
  assert.equal(m.candidates.length, LOOKUP_MAX);
  assert.equal(m.total, 25, "자르기 전 수 — 화면이 「같은 이름 25분(앞 20분)」으로 적는다");
  assert.deepEqual(m.candidates.map((c) => c.person_id).slice(0, 3), [100, 101, 102]);
  assert.deepEqual(personOut([], ask("교구", "화평", "20"), true), { mode: "full", pick: null, total: 0, candidates: [] });
  assert.equal(typeof personOut([P("12")], ask("", "", ""), true).candidates[0].person_id, "number");
});

test("personOut basic — 다섯 칸(evPeopleLookup 과 같은 칸 지도)과 교적 표시 · 교인ID 없음 · 고르면 그 한 분만 · total", () => {
  const a = P(12), b = P(11, { mok1: "소망", mok3: "소망-3목장", position: "" });
  const o = personOut([b, a], ask("교구", "화평", "20"), false);
  assert.deepEqual(o, { mode: "basic", pick: 0, total: 2,
    people: [{ name: "홍길동", who_type: "교구", group: "화평", sub: "20", position: "집사" }],
    church: { state: "맞음", reason: "" } });
  const two = personOut([b, a], ask("교구", "화평", "5"), false);
  assert.deepEqual([two.pick, two.total], [null, 2]);
  assert.deepEqual(two.people.map((p) => p.group), ["소망", "화평"], "교인ID 차례(같은 소속이 없으니)");
  assert.deepEqual(two.church, { state: "확인 필요", reason: "같은 이름 2명" });
  assert.deepEqual(personOut([], ask("교구", "화평", "20"), false),
    { mode: "basic", pick: null, total: 0, people: [], church: { state: "없음", reason: "" } });
  const many = personOut(Array.from({ length: 21 }, (_, i) => P(100 + i, { mok3: "화평-1목장" })), ask("교구", "화평", "20"), false);
  assert.deepEqual([many.pick, many.people.length, many.total], [null, LOOKUP_MAX, 21]);
  assert.deepEqual(many.church, { state: "확인 필요", reason: "같은 이름 21명" }, "교적 표시의 수와 total 이 같다");
  for (const p of two.people) assert.deepEqual(Object.keys(p).sort(), ["group", "name", "position", "sub", "who_type"]);
});

test("personOut — 명부의 다른 칸(연락처·주소·생년월일·사진·교인ID·원래 칸)이 따라 나가지 않는다(스프레드 금지)", () => {
  const leaky = P(990001, { phone1: "010-0000-1111", address: "비밀주소", birth: "1950-01-01", photo: "x.jpg", has_photo: true,
    mok3: "화평-20목장", position_detail: "시무집사" });
  const q = ask("교구", "화평", "20");
  const basic = JSON.stringify(personOut([leaky], q, false));
  for (const k of ["990001", "person_id", "010-0000-1111", "비밀주소", "1950", "photo", "name_key", "mok1", "mok3", "kind2", "position_detail", "화평-20목장"]) {
    assert.ok(!basic.includes(k), "basic 에 새어 나감: " + k);
  }
  const full = JSON.stringify(personOut([leaky], q, true));
  for (const k of ["010-0000-1111", "비밀주소", "1950", "photo", "name_key", "mok3", "kind2", "position_detail", "화평-20목장"]) {
    assert.ok(!full.includes(k), "full 에 새어 나감: " + k);
  }
  assert.ok(full.includes('"person_id":990001'), "full 은 교인ID 를 싣는다(「자세히」 창을 열려고)");
});
