import { test } from "node:test";
import assert from "node:assert/strict";
import { stageOf, isQuiet, checkCard, checkLesson, lessonKindFor, lessonGate, classGate, reportGate, parishGate,
  phoneOf, dupKey, certNo, ageBand, personOut, checkKinds, listScope, canCardRead, canCardWrite, canAssign, canPastor,
  canLessonRead, canLessonWrite, canSeePerson, NF_STAGES, NF_STAGE_LABEL, NF_STAGE_TURN, NF_LESSONS, buildStats, kstDay, parishGroup, NF_BASES, NF_BASIS_LABEL }
  from "../supabase/functions/church-admin/nf-rules.ts";

const TODAY = "2026-10-11";
const view = (chief, kinds = [], helperId = null) => ({ chief, kinds, helperId });
const card = (over = {}) => ({
  consent: true, reg_date: "2026-10-04", service: "3부",
  people: [{ name: " 김 하늘 ", gender: "여", birth: "1959-10-15", phone: "01012345678", target: true }],
  ...over,
});

test("stageOf — 사실에서 단계를 읽는다(위에서부터 먼저 맞는 것)", () => {
  assert.equal(stageOf({ target: false, helper_id: "h", parish: "믿음-35" }, 4), "info");
  assert.equal(stageOf({ target: true }, 0), "wait_helper");
  assert.equal(stageOf({ target: true, helper_id: "h" }, 0), "learning");
  assert.equal(stageOf({ target: true, helper_id: "h" }, 3), "learning");
  assert.equal(stageOf({ target: true, helper_id: "h" }, 4), "wait_class");
  assert.equal(stageOf({ target: true, helper_id: "h", pastor_class_on: "2026-11-01" }, 4), "wait_report");
  assert.equal(stageOf({ target: true, helper_id: "h", pastor_class_on: "2026-11-01", report_sent_at: "2026-11-02T01:00:00Z" }, 4), "wait_parish");
  assert.equal(stageOf({ target: true, helper_id: "h", report_sent_at: "x", parish: "믿음-35" }, 4), "registered");
  assert.equal(stageOf({ target: true, helper_id: "h", parish: "믿음-35", cert_no: "26-201" }, 4), "done");
  assert.equal(stageOf({ target: true, helper_id: "h", stopped_at: "2026-10-20T00:00:00Z" }, 2), "stopped");
  // 섬김이 없이 줄이 네 개일 수는 없지만, 있어도 배정 기다림으로 본다
  assert.equal(stageOf({ target: true }, 4), "wait_helper");
});

test("단계마다 이름과 다음 차례가 있다", () => {
  for (const s of NF_STAGES) {
    assert.ok(NF_STAGE_LABEL[s], s);
    assert.ok(s in NF_STAGE_TURN, s);
  }
  assert.equal(NF_STAGE_TURN.wait_helper, "lead");
  assert.equal(NF_STAGE_TURN.wait_parish, "pastor");
});

test("isQuiet — 교육 중인데 21일 넘게 소식이 없을 때만", () => {
  assert.equal(isQuiet("learning", "2026-09-19", TODAY), true);    // 22일
  assert.equal(isQuiet("learning", "2026-09-20", TODAY), false);   // 21일 — 아직
  assert.equal(isQuiet("learning", "2026-09-19T03:00:00Z", TODAY), true);   // 배정한 때(timestamptz)도 받는다
  assert.equal(isQuiet("wait_class", "2026-08-01", TODAY), false);
  assert.equal(isQuiet("learning", null, TODAY), false);
});

test("phoneOf — 붙임표로 다듬기", () => {
  assert.equal(phoneOf("010 1234 5678"), "010-1234-5678");
  assert.equal(phoneOf("02-2686-5871"), "02-2686-5871");
  assert.equal(phoneOf("0226865871"), "02-2686-5871");
  assert.equal(phoneOf("031-123-4567"), "031-123-4567");
  assert.equal(phoneOf("02-123-4567"), "02-123-4567");
  assert.equal(phoneOf(""), "");
  assert.equal(phoneOf(null), "");
  assert.equal(phoneOf("1234"), null);
  assert.equal(phoneOf("010-12345-67890"), null);
});

