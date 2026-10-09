// 🎵 찬양 아카이브 — 곡 등록·수정·삭제 · 조회수 · 사용 현황. 제3레포 praise 함수를 내부 키로 프록시.
//   역할 content(삭제·일괄 가져오기는 super). ⚠️ 한글은 NFC 로 통일해 보여 준다(찬양대 중복·검색 누락 방지 · 2026-09-20 사고).
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🎵 찬양 아카이브</h2>`;
const nfc = (s) => String(s || "").normalize("NFC");
const vidOf = (u) => { const m = String(u || "").match(/[A-Za-z0-9_-]{11}/); return m ? m[0] : ""; };
// 구분(분류) — 옛 찬양 관리·성도님 앱 콤보와 같은 목록(praise-config.js CATEGORIES). 성경암송 SERMON_CATS 방식처럼
//   수정 때 목록에 없는 옛 값(예: 특송·기타)은 맨 앞에 끼워 안 잃는다. 새 곡(빈 값)은 첫 항목(찬양대)이 된다.
const CATS = ["찬양대", "찬양팀", "중창단", "특별찬양"];
const catOpts = (sel) => (sel && !CATS.includes(sel) ? [sel, ...CATS] : CATS)
  .map((c) => `<option${c === sel ? " selected" : ""}>${esc(c)}</option>`).join("");

export async function render(el, { me, call }) {
  const isSuper = !!(me && (me.roles || []).includes("super"));
  el.innerHTML = TITLE + `
    <div class="acts" style="margin-bottom:12px"><button class="btn primary" data-tab="list">곡 목록</button><button class="btn" data-tab="new">새 곡</button><button class="btn" data-tab="use">사용 현황</button></div>
    <div id="pr-body"></div>`;
  const body = el.querySelector("#pr-body");
  let songs = [];

  async function loadList() {
    body.innerHTML = `<p class="muted">불러오는 중…</p>`;
    const r = await call("adminList");
    if (!r.ok) { body.innerHTML = `<p class="muted">${esc(errorText(r))}</p>`; return; }
    songs = (r.songs || []).map((s) => ({ ...s, song: nfc(s.song), choir: nfc(s.choir) }))
      // 예배일 최근순 — 날짜 없는 곡은 맨 뒤(화면에서만 정렬 · 서버·성도님 앱은 그대로)
      .sort((a, b) => (b.svc_date || "").localeCompare(a.svc_date || ""));
    body.innerHTML = `<div class="acts"><button class="btn" id="pr-refresh">조회수 새로고침(전곡)</button></div>
      <p class="muted">${songs.length}곡</p>` + songs.map((s) => `
      <div class="card" data-id="${esc(s.id)}">
        <div><b>${esc(s.song)}</b> <span class="muted">${esc(s.choir || "")}${s.category ? " · " + esc(s.category) : ""}${s.svc_date ? " · " + esc(String(s.svc_date).slice(0, 10)) : ""}${s.views != null ? " · 조회 " + esc(Number(s.views).toLocaleString("ko-KR")) : ""}</span></div>
        <div class="acts"><button class="btn" data-act="edit">수정</button>${isSuper ? `<button class="btn danger" data-act="del">삭제</button>` : ""}</div>
        <div class="pr-edit" hidden></div>
      </div>`).join("");
    body.querySelector("#pr-refresh").addEventListener("click", async () => {
      const go = await dialog({ title: "전곡 조회수를 새로고침할까요?", text: "유튜브에서 다시 가져와요(시간이 걸려요).", ok: "새로고침", cancel: "그만두기" });
      if (!go) return;
      await busy(el, async () => { const r = await call("refreshViews", { ids: songs.map((s) => s.id) }); toast(r.ok ? `${(r.updated || []).length}곡 갱신` : errorText(r)); if (r.ok) loadList(); });
    });
    body.querySelectorAll('[data-act="edit"]').forEach((b) => b.addEventListener("click", () => openEdit(b.closest(".card"), songs.find((x) => String(x.id) === b.closest(".card").dataset.id))));
    body.querySelectorAll('[data-act="del"]').forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest(".card").dataset.id;
      const go = await dialog({ title: "곡을 삭제할까요?", text: "", ok: "삭제", cancel: "그만두기", danger: true });
      if (!go) return;
      await busy(el, async () => { const r = await call("deleteSong", { id }); toast(r.ok ? "삭제했어요." : errorText(r)); if (r.ok) loadList(); });
    }));
  }

  function songForm(s) {
    return `<div class="ma-grid" style="margin-top:8px">
      <label class="field"><span>영상 ID</span><input data-f="id" value="${esc(s.id || "")}" ${s.id ? "readonly" : ""}></label>
      <label class="field"><span>제목</span><input data-f="song" value="${esc(nfc(s.song))}"></label>
      <label class="field"><span>찬양대</span><input data-f="choir" value="${esc(nfc(s.choir))}"></label>
      <label class="field"><span>분류</span><select data-f="category">${catOpts(nfc(s.category))}</select></label>
      <label class="field"><span>예배일</span><input data-f="svc_date" type="date" value="${esc(s.svc_date || "")}"></label>
    </div>`;
  }
  const readForm = (box, base) => {
    const o = { ...base };
    box.querySelectorAll("[data-f]").forEach((i) => { o[i.dataset.f] = i.dataset.f === "id" ? i.value : nfc(i.value); });
    return o;
  };
  async function saveSong(box, base) {
    const song = readForm(box, base);
    if (!song.id || !song.song) { toast("영상 ID·제목을 확인해 주세요."); return; }
    await busy(el, async () => { const r = await call("saveSong", { song }); toast(r.ok ? "저장했어요." : errorText(r)); if (r.ok) { tabs.list(); markTab("list"); } });
  }
  function openEdit(card, s) {
    const box = card.querySelector(".pr-edit"); box.hidden = false;
    box.innerHTML = songForm(s) + `<button class="btn primary" data-act="save" style="margin-top:12px">저장</button>`;
    box.querySelector('[data-act="save"]').addEventListener("click", () => saveSong(box, s));
  }

  function newHtml() {
    body.innerHTML = `<div class="card">
      <label class="field"><span>유튜브 주소 또는 영상 ID</span><input id="pr-url" placeholder="https://youtu.be/..."></label>
      <button class="btn" id="pr-fetch">유튜브에서 가져오기</button>
      <div id="pr-newform"></div>
    </div>`;
    body.querySelector("#pr-fetch").addEventListener("click", async () => {
      const q = body.querySelector("#pr-url").value;
      await busy(el, async () => {
        const r = await call("ytFetch", { url: q, id: vidOf(q) });
        if (!r.ok) { toast(errorText(r)); return; }
        const m = r.meta || {};
        // ⚠️ ytFetch 의 썸네일·재생시간을 seed 에 담아 둔다 — 저장(upsert)이 폼에 없는 칸을 0/null 로 덮으므로,
        //    안 담으면 새 곡이 썸네일 없이·재생시간 0 으로 저장된다(성도님 앱에서 썸네일이 빈다).
        const seed = { id: m.id || vidOf(q), song: nfc(m.song), choir: "", category: "", svc_date: m.svc_date || "",
          thumbnail: m.thumbnail || null, duration: m.duration || null, duration_sec: m.duration_sec || 0 };
        const nf = body.querySelector("#pr-newform");
        nf.innerHTML = songForm(seed) + `<button class="btn primary" data-act="save" style="margin-top:12px">곡 저장</button>`;
        nf.querySelector('[data-act="save"]').addEventListener("click", () => saveSong(nf, seed));
      });
    });
  }

  async function useHtml() {
    body.innerHTML = `<p class="muted">불러오는 중…</p>`;
    const r = await call("usageStats");
    if (!r.ok) { body.innerHTML = `<p class="muted">${esc(errorText(r))}</p>`; return; }
    const st = r.stats;
    body.innerHTML = `<div class="card"><pre style="white-space:pre-wrap;font-size:13px;margin:0">${esc(JSON.stringify(st, null, 2))}</pre></div>`;
  }

  const tabs = { list: loadList, new: newHtml, use: useHtml };
  const markTab = (k) => el.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("primary", x.dataset.tab === k));
  el.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { markTab(b.dataset.tab); tabs[b.dataset.tab](); }));
  tabs.list();
}
