// 📤 명단 올리기 — 순수 함수(2026-09-29 · 성경필사(암송)). tests/be-upload-logic.test.mjs 가 같은 파일을 읽는다(DOM 을 쓰지 않는다).
// ⚠️ 여기서는 붙여넣은 글을 **칸으로 나누기만** 한다. 다듬기(「화평교구」→화평 · 「20목장」→20 · 「07」→7 · 이름 끝 숫자 …)와
//    판정(넣음·이미 있음·빈칸·틀림·교인명부로 채움·동명이인)은 서버 events-rules.ts tidyRaw·checkRow 와
//    events-upload.ts · index.ts evUploadCheck/Save(Task 8)가 **처음부터 다시** 한다 — 규칙을 두 곳에 두지 않는다.
//    이 파일의 표·건수는 서버가 준 판정을 보여 주는 데만 쓴다.
// ⚠️ 서버 파일(.ts)은 브라우저가 못 읽는다 — 같아야 하는 값(한 번에 600줄)은 시험이 서버 상수(BE_MAX_UPLOAD)와 맞대 본다.
// ⚠️ 소속 한 줄(whoText)·상태 이름(STATUS_KO)은 📋 회차·명단(roster-logic.js)의 것을 그대로 쓴다 — 여기 따로 두면
//    「받는 중」/「열림」처럼 메뉴마다 글자가 갈린다. 👤 사람별 이력·통계도 roster-logic.js 에서 가져간다.
import { esc } from "../../core/ui.js";
import { STATUS_KO, whoText } from "./roster-logic.js";

export const MAX_ROWS = 600;       // = events-rules.ts BE_MAX_UPLOAD (회차당 가장 많은 명단이 515줄)
// 성경암송 api eventRosterPublic 은 명단을 .limit(5000) 한 번으로 읽는다 — PostgREST 가 1,000행에서 **오류 없이** 자르므로
// 1,000명이 넘는 회차는 성도님 앱 명단이 잘려 보인다(담당자 화면은 쪽을 나눠 읽어 괜찮다). 넘기 전에 알린다(막지는 않는다).
export const PUBLIC_MAX = 1000;

// 칸 차례 — 자리(순서)로 읽는다. skip 은 버리는 칸(시트 맨 앞 번호).
export const COL_LABEL = { name: "이름", gu: "교구", mok: "목장", pos: "직분", skip: "번호" };
export const ORDERS = [
  { id: "ngmp", label: "이름 · 교구 · 목장 · 직분", cols: ["name", "gu", "mok", "pos"] },
  { id: "npgm", label: "이름 · 직분 · 교구 · 목장", cols: ["name", "pos", "gu", "mok"] },
  { id: "gmnp", label: "교구 · 목장 · 이름 · 직분", cols: ["gu", "mok", "name", "pos"] },
  { id: "xngmp", label: "번호 · 이름 · 교구 · 목장 · 직분", cols: ["skip", "name", "gu", "mok", "pos"] },
];
export const orderOf = (id) => ORDERS.find((o) => o.id === id) || ORDERS[0];

const SAMPLE = { name: "홍길동", gu: "화평", mok: "20", pos: "집사", skip: "1" };
// 붙여넣기 칸의 보기 줄 — 고른 칸 차례대로
export const sampleLine = (order) => orderOf(order).cols.map((k) => SAMPLE[k]).join("\t");

const TITLE_RE = /^(성명|이름)$/;
const bare = (s) => String(s || "").replace(/\s+/g, "");
// CSV 칸의 겉 따옴표를 벗긴다(「"홍길동"」 → 홍길동 · 안의 「""」 → 「"」)
const unquote = (c) => {
  const t = String(c ?? "").trim();
  return /^"[\s\S]*"$/.test(t) ? t.slice(1, -1).replace(/""/g, '"').trim() : t;
};

