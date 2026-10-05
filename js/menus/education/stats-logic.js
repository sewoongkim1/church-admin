// 📊 교육 통계 — 화면 논리(순수 함수 · DOM 없음 · tests/edu-stats-logic.test.mjs 가 읽는다) · 교육신청 4단계 C(2026-10-06)
//   서버 eduStats 응답(edu-rules.ts statsOut): {term, terms, courses:[{id, title, term, status, statusLabel, applied, confirmed, waitlisted,
//   cancelled, declined, completed, attendN, attendSum, attendAvg, completeRate}], groups:[{whoType, group, confirmed, completed}], total}
//   수는 서버(SQL edu_stats)가 묶어 준 그대로 — 여기서는 글·차례·엑셀 줄만 만든다(신청 줄을 세지 않는다).
import { GU_ORDER, BU_ORDER } from "../bibleevent/roster-logic.js";
import { fileTitle } from "./enrollments-logic.js";

export const ALL_LABEL = "전체";
// 학기 고르기 — 「전체」(값 "") + 서버가 준 학기들(가장 늦게 만든 강좌의 학기부터 · 📚 강좌 관리와 같은 차례)
export const termOptions = (terms) => [{ value: "", label: ALL_LABEL }, ...(terms || []).map((t) => ({ value: t, label: t }))];
export const termLabel = (term) => term || ALL_LABEL;

export const pctText = (v) => (typeof v === "number" && Number.isFinite(v) ? `${v}%` : "—");
export const nText = (v) => (Number(v) || 0).toLocaleString("ko-KR");
// 강좌별 표의 숫자 칸(차례 = 화면·엑셀) — 평균 출석률·수료율은 % (나눌 것이 없으면 「—」)
export const COURSE_COLS = [["applied", "신청"], ["confirmed", "확정"], ["waitlisted", "대기"], ["cancelled", "취소"], ["declined", "반려"],
  ["attendAvg", "평균 출석률"], ["completed", "수료"], ["completeRate", "수료율"]];
export const isPct = (k) => k === "attendAvg" || k === "completeRate";
export const cellText = (row, k) => (isPct(k) ? pctText(row?.[k]) : nText(row?.[k]));
// 강좌 이름 아래 작은 줄 — 「전체」를 볼 때만 학기를 붙인다(학기 하나를 볼 때는 위 단추에 이미 있다)
export const courseSub = (c, allTerms) => [allTerms ? c?.term || "학기 없음" : "", c?.statusLabel].filter(Boolean).join(" · ");

// 소속 칸 — 교구·교회학교는 그 이름(「화평」·「중등부」) · 직접 입력(새가족 등 — who_type 이 그 밖)은 「구분 · 소속」 · 둘 다 비면 「소속 없음」
export function groupLabel(g) {
  const w = String(g?.whoType ?? ""), n = String(g?.group ?? "");
  if (w === "교구" || w === "교회학교") return n || "소속 없음";
  return [w, n].filter(Boolean).join(" · ") || "소속 없음";
}
export const groupKind = (g) => (g?.whoType === "교구" ? "교구" : g?.whoType === "교회학교" ? "교회학교" : g?.whoType || g?.group ? "직접 입력" : "");
// 소속 차례 — 교구(믿음·소망·사랑·섬김·은혜·화평·기쁨·새가족 → 그 밖 가나다) → 교회학교(사랑부…청년부 → 그 밖 가나다) → 직접 입력(가나다) → 소속 없음
const RANK = (g) => (g.whoType === "교구" ? 0 : g.whoType === "교회학교" ? 1 : g.whoType || g.group ? 2 : 3);
const listRank = (list, v) => { const i = list.indexOf(v); return i < 0 ? list.length : i; };
export function sortGroups(groups) {
  return [...(groups || [])].sort((a, b) => RANK(a) - RANK(b)
    || (RANK(a) === 0 ? listRank(GU_ORDER, a.group) - listRank(GU_ORDER, b.group) : 0)
    || (RANK(a) === 1 ? listRank(BU_ORDER, a.group) - listRank(BU_ORDER, b.group) : 0)
    || groupLabel(a).localeCompare(groupLabel(b), "ko"));
}
const rate = (part, whole) => (whole > 0 ? Math.round(part * 100 / whole) : null);   // 수료율(서버 statsRate 와 같은 셈)
export const groupRate = (g) => rate(Number(g?.completed) || 0, Number(g?.confirmed) || 0);
export function groupTotal(groups) {
  const confirmed = (groups || []).reduce((s, g) => s + (Number(g.confirmed) || 0), 0);
  const completed = (groups || []).reduce((s, g) => s + (Number(g.completed) || 0), 0);
  return { confirmed, completed, completeRate: rate(completed, confirmed) };
}

// 엑셀 — 두 장(강좌별 · 교구·부서별). 수는 숫자 칸으로(엑셀에서 더할 수 있게) · % 칸은 숫자(87)·없으면 빈칸 · 맨 아래 합계 줄
const pctCell = (v) => (typeof v === "number" && Number.isFinite(v) ? v : "");
export function statsSheets(d) {
  const courses = d?.courses || [], total = d?.total || {};
  const head = ["학기", "강좌", "상태", "신청", "확정", "대기", "취소", "반려", "평균 출석률(%)", "수료", "수료율(%)"];
  const row = (c) => [c.applied, c.confirmed, c.waitlisted, c.cancelled, c.declined, pctCell(c.attendAvg), c.completed, pctCell(c.completeRate)]
    .map((v) => (v === "" ? "" : Number(v) || 0));
  const courseAoa = [head, ...courses.map((c) => [c.term || "", c.title || "", c.statusLabel || "", ...row(c)]),
    ["합계", `강좌 ${courses.length}개`, "", ...row(total)]];
  const groups = sortGroups(d?.groups || []), gt = groupTotal(groups);
  const groupAoa = [["구분", "교구·부서", "확정", "수료", "수료율(%)"],
    ...groups.map((g) => [groupKind(g), groupLabel(g), Number(g.confirmed) || 0, Number(g.completed) || 0, pctCell(groupRate(g))]),
    ["합계", "", gt.confirmed, gt.completed, pctCell(gt.completeRate)]];
  return { courses: courseAoa, groups: groupAoa };
}
// 파일 이름 — 교육통계_{학기 또는 전체}_{오늘}.xlsx (학기 다듬기는 신청 현황·출석 엑셀과 같은 fileTitle)
export const statsFileName = (term, today) => `교육통계_${term ? fileTitle(term) : ALL_LABEL}_${today}.xlsx`;

// 빈 화면 글
export const NO_COURSES = "아직 셀 강좌가 없어요 — 「📚 강좌 관리」에서 강좌를 만들면 여기에 수가 나와요";
export const NO_TERM_COURSES = "이 학기에는 셀 강좌가 없어요 — 다른 학기를 골라 주세요";
export const NO_GROUPS = "확정된 분이 아직 없어요";
export const STATS_NOTE = "보관한 강좌는 세지 않아요 · 평균 출석률은 확정된 분마다 (출석+지각) ÷ (출석+지각+결석)으로 — 공결·체크 전 회차는 빼요 · 수료율 = 수료 ÷ 확정";
