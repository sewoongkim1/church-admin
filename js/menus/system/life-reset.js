// 🔑 확인 번호 풀기 — 성경암송 앱에서 「담당자에게 풀어 달라고」 온 요청.
//   풀면 그분의 확인 번호·확인한 기기를 지운다 → 다음에 교회 생활에 들어올 때 새로 정한다.
//   역할 super(총괄)만. 응답에 user_id·번호는 없다(이름·소속·요청 시각만).
import { esc, kstTime, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🔑 확인 번호 풀기</h2>`;

function card(r) {
  return `<div class="card" data-id="${r.id}">
    <div><b>${esc(r.name)}</b> <span class="muted">${esc(r.who)}</span></div>
    <div class="muted">요청 ${esc(kstTime(r.at))}</div>
    <div class="acts"><button type="button" class="btn primary" data-act="reset">풀어 주기</button></div>
  </div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("lifeResetList");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  let rows = r.rows || [];

  const draw = () => {
    el.innerHTML = TITLE
      + `<p class="muted">번호를 잊었거나, 남이 먼저 정해 못 들어오는 분이 보낸 요청이에요. 풀어 주면 그분이 다음에 새로 정해요.</p>`
      + (rows.length ? rows.map(card).join("") : `<p class="empty">기다리는 요청이 없어요.</p>`);
    el.querySelectorAll('[data-act="reset"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        const wrap = btn.closest(".card");
        const id = Number(wrap.dataset.id);
        const name = wrap.querySelector("b")?.textContent || "이분";
        const okGo = await dialog({
          title: "확인 번호를 풀까요?",
          text: `${name}의 확인 번호를 지워요. 그분이 다음에 교회 생활에 들어올 때 새로 정하게 돼요.`,
          ok: "풀어 주기", cancel: "그만두기",
        });
        if (!okGo) return;
        await busy(el, async () => {
          const d = await call("lifeResetDo", { request_id: id });
          if (d.ok) { toast("풀었어요."); rows = rows.filter((x) => x.id !== id); draw(); }
          else toast(errorText(d));
        });
      });
    });
  };
  draw();
}
