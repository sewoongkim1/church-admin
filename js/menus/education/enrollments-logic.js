// 📝 신청 현황 — 순수 함수(시험이 읽는다 · tests/edu-enrollments-logic.test.mjs)
export function groupByStatus(list) {
  const g = { confirmed: [], waitlisted: [], applied: [], cancelled: [], declined: [] };
  for (const e of list || []) (g[e.status] || (g[e.status] = [])).push(e);
  g.waitlisted.sort((a, b) => (a.waitNo || 0) - (b.waitNo || 0));
  return g;
}

export function actionsFor(e) {
  switch (e.status) {
    case "applied": return [{ op: "confirm", label: "확정" }, { op: "waitlist", label: "대기로" }, { op: "decline", label: "반려", danger: true }];
    case "waitlisted": return [{ op: "confirm", label: "확정" }, { op: "cancel", label: "취소", danger: true }];
    case "confirmed": return [{ op: "cancel", label: "취소", danger: true }];
    default: return [{ op: "reopen", label: "다시 받기" }];
  }
}

export function capacityLine(c) {
  const cap = c.capacity == null ? "정원 제한 없음" : `정원 ${c.capacity}`;
  const parts = [cap, `확정 ${c.counts.confirmed}`];
  if (c.counts.waitlisted) parts.push(`대기 ${c.counts.waitlisted}`);
  if (c.counts.applied) parts.push(`승인 기다림 ${c.counts.applied}`);
  return parts.join(" · ");
}

const WORDS = { full: "정원이 찼어요", "too-late": "이미 시작한 강좌예요", "not-active": "이미 처리된 신청이에요",
  "not-found": "찾을 수 없어요", "bad-ident": "이름을 확인해 주세요", "not-open": "모집 중이 아니에요",
  changed: "명부가 바뀌었어요. 다시 찾아 주세요", "was-declined": "반려했던 분이에요",   // 과제 4 검토 반영(2026-10-05)
  "course-closed": "끝난·보관된 강좌라 바꿀 수 없어요",   // edu_staff_set(최종 검토 2026-10-05)
  "has-cert": "수료한 분은 취소·변경할 수 없어요 — 「🎓 수료」에서 먼저 수료를 취소해 주세요" };   // 3단계(2026-10-05) — 번호 줄은 SQL 이 확정 그대로 둔다
export function errorWord(code) { return WORDS[code] || `저장하지 못했어요 (${code})`; }

// 엑셀 파일 이름 — 교육신청_{제목}_{오늘}.xlsx · 파일 이름에 못 쓰는 글자(\ / : * ? " < > |)·제어 글자는 빼고,
//   끝의 점·빈칸(윈도가 떼어 버린다)도 빼고, 제목은 60자까지만. 다듬는 규칙은 fileTitle 한 곳(✅ 출석부 엑셀도 쓴다).
export function fileTitle(title) {
  const t = String(title || "").replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return Array.from(t).slice(0, 60).join("").replace(/[. ]+$/, "").trim() || "강좌";
}
export function exportFileName(title, today) {
  return `교육신청_${fileTitle(title)}_${today}.xlsx`;
}

// 아는 오류 코드인가(모르면 공용 errorText 로)
export const hasErrorWord = (code) => Object.prototype.hasOwnProperty.call(WORDS, code);

// 찾은 후보 카드 → eduEnrollAdd 인자(교인ID 는 없다 — 이름·차례·소속 확인값 다섯 칸)
export function pickArgs(searched, i, p) {
  const q = p || {};
  return { name: searched, pick: i, check: { who_type: q.who_type || "", group: q.group || "", sub: q.sub || "", church_mok: q.church_mok || "", position: q.position || "" } };
}

