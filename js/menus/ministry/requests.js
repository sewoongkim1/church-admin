// 📮 정정 신청 — 성경암송 앱 「🗂️ 사역 이력 확인」에서 온 정정 신청 보기·처리(2026-10-01).
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md
//   실제 기록 고침은 「📜 사역 이력」의 줄 창에서 한다([그 줄 열기]). 여기는 상태·답만.
//   막는 것은 서버다(역할 ministry · 반영 안 함 답 · 내 것이 아니에요 본인 확인 · 충돌).
import { esc, toast, busy, errorText, dialog } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne } from "../../core/picker.js";
import { FILTERS, countsText, rowHtml, formHtml, formCheck, msgOf, resendSame, historyNote } from "./requests-logic.js";

const TITLE = `<h2 class="page-title">📮 정정 신청</h2>`;

export async function render(el, { call }) {
  let filter = "open", list = [], counts = {};
  el.innerHTML = TITLE + `
    <p class="muted">성경암송 앱 「🗂️ 사역 이력 확인」에서 성도님이 낸 정정 신청이에요. 기록은 [그 줄 열기]로 「📜 사역 이력」에서 고치고, 여기서는 상태와 답을 정해요. 성도님은 앱을 다시 열면 현황을 봐요(알림은 가지 않아요).</p>
    <div class="hr-bar"><button type="button" class="btn hr-filter"></button><span class="muted hr-n"></span></div>
    <div class="hr-list"><p class="empty">불러오는 중…</p></div>`;
  const $ = (s) => el.querySelector(s);

  const drawFilter = () => { $(".hr-filter").textContent = FILTERS.find((x) => x.value === filter).label + " ▾"; };
  const draw = () => {
    drawFilter();
    $(".hr-n").textContent = countsText(counts);
    $(".hr-list").innerHTML = list.length ? list.map(rowHtml).join("")
      : `<p class="empty">${filter === "open" ? "처리할 신청이 없어요" : "신청이 없어요"}</p>`;
  };
  const load = async () => {
    drawFilter();
    const r = await busy(el, () => call("historyRequestList", { status: filter }));
    if (!r.ok) { $(".hr-list").innerHTML = `<p class="empty">${esc(errorText(r))}</p>`; return; }
    list = r.list || [];
    counts = r.counts || {};
    draw();
  };

  $(".hr-filter").addEventListener("click", async (e) => {
    const v = await pickOne({ anchor: e.currentTarget, title: "보기", options: FILTERS, value: filter });
    if (v == null || v === filter) return;
    filter = v;
    await load();
  });

  $(".hr-list").addEventListener("click", (e) => {
    const b = e.target.closest(".hr-row");
    if (!b) return;
    const q = list.find((x) => x.id === Number(b.dataset.id));
    if (q) openRequest(q);
  });

  async function openRequest(q) {
    const start = q.status === "신청" ? "" : q.status;   // 「신청」 상태에서는 아무것도 눌려 있지 않다 — 담당자가 고른다
    let picked = start;
    const res = await openForm({
      title: "정정 신청 처리", html: formHtml(q), okLabel: "저장",
      onOpen: (box) => {
        box.querySelector(".hr-sts").addEventListener("click", (e) => {
          const s = e.target.closest("[data-st]");
          if (!s) return;
          picked = s.dataset.st;
          box.querySelectorAll("[data-st]").forEach((x) => x.setAttribute("aria-pressed", String(x === s)));
        });
      },
      isDirty: (box) => picked !== start || box.querySelector("#hr-ans").value !== q.answer || !!box.querySelector("#hr-ver")?.checked,
      onSubmit: async (box) => {
        const f = { status: picked, answer: box.querySelector("#hr-ans").value, verified: !!box.querySelector("#hr-ver")?.checked };
        const bad = formCheck(q, f);
        if (bad) return { ok: false, message: msgOf({ error: bad }) };
        // 바뀐 것이 없으면 보내지도 않는다 — 빠진 사역의 「반영」만 예외(사역 이력에 줄이 없으면 서버가 채운다 · resendSame)
        if (!resendSame(q, f) && f.status === q.status && f.answer.trim() === q.answer) return { ok: true, value: "same" };
        const r = await call("historyRequestSet", { id: q.id, ...f, expect: q.updated_at });
        if (r.ok) return { ok: true, value: { kind: r.same ? "same" : "saved", note: historyNote(r, q, f) } };
        if (r.error === "conflict" || r.error === "not-found") return { ok: true, value: r.error };   // 창을 닫고 새로 불러온다
        return msgOf(r) ? { ok: false, message: msgOf(r) } : r;
      },
    });
    if (res == null) return;
    const v = typeof res === "string" ? { kind: res, note: null } : res;
    // 빠진 사역의 사역 이력 줄 — 더했어요·뺐어요는 toast, 못 했으면 놓치지 않게 창(상태는 이미 바뀌었다)
    if (v.note?.dialog) await dialog({ title: "사역 이력", text: v.note.dialog, cancel: null });
    else toast(v.note?.toast || (v.kind === "saved" ? "저장했어요" : v.kind === "same" ? "바뀐 것이 없어요" : msgOf({ error: v.kind })));
    await load();
  }

  await load();
}
