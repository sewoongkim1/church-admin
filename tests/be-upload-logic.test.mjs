// 📤 명단 올리기(성경필사(암송)) — 순수 함수 시험. 다듬기·판정은 서버 몫이라 여기서는 「칸 나누기」와 「보여 주기」만 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORDERS, COL_LABEL, MAX_ROWS, PUBLIC_MAX, MARKS, MARK_ORDER, WILL_ADD, orderOf, parseSheet, sampleLine, cellText,
  sheetText, decodeText, sigOf, markCounts, countOf, displayRow, evHint, eventOptions, pickFrom, overLimit, confirmHtml,
  splitCsv, fileErrorText, EVENT_GONE, SAVE_UNSURE, saveUnsure,
} from "../js/menus/bibleevent/upload-logic.js";
import { readFileSync } from "node:fs";
import { whoText, STATUS_KO } from "../js/menus/bibleevent/roster-logic.js";
import * as rosterLogic from "../js/menus/bibleevent/roster-logic.js";
import { BE_MAX_UPLOAD } from "../supabase/functions/church-admin/events-rules.ts";
import { errorText } from "../js/core/ui.js";
import { MENUS } from "../js/menus/registry.js";

const R = (name, gu = "", mok = "", pos = "") => ({ name, gu, mok, pos });

test("칸 차례 — 기본은 이름·교구·목장·직분 · id 는 겹치지 않고 · 차례마다 이름·교구·목장·직분이 한 번씩", () => {
  assert.equal(ORDERS[0].id, "ngmp");
  assert.deepEqual(ORDERS[0].cols, ["name", "gu", "mok", "pos"]);
  assert.equal(new Set(ORDERS.map((o) => o.id)).size, ORDERS.length);
  for (const o of ORDERS) {
    for (const k of ["name", "gu", "mok", "pos"]) assert.equal(o.cols.filter((c) => c === k).length, 1, `${o.id}: ${k}`);
    for (const k of o.cols) assert.ok(COL_LABEL[k], `${o.id}: ${k} 의 이름`);
    assert.equal(o.label, o.cols.map((k) => COL_LABEL[k]).join(" · "), `${o.id}: 고르개 글자와 칸 차례가 같다`);
  }
  assert.equal(orderOf("npgm").id, "npgm");
  assert.equal(orderOf("없는 차례").id, "ngmp");
  assert.equal(orderOf(undefined).id, "ngmp");
});

test("parseSheet — 탭(엑셀) · 앞뒤 빈칸만 떼고 원문 그대로(다듬기는 서버 몫)", () => {
  const t = "홍길동\t화평교구\t20목장\t집사님\n  ca-test-이 \t 소망 \t 남성목장 \t 권사 \n";
  assert.deepEqual(parseSheet(t, "ngmp"), [R("홍길동", "화평교구", "20목장", "집사님"), R("ca-test-이", "소망", "남성목장", "권사")]);
});

test("parseSheet — 쉼표(CSV) · 겉 따옴표 · BOM · \\r\\n · 모자란 칸은 빈 글자 · 남는 칸은 버림", () => {
  const t = "\uFEFF\"홍길동\",화평,07,\"집사\"\r\nca-test-일,교회학교,유년\r\nca-test-삼,청년,,,메모칸,또\r\n";
  assert.deepEqual(parseSheet(t, "ngmp"), [R("홍길동", "화평", "07", "집사"), R("ca-test-일", "교회학교", "유년", ""), R("ca-test-삼", "청년", "", "")]);
  // 한 줄에 탭이 있으면 쉼표는 칸을 나누지 않는다
  assert.deepEqual(parseSheet("홍길동\t화평\t20\t집사,권사", "ngmp"), [R("홍길동", "화평", "20", "집사,권사")]);
});

test("parseSheet — 이스케이프로 적은 BOM(\\uFEFF)도 뗀다 · 파일에 보이지 않는 U+FEFF 글자를 박아 두지 않는다(bom-literal)", () => {
  assert.equal(parseSheet("\uFEFF홍길동\t화평\t20\t집사", "ngmp")[0].name, "홍길동");
  // 편집기·정리 도구가 보이지 않는 글자를 지우면 BOM 떼기가 조용히 멈춘다 — 이스케이프(\uFEFF)로만 적는다
  const src = readFileSync(new URL("../js/menus/bibleevent/upload-logic.js", import.meta.url), "utf8");
  assert.equal(src.includes("\uFEFF"), false, "upload-logic.js 에 U+FEFF 글자가 그대로 있다");
  assert.equal(readFileSync(new URL(import.meta.url), "utf8").includes("\uFEFF"), false, "이 시험 파일에 U+FEFF 글자가 그대로 있다");
});

