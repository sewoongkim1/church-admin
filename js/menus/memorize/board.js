// 🚩 게시판 관리 — 글·답글 숨김/삭제 · 관리자 답글 · 📢 공지 쓰기 · 🚩 신고 처리 · 「내게 주시는 말씀」 AI답 신고.
//   성경암송 api 프록시(boardList·boardModerate·boardReply·boardPost·boardReports·boardReportResolve·sermonAnswerReports·sermonAnswerReportResolve).
//   역할 memorizeadmin. ⚠️ 내부 키로 부르니 isAdmin=true 로 숨김글까지 보이고, 답글은 「관리자」 표시(is_admin)로 · 공지는 rich(HTML)를 쓸 수 있다.
//   공지·답글의 규칙(길이·빈 글·오류 문장·안내)은 board-logic.js(시험 tests/mem-board-logic.test.mjs).
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { NAME_MAX, NOTICE_NAME, countInfo, noticeBody, replyBody, noticeHints, noticeConfirmHtml, replyConfirmHtml, boardErrorText } from "./board-logic.js";

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
    <div class="acts bd-tabs">
      <button class="btn primary" data-tab="list">글 목록</button>
      <button class="btn" data-tab="write">📢 공지 쓰기</button>
      <button class="btn" data-tab="reports">🚩 신고</button>
      <button class="btn" data-tab="ai">AI답 신고</button>
    </div>
    <div id="bd-body"><p class="muted">불러오는 중…</p></div>`;
  const body = el.querySelector("#bd-body");
  // 쓰던 것 — 탭을 옮기거나 목록을 새로 불러와도 남는다(이 메뉴를 떠나면 사라진다 · 기기에 저장하지 않는다)
  const notice = { name: NOTICE_NAME, content: "", rich: false };
  const replyDrafts = new Map();   // 글 번호 → 쓰던 답글(열어 둔 답글 칸)
  let posts = [];
  let cur = "list";                // 지금 탭 — 늦게 온 글 목록이 그사이 연 「공지 쓰기」를 덮지 않게

  async function moderate(kind, id, op, label) {
    const go = await dialog({ title: label + "할까요?", text: "", ok: label, cancel: "그만두기", danger: op === "delete" });
    if (!go) return;
    await busy(el, async () => { const r = await call("boardModerate", { kind, id, op }); toast(r.ok ? "됐어요." : errorText(r)); if (r.ok) loadList(); });
  }

  function itemHtml(x, kind) {
    const canHide = !x.hidden, canShow = x.hidden;
    // rich = HTML 로 그린 공지 — 여기서는 태그까지 글자 그대로 보인다(성도님 앱은 그려서 보여 준다)
    return `<div class="card" style="${kind === "reply" ? "margin-left:16px" : ""}">
      <div>${tag(x)}${x.rich ? '<span class="muted">[HTML 공지]</span> ' : ""}<b>${esc(x.name || "이름 없음")}</b> <span class="muted">${esc(kst(x.created_at))}</span></div>
      <div style="margin:4px 0;white-space:pre-wrap">${esc(x.content || "")}</div>
      <div class="acts">
        ${kind === "post" ? `<button class="btn" data-reply="${esc(x.id)}">답글</button>` : ""}
        ${canHide ? `<button class="btn" data-m="hide" data-k="${kind}" data-id="${esc(x.id)}">숨기기</button>` : ""}
        ${canShow ? `<button class="btn" data-m="show" data-k="${kind}" data-id="${esc(x.id)}">보이기</button>` : ""}
        ${x.deleted ? `<button class="btn" data-m="undelete" data-k="${kind}" data-id="${esc(x.id)}">삭제 되돌리기</button>`
                    : `<button class="btn danger" data-m="delete" data-k="${kind}" data-id="${esc(x.id)}">완전 삭제</button>`}
      </div></div>`;
  }

  // 관리자 답글 칸 — 그 글의 답글들 아래(새 답글이 붙을 자리)에 연다
  function openReply(id, focus) {
    const thread = body.querySelector(`.bd-thread[data-post="${id}"]`);
    if (!thread) { replyDrafts.delete(id); return; }
    let form = thread.querySelector(".bd-reply-form");
    if (!form) {
      form = document.createElement("div");
      form.className = "card bd-form bd-reply-form";
      form.innerHTML = `<label class="field"><span>관리자 답글 <small data-cnt></small></span>
          <textarea rows="3" data-reply-text placeholder="성도님 앱에는 「관리자」 표시와 함께 보여요"></textarea></label>
        <div class="acts"><button class="btn" data-reply-cancel>취소</button><button class="btn primary" data-reply-send>보내기</button></div>`;
      thread.appendChild(form);
      const ta = form.querySelector("textarea"), cnt = form.querySelector("[data-cnt]");
      const show = () => { const c = countInfo(ta.value); cnt.textContent = c.text; cnt.classList.toggle("over", c.over); };
      ta.value = replyDrafts.get(id) || "";
      show();
      ta.addEventListener("input", () => { replyDrafts.set(id, ta.value); show(); });
      form.querySelector("[data-reply-cancel]").addEventListener("click", () => { replyDrafts.delete(id); form.remove(); });
      form.querySelector("[data-reply-send]").addEventListener("click", () => sendReply(id, ta));
    }
    if (!replyDrafts.has(id)) replyDrafts.set(id, "");
    if (focus) form.querySelector("textarea").focus();
  }

  async function sendReply(id, ta) {
    const v = replyBody(id, ta.value);
    if (!v.ok) { toast(v.message); ta.focus(); return; }
    const post = posts.find((p) => Number(p.id) === id);
    const go = await dialog({ title: "답글을 올릴까요?", html: replyConfirmHtml(v.body, post), ok: "올리기", cancel: "그만두기" });
    if (!go) return;
    await busy(el, async () => {
      const r = await call("boardReply", v.body);
      if (!r.ok) { toast(boardErrorText(r)); return; }
      replyDrafts.delete(id);
      toast("답글을 올렸어요.");
      await loadList({ quiet: true, focus: id });
    });
  }

  // quiet — 「불러오는 중…」으로 바꾸지 않고 그 자리에서 다시 그린다(답글을 단 뒤 화면이 맨 위로 튀지 않게)
  async function loadList({ quiet = false, focus = 0 } = {}) {
    if (!quiet) body.innerHTML = `<p class="muted">불러오는 중…</p>`;
    const r = await call("boardList");
    if (cur !== "list") return;
    if (!r.ok) { body.innerHTML = `<p class="muted">${esc(errorText(r))}</p>`; return; }
    posts = r.posts || [];
    body.innerHTML = `<p class="muted">숨긴 글도 모두 보여요. 「답글」로 단 답글은 성도님 앱에 이름 대신 「관리자」 표시와 함께 보여요.</p>` +
      (posts.length ? posts.map((p) => `<div class="bd-thread" data-post="${esc(p.id)}">` + itemHtml(p, "post") +
        (p.replies || []).map((rp) => itemHtml(rp, "reply")).join("") + `</div>`).join("") : `<p class="muted">글이 없어요.</p>`);
    body.querySelectorAll("[data-m]").forEach((btn) => btn.addEventListener("click", () => {
      const op = btn.dataset.m, label = op === "delete" ? "완전 삭제" : op === "undelete" ? "삭제 되돌리기" : op === "hide" ? "숨기기" : "보이기";
      moderate(btn.dataset.k, Number(btn.dataset.id), op, label);
    }));
    body.querySelectorAll("[data-reply]").forEach((btn) => btn.addEventListener("click", () => openReply(Number(btn.dataset.reply), true)));
    for (const id of [...replyDrafts.keys()]) openReply(id, false);   // 쓰던 답글 칸은 다시 연다
    if (focus) body.querySelector(`.bd-thread[data-post="${focus}"]`)?.scrollIntoView({ block: "nearest" });
  }

  // 📢 공지 쓰기 — 불러올 때 올리지 않는다(「공지 올리기」를 누르고 확인 창에서 한 번 더)
  function loadWrite() {
    body.innerHTML = `<div class="card bd-form">
      <p class="bd-note">여기서 올린 공지는 성도님 앱 게시판에 글 하나로 올라가요. 잘못 올렸으면 「글 목록」에서 숨기거나 지울 수 있어요.</p>
      <label class="field"><span>글쓴이 <small>(비우면 「${esc(NOTICE_NAME)}」 · ${NAME_MAX}자까지)</small></span>
        <input id="bw-name" maxlength="${NAME_MAX}" autocomplete="off" value="${esc(notice.name)}"></label>
      <label class="field"><span>내용 <small id="bw-cnt"></small></span>
        <textarea id="bw-body" rows="8" placeholder="공지 내용">${esc(notice.content)}</textarea></label>
      <label class="bd-check"><input type="checkbox" id="bw-rich"${notice.rich ? " checked" : ""}> HTML 로 그리기</label>
      <p class="bd-hint">켜면 굵게·색·목록을 쓸 수 있어요 — 관리자 글에만 돼요. 성도님 글은 늘 글자로만 그려져요(아무나 HTML 을 넣으면 위험하기 때문이에요).</p>
      <div class="bd-warn" id="bw-rich-on" hidden>앱은 정해 둔 태그(굵게·기울임·밑줄·문단·목록·제목·링크·가로줄 등)만 그리고, 그 밖의 태그는 떼어 내고 안의 글자만 보여 줘요.
        엔터로 바꾼 줄은 이어져 보이니 줄을 바꾸려면 &lt;br&gt; 이나 &lt;p&gt;…&lt;/p&gt; 를 써 주세요. 링크는 http·https 주소만 살아요.</div>
      <div id="bw-hints"></div>
      <div class="acts"><button class="btn primary" id="bw-send">📢 공지 올리기</button></div>
    </div>`;
    const $ = (id) => body.querySelector("#" + id);
    const nameIn = $("bw-name"), ta = $("bw-body"), rich = $("bw-rich");
    const show = () => {
      notice.name = nameIn.value; notice.content = ta.value; notice.rich = rich.checked;
      const c = countInfo(ta.value);
      $("bw-cnt").textContent = c.text;
      $("bw-cnt").classList.toggle("over", c.over);
      $("bw-rich-on").hidden = !rich.checked;
      $("bw-hints").innerHTML = noticeHints(notice).map((h) => `<p class="bd-warn">${esc(h)}</p>`).join("");
    };
    nameIn.addEventListener("input", show);
    ta.addEventListener("input", show);
    rich.addEventListener("change", show);
    show();
    $("bw-send").addEventListener("click", async () => {
      const v = noticeBody(notice);
      if (!v.ok) { toast(v.message); ta.focus(); return; }
      const go = await dialog({ title: "공지를 올릴까요?", html: noticeConfirmHtml(v.body), ok: "올리기", cancel: "그만두기" });
      if (!go) return;
      await busy(el, async () => {
        const r = await call("boardPost", v.body);
        if (!r.ok) { toast(boardErrorText(r)); return; }
        notice.content = ""; notice.rich = false;   // 글쓴이는 다음 공지에도 그대로 둔다
        toast(r.id ? `공지를 올렸어요 (글 #${r.id})` : "공지를 올렸어요.");
        showTab("list");
      });
    });
    ta.focus();
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

  const tabs = { list: () => loadList(), write: loadWrite, reports: loadReports, ai: loadAi };
  function showTab(name) {
    cur = name;
    el.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("primary", x.dataset.tab === name));
    return tabs[name]();
  }
  el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  await loadList();
}
