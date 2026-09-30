import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearch, searchDetail, sortOrder, ageBand, statsOf, PAGE_SIZE, PHOTO_TTL, FILTER_MAX, CARD_GU } from "../supabase/functions/church-admin/people-query.ts";

test("parseSearch — 숫자 4자리 이상은 전화 뒷자리, 그 밖은 이름(글자·숫자·- 만)", () => {
  assert.equal(parseSearch({ q: " 김 철수 " }).s.name, "김철수");
  assert.equal(parseSearch({ q: "ca-test-min" }).s.name, "ca-test-min");   // 개발 시험 이름이 그대로 찾아져야 한다
  assert.equal(parseSearch({ q: "5678" }).s.tail, "5678");
  assert.equal(parseSearch({ q: "5678" }).s.name, "");
  assert.equal(parseSearch({ q: "010-1234-5678" }).s.tail, "01012345678");
  assert.equal(parseSearch({ q: "12" }).s.tail, "");                 // 세 자리 이하는 전화로 보지 않는다
  assert.equal(parseSearch({ q: "%_김'" }).s.name, "김");            // ilike 와일드카드·따옴표는 빠진다
  assert.equal(parseSearch({}).s.page, 0);
  assert.equal(parseSearch({ page: 3 }).s.page, 3);
  assert.equal(parseSearch({ page: -1 }).ok, false);
  assert.equal(parseSearch({ page: 1.5 }).ok, false);
  assert.equal(parseSearch({ noPhoto: "true" }).s.noPhoto, false);  // 참은 true 만
  assert.equal(parseSearch({ noPhoto: true }).s.noPhoto, true);
  assert.deepEqual(parseSearch({ mok1: " 기쁨 " }).s.mok1, ["기쁨"]);   // 문자열 하나 → 한 칸짜리 배열(옛 화면 호환)
  assert.equal(parseSearch({}).s.household, null);                  // 가족 보기(세대주 교인ID)
  assert.equal(parseSearch({ household: 45458 }).s.household, 45458);
  assert.equal(parseSearch({ household: "45458" }).s.household, 45458);
  assert.equal(parseSearch({ household: "" }).s.household, null);
  assert.equal(parseSearch({ household: "x" }).ok, false);
  assert.equal(parseSearch({ household: -1 }).ok, false);
  assert.equal(PAGE_SIZE, 50);
  assert.equal(PHOTO_TTL, 600);   // 사진 주소 10분 — 설계 값
});

test("parseSearch — 거르기 넷은 여러 개(배열) · 다듬기 · 겹침 · 50개 · 따옴표/역슬래시는 invalid", () => {
  const s = parseSearch({ mok1: [" 기쁨 ", "소망", "기쁨", "", null], kind2: [], kind3: "", position: ["집사"] }).s;
  assert.deepEqual(s.mok1, ["기쁨", "소망"]);                        // trim · 겹침 · 빈 값 빼기
  assert.deepEqual(s.kind2, []);
  assert.deepEqual(s.kind3, []);
  assert.deepEqual(s.position, ["집사"]);
  assert.deepEqual(parseSearch({}).s.mok1, []);
  assert.deepEqual(parseSearch({ kind3: "청년(대예배출석)" }).s.kind3, ["청년(대예배출석)"]);   // 괄호는 받는다(.in() 이 따옴표로 싼다)
  assert.deepEqual(parseSearch({ kind2: ["a, b"] }).s.kind2, ["a, b"]);
  assert.deepEqual(parseSearch({ mok1: ["가".repeat(30)] }).s.mok1, ["가".repeat(20)]);        // 20자
  assert.deepEqual(parseSearch({ mok1: ["가"] }).s.mok1, ["가"]);           // NFC(자모 분리 → 완성형)
  assert.equal(parseSearch({ mok1: ['기"쁨'] }).ok, false);           // .in() 이 이스케이프하지 않는다
  assert.equal(parseSearch({ position: ["집\\사"] }).ok, false);        // 역슬래시도
  assert.equal(parseSearch({ kind2: 'a"' }).ok, false);
  const many = Array.from({ length: 51 }, (_, i) => "v" + i);
  assert.equal(parseSearch({ mok1: many }).ok, false);                // 한 거르기에 50개까지
  assert.equal(parseSearch({ mok1: many.slice(0, 50) }).s.mok1.length, 50);
  assert.equal(parseSearch({ mok1: [...many.slice(0, 50), "v0"] }).s.mok1.length, 50);   // 겹침은 뺀 뒤 센다
  assert.equal(parseSearch({ mok1: { a: 1 } }).ok, false);            // 배열·문자열이 아니면 invalid
  assert.equal(parseSearch({ mok1: [{}] }).ok, false);
});

