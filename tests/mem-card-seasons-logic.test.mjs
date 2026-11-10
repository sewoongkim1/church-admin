// 💌 말씀카드 기간(js/menus/memorize/card-seasons-logic.js) — 읽기(모름) · 지금 기간 · 오늘과 견준 상태 · 저장 전 확인 · 모르는 키 남기기 · 메뉴·권한
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CONFIG_KEY, SEASONS, MAX_DAYS, EXPLAIN, UNKNOWN_TEXT, isDate, spanDays, fmtMD, fmtRange, readStored, validWin, effective,
  statusOf, checkWin, mergeSeason, draftOf, draftWin, draftDirty, setDraftDate, defaultDraft, savedText, sameWin, CHANGED_TEXT,
} from "../js/menus/memorize/card-seasons-logic.js";
import { MENUS, menusFor, GROUP_ICON } from "../js/menus/registry.js";
import { canCall } from "../supabase/functions/church-admin/authz.ts";

const XMAS = SEASONS.find((s) => s.key === "christmas"), NY = SEASONS.find((s) => s.key === "newyear");

test("약속 — 키 이름 cardSeasons · 알려진 카드 셋(수험생 · 성탄 · 새해)과 기본 기간(성경암송 pray-share.js CARD_SETS · app.js CARD_SUNEUNG_SEASON 과 같게)", () => {
  assert.equal(CONFIG_KEY, "cardSeasons");
  assert.deepEqual(SEASONS.map((s) => [s.key, s.from, s.to]),
    [["suneung", "2026-11-07", "2026-12-11"], ["christmas", "2026-11-29", "2026-12-26"], ["newyear", "2026-12-26", "2027-01-15"]]);
  const SUN = SEASONS.find((s) => s.key === "suneung");
  assert.match(SUN.name, /수험생 응원기도카드/);
  assert.match(SUN.note, /시험·취업 준비/, "수험생은 기간 밖에도 사라지지 않는다는 한 줄");
  assert.equal(XMAS.note, undefined); assert.equal(NY.note, undefined);
  const SRC = readFileSync(new URL("../js/menus/memorize/card-seasons.js", import.meta.url), "utf8");
  assert.ok(SRC.includes('${season.note ? `<p class="muted cs-note">${esc(season.note)}</p>` : ""}'), "note 는 esc 로 그린다");
  assert.match(XMAS.name, /성탄 축복기도카드/);
  assert.match(NY.name, /새해 축복기도카드/);
  for (const s of SEASONS) assert.ok(checkWin(s.from, s.to).ok, `${s.key} 기본 기간도 확인을 통과한다`);
  assert.match(EXPLAIN, /「지금 이때」/);
  assert.match(EXPLAIN, /시작일과 끝날을 모두 포함/);
  assert.equal(UNKNOWN_TEXT, "설정을 불러오지 못했어요 — 잠시 뒤 다시");
});

