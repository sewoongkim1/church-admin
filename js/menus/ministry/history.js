// 📜 사역 이력 — 지난 해 사역 임명 명단(엑셀)을 올리고, 교인명부의 교인ID 와 잇는다(2026-10-01).
//   설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md §3·§5
//   막는 것은 서버다(역할 ministry · 교인ID 는 교인명부·총괄에게만 실린다 · 후보 고르기는 차례 번호 + 목록 지문 fp).
//   엑셀 읽기는 core/xlsx.js loadXlsx 한 곳 · 파일 고르기 + 끌어다 놓기 + 붙여넣기(CLAUDE.md 팝업 규칙의 유일한 예외 몫).
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import { openForm } from "../../core/modal.js";
import { loadXlsx } from "../../core/xlsx.js";
import { fileErrorText } from "../bibleevent/upload-logic.js";
import { openPerson } from "../people/search.js";
import { parseHistorySheet, findHeader, textToAoa, sendParts, yearOptions, linkState, STATE_TEXT, STATE_CLASS, whyText,
  mergeChecks, exportAoa, exportName, EDIT_KEYS, editPatch } from "./history-logic.js";

const TITLE = `<h2 class="page-title">📜 사역 이력</h2>`;
const mqWide = matchMedia("(min-width:1024px)");   // PC 는 표, 폰은 카드
let unbindMq = null, unbindPaste = null;
const f = { years: [], only: "", q: "", page: 0 };  // 메뉴를 옮겨도 남는 거르기
const FAMILY_NOTE = "가족은 교인명부 「🔎 교인 찾기」에서 볼 수 있어요";
const num = (n) => Number(n || 0).toLocaleString("ko-KR");
const STALE = { conflict: "다른 분이 먼저 바꿨어요 — 창을 닫고 다시 열어 주세요", "not-found": "이미 빠진 줄이에요 — 목록을 새로 불러올게요" };
const FIELD = { year: "해", committee: "부서", team: "팀명", role_title: "직책", name: "이름", position: "직분", mok: "목장",
  renewal: "신규/유지", src_note: "원본 메모" };

const badge = (r) => { const s = linkState(r); return `<em class="cb ${STATE_CLASS[s]}">${STATE_TEXT[s]}</em>`; };
const sub = (r) => [`${r.year}년`, r.committee, r.team, r.mok].filter(Boolean).join(" · ");

