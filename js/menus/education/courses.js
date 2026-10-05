// 📚 강좌 관리 — 강좌 목록 · 만들기/고치기 · 회차(한 번에 만들기) · 지난 학기 복사 (교육신청 1단계 과제 5 · 2026-10-05)
//   서버: eduCourses·eduCourseSave·eduCourseCopy·eduSessions·eduSessionsSave·eduStaffCandidates·eduStaffSet (역할 education = 교육 총괄).
//   규칙은 courses-logic.js(시험).
// 강좌별 담당자(2026-10-05): 고치기 폼의 「담당자」(pickMany) → 강좌 저장(eduCourseSave) 뒤 바뀐 때만 eduStaffSet(새 강좌는 받은 id 로).
//   담당은 📝 신청 현황에서 맡은 강좌만 다룬다 — 막는 것은 서버(not-assigned).
// ⚠️ 고르기·날짜·시각은 시스템 칸(select·type=date·type=time)이 아니라 picker.js 고르개(pickOne·pickDate·pickTime)로.
// ⚠️ 새 강좌·복사본은 「준비 중」 — 「모집 중」으로 저장하는 순간 성경암송 앱에 보이므로 그때만 확인 창을 한 번 더 띄운다.
// ⚠️ 회차 저장은 서버가 통째로 바꾼다(eduSessionsSave — 한 번에 · 같은 번호는 id 유지). 끝난 강좌는 course-closed.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne, pickMany, pickDate, pickTime, fmtDateLabel, fmtTimeLabel } from "../../core/picker.js";
import {
  KIND_OPTIONS, MODE_OPTIONS, STATUS_OPTIONS, WAITLIST_OPTIONS,
  formToCourse, courseToForm, checkFormNumbers, sessionsSummary, periodSummary, makeSessionRows, sessionErrorText, courseErrorText, sessionHeadLine,
  courseSavedText, staffBits, staffOptions, staffFieldText, sameIds, staffSaveFailText, STAFF_NO_CAND, STALE_MARK,
} from "./courses-logic.js";

const TITLE = `<h2 class="page-title">📚 강좌 관리</h2>`;
const labelOf = (opts, v) => (opts.find((o) => o.value === v) || {}).label || v || "";
const OPEN_WARN = "저장하면 성경암송 앱(🎓 교육이 보이는 분)에 이 강좌가 바로 보여요.";
const EVERY = [{ value: "7", label: "매주" }, { value: "14", label: "2주마다" }, { value: "1", label: "매일" }];

// ---------- 고르개 단추(폼 안) ----------
const pickBtn = (k, label, text, empty) => `<div class="field"><span>${esc(label)}</span>
  <button type="button" class="pk-field${empty ? " empty" : ""}" data-pick="${k}" aria-haspopup="dialog" aria-expanded="false"
    aria-label="${esc(label)}, ${esc(text)}"><span class="pk-field-v">${esc(text)}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>`;
const setPick = (root, k, label, value, text, empty) => {
  const i = root.querySelector(`[data-f="${k}"]`); if (i) i.value = value;
  const b = root.querySelector(`[data-pick="${k}"], [data-date="${k}"]`);
  b.querySelector(".pk-field-v").textContent = text;
  b.setAttribute("aria-label", `${label}, ${text}`);
  b.classList.toggle("empty", !!empty);
};
const hid = (k, v) => `<input type="hidden" data-f="${k}" value="${esc(v)}">`;
const txt = (k, label, v, attrs = "", hint = "") => `<label class="field"><span>${esc(label)}${hint ? ` <small>(${esc(hint)})</small>` : ""}</span>` +
  `<input data-f="${k}" value="${esc(v)}" autocomplete="off" ${attrs}></label>`;

// ---------- 강좌 폼 ----------
const FORM_PICKS = {
  kind: { label: "종류", opts: KIND_OPTIONS }, mode: { label: "확정 방식", opts: MODE_OPTIONS },
  waitlist: { label: "대기 받기", opts: WAITLIST_OPTIONS }, status: { label: "상태", opts: STATUS_OPTIONS },
};
const DATE_LABEL = { applyFrom: "신청 시작일", applyTo: "신청 마감일", startsOn: "교육 시작일", endsOn: "교육 종료일" };
const dateText = (v) => (v ? `${v.slice(0, 4)}년 ${fmtDateLabel(v)}` : "고르기");

