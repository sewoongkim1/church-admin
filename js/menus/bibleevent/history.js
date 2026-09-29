// 👤 사람별 이력·통계 — 성경필사(암송) 모든 회차를 사람 쪽에서 본다(2026-09-29).
// 설계: 성경암송 저장소 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md 3절 「👤 사람별 이력·통계」·2절 「사람 묶음」.
// 서버 evHistory(이름 → 사람 묶음마다 회차 이력)·evStats(고른 회차의 회차별 인원·교구×회차·여러 번 참여한 분). 순수 논리는 history-logic.js.
// ⚠️ 사람 묶음은 근삿값이다 — 같은 이름·같은 소속(또는 같은 앱 계정)을 한 분으로 본다. 화면·내려받기에 늘 그렇게 적는다.
//    묶음 이름표는 서버가 준 순번·이름·소속뿐이다(user_id 는 오지 않는다). 여러 번 참여한 분은 name(이름) + label(소속만)을
//    「이름 · 소속」으로 잇는다(CONTRACT 5절).
// ⚠️ 이름 찾기는 「찾기」 단추·Enter 로만 부른다(글자마다 부르지 않는다). 교적 값이 아니라 열람 기록은 남지 않는다.
// ⚠️ 시스템 창을 띄우지 않는다 — 회차 여러 개 고르기는 picker.js pickMany, 알림은 ui.js toast. 내려받기는 a[download].
import { esc, toast, busy, errorText } from "../../core/ui.js";
import { pickMany } from "../../core/picker.js";
import { SRC_LABEL } from "./roster-logic.js";
import {
  APPROX, MIN_REPEAT, quickChips, quickIds, chipOn, labelMap, barRows, crossTable, repeatChoices, repeatersAt, statsCsv,
  csvName, histSummary, histRowText,
} from "./history-logic.js";
// 이름을 누르면 교적 창(Task 16)
import { openChurchPerson } from "./person-popup.js";
import { nameButtonHtml, personPayload, rowFromLabel } from "./person-logic.js";

const TITLE = `<h2 class="page-title">👤 사람별 이력·통계</h2>`;
const TABS = [["person", "👤 사람별 이력"], ["stats", "📊 통계"]];
const n = (x) => Number(x || 0).toLocaleString("ko-KR");
const rosterHref = (id) => `#/be-roster?ev=${encodeURIComponent(id)}`;

// 메뉴를 옮겨 다녀도 남는 것 — 보던 쪽·찾던 이름·고른 회차·「N회 이상」. 결과는 열 때마다 새로 받는다.
let tab = "person";
let lastName = "";
let sel = null;          // 통계에 쓸 회차 id 들 — null 이면 전부(서버에 빈 배열)
let minRepeat = MIN_REPEAT;

