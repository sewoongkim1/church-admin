// 🏠 심방 준비 한 장(시험판 · 2026-10-15) — 카드 재료 · AI 에 줄 사실 목록(이름 없음) · 답 검사(visit-card.ts · 순수)
//   이름은 모두 지어낸 것(시험-가 …).
import { test } from "node:test";
import assert from "node:assert/strict";
import { visitCard, visitFacts, visitSchema, visitPointsOut, VISIT_SYSTEM } from "../supabase/functions/church-admin/visit-card.ts";

const TODAY = "2026-10-15";
const PERSON = { person_id: 1, name: "시험-가", position: "권사", gender: "여", age: 55, mok1: "화평", mok3: "화평-20목장", kind2: "장년",
  registered_date: "2011-03-04", household_rel: "본인", phone1: "010-0000-0001", address: "어딘가 1" };
const FAMILY = [
  { person_id: 2, name: "시험-나", household_rel: "남편", position: "안수집사", age: 58 },
  { person_id: 3, name: "시험-다", household_rel: "딸", position: "", age: 24 },
];
const HISTORY = {
  ministry: [
    { kind: "history", year: 2025, committee: "찬양위원회", team: "시온찬양대" },
    { kind: "history", year: 2024, committee: "찬양위원회", team: "시온찬양대" },
    { kind: "history", year: 2024, committee: "예배위원회", team: "안내" },
    { kind: "history", year: 2023, committee: "찬양위원회", team: "시온찬양대" },
    { kind: "order", year: 2027, committee: "찬양위원회", team: "시온찬양대", status: "접수" },
  ],
  bible: [
    { title: "2026 썸머 써 바이블 옵/말 완서자", short_title: "", opens_on: "2026-05-01" },
    { title: "2025 사순절 요한복음 완서자", short_title: "", opens_on: "2025-03-05" },
  ],
  education: [{ term: "2025-1", title: "제자훈련", status: "confirmed", statusLabel: "확정", certNo: "2025-007", certRevoked: false }],
};

test("카드 — 머리 · 꼬리표 · 가족 · 섬김(해마다 · 같은 해 팀 묶음) · 사역신청 따로 · 성경필사 · 교육", () => {
  const c = visitCard(PERSON, FAMILY, HISTORY, TODAY);
  assert.equal(c.head.name, "시험-가");
  assert.equal(c.head.regYear, 2011);
  assert.equal(c.head.regYears, 16);
  assert.deepEqual(c.tags, ["2026년 사역 쉼", "2026년 성경필사", "교육 수료"]);
  assert.equal(c.family.length, 2);
  assert.deepEqual(c.service.years[0], { year: 2025, teams: ["시온찬양대"] });
  assert.deepEqual(c.service.years[1], { year: 2024, teams: ["시온찬양대", "안내"] });
  assert.equal(c.service.total, 3);
  assert.equal(c.service.first, 2023);
  assert.deepEqual(c.orders, [{ year: 2027, team: "시온찬양대", status: "접수" }]);
  assert.equal(c.bible[0].year, 2026);
  assert.equal(c.education[0].status, "수료");
  // 연락처 · 주소는 카드에 없다
  assert.ok(!JSON.stringify(c).includes("010-0000-0001"));
  assert.ok(!JSON.stringify(c).includes("어딘가"));
});

test("사역한 적 없음 · 올해 섬기는 중", () => {
  assert.deepEqual(visitCard(PERSON, [], { ministry: [] }, TODAY).tags, ["사역한 적 없음"]);
  const now = visitCard(PERSON, [], { ministry: [{ kind: "history", year: 2026, team: "안내" }] }, TODAY);
  assert.equal(now.tags[0], "2026년 섬기는 중");
  assert.equal(visitCard(PERSON, [], null, TODAY).service.total, 0);   // 탭 자료가 없어도(읽기 실패) 카드는 선다
});

test("AI 에 줄 사실 — 이름이 없다(본인 · 가족) · 관계 · 직분 · 나이 · 해 · 팀 · 회차 · 강좌는 있다", () => {
  const facts = visitFacts(visitCard(PERSON, FAMILY, HISTORY, TODAY), TODAY).join("\n");
  for (const n of ["시험-가", "시험-나", "시험-다", "010-0000-0001", "어딘가", "화평-20"]) assert.ok(!facts.includes(n), "새면 안 됨: " + n);
  assert.ok(facts.includes("이분: 직분 권사"));
  assert.ok(facts.includes("남편 안수집사 58세"));
  assert.ok(facts.includes("모두 3해 · 2023~2025 · 2026년 쉼"));
  assert.ok(facts.includes("2024 시온찬양대·안내"));
  assert.ok(facts.includes("2026 2026 썸머 써 바이블"));
  assert.ok(facts.includes("2025-1 제자훈련(수료)"));
  assert.ok(facts.includes("사역신청: 2027 시온찬양대(접수)"));
});

