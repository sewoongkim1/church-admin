// 직접 만든 입력 창 — 브라우저·시스템 팝업(alert·confirm·prompt·beforeunload) 대신(2026-09-29 친구 결정).
//   폰(<1024px) = 화면 아래에서 올라오는 판 · PC = 가운데 창. 모양은 css/admin.css 의 「be- ① 입력 창」 블록.
//   openForm(...) → Promise: 저장하면 onSubmit 이 준 value(없으면 true) · 닫으면 null.
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §3 「팝업」.
//   ① 닫기 요청 = 「닫기」·Esc·바깥(누를 때와 뗄 때 **둘 다** 바깥)·뒤로 가기. 입력이 바뀌었으면(isDirty)
//      창을 닫지 않고 **창 안에** 「저장하지 않은 내용이 있어요 — 닫을까요?」 [계속 쓰기][닫기] 줄을 띄운다.
//   ② 저장 중에는 창의 단추를 스스로 잠근다 — ui.js busy() 는 document.body 에 붙은 이 창을 잠그지 않는다.
//   ③ onSubmit 이 {ok:false, error|message} 면 창 안 빨간 줄(.be-err) — 창은 그대로(친 글이 사라지지 않게).
//   ④ 열리면 첫 입력 칸에 초점, 닫히면 열 때 초점이 있던 곳(여는 단추)으로 돌려준다.
//   ⑤ 뒤로 가기: 열 때 history.pushState({beModal:1}) 로 한 칸 쌓고 popstate 를 「닫기 요청」으로 받는다. 우리가 닫을 때는
//      history.back() 으로 그 칸을 거두고, **거둔 뒤에** Promise 를 푼다 — 닫자마자 go() 로 주소를 바꾸면
//      늦게 도는 back 이 방금 바꾼 주소를 되돌려 버린다(새 회차를 만든 뒤 ?ev=새회차 로 가는 회차·명단이 그 자리다).
//   ⑥ 메뉴를 옮기면 main.js route() 가 closeAllForms() 로 모두 닫는다(주소는 건드리지 않는다 — 이미 바뀌었다).
// ⚠️ 고르개(picker.js)는 keydown 을 잡는 단계(capture)에서 받아 멈춘다. 이 창은 거품 단계에서 받으므로 창 안에서 연
//    고르개의 Esc 한 번에 두 창이 함께 닫히지 않는다. 고르개·확인 창(ui.js dialog)이 위에 떠 있으면 키와 뒤로 가기는 그쪽 몫이다.
// ⚠️ z-index 40 — 머리줄(30) 위, 확인 창(.dlg-dim 50)·고르개(.pk-dim 55) 아래. 창 안에서 연 고르개·확인 창이 위에 뜬다.
// ⚠️ 이 파일은 Node 시험(tests/modal.test.mjs)이 읽는다 — 맨 위에서 document·window·history 를 만지지 않는다.
import { errorText } from "./ui.js";

export const DIRTY_TEXT = "저장하지 않은 내용이 있어요 — 닫을까요?";

// onSubmit 의 답 → 창을 어떻게 할지(순수 · 시험).
//   {ok:true, value}        → 닫고 value 로(value 가 없으면 true — 「닫음(null)」과 가르려고)
//   {ok:false, message}     → 창을 두고 그 글을 빨간 줄로(부르는 쪽이 만든 한국말)
//   {ok:false, error, code} → 창을 두고 errorText(ui.js MESSAGES) 로
//   {ok:false} · 없음       → 창을 두고 줄 없이(두 단계 확인의 첫 단계 등)
export function submitOutcome(r) {
  if (r && r.ok) return { close: true, value: r.value === undefined ? true : r.value, message: "" };
  if (r && typeof r.message === "string" && r.message) return { close: false, value: null, message: r.message };
  if (r && r.error) return { close: false, value: null, message: errorText(r) };
  return { close: false, value: null, message: "" };
}

const stack = [];     // 열린 창 — 맨 뒤가 맨 위
const waiters = [];   // 우리가 부른 history.back() 이 끝나면 부를 것(차례대로)
let popBound = false;
let seq = 0;

const FOCUSABLE = 'button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const FIRST_FIELD = '.be-body input:not([type="hidden"]):not([disabled]):not([readonly]),.be-body textarea:not([disabled]),.be-body .pk-field:not([disabled])';
const visible = (x) => x.offsetParent !== null;

