// 사역 이력 — 표 쪽(history-db.ts)의 순수한 부분: 줄 다듬기·검사 · 응답 칸 지도(교인ID 가리기) · 쓰지 않고 끝나는 입력
//   + 검토 반영(2026-10-01 과제 4): 쓴 뒤 바로 기록(쓰기·기록 순서) · 갱신이 줄을 못 맞혔을 때(not-found) 기록 없음.
//   db 를 쓰는 부분은 실제 DB 없이는 전부 보기 어렵다 — 쪽(table)·부른 메서드 이름만 보고 답을 주는 아주 작은 가짜 쿼리빌더로
//   딱 이 두 자리(쓴 뒤 기록 · 갱신 0행)만 확인한다. 더 큰 흐름(올리기 한 바퀴·고르기·오타 후보)은 개발 서버 시험(과제 7)에서.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tidyHistoryRow, rowOut, makeHistory, HISTORY_FIELD_MAX, HISTORY_UNMATCHED_YET, historyFilter, rematchHistoryRows, erasedKey }
  from "../supabase/functions/church-admin/history-db.ts";
import { parseTeamText, missingRowFromRequest, applyMissingRequest, undoMissingRequest, requestKey }
  from "../supabase/functions/church-admin/history-db.ts";
// 2026-10-02 — 빠진 사역을 고쳐서 반영(parseRequestLine) · 목록의 줄 미리 채우기(requestLineOut)
import { parseRequestLine, requestLineOut } from "../supabase/functions/church-admin/history-db.ts";
// 2026-10-02 — 빠진 사역 「부서」「팀」 두 칸(committee_text · SQL 009) · 신청의 부서·팀 미리 채움(requestDraft)
import { requestDraft } from "../supabase/functions/church-admin/history-db.ts";
import { srcKey } from "../supabase/functions/church-admin/history-match.ts";

// 아주 작은 가짜 쿼리빌더 — supabase-js 체인(.select().eq()... await)을 흉내만 낸다.
// resolver(table, 부른 메서드 이름 배열, qb) 가 {data,error} 를 돌려주거나 던진다(DB 오류를 흉내).
//   qb.log = [[메서드, 인자 배열], …] — 쪽 넘기기(range 의 시작)·잠금(eq updated_at)을 보려는 시험만 쓴다.
class FakeQB {
  constructor(table, resolver) { this.table = table; this.resolver = resolver; this.calls = []; this.log = []; }
  _push(name, args = []) { this.calls.push(name); this.log.push([name, args]); return this; }
  select(...a) { return this._push("select", a); }
  insert(...a) { return this._push("insert", a); }
  update(...a) { return this._push("update", a); }
  eq(...a) { return this._push("eq", a); }
  in(...a) { return this._push("in", a); }
  is(...a) { return this._push("is", a); }
  not(...a) { return this._push("not", a); }
  order(...a) { return this._push("order", a); }
  limit(...a) { return this._push("limit", a); }
  range(...a) { return this._push("range", a); }
  maybeSingle() { return this._push("maybeSingle"); }
  single() { return this._push("single"); }
  then(onRes, onRej) { return Promise.resolve().then(() => this.resolver(this.table, this.calls, this)).then(onRes, onRej); }
}
const fakeDb = (resolver, rpc = async () => { throw new Error("이 시험은 rpc 를 쓰지 않는다"); }) =>
  ({ from: (t) => new FakeQB(t, resolver), rpc });
// all() 의 쪽 넘기기 — 첫 쪽(range 시작 0)에만 자료, 다음 쪽은 빈 배열(끝)
const page0 = (qb, rows) => ({ data: qb.log.find(([n]) => n === "range")[1][0] === 0 ? rows : [], error: null });
// 가짜 명부 한 분(교구 기쁨 19목장 집사) · HISTORY_PEOPLE_COLS 모양
const PERSON = { person_id: 11, name: "가나다", gender: "여", kind2: "장년", mok1: "기쁨", mok3: "기쁨-19목장", school_dept: "",
  position: "집사", position_detail: "", birth: "", birth_date: null, registered: "", registered_date: null, household_id: null };

test("tidyHistoryRow — 해·이름 검사 · 칸 다듬기(NFC·빈칸 접기)", () => {
  assert.equal(tidyHistoryRow({ year: 1900, name: "가" }).error, "bad-year");
  assert.equal(tidyHistoryRow({ year: "2024", name: "  " }).error, "no-name");
  const t = tidyHistoryRow({ year: "2024", name: "가나다".normalize("NFD"), team: "  가브리엘   찬양대 ", mok: "기쁨-19" });
  assert.equal(t.error, "");
  assert.deepEqual([t.row.year, t.row.name, t.row.team, t.row.mok, t.row.position], [2024, "가나다", "가브리엘 찬양대", "기쁨-19", ""]);
  assert.equal(tidyHistoryRow({ year: 2024, name: "가", team: "x".repeat(HISTORY_FIELD_MAX + 1) }).error, "history-too-long");
  assert.equal(tidyHistoryRow({ year: 2024, name: "가", src_note: "x".repeat(501) }).error, "note-too-long");
});

test("rowOut — 사역신청 역할에게는 교인ID 가 없다 · 교인명부·총괄에게만", () => {
  const r = { id: 3, year: 2024, committee: "찬양부", team: "가", role_title: "", name: "가나다", position: "집사", mok: "기쁨-19",
    renewal: "유지", src_note: "", person_id: 12345, link_how: "auto", match_basis: "같은 교구(목장 다름)", match_reason: "",
    source: "excel", updated_at: "t" };
  const basic = rowOut(r, false), full = rowOut(r, true);
  assert.equal("person_id" in basic, false);
  assert.equal(JSON.stringify(basic).includes("12345"), false);
  assert.equal(full.person_id, 12345);
  assert.deepEqual([basic.linked, basic.weak], [true, true]);
});

test("rowOut — in_directory(지금 명부에 있는지) · person_id 없으면 늘 null · basic 엔 그래도 person_id 없음", () => {
  const r = { id: 1, year: 2024, committee: "", team: "", role_title: "", name: "가", position: "", mok: "", renewal: "",
    src_note: "", person_id: 5, link_how: "auto", match_basis: "", match_reason: "", source: "excel", updated_at: "t" };
  assert.equal(rowOut(r, false, true).in_directory, true);
  assert.equal(rowOut(r, false, false).in_directory, false);
  assert.equal(rowOut(r, false).in_directory, null);                         // 안 넘기면(알 수 없음) null
  assert.equal(rowOut({ ...r, person_id: null }, false, true).in_directory, null); // 교적 자체가 없으면 늘 null
  assert.equal("person_id" in rowOut(r, false, true), false);
  assert.equal(rowOut(r, true, true).person_id, 5);
});

test("쓰지 않고 끝나는 입력 — 빈 올리기 · 확인 없는 다시 맞추기 · 없는 줄", async () => {
  const touched = [];
  const db = { from: (t) => { touched.push(t); throw new Error("표를 건드리면 안 된다: " + t); }, rpc: () => { throw new Error("rpc"); } };
  const audits = [];
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  assert.equal((await H.upload(ctx, { rows: [] }, true)).saved, 0);
  assert.equal((await H.upload(ctx, { rows: [] }, false)).ok, true);
  assert.equal((await H.rematch(ctx, {})).error, "needs-confirm");
  assert.equal((await H.rowSave(ctx, { id: 0 })).error, "not-found");
  assert.equal((await H.rowDelete(ctx, { id: 0 })).error, "not-found");
  assert.equal((await H.rowAdd(ctx, { row: {} })).error, "bad-year");
  assert.equal((await H.upload(ctx, { rows: new Array(3001).fill({}) }, false)).error, "history-too-many");
  assert.deepEqual([touched, audits], [[], []]);
});

