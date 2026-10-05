// 🎓 수료증 한 장 — 순수(글자만 만든다 · DOM 없음 · tests/edu-certs-logic.test.mjs) · 인쇄·인쇄 미리보기·「수료증 설정」 미리보기가 같은 틀.
//   (교육신청 3단계 · 2026-10-05 · 계획 v2 docs/superpowers/plans/2026-10-05-education-stage3-certificates.md 「수료증 템플릿 한 곳」)
//   칸: 교회 로고 · 「수 료 증」 · 수료번호(왼쪽 위) · 성명 · 과정(제목 · 학기) · 기간 · 문안(서버가 {과정}을 채워 준 글) · 발급일 · 발급 명의 + 직인.
//   자리·크기는 모두 CERT_GEOM(수료증 폭의 % = cqw) 한 곳 — 화면 css 는 글꼴·색·정렬만 둔다(.ec-cert…).
// ⚠️ CERT_GEOM 은 성경암송 js/edu.js 의 EDU_CERT_GEOM 과 **같은 값**이다 — 앱 「수료증 보기」가 같은 자리에 캔버스로 그린다.
//    두 저장소 시험에 같은 지문(JSON sha256)이 박혀 있다. 자리를 고치면 두 곳을 함께 고치고 두 지문을 함께 바꾼다.
// ⚠️ 서버 글자(이름·제목·명의·문안)는 모두 esc · 직인은 PNG·JPEG data URL 꼴일 때만 <img> 로(다른 주소는 싣지 않는다).
import { esc } from "../../core/ui.js";

export const CERT_GEOM = {
  ratio: 0.7071,                                   // 높이 ÷ 폭(A4 가로 210 ÷ 297)
  frame: 3.2, frameW: 0.3, gap: 0.6, innerW: 0.1, // 겹테두리 — 바깥 굵은 줄 · 안쪽 가는 줄
  noTop: 6, noLeft: 6.6, noSize: 1.3,              // 「제 고척-2026-0001 호」(왼쪽 위)
  logoTop: 6.4, logoH: 7.8,                        // 교회 로고(가운데)
  titleTop: 16, titleSize: 5, titleTrack: 0.35,    // 「수료증」 — 글자 사이 0.35em
  mainTop: 24.6, mainBottom: 51, mainW: 64, mainGap: 2.4,   // 가운데 덩이(성명·과정·기간 → 문안)를 이 칸의 가운데에
  infoSize: 2, nameSize: 2.5, infoLH: 1.45, infoGap: 0.7, labelEm: 4.2, colGap: 2.2,
  bodyLH: 1.85, bodySizes: [2.2, 2, 1.8, 1.6, 1.45, 1.3, 1.15],   // 문안이 길면 한 단계씩 작게(certBodySize · 300자도 들어간다)
  dateTop: 53, dateSize: 2,                        // 발급일
  issTop: 57.6, issSize: 2.6, issTrack: 0.1,       // 발급 명의
  sealH: 8.6, sealIn: 0.3,                         // 직인 — 명의 끝에 직인 폭의 30% 를 겹쳐 찍는다
};
export const CERT_LOGO = "img/logo-gocheok.png";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// "2026-12-13" → 「2026년 12월 13일」 · 틀린 값은 빈 글
export function certYmd(d) {
  const m = DATE_RE.exec(String(d || ""));
  if (!m) return "";
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(t) || t.getUTCDate() !== +m[3]) return "";
  return `${+m[1]}년 ${+m[2]}월 ${+m[3]}일`;
}
// 기간 한 줄 — 「2026년 10월 25일 ~ 2026년 12월 13일」(증서라 두 끝 모두 해를 적는다) · 같은 날이면 하루 · 한쪽만 있으면 그쪽만
export function certPeriod(from, to) {
  const a = certYmd(from), b = certYmd(to);
  if (a && b) return a === b ? a : `${a} ~ ${b}`;
  if (a) return `${a} ~`;
  return b ? `~ ${b}` : "";
}
// 과정 한 줄 — 「구원론 3차 (2026 하반기)」
export const certCourseText = (title, term) => `${String(title || "").trim()}${String(term || "").trim() ? ` (${String(term).trim()})` : ""}`;

