// 성경필사(암송) 이름을 누르면 교적 창(evPerson) — 순수 함수 시험(preflight 가 돈다 · 계획 Task 16)
// 이름·교인ID 는 모두 지어낸 것(홍길동 · 11~). 교인명부 칸 모양은 서버가 읽는 EV_PERSON_COLS 그대로.
import { test } from "node:test";
import assert from "node:assert/strict";
import { personAsk, personPick, personPickFor, personLabel, personOut, personOutFor, ministryApplicant, ministryLookupLog }
  from "../supabase/functions/church-admin/events-person.ts";
import { matchChurch, toCand, applicantFromSignup, applicantFromWho, sameAffiliation } from "../supabase/functions/church-admin/people-match.ts";
// 옮겨 적은 줄은 맞음(2026-09-30 친구 제보) — 성경필사 줄만
import { transcribedSame, signupChurch, churchForSignup } from "../supabase/functions/church-admin/events-person.ts";
import { mapChurchPerson } from "../supabase/functions/church-admin/events-people.ts";
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
  // 명단의 표시는 2026-09-30 부터 signupChurch(옮겨 적은 줄은 맞음) — 옮겨 적기로만 맞는 분(청년공동체·번호 없는 목장·남성 목장)도 넣어 본다
  const dir = [P(12), P(11, { mok1: "소망", mok3: "소망-3목장" }), P(14, { mok1: "소망", mok3: "소망-3목장" }), P(15, { mok1: "믿음", mok3: "믿음-1목장" }),
    P(16, { mok1: "청년공동체", mok3: "청년공동체-2" }), P(17, { mok3: "화평-" }), P(18, { mok1: "소망", mok3: "소망-남성1" })];
  const asks = [ask("교구", "화평", "20"), ask("교구", "소망", "3"), ask("교구", "믿음", "1"), ask("교구", "기쁨", "2"),
    ask("교구", "화평", "남성"), ask("교회학교", "중등부", ""), ask("교회학교", "청년부", ""), ask("교구", "화평", ""), ask("교구", "소망", "남성")];
  for (const q of asks) {
    for (const cands of [dir, dir.slice(0, 1), dir.slice(1, 3), [], dir.slice(4), [dir[0], dir[5]], [dir[1], dir[6]]]) {
      const st = signupChurch(cands.map(toCand), q).state;
      const { pick, list } = personPick(cands, q);
      if (st === "맞음") {
        assert.equal(pick, 0, JSON.stringify(q));
        assert.equal(signupChurch([toCand(list[0])], q).state, "맞음", "고른 분이 같은 소속의 그분");
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

test("personOut basic — lookupOut 다섯 칸(evPeopleLookup 의 다섯 칸과 같다 · church_mok 은 없음)과 교적 표시 · 교인ID 없음 · 고르면 그 한 분만 · total", () => {
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

// ---------- 사역신청·담당자 이름을 누르면(ministryPerson · 2026-09-30) — personPickFor · personOutFor ----------
// 번호는 모두 지어낸 것(0100000000N). 명부 번호 칸 phone_digits 는 띄어쓰기로 여럿(toCand 가 나눈다).

// 옛 personPick(2026-09-30 이 바꾸기 전) 그대로 — 번호가 없을 때 새 규칙이 이것과 한 글자도 다르지 않은지 맞대 본다.
// ⚠️ personPick 은 이제 personPickFor 를 부르므로 둘을 견주면 제 자신과 견주는 셈이다 — 그래서 옛 식을 여기 옮겨 둔다.
function oldPick(cands, ask) {
  const all = [...(cands ?? [])].sort((a, b) => Number(a.person_id) - Number(b.person_id));
  const a = applicantFromSignup(ask);
  const same = all.filter((c) => sameAffiliation(toCand(c), a));
  const list = [...same, ...all.filter((c) => !same.includes(c))];
  if (same.length === 1) return { pick: 0, list };
  if (same.length === 0 && all.length === 1) return { pick: 0, list };
  return { pick: null, list };
}
const ids = (r) => ({ pick: r.pick, list: r.list.map((p) => p.person_id) });
const PH = (n) => "0100000000" + n;                       // 지어낸 번호

// ⚠️ 2026-09-30 부터 personPick 은 transcribedSame(옮겨 적은 줄)을 더한다 — 아래 명부엔 옮겨 적기로만 맞는 분이 없어
//    (청년부는 명부 교구 칸 그대로 · 목장은 모두 숫자 · 새가족은 옮겨 적기가 소속을 정하지 않는다) 옛 결과와 여전히 같다.
//    옮겨 적기로만 맞는 경우는 아래 「옮겨 적은 줄」 시험들이 본다.
test("personPickFor — 번호가 없으면 옛 personPick 과 완전히 같다(고른 분·목록 차례 모두 · 성경필사 evPerson 이 안 바뀐다)", () => {
  const dir = [P(12), P(11, { mok1: "소망", mok3: "소망-3목장" }), P(14, { mok1: "소망", mok3: "소망-3목장" }),
    P(15, { mok1: "믿음", mok3: "믿음-1목장" }), P(13), P(21, { kind2: "청년", mok1: "청년부", mok3: "청년-3", position: "" }),
    P(16, { mok1: "새가족", mok3: "2026-09" }), P(17, { phone_digits: PH(1) })];
  const asks = [ask("교구", "화평", "20"), ask("교구", "소망", "3"), ask("교구", "믿음", "1"), ask("교구", "기쁨", "2"),
    ask("교구", "화평", "남성"), ask("교구", "화평", ""), ask("교구", "화평", "99"), ask("교구", "새가족", ""),
    ask("교회학교", "중등부", ""), ask("교회학교", "청년부", ""), ask("", "", "")];
  const sets = [dir, [], dir.slice(0, 1), dir.slice(1, 2), dir.slice(1, 3), dir.slice(0, 2), [dir[0], dir[4]], [dir[3], dir[1]],
    dir.slice(5), dir.slice(2, 6), [dir[7]], [dir[7], dir[3]]];
  for (const q of asks) {
    for (const cands of sets) {
      const want = ids(oldPick(cands, q));
      assert.deepEqual(ids(personPickFor(cands, applicantFromSignup(q))), want, JSON.stringify(q));
      assert.deepEqual(ids(personPick(cands, q)), want, "personPick " + JSON.stringify(q));
      // 번호 칸이 숫자 없는 글자여도 같다(phoneDigits 가 "" 로 만든다)
      assert.deepEqual(ids(personPickFor(cands, { ...applicantFromSignup(q), phone: "-- " })), want, "숫자 없는 번호 " + JSON.stringify(q));
    }
  }
});

test("personPickFor — 같은 소속이 없고 동명이인 셋 · 번호가 한 분과 맞으면 그분(맨 앞 · 나머지는 교인ID 차례)", () => {
  const cands = [P(31, { mok1: "소망", mok3: "소망-3목장", phone_digits: PH(1) }),
    P(33, { mok1: "믿음", mok3: "믿음-1목장", phone_digits: PH(3) + " " + PH(4) }),
    P(32, { mok1: "기쁨", mok3: "기쁨-2목장", phone_digits: PH(2) })];
  const a = { ...applicantFromSignup(ask("교구", "화평", "20")), phone: "010-0000-0004" };   // 대시가 있어도 숫자만 맞댄다 · 둘째 번호
  assert.deepEqual(ids(personPickFor(cands, a)), { pick: 0, list: [33, 31, 32] });
  // 번호 없이는 고르지 않는다(옛 규칙 그대로)
  assert.deepEqual(ids(personPickFor(cands, { ...a, phone: "" })), { pick: null, list: [31, 32, 33] });
  // 아무와도 안 맞으면 고르지 않는다
  assert.deepEqual(ids(personPickFor(cands, { ...a, phone: PH(9) })), { pick: null, list: [31, 32, 33] });
  // 번호 일부만 같으면 맞지 않는다(정확히 같은 번호만)
  assert.equal(personPickFor(cands, { ...a, phone: "0000000004" }).pick, null);
  // 받은 배열은 그대로
  assert.deepEqual(cands.map((p) => p.person_id), [31, 33, 32]);
});

test("personPickFor — 같은 소속 둘 · 번호가 그중 한 분과 맞으면 그분 · 차례는 고른 분 → 나머지 같은 소속 → 나머지", () => {
  const cands = [P(45, { mok1: "소망", mok3: "소망-3목장", phone_digits: PH(5) }), P(42, { phone_digits: PH(2) }),
    P(41, { phone_digits: PH(1) }), P(44, { mok1: "믿음", mok3: "믿음-1목장" })];
  const a = { ...applicantFromSignup(ask("교구", "화평", "20")), phone: PH(2) };
  assert.deepEqual(ids(personPickFor(cands, a)), { pick: 0, list: [42, 41, 44, 45] });
  // 신청 현황 줄의 who 로 읽어도(applicantFromWho — 명단의 교적 표시와 같은 함수) 같다
  assert.deepEqual(ids(personPickFor(cands, applicantFromWho("홍길동", "화평 20목장", PH(2)))), { pick: 0, list: [42, 41, 44, 45] });
  // 번호가 없으면 고르지 않는다 — 같은 소속 먼저(교인ID 차례)
  assert.deepEqual(ids(personPickFor(cands, { ...a, phone: "" })), { pick: null, list: [41, 42, 44, 45] });
});

test("personPickFor — 번호가 두 분과 맞으면 고르지 않는다", () => {
  const same2 = [P(51, { phone_digits: PH(1) }), P(52, { phone_digits: PH(7) + " " + PH(1) })];
  assert.equal(personPickFor(same2, { ...applicantFromSignup(ask("교구", "화평", "20")), phone: PH(1) }).pick, null);
  const diff2 = [P(53, { mok1: "소망", mok3: "소망-3목장", phone_digits: PH(1) }), P(54, { mok1: "믿음", mok3: "믿음-1목장", phone_digits: PH(1) })];
  assert.deepEqual(ids(personPickFor(diff2, { ...applicantFromSignup(ask("교구", "화평", "20")), phone: PH(1) })), { pick: null, list: [53, 54] });
});

test("personPickFor — 같은 소속이 둘이면 번호도 그 안에서만 본다(소속 밖 한 분과만 맞으면 고르지 않는다)", () => {
  const cands = [P(61), P(62), P(63, { mok1: "소망", mok3: "소망-3목장", phone_digits: PH(3) })];
  const a = { ...applicantFromSignup(ask("교구", "화평", "20")), phone: PH(3) };
  assert.deepEqual(ids(personPickFor(cands, a)), { pick: null, list: [61, 62, 63] });
  // 교적 표시도 「같은 소속에 같은 이름 2명」 — 창이 소속 다른 분을 열지 않는다
  assert.deepEqual(matchChurch(cands.map(toCand), a), { state: "확인 필요", reason: "같은 소속에 같은 이름 2명" });
  // 같은 소속이 한 분이면(맞음) 번호가 소속 밖 분과 맞아도 그 한 분
  assert.deepEqual(ids(personPickFor([P(61), cands[2]], a)), { pick: 0, list: [61, 63] });
});

test("personPickFor — 목장을 모르는 줄(「화평 남성」)도 같은 교구 안에서 번호가 한 분과 맞으면 그분 · 교적 표시는 명단과 같은 「목장 확인」", () => {
  const cands = [P(71, { phone_digits: PH(1) }), P(72, { mok3: "화평-5목장", phone_digits: PH(2) })];
  const row = { name: "홍길동", who: "화평 남성", phone: "010-0000-0002" };   // 신청 현황 줄(가짜)
  // 창이 맞대는 줄 = 서버 ministryPerson 이 받은 줄을 읽는 식(ministryApplicant) · 명단이 맞대는 줄 = ministryList 의 applicantFromWho
  const win = ministryApplicant(row, row.name);
  const list = applicantFromWho(row.name, row.who, row.phone);
  assert.deepEqual(ids(personPickFor(cands, win)), { pick: 0, list: [72, 71] });
  const o = personOutFor(cands, win, false);
  assert.deepEqual(o.church, matchChurch(cands.map(toCand), list), "창의 표시 = 명단의 표시(명단이 쓰는 식으로 만든 신청자와 맞댄다)");
  assert.deepEqual(o.church, { state: "확인 필요", reason: "목장 확인(같은 교구 2명)" });
  // 번호로 고르는 것은 full 뿐 — basic 은 후보 둘(같은 교구 둘 다 창에 보인다)
  assert.deepEqual([o.pick, o.people.length], [null, 2]);
  assert.deepEqual(personOutFor(cands, win, true).candidates.map((c) => c.person_id), [72]);
});

test("personPickFor — 목장을 모르는 줄은 번호가 **다른 교구** 한 분과만 맞으면 고르지 않는다 · 명단이 가리키는 같은 교구 분이 목록에 있다(검토 1)", () => {
  // 명부: 홍길동 둘 — 화평-3목장(번호 1) · 소망-2목장(번호 2). 줄: 「화평 남성」 · 번호 2(소망 분의 번호)
  const cands = [P(91, { mok3: "화평-3목장", phone_digits: PH(1) }), P(92, { mok1: "소망", mok3: "소망-2목장", phone_digits: PH(2) })];
  const row = { name: "홍길동", who: "화평 남성", phone: "010-0000-0002" };
  const a = ministryApplicant(row, row.name);
  // 명단 표시는 「목장 확인(같은 교구 1명)」 — 번호보다 같은 교구를 먼저 본다(matchChurch 의 차례)
  assert.deepEqual(matchChurch(cands.map(toCand), applicantFromWho(row.name, row.who, row.phone)),
    { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
  // 창도 같은 차례 — 번호는 같은 교구(화평 91) 안에서만 보므로 소망 분을 고르지 않는다
  assert.deepEqual(ids(personPickFor(cands, a)), { pick: null, list: [91, 92] });
  const full = personOutFor(cands, a, true);
  assert.equal(full.pick, null, "full 도 소망 분 「자세히」 창을 곧바로 열지 않는다");
  assert.deepEqual(full.candidates.map((c) => [c.person_id, c.label]), [[91, "화평 3목장"], [92, "소망 2목장"]]);
  const basic = personOutFor(cands, a, false);
  assert.deepEqual([basic.pick, basic.church], [null, { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" }]);
  assert.ok(basic.people.some((p) => p.group === "화평" && p.sub === "3"), "명단 표시가 말하는 같은 교구 분이 창에 보인다");
  // 번호가 같은 교구 분의 것이면 그분(좁힌 풀 안에서 한 분)
  assert.deepEqual(ids(personPickFor(cands, { ...a, phone: PH(1) })), { pick: 0, list: [91, 92] });
  // 같은 교구 후보가 아예 없으면(「기쁨 남성」) 명단도 번호 단계로 간다(「소속 다름」) — 창도 같은 이름 전부에서 번호로
  const g = ministryApplicant({ ...row, who: "기쁨 남성" }, row.name);
  assert.deepEqual(matchChurch(cands.map(toCand), g), { state: "확인 필요", reason: "소속 다름" });
  assert.deepEqual(ids(personPickFor(cands, g)), { pick: 0, list: [92, 91] });
  // 명부에 한 분뿐이면 목장을 몰라도 그분(옛 규칙 — 좁히는 것은 번호 단계뿐)
  assert.equal(personPickFor([cands[1]], a).pick, 0);
  // 목장 99 도 같다(앱 로그인이 목장을 모를 때 쓰는 값)
  assert.equal(personPickFor(cands, ministryApplicant({ ...row, who: "화평 99목장" }, row.name)).pick, null);
});

test("personOutFor basic — 번호가 있으면 교적 표시가 명단처럼 「소속 다름」 · 그래도 번호로 고르지 않고 후보를 준다(검토 4)", () => {
  const cands = [P(81, { mok1: "소망", mok3: "소망-3목장", phone_digits: PH(1) }), P(82, { mok1: "믿음", mok3: "믿음-1목장", phone_digits: PH(2) })];
  const a = applicantFromWho("홍길동", "화평 20목장", "010-0000-0002");
  const o = personOutFor(cands, a, false);
  // 사역신청 역할만인 분이 아무 번호로 「이 번호는 믿음 1목장 집사 홍길동」을 떠볼 수 없게 — 명단 표시(「소속 다름」)만큼만 알려 준다
  assert.deepEqual(o, { mode: "basic", pick: null, total: 2,
    people: [{ name: "홍길동", who_type: "교구", group: "소망", sub: "3", position: "집사" },
      { name: "홍길동", who_type: "교구", group: "믿음", sub: "1", position: "집사" }],
    church: { state: "확인 필요", reason: "소속 다름" } });
  // 번호가 틀려도 같은 후보(둘) — 번호에 따라 달라지는 것은 교적 표시뿐이고, 그것은 명단 표시와 같다
  const wrong = personOutFor(cands, { ...a, phone: PH(9) }, false);
  assert.deepEqual([wrong.pick, wrong.people], [null, o.people]);
  assert.deepEqual(wrong.church, { state: "확인 필요", reason: "같은 이름 2명" });
  // 번호가 없으면 옛 표시 그대로(「같은 이름 2명」 · 고르지 않음)
  const n = personOutFor(cands, { ...a, phone: "" }, false);
  assert.deepEqual([n.pick, n.church], [null, { state: "확인 필요", reason: "같은 이름 2명" }]);
  // personOut(성경필사)은 번호가 없는 personOutFor 와 같다
  const q = ask("교구", "화평", "20");
  assert.deepEqual(personOut(cands, q, false), personOutFor(cands, applicantFromSignup(q), false));
  assert.deepEqual(personOut(cands, q, true), personOutFor(cands, applicantFromSignup(q), true));
  // full 도 번호로 고른다 — 교인ID 한 분
  assert.deepEqual(personOutFor(cands, a, true),
    { mode: "full", pick: 0, total: 2, candidates: [{ person_id: 82, name: "홍길동", label: "믿음 1목장", position: "집사" }] });
});

test("personOutFor — 명부 번호(phone_digits)·받은 번호가 basic·full 어디에도 나가지 않는다(고른 때·못 고른 때 모두)", () => {
  const cands = [P(990011, { mok1: "소망", mok3: "소망-3목장", phone_digits: "01000000011 01000000012" }),
    P(990012, { mok1: "믿음", mok3: "믿음-1목장", phone_digits: "01000000013" }),
    P(990013, { phone1: "010-0000-0014", phone_digits: "01000000014", address: "비밀주소" })];
  const asks = [applicantFromWho("홍길동", "기쁨 2목장", "01000000013"),     // 한 분과 맞음 → full 은 고름(basic 은 후보 셋)
    applicantFromWho("홍길동", "기쁨 2목장", "01000000099"),                  // 아무와도 안 맞음 → 후보 셋
    applicantFromWho("홍길동", "화평 20목장", "01000000014")];                // 같은 소속 한 분 → 고름
  for (const a of asks) {
    for (const full of [false, true]) {
      const j = JSON.stringify(personOutFor(cands, a, full));
      for (const k of ["phone", "01000000011", "01000000012", "01000000013", "01000000014", "01000000099", "0000-0014", "비밀주소"]) {
        assert.ok(!j.includes(k), (full ? "full" : "basic") + " 에 새어 나감: " + k + " " + j);
      }
    }
  }
});

test("personOutFor — basic 은 어떤 줄·어떤 번호로도 번호로 고르지 않는다(번호를 뺀 고르기와 늘 같다) · full 은 번호로 고를 수 있다", () => {
  const dir = [P(101, { phone_digits: PH(1) }), P(102, { phone_digits: PH(2) }), P(103, { mok1: "소망", mok3: "소망-3목장", phone_digits: PH(3) }),
    P(104, { mok1: "믿음", mok3: "믿음-1목장", phone_digits: PH(4) + " " + PH(1) }), P(105, { mok3: "화평-5목장", phone_digits: PH(5) })];
  const whos = ["화평 20목장", "화평 남성", "화평 99목장", "소망 3목장", "기쁨 2목장", "중등부 3학년", ""];
  const sets = [dir, dir.slice(0, 2), dir.slice(2), [dir[2], dir[3]], [dir[0], dir[4]], [dir[1]], []];
  let fullByPhone = 0;
  for (const who of whos) for (const cands of sets) for (const n of [1, 2, 3, 4, 5, 9]) {
    const a = ministryApplicant({ who, phone: PH(n) }, "홍길동");
    const noPhone = personPickFor(cands, { ...a, phone: "" });
    const basic = personOutFor(cands, a, false);
    assert.equal(basic.pick, noPhone.pick, `basic ${who} ${n}`);
    assert.equal(basic.total, cands.length);
    assert.deepEqual(basic.church, matchChurch(cands.map(toCand), a), "교적 표시는 번호까지 넣어 명단과 같게");
    const full = personOutFor(cands, a, true);
    if (full.pick === 0 && noPhone.pick === null) fullByPhone++;
  }
  assert.ok(fullByPhone > 0, "full 이 번호로 고르는 경우가 시험 안에 있다");
});

test("ministryApplicant — who 가 오면 applicantFromWho · 없으면 구분·소속·세부(personAsk) · 번호는 숫자만 스무 자 · 몸이 아니면 빈 줄", () => {
  // men(「남성」) — 2026-09-30 더했다(people-match.ts). 숫자 목장·교회학교는 false
  assert.deepEqual(ministryApplicant({ name: "무시", who: " 화평  20목장 ", phone: "010-0000-0002" }, "홍길동"),
    { type: "교구", gu: "화평", mok: 20, men: false, bu: "", name: "홍길동", phone: "01000000002" });
  assert.deepEqual(ministryApplicant({ who: "중등부 3학년" }, "홍길동"),
    { type: "교회학교", gu: "", mok: null, men: false, bu: "중등부", name: "홍길동", phone: "" });
  assert.deepEqual(ministryApplicant({ who: "소망 남성", phone: "010-0000-0002" }, "홍길동"),
    { type: "교구", gu: "소망", mok: null, men: true, bu: "", name: "홍길동", phone: "01000000002" });
  // 자모분리(NFD)로 온 소속도 완성형으로(맥에서 온 글자 · 명단의 applicantFromWho 도 NFC 로 읽는다)
  assert.equal(ministryApplicant({ who: "화평 20목장".normalize("NFD") }, "홍길동").gu, "화평");
  // who 가 없으면 구분·소속·세부 — 종이 명단(교구·목장) · 담당자(교회학교·부서·학년)
  assert.deepEqual(ministryApplicant({ who_type: "교구", group: "화평", sub: "07", phone: "010 0000 0002" }, "홍길동"),
    { type: "교구", gu: "화평", mok: 7, men: false, bu: "", name: "홍길동", phone: "01000000002" });
  assert.deepEqual(ministryApplicant({ who_type: "교회학교", group: "청년부", sub: "" }, "홍길동"),
    { type: "교회학교", gu: "", mok: null, men: false, bu: "청년부", name: "홍길동", phone: "" });
  assert.equal(ministryApplicant({ who: "", who_type: "교구", group: "소망", sub: "남성" }, "홍길동").mok, null, "빈 who 는 없는 것");
  assert.equal(ministryApplicant({ who: "", who_type: "교구", group: "소망", sub: "남성" }, "홍길동").men, true, "종이 명단 목장 「남성」");
  assert.equal(ministryApplicant({ who: 123, who_type: "교구", group: "소망", sub: "3" }, "홍길동").gu, "소망", "글자가 아닌 who 는 무시");
  assert.equal(ministryApplicant({ phone: "0".repeat(30) }, "홍길동").phone.length, 20);
  assert.equal(ministryApplicant({ phone: 1234 }, "홍길동").phone, "1234");
  for (const b of [null, undefined, "x", [1, 2]]) {
    assert.deepEqual(ministryApplicant(b, "홍길동"), { type: "교구", gu: "", mok: null, men: false, bu: "", name: "홍길동", phone: "" }, String(b));
  }
});

test("ministryLookupLog — basic 이면 늘 · full 은 못 골랐거나 번호로 골랐을 때만 · from 「ministry」 · 번호 자체는 없다(검토 4·5)", () => {
  const cands = [P(111, { phone_digits: PH(1) }), P(112, { phone_digits: PH(2) }), P(113, { mok1: "소망", mok3: "소망-3목장", phone_digits: PH(3) })];
  const log = (who, phone, full) => {
    const a = ministryApplicant({ who, ...(phone ? { phone } : {}) }, "홍길동");
    return ministryLookupLog(cands, a, personOutFor(cands, a, full), "홍길동");
  };
  // basic — 늘(보여 준 분 수)
  assert.deepEqual(log("소망 3목장", "", false), { q: "홍길동", count: 1, from: "ministry" });
  assert.deepEqual(log("화평 20목장", "010-0000-0002", false), { q: "홍길동", count: 3, from: "ministry" }, "basic 은 번호로 고르지 않는다 — byPhone 없음");
  // full — 소속으로 한 분 → 남기지 않는다(「자세히」 창의 people.view 가 남는다)
  assert.equal(log("소망 3목장", "", true), null);
  assert.equal(log("소망 3목장", "010-0000-0003", true), null, "번호가 있어도 소속으로 고른 것이면 byPhone 이 아니다");
  // full — 못 고름 → 후보 수
  assert.deepEqual(log("화평 20목장", "", true), { q: "홍길동", count: 3, from: "ministry" });
  assert.deepEqual(log("화평 20목장", "010-0000-0009", true), { q: "홍길동", count: 3, from: "ministry" });
  // full — 번호로 한 분 → 한 줄 더(번호로 가렸다는 사실만 · 번호는 없다)
  const bp = log("화평 20목장", "010-0000-0002", true);
  assert.deepEqual(bp, { q: "홍길동", count: 1, from: "ministry", byPhone: true });
  assert.ok(!/\d{4}/.test(JSON.stringify(bp)), JSON.stringify(bp));
  // 명부에 한 분뿐이라 고른 것은 번호와 상관없다 — byPhone 이 아니다
  const lone = [cands[0]];
  const la = ministryApplicant({ who: "기쁨 2목장", phone: PH(1) }, "홍길동");
  assert.equal(ministryLookupLog(lone, la, personOutFor(lone, la, true), "홍길동"), null);
  // 명부에 없는 이름 — full 도 못 고른 것(0명)
  const na = ministryApplicant({ who: "화평 20목장", phone: PH(1) }, "홍길동");
  assert.deepEqual(ministryLookupLog([], na, personOutFor([], na, true), "홍길동"), { q: "홍길동", count: 0, from: "ministry" });
  // 모든 칸이 납작하다(기록 화면이 그대로 읽는다)
  for (const v of Object.values(bp)) assert.notEqual(typeof v, "object");
});

// ---------- 성경필사 줄 — 옮겨 적은 줄은 맞음(transcribedSame · 2026-09-30 친구 제보) ----------
// 교적 한 분을 events-people.ts mapChurchPerson 으로 옮겨 적은 줄이 교적 표시에서 「목장 확인」·「같은 이름 1명」으로 뜨던 것.
// 교적 칸 표기(「소망-남성1」 등)는 운영 교적의 꼴이고, 이름·교인ID 는 지어낸 것이다.
const moved = (p, name = "홍길동") => ({ ...mapChurchPerson(p), name });   // 화면·올리기가 옮겨 적은 그대로의 줄

test("transcribedSame — 교적 {장년 · 소망 · 소망-남성1} 을 옮겨 적은 줄(소망 · 남성)은 그분과 같다 · 교적 표시 맞음", () => {
  const men = P(201, { kind2: "장년", mok1: "소망", mok3: "소망-남성1" });
  const row = moved(men);
  assert.deepEqual([row.who_type, row.group_name, row.sub_name], ["교구", "소망", "남성"], "옮겨 적기는 「남성」 그대로(앱 로그인 열쇠)");
  assert.equal(transcribedSame(row)(toCand(men)), true);
  assert.deepEqual(signupChurch([toCand(men)], row), { state: "맞음", reason: "" });
  assert.deepEqual(churchForSignup(new Map([["홍길동", [toCand(men)]]]), row), { state: "맞음", reason: "" });
  // 「남성목장」처럼 적힌 줄도(tidyMok 꼴로 견준다)
  assert.equal(transcribedSame({ ...row, sub_name: "남성목장" })(toCand(men)), true);
});

test("transcribedSame — 청년공동체·청년새가족 분을 옮겨 적은 줄(교회학교 · 청년부)은 맞음 · 예전 규칙(sameAffiliation)으론 못 맞췄다", () => {
  for (const mok1 of ["청년공동체", "청년새가족"]) {
    const y = P(210, { kind2: "청년", mok1, mok3: mok1 + "-3", position: "" });
    const row = moved(y);
    assert.deepEqual([row.who_type, row.group_name, row.sub_name], ["교회학교", "청년부", ""], mok1);
    assert.equal(sameAffiliation(toCand(y), applicantFromSignup(row)), false, "예전 규칙은 명부 교구 칸 「청년부」만 봤다");
    assert.equal(transcribedSame(row)(toCand(y)), true, mok1);
    assert.deepEqual(signupChurch([toCand(y)], row), { state: "맞음", reason: "" }, mok1);
    // 다른 사람(교구 분)이 함께 있어도 옮겨 적은 분 한 분만 같은 소속
    assert.deepEqual(signupChurch([toCand(y), toCand(P(211))], row), { state: "맞음", reason: "" }, mok1);
  }
});

test("transcribedSame — 목장 번호 없는 교적(「화평-」)을 옮겨 적은 줄(목장 빈칸)은 맞음 · 목장 칸 꼴이 달라도(「20목장」·「07」) 같게 본다", () => {
  const noNum = P(220, { mok3: "화평-" });
  const row = moved(noNum);
  assert.deepEqual([row.who_type, row.group_name, row.sub_name], ["교구", "화평", ""]);
  assert.deepEqual(matchChurch([toCand(noNum)], applicantFromSignup(row)), { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" },
    "예전 규칙 — 빈 목장은 목장 모름");
  assert.deepEqual(signupChurch([toCand(noNum)], row), { state: "맞음", reason: "" });
  // 목장 칸 꼴 — 「20목장」=「20」 · 「07」=「7」 · 자모분리·앞뒤 빈칸 소속도
  assert.equal(transcribedSame({ who_type: "교구", group_name: "화평", sub_name: "20목장" })(toCand(P(221))), true);
  assert.equal(transcribedSame({ who_type: "교구", group_name: " 화평 ".normalize("NFD"), sub_name: " 20 " })(toCand(P(221))), true);
  assert.equal(transcribedSame({ who_type: "교구", group_name: "화평", sub_name: "07" })(toCand(P(222, { mok3: "화평-7목장" }))), true);
  // 다르면 아니다 — 목장 · 교구 · 구분
  assert.equal(transcribedSame({ who_type: "교구", group_name: "화평", sub_name: "21" })(toCand(P(221))), false);
  assert.equal(transcribedSame({ who_type: "교구", group_name: "소망", sub_name: "20" })(toCand(P(221))), false);
  assert.equal(transcribedSame({ who_type: "교회학교", group_name: "화평", sub_name: "20" })(toCand(P(221))), false);
  assert.equal(transcribedSame({ who_type: "", group_name: "화평", sub_name: "20" })(toCand(P(221))), false, "구분이 빈 줄은 옮겨 적은 줄이 아니다");
  // 옮겨 적기가 소속을 못 정하는 분(새가족·부서 없는 아이)은 어떤 줄과도 같지 않다
  for (const q of [ask("교구", "새가족", ""), ask("교회학교", "", ""), ask("", "", "")]) {
    assert.equal(transcribedSame(q)(toCand(P(223, { mok1: "새가족", mok3: "2026-09" }))), false, JSON.stringify(q));
    assert.equal(transcribedSame(q)(toCand(P(224, { kind2: "교회학교", school_dept: "" }))), false, JSON.stringify(q));
  }
});

test("transcribedSame — 같은 옮겨 적기가 되는 동명이인 둘 → 「같은 소속에 같은 이름 2명」(확인 필요) · 창도 고르지 않는다", () => {
  const two = [P(231, { mok1: "청년공동체", mok3: "청년공동체-1" }), P(232, { mok1: "청년새가족", mok3: "청년새가족-2" })];
  const row = moved(two[0]);
  assert.deepEqual(signupChurch(two.map(toCand), row), { state: "확인 필요", reason: "같은 소속에 같은 이름 2명" });
  assert.equal(personPick(two, row).pick, null);
  const nn = [P(233, { mok3: "화평-" }), P(234, { mok3: "화평-교역자" })];
  assert.deepEqual(signupChurch(nn.map(toCand), moved(nn[0])), { state: "확인 필요", reason: "같은 소속에 같은 이름 2명" });
});

test("transcribedSame — 옮겨 적지 않은(다르게 적힌) 줄은 예전 규칙 그대로(signupChurch = more 없는 matchChurch)", () => {
  const dir = [P(241), P(242, { mok1: "소망", mok3: "소망-3목장" }), P(243, { mok1: "청년공동체", mok3: "청년공동체-1" }),
    P(244, { mok3: "화평-" }), P(245, { mok1: "소망", mok3: "소망-남성1" }), P(246, { kind2: "교회학교", mok1: "화평", mok3: "화평-20목장", school_dept: "중등부" })];
  const rows = [ask("교구", "화평", "21"), ask("교구", "기쁨", "2"), ask("교구", "화평", "99"), ask("교회학교", "고등부", ""),
    ask("교회학교", "청년부", "3"), ask("교구", "믿음", ""), ask("교구", "소망", "1")];
  const sets = [dir, dir.slice(0, 2), dir.slice(2, 4), dir.slice(3), [dir[4]], []];
  for (const q of rows) for (const cands of sets) {
    const cs = cands.map(toCand);
    assert.ok(cs.every((c) => !transcribedSame(q)(c)), "이 줄들은 누구를 옮겨 적은 것도 아니다 " + JSON.stringify(q));
    assert.deepEqual(signupChurch(cs, q), matchChurch(cs, applicantFromSignup(q)), JSON.stringify(q));
    assert.deepEqual(ids(personPick(cands, q)), ids(personPickFor(cands, applicantFromSignup(q))), "창도 예전 그대로 " + JSON.stringify(q));
  }
});

test("evPerson — basic 의 교적 표시 = 명단의 표시(signupChurch) · full 은 옮겨 적은 분을 곧바로 고른다", () => {
  const dir = [P(251, { mok1: "청년공동체", mok3: "청년공동체-1", position: "" }), P(252), P(253, { mok3: "화평-" }),
    P(254, { mok1: "소망", mok3: "소망-남성1" }), P(255, { mok1: "소망", mok3: "소망-남성2" }), P(256, { mok1: "소망", mok3: "소망-1목장" })];
  const rows = [ask("교회학교", "청년부", ""), ask("교구", "화평", ""), ask("교구", "화평", "20"), ask("교구", "소망", "남성"),
    ask("교구", "소망", "1"), ask("교구", "화평", "남성"), ask("교회학교", "중등부", "")];
  const sets = [dir, [dir[0], dir[1]], [dir[1], dir[2]], [dir[3], dir[5]], [dir[3], dir[4]], [dir[2]], []];
  for (const q of rows) for (const cands of sets) {
    const b = personOut(cands, q, false);
    assert.deepEqual(b.church, signupChurch(cands.map(toCand), q), "창의 표시 = 명단의 표시 " + JSON.stringify(q));
    assert.deepEqual(churchForSignup(new Map([["홍길동", cands.map(toCand)]]), q),
      cands.length ? b.church : { state: "없음", reason: "" }, "색인으로 찾아도 같다 " + JSON.stringify(q));
    if (b.church.state === "맞음") assert.equal(personOut(cands, q, true).pick, 0, "맞음이면 full 은 고른다 " + JSON.stringify(q));
  }
  // 청년공동체 분 + 교구 분 — 옮겨 적은 줄(교회학교 청년부)이면 full 이 곧바로 청년공동체 분(교인ID 하나)
  const f = personOut([dir[1], dir[0]], moved(dir[0]), true);
  assert.deepEqual([f.pick, f.candidates.map((c) => c.person_id)], [0, [251]]);
  // 소망-남성1 분 + 소망-1목장 분 — 「소망 남성」 줄은 남성1 분 · 「소망 1」 줄은 1목장 분(남성1 이 1목장으로 읽히던 함정)
  assert.deepEqual(personOut([dir[3], dir[5]], ask("교구", "소망", "남성"), true).candidates.map((c) => c.person_id), [254]);
  assert.deepEqual(personOut([dir[3], dir[5]], ask("교구", "소망", "1"), true).candidates.map((c) => c.person_id), [256]);
  // 번호 없는 목장(화평-) 분 + 화평-20목장 분 — 목장 빈칸 줄은 화평- 분
  assert.deepEqual(personOut([dir[1], dir[2]], moved(dir[2]), true).candidates.map((c) => c.person_id), [253]);
});

test("ministryPerson(사역·담당자)은 transcribedSame 을 쓰지 않는다 — 같은 경우에 사역 줄은 예전 결과", () => {
  const dir = [P(261, { mok1: "청년공동체", mok3: "청년공동체-1", position: "" }), P(262)];
  // 종이 명단·담당자 길(구분·소속·세부)로 「교회학교 청년부」 — 성경필사라면 청년공동체 분을 골랐을 줄
  const a = ministryApplicant({ who_type: "교회학교", group: "청년부", sub: "" }, "홍길동");
  for (const full of [false, true]) {
    const o = personOutFor(dir, a, full);
    assert.equal(o.pick, null, "사역 줄은 옮겨 적기로 고르지 않는다 " + full);
    assert.equal(o.total, 2);
  }
  assert.deepEqual(personOutFor(dir, a, false).church, matchChurch(dir.map(toCand), a));
  assert.deepEqual(personOutFor(dir, a, false).church, { state: "확인 필요", reason: "같은 이름 2명" });
  // 성경필사 줄이었다면 맞음 — 둘이 갈리는 것이 이 시험의 요점
  assert.deepEqual(personOut(dir, ask("교회학교", "청년부", ""), false).church, { state: "맞음", reason: "" });
  // 빈 목장(화평 · 빈칸)도 — 사역 줄은 「목장 확인」 그대로
  const nn = [P(263, { mok3: "화평-" })];
  const b = ministryApplicant({ who_type: "교구", group: "화평", sub: "" }, "홍길동");
  assert.deepEqual(personOutFor(nn, b, false).church, { state: "확인 필요", reason: "목장 확인(같은 교구 1명)" });
  // 「남성」은 사역 줄도 새 규칙(sameAffiliation 이 맞댄다) — transcribedSame 과 상관없이
  const men = [P(264, { mok1: "소망", mok3: "소망-남성1" }), P(265, { mok1: "소망", mok3: "소망-3목장" })];
  assert.deepEqual(personOutFor(men, ministryApplicant({ who: "소망 남성" }, "홍길동"), false).church, { state: "맞음", reason: "" });
  assert.deepEqual(personOutFor(men, ministryApplicant({ who: "소망 남성" }, "홍길동"), true).candidates.map((c) => c.person_id), [264]);
});
