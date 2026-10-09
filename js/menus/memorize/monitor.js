// 🩺 시스템 상태 — 성경암송 monitor 점검(구독자·말씀 신선도·크론·발송). 성경암송 api 프록시(monitor). 역할 memorizeadmin.
//   ⚠️ monitor 는 문제가 있으면 ok:false 로 온다 — 오류가 아니라 정상 응답이다(발송은 안 한다 · 읽기 점검).
import { esc, errorText, busy } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🩺 시스템 상태</h2>`;
const AUTH_ERR = new Set(["network", "server", "unauthenticated", "forbidden", "not-registered", "pending", "disabled"]);

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<div id="mo-body"><p class="muted">점검 중…</p></div>`;
  const body = el.querySelector("#mo-body");
  await busy(el, async () => {
    const r = await call("monitor");
    if (!r || AUTH_ERR.has(r.error)) { body.innerHTML = `<p class="muted">${esc(errorText(r || {}))}</p>`; return; }
    const problems = Array.isArray(r.problems) ? r.problems : [];
    const head = problems.length
      ? `<div class="card" style="border-color:var(--danger-bd);background:var(--danger-bg)"><b>⚠️ 살펴볼 것 ${problems.length}가지</b>
          <ul style="margin:6px 0 0;padding-left:18px">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`
      : `<div class="card"><b>✅ 모두 정상이에요</b></div>`;
    // 나머지 점검 값(ok·problems·error 빼고)을 보기 좋게
    const rows = Object.entries(r).filter(([k]) => !["ok", "problems", "error"].includes(k)).map(([k, v]) =>
      `<div class="card"><div class="muted">${esc(k)}</div><div>${esc(typeof v === "object" ? JSON.stringify(v) : String(v))}</div></div>`).join("");
    body.innerHTML = head + rows;
  });
}