test("splitCsv · parseSheet — 큰따옴표 안의 쉼표에서는 나누지 않는다 · 「\"\"」는 「\"」 · 칸 가운데 따옴표는 보통 글자(csv-quoted-comma)", () => {
  assert.deepEqual(parseSheet('홍길동,화평,20,"집사, 권사"', "ngmp"), [R("홍길동", "화평", "20", "집사, 권사")]);
  assert.equal(parseSheet('"홍""길동",화평,20,집사', "ngmp")[0].name, '홍"길동');
  // 따옴표는 남겨 둔다(겉 따옴표는 unquote 가 벗긴다)
  assert.deepEqual(splitCsv('a,"b,c",d'), ["a", '"b,c"', "d"]);
  assert.deepEqual(splitCsv('"홍""길동",x'), ['"홍""길동"', "x"]);
  assert.deepEqual(splitCsv(""), [""]);
  assert.deepEqual(splitCsv("a,,b,"), ["a", "", "b", ""]);
  // 쉼표 뒤 빈칸이 있어도 따옴표 칸으로 본다(손으로 적은 CSV)
  assert.deepEqual(parseSheet('홍길동, 화평, 20, "집사, 권사"', "ngmp"), [R("홍길동", "화평", "20", "집사, 권사")]);
  // 칸 가운데의 따옴표는 칸을 열지 않는다 — 뒤 칸이 밀리지 않는다(이름의 「"」는 서버가 bad-char 로 막는다)
  assert.deepEqual(parseSheet('홍"길동,화평,20,집사', "ngmp"), [R('홍"길동', "화평", "20", "집사")]);
  // 탭 줄은 그대로 탭으로(따옴표 안 쉼표도 칸을 나누지 않는다)
  assert.deepEqual(parseSheet('홍길동\t화평\t20\t"집사, 권사"', "ngmp"), [R("홍길동", "화평", "20", "집사, 권사")]);
});

test("parseSheet — 제목 줄(첫 칸이나 이름 칸이 「성명」·「이름」)은 어디에 있든 건너뜀", () => {
  assert.deepEqual(parseSheet("성명\t교구\t목장\t직분\n홍길동\t화평\t20\t집사\n성 명\t교구\t목장\t직분", "ngmp"),
    [R("홍길동", "화평", "20", "집사")]);
  assert.deepEqual(parseSheet("이름,교구,목장,직분\n홍길동,화평,20,집사", "ngmp"), [R("홍길동", "화평", "20", "집사")]);
  // 이름이 가운데 칸인 차례 — 이름 칸으로 알아본다
  assert.deepEqual(parseSheet("교구\t목장\t이름\t직분\n화평\t20\t홍길동\t집사", "gmnp"), [R("홍길동", "화평", "20", "집사")]);
  // 맨 앞 번호 칸은 버린다
  assert.deepEqual(parseSheet("번호\t성명\t교구\t목장\t직분\n1\t홍길동\t화평\t20\t집사\n2\tca-test-이\t교회학교\t중등부\t", "xngmp"),
    [R("홍길동", "화평", "20", "집사"), R("ca-test-이", "교회학교", "중등부", "")]);
});

test("parseSheet — 빈 줄·빈 칸만 있는 줄·양식 안내 줄(↑ ※)은 버림 · 칸 차례대로 읽음 · 모르는 차례는 기본", () => {
  const t = "\n\t\t\t\n , , \n↑ 위 칸에 적어 주세요\n※ 한 줄에 한 분\n홍길동\t집사\t화평\t20\n";
  assert.deepEqual(parseSheet(t, "npgm"), [R("홍길동", "화평", "20", "집사")]);
  assert.deepEqual(parseSheet("홍길동\t화평\t20\t집사", "없는 차례"), [R("홍길동", "화평", "20", "집사")]);
  assert.deepEqual(parseSheet("", "ngmp"), []);
  assert.deepEqual(parseSheet(null, "ngmp"), []);
});

