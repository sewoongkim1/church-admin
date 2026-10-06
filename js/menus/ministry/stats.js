// 📊 사역 통계 — 해마다 봉사자·자리 · 계속·돌아옴·처음·나감 · 계열별 · 안쪽 나눔 · 나이·성별·직분 · 엑셀 (2026-10-06)
//   설계 v2 docs/superpowers/specs/2026-10-06-ministry-stats-design.md §7. 서버: ministryStats — 역할 ministry(사역신청 담당) + 총괄.
//   서버는 한 번만 부른다 — 범위(전체·찬양·교회학교·그 밖 · 따로 목양·기관 · 계열)를 바꾸면 받아 둔 묶음으로 다시 그린다.
//   수는 서버가 센 그대로(ministry-stats.ts) — 글·차례·그림·엑셀 줄은 stats-logic.js(시험). 이 화면에는 이름이 없다(묶음 숫자와 부서·팀 이름뿐).
// ⚠️ 범위 고르기는 .tabs 단추(시스템 select 금지) · 서버 글자(계열·팀 이름)는 모두 esc · 이벤트는 route() 가 만든 이 화면의 el 에만.
// 폰(먼저): 카드 둘씩 · 그림과 표는 상자 안에서 옆으로 밀기 · PC(1024px~): 읽기 좋은 폭 1000px(css .mst-page).
import { esc, busy, errorText, toast } from "../../core/ui.js";
import { loadXlsx } from "../../core/xlsx.js";
import { ALL, AGE_BANDS, SEXES, POSITIONS, FLOW_HEAD, HOW, EMPTY, NO_DEMO, cardsOf, chartSvg, legendHtml, demoRows, familyTabs, flowRow, groupOf,
  heatRows, heatStyle, innerOf, metaLines, nText, statsFileName, statsSheets, tabUnits, unitOf } from "./stats-logic.js";

const TITLE = `<h2 class="page-title">📊 사역 통계</h2>`;
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
let lastUnit = ALL;   // 메뉴를 나갔다 와도 보던 범위(모듈 안)

const tab = (u, label, on, cls = "") => `<button type="button" class="${cls}${on ? " on" : ""}" data-u="${esc(u)}" aria-pressed="${on ? "true" : "false"}">${esc(label)}</button>`;

function tabsHtml(d, unit) {
  const t = tabUnits(d), g = groupOf(d, unit);
  const main = t.main.map((u) => tab(u, d.units[u].label, g === u)).join("");
  const side = t.side.length ? `<span class="mst-sep">따로</span>` + t.side.map((u) => tab(u, d.units[u].label, g === u, "mst-side")).join("") : "";
  const fams = familyTabs(d, unit);
  const famRow = !fams.length ? "" : `<div class="tabs mst-fams" role="group" aria-label="계열"><span class="mst-sep">계열</span>` +
    tab(g, "모두", unit === g) + fams.map((u) => tab(u, d.units[u].label, unit === u)).join("") + `</div>`;
  return `<div class="mst-top"><div class="tabs mst-tabs" role="group" aria-label="범위">${main}${side}</div>` +
    `<button type="button" class="btn mst-export" data-act="export">엑셀로 내려받기</button></div>${famRow}`;
}

const cardsHtml = (rows) => `<ul class="mst-cards">` + cardsOf(rows).map((c) =>
  `<li class="card mst-card"><span class="mst-ct">${esc(c.title)}</span><b>${esc(c.value)}</b><small>${esc(c.sub)}</small></li>`).join("") + `</ul>`;

