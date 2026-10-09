// 🚩 게시판 관리 — 글·답글 숨김/삭제 · 🚩 신고 처리 · 「내게 주시는 말씀」 AI답 신고.
//   성경암송 api 프록시(boardList·boardModerate·boardReports·boardReportResolve·sermonAnswerReports·sermonAnswerReportResolve).
//   역할 memorizeadmin. ⚠️ 내부 키로 부르니 isAdmin=true 로 숨김글까지 보인다.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🚩 게시판 관리</h2>`;
const kst = (v) => v ? new Date(v).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
const tag = (x) => `${x.hidden ? '<span class="muted">[숨김]</span> ' : ""}${x.deleted ? '<span class="muted">[삭제]</span> ' : ""}`;

export async function render(el, { call }) {
  el.innerHTML = TITLE + `
    <div class="acts">
      <button class="btn primary" data-tab="list">글 목록</button>
      <button class="btn" data-tab="reports">🚩 신고</button>
      <button class="btn" data-tab="ai">AI답 신고</button>
    </div>
    <div id="bd-body"><p class="muted">불러오는 중…</p></div>`;
  const body = el.querySelector("#bd-body");

  async function moderate(kind, id, op, label) {
    const go = await dialog({ title: label + "할까요?", text: "", ok: label, cancel: "그만두기", danger: op === "delete" });
    if (!go) return;
    await busy(el, async () => { const r = await call("boardModerate", { kind, id, op }); toast(r.ok ? "됐어요." : errorText(r)); if (r.ok) loadList(); });
  }

  function itemHtml(x, kind) {
    const canHide = !x.hidden, canShow = x.hidden;
    return `<div class="card" style="${kind === "reply" ? "margin-left:16px" : ""}">
      <div>${tag(x)}<b>${esc(x.name || "이름 없음")}</b> <span class="muted">${esc(kst(x.created_at))}</span></div>
      <div style="margin:4px 0;white-space:pre-wrap">${esc(x.content || "")}</div>
      <div class="acts">
        ${canHide ? `<button class="btn" data-m="hide" data-k="${kind}" data-id="${esc(x.id)}">숨기기</button>` : ""}
        ${canShow ? `<button class="btn" data-m="show" data-k="${kind}" data-id="${esc(x.id)}">보이기</button>` : ""}
        ${x.deleted ? `<button class="btn" data-m="undelete" data-k="${kind}" data-id="${esc(x.id)}">삭제 되돌리기</button>`
                    : `<button class="btn danger" data-m="delete" data-k="${kind}" data-id="${esc(x.id)}">완전 삭제</button>`}
      </div></div>`;
  }

  async function loadList() {
    body.innerHTML = `<p class="muted">불러오는 중…</p>`;
    const r = await call("boardList");
    if (!r.ok) { body.innerHTML = `<p class="muted">${esc(errorText(r))}</p>`; return; }
    const posts = r.posts || [];
    body.innerHTML = posts.length ? posts.map((p) => itemHtml(p, "post") + (p.replies || []).map((rp) => itemHtml(rp, "reply")).join("")).join("") : `<p class="muted">글이 없어요.</p>`;
    body.querySelectorAll("[data-m]").forEach((btn) => btn.addEventListener("click", () => {
      const op = btn.dataset.m, label = op === "delete" ? "완전 삭제" : op === "undelete" ? "삭제 되돌리기" : op === "hide" ? "숨기기" : "보이기";
      moderate(btn.dataset.k, Number(btn.dataset.id), op, label);
    }));
  }

  async function loadReports() {
    body.innerHTML = `<p class="muted">불러오는 중…</p>`;
    const r = await call("boardReports");
    if (!r.ok) { body.innerHTML = `<p class="muted">${esc(errorText(r))}</p>`; return; }
    const items = r.items || [];
    body.innerHTML = `<p class="muted">처리 전 신고 ${items.length}건 · ${r.keepDays || 90}일 뒤 저절로 지워져요.</p>` + (items.length ? items.map((it) => {
      const reasons = (it.reasons || it.reason_counts || []).map((x) => esc((r.labels && r.labels[x.reason || x]) || x.reason || x)).join(" · ");
      const target = it.target || it.post || it.reply || {};
      return `<div class="card" data-id="${esc(it.id ?? target.id ?? "")}" data-kind="${esc(it.kind || "post")}">
        <div><b>🚩 ${esc(it.count ?? "")}건</b> <span class="muted">${reasons}</span></div>
        <div style="margin:4px 0;white-space:pre-wrap">${esc(target.content || it.content || "")}</div>
        <div class="acts"><button class="btn" data-r="hide">숨기기</button><button class="btn" data-r="resolve">처리 완료</button></div></div>`;
    }).join("") : `<p class="muted">기다리는 신고가 없어요.</p>`);
    body.querySelectorAll("[data-r]").forEach((btn) => btn.addEventListener("click", async () => {
      const card = btn.closest(".card");
      await busy(el, async () => { const rr = await call("boardReportResolve", { id: Number(card.dataset.id), kind: card.dataset.kind, op: btn.dataset.r }); toast(rr.ok ? "처리했어요." : errorText(rr)); if (rr.ok) loadReports(); });
    }));
  }

  async function loadAi() {
    body.innerHTML = `<p class="muted">불러오는 중…</p>`;
    const r = await call("sermonAnswerReports");
    if (!r.ok) { body.innerHTML = `<p class="muted">${esc(errorText(r))}</p>`; return; }
    const items = r.items || [];
    body.innerHTML = `<p class="muted">AI답 신고 ${items.length}건 · ${r.keepDays || 90}일 보관.</p>` + (items.length ? items.map((it) => {
      const reasons = (it.reasons || []).map((x) => esc((r.labels && r.labels[x.reason || x]) || x.reason || x)).join(" · ");
      return `<div class="card" data-id="${esc(it.id ?? "")}">
        <div><b>🚩 ${esc(it.count ?? "")}건</b> <span class="muted">${reasons}</span></div>
        <div class="muted" style="margin:3px 0">질문: ${esc(it.question || "")}</div>
        <div style="margin:4px 0;white-space:pre-wrap">${esc(it.answer || "")}</div>
        <div class="acts"><button class="btn" data-a="resolve">처리 완료</button><button class="btn" data-a="uncache">답 지우기(uncache)</button></div></div>`;
    }).join("") : `<p class="muted">기다리는 신고가 없어요.</p>`);
    body.querySelectorAll("[data-a]").forEach((btn) => btn.addEventListener("click", async () => {
      const card = btn.closest(".card");
      await busy(el, async () => { const rr = await call("sermonAnswerReportResolve", { id: Number(card.dataset.id), op: btn.dataset.a }); toast(rr.ok ? "처리했어요." : errorText(rr)); if (rr.ok) loadAi(); });
    }));
  }

  const tabs = { list: loadList, reports: loadReports, ai: loadAi };
  el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("primary", x === b));
    tabs[b.dataset.tab]();
  }));
  await loadList();
}
