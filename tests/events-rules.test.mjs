import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVT_ID_RE, EVT_STATUS, BE_GU, BE_MAX_UPLOAD, BE_NOTE_MAX, BE_FIELD_MAX, BE_NEEDS_DEFAULT, BE_BAD_CHARS,
  kstToday, evtListable, isDay, isEligEvent, eligibilityStart, checkEvent, mergeEventPatch,
} from "../supabase/functions/church-admin/events-rules.ts";
import { MATCH_GU } from "../supabase/functions/church-admin/people-match.ts";

// 시험용 회차 — 다 맞는 모양. 칸 하나씩 틀려 본다.
const EV = (o = {}) => ({
  id: "ca-test-ev", title: "2026 사순절 필사", short_title: "사순절", subtitle: "", season: "2026-1Q",
  opens_on: "2026-02-18", closes_on: "2026-04-04", status: "draft", list_until: null, ...o,
});

test("상수 — 성경암송 api 와 같은 값", () => {
  assert.deepEqual(EVT_STATUS, ["draft", "open", "closed", "archived"]);
  assert.deepEqual(BE_GU, MATCH_GU);                      // 교구 차례가 교적 맞대기와 같다
  assert.deepEqual(BE_GU, ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"]);
  assert.equal(BE_MAX_UPLOAD, 600);
  assert.equal(BE_NOTE_MAX, 500);
  assert.equal(BE_FIELD_MAX, 40);
  assert.deepEqual(BE_NEEDS_DEFAULT, { position: true, phone: false, memo: false, extra: [] });
  for (const c of ['"', "\\", ",", "(", ")", "|"]) assert.ok(BE_BAD_CHARS.test("홍" + c), c);
  assert.ok(!BE_BAD_CHARS.test("홍길동-2"));
});

test("EVT_ID_RE — 소문자·숫자·- 만, 두 글자 이상, 첫 글자는 - 가 아님", () => {
  for (const ok of ["summer-2026", "lent-booklet-2025", "ca-test-1727590000000", "a1"]) assert.ok(EVT_ID_RE.test(ok), ok);
  for (const bad of ["Summer-2026", "-lent", "a", "가을-2026", "lent_2026", "lent 2026", "a".repeat(42), ""]) {
    assert.ok(!EVT_ID_RE.test(bad), bad);
  }
  assert.ok(EVT_ID_RE.test("a".repeat(41)));              // 첫 글자 + 40자까지
});

test("kstToday — 한국 자정에 날이 바뀐다", () => {
  assert.equal(kstToday(new Date("2026-09-29T14:59:59Z")), "2026-09-29");
  assert.equal(kstToday(new Date("2026-09-29T15:00:00Z")), "2026-09-30");
  assert.match(kstToday(), /^\d{4}-\d{2}-\d{2}$/);
});

test("evtListable — 성경암송 evtListable 그대로(draft·archived 안 보임 · list_until 까지)", () => {
  const T = "2026-09-29";
  assert.equal(evtListable({ status: "draft", list_until: null }, T), false);
  assert.equal(evtListable({ status: "archived", list_until: null }, T), false);
  assert.equal(evtListable({ status: "open", list_until: null }, T), true);
  assert.equal(evtListable({ status: "closed", list_until: null }, T), true);    // 마감해도 명단은 보인다
  assert.equal(evtListable({ status: "closed", list_until: "" }, T), true);      // 빈칸 = 기한 없음
  assert.equal(evtListable({ status: "closed", list_until: "2026-09-29" }, T), true);   // 그날까지는 보인다
  assert.equal(evtListable({ status: "closed", list_until: "2026-09-28" }, T), false);
  assert.equal(evtListable({ status: "open", list_until: "2026-12-31" }, T), true);
});

test("isDay — 꼴과 달력을 함께 본다", () => {
  assert.equal(isDay("2026-10-11"), true);
  assert.equal(isDay("2028-02-29"), true);                // 윤년
  assert.equal(isDay("2026-02-29"), false);
  assert.equal(isDay("2026-02-30"), false);
  assert.equal(isDay("2026-13-01"), false);
  assert.equal(isDay("2026-1-5"), false);
  assert.equal(isDay("2026/10/11"), false);
  assert.equal(isDay(""), false);
  assert.equal(isDay(null), false);
});

test("isEligEvent — needs.eligibility 가 null 아닌 객체면 자격 회차(모양이 틀려도 막는 쪽으로)", () => {
  assert.equal(isEligEvent({ position: true, eligibility: { start: "2026-10-11", weeks: 6, perWeek: 3, need: 3, minNeed: 2 } }), true);
  assert.equal(isEligEvent({ eligibility: {} }), true);          // 모양이 틀려도 자격 회차로 본다
  assert.equal(isEligEvent({ eligibility: [] }), true);
  assert.equal(isEligEvent({ eligibility: "2026-10-11" }), false);
  assert.equal(isEligEvent({ eligibility: true }), false);
  assert.equal(isEligEvent({ eligibility: null }), false);
  assert.equal(isEligEvent(BE_NEEDS_DEFAULT), false);            // 새 회차의 needs
  assert.equal(isEligEvent({}), false);
  assert.equal(isEligEvent(null), false);
  assert.equal(isEligEvent(undefined), false);
  assert.equal(isEligEvent("eligibility"), false);
});

test("eligibilityStart — 자격 회차이고 start 가 달력에 있는 YYYY-MM-DD 일 때만", () => {
  assert.equal(eligibilityStart({ eligibility: { start: "2026-10-11", weeks: 6, perWeek: 3, need: 3 } }), "2026-10-11");
  assert.equal(eligibilityStart({ position: true, eligibility: { start: " 2026-10-11 " } }), "2026-10-11");
  for (const s of ["2026-02-30", "10/11", "2026-1-5", "", null]) {
    assert.equal(eligibilityStart({ eligibility: { start: s } }), null, String(s));
  }
  assert.equal(eligibilityStart({ eligibility: { start: 20261011 } }), null);
  assert.equal(eligibilityStart({ eligibility: {} }), null);      // 자격 회차이지만 시작일을 모른다 → 검사하지 않는다
  assert.equal(eligibilityStart({ eligibility: "2026-10-11" }), null);
  assert.equal(eligibilityStart(BE_NEEDS_DEFAULT), null);
  assert.equal(eligibilityStart(null), null);
  // checkEvent 의 둘째 인자로 그대로 넘긴다
  const needs = { position: true, eligibility: { start: "2026-10-11" } };
  assert.equal(checkEvent(EV({ opens_on: "2026-10-10", closes_on: "2026-11-28" }), eligibilityStart(needs)), "before-eligibility");
  assert.equal(checkEvent(EV({ opens_on: "2026-10-10", closes_on: "2026-11-28" }), eligibilityStart(BE_NEEDS_DEFAULT)), null);
});

test("checkEvent — 다 맞으면 null", () => {
  assert.equal(checkEvent(EV(), null), null);
  assert.equal(checkEvent(EV({ opens_on: "2026-04-04" }), null), null);          // 하루짜리 회차
  assert.equal(checkEvent(EV({ list_until: "2026-04-04" }), null), null);        // 마감일과 같은 날까지 공개
  assert.equal(checkEvent(EV({ list_until: "" }), null), null);
  for (const s of ["draft", "open", "closed", "archived"]) assert.equal(checkEvent(EV({ status: s }), null), null);
});

test("checkEvent — 칸마다 코드", () => {
  assert.equal(checkEvent(EV({ title: "   " }), null), "no-title");
  assert.equal(checkEvent(EV({ opens_on: "2026-13-01" }), null), "bad-period");
  assert.equal(checkEvent(EV({ closes_on: "2026-02-30" }), null), "bad-period");
  assert.equal(checkEvent(EV({ opens_on: "20260218" }), null), "bad-period");
  assert.equal(checkEvent(EV({ opens_on: "2026-04-05" }), null), "period-reversed");
  assert.equal(checkEvent(EV({ status: "public" }), null), "bad-status");
  assert.equal(checkEvent(EV({ status: "" }), null), "bad-status");
  assert.equal(checkEvent(EV({ list_until: "2026/12/31" }), null), "bad-list-until");
  assert.equal(checkEvent(EV({ list_until: "2026-04-03" }), null), "list-until-before-close");
  assert.equal(checkEvent(EV({ opens_on: "2026-10-10", closes_on: "2026-11-28" }), "2026-10-11"), "before-eligibility");
  assert.equal(checkEvent(EV({ opens_on: "2026-10-27", closes_on: "2026-11-28" }), "2026-10-11"), null);
  assert.equal(checkEvent(EV({ opens_on: "2026-10-11", closes_on: "2026-11-28" }), "2026-10-11"), null);
});

test("checkEvent — 여러 칸이 틀리면 정해 둔 차례의 첫 코드", () => {
  const all = EV({ title: "", opens_on: "x", status: "x", list_until: "x" });
  assert.equal(checkEvent(all, "2099-01-01"), "no-title");
  assert.equal(checkEvent({ ...all, title: "t" }, "2099-01-01"), "bad-period");
  assert.equal(checkEvent(EV({ opens_on: "2026-05-01", status: "x" }), null), "period-reversed");
  assert.equal(checkEvent(EV({ status: "x", list_until: "x" }), null), "bad-status");
  assert.equal(checkEvent(EV({ list_until: "x" }), "2099-01-01"), "bad-list-until");
  assert.equal(checkEvent(EV({ list_until: "2026-01-01" }), "2099-01-01"), "list-until-before-close");
});

test("mergeEventPatch — 보낸 칸만 · 다듬기 · list_until 빈칸은 null · 원본은 그대로", () => {
  const cur = EV({ list_until: "2026-04-30", subtitle: "옛 부제" });
  const out = mergeEventPatch(cur, { title: "  2026  사순절 필사 ", list_until: "" });
  assert.equal(out.title, "2026 사순절 필사");
  assert.equal(out.list_until, null);
  assert.equal(out.subtitle, "옛 부제");                  // 안 보낸 칸은 그대로
  assert.equal(out.status, "draft");
  assert.equal(cur.list_until, "2026-04-30");             // 원본을 바꾸지 않는다
  assert.equal(cur.title, "2026 사순절 필사");
  assert.equal(mergeEventPatch(cur, { list_until: " 2026-05-01 " }).list_until, "2026-05-01");
  assert.equal(mergeEventPatch(cur, { list_until: null }).list_until, null);
  assert.equal(mergeEventPatch(cur, { subtitle: "" }).subtitle, "");          // 비우고 싶으면 빈 글자를 보낸다
  assert.equal(mergeEventPatch(cur, { status: "open" }).status, "open");
});

test("mergeEventPatch — needs·copy·kind·id·sort_order 는 받지 않는다", () => {
  const cur = EV();
  const out = mergeEventPatch(cur, { id: "other-id", needs: { eligibility: {} }, copy: { a: 1 }, kind: "quiz", sort_order: 9 });
  assert.deepEqual(out, cur);
  assert.deepEqual(mergeEventPatch(cur, null), cur);
  assert.deepEqual(mergeEventPatch(cur, ["title"]), cur);
});

// ── 줄 다듬기 · 판정표 ──────────────────────────────────────────────
// import 는 모듈 맨 위로 끌어올려진다 — 맨 위 import 블록을 고치지 않고 이 묶음이 쓰는 이름만 새 문으로 들여온다.
import { cleanPosition, tidyRow, checkRow, checkNote, tidyRaw } from "../supabase/functions/church-admin/events-rules.ts";

const R = (o = {}) => ({ who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동", position: "집사", ...o });
const raw = (name, gu, mok, pos = "") => ({ name, gu, mok, pos });

test("cleanPosition — 괄호 속·끝 「님」을 떼고 다듬는다(목록 밖 직분은 그대로)", () => {
  assert.equal(cleanPosition("집사님"), "집사");
  assert.equal(cleanPosition("안수집사님 (시무/은퇴)"), "안수집사");
  assert.equal(cleanPosition("(은퇴)장로님"), "장로");
  assert.equal(cleanPosition("  권사  "), "권사");
  assert.equal(cleanPosition("집사 님"), "집사");               // 원문은 「집사 」가 됐다 — 끝 빈칸까지 뗀다
  assert.equal(cleanPosition("명예권사"), "명예권사");
  assert.equal(cleanPosition("청년"), "청년");                  // 직분 칸에는 「부」를 붙이지 않는다
  assert.equal(cleanPosition("님"), "");
  assert.equal(cleanPosition(null), "");
});

test("tidyRow — 교구: 「화평교구」·「20목장」·「07」·「남성목장」 / 교회학교: 부서 줄임말", () => {
  assert.deepEqual(tidyRow({ who_type: "교구", group_name: " 화평교구 ", sub_name: "20목장", name: " 홍  길동 ", position: "집사님" }),
    { who_type: "교구", group_name: "화평", sub_name: "20", name: "홍 길동", position: "집사" });
  assert.equal(tidyRow(R({ sub_name: "07" })).sub_name, "7");
  assert.equal(tidyRow(R({ sub_name: "007목장" })).sub_name, "7");
  assert.equal(tidyRow(R({ sub_name: "남성목장" })).sub_name, "남성");
  assert.equal(tidyRow(R({ sub_name: "남성 목장" })).sub_name, "남성");
  assert.equal(tidyRow(R({ sub_name: "0" })).sub_name, "0");
  assert.equal(tidyRow(R({ sub_name: "00" })).sub_name, "0");
  assert.equal(tidyRow(R({ sub_name: "0012345678901234567890" })).sub_name, "12345678901234567890");   // 반올림하지 않는다
  assert.equal(tidyRow(R({ sub_name: "20-1" })).sub_name, "20-1");          // 모르는 꼴은 그대로(checkRow 가 잡는다)
  assert.equal(tidyRow(R({ who_type: "교회학교", group_name: "유년", sub_name: "" })).group_name, "유년부");
  assert.equal(tidyRow(R({ who_type: "교회학교", group_name: "중등부", sub_name: "1학년" })).sub_name, "1학년");
  assert.equal(tidyRow(R({ group_name: "화평".normalize("NFD") })).group_name, "화평");   // 소속은 완성형으로
  const nfd = "홍길동".normalize("NFD");
  assert.equal(tidyRow(R({ name: nfd })).name, nfd);                      // 이름은 NFC 로 바꾸지 않는다
});

test("checkRow — 판정표(다 맞으면 null)", () => {
  assert.equal(checkRow(R()), null);
  for (const g of ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"]) assert.equal(checkRow(R({ group_name: g })), null, g);
  for (const s of ["", "남성", "0", "7", "20", "99", "100"]) assert.equal(checkRow(R({ sub_name: s })), null, s);
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "중등부", sub_name: "" })), null);
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "청년부", sub_name: "1학년" })), null);
  assert.equal(checkRow(R({ position: "" })), null);
  assert.equal(checkRow(R({ position: "은퇴안수집사" })), null);        // 앱 목록 밖 직분도 통과(경고만)
  assert.equal(checkRow(R({ name: "가".repeat(40) })), null);
});

