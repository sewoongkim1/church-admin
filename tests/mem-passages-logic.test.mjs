// 📜 내 안에 거하는 말씀(js/menus/memorize/passages-logic.js) — 마디 나누기 · 저장 꼴 · 마디 바뀜 · 공개 스위치 · 메뉴·권한
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitLines, chunksOf, lineStats, countText, parseSortOrder, passageToForm, formToPassage, linesChange, linesChangeText,
  publicState, publicWarn, publicConfirm, previewUrl, PREVIEW_URL, passageErrorText, PUBLIC_KEY,
} from "../js/menus/memorize/passages-logic.js";
import { MENUS, menusFor, GROUP_ICON } from "../js/menus/registry.js";
import { canCall } from "../supabase/functions/church-admin/authz.ts";

test("마디 = 한 줄 — 앞뒤 빈칸을 깎고 빈 줄은 건너뛴다(서버 savePassage · 앱 passageChunks 와 같다)", () => {
  assert.deepEqual(splitLines("  하늘에 계신 \r\n\n  나라가 임하시오며\n   \n"), ["하늘에 계신", "나라가 임하시오며"]);
  assert.deepEqual(splitLines(""), []);
  assert.deepEqual(splitLines(null), []);
  assert.deepEqual(chunksOf([" 가 ", "", null, "나"]), ["가", "나"]);
  assert.deepEqual(chunksOf(undefined), []);
});

test("한글은 완성형(NFC)으로 — 자모 분리(NFD) 글자도 같은 글자가 된다", () => {
  const nfd = "주기도문".normalize("NFD");
  assert.notEqual(nfd, "주기도문");
  assert.deepEqual(splitLines(nfd), ["주기도문"]);
  const out = formToPassage({ title: nfd, text: nfd });
  assert.equal(out.passage.title, "주기도문");
  assert.deepEqual(out.passage.lines, ["주기도문"]);
});

test("본문 칸 아래 셈 — 마디 수 · 가장 긴 마디 글자 수", () => {
  assert.deepEqual(lineStats("가나다\n\n가나다라마\n"), { count: 2, longest: 5 });
  assert.equal(countText("가나다\n가나다라마"), "마디 2개 · 가장 긴 마디 5자");
  assert.match(countText("  \n "), /마디 0개/);
});

test("차례 — 비우면 0 · 정수만 · int 범위", () => {
  assert.equal(parseSortOrder(""), 0);
  assert.equal(parseSortOrder("  "), 0);
  assert.equal(parseSortOrder(undefined), 0);
  assert.equal(parseSortOrder("3"), 3);
  assert.equal(parseSortOrder("-2"), -2);
  assert.equal(parseSortOrder("+7"), 7);
  assert.equal(parseSortOrder("-0"), 0);
  assert.ok(Object.is(parseSortOrder("-0"), 0));
  assert.equal(parseSortOrder("1.5"), null);
  assert.equal(parseSortOrder("abc"), null);
  assert.equal(parseSortOrder("2147483648"), null);
  assert.equal(parseSortOrder("2147483647"), 2147483647);
});

test("formToPassage — 서버가 받는 꼴 · 새 본문은 id 없음 · 고칠 때는 숫자 id", () => {
  const f = { title: " 주기도문 ", ref: " 마 6:9-13 ", category: " 기도문 ", sortOrder: "2", text: "하늘에 계신 우리 아버지여\n\n이름이 거룩히 여김을 받으시오며", active: true };
  const n = formToPassage(f);
  assert.equal(n.ok, true);
  assert.deepEqual(n.passage, { title: "주기도문", ref: "마 6:9-13", category: "기도문", sortOrder: 2,
    lines: ["하늘에 계신 우리 아버지여", "이름이 거룩히 여김을 받으시오며"], is_active: true });
  assert.equal("id" in n.passage, false);
  assert.equal(formToPassage(f, "").passage.id, undefined);
  assert.equal(formToPassage(f, 7).passage.id, 7);
  assert.equal(formToPassage(f, "7").passage.id, 7);
  assert.equal(formToPassage({ ...f, active: false }, 7).passage.is_active, false);
  assert.equal(formToPassage({ title: "가", text: "나" }).passage.is_active, true, "「목록에 보이기」 칸이 없는 새 본문은 켜짐");
  assert.equal(formToPassage({ title: "가", text: "나" }).passage.sortOrder, 0);
});

