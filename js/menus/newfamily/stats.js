// 📊 새가족 통계 — 세는 기준 날짜를 고른다(새가족 4단계 · 2026-10-07 · 설계 v2 §1)
//   서버: nfStats(basis · year) — 숫자와 교구·섬김이 이름뿐(새가족 이름 없음). 운영팀과 새가족 목사님.
//   기준 셋: 카드를 쓴 날 · 교구가 배정된 날 · 등록식 날 — 보는 기준이 그때그때 다르다(친구 2026-10-07).
//   「오신 분」·「수료 대상」은 늘 카드를 쓴 날로 세고, 「등록」만 기준을 따른다. 표 머리와 엑셀에 지금 기준을 늘 적는다.
// ⚠️ 서버 글자는 모두 esc.
import { esc, toast, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import { loadXlsx } from "../../core/xlsx.js";
import { nfWord, BASIS_OPTIONS, DONE_LABEL, rateText, statsSheet, yearOptions, STAGE_ORDER, STAGE_HINT } from "./nf-logic.js";

const TITLE = `<h2 class="page-title">📊 새가족 통계</h2>`;
const failText = (r) => nfWord(r?.error) || errorText(r);
const STAGE_NAME = { wait_helper: "배정 기다림", learning: "교육 중", wait_class: "목사님 교육 기다림", wait_report: "보고서 기다림", wait_parish: "교구 배정 기다림",
  registered: "등록 완료", stopped: "멈춤", done: "등록식 마침", info: "정보만" };

const table = (head, rows, cls = "") => `<div class="nf-tw"><table class="nf-t ${cls}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ` class="n"` : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let basis = "card", year = null, d = null;

  const load = async () => {
    const r = await call("nfStats", { basis, ...(year ? { year } : {}) });
    if (!r.ok) {
      el.innerHTML = TITLE + `<p class="empty">${esc(r.error === "not-assigned" ? "통계는 새가족 운영팀과 새가족 목사님이 봐요" : failText(r))}</p>`;
      return false;
    }
    d = r; year = r.year;
    return true;
  };
  const draw = () => {
    const done = DONE_LABEL[d.basis];
    const yearRows = d.years.map((y) => [`${y.year}년`, y.came, y.target, y.done, rateText(y.done, y.target)]);
    const monthRows = d.months.map((m) => [`${Number(m.ym.slice(5))}월`, m.came, m.target, m.done]);
    const sum = d.months.reduce((a, m) => ({ came: a.came + m.came, target: a.target + m.target, done: a.done + m.done }), { came: 0, target: 0, done: 0 });
    if (monthRows.length) monthRows.push(["합계", sum.came, sum.target, sum.done]);
    const stageRows = STAGE_ORDER.filter((s) => d.stages[s]).map((s) => [STAGE_NAME[s] || s, d.stages[s]]);
    el.innerHTML = TITLE +
      `<p class="muted nf-hint">「등록」을 어느 날로 셀지 골라 주세요. 「오신 분」과 「수료 대상」은 늘 카드를 쓴 날로 세요.</p>
      <div class="seg nf-basis">${BASIS_OPTIONS.map((o) => `<button type="button" data-basis="${o.value}" class="${o.value === d.basis ? "on" : ""}" aria-pressed="${o.value === d.basis}">${esc(o.label)}</button>`).join("")}</div>
      <p class="be-note">지금 기준: <b>${esc(d.basisLabel)}</b> — ${esc(BASIS_OPTIONS.find((o) => o.value === d.basis).hint)}</p>
      <h3 class="nf-h3">해마다</h3>
      ${yearRows.length ? table(["해", "오신 분", "수료 대상", done, "수료 대상 가운데"], yearRows) : `<p class="empty">아직 숫자가 없어요</p>`}
      <h3 class="nf-h3">${esc(String(d.year))}년 달마다 <button type="button" class="btn nf-mini" data-act="year">해 바꾸기</button></h3>
      ${monthRows.length ? table(["달", "오신 분", "수료 대상", done], monthRows) : `<p class="empty">${esc(String(d.year))}년에는 숫자가 없어요</p>`}
      <div class="acts nf-top"><button type="button" class="btn" data-act="xlsx" ${d.years.length ? "" : "disabled"}>⬇ 엑셀로 받기</button></div>
      <h3 class="nf-h3">지금 어디에 계신가</h3>
      ${stageRows.length ? table(["단계", "분"], stageRows, "narrow") : `<p class="empty">아직 새가족이 없어요</p>`}
      ${d.stopAt.some((n) => n) ? `<h3 class="nf-h3">멈추신 분 — 교육 몇 번째에서</h3>
        ${table(["교육 횟수", "분"], d.stopAt.map((n, i) => [i === 0 ? "한 번도 못 함" : `${i}번 한 뒤`, n]).filter((r) => r[1]), "narrow")}` : ""}
      ${d.byParish.length ? `<h3 class="nf-h3">${esc(String(d.year))}년 편성 교구 <small class="muted">(${esc(done)} 기준)</small></h3>${table(["교구", "분"], d.byParish.map((x) => [x.name, x.n]), "narrow")}` : ""}
      ${d.byGuide.length ? `<h3 class="nf-h3">${esc(String(d.year))}년 전도 교구 <small class="muted">(그해 오신 수료 대상 · 인도자가 두 분이면 반씩)</small></h3>${table(["교구", "분"], d.byGuide.map((x) => [x.name, x.n]), "narrow")}` : ""}
      ${d.helpers.length ? `<h3 class="nf-h3">섬김이마다 <small class="muted">(지금까지 모두)</small></h3>${table(["섬김이", "맡은 분", "교구 배정까지"], d.helpers.map((h) => [h.name, h.assigned, h.done]))}` : ""}`;
  };

  if (!(await load())) return;
  draw();

  let lock = false;
  el.addEventListener("click", async (e) => {
    if (lock) return;
    const bb = e.target.closest("button[data-basis]");
    const b = e.target.closest("button[data-act]");
    if (!bb && !b) return;
    lock = true;
    try {
      if (bb) {
        if (bb.dataset.basis === basis) return;
        basis = bb.dataset.basis;
        if (await load()) draw();
      } else if (b.dataset.act === "year") {
        const got = await pickOne({ anchor: b, title: "볼 해", options: yearOptions(d.years, d.year, Number(String(d.today).slice(0, 4))), value: String(d.year) });
        if (got === null || Number(got) === d.year) return;
        year = Number(got);
        if (await load()) draw();
      } else if (b.dataset.act === "xlsx") {
        try {
          const XLSX = await loadXlsx();
          const sh = statsSheet(d);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.rows), "새가족 통계");
          XLSX.writeFile(wb, sh.name);
        } catch { toast("엑셀 파일을 만들지 못했어요 — 인터넷 연결을 확인해 주세요"); }
      }
    } finally { lock = false; }
  });
}