test("checkRow — 칸마다 코드", () => {
  assert.equal(checkRow(R({ name: "" })), "no-name");
  assert.equal(checkRow(R({ name: "   " })), "no-name");
  for (const c of ['"', "\\", ",", "(", ")", "|"]) assert.equal(checkRow(R({ name: "홍" + c + "길동" })), "bad-char", c);
  assert.equal(checkRow(R({ name: "가".repeat(41) })), "too-long");
  assert.equal(checkRow(R({ who_type: "교회" })), "bad-type");
  assert.equal(checkRow(R({ who_type: "" })), "bad-type");
  assert.equal(checkRow(R({ group_name: "" })), "no-group");
  assert.equal(checkRow(R({ group_name: "", sub_name: "" })), "no-group");
  assert.equal(checkRow(R({ group_name: "평화" })), "bad-group");
  assert.equal(checkRow(R({ group_name: "화평교구" })), "bad-group");   // 다듬기 전 값은 판정표가 받지 않는다
  for (const s of ["07", "20목장", "남성목장", "1000", "20-1", "청년", "|"]) assert.equal(checkRow(R({ sub_name: s })), "bad-sub", s);
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "", sub_name: "" })), "no-group");
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "중등(부)" })), "bad-char");
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "중등부", sub_name: "1|2" })), "bad-char");
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "가".repeat(41) })), "too-long");
  assert.equal(checkRow(R({ who_type: "교회학교", group_name: "중등부", sub_name: "가".repeat(41) })), "too-long");
  assert.equal(checkRow(R({ position: "가".repeat(41) })), "too-long");
});

