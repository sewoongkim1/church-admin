// 🗂️ 사역팀 정보 — 화면 조각(HTML 만드는 순수 함수). 원문: docs/port/ministry-catalog-legacy.md 2.0·2.5·2.7.
// 성경암송 admin-stats.html 의 mcWhenText·mcEmpty·mcHit·mcLine·mcSyncTabs(표만)·mcFormHtml 을 옮겼다.
// ⚠️ sched·desc·capacity·leader·members 는 서버(ministryCatalogAdmin)가 이미 ministryHtml 로 거른 HTML 이다 —
//    여기서 또 esc 하지 않는다(태그가 글자로 보인다). 그 밖의 사람 글자(team·committee·group 등)는 esc.
import { esc } from "../../core/ui.js";
import { fmtTimeLabel } from "../../core/picker.js";

// 요일 넷 · 주기 넷 — 열쇠 이름이 DB 칸 이름과 짝이다(day_sun · freq_weekly …).
// ⚠️ 「평일」은 금요일을 뺀 날이다 — 금요 사역(금요성령집회 등)이 많아 따로 뺐다.
export const MC_DAYS = [["sun", "주일", ""], ["fri", "금요일", ""], ["sat", "토요일", ""], ["week", "평일", "(금 제외)"]];
export const MC_FREQS = [["weekly", "매주", ""], ["biweekly", "격주", "(교대형식)"], ["monthly", "매달", ""], ["adhoc", "그때그때", ""]];
export const MC_WHEN_KEYS = MC_DAYS.map((x) => x[0]).concat(MC_FREQS.map((x) => x[0]));

// 카드 한 줄 요약에 쓰는 짧은 말 — 편집 폼의 긴 이름(금요일·토요일)과 다르다(원문 그대로).
const DAY_SHORT = { sun: "주일", fri: "금", sat: "토", week: "평일" };
const FREQ_SHORT = { weekly: "매주", biweekly: "격주", monthly: "매달", adhoc: "그때그때" };

// 「② 언제」를 사람 말로 — 카드 한 줄에 들어갈 만큼만
export function mcWhenText(r) {
  const days = MC_DAYS.map(([k]) => k).filter((k) => r[k]).map((k) => DAY_SHORT[k]).join("·");
  const freq = MC_FREQS.map(([k]) => k).filter((k) => r[k]).map((k) => FREQ_SHORT[k]).join("·");
  const time = r.from || r.to ? `${r.from || ""}~${r.to || ""}` : "";
  return [days, time, freq].filter(Boolean).join(" ");
}
// 주일 시각 단추 글자 — 값은 옆 hidden 칸(data-f="from"·"to")에, 단추는 「오전 9:30」처럼 읽기 쉬운 글자만.
// 시스템 시각 칸(<input type="time">) 대신 picker.js 의 pickTime 을 연다(2026-09-29).
export const MC_TIME_NONE = { from: "시작 시각", to: "끝 시각" };
export const mcTimeText = (k, v) => fmtTimeLabel(v) || MC_TIME_NONE[k];
const timeField = (r, k) => `<input type="hidden" data-f="${k}" data-id="${r.id}" value="${esc(r[k])}">` +
  `<button type="button" class="pk-field mc-time${r[k] ? "" : " empty"}" data-time="${k}" data-id="${r.id}"
    aria-haspopup="dialog" aria-expanded="false" aria-label="주일 ${k === "from" ? "시작" : "끝"} 시각"${r.sun ? "" : " disabled"}>` +
  `<span class="pk-field-v">${esc(mcTimeText(k, r[k]))}</span><span class="pk-field-x" aria-hidden="true">▾</span></button>`;

// 「② 언제」 여덟 체크박스 중 하나라도 켜져 있거나 시각이 있으면 "채움"
export const mcHasWhen = (r) => MC_WHEN_KEYS.some((k) => r[k]) || !!r.from || !!r.to;
export const mcEmpty = (r) => !r.appoint && !r.sched && !r.desc;

