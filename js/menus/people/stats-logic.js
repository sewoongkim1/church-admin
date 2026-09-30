// 📊 교인 현황 — 거르기로 다시 세기(순수 함수 · 2026-09-30). tests/people-stats.test.mjs 가 같은 파일을 읽는다(DOM 을 쓰지 않는다).
// 친구 요청(2026-09-30) 「교구별 출석 필터, 직분 출석 필터 · 연령별 성별 출석 및 교구 필터」 —
//   서버 peopleStats 가 한 번 준 숫자 묶음(stats.facts · people-query.ts factsOf)으로 표를 다시 센다. 서버를 다시 부르지 않는다.
//   facts.dict = 값 사전 · 줄 = [값 번호…, 인원] — 꼴은 factsOf 머리 주석.
// 고른 값(values)이 빈 배열이면 거르지 않는다(전체). 하나라도 고르면 그 값의 분들만 센다.
// ⚠️ 거르기 없이 센 결과는 서버의 stats.gu·position·age 와 똑같아야 한다(시험이 대조한다) — 차례 규칙을 바꾸면 서버 statsOf 도.

// 고른 값 → 번호 모음. 안 골랐으면 null(거르지 않음). 사전에 없는 값은 버린다(그 값의 분은 없다).
function pickedIndex(dict, values) {
  if (!Array.isArray(values) || !values.length) return null;
  const s = new Set();
  for (const v of values) { const i = dict.indexOf(v); if (i >= 0) s.add(i); }
  return s;
}
const hit = (set, i) => !set || set.has(i);

// 교구별 — [{ gu, moks, n }] · 합계 { moks, n }. 교구 차례는 서버 표 그대로(dict.gu = stats.gu 차례).
// 고른 출석에 한 분도 없는 교구는 뺀다(서버 표도 있는 교구만 싣는다). 목장 수 = 고른 출석의 분이 한 분이라도 있는 목장.
export function guTable(facts, kind3 = []) {
  const ks = pickedIndex(facts.dict.kind3, kind3);
  const per = facts.dict.gu.map(() => ({ n: 0, moks: new Set() }));
  for (const [g, m, k, n] of facts.gu) {
    if (!hit(ks, k)) continue;
    per[g].n += n;
    if (facts.dict.mok[m]) per[g].moks.add(m);   // 목장 빈 글자는 세지 않는다(서버와 같게)
  }
  const rows = facts.dict.gu.map((gu, i) => ({ gu, moks: per[i].moks.size, n: per[i].n })).filter((r) => r.n > 0);
  return { rows, total: { moks: rows.reduce((a, r) => a + r.moks, 0), n: rows.reduce((a, r) => a + r.n, 0) } };
}

// 직분별 — [[직분, 인원]] · 합계. 인원 많은 차례, 같으면 가나다(서버 countBy 와 같은 규칙). 0명인 직분은 뺀다.
export function positionTable(facts, kind3 = []) {
  const ks = pickedIndex(facts.dict.kind3, kind3);
  const cnt = facts.dict.position.map(() => 0);
  for (const [p, k, n] of facts.position) if (hit(ks, k)) cnt[p] += n;
  const rows = facts.dict.position.map((v, i) => [v, cnt[i]]).filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
  return { rows, total: rows.reduce((a, [, n]) => a + n, 0) };
}

// 연령대·성별 — [{ band, m, f, x }] · 합계 { m, f, x }. 연령대는 늘 전부(서버 AGE_BANDS 차례 · 0명도 한 줄).
// 성별은 거르기가 아니라 칸이다(남·여·모름).
const SEX_KEY = ["m", "f", "x"];
export function ageTable(facts, kind3 = [], gu = []) {
  const ks = pickedIndex(facts.dict.kind3, kind3), gs = pickedIndex(facts.dict.gu, gu);
  const rows = facts.dict.band.map((band) => ({ band, m: 0, f: 0, x: 0 }));
  for (const [b, s, k, g, n] of facts.age) {
    if (!hit(ks, k) || !hit(gs, g)) continue;
    rows[b][SEX_KEY[s] || "x"] += n;
  }
  const sum = (key) => rows.reduce((a, r) => a + r[key], 0);
  return { rows, total: { m: sum("m"), f: sum("f"), x: sum("x") } };
}

// 고르개(pickMany) 선택지 — [값, 인원] → { value, label, hint:「N명」 } (🔎 교인 찾기와 같은 모양)
export const pickOptions = (pairs) =>
  (pairs || []).map(([v, n]) => ({ value: v, label: v, hint: `${Number(n || 0).toLocaleString("ko-KR")}명` }));
