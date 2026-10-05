// 교인명부 「자세히」 창 사역·성경필사 탭 — 순수 시험(preflight 가 돈다 · 2026-10-01). 이름은 지어낸 것.
import { test } from "node:test";
import assert from "node:assert/strict";
import { HIST_TABS, tabOf, tabsHtml, ministryText, statusChip, bibleText, histPanelHtml, unlinkedHtml, histTotal, rowKey,
  linkDoneText, LINK_STALE, EDU_TAB, hasEdu, tabsFor, linksTab, keepEdu, eduChip, eduMeta, eduPanelHtml }
  from "../js/menus/people/person-history.js";
import { personDetailHtml } from "../js/menus/people/person-detail.js";

const M = (o = {}) => ({ kind: "order", row: 1, year: 2027, committee: "예배위원회", team: "안내팀", option: "", role_title: "",
  status: "임명확정", how: "auto", ...o });
const B = (o = {}) => ({ kind: "signup", row: 7, event_id: "lent-2026", title: "2026 사순절 마가복음 성경필사 완서자", short_title: "",
  opens_on: "2026-03-01", who_type: "교구", group: "화평", sub: "20", position: "집사", how: "auto", ...o });
const H = (ministry = [M()], bible = [B()]) => ({ counts: { ministry: ministry.length, bible: bible.length }, ministry, bible });
const noNL = (s) => assert.equal(/[\r\n]/.test(s), false, "줄바꿈 글자");
const noBad = (s) => {
  assert.equal(/\sdata-v=/.test(s), false, "data-v — dialog 가 닫기로 받는다");
  assert.equal(/\sdata-fam(-all)?=/.test(s), false, "data-fam — 가족 단추로 읽힌다");
};

test("tabsHtml — 셋 · 고른 탭 · 수 · 줄바꿈·data-v·data-fam 없음", () => {
  assert.deepEqual(HIST_TABS.map(([k]) => k), ["church", "ministry", "bible"]);
  const html = tabsHtml(H([M(), M({ row: 2 })], [B()]), "ministry");
  noNL(html); noBad(html);
  assert.ok(html.includes('role="tablist"'));
  assert.equal((html.match(/role="tab"/g) || []).length, 3);
  assert.ok(html.includes('data-pd-tab="ministry" aria-selected="true"'));
  assert.ok(html.includes('data-pd-tab="church" aria-selected="false"'));
  assert.ok(html.includes("🤝 사역 <em>2</em>"));
  assert.ok(html.includes("✍️ 성경필사 <em>1</em>"));
  assert.ok(tabsHtml(H(), undefined).includes('data-pd-tab="church" aria-selected="true"'));
  assert.equal(tabOf("x"), "church");
  assert.equal(histTotal(H([M()], [])), 1);
  assert.equal(histTotal(null), 0);
});

test("ministryText · statusChip — 「위원회 · 팀 (선택) · 직책」 · 신청 현황과 같은 칩", () => {
  assert.equal(ministryText(M({ option: "T&T", role_title: "팀장" })), "예배위원회 · 안내팀 (T&T) · 팀장");
  assert.equal(ministryText(M()), "예배위원회 · 안내팀");
  assert.equal(ministryText(M({ committee: "" })), "안내팀");
  assert.equal(statusChip("신청완료"), '<span class="mn-rowi-st s1">신청</span>');
  assert.equal(statusChip("접수완료"), '<span class="mn-rowi-st s2">접수</span>');
  assert.equal(statusChip("임명확정"), '<span class="mn-rowi-st s3">임명</span>');
  assert.equal(statusChip("취소"), '<span class="mn-rowi-st s4">취소</span>');
  assert.ok(statusChip("<b>").includes("&lt;b&gt;"));
});

test("bibleText — 👤 통계와 같은 회차 이름(statLabel) · 그때 소속 · 직분", () => {
  assert.equal(bibleText(B()), "2026 사순절 마가복음 · 화평 20목장 · 집사");
  assert.equal(bibleText(B({ sub: "남성", position: "" })), "2026 사순절 마가복음 · 화평 남성");
  assert.equal(bibleText(B({ who_type: "교회학교", group: "중등부", sub: "" })), "2026 사순절 마가복음 · 중등부 · 집사");
});

