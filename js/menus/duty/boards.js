// 🧰 당번 관리 — 당번 카드(상태 · 자리 틀 요약 · 담당자 · 수) · 만들기·고치기 · 담당자 지정 (봉사 당번 1단계 · 2026-10-06)
//   서버: dutyBoardList·dutyBoardSave·dutyStaffCandidates·dutyStaffSet (역할 duty = 당번 총괄). 규칙·말은 duty-logic.js(시험).
//   자리 틀·날짜·명단은 「📅 당번 명단」에서 — 카드의 「명단 열기」가 그 당번으로 바로 간다(duty-roster?b=당번).
//   당번 담당(dutylead)은 이 메뉴가 보이지 않는다(registry.js role duty) — 막는 것은 서버(dutyStaff* 는 총괄만 · 만들기·이름은 chief-only).
// ⚠️ 서버 글자는 모두 esc. 문의의 전화번호는 눌러서 걸리게(숫자만 tel: 로).
import { esc, toast, busy, errorText } from "../../core/ui.js";
import { STALE_MARK } from "../education/courses-logic.js";
import { openBoardForm } from "./board-form.js";
import { linesSummary, boardSavedText, boardRest, contactHtml, dutyWord, appNote, STALE_BOARD, emptyChip, liveLineCount } from "./duty-logic.js";

const TITLE = `<h2 class="page-title">🧰 당번 관리</h2>`;
const failText = (r) => dutyWord(r?.error) || errorText(r);

const row = (k, v) => `<div class="dty-kv"><span class="dty-k">${k}</span><span class="dty-v">${v}</span></div>`;
const chip = (text, warn) => `<span class="dty-chip${warn ? " warn" : ""}">${esc(text)}</span>`;
const staffHtml = (b) => ((b.staff || []).length
  ? b.staff.map((x) => (x.stale ? `<span class="ec-stale">${esc(x.name)}${esc(STALE_MARK)}</span>` : esc(x.name))).join(", ") : "없음");

export function boardCard(b) {
  const n = b.counts || {};
  const empty = emptyChip(b.status, liveLineCount(b.lines), n.slots);   // 받는 중·지원 멈춤인데 앱에 날짜가 하나도 안 보이는 당번
  return `<div class="card dty-card" data-id="${esc(b.id)}">
    <div class="dty-head"><b>${esc(b.title)}</b> <span class="badge${b.status === "open" ? " ok" : ""}">${esc(b.statusLabel)}</span></div>
    <div class="dty-kvs">
      ${row("자리", esc(linesSummary(b.lines)))}
      ${row("담당", staffHtml(b))}
      ${b.place ? row("장소", esc(b.place)) : ""}${b.contact ? row("문의", contactHtml(b.contact)) : ""}
      ${row("기간", esc(boardRest(b)))}
    </div>
    ${empty ? `<div class="dty-chips">${chip(empty, true)}</div>` : ""}
    ${n.lines ? `<div class="dty-chips">${chip(`앞날 자리 ${n.slots || 0}`)}${chip(`빈 자리 ${n.need || 0}`, b.status === "open" && n.need > 0)}${
      n.asks ? chip(`못 온다는 분 ${n.asks}`, true) : ""}${n.after ? chip(`끝 날짜 뒤에 선 분 ${n.after}`, true) : ""}</div>` : ""}
    <div class="acts"><button type="button" class="btn" data-act="edit">고치기</button>
      <button type="button" class="btn" data-act="roster">명단 열기</button></div>
  </div>`;
}

export async function render(el, { call, go }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let boards = [];
  let cands = [];       // 담당자 후보(dutyStaffCandidates) — 못 불러왔으면 null(폼의 담당자 칸을 잠근다 · 목록은 그대로)
  let showOld = false;  // 보관한 당번 펼침
  let appOpen = false;  // 봉사 당번이 성도님 앱에 열렸는가(서버가 준다)

  const load = async () => {
    const [r, c] = await Promise.all([call("dutyBoardList", {}), call("dutyStaffCandidates", {})]);
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(failText(r))}</p>`; return false; }
    boards = r.boards || [];
    appOpen = r.appOpen === true;
    cands = c && c.ok ? c.members || [] : null;
    return true;
  };
  const draw = () => {
    const live = boards.filter((b) => b.status !== "archived"), old = boards.filter((b) => b.status === "archived");
    const note = appNote(appOpen);
    el.innerHTML = TITLE + (note ? `<p class="be-note">${esc(note)}</p>` : "") +
      `<div class="acts dty-top"><button type="button" class="btn primary" data-act="new">＋ 새 당번</button></div>
      <div class="dty-list">${live.length ? live.map(boardCard).join("")
        : `<p class="empty">아직 당번이 없어요 — 「＋ 새 당번」으로 만들어 주세요<br>(예: 식당 봉사 · 주차 봉사 · 김장 봉사)</p>`}</div>
      ${old.length ? `<details class="dty-old" data-old ${showOld ? "open" : ""}><summary>보관한 당번 ${old.length}개</summary>
        <div class="dty-list">${old.map(boardCard).join("")}</div></details>` : ""}`;
  };
  const reload = async () => { if (await load()) draw(); };

  if (!(await load())) return;
  draw();

  el.addEventListener("toggle", (e) => { if (e.target.matches("[data-old]")) showOld = e.target.open; }, true);
  const open = new Set();   // 열려 있는 창(두 번 누름 막기)
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const card = b.closest("[data-id]");
    const board = card ? boards.find((x) => x.id === card.dataset.id) : null;
    if (act === "roster" && board) { go(`duty-roster?b=${encodeURIComponent(board.id)}`); return; }
    const key = act + (card?.dataset.id || "");
    if (open.has(key)) return;
    open.add(key);
    let done = false;
    try {
      if (act === "new") {
        const got = await openBoardForm({ call, chief: true, cands, appOpen });
        done = !!got;
        if (got && got !== "gone") toast(got.staffErr || boardSavedText(got, true));
      } else if (act === "edit" && board) {
        const got = await openBoardForm({ call, board, chief: true, cands, appOpen });
        done = !!got;
        if (got === "gone") toast("그 당번을 찾지 못해 목록을 새로 불러왔어요");
        else if (got === "stale") toast(STALE_BOARD);
        else if (got) toast(got.staffErr || boardSavedText(got, false));
      }
    } finally { open.delete(key); }
    if (done) await busy(el, reload);
  });
}
