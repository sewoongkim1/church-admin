// 📊 교인 현황 거르기(2026-09-30) — 서버 statsOf 의 숫자 묶음(facts)으로 화면이 다시 센 표가
// ① 거르기 없으면 서버 표(gu·position·age)와 똑같고 ② 거르면 「그 분들만 골라 statsOf 를 다시 돌린 것」과 같은지 대조한다.
// 명부는 지어낸 것(시드 고정) — 이름·번호는 「시험」 글자로만.
import { test } from "node:test";
import assert from "node:assert/strict";
import { statsOf, AGE_BANDS, SEXES } from "../supabase/functions/church-admin/people-query.ts";
import { guTable, positionTable, ageTable, pickOptions } from "../js/menus/people/stats-logic.js";
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

// ⚠️ 「사진 없는 분」 카드는 <a class="card pp-kpi"> — `a.card{display:block}`(0,1,1)이 이기면 라벨·숫자·안내가
// 한 줄로 붙는다(「사진 없는 분406명 …」 · 2026-09-30). 세로로 쌓는 규칙의 특이도가 a.card 보다 높아야 한다.
import { readFileSync } from "node:fs";
test("KPI 카드 — <a class=\"card pp-kpi\"> 도 세로로 쌓인다(세로 규칙 특이도 > a.card)", () => {
  const css = readFileSync(new URL("../css/admin.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim(), body }));
  // 거친 특이도 — [아이디, 클래스·속성·가상클래스, 요소] (이 파일의 단순한 선택자면 충분)
  const spec = (s) => [(s.match(/#[\w-]+/g) || []).length,
    (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) || []).length,
    (s.replace(/[.#:][\w-]+|\[[^\]]*\]/g, " ").match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length];
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const displayOf = (want) => rules.flatMap((r) => r.sel.split(",").map((s) => s.trim())
    .filter((s) => want(s) && /(^|;)\s*display\s*:/.test(r.body))
    .map((s) => ({ s, sp: spec(s), flex: /display\s*:\s*flex/.test(r.body) })));
  const block = displayOf((s) => s === "a.card");
  const kpi = displayOf((s) => /\.pp-kpi$/.test(s));
  assert.ok(block.length && kpi.length, "a.card 와 .pp-kpi 의 display 규칙이 있어야 한다");
  const top = kpi.sort((a, b) => cmp(b.sp, a.sp))[0];
  assert.ok(top.flex, `${top.s} 가 display:flex 여야 한다`);
  for (const b of block) assert.ok(cmp(top.sp, b.sp) > 0, `${top.s}(${top.sp}) 가 ${b.s}(${b.sp}) 를 이겨야 한다`);
  assert.match(css, /flex-direction:column/);
});
