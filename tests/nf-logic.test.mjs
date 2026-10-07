import { test } from "node:test";
import assert from "node:assert/strict";
import { birthIn, birthText, cardToForm, formToCard, blankPerson, personLine, guideLine, stageText, groupByStage, groupByCard,
  helperOptions, foundMok, foundOptions, shrinkSize, nfWord, KIND_OPTIONS, KIND_LABEL, STAGE_ORDER, STAGE_HINT, lessonTitle, recordHint, waitDays, candOptions, exportName, confirmText, BASIS_OPTIONS, DONE_LABEL, rateText, yearOptions, statsSheet }
  from "../js/menus/newfamily/nf-logic.js";
import { NF_KINDS, NF_STAGES, NF_SERVICES, NF_LESSONS, NF_BASES, NF_BASIS_LABEL } from "../supabase/functions/church-admin/nf-rules.ts";
import { SERVICES, LESSONS } from "../js/menus/newfamily/nf-logic.js";

test("화면과 서버의 목록이 같다 — 하는 일·단계·예배·교육 횟수", () => {
  assert.deepEqual(KIND_OPTIONS.map((o) => o.value), [...NF_KINDS]);
  assert.deepEqual(Object.keys(KIND_LABEL).sort(), [...NF_KINDS].sort());
  assert.deepEqual([...STAGE_ORDER].sort(), [...NF_STAGES].sort());
  for (const s of NF_STAGES) assert.ok(STAGE_HINT[s], s);
  assert.deepEqual(SERVICES, [...NF_SERVICES]);
  assert.equal(LESSONS, NF_LESSONS);
});

test("birthIn — 여덟 자리·여섯 자리·구분 글자", () => {
  assert.equal(birthIn("19591015", 2026), "1959-10-15");
  assert.equal(birthIn("591015", 2026), "1959-10-15");
  assert.equal(birthIn("180301", 2026), "2018-03-01");
  assert.equal(birthIn("59.10.15", 2026), "1959-10-15");
  assert.equal(birthIn("1959-10-15", 2026), "1959-10-15");
  assert.equal(birthIn("59년 10월 15일", 2026), "1959-10-15");
  assert.equal(birthIn("", 2026), "");
  assert.equal(birthIn("  ", 2026), "");
  assert.equal(birthIn("1959", 2026), null);
  assert.equal(birthIn("19591315", 2026), null);
  assert.equal(birthIn("19590231", 2026), null);
  assert.equal(birthText("1959-10-15"), "1959.10.15");
  assert.equal(birthText(null), "");
});

test("cardToForm — 새 카드는 오늘·본인 한 줄·인도자 두 칸", () => {
  const f = cardToForm(null, "2026-10-11");
  assert.equal(f.regDate, "2026-10-11");
  assert.equal(f.consent, false);
  assert.equal(f.people.length, 1);
  assert.equal(f.people[0].relation, "본인");
  assert.equal(f.people[0].target, null);   // 예/아니오를 골라야 한다
  assert.equal(f.guides.length, 2);
});

test("cardToForm → formToCard — 고칠 때 번호·때(base)가 실린다", () => {
  const r = { card: { id: "c1", updatedAt: "t1", regDate: "2026-10-04", service: "3부", address: "주소", selfCome: false, draft: true },
    guides: [{ seq: 1, name: "박인도", mok: "기쁨-25", phone: "010-1111-2222" }],
    people: [{ id: "p1", relation: "본인", name: "김하늘", gender: "여", birth: "1959-10-15", birthLunar: true, phone: "010-1234-5678", tel: "", baptized: "yes", target: true },
      { id: "p2", relation: "자녀", name: "김바다", gender: "", birth: null, phone: "", tel: "", baptized: "unknown", target: false }] };
  const f = cardToForm(r, "2026-10-11");
  assert.equal(f.people[0].birth, "1959.10.15");
  assert.equal(f.consent, true);
  const { body } = formToCard(f, 2026);
  assert.equal(body.card_id, "c1");
  assert.equal(body.base, "t1");
  assert.equal(body.draft, true);
  assert.deepEqual(body.people[0], { id: "p1", relation: "본인", name: "김하늘", gender: "여", birth: "1959-10-15", birth_lunar: true,
    phone: "010-1234-5678", tel: "", baptized: "yes", target: true });
  assert.equal(body.people[1].birth, "");
  assert.equal(body.people[1].target, false);
  assert.deepEqual(body.guides, [{ name: "박인도", mok: "기쁨-25", phone: "010-1111-2222" }]);
});

