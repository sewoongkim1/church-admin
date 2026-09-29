// 이름을 누르면 교적 창(js/menus/bibleevent/person-logic.js) — 순수 함수 시험(계획 Task 16). 창을 여닫는 동작은
// 브라우저에서 본다(Task 16 Step 18 · Task 14 점검표). 이름은 가짜(홍길동 …)만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOT_FOUND, NO_DIRECTORY, CONTACT_NOTE, FAMILY_NOTE, personAttrs, personPayload, nameButtonHtml, rowFromLabel,
  personDecision, candOptions, chooseTitle, basicHtml } from "../js/menus/bibleevent/person-logic.js";
import { whoText } from "../js/menus/bibleevent/roster-logic.js";
import { cardHtml, tableHtml } from "../js/menus/bibleevent/roster-ui.js";
import { affLabel } from "../supabase/functions/church-admin/events-stats.ts";

// 브라우저가 data-* 를 dataset 으로 풀어 주는 것과 같게(글자 참조를 푼다) — Node 에는 DOM 이 없다
const unesc = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, k) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" }[k]));
const datasetOf = (html) => {
  const ds = {};
  for (const [, k, v] of html.matchAll(/data-([a-z]+)="([^"]*)"/g)) ds[k] = unesc(v);
  return ds;
};

test("personAttrs → dataset → personPayload — 이름·구분·소속·세부 넷이 그대로 돌아온다(esc 된 글자 포함)", () => {
  const rows = [
    { name: "홍길동", who_type: "교구", group: "화평", sub: "20" },
    { name: "  홍  길동 ", who_type: "교구", group: "소망", sub: "남성" },
    { name: "홍<길&동>'", who_type: "교회학교", group: "중등부", sub: "3학년" },
    { name: "홍길동".normalize("NFD"), who_type: "", group: "", sub: "" },
  ];
  for (const r of rows) {
    const ds = datasetOf(`<button ${personAttrs(r)}>`);
    assert.equal(ds.act, "person");
    assert.deepEqual(personPayload(ds), { name: r.name.trim().replace(/\s+/g, " "), who_type: r.who_type, group: r.group, sub: r.sub });
  }
  assert.ok(!personAttrs(rows[2]).includes("<길"), "속성 안의 글자는 esc");
  assert.deepEqual(personPayload(undefined), { name: "", who_type: "", group: "", sub: "" });
  // 교적 값·줄 id 같은 다른 칸은 싣지 않는다
  assert.deepEqual(Object.keys(datasetOf(personAttrs({ ...rows[0], id: 7, church: { state: "맞음" }, note: "메모" }))).sort(),
    ["act", "group", "name", "sub", "who"]);
});

test("nameButtonHtml — 단추(type=button · be-name) · 보이는 글자는 이름 또는 이름표 · aria-label · esc", () => {
  const h = nameButtonHtml({ name: "홍<길동>", who_type: "교구", group: "화평", sub: "20" });
  assert.match(h, /^<button type="button" class="be-name" data-act="person" /);
  assert.ok(h.includes("<b>홍&lt;길동&gt;</b>") && !h.includes("<길동>"));
  assert.ok(h.includes('aria-label="홍&lt;길동&gt; — 교적 보기"'));
  const g = nameButtonHtml({ name: "홍길동", who_type: "교구", group: "화평", sub: "20" }, "홍길동 · 화평 20목장");
  assert.ok(g.includes("<b>홍길동 · 화평 20목장</b>") && g.includes('data-name="홍길동"'));
  assert.ok(nameButtonHtml({ name: "" }).includes("<b>이름 없음</b>"));
  assert.ok(!h.includes("\n"));
});

