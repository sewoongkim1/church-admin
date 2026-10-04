// 📜 사역 이력 — 화면의 순수 함수(엑셀 머리 찾기 · 해 정하기 · 줄 모으기 · 표시 · 내려받기 모양)
//   설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md §3.1·§5
// ⚠️ Node 시험(tests/ministry-history-logic.test.mjs)이 읽는다 — 맨 위에서 document·window 를 만지지 않는다.
import { cellText } from "../bibleevent/upload-logic.js";

const num = (n) => Number(n || 0).toLocaleString("ko-KR");
export const MAX_SEND = 3000;     // 서버 historyUpload 한 번의 상한(HISTORY_MAX_UPLOAD)과 같다
// 근거가 약한 맞춤 — 서버 history-match.ts WEAK_RE 와 같은 글(시험이 맞댄다)
export const WEAK_RE = /^(같은 교구|이름이 한 분뿐|직분으로 가림\(소속 다름\)|가족이 같은 해 같은 목장\(소속 다름\)|다른 해|이름 한 글자 다름)/;

// 칸 이름(띄어쓰기 없앤 꼴) → 줄의 칸. 「비고」는 내려받은 파일(교적ID·맞춤 근거 칸이 있는 파일)이 아니면 원본 메모로 읽는다.
const HEAD = {
  year: ["년도", "연도", "해"], committee: ["부서", "위원회"], team: ["팀명", "팀", "사역팀"], name: ["이름", "성명"],
  position: ["직분"], mok: ["목장"], renewal: ["신규/유지", "신규유지"], role_title: ["직책"], src_note: ["원본메모", "메모"],
};
const hnorm = (s) => cellText(s).normalize("NFC").replace(/\s+/g, "");

// 표 머리 — 앞 열다섯 줄 안에서 「이름」과 「팀명(팀)」이 함께 든 첫 줄. 머리가 빈 칸에 값이 있으면 원본 메모로 모은다
//   (2022 원본의 H열 메모는 머리가 없다).
export function findHeader(aoa) {
  for (let i = 0; i < Math.min((aoa || []).length, 15); i++) {
    const cells = (aoa[i] || []).map(hnorm);
    const at = (names) => cells.findIndex((c) => names.includes(c));
    if (at(HEAD.name) < 0 || at(HEAD.team) < 0) continue;
    const cols = {};
    for (const [k, names] of Object.entries(HEAD)) { const j = at(names); if (j >= 0) cols[k] = j; }
    const exported = cells.includes("교적ID") || cells.includes("맞춤근거");
    if (cols.src_note === undefined && !exported) { const j = at(["비고"]); if (j >= 0) cols.src_note = j; }
    const known = new Set(Object.values(cols));
    const width = Math.max(...(aoa.slice(i + 1).map((r) => (r || []).length)), cells.length);
    const blankCols = [];
    for (let j = 0; j < width; j++) if (!known.has(j) && !(cells[j] || "")) blankCols.push(j);
    return { index: i, cols, blankCols };
  }
  return null;
}

export const yearFromName = (name) => { const m = /(19[5-9]\d|20\d{2})/.exec(String(name || "")); return m ? Number(m[1]) : null; };

// 표 → 줄들. 해는 「년도」 칸 → 파일 이름의 네 자리 → 없으면 needYear(화면이 고르게 한다)
export function parseHistorySheet(aoa, fileName) {
  const h = findHeader(aoa);
  if (!h) return { error: "no-header", rows: [], needYear: false, fileYear: null };
  const fileYear = yearFromName(fileName);
  const rows = [];
  for (const raw of aoa.slice(h.index + 1)) {
    const cells = (raw || []).map(cellText);
    const get = (k) => (h.cols[k] === undefined ? "" : cells[h.cols[k]] || "");
    const row = {
      committee: get("committee"), team: get("team"), name: get("name"), position: get("position"), mok: get("mok"),
      renewal: get("renewal"), role_title: get("role_title"),
      src_note: [get("src_note"), ...h.blankCols.map((j) => cells[j] || "")].filter(Boolean).join(" · "),
    };
    if (![row.committee, row.team, row.name, row.position, row.mok].some(Boolean)) continue;
    const y = h.cols.year === undefined ? NaN : Number(String(get("year")).replace(/\D/g, ""));
    row.year = Number.isInteger(y) && y >= 1950 && y <= 2100 ? y : fileYear;
    rows.push(row);
  }
  return { error: "", rows, needYear: rows.some((r) => !r.year), fileYear };
}

