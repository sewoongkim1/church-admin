// 📊 교인 현황 거르기(2026-09-30) — 서버 statsOf 의 숫자 묶음(facts)으로 화면이 다시 센 표가
// ① 거르기 없으면 서버 표(gu·position·age)와 똑같고 ② 거르면 「그 분들만 골라 statsOf 를 다시 돌린 것」과 같은지 대조한다.
// 명부는 지어낸 것(시드 고정) — 이름·번호는 「시험」 글자로만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { statsOf, householdsByGu, AGE_BANDS, SEXES, CARD_GU } from "../supabase/functions/church-admin/people-query.ts";
import { MATCH_GU } from "../supabase/functions/church-admin/people-match.ts";
import { guTable, positionTable, ageTable, pickOptions, statsChoices, guCardRows, CARD_GU as SCREEN_CARD_GU }
  from "../js/menus/people/stats-logic.js";
import { ageHtml, guCardsHtml } from "../js/menus/people/stats.js";
import { filterChoices, pickSummary } from "../js/menus/people/people-logic.js";

// 시드 고정 난수(mulberry32) — 돌릴 때마다 같은 명부
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const GU = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족", "청년부", "시험교구"];
const K3 = ["출석교인", "장기결석", "관리교인", "가끔교인", "청년(대예배출석)", ""];
const POS = ["집사", "권사", "안수집사", "장로", "성도", "전도사", ""];
const SEX = ["남", "여", "", null];
function fakeRows(count, seed) {
  const r = rng(seed), one = (xs) => xs[Math.floor(r() * xs.length)];
  return Array.from({ length: count }, (_, i) => {
    const noGu = r() < 0.15;                        // 교회학교처럼 교구가 없는 분
    const gu = noGu ? "" : one(GU);
    const mok = noGu || r() < 0.05 ? "" : `${gu}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}목장`;
    return {
      name: `시험이름${i}`, phone1: `010-0000-${String(i % 10000).padStart(4, "0")}`, person_id: 990000000 + i,
      mok1: gu, mok3: mok, kind2: noGu ? "교회학교" : "장년", kind3: one(K3), position: one(POS),
      school_dept: noGu ? "고등부" : "", gender: one(SEX), age: r() < 0.05 ? null : Math.floor(r() * 95),
      has_photo: r() < 0.5, household_id: r() < 0.9 ? 1 + Math.floor(r() * 400) : null,
    };
  });
}

const ROWS = fakeRows(3000, 20260930);
const S = statsOf(ROWS);
const F = S.facts;

test("facts — 값 사전 차례는 서버 표와 같다 · 연령대·성별 사전", () => {
  assert.deepEqual(F.dict.gu, S.gu.map((g) => g.gu));
  assert.deepEqual(F.dict.kind3, S.kind3.map(([k]) => k));
  assert.deepEqual(F.dict.position, S.position.map(([k]) => k));
  assert.deepEqual(F.dict.band, AGE_BANDS);
  assert.deepEqual(F.dict.sex, SEXES);
  assert.deepEqual(SEXES, ["남", "여", "모름"]);
  // 줄 꼴 — 번호 셋/둘/넷 + 인원, 인원을 모두 더하면 전체
  for (const [key, width] of [["gu", 4], ["position", 3], ["age", 5]]) {
    assert.ok(F[key].every((x) => x.length === width && x.every(Number.isInteger)), key);
    assert.equal(F[key].reduce((a, x) => a + x[width - 1], 0), ROWS.length, key);
  }
});

test("거르기 없으면 — 교구별·직분별·연령대 표가 서버 표와 똑같다", () => {
  assert.deepEqual(guTable(F).rows, S.gu);
  assert.deepEqual(guTable(F, []).rows, S.gu);
  assert.deepEqual(positionTable(F).rows, S.position);
  assert.deepEqual(ageTable(F).rows, S.age);
  assert.deepEqual(ageTable(F, [], []).rows, S.age);
  assert.equal(guTable(F).total.n, ROWS.length);
  assert.equal(guTable(F).total.moks, S.gu.reduce((a, g) => a + g.moks, 0));
  assert.equal(positionTable(F).total, ROWS.length);
  const t = ageTable(F).total;
  assert.equal(t.m + t.f + t.x, ROWS.length);
});