test("searchDetail — 빈 거르기는 기록에 남기지 않는다", () => {
  assert.deepEqual(searchDetail(parseSearch({ mok1: "기쁨", noPhoto: true }).s), { mok1: ["기쁨"], noPhoto: true });
  assert.deepEqual(searchDetail(parseSearch({ mok1: ["기쁨", "소망"], kind2: [], position: ["집사"] }).s),
    { mok1: ["기쁨", "소망"], position: ["집사"] });
  assert.deepEqual(searchDetail(parseSearch({ household: 45458 }).s), { household: "45458" });
  assert.deepEqual(searchDetail(parseSearch({}).s), {});
});

test("parseSearch — 정렬(sort·dir) · 기본 이름 오름 · 모르는 값은 invalid", () => {
  const d = parseSearch({}).s;
  assert.equal(d.sort, "name");
  assert.equal(d.dir, "asc");
  assert.equal(parseSearch({ sort: "", dir: "" }).s.sort, "name");      // 빈 값은 기본
  for (const k of ["name", "age", "aff", "kind2"]) assert.equal(parseSearch({ sort: k }).s.sort, k);
  assert.equal(parseSearch({ sort: "age", dir: "desc" }).s.dir, "desc");
  assert.equal(parseSearch({ sort: "phone1" }).ok, false);               // 모르는 칸
  assert.equal(parseSearch({ sort: "name_key" }).ok, false);             // 내부 칸 이름도 안 받는다
  assert.equal(parseSearch({ dir: "down" }).ok, false);
  assert.equal(parseSearch({ sort: ["age"] }).ok, false);                // 문자열만
  assert.equal(parseSearch({ dir: 1 }).ok, false);
});

test("sortOrder — 칸 차례 · 나이 모름은 늘 맨 뒤 · 끝은 person_id", () => {
  const o = (b) => sortOrder(parseSearch(b).s);
  const A = { ascending: true }, D = { ascending: false };
  assert.deepEqual(o({}), [["name_key", A], ["person_id", A]]);
  assert.deepEqual(o({ dir: "desc" }), [["name_key", D], ["person_id", A]]);
  assert.deepEqual(o({ sort: "age", dir: "desc" }),
    [["age", { ascending: false, nullsFirst: false }], ["name_key", A], ["person_id", A]]);
  assert.deepEqual(o({ sort: "age" }),
    [["age", { ascending: true, nullsFirst: false }], ["name_key", A], ["person_id", A]]);
  assert.deepEqual(o({ sort: "aff", dir: "desc" }),
    [["mok1", D], ["mok3", D], ["school_dept", D], ["name_key", A], ["person_id", A]]);
  assert.deepEqual(o({ sort: "kind2" }), [["kind2", A], ["kind3", A], ["name_key", A], ["person_id", A]]);
});

test("searchDetail — 정렬은 기본(이름·오름)이 아닐 때만 남긴다", () => {
  assert.deepEqual(searchDetail(parseSearch({ sort: "name", dir: "asc" }).s), {});
  assert.deepEqual(searchDetail(parseSearch({ sort: "age", dir: "desc" }).s), { sort: "age", dir: "desc" });
  assert.deepEqual(searchDetail(parseSearch({ dir: "desc" }).s), { sort: "name", dir: "desc" });
  assert.deepEqual(searchDetail(parseSearch({ mok1: ["기쁨"], sort: "aff" }).s), { mok1: ["기쁨"], sort: "aff", dir: "asc" });
});

