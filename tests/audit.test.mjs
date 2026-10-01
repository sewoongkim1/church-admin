import { test } from "node:test";
import assert from "node:assert/strict";
import { LABEL, LOOKUP_MINISTRY, detailText, labelOf } from "../js/menus/system/audit.js";
import { ministryApplicant, ministryLookupLog, personOutFor } from "../supabase/functions/church-admin/events-person.ts";

// 기록 한 줄 — 서버 auditList 가 주는 모양({action, target, detail})
const R = (action, detail, target = "") => ({ action, target, detail });
const NEW = ["event.create", "event.settings", "event.add", "event.edit", "event.delete", "event.upload", "people.lookup", "people.fill"];

test("성경필사(암송) 기록 여덟 가지 — 모두 한국말 이름이 있다(없으면 화면에 영문 코드가 뜬다)", () => {
  for (const a of NEW) {
    assert.equal(typeof LABEL[a], "string", a);
    assert.match(LABEL[a], /[가-힣]/, a);
  }
});

test("event.create — 이름 · 기간 · 상태 · 명단 공개 종료", () => {
  const after = { title: "2026 가을 말씀 동행", short_title: "가을 말씀 동행", subtitle: "", season: "2026-4Q",
    opens_on: "2026-10-27", closes_on: "2026-11-28", status: "draft", list_until: "2026-12-13" };
  assert.equal(detailText(R("event.create", { title: after.title, before: {}, after }, "autumn-2026")),
    "‘2026 가을 말씀 동행’ · 2026-10-27 ~ 2026-11-28 · 준비 중 · 명단 공개 종료 2026-12-13");
  assert.equal(detailText(R("event.create", { title: after.title, before: {}, after: { ...after, list_until: null } })),
    "‘2026 가을 말씀 동행’ · 2026-10-27 ~ 2026-11-28 · 준비 중 · 명단 공개 종료 기한 없음");
});

test("event.settings — 바꾼 칸만 「전 → 후」 · 상태는 한국말 · 빈 공개 종료일은 「기한 없음」", () => {
  assert.equal(detailText(R("event.settings", { title: "2026 사순절 필사",
    before: { status: "draft", list_until: null }, after: { status: "open", list_until: "2026-12-13" } }, "lent-2026")),
    "‘2026 사순절 필사’ · 상태 준비 중 → 열림 · 공개 종료일 기한 없음 → 2026-12-13");
  assert.equal(detailText(R("event.settings", { title: "2026 사순절 필사",
    before: { opens_on: "2026-02-18", subtitle: "" }, after: { opens_on: "2026-02-19", subtitle: "한 줄" } })),
    "‘2026 사순절 필사’ · 시작일 2026-02-18 → 2026-02-19 · 부제 (없음) → 한 줄");
  // 회차 차례(sort_order · 2026-09-30) — 서버는 글자로 남긴다
  const so = detailText(R("event.settings", { title: "2026 사순절 필사", before: { sort_order: "0" }, after: { sort_order: "5" } }));
  assert.ok(so.includes("차례 0 → 5"), so);
  assert.equal(so, "‘2026 사순절 필사’ · 차례 0 → 5");
});

test("event.add — 이름 · 소속(교구 줄의 숫자 목장에만 「목장」) · 직분 · 회차 · 앱 계정 이음", () => {
  assert.equal(detailText(R("event.add", { event_id: "lent-2026", name: "홍길동",
    row: { who_type: "교구", group: "화평", sub: "20", position: "집사" }, linked: true }, "101")),
    "홍길동 · 화평 20목장 · 집사 · 회차 lent-2026 · 앱 계정 이음");
  assert.equal(detailText(R("event.add", { event_id: "lent-2026", name: "홍길동",
    row: { who_type: "교구", group: "소망", sub: "남성", position: "" }, linked: false })),
    "홍길동 · 소망 남성 · 회차 lent-2026");
  assert.equal(detailText(R("event.add", { event_id: "lent-2026", name: "홍길동",
    row: { who_type: "교회학교", group: "청년부", sub: "", position: "청년" }, linked: false })),
    "홍길동 · 청년부 · 청년 · 회차 lent-2026");
  assert.equal(detailText(R("event.add", { event_id: "lent-2026", name: "홍길동",
    row: { who_type: "교회학교", group: "중등부", sub: "2", position: "학생" }, linked: false })),
    "홍길동 · 중등부 2 · 학생 · 회차 lent-2026");
});

