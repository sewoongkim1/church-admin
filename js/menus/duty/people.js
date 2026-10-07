// 👥 봉사자 — 사람별 봉사 이력(2026-10-07 친구 요청 「담당자 쪽에는 "이분의 봉사 이력"을 사람별로 모아 보는 화면」)
//   한 분 한 줄(이름 · 소속 · 그해 · 지금까지 · 마지막 · 앞으로) · 이름으로 찾기 · 차례 · 당번 하나로 좁히기 · 해 · 엑셀 · 누르면 그분의 이력 창(person-window.js).
//   서버: dutyBoardList(당번 고르기) · dutyPeople · dutyPersonHistory · dutyPeopleExport.
//   당번 총괄 = 모든 당번 · 당번 담당 = 맡은 당번 — 사람을 잇는 것도 그 안의 줄만으로(서버 SQL duty_people). 여기서 고르는 것은 그 안에서 좁히기일 뿐이다.
//   말·차례·거르기는 people-logic.js(시험). ⚠️ 서버 글자는 모두 esc · 고르기는 pickOne 만 · 응답에 계정 번호·교인ID 는 없다(사람은 지원 번호로 가리킨다).
//   (독립 검토 반영 2026-10-08) ① 고른 당번·해(memo)는 **불러오기에 성공한 뒤에만** 바꾼다 — 단추의 글과 목록이 어긋나지 않는다(실패하면 보던 것이 그대로)
//   ② 못 불러오면 「다시 불러오기」 단추(같은 메뉴를 다시 눌러도 화면은 다시 그려지지 않는다) ③ 맡은 당번에서 빠졌으면 말한 대로 당번 목록부터 다시 불러온다
//   ④ 선 날도 앞날도 없는 분은 기본으로 숨긴다(찾으면 나온다 · 「함께 보기」) ⑤ 엑셀을 받으면 몇 분인지·무엇을 뺐는지 말한다.
import { esc, toast, busy } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import { loadXlsx } from "../../core/xlsx.js";
import { failText } from "./roster-forms.js";
import { lostBoard, EMPTY_ASSIGNED, EMPTY_ALL } from "./duty-logic.js";
import { openPersonHistory } from "./person-window.js";
import { PEOPLE_SORTS, SPLIT_NOTE, YEAR_TITLE, peopleNote, sortPeople, filterPeople, isIdle, idleNote, countLine, personBadges, yearOptions, yearWord, peopleSum,
  peopleEmpty, peopleFileName, exportDone } from "./people-logic.js";

const TITLE = `<h2 class="page-title">👥 봉사자</h2>`;
const memo = { board: "", year: 0, sort: "served", q: "", idle: false };   // 메뉴를 나갔다 와도 보던 것을 기억(모듈 안) — board·year 는 늘 「지금 보이는 목록」의 것

const badgeHtml = (b) => `<span class="badge"${b.title ? ` title="${esc(b.title)}"` : ""}>${esc(b.text)}</span>`;