// CSV 내려받기 — people/search.js download 와 같다(Blob + a[download] · 창을 띄우지 않는다)
function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("evEvents");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">회차를 불러오지 못했어요 — ${esc(errorText(r))}</p>`; return; }
  const events = r.events || [];                      // 마감일 늦은 회차 먼저(서버 차례) · 보관 회차까지 모두
  const labels = labelMap(events);
  const known = new Set(events.map((e) => e.id));
  if (sel) { sel = sel.filter((id) => known.has(id)); if (!sel.length) sel = null; }   // 그사이 없어진 회차는 뺀다
  let hist = null;    // 마지막 이름 찾기 { name, groups }
  let stats = null;   // 마지막 통계 { perEvent, byGroup, repeaters } — 지금 sel 로 받은 것

  el.innerHTML = TITLE + `
    <div class="tabs be-hi-tabs" role="tablist">${TABS.map(([v, t]) =>
      `<button type="button" role="tab" data-tab="${v}">${t}</button>`).join("")}</div>
    <div class="be-hi-person">
      <form class="be-hi-find" role="search">
        <input type="search" class="search" maxlength="40" placeholder="이름 (예: 홍길동)" autocomplete="off"
          enterkeyhint="search" aria-label="찾을 이름">
        <button type="submit" class="btn primary">찾기</button>
      </form>
      <p class="muted be-hi-note">${esc(APPROX)}</p>
      <div class="be-hi-res"></div>
    </div>
    <div class="be-hi-stats" hidden>
      <div class="tabs be-hi-quick" role="group" aria-label="통계에 넣을 회차"></div>
      <p class="muted be-hi-selsum"></p>
      <div class="acts be-hi-acts"><button type="button" class="btn" data-act="csv">⬇️ 통계 내려받기</button></div>
      <div class="be-hi-out"></div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const input = $(".be-hi-find input"), resEl = $(".be-hi-res"), quickEl = $(".be-hi-quick"), outEl = $(".be-hi-out");
  input.value = lastName;

  const drawTabs = () => {
    el.querySelectorAll("[data-tab]").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    });
    $(".be-hi-person").hidden = tab !== "person";
    $(".be-hi-stats").hidden = tab !== "stats";
  };

  // ── 사람별 이력 ──
  const groupHtml = (g) => `<div class="card be-hi-grp">
      <div class="be-hi-gh"><span class="be-hi-n">${esc(g.n)}</span>${nameButtonHtml({ ...(g.rows[0] || {}), name: hist.name }, g.label)}<em>${g.rows.length}회</em>
        ${g.rows.some((x) => x.hasUser) ? `<span class="badge ok">🔗 앱 계정</span>` : ""}</div>
      <ol class="be-hi-rows">${g.rows.map((x) => `<li>
        <a href="${rosterHref(x.event_id)}"><b>${esc(x.title || x.event_id)}</b></a>
        <span class="muted">${esc(x.closes_on ? x.closes_on + " 마감" : "")}</span>
        <span class="be-hi-who">${esc(histRowText(x))}</span>
        <span class="be-hi-src">${esc(SRC_LABEL[x.source] || x.source || "")}${x.hasUser && x.source !== "app" ? " · 🔗 계정 이어짐" : ""}</span>
      </li>`).join("")}</ol></div>`;

  const drawHist = () => {
    if (!hist) { resEl.innerHTML = ""; return; }
    const { name, groups } = hist;
    if (!groups.length) {
      resEl.innerHTML = `<p class="empty">‘${esc(name)}’ 님의 참여 기록이 없어요 — 이름을 명단과 똑같이 적었는지 봐 주세요(띄어쓰기는 상관없어요)</p>`;
      return;
    }
    const s = histSummary(groups);
    resEl.innerHTML = `<p class="be-hi-sum">‘${esc(name)}’ — <b>${s.people}분</b>으로 보여요 · 모두 <b>${s.times}회</b></p>` +
      groups.map(groupHtml).join("");
  };

  async function search(name) {
    const q = String(name || "").trim();
    if (!q) { toast("이름을 적어 주세요"); input.focus(); return; }
    lastName = q;
    const d = await busy(el, () => call("evHistory", { name: q }));
    if (!d.ok) { hist = null; resEl.innerHTML = `<p class="empty">찾지 못했어요 — ${esc(errorText(d))}</p>`; return; }
    hist = { name: q, groups: d.groups || [] };
    drawHist();
  }

  // ── 통계 ──
  const drawQuick = () => {
    const on = chipOn(events, sel);
    const chips = [{ key: "all", label: "전부", n: events.length }, ...quickChips(events),
      { key: "custom", label: "✔️ 직접 고르기", n: on === "custom" ? sel.length : null }];
    quickEl.innerHTML = chips.map((c) => `<button type="button" data-q="${esc(c.key)}" class="${on === c.key ? "on" : ""}" ` +
      `aria-pressed="${on === c.key}">${esc(c.label)}${c.n == null ? "" : ` <em>${c.n}</em>`}</button>`).join("");
    const ids = sel || events.map((e) => e.id);
    $(".be-hi-selsum").textContent = sel
      ? `고른 회차 ${ids.length}개 — ${ids.map((id) => labels.get(id) || id).join(" · ")}`
      : `모든 회차 ${events.length}개`;
  };

  const drawStats = () => {
    if (!stats) return;
    if (!stats.perEvent.length) { outEl.innerHTML = `<p class="empty">고른 회차가 없어요 — 위에서 다시 골라 주세요</p>`; return; }
    const x = crossTable(stats, labels);
    const choices = repeatChoices(stats.repeaters);
    const reps = repeatersAt(stats.repeaters, minRepeat);
    outEl.innerHTML = `<h3 class="sec-title">회차별 인원</h3>
      <div class="be-hi-bars">${barRows(stats.perEvent, labels).map((b) => `<div class="be-hi-bar">
        <a class="be-hi-bl" href="${rosterHref(b.id)}">${esc(b.label)}</a>
        <span class="be-hi-bt" aria-hidden="true"><i style="width:${b.pct}%"></i></span><b>${n(b.count)}명</b></div>`).join("")}</div>
      <h3 class="sec-title">교구(부서) × 회차 <small class="muted">명단 줄 수</small></h3>
      <div class="be-hi-wrap"><table class="be-hi-x">
        <thead><tr><th>소속</th>${x.cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}<th>합계</th></tr></thead>
        <tbody>${x.rows.map((row) => row.head
          ? `<tr class="be-hi-xh"><th colspan="${x.cols.length + 2}">${esc(row.label)}</th></tr>`
          : `<tr><th>${esc(row.label)}</th>${row.cells.map((v) => `<td>${v ? n(v) : "·"}</td>`).join("")}<td><b>${n(row.total)}</b></td></tr>`).join("")}</tbody>
        <tfoot><tr><th>합계</th>${x.foot.cells.map((v) => `<td>${n(v)}</td>`).join("")}<td><b>${n(x.foot.total)}</b></td></tr></tfoot>
      </table></div>
      <h3 class="sec-title">여러 번 참여한 분</h3>
      <p class="muted be-hi-note">${esc(APPROX)}</p>
      ${choices.length ? `<div class="tabs be-hi-min" role="group" aria-label="몇 번 이상">${choices.map((c) =>
        `<button type="button" data-min="${c.min}" class="${c.min === minRepeat ? "on" : ""}" aria-pressed="${c.min === minRepeat}">` +
        `${c.min}회 이상 <em>${c.n}</em></button>`).join("")}</div>` : ""}
      ${reps.length ? `<ol class="be-hi-reps">${reps.map((p) => `<li>
        ${nameButtonHtml({ name: p.name, ...rowFromLabel(p.label) })}<span class="be-hi-aff">${esc(p.label)}</span><button type="button" class="be-hi-who-btn" data-name="${esc(p.name)}" aria-label="${esc(p.name)} · ${esc(p.label)} — 이력 보기">📜 이력</button>
        <em>${p.times}회</em>
        <span class="be-hi-evs">${(p.events || []).map((id) => `<span>${esc(labels.get(id) || id)}</span>`).join("")}</span></li>`).join("")}</ol>`
        : `<p class="empty">고른 회차에서 ${minRepeat}회 이상 참여한 분이 없어요</p>`}`;
  };

  async function loadStats() {
    outEl.innerHTML = `<p class="empty">통계를 내는 중…</p>`;
    const d = await busy(el, () => call("evStats", { event_ids: sel || [] }));
    if (!d.ok) { stats = null; outEl.innerHTML = `<p class="empty">통계를 내지 못했어요 — ${esc(errorText(d))}</p>`; return; }
    stats = { perEvent: d.perEvent || [], byGroup: d.byGroup || [], repeaters: d.repeaters || [] };
    const choices = repeatChoices(stats.repeaters);
    if (choices.length && !choices.some((c) => c.min === minRepeat)) minRepeat = choices[0].min;
    drawStats();
  }

  const setSel = (next) => { sel = next; stats = null; drawQuick(); loadStats(); };

  el.addEventListener("submit", (e) => {
    if (!e.target.matches(".be-hi-find")) return;
    e.preventDefault();
    search(input.value);
  });
  el.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) {
      tab = t.dataset.tab;
      drawTabs();
      if (tab === "stats" && !stats) loadStats();
      if (tab === "person") input.focus();
      return;
    }
    const q = e.target.closest("[data-q]");
    if (q) {
      const key = q.dataset.q;
      if (key === "all") return setSel(null);
      if (key !== "custom") return setSel(quickIds(events, key));
      const v = await pickMany({ anchor: q, title: "통계에 넣을 회차",
        options: events.map((ev) => ({ value: ev.id, label: ev.title || ev.id, hint: `${ev.closes_on} 마감 · ${n(ev.count)}명` })),
        values: sel || events.map((ev) => ev.id) });
      if (v == null) return;                                        // 닫기 — 그대로
      if (!v.length) { toast("회차를 하나 이상 골라 주세요"); return; }
      return setSel(v.length === events.length ? null : v);
    }
    const m = e.target.closest("[data-min]");
    if (m) { minRepeat = Number(m.dataset.min); drawStats(); return; }
    const who = e.target.closest(".be-hi-who-btn");
    if (who) {   // 여러 번 참여한 분의 「📜 이력」 → 그분 이력으로(이름을 누르면 교적 창 — 아래 data-act="person")
      tab = "person";
      input.value = who.dataset.name;
      drawTabs();
      search(who.dataset.name);
      return;
    }
    const b = e.target.closest("button[data-act]");
    if (b && b.dataset.act === "person") { openChurchPerson({ call, ...personPayload(b.dataset), anchor: b }); return; }   // Task 16
    if (b && b.dataset.act === "csv") {
      if (!stats || !stats.perEvent.length) { toast("내려받을 통계가 없어요"); return; }
      download(statsCsv(stats, labels, minRepeat), csvName());
    }
  });

  drawTabs();
  drawQuick();
  if (tab === "stats") loadStats();
  else if (lastName) search(lastName);
}
