// 🌱 새가족 카드 — 종이 등록카드 넣기·고치기 · 사진(새가족 1단계 · 2026-10-07 · 설계 v2 §6)
//   서버: nfList(카드 묶음) · nfCardGet · nfCardSave · nfPhotoPut · nfPhotoUrl. 규칙·말은 nf-logic.js(시험).
//   영접팀·운영팀: 「＋ 새 카드」·고치기·사진 올리기 · 정착팀 총무·목사님: 읽기와 사진 보기 · 섬김이: 이 메뉴는 비어 있다(막는 것은 서버).
// ⚠️ 서버 글자는 모두 esc.
import { esc, toast, busy, dialog, errorText } from "../../core/ui.js";
import { openCardForm } from "./card-form.js";
import { takeAndUpload, showPhoto, PHOTO_LABEL } from "./photo.js";
import { groupByCard, nfWord, stageText, birthText, BAPTIZED_LABEL } from "./nf-logic.js";

const TITLE = `<h2 class="page-title">🌱 새가족 카드</h2>`;
const failText = (r) => nfWord(r?.error) || errorText(r);
const regText = (d) => (d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일` : "");

function cardHtml(c, canWrite) {
  const names = c.people.map((p) => `<span class="nf-nm">${esc(p.name)}${p.relation && p.relation !== "본인" ? ` <small>${esc(p.relation)}</small>` : ""}
    <span class="badge${p.stage === "info" ? "" : " ok"}">${esc(stageText(p))}</span></span>`).join("");
  const photoBtn = (which, has) => (has
    ? `<button type="button" class="btn" data-act="see-${which}">${PHOTO_LABEL[which]} 보기</button>`
    : canWrite ? `<button type="button" class="btn" data-act="put-${which}">📷 ${PHOTO_LABEL[which]}</button>` : "");
  return `<div class="card nf-card" data-id="${esc(c.id)}">
    <div class="nf-card-h"><b>${esc(regText(c.regDate))}</b>${c.service ? ` <span class="muted">${esc(c.service)}</span>` : ""}
      ${c.draft ? `<span class="badge dup">마저 채울 카드</span>` : ""}</div>
    <div class="nf-names">${names || `<span class="muted">사람 없음</span>`}</div>
    <div class="acts"><button type="button" class="btn" data-act="open">${canWrite ? "보기·고치기" : "보기"}</button>
      ${photoBtn("card", c.hasCardPhoto)}${photoBtn("welcome", c.hasWelcomePhoto)}</div>
    ${canWrite && (c.hasCardPhoto || c.hasWelcomePhoto) ? `<div class="acts nf-re">${c.hasCardPhoto ? `<button type="button" class="btn" data-act="put-card">카드 사진 다시 찍기</button>` : ""}
      ${c.hasWelcomePhoto ? `<button type="button" class="btn" data-act="put-welcome">환영 사진 다시 찍기</button>` : ""}</div>` : ""}
  </div>`;
}

// 읽기만 하는 분(총무·목사님)의 카드 보기 — 카드의 모든 칸
function viewHtml(r) {
  const c = r.card, kv = (k, v) => (v ? `<div class="nf-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>` : "");
  return `<div class="nf-view">${kv("등록일", regText(c.regDate))}${kv("예배", c.service)}${kv("담당 교역자", c.pastor)}
    ${r.people.map((p) => `<div class="nf-view-p"><b>${esc(p.name)}</b> <small>${esc(p.relation || "")}</small>
      ${kv("성별", p.gender)}${kv("생년월일", birthText(p.birth) + (p.birthLunar ? " (음력)" : ""))}${kv("휴대전화", p.phone)}${kv("전화", p.tel)}
      ${kv("세례", BAPTIZED_LABEL[p.baptized] || "")}${kv("수료 대상", p.target ? "예" : "아니오")}</div>`).join("")}
    ${kv("주소", c.address)}${kv("차량번호", c.carNo)}
    ${c.selfCome ? kv("인도자", "스스로 오심") : r.guides.map((g) => kv(`인도자 ${g.seq}`, [g.name, g.mok, g.phone].filter(Boolean).join(" · "))).join("")}
    ${kv("비고", c.note)}</div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let data = null;
  let onlyDraft = false;

  const load = async () => {
    const r = await call("nfList", {});
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(failText(r))}</p>`; return false; }
    data = r;
    return true;
  };
  const draw = () => {
    if (data.scope !== "all") {
      el.innerHTML = TITLE + `<p class="empty">카드는 영접팀·정착팀 총무·새가족 목사님·운영팀이 봐요.<br>섬김이는 「👣 새가족 현황」에서 맡은 분을 보세요.</p>`;
      return;
    }
    const all = groupByCard(data.cards, data.people);
    const drafts = all.filter((c) => c.draft).length;
    const list = onlyDraft ? all.filter((c) => c.draft) : all;
    el.innerHTML = TITLE +
      (data.canWrite ? `<div class="acts nf-top"><button type="button" class="btn primary" data-act="new">＋ 새가족 카드</button></div>` : "") +
      (drafts ? `<div class="seg"><button type="button" data-f="all" class="${onlyDraft ? "" : "on"}">모든 카드 ${all.length}</button>
        <button type="button" data-f="draft" class="${onlyDraft ? "on" : ""}">마저 채울 카드 ${drafts}</button></div>` : "") +
      `<div class="nf-list">${list.length ? list.map((c) => cardHtml(c, data.canWrite)).join("")
        : `<p class="empty">아직 카드가 없어요${data.canWrite ? " — 「＋ 새가족 카드」로 넣어 주세요" : ""}</p>`}</div>`;
  };
  const reload = async () => { if (await load()) draw(); };

  if (!(await load())) return;
  draw();

  const open = new Set();
  el.addEventListener("click", async (e) => {
    const f = e.target.closest("button[data-f]");
    if (f) { onlyDraft = f.dataset.f === "draft"; draw(); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act, id = b.closest("[data-id]")?.dataset.id || "";
    const key = act + id;
    if (open.has(key)) return;
    open.add(key);
    let done = false;
    try {
      if (act === "new") {
        const got = await openCardForm({ call, today: data.today });
        done = !!got;
        if (got && got !== "stale") {
          toast("카드를 넣었어요");
          await busy(el, reload);
          done = false;
          // 넣자마자 카드 사진을 찍도록 권한다(판독·대조용 — 건너뛰어도 된다)
          if (await dialog({ title: "카드 사진을 찍을까요?", text: "종이 카드를 찍어 두면 나중에 맞게 넣었는지 대조할 수 있어요.", ok: "📷 지금 찍기", cancel: "나중에" })) {
            if (await takeAndUpload(call, got.cardId, "card")) { toast("카드 사진을 올렸어요"); done = true; }
          }
        }
      } else if (act === "open") {
        const r = await call("nfCardGet", { card_id: id });
        if (!r.ok) { toast(failText(r)); done = true; }
        else if (data.canWrite) {
          const got = await openCardForm({ call, got: r, today: data.today });
          done = !!got;
          if (got === "stale") toast(nfWord("changed"));
          else if (got) toast("카드를 고쳤어요");
        } else {
          await dialog({ title: "새가족 카드", html: viewHtml(r), ok: "닫기", cancel: null, cls: "nf-view-dlg" });
        }
      } else if (act.startsWith("put-")) {
        const which = act.slice(4);
        if (await takeAndUpload(call, id, which)) { toast(`${PHOTO_LABEL[which]}을 올렸어요`); done = true; }
      } else if (act.startsWith("see-")) {
        await showPhoto(call, id, act.slice(4));
      }
    } finally { open.delete(key); }
    if (done) await busy(el, reload);
  });
}
