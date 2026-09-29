// 교인 찾기 — 한 분 자세히 창의 본문(2026-09-29). 순수 함수: DOM 을 쓰지 않는다(tests/person-detail.test.mjs 가 읽는다).
// ⚠️ dialog 본문은 white-space:pre-line — 여기서 만드는 html 에 줄바꿈 글자를 넣지 않는다(값 속 줄바꿈은 빈칸으로).
// ⚠️ 모든 값은 esc. 가족 단추의 data-fam · data-fam-all 은 search.js openPerson 이 읽는다(이름을 바꾸지 말 것).
// 모양: 넓으면 왼쪽(사진·이름·직분·소속·나이·전화) | 오른쪽(묶음) 두 단, 좁으면 한 단 — css/admin.css 「.dlg.pd」.
// 적힌 것이 적으면(.pd-empty·.pd-few) 창 자체를 좁혀 한 단으로 — 폭 판단이 @container 라 창 폭만 바꾸면 된다.
import { esc } from "../../core/ui.js";
import { affText, initialOf, detailSections } from "./people-logic.js";

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const t = (v) => esc(String(v ?? "").replace(/[\r\n]+/g, " ").trim());
const ageOf = (x) => (x.age !== undefined && x.age !== null && x.age !== "" ? `${x.age}세` : "");

// 수화기 그림 — 이모지(📞)는 기기마다 분홍·주황으로 그려져 남색 한 벌 속에서 혼자 튄다. currentColor 로 글자색을 따른다.
const TEL_SVG = '<svg class="pd-ico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<path fill="currentColor" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57' +
  '.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57' +
  '.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>';

// 번호 앞에 「휴대폰」·「전화」를 붙인다 — 번호 둘이 나란히 있으면 어느 쪽이 휴대폰인지 바로 보이게(01 로 시작하면 휴대폰)
function telHtml(phone, name) {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  const kind = d.startsWith("01") ? "휴대폰" : "전화";
  return `<a class="pd-tel" href="tel:${d}" aria-label="${t(name)}에게 전화 ${t(phone)}">${TEL_SVG}` +
    `<small class="pd-tel-k" aria-hidden="true">${kind}</small>${t(phone)}</a>`;
}

// 값 속 「 > 」(교인 구분·교회학교 경로)는 옅은 「›」로 — 본문과 같은 굵기의 꺾쇠는 코드처럼 시끄럽다.
// 앞뒤 빈칸은 남긴다(화면 읽기 도구는 aria-hidden 인 › 를 건너뛰고 낱말 사이 빈칸으로 읽는다).
const valHtml = (v) => t(v).replace(/ &gt; /g, ' <span class="pd-sep" aria-hidden="true">›</span> ');
const fieldHtml = (x) => `<div class="pd-f${x.wide ? " w" : ""}"><dt>${t(x.label)}</dt><dd>${valHtml(x.value)}</dd></div>`;

// 칸이 이만큼 이하이고 가족 단추도 없으면 창을 좁혀 한 단(사진 옆에 이름)으로 — 넓은 창에 오른쪽이 텅 비지 않게
export const FEW_FIELDS = 4;

function familyHtml(p, family) {
  if (!has(p.household_id) || !family.length) return "";
  const chips = family.map((f) => {
    const sub = [f.household_rel, ageOf(f)].filter(has).join(" · ");
    return `<button type="button" class="pd-chip" data-fam="${t(f.person_id)}"><b>${t(f.name)}</b>${
      sub ? `<small>${t(sub)}</small>` : ""}</button>`;
  }).join("");
  return `<div class="pd-fams">${chips}<button type="button" class="pd-fam-all" data-fam-all="${t(p.household_id)}">` +
    `<span aria-hidden="true">👪</span> 가족 모두 목록으로</button></div>`;
}

export function personDetailHtml(p, family = []) {
  p = p || {};
  family = Array.isArray(family) ? family : [];
  const name = has(p.name) ? String(p.name).trim() : "";
  const pos = [p.position, p.position_detail].filter(has).join(" · ");
  const aff = affText(p);
  const age = [p.gender, ageOf(p)].filter(has).join(" · ");
  const photo = p.photo
    ? `<img class="pd-photo" src="${t(p.photo)}" alt="${t(name)} 사진" referrerpolicy="no-referrer" data-ini="${t(initialOf(name))}">`
    : `<div class="pd-photo pd-ini" aria-hidden="true">${t(initialOf(name))}</div>`;
  const tels = [p.phone1, p.phone2].map((x) => telHtml(x, name || "이름 없음")).join("");

  const secs = detailSections(p);
  const famBody = familyHtml(p, family);
  if (famBody) {
    let fs = secs.find((s) => s.key === "family");
    if (!fs) secs.push((fs = { key: "family", title: "가족", fields: [] }));
    // 세대주가 명단에 없으면 그렇다고 적는다(옛 창의 「세대주 (명단에 없음)」과 같게)
    if (!has(p.household_head)) {
      fs.fields = fs.fields.filter((x) => x.label !== "신앙세대주");
      fs.fields.push({ label: "신앙세대주", value: ["(명단에 없음)", p.household_rel].filter(has).join(" · ") });
    }
  }
  const nFields = secs.reduce((n, s) => n + s.fields.length, 0);
  const shape = !secs.length ? " pd-empty" : !famBody && nFields <= FEW_FIELDS ? " pd-few" : "";
  const secHtml = secs.map((s) => {
    const count = s.key === "family" && famBody ? `<span class="pd-cnt">${family.length + 1}명</span>` : "";
    const grid = s.fields.length ? `<dl class="pd-grid">${s.fields.map(fieldHtml).join("")}</dl>` : "";
    return `<section class="pd-sec"><h4 class="pd-st">${t(s.title)}${count}</h4>${grid}${s.key === "family" ? famBody : ""}</section>`;
  }).join("");

  return `<div class="pd-wrap${shape}"><div class="pd-side">${photo}<div class="pd-id">` +
    `<h3 class="pd-name">${t(name || "이름 없음")}</h3>` +
    (pos ? `<span class="pd-pos">${t(pos)}</span>` : "") +
    (aff ? `<p class="pd-aff">${t(aff)}</p>` : "") +
    (age ? `<p class="pd-age">${t(age)}</p>` : "") +
    `</div><div class="pd-tels">${tels || `<p class="pd-none">연락처 없음</p>`}</div></div>` +
    `<div class="pd-main">${secHtml || `<p class="pd-none">더 적힌 내용이 없어요</p>`}</div></div>`;
}
