// 📊 교인 현황 (2026-09-29) — 숫자만. 이름·연락처는 이 화면에 없다(서버 peopleStats 도 주지 않는다).
import { esc, errorText } from "../../core/ui.js";
import { sourceLine } from "./people-logic.js";

const TITLE = `<h2 class="page-title">📊 교인 현황</h2>`;
const n = (x) => Number(x || 0).toLocaleString("ko-KR");
const pairTable = (title, head, pairs) => !pairs.length ? "" :
  `<h3 class="sec-title">${esc(title)}</h3><table class="pp-stat"><thead><tr><th>${esc(head)}</th><th>인원</th></tr></thead>` +
  `<tbody>${pairs.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${n(v)}</td></tr>`).join("")}</tbody></table>`;

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("peopleStats");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  const src = sourceLine(r.source, new Date().toISOString().slice(0, 10));
  if (!r.source) { el.innerHTML = TITLE + `<p class="empty">${esc(src.text)}</p>`; return; }
  const s = r.stats;
  el.innerHTML = TITLE + `<p class="pp-src muted${src.stale ? " stale" : ""}">${esc(src.text)}</p>
    <div class="pp-kpis">
      <div class="card pp-kpi"><span class="muted">전체</span><b>${n(s.total)}명</b></div>
      <div class="card pp-kpi"><span class="muted">가구</span><b>${n(s.households)}</b><span class="muted">신앙세대주 기준</span></div>
      <a class="card pp-kpi" href="#/people?nophoto=1"><span class="muted">사진 없는 분</span><b>${n(s.noPhoto)}명</b>
        <span class="muted">눌러서 명단 보기 →</span></a>
    </div>
    <h3 class="sec-title">교구별</h3>
    <table class="pp-stat"><thead><tr><th>교구</th><th>목장 수</th><th>인원</th></tr></thead><tbody>
      ${s.gu.map((g) => `<tr><td>${esc(g.gu)}</td><td>${n(g.moks)}</td><td>${n(g.n)}</td></tr>`).join("")}</tbody></table>
    ${pairTable("장년 · 청년 · 교회학교", "구분", s.kind2)}
    ${pairTable("출석 구분", "출석", s.kind3)}
    ${pairTable("직분", "직분", s.position)}
    ${pairTable("교회학교 부서", "부서", s.school)}
    <h3 class="sec-title">연령대 · 성별</h3>
    <table class="pp-stat"><thead><tr><th>연령대</th><th>남</th><th>여</th><th>모름</th><th>합</th></tr></thead><tbody>
      ${s.age.map((a) => `<tr><td>${esc(a.band)}</td><td>${n(a.m)}</td><td>${n(a.f)}</td><td>${n(a.x)}</td>` +
        `<td>${n(a.m + a.f + a.x)}</td></tr>`).join("")}</tbody></table>`;
}