test("checkCard — 다듬기와 기본값", () => {
  const r = checkCard(card(), TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.card.reg_date, "2026-10-04");
  assert.equal(r.card.self_come, false);
  assert.equal(r.card.draft, false);
  assert.deepEqual(r.people[0], { relation: "본인", name: "김 하늘", gender: "여", birth: "1959-10-15", birth_lunar: false,
    phone: "010-1234-5678", tel: "", baptized: "unknown", target: true });
  assert.deepEqual(r.guides, []);
});

test("checkCard — 꼭 있어야 하는 것 넷", () => {
  assert.equal(checkCard(card({ consent: false }), TODAY).error, "no-consent");
  assert.equal(checkCard(card({ consent: "true" }), TODAY).error, "no-consent");
  assert.equal(checkCard(card({ reg_date: "" }), TODAY).error, "bad-date");
  assert.equal(checkCard(card({ reg_date: "2026-10-12" }), TODAY).error, "bad-date");   // 앞날
  assert.equal(checkCard(card({ people: [] }), TODAY).error, "no-name");
  assert.equal(checkCard(card({ people: [{ name: " ", target: true }] }), TODAY).error, "no-name");
  assert.equal(checkCard(card({ people: [{ name: "김하늘" }] }), TODAY).error, "no-target");
  assert.equal(checkCard(card({ people: [{ name: "김하늘", target: "yes" }] }), TODAY).error, "no-target");
});

test("checkCard — 마저 채울 카드는 이름·등록일·수료 대상·동의만으로", () => {
  const r = checkCard({ consent: true, reg_date: TODAY, draft: true, people: [{ name: "김하늘", target: false }] }, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.card.draft, true);
  assert.equal(r.card.service, "");
  assert.equal(r.people[0].birth, null);
});

test("checkCard — 틀린 값", () => {
  const p = (over) => card({ people: [{ name: "김하늘", target: true, ...over }] });
  assert.equal(checkCard(card({ service: "4부" }), TODAY).error, "bad-service");
  assert.equal(checkCard(p({ gender: "x" }), TODAY).error, "bad-gender");
  assert.equal(checkCard(p({ birth: "1959-13-01" }), TODAY).error, "bad-birth");
  assert.equal(checkCard(p({ birth: "2027-01-01" }), TODAY).error, "bad-birth");
  assert.equal(checkCard(p({ phone: "123" }), TODAY).error, "bad-phone");
  assert.equal(checkCard(p({ baptized: "maybe" }), TODAY).error, "bad-baptized");
  assert.equal(checkCard(p({ name: "김(하늘)" }), TODAY).error, "bad-name");
  assert.equal(checkCard(p({ name: "가".repeat(21) }), TODAY).error, "too-long");
  assert.equal(checkCard(card({ address: "가".repeat(121) }), TODAY).error, "too-long");
  assert.equal(checkCard(card({ people: Array.from({ length: 9 }, () => ({ name: "김하늘", target: true })) }), TODAY).error, "too-many");
});

test("checkCard — 가족은 줄마다 한 사람 · 첫 줄은 늘 본인 · 음력은 생일이 있을 때만", () => {
  const r = checkCard(card({ people: [
    { name: "김하늘", relation: "배우자", target: true, birth: "1960-01-02", birth_lunar: true },
    { name: "김바다", relation: " 자녀 ", target: false, birth_lunar: true, id: " p2 " },
  ] }), TODAY);
  assert.equal(r.people[0].relation, "본인");
  assert.equal(r.people[0].birth_lunar, true);
  assert.equal(r.people[1].relation, "자녀");
  assert.equal(r.people[1].birth_lunar, false);
  assert.equal(r.people[1].target, false);
  assert.equal(r.people[1].id, "p2");
});

test("checkCard — 인도자 두 분까지 · 스스로 오심과 함께 쓸 수 없다", () => {
  const g = [{ name: "박인도", mok: "기쁨-25", phone: "010-8432-0000", pick: "k1" }, { name: "" }, { name: "최인도" }];
  const r = checkCard(card({ guides: g }), TODAY);
  assert.deepEqual(r.guides, [
    { seq: 1, name: "박인도", mok: "기쁨-25", phone: "010-8432-0000", pick: "k1" },
    { seq: 2, name: "최인도", mok: "", phone: "", pick: null },
  ]);
  assert.equal(checkCard(card({ self_come: true, guides: g }), TODAY).error, "self-and-guide");
  assert.equal(checkCard(card({ self_come: true }), TODAY).card.self_come, true);
  assert.equal(checkCard(card({ guides: [{ name: "a" }, { name: "b" }, { name: "c" }] }), TODAY).error, "too-many");
  assert.equal(checkCard(card({ guides: [{ name: "박인도", phone: "12" }] }), TODAY).error, "bad-phone");
});