test("event.edit — 바꾼 칸만 · 메모는 글 없이 「메모 고침」(서버는 메모 글을 남기지 않고 note: true 만 · SEC-1)", () => {
  const t = detailText(R("event.edit", { event_id: "lent-2026", name: "홍길동",
    before: { sub: "20", position: "집사", note: true },
    after: { sub: "21", position: "안수집사", note: true } }, "101"));
  assert.equal(t, "홍길동 · 회차 lent-2026 · 세부 20 → 21 · 직분 집사 → 안수집사 · 메모 고침");
  assert.ok(!t.includes("true"), "메모 표시(참)는 글자로 새지 않는다");
  assert.equal(detailText(R("event.edit", { event_id: "lent-2026", name: "홍길동",
    before: { position: "" }, after: { position: "권사" } })), "홍길동 · 회차 lent-2026 · 직분 (없음) → 권사");
  assert.equal(detailText(R("event.edit", { event_id: "lent-2026", name: "홍길동",
    before: { note: true }, after: { note: true } })), "홍길동 · 회차 lent-2026 · 메모 고침");
  // 옛 기록(메모 글을 싣던 때 · 2026-09-30 전 개발 DB)도 글을 보이지 않는다
  const old = detailText(R("event.edit", { event_id: "lent-2026", name: "홍길동",
    before: { note: "원래: 화평 30 · 집사" }, after: { note: "원래: 화평 30 · 집사 / 담당자가 더함" } }));
  assert.equal(old, "홍길동 · 회차 lent-2026 · 메모 고침");
});

test("event.delete — 뺀 줄의 모양 · 출처 · 계정", () => {
  // 서버는 뺀 줄의 메모 글을 남기지 않는다 — 있었는지만(hasNote · SEC-1)
  const row = { who_type: "교구", group: "믿음", sub: "3", position: "성도", hasNote: true, source: "import", hasUser: false };
  assert.equal(detailText(R("event.delete", { event_id: "summer-2026", name: "홍길동", row }, "102")),
    "홍길동 · 믿음 3목장 · 성도 · 회차 summer-2026 · 📋 이관");
  assert.equal(detailText(R("event.delete", { event_id: "summer-2026", name: "홍길동", row: { ...row, hasUser: true } })),
    "홍길동 · 믿음 3목장 · 성도 · 회차 summer-2026 · 📋 이관 · 계정 이어짐");
});

test("event.upload — 건수만(이름 없음) · 서버가 남긴 납작한 칸 · 0 인 동명이인·목록 밖 직분·실패는 뺀다 · 채우기를 껐으면 「교인명부로 채움」도 뺀다", () => {
  assert.equal(detailText(R("event.upload", { rows: 20, fillOn: true, add: 8, same: 3, blank: 1, bad: 2, fill: 4,
    sameName: 0, oddPosition: 0, saved: 12, failed: 0 }, "lent-2026")),
    "올린 줄 20 · 넣음 12 · 이미 있음 3 · 빈칸 1 · 틀림 2 · 교인명부로 채움 4");
  assert.equal(detailText(R("event.upload", { rows: 13, fillOn: true, add: 12, same: 0, blank: 0, bad: 0, fill: 0,
    sameName: 1, oddPosition: 5, saved: 10, failed: 2 }, "lent-2026")),
    "올린 줄 13 · 넣음 10 · 이미 있음 0 · 빈칸 0 · 틀림 0 · 교인명부로 채움 0 · 동명이인 1 · 목록 밖 직분 5 · 실패 2");
  assert.equal(detailText(R("event.upload", { rows: 5, fillOn: false, add: 5, same: 0, blank: 0, bad: 0, fill: 0,
    sameName: 0, oddPosition: 0, saved: 5, failed: 0 }, "lent-2026")),
    "올린 줄 5 · 넣음 5 · 이미 있음 0 · 빈칸 0 · 틀림 0");
  // counts 로 싼 모양은 읽지 않는다 — 서버(Task 8)는 납작하게 남긴다(CONTRACT 5 「기록 모양」)
  assert.equal(detailText(R("event.upload", { saved: 1, failed: 0, counts: { same: 9 } })),
    "올린 줄 0 · 넣음 1 · 이미 있음 0 · 빈칸 0 · 틀림 0");
});

