// 「📮 정정 신청」 — 화면 논리(순수 함수 · tests/requests-logic.test.mjs).
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md §2·§3
//   ⚠️ 직분은 정정하지 않는다(교적 기준) — 종류에 wrong_position 이 없다. kind·status 글자는 서버 history-check.ts·SQL 008 과 같다.
import { esc } from "../../core/ui.js";

export const KIND_TEXT = { not_mine: "내 것이 아니에요", wrong_team: "팀·부서가 틀려요", other: "그 밖에", missing: "빠진 사역", find_me: "내 기록 찾아 주세요" };
export const FILTERS = [{ value: "open", label: "끝나지 않은 것" }, { value: "done", label: "끝난 것" }, { value: "all", label: "전부" }];
export const SET_STATUS = ["확인 중", "반영", "반영 안 함"];
export const ANSWER_MAX = 300;
const STATE_CLS = { "신청": "s1", "확인 중": "s2", "반영": "s3", "반영 안 함": "s4" };
const MSG = {
  "bad-status": "처리 상태를 골라 주세요",
  "answer-too-long": "답은 300자까지 적을 수 있어요",
  "need-answer": "「반영 안 함」은 사유(답)를 꼭 적어 주세요",
  "need-verified": "「내 것이 아니에요」는 본인에게 확인한 뒤 칸을 체크해 주세요",
  conflict: "다른 분이 먼저 바꿨어요 — 새로 불러올게요",
  "already-open": "같은 기록 줄에 이미 열린 신청이 있어요 — 그 신청을 먼저 처리해 주세요",
  "not-found": "그 신청을 찾지 못했어요 — 새로 불러와 주세요",
};
// 이 메뉴의 오류 글 — 없으면 null(부르는 쪽이 ui.js errorText 로)
export const msgOf = (r) => MSG[r?.error] || null;

// 「기쁨-12 홍길동」 · 목장 99·빈칸은 교구만 · 교회학교 「중등부 2학년 홍길동」
export function whoText(w) {
  if (!w) return "";
  const aff = w.type === "교회학교" ? [w.group, w.sub].filter(Boolean).join(" ")
    : (w.sub && w.sub !== "99" ? `${w.group}-${w.sub}` : (w.group || ""));
  return [aff, w.name].filter(Boolean).join(" ");
}

// 한국 날짜 「10/01」
export function dayText(iso) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return isNaN(d) ? "" : String(d.getUTCMonth() + 1).padStart(2, "0") + "/" + String(d.getUTCDate()).padStart(2, "0");
}

export function targetText(q) {
  if (q.kind === "missing") return `빠진 사역 ${q.year ?? ""} — ${q.team_text || ""}`;
  if (q.kind === "find_me") return "기록을 찾지 못한 분";
  if (!q.row) return "(지워진 기록)";
  const what = [q.row.committee, [q.row.team, q.row.role_title].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  const t = [q.row.year, what].filter(Boolean).join(" ");
  return q.row.deleted ? t + " (빼 둔 기록)" : t;
}

export const countsText = (c) => `신청 ${c?.["신청"] ?? 0} · 확인 중 ${c?.["확인 중"] ?? 0}`;

// [그 줄 열기] — b6 「📜 사역 이력」이 ?row·?q 를 받는다(설계 §5 · 아직 안 받으면 그 메뉴 첫 화면이 열린다)
export function linkOf(q) {
  if (q.row && q.row.id) return `#/mn-history?row=${Number(q.row.id)}`;
  return `#/mn-history?q=${encodeURIComponent(q.who?.name || "")}`;
}

export function rowHtml(q) {
  return `<button type="button" class="card hr-row" data-id="${Number(q.id)}">
    <span class="hr-top"><span class="muted">${esc(dayText(q.created_at))}</span> <b>${esc(whoText(q.who))}</b>
      <span class="hr-kind">${esc(KIND_TEXT[q.kind] || q.kind)}</span>
      <span class="badge hr-st ${STATE_CLS[q.status] || ""}">${esc(q.status)}</span></span>
    <span class="hr-target">${esc(targetText(q))}</span>
    ${q.detail ? `<span class="hr-detail">「${esc(q.detail)}」</span>` : ""}
  </button>`;
}

export function formHtml(q) {
  const sts = SET_STATUS.map((s) =>
    `<button type="button" class="btn hr-st-btn" data-st="${esc(s)}" aria-pressed="${q.status === s}">${esc(s)}</button>`).join("");
  return `<div class="hr-info">
      <p><b>${esc(KIND_TEXT[q.kind] || q.kind)}</b> <span class="muted">· ${esc(dayText(q.created_at))} 신청 · 지금 ${esc(q.status)}</span></p>
      <p>${esc(whoText(q.who))} <span class="muted">· 교적 ${q.found ? "찾음" : "못 찾음"}</span></p>
      <p>${esc(targetText(q))}</p>
      ${q.detail ? `<p class="hr-detail">「${esc(q.detail)}」</p>` : ""}
      <a class="btn" href="${esc(linkOf(q))}">📜 그 줄 열기</a>
      ${q.kind === "find_me" ? `<p class="muted">대개 앱 로그인 목장이 교적과 달라서예요 — 답에 「앱 설정 → 로그인 정보변경에서 목장을 ○○로 바꿔 주세요」를 적고 「반영」해 주세요.</p>` : ""}
    </div>
    <div class="hr-sts" role="group" aria-label="처리 상태">${sts}</div>
    <label class="hr-l" for="hr-ans">답 <span class="muted">(「반영 안 함」은 꼭 · ${ANSWER_MAX}자까지)</span></label>
    <textarea id="hr-ans" class="hr-ans" rows="3" maxlength="${ANSWER_MAX}">${esc(q.answer)}</textarea>
    <p class="muted">답은 같은 이름·소속으로 앱에 들어오는 사람에게도 보여요 — 다른 분 이름·사적인 사정은 적지 마세요.</p>
    ${q.kind === "not_mine" ? `<label class="hr-verify"><input type="checkbox" id="hr-ver"> 본인에게 확인했어요(전화·대면) — 「반영」할 때 꼭</label>` : ""}`;
}

// 저장 전 검사 — 서버 history-check.ts requestSetBlock·parseRequestSet 과 같은 규칙(정하는 것은 서버)
export function formCheck(q, f) {
  if (!SET_STATUS.includes(f.status)) return "bad-status";
  const a = String(f.answer || "").trim();
  if (a.length > ANSWER_MAX) return "answer-too-long";
  if (f.status === "반영 안 함" && !a) return "need-answer";
  if (f.status === "반영" && q.kind === "not_mine" && !f.verified) return "need-verified";
  return null;
}
