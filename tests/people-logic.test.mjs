import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceLine, affText, initialOf, csvText, EXPORT_COLS, detailSections, searchPayload, pageInfo, exportName, familyOrder }
  from "../js/menus/people/people-logic.js";
import { churchBadgeHtml, hasChurch } from "../js/menus/people/church-badge.js";

test("sourceLine — 없음 · 기준일 · 90일 넘으면 오래됨", () => {
  assert.deepEqual(sourceLine(null, "2026-09-29"), { text: "아직 명부가 없어요 — 새 명단을 올려 주세요", stale: true });
  assert.deepEqual(sourceLine({ source_date: "2026-09-29", total: 8672 }, "2026-10-01"),
    { text: "명부 기준일 2026-09-29 · 8,672명", stale: false });
  assert.equal(sourceLine({ source_date: "2026-06-01", total: 1 }, "2026-09-29").stale, true);
});

test("affText — 교구 목장 · 새가족 · 청년 · 교회학교", () => {
  assert.equal(affText({ mok1: "기쁨", mok3: "기쁨-12목장" }), "기쁨 12목장");
  assert.equal(affText({ mok1: "기쁨", mok3: "기쁨-01목장" }), "기쁨 1목장");
  assert.equal(affText({ mok1: "새가족", mok3: "3월" }), "새가족 3월");
  assert.equal(affText({ mok1: "청년부", mok3: "청년-03" }), "청년부 청년-03");
  assert.equal(affText({ mok1: "", mok3: "", school_dept: "고등부" }), "고등부");
  assert.equal(affText({}), "");
});

test("initialOf · pageInfo · exportName · searchPayload", () => {
  assert.equal(initialOf("김철수"), "김");
  assert.equal(initialOf(""), "?");
  assert.deepEqual(pageInfo(120, 1, 50), { from: 51, to: 100, hasPrev: true, hasNext: true });
  assert.deepEqual(pageInfo(0, 0, 50), { from: 0, to: 0, hasPrev: false, hasNext: false });
  assert.equal(exportName({ source_date: "2026-09-29" }, 12), "교인명부_2026-09-29_12명.csv");
  assert.deepEqual(searchPayload({ q: "김", mok1: "", kind2: "", kind3: "", position: "", noPhoto: 1, page: 2 }),
    { q: "김", mok1: "", kind2: "", kind3: "", position: "", noPhoto: true, household: null, page: 2 });
  assert.equal(searchPayload({ household: 45458 }).household, 45458);
});

test("familyOrder — 세대주가 맨 앞, 그다음 나이 많은 차례, 같으면 가나다", () => {
  const out = familyOrder([
    { person_id: 3, name: "다", age: 10 }, { person_id: 2, name: "나", age: 40 },
    { person_id: 1, name: "가", age: 38 }, { person_id: 4, name: "라", age: null },
  ], 1);
  assert.deepEqual(out.map((x) => x.person_id), [1, 2, 3, 4]);
  assert.deepEqual(familyOrder([], 1), []);
});

test("csvText — BOM · 머리글 · 따옴표 · 사진 있음/없음", () => {
  const csv = csvText([{ person_id: 1, name: '김"철수', has_photo: true }, { person_id: 2, name: "이영희", has_photo: false }]);
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], EXPORT_COLS.map(([, h]) => `"${h}"`).join(","));
  assert.ok(lines[1].startsWith('"1","김""철수"'));
  assert.ok(lines[1].endsWith('"있음"'));
  assert.ok(lines[2].endsWith('"없음"'));
});

const FULL = {
  name: "김하늘", position: "집사", position_detail: "서리집사", gender: "남", age: 45, birth: "1981-03-15", lunar: "양",
  kind1: "교인", kind2: "장년", kind3: "출석교인", registered: "2015-05-02", reg_type: "세례", guide: "이바다",
  phone1: "010-0000-0001", phone2: "010-0000-0002", email: "sky@example.com",
  address: "시험시 시험구 시험로 1", address_jibun: "시험시 시험동 1-1",
  mok1: "기쁨", mok3: "기쁨-12목장", mok_leader: "박가람", school_path: "교육위원회 > 고등부 > 1학년 > 1반",
  teacher: "최나래", youth_path: "청년부 > 청년1부", mission: "남선교회",
  spouse: "이슬", spouse_position: "집사", household_head: "김하늘", household_rel: "본인",
};

test("detailSections — 네 묶음 · 칸 모양 · 넓은 칸", () => {
  const secs = detailSections(FULL);
  assert.deepEqual(secs.map((s) => s.key), ["basic", "contact", "affil", "family"]);
  assert.deepEqual(secs.map((s) => s.title), ["기본", "연락", "소속", "가족"]);
  const f = (key, label) => secs.find((s) => s.key === key).fields.find((x) => x.label === label);
  assert.deepEqual(f("basic", "생년월일"), { label: "생년월일", value: "1981-03-15 · 양" });
  assert.equal(f("basic", "교인 구분").value, "교인 > 장년 > 출석교인");
  assert.equal(f("basic", "등록").value, "2015-05-02 · 세례");
  assert.equal(f("contact", "주소").wide, true);
  assert.equal(f("contact", "지번 주소").wide, true);
  assert.equal(f("affil", "교회학교").wide, true);
  assert.equal(f("affil", "청년").wide, true);
  assert.equal(f("contact", "이메일").wide, true);
  assert.equal(f("affil", "목장 리더").wide, undefined);
  assert.equal(f("family", "배우자").value, "이슬 · 집사");
  assert.equal(f("family", "신앙세대주").value, "김하늘 · 본인");
});

test("detailSections — 왼쪽에 있는 것(이름·직분·소속·나이·연락처)은 되풀이하지 않는다", () => {
  const labels = detailSections(FULL).flatMap((s) => s.fields.map((x) => x.label));
  for (const no of ["이름", "직분", "소속", "성별 · 나이", "연락처", "연락처 2"]) assert.equal(labels.includes(no), false, no);
  const values = detailSections(FULL).flatMap((s) => s.fields.map((x) => x.value));
  assert.equal(values.some((v) => v.includes("010-0000-0001")), false);
});

test("detailSections — 빈 값·빈 묶음은 뺀다", () => {
  assert.deepEqual(detailSections({}), []);
  const secs = detailSections({ email: "  ", address: "시험로 1", lunar: "", birth: null, kind2: "장년" });
  assert.deepEqual(secs.map((s) => s.key), ["basic", "contact"]);
  assert.deepEqual(secs[0].fields, [{ label: "교인 구분", value: "장년" }]);
  assert.deepEqual(secs[1].fields, [{ label: "주소", value: "시험로 1", wide: true }]);
});

test("churchBadgeHtml — 셋 · null 은 빈 글자 · reason 은 esc", () => {
  assert.equal(churchBadgeHtml(null), "");
  assert.match(churchBadgeHtml({ state: "맞음", reason: "" }), /cb-ok.*교적 ✓/);
  assert.match(churchBadgeHtml({ state: "확인 필요", reason: "<b>소속 다름" }), /&lt;b&gt;소속 다름/);
  assert.match(churchBadgeHtml({ state: "없음", reason: "" }), /cb-none.*교적 없음/);
  assert.equal(hasChurch([{ church: null }, {}]), false);
  assert.equal(hasChurch([{ church: { state: "없음", reason: "" } }]), true);
});
