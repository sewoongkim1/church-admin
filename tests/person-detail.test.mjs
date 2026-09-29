import { test } from "node:test";
import assert from "node:assert/strict";
import { personDetailHtml, FEW_FIELDS } from "../js/menus/people/person-detail.js";

const FULL = {
  person_id: 900001, name: "김하늘", position: "집사", position_detail: "서리집사", gender: "남", age: 45,
  birth: "1981-03-15", lunar: "양", kind1: "교인", kind2: "장년", kind3: "출석교인", registered: "2015-05-02",
  reg_type: "세례", guide: "이바다", phone1: "010-0000-0001", phone2: "010-0000-0002", email: "sky@example.com",
  address: "시험시 시험구 시험로 1", address_jibun: "시험시 시험동 1-1", mok1: "기쁨", mok3: "기쁨-12목장",
  mok_leader: "박가람", teacher: "최나래", mission: "남선교회", spouse: "이슬", spouse_position: "집사",
  household_head: "김하늘", household_rel: "본인", household_id: 900001, photo: "https://x.test/a.jpg?t=1&u=2",
};
const FAM = [
  { person_id: 900002, name: "이슬", household_rel: "처", age: 43 },
  { person_id: 900003, name: "김다온", household_rel: "아들1", age: 12 },
];

test("personDetailHtml — 줄바꿈 글자가 없다(dialog 본문이 pre-line)", () => {
  assert.equal(/[\r\n]/.test(personDetailHtml(FULL, FAM)), false);
  assert.equal(/[\r\n]/.test(personDetailHtml({}, [])), false);
  assert.equal(/[\r\n]/.test(personDetailHtml({ ...FULL, address: "줄\n바꿈" }, FAM)), false);
});

test("personDetailHtml — 모든 값을 esc 한다", () => {
  const bad = '<img src=x onerror="alert(1)">';
  const html = personDetailHtml({ ...FULL, name: bad, position: bad, address: bad, mok_leader: bad, photo: 'a"b' },
    [{ person_id: '1"x', name: bad, household_rel: bad, age: 3 }]);
  assert.equal(html.includes("<img src=x"), false);
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"));
  assert.ok(html.includes('src="a&quot;b"'));
  assert.ok(html.includes('data-fam="1&quot;x"'));
});

test("personDetailHtml — 꽉 찬 기록: 사진 · 이름 · 직분 · 소속 · 전화 · 묶음", () => {
  const html = personDetailHtml(FULL, FAM);
  assert.ok(html.includes('src="https://x.test/a.jpg?t=1&amp;u=2"'));
  assert.ok(html.includes('referrerpolicy="no-referrer"'));
  assert.ok(html.includes("김하늘"));
  assert.ok(html.includes("집사 · 서리집사"));
  assert.ok(html.includes("기쁨 12목장"));
  assert.ok(html.includes("남 · 45세"));
  assert.ok(html.includes('href="tel:01000000001"'));
  assert.ok(html.includes('href="tel:01000000002"'));
  assert.ok(html.includes('aria-label="김하늘에게 전화'));
  for (const t of ["기본", "연락", "소속", "가족"]) assert.ok(html.includes(`>${t}<`), t);
});

test("personDetailHtml — 가족 단추 data-fam · data-fam-all", () => {
  const html = personDetailHtml(FULL, FAM);
  assert.ok(html.includes('data-fam="900002"'));
  assert.ok(html.includes('data-fam="900003"'));
  assert.ok(html.includes('data-fam-all="900001"'));
  assert.ok(html.includes("가족 모두 목록으로"));
  // 가족이 없거나 세대주 번호가 없으면 가족 단추를 그리지 않는다
  assert.equal(personDetailHtml(FULL, []).includes("data-fam"), false);
  assert.equal(personDetailHtml({ ...FULL, household_id: null }, FAM).includes("data-fam"), false);
});

test("personDetailHtml — 빈 기록: 첫 글자 칸 · 묶음 없음 · 전화 없음", () => {
  const html = personDetailHtml({ name: "박보람" }, []);
  assert.ok(html.includes(">박<"));
  assert.equal(html.includes("<img"), false);
  assert.equal(html.includes("pd-sec"), false);
  assert.equal(html.includes("tel:"), false);
  assert.ok(personDetailHtml({}, []).includes(">?<"));
  assert.doesNotThrow(() => personDetailHtml({}));
});

test("personDetailHtml — 세대주 필드가 없어도 가족이 있으면 가족 묶음을 그린다", () => {
  const html = personDetailHtml({ name: "김하늘", household_id: 7 }, FAM);
  assert.ok(html.includes(">가족<"));
  assert.ok(html.includes('data-fam-all="7"'));
});

test("personDetailHtml — 값 속 「 > 」는 옅은 › 로(esc 한 뒤에 바꾼다)", () => {
  const html = personDetailHtml({ ...FULL, school_path: "교육위원회 > 고등부" }, FAM);
  assert.ok(html.includes('교육위원회 <span class="pd-sep" aria-hidden="true">›</span> 고등부'));
  assert.equal(html.includes(" &gt; "), false);
  // 사용자 글자 속 꺾쇠 태그는 여전히 esc 된 채로 남는다
  const bad = personDetailHtml({ name: "가", guide: "<b> > x" }, []);
  assert.ok(bad.includes("&lt;b&gt;"));
  assert.equal(bad.includes("<b>"), false);
});

test("personDetailHtml — 적힌 것이 적으면 창을 좁히는 표식(.pd-empty · .pd-few)", () => {
  assert.ok(personDetailHtml({ name: "가", phone1: "010-0000-0000" }, []).includes('class="pd-wrap pd-empty"'));
  assert.ok(personDetailHtml({ name: "가", kind2: "장년", registered: "2026-08-02" }, []).includes('class="pd-wrap pd-few"'));
  const many = { name: "가", birth: "2000-01-01", kind2: "장년", registered: "2026-08-02", guide: "나", email: "a@b.c" };
  assert.equal(Object.keys(many).length - 1 > FEW_FIELDS, true);
  assert.ok(personDetailHtml(many, []).includes('class="pd-wrap"'));
  // 가족 단추가 있으면 칸이 적어도 넓은 창(가족 칩이 들어갈 자리)
  assert.ok(personDetailHtml({ name: "가", household_id: 7, household_head: "가" }, FAM).includes('class="pd-wrap"'));
});

test("personDetailHtml — 가족은 있는데 세대주가 명단에 없으면 그렇다고 적는다", () => {
  const html = personDetailHtml({ name: "이슬", household_id: 7, household_rel: "처" }, FAM);
  assert.ok(html.includes("<dt>신앙세대주</dt><dd>(명단에 없음) · 처</dd>"));
  assert.equal((html.match(/신앙세대주/g) || []).length, 1);
  // 가족이 없으면 적지 않는다
  assert.equal(personDetailHtml({ name: "이슬", household_id: 7 }, []).includes("명단에 없음"), false);
});
