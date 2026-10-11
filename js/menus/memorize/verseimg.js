// 🖼️ 연상 그림 — 그 주 암송 구절의 그림(장면을 고르면 AI 가 그려요). 성경암송 api 프록시.
//   verseImgList·verseImgScenes(Claude 장면 제안)·verseImgGenerate(Gemini 생성)·verseImgAlt·verseImgSave·verseImgHide.
//   역할 content. ⚠️ 생성은 Gemini 비용 — 하루 한도는 성경암송 api 에 그대로(여기선 안 건드림).
//   2026-10-11 고침(첫 실사용에서 막혔다):
//   ① 그리기가 22~26초인데 서버 중계가 15초에 끊어 그림이 사라졌다 → 서버 MEM_SLOW_MS(140초).
//   ② 「저장」이 그림을 안 보냈다 — api verseImgSave 는 **줄인 그림(WebP/JPEG · 500KB 이하) + 한국어 설명**이 있어야 받는다.
//      성경암송 admin-stats ③(viShrink)과 같게 긴 변 1080 · WebP 0.78(안 되면 JPEG 0.85)로 줄여 보낸다.
//   ③ 설명은 AI(verseImgAlt)가 한국어로 제안 · 짝 그림(b·c)은 「구아슈·색연필 화풍 — 」로 시작(옛 관례).
//   ④ 확인표 여섯 칸을 다 체크해야 저장(성경암송 VI_CHECKS 와 같은 글).
//   ⑤ 저장된 그림 목록은 api 가 주는 `images[].{verseNo,slot,url,alt,hidden}` 를 읽는다(전에는 verse_no 를 읽어 번호가 비었다) ·
//      숨기기는 `hidden` 을 보낸다(전에는 안 보내 실제로는 숨지 않았다).
//   ⑥ 고르기는 <select> 대신 단추(이 저장소 규칙 — 폰에서 시스템 창이 뜬다).
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">🖼️ 연상 그림</h2>`;
export const SLOTS = [["a", "대표"], ["b", "넓게"], ["c", "가까이"]];
export const PAIR_PRE = "구아슈·색연필 화풍 — ";
export const CHECKS = ["글자·서명·낙관이 없다", "사람(손·발·뒷모습 포함)이 없다", "액자·카드처럼 네모나게 잘리지 않았다",
  "종이를 찍은 사진처럼 보이지 않는다", "이젤·스케치북·책이 없다", "구절의 뜻과 맞다(다른 종교 상징이 없다)"];
const slotName = (s) => (SLOTS.find(([v]) => v === s) || [s, s])[1];

// 짝 그림 설명은 앞머리를 붙인다(이미 있으면 그대로) · 대표는 앞머리를 떼어 낸다
export function altFor(slot, alt) {
  const t = String(alt || "").trim().replace(/^구아슈·색연필 화풍\s*—\s*/, "");
  return slot === "a" ? t : PAIR_PRE + t;
}
// 저장해도 되나 — 확인표를 다 채웠고 설명이 앞머리만이 아닌가
export function canSave(checkedCount, slot, alt) {
  const a = String(alt || "").trim();
  if (checkedCount < CHECKS.length || !a || a.length > 80) return false;
  return slot === "a" || a !== PAIR_PRE.trim();
}