test("rowFromLabel — 서버 affLabel(통계 repeaters 의 소속 한 줄)을 구분·소속·세부로 되읽는다 · 다시 쓰면 같은 글자", () => {
  const rows = [
    { who_type: "교구", group: "화평", sub: "20" }, { who_type: "교구", group: "소망", sub: "남성" },
    { who_type: "교구", group: "새가족", sub: "" }, { who_type: "교구", group: "화평", sub: "" },
    { who_type: "교회학교", group: "청년부", sub: "" }, { who_type: "교회학교", group: "중등부", sub: "3학년" },
    { who_type: "교구", group: "시험", sub: "0" },                 // 모르는 교구라도 숫자 목장이면 교구로
  ];
  for (const r of rows) {
    const label = affLabel({ who_type: r.who_type, group_name: r.group, sub_name: r.sub });
    assert.deepEqual(rowFromLabel(label), r, label);
    assert.equal(whoText(rowFromLabel(label)), whoText(r), label);
  }
  assert.deepEqual(rowFromLabel("(소속 없음)"), { who_type: "", group: "", sub: "" });
  assert.deepEqual(rowFromLabel(""), { who_type: "", group: "", sub: "" });
  assert.deepEqual(rowFromLabel(undefined), { who_type: "", group: "", sub: "" });
});

test("personDecision — 오류 · 명부 없음 · 찾은 분 없음 · 작은 창 · 곧바로 「자세히」 · 고르기", () => {
  assert.deepEqual(personDecision({ ok: false, error: "forbidden" }), { kind: "error" });
  assert.deepEqual(personDecision(null), { kind: "error" });
  assert.deepEqual(personDecision({ ok: true, mode: "none" }), { kind: "none" });
  assert.deepEqual(personDecision({ ok: true, mode: "full", pick: null, candidates: [] }), { kind: "empty" });
  assert.deepEqual(personDecision({ ok: true, mode: "basic", pick: null, people: [], church: { state: "없음", reason: "" } }), { kind: "empty" });
  assert.deepEqual(personDecision({ ok: true, mode: "basic", pick: 0, people: [{ name: "홍길동" }] }), { kind: "basic" });
  assert.deepEqual(personDecision({ ok: true, mode: "full", pick: 0, candidates: [{ person_id: 12 }] }), { kind: "open", id: "12" });
  assert.deepEqual(personDecision({ ok: true, mode: "full", pick: null, candidates: [{ person_id: 12 }, { person_id: 13 }] }), { kind: "choose" });
  assert.deepEqual(personDecision({ ok: true, mode: "full", pick: 5, candidates: [{ person_id: 12 }] }), { kind: "choose" });
  assert.deepEqual(personDecision({ ok: true, mode: "이상한" }), { kind: "error" });
});

test("candOptions · chooseTitle — 고르개 한 줄 = 이름 · 「소속 · 직분」 · 값은 교인ID 글자 · 스무 분을 넘으면 제목에 「앞 20분」", () => {
  assert.deepEqual(candOptions([{ person_id: 12, name: "홍길동", label: "화평 20목장", position: "집사" },
    { person_id: 13, name: "홍길동", label: "(소속 없음)", position: "" }]), [
    { value: "12", label: "홍길동", hint: "화평 20목장 · 집사" },
    { value: "13", label: "홍길동", hint: "(소속 없음)" }]);
  assert.deepEqual(candOptions(undefined), []);
  const c = (n) => Array.from({ length: n }, (_, i) => ({ person_id: 100 + i, name: "홍길동", label: "화평 1목장", position: "" }));
  assert.equal(chooseTitle("홍길동", { candidates: c(2), total: 2 }), "홍길동 — 어느 분인가요?");
  assert.equal(chooseTitle("홍길동", { candidates: c(20), total: 21 }), "홍길동 — 어느 분인가요? (같은 이름 21분 중 앞 20분)");
  assert.equal(chooseTitle("홍길동", { candidates: c(2) }), "홍길동 — 어느 분인가요?", "total 이 없으면 보여 주는 수로");
});