test("거르기 목록 — 한도를 넘으면 곧바로 invalid · 받는 배열 자체가 너무 길어도 invalid", () => {
  // 겹침·빈 값을 빼고 50개면 된다 — 하지만 보낸 배열이 한도의 네 배를 넘으면 훑지 않고 막는다
  assert.equal(parseSearch({ mok1: Array.from({ length: FILTER_MAX * 4 }, () => "기쁨") }).s.mok1.length, 1);
  assert.equal(parseSearch({ mok1: Array.from({ length: FILTER_MAX * 4 + 1 }, () => "기쁨") }).ok, false);
  // 한도를 넘은 뒤에 나오는 이상한 값은 보지도 않는다(그래도 결과는 invalid)
  const many = Array.from({ length: 51 }, (_, i) => "v" + i);
  assert.equal(parseSearch({ mok1: [...many, 'x"'] }).ok, false);
});

test("ageBand", () => {
  assert.equal(ageBand(null), "모름");
  assert.equal(ageBand(""), "모름");
  assert.equal(ageBand(-3), "모름");
  assert.equal(ageBand(5), "10살 아래");
  assert.equal(ageBand(19), "10대");
  assert.equal(ageBand(51), "50대");
  assert.equal(ageBand(80), "80살 이상");
  assert.equal(ageBand("9.9"), "10살 아래");
});

test("statsOf — 교구 차례 · 목장 수 · 사진 없음 · 가구 수 · 연령대×성별 · 거르기 목록", () => {
  const R = (o) => ({ mok1: "", mok3: "", kind2: "", kind3: "", position: "", school_dept: "", gender: "", age: null, has_photo: true, household_id: null, ...o });
  const s = statsOf([
    R({ mok1: "기쁨", mok3: "기쁨-01목장", kind2: "장년", position: "집사", gender: "남", age: 51, household_id: 1 }),
    R({ mok1: "기쁨", mok3: "기쁨-02목장", kind2: "장년", position: "집사", gender: "여", age: 55, has_photo: false, household_id: 1 }),
    R({ mok1: "믿음", mok3: "믿음-01목장", kind2: "장년", position: "권사", gender: "여", age: 70, household_id: 3 }),
    R({ kind2: "교회학교", school_dept: "고등부", gender: "남", age: 17 }),
  ]);
  assert.equal(s.total, 4);
  assert.equal(s.noPhoto, 1);
  assert.equal(s.households, 2);                                 // 세대주 교인ID 가 없는 분은 세지 않는다
  assert.deepEqual(s.gu.map((g) => g.gu), ["믿음", "기쁨", "(목장 없음)"]);   // 앱 교구 차례, 목록 밖은 뒤
  assert.deepEqual(s.gu.find((g) => g.gu === "기쁨"), { gu: "기쁨", n: 2, moks: 2 });
  assert.deepEqual(s.position[0], ["집사", 2]);
  assert.deepEqual(s.school, [["고등부", 1]]);
  assert.deepEqual(s.age.find((a) => a.band === "50대"), { band: "50대", m: 1, f: 1, x: 0 });
  assert.deepEqual(s.options.mok1, ["믿음", "기쁨"]);
  assert.ok(!s.options.position.includes("(없음)"));
  // 맨 위 교구 카드 — 일곱 줄 늘 이 차례 · 없는 교구는 0 · 세대주가 명부에 없으면(person_id 없음) 식구가 많은 교구
  assert.deepEqual(s.guCards.map((c) => c.gu), CARD_GU);
  assert.deepEqual(s.guCards.find((c) => c.gu === "기쁨"), { gu: "기쁨", n: 2, households: 1 });
  assert.deepEqual(s.guCards.find((c) => c.gu === "믿음"), { gu: "믿음", n: 1, households: 1 });
  assert.deepEqual(s.guCards.find((c) => c.gu === "소망"), { gu: "소망", n: 0, households: 0 });
});

