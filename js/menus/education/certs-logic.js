// 🎓 수료 — 순수 함수(시험이 읽는다 · DOM 없음 · tests/edu-certs-logic.test.mjs)
//   칸 이름은 서버 edu-db.ts(eduCertList·eduCertIssue·eduCertRevoke·eduCertPrint·eduCertSettings*)의 응답과 같다.
//   ⚠️ 후보는 서버 candidate(eduCertCandidate)를 그대로 쓴다 — 확인 체크를 누른 직후(서버 답 전)에만 같은 규칙(candidateOf)으로 다시 셈한다.
//   ⚠️ 수료번호는 SQL 한 곳(edu_cert_take)이 짓는다 — 화면은 받은 certNo 를 보이기만 한다.

// ---------- 강좌 ----------
// 고르개 차례 — 진행 중 → 끝 → 모집 끝 → 모집 중 → 준비 중 → 보관(같은 단계 안은 서버가 준 차례 · 수료는 진행 중·끝난 강좌의 일이라 위로)
export const STATUS_RANK = { running: 0, done: 1, closed: 2, open: 3, draft: 4, archived: 5 };
export function orderCourses(list) {
  const a = (Array.isArray(list) ? list : []).filter(Boolean);
  const rank = (c) => (Object.prototype.hasOwnProperty.call(STATUS_RANK, c.status) ? STATUS_RANK[c.status] : 9);
  return a.map((c, i) => [c, i]).sort((x, y) => rank(x[0]) - rank(y[0]) || x[1] - y[1]).map((x) => x[0]);
}
// 강좌 단추·고르개 글 — 「구원론 3차 · 2026 하반기 · 진행 중」
export const courseLabel = (c) => `${c?.title || ""} · ${c?.term || "학기 없음"} · ${c?.statusLabel || ""}`;
// 고르개 아래 작은 글 — 「확정 20분 · 수료 기준 80% + 과제」
export function courseHint(c) {
  const n = Number(c?.counts?.confirmed) || 0;
  return [`확정 ${n}분`, ruleText(c, true)].filter(Boolean).join(" · ");
}
export const courseOptions = (list) => orderCourses(list).map((c) => ({ value: c.id, label: courseLabel(c), hint: courseHint(c) }));
// 처음 열 강좌 — 지난번에 본 강좌 → 강좌가 하나뿐이면 그것 → 없음(고르게 한다)
export function initialCourse(list, lastId) {
  const a = orderCourses(list);
  return (lastId && a.find((c) => c.id === lastId)) || (a.length === 1 ? a[0] : null);
}

// 수료 기준 — 「출석 80% 이상 + 과제 확인」 · short 면 고르개 힌트용 「수료 기준 80% + 과제」
export function ruleText(c, short = false) {
  const p = typeof c?.attendPct === "number" && Number.isFinite(c.attendPct) ? c.attendPct : null;
  const chk = String(c?.checkLabel || "").trim();
  if (short) return p === null ? "" : `수료 기준 ${p}%${chk ? " + " + chk : ""}`;
  return `${p === null ? "출석 기준 없음" : `출석 ${p}% 이상`}${chk ? ` + ${chk} 확인` : ""}`;
}