test("sampleLine — 붙여넣기 칸 보기 줄이 고른 칸 차례를 따른다", () => {
  assert.equal(sampleLine("ngmp"), "홍길동\t화평\t20\t집사");
  assert.equal(sampleLine("npgm"), "홍길동\t집사\t화평\t20");
  assert.equal(sampleLine("xngmp"), "1\t홍길동\t화평\t20\t집사");
});

test("cellText · sheetText — 엑셀 칸을 글로(날짜·숫자·빈 칸·칸 안 탭), 빈 줄은 버리고 탭으로 잇는다", () => {
  assert.equal(cellText(new Date(2026, 8, 29)), "2026-09-29");
  assert.equal(cellText(20), "20");
  assert.equal(cellText(null), "");
  assert.equal(cellText(undefined), "");
  assert.equal(cellText(" 홍\t길동\n "), "홍 길동");
  const text = sheetText([["홍길동", "화평", 20, "집사"], [], [null, ""], ["ca-test-이", "소망", "남성", null]]);
  assert.equal(text, "홍길동\t화평\t20\t집사\nca-test-이\t소망\t남성\t");
  assert.deepEqual(parseSheet(text, "ngmp"), [R("홍길동", "화평", "20", "집사"), R("ca-test-이", "소망", "남성", "")]);
});

test("decodeText — UTF-8(BOM 떼기) · 못 읽으면 EUC-KR(한국어 엑셀 CSV)", () => {
  const utf8 = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode("홍길동,화평")]);
  assert.equal(decodeText(utf8), "홍길동,화평");
  const euckr = new Uint8Array([0xC8, 0xAB, 0xB1, 0xE6, 0xB5, 0xBF, 0x2C, 0x32, 0x30]);   // 「홍길동,20」 EUC-KR
  assert.equal(decodeText(euckr), "홍길동,20");
});

test("decodeText — UTF-16LE·BE(엑셀 「유니코드 텍스트(.txt)」) · 앞 BOM 으로 알아보고 떼어 낸다(txt-utf16)", () => {
  const s = "홍길동\t화평\t20\t집사";
  const le = Uint8Array.from([0xFF, 0xFE, ...Buffer.from(s, "utf16le")]);
  assert.equal(decodeText(le), s);
  const body = Buffer.from(s, "utf16le");
  const swapped = [];
  for (let i = 0; i < body.length; i += 2) swapped.push(body[i + 1], body[i]);
  const be = Uint8Array.from([0xFE, 0xFF, ...swapped]);
  assert.equal(decodeText(be), s);
  // 풀린 글이 곧바로 칸으로 나뉜다(여러 줄 · \r\n)
  const two = Uint8Array.from([0xFF, 0xFE, ...Buffer.from(s + "\r\nca-test-이\t소망\t남성\t권사\r\n", "utf16le")]);
  assert.deepEqual(parseSheet(decodeText(two), "ngmp"), [R("홍길동", "화평", "20", "집사"), R("ca-test-이", "소망", "남성", "권사")]);
});

test("fileErrorText — 파일을 못 읽은 까닭마다 다른 한국말(no-cdn·no-xlsx 는 같은 글 · empty · kind · 그 밖)(file-error-collapsed)", () => {
  const t = fileErrorText;
  assert.equal(typeof t, "function");
  assert.equal(t("no-cdn"), t("no-xlsx"));
  const four = [t("no-cdn"), t("empty"), t("kind"), t(undefined)];
  assert.equal(new Set(four).size, 4, JSON.stringify(four));
  assert.ok(t("no-cdn").includes("내려받지 못했") && t("no-cdn").includes("인터넷") && t("no-cdn").includes("교회 망") && t("no-cdn").includes("붙여넣"));
  assert.ok(t("empty").includes("읽을 줄") && t("empty").includes("「명단」 시트"));
  assert.ok(t("kind").includes(".xlsx") && t("kind").includes(".xls") && t("kind").includes("CSV") && t("kind").includes("TXT"));
  assert.ok(t(undefined).includes("붙여넣"));
  assert.equal(t("무엇인지 모를 오류"), t(undefined));
  assert.equal(t(""), t(undefined));
});

test("EVENT_GONE — 회차가 사라졌을 때(not-found)의 글은 회차 이야기다(「그분」이 아니다 · FE-5)", () => {
  assert.equal(typeof EVENT_GONE, "string");
  assert.ok(EVENT_GONE.includes("회차"));
  assert.ok(!EVENT_GONE.includes("그분"));
});

