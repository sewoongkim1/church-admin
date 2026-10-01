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
  "already-open": "같은 분에게 이미 열린 신청이 있어요(같은 기록 줄 또는 「내 기록 찾아 주세요」) — 그 신청을 먼저 처리해 주세요",
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
      <a class="btn" href="${esc(linkOf(q))}" target="_blank" rel="noopener">📜 그 줄 열기(새 탭)</a>
      ${q.kind === "find_me" ? `<p class="muted">대개 앱 로그인 목장이 교적과 달라서예요 — 답에 「앱 설정 → 로그인 정보변경에서 목장을 ○○로 바꿔 주세요」를 적고 「반영」해 주세요.</p>` : ""}
      ${q.kind === "missing" ? `<p class="muted">「반영」하면 ${esc(q.year ?? "")}년 「📜 사역 이력」에 이 사역을 한 줄 더해요(신청하신 분 교적에 이어서 · 글에서 부서·팀·직분을 읽어요). 「반영」에서 바꾸면 그 줄만 빠져요.</p>` : ""}
    </div>
    <div class="hr-sts" role="group" aria-label="처리 상태">${sts}</div>
    ${["반영", "반영 안 함"].includes(q.status) ? `<p class="muted">끝난 신청은 [확인 중]을 눌러 다시 열 수 있어요.</p>` : ""}
    <label class="hr-l" for="hr-ans">답 <span class="muted">(「반영 안 함」은 꼭 · ${ANSWER_MAX}자까지)</span></label>
    <textarea id="hr-ans" class="hr-ans" rows="3" maxlength="${ANSWER_MAX}">${esc(q.answer)}</textarea>
    <p class="muted">답은 같은 이름·소속으로 앱에 들어오는 사람에게도 보여요 — 다른 분 이름·사적인 사정은 적지 마세요.</p>
    ${q.kind === "not_mine" ? `<label class="hr-verify"><input type="checkbox" id="hr-ver"> 본인에게 확인했어요(전화·대면) — 「반영」할 때 꼭</label>` : ""}`;
}

// 빠진 사역의 「반영」은 상태·답이 같아도 보낸다 — 그 해 사역 이력에 이 신청의 줄이 없으면 서버가 채운다(반영을 한 번 더 누르면 채움)
export const resendSame = (q, f) => q.kind === "missing" && f.status === "반영";

// 저장 뒤 사역 이력 줄 안내(서버 응답 r.history · 빠진 사역만 온다) → { toast } · { dialog } · null(평소 안내)
//   f.status 가 「반영」이면 더하는 쪽, 아니면 「반영」에서 벗어나 빼는 쪽이다. r.same 이면 상태는 그대로(채우기만 했다).
export function historyNote(r, q, f) {
  const h = r?.history;
  if (!h) return null;
  if (h.error === "history-deleted") return { dialog: "지워 달라는 요청으로 이름까지 지운 줄이라 사역 이력에 다시 더하지 않았어요." };
  if (h.error) {
    if (f.status !== "반영") return { dialog: "상태는 바꿨지만 사역 이력에서 빼지 못했어요 — 「📜 사역 이력」에서 그 줄을 빼 주세요" };
    return { dialog: (r.same ? "" : "상태는 바꿨지만 ") + "사역 이력에 더하지 못했어요 — 「📜 사역 이력」에서 「＋ 한 줄 더하기」로 넣어 주세요" };
  }
  if (h.created || h.restored) return { toast: `사역 이력 ${h.year ?? q.year ?? ""}년에 더했어요` };
  if (h.removed) return { toast: "사역 이력에서 뺐어요" };
  return null;
}

// 저장 전 검사 — 서버 history-check.ts requestSetBlock·parseRequestSet 과 같은 규칙(정하는 것은 서버)
export function formCheck(q, f) {
  if (!SET_STATUS.includes(f.status)) return "bad-status";
  const a = String(f.answer || "").trim();
  if (a.length > ANSWER_MAX) return "answer-too-long";
  if (f.status === "반영 안 함" && !a) return "need-answer";
  if (f.status === "반영" && q.kind === "not_mine" && q.status !== "반영" && !f.verified) return "need-verified";
  return null;
}
