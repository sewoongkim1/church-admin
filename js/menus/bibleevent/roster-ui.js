// 📋 회차·명단 — 화면 조각(HTML 만드는 함수 · Node 시험 tests/be-roster-ui.test.mjs). 논리는 roster-logic.js.
// ⚠️ 사람·서버 글자는 모두 esc — 이 파일이 만든 글이 그대로 innerHTML 로 들어간다.
// ⚠️ 줄 메뉴는 드롭다운을 직접 그리지 않고 picker.js pickOne 으로 연다(폰은 아래 판) — PC 표를 overflow-x 로 감싸도 잘리지 않는다.
import { esc } from "../../core/ui.js";
import { churchBadgeHtml } from "../people/church-badge.js";
import { STATUS_KO, SRC_LABEL, subText, filterActive, evYm, evName } from "./roster-logic.js";
// 이름을 누르면 교적 창(Task 16) — 이름 단추 모양
import { nameButtonHtml } from "./person-logic.js";

export const TITLE = `<h2 class="page-title">📋 회차·명단</h2>`;
// 설계 §3 문장 그대로(가운데) — Task 14 점검표가 이 글을 찾는다
export const ELIG_LINE = `<p class="be-note">🔒 자격 회차예요 — 자격 규칙은 여기서 바꾸지 않습니다 · 이 회차는 한 분 더하기·올리기를 하지 않습니다(가을 설계 §12) · 줄은 메모만 고쳐요</p>`;
export const UNTIL_WARN = "⚠️ 명단 공개 종료일을 비우면 명단이 기한 없이 보여요 — 개인정보 안내는 정해진 날까지만 보인다고 약속합니다";
const UNTIL_EMPTY = "⚠️ 명단 공개 종료일이 비어 있어 명단이 기한 없이 보여요 — 개인정보 안내는 정해진 날까지만 보인다고 약속합니다";
export const CHURCH_LABEL = { "맞음": "교적 ✓ 맞음", "확인 필요": "교적 확인 필요", "없음": "교적 없음" };

const num = (x) => Number(x || 0).toLocaleString("ko-KR");
const dot = (d) => String(d || "").replace(/-/g, ".");
export const periodText = (ev) => `${dot(ev.opens_on)} ~ ${dot(ev.closes_on)}`;
const stText = (s) => STATUS_KO[s] || s || "";

// 회차 콤보 — 칩 줄(2026-09-29) 대신 단추 하나(2026-09-30 친구 요구 「콤보로 고르게 · 연·월 · 제목」).
// 누르면 우리 고르개 pickOne(roster.js · 선택지는 roster-logic.js evPickOptions) — ⚠️ <select> 로 바꾸지 말 것(시스템 창 금지).
// 큰 줄 = 제목 전체(짧은 이름 아님 · 줄바꿈으로 다 보인다) · 작은 줄 = 「2026년 3월 · 마감 · 231명」(+ 「 · 👁 성도님께 보임」)
export const comboSub = (ev) => [evYm(ev), stText(ev.status), `${num(ev.count)}명`].filter(Boolean).join(" · ") +
  (ev.listedNow ? " · 👁 성도님께 보임" : "");
export function evBarHtml(ev) {
  return `<div class="be-evbar">` +
    `<button type="button" class="be-combo" data-act="ev" aria-haspopup="dialog" aria-expanded="false">` +
    `<span class="be-combo-t"><span class="be-sr">회차 고르기 — 지금 회차: </span>` +
    `<b class="be-combo-v">${esc(evName(ev))}</b><small class="be-combo-s">${esc(comboSub(ev))}</small></span>` +
    `<span class="pk-field-x" aria-hidden="true"></span></button>` +
    `<button type="button" class="btn be-evnew" data-act="new">＋ 새 회차</button></div>`;
}

// 붙는 머리 — 「지금 무엇을 보고 있나」만
export function headHtml(ev) {
  return `<div class="be-head-t"><b>${esc(ev.title)}</b></div><div class="be-tags">` +
    `<span class="be-tag st-${esc(ev.status)}">${esc(stText(ev.status))}</span>` +
    `<span class="be-tag${ev.listedNow ? " seen" : ""}">${ev.listedNow ? "👁 성도님께 보임" : "성도님께 안 보임"}</span>` +
    `<span class="be-tag">📅 ${esc(periodText(ev))}</span>` +
    (ev.hasEligibility ? `<span class="be-tag">🔒 자격 회차</span>` : "") + `</div>`;
}

