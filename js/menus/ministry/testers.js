// 🧪 시험 참여자 — 신청 기간 밖에도 성경암송 앱 첫 화면에 「🤝 사역신청」이 보이는 분들(2026-09-30).
//   명단은 app_config.ministryTesters(성경암송 api 가 읽는다). 앱에 한 번이라도 로그인한 분만 찾을 수 있다.
//   ⚠️ 시험으로 낸 신청도 진짜 「신청 현황」에 들어간다 — 신청 기간(12/13) 전에 지운다.
//   막는 것은 서버다(역할 ministry · 한 분씩 · users 에 있는 키만).
import { esc, kstTime, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🧪 시험 참여자</h2>`;
const lastSeen = (x) => (x.last_seen_at ? "마지막 접속 " + kstTime(x.last_seen_at) : "접속 기록 없음");

function testerCard(t) {
  const head = t.missing
    ? `<b>계정을 찾을 수 없어요</b>`
    : `<b>${esc(t.name)}</b> <span class="muted">${esc(t.who)}</span>`;
  const sub = t.missing
    ? "앱 계정이 지워졌거나 합쳐졌어요 — 빼 주세요"
    : lastSeen(t) + (t.moved ? " · 등록한 뒤 이름·소속이 바뀐 분" : "");
  return `<div class="card mt-card" data-key="${esc(t.key)}">
    <div>${head}</div><div class="muted">${esc(sub)}</div>
    <div class="acts"><button type="button" class="btn danger" data-act="remove">빼기</button></div>
  </div>`;
}

function userCard(u) {
  return `<div class="card mt-card" data-key="${esc(u.key)}">
    <div><b>${esc(u.name)}</b> <span class="muted">${esc(u.who)}</span></div>
    <div class="muted">${esc(lastSeen(u))}</div>
    <div class="acts">${u.tester ? `<span class="badge ok">명단에 있음</span>`
      : `<button type="button" class="btn primary" data-act="add">더하기</button>`}</div>
  </div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("ministryTesters");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  let testers = r.testers || [];
  let found = null;   // 마지막 찾기 { name, users, more }

  el.innerHTML = TITLE + `
    <p class="muted mt-note">이 명단에 오른 분은 신청 기간이 아니어도 성경암송 앱 첫 화면에 「🤝 사역신청」이 보이고 신청·고치기·취소를 할 수 있어요.
      성도님 앱에는 다음에 앱을 열 때 반영돼요.</p>
    <h3 class="sec-title">명단 <span class="mt-n"></span></h3>
    <div class="mt-list"></div>
    <h3 class="sec-title">더하기</h3>
    <form class="mt-find" role="search">
      <input type="search" class="search" maxlength="40" placeholder="이름 (예: 홍길동)" autocomplete="off"
        enterkeyhint="search" aria-label="찾을 이름">
      <button type="submit" class="btn primary">찾기</button>
    </form>
    <p class="muted">앱에 한 번이라도 로그인한 분만 찾을 수 있어요.</p>
    <div class="mt-res"></div>
    <p class="muted mt-warn">⚠️ 시험으로 낸 신청도 「신청 현황」에 함께 보여요 — 신청 기간 전에 지워 주세요.</p>`;

  const $ = (s) => el.querySelector(s);
  const drawList = () => {
    $(".mt-n").textContent = testers.length + "명";
    $(".mt-list").innerHTML = testers.length ? testers.map(testerCard).join("")
      : `<p class="empty">아직 아무도 없어요 — 아래에서 이름으로 찾아 더해 주세요</p>`;
  };
  const drawFound = () => {
    const box = $(".mt-res");
    if (!found) { box.innerHTML = ""; return; }
    if (!found.users.length) { box.innerHTML = `<p class="empty">‘${esc(found.name)}’ 이름의 앱 계정이 없어요</p>`; return; }
    box.innerHTML = found.users.map(userCard).join("") +
      (found.more ? `<p class="muted">30명까지만 보여요 — 이름을 더 적어 주세요</p>` : "");
  };
  const find = async (name) => {
    const res = await busy(el, () => call("ministryTesterFind", { name }));
    if (!res.ok) { toast(errorText(res)); return; }
    found = { name, users: res.users || [], more: !!res.more };
    drawFound();
  };
  drawList();

  $(".mt-find").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $(".mt-find input").value.trim();
    if (!name) return toast("이름을 적어 주세요");
    find(name);
  });

  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const key = b.closest(".card")?.dataset.key;
    if (!key) return;
    const act = b.dataset.act;
    if (act === "remove") {
      const t = testers.find((x) => x.key === key);
      const nm = t && !t.missing ? `${t.name}(${t.who})` : "이 계정";
      const ok = await dialog({ title: "명단에서 뺄까요?", danger: true, ok: "빼기",
        text: `${nm} 님은 다음에 앱을 열 때부터 신청 기간 전에는 「🤝 사역신청」이 안 보여요.\n이미 낸 신청은 그대로 남아요.` });
      if (!ok) return;
    } else if (act !== "add") return;
    const res = await busy(el, () => call("ministryTesterSave", { op: act, key }));
    if (!res.ok) { await dialog({ title: "처리하지 못했어요", text: errorText(res), cancel: null }); return; }
    testers = res.testers || [];
    drawList();
    toast(res.already ? (act === "add" ? "이미 명단에 있어요" : "이미 빠져 있어요") : (act === "add" ? "더했어요" : "뺐어요"));
    if (found) await find(found.name);   // 「명단에 있음」 표시를 새로 맞춘다
  });
}
