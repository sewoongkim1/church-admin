// 📋 회차·명단의 순수 함수(js/menus/bibleevent/roster-logic.js). HTML 조각은 tests/be-roster-ui.test.mjs,
// 창·화면(event-form.js·row-form.js·roster.js)은 브라우저에서 본다(Task 10 Step 16 · Task 14 점검표). 이름은 가짜(홍길동·성춘향 …)만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GU_ORDER, BU_ORDER, EV_STATUS, STATUS_KO, STATUS_HINT, SRC_LABEL, CHURCH_STATES, EV_EDIT_KEYS, ROW_KEYS, NOTE_FORM_MAX,
  norm, blankFilter, filterActive, groupKey, groupRows, filterRows, dupFlags, positionCounts, csvText, sortEvents,
  tidyMok, whoText, subText, eventPatch, rowPatch } from "../js/menus/bibleevent/roster-logic.js";
import { BE_GU, EVT_STATUS, EV_EDIT_KEYS as SERVER_EDIT_KEYS, BE_NOTE_MAX } from "../supabase/functions/church-admin/events-rules.ts";

const R = (o) => ({ id: 1, who_type: "교구", group: "화평", sub: "20", name: "홍길동", position: "", note: "", source: "import",
  hasUser: false, at: "2026-09-01", updated_at: "2026-09-01T00:00:00Z", church: null, ...o });