test("saveUnsure · SAVE_UNSURE — 넣기가 server·network 로 끝나면 「넣었을 수 있음」 · 넣기 전에 막힌 코드는 아니다(SEC-5 화면)", () => {
  assert.equal(typeof saveUnsure, "function");
  assert.equal(saveUnsure({ ok: false, error: "server", code: "HTTP 500" }), true);
  assert.equal(saveUnsure({ ok: false, error: "network" }), true);
  for (const d of [{ ok: false, error: "too-many" }, { ok: false, error: "not-found" }, { ok: false, error: "eligibility-event" }, { ok: false }, null, undefined]) {
    assert.equal(saveUnsure(d), false, JSON.stringify(d));
  }
  assert.ok(SAVE_UNSURE.includes("들어갔을 수 있어요"));
  assert.ok(SAVE_UNSURE.includes("📋 회차·명단"));
  assert.ok(SAVE_UNSURE.includes("두 번 들어가지 않아요"));
});

test("한도 — 한 번에 600줄(서버 BE_MAX_UPLOAD 와 같다) · 성도님 명단 1,000명", () => {
  assert.equal(MAX_ROWS, BE_MAX_UPLOAD);
  assert.equal(PUBLIC_MAX, 1000);
  assert.equal(overLimit(990, 10), false);
  assert.equal(overLimit(990, 11), true);
  assert.equal(overLimit(undefined, 0), false);
});

test("sigOf — 회차·채우기·보낼 줄이 하나라도 다르면 달라진다", () => {
  const rows = [R("홍길동", "화평", "20", "집사")];
  const a = sigOf("lent-2026", rows, false);
  assert.equal(a, sigOf("lent-2026", [R("홍길동", "화평", "20", "집사")], false));
  assert.notEqual(a, sigOf("lent-2025", rows, false));
  assert.notEqual(a, sigOf("lent-2026", rows, true));
  assert.notEqual(a, sigOf("lent-2026", [R("홍길동", "화평", "21", "집사")], false));
  assert.notEqual(a, sigOf("lent-2026", [], false));
});

test("판정 — 글자·차례가 다 있고 · 넣는 것은 add·fill 둘뿐 · 판정 줄에서 다시 센다", () => {
  assert.deepEqual(MARK_ORDER.slice().sort(), Object.keys(MARKS).sort());
  assert.deepEqual([...WILL_ADD].sort(), ["add", "fill"]);
  const out = ["add", "add", "fill", "same", "blank", "same-name", "same-name", "bad", "이상한값"].map((mark, i) => ({ i, mark }));
  const c = markCounts(out);
  assert.deepEqual(c, { total: 9, willAdd: 3, add: 2, fill: 1, same: 1, blank: 1, sameName: 2, bad: 1 });
  assert.equal(countOf(c, "same-name"), 2);
  assert.equal(countOf(c, "add"), 2);
  assert.equal(countOf(c, "없는값"), 0);
  assert.deepEqual(markCounts([]), { total: 0, willAdd: 0, add: 0, fill: 0, same: 0, blank: 0, sameName: 0, bad: 0 });
});

test("displayRow — 서버가 다듬은 줄이 있으면 그것(소속 글은 📋 회차·명단 whoText 그대로), 없으면 보낸 원문", () => {
  const sent = [R("홍길동", "화평교구", "20목장", "집사님"), R('홍"길동', "화평", "20", "")];
  const row = { who_type: "교구", group: "화평", sub: "20", name: "홍길동", position: "집사" };
  assert.deepEqual(displayRow({ i: 0, mark: "add", row }, sent), { name: "홍길동", who: "화평 20목장", position: "집사" });
  assert.equal(displayRow({ i: 0, mark: "add", row }, sent).who, whoText(row));
  // 모양 틀림 줄도 다듬은 줄이 오면 그것을 보인다(Task 8) — 소속 글은 같은 whoText
  const kid = { who_type: "교회학교", group: "중등부", sub: "3학년", name: "ca-test-이", position: "" };
  assert.deepEqual(displayRow({ i: 1, mark: "bad", row: kid, error: "bad-sub" }, sent), { name: "ca-test-이", who: "중등부 3학년", position: "" });
  // 소속을 못 정한 줄(who_type "")
  assert.equal(displayRow({ i: 0, mark: "blank", row: { who_type: "", group: "", sub: "", name: "홍길동", position: "" } }, sent).who, "");
  assert.deepEqual(displayRow({ i: 1, mark: "bad", row: null, error: "bad-char" }, sent), { name: '홍"길동', who: "화평 20", position: "" });
  assert.deepEqual(displayRow({ i: 7, mark: "bad", row: null }, sent), { name: "", who: "", position: "" });
});

