import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceLine, affText, initialOf, csvText, EXPORT_COLS, detailSections, searchPayload, pageInfo, exportName, familyOrder,
  pickSummary, filterChoices, sameSet, nextSort, sortMark, SORTS }
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
  assert.deepEqual(searchPayload({ q: "김", mok1: [], kind2: [], kind3: [], position: [], noPhoto: 1, page: 2 }),
    { q: "김", mok1: [], kind2: [], kind3: [], position: [], noPhoto: true, household: null, page: 2, sort: "name", dir: "asc" });
  assert.deepEqual([searchPayload({ sort: "age", dir: "desc" }).sort, searchPayload({ sort: "age", dir: "desc" }).dir], ["age", "desc"]);
  assert.equal(searchPayload({ household: 45458 }).household, 45458);
  // 거르기는 배열 — 여러 개 · 빈 값 빼기 · 문자열 하나(옛 조건)는 한 칸짜리로 · 없으면 빈 배열
  const p = searchPayload({ mok1: ["기쁨", "", "소망"], kind2: "청년" });
  assert.deepEqual(p.mok1, ["기쁨", "소망"]);
  assert.deepEqual(p.kind2, ["청년"]);
  assert.deepEqual(p.kind3, []);
  assert.deepEqual(p.position, []);
  const src = { mok1: ["기쁨"] };
  searchPayload(src).mok1.push("x");
  assert.deepEqual(src.mok1, ["기쁨"], "화면 상태를 건드리지 않는다(사본)");
});

test("nextSort — 같은 머리는 방향만 바꾸고, 다른 머리는 그 머리의 오름차순", () => {
  assert.deepEqual(nextSort({ sort: "name", dir: "asc" }, "name"), { sort: "name", dir: "desc" });
  assert.deepEqual(nextSort({ sort: "name", dir: "desc" }, "name"), { sort: "name", dir: "asc" });
  assert.deepEqual(nextSort({ sort: "name", dir: "desc" }, "age"), { sort: "age", dir: "asc" });
  assert.deepEqual(nextSort({ sort: "age", dir: "asc" }, "kind2"), { sort: "kind2", dir: "asc" });
  assert.deepEqual(nextSort({}, "name"), { sort: "name", dir: "desc" });      // 없으면 기본(이름·오름)으로 본다
  assert.deepEqual(nextSort({}, "aff"), { sort: "aff", dir: "asc" });
  assert.deepEqual(SORTS.map(([k]) => k), ["name", "age", "aff", "kind2"]);   // 서버 people-query.ts SORT_KEYS 와 같게
});

test("sortMark — 지금 정렬은 ▲(오름)/▼(내림) · 아닌 머리는 중립 ⇅(눌러서 정렬할 수 있다는 표시)", () => {
  assert.deepEqual(sortMark({ sort: "age", dir: "asc" }, "age"), { on: true, text: "▲" });
  assert.deepEqual(sortMark({ sort: "age", dir: "desc" }, "age"), { on: true, text: "▼" });
  assert.deepEqual(sortMark({ sort: "age", dir: "desc" }, "name"), { on: false, text: "⇅" });
  assert.deepEqual(sortMark({}, "name"), { on: true, text: "▲" });            // 없으면 기본(이름·오름)
  assert.deepEqual(sortMark({}, "aff"), { on: false, text: "⇅" });
});

test("pickSummary — 없음 「전체」 · 1~2개는 잇고 · 3개 이상은 「첫째 외 N」", () => {
  assert.equal(pickSummary([]), "전체");
  assert.equal(pickSummary(undefined), "전체");
  assert.equal(pickSummary(["기쁨"]), "기쁨");
  assert.equal(pickSummary(["기쁨", "소망"]), "기쁨 · 소망");
  assert.equal(pickSummary(["기쁨", "소망", "믿음"]), "기쁨 외 2");
  assert.equal(pickSummary(["a", "b", "c", "d", "e"]), "a 외 4");
});

test("filterChoices — 현황(stats)에서 [값, 인원] · 「없음」 칸은 뺀다", () => {
  const c = filterChoices({
    gu: [{ gu: "믿음", n: 3, moks: 1 }, { gu: "기쁨", n: 2, moks: 2 }, { gu: "(목장 없음)", n: 9, moks: 0 }],
    kind2: [["장년", 4], ["(없음)", 2], ["청년", 1]],
    kind3: [["출석교인", 5]],
    position: [["집사", 2], ["(없음)", 7]],
  });
  assert.deepEqual(c.mok1, [["믿음", 3], ["기쁨", 2]]);
  assert.deepEqual(c.kind2, [["장년", 4], ["청년", 1]]);
  assert.deepEqual(c.kind3, [["출석교인", 5]]);
  assert.deepEqual(c.position, [["집사", 2]]);
  assert.deepEqual(filterChoices({}), { mok1: [], kind2: [], kind3: [], position: [] });
});

test("sameSet — 판이 닫힐 때 고른 것이 바뀌었나(차례는 보지 않는다)", () => {
  assert.equal(sameSet([], []), true);
  assert.equal(sameSet(["a", "b"], ["b", "a"]), true);
  assert.equal(sameSet(["a"], ["a", "b"]), false);
  assert.equal(sameSet(["a"], ["b"]), false);
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

test("detailSections — 칸은 화면에 놓이는 차례 그대로(짧은 칸 둘이 먼저 한 줄 · 교회학교 바로 아래 교사 · dense 를 안 쓴다)", () => {
  const affil = detailSections({ ...FULL, school_path: "교육위원회 > 고등부", youth_path: "청년부 > 청년1부" })
    .find((s) => s.key === "affil").fields;
  assert.deepEqual(affil.map((x) => x.label), ["목장 리더", "선교회", "교회학교", "교사", "청년"]);
  assert.deepEqual(affil.map((x) => !!x.wide), [false, false, true, true, true]);
  // 넓은 칸 아닌 것이 둘씩 이어져 한 줄을 채운다(장년: 목장 리더 · 선교회)
  assert.deepEqual(detailSections({ mok_leader: "박가람", mission: "남선교회" })[0].fields.map((x) => x.label), ["목장 리더", "선교회"]);
  // 오른쪽 칸에는 전화 링크 표시가 없다(연락처는 왼쪽 단 전화 단추로)
  assert.equal(detailSections(FULL).flatMap((s) => s.fields).some((x) => "tel" in x), false);
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
