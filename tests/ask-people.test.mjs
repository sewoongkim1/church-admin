// 🤖 성도 묻기(시험판 · 2026-10-15) — 조건 트리 규약 · 검사 · 셈 · 칩 글(supabase/functions/church-admin/ask-people.ts · 순수)
//   이름은 모두 지어낸 것(시험-가 …). 개발·운영 DB 없이 돈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  askOut, askQuestion, askSchema, askSystemPrompt, buildAskData, checkTree, describeLeaf, FIELDS, gapYears, mokKey,
  runTree, statusOf, streakOf, ASK_MAX_LEAVES,
} from "../supabase/functions/church-admin/ask-people.ts";

const TODAY = "2026-10-15";
const Y = 2026;
// 교인명부 다섯 분 — 가(권사 · 찬양대 2014~2025 · 올해 쉼) · 나(집사 · 교회학교 2024~2026) · 다(사역 없음) ·
//   라(2019·2020·2022 — 2021 은 명단이 일부인 해) · 마(명부에 없는 분 — 사역 이력만 있다)
const PEOPLE = [
  { person_id: 1, name: "시험-가", position: "권사", gender: "여", age: 55, mok1: "화평", mok3: "화평-20목장", kind2: "장년", registered_date: "2001-03-04" },
  { person_id: 2, name: "시험-나", position: "서리집사", gender: "남", age: 45, mok1: "사랑", mok3: "사랑-3목장", kind2: "장년", registered_date: "2024-05-01" },
  { person_id: 3, name: "시험-다", position: "", gender: "남", age: 52, mok1: "화평", mok3: "", kind2: "장년", registered_date: "" },
  { person_id: 4, name: "시험-라", position: "은퇴권사", gender: "여", age: 70, mok1: "소망", mok3: "소망-1목장", kind2: "장년", registered_date: "1990-01-01" },
];
const MAP = [
  { committee_key: "찬양위원회", team_key: "시온찬양대", big_group: "찬양", family: "찬양", mid: "찬양대", team_std: "시온찬양대" },
  { committee_key: "교육위원회", team_key: "아동1부", big_group: "교회학교", family: "교회학교", mid: "아동", team_std: "아동1부" },
  { committee_key: "예배위원회", team_key: "안내", big_group: "그 밖", family: "예배", mid: "", team_std: "안내" },
];
const HIST = [];
let hid = 1;
for (let y = 2014; y <= 2025; y++) HIST.push({ id: hid++, person_id: 1, year: y, committee: "찬양 위원회", team: "시온 찬양대" });
for (const y of [2024, 2025, 2026]) HIST.push({ id: hid++, person_id: 2, year: y, committee: "교육위원회", team: "아동1부" });
for (const y of [2019, 2020, 2022]) HIST.push({ id: hid++, person_id: 4, year: y, committee: "예배위원회", team: "안내" });
HIST.push({ id: hid++, person_id: 99, year: 2010, committee: "예배위원회", team: "안내" });          // 명부에 없는 분 — 셈에서 빠진다(해 범위에는 든다)
HIST.push({ id: hid++, person_id: null, year: 2012, committee: "예배위원회", team: "안내" });        // 교인과 안 이어진 줄
const GAPS = [{ scope: "*", year_from: 2021, year_to: 2021 }, { scope: "g:교회학교", year_from: 2023, year_to: 2024 }];
// 성경필사(2026-10-15) — 회차 넷(하나는 초안) · 교인과 이어진 줄: 가(2025 사순절 · 2026 썸머) · 나(2026 소책자) · 라(2025 사순절)
//   명부에 없는 분(99)의 줄 · 초안 회차의 줄은 빠진다
const EVENTS = [
  { id: "lent-2025", title: "2025 사순절 요한복음 완서자", opens_on: "2025-03-05", status: "closed" },
  { id: "lent-booklet-2026", title: "2026 사순절 소책자 이벤트 참여자", opens_on: "2026-02-18", status: "closed" },
  { id: "summer-2026", title: "2026 썸머 써 바이블 옵/말 완서자", opens_on: "2026-05-01", status: "closed" },
  { id: "ca-draft", title: "초안 회차", opens_on: "2026-09-01", status: "draft" },
];
const PILSA = [
  { person_id: 1, event_id: "lent-2025" }, { person_id: 1, event_id: "summer-2026" },
  { person_id: 2, event_id: "lent-booklet-2026" }, { person_id: 4, event_id: "lent-2025" },
  { person_id: 99, event_id: "summer-2026" }, { person_id: 3, event_id: "ca-draft" },
];
const D = buildAskData(PEOPLE, HIST, MAP, GAPS, PILSA, EVENTS);

