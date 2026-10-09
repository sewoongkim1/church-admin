// ⛪ 설교·찬양 — 흐름 두 가지(2026-10-09 담당자 확인):
//   ① 암송 있는 주: 토요일에 「주간 구절 + 제목·예배일·구분·설교자」를 함께 넣는다(verses 에 저장).
//   ② 일요일(또는 암송 없이 한번에): 유튜브+자막. 구절 번호로 불러오면 토요일 메타가 자동 채워지고, 없으면 직접 넣는다.
//   성경암송 api 프록시(staffVerseSave·verseNextNo·verseMeta·sermonJobCreate·sermonJobs·sermonJobRetry·sermonStaffList·sermonStaffSave·sermonDelete).
//   역할 content(삭제만 super). ⚠️ ②는 GitHub 워크플로를 성경암송 api 가 깨운다(여기선 안 건드림).
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">⛪ 설교·찬양</h2>`;
const CATS = ["주일설교", "금요성령집회", "새벽기도회", "송구영신예배", "특별집회", "청년예배"];
const ymd = (d) => d.toISOString().slice(0, 10);
const H3 = (t) => `<h3 style="font-size:14px;font-weight:800;color:var(--navy);margin:16px 0 8px">${t}</h3>`;
const vidOf = (u) => { const m = String(u || "").match(/[A-Za-z0-9_-]{11}/); return m ? m[0] : ""; };
const catOpts = (sel) => CATS.map((c) => `<option${c === sel ? " selected" : ""}>${c}</option>`).join("");