function listedLine(ev) {
  if (ev.listedNow) return `<p class="be-note">👁 지금 성도님께 보여요 — 명단(이름·소속·직분)이 로그인 없이 보입니다</p>`;
  const why = ev.status === "draft" ? "상태가 「준비 중」이라서예요 — 「열림」이나 「마감」으로 바꾸면 보여요"
    : ev.status === "archived" ? "상태가 「보관」이라서예요"
    : "명단 공개 종료일이 지나서예요 — 날짜를 미루면 다시 보여요";
  return `<p class="be-note">지금 성도님께 안 보여요 — ${why}</p>`;
}

// ⚙️ 회차 설정 — 접힌 칸. 지금 값을 보여 주고, 고치기는 창(event-form.js)으로
export function settingsHtml(ev, open) {
  const kv = [["회차 ID", ev.id], ["이름", ev.title], ["짧은 이름", ev.short_title || "비움 — 이름을 그대로 써요"],
    ["부제", ev.subtitle || "—"], ["묶음", ev.season || "—"],
    ["같은 날 마감 회차끼리 차례", `${Number(ev.sort_order ?? 0) || 0} (작을수록 위)`],   // 성도님 앱 목록·첫 화면 단추 차례
    ["기간", periodText(ev)], ["상태", stText(ev.status)],
    ["명단 공개 종료일", ev.list_until ? dot(ev.list_until) : "비움 — 기한 없이 보여요"]];
  return `<details class="be-set"${open ? " open" : ""}><summary>⚙️ 회차 설정</summary><div class="be-set-b">` +
    `<dl class="be-kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` +
    listedLine(ev) + (ev.list_until ? "" : `<p class="be-warn">${esc(UNTIL_EMPTY)}</p>`) +
    `<button type="button" class="btn wide" data-act="set">✏️ 회차 설정 고치기</button></div></details>`;
}

export function sourceHtml(src) {
  return src ? `<p class="muted be-srcline">교적 표시는 교인명부 ${esc(src.date)} 기준(${num(src.total)}명)이에요</p>`
    : `<p class="muted be-srcline">교인명부가 아직 없어 교적 표시를 하지 않아요</p>`;
}

// 거르기 칩 — 누르면 고르개(교구·부서·직분 = 여러 개, 교적·출처 = 하나)
const sumOf = (vals, lab) => (!vals.length ? "전체" : lab(vals[0]) + (vals.length > 1 ? ` 외 ${vals.length - 1}` : ""));
const fchip = (k, name, val, on) => `<button type="button" class="be-fchip${on ? " on" : ""}" data-filter="${k}" aria-haspopup="dialog" aria-expanded="false">` +
  `${esc(name)} <b>${esc(val)}</b><span class="pk-field-x" aria-hidden="true"></span></button>`;
export function filtersHtml(f, { labels, church }) {
  return fchip("group", "교구·부서", sumOf(f.groups, (k) => labels.get(k) || k.split("|")[1] || "소속 없음"), f.groups.length > 0) +
    fchip("pos", "직분", sumOf(f.positions, (p) => p || "직분 없음"), f.positions.length > 0) +
    (church ? fchip("church", "교적", f.church ? CHURCH_LABEL[f.church] || f.church : "전체", !!f.church) : "") +
    fchip("src", "출처", f.source ? SRC_LABEL[f.source] || f.source : "전체", !!f.source) +
    (filterActive(f) ? `<button type="button" class="be-fchip clear" data-act="clear">✕ 거르기 풀기</button>` : "");
}

export function sumHtml(total, shown, dupN, q) {
  const s = String(q || "").trim();
  return `명단 <b>${num(total)}</b>명` + (shown !== total ? ` · 보이는 줄 <b>${num(shown)}</b>` : "") +
    (dupN ? ` · ⚠️ 중복일 수 있음 <b>${num(dupN)}</b>줄` : "") + (s ? ` · ‘${esc(s)}’로 찾은 것` : "");
}

