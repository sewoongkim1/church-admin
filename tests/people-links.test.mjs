// 교인명부 — 기록과 교인 잇기 규칙(people-links.ts) 순수 시험(preflight 가 돈다 · 2026-10-01)
// 이름·교인ID 는 모두 지어낸 것(홍길동 · 11~). 번호는 글자로 적지 않고 만든다(명단 검사가 번호 수를 센다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoLink, needsAuto, phoneLinkKept, orderAutoRecs, signupAutoRecs, syncCounts, toLinkCand, linkRowOf, movedOrderIds,
  historyTabs, unlinkedRows, parseLink, linkPatch, unlinkRec, missingTable, linkNameOk, historyNameMatches, historyOrNull, withHistory,
  BASIS_SAME, BASIS_PHONE, BASIS_MANUAL }
  from "../supabase/functions/church-admin/people-links.ts";
import { applicantFromWho, applicantFromSignup } from "../supabase/functions/church-admin/people-match.ts";
import { signupSame } from "../supabase/functions/church-admin/events-person.ts";

// 교인명부 한 분 — 서버가 읽는 칸(person_id·name_key·mok1·mok3·school_dept·phone_digits·kind2)
const P = (person_id, o = {}) => toLinkCand({ person_id, name_key: "홍길동", kind2: "장년", mok1: "화평", mok3: "화평-20목장",
  school_dept: "", phone_digits: "", ...o });
const ph = (n) => "0100000" + String(n).padStart(4, "0");
const W = (who, phone = "") => applicantFromWho("홍길동", who, phone);
const NONE = { person_id: null, basis: "" };
const L = (o) => linkRowOf({ kind: "order", row_id: 1, person_id: null, link_how: "auto", match_basis: "", import_id: null, ...o });

test("autoLink — 같은 소속 한 분이면 그분(맞음) · 07·7목장도 같다", () => {
  const a = P(12), b = P(11, { mok1: "소망", mok3: "소망-3목장" });
  assert.deepEqual(autoLink([a, b], W("화평 20목장")), { person_id: 12, basis: BASIS_SAME });
  assert.deepEqual(autoLink([P(1, { mok3: "화평-7목장" }), b], W("화평 07목장")), { person_id: 1, basis: BASIS_SAME });
});

test("autoLink — 「이름이 명부에 한 분뿐」만으로는 잇지 않는다(친구 결정 2026-10-01)", () => {
  const b = P(11, { mok1: "소망", mok3: "소망-3목장" });
  assert.deepEqual(autoLink([b], W("화평 20목장")), NONE);
  assert.deepEqual(autoLink([b], W("기쁨 5목장")), NONE);
  assert.deepEqual(autoLink([], W("화평 20목장")), NONE);
  assert.deepEqual(autoLink(undefined, W("화평 20목장")), NONE);
});

test("autoLink — 번호(사역만): 같은 소속 안에서 먼저 · 없으면 같은 이름 전부 · 딱 한 분일 때만", () => {
  const c = P(13, { phone_digits: ph(13) }), d = P(14, { phone_digits: ph(14) });           // 둘 다 화평 20
  const e = P(15, { mok1: "소망", mok3: "소망-3목장", phone_digits: ph(15) });
  assert.deepEqual(autoLink([c, d], W("화평 20목장", ph(14))), { person_id: 14, basis: BASIS_PHONE });
  assert.deepEqual(autoLink([c, d, e], W("화평 20목장", ph(15))), NONE, "같은 소속이 있으면 번호도 그 안에서만");
  assert.deepEqual(autoLink([d, e], W("기쁨 5목장", ph(15))), { person_id: 15, basis: BASIS_PHONE });
  const f = P(16, { mok1: "은혜", mok3: "은혜-2목장", phone_digits: ph(15) });              // 같은 번호 가족
  assert.deepEqual(autoLink([e, f], W("기쁨 5목장", ph(15))), NONE, "번호가 둘과 맞으면 잇지 않는다");
  assert.deepEqual(autoLink([c, d], W("화평 20목장", ph(99))), NONE);
});

test("autoLink — 목장 모르는 줄(99)은 같은 교구가 있으면 번호도 그 안에서만(personPickFor 와 같은 차례)", () => {
  const g = P(21, { mok3: "화평-3목장", phone_digits: ph(21) }), h = P(22, { mok1: "소망", mok3: "소망-4목장", phone_digits: ph(22) });
  assert.deepEqual(autoLink([g, h], W("화평 99목장", ph(22))), NONE);
  assert.deepEqual(autoLink([g, h], W("화평 99목장", ph(21))), { person_id: 21, basis: BASIS_PHONE });
  assert.deepEqual(autoLink([h], W("기쁨 99목장", ph(22))), { person_id: 22, basis: BASIS_PHONE });
});

