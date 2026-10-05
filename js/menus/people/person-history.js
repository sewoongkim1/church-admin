// 교인명부 「자세히」 창의 🤝 사역 · ✍️ 성경필사 탭 — 순수 함수(2026-10-01 · DOM 을 쓰지 않는다 · tests/person-history.test.mjs 가 읽는다).
// 설계: v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §4 · 손잡이(DOM)는 person-tabs.js · 창은 search.js openPerson.
// ⚠️ 줄바꿈 글자를 넣지 않는다(person-detail.js 와 같은 규칙) · 사람·서버 글자는 모두 esc.
// ⚠️ 단추에 data-v · data-fam · data-fam-all 을 쓰지 않는다 — ui.js dialog 는 본문 안 button[data-v] 를 「닫기」로,
//    search.js·person-popup.js 는 data-fam 을 가족 단추로 읽는다. 탭은 data-pd-tab, 나머지는 data-pd-act(+ data-kind · data-row).
// ⚠️ 서버가 준 칸 지도(people-links.ts …Item)만 그린다 — 메모·사유·전화·앱 계정은 응답에 아예 없다.
// 🎓 교육 탭(4단계 B · 2026-10-06) — 서버가 history.education(배열 · edu-rules.ts eduTabItems 칸 지도)을 줄 때만 넷째 탭.
//   교육 표 읽기만 실패했거나 옛 서버면 칸째 없다 → 탭 셋 그대로(사역·성경필사 탭은 그대로). 교육 줄은 잇기·풀기·「아직 안 이어진 기록」이 없다(읽기만).
import { esc } from "../../core/ui.js";
import { SHORT, CLS } from "../ministry/status-logic.js";
import { statLabel } from "../bibleevent/history-logic.js";
import { whoText } from "../bibleevent/roster-logic.js";

export const HIST_TABS = [["church", "교적"], ["ministry", "🤝 사역"], ["bible", "✍️ 성경필사"]];
export const EDU_TAB = ["education", "🎓 교육"];
export const hasEdu = (h) => Array.isArray(h?.education);
// 이 창의 탭들 — 교육 칸이 있으면 넷(교적 · 사역 · 성경필사 · 교육)
export const tabsFor = (h) => (hasEdu(h) ? [...HIST_TABS, EDU_TAB] : HIST_TABS);
const KEYS = HIST_TABS.map(([k]) => k);
// 고를 수 있는 탭인가 — 교육은 그 창에 교육 칸이 있을 때만(가족으로 넘어가며 보던 탭이 교육인데 그분 창엔 없으면 교적)
export const tabOf = (v, h) => (KEYS.includes(v) || (v === EDU_TAB[0] && hasEdu(h)) ? v : "church");
// 「아직 안 이어진 기록」을 불러올 탭 — 사역·성경필사만(교육 줄은 잇는 길이 없다)
export const linksTab = (k) => k === "ministry" || k === "bible";
export const rowKey = (kind, row) => `${kind}:${row}`;
export const histTotal = (h) => (Number(h?.counts?.ministry) || 0) + (Number(h?.counts?.bible) || 0) + (Number(h?.counts?.education) || 0);
const t = (v) => esc(String(v ?? "").replace(/[\r\n]+/g, " ").trim());
const join = (...xs) => xs.map((x) => String(x ?? "").trim()).filter(Boolean).join(" · ");

// 잇기·풀기 뒤 알림(person-tabs.js link) — r = 서버 응답. 풀었는데 규칙이 다시 이분께 이었으면 「이분 아님」을 권한다.
// ⚠️ 서버가 탭 자료(history)를 못 실었으면(다시 읽기 실패 · 쓰기는 됐다 — 2026-10-02 가지 마지막 검토) 창의 탭은 옛 모양 그대로라
//    「창을 다시 열면」을 덧붙인다(그 줄을 또 누르면 not-linked 로 막힌다).
const LINK_DONE = { manual: "이분 기록으로 이었어요", none: "이분 기록이 아니라고 적었어요", auto: "연결을 끊었어요" };
export const LINK_STALE = " — 창을 닫고 다시 열면 바뀐 기록이 보여요";
export function linkDoneText(how, r) {
  const base = how === "auto" && r?.relinked ? "규칙이 다시 이분께 이었어요 — 이분 기록이 아니면 「이분 아님」을 눌러 주세요"
    : LINK_DONE[how] || "저장했어요";
  return r?.history ? base : base + LINK_STALE;
}