function cardHtml(r) {
  const why = whyText(r);
  return `<div class="be-row"><div class="be-row-h"><div class="be-row-nm"><b>${esc(r.name)}</b>` +
    `${r.position ? ` <span class="be-pos">${esc(r.position)}</span>` : ""}<span class="be-row-sub">${esc(sub(r))}</span>` +
    `<span class="be-badges">${badge(r)}</span></div>` +
    `<button type="button" class="be-more" data-act="row" data-id="${r.id}" aria-label="${esc(r.name)} 줄 열기">⋯</button></div>` +
    (why ? `<div class="mh-why">${esc(why)}</div>` : "") + `</div>`;
}
function tableHtml(rows) {
  const head = `<tr><th>해</th><th>부서</th><th>팀</th><th>이름</th><th>직분</th><th>목장</th><th>교적</th><th><span class="be-sr">열기</span></th></tr>`;
  const body = rows.map((r) => `<tr><td>${r.year}</td><td>${esc(r.committee)}</td><td>${esc(r.team)}</td><td><b>${esc(r.name)}</b></td>` +
    `<td>${esc(r.position)}</td><td>${esc(r.mok)}</td><td>${badge(r)}<div class="mh-why">${esc(whyText(r))}</div></td>` +
    `<td><button type="button" class="be-more" data-act="row" data-id="${r.id}" aria-label="${esc(r.name)} 줄 열기">⋯</button></td></tr>`).join("");
  return `<div class="be-tbl-wrap"><table class="be-table mh-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function checkHtml(name, checks) {
  const t = mergeChecks(checks);
  const years = checks.map((c) => `<li>${c.year}년 — 새 줄 <b>${num(c.d.counts.add)}</b> · 이미 있음 ${num(c.d.counts.same)}` +
    (c.d.counts.deleted ? ` · 빼 둔 줄과 같음 ${num(c.d.counts.deleted)}` : "") + (c.d.counts.dup ? ` · 파일 안 겹침 ${num(c.d.counts.dup)}` : "") +
    (c.d.counts.bad ? ` · <span class="mh-bad">틀린 줄 ${num(c.d.counts.bad)}</span>` : "") + `</li>`).join("");
  const reasons = t.reasons.slice(0, 6).map(([w, n]) => `<li>${esc(w)} — ${num(n)}줄</li>`).join("");
  return `<p class="mh-file">${esc(name)}</p><ul class="mh-ul">${years}</ul>` +
    (t.add ? (t.noDirectory ? `<p class="be-note">교인명부가 아직 올라오지 않아 교적은 넣은 뒤 맞춰요.</p>`
      : `<p class="mh-pre">새 줄을 미리 맞춰 보면 교적이 붙는 줄 <b>${num(t.linked)}</b> · 못 맞추는 줄 <b>${num(t.unlinked)}</b></p>`) : "") +
    (reasons ? `<ul class="mh-ul mh-reasons">${reasons}</ul>` : "") +
    (t.bad ? `<p class="be-warn">틀린 줄(해·이름 없음 · 칸이 너무 김)은 넣지 않아요.</p>` : "");
}

function fieldsHtml(v) {
  const inp = (k, extra = "") => `<label class="field"><span>${FIELD[k]}</span><input data-f="${k}" value="${esc(v[k] ?? "")}" ${extra} autocomplete="off"></label>`;
  return `<div class="be-2col">${inp("year", `inputmode="numeric" maxlength="4"`)}${inp("name", `maxlength="100"`)}</div>` +
    `<div class="be-2col">${inp("committee", `maxlength="100"`)}${inp("team", `maxlength="100"`)}</div>` +
    `<div class="be-2col">${inp("position", `maxlength="100"`)}${inp("mok", `maxlength="100" placeholder="예: 기쁨-19 · 소망-남성 · 청년05또래"`)}</div>` +
    `<div class="be-2col">${inp("role_title", `maxlength="100" placeholder="팀장·부팀장 (없으면 비움)"`)}${inp("renewal", `maxlength="100" placeholder="신규 · 유지"`)}</div>` +
    `<label class="field"><span>${FIELD.src_note}</span><textarea data-f="src_note" maxlength="500" rows="2">${esc(v.src_note ?? "")}</textarea></label>`;
}
const readFields = (root) => Object.fromEntries(EDIT_KEYS.map((k) => [k, root.querySelector(`[data-f="${k}"]`)?.value ?? ""]));

function candHtml(d) {
  const list = d.candidates || [];
  const items = list.map((c, i) => `<button type="button" class="be-cand${c.current ? " on" : ""}" data-cand="${i}" aria-pressed="${c.current}">` +
    `<b>${esc(c.name)}</b> ${esc(c.label)}${c.position ? ` · ${esc(c.position)}` : ""}` +
    (c.church_mok ? `<span class="be-cand-mok">교적: ${esc(c.church_mok)}</span>` : "") +
    (c.served ? `<span class="mh-served">다른 해에 이 팀 ${c.served}번</span>` : "") +
    (d.full ? `<span class="mh-pid">교인ID ${c.person_id}</span>` : "") + `</button>` +
    (d.full ? `<button type="button" class="btn mh-detail" data-detail="${i}">🔎 자세히</button>` : "")).join("");
  return `<h4 class="mh-h">교인명부의 같은 이름 ${list.length}명 <small>— 이분이면 눌러 고른 뒤 「저장」</small></h4>` +
    `<div class="be-cands mh-cands">${items || `<p class="muted">같은 이름이 교인명부에 없어요</p>`}` +
    `<button type="button" class="be-cand${d.row.link_how === "none" ? " on" : ""}" data-cand="none" aria-pressed="${d.row.link_how === "none"}">이분 아님 <small>(교인명부에 없는 분 · 비워 둠)</small></button>` +
    (d.row.link_how !== "auto" ? `<button type="button" class="be-cand" data-cand="auto" aria-pressed="false">자동 맞춤으로 되돌리기</button>` : "") + `</div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let last = null;          // 마지막 historyList 답
  let rows = [];

  const shell = () => {
    el.innerHTML = TITLE + `
      <div class="adm-acts"><button type="button" class="btn primary" data-act="pick">📤 엑셀 올리기</button>
        <button type="button" class="btn" data-act="add">＋ 한 줄 더하기</button></div>
      <input type="file" accept=".xlsx,.xls" multiple hidden data-file>
      <p class="muted mh-how">사역 임명 명단 엑셀(「부서·팀명·이름·직분·목장·신규 / 유지」 칸)을 고르거나 이 화면에 끌어다 놓으세요.
        엑셀에서 표를 복사해 이 화면에서 붙여넣어도 돼요. 이미 있는 줄은 건너뛰고 새 줄만 더해요.</p>
      <div class="acts mh-acts2"><button type="button" class="btn" data-act="rematch">🔄 다시 맞추기</button>
        <button type="button" class="btn" data-act="export">⬇ 내려받기</button></div>
      <div class="tabs mh-years" role="group" aria-label="해로 거르기"></div>
      <div class="tabs mh-only" role="group" aria-label="교적으로 거르기">
        <button type="button" data-only="" aria-pressed="false">전체</button>
        <button type="button" data-only="none" aria-pressed="false">못 맞춘 줄만</button>
        <button type="button" data-only="weak" aria-pressed="false">근거 약한 줄만</button></div>
      <input type="search" class="search" maxlength="40" placeholder="이름·팀·부서로 찾기" aria-label="이름·팀·부서로 찾기" value="${esc(f.q)}">
      <p class="mh-sum muted"></p>
      <div class="mh-list"></div>
      <div class="pp-pager mh-pager"></div>`;
  };

  const drawFilters = () => {
    const ys = (last && last.years) || [];
    el.querySelector(".mh-years").innerHTML = `<button type="button" data-year="" aria-pressed="${!f.years.length}" class="${f.years.length ? "" : "on"}">모든 해</button>` +
      ys.map((y) => { const on = f.years.includes(y.year);
        return `<button type="button" data-year="${y.year}" aria-pressed="${on}" class="${on ? "on" : ""}">${y.year}<em>${num(y.total)}</em></button>`; }).join("");
    for (const b of el.querySelectorAll(".mh-only button")) {
      const on = b.dataset.only === f.only;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
    }
    const pick = ys.filter((y) => !f.years.length || f.years.includes(y.year));
    const s = pick.reduce((a, y) => ({ total: a.total + y.total, linked: a.linked + y.linked, none: a.none + y.none, weak: a.weak + y.weak }),
      { total: 0, linked: 0, none: 0, weak: 0 });
    el.querySelector(".mh-sum").textContent = ys.length
      ? `${num(s.total)}줄 · 교적 이어짐 ${num(s.linked)} (그중 근거 약함 ${num(s.weak)}) · 못 맞춤 ${num(s.none)}` : "";
  };
  const draw = () => {
    if (!el.isConnected) return;
    drawFilters();
    const list = el.querySelector(".mh-list");
    if (!last || !last.years.length) {
      list.innerHTML = `<p class="empty">아직 올린 명단이 없어요 — 「📤 엑셀 올리기」로 시작해 주세요</p>`;
    } else if (!rows.length) list.innerHTML = `<p class="empty">조건에 맞는 줄이 없어요</p>`;
    else list.innerHTML = mqWide.matches ? tableHtml(rows) : rows.map(cardHtml).join("");
    const pg = el.querySelector(".mh-pager");
    if (last && last.total > last.pageSize) {
      const from = last.page * last.pageSize + 1, to = Math.min(last.total, (last.page + 1) * last.pageSize);
      pg.innerHTML = `<button type="button" class="btn" data-act="prev"${last.page ? "" : " disabled"}>← 앞</button>` +
        `<span class="muted">${num(from)}–${num(to)} / ${num(last.total)}</span>` +
        `<button type="button" class="btn" data-act="next"${to < last.total ? "" : " disabled"}>다음 →</button>`;
    } else pg.innerHTML = "";
  };
  const load = async () => {
    const r = await busy(el, () => call("historyList", f));
    if (!el.isConnected) return;
    if (!r.ok) { el.querySelector(".mh-list").innerHTML = `<p class="empty">${esc(errorText(r))}</p>`; return; }
    last = r; rows = r.rows || [];
    draw();
  };

  // ── 올리기 ────────────────────────────────────────────────────────
  async function uploadAoa(aoa, name) {
    const p = parseHistorySheet(aoa, name);
    if (p.error) {
      await dialog({ title: "📂 표 머리를 찾지 못했어요", danger: true, cancel: null,
        text: `${name}\n「이름」과 「팀명」 칸 이름이 함께 적힌 줄이 앞쪽 열다섯 줄 안에 있어야 해요.` });
      return;
    }
    if (!p.rows.length) { await dialog({ title: "📂 넣을 줄이 없어요", text: name, cancel: null }); return; }
    let list = p.rows;
    if (p.needYear) {
      const y = await pickOne({ title: `몇 년도 명단인가요? — ${name}`, options: yearOptions() });
      if (!y || !el.isConnected) return;
      list = list.map((r) => (r.year ? r : { ...r, year: Number(y) }));
    }
    const checks = [];
    for (const part of sendParts(list)) {
      const d = await busy(el, () => call("historyUploadCheck", { rows: part.rows, file_name: name }));
      if (!el.isConnected) return;
      if (!d.ok) { await dialog({ title: "⚠️ 살펴보지 못했어요", text: errorText(d), cancel: null }); return; }
      checks.push({ ...part, d });
    }
    const t = mergeChecks(checks);
    if (!t.add) { await dialog({ title: "새로 넣을 줄이 없어요", html: checkHtml(name, checks), cancel: null }); return; }
    const yes = await dialog({ title: "📥 사역 이력을 넣습니다", html: checkHtml(name, checks), ok: `${num(t.add)}줄 넣기`, cancel: "그만두기" });
    if (!yes || !el.isConnected) return;
    let saved = 0, linked = 0, unlinked = 0, failed = 0, notRematched = false;
    for (const c of checks) {
      if (!c.d.counts.add) continue;
      const d = await busy(el, () => call("historyUploadSave", { rows: c.rows, file_name: name }));
      if (!d.ok) {
        await dialog({ title: "⚠️ 넣는 중에 멈췄어요", cancel: null,
          text: `${c.year}년에서 멈췄어요 — ${errorText(d)}\n앞의 해는 들어갔을 수 있어요. 같은 파일을 다시 올리면 들어간 줄은 건너뛰어요.` });
        break;
      }
      saved += d.saved || 0; linked += d.linked || 0; unlinked += d.unlinked || 0; failed += d.failed || 0;
      if (d.rematched === false) notRematched = true;
    }
    if (notRematched) {
      await dialog({ title: "⚠️ 교적 맞추기가 끝나지 않았어요",
        text: "명단은 들어갔어요. 「🔄 다시 맞추기」를 눌러 교적을 맞춰 주세요.", cancel: null });
    } else {
      toast(`${num(saved)}줄 넣었어요 · 교적 이어짐 ${num(linked)} · 못 맞춤 ${num(unlinked)}${failed ? ` · 실패 ${num(failed)}` : ""}`);
    }
    f.page = 0;
    if (el.isConnected) await load();
  }
  async function readFile(file) {
    try {
      if (!/\.xlsx?$/i.test(file.name)) throw new Error("kind");
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      // 머리(이름·팀명)가 있는 첫 시트 — 원본 해마다 파일은 Sheet1 에 명단, Sheet2·3 은 비어 있다
      let aoa = null;
      for (const s of wb.SheetNames) {
        const a = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, blankrows: false, raw: true });
        if (findHeader(a)) { aoa = a; break; }
      }
      if (!aoa) throw new Error("empty");
      await uploadAoa(aoa, file.name);
    } catch (e) {
      await dialog({ title: "📂 파일을 읽지 못했어요", text: `${file.name}\n${fileErrorText(e && e.message)}`, cancel: null, danger: true });
    }
  }
  async function readFiles(files) { for (const file of files) { if (!el.isConnected) return; await readFile(file); } }

  // ── 줄 창 ──────────────────────────────────────────────────────────
  async function openRow(r) {
    const d = await busy(el, () => call("historyCandidates", { id: r.id }));
    if (!el.isConnected) return;
    if (!d.ok) { if (STALE[d.error]) { toast(STALE[d.error]); await load(); } else toast(errorText(d)); return; }
    let choice = null, del = false, first = "", staleCode = "", notRematched = false;
    const row = d.row;
    const out = await openForm({
      title: `${row.name} · ${row.year}년 ${row.team}`, okLabel: "저장",
      html: `<p class="be-ro">${badge(row)} <span>${esc(whyText(row))}</span></p>` + candHtml(d) +
        `<details class="be-set mh-edit"><summary>✏️ 칸 고치기 (이름·목장 오타 등)</summary><div class="be-set-b">${fieldsHtml(row)}</div></details>` +
        `<div class="mh-delbox"><button type="button" class="btn danger" data-act="del">이 줄 빼기</button>` +
        `<p class="be-warn" data-step2 hidden>「저장」을 누르면 이 줄을 뺍니다. 빼 둔 줄은 같은 파일을 다시 올려도 되살아나지 않아요.</p></div>`,
      onOpen: (root) => {
        first = JSON.stringify(readFields(root));
        root.addEventListener("click", (e) => {
          const c = e.target.closest("[data-cand]");
          if (c) {
            const v = c.dataset.cand;
            choice = v === "none" ? { op: "none" } : v === "auto" ? { op: "auto" } : { op: "pick", pick: Number(v) };
            for (const b of root.querySelectorAll("[data-cand]")) { const on = b === c; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); }
            return;
          }
          const det = e.target.closest("[data-detail]");
          if (det) { const p = d.candidates[Number(det.dataset.detail)]; if (p && p.person_id) openPerson(call, p.person_id, () => toast(FAMILY_NOTE), det); return; }
          if (e.target.closest('[data-act="del"]')) {
            del = true;
            root.querySelector("[data-step2]").hidden = false;
            const ok = root.querySelector(".be-ok"); ok.textContent = "네, 뺍니다"; ok.classList.remove("primary"); ok.classList.add("danger");
          }
        });
      },
      isDirty: (root) => del || choice !== null || JSON.stringify(readFields(root)) !== first,
      onSubmit: async (root) => {
        if (del) {
          const x = await call("historyRowDelete", { id: row.id, expect: row.updated_at });
          if (!x.ok && STALE[x.error]) { staleCode = x.error; return { ok: false, message: STALE[x.error] }; }
          return x.ok ? { ok: true, value: { deleted: true } } : x;
        }
        let cur = row;
        const patch = editPatch(row, readFields(root));
        if (Object.keys(patch).length) {
          const x = await call("historyRowSave", { id: row.id, expect: row.updated_at, patch });
          if (!x.ok && STALE[x.error]) { staleCode = x.error; return { ok: false, message: STALE[x.error] }; }
          if (!x.ok) return x;
          if (x.rematched === false) notRematched = true;
          cur = x.row || cur;
        }
        if (choice) {
          const x = await call("historyLink", { id: row.id, op: choice.op, pick: choice.pick, fp: d.fp });
          if (!x.ok) return x;
          if (x.rematched === false) notRematched = true;
          cur = x.row || cur;
        }
        return { ok: true, value: cur };
      },
    });
    if (!out) { if (staleCode) await load(); return; }
    if (out === true) return;
    if (out.deleted) { toast("뺐어요"); await load(); return; }
    if (notRematched) toast("교적은 아직 못 맞췄어요 — 「🔄 다시 맞추기」를 눌러 주세요");
    const i = rows.findIndex((x) => x.id === r.id);
    if (i >= 0) rows[i] = out;
    await load();    // 요약 수·근거 약함이 바뀌었을 수 있다
  }

  async function openAdd() {
    let first = "", notRematched = false;
    const out = await openForm({
      title: "＋ 한 줄 더하기", okLabel: "더하기",
      html: `<p class="muted">엑셀에 빠진 분을 한 줄씩 더해요. 더하면 교인명부와 바로 맞춰 봐요.</p>` +
        fieldsHtml({ year: f.years.length === 1 ? f.years[0] : "" }),
      onOpen: (root) => { first = JSON.stringify(readFields(root)); },
      isDirty: (root) => JSON.stringify(readFields(root)) !== first,
      onSubmit: async (root) => {
        const v = readFields(root);
        const x = await call("historyRowAdd", { row: { ...v, year: Number(v.year) } });
        if (x.ok && x.rematched === false) notRematched = true;
        return x.ok ? { ok: true, value: x.row } : x;
      },
    });
    if (out && out !== true) {
      toast(notRematched ? "교적은 아직 못 맞췄어요 — 「🔄 다시 맞추기」를 눌러 주세요"
        : (out.linked ? "더했어요 · 교적 이어짐" : "더했어요 · 교적은 못 맞췄어요"));
      await load();
    }
  }

  async function rematch() {
    const yes = await dialog({ title: "🔄 다시 맞출까요?", ok: "다시 맞추기",
      text: "자동으로 맞춘 줄을 지금 교인명부로 모두 다시 맞춰요.\n사람이 「이분」·「이분 아님」으로 고른 줄은 그대로 둬요.\n12월에 새 교인명부가 올라온 뒤에 눌러 주세요." });
    if (!yes) return;
    const r = await busy(el, () => call("historyRematch", { confirm: true }));
    if (!r.ok) { toast(errorText(r)); return; }
    toast(`바뀐 줄 ${num(r.changed)} · 교적 이어짐 ${num(r.linked)} / ${num(r.total)}`);
    await load();
  }

  async function exportXlsx() {
    const r = await busy(el, () => call("historyExport", { years: f.years }));
    if (!r.ok) { toast(errorText(r)); return; }
    if (!r.rows.length) { toast("내려받을 줄이 없어요"); return; }
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(exportAoa(r.rows, r.full)), "사역 이력");
      XLSX.writeFile(wb, exportName(f.years));
    } catch (e) { toast(fileErrorText(e && e.message)); }
  }

  // ── 그리기 · 사건 ──────────────────────────────────────────────────
  shell();
  await load();
  if (!el.isConnected) return;
  const fileInput = el.querySelector("[data-file]");
  fileInput.addEventListener("change", async (e) => { const files = [...e.target.files]; e.target.value = ""; await readFiles(files); });

  let qTimer = 0;
  el.querySelector(".search").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { f.q = e.target.value.trim(); f.page = 0; load(); }, 300);
  });

  el.addEventListener("click", async (e) => {
    const yb = e.target.closest("[data-year]");
    if (yb) {
      const y = Number(yb.dataset.year);
      f.years = !yb.dataset.year ? [] : f.years.includes(y) ? f.years.filter((x) => x !== y) : [...f.years, y];
      f.page = 0; await load(); return;
    }
    const ob = e.target.closest("[data-only]");
    if (ob) { f.only = ob.dataset.only; f.page = 0; await load(); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "pick") fileInput.click();
    else if (act === "add") await openAdd();
    else if (act === "rematch") await rematch();
    else if (act === "export") await exportXlsx();
    else if (act === "prev" || act === "next") { f.page = Math.max(0, f.page + (act === "next" ? 1 : -1)); await load(); }
    else if (act === "row") { const r = rows.find((x) => x.id === Number(b.dataset.id)); if (r) await openRow(r); }
  });

  // 끌어다 놓기
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  el.addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); el.classList.add("mh-drop"); } });
  el.addEventListener("dragleave", () => el.classList.remove("mh-drop"));
  el.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); el.classList.remove("mh-drop");
    await readFiles([...e.dataTransfer.files]);
  });

  // 붙여넣기 — 입력 칸·창 안이 아닐 때만(엑셀에서 복사한 표 · 탭으로 갈린 글)
  const onPaste = async (e) => {
    if (!el.isConnected) { unbindPaste?.(); return; }
    if (e.target.closest && e.target.closest("input,textarea,.be-modal,.dlg-dim")) return;
    const text = e.clipboardData?.getData("text") || "";
    const aoa = textToAoa(text);
    if (!findHeader(aoa)) return;
    e.preventDefault();
    await uploadAoa(aoa, "(붙여넣기)");
  };
  unbindPaste?.();
  unbindPaste = () => { document.removeEventListener("paste", onPaste); unbindPaste = null; };
  document.addEventListener("paste", onPaste);

  const unbind = () => { mqWide.removeEventListener("change", onMq); if (unbindMq === unbind) unbindMq = null; };
  const onMq = () => { if (!el.isConnected) { unbind(); return; } draw(); };
  unbindMq?.(); unbindMq = unbind; mqWide.addEventListener("change", onMq);
}
