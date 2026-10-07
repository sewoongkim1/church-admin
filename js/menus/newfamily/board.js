// 👣 새가족 현황 — 한 분마다 지금 몇째 걸음인지 · 섬김이 배정(새가족 1단계 · 2026-10-07 · 설계 v2 §3·§6)
//   서버: nfList(하는 일에 따라 칸이 다르다) · nfAssign(운영팀·정착팀 총무) · nfPersonSet(운영팀 — 수료 대상·멈춤).
//   섬김이에게는 자기에게 배정된 분만 온다(이름·전화·인도자·몇 번째인지). 규칙·말은 nf-logic.js(시험).
//   2단계(2026-10-07): 섬김이 「✍️ 오늘 만났어요」 · 「📒 교육 기록」(= 보고서 · record.js) · 목사님 「✅ 목사님 교육 참석」·교구 배정.
// ⚠️ 서버 글자는 모두 esc. 전화는 눌러서 걸리게(숫자만 tel: 로).
import { esc, toast, busy, dialog, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne } from "../../core/picker.js";
import { groupByStage, guideLine, helperOptions, nfWord, personLine, stageText, LESSONS } from "./nf-logic.js";
import { openRecord, openLessonForm } from "./record.js";

const TITLE = `<h2 class="page-title">👣 새가족 현황</h2>`;
const failText = (r) => nfWord(r?.error) || errorText(r);
const tel = (p) => (p ? `<a class="nf-tel" href="tel:${esc(p.replace(/\D/g, ""))}">${esc(p)}</a>` : "");
// 섬김이를 정하거나 바꿀 수 있는 단계 — 보고서를 보내기 전까지
const ASSIGNABLE = new Set(["wait_helper", "learning", "wait_class", "wait_report"]);