// 잇기·풀기 뒤 서버가 다시 준 탭 자료(next)에 교육 칸이 없으면(그때 교육 읽기만 실패) 보던 교육 칸을 그대로 둔다 —
//   잇기는 교육 줄을 바꾸지 않는다. 그렇게 안 하면 탭 하나가 창에서 갑자기 사라진다.
//   거꾸로, 처음엔 교육 칸이 없었는데(그 읽기만 실패) 잇기 뒤 자료에 생겼으면 뺀다 — 패널이 없으니 탭 줄만 넷이 되면
//   교육 탭을 눌러도 빈 칸이 된다(검토 2026-10-06). 창을 다시 열면 교육 탭이 제대로 그려진다.
export function keepEdu(prev, next) {
  if (!next) return next;
  if (hasEdu(next) && !hasEdu(prev)) {
    const { education, ...rest } = next;
    const counts = { ...(next.counts || {}) };
    delete counts.education;
    return { ...rest, counts };
  }
  if (hasEdu(next) || !hasEdu(prev)) return next;
  return { ...next, counts: { ...(next.counts || {}), education: prev.education.length }, education: prev.education };
}

// 탭 줄 — 오른쪽 칸 맨 위. 숫자 = 이분과 이어진 기록 수(서버 counts). 넷이면 pd-tabs4(좁은 창에서 두 줄 두 칸 — css)
export function tabsHtml(history, tab) {
  const on = tabOf(tab, history);
  const list = tabsFor(history);
  const n = { ministry: Number(history?.counts?.ministry) || 0, bible: Number(history?.counts?.bible) || 0,
    education: Number(history?.counts?.education) || 0 };
  return `<div class="pd-tabs${list.length > 3 ? " pd-tabs4" : ""}" role="tablist" aria-label="${list.length > 3 ? "교적 · 사역 · 성경필사 · 교육" : "교적 · 사역 · 성경필사"}">` +
    list.map(([k, label]) => {
    const sel = k === on;
    return `<button type="button" class="pd-tab${sel ? " on" : ""}" role="tab" id="pd-tab-${k}" data-pd-tab="${k}" ` +
      `aria-selected="${sel}" aria-controls="pd-panel-${k}" tabindex="${sel ? 0 : -1}">${label}${k === "church" ? "" : ` <em>${n[k]}</em>`}</button>`;
  }).join("") + `</div>`;
}

// 「위원회 · 팀 (선택) · 직책」 — 하위 선택(option · 어와나 택1 등)은 팀 뒤 괄호(직책이 아니다 · b6 §8 과 같은 표기)
export function ministryText(r) {
  const opt = String(r?.option ?? "").trim();
  const team = [String(r?.team ?? "").trim(), opt ? `(${opt})` : ""].filter(Boolean).join(" ");
  return join(r?.committee, team, r?.role_title);
}
// 상태 칩 — 신청 현황과 같은 색·글자(status-logic.js CLS·SHORT). 사역 이력은 서버가 「임명확정」으로 준다.
export function statusChip(status) {
  const s = String(status ?? "");
  return `<span class="mn-rowi-st ${CLS[s] || "s1"}">${t(SHORT[s] || s)}</span>`;
}
// 성경필사 한 줄 — 회차 이름은 👤 통계와 같은 statLabel(「2026 사순절 마가복음」) · 그때 소속(whoText) · 직분
export function bibleText(r) {
  return join(statLabel({ id: r?.event_id, title: r?.title, short_title: r?.short_title, opens_on: r?.opens_on }),
    whoText({ who_type: r?.who_type, group: r?.group, sub: r?.sub }), r?.position);
}
const dataRow = (r) => `data-kind="${t(r?.kind)}" data-row="${t(r?.row)}"`;

