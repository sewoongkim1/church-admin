// 사역신청·담당자 이름을 누르면 교적 창(js/menus/ministry/person-link.js) — 순수 함수 시험(2026-09-30 친구 요청).
// 창을 여닫는 동작(뒤로 가기·잠금·가족)은 성경필사와 같은 person-popup.js 라 브라우저에서 본다. 이름·번호는 가짜(홍길동 · 010-0000-0000)만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PERSON_ACTION, personLinkHtml, rowAsk, paperAsk, memberAsk } from "../js/menus/ministry/person-link.js";
import { cardHtml, tableHtml, groupsHtml } from "../js/menus/ministry/status-ui.js";
import { label } from "../js/menus/ministry/appointed.js";
import { ACTION_ROLES } from "../supabase/functions/church-admin/authz.ts";
import { ministryPaperOne } from "../supabase/functions/church-admin/paper.ts";
import { personAsk } from "../supabase/functions/church-admin/events-person.ts";
import { applicantFromPaper, applicantFromSignup } from "../supabase/functions/church-admin/people-match.ts";

const PHONE = "010-0000-0000";
// 신청 현황 줄(status.js normalize 모양)
const ROW = (o = {}) => ({ id: 7, at: "2026-10-01", who: "화평 20목장", name: "홍길동", church: null, status: "신청완료", canPush: false,
  notified_at: null, phone: PHONE, position: "집사", note: "", source: "app", committee: "제자양육부", team: "신앙운동", option: "", ...o });
