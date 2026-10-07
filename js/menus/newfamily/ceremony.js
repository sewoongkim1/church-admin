// 🎉 등록식 — 운영팀이 명단을 만들고 확정하면 수료번호가 붙는다(새가족 3단계 · 2026-10-07 · 설계 v2 §4)
//   서버: nfCeremonyList · nfCeremonySave(만들기·날짜·지우기) · nfCeremonyPeople(담기·빼기·참석) · nfCeremonyConfirm · nfExport · nfPersonSet(미루는 사정).
//   명단은 저절로 채우지 않는다 — 교육이 끝나도 바로 등록식에 서지 않는 분이 있다(친구 2026-10-07).
//   후보 = 교구 배정까지 끝난 분. 교구 배정을 기다리는 분은 담을 수 없고 보이기만 한다.
//   ⚠️ 확정은 되돌릴 수 없다(수료번호를 드린다) — 확인 창에 몇 분께 몇 번부터인지 보인다.
// ⚠️ 서버 글자는 모두 esc.
import { esc, toast, busy, dialog, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickMany, pickDate, fmtDateLabel } from "../../core/picker.js";
import { loadXlsx } from "../../core/xlsx.js";
import { nfWord, waitDays, candOptions, exportName, confirmText } from "./nf-logic.js";

const TITLE = `<h2 class="page-title">🎉 등록식</h2>`;
const failText = (r) => nfWord(r?.error) || errorText(r);
const dayText = (d) => `${d.slice(0, 4)}년 ${fmtDateLabel(d)}`;

function openCeremonyForm({ call, ceremony = null, today }) {
  const v0 = { on: ceremony?.heldOn || today, note: ceremony?.note || "" };
  return openForm({
    title: ceremony ? "등록식 날짜 고치기" : "＋ 등록식", okLabel: ceremony ? "저장" : "만들기",
    html: `<input type="hidden" data-f="on" value="${esc(v0.on)}">
      <div class="field"><span>등록식 날짜</span><button type="button" class="pk-field" data-date aria-haspopup="dialog" aria-expanded="false">
        <span class="pk-field-v">${esc(dayText(v0.on))}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>
      <label class="field"><span>메모 <small>(운영팀만 봐요)</small></span><input data-f="note" maxlength="120" value="${esc(v0.note)}" autocomplete="off"></label>`,
    onOpen: (root) => root.addEventListener("click", async (e) => {
      const d = e.target.closest("[data-date]");
      if (!d) return;
      const got = await pickDate({ anchor: d, title: "등록식 날짜", value: root.querySelector('[data-f="on"]').value });
      if (got && d.isConnected) { root.querySelector('[data-f="on"]').value = got; d.querySelector(".pk-field-v").textContent = dayText(got); }
    }),
    isDirty: (root) => root.querySelector('[data-f="on"]').value !== v0.on || root.querySelector('[data-f="note"]').value.trim() !== v0.note,
    onSubmit: async (root) => {
      const r = await call("nfCeremonySave", { ...(ceremony ? { id: ceremony.id } : {}), held_on: root.querySelector('[data-f="on"]').value,
        note: root.querySelector('[data-f="note"]').value.trim() });
      return r.ok ? { ok: true } : { ok: false, message: failText(r) };
    },
  });
}