// 이어진 줄 하나 — [해] · 글 · [칩] · 「풀기」(확인 중이면 그 자리에서 「연결을 끊을까요? 예 · 아니요 · 이분 아님」)
function linkedRow(tab, r, year, ui) {
  const text = tab === "ministry" ? ministryText(r) : bibleText(r);
  const chip = tab === "ministry" ? statusChip(r?.kind === "history" ? "임명확정" : r?.status) : "";
  const manual = r?.how === "manual" ? `<small class="pd-hm">사람이 이음</small>` : "";
  const c = ui && ui.confirm && ui.confirm.key === rowKey(r?.kind, r?.row) ? ui.confirm : null;
  const tail = !c
    ? `<button type="button" class="pd-hx" data-pd-act="unlink" ${dataRow(r)} aria-label="${t(text)} — 연결 끊기"><span class="pd-hx-w">연결 </span>끊기</button>`
    : `<span class="pd-hc" role="group" aria-label="연결 끊기 확인"><small>${c.relinked ? "규칙이 다시 이분께 이었어요" : "연결을 끊을까요?"}</small>` +
      (c.relinked ? "" : `<button type="button" class="pd-hb" data-pd-act="unlink-yes" ${dataRow(r)}>예</button>`) +
      `<button type="button" class="pd-hb" data-pd-act="unlink-no" ${dataRow(r)}>${c.relinked ? "그대로 두기" : "아니요"}</button>` +
      `<button type="button" class="pd-hb warn" data-pd-act="notme" ${dataRow(r)}>이분 아님</button></span>`;
  const y = tab === "ministry" ? `<span class="pd-hy">${t(year)}</span>` : "";
  return `<li class="pd-hr">${y}<span class="pd-ht">${t(text)}${manual}</span>${chip}${tail}</li>`;
}

const EMPTY = { ministry: "이어진 사역 기록이 없어요", bible: "이어진 성경필사 기록이 없어요", education: "이어진 교육 기록이 없어요" };

// ---------- 🎓 교육 칸(4단계 B · 2026-10-06) — 서버 칸 지도 eduTabItems {term, title, status, statusLabel, attendPct, certNo, certRevoked} ----------
// 상태 칩 색은 사역 칩과 같은 넷(mn-rowi-st): 신청 s1(파랑) · 대기 s2(노랑) · 확정 s3(초록) · 취소·반려 s4(회색)
const EDU_CLS = { applied: "s1", waitlisted: "s2", confirmed: "s3", cancelled: "s4", declined: "s4" };
export function eduChip(status, label) {
  const s = String(status ?? "");
  return `<span class="mn-rowi-st ${EDU_CLS[s] || "s1"}">${t(label || s)}</span>`;
}
// 「출석률 92% · 수료번호 고척-2027-0001」 — 체크한 회차가 없으면 「출석률 —」 · 수료를 취소한 번호는 「(취소됨)」 · 번호가 없으면 수료 칸을 안 쓴다
export function eduMeta(r) {
  const p = r?.attendPct;
  const pct = typeof p === "number" && Number.isFinite(p) ? `${p}%` : "—";
  const cert = r?.certNo ? `수료번호 ${r.certNo}${r.certRevoked ? " (취소됨)" : ""}` : "";
  return join(`출석률 ${pct}`, cert);
}
function eduRow(r) {
  const off = r?.status === "cancelled" || r?.status === "declined";
  return `<li class="pd-hr pd-er${off ? " off" : ""}"><span class="pd-ht">${t(r?.title)}</span>${eduChip(r?.status, r?.statusLabel)}` +
    `<span class="pd-em">${t(eduMeta(r))}</span></li>`;
}
// 교육 칸 — 학기마다 한 묶음(학기 이름을 머리로 · 서버가 학기 새것부터 세운 차례 그대로 붙어 있는 같은 학기를 묶는다)
export function eduPanelHtml(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return `<p class="pd-none">${EMPTY.education}</p>`;
  const groups = [];
  for (const r of list) {
    const term = String(r?.term ?? "").trim();
    const g = groups[groups.length - 1];
    if (g && g.term === term) g.rows.push(r); else groups.push({ term, rows: [r] });
  }
  return groups.map((g) => `<div class="pd-eg"><p class="pd-eh">${t(g.term || "학기 없음")}</p>` +
    `<ul class="pd-hl pd-hl-e">${g.rows.map(eduRow).join("")}</ul></div>`).join("");
}