test("statsOf facts — 묶음 셋(교구·목장·출석 / 직분·출석 / 연령대·성별·출석·교구) · 값 사전", () => {
  const R = (o) => ({ mok1: "", mok3: "", kind2: "", kind3: "", position: "", school_dept: "", gender: "", age: null, has_photo: true, household_id: null, ...o });
  const f = statsOf([
    R({ mok1: "기쁨", mok3: "기쁨-01목장", kind3: "출석교인", position: "집사", gender: "남", age: 51 }),
    R({ mok1: "기쁨", mok3: "기쁨-01목장", kind3: "출석교인", position: "집사", gender: "남", age: 55 }),
    R({ mok1: "기쁨", mok3: "", kind3: "장기결석", position: "권사", gender: "여", age: 70 }),
    R({ kind3: "", gender: null, age: null }),
  ]).facts;
  assert.deepEqual(f.dict.gu, ["기쁨", "(목장 없음)"]);
  assert.deepEqual(f.dict.kind3, ["출석교인", "(없음)", "장기결석"]);   // 서버 kind3 표 차례(인원 많은 차례 · 같으면 가나다)
  assert.deepEqual(f.dict.position, ["집사", "(없음)", "권사"]);                 // 서버 position 표 차례
  const at = (list, v) => list.indexOf(v);
  const [기쁨, 없음] = [at(f.dict.gu, "기쁨"), at(f.dict.gu, "(목장 없음)")];
  const [출석, 결석, k없음] = [at(f.dict.kind3, "출석교인"), at(f.dict.kind3, "장기결석"), at(f.dict.kind3, "(없음)")];
  // 목장은 이름 없이 번호 — 0 = 목장 칸이 빈 분, 1 부터 목장(사전에 목장 이름이 없다 · 2026-09-30 검토)
  assert.equal("mok" in f.dict, false);
  assert.deepEqual(f.gu, [[기쁨, 1, 출석, 2], [기쁨, 0, 결석, 1], [없음, 0, k없음, 1]]);
  assert.deepEqual(f.position.map(([p, k, n]) => [f.dict.position[p], f.dict.kind3[k], n]),
    [["집사", "출석교인", 2], ["권사", "장기결석", 1], ["(없음)", "(없음)", 1]]);
  assert.deepEqual(f.age.map(([b, s, k, g, n]) => [f.dict.band[b], f.dict.sex[s], f.dict.kind3[k], f.dict.gu[g], n]),
    [["50대", "남", "출석교인", "기쁨", 2], ["70대", "여", "장기결석", "기쁨", 1], ["모름", "모름", "(없음)", "(목장 없음)", 1]]);
});

test("statsOf — 응답에 이름·연락처·교인ID·세대주 번호·목장 이름이 없다(숫자·분류 값만)", () => {
  const rows = [
    { person_id: 990000001, name: "시험가람", phone1: "010-0000-0001", address: "시험시 비밀주소", household_id: 990000001,
      mok1: "기쁨", mok3: "기쁨-시험목장01", kind2: "장년", kind3: "출석교인", position: "집사", school_dept: "", gender: "남", age: 40, has_photo: true },
    { person_id: 990000002, name: "시험나래", phone1: "010-0000-0002", address: "시험시 비밀주소", household_id: 990000001,
      mok1: "소망", mok3: "소망-시험목장02", kind2: "장년", kind3: "출석교인", position: "", school_dept: "", gender: "여", age: 38, has_photo: false },
  ];
  const s = statsOf(rows);
  const json = JSON.stringify(s);
  for (const bad of ["시험가람", "시험나래", "010-0000", "비밀주소", "990000001", "990000002", "person_id", "household_id", "phone", "name",
    "시험목장", "기쁨-", "소망-"]) {
    assert.ok(!json.includes(bad), "응답에 들어갔다: " + bad);
  }
  // 세대주(990000001)는 기쁨 — 소망에 사는 식구가 있어도 가구는 기쁨에서 한 번만
  assert.deepEqual(s.guCards.filter((c) => c.households).map((c) => [c.gu, c.households]), [["기쁨", 1]]);
  assert.equal(s.guCards.find((c) => c.gu === "소망").n, 1);
});