// 담당자 칸 — 고른 id 들은 숨은 칸(JSON)에 두어 readForm·isDirty 가 함께 본다. cands=null 이면 후보를 못 불러온 것(고를 수 없다)
function staffFieldHtml(ids, opts, cands) {
  const text = cands === null ? "담당자 후보를 불러오지 못했어요" : staffFieldText(ids, opts);
  return hid("staff", JSON.stringify(ids)) + `<div class="field"><span>담당자 <small>(📝 신청 현황에서 이 강좌만 다뤄요)</small></span>
    <button type="button" class="pk-field${ids.length ? "" : " empty"}" data-staff aria-haspopup="dialog" aria-expanded="false"
      aria-label="담당자, ${esc(text)}"${cands === null ? " disabled" : ""}><span class="pk-field-v">${esc(text)}</span><span class="pk-field-x" aria-hidden="true"></span></button>
    ${cands && !cands.length ? `<p class="muted ec-hint">${esc(STAFF_NO_CAND)}</p>` : ""}</div>`;
}

export function courseFormHtml(v, isNew, staff = { ids: [], opts: [], cands: [] }) {
  const pick = (k) => hid(k, v[k]) + pickBtn(k, FORM_PICKS[k].label, labelOf(FORM_PICKS[k].opts, v[k]) || "고르기", !v[k]);
  const date = (k) => hid(k, v[k]) + `<div class="field"><span>${DATE_LABEL[k]}</span>
    <button type="button" class="pk-field${v[k] ? "" : " empty"}" data-date="${k}" aria-haspopup="dialog" aria-expanded="false"
      aria-label="${DATE_LABEL[k]}, ${esc(dateText(v[k]))}"><span class="pk-field-v">${esc(dateText(v[k]))}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>`;
  return (isNew ? `<p class="be-note">새 강좌는 「준비 중」으로 만들어져 성도님께 안 보여요 — 회차를 넣고 상태를 「모집 중」으로 바꾸면 보여요</p>` : "") +
    txt("title", "강좌 이름", v.title, `maxlength="80" placeholder="예: 제자훈련 1단계"`) +
    pick("kind") +
    txt("term", "학기", v.term, `maxlength="30" placeholder="예: 2027 상반기"`) +
    txt("teacher", "강사", v.teacher, `maxlength="60"`) +
    staffFieldHtml(staff.ids, staff.opts, staff.cands) +
    txt("place", "장소", v.place, `maxlength="80"`) +
    txt("target", "대상", v.target, `maxlength="120" placeholder="예: 새가족반 수료한 분"`) +
    txt("fee", "교재비 안내", v.fee, `maxlength="120" placeholder="예: 교재비 1만 원"`) +
    txt("capacity", "정원", v.capacity, `inputmode="numeric" maxlength="4" placeholder="비우면 제한 없음"`, "비우면 제한 없음") +
    pick("mode") + pick("waitlist") +
    `<div class="be-2col">${date("applyFrom")}${date("applyTo")}</div>` +
    `<div class="be-2col">${date("startsOn")}${date("endsOn")}</div>` +
    txt("attendPct", "수료 기준 출석률 (%)", v.attendPct, `inputmode="numeric" maxlength="3"`, "기본 80") +
    txt("checkLabel", "담당자 확인 항목", v.checkLabel, `maxlength="40" placeholder="예: 과제"`, "비우면 출석률만") +
    `<label class="field"><span>설명</span><textarea data-f="description" maxlength="2000" rows="4">${esc(v.description)}</textarea></label>` +
    pick("status") +
    hid("id", v.id || "") + hid("track", v.track) + hid("prereq", JSON.stringify(v.prereq || []));
}
const readForm = (root) => {
  const o = Object.fromEntries([...root.querySelectorAll("[data-f]")].map((i) => [i.dataset.f, i.value.trim()]));
  try { o.prereq = JSON.parse(o.prereq || "[]"); } catch { o.prereq = []; }
  try { o.staff = JSON.parse(o.staff || "[]"); } catch { o.staff = []; }
  return o;
};

