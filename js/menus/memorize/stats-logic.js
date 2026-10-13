// 📊 성경암송 통계 — 화면 논리(순수 함수 · DOM 없음 · tests/mem-stats-logic.test.mjs 가 읽는다 · 2026-10-13)
//   네 보기(기간별 사용현황 · 구절별 현황 · 도전 현황 · 축복 기도문 사용현황)가 기간(from·to) 하나를 함께 쓴다.
//   옛 성경암송 admin-stats.html 의 renderUsageReport · renderVerses · renderChallengeReport · renderBlessingUsage 를 옮겼다 —
//   수는 성경암송 api 가 센 그대로(stats · verses · ranking · blessingUsage). 여기서는 거르기·차례·합계·글만 만든다.
import { GU_ORDER, BU_ORDER } from "../bibleevent/roster-logic.js";
import { fmtDateLabel } from "../../core/picker.js";

export const TABS = [["usage", "기간별 사용현황"], ["verses", "구절별 현황"], ["challenge", "도전 현황"], ["blessing", "축복 기도문 사용현황"]];
// 빠른 기간 — 옛 화면의 단추 셋 그대로(전체기간 · 이번 달 · 최근 7일)
export const QUICK = [["all", "전체기간"], ["month", "이번 달"], ["week", "최근 7일"]];
export const GUBUNS = ["전체", "교구", "교회학교"];

export const MSG = {
  empty: "이 기간에 기록이 없어요.",
  noChallenge: "이 기간·조건에 도전 기록이 없어요.",
  allSosok: "「전체」에서는 모든 소속을 함께 세요 — 교구나 교회학교를 고르면 소속을 고를 수 있어요.",
  noLabels: "말씀 이름을 불러오지 못해 순번으로만 보여요. 「조회」를 누르면 다시 불러와요.",
  someUnnamed: "말씀 이름은 앱의 주간 암송 말씀 목록에서 가져와요 — 그 목록에 없는 순번(시편 말씀 액자 등)은 「No.순번」으로 보여요.",
};

// 화면에 찍는 수 — 천 단위 쉼표(옛 화면 nf 와 같다)
export const nText = (v) => (Number(v) || 0).toLocaleString("ko-KR");
export const sumOf = (rows, k) => (rows || []).reduce((a, r) => a + (Number(r?.[k]) || 0), 0);

// ── 기간 ──
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// "YYYY-MM-DD" 에 n 일 — 날짜 꼴이 아니면 ""
export function addDays(ds, n) {
  const m = DATE_RE.exec(String(ds || ""));
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)).toISOString().slice(0, 10);
}
// 빠른 기간(today 는 한국 날짜) — 전체 = 양끝을 비운다(서버가 거르지 않는다) · 이번 달 = 1일~오늘 · 최근 7일 = 오늘을 넣어 7일
export function quickRange(q, today) {
  if (q === "all") return { from: "", to: "" };
  if (q === "month") return { from: String(today).slice(0, 8) + "01", to: today };
  if (q === "week") return { from: addDays(today, -6), to: today };
  return null;
}
// 처음 기간 — 최근 30일(오늘을 넣어 · 이 메뉴가 처음부터 쓰던 기본값)
export const defaultRange = (today) => ({ from: addDays(today, -29), to: today });
// 지금 기간이 빠른 기간 가운데 하나와 같으면 그 이름("all"·"month"·"week") · 아니면 ""
export function quickOf(from, to, today) {
  for (const [q] of QUICK) {
    const r = quickRange(q, today);
    if (r.from === (from || "") && r.to === (to || "")) return q;
  }
  return "";
}
// 기간 한 줄 — 옛 화면 rangeTxt 그대로
export const rangeText = (from, to) => (from || to ? `${from || "처음"} ~ ${to || "오늘"}` : "전체 기간");
// 날짜 단추 글 — 올해면 「10월 13일 (화)」 · 다른 해면 「2025년 10월 13일」(폰에서 단추가 넘치지 않게 요일은 뺀다) · 비었으면 none
export function dateText(ds, today, none) {
  const t = fmtDateLabel(ds);
  if (!t) return none;
  const [y, m, d] = ds.split("-").map(Number);
  return ds.slice(0, 4) === String(today || "").slice(0, 4) ? t : `${y}년 ${m}월 ${d}일`;
}

// 구분 딱지 class — 교회학교만 금빛(옛 화면 gubun-교회학교)
export const gubunCls = (g) => (g === "교회학교" ? "ms-gb school" : "ms-gb");

// ── ① 기간별 사용현황(stats) ──
// 수 카드 — [응답 키, 이름, 강조]. 합계 = 타이핑 + 음성(총 도전) · 카드는 타이핑 가운데 카드 모드 수
export const USAGE_KPI = [["newCount", "신규 참여자", "gold"], ["participants", "참여자"], ["total", "총 도전"],
  ["typing", "타이핑"], ["voice", "음성"], ["card", "카드 모드"]];
// 표 열 이름 — 응답 키 → 한글(모르는 키는 그대로)
export const USAGE_COL = { gubun: "구분", sosok: "소속", newCount: "신규", participants: "참여", active: "활동",
  typing: "타이핑", card: "카드", voice: "음성", cumulative: "누적", total: "합계" };
