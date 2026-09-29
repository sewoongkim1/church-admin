// 카카오톡 안 브라우저 → 기본 브라우저(크롬·사파리)로 넘기기 (2026-09-29)
// 카카오톡으로 주소를 받아 누르면 카카오톡 안 브라우저에서 열린다. 카카오톡이 알아듣는 주소
// kakaotalk://web/openExternal 로 같은 주소를 기본 브라우저에 넘긴다(안드로이드·아이폰 모두).
// 순수 함수만 — node 시험이 그대로 부른다(tests/inapp.test.mjs).

export const isKakaoInApp = (ua = "") => /KAKAOTALK/i.test(ua);

export const externalUrl = (href) => "kakaotalk://web/openExternal?url=" + encodeURIComponent(href);

// 카카오톡 안 브라우저 닫기 — 아이폰과 안드로이드의 주소가 다르다
export const closeUrl = (ua = "") =>
  /iPhone|iPad|iPod/i.test(ua) ? "kakaoweb://closeBrowser" : "kakaotalk://inappbrowser/close";

// 로그인하고 돌아온 주소(?code=·?error=)는 넘기지 않는다 — PKCE 열쇠가 이 브라우저에만 있어
// 밖으로 넘기면 로그인이 이어지지 않는다. stay = 「카카오톡 안에서 그냥 볼게요」를 누른 탭.
export function shouldLeaveKakao({ ua, href, stay = false }) {
  if (stay || !isKakaoInApp(ua)) return false;
  const q = new URL(href).searchParams;
  return !q.has("code") && !q.has("error");
}