// → { id, promoted, staffErr }(저장 · promoted = 정원을 늘려 확정된 대기자 수 · staffErr = 강좌는 저장됐는데 담당자 저장이 실패한 말)
//   · 닫았으면 null · 없어진 강좌면 "gone". cands = 담당자 후보(eduStaffCandidates · 못 불러왔으면 null)
function openCourseForm({ call, course = null, term = "", cands = [] }) {
  const v = course ? courseToForm(course)
    : { id: "", title: "", kind: "regular", term, description: "", teacher: "", place: "", fee: "", target: "", track: "", capacity: "",
        mode: "auto", waitlist: "on", applyFrom: "", applyTo: "", startsOn: "", endsOn: "", attendPct: 80, checkLabel: "", status: "draft", prereq: [] };
  const staff0 = ((course && course.staff) || []).map((x) => x.id);
  const staffOpts = staffOptions(cands || [], (course && course.staff) || []);
  let first = "", gone = false;
  return openForm({
    title: course ? "✏️ 강좌 고치기" : "＋ 새 강좌", okLabel: course ? "저장" : "만들기",
    html: courseFormHtml(v, !course, { ids: staff0, opts: staffOpts, cands }),
    onOpen: (root) => {
      root.addEventListener("click", async (e) => {
        const sb = e.target.closest("[data-staff]");
        if (sb) {
          const cur = readForm(root).staff;
          const got = await pickMany({ anchor: sb, title: "담당자", options: staffOpts, values: cur });
          if (got !== null && sb.isConnected) {
            root.querySelector('[data-f="staff"]').value = JSON.stringify(got);
            const text = staffFieldText(got, staffOpts);
            sb.querySelector(".pk-field-v").textContent = text;
            sb.setAttribute("aria-label", `담당자, ${text}`);
            sb.classList.toggle("empty", !got.length);
          }
          return;
        }
        const p = e.target.closest("[data-pick]");
        if (p && FORM_PICKS[p.dataset.pick]) {
          const k = p.dataset.pick, { label, opts } = FORM_PICKS[k];
          const got = await pickOne({ anchor: p, title: label, options: opts, value: readForm(root)[k] });
          if (got !== null && p.isConnected) setPick(root, k, label, got, labelOf(opts, got), false);
          return;
        }
        const d = e.target.closest("[data-date]");
        if (d) {
          const k = d.dataset.date, cur = readForm(root);
          // 기간이라 반대쪽 끝을 넘지 못하게 — 시작일은 마감일까지, 마감일은 시작일부터
          const PAIR = { applyFrom: ["", "applyTo"], applyTo: ["applyFrom", ""], startsOn: ["", "endsOn"], endsOn: ["startsOn", ""] }[k];
          const got = await pickDate({ anchor: d, title: DATE_LABEL[k], value: cur[k],
            min: PAIR[0] ? cur[PAIR[0]] : "", max: PAIR[1] ? cur[PAIR[1]] : "" });
          if (got !== null && d.isConnected) setPick(root, k, DATE_LABEL[k], got, dateText(got), !got);
        }
      });
      first = JSON.stringify(readForm(root));
    },
    isDirty: (root) => JSON.stringify(readForm(root)) !== first,
    onSubmit: async (root) => {
      const vals = readForm(root);
      const numErr = checkFormNumbers(vals);
      if (numErr) return { ok: false, message: numErr };
      const body = formToCourse(vals);
      if (course && !body.id) return { ok: false, message: "강좌 번호를 읽지 못했어요 — 닫고 다시 열어 주세요" };   // 고치기가 새 강좌를 만들지 않게
      if (!body.title) return { ok: false, message: courseErrorText({ error: "no-title" }) };
      // 모집 중으로 **바꿀 때만** 확인(이미 모집 중인 강좌의 다른 칸을 고칠 때는 묻지 않는다)
      if (body.status === "open" && (!course || course.status !== "open")) {
        const yes = await dialog({ title: "👁 모집을 열까요?", text: OPEN_WARN, ok: "저장", cancel: "그만두기" });
        if (!root.isConnected) return { ok: false };
        if (!yes) return { ok: false, message: "저장하지 않았어요 — 아무것도 바뀌지 않았어요" };
      }
      const r = await call("eduCourseSave", { course: body });
      if (r.ok) {
        // 담당자 — 바뀐 때만(새 강좌는 방금 받은 id 로). 실패해도 강좌는 이미 저장됐으니 창을 닫고 알린다(다시 누르면 새 강좌가 또 생긴다)
        let staffErr = "";
        if (cands !== null && !sameIds(vals.staff, staff0)) {
          const s = await call("eduStaffSet", { course_id: r.id, member_ids: vals.staff });
          if (!s.ok) staffErr = staffSaveFailText(errorText(s));
        }
        return { ok: true, value: { id: r.id, promoted: Number(r.promoted) || 0, staffErr } };
      }
      if (r.error === "not-found") { gone = true; return { ok: true, value: null }; }   // 창을 닫고 목록을 새로 불러온다
      const m = courseErrorText(r);
      return m ? { ok: false, message: m } : r;
    },
  }).then((v) => (gone ? "gone" : v));
}

