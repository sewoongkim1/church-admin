// 📮 정정 신청 — 성경암송 앱 「🗂️ 사역 이력 확인」에서 온 정정 신청 보기·처리(2026-10-01).
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md
//   실제 기록 고침은 「📜 사역 이력」의 줄 창에서 한다([그 줄 열기]). 여기는 상태·답만 —
//   빠진 사역만 「반영」할 때 「사역 이력에 넣을 내용」(연도·부서·팀·직책)을 고쳐 그대로 넣는다(2026-10-02 친구 요청).
//   「삭제」는 신청을 완전히 지운다(확인 창 · 2026-10-02 친구 요청).
//   막는 것은 서버다(역할 ministry · 반영 안 함 답 · 내 것이 아니에요 본인 확인 · 충돌 · 줄 칸 검사).
import { esc, toast, busy, errorText, dialog } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne } from "../../core/picker.js";
import { FILTERS, countsText, rowHtml, formHtml, formCheck, msgOf, resendSame, historyNote } from "./requests-logic.js";
import { lineRead, lineCheck, lineDirty, deleteConfirmText, deleteNote } from "./requests-logic.js";
import { lineBody } from "./requests-logic.js";

const TITLE = `<h2 class="page-title">📮 정정 신청</h2>`;

// 이 메뉴의 오류 글이 있으면 그 글로, 없으면 ui.js MESSAGES(openForm 이 errorText 로)
const badOf = (code) => (msgOf({ error: code }) ? { ok: false, message: msgOf({ error: code }) } : { ok: false, error: code });

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
    let deleting = false;   // 「삭제」를 눌렀다 — onSubmit 이 확인 창부터(openForm 의 보내는 중 잠금·빨간 줄을 그대로 쓴다)
    // 빠진 사역의 「사역 이력에 넣을 내용」은 「반영」이 눌려 있을 때만 보인다 — 숨은 칸은 보내지도, 바뀜으로 세지도 않는다
    const lineShown = () => q.kind === "missing" && picked === "반영";
    const res = await openForm({
      title: "정정 신청 처리", html: formHtml(q), okLabel: "저장",
      onOpen: (box) => {
        box.querySelector(".hr-sts").addEventListener("click", (e) => {
          const s = e.target.closest("[data-st]");
          if (!s) return;
          picked = s.dataset.st;
          box.querySelectorAll("[data-st]").forEach((x) => x.setAttribute("aria-pressed", String(x === s)));
          const lb = box.querySelector(".hr-line-box");
          if (lb) lb.hidden = !lineShown();
        });
        // submit 은 그 자리에서(동기로) onSubmit 을 부른다 — 받아들였으면 onSubmit 이 이미 깃발을 내렸다.
        //   보내는 중·「닫을까요?」를 묻는 중이라 openForm 이 받지 않았으면 여기서 내린다(다음 「저장」이 삭제로 읽히지 않게).
        //   ⚠️ 던져도 깃발은 내린다(finally) · requestSubmit 은 사파리 16 부터라 없으면 submit 을 직접 보낸다 — openForm 의 submit 듣기는
        //      isTrusted 를 보지 않는다(2026-10-02 최종 검토 #5 · iOS 15 에 묶인 아이폰에서 「삭제」가 안 되고 다음 「저장」이 삭제 확인이 됐다).
        box.querySelector(".hr-del").addEventListener("click", () => {
          deleting = true;
          try {
            box.requestSubmit ? box.requestSubmit() : box.dispatchEvent(new Event("submit", { cancelable: true }));
          } finally { deleting = false; }
        });
      },
      isDirty: (box) => picked !== start || box.querySelector("#hr-ans").value !== q.answer || !!box.querySelector("#hr-ver")?.checked ||
        (lineShown() && lineDirty(q, lineRead(box))),
      onSubmit: async (box) => {
        if (deleting) {
          deleting = false;
          const yes = await dialog({ title: "신청 삭제", text: deleteConfirmText(q), ok: "삭제", cancel: "두기", danger: true });
          // 확인 창이 떠 있는 사이 창이 닫혔다(메뉴 옮김·다시 부팅) — 「삭제」를 눌렀어도 지우지 않는다(결과를 보일 곳이 없다 · FE-4 · 2026-10-02 최종 검토 #8)
          if (!box.isConnected) return { ok: false };
          if (!yes) return { ok: false };   // 두기 — 창은 그대로(줄 없이)
          const r = await call("historyRequestDelete", { id: q.id, expect: q.updated_at });
          if (r.ok) return { ok: true, value: { kind: "deleted", note: deleteNote(r) } };
          // 창을 닫고 새로 불러온다 — 이미 지워진 신청의 남은 줄을 서버가 뺐으면 그것도 알린다(deleteNote · 검증 2차 #3)
          if (r.error === "conflict" || r.error === "not-found") return { ok: true, value: { kind: r.error, note: deleteNote(r) } };
          return msgOf(r) ? { ok: false, message: msgOf(r) } : r;
        }
        const f = { status: picked, answer: box.querySelector("#hr-ans").value, verified: !!box.querySelector("#hr-ver")?.checked };
        const line = lineShown() ? lineRead(box) : null;
        const bad = formCheck(q, f) || (line ? lineCheck(line) : null);
        if (bad) return badOf(bad);
        // 바뀐 것이 없으면 보내지도 않는다 — 빠진 사역만 예외(반영이면 사역 이력 줄을 채우거나 고치고 · 아니면 남은 줄을 다시 뺀다 · resendSame)
        if (!resendSame(q, f) && f.status === q.status && f.answer.trim() === q.answer) return { ok: true, value: "same" };
        // 「사역 이력에 넣을 내용」은 고쳤을 때만 싣는다(lineBody — 검사 lineCheck 는 보이면 늘) · 실었는지를 안내에 넘긴다(검증 2차 #4)
        const lb = lineBody(q, line);
        const r = await call("historyRequestSet", { id: q.id, ...f, expect: q.updated_at, ...lb });
        if (r.ok) return { ok: true, value: { kind: r.same ? "same" : "saved", note: historyNote(r, q, f, !!lb.line) } };
        // 창을 닫고 새로 불러온다 — 「한 번 더」 사이에 신청이 지워졌거나 상태가 바뀌었는데 줄을 맞추지 못했으면 창으로(historyNote)
        if (r.error === "conflict" || r.error === "not-found") return { ok: true, value: { kind: r.error, note: historyNote(r, q, f, !!lb.line) } };
        return msgOf(r) ? { ok: false, message: msgOf(r) } : r;
      },
    });
    if (res == null) return;
    const v = typeof res === "string" ? { kind: res, note: null } : res;
    // 빠진 사역의 사역 이력 줄 · 신청 삭제 — 더했어요·고쳤어요·뺐어요·지웠어요는 toast, 못 했으면 놓치지 않게 창(상태는 이미 바뀌었다)
    if (v.note?.dialog) await dialog({ title: "사역 이력", text: v.note.dialog, cancel: null });
    else toast(v.note?.toast || (v.kind === "saved" ? "저장했어요" : v.kind === "same" ? "바뀐 것이 없어요" : msgOf({ error: v.kind })));
    await load();
  }

  await load();
}
