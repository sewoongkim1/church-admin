// 새가족 사진 — 찍기·줄이기·올리기·보기(2026-10-07 · 설계 v2 §4 「사진」)
//   카드 사진(입력 대조용) · 환영 사진(선택) — 보관만 한다. 비공개 칸이라 볼 때마다 서버가 5분짜리 주소를 만든다(nfPhotoUrl).
// ⚠️ 올리기 전에 **캔버스에 다시 그린다** — 긴 변 1600px 로 줄이고, 그 과정에서 위치 정보(EXIF)가 떨어진다. 원본 파일을 그대로 보내지 않는다.
import { esc, dialog, errorText } from "../../core/ui.js";
import { nfWord, shrinkSize } from "./nf-logic.js";

export const PHOTO_LABEL = { card: "카드 사진", welcome: "환영 사진" };
const MAX_BYTES = 1400000;   // 서버는 1.5MB 까지 받는다

// 사진 고르기(폰은 카메라가 바로 뜬다) → File 또는 null
export function pickPhoto() {
  return new Promise((resolve) => {
    const i = document.createElement("input");
    i.type = "file";
    i.accept = "image/*";
    i.capture = "environment";
    i.addEventListener("change", () => resolve(i.files && i.files[0] ? i.files[0] : null), { once: true });
    i.addEventListener("cancel", () => resolve(null), { once: true });
    i.click();
  });
}

// File → base64 JPEG(줄이고 다시 그린 것). 못 읽으면 null.
export async function shrinkToJpeg(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { return null; }
  const { w, h } = shrinkSize(bmp.width, bmp.height);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  cv.getContext("2d").drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  for (const q of [0.82, 0.65, 0.5]) {
    const blob = await new Promise((res) => cv.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= MAX_BYTES) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(bin);
    }
  }
  return null;
}

// 찍어서 올리기 → true(올림) · false(그만둠·실패 — 실패는 창으로 알린다)
export async function takeAndUpload(call, cardId, which) {
  const file = await pickPhoto();
  if (!file) return false;
  const data = await shrinkToJpeg(file);
  if (!data) { await dialog({ text: nfWord("bad-photo"), cancel: null }); return false; }
  const r = await call("nfPhotoPut", { card_id: cardId, which, data });
  if (!r.ok) { await dialog({ text: nfWord(r.error) || errorText(r), cancel: null }); return false; }
  return true;
}

// 보기 — 5분짜리 주소로 창에 띄운다(열 때마다 기록이 남는다)
export async function showPhoto(call, cardId, which) {
  const r = await call("nfPhotoUrl", { card_id: cardId, which });
  if (!r.ok) { await dialog({ text: nfWord(r.error) || errorText(r), cancel: null }); return; }
  await dialog({ title: PHOTO_LABEL[which] || "사진", html: `<img class="nf-photo" src="${esc(r.url)}" alt="${esc(PHOTO_LABEL[which] || "사진")}">`,
    ok: "닫기", cancel: null, cls: "nf-photo-dlg" });
}