test("histPanelHtml — 해는 처음 한 번 · 줄마다 「풀기」 · 사람이 이음 · 빈 칸 · esc", () => {
  const html = histPanelHtml("ministry", H([M({ row: 1 }), M({ row: 2, team: "찬양팀", how: "manual" }), M({ row: 3, year: 2026 })], []), null);
  noNL(html); noBad(html);
  assert.equal((html.match(/<span class="pd-hy">2027<\/span>/g) || []).length, 1);
  assert.equal((html.match(/<span class="pd-hy"><\/span>/g) || []).length, 1);
  assert.ok(html.includes('<span class="pd-hy">2026</span>'));
  assert.equal((html.match(/data-pd-act="unlink"/g) || []).length, 3);
  assert.equal((html.match(/사람이 이음/g) || []).length, 1);
  assert.ok(histPanelHtml("bible", H([], []), null).includes("이어진 성경필사 기록이 없어요"));
  assert.ok(histPanelHtml("ministry", H([], []), null).includes("이어진 사역 기록이 없어요"));
  const bad = histPanelHtml("ministry", H([M({ committee: '<b>"x' })], []), null);
  assert.ok(bad.includes("&lt;b&gt;&quot;x"));
  assert.equal(bad.includes('<b>"x'), false);
});

test("histPanelHtml — 「풀기」 확인은 그 줄 안에서(창 위에 창 없음) · 다시 붙었으면 「이분 아님」을 권한다", () => {
  const c = histPanelHtml("ministry", H([M({ row: 5 }), M({ row: 6 })], []), { confirm: { key: rowKey("order", 5), relinked: false } });
  noNL(c); noBad(c);
  assert.ok(c.includes("연결을 끊을까요?"));
  for (const a of ["unlink-yes", "unlink-no", "notme"]) assert.equal((c.match(new RegExp(`data-pd-act="${a}"`, "g")) || []).length, 1, a);
  assert.equal((c.match(/data-pd-act="unlink"/g) || []).length, 1, "다른 줄은 그대로 「풀기」");
  const r = histPanelHtml("ministry", H([M({ row: 5 })], []), { confirm: { key: rowKey("order", 5), relinked: true } });
  assert.ok(r.includes("규칙이 다시 이분께 이었어요"));
  assert.equal(r.includes('data-pd-act="unlink-yes"'), false);
  assert.ok(r.includes('data-pd-act="notme"'));
});