const leaf = (o) => ({ field: "", op: "", num: null, years_ago: null, text: null, list: [], within: null, dept: null, from_text: "", ...o });
const names = (t) => runTree(t, D).map((p) => p.name).sort();
const tree = (raw) => checkTree(raw, D.vocab, Y).tree;

test("재료 — 교인명부에 있는 분의 사역 이력만 · 해 범위는 모든 줄 · 이음표 없는 쌍은 그 밖/미정", () => {
  assert.equal(D.people.length, 4);
  assert.equal(D.linked, 12 + 3 + 3);
  assert.equal(D.histRows, HIST.length);
  assert.equal(D.vocab.yearMin, 2010);
  assert.equal(D.vocab.yearMax, 2026);
  assert.deepEqual(D.vocab.gu, ["화평", "사랑", "소망"]);   // 많은 차례
  assert.equal(D.people.find((p) => p.id === 4).pos, "권사");          // 은퇴권사 → 권사
  assert.equal(D.people.find((p) => p.id === 3).pos, "직분 없음");
  assert.equal(D.people.find((p) => p.id === 2).pos, "집사");          // 서리집사 → 집사
});

test("10년 동안 사역하신 분 중 올해는 안 하시는 분 — 가", () => {
  const t = tree({ all: [leaf({ field: "served_years_count", op: ">=", num: 10, from_text: "10년 동안 사역하신" })],
    none: [leaf({ field: "served_in_year", op: "has", years_ago: 0, from_text: "올해는 안 하시는" })] });
  assert.deepEqual(names(t), ["시험-가"]);
  assert.equal(t.none[0].year, 2026);
});

test("최근 10년 중 찬양대에서 5해 이상 — 기간 + 부서(mid) · 다른 단계 이름도 찾는다", () => {
  const t = tree({ all: [leaf({ field: "served_years_count", op: ">=", num: 5, within: { last_years: 10, from: null, to: null },
    dept: { level: "mid", name: "찬양대" }, from_text: "최근 10년 중 찬양대에서 5번 이상" })] });
  assert.deepEqual(t.all[0].within, { from: 2017, to: 2026 });
  assert.deepEqual(names(t), ["시험-가"]);
  // 「찬양」을 family 로 말해도 big/family 어디서든 찾는다
  const t2 = tree({ all: [leaf({ field: "served_years_count", op: ">=", num: 1, dept: { level: "team", name: "찬양" } })] });
  assert.equal(t2.all[0].dept.name, "찬양");
  assert.deepEqual(names(t2), ["시험-가"]);
});

test("사역한 적 없음(= 0) · 「N해 이하」는 섬긴 적 있는 분 중에서", () => {
  assert.deepEqual(names(tree({ all: [leaf({ field: "served_years_count", op: "=", num: 0 })] })), ["시험-다"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "served_years_count", op: "<=", num: 3 })] })), ["시험-나", "시험-라"]);
});

