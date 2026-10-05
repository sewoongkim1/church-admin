// ✅ 출석부 — 순수 함수(시험이 읽는다 · DOM 없음 · tests/edu-attendance-logic.test.mjs)
//   칸 이름은 서버 edu-db.ts(eduAttendCourses·eduAttendSessions·eduAttendSheet·eduAttendSummary)의 응답과 같다.
//   상태 값·이름표는 서버 edu-rules.ts 의 ATTEND_STATES·ATTEND_LABEL·ATTEND_MARK 와 같게 둔다(엑셀 칸 ○·지·결·공).
//   ⚠️ 출석률은 여기서 다시 셈하지 않는다 — 서버가 준 pct(eduAttendRate)를 그대로 보인다.
import { fileTitle } from "./enrollments-logic.js";

export const STATES = ["present", "late", "absent", "excused"];
export const STATE_LABEL = { present: "출석", late: "지각", absent: "결석", excused: "공결" };
export const STATE_MARK = { present: "○", late: "지", absent: "결", excused: "공" };
export const NO_MARK = "·";   // 체크 전 칸

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// "2026-11-08" → 「11/8(일)」 (날짜만 있는 값 — UTC 자정으로 읽어 요일이 밀리지 않는다) · 틀린 값은 빈 글
export function mdw(d) {
  const m = DATE_RE.exec(String(d || ""));
  if (!m) return "";
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(t) || t.getUTCDate() !== +m[3]) return "";
  return `${+m[2]}/${+m[3]}(${WD[t.getUTCDay()]})`;
}

// ---------- 강좌 ----------
// 강좌 단추·고르개 글 — 「구원론 3차 · 2026 하반기 · 진행 중」
export const courseLabel = (c) => `${c?.title || ""} · ${c?.term || "학기 없음"} · ${c?.statusLabel || ""}`;

// 고르개 아래 작은 글 — 「오늘 수업 · 확정 20분」·「다음 11/8(일) · 확정 20분」·「회차 없음 · 확정 0분」
export function courseHint(c) {
  const when = c?.hasToday ? "오늘 수업" : c?.nextDate ? `다음 ${mdw(c.nextDate)}` : c?.sessionsCount ? "회차를 모두 마쳤어요" : "회차 없음";
  return `${when} · 확정 ${Number(c?.confirmed) || 0}분`;
}

// 오늘 수업이 있는 강좌를 먼저(그 안·밖의 차례는 서버가 준 그대로 — 진행 중 → 모집 중 → … · 다음 회차 이른 것)
export function orderCourses(list) {
  const a = Array.isArray(list) ? list : [];
  return [...a.filter((c) => c && c.hasToday), ...a.filter((c) => c && !c.hasToday)];
}

export const courseOptions = (list) => orderCourses(list).map((c) => ({ value: c.id, label: courseLabel(c), hint: courseHint(c) }));

// 처음 열 강좌 — 지난번에 본 강좌 → 오늘 수업이 있는 첫 강좌 → 강좌가 하나뿐이면 그것 → 없음(고르게 한다)
export function initialCourse(list, lastId) {
  const a = orderCourses(list);
  return (lastId && a.find((c) => c.id === lastId)) || a.find((c) => c.hasToday) || (a.length === 1 ? a[0] : null);
}

// ---------- 회차 ----------
// 회차 칩 — 「3회 11/8(일) · 12/20」(체크한 분/확정된 분)
export function sessionChip(s, confirmed) {
  const d = mdw(s?.date);
  return `${s?.no}회${d ? " " + d : ""} · ${Number(s?.marked) || 0}/${Number(confirmed) || 0}`;
}

// 출석부 위 회차 한 줄 — 「3회 · 11/8(일) 14:00~15:30 · 성화」(없는 칸은 뺀다)
export function sessionLine(s) {
  if (!s) return "";
  const t = s.start ? (s.end ? `${s.start}~${s.end}` : s.start) : "";
  const when = [mdw(s.date), t].filter(Boolean).join(" ");
  return [`${s.no}회`, when, s.topic || ""].filter(Boolean).join(" · ");
}

// 회차가 오늘보다 뒤인가(날짜 글자 비교 — YYYY-MM-DD) · 지난·오늘 회차는 false
export const isFuture = (s, today) => !!(s && DATE_RE.test(s.date || "") && DATE_RE.test(today || "") && s.date > today);

// ---------- 출석부(한 회차) ----------
// 줄들에서 다시 센다 — 누르자마자(서버 답 전에) 위 줄·칩·「남은 N분」을 고치려고
export function countRows(rows) {
  const k = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const r of rows || []) if (r && r.state && r.state in k) k[r.state]++;
  const total = (rows || []).length;
  return { ...k, marked: k.present + k.late + k.absent + k.excused, total };
}

// 「체크 12/20 · 출석 10 · 지각 1 · 결석 1 · 공결 0」
export const countsLine = (c) =>
  `체크 ${c.marked}/${c.total} · 출석 ${c.present} · 지각 ${c.late} · 결석 ${c.absent} · 공결 ${c.excused}`;