test("formToCard — 보내기 전에 잡는 것", () => {
  const base = () => ({ ...cardToForm(null, "2026-10-11"), consent: true });
  assert.equal(formToCard({ ...base(), consent: false }, 2026).error, nfWord("no-consent"));
  assert.match(formToCard(base(), 2026).error, /이름/);
  const f = base();
  f.people[0] = { ...blankPerson(true), name: "김하늘" };
  assert.match(formToCard(f, 2026).error, /예 \/ 아니오/);
  f.people[0].target = true;
  f.people[0].birth = "1959";
  assert.match(formToCard(f, 2026).error, /생년월일/);
  f.people[0].birth = "";
  // 이름 없는 가족 줄은 건너뛴다 · 스스로 오심이면 인도자를 보내지 않는다
  f.people.push(blankPerson(false));
  f.guides[0].name = "박인도";
  f.selfCome = true;
  const { body } = formToCard(f, 2026);
  assert.equal(body.people.length, 1);
  assert.deepEqual(body.guides, []);
  assert.equal(body.self_come, true);
  assert.equal("card_id" in body, false);
});

test("명단의 글 — 둘째 줄·인도자·단계", () => {
  assert.equal(personLine({ relation: "본인", gender: "여", ageBand: "60대", service: "3부", regDate: "2026-10-04" }), "여 · 60대 · 3부 · 10.04 등록");
  assert.equal(personLine({ relation: "자녀", gender: "", ageBand: "미취학" }), "자녀 · 미취학");
  assert.equal(guideLine({ guides: [{ name: "박인도", mok: "기쁨-25" }, { name: "최인도", mok: "" }] }), "인도 박인도(기쁨-25), 최인도");
  assert.equal(guideLine({ guides: [] }), "");
  assert.equal(stageText({ stage: "learning", lessons: 2, stageLabel: "교육 중" }), "교육 중 2/4");
  assert.equal(stageText({ stage: "wait_helper", stageLabel: "배정 기다림" }), "배정 기다림");
});

test("groupByStage — 할 일이 있는 단계가 위로 · 소식 없는 분이 먼저 · 이름 찾기", () => {
  const people = [
    { id: 1, name: "가나", stage: "info", stageLabel: "정보만" },
    { id: 2, name: "다라", stage: "learning", stageLabel: "교육 중", quiet: false },
    { id: 3, name: "마바", stage: "learning", stageLabel: "교육 중", quiet: true },
    { id: 4, name: "사아", stage: "wait_helper", stageLabel: "배정 기다림" },
  ];
  const g = groupByStage(people);
  assert.deepEqual(g.map((x) => x.stage), ["wait_helper", "learning", "info"]);
  assert.deepEqual(g[1].people.map((p) => p.id), [3, 2]);
  assert.deepEqual(groupByStage(people, "마").map((x) => x.people.length), [1]);
  assert.deepEqual(groupByStage([], ""), []);
});

test("groupByCard — 본인이 먼저 · 등록일 늦은 카드부터", () => {
  const cards = [{ id: "a", regDate: "2026-10-04" }, { id: "b", regDate: "2026-10-11" }];
  const people = [{ id: 1, cardId: "a", relation: "자녀" }, { id: 2, cardId: "a", relation: "본인" }, { id: 3, cardId: "b", relation: "본인" }];
  const g = groupByCard(cards, people);
  assert.deepEqual(g.map((c) => c.id), ["b", "a"]);
  assert.deepEqual(g[1].people.map((p) => p.id), [2, 1]);
});

test("helperOptions — 쉬는 분은 빠지고 맡은 수가 적은 분부터", () => {
  const hs = [{ id: "1", name: "나섬김", services: "3부", load: 2, resting: false }, { id: "2", name: "가섬김", services: "", load: 0, resting: false },
    { id: "3", name: "쉬는분", services: "", load: 0, resting: true }];
  assert.deepEqual(helperOptions(hs), [{ value: "2", label: "가섬김 · 지금 0분" }, { value: "1", label: "나섬김 · 3부 · 지금 2분" }]);
  assert.equal(helperOptions(hs, { withClear: true }).at(-1).label, "배정 풀기");
});

test("명부에서 찾은 분 — 목장 글자", () => {
  assert.equal(foundMok({ church_mok: "기쁨-25", group: "기쁨", sub: "25" }), "기쁨-25");
  assert.equal(foundMok({ church_mok: "", group: "기쁨", sub: "25" }), "기쁨-25");
  assert.deepEqual(foundOptions([{ name: "박인도", church_mok: "기쁨-25", position: "집사" }]), [{ value: "0", label: "박인도 · 기쁨-25 · 집사" }]);
});