test("잇따라 섬긴 해 — 명단이 일부인 해(2021)는 끊긴 것으로 보지 않는다 · 부서에 걸린 일부 해", () => {
  assert.equal(streakOf(new Set([2019, 2020, 2022]), gapYears(null, D.vocab)), 3);
  assert.equal(streakOf(new Set([2019, 2020, 2022]), new Set()), 2);
  assert.deepEqual(names(tree({ all: [leaf({ field: "served_streak_max", op: ">=", num: 3 })] })), ["시험-가", "시험-나", "시험-라"]);
  // g:교회학교 2023~2024 는 교회학교로 걸었을 때만
  assert.ok(gapYears({ level: "big", name: "교회학교" }, D.vocab).has(2023));
  assert.ok(!gapYears({ level: "big", name: "찬양" }, D.vocab).has(2023));
});

test("마지막 섬긴 해 — 섬긴 적 없는 분은 맞지 않는다", () => {
  assert.deepEqual(names(tree({ all: [leaf({ field: "last_served_year", op: "<=", years_ago: 4 })] })), ["시험-라"]);
});

test("교구 · 목장 · 직분 · 성별 · 나이 · 등록한 해", () => {
  assert.deepEqual(names(tree({ all: [leaf({ field: "gu", op: "=", text: "화평교구" })] })), ["시험-가", "시험-다"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "mok", op: "=", text: "화평-20" })] })), ["시험-가"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "mok", op: "=", text: "목장 없음" })] })), ["시험-다"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "position", op: "in", list: ["권사"] })] })), ["시험-가", "시험-라"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "position", op: "in", list: ["성도"] })] })), ["시험-다"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "gender", op: "=", text: "남자" })] })), ["시험-나", "시험-다"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "age", op: ">=", num: 50 }), leaf({ field: "age", op: "<=", num: 59 })] })), ["시험-가", "시험-다"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "registered_year", op: ">=", years_ago: 2 })] })), ["시험-나"]);
});

test("또는 · 아님 — 또는이 하나뿐이면 그리고로", () => {
  const t = tree({ any: [leaf({ field: "gu", op: "in", list: ["사랑"] }), leaf({ field: "gu", op: "in", list: ["소망"] })] });
  assert.deepEqual(names(t), ["시험-나", "시험-라"]);
  const one = tree({ any: [leaf({ field: "gu", op: "in", list: ["사랑"] })] });
  assert.equal(one.any.length, 0);
  assert.equal(one.all.length, 1);
});

test("할 수 없는 것 — 모르는 부서 · 범위 밖 · 목록에 없는 교구 · 틀린 비교는 unsupported 로 · 서버가 최종 판정", () => {
  const c = checkTree({
    all: [
      leaf({ field: "served_years_count", op: ">=", num: 20, from_text: "20년 넘게" }),
      leaf({ field: "served_years_count", op: ">=", num: 1, dept: { level: "mid", name: "없는부서" }, from_text: "없는부서에서" }),
      leaf({ field: "gu", op: "in", list: ["없는교구"], from_text: "없는교구" }),
      leaf({ field: "age", op: "has", num: 3, from_text: "나이" }),
      leaf({ field: "phone", op: "=", text: "010", from_text: "전화" }),
      leaf({ field: "served_in_year", op: "has", num: 2005, from_text: "2005년에" }),
    ],
    unsupported: [{ text: "예배에 잘 안 나오시는", kind: "no_data", note: "출석 기록 없음" }, { text: "열심", kind: "이상한값", note: "" }],
  }, D.vocab, Y);
  assert.equal(c.tree.all.length, 0);
  const kinds = Object.fromEntries(c.unsupported.map((u) => [u.text, u.kind]));
  assert.equal(kinds["20년 넘게"], "out_of_range");
  assert.equal(kinds["없는부서에서"], "no_data");
  assert.equal(kinds["없는교구"], "no_data");
  assert.equal(kinds["나이"], "too_complex");
  assert.equal(kinds["전화"], "no_data");
  assert.equal(kinds["2005년에"], "out_of_range");
  assert.equal(kinds["예배에 잘 안 나오시는"], "no_data");
  assert.equal(kinds["열심"], "too_complex");     // 모르는 까닭은 「아직 못 하는 조합」
  assert.equal(statusOf(c), "none");
});