// ⚠️ 2026-10-01 친구 결정(브리프 작성 뒤 바뀜 — v2 설계 §4 88행): 「이분 아님」으로 둔 기록(link_how='none')은
// 「아직 안 이어진 기록」과 **따로 묶어 접어 둔다** — 「이분 아님으로 둔 기록 N건 ▸」 자체가 기본 접힘인 별도 펼치기라,
// 위 묶음을 펼쳐도(open[tab]) 이 묶음은 그대로 접혀 있다(open[`${tab}Notme`] 가 따로 있어야 펼쳐진다).
test("unlinkedHtml — 부르기 전 없음 · 찾는 중 · 다시 · 0건 · 접힘/펼침 · 「이분 아님」으로 둔 기록은 따로(별도 펼치기)", () => {
  assert.equal(unlinkedHtml("ministry", { state: "idle" }), "");
  assert.ok(unlinkedHtml("ministry", { state: "loading" }).includes("찾는 중"));
  assert.ok(unlinkedHtml("ministry", { state: "error" }).includes('data-pd-act="unlinked-retry"'));
  const rows = [
    { kind: "order", row: 9, year: 2027, committee: "예배위원회", team: "찬양팀", option: "", status: "신청완료", who: "기쁨 5목장", position: "집사", how: "auto" },
    { kind: "order", row: 10, year: 2026, committee: "교육위원회", team: "유년부", option: "", status: "임명확정", who: "소망 3목장", position: "집사", how: "none" },
    { ...B({ row: 11, group: "기쁨", sub: "5" }) },
  ];
  assert.ok(unlinkedHtml("bible", { state: "ready", open: {}, rows: [] }).includes("아직 안 이어진 기록은 없어요"));

  // 둘 다 접힘 — 아무 「이분 것」 단추도 없다. 두 묶음 제목은 보인다(펼치기 전).
  const closed = unlinkedHtml("ministry", { state: "ready", open: { ministry: false }, rows });
  noNL(closed); noBad(closed);
  assert.ok(closed.includes("이름이 같고 아직 안 이어진 기록 1건"));
  assert.ok(closed.includes("「이분 아님」으로 둔 기록 1건"));
  assert.ok(closed.includes('aria-expanded="false"'));
  assert.equal(closed.includes('data-pd-act="link"'), false);

  // 위 묶음만 펼침(open.ministry=true) — 「이분 아님」 묶음은 그대로 접힌 채(open.ministryNotme 없음)
  const open = unlinkedHtml("ministry", { state: "ready", open: { ministry: true }, rows });
  assert.equal((open.match(/data-pd-act="link"/g) || []).length, 1, "열린 줄(row9)만 — 이분 아님 묶음은 접힌 채");
  assert.ok(open.includes("2027 · 예배위원회 · 찬양팀 · 기쁨 5목장 · 집사"));
  assert.ok(open.includes("「이분 아님」으로 둔 기록 1건"));
  assert.ok(open.includes('data-pd-act="more-notme" aria-expanded="false"'), "이분 아님 묶음은 독립된 펼치기");
  assert.equal(open.includes("소망 3목장"), false, "이분 아님 묶음을 안 펼쳤으면 그 줄은 안 보인다");

  // 「이분 아님」 묶음도 따로 펼침 — 그제서야 그 줄의 「이분 것」이 보인다
  const both = unlinkedHtml("ministry", { state: "ready", open: { ministry: true, ministryNotme: true }, rows });
  assert.equal((both.match(/data-pd-act="link"/g) || []).length, 2);
  assert.ok(both.includes("소망 3목장"));
  assert.ok(both.includes('data-pd-act="more-notme" aria-expanded="true"'));

  // bible 탭 — 이 rows 에는 「이분 아님」 성경필사 줄이 없다(묶음 자체가 안 뜬다)
  const bible = unlinkedHtml("bible", { state: "ready", open: { bible: true }, rows });
  assert.equal((bible.match(/data-pd-act="link"/g) || []).length, 1);
  assert.equal(bible.includes("이분 아님"), false);
});

test("personDetailHtml — 탭 셋 · 고른 칸만 켜짐 · 이력이 있으면 좁히지 않는다 · history 가 없으면(옛 서버) 예전 그대로", () => {
  const P = { name: "홍길동", kind2: "장년", registered: "2026-08-02" };      // 칸 둘 → 이력이 없으면 좁은 창(pd-few)
  const withH = personDetailHtml(P, [], H(), "bible");
  noNL(withH); noBad(withH);
  assert.ok(withH.includes('class="pd-wrap pd-tabbed"'), "이력이 있으면 좁히지 않는다");
  assert.ok(withH.includes('data-pd-panel="church" tabindex="0" data-off'));
  assert.ok(withH.includes('data-pd-panel="ministry" tabindex="0" data-off'));
  assert.ok(withH.includes('data-pd-panel="bible" tabindex="0">'));
  assert.ok(personDetailHtml(P, [], H([], [])).includes('class="pd-wrap pd-few pd-tabbed"'), "이력 0 이면 예전처럼 좁힌다(탭은 그대로)");
  assert.equal(personDetailHtml(P, []).includes("pd-tabs"), false);
  assert.ok(personDetailHtml(P, []).includes('class="pd-wrap pd-few"'));
});

