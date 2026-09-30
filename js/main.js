// 부팅 · 껍데기(머리줄·메뉴) · 길 찾기
import { currentSession, signInWithKakao, signOut, takeReturnHash } from "./core/auth.js";
import { call, setAuthLostHandler } from "./core/api.js";
import { parseHash, go } from "./core/router.js";
import { menusFor, menuGroups } from "./menus/registry.js";
import { esc, toast, errorText, affiliation } from "./core/ui.js";
import { renderLogin, renderRegister, renderPending, renderDisabled, renderError, renderOpenExternal } from "./screens/gate.js";
import { shouldLeaveKakao, externalUrl, closeUrl } from "./core/inapp.js";
import { closeAllForms } from "./core/modal.js";

const app = document.getElementById("app");
let me = null;
let booting = false;

const onKakao = () => signInWithKakao().catch((e) => toast("카카오 로그인을 열지 못했어요 — " + (e?.message || e)));
const onSignOut = async () => { await signOut(); history.replaceState(null, "", location.pathname); boot(); };
// 「다른 카카오 계정으로」(로그인 화면 · 등록 화면) — 카카오 세션이 남아 있으면 자동으로 같은 계정으로 돌아오니 prompt:login 을 요청한다
const onSwitch = async () => {
  await signOut();
  signInWithKakao(true).catch((e) => {
    toast("카카오 로그인을 열지 못했어요 — " + (e?.message || e));
    boot();   // 로그아웃한 채 등록 화면에 남지 않게 — 로그인 화면으로 되돌린다
  });
};
async function register(identity) {
  const r = await call("register", { identity });
  if (r.ok) await boot();
  return r;
}

async function boot() {
  if (booting) return;
  booting = true;
  try {
    me = null;
    document.body.classList.remove("nav-open");
    closeAllForms();   // 로그인이 풀리거나 권한이 바뀌어 다시 부팅하면 떠 있던 입력 창(js/core/modal.js)도 닫는다
    // 카카오/Supabase 가 로그인 실패로 돌려보내면 주소에 ?error=…&error_description=… 가 붙는다.
    // error_description 은 영어 원문 그대로라 성도님께 그대로 보이면 안 된다 — error 값으로만 문구를 고른다.
    const params = new URLSearchParams(location.search);
    const err = params.get("error");
    const errDesc = params.get("error_description");
    if (errDesc) history.replaceState(null, "", location.pathname + location.hash);
    if (err) console.warn("카카오 로그인 실패:", err, errDesc);
    const session = await currentSession();
    if (!session) {
      const notice = err
        ? (err === "access_denied" ? "카카오 로그인을 취소하셨어요" : "카카오 로그인이 되지 않았어요 — 잠시 뒤 다시 해 주세요")
        : "";
      return renderLogin(app, { onKakao, onSwitch, notice });
    }
    const r = await call("me");
    if (!r.ok) {
      if (r.error === "unauthenticated") {
        await signOut();
        return renderLogin(app, { onKakao, onSwitch, notice: "로그인이 풀렸어요 — 다시 로그인해 주세요" });
      }
      return renderError(app, { message: errorText(r), onRetry: boot, onSignOut });
    }
    if (!r.registered) return renderRegister(app, { nickname: r.kakao_nickname, onSubmit: register, onSignOut, onSwitch });
    if (r.status === "pending") {
      return renderPending(app, { member: r.member, onRefresh: boot, onSignOut,
        onEdit: () => renderRegister(app, { nickname: r.kakao_nickname, member: r.member, onSubmit: register, onSignOut, onSwitch }) });
    }
    if (r.status !== "active") return renderDisabled(app, { onSignOut });
    me = r;
    const back = takeReturnHash();
    if (back && back !== location.hash) history.replaceState(null, "", location.pathname + back);
    renderShell();
    await route();
  } finally {
    booting = false;
  }
}

