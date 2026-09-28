// 카카오 로그인(Supabase Auth). 세션은 이 브라우저에 남아 매번 카카오를 거치지 않는다.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";

export const sb = createClient(window.SUPA.URL, window.SUPA.ANON, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
    storageKey: "church-admin-auth" },
});

export async function currentSession() {
  const { data } = await sb.auth.getSession();
  return data?.session ?? null;
}

// 카카오를 거치면 # 뒤가 사라진다 — 보던 화면을 적어 두었다가 돌아와서 연다
// forceLogin: 카카오에 「다른 계정으로 로그인」을 요청한다(카카오 세션이 남아 자동으로 같은 계정으로 돌아오지 않게)
export async function signInWithKakao(forceLogin = false) {
  try { sessionStorage.setItem("ca-return", location.hash || ""); } catch { /* 사생활 보호 모드 */ }
  const options = { redirectTo: location.origin + location.pathname };
  if (forceLogin) options.queryParams = { prompt: "login" };
  const { error } = await sb.auth.signInWithOAuth({ provider: "kakao", options });
  if (error) throw error;
}

export function takeReturnHash() {
  try {
    const h = sessionStorage.getItem("ca-return") || "";
    sessionStorage.removeItem("ca-return");
    return h;
  } catch { return ""; }
}

export async function signOut() {
  // scope 기본값(global)은 PC 에서 로그아웃하면 폰 세션까지 폐기한다 — 이 브라우저만 끊는다
  await sb.auth.signOut({ scope: "local" });
}