function bindPop() {
  if (popBound) return;
  popBound = true;
  window.addEventListener("popstate", () => {
    const w = waiters.shift();
    if (w) { clearTimeout(w.t); w.fn(); return; }        // 우리가 거둔 칸 — 닫기 요청이 아니다
    const top = stack[stack.length - 1];
    if (!top) return;
    if (document.querySelector(".pk-dim")) {             // 고르개가 떠 있으면 그것만 닫는다 — 창의 칸은 다시 쌓는다
      top.repush();
      // 고르개는 hashchange 로만 스스로 닫힌다(같은 주소 칸이라 hashchange 가 없다) — Esc 를 보내 닫는다.
      // 고르개는 document 의 capture 단계에서 받아 멈추므로 이 창(거품 단계)까지 오지 않는다
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return;
    }
    if (document.querySelector(".dlg-dim")) { top.repush(); return; }   // 확인 창은 답을 받아야 한다
    top.request(true);
  });
}

// history.back() 으로 쌓은 칸을 거두고, 거둔 뒤에 fn. popstate 가 안 오는 드문 경우에도 1초 뒤엔 부른다.
function backThen(fn) {
  const w = { fn, t: 0 };
  w.t = setTimeout(() => {
    const i = waiters.indexOf(w);
    if (i >= 0) { waiters.splice(i, 1); fn(); }
  }, 1000);
  waiters.push(w);
  history.back();
}