test("날짜 — 달력에 있는 날만 · 날 수는 두 끝 포함 · 해가 바뀌어도", () => {
  assert.ok(isDate("2026-11-29"));
  assert.ok(isDate("2028-02-29"));
  for (const bad of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-1-5", "", null, undefined, "2026-11-29T00:00"]) assert.ok(!isDate(bad), String(bad));
  assert.equal(spanDays("2026-11-29", "2026-11-29"), 1);
  assert.equal(spanDays("2026-11-29", "2026-12-26"), 28);
  assert.equal(spanDays("2026-12-26", "2027-01-15"), 21);
  assert.equal(fmtMD("2026-11-29", "2026"), "11월 29일");
  assert.equal(fmtMD("2027-01-15", "2026"), "2027년 1월 15일");
  assert.equal(fmtMD("bad", "2026"), "");
  assert.equal(fmtRange("2026-11-29", "2026-12-26"), "2026년 11월 29일 (일) ~ 12월 26일 (토)");
  assert.equal(fmtRange("2026-12-26", "2027-01-15"), "2026년 12월 26일 (토) ~ 2027년 1월 15일 (금)");
});

test("읽기 — 실패 · 「허용되지 않은 키」 · 이상한 꼴은 모름(저장 막음) · null 은 모두 기본({})", () => {
  assert.deepEqual(readStored(null), { state: "unknown", why: "fail" });
  assert.deepEqual(readStored({ ok: false, error: "network" }), { state: "unknown", why: "fail" });
  assert.deepEqual(readStored({ ok: false, error: "허용되지 않은 키" }), { state: "unknown", why: "key" });
  assert.deepEqual(readStored({ value: {} }), { state: "unknown", why: "fail" }, "ok 가 없으면 모름");
  for (const v of ["{}", 3, true, [], [{ from: "2026-11-29" }]]) assert.deepEqual(readStored({ ok: true, value: v }), { state: "unknown", why: "shape" }, JSON.stringify(v));
  assert.deepEqual(readStored({ ok: true, value: null }), { state: "ok", stored: {} });
  assert.deepEqual(readStored({ ok: true }), { state: "ok", stored: {} });
  const v = { christmas: { from: "2026-12-01", to: "2026-12-25" } };
  const got = readStored({ ok: true, value: v });
  assert.deepEqual(got, { state: "ok", stored: v });
  assert.notEqual(got.stored, v, "받은 객체를 그대로 쓰지 않는다(복사)");
});

test("지금 기간 — 키가 없으면 기본 · 있으면 등록 · 읽을 수 없는 꼴이면 bad", () => {
  assert.deepEqual(effective(XMAS, {}), { from: "2026-11-29", to: "2026-12-26", registered: false, bad: false });
  assert.deepEqual(effective(XMAS, { christmas: { from: "2026-12-01", to: "2026-12-25" } }),
    { from: "2026-12-01", to: "2026-12-25", registered: true, bad: false });
  for (const w of [null, "x", { from: "2026-12-01" }, { from: "2026-12-25", to: "2026-12-01" }, { from: "2026-02-30", to: "2026-03-01" }]) {
    const e = effective(XMAS, { christmas: w });
    assert.equal(e.bad, true, JSON.stringify(w));
    assert.equal(validWin(w), false);
  }
});

test("오늘(한국 날짜)과 견준 상태 — 지금 보임 · M월 D일부터 보임 · 지났어요 (두 끝 포함)", () => {
  const w = { from: "2026-11-29", to: "2026-12-26" };
  assert.deepEqual(statusOf(w, "2026-11-10"), { kind: "soon", text: "11월 29일부터 보임" });
  assert.deepEqual(statusOf(w, "2026-11-29"), { kind: "now", text: "지금 보임" });
  assert.deepEqual(statusOf(w, "2026-12-26"), { kind: "now", text: "지금 보임" });
  assert.deepEqual(statusOf(w, "2026-12-27"), { kind: "past", text: "지났어요 — 다음 철 날짜를 넣어 주세요" });
  assert.equal(statusOf({ from: "2027-11-28", to: "2027-12-26" }, "2026-12-30").text, "2027년 11월 28일부터 보임", "다른 해면 해를 붙인다");
});

test("저장 전 확인 — 두 날짜 모두 · 시작일 ≤ 끝날 · 92일까지(까닭을 말한다)", () => {
  assert.equal(MAX_DAYS, 92);
  assert.match(checkWin("", "2026-12-26").message, /모두 골라/);
  assert.match(checkWin("2026-11-29", "").message, /모두 골라/);
  assert.match(checkWin("2026-12-26", "2026-11-29").message, /끝날이 시작일보다 앞/);
  assert.ok(checkWin("2026-12-25", "2026-12-25").ok, "하루짜리도 된다");
  assert.ok(checkWin("2026-11-01", "2027-01-31").ok, "92일 = 상한 그대로");
  const r = checkWin("2026-11-01", "2027-02-01");
  assert.equal(r.ok, false);
  assert.match(r.message, /93일/);
  assert.match(r.message, /92일/);
  assert.match(checkWin("2026-11-29", "2027-12-26").message, /해를 잘못/);
});

test("저장할 값 — 그 카드 키만 바꾸고 모르는 키 · 카드 안 모르는 칸은 그대로 · 기본으로 = 키 지우기 · 받은 객체는 안 고침", () => {
  const stored = { newyear: { from: "2026-12-28", to: "2027-01-10" }, easter: { from: "2027-03-20", to: "2027-04-04" },
    christmas: { from: "2026-12-01", to: "2026-12-20", note: "앞으로 더할 칸" } };
  const snap = JSON.stringify(stored);
  const out = mergeSeason(stored, "christmas", { from: "2026-11-30", to: "2026-12-25" });
  assert.deepEqual(out, { ...stored, christmas: { from: "2026-11-30", to: "2026-12-25", note: "앞으로 더할 칸" } });
  assert.equal(JSON.stringify(stored), snap, "받은 값은 그대로");
  const back = mergeSeason(stored, "newyear", null);
  assert.deepEqual(Object.keys(back).sort(), ["christmas", "easter"]);
  assert.deepEqual(back.easter, stored.easter);
  assert.deepEqual(mergeSeason({}, "christmas", { from: "2026-12-01", to: "2026-12-25" }), { christmas: { from: "2026-12-01", to: "2026-12-25" } });
  assert.deepEqual(mergeSeason({}, "christmas", null), {});
  assert.deepEqual(mergeSeason({ christmas: "망가진 값" }, "christmas", { from: "2026-12-01", to: "2026-12-02" }),
    { christmas: { from: "2026-12-01", to: "2026-12-02" } });
});

test("고치는 중인 값 — 기본/등록/망가진 값에서 시작 · 날짜를 고르면 등록 · 기본으로 · 저장 단추(dirty)", () => {
  const empty = {};
  const d0 = draftOf(XMAS, empty);
  assert.deepEqual(d0, { useDefault: true, from: "2026-11-29", to: "2026-12-26" });
  assert.equal(draftWin(d0), null);
  assert.equal(draftDirty(XMAS, empty, d0), false, "처음엔 저장할 것이 없다");
  const d1 = setDraftDate(d0, "from", "2026-12-01");
  assert.deepEqual(d1, { useDefault: false, from: "2026-12-01", to: "2026-12-26" });
  assert.equal(draftDirty(XMAS, empty, d1), true);
  const d1same = setDraftDate(d0, "from", "2026-11-29");
  assert.equal(draftDirty(XMAS, empty, d1same), true, "기본과 같은 날짜라도 「등록」으로 바뀌니 저장할 것이 있다");

  const reg = { christmas: { from: "2026-12-01", to: "2026-12-25" } };
  const d2 = draftOf(XMAS, reg);
  assert.deepEqual(d2, { useDefault: false, from: "2026-12-01", to: "2026-12-25" });
  assert.equal(draftDirty(XMAS, reg, d2), false);
  assert.equal(draftDirty(XMAS, reg, setDraftDate(d2, "to", "2026-12-24")), true);
  const d3 = defaultDraft(XMAS);
  assert.deepEqual(d3, { useDefault: true, from: "2026-11-29", to: "2026-12-26" });
  assert.equal(draftDirty(XMAS, reg, d3), true, "등록 → 기본으로 는 저장할 것");

  const broken = { christmas: { from: "2026-12-01", to: "엉뚱" } };
  const d4 = draftOf(XMAS, broken);
  assert.deepEqual(d4, { useDefault: false, from: "2026-12-01", to: "" });
  assert.equal(draftDirty(XMAS, broken, d4), true, "망가진 값은 고쳐 쓸 수 있게 늘 저장할 것");
  assert.equal(checkWin(d4.from, d4.to).ok, false, "그래도 끝날을 고르기 전에는 저장 안 됨");
});

test("저장 알림 한 줄", () => {
  assert.equal(savedText(XMAS, { from: "2026-12-01", to: "2026-12-25" }), "「🎄 성탄 축복기도카드」 기간을 저장했어요 — 2026년 12월 1일 (화) ~ 12월 25일 (금)");
  assert.equal(savedText(NY, null), "「🌅 새해 축복기도카드」를 기본 기간으로 되돌렸어요.");
});

test("메뉴 — 성경암송 묶음 · 역할 memorizeadmin · 💌 · 이 화면이 부르는 액션은 그 역할로만 열린다", () => {
  const m = MENUS.find((x) => x.id === "mem-card-seasons");
  assert.ok(m, "mem-card-seasons 메뉴가 있다");
  assert.equal(m.group, "성경암송");
  assert.equal(m.role, "memorizeadmin");
  assert.equal(m.label, "말씀카드 기간");
  assert.equal(m.icon, "💌");
  assert.notEqual(m.icon, GROUP_ICON["성경암송"]);
  assert.ok(menusFor(["memorizeadmin"]).some((x) => x.id === "mem-card-seasons"));
  assert.ok(!menusFor(["ministry"]).some((x) => x.id === "mem-card-seasons"));
  const admin = { status: "active", roles: ["memorizeadmin"] }, other = { status: "active", roles: ["content"] };
  for (const a of ["getConfig", "saveConfig"]) {
    assert.equal(canCall(a, admin), "ok", a);
    assert.equal(canCall(a, other), "forbidden", a);
  }
});

test("화면 — 시스템 날짜 칸·브라우저 확인창을 쓰지 않는다 · 날짜는 pickDate · 저장은 busy", () => {
  const src = readFileSync(new URL("../js/menus/memorize/card-seasons.js", import.meta.url), "utf8");
  assert.ok(!/type="date"|<select|confirm\(|alert\(/.test(src));
  assert.match(src, /pickDate\(/);
  assert.match(src, /busy\(el/);
  assert.match(src, /mergeSeason\(fresh\.stored/, "저장 직전에 다시 읽은 값 위에 합친다");
});

test("저장 직전 견주기 — 다른 분이 그사이 같은 카드를 바꿨으면 저장하지 않는다(sameWin)", () => {
  assert.equal(sameWin(undefined, undefined), true, "둘 다 없음(기본)");
  assert.equal(sameWin({ from: "2026-11-29", to: "2026-12-26" }, { from: "2026-11-29", to: "2026-12-26" }), true);
  assert.equal(sameWin({ from: "2026-11-29", to: "2026-12-26" }, undefined), false, "그사이 등록됨");
  assert.equal(sameWin(undefined, { from: "2026-11-29", to: "2026-12-26" }), false, "그사이 기본으로");
  assert.equal(sameWin({ from: "2026-11-30", to: "2026-12-26" }, { from: "2026-11-29", to: "2026-12-26" }), false);
  const src = readFileSync(new URL("../js/menus/memorize/card-seasons.js", import.meta.url), "utf8");
  const i = src.indexOf("const fresh = readStored(fr);"), j = src.indexOf('call("saveConfig"');
  assert.ok(i > 0 && j > i, "저장은 다시 읽은 뒤");
  assert.ok(src.slice(i, j).includes("sameWin(fresh.stored[season.key], got.stored[season.key])"), "저장 앞에서 견준다");
  assert.match(CHANGED_TEXT, /다른 분이/);
});
