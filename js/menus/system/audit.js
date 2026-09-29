// 바꾼 기록 — 총괄 관리자(super)만. 최근 100건.
import { esc, kstTime, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">📜 바꾼 기록</h2>`;
const LABEL = {
  register: "승인 요청", "register.update": "요청 고침",
  "members.approve": "승인", "members.roles": "역할 바꿈", "members.status": "상태 바꿈",
  "ministry.status": "사역 상태 바꿈", "ministry.delete": "사역 신청 삭제",
  "ministry.catalog": "사역팀 정보 고침", "ministry.order": "사역팀 차례 바꿈",
  "ministry.paper": "종이 명단 넣음",
};
const STATUS = { pending: "대기", active: "사용", disabled: "정지" };

function detailText(r) {
  const d = r.detail || {};
  if (r.action === "members.approve") return "역할: " + (d.roles || []).join(", ");
  if (r.action === "members.roles") return (d.before || []).join(", ") + " → " + (d.after || []).join(", ");
  if (r.action === "members.status") return (STATUS[d.before] || d.before || "") + " → " + (STATUS[d.after] || d.after || "");
  if (r.action.startsWith("register")) return [d.gu, d.mok, d.bu, d.grade].filter(Boolean).join(" ");
  if (r.action === "ministry.status") return `${d.name || ""} · ${d.team || ""} · ${d.before || ""} → ${d.after || ""}${d.note ? " · 사유: " + d.note : ""}`;
  if (r.action === "ministry.delete") return `${d.name || ""} · ${d.who || ""} · ${d.committee || ""} ${d.team || ""} (${d.status || ""})`;
  if (r.action === "ministry.catalog") return `${d.team || ""} · ${(d.fields || []).join(", ")}`;
  if (r.action === "ministry.order") return `${(d.ids || []).length}팀`;
  if (r.action === "ministry.paper") return `저장 ${d.saved} · 새 계정 ${d.created} · 그대로 ${d.same} · 오류 ${d.errors}`;
  return "";
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("auditList", { limit: 100 });
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  el.innerHTML = TITLE + `<p class="muted" style="margin-bottom:10px">최근 ${r.rows.length}건</p>` +
    (r.rows.length ? r.rows.map((x) => `<div class="card">
      <div><b>${esc(LABEL[x.action] || x.action)}</b> · ${esc(x.target)}</div>
      <div class="muted">${esc(kstTime(x.at))} · ${esc(x.who || "(지워진 분)")}</div>
      ${detailText(x) ? `<div style="margin-top:4px;font-size:14px">${esc(detailText(x))}</div>` : ""}
    </div>`).join("") : `<p class="empty">아직 기록이 없어요</p>`);
}