test("서버와 같은 표 — 교구 차례 · 상태 · 회차 설정 칸 · 메모 상한(브라우저는 .ts 를 못 읽어 한 벌 더 둔다)", () => {
  assert.deepEqual(GU_ORDER, BE_GU);
  assert.deepEqual(EV_STATUS, EVT_STATUS);
  assert.deepEqual(EV_EDIT_KEYS, SERVER_EDIT_KEYS);
  for (const s of EV_STATUS) { assert.ok(STATUS_KO[s], s); assert.ok(STATUS_HINT[s], s); }
  assert.deepEqual(BU_ORDER, ["사랑부", "영아부", "유아부", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부"]);
  assert.deepEqual(SRC_LABEL, { app: "📱 앱", import: "📋 이관" });
  assert.deepEqual(CHURCH_STATES, ["맞음", "확인 필요", "없음"]);
  assert.deepEqual(ROW_KEYS, ["who_type", "group", "sub", "name", "position", "note"]);
  // 서버는 「담당자가 더함 / 」(10자)를 붙인 **뒤** 500자로 센다 — 창 상한 480 이면 붙여도 넘지 않는다(계약 §5)
  assert.equal(NOTE_FORM_MAX, 480);
  assert.ok(NOTE_FORM_MAX + "담당자가 더함 / ".length <= BE_NOTE_MAX);
});

test("norm — 서버 legacyNorm 과 같다(앞뒤 떼고 가운데 빈칸·줄바꿈은 하나로)", () => {
  assert.equal(norm("  홍  길동 "), "홍 길동");
  assert.equal(norm("전화로\n\n확인"), "전화로 확인");
  assert.equal(norm(null), "");
});

test("groupRows — 교구(앱 차례) → 모르는 교구 → 교회학교(앱 차례) → 모르는 부서 → 구분 없음 · 안에서는 목장 숫자 → 숫자 아닌 것 → 이름", () => {
  const rows = [
    R({ id: 1, group: "화평", sub: "20", name: "홍길동" }),
    R({ id: 2, group: "화평", sub: "3", name: "성춘향" }),
    R({ id: 3, group: "화평", sub: "남성", name: "이몽룡" }),
    R({ id: 4, group: "믿음", sub: "1", name: "홍길순" }),
    R({ id: 5, who_type: "교회학교", group: "청년부", sub: "", name: "방자" }),
    R({ id: 6, who_type: "교회학교", group: "중등부", sub: "", name: "향단" }),
    R({ id: 7, who_type: "교회학교", group: "소년2부", sub: "", name: "월매" }),
    R({ id: 8, group: "하늘", sub: "1", name: "변학도" }),
    R({ id: 9, group: "화평", sub: "10", name: "심청" }),
    R({ id: 10, group: "화평", sub: "", name: "흥부" }),
    R({ id: 11, group: "화평", sub: "10", name: "놀부" }),
    R({ id: 12, who_type: "", group: "", sub: "", name: "뺑덕" }),
  ];
  const g = groupRows(rows);
  assert.deepEqual(g.map((x) => x.key), ["교구|믿음", "교구|화평", "교구|하늘", "교회학교|중등부", "교회학교|청년부", "교회학교|소년2부", "|"]);
  assert.deepEqual(g.map((x) => x.label), ["믿음", "화평", "하늘", "중등부", "청년부", "소년2부", "소속 없음"]);
  assert.deepEqual(g[1].rows.map((r) => r.id), [2, 11, 9, 1, 10, 3]);   // 3 · 10(놀부·심청 가나다) · 20 · 빈칸 · 남성
  assert.equal(groupKey(rows[0]), "교구|화평");
  assert.deepEqual(rows.map((r) => r.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);   // 받은 배열은 그대로
  assert.deepEqual(groupRows([]), []);
});

test("filterRows — 교구·부서 · 직분(빈 것 = 직분 없음) · 교적 · 출처 · 찾기(이름·소속·직분, NFC) · 비면 전체", () => {
  const rows = [
    R({ id: 1, name: "홍길동", position: "집사", source: "app", church: { state: "맞음", reason: "" } }),
    R({ id: 2, name: "성춘향", group: "믿음", sub: "3", position: "", church: { state: "없음", reason: "" } }),
    R({ id: 3, name: "방자", who_type: "교회학교", group: "청년부", sub: "", position: "청년", church: null }),
  ];
  const ids = (f) => filterRows(rows, { ...blankFilter(), ...f }).map((r) => r.id);
  assert.deepEqual(ids({}), [1, 2, 3]);
  assert.deepEqual(ids({ groups: ["교구|믿음", "교회학교|청년부"] }), [2, 3]);
  assert.deepEqual(ids({ positions: [""] }), [2]);
  assert.deepEqual(ids({ positions: ["집사", "청년"] }), [1, 3]);
  assert.deepEqual(ids({ church: "없음" }), [2]);
  assert.deepEqual(ids({ church: "맞음" }), [1]);
  assert.deepEqual(ids({ source: "app" }), [1]);
  assert.deepEqual(ids({ source: "import" }), [2, 3]);
  assert.deepEqual(ids({ q: "춘향" }), [2]);
  assert.deepEqual(ids({ q: "믿음 3목장" }), [2]);
  assert.deepEqual(ids({ q: " 청년 " }), [3]);
  assert.deepEqual(ids({ q: "홍길동".normalize("NFD") }), [1]);
  assert.deepEqual(ids({ groups: ["교구|화평"], source: "import" }), []);
  assert.equal(filterActive(blankFilter()), false);
  assert.equal(filterActive({ ...blankFilter(), q: "  " }), false);
  assert.equal(filterActive({ ...blankFilter(), church: "없음" }), true);
  assert.equal(filterActive({ ...blankFilter(), positions: [""] }), true);
  assert.notEqual(blankFilter().groups, blankFilter().groups);   // 부를 때마다 새 배열
});

test("dupFlags — 같은 이름·같은 소속만(07 = 7 = 7목장 · NFC · 띄어쓰기) · 명단 전체로 · 이름 없는 줄은 빼고", () => {
  const rows = [
    R({ id: 1, sub: "07" }), R({ id: 2, sub: "7목장" }), R({ id: 3, sub: "20" }),
    R({ id: 4, group: "믿음", sub: "1", name: "성춘향".normalize("NFD") }), R({ id: 5, group: "믿음", sub: "1", name: "성 춘향" }),
    R({ id: 6, who_type: "교회학교", group: "화평", sub: "07" }),
    R({ id: 7, name: "" }), R({ id: 8, name: "" }),
  ];
  assert.deepEqual([...dupFlags(rows)].sort((a, b) => a - b), [1, 2, 4, 5]);
  assert.equal(dupFlags([]).size, 0);
});

test("dupFlags — 교구 줄은 한쪽 목장이 비었거나 99 면 같은 교구·같은 이름을 중복으로(서버 판정과 같다 · 최종 검토 I1) · 번호끼리 다르면 아니다 · 교회학교는 그대로", () => {
  const rows = [
    R({ id: 1, sub: "" }), R({ id: 2, sub: "20" }),                                          // 빈칸 ↔ 20
    R({ id: 3, group: "소망", sub: "99" }), R({ id: 4, group: "소망", sub: "7" }),             // 99 ↔ 7
    R({ id: 5, group: "믿음", sub: "3" }), R({ id: 6, group: "믿음", sub: "4" }),              // 번호끼리 다르면 아니다
    R({ id: 7, group: "사랑", sub: "099" }), R({ id: 8, group: "사랑", sub: "5", name: "홍길순" }), // 이름이 다르면 아니다
    R({ id: 9, who_type: "교회학교", group: "중등부", sub: "" }), R({ id: 10, who_type: "교회학교", group: "중등부", sub: "2" }),
    R({ id: 11, group: "은혜", sub: "1" }), R({ id: 12, group: "은혜", sub: "2" }), R({ id: 13, group: "은혜", sub: "99목장" }),   // 99 가 있으면 셋 모두
  ];
  assert.deepEqual([...dupFlags(rows)].sort((a, b) => a - b), [1, 2, 3, 4, 11, 12, 13]);
});

test("positionCounts — 많은 차례 · 같으면 가나다 · 빈 직분은 뒤 · 앞뒤 빈칸은 같은 직분", () => {
  const rows = [R({ position: "집사" }), R({ position: "권사" }), R({ position: "집사" }), R({ position: "" }),
    R({ position: " 권사 " }), R({ position: "성도" })];
  assert.deepEqual(positionCounts(rows), [["권사", 2], ["집사", 2], ["성도", 1], ["", 1]]);
});

test("csvText — BOM · \\r\\n · 일곱 칸 · 받은 차례 그대로 · 메모는 안 싣는다 · 수식으로 안 읽히게", () => {
  const csv = csvText([
    R({ id: 2, name: "홍길동", position: "집사", source: "app", church: { state: "맞음", reason: "" }, note: "원래: 화평 30 · 집사" }),
    R({ id: 1, name: '=HYPERLINK("x")', who_type: "교회학교", group: "청년부", sub: "", church: { state: "확인 필요", reason: "소속 다름" } }),
    R({ id: 3, name: "성춘향", church: null }),
  ]);
  assert.ok(csv.startsWith("﻿"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines.length, 4);
  assert.equal(lines[0], '"이름","구분","소속","세부","직분","출처","교적"');
  assert.equal(lines[1], '"홍길동","교구","화평","20","집사","앱","맞음"');
  assert.equal(lines[2], `"'=HYPERLINK(""x"")","교회학교","청년부","","","이관","확인 필요 · 소속 다름"`);
  assert.equal(lines[3], '"성춘향","교구","화평","20","","이관",""');
  assert.ok(!csv.includes("원래:"));
});

test("sortEvents — 시작일 최근 먼저 · 같으면 id 거꾸로 · 받은 배열은 그대로", () => {
  const evs = [{ id: "lent-2024", opens_on: "2024-02-14" }, { id: "summer-2026", opens_on: "2026-07-01" },
    { id: "lent-2026", opens_on: "2026-02-18" }, { id: "lent-booklet-2026", opens_on: "2026-02-18" }];
  assert.deepEqual(sortEvents(evs).map((e) => e.id), ["summer-2026", "lent-booklet-2026", "lent-2026", "lent-2024"]);
  assert.equal(evs[0].id, "lent-2024");
});

test("tidyMok — 서버 tidyRow 의 목장 규칙과 같은 보기(Task 2 시험) · whoText · subText", () => {
  assert.equal(tidyMok("07"), "7");
  assert.equal(tidyMok("007목장"), "7");
  assert.equal(tidyMok(" 20목장 "), "20");
  assert.equal(tidyMok("20 목장"), "20");
  assert.equal(tidyMok("남성목장"), "남성");
  assert.equal(tidyMok("남성 목장"), "남성");
  assert.equal(tidyMok("0"), "0");
  assert.equal(tidyMok("00"), "0");
  assert.equal(tidyMok("0012345678901234567890"), "12345678901234567890");   // 반올림하지 않는다
  assert.equal(tidyMok("20-1"), "20-1");      // 모르는 꼴은 그대로 — 서버가 bad-sub 로 막는다
  assert.equal(tidyMok("이십"), "이십");
  assert.equal(tidyMok(""), "");
  assert.equal(tidyMok(null), "");
  assert.equal(whoText(R({ sub: "20" })), "화평 20목장");
  assert.equal(whoText(R({ group: "소망", sub: "남성" })), "소망 남성");          // 서버 evWho·upload-logic whoText 와 같은 꼴
  assert.equal(whoText(R({ sub: "20목장" })), "화평 20목장");                    // 옛 모양 줄도 「목장목장」이 되지 않게
  assert.equal(whoText(R({ sub: "" })), "화평");
  assert.equal(whoText(R({ who_type: "교회학교", group: "청년부", sub: "" })), "청년부");
  assert.equal(whoText(R({ who_type: "교회학교", group: "중등부", sub: "3학년" })), "중등부 3학년");
  assert.equal(whoText(null), "");
  assert.equal(subText(R({ sub: "20" })), "20목장");
  assert.equal(subText(R({ group: "소망", sub: "남성" })), "남성");
  assert.equal(subText(R({ sub: "" })), "");
  assert.equal(subText(R({ who_type: "교회학교", group: "중등부", sub: "3학년" })), "3학년");
});

test("eventPatch — 바뀐 칸만 · 앞뒤·가운데 빈칸 무시 · list_until 비움(null)과 빈 글은 같다 · needs·id·kind 같은 칸은 버린다", () => {
  const ev = { id: "summer-2026", title: "썸머", short_title: "", subtitle: null, season: "2026-3Q", opens_on: "2026-07-01",
    closes_on: "2026-08-31", status: "closed", list_until: null, needs: { position: true }, updated_at: "x" };
  const v = { title: " 썸머 ", short_title: "", subtitle: "", season: "2026-3Q", opens_on: "2026-07-01",
    closes_on: "2026-08-31", status: "closed", list_until: "" };
  assert.deepEqual(eventPatch(ev, v), {});
  assert.deepEqual(eventPatch(ev, { ...v, status: "open", list_until: "2026-12-31" }), { status: "open", list_until: "2026-12-31" });
  assert.deepEqual(eventPatch({ ...ev, list_until: "2026-12-31" }, v), { list_until: "" });
  assert.deepEqual(eventPatch(ev, { ...v, needs: "x", id: "other", kind: "quiz" }), {});
  assert.deepEqual(eventPatch(ev, { title: "썸머  2026" }), { title: "썸머 2026" });   // 보낸 칸만 · 서버처럼 다듬어
});

test("rowPatch — 바뀐 칸만 · 목장은 바꾼 때만 다듬는다(07 을 그대로 두면 안 보낸다) · 겹빈칸은 같은 값 · keys 로 좁힌다", () => {
  const row = R({ id: 9, group: "화평", sub: "07", name: "홍길동", position: "집사", note: "원래: 화평 30 · 집사" });
  const same = { who_type: "교구", group: "화평", sub: "07", name: " 홍길동 ", position: "집사", note: "원래: 화평 30 · 집사" };
  assert.deepEqual(rowPatch(row, same), {});
  assert.deepEqual(rowPatch(row, { ...same, sub: "8목장" }), { sub: "8" });
  assert.deepEqual(rowPatch(row, { ...same, sub: "7" }), { sub: "7" });
  assert.deepEqual(rowPatch(R({ sub: "7" }), { sub: "7목장" }, ["sub"]), {});   // 다듬으면 옛 값과 같다
  assert.deepEqual(rowPatch(row, { ...same, who_type: "교회학교", group: "청년부", sub: "" }),
    { who_type: "교회학교", group: "청년부", sub: "" });
  assert.deepEqual(rowPatch(row, { ...same, note: "원래: 화평 30 · 집사 / 전화로 확인" }), { note: "원래: 화평 30 · 집사 / 전화로 확인" });
  assert.deepEqual(rowPatch(row, { ...same, name: "홍길순", note: "새 메모" }, ["note"]), { note: "새 메모" });
  assert.deepEqual(rowPatch(R({ note: null }), { note: "" }, ["note"]), {});
  assert.deepEqual(rowPatch(R({ note: "전화로  확인" }), { note: "전화로 확인" }, ["note"]), {});   // 서버도 한 줄로 저장한다
  assert.deepEqual(rowPatch(R({ name: "홍  길동" }), { name: "홍 길동" }, ["name"]), {});
});