test("올리기(저장) — 쓴 뒤 바로 기록(history.upload) · 뒤이은 다시 맞추기가 실패해도 기록은 남고 rematched:false", async () => {
  const audits = [];
  const db = fakeDb((table, calls) => {
    if (table === "church_people") throw new Error("시험 — 명부 읽기 실패(다시 맞추기 첫 걸음)");
    if (table === "ministry_history_imports") {
      if (calls.includes("insert")) return { data: { id: 1 }, error: null };
      if (calls.includes("update")) return { error: null };
    }
    if (table === "ministry_history") {
      if (calls.includes("insert")) return { error: null };          // 줄 넣기
      if (calls.includes("range")) return { data: [], error: null }; // judgeUpload 의 같은 줄 찾기(빈 표)
    }
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  const res = await H.upload(ctx, { rows: [{ year: 2024, name: "가나다", team: "찬양대" }], file_name: "x.xlsx" }, true);
  assert.equal(res.ok, true);
  assert.equal(res.saved, 1);
  assert.equal(res.rematched, false);
  assert.equal("linked" in res, false);                               // 실패했으니 붙음/안 붙음 수는 안 싣는다
  assert.equal(audits.length, 1);
  assert.equal(audits[0][1], "history.upload");                       // 다시 맞추기 전에 이미 기록됨
});

test("잇기 — 그사이 빠진 줄(갱신 0행)은 not-found · 기록을 남기지 않는다", async () => {
  const audits = [];
  const db = fakeDb((table, calls) => {
    if (table === "ministry_history") {
      if (calls.includes("maybeSingle")) return { data: { id: 7, year: 2024, person_id: null, deleted_at: null }, error: null };
      if (calls.includes("update")) return { data: [], error: null }; // .select("id") 가 빈 배열 — 갱신이 줄을 못 찾음
    }
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  const res = await H.link(ctx, { id: 7, op: "none" });
  assert.equal(res.ok, false);
  assert.equal(res.error, "not-found");
  assert.equal(audits.length, 0);
});

// ── 2026-10-01 최종 검토 반영 ──────────────────────────────────────────

// 살펴보기도 교인명부에 물은 것이다(생년·등록연도·성별의 답이 된다) — 명부를 실제로 읽었을 때만 people.lookup 한 줄
test("살펴보기 — 새 줄이 있고 명부가 있으면 people.lookup(from:history-check · 물은 이름 · 이어진 수) 한 줄 · 쓰지는 않는다", async () => {
  const audits = [];
  const db = fakeDb((table, calls, qb) => {
    if (calls.includes("insert") || calls.includes("update")) throw new Error("살펴보기가 썼다: " + table);
    if (table === "church_people" && !calls.includes("range")) return { count: 1, error: null };   // hasDirectory
    if (table === "church_people") return page0(qb, [PERSON]);                                     // loadPeople
    if (table === "ministry_history") return page0(qb, []);                                        // judgeUpload · loadHistory(빈 표)
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  const rows = [
    { year: 2024, name: "가나다", team: "가 찬양대", mok: "기쁨-19", position: "집사" },
    { year: 2024, name: "가 나다", team: "나 찬양대", mok: "기쁨-19", position: "집사" },   // 같은 이름 열쇠 — 물은 이름은 하나로
    { year: 2024, name: "라마바", team: "가 찬양대", mok: "기쁨-19", position: "집사" },
    { year: 2024, name: "", team: "가 찬양대" },                                              // 틀린 줄 — 묻지 않는다
  ];
  const res = await H.upload(ctx, { rows, file_name: "x.xlsx" }, false);
  assert.equal(res.ok, true);
  assert.deepEqual([res.counts.add, res.counts.bad, res.preview.linked, res.preview.unlinked], [3, 1, 2, 1]);
  assert.equal(audits.length, 1);
  const [, action, target, detail] = audits[0];
  assert.deepEqual([action, target], ["people.lookup", ""]);
  assert.deepEqual(detail, { from: "history-check", asked: 2, askedNames: ["가나다", "라마바"], count: 2 });
});

// 2026-10-01 최종 검토 — 50개 상한을 없앴다(물은 이름 전부를 싣는다 · 화면(audit.js someNames)이 스무 분까지만 적어 보인다).
// 그래도 한 번에 받는 줄은 HISTORY_MAX_UPLOAD 로 묶이니 askedNames 도 자연히 그 안에 든다.
test("살펴보기 — 물은 이름은 상한 없이 전부 싣는다(asked 와 askedNames.length 가 같다)", async () => {
  const audits = [];
  const db = fakeDb((table, calls, qb) => {
    if (table === "church_people" && !calls.includes("range")) return { count: 1, error: null };
    if (table === "church_people") return page0(qb, [PERSON]);
    if (table === "ministry_history") return page0(qb, []);
    throw new Error("이 시험이 다루지 않는 호출: " + table);
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const rows = Array.from({ length: 60 }, (_, i) => ({ year: 2024, name: "가나다" + String.fromCharCode(0xAC00 + i), team: "가" }));
  await H.upload({ member: null, roles: ["ministry"] }, { rows }, false);
  assert.equal(audits[0][3].asked, 60);
  assert.equal(audits[0][3].askedNames.length, 60);
  assert.deepEqual(audits[0][3].askedNames, rows.map((r) => r.name));
});

test("살펴보기 — 빈 올리기·명부 없음은 명부를 읽지 않으니 기록도 없다(noDirectory)", async () => {
  const audits = [];
  const db = fakeDb((table, calls, qb) => {
    if (table === "church_people" && !calls.includes("range")) return { count: 0, error: null };   // 명부 없음
    if (table === "church_people") throw new Error("명부 없음인데 명부를 읽었다");
    if (table === "ministry_history") return page0(qb, []);
    throw new Error("이 시험이 다루지 않는 호출: " + table);
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  assert.equal((await H.upload(ctx, { rows: [] }, false)).ok, true);
  const r = await H.upload(ctx, { rows: [{ year: 2024, name: "가나다", team: "가" }] }, false);
  assert.equal(r.preview.noDirectory, true);
  assert.deepEqual(audits, []);
});

test("올리기(저장) — 새 줄에 자리 표시 사유 · 기록은 넣은 바로 뒤(올린 기록 표 고치기가 실패해도) · 명부 없음이면 rematched:false", async () => {
  const audits = [], order = [];
  let inserted = null;
  const db = fakeDb((table, calls, qb) => {
    if (table === "ministry_history_imports" && calls.includes("insert")) return { data: { id: 1 }, error: null };
    if (table === "ministry_history_imports" && calls.includes("update")) { order.push("imports"); return { error: { message: "시험 — 갱신 실패" } }; }
    if (table === "ministry_history" && calls.includes("insert")) { inserted = qb.log.find(([n]) => n === "insert")[1][0]; return { error: null }; }
    if (table === "ministry_history") return page0(qb, []);
    if (table === "church_people") return { count: 0, error: null };                               // 명부 없음
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async (...a) => { order.push("audit"); audits.push(a); } });
  const err = console.error; console.error = () => {};
  let res;
  try {
    res = await H.upload({ member: { id: "m" }, roles: ["ministry"] }, { rows: [{ year: 2024, name: "가나다", team: "가" }] }, true);
  } finally { console.error = err; }
  assert.deepEqual([res.ok, res.saved, res.rematched], [true, 1, false]);
  assert.equal("linked" in res, false);
  assert.equal(inserted[0].match_reason, HISTORY_UNMATCHED_YET);
  assert.deepEqual(order, ["audit", "imports"]);                   // 기록이 먼저 · 갱신 실패가 기록을 막지 않는다
  assert.equal(audits[0][1], "history.upload");
});

test("올리기(저장) — 한 줄도 못 넣었으면(saved 0) 다시 맞추지 않고 rematched:false · 기록은 남는다", async () => {
  const audits = [];
  const db = fakeDb((table, calls, qb) => {
    if (table === "ministry_history_imports" && calls.includes("insert")) return { data: { id: 1 }, error: null };
    if (table === "ministry_history_imports" && calls.includes("update")) return { error: null };
    if (table === "ministry_history" && calls.includes("insert")) return { error: { code: "23502", message: "시험 — 넣기 실패" } };
    if (table === "ministry_history") return page0(qb, []);
    throw new Error("이 시험이 다루지 않는 호출(다시 맞추기를 돌렸다?): " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const err = console.error; console.error = () => {};
  let res;
  try {
    res = await H.upload({ member: { id: "m" }, roles: ["ministry"] }, { rows: [{ year: 2024, name: "가나다", team: "가" }] }, true);
  } finally { console.error = err; }
  assert.deepEqual([res.saved, res.failed, res.rematched], [0, 1, false]);
  assert.deepEqual(audits.map((a) => [a[1], a[3].saved, a[3].failed]), [["history.upload", 0, 1]]);
});

test("rematchHistoryRows — 패치에 읽었던 맞춤 상태(old_person_id·old_basis·old_reason)를 싣는다 · 명부 차례로 읽는다", async () => {
  const sent = [];
  const row = { id: 5, year: 2024, committee: "", team: "가", name: "가나다", position: "집사", mok: "기쁨-19", renewal: "",
    link_how: "auto", person_id: null, match_basis: "", match_reason: HISTORY_UNMATCHED_YET, updated_at: "T" };
  const db = fakeDb((table, calls, qb) => {
    if (table === "church_people" && !calls.includes("range")) return { count: 1, error: null };
    if (table === "church_people") { assert.ok(calls.includes("order")); return page0(qb, [PERSON]); }
    if (table === "ministry_history") return page0(qb, [row]);
    throw new Error("이 시험이 다루지 않는 호출: " + table);
  }, async (fn, args) => { sent.push([fn, args]); return { data: 1, error: null }; });
  const m = await rematchHistoryRows(db, null);
  assert.deepEqual([m.changed, m.linked, m.total], [1, 1, 1]);
  assert.equal(sent[0][0], "ministry_history_apply");
  assert.deepEqual(sent[0][1].p, [{ id: 5, expect: "T", old_person_id: null, old_basis: "", old_reason: HISTORY_UNMATCHED_YET,
    person_id: 11, match_basis: "같은 소속", match_reason: "" }]);
});

test("잇기 — expect(줄의 updated_at)가 다르면 conflict · 쓰지도 기록하지도 않는다 · 같아도 그사이 바뀌어 0행이면 conflict", async () => {
  const audits = [];
  let updates = 0;
  const db = fakeDb((table, calls, qb) => {
    if (table === "ministry_history" && calls.includes("maybeSingle"))
      return { data: { id: 7, year: 2024, person_id: null, deleted_at: null, updated_at: "T1" }, error: null };
    if (table === "ministry_history" && calls.includes("update")) {
      updates++;
      assert.ok(qb.log.some(([n, a]) => n === "eq" && a[0] === "updated_at" && a[1] === "T1"), "갱신에 updated_at 잠금이 없다");
      return { data: [], error: null };                              // 그사이 누가 바꿨다
    }
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  assert.equal((await H.link(ctx, { id: 7, op: "none", expect: "T0" })).error, "conflict");
  assert.equal(updates, 0);
  assert.equal((await H.link(ctx, { id: 7, op: "none", expect: "T1" })).error, "conflict");
  assert.equal(updates, 1);
  assert.equal(audits.length, 0);
});

test("후보 — 지금 이어진 분이 이름 열쇠 밖(오타 규칙 등)이라 끝에 더했으면 기록에 extra:1", async () => {
  const audits = [];
  const row = { id: 9, year: 2024, committee: "", team: "가", role_title: "", name: "가나닥", position: "집사", mok: "기쁨-19",
    renewal: "", src_note: "", person_id: 11, link_how: "auto", match_basis: "이름 한 글자 다름(오타로 봄)", match_reason: "",
    source: "excel", source_file: "", linked_at: null, updated_at: "T", deleted_at: null };
  const db = fakeDb((table, calls, qb) => {
    if (table === "ministry_history" && calls.includes("maybeSingle")) return { data: row, error: null };
    if (table === "ministry_history") return page0(qb, []);          // 다른 해 같은 팀 횟수
    if (table === "church_people" && calls.includes("maybeSingle")) return { data: PERSON, error: null };   // 지금 이어진 분
    if (table === "church_people" && calls.includes("range")) return page0(qb, []);                         // 이름 열쇠 — 없음
    if (table === "church_people" && calls.includes("in")) return { data: [{ person_id: 11 }], error: null }; // 명부에 있는지
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const res = await H.candidates({ member: { id: "m" }, roles: ["ministry"] }, { id: 9 });
  assert.equal(res.candidates.length, 1);
  assert.equal(res.candidates[0].current, true);
  assert.deepEqual(audits[0].slice(1), ["people.lookup", "", { q: "가나닥", count: 1, from: "history", extra: 1 }]);
});

// 더하기(＋ 한 줄 더하기)도 지워 달라는 요청으로 지운 줄을 되살리면 안 된다(CLAUDE.md 비상 절차 ②-1) — 열쇠가 해시라
// 보통의 unique 충돌(23505)로는 안 걸린다. 넣기 전에 erasedKey 로 먼저 물어본다.
test("더하기 — 지워 달라는 요청으로 이름까지 지운 줄과 같은 열쇠면 history-deleted(넣지도 기록하지도 않는다)", async () => {
  const db = fakeDb((table, calls) => {
    if (table === "ministry_history" && calls.includes("maybeSingle")) return { data: { id: 1 }, error: null };   // erasedKey 로 찾음
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async () => { throw new Error("넣지 않았는데 기록했다"); } });
  const res = await H.rowAdd({ member: { id: "m" }, roles: ["ministry"] },
    { row: { year: 2024, committee: "찬양부", team: "가", name: "가나다", mok: "기쁨-19", position: "집사" } });
  assert.equal(res.ok, false);
  assert.equal(res.error, "history-deleted");
});

// 고치기 창에서 후보에 영향 줄 칸(이름·직분·목장·팀·해·신규유지 — HISTORY_REMATCH_KEYS)을 고쳐 auto 줄이 실제로 다시
// 맞춰지면, 명부를 실제로 물은 것이다 — 이름 떠보기 흔적을 people.lookup(from:"history-edit")으로 남긴다(2026-10-01 최종 검토).
test("고치기 — 다시 맞추기 칸을 고쳐 실제로 다시 맞춰지면 people.lookup(from:history-edit · q·count) 도 기록한다", async () => {
  const audits = [];
  let hReads = 0;
  const cur = { id: 5, year: 2024, committee: "", team: "가", role_title: "", name: "가나다", position: "집사", mok: "기쁨-19",
    renewal: "", src_note: "", person_id: null, link_how: "auto", match_basis: "", match_reason: HISTORY_UNMATCHED_YET,
    source: "excel", source_file: "", linked_at: null, updated_at: "T1", deleted_at: null };
  const matchRow = { id: 5, year: 2024, committee: "", team: "가", name: "가나다", position: "집사", mok: "기쁨-19",
    renewal: "신규", link_how: "auto", person_id: null, match_basis: "", match_reason: HISTORY_UNMATCHED_YET, updated_at: "T1" };
  const rpcCalls = [];
  const db = fakeDb((table, calls, qb) => {
    if (table === "ministry_history" && calls.includes("maybeSingle")) {
      hReads++;
      if (hReads === 1) return { data: cur, error: null };   // rowSave 가 읽은 지금 줄
      return { data: { ...cur, renewal: "신규", person_id: PERSON.person_id, match_basis: "같은 소속", match_reason: "", updated_at: "T2" },
        error: null };                                        // 다시 맞춘 뒤(fresh)
    }
    if (table === "ministry_history" && calls.includes("update")) return { data: [{ id: 5 }], error: null };
    if (table === "ministry_history") return page0(qb, [matchRow]);                               // loadHistory
    if (table === "church_people" && calls.includes("in")) return { data: [{ person_id: PERSON.person_id }], error: null }; // directorySet
    if (table === "church_people" && calls.includes("range")) return page0(qb, [PERSON]);          // loadPeople
    if (table === "church_people") return { count: 1, error: null };                               // hasDirectory
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  }, async (name, args) => { rpcCalls.push([name, args]); return { data: args.p.length, error: null }; });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  const res = await H.rowSave(ctx, { id: 5, expect: "T1", patch: { renewal: "신규" } });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.rematched, true);
  assert.equal(rpcCalls.length, 1, "다시 맞추기가 실제로 써야 한다");
  const edits = audits.filter((a) => a[1] === "history.edit");
  const lookups = audits.filter((a) => a[1] === "people.lookup");
  assert.equal(edits.length, 1);
  assert.equal(lookups.length, 1, "history-edit 기록이 하나여야 한다: " + JSON.stringify(audits));
  assert.deepEqual(lookups[0].slice(1), ["people.lookup", "", { from: "history-edit", q: "가나다", count: 1 }]);
});

// 다시 맞추기가 명부가 없어 못 돈 경우(noDirectory → rematched:false)는 실제로 묻지 못한 것이니 history-edit 기록도 없다
test("고치기 — 명부가 없어 다시 맞추기를 못 돌리면(rematched:false) history-edit 기록도 남기지 않는다", async () => {
  const audits = [];
  const cur = { id: 5, year: 2024, committee: "", team: "가", role_title: "", name: "가나다", position: "집사", mok: "기쁨-19",
    renewal: "", src_note: "", person_id: null, link_how: "auto", match_basis: "", match_reason: HISTORY_UNMATCHED_YET,
    source: "excel", source_file: "", linked_at: null, updated_at: "T1", deleted_at: null };
  let hReads = 0;
  const db = fakeDb((table, calls) => {
    if (table === "ministry_history" && calls.includes("maybeSingle")) {
      hReads++;
      return { data: hReads === 1 ? cur : { ...cur, renewal: "신규", updated_at: "T2" }, error: null };
    }
    if (table === "ministry_history" && calls.includes("update")) return { data: [{ id: 5 }], error: null };
    if (table === "church_people") return { count: 0, error: null };   // 명부 없음
    throw new Error("이 시험이 다루지 않는 호출: " + table + " " + JSON.stringify(calls));
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const res = await H.rowSave({ member: { id: "m" }, roles: ["ministry"] }, { id: 5, expect: "T1", patch: { renewal: "신규" } });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.rematched, false);
  assert.equal(audits.filter((a) => a[1] === "people.lookup").length, 0);
});

// 지워 달라는 요청으로 이름까지 지운 줄(CLAUDE.md 비상 절차 ②-1) — SQL 이 src_key 를 'erased:'||sha256 으로 바꾼다.
// 같은 원본을 다시 올려도 되살아나지 않아야 한다(「빼 둔 줄과 같음」).
test("erasedKey — SQL 의 'erased:' || encode(sha256(convert_to(src_key,'UTF8')),'hex') 와 같은 값 · 다시 올리면 「빼 둔 줄과 같음」", async () => {
  const { createHash } = await import("node:crypto");
  const key = srcKey({ year: 2024, committee: "찬양부", team: "가", name: "가나다", mok: "기쁨-19", position: "집사" });
  assert.equal(await erasedKey(key), "erased:" + createHash("sha256").update(key, "utf8").digest("hex"));
  const tomb = await erasedKey(key);
  const db = fakeDb((table, calls, qb) => {
    if (table === "ministry_history") return page0(qb, [{ id: 1, src_key: tomb, deleted_at: "D" }]);
    if (table === "church_people") return { count: 0, error: null };
    throw new Error("이 시험이 다루지 않는 호출: " + table);
  });
  const H = makeHistory({ db, audit: async () => {} });
  const r = await H.upload({ member: null, roles: ["ministry"] },
    { rows: [{ year: 2024, committee: "찬양부", team: "가", name: "가나다", mok: "기쁨-19", position: "집사" }] }, false);
  assert.deepEqual([r.counts.add, r.counts.deleted], [0, 1]);
});

test("historyFilter — 목록·내려받기 공용(해 · 못 맞춤/근거 약함 · 이름·팀·부서 찾기)", () => {
  const rows = [
    { id: 1, year: 2024, name: "가나다", team: "가 찬양대", committee: "찬양부", person_id: 11, match_basis: "같은 소속" },
    { id: 2, year: 2024, name: "라마바", team: "가 찬양대", committee: "찬양부", person_id: 12, match_basis: "같은 교구(목장 다름)" },
    { id: 3, year: 2023, name: "사아자", team: "나 전도대", committee: "전도부", person_id: null, match_basis: "" },
  ];
  const ids = (b) => historyFilter(rows, b).hit.map((r) => r.id);
  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ years: [2024] }), [1, 2]);
  assert.deepEqual(ids({ only: "none" }), [3]);
  assert.deepEqual(ids({ only: "weak" }), [2]);
  assert.deepEqual(ids({ q: "가 나" }), [1]);
  assert.deepEqual(ids({ q: "전도" }), [3]);
  assert.deepEqual(ids({ only: "bogus", years: ["x"] }), [1, 2, 3]);
});

// 2026-10-02 친구 요청 — 동명이인 중 한 분만 보기: 띄어 쓴 낱말은 **모두** 맞아야(낱말마다 이름·목장·부서·팀·직책·직분 중 하나) ·
//   #숫자는 교인ID(교인명부·총괄만 — 사역신청 역할은 need-directory). 숫자만(# 없이)은 글자 그대로(목장 번호 「12」).
test("historyFilter 찾기 — 띄어 쓴 낱말을 함께(이름·목장·부서·팀·직책·직분) · #교인ID 는 교인명부·총괄만", () => {
  const rows = [
    { id: 1, year: 2024, name: "김세웅", mok: "화평-20", committee: "찬양부", team: "시온성가대", role_title: "", position: "집사",
      person_id: 101, match_basis: "같은 소속" },
    { id: 2, year: 2024, name: "김세웅", mok: "기쁨-3목장", committee: "전도부", team: "새가족팀", role_title: "팀장", position: "안수집사",
      person_id: 102, match_basis: "같은 소속" },
    { id: 3, year: 2023, name: "김세웅A", mok: "화평-120", committee: "교육부", team: "유년부 교사", role_title: "부장", position: "권사",
      person_id: null, match_basis: "" },
    { id: 4, year: 2023, name: "이영희", mok: "화평-20", committee: "찬양부", team: "시온성가대", role_title: "", position: "권사",
      person_id: 12, match_basis: "같은 소속" },
  ];
  const run = (q, full = false, b = {}) => historyFilter(rows, { ...b, q }, { full });
  const ids = (q, full = false, b = {}) => run(q, full, b).hit.map((r) => r.id);

  // 이름 + 목장 — 두 낱말이 모두 맞는 줄만(오늘은 「김세웅화평-20」 한 덩이로 보아 아무것도 안 나왔다)
  assert.deepEqual(ids("김세웅 화평-20"), [1]);
  assert.deepEqual(ids("화평-20 김세웅"), [1]);                       // 차례는 상관없다
  // 목장 — 끝의 「목장」은 양쪽 다 떼고 본다
  assert.deepEqual(ids("김세웅 화평-20목장"), [1]);                   // 줄은 「화평-20」, 찾기는 「…목장」
  assert.deepEqual(ids("김세웅 기쁨-3"), [2]);                        // 줄은 「기쁨-3목장」, 찾기는 없이
  assert.deepEqual(ids("김세웅 3목장"), [2]);
  assert.deepEqual(ids("김세웅 20목장"), [1, 3]);                     // 들어 있으면 맞는다(「화평-120」에도 「20」이 있다)
  assert.deepEqual(ids("목장"), [2]);                                 // 「목장」 한 낱말은 다 맞는 것이 아니다 — 글자 그대로
  // 부서·팀·직책·직분을 넘나드는 낱말
  assert.deepEqual(ids("전도부 팀장"), [2]);
  assert.deepEqual(ids("안수집사"), [2]);
  assert.deepEqual(ids("권사 교사"), [3]);                            // 직분 + 팀(「유년부 교사」의 띄어쓰기는 없앤 채)
  assert.deepEqual(ids("김세웅 부장"), [3]);
  assert.deepEqual(ids("집사"), [1, 2]);
  assert.deepEqual(ids("시온 권사"), [4]);
  assert.deepEqual(ids("김세웅 없는팀"), []);
  // 한 낱말 — 오늘(이름·팀·부서) 맞던 줄은 그대로 맞는다
  assert.deepEqual(ids("김세웅"), [1, 2, 3]);
  assert.deepEqual(ids("시온"), [1, 4]);
  assert.deepEqual(ids("찬양"), [1, 4]);
  assert.deepEqual(ids("유년부교사"), [3]);
  assert.deepEqual(ids("김세웅a"), [3]);                              // 동명이인 끝 글자(hKey) — 오늘처럼
  assert.deepEqual(ids("김세웅 a"), [3]);                             // 오늘 「김세웅a」로 맞던 것 — 띄어도 좁아지지 않는다
  assert.deepEqual(ids("김세웅".normalize("NFD")), [1, 2, 3]);        // 맥 자모분리(NFD)도 완성형으로
  // 해·교적 거르기와 함께
  assert.deepEqual(ids("김세웅", false, { years: [2023] }), [3]);
  assert.deepEqual(ids("김세웅", false, { only: "none" }), [3]);
  // 「+」「,」도 낱말 가르개
  assert.deepEqual(ids("김세웅+화평-20"), [1]);
  assert.deepEqual(ids("김세웅,화평-20"), [1]);
  assert.deepEqual(ids(" 김세웅 ,+ 화평-20 "), [1]);
  // 비었거나 빈칸·가르개뿐이면 거르지 않는다(q 는 빈 글 — 내려받기 기록에 search 가 안 붙게)
  for (const q of ["", "   ", " + , ", undefined]) {
    assert.deepEqual(ids(q), [1, 2, 3, 4], String(q));
    assert.equal(run(q).q, "", String(q));
    assert.equal(run(q).error, undefined, String(q));
  }
  assert.ok(run("김세웅 화평-20").q, "찾은 것이 있으면 q 가 빈 글이 아니다");
  // #숫자 — 교인명부·총괄(full)이면 교인ID 로 거른다(낱말은 그대로 함께)
  assert.deepEqual(ids("#101", true), [1]);
  assert.deepEqual(ids("#12", true), [4]);
  assert.deepEqual(ids("김세웅 #102", true), [2]);
  assert.deepEqual(ids("#102 화평-20", true), []);                    // 모두 맞아야 — 102 는 기쁨-3목장
  assert.deepEqual(ids("#999", true), []);
  assert.deepEqual(ids("#0012", true), [4]);                          // 앞의 0 은 숫자로
  assert.equal(run("#101", true).error, undefined);
  // 사역신청 역할(full 아님) — 거르지 않고 오류 코드(던지지 않는다 · 교인ID 로 줄을 가려 보는 길을 막는다)
  for (const q of ["#101", "김세웅 #102", "#12"]) {
    const r = run(q, false);
    assert.equal(r.error, "need-directory", q);
    assert.deepEqual(r.hit, [], q);
  }
  const noOpt = historyFilter(rows, { q: "#101" });                  // 역할을 안 넘기면 full 이 아닌 것으로
  assert.equal(noOpt.error, "need-directory");
  // # 없는 숫자는 글자 — 목장 번호(「화평-120」의 12)로 맞고, 교인ID 12(4번 줄)로 맞지 않는다 · 오류도 없다
  assert.deepEqual(ids("12"), [3]);
  assert.deepEqual(ids("12", true), [3]);
  assert.equal(run("12").error, undefined);
  // 「#」 하나만(치는 중)은 버린다 — 목록이 까닭 없이 비지 않게(찾지 않은 것과 같다 · 오류 없음)
  assert.deepEqual(ids("#"), ids(""));
  assert.equal(run("#").error, undefined);
  // 「# 101」(# 뒤 빈칸)은 「#101」 — 교인명부·총괄은 그분 줄만, 사역신청 역할은 need-directory
  assert.deepEqual(ids("# 101", true), ids("#101", true));
  assert.equal(run("# 101").error, "need-directory");
  // 「#」 뒤가 숫자가 아니면 글자 그대로(어느 칸에도 없으니 빈 결과 · 오류 없음)
  assert.deepEqual(ids("#가나"), []);
  assert.equal(run("#가나").error, undefined);
});

// 같은 거르기가 목록·내려받기 두 곳에 — 화면에 보인 줄 = 내려받은 줄 · 사역신청 역할의 #교인ID 는 둘 다 need-directory(기록 없음)
test("목록·내려받기 — 낱말 함께 찾기·#교인ID 가 같은 줄을 거른다 · 사역신청 역할은 need-directory 이고 교인ID 가 없다", async () => {
  const audits = [];
  const base = { role_title: "", renewal: "", src_note: "", link_how: "auto", match_reason: "", source: "excel", source_file: "a",
    linked_at: null, updated_at: "T" };
  const rows = [
    { ...base, id: 1, year: 2024, committee: "찬양부", team: "가", name: "가나다", position: "집사", mok: "기쁨-19", person_id: 11, match_basis: "같은 소속" },
    { ...base, id: 2, year: 2024, committee: "찬양부", team: "가", name: "가나다", position: "권사", mok: "화평-3", person_id: 12, match_basis: "같은 소속" },
    { ...base, id: 3, year: 2023, committee: "전도부", team: "나", name: "라마바", position: "집사", mok: "기쁨-19", person_id: null, match_basis: "" },
  ];
  const db = fakeDb((table, calls, qb) => {
    if (table === "ministry_history") return page0(qb, rows);
    if (table === "church_people") return calls.includes("in") ? { data: [{ person_id: 11 }, { person_id: 12 }], error: null }
      : page0(qb, [{ person_id: 11 }, { person_id: 12 }]);
    throw new Error("이 시험이 다루지 않는 호출: " + table);
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ministry = { member: { id: "m" }, roles: ["ministry"] };
  const dir = { member: { id: "d" }, roles: ["ministry", "directory"] };
  const sup = { member: { id: "s" }, roles: ["super"] };
  const ids = (r) => r.rows.map((x) => x.id);

  // 사역신청 역할 — #교인ID 는 목록·내려받기 모두 need-directory 하나만(줄·수·해 요약도 없다) · 내려받기 기록도 없다
  for (const q of ["#11", "가나다 #12"]) {
    assert.deepEqual(await H.list(ministry, { q }), { ok: false, error: "need-directory" }, q);
    assert.deepEqual(await H.exportRows(ministry, { q }), { ok: false, error: "need-directory" }, q);
  }
  assert.equal(audits.length, 0, "오류로 끝난 내려받기가 기록을 남겼다");

  // 이름 + 목장 — 목록과 내려받기가 같은 줄 · 사역신청 역할에게는 교인ID 칸이 없다
  for (const ctx of [ministry, dir]) {
    const l = await H.list(ctx, { q: "가나다 화평-3" });
    const x = await H.exportRows(ctx, { q: "가나다 화평-3" });
    assert.deepEqual(ids(l), [2]);
    assert.deepEqual(ids(x), [2]);
    assert.equal(l.total, 1);
    const pidShown = ctx === dir;
    for (const r of [...l.rows, ...x.rows]) assert.equal("person_id" in r, pidShown, JSON.stringify(ctx.roles));
  }
  // 교인명부·총괄 — #교인ID(낱말과 함께도) · 목록과 내려받기가 같은 줄
  for (const ctx of [dir, sup]) {
    for (const [q, want] of [["#11", [1]], ["가나다 #12", [2]], ["#12 집사", []]]) {
      const l = await H.list(ctx, { q });
      assert.equal(l.ok, true, q);
      assert.deepEqual(ids(l), want, q);
      const x = await H.exportRows(ctx, { q });
      assert.equal(x.ok, true, q);
      assert.deepEqual(ids(x), want, q);
    }
  }
  // 내려받기 기록 — 찾았다는 것(search:true)만 · 찾은 글자도 교인ID 도 싣지 않는다
  const details = audits.map((a) => a[3]);
  assert.ok(details.length > 0);
  for (const d of details) assert.equal(d.search, true);
  assert.ok(!/가나다|화평|#1[12]/.test(JSON.stringify(audits)), "기록에 찾은 글자·교인ID 가 실렸다");
});

test("내려받기 — 화면의 거르기(only·q)를 따른다 · 기록에 찾은 글자는 없다(search:true 만) · 명부는 차례로 읽는다", async () => {
  const audits = [];
  const rows = [
    { id: 1, year: 2024, committee: "찬양부", team: "가", role_title: "", name: "가나다", position: "집사", mok: "기쁨-19", renewal: "",
      src_note: "", person_id: 11, link_how: "auto", match_basis: "같은 소속", match_reason: "", source: "excel", source_file: "a", linked_at: null, updated_at: "T" },
    { id: 2, year: 2024, committee: "찬양부", team: "가", role_title: "", name: "라마바", position: "집사", mok: "기쁨-19", renewal: "",
      src_note: "", person_id: null, link_how: "auto", match_basis: "", match_reason: "교인명부에 같은 이름이 없음", source: "excel", source_file: "a", linked_at: null, updated_at: "T" },
  ];
  const db = fakeDb((table, calls, qb) => {
    if (table === "ministry_history") return page0(qb, rows);
    if (table === "church_people") { assert.ok(calls.includes("order"), "allDirectoryIds 에 정렬이 없다"); return page0(qb, [{ person_id: 11 }]); }
    throw new Error("이 시험이 다루지 않는 호출: " + table);
  });
  const H = makeHistory({ db, audit: async (...a) => audits.push(a) });
  const ctx = { member: { id: "m" }, roles: ["ministry"] };
  const a = await H.exportRows(ctx, { only: "none" });
  assert.deepEqual(a.rows.map((r) => r.id), [2]);
  const b = await H.exportRows(ctx, { q: "가나" });
  assert.deepEqual(b.rows.map((r) => r.id), [1]);
  assert.equal(b.rows[0].in_directory, true);
  assert.deepEqual(audits.map((x) => x[3]), [{ count: 1, years: [], only: "none" }, { count: 1, years: [], search: true }]);
  assert.ok(!JSON.stringify(audits).includes("가나"), "기록에 찾은 글자가 실렸다");
  // 거른 결과가 없으면 기록 없이 빈 줄(PROBE 와 같은 길)
  assert.deepEqual((await H.exportRows(ctx, { years: [1951] })).rows, []);
  assert.equal(audits.length, 2);
});

// ── 「빠진 사역」 정정 신청을 「반영」하면 그 해 사역 이력에 한 줄(2026-10-01 · 2026-10-02 고쳐서 반영 · 기록·되살리기·목장 99·직분 교적) ──
// 신청 한 줄(REQUEST_ADMIN_SELECT 모양에서 쓰는 칸만)
//   committee_text 는 기본 null — 옛 한 칸 신청(team_text 에 「부서 · 팀」). 글자(빈 글자도)면 두 칸 신청(2026-10-02 · SQL 009).
const REQ = (o = {}) => ({ id: 7, kind: "missing", year: 2023, committee_text: null, team_text: "찬양위원회 시온성가대", who_type: "교구",
  who_group: "기쁨", who_sub: "12", who_name: "가나다", person_id: 11, status: "반영", ...o });
// 화면이 고쳐 보낸 내용(parseRequestLine 을 거친 모양)
const LINE = (o = {}) => ({ year: 2023, committee: "찬양위원회", team: "시온성가대", role_title: "", expect: "", ...o });
// applyMissingRequest 의 옵션 — 시험마다 교적 직분·마지막 빼기 기록을 바꿔 끼운다
const OPT = (o = {}) => ({ line: null, memberId: "m", nowIso: "T1",
  positionLookup: async () => "권사", lastDeleteLookup: async () => { throw new Error("이 시험은 빼기 기록을 묻지 않는다"); }, ...o });

test("parseTeamText — 「·•/|」로 나눔 · 끝 직분 떼기(끝 낱말 전체가 직분일 때만 · 님 뗌) · 한 조각이면 첫 빈칸에서 둘 · 셋 이상은 팀에 「 · 」로", () => {
  assert.deepEqual(parseTeamText("새가족부 · 운영 · 안수집사"), { committee: "새가족부", team: "운영", position: "안수집사" });
  assert.deepEqual(parseTeamText("찬양위원회 시온성가대"), { committee: "찬양위원회", team: "시온성가대", position: "" });
  assert.deepEqual(parseTeamText("시온성가대"), { committee: "", team: "시온성가대", position: "" });
  assert.deepEqual(parseTeamText("찬양위원회 시온성가대 집사님"), { committee: "찬양위원회", team: "시온성가대", position: "집사" });
  assert.deepEqual(parseTeamText("새가족부 · 운영 안수집사"), { committee: "새가족부", team: "운영", position: "안수집사" });
  assert.deepEqual(parseTeamText("찬양위원회/시온성가대|테너"), { committee: "찬양위원회", team: "시온성가대 · 테너", position: "" });
  assert.deepEqual(parseTeamText("  교육위원회 •  유년부   교사  "), { committee: "교육위원회", team: "유년부 교사", position: "" });
  // 부서·팀 이름이 직분 낱말을 품을 뿐이면 직분이 아니다 — 끝 낱말 **전체**가 (앞말)직분(님)일 때만(2026-10-02 리뷰 D5)
  assert.deepEqual(parseTeamText("여전도회 · 권사회"), { committee: "여전도회", team: "권사회", position: "" });
  assert.deepEqual(parseTeamText("교육위원회 · 청년부"), { committee: "교육위원회", team: "청년부", position: "" });
  assert.deepEqual(parseTeamText("청년부 대학청년"), { committee: "청년부", team: "대학청년", position: "" });
  assert.deepEqual(parseTeamText("교육위원회 · 대학청년"), { committee: "교육위원회", team: "대학청년", position: "" });
  assert.deepEqual(parseTeamText("교육위원회 · 중고등학생"), { committee: "교육위원회", team: "중고등학생", position: "" });
  assert.deepEqual(parseTeamText("시온성가대 · 은퇴권사님"), { committee: "", team: "시온성가대", position: "은퇴권사" });
  assert.deepEqual(parseTeamText("찬양위원회 시온성가대 부목사"), { committee: "찬양위원회", team: "시온성가대", position: "부목사" });
  // 서리·이명도 앞말(교적이 쓰는 직분 — events-people.ts positionFromChurch 가 떼는 앞말 · 2026-10-02 최종 검토 #10)
  assert.deepEqual(parseTeamText("찬양위원회 시온성가대 서리집사"), { committee: "찬양위원회", team: "시온성가대", position: "서리집사" });
  assert.deepEqual(parseTeamText("시온성가대 · 이명권사님"), { committee: "", team: "시온성가대", position: "이명권사" });
  assert.deepEqual(parseTeamText("새가족부 · 운영 · 서리집사님"), { committee: "새가족부", team: "운영", position: "서리집사" });
  assert.deepEqual(parseTeamText("교육위원회 · 서리"), { committee: "교육위원회", team: "서리", position: "" });   // 앞말만으로는 직분이 아니다
  // 교적의 겹앞말·뒷말 「은퇴협동권사」·「서리집사은퇴」(events-people.ts positionFromChurch 주석의 꼴 · 2026-10-02 검증 2차 #6)
  assert.deepEqual(parseTeamText("시온성가대 · 은퇴협동권사"), { committee: "", team: "시온성가대", position: "은퇴협동권사" });
  assert.deepEqual(parseTeamText("시온성가대 · 서리집사은퇴"), { committee: "", team: "시온성가대", position: "서리집사은퇴" });
  assert.deepEqual(parseTeamText("찬양위원회 시온성가대 은퇴협동권사님"), { committee: "찬양위원회", team: "시온성가대", position: "은퇴협동권사" });
  assert.deepEqual(parseTeamText("새가족부 · 운영 · 서리집사은퇴"), { committee: "새가족부", team: "운영", position: "서리집사은퇴" });
  assert.deepEqual(parseTeamText("교육위원회 · 서리은퇴"), { committee: "교육위원회", team: "서리은퇴", position: "" });   // 앞말·뒷말만으로는 직분이 아니다
  assert.deepEqual(parseTeamText("집사"), { committee: "", team: "집사", position: "" });           // 직분 한 마디뿐이면 떼지 않는다
  assert.deepEqual(parseTeamText("시온성가대 · 권사"), { committee: "", team: "시온성가대", position: "권사" });
  assert.deepEqual(parseTeamText("찬양위원회 시온성가대".normalize("NFD")), { committee: "찬양위원회", team: "시온성가대", position: "" });
  assert.deepEqual(parseTeamText(" · / "), { committee: "", team: "", position: "" });
});

test("requestDraft — 신청의 부서·팀 미리 채움 · 두 칸(committee_text 가 글자)은 다듬기만(나누지 않는다) · 옛 한 칸(null)은 parseTeamText", () => {
  // 두 칸 — 적은 그대로(NFC · 빈칸 접기 · 앞뒤 자르기) · 끝의 직분 낱말도 떼지 않는다
  assert.deepEqual(requestDraft(REQ({ committee_text: "찬양위원회", team_text: "시온성가대" })), { committee: "찬양위원회", team: "시온성가대" });
  assert.deepEqual(requestDraft(REQ({ committee_text: " 찬양위원회  시온성가대 ".normalize("NFD"), team_text: "  집사  " })),
    { committee: "찬양위원회 시온성가대", team: "집사" });
  assert.deepEqual(requestDraft(REQ({ committee_text: "", team_text: "시온성가대" })), { committee: "", team: "시온성가대" });
  assert.deepEqual(requestDraft(REQ({ committee_text: "새가족부", team_text: "" })), { committee: "새가족부", team: "" });
  assert.deepEqual(requestDraft(REQ({ committee_text: "새가족부 · 운영", team_text: null })), { committee: "새가족부 · 운영", team: "" });
  // 옛 한 칸(null · 칸 없음) — 지금처럼 나눈다(끝 직분은 뗀다)
  assert.deepEqual(requestDraft(REQ()), { committee: "찬양위원회", team: "시온성가대" });
  assert.deepEqual(requestDraft(REQ({ team_text: "새가족부 · 운영 · 안수집사" })), { committee: "새가족부", team: "운영" });
  const { committee_text, ...old } = REQ({ team_text: "시온성가대" });
  assert.deepEqual(requestDraft(old), { committee: "", team: "시온성가대" });
  assert.deepEqual(requestDraft(null), { committee: "", team: "" });
});

test("parseRequestLine — 연도(1950~2100 정수) · 부서나 팀 하나는 · 칸마다 100자 · NFC·빈칸 접기·앞뒤 자르기 · expect 는 글자 그대로", () => {
  const ok = parseRequestLine({ year: " 2024 ", committee: "  찬양위원회 ".normalize("NFD"), team: "시온   성가대", role_title: " 팀장 ", expect: " T1 " });
  assert.deepEqual(ok, { line: { year: 2024, committee: "찬양위원회", team: "시온 성가대", role_title: "팀장", expect: "T1" }, error: "" });
  assert.deepEqual(parseRequestLine({ year: 2023, committee: "새가족부", team: "" }).line,
    { year: 2023, committee: "새가족부", team: "", role_title: "", expect: "" });                     // 부서만 적어도 된다
  assert.equal(parseRequestLine({ year: 2023, team: "운영" }).line.committee, "");
  for (const year of ["", null, undefined, 1949, 2101, "20x3", 2023.5]) {
    assert.deepEqual(parseRequestLine({ year, team: "가" }), { line: null, error: "bad-year" }, String(year));
  }
  assert.equal(parseRequestLine({ year: 2023, committee: "  ", team: "" }).error, "need-team");
  assert.equal(parseRequestLine({ year: 2023, team: "가".repeat(HISTORY_FIELD_MAX) }).error, "");
  assert.equal(parseRequestLine({ year: 2023, team: "가".repeat(HISTORY_FIELD_MAX + 1) }).error, "history-too-long");
  assert.equal(parseRequestLine({ year: 2023, team: "가", role_title: "가".repeat(HISTORY_FIELD_MAX + 1) }).error, "history-too-long");
  // 빈칸은 접은 뒤에 센다 — 「가␣␣␣…」 51자 빈칸 덩어리도 한 칸
  assert.equal(parseRequestLine({ year: 2023, team: "가" + " ".repeat(200) + "나" }).line.team, "가 나");
  assert.equal(parseRequestLine("2023").error, "bad-year");                                            // 모양이 틀리면
  assert.equal(parseRequestLine(null).error, "bad-year");
});

test("requestLineOut — 목록이 창에 미리 채울 줄 · 살아 있으면 in · 빼 두었으면 out · 없으면 성도님 글에서 읽은 draft · 정해진 칸만", () => {
  const row = { id: 55, year: 2024, committee: "찬양위원회", team: "호산나찬양대", role_title: "팀장", position: "안수집사", deleted_at: null,
    updated_at: "U1", src_key: "req:7", person_id: 11, name: "가나다", mok: "기쁨-12" };
  const KEYS = ["committee", "expect", "position", "role_title", "state", "team", "year"];
  const a = requestLineOut(REQ(), row);
  assert.deepEqual(a, { state: "in", year: 2024, committee: "찬양위원회", team: "호산나찬양대", role_title: "팀장", position: "안수집사", expect: "U1" });
  assert.deepEqual(Object.keys(a).sort(), KEYS);
  assert.ok(!JSON.stringify(a).includes("가나다") && !JSON.stringify(a).includes("기쁨-12"), "이름·목장이 실렸다");
  assert.equal(requestLineOut(REQ(), { ...row, deleted_at: "D" }).state, "out");
  const d = requestLineOut(REQ({ team_text: "새가족부 · 운영 · 안수집사" }), null);
  assert.deepEqual(d, { state: "draft", year: 2023, committee: "새가족부", team: "운영", role_title: "", position: "", expect: "" });
  assert.deepEqual(Object.keys(d).sort(), KEYS);
  // 두 칸 신청 — draft 는 부서·팀 칸 그대로(나누지 않는다)
  assert.deepEqual(requestLineOut(REQ({ committee_text: "봉사위원회", team_text: "주차팀 집사" }), null),
    { state: "draft", year: 2023, committee: "봉사위원회", team: "주차팀 집사", role_title: "", position: "", expect: "" });
  assert.deepEqual(requestLineOut(REQ({ committee_text: "", team_text: "찬양위원회 시온성가대" }), null),
    { state: "draft", year: 2023, committee: "", team: "찬양위원회 시온성가대", role_title: "", position: "", expect: "" });
});

test("missingRowFromRequest — 줄은 고친 내용(line)대로 · 직분은 넘겨받은 교적 직분 · 목장(교구-목장 · 99·빈칸은 교구만 · 교회학교 부서) · 열쇠 req:<id> · 원본 메모", () => {
  const a = missingRowFromRequest(REQ(), LINE({ year: 2024, committee: " 찬양위원회 ", team: "호산나  찬양대", role_title: "팀장" }), "안수집사");
  assert.equal(a.error, "");
  assert.deepEqual(a.row, { year: 2024, committee: "찬양위원회", team: "호산나 찬양대", role_title: "팀장", name: "가나다", position: "안수집사",
    mok: "기쁨-12", renewal: "", src_note: "정정 신청 #7", src_key: "req:7" });
  // line 이 없으면 성도님 글에서 읽는다 — 글에 적힌 직분은 쓰지 않고 교적 직분(D4)
  const b = missingRowFromRequest(REQ({ team_text: "새가족부 · 운영 · 안수집사" }), null, "집사");
  assert.deepEqual([b.row.year, b.row.committee, b.row.team, b.row.role_title, b.row.position], [2023, "새가족부", "운영", "", "집사"]);
  assert.equal(missingRowFromRequest(REQ({ team_text: "새가족부 · 운영 · 안수집사" }), null, "").row.position, "");
  assert.equal(missingRowFromRequest(REQ(), null, null).row.position, "");
  // 목장 — 99·빈칸은 교구만(requests-logic.js whoText 와 같은 규칙 · D3) · 「남성」은 그대로 · 교회학교는 부서(학년은 싣지 않는다)
  assert.equal(missingRowFromRequest(REQ({ who_sub: "99" }), null, "").row.mok, "기쁨");
  assert.equal(missingRowFromRequest(REQ({ who_sub: "" }), null, "").row.mok, "기쁨");
  assert.equal(missingRowFromRequest(REQ({ who_sub: "남성" }), null, "").row.mok, "기쁨-남성");
  const d = missingRowFromRequest(REQ({ who_type: "교회학교", who_group: "중등부", who_sub: "2학년", team_text: "중등부 찬양팀" }), null, "");
  assert.equal(d.row.mok, "중등부");
  assert.equal(requestKey("12"), "req:12");
  // 부서만 있어도 된다 · 둘 다 비면 need-team · 검사는 tidyHistoryRow 그대로(긴 칸·해·이름)
  assert.equal(missingRowFromRequest(REQ(), LINE({ committee: "새가족부", team: "" }), "").row.committee, "새가족부");
  assert.deepEqual(missingRowFromRequest(REQ(), LINE({ committee: "", team: " " }), ""), { row: null, error: "need-team" });
  assert.equal(missingRowFromRequest(REQ({ team_text: "" }), null, "").error, "need-team");
  assert.equal(missingRowFromRequest(REQ(), LINE({ team: "가".repeat(HISTORY_FIELD_MAX + 1) }), "").error, "history-too-long");
  assert.equal(missingRowFromRequest(REQ({ who_name: "가".repeat(HISTORY_FIELD_MAX + 1) }), null, "").error, "history-too-long");
  assert.equal(missingRowFromRequest(REQ({ year: null }), null, "").error, "bad-year");
  assert.equal(missingRowFromRequest(REQ(), LINE({ year: 1900 }), "").error, "bad-year");
  assert.equal(missingRowFromRequest(REQ({ who_name: " " }), null, "").error, "no-name");
  // 두 칸 신청 — line 이 없으면 부서·팀 칸 그대로(나누지 않는다) · 둘 중 하나만 있어도 · 둘 다 비면 need-team
  const t = missingRowFromRequest(REQ({ committee_text: "봉사위원회", team_text: "주차팀 집사" }), null, "권사");
  assert.deepEqual([t.row.committee, t.row.team, t.row.position], ["봉사위원회", "주차팀 집사", "권사"]);
  assert.deepEqual([missingRowFromRequest(REQ({ committee_text: "새가족부", team_text: "" }), null, "").row.committee,
    missingRowFromRequest(REQ({ committee_text: "", team_text: "운영" }), null, "").row.team], ["새가족부", "운영"]);
  assert.deepEqual(missingRowFromRequest(REQ({ committee_text: "", team_text: " " }), null, ""), { row: null, error: "need-team" });
  // line 이 있으면 두 칸이어도 line 대로
  assert.equal(missingRowFromRequest(REQ({ committee_text: "봉사위원회", team_text: "주차팀" }), LINE({ committee: "교육위원회", team: "유년부" }), "")
    .row.committee, "교육위원회");
});

// 아주 작은 메모리 표(ministry_history 하나) — eq·is·not 거르기 · insert(같은 src_key 면 23505) · update · select · maybeSingle·single
function memDb(seed = [], { onFrom } = {}) {
  const rows = seed.map((r) => ({ deleted_at: null, deleted_by: null, ...r }));
  let nextId = 100;
  const hit = (r, log) => log.every(([n, a]) =>
    n === "eq" ? r[a[0]] === a[1] : n === "is" ? (r[a[0]] ?? null) === a[1] : n === "not" ? (r[a[0]] ?? null) !== a[2] : true);
  const resolver = (table, calls, qb) => {
    if (onFrom) { const x = onFrom(table, calls, qb); if (x) return x; }
    if (table !== "ministry_history") throw new Error("이 시험이 다루지 않는 표: " + table);
    const log = qb.log.filter(([n]) => n === "eq" || n === "is" || n === "not");
    const ins = qb.log.find(([n]) => n === "insert")?.[1][0];
    const upd = qb.log.find(([n]) => n === "update")?.[1][0];
    if (ins) {
      if (rows.some((r) => r.src_key === ins.src_key)) return { data: null, error: { code: "23505", message: "dup" } };
      const r = { id: nextId++, deleted_at: null, deleted_by: null, ...ins };
      rows.push(r);
      return { data: { id: r.id, year: r.year }, error: null };
    }
    const got = rows.filter((r) => hit(r, log));
    if (upd) { for (const r of got) Object.assign(r, upd); return { data: got.map((r) => ({ id: r.id, year: r.year })), error: null }; }
    if (calls.includes("maybeSingle")) return { data: got[0] ? { ...got[0] } : null, error: null };
    return { data: got.map((r) => ({ ...r })), error: null };
  };
  return { db: fakeDb(resolver), rows };
}
// 신청 #7 의 줄 하나(살아 있음 · updated_at U0)
const LIVE = (o = {}) => ({ id: 100, src_key: "req:7", year: 2023, committee: "찬양위원회", team: "시온성가대", role_title: "", name: "가나다",
  position: "권사", mok: "기쁨-12", person_id: 11, link_how: "manual", updated_at: "U0", ...o });

test("applyMissingRequest — 넣기: 본인 교인ID · 사람이 이은 줄 · 직분은 교적(글의 직분 아님) → 두 번째는 그대로 → 되돌리기(빼기)", async () => {
  const { db, rows } = memDb();
  const asked = [];
  const look = async (pid) => { asked.push(pid); return "권사"; };
  const a = await applyMissingRequest(db, REQ({ team_text: "새가족부 · 운영 · 안수집사" }), OPT({ positionLookup: look }));
  assert.deepEqual(a, { id: 100, year: 2023, created: true });
  assert.deepEqual(asked, [11]);
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.deepEqual(
    [r.src_key, r.year, r.committee, r.team, r.role_title, r.name, r.position, r.mok, r.renewal, r.src_note],
    ["req:7", 2023, "새가족부", "운영", "", "가나다", "권사", "기쁨-12", "", "정정 신청 #7"]);
  assert.deepEqual([r.source, r.source_file, r.person_id, r.link_how, r.linked_by, r.linked_at, r.match_basis, r.match_reason, r.updated_at],
    ["admin", "(정정 신청)", 11, "manual", "m", "T1", "본인 정정 신청", "", "T1"]);

  // 두 번 눌러도 한 줄 — 명부도 다시 묻지 않는다
  assert.deepEqual(await applyMissingRequest(db, REQ(), OPT({ positionLookup: look, nowIso: "T2" })), { id: 100, year: 2023, created: false });
  assert.equal(rows.length, 1);
  assert.deepEqual(asked, [11]);

  // 되돌리기 — 살아 있는 그 줄만 뺀다(표시만) · 두 번째는 뺄 것이 없다 · 다른 신청의 줄은 건드리지 않는다
  assert.deepEqual(await undoMissingRequest(db, 8, "m2", "T3"), { removed: false });
  assert.deepEqual(await undoMissingRequest(db, 7, "m2", "T3"), { id: 100, year: 2023, removed: true });
  assert.deepEqual([rows[0].deleted_at, rows[0].deleted_by, rows[0].updated_at], ["T3", "m2", "T3"]);
  assert.deepEqual(await undoMissingRequest(db, 7, "m2", "T4"), { removed: false });
});

test("applyMissingRequest — 두 칸 신청을 고친 내용(line) 없이 반영하면 부서·팀 칸 그대로 넣는다(나누지 않는다 · 2026-10-02)", async () => {
  const { db, rows } = memDb();
  const a = await applyMissingRequest(db, REQ({ committee_text: "봉사위원회", team_text: "주차팀 집사" }), OPT());
  assert.deepEqual(a, { id: 100, year: 2023, created: true });
  assert.deepEqual([rows[0].committee, rows[0].team, rows[0].role_title, rows[0].position, rows[0].src_key],
    ["봉사위원회", "주차팀 집사", "", "권사", "req:7"]);
  // 부서만 적은 두 칸 신청
  const b = memDb();
  await applyMissingRequest(b.db, REQ({ committee_text: "새가족부", team_text: "" }), OPT());
  assert.deepEqual([b.rows[0].committee, b.rows[0].team], ["새가족부", ""]);
  // 둘 다 빈 두 칸 신청(서버 parseRequest 가 막지만) — 넣지 않는다
  const c = memDb();
  assert.deepEqual(await applyMissingRequest(c.db, REQ({ committee_text: "", team_text: "" }), OPT()), { error: "need-team" });
  assert.equal(c.rows.length, 0);
});

test("applyMissingRequest — 고친 내용(line)으로 넣는다 · 교적 직분 읽기가 실패해도 줄은 넣는다(직분 빈칸 · console.error)", async () => {
  const { db, rows } = memDb();
  const a = await applyMissingRequest(db, REQ(), OPT({ line: LINE({ year: 2024, committee: "교육위원회", team: "유년부", role_title: "부장" }) }));
  assert.deepEqual(a, { id: 100, year: 2024, created: true });
  assert.deepEqual([rows[0].year, rows[0].committee, rows[0].team, rows[0].role_title, rows[0].position], [2024, "교육위원회", "유년부", "부장", "권사"]);

  const e = memDb();
  const logged = [];
  const err = console.error; console.error = (...x) => logged.push(x);
  let b;
  try {
    b = await applyMissingRequest(e.db, REQ(), OPT({ positionLookup: async () => { throw new Error("명부 읽기 실패"); } }));
  } finally { console.error = err; }
  assert.equal(b.created, true);
  assert.equal(e.rows[0].position, "");
  assert.equal(logged.length, 1);
  // 읽다 실패한 것은 응답에 싣는다(positionFailed — 불리언만 · 화면이 「직분을 채워 주세요」 창을 띄운다 · 2026-10-02 최종 검토 #9)
  assert.deepEqual(b, { id: 100, year: 2023, created: true, positionFailed: true });
  // 교적에 직분이 없을 뿐(빈 글자·null)이면 실패가 아니다
  for (const none of ["", null]) {
    const f = memDb();
    assert.deepEqual(await applyMissingRequest(f.db, REQ(), OPT({ positionLookup: async () => none })), { id: 100, year: 2023, created: true },
      JSON.stringify(none));
  }
});

test("applyMissingRequest — 교적을 못 찾은 신청(person_id 없음)은 no-person · 표를 건드리지 않는다", async () => {
  const db = { from: (t) => { throw new Error("표를 건드리면 안 된다: " + t); } };
  for (const person_id of [null, undefined, 0, -3]) {
    assert.deepEqual(await applyMissingRequest(db, REQ({ person_id }), OPT()), { error: "no-person" }, String(person_id));
  }
});

test("applyMissingRequest — 살아 있는 줄: 내용이 같으면 그대로(created:false) · 다르면 expect 가 맞을 때만 고친다(edited · fields) · 틀리면 line-conflict", async () => {
  const { db, rows } = memDb([LIVE()]);
  assert.deepEqual(await applyMissingRequest(db, REQ(), OPT({ line: LINE({ expect: "다른 값이어도 같으면 쓰지 않는다" }) })),
    { id: 100, year: 2023, created: false });
  assert.equal(rows[0].updated_at, "U0");

  // 틀린 expect(빈 값 — 창은 줄이 없던 때를 봤다 — 도) — 쓰지 않는다
  assert.deepEqual(await applyMissingRequest(db, REQ(), OPT({ line: LINE({ team: "호산나찬양대", expect: "U-old" }) })), { error: "line-conflict" });
  assert.deepEqual(await applyMissingRequest(db, REQ(), OPT({ line: LINE({ team: "호산나찬양대", expect: "" }) })), { error: "line-conflict" });
  assert.deepEqual([rows[0].team, rows[0].updated_at], ["시온성가대", "U0"]);

  // 맞는 expect — 바뀐 칸만 · updated_at 은 지금
  const r = await applyMissingRequest(db, REQ(), OPT({ nowIso: "T9", line: LINE({ year: 2022, team: "호산나찬양대", role_title: "팀장", expect: "U0" }) }));
  assert.deepEqual(r, { id: 100, year: 2022, edited: true, fields: ["year", "team", "role_title"] });
  assert.deepEqual([rows[0].year, rows[0].committee, rows[0].team, rows[0].role_title, rows[0].position, rows[0].name, rows[0].updated_at],
    [2022, "찬양위원회", "호산나찬양대", "팀장", "권사", "가나다", "T9"]);
});

test("applyMissingRequest — 살아 있는 줄 고치기는 updated_at 으로 잠근다(그사이 바뀌어 0행이면 line-conflict)", async () => {
  let upd = null;
  const db = fakeDb((table, calls, qb) => {
    if (table !== "ministry_history") throw new Error("표: " + table);
    if (calls.includes("update")) { upd = qb.log; return { data: [], error: null }; }   // 그사이 누가 바꿨다
    return { data: LIVE(), error: null };
  });
  assert.deepEqual(await applyMissingRequest(db, REQ(), OPT({ line: LINE({ team: "호산나찬양대", expect: "U0" }) })), { error: "line-conflict" });
  assert.ok(upd.some(([n, a]) => n === "eq" && a[0] === "updated_at" && a[1] === "U0"), "고치기에 updated_at 잠금이 없다");
  assert.ok(upd.some(([n, a]) => n === "is" && a[0] === "deleted_at" && a[1] === null), "고치기가 빼 둔 줄을 건드릴 수 있다");
});

test("applyMissingRequest — 빼 둔 줄: 마지막 빼기가 정정 신청 쪽(from:\"request\")이었을 때만 되살린다(고친 내용도 함께) · 손으로 뺀 줄·기록 없음은 history-removed", async () => {
  const OUT = LIVE({ deleted_at: "D", deleted_by: "m0", updated_at: "U1" });
  // 마지막 빼기가 「📜 사역 이력」에서 손으로(from 없음) · 기록이 없음 · 다른 from — 되살리지 않는다
  //   신청 「삭제」로 뺀 줄(why:"request-deleted")도 — 그 신청은 지워졌다(지우는 사이에 낀 「반영 한 번 더」가 되살리지 않게 · 2026-10-02 최종 검토 #2)
  let m;
  for (const last of [{ year: 2023 }, null, { year: 2023, from: "history" }, { year: 2023, from: "request", request: 7, why: "request-deleted" }]) {
    m = memDb([OUT]);
    const seen = [];
    const r = await applyMissingRequest(m.db, REQ(), OPT({ lastDeleteLookup: async (id) => { seen.push(id); return last; } }));
    assert.deepEqual(r, { error: "history-removed", id: 100 }, JSON.stringify(last));
    assert.deepEqual(seen, [100]);
    assert.equal(m.rows[0].deleted_at, "D");
  }

  // 정정 신청 쪽이 뺐다 — 되살린다 · 고친 내용도 넣는다
  m = memDb([OUT]);
  const fromReq = async () => ({ year: 2023, from: "request", request: 7 });
  const r = await applyMissingRequest(m.db, REQ(), OPT({ nowIso: "T5", lastDeleteLookup: fromReq,
    line: LINE({ team: "호산나찬양대", role_title: "팀장", expect: "U1" }) }));
  assert.deepEqual(r, { id: 100, year: 2023, restored: true, fields: ["team", "role_title"] });
  assert.deepEqual([m.rows[0].deleted_at, m.rows[0].deleted_by, m.rows[0].updated_at, m.rows[0].team, m.rows[0].role_title],
    [null, null, "T5", "호산나찬양대", "팀장"]);

  // 고친 내용 없이(옛 화면) — 그대로 되살린다
  m = memDb([OUT]);
  assert.deepEqual(await applyMissingRequest(m.db, REQ(), OPT({ lastDeleteLookup: fromReq })),
    { id: 100, year: 2023, restored: true, fields: [] });
  assert.equal(m.rows[0].deleted_at, null);

  // 상태가 어디서 왔는지는 보지 않는다(2026-10-02 · 263fa20 의 mayRestore 를 걷었다) — 「확인 중→반영」에서 되살리다 DB 오류가 나
  //   「잠시 뒤 「반영」을 한 번 더」 안내를 따라 반영에 머문 채 다시 눌러도 되살린다. 옛 부르는 쪽이 mayRestore:false 를 넘겨도 읽지 않는다.
  m = memDb([OUT]);
  assert.deepEqual(await applyMissingRequest(m.db, REQ(), OPT({ mayRestore: false, lastDeleteLookup: fromReq })),
    { id: 100, year: 2023, restored: true, fields: [] });
  assert.equal(m.rows[0].deleted_at, null);

  // 창이 본 뒤로 그 줄이 바뀌었다(expect 다름) — 되살리지 않는다
  m = memDb([OUT]);
  assert.deepEqual(await applyMissingRequest(m.db, REQ(), OPT({ lastDeleteLookup: fromReq, line: LINE({ expect: "U-old" }) })),
    { error: "line-conflict" });
  assert.equal(m.rows[0].deleted_at, "D");
});

test("applyMissingRequest — 마지막 빼기 기록은 lastDeleteLookup 이 없으면 admin_audit 에서(history.delete · 그 줄 · 최근 한 줄)", async () => {
  const seen = [];
  const { db, rows } = memDb([LIVE({ deleted_at: "D", updated_at: "U1" })], { onFrom: (table, calls, qb) => {
    if (table !== "admin_audit") return null;
    seen.push(qb.log);
    return { data: { detail: { year: 2023, from: "request", request: 7 } }, error: null };
  } });
  const r = await applyMissingRequest(db, REQ(), OPT({ lastDeleteLookup: undefined }));
  assert.equal(r.restored, true);
  assert.equal(rows[0].deleted_at, null);
  const log = seen[0];
  assert.ok(log.some(([n, a]) => n === "eq" && a[0] === "action" && a[1] === "history.delete"));
  assert.ok(log.some(([n, a]) => n === "eq" && a[0] === "target" && a[1] === "100"));
  assert.ok(log.some(([n, a]) => n === "order" && a[0] === "id" && a[1]?.ascending === false));
  assert.ok(log.some(([n, a]) => n === "limit" && a[0] === 1));
});

test("applyMissingRequest — 지워 달라는 요청으로 지운 줄(erasedKey(req:<id>))이면 history-deleted · 줄을 못 만들면 그 코드 · 넣지 않는다", async () => {
  const { db, rows } = memDb([{ id: 1, src_key: await erasedKey("req:7"), year: 2023, deleted_at: "D" }]);
  assert.deepEqual(await applyMissingRequest(db, REQ(), OPT()), { error: "history-deleted" });
  assert.equal(rows.length, 1);
  const e = memDb();
  assert.deepEqual(await applyMissingRequest(e.db, REQ({ team_text: "가".repeat(HISTORY_FIELD_MAX + 1) }), OPT()), { error: "history-too-long" });
  assert.deepEqual(await applyMissingRequest(e.db, REQ(), OPT({ line: LINE({ committee: "", team: "" }) })), { error: "need-team" });
  assert.equal(e.rows.length, 0);
});

test("applyMissingRequest — 같은 때 두 번(넣다가 23505)이면 먼저 들어간 줄을 created:false 로 · 다른 오류는 던진다", async () => {
  let looked = 0;
  const raced = { id: 55, year: 2023 };
  const db = fakeDb((table, calls, qb) => {
    if (table !== "ministry_history") throw new Error("표: " + table);
    if (calls.includes("insert")) return { data: null, error: { code: "23505" } };
    const key = qb.log.find(([n, a]) => n === "eq" && a[0] === "src_key")?.[1][1];
    if (key === "req:7") return { data: looked++ === 0 ? null : raced, error: null };   // 처음엔 없었다 · 넣다 막힌 뒤엔 있다
    return { data: null, error: null };                                               // erasedKey — 없음
  });
  assert.deepEqual(await applyMissingRequest(db, REQ(), OPT()), { id: 55, year: 2023, created: false });
  const bad = fakeDb((table, calls) => (calls.includes("insert") ? { data: null, error: { code: "23502", message: "x" } } : { data: null, error: null }));
  await assert.rejects(applyMissingRequest(bad, REQ(), OPT()));
});

test("applyMissingRequest — 교적 직분은 positionLookup 이 없으면 church_people 에서(명예·은퇴·원로 앞말 포함 · positionFromChurch)", async () => {
  const seen = [], cols = [];
  // 가짜 명부는 고른 칸(select)만 돌려준다 — select 에서 position_detail 이 빠지면 「은퇴」가 사라져 이 시험이 잡는다(2026-10-02 최종 검토 #12)
  const PERSON_ROW = { person_id: 11, name: "가나다", position: "권사", position_detail: "은퇴" };
  const { db, rows } = memDb([], { onFrom: (table, calls, qb) => {
    if (table !== "church_people") return null;
    seen.push(qb.log.find(([n]) => n === "eq")[1]);
    const pick = String(qb.log.find(([n]) => n === "select")?.[1][0] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    cols.push(pick);
    return { data: Object.fromEntries(pick.filter((c) => c in PERSON_ROW).map((c) => [c, PERSON_ROW[c]])), error: null };
  } });
  await applyMissingRequest(db, REQ(), OPT({ positionLookup: undefined }));
  assert.deepEqual(seen, [["person_id", 11]]);
  assert.ok(cols[0].includes("position") && cols[0].includes("position_detail"), "직분 칸을 고르지 않는다: " + JSON.stringify(cols));
  assert.ok(!cols[0].includes("name") && !cols[0].includes("*"), "직분 말고 다른 칸까지 읽는다: " + JSON.stringify(cols));
  assert.equal(rows[0].position, "은퇴권사");
});