test("formToPassage — 제목·본문은 꼭 · 차례는 정수 · 막는 말은 한국말 한 문장", () => {
  assert.deepEqual(formToPassage({ title: "  ", text: "가" }), { ok: false, message: "제목을 적어 주세요" });
  assert.match(formToPassage({ title: "가", text: " \n \n" }).message, /한 줄 이상/);
  assert.match(formToPassage({ title: "가", text: "나", sortOrder: "1.5" }).message, /정수/);
});

test("formToPassage — < > \" 는 받지 않는다(성도님 앱이 이스케이프 없이 넣는다) · 둥근 따옴표는 된다", () => {
  assert.match(formToPassage({ title: "<b>주기도문", text: "가" }).message, /^제목에/);
  assert.match(formToPassage({ title: "가", ref: "마 6:9\"", text: "나" }).message, /^출처에/);
  assert.match(formToPassage({ title: "가", category: "기도>문", text: "나" }).message, /^분류에/);
  assert.match(formToPassage({ title: "가", text: "첫 줄\n둘째 \"줄\"" }).message, /^2째 마디에/);
  assert.equal(formToPassage({ title: "가", text: "“이르시되” ‘그렇다’ & 아멘" }).ok, true);
  assert.equal(formToPassage({ title: "가", text: "그가 이르되 '아멘'" }).ok, true);
});

test("passageToForm — 서버 본문을 창의 칸으로 · 빈 값은 빈 글자 · 차례 0", () => {
  assert.deepEqual(passageToForm({ id: 3, title: "사도신경", ref: "", category: null, lines: [" 가 ", "", "나"], sortOrder: 5 }),
    { title: "사도신경", ref: "", category: "", sortOrder: "5", text: "가\n나", active: true });
  assert.deepEqual(passageToForm(null), { title: "", ref: "", category: "", sortOrder: "0", text: "", active: true });
  // 창의 칸 → 다시 저장 꼴로: 아무것도 안 고치면 같은 줄
  const p = { id: 3, title: "사도신경", ref: "", category: "", lines: ["가", "나"], sortOrder: 0 };
  assert.deepEqual(formToPassage(passageToForm(p), p.id).passage, { id: 3, title: "사도신경", ref: "", category: "", sortOrder: 0, lines: ["가", "나"], is_active: true });
});

test("linesChange — 진행 기록(몇째 마디)이 어긋나는 저장만 가려낸다", () => {
  assert.equal(linesChange(["가", "나"], ["가", "나"]), "same");
  assert.equal(linesChange([" 가 ", "", "나"], ["가", "나"]), "same", "빈칸·빈 줄 차이는 같은 마디");
  assert.equal(linesChange(["가", "나"], ["가", "나다"]), "edited");
  assert.equal(linesChange(["가", "나"], ["나", "가"]), "moved");
  assert.equal(linesChange(["가", "나"], ["가", "나", "다"]), "count");
  assert.equal(linesChange(["가", "나", "다"], ["가"]), "count");
  assert.match(linesChangeText("count", ["가", "나"], ["가", "나", "다"]), /2개에서 3개로/);
  assert.match(linesChangeText("moved", ["가", "나"], ["나", "가"]), /차례가 바뀌어요/);
  assert.equal(linesChangeText("edited", ["가"], ["나"]), "");
  assert.equal(linesChangeText("same", ["가"], ["가"]), "");
});

