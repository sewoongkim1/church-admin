// 바꾼 기록 — 총괄 관리자(super)만. 최근 100건.
// 「교인명부 기록」(people.*)은 따로 본다 — 찾기·보기가 많아 바꾼 일을 덮지 않게(서버 auditList 의 kind · 2026-09-29).
import { esc, kstTime, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">📜 바꾼 기록</h2>`;
const LABEL = {
  register: "승인 요청", "register.update": "요청 고침",
  "members.approve": "승인", "members.roles": "역할 바꿈", "members.status": "상태 바꿈",
  "ministry.status": "사역 상태 바꿈", "ministry.delete": "사역 신청 삭제",
  "ministry.catalog": "사역팀 정보 고침", "ministry.order": "사역팀 차례 바꿈",
  "ministry.paper": "종이 명단 넣음",
  "people.search": "명부 찾기", "people.view": "교인 보기", "people.export": "명부 내려받기", "people.import": "명부 올림",
};
const STATUS = { pending: "대기", active: "사용", disabled: "정지" };
const KINDS = [["", "바꾼 기록"], ["people", "교인명부 기록"]];

const filtersText = (f) => Object.entries(f || {})
  .map(([k, v]) => (k === "noPhoto" ? "사진 없음" : k === "household" ? `가족(세대주 ${v})` : v)).join(" · ");

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
  if (r.action === "people.search") {
    const f = filtersText(d.filters);
    return `${d.q ? `‘${d.q}’` : "(검색어 없음)"}${f ? " · " + f : ""} · ${d.total}명${d.page ? ` · ${d.page + 1}쪽` : ""}`;
  }
  if (r.action === "people.view") return d.name || "";
  if (r.action === "people.export") {
    const f = filtersText(d.filters);
    return `${d.count}명${d.q ? ` · ‘${d.q}’` : ""}${f ? " · " + f : ""}`;
  }
  if (r.action === "people.import") return `기준일 ${d.source_date} · 전체 ${d.total} · 새로 ${d.added} · 바뀜 ${d.changed} · 빠짐 ${d.removed} · 사진 ${d.photos}`;
  return "";
}

export async function render(el, { call, query }) {
  const kind = query && query.kind === "people" ? "people" : "";
  const tabs = `<div class="acts" style="margin-bottom:10px">${KINDS.map(([k, t]) =>
    `<a class="btn${k === kind ? " primary" : ""}" href="#/audit${k ? "?kind=" + k : ""}">${t}</a>`).join("")}</div>`;
  el.innerHTML = TITLE + tabs + `<p class="empty">불러오는 중…</p>`;
  const r = await call("auditList", { limit: 100, kind });
  if (!r.ok) { el.innerHTML = TITLE + tabs + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  el.innerHTML = TITLE + tabs + `<p class="muted" style="margin-bottom:10px">최근 ${r.rows.length}건</p>` +
    (r.rows.length ? r.rows.map((x) => {
      const dt = detailText(x);
      const who = x.who || (x.action === "people.import" ? "(올리기 스크립트)" : "(지워진 분)");
      return `<div class="card">
      <div><b>${esc(LABEL[x.action] || x.action)}</b>${x.target ? ` · ${esc(x.target)}` : ""}</div>
      <div class="muted">${esc(kstTime(x.at))} · ${esc(who)}</div>
      ${dt ? `<div style="margin-top:4px;font-size:14px">${esc(dt)}</div>` : ""}
    </div>`;
    }).join("") : `<p class="empty">아직 기록이 없어요</p>`);
}