test("basicHtml — 고른 분 한 분 · 동명이인이면 모두와 안내 · 교적 표시 · 연락처 안내 · 줄바꿈 글자 없음 · esc", () => {
  const P = (o) => ({ name: "홍길동", who_type: "교구", group: "화평", sub: "20", position: "집사", ...o });
  const one = basicHtml({ ok: true, mode: "basic", pick: 0, people: [P()], church: { state: "맞음", reason: "" } });
  assert.equal((one.match(/<li /g) || []).length, 1);
  assert.ok(one.includes("화평 20목장") && one.includes("집사") && one.includes("교적 ✓"));
  assert.ok(one.includes(CONTACT_NOTE));
  assert.ok(!one.includes("같은 이름이"));
  const many = basicHtml({ ok: true, mode: "basic", pick: null, church: { state: "확인 필요", reason: "같은 이름 2명" },
    people: [P({ name: "홍<길동>" }), P({ who_type: "", group: "", sub: "", position: "" })] });
  assert.equal((many.match(/<li /g) || []).length, 2);
  assert.ok(many.includes("같은 이름이 <b>2분</b>") && many.includes("교적 확인") && many.includes("같은 이름 2명"));
  assert.ok(many.includes("홍&lt;길동&gt;") && !many.includes("<길동>"));
  assert.ok(many.includes("소속을 정하지 못했어요"));
  for (const h of [one, many]) assert.ok(!/[\r\n]/.test(h), "dialog 본문은 pre-line — 줄바꿈 글자를 넣지 않는다");
  assert.ok(!basicHtml({ pick: 0, people: [P()], church: null }).includes("맞대 보면"), "교적 표시가 없으면(null) 그 줄도 없다");
  // 스무 분으로 잘린 목록 — 수는 서버 total(자르기 전)로 적고 「앞 20분만」을 붙인다(옆 교적 표시 「같은 이름 21명」과 같게)
  const capped = basicHtml({ ok: true, mode: "basic", pick: null, total: 21, church: { state: "확인 필요", reason: "같은 이름 21명" },
    people: Array.from({ length: 20 }, () => P()) });
  assert.equal((capped.match(/<li /g) || []).length, 20);
  assert.ok(capped.includes("같은 이름이 <b>21분</b> 있어요(앞 20분만 보여요)") && capped.includes("같은 이름 21명"), capped.slice(0, 200));
  assert.ok(many.includes("같은 이름이 <b>2분</b> 있어요 — "), "total 이 없으면 받은 수 그대로 · 「앞 N분만」 없음");
});

test("문구 — 설계 §3 그대로 · 「명부 없음」과 「찾지 못함」을 가른다", () => {
  assert.equal(CONTACT_NOTE, "연락처·사진은 교인명부 담당자만 볼 수 있어요");
  assert.equal(NOT_FOUND, "교인명부에서 찾지 못했어요");
  assert.notEqual(NO_DIRECTORY, NOT_FOUND);
  assert.ok(FAMILY_NOTE.includes("교인 찾기"));
});

test("📋 회차·명단의 카드·표 — 이름이 교적 창 단추(명단 줄의 넷을 싣는다)", () => {
  const ROW = { id: 7, who_type: "교구", group: "화평", sub: "20", name: "홍<길동>", position: "집사", note: "", source: "import",
    hasUser: false, at: "2026-10-01", updated_at: "u", church: null };
  for (const h of [cardHtml(ROW, false), tableHtml([{ key: "교구|화평", label: "화평", rows: [ROW] }], new Set())]) {
    const btn = h.match(/<button type="button" class="be-name"[^>]*>/);
    assert.ok(btn, "이름 단추가 없다");
    assert.deepEqual(personPayload(datasetOf(btn[0])), { name: "홍<길동>", who_type: "교구", group: "화평", sub: "20" });
    assert.ok(h.includes("<b>홍&lt;길동&gt;</b>"));
  }
});

test("화면 모듈이 Node 에서 읽힌다 — 교인명부 openPerson 을 내보냈고, 두 화면이 새 이름을 들인다", async () => {
  const pop = await import("../js/menus/bibleevent/person-popup.js");
  const search = await import("../js/menus/people/search.js");
  assert.equal(typeof pop.openChurchPerson, "function");
  assert.equal(typeof search.openPerson, "function");
  assert.equal(typeof (await import("../js/menus/bibleevent/roster.js")).render, "function");
  assert.equal(typeof (await import("../js/menus/bibleevent/history.js")).render, "function");
});
