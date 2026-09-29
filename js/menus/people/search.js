// 🔎 교인 찾기 (2026-09-29) — 이름·전화 뒷자리로 찾기 · 거르기 · 한 분 자세히 · 찾은 명단 내려받기.
// ⚠️ 찾기·보기·내려받기는 서버가 모두 기록한다(바꾼 기록 → 「교인명부 기록」).
// ⚠️ 사진 주소는 10분 뒤 만료된다 — 목록 사진은 바로 불러오고(eager), 못 불러오면 이름 첫 글자로 바꾼다.
//    자세히 보기는 열 때마다 서버가 새 주소를 준다.
// ⚠️ 내려받기는 **마지막으로 찾은 조건** 그대로다(칸을 바꾸고 「찾기」를 안 눌렀으면 옛 조건) — 화면의 수와 파일이 같게.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { sourceLine, affText, csvText, detailRows, searchPayload, initialOf, exportName, pageInfo, familyOrder }
  from "./people-logic.js";

const TITLE = `<h2 class="page-title">🔎 교인 찾기</h2>`;
// 찾기 조건은 메뉴를 옮겨 다녀도 남는다(임명현황과 같게). household = 가족 보기(세대주 교인ID)
const BLANK = { q: "", mok1: "", kind2: "", kind3: "", position: "", noPhoto: false, page: 0, household: null, householdName: "" };
let state = { ...BLANK };
let options = null;   // 거르기 목록 — 교인 현황(peopleStats)에서 한 번 받는다

const iniHtml = (name, cls) => `<span class="${cls} pp-ini" aria-hidden="true">${esc(initialOf(name))}</span>`;
const photoHtml = (p, cls) => p.photo
  ? `<img class="${cls}" src="${esc(p.photo)}" alt="" loading="eager" referrerpolicy="no-referrer" data-ini="${esc(initialOf(p.name))}">`
  : iniHtml(p.name, cls);
const telHtml = (phone) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d ? `<a class="pp-tel" href="tel:${d}">📞 ${esc(phone)}</a>` : `<span class="muted">번호 없음</span>`;
};
const ageText = (p) => [p.gender, p.age != null && p.age !== "" ? `${p.age}세` : ""].filter(Boolean).join(" · ");
const posHtml = (p) => (p.position ? `<em class="mn-pos">${esc(p.position)}</em>` : "");

// 가족 보기일 때만 관계(본인·처·아들1 …)를 붙인다
const relHtml = (p) => (state.household && p.household_rel ? `<span class="pp-rel">${esc(p.household_rel)}</span>` : "");

const cardsHtml = (rows) => rows.map((p) => `<div class="pp-card" data-id="${esc(p.person_id)}" role="button" tabindex="0">
    ${photoHtml(p, "pp-ph")}
    <div class="pp-main"><div>${relHtml(p)}<b>${esc(p.name)}</b>${posHtml(p)} <span class="muted">${esc(ageText(p))}</span></div>
      <div class="pp-aff">${esc(affText(p))}</div><div>${telHtml(p.phone1)}</div></div>
  </div>`).join("");

const tableHtml = (rows) => `<table class="pp-table"><thead><tr><th>사진</th><th>이름(직분)</th><th>성별·나이</th>` +
  `<th>소속</th><th>구분</th><th>연락처</th></tr></thead><tbody>` +
  rows.map((p) => `<tr class="pp-row" data-id="${esc(p.person_id)}" role="button" tabindex="0"><td>${photoHtml(p, "pp-ph sm")}</td>` +
    `<td>${relHtml(p)}<b>${esc(p.name)}</b>${posHtml(p)}</td><td>${esc(ageText(p))}</td><td>${esc(affText(p))}</td>` +
    `<td>${esc(p.kind2 || "")}</td><td>${telHtml(p.phone1)}</td></tr>`).join("") + `</tbody></table>`;