export async function render(el, { call }) {
  el.classList.add("dty-page");
  let boards = [], scope = "all", today = "";
  let res = null;        // 마지막으로 성공한 dutyPeople 답 { today, year, people, scope, narrowed, boards }
  let working = false;   // 고르기·불러오기·엑셀·이력 창이 끝날 때까지 다시 받지 않는다

  const boardTitle = () => (memo.board ? (boards.find((b) => b.id === memo.board) || {}).title || "" : "");
  const year = () => memo.year || (res && res.year) || Number(String(today).slice(0, 4));
  const scopeWord = () => (scope === "assigned" ? "맡은 당번 모두" : "모든 당번");
  const bodyOf = (m) => ({ ...(m.board ? { board_id: m.board } : {}), ...(m.year ? { year: m.year } : {}) });

  // 못 불러왔을 때 — 까닭 + 「다시 불러오기」(같은 메뉴를 다시 눌러도 주소가 그대로라 화면이 다시 그려지지 않는다)
  const fail = (msg) => {
    el.innerHTML = TITLE + `<p class="empty">${esc(msg)}</p><div class="acts dpp-retry"><button type="button" class="btn" data-act="retry">다시 불러오기</button></div>`;
  };
  const loadBoards = async () => {
    const r = await call("dutyBoardList", {});
    if (!r.ok) return { ok: false, text: failText(r) };
    boards = r.boards || [];
    scope = r.scope === "assigned" ? "assigned" : "all";
    today = r.today || "";
    if (memo.board && !boards.some((b) => b.id === memo.board)) memo.board = "";
    if (memo.year && !yearOptions(today).includes(memo.year)) memo.year = 0;
    return { ok: true };
  };
  // 사람 목록 — want = { board, year }. 성공해야 res 가 바뀐다(memo 는 부른 쪽이 그때 바꾼다). lost = 그 당번을 더는 볼 수 없다(맡은 당번에서 빠짐 · 없어짐)
  const loadPeople = async (want) => {
    const r = await call("dutyPeople", bodyOf(want));
    if (!r.ok) return { ok: false, text: failText(r), lost: lostBoard(r.error) || (r.error === "not-found" && !!want.board) };
    res = r; today = r.today || today;
    return { ok: true };
  };
  // 처음 · 다시 불러오기 · 맡은 당번이 바뀐 뒤 — 당번 목록부터
  const boot = async () => {
    el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
    const b = await loadBoards();
    if (!b.ok) return fail(b.text);
    if (boards.length) {
      let p = await loadPeople(memo);
      if (!p.ok && p.lost && memo.board) { memo.board = ""; p = await loadPeople(memo); }   // 좁혀 둔 당번이 그사이 사라졌다 — 볼 수 있는 당번 모두로
      if (!p.ok) return fail(p.text);
    }
    draw();
  };
  // 당번·해를 바꾼다 — 불러오기에 성공한 뒤에만 memo 를 바꾸고 그린다. 실패하면 보던 목록·단추 글이 그대로 남는다
  const change = async (want) => {
    const p = await busy(el, () => loadPeople(want));
    if (p.ok) { memo.board = want.board; memo.year = want.year; draw(); return; }
    toast(p.text);
    if (p.lost) await boot();   // 「목록을 새로 불러올게요」 — 말한 대로
  };

  // ---------- 그리기 ----------
  const listHtml = () => {
    const all = (res && res.people) || [], live = all.filter((p) => !isIdle(p)), idle = all.length - live.length;
    const q = memo.q.trim();
    const base = q || memo.idle ? all : live;   // 찾을 때는 숨긴 분까지 본다(이름을 쳤는데 안 나오는 일이 없게)
    const shown = sortPeople(filterPeople(base, q), memo.sort);
    const rows = shown.map((p) => `<button type="button" class="dpp-row" data-pid="${esc(p.id)}">
        <span class="dpp-who"><b>${esc(p.name || "이름 없음")}</b>${p.who ? `<span class="muted">${esc(p.who)}</span>` : ""}${personBadges(p).map(badgeHtml).join(" ")}</span>
        <span class="dpp-cnt">${esc(countLine(p, year(), today))}</span></button>`).join("");
    return `<p class="muted dpp-sum" role="status">${esc(peopleSum(shown.length, base.length))}</p>` +
      (shown.length ? `<div class="dpp-list">${rows}</div>` : `<p class="empty">${esc(peopleEmpty(q, all.length, live.length))}</p>`) +
      (idle && !q ? `<p class="muted dpp-idle"><span>${esc(idleNote(idle, memo.idle))}</span><button type="button" class="btn dpp-idleb" data-act="idle" aria-pressed="${memo.idle ? "true" : "false"}">${
        memo.idle ? "숨기기" : "함께 보기"}</button></p>` : "");
  };
  const draw = () => {
    if (!boards.length) { el.innerHTML = TITLE + `<p class="empty">${esc(scope === "assigned" ? EMPTY_ASSIGNED : EMPTY_ALL)}</p>`; return; }
    const ys = yearOptions(today), sort = PEOPLE_SORTS.find((s) => s.value === memo.sort) || PEOPLE_SORTS[0];
    const bt = memo.board ? boardTitle() : scopeWord();   // 긴 당번 이름은 단추 안에서 말줄임(… · 다 보이는 글은 title)
    el.innerHTML = TITLE +
      `<p class="be-note">${esc(peopleNote(scope, boardTitle()))}</p>` +
      `<div class="dpp-top">${boards.length > 1 ? `<button type="button" class="btn dpp-pick" data-act="board" aria-haspopup="dialog" title="${esc(bt)}"><span class="dpp-pick-t">${
        esc(bt)}</span></button>` : ""}
        ${ys.length > 1 ? `<button type="button" class="btn dpp-pick" data-act="year" aria-haspopup="dialog">${esc(yearWord(year(), today))} 횟수</button>` : ""}
        <button type="button" class="btn dpp-pick" data-act="sort" aria-haspopup="dialog">${esc(sort.label)}</button>
        <button type="button" class="btn" data-act="export">⬇ 엑셀</button></div>` +
      `<input type="search" class="search dpp-q" placeholder="🔍 이름 · 소속" autocomplete="off" aria-label="봉사자 찾기" maxlength="40" value="${esc(memo.q)}">` +
      `<div class="dpp-body">${listHtml()}</div>` +
      `<p class="muted dpp-split">${esc(SPLIT_NOTE)}</p>`;
  };
  const drawList = () => { const b = el.querySelector(".dpp-body"); if (b) b.innerHTML = listHtml(); };

  // ---------- 엑셀 ----------
  async function exportXlsx() {
    const r = await busy(el, () => call("dutyPeopleExport", bodyOf(memo)));
    if (!r.ok) {
      toast(failText(r));
      if (lostBoard(r.error) || (r.error === "not-found" && memo.board)) await boot();
      return;
    }
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.sheet), "봉사자");
      if (Array.isArray(r.info) && r.info.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.info), "안내");   // 범위 · 기준일 · 낱말의 뜻(파일만 받은 분을 위해)
      XLSX.writeFile(wb, peopleFileName(boardTitle(), r.year, r.today || today, scope === "assigned" ? "맡은 당번" : "모든 당번"));
      toast(exportDone(r.count ?? r.sheet.length - 1, { searching: !!memo.q.trim(), hidden: r.hidden || 0 }));
    } catch { toast("엑셀 파일을 만들지 못했어요"); }
  }

  // ---------- 누름(처음 불러오기 **앞에** 단다 — 못 불러온 화면의 「다시 불러오기」도 이 듣기가 받는다) ----------
  el.addEventListener("input", (ev) => {
    if (!ev.target.classList || !ev.target.classList.contains("dpp-q")) return;
    memo.q = ev.target.value;
    drawList();
  });
  el.addEventListener("click", async (ev) => {
    const row = ev.target.closest("button[data-pid]"), a = row ? null : ev.target.closest("button[data-act]");
    if ((!row && !a) || working) return;
    working = true;
    try {
      if (row) {
        const r = await openPersonHistory({ call, signupId: Number(row.dataset.pid), host: el, anchor: row, boardId: memo.board, boardTitle: boardTitle(), year: memo.year || null });
        if (r && r.lost) await boot();
        return;
      }
      const act = a.dataset.act;
      if (act === "retry") await boot();
      else if (act === "export") await exportXlsx();
      else if (act === "idle") {
        memo.idle = !memo.idle;
        drawList();
        const again = el.querySelector('[data-act="idle"]');   // 다시 그려 단추가 바뀌었다 — 초점을 돌려준다
        if (again && again.focus) again.focus({ preventScroll: true });
      } else if (act === "board") {
        const got = await pickOne({ anchor: a, title: "어느 당번의 기록", value: memo.board,
          options: [{ value: "", label: scopeWord() }, ...boards.map((b) => ({ value: b.id, label: b.title, hint: b.statusLabel }))] });
        if (got !== null && got !== memo.board) await change({ board: got, year: memo.year });
      } else if (act === "year") {
        const got = await pickOne({ anchor: a, title: YEAR_TITLE, value: String(year()), options: yearOptions(today).map((y) => ({ value: String(y), label: `${y}년` })) });
        if (got !== null && Number(got) !== year()) await change({ board: memo.board, year: Number(got) });
      } else if (act === "sort") {
        const got = await pickOne({ anchor: a, title: "차례", value: memo.sort, options: PEOPLE_SORTS });
        if (got !== null && got !== memo.sort) { memo.sort = got; draw(); }
      }
    } finally { working = false; }
  });

  await boot();
}
