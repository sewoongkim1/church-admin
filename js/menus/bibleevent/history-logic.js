// 👤 사람별 이력·통계 — 순수 함수(2026-09-29 · 성경필사(암송)). tests/be-history-logic.test.mjs 가 같은 파일을 읽는다(DOM 을 쓰지 않는다).
// 숫자는 서버 evStats(events-stats.ts statsOf)가 낸다 — 여기서는 고르기·표·내려받기 꼴만 만든다.
// ⚠️ 빠른 고르기(소책자·사순절·썸머) 규칙은 서버 events-stats.ts quickPick 과 **같아야** 한다. 브라우저는 .ts 를 못 읽어
//    여기 한 번 더 적고, 시험이 두 함수를 같은 id 들로 맞대 본다(한쪽만 고치면 시험이 실패한다).
// ⚠️ 사람 묶음은 근삿값이다(같은 이름·같은 소속 또는 같은 앱 계정) — 화면과 내려받기에 늘 그렇게 적는다.
// ⚠️ 여러 번 참여한 분(repeaters)의 label 은 **소속만**이다(CONTRACT 5절) — 이름은 name 칸. 화면은 「이름 · 소속」, CSV 는 두 칸.
import { whoText, csvCell, evPickOptions, norm } from "./roster-logic.js";

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

// 「통계에 넣을 회차」 고르개(pickMany) 선택지 — 📋 회차·명단 콤보·📤 올릴 회차와 한 벌(evPickOptions · 2026-09-30):
// 「2026년 3월 · 제목 전체」 · 「231명 · 마감」(+ 👁) · 시작일 최근 먼저. 자격 회차도 통계에는 넣는다.
export const statsPickOptions = (events) => evPickOptions(events);

// ── 통계 이름표 · 차례(2026-10-01 친구 「왼쪽에 년도가 들어가도록」·「완서자는 빼주세요 — 모두 완서 기준이니」·「이벤트도 빼주시고」·
//    「2022년은 마태복음입니다」·「순서는 연도 일자별 내림차순으로」) ──
// ⚠️ **👤 통계 화면만의 표시 규칙**이다 — 막대 이름·교구×회차 머리 칸·「고른 회차 N개 — …」 줄·내려받기(세 표)·여러 번 참여한 분의
//    참여 회차. DB 의 제목과 다른 화면(📋 콤보·📤 올릴 회차·👤 「통계에 넣을 회차」 고르개 = roster-logic.js evPickLabel 「2026년 3월 · 제목 전체」)은 그대로다.
// 이름은 **제목**에서(짧은 이름엔 「사순절 완서자」처럼 책 이름이 없는 회차가 있다 → 짧은 이름 → id): 앞 연도(「2026」·「2026년」)를 떼고,
// 따로 선 낱말 「완서자」「이벤트」「참여자」「성경필사」를 빼고(다 빼면 비는 이름은 빼기 전 그대로), 시작일(opens_on)의 연도를 앞에 붙인다.
// 시작일이 없거나 꼴이 아니면 뗀 앞 연도 · 그것도 없으면 연도 없이. 「2026 사순절 마가복음 성경필사 완서자」 → 「2026 사순절 마가복음」.
const DROP_WORDS = new Set(["완서자", "이벤트", "참여자", "성경필사"]);
const YEAR_TOKEN = /^(\d{4})년?$/;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
// YYYY-MM-DD 이고 월·일이 말이 되면 그 글, 아니면 "" — roster-logic.js evYm 과 같은 판정(「2026-13-01」은 날짜 없음)
function ymd(v) {
  const s = norm(v);
  const m = YMD.exec(s);
  return m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? s : "";
}
// 제목 앞의 연도 — 띄어 썼든(「2026 사순절」) 붙여 썼든(「2026사순절」·「2026년도 사순절」) 한 번만 뗀다(검토 M1).
//   뒤에 글이 남을 때만 뗀다 — 「2026년」처럼 연도뿐인 제목은 아래에서 연도 하나로.
const LEAD_YEAR = /^(\d{4})(?:년도|년)?\s*(?=[^\d\s년])/;
export function statLabel(ev) {
  const raw = (norm(ev?.title) || norm(ev?.short_title) || norm(ev?.id)).normalize("NFC");
  const lead = LEAD_YEAR.exec(raw);
  const toks = (lead ? raw.slice(lead[0].length) : raw).split(" ").filter(Boolean);
  const year = ymd(ev?.opens_on).slice(0, 4) || (lead ? lead[1] : "");
  // 연도뿐인 제목(「2026」·「2026년」) — 연도 하나(시작일이 있으면 그 연도)
  if (!lead && toks.length === 1 && YEAR_TOKEN.exec(toks[0])) return year || YEAR_TOKEN.exec(toks[0])[1];
  // 뒤에 같은 연도가 또 있어도(「사순절 2026」) 한 번만
  const kept = toks.filter((t) => !DROP_WORDS.has(t) && !(year && YEAR_TOKEN.exec(t)?.[1] === year));
  const body = (kept.length ? kept : toks).join(" ");
  return year && body !== year ? `${year} ${body}`.trim() : body;
}
// 회차 id → 통계 이름표 — 막대·표 머리·고른 회차 줄·내려받기·여러 번 참여한 분의 참여 회차가 모두 이것을 쓴다
export const labelMap = (events) => new Map((events || []).map((e) => [e.id, statLabel(e)]));
const lb = (labels, id, fallback) => labels?.get(id) || fallback || id;

