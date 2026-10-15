// 🤖 성도 묻기(시험판 · 2026-10-15 · 총괄만) — 말로 물으면 교인명부 · 사역 이력에서 찾는다.
//   서버 askPeople: AI(Claude)가 질문을 조건으로 바꾸고, 서버가 검사한 뒤 표에서 직접 거른다(명단은 AI 를 거치지 않는다).
//   서버 askPeopleRun: 화면이 고친 조건(칩 빼기 · 「나머지 조건으로만 찾기」)으로 다시 센다 — AI 를 부르지 않는다.
//   칩 글은 서버가 검사를 통과한 조건에서 만든 것이다(AI 글이 아니다) — 보이는 조건 = 실제로 돈 조건.
//   설계 v2 docs/superpowers/specs/2026-10-15-pastor-ai-ask-design.md · 서버 규약 supabase/functions/church-admin/ask-people.ts
import { esc, busy, errorText, toast } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🤖 성도 묻기 <span class="badge">시험판</span></h2>`;
const INTRO = `<p class="ak-intro">말로 물으시면 <b>교인명부</b>와 <b>사역 이력</b>에서 찾아 드려요.
AI(Claude)에는 질문과 「물을 수 있는 것」 목록만 가고, 명단은 서버가 직접 찾아요 — 이름은 AI 에게 가지 않아요.
지금은 총괄에게만 보이는 시험판이에요.</p>`;

// 우리 자료로 답할 수 있는 예 + 못 하는 조건이 섞인 예 하나(마지막)
export const EXAMPLES = [
  "10년 동안 사역하신 분들 중에 올해는 안 하고 계신 분",
  "최근 10년 중 찬양대에서 5번 이상 섬기신 권사님",
  "2015년에 교회학교를 섬기셨는데 최근 3년은 쉬고 계신 분",
  "50대 남자 집사님 중 한 번도 사역하지 않으신 분",
  "5년 넘게 쉬지 않고 섬기신 분 중 요즘 예배에 잘 안 나오시는 분",
];

const ERR = {
  "no-question": "질문을 적어 주세요",
  "question-too-long": "질문은 300자까지 적을 수 있어요",
  "ask-no-key": "AI 키가 설정되지 않았어요(서버)",
  "ask-ai": "AI 를 부르지 못했어요 — 잠시 뒤 다시 물어 주세요",
  "ask-refused": "AI 가 이 질문에는 답하지 않았어요 — 말을 바꿔 다시 물어 주세요",
  "ask-cut": "AI 답이 잘렸어요 — 다시 물어 주세요",
  "ask-bad-json": "AI 답을 읽지 못했어요 — 다시 물어 주세요",
  "bad-tree": "남은 조건이 없어요 — 질문을 고쳐 주세요",
};
const errMsg = (r) => (ERR[r?.error] ? ERR[r.error] + (r.code ? ` (${r.code})` : "") : errorText(r));

const GROUP_LABEL = { all: "그리고", any: "또는(하나 이상)", none: "아님(빼기)" };
const FORM = `<form class="card ak-form" autocomplete="off">
  <label class="sec-title" for="ak-q" style="margin-top:0">무엇이 궁금하세요?</label>
  <textarea id="ak-q" maxlength="300" placeholder="예: 10년 동안 사역하신 분들 중에 올해는 안 하고 계신 분"></textarea>
  <div class="acts"><button type="submit" class="btn primary">묻기</button></div>
  <div class="ak-exs"><span class="muted">이렇게 물어보세요</span>
    ${EXAMPLES.map((q, i) => `<button type="button" class="ak-ex" data-ex="${i}">${esc(q)}</button>`).join("")}</div>
</form>`;

const n = (x) => Number(x || 0).toLocaleString("ko-KR");

function chipsHtml(r) {
  const groups = ["all", "any", "none"].filter((g) => (r.chips?.[g] || []).length);
  if (!groups.length) return "";
  return `<h3 class="sec-title">이렇게 알아들었어요</h3>` + groups.map((g) =>
    `<div class="ak-grp ${g}"><span class="ak-grp-l">${esc(GROUP_LABEL[g])}</span>` +
    r.chips[g].map((t, i) => {
      const from = r.tree?.[g]?.[i]?.from_text || "";
      return `<span class="ak-chip" title="${esc(from ? "질문의 말: " + from : "")}">${esc(t)}` +
        `<button type="button" class="ak-x" data-x="${g}:${i}" aria-label="${esc(t)} 조건 빼고 다시 찾기">×</button></span>`;
    }).join("") + `</div>`).join("") +
    `<p class="muted ak-hint">칩의 ×를 누르면 그 조건을 빼고 다시 찾아요(AI 를 다시 부르지 않아요).</p>`;
}

function unsupHtml(r) {
  if (!(r.unsupported || []).length) return "";
  const stop = r.status === "partial" && r.total === null;
  return `<div class="ak-warn" role="note"><b>⚠ 찾을 수 없는 조건</b><ul>` +
    r.unsupported.map((u) => `<li>「${esc(u.text)}」 — ${esc(u.label)}${u.note ? ` · ${esc(u.note)}` : ""}</li>`).join("") + `</ul>` +
    (stop ? `<p class="ak-why">이 조건을 빼고 찾으면 물으신 것과 다른 명단이 돼요. 어떻게 할까요?</p>
      <div class="acts"><button type="button" class="btn" data-act="rest">나머지 조건으로만 찾기</button>
      <button type="button" class="btn" data-act="edit">질문 고치기</button></div>` : "") + `</div>`;
}

function rowsHtml(r, dropped) {
  if (r.total === null || r.total === undefined) return "";
  const banner = dropped.length
    ? `<p class="ak-banner">「${dropped.map(esc).join("」 · 「")}」은(는) 빠진 결과예요 — 이 명단이 그런 분들이라는 뜻이 아니에요.</p>` : "";
  if (!r.total) return banner + `<p class="ak-total">0명</p><p class="empty">조건에 맞는 분이 없어요</p>`;
  const span = (x) => (x.served ? (x.first === x.last ? `${x.first}` : `${x.first}~${x.last}`) : "—");
  return banner + `<p class="ak-total">${n(r.total)}명${r.truncated ? ` <span class="muted">· 앞의 ${n(r.rows.length)}명만 보여요</span>` : ""}</p>
    <div class="ak-tbl"><table class="pp-stat"><thead><tr><th>이름</th><th>직분</th><th>교구</th><th>목장</th><th>나이</th>
      <th>섬긴 해</th><th>처음~마지막</th><th>주로 섬긴 곳</th></tr></thead><tbody>` +
    r.rows.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.position || "—")}</td><td>${esc(x.gu || "—")}</td><td>${esc(x.mok || "—")}</td>` +
      `<td>${x.age ?? "—"}</td><td>${x.served ? x.served + "해" : "—"}</td><td>${esc(span(x))}</td><td>${esc(x.main || "—")}</td></tr>`).join("") +
    `</tbody></table></div>`;
}