test("autoLink — 성경필사 줄(signupSame): 교구 줄은 명부의 아이를 빼고 · 옮겨 적은 줄은 맞음 · 명단 표시와 같은 결론", () => {
  const S = (who_type, group_name, sub_name) => ({ who_type, group_name, sub_name, name: "홍길동" });
  const sl = (cands, row) => autoLink(cands, applicantFromSignup(row), { isSame: signupSame(row, cands) });
  const adult = P(31), kid = P(32, { kind2: "교회학교", school_dept: "중등부" });   // 아이도 가족 목장(화평-20목장)을 가진다
  assert.deepEqual(sl([adult, kid], S("교구", "화평", "20")), { person_id: 31, basis: BASIS_SAME });
  assert.deepEqual(autoLink([adult, kid], W("화평 20목장")), NONE, "사역 줄은 숫자 목장에서 아이를 빼지 않는다(sameAffiliation 그대로)");
  assert.deepEqual(sl([adult, kid], S("교회학교", "중등부", "")), { person_id: 32, basis: BASIS_SAME });
  const y = P(33, { kind2: "청년", mok1: "청년공동체", mok3: "" });
  assert.deepEqual(sl([y, adult], S("교회학교", "청년부", "")), { person_id: 33, basis: BASIS_SAME }, "청년공동체 → 「청년부」로 옮겨 적은 줄");
});

test("needsAuto — 줄 없음·다른 명부로 맞춘 auto 만 다시 · 사람이 정한 줄은 all 이어도 안 건드린다", () => {
  assert.equal(needsAuto(undefined, 7), true);
  assert.equal(needsAuto(L({ person_id: 3, import_id: 7 }), 7), false);
  assert.equal(needsAuto(L({ person_id: 3, import_id: 6 }), 7), true, "옛 명부");
  assert.equal(needsAuto(L({ person_id: 3, import_id: 9 }), 7), true, "지워진 명부(개발 시험 기록 등) — 다르면 다시");
  assert.equal(needsAuto(L({ person_id: 3, link_how: "manual" }), 7), false);
  assert.equal(needsAuto(L({ link_how: "none" }), 7, true), false);
  assert.equal(needsAuto(L({ person_id: 3, import_id: 7 }), 7, true), true);
});

test("orderAutoRecs — 물어본 이름만 · 사람이 정한 줄 빼고 · 줄마다 하나 · 못 맞추면 null 로 적는다", () => {
  const look = { idx: new Map([["홍길동", [P(12), P(11, { mok1: "소망", mok3: "소망-3목장" })]]]), asked: new Set(["홍길동", "김철수"]), importId: 7 };
  const rows = [
    { id: 1, name: "홍길동", who: "화평 20목장", phone: "" },
    { id: 2, name: "홍 길동", who: "기쁨 5목장", phone: "" },
    { id: 3, name: "홍길동", who: "화평 20목장", phone: "" },
    { id: 4, name: "김철수", who: "화평 1목장", phone: "" },
    { id: 5, name: "이영희", who: "화평 1목장", phone: "" },
    { id: 1, name: "홍길동", who: "화평 20목장", phone: "" },
  ];
  const cur = new Map([[3, L({ row_id: 3, person_id: 11, link_how: "manual" })]]);
  assert.deepEqual(orderAutoRecs(rows, look, cur), [
    { kind: "order", row_id: 1, person_id: 12, match_basis: "맞음", import_id: 7 },
    { kind: "order", row_id: 2, person_id: null, match_basis: "", import_id: 7 },
    { kind: "order", row_id: 4, person_id: null, match_basis: "", import_id: 7 },
  ]);
  const cur2 = new Map([[1, L({ row_id: 1, person_id: 12, import_id: 7 })]]);
  assert.equal(orderAutoRecs([rows[0]], look, cur2).length, 0, "지금 명부로 맞춘 auto 줄은 다시 쓰지 않는다");
  assert.equal(orderAutoRecs([rows[0]], look, cur2, true).length, 1, "다시 맞추기(all)는 다시 쓴다");
});

