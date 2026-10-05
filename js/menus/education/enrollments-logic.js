// 📝 신청 현황 — 순수 함수(시험이 읽는다 · tests/edu-enrollments-logic.test.mjs)
export function groupByStatus(list) {
  const g = { confirmed: [], waitlisted: [], applied: [], cancelled: [], declined: [] };
  for (const e of list || []) (g[e.status] || (g[e.status] = [])).push(e);
  g.waitlisted.sort((a, b) => (a.waitNo || 0) - (b.waitNo || 0));
  return g;
}

export function actionsFor(e) {
  switch (e.status) {
    case "applied": return [{ op: "confirm", label: "확정" }, { op: "waitlist", label: "대기로" }, { op: "decline", label: "반려", danger: true }];
    case "waitlisted": return [{ op: "confirm", label: "확정" }, { op: "cancel", label: "취소", danger: true }];
    case "confirmed": return [{ op: "cancel", label: "취소", danger: true }];
    default: return [{ op: "reopen", label: "다시 받기" }];
  }
}

export function capacityLine(c) {
  const cap = c.capacity == null ? "정원 제한 없음" : `정원 ${c.capacity}`;
  const parts = [cap, `확정 ${c.counts.confirmed}`];
  if (c.counts.waitlisted) parts.push(`대기 ${c.counts.waitlisted}`);
  if (c.counts.applied) parts.push(`승인 기다림 ${c.counts.applied}`);
  return parts.join(" · ");
}

const WORDS = { full: "정원이 찼어요", "too-late": "이미 시작한 강좌예요", "not-active": "이미 처리된 신청이에요",
  "not-found": "찾을 수 없어요", "bad-ident": "이름을 확인해 주세요", "not-open": "모집 중이 아니에요",
  changed: "명부가 바뀌었어요. 다시 찾아 주세요", "was-declined": "반려했던 분이에요" };   // 과제 4 검토 반영(2026-10-05)
export function errorWord(code) { return WORDS[code] || `저장하지 못했어요 (${code})`; }

// 엑셀 파일 이름 — 교육신청_{제목}_{오늘}.xlsx · 파일 이름에 못 쓰는 글자(\ / : * ? " < > |)는 뺀다
export function exportFileName(title, today) {
  const t = String(title || "").replace(/[\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "강좌";
  return `교육신청_${t}_${today}.xlsx`;
}

// 대신 등록이 성공했을 때 알릴 말
export function addDoneText(r) {
  if (r && r.already) return "이미 명단에 있어요";
  if (r && r.revived) return "다시 받았어요";
  return "등록했어요";
}

// 단추를 누르기 전 확인 창 글(확인이 필요 없으면 "")
export function confirmTextFor(op, name) {
  if (op === "cancel") return `${name} 님의 신청을 취소할까요? 선착순 강좌면 대기 첫 분이 확정돼요.`;
  if (op === "decline") return `${name} 님의 신청을 반려할까요?`;
  if (op === "waitlist") return `${name} 님을 대기로 돌릴까요? 대기 줄 맨 뒤로 가요.`;
  return "";
}