function personHtml(p, d) {
  const sub = [personLine(p), guideLine(p)].filter(Boolean).join(" · ");
  const acts = [];
  // 교육 줄을 적는 분(그분의 섬김이·운영팀)과 읽는 분(+ 목사님) — 막는 것은 서버다
  const mine = d.chief || (!!d.myHelperId && p.helperId === d.myHelperId);
  const reads = mine || d.canPastor;
  if (mine && p.stage === "learning" && p.lessons < LESSONS) acts.push(`<button type="button" class="btn primary" data-act="met">✍️ 오늘 만났어요</button>`);
  if (d.canPastor && p.stage === "wait_class") acts.push(`<button type="button" class="btn primary" data-act="class">✅ 목사님 교육 참석</button>`);
  if (reads && p.helperId && p.target) acts.push(`<button type="button" class="btn${
    (mine && p.stage === "wait_report") || (d.canPastor && p.stage === "wait_parish") ? " primary" : ""}" data-act="record">${
    d.canPastor && p.stage === "wait_parish" ? "📒 보고서 보고 교구 정하기" : mine && p.stage === "wait_report" ? "📒 보고서 보내기" : "📒 교육 기록"}</button>`);
  if (d.canAssign && ASSIGNABLE.has(p.stage)) acts.push(`<button type="button" class="btn" data-act="assign">${p.helperId ? "섬김이 바꾸기" : "섬김이 정하기"}</button>`);
  if (d.chief && p.stage !== "done") acts.push(`<button type="button" class="btn" data-act="more">더 보기</button>`);
  return `<div class="card nf-row${p.quiet ? " quiet" : ""}" data-id="${esc(p.id)}">
    <div class="nf-row-h"><b>${esc(p.name)}</b> <span class="badge${p.stage === "info" || p.stage === "stopped" ? "" : " ok"}">${esc(stageText(p))}</span>
      ${p.quiet ? `<span class="badge dup">3주 넘게 소식 없음</span>` : ""}</div>
    ${sub ? `<p class="nf-sub">${esc(sub)}</p>` : ""}
    ${p.phone ? `<p class="nf-sub">${tel(p.phone)}</p>` : ""}
    ${p.helperName ? `<p class="nf-sub">섬김이 <b>${esc(p.helperName)}</b></p>` : ""}
    ${p.parish ? `<p class="nf-sub">편성 교구 <b>${esc(p.parish)}</b></p>` : ""}
    ${p.stage === "stopped" && p.stopReason ? `<p class="nf-sub">멈춘 까닭: ${esc(p.stopReason)}</p>` : ""}
    ${acts.length ? `<div class="acts">${acts.join("")}</div>` : ""}
  </div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let data = null, q = "";
  const shut = new Set(["done", "info"]);   // 접어 두는 묶음(끝난 분 · 정보만)

  const load = async () => {
    const r = await call("nfList", {});
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(failText(r))}</p>`; return false; }
    data = r;
    return true;
  };
  const listHtml = () => {
    const groups = groupByStage(data.people, q);
    if (!groups.length) return `<p class="empty">${q ? "그 이름의 분이 없어요" : data.scope === "mine" ? "아직 배정된 새가족이 없어요" : "아직 새가족이 없어요 — 「🌱 새가족 카드」에서 넣어 주세요"}</p>`;
    return groups.map((g) => `<details class="nf-group" data-stage="${esc(g.stage)}" ${shut.has(g.stage) && !q ? "" : "open"}>
      <summary><b>${esc(g.label)}</b> <span class="nf-count">${g.people.length}</span> <small class="muted">${esc(g.hint)}</small></summary>
      ${g.people.map((p) => personHtml(p, data)).join("")}</details>`).join("");
  };
  const draw = () => {
    if (data.scope === "none") {
      el.innerHTML = TITLE + `<p class="empty">아직 하는 일이 정해지지 않았어요.<br>새가족 운영팀이 「함께 쓰는 분」에서 정해 드리면 여기에 보여요.</p>`;
      return;
    }
    el.innerHTML = TITLE +
      (data.scope === "mine" ? `<p class="be-note">내게 배정된 새가족이에요. 교육한 날 「✍️ 오늘 만났어요」로 한 줄씩 적어 주세요 — 네 번이 모이면 그대로 목사님께 가는 보고서가 돼요.</p>` : "") +
      (data.people.length > 8 ? `<label class="field"><span>이름으로 찾기</span><input data-q value="${esc(q)}" autocomplete="off" placeholder="이름"></label>` : "") +
      `<div data-list>${listHtml()}</div>`;
  };
  const reload = async () => { if (await load()) draw(); };

  if (!(await load())) return;
  draw();

  el.addEventListener("input", (e) => {
    if (!e.target.matches("[data-q]")) return;
    q = e.target.value;
    el.querySelector("[data-list]").innerHTML = listHtml();
  });
  el.addEventListener("toggle", (e) => {
    const d = e.target.closest?.("[data-stage]");
    if (d && !q) { if (d.open) shut.delete(d.dataset.stage); else shut.add(d.dataset.stage); }
  }, true);

  const open = new Set();
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const id = b.closest("[data-id]")?.dataset.id || "";
    const p = data.people.find((x) => x.id === id);
    if (!p || open.has(id)) return;
    open.add(id);
    let done = false;
    try {
      if (b.dataset.act === "met") {
        if (await openLessonForm({ call, personId: id, name: p.name, today: data.today })) { done = true; toast("적었어요"); }
      } else if (b.dataset.act === "record") {
        done = await openRecord({ call, personId: id, today: data.today });
      } else if (b.dataset.act === "class") {
        const r = await call("nfPastorClass", { person_id: id, on: true });
        done = true;
        toast(r.ok ? `${p.name} 님을 참석으로 표시했어요` : failText(r));
      } else if (b.dataset.act === "assign") {
        const opts = helperOptions(data.helpers, { withClear: !!p.helperId });
        if (!opts.length) { await dialog({ text: "배정할 섬김이가 없어요 — 새가족 운영팀이 「함께 쓰는 분」에서 섬김이를 먼저 넣어 주세요", cancel: null }); return; }
        const pick = await pickOne({ anchor: b, title: `${p.name} 님의 섬김이`, options: opts, value: p.helperId || "", wrap: true });
        if (pick === null || pick === (p.helperId || "")) return;
        const r = await call("nfAssign", { person_id: id, helper_id: pick });
        done = true;
        toast(r.ok ? (pick ? "섬김이를 정했어요" : "배정을 풀었어요") : failText(r));
      } else if (b.dataset.act === "more") {
        const opts = [];
        if (p.stage === "stopped") opts.push({ value: "resume", label: "멈춤 풀기", hint: "다시 오셨어요" });
        else if (p.target) opts.push({ value: "stop", label: "멈춤으로 두기", hint: "이사 · 연락 안 됨 · 다른 교회 등" });
        opts.push(p.target ? { value: "untarget", label: "수료 대상 아님으로", hint: "정보만 남겨요" } : { value: "target", label: "수료 대상으로", hint: "교육을 받고 등록식에 서실 분" });
        const pick = await pickOne({ anchor: b, title: p.name + " 님", options: opts, value: "", wrap: true });
        if (!pick) return;
        const send = async (body) => call("nfPersonSet", { person_id: id, base: p.updatedAt, ...body });
        let r = null;
        if (pick === "resume") r = await send({ stopped: false });
        else if (pick === "target") r = await send({ target: true });
        else if (pick === "untarget") {
          r = await send({ target: false });
          if (!r.ok && r.error === "has-lessons") {
            if (!(await dialog({ title: "교육 기록이 있는 분이에요", text: "수료 대상이 아닌 분으로 바꾸면 현황에서 「정보만」으로 내려가요. 적어 둔 교육 기록은 지워지지 않아요.", ok: "바꾸기", danger: true }))) return;
            r = await send({ target: false, force: true });
          }
        } else if (pick === "stop") {
          const got = await openForm({
            title: `${p.name} 님 — 멈춤`, okLabel: "멈춤으로 두기",
            html: `<label class="field"><span>까닭 <small>(운영팀·목사님만 봐요)</small></span><input data-f="reason" maxlength="120" placeholder="예: 이사 · 연락이 닿지 않음"></label>`,
            onSubmit: async (root) => {
              const x = await send({ stopped: true, reason: root.querySelector('[data-f="reason"]').value.trim() });
              return x.ok ? { ok: true } : x.error === "changed" ? { ok: true, value: "stale" } : { ok: false, message: failText(x) };
            },
          });
          if (!got) return;
          done = true;
          toast(got === "stale" ? nfWord("changed") : "멈춤으로 두었어요");
          return;
        }
        done = true;
        toast(r.ok ? "바꿨어요" : failText(r));
      }
    } finally {
      open.delete(id);
      if (done) await busy(el, reload);
    }
  });
}
