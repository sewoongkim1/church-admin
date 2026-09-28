// Supabase 연결 설정 (공개돼도 되는 값 — publishable key 는 RLS·권한으로 막힌다)
//
// ⚠️ 운영과 개발은 사람이 고르지 않는다. 주소를 보고 저절로 갈린다.
//      admin.onlybible.kr  →  운영
//      그 밖의 모든 주소     →  개발 (localhost · github.io · 미리보기)
//    모르는 주소를 개발로 두는 까닭: 잘못 갈렸을 때 「빈 화면」은 보이지만 「남의 기록을 바꾼 것」은 안 보인다.
(function () {
  var PROD = { URL: "https://xnomlgydifiqiybervtf.supabase.co", ANON: "sb_publishable_oLtieT_jw7Gjb8etEsy0jw_thBaDjl-" };
  var DEV = { URL: "https://ktpwthwqzgcqcrmsafdo.supabase.co", ANON: "sb_publishable_eJKP6u95IU9_DBXTvnvYBA_-yGCf-0Y" };
  var isProd = location.hostname === "admin.onlybible.kr";
  window.SUPA = { URL: isProd ? PROD.URL : DEV.URL, ANON: isProd ? PROD.ANON : DEV.ANON, env: isProd ? "prod" : "dev" };
  if (isProd) return;
  function mark() {
    if (document.getElementById("dev-env-mark")) return;
    var el = document.createElement("div");
    el.id = "dev-env-mark";
    el.textContent = "개발 DB";
    el.style.cssText = "position:fixed;top:0;right:0;z-index:2147483647;background:#b5891f;color:#fff;" +
      "font:700 11px/1 system-ui,sans-serif;padding:5px 9px;border-radius:0 0 0 8px;pointer-events:none;opacity:.9";
    document.body.appendChild(el);
  }
  if (document.body) mark(); else document.addEventListener("DOMContentLoaded", mark);
})();
