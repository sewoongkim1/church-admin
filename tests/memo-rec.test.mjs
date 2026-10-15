// 📖 성경암송 기록(2026-10-15) — 교인 → 앱 계정 찾기 · 요약(memo-rec.ts · 순수) · 교인카드 탭 · 심방 카드 가족 줄
//   이름은 모두 지어낸 것(시험-가 …).
import { test } from "node:test";
import assert from "node:assert/strict";
import { appWho, memoAccountsFor, memoSummary, verseKind, withMemoTab, doneVerseNos, kstDay, MEMO_HOW_NAME, MEMO_HOW_PIN }
  from "../supabase/functions/church-admin/memo-rec.ts";
import { toLinkCand } from "../supabase/functions/church-admin/people-links.ts";
import { tabsFor, tabOf, tabsHtml, histPanelHtml, keepMemo, memoPanelHtml } from "../js/menus/people/person-history.js";
import { personDetailHtml } from "../js/menus/people/person-detail.js";

const cand = (person_id, mok1, mok3, kind2 = "장년") => toLinkCand({ person_id, name_key: "시험-가", mok1, mok3, school_dept: "", phone_digits: "", kind2 });
const ME = { person_id: 1, name: "시험-가" };
const U1 = { id: "u1", name: "시험-가", type: "교구", gu: "화평", mok: "20", created_at: "2025-03-01T01:00:00Z", last_seen_at: "2026-10-14T23:30:00Z" };

test("소속 글 · 구절 갈래 · 한국 날짜", () => {
  assert.equal(appWho(U1), "화평 20목장");
  assert.equal(appWho({ type: "교회학교", bu: "고등부", grade: "1학년" }), "고등부 1학년");
  assert.equal(verseKind(12), "weekly");
  assert.equal(verseKind(1001), "psalm");
  assert.equal(verseKind(2001), "navi");
  assert.equal(kstDay("2026-10-14T23:30:00Z"), "2026-10-15");   // 한국은 아홉 시간 앞
  assert.equal(kstDay("없음"), "");
});

test("계정 찾기 — 이름 · 소속이 같은 한 분이면 이분 · 동명이인이 같은 목장이면 못 찾음 · 다른 목장이면 찾지 않음", () => {
  const one = memoAccountsFor(ME, [U1], [cand(1, "화평", "화평-20목장"), cand(2, "사랑", "사랑-3목장")], []);
  assert.deepEqual(one.map((a) => [a.user.id, a.how]), [["u1", MEMO_HOW_NAME]]);
  // 같은 목장에 같은 이름이 둘 — 가리지 못한다(잇지 않는다)
  assert.equal(memoAccountsFor(ME, [U1], [cand(1, "화평", "화평-20목장"), cand(3, "화평", "화평-20목장")], []).length, 0);
  // 앱 소속이 다른 분(사랑 3목장)과 같으면 그분 계정이다
  assert.equal(memoAccountsFor(ME, [{ ...U1, gu: "사랑", mok: "3" }], [cand(1, "화평", "화평-20목장"), cand(2, "사랑", "사랑-3목장")], []).length, 0);
  // 이름이 다른 계정은 보지 않는다
  assert.equal(memoAccountsFor(ME, [{ ...U1, name: "시험-나" }], [cand(1, "화평", "화평-20목장")], []).length, 0);
});

test("계정 찾기 — 확인 번호(본인 확인)가 먼저 · 이름이 달라도 · 다른 분께 확인된 계정은 이름으로 잇지 않음", () => {
  const renamed = { ...U1, id: "u9", name: "시험-가2" };
  const pins = [{ user_id: "u9", person_id: 1, person_how: "staff" }];
  const r = memoAccountsFor(ME, [renamed, U1], [cand(1, "화평", "화평-20목장")], pins);
  assert.deepEqual(r.map((a) => [a.user.id, a.how]), [["u9", MEMO_HOW_PIN], ["u1", MEMO_HOW_NAME]]);
  // u1 이 확인 번호로 다른 분(2)께 이어져 있으면 이름이 같아도 이분 것이 아니다
  assert.equal(memoAccountsFor(ME, [U1], [cand(1, "화평", "화평-20목장")], [{ user_id: "u1", person_id: 2, person_how: "auto" }]).length, 0);
  // 맞대 보기만 한 줄(person_how 가 auto · staff 가 아님)은 확인이 아니다
  assert.equal(memoAccountsFor(ME, [renamed], [], [{ user_id: "u9", person_id: 1, person_how: "none" }]).length, 0);
});