// 기준 — 그 분들만 골라 statsOf 를 다시 돌린 값
const only = (pred) => statsOf(ROWS.filter(pred));
const k3Of = (r) => r.kind3 || "(없음)";
const guOf = (r) => r.mok1 || "(목장 없음)";

test("출석을 고르면 — 교구별(목장 수 포함)·직분별이 그 분들만 다시 센 것과 같다", () => {
  for (const pick of [["출석교인"], ["장기결석", "관리교인"], ["청년(대예배출석)", "가끔교인", "출석교인"]]) {
    const want = only((r) => pick.includes(k3Of(r)));
    // 교구 차례는 거르기 전 차례 그대로(교구 밖 묶음이 인원으로 자리를 바꾸지 않게) — 차례 말고 값만 견준다
    const got = guTable(F, pick);
    const byGu = (xs) => Object.fromEntries(xs.map((g) => [g.gu, g]));
    assert.deepEqual(byGu(got.rows), byGu(want.gu), pick.join(","));
    assert.deepEqual(got.rows.map((g) => g.gu), S.gu.map((g) => g.gu).filter((g) => byGu(want.gu)[g]), "차례 " + pick);
    assert.equal(got.total.n, ROWS.filter((r) => pick.includes(k3Of(r))).length);
    assert.deepEqual(positionTable(F, pick).rows, want.position, "직분 " + pick);
  }
});

test("출석·교구를 고르면 — 연령대·성별이 그 분들만 다시 센 것과 같다", () => {
  const cases = [[["출석교인"], []], [[], ["기쁨"]], [["장기결석", "출석교인"], ["믿음", "청년부"]], [[], ["(목장 없음)"]]];
  for (const [k3, gu] of cases) {
    const want = only((r) => (!k3.length || k3.includes(k3Of(r))) && (!gu.length || gu.includes(guOf(r))));
    assert.deepEqual(ageTable(F, k3, gu).rows, want.age, `${k3} / ${gu}`);
  }
});

test("사전에 없는 값만 고르면 0 — 안 고른 것(전체)과 다르다", () => {
  assert.deepEqual(guTable(F, ["없는출석"]).rows, []);
  assert.equal(guTable(F, ["없는출석"]).total.n, 0);
  assert.deepEqual(positionTable(F, ["없는출석"]).rows, []);
  assert.equal(ageTable(F, [], ["없는교구"]).rows.length, AGE_BANDS.length);   // 연령대 줄은 늘 전부(0명)
  assert.deepEqual(ageTable(F, [], ["없는교구"]).total, { m: 0, f: 0, x: 0 });
});

test("고를 목록 — 교인 찾기와 같은 규칙(「(없음)」「(목장 없음)」은 못 고른다) · 인원 글자 · 칩 요약", () => {
  const c = filterChoices(S);
  assert.ok(!c.kind3.some(([k]) => k === "(없음)"));
  assert.ok(!c.mok1.some(([k]) => k === "(목장 없음)"));
  assert.deepEqual(pickOptions([["출석교인", 1234], ["장기결석", 5]]),
    [{ value: "출석교인", label: "출석교인", hint: "1,234명" }, { value: "장기결석", label: "장기결석", hint: "5명" }]);
  assert.deepEqual(pickOptions(undefined), []);
  assert.equal(pickSummary([]), "전체");
  assert.equal(pickSummary(["출석교인", "장기결석"]), "출석교인 · 장기결석");
  assert.equal(pickSummary(["출석교인", "장기결석", "관리교인"]), "출석교인 외 2");
});

test("응답 크기 — 8,672명 가짜 명부의 교인 현황이 수십 KB 안", () => {
  const big = statsOf(fakeRows(8672, 7));
  const kb = Buffer.byteLength(JSON.stringify(big)) / 1024;
  assert.ok(kb < 60, `${kb.toFixed(1)}KB`);
});