// 붙여넣기(엑셀에서 복사한 칸 — 탭으로 갈린 글) → 표
export const textToAoa = (text) => String(text || "").replace(/\r/g, "").split("\n").map((l) => l.split("\t"));

// 해마다 · 3,000줄씩 — [{ year, rows }]
export function sendParts(rows, max = MAX_SEND) {
  const by = new Map();
  for (const r of rows) { const l = by.get(r.year); if (l) l.push(r); else by.set(r.year, [r]); }
  const out = [];
  for (const year of [...by.keys()].sort((a, b) => a - b)) {
    const list = by.get(year);
    for (let i = 0; i < list.length; i += max) out.push({ year, rows: list.slice(i, i + max) });
  }
  return out;
}

// 해 고르기 — 올해부터 1990까지
export function yearOptions(now = new Date()) {
  const out = [];
  for (let y = now.getFullYear(); y >= 1990; y--) out.push({ value: String(y), label: `${y}년` });
  return out;
}

// 줄의 교적 상태 — gone(명부에서 빠짐) · ok(이어짐) · weak(근거 약함) · none(못 맞춤)
// ⚠️ gone 은 manual 로 이은 줄이라도 먼저 본다 — 사람이 손으로 이었어도 그 뒤 명부에서 빠지면 더는 「이어짐」이 아니다.
export const linkState = (r) => (!r.linked ? "none" : r.in_directory === false ? "gone" : r.link_how === "manual" ? "ok" : r.weak ? "weak" : "ok");
export const STATE_TEXT = { ok: "✓ 이어짐", weak: "△ 확인", none: "— 못 맞춤", gone: "⚠ 명부에 없음" };
export const STATE_CLASS = { ok: "cb-ok", weak: "cb-check", none: "cb-none", gone: "cb-check" };
export const whyText = (r) => (r.linked ? r.match_basis : r.match_reason) || "";

// 살펴보기 결과 합치기 — 해마다 받은 counts·preview 를 하나로
export function mergeChecks(checks) {
  const t = { total: 0, add: 0, same: 0, deleted: 0, dup: 0, bad: 0, linked: 0, unlinked: 0 };
  const reasons = new Map();
  let noDirectory = false;
  for (const c of checks) {
    for (const k of ["total", "add", "same", "deleted", "dup", "bad"]) t[k] += c.d.counts?.[k] || 0;
    t.linked += c.d.preview?.linked || 0; t.unlinked += c.d.preview?.unlinked || 0;
    for (const [w, n] of c.d.preview?.reasons || []) reasons.set(w, (reasons.get(w) || 0) + n);
    if (c.d.preview?.noDirectory) noDirectory = true;
  }
  return { ...t, reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]), noDirectory };
}

// 내려받기 — 2026-10-01 엑셀과 같은 칸 차례(교적ID 는 교인명부·총괄일 때만 채운다)
export const EXPORT_HEAD = ["년도", "부서", "팀명", "이름", "교적ID", "비고", "직분", "목장", "신규 / 유지", "직책", "원본 메모", "원본 파일", "맞춤 근거"];
export function exportAoa(rows, full) {
  return [EXPORT_HEAD, ...rows.map((r) => [r.year, r.committee, r.team, r.name, full && r.person_id != null ? r.person_id : "",
    r.linked ? "" : r.match_reason, r.position, r.mok, r.renewal, r.role_title, r.src_note, r.source_file || "", r.linked ? r.match_basis : ""])];
}
// 교적으로 거른 채(못 맞춘 줄만·근거 약한 줄만) · 찾기로 거른 채 내려받으면 파일 이름에도 적어 둔다 — 「모든 줄」과 헷갈리지 않게.
const EXPORT_ONLY_SUFFIX = { none: "_못맞춤", weak: "_근거약함" };
export function exportName(years, only = "", q = "", now = new Date()) {
  const d = new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = (EXPORT_ONLY_SUFFIX[only] || "") + (q ? "_찾기" : "");
  return `사역이력_${years && years.length ? [...years].sort().join("-") : "모든해"}${suffix}_${d}.xlsx`;
}

