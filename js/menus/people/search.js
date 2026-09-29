// 🔎 교인 찾기 (2026-09-29) — 이름·전화 뒷자리로 찾기 · 거르기 · 한 분 자세히 · 찾은 명단 내려받기.
// ⚠️ 찾기·보기·내려받기는 서버가 모두 기록한다(바꾼 기록 → 「교인명부 기록」).
// ⚠️ 사진 주소는 10분 뒤 만료된다 — 목록 사진은 바로 불러오고(eager), 못 불러오면 이름 첫 글자로 바꾼다.
//    자세히 보기는 열 때마다 서버가 새 주소를 준다.
// ⚠️ 내려받기는 **마지막으로 찾은 조건** 그대로다(검색어를 고치고 「찾기」를 안 눌렀으면 옛 조건) — 화면의 수와 파일이 같게.
// 거르기 넷(교구·구분·출석·직분)은 「여러 개 고르기」 판(체크박스). 판이 닫힐 때 고른 것이 바뀌었으면 곧바로 1쪽부터 다시 찾는다
//   (안 바뀌었으면 찾지 않는다 — 열람 기록이 쓸데없이 쌓이지 않게 · 2026-09-29).
// 「사진 없는 분만」은 거르기 줄에 없다 — 현황의 「사진 없는 분 N명」(#/people?nophoto=1)으로 들어올 때만 켜지고,
//   그때는 줄 끝에 「📷 사진 없는 분만 ✕」 표시가 떠 누르면 풀린다.
// 정렬(2026-09-29) — 넓으면 표 머리(이름·성별나이·소속·구분)를, 좁으면 목록 위 「정렬」 칩을 누른다. 같은 것을 다시 누르면
//   방향이 바뀐다(nextSort). 누르면 1쪽부터 다시 찾는다 — 서버가 정렬하므로 쪽을 넘겨도·내려받아도 같은 차례.
//   가족 보기 중에는 가족 차례(familyOrder)라 정렬을 감춘다(끝나면 원래 정렬로 — 가족 보기가 정렬을 지우지 않는다).
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { sourceLine, affText, csvText, detailRows, searchPayload, initialOf, exportName, pageInfo, familyOrder,
  FILTER_KEYS, pickSummary, filterChoices, sameSet, nextSort, sortMark, SORTS } from "./people-logic.js";

const TITLE = `<h2 class="page-title">🔎 교인 찾기</h2>`;
// 찾기 조건은 메뉴를 옮겨 다녀도 남는다(임명현황과 같게) — 정렬(sort·dir)도. household = 가족 보기(세대주 교인ID)
// ⚠️ 거르기 배열은 늘 새 배열로 바꿔 넣는다(push 금지) — blank() 가 매번 새 배열을 만들지만 사본끼리 섞이지 않게.
const blank = () => ({ q: "", mok1: [], kind2: [], kind3: [], position: [], noPhoto: false, page: 0, household: null, householdName: "",
  sort: "name", dir: "asc" });
let state = blank();
let choices = null;   // 고를 목록 [값, 인원] — 교인 현황(peopleStats)에서 한 번 받는다
const PICKS = [["mok1", "교구"], ["kind2", "구분"], ["kind3", "출석"], ["position", "직분"]];
// 자세히 창을 여는 중이거나 떠 있는 동안 true — Enter 두 번·더블클릭에 창이 겹쳐 뜨고 「교인 보기」 기록이
// 부풀려지던 것(서버는 peoplePerson 을 부를 때마다 people.view 를 남긴다 · 2026-09-29 최종 검토)
let opening = false;

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

