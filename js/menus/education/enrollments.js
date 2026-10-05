// 📝 신청 현황 — 강좌 고르기 · 묶음별 명단 · 확정/대기/반려/취소/다시 받기 · 정원 넘겨 확정 · 대신 등록 · 교재비·메모 · 엑셀
//   (교육신청 1단계 과제 6 · 2026-10-05) 서버: eduCourses·eduEnrollList·eduEnrollSet·eduEnrollAdd·eduFeeSet·eduExport·eduPeopleLookup (역할 education)
//   규칙(묶음·단추·문구)은 enrollments-logic.js(시험). 정원·대기·대기 올림은 SQL 함수 한 곳 — 여기서 상태를 직접 바꾸지 않는다.
// ⚠️ 교인ID 는 화면에 오지 않는다 — 대신 등록은 찾은 이름·몇 번째·소속 확인값(check)만 서버로 보내고 서버가 같은 찾기를 다시 돌려 확인한다.
// ⚠️ 고르기는 picker.js(pickOne)만 — 시스템 select·date·time 칸 금지. 서버 글자는 모두 esc.
import { esc, toast, dialog, busy, errorText, kstTime } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne } from "../../core/picker.js";
import { loadXlsx } from "../../core/xlsx.js";
import { fileErrorText } from "../bibleevent/upload-logic.js";
import { groupByStatus, actionsFor, capacityLine, errorWord, exportFileName, addDoneText, confirmTextFor } from "./enrollments-logic.js";

const TITLE = `<h2 class="page-title">📝 신청 현황</h2>`;
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
// 알려진 말이면 errorWord, 아니면(연결·권한 등) 공용 errorText
const failText = (r) => { const w = errorWord(r?.error); return w.startsWith("저장하지 못했어요 (") ? errorText(r) : w; };
const SECTIONS = [["applied", "승인 기다림"], ["confirmed", "확정"], ["waitlisted", "대기"]];
const FOLDED = [["cancelled", "취소"], ["declined", "반려"]];

let lastCourseId = "";   // 메뉴를 나갔다 와도 보던 강좌를 기억(모듈 안)

// ---------- 줄 ----------
function rowHtml(e) {
  const acts = actionsFor(e).map((a) => `<button type="button" class="btn${a.danger ? " danger" : ""}" data-op="${a.op}">${esc(a.label)}</button>`).join("");
  return `<div class="card" data-eid="${esc(e.id)}">
    <div><b>${esc(e.name)}</b> ${e.status === "waitlisted" ? `<span class="badge">대기 ${esc(e.waitNo || "")}번</span> ` : ""}<span class="badge">${e.source === "staff" ? "담당자" : "앱"}</span></div>
    <div class="muted">${esc(e.who || "")}</div>
    <div class="muted">${esc(kstTime(e.appliedAt))} 신청</div>
    <label class="muted"><input type="checkbox" data-fee ${e.feePaid ? "checked" : ""}> 교재비 냄</label>
    <div><button type="button" class="btn" data-memo>${e.note ? "메모: " + esc(e.note) : "메모 쓰기"}</button></div>
    <div class="acts">${acts}</div>
  </div>`;
}
const sectionHtml = (list, label) => `<h3>${esc(label)} <small class="muted">${list.length}명</small></h3>` +
  (list.length ? list.map(rowHtml).join("") : `<p class="empty">없어요</p>`);

// ---------- 메모 창 ----------
function openNoteForm({ call, e }) {
  let first = "";
  return openForm({
    title: `📝 메모 — ${e.name}`, okLabel: "저장",
    html: `<label class="field"><span>메모 <small>(500자까지)</small></span><textarea data-note maxlength="500" rows="5">${esc(e.note || "")}</textarea></label>`,
    onOpen: (root) => { first = root.querySelector("[data-note]").value; },
    isDirty: (root) => root.querySelector("[data-note]").value !== first,
    onSubmit: async (root) => {
      const note = root.querySelector("[data-note]").value.trim();
      const r = await call("eduFeeSet", { id: e.id, note });   // 메모만 보낸다 — 교재비 표시는 서버가 그대로 둔다
      if (r.ok) return { ok: true, value: true };
      return { ok: false, message: r.error === "too-long" ? "메모는 500자까지 적을 수 있어요" : failText(r) };
    },
  });
}