// 누른 단추 → 보낼 상태 — 지금 상태를 다시 누르면 지운다(null)
export function nextState(cur, tapped) {
  if (!STATES.includes(tapped)) return cur ?? null;
  return cur === tapped ? null : tapped;
}

// 「남은 N분 모두 출석」 — 아직 체크 안 한 분 수(0 이면 단추를 그리지 않는다)
export const remaining = (c) => Math.max(0, (Number(c?.total) || 0) - (Number(c?.marked) || 0));
export const bulkLabel = (n) => `남은 ${n}분 모두 출석`;
export const bulkAsk = (n) => `아직 체크하지 않은 ${n}분을 모두 「출석」으로 할까요? 이미 체크한 분은 그대로예요.`;
export const bulkDoneText = (count) => (Number(count) > 0 ? `${Number(count)}분을 출석으로 체크했어요` : "새로 체크할 분이 없었어요");

// 단추 하나의 이름(화면 읽기 프로그램) — 「가나다 출석」 · 켜져 있으면 「다시 누르면 지워요」
export const buttonAria = (name, st, on) => `${name} ${STATE_LABEL[st] || ""}${on ? " (다시 누르면 지워요)" : ""}`;

// ---------- 오류 ----------
// 출석부가 받는 오류 → 한국말(없으면 빈 글 — 부르는 쪽이 공용 errorText 로)
const ATTEND_ERR = {
  "course-closed": "마친 강좌는 출석을 고칠 수 없어요",
  "not-confirmed": "확정된 분만 체크할 수 있어요",
  "not-assigned": "맡은 강좌가 아니에요",
  "wrong-course": "다른 강좌의 회차예요 — 새로 불러올게요",
  "bad-state": "출석 값이 잘못됐어요 — 새로고침해 주세요",
  "not-found": "회차나 신청을 찾지 못했어요 — 새로 불러올게요",
  "bad-id": "잘못된 요청이에요 — 새로고침해 주세요",
};
export const attendErrorText = (r) => ATTEND_ERR[r?.error] || "";

// 쓰기가 거절된 뒤 무엇을 다시 불러올지 — 강좌째(맡은 강좌에서 빠졌다) · 출석부만(상태가 바뀌었다) · 없음(되돌리기만)
export function reloadAfter(code) {
  if (code === "not-assigned") return "courses";
  if (["course-closed", "not-confirmed", "wrong-course", "not-found"].includes(code)) return "sheet";
  return "";
}

// ---------- 출석 현황 ----------
// 현황 머리 — 「확정 20분 · 회차 8 · 수료 기준 80%」
export function summaryHead(course, sessions, people) {
  return [`확정 ${(people || []).length}분`, `회차 ${(sessions || []).length}`,
    typeof course?.attendPct === "number" ? `수료 기준 ${course.attendPct}%` : ""].filter(Boolean).join(" · ");
}
export const belowCount = (people) => (people || []).filter((p) => p && p.below === true).length;

// 한 분 줄 — 「출석 5 · 지각 1 · 결석 1 · 공결 0」 · 출석률 「86%」(체크한 회차가 없으면 「—」)
export const personCounts = (p) => `출석 ${p?.present || 0} · 지각 ${p?.late || 0} · 결석 ${p?.absent || 0} · 공결 ${p?.excused || 0}`;
export const pctText = (p) => (p?.pct === null || p?.pct === undefined ? "—" : `${p.pct}%`);

// 펼친 칸 — 회차마다 {no, date, state, mark(○·지·결·공··), label}
export function cellsFor(person, sessions) {
  const cells = (person && person.cells) || [];
  return (sessions || []).map((s, i) => {
    const st = STATES.includes(cells[i]) ? cells[i] : null;
    return { no: s.no, date: mdw(s.date), state: st, mark: st ? STATE_MARK[st] : NO_MARK, label: st ? STATE_LABEL[st] : "체크 전" };
  });
}

// 엑셀 파일 이름 — 출석_{제목}_{오늘}.xlsx (제목 다듬기는 신청 현황 엑셀과 같은 fileTitle)
export const attendFileName = (title, today) => `출석_${fileTitle(title)}_${today}.xlsx`;

// 맡은 강좌가 없을 때·회차·명단이 비었을 때 안내
export const EMPTY_ASSIGNED = "맡은 강좌가 아직 없어요 — 교육 총괄께 「📚 강좌 관리」에서 강사로 넣어 달라고 말씀해 주세요";
export const EMPTY_ALL = "아직 강좌가 없어요 — 「📚 강좌 관리」에서 먼저 만들어 주세요";
export const NO_SESSIONS = "회차가 아직 없어요 — 「📚 강좌 관리」의 「회차」에서 넣어요";
export const NO_PEOPLE = "확정된 분이 아직 없어요 — 「📝 신청 현황」에서 확정하면 여기 보여요";
export const CLOSED_NOTE = "마친 강좌예요 — 출석은 볼 수만 있어요";
export const FUTURE_NOTE = "아직 오지 않은 회차예요";
