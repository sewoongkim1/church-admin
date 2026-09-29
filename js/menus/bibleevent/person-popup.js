// 이름을 누르면 교적 창 — 📋 회차·명단 · 👤 사람별 이력·통계의 이름 단추가 부른다(2026-09-30 · 친구 결정 · 계획 Task 16).
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
//    ② 메뉴 옮기기(hashchange — 주소창·메뉴 누르기): 떠 있는 우리 창을 닫고, 아직 묻는 중이면 답이 와도 창을 띄우지 않는다.
//       쌓은 칸은 거두지 않는다(이미 새 메뉴다 — modal.js closeAllForms 와 같은 까닭).
//    ③ 늦게 뜬 창: 「자세히」 창은 openPerson 이 peoplePerson 답을 받은 **뒤에** 붙는다 — ①·② 뒤에 붙으면 곧바로 닫는다(MutationObserver).
//    ④ 가족: 「자세히」 창의 가족 이름은 여기서 먼저 받아 그 창을 닫고 **같은 칸에서** 그분 창을 연다(openPerson 이 스스로 넘기면
//       첫 창이 닫히는 순간 묶음이 끝난 줄 알게 된다) · 「👪 가족 모두 목록으로」는 알림 한 줄(이 메뉴에는 가족 목록이 없다 — 창은 그대로).
//    교인 찾기(🔎)의 「자세히」 창은 묶음 밖이라 건드리지 않는다.
// ⚠️ 이 파일은 Node 시험(tests/be-person-logic.test.mjs)이 불러 본다 — 맨 위에서 document·window·history 를 만지지 않는다(bind 는 처음 누를 때).
import { toast, dialog, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import { openPerson } from "../people/search.js";
import { NOT_FOUND, NO_DIRECTORY, FAMILY_NOTE, personDecision, candOptions, chooseTitle, basicHtml } from "./person-logic.js";

// 우리 창 — 작은 창(be-pp-dlg) · 「자세히」 창(pd — 교인명부 openPerson 이 dialog 에 주는 cls). 고르개(.pk-dim)는 한 번에 하나뿐이다.
const OUR_DLG = ".dlg-dim > .dlg.be-pp-dlg, .dlg-dim > .dlg.pd";

let session = null;     // 지금 묶음 { pushed, popped, cancelled, next } — 묻는 중이거나 창이 떠 있는 동안(두 번 눌러도 창·기록은 하나)
let backWaiter = null;  // 우리가 부른 history.back() 이 돌아오면 부를 것
let bound = false;
let watcher = null;

// 떠 있는 우리 창을 닫는다 — 고르개는 Esc 로(picker.js 는 keydown 을 잡는 단계에서 받는다 · 뜬 뒤 300ms 누름 막기에 안 걸린다),
// 작은 창·「자세히」 창은 「닫기」 단추로(modal.js 가 고르개를 닫는 방법과 같다)
function closeOurs() {
  if (document.querySelector(".pk-dim")) document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  for (const d of document.querySelectorAll(OUR_DLG)) d.querySelector('[data-v="1"]')?.click();
}

function bind() {
  if (bound) return;
  bound = true;
  window.addEventListener("popstate", () => {
    if (backWaiter) { const w = backWaiter; backWaiter = null; w(); return; }   // 우리가 거둔 칸 — 닫기 요청이 아니다
    const s = session;
    if (!s || !s.pushed || s.popped) return;
    s.popped = true;              // ① 뒤로 가기 — 우리 칸이 빠졌다(주소·메뉴·명단은 그대로)
    closeOurs();
  });
  window.addEventListener("hashchange", () => {
    const s = session;
    if (!s) return;
    s.cancelled = true;           // ② 메뉴를 옮겼다 — 떠 있는 창을 닫고, 묻는 중이면 답이 와도 띄우지 않는다
    closeOurs();
  });
  // ④ 「자세히」 창의 가족 단추(person-detail.js 의 data-fam · data-fam-all) — 잡는 단계(capture)에서 먼저 받는다
  //    (openPerson 은 창의 click 거품에서 받는다 · 여기서 멈추면 그쪽 가족 처리는 돌지 않는다)
  document.addEventListener("click", (e) => {
    const s = session;
    const t = s && e.target instanceof Element ? e.target : null;
    const fam = t?.closest(".dlg.pd [data-fam]"), all = t?.closest(".dlg.pd [data-fam-all]");
    if (!fam && !all) return;
    e.stopPropagation();
    if (all) { toast(FAMILY_NOTE); return; }          // 이 메뉴에는 가족 목록이 없다 — 창은 그대로
    s.next = fam.dataset.fam;                         // 이 창을 닫고 같은 칸에서 그분 창을 연다(openChurchPerson 의 되풀이)
    fam.closest(".dlg-dim")?.querySelector('[data-v="1"]')?.click();
  }, true);
}

// ③ 묶음 동안 몸(body)에 창이 붙으면 — 이미 뒤로 갔거나 메뉴를 옮겼으면 곧바로 닫는다
function watch(on) {
  if (!on) { watcher?.disconnect(); return; }
  watcher = watcher || new MutationObserver(() => {
    const s = session;
    if (s && (s.cancelled || s.popped)) closeOurs();
  });
  watcher.observe(document.body, { childList: true });
}

function push(s) {
  history.pushState({ bePerson: 1 }, "");
  s.pushed = true;
}

// 쌓은 칸을 거두고, 거둔 뒤에 끝낸다. popstate 가 안 오는 드문 경우에도 1초 뒤엔 끝낸다(modal.js backThen 과 같다).
function back() {
  return new Promise((resolve) => {
    let t = 0;
    const done = () => { clearTimeout(t); if (backWaiter === done) backWaiter = null; resolve(); };
    t = setTimeout(done, 1000);
    backWaiter = done;
    history.back();
  });
}

// name·who_type·group·sub = 명단 줄 그대로(person-logic.js personPayload) · anchor = 누른 단추(창이 닫히면 초점을 돌려준다)
export async function openChurchPerson({ call, name = "", who_type = "", group = "", sub = "", anchor = null } = {}) {
  if (session) return;                                  // 묻는 중이거나 창이 떠 있다 — 두 번 눌러도 하나만
  bind();
  const s = session = { pushed: false, popped: false, cancelled: false, next: null };
  // 그사이 뒤로 갔거나(①) 메뉴를 옮겼거나(②) 명단을 다시 그려 누른 단추가 없어졌다 — 창을 띄우지 않는다
  const gone = () => s.cancelled || s.popped || (anchor != null && !anchor.isConnected);
  watch(true);
  try {
    const r = await call("evPerson", { name, who_type, group, sub });
    if (gone()) return;
    const d = personDecision(r);
    if (d.kind === "error") { toast(errorText(r)); return; }
    if (d.kind === "none") { toast(NO_DIRECTORY); return; }
    if (d.kind === "empty") { toast(NOT_FOUND); return; }
    push(s);                                            // 창 한 칸 — 뒤로 가기는 이 칸을 빼며 창만 닫는다
    if (d.kind === "basic") {
      const closed = dialog({ title: `🪪 ${name}님 교적`, html: basicHtml(r), ok: "닫기", cancel: null, cls: "be-pp-dlg" });
      // dialog 는 창을 곧바로(동기로) 붙인다 — 초점을 「닫기」로(단추에 남으면 Enter 한 번에 같은 창이 또 뜬다 · search.js 와 같다)
      [...document.querySelectorAll(".dlg-dim")].pop()?.querySelector('[data-v="1"]')?.focus();
      await closed;
      if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
      return;
    }
    // full — 고른 분이 있으면 곧바로, 없으면 고르개(닫으면 null — 아무것도 열지 않는다 · 초점은 고르개가 단추로 돌려준다)
    let id = d.kind === "open" ? d.id : await pickOne({ anchor, title: chooseTitle(name, r), options: candOptions(r.candidates) });
    // 「자세히」 창 — 사진·연락처·주소·가족은 peoplePerson 이 교인명부 역할을 다시 확인하고 준다(people.view 기록 · 초점은 그쪽이 돌려준다).
    // 가족 이름을 누르면(④) 그 창이 닫히고 s.next 에 그분 교인ID 가 남는다 — 같은 칸에서 이어 연다.
    while (id != null && !gone()) {
      s.next = null;
      await openPerson(call, id, () => toast(FAMILY_NOTE), anchor);
      id = s.next;
    }
  } finally {
    watch(false);
    // 「닫기」·Esc 로 끝났으면 쌓은 칸을 거둔다(거둔 뒤에 끝낸다). 뒤로 가기(①)·메뉴 옮기기(②)로 끝났으면 거두지 않는다.
    if (s.pushed && !s.popped && !s.cancelled) await back();
    session = null;
  }
}