// ---------- 회차 창 ----------
const fieldBtn = (attr, i, text, empty) => `<button type="button" class="pk-field${empty ? " empty" : ""}" ${attr}="${i}" aria-haspopup="dialog" aria-expanded="false">` +
  `<span class="pk-field-v">${esc(text)}</span><span class="pk-field-x" aria-hidden="true"></span></button>`;
const rowHtml = (s, i) => `<div class="card ec-row" data-row="${i}">
  <div class="ec-head"><b>${esc(sessionHeadLine(s))}</b><button type="button" class="btn danger" data-del="${i}">빼기</button></div>
  <div class="field"><span>날짜</span>${fieldBtn("data-sd", i, s.on_date ? dateText(s.on_date) : "날짜 고르기", !s.on_date)}</div>
  <div class="ec-pair">
    <div class="field"><span>시작</span>${fieldBtn("data-st", i, s.start_time ? fmtTimeLabel(s.start_time) : "시각 고르기", !s.start_time)}</div>
    <div class="field"><span>끝</span>${fieldBtn("data-et", i, s.end_time ? fmtTimeLabel(s.end_time) : "시각 고르기", !s.end_time)}</div>
  </div>
  <label class="field"><span>주제 <small>(안 써도 돼요)</small></span><input data-topic="${i}" value="${esc(s.topic || "")}" maxlength="80" autocomplete="off"></label>
</div>`;

