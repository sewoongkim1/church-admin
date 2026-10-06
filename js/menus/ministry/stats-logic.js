// 📊 사역 통계 — 화면 논리(순수 함수 · DOM 없음 · tests/ministry-stats-logic.test.mjs 가 읽는다) · 2026-10-06
//   설계 v2 docs/superpowers/specs/2026-10-06-ministry-stats-design.md §7.
//   서버 ministryStats 응답(ministry-stats.ts buildStats):
//     { years, sourceDate, units: { 단위: { label, group, rows: [{ year, seats, people, multi, gap, prev, base, stay, back, first, firstEver, firstOther,
//       left, moved, rest, gone, keep, demo: null | { ageAvg, bands[6], sex[3], position[6] } }] } }, inner: { 단위: { mids, teams } }, meta }
//   수는 서버가 센 그대로 — 여기서는 글·차례·그림(SVG 글자)·엑셀 줄만 만든다. 줄을 다시 세지 않는다.
// ⚠️ 나이대·성별·직분 칸 이름과 「가린 칸」 값은 서버 ministry-stats.ts 와 같아야 한다(시험이 맞댄다).
import { esc } from "../../core/ui.js";

export const ALL = "all3";
export const MAIN = [ALL, "g:찬양", "g:교회학교", "g:그 밖"];   // 범위 단추(이 차례)
export const SIDE = ["g:목양", "g:기관"];                       // 따로
export const THREE = ["g:찬양", "g:교회학교", "g:그 밖"];
export const AGE_BANDS = ["39세까지", "40대", "50대", "60대", "70세부터", "모름"];
export const SEXES = ["남", "여", "모름"];
export const POSITIONS = ["장로", "안수집사", "권사", "집사", "그 밖", "모름"];
export const MASKED = -1;
export const MASK_TEXT = "5 미만";

export const nText = (v) => (v === null || v === undefined ? "" : Number(v).toLocaleString("ko-KR"));
export const pctText = (v) => (typeof v === "number" && Number.isFinite(v) ? `${v}%` : "—");
export const cellText = (v) => (v === MASKED ? MASK_TEXT : nText(v));
// 유지율 — 서버가 견준 해 봉사자 5명 미만이면 null 로 준다. strict(한 칸 요약)면 「명단 일부」인 해도 「—」.
export const keepText = (r, strict = false) => (!r || (strict && r.gap) ? "—" : pctText(r.keep));

const sum = (rows, k) => (rows || []).reduce((a, r) => a + (Number(r[k]) || 0), 0);
export const unitOf = (d, u) => (d && d.units && d.units[u]) || null;
// 그 단위가 속한 큰 분류 열쇠 — 계열이면 서버가 준 group, 큰 분류·전체면 자신
export const groupOf = (d, u) => (u && u.startsWith("f:") ? (unitOf(d, u) || {}).group || u : u);
// 범위 단추 — 재료에 있는 것만(목양·기관 줄이 없는 명단이면 단추도 없다)
export const tabUnits = (d) => ({ main: MAIN.filter((u) => unitOf(d, u)), side: SIDE.filter((u) => unitOf(d, u)) });
// 한 큰 분류 안의 계열 — 17년 자리 합이 많은 차례
export function familiesOf(d, groups) {
  const gs = new Set(Array.isArray(groups) ? groups : [groups]);
  return Object.keys((d && d.units) || {}).filter((u) => u.startsWith("f:") && gs.has(d.units[u].group))
    .sort((a, b) => sum(d.units[b].rows, "seats") - sum(d.units[a].rows, "seats") || a.localeCompare(b, "ko"));
}
// 계열 단추를 보일 큰 분류 — 계열이 둘 이상일 때만(찬양·교회학교는 계열이 하나라 안쪽 나눔으로 본다)
export const familyTabs = (d, u) => { const g = groupOf(d, u); if (!g || g === ALL) return []; const f = familiesOf(d, g); return f.length >= 2 ? f : []; };
// 카드에 올릴 해 — 그 단위에 자리가 있는 가장 늦은 해(기관은 2011년)
export const lastRow = (rows) => [...(rows || [])].reverse().find((r) => r.seats > 0) || null;