// ---------- 대신 등록 창 ----------
const candLine = (p) => [p.who_type, p.group, p.sub].filter(Boolean).join(" · ");
const candCard = (p, i) => `<div class="card" data-cand="${i}">
  <div><b>${esc(p.name)}</b></div><div class="muted">${esc(candLine(p))}</div>
  ${p.church_mok || p.position ? `<div class="muted">${esc([p.church_mok, p.position].filter(Boolean).join(" · "))}</div>` : ""}
  <div class="acts"><button type="button" class="btn primary" data-reg="${i}">등록</button></div></div>`;

// → 하나라도 등록했으면 true
async function openAddForm({ call, course }) {
  let tab = "pick", added = false, adding = false;
  let cands = [], searched = "", first = "";
  const typedVals = (root) => ({ name: root.querySelector("[data-t=name]").value, who: root.querySelector("[data-t=who]").value,
    group: root.querySelector("[data-t=group]").value, sub: root.querySelector("[data-t=sub]").value });

  // 한 번 부르고, 반려했던 분이면 확인 뒤 같은 인자에 force 를 더해 다시 부른다
  const addCall = async (args) => {
    let r = await call("eduEnrollAdd", { course_id: course.id, ...args });
    if (!r.ok && r.error === "was-declined") {
      const yes = await dialog({ title: "반려했던 분이에요", text: "반려했던 분이에요. 다시 받을까요?", ok: "다시 받기", cancel: "반려 유지" });
      if (!yes) return { kept: true };
      r = await call("eduEnrollAdd", { course_id: course.id, ...args, force: true });
    }
    return r;
  };

  return openForm({
    title: `＋ 대신 등록 — ${course.title}`, okLabel: "등록", cancelLabel: "닫기",
    html: `<div class="tabs" role="tablist"><button type="button" role="tab" data-tab="pick" class="on">교인명부에서 찾기</button>
        <button type="button" role="tab" data-tab="typed">직접 입력(새가족 등)</button></div>
      <div data-panel="pick">
        <label class="field"><span>이름</span><input data-q maxlength="40" autocomplete="off" placeholder="이름을 쓰고 찾기를 눌러 주세요"></label>
        <button type="button" class="btn" data-find>찾기</button>
        <div data-res></div></div>
      <div data-panel="typed" hidden>
        <label class="field"><span>이름</span><input data-t="name" maxlength="40" autocomplete="off"></label>
        <label class="field"><span>구분</span><input data-t="who" maxlength="40" value="새가족" autocomplete="off"></label>
        <label class="field"><span>소속 <small>(안 써도 돼요)</small></span><input data-t="group" maxlength="40" autocomplete="off"></label>
        <label class="field"><span>세부 <small>(안 써도 돼요)</small></span><input data-t="sub" maxlength="40" autocomplete="off"></label></div>`,
    onOpen: (root) => {
      const ok = root.querySelector(".be-ok"), res = root.querySelector("[data-res]"), q = root.querySelector("[data-q]");
      ok.style.display = "none";   // 찾기 쪽은 카드마다 「등록」이 있다
      first = JSON.stringify(typedVals(root));
      const find = async () => {
        const name = q.value;
        if (!name.trim()) { res.innerHTML = `<p class="empty">이름을 써 주세요</p>`; return; }
        res.innerHTML = `<p class="empty">찾는 중…</p>`;
        const r = await call("eduPeopleLookup", { name });
        if (!root.isConnected) return;
        if (!r.ok) { cands = []; res.innerHTML = `<p class="empty">${esc(failText(r))}</p>`; return; }
        if (r.source === null) { cands = []; res.innerHTML = `<p class="empty">교인명부가 없어 직접 입력으로 넣어 주세요</p>`; return; }
        cands = r.people || []; searched = name;
        res.innerHTML = cands.length ? cands.map(candCard).join("") : `<p class="empty">교인명부에 없어요 — 「직접 입력」으로 넣어 주세요</p>`;
      };
      q.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); find(); } });
      root.addEventListener("click", async (ev) => {
        const t = ev.target.closest("[data-tab]");
        if (t) {
          tab = t.dataset.tab;
          root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === t));
          root.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== tab; });
          ok.style.display = tab === "pick" ? "none" : "";
          return;
        }
        if (ev.target.closest("[data-find]")) { await find(); return; }
        const reg = ev.target.closest("[data-reg]");
        if (!reg || adding) return;
        const i = Number(reg.dataset.reg), p = cands[i];
        if (!p) return;
        adding = true; reg.disabled = true;
        let done = false;
        try {
          // name 은 찾을 때 넣은 그 글자 · pick 은 받은 목록의 차례(0부터) · check 는 그 카드의 다섯 칸 그대로
          const r = await addCall({ name: searched, pick: i,
            check: { who_type: p.who_type || "", group: p.group || "", sub: p.sub || "", church_mok: p.church_mok || "", position: p.position || "" } });
          if (!root.isConnected || r.kept) return;
          if (r.ok) { added = true; done = true; toast(`${p.name} — ${addDoneText(r)}`); reg.textContent = "등록됨"; return; }
          if (r.error === "changed") { cands = []; res.innerHTML = `<p class="empty">${esc(errorWord("changed"))}</p>`; toast(errorWord("changed")); return; }
          toast(failText(r));
        } finally { adding = false; if (reg.isConnected && !done) reg.disabled = false; }
      });
    },
    isDirty: (root) => JSON.stringify(typedVals(root)) !== first,
    onSubmit: async (root) => {
      if (adding) return { ok: false };
      const v = typedVals(root);
      if (!v.name.trim()) return { ok: false, message: "이름을 써 주세요" };
      adding = true;
      try {
        const r = await addCall({ ident: { name: v.name, who_type: v.who, group_name: v.group, sub_name: v.sub } });
        if (r.kept) return { ok: false };
        if (r.ok) { added = true; toast(`${v.name.trim()} — ${addDoneText(r)}`); return { ok: true, value: true }; }
        return { ok: false, message: failText(r) };
      } finally { adding = false; }
    },
  }).then(() => added);
}