// ⚠️ 위원회를 넘어 전체에서 찾는다 — mcRender 가 부서 필터를 걸기 전에 이 함수로만 거른다(체크리스트 11)
export function mcHit(r, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  return [r.team, r.committee, r.group, r.leader, r.desc, r.sched, r.capacity, r.members]
    .some((v) => String(v || "").toLowerCase().includes(s));
}

// 읽기 줄 하나 — 비어 있으면 회색으로 「비어 있음」(빠뜨린 칸이 보이게). html 은 이미 안전한 값.
export function mcLine(label, html, none) {
  return `<div class="mc-r"><span class="mc-r-l">${esc(label)}</span>` +
    (html ? `<span class="mc-r-v">${html}</span>` : `<span class="mc-r-v none">${esc(none || "비어 있음")}</span>`) +
    `</div>`;
}

// 명단은 DB 에 <br> 로 눕지만 관리자에게는 줄로 보여야 한다 — 오갈 길을 둘 둔다.
export const mcLines = (h) => String(h || "").replace(/<br\s*\/?>/gi, "\n");
export const mcBrs = (t) => String(t || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).join("<br>");

// 부서 고르기 — 「전체」를 앞에 두고, 채운 팀 수를 함께(어디가 비었는지 한눈에). rows 는 전체(mcRows).
export function tabsHtml(rows, pick) {
  const names = [];
  rows.forEach((r) => { if (!names.includes(r.committee)) names.push(r.committee); });
  const all = rows.filter((r) => !r.appoint);
  const allBtn = `<button type="button" class="mc-tab${pick ? "" : " on"}" data-mc="">전체 <em>${
    all.filter((r) => !mcEmpty(r)).length}/${all.length}</em></button>`;
  const rest = names.map((c) => {
    const mine = rows.filter((r) => r.committee === c && !r.appoint);
    const got = mine.filter((r) => !mcEmpty(r)).length;
    return `<button type="button" class="mc-tab${c === pick ? " on" : ""}${got === mine.length && mine.length ? " done" : ""}"
      data-mc="${esc(c)}">${esc(c)} <em>${got}/${mine.length}</em></button>`;
  }).join("");
  return allBtn + rest;
}

// 고치는 폼 — 펼친 팀 하나에만 그린다
export function formHtml(r) {
  if (r.appoint) return `<div class="mc-note">지명 자리라 성도님이 고르지 않습니다 — 설명이 없어도 됩니다.</div>`;
  return `<div class="mc-in">
    <label>시간·요일<input type="text" data-f="sched" data-id="${r.id}"
      value="${esc(r.sched)}" placeholder="예: 매주 화 오전 10시"></label>
    <div class="mc-when">
      <span class="mc-w-t">② 언제
        <em>성도님이 이걸로 사역을 찾습니다 — 비우면 「정해진 날 없음 · 때마다 다름」</em></span>
      <span class="mc-w-r"><b>요일</b>${MC_DAYS.map(([k, t, h]) =>
        `<label><input type="checkbox" data-f="${k}" data-id="${r.id}"${r[k] ? " checked" : ""}>${esc(t)}${
          h ? `<i>${esc(h)}</i>` : ""}</label>`).join("")}</span>
      <span class="mc-w-r"><b>주기</b>${MC_FREQS.map(([k, t, h]) =>
        `<label><input type="checkbox" data-f="${k}" data-id="${r.id}"${r[k] ? " checked" : ""}>${esc(t)}${
          h ? `<i>${esc(h)}</i>` : ""}</label>`).join("")}</span>
      <span class="mc-w-r mc-w-time"><b>주일 시각</b>
        ${timeField(r, "from")}
        <span class="mc-w-tw">~</span>
        ${timeField(r, "to")}
        <i class="mc-w-off" data-off="${r.id}"${r.sun ? " hidden" : ""}>주일을 체크하면 넣을 수 있어요</i></span>
    </div>
    <label class="wide">하는 일<textarea data-f="desc" data-id="${r.id}" rows="2"
      placeholder="예: 주일 예배 전 주차를 안내합니다. &lt;b&gt;굵게&lt;/b&gt; 도 됩니다">${esc(r.desc)}</textarea></label>
    <div class="mc-prev" data-prev="${r.id}">${r.desc || `<span class="mc-none">비어 있음 — 성도님 화면에는 이름만 보입니다</span>`}</div>
    <label>필요 인원<input type="text" data-f="capacity" data-id="${r.id}"
      value="${esc(r.capacity)}" placeholder="예: 10명 (선택)"></label>
    <label class="wide">담당(문의) <span class="mc-hint">성도님 화면 「하는 일」 아래에 보입니다 · 비우면 줄이 안 나옵니다</span>
      <input type="text" data-f="leader" data-id="${r.id}"
        value="${esc(r.leader)}" placeholder="예: 홍길동 집사 (010-1234-5678)"></label>
    <label class="wide">지금 섬기는 분 <span class="mc-hint">한 줄에 한 분씩</span>
      <textarea data-f="members" data-id="${r.id}" rows="3"
        placeholder="홍길동 집사 (화평-20)&#10;이영희 권사 (사랑-3)">${esc(mcLines(r.members))}</textarea>
      <span class="mc-hint">접수완료된 신청자는 여기 안 적어도 자동으로 함께 보입니다.</span></label>
    <div class="mc-in-acts">
      <button type="button" class="mc-save" data-save="${r.id}">저장</button>
      <button type="button" class="mc-btn" data-done="${r.id}">보기로</button>
    </div>
  </div>`;
}

