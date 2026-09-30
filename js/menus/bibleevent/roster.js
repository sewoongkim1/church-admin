// 📋 회차·명단 — 성경필사(암송) 이벤트: 회차를 고르고 완서자 명단을 보고·고치고·더하고·빼고·내려받는다.
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §3 「📋 회차·명단」.
// 순수 논리 roster-logic.js · HTML 조각 roster-ui.js · 입력 창 event-form.js·row-form.js(모두 js/core/modal.js 위).
// ⚠️ 브라우저·시스템 창을 띄우지 않는다 — 고르기는 picker.js(pickOne·pickMany), 확인은 ui.js dialog, 입력은 openForm.
// ⚠️ 고른 회차는 주소 ?ev=<id> — 새로고침·뒤로 가기에도 같은 회차. (code·error·type 같은 이름은 로그인 값과 겹쳐 쓰지 않는다)
// ⚠️ 명단은 열 때마다 새로 받는다(여러 담당자가 서로 옛 화면을 보지 않게). 거르기만 같은 회차 안에서 남는다.
// ⚠️ 쓰기는 모두 입력 창 안에서 — 창이 스스로 단추를 잠근다(busy() 는 body 에 붙은 창을 잠그지 않는다).
// ⚠️ 내려받기는 **화면에 보이는 줄 그대로**(거르기·찾기·묶음 차례) — 메모는 싣지 않는다.
import { esc, toast, dialog, errorText } from "../../core/ui.js";
import { pickOne, pickMany } from "../../core/picker.js";
import { CHURCH_LEGEND, hasChurch } from "../people/church-badge.js";
import { CHURCH_STATES, SRC_LABEL, blankFilter, groupRows, filterRows, dupFlags, positionCounts, csvText, sortEvents }
  from "./roster-logic.js";
import { TITLE, ELIG_LINE, CHURCH_LABEL, chipsHtml, headHtml, settingsHtml, sourceHtml, filtersHtml, sumHtml, listHtml, rowMenuOptions }
  from "./roster-ui.js";
import { openEventForm } from "./event-form.js";
import { openRowForm, openRowDelete } from "./row-form.js";
// 이름을 누르면 교적 창(Task 16)
import { openChurchPerson } from "./person-popup.js";
import { personPayload } from "./person-logic.js";

let f = blankFilter();   // 거르기 — 같은 회차면 메뉴를 옮겨 다녀도 남는다
let fFor = "";           // f 가 어느 회차의 거르기인가
let setOpen = false;     // ⚙️ 회차 설정 — 처음엔 접어 둔다
let unbindMq = null;     // 앞 화면이 건 matchMedia change 떼기 — 다음 그리기가 부른다(FE-3)

const stamp = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

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

const failHtml = (what, r) => TITLE + `<p class="empty">${esc(what)} — ${esc(errorText(r))}</p>`;

function renderEmpty(el, { call, go }) {
  el.innerHTML = TITLE + `<p class="empty">아직 만든 회차가 없어요</p>
    <div class="adm-acts"><button type="button" class="btn primary" data-act="new">＋ 새 회차</button></div>`;
  el.querySelector('[data-act="new"]').addEventListener("click", async () => {
    const made = await openEventForm({ call, ev: null });
    if (made && el.isConnected) go(`be-roster?ev=${encodeURIComponent(made.id)}`);
  });
}