// 「👥 묶어 보기」(2026-10-04) — 못 맞춘 줄을 목장·이름 묶음으로(서버 historyGroupsOf). 묶음 한 줄 글 · 그 묶음의 부서·팀.
export const groupSub = (g) => [g.mok || "목장 칸 비어 있음", `${(g.years || []).join("·")}년`, `${num(g.n)}줄`].join(" · ");
export const groupTeams = (g) =>
  [...new Set((g.rows || []).map((r) => [r.committee, r.team].filter(Boolean).join(" ")).filter(Boolean))].join(" / ");
// 묶어 보기는 「못 맞춘 줄」을 묶은 것 — 내려받기는 「못 맞춘 줄만」과 같은 줄로(서버 historyFilter 는 only:"groups" 를 모른다)
export const exportOnly = (only) => (only === "groups" ? "none" : only);

// 고치기 창 칸 — 서버 HISTORY_EDIT_KEYS 와 같은 칸
export const EDIT_KEYS = ["year", "committee", "team", "role_title", "name", "position", "mok", "renewal", "src_note"];
// 고치면 서버가 다시 맞추는 칸 — 서버 HISTORY_REMATCH_KEYS 와 같은 목록(시험이 맞댄다).
//   줄 창은 이 칸을 고친 뒤에는 「고른 분(pick)」을 보내지 않는다 — 후보 지문(fp)이 바뀌었을 수 있다.
export const REMATCH_KEYS = ["year", "name", "position", "mok", "team", "renewal"];

// 넣은 뒤 알림 — 올린 해 전체의 **최종** 수(넣은 뒤 다시 불러온 historyList 의 해마다 요약)로 센다.
//   넣을 때마다 받은 수를 더하면, 뒤의 해를 넣을 때 다른 해 근거로 이어진 앞의 해 줄을 못 센다(2026-10-01 최종 검토).
//   yearsSummary 가 없으면(다시 불러오기 실패) 넣은 줄 수만.
export function uploadSummary(years, saved, failed, yearsSummary) {
  const want = new Set(years);
  const pick = (yearsSummary || []).filter((y) => want.has(y.year)).sort((a, b) => a.year - b.year);
  const fail = failed ? ` · 실패 ${num(failed)}` : "";
  if (!pick.length) return `${num(saved)}줄 넣었어요${fail}`;
  const s = pick.reduce((a, y) => ({ total: a.total + y.total, linked: a.linked + y.linked, none: a.none + y.none }),
    { total: 0, linked: 0, none: 0 });
  return `${num(saved)}줄 넣었어요 — 올린 해 전체: 교적 이어짐 ${num(s.linked)} · 못 맞춤 ${num(s.none)}${fail}\n` +
    `(${pick.map((y) => y.year).join("·")}년 · 모두 ${num(s.total)}줄)`;
}
export function editPatch(before, after) {
  const p = {};
  for (const k of EDIT_KEYS) {
    const a = k === "year" ? Number(after[k]) : String(after[k] ?? "").trim();
    const b = k === "year" ? Number(before[k]) : String(before[k] ?? "");
    if (a !== b) p[k] = a;
  }
  return p;
}

// 주소로 열기 — #/mn-history?row=<줄 id> 는 그 줄 창을 곧바로 · ?q=<이름> 은 찾기 칸을 채운다(「📮 정정 신청」 메뉴가 연다).
// row 는 양의 안전 정수만(그 밖은 주소를 잘못 만든 것 — 조용히 무시) · q 는 다듬고(NFC) 찾기 칸 한도(40자)에 맞춘다.
export function deepLink(query = {}) {
  const n = Number((query || {}).row);
  const row = Number.isSafeInteger(n) && n > 0 ? n : null;
  const q = String((query || {}).q ?? "").trim().normalize("NFC").slice(0, 40);
  return { row, q };
}