// 정렬 표시 — 지금 정렬이면 ▲(오름)/▼(내림), 아니면 옅은 ⇅. 자리는 늘 같은 폭(1em)이라 옮겨 가도 열 폭이 안 흔들린다.
const markHtml = (key) => {
  const m = sortMark(state, key);
  return `<span class="pp-sort-a${m.on ? "" : " off"}" aria-hidden="true">${m.text}</span>`;
};
// 표 머리 — 정렬되는 칸은 <th> 안의 단추(가족 보기 중에는 글자만). 지금 정렬 머리에 aria-sort.
const thHtml = (label, key) => {
  if (!key || state.household) return `<th>${label}</th>`;
  const on = state.sort === key;
  const aria = on ? ` aria-sort="${state.dir === "asc" ? "ascending" : "descending"}"` : "";
  return `<th class="pp-th-sort"${aria}><button type="button" class="pp-sort-h${on ? " on" : ""}" data-act="sort" data-sort="${key}">` +
    `${label}${markHtml(key)}</button></th>`;
};
const tableHtml = (rows) => `<table class="pp-table"><thead><tr>${thHtml("사진")}${thHtml("이름(직분)", "name")}` +
  `${thHtml("성별·나이", "age")}${thHtml("소속", "aff")}${thHtml("구분", "kind2")}${thHtml("연락처")}</tr></thead><tbody>` +
  rows.map((p) => `<tr class="pp-row" data-id="${esc(p.person_id)}" role="button" tabindex="0"><td>${photoHtml(p, "pp-ph sm")}</td>` +
    `<td>${relHtml(p)}<b>${esc(p.name)}</b>${posHtml(p)}</td><td>${esc(ageText(p))}</td><td>${esc(affText(p))}</td>` +
    `<td>${esc(p.kind2 || "")}</td><td>${telHtml(p.phone1)}</td></tr>`).join("") + `</tbody></table>`;

// 폰(카드) — 목록 위 「정렬」 칩 줄. 지금 것은 채운 칩 + ▲/▼
const sortBarHtml = () => `<span class="pp-sortbar-l" id="pp-sortbar-l">정렬</span>` +
  SORTS.map(([k, l]) => {
    const on = state.sort === k, how = on ? (state.dir === "asc" ? " 오름차순" : " 내림차순") : "";
    return `<button type="button" class="pp-sort-c${on ? " on" : ""}" data-act="sort" data-sort="${k}" aria-pressed="${on}"` +
      ` aria-label="${l}${how}">${l}${on ? markHtml(k) : ""}</button>`;
  }).join("");

// 「여러 개 고르기」 — 단추(라벨 · 고른 요약 · ▾) + 그 아래 판(체크박스 목록 · 인원 수 · 모두 해제)
const pickHtml = (key, label) => {
  const on = state[key], list = choices[key] || [];
  const opts = list.length ? list.map(([v, n]) => `<label class="pp-opt"><input type="checkbox" value="${esc(v)}"` +
    `${on.includes(v) ? " checked" : ""}><span class="pp-opt-t">${esc(v)}</span>` +
    `<small class="pp-opt-n">${esc(Number(n || 0).toLocaleString("ko-KR"))}</small></label>`).join("")
    : `<p class="muted pp-pan-none">고를 것이 없어요</p>`;
  return `<div class="pp-pick" data-pick="${key}">
    <button type="button" class="pp-pick-b${on.length ? " on" : ""}" data-act="pick" aria-expanded="false" aria-controls="pp-pan-${key}">
      <span class="pp-pick-l">${label}</span><span class="pp-pick-v">${esc(pickSummary(on))}</span>
      <span class="pp-pick-a" aria-hidden="true"></span></button>
    <div class="pp-pan" id="pp-pan-${key}" role="group" aria-label="${label} 여러 개 고르기" hidden>
      <div class="pp-pan-top"><span class="muted">여러 개 고를 수 있어요</span>
        <button type="button" class="pp-pan-clear" data-act="clear"${on.length ? "" : " disabled"}>모두 해제</button></div>
      <div class="pp-pan-list">${opts}</div>
    </div></div>`;
};

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
// back — 창을 닫으면 초점을 돌려줄 줄(창이 뜨면 초점은 「닫기」 단추로 간다).
async function openPerson(call, id, onFamily, back) {
  if (opening) return;
  opening = true;
  let handedOff = false;                // 가족으로 넘어가면 opening·초점은 그쪽 호출이 맡는다(아래)
  try {
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
    const okBtn = dlg.querySelector('[data-v="1"]');
    okBtn.focus();                        // 초점이 줄에 남으면 Enter 한 번에 같은 분 창이 또 뜬다
    dlg.addEventListener("click", (e) => {
      const f = e.target.closest("[data-fam]"), all = e.target.closest("[data-fam-all]");
      if (!f && !all) return;
      handedOff = true;
      okBtn.click();                                                // 이 창을 닫고
      opening = false;                                              // 다음 창(가족)은 새로 연다
      if (f) openPerson(call, f.dataset.fam, onFamily, back);
      else onFamily(Number(all.dataset.famAll), p.household_head || "");
    });
    await closed;
    if (!handedOff && back && back.isConnected) back.focus();
  } finally {
    // 가족으로 넘어갔으면(handedOff) 다음 호출이 opening 을 이미 다시 세웠다 — 여기서 덮어쓰면 안 된다.
    // 그 밖의 모든 경로(응답 실패·중간 예외·정상 닫힘)는 여기서 반드시 푼다.
    if (!handedOff) opening = false;
  }
}