// 카드 넷 — [{ title, value, sub }]
export function cardsOf(rows) {
  const r = lastRow(rows);
  if (!r) return [];
  const has = r.prev !== null && r.prev !== undefined;
  return [
    { title: `${r.year}년 봉사자`, value: `${nText(r.people)}명`, sub: `자리 ${nText(r.seats)} · 두 자리 이상 ${nText(r.multi)}명` },
    { title: has && r.year - r.prev > 1 ? `${r.prev}년에도 한 분` : "작년에도 한 분", value: has ? keepText(r, true) : "—",
      sub: has ? `${r.prev}년 ${nText(r.base)}명 가운데 ${nText(r.stay)}명${r.gap ? " · 명단 일부" : ""}` : "견줄 해가 없어요" },
    { title: "처음 오신 분", value: has ? `${nText(r.first)}명` : "—", sub: has ? `사역이 처음 ${nText(r.firstEver)} · 다른 곳에서 ${nText(r.firstOther)}` : "" },
    { title: "돌아오신 분", value: has ? `${nText(r.back)}명` : "—", sub: has ? "쉬었다가 다시" : "" },
  ];
}

// 쌓은 막대(계속 · 돌아옴 · 처음) — SVG 글자. 명단 일부인 해는 빗금, 견줄 해가 없는 해는 회색. 숫자·해 글자는 모두 수라 esc 가 필요 없다.
export const CHART = { W: 940, H: 230, PAD: 28, BASE: 24, TOP: 30, C_STAY: "#1a3a6b", C_BACK: "#7fa3d8", C_FIRST: "#c8a84b", C_NONE: "#d9d3c7" };
export function chartBars(rows) {
  const { W, H, PAD, BASE, TOP } = CHART;
  const list = rows || [], bw = list.length ? (W - PAD * 2) / list.length : 0;
  const max = Math.max(1, ...list.map((r) => r.people));
  const y = (v) => H - BASE - v * (H - BASE - TOP) / max;
  return list.map((r, i) => {
    const x = PAD + i * bw + bw * 0.16, w = bw * 0.68;
    const seg = (v0, v1, kind) => (v1 > v0 ? [{ x, y: y(v1), w, h: y(v0) - y(v1), kind }] : []);
    const has = r.stay !== null && r.stay !== undefined;
    const segs = r.gap ? seg(0, r.people, "gap") : !has ? seg(0, r.people, "none")
      : [...seg(0, r.stay, "stay"), ...seg(r.stay, r.stay + r.back, "back"), ...seg(r.stay + r.back, r.people, "first")];
    return { year: r.year, people: r.people, gap: !!r.gap, x, w, top: y(r.people), segs };
  });
}
const FILL = { stay: CHART.C_STAY, back: CHART.C_BACK, first: CHART.C_FIRST, none: CHART.C_NONE, gap: "url(#mst-hatch)" };
const f1 = (v) => (Math.round(v * 10) / 10).toString();
export function chartSvg(rows) {
  const { W, H, PAD, BASE } = CHART;
  const bars = chartBars(rows);
  return `<svg class="mst-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="해마다 봉사자 — 계속·돌아옴·처음을 쌓은 막대">` +
    `<defs><pattern id="mst-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="6" height="6" fill="#fff"/><rect width="3" height="6" fill="#bbb"/></pattern></defs>` +
    bars.map((b) => b.segs.map((s) => `<rect x="${f1(s.x)}" y="${f1(s.y)}" width="${f1(s.w)}" height="${f1(s.h)}" fill="${FILL[s.kind]}"/>`).join("") +
      (b.people ? `<text x="${f1(b.x + b.w / 2)}" y="${f1(b.top - 5)}" class="mst-cn">${nText(b.people)}</text>` : "") +
      `<text x="${f1(b.x + b.w / 2)}" y="${H - 8}" class="mst-cy">${String(b.year).slice(2)}${b.gap ? "※" : ""}</text>`).join("") +
    `<line x1="${PAD}" x2="${W - PAD}" y1="${H - BASE}" y2="${H - BASE}" stroke="#ddd6c8"/></svg>`;
}
export const LEGEND = [["stay", "계속(견준 해에도 함)"], ["back", "돌아옴(쉬었다 다시)"], ["first", "처음"], ["none", "견줄 해가 없는 해"], ["gap", "명단이 일부인 해"]];
export const legendHtml = () => `<div class="mst-legend">` + LEGEND.map(([k, t]) => `<span><i class="mst-lg mst-lg-${k}"></i>${esc(t)}</span>`).join("") + `</div>`;

// 해마다 수 — 표 한 줄의 칸 글자. 견줄 해가 없으면 flow: null.
export const FLOW_HEAD = ["해", "자리", "봉사자", "계속", "돌아옴", "처음", "나감", "유지율", "견준 해"];
export function flowRow(r) {
  const has = r.stay !== null && r.stay !== undefined;
  return {
    year: r.year, gap: !!r.gap, seats: nText(r.seats), people: nText(r.people),
    flow: !has ? null : {
      stay: nText(r.stay), back: nText(r.back), first: nText(r.first), firstSub: `사역 처음 ${nText(r.firstEver)}`,
      left: nText(r.left), leftSub: `옮김 ${nText(r.moved)} · 쉼 ${nText(r.rest)} · 떠남 ${nText(r.gone)}`,
      keep: keepText(r), prev: String(r.prev), skipped: r.year - r.prev > 1,
    },
  };
}

