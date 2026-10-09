// ✍️ 필사 명단 — 성경필사 노트 신청 명단·상태 바꾸기. 성경암송 api 프록시(pilsaList·pilsaSetStatus). 역할 memorizeadmin.
//   ⚠️ 휴대폰 번호는 노트를 전해 드리는 담당자가 본다(가리지 않는다).
import { esc, toast, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">✍️ 필사 명단</h2>`;
const STATUS = ["신청완료", "준비중", "준비완료", "배부완료"];
const qtyText = (q) => Object.entries(q || {}).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(" · ");

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="muted" id="pl-status">불러오는 중…</p><div id="pl-list"></div>`;

  const draw = (rows) => {
    el.querySelector("#pl-status").textContent = `${rows.length}건`;
    el.querySelector("#pl-list").innerHTML = rows.length ? rows.map((r) => `
      <div class="card" data-id="${esc(r.id)}">
        <div><b>${esc(r.name || "이름 없음")}</b> <span class="muted">${esc(r.who || "")}</span></div>
        <div class="muted">${esc(r.phone || "-")} · ${esc(r.size || "")} ${esc(r.type1 || "")} ${esc(r.type2 || "")} · 총 ${esc(r.total ?? 0)}권 · ${esc(r.at || "")}</div>
        <div style="margin:3px 0">${esc(qtyText(r.qtys))}${r.memo ? ` · <span class="muted">${esc(r.memo)}</span>` : ""}</div>
        <div class="acts"><select data-status>${STATUS.map((s) => `<option${s === r.status ? " selected" : ""}>${s}</option>`).join("")}</select>
          <button type="button" class="btn" data-act="save">상태 저장</button></div>
      </div>`).join("") : `<p class="muted">신청이 없어요.</p>`;
    el.querySelectorAll('[data-act="save"]').forEach((btn) => btn.addEventListener("click", async () => {
      const card = btn.closest(".card"); const id = Number(card.dataset.id); const status = card.querySelector("[data-status]").value;
      await busy(el, async () => { const r = await call("pilsaSetStatus", { id, status }); toast(r.ok ? "저장했어요." : errorText(r)); if (r.ok) load(); });
    }));
  };

  const load = async () => {
    const r = await call("pilsaList");
    if (!r.ok) { el.querySelector("#pl-status").textContent = errorText(r); return; }
    draw(r.list || []);
  };
  await load();
}