// 통계의 회차 차례 — 시작일 늦은 것 먼저 → 마감일 늦은 것 먼저 → id(abc 순 · 「lent-2026」이 「lent-booklet-2026」 앞).
// 날짜가 없거나 꼴이 아닌 회차는 날짜 있는 회차 뒤. 서버 statsOf 는 기간 차례(마감일 오름차순)로 주니 화면이 다시 세운다.
// (📋 콤보 차례 roster-logic.js sortEvents 는 마감일을 안 보고 같은 날이면 id 거꾸로 — 그 화면 것이라 건드리지 않는다)
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byRecent = (a, b) => byCode(ymd(b.opens_on), ymd(a.opens_on)) || byCode(ymd(b.closes_on), ymd(a.closes_on)) ||
  byCode(norm(a.id), norm(b.id));
function recentRank(events) {
  const rank = new Map();
  [...(events || [])].sort(byRecent).forEach((e, i) => { if (!rank.has(e.id)) rank.set(e.id, i); });
  return rank;
}
// 회차 id 들을 최근 회차 먼저로(새 배열) — 회차 목록에 없는 id 는 맨 뒤에 받은 차례 그대로
function orderBy(ids, rank) {
  const r = (id) => (rank.has(id) ? rank.get(id) : rank.size);
  return [...(ids || [])].sort((a, b) => r(a) - r(b));
}
export const recentIds = (ids, events) => orderBy(ids, recentRank(events));
// 통계(evStats)를 최근 회차 먼저로 — 통계를 받은 **한 곳**(history.js loadStats)에서 부르고, 막대·교구×회차 열·내려받기는 그 결과를 쓴다.
// perEvent 와 여러 번 참여한 분의 events 를 다시 세운다. 교구 줄(byGroup)은 회차 차례와 상관없어 그대로. 받은 통계는 바꾸지 않는다.
export function orderStats(stats, events) {
  const rank = recentRank(events);
  const pos = new Map(orderBy((stats?.perEvent || []).map((e) => e.id), rank).map((id, i) => [id, i]));
  return {
    ...stats,
    perEvent: [...(stats?.perEvent || [])].sort((a, b) => pos.get(a.id) - pos.get(b.id)),
    byGroup: stats?.byGroup || [],
    repeaters: (stats?.repeaters || []).map((p) => ({ ...p, events: orderBy(p.events, rank) })),
  };
}

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
// 새 통계에 맞춘 「N회 이상」(minrepeat-reset) — 칩이 없으면 3(옛 값이 빈 글·CSV 에 남지 않게) · 고른 칩이 있으면 그대로 ·
// 가장 많은 횟수보다 크면 그 횟수(3으로 떨어지지 않게) · 그 밖(3 아래)은 첫 칩
export function fitRepeat(choices, cur) {
  const list = choices || [];
  if (!list.length) return MIN_REPEAT;
  if (list.some((c) => c.min === cur)) return cur;
  const last = list[list.length - 1].min;
  return cur > last ? last : list[0].min;
}

// 통계 내려받기 — 엑셀에서 바로 열리게 CSV(BOM · \r\n). 세 표를 빈 줄로 나눠 한 파일에.
// 여러 번 참여한 분은 「이름」「소속」 두 칸(repeaters 의 name·label — label 은 소속만).
// 칸은 roster-logic.js csvCell 로 감싼다 — 이름·소속은 서버가 준 값(앱 계정·교인명부)이라 「=…」로 시작하면
// 엑셀이 수식으로 읽을 수 있어, 그 앞에 ' 를 붙여 막는다(roster-logic.js 「수식으로 안 읽히게」와 같은 규칙).
export function statsCsv(stats, labels, min) {
  const x = crossTable(stats, labels);
  const lines = [["회차별 인원"], ["회차", "인원"]];
  // 회차 이름은 세 표 모두 막대와 같은 이름표(2026-10-01 — 예전엔 이 표만 제목 전체였다)
  for (const e of stats?.perEvent || []) lines.push([lb(labels, e.id, e.title), e.count]);
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
  return "\uFEFF" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
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