// 계열별 자리 수 — 전체(세 큰 분류의 계열 모두)와 계열이 둘 이상인 큰 분류에서만. [{ key, label, group, seats[], keep }]
export function heatRows(d, u) {
  const g = groupOf(d, u);
  const fams = u === ALL ? familiesOf(d, THREE) : g && g !== ALL ? familiesOf(d, g) : [];
  if (fams.length < 2) return [];
  return fams.map((k) => { const x = d.units[k], last = x.rows[x.rows.length - 1];
    return { key: k, label: x.label, group: (x.group || "").slice(2), seats: x.rows.map((r) => r.seats), keep: keepText(last, true) }; });
}
// 칸 색 — 진할수록 많다(제곱근으로 눌러 작은 수도 보이게). 0 은 색 없음.
export function heatStyle(v, max) {
  if (!v || !max) return "";
  const a = 0.06 + 0.6 * Math.sqrt(v / max);
  return `background:rgba(26,58,107,${a.toFixed(2)});color:${v / max > 0.35 ? "#fff" : "#222"}`;
}
// 안쪽 나눔 — 그 단위(또는 그 계열이 하나뿐인 큰 분류)의 중분류·팀. 없으면 null.
export const innerOf = (d, u) => (d && d.inner && d.inner[u]) || null;

// 나이·성별·직분 — 그 해 봉사자가 30명 이상인 해만 서버가 준다. [{ year, people, ageAvg, bands[], sex[], position[] }]
export const demoRows = (rows) => (rows || []).filter((r) => r.demo).map((r) => ({ year: r.year, people: r.people, gap: !!r.gap,
  ageAvg: r.demo.ageAvg === null || r.demo.ageAvg === undefined ? "—" : r.demo.ageAvg.toFixed(1),
  bands: r.demo.bands.map(cellText), sex: r.demo.sex.map(cellText), position: r.demo.position.map(cellText) }));

// 명단이 일부인 해 — 「2021년 전체」「교회학교 2014년」「교회학교 2023~2024년」「재정 2022년부터」
export function gapText(g) {
  const who = g.scope === "*" ? "전체" : String(g.scope || "").slice(2);
  const when = g.to === null || g.to === undefined ? `${g.from}년부터` : g.to === g.from ? `${g.from}년` : `${g.from}~${g.to}년`;
  return g.scope === "*" ? `${when} 전체` : `${who} ${when}`;
}
export const HOW = [
  "자리는 명단 한 줄(한 분이 그 해 한 팀에 임명된 것), 봉사자는 사람 수예요. 한 분이 두 자리를 맡으면 자리는 2, 봉사자는 1이에요.",
  "전체는 찬양 · 교회학교 · 그 밖을 합친 것이에요. 목장 리더 줄(목양)과 기관 줄은 따로 봐요.",
  "계속 = 견준 해에도 이 범위에서 봉사한 분 · 돌아옴 = 견준 해에는 없었지만 그 전에 한 적이 있는 분 · 처음 = 이 범위에서 처음인 분(그 가운데 사역 자체가 처음인 분을 따로 세요).",
  "나감 = 견준 해에는 있었는데 올해 이 범위에 없는 분. 다른 사역으로 옮김 · 교회에 계시지만 쉼 · 교인명부에 없는 떠남으로 나눠요.",
  "명단이 일부인 해(빗금)는 견주는 해로 쓰지 않아요. 그래서 그다음 해는 두 해 전과 견줘요(표의 「견준 해」). 건너 견주면 유지율이 낮게 나와요.",
  "유지율은 견준 해 봉사자가 5명 이상일 때만 내요. 나이·성별·직분은 그 해 봉사자가 30명 이상일 때만 보이고, 1~4명인 칸은 「5 미만」으로 가려요.",
  "나이·성별은 교인명부에 있는 분만 알 수 있어요(떠난 분·아직 못 정한 분은 모름). 직분은 교인명부의 지금 직분이에요 — 2012년에 집사였고 지금 권사인 분은 2012년에도 권사로 세요.",
  "자료의 첫 해는 견줄 해가 없어요. 앞쪽 해일수록 「처음」이 실제보다 많게 나와요.",
];
// 세는 법 아래 덧붙임 — 교인명부 기준일 · 명단이 일부인 해 · 떠난 분 · 아직 못 정한 줄 · 이음표에 없는 부서·팀
export function metaLines(d) {
  const m = (d && d.meta) || {}, out = [];
  if (d && d.sourceDate) out.push(`교인명부 기준일 ${d.sourceDate}`);
  if ((m.gaps || []).length) out.push(`명단이 일부인 해(숫자로 미룬 것 — 사역 담당 확인 전): ${m.gaps.map(gapText).join(" · ")}`);
  out.push(`떠난 분(교인명부에 없는 분) ${nText(m.gonePeople || 0)}명 · 아직 누군지 못 정한 줄 ${nText(m.unsureSeats || 0)}줄(${nText(m.unsurePeople || 0)}명으로 셈)`);
  if ((m.unmapped || []).length) {
    out.push(`이음표에 없는 부서·팀 ${nText(m.unmapped.length)}가지 · ${nText(m.unmappedSeats || 0)}줄 — 「그 밖 · 미정」으로 셌어요: ` +
      m.unmapped.slice(0, 20).map((x) => `${x.committee || "(부서 빈칸)"} / ${x.team || "(팀 빈칸)"} ${nText(x.n)}`).join(" · ") + (m.unmapped.length > 20 ? " …" : ""));
  }
  return out;
}

