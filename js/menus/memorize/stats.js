// 📊 통계 — 기간별 사용 현황(구분·소속별). 성경암송 api 프록시(stats). 역할 memorizeadmin.
//   ⚠️ 참여자별 세부·성도 검색은 「성도 계정」 메뉴로(이 화면은 집계만).
import { esc, errorText, busy } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">📊 통계</h2>`;
const COL = { gubun: "구분", sosok: "소속", newCount: "신규", participants: "참여", active: "활동",
  typing: "타이핑", card: "카드", voice: "음성", cumulative: "누적", total: "합계" };
const ymd = (d) => d.toISOString().slice(0, 10);

export async function render(el, { call }) {
  const now = new Date(); const from0 = new Date(now); from0.setDate(from0.getDate() - 29);
  el.innerHTML = TITLE + `
    <div class="acts">
      <input type="date" id="st-from" value="${ymd(from0)}"> <span class="muted">~</span>
      <input type="date" id="st-to" value="${ymd(now)}">
      <button class="btn primary" id="st-go">조회</button>
    </div>
    <p class="muted" id="st-status"></p>
    <div id="st-table" style="overflow-x:auto"></div>`;

  const draw = (rows) => {
    el.querySelector("#st-status").textContent = `${rows.length}줄`;
    if (!rows.length) { el.querySelector("#st-table").innerHTML = `<p class="muted">기간에 자료가 없어요.</p>`; return; }
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const head = keys.map((k) => `<th style="text-align:left;padding:6px 10px">${esc(COL[k] || k)}</th>`).join("");
    const body = rows.map((r) => `<tr>${keys.map((k) => `<td style="padding:6px 10px;border-top:1px solid var(--border)">${esc(r[k] ?? "")}</td>`).join("")}</tr>`).join("");
    el.querySelector("#st-table").innerHTML = `<table style="border-collapse:collapse;min-width:100%"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  };

  const load = async () => {
    const from = el.querySelector("#st-from").value, to = el.querySelector("#st-to").value;
    await busy(el, async () => {
      const r = await call("stats", { from, to });
      if (!r.ok) { el.querySelector("#st-status").textContent = errorText(r); return; }
      draw(r.list || []);
    });
  };
  el.querySelector("#st-go").addEventListener("click", load);
  await load();
}