function renderShell() {
  const menus = menusFor(me.roles);
  app.innerHTML = `
    <header class="top">
      <button type="button" class="icon-btn menu" aria-label="메뉴 열기">☰</button>
      <h1>고척교회 관리</h1>
      <span class="who">${esc(me.member.name)}</span>
      <button type="button" class="out">로그아웃</button>
    </header>
    <nav class="nav" aria-label="메뉴">
      <a href="#/" data-id="">🏠 처음</a>
      ${menuGroups(menus).map((g, i) => `<div class="nav-g" role="group" aria-labelledby="nav-g${i}">` +
        `<h3 id="nav-g${i}"><span class="nav-gi" aria-hidden="true">${g.icon}</span>${esc(g.group)}</h3>` +
        g.menus.map((m) => `<a href="#/${m.id}" data-id="${m.id}"><span aria-hidden="true">${m.icon}</span>${esc(m.label)}</a>`).join("") +
        `</div>`).join("")}
    </nav>
    <div class="nav-dim" hidden></div>
    <main class="view" id="view"></main>`;
  const dim = app.querySelector(".nav-dim");
  const setNav = (open) => { document.body.classList.toggle("nav-open", open); dim.hidden = !open; };
  app.querySelector(".menu").onclick = () => setNav(!document.body.classList.contains("nav-open"));
  dim.onclick = () => setNav(false);
  app.querySelector(".nav").addEventListener("click", (e) => { if (e.target.closest("a")) setNav(false); });
  app.querySelector(".out").onclick = onSignOut;
}

async function route() {
  // 메뉴를 옮기면 떠 있던 입력 창(js/core/modal.js)을 닫는다 — 안 그러면 다음 메뉴 위에 창이 남는다(설계 §3)
  closeAllForms();
  if (!me) return;
  const view = document.getElementById("view");
  if (!view) return;
  const { menu, sub, query } = parseHash(location.hash);
  const menus = menusFor(me.roles);
  app.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.id === menu));
  window.scrollTo(0, 0);
  // 메뉴마다 새 <section> — 앞 메뉴가 달아 둔 이벤트가 다음 메뉴로 새지 않게
  const host = document.createElement("section");
  view.replaceChildren(host);
  const m = menus.find((x) => x.id === menu);
  if (!m) return renderHome(host, menus);
  host.innerHTML = `<p class="empty">불러오는 중…</p>`;
  try {
    const mod = await m.load();
    await mod.render(host, { me, call, go, sub, query });
  } catch (e) {
    console.error(e);
    host.innerHTML = `<p class="empty">화면을 열지 못했어요 — 새로고침해 주세요</p>`;
  }
}

function renderHome(host, menus) {
  host.innerHTML = `<h2 class="page-title">${esc(me.member.name)} 님, 평안하세요</h2>
    <p class="muted" style="margin-bottom:12px">${esc(affiliation(me.member))} · ${esc(me.roles_info.map((r) => r.label).join(" · ") || "역할 없음")}</p>
    ${menus.length
      ? menuGroups(menus).map((g) => `<h3 class="home-g"><span aria-hidden="true">${g.icon}</span>${esc(g.group)}</h3>` +
          g.menus.map((m) => `<a class="card home-card" href="#/${m.id}">${m.icon} <b>${esc(m.label)}</b><br><span class="muted">${esc(m.desc)}</span></a>`).join("")).join("")
      : me.roles.length
        ? `<p class="empty">이 역할의 메뉴는 곧 열려요</p>`
        : `<p class="empty">아직 쓸 수 있는 메뉴가 없어요 — 총괄 관리자에게 역할을 받아 주세요</p>`}`;
}

let lostAt = 0;
setAuthLostHandler((code) => {
  if (Date.now() - lostAt < 3000) return;   // 한 화면에서 여러 요청이 한꺼번에 막혀도 한 번만
  lostAt = Date.now();
  toast(code === "unauthenticated" ? "로그인이 풀렸어요" : "권한이 바뀌었어요 — 다시 확인할게요");
  boot();
});
window.addEventListener("hashchange", () => { route(); });

// 카카오톡으로 받은 주소를 누르면 카카오톡 안 브라우저에서 열린다 — 기본 브라우저로 넘긴다(js/core/inapp.js)
const STAY_KEY = "ca-stay-in-kakao";
function start() {
  let stay = false;
  try { stay = sessionStorage.getItem(STAY_KEY) === "1"; } catch {}
  const ua = navigator.userAgent;
  if (!shouldLeaveKakao({ ua, href: location.href, stay })) return boot();
  const open = () => { location.href = externalUrl(location.href); };
  renderOpenExternal(app, {
    onOpen: open,
    onClose: () => { location.href = closeUrl(ua); },
    onStay: () => { try { sessionStorage.setItem(STAY_KEY, "1"); } catch {} boot(); },
  });
  open();
}
start();
