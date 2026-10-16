// 📝 신청 현황 — 강좌 고르기 · 묶음별 명단 · 확정/대기/반려/취소/다시 받기 · 정원 넘겨 확정 · 대신 등록 · 교재비·메모 · 엑셀
//   (교육신청 1단계 과제 6 · 2026-10-05) 서버: eduCourses·eduEnrollList·eduEnrollSet·eduEnrollAdd·eduFeeSet·eduExport·eduPeopleLookup
//   역할 education(교육 총괄 — 모든 강좌) · educourse(교육 담당 — 맡은 강좌만 · 2026-10-05). 강좌 고르기는 eduCourses 가 준 목록 그대로
//   (서버가 담당에게는 맡은 강좌만 준다 · scope "assigned"). 맡지 않은 강좌는 서버가 not-assigned 로 막는다 — 여기서 숨기는 것은 편의일 뿐.
//   규칙(묶음·단추·문구)은 enrollments-logic.js(시험). 정원·대기·대기 올림은 SQL 함수 한 곳 — 여기서 상태를 직접 바꾸지 않는다.
// ⚠️ 교인ID 는 화면에 오지 않는다 — 대신 등록은 찾은 이름·몇 번째·소속 확인값(check)만 서버로 보내고 서버가 같은 찾기를 다시 돌려 확인한다.
// ⚠️ 고르기는 picker.js(pickOne)만 — 시스템 select·date·time 칸 금지. 서버 글자는 모두 esc.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne } from "../../core/picker.js";
import { loadXlsx } from "../../core/xlsx.js";
import { groupByStatus, actionsFor, capacityLine, errorWord, exportFileName, addDoneText, confirmTextFor, hasErrorWord, pickArgs, shortApplied,
  dupBadge, TYPED_SUB_HINT, parseNameList, autoPick, bulkWhyText, bulkDoneText, BULK_MAX } from "./enrollments-logic.js";
import { aTitle, lineSvg } from "../../core/icons.js";

const TITLE = aTitle("doc", "신청 현황");   // 성경앱 스타일 머리(2026-10-17)
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
// 알려진 말이면 errorWord, 아니면(연결·권한 등) 공용 errorText
const failText = (r) => (hasErrorWord(r?.error) ? errorWord(r.error) : errorText(r));
const SECTIONS = [["applied", "승인 기다림"], ["confirmed", "확정"], ["waitlisted", "대기"]];
const FOLDED = [["cancelled", "취소"], ["declined", "반려"]];

let lastCourseId = "";   // 메뉴를 나갔다 와도 보던 강좌를 기억(모듈 안) · "" = 전체 강좌(처음 · 2026-10-17)

// ---------- 줄 ----------
function rowHtml(e) {
  const acts = actionsFor(e).map((a) => `<button type="button" class="btn${a.danger ? " danger" : ""}" data-op="${a.op}">${esc(a.label)}</button>`).join("");
  return `<div class="ee-row" data-eid="${esc(e.id)}">
    <div class="ee-l1"><div class="ee-who"><b>${esc(e.name)}</b>${e.status === "waitlisted" ? ` <span class="badge">대기 ${esc(e.waitNo || "")}번</span>` : ""} <span class="badge">${e.source === "staff" ? "담당자" : "앱"}</span>${e.maybeDup ? " " + dupBadge(e) : ""}</div>
      <label class="ee-fee"><input type="checkbox" data-fee ${e.feePaid ? "checked" : ""}> 교재비</label></div>
    <div class="ee-l2">${esc(e.who || "")}${e.who ? " · " : ""}${esc(shortApplied(e.appliedAt))}</div>
    ${e.note ? `<div class="ee-memo">메모: ${esc(e.note)}</div>` : ""}
    <div class="ee-acts"><button type="button" class="btn" data-memo>메모</button>${acts}</div>
  </div>`;
}
// 묶음 하나 — 제목(회색) + 흰 카드 한 장 안의 줄(성경앱 스타일 · 2026-10-17)
const sectionHtml = (list, label) => `<h3 class="ee-h">${esc(label)} <small class="muted">${list.length}명</small></h3>` +
  (list.length ? `<div class="ee-list">${list.map(rowHtml).join("")}</div>` : `<p class="empty">없어요</p>`);