// ---------- 화면 ----------
export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let courses = [], cur = null, list = [], foldOpen = false;
  const pending = new Set();   // 같은 줄·같은 단추를 두 번 누르는 것 막기

  const loadCourses = async () => {
    const r = await call("eduCourses", {});
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return false; }
    courses = r.courses || [];
    return true;
  };
  const loadList = async () => {
    if (!cur) return true;
    const r = await call("eduEnrollList", { course_id: cur.id });
    if (!r.ok) {
      if (r.error === "not-found") { toast("그 강좌를 찾지 못했어요"); cur = null; lastCourseId = ""; return true; }
      toast(errorText(r)); return false;
    }
    cur = { ...cur, ...r.course }; list = r.enrollments || [];
    return true;
  };
  const refresh = async () => { if (await loadList()) draw(); };

  const draw = () => {
    const head = `${TITLE}<div class="acts"><button type="button" class="btn" data-act="course">${cur ? esc(`${cur.title}${cur.term ? " · " + cur.term : ""} · ${cur.statusLabel}`) : "강좌 고르기"}</button></div>`;
    if (!cur) { el.innerHTML = head + `<p class="empty">${courses.length ? "강좌를 골라 주세요" : "아직 강좌가 없어요 — 「📚 강좌 관리」에서 먼저 만들어 주세요"}</p>`; return; }
    const g = groupByStatus(list);
    const folded = FOLDED.reduce((n, [k]) => n + (g[k] || []).length, 0);
    el.innerHTML = head + `<p class="muted">${esc(capacityLine(cur))}</p>
      <div class="acts"><button type="button" class="btn" data-act="export">엑셀로 내려받기</button>
        <button type="button" class="btn primary" data-act="add">＋ 대신 등록</button></div>
      ${SECTIONS.map(([k, l]) => sectionHtml(g[k] || [], l)).join("")}
      <details data-fold ${foldOpen ? "open" : ""}><summary>취소·반려 ${folded}명</summary>
        ${FOLDED.map(([k, l]) => sectionHtml(g[k] || [], l)).join("")}</details>`;
  };

  if (!(await loadCourses())) return;
  cur = courses.find((c) => c.id === lastCourseId) || null;
  if (cur) await loadList();
  draw();

  el.addEventListener("toggle", (e) => { if (e.target.matches("[data-fold]")) foldOpen = e.target.open; }, true);

  async function setStatus(e, op, force) {
    const r = await busy(el, () => call("eduEnrollSet", { id: e.id, op, ...(force ? { force: true } : {}) }));
    if (!r.ok) {
      if (r.error === "full" && op === "confirm" && !force) {
        const yes = await dialog({ title: "정원이 찼어요", text: `정원(${cur.capacity}명)이 찼어요. 그래도 확정할까요?`, ok: "넘겨서 확정", cancel: "그만두기" });
        if (yes) await setStatus(e, op, true);
        return;
      }
      toast(failText(r)); await refresh(); return;
    }
    toast(r.promoted ? "대기 첫 분이 확정됐어요" : "바꿨어요");
    await refresh();
  }

  async function exportXlsx() {
    const r = await busy(el, () => call("eduExport", { course_id: cur.id }));
    if (!r.ok) { toast(failText(r)); return; }
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.rows), "신청 현황");
      XLSX.writeFile(wb, exportFileName(cur.title, kstToday()));
    } catch (err) { toast(fileErrorText(err && err.message)); }
  }

  el.addEventListener("click", async (ev) => {
    const a = ev.target.closest("button[data-act]");
    if (a) {
      const act = a.dataset.act;
      if (act === "course") {
        const got = await pickOne({ anchor: a, title: "강좌", value: cur ? cur.id : "",
          options: courses.map((c) => ({ value: c.id, label: `${c.title} · ${c.term || "학기 없음"} · ${c.statusLabel}` })) });
        if (got === null || (cur && got === cur.id)) return;
        cur = courses.find((c) => c.id === got) || null; lastCourseId = cur ? cur.id : "";
        list = [];
        await busy(el, refresh);
        return;
      }
      if (!cur || pending.has(act)) return;
      pending.add(act);
      try {
        if (act === "export") await exportXlsx();
        else if (act === "add") { if (await openAddForm({ call, course: cur })) await busy(el, refresh); }
      } finally { pending.delete(act); }
      return;
    }
    const card = ev.target.closest("[data-eid]");
    const e = card ? list.find((x) => String(x.id) === card.dataset.eid) : null;
    if (!e) return;
    const key = card.dataset.eid;
    const op = ev.target.closest("[data-op]"), memo = ev.target.closest("[data-memo]");
    if (op) {
      if (pending.has(key)) return;
      pending.add(key);
      try {
        const o = op.dataset.op, text = confirmTextFor(o, e.name);
        if (text) {
          const yes = await dialog({ title: `${op.textContent} — ${e.name}`, text, ok: op.textContent, cancel: "그만두기", danger: o !== "waitlist" });
          if (!yes) return;
        }
        await setStatus(e, o, false);
      } finally { pending.delete(key); }
    } else if (memo) {
      if (pending.has(key)) return;
      pending.add(key);
      try { if (await openNoteForm({ call, e })) { toast("저장했어요"); await busy(el, refresh); } } finally { pending.delete(key); }
    }
  });

  // 교재비 체크 — 누르면 바로 저장(실패하면 되돌린다)
  el.addEventListener("change", async (ev) => {
    const box = ev.target.closest("input[data-fee]");
    if (!box) return;
    const card = box.closest("[data-eid]"), e = list.find((x) => String(x.id) === card.dataset.eid);
    if (!e) return;
    const key = "fee" + card.dataset.eid;
    if (pending.has(key)) { box.checked = !box.checked; return; }
    pending.add(key);
    const want = box.checked; box.disabled = true;
    try {
      const r = await call("eduFeeSet", { id: e.id, paid: want });
      if (r.ok) e.feePaid = want; else { box.checked = !want; toast(failText(r)); }
    } finally { pending.delete(key); box.disabled = false; }
  });
}
