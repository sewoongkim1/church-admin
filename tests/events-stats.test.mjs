import { test } from "node:test";
import assert from "node:assert/strict";
import {
  personKey, affLabel, personGroups, quickPick,
} from "../supabase/functions/church-admin/events-stats.ts";
import { legacyNorm } from "../supabase/functions/church-admin/paper.ts";

// 시험 줄 — 가짜 이름만. user_id 는 꼴만 흉내 낸 글자(진짜 UUID 가 아니다).
const S = (event_id, user_id, who_type, group_name, sub_name, name) =>
  ({ event_id, user_id, who_type, group_name, sub_name, name, position: "" });
const NFD = "홍길동".normalize("NFD");

// Task 5 index.ts 의 evWho 를 **글자 그대로** 옮겨 둔다 — affLabel 이 이것과 다르면
// 이력(evHistory groups[].label)과 통계(repeaters[].label)의 소속 글자가 갈린다(CONTRACT §5). evWho 가 바뀌면 함께 바꾼다.
function evWho(r) {
  const g = legacyNorm(r.group_name), s = legacyNorm(r.sub_name);
  if (!g) return "(소속 없음)";
  if (legacyNorm(r.who_type) === "교구" && /^\d+$/.test(s)) return g + " " + s + "목장";
  return s ? g + " " + s : g;
}

test("personKey — 구분·소속·목장 숫자·이름(NFC·띄어쓰기 없음)", () => {
  assert.equal(personKey(S("e", null, "교구", " 화평 ", "07목장", "홍 길동")), "교구|화평|7|홍길동");
  assert.equal(personKey(S("e", null, "교구", "화평", "7", NFD)), "교구|화평|7|홍길동");
  assert.equal(personKey(S("e", null, "교구", "소망", "남성목장", "홍길동")), "교구|소망|남성|홍길동");
  assert.equal(personKey(S("e", null, "교구", "새가족", "", "홍길동")), "교구|새가족||홍길동");
  assert.equal(personKey(S("e", null, "교구", "시험", "0012345678901234567890", "홍길동")), "교구|시험|12345678901234567890|홍길동");
  assert.equal(personKey(S("e", null, "교회학교", "중등부", "1학년", "도하늘")), "교회학교|중등부||도하늘");   // 학년은 넣지 않는다
});

test("affLabel — 소속만 한 줄(evWho 규칙: 교구는 숫자 목장에만 「목장」)", () => {
  const cases = [
    [{ who_type: "교구", group_name: "화평", sub_name: "20" }, "화평 20목장"],
    [{ who_type: "교구", group_name: "소망", sub_name: "남성" }, "소망 남성"],
    [{ who_type: "교구", group_name: "새가족", sub_name: "" }, "새가족"],
    [{ who_type: "교회학교", group_name: "중등부", sub_name: "" }, "중등부"],
    [{ who_type: "교회학교", group_name: "청년부", sub_name: "1" }, "청년부 1"],          // 학년 칸에는 「목장」을 붙이지 않는다
    [{ who_type: "교회학교", group_name: "중등부", sub_name: "3학년" }, "중등부 3학년"],
    [{ who_type: "교구", group_name: " 화평 ", sub_name: " 7 " }, "화평 7목장"],
    [{ who_type: "교구", group_name: "", sub_name: "" }, "(소속 없음)"],
    [{ who_type: "교구", group_name: "", sub_name: "20" }, "(소속 없음)"],                 // 교구가 비면 목장만 보이지 않는다
  ];
  for (const [r, want] of cases) {
    assert.equal(affLabel(r), want, JSON.stringify(r));
    assert.equal(affLabel(r), evWho(r), "evWho 와 같아야 한다 " + JSON.stringify(r));
  }
  assert.ok(!affLabel({ who_type: "교구", group_name: "화평", sub_name: "20", name: "홍길동" }).includes("홍길동"));   // 이름은 넣지 않는다
});

test("personGroups — 다듬은 신원이 같으면 한 묶음(07/7·7목장·띄어쓰기·NFD) · user_id 가 같으면 한 묶음", () => {
  const rows = [
    S("lent-2023", null, "교구", "화평", "07", "홍길동"),
    S("lent-2024", null, "교구", "화평", "7", "홍 길동"),
    S("lent-2025", "user-a", "교구", "화평", "8", "홍길동"),     // 목장을 옮긴 해 — 신원이 달라 따로
    S("lent-2026", "user-a", "교구", "기쁨", "3", "홍길동"),     // 계정이 같아 바로 위와 한 묶음
    S("summer-2025", null, "교구", "화평", "7목장", NFD),
    S("lent-2025", null, "교구", "화평", "20", "김철수"),
  ];
  assert.deepEqual(personGroups(rows), [0, 0, 1, 1, 0, 2]);
});

