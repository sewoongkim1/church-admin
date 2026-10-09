// 📣 알림 현황 — 구독 기기 수·시간대·발송 이력(읽기만). 성경암송 api 프록시(pushStats·pushHistory·pushSubscribers).
//   ⚠️ 전체 발송·리포트 메일은 여기 없다(성경암송 admin-stats 에 남겨 둠 · 크론은 그대로). 역할 memorizeadmin.
import { esc, errorText, busy } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">📣 알림 현황</h2>`;
const H3 = (t) => `<h3 style="font-size:14px;font-weight:800;color:var(--navy);margin:14px 0 8px">${t}</h3>`;
const kst = (v) => v ? new Date(v).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
const who = (r) => r.who || [r.gu, r.mok ? r.mok + "목장" : "", r.bu, r.grade].filter(Boolean).join(" ");

export async function render(el, { call }) {
  el.innerHTML = TITLE + `
    <p class="muted">전체 발송·리포트 메일은 당분간 성경암송 관리자 화면에 남아 있어요. 여기선 현황만 봐요.</p>
    <div id="pu-sum" class="card"></div>
    ${H3("최근 발송 이력")}<div id="pu-hist"></div>
    ${H3("구독 기기")}<div id="pu-subs"></div>`;

  await busy(el, async () => {
    const s = await call("pushStats");
    el.querySelector("#pu-sum").innerHTML = s.ok
      ? `<div><b>구독 기기 ${esc(s.total ?? 0)}대</b></div><div class="muted">시간대별 — ${Object.entries(s.byHour || {}).map(([h, n]) => `${esc(h)}시 ${esc(n)}`).join(" · ") || "-"}</div>`
      : `<span class="muted">${esc(errorText(s))}</span>`;

    const h = await call("pushHistory", { limit: 50 });
    el.querySelector("#pu-hist").innerHTML = h.ok
      ? ((h.rows || []).length ? h.rows.map((r) => `<div class="card">
          <div><b>${esc(r.mode || r.kind || "발송")}</b> <span class="muted">${esc(kst(r.created_at))}</span></div>
          <div class="muted">보냄 ${esc(r.sent ?? 0)} · 실패 ${esc(r.failed ?? 0)} · 대상 ${esc(r.total ?? 0)}${r.note ? ` · ${esc(r.note)}` : ""}</div>
        </div>`).join("") : `<p class="muted">발송 이력이 없어요.</p>`)
      : `<p class="muted">${esc(errorText(h))}</p>`;

    const sub = await call("pushSubscribers");
    el.querySelector("#pu-subs").innerHTML = sub.ok
      ? `<p class="muted">${esc(sub.total ?? (sub.list || []).length)}대</p>` + (sub.list || []).slice(0, 100).map((r) =>
          `<div class="card"><b>${esc(r.name || "이름 없음")}</b> <span class="muted">${esc(who(r))}${r.hour != null ? ` · ${esc(r.hour)}시` : ""}</span></div>`).join("")
      : `<p class="muted">${esc(errorText(sub))}</p>`;
  });
}