// ── 맨 위 교구 카드 일곱(2026-09-30 친구 요청 「교구별로 인원수만 · 인원 수 & 가구 수」) ──
// 가족이 있는 가짜 명부 — 세대주가 명부에 있는 가구 · 없는 가구 · 식구가 여러 교구에 걸친 가구 · household 빈칸/0/null.
// 「은혜」에는 아무도 없다(0명 카드). 이름·번호는 「시험」·99… 뿐.
const GU_F = ["믿음", "소망", "사랑", "섬김", "화평", "기쁨", "새가족", "청년부", ""];
function familyRows(count, seed) {
  const r = rng(seed), one = (xs) => xs[Math.floor(r() * xs.length)];
  const rows = [];
  let id = 990000000;
  while (rows.length < count) {
    const size = 1 + Math.floor(r() * 5), headId = id;
    const headAbsent = r() < 0.15;                 // 세대주가 명부에 없다(첫 자리를 비운다 — 번호만 가구에 남는다)
    const noHh = r() < 0.05 ? one([null, 0, ""]) : undefined;   // 가구로 치지 않는 분들
    const base = one(GU_F);
    for (let k = 0; k < size && rows.length < count; k++) {
      const pid = id++;
      if (k === 0 && headAbsent) continue;
      const gu = r() < 0.25 ? one(GU_F) : base;    // 식구 넷에 하나는 다른 교구
      rows.push({ person_id: pid, name: `시험식구${pid}`, household_id: noHh === undefined ? headId : noHh,
        mok1: gu, mok3: gu ? `${gu}-${String(1 + Math.floor(r() * 9)).padStart(2, "0")}목장` : "", kind2: gu ? "장년" : "교회학교",
        kind3: one(K3), position: one(POS), school_dept: gu ? "" : "고등부", gender: one(SEX), age: Math.floor(r() * 90), has_photo: r() < 0.5 });
    }
  }
  return rows;
}
// 기준(느리지만 곧은 길) — 가구마다 식구를 모아, 세대주가 있으면 그 교구 · 없으면 식구 많은 교구(같으면 order 앞쪽)
function oracleHouseholds(rows, order) {
  const guOf = (r) => r.mok1 || "(목장 없음)";
  const fam = new Map();
  for (const r of rows) if (r.household_id) fam.set(r.household_id, [...(fam.get(r.household_id) || []), r]);
  const out = {};
  for (const [h, list] of fam) {
    const head = rows.find((r) => r.person_id === h);
    let g;
    if (head) g = guOf(head);
    else {
      const cnt = {};
      for (const m of list) cnt[guOf(m)] = (cnt[guOf(m)] || 0) + 1;
      const max = Math.max(...Object.values(cnt));
      g = order.find((x) => cnt[x] === max);
    }
    out[g] = (out[g] || 0) + 1;
  }
  return out;
}

const FAM = familyRows(2500, 20260930);
const FS = statsOf(FAM);

