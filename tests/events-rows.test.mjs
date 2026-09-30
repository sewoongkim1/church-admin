import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADD_TAG, ROW_FIELDS, formRow, rowPatch, touchesRow, checkChanged, sameKeys, askableKeys, tagNote, oddPosition,
} from "../supabase/functions/church-admin/events-rows.ts";
import { candidateKeys } from "../supabase/functions/church-admin/events-rules.ts";

const row = (o = {}) => ({ who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동", position: "집사", ...o });

test("formRow — 교구 칸 끝 「교구」·목장 「N목장」·앞자리 0·「남성목장」·직분 「님」·괄호를 다듬는다(tidyRow 와 같은 규칙)", () => {
  assert.deepEqual(formRow({ who_type: "교구", group: "화평교구", sub: "07", name: "  홍길동 ", position: "집사님", note: "무시" }),
    { who_type: "교구", group_name: "화평", sub_name: "7", name: "홍길동", position: "집사" });
  assert.equal(formRow({ who_type: "교구", group: "화평", sub: "20목장", name: "홍길동" }).sub_name, "20");
  assert.equal(formRow({ who_type: "교구", group: "화평", sub: " 20 목장 ", name: "홍길동" }).sub_name, "20");
  assert.equal(formRow({ who_type: "교구", group: "소망", sub: "남성목장", name: "홍길동" }).sub_name, "남성");
  assert.equal(formRow({ who_type: "교구", group: "화평", sub: "00", name: "홍길동" }).sub_name, "0");
  assert.equal(formRow({ who_type: "교구", group: "화평", sub: "", name: "홍길동" }).sub_name, "");
  // Number() 로 바꾸지 않는다 — 긴 숫자도 앞 0 만 뗀다
  assert.equal(formRow({ who_type: "교구", group: "화평", sub: "0012345678901234567890", name: "홍길동" }).sub_name,
    "12345678901234567890");
  assert.equal(formRow({ who_type: "교구", group: "화평", name: "홍길동", position: "은퇴권사(협동)" }).position, "은퇴권사");
  // 소속 칸은 완성형(NFC)으로 · 이름은 적은 그대로(앱 로그인 키와 맞게 — NFC 로 바꾸지 않는다)
  const nfd = "홍길동".normalize("NFD");
  const r = formRow({ who_type: "교구", group: "화평".normalize("NFD"), sub: "1", name: nfd });
  assert.equal(r.group_name, "화평");
  assert.equal(r.name, nfd);
});

test("formRow — 교회학교는 부서 줄임말에 「부」만 붙이고 학년은 그대로(학년 「03」을 목장처럼 다듬지 않는다)", () => {
  assert.deepEqual(formRow({ who_type: "교회학교", group: " 청년부 ", sub: "03", name: "홍길동", position: "" }),
    { who_type: "교회학교", group_name: "청년부", sub_name: "03", name: "홍길동", position: "" });
  assert.equal(formRow({ who_type: "교회학교", group: "유년", sub: "", name: "홍길동" }).group_name, "유년부");
});

test("formRow — 객체가 아니면 빈 줄(검사는 checkRow 가 한다)", () => {
  const empty = { who_type: "", group_name: "", sub_name: "", name: "", position: "" };
  assert.deepEqual(formRow(null), empty);
  assert.deepEqual(formRow([1, 2]), empty);
  assert.deepEqual(formRow("홍길동"), empty);
});

test("rowPatch — 보낸 칸만 다듬어 얹고, 실제로 바뀐 칸만 센다(안 보낸 옛 값은 그대로)", () => {
  assert.deepEqual([...ROW_FIELDS], ["who_type", "group_name", "sub_name", "name", "position"]);
  const cur = row({ group_name: "화평교구", sub_name: "30", name: "홍(길동)" });
  const a = rowPatch(cur, { position: "권사님" });
  assert.deepEqual(a.changed, ["position"]);
  assert.equal(a.next.position, "권사");
  assert.equal(a.next.group_name, "화평교구");   // 안 보낸 칸은 다듬지 않는다
  assert.equal(a.next.name, "홍(길동)");
  assert.deepEqual(rowPatch(cur, { sub: "030" }).changed, []);            // 다듬으면 같은 값
  assert.deepEqual(rowPatch(cur, { sub: "31목장" }).changed, ["sub_name"]);
  assert.deepEqual(rowPatch(cur, { note: "메모만" }).changed, []);         // 메모는 이 함수 밖
  assert.deepEqual(rowPatch(cur, null).changed, []);
  const b = rowPatch(row({ who_type: "교회학교", group_name: "청년부", sub_name: "" }), { who_type: "교구", group: "믿음교구", sub: "3" });
  assert.deepEqual(b.changed, ["who_type", "group_name", "sub_name"]);
  assert.deepEqual(b.next, { who_type: "교구", group_name: "믿음", sub_name: "3", name: "홍길동", position: "집사" });
});

test("touchesRow — 메모 밖 칸이 오기만 해도(값이 같아도) true", () => {
  assert.equal(touchesRow({ note: "x" }), false);
  assert.equal(touchesRow({}), false);
  assert.equal(touchesRow(null), false);
  for (const k of ["who_type", "group", "sub", "name", "position"]) assert.equal(touchesRow({ note: "x", [k]: "" }), true, k);
});

test("checkChanged — 바뀐 칸만 검사한다(옛 이름의 괄호·「화평교구」 때문에 막히지 않는다)", () => {
  const cur = row({ group_name: "화평교구", sub_name: "30", name: "홍(길동)" });
  const ok = rowPatch(cur, { position: "권사" });
  assert.equal(checkChanged(ok.next, ok.changed), null);
  const n = rowPatch(cur, { name: "홍,길동" });
  assert.equal(checkChanged(n.next, n.changed), "bad-char");
  const e = rowPatch(cur, { name: "" });
  assert.equal(checkChanged(e.next, e.changed), "no-name");
  const g = rowPatch(cur, { group: "없는" });
  assert.equal(checkChanged(g.next, g.changed), "bad-group");
  const s = rowPatch(cur, { sub: "셋" });
  assert.equal(checkChanged(s.next, s.changed), "bad-sub");
  const p = rowPatch(cur, { position: "가".repeat(41) });
  assert.equal(checkChanged(p.next, p.changed), "too-long");
  assert.equal(checkChanged(cur, []), null);   // 아무것도 안 바뀜 — 옛 값이 틀려도 통과
});

test("checkChanged — 구분이 바뀌면 교구·목장을 새 구분의 규칙으로 다시 본다", () => {
  const kid = row({ who_type: "교회학교", group_name: "청년부", sub_name: "" });
  const t1 = rowPatch(kid, { who_type: "교구" });
  assert.equal(checkChanged(t1.next, t1.changed), "bad-group");        // 「청년부」는 교구가 아니다
  const t2 = rowPatch(kid, { who_type: "교구", group: "믿음", sub: "3" });
  assert.equal(checkChanged(t2.next, t2.changed), null);
  const t3 = rowPatch(row(), { who_type: "성가대" });
  assert.equal(checkChanged(t3.next, t3.changed), "bad-type");
});

test("sameKeys — candidateKeys 와 같다(규칙 하나) · 한 자리 목장은 「0N」 꼴도(앱 로그인 「07」 · 설계 §1-1) · 두 자리·남성·교회학교는 안 붙인다", () => {
  const r7 = row({ group_name: "사랑", sub_name: "7" });
  assert.deepEqual(sameKeys(r7), candidateKeys(r7));
  const k = sameKeys(r7);
  for (const want of ["교구|사랑|7|||홍길동", "교구|사랑|7목장|||홍길동", "교구|사랑|07|||홍길동"]) assert.ok(k.includes(want), want);
  assert.equal(new Set(k).size, k.length, "중복 없음");
  assert.ok(!sameKeys(row({ sub_name: "12" })).some((x) => x.includes("|012|")));
  assert.ok(!sameKeys(row({ sub_name: "남성" })).some((x) => x.includes("|0남성|")));
  assert.ok(!sameKeys(row({ who_type: "교회학교", group_name: "청년부", sub_name: "1" })).some((x) => x.includes("|01|")));
  // 이름이 자모분리(NFD)여도 완성형 키가 「0N」 꼴에 함께 나온다
  assert.ok(sameKeys(row({ group_name: "사랑", sub_name: "7", name: "홍길동".normalize("NFD") })).includes("교구|사랑|07|||홍길동"));
});

test("askableKeys — .in() 이 깨지는 글자(\" \\ , ( ))가 든 키는 묻지 않는다 · 「|」는 둔다 · 겹침·빈 것 뺌", () => {
  assert.deepEqual(askableKeys([
    "교구|화평|1|||홍길동", "교구|화평|1|||홍길동", "", null,
    "교구|화평|1|||홍(길동)", '교구|화평|1|||홍"길동', "교구|화평|1|||홍,길동", "교구|화평|1|||홍\\길동",
    "교회학교|||청년부||홍길동",
  ]), ["교구|화평|1|||홍길동", "교회학교|||청년부||홍길동"]);
  assert.deepEqual(askableKeys([]), []);
});

test("tagNote — 머리 표기 · 「 / 」로 잇기 · 두 번 붙이지 않기 · 한 줄로", () => {
  assert.equal(ADD_TAG, "담당자가 더함");
  assert.equal(tagNote(ADD_TAG, ""), "담당자가 더함");
  assert.equal(tagNote(ADD_TAG, null), "담당자가 더함");
  assert.equal(tagNote(ADD_TAG, "  시험   메모 "), "담당자가 더함 / 시험 메모");
  assert.equal(tagNote(ADD_TAG, "시험\n메모"), "담당자가 더함 / 시험 메모");
  assert.equal(tagNote(ADD_TAG, "담당자가 더함"), "담당자가 더함");
  assert.equal(tagNote(ADD_TAG, "담당자가 더함 / 시험"), "담당자가 더함 / 시험");
  assert.equal(tagNote("명단 올리기", "소속: 교인명부로 채움"), "명단 올리기 / 소속: 교인명부로 채움");
  // 머리 표기 「담당자가 더함 / 」는 10자 — 서버는 붙인 **뒤** 500자로 센다(계약 §5 · 창의 상한은 480)
  assert.equal(tagNote(ADD_TAG, "가".repeat(490)).length, 500);
});

test("oddPosition — 앱 직분 목록(9개) 밖이면 true · 빈칸은 false", () => {
  assert.equal(oddPosition("집사"), false);
  assert.equal(oddPosition(""), false);
  assert.equal(oddPosition("명예권사"), true);
  assert.equal(oddPosition("은퇴장로"), true);
});

// ---------- 목장이 비었거나 99 인 줄 — 같은 분 판정을 목장 빼고(최종 검토 I1 · 2026-09-30) ----------
// 앱 로그인은 목장이 없으면 「99」로 받고, 담당자 줄은 목장을 비워 둘 수 있다(checkRow 가 받는다).
// 그 줄과 목장이 적힌 줄(교인명부로 채운 「20」 등)은 신원 키가 달라 같은 분으로 안 보였다.
import { openMok, looseKey, looseSame } from "../supabase/functions/church-admin/events-rows.ts";

test("openMok — 빈 목장·「99」(「099」·「99목장」·띄어쓰기) 만 true · 다른 번호·남성은 false", () => {
  for (const s of ["", "  ", "99", "099", "99목장", " 99 목장 ", null, undefined]) assert.equal(openMok(s), true, String(s));
  for (const s of ["20", "9", "0", "199", "남성", "20목장"]) assert.equal(openMok(s), false, s);
});

test("looseKey — 교구 줄만 구분|교구|이름(완성형 · 앞뒤 빈칸 뗌) · 교회학교·이름 없음·교구 없음은 null", () => {
  assert.equal(looseKey(row()), "교구|화평|홍길동");
  assert.equal(looseKey(row({ name: " 홍길동 ".normalize("NFD"), sub_name: "" })), "교구|화평|홍길동");
  assert.equal(looseKey(row({ who_type: "교회학교", group_name: "중등부", sub_name: "" })), null);
  assert.equal(looseKey(row({ name: "" })), null);
  assert.equal(looseKey(row({ group_name: "" })), null);
});

test("looseSame — 같은 교구·같은 이름이고 한쪽 목장이 비었거나 99 면 같은 분 · 둘 다 번호면 번호가 같아도 여기서는 false(정본 키가 본다)", () => {
  assert.equal(looseSame(row({ sub_name: "" }), row({ sub_name: "20" })), true);
  assert.equal(looseSame(row({ sub_name: "20" }), row({ sub_name: "99" })), true);
  assert.equal(looseSame(row({ sub_name: "99" }), row({ sub_name: "" })), true);
  assert.equal(looseSame(row({ sub_name: "" }), row({ sub_name: "", name: "홍길동".normalize("NFD") })), true);
  assert.equal(looseSame(row({ sub_name: "20" }), row({ sub_name: "30" })), false);
  assert.equal(looseSame(row({ sub_name: "20" }), row({ sub_name: "20" })), false);
  assert.equal(looseSame(row({ sub_name: "" }), row({ sub_name: "20", group_name: "소망" })), false);
  assert.equal(looseSame(row({ sub_name: "" }), row({ sub_name: "20", name: "홍길순" })), false);
  assert.equal(looseSame(row({ who_type: "교회학교", group_name: "중등부", sub_name: "" }),
    row({ who_type: "교회학교", group_name: "중등부", sub_name: "2" })), false, "교회학교(학년)는 느슨하게 보지 않는다");
});

// ---------- 구분만 바꾸고 소속을 안 보내면 no-group(최종 검토 M4 · 2026-09-30) ----------
// 옛 구분의 교구·부서가 새 구분에 그대로 남지 않게 — 「교구 화평 20」 줄을 구분만 교회학교로 바꾸면 「교회학교 화평 20」이 됐다.
test("checkChanged — 구분만 바꾸고 소속(교구·부서)을 안 보내면 no-group · 소속을 함께 보내면 통과(학년·목장 칸은 막지 않는다 · M4)", () => {
  const cur = { who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동", position: "" };
  const a = rowPatch(cur, { who_type: "교회학교" });
  assert.equal(checkChanged(a.next, a.changed), "no-group");
  // 소속을 보냈으면 통과 — 학년 칸 20 은 막지 않는다(화면은 같은 값을 다시 보내지 않는다 ·
  // 막으면 「교회학교 3학년 → 교구 3목장」 같은 정상 고치기가 막힌다)
  const b = rowPatch(cur, { who_type: "교회학교", group: "중등부" });
  assert.equal(checkChanged(b.next, b.changed), null);
  const kid = { who_type: "교회학교", group_name: "중등부", sub_name: "3", name: "홍길동", position: "" };
  const c = rowPatch(kid, { who_type: "교구", group: "화평" });
  assert.equal(checkChanged(c.next, c.changed), null);
  // 구분이 안 바뀌면 그대로(보낸 칸이 없어도)
  const d = rowPatch(cur, { who_type: "교구" });
  assert.equal(checkChanged(d.next, d.changed), null);
});

// ---------- .in() 묶음 — 개수(100)와 주소 길이(6KB)로 함께 자른다(최종 검토 SEC-4 · churchcands-url-length) ----------
import { inChunks } from "../supabase/functions/church-admin/events-rows.ts";

const encLen = (part) => part.reduce((s, k) => s + encodeURIComponent(k).length + 3, 0);
const SYL = "가나다라마바사아자차카타파하";
const shortKey = (i) => SYL[i % 14] + SYL[Math.floor(i / 14) % 14];   // 두 글자 이름 키(명부 name_key 꼴) — 100개면 2.1KB

test("inChunks — 빈 목록 · 짧은 키는 100개씩 · 긴 한글 키는 6KB 안쪽으로 · 차례·개수 그대로 · 혼자 넘는 키는 혼자 한 묶음 · maxCount", () => {
  assert.deepEqual(inChunks([]), []);
  const k100 = Array.from({ length: 100 }, (_, i) => shortKey(i));
  assert.deepEqual(inChunks(k100).map((p) => p.length), [100]);
  const k101 = Array.from({ length: 101 }, (_, i) => shortKey(i));
  assert.deepEqual(inChunks(k101).map((p) => p.length), [100, 1]);
  // 40자 한글 이름 키 150개 — 한 자 = 9바이트(%XX 셋)라 100개면 36KB. 묶음마다 6,000 이하
  const long = Array.from({ length: 150 }, (_, i) => "험".repeat(38) + SYL[i % 14] + SYL[Math.floor(i / 14) % 14]);
  const parts = inChunks(long);
  assert.ok(parts.length > 1, "여러 묶음");
  for (const p of parts) {
    assert.ok(p.length >= 1 && p.length <= 100, "개수 " + p.length);
    assert.ok(encLen(p) <= 6000, "주소 길이 " + encLen(p));
  }
  assert.deepEqual(parts.flat(), long, "차례·개수 그대로");
  // 한 키가 혼자 6KB 를 넘으면 그 키만 한 묶음 — 판정을 조용히 건너뛰지 않는다
  const huge = "가".repeat(700);
  assert.deepEqual(inChunks(["가", huge, "나"]), [["가"], [huge], ["나"]]);
  assert.deepEqual(inChunks([huge]), [[huge]]);
  // maxCount·maxBytes 인자를 따른다
  assert.deepEqual(inChunks(["a", "b", "c", "d", "e"], 6000, 2), [["a", "b"], ["c", "d"], ["e"]]);
  assert.deepEqual(inChunks(["ab", "cd", "ef"], 10), [["ab", "cd"], ["ef"]]);   // (2+3)+(2+3) = 10 까지
});
