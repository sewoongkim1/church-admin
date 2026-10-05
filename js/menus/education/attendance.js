// ✅ 출석부 — 강좌 고르기 · 회차 고르기 · 한 분마다 출석·지각·결석·공결 · 「남은 N분 모두 출석」 · 출석 현황 · 엑셀
//   (교육신청 2단계 · 2026-10-05 · 계획 v2 docs/superpowers/plans/2026-10-05-education-stage2-attendance.md)
//   서버: eduAttendCourses·eduAttendSessions·eduAttendSheet·eduAttendSet·eduAttendBulk·eduAttendSummary·eduAttendExport
//   역할 education(교육 총괄 — 모든 강좌) · educourse(교육 담당 — 맡은 강좌) · teacher(강사 — 맡은 강좌).
//   맡지 않은 강좌는 서버가 not-assigned 로 막는다 — 강좌 목록을 서버가 거른 그대로 보여 주는 것은 편의일 뿐.
//   규칙(글·차례·다음 상태·오류 말)은 attendance-logic.js(시험). 출석률은 서버가 준 pct 그대로(다시 셈하지 않는다).
// ⚠️ 누르면 바로 저장한다(먼저 화면을 바꾸고, 서버가 거절하면 되돌린다). 같은 줄은 저장이 끝날 때까지 다시 받지 않는다(pending)
//    — 빠른 망에서 두 번 누름이 「체크 → 지움」이 되지 않게 한 번 누른 뒤 MIN_LOCK 동안은 잠가 둔다.
// ⚠️ 고르기는 picker.js(pickOne)만 — 시스템 select·date·time 칸 금지. 서버 글자는 모두 esc. 응답에 user_id·marked_by 는 없다.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import { loadXlsx } from "../../core/xlsx.js";
import {
  STATES, STATE_LABEL, STATE_MARK, NO_MARK, courseLabel, courseOptions, initialCourse, sessionChip, sessionLine, isFuture, countRows, countsLine, nextState,
  remaining, bulkLabel, bulkAsk, bulkDoneText, buttonAria, attendErrorText, reloadAfter, summaryHead, belowCount, personCounts, pctText,
  cellsFor, attendFileName, EMPTY_ASSIGNED, EMPTY_ALL, NO_SESSIONS, NO_PEOPLE, NO_SESSIONS_ASSIGNED, NO_PEOPLE_ASSIGNED, CLOSED_NOTE, FUTURE_NOTE,
} from "./attendance-logic.js";

const TITLE = `<h2 class="page-title">✅ 출석부</h2>`;
const LOADING = `<p class="empty">불러오는 중…</p>`;
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const failText = (r) => attendErrorText(r) || errorText(r);
const MIN_LOCK = 350;   // ms — 한 줄을 누른 뒤 이만큼은 같은 줄을 다시 받지 않는다
const TABS = [["sheet", "출석부"], ["sum", "출석 현황"]];
// 현황 칸 읽는 법 — 칸과 같은 꼴의 작은 표(○ 출석 · 지 지각 · 결 결석 · 공 공결 · 「·」 체크 전)
const LEGEND = [...STATES.map((st) => [st, STATE_MARK[st], STATE_LABEL[st]]), ["", NO_MARK, "체크 전"]]
  .map(([st, m, t]) => `<span class="ea-lg"><span class="ea-c${st ? " " + st : ""}" aria-hidden="true"><b>${esc(m)}</b></span>${esc(t)}</span>`).join("");

let lastCourseId = "";   // 메뉴를 나갔다 와도 보던 강좌를 기억(모듈 안) · 탭은 늘 「출석부」부터(체크하러 온 분이 현황에 떨어지지 않게)

// ---------- 그리기(글만) ----------
function rowHtml(r, closed) {
  return `<div class="ea-row" data-eid="${esc(r.id)}" data-st="${esc(r.state || "")}">
    <div class="ea-who"><b>${esc(r.name)}</b>${r.who ? `<span>${esc(r.who)}</span>` : ""}</div>
    <div class="ea-btns" role="group" aria-label="${esc(r.name)} 출석">${STATES.map((st) => {
      const on = r.state === st;
      return `<button type="button" class="ea-b${on ? " on" : ""}" data-s="${st}" aria-pressed="${on}" aria-label="${esc(buttonAria(r.name, st, on))}"${closed ? " disabled" : ""}>${STATE_LABEL[st]}</button>`;
    }).join("")}</div></div>`;
}

