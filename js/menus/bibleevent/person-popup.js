// 이름을 누르면 교적 창 — 📋 회차·명단 · 👤 사람별 이력·통계의 이름 단추가 부른다(2026-09-30 · 친구 결정 · 계획 Task 16).
// 사역신청(📋 신청 현황 · 🎉 임명현황 · 📋 종이 명단 올리기 결과)·🔑 담당자·역할 화면도 같은 창을 action:"ministryPerson" 으로 부른다
// (2026-09-30 친구 요청 · 이름 단추·보낼 것은 js/menus/ministry/person-link.js). 서버 답의 모양이 evPerson 과 같아 아래 동작은 그대로다.
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §0 「이름을 누르면 교적 창」·§2 evPerson·§3.
// ⚠️ 무엇을 보여 줄지는 **서버**(evPerson)가 부른 분의 역할로 정한다 — 화면은 받은 모양(mode)대로 그리기만 한다.
//    full(교인명부 역할·총괄) → 교인명부 「자세히」 창(people/search.js openPerson — 그쪽이 peoplePerson 을 불러 people.view 가 남는다).
//      고른 분이 없으면(동명이인) 먼저 고르개(pickOne)로 고른다.
//    basic(성경필사 역할만) → 작은 창(ui.js dialog)에 이름·소속·직분·교적 표시 + 「연락처·사진은 교인명부 담당자만 볼 수 있어요」.
//    none(교인명부가 아직 없음) · 찾은 분 없음 → 알림 한 줄(toast).
// ⚠️ 브라우저·시스템 창을 띄우지 않는다 — dialog·pickOne·toast 만. 읽기만 하는 창이라 입력 창(openForm)을 쓰지 않는다
//    (설계 §3 「확인·알림은 ui.js dialog/toast · 입력이 있는 창은 전용 창」).
// ⚠️ 이름 한 번 누름 = 한 묶음(session): 작은 창 하나, 또는 [고르개 →] 「자세히」 창(가족 이름으로 넘어간 창까지). 묶음 동안만 —
//    ① 뒤로 가기(설계 §3 「팝업」): 창을 열 때 history.pushState({bePerson:1}) 로 한 칸을 쌓고 popstate 를 「창 닫기」로 받는다
//       → 창만 닫히고 명단(회차·거르기·스크롤)은 그대로. 「닫기」·Esc 로 닫으면 history.back() 으로 그 칸을 거두고 **거둔 뒤에**
//       끝낸다(js/core/modal.js 와 같은 차례 — 안 거두면 다음 뒤로 가기 한 번이 헛 누름이 된다).
//       맨 위 칸이 우리 칸(bePerson)이 아니면 거두지 않는다 — 남의 칸(입력 창 beModal)을 빼면 그 창이 닫힌다.
//    ② 메뉴 옮기기(hashchange — 주소창·메뉴 누르기): 떠 있는 우리 창을 닫고, 아직 묻는 중이면 답이 와도 창을 띄우지 않는다.
//       쌓은 칸은 거두지 않는다(이미 새 메뉴다 — modal.js closeAllForms 와 같은 까닭).
//    ③ 늦게 뜬 창: 「자세히」 창은 openPerson 이 peoplePerson 답을 받은 **뒤에** 붙는다 — ①·② 뒤에 붙으면 곧바로 닫는다(MutationObserver).
//    ④ 가족: 「자세히」 창의 가족 이름은 여기서 먼저 받아 그 창을 닫고 **같은 칸에서** 그분 창을 연다(openPerson 이 스스로 넘기면
//       첫 창이 닫히는 순간 묶음이 끝난 줄 알게 된다) · 「👪 가족 모두 목록으로」는 알림 한 줄(이 메뉴에는 가족 목록이 없다 — 창은 그대로).
//    ⑤ 기다리는 동안(evPerson · 고른 뒤 peoplePerson) 누른 메뉴 화면(#view > section)을 inert 로 잠근다 — 그사이 ＋ 더하기·⋯ 고치기
//       (입력 창)를 열면 늦게 뜬 「자세히」 창이 그 위에 앉고, 닫을 때 거두는 칸이 엇갈린다. 머리줄·메뉴는 잠그지 않는다(메뉴는 옮길 수 있게).
//       창·고르개가 뜨거나, 뒤로 가기·메뉴 옮기기가 오거나, 묶음이 끝나면 푼다.
// ⚠️ **이 묶음이 연 것만** 닫는다(최종 검토 FE-1) — 작은 창과 「자세히」 창은 붙는 순간 s.dlg 로 잡아 두고 그것만 「닫기」,
//    고르개는 우리 pickOne 을 기다리는 동안(s.picking)에만 뒤로 가기에 Esc 한 번(메뉴 옮기기는 picker.js 가 hashchange 로 스스로 닫는다).
//    감시자(MutationObserver)는 「자세히」 창을 기다리는 동안(s.detail)만 켜고, 붙은 것 가운데 .dlg.pd 를 품은 .dlg-dim 만 본다
//    (그동안 교인명부 openPerson 은 search.js 의 opening 으로 하나뿐이다). 감시자는 Esc 를 보내지 않는다.
//    뒤로 가기·메뉴 옮기기가 「자세히」를 기다리는 중이 아닐 때 오면 묶음을 곧바로 놓는다 — 다음 이름 누름이 버려지지 않게.
//    교인 찾기(🔎)의 「자세히」 창 · 새 메뉴의 고르개·확인 창은 묶음 밖이라 건드리지 않는다.
// ⚠️ 이 파일은 Node 시험(tests/be-person-logic.test.mjs)이 불러 본다 — 맨 위에서 document·window·history 를 만지지 않는다(bind 는 처음 누를 때).
import { toast, dialog, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import { openPerson, detailTab } from "../people/search.js";
import { NOT_FOUND, NO_DIRECTORY, FAMILY_NOTE, personDecision, candOptions, chooseTitle, basicHtml } from "./person-logic.js";

// 「자세히」 창 — 교인명부 openPerson 이 ui.js dialog 에 주는 cls(pd). .dlg-dim 바로 아래.
const DETAIL_DLG = ":scope > .dlg.pd";
// 앞 묶음이 「자세히」 창의 답을 기다리며 끝나는 중(뒤로 가기·메뉴 옮기기 뒤)에 이름을 또 누르면 — 말없이 버리지 않는다
const WAIT_NOTE = "앞 창을 닫는 중이에요 — 잠시 뒤 다시 눌러 주세요";
// ⑤ 교적을 기다린 지 700ms 가 넘으면 알림 한 줄 — 흐림(css/admin.css #view > section[aria-busy])만으로는 느린 통신에서 「눌렸나?」 하신다(FE1-M1)
const WAIT_LOAD = "교적을 불러오는 중이에요…";

// 지금 묶음 { pushed, popped, cancelled, next, picking, detail, dlg, host, anchor, waitT, prevFocus, late } — 묻는 중이거나 창이 떠 있는 동안
// (두 번 눌러도 창·기록은 하나)
let session = null;
let backWaiter = null;  // 우리가 부른 history.back() 이 돌아오면 부를 것
let bound = false;
let watcher = null;
let unFocusIn = null;   // 늦게 뜬 「자세히」 창이 가져간 초점 잡기(watch) 떼기

// ⑤ 기다리는 동안 누른 메뉴 화면을 잠근다/푼다. 잠그면 누른 단추의 초점이 빠지므로, 풀 때 초점이 갈 곳이 없으면 그 단추로 돌려준다
// (창·고르개가 곧바로 제 단추로 초점을 옮기므로 그쪽을 막지 않는다).
// 기다린다는 표시(FE1-M1): aria-busy 에 css 가 늦춘 흐림·progress 커서를 걸고, 700ms 가 넘으면 알림 한 줄(WAIT_LOAD).
// 풀 때는 그 알림도 거둔다 — 창이 뜬 뒤까지 「불러오는 중」이 남지 않게.
function setWait(s, on) {
  const h = s.host;
  if (!h) return;
  if (on) {
    h.inert = true;
    h.setAttribute("aria-busy", "true");
    clearTimeout(s.waitT);
    s.waitT = setTimeout(() => { if (h.inert && session === s) toast(WAIT_LOAD); }, 700);
    return;
  }
  clearTimeout(s.waitT);
  const t = document.querySelector(".adm-toast");
  if (t && !t.hidden && t.textContent === WAIT_LOAD) t.hidden = true;
  if (!h.inert) return;
  h.inert = false;
  h.removeAttribute("aria-busy");
  const a = document.activeElement;
  if (s.anchor && s.anchor.isConnected && (!a || a === document.body)) s.anchor.focus({ preventScroll: true });
}

// 이 묶음이 연 것만 닫는다 — 고르개는 우리 pickOne 을 기다리는 동안에만 Esc(picker.js 는 keydown 을 잡는 단계에서 받아 멈춘다 ·
// 뜬 뒤 300ms 누름 막기에 안 걸린다), 작은 창·「자세히」 창은 잡아 둔 그 창의 「닫기」 단추로(modal.js 가 고르개를 닫는 방법과 같다)
function closeOurs(s, escape) {
  if (escape && s.picking) document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  if (s.dlg && s.dlg.isConnected) s.dlg.querySelector('[data-v="1"]')?.click();
}

// ①·② 뒤 — 잠금을 풀고 우리 것을 닫고, 「자세히」를 기다리는 중이 아니면 묶음을 곧바로 놓는다(마무리는 openChurchPerson 의 finally).
// 「자세히」를 기다리는 중이면 답이 와서 붙은 창을 감시자가 닫고 openPerson 이 끝난 뒤에 놓는다.
function endEarly(s, escape) {
  setWait(s, false);
  closeOurs(s, escape);
  if (!s.detail && session === s) session = null;
}

function bind() {
  if (bound) return;
  bound = true;
  window.addEventListener("popstate", () => {
    if (backWaiter) { const w = backWaiter; backWaiter = null; w(); return; }   // 우리가 거둔 칸 — 닫기 요청이 아니다
    const s = session;
    if (!s || !s.pushed || s.popped) return;
    s.popped = true;              // ① 뒤로 가기 — 우리 칸이 빠졌다(주소·메뉴·명단은 그대로)
    endEarly(s, true);
  });
  window.addEventListener("hashchange", () => {
    const s = session;
    if (!s) return;
    s.cancelled = true;           // ② 메뉴를 옮겼다 — 떠 있는 창을 닫고, 묻는 중이면 답이 와도 띄우지 않는다
    endEarly(s, false);           //    고르개는 picker.js 가 hashchange 로 스스로 닫는다 — Esc 를 보내지 않는다
  });
  // ④ 「자세히」 창의 가족 단추(person-detail.js 의 data-fam · data-fam-all) — 잡는 단계(capture)에서 먼저 받는다
  //    (openPerson 은 창의 click 거품에서 받는다 · 여기서 멈추면 그쪽 가족 처리는 돌지 않는다). **이 묶음의 창**에서 누른 것만.
  document.addEventListener("click", (e) => {
    const s = session;
    const t = s && s.dlg && e.target instanceof Element ? e.target : null;
    const fam = t?.closest(".dlg.pd [data-fam]"), all = t?.closest(".dlg.pd [data-fam-all]");
    if ((!fam && !all) || (fam || all).closest(".dlg-dim") !== s.dlg) return;
    e.stopPropagation();
    if (all) { toast(FAMILY_NOTE); return; }          // 이 메뉴에는 가족 목록이 없다 — 창은 그대로
    s.next = fam.dataset.fam;                         // 이 창을 닫고 같은 칸에서 그분 창을 연다(openChurchPerson 의 되풀이)
    s.dlg.querySelector('[data-v="1"]')?.click();
  }, true);
}

// ③ 「자세히」 창을 기다리는 동안만 — 몸(body)에 붙은 것 가운데 .dlg.pd 를 품은 .dlg-dim 이 이 묶음의 창이다.
//    잡아 두고(뒤로 가기·메뉴 옮기기가 나중에 오면 이것만 닫는다), 잠금을 풀고, 이미 뒤로 갔거나 메뉴를 옮겼으면 곧바로 닫는다.
//    그렇게 닫는 늦은 창은 붙자마자 제 「닫기」로 초점을 가져간 뒤다(search.js openPerson · 감시자보다 먼저 돈다) — 그 직전 초점
//    (그사이 연 고르개 등)을 focusin 의 relatedTarget 으로 잡아 두었다가 돌려준다(FE1-M2 · 안 그러면 초점이 body 로 빠진다).
function watch(s, on) {
  watcher?.disconnect();
  watcher = null;
  unFocusIn?.();
  unFocusIn = null;
  if (!on) return;
  const onIn = (e) => {
    if (!(s.cancelled || s.popped) || !(e.target instanceof Element)) return;
    if (e.target.closest(".dlg-dim")?.querySelector(DETAIL_DLG)) s.prevFocus = e.relatedTarget;
  };
  document.addEventListener("focusin", onIn, true);
  unFocusIn = () => document.removeEventListener("focusin", onIn, true);
  watcher = new MutationObserver((recs) => {
    for (const rec of recs) {
      for (const n of rec.addedNodes) {
        if (!(n instanceof Element) || !n.classList.contains("dlg-dim") || !n.querySelector(DETAIL_DLG)) continue;
        s.dlg = n;
        setWait(s, false);
        if (!(s.cancelled || s.popped)) continue;
        s.late = true;                                  // 끝나는 중에 늦게 뜬 창 — openPerson 이 이름 단추로 초점을 돌리지 않게(back 대리)
        n.querySelector('[data-v="1"]')?.click();
        const p = s.prevFocus;
        s.prevFocus = null;
        if (p instanceof HTMLElement && p.isConnected && (!document.activeElement || document.activeElement === document.body)) p.focus({ preventScroll: true });
      }
    }
  });
  watcher.observe(document.body, { childList: true });
}

function push(s) {
  history.pushState({ bePerson: 1 }, "");
  s.pushed = true;
}

// 쌓은 칸을 거두고, 거둔 뒤에 끝낸다. popstate 가 안 오는 드문 경우에도 1초 뒤엔 끝낸다(modal.js backThen 과 같다).
// 맨 위 칸이 우리 칸이 아니면(그 위에 입력 창이 칸을 쌓았다) 거두지 않는다 — history.back() 이 그 창을 닫아 버린다.
function back() {
  if (history.state?.bePerson !== 1) return Promise.resolve();
  return new Promise((resolve) => {
    let t = 0;
    const done = () => { clearTimeout(t); if (backWaiter === done) backWaiter = null; resolve(); };
    t = setTimeout(done, 1000);
    backWaiter = done;
    history.back();
  });
}

// name·who_type·group·sub = 명단 줄 그대로(person-logic.js personPayload) · anchor = 누른 단추(창이 닫히면 초점을 돌려준다)
// action — 성경필사는 evPerson(기본), 사역신청·담당자는 ministryPerson. who·phone 은 ministryPerson 만 받는다(신청 줄의 소속 한 줄 ·
// 성도님이 적은 번호 — 서버가 교적 표시와, 교인명부 담당자·총괄일 때만 동명이인 가리기에 쓰고 응답·기록에 싣지 않는다).
export async function openChurchPerson({ call, action = "evPerson", name = "", who_type = "", group = "", sub = "", who = "", phone = "",
  anchor = null } = {}) {
  if (session) {                                        // 묻는 중이거나 창이 떠 있다 — 두 번 눌러도 하나만
    if (session.popped || session.cancelled) toast(WAIT_NOTE);
    return;
  }
  bind();
  const host = anchor instanceof Element ? anchor.closest("#view > section") : null;   // ⑤ 잠글 메뉴 화면
  const s = session = { pushed: false, popped: false, cancelled: false, next: null,
    picking: false, detail: false, dlg: null, host, anchor, waitT: 0, prevFocus: null, late: false };
  // 그사이 뒤로 갔거나(①) 메뉴를 옮겼거나(②) 명단을 다시 그려 누른 단추가 없어졌다 — 창을 띄우지 않는다
  const gone = () => s.cancelled || s.popped || (anchor != null && !anchor.isConnected);
  setWait(s, true);
  try {
    // ⚠️ evPerson 에는 지금과 **똑같이** 넷만 보낸다(성경필사 서버가 받는 칸). 다른 액션은 넷에 who·phone 을 더한다(빈 값은 뺀다).
    const r = await call(action, action === "evPerson" ? { name, who_type, group, sub }
      : { name, who_type, group, sub, ...(who ? { who } : {}), ...(phone ? { phone } : {}) });
    if (gone()) return;
    const d = personDecision(r);
    if (d.kind === "error") { toast(errorText(r)); return; }
    if (d.kind === "none") { toast(NO_DIRECTORY); return; }
    if (d.kind === "empty") { toast(NOT_FOUND); return; }
    push(s);                                            // 창 한 칸 — 뒤로 가기는 이 칸을 빼며 창만 닫는다
    if (d.kind === "basic") {
      setWait(s, false);
      const closed = dialog({ title: `🪪 ${name}님 교적`, html: basicHtml(r), ok: "닫기", cancel: null, cls: "be-pp-dlg" });
      // dialog 는 창을 곧바로(동기로) 붙인다 — 이 묶음의 창으로 잡고, 초점을 「닫기」로
      // (단추에 남으면 Enter 한 번에 같은 창이 또 뜬다 · search.js 와 같다)
      s.dlg = [...document.querySelectorAll(".dlg-dim")].pop() ?? null;
      s.dlg?.querySelector('[data-v="1"]')?.focus();
      await closed;
      s.dlg = null;
      if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
      return;
    }
    // full — 고른 분이 있으면 곧바로, 없으면 고르개(닫으면 null — 아무것도 열지 않는다 · 초점은 고르개가 단추로 돌려준다)
    let id = null;
    if (d.kind === "open") id = d.id;
    else {
      setWait(s, false);
      s.picking = true;
      try { id = await pickOne({ anchor, title: chooseTitle(name, r), options: candOptions(r.candidates) }); }
      finally { s.picking = false; }
    }
    // 「자세히」 창 — 사진·연락처·주소·가족은 peoplePerson 이 교인명부 역할을 다시 확인하고 준다(people.view 기록 · 초점은 그쪽이 돌려준다).
    // 가족 이름을 누르면(④) 그 창이 닫히고 s.next 에 그분 교인ID 가 남는다 — 같은 칸에서 이어 연다.
    let tab;   // 가족으로 넘어가면 보던 탭 그대로(2026-10-01 · 처음은 교적)
    while (id != null && !gone()) {
      s.next = null;
      s.detail = true;
      setWait(s, true);                                 // 창이 붙으면 감시자가 푼다
      watch(s, true);
      // 끝나는 중인 묶음(뒤로 가기·메뉴 옮기기 뒤)에서는 초점을 가져가지 않는다 — 그사이 연 고르개의 초점을 뺏지 않게(FE1-M2).
      // openPerson 은 창이 닫히면 back.isConnected 일 때만 back.focus() 한다. 뒤로 가기는 「창을 기다리는 사이」(늦게 뜬 창 · s.late)만
      // 막는다 — 떠 있던 창을 뒤로 가기로 닫았을 때는 그사이 연 것이 없으니 전처럼 이름 단추로 돌려준다.
      const back = anchor ? { get isConnected() { return anchor.isConnected && !s.cancelled && !s.late; }, focus: (o) => anchor.focus(o) } : null;
      try { await openPerson(call, id, () => toast(FAMILY_NOTE), back, { tab }); }
      finally { watch(s, false); s.detail = false; s.dlg = null; setWait(s, false); }
      tab = detailTab();
      id = s.next;
    }
  } finally {
    setWait(s, false);
    // 「닫기」·Esc 로 끝났으면 쌓은 칸을 거둔다(거둔 뒤에 끝낸다). 뒤로 가기(①)·메뉴 옮기기(②)로 끝났으면 거두지 않는다.
    if (s.pushed && !s.popped && !s.cancelled) await back();
    if (session === s) session = null;                  // 그사이 새 묶음이 섰으면(①·② 뒤 곧바로 놓았다) 그것은 건드리지 않는다
  }
}