// ---------- 한 분 ----------
// 출석 — 「출석 6/7 · 86%」 · 체크한 회차가 없으면 「출석 기록 없음」 · 공결만이면 「공결 2회」(서버 attend 를 그대로 · 다시 셈하지 않는다)
export function attendText(a) {
  const pct = a?.pct;
  if (pct === null || pct === undefined) {
    const ex = Math.floor(Number(a?.excused) || 0);
    return ex > 0 ? `공결 ${ex}회` : "출석 기록 없음";
  }
  return `출석 ${Number(a.attended) || 0}/${Number(a.denom) || 0} · ${pct}%`;
}
// 후보(서버 eduCertCandidate 와 같은 규칙) — 출석률 ≥ 기준 그리고 확인 항목이 있으면 그 체크. 출석률·기준이 없으면 아니다.
export function candidateOf(p, course) {
  const pct = p?.attend?.pct, need = course?.attendPct;
  if (typeof pct !== "number" || typeof need !== "number" || !Number.isFinite(need) || pct < need) return false;
  return !String(course?.checkLabel || "").trim() || p?.checkDone === true;
}
// 수(서버 counts 와 같은 셈) — 후보 = 후보이면서 아직 수료도 수료 취소도 아닌 분(「후보 N분 수료 확정」의 N)
export function countsOf(people) {
  const a = Array.isArray(people) ? people : [];
  return { total: a.length, candidates: a.filter((p) => p.candidate && !p.completed && !p.revoked).length,
    completed: a.filter((p) => p.completed).length, revoked: a.filter((p) => p.revoked).length };
}
export const pendingOf = (people) => (Array.isArray(people) ? people : []).filter((p) => p && p.candidate && !p.completed && !p.revoked);
// 위 한 줄 — 「확정 20분 · 후보 12분 · 수료 5분 · 수료 취소 1분」(취소가 없으면 뺀다)
export function headLine(k) {
  return [`확정 ${k.total}분`, `후보 ${k.candidates}분`, `수료 ${k.completed}분`, k.revoked ? `수료 취소 ${k.revoked}분` : ""].filter(Boolean).join(" · ");
}
// 한 분의 수료 칸 — 수료 → 번호 · 수료 취소 → 「취소됨」+번호 · 후보 → 「후보」 · 그 밖 없음
export function markOf(p) {
  if (p?.completed && p.certNo) return { cls: "done", text: p.certNo };
  if (p?.revoked) return { cls: "rv", text: p.certNo ? `취소됨 · ${p.certNo}` : "취소됨" };
  if (p?.candidate) return { cls: "cand", text: "후보" };
  return null;
}
// 한 분 단추 — 수료면 「취소」 · 보관 강좌는 확정 없음(취소는 됨 · SQL 이 확정·체크만 막는다) · 수료 취소였던 분은 「다시 확정」
export function rowAction(p, course) {
  if (p?.completed) return { op: "revoke", label: "취소", danger: true };
  if (course?.archived) return null;
  return { op: "issue", label: p?.revoked ? "다시 확정" : "확정", primary: !!p?.candidate };
}

// ---------- 확인 창·알림 글 ----------
export const issueLabel = (n) => `후보 ${n}분 수료 확정`;
export const issueAsk = (n) => `아래 ${n}분을 수료로 확정할까요? 이름 가나다 차례로 수료번호를 드려요. 한 번 드린 번호는 다시 쓰지 않아요.`;
// 기준에 못 미친 분을 한 분씩 확정할 때만 한 번 더 묻는다(사람이 정하는 일 — 막지는 않는다)
export const belowAsk = (p, course) => `${p.name} 님은 아직 수료 기준(${ruleText(course)})에 못 미쳐요. 그래도 수료로 확정할까요?`;
export const revokeAsk = (p) => `${p.name} 님의 수료를 취소할까요? 수료번호 ${p.certNo || ""}는 남아서 진위 확인에 「취소된 수료증」으로 보여요. 다시 확정하면 같은 번호로 돌아와요.`;
// 확정 결과 — 「3분을 수료로 확정했어요 (고척-2026-0007~0009)」 · 되살린 분·이미 수료인 분은 따로 센다
export function issueDoneText(issued) {
  const a = Array.isArray(issued) ? issued : [];
  const fresh = a.filter((x) => x.how === "new"), back = a.filter((x) => x.how === "restored"), same = a.filter((x) => x.how === "already");
  const parts = [];
  if (fresh.length) {
    const nos = fresh.map((x) => String(x.certNo || "")).filter(Boolean);
    const span = nos.length > 1 ? ` (${nos[0]}~${nos[nos.length - 1].split("-").pop()})` : nos.length ? ` (${nos[0]})` : "";
    parts.push(`${fresh.length}분을 수료로 확정했어요${span}`);
  }
  if (back.length) parts.push(`${back.length}분은 같은 번호로 되살렸어요`);
  if (same.length) parts.push(`${same.length}분은 이미 수료였어요`);
  return parts.join(" · ") || "바뀐 것이 없어요";
}
export const revokeDoneText = (r) => (r?.already ? "이미 취소된 수료예요" : `수료를 취소했어요 — 번호 ${r?.certNo || ""}는 남아요`);