// 사역·성경필사 칸 하나 — 이어진 줄(사역은 해 내림차순 · 같은 해는 해 칸을 비운다) + 「아직 안 이어진 기록」 · 교육 칸은 eduPanelHtml(읽기만)
export function histPanelHtml(tab, history, ui) {
  if (tab === EDU_TAB[0]) return eduPanelHtml(history?.education);
  const items = (tab === "ministry" ? history?.ministry : history?.bible) || [];
  let prev = null;
  const rows = items.map((r) => {
    const y = tab === "ministry" ? String(r?.year ?? "") : "";
    const show = y === prev ? "" : y;
    prev = y;
    return linkedRow(tab, r, show, ui);
  }).join("");
  const list = items.length ? `<ul class="pd-hl${tab === "bible" ? " pd-hl-b" : ""}">${rows}</ul>` : `<p class="pd-none">${EMPTY[tab] || ""}</p>`;
  return list + unlinkedHtml(tab, ui && ui.unlinked);
}

export const unlinkedFor = (tab, rows) => (rows || []).filter((r) => (r?.kind === "signup" ? "bible" : "ministry") === tab);
function unlinkedText(r) {
  if (r?.kind === "signup") return bibleText(r);
  return join(r?.year, ministryText(r), r?.kind === "history" ? r?.mok : r?.who, r?.position);
}
function unlinkedRow(r) {
  const text = unlinkedText(r);
  const chip = r?.kind === "signup" ? "" : statusChip(r?.kind === "history" ? "임명확정" : r?.status);
  return `<li class="pd-hr pd-ur"><span class="pd-ht">${t(text)}</span>${chip}` +
    `<button type="button" class="pd-hb" data-pd-act="link" ${dataRow(r)} aria-label="${t(text)} — 이분 것">이분 것</button></li>`;
}
// 「이름이 같고 아직 안 이어진 기록 N건 ▸」 — 탭을 처음 열 때 서버(peopleHistory)에서 받는다.
// ⚠️ 2026-10-01 친구 결정: `link_how='none'`(이분 아님) 줄은 **따로 묶어 접어 둔다** — 표가 누구를 두고 「이분 아님」이라
//    했는지 적지 않아, 아예 숨기면 같은 이름의 다른 분 창에서도 이을 길이 없어진다. 「이분 아님으로 둔 기록 N건 ▸」 **자체가
//    별도의 접힘/펼침**이라 위 「아직 안 이어진 기록」을 펼쳐도 그 묶음은 그대로 접혀 있다 — 펼치면 줄마다 「이분 것」.
export function unlinkedHtml(tab, un) {
  if (!un || !un.state || un.state === "idle") return "";
  if (un.state === "loading") return `<p class="pd-un muted" role="status">같은 이름의 다른 기록을 찾는 중…</p>`;
  if (un.state === "error") {
    return `<p class="pd-un">같은 이름의 기록을 불러오지 못했어요 <button type="button" class="pd-hb" data-pd-act="unlinked-retry">다시</button></p>`;
  }
  const all = unlinkedFor(tab, un.rows);
  if (!all.length) return `<p class="pd-un muted">이름이 같고 아직 안 이어진 기록은 없어요</p>`;
  const open = all.filter((r) => r?.how !== "none"), rej = all.filter((r) => r?.how === "none");
  const isOpen = !!(un.open && un.open[tab]);
  const notmeOpen = !!(un.open && un.open[`${tab}Notme`]);
  const mainLabel = open.length ? `이름이 같고 아직 안 이어진 기록 ${open.length}건` : `이름이 같고 아직 안 이어진 기록은 없어요`;
  const main = open.length
    ? `<button type="button" class="pd-un-b" data-pd-act="more" aria-expanded="${isOpen}">${t(mainLabel)} ` +
      `<span aria-hidden="true">${isOpen ? "▾" : "▸"}</span></button>` +
      (isOpen ? `<ul class="pd-hl pd-ul">${open.map(unlinkedRow).join("")}</ul>` : "")
    : `<p class="pd-un-sub">${t(mainLabel)}</p>`;
  const notme = !rej.length ? "" :
    `<button type="button" class="pd-un-b pd-un-sub" data-pd-act="more-notme" aria-expanded="${notmeOpen}">「이분 아님」으로 둔 기록 ${rej.length}건 ` +
    `<span aria-hidden="true">${notmeOpen ? "▾" : "▸"}</span></button>` +
    (notmeOpen ? `<ul class="pd-hl pd-ul">${rej.map(unlinkedRow).join("")}</ul>` : "");
  return `<div class="pd-un">${main}${notme}</div>`;
}