export async function render(el, ctx) {
  const { call, go, query } = ctx;
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const want = String((query && query.ev) || "");
  const [evs, asked] = await Promise.all([
    call("evEvents"),
    want ? call("evRoster", { event_id: want }) : Promise.resolve(null),
  ]);
  if (!el.isConnected) return;
  if (!evs.ok) { el.innerHTML = failHtml("회차를 불러오지 못했어요", evs); return; }
  const events = sortEvents(evs.events || []);
  if (!events.length) { renderEmpty(el, ctx); return; }
  let ros = null;
  if (asked && asked.ok) ros = asked;
  else if (asked && asked.error !== "not-found") { el.innerHTML = failHtml("명단을 불러오지 못했어요", asked); return; }
  else if (asked) toast("그 회차를 찾지 못해 가장 최근 회차를 보여 드려요");
  if (!ros) {
    ros = await call("evRoster", { event_id: events[0].id });
    if (!el.isConnected) return;
    if (!ros.ok) { el.innerHTML = failHtml("명단을 불러오지 못했어요", ros); return; }
    // 없는 회차 주소 → 보여 준 회차로(새로고침마다 같은 알림이 뜨지 않게 · upload.js 와 같다 · stale-ev-query)
    // replaceState 라 hashchange 가 안 나고 route 가 다시 그리지 않는다
    if (asked && el.isConnected) history.replaceState(null, "", "#/be-roster?ev=" + encodeURIComponent(ros.event.id));
  }
  const ev = ros.event;
  let rows = ros.rows || [];
  if (fFor !== ev.id) { f = blankFilter(); fFor = ev.id; }
  const chips = events.map((e) => (e.id === ev.id ? ev : e));   // 칩의 숫자·상태는 방금 받은 회차 것으로

  el.innerHTML = `${TITLE}
    <div class="be-evs" role="group" aria-label="회차 고르기"></div>
    <div class="card be-panel">
      <div class="be-head">${headHtml(ev)}</div>
      ${settingsHtml(ev, setOpen)}
      <div class="adm-acts">${ev.hasEligibility ? "" : `<button type="button" class="btn primary" data-act="add">＋ 한 분 더하기</button>`}
        <button type="button" class="btn" data-act="csv">⬇️ 내려받기</button></div>
      <div class="acts be-acts2"><button type="button" class="btn" data-act="reload">↻ 새로 불러오기</button></div>
      ${ev.hasEligibility ? ELIG_LINE : ""}
      ${sourceHtml(ros.source)}
      ${hasChurch(rows) ? CHURCH_LEGEND : ""}
      <div class="be-filters" role="group" aria-label="거르기"></div>
      <input type="search" class="search be-q" placeholder="🔍 이름 · 소속 · 직분" autocomplete="off" aria-label="명단에서 찾기">
      <p class="muted be-sum" aria-live="polite"></p>
      <div class="be-list"></div>
    </div>`;
  const q = el.querySelector(".be-q");
  q.value = f.q;
  const list = el.querySelector(".be-list");
  const mqWide = matchMedia("(min-width:1024px)");   // PC 는 표, 폰은 카드
  const find = (id) => rows.find((x) => String(x.id) === String(id));

  const draw = () => {
    ev.count = rows.length;
    el.querySelector(".be-evs").innerHTML = chipsHtml(chips, ev.id);
    const groups = groupRows(filterRows(rows, f));
    const dups = dupFlags(rows);   // ⚠️ 명단 **전체**로 — 거르기로 한쪽이 가려져도 표시는 남는다
    const labels = new Map(groupRows(rows).map((g) => [g.key, g.label]));
    el.querySelector(".be-filters").innerHTML = filtersHtml(f, { labels, church: hasChurch(rows) });
    el.querySelector(".be-sum").innerHTML = sumHtml(rows.length, groups.reduce((s, g) => s + g.rows.length, 0), dups.size, f.q);
    list.innerHTML = listHtml(groups, dups, mqWide.matches);
  };

  // 새로 불러오기는 새 <section> 에 — 같은 el 에 다시 그리면 click 처리가 겹쳐 쌓인다
  const reload = () => {
    if (!el.isConnected) return;
    const fresh = document.createElement("section");
    el.replaceWith(fresh);
    render(fresh, { ...ctx, query: { ...(query || {}), ev: ev.id } });
  };
  // 다른 담당자가 먼저 바꿨거나(conflict) 빼거나 회차가 없어졌다(not-found) — 알리고 새로 불러온다
  const stale = async (code) => {
    if (!el.isConnected) return;
    await dialog(code === "not-found"
      ? { title: "이미 없는 줄(회차)이에요", text: "다른 분이 먼저 빼거나 바꿨어요 — 새로 불러올게요", cancel: null }
      : { title: "다른 분이 먼저 바꿨어요", text: "새로 불러올게요", cancel: null });
    reload();
  };
  const refocus = (sel) => { const b = el.querySelector(sel); if (b) b.focus({ preventScroll: true }); };

  async function editEvent() {
    const saved = await openEventForm({ call, ev, onStale: stale });
    if (!saved || !el.isConnected) return;
    toast(!ev.listedNow && saved.listedNow ? "👁 이 회차가 이제 성도님께 보여요"
      : ev.listedNow && !saved.listedNow ? "이 회차는 이제 성도님께 안 보여요" : "회차 설정을 저장했어요");
    reload();
  }
  async function newEvent() {
    const made = await openEventForm({ call, ev: null });
    if (!made || !el.isConnected) return;
    toast(`「${made.title}」 회차를 만들었어요 — 「준비 중」이라 성도님께는 아직 안 보여요`);
    setOpen = true;
    go(`be-roster?ev=${encodeURIComponent(made.id)}`);   // 창이 뒤로 가기 칸을 거둔 **뒤**라 주소가 되돌아가지 않는다(modal.js ⑤)
  }
  async function addRow() {
    const r = await openRowForm({ call, ev, row: null, onStale: stale });
    if (!r || !el.isConnected) return;
    rows.push(r);
    draw();
  }
  async function rowMenu(b) {
    const r = find(b.dataset.id);
    if (!r) return;
    const pick = await pickOne({ anchor: b, title: `${r.name}님 줄`, options: rowMenuOptions(r, ev) });
    if (!pick || !el.isConnected) return;
    if (pick === "edit") {
      const u = await openRowForm({ call, ev, row: r, onStale: stale });
      if (!u || !el.isConnected) return;
      Object.assign(r, u);
      draw();
      refocus(`[data-act="row"][data-id="${CSS.escape(String(r.id))}"]`);
    } else if (pick === "del") {
      const d = await openRowDelete({ call, row: r, onStale: stale });
      if (!d || !el.isConnected) return;
      rows = rows.filter((x) => x !== r);
      draw();
      refocus(".be-q");
    }
  }
  function exportCsv() {
    const vis = groupRows(filterRows(rows, f)).flatMap((g) => g.rows);
    if (!vis.length) { toast("내려받을 줄이 없어요"); return; }
    download(csvText(vis), `${ev.id}_명단_${vis.length}명_${stamp()}.csv`);
    toast(`⬇️ 화면에 보이는 ${vis.length}줄을 내려받았어요 (메모는 빼고)`);
  }
  async function pickFilter(b) {
    const k = b.dataset.filter;
    if (k === "group") {
      const opts = groupRows(rows).map((g) => ({ value: g.key, label: g.label, hint: `${g.rows.length}명` }));
      const v = await pickMany({ anchor: b, title: "교구·부서로 거르기", options: opts, values: f.groups });
      if (v === null || !el.isConnected) return;
      f.groups = v.length === opts.length ? [] : v;   // 다 고르면 곧 전체
    } else if (k === "pos") {
      const opts = positionCounts(rows).map(([p, n]) => ({ value: p, label: p || "직분 없음", hint: `${n}명` }));
      const v = await pickMany({ anchor: b, title: "직분으로 거르기", options: opts, values: f.positions });
      if (v === null || !el.isConnected) return;
      f.positions = v.length === opts.length ? [] : v;
    } else if (k === "church") {
      const v = await pickOne({ anchor: b, title: "교적 표시로 거르기", value: f.church,
        options: [{ value: "", label: "전체" }, ...CHURCH_STATES.map((s) => ({ value: s, label: CHURCH_LABEL[s] }))] });
      if (v === null || !el.isConnected) return;
      f.church = v;
    } else if (k === "src") {
      const v = await pickOne({ anchor: b, title: "출처로 거르기", value: f.source, options: [{ value: "", label: "전체" },
        { value: "app", label: SRC_LABEL.app, hint: "성도님이 앱에서 낸 신청" },
        { value: "import", label: SRC_LABEL.import, hint: "옛 명단에서 옮겼거나 담당자가 더한 줄" }] });
      if (v === null || !el.isConnected) return;
      f.source = v;
    } else return;
    draw();
    refocus(`[data-filter="${k}"]`);
  }

  el.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-ev]");
    if (chip) {
      if (chip.dataset.ev !== ev.id) go(`be-roster?ev=${encodeURIComponent(chip.dataset.ev)}`);
      return;
    }
    const fb = e.target.closest("[data-filter]");
    if (fb) { pickFilter(fb); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "new") newEvent();
    else if (act === "set") editEvent();
    else if (act === "add") addRow();
    else if (act === "row") rowMenu(b);
    else if (act === "person") openChurchPerson({ call, ...personPayload(b.dataset), anchor: b });   // 이름 → 교적 창(Task 16)
    else if (act === "csv") exportCsv();
    else if (act === "reload") reload();
    else if (act === "clear") { f = blankFilter(); q.value = ""; draw(); }
  });
  q.addEventListener("input", () => { f.q = q.value; draw(); });
  // <details> 의 toggle 은 거품이 일지 않는다 — 잡는 단계(capture)에서 받는다
  el.addEventListener("toggle", (e) => {
    if (e.target instanceof Element && e.target.matches("details.be-set")) setOpen = e.target.open;
  }, true);
  // 창 폭이 1024px 을 넘나들면 표↔카드 — 다음 그리기(↻ 새로 불러오기·회차 바꾸기·메뉴 다시 열기)가 앞 화면의 것을 뗀다(FE-3).
  // 이 화면이 사라진 뒤 다음 그리기 전에 change 가 오면 스스로도 떨어진다.
  const unbind = () => { mqWide.removeEventListener("change", onMq); if (unbindMq === unbind) unbindMq = null; };
  const onMq = () => { if (!el.isConnected) { unbind(); return; } draw(); };
  unbindMq?.(); unbindMq = unbind; mqWide.addEventListener("change", onMq);
  draw();
}
