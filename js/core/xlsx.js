// 엑셀(.xlsx·.xls) 읽는 도구 SheetJS 를 부르는 **한 곳** — 📤 명단 올리기(bibleevent/upload.js)·📋 종이 명단 올리기(ministry/paper.js)가
// 함께 쓴다(FE-6 · 2026-09-30 · 두 화면의 loadXlsx 사본을 합쳤다).
// .xlsx 는 압축 파일이라 브라우저가 혼자 못 읽는다 — 파일을 고를 때만 <script> 로 받는다(처음 화면에는 안 싣는다).
//
// 파일은 **우리 사이트에 둔다**(vendor/ — deploy.yml 이 _site 로 복사한다). 받은 곳: XLSX_SOURCE
//   (https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js · 같은 판 tarball 의 dist 파일과 바이트까지 같다).
//   예전에는 jsdelivr 의 xlsx@0.18.5 를 integrity 없이 불렀다 — 그 판에는 CVE-2023-30533(프로토타입 오염)·CVE-2024-22363(느린 정규식)이 있다.
//   npm 의 xlsx 는 0.18.5 에서 멈췄다(0.19 부터 SheetJS 는 자기 CDN 에만 낸다) — 그래서 npm·jsdelivr 로는 새 판을 못 받는다.
// integrity 는 내려받은 파일로 계산했다: openssl dgst -sha384 -binary <파일> | openssl base64 -A
//   파일이 한 바이트라도 다르면 브라우저가 돌리지 않는다(→ no-cdn). tests/xlsx-loader.test.mjs 가 저장소 파일과 맞는지 본다.
// ⚠️ 판을 올릴 때: 새 파일을 **새 이름**(vendor/xlsx-<판>.full.min.js)으로 넣고 옛 파일을 지운 뒤 아래 셋(판·integrity·받은 곳은 판에서 나온다)을 함께 바꾼다.
//   이름에 판을 넣는 까닭 — Pages 가 10분 캐시하는 동안 옛 파일이 새 integrity 로 불려 막히지 않게.
// ⚠️ 줄바꿈을 바꾸면 해시가 달라진다 — .gitattributes 가 vendor/ 를 -text 로 둔다(윈도 autocrlf).
// 못 받으면 까닭 둘 — no-cdn(망이 막힘 · 파일 없음 · integrity 어긋남) · no-xlsx(받았는데 XLSX 가 없음).
//   이름은 옛 그대로 둔다 — upload-logic.js fileErrorText 와 두 화면이 이 이름으로 「복사해 붙여넣어 주세요」 길을 안내한다.
export const XLSX_VERSION = "0.20.3";
export const XLSX_FILE = `vendor/xlsx-${XLSX_VERSION}.full.min.js`;   // 사이트 뿌리 기준
export const XLSX_INTEGRITY = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";
export const XLSX_SOURCE = `https://cdn.sheetjs.com/xlsx-${XLSX_VERSION}/package/dist/xlsx.full.min.js`;

// 이 모듈(js/core/xlsx.js?v=…)에서 두 칸 올라가면 사이트 뿌리 — 주소 뒤 #/메뉴 와 상관없이, 하위 경로에 올려도 맞는다
export const xlsxUrl = (moduleUrl = import.meta.url) => new URL("../../" + XLSX_FILE, moduleUrl).href;

export function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.integrity = XLSX_INTEGRITY;
    s.crossOrigin = "anonymous";
    s.src = xlsxUrl();
    s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error("no-xlsx")));
    s.onerror = () => rej(new Error("no-cdn"));
    document.head.appendChild(s);
  });
}
