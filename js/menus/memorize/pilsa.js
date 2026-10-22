// ✍️ 필사 신청 명단 — 성경필사 노트 신청 명단·상태 바꾸기. 성경암송 api 프록시(pilsaList·pilsaSetStatus). 역할 memorizeadmin.
//   ⚠️ 휴대폰 번호는 노트를 전해 드리는 담당자가 본다(가리지 않는다).
import { esc, toast, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">✍️ 필사 신청 명단</h2>`;
const STATUS = ["신청완료", "준비중", "준비완료", "배부완료"];
// 성경 단위 이름 — 성경암송 앱 js/pilsa.js 의 PILSA_UNITS 와 같은 순서·묶음(「외」는 한 권에 묶여 제작되는 책)
const UNIT = {
  ot01: "창세기", ot02: "출애굽기", ot03: "레위기", ot04: "민수기", ot05: "신명기",
  ot06: "여호수아", ot07: "사사기 외", ot08: "사무엘상", ot09: "사무엘하",
  ot10: "열왕기상", ot11: "열왕기하", ot12: "역대상", ot13: "역대하", ot14: "에스라 외",
  ot15: "욥기", ot16: "시편", ot17: "잠언 외", ot18: "이사야", ot19: "예레미야 외",
  ot20: "에스겔 외", ot21: "호세아 외",
  nt01: "마태복음", nt02: "마가복음", nt03: "누가복음", nt04: "요한복음", nt05: "사도행전",
  nt06: "로마서", nt07: "고린도전서 외", nt08: "갈라디아서 외", nt09: "히브리서 외", nt10: "요한계시록",
};
const qtyText = (q) => Object.entries(q || {}).filter(([, n]) => n > 0).map(([k, n]) => `${UNIT[k] || k} ${n}`).join(" · ");

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
