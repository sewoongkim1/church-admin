// 📒 교육 기록 = 섬김이 보고서 — 교육한 날마다 적은 줄(일자 · 내용 · 비고)이 모인 것(새가족 2단계 · 2026-10-07 · 설계 v2 §3)
//   서버: nfLessons(읽기) · nfLessonSave·nfLessonDelete(그분의 섬김이·운영팀) · nfReportSend(섬김이 → 목사님) ·
//         nfPastorClass·nfReportReturn·nfParishList·nfParishSet(새가족 목사님·운영팀).
//   따로 쓰는 보고서는 없다 — 네 줄이 차고 목사님 교육을 마치면 「목사님께 보내기」. 보낸 뒤에는 줄이 잠긴다(목사님이 돌려보내면 풀린다).
//   무엇을 할 수 있는지는 서버가 준다(canWrite·canSend·canPastor) — 여기서 짐작하지 않는다.
// ⚠️ 서버 글자는 모두 esc(내용은 줄바꿈을 살려 보인다).
import { esc, dialog, toast, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne, pickDate, fmtDateLabel } from "../../core/picker.js";
import { LESSONS, nfWord, stageText, lessonTitle, recordHint } from "./nf-logic.js";

const failText = (r) => nfWord(r?.error) || errorText(r);

// 줄 하나 적기·고치기 → true · 닫으면 null. today = 서버의 오늘(앞날은 못 고른다).
export function openLessonForm({ call, personId, name, today, lesson = null, extra = false }) {
  const v0 = { on: lesson?.metOn || today, content: lesson?.content || "", note: lesson?.note || "" };
  const read = (root) => ({ on: root.querySelector('[data-f="on"]').value, content: root.querySelector('[data-f="content"]').value.trim(),
    note: root.querySelector('[data-f="note"]').value.trim() });
  return openForm({
    title: lesson ? "줄 고치기" : extra ? `＋ 한 줄 더 — ${name}` : `✍️ 오늘 만났어요 — ${name}`, okLabel: "저장",
    html: `<input type="hidden" data-f="on" value="${esc(v0.on)}">
      <div class="field"><span>일자</span><button type="button" class="pk-field" data-date aria-haspopup="dialog" aria-expanded="false">
        <span class="pk-field-v">${esc(fmtDateLabel(v0.on))}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>
      <label class="field"><span>내용 <small>(그날 만남 내용 — 이 줄들이 모여 목사님께 가는 보고서가 돼요)</small></span>
        <textarea data-f="content" class="nf-ta" maxlength="1000" rows="6">${esc(v0.content)}</textarea></label>
      <label class="field"><span>비고</span><input data-f="note" maxlength="300" value="${esc(v0.note)}" autocomplete="off"></label>`,
    onOpen: (root) => {
      root.addEventListener("click", async (e) => {
        const d = e.target.closest("[data-date]");
        if (!d) return;
        const got = await pickDate({ anchor: d, title: "만난 날", value: root.querySelector('[data-f="on"]').value, max: today });
        if (got && d.isConnected) { root.querySelector('[data-f="on"]').value = got; d.querySelector(".pk-field-v").textContent = fmtDateLabel(got); }
      });
    },
    isDirty: (root) => JSON.stringify(read(root)) !== JSON.stringify(v0),
    onSubmit: async (root) => {
      const v = read(root);
      const r = await call("nfLessonSave", { person_id: personId, ...(lesson ? { id: lesson.id } : {}), met_on: v.on, content: v.content, note: v.note });
      return r.ok ? { ok: true } : { ok: false, message: failText(r) };
    },
  });
}

function bodyHtml(r) {
  const p = r.person;
  const lines = r.lessons.length ? r.lessons.map((l, i) => `<div class="nf-line" data-lid="${esc(l.id)}">
      <div class="nf-line-h"><b>${esc(lessonTitle(l, r.lessons, i))}</b> <span class="muted">${esc(fmtDateLabel(l.metOn))}${l.writtenBy ? ` · ${esc(l.writtenBy)}` : ""}</span></div>
      ${l.content ? `<p class="nf-line-c">${esc(l.content)}</p>` : `<p class="nf-line-c muted">(내용 없음)</p>`}
      ${l.note ? `<p class="nf-line-n">비고: ${esc(l.note)}</p>` : ""}
      ${r.canWrite ? `<div class="acts nf-line-a"><button type="button" class="btn" data-act="edit">고치기</button>${
        r.classOn ? "" : `<button type="button" class="btn danger" data-act="del">지우기</button>`}</div>` : ""}
    </div>`).join("") : `<p class="empty">아직 적은 줄이 없어요</p>`;
  const acts = [];
  if (r.canWrite) acts.push(`<button type="button" class="btn${p.lessons < LESSONS ? " primary" : ""}" data-act="add">${p.lessons < LESSONS ? "✍️ 오늘 만났어요" : "＋ 한 줄 더"}</button>`);
  if (r.canSend) acts.push(`<button type="button" class="btn primary" data-act="send">📨 목사님께 보내기</button>`);
  if (r.canPastor) {
    if (p.stage === "wait_class") acts.push(`<button type="button" class="btn primary" data-act="class-on">✅ 목사님 교육 참석</button>`);
    if (p.stage === "wait_report") acts.push(`<button type="button" class="btn" data-act="class-off">목사님 교육 참석 풀기</button>`);
    if (p.stage === "wait_parish" || p.stage === "registered") acts.push(`<button type="button" class="btn primary" data-act="parish">${r.parish ? "교구 바꾸기" : "🏠 교구 정하기"}</button>`);
    if (p.stage === "wait_parish") acts.push(`<button type="button" class="btn" data-act="return">섬김이께 돌려보내기</button>`);
  }
  const hint = recordHint(r);
  return `<p class="nf-rec-h"><b>${esc(p.name)}</b> <span class="badge ok">${esc(stageText(p))}</span>${p.helperName ? ` <span class="muted">섬김이 ${esc(p.helperName)}</span>` : ""}</p>
    ${r.canPastor && (p.guides || []).length ? `<p class="nf-sub">인도 ${esc(p.guides.map((g) => (g.mok ? `${g.name}(${g.mok})` : g.name)).join(", "))}</p>` : ""}
    ${r.canPastor && p.address ? `<p class="nf-sub">주소 ${esc(p.address)}</p>` : ""}
    ${r.parish ? `<p class="be-note">편성 교구 <b>${esc(r.parish)}</b></p>` : ""}
    ${r.reportReturn ? `<p class="be-note nf-return">목사님 말씀: ${esc(r.reportReturn)}</p>` : ""}
    ${hint ? `<p class="muted nf-hint">${esc(hint)}</p>` : ""}
    <div class="nf-lines">${lines}</div>
    ${acts.length ? `<div class="acts nf-rec-a">${acts.join("")}</div>` : ""}`;
}

