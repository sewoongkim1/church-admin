// 사역신청 상태 규칙(순수 함수) — 성경암송 api 의 ministrySetStatus 규칙을 옮겨 왔다(2026-09-28 · 원문 docs/port/ministry-status-legacy.md 1.6).
// 서버(Deno, index.ts)와 시험(Node)이 함께 읽는다 — authz.ts 와 같은 제약(원격 import·enum 금지).

// 담당자가 새로 매길 수 있는 상태. 「미채택」은 2026-09-17 에 뺐다(DB CHECK 에는 옛 값이 남아 있다).
export const MINISTRY_STATUS = ["신청완료", "접수완료", "임명확정", "취소"];
// 결정 상태 — 이리로 바뀌면 결정일을 찍고 휴대폰 번호를 지운다(교적 대조가 끝난 자리.
// 사람이 기억해서 지우는 약속은 언젠가 안 지켜지니 상태를 바꾸는 그 자리에서 지운다).
const DECIDED = ["임명확정", "미채택", "취소"];
const NOTE_MAX = 500;

export type StatusPatchResult =
  | { ok: true; patch: Record<string, unknown>; notify: boolean }
  | { ok: false; error: string };

export function statusPatch(current: string, next: unknown, note: unknown, nowIso: string): StatusPatchResult {
  const status = typeof next === "string" ? next.trim() : "";
  if (!MINISTRY_STATUS.includes(status)) return { ok: false, error: "invalid-status" };
  const noteText = typeof note === "string" ? note.normalize("NFC").trim().replace(/\s+/g, " ") : null;
  // 취소는 사유 없이 못 한다 — 부서장 요청을 오프라인으로 받아 처리하는 일이라 적어 두지 않으면 「왜」를 아무도 모른다
  if (status === "취소" && !noteText) return { ok: false, error: "cancel-note-required" };
  if (noteText && noteText.length > NOTE_MAX) return { ok: false, error: "note-too-long" };
  const patch: Record<string, unknown> = { status, updated_at: nowIso };
  if (DECIDED.includes(status)) { patch.decided_at = nowIso; patch.phone = null; }
  // 임명에서 물러나면 그 행의 「알림 보냈음」도 지운다(이미 나간 알림을 무를 수는 없다)
  if (current === "임명확정" && status !== "임명확정") patch.notified_at = null;
  // 메모는 보내온 때만 고친다(안 보내면 그대로)
  if (noteText !== null) patch.note = noteText;
  // 임명이면 알림을 요청한다 — 「한 사람 한 해 한 번」은 api(internalMinistryNotify)가 거른다
  return { ok: true, patch, notify: status === "임명확정" };
}