test("dupKey — 이름 + 전화 뒷자리 4 · 전화가 없으면 묻지 않는다", () => {
  assert.equal(dupKey(" 김 하늘 ", "010-1234-5678"), "김하늘|5678");
  assert.equal(dupKey("김하늘", ""), "");
  assert.equal(dupKey("", "010-1234-5678"), "");
});

test("checkLesson — 날짜는 오늘이 기본 · 앞날은 안 된다", () => {
  assert.deepEqual(checkLesson({ content: " 첫 만남\n기도 제목 나눔 ", note: " 다음 주 쉼 " }, TODAY).row,
    { met_on: TODAY, content: "첫 만남\n기도 제목 나눔", note: "다음 주 쉼" });
  assert.equal(checkLesson({ met_on: "2026-10-04" }, TODAY).row.met_on, "2026-10-04");
  assert.equal(checkLesson({ met_on: "2026-10-12" }, TODAY).error, "bad-date");
  assert.equal(checkLesson({ met_on: "어제" }, TODAY).error, "bad-date");
  assert.equal(checkLesson({ content: "가".repeat(1001) }, TODAY).error, "too-long");
  assert.equal(checkLesson({}, TODAY).row.content, "");   // 내용 없이도 한 번이 채워진다
});

test("교육 줄 — 네 번까지는 lesson, 그 뒤는 extra", () => {
  assert.equal(NF_LESSONS, 4);
  assert.equal(lessonKindFor(0), "lesson");
  assert.equal(lessonKindFor(3), "lesson");
  assert.equal(lessonKindFor(4), "extra");
});

test("넘어가는 규칙 — 줄·목사님 교육·보고서·교구", () => {
  assert.equal(lessonGate({ target: false }), "not-target");
  assert.equal(lessonGate({ target: true }), "no-helper");
  assert.equal(lessonGate({ target: true, helper_id: "h" }), null);
  assert.equal(lessonGate({ target: true, helper_id: "h", report_sent_at: "x" }), "sent");

  assert.equal(classGate({ target: true, helper_id: "h" }, 3, true), "not-ready");
  assert.equal(classGate({ target: true, helper_id: "h" }, 4, true), null);
  assert.equal(classGate({ target: true }, 4, true), "not-ready");
  assert.equal(classGate({ target: true, helper_id: "h", pastor_class_on: "d" }, 4, false), null);          // 풀기
  assert.equal(classGate({ target: true, helper_id: "h", pastor_class_on: "d", report_sent_at: "x" }, 4, false), "sent");

  assert.equal(reportGate({ target: true }), "not-ready");
  assert.equal(reportGate({ target: true, pastor_class_on: "d" }), null);
  assert.equal(reportGate({ target: true, pastor_class_on: "d", report_sent_at: "x" }), "sent");

  assert.equal(parishGate({ target: true }), "not-ready");
  assert.equal(parishGate({ target: true, report_sent_at: "x" }), null);
  assert.equal(parishGate({ target: true, report_sent_at: "x", parish: "믿음-35" }), null);   // 확정 전에는 바꿀 수 있다
  assert.equal(parishGate({ target: true, report_sent_at: "x", cert_no: "26-201" }), "confirmed");
});

test("certNo — 연도 두 자리 + 세 자리", () => {
  assert.equal(certNo(2026, 201), "26-201");
  assert.equal(certNo(2027, 1), "27-001");
  assert.equal(certNo(2026, 1000), "26-1000");
});

test("ageBand", () => {
  assert.equal(ageBand("1959-10-15", TODAY), "60대");
  assert.equal(ageBand("2020-01-01", TODAY), "미취학");
  assert.equal(ageBand("2010-01-01", TODAY), "10대 이하");
  assert.equal(ageBand("1940-01-01", TODAY), "80대 이상");
  assert.equal(ageBand(null, TODAY), "");
});