// 붙여넣은 글 → 줄마다 { name, gu, mok, pos } (서버 evUploadCheck 의 rows = RawCells[]).
// 탭(엑셀에서 복사)이 있는 줄은 탭으로, 없으면 쉼표(CSV)로 나눈다. 빈 줄·빈 칸만 있는 줄·양식 안내 줄(↑ ※)은 버린다.
// 제목 줄 — 첫 칸이나 이름 칸이 「성명」·「이름」(띄어 써도)인 줄은 어디에 있든 버린다(시트가 쪽마다 머리글을 되풀이한다).
export function parseSheet(text, order) {
  const cols = orderOf(order).cols;
  const at = cols.indexOf("name");
  const out = [];
  for (const line of String(text ?? "").replace(/^﻿/, "").split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const cells = (line.includes("\t") ? line.split("\t") : line.split(",")).map(unquote);
    if (!cells.some(Boolean)) continue;
    if (/^[↑※]/.test(cells[0])) continue;
    if (TITLE_RE.test(bare(cells[0])) || TITLE_RE.test(bare(cells[at]))) continue;
    const raw = { name: "", gu: "", mok: "", pos: "" };
    cols.forEach((k, i) => { if (k !== "skip") raw[k] = cells[i] || ""; });
    out.push(raw);
  }
  return out;
}

// 엑셀 칸 → 글자. 날짜는 2026-09-29 꼴, 칸 안의 탭·줄바꿈은 빈칸으로(탭으로 이은 글이 어긋나지 않게).
export function cellText(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).replace(/[\t\r\n]+/g, " ").trim();
}

// 엑셀 시트(줄마다 칸 배열) → 붙여넣기 칸에 넣을 글(탭으로 잇는다). 빈 줄은 버린다.
export function sheetText(rows) {
  return (rows || []).map((r) => (r || []).map(cellText))
    .filter((r) => r.some(Boolean)).map((r) => r.join("\t")).join("\n");
}

// CSV·텍스트 파일 → 글. 한국어 엑셀이 저장한 CSV 는 흔히 EUC-KR(CP949)이다 — UTF-8 로 못 읽으면 EUC-KR 로.
// (UTF-8 앞의 BOM 은 TextDecoder 가 떼어 준다)
export function decodeText(bytes) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("euc-kr").decode(bytes); }
}

// 살펴본 것과 넣을 것이 같은지 — 회차·채우기·보낼 줄이 하나라도 다르면 다른 값
export const sigOf = (eventId, rows, fill) => JSON.stringify([String(eventId || ""), !!fill, rows || []]);

// 서버 판정(UploadOut.mark) — 화면 글. 넣는 것은 add·fill 둘뿐이다(Task 8 표).
// same-name 은 소속을 못 정한 줄에만 온다 — 소속이 적힌 줄은 동명이인이어도 add(직분 빈 채로 · 까닭은 notes).
export const MARKS = {
  add: { icon: "➕", short: "넣을 것", text: "넣을 것" },
  fill: { icon: "🔎", short: "교인명부로 채움", text: "빈칸을 교인명부로 채워 넣을 것" },
  same: { icon: "＝", short: "이미 있음", text: "이 회차에 이미 있어요 — 넣지 않아요" },
  blank: { icon: "❔", short: "소속 빈칸", text: "소속(교구·부서)이 비어 넣지 않아요" },
  "same-name": { icon: "👥", short: "동명이인", text: "소속이 비었는데 교인명부에 같은 이름이 여러 분이라 채우지 못했어요 — 넣지 않아요" },
  bad: { icon: "⚠️", short: "모양 틀림", text: "모양이 틀려 넣지 않아요" },
};
export const MARK_ORDER = ["add", "fill", "same", "blank", "same-name", "bad"];
export const WILL_ADD = new Set(["add", "fill"]);

