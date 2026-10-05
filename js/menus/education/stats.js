// 📊 교육 통계 — 학기 고르기(전체 포함) · 강좌마다 신청·확정·대기·취소·반려·평균 출석률·수료·수료율 + 합계 · 교구·부서별 확정·수료 · 엑셀
//   (교육신청 4단계 C · 2026-10-06 · 계획 v2 docs/superpowers/plans/2026-10-05-education-stage4.md C) 서버: eduStats — 역할 education(교육 총괄)만.
//   수는 서버(SQL edu_stats)가 묶어 준 그대로 — 여기서 신청 줄을 세지 않는다. 글·차례·엑셀 줄은 stats-logic.js(시험).
// ⚠️ 고르기는 picker.js(pickOne)만 — 시스템 select 금지 · 서버 글자(강좌 제목·학기·소속)는 모두 esc · 이벤트는 route() 가 만든 이 화면의 el 에만.
// 폰(먼저): 강좌마다 카드 한 장(제목 / 숫자 여덟 칸 네 개씩 두 줄) · 넓은 화면(720px~): 같은 표가 진짜 표로 · PC(1024px~): 읽기 좋은 폭 1000px.
import { esc, busy, errorText, toast } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import { loadXlsx } from "../../core/xlsx.js";
import { COURSE_COLS, cellText, courseSub, groupLabel, groupKind, groupRate, groupTotal, nText, pctText, sortGroups, statsFileName, statsSheets,
  termLabel, termOptions, NO_COURSES, NO_GROUPS, NO_TERM_COURSES, STATS_NOTE } from "./stats-logic.js";

const TITLE = `<h2 class="page-title">📊 교육 통계</h2>`;
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
let lastTerm = "";   // 메뉴를 나갔다 와도 보던 학기(모듈 안) · "" = 전체

// 강좌별 표 — 폰에서는 줄마다 카드(머리 칸은 data-l 로 칸 안에 · css .est-t)
function courseTable(d, allTerms) {
  const cells = (row) => COURSE_COLS.map(([k, l]) => `<td data-l="${esc(l)}">${esc(cellText(row, k))}</td>`).join("");
  const body = d.courses.map((c) => `<tr><th scope="row" class="est-c"><span class="est-ct">${esc(c.title)}</span>` +
    `<small class="est-cs">${esc(courseSub(c, allTerms))}</small></th>${cells(c)}</tr>`).join("");
  return `<div class="est-tw"><table class="est-t"><thead><tr><th scope="col">강좌</th>${COURSE_COLS.map(([, l]) => `<th scope="col">${esc(l)}</th>`).join("")}</tr></thead>` +
    `<tbody>${body}</tbody><tfoot><tr><th scope="row" class="est-c"><span class="est-ct">합계</span><small class="est-cs">강좌 ${esc(nText(d.courses.length))}개</small></th>` +
    `${cells(d.total)}</tr></tfoot></table></div>`;
}

// 교구·부서별 표 — 확정·수료·수료율(목장까지는 내리지 않는다)
function groupTable(groups) {
  if (!groups.length) return `<p class="empty">${esc(NO_GROUPS)}</p>`;
  const list = sortGroups(groups), tot = groupTotal(list);
  return `<table class="pp-stat est-g"><thead><tr><th scope="col">교구·부서</th><th scope="col">확정</th><th scope="col">수료</th><th scope="col">수료율</th></tr></thead><tbody>` +
    list.map((g) => `<tr><td>${esc(groupLabel(g))}${groupKind(g) ? ` <small class="muted">${esc(groupKind(g))}</small>` : ""}</td>` +
      `<td>${esc(nText(g.confirmed))}</td><td>${esc(nText(g.completed))}</td><td>${esc(pctText(groupRate(g)))}</td></tr>`).join("") +
    `</tbody><tfoot><tr><th scope="row">합계</th><td>${esc(nText(tot.confirmed))}</td><td>${esc(nText(tot.completed))}</td>` +
    `<td>${esc(pctText(tot.completeRate))}</td></tr></tfoot></table>`;
}

export async function render(el, { call }) {
  el.classList.add("est-page");   // PC 에서 읽기 좋은 폭(css .est-page)
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let term = lastTerm, data = null, exporting = false;

  // 학기 t 의 수를 받는다 — 실패하면 { error } (보던 화면은 그대로)
  const load = async (t) => {
    const r = await call("eduStats", t ? { term: t } : {});
    if (!r.ok) return { error: r };
    return { data: r };
  };

  const draw = () => {
    const d = data;
    const noCourse = !d.courses.length;
    const top = `${TITLE}<div class="est-top"><button type="button" class="btn est-term" data-act="term" aria-haspopup="dialog">` +
      `학기 <b>${esc(termLabel(term))}</b></button>` +
      `<button type="button" class="btn est-export" data-act="export"${noCourse ? " disabled" : ""}>엑셀로 내려받기</button></div>`;
    if (noCourse) {
      el.innerHTML = top + `<p class="empty">${esc(term ? NO_TERM_COURSES : NO_COURSES)}</p>`;
      return;
    }
    el.innerHTML = top + `<p class="muted est-note">${esc(STATS_NOTE)}</p>` +
      `<h3 class="sec-title">강좌별 <small class="muted">${esc(nText(d.courses.length))}개</small></h3>${courseTable(d, !term)}` +
      `<h3 class="sec-title">교구·부서별 <small class="muted">확정된 분 · 신청 때 적힌 소속</small></h3>${groupTable(d.groups)}`;
  };

  let first = await load(term);
  // 보던 학기가 그사이 없어졌으면(강좌를 보관했다 등) 전체로
  if (first.data && term && !first.data.terms.includes(term)) { term = ""; lastTerm = ""; first = await load(""); }
  if (first.error) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(first.error))}</p>`; return; }
  data = first.data;
  draw();

  async function exportXlsx() {
    if (exporting || !data) return;
    exporting = true;
    try {
      const sheets = statsSheets(data);
      const XLSX = await busy(el, () => loadXlsx());
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.courses), "강좌별");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheets.groups), "교구·부서별");
      XLSX.writeFile(wb, statsFileName(term, kstToday()));
    } catch { toast("엑셀 파일을 만들지 못했어요"); } finally { exporting = false; }
  }

  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button[data-act]");
    if (!b || !el.contains(b) || b.disabled) return;
    if (b.dataset.act === "export") { await exportXlsx(); return; }
    if (b.dataset.act === "term") {
      const got = await pickOne({ anchor: b, title: "학기", value: term, options: termOptions(data.terms) });
      if (got === null || got === term || !el.isConnected) return;
      const r = await busy(el, () => load(got));   // 실패하면 보던 학기 그대로
      if (!el.isConnected) return;
      if (r.error) { toast(errorText(r.error)); return; }
      term = got; lastTerm = got; data = r.data;
      draw();
      el.querySelector('[data-act="term"]')?.focus({ preventScroll: true });
    }
  });
}