test("checkKinds — 모르는 값은 통째로 거절 · 겹침은 하나로", () => {
  assert.deepEqual(checkKinds(["helper", "lead", "helper"]), ["helper", "lead"]);
  assert.deepEqual(checkKinds([]), []);
  assert.equal(checkKinds(["helper", "super"]), null);
  assert.equal(checkKinds("helper"), null);
});

test("누가 무엇을 — 하는 일마다", () => {
  const chief = view(true), greeter = view(false, ["greeter"]), lead = view(false, ["lead"]),
    pastor = view(false, ["pastor"]), helper = view(false, ["helper"], "h1"), nobody = view(false, []),
    unlinked = view(false, ["helper"], null);
  const mine = { helper_id: "h1" }, other = { helper_id: "h2" };

  assert.deepEqual([chief, greeter, lead, pastor, helper, nobody].map(canCardRead), [true, true, true, true, false, false]);
  assert.deepEqual([chief, greeter, lead, pastor, helper].map(canCardWrite), [true, true, false, false, false]);
  assert.deepEqual([chief, greeter, lead, pastor, helper].map(canAssign), [true, false, true, false, false]);
  assert.deepEqual([chief, greeter, lead, pastor, helper].map(canPastor), [true, false, false, true, false]);

  // 교육 줄의 내용 — 운영팀·목사님·그분의 섬김이만
  assert.deepEqual([chief, greeter, lead, pastor, helper].map((v) => canLessonRead(v, mine)), [true, false, false, true, true]);
  assert.equal(canLessonRead(helper, other), false);
  assert.deepEqual([chief, greeter, lead, pastor, helper].map((v) => canLessonWrite(v, mine)), [true, false, false, false, true]);
  assert.equal(canLessonWrite(helper, other), false);
  assert.equal(canLessonWrite(unlinked, { helper_id: null }), false);   // 이어지지 않은 섬김이 — null 끼리 같다고 보지 않는다

  assert.deepEqual([chief, greeter, lead, pastor, helper, unlinked, nobody].map(listScope), ["all", "all", "all", "all", "mine", "none", "none"]);
  assert.equal(canSeePerson(helper, mine), true);
  assert.equal(canSeePerson(helper, other), false);
  assert.equal(canSeePerson(lead, other), true);
});

test("personOut — 섬김이에게는 주소·생일·가족 칸이 없다", () => {
  const p = { id: "p1", card_id: "c1", relation: "본인", name: "김하늘", gender: "여", birth: "1959-10-15", birth_lunar: true,
    phone: "010-1234-5678", tel: "02-123-4567", baptized: "yes", target: true, helper_id: "h1", assigned_at: "2026-10-05T00:00:00Z",
    member_id: "m1", auth_user_id: "a1" };
  const extra = { lessons: 2, lastOn: "2026-10-08", helperName: "이섬김", guides: [{ name: "박인도", mok: "기쁨-25", phone: "010-0000-0000", person_id: 77 }],
    card: { reg_date: "2026-10-04", service: "3부", address: "서울 구로구 어딘가", car_no: "12가3456" } };

  const forHelper = personOut(p, view(false, ["helper"], "h1"), extra, TODAY);
  assert.equal(forHelper.name, "김하늘");
  assert.equal(forHelper.phone, "010-1234-5678");
  assert.equal(forHelper.stage, "learning");
  assert.equal(forHelper.lessons, 2);
  assert.equal(forHelper.ageBand, "60대");
  for (const k of ["address", "birth", "tel", "baptized", "service"]) assert.equal(k in forHelper, false, k);

  const forLead = personOut(p, view(false, ["lead"]), extra, TODAY);
  assert.equal(forLead.address, "서울 구로구 어딘가");
  assert.equal(forLead.birth, "1959-10-15");
  assert.equal(forLead.birthLunar, true);

  // 어느 쪽에도 계정 번호·교인ID·인도자 전화가 실리지 않는다
  for (const out of [forHelper, forLead]) {
    const s = JSON.stringify(out);
    for (const bad of ["m1", "a1", "010-0000-0000", "person_id", "member_id", "12가3456"]) assert.equal(s.includes(bad), false, bad);
    assert.deepEqual(out.guides, [{ name: "박인도", mok: "기쁨-25" }]);
  }
});