// 판정 줄에서 다시 센다(서버 counts 를 믿지 않고 — 넣기 확인 창은 지금 글로 살펴본 이 줄들로 센다)
export function markCounts(out) {
  const c = { total: 0, willAdd: 0, add: 0, fill: 0, same: 0, blank: 0, sameName: 0, bad: 0 };
  for (const o of out || []) {
    c.total++;
    const k = o.mark === "same-name" ? "sameName" : o.mark;
    if (["add", "fill", "same", "blank", "sameName", "bad"].includes(k)) c[k]++;
    if (WILL_ADD.has(o.mark)) c.willAdd++;
  }
  return c;
}
export const countOf = (c, mark) => (mark === "same-name" ? c.sameName : c[mark]) || 0;

// 판정 줄 하나를 보여 줄 값 — 서버가 다듬은 줄(row)이 있으면 그것(모양 틀림 줄도 다듬은 줄이 올 수 있다),
// 없으면(null — 네 칸이 다 빈 줄 등) 보낸 원문. 소속 글은 roster-logic.js whoText(세 메뉴가 같은 꼴).
export function displayRow(o, sent) {
  if (o && o.row) return { name: o.row.name || "", who: whoText(o.row), position: o.row.position || "" };
  const raw = (sent || [])[o?.i] || {};
  return { name: raw.name || "", who: [raw.gu, raw.mok].filter(Boolean).join(" "), position: raw.pos || "" };
}

// 회차 고르개·머리의 한 줄 — 「2026-03-01 ~ 2026-04-05 · 515명 · 마감 · 성도님께 보임」(상태 글자는 📋 회차·명단과 같다)
export function evHint(e) {
  return `${e.opens_on || ""} ~ ${e.closes_on || ""} · ${Number(e.count || 0).toLocaleString("ko-KR")}명 · ` +
    `${STATUS_KO[e.status] || e.status || ""}${e.listedNow ? " · 성도님께 보임" : ""}`;
}
// 고르개에 내놓는 회차 — 자격 회차(가을 말씀 동행처럼 needs.eligibility 가 있는 회차)는 뺀다(설계 0절 · 서버도 eligibility-event)
export const eventOptions = (events) => (events || []).filter((e) => !e.hasEligibility)
  .map((e) => ({ value: e.id, label: e.title || e.id, hint: evHint(e) }));
// 주소(?ev=)나 지난번에 고른 회차 — 없으면 null, 자격 회차면 고르지 않고 blocked
export function pickFrom(events, id) {
  const e = (events || []).find((x) => x.id === id);
  if (!e) return { ev: null, blocked: false };
  return e.hasEligibility ? { ev: null, blocked: true } : { ev: e, blocked: false };
}

export const overLimit = (total, willAdd) => Number(total || 0) + Number(willAdd || 0) > PUBLIC_MAX;

// 넣기 확인 창의 본문 — ⚠️ ui.js dialog 본문은 white-space:pre-line 이라 줄바꿈 문자를 넣지 않는다(한 줄로 잇는다)
export function confirmHtml(ev, lines, c) {
  const skip = [
    c.same && `이미 있음 ${c.same}`,
    (c.blank + c.sameName) && `소속 빈칸 ${c.blank + c.sameName}`,
    c.bad && `모양 틀림 ${c.bad}`,
  ].filter(Boolean);
  return [
    `<b>${esc(ev.title || ev.id)}</b>에 <b>${c.willAdd}명</b>을 넣습니다`,
    c.fill ? ` (교인명부로 빈칸을 채운 ${c.fill}명 포함)` : "",
    ` — 지금 적힌 ${lines}줄을 살펴본 판정으로 센 수예요.`,
    skip.length ? ` 넣지 않는 줄: ${skip.join(" · ")}.` : "",
    ev.listedNow ? `<p class="muted" style="margin-top:8px">⚠️ 이 회차는 지금 성도님께 보여요 — 넣은 분의 이름·소속·직분이 곧바로 앱 명단에 나와요.</p>` : "",
    `<p class="muted" style="margin-top:8px">넣는 순간 서버가 처음부터 다시 판정해요 — 그사이 다른 분이 더했으면 실제로 넣은 수가 조금 다를 수 있어요.</p>`,
  ].join("");
}