const posHtml = (r) => (r.position ? `<em class="be-pos">${esc(r.position)}</em>` : "");
const srcHtml = (r) => `<em class="be-src${r.source === "app" ? " app" : ""}">${esc(SRC_LABEL[r.source] || r.source || "")}</em>`;
const userHtml = (r) => (r.hasUser ? `<em class="be-user" title="앱 계정과 이어진 줄">🔗 앱 계정</em>` : "");
const dupHtml = (on) => (on ? `<em class="be-dup" title="같은 이름·같은 소속 줄이 또 있어요">⚠️ 중복일 수 있음</em>` : "");
const moreHtml = (r) => `<button type="button" class="be-more" data-act="row" data-id="${esc(r.id)}" aria-label="${esc(r.name)}님 줄 — 고치기·빼기">⋯</button>`;

// 폰 — 줄 하나 = 카드 하나
export function cardHtml(r, dup) {
  const sub = subText(r);
  return `<div class="be-row${dup ? " dup" : ""}"><div class="be-row-h"><div class="be-row-nm">` +
    `${nameButtonHtml(r)}${posHtml(r)}${sub ? `<span class="be-row-sub">${esc(sub)}</span>` : ""}` +
    `<span class="be-badges">${srcHtml(r)}${userHtml(r)}${churchBadgeHtml(r.church)}${dupHtml(dup)}</span></div>${moreHtml(r)}</div>` +
    (r.note ? `<div class="be-memo">📝 ${esc(r.note)} <i>(담당자만 봄)</i></div>` : "") + `</div>`;
}

// PC(≥1024px) — 한 표, 묶음마다 머리 줄
export function tableHtml(groups, dups) {
  const head = `<tr><th>이름</th><th>소속</th><th>직분</th><th>출처</th><th>교적</th><th>담당자 메모</th><th><span class="be-sr">고치기·빼기</span></th></tr>`;
  const body = groups.map((g) => `<tbody><tr class="be-tgrp"><th colspan="7" scope="colgroup">${esc(g.label)} <em>${num(g.rows.length)}명</em></th></tr>` +
    g.rows.map((r) => `<tr${dups.has(r.id) ? ` class="dup"` : ""}><td>${nameButtonHtml(r)} ${dupHtml(dups.has(r.id))}</td>` +
      `<td>${esc(subText(r))}</td><td>${esc(r.position || "")}</td><td>${srcHtml(r)} ${userHtml(r)}</td>` +
      `<td>${churchBadgeHtml(r.church)}</td><td class="be-tnote">${esc(r.note || "")}</td><td>${moreHtml(r)}</td></tr>`).join("") +
    `</tbody>`).join("");
  return `<div class="be-tbl-wrap"><table class="be-table"><thead>${head}</thead>${body}</table></div>`;
}

export function listHtml(groups, dups, wide) {
  if (!groups.length) return `<p class="empty">조건에 맞는 줄이 없어요</p>`;
  if (wide) return tableHtml(groups, dups);
  return groups.map((g) => `<section class="be-grp" aria-label="${esc(g.label)}"><h3 class="be-grp-h">${esc(g.label)} <em>${num(g.rows.length)}명</em></h3>` +
    g.rows.map((r) => cardHtml(r, dups.has(r.id))).join("") + `</section>`).join("");
}

// 줄 메뉴(pickOne) — 앱 줄·자격 회차의 줄은 메모만, 빼기 없음(설계 §0·§3 · 서버도 app-row-note-only·app-row·eligibility-event 로 막는다)
export function rowMenuOptions(r, ev) {
  if (r.source === "app") return [{ value: "edit", label: "📝 메모 고치기", hint: "성도님이 앱에서 낸 신청이라 메모만 고칠 수 있어요 · 빼기는 성도님이 앱에서 해요" }];
  if (ev.hasEligibility) return [{ value: "edit", label: "📝 메모 고치기", hint: "자격 회차의 줄이라 메모만 고칠 수 있어요" }];
  return [{ value: "edit", label: "✏️ 고치기", hint: "이름·소속·직분·메모" },
    { value: "del", label: "🗑 빼기", hint: "한 번 더 확인한 뒤 빠져요" }];
}