test("범위 끝이 기록 앞이면 잘라 세고 알린다 · 명단이 일부인 해를 물으면 알린다", () => {
  const c = checkTree({ all: [leaf({ field: "served_years_count", op: ">=", num: 3, within: { last_years: null, from: 2000, to: 2015 }, from_text: "2000년부터" }),
    leaf({ field: "served_in_year", op: "has", num: 2021, from_text: "2021년" })] }, D.vocab, Y);
  assert.deepEqual(c.tree.all[0].within, { from: 2010, to: 2015 });
  assert.ok(c.notices.some((n) => n.includes("2010년부터")));
  assert.ok(c.notices.some((n) => n.includes("2021년은 사역 명단이 일부")));
});

test("조건은 ASK_MAX_LEAVES 개까지", () => {
  const many = Array.from({ length: ASK_MAX_LEAVES + 2 }, () => leaf({ field: "age", op: ">=", num: 1, from_text: "나이" }));
  const c = checkTree({ all: many }, D.vocab, Y);
  assert.equal(c.tree.all.length, ASK_MAX_LEAVES);
  assert.equal(c.unsupported.length, 2);
});

test("세 갈래 — partial 은 AI 첫 답이면 세지 않고 멈춘다 · 화면이 다시 부르면 남은 조건으로 센다", () => {
  const raw = { all: [leaf({ field: "served_years_count", op: ">=", num: 10, from_text: "10년 넘게" })],
    unsupported: [{ text: "예배에 잘 안 나오시는", kind: "no_data", note: "출석 기록이 없어요" }] };
  const first = askOut(raw, D, TODAY, true);
  assert.equal(first.status, "partial");
  assert.equal(first.total, null);
  assert.deepEqual(first.rows, []);
  assert.equal(first.unsupported[0].label, "자료가 없어요");
  const again = askOut({ all: first.tree.all, any: first.tree.any, none: first.tree.none }, D, TODAY, false);
  assert.equal(again.status, "ok");
  assert.equal(again.total, 1);
  assert.equal(again.rows[0].name, "시험-가");
  assert.equal(again.rows[0].served, 12);
  assert.equal(again.rows[0].main, "찬양대");
  // 교인ID(id)는 이름을 누르면 「자세히」 창을 열려고 — 연락처 · 주소는 없다
  assert.deepEqual(Object.keys(again.rows[0]).sort(), ["age", "first", "gu", "id", "last", "main", "mok", "name", "pilsa", "position", "served"]);
  assert.equal(again.rows[0].pilsa, 2);
  assert.equal(again.rows[0].id, 1);
});

test("화면이 돌려보낸 트리(해가 이미 풀린 꼴)도 같은 검사로", () => {
  const first = askOut({ none: [leaf({ field: "served_in_year", op: "has", years_ago: 0 })], all: [leaf({ field: "served_years_count", op: ">=", num: 1 })] }, D, TODAY, true);
  const again = askOut(first.tree, D, TODAY, false);
  assert.deepEqual(again.tree, first.tree);
  assert.deepEqual(again.rows.map((r) => r.name).sort(), ["시험-가", "시험-라"]);
});

test("칩 글", () => {
  const t = tree({ all: [
    leaf({ field: "served_years_count", op: ">=", num: 5, within: { last_years: 10, from: null, to: null }, dept: { level: "mid", name: "찬양대" } }),
    leaf({ field: "served_years_count", op: "=", num: 0 }),
    leaf({ field: "last_served_year", op: "<=", years_ago: 4 }),
    leaf({ field: "position", op: "in", list: ["권사", "집사"] }),
    leaf({ field: "age", op: ">=", num: 50 }),
  ] });
  assert.deepEqual(t.all.map(describeLeaf), ["섬긴 해 5해 이상 · 2017~2026년 · 찬양대", "사역한 적 없음", "마지막 섬긴 해 2022년 이전", "직분 권사·집사", "나이 50 이상"]);
});