// 이름 단추의 여는 태그들 — 번호가 여기(data-*·aria-label)에 실리면 안 된다
const nameTags = (h) => [...h.matchAll(/<button[^>]*data-person[^>]*>/g)].map((m) => m[0]);
const attrsOf = (tag) => [...tag.matchAll(/\s(data-[a-z-]+)="/g)].map((m) => m[1]);

test("PERSON_ACTION — ministryPerson · 서버 권한표에 사역신청 역할로 있다", () => {
  assert.equal(PERSON_ACTION, "ministryPerson");
  assert.equal(ACTION_ROLES[PERSON_ACTION], "ministry");
});

test("personLinkHtml — 성경필사와 같은 be-name 단추 · 열쇠만 싣는다 · aria-label · esc · 줄바꿈 없음", () => {
  const h = personLinkHtml(7, "홍<길동>\"");
  assert.equal(h, `<button type="button" class="be-name" data-person="7" aria-label="홍&lt;길동&gt;&quot; — 교적 보기">` +
    `<b>홍&lt;길동&gt;&quot;</b></button>`);
  assert.deepEqual(attrsOf(nameTags(h)[0]), ["data-person"]);
  assert.ok(personLinkHtml('a"b', "홍길동").includes('data-person="a&quot;b"'), "열쇠도 esc");
  assert.ok(personLinkHtml(" 12 ", "  홍  길동 ").includes("<b>홍 길동</b>"), "보이는 이름은 한 줄로 다듬는다");
  assert.ok(!/[\r\n]/.test(h));
});

test("personLinkHtml — 칩(임명현황 「이름-화평20」) · 이름이 비면 단추가 아니라 전과 같은 글자", () => {
  const lb = label({ name: "홍길동", who: "화평 20목장" });
  assert.equal(personLinkHtml(3, "홍길동", { text: lb, chip: true }),
    `<button type="button" class="ap-p mn-pl-chip" data-person="3" aria-label="홍길동-화평20 — 교적 보기"><b>홍길동-화평20</b></button>`);
  // 이름 없는 줄 — 칩은 옛 <span class="ap-p"> · 이름 칸은 <b> · 종이 명단은 「(이름 없음)」 그대로
  assert.equal(personLinkHtml(0, "", { text: label({ name: "", who: "화평 20목장" }), chip: true }), `<span class="ap-p">이름 없음-화평20</span>`);
  assert.equal(personLinkHtml(0, "", { text: "(이름 없음)" }), "<b>(이름 없음)</b>");
  assert.equal(personLinkHtml(0, "  "), "<b>이름 없음</b>");
  assert.equal(personLinkHtml(0, "<x>", { text: "" }).includes("<b>이름 없음</b>"), true, "보일 글자가 비면 「이름 없음」");
});

test("rowAsk — 신청 현황 줄 → 이름·소속 한 줄·번호(있을 때만) · 임명현황 줄(번호 칸 없음)은 둘만", () => {
  assert.deepEqual(rowAsk(ROW()), { name: "홍길동", who: "화평 20목장", phone: PHONE });
  assert.deepEqual(rowAsk(ROW({ phone: "" })), { name: "홍길동", who: "화평 20목장" }, "결정 뒤 서버가 지운 번호는 보내지 않는다");
  assert.deepEqual(rowAsk({ name: " 홍길동 ", who: "중등부  3학년", committee: "x", team: "y", at: "", decided_at: null, source: "app" }),
    { name: "홍길동", who: "중등부 3학년" });
  assert.deepEqual(rowAsk(undefined), { name: "", who: "" });
  // 다른 칸(id·교적 표시·메모·사역)은 싣지 않는다
  assert.deepEqual(Object.keys(rowAsk(ROW({ note: "메모", church: { state: "맞음" } }))).sort(), ["name", "phone", "who"]);
});

test("paperAsk — 서버가 살펴 준 줄(ministryPaperOne) → 교구·목장·이름·번호 · 서버가 되읽으면 명단 교적 표시와 같은 신청자", () => {
  const row = ministryPaperOne({ gu: "화평", mok: "20", name: "홍길동", position: "집사", phone: PHONE, team: "신앙운동" }, 0);
  const a = paperAsk(row);
  assert.deepEqual(a, { name: "홍길동", who_type: "교구", group: "화평", sub: "20", phone: row.phone });
  // index.ts ministryPerson 이 who 없이 받은 줄을 읽는 식(applicantFromSignup(personAsk) + 번호) = ministryPaper 가 교적 표시에 쓴
  // applicantFromPaper — 번호는 서버가 숫자만 남겨 따로 붙이므로 번호 칸은 빼고 맞댄다
  const { phone: _p, ...paperSide } = applicantFromPaper(row);
  assert.deepEqual(applicantFromSignup(personAsk(a, a.name)), { ...paperSide, phone: "" });
  assert.deepEqual(paperAsk({ gu: "소망", mok: "", name: "홍길동", phone: "" }),
    { name: "홍길동", who_type: "교구", group: "소망", sub: "" });
});

test("memberAsk — 담당자 줄 → 교구·목장 또는 교회학교·부서·학년(번호 없음) · 서버가 되읽는 신청자", () => {
  const gu = { id: "m1", type: "교구", gu: "화평", mok: "20", bu: "", grade: "", name: "홍길동", kakao_nickname: "별명" };
  const sc = { id: "m2", type: "교회학교", gu: "", mok: "", bu: "중등부", grade: "3학년", name: "홍길동" };
  assert.deepEqual(memberAsk(gu), { name: "홍길동", who_type: "교구", group: "화평", sub: "20" });
  assert.deepEqual(memberAsk(sc), { name: "홍길동", who_type: "교회학교", group: "중등부", sub: "3학년" });
  const back = (m) => { const a = memberAsk(m); return applicantFromSignup(personAsk(a, a.name)); };
  assert.deepEqual(back(gu), { type: "교구", gu: "화평", mok: 20, bu: "", name: "홍길동", phone: "" });
  assert.deepEqual(back({ ...gu, mok: "20목장" }).mok, 20, "「20목장」으로 적은 분도 같은 목장");
  assert.deepEqual(back(sc), { type: "교회학교", gu: "", mok: null, bu: "중등부", name: "홍길동", phone: "" });
});

test("📋 신청 현황 카드·표 — 이름이 단추(열쇠 = 신청 id) · 번호는 단추에 없다 · 사람별 카드는 머리에 이름이 있어 단추가 없다", () => {
  const r = ROW({ id: 41 });
  for (const h of [cardHtml(r, "", ""), cardHtml(r, "team", ""), tableHtml([r], new Map())]) {
    const tags = nameTags(h);
    assert.equal(tags.length, 1);
    assert.ok(tags[0].startsWith('<button type="button" class="be-name" data-person="41"'));
    assert.deepEqual(attrsOf(tags[0]), ["data-person"]);
    assert.ok(!/0000/.test(tags[0]), "번호를 단추에 싣지 않는다");
    assert.ok(h.includes("<b>홍길동</b></button>"));
  }
  assert.equal(nameTags(cardHtml(r, "person", "")).length, 0);
  assert.equal(nameTags(cardHtml(ROW({ name: "" }), "", "")).length, 0, "이름 없는 건은 단추로 만들지 않는다");
});

test("📋 사람별 묶음 머리 — 이름이 단추 · 열쇠는 번호가 남은 건(없으면 첫 건) · 사역별은 묶음 안 카드마다", () => {
  const decided = ROW({ id: 1, phone: "", status: "임명확정", team: "가" }), open = ROW({ id: 2, team: "나" });
  const h = groupsHtml([decided, open], "person", new Set(), new Map());
  const head = h.slice(h.indexOf("<summary>"), h.indexOf("</summary>"));
  assert.deepEqual(nameTags(head).map((t) => /data-person="([^"]*)"/.exec(t)[1]), ["2"]);
  const h2 = groupsHtml([ROW({ id: 5, phone: "" }), ROW({ id: 6, phone: "", team: "나" })], "person", new Set(), new Map());
  assert.ok(nameTags(h2.slice(0, h2.indexOf("</summary>")))[0].includes('data-person="5"'));
  const team = groupsHtml([ROW({ id: 8 }), ROW({ id: 9, name: "홍길순", who: "믿음 3목장" })], "team", new Set(), new Map());
  assert.deepEqual(nameTags(team).map((t) => /data-person="([^"]*)"/.exec(t)[1]).sort(), ["8", "9"]);
  for (const t of [...nameTags(h), ...nameTags(team)]) assert.deepEqual(attrsOf(t), ["data-person"]);
});

test("화면 모듈이 Node 에서 읽힌다 — 네 화면이 교적 창을 들인다", async () => {
  for (const p of ["../js/menus/ministry/status.js", "../js/menus/ministry/appointed.js", "../js/menus/ministry/paper.js",
    "../js/menus/system/members.js"]) {
    assert.equal(typeof (await import(p)).render, "function", p);
  }
});

// person-popup.js 는 DOM 을 쓰므로 필요한 것만 흉내 낸다 — 서버가 「권한 없음」을 돌려주면 창 없이 알림 한 줄로 끝난다(요청 칸만 본다).
test("openChurchPerson — evPerson 에는 지금과 똑같이 넷만 · ministryPerson 은 who·phone 을 더한다(빈 값은 뺀다)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });   // 알림(toast)의 4초 타이머가 시험을 붙잡지 않게
  const g = globalThis, keep = { window: g.window, document: g.document, Element: g.Element };
  const toastEl = { textContent: "", hidden: true, setAttribute() {} };
  g.window = { addEventListener() {} };
  g.document = { addEventListener() {}, querySelector: (q) => (q === ".adm-toast" ? toastEl : null) };
  g.Element = class {};
  try {
    const { openChurchPerson } = await import("../js/menus/bibleevent/person-popup.js");
    const seen = [];
    const call = async (action, body) => { seen.push([action, body]); return { ok: false, error: "forbidden" }; };
    const base = { name: "홍길동", who_type: "교구", group: "화평", sub: "20" };
    await openChurchPerson({ call, ...base });
    await openChurchPerson({ call, ...base, who: "화평 20목장", phone: PHONE });           // 성경필사 — who·phone 을 줘도 넷만
    await openChurchPerson({ call, action: PERSON_ACTION, ...rowAsk(ROW()) });
    await openChurchPerson({ call, action: PERSON_ACTION, ...rowAsk(ROW({ phone: "" })) });
    await openChurchPerson({ call, action: PERSON_ACTION, ...memberAsk({ type: "교구", gu: "화평", mok: "20", name: "홍길동" }) });
    assert.deepEqual(seen, [
      ["evPerson", base],
      ["evPerson", base],
      [PERSON_ACTION, { name: "홍길동", who_type: "", group: "", sub: "", who: "화평 20목장", phone: PHONE }],
      [PERSON_ACTION, { name: "홍길동", who_type: "", group: "", sub: "", who: "화평 20목장" }],
      [PERSON_ACTION, base],
    ]);
    assert.equal(toastEl.textContent, "이 메뉴를 쓸 권한이 없어요");
  } finally {
    for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete g[k]; else g[k] = v; }
  }
});
