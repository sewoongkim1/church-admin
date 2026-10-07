// 📅 당번 명단 — 당번 고르기 · 날짜 칩(날짜가 넷 이상이면 달력 — roster-cal.js) · 그날 판(확정·쉬는 날·메모) · 자리마다 선 분(넣기·빼기·옮기기·메모) · 자리 틀 · 날짜 더하기 · 쉬는 기간 · 엑셀
//   (봉사 당번 1단계 · 2026-10-06 · 설계 v2 docs/superpowers/specs/2026-10-06-duty-roster-design.md §6)
//   서버: dutyBoardList·dutyRoster·dutyBoardSave·dutyLineSave·dutyLineRemove·dutyDateAdd·dutyDaySet·dutyDaysOff·dutySlotSet·dutySlotDelete·
//         dutySignAdd·dutySignRemove·dutySignMove·dutySignNote·dutyAskClear·dutyPeopleLookup·dutyExport
//   역할 duty(당번 총괄 — 모든 당번) · dutylead(당번 담당 — 맡은 당번만). 당번 고르기는 dutyBoardList 가 준 목록 그대로
//   (서버가 담당에게는 맡은 당번만 준다 · scope "assigned"). 맡지 않은 당번은 서버가 not-assigned 로 막는다 — 여기서 숨기는 것은 편의일 뿐.
//   말·차례·단추는 duty-logic.js(시험). 정원·겹침·잠금·쉼은 SQL 함수 한 곳 — 화면은 서버가 준 판정(locked·need·asks·cutoff)을 그대로 쓴다.
// ⚠️ 고르기는 picker.js(pickOne)만 — 시스템 select·date·time 칸 금지. 서버 글자는 모두 esc. 응답에 계정 번호·교인ID 는 없다.
// ⚠️ 같은 단추·같은 줄은 일이 끝날 때까지 다시 받지 않는다(pending) — 두 번 누름이 「빼기 두 번」이 되지 않게.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import { loadXlsx } from "../../core/xlsx.js";
import { openBoardForm } from "./board-form.js";
import { emptyWhy, seenOfRoster, calUse, calStep, olderPick, olderText, revealBy } from "./duty-logic.js";
import { calHtml } from "./roster-cal.js";
import { openLineForm, openDateAddForm, openOffForm, offFlow, openAddForm, openNoteForm, openDayNoteForm, openCapacityForm, failText, sayDone } from "./roster-forms.js";
import {
  boardRest, contactHtml, maxBack, lineText, lineSavedText, lineRemovedText, boardSavedText, initialDay, dayChip, dayStateText, dayActions, dayLabel, addDays, slotName, timeRange,
  slotCount, signupBadges, askText, endedText, moveOptions, forceAsk, needsForce, confirmDayAsk, unconfirmAsk, removeAsk, restoreAsk, restoredText, slotOffAsk,
  movedText, dateAddedText, dayHiddenText, draftNote, appNote, STALE_BOARD, notifyBadges, confirmDoneText,
  offDoneText, notifyTail, needsReload, lostBoard, exportFileName, exportRanges, EMPTY_ASSIGNED, EMPTY_ALL,
} from "./duty-logic.js";

const TITLE = `<h2 class="page-title">📅 당번 명단</h2>`;
const LOADING = `<p class="empty">불러오는 중…</p>`;
const TABS = [["roster", "명단"], ["lines", "자리 틀"]];
const BACK_STEP = 28;   // 「지난 날 더 보기」 한 번에 4주(52주까지 — duty-logic.js maxBack)
const STATE_NOTE = {
  closed: "지원 멈춤 — 앱에 당번표와 내 당번은 보이지만 새 지원은 받지 않아요. 담당자가 「넣기」로 넣어요.",
  archived: "보관한 당번이에요 — 볼 수만 있어요(당번 총괄이 🧰 당번 관리에서 상태를 바꾸면 다시 고칠 수 있어요).",
};

let lastBoardId = "", lastDay = "";   // 메뉴를 나갔다 와도 보던 당번·날짜를 기억(모듈 안)

