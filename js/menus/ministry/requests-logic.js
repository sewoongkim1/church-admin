// 「📮 정정 신청」 — 화면 논리(순수 함수 · tests/requests-logic.test.mjs).
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md §2·§3
//   ⚠️ 직분은 정정하지 않는다(교적 기준) — 종류에 wrong_position 이 없다. kind·status 글자는 서버 history-check.ts·SQL 008 과 같다.
import { esc } from "../../core/ui.js";

export const KIND_TEXT = { not_mine: "내 것이 아니에요", wrong_team: "팀·부서가 틀려요", other: "그 밖에", missing: "빠진 사역", find_me: "내 기록 찾아 주세요" };
export const FILTERS = [{ value: "open", label: "끝나지 않은 것" }, { value: "done", label: "끝난 것" }, { value: "all", label: "전부" }];
export const SET_STATUS = ["확인 중", "반영", "반영 안 함"];
export const ANSWER_MAX = 300;
export const LINE_MAX = 100;   // 「사역 이력에 넣을 내용」 칸마다 — 서버 history-db.ts HISTORY_FIELD_MAX 와 같다(시험이 맞댄다)
const STATE_CLS = { "신청": "s1", "확인 중": "s2", "반영": "s3", "반영 안 함": "s4" };
const MSG = {
  "bad-status": "처리 상태를 골라 주세요",
  "answer-too-long": "답은 300자까지 적을 수 있어요",
  "need-answer": "「반영 안 함」은 사유(답)를 꼭 적어 주세요",
  "need-verified": "「내 것이 아니에요」는 본인에게 확인한 뒤 칸을 체크해 주세요",
  conflict: "다른 분이 먼저 바꿨어요 — 새로 불러올게요",
  "already-open": "같은 분에게 이미 열린 신청이 있어요(같은 기록 줄 또는 「내 기록 찾아 주세요」) — 그 신청을 먼저 처리해 주세요",
  "not-found": "그 신청을 찾지 못했어요 — 새로 불러와 주세요",
  // 빠진 사역 「사역 이력에 넣을 내용」(2026-10-02) — bad-year·history-too-long 은 ui.js MESSAGES 의 글을 그대로 쓴다(여기 없으면 errorText)
  "need-team": "부서나 팀을 적어 주세요",
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

// 사역 이력 한 줄 「2025 찬양위원회 · 시온성가대 팀장」(해 부서 · 팀 직책) — 정정할 줄(q.row)과 빠진 사역이 들어간 줄(q.line)이 같은 꼴
const historyText = (x) => [x.year, [x.committee, [x.team, x.role_title].filter(Boolean).join(" ")].filter(Boolean).join(" · ")]
  .filter(Boolean).join(" ");

// 빠진 사역 신청의 부서·팀 글 — 두 칸 신청(committee_text 가 글자 · 2026-10-02)은 「부서 · 팀」(빈 칸은 뺀다) ·
//   옛 한 칸 신청(committee_text null · 옛 서버 응답처럼 칸이 없음)은 team_text 그대로. 성경암송 앱 목록 머리와 같은 규칙이다.
const requestTeamText = (q) => (q.committee_text != null
  ? [q.committee_text, q.team_text].filter(Boolean).join(" · ") : (q.team_text || ""));

export function targetText(q) {
  if (q.kind === "missing") return `빠진 사역 ${q.year ?? ""} — ${requestTeamText(q)}`;
  if (q.kind === "find_me") return "기록을 찾지 못한 분";
  if (!q.row) return "(지워진 기록)";
  const t = historyText(q.row);
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
    ${q.kind === "missing" && q.line?.state === "in" ? `<span class="hr-line">📜 ${esc(historyText(q.line))}</span>` : ""}
    ${q.detail ? `<span class="hr-detail">「${esc(q.detail)}」</span>` : ""}
  </button>`;
}

// ── 빠진 사역 — 「사역 이력에 넣을 내용」(2026-10-02 친구 요청 · 고쳐서 반영) ──
//   서버(historyRequestList)가 line 을 준다: in(살아 있는 줄) · out(빼 둔 줄) · draft(줄 없음 — 성도님 글에서 읽음).
//   성도님 신청 글(year·committee_text·team_text)은 바뀌지 않는다 — 고친 값은 사역 이력 줄에만 들어간다. 직분은 교적의 직분(여기서 고치지 않는다).
const LINE_NOTE = {
  in: "지금 「📜 사역 이력」에 있는 줄이에요 — 고쳐서 저장하면 그 줄이 바뀌어요",
  out: "빼 둔 줄이에요 — 「반영」으로 저장하면 다시 넣어요(「📜 사역 이력」에서 직접 뺀 줄은 다시 넣지 않아요)",
  draft: "성도님 글에서 읽어 채웠어요 — 고쳐서 「반영」하면 이 내용으로 그 해 사역 이력에 들어가요",
};
const LINE_FIELDS = [["year", "연도", `inputmode="numeric" maxlength="4"`], ["committee", "부서", `maxlength="${LINE_MAX}"`],
  ["team", "팀", `maxlength="${LINE_MAX}"`], ["role_title", "직책(있으면)", `maxlength="${LINE_MAX}" placeholder="팀장·부팀장 (없으면 비움)"`]];

// 창에 미리 채울 값(서버 line · 옛 응답처럼 없으면 신청 해만)
export function lineOf(q) {
  const L = q.line || {};
  return { state: L.state || "draft", year: L.year ?? q.year ?? "", committee: L.committee ?? "", team: L.team ?? "",
    role_title: L.role_title ?? "", position: L.position ?? "", expect: L.expect ?? "" };
}

// shown — 「반영」이 눌려 있을 때만 보인다(숨은 칸은 보내지도, 바뀜으로 세지도 않는다 · requests.js)
export function lineBoxHtml(q, shown) {
  const L = lineOf(q);
  const inp = ([k, label, extra]) => `<label class="field"><span>${label}</span>` +
    `<input data-hl="${k}" value="${esc(L[k] ?? "")}" ${extra} autocomplete="off"></label>`;
  return `<div class="hr-line-box"${shown ? "" : " hidden"}>
      <p class="hr-l">사역 이력에 넣을 내용</p>
      <div class="hr-line-grid">${LINE_FIELDS.map(inp).join("")}</div>
      <p class="be-note">${esc(LINE_NOTE[L.state] || LINE_NOTE.draft)}</p>
      ${L.position ? `<p class="be-ro">직분 ${esc(L.position)}(교적)</p>` : ""}
      <p class="muted">직분은 교적(교인명부)의 직분으로 넣어요</p>
    </div>`;
}

// 창의 네 칸 → 보낼 값(글자 그대로 · 다듬기는 서버 parseRequestLine)
export function lineRead(box) {
  const v = (k) => box.querySelector(`[data-hl="${k}"]`)?.value ?? "";
  return { year: v("year"), committee: v("committee"), team: v("team"), role_title: v("role_title") };
}

// 저장 전 검사 — 서버 history-db.ts parseRequestLine 과 같은 규칙(정하는 것은 서버) · NFC·빈칸 접기·앞뒤 자르기 뒤에 센다
export function lineCheck(v) {
  const t = (x) => String(x ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  const y = t(v.year), year = Number(y);
  if (!y || !Number.isInteger(year) || year < 1950 || year > 2100) return "bad-year";
  const [c, m, r] = [t(v.committee), t(v.team), t(v.role_title)];
  if (!c && !m) return "need-team";
  if ([c, m, r].some((x) => x.length > LINE_MAX)) return "history-too-long";
  return null;
}

// 미리 채운 값과 다르면 참(창을 닫을 때 「저장하지 않은 내용」을 묻는다)
export function lineDirty(q, v) {
  const L = lineOf(q);
  return ["year", "committee", "team", "role_title"].some((k) => String(v[k] ?? "") !== String(L[k] ?? ""));
}

// ── 신청 삭제(2026-10-02 친구 요청) — 「반영 안 함」 옆 「삭제」 · 확인 창 글 · 지운 뒤 안내 ──
export function deleteConfirmText(q) {
  const base = "이 신청을 완전히 지워요. 성도님 앱 「내 정정 신청」에서도 사라지고 되돌릴 수 없어요.";
  return q.kind === "missing" && q.line?.state === "in" ? base + " 「반영」으로 「📜 사역 이력」에 더한 줄도 빠져요(빼 둔 줄이 돼요)." : base;
}

// 서버 historyRequestDelete 의 답 → { toast } · { dialog }(줄을 빼지 못했으면 놓치지 않게 창)
export function deleteNote(r) {
  if (r?.history?.error) return { dialog: "신청은 지웠지만 사역 이력에서 그 줄을 빼지 못했어요 — 「📜 사역 이력」에서 빼 주세요" };
  return { toast: r?.history?.removed ? "신청을 지웠어요 · 사역 이력에서도 뺐어요" : "신청을 지웠어요" };
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
      ${q.kind === "missing" ? `<p class="muted">「반영」하면 「사역 이력에 넣을 내용」대로 「📜 사역 이력」에 한 줄 더해요(신청하신 분 교적에 이어서 · 직분은 교적의 직분 · 성도님 글은 그대로 둬요). 「반영」에서 바꾸면 그 줄만 빠져요.</p>` : ""}
    </div>
    <div class="hr-sts" role="group" aria-label="처리 상태">${sts}<button type="button" class="btn danger hr-del">삭제</button></div>
    ${["반영", "반영 안 함"].includes(q.status) ? `<p class="muted">끝난 신청은 [확인 중]을 눌러 다시 열 수 있어요.</p>` : ""}
    ${q.kind === "missing" ? lineBoxHtml(q, q.status === "반영") : ""}
    <label class="hr-l" for="hr-ans">답 <span class="muted">(「반영 안 함」은 꼭 · ${ANSWER_MAX}자까지)</span></label>
    <textarea id="hr-ans" class="hr-ans" rows="3" maxlength="${ANSWER_MAX}">${esc(q.answer)}</textarea>
    <p class="muted">답은 같은 이름·소속으로 앱에 들어오는 사람에게도 보여요 — 다른 분 이름·사적인 사정은 적지 마세요.</p>
    ${q.kind === "not_mine" ? `<label class="hr-verify"><input type="checkbox" id="hr-ver"> 본인에게 확인했어요(전화·대면) — 「반영」할 때 꼭</label>` : ""}`;
}

// 빠진 사역의 「반영」은 상태·답이 같아도 보낸다 — 그 해 사역 이력에 이 신청의 줄이 없으면 서버가 채운다(반영을 한 번 더 누르면 채움)
export const resendSame = (q, f) => q.kind === "missing" && f.status === "반영";

// 저장 뒤 사역 이력 줄 안내(서버 응답 r.history · 빠진 사역만 온다) → { toast } · { dialog } · null(평소 안내)
//   f.status 가 「반영」이면 더하는 쪽, 아니면 「반영」에서 벗어나 빼는 쪽이다. r.same 이면 상태는 그대로(채우기만 했다).
//   edited — 살아 있는 줄을 고친 내용대로 고쳤다 · restored — 빼 둔 줄을 되살렸다(고친 칸이 있어도 「더했어요」)
const HISTORY_DIALOG = {
  "history-deleted": "지워 달라는 요청으로 이름까지 지운 줄이라 사역 이력에 다시 더하지 않았어요.",
  "history-removed": "「📜 사역 이력」에서 직접 뺀 줄이라 다시 넣지 않았어요 — 꼭 넣어야 하면 「📜 사역 이력」에서 「＋ 한 줄 더하기」로 넣어 주세요",
  "line-conflict": "그사이 「📜 사역 이력」에서 그 줄이 바뀌었어요 — 새로 불러와 다시 고쳐 주세요",
  "no-person": "교적을 찾지 못한 신청이라 사역 이력에 넣지 않았어요 — 「📜 사역 이력」에서 「＋ 한 줄 더하기」로 넣어 주세요",
};
export function historyNote(r, q, f) {
  const h = r?.history;
  if (!h) return null;
  if (HISTORY_DIALOG[h.error]) return { dialog: HISTORY_DIALOG[h.error] };
  if (h.error) {
    if (f.status !== "반영") return { dialog: "상태는 바꿨지만 사역 이력에서 빼지 못했어요 — 「📜 사역 이력」에서 그 줄을 빼 주세요" };
    return { dialog: (r.same ? "" : "상태는 저장했지만 ") + "사역 이력에 넣지 못했어요 — 잠시 뒤 「반영」을 한 번 더 눌러 주세요" };
  }
  if (h.edited) return { toast: "사역 이력 줄을 고쳤어요" };
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
