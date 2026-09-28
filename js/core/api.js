import { sb } from "./auth.js";

// 권한을 잃었을 때(로그인 풀림·정지·역할 회수) 부를 것 — main.js 가 정한다
let onLost = () => {};
export function setAuthLostHandler(fn) { onLost = fn; }
const LOST = new Set(["unauthenticated", "not-registered", "pending", "disabled", "forbidden"]);

// 서버 호출. **던지지 않는다** — 늘 { ok, … } 를 돌려준다.
//   { ok:true, … } 성공 · { ok:false, confirm, message } 되물을 것 · { ok:false, error, code? } 실패
export async function call(action, payload = {}) {
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) { onLost("unauthenticated"); return { ok: false, error: "unauthenticated" }; }
  let res;
  try {
    res = await fetch(window.SUPA.URL + "/functions/v1/church-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: window.SUPA.ANON, Authorization: "Bearer " + token },
      body: JSON.stringify({ ...payload, action }),
    });
  } catch { return { ok: false, error: "network" }; }
  const body = await res.json().catch(() => null);
  if (!body || typeof body !== "object") return { ok: false, error: "server", code: "HTTP " + res.status };
  if (body.ok === false && LOST.has(body.error) && action !== "me") onLost(body.error);
  return body;
}
