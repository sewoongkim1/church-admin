// 📊 통계 — 기간별 사용 현황(구분·소속별) 대시보드. 성경암송 api 프록시(stats). 역할 memorizeadmin.
//   주간 리포트 메일을 참조한 구성: KPI 카드 + 소속별 가로 막대 + 상세 표.
//   ⚠️ 참여자별 세부·성도 검색은 「성도 계정」 메뉴로(이 화면은 집계만).
import { esc, errorText, busy } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">📊 통계</h2>`;
// 표 열 이름 — 응답 키 → 한글. 합계 = 타이핑 + 음성(총 도전), 카드는 타이핑 중 카드 모드 수.
const COL = { gubun: "구분", sosok: "소속", newCount: "신규", participants: "참여", active: "활동",
  typing: "타이핑", card: "카드", voice: "음성", cumulative: "누적", total: "합계" };
const ymd = (d) => d.toISOString().slice(0, 10);
const num = (n) => (Number(n) || 0).toLocaleString("ko-KR");
const sum = (rows, k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

export async function render(el, { call }) {
  const now = new Date(); const from0 = new Date(now); from0.setDate(from0.getDate() - 29);
  el.innerHTML = TITLE + `
    <div class="acts" style="margin-bottom:12px">
      <input type="date" id="st-from" value="${ymd(from0)}" class="search" style="max-width:170px;margin:0"> <span class="muted">~</span>
      <input type="date" id="st-to" value="${ymd(now)}" class="search" style="max-width:170px;margin:0">
      <button class="btn primary" id="st-go">조회</button>
    </div>
    <p class="muted" id="st-status"></p>
    <div id="st-kpi"></div>
    <div id="st-chart"></div>
    <div id="st-table" style="overflow-x:auto"></div>`;

  // KPI 카드(합계값) — 주간 메일의 큰 숫자 카드처럼.
  const kpiBox = (n, l, accent) => `<div style="flex:1 1 120px;background:#f4f7fc;border:1px solid var(--border);border-radius:12px;padding:14px;text-align:center">
    <div style="font-size:24px;font-weight:800;color:${accent || "var(--navy)"}">${num(n)}</div>
    <div class="muted" style="font-size:12px;margin-top:2px">${esc(l)}</div></div>`;

  // 소속별 가로 막대 — 합계(총 도전) 기준, 큰 순서로.
  const chart = (rows) => {
    const items = rows.map((r) => ({ label: `${r.gubun === "교회학교" ? "🏫 " : ""}${r.sosok || ""}`, v: Number(r.total) || 0 }))
      .sort((a, b) => b.v - a.v);
    const max = Math.max(1, ...items.map((x) => x.v));
    const bars = items.map((x) => {
      const pct = Math.round((x.v / max) * 100);
      return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;font-size:13px">
        <span style="width:92px;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.label)}</span>
        <span style="flex:1;min-width:0;height:16px;background:#e7edf6;border-radius:8px;overflow:hidden">
          <span style="display:block;height:100%;width:${pct}%;background:var(--navy);border-radius:8px"></span></span>
        <span style="width:72px;flex:none;text-align:right;font-weight:700">${num(x.v)}</span></div>`;
    }).join("");
    return `<div class="card"><b style="font-size:13px">📊 소속별 참여(총 도전)</b><div style="margin-top:8px">${bars}</div></div>`;
  };

  // 숫자(또는 숫자 문자열)는 천단위 콤마, 그 밖(구분·소속 텍스트)은 그대로.
  const cell = (v) => (v !== null && v !== "" && typeof v !== "boolean" && !isNaN(v)) ? num(v) : esc(v ?? "");
  // 숫자 열(값이 모두 비었거나 숫자)은 오른쪽 정렬, 글자 열(구분·소속)은 왼쪽.
  const numCol = (rows, k) => rows.every((r) => r[k] == null || r[k] === "" || (typeof r[k] !== "boolean" && !isNaN(r[k])));
  const table = (rows) => {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const align = Object.fromEntries(keys.map((k) => [k, numCol(rows, k) ? "right" : "left"]));
    const head = keys.map((k) => `<th style="text-align:${align[k]};padding:6px 10px;white-space:nowrap">${esc(COL[k] || k)}</th>`).join("");
    const body = rows.map((r) => `<tr>${keys.map((k) => `<td style="text-align:${align[k]};padding:6px 10px;border-top:1px solid var(--border);white-space:nowrap">${cell(r[k])}</td>`).join("")}</tr>`).join("");
    return `<div class="card" style="margin-top:12px;overflow-x:auto"><b style="font-size:13px">상세</b>
      <table style="border-collapse:collapse;min-width:100%;margin-top:8px;font-size:13px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  };

  const draw = (rows) => {
    el.querySelector("#st-status").textContent = `${rows.length}줄`;
    const kpi = el.querySelector("#st-kpi"), ch = el.querySelector("#st-chart"), tb = el.querySelector("#st-table");
    if (!rows.length) { kpi.innerHTML = ""; ch.innerHTML = ""; tb.innerHTML = `<p class="muted">기간에 자료가 없어요.</p>`; return; }
    kpi.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      ${kpiBox(sum(rows, "newCount"), "신규 참여자", "#b8860b")}
      ${kpiBox(sum(rows, "participants"), "참여자")}
      ${kpiBox(sum(rows, "total"), "총 도전")}
      ${kpiBox(sum(rows, "typing"), "타이핑")}
      ${kpiBox(sum(rows, "voice"), "음성")}
      ${kpiBox(sum(rows, "card"), "카드 모드")}
    </div>`;
    ch.innerHTML = chart(rows);
    tb.innerHTML = table(rows);
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