// 2026-10-02 가지 마지막 검토 — 쓰기는 됐는데 서버가 탭 자료(history) 다시 읽기에 실패하면 history 만 빠져 온다
test("linkDoneText — 셋의 알림 · 풀었는데 다시 붙으면 「이분 아님」 권함 · history 가 없으면 「창을 다시 열면」을 덧붙인다", () => {
  const h = H();
  assert.equal(linkDoneText("manual", { ok: true, history: h }), "이분 기록으로 이었어요");
  assert.equal(linkDoneText("none", { ok: true, history: h }), "이분 기록이 아니라고 적었어요");
  assert.equal(linkDoneText("auto", { ok: true, relinked: false, history: h }), "연결을 끊었어요");
  assert.ok(linkDoneText("auto", { ok: true, relinked: true, history: h }).includes("「이분 아님」"));
  assert.equal(linkDoneText("manual", { ok: true, relinked: true, history: h }), "이분 기록으로 이었어요", "relinked 는 풀기만");
  for (const how of ["manual", "none", "auto"]) {
    const s = linkDoneText(how, { ok: true, relinked: false });
    assert.ok(s.endsWith(LINK_STALE), how + " — history 없음");
    assert.equal(linkDoneText(how, { ok: true, history: null }).endsWith(LINK_STALE), true);
    noNL(s);
  }
  assert.ok(linkDoneText("auto", { ok: true, relinked: true }).includes("「이분 아님」"));
});

// ---------- 🎓 교육 탭(교육신청 4단계 B · 2026-10-06) — 서버 칸 지도 edu-rules.ts eduTabItems ----------
const E = (o = {}) => ({ term: "2027 상반기", title: "제자훈련 1단계", status: "confirmed", statusLabel: "확정", attendPct: 80, certNo: null,
  certRevoked: false, ...o });
const HE = (edu = [E()], ministry = [M()], bible = [B()]) => ({ ...H(ministry, bible), counts: { ministry: ministry.length, bible: bible.length,
  education: edu.length }, education: edu });

test("교육 탭 — 서버가 education(배열)을 줄 때만 넷째 탭 · 고를 수 있는 탭 · 「아직 안 이어진 기록」은 사역·성경필사만", () => {
  assert.deepEqual(EDU_TAB, ["education", "🎓 교육"]);
  assert.equal(hasEdu(HE()), true);
  assert.equal(hasEdu(H()), false);
  assert.equal(hasEdu({ ...H(), education: null }), false);
  assert.deepEqual(tabsFor(H()).map(([k]) => k), ["church", "ministry", "bible"]);
  assert.deepEqual(tabsFor(HE()).map(([k]) => k), ["church", "ministry", "bible", "education"]);
  assert.equal(tabOf("education", HE()), "education");
  assert.equal(tabOf("education", H()), "church", "교육 칸이 없는 창(옛 서버·교육 읽기 실패)에서는 교적");
  assert.equal(tabOf("education"), "church");
  assert.equal(tabOf("bible", HE()), "bible");
  assert.deepEqual(["church", "ministry", "bible", "education"].map(linksTab), [false, true, true, false]);
  assert.equal(histTotal(HE([E(), E()], [], [])), 2, "교육 기록도 센다(있으면 창을 좁히지 않는다)");
});

test("교육 탭 줄 — 넷이면 pd-tabs4 · 「🎓 교육 N」 · 고른 탭 · 줄바꿈·data-v·data-fam 없음", () => {
  const html = tabsHtml(HE([E(), E({ title: "교사 대학" })]), "education");
  noNL(html); noBad(html);
  assert.ok(html.includes('class="pd-tabs pd-tabs4"'));
  assert.ok(html.includes('aria-label="교적 · 사역 · 성경필사 · 교육"'));
  assert.equal((html.match(/role="tab"/g) || []).length, 4);
  assert.ok(html.includes("🎓 교육 <em>2</em>"));
  assert.ok(html.includes('data-pd-tab="education" aria-selected="true" aria-controls="pd-panel-education" tabindex="0"'));
  assert.ok(tabsHtml(H(), "education").includes('data-pd-tab="church" aria-selected="true"'), "교육 칸이 없으면 교적이 고른 탭");
  assert.equal(tabsHtml(H(), "church").includes("pd-tabs4"), false);
});

