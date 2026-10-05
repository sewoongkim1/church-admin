// 📊 교육 통계(교육신청 4단계 C · 2026-10-06) — 서버 쪽 순수 규칙(edu-rules.ts checkStatsTerm·statsOut) + 가짜 db 로 eduStats(edu-db.ts) · preflight 가 돈다.
//   수는 v2 SQL edu_stats(p_term) 이 묶는다 — 여기서는 문(교육 총괄만)·학기 인자·칸 지도·합계만 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEdu } from "../supabase/functions/church-admin/edu-db.ts";
import { checkStatsTerm, statsOut, statsAvg, statsRate } from "../supabase/functions/church-admin/edu-rules.ts";

// SQL edu_stats 가 돌려주는 모양(jsonb) — 강좌 둘 · 소속 셋 · 학기 둘
const SQL = {
  term: "2027 상반기",
  courses: [
    { id: "c2", title: " 교사 대학 ", term: "2027 상반기", status: "running", applied: 0, confirmed: 3, waitlisted: 0, cancelled: 1, declined: 0,
      completed: 2, attend_n: 2, attend_sum: 175, attend_avg: 88 },
    { id: "c1", title: "제자훈련 1단계", term: "2027 상반기", status: "open", applied: 2, confirmed: 6, waitlisted: 1, cancelled: 1, declined: 1,
      completed: 1, attend_n: 4, attend_sum: 218, attend_avg: 55 },
  ],
  groups: [{ who_type: "교구", group_name: "화평", confirmed: 5, completed: 2 }, { who_type: "교회학교", group_name: "중등부", confirmed: 2, completed: 1 },
    { who_type: "새가족", group_name: "", confirmed: 2, completed: 0 }],
  terms: ["2027 상반기", "2026 하반기", "", "2027 상반기"],
};
const COURSE_KEYS = ["applied", "attendAvg", "attendN", "attendSum", "cancelled", "completeRate", "completed", "confirmed", "declined", "id", "status",
  "statusLabel", "term", "title", "waitlisted"];

test("checkStatsTerm — 없음·null·빈 글자 = 전체(null) · 글자는 다듬어서 · 글자가 아니거나 30자 넘으면 bad-term", () => {
  assert.deepEqual(checkStatsTerm(undefined), { ok: true, term: null });
  assert.deepEqual(checkStatsTerm(null), { ok: true, term: null });
  assert.deepEqual(checkStatsTerm(""), { ok: true, term: null });
  assert.deepEqual(checkStatsTerm("   "), { ok: true, term: null });
  assert.deepEqual(checkStatsTerm(" 2027  상반기 "), { ok: true, term: "2027 상반기" });
  assert.deepEqual(checkStatsTerm("가".repeat(30)), { ok: true, term: "가".repeat(30) });
  for (const bad of ["가".repeat(31), 2027, true, ["2027"], { t: 1 }]) assert.deepEqual(checkStatsTerm(bad), { ok: false, error: "bad-term" }, String(bad));
});

test("statsAvg · statsRate — 반올림(.5 는 올림 — SQL round 와 같다) · 나눌 것이 없으면 null", () => {
  assert.equal(statsAvg(218, 4), 55);
  assert.equal(statsAvg(175, 2), 88);
  assert.equal(statsAvg(0, 0), null);
  assert.equal(statsRate(1, 6), 17);
  assert.equal(statsRate(1, 8), 13, "12.5 → 13");
  assert.equal(statsRate(0, 3), 0);
  assert.equal(statsRate(2, 0), null);
});

test("statsOut — 칸 지도 · 강좌 차례는 SQL 그대로 · 합계는 강좌를 더해서(평균 출석률은 합·센 분으로 다시 나눔) · 학기 목록은 빈 것·겹친 것 빼고", () => {
  const o = statsOut(SQL);
  assert.deepEqual(Object.keys(o).sort(), ["courses", "groups", "term", "terms", "total"]);
  assert.equal(o.term, "2027 상반기");
  assert.deepEqual(o.terms, ["2027 상반기", "2026 하반기"]);
  assert.deepEqual(o.courses.map((c) => c.id), ["c2", "c1"]);
  for (const c of o.courses) assert.deepEqual(Object.keys(c).sort(), COURSE_KEYS);
  assert.equal(o.courses[0].title, "교사 대학", "제목은 다듬어서");
  assert.equal(o.courses[0].statusLabel, "진행 중");
  assert.deepEqual([o.courses[1].attendAvg, o.courses[1].completeRate], [55, 17]);
  assert.deepEqual([o.courses[0].attendAvg, o.courses[0].completeRate], [88, 67]);
  assert.deepEqual(o.total, { courses: 2, applied: 2, confirmed: 9, waitlisted: 1, cancelled: 2, declined: 1, completed: 3, attendN: 6, attendSum: 393,
    attendAvg: 66, completeRate: 33 }, "평균 출석률 = 393÷6 = 65.5 → 66(평균의 평균 (88+55)÷2 = 71.5 가 아니다)");
  assert.deepEqual(o.groups, [{ whoType: "교구", group: "화평", confirmed: 5, completed: 2 }, { whoType: "교회학교", group: "중등부", confirmed: 2, completed: 1 },
    { whoType: "새가족", group: "", confirmed: 2, completed: 0 }]);
});