// 펼쳐 본 모습(읽기) — 성도님 화면에 무엇이 보이는지 그대로.
// canOrder 는 지금 이 목록이 「그 위원회 전체·거르지 않은 상태」일 때만 true(호출부에서 계산 — 체크리스트 17·18 보정).
export function readHtml(r, { canOrder, isFirst, isLast }) {
  const when = mcWhenText(r);
  return `<div class="mc-open">
      ${mcLine("언제", r.sched || (when ? esc(when) : ""), "비어 있음 — 「때마다 다름」으로 보입니다")}
      ${mcLine("찾기 칸", when ? esc(when) : "", "비어 있음 — 성도님 필터에 안 걸립니다")}
      ${mcLine("하는 일", r.desc, "비어 있음 — 이름만 보입니다")}
      ${mcLine("담당(문의)", r.leader)}
      ${mcLine("필요 인원", r.capacity)}
      ${mcLine("섬기는 분", r.members)}
      <div class="mc-open-acts">
        <button type="button" class="mc-btn" data-edit="${r.id}">✏️ 고치기</button>
        ${canOrder ? `<span class="mc-ord">
          <button type="button" data-up="${r.id}"${isFirst ? " disabled" : ""} title="위로">▲</button>
          <button type="button" data-dn="${r.id}"${isLast ? " disabled" : ""} title="아래로">▼</button>
        </span>` : ""}
      </div>
    </div>`;
}

// 팀 한 장 = 카드 하나(머리 + 펼치면 읽기 또는 고치기)
export function cardHtml(r, { open, edit, canOrder, isFirst, isLast }) {
  const when = mcWhenText(r);
  const sub = [r.sched || (when ? esc(when) : ""), r.leader, r.capacity].filter(Boolean).join(" · ");
  const head = `<button type="button" class="mc-c-h" data-open="${r.id}" aria-expanded="${open}">
      <span class="mc-c-nm">${r.group ? `<em>${esc(r.group)}</em>` : ""}<b>${esc(r.team)}</b>
        ${r.appoint ? `<span class="mc-tag">지명</span>` : ""}
        ${mcEmpty(r) ? `<span class="mc-tag empty">설명 없음</span>` : ""}
        ${r._d ? `<span class="mc-dot">● 저장 안 됨</span>` : ""}</span>
      <span class="mc-c-x" aria-hidden="true">${open ? "▾" : "▸"}</span>
      ${sub ? `<span class="mc-c-sub">${sub}</span>` : ""}
    </button>`;
  const body = !open ? "" : edit ? formHtml(r) : readHtml(r, { canOrder, isFirst, isLast });
  return `<div class="mc-card${r.appoint ? " off" : ""}${r._d ? " dirty" : ""}${open ? " on" : ""}" data-row="${r.id}">
    ${head}${body}
  </div>`;
}