test("checkRow — 여러 칸이 틀리면 이름 → 구분 → 소속 → 세부 → 직분 차례", () => {
  assert.equal(checkRow(R({ name: "", who_type: "x", group_name: "x" })), "no-name");
  assert.equal(checkRow(R({ who_type: "x", group_name: "" })), "bad-type");
  assert.equal(checkRow(R({ group_name: "", sub_name: "x" })), "no-group");
  assert.equal(checkRow(R({ group_name: "평화", sub_name: "x" })), "bad-group");
  assert.equal(checkRow(R({ sub_name: "x", position: "가".repeat(41) })), "bad-sub");
});

test("checkNote — 500자까지 · 붙임말을 붙인 뒤의 길이로 본다", () => {
  assert.equal(checkNote(""), null);
  assert.equal(checkNote(null), null);
  assert.equal(checkNote("가".repeat(500)), null);
  assert.equal(checkNote("가".repeat(501)), "note-too-long");
  // 창은 480자까지 받는다 — 「담당자가 더함 / 」(10자)을 붙여도 500 안이다
  assert.equal("담당자가 더함 / ".length, 10);
  assert.equal(checkNote("담당자가 더함 / " + "가".repeat(480)), null);
  assert.equal(checkNote("담당자가 더함 / " + "가".repeat(491)), "note-too-long");
});