test("statsOut — 빈·틀린 응답도 깨지지 않는다(숫자는 0 이상의 정수 · 없는 칸은 0)", () => {
  const e = statsOut(null);
  assert.deepEqual(e, { term: null, terms: [], courses: [], groups: [],
    total: { courses: 0, applied: 0, confirmed: 0, waitlisted: 0, cancelled: 0, declined: 0, completed: 0, attendN: 0, attendSum: 0, attendAvg: null, completeRate: null } });
  const o = statsOut({ courses: [{ id: "x", title: "t", status: "zzz", confirmed: -3, applied: "2", completed: 1.7, attend_n: null }] });
  assert.deepEqual([o.courses[0].confirmed, o.courses[0].applied, o.courses[0].completed, o.courses[0].attendN, o.courses[0].attendAvg],
    [0, 2, 1, 0, null]);
  assert.equal(o.courses[0].statusLabel, "zzz");
  assert.equal(o.courses[0].completeRate, null, "확정 0 이면 수료율 없음");
});

// ---------- 가짜 db 로 eduStats ----------
function setup(data = SQL) {
  const rpc = [], audits = [], q = [];
  const db = { rpc: async (fn, args) => { rpc.push([fn, args]); return { data, error: null }; },
    from: (t) => { q.push(t); throw new Error("표를 직접 읽었다: " + t); } };
  const edu = makeEdu(db, async (...a) => { audits.push(a); }, { peopleLookup: async () => ({}), personPick: async () => ({}), allRows: async () => [] });
  return { edu, rpc, audits, q };
}
const CHIEF = { member: { id: "55555555-5555-4555-8555-555555555555" }, roles: ["education"] };

test("eduStats — 교육 총괄·총괄 관리자만(교육 담당·강사·교인명부는 forbidden · SQL 을 부르지도 않는다)", async () => {
  for (const roles of [["educourse"], ["teacher"], ["directory"], ["ministry"], [], null]) {
    const s = setup();
    assert.deepEqual(await s.edu.eduStats({ roles }, {}), { ok: false, error: "forbidden" }, JSON.stringify(roles));
    assert.equal(s.rpc.length, 0);
  }
  for (const roles of [["education"], ["super"], ["educourse", "education"]]) {
    const s = setup();
    assert.equal((await s.edu.eduStats({ roles }, {})).ok, true, JSON.stringify(roles));
  }
});

test("eduStats — 학기 인자(전체는 null) · SQL edu_stats 한 번 · 표를 직접 읽지 않는다 · 기록 없음 · 칸 지도 그대로", async () => {
  const a = setup();
  const r = await a.edu.eduStats(CHIEF, {});
  assert.deepEqual(a.rpc, [["edu_stats", { p_term: null }]]);
  assert.deepEqual(a.q, [], "신청 줄을 받아 세지 않는다");
  assert.equal(a.audits.length, 0, "숫자만 — 기록 없음");
  assert.deepEqual(r, { ok: true, ...statsOut(SQL) });
  const b = setup();
  await b.edu.eduStats(CHIEF, { term: " 2027 상반기 " });
  assert.deepEqual(b.rpc, [["edu_stats", { p_term: "2027 상반기" }]]);
  const c = setup();
  await c.edu.eduStats(CHIEF, { term: "" });
  assert.deepEqual(c.rpc, [["edu_stats", { p_term: null }]]);
  const d = setup();
  assert.deepEqual(await d.edu.eduStats(CHIEF, { term: 7 }), { ok: false, error: "bad-term" });
  assert.equal(d.rpc.length, 0);
  // 이름·user_id 가 SQL 응답에 섞여 와도 칸 지도로만 내보낸다
  const e = setup({ ...SQL, courses: [{ ...SQL.courses[0], user_id: "u", name: "홍길동", staff_note: "메모" }], groups: [{ ...SQL.groups[0], name: "홍길동" }] });
  const s = JSON.stringify(await e.edu.eduStats(CHIEF, {}));
  for (const leak of ["user_id", "홍길동", "메모", "staff_note"]) assert.ok(!s.includes(leak), leak);
});
