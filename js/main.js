// 부팅 · 껍데기(머리줄·메뉴) · 길 찾기
import { currentSession, signInWithKakao, signOut, takeReturnHash } from "./core/auth.js";
import { call, setAuthLostHandler } from "./core/api.js";
import { parseHash, go } from "./core/router.js";
import { menusFor } from "./menus/registry.js";
import { esc, toast, errorText, affiliation } from "./core/ui.js";
import { renderLogin, renderRegister, renderPending, renderDisabled, renderError } from "./screens/gate.js";

const app = document.getElementById("app");
let me = null;
let booting = false;

const onKakao = () => signInWithKakao().catch((e) => toast("카카오 로그인을 열지 못했어요 — " + (e?.message || e)));
const onSignOut = async () => { await signOut(); history.replaceState(null, "", location.pathname); boot(); };
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
    const session = await currentSession();
    if (!session) return renderLogin(app, { onKakao });
    const r = await call("me");
    if (!r.ok) return renderError(app, { message: errorText(r), onRetry: boot });
    if (!r.registered) return renderRegister(app, { nickname: r.kakao_nickname, onSubmit: register, onSignOut });
    if (r.status === "pending") {
      return renderPending(app, { member: r.member, onRefresh: boot, onSignOut,
        onEdit: () => renderRegister(app, { nickname: r.kakao_nickname, member: r.member, onSubmit: register, onSignOut }) });
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
  const groups = [...new Set(menus.map((m) => m.group))];
  app.innerHTML = `
    <header class="top">
      <button type="button" class="icon-btn menu" aria-label="메뉴 열기">☰</button>
      <h1>고척교회 관리</h1>
      <span class="who">${esc(me.member.name)}</span>
      <button type="button" class="out">로그아웃</button>
    </header>
    <nav class="nav" aria-label="메뉴">
      <a href="#/" data-id="">🏠 처음</a>
      ${groups.map((g) => `<h3>${esc(g)}</h3>` + menus.filter((m) => m.group === g)
        .map((m) => `<a href="#/${m.id}" data-id="${m.id}">${m.icon} ${esc(m.label)}</a>`).join("")).join("")}
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
      ? menus.map((m) => `<a class="card home-card" href="#/${m.id}">${m.icon} <b>${esc(m.label)}</b><br><span class="muted">${esc(m.desc)}</span></a>`).join("")
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
boot();
