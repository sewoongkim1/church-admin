// ⛪ 설교·찬양 — ① 주간 구절 등록 · ② 설교 내용 등록(유튜브+자막 → AI 노트·음성·챗봇) · 설교 목록·묵상.
//   성경암송 api 프록시(staffVerseSave·sermonJobCreate·sermonJobs·sermonJobRetry·sermonStaffList·sermonStaffSave·sermonDelete).
//   역할 content(삭제만 super). ⚠️ ②는 GitHub 워크플로를, 성경암송 api 가 깨운다(여기선 안 건드림).
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">⛪ 설교·찬양</h2>`;
const CATS = ["주일설교", "금요성령집회", "새벽기도회", "송구영신예배", "특별집회", "청년예배"];
const ymd = (d) => d.toISOString().slice(0, 10);
const H3 = (t) => `<h3 style="font-size:14px;font-weight:800;color:var(--navy);margin:16px 0 8px">${t}</h3>`;
const vidOf = (u) => { const m = String(u || "").match(/[A-Za-z0-9_-]{11}/); return m ? m[0] : ""; };

export async function render(el, { me, call }) {
  const isSuper = !!(me && (me.roles || []).includes("super"));
  el.innerHTML = TITLE + `
    <div class="acts"><button class="btn primary" data-tab="up">설교 올리기</button><button class="btn" data-tab="list">설교 목록</button></div>
    <div id="sm-body"></div>`;
  const body = el.querySelector("#sm-body");

  function upHtml() {
    return H3("① 이번 주 암송 구절") + `
      <div class="card"><form id="sv-form">
        <div class="ma-grid">
          <label class="field"><span>구절 번호(1~999) <small id="sv-no-hint" class="muted"></small></span><input id="sv-no" inputmode="numeric" maxlength="3"></label>
          <label class="field"><span>구절(짧게 · 예: 요 3:16)</span><input id="sv-ref" maxlength="60"></label>
          <label class="field ma-wide"><span>본문</span><input id="sv-text" maxlength="2000"></label>
          <label class="field"><span>구절(길게 · 선택)</span><input id="sv-reff" maxlength="120"></label>
          <label class="field"><span>날짜(선택 · YYYY-MM-DD)</span><input id="sv-date" type="date"></label>
        </div>
        <button class="btn primary wide" type="submit">구절 저장</button>
      </form><p id="sv-status" class="muted"></p></div>`
    + H3("② 설교 내용 등록 (유튜브 + 자막)") + `
      <div class="card"><p class="muted">자막을 붙여넣으면 AI 가 노트·3분 음성·챗봇 색인까지 만들어요(시간이 걸려요).</p>
      <form id="sj-form">
        <div class="ma-grid">
          <label class="field ma-wide"><span>유튜브 주소 또는 영상 ID</span><input id="sj-url" placeholder="https://youtu.be/..."></label>
          <label class="field ma-wide"><span>제목</span><input id="sj-title" maxlength="200"></label>
          <label class="field"><span>예배일</span><input id="sj-date" type="date" value="${ymd(new Date())}"></label>
          <label class="field"><span>구분</span><select id="sj-cat">${CATS.map((c) => `<option>${c}</option>`).join("")}</select></label>
          <label class="field"><span>설교자</span><input id="sj-preacher" maxlength="60"></label>
        </div>
        <label class="field"><span>자막(붙여넣기)</span><textarea id="sj-transcript" rows="8" class="pl-memo-in" style="width:100%"></textarea></label>
        <button class="btn primary wide" type="submit">설교 올리기 시작</button>
      </form><p id="sj-status" class="muted"></p></div>`
    + H3("진행 상황") + `<div class="acts"><button class="btn" id="sj-refresh">새로고침</button></div><div id="sj-jobs"></div>`;
  }

  function drawJobs(jobs) {
    el.querySelector("#sj-jobs").innerHTML = (jobs || []).length ? jobs.map((j) => `
      <div class="card"><div><b>${esc(j.title || j.video_id || "")}</b> <span class="muted">${esc(j.status || "")}${j.attempt ? ` · ${j.attempt}차` : ""}</span></div>
        ${j.step || j.message ? `<div class="muted">${esc(j.step || j.message || "")}</div>` : ""}
        ${j.status === "failed" && isSuperOrContent() ? `<div class="acts"><button class="btn" data-retry="${esc(j.id)}">다시 시도</button></div>` : ""}</div>`).join("")
      : `<p class="muted">진행 중인 작업이 없어요.</p>`;
    el.querySelectorAll("[data-retry]").forEach((b) => b.addEventListener("click", async () => {
      await busy(el, async () => { const r = await call("sermonJobRetry", { id: Number(b.dataset.retry) }); toast(r.ok ? "다시 시도해요." : errorText(r)); refreshJobs(); });
    }));
  }
  const isSuperOrContent = () => true;  // content·super 모두 재시도 가능
  async function refreshJobs() { const r = await call("sermonJobs"); if (r.ok) drawJobs(r.jobs); }

  function wireUp() {
    // 구절 번호 자동 — 다음 번호(지금까지 최대+1)를 미리 넣는다(고칠 수 있다 · 옛 구절 수정·건너뛴 주 대비).
    (async () => {
      const r = await call("verseNextNo");
      const noEl = el.querySelector("#sv-no"), hint = el.querySelector("#sv-no-hint");
      if (r && r.ok && noEl && !noEl.value) { noEl.value = r.next; if (hint) hint.textContent = "— 다음 번호예요(고치셔도 돼요)"; }
    })();
    el.querySelector("#sv-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const verse = { no: Number(el.querySelector("#sv-no").value), refShort: el.querySelector("#sv-ref").value,
        text: el.querySelector("#sv-text").value, refFull: el.querySelector("#sv-reff").value, date: el.querySelector("#sv-date").value };
      await busy(el, async () => { const r = await call("staffVerseSave", { verse }); el.querySelector("#sv-status").textContent = r.ok ? "구절을 저장했어요." : errorText(r); if (r.ok) toast("저장했어요."); });
    });
    el.querySelector("#sj-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const videoId = vidOf(el.querySelector("#sj-url").value);
      if (!videoId) { el.querySelector("#sj-status").textContent = "유튜브 주소/ID 를 확인해 주세요."; return; }
      const job = { videoId, title: el.querySelector("#sj-title").value, date: el.querySelector("#sj-date").value,
        category: el.querySelector("#sj-cat").value, preacher: el.querySelector("#sj-preacher").value, transcript: el.querySelector("#sj-transcript").value };
      const go = await dialog({ title: "설교 올리기를 시작할까요?", text: "AI 노트·음성·색인이 만들어져요(몇 분 걸려요).", ok: "시작", cancel: "그만두기" });
      if (!go) return;
      await busy(el, async () => { const r = await call("sermonJobCreate", { job }); el.querySelector("#sj-status").textContent = r.ok ? "시작했어요 — 진행 상황에서 지켜봐 주세요." : errorText(r); if (r.ok) { toast("시작했어요."); refreshJobs(); } });
    });
    el.querySelector("#sj-refresh").addEventListener("click", refreshJobs);
    refreshJobs();
  }

  async function loadList() {
    body.innerHTML = `<p class="muted">불러오는 중…</p>`;
    const r = await call("sermonStaffList");
    if (!r.ok) { body.innerHTML = `<p class="muted">${esc(errorText(r))}</p>`; return; }
    const sermons = r.sermons || [];
    body.innerHTML = sermons.length ? sermons.map((s) => `
      <div class="card" data-id="${esc(s.id)}">
        <div>${s.hidden ? '<span class="muted">[숨김] </span>' : ""}<b>${esc(s.title || "")}</b> <span class="muted">${esc(s.svc_date || "")} · ${esc(s.category || "")}${s.preacher ? " · " + esc(s.preacher) : ""}</span></div>
        <div class="acts">
          <button class="btn" data-act="meta">제목·예배일·구분·설교자·숨김 고치기</button>
          ${isSuper ? `<button class="btn danger" data-act="del">삭제</button>` : ""}
        </div>
        <div class="sm-edit" hidden></div>
      </div>`).join("") : `<p class="muted">설교가 없어요.</p>`;
    body.querySelectorAll('[data-act="meta"]').forEach((btn) => btn.addEventListener("click", () => openMeta(btn.closest(".card"), sermons.find((x) => String(x.id) === btn.closest(".card").dataset.id))));
    body.querySelectorAll('[data-act="del"]').forEach((btn) => btn.addEventListener("click", async () => {
      const id = btn.closest(".card").dataset.id;
      const go = await dialog({ title: "설교를 삭제할까요?", text: "색인까지 지워요. 되돌릴 수 없어요.", ok: "삭제", cancel: "그만두기", danger: true });
      if (!go) return;
      await busy(el, async () => { const r = await call("sermonDelete", { id }); toast(r.ok ? "삭제했어요." : errorText(r)); if (r.ok) loadList(); });
    }));
  }

  function openMeta(card, s) {
    const box = card.querySelector(".sm-edit"); box.hidden = false;
    box.innerHTML = `<div class="ma-grid" style="margin-top:8px">
      <label class="field ma-wide"><span>제목</span><input id="me-title" maxlength="200" value="${esc(s.title || "")}"></label>
      <label class="field"><span>예배일</span><input id="me-date" type="date" value="${esc(s.svc_date || "")}"></label>
      <label class="field"><span>구분</span><select id="me-cat">${CATS.map((c) => `<option${c === s.category ? " selected" : ""}>${c}</option>`).join("")}</select></label>
      <label class="field"><span>설교자</span><input id="me-preacher" maxlength="60" value="${esc(s.preacher || "")}"></label>
      <label class="field"><span>숨김</span><select id="me-hidden"><option value="">보임</option><option value="1"${s.hidden ? " selected" : ""}>숨김</option></select></label>
    </div><button class="btn primary" data-act="save">저장</button>`;
    box.querySelector('[data-act="save"]').addEventListener("click", async () => {
      const sermon = { id: s.id, title: box.querySelector("#me-title").value, svc_date: box.querySelector("#me-date").value,
        category: box.querySelector("#me-cat").value, preacher: box.querySelector("#me-preacher").value, hidden: !!box.querySelector("#me-hidden").value };
      await busy(el, async () => { const r = await call("sermonStaffSave", { sermon }); toast(r.ok ? "저장했어요." : errorText(r)); if (r.ok) loadList(); });
    });
  }

  const tabs = { up: () => { body.innerHTML = upHtml(); wireUp(); }, list: loadList };
  el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("primary", x === b)); tabs[b.dataset.tab]();
  }));
  tabs.up();
}
