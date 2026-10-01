// 공용 화면 부품 — 관리 화면 표준 v1. 확인·알림은 브라우저 confirm/alert 대신 이것만 쓴다.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 「화평 20목장」·「중등부 3학년」
export function affiliation(m) {
  if (!m) return "";
  if (m.type === "교회학교") return [m.bu, m.grade].filter(Boolean).join(" ");
  const mok = String(m.mok || "").replace(/목장$/, "");
  return [m.gu, mok ? mok + "목장" : ""].filter(Boolean).join(" ");
}

// 한국 시각 「2026.09.28 14:05」
export function kstTime(iso) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

let toastTimer = 0;
// 결과 안내는 한 자리·한 꼴(화면 아래, 4초). 놓치면 안 되는 것은 toast 가 아니라 dialog.
export function toast(msg) {
  let el = document.querySelector(".adm-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "adm-toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

// 확인 창 → Promise<boolean>. cancel:null 이면 알림 창(단추 하나).
// text 는 글자로 들어간다. html 을 쓰면 부르는 쪽이 이름·오류 글을 esc 로 감싼다.
// cls — .dlg 에 더할 클래스(창마다 모양을 따로: 예 "pd" = 교인 자세히). title 이 빈 글자면 제목 줄을 숨긴다.
export function dialog({ title = "", text = "", html = "", ok = "확인", cancel = "취소", danger = false, cls = "" } = {}) {
  return new Promise((resolve) => {
    const dim = document.createElement("div");
    dim.className = "dlg-dim";
    dim.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><h3></h3><div class="body"></div>
      <div class="acts">${cancel ? `<button type="button" class="btn" data-v="0"></button>` : ""}
      <button type="button" class="btn ${danger ? "danger" : "primary"}" data-v="1"></button></div></div>`;
    if (cls) dim.querySelector(".dlg").classList.add(...String(cls).split(/\s+/).filter(Boolean));
    const h3 = dim.querySelector("h3");
    h3.textContent = title;
    h3.hidden = !title;
    const body = dim.querySelector(".body");
    if (html) body.innerHTML = html; else body.textContent = text;
    dim.querySelector('[data-v="1"]').textContent = ok;
    if (cancel) dim.querySelector('[data-v="0"]').textContent = cancel;
    const onKey = (e) => { if (e.key === "Escape") done(false); };
    const done = (v) => { dim.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    // 바깥을 **눌렀다 뗄 때 모두** 바깥이어야 닫는다(글을 끌어 고르다 밖에서 떼면 닫히던 사고 — 2026-09-17)
    let downOut = false;
    dim.addEventListener("pointerdown", (e) => { downOut = e.target === dim; });
    // 뜬 뒤 300ms 동안은 바깥 클릭을 무시한다 — 두 번 누르는 버릇이 있는 분이 여는 순간 창을 닫아 버리지 않게
    const openedAt = Date.now();
    dim.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (b) return done(b.dataset.v === "1");
      if (e.target === dim && downOut && cancel && Date.now() - openedAt > 300) done(false);
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(dim);
  });
}

// 저장 중에는 그 화면의 단추를 모두 잠근다 — 두 번 눌러 같은 요청이 두 번 가지 않게
export async function busy(root, fn) {
  const btns = [...root.querySelectorAll("button:not([disabled])")];
  btns.forEach((b) => (b.disabled = true));
  try { return await fn(); } finally { btns.forEach((b) => (b.disabled = false)); }
}

const MESSAGES = {
  network: "인터넷 연결을 확인해 주세요",
  server: "서버에서 문제가 생겼어요",
  unauthenticated: "로그인이 풀렸어요 — 다시 로그인해 주세요",
  "not-registered": "아직 등록되지 않았어요",
  pending: "승인을 기다리고 있어요",
  disabled: "사용이 멈춘 계정이에요",
  forbidden: "이 메뉴를 쓸 권한이 없어요",
  "unknown-action": "화면이 옛 판이에요 — 새로고침해 주세요",
  "bad-json": "잘못된 요청이에요",
  invalid: "잘못된 요청이에요",
  "name-required": "이름을 적어 주세요",
  "gu-mok-required": "교구와 목장을 적어 주세요",
  "bu-grade-required": "부서와 학년을 적어 주세요",
  "too-long": "한 칸에 40자까지 적을 수 있어요",
  "bad-char": "이름·소속에는 \" \\ , ( ) | 를 쓸 수 없어요",
  "invalid-type": "교구·교회학교 중에서 골라 주세요",
  "already-registered": "이미 등록되어 있어요",
  "not-found": "그분을 찾지 못했어요 — 새로 불러와 주세요",
  "not-pending": "이미 처리된 분이에요 — 새로 불러와 주세요",
  conflict: "다른 분이 먼저 바꿨어요 — 새로 불러올게요",
  "invalid-roles": "역할을 다시 골라 주세요",
  "roles-required": "역할을 하나 이상 골라 주세요",
  "unknown-role": "없는 역할이에요",
  "use-approve": "승인 대기 중인 분은 「승인」으로 처리해 주세요",
  "invalid-status": "잘못된 요청이에요",
  "cancel-note-required": "취소 사유를 적어 주세요 (담당자만 봐요)",
  "note-too-long": "메모·사유는 500자까지 적을 수 있어요",
  self: "자기 자신은 정지할 수 없어요",
  "self-super": "자기 자신의 총괄 관리자 역할은 뺄 수 없어요",
  "last-super": "총괄 관리자가 한 분은 남아 있어야 해요",
  // 성경필사(암송) — 2026-09-29 설계 §6 오류 코드(not-found·conflict·bad-char·too-long·note-too-long 은 위에 있다)
  already: "이 회차에 같은 분이 이미 있어요",
  "app-row-note-only": "앱에서 낸 신청(또는 자격 회차의 줄)은 메모만 고칠 수 있어요",
  "app-row": "앱에서 낸 신청은 뺄 수 없어요 — 성도님이 앱에서 취소해요",
  "eligibility-event": "자격 회차(가을 말씀 동행 같은)의 명단은 더하기·올리기·빼기를 하지 않아요 — 메모만 고칠 수 있어요",
  "needs-confirm": "성도님께 보이게 하려면 한 번 더 확인해 주세요",
  exists: "같은 회차 ID 가 이미 있어요 — 다른 ID 를 적어 주세요",
  "bad-event-id": "회차 ID 는 영문 소문자·숫자·붙임표(-)로, 소문자나 숫자로 시작해 2~41자예요 (예: summer-2027)",
  "no-title": "회차 이름을 적어 주세요",
  "bad-period": "기간(시작일·마감일)을 골라 주세요",
  "period-reversed": "마감일이 시작일보다 앞서요",
  "bad-status": "상태를 다시 골라 주세요",
  "bad-list-until": "명단 공개 종료일을 다시 골라 주세요",
  "list-until-before-close": "명단 공개 종료일이 등록 마감일보다 앞서요",
  "before-eligibility": "자격 회차는 자격 측정 시작일보다 먼저 열 수 없어요",
  "bad-sort-order": "차례는 -999~999 사이의 정수로 적어 주세요 (보통 0 · 작을수록 위)",
  "event-too-long": "이름은 100자 · 짧은 이름은 40자 · 부제는 100자 · 묶음은 20자까지 적을 수 있어요",
  "bad-type": "구분(교구·교회학교)을 골라 주세요",
  "no-name": "이름을 적어 주세요",
  "bad-group": "교구를 골라 주세요 (믿음·소망·사랑·섬김·은혜·화평·기쁨·새가족)",
  "no-group": "소속(교구 또는 부서)을 적어 주세요",
  "bad-sub": "목장은 숫자나 「남성」으로 적어 주세요 (모르면 비워 두기)",
  "too-many": "한 번에 600줄까지 올릴 수 있어요 — 나눠서 올려 주세요",
  // 교인명부 「자세히」 창 잇기(2026-10-01)
  "other-name": "이 기록은 이분과 이름이 달라요 — 창을 닫고 다시 열어 주세요",
  "not-linked": "이미 풀렸거나 다른 분께 이어진 기록이에요 — 창을 닫고 다시 열어 주세요",
  "bad-kind": "이 기록은 아직 여기서 이을 수 없어요 — 🤝 사역 이력 메뉴에서 고쳐 주세요",
  // 사역 이력(2026-10-01 · 서버 history-db.ts)
  "history-too-many": "한 번에 3,000줄까지 올릴 수 있어요 — 해마다 나눠 올려 주세요",
  "history-too-long": "한 칸에 100자까지 적을 수 있어요",
  "history-exists": "같은 해·부서·팀·이름·목장·직분의 줄이 이미 있어요",
  "history-deleted": "같은 줄을 전에 뺐어요 — 빼 둔 줄은 되살리지 않아요(이름·목장 등을 달리 적어 주세요)",
  "bad-year": "해(년도)를 1950~2100 사이 네 자리로 적어 주세요",
  "candidates-changed": "그사이 교인명부가 바뀌었어요 — 창을 닫고 다시 열어 주세요",
  "no-directory": "교인명부가 아직 올라오지 않아 맞출 수 없어요",
  "need-directory": "교인ID 로 찾기는 교인명부 역할이 있어야 해요",   // 찾기 칸의 #교인ID(2026-10-02 · historyFilter)
};

// 서버 답 → 한 문장(+ 오류 번호)
export function errorText(r) {
  const base = MESSAGES[r?.error] || "처리하지 못했어요";
  return r?.code ? `${base} (${r.code})` : base;
}