test("phoneLinkKept — 번호로 이은 줄은 그 신청의 번호를 지운 뒤 다시 맞추지 않는다(새 명부·기록 잇기 맞추기여도 · 설계 §3.1-3)", () => {
  const c = P(13, { phone_digits: ph(13) }), d = P(14, { phone_digits: ph(14) });           // 둘 다 화평 20
  const look = { idx: new Map([["홍길동", [c, d]]]), asked: new Set(["홍길동"]), importId: 8 };
  const byPhone = L({ row_id: 1, person_id: 14, match_basis: BASIS_PHONE, import_id: 7 });
  const row = (phone) => [{ id: 1, name: "홍길동", who: "화평 20목장", phone }];
  assert.equal(phoneLinkKept(byPhone, ""), true);
  assert.equal(phoneLinkKept(byPhone, null), true);
  assert.equal(phoneLinkKept(byPhone, ph(14)), false, "번호가 남아 있으면 평소대로");
  assert.equal(phoneLinkKept(L({ person_id: 14, match_basis: BASIS_SAME }), ""), false, "「맞음」 줄은 아니다");
  assert.equal(phoneLinkKept(L({ person_id: 14, match_basis: BASIS_MANUAL, link_how: "manual" }), ""), false);
  assert.equal(phoneLinkKept(undefined, ""), false);
  assert.equal(orderAutoRecs(row(""), look, new Map([[1, byPhone]])).length, 0, "새 명부(7→8)여도 그대로");
  assert.equal(orderAutoRecs(row(null), look, new Map([[1, byPhone]]), true).length, 0, "기록 잇기 맞추기(all)여도 그대로");
  assert.deepEqual(orderAutoRecs(row(ph(14)), look, new Map([[1, byPhone]]), true),
    [{ kind: "order", row_id: 1, person_id: 14, match_basis: BASIS_PHONE, import_id: 8 }], "번호가 남아 있으면 다시 맞춘다");
  assert.deepEqual(orderAutoRecs(row(""), look, new Map()), [{ kind: "order", row_id: 1, person_id: null, match_basis: "", import_id: 8 }],
    "잇기 줄이 없으면(「풀기」는 cur 없이 부른다) 번호 없이 맞춘다");
});