// 교육 기록 창 → 무엇이든 바뀌었으면 true(부른 쪽이 명단을 새로 불러온다) · 아니면 false
export async function openRecord({ call, personId, today }) {
  let r = await call("nfLessons", { person_id: personId });
  if (!r.ok) { toast(failText(r)); return true; }
  let changed = false;
  await openForm({
    title: "📒 교육 기록", hideOk: true, cancelLabel: "닫기", html: bodyHtml(r),
    onOpen: (root) => {
      const body = root.querySelector(".be-body");
      const refresh = async () => {
        changed = true;
        const x = await call("nfLessons", { person_id: personId });
        if (!root.isConnected) return;
        if (x.ok) { r = x; body.innerHTML = bodyHtml(r); } else body.innerHTML = `<p class="empty">${esc(failText(x))}</p>`;
      };
      const say = async (x, okText) => { toast(x.ok ? okText : failText(x)); await refresh(); };
      let busyNow = false;
      root.addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-act]");
        if (!b || busyNow) return;
        busyNow = true;
        try {
          const act = b.dataset.act, name = r.person.name;
          const line = r.lessons.find((l) => l.id === b.closest("[data-lid]")?.dataset.lid);
          if (act === "add") {
            if (await openLessonForm({ call, personId, name, today, extra: r.person.lessons >= LESSONS })) { toast("적었어요"); await refresh(); }
          } else if (act === "edit" && line) {
            if (await openLessonForm({ call, personId, name, today, lesson: line })) { toast("고쳤어요"); await refresh(); }
          } else if (act === "del" && line) {
            if (await dialog({ title: "이 줄을 지울까요?", text: `${fmtDateLabel(line.metOn)}에 적은 줄이에요. 지우면 되돌릴 수 없어요.`, ok: "지우기", danger: true })) {
              await say(await call("nfLessonDelete", { person_id: personId, id: line.id }), "지웠어요");
            }
          } else if (act === "send") {
            if (await dialog({ title: "목사님께 보낼까요?", text: "보낸 뒤에는 줄을 고칠 수 없어요. 목사님이 돌려보내시면 다시 고칠 수 있어요.", ok: "보내기" })) {
              await say(await call("nfReportSend", { person_id: personId }), "목사님께 보냈어요");
            }
          } else if (act === "class-on") {
            await say(await call("nfPastorClass", { person_id: personId, on: true }), "참석으로 표시했어요");
          } else if (act === "class-off") {
            await say(await call("nfPastorClass", { person_id: personId, on: false }), "참석 표시를 풀었어요");
          } else if (act === "parish") {
            const lr = await call("nfParishList", {});
            if (!lr.ok) { toast(failText(lr)); return; }
            let pick = null;
            if ((lr.list || []).length) {
              pick = await pickOne({ anchor: b, title: `${name} 님의 교구`, options: lr.list.map((x) => ({ value: x, label: x })), value: r.parish || "" });
            } else {
              // 교인명부가 없는 곳(개발 등) — 손으로 적는다
              pick = await openForm({ title: "교구 정하기", okLabel: "정하기",
                html: `<label class="field"><span>편성 교구 <small>(예: 믿음-35)</small></span><input data-f="p" maxlength="20" value="${esc(r.parish || "")}" autocomplete="off"></label>`,
                onSubmit: async (box) => ({ ok: true, value: box.querySelector('[data-f="p"]').value.trim() }) });
            }
            if (pick && pick !== r.parish) await say(await call("nfParishSet", { person_id: personId, parish: pick }), `교구를 정했어요 — ${pick}`);
          } else if (act === "return") {
            const got = await openForm({ title: "섬김이께 돌려보내기", okLabel: "돌려보내기",
              html: `<label class="field"><span>섬김이께 한마디 <small>(무엇을 더 적으면 되는지)</small></span><textarea data-f="n" class="nf-ta" maxlength="300" rows="3"></textarea></label>`,
              onSubmit: async (box) => {
                const x = await call("nfReportReturn", { person_id: personId, note: box.querySelector('[data-f="n"]').value.trim() });
                return x.ok ? { ok: true } : { ok: false, message: failText(x) };
              } });
            if (got) { toast("돌려보냈어요"); await refresh(); }
          }
        } finally { busyNow = false; }
      });
    },
  });
  return changed;
}