function flowHtml(rows) {
  const body = rows.filter((r) => r.seats > 0 || r.people > 0).map((raw) => {
    const r = flowRow(raw);
    const first = `<td>${esc(r.year)}${r.gap ? ` <small class="mst-gapmark">※명단 일부</small>` : ""}</td><td>${esc(r.seats)}</td><td>${esc(r.people)}</td>`;
    if (!r.flow) return `<tr class="${r.gap ? "mst-gap" : ""}">${first}<td colspan="6" class="mst-none">견줄 해가 없어요</td></tr>`;
    const f = r.flow;
    return `<tr class="${r.gap ? "mst-gap" : ""}">${first}<td>${esc(f.stay)}</td><td>${esc(f.back)}</td>` +
      `<td>${esc(f.first)} <small>${esc(f.firstSub)}</small></td><td>${esc(f.left)} <small>${esc(f.leftSub)}</small></td>` +
      `<td>${esc(f.keep)}</td><td>${esc(f.prev)}${f.skipped ? ` <small>건너뜀</small>` : ""}</td></tr>`;
  }).join("");
  return `<div class="mst-tw"><table class="mst-t"><thead><tr>${FLOW_HEAD.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

const yearHead = (years) => years.map((y) => `<th scope="col">${String(y).slice(2)}</th>`).join("");
const dot = `<td class="mst-n mst-zero">·</td>`;

function heatHtml(d, unit) {
  const rows = heatRows(d, unit);
  if (!rows.length) return "";
  const max = Math.max(1, ...rows.flatMap((r) => r.seats));
  return `<h3 class="sec-title">계열별 자리 수 <small class="muted">진할수록 많아요 · 맨 오른쪽은 올해 유지율</small></h3>` +
    `<div class="mst-tw mst-yw"><table class="mst-t mst-heat"><thead><tr><th scope="col">계열</th>${yearHead(d.years)}<th scope="col">올해 유지율</th></tr></thead><tbody>` +
    rows.map((r) => `<tr><th scope="row"><button type="button" class="mst-link" data-u="${esc(r.key)}">${esc(r.label)}</button> <small class="muted">${esc(r.group)}</small></th>` +
      r.seats.map((v) => (v ? `<td class="mst-n" style="${heatStyle(v, max)}">${nText(v)}</td>` : dot)).join("") + `<td>${esc(r.keep)}</td></tr>`).join("") +
    `</tbody></table></div>`;
}

function innerHtml(d, unit) {
  const x = innerOf(d, unit);
  if (!x) return "";
  const max = Math.max(1, ...x.teams.flatMap((t) => t.seats));
  let body = "";
  for (const m of x.mids) {
    body += `<tr class="mst-mid"><th scope="row">${esc(m.label || "(묶음 없음)")}</th>` + m.seats.map((v) => (v ? `<td class="mst-n">${nText(v)}</td>` : dot)).join("") + `</tr>`;
    for (const t of x.teams.filter((k) => k.mid === m.label)) {
      body += `<tr><th scope="row" class="mst-team">${esc(t.label)}</th>` + t.seats.map((v) => (v ? `<td class="mst-n" style="${heatStyle(v, max)}">${nText(v)}</td>` : dot)).join("") + `</tr>`;
    }
  }
  return `<h3 class="sec-title">안쪽 나눔 <small class="muted">굵은 줄은 묶음, 그 아래는 팀별 자리 수</small></h3>` +
    `<div class="mst-tw mst-yw"><table class="mst-t mst-heat"><thead><tr><th scope="col">묶음 · 팀</th>${yearHead(d.years)}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function demoHtml(rows) {
  const list = demoRows(rows);
  const head = `<h3 class="sec-title">나이 · 성별 · 직분 <small class="muted">교인명부의 지금 값 · 1~4명인 칸은 「5 미만」</small></h3>`;
  if (!list.length) return head + `<p class="empty">${esc(NO_DEMO)}</p>`;
  const th = (xs) => xs.map((x) => `<th scope="col">${esc(x)}</th>`).join("");
  const td = (xs) => xs.map((x) => `<td>${esc(x)}</td>`).join("");
  const yearCell = (r) => `<td>${esc(r.year)}${r.gap ? ` <small class="mst-gapmark">※</small>` : ""}</td>`;
  return head +
    `<div class="mst-tw"><table class="mst-t"><thead><tr><th scope="col">해</th><th scope="col">봉사자</th><th scope="col">평균 나이</th>${th(AGE_BANDS)}</tr></thead><tbody>` +
    list.map((r) => `<tr>${yearCell(r)}<td>${nText(r.people)}</td><td>${esc(r.ageAvg)}</td>${td(r.bands)}</tr>`).join("") + `</tbody></table></div>` +
    `<div class="mst-tw mst-tw2"><table class="mst-t"><thead><tr><th scope="col">해</th>${th(SEXES.map((s) => (s === "모름" ? "성별 모름" : s)))}${th(POSITIONS.map((p) => (p === "모름" ? "직분 모름" : p)))}</tr></thead><tbody>` +
    list.map((r) => `<tr>${yearCell(r)}${td(r.sex)}${td(r.position)}</tr>`).join("") + `</tbody></table></div>`;
}

const howHtml = (d) => `<details class="mst-how"><summary>세는 법</summary><ul>` + HOW.map((t) => `<li>${esc(t)}</li>`).join("") + `</ul>` +
  `<ul class="mst-meta">` + metaLines(d).map((t) => `<li>${esc(t)}</li>`).join("") + `</ul></details>`;

export async function render(el, { call }) {
  el.classList.add("mst-page");   // PC 에서 읽기 좋은 폭(css .mst-page)
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("ministryStats", {});
  if (!el.isConnected) return;
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  const data = r;
  if (!unitOf(data, ALL) && !Object.keys(data.units || {}).length) { el.innerHTML = TITLE + `<p class="empty">${esc(EMPTY)}</p>`; return; }
  let unit = unitOf(data, lastUnit) ? lastUnit : (unitOf(data, ALL) ? ALL : Object.keys(data.units)[0]);
  let exporting = false;

  const draw = () => {
    const rows = data.units[unit].rows;
    el.innerHTML = TITLE + tabsHtml(data, unit) + cardsHtml(rows) +
      `<h3 class="sec-title">해마다 봉사자 <small class="muted">올해 봉사자가 견준 해에도 했는지로 나눈 것</small></h3>` +
      `<div class="mst-box"><div class="mst-chartw mst-yw">${chartSvg(rows)}</div>${legendHtml()}</div>` +
      `<h3 class="sec-title">해마다 수 <small class="muted">유지율 = 견준 해의 봉사자 가운데 올해도 한 분</small></h3>${flowHtml(rows)}` +
      heatHtml(data, unit) + innerHtml(data, unit) + demoHtml(rows) + howHtml(data);
    // 해가 옆으로 늘어선 그림·표는 가장 늦은 해가 보이게 오른쪽 끝으로(폰 — PC 는 넘치지 않아 그대로다)
    for (const x of el.querySelectorAll(".mst-yw")) x.scrollLeft = x.scrollWidth;
  };
  draw();

  async function exportXlsx() {
    if (exporting) return;
    exporting = true;
    try {
      const XLSX = await busy(el, () => loadXlsx());
      const wb = XLSX.utils.book_new();
      for (const [name, aoa] of statsSheets(data)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
      XLSX.writeFile(wb, statsFileName(kstToday()));
    } catch { toast("엑셀 파일을 만들지 못했어요"); } finally { exporting = false; }
  }

  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b || !el.contains(b) || b.disabled) return;
    if (b.dataset.act === "export") { await exportXlsx(); return; }
    const u = b.dataset.u;
    if (!u || !unitOf(data, u) || u === unit) return;
    unit = u; lastUnit = u;
    draw();
    el.querySelector(`.tabs button.on`)?.focus({ preventScroll: true });
  });
}
