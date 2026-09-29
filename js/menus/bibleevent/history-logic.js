// 👤 사람별 이력·통계 — 순수 함수(2026-09-29 · 성경필사(암송)). tests/be-history-logic.test.mjs 가 같은 파일을 읽는다(DOM 을 쓰지 않는다).
// 숫자는 서버 evStats(events-stats.ts statsOf)가 낸다 — 여기서는 고르기·표·내려받기 꼴만 만든다.
// ⚠️ 빠른 고르기(소책자·사순절·썸머) 규칙은 서버 events-stats.ts quickPick 과 **같아야** 한다. 브라우저는 .ts 를 못 읽어
//    여기 한 번 더 적고, 시험이 두 함수를 같은 id 들로 맞대 본다(한쪽만 고치면 시험이 실패한다).
// ⚠️ 사람 묶음은 근삿값이다(같은 이름·같은 소속 또는 같은 앱 계정) — 화면과 내려받기에 늘 그렇게 적는다.
// ⚠️ 여러 번 참여한 분(repeaters)의 label 은 **소속만**이다(CONTRACT 5절) — 이름은 name 칸. 화면은 「이름 · 소속」, CSV 는 두 칸.
import { whoText, csvCell } from "./roster-logic.js";

export const APPROX = "같은 이름·같은 소속(또는 같은 앱 계정)을 한 분으로 셌어요 — 근삿값이에요. 목장을 옮기신 해는 따로 나올 수 있어요.";
export const MIN_REPEAT = 3;   // 서버 statsOf 의 minRepeat 기본값 — 서버는 3회 이상만 보낸다

// 빠른 고르기 — [열쇠, 칩 글자]. 열쇠는 서버 quickPick 이 돌려주는 값 그대로.
export const QUICK = [["소책자", "📘 소책자"], ["사순절", "✝️ 사순절"], ["썸머", "☀️ 썸머"]];
export function quickKey(id) {
  const s = String(id ?? "");
  if (s.startsWith("lent-booklet-")) return "소책자";   // 소책자도 lent- 로 시작한다 — 먼저 본다
  if (s.startsWith("lent-")) return "사순절";
  if (s.startsWith("summer-")) return "썸머";
  return null;   // 가을 말씀 동행 등은 개별로만 고른다
}
export const quickIds = (events, key) => (events || []).filter((e) => quickKey(e.id) === key).map((e) => e.id);
// 칩 — 회차가 하나도 없는 묶음은 내놓지 않는다
export const quickChips = (events) => QUICK.map(([key, label]) => ({ key, label, n: quickIds(events, key).length }))
  .filter((c) => c.n > 0);
// 지금 고른 것(sel — null 이면 전부)이 어느 칩인가: "all" · 빠른 고르기 열쇠 · "custom"
export function chipOn(events, sel) {
  if (!sel) return "all";
  const s = new Set(sel);
  const same = (ids) => ids.length === s.size && ids.every((id) => s.has(id));
  if (same((events || []).map((e) => e.id))) return "all";
  for (const [key] of QUICK) {
    const ids = quickIds(events, key);
    if (ids.length && same(ids)) return key;
  }
  return "custom";
}

// 회차 id → 짧은 이름(없으면 제목, 그것도 없으면 id) — 표 머리·막대 이름
export const labelMap = (events) => new Map((events || []).map((e) => [e.id, e.short_title || e.title || e.id]));
const lb = (labels, id, fallback) => labels?.get(id) || fallback || id;

// 회차별 인원 막대 — 가장 많은 회차가 100%. 0명이 아니면 적어도 2%(보이게).
export function barRows(perEvent, labels) {
  const list = perEvent || [];
  const max = Math.max(0, ...list.map((e) => Number(e.count) || 0));
  return list.map((e) => {
    const count = Number(e.count) || 0;
    return { id: e.id, label: lb(labels, e.id, e.title), count, pct: max ? Math.max(count ? 2 : 0, Math.round((count / max) * 100)) : 0 };
  });
}

