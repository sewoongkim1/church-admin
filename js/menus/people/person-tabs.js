// 교인명부 「자세히」 창의 탭 손잡이(DOM · 2026-10-01) — 그리는 글은 person-history.js(순수), 창은 search.js openPerson.
// 설계: v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §4
// ⚠️ 창 위에 창을 띄우지 않는다 — 「풀기」 확인은 그 줄 안에서(「연결을 끊을까요? 예 · 아니요 · 이분 아님」). 알림은 toast 만.
// ⚠️ 「아직 안 이어진 기록」은 사역·성경필사 탭을 처음 열 때 한 번 부른다(peopleHistory — 이름으로 넓게 찾아 느리다 · 기록 없음).
//    잇기·풀기 뒤에는 서버가 돌려준 history 로 다시 그리고, 불러 둔 목록은 다시 부른다(그 줄이 옮겨 갔다).
// ⚠️ 「이분 아님」으로 둔 기록(link_how='none')은 「아직 안 이어진 기록」과 **따로** 접고 펼친다(open[tab] 과
//    open[`${tab}Notme`] 가 서로 다른 값 — 2026-10-01 친구 결정 · person-history.js unlinkedHtml).
// ⚠️ 창이 닫힌 뒤 답이 오면 그리지 않는다(dlg.isConnected).
// ⚠️ 이 파일은 Node 시험이 (person-popup.js → search.js 를 거쳐) 불러 본다 — 맨 위에서 document·window 를 만지지 않는다.
import { toast, busy, errorText } from "../../core/ui.js";
import { HIST_TABS, tabOf, tabsHtml, histPanelHtml, rowKey, linkDoneText } from "./person-history.js";

let lastTab = "church";
// 마지막 「자세히」 창이 보던 탭 — 가족으로 넘어갈 때 그대로 연다(search.js 가 다시 내보내고 person-popup.js 가 쓴다).
// 가족 칩은 교적 칸 안에 있어 지금은 늘 「교적」이 넘어간다 — 칩이 다른 칸에도 생기면 그대로 산다.
export const detailTab = () => lastTab;

export function bindPersonTabs({ dlg, call, personId, history, tab }) {
  const main = dlg && dlg.querySelector(".pd-main");
  if (!main || !history || !main.querySelector(".pd-tabs")) return;
  const s = { tab: tabOf(tab), history, confirm: null, unlinked: { state: "idle", open: { ministry: false, bible: false }, rows: [] } };
  lastTab = s.tab;
  const ui = () => ({ confirm: s.confirm, unlinked: s.unlinked });

  function draw(focusSel) {
    main.querySelector(".pd-tabs").outerHTML = tabsHtml(s.history, s.tab);
    for (const [k] of HIST_TABS) {
      const p = main.querySelector(`[data-pd-panel="${k}"]`);
      if (!p) continue;
      if (k !== "church") p.innerHTML = histPanelHtml(k, s.history, ui());
      if (k === s.tab) p.removeAttribute("data-off"); else p.setAttribute("data-off", "");
    }
    if (focusSel) main.querySelector(focusSel)?.focus({ preventScroll: true });
  }
  async function loadUnlinked(force = false) {
    if (!force && s.unlinked.state !== "idle" && s.unlinked.state !== "error") return;
    s.unlinked = { ...s.unlinked, state: "loading" };
    draw();
    const r = await call("peopleHistory", { id: personId });
    if (!dlg.isConnected) return;
    s.unlinked = r && r.ok ? { ...s.unlinked, state: "ready", rows: Array.isArray(r.rows) ? r.rows : [] } : { ...s.unlinked, state: "error" };
    draw();
  }
  function show(k, focus) {
    s.tab = tabOf(k);
    lastTab = s.tab;
    s.confirm = null;
    draw(focus ? `[data-pd-tab="${s.tab}"]` : null);
    if (s.tab !== "church") loadUnlinked();
  }
  async function link(kind, row, how) {
    const r = await busy(main, () => call("peopleLink", { kind, row: Number(row), person: personId, how }));
    if (!dlg.isConnected) return;
    if (!r || !r.ok) { toast(errorText(r)); return; }
    if (r.history) s.history = r.history;   // 없으면(서버가 탭 자료 다시 읽기에 실패 · 쓰기는 됐다) 옛 탭 그대로 — 알림이 「다시 열면」을 덧붙인다
    const again = how === "auto" && r.relinked;
    s.confirm = again ? { key: rowKey(kind, row), relinked: true } : null;
    toast(linkDoneText(how, r));
    if (s.unlinked.state === "ready" || s.unlinked.state === "error") await loadUnlinked(true);
    else draw();
    main.querySelector(again ? `[data-pd-panel="${s.tab}"] .pd-hc button` : `[data-pd-tab="${s.tab}"]`)?.focus({ preventScroll: true });
  }

  main.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target : null;
    const tb = el?.closest("[data-pd-tab]");
    if (tb && main.contains(tb)) { if (!tb.disabled) show(tb.dataset.pdTab, false); return; }
    const b = el?.closest("button[data-pd-act]");
    if (!b || !main.contains(b) || b.disabled) return;
    const act = b.dataset.pdAct, kind = b.dataset.kind || "", row = b.dataset.row || "";
    if (act === "more") { s.unlinked.open[s.tab] = !s.unlinked.open[s.tab]; draw(`[data-pd-panel="${s.tab}"] .pd-un-b`); return; }
    if (act === "more-notme") {
      const k = `${s.tab}Notme`;
      s.unlinked.open[k] = !s.unlinked.open[k];
      draw(`[data-pd-panel="${s.tab}"] [data-pd-act="more-notme"]`);
      return;
    }
    if (act === "unlinked-retry") { loadUnlinked(true); return; }
    if (act === "unlink") { s.confirm = { key: rowKey(kind, row), relinked: false }; draw(`[data-pd-panel="${s.tab}"] .pd-hc button`); return; }
    if (act === "unlink-no") { s.confirm = null; draw(`[data-pd-tab="${s.tab}"]`); return; }
    if (act === "unlink-yes") { link(kind, row, "auto"); return; }
    if (act === "notme") { link(kind, row, "none"); return; }
    if (act === "link") link(kind, row, "manual");
  });
  // 탭 줄 — ←·→·Home·End 로 옮기며 연다(WAI-ARIA 탭 · 자동 활성)
  main.addEventListener("keydown", (e) => {
    const tb = e.target instanceof Element ? e.target.closest("[data-pd-tab]") : null;
    if (!tb) return;
    const keys = HIST_TABS.map(([k]) => k), i = keys.indexOf(tb.dataset.pdTab);
    const j = e.key === "ArrowRight" ? (i + 1) % keys.length : e.key === "ArrowLeft" ? (i + keys.length - 1) % keys.length
      : e.key === "Home" ? 0 : e.key === "End" ? keys.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    show(keys[j], true);
  });
  if (s.tab !== "church") loadUnlinked();
}