// ---------- 그리기(글만) ----------
//   notify = 이 당번의 줄에 「알림 꺼짐」 딱지를 그릴까(받는 중·지원 멈춤 당번일 때만 — duty-logic.js notifyBadges)
function signupRow(e, ro, notify) {
  const badges = signupBadges(e, { notify }).map((b) => `<span class="badge${b.cls ? " " + b.cls : ""}"${b.title ? ` title="${esc(b.title)}"` : ""}>${esc(b.text)}</span>`).join(" ");
  const ask = askText(e);
  return `<div class="dty-row${e.asked ? " ask" : ""}" data-sid="${esc(e.id)}">
    <div class="dty-who"><b>${esc(e.name)}</b>${e.who ? `<span class="muted">${esc(e.who)}</span>` : ""}${badges}</div>
    ${ask ? `<div class="dty-ask"><span>${esc(ask)}</span>${ro ? "" : `<button type="button" class="btn" data-op="askclear">표시 거두기</button>`}</div>` : ""}
    ${e.note ? `<div class="dty-memo">메모: ${esc(e.note)}</div>` : ""}
    ${ro ? "" : `<div class="dty-acts"><button type="button" class="btn" data-op="note">메모</button>
      <button type="button" class="btn" data-op="move">옮기기</button>
      <button type="button" class="btn danger" data-op="remove">빼기</button></div>`}
  </div>`;
}
// 빠진 분 한 줄 — 「다시 넣기」로 그 줄을 그대로 되살린다(잘못 뺐을 때 · 보관한 당번에는 단추 없음)
const endedRow = (e, ro) => `<div class="dty-ended" data-eid="${esc(e.id)}"><span><b>${esc(e.name)}</b>${e.who ? ` <span class="muted">${esc(e.who)}</span>` : ""} <span class="muted">· ${esc(endedText(e))}</span></span>${
  ro ? "" : `<button type="button" class="btn" data-op="restore">다시 넣기</button>`}</div>`;

function slotHtml(s, d, ro, openFold, notify) {
  const c = slotCount(s), off = d.off || s.off;
  const cnt = s.off ? `<span class="dty-cnt off">쉼</span>` : `<span class="dty-cnt${d.off ? " off" : c.over ? " over" : c.need ? " need" : ""}">${esc(c.text)}</span>`;
  const rows = (s.signups || []).map((e) => signupRow(e, ro, notify)).join("");
  const ended = s.ended || [];
  return `<section class="dty-slot${off ? " off" : ""}" data-slot="${esc(s.id)}">
    <div class="dty-slot-h"><div class="dty-slot-t"><b>${esc(slotName(s))}</b><span class="muted">${esc(timeRange(s))}</span></div>${cnt}</div>
    ${s.leftover ? `<p class="dty-left">남은 자리예요(뺀 틀이거나 요일을 바꾼 틀) — 앱에서 새 지원은 받지 않아요. 선 분을 옮기거나 그대로 두세요.</p>` : ""}
    ${rows || `<p class="dty-none">${d.off ? "쉬는 날이에요" : s.off ? "쉬는 자리예요" : "아직 지원한 분이 없어요"}</p>`}
    ${ro ? "" : `<div class="dty-slot-acts">${off ? "" : `<button type="button" class="btn" data-sop="add">＋ 넣기</button>`}
      <button type="button" class="btn" data-sop="menu" aria-haspopup="dialog">자리 설정</button></div>`}
    ${ended.length ? `<details class="dty-fold" data-fold="${esc(s.id)}" ${openFold ? "open" : ""}><summary>빠진 분 ${ended.length}명</summary>${ended.map((e) => endedRow(e, ro || off)).join("")}</details>` : ""}
  </section>`;
}

function chipHtml(d, on, today) {
  const c = dayChip(d, today);
  return `<button type="button" class="dty-chipd ${c.kind}${c.today ? " today" : ""}${on ? " on" : ""}" data-day="${esc(c.date)}" aria-pressed="${on}">
    <b>${c.today ? "오늘 " : ""}${esc(c.label)}</b><i>${c.lock ? "🔒 " : ""}${esc(c.tag)}</i></button>`;
}