async function openSessionsForm({ call, course }) {
  const r0 = await call("eduSessions", { course_id: course.id });
  if (!r0.ok) { toast(errorText(r0)); return null; }
  let rows = (r0.sessions || []).map((s) => ({ no: s.no, on_date: s.on_date || "", start_time: s.start_time || "",
    end_time: s.end_time || "", topic: s.topic || "", place: s.place || "" }));
  const gen = { start: course.startsOn || "", every: "7", st: "", et: "" };
  let first = "", sync = () => {};
  return openForm({
    title: `🗓️ 회차 — ${course.title}`, okLabel: "저장",
    html: `<div class="card"><b>한 번에 만들기</b>
        <p class="muted">첫 날부터 몇 회를 한 번에 채워요 — 지금 있는 회차는 바뀌어요 (저장하기 전에는 서버에 가지 않아요)</p>
        <div class="field"><span>첫 날</span>${fieldBtn("data-g", "start", course.startsOn ? dateText(course.startsOn) : "날짜 고르기", !course.startsOn)}</div>
        <div class="ec-pair">
          <label class="field"><span>몇 회</span><input data-g-count value="8" inputmode="numeric" maxlength="3"></label>
          <div class="field"><span>간격</span>${fieldBtn("data-g", "every", "매주", false)}</div></div>
        <div class="ec-pair">
          <div class="field"><span>시작 시각</span>${fieldBtn("data-g", "st", "시각 고르기", true)}</div>
          <div class="field"><span>끝 시각</span>${fieldBtn("data-g", "et", "시각 고르기", true)}</div></div>
        <button type="button" class="btn" data-make>이대로 채우기</button></div>
      <p class="muted rs-sum"></p><div class="rs-list"></div>
      <button type="button" class="btn" data-add>＋ 줄 더하기</button>`,
    onOpen: (root) => {
      const list = root.querySelector(".rs-list"), sum = root.querySelector(".rs-sum");
      // 주제 칸에 친 글을 rows 로 거둔다(다시 그리기 전에)
      sync = () => root.querySelectorAll("[data-topic]").forEach((i) => { if (rows[Number(i.dataset.topic)]) rows[Number(i.dataset.topic)].topic = i.value.trim(); });
      const draw = () => {
        sum.textContent = rows.length ? "지금 " + sessionsSummary(rows.filter((s) => s.on_date)) : "회차가 아직 없어요";
        list.innerHTML = rows.map(rowHtml).join("");
      };
      const setBtn = (b, text, empty) => { b.querySelector(".pk-field-v").textContent = text; b.classList.toggle("empty", !!empty); };
      root.addEventListener("click", async (e) => {
        const g = e.target.closest("[data-g]");
        if (g) {
          const k = g.dataset.g;
          if (k === "start") {
            const got = await pickDate({ anchor: g, title: "첫 날", value: gen.start });
            if (got !== null && g.isConnected) { gen.start = got; setBtn(g, got ? dateText(got) : "날짜 고르기", !got); }
          } else if (k === "every") {
            const got = await pickOne({ anchor: g, title: "간격", value: gen.every, options: EVERY });
            if (got !== null && g.isConnected) { gen.every = got; setBtn(g, labelOf(EVERY, got), false); }
          } else {
            const got = await pickTime({ anchor: g, title: k === "st" ? "시작 시각" : "끝 시각", value: gen[k], near: k === "et" ? gen.st : "" });
            if (got !== null && g.isConnected) { gen[k] = got; setBtn(g, got ? fmtTimeLabel(got) : "시각 고르기", !got); }
          }
          return;
        }
        if (e.target.closest("[data-make]")) {
          const made = makeSessionRows(gen.start, Number(root.querySelector("[data-g-count]").value), Number(gen.every),
            { start_time: gen.st, end_time: gen.et });
          if (!made.length) { toast("첫 날을 고르고 1~200 사이 회수를 적어 주세요"); return; }
          rows = made; draw(); return;
        }
        if (e.target.closest("[data-add]")) {
          sync();
          const last = rows[rows.length - 1];
          rows.push({ no: rows.length + 1, on_date: "", start_time: last?.start_time || "", end_time: last?.end_time || "", topic: "", place: "" });
          draw(); return;
        }
        const del = e.target.closest("[data-del]");
        if (del) { sync(); rows.splice(Number(del.dataset.del), 1); rows.forEach((s, i) => { s.no = i + 1; }); draw(); return; }
        const sd = e.target.closest("[data-sd]"), st = e.target.closest("[data-st]"), et = e.target.closest("[data-et]");
        if (sd) {
          sync(); const i = Number(sd.dataset.sd);
          const got = await pickDate({ anchor: sd, title: `${rows[i].no}회 날짜`, value: rows[i].on_date });
          if (got !== null && sd.isConnected) { rows[i].on_date = got; draw(); }
        } else if (st || et) {
          sync(); const b = st || et, i = Number(st ? st.dataset.st : et.dataset.et), k = st ? "start_time" : "end_time";
          const got = await pickTime({ anchor: b, title: `${rows[i].no}회 ${st ? "시작" : "끝"} 시각`, value: rows[i][k], near: et ? rows[i].start_time : "" });
          if (got !== null && b.isConnected) { rows[i][k] = got; draw(); }
        }
      });
      draw();
      first = JSON.stringify(rows);
    },
    isDirty: () => { sync(); return JSON.stringify(rows) !== first; },
    onSubmit: async () => {
      sync();
      if (rows.some((s) => !s.on_date)) return { ok: false, message: "날짜를 고르지 않은 회차가 있어요" };
      const r = await call("eduSessionsSave", { course_id: course.id, sessions: rows.map((s) => ({ ...s })) });
      if (r.ok) return { ok: true, value: rows.length };
      const m = sessionErrorText(r);
      return m ? { ok: false, message: m } : r;
    },
  });
}

// ---------- 복사 창 ----------
function openCopyForm({ call, course }) {
  return openForm({
    title: `📄 복사 — ${course.title}`, okLabel: "복사",
    html: `<p class="muted">회차는 그대로 복사하고 「준비 중」으로 만들어요. 신청 기간은 비워 둬요.</p>` + txt("term", "새 학기", course.term, `maxlength="30"`),
    onSubmit: async (root) => {
      const r = await call("eduCourseCopy", { id: course.id, term: root.querySelector('[data-f="term"]').value.trim() });
      if (r.ok) return { ok: true, value: r.id };
      return r.error === "too-long" ? { ok: false, message: "학기는 30자까지 적을 수 있어요" } : r;
    },
  });
}

// ---------- 목록 ----------
// 카드 담당 줄 — 역할을 잃었거나 정지된 분(stale)은 흐리게 「(역할 없음)」(줄은 남아 있다 · 고치기에서 뺄 수 있다)
function staffHtml(c) {
  const bits = staffBits(c);
  if (!bits.length) return "담당 없음";
  return "담당 " + bits.map((b) => (b.stale ? `<span class="ec-stale">${esc(b.name)}${esc(STALE_MARK)}</span>` : esc(b.name))).join(", ");
}