test("지시문 · 스키마 · 답 검사", () => {
  assert.ok(VISIT_SYSTEM.includes("짐작하지 않는다"));
  assert.ok(VISIT_SYSTEM.includes("평가하거나 판단하는 말"));
  const sc = visitSchema();
  assert.equal(sc.additionalProperties, false);
  assert.ok(!JSON.stringify(sc).includes("anyOf"));
  assert.deepEqual(visitPointsOut({ points: [" 하나 ", "", "둘", "셋", "넷"] }), ["하나", "둘", "셋"]);
  assert.deepEqual(visitPointsOut({}), []);
  assert.equal(visitPointsOut({ points: ["가".repeat(300)] })[0].length, 200);
});

// 가족(2026-10-15 친구 「심방정보에 가족에 대한 부분도」) — 한 분마다 섬김 · 성경필사 · 교육 · 성경암송 · AI 사실에도 이름 없이
test("가족 줄 — 섬김 · 성경필사 · 성경암송 · 읽기 실패는 null · AI 사실에 이름 없음", async () => {
  const { famLine, famFact } = await import("../supabase/functions/church-admin/visit-card.ts");
  const { famBits } = await import("../js/menus/people/visit-card.js");
  const memo = { accounts: [{ name: "시험-나", who: "화평 20목장", how: "이름 · 소속이 같음" }], done: 10, doneWeekly: 10, donePsalm: 0, doneNavi: 0,
    started: 12, days: 40, days30: 4, firstDay: "2025-01-01", lastDay: "2026-10-14", learn: 50, challenge: 20, recent: [{ ref: "시 23:1", day: "2026-10-12" }] };
  const fam = [
    { ...FAMILY[0], history: { ministry: [{ kind: "history", year: 2026, team: "시온찬양대" }, { kind: "history", year: 2020, team: "안내" }],
      bible: [{ title: "2025 사순절 요한복음 완서자", short_title: "", opens_on: "2025-03-05" }], education: [] }, memo },
    { ...FAMILY[1], history: null, memo: null },
  ];
  const c = visitCard(PERSON, fam, HISTORY, TODAY, memo);
  const f0 = c.family[0];
  assert.equal(f0.id, 2);
  assert.deepEqual(f0.service, { total: 2, last: 2026, thisYear: true, teams: ["시온찬양대"] });
  assert.deepEqual(f0.bible, { count: 1, lastYear: 2025, lastTitle: "2025 사순절 요한복음 완서자" });
  assert.equal(f0.eduDone, 0);
  assert.equal(f0.memo.done, 10);
  assert.equal(c.family[1].service, null);
  assert.ok(c.tags.includes("성경암송 10구절"));
  assert.deepEqual(famBits(f0), ["🤝 2해 · 올해 시온찬양대", "✍️ 성경필사 1번 · 2025", "📖 10구절 · 최근 30일 4일"]);
  assert.deepEqual(famBits(c.family[1]), ["기록을 불러오지 못했어요"]);
  assert.equal(famFact(f0, 2026), "남편 안수집사 58세 — 사역 2해 · 2026년 시온찬양대 · 성경필사 1번(최근 2025 사순절 요한복음 완서자) · 성경암송 10구절 · 최근 30일 4일");
  const facts = visitFacts(c, TODAY).join("\n");
  for (const n of ["시험-가", "시험-나", "시험-다", "화평-20", "화평 20목장"]) assert.ok(!facts.includes(n), "새면 안 됨: " + n);
  assert.ok(facts.includes("가족(같은 가구) 2명:"));
  assert.ok(facts.includes("- 딸 24세"));
  assert.ok(facts.includes("성경암송 앱: 다 마친 말씀 10구절 · 활동한 날 모두 40일(최근 30일 4일) · 마지막 2026-10-14 · 최근 외운 말씀 시 23:1"));
  // 성경암송 계정을 못 찾은 분 · 읽기 실패
  // 계정을 못 찾은 것은 AI 에 안 보낸다(「앱을 안 쓴다」가 아니다) — 본인 · 가족 모두
  const none = { ...memo, accounts: [] };
  const f2 = visitFacts(visitCard(PERSON, [{ ...FAMILY[0], history: null, memo: none }], HISTORY, TODAY, none), TODAY).join("\n");
  assert.ok(!f2.includes("성경암송"), f2);
  assert.equal(visitCard(PERSON, [], HISTORY, TODAY).memo, null);
});

test("심방 카드 화면 — 가족 이름 단추 · 성경암송 칸 · 불러오지 못함", async () => {
  const { visitHtml } = await import("../js/menus/people/visit-card.js");
  const memo = { accounts: [{ how: "본인 확인" }], done: 3, doneWeekly: 3, donePsalm: 0, doneNavi: 0, started: 4, days: 9, days30: 2, lastDay: "2026-10-14",
    recent: [{ ref: "요 3:16", day: "2026-10-01" }] };
  const html = visitHtml(visitCard(PERSON, FAMILY, HISTORY, TODAY, memo), true, true);
  assert.ok(html.includes('data-vc-fam="2"') && html.includes('data-vc-fam="3"'));
  assert.ok(html.includes("📖 성경암송") && html.includes("요 3:16") && html.includes("본인 확인"));
  assert.ok(!html.includes("data-v="));
  assert.ok(visitHtml(visitCard(PERSON, FAMILY, HISTORY, TODAY, null), true, false).includes("성경암송 기록을 불러오지 못했어요"));
  assert.ok(!html.includes("undefined") && !html.includes("null"));
});
