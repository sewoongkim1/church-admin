// 🤖 성도 묻기 — 직분 · 교구 고르기 칸의 순수 도우미(2026-10-19 · 설계 성경암송 docs/superpowers/specs/2026-10-19-ask-people-picks-design.md)
//   시험 tests/ask-picks-ui.test.mjs. DOM 을 쓰지 않는다.

// 고른 잎의 from_text — ⚠️ 서버 supabase/functions/church-admin/ask-people.ts 의 PICK_FROM 과 글자까지 같게(시험이 본다).
//   칩 × 로 고른 조건을 빼면 화면이 이 글로 알아보고 그 고르기 칸을 비운다(보이는 것 = 걸린 것).
export const PICK_FROM = { pos: "고른 직분", gu: "고른 교구" };

// 고른 값 가운데 목록에 있는 것만 — 겹친 것 하나로 · 고른 차례 그대로
function pickedIn(values, optionValues) {
  const ok = new Set((optionValues || []).map(String));
  return [...new Set((values || []).map(String))].filter((v) => ok.has(v));
}
// 서버로 보낼 값 — 모두 고르면 「아무것도 안 고름」과 같은 뜻이라 빈 배열(설계 §1-3)
export function picksToSend(values, optionValues) {
  const v = pickedIn(values, optionValues);
  return v.length && v.length === (optionValues || []).length ? [] : v;
}
// 단추 글 — 안 고름 「전체」 · 하나 「시무장로」 · 여럿 「시무장로 외 2」 · 모두 「모두」
export function pickSummary(values, optionValues) {
  const v = pickedIn(values, optionValues);
  if (!v.length) return "전체";
  if (v.length === (optionValues || []).length) return "모두";
  return v.length === 1 ? v[0] : `${v[0]} 외 ${v.length - 1}`;
}
