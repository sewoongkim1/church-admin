// 📋 회차·명단의 HTML 조각(js/menus/bibleevent/roster-ui.js) — 글자는 모두 esc 되는가 · 앱 줄·자격 회차의 줄 메뉴 ·
// 칩·요약 줄. 창을 여닫는 동작은 브라우저에서 본다(Task 10 Step 16). 이름은 가짜(홍길동 …)만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { headHtml, settingsHtml, sourceHtml, filtersHtml, sumHtml, cardHtml, tableHtml, listHtml, rowMenuOptions,
  ELIG_LINE } from "../js/menus/bibleevent/roster-ui.js";
import * as rosterUi from "../js/menus/bibleevent/roster-ui.js";
import { blankFilter } from "../js/menus/bibleevent/roster-logic.js";
import { errorText } from "../js/core/ui.js";

const EV = { id: "ca-test-x", title: "시험 <회차>", short_title: "", subtitle: "", season: "", status: "draft", opens_on: "2026-10-01",
  closes_on: "2026-10-31", list_until: null, count: 1234, listedNow: false, hasEligibility: false, updated_at: "u" };
const ROW = { id: 7, who_type: "교구", group: "화평", sub: "20", name: "홍<길동>", position: "집사", note: "원래: <b>", source: "import",
  hasUser: false, at: "2026-10-01", updated_at: "u", church: { state: "확인 필요", reason: "소속 <다름>" } };

test("회차 콤보(evBarHtml) — 칩 대신 단추 하나: 제목 전체 · 「연·월 · 상태 · 인원」 작은 줄 · 우리 고르개(aria-haspopup) · <select> 없음", () => {
  const { evBarHtml, comboSub } = rosterUi;
  assert.equal(typeof evBarHtml, "function", "roster-ui.js 가 evBarHtml 을 내보내야 한다");
  assert.equal(typeof comboSub, "function", "roster-ui.js 가 comboSub 을 내보내야 한다");
  assert.equal(rosterUi.chipsHtml, undefined, "칩(chipsHtml)은 걷었다");
  const ev = { ...EV, title: "사순절 마가복음 완서자 <2026>", short_title: "완서자", opens_on: "2026-03-01", status: "closed", count: 231 };
  const h = evBarHtml(ev);
  assert.ok(h.includes("사순절 마가복음 완서자 &lt;2026&gt;") && !h.includes("<2026>"), "제목 전체(짧은 이름이 아니다)·esc");
  assert.ok(!h.includes(">완서자<"), "짧은 이름을 쓰지 않는다");
  assert.ok(h.includes("2026년 3월 · 마감 · 231명"), h);
  assert.ok(!h.includes("성도님께 보임"));
  assert.match(h, /<button type="button" class="be-combo" data-act="ev" aria-haspopup="dialog" aria-expanded="false"/);
  assert.ok(h.includes('class="pk-field-x"'), "▾ 쉐브론(고르개 단추와 같은 그림)");
  assert.ok(h.includes(`<button type="button" class="btn be-evnew" data-act="new">＋ 새 회차</button>`));
  assert.ok(!/<select|<datalist|<option/i.test(h), "시스템 목록 없음");
  assert.ok(!h.includes("data-ev="), "칩 표식이 남지 않는다");
  // 성도님께 보이는 회차 — 작은 줄 끝에 「 · 👁 성도님께 보임」
  assert.equal(comboSub({ ...ev, listedNow: true }), "2026년 3월 · 마감 · 231명 · 👁 성도님께 보임");
  assert.ok(evBarHtml({ ...ev, listedNow: true }).includes("2026년 3월 · 마감 · 231명 · 👁 성도님께 보임"));
  // 날짜가 없거나 이상하면 「날짜 없음」 · 제목이 없으면 짧은 이름 → id · 천 단위
  assert.equal(comboSub({ ...ev, opens_on: "", count: 1234, status: "open" }), "날짜 없음 · 열림 · 1,234명");
  assert.ok(evBarHtml({ ...ev, title: "", short_title: "" }).includes("ca-test-x"));
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

test("settingsHtml — 같은 날 마감 회차끼리 차례(작을수록 위) · 없으면 0", () => {
  const s = settingsHtml({ ...EV, sort_order: 3 }, false);
  assert.ok(s.includes("같은 날 마감 회차끼리 차례"), s);
  assert.ok(s.includes("3 (작을수록 위)"), s);
  assert.ok(settingsHtml(EV, false).includes("0 (작을수록 위)"));             // 옛 응답(sort_order 없음)
  assert.ok(settingsHtml({ ...EV, sort_order: -2 }, false).includes("-2 (작을수록 위)"));
});

test("errorText — 회차 차례·글자 길이 코드도 한국말 문장이 있다(없으면 「처리하지 못했어요」)", () => {
  for (const error of ["bad-sort-order", "event-too-long"]) {
    assert.notEqual(errorText({ error }), "처리하지 못했어요", error);
  }
  assert.ok(errorText({ error: "bad-sort-order" }).includes("-999~999"));
  assert.ok(errorText({ error: "event-too-long" }).includes("100자"));
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

// ---------- 콤보 작은 지적 C(2026-09-30 · 리뷰 3d5fa47 M-1 · M-2) ----------
import { readFileSync } from "node:fs";
test("roster.js — 콤보로 고르면 표시(mark) 뒤 go · render 는 시작에 take(want) · 다 그린 뒤 .be-combo 에 초점 · 콤보 고르개는 wrap(M-1 · M-2)", () => {
  // 윈도 checkout(core.autocrlf)이면 CRLF — 줄 끝을 \n 으로 맞춘 뒤 견준다
  const src = readFileSync(new URL("../js/menus/bibleevent/roster.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const a = src.indexOf("async function pickEvent"), b = src.indexOf("async function newEvent");
  assert.ok(a > 0 && b > a, "pickEvent 가 newEvent 앞에 있어야 한다");
  const pick = src.slice(a, b);
  assert.match(pick, /pickOne\(\{[^}]*\bwrap: true\b[^}]*\}\)/, "콤보 고르개는 긴 제목이라 wrap(PC 판 너비 상한 · 줄바꿈)");
  const m = pick.indexOf("comboFocus.mark(v)"), g = pick.indexOf("go(`be-roster?ev=");
  assert.ok(m > 0 && g > m, "go 앞에 표시를 적는다(hashchange → route 가 곧 그린다)");
  assert.match(src, /\nconst comboFocus = comboRefocus\(\);/, "표시는 모듈에 하나(route 가 새 <section> 에 다시 그려도 남는다)");
  const w = src.indexOf("const want = "), t = src.indexOf("const refocusCombo = comboFocus.take(want);");
  assert.ok(w > 0 && t > w && t < src.indexOf("await Promise.all"), "render 시작(첫 await 앞)에 꺼낸다 — 꺼내면 지워진다");
  const end = src.lastIndexOf("\n  draw();\n");
  assert.ok(end > 0, "render 끝의 draw()");
  assert.ok(src.slice(end).includes('if (refocusCombo) refocus(".be-combo");'), "다 그린 뒤 초점을 콤보로");
  // 다른 고르개(거르기·줄 메뉴)는 wrap 없이 그대로
  assert.equal((src.match(/\bwrap: true\b/g) || []).length, 1);
});