test("signupAutoRecs — 성경필사 줄은 signupSame 으로 · 번호는 쓰지 않는다", () => {
  const look = { idx: new Map([["홍길동", [P(31), P(32, { kind2: "교회학교", school_dept: "중등부" })]]]), asked: new Set(["홍길동"]), importId: 7 };
  const rows = [
    { id: 10, who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동" },
    { id: 11, who_type: "교구", group_name: "기쁨", sub_name: "5", name: "홍길동" },
  ];
  assert.deepEqual(signupAutoRecs(rows, look, new Map()), [
    { kind: "signup", row_id: 10, person_id: 31, match_basis: "맞음", import_id: 7 },
    { kind: "signup", row_id: 11, person_id: null, match_basis: "", import_id: 7 },
  ]);
});

test("syncCounts — 새로 이음 · 바뀜 · 못 맞춤", () => {
  const cur = new Map([[1, L({ row_id: 1, person_id: 12, import_id: 6 })], [2, L({ row_id: 2, person_id: 11, import_id: 6 })]]);
  const R = (row_id, person_id) => ({ kind: "order", row_id, person_id, match_basis: person_id ? "맞음" : "", import_id: 7 });
  assert.deepEqual(syncCounts(cur, [R(1, 12), R(2, null), R(3, 13), R(4, null)]), { added: 1, changed: 1, unmatched: 2 });
});

const EVENTS = [
  { id: "lent-2026", title: "2026 사순절 마가복음 성경필사 완서자", short_title: "", opens_on: "2026-03-01", status: "closed", needs: {} },
  { id: "autumn-2026", title: "2026 가을 말씀 동행", short_title: "", opens_on: "2026-10-27", status: "draft" },
  { id: "summer-2025", title: "2025 썸머 써 바이블", short_title: "", opens_on: "2025-06-01", status: "archived" },
];
// src_note = b6 사역 이력의 원본 메모(2026-10-02 가지 마지막 검토 — CLAUDE.md 교인명부 절 응답 금지 칸)
const SECRET = /"(user_id|ident_key|memo|phone|answers|note|src_note)"\s*:/;
const MIN_KEYS = ["committee", "how", "kind", "option", "role_title", "row", "status", "team", "year"];
const BIB_KEYS = ["event_id", "group", "how", "kind", "opens_on", "position", "row", "short_title", "sub", "title", "who_type"];

test("historyTabs — 이어진 줄만 · 이력으로 넘긴 신청·초안 회차·없어진 줄은 빼고 · 칸 지도 · 해 내림차순", () => {
  const links = [{ kind: "order", row_id: 1, link_how: "auto" }, { kind: "order", row_id: 2, link_how: "manual" },
    { kind: "order", row_id: 3, link_how: "auto" }, { kind: "signup", row_id: 7, link_how: "auto" },
    { kind: "signup", row_id: 8, link_how: "auto" }, { kind: "signup", row_id: 9, link_how: "auto" }, { kind: "signup", row_id: 10, link_how: "auto" }];
  const orders = [
    { id: 1, year: 2027, committee: "예배위원회", team: "안내팀", option: "", status: "임명확정", user_id: "u-1", phone: "x", note: "메모" },
    { id: 2, year: 2027, committee: "교육위원회", team: "어와나", option: "T&T", status: "접수완료" },
    { id: 3, year: 2027, committee: "전도부", team: "행복전도대", option: "", status: "신청완료" },
  ];
  const history = [
    { id: 40, year: 2025, committee: "교육위원회", team: "중등부", role_title: "교사", position: "집사", mok: "화평-20", source: "excel", link_how: "auto", src_note: "원본 메모" },
    { id: 41, year: 2026, committee: "예배위원회", team: "안내팀", role_title: "팀장", link_how: "manual" },
  ];
  const signups = [
    { id: 7, event_id: "lent-2026", who_type: "교구", group_name: "화평", sub_name: "20", position: "집사", user_id: "u-1", memo: "m", ident_key: "k" },
    { id: 8, event_id: "autumn-2026", who_type: "교구", group_name: "화평", sub_name: "20", position: "집사" },
    { id: 9, event_id: "summer-2025", who_type: "교구", group_name: "화평", sub_name: "20", position: "집사" },
  ];
  const h = historyTabs({ links, orders, signups, events: EVENTS, history, moved: movedOrderIds([{ order_id: 3 }, { order_id: null }]) });
  assert.deepEqual(h.counts, { ministry: 4, bible: 2 });
  assert.deepEqual(h.ministry.map((r) => [r.kind, r.row]), [["order", 2], ["order", 1], ["history", 41], ["history", 40]]);
  assert.deepEqual(h.bible.map((r) => r.row), [7, 9]);
  for (const r of h.ministry) assert.deepEqual(Object.keys(r).sort(), MIN_KEYS);
  for (const r of h.bible) assert.deepEqual(Object.keys(r).sort(), BIB_KEYS);
  assert.deepEqual(h.ministry[0], { kind: "order", row: 2, year: 2027, committee: "교육위원회", team: "어와나", option: "T&T",
    role_title: "", status: "접수완료", how: "manual" });
  assert.deepEqual([h.ministry[2].status, h.ministry[2].how, h.ministry[2].role_title], ["임명확정", "manual", "팀장"]);
  assert.equal(h.bible[0].title, "2026 사순절 마가복음 성경필사 완서자");
  assert.ok(!SECRET.test(JSON.stringify(h)), "탭에 실으면 안 되는 칸");
  assert.deepEqual(historyTabs({}), { counts: { ministry: 0, bible: 0 }, ministry: [], bible: [] });
});

test("unlinkedRows — 아무에게도 안 이어진 줄(auto)과 「이분 아님」(none)만 · 다른 분께 이어진 줄·넘긴 신청·초안 회차는 빼고", () => {
  const o = (id) => ({ id, year: 2027, committee: "예배위원회", team: "안내팀", option: "", status: "신청완료", position: "집사",
    who: "기쁨 5목장", name: "홍길동", user_id: "u", phone: "x", note: "n" });
  const orderLinks = new Map([[2, L({ row_id: 2, import_id: 7 })], [3, L({ row_id: 3, person_id: 99 })], [4, L({ row_id: 4, link_how: "none" })]]);
  const signups = [{ id: 7, event_id: "lent-2026", who_type: "교구", group_name: "기쁨", sub_name: "5", position: "집사", name: "홍길동", memo: "m" },
    { id: 8, event_id: "autumn-2026", who_type: "교구", group_name: "기쁨", sub_name: "5", position: "", name: "홍길동" }];
  const history = [{ id: 40, year: 2024, committee: "교육위원회", team: "중등부", role_title: "", position: "집사", mok: "기쁨-5", link_how: "auto", name: "홍길동",
    src_note: "원본 메모" }];
  const rows = unlinkedRows({ orders: [o(1), o(2), o(3), o(4), o(5)], signups, events: EVENTS, orderLinks, signupLinks: new Map(),
    moved: new Set([5]), history });
  assert.deepEqual(rows.map((r) => [r.kind, r.row, r.how]), [["order", 1, "auto"], ["order", 2, "auto"], ["order", 4, "none"],
    ["history", 40, "auto"], ["signup", 7, "auto"]]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["committee", "how", "kind", "option", "position", "row", "status", "team", "who", "year"]);
  assert.deepEqual(Object.keys(rows[3]).sort(), ["committee", "how", "kind", "mok", "position", "role_title", "row", "team", "year"]);
  assert.deepEqual(Object.keys(rows[4]).sort(), BIB_KEYS);
  assert.ok(!SECRET.test(JSON.stringify(rows)));
});

test("parseLink — kind 셋 · how 셋 · 줄·교인ID 는 양의 정수 · expect(없으면 null · 있으면 글자)", () => {
  assert.deepEqual(parseLink({ kind: "order", row: "12", person: 900001, how: "manual" }),
    { ok: true, kind: "order", row: 12, person: 900001, how: "manual", expect: null });
  assert.equal(parseLink({ kind: "history", row: 1, person: 1, how: "none" }).ok, true);
  assert.deepEqual(parseLink({ kind: "history", row: 1, person: 1, how: "auto", expect: "2026-10-01T00:00:00.000Z" }),
    { ok: true, kind: "history", row: 1, person: 1, how: "auto", expect: "2026-10-01T00:00:00.000Z" });
  for (const e of [null, "", undefined]) assert.equal(parseLink({ kind: "order", row: 1, person: 1, how: "manual", expect: e }).expect, null);
  for (const bad of [null, [], { kind: "x", row: 1, person: 1, how: "manual" }, { kind: "order", row: 0, person: 1, how: "manual" },
    { kind: "order", row: 1, person: -1, how: "manual" }, { kind: "order", row: 1.5, person: 1, how: "auto" },
    { kind: "signup", row: 1, person: 1, how: "delete" }]) assert.deepEqual(parseLink(bad), { ok: false, error: "invalid" }, JSON.stringify(bad));
});

test("linkPatch · unlinkRec — 사람이 정한 줄 / 풀기(auto 로 되돌리고 그 줄만 다시 맞춘 값)", () => {
  const NOW = "2026-10-01T00:00:00.000Z", M = "11111111-1111-1111-1111-111111111111";
  assert.deepEqual(linkPatch("order", 5, "manual", 900001, M, NOW), { kind: "order", row_id: 5, person_id: 900001, link_how: "manual",
    match_basis: BASIS_MANUAL, import_id: null, linked_by: M, linked_at: NOW, updated_at: NOW });
  assert.deepEqual(linkPatch("signup", 6, "none", 900001, M, NOW), { kind: "signup", row_id: 6, person_id: null, link_how: "none",
    match_basis: "", import_id: null, linked_by: M, linked_at: NOW, updated_at: NOW });
  assert.deepEqual(unlinkRec("order", 5, { person_id: 12, basis: "맞음" }, 7, NOW), { kind: "order", row_id: 5, person_id: 12,
    link_how: "auto", match_basis: "맞음", import_id: 7, linked_by: null, linked_at: null, updated_at: NOW });
});

test("missingTable — 표가 없을 때(운영 SQL 005 전 사역 이력) 두 꼴", () => {
  assert.equal(missingTable({ code: "42P01" }), true);
  assert.equal(missingTable({ code: "PGRST205" }), true);
  assert.equal(missingTable({ code: "42501" }), false);
  assert.equal(missingTable(null), false);
});

// 2026-10-02 가지 마지막 검토 — b6 맞춤은 정확한 이름이 아닌 줄도 잇는다(끝 영문자·괄호·오타). 그 줄의 「풀기」·「이분 아님」이
// 이름 때문에 막히지 않게 이름은 「이분 것」만 보고, 사역 이력은 b6 후보 창(nameKeyVariants)과 같은 열쇠로 본다.
test("historyNameMatches — 사역 이력 이름은 b6 열쇠(끝 영문자 양쪽 · 소문자 · 괄호 · 띄어쓰기) · 다른 이름·빈 이름은 아니다", () => {
  assert.equal(historyNameMatches("홍길동", "홍길동"), true);
  assert.equal(historyNameMatches("홍길동", "홍길동A"), true, "「홍길동」 줄 ↔ 교인 「홍길동A」(b6 bySuffixBase)");
  assert.equal(historyNameMatches("홍길동", "홍길동b"), true, "명부 열쇠의 끝 영문자는 원본 그대로(소문자)");
  assert.equal(historyNameMatches("홍길동A", "홍길동"), true, "줄에 붙은 끝 영문자를 떼고");
  assert.equal(historyNameMatches("홍길동a", "홍길동A"), true);
  assert.equal(historyNameMatches("홍길동(큰)", "홍길동"), true, "괄호 떼고");
  assert.equal(historyNameMatches(" 홍 길동 ", "홍길동"), true, "띄어쓰기");
  assert.equal(historyNameMatches("홍길동", "홍길순"), false);
  assert.equal(historyNameMatches("홍길동", "홍길동이"), false, "끝 영문자만 — 한글이 더 붙으면 다른 이름");
  assert.equal(historyNameMatches("홍길동", ""), false);
  assert.equal(historyNameMatches("", "홍길동"), false);
});

test("linkNameOk — 이름은 「이분 것」(manual)만 · 「이분 아님」·「풀기」는 이름을 보지 않는다(not-linked 가 주인 확인)", () => {
  for (const kind of ["order", "signup", "history"]) {
    for (const how of ["none", "auto"]) assert.equal(linkNameOk(kind, how, "홍길동", "홍길순"), true, kind + " " + how);
    assert.equal(linkNameOk(kind, "manual", "홍길동", "홍길순"), false, kind + " manual 다른 이름");
    assert.equal(linkNameOk(kind, "manual", "홍 길동", "홍길동"), true, kind + " manual 같은 이름");
  }
  // 신청·명단 manual 은 nameKey 가 정확히 같아야(자동 잇기·「아직 안 이어진 기록」과 같은 열쇠) · 사역 이력은 b6 열쇠
  assert.equal(linkNameOk("order", "manual", "홍길동", "홍길동A"), false);
  assert.equal(linkNameOk("signup", "manual", "홍길동", "홍길동A"), false);
  assert.equal(linkNameOk("history", "manual", "홍길동", "홍길동A"), true);
  assert.equal(linkNameOk("history", "manual", "홍길동(큰)", "홍길동"), true);
});

// 2026-10-02 가지 마지막 검토 — 탭은 덧붙는 기능. 이력 읽기가 실패해도 「자세히」 창은 예전 창으로 열리고(500 아님),
// 이미 끝난 잇기 쓰기는 성공으로 알린다(history 만 빠진다).
test("historyOrNull — 읽기가 되면 그 값 · 던지면 null(오류는 log 로만 · log 가 던져도 null)", async () => {
  const H = { counts: { ministry: 0, bible: 0 }, ministry: [], bible: [] };
  assert.equal(await historyOrNull(async () => H), H);
  const seen = [];
  const boom = Object.assign(new Error("people_links 없음"), { code: "PGRST205" });
  assert.equal(await historyOrNull(async () => { throw boom; }, (e) => seen.push(e)), null);
  assert.deepEqual(seen, [boom], "오류는 log 로 넘긴다(응답에는 안 싣는다)");
  assert.equal(await historyOrNull(() => Promise.reject(new Error("x"))), null, "log 없이도");
  assert.equal(await historyOrNull(async () => { throw new Error("x"); }, () => { throw new Error("기록 실패"); }), null, "log 가 던져도 창은 연다");
});

test("withHistory — 탭 자료가 있으면 붙이고 · 없으면(null·undefined) 칸째 뺀다 · 나머지 칸은 그대로", () => {
  const H = { counts: { ministry: 1, bible: 0 }, ministry: [{ kind: "order", row: 1 }], bible: [] };
  assert.deepEqual(withHistory({ ok: true, how: "manual", relinked: false }, H), { ok: true, how: "manual", relinked: false, history: H });
  for (const none of [null, undefined]) {
    const r = withHistory({ ok: true, how: "auto", relinked: true }, none);
    assert.deepEqual(r, { ok: true, how: "auto", relinked: true });
    assert.equal("history" in r, false, "화면은 history 가 있을 때만 탭을 그린다 — null 칸도 싣지 않는다");
  }
  assert.deepEqual(withHistory({ ok: true, person: { person_id: 11 }, family: [] }, null), { ok: true, person: { person_id: 11 }, family: [] },
    "peoplePerson — history 가 빠지면 예전 창");
});