test("공개 스위치 — 성도님 앱과 같은 읽기(참 같은 값이면 켜짐 · 없음도 꺼짐) · 못 불러오면 모름", () => {
  assert.equal(PUBLIC_KEY, "passagesPublic");
  assert.equal(publicState({ ok: true, value: true }), "on");
  assert.equal(publicState({ ok: true, value: false }), "off");
  assert.equal(publicState({ ok: true, value: null }), "off");
  assert.equal(publicState({ ok: true }), "off");
  // JSON 으로 "false" 라고 적힌 글자는 앱이 켜짐으로 읽는다 — 사실대로 켜짐이라고 보인다
  assert.equal(publicState({ ok: true, value: "false" }), "on");
  assert.equal(publicState({ ok: false, error: "network" }), "unknown");
  assert.equal(publicState(null), "unknown");
  assert.equal(publicState({ error: "boom" }), "unknown", "ok 가 없는 답(서버가 던짐)도 모름");
});

test("공개 — 켜졌는데 본문이 없을 때만 알린다 · 목록을 못 불러왔으면 말하지 않는다", () => {
  assert.match(publicWarn("on", 0), /본문이 없어요/);
  assert.equal(publicWarn("on", 2), "");
  assert.equal(publicWarn("on", null), "");
  assert.equal(publicWarn("off", 0), "");
  assert.equal(publicWarn("unknown", 0), "");
});

test("공개 바꾸기 확인 창 — 켜기는 본 단추 · 끄기는 위험 단추 · 늦게 보일 수 있다고 둘 다 말한다", () => {
  const on = publicConfirm(true, 3);
  assert.equal(on.danger, false);
  assert.match(on.text, /본문 3개가 보여요/);
  assert.match(on.text, /바로 안 보일 수 있어요/);
  assert.match(publicConfirm(true, 0).text, /빈 목록/);
  assert.doesNotMatch(publicConfirm(true, null).text, /본문 \d+개|빈 목록/);
  const off = publicConfirm(false, 3);
  assert.equal(off.danger, true);
  assert.match(off.text, /진행 기록은 그대로/);
  assert.match(off.text, /바로 안 보일 수 있어요/);
  for (const q of [on, off]) for (const k of ["title", "ok", "cancel"]) assert.ok(q[k], k);
});

test("미리 보기 주소는 운영 화면에서만(개발 DB 로 운영 앱을 열면 다른 본문이 보인다)", () => {
  assert.equal(previewUrl("prod"), PREVIEW_URL);
  assert.equal(PREVIEW_URL, "https://gocheok.onlybible.kr/?passages=1");
  assert.equal(previewUrl("dev"), "");
  assert.equal(previewUrl(undefined), "");
});

test("서버 오류 → 한국말 · 모르는 코드는 빈 글자(ui.js errorText 로 넘긴다)", () => {
  assert.equal(passageErrorText({ ok: false, error: "title-required" }), "제목을 적어 주세요");
  assert.match(passageErrorText({ ok: false, error: "lines-required" }), /한 줄 이상/);
  assert.match(passageErrorText({ ok: false, error: "id-required" }), /다시 불러와/);
  assert.match(passageErrorText({ ok: false, error: "unauthorized" }), /개발 담당/);
  assert.equal(passageErrorText({ ok: false, error: "network" }), "");
  assert.equal(passageErrorText(null), "");
});

test("메뉴 — 성경암송 묶음 · 역할 memorizeadmin · 묶음 머리 아이콘과 다른 아이콘 · 이 화면이 부르는 액션은 그 역할로 열린다", () => {
  const m = MENUS.find((x) => x.id === "mem-passages");
  assert.ok(m, "mem-passages 메뉴가 있다");
  assert.equal(m.group, "성경암송");
  assert.equal(m.role, "memorizeadmin");
  assert.equal(m.label, "내 안에 거하는 말씀");
  assert.notEqual(m.icon, GROUP_ICON["성경암송"]);
  assert.ok(menusFor(["memorizeadmin"]).some((x) => x.id === "mem-passages"));
  assert.ok(!menusFor(["ministry"]).some((x) => x.id === "mem-passages"));
  const admin = { status: "active", roles: ["memorizeadmin"] }, other = { status: "active", roles: ["ministry"] };
  for (const a of ["getPassages", "savePassage", "deletePassage", "getConfig", "saveConfig"]) {
    assert.equal(canCall(a, admin), "ok", a);
    assert.equal(canCall(a, other), "forbidden", a);
  }
});