test("shrinkSize — 긴 변 1600", () => {
  assert.deepEqual(shrinkSize(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(shrinkSize(3000, 4000), { w: 1200, h: 1600 });
  assert.deepEqual(shrinkSize(800, 600), { w: 800, h: 600 });
});

test("lessonTitle — 교육 줄은 차례대로, 덧붙인 줄은 「덧붙임」", () => {
  const all = [{ kind: "lesson" }, { kind: "lesson" }, { kind: "extra" }, { kind: "lesson" }, { kind: "lesson" }, { kind: "extra" }];
  assert.deepEqual(all.map((l, i) => lessonTitle(l, all, i)), ["첫째 만남", "둘째 만남", "덧붙임", "셋째 만남", "넷째 만남", "덧붙임"]);
});

test("recordHint — 누가 무엇을 할 차례인지", () => {
  const p = (stage, lessons = 0) => ({ stage, lessons });
  assert.match(recordHint({ person: p("learning", 2), canWrite: true }), /한 줄씩.*2\/4/);
  assert.match(recordHint({ person: p("learning", 2), canWrite: false }), /교육 중/);
  assert.match(recordHint({ person: p("wait_class", 4), canPastor: true }), /참석으로 표시/);
  assert.match(recordHint({ person: p("wait_class", 4), canPastor: false }), /기다려요/);
  assert.match(recordHint({ person: p("wait_report", 4), canSend: true }), /보내 주세요/);
  assert.match(recordHint({ person: p("wait_parish", 4), canPastor: true }), /교구를 정해/);
  assert.match(recordHint({ person: p("wait_parish", 4), canPastor: false }), /고칠 수 없어요/);
  assert.equal(recordHint({ person: p("info") }), "");
});

test("서버가 돌려주는 2단계 오류마다 한국말이 있다", () => {
  for (const c of ["same-day", "no-helper", "class-done", "not-ready", "no-note", "has-parish", "bad-parish", "sent", "stopped", "not-target"]) assert.ok(nfWord(c), c);
});

test("등록식 — 기다린 날 수 · 후보 줄 · 파일 이름 · 확정 글", () => {
  assert.equal(waitDays("2026-10-01T03:00:00Z", "2026-10-11"), "교구 배정 뒤 10일");
  assert.equal(waitDays("2026-10-10T16:00:00Z", "2026-10-11"), "오늘 교구 배정");   // 한국 날짜로는 11일
  assert.equal(waitDays(null, "2026-10-11"), "");
  assert.deepEqual(candOptions([{ id: "a", name: "김하늘", parish: "믿음-35", helperName: "이섬김", waitNote: "출장" }, { id: "b", name: "박바다", parish: "소망-07", helperName: "" }]),
    [{ value: "a", label: "김하늘 · 믿음-35 · 섬김이 이섬김", hint: "사정 있음" }, { value: "b", label: "박바다 · 소망-07", hint: "" }]);
  assert.equal(exportName("2026-10-25"), "새가족_등록식_명단_20261025.xlsx");
  const t = confirmText({ count: 3, away: 1, nextNo: "26-201" });
  assert.equal(t.length, 3);
  assert.match(t[0], /3분.*26-201/);
  assert.match(t[1], /못 오심.*1분/);
  assert.equal(confirmText({ count: 2, away: 0, nextNo: "27-001" }).length, 2);
  for (const c of ["already", "empty", "confirmed", "changed"]) assert.ok(nfWord(c), c);
});

test("통계 — 기준 셋은 서버와 같다 · 비율 · 해 고르기 · 엑셀 맨 위에 기준", () => {
  assert.deepEqual(BASIS_OPTIONS.map((o) => o.value), [...NF_BASES]);
  for (const o of BASIS_OPTIONS) { assert.equal(o.label, NF_BASIS_LABEL[o.value]); assert.ok(DONE_LABEL[o.value]); }
  assert.equal(rateText(106, 168), "63%");
  assert.equal(rateText(0, 0), "");
  assert.deepEqual(yearOptions([{ year: 2026 }, { year: 2027 }], 2026, 2027).map((o) => o.value), ["2027", "2026"]);
  assert.deepEqual(yearOptions([], 2026, 2026).map((o) => o.label), ["2026년"]);
  const sh = statsSheet({ basis: "parish", basisLabel: "교구가 배정된 날", today: "2026-10-11", year: 2026,
    years: [{ year: 2026, came: 10, target: 8, done: 5 }], months: [{ ym: "2026-10", came: 10, target: 8, done: 5 }] });
  assert.equal(sh.name, "새가족_통계_parish_20261011.xlsx");
  assert.match(sh.rows[1][0], /세는 기준: 교구가 배정된 날/);
  assert.deepEqual(sh.rows[3], ["해", "오신 분", "수료 대상", "교구 배정"]);
  assert.deepEqual(sh.rows.at(-1), ["10월", 10, 8, 5]);
});
