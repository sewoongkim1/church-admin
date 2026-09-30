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

// ---------- 한 분 더하기 찾기 후보에 「교적: 소망-남성1」(church_mok · 2026-09-30 친구 요청) ----------
// 소망 남성1·남성2 목장의 같은 이름 두 분은 옮겨 적으면 둘 다 「소망 남성」이다 — 교적 목장 칸 그대로를 작은 줄로 보인다.
test("candsHtml — 후보마다 교적 목장 칸을 작은 줄로(「교적: 소망-남성1」) · 비었거나 없으면 안 그린다 · esc · 13px 이상 --ink-2", async () => {
  const rf = await import("../js/menus/bibleevent/row-form.js");
  assert.equal(typeof rf.candsHtml, "function", "row-form.js 가 candsHtml 을 내보내야 한다");
  const res = { ok: true, source: { date: "2026-09-29", total: 8672 }, people: [
    { name: "홍길동", who_type: "교구", group: "소망", sub: "남성", position: "집사", church_mok: "소망-남성1" },
    { name: "홍길동", who_type: "교구", group: "소망", sub: "남성", position: "집사", church_mok: "소망-남성2" },
    { name: "홍길동", who_type: "", group: "", sub: "", position: "", church_mok: "" },
    { name: "홍길동", who_type: "교회학교", group: "중등부", sub: "", position: "", church_mok: "<i>중등부" },
    { name: "홍길동", who_type: "교구", group: "화평", sub: "3", position: "", church_mok: "   " },
    { name: "홍길동", who_type: "교구", group: "화평", sub: "3", position: "" },   // 칸이 없는 응답
  ] };
  const h = rf.candsHtml(res, "홍길동");
  const btns = h.split('<button type="button" class="be-cand"').slice(1);
  assert.equal(btns.length, 6, h);
  assert.ok(btns[0].includes('<small class="be-cand-mok">교적: 소망-남성1</small></button>'), btns[0]);
  assert.ok(btns[1].includes('<small class="be-cand-mok">교적: 소망-남성2</small></button>'), btns[1]);
  assert.ok(btns[0].includes("소망 남성") && btns[1].includes("소망 남성"), "옮겨 적은 소속 줄은 그대로");
  for (const i of [2, 4, 5]) assert.ok(!btns[i].includes("be-cand-mok") && !btns[i].includes("교적:"), "빈 칸이면 안 그린다 " + i);
  assert.ok(btns[3].includes("교적: &lt;i&gt;중등부") && !h.includes("<i>"), "esc");
  assert.equal((h.match(/교적:/g) || []).length, 3);
  // 작은 줄 — 한 줄을 다 쓰고(flex-basis 100%) 13px 이상 · 글자색 --ink-2(#5a6477)
  //   --gray(#6b778c)는 흰 바탕 기준 — 후보 단추 바탕 --ghost-bg(#eef3fb) 위에서는 약 4.06:1 로 AA(4.5:1)에 못 미친다.
  //   --ink-2 는 그 바탕에서 약 5.35:1. 두 분을 가려내라고 넣은 줄이라 읽혀야 한다.
  const css = readFileSync(new URL("../css/admin.css", import.meta.url), "utf8");
  const m = css.match(/\.be-cand-mok\{([^}]*)\}/);
  assert.ok(m, "css/admin.css 에 .be-cand-mok 규칙");
  const px = m[1].match(/font-size:(\d+)px/);
  assert.ok(px && Number(px[1]) >= 13, "13px 이상: " + m[1]);
  assert.match(m[1], /color:var\(--ink-2\)/);
  assert.doesNotMatch(m[1], /--gray/);
  assert.match(m[1], /flex-basis:100%/);
});

test("개인정보 안내 — 6번(보는 사람)·7번(교인명부에서 가져오는 것) 두 곳에 「찾기 후보에는 교적의 목장 칸도 그대로」(church_mok · 2026-09-30)", () => {
  const pv = readFileSync(new URL("../privacy.html", import.meta.url), "utf8");
  const note = "찾기 후보에는 교적의 목장 칸도 그대로 보여";
  assert.equal(pv.split(note).length - 1, 2, "6번·7번 두 곳");
  const s6 = pv.indexOf("<h3>6. "), s7 = pv.indexOf("<h3>7. "), s8 = pv.indexOf("<h3>8. ");
  assert.ok(s6 > 0 && s7 > s6);
  const i6 = pv.indexOf(note, s6), i7 = pv.indexOf(note, s7);
  assert.ok(i6 > s6 && i6 < s7, "6번 안");
  assert.ok(i7 > s7 && (s8 < 0 || i7 < s8), "7번 안");
  // 교구 목장에 속하지 않은 분에게 무엇이 보이는지 — 「교구 밖인데 교구 칸?」으로 읽히지 않게 풀어 쓴다(검토 CM-M3)
  const why = "같은 교구에 같은 이름이 있을 때 가려내려고";
  const others = "교구 목장에 속하지 않은 분(아이·청년·새가족 등)은 부서 칸, 부서가 없으면 교적의 교구 칸";
  const kid = "부서 없는 아이는 가족의 교구 이름";
  for (const i of [i6, i7]) {
    const near = pv.slice(i, i + 200);
    for (const t of [why, others, kid]) assert.ok(near.includes(t), t + " ← " + near);
  }
  assert.ok(!pv.includes("교구 밖의 분은"), "옛 문구(교구 밖의 분은 … 교구 칸)는 남기지 않는다");
  // 6번 — 「7번 · 이름을 누를 때는 …」 참조는 새 설명과 다른 괄호다(새 설명의 일부처럼 읽히지 않게)
  const ref = "(7번 · 이름을 누를 때는 아래 「이름을 누르면」)";
  const r6 = pv.indexOf(ref, s6);
  assert.ok(r6 > s6 && r6 < i6, "6번: 참조 괄호가 새 설명보다 앞에, 따로");
  assert.ok(!pv.slice(i6, s7).includes("7번 ·"), "6번: 새 설명 안에 「7번 ·」 참조가 섞이지 않는다");
});