// 강좌 한 덩이(전체 보기 · 한 강좌 보기 같은 꼴) — 머리 카드(이름 · 상태 · 학기 · 정원 줄 · 엑셀 · 대신 등록) + 승인 기다림 · 확정 · 대기 + 취소·반려(접힘).
//   전체 보기에서는 0명인 묶음을 그리지 않는다(한 강좌만 볼 때는 「없어요」까지 — 예전 그대로) · 취소·반려가 없으면 접는 줄도 없다.
function blockHtml(b, all, open) {
  const c = b.cur, g = groupByStatus(b.list), cid = esc(c.id);
  const head = `<div class="card ee-ch"><div class="ee-ct"><b>${esc(c.title)}</b><span class="badge ec-st" data-st="${esc(c.status)}">${esc(c.statusLabel)}</span></div>` +
    `<p class="muted ee-cs">${esc([c.term, c.counts ? capacityLine(c) : ""].filter(Boolean).join(" · "))}</p>` +
    `<div class="ee-tools"><button type="button" class="btn" data-act="export" data-cid="${cid}">${lineSvg("download", "btn-i")}엑셀로 받기</button>` +
    `<button type="button" class="btn primary" data-act="add" data-cid="${cid}">＋ 대신 등록</button></div></div>`;
  if (b.err) return `<section class="ee-course" data-cid="${cid}">${head}<p class="empty">${esc(b.err)}</p></section>`;
  const secs = SECTIONS.filter(([k]) => !all || (g[k] || []).length).map(([k, l]) => sectionHtml(g[k] || [], l)).join("");
  const folded = FOLDED.reduce((n, [k]) => n + (g[k] || []).length, 0);
  return `<section class="ee-course" data-cid="${cid}">${head}${secs || `<p class="empty ee-none">아직 신청한 분이 없어요</p>`}` +
    (folded ? `<details data-fold="${cid}"${open ? " open" : ""}><summary>취소·반려 ${folded}명</summary>` +
      `${FOLDED.map(([k, l]) => sectionHtml(g[k] || [], l)).join("")}</details>` : "") + `</section>`;
}

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
const candCard = (p, i) => `<div class="card ee-row" data-cand="${i}">
  <div><b>${esc(p.name)}</b></div><div class="muted">${esc(candLine(p))}</div>
  ${p.church_mok || p.position ? `<div class="muted">${esc([p.church_mok, p.position].filter(Boolean).join(" · "))}</div>` : ""}
  <div class="ee-acts"><button type="button" class="btn primary" data-reg="${i}">등록</button></div></div>`;

// 여러 명 한꺼번에(2026-10-16) — 후보 한 분을 짧게: 교적 목장 · 직분(없으면 앱 꼴 소속)
const bulkCand = (p) => [p.church_mok || [p.group, p.sub].filter(Boolean).join(" ") || p.who_type, p.position].filter(Boolean).join(" · ");
function bulkRowHtml(r, i, busyNow) {
  const st = r.state === "loading" ? ["찾는 중…", ""] : r.state === "error" ? [r.msg, "bad"] : r.state === "done" ? [r.msg, "ok"]
    : r.state === "fail" ? [r.msg, "bad"] : [bulkWhyText(r.why), r.pick === null ? (r.cands.length ? "need" : "bad") : ""];
  const chips = r.state === "ready" && r.cands.length
    ? `<div class="ee-bulk-c" role="group" aria-label="${esc(r.name)} — 고르기">${r.cands.map((p, j) =>
        `<button type="button" class="ee-bp${r.pick === j ? " on" : ""}" data-bp="${i}:${j}" aria-pressed="${r.pick === j}"${busyNow ? " disabled" : ""}>${esc(bulkCand(p))}</button>`).join("")}` +
      `<button type="button" class="ee-bp skip${r.pick === null ? " on" : ""}" data-bp="${i}:-1" aria-pressed="${r.pick === null}"${busyNow ? " disabled" : ""}>넣지 않음</button></div>`
    : "";
  return `<div class="card ee-row ee-bulk-row"><div class="ee-bulk-h"><b>${esc(r.name)}</b>${r.hint ? ` <small class="muted">${esc(r.hint)}</small>` : ""}` +
    `<span class="ee-bulk-st ${st[1]}">${esc(st[0] || "")}</span></div>${chips}</div>`;
}

