// 🚩 게시판 관리 — 글·답글 숨김/삭제 · 🚩 신고 처리 · 「내게 주시는 말씀」 AI답 신고.
//   성경암송 api 프록시(boardList·boardModerate·boardReports·boardReportResolve·sermonAnswerReports·sermonAnswerReportResolve).
//   역할 memorizeadmin. ⚠️ 내부 키로 부르니 isAdmin=true 로 숨김글까지 보인다.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🚩 게시판 관리</h2>`;
const kst = (v) => v ? new Date(v).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
const tag = (x) => `${x.hidden ? '<span class="muted">[숨김]</span> ' : ""}${x.deleted ? '<span class="muted">[삭제]</span> ' : ""}`;
// 신고 까닭 — 성경암송 api 는 { 까닭코드: 건수 } 꼴로 준다(boardReportGroup · sermonReportGroup).
//   ⚠️ 배열로 알고 .map 을 부르면 신고가 한 건이라도 있는 순간 탭이 「불러오는 중…」에서 멈춘다(2026-10-13 운영에서 AI답 신고 탭이 그랬다).
//   옛 배열 꼴(문자열·{reason})도 받는다.
export function reasonText(reasons, labels) {
  const lab = (k) => (labels && labels[k]) || k;
  if (Array.isArray(reasons)) return reasons.map((x) => esc(lab(x && x.reason ? x.reason : x))).join(" · ");
  if (!reasons || typeof reasons !== "object") return "";
  return Object.entries(reasons).map(([k, n]) => esc(lab(k)) + (Number(n) > 1 ? ` ${Number(n)}` : "")).join(" · ");
}
const notesHtml = (notes) => (Array.isArray(notes) && notes.length)
  ? `<div class="muted" style="margin:3px 0">덧붙인 말: ${notes.map((n) => esc(n)).join(" / ")}</div>` : "";

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
      const reasons = reasonText(it.reasons || it.reason_counts, r.labels);
      // 서버(boardReports)는 글 내용을 excerpt(발췌)로 · 쓴 분을 name 으로 · 상태를 hidden·deleted·gone 으로 준다
      const state = `${tag(it)}${it.gone ? '<span class="muted">[글 없음]</span> ' : ""}`;
      return `<div class="card" data-id="${esc(it.id ?? "")}" data-kind="${esc(it.kind || "post")}">
        <div><b>🚩 ${esc(it.count ?? "")}건</b> <span class="muted">${reasons}</span></div>
        <div class="muted" style="margin:3px 0">${state}${esc(it.kind === "reply" ? "답글" : "글")} · ${esc(it.name || "")} · ${esc(kst(it.last_at))}</div>
        <div style="margin:4px 0;white-space:pre-wrap">${esc(it.excerpt || it.content || "")}</div>${notesHtml(it.notes)}
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
      const reasons = reasonText(it.reasons, r.labels);
      return `<div class="card" data-id="${esc(it.id ?? "")}">
        <div><b>🚩 ${esc(it.count ?? "")}건</b> <span class="muted">${reasons} · ${esc(kst(it.last_at))}</span></div>
        <div class="muted" style="margin:3px 0">질문: ${esc(it.question || "")}</div>
        <div style="margin:4px 0;white-space:pre-wrap">${esc(it.answer || "")}</div>${notesHtml(it.notes)}
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