export async function render(el, { me, call }) {
  const isSuper = !!(me && (me.roles || []).includes("super"));
  el.innerHTML = TITLE + `
    <div class="acts"><button class="btn primary" data-tab="up">설교 올리기</button><button class="btn" data-tab="list">설교 목록</button></div>
    <div id="sm-body"></div>`;
  const body = el.querySelector("#sm-body");
  const $ = (id) => el.querySelector("#" + id);

  function upHtml() {
    return H3("① 토요일 — 이번 주 암송 구절 + 설교 정보") + `
      <div class="card"><p class="muted">암송 구절이 있는 주에 토요일 넣어요. 제목·예배일·구분·설교자도 여기서 함께 넣으면 일요일에 다시 안 넣어도 돼요.</p>
      <form id="sv-form">
        <div class="sm-row">
          <label class="field"><span>구절 번호(1~999) <small id="sv-no-hint" class="muted"></small></span><input id="sv-no" inputmode="numeric" maxlength="3"></label>
          <label class="field grow"><span>제목</span><input id="sv-title" maxlength="200" placeholder="설교 제목"></label>
        </div>
        <div class="sm-row" style="margin-top:12px">
          <label class="field"><span>구분</span><select id="sv-cat">${catOpts("주일설교")}</select></label>
          <label class="field"><span>예배일</span><input id="sv-date" type="date"></label>
          <label class="field"><span>설교자</span><input id="sv-preacher" maxlength="60"></label>
        </div>
        <div class="sm-row" style="margin-top:12px">
          <label class="field"><span>구절(짧게 · 예: 요 3:16)</span><input id="sv-ref" maxlength="60"></label>
          <label class="field"><span>구절(길게 · 선택)</span><input id="sv-reff" maxlength="120"></label>
        </div>
        <label class="field" style="margin-top:12px"><span>본문</span><input id="sv-text" maxlength="2000"></label>
        <label class="field"><span>영문 구절(NIV · 선택)</span><input id="sv-ref-en" maxlength="120"></label>
        <label class="field"><span>영문 본문(NIV · 선택)</span><input id="sv-text-en" maxlength="2000"></label>
        <div class="acts" style="margin-top:12px"><button type="button" class="btn" id="sv-niv">AI 로 영문(NIV) 만들기</button></div>
        <button class="btn primary wide" type="submit" style="margin-top:12px">구절·설교 정보 저장</button>
      </form><p id="sv-status" class="muted"></p></div>`
    + H3("② 영상 올리기 (일요일) — 암송 없이 올리는 설교도 여기서") + `
      <div class="card"><p class="muted">자막을 붙여넣으면 AI 가 노트·3분 음성·챗봇 색인까지 만들어요(몇 분 걸려요).</p>
      <p class="muted"><b>암송 구절이 있는 주</b>는 번호로 불러오면 제목·예배일·구분·설교자가 자동 채워져요. <b>암송 없이 올리는 설교</b>는 불러오기 없이 아래를 직접 넣으세요.</p>
      <div class="acts"><input id="sj-pull-no" inputmode="numeric" maxlength="3" placeholder="구절 번호(있을 때만)" class="search" style="max-width:170px;margin:0">
        <button class="btn" id="sj-pull">구절에서 불러오기</button></div>
      <p class="muted" id="sj-pull-status"></p>
      <form id="sj-form"><div class="ma-grid">
        <label class="field ma-wide"><span>유튜브 주소 또는 영상 ID</span><input id="sj-url" placeholder="https://youtu.be/..."></label>
        <label class="field"><span>제목</span><input id="sj-title" maxlength="200"></label>
        <label class="field"><span>예배일</span><input id="sj-date" type="date" value="${ymd(new Date())}"></label>
        <label class="field"><span>구분</span><select id="sj-cat">${catOpts("주일설교")}</select></label>
        <label class="field"><span>설교자</span><input id="sj-preacher" maxlength="60"></label>
        <label class="field ma-wide"><span>설교 구절(그날 본문 · 암송 구절과 다름 · 선택)</span><input id="sj-scripture" maxlength="200" placeholder="예: 요한복음 3:16-21 — 비우면 AI 가 자막에서 뽑아요"></label>
      </div>
      <label class="field"><span>자막(붙여넣기)</span><textarea id="sj-transcript" rows="8" class="pl-memo-in" style="width:100%"></textarea></label>
      <button class="btn primary wide" type="submit" style="margin-top:12px">설교 올리기 시작</button></form><p id="sj-status" class="muted"></p></div>`
    + H3("진행 상황") + `<div class="acts"><button class="btn" id="sj-refresh">새로고침</button></div><div id="sj-jobs"></div>`;
  }

  function drawJobs(jobs) {
    $("sj-jobs").innerHTML = (jobs || []).length ? jobs.map((j) => `
      <div class="card"><div><b>${esc(j.title || j.video_id || "")}</b> <span class="muted">${esc(j.status || "")}${j.attempt ? ` · ${j.attempt}차` : ""}</span></div>
        ${j.step || j.message ? `<div class="muted">${esc(j.step || j.message || "")}</div>` : ""}
        ${j.status === "failed" ? `<div class="acts"><button class="btn" data-retry="${esc(j.id)}">다시 시도</button></div>` : ""}</div>`).join("")
      : `<p class="muted">진행 중인 작업이 없어요.</p>`;
    el.querySelectorAll("[data-retry]").forEach((b) => b.addEventListener("click", async () => {
      await busy(el, async () => { const r = await call("sermonJobRetry", { id: Number(b.dataset.retry) }); toast(r.ok ? "다시 시도해요." : errorText(r)); refreshJobs(); });
    }));
  }
  async function refreshJobs() { const r = await call("sermonJobs"); if (r.ok) drawJobs(r.jobs); }

  async function wireUp() {
    // ① 구절 번호 자동(다음 번호 · 고칠 수 있음)
    (async () => { const r = await call("verseNextNo"); if (r && r.ok && $("sv-no") && !$("sv-no").value) { $("sv-no").value = r.next; const h = $("sv-no-hint"); if (h) h.textContent = "— 다음 번호예요(고치셔도 돼요)"; } })();
    // 영문(NIV) AI 로 만들기 — 한글 본문·구절로 NIV 를 지어 칸을 채운다(고칠 수 있음)
    $("sv-niv").addEventListener("click", async () => {
      await busy(el, async () => {
        const r = await call("generateNiv", { refFull: $("sv-reff").value, refShort: $("sv-ref").value, text: $("sv-text").value });
        if (!r.ok) { $("sv-status").textContent = errorText(r); return; }
        if (r.textEn) $("sv-text-en").value = r.textEn;
        if (r.refEn) $("sv-ref-en").value = r.refEn;
        $("sv-status").textContent = "영문을 만들었어요. 확인하고 고치셔도 돼요.";
      });
    });
    $("sv-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const verse = { no: Number($("sv-no").value), refShort: $("sv-ref").value, text: $("sv-text").value, refFull: $("sv-reff").value,
        sermonTitle: $("sv-title").value, date: $("sv-date").value, memCategory: $("sv-cat").value, pastor: $("sv-preacher").value,
        textEn: $("sv-text-en").value, refEn: $("sv-ref-en").value };
      await busy(el, async () => { const r = await call("staffVerseSave", { verse }); $("sv-status").textContent = r.ok ? "구절·설교 정보를 저장했어요." : errorText(r); if (r.ok) toast("저장했어요."); });
    });
    // ② 구절에서 불러오기
    $("sj-pull").addEventListener("click", async () => {
      const no = Number($("sj-pull-no").value);
      if (!no) { $("sj-pull-status").textContent = "구절 번호를 넣어 주세요."; return; }
      await busy(el, async () => {
        const r = await call("verseMeta", { no });
        if (!r.ok) { $("sj-pull-status").textContent = errorText(r); return; }
        if (!r.exists) { $("sj-pull-status").textContent = `${no}번 구절이 없어요 — 암송 없이 올리는 설교면 아래를 직접 넣으세요.`; return; }
        const v = r.verse || {};
        if (v.title) $("sj-title").value = v.title;
        if (v.date) $("sj-date").value = v.date;
        if (v.category) $("sj-cat").value = v.category;
        if (v.preacher) $("sj-preacher").value = v.preacher;
        $("sj-pull-status").textContent = `${no}번 구절의 제목·예배일·구분·설교자를 불러왔어요. 고치셔도 돼요.`;
      });
    });
    $("sj-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const videoId = vidOf($("sj-url").value);
      if (!videoId) { $("sj-status").textContent = "유튜브 주소/ID 를 확인해 주세요."; return; }
      const job = { videoId, title: $("sj-title").value, date: $("sj-date").value, category: $("sj-cat").value, preacher: $("sj-preacher").value, scripture: $("sj-scripture").value, transcript: $("sj-transcript").value };
      const go = await dialog({ title: "설교 올리기를 시작할까요?", text: "AI 노트·음성·색인이 만들어져요(몇 분 걸려요).", ok: "시작", cancel: "그만두기" });
      if (!go) return;
      await busy(el, async () => { const r = await call("sermonJobCreate", { job }); $("sj-status").textContent = r.ok ? "시작했어요 — 진행 상황에서 지켜봐 주세요." : errorText(r); if (r.ok) { toast("시작했어요."); refreshJobs(); } });
    });
    $("sj-refresh").addEventListener("click", refreshJobs);
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
        <div class="acts"><button class="btn" data-act="meta">제목·예배일·구분·설교자·숨김 고치기</button>${isSuper ? `<button class="btn danger" data-act="del">삭제</button>` : ""}</div>
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
      <label class="field"><span>구분</span><select id="me-cat">${catOpts(s.category)}</select></label>
      <label class="field"><span>설교자</span><input id="me-preacher" maxlength="60" value="${esc(s.preacher || "")}"></label>
      <label class="field"><span>숨김</span><select id="me-hidden"><option value="">보임</option><option value="1"${s.hidden ? " selected" : ""}>숨김</option></select></label>
      <label class="field ma-wide"><span>설교 구절(그날 본문 · 암송 구절과 다름)</span><input id="me-scripture" maxlength="200" value="${esc(s.scripture || "")}" placeholder="예: 요한복음 3:16-21"></label>
    </div><button class="btn primary" data-act="save">저장</button>`;
    box.querySelector('[data-act="save"]').addEventListener("click", async () => {
      const sermon = { id: s.id, title: box.querySelector("#me-title").value, svc_date: box.querySelector("#me-date").value,
        category: box.querySelector("#me-cat").value, preacher: box.querySelector("#me-preacher").value, hidden: !!box.querySelector("#me-hidden").value,
        scripture: box.querySelector("#me-scripture").value };
      await busy(el, async () => { const r = await call("sermonStaffSave", { sermon }); toast(r.ok ? "저장했어요." : errorText(r)); if (r.ok) loadList(); });
    });
  }

  const tabs = { up: () => { body.innerHTML = upHtml(); wireUp(); }, list: loadList };
  el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    el.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("primary", x === b)); tabs[b.dataset.tab]();
  }));
  tabs.up();
}