test("personGroups — 합집합: 계정 없는 해와 계정 있는 해가 이어진다(이어짐이 넘어간다)", () => {
  const rows = [
    S("lent-2023", null, "교구", "화평", "7", "홍길동"),          // 계정 없음
    S("lent-2025", "user-b", "교구", "소망", "1", "홍길동"),      // 계정 있음 · 다른 소속
    S("lent-2026", "user-b", "교구", "화평", "7", "홍길동"),      // 계정 있음 · 첫 줄과 같은 신원 → 셋이 한 묶음
    S("lent-2026", null, "교구", "소망", "1", "도하늘"),
  ];
  assert.deepEqual(personGroups(rows), [0, 0, 0, 1]);
});

test("personGroups — 교회학교는 학년이 달라도 같은 부서·이름이면 한 묶음 · 부서가 다르면 따로", () => {
  const rows = [
    S("lent-2024", null, "교회학교", "중등부", "1", "도하늘"),
    S("lent-2025", null, "교회학교", "중등부", "", "도하늘"),
    S("lent-2026", null, "교회학교", "고등부", "", "도하늘"),
  ];
  assert.deepEqual(personGroups(rows), [0, 0, 1]);
});

test("personGroups — 순번은 처음 나온 차례 · 빈 목록", () => {
  const rows = [
    S("a-1", null, "교구", "화평", "1", "김철수"),
    S("a-1", null, "교구", "화평", "2", "도하늘"),
    S("a-2", null, "교구", "화평", "1", "김철수"),
    S("a-2", null, "교구", "소망", "남성", "홍길동"),
    S("a-3", null, "교구", "소망", "남성목장", "홍길동"),
  ];
  assert.deepEqual(personGroups(rows), [0, 1, 0, 2, 2]);
  assert.deepEqual(personGroups([]), []);
});

test("quickPick — id 앞글자로(소책자를 사순절보다 먼저)", () => {
  assert.equal(quickPick("lent-booklet-2024"), "소책자");
  assert.equal(quickPick("lent-booklet-2025"), "소책자");
  assert.equal(quickPick("lent-2022"), "사순절");
  assert.equal(quickPick("lent-2026"), "사순절");
  assert.equal(quickPick("summer-2024"), "썸머");
  assert.equal(quickPick("summer-2026"), "썸머");
  assert.equal(quickPick("autumn-2026"), null);
  assert.equal(quickPick("ca-test-1727590000000"), null);
  assert.equal(quickPick("lent"), null);
  assert.equal(quickPick(""), null);
});

// ── 통계 ───────────────────────────────────────────────────────────
import { statsOf } from "../supabase/functions/church-admin/events-stats.ts";

// 일부러 기간 차례가 아니게 준다 — statsOf 가 closes_on 으로 줄 세우는지 본다
const EVS = [
  { id: "lent-2026", title: "2026 사순절", closes_on: "2026-04-04" },
  { id: "lent-2025", title: "2025 사순절", closes_on: "2025-04-19" },
  { id: "summer-2025", title: "2025 썸머", closes_on: "2025-08-31" },
];
const ROWS = [
  S("lent-2025", null, "교구", "화평", "7", "홍길동"),
  S("summer-2025", "user-a", "교구", "화평", "7", "홍길동"),
  S("lent-2026", "user-a", "교구", "화평", "8", "홍길동"),     // 목장을 옮겼지만 계정으로 이어진다
  S("lent-2025", null, "교구", "기쁨", "3", "김철수"),
  S("lent-2026", null, "교구", "기쁨", "3", "김철수"),
  S("summer-2025", null, "교회학교", "중등부", "", "도하늘"),
  S("lent-2026", null, "교회학교", "청년부", "", "박하나"),
  S("lent-2026", null, "교구", "평화", "1", "최바다"),        // 모르는 교구 이름 → 뒤로
  S("lent-2024", null, "교구", "화평", "7", "홍길동"),        // 고르지 않은 회차 → 세지 않는다
  S("lent-2026", null, "교구", "", "", "오한결"),            // 소속 없음 → 뒤로
  S("summer-2025", null, "교구", "믿음", "2", "윤바다"),
];
const Z = (a, b, c) => ({ "lent-2025": a, "summer-2025": b, "lent-2026": c });

test("statsOf — 회차별 인원(기간 차례 · 고르지 않은 회차의 줄은 빼고)", () => {
  assert.deepEqual(statsOf(ROWS, EVS).perEvent, [
    { id: "lent-2025", title: "2025 사순절", count: 2 },
    { id: "summer-2025", title: "2025 썸머", count: 3 },
    { id: "lent-2026", title: "2026 사순절", count: 5 },
  ]);
});