function resultHtml(r, st) {
  const status = r.status === "none"
    ? `<p class="ak-err">찾을 수 있는 조건이 없어요 — 아래 까닭을 보시고 질문을 고쳐 주세요.</p>` : "";
  const alt = (r.alternatives || []).length
    ? `<p class="ak-alt">이렇게도 읽을 수 있어요: ${r.alternatives.map((a) => `<b>${esc(a)}</b>`).join(" · ")}</p>` : "";
  const notes = (r.notices || []).length ? `<ul class="ak-notes">${r.notices.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
  const src = r.source || {};
  const foot = `<p class="ak-foot">셈: 교인명부 ${n(src.people)}명 · 사역 이력 ${esc(src.years || "")}년 가운데 교인과 이어진 ${n(src.linked)}줄(전체 ${n(src.histRows)}줄)
    · 교인명부에 없는 분(떠난 분)과 교인과 안 이어진 줄은 빠져요 · 이 질문은 「바꾼 기록」의 교인명부 기록에 남아요.</p>`;
  const raw = st.raw ? `<details class="ak-raw"><summary>AI 가 돌려준 조건 보기(JSON)</summary>
    <pre>${esc(JSON.stringify(st.raw, null, 2))}</pre><p class="muted">모델 ${esc(st.model || "")} · 규약 ${esc(r.contract || "")}</p></details>` : "";
  return `<div class="card ak-res"><p class="ak-qecho">물으신 것: 「${esc(st.question)}」</p>` +
    status + chipsHtml(r) + alt + unsupHtml(r) + notes + rowsHtml(r, st.dropped) + foot + raw + `</div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + INTRO + FORM + `<div class="ak-out" aria-live="polite"></div>`;
  const qEl = el.querySelector("#ak-q");
  const out = el.querySelector(".ak-out");
  let st = null;   // { question, raw, model, tree, unsupported, dropped[] } — 이 화면 안에서만

  async function ask() {
    const question = qEl.value.trim();
    if (!question) { out.innerHTML = `<p class="ak-err">${esc(ERR["no-question"])}</p>`; qEl.focus(); return; }
    out.innerHTML = `<p class="ak-wait">조건을 만드는 중이에요… AI 가 질문을 읽고 있어요(10초 안팎).</p>`;
    const r = await busy(el, () => call("askPeople", { question }));
    if (!el.isConnected) return;
    if (!r.ok) { out.innerHTML = `<p class="ak-err">${esc(errMsg(r))}</p>`; return; }
    st = { question: r.question, raw: r.raw, model: r.model, tree: r.tree, unsupported: r.unsupported || [], dropped: [] };
    out.innerHTML = resultHtml(r, st);
  }

  async function rerun(tree, dropped) {
    const r = await busy(el, () => call("askPeopleRun", { tree, dropped: dropped.length }));
    if (!el.isConnected) return;
    if (!r.ok) { toast(errMsg(r)); return; }
    st = { ...st, tree: r.tree, unsupported: r.unsupported || [], dropped };
    out.innerHTML = resultHtml(r, st);
  }

  el.addEventListener("submit", (e) => { if (e.target.closest(".ak-form")) { e.preventDefault(); ask(); } });
  el.addEventListener("click", (e) => {
    const ex = e.target.closest("button[data-ex]");
    if (ex && el.contains(ex)) { qEl.value = EXAMPLES[Number(ex.dataset.ex)] || ""; ask(); return; }
    if (!st) return;
    const x = e.target.closest("button[data-x]");
    if (x && el.contains(x)) {
      const [g, i] = x.dataset.x.split(":");
      const leaf = st.tree?.[g]?.[Number(i)];
      if (!leaf) return;
      const tree = { all: [...st.tree.all], any: [...st.tree.any], none: [...st.tree.none] };
      tree[g] = tree[g].filter((_, k) => k !== Number(i));
      const left = tree.all.length + tree.any.length + tree.none.length;
      if (!left) { toast("남은 조건이 없어요 — 질문을 고쳐 주세요"); return; }
      rerun(tree, [...st.dropped, leaf.from_text || ""].filter(Boolean));
      return;
    }
    const act = e.target.closest("button[data-act]");
    if (!act || !el.contains(act)) return;
    if (act.dataset.act === "rest") rerun(st.tree, [...st.dropped, ...st.unsupported.map((u) => u.text)]);
    if (act.dataset.act === "edit") { qEl.focus(); qEl.select(); }
  });
}