test("personOut — 소식 없는 분 표시는 마지막 만남, 없으면 배정한 날로", () => {
  const p = { id: "p1", target: true, helper_id: "h1", assigned_at: "2026-09-01T00:00:00Z" };
  assert.equal(personOut(p, view(true), { lessons: 0 }, TODAY).quiet, true);
  assert.equal(personOut(p, view(true), { lessons: 1, lastOn: "2026-10-04" }, TODAY).quiet, false);
});

test("kstDay · parishGroup", () => {
  assert.equal(kstDay("2026-12-31T16:00:00Z"), "2027-01-01");   // 한국은 이미 새해
  assert.equal(kstDay(null), "");
  assert.equal(parishGroup("믿음-35"), "믿음");
  assert.equal(parishGroup("소망-남성1"), "소망");
  assert.equal(parishGroup(""), "");
  for (const b of NF_BASES) assert.ok(NF_BASIS_LABEL[b], b);
});

test("buildStats — 「등록」을 세는 날이 기준에 따라 달라진다 · 오신 분·수료 대상은 늘 카드를 쓴 날", () => {
  const cards = new Map([["c1", { reg_date: "2026-12-20", self_come: false }], ["c2", { reg_date: "2026-11-01", self_come: true }]]);
  const people = [
    // 12월에 카드 → 이듬해 1월에 교구 배정 → 2월 등록식
    { id: "a", card_id: "c1", target: true, helper_id: "h1", pastor_class_on: "2027-01-10", report_sent_at: "x", parish: "믿음-35", parish_at: "2027-01-11T03:00:00Z", ceremony_id: "e1", cert_no: "27-001" },
    { id: "b", card_id: "c1", target: false },                                        // 아이 — 정보만
    { id: "c", card_id: "c2", target: true, helper_id: "h1" },                        // 교육 중(두 번)
    { id: "d", card_id: "c2", target: true, helper_id: "h2", stopped_at: "2026-11-20T00:00:00Z" },   // 한 번 하고 멈춤
  ];
  const d = { people, cards, guides: new Map([["c1", [{ mok: "기쁨-25" }, { mok: "소망-07" }]]]), ceremonies: new Map([["e1", "2027-02-07"]]),
    lessons: new Map([["a", 4], ["c", 2], ["d", 1]]), helpers: new Map([["h1", "이섬김"], ["h2", "박섬김"]]) };

  const byCard = buildStats(d, "card", 2026);
  assert.deepEqual(byCard.years, [{ year: 2026, came: 4, target: 3, done: 1 }]);
  assert.deepEqual(byCard.months, [{ ym: "2026-11", came: 2, target: 2, done: 0 }, { ym: "2026-12", came: 2, target: 1, done: 1 }]);
  assert.deepEqual(byCard.byParish, [{ name: "믿음", n: 1 }]);

  const byParish = buildStats(d, "parish", 2026);
  assert.deepEqual(byParish.years, [{ year: 2026, came: 4, target: 3, done: 0 }, { year: 2027, came: 0, target: 0, done: 1 }]);
  assert.deepEqual(byParish.byParish, []);                      // 2026년에 교구가 배정된 분은 없다
  assert.deepEqual(buildStats(d, "parish", 2027).months, [{ ym: "2027-01", came: 0, target: 0, done: 1 }]);

  const byCer = buildStats(d, "ceremony", 2027);
  assert.deepEqual(byCer.months, [{ ym: "2027-02", came: 0, target: 0, done: 1 }]);
  assert.equal(byCer.basisLabel, "등록식 날");

  // 지금 단계 · 어디서 멈췄나 · 전도 교구(인도자 둘이면 반씩 · 스스로) · 섬김이
  assert.deepEqual(byCard.stages, { done: 1, info: 1, learning: 1, stopped: 1 });
  assert.deepEqual(byCard.stopAt, [0, 1, 0, 0, 0]);
  assert.deepEqual(byCard.byGuide, [{ name: "스스로", n: 2 }, { name: "기쁨", n: 0.5 }, { name: "소망", n: 0.5 }]);
  assert.deepEqual(byCard.helpers, [{ name: "이섬김", assigned: 2, done: 1 }, { name: "박섬김", assigned: 1, done: 0 }]);
  // 모르는 기준은 card 로
  assert.equal(buildStats(d, "x", 2026).basis, "card");
  // 새가족의 이름·번호는 어디에도 없다
  assert.equal(JSON.stringify(byCard).includes("27-001"), false);
});
