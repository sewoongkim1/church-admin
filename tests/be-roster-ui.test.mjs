// 📋 회차·명단의 HTML 조각(js/menus/bibleevent/roster-ui.js) — 글자는 모두 esc 되는가 · 앱 줄·자격 회차의 줄 메뉴 ·
// 칩·요약 줄. 창을 여닫는 동작은 브라우저에서 본다(Task 10 Step 16). 이름은 가짜(홍길동 …)만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chipsHtml, headHtml, settingsHtml, sourceHtml, filtersHtml, sumHtml, cardHtml, tableHtml, listHtml, rowMenuOptions,
  ELIG_LINE } from "../js/menus/bibleevent/roster-ui.js";
import { blankFilter } from "../js/menus/bibleevent/roster-logic.js";

const EV = { id: "ca-test-x", title: "시험 <회차>", short_title: "", subtitle: "", season: "", status: "draft", opens_on: "2026-10-01",
  closes_on: "2026-10-31", list_until: null, count: 1234, listedNow: false, hasEligibility: false, updated_at: "u" };
const ROW = { id: 7, who_type: "교구", group: "화평", sub: "20", name: "홍<길동>", position: "집사", note: "원래: <b>", source: "import",
  hasUser: false, at: "2026-10-01", updated_at: "u", church: { state: "확인 필요", reason: "소속 <다름>" } };

test("chipsHtml — 고른 칩 · 인원(천 단위) · 상태 · 👁 는 성도님께 보일 때만 · 끝에 「＋ 새 회차」 · 글자는 esc", () => {
  const h = chipsHtml([EV, { ...EV, id: "b", short_title: "짧은", listedNow: true, status: "open" }], "ca-test-x");
  assert.match(h, /data-ev="ca-test-x" aria-pressed="true"/);
  assert.match(h, /data-ev="b" aria-pressed="false"/);
  assert.ok(h.includes("시험 &lt;회차&gt;") && !h.includes("<회차>"));
  assert.ok(h.includes("<em>1,234</em>"));
  assert.equal((h.match(/👁/g) || []).length, 1);
  assert.ok(h.includes("짧은") && h.includes("준비 중") && h.includes("열림"));
  assert.ok(h.endsWith(`<button type="button" class="be-ev new" data-act="new">＋ 새 회차</button>`));
});

test("headHtml · settingsHtml — 공개 여부 · 자격 회차 표 · 공개 종료일이 비면 경고", () => {
  assert.ok(headHtml(EV).includes("성도님께 안 보임"));
  assert.ok(headHtml({ ...EV, listedNow: true }).includes("👁 성도님께 보임"));
  assert.ok(headHtml({ ...EV, hasEligibility: true }).includes("🔒 자격 회차"));
  const s = settingsHtml(EV, false);
  assert.ok(!s.includes(" open>"));
  assert.ok(s.includes("비움 — 기한 없이 보여요") && s.includes("be-warn"));
  assert.ok(s.includes("「준비 중」이라서예요"));
  assert.ok(!settingsHtml({ ...EV, list_until: "2026-12-31" }, true).includes("be-warn"));
  assert.ok(settingsHtml(EV, true).includes('<details class="be-set" open>'));
  assert.ok(ELIG_LINE.includes("자격 규칙은 여기서 바꾸지 않습니다 · 이 회차는 한 분 더하기·올리기를 하지 않습니다(가을 설계 §12)"));
});

test("sourceHtml · sumHtml · filtersHtml", () => {
  assert.ok(sourceHtml({ date: "2026-09-29", total: 8672 }).includes("8,672명"));
  assert.ok(sourceHtml(null).includes("교인명부가 아직 없어"));
  assert.equal(sumHtml(10, 10, 0, ""), "명단 <b>10</b>명");
  assert.equal(sumHtml(10, 3, 2, " <춘향> "), "명단 <b>10</b>명 · 보이는 줄 <b>3</b> · ⚠️ 중복일 수 있음 <b>2</b>줄 · ‘&lt;춘향&gt;’로 찾은 것");
  const labels = new Map([["교구|화평", "화평"], ["교구|믿음", "믿음"]]);
  const off = filtersHtml(blankFilter(), { labels, church: false });
  assert.ok(!off.includes('data-filter="church"') && !off.includes('data-act="clear"'));
  const on = filtersHtml({ ...blankFilter(), groups: ["교구|화평", "교구|믿음"], church: "없음" }, { labels, church: true });
  assert.ok(on.includes("<b>화평 외 1</b>") && on.includes("<b>교적 없음</b>") && on.includes('data-act="clear"'));
});

test("cardHtml · tableHtml · listHtml — 이름·메모·교적 까닭까지 esc · 메모는 있을 때만 · 중복 표시", () => {
  const c = cardHtml(ROW, true);
  assert.ok(c.includes("홍&lt;길동&gt;") && c.includes("원래: &lt;b&gt;") && c.includes("소속 &lt;다름&gt;"));
  assert.ok(!c.includes("<길동>") && !c.includes("<다름>"));
  assert.ok(c.includes("20목장") && c.includes("⚠️ 중복일 수 있음") && c.includes('class="be-row dup"'));
  assert.ok(!cardHtml({ ...ROW, note: "" }, false).includes("be-memo"));
  const g = [{ key: "교구|화평", label: "화평", rows: [ROW] }];
  const t = tableHtml(g, new Set([7]));
  assert.equal((t.match(/<th>/g) || []).length, 7);
  assert.ok(t.includes('<tr class="dup">') && t.includes('colspan="7"'));
  assert.ok(listHtml([], new Set(), false).includes("조건에 맞는 줄이 없어요"));
  assert.ok(listHtml(g, new Set(), true).includes("be-table"));
  assert.ok(listHtml(g, new Set(), false).includes("be-grp"));
});

test("rowMenuOptions — 앱 줄·자격 회차의 줄은 「메모 고치기」 하나(빼기 없음) · 이관 줄은 고치기·빼기", () => {
  assert.deepEqual(rowMenuOptions({ ...ROW, source: "app" }, EV).map((o) => o.value), ["edit"]);
  assert.deepEqual(rowMenuOptions(ROW, { ...EV, hasEligibility: true }).map((o) => o.value), ["edit"]);
  assert.deepEqual(rowMenuOptions(ROW, EV).map((o) => o.value), ["edit", "del"]);
});

test("화면 모듈이 Node 에서 읽힌다 — 들여온 이름이 모두 있다(없으면 여기서 SyntaxError · node --check 는 이것을 못 본다)", async () => {
  const f = await import("../js/menus/bibleevent/event-form.js");
  const r = await import("../js/menus/bibleevent/row-form.js");
  const m = await import("../js/menus/bibleevent/roster.js");
  assert.equal(typeof f.openEventForm, "function");
  assert.equal(typeof r.openRowForm, "function");
  assert.equal(typeof r.openRowDelete, "function");
  assert.equal(typeof m.render, "function");
});
