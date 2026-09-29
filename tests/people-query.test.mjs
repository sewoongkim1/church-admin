import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSearch, searchDetail, ageBand, statsOf, PAGE_SIZE, PHOTO_TTL } from "../supabase/functions/church-admin/people-query.ts";

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
});