test("tidyRaw — 교구 칸 「화평교구」·목장 「20목장」·「07」·「남성목장」·직분 「님」", () => {
  assert.deepEqual(tidyRaw(raw("홍길동", "화평교구", "20목장", "집사님")),
    { row: { who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동", position: "집사" }, notes: [], error: null });
  assert.equal(tidyRaw(raw("홍길동", "화평", "07", "")).row.sub_name, "7");
  assert.equal(tidyRaw(raw("홍길동", "소망", "남성목장", "")).row.sub_name, "남성");
  assert.equal(tidyRaw(raw("홍길동", "소망 교구", "남성", "")).row.group_name, "소망");
  assert.equal(tidyRaw(raw("홍길동", "사랑", "5", "")).row.group_name, "사랑");          // 교구 「사랑」은 사랑부가 아니다
  assert.equal(tidyRaw(raw("홍길동", "사랑", "5", "")).row.who_type, "교구");
  assert.deepEqual(tidyRaw(raw("홍길동", "새가족", "", "성도")).row,
    { who_type: "교구", group_name: "새가족", sub_name: "", name: "홍길동", position: "성도" });
});

test("tidyRaw — 부서 줄임말은 교구·목장 칸에만 「부」를 붙인다(직분 「청년」은 그대로)", () => {
  assert.deepEqual(tidyRaw(raw("홍길동", "유년", "", "")),
    { row: { who_type: "교회학교", group_name: "유년부", sub_name: "", name: "홍길동", position: "" },
      notes: ["「유년」 → 「유년부」로 읽었어요"], error: null });
  assert.deepEqual(tidyRaw(raw("홍길동", "교회학교", "유치", "")).row,
    { who_type: "교회학교", group_name: "유치부", sub_name: "", name: "홍길동", position: "" });
  assert.deepEqual(tidyRaw(raw("홍길동", "교회학교", "유치", "")).notes, ["「유치」 → 「유치부」로 읽었어요"]);
  assert.equal(tidyRaw(raw("홍길동", "교회학교", "사랑", "")).row.group_name, "사랑부");   // 목장 칸의 「사랑」은 부서
  assert.equal(tidyRaw(raw("홍길동", "소년2", "", "")).row.group_name, "소년2부");
  assert.equal(tidyRaw(raw("홍길동", "사랑부", "", "")).row.who_type, "교회학교");
  const pos = tidyRaw(raw("홍길동", "화평", "3", "청년"));
  assert.equal(pos.row.position, "청년");
  assert.equal(pos.row.who_type, "교구");
  assert.deepEqual(pos.notes, []);
});

test("tidyRaw — 교구 칸 「청년」·「청년부」 → 교회학교 청년부 · 목장 칸 「청년」은 버림", () => {
  assert.deepEqual(tidyRaw(raw("홍길동", "청년", "청년", "")),
    { row: { who_type: "교회학교", group_name: "청년부", sub_name: "", name: "홍길동", position: "" },
      notes: ["「청년」 → 「청년부」로 읽었어요", "목장 칸 「청년」 — 청년부에는 목장이 없어 뺐어요"], error: null });
  assert.deepEqual(tidyRaw(raw("홍길동", "청년부", "", "")),
    { row: { who_type: "교회학교", group_name: "청년부", sub_name: "", name: "홍길동", position: "" }, notes: [], error: null });
  assert.equal(tidyRaw(raw("홍길동", "청년부", "청년부", "")).row.sub_name, "");
});

test("tidyRaw — 교구 칸 「교회학교」 + 목장 칸 부서", () => {
  assert.deepEqual(tidyRaw(raw("홍길동", "교회학교", "중등부", "학생")),
    { row: { who_type: "교회학교", group_name: "중등부", sub_name: "", name: "홍길동", position: "학생" }, notes: [], error: null });
  const blank = tidyRaw(raw("홍길동", "교회학교", "", ""));
  assert.equal(blank.row.who_type, "교회학교");
  assert.equal(blank.error, "no-group");
});

test("tidyRaw — 이름 끝 숫자(동명이인 표시)는 떼고 알린다 · 숫자 앞이 한글일 때만", () => {
  const r = tidyRaw(raw("홍길동2", "화평", "20", ""));
  assert.equal(r.row.name, "홍길동");
  assert.deepEqual(r.notes, ["이름 끝 숫자를 뗐어요 (홍길동2 → 홍길동)"]);
  assert.equal(tidyRaw(raw("홍길동 12", "화평", "20", "")).row.name, "홍길동");
  assert.equal(tidyRaw(raw("ca-test-3", "화평", "20", "")).row.name, "ca-test-3");   // 시험 이름은 그대로
  assert.equal(tidyRaw(raw("2", "화평", "20", "")).row.name, "2");
  assert.deepEqual(tidyRaw(raw("홍길동", "화평", "20", "")).notes, []);
});

test("tidyRaw — 빈칸·틀린 줄은 row 를 돌려주고 error 에 코드", () => {
  assert.deepEqual(tidyRaw(raw("", "", "", "")), { row: null, notes: [], error: "no-name" });
  assert.deepEqual(tidyRaw(raw("  ", " ", "", "")), { row: null, notes: [], error: "no-name" });
  const noName = tidyRaw(raw("", "화평", "20", "집사"));
  assert.equal(noName.error, "no-name");
  assert.equal(noName.row.group_name, "화평");
  const blank = tidyRaw(raw("홍길동", "", "", "집사"));            // 소속 없음 = 「빈칸」
  assert.deepEqual(blank.row, { who_type: "교구", group_name: "", sub_name: "", name: "홍길동", position: "집사" });
  assert.equal(blank.error, "no-group");
  assert.equal(tidyRaw(raw("홍길동", "", "20", "")).error, "no-group");
  assert.equal(tidyRaw(raw("홍길동", "평화", "20", "")).error, "bad-group");
  assert.equal(tidyRaw(raw("홍길동", "화평", "20-1", "")).error, "bad-sub");
  assert.equal(tidyRaw(raw("홍,길동", "화평", "20", "")).error, "bad-char");
  assert.equal(tidyRaw(raw("홍길동", "화평".normalize("NFD"), "20", "")).error, null);   // 맥 엑셀의 자모분리 교구
});

test("tidyRaw — 제목 줄은 화면이 거른다: 여기로 오면 그냥 한 줄(소속 없음)로 판정", () => {
  const t = tidyRaw(raw("성명", "교구", "목장", "직분"));
  assert.equal(t.row.name, "성명");
  assert.equal(t.error, "no-group");
});

// ── 신원 키 ────────────────────────────────────────────────────────
import { identKey, candidateKeys } from "../supabase/functions/church-admin/events-rules.ts";

// 성경암송 api/index.ts 의 norm·identityKey(파일 맨 앞 「const norm =」·「const identityKey =」 두 줄)를 **글자 그대로** 옮겨 둔다 —
// identKey 가 이것과 한 바이트라도 다르면 담당자가 넣은 줄이 앱 계정과 영영 안 이어진다. 원문이 바뀌면 이 두 줄도 함께 바꾼다.
const v2norm = (s) => (s ?? "").toString().trim().replace(/\s+/g, " ");
const v2identityKey = (u) => [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(v2norm).join("|");
// 성경암송 eventImport 가 줄을 키로 만드는 모양(교구: gu·mok / 교회학교: bu·grade)
const v2importKey = (r) => {
  const isGu = r.who_type === "교구";
  return v2identityKey({ type: r.who_type, gu: isGu ? r.group_name : "", mok: isGu ? r.sub_name : "",
    bu: isGu ? "" : r.group_name, grade: isGu ? "" : r.sub_name, name: r.name });
};

test("identKey — 성경암송 identityKey 와 바이트까지 같다", () => {
  const nfd = "홍길동".normalize("NFD");
  const samples = [
    [R(), "교구|화평|20|||홍길동"],
    [R({ group_name: "새가족", sub_name: "" }), "교구|새가족||||홍길동"],
    [R({ group_name: "소망", sub_name: "남성" }), "교구|소망|남성|||홍길동"],
    [R({ who_type: "교회학교", group_name: "중등부", sub_name: "" }), "교회학교|||중등부||홍길동"],
    [R({ who_type: "교회학교", group_name: "청년부", sub_name: "1" }), "교회학교|||청년부|1|홍길동"],
    [R({ name: " 홍  길동 " }), "교구|화평|20|||홍 길동"],
    [R({ name: nfd }), "교구|화평|20|||" + nfd],
  ];
  for (const [row, want] of samples) {
    const got = identKey(row);
    assert.equal(got, want);
    assert.equal(got, v2importKey(row));
    assert.ok(Buffer.from(got, "utf8").equals(Buffer.from(v2importKey(row), "utf8")));
  }
  assert.notEqual(identKey(R({ name: nfd })), identKey(R()));   // NFC 로 바꾸지 않는다
});

test("identKey — 앱에서 낸 줄(users 값으로 만든 키)과도 같다", () => {
  // eventSignup 은 identityKey(users 한 줄)을 넣는다 — 교구 계정의 bu·grade 는 null 일 수 있다
  const u = { type: "교구", gu: "화평", mok: "20", bu: null, grade: null, name: "홍길동" };
  assert.equal(identKey(R()), v2identityKey(u));
  const s = { type: "교회학교", gu: null, mok: null, bu: "중등부", grade: "2", name: "홍길동" };
  assert.equal(identKey(R({ who_type: "교회학교", group_name: "중등부", sub_name: "2" })), v2identityKey(s));
});

test("candidateKeys — 첫 값은 정본 · 목장 「7」↔「07」·「7목장」 · 이름 NFC↔NFD", () => {
  const nfd = "홍길동".normalize("NFD");
  const keys = candidateKeys(R({ sub_name: "7" }));
  assert.equal(keys[0], identKey(R({ sub_name: "7" })));
  for (const m of ["7", "7목장", "07", "07목장"]) {
    assert.ok(keys.includes(`교구|화평|${m}|||홍길동`), m);
    assert.ok(keys.includes(`교구|화평|${m}|||${nfd}`), m + " NFD");
  }
  assert.equal(keys.length, 8);
  assert.equal(new Set(keys).size, keys.length);                 // 겹침 없음
});

test("candidateKeys — 두 자리 목장은 「0N」을 만들지 않는다 · 앱 줄의 「07」도 「7」을 찾는다", () => {
  const k20 = candidateKeys(R({ sub_name: "20" }));
  assert.ok(k20.includes("교구|화평|20|||홍길동"));
  assert.ok(k20.includes("교구|화평|20목장|||홍길동"));
  assert.ok(!k20.some((k) => k.includes("|020")));
  const k07 = candidateKeys(R({ sub_name: "07" }));             // 앱에서 「07」로 가입한 분의 줄
  assert.ok(k07.includes("교구|화평|7|||홍길동"));
  assert.ok(k07.includes("교구|화평|07|||홍길동"));
});

test("candidateKeys — 「남성」·빈 목장·교회학교는 목장 변형이 없다", () => {
  assert.deepEqual(candidateKeys(R({ group_name: "소망", sub_name: "남성" })).filter((k) => !k.endsWith("홍길동".normalize("NFD"))),
    ["교구|소망|남성|||홍길동"]);
  assert.deepEqual(candidateKeys(R({ group_name: "새가족", sub_name: "" })).length, 2);   // 이름 두 꼴
  const kid = candidateKeys(R({ who_type: "교회학교", group_name: "중등부", sub_name: "1" }));
  assert.deepEqual(kid, ["교회학교|||중등부|1|홍길동", "교회학교|||중등부|1|" + "홍길동".normalize("NFD")]);
});

test("candidateKeys — 자모분리(NFD)로 적힌 이름은 완성형 키도 만든다", () => {
  const nfd = "홍길동".normalize("NFD");
  const keys = candidateKeys(R({ name: nfd }));
  assert.equal(keys[0], "교구|화평|20|||" + nfd);
  assert.ok(keys.includes("교구|화평|20|||홍길동"));
});

// ---------- 회차 만들기·설정 도움 함수(Task 6) ----------
// import 는 끌어올려진다 — 파일 끝에 두어도 맨 위의 import 와 함께 먼저 읽힌다. Task 2 가 들여온 이름과 겹치지 않게.
import { EV_EDIT_KEYS, EV_CREATE_KEYS, pickEventPatch, eventFields, eventDiff, mergeEventPatch as mergeForKeyCheck }
  from "../supabase/functions/church-admin/events-rules.ts";

test("EV_EDIT_KEYS·EV_CREATE_KEYS — needs·copy·kind·id·sort_order 는 없다 · 만들기엔 status 도 없다", () => {
  assert.deepEqual(EV_EDIT_KEYS, ["title", "short_title", "subtitle", "season", "opens_on", "closes_on", "status", "list_until"]);
  for (const k of ["needs", "copy", "kind", "id", "sort_order", "updated_at"]) assert.ok(!EV_EDIT_KEYS.includes(k), k);
  assert.deepEqual(EV_CREATE_KEYS, ["title", "short_title", "subtitle", "season", "opens_on", "closes_on", "list_until"]);
});

test("EV_EDIT_KEYS 는 mergeEventPatch 가 받는 여덟 칸과 같다 — 어긋나면 고친 칸이 조용히 버려진다", () => {
  const cur = eventFields({ id: "x-1", title: "가", short_title: "나", subtitle: "다", season: "라",
    opens_on: "2026-10-01", closes_on: "2026-10-31", status: "draft", list_until: "2026-12-31" });
  const patch = { title: "t2", short_title: "s2", subtitle: "u2", season: "q2", opens_on: "2027-01-01",
    closes_on: "2027-01-31", status: "open", list_until: "2027-12-31" };
  assert.deepEqual(Object.keys(patch).sort(), [...EV_EDIT_KEYS].sort());
  const out = mergeForKeyCheck(cur, patch);
  for (const k of EV_EDIT_KEYS) assert.equal(out[k], patch[k], k);
  assert.equal(out.id, "x-1");
});

test("pickEventPatch — 고칠 수 있는 칸만 · 보낸 칸만 · 값은 글자로", () => {
  const p = pickEventPatch({ title: " 새 이름 ", needs: { eligibility: {} }, copy: { intro: "x" }, kind: "quiz",
    id: "other-id", sort_order: 3, list_until: null }, EV_EDIT_KEYS);
  assert.deepEqual(p, { title: " 새 이름 ", list_until: "" });            // 다듬기(trim)는 mergeEventPatch 가 한다
  assert.deepEqual(pickEventPatch({ status: "open", title: "가" }, EV_CREATE_KEYS), { title: "가" });
  assert.deepEqual(pickEventPatch({ title: 12, subtitle: true, season: { a: 1 }, opens_on: Number.NaN, closes_on: undefined }, EV_EDIT_KEYS),
    { title: "12", subtitle: "", season: "", opens_on: "", closes_on: "" });
  assert.deepEqual(pickEventPatch(null, EV_EDIT_KEYS), {});
  assert.deepEqual(pickEventPatch(["title"], EV_EDIT_KEYS), {});
  assert.deepEqual(pickEventPatch("title", EV_EDIT_KEYS), {});
  assert.deepEqual(pickEventPatch(Object.create({ title: "물려받은 칸" }), EV_EDIT_KEYS), {});   // hasOwnProperty
});

test("eventFields — 표의 한 줄 → 아홉 칸 · 나머지 칸은 버린다 · list_until 빈 것은 null", () => {
  assert.deepEqual(eventFields({ id: "lent-2026", title: "사순절", short_title: "", subtitle: null, season: "2026-1Q",
    opens_on: "2026-02-18", closes_on: "2026-04-04", status: "closed", list_until: null,
    needs: { position: true }, copy: {}, kind: "signup", sort_order: 0, updated_at: "2026-09-29T00:00:00+00:00" }),
    { id: "lent-2026", title: "사순절", short_title: "", subtitle: "", season: "2026-1Q",
      opens_on: "2026-02-18", closes_on: "2026-04-04", status: "closed", list_until: null });
  assert.deepEqual(eventFields({ list_until: "" }),
    { id: "", title: "", short_title: "", subtitle: "", season: "", opens_on: "", closes_on: "", status: "", list_until: null });
  assert.equal(eventFields({ list_until: "2026-12-31" }).list_until, "2026-12-31");
});

test("eventDiff — 바뀐 칸만 전·후 · 같으면 빈 것 · id 는 보지 않는다", () => {
  const a = eventFields({ id: "x-1", title: "가", opens_on: "2026-10-01", closes_on: "2026-10-31", status: "draft", list_until: null });
  assert.deepEqual(eventDiff(a, { ...a }), { before: {}, after: {} });
  assert.deepEqual(eventDiff(a, { ...a, status: "open", list_until: "2026-12-31" }),
    { before: { status: "draft", list_until: null }, after: { status: "open", list_until: "2026-12-31" } });
  assert.deepEqual(eventDiff({ ...a, list_until: "2026-12-31" }, a),
    { before: { list_until: "2026-12-31" }, after: { list_until: null } });
  assert.deepEqual(eventDiff(a, { ...a, id: "y-2" }), { before: {}, after: {} });
});
