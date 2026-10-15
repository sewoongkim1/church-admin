// 🏠 심방 준비 한 장(시험판 · 2026-10-15 · 총괄만) — 🤖 성도 묻기 명단의 「심방」 단추가 연다.
//   서버 visitCard(카드 재료 · 기록 people.visit) → 창을 바로 띄우고, visitPoints(AI 「나눌 이야깃거리」 — 이름 없는 사실만 간다)를 뒤이어 채운다.
//   연락처 · 사진은 싣지 않는다 — 「교인명부 자세히」 단추(people/search.js openPerson)로 본다.
//   서버 재료 묶기는 supabase/functions/church-admin/visit-card.ts(순수 · 시험 tests/visit-card.test.mjs).
// ⚠️ 이 파일은 Node 시험이 불러 볼 수 있다 — 맨 위에서 document·window 를 만지지 않는다.
import { esc, dialog, toast, errorText } from "../../core/ui.js";
import { openPerson } from "./search.js";

const ERR = {
  "ask-no-key": "AI 키가 설정되지 않았어요(서버)",
  "ask-ai": "AI 를 부르지 못했어요",
  "ask-refused": "AI 가 이번에는 쓰지 않았어요",
  "ask-cut": "AI 답이 잘렸어요",
  "ask-bad-json": "AI 답을 읽지 못했어요",
};
const SHOW_YEARS = 10;   // 섬김은 최근 열 해까지 줄로, 그 앞은 수로

const row = (k, v) => `<div class="vc-row"><b>${esc(k)}</b><span>${v}</span></div>`;

export function visitHtml(card, historyOk = true) {
  const h = card.head, sv = card.service;
  const sub = [h.gu, h.mok, h.regYear ? `${h.regYear}년 등록(${h.regYears}년째)` : "", h.age !== null && h.age !== undefined ? `${h.age}세` : ""]
    .filter(Boolean).map(esc).join(" · ");
  const fam = card.family.length
    ? card.family.map((f) => row(f.rel || "가족", `${esc(f.name)}${f.position ? ` · ${esc(f.position)}` : ""}${f.age !== null && f.age !== undefined ? ` · ${f.age}세` : ""}`)).join("")
    : `<p class="vc-empty">교인명부에 같은 가구가 없어요</p>`;
  const yrs = sv.years.slice(0, SHOW_YEARS).map((y) => row(String(y.year), esc(y.teams.join(" · ")))).join("");
  const more = sv.years.length > SHOW_YEARS ? `<p class="vc-empty">그 앞 ${sv.years.length - SHOW_YEARS}해는 「교인명부 자세히」의 사역 탭에서</p>` : "";
  const orders = card.orders.length ? row("신청", esc(card.orders.map((o) => `${o.year} ${o.team}(${o.status})`).join(" · "))) : "";
  const service = sv.total ? yrs + more + orders : `<p class="vc-empty">사역 임명 기록이 없어요</p>${orders}`;
  const bible = card.bible.map((b) => row(b.year ? String(b.year) : "—", esc(b.title))).join("");
  const edu = card.education.map((e) => row(e.term || "교육", `${esc(e.title)}${e.status ? ` · ${esc(e.status)}` : ""}`)).join("");
  return `<div class="vc">
    <div class="vc-head"><div class="vc-ini" aria-hidden="true">${esc((h.name || "?").slice(0, 1))}</div>
      <div><p class="vc-name">${esc(h.name || "이름 없음")} <span>${esc(h.position || "")}</span></p>
        <p class="vc-sub">${sub}</p>
        <p class="vc-tags">${card.tags.map((t) => `<span class="vc-tag">${esc(t)}</span>`).join("")}</p></div></div>
    <section class="vc-sec"><h4>가족 · ${card.family.length}명</h4>${fam}</section>
    <section class="vc-sec"><h4>섬김 · 모두 ${sv.total}해${sv.first ? ` (${sv.first}~${sv.last})` : ""}</h4>${service}</section>
    <section class="vc-sec"><h4>배움 · 말씀</h4>${bible || edu ? bible + edu : `<p class="vc-empty">성경필사 · 교육 기록이 없어요</p>`}</section>
    <section class="vc-sec vc-ai" aria-live="polite"><h4>💡 나눌 이야깃거리</h4>
      <div class="vc-points"><p class="vc-wait">AI 가 위 기록을 읽고 있어요…</p></div>
      <p class="vc-note">AI 는 위 기록만 보고 써요 · 이름 · 연락처는 AI 에게 가지 않아요 · 판단은 목사님 몫이에요</p></section>
    ${historyOk ? "" : `<p class="vc-err">사역 · 성경필사 · 교육 기록을 불러오지 못했어요 — 다시 열어 주세요</p>`}
    <div class="acts"><button type="button" class="btn" data-vc-detail="1">교인명부 자세히(연락처 · 사진)</button></div>
  </div>`;
}

let opening = false;   // 카드를 여는 중(visitCard 를 기다림)에 또 누르면 — 말없이 버리지 않는다
export async function openVisitCard(call, id, back) {
  if (opening) { toast("앞 카드를 여는 중이에요"); return; }
  opening = true;
  let toDetail = false;
  try {
    const r = await call("visitCard", { id: Number(id) });
    if (!r.ok) { toast(errorText(r)); return; }
    const closed = dialog({ title: "", html: visitHtml(r.card, r.historyOk), ok: "닫기", cancel: null, cls: "vc-dlg" });
    const dim = [...document.querySelectorAll(".dlg-dim")].pop();   // dialog 는 창을 곧바로(동기로) 붙인다
    dim.querySelector(".dlg").setAttribute("aria-label", `${r.card.head.name || "이름 없음"} 심방 준비`);
    const okBtn = dim.querySelector('[data-v="1"]');
    okBtn.focus();
    dim.addEventListener("click", (e) => {
      if (!e.target.closest("button[data-vc-detail]")) return;
      toDetail = true;
      okBtn.click();   // 카드를 닫고 「자세히」 창으로
    });
    const pts = dim.querySelector(".vc-points");
    call("visitPoints", { id: Number(id) }).then((p) => {
      if (!pts.isConnected) return;
      if (!p.ok) { pts.innerHTML = `<p class="vc-err">${esc(ERR[p.error] || errorText(p))}</p>`; return; }
      pts.innerHTML = p.points.length ? `<ul>${p.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
        : `<p class="vc-err">이야깃거리를 만들지 못했어요</p>`;
    });
    await closed;
  } finally {
    opening = false;
  }
  if (toDetail) openPerson(call, Number(id), () => toast("가족 모두 보기는 🔎 교인 찾기에서 할 수 있어요"), back);
  else if (back && back.isConnected) back.focus();
}