export async function render(el, { call, query }) {
  // 현황의 「사진 없는 분 N명」 — 옛 찾기 조건(검색어·교구·가족 보기)을 버리고 사진 없음 하나로(현황의 수와 같게)
  if (query && query.nophoto === "1") state = { ...blank(), noPhoto: true };
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  if (!choices) {
    const st = await call("peopleStats");
    if (!st.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(st))}</p>`; return; }
    if (!st.source) { el.innerHTML = TITLE + `<p class="empty">${esc(sourceLine(null).text)}</p>`; return; }
    choices = filterChoices(st.stats);
  }
  el.innerHTML = TITLE + `<p class="pp-src muted"></p><p class="pp-famon" hidden></p>
    <form class="pp-form" autocomplete="off">
      <input type="search" class="search" name="q" placeholder="🔍 이름 또는 전화 뒷자리 4개" aria-label="찾기">
      <div class="pp-filters">${PICKS.map(([k, l]) => pickHtml(k, l)).join("")}
        <button type="button" class="pp-nophoto" data-act="nophoto-off" hidden
          aria-label="사진 없는 분만 보는 중 — 눌러서 풀기"><span class="pp-np-i" aria-hidden="true">📷</span> 사진 없는 분만 <span class="pp-np-x" aria-hidden="true">✕</span></button></div>
      <div class="acts"><button type="submit" class="btn primary">찾기</button>
        <button type="button" class="btn" data-act="csv">⬇️ 내려받기</button></div>
    </form>
    <p class="muted pp-sum"></p><div class="pp-sortbar" role="group" aria-labelledby="pp-sortbar-l" hidden></div><div class="pp-list"></div>
    <div class="acts pp-pager" hidden><button type="button" class="btn" data-act="prev">← 앞</button>
      <button type="button" class="btn" data-act="next">다음 →</button></div>`;
  const form = el.querySelector(".pp-form");
  form.q.value = state.q;
  let last = null;
  let lastSent = null;   // 마지막으로 찾은 조건 — 내려받기는 이것 그대로(판에서 고르는 중인 것이 섞이지 않게)
  // 이 화면을 다시 열 때마다 새로 만든다 — 리스너도 옛 객체와 함께 버려지게(status.js 와 같은 방식)
  const mqWide = matchMedia("(min-width:1024px)");

  // 「찾기」 — 검색어는 칸에서 읽고, 거르기는 판에서 고른 그대로(state). 가족 보기는 끝난다.
  const readForm = () => {
    state.q = form.q.value.trim();
    state.household = null;
    state.householdName = "";
  };
  const search = () => { readForm(); state.page = 0; return load(); };

  // ── 여러 개 고르기 판 ── 한 번에 하나만 열린다
  let openKey = null, openSnap = [];
  const boxOf = (k) => el.querySelector(`.pp-pick[data-pick="${k}"]`);
  function syncPick(key) {
    const box = boxOf(key), on = state[key];
    box.querySelector(".pp-pick-b").classList.toggle("on", on.length > 0);
    box.querySelector(".pp-pick-v").textContent = pickSummary(on);
    box.querySelectorAll(".pp-pan input[type=checkbox]").forEach((x) => { x.checked = on.includes(x.value); });
    box.querySelector(".pp-pan-clear").disabled = !on.length;   // 고른 것이 없으면 「모두 해제」는 누를 것이 없다
  }
  const syncFilters = () => {
    FILTER_KEYS.forEach(syncPick);
    el.querySelector(".pp-nophoto").hidden = !state.noPhoto;
  };
  function openPick(key) {
    const box = boxOf(key);
    box.classList.add("open");
    box.querySelector(".pp-pan").hidden = false;
    box.querySelector(".pp-pick-b").setAttribute("aria-expanded", "true");
    openKey = key;
    openSnap = [...state[key]];
  }
  // 닫는다 — 고른 것이 바뀌었으면(run 이 참일 때) 곧바로 1쪽부터 다시 찾는다. 바뀌었는지를 돌려준다.
  function closePick({ focus = false, run = true } = {}) {
    if (!openKey) return false;
    const key = openKey, box = boxOf(key);
    openKey = null;
    box.classList.remove("open");
    box.querySelector(".pp-pan").hidden = true;
    const b = box.querySelector(".pp-pick-b");
    b.setAttribute("aria-expanded", "false");
    if (focus) b.focus();
    const changed = !sameSet(openSnap, state[key]);
    if (changed && run) search();
    return changed;
  }

  // 가족 보기 — 다른 조건은 모두 비우고 세대주 교인ID 하나로 찾는다. 정렬은 남겨 둔다(가족 보기가 끝나면 원래 정렬로).
  const showFamily = (hid, headName) => {
    closePick({ run: false });
    state = { ...blank(), household: hid, householdName: headName, sort: state.sort, dir: state.dir };
    form.q.value = "";
    syncFilters();
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
    const bar = el.querySelector(".pp-sortbar");     // 폰에서만 · 가족 보기 중에는 감춘다 · 찾은 분이 있을 때만
    bar.hidden = mqWide.matches || !!state.household || !shown.length;
    bar.innerHTML = bar.hidden ? "" : sortBarHtml();
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
    // 사본 — 기다리는 동안 판에서 고친 것이 섞이지 않게. 가족 보기는 가족 차례로 그리므로 서버 정렬은 기본으로(기록도 깨끗이)
    const sent = searchPayload(state.household ? { ...state, sort: "name", dir: "asc" } : state);
    const r = await busy(el, () => call("peopleSearch", sent));
    if (!r.ok) {
      // 실패한 조건의 옛 명수·가족 보기 줄·앞/다음 단추가 그대로 남으면 사실과 다르다 — 함께 지운다.
      // 기준일 줄(.pp-src)은 그대로 둔다 — 명부 자체는 실패와 무관하다.
      last = null;
      lastSent = null;
      el.querySelector(".pp-list").innerHTML = `<p class="empty">${esc(errorText(r))}</p>`;
      el.querySelector(".pp-sum").textContent = "";
      el.querySelector(".pp-famon").hidden = true;
      el.querySelector(".pp-pager").hidden = true;
      el.querySelector(".pp-sortbar").hidden = true;
      FILTER_KEYS.forEach(syncPick);   // busy 가 되살린 「모두 해제」 잠금을 다시 맞춘다
      return;
    }
    last = r;
    lastSent = sent;
    const src = sourceLine(r.source, new Date().toISOString().slice(0, 10));
    const srcEl = el.querySelector(".pp-src");
    srcEl.textContent = src.text;
    srcEl.classList.toggle("stale", src.stale);
    draw();   // busy 가 단추를 되살린 뒤 — 앞/다음의 잠금은 여기서 다시 정한다
    FILTER_KEYS.forEach(syncPick);   // 「모두 해제」 잠금도(기다리는 동안 고른 것이 바뀌었을 수 있다)
  }

  async function exportCsv() {
    if (!last || !last.total || !lastSent) { toast("내려받을 분이 없어요 — 먼저 찾아 주세요"); return; }
    const yes = await dialog({ title: "⬇️ 명단 내려받기", ok: `${last.total}명 받기`, cancel: "그만두기",
      html: `지금 조건으로 찾은 <b>${last.total.toLocaleString("ko-KR")}명</b>을 엑셀(CSV)로 받습니다.<br>받은 기록이 남아요 — 누가 · 언제 · 몇 명.` });
    if (!yes) return;
    const r = await busy(el, () => call("peopleExport", searchPayload({ ...lastSent, page: 0 })));
    draw();
    FILTER_KEYS.forEach(syncPick);
    if (!r.ok) { toast(errorText(r)); return; }
    download(csvText(r.rows), exportName(r.source, r.rows.length));
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); closePick({ run: false }); search(); });
  el.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;   // 전화 걸기는 그대로
    const b = e.target.closest("button[data-act]");
    if (b) {
      if (b.disabled) return;            // 판이 닫히며 다시 찾는 중(busy)이면 이 누름은 흘려보낸다
      const act = b.dataset.act;
      if (act === "pick") {
        const key = b.closest(".pp-pick").dataset.pick;
        const again = openKey === key;
        closePick();
        if (!again) openPick(key);
      }
      if (act === "clear") { const key = b.closest(".pp-pick").dataset.pick; state[key] = []; syncPick(key); }
      if (act === "nophoto-off") { closePick({ run: false }); state.noPhoto = false; syncFilters(); search(); }
      if (act === "prev" && state.page > 0) { state.page--; load(); }
      if (act === "next") { state.page++; load(); }
      if (act === "csv") exportCsv();
      if (act === "famoff") { state.household = null; state.householdName = ""; state.page = 0; load(); }
      if (act === "sort") {
        // 조건은 마지막으로 찾은 그대로(칸에 고쳐 적은 검색어는 「찾기」를 눌러야 들어간다) — 정렬만 바꿔 1쪽부터
        const key = b.dataset.sort;
        Object.assign(state, nextSort(state, key));
        state.page = 0;
        load().then(() => el.querySelector(`[data-act="sort"][data-sort="${key}"]`)?.focus());   // 다시 그린 뒤 초점을 그 자리로
      }
      return;
    }
    const row = e.target.closest("[data-id]");
    if (row) openPerson(call, row.dataset.id, showFamily, row);
  });
  // 체크박스 — 고른 것은 곧바로 state 에(요약 글자도). 찾기는 판이 닫힐 때 한 번.
  el.addEventListener("change", (e) => {
    const cb = e.target.closest(".pp-pan input[type=checkbox]");
    if (!cb) return;
    const key = cb.closest(".pp-pick").dataset.pick;
    state[key] = [...cb.closest(".pp-pan").querySelectorAll("input[type=checkbox]:checked")].map((x) => x.value);
    syncPick(key);
  });
  // Tab 으로 판 밖으로 나가면 닫는다(초점이 어디로 가는지 모를 때 — 누른 자리가 초점을 못 받는 경우 — 는 두고 본다)
  el.addEventListener("focusout", (e) => {
    if (!openKey) return;
    const to = e.relatedTarget;
    if (to instanceof Element && !boxOf(openKey).contains(to)) closePick();
  });
  // role=button 이라 Enter 와 Space 둘 다 받는다(Space 는 화면이 내려가지 않게 막는다)
  el.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-id]")) {
      e.preventDefault();
      openPerson(call, e.target.dataset.id, showFamily, e.target);
    }
  });
  // 판 바깥을 누르거나 Esc — 닫는다. 이 화면이 사라지면 스스로 뗀다(status.js 와 같은 방식).
  // 판이 닫히며 다시 찾았으면 그 누름은 삼킨다 — 앞/다음·내려받기·줄이 옛 목록에 대고 한 번 더 돌지 않게.
  // 「찾기」를 눌렀으면 조용히 닫고(찾기가 곧 찾는다) 누름은 그대로 보낸다 — 두 번 찾지 않게.
  const detach = () => {
    document.removeEventListener("click", onDoc, true);
    document.removeEventListener("keydown", onKey);
    mqWide.removeEventListener("change", onMq);
  };
  const onDoc = (e) => {
    if (!el.isConnected) return detach();
    if (!openKey || !(e.target instanceof Element) || e.target.closest(`.pp-pick[data-pick="${openKey}"]`)) return;
    const submit = e.target.closest('button[type="submit"]');
    const changed = closePick({ run: !submit });
    if (changed && !submit && !e.target.closest(".pp-pick")) { e.preventDefault(); e.stopPropagation(); }
  };
  const onKey = (e) => {
    if (!el.isConnected) return detach();
    if (e.key === "Escape" && openKey) { e.preventDefault(); closePick({ focus: true }); }
  };
  // 폭이 바뀌면 카드↔표
  const onMq = () => { if (!el.isConnected) return detach(); draw(); };
  document.addEventListener("click", onDoc, true);
  document.addEventListener("keydown", onKey);
  mqWide.addEventListener("change", onMq);
  syncFilters();
  load();
}