const selectHtml = (key, label, values) => `<label class="pp-sel"><span>${label}</span><select data-f="${key}">` +
  `<option value="">전체</option>${(values || []).map((v) =>
    `<option value="${esc(v)}"${state[key] === v ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;

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

// 한 분 자세히 + 가족(같은 신앙세대주). 가족 이름을 누르면 이 창을 닫고 그분을 연다(열람 기록이 그분 몫으로 남는다).
// 「가족 모두 목록으로」는 onFamily(세대주 교인ID, 세대주 이름) — 목록을 그 가족으로 바꾼다.
async function openPerson(call, id, onFamily) {
  const r = await call("peoplePerson", { id: Number(id) });
  if (!r.ok) { toast(errorText(r)); return; }
  const p = r.person;
  const rows = detailRows(p).map(([k, v, kind]) => `<dt>${esc(k)}</dt><dd>${kind === "tel" ? telHtml(v) : esc(v)}</dd>`).join("");
  const photo = p.photo
    ? `<img class="pp-big" src="${esc(p.photo)}" alt="${esc(p.name)} 사진" referrerpolicy="no-referrer">`
    : `<div class="pp-big pp-ini">${esc(initialOf(p.name))}</div>`;
  const fam = familyOrder(r.family || [], p.household_id);
  const famHtml = !p.household_id || !fam.length ? "" :
    `<div class="pp-fam"><div class="pp-fam-t"><b>가족</b> <span class="muted">세대주 ${esc(p.household_head || "(명단에 없음)")} · ${fam.length + 1}명</span></div>` +
    fam.map((f) => `<button type="button" class="pp-fam-b" data-fam="${esc(f.person_id)}">${esc(f.name)} <small>${esc(
      [f.household_rel, f.age != null && f.age !== "" ? f.age + "세" : ""].filter(Boolean).join(" · "))}</small></button>`).join("") +
    `<button type="button" class="btn pp-fam-all" data-fam-all="${esc(p.household_id)}">👪 가족 모두 목록으로</button></div>`;
  // ⚠️ dialog 본문은 pre-line — html 안에 줄바꿈 글자를 넣지 않는다
  const closed = dialog({ title: p.name + (p.position ? " " + p.position : ""),
    html: `<div class="pp-detail">${photo}<dl>${rows}</dl>${famHtml}</div>`, ok: "닫기", cancel: null });
  const dlg = [...document.querySelectorAll(".dlg-dim")].pop();   // dialog 는 창을 곧바로(동기로) 붙인다
  dlg.addEventListener("click", (e) => {
    const f = e.target.closest("[data-fam]"), all = e.target.closest("[data-fam-all]");
    if (!f && !all) return;
    dlg.querySelector('[data-v="1"]').click();                    // 이 창을 닫고
    if (f) openPerson(call, f.dataset.fam, onFamily);
    else onFamily(Number(all.dataset.famAll), p.household_head || "");
  });
  await closed;
}

export async function render(el, { call, query }) {
  if (query && query.nophoto === "1") state = { ...state, noPhoto: true, page: 0 };
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  if (!options) {
    const st = await call("peopleStats");
    if (!st.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(st))}</p>`; return; }
    if (!st.source) { el.innerHTML = TITLE + `<p class="empty">${esc(sourceLine(null).text)}</p>`; return; }
    options = st.stats.options;
  }
  el.innerHTML = TITLE + `<p class="pp-src muted"></p><p class="pp-famon" hidden></p>
    <form class="pp-form" autocomplete="off">
      <input type="search" class="search" name="q" placeholder="🔍 이름 또는 전화 뒷자리 4개" aria-label="찾기">
      <div class="pp-filters">${selectHtml("mok1", "교구", options.mok1)}${selectHtml("kind2", "구분", options.kind2)}` +
        `${selectHtml("kind3", "출석", options.kind3)}${selectHtml("position", "직분", options.position)}
        <label class="pp-chk"><input type="checkbox" data-f="noPhoto"${state.noPhoto ? " checked" : ""}> 사진 없는 분만</label></div>
      <div class="acts"><button type="submit" class="btn primary">찾기</button>
        <button type="button" class="btn" data-act="csv">⬇️ 내려받기</button></div>
    </form>
    <p class="muted pp-sum"></p><div class="pp-list"></div>
    <div class="acts pp-pager" hidden><button type="button" class="btn" data-act="prev">← 앞</button>
      <button type="button" class="btn" data-act="next">다음 →</button></div>`;
  const form = el.querySelector(".pp-form");
  form.q.value = state.q;
  let last = null;
  // 이 화면을 다시 열 때마다 새로 만든다 — 리스너도 옛 객체와 함께 버려지게(status.js 와 같은 방식)
  const mqWide = matchMedia("(min-width:1024px)");

  const readForm = () => {
    state.q = form.q.value.trim();
    el.querySelectorAll("select[data-f]").forEach((s) => { state[s.dataset.f] = s.value; });
    state.noPhoto = el.querySelector('input[data-f="noPhoto"]').checked;
    state.household = null;          // 「찾기」를 누르면 가족 보기는 끝난다
    state.householdName = "";
  };

  // 가족 보기 — 다른 조건은 모두 비우고 세대주 교인ID 하나로 찾는다
  const showFamily = (hid, headName) => {
    state = { ...BLANK, household: hid, householdName: headName };
    form.q.value = "";
    el.querySelectorAll("select[data-f]").forEach((s) => { s.value = ""; });
    el.querySelector('input[data-f="noPhoto"]').checked = false;
    load();
  };

  function draw() {
    if (!last) return;
    const info = pageInfo(last.total, last.page, last.pageSize);
    el.querySelector(".pp-sum").innerHTML = last.total
      ? `<b>${last.total.toLocaleString("ko-KR")}명</b> 중 ${info.from}–${info.to}` : "";
    const famOn = el.querySelector(".pp-famon");
    famOn.hidden = !state.household;
    famOn.innerHTML = state.household
      ? `👪 가족 보기 — 세대주 ${esc(state.householdName || String(state.household))} ` +
        `<button type="button" class="btn" data-act="famoff">✕ 가족 보기 끝</button>` : "";
    const shown = state.household ? familyOrder(last.rows, state.household) : last.rows;
    const list = el.querySelector(".pp-list");
    list.innerHTML = !shown.length ? `<p class="empty">조건에 맞는 분이 없어요</p>`
      : mqWide.matches ? tableHtml(shown) : cardsHtml(shown);
    list.querySelectorAll("img[data-ini]").forEach((img) => img.addEventListener("error", () => {
      const s = document.createElement("span");
      s.className = img.className + " pp-ini";
      s.textContent = img.dataset.ini;
      img.replaceWith(s);
    }, { once: true }));
    el.querySelector('[data-act="prev"]').disabled = !info.hasPrev;
    el.querySelector('[data-act="next"]').disabled = !info.hasNext;
    el.querySelector(".pp-pager").hidden = !(info.hasPrev || info.hasNext);
  }

  async function load() {
    const r = await busy(el, () => call("peopleSearch", searchPayload(state)));
    if (!r.ok) {
      // 실패한 조건의 옛 명수·가족 보기 줄·앞/다음 단추가 그대로 남으면 사실과 다르다 — 함께 지운다.
      // 기준일 줄(.pp-src)은 그대로 둔다 — 명부 자체는 실패와 무관하다.
      last = null;
      el.querySelector(".pp-list").innerHTML = `<p class="empty">${esc(errorText(r))}</p>`;
      el.querySelector(".pp-sum").textContent = "";
      el.querySelector(".pp-famon").hidden = true;
      el.querySelector(".pp-pager").hidden = true;
      return;
    }
    last = r;
    const src = sourceLine(r.source, new Date().toISOString().slice(0, 10));
    const srcEl = el.querySelector(".pp-src");
    srcEl.textContent = src.text;
    srcEl.classList.toggle("stale", src.stale);
    draw();   // busy 가 단추를 되살린 뒤 — 앞/다음의 잠금은 여기서 다시 정한다
  }

  async function exportCsv() {
    if (!last || !last.total) { toast("내려받을 분이 없어요 — 먼저 찾아 주세요"); return; }
    const yes = await dialog({ title: "⬇️ 명단 내려받기", ok: `${last.total}명 받기`, cancel: "그만두기",
      html: `지금 조건으로 찾은 <b>${last.total.toLocaleString("ko-KR")}명</b>을 엑셀(CSV)로 받습니다.<br>받은 기록이 남아요 — 누가 · 언제 · 몇 명.` });
    if (!yes) return;
    const r = await busy(el, () => call("peopleExport", searchPayload({ ...state, page: 0 })));
    draw();
    if (!r.ok) { toast(errorText(r)); return; }
    download(csvText(r.rows), exportName(r.source, r.rows.length));
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); readForm(); state.page = 0; load(); });
  el.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;   // 전화 걸기는 그대로
    const b = e.target.closest("button[data-act]");
    if (b) {
      if (b.dataset.act === "prev" && state.page > 0) { state.page--; load(); }
      if (b.dataset.act === "next") { state.page++; load(); }
      if (b.dataset.act === "csv") exportCsv();
      if (b.dataset.act === "famoff") { state.household = null; state.householdName = ""; state.page = 0; load(); }
      return;
    }
    const row = e.target.closest("[data-id]");
    if (row) openPerson(call, row.dataset.id, showFamily);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-id]")) openPerson(call, e.target.dataset.id, showFamily);
  });
  // 폭이 바뀌면 카드↔표 — 이 화면을 떠나면 스스로 뗀다(status.js 와 같은 방식)
  const onMq = () => { if (el.isConnected) draw(); else mqWide.removeEventListener("change", onMq); };
  mqWide.addEventListener("change", onMq);
  load();
}
