// 사역 화면(신청 현황 · 종이 명단)의 교적 표시 — 서버가 준 { state, reason } 만 그린다(2026-09-29 교인명부).
// null 이면 아무것도 그리지 않는다(명부가 아직 없거나 물을 수 없는 이름 — 「교적 없음」은 사실이 아닐 수 있다).
import { esc } from "../../core/ui.js";

const CLS = { "맞음": "ok", "확인 필요": "check", "없음": "none" };
const TEXT = { "맞음": "교적 ✓", "확인 필요": "교적 확인", "없음": "교적 없음" };

export function churchBadgeHtml(c) {
  if (!c || !TEXT[c.state]) return "";
  return `<em class="cb cb-${CLS[c.state]}">${TEXT[c.state]}${c.reason ? ` <small>${esc(c.reason)}</small>` : ""}</em>`;
}

export const hasChurch = (rows) => (rows || []).some((r) => r && r.church);

export const CHURCH_LEGEND = `<p class="muted cb-legend">교적 표시 — <em class="cb cb-ok">교적 ✓</em> 이름·소속이 맞는 분이 한 분 ·
  <em class="cb cb-check">교적 확인</em> 소속이 다르거나 같은 이름이 여럿 · <em class="cb cb-none">교적 없음</em> 교적에 같은 이름이 없음</p>`;