const isNumVal = (v) => v !== null && v !== undefined && v !== "" && typeof v !== "boolean" && !isNaN(v);
// 표 칸 — 받은 줄들에 있는 키 전부(처음 나온 차례) · 값이 모두 비었거나 수인 열은 수 열(오른쪽 · 합계를 낸다)
export function usageCols(rows) {
  const keys = [...new Set((rows || []).flatMap((r) => Object.keys(r || {})))];
  return keys.map((k) => ({ key: k, label: USAGE_COL[k] || k,
    num: (rows || []).every((r) => r?.[k] == null || r[k] === "" || isNumVal(r[k])) }));
}
// 칸 글 — 수는 쉼표, 그 밖(구분·소속)은 글 그대로
export const usageCell = (v) => (isNumVal(v) ? nText(v) : String(v ?? ""));
// 소속별 막대 — 합계(총 도전) 큰 차례 · 교회학교는 🏫 를 붙인다
export function usageBars(rows) {
  return (rows || []).map((r) => ({ label: `${r?.gubun === "교회학교" ? "🏫 " : ""}${r?.sosok || ""}`, v: Number(r?.total) || 0 }))
    .sort((a, b) => b.v - a.v);
}
export const barPct = (v, max) => Math.round(((Number(v) || 0) / Math.max(1, Number(max) || 0)) * 100);

// ── ② 구절별 현황(verses) ──
// 말씀 이름 — getVerses 의 말씀 목록으로(옛 화면 loadVerseMap 과 같은 글: 「짧은 장절 · 설교 제목」) · 키는 순번 글자
export function verseLabels(verses) {
  const map = {};
  for (const v of verses || []) {
    const no = Number(v?.no);
    if (!Number.isFinite(no)) continue;
    map[String(no)] = [v.refShort || v.refFull || `No.${v.no}`, v.sermonTitle].filter(Boolean).join(" · ");
  }
  return map;
}
export const verseLabel = (map, no) => (map && map[String(Number(no))]) || `No.${no}`;
// 구절별 줄 — 서버가 준 차례 그대로(순번 오름) · 합계는 참여횟수만(참여자는 구절마다 겹쳐 더할 수 없다)
export function verseView(list, map) {
  const rows = (list || []).map((r) => {
    const named = !!(map && map[String(Number(r?.no))]);
    return { no: r?.no, label: verseLabel(map, r?.no), named, participants: Number(r?.participants) || 0, count: Number(r?.count) || 0 };
  });
  return { rows, used: rows.length, count: sumOf(rows, "count"), unnamed: rows.filter((r) => !r.named).length };
}

// ── ③ 도전 현황(ranking) ──
// 소속 고르기 목록 — 교구면 교구 차례 · 교회학교면 부서 차례(옛 GU_LIST·BU_LIST 와 같다) · 목록에 없는 소속이 기록에 있으면 그 뒤에 가나다.
//   n = 지금 받은 기록에서 그 소속의 참여자 수. 「전체」면 고를 것이 없다(빈 배열).
export function sosokOptions(gubun, list) {
  const base = gubun === "교구" ? GU_ORDER : gubun === "교회학교" ? BU_ORDER : null;
  if (!base) return [];
  const cnt = new Map();
  for (const r of list || []) {
    if (r?.gubun !== gubun) continue;
    const s = String(r?.sosok || "");
    if (s) cnt.set(s, (cnt.get(s) || 0) + 1);
  }
  const extra = [...cnt.keys()].filter((s) => !base.includes(s)).sort((a, b) => a.localeCompare(b, "ko"));
  return [...base, ...extra].map((value) => ({ value, n: cnt.get(value) || 0 }));
}
// 거르기 → 줄·합계. 차례는 옛 화면 그대로 — 도전횟수 많은 차례, 같으면 이름 차례. # 은 거른 뒤의 차례(1부터).
//   「전체」 구분에서는 소속 거르기를 보지 않는다(옛 화면: 그때는 소속 칸이 없다).
export function challengeView(list, { gubun = "전체", sosok = [] } = {}) {
  let rows = list || [];
  const g = gubun && gubun !== "전체" ? gubun : "";
  if (g) rows = rows.filter((r) => r?.gubun === g);
  if (g && sosok && sosok.length) rows = rows.filter((r) => sosok.includes(r?.sosok));
  const nm = (r) => String(r?.name ?? "");
  rows = [...rows].sort((a, b) => (Number(b?.count) || 0) - (Number(a?.count) || 0) || (nm(a) < nm(b) ? -1 : nm(a) > nm(b) ? 1 : 0));
  return { rows, people: rows.length, typing: sumOf(rows, "typing"), voice: sumOf(rows, "voice"), count: sumOf(rows, "count") };
}
// 소속 고르개 단추의 이름 — 구분에 따라
export const sosokLabel = (gubun) => (gubun === "교구" ? "교구" : gubun === "교회학교" ? "부서" : "교구/교회학교");

// ── ④ 축복 기도문 사용현황(blessingUsage) ──
// 서버 답 → 화면이 쓰는 꼴. 본 사람이 0 이면 빈 기간(표가 아직 없는 DB 도 서버가 빈 결과로 준다)
export function blessingView(d) {
  const s = d?.summary || {};
  const summary = { people: Number(s.people) || 0, total: Number(s.total) || 0, days: Number(s.days) || 0 };
  return { summary, byPrayer: d?.byPrayer || [], byUser: d?.byUser || [], empty: !summary.people };
}
// 「누가 얼마나」 소속 칸 — 「화평-20」 · 「유년부-3」 · 둘 다 비면 「-」(옛 화면 그대로)
export const blessingWho = (r) => [r?.sosok, r?.sebu].filter(Boolean).join("-") || "-";
