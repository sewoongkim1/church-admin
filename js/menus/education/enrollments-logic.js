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

// 엑셀 파일 이름 — 교육신청_{제목}_{오늘}.xlsx · 파일 이름에 못 쓰는 글자(\ / : * ? " < > |)·제어 글자는 빼고,
//   끝의 점·빈칸(윈도가 떼어 버린다)도 빼고, 제목은 60자까지만.
export function exportFileName(title, today) {
  let t = String(title || "").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  t = Array.from(t).slice(0, 60).join("").replace(/[. ]+$/, "").trim() || "강좌";
  return `교육신청_${t}_${today}.xlsx`;
}

// 아는 오류 코드인가(모르면 공용 errorText 로)
export const hasErrorWord = (code) => Object.prototype.hasOwnProperty.call(WORDS, code);

// 찾은 후보 카드 → eduEnrollAdd 인자(교인ID 는 없다 — 이름·차례·소속 확인값 다섯 칸)
export function pickArgs(searched, i, p) {
  const q = p || {};
  return { name: searched, pick: i, check: { who_type: q.who_type || "", group: q.group || "", sub: q.sub || "", church_mok: q.church_mok || "", position: q.position || "" } };
}

// 신청 시각 짧게 — 「1/22 19:00 신청」 (한국 시각)
export function shortApplied(iso) {
  const t = Date.parse(iso || "");
  if (isNaN(t)) return "";
  const d = new Date(t + 9 * 3600 * 1000), p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} 신청`;
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