function courseCard(c, sessions) {
  const n = c.counts || {};
  return `<div class="card" data-id="${esc(c.id)}">
    <div><b>${esc(c.title)}</b> <span class="badge">${esc(c.statusLabel)}</span></div>
    <div class="muted">${esc(c.kindLabel)}${c.term ? " · " + esc(c.term) : ""}</div>
    <div class="muted">${esc(sessions)}</div>
    <div class="muted ec-staff">${staffHtml(c)}</div>
    <div class="muted">정원 ${c.capacity == null ? "제한 없음" : esc(c.capacity)} · 확정 ${esc(n.confirmed || 0)} · 대기 ${esc(n.waitlisted || 0)} · 승인 기다림 ${esc(n.applied || 0)}</div>
    <div class="acts"><button type="button" class="btn" data-act="edit">고치기</button>
      <button type="button" class="btn" data-act="sessions">회차</button>
      <button type="button" class="btn" data-act="copy">복사</button></div>
  </div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let term = "";            // "" = 전체
  let data = { terms: [], courses: [] };
  let sess = {};            // 강좌 id → 회차 요약
  let cands = [];           // 담당자 후보(eduStaffCandidates) — 못 불러왔으면 null(폼의 담당자 칸을 잠근다 · 목록은 그대로)

  const load = async () => {
    const [r, c] = await Promise.all([call("eduCourses", term ? { term } : {}), call("eduStaffCandidates", {})]);
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return false; }
    data = { terms: r.terms || [], courses: r.courses || [] };
    cands = c && c.ok ? c.members || [] : null;
    // 카드마다 회차 요약 — 강좌 수만큼 나란히 부른다(한 학기 열 개 안팎)
    const all = await Promise.all(data.courses.map((c) => call("eduSessions", { course_id: c.id })));
    sess = {};
    data.courses.forEach((c, i) => { sess[c.id] = c.startsOn || c.endsOn ? periodSummary(c, all[i].ok ? all[i].sessions : []) : all[i].ok ? sessionsSummary(all[i].sessions) : "회차를 불러오지 못했어요"; });
    return true;
  };
  const draw = () => {
    el.innerHTML = TITLE + `<div class="acts"><button type="button" class="btn" data-act="term">학기: ${esc(term || "전체")}</button>
      <button type="button" class="btn primary" data-act="new">＋ 새 강좌</button></div>
      <div class="ec-list">${data.courses.length ? data.courses.map((c) => courseCard(c, sess[c.id])).join("")
        : `<p class="empty">아직 강좌가 없어요 — 「＋ 새 강좌」로 만들어 주세요</p>`}</div>`;
  };
  const open = new Set();   // 열려 있는 창(단추 종류+강좌)
  const reload = async () => { if (await load()) draw(); };

  if (!(await load())) return;
  draw();

  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const card = b.closest("[data-id]");
    const course = card ? data.courses.find((c) => c.id === card.dataset.id) : null;
    // 창(openForm)은 body 에 붙어 busy 가 잠그지 않는다 — 창이 닫힌 뒤 다시 그리는 동안만 목록 단추를 잠근다
    if (act === "term") {
      const got = await pickOne({ anchor: b, title: "학기", value: term,
        options: [{ value: "", label: "전체" }, ...data.terms.map((t) => ({ value: t, label: t }))] });
      if (got !== null && got !== term) { term = got; await busy(el, reload); }
      return;
    }
    if (open.has(act + (card?.dataset.id || ""))) return;   // 같은 창이 이미 열려 있다(두 번 누름)
    const key = act + (card?.dataset.id || "");
    open.add(key);
    let done = false;
    try {
    if (act === "new") {
      const got = await openCourseForm({ call, term, cands });
      done = !!got;
      if (done) toast(got.staffErr || courseSavedText(0));
    }
    else if (act === "edit" && course) {
      const got = await openCourseForm({ call, course, cands });
      done = !!got;
      if (got === "gone") toast("그 강좌를 찾지 못해 목록을 새로 불러왔어요"); else if (done) toast(got.staffErr || courseSavedText(got.promoted));
    }
    // 회차를 모두 빼고 저장하면 값이 0 — 0 도 저장한 것이다(닫으면 null · 불러오기 실패도 null)
    else if (act === "sessions" && course) { done = (await openSessionsForm({ call, course })) != null; if (done) toast("회차를 저장했어요"); }
    else if (act === "copy" && course) {
      done = !!(await openCopyForm({ call, course }));
      if (done) toast("복사했어요 — 준비 중으로 만들었어요. 신청 기간과 회차 날짜를 고쳐 주세요");
    }
    } finally { open.delete(key); }
    if (done) await busy(el, reload);
  });
}