// 글자 폭 어림(em) — 한글·한자·전각 1 · 빈칸 0.3 · 영문·숫자 0.55 · 그 밖 0.8. 문안 크기 고르기·줄 수 어림에만 쓴다.
export function certTextEm(s) {
  let w = 0;
  for (const ch of String(s || "")) {
    const c = ch.codePointAt(0);
    if (ch === " ") w += 0.3;
    else if (c >= 0x20 && c < 0x7f) w += 0.55;
    else if ((c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xffef) || c >= 0x20000) w += 1;
    else w += 0.8;
  }
  return w;
}
// 폭 maxW(cqw)·글자 크기 size(cqw)에서 글이 몇 줄이 되나 — 띄어쓰기 자리에서 끊는(keep-all) 몫으로 한 줄의 92% 만 채운다고 어림한다
export function certLines(text, size, maxW) {
  const per = (maxW / size) * 0.92;
  return String(text || "").split("\n").reduce((n, para) => n + Math.max(1, Math.ceil(certTextEm(para.trim()) / per)), 0);
}
// 성명·과정·기간 덩이 높이(cqw) — 과정이 길면 두 줄 이상
export function certInfoHeight(c) {
  const g = CERT_GEOM;
  const valW = g.mainW - g.labelEm * g.infoSize - g.colGap;
  const rows = [g.nameSize * g.infoLH, certLines(certCourseText(c?.title, c?.term), g.infoSize, valW) * g.infoSize * g.infoLH];
  if (certPeriod(c?.from, c?.to)) rows.push(g.infoSize * g.infoLH);
  return rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * g.infoGap;
}
// 문안 글자 크기(cqw) — 가운데 칸에 들어가는 가장 큰 단계(넘치면 가장 작은 단계) · 앱 캔버스도 같은 단계에서 고른다
export function certBodySize(c) {
  const g = CERT_GEOM;
  const room = g.mainBottom - g.mainTop - certInfoHeight(c) - g.mainGap;
  for (const s of g.bodySizes) if (certLines(c?.body, s, g.mainW) * s * g.bodyLH <= room) return s;
  return g.bodySizes[g.bodySizes.length - 1];
}

const SEAL_SRC = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
export const sealSrc = (s) => (typeof s === "string" && SEAL_SRC.test(s) ? s : "");
const n = (v) => +v.toFixed(3);   // 0.30000000000000004 같은 글이 style 에 나가지 않게
const cq = (v) => `${n(v)}cqw`;

// 수료증 한 장 HTML — c = {name, title, term, from, to, certNo, issuedOn, issuer, body(채운 글), seal}
export function certHtml(c) {
  const g = CERT_GEOM, x = c || {};
  const period = certPeriod(x.from, x.to), seal = sealSrc(x.seal), issued = certYmd(x.issuedOn);
  // 칸 이름은 글자 사이에 빈칸을 두고 양쪽 맞춤(text-align-last:justify) — 「성      명」처럼 칸 폭(labelEm)을 채운다
  const info = [["성 명", `<dd class="ec-cert-name" style="font-size:${cq(g.nameSize)}">${esc(x.name)}</dd>`],
    ["과 정", `<dd>${esc(certCourseText(x.title, x.term))}</dd>`],
    ...(period ? [["기 간", `<dd>${esc(period)}</dd>`]] : [])]
    .map(([k, v]) => `<dt>${k}</dt>${v}`).join("");
  return `<div class="ec-cert" role="img" aria-label="${esc(`수료증 — ${x.name || ""} · ${x.title || ""}`)}">` +
    `<div class="ec-cert-frame" style="inset:${cq(g.frame)};border-width:${cq(g.frameW)}"><i style="inset:${cq(g.gap)};border-width:${cq(g.innerW)}"></i></div>` +
    (x.certNo ? `<div class="ec-cert-no" style="top:${cq(g.noTop)};left:${cq(g.noLeft)};font-size:${cq(g.noSize)}">제 ${esc(x.certNo)} 호</div>` : "") +
    `<img class="ec-cert-logo" src="${CERT_LOGO}" alt="" style="top:${cq(g.logoTop)};height:${cq(g.logoH)}">` +
    `<div class="ec-cert-title" style="top:${cq(g.titleTop)};font-size:${cq(g.titleSize)};letter-spacing:${g.titleTrack}em;padding-left:${g.titleTrack}em">수료증</div>` +
    `<div class="ec-cert-main" style="top:${cq(g.mainTop)};height:${cq(g.mainBottom - g.mainTop)};width:${cq(g.mainW)};margin-left:${cq(-g.mainW / 2)};gap:${cq(g.mainGap)}">` +
      `<dl class="ec-cert-info" style="font-size:${cq(g.infoSize)};line-height:${g.infoLH};row-gap:${cq(g.infoGap)};column-gap:${cq(g.colGap)};grid-template-columns:${g.labelEm}em minmax(0,auto)">${info}</dl>` +
      `<p class="ec-cert-body" style="font-size:${cq(certBodySize(x))};line-height:${g.bodyLH}">${esc(x.body)}</p>` +
    `</div>` +
    (issued ? `<div class="ec-cert-date" style="top:${cq(g.dateTop)};font-size:${cq(g.dateSize)}">${esc(issued)}</div>` : "") +
    `<div class="ec-cert-iss" style="top:${cq(g.issTop)};font-size:${cq(g.issSize)};letter-spacing:${g.issTrack}em"><span>${esc(x.issuer)}` +
      (seal ? `<img class="ec-cert-seal" src="${seal}" alt="" style="height:${cq(g.sealH)};transform:translate(-${n(g.sealIn * 100)}%,-50%)">` : "") +
    `</span></div></div>`;
}