test("회차 고르개 — 자격 회차는 빼고 · 한 줄 설명(상태 글자는 📋 회차·명단과 같다) · 주소의 회차가 자격 회차면 고르지 않는다", () => {
  const evs = [
    { id: "autumn-2026", title: "가을 말씀 동행", opens_on: "2026-10-27", closes_on: "2026-11-28", status: "draft", count: 0, listedNow: false, hasEligibility: true },
    { id: "lent-2026", title: "2026 사순절", opens_on: "2026-03-01", closes_on: "2026-04-05", status: "closed", count: 1234, listedNow: true, hasEligibility: false },
    { id: "summer-2025", title: "", opens_on: "2025-07-01", closes_on: "2025-08-31", status: "archived", count: 0, listedNow: false, hasEligibility: false },
  ];
  assert.deepEqual(eventOptions(evs).map((o) => o.value), ["lent-2026", "summer-2025"]);
  // 선택지 글은 📋 회차·명단 콤보와 같다(evPickLabel·evPickHint — 세 화면 한 벌 · 2026-09-30 콤보)
  const { evPickLabel, evPickHint } = rosterLogic;
  assert.equal(typeof evPickLabel, "function");
  assert.equal(eventOptions(evs)[0].label, "2026년 3월 · 2026 사순절");
  assert.equal(eventOptions(evs)[1].label, "2025년 7월 · summer-2025");
  assert.equal(eventOptions(evs)[0].label, evPickLabel(evs[1]));
  assert.equal(eventOptions(evs)[0].hint, "1,234명 · 마감 · 👁");
  assert.equal(eventOptions(evs)[1].hint, evPickHint(evs[2]));
  // 고른 회차의 머리 한 줄 — 앞에 연·월
  assert.equal(evHint(evs[1]), `2026년 3월 · 2026-03-01 ~ 2026-04-05 · 1,234명 · ${STATUS_KO.closed} · 성도님께 보임`);
  assert.equal(evHint(evs[2]), `2025년 7월 · 2025-07-01 ~ 2025-08-31 · 0명 · ${STATUS_KO.archived}`);
  assert.ok(evHint({ ...evs[2], opens_on: "" }).startsWith("날짜 없음 · "));
  for (const s of ["draft", "open", "closed", "archived"]) assert.ok(evHint({ ...evs[2], status: s }).includes(STATUS_KO[s]), s);
  assert.deepEqual(pickFrom(evs, "lent-2026"), { ev: evs[1], blocked: false });
  assert.deepEqual(pickFrom(evs, "autumn-2026"), { ev: null, blocked: true });
  assert.deepEqual(pickFrom(evs, "없는-회차"), { ev: null, blocked: false });
  assert.deepEqual(pickFrom(evs, ""), { ev: null, blocked: false });
});
test("회차 고르개 차례 — 📋 회차·명단 콤보와 같게 시작일 최근 먼저(서버 차례와 달라도) · 자격 회차는 여전히 뺀다", () => {
  const evs = [
    { id: "b-late-close", title: "나중 마감", opens_on: "2026-02-15", closes_on: "2026-04-20", status: "closed", count: 1, hasEligibility: false },
    { id: "a-early-close", title: "먼저 마감", opens_on: "2026-03-01", closes_on: "2026-04-05", status: "closed", count: 2, hasEligibility: false },
    { id: "elig", title: "자격", opens_on: "2026-10-27", closes_on: "2026-11-28", status: "draft", count: 0, hasEligibility: true },
  ];
  assert.deepEqual(eventOptions(evs).map((o) => o.value), ["a-early-close", "b-late-close"]);
  assert.deepEqual(eventOptions(evs).map((o) => o.label), ["2026년 3월 · 먼저 마감", "2026년 2월 · 나중 마감"]);
  assert.equal(evs[0].id, "b-late-close", "받은 배열은 그대로");
});