// 브라우저가 긴 변 1080px 로 줄인다 — WebP(0.78), 못 만들면 JPEG(0.85). 성경암송 admin-stats viShrink 와 같다.
async function shrink(b64, mime) {
  const img = new Image(); img.src = `data:${mime};base64,${b64}`; await img.decode();
  const k = Math.min(1, 1080 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const toBlob = (t, q) => new Promise((r) => c.toBlob(r, t, q));
  let blob = await toBlob("image/webp", 0.78);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.85);   // 사파리 등
  const out = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
  return { b64: out, mime: blob.type, bytes: blob.size };
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `
    <p class="muted">구절 번호를 넣고 <b>장면 제안</b>을 받은 뒤, 장면을 골라 그려 보세요. 한 장에 20~30초 걸려요.
      확인표를 다 보고 <b>저장</b>하면 바로 성도님 앱에 보여요. 한 구절에 <b>대표</b> 한 장이 있어야 보이고, <b>넓게</b>·<b>가까이</b>는 짝 그림이에요.</p>
    <div class="acts">
      <input id="vi-no" inputmode="numeric" maxlength="3" placeholder="구절 번호" class="search" style="max-width:140px;margin:0">
      ${SLOTS.map(([v, l]) => `<button class="btn${v === "a" ? " primary" : ""}" data-slot="${v}" aria-pressed="${v === "a"}">${l}</button>`).join("")}
      <button class="btn" id="vi-scenes">장면 제안</button>
    </div>
    <p id="vi-status" class="muted"></p>
    <div id="vi-scenelist"></div>
    <div id="vi-preview"></div>
    <div id="vi-have"></div>`;

  const $ = (id) => el.querySelector("#" + id);
  const no = () => Number($("vi-no").value);
  let slot = "a", lastScene = "", gen = null;   // gen = { b64, mime, sceneEn, slot } — 검수한 그 그림이 저장되게 여기만 쓴다

  el.querySelectorAll("[data-slot]").forEach((b) => b.addEventListener("click", () => {
    slot = b.dataset.slot;
    el.querySelectorAll("[data-slot]").forEach((x) => { const on = x.dataset.slot === slot; x.classList.toggle("primary", on); x.setAttribute("aria-pressed", String(on)); });
    if (gen) { $("vi-preview").innerHTML = ""; gen = null; $("vi-status").textContent = `「${slotName(slot)}」(으)로 바꿨어요 — 장면을 골라 다시 그려 주세요.`; }
  }));

  async function loadScenes() {
    if (!no()) { $("vi-status").textContent = "구절 번호를 넣어 주세요."; return; }
    $("vi-scenelist").innerHTML = ""; $("vi-preview").innerHTML = ""; gen = null;
    $("vi-status").textContent = "장면을 짓는 중… (10초쯤)";
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
    lastScene = sceneKo; gen = null; $("vi-preview").innerHTML = "";
    const forSlot = slot;
    $("vi-status").textContent = `「${slotName(forSlot)}」 그림을 그리는 중… 20~30초 걸려요. 창을 닫지 말아 주세요.`;
    await busy(el, async () => {
      const r = await call("verseImgGenerate", { verseNo: no(), slot: forSlot, sceneKo });
      if (!r.ok) { $("vi-status").textContent = errorText(r); return; }
      let s;
      try { s = await shrink(r.image, r.mime || "image/png"); }
      catch (_) { $("vi-status").textContent = "그림을 줄이지 못했어요 — 다시 그려 주세요."; return; }
      gen = { b64: s.b64, mime: s.mime, sceneEn: r.sceneEn || "", slot: forSlot };
      $("vi-status").textContent = `그렸어요(${Math.round(s.bytes / 1024)}KB).${r.left != null ? ` 오늘 이 구절에 ${r.left}장 더 그릴 수 있어요.` : ""} 확인표를 보고 저장해 주세요.`;
      $("vi-preview").innerHTML = `<div class="card">
        <img src="data:${esc(s.mime)};base64,${s.b64}" alt="미리보기" style="max-width:100%;border-radius:10px">
        <div style="margin-top:10px"><b>확인표</b> — 하나라도 아니면 「다시 그리기」</div>
        ${CHECKS.map((c, i) => `<label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" data-ck="${i}"> ${esc(c)}</label>`).join("")}
        <label class="field" style="margin-top:8px"><span>설명(성도님 화면에 붙는 글 · 80자까지)</span><input id="vi-alt" maxlength="80" placeholder="AI 가 설명을 짓는 중…"></label>
        <div class="acts"><button class="btn primary" id="vi-save" disabled>이 그림 저장(${esc(slotName(forSlot))})</button><button class="btn" id="vi-regen">다시 그리기</button></div></div>`;
      const update = () => { const n = $("vi-preview").querySelectorAll("[data-ck]:checked").length; $("vi-save").disabled = !canSave(n, forSlot, $("vi-alt").value); };
      $("vi-preview").querySelectorAll("[data-ck]").forEach((x) => x.addEventListener("change", update));
      $("vi-alt").addEventListener("input", update);
      $("vi-save").addEventListener("click", save);
      $("vi-regen").addEventListener("click", () => generate(lastScene));
      // 설명 제안(한국어) — 실패해도 손으로 적으면 된다
      call("verseImgAlt", { verseNo: no(), image: s.b64, mime: s.mime }).then((a) => {
        const inp = $("vi-alt"); if (!inp || inp.value) return;
        inp.value = a && a.ok && a.alt ? altFor(forSlot, a.alt) : (forSlot === "a" ? "" : PAIR_PRE);
        inp.placeholder = "그림을 한 줄로 설명해 주세요"; update();
      }).catch(() => { const inp = $("vi-alt"); if (inp) inp.placeholder = "그림을 한 줄로 설명해 주세요"; });
    });
  }

  async function save() {
    if (!gen) return;
    const alt = altFor(gen.slot, $("vi-alt").value);
    const go = await dialog({ title: `${no()}번 「${slotName(gen.slot)}」 그림을 저장할까요?`, text: "저장하면 바로 성도님 앱에 보여요. 같은 칸에 그림이 있으면 바뀌어요.", ok: "저장", cancel: "그만두기" });
    if (!go) return;
    await busy(el, async () => {
      const r = await call("verseImgSave", { verseNo: no(), slot: gen.slot, image: gen.b64, mime: gen.mime, alt, sceneKo: lastScene, sceneEn: gen.sceneEn });
      if (r.ok) { toast("저장했어요."); $("vi-status").textContent = "저장했어요 — 성도님 화면에 보여요."; $("vi-preview").innerHTML = ""; gen = null; loadHave(); }
      else $("vi-status").textContent = errorText(r);
    });
  }

  async function loadHave() {
    const r = await call("verseImgList");
    if (!r.ok) { $("vi-have").innerHTML = ""; return; }
    const rows = Array.isArray(r.images) ? r.images : [];
    if (!rows.length) { $("vi-have").innerHTML = ""; return; }
    $("vi-have").innerHTML = `<h3 style="font-size:14px;font-weight:800;color:var(--navy);margin:16px 0 8px">저장된 그림</h3>`
      + rows.slice(0, 60).map((x) => `<div class="card" style="display:flex;gap:10px;align-items:center">
        ${x.url ? `<img src="${esc(x.url)}" alt="" loading="lazy" style="width:96px;border-radius:8px;flex:none${x.hidden ? ";opacity:.4" : ""}">` : ""}
        <div style="flex:1"><b>${esc(x.verseNo)}번 · ${esc(slotName(x.slot))}</b>${x.hidden ? ` <span class="muted">· 숨김</span>` : ""}
          <div class="muted">${esc(x.alt || "")}</div>
          <div class="acts"><button class="btn" data-hide="${esc(x.verseNo)}" data-slot="${esc(x.slot)}" data-to="${x.hidden ? "0" : "1"}">${x.hidden ? "다시 보이기" : "숨기기"}</button></div></div></div>`).join("");
    $("vi-have").querySelectorAll("[data-hide]").forEach((b) => b.addEventListener("click", async () => {
      const hide = b.dataset.to === "1";
      const go = await dialog({ title: hide ? "그림을 숨길까요?" : "그림을 다시 보이게 할까요?", text: hide ? "성도님 앱에서 안 보여요(지우지는 않아요)." : "", ok: hide ? "숨기기" : "보이기", cancel: "그만두기" });
      if (!go) return;
      await busy(el, async () => { const r2 = await call("verseImgHide", { verseNo: Number(b.dataset.hide), slot: b.dataset.slot, hidden: hide }); toast(r2.ok ? (hide ? "숨겼어요." : "다시 보이게 했어요.") : errorText(r2)); if (r2.ok) loadHave(); });
    }));
  }

  $("vi-scenes").addEventListener("click", loadScenes);
  loadHave();
}
