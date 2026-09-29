// 이름을 누르면 교적 창 — 화면 논리(순수 함수 · 2026-09-30 · 계획 Task 16). tests/be-person-logic.test.mjs 가 같은 파일을 읽는다(DOM 없음).
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §0 「이름을 누르면 교적 창」·§3 · 친구 결정 §8-8.
// ⚠️ 이름 단추에는 명단 줄의 이름·구분·소속·세부만 싣는다(서버 evPerson 이 받는 넷) — 교적 값은 서버 답으로만 창에 들어간다.
// ⚠️ 작은 창(ui.js dialog)의 본문은 white-space:pre-line 이다 — 여기서 만드는 HTML 에 줄바꿈 글자를 넣지 않는다(설계 §3 「팝업」).
// ⚠️ 사람·서버 글자는 모두 esc — 이 파일이 만든 글이 그대로 innerHTML 로 들어간다.
import { esc } from "../../core/ui.js";
import { churchBadgeHtml } from "../people/church-badge.js";
import { GU_ORDER, norm, whoText } from "./roster-logic.js";

export const NOT_FOUND = "교인명부에서 찾지 못했어요";
// 「아직 모른다」와 「없다」를 뭉개지 않는다 — 명부가 한 번도 안 올라왔으면 「찾지 못했어요」라 하지 않는다
export const NO_DIRECTORY = "교인명부가 아직 올라오지 않아 찾을 수 없어요";
export const CONTACT_NOTE = "연락처·사진은 교인명부 담당자만 볼 수 있어요";
// 「자세히」 창의 「👪 가족 모두 목록으로」 — 이 메뉴에는 가족 목록이 없다(🔎 교인 찾기에서 본다)
export const FAMILY_NOTE = "가족 목록은 🔎 교인 찾기에서 그분을 찾아 「가족 모두 목록으로」로 볼 수 있어요";

// 단추에 싣는 것(명단 줄 그대로) — data-act="person" 은 📋 회차·명단 · 👤 사람별 이력·통계의 눌림 처리가 읽는다
export function personAttrs(p) {
  return `data-act="person" data-name="${esc(norm(p?.name))}" data-who="${esc(norm(p?.who_type))}" ` +
    `data-group="${esc(norm(p?.group))}" data-sub="${esc(norm(p?.sub))}"`;
}

// 단추의 dataset(브라우저가 &lt; 같은 것을 풀어 준 글자) → evPerson 에 보낼 것
export const personPayload = (ds) => ({
  name: norm(ds?.name), who_type: norm(ds?.who), group: norm(ds?.group), sub: norm(ds?.sub),
});

// 이름 단추 — 보이는 글자는 이름(기본) 또는 「이름 · 소속」 이름표(👤 이력의 묶음 머리). 이름처럼 보이고 누르면 교적 창.
export function nameButtonHtml(p, text) {
  const t = norm(text ?? p?.name) || "이름 없음";
  return `<button type="button" class="be-name" ${personAttrs(p)} aria-label="${esc(t)} — 교적 보기"><b>${esc(t)}</b></button>`;
}

// 👤 통계 「여러 번 참여한 분」의 소속 한 줄(서버 affLabel — 「화평 20목장」·「소망 남성」·「중등부 3학년」·「(소속 없음)」)을
// 구분·소속·세부로 되읽는다. 통계 응답(repeaters)에는 소속 칸이 따로 없어서다(Task 4·5 의 응답 모양을 바꾸지 않는다).
// 교구 이름 여덟(GU_ORDER)이 아니면서 「N목장」도 아니면 교회학교로 본다 — 서버 affLabel 이 교구 줄의 숫자 목장에만 「목장」을 붙이므로
// 「시험 0목장」처럼 모르는 교구도 교구로 돌아온다. 틀리게 읽어도 교적 창의 「누구인지 고르기」만 달라진다(이름으로 찾는다).
export function rowFromLabel(label) {
  const s = norm(label);
  if (!s || s === "(소속 없음)") return { who_type: "", group: "", sub: "" };
  const m = /^(\S+) (\d+)목장$/.exec(s);
  if (m) return { who_type: "교구", group: m[1], sub: m[2] };
  const i = s.indexOf(" ");
  const head = i < 0 ? s : s.slice(0, i), rest = i < 0 ? "" : s.slice(i + 1);
  return { who_type: GU_ORDER.includes(head) ? "교구" : "교회학교", group: head, sub: rest };
}