test("statsOf — 교구(부서) × 회차: 교구 차례 → 부서 가나다 → 모르는 이름 · 모든 회차 칸(0 포함)", () => {
  assert.deepEqual(statsOf(ROWS, EVS).byGroup, [
    { who_type: "교구", group_name: "믿음", counts: Z(0, 1, 0), total: 1 },
    { who_type: "교구", group_name: "화평", counts: Z(1, 1, 1), total: 3 },
    { who_type: "교구", group_name: "기쁨", counts: Z(1, 0, 1), total: 2 },
    { who_type: "교회학교", group_name: "중등부", counts: Z(0, 1, 0), total: 1 },
    { who_type: "교회학교", group_name: "청년부", counts: Z(0, 0, 1), total: 1 },
    { who_type: "교구", group_name: "", counts: Z(0, 0, 1), total: 1 },
    { who_type: "교구", group_name: "평화", counts: Z(0, 0, 1), total: 1 },
  ]);
});

test("statsOf — 여러 번 참여한 분 { n, name, label, times, events }(기본 3회 이상 · 이름·소속은 가장 최근 회차 줄)", () => {
  assert.deepEqual(statsOf(ROWS, EVS).repeaters, [
    { n: 1, name: "홍길동", label: "화평 8목장", times: 3, events: ["lent-2025", "summer-2025", "lent-2026"] },
  ]);
  assert.deepEqual(statsOf(ROWS, EVS, 2).repeaters, [
    { n: 1, name: "홍길동", label: "화평 8목장", times: 3, events: ["lent-2025", "summer-2025", "lent-2026"] },
    { n: 2, name: "김철수", label: "기쁨 3목장", times: 2, events: ["lent-2025", "lent-2026"] },
  ]);
  // label 은 소속만 — 이름은 name 칸에만(화면은 「이름 · 소속」 · CSV 는 「이름」「소속」 두 칸)
  for (const r of statsOf(ROWS, EVS, 1).repeaters) assert.ok(!r.label.includes(r.name), r.label);
  // 기본값을 깨는 값은 3 으로
  assert.equal(statsOf(ROWS, EVS, 0).repeaters.length, 1);
  assert.equal(statsOf(ROWS, EVS, "x").repeaters.length, 1);
});

test("statsOf — 같은 회차에 두 줄이어도 한 번으로 · 같은 횟수는 이름 차례", () => {
  const rows = [
    S("lent-2025", null, "교구", "소망", "1", "도하늘"),
    S("lent-2025", null, "교구", "소망", "01", "도하늘"),       // 같은 회차 중복 줄
    S("lent-2026", null, "교구", "소망", "1", "도하늘"),
    S("lent-2025", null, "교구", "기쁨", "3", "김철수"),
    S("summer-2025", null, "교구", "기쁨", "3", "김철수"),
  ];
  const r = statsOf(rows, EVS, 2).repeaters;
  assert.deepEqual(r.map((x) => [x.name, x.times]), [["김철수", 2], ["도하늘", 2]]);
  assert.deepEqual(r[1].events, ["lent-2025", "lent-2026"]);
  assert.equal(r[1].label, "소망 1목장");
});

test("statsOf — user_id 를 내보내지 않는다 · 빈 입력", () => {
  const s = JSON.stringify(statsOf(ROWS, EVS, 1));
  assert.ok(!s.includes("user-a"));
  assert.ok(!s.includes("user_id"));
  assert.deepEqual(statsOf([], EVS), {
    perEvent: [
      { id: "lent-2025", title: "2025 사순절", count: 0 },
      { id: "summer-2025", title: "2025 썸머", count: 0 },
      { id: "lent-2026", title: "2026 사순절", count: 0 },
    ],
    byGroup: [],
    repeaters: [],
  });
  assert.deepEqual(statsOf(ROWS, []), { perEvent: [], byGroup: [], repeaters: [] });
});

// ---------- 글자 차례(코드 포인트) — 이력(evHistory)도 이것으로 정렬한다(history-sort-localecompare · 2026-09-30) ----------
// localeCompare 는 Deno·Node 의 ICU 에 따라 「-」 같은 글자의 차례가 달라질 수 있다. 통계(statsOf)와 이력이 같은 차례여야 이름표가 같다.
import { codeCmp } from "../supabase/functions/church-admin/events-stats.ts";

test("codeCmp — 코드 포인트 차례(localeCompare 아님) · 같으면 0", () => {
  assert.ok(codeCmp("lent-2022", "lent-booklet-2022") < 0);      // 「2」(0x32) < 「b」(0x62)
  assert.ok(codeCmp("lent-booklet-2022", "lent-2022") > 0);
  assert.ok(codeCmp("2026-03-01", "2026-10-01") < 0);
  assert.equal(codeCmp("a", "a"), 0);
  assert.equal(codeCmp("", ""), 0);
  assert.deepEqual(["summer-2026", "lent-booklet-2026", "lent-2026"].sort(codeCmp),
    ["lent-2026", "lent-booklet-2026", "summer-2026"]);
});