test("교구 카드 — 일곱 줄 · 이 차례 · 인원은 교구별 표(거르기 없음) 인원 · 0명 교구도 카드", () => {
  assert.deepEqual(CARD_GU, ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨"]);
  assert.deepEqual(CARD_GU, MATCH_GU.filter((g) => g !== "새가족"), "앱 교구 차례에서 새가족만 뺀 것");
  assert.deepEqual(SCREEN_CARD_GU, CARD_GU, "화면(옛 서버일 때 쓰는 차례)과 서버가 같다");
  for (const st of [S, FS]) {
    assert.deepEqual(st.guCards.map((c) => c.gu), CARD_GU);
    for (const c of st.guCards) {
      assert.equal(c.n, st.gu.find((g) => g.gu === c.gu)?.n ?? 0, c.gu);
      assert.equal(c.n, guTable(st.facts).rows.find((g) => g.gu === c.gu)?.n ?? 0, "다시 센 교구별 표와도 " + c.gu);
      assert.deepEqual(Object.keys(c), ["gu", "n", "households"]);
    }
  }
  assert.deepEqual(FS.guCards.find((c) => c.gu === "은혜"), { gu: "은혜", n: 0, households: 0 });
});

test("교구 카드 가구 — 세대주 기준 · 모든 교구(카드 밖 포함)를 더하면 전체 가구 · 곧은 길로 센 것과 같다", () => {
  for (const [rows, st] of [[ROWS, S], [FAM, FS]]) {
    const order = st.gu.map((g) => g.gu);
    const got = householdsByGu(rows, order);
    const sum = [...got.values()].reduce((a, x) => a + x, 0);
    assert.equal(sum, st.households, "가구 합 = 전체 가구");
    assert.deepEqual(Object.fromEntries(got), oracleHouseholds(rows, order));
    for (const c of st.guCards) assert.equal(c.households, got.get(c.gu) ?? 0, c.gu);
  }
  // 가짜 명부에 그 경우들이 실제로 들어 있다(없으면 위 대조가 헛돈다)
  const ids = new Set(FAM.map((r) => r.person_id));
  const hh = new Map();
  for (const r of FAM) if (r.household_id) hh.set(r.household_id, [...(hh.get(r.household_id) || []), r.mok1]);
  assert.ok([...hh.keys()].some((h) => !ids.has(h)), "세대주가 명부에 없는 가구");
  assert.ok([...hh.entries()].some(([h, gs]) => ids.has(h) && new Set(gs).size > 1), "식구가 두 교구에 걸친 가구");
  assert.ok(FAM.some((r) => r.household_id === 0) && FAM.some((r) => r.household_id === null) && FAM.some((r) => r.household_id === ""),
    "household 0·null·빈칸");
});

test("교구 카드 가구 — 손으로 짠 경우들(세대주 교구에서 한 번 · 없는 세대주 · 같은 수면 교구 차례 앞 · 0/빈칸은 가구 아님)", () => {
  const R = (o) => ({ mok1: "", mok3: "", kind2: "장년", kind3: "", position: "", school_dept: "", gender: "", age: 40, has_photo: true,
    household_id: null, ...o });
  const rows = [
    // 가구 990000001 — 세대주는 소망, 식구 둘은 기쁨 → 소망 한 번(식구 수가 아니라 세대주)
    R({ person_id: 990000001, household_id: 990000001, mok1: "소망" }),
    R({ person_id: 990000002, household_id: 990000001, mok1: "기쁨" }),
    R({ person_id: 990000003, household_id: 990000001, mok1: "기쁨" }),
    // 가구 990000900 — 세대주가 명부에 없다 · 기쁨 하나 · 사랑 하나 → 같은 수면 교구 차례 앞(사랑)
    R({ person_id: 990000004, household_id: 990000900, mok1: "기쁨" }),
    R({ person_id: 990000005, household_id: 990000900, mok1: "사랑" }),
    // 가구 990000901 — 세대주가 명부에 없다 · 화평 둘 · 믿음 하나 → 식구 많은 화평
    R({ person_id: 990000006, household_id: 990000901, mok1: "믿음" }),
    R({ person_id: 990000007, household_id: 990000901, mok1: "화평" }),
    R({ person_id: 990000008, household_id: 990000901, mok1: "화평" }),
    // 가구 990000009 — 세대주가 교회학교(교구 없음) → 카드 밖 「(목장 없음)」에서 한 번
    R({ person_id: 990000009, household_id: 990000009, mok1: "" }),
    R({ person_id: 990000010, household_id: 990000009, mok1: "은혜" }),
    // 가구로 치지 않는 분 — 0 · 빈칸 · null
    R({ person_id: 990000011, household_id: 0, mok1: "섬김" }),
    R({ person_id: 990000012, household_id: "", mok1: "섬김" }),
    R({ person_id: 990000013, household_id: null, mok1: "섬김" }),
  ];
  const st = statsOf(rows);
  const hh = Object.fromEntries(st.guCards.map((c) => [c.gu, c.households]));
  assert.deepEqual(hh, { 믿음: 0, 소망: 1, 사랑: 1, 섬김: 0, 은혜: 0, 화평: 1, 기쁨: 0 });
  assert.equal(st.households, 4);
  assert.deepEqual(Object.fromEntries(householdsByGu(rows, st.gu.map((g) => g.gu))), { 소망: 1, 사랑: 1, 화평: 1, "(목장 없음)": 1 });
  assert.equal(st.guCards.find((c) => c.gu === "섬김").n, 3, "가구가 아니어도 인원에는 센다");
  // 차례를 바꿔 보면 같은 수의 승자가 바뀐다 — 교구 차례를 정말 보는지
  assert.equal(householdsByGu(rows.slice(3, 5), ["기쁨", "사랑"]).get("기쁨"), 1);
});

test("응답 JSON — 가족 명부로 세어도 목장 이름·가짜 이름·교인ID 가 없다 · 사전에 목장 칸이 없다", () => {
  for (const st of [S, FS]) {
    const json = JSON.stringify(st);
    assert.ok(!/\d+목장/.test(json), "목장 이름이 실렸다");
    assert.ok(!json.includes("시험이름") && !json.includes("시험식구"), "이름이 실렸다");
    assert.ok(!json.includes("99000"), "교인ID·세대주 번호가 실렸다");
    assert.equal("mok" in st.facts.dict, false);
  }
});

test("목장 번호 — 목장 수는 이름으로 센 것과 같다(0 = 목장 칸이 빈 분은 안 센다)", () => {
  for (const [rows, st] of [[ROWS, S], [FAM, FS]]) {
    for (const g of st.gu) {
      const names = new Set(rows.filter((r) => (r.mok1 || "(목장 없음)") === g.gu && r.mok3).map((r) => r.mok3));
      assert.equal(guTable(st.facts).rows.find((x) => x.gu === g.gu).moks, names.size, g.gu);
    }
    assert.ok(st.facts.gu.every(([, m]) => Number.isInteger(m) && m >= 0));
    assert.ok(st.facts.gu.some(([, m]) => m === 0), "목장 칸이 빈 분의 줄이 있다");
  }
});

test("교구 카드 HTML — 「1,234명」·「612가구」(숫자 뒤에 붙여) · 0 도 카드 · 옛 서버면 가구 줄 없음 · esc", () => {
  const h = guCardsHtml([{ gu: "믿음", n: 1234, households: 612 }, { gu: "소망", n: 0, households: 0 }, { gu: "<b>", n: 5, households: 1 }]);
  assert.equal((h.match(/<li class="card pp-gucard">/g) || []).length, 3);
  assert.ok(h.includes('>믿음</span><b>1,234명</b><span class="pp-gucard-h">612가구</span>'), h);
  assert.ok(h.includes('<b>0명</b><span class="pp-gucard-h">0가구</span>'));
  assert.ok(h.includes("&lt;b&gt;") && !h.includes("<b><b>"));
  // 옛 서버(guCards 없음) — 교구별 표에서 인원만 · 가구는 null → 가구 줄 없음
  const old = guCardRows({ gu: [{ gu: "기쁨", n: 12, moks: 1 }, { gu: "새가족", n: 3, moks: 0 }] });
  assert.deepEqual(old.map((c) => c.gu), CARD_GU);
  assert.deepEqual(old.find((c) => c.gu === "기쁨"), { gu: "기쁨", n: 12, households: null });
  assert.ok(!guCardsHtml(old).includes("가구</span>"));
  assert.equal(guCardRows(S), S.guCards);
  // 옛 카드 셋은 없다
  const html = guCardsHtml(guCardRows(S));
  for (const gone of ["전체", "사진 없는 분", "nophoto", "pp-kpi"]) assert.ok(!html.includes(gone), gone);
});

// b) 연령대·성별 — 고른 출석×교구에 한 분도 없으면 0 만 가득한 표 대신 한 줄
test("연령대 표 — 합계 0 이면 「해당하는 분이 없어요」 한 줄 · 아니면 표", () => {
  const R = (o) => ({ mok1: "기쁨", mok3: "", kind2: "장년", kind3: "출석교인", position: "", school_dept: "", gender: "남", age: 40, has_photo: true,
    household_id: null, ...o });
  const f = statsOf([R({}), R({ mok1: "소망", kind3: "장기결석" })]).facts;
  const none = ageHtml(ageTable(f, ["장기결석"], ["기쁨"]));    // 둘 다 있는 값인데 겹치는 분이 없다
  assert.match(none, /^<p class="empty">[^<]*해당하는 분이 없어요<\/p>$/);
  assert.ok(!none.includes("<table"));
  const some = ageHtml(ageTable(f, ["출석교인"], ["기쁨"]));
  assert.ok(some.startsWith("<table") && some.includes("<tfoot>"));
  assert.ok(ageHtml(ageTable(F)).startsWith("<table"));
});

// c) 고르개 인원을 같은 표의 다른 거르기 안에서 · d) 출석 「(없음)」도 고른다
test("고를 목록(교인 현황) — 연령대 표는 다른 거르기 안에서 센다 · 제 거르기로는 안 좁힌다 · 0명도 남긴다", () => {
  const k3Of = (r) => r.kind3 || "(없음)", guOf = (r) => r.mok1 || "(목장 없음)";
  const count = (pred, key, v) => ROWS.filter((r) => pred(r) && key(r) === v).length;
  for (const [k3, gu] of [[[], []], [["출석교인"], []], [[], ["기쁨", "믿음"]], [["장기결석", "(없음)"], ["청년부"]]]) {
    const c = statsChoices(F, { kind3: k3, mok1: gu });
    const inGu = (r) => !gu.length || gu.includes(guOf(r)), inK3 = (r) => !k3.length || k3.includes(k3Of(r));
    for (const [v, n] of c.kind3) assert.equal(n, count(inGu, k3Of, v), `출석 ${v} / 교구 ${gu}`);
    for (const [v, n] of c.mok1) assert.equal(n, count(inK3, guOf, v), `교구 ${v} / 출석 ${k3}`);
    assert.deepEqual(c.kind3.map(([v]) => v).sort(), F.dict.kind3.slice().sort(), "0명이 돼도 목록은 그대로");
    assert.deepEqual(c.mok1.map(([v]) => v), F.dict.gu.filter((g) => g !== "(목장 없음)"));
  }
  // 교구별·직분별 표(거르기가 출석 하나) — 제 거르기로 좁히지 않으니 전체 인원 = 출석 구분 표
  const whole = new Map(S.kind3);
  for (const [v, n] of statsChoices(F, { kind3: ["출석교인"] }).kind3) assert.equal(n, whole.get(v), v);
  // 출석을 골랐으면 교구 목록의 인원은 그 출석 안에서 — 좁혀진 게 실제로 다르다
  assert.notDeepEqual(statsChoices(F, { kind3: ["출석교인"] }).mok1, statsChoices(F).mok1);
});

test("고를 목록(교인 현황) — 출석 「(없음)」도 맨 끝에 · 다 고르면 합계가 전체 · 교인 찾기는 그대로 못 고른다", () => {
  const c = statsChoices(F);
  assert.equal(c.kind3.at(-1)[0], "(없음)");
  assert.equal(c.kind3.at(-1)[1], ROWS.filter((r) => !r.kind3).length);
  const all = c.kind3.map(([v]) => v);
  assert.equal(guTable(F, all).total.n, ROWS.length);
  assert.equal(positionTable(F, all).total, ROWS.length);
  const t = ageTable(F, all);
  assert.equal(t.total.m + t.total.f + t.total.x, ROWS.length);
  // 「(없음)」 하나만 — 출석 칸이 빈 분만
  assert.equal(guTable(F, ["(없음)"]).total.n, ROWS.filter((r) => !r.kind3).length);
  // 🔎 교인 찾기의 고를 목록은 그대로(서버 .in() 이 빈 칸을 못 거른다)
  assert.ok(!filterChoices(S).kind3.some(([k]) => k === "(없음)"));
  assert.ok(!c.mok1.some(([k]) => k === "(목장 없음)"));
});

// 옛 KPI 카드(.pp-kpi) 규칙은 걷었다 — 새 카드는 .card 의 아래 여백(margin-bottom)을 이겨야 칸 사이가 벌어지지 않는다
import { readFileSync } from "node:fs";
test("교구 카드 CSS — 옛 .pp-kpi 규칙 없음 · .pp-gucards 는 grid · 카드 margin:0 이 .card 보다 세다", () => {
  const css = readFileSync(new URL("../css/admin.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!css.includes("pp-kpi"), "옛 KPI 규칙이 남았다");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
  const spec = (s) => [(s.match(/#[\w-]+/g) || []).length, (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length,
    (s.replace(/[.#:][\w-]+|\[[^\]]*\]/g, " ").match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length];
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  assert.ok(rules.some((r) => r.sel === ".pp-gucards" && /display:grid/.test(r.body)), ".pp-gucards 는 grid");
  const mine = rules.filter((r) => /\.pp-gucard$/.test(r.sel) && /(^|;)margin:0(;|$)/.test(r.body));
  assert.ok(mine.length, "카드 margin:0 규칙");
  assert.ok(cmp(spec(mine[0].sel), spec(".card")) > 0, `${mine[0].sel} 가 .card 를 이겨야 한다`);
  const js = readFileSync(new URL("../js/menus/people/stats.js", import.meta.url), "utf8");
  assert.ok(!js.includes("pp-kpi") && !js.includes("#/people?nophoto"), "화면에 옛 카드가 남았다");   // 머리 주석의 ?nophoto=1 은 설명
});
