// 🤖 성도 묻기 — 고르기 칸 화면 순수 도우미(js/menus/people/ask-logic.js · 2026-10-19). DOM 없이 돈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PICK_FROM, posPickOptions, flatPickOptions, pickedView, picksToSend, pickSummary } from "../js/menus/people/ask-logic.js";
import { PICK_FROM as SERVER_PICK_FROM } from "../supabase/functions/church-admin/ask-people.ts";

// 서버 askPeopleOptions 의 직분 목록 꼴(group 있는 새 서버)
const POS = [
  { value: "장로 전체", label: "장로 전체", count: 3, kind: "group", group: "장로" },
  { value: "권사 전체", label: "권사 전체", count: 1, kind: "group", group: "권사" },
  { value: "시무장로", label: "시무장로", count: 2, kind: "detail", group: "장로" },
  { value: "은퇴장로", label: "은퇴장로", count: 1, kind: "detail", group: "장로" },
  { value: "권사", label: "권사", count: 1, kind: "detail", group: "권사" },
  { value: "사모", label: "사모", count: 1, kind: "detail", group: "그 밖" },
  { value: "성도", label: "성도", count: 4, kind: "detail", group: "그 밖" },
  { value: "직분 없음", label: "직분 없음", count: 2, kind: "detail", group: "" },
];
const OPTS = posPickOptions(POS);
const GU = [{ value: "믿음", hint: "2명" }, { value: "화평", hint: "3명" }];

test("PICK_FROM — 화면과 서버가 글자까지 같다", () => {
  assert.deepEqual(PICK_FROM, SERVER_PICK_FROM);
});

test("posPickOptions — group 있는 목록 → 위/아래 줄 · 「그 밖」은 @그 밖 · 「직분 없음」 끝 한 줄", () => {
  assert.deepEqual(OPTS.map((o) => [o.value, o.parent ?? null]), [
    ["장로 전체", null], ["시무장로", "장로 전체"], ["은퇴장로", "장로 전체"],
    ["권사 전체", null], ["권사", "권사 전체"],
    ["@그 밖", null], ["사모", "@그 밖"], ["성도", "@그 밖"],
    ["직분 없음", null],
  ]);
  assert.equal(OPTS[0].label, "장로");
  assert.equal(OPTS[0].hint, "3명");
  assert.equal(OPTS.find((o) => o.value === "@그 밖").hint, "5명");   // 큰 묶음 줄이 없으니 세부를 더한다
});

test("posPickOptions — group 칸이 없는(옛 서버) 목록 → 지금처럼 한 줄씩", () => {
  const old = POS.map(({ group, ...r }) => r);
  const o = posPickOptions(old);
  assert.equal(o.length, old.length);
  assert.ok(o.every((x) => x.parent == null));
  assert.deepEqual(o.map((x) => x.value), old.map((x) => x.value));
  assert.deepEqual(posPickOptions(undefined), []);
});

test("pickedView/picksToSend — 위 단계 아래를 다 고르면 「X 전체」 하나 · 일부면 세부", () => {
  assert.deepEqual(picksToSend(["장로 전체", "시무장로", "은퇴장로"], OPTS), ["장로 전체"]);
  assert.deepEqual(picksToSend(["시무장로"], OPTS), ["시무장로"]);
  assert.deepEqual(picksToSend(["장로 전체"], OPTS), []);   // 위만 오고 아래가 없으면 아래 기준으로 판단 → 고른 것 없음(고르개가 늘 아래를 함께 켠다)
  assert.deepEqual(pickedView(["시무장로", "은퇴장로"], OPTS), { send: ["장로 전체"], show: ["장로 전체"] });
});

test("「@그 밖」 전부 → 서버로는 세부들 · 보일 때는 「그 밖 전체」", () => {
  const v = pickedView(["@그 밖", "사모", "성도"], OPTS);
  assert.deepEqual(v.send, ["사모", "성도"]);
  assert.deepEqual(v.show, ["그 밖 전체"]);
  assert.equal(pickSummary(["사모", "성도"], OPTS), "그 밖 전체");
});

test("pickSummary — 안 고름 · 하나 · 섞기 · 모두", () => {
  assert.equal(pickSummary([], OPTS), "전체");
  assert.equal(pickSummary(["시무장로"], OPTS), "시무장로");
  assert.equal(pickSummary(["시무장로", "은퇴장로"], OPTS), "장로 전체");
  assert.equal(pickSummary(["시무장로", "은퇴장로", "사모"], OPTS), "장로 전체 외 1");
  assert.deepEqual(picksToSend(["시무장로", "은퇴장로", "사모"], OPTS), ["장로 전체", "사모"]);
  assert.equal(pickSummary(OPTS.map((o) => o.value), OPTS), "모두");
});

test("모두 고름 → 보낼 것 없음 · 목록 밖 값은 버림 · 목록 없으면 보내지 않음", () => {
  assert.deepEqual(picksToSend(OPTS.map((o) => o.value), OPTS), []);
  assert.deepEqual(picksToSend(["없는 값", "시무장로"], OPTS), ["시무장로"]);
  assert.deepEqual(picksToSend(["없는 값"], OPTS), []);
  assert.deepEqual(picksToSend(["시무장로"], []), []);
  assert.deepEqual(pickedView(["시무장로"], []), { send: [], show: [] });
});

test("교구(단계 없는) 목록도 같은 함수로", () => {
  assert.deepEqual(picksToSend([], GU), []);
  assert.deepEqual(picksToSend(["화평", "화평"], GU), ["화평"]);
  assert.equal(pickSummary(["믿음"], GU), "믿음");
  assert.equal(pickSummary(["믿음", "화평"], GU), "모두");
  assert.deepEqual(picksToSend(["믿음", "화평"], GU), []);
});

test("등록년도 — 서버 목록 → 고르개 줄(차례 그대로 · 「N명」) · 단추 글 · 보낼 값 · 옛 서버(reg 없음)면 빈 목록", () => {
  const REG = flatPickOptions([{ value: "2026", label: "2026년", count: 12 }, { value: "2025", label: "2025년", count: 1234 }, { value: "2019년 이전", label: "2019년 이전", count: 5 }]);
  assert.deepEqual(REG, [{ value: "2026", label: "2026년", hint: "12명" }, { value: "2025", label: "2025년", hint: "1,234명" }, { value: "2019년 이전", label: "2019년 이전", hint: "5명" }]);
  assert.equal(pickSummary(["2026"], REG), "2026년");
  assert.equal(pickSummary(["2026", "2019년 이전"], REG), "2026년 외 1");
  assert.deepEqual(picksToSend(["2019년 이전", "2026"], REG), ["2026", "2019년 이전"]);
  assert.deepEqual(flatPickOptions(undefined), []);
});

test("연령대 — 등록년도와 같은 도우미로(차례 그대로 · 「N명」 · 단추 글)", () => {
  const AGE = flatPickOptions([{ value: "20세 이하", label: "20세 이하", count: 30 }, { value: "21~25세", label: "21~25세", count: 40 }, { value: "71세 이상", label: "71세 이상", count: 900 }]);
  assert.deepEqual(AGE.map((o) => [o.value, o.hint]), [["20세 이하", "30명"], ["21~25세", "40명"], ["71세 이상", "900명"]]);
  assert.equal(pickSummary(["71세 이상", "21~25세"], AGE), "21~25세 외 1");
});