test("people.lookup · people.fill — 찾은 이름 · 결과 수 · 채운 분 이름(스무 분까지 적고 나머지는 수로)", () => {
  assert.equal(detailText(R("people.lookup", { q: "홍길동", count: 2 })), "‘홍길동’ · 2명");
  assert.equal(detailText(R("people.lookup", { q: "홍길동", count: 0 })), "‘홍길동’ · 0명");
  assert.equal(detailText(R("people.fill", { rows: 3, names: ["홍길동", "홍길순", "홍길남"] }, "lent-2026")),
    "채운 줄 3 · 홍길동, 홍길순, 홍길남");
  const many = Array.from({ length: 25 }, (_, i) => "홍길동" + i);
  const t = detailText(R("people.fill", { rows: 25, names: many }, "lent-2026"));
  assert.ok(t.endsWith("홍길동19 외 5명"), t);
  assert.ok(!t.includes("홍길동20"), t);
});

// SEC-2(2026-09-30 친구 결정) — 채우기를 켠 살펴보기는 명부에 물었으면 채운 것이 없어도 한 줄. 물은 이름을 먼저 적는다.
test("people.fill — 물은 이름 N(이름들) · 채운 줄 M(이름들) · 채운 것이 없어도 · 옛 모양(asked 없음)은 그대로", () => {
  assert.equal(detailText(R("people.fill", { rows: 0, names: [], asked: 2, askedNames: ["홍길동", "홍길순"] }, "lent-2026")),
    "물은 이름 2(홍길동, 홍길순) · 채운 줄 0");
  assert.equal(detailText(R("people.fill", { rows: 1, names: ["홍길동"], asked: 3, askedNames: ["홍길동", "홍길순", "홍길남"] })),
    "물은 이름 3(홍길동, 홍길순, 홍길남) · 채운 줄 1(홍길동)");
  const many = Array.from({ length: 25 }, (_, i) => "홍길동" + i);
  const t = detailText(R("people.fill", { rows: 0, names: [], asked: 25, askedNames: many }));
  assert.equal(t, `물은 이름 25(${many.slice(0, 20).join(", ")} 외 5명) · 채운 줄 0`);
  // 2026-09-30 전 기록(asked 칸 없음)은 지금 모양 그대로
  assert.equal(detailText(R("people.fill", { rows: 2, names: ["홍길동", "홍길순"] })), "채운 줄 2 · 홍길동, 홍길순");
});