test("confirmHtml — 줄바꿈 문자 없음(dialog 는 pre-line) · 이름을 esc · 건수 · 성도님께 보이는 회차면 한 줄 더", () => {
  const c = markCounts([{ mark: "add" }, { mark: "fill" }, { mark: "same" }, { mark: "blank" }, { mark: "same-name" }, { mark: "bad" }]);
  const html = confirmHtml({ id: "lent-2026", title: "<사순절>", listedNow: true }, 6, c);
  assert.ok(!html.includes("\n"), "줄바꿈 문자가 있으면 창 안에서 줄이 벌어진다");
  assert.ok(html.includes("&lt;사순절&gt;"));
  assert.ok(html.includes("<b>2명</b>을 넣습니다"));
  assert.ok(html.includes("교인명부로 빈칸을 채운 1명 포함"));
  assert.ok(html.includes("지금 적힌 6줄"));
  assert.ok(html.includes("이미 있음 1 · 소속 빈칸 2 · 모양 틀림 1"));
  assert.ok(html.includes("지금 성도님께 보여요"));
  const quiet = confirmHtml({ id: "lent-2026", title: "사순절", listedNow: false }, 1, markCounts([{ mark: "add" }]));
  assert.ok(!quiet.includes("성도님께 보여요"));
  assert.ok(!quiet.includes("넣지 않는 줄"));
  assert.ok(!quiet.includes("채운"));
});

test("confirmHtml — 넣으면 1,000명을 넘는 회차는 확인 창에도 경고 한 줄(넷째 인자 total) · 안 주면 없다 · 줄바꿈 문자 없음(overlimit-not-in-confirm)", () => {
  const ten = markCounts(Array.from({ length: 10 }, (_, i) => ({ i, mark: "add" })));
  const ev = { id: "ca-test-over", title: "ca-test 회차", listedNow: false };
  const over = confirmHtml(ev, 10, ten, 995);
  assert.ok(over.includes("1,000명을 넘어요"), over);
  assert.ok(over.includes("관리자에게 알려 주세요"));
  assert.ok(!over.includes("\n"));
  assert.ok(!confirmHtml(ev, 10, ten).includes("1,000명을 넘어요"));
  assert.ok(!confirmHtml(ev, 10, ten, 990).includes("1,000명을 넘어요"), "딱 1,000명은 넘지 않는다");
  assert.ok(!confirmHtml(ev, 10, ten).includes("\n"));
  // 경고는 「넣지 않는 줄」 문장 뒤에 온다
  const mixed = markCounts([...Array.from({ length: 10 }, (_, i) => ({ i, mark: "add" })), { i: 10, mark: "same" }]);
  const h = confirmHtml(ev, 11, mixed, 999);
  assert.ok(h.indexOf("넣지 않는 줄") < h.indexOf("1,000명을 넘어요"));
});

test("올리기 안내 — 이어진 분의 「📋 이미 내신 것」은 회차가 성도님께 보이는 동안만(v2 1498177 · M3)", () => {
  const src = readFileSync(new URL("../js/menus/bibleevent/upload.js", import.meta.url), "utf8");
  assert.ok(src.includes("이어진 분은 이 회차가 성도님께 보이는 동안 앱 「📋 이미 내신 것」에 보이고,"));
  assert.ok(!src.includes("이어진 분은 성도님 앱 「📋 이미 내신 것」에 보이고,"));
});

test("이 화면이 보일 오류 코드는 모두 한국말이 있다(ui.js MESSAGES · Task 10)", () => {
  for (const code of ["eligibility-event", "too-many", "not-found", "already", "server", "no-name", "bad-char", "too-long",
    "bad-type", "bad-group", "no-group", "bad-sub"]) {
    assert.notEqual(errorText({ error: code }), "처리하지 못했어요", code);
  }
});

test("메뉴 — 📤 명단 올리기가 📋 회차·명단 바로 다음 · CONTRACT 줄 그대로 · 역할 bibleevent", () => {
  const ids = MENUS.map((m) => m.id);
  assert.equal(ids[ids.indexOf("be-roster") + 1], "be-upload");
  const m = MENUS.find((x) => x.id === "be-upload");
  assert.deepEqual([m.group, m.icon, m.label, m.desc, m.role],
    ["성경필사(암송)", "📤", "명단 올리기", "엑셀·붙여넣기로 한꺼번에 더하기", "bibleevent"]);
});

test("화면 모듈이 Node 에서 읽힌다 — import 한 이름이 모두 있다(틀리면 여기서 SyntaxError)", async () => {
  const m = await import("../js/menus/bibleevent/upload.js");
  assert.equal(typeof m.render, "function");
});