// 교구(부서) × 회차 표 — 열은 perEvent 차례, 줄은 서버 byGroup 차례(교구 먼저). 구분이 바뀌는 곳에 머리 줄.
export function crossTable(stats, labels) {
  const per = stats?.perEvent || [];
  const cols = per.map((e) => ({ id: e.id, label: lb(labels, e.id, e.title) }));
  const rows = [];
  let kind = null;
  for (const g of stats?.byGroup || []) {
    if (g.who_type !== kind) { kind = g.who_type; rows.push({ head: true, label: kind || "구분 없음" }); }
    rows.push({ head: false, label: g.group_name || "(소속 빈칸)", cells: cols.map((c) => Number(g.counts?.[c.id]) || 0), total: Number(g.total) || 0 });
  }
  const cells = per.map((e) => Number(e.count) || 0);
  return { cols, rows, foot: { cells, total: cells.reduce((s, n) => s + n, 0) } };
}

// 「N회 이상」 칩 — 3회부터 가장 많이 참여한 횟수까지, 칩마다 그 이상인 분 수
export function repeatChoices(repeaters) {
  const list = repeaters || [];
  const max = Math.max(0, ...list.map((x) => Number(x.times) || 0));
  const out = [];
  for (let m = MIN_REPEAT; m <= max; m++) out.push({ min: m, n: list.filter((x) => x.times >= m).length });
  return out;
}
export const repeatersAt = (repeaters, min) => (repeaters || []).filter((x) => x.times >= min);

// 통계 내려받기 — 엑셀에서 바로 열리게 CSV(BOM · \r\n). 세 표를 빈 줄로 나눠 한 파일에.
// 여러 번 참여한 분은 「이름」「소속」 두 칸(repeaters 의 name·label — label 은 소속만).
// 칸은 roster-logic.js csvCell 로 감싼다 — 이름·소속은 서버가 준 값(앱 계정·교인명부)이라 「=…」로 시작하면
// 엑셀이 수식으로 읽을 수 있어, 그 앞에 ' 를 붙여 막는다(roster-logic.js 「수식으로 안 읽히게」와 같은 규칙).
export function statsCsv(stats, labels, min) {
  const x = crossTable(stats, labels);
  const lines = [["회차별 인원"], ["회차", "인원"]];
  for (const e of stats?.perEvent || []) lines.push([e.title || e.id, e.count]);
  lines.push([], ["교구(부서) × 회차 — 명단 줄 수"], ["구분", "소속", ...x.cols.map((c) => c.label), "합계"]);
  let kind = "";
  for (const r of x.rows) {
    if (r.head) { kind = r.label; continue; }
    lines.push([kind, r.label, ...r.cells, r.total]);
  }
  lines.push(["합계", "", ...x.foot.cells, x.foot.total]);
  lines.push([], [`여러 번 참여한 분 — ${min}회 이상 · ${APPROX}`], ["이름", "소속", "횟수", "참여 회차"]);
  for (const p of repeatersAt(stats?.repeaters, min)) {
    lines.push([p.name, p.label, p.times, (p.events || []).map((id) => lb(labels, id)).join(" · ")]);
  }
  return "﻿" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
// 파일 이름 — 한국 날짜
export function csvName(now = new Date()) {
  const d = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  return `성경필사_통계_${d}.csv`;
}

// 이름 찾기 결과 — 몇 분(묶음)·모두 몇 회
export const histSummary = (groups) => ({
  people: (groups || []).length,
  times: (groups || []).reduce((s, g) => s + (g.rows || []).length, 0),
});
// 이력 한 줄의 소속·직분 — 「화평 20목장 · 집사」(소속 글은 📋 회차·명단 whoText)
export const histRowText = (r) => [whoText(r), r?.position].filter(Boolean).join(" · ");