// ---------- 화면 ----------
export async function render(el, { call, query }) {
  el.classList.add("dty-page");   // PC 에서 읽기 좋은 폭(css .dty-page)
  el.innerHTML = TITLE + LOADING;
  let boards = [], scope = "all", today = "";
  let cur = null;        // 고른 당번(목록 줄)
  let ros = null;        // dutyRoster 답 { chief, today, from, to, board, lines, days, staff }
  let day = "";          // 고른 날짜
  let tab = "roster";
  let back = 14;         // 지난 며칠까지 불러왔나
  const pending = new Set();
  const folds = new Set();   // 「빠진 분」을 펼쳐 둔 자리
  let calFocus = "";         // 달력을 눌러 다시 그리면 눌렀던 단추가 사라진다 — 그린 뒤 초점을 돌려줄 곳("day" · "prev" · "next")

  const loadBoards = async () => {
    const r = await call("dutyBoardList", {});
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(failText(r))}</p>`; return false; }
    boards = r.boards || [];
    scope = r.scope === "assigned" ? "assigned" : "all";
    today = r.today || "";
    return true;
  };
  // 당번 b 의 명단을 불러와 cur·ros 로 — 실패하면 아무것도 바꾸지 않는다(보던 당번이 그대로 남는다)
  //   → { ok:true } · { ok:false, gone:"당번을 놓을 까닭" } · { ok:false, error }
  const loadRoster = async (b, wantDay = day) => {
    // 끝(to)은 보내지 않는다 — 서버가 앞날(가장 먼 날짜 줄까지 · 오늘 + 400일)과 지난 날을 따로 자른다
    const r = await call("dutyRoster", { board_id: b.id, ...(today ? { from: addDays(today, -back) } : {}) });
    if (!r.ok && r.error === "not-found") return { ok: false, gone: "그 당번을 찾지 못했어요" };
    if (!r.ok && lostBoard(r.error)) return { ok: false, gone: failText(r), lost: true };   // 그사이 맡은 당번에서 빠졌다
    if (!r.ok) return { ok: false, error: r };
    cur = b; ros = r; today = r.today || today;
    day = initialDay(r.days, today, wantDay);
    lastBoardId = b.id; lastDay = day;
    return { ok: true };
  };
  const drop = () => { cur = null; ros = null; day = ""; lastBoardId = ""; lastDay = ""; };
  // 고른 당번이 풀린 뒤(없어졌다 · 맡은 당번에서 빠졌다) — 남은 당번이 하나뿐이면 그 당번을 바로 연다(고르기 단추만 남아 막히지 않게)
  const openOnly = async () => {
    if (cur || boards.length !== 1) return;
    const r = await loadRoster(boards[0], "");
    if (!r.ok) drop();
  };
  // 명단만 다시(저장 뒤 · 서버가 거절한 뒤) — 당번이 없어졌거나 맡은 당번에서 빠졌으면 목록부터
  //   → 새 명단을 그렸으면 true(못 불러왔거나 당번이 풀렸으면 false — 그 까닭은 여기서 말한다)
  const reload = async (wantDay = day) => {
    if (!cur) return false;
    const r = await loadRoster(cur, wantDay);
    if (r.gone) { toast(r.gone); drop(); if (await loadBoards()) { await openOnly(); draw(); } return false; }
    if (!r.ok) { toast(failText(r.error)); return false; }
    draw();
    return true;
  };
  // 당번 목록까지 다시(당번 설정을 바꾼 뒤 — 이름·상태가 고르기 단추에 보인다)
  const reloadAll = async () => {
    if (!(await loadBoards())) return;
    const again = cur && boards.find((b) => b.id === cur.id);
    if (!again) { drop(); await openOnly(); draw(); return; }
    const r = await loadRoster(again);
    if (!r.ok) { if (r.gone) toast(r.gone); else toast(failText(r.error)); if (r.gone) { drop(); await openOnly(); } }
    draw();
  };
  // 서버 답 뒤처리 — 성공이면 말하고 다시 그린다 · 거절이면 말하고(상태가 달라졌으면) 다시 불러온다. → 성공 여부
  const settle = async (r, okText, wantDay) => {
    if (r && r.ok) { if (okText) await sayDone(okText, r); await busy(el, () => reload(wantDay)); return true; }
    toast(failText(r));
    if (lostBoard(r?.error)) await busy(el, reloadAll);
    else if (needsReload(r?.error)) await busy(el, () => reload(wantDay));
    return false;
  };

  // ---------- 그리기 ----------
  // 고르기 단추 — 당번이 하나뿐이고 그것을 보고 있을 때만 잠근다(고른 당번이 없으면 늘 누를 수 있다)
  const boardBtn = () => `<div class="dty-pick"><button type="button" class="btn wide dty-board" data-act="board" aria-haspopup="dialog"${cur && boards.length <= 1 ? " disabled" : ""}>${
    cur ? esc(`${ros ? ros.board.title : cur.title} · ${ros ? ros.board.statusLabel : cur.statusLabel}`) : "당번 고르기"}</button></div>`;
  const tabsHtml = () => `<div class="tabs dty-tabs" role="tablist">${TABS.map(([v, t]) =>
    `<button type="button" role="tab" data-tab="${v}" aria-selected="${tab === v}"${tab === v ? ' class="on"' : ""}>${t}${v === "lines" && ros ? ` <em>${ros.lines.filter((l) => l.active).length}</em>` : ""}</button>`).join("")}</div>`;

  const linesHtml = (ro) => {
    const live = ros.lines.filter((l) => l.active);
    return `<p class="be-note">자리 틀 하나가 매주 같은 요일의 자리를 만들어요. 이름·시각을 고치면 그 틀의 모든 날짜에 바로 보이고, 정원은 「앞날 자리도 함께」를 켜면 앞날 자리까지 바뀌어요.</p>
      ${live.length ? live.map((l) => `<div class="card dty-line" data-line="${esc(l.id)}">
        <div class="dty-line-t"><b>${esc(slotName(l))}</b><span class="muted">${esc(lineText(l).replace(` · ${slotName(l)}`, ""))}</span></div>
        ${ro ? "" : `<div class="dty-acts"><button type="button" class="btn" data-lact="edit">고치기</button><button type="button" class="btn danger" data-lact="remove">빼기</button></div>`}
      </div>`).join("") : `<p class="empty">자리 틀이 아직 없어요 — 아래 단추로 먼저 넣어 주세요<br>(예: 매주 주일 · 2부 · 설거지 · 11:30~12:30 · 2명)</p>`}
      ${ro ? "" : `<button type="button" class="btn primary wide" data-lact="new">＋ 자리 틀 더하기</button>`}`;
  };

  const dayHtml = (d, ro) => {
    const acts = ro ? [] : dayActions(d, { archived: false });
    return `<div class="dty-bar"><b>${esc(dayLabel(d.date))}${d.date === today ? " · 오늘" : ""}</b><span>${esc(dayStateText(d))}</span>
        ${dayHiddenText(d) ? `<span${d.afterUntil ? ' class="dty-warn"' : ""}>${esc(dayHiddenText(d))}</span>` : ""}</div>
      ${acts.length ? `<div class="acts dty-dayacts">${acts.map((a) => `<button type="button" class="btn${a.danger ? " danger" : ""}" data-dact="${a.act}">${esc(a.label)}</button>`).join("")}</div>` : ""}
      ${(d.slots || []).length ? d.slots.map((s) => slotHtml(s, d, ro, folds.has(String(s.id)), notifyBadges(ros.board.status))).join("")
        : `<p class="empty">이 날은 자리가 없어요${ro ? "" : " — 「날짜 더하기」로 자리를 만들 수 있어요"}</p>`}`;
  };

  const rosterHtml = (ro) => {
    const days = ros.days || [];
    const d = days.find((x) => x.date === day) || null;
    const tools = `<div class="dty-tools">${ro ? "" : `<button type="button" class="btn" data-act="date-add">＋ 날짜 더하기</button>
        <button type="button" class="btn" data-act="off-range">😴 쉬는 기간</button>`}
      <button type="button" class="btn" data-act="export">⬇ 엑셀</button>
      ${ro ? "" : `<button type="button" class="btn" data-act="settings">⚙️ 당번 설정</button>`}</div>`;
    const older = back < maxBack();   // 지난 날을 더 불러올 수 있나(52주까지)
    if (!days.length) {
      // 날짜가 하나도 없어도 지난 날은 더 불러올 수 있다 — 끝난 한 번짜리 모집(김장 등)의 명단을 여기서 다시 본다
      const live = ros.lines.some((l) => l.active);
      return tools + `<p class="empty">${live ? "이 기간에는 자리가 없어요 — 「날짜 더하기」로 자리를 만들어 주세요" : "자리 틀이 아직 없어요 — 위 「자리 틀」에서 먼저 넣어 주세요"}</p>` +
        (older ? `<button type="button" class="btn wide" data-act="older">◀ 지난 날 더 보기</button>` : "");
    }
    const panel = d ? dayHtml(d, ro) : `<p class="empty">날짜를 골라 주세요</p>`;
    // 날짜가 넷 이상이면 달력으로 고른다(친구 요청 2026-10-07 — 성도님 앱과 같은 꼴 · PC 는 달력 옆에 그날 판) · 적으면 칩 줄 그대로(한두 번짜리 모집)
    if (calUse(days)) return tools + `<div class="dty-split">${calHtml(days, day, today, { older })}<div class="dty-day">${panel}</div></div>`;
    const chips = `<div class="dty-chips-d" role="group" aria-label="날짜">${older ? `<button type="button" class="dty-chipd more" data-act="older"><b>◀ 지난 날</b><i>더 보기</i></button>` : ""}${
      days.map((x) => chipHtml(x, x.date === day, today)).join("")}</div>`;
    return tools + chips + panel;
  };
  // 달력에서 날짜를 누른 뒤 — 그날 판(.dty-day)이 화면 아래에 가려 있으면 보일 만큼만 굴린다(얼마나는 duty-logic.js revealBy · PC 는 달력 옆이라 0)
  const revealDay = () => {
    const p = el.querySelector(".dty-day");
    if (!p || !p.getBoundingClientRect) return;
    const by = revealBy(p.getBoundingClientRect().top, window.innerHeight);
    if (!by) return;
    const calm = !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try { window.scrollBy({ top: by, behavior: calm ? "auto" : "smooth" }); } catch { window.scrollBy(0, by); }   // 옛 브라우저는 숫자 둘만 받는다
  };

  const draw = () => {
    const want = calFocus; calFocus = "";   // 어느 길로 끝나든 한 번만 쓴다(다음 그리기로 넘어가 엉뚱한 때 초점이 튀지 않게)
    if (!boards.length) { el.innerHTML = TITLE + `<p class="empty">${esc(scope === "assigned" ? EMPTY_ASSIGNED : EMPTY_ALL)}</p>`; return; }
    if (!cur || !ros) { el.innerHTML = TITLE + boardBtn() + `<p class="empty">당번을 골라 주세요</p>`; return; }
    const b = ros.board, ro = b.status === "archived";
    const note = ro || b.status === "draft" ? "" : appNote(ros.appOpen === true);   // 준비 중 당번은 준비 중 안내 하나만(누구에게도 안 보인다)
    // 받는 중·지원 멈춤인데 앱에서 지원할 날짜가 없는 까닭(틀 없음 · 남은 자리만 · 끝 날짜 지남 · 보이는 기간 밖 · 날짜 없음) — 앱과 같은 범위로 센다(seenOfRoster)
    const emptyNow = emptyWhy(b.status, seenOfRoster(ros, today));
    el.innerHTML = TITLE + boardBtn() +
      `<p class="muted dty-info">${b.place ? `📍 ${esc(b.place)} · ` : ""}${b.contact ? `📞 ${contactHtml(b.contact)} · ` : ""}${esc(boardRest(b))}</p>` +
      (note ? `<p class="be-note">${esc(note)}</p>` : "") +
      (b.status === "draft" ? `<p class="be-note">${esc(draftNote(ros.chief === true))}</p>` : STATE_NOTE[b.status] ? `<p class="be-note">${esc(STATE_NOTE[b.status])}</p>` : "") +
      (emptyNow ? `<p class="be-note dty-warn" role="status">⚠️ ${esc(emptyNow)}</p>` : "") +
      tabsHtml() + (tab === "lines" ? linesHtml(ro) : rosterHtml(ro));
    // 고른 날짜 칩이 칩 줄 가운데 오게 — 칩 줄만 옆으로 굴린다(scrollIntoView 는 화면까지 위로 끌어올린다 — 줄을 뺀 뒤 화면이 튀던 것)
    const on = el.querySelector(".dty-chipd.on"), rowEl = el.querySelector(".dty-chips-d");
    if (on && rowEl && on.getBoundingClientRect) {
      rowEl.scrollLeft += on.getBoundingClientRect().left - rowEl.getBoundingClientRect().left - (rowEl.clientWidth - on.offsetWidth) / 2;
    }
    // 달력을 눌러 다시 그렸으면 초점을 돌려준다 — 눌렀던 단추는 innerHTML 과 함께 사라졌다(자판·화면 낭독으로 쓰는 분의 자리가 맨 위로 튕기지 않게).
    //   앞뒤 달 단추는 같은 쪽 단추로(그쪽에 더 갈 달이 없어 단추가 사라졌으면 고른 날로) · 날짜는 고른 날로. 화면은 굴리지 않는다(preventScroll).
    const f = !want ? null : (want === "day" ? null : el.querySelector(`.dty-cal-nav.${want === "next" ? "r" : "l"}`)) || el.querySelector(".dty-cal-c.on");
    if (f && f.focus) f.focus({ preventScroll: true });
  };

  // ---------- 처음 ----------
  if (!(await loadBoards())) return;
  const want = (query && query.b) || lastBoardId;
  const firstBoard = boards.find((b) => b.id === want) || (boards.length === 1 ? boards[0] : null);   // 당번이 하나뿐이면 고르기를 건너뛴다
  if (firstBoard) {
    const r = await loadRoster(firstBoard, lastBoardId === firstBoard.id ? lastDay : "");
    if (r.gone) drop();
    else if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(failText(r.error))}</p>`; return; }
  }
  draw();

  el.addEventListener("toggle", (e) => {
    const f = e.target.closest && e.target.closest("[data-fold]");
    if (f) { if (f.open) folds.add(f.dataset.fold); else folds.delete(f.dataset.fold); }
  }, true);

  // ---------- 엑셀 ----------
  async function exportXlsx(anchor) {
    const ranges = exportRanges(today, ros.board.openDays);
    const got = await pickOne({ anchor, title: "내려받을 기간", options: ranges.map((x) => ({ value: x.value, label: x.label })), value: "" });
    const g = ranges.find((x) => x.value === got);
    if (!g) return;
    const r = await busy(el, () => call("dutyExport", { board_id: cur.id, from: g.from, to: g.to }));
    if (!r.ok) { toast(failText(r)); if (lostBoard(r.error)) await busy(el, reloadAll); return; }
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.table), "당번표");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.list), "명단");
      XLSX.writeFile(wb, exportFileName(r.title, today));
    } catch { toast("엑셀 파일을 만들지 못했어요"); }
  }

  // ---------- 그날 ----------
  async function dayAct(act, d) {
    if (act === "confirm") {
      const yes = await dialog({ title: "🔒 이 날 확정", text: confirmDayAsk(d, ros.board.status), ok: "확정", cancel: "그만두기" });
      if (!yes) return;
      const r = await busy(el, () => call("dutyDaySet", { board_id: cur.id, date: d.date, op: "confirm" }));
      await settle(r, r.ok ? confirmDoneText(r, d.date, ros.board.status) : "");
    } else if (act === "unconfirm") {
      const yes = await dialog({ title: "확정 풀기", text: unconfirmAsk(d), ok: "확정 풀기", cancel: "그만두기", danger: true });
      if (!yes) return;
      const r = await busy(el, () => call("dutyDaySet", { board_id: cur.id, date: d.date, op: "unconfirm" }));
      await settle(r, r.ok ? (r.already ? "확정한 날이 아니에요" : "확정을 풀었어요") : "");
    } else if (act === "off") {
      const got = await openOffForm({ call, boardId: cur.id, today, from: d.date, to: d.date, note: d.note || "" });
      if (got) { await sayDone(offDoneText(got.r, got.off), got.r); await busy(el, () => reload()); }
    } else if (act === "reopen") {
      // 쉬는 까닭으로 적어 둔 메모는 다시 열 때 함께 지운다 — 지운다는 것을 확인 글에 적는다(메모가 없으면 건드리지 않는다)
      const g = await offFlow({ call, boardId: cur.id, from: d.date, to: d.date, off: false, ...(d.note ? { note: "", tail: `적어 둔 메모(「${d.note}」)도 함께 지워요.` } : {}) });
      if (g.ok) { await sayDone(offDoneText(g.r, false), g.r); await busy(el, () => reload()); }
      else if (g.error) await settle(g.error, "");
    } else if (act === "note") {
      if (await openDayNoteForm({ call, boardId: cur.id, day: d })) { toast("메모를 저장했어요"); await busy(el, () => reload()); }
    }
  }

  // ---------- 자리 ----------
  async function slotMenu(anchor, d, s) {
    const n = (s.signups || []).length;
    const opts = [{ value: "cap", label: "정원 바꾸기", hint: `지금 ${s.capacity}명` },
      s.off ? { value: "on", label: "이 자리 다시 열기" } : { value: "off", label: "이 자리만 쉬기", hint: "이 날 이 자리만" },
      { value: "del", label: "자리 지우기", hint: "잘못 더한 날짜의 빈 자리만" }];
    const got = await pickOne({ anchor, title: `${slotName(s)} ${s.start}`, options: opts, value: "" });
    if (got === "cap") {
      const v = await openCapacityForm({ call, day: d, slot: s });
      if (v != null) { toast(`정원을 ${v}명으로 바꿨어요`); await busy(el, () => reload()); }
    } else if (got === "off" || got === "on") {
      const off = got === "off";
      const yes = await dialog({ title: off ? "이 자리만 쉬기" : "이 자리 다시 열기", text: slotOffAsk(s, off), ok: off ? "쉬기" : "다시 열기", cancel: "그만두기", danger: off });
      if (!yes) return;
      const r = await busy(el, () => call("dutySlotSet", { slot_id: s.id, off, ...(off && n ? { expect: n } : {}) }));
      await settle(r, r.ok ? `${off ? "이 자리를 쉬게 했어요" : "이 자리를 다시 열었어요"}${notifyTail(r)}` : "");
    } else if (got === "del") {
      const yes = await dialog({ title: "자리 지우기", text: `${dayLabel(d.date)} ${slotName(s)} 자리를 지울까요? 지원한 분이 한 번도 없던 자리만 지울 수 있어요.`, ok: "지우기", cancel: "그만두기", danger: true });
      if (!yes) return;
      const r = await busy(el, () => call("dutySlotDelete", { slot_id: s.id }));
      await settle(r, "자리를 지웠어요");
    }
  }

  // ---------- 지원 줄 ----------
  async function rowOp(op, anchor, d, s, e) {
    if (op === "note") {
      if (await openNoteForm({ call, e })) { toast("메모를 저장했어요"); await busy(el, () => reload()); }
    } else if (op === "remove") {
      const yes = await dialog({ title: `빼기 — ${e.name}`, text: removeAsk(e, d, s), ok: "빼기", cancel: "그만두기", danger: true });
      if (!yes) return;
      const r = await busy(el, () => call("dutySignRemove", { id: e.id }));
      await settle(r, r.ok ? `${e.name} — 뺐어요${notifyTail(r)}` : "");
    } else if (op === "restore") {
      const yes = await dialog({ title: `다시 넣기 — ${e.name}`, text: restoreAsk(e, d, s), ok: "다시 넣기", cancel: "그만두기" });
      if (!yes) return;
      let r = await busy(el, () => call("dutySignRestore", { id: e.id }));
      if (needsForce(r)) {
        const ok2 = await dialog({ title: "그래도 넣을까요?", text: forceAsk(r, "넣을까요"), ok: "넣기", cancel: "그만두기" });
        if (!ok2) return;
        r = await busy(el, () => call("dutySignRestore", { id: e.id, force: true }));
      }
      await settle(r, r.ok ? restoredText(r, e.name) : "");
    } else if (op === "askclear") {
      const yes = await dialog({ title: "표시 거두기", text: `${e.name} 님의 「못 가게 됐어요」 표시를 거둘까요? 줄은 그대로 두고 표시만 지워요(통화해 보니 오시기로 한 경우).`, ok: "표시 거두기", cancel: "그만두기" });
      if (!yes) return;
      const r = await busy(el, () => call("dutyAskClear", { id: e.id }));
      await settle(r, "표시를 거뒀어요");
    } else if (op === "move") {
      const opts = moveOptions(ros.days, s.id, d.date);
      if (!opts.length) { toast("옮길 수 있는 다른 자리가 없어요"); return; }
      const got = await pickOne({ anchor, title: `${e.name} — 어디로 옮길까요?`, options: opts, value: "", wrap: true });
      if (got === null || got === "") return;
      const to = Number(got), target = opts.find((o) => o.value === got);
      let r = await busy(el, () => call("dutySignMove", { id: e.id, to_slot: to }));
      if (needsForce(r)) {
        const yes = await dialog({ title: "그래도 옮길까요?", text: forceAsk(r, "옮길까요"), ok: "옮기기", cancel: "그만두기" });
        if (!yes) return;
        r = await busy(el, () => call("dutySignMove", { id: e.id, to_slot: to, force: true }));
      }
      await settle(r, r.ok ? movedText(r, e.name) : "", target ? target.date : day);
    }
  }

  // ---------- 자리 틀 ----------
  async function lineAct(act, line) {
    if (act === "new" || act === "edit") {
      const got = await openLineForm({ call, boardId: cur.id, line: act === "edit" ? line : null });
      if (got === "gone") { toast("그사이 바뀌었어요 — 새로 불러올게요"); await busy(el, reloadAll); }
      else if (got) { toast(lineSavedText(got.r, got.created)); await busy(el, () => reload()); }
    } else if (act === "remove" && line) {
      const yes = await dialog({ title: `자리 틀 빼기 — ${slotName(line)}`,
        text: `「${lineText(line)}」 틀을 뺄까요? 앞날의 빈 자리는 지우고, 지원한 분이 있는 자리와 지난 자리는 남겨요.`, ok: "빼기", cancel: "그만두기", danger: true });
      if (!yes) return;
      const r = await busy(el, () => call("dutyLineRemove", { id: line.id }));
      await settle(r, r.ok ? lineRemovedText(r) : "");
    }
  }

  // ---------- 누름 ----------
  const once = async (key, fn) => {
    if (pending.has(key)) return;
    pending.add(key);
    try { await fn(); } finally { pending.delete(key); }
  };
  el.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-tab]");
    if (t) { if (tab !== t.dataset.tab) { tab = t.dataset.tab; draw(); } return; }
    // 달력의 앞뒤 달 단추 — 그 달에서 고를 날(오늘 이후 첫 날 → 마지막 날)로 간다. 서버를 부르지 않는다(가진 명단으로 다시 그린다).
    const mon = ev.target.closest("button[data-cal]");
    if (mon) {
      const to = ros ? calStep(ros.days, day, mon.dataset.cal, today) : "";
      if (to) { day = to; lastDay = day; calFocus = mon.dataset.cal === "next" ? "next" : "prev"; draw(); }
      return;
    }
    const chip = ev.target.closest("[data-day]");
    if (chip) {
      const inCal = !!chip.classList && chip.classList.contains("dty-cal-c");
      if (day !== chip.dataset.day) { day = chip.dataset.day; lastDay = day; if (inCal) calFocus = "day"; draw(); }
      if (inCal) revealDay();   // 폰: 그날 판이 달력 아래에 가려 있으면 보일 만큼만 굴린다(이미 고른 날을 다시 눌러도)
      return;
    }

    const a = ev.target.closest("button[data-act]");
    if (a) {
      const act = a.dataset.act;
      if (act === "board") {
        const got = await pickOne({ anchor: a, title: "당번", value: cur ? cur.id : "",
          options: boards.map((b) => ({ value: b.id, label: b.title, hint: b.statusLabel })) });
        if (got === null || (cur && got === cur.id)) return;
        const next = boards.find((b) => b.id === got);
        if (!next) return;
        back = 14; folds.clear();
        const r = await busy(el, () => loadRoster(next, ""));   // 실패하면 보던 당번이 그대로 남는다
        if (r.gone) { toast(r.gone); if (r.lost) await busy(el, reloadAll); return; }
        if (!r.ok) { toast(failText(r.error)); return; }
        tab = "roster"; draw();
        return;
      }
      if (!cur || !ros) return;
      await once(act, async () => {
        if (act === "older") {
          // 지난 날을 4주 더 — 달력에서 눌렀으면 보던 달에 새 날짜가 없을 때 새로 생긴 앞 달로 간다(olderPick) · 새 날짜가 없으면 그렇다고 말한다(olderText).
          const before = (ros.days || []).map((x) => x.date), was = back, inCal = !!a.classList && a.classList.contains("dty-cal-nav");
          back = Math.min(maxBack(), back + BACK_STEP);
          if (inCal) calFocus = "prev";
          const ok = await busy(el, () => reload());
          calFocus = "";
          if (!ok || !ros) { back = was; return; }   // 못 불러왔다(까닭은 reload 가 말했다) — 「더 지난 날짜가 없어요」라고 하지 않는다 · 다음에 같은 만큼 다시
          const to = inCal ? olderPick(before, ros.days, day, today) : day;
          if (to !== day) { day = to; lastDay = day; calFocus = "prev"; draw(); }
          toast(olderText(before, ros.days, back, today));
        }
        else if (act === "export") await exportXlsx(a);
        else if (act === "date-add") {
          const live = ros.lines.filter((l) => l.active);
          if (!live.length) { toast("자리 틀을 먼저 넣어 주세요 — 위 「자리 틀」에서요"); return; }
          const got = await openDateAddForm({ call, boardId: cur.id, lines: live, today, untilDate: ros.board.untilDate || "" });
          if (got) {
            toast(dateAddedText(got.r, got.date));
            if (got.date < addDays(today, -back)) back = Math.min(maxBack(), Math.max(back, 35));   // 지난 날짜를 더했으면 그날까지 불러온다
            await busy(el, () => reload(got.date));
          }
        } else if (act === "off-range") {
          const got = await openOffForm({ call, boardId: cur.id, today });
          if (got) { await sayDone(offDoneText(got.r, got.off), got.r); await busy(el, () => reload()); }
        } else if (act === "settings") {
          const got = await openBoardForm({ call, board: { ...ros.board, staff: ros.staff, lines: ros.lines }, chief: ros.chief === true, appOpen: ros.appOpen === true, seen: seenOfRoster(ros, today) });
          if (got === "gone") { toast("그사이 바뀌었어요 — 새로 불러올게요"); await busy(el, reloadAll); }
          else if (got === "stale") { toast(STALE_BOARD); await busy(el, reloadAll); }
          else if (got) { toast(got.staffErr || boardSavedText(got, false)); await busy(el, reloadAll); }
        }
      });
      return;
    }
    if (!cur || !ros) return;

    const la = ev.target.closest("button[data-lact]");
    if (la) {
      const card = la.closest("[data-line]");
      const line = card ? ros.lines.find((l) => String(l.id) === card.dataset.line) : null;
      await once("line" + (card ? card.dataset.line : "new"), () => lineAct(la.dataset.lact, line));
      return;
    }
    const d = (ros.days || []).find((x) => x.date === day);
    if (!d) return;
    const da = ev.target.closest("button[data-dact]");
    if (da) { await once("day" + da.dataset.dact, () => dayAct(da.dataset.dact, d)); return; }

    const sec = ev.target.closest("[data-slot]");
    const s = sec ? (d.slots || []).find((x) => String(x.id) === sec.dataset.slot) : null;
    if (!s) return;
    const so = ev.target.closest("button[data-sop]");
    if (so) {
      await once("slot" + s.id, async () => {
        if (so.dataset.sop === "add") { if (await openAddForm({ call, boardId: cur.id, day: d, slot: s })) await busy(el, () => reload()); }
        else await slotMenu(so, d, s);
      });
      return;
    }
    const ro = ev.target.closest("button[data-op]");
    if (!ro) return;
    // 살아 있는 줄(data-sid) 또는 빠진 분 줄(data-eid — 「다시 넣기」만)
    const rowEl = ev.target.closest("[data-sid]"), endEl = ev.target.closest("[data-eid]");
    const e = rowEl ? (s.signups || []).find((x) => String(x.id) === rowEl.dataset.sid)
      : endEl && ro.dataset.op === "restore" ? (s.ended || []).find((x) => String(x.id) === endEl.dataset.eid) : null;
    if (e) await once("row" + e.id, () => rowOp(ro.dataset.op, ro, d, s, e));
  });
}