// → 하나라도 등록했으면 true · export 는 화면 시험(가짜 call 로 창만 띄워 본다)이 부른다
export async function openAddForm({ call, course }) {
  let tab = "pick", added = false, adding = false;
  // 여러 명 한꺼번에 — 줄마다 { name, hint, cands, pick, why, state(loading·ready·error·done·fail), msg }
  let bulkRows = [], bulkSkipped = [], bulkBusy = false;
  const bulkPending = () => bulkRows.some((r) => r.state === "ready" && r.pick !== null);
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
    title: `＋ 대신 등록 — ${course.title}`, okLabel: "등록", cancelLabel: "닫기", hideOk: true,   // 찾기 쪽은 카드마다 「등록」이 있다
    html: `<div class="tabs" role="tablist"><button type="button" role="tab" data-tab="pick" class="on">교인명부에서 찾기</button>
        <button type="button" role="tab" data-tab="bulk">여러 명 한꺼번에</button>
        <button type="button" role="tab" data-tab="typed">직접 입력(새가족 등)</button></div>
      <div data-panel="bulk" hidden>
        <label class="field"><span>명단 <small>(줄이나 쉼표로 · 같은 이름이 여럿이면 「김경희 섬김-18」처럼 목장을 함께)</small></span>
          <textarea data-bulk rows="6" maxlength="4000" placeholder="이양덕, 차계섬, 권정희&#10;김경희 섬김-18"></textarea></label>
        <button type="button" class="btn ee-find" data-bulk-find>명단 찾기</button>
        <div data-bulk-res></div></div>
      <div data-panel="pick">
        <label class="field"><span>이름</span><input data-q maxlength="40" autocomplete="off" placeholder="이름을 쓰고 찾기를 눌러 주세요"></label>
        <button type="button" class="btn ee-find" data-find>찾기</button>
        <div data-res></div></div>
      <div data-panel="typed" hidden>
        <label class="field"><span>이름</span><input data-t="name" maxlength="40" autocomplete="off"></label>
        <label class="field"><span>구분</span><input data-t="who" maxlength="40" value="새가족" autocomplete="off"></label>
        <label class="field"><span>소속 <small>(안 써도 돼요)</small></span><input data-t="group" maxlength="40" autocomplete="off"></label>
        <label class="field"><span>세부 <small>(안 써도 돼요)</small></span><input data-t="sub" maxlength="40" autocomplete="off"></label>
        <p class="muted ee-hint">${esc(TYPED_SUB_HINT)}</p></div>`,
    onOpen: (root) => {
      const res = root.querySelector("[data-res]"), q = root.querySelector("[data-q]");
      first = JSON.stringify(typedVals(root));
      const find = async () => {
        const name = q.value;
        if (!name.trim()) { res.innerHTML = `<p class="empty">이름을 써 주세요</p>`; return; }
        res.innerHTML = `<p class="empty">찾는 중…</p>`;
        const r = await call("eduPeopleLookup", { name, course_id: course.id });   // 담당은 맡은 강좌의 창에서만 찾을 수 있다(서버가 강좌를 본다)
        if (!root.isConnected) return;
        if (!r.ok) { cands = []; res.innerHTML = `<p class="empty">${esc(failText(r))}</p>`; return; }
        if (r.source === null) { cands = []; res.innerHTML = `<p class="empty">교인명부가 없어 직접 입력으로 넣어 주세요</p>`; return; }
        cands = r.people || []; searched = name;
        res.innerHTML = cands.length ? cands.map(candCard).join("") : `<p class="empty">교인명부에 없어요 — 「직접 입력」으로 넣어 주세요</p>`;
      };
      q.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); find(); } });

      // ── 여러 명 한꺼번에(2026-10-16) — 찾기는 이름마다 eduPeopleLookup(셋씩 함께) · 등록은 한 분씩 eduEnrollAdd(같은 서버 확인)
      const bres = root.querySelector("[data-bulk-res]"), bta = root.querySelector("[data-bulk]");
      const bdraw = () => {
        if (!root.isConnected) return;
        const skip = bulkSkipped.length ? `<p class="muted ee-hint">이름이 아니라서 건너뛴 줄: ${esc(bulkSkipped.join(" · ").slice(0, 160))}</p>` : "";
        if (!bulkRows.length) { bres.innerHTML = skip; return; }
        const n = (f) => bulkRows.filter(f).length;
        const chosen = n((r) => r.state === "ready" && r.pick !== null), need = n((r) => r.state === "ready" && r.pick === null && r.cands.length);
        const none = n((r) => (r.state === "ready" && !r.cands.length) || r.state === "error"), done = n((r) => r.state === "done");
        const loading = n((r) => r.state === "loading");
        const sum = [`고른 분 ${chosen}명`, need ? `골라야 할 분 ${need}명` : "", none ? `못 찾음 ${none}명` : "", done ? `등록됨 ${done}명` : ""].filter(Boolean).join(" · ");
        bres.innerHTML = skip + `<p class="ee-bulk-sum" role="status">${esc(loading ? `찾는 중… (${bulkRows.length - loading}/${bulkRows.length})` : sum)}</p>` +
          bulkRows.map((r, i) => bulkRowHtml(r, i, bulkBusy)).join("") +
          `<div class="ee-acts ee-bulk-go"><button type="button" class="btn primary" data-bulk-add${chosen && !loading && !bulkBusy ? "" : " disabled"}>` +
          `${bulkBusy ? "등록하는 중…" : `고른 ${chosen}명 등록`}</button></div>` +
          (none ? `<p class="muted ee-hint">못 찾은 분은 이름을 확인해 「교인명부에서 찾기」로, 명부에 없는 분은 「직접 입력」으로 넣어 주세요.</p>` : "");
      };
      const bulkFind = async () => {
        if (bulkBusy) return;
        const { items, skipped } = parseNameList(bta.value);
        if (!items.length) { bulkRows = []; bulkSkipped = skipped; bdraw(); toast("이름을 찾지 못했어요 — 줄이나 쉼표로 나눠 적어 주세요"); return; }
        if (items.length > BULK_MAX) { toast(`한 번에 ${BULK_MAX}명까지예요 — 나눠서 찾아 주세요`); return; }
        bulkSkipped = skipped;
        bulkRows = items.map((x) => ({ ...x, cands: [], pick: null, why: "", state: "loading", msg: "" }));
        bulkBusy = true; bdraw();
        let next = 0;
        const worker = async () => {
          while (next < bulkRows.length) {
            const r = bulkRows[next++];
            const res = await call("eduPeopleLookup", { name: r.name, course_id: course.id });
            if (!root.isConnected) return;
            if (!res.ok) { r.state = "error"; r.msg = failText(res); }
            else if (res.source === null) { r.state = "error"; r.msg = "교인명부가 없어요"; }
            else { r.cands = res.people || []; const a = autoPick(r.cands, r.hint); r.pick = a.pick; r.why = a.why; r.state = "ready"; }
            bdraw();
          }
        };
        try { await Promise.all([worker(), worker(), worker()]); } finally { bulkBusy = false; bdraw(); }
      };
      const bulkAdd = async () => {
        if (bulkBusy || adding) return;
        const todo = bulkRows.filter((r) => r.state === "ready" && r.pick !== null);
        if (!todo.length) { toast("고른 분이 없어요"); return; }
        const yes = await dialog({ title: "여러 명 등록", text: `고른 ${todo.length}명을 「${course.title}」에 등록할까요? 정원 안이면 확정, 넘치면 대기로 들어가요.`, ok: "등록", cancel: "취소" });
        if (!yes || !root.isConnected) return;
        bulkBusy = true; adding = true; bdraw();
        let ok = 0, bad = 0;
        try {
          for (const r of todo) {
            // name 은 찾을 때 넣은 그 글자 · pick 은 그 이름으로 받은 목록의 차례 · check 는 그 후보의 다섯 칸(하나씩 찾기와 같다)
            const res = await call("eduEnrollAdd", { course_id: course.id, ...pickArgs(r.name, r.pick, r.cands[r.pick]) });
            if (!root.isConnected) return;
            if (res.ok) { r.state = "done"; r.msg = bulkDoneText(res); ok++; added = true; }
            else { r.state = "fail"; r.msg = bulkDoneText(res) || failText(res); bad++; }
            bdraw();
          }
        } finally { bulkBusy = false; adding = false; bdraw(); }
        toast(`${ok}명 등록했어요${bad ? ` · ${bad}명은 넣지 못했어요` : ""}`);
      };
      root.addEventListener("click", async (ev) => {
        const t = ev.target.closest("[data-tab]");
        if (t) {
          tab = t.dataset.tab;
          root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === t));
          root.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== tab; });
          if (tab === "typed") delete root.dataset.hideOk; else root.dataset.hideOk = "1";   // 찾기 · 여러 명은 자기 단추가 있다
          return;
        }
        if (ev.target.closest("[data-find]")) { await find(); return; }
        if (ev.target.closest("[data-bulk-find]")) { await bulkFind(); return; }
        if (ev.target.closest("[data-bulk-add]")) { await bulkAdd(); return; }
        const bp = ev.target.closest("[data-bp]");
        if (bp) {
          if (bulkBusy) return;
          const [i, j] = bp.dataset.bp.split(":").map(Number), r = bulkRows[i];
          if (r && r.state === "ready") { r.pick = j >= 0 && j < r.cands.length ? j : null; bdraw(); }
          return;
        }
        const reg = ev.target.closest("[data-reg]");
        if (!reg || adding) return;
        const i = Number(reg.dataset.reg), p = cands[i];
        if (!p) return;
        adding = true; reg.disabled = true;
        let done = false;
        try {
          // name 은 찾을 때 넣은 그 글자 · pick 은 받은 목록의 차례(0부터) · check 는 그 카드의 다섯 칸 그대로
          const r = await addCall(pickArgs(searched, i, p));
          if (!root.isConnected || r.kept) return;
          if (r.ok) { added = true; done = true; toast(`${p.name} — ${addDoneText(r)}`); reg.textContent = "등록됨"; return; }
          if (r.error === "changed") { cands = []; res.innerHTML = `<p class="empty">${esc(errorWord("changed"))}</p>`; toast(errorWord("changed")); return; }
          toast(failText(r));
        } finally { adding = false; if (reg.isConnected && !done) reg.disabled = false; }
      });
    },
    isDirty: (root) => JSON.stringify(typedVals(root)) !== first || bulkPending(),   // 여러 명 — 골라 두고 아직 안 넣은 분이 있으면
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
  el.classList.add("ee-page");   // PC 에서 읽기 좋은 폭(css .ee-page)
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  // sel — "" = 전체 강좌(처음 · 강좌마다 덩이 하나) · 강좌 id = 그 강좌만. blocks = 보이는 강좌들 [{cur, list, err?}]
  let courses = [], scope = "all", sel = lastCourseId, blocks = [];
  const foldOpen = new Set();   // 취소·반려를 펼친 강좌 id
  const pending = new Set();    // 같은 줄·같은 단추를 두 번 누르는 것 막기

  const loadCourses = async () => {
    const r = await call("eduCourses", {});
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return false; }
    courses = r.courses || [];
    scope = r.scope === "assigned" ? "assigned" : "all";
    return true;
  };
  // 강좌 c 의 명단 — 아무것도 바꾸지 않고 돌려준다 → { ok, block } · { ok:false, gone:"강좌를 놓을 까닭" }(없어졌다 · 담당에서 빠졌다) · { ok:false, error }
  const loadFor = async (c) => {
    const r = await call("eduEnrollList", { course_id: c.id });
    if (!r.ok && r.error === "not-found") return { ok: false, gone: "그 강좌를 찾지 못했어요" };
    if (!r.ok && r.error === "not-assigned") return { ok: false, gone: errorText(r) };   // 그사이 담당에서 빠졌다
    if (!r.ok) return { ok: false, error: r };
    return { ok: true, block: { cur: { ...c, ...r.course }, list: r.enrollments || [] } };
  };
  // 보기를 불러온다 — 전체면 강좌마다 나란히(못 불러온 강좌는 그 덩이에 까닭 · 없어진 강좌는 뺀다) · 한 강좌가 없어졌으면 전체로.
  //   한 강좌를 못 불러왔으면(그 밖의 오류) blocks 를 바꾸지 않고 { error } — 보던 화면이 그대로 남는다.
  const loadView = async () => {
    const one = sel ? courses.find((c) => c.id === sel) : null;
    if (sel && !one) { sel = ""; lastCourseId = ""; }
    const targets = one ? [one] : courses;
    const rs = await Promise.all(targets.map(loadFor));
    if (one && !rs[0].ok) {
      if (rs[0].gone) { toast(rs[0].gone); sel = ""; lastCourseId = ""; return loadView(); }
      return { error: rs[0].error };
    }
    blocks = rs.map((r, i) => (r.ok ? r.block : r.gone ? null : { cur: targets[i], list: [], err: errorText(r.error) })).filter(Boolean);
    return { ok: true };
  };
  // 한 강좌만 다시(줄을 바꾼 뒤) — 없어졌으면 그 덩이를 뺀다(한 강좌 보기였으면 전체로)
  const refreshCourse = async (cid) => {
    const i = blocks.findIndex((b) => String(b.cur.id) === String(cid));
    if (i < 0) return;
    const r = await loadFor(blocks[i].cur);
    if (r.ok) blocks[i] = r.block;
    else if (r.gone) {
      toast(r.gone); blocks.splice(i, 1);
      if (sel && String(sel) === String(cid)) { sel = ""; lastCourseId = ""; await loadView(); }
    } else { toast(errorText(r.error)); return; }
    draw();
  };
  const selLabel = () => {
    const c = sel ? courses.find((x) => x.id === sel) : null;
    return c ? `${c.title}${c.term ? " · " + c.term : ""} · ${c.statusLabel}` : `전체 강좌 (${courses.length}개)`;
  };

  const draw = () => {
    if (!el.isConnected) return;
    if (!courses.length) {
      el.innerHTML = TITLE + `<p class="empty">${scope === "assigned"
        ? "맡은 강좌가 아직 없어요 — 교육 총괄께 「📚 강좌 관리」에서 담당자로 넣어 달라고 말씀해 주세요"
        : "아직 강좌가 없어요 — 「📚 강좌 관리」에서 먼저 만들어 주세요"}</p>`;
      return;
    }
    el.innerHTML = TITLE + `<div class="ee-top"><button type="button" class="btn wide a-field" data-act="course"><small>강좌</small><b>${esc(selLabel())}</b></button></div>` +
      (blocks.length ? blocks.map((b) => blockHtml(b, !sel, foldOpen.has(String(b.cur.id)))).join("") : `<p class="empty">보여 드릴 강좌가 없어요</p>`);
  };

  if (!(await loadCourses())) return;
  const v = await loadView();
  if (v.error) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(v.error))}</p>`; return; }
  draw();

  el.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d instanceof Element && d.matches("[data-fold]")) { if (d.open) foldOpen.add(d.dataset.fold); else foldOpen.delete(d.dataset.fold); }
  }, true);

  const blockOf = (eid) => blocks.find((b) => b.list.some((x) => String(x.id) === String(eid)));
  async function setStatus(b, e, op, force) {
    const r = await busy(el, () => call("eduEnrollSet", { id: e.id, op, ...(force ? { force: true } : {}) }));
    if (!r.ok) {
      if (r.error === "full" && op === "confirm" && !force) {
        const yes = await dialog({ title: "정원이 찼어요", text: `정원(${b.cur.capacity}명)이 찼어요. 그래도 확정할까요?`, ok: "넘겨서 확정", cancel: "그만두기" });
        if (yes) await setStatus(b, e, op, true);
        return;
      }
      toast(failText(r)); await refreshCourse(b.cur.id); return;
    }
    toast(r.promoted ? "대기 첫 분이 확정됐어요" : force ? "정원을 넘겨 확정했어요" : "바꿨어요");
    await refreshCourse(b.cur.id);
  }

  async function exportXlsx(c) {
    const r = await busy(el, () => call("eduExport", { course_id: c.id }));
    if (!r.ok) { toast(failText(r)); return; }
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.rows), "신청 현황");
      XLSX.writeFile(wb, exportFileName(c.title, kstToday()));
    } catch { toast("엑셀 파일을 만들지 못했어요"); }
  }

  el.addEventListener("click", async (ev) => {
    const a = ev.target.closest("button[data-act]");
    if (a) {
      const act = a.dataset.act;
      if (act === "course") {
        const got = await pickOne({ anchor: a, title: "강좌", value: sel,
          options: [{ value: "", label: "전체 강좌", hint: `${courses.length}개 강좌를 한꺼번에` },
            ...courses.map((c) => ({ value: c.id, label: `${c.title} · ${c.term || "학기 없음"} · ${c.statusLabel}` }))] });
        if (got === null || got === sel || !el.isConnected) return;
        const prev = sel;
        sel = got;
        const r = await busy(el, loadView);   // 실패하면 보던 화면이 그대로 남는다
        if (r.error) { sel = prev; toast(errorText(r.error)); return; }
        lastCourseId = sel; draw();
        return;
      }
      const b = blocks.find((x) => String(x.cur.id) === a.dataset.cid);
      const key = act + ":" + (a.dataset.cid || "");
      if (!b || pending.has(key)) return;
      pending.add(key);
      try {
        if (act === "export") await exportXlsx(b.cur);
        else if (act === "add") { if (await openAddForm({ call, course: b.cur })) await busy(el, () => refreshCourse(b.cur.id)); }
      } finally { pending.delete(key); }
      return;
    }
    const card = ev.target.closest("[data-eid]");
    const b = card ? blockOf(card.dataset.eid) : null;
    const e = b ? b.list.find((x) => String(x.id) === card.dataset.eid) : null;
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
        await setStatus(b, e, o, false);
      } finally { pending.delete(key); }
    } else if (memo) {
      if (pending.has(key)) return;
      pending.add(key);
      try { if (await openNoteForm({ call, e })) { toast("저장했어요"); await busy(el, () => refreshCourse(b.cur.id)); } } finally { pending.delete(key); }
    }
  });

  // 교재비 체크 — 누르면 바로 저장(실패하면 되돌린다)
  el.addEventListener("change", async (ev) => {
    const box = ev.target.closest("input[data-fee]");
    if (!box) return;
    const card = box.closest("[data-eid]"), b = card ? blockOf(card.dataset.eid) : null;
    const e = b ? b.list.find((x) => String(x.id) === card.dataset.eid) : null;
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