export function openForm({ title = "", html = "", okLabel = "저장", cancelLabel = "닫기", danger = false,
  onOpen = () => {}, isDirty = () => false, onSubmit = async () => ({ ok: true }) } = {}) {
  bindPop();
  return new Promise((resolve) => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    const id = "be-f" + ++seq;
    const dim = document.createElement("div");
    dim.className = "be-modal";
    dim.innerHTML = `<form class="be-box" role="dialog" aria-modal="true" aria-labelledby="${id}" novalidate autocomplete="off">
      <div class="be-grip" aria-hidden="true"></div>
      <h3 class="be-title" id="${id}"></h3>
      <div class="be-body"></div>
      <div class="be-bottom">
        <p class="be-err" role="alert" hidden></p>
        <div class="be-ask" hidden><p class="be-ask-t"></p>
          <div class="be-foot"><button type="button" class="btn" data-be="stay">계속 쓰기</button>
            <button type="button" class="btn danger" data-be="leave">닫기</button></div></div>
        <div class="be-foot be-main"><button type="button" class="btn be-cancel" data-be="cancel"></button>
          <button type="submit" class="btn ${danger ? "danger" : "primary"} be-ok"></button></div>
      </div></form>`;
    const box = dim.querySelector(".be-box");
    box.querySelector(".be-title").textContent = title;
    box.querySelector(".be-ask-t").textContent = DIRTY_TEXT;
    box.querySelector(".be-cancel").textContent = cancelLabel;
    box.querySelector(".be-ok").textContent = okLabel;
    box.querySelector(".be-body").innerHTML = html;   // 부르는 쪽이 사람·서버 글자를 esc 로 감싼 HTML
    const err = box.querySelector(".be-err"), ask = box.querySelector(".be-ask"), main = box.querySelector(".be-main");

    let done = false, sending = false, asking = false;
    const push = () => { history.pushState({ beModal: 1 }, ""); };
    const dirty = () => { try { return !!isDirty(box); } catch (x) { console.error(x); return false; } };
    const focusFirst = () => {
      const f = [...box.querySelectorAll(FIRST_FIELD)].find(visible);
      (f || box.querySelector(danger ? ".be-cancel" : ".be-ok")).focus({ preventScroll: true });
    };
    const showAsk = () => {
      asking = true; ask.hidden = false; main.hidden = true;
      ask.querySelector('[data-be="stay"]').focus({ preventScroll: true });
    };
    const hideAsk = () => { asking = false; ask.hidden = true; main.hidden = false; focusFirst(); };

    // keepHistory — 뒤로 가기로 우리 칸이 이미 빠졌거나(popstate) 메뉴를 옮겨 닫는다(closeAllForms)
    const close = (value, keepHistory) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey);
      dim.remove();
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) document.body.classList.remove("be-lock");
      const finish = () => {
        if (opener && opener.isConnected) opener.focus({ preventScroll: true });
        resolve(value);
      };
      if (keepHistory) finish(); else backThen(finish);
    };
    const request = (fromPop) => {
      if (done) return;
      if (sending || asking) { if (fromPop) push(); return; }
      if (!dirty()) return close(null, fromPop);
      if (fromPop) push();   // 묻는 동안 창과 칸을 맞춰 둔다 — 「닫기」를 고르면 그 칸을 다시 거둔다
      showAsk();
    };
    const entry = { request, repush: push, close };

    const onKey = (e) => {
      if (done || !e.isTrusted || stack[stack.length - 1] !== entry) return;
      if (document.querySelector(".pk-dim, .dlg-dim")) return;   // 위에 뜬 고르개·확인 창 몫
      if (e.key === "Escape") {
        if (e.isComposing) return;                               // 한글 조합 중 Esc 는 조합 취소
        e.preventDefault();
        if (asking) hideAsk(); else request(false);
        return;
      }
      if (e.key !== "Tab") return;
      // 초점이 창 밖(뒤 화면)으로 나가지 않게 — 끝에서 처음으로, 처음에서 끝으로
      const f = [...box.querySelectorAll(FOCUSABLE)].filter(visible);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      else if (i < 0) { e.preventDefault(); f[0].focus(); }
    };

    // 뜬 뒤 300ms 동안은 창 안 누름을 받지 않는다 — 여는 단추를 두 번 톡톡 누르면 둘째 탭이 창에 떨어진다
    // (ui.js dialog · picker.js 와 같은 값)
    const openedAt = Date.now();
    dim.addEventListener("click", (e) => {
      if (Date.now() - openedAt <= 300) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    // 바깥 — 누를 때와 뗄 때 **둘 다** 바깥이어야 닫기 요청(글을 끌어 고르다 밖에서 떼면 닫히던 사고 · 2026-09-17).
    // 뗀 자리는 elementFromPoint 로 본다 — 손가락(터치)은 누른 요소가 pointerup 을 받아(암묵 캡처) target 으로는 모른다.
    let downOut = false, upOut = false;
    dim.addEventListener("pointerdown", (e) => { downOut = e.target === dim; upOut = false; });
    dim.addEventListener("pointerup", (e) => { upOut = document.elementFromPoint(e.clientX, e.clientY) === dim; });
    dim.addEventListener("click", (e) => {
      const k = e.target instanceof Element ? e.target.closest("[data-be]")?.dataset.be : "";
      if (k === "cancel") return request(false);
      if (k === "stay") return hideAsk();
      if (k === "leave") return close(null, false);
      if (e.target === dim && downOut && upOut) request(false);
    });
    box.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (done || sending || asking) return;
      sending = true;
      err.hidden = true;
      box.setAttribute("aria-busy", "true");
      const locked = [...box.querySelectorAll("button:not([disabled])")];
      locked.forEach((b) => { b.disabled = true; });
      let r;
      try { r = await onSubmit(box); } catch (x) { console.error(x); r = { ok: false, error: "server" }; }
      sending = false;
      box.removeAttribute("aria-busy");
      if (done) return;   // 그사이 메뉴를 옮겨 닫혔다(closeAllForms)
      const o = submitOutcome(r);
      if (o.close) return close(o.value, false);
      locked.forEach((b) => { b.disabled = false; });
      err.textContent = o.message;
      err.hidden = !o.message;
    });

    stack.push(entry);
    document.body.appendChild(dim);
    document.body.classList.add("be-lock");
    document.addEventListener("keydown", onKey);
    push();
    try { onOpen(box); } catch (x) { console.error(x); }
    focusFirst();
  });
}

// 열린 창을 모두 닫는다(각 Promise 는 null) — main.js 가 메뉴를 옮길 때(route)·다시 부팅할 때(boot) 부른다.
// 주소(history)는 건드리지 않는다: 이미 새 메뉴로 바뀌었고, 여기서 back 을 부르면 방금 연 메뉴가 되돌아간다.
// 그래서 쌓아 둔 칸(창을 연 메뉴와 같은 주소)이 남는다 — 새 메뉴에서 뒤로 가기를 두 번 누르면 둘째 번은 같은 주소라
// 화면이 그대로다(헛 누름 한 번). 주소창을 직접 고칠 때만 생기는 일이라 둔다.
export function closeAllForms() {
  for (const e of [...stack].reverse()) e.close(null, true);
}