test("people.lookup — 사역신청·담당자 화면(ministryPerson · from 「ministry」)은 「명부 찾기(사역신청·담당자)」 · 번호로 골랐으면 「번호로 고름」(검토 5)", () => {
  // 성경필사(evPeopleLookup·evPerson)는 from 이 없다 — 이름은 그대로
  assert.equal(labelOf(R("people.lookup", { q: "홍길동", count: 2 })), "명부 찾기(성경필사)");
  assert.equal(labelOf(R("people.lookup", { q: "홍길동", count: 3, from: "ministry" })), "명부 찾기(사역신청·담당자)");
  assert.equal(LOOKUP_MINISTRY, "명부 찾기(사역신청·담당자)");
  // 모르는 from · 다른 기록의 from 은 LABEL 그대로(detail 이 이름을 바꾸는 것은 people.lookup 뿐)
  assert.equal(labelOf(R("people.lookup", { q: "홍길동", count: 1, from: "constructor" })), "명부 찾기(성경필사)");
  assert.equal(labelOf(R("people.view", { name: "홍길동", from: "ministry" })), LABEL["people.view"]);
  // LABEL 에 없는 기록은 영문 코드 그대로(옛 화면과 같다) · detail 이 없어도 된다
  assert.equal(labelOf({ action: "something.else" }), "something.else");
  assert.equal(labelOf({ action: "people.lookup" }), "명부 찾기(성경필사)");
  // 줄 — 번호 자체는 서버가 싣지 않는다. 번호로 한 분을 가렸다는 사실만(byPhone:true)
  assert.equal(detailText(R("people.lookup", { q: "홍길동", count: 3, from: "ministry" })), "‘홍길동’ · 3명");
  assert.equal(detailText(R("people.lookup", { q: "홍길동", count: 1, from: "ministry", byPhone: true })), "‘홍길동’ · 1명 · 번호로 고름");
  assert.equal(detailText(R("people.lookup", { q: "홍길동", count: 1, byPhone: "true" })), "‘홍길동’ · 1명", "참(true)일 때만");
});

test("people.lookup — 서버 ministryLookupLog 가 남기는 모양 그대로를 기록 화면이 읽는다(칸 이름·값이 한 벌)", () => {
  // 가짜 명부 — 같은 소속(화평 20)에 홍길동 둘 · 번호로 한 분(검토 4 — full 만 번호로 고른다)
  const P = (person_id, phone_digits) => ({ person_id, name: "홍길동", name_key: "홍길동", kind2: "장년", mok1: "화평", mok3: "화평-20목장",
    school_dept: "", position: "집사", position_detail: "", phone_digits });
  const cands = [P(1, "01000000001"), P(2, "01000000002")];
  const a = ministryApplicant({ who: "화평 20목장", phone: "010-0000-0002" }, "홍길동");
  const byPhone = ministryLookupLog(cands, a, personOutFor(cands, a, true), "홍길동");
  const basic = ministryLookupLog(cands, a, personOutFor(cands, a, false), "홍길동");
  assert.equal(labelOf(R("people.lookup", byPhone)), LOOKUP_MINISTRY);
  assert.equal(detailText(R("people.lookup", byPhone)), "‘홍길동’ · 1명 · 번호로 고름");
  assert.equal(labelOf(R("people.lookup", basic)), LOOKUP_MINISTRY);
  assert.equal(detailText(R("people.lookup", basic)), "‘홍길동’ · 2명");
});

test("옛 기록은 그대로 — people.search · 모르는 기록은 빈 줄", () => {
  assert.equal(detailText(R("people.search", { q: "홍", filters: {}, total: 3 })), "‘홍’ · 3명");
  assert.equal(detailText(R("something.else", { a: 1 })), "");
});

test("ministry.tester — 더함/뺌 · 이름 · 소속", () => {
  assert.match(LABEL["ministry.tester"], /[가-힣]/);
  assert.equal(detailText(R("ministry.tester", { op: "add", name: "홍길동", who: "화평 20목장" })), "더함 · 홍길동 · 화평 20목장");
  assert.equal(detailText(R("ministry.tester", { op: "remove", name: "홍길동", who: "" })), "뺌 · 홍길동");
});

test("ministry.phoneclear — 「사역 번호 지움」 · 지운 수", () => {
  assert.match(LABEL["ministry.phoneclear"], /[가-힣]/);
  assert.equal(detailText(R("ministry.phoneclear", { count: 12 }, "2027")), "결정된 신청 12건의 번호");
});
