// 사역신청·담당자 이름을 누르면 교적 창 — 이름 단추와 보낼 것(순수 함수 · DOM 없음 · 2026-09-30 친구 요청).
// tests/person-link.test.mjs 가 같은 파일을 읽는다. 창은 성경필사와 **같은 것**(js/menus/bibleevent/person-popup.js openChurchPerson)을
// action:"ministryPerson" 으로 부른다 — 서버(ministryPerson)가 부른 분의 역할로 「자세히」 창(교인명부·총괄) / 작은 창(사역신청만)을 가른다.
// 붙는 곳: 📋 신청 현황(카드·표·사람별 묶음 머리) · 🎉 임명현황(사람 칩) · 📋 종이 명단 올리기(살펴본 결과 줄) · 🔑 담당자·역할.
// 🗂️ 사역팀 정보의 「지금 섬기는 분」은 담당자가 손으로 적는 자유 글(소속 없음)이라 붙이지 않는다.
// ⚠️ 단추에는 **줄 열쇠만** 싣는다(data-person = 신청 id · 배열 자리 · 담당자 id) — 전화번호를 DOM(data-*)에 올리지 않는다.
//    누르면 화면이 메모리의 줄을 열쇠로 찾아 아래 …Ask 로 보낼 것을 만든다(번호는 서버가 동명이인을 가리는 데만 쓰고 응답·기록에 안 싣는다).
// ⚠️ 사람·서버 글자는 모두 esc — 이 파일이 만든 글이 그대로 innerHTML 로 들어간다. 줄바꿈 글자를 넣지 않는다.
import { esc } from "../../core/ui.js";

export const PERSON_ACTION = "ministryPerson";

const txt = (v) => String(v ?? "").trim().replace(/\s+/g, " ");

// 이름 단추 — 성경필사와 같은 .be-name(이름처럼 보이고 누르면 교적 창). text = 보이는 글자(기본은 이름).
// chip=true 는 🎉 임명현황의 사람 칩(「이름-화평20」) — 칩 모양(.ap-p) 그대로 단추로(.mn-pl-chip · css 「사역신청·담당자 이름」 블록).
// 이름이 비면 단추로 만들지 않는다(서버가 no-name 으로 돌려보낼 뿐이다) — 보이는 글자만 전과 같은 꼴(<b> · 칩은 <span class="ap-p">)로.
export function personLinkHtml(key, name, { text, chip = false } = {}) {
  const t = txt(text ?? name) || "이름 없음";
  if (!txt(name)) return chip ? `<span class="ap-p">${esc(t)}</span>` : `<b>${esc(t)}</b>`;
  return `<button type="button" class="${chip ? "ap-p mn-pl-chip" : "be-name"}" data-person="${esc(key)}" ` +
    `aria-label="${esc(t)} — 교적 보기"><b>${esc(t)}</b></button>`;
}

// 신청 현황·임명현황 줄 → 보낼 것. who(「화평 20목장」·「중등부 3학년」)는 서버가 ministryList 의 교적 표시와 같은 함수로 읽는다.
// 번호는 있을 때만(결정이 나면 서버가 지운다 · 임명현황 응답엔 아예 없다).
export function rowAsk(r) {
  const phone = txt(r?.phone);
  return { name: txt(r?.name), who: txt(r?.who), ...(phone ? { phone } : {}) };
}

// 종이 명단 살펴본 줄(서버 ministryPaperOne — gu·mok·name·phone) → 보낼 것. 종이 명단은 늘 교구 줄이다(서버 applicantFromPaper 와 같게).
export function paperAsk(r) {
  const phone = txt(r?.phone);
  return { name: txt(r?.name), who_type: "교구", group: txt(r?.gu), sub: txt(r?.mok), ...(phone ? { phone } : {}) };
}

// 담당자(admin_members — 본인이 적은 이름·소속) → 보낼 것. 교회학교면 부서·학년, 그 밖은 교구·목장(ui.js affiliation 과 같은 가름).
// 번호는 없다(담당자 표에 번호 칸이 없다).
export function memberAsk(m) {
  return m?.type === "교회학교"
    ? { name: txt(m?.name), who_type: "교회학교", group: txt(m?.bu), sub: txt(m?.grade) }
    : { name: txt(m?.name), who_type: "교구", group: txt(m?.gu), sub: txt(m?.mok) };
}