// 서버 답 → 할 일. full 은 고른 분(pick)이 있으면 곧바로 「자세히」 창, 없으면 고르개.
export function personDecision(r) {
  if (!r || !r.ok) return { kind: "error" };
  if (r.mode === "none") return { kind: "none" };
  if (r.mode === "full") {
    const c = Array.isArray(r.candidates) ? r.candidates : [];
    if (!c.length) return { kind: "empty" };
    if (Number.isInteger(r.pick) && c[r.pick]) return { kind: "open", id: String(c[r.pick].person_id) };
    return { kind: "choose" };
  }
  if (r.mode === "basic") return Array.isArray(r.people) && r.people.length ? { kind: "basic" } : { kind: "empty" };
  return { kind: "error" };
}

// 고르개(pickOne)에 넣을 후보 — 이름 · 「소속 · 직분」
export const candOptions = (cands) => (cands || []).map((c) => ({
  value: String(c.person_id), label: norm(c.name) || "이름 없음",
  hint: [norm(c.label), norm(c.position)].filter(Boolean).join(" · "),
}));

// 서버가 준 수(total — 스무 분으로 자르기 전)와 보여 주는 수. total 이 없거나 이상하면 보여 주는 수로.
const shownTotal = (total, shown) => (Number.isInteger(total) && total >= shown ? total : shown);

// 고르개 제목 — 같은 이름이 스무 분을 넘으면 「앞 20분」임을 적는다(목록이 다인 줄 알고 찾는 분이 없다고 여기지 않게)
export function chooseTitle(name, r) {
  const n = Array.isArray(r?.candidates) ? r.candidates.length : 0;
  const total = shownTotal(r?.total, n);
  return `${norm(name) || "이름 없음"} — 어느 분인가요?` + (total > n ? ` (같은 이름 ${total}분 중 앞 ${n}분)` : "");
}

// 성경필사 역할만 — 작은 창 본문. 고른 분이 있으면 그 한 분, 못 골랐으면 같은 이름 모두(서버가 스무 분까지 준다).
const personLi = (p) => `<li class="be-pp-p"><b class="be-pp-nm">${esc(norm(p.name) || "이름 없음")}</b>` +
  (norm(p.position) ? `<em class="be-pos">${esc(norm(p.position))}</em>` : "") +
  `<span class="be-pp-aff">${esc(whoText(p) || "소속을 정하지 못했어요(새가족 등)")}</span></li>`;
export function basicHtml(r) {
  const people = Array.isArray(r?.people) ? r.people : [];
  const one = Number.isInteger(r?.pick) && people[r.pick] ? people[r.pick] : null;
  // 같은 이름의 수는 서버의 total(자르기 전) — 스무 분만 받았어도 「21분」이라 적고 「앞 20분만」을 붙인다(옆 교적 표시 「같은 이름 21명」과 같게)
  const total = shownTotal(r?.total, people.length);
  const more = total > people.length ? `(앞 ${people.length}분만 보여요)` : "";
  const head = one ? "" : `<p class="be-pp-many">교인명부에 같은 이름이 <b>${total}분</b> 있어요${more} — 소속으로 누구인지 확인해 주세요</p>`;
  const cb = churchBadgeHtml(r?.church);
  return `<div class="be-pp">${head}<ul class="be-pp-list">${(one ? [one] : people).map(personLi).join("")}</ul>` +
    (cb ? `<p class="be-pp-cb">명단의 소속과 맞대 보면 ${cb}</p>` : "") +
    `<p class="be-pp-note">🔒 ${esc(CONTACT_NOTE)}</p></div>`;
}