test("요약 — 다 마친 말씀(한글 · 영어 한 번) · 갈래 · 활동한 날 · 최근 30일 · 횟수 · 최근 말씀 · user_id 없음", () => {
  const acc = [{ user: U1, how: MEMO_HOW_NAME }];
  const prog = [
    { user_id: "u1", verse_no: 12, stage: 3, updated_at: "2026-10-10T00:00:00Z" },
    { user_id: "u1", verse_no: 12, stage: 2, updated_at: "2026-10-11T00:00:00Z" },   // 영어 줄 — 같은 구절
    { user_id: "u1", verse_no: 2001, stage: 3, updated_at: "2026-10-12T00:00:00Z" },
    { user_id: "u1", verse_no: 1001, stage: 1, updated_at: "2026-09-01T00:00:00Z" },
    { user_id: "남", verse_no: 5, stage: 3, updated_at: "2026-10-13T00:00:00Z" },   // 다른 계정 — 안 센다
  ];
  const act = [
    { day: "2026-10-14", user_id: "u1", mode: "learn-typing", cnt: 3 },
    { day: "2026-10-14", user_id: "u1", mode: "typing", cnt: 2 },
    { day: "2026-08-01", user_id: "u1", mode: "voice", cnt: 1 },
    { day: "2026-10-14", user_id: "남", mode: "typing", cnt: 9 },
  ];
  const m = memoSummary(acc, prog, act, new Map([[12, "시 23:1"]]), "2026-10-15");
  assert.equal(m.done, 2);
  assert.deepEqual([m.doneWeekly, m.doneNavi, m.donePsalm], [1, 1, 0]);
  assert.equal(m.started, 3);
  assert.deepEqual([m.days, m.days30, m.firstDay, m.lastDay], [2, 1, "2026-08-01", "2026-10-14"]);
  assert.deepEqual([m.learn, m.challenge], [3, 3]);
  assert.deepEqual(m.recent, [{ ref: "2001번 말씀", day: "2026-10-12" }, { ref: "시 23:1", day: "2026-10-10" }]);
  assert.deepEqual(m.accounts, [{ name: "시험-가", who: "화평 20목장", how: MEMO_HOW_NAME, joined: "2025-03-01", lastSeen: "2026-10-15" }]);
  assert.ok(!JSON.stringify(m).includes("u1"), "user_id 가 새면 안 된다");
  assert.deepEqual(doneVerseNos(prog), [5, 12, 2001]);
  // 계정이 없으면 0 들
  const z = memoSummary([], prog, act, new Map(), "2026-10-15");
  assert.deepEqual([z.accounts.length, z.done, z.days], [0, 0, 0]);
});

test("교인카드 — 성경암송 탭(총괄에게만 서버가 준다) · 수는 다 마친 말씀 · 잇기 뒤에도 그대로", () => {
  const memo = memoSummary([{ user: U1, how: MEMO_HOW_PIN }], [{ user_id: "u1", verse_no: 12, stage: 3, updated_at: "2026-10-10T00:00:00Z" }], [], new Map([[12, "시 23:1"]]), "2026-10-15");
  const base = { counts: { ministry: 1, bible: 0 }, ministry: [], bible: [] };
  const h = withMemoTab(base, memo);
  assert.equal(h.counts.memo, 1);
  assert.equal(withMemoTab(base, null), base);
  assert.equal(withMemoTab(null, memo), null);
  assert.deepEqual(tabsFor(h).map(([k]) => k), ["church", "ministry", "bible", "memo"]);
  assert.deepEqual(tabsFor({ ...h, education: [] }).map(([k]) => k), ["church", "ministry", "bible", "education", "memo"]);
  assert.equal(tabOf("memo", h), "memo");
  assert.equal(tabOf("memo", base), "church");
  const tabs = tabsHtml({ ...h, education: [] }, "memo");
  assert.ok(tabs.includes("pd-tabs4") && tabs.includes("pd-tabs5"));
  assert.ok(tabs.includes('aria-label="교적 · 사역 · 성경필사 · 교육 · 성경암송"'));
  const panel = histPanelHtml("memo", h, null);
  assert.ok(panel.includes("본인 확인") && panel.includes("시 23:1") && panel.includes("1구절"));
  assert.ok(memoPanelHtml({ accounts: [] }).includes("찾지 못했어요"));
  // 잇기 응답(성경암송 칸 없음) 뒤에도 보던 칸 그대로
  const after = keepMemo(h, { counts: { ministry: 2, bible: 0 }, ministry: [], bible: [] });
  assert.equal(after.counts.memo, 1);
  assert.equal(after.counts.ministry, 2);
  assert.ok(after.memo);
  const html = personDetailHtml({ person_id: 1, name: "시험-가", canVisit: true }, [], h, "memo");
  assert.ok(html.includes('data-pd-panel="memo"'));
  assert.ok(html.includes('data-pd-visit="1"') && html.includes("심방자료"));
  assert.ok(!html.includes("data-v="), "dialog 가 「닫기」로 읽는 data-v 를 쓰면 안 된다");
  assert.ok(!personDetailHtml({ person_id: 1, name: "시험-가" }, [], base).includes("data-pd-visit"));
});