function ceremonyHtml(c, hasCand) {
  const going = c.people.filter((p) => p.attended).length;
  if (c.confirmed) {
    return `<details class="card nf-cer done" data-cid="${esc(c.id)}"><summary><b>${esc(dayText(c.heldOn))}</b> <span class="badge ok">확정</span>
        <span class="muted">${c.people.length}분 · ${esc(c.first)}${c.last && c.last !== c.first ? ` ~ ${esc(c.last)}` : ""}</span></summary>
      ${c.note ? `<p class="nf-sub">${esc(c.note)}</p>` : ""}
      <div class="nf-cer-list">${c.people.map((p) => `<div class="nf-cer-p"><b>${esc(p.certNo)}</b> <span>${esc(p.name)}</span> <span class="muted">${esc(p.parish)}</span></div>`).join("")}</div>
      <div class="acts"><button type="button" class="btn" data-act="xlsx">⬇ 엑셀로 받기</button></div></details>`;
  }
  return `<div class="card nf-cer" data-cid="${esc(c.id)}">
    <div class="nf-row-h"><b>${esc(dayText(c.heldOn))}</b> <span class="badge">준비 중</span> <span class="muted">담은 분 ${c.people.length} · 참석 ${going}</span></div>
    ${c.note ? `<p class="nf-sub">${esc(c.note)}</p>` : ""}
    <div class="nf-cer-list">${c.people.length ? c.people.map((p) => `<div class="nf-cer-p${p.attended ? "" : " off"}" data-pid="${esc(p.id)}">
        <span class="nf-cer-n"><b>${esc(p.name)}</b> <span class="muted">${esc([p.parish, p.helperName ? "섬김이 " + p.helperName : ""].filter(Boolean).join(" · "))}</span></span>
        <button type="button" class="btn nf-mini${p.attended ? " on" : ""}" data-act="att" aria-pressed="${p.attended}">${p.attended ? "참석" : "못 오심"}</button>
        <button type="button" class="btn nf-mini" data-act="out">빼기</button></div>`).join("")
      : `<p class="muted nf-hint">아직 담은 분이 없어요 — 아래 후보에서 담아 주세요</p>`}</div>
    <div class="acts"><button type="button" class="btn" data-act="add" ${hasCand ? "" : "disabled"}>후보에서 담기</button>
      <button type="button" class="btn" data-act="xlsx" ${c.people.length ? "" : "disabled"}>⬇ 엑셀</button></div>
    <div class="acts nf-cer-b"><button type="button" class="btn primary" data-act="confirm" ${going ? "" : "disabled"}>확정하고 수료번호 매기기</button></div>
    <div class="acts nf-re"><button type="button" class="btn" data-act="edit">날짜 고치기</button><button type="button" class="btn" data-act="del">이 등록식 지우기</button></div>
  </div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let data = null;

  const load = async () => {
    const r = await call("nfCeremonyList", {});
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(failText(r))}</p>`; return false; }
    data = r;
    return true;
  };
  const draw = () => {
    const open = data.ceremonies.filter((c) => !c.confirmed), done = data.ceremonies.filter((c) => c.confirmed);
    el.innerHTML = TITLE +
      `<div class="acts nf-top"><button type="button" class="btn primary" data-act="new">＋ 등록식</button></div>
      ${open.map((c) => ceremonyHtml(c, data.candidates.length > 0)).join("")}
      <h3 class="nf-h3">등록식 후보 <span class="nf-count">${data.candidates.length}</span></h3>
      <p class="muted nf-hint">교구 배정까지 끝났고 아직 등록식에 서지 않은 분이에요. 이번에 담지 않은 분은 여기 그대로 남아요.</p>
      ${data.candidates.length ? data.candidates.map((p) => `<div class="card nf-row" data-pid="${esc(p.id)}">
          <div class="nf-row-h"><b>${esc(p.name)}</b> <span class="badge ok">${esc(p.parish)}</span>
            <span class="muted">${esc([p.helperName ? "섬김이 " + p.helperName : "", waitDays(p.parishAt, data.today)].filter(Boolean).join(" · "))}</span></div>
          ${p.waitNote ? `<p class="nf-sub">사정: ${esc(p.waitNote)}</p>` : ""}
          <div class="acts nf-re"><button type="button" class="btn" data-act="wait">${p.waitNote ? "사정 고치기" : "미루는 사정 적기"}</button></div></div>`).join("")
        : `<p class="empty">후보가 없어요</p>`}
      ${data.waiting.length ? `<h3 class="nf-h3">교구 배정을 기다리는 분 <span class="nf-count">${data.waiting.length}</span></h3>
        <p class="muted nf-hint">교구가 정해져야 등록식에 담을 수 있어요 — 새가족 목사님께 여쭤 보세요.</p>
        <p class="nf-sub">${esc(data.waiting.map((p) => p.name + (p.helperName ? `(${p.helperName})` : "")).join(" · "))}</p>` : ""}
      ${done.length ? `<h3 class="nf-h3">지난 등록식 <span class="nf-count">${done.length}</span></h3>${done.map((c) => ceremonyHtml(c, false)).join("")}` : ""}`;
  };
  const reload = async () => { if (await load()) draw(); };

  if (!(await load())) return;
  draw();

  let lock = false;
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b || lock) return;
    lock = true;
    let done = false;
    try {
      const act = b.dataset.act;
      const c = data.ceremonies.find((x) => x.id === b.closest("[data-cid]")?.dataset.cid);
      const pid = b.closest("[data-pid]")?.dataset.pid || "";
      const people = async (body, okText) => {
        const r = await call("nfCeremonyPeople", { ceremony_id: c.id, ...body });
        done = true;
        if (!r.ok) toast(failText(r)); else if (okText) toast(r.skipped ? `${okText} (${r.skipped}분은 담지 못했어요 — 새로 불러올게요)` : okText);
      };
      if (act === "new") {
        if (await openCeremonyForm({ call, today: data.today })) { done = true; toast("등록식을 만들었어요 — 후보에서 담아 주세요"); }
      } else if (act === "edit" && c) {
        if (await openCeremonyForm({ call, ceremony: c, today: data.today })) { done = true; toast("고쳤어요"); }
      } else if (act === "del" && c) {
        if (await dialog({ title: "이 등록식을 지울까요?", text: "담아 둔 분은 다시 후보로 돌아가요.", ok: "지우기", danger: true })) {
          const r = await call("nfCeremonySave", { id: c.id, delete: true });
          done = true;
          toast(r.ok ? "지웠어요" : failText(r));
        }
      } else if (act === "add" && c) {
        const got = await pickMany({ anchor: b, title: "이번 등록식에 서실 분", options: candOptions(data.candidates), values: [] });
        if (got && got.length) await people({ add: got }, `${got.length}분을 담았어요`);
      } else if (act === "out" && c) {
        await people({ remove: [pid] }, "뺐어요 — 다시 후보로 돌아갔어요");
      } else if (act === "att" && c) {
        const p = c.people.find((x) => x.id === pid);
        if (p) await people({ attend: [{ id: pid, on: !p.attended }] }, "");
      } else if (act === "confirm" && c) {
        const going = c.people.filter((p) => p.attended), away = c.people.length - going.length;
        if (await dialog({ title: "확정하고 수료번호를 매길까요?", html: confirmText({ count: going.length, away, nextNo: c.nextNo }).map((t) => `<p>${esc(t)}</p>`).join(""),
          ok: `${going.length}분 확정`, danger: true })) {
          const r = await call("nfCeremonyConfirm", { ceremony_id: c.id, expect: going.length });
          done = true;
          if (r.ok) await dialog({ title: "확정했어요", text: `${r.count}분께 수료번호를 매겼어요 — ${r.first}${r.last !== r.first ? ` ~ ${r.last}` : ""}`, cancel: null });
          else toast(failText(r));
        }
      } else if (act === "xlsx" && c) {
        const r = await call("nfExport", { ceremony_id: c.id });
        if (!r.ok) { toast(failText(r)); return; }
        try {
          const XLSX = await loadXlsx();
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(r.table), "등록식 명단");
          XLSX.writeFile(wb, exportName(r.heldOn));
        } catch { toast("엑셀 파일을 만들지 못했어요 — 인터넷 연결을 확인해 주세요"); }
      } else if (act === "wait") {
        const p = data.candidates.find((x) => x.id === pid);
        if (!p) return;
        const got = await openForm({ title: `${p.name} 님 — 미루는 사정`, okLabel: "저장",
          html: `<label class="field"><span>사정 <small>(운영팀·목사님만 봐요 · 비우면 지워요)</small></span><input data-f="w" maxlength="120" value="${esc(p.waitNote)}" autocomplete="off"></label>`,
          onSubmit: async (root) => {
            const x = await call("nfPersonSet", { person_id: p.id, base: p.updatedAt, wait_note: root.querySelector('[data-f="w"]').value.trim() });
            return x.ok || x.error === "changed" ? { ok: true, value: x.ok ? true : "stale" } : { ok: false, message: failText(x) };
          } });
        if (got) { done = true; toast(got === "stale" ? nfWord("changed") : "적어 두었어요"); }
      }
    } finally {
      lock = false;
      if (done) await busy(el, reload);
    }
  });
}
