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
export async function signInWithKakao() {
  try { sessionStorage.setItem("ca-return", location.hash || ""); } catch { /* 사생활 보호 모드 */ }
  const { error } = await sb.auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo: location.origin + location.pathname },
  });
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
  await sb.auth.signOut();
}