// ---------- 오류 ----------
const CERT_ERR = {
  "course-archived": "보관한 강좌라 수료 확정·확인 체크를 할 수 없어요",
  "not-confirmed": "신청 현황에서 확정된 분만 수료할 수 있어요 — 새로 불러올게요",
  "not-assigned": "맡은 강좌가 아니에요",
  "wrong-course": "다른 강좌의 신청이 섞였어요 — 새로 불러올게요",
  "not-found": "강좌나 신청을 찾지 못했어요 — 새로 불러올게요",
  "not-completed": "수료하지 않은 분이에요 — 새로 불러올게요",
  "bad-id": "잘못된 요청이에요 — 새로고침해 주세요",
  "bad-ids": "잘못된 요청이에요 — 새로고침해 주세요",
  "bad-done": "잘못된 요청이에요 — 새로고침해 주세요",
  "too-many": "한 번에 2,000분까지 확정할 수 있어요 — 나눠서 확정해 주세요",
  forbidden: "수료증 설정은 교육 총괄만 바꿀 수 있어요",
  nothing: "바꾼 것이 없어요",
  "bad-issuer": "발급 명의를 다시 적어 주세요",
  "bad-body": "문안에 쓸 수 없는 글자가 있어요 — 다시 적어 주세요",
  "no-body": "문안을 적어 주세요",
  "bad-seal": "직인은 PNG·JPG 그림만 올릴 수 있어요",
  "seal-too-big": "직인 그림이 너무 커요 — 300KB 이하로 올려 주세요",
};
// 서버 답 → 한국말(모르면 빈 글 — 부르는 쪽이 공용 errorText 로) · too-long 은 칸(field)으로 가른다
//   ids 가 붙은 거절(not-confirmed·wrong-course·not-found)은 그 분들 이름을 덧붙인다(people 에서 찾은 것만 · 다섯 분까지)
export function certErrorText(r, people) {
  if (r?.error === "too-long") return r.field === "body" ? "문안은 300자까지 적을 수 있어요" : r.field === "issuer" ? `발급 명의는 ${ISSUER_MAX}자까지 적을 수 있어요` : "";
  const base = CERT_ERR[r?.error] || "";
  if (!base || !Array.isArray(r?.ids) || !r.ids.length) return base;
  const by = new Map((people || []).map((p) => [Number(p.id), p.name]));
  const names = r.ids.map((id) => by.get(Number(id))).filter(Boolean);
  if (!names.length) return base;
  return `${base} (${names.slice(0, 5).join("·")}${names.length > 5 ? ` 외 ${names.length - 5}분` : ""})`;
}
// 거절 뒤 무엇을 다시 불러올지 — 강좌째(맡은 강좌에서 빠졌다) · 명단만(상태가 바뀌었다) · 없음
export function reloadAfter(code) {
  if (code === "not-assigned") return "courses";
  if (["not-found", "not-confirmed", "wrong-course", "not-completed", "course-archived"].includes(code)) return "list";
  return "";
}

// ---------- 인쇄 ----------
// eduCertPrint 답 → 수료증 한 장마다 certHtml 에 넣을 값
export const printCerts = (d) => (d?.people || []).map((p) => ({ name: p.name, title: d.course?.title, term: d.course?.term, from: d.course?.from,
  to: d.course?.to, certNo: p.certNo, issuedOn: p.issuedOn, issuer: d.issuer, body: d.body, seal: d.seal }));
export const NO_PRINT = "수료한 분이 아직 없어요 — 먼저 수료를 확정해 주세요";

// ---------- 수료증 설정 ----------
export const ISSUER_MAX = 26, BODY_MAX = 300;   // 명의 26자 — 서버 CERT_ISSUER_MAX 와 같다(직인까지 틀 안)
export const BODY_HINT = "{과정} 자리에 강좌 이름이 들어가요";
const cpLen = (s) => Array.from(String(s || "")).length;
// 문안 {과정} 채우기(서버 eduCertBody 와 같은 셈 — 미리보기용)
export const fillBody = (body, title) => String(body == null ? "" : body).split("{과정}").join(String(title == null ? "" : title));
// 서버가 다듬는 대로 — 명의는 한 줄(빈칸 하나) · 문안은 줄바꿈 \n · 앞뒤 빈칸 뗌
export const normIssuer = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
export const normBody = (s) => String(s ?? "").normalize("NFC").replace(/\r\n?/g, "\n").trim();
export const countText = (s, max) => `${cpLen(s)}/${max}`;
// 저장할 칸만 — cur = 지금 설정(서버) · next = 창의 값 {issuer, body, seal} → {ok, patch} · {ok:false, message}
//   바뀐 칸만 보낸다(서버도 보낸 칸만 바꾼다 · 글만 고칠 때 직인을 다시 보내지 않는다). 아무것도 안 바뀌면 patch 가 빈 것.
export function settingsPatch(cur, next) {
  const c = cur || {}, x = next || {};
  const issuer = normIssuer(x.issuer), body = normBody(x.body);
  if (cpLen(issuer) > ISSUER_MAX) return { ok: false, message: `발급 명의는 ${ISSUER_MAX}자까지 적을 수 있어요` };
  if (!body) return { ok: false, message: "문안을 적어 주세요" };
  if (cpLen(body) > BODY_MAX) return { ok: false, message: `문안은 ${BODY_MAX}자까지 적을 수 있어요` };
  const patch = {};
  if (issuer !== normIssuer(c.issuer)) patch.issuer = issuer;
  if (body !== normBody(c.body)) patch.body = body;
  if ((x.seal ?? null) !== (c.seal ?? null)) patch.seal = x.seal ?? null;
  return { ok: true, patch };
}

