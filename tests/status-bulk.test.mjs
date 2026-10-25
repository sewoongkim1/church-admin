// 신청 현황 — 한꺼번에 처리(2026-10-25 · 2안) 순수 논리 + 사람 카드 조각
import test from "node:test";
import assert from "node:assert/strict";
import { bulkTargets, groupByPerson, appointNote, personKey } from "../js/menus/ministry/status-logic.js";

const r = (id, name, who, status, team, extra = {}) => ({ id, name, who, status, team, committee: "부", at: "2026-10-21", phone: "", canPush: false, notified_at: null, ...extra });
const rows = [
  r(1, "김성도", "기쁨", "신청완료", "오병이어 2팀"), r(2, "김성도", "기쁨", "접수완료", "시온 찬양대"), r(3, "김성도", "기쁨", "임명확정", "방송실운영"),
  r(4, "이은혜", "소망", "신청완료", "새가족영접", { canPush: true }), r(5, "박믿음", "사랑", "취소", "카페운영"),
];

test("bulkTargets — 접수는 신청에서만 · 임명은 신청·접수에서 · 취소는 취소가 아닌 것 모두", () => {
  const k = [personKey(rows[0])];
  assert.deepEqual(bulkTargets(rows, k, "접수완료").map((x) => x.id), [1]);
  assert.deepEqual(bulkTargets(rows, k, "임명확정").map((x) => x.id), [1, 2]);
  assert.deepEqual(bulkTargets(rows, k, "취소").map((x) => x.id), [1, 2, 3]);
  assert.deepEqual(bulkTargets(rows, new Set([personKey(rows[4])]), "접수완료"), [], "취소된 줄은 건드리지 않는다");
  assert.deepEqual(bulkTargets(rows, [], "접수완료"), [], "고른 사람이 없으면 비었다");
  assert.deepEqual(bulkTargets(rows, k, "신청완료"), [], "모르는 상태로는 못 간다");
});

test("bulkTargets — 고른 사람의 줄만(다른 소속의 같은 이름은 다른 사람)", () => {
  const other = r(9, "김성도", "사랑", "신청완료", "상례");
  const t = bulkTargets([...rows, other], [personKey(rows[0])], "접수완료");
  assert.deepEqual(t.map((x) => x.id), [1]);
});

test("groupByPerson — 가나다 차례 · 한 사람의 줄이 한데", () => {
  const g = groupByPerson(rows);
  assert.deepEqual(g.map((x) => x.key.split("/")[0]), ["김성도", "박믿음", "이은혜"]);
  assert.equal(g[0].rows.length, 3);
});

test("appointNote — 알림 나갈 분 · 안 켜신 분 · 이미 나간 분을 가른다", () => {
  const t = [r(1, "가", "a", "신청완료", "x", { canPush: true }), r(2, "나", "a", "신청완료", "y"),
    r(3, "다", "a", "접수완료", "z", { canPush: true, notified_at: "2026-10-20" }), r(4, "가", "a", "접수완료", "w", { canPush: true })];
  const n = appointNote(t);
  assert.deepEqual([n.people, n.teams, n.push, n.quiet, n.already], [3, 4, 1, 1, 1]);
  assert.deepEqual(n.names, ["가", "나", "다"]);
});

// ── 사람 카드 · 아래 고정 줄(status-ui.js) ──
import { personCardsHtml, bulkBarHtml } from "../js/menus/ministry/status-ui.js";

test("personCardsHtml — 사람마다 카드 하나 · 이름 escape · 고른 카드는 sel + aria-pressed", () => {
  const evil = r(7, "<b>김</b>", "기쁨<x>", "신청완료", "오병이어 2팀");
  const html = personCardsHtml([evil, rows[3]], new Set([personKey(evil)]), new Map());
  assert.equal((html.match(/class="mn-pc( sel)?"/g) || []).length, 2);
  assert.ok(html.includes("&lt;b&gt;김&lt;/b&gt;") && !html.includes("<b>김</b>"), "이름이 escape 되지 않았다");
  assert.ok(html.includes('class="mn-pc sel"') && html.includes('aria-pressed="true"') && html.includes('aria-pressed="false"'));
});

test("personCardsHtml — 한꺼번에 단추는 바꿀 줄이 있을 때만 · 신청이 있으면 「전부 접수」가 주 동작", () => {
  const k = personKey(rows[0]);   // 신청 1 · 접수 1 · 임명 1
  const one = personCardsHtml(rows.slice(0, 3), new Set(), new Map());
  assert.ok(one.includes('data-act="pbulk"') && one.includes('data-to="접수완료"') && one.includes("전부 접수 <em>1</em>"));
  assert.ok(one.includes('data-to="임명확정"') && one.includes('data-to="취소"'));
  assert.ok(one.includes(`data-pk="${k}"`));
  // 임명만 된 사람 — 접수·임명 단추는 없고 취소만
  const done = personCardsHtml([r(8, "최", "x", "임명확정", "t")], new Set(), new Map());
  assert.ok(!done.includes('data-to="접수완료"') && !done.includes('data-to="임명확정"') && done.includes('data-to="취소"'));
  // 취소된 사람 — 아무 단추도 없다
  assert.ok(!personCardsHtml([rows[4]], new Set(), new Map()).includes("mn-pc-act"));
});

test("personCardsHtml — 신청한 사역마다 상태 메뉴가 한 줄씩(상태 바꾸기는 그대로)", () => {
  const html = personCardsHtml(rows.slice(0, 3), new Set(), new Map());
  assert.equal((html.match(/data-act="drop"/g) || []).length, 3);
  assert.ok(html.includes("mn-pc-tm s1") && html.includes("mn-pc-tm s2") && html.includes("mn-pc-tm s3"));
  assert.ok(personCardsHtml([], new Set(), new Map()).includes("조건에 맞는 신청이 없어요"));
});

test("bulkBarHtml — 고른 수 · 건수 · 바꿀 줄이 없으면 그 단추는 막는다", () => {
  const b = bulkBarHtml(2, 3, 0);
  assert.ok(b.includes("2명 골랐어요") && b.includes("접수 3건 · 임명 0건"));
  assert.ok(/data-to="접수완료">접수</.test(b) && /data-to="임명확정" disabled>임명</.test(b));
  assert.ok(!/data-to="접수완료" disabled/.test(b));
});
