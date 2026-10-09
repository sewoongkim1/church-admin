// 🖼️ 연상 그림 — 그 주 암송 구절의 그림(장면을 고르면 AI 가 그려요). 성경암송 api 프록시.
//   verseImgList·verseImgScenes(Claude 장면 제안)·verseImgGenerate(Gemini 생성)·verseImgAlt·verseImgSave·verseImgHide.
//   역할 content. ⚠️ 생성은 Gemini 비용 — 하루 한도는 성경암송 api 에 그대로(여기선 안 건드림).
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🖼️ 연상 그림</h2>`;
const SLOTS = [["a", "A 화풍"], ["b", "B 화풍"], ["c", "C 화풍"]];

export async function render(el, { call }) {
  el.innerHTML = TITLE + `
    <p class="muted">구절 번호를 넣고 <b>장면 제안</b>을 받은 뒤, 장면·화풍을 골라 그려 보세요. 마음에 들면 저장해요.</p>
    <div class="acts">
      <input id="vi-no" inputmode="numeric" maxlength="3" placeholder="구절 번호" class="search" style="max-width:140px;margin:0">
      <select id="vi-slot">${SLOTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
      <button class="btn" id="vi-scenes">장면 제안</button>
    </div>
    <p id="vi-status" class="muted"></p>
    <div id="vi-scenelist"></div>
    <div id="vi-preview"></div>
    <div id="vi-have"></div>`;

  const $ = (id) => el.querySelector("#" + id);
  const no = () => Number($("vi-no").value);
  let lastScene = "", lastImg = null;

  async function loadScenes() {
    if (!no()) { $("vi-status").textContent = "구절 번호를 넣어 주세요."; return; }
    $("vi-scenelist").innerHTML = ""; $("vi-preview").innerHTML = "";
    await busy(el, async () => {
      const r = await call("verseImgScenes", { verseNo: no() });
      if (!r.ok) { $("vi-status").textContent = errorText(r); return; }
      const scenes = r.scenes || [];
      $("vi-status").textContent = `장면 ${scenes.length}개 — 하나 골라 그려 보세요.`;
      $("vi-scenelist").innerHTML = scenes.map((s, i) => `<div class="card vi-scene" data-i="${i}">
        <div>${esc(s)}</div><div class="acts"><button class="btn" data-gen>이 장면으로 그리기</button></div></div>`).join("");
      $("vi-scenelist").querySelectorAll("[data-gen]").forEach((btn, i) => btn.addEventListener("click", () => generate(scenes[i])));
    });
  }

  async function generate(sceneKo) {
    lastScene = sceneKo;
    await busy(el, async () => {
      const r = await call("verseImgGenerate", { verseNo: no(), slot: $("vi-slot").value, sceneKo });
      if (!r.ok) { $("vi-status").textContent = errorText(r); return; }
      lastImg = r;
      $("vi-status").textContent = `그렸어요. 오늘 ${r.left != null ? `${r.left}장 더 그릴 수 있어요` : ""}`;
      const src = String(r.image || "").startsWith("data:") ? r.image : `data:${r.mime || "image/png"};base64,${r.image}`;
      $("vi-preview").innerHTML = `<div class="card">
        <img src="${esc(src)}" alt="미리보기" style="max-width:100%;border-radius:10px">
        <label class="field" style="margin-top:8px"><span>설명(alt · 선택 — 비우면 AI 가 지어요)</span><input id="vi-alt" maxlength="200" value="${esc(r.sceneEn || "")}"></label>
        <div class="acts"><button class="btn primary" id="vi-save">이 그림 저장</button><button class="btn" id="vi-regen">다시 그리기</button></div></div>`;
      $("vi-save").addEventListener("click", save);
      $("vi-regen").addEventListener("click", () => generate(lastScene));
    });
  }

  async function save() {
    const alt = $("vi-alt") ? $("vi-alt").value : "";
    await busy(el, async () => {
      const r = await call("verseImgSave", { verseNo: no(), slot: $("vi-slot").value, alt });
      if (r.ok) { toast("저장했어요."); $("vi-status").textContent = "저장했어요 — 성도님 화면에 보여요."; loadHave(); }
      else $("vi-status").textContent = errorText(r);
    });
  }

  async function loadHave() {
    const r = await call("verseImgList");
    if (!r.ok) { $("vi-have").innerHTML = ""; return; }
    const rows = r.list || r.images || r.verses || [];
    if (!Array.isArray(rows) || !rows.length) { $("vi-have").innerHTML = ""; return; }
    $("vi-have").innerHTML = `<h3 style="font-size:14px;font-weight:800;color:var(--navy);margin:16px 0 8px">저장된 그림</h3>`
      + rows.slice(0, 60).map((x) => `<div class="card"><b>구절 ${esc(x.verse_no ?? x.no ?? "")}</b> <span class="muted">${esc(x.slot || "")}${x.hidden ? " · 숨김" : ""}${x.alt ? " · " + esc(x.alt) : ""}</span>
        <div class="acts"><button class="btn" data-hide="${esc(x.verse_no ?? x.no)}" data-slot="${esc(x.slot || "")}">숨기기</button></div></div>`).join("");
    $("vi-have").querySelectorAll("[data-hide]").forEach((b) => b.addEventListener("click", async () => {
      const go = await dialog({ title: "그림을 숨길까요?", text: "", ok: "숨기기", cancel: "그만두기" });
      if (!go) return;
      await busy(el, async () => { const r = await call("verseImgHide", { verseNo: Number(b.dataset.hide), slot: b.dataset.slot }); toast(r.ok ? "숨겼어요." : errorText(r)); if (r.ok) loadHave(); });
    }));
  }

  $("vi-scenes").addEventListener("click", loadScenes);
  loadHave();
}