// ---------- 직인 그림(창이 캔버스로 다듬는다 — 여기는 셈만) ----------
export const SEAL_MAX_SIDE = 600;            // 긴 쪽을 이만큼 안으로
export const SEAL_STEPS = [600, 480, 360];   // 300KB 를 넘으면 한 단계씩 더 줄여 본다
export const SEAL_MAX_BYTES = 300 * 1024;    // 서버 checkCertSeal 과 같다(풀었을 때 바이트)
export const SEAL_TYPES = ["image/png", "image/jpeg", "image/gif"];
// 긴 쪽이 max 안으로 오게(작으면 그대로) — 정수 · 최소 1
export function fitSize(w, h, max = SEAL_MAX_SIDE) {
  const W = Math.max(1, Math.round(Number(w) || 1)), H = Math.max(1, Math.round(Number(h) || 1));
  const k = Math.min(1, max / Math.max(W, H));
  return { w: Math.max(1, Math.round(W * k)), h: Math.max(1, Math.round(H * k)) };
}
// data URL 을 풀었을 때 바이트(서버 checkCertSeal 과 같은 셈)
export function dataUrlBytes(url) {
  const m = /^data:[^,]*;base64,([A-Za-z0-9+/]*={0,2})$/.exec(String(url || ""));
  if (!m) return Infinity;
  const b = m[1];
  return (b.length / 4) * 3 - (b.endsWith("==") ? 2 : b.endsWith("=") ? 1 : 0);
}
// RGBA 바이트에 투명한 칸이 있나(알파 250 미만이 하나라도)
export function hasAlpha(data) {
  for (let i = 3; i < (data?.length || 0); i += 4) if (data[i] < 250) return true;
  return false;
}
// 흰 바탕을 투명하게(직인 PNG 를 만드는 식) — 가장 옅은 칸(min(r,g,b))이 hi 이상이면 투명, lo~hi 사이는 차츰 투명. 붉은 인주 칸은 그대로.
//   data 를 고쳐 쓰고 돌려준다(Uint8ClampedArray · 배열 모두 됨)
export function whiteToAlpha(data, lo = 200, hi = 242) {
  for (let i = 0; i + 3 < data.length; i += 4) {
    const m = Math.min(data[i], data[i + 1], data[i + 2]);
    if (m >= hi) data[i + 3] = 0;
    else if (m > lo) data[i + 3] = Math.round(data[i + 3] * (hi - m) / (hi - lo));
  }
  return data;
}
// 내보낼 꼴 — 투명이 있거나 투명하게 만들면 PNG · 아니면(바탕 그대로인 JPG) JPEG(작다)
export const sealOutType = (mime, alpha) => (alpha || mime !== "image/jpeg" ? "image/png" : "image/jpeg");
export const SEAL_HINT = "PNG·JPG(GIF 는 PNG 로 바꿔요) · 600px 안으로 줄이고 300KB 까지 · 바탕이 투명한 PNG 가 가장 깔끔해요";
export function sealFileError(file) {
  if (!file) return "";
  if (!SEAL_TYPES.includes(file.type)) return "직인은 PNG·JPG·GIF 그림만 올릴 수 있어요";
  if (file.size > 10 * 1024 * 1024) return "그림 파일이 너무 커요 — 10MB 아래 그림으로 골라 주세요";
  return "";
}
export const SEAL_TOO_BIG = "직인 그림을 300KB 아래로 줄이지 못했어요 — 바탕이 투명한 더 단순한 그림으로 올려 주세요";

// 교육 총괄(설정 단추) — 화면에서 숨기는 것은 편의일 뿐, 막는 것은 서버(eduCertSettings* 「education」 · eduChief)
export const isChief = (roles) => Array.isArray(roles) && roles.some((r) => r === "education" || r === "super");

// 맡은 강좌가 없을 때·확정자가 없을 때 안내
export const EMPTY_ASSIGNED = "맡은 강좌가 아직 없어요 — 교육 총괄께 「📚 강좌 관리」에서 담당자로 넣어 달라고 말씀해 주세요";
export const EMPTY_ALL = "아직 강좌가 없어요 — 「📚 강좌 관리」에서 먼저 만들어 주세요";
export const NO_PEOPLE = "확정된 분이 아직 없어요 — 「📝 신청 현황」에서 확정하면 여기 보여요";
export const ARCHIVED_NOTE = "보관한 강좌예요 — 수료 확정·확인 체크는 할 수 없고, 수료 취소만 돼요";
