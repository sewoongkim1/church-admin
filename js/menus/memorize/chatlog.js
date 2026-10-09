// 💬 말씀 질문 기록 — 「내게 주시는 말씀」에 성도님이 물은 것(최근 200) · 색인/캐시 관리.
//   성경암송 api 를 내부 키로 부른다(sermonChatLog·embedSermons·clearChatCache·clearSummaryCache). 역할 memorizeadmin.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">💬 말씀 질문 기록</h2>`;
const kst = (v) => v ? new Date(v).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
const who = (r) => r.who || [r.gu, r.mok ? r.mok + "목장" : "", r.bu, r.grade].filter(Boolean).join(" ");

export async function render(el, { call }) {
  el.innerHTML = TITLE + `
    <div class="acts">
      <button class="btn" data-act="reindex">색인 다시 만들기</button>
      <button class="btn" data-act="clearchat">답변 캐시 비우기</button>
      <button class="btn" data-act="clearsum">요약 캐시 비우기</button>
    </div>
    <p class="muted" id="cl-status">불러오는 중…</p>
    <div id="cl-list"></div>`;

  const draw = (logs) => {
    el.querySelector("#cl-status").textContent = `최근 ${logs.length}건`;
    el.querySelector("#cl-list").innerHTML = logs.length
      ? logs.map((r) => `<div class="card"><div><b>${esc(r.name || "이름 없음")}</b> <span class="muted">${esc(who(r))}</span></div>
          <div style="margin:4px 0">${esc(r.question || r.q || "")}</div>
          <div class="muted">${esc(kst(r.created_at || r.at))}</div></div>`).join("")
      : `<p class="muted">아직 질문이 없어요.</p>`;
  };

  const load = async () => {
    const r = await call("sermonChatLog", { limit: 200 });
    if (!r.ok) { el.querySelector("#cl-status").textContent = errorText(r); return; }
    draw(r.logs || []);
  };

  const run = async (action, label, msg) => {
    const go = await dialog({ title: msg, text: "", ok: "실행", cancel: "그만두기" });
    if (!go) return;
    await busy(el, async () => {
      const r = await call(action);
      toast(r.ok ? "됐어요." : errorText(r));
    });
  };

  el.querySelector('[data-act="reindex"]').addEventListener("click", () => run("embedSermons", "embedSermons", "설교 색인을 다시 만들까요? (시간이 걸릴 수 있어요)"));
  el.querySelector('[data-act="clearchat"]').addEventListener("click", () => run("clearChatCache", "clearChatCache", "답변 캐시를 비울까요?"));
  el.querySelector('[data-act="clearsum"]').addEventListener("click", () => run("clearSummaryCache", "clearSummaryCache", "요약 캐시를 비울까요?"));
  await load();
}