// 신청 시각 짧게 — 「1/22 19:00 신청」 (한국 시각)
export function shortApplied(iso) {
  const t = Date.parse(iso || "");
  if (isNaN(t)) return "";
  const d = new Date(t + 9 * 3600 * 1000), p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} 신청`;
}

// 대신 등록이 성공했을 때 알릴 말
export function addDoneText(r) {
  if (r && r.already) return "이미 명단에 있어요";
  if (r && r.revived) return "다시 받았어요";
  return "등록했어요";
}

// 단추를 누르기 전 확인 창 글(확인이 필요 없으면 "")
export function confirmTextFor(op, name) {
  if (op === "cancel") return `${name} 님의 신청을 취소할까요? 선착순 강좌면 대기 첫 분이 확정돼요.`;
  if (op === "decline") return `${name} 님의 신청을 반려할까요?`;
  if (op === "waitlist") return `${name} 님을 대기로 돌릴까요? 대기 줄 맨 뒤로 가요.`;
  return "";
}

// 같은 분일 수 있는 줄(서버 maybeDup — 앱 신청 줄과 대신 등록 줄이 같은 이름) 표시. 동명이인일 수 있어 막지 않고 알리기만 한다.
export const DUP_TEXT = "같은 분일 수 있어요";
export const dupBadge = (e) => (e && e.maybeDup ? `<span class="badge dup" title="앱 신청과 대신 등록이 같은 이름이에요 — 같은 분이면 한 줄을 취소해 주세요">${DUP_TEXT}</span>` : "");

// 직접 입력(새가족) 세부 칸 아래 안내 — 같은 이름·소속·세부면 같은 분으로 본다(신원 키 staff|구분|소속|세부|이름)
export const TYPED_SUB_HINT = "같은 이름의 새가족이 있으면 세부(예: 연락할 분·반)를 적어 주세요";

// ---------- 여러 명 한꺼번에 대신 등록(2026-10-16 친구 「여러 명 한꺼번에 등록」) ----------
// 붙여 넣은 명단 → 이름마다 교인명부에서 찾기(eduPeopleLookup) → 한 분이면 저절로 고름 → 「고른 N명 등록」은 한 분씩 eduEnrollAdd
//   (서버 길은 「교인명부에서 찾기」와 똑같다 — 교인ID 는 화면에 없고 서버가 같은 찾기를 다시 돌려 확인한다).
// 같은 이름이 여럿이면 이름 뒤의 힌트로 고른다 — 「김경희 섬김-18」 · 「김경희(섬김 18목장)」 · 「김경희 권사」.
export const BULK_MAX = 60;   // 한 번에 찾는 이름 수(찾기 한 번이 열람 기록 한 줄이다)
const POS_WORD = /(안수집사|권사|집사|장로)/;
// 붙여 넣은 글 → { items: [{ name, hint }], skipped: [글 조각] } — 줄 · 쉼표로 나눈다(빈칸 하나는 이름과 힌트 사이)
//   이름 꼴(한글 2~5자)이 아니면 건너뛴다(「2대」 · 제목 줄) · 줄 끝 인원 수(「김정화  8」)는 뗀다 · 같은 이름 · 힌트는 한 번만
export function parseNameList(text) {
  const items = [], skipped = [], seen = new Set();
  const chunks = String(text ?? "").normalize("NFC").split(/[\r\n,，、;\t]+/).map((s) => s.trim()).filter(Boolean);
  for (const raw of chunks) {
    const c = raw.replace(/(?:\s{2,}\d+|\s+\d+\s*명)\s*$/, "").trim();   // 빈칸 둘 이상 뒤의 수 · 「8명」만 인원 수(「김경희 18」의 18 은 목장 힌트)
    const m = /^([가-힣]{2,5})(?:\s*\(([^)]*)\)|\s+(.+))?$/.exec(c);
    if (!m) { skipped.push(raw); continue; }
    const hint = String(m[2] ?? m[3] ?? "").trim();
    const key = m[1] + "|" + hint;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ name: m[1], hint: /[가-힣\d]/.test(hint) ? hint : "" });
  }
  return { items, skipped };
}
// 「섬김-18목장」 · 「섬김 18」 · 「섬김교구 18목장 권사」 → { gu, num, pos } (없는 칸은 "" · null)
export function hintOf(text) {
  const t = String(text ?? "").normalize("NFC");
  const pos = (POS_WORD.exec(t) || [])[1] || "";
  const rest = t.replace(/(시무|명예|은퇴|협동)?(안수집사|권사|집사|장로)/g, " ").replace(/(\d+)/g, " $1 ");
  const words = rest.split(/[\s\-·()]+/).map((w) => w.replace(/(교구|목장)$/, "")).filter(Boolean);
  const gu = words.find((w) => /^[가-힣]+$/.test(w)) || "";
  const n = words.find((w) => /^\d+$/.test(w));
  return { gu, num: n ? Number(n) : null, pos };
}
// 찾은 후보(lookupCandOut 칸)가 힌트와 맞나 — 교적 목장(church_mok)을 먼저, 없으면 앱 꼴 소속(group · sub)
export function candFits(p, hint) {
  const h = typeof hint === "string" ? hintOf(hint) : hint;
  if (!h || (!h.gu && h.num === null && !h.pos)) return true;
  const c = hintOf(p?.church_mok || "");
  const gu = c.gu || String(p?.group ?? "").trim();
  const num = c.num ?? (/(\d+)/.exec(String(p?.sub ?? "")) ? Number(/(\d+)/.exec(String(p.sub))[1]) : null);
  if (h.gu && gu !== h.gu && String(p?.group ?? "").trim() !== h.gu) return false;
  if (h.num !== null && num !== h.num) return false;
  if (h.pos && !String(p?.position ?? "").includes(h.pos)) return false;
  return true;
}
// 저절로 고르기 — { pick: 후보 차례 | null, why } · why: one(한 분뿐) · hint(힌트로 한 분) · many(골라 주세요) · none(명부에 없음) · hint-none(힌트에 맞는 분 없음)
export function autoPick(cands, hint) {
  const list = Array.isArray(cands) ? cands : [];
  if (!list.length) return { pick: null, why: "none" };
  const fit = list.map((p, i) => (candFits(p, hint) ? i : -1)).filter((i) => i >= 0);
  const hinted = !!String(hint ?? "").trim();
  if (fit.length === 1) return { pick: fit[0], why: hinted && list.length > 1 ? "hint" : "one" };
  if (!fit.length) return { pick: null, why: "hint-none" };
  return { pick: null, why: "many" };
}
const WHY_TEXT = { one: "한 분", hint: "목장으로 고름", many: "여러 분 — 골라 주세요", none: "교인명부에 없어요", "hint-none": "적은 목장과 맞는 분이 없어요 — 골라 주세요" };
export const bulkWhyText = (why) => WHY_TEXT[why] || "";
// 등록 결과 한 줄 — eduEnrollAdd 응답(반려했던 분은 한꺼번에 되살리지 않는다 — 하나씩 찾기에서 확인 뒤)
export function bulkDoneText(r) {
  if (r && r.ok) return addDoneText(r) + (r.status === "waitlisted" ? " · 대기" : r.status === "confirmed" ? " · 확정" : "");
  if (r && r.error === "was-declined") return "반려했던 분이에요 — 「교인명부에서 찾기」에서 하나씩 넣어 주세요";
  return "";
}