test("AI 에게 가는 것 — 스키마는 재귀 없이 · 모든 객체가 additionalProperties false · required 가 모든 칸", () => {
  const s = askSchema();
  const walk = (o, path) => {
    if (!o || typeof o !== "object") return;
    assert.ok(!("$ref" in o), "재귀(참조) 없음: " + path);
    // null 을 받는 갈래 칸(anyOf · 타입 배열)이 많으면 API 가 400 — 하나도 두지 않는다(2026-10-15 개발에서 24칸으로 걸림)
    assert.ok(!("anyOf" in o) && !Array.isArray(o.type), "갈래 칸 없음: " + path);
    if (o.type === "object") {
      assert.equal(o.additionalProperties, false, path);
      assert.deepEqual([...o.required].sort(), Object.keys(o.properties).sort(), path);
    }
    for (const [k, v] of Object.entries(o)) walk(v, path + "." + k);
  };
  walk(s, "$");
  assert.deepEqual(s.properties.all.items.properties.field.enum, FIELDS.map((f) => f.id));
});

test("AI 에게 가는 것 — 지시문에 사람 자료(이름 · 목장 이름 · 나이)가 없다 · 교구 · 부서 이름은 있다", () => {
  const p = askSystemPrompt(D.vocab, TODAY);
  for (const r of PEOPLE) assert.ok(!p.includes(r.name), "이름: " + r.name);
  assert.ok(!p.includes("화평-20"), "목장 이름");
  assert.ok(p.includes("화평 · 사랑 · 소망"));
  assert.ok(p.includes("시온찬양대"));
  assert.ok(p.includes("2010~2026년"));
  assert.ok(p.includes("2021년은 명단이 일부"));
  // 기록 범위 밖의 일부 해는 말하지 않는다
  const v2 = { ...D.vocab, yearMin: 2024, yearMax: 2026 };
  assert.ok(!askSystemPrompt(v2, TODAY).includes("2021년은 명단이 일부"));
});

test("AI 가 「안 씀」을 정해 둔 값(num -1 · years_ago -1 · text \"\" · within 0 · dept none)으로 보내면 없음으로 읽는다", () => {
  const S = { num: -1, years_ago: -1, text: "", list: [], within: { last_years: 0, from: 0, to: 0 }, dept: { level: "none", name: "" } };
  const t = tree({
    all: [leaf({ ...S, field: "served_years_count", op: ">=", num: 10 })],
    none: [leaf({ ...S, field: "served_in_year", op: "has", years_ago: 0 })],
  });
  assert.equal(t.all[0].within, null);
  assert.equal(t.all[0].dept, null);
  assert.equal(t.none[0].year, 2026);
  assert.deepEqual(names(t), ["시험-가"]);
  // 수가 -1 이면(채우지 않음) 그 잎은 「수를 알 수 없어요」
  const c = checkTree({ all: [leaf({ ...S, field: "age", op: ">=", from_text: "나이" })] }, D.vocab, Y);
  assert.equal(c.unsupported[0].note, "「나이」의 수를 알 수 없어요");
});

test("성경필사 — 재료: 교인과 이어진 줄 · 명부에 있는 분만 · 초안 회차 빼고 · 종류는 회차 id 로", () => {
  assert.equal(D.pilsaLinked, 4);
  assert.deepEqual(D.vocab.pilsaSeries, ["사순절 소책자", "사순절 필사", "썸머 써 바이블"]);
  assert.equal(D.vocab.pilsaMin, 2025);
  assert.equal(D.vocab.pilsaMax, 2026);
  assert.equal(D.vocab.pilsaEventYears.length, 3);
});