// 엑셀 — 「해마다」(단위마다 줄) · 「계열별 자리」 · 「안쪽 나눔」 · 「나이·성별·직분」 · 「세는 법」. 수는 숫자 칸으로, 가린 칸은 글자 「5 미만」.
const num = (v) => (v === null || v === undefined ? "" : Number(v));
const unitOrder = (d) => { const t = tabUnits(d); return [...t.main, ...t.side, ...familiesOf(d, [...THREE, ...SIDE])]; };
const unitName = (d, u) => (u === ALL ? "전체" : u.startsWith("f:") ? `${(d.units[u].group || "").slice(2)} > ${d.units[u].label}` : d.units[u].label);
export function statsSheets(d) {
  const years = (d && d.years) || [], order = unitOrder(d);
  const flow = [["범위", "해", "자리", "봉사자", "두 자리 이상", "계속", "돌아옴", "처음", "사역이 처음", "다른 곳에서", "나감", "옮김", "쉼", "떠남", "유지율(%)", "견준 해", "명단 일부"]];
  for (const u of order) for (const r of d.units[u].rows) {
    if (!r.seats) continue;
    flow.push([unitName(d, u), r.year, r.seats, r.people, r.multi, num(r.stay), num(r.back), num(r.first), num(r.firstEver), num(r.firstOther),
      num(r.left), num(r.moved), num(r.rest), num(r.gone), num(r.keep), num(r.prev), r.gap ? "일부" : ""]);
  }
  const fams = familiesOf(d, [...THREE, ...SIDE]);
  const heat = [["큰 분류", "계열", ...years, "합"], ...fams.map((k) => { const x = d.units[k]; const s = x.rows.map((r) => r.seats);
    return [(x.group || "").slice(2), x.label, ...s, s.reduce((a, n) => a + n, 0)]; })];
  const inner = [["범위", "묶음", "팀", ...years]];
  for (const u of Object.keys((d && d.inner) || {}).filter((k) => k.startsWith("f:")).sort((a, b) => a.localeCompare(b, "ko"))) {
    for (const m of d.inner[u].mids) {
      inner.push([u.slice(2), m.label || "(묶음 없음)", "(모두)", ...m.seats]);
      for (const t of d.inner[u].teams.filter((x) => x.mid === m.label)) inner.push([u.slice(2), m.label || "(묶음 없음)", t.label, ...t.seats]);
    }
  }
  const mc = (v) => (v === MASKED ? MASK_TEXT : Number(v) || 0);
  const demo = [["범위", "해", "봉사자", "평균 나이", ...AGE_BANDS, ...SEXES.map((s) => `성별 ${s}`), ...POSITIONS.map((p) => `직분 ${p}`)]];
  for (const u of order) for (const r of d.units[u].rows) {
    if (!r.demo) continue;
    demo.push([unitName(d, u), r.year, r.people, r.demo.ageAvg === null || r.demo.ageAvg === undefined ? "" : r.demo.ageAvg,
      ...r.demo.bands.map(mc), ...r.demo.sex.map(mc), ...r.demo.position.map(mc)]);
  }
  const how = [["세는 법"], ...HOW.map((t) => [t]), [""], ...metaLines(d).map((t) => [t])];
  return [["해마다", flow], ["계열별 자리", heat], ["안쪽 나눔", inner], ["나이·성별·직분", demo], ["세는 법", how]];
}
export const statsFileName = (today) => `사역통계_${today}.xlsx`;

export const EMPTY = "아직 셀 사역 이력이 없어요 — 「📜 사역 이력」에서 명단을 올리면 여기에 수가 나와요";
export const NO_DEMO = "이 범위는 봉사자가 30명이 안 되어 나이·성별·직분을 나누어 보이지 않아요";
