// 교인 찾기 — 한 분 자세히 창의 본문(2026-09-29). 순수 함수: DOM 을 쓰지 않는다(tests/person-detail.test.mjs 가 읽는다).
// ⚠️ dialog 본문은 white-space:pre-line — 여기서 만드는 html 에 줄바꿈 글자를 넣지 않는다(값 속 줄바꿈은 빈칸으로).
// ⚠️ 모든 값은 esc. 가족 단추의 data-fam · data-fam-all 은 search.js openPerson 이 읽는다(이름을 바꾸지 말 것).
// 모양: 넓으면 왼쪽(사진·이름·직분·소속·나이·전화) | 오른쪽(묶음) 두 단, 좁으면 한 단 — css/admin.css 「.dlg.pd」.
import { esc } from "../../core/ui.js";
import { affText, initialOf, detailSections } from "./people-logic.js";

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const t = (v) => esc(String(v ?? "").replace(/[\r\n]+/g, " ").trim());
const ageOf = (x) => (x.age !== undefined && x.age !== null && x.age !== "" ? `${x.age}세` : "");

function telHtml(phone, name) {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  return `<a class="pd-tel" href="tel:${d}" aria-label="${t(name)}에게 전화 ${t(phone)}"><span aria-hidden="true">📞</span>${t(phone)}</a>`;
}

const fieldHtml = (x) => `<div class="pd-f${x.wide ? " w" : ""}"><dt>${t(x.label)}</dt><dd>${
  x.tel ? telHtml(x.value, "") || t(x.value) : t(x.value)}</dd></div>`;

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
  const tels = [p.phone1, p.phone2].map((x) => telHtml(x, name)).join("");

  const secs = detailSections(p);
  const famBody = familyHtml(p, family);
  if (famBody && !secs.some((s) => s.key === "family")) secs.push({ key: "family", title: "가족", fields: [] });
  const secHtml = secs.map((s) => {
    const count = s.key === "family" && famBody ? `<span class="pd-cnt">${family.length + 1}명</span>` : "";
    const grid = s.fields.length ? `<dl class="pd-grid">${s.fields.map(fieldHtml).join("")}</dl>` : "";
    return `<section class="pd-sec"><h4 class="pd-st">${t(s.title)}${count}</h4>${grid}${s.key === "family" ? famBody : ""}</section>`;
  }).join("");

  return `<div class="pd-wrap"><div class="pd-side">${photo}<div class="pd-id">` +
    `<h3 class="pd-name">${t(name || "이름 없음")}</h3>` +
    (pos ? `<span class="pd-pos">${t(pos)}</span>` : "") +
    (aff ? `<p class="pd-aff">${t(aff)}</p>` : "") +
    (age ? `<p class="pd-age">${t(age)}</p>` : "") +
    `</div><div class="pd-tels">${tels || `<p class="pd-none">연락처 없음</p>`}</div></div>` +
    `<div class="pd-main">${secHtml || `<p class="pd-none">더 적힌 내용이 없어요</p>`}</div></div>`;
}