function cellsHtml(p, sessions) {
  return `<div class="ea-cells">${cellsFor(p, sessions).map((c) =>
    `<span class="ea-c${c.state ? " " + c.state : ""}" role="img" aria-label="${esc(`${c.no}회 ${c.date} ${c.label}`)}"><i>${esc(c.no)}회</i><b>${esc(c.mark)}</b></span>`).join("")}</div>`;
}

function personHtml(p, sessions, open) {
  return `<div class="ea-p${p.below ? " below" : ""}" data-pid="${esc(p.id)}">
    <button type="button" class="ea-p-h" aria-expanded="${open}">
      <span class="ea-p-who"><b>${esc(p.name)}</b>${p.who ? `<small>${esc(p.who)}</small>` : ""}</span>
      <span class="ea-pct">${esc(pctText(p))}${p.below ? `<em>기준 미달</em>` : ""}</span>
      <span class="ea-p-n">${esc(personCounts(p))}</span>
    </button>${open ? cellsHtml(p, sessions) : ""}</div>`;
}

// ---------- 화면 ----------
export async function render(el, { call }) {
  el.classList.add("ea-page");   // PC 에서 읽기 좋은 폭(css .ea-page)
  el.innerHTML = TITLE + LOADING;
  let courses = [], scope = "all";
  let cur = null;      // 고른 강좌(목록 줄 + eduAttendSessions 의 course)
  let ses = null;      // eduAttendSessions 답 {course, confirmed, today, pick, sessions}
  let sid = null;      // 고른 회차 id
  let sheet = null;    // eduAttendSheet 답 {course, session, counts, rows}
  let sum = null;      // eduAttendSummary 답 {course, sessions, people}
  let tab = "sheet";
  const pending = new Set();   // 저장 중인 줄(회차:신청) · 단추 종류(export·bulk) — 두 번 누름 막기
  const opened = new Set();    // 출석 현황에서 펼친 분(신청 번호)

  const loadCourses = async () => {
    const r = await call("eduAttendCourses", {});
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return false; }
    courses = r.courses || [];
    scope = r.scope === "assigned" ? "assigned" : "all";
    return true;
  };
  // 강좌 c 의 회차·출석부(·현황 탭이면 현황)를 불러와 한꺼번에 바꾼다 — 실패하면 아무것도 바꾸지 않는다(보던 강좌가 그대로 남는다)
  //   → { ok:true } · { ok:false, gone:"강좌를 놓을 까닭" } · { ok:false, error }
  const loadCourse = async (c) => {
    const r = await call("eduAttendSessions", { course_id: c.id });
    if (!r.ok && r.error === "not-found") return { ok: false, gone: "그 강좌를 찾지 못했어요", code: r.error };
    if (!r.ok && r.error === "not-assigned") return { ok: false, gone: failText(r), code: r.error };   // 그사이 맡은 강좌에서 빠졌다
    if (!r.ok) return { ok: false, error: r };
    let sh = null, sm = null;
    if (r.pick != null) {
      sh = await call("eduAttendSheet", { course_id: c.id, session_id: r.pick });
      if (!sh.ok) return { ok: false, error: sh };
    }
    if (tab === "sum") {
      sm = await call("eduAttendSummary", { course_id: c.id });
      if (!sm.ok) return { ok: false, error: sm };
    }
    cur = { ...c, ...r.course }; ses = r; sid = r.pick ?? null; sheet = sh; sum = sm; opened.clear();
    return { ok: true };
  };
  // 맡은 강좌가 바뀌었을 수 있을 때(not-assigned) — 목록부터 다시
  const reloadAll = async () => {
    if (!(await loadCourses())) return;
    const again = cur && courses.find((c) => c.id === cur.id);
    if (!again) { cur = null; ses = null; sheet = null; sum = null; lastCourseId = ""; draw(); return; }
    const r = await loadCourse(again);
    if (!r.ok) { cur = null; ses = null; sheet = null; sum = null; lastCourseId = ""; if (r.error) toast(errorText(r.error)); }
    draw();
  };
  // 지금 회차 출석부만 다시(서버가 거절한 뒤 · 한꺼번에 체크한 뒤) — 회차가 없어졌으면 강좌째
  const reloadSheet = async () => {
    if (!cur || sid == null) return;
    const s = await call("eduAttendSheet", { course_id: cur.id, session_id: sid });
    if (!s.ok && s.error === "not-assigned") { await reloadAll(); return; }
    if (!s.ok && s.error === "not-found") {
      const r = await loadCourse(cur);
      if (r.gone) { toast(r.gone); cur = null; lastCourseId = ""; } else if (!r.ok) toast(errorText(r.error));
      draw(); return;
    }
    if (!s.ok) { toast(failText(s)); return; }
    sheet = s; cur = { ...cur, ...s.course };
    const ss = ses && ses.sessions.find((x) => x.id === sid);
    if (ss) ss.marked = s.counts.marked;
    draw();
  };
  const loadSummary = async () => {
    const r = await call("eduAttendSummary", { course_id: cur.id });
    if (!r.ok && r.error === "not-assigned") { await reloadAll(); return false; }
    if (!r.ok) { toast(failText(r)); return false; }
    sum = r; cur = { ...cur, ...r.course };
    return true;
  };

  // ---------- 그리기 ----------
  const tabsHtml = () => `<div class="tabs ea-tabs" role="tablist">${TABS.map(([v, t]) =>
    `<button type="button" role="tab" data-tab="${v}" aria-selected="${tab === v}"${tab === v ? ' class="on"' : ""}>${t}</button>`).join("")}</div>`;

  const sheetHtml = () => {
    const list = (ses && ses.sessions) || [];
    if (!list.length) return `<p class="empty">${esc(scope === "assigned" ? NO_SESSIONS_ASSIGNED : NO_SESSIONS)}</p>`;
    const chips = `<div class="ea-chips" aria-label="회차">${list.map((s) => {
      const on = s.id === sid;
      return `<button type="button" class="ea-chip${on ? " on" : ""}" data-sid="${esc(s.id)}" aria-pressed="${on}">${s.isToday ? `<i>오늘</i>` : ""}${esc(sessionChip(s, ses.confirmed))}</button>`;
    }).join("")}</div>`;
    if (!sheet) return chips + LOADING;
    const closed = !!(sheet.course && sheet.course.closed);
    const c = countRows(sheet.rows);
    const n = remaining(c);
    const notes = [closed ? CLOSED_NOTE : "", isFuture(sheet.session, ses.today) ? FUTURE_NOTE : ""].filter(Boolean);
    return chips +
      `<div class="ea-bar"><b>${esc(sessionLine(sheet.session))}</b><span data-counts>${esc(countsLine(c))}</span></div>` +
      notes.map((t) => `<p class="ea-note">${esc(t)}</p>`).join("") +
      (closed ? "" : `<div class="ea-bulkw"${n ? "" : " hidden"}><button type="button" class="btn primary wide ea-bulk" data-act="bulk">${esc(bulkLabel(n))}</button></div>`) +
      (sheet.rows.length ? `<div class="ea-list">${sheet.rows.map((r) => rowHtml(r, closed)).join("")}</div>` : `<p class="empty">${esc(scope === "assigned" ? NO_PEOPLE_ASSIGNED : NO_PEOPLE)}</p>`);
  };

  const sumHtml = () => {
    if (!sum) return LOADING;
    const below = belowCount(sum.people);
    return `<div class="ea-sumtop"><p class="ea-sumhead">${esc(summaryHead(sum.course, sum.sessions, sum.people))}${below ? ` · <b class="ea-below-n">기준 미달 ${below}분</b>` : ""}</p>
        <button type="button" class="btn ea-export" data-act="export">엑셀로 내려받기</button></div>
      <p class="muted ea-legend">${LEGEND} <span class="ea-lg-tip">줄을 누르면 회차별로 보여요</span></p>` +
      (sum.people.length ? `<div class="ea-plist">${sum.people.map((p) => personHtml(p, sum.sessions, opened.has(p.id))).join("")}</div>`
        : `<p class="empty">${esc(scope === "assigned" ? NO_PEOPLE_ASSIGNED : NO_PEOPLE)}</p>`);
  };

  const draw = () => {
    if (!el.isConnected) return;   // 그사이 다른 메뉴로 옮겼다(route 가 새 section 으로 바꿨다)
    if (!courses.length) { el.innerHTML = TITLE + `<p class="empty">${esc(scope === "assigned" ? EMPTY_ASSIGNED : EMPTY_ALL)}</p>`; return; }
    const head = `${TITLE}<div class="ee-top ea-top"><button type="button" class="btn wide ea-course" data-act="course">${esc(cur ? courseLabel(cur) : "강좌 고르기")}</button></div>`;
    if (!cur) { el.innerHTML = head + `<p class="empty">강좌를 골라 주세요</p>`; return; }
    el.innerHTML = head + tabsHtml() + `<div class="ea-body">${tab === "sum" ? sumHtml() : sheetHtml()}</div>`;
    centerChip();
  };
  // 고른 회차 칩을 칩 줄 가운데로(가로로만 — 화면은 세로로 움직이지 않는다)
  const centerChip = () => {
    const strip = el.querySelector(".ea-chips"), on = strip && strip.querySelector(".ea-chip.on");
    if (on && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, on.offsetLeft - strip.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2);
  };
  // 한 줄을 지금 상태로(단추 켜짐·읽기 글) — 다시 그리지 않아 스크롤·초점이 그대로다
  const paintRow = (row, r) => {
    row.dataset.st = r.state || "";
    row.querySelectorAll(".ea-b").forEach((b) => {
      const on = r.state === b.dataset.s;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", buttonAria(r.name, b.dataset.s, on));
    });
  };
  // 위 줄(체크 N/M …)·「남은 N분」 단추·고른 회차 칩의 수를 줄들에서 다시
  const paintTop = () => {
    if (!sheet) return;
    const c = countRows(sheet.rows), n = remaining(c);
    const cl = el.querySelector("[data-counts]"); if (cl) cl.textContent = countsLine(c);
    const bw = el.querySelector(".ea-bulkw");
    if (bw) { bw.hidden = !n; bw.querySelector(".ea-bulk").textContent = bulkLabel(n); }
    const ss = ses && ses.sessions.find((x) => x.id === sheet.session.id);
    if (ss) {
      ss.marked = c.marked;
      const chip = el.querySelector(`.ea-chip[data-sid="${CSS.escape(String(ss.id))}"]`);
      if (chip) chip.innerHTML = (ss.isToday ? `<i>오늘</i>` : "") + esc(sessionChip(ss, ses.confirmed));
    }
  };

  // ---------- 처음 ----------
  if (!(await loadCourses())) return;
  const first = initialCourse(courses, lastCourseId);
  if (first) {
    const r = await loadCourse(first);
    if (r.ok) lastCourseId = first.id;
    else if (r.gone) lastCourseId = "";
    else { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r.error))}</p>`; return; }
  }
  draw();

  // ---------- 한 칸 누르기(바로 저장 · 실패하면 되돌림) ----------
  async function tapState(btn) {
    const row = btn.closest("[data-eid]"), my = sheet;
    if (!row || !my || (my.course && my.course.closed)) return;
    const eid = Number(row.dataset.eid), r = my.rows.find((x) => Number(x.id) === eid);
    if (!r) return;
    const key = `${my.session.id}:${eid}`;
    if (pending.has(key)) return;
    pending.add(key);
    const t0 = Date.now(), prev = r.state ?? null, next = nextState(prev, btn.dataset.s);
    r.state = next; paintRow(row, r); paintTop();
    row.setAttribute("aria-busy", "true");
    try {
      const res = await call("eduAttendSet", { session_id: my.session.id, enrollment_id: eid, state: next });
      if (!res.ok) {
        r.state = prev;
        if (sheet === my) { const now = el.querySelector(`.ea-row[data-eid="${CSS.escape(String(eid))}"]`); if (now) paintRow(now, r); paintTop(); }
        toast(failText(res));
        const what = reloadAfter(res.error);
        if (what === "courses") await busy(el, reloadAll);
        else if (what === "sheet" && sheet === my) await busy(el, reloadSheet);
      }
    } finally {
      const wait = MIN_LOCK - (Date.now() - t0);
      if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
      pending.delete(key);
      row.removeAttribute("aria-busy");
    }
  }

  async function bulk() {
    const my = sheet;
    if (!my || (my.course && my.course.closed)) return;
    const n = remaining(countRows(my.rows));
    if (!n) return;
    if ([...pending].some((k) => k.includes(":"))) { toast("저장하는 중이에요 — 잠시 뒤 다시 눌러 주세요"); return; }
    const ahead = isFuture(my.session, ses && ses.today);   // 앞날 회차면 한 번 더 일러 둔다(미리 다 채우는 실수)
    const yes = await dialog({ title: bulkLabel(n), text: (ahead ? FUTURE_NOTE + ". " : "") + bulkAsk(n), ok: "모두 출석", cancel: "그만두기" });
    if (!yes || sheet !== my) return;
    const r = await busy(el, () => call("eduAttendBulk", { session_id: my.session.id, state: "present" }));
    if (!r.ok) {
      toast(failText(r));
      const what = reloadAfter(r.error);
      if (what === "courses") await busy(el, reloadAll); else if (what === "sheet") await busy(el, reloadSheet);
      return;
    }
    toast(bulkDoneText(r.count));
    await busy(el, reloadSheet);
  }

  async function exportXlsx() {
    const r = await busy(el, () => call("eduAttendExport", { course_id: cur.id }));
    if (!r.ok) { toast(failText(r)); if (r.error === "not-assigned") await busy(el, reloadAll); return; }
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.rows), "출석 현황");
      XLSX.writeFile(wb, attendFileName(cur.title, kstToday()));
    } catch { toast("엑셀 파일을 만들지 못했어요"); }
  }

  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button.ea-b");
    if (b) { if (!b.disabled) await tapState(b); return; }

    const a = ev.target.closest("button[data-act]");
    if (a) {
      const act = a.dataset.act;
      if (act === "course") {
        const got = await pickOne({ anchor: a, title: "강좌", value: cur ? cur.id : "", options: courseOptions(courses) });
        if (got === null || (cur && got === cur.id)) return;
        const next = courses.find((c) => c.id === got);
        if (!next) return;
        const r = await busy(el, () => loadCourse(next));   // 실패하면 보던 강좌가 그대로 남는다
        if (r.gone) { toast(r.gone); if (r.code === "not-assigned") await busy(el, reloadAll); return; }
        if (!r.ok) { toast(errorText(r.error)); return; }
        lastCourseId = cur.id; draw();
        return;
      }
      if (!cur || pending.has(act)) return;
      pending.add(act);
      try {
        if (act === "bulk") await bulk();
        else if (act === "export") await exportXlsx();
      } finally { pending.delete(act); }
      return;
    }

    const t = ev.target.closest("button[data-tab]");
    if (t && cur) {
      const want = t.dataset.tab;
      if (want === tab) return;
      if (want === "sum") {   // 현황은 열 때마다 새로 — 출석부에서 고친 것이 바로 보이게
        const ok = await busy(el, loadSummary);
        if (!ok) return;
      }
      tab = want; opened.clear(); draw();
      return;
    }

    const chip = ev.target.closest("button[data-sid]");
    if (chip && cur) {
      const want = Number(chip.dataset.sid);
      if (want === sid) return;
      const s = await busy(el, () => call("eduAttendSheet", { course_id: cur.id, session_id: want }));
      if (!s.ok) {
        toast(failText(s));
        if (s.error === "not-assigned") await busy(el, reloadAll);
        else if (s.error === "not-found") { const r = await busy(el, () => loadCourse(cur)); if (r.ok) draw(); }
        return;
      }
      sid = want; sheet = s; cur = { ...cur, ...s.course };
      const ss = ses.sessions.find((x) => x.id === want); if (ss) ss.marked = s.counts.marked;
      draw();
      return;
    }

    const ph = ev.target.closest("button.ea-p-h");
    if (ph && sum) {
      const box = ph.closest("[data-pid]"), id = Number(box.dataset.pid);
      const p = sum.people.find((x) => Number(x.id) === id);
      if (!p) return;
      if (opened.has(id)) opened.delete(id); else opened.add(id);
      box.outerHTML = personHtml(p, sum.sessions, opened.has(id));
      const again = el.querySelector(`.ea-p[data-pid="${CSS.escape(String(id))}"] .ea-p-h`);
      if (again) again.focus({ preventScroll: true });
    }
  });
}