test("교육 칸 — 학기마다 머리 · 과정 · 상태 칩(신청 파랑·대기 노랑·확정 초록·취소·반려 회색) · 출석률(없으면 —) · 수료번호(취소됨) · 빈 칸 · esc", () => {
  const items = [E({ certNo: "고척-2027-0001" }), E({ title: "교사 대학", status: "waitlisted", statusLabel: "대기", attendPct: null }),
    E({ term: "2026 하반기", title: "교사 연수", status: "cancelled", statusLabel: "취소", attendPct: 0, certNo: "고척-2026-0003", certRevoked: true }),
    E({ term: "", title: "새가족반", status: "declined", statusLabel: "반려", attendPct: 100 })];
  const html = histPanelHtml("education", HE(items), { unlinked: { state: "ready", rows: [], open: {} } });
  noNL(html); noBad(html);
  assert.equal(html, eduPanelHtml(items), "교육 칸에는 「아직 안 이어진 기록」이 붙지 않는다");
  assert.equal((html.match(/class="pd-eh"/g) || []).length, 3, "학기 머리 셋(2027 상반기 · 2026 하반기 · 학기 없음)");
  assert.ok(html.includes('<p class="pd-eh">2027 상반기</p>') && html.includes('<p class="pd-eh">학기 없음</p>'));
  assert.ok(html.includes("출석률 80% · 수료번호 고척-2027-0001"));
  assert.ok(html.includes("출석률 —"));
  assert.ok(html.includes("출석률 0% · 수료번호 고척-2026-0003 (취소됨)"));
  assert.ok(html.includes('<span class="mn-rowi-st s3">확정</span>') && html.includes('<span class="mn-rowi-st s2">대기</span>'));
  assert.ok(html.includes('<span class="mn-rowi-st s4">취소</span>') && html.includes('<span class="mn-rowi-st s4">반려</span>'));
  assert.equal((html.match(/pd-er off/g) || []).length, 2, "취소·반려 줄은 흐리게");
  assert.equal(/data-pd-act/.test(html), false, "교육 줄에는 잇기·풀기 단추가 없다");
  assert.equal(eduChip("applied", "신청"), '<span class="mn-rowi-st s1">신청</span>');
  assert.ok(histPanelHtml("education", HE([]), null).includes("이어진 교육 기록이 없어요"));
  assert.ok(eduPanelHtml(undefined).includes("이어진 교육 기록이 없어요"));
  const bad = eduPanelHtml([E({ title: '<img src=x onerror="1">', term: "<b>학기</b>", certNo: '"><script>' })]);
  assert.equal(/<img|<script|<b>/.test(bad), false, "서버 글자는 esc");
  assert.equal(eduMeta({ attendPct: "80" }), "출석률 —", "숫자가 아니면 —");
});

test("keepEdu — 잇기 뒤 서버 답에 교육 칸이 빠지면 보던 교육 칸을 그대로(탭이 사라지지 않게) · 있으면 새 것 · 처음부터 없으면 그대로", () => {
  const prev = HE([E()]), next = H([M({ row: 9 })], []);
  const k = keepEdu(prev, next);
  assert.deepEqual(k.education, prev.education);
  assert.equal(k.counts.education, 1);
  assert.deepEqual(k.ministry, next.ministry);
  assert.equal(keepEdu(prev, HE([])).education.length, 0, "새 답에 교육 칸이 있으면 새 것");
  assert.equal(keepEdu(H(), next), next);
  assert.equal(keepEdu(prev, null), null);
});

test("personDetailHtml — 교육 칸이 있으면 탭 넷 · 교육 칸 · 교육 탭으로 열기 · 교육 기록만 있어도 창을 좁히지 않는다", () => {
  const P = { name: "홍길동", kind2: "장년", registered: "2026-08-02" };
  const html = personDetailHtml(P, [], HE([E()], [], []), "education");
  noNL(html); noBad(html);
  assert.ok(html.includes('class="pd-wrap pd-tabbed"'), "교육 기록이 있으면 좁히지 않는다");
  assert.ok(html.includes('data-pd-panel="education" tabindex="0">'), "교육 칸이 켜진 채");
  assert.ok(html.includes('data-pd-panel="church" tabindex="0" data-off'));
  assert.ok(html.includes("제자훈련 1단계"));
  const old = personDetailHtml(P, [], H(), "education");
  assert.equal(old.includes('data-pd-panel="education"'), false, "교육 칸이 없으면 칸도 없다");
  assert.ok(old.includes('data-pd-panel="church" tabindex="0">'), "보던 탭이 교육이어도 교적으로");
});
