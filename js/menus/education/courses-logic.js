// 📚 강좌 관리 — 순수 함수(시험이 읽는다 · DOM 없음 · tests/edu-courses-logic.test.mjs)
//   칸 이름은 서버 edu-rules.ts 의 checkCourse(들어가는 것)·courseOut(나오는 것)과 같다.
export const KIND_OPTIONS = [
  { value: "regular", label: "정규 과정" }, { value: "lecture", label: "특강·세미나" }, { value: "training", label: "교사·사역자 교육" },
];
export const MODE_OPTIONS = [{ value: "auto", label: "선착순 바로 확정" }, { value: "approve", label: "담당자 승인" }];
export const STATUS_OPTIONS = [
  { value: "draft", label: "준비 중" }, { value: "open", label: "모집 중" }, { value: "closed", label: "모집 끝" },
  { value: "running", label: "진행 중" }, { value: "done", label: "끝" }, { value: "archived", label: "보관" },
];
export const WAITLIST_OPTIONS = [{ value: "on", label: "대기 받기 켜기" }, { value: "off", label: "대기 받기 끄기" }];

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const md = (d) => { const t = new Date(d + "T00:00:00Z"); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}(${WD[t.getUTCDay()]})`; };

// 화면 폼 값 → 서버 eduCourseSave 의 course
export function formToCourse(v) {
  const cap = String(v.capacity ?? "").trim();
  return {
    ...(v.id ? { id: v.id } : {}), title: v.title || "", kind: v.kind || "", term: v.term || "", description: v.description || "",
    teacher_label: v.teacher || "", place: v.place || "", fee_note: v.fee || "", target: v.target || "", track: v.track || "",
    capacity: cap === "" ? null : Number(cap), mode: v.mode || "auto", waitlist: v.waitlist !== "off",
    apply_from: v.applyFrom || "", apply_to: v.applyTo || "", starts_on: v.startsOn || "", ends_on: v.endsOn || "", attend_pct: v.attendPct === "" || v.attendPct == null ? 80 : Number(v.attendPct),
    check_label: v.checkLabel || "", status: v.status || "draft", prereq_tracks: v.prereq || [],
  };
}

// 정원·출석률 검사 — 빈 칸은 통과(정원 null = 제한 없음 · 출석률 80). 숫자가 아닌 글은 한국말 오류를 돌려준다(보내지 않는다).
//   ⚠️ Number("20명") 은 NaN → JSON 에서 null: 정원은 「제한 없음」, 출석률은 서버에서 0 이 된다.
const INT = /^\d+$/;
export function checkFormNumbers(v) {
  const cap = String(v.capacity ?? "").trim();
  if (cap !== "" && !INT.test(cap)) return "정원은 숫자로 적어 주세요";
  const pct = String(v.attendPct ?? "").trim();
  if (pct !== "" && (!INT.test(pct) || Number(pct) > 100)) return "출석률은 0~100 숫자로 적어 주세요";
  return "";
}

// 서버 courseOut → 화면 폼 값
export function courseToForm(c) {
  return { id: c.id, title: c.title, kind: c.kind, term: c.term, description: c.description, teacher: c.teacher, place: c.place,
    fee: c.fee, target: c.target, track: c.track, capacity: c.capacity == null ? "" : String(c.capacity), mode: c.mode,
    waitlist: c.waitlist ? "on" : "off", applyFrom: c.applyFrom || "", applyTo: c.applyTo || "", startsOn: c.startsOn || "", endsOn: c.endsOn || "", attendPct: c.attendPct ?? 80,
    checkLabel: c.checkLabel || "", status: c.status, prereq: c.prereq || [] };
}

// 카드 한 줄 — 교육 기간이 있으면 「교육 3/3(수) ~ 5/19(수)」(한쪽만 있으면 한쪽), 없으면 회차에서 읽은 요약
//   기간이 있어도 회차 수(또는 「회차 없음」)를 붙인다 — 일정이 빈 강좌를 담당자가 알아보게(2026-10-05 검토)
export function periodSummary(course, list) {
  const a = course?.startsOn, b = course?.endsOn;
  const n = list && list.length ? ` · ${list.length}회` : " · 회차 없음";
  if (a && b) return (a === b ? `교육 ${md(a)}` : `교육 ${md(a)} ~ ${md(b)}`) + n;
  if (a) return `교육 ${md(a)}부터` + n;
  if (b) return `교육 ${md(b)}까지` + n;
  return sessionsSummary(list);
}

export function sessionsSummary(list) {
  if (!list || !list.length) return "회차 없음";
  const s = [...list].sort((a, b) => a.no - b.no);
  if (s.length === 1) return `${md(s[0].on_date)} 1회`;
  return `${md(s[0].on_date)} ~ ${md(s[s.length - 1].on_date)} · ${s.length}회`;
}

// 「한 번에 만들기」 — 서버 makeSessions(edu-rules.ts)와 같은 규칙: 첫 날부터 every일 간격으로 count회
export function makeSessionRows(start, count, every = 7, t = {}) {
  const base = Date.parse(start + "T00:00:00Z");
  if (isNaN(base) || !Number.isInteger(count) || count < 1 || count > 200) return [];
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({ no: i + 1, on_date: new Date(base + i * every * 86400000).toISOString().slice(0, 10),
      start_time: t.start_time || "", end_time: t.end_time || "", topic: "", place: "" });
  }
  return out;
}

// 회차 저장 오류 → 한국말(서버 checkSessions·edu_sessions_replace 가 돌려주는 번호들)
const SESSION_ERR = {
  "course-closed": "끝난 강좌는 회차를 바꿀 수 없어요", "bad-rows": "회차 칸을 확인해 주세요",
  "bad-no": "회차 번호를 확인해 주세요 (1~200)", "bad-date": "날짜와 시각을 확인해 주세요",
  "dup-no": "회차 번호가 겹쳐요", "too-many": "회차는 200개까지예요",
};
export const sessionErrorText = (r) => SESSION_ERR[r?.error] || "";

// 강좌 저장 오류 → 한국말(없으면 빈 글 — 부르는 쪽이 errorText 로)
const COURSE_ERR = {
  "no-title": "강좌 이름을 적어 주세요", "too-long": "글이 너무 길어요 (이름 80자 · 학기 30자 · 설명 2000자 안쪽)",
  "bad-kind": "종류를 골라 주세요", "bad-capacity": "정원은 1~2000 사이 숫자예요 (비우면 제한 없음)",
  "bad-mode": "확정 방식을 골라 주세요", "bad-date": "날짜를 확인해 주세요",
  "bad-range": "신청 시작일이 마감일보다 늦어요", "bad-period": "교육 종료일이 시작일보다 빨라요", "bad-pct": "출석률은 0~100 사이 숫자예요",
  "bad-status": "상태를 골라 주세요", "not-found": "강좌를 찾지 못했어요 — 새로 불러올게요",
};
export const courseErrorText = (r) => COURSE_ERR[r?.error] || "";

// 강좌 저장 뒤 알림 — 정원을 늘려 대기하신 분이 확정됐으면 그 수를 함께(서버 eduCourseSave 의 promoted · 최종 검토 2026-10-05)
export function courseSavedText(promoted) {
  const n = Number(promoted) || 0;
  return n > 0 ? `저장했어요 — 대기하신 ${n}분이 확정됐어요` : "저장했어요";
}

// 회차 줄 머리 한 줄 — 「2회 · 3/10(수) 19:30~21:00」 (날짜가 없으면 안내)
export function sessionHeadLine(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s?.on_date || "");
  if (!m) return `${s?.no}회 · 날짜를 골라 주세요`;
  const wd = WD[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
  const t = s.start_time ? (s.end_time ? `${s.start_time}~${s.end_time}` : s.start_time) : "";
  return `${s.no}회 · ${+m[2]}/${+m[3]}(${wd})${t ? " " + t : ""}`;
}

// ---------- 강좌별 담당자(2026-10-05 · 서버 eduStaffCandidates·eduStaffSet · courseOut.staff) ----------
// 후보가 한 분도 없을 때 폼에 띄우는 안내(역할을 먼저 줘야 고를 수 있다)
export const STAFF_NO_CAND = "⚙️ 담당자·역할에서 「교육 담당(맡은 강좌)」 역할을 먼저 주세요";

// 카드 한 줄 — 「담당 김OO, 박OO」 · 없으면 「담당 없음」
export function staffLine(c) {
  const names = ((c && c.staff) || []).map((x) => x && x.name).filter(Boolean);
  return names.length ? `담당 ${names.join(", ")}` : "담당 없음";
}

// 고르개 선택지 — 후보(사용 중 · 교육 역할) + 지금 맡고 있지만 후보가 아닌 분(역할을 뺐거나 정지 — 빼 달라는 표시)
//   hint 는 소속(동명이인을 가리려고) · 교육 총괄이면 「교육 총괄」을 덧붙인다
export function staffOptions(cands, current) {
  const out = (cands || []).map((m) => ({ value: m.id, label: m.name,
    hint: [m.who, (m.roles || []).includes("education") ? "교육 총괄" : ""].filter(Boolean).join(" · ") }));
  const known = new Set(out.map((o) => o.value));
  for (const x of current || []) if (x && !known.has(x.id)) out.push({ value: x.id, label: x.name || "(이름 없음)", hint: "역할 없음 · 빼 주세요" });
  return out;
}

// 폼 단추 글 — 고른 분의 이름(선택지 차례) · 없으면 「담당자 없음」
export function staffFieldText(ids, options) {
  const by = new Map((options || []).map((o) => [o.value, o.label]));
  const names = (ids || []).map((id) => by.get(id)).filter(Boolean);
  return names.length ? names.join(", ") : "담당자 없음";
}

// 두 id 목록이 같은가(차례 무관) — 같으면 eduStaffSet 을 부르지 않는다
export function sameIds(a, b) {
  const x = [...new Set(a || [])].sort(), y = [...new Set(b || [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

// 강좌는 저장됐는데 담당자 저장이 실패했을 때 알릴 말(창은 닫는다 — 새 강좌를 두 번 만들지 않게)
export function staffSaveFailText(message) {
  return `강좌는 저장했어요 — 담당자는 저장하지 못했어요${message ? ` (${message})` : ""}. 다시 「고치기」로 골라 주세요`;
}
