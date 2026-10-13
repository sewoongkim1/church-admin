// 📣 알림 현황 · 🩺 시스템 상태의 글자 만들기 — 순수 함수(DOM 없음 · tests/mem-status-format.test.mjs 가 읽는다).
//   2026-10-13 운영 확인에서 고친 것: 발송 이력에 시각이 비었다(push_log 의 시각 칸은 sent_at — created_at 이 아니다) ·
//   시스템 상태가 영어 칸 이름(serverTimeKST…)과 JSON 원문 그대로였다.

// 발송 종류(push_log.mode) → 한글. 모르는 것은 그대로 보인다(새 종류가 생겨도 숨지 않게).
export const PUSH_MODE = {
  daily: "아침 알림", "weekly-verse": "주일 말씀 알림", evening: "저녁 알림", manual: "손으로 보낸 알림",
  ministry: "사역 임명 알림", pilsa: "필사 알림", "pilsa-apply": "필사 신청 알림(담당자)",
  "board-report": "게시판 신고 알림(담당자)", diag: "발송 진단",
  // 봉사 당번(api 「duty-」 + 종류 · DUTY_NOTE_KINDS) · 교육(edu-)
  "duty-confirmed": "봉사 당번 — 확정", "duty-added": "봉사 당번 — 담당자가 넣음", "duty-moved": "봉사 당번 — 옮김",
  "duty-removed": "봉사 당번 — 뺌", "duty-off": "봉사 당번 — 쉼", "duty-reopen": "봉사 당번 — 다시 엶",
  "duty-remind": "봉사 당번 — 전날 알림", "duty-applied": "봉사 당번 — 지원",
  "edu-confirmed": "교육 — 신청 확정", "edu-first-day": "교육 — 첫날 알림",
};
export const pushModeLabel = (m) => PUSH_MODE[m] || m || "발송";

// 한국 시각 「10. 13. 오전 8:00」 — 값이 없거나 이상하면 빈 글.
export function kstShort(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// 발송 이력 한 줄의 시각 — pushHistory 는 sent_at 을 준다(옛 화면 · 다른 표는 created_at 일 수도 있어 함께 본다).
export const pushWhen = (r) => kstShort(r && (r.sent_at || r.created_at));

const n = (v) => (Number(v) || 0).toLocaleString("ko-KR");

// 시스템 상태 — 칸마다 이름과 읽는 글. 모르는 칸은 이름 그대로 + JSON(새 점검이 생겨도 숨지 않게).
export const MONITOR_LABEL = {
  serverTimeKST: "서버 시각", db: "데이터베이스", subscribers: "알림 구독 기기", latestVerseDate: "가장 최근 이번 주 말씀 날짜",
  todayPush: "오늘 아침 알림", weeklyReportLastRun: "주간 리포트 메일 — 마지막 실행", activity: "활동 기록 집계 대조",
  songPool: "오늘의 찬양 — 후보 곡", songToday: "오늘의 찬양 — 오늘 곡", dutyRemind: "봉사 당번 전날 알림 — 마지막 실행",
  monitorWatch: "감시의 감시 — 마지막 확인",
};

export function monitorText(k, v) {
  if (v === null || v === undefined || v === "") return "기록 없음";
  switch (k) {
    case "db": return v === "up" ? "정상" : String(v);
    case "subscribers": return `${n(v)}대`;
    case "songPool": return `${n(v)}곡`;
    case "songToday": return v === true ? "정해졌어요" : "아직 안 정해졌어요";
    case "todayPush":
      return `보냄 ${n(v.sent)} · 실패 ${n(v.failed)} · 대상 ${n(v.total)}${v.sent_at ? ` · ${kstShort(v.sent_at)}` : ""}`;
    case "weeklyReportLastRun":
      return `${v.status === "succeeded" ? "성공" : (v.status || "상태 모름")}${v.startTime ? ` · ${kstShort(v.startTime)}` : ""}`;
    case "activity": {
      const same = Number(v.logRows) === Number(v.aggSum);
      return `기록 ${n(v.logRows)}줄 · 집계 합 ${n(v.aggSum)}(${same ? "맞음" : "어긋남"}) · 집계 ${n(v.aggRows)}줄`;
    }
    case "dutyRemind":
      return [v.day ? `${v.day} 몫` : "", `보냄 ${n(v.sent)}`, `놓침 ${n(v.missed)}`, `${n(v.runs)}번 실행`,
        v.at ? kstShort(v.at) : "", v.off ? "꺼 둠" : ""].filter(Boolean).join(" · ");
    case "monitorWatch":
      return [v.state === "ok" ? "정상" : (v.state || "상태 모름"), v.at ? kstShort(v.at) : "", v.mailed ? `메일 ${v.mailed}` : ""]
        .filter(Boolean).join(" · ");
    default:
      return typeof v === "object" ? JSON.stringify(v) : String(v);
  }
}

// monitor 응답 → [{ label, text }] (ok·problems·error 는 위 머리에서 따로 보인다)
export function monitorRows(r) {
  return Object.entries(r || {}).filter(([k]) => !["ok", "problems", "error"].includes(k))
    .map(([k, v]) => ({ label: MONITOR_LABEL[k] || k, text: monitorText(k, v) }));
}