test("성경필사 — 「2026년 성경필사 하신 분」 · 종류로 좁히기 · 횟수 · 한 번도 안 한 분", () => {
  assert.deepEqual(names(tree({ all: [leaf({ field: "pilsa_in_year", op: "has", num: 2026, from_text: "2026년 성경필사 하신" })] })), ["시험-가", "시험-나"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "pilsa_in_year", op: "has", num: 2026, text: "썸머" })] })), [], "「썸머」만으로는 이름이 안 맞는다 — 종류 이름 그대로");
  assert.deepEqual(names(tree({ all: [leaf({ field: "pilsa_in_year", op: "has", num: 2026, text: "썸머 써 바이블" })] })), ["시험-가"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "pilsa_count", op: ">=", num: 2 })] })), ["시험-가"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "pilsa_count", op: "=", num: 0 })] })), ["시험-다"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "pilsa_count", op: "<=", num: 1 })] })), ["시험-나", "시험-라"]);
  assert.deepEqual(names(tree({ all: [leaf({ field: "pilsa_count", op: ">=", num: 1, within: { last_years: 1, from: 0, to: 0 } })] })), ["시험-가", "시험-나"]);
  // 사역 조건과 함께
  assert.deepEqual(names(tree({ all: [leaf({ field: "pilsa_in_year", op: "has", num: 2026 }), leaf({ field: "position", op: "in", list: ["권사"] })] })), ["시험-가"]);
});

test("성경필사 — 범위 밖 해 · 회차보다 많은 횟수 · 없는 종류는 unsupported", () => {
  const c = checkTree({ all: [
    leaf({ field: "pilsa_in_year", op: "has", num: 2019, from_text: "2019년 성경필사" }),
    leaf({ field: "pilsa_count", op: ">=", num: 5, from_text: "다섯 번 넘게" }),
    leaf({ field: "pilsa_in_year", op: "has", num: 2026, text: "가을 동행", from_text: "가을 동행" }),
  ] }, D.vocab, Y);
  const kinds = Object.fromEntries(c.unsupported.map((u) => [u.text, u.kind]));
  assert.equal(kinds["2019년 성경필사"], "out_of_range");
  assert.equal(kinds["다섯 번 넘게"], "out_of_range");
  assert.equal(kinds["가을 동행"], "no_data");
});

test("성경필사 — 칩 글 · 지시문에 종류와 해", () => {
  const t = tree({ all: [leaf({ field: "pilsa_in_year", op: "has", num: 2026, text: "썸머 써 바이블" }), leaf({ field: "pilsa_count", op: "=", num: 0 })] });
  assert.deepEqual(t.all.map(describeLeaf), ["2026년 성경필사 · 썸머 써 바이블", "성경필사 한 적 없음"]);
  const p = askSystemPrompt(D.vocab, TODAY);
  assert.ok(p.includes("사순절 소책자 · 사순절 필사 · 썸머 써 바이블"));
  assert.ok(p.includes("성경필사 명단이 있는 해: 2025~2026년(회차 3개)"));
  assert.ok(!p.includes("성경필사(아직 교인과 이어지지 않아"));
  // 「봉사를 하지 않는」을 봉사 당번(자료 없음)으로 읽고 멈추지 않게(2026-10-15 친구 예시)
  assert.ok(p.includes("「봉사」·「섬김」·「사역」은 모두 사역 임명 명단"));
});

test("질문 다듬기", () => {
  assert.deepEqual(askQuestion("  10년  넘게\n섬기신 분 "), { ok: true, q: "10년 넘게 섬기신 분" });
  assert.equal(askQuestion("").error, "no-question");
  assert.equal(askQuestion("가".repeat(301)).error, "question-too-long");
  assert.equal(mokKey("화평 - 20 목장"), "화평-20");
  // 번호 앞 0 · 빠진 「-」 · 「교구」(2026-10-15 견주기)
  assert.equal(mokKey("기쁨-06목장"), "기쁨-6");
  assert.equal(mokKey("기쁨-6"), mokKey("기쁨-06"));
  assert.equal(mokKey("기쁨교구 6목장"), "기쁨-6");
  assert.equal(mokKey("기쁨6"), "기쁨-6");
  assert.equal(mokKey("청년부"), "청년부");
  assert.equal(mokKey("화평-10"), "화평-10");
});
