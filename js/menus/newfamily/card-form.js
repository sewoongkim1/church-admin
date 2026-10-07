// 새가족 등록카드 입력 창 — 종이 카드와 같은 차례(2026-10-07 · 설계 v2 §6 · 기획서 4-1)
//   서버: nfCardSave(새로·고치기) · nfPeopleFind(인도자를 교인명부에서). 값 ↔ 몸통은 nf-logic.js(시험).
//   주일 현장에서 휴대폰으로 넣는다 — 한 줄에 칸 하나 · 전화·생일은 숫자 자판 · 고르는 칸은 큰 단추.
//   꼭 있어야 하는 것: 등록일 · 본인 이름 · 사람마다 수료 대상 예/아니오 · 동의. 나머지는 「마저 채울 카드」로 남길 수 있다.
// ⚠️ 서버 글자는 모두 esc. 고르기·날짜는 picker.js 만(<select>·type="date" 금지).
import { esc, dialog, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne, pickDate, fmtDateLabel } from "../../core/picker.js";
import { SERVICES, blankPerson, cardToForm, formToCard, foundMok, foundOptions, nfWord } from "./nf-logic.js";

const failText = (r) => nfWord(r?.error) || errorText(r);
const seg = (key, opts, value) => `<div class="seg nf-seg" data-seg="${key}" role="group">${opts.map(([v, label]) =>
  `<button type="button" data-v="${esc(v)}" class="${String(value) === String(v) ? "on" : ""}" aria-pressed="${String(value) === String(v)}">${esc(label)}</button>`).join("")}</div>`;
const txt = (key, label, v, attrs = "") => `<label class="field"><span>${esc(label)}</span><input data-f="${key}" value="${esc(v)}" autocomplete="off" ${attrs}></label>`;

function personHtml(p, i) {
  const first = i === 0;
  return `<fieldset class="nf-person" data-person data-id="${esc(p.id || "")}">
    <legend>${first ? "새가족 본인" : `가족 ${i}`}${first ? "" : ` <button type="button" class="nf-x" data-del aria-label="이 줄 빼기">빼기</button>`}</legend>
    ${first ? "" : txt("relation", "관계", p.relation, `maxlength="10" placeholder="예: 배우자 · 자녀"`)}
    ${txt("name", "이름", p.name, `maxlength="20"`)}
    <div class="field"><span>성별</span>${seg("gender", [["남", "남"], ["여", "여"]], p.gender)}</div>
    ${txt("birth", "생년월일", p.birth, `inputmode="numeric" maxlength="14" placeholder="예: 19591015"`)}
    <label class="nf-check"><input type="checkbox" data-f="birthLunar" ${p.birthLunar ? "checked" : ""}> 음력</label>
    ${txt("phone", "휴대전화", p.phone, `inputmode="tel" maxlength="14" placeholder="010-0000-0000"`)}
    ${first ? txt("tel", "전화(집)", p.tel, `inputmode="tel" maxlength="14"`) : ""}
    <div class="field"><span>세례</span>${seg("baptized", [["yes", "받음"], ["no", "안 받음"], ["unknown", "모름"]], p.baptized)}</div>
    <div class="field nf-target"><span>수료 대상 <small>(교육 네 번을 받고 등록식에 서실 분 — 아이는 아니오 · 청년·장년은 본인께 여쭤 보세요)</small></span>
      ${seg("target", [["true", "예"], ["false", "아니오"]], p.target === null ? "" : String(p.target))}</div>
  </fieldset>`;
}
function guideHtml(g, i) {
  return `<div class="nf-guide" data-guide>
    <div class="nf-guide-h"><b>인도자 ${i + 1}</b> <button type="button" class="btn nf-find" data-find>🔎 교인명부에서</button></div>
    ${txt("gname", "이름", g.name, `maxlength="20"`)}${txt("gmok", "목장", g.mok, `maxlength="20" placeholder="예: 기쁨-25"`)}
    ${txt("gphone", "전화", g.phone, `inputmode="tel" maxlength="14"`)}</div>`;
}

function formHtml(f) {
  return `<input type="hidden" data-f="regDate" value="${esc(f.regDate)}">
    <div class="field"><span>등록일</span><button type="button" class="pk-field" data-date aria-haspopup="dialog" aria-expanded="false">
      <span class="pk-field-v">${esc(fmtDateLabel(f.regDate))}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>
    <input type="hidden" data-f="service" value="${esc(f.service)}">
    <div class="field"><span>예배</span><button type="button" class="pk-field${f.service ? "" : " empty"}" data-service aria-haspopup="dialog" aria-expanded="false">
      <span class="pk-field-v">${esc(f.service || "고르기")}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>
    ${txt("pastor", "담당 교역자", f.pastor, `maxlength="20"`)}
    <div data-people>${f.people.map(personHtml).join("")}</div>
    <button type="button" class="btn wide nf-add" data-add>＋ 가족 한 분 더</button>
    ${txt("address", "주소", f.address, `maxlength="120"`)}
    ${txt("carNo", "차량번호", f.carNo, `maxlength="20"`)}
    <label class="nf-check"><input type="checkbox" data-f="selfCome" ${f.selfCome ? "checked" : ""}> 인도자 없이 스스로 오심</label>
    <div data-guides ${f.selfCome ? "hidden" : ""}>${f.guides.map(guideHtml).join("")}</div>
    <label class="field"><span>비고</span><textarea data-f="note" maxlength="500" rows="3">${esc(f.note)}</textarea></label>
    <label class="nf-check nf-consent"><input type="checkbox" data-f="consent" ${f.consent ? "checked" : ""}> 카드의 「개인정보 제공에 동의합니다」에 체크하셨어요</label>
    <label class="nf-check"><input type="checkbox" data-f="draft" ${f.draft ? "checked" : ""}> 나머지 칸은 나중에 채울게요 <small class="muted">(「마저 채울 카드」로 남아요)</small></label>`;
}

const val = (root, k) => root.querySelector(`[data-f="${k}"]`);
const segVal = (box, key) => { const on = box.querySelector(`[data-seg="${key}"] button.on`); return on ? on.dataset.v : ""; };
function readForm(root, f0) {
  const people = [...root.querySelectorAll("[data-person]")].map((el) => {
    const g = (k) => { const i = el.querySelector(`[data-f="${k}"]`); return i ? i.value.trim() : ""; };
    const t = segVal(el, "target");
    return { id: el.dataset.id || "", relation: g("relation"), name: g("name"), gender: segVal(el, "gender"), birth: g("birth"),
      birthLunar: el.querySelector('[data-f="birthLunar"]').checked, phone: g("phone"), tel: g("tel"),
      baptized: segVal(el, "baptized") || "unknown", target: t === "" ? null : t === "true" };
  });
  const guides = [...root.querySelectorAll("[data-guide]")].map((el) => ({
    name: el.querySelector('[data-f="gname"]').value.trim(), mok: el.querySelector('[data-f="gmok"]').value.trim(), phone: el.querySelector('[data-f="gphone"]').value.trim() }));
  return { cardId: f0.cardId, base: f0.base, regDate: val(root, "regDate").value, service: val(root, "service").value, pastor: val(root, "pastor").value.trim(),
    address: val(root, "address").value.trim(), carNo: val(root, "carNo").value.trim(), note: val(root, "note").value.trim(),
    selfCome: val(root, "selfCome").checked, draft: val(root, "draft").checked, consent: val(root, "consent").checked, people, guides };
}

// → { cardId }(저장) · 닫았으면 null · 그사이 다른 분이 고쳤으면 "stale"(부른 쪽이 새로 불러온다)
//   got = nfCardGet 의 답(고치기) · 없으면 새 카드. today = 서버의 오늘.
export function openCardForm({ call, got = null, today }) {
  const f0 = cardToForm(got, today);
  const year = Number(String(today).slice(0, 4));
  let first = "", stale = false;
  return openForm({
    title: got ? "✏️ 카드 고치기" : "＋ 새가족 카드", okLabel: "저장",
    html: formHtml(f0),
    onOpen: (root) => {
      root.addEventListener("click", async (e) => {
        const sb = e.target.closest("[data-seg] button");
        if (sb) {
          for (const b of sb.parentElement.querySelectorAll("button")) { b.classList.toggle("on", b === sb); b.setAttribute("aria-pressed", String(b === sb)); }
          return;
        }
        if (e.target.closest("[data-add]")) {
          const box = root.querySelector("[data-people]");
          if (box.children.length >= 8) return;
          box.insertAdjacentHTML("beforeend", personHtml(blankPerson(false), box.children.length));
          box.lastElementChild.querySelector("input").focus();
          return;
        }
        const del = e.target.closest("[data-del]");
        if (del) { del.closest("[data-person]").remove(); return; }
        const d = e.target.closest("[data-date]");
        if (d) {
          const v = await pickDate({ anchor: d, title: "등록일", value: val(root, "regDate").value, max: today });
          if (v && d.isConnected) { val(root, "regDate").value = v; d.querySelector(".pk-field-v").textContent = fmtDateLabel(v); }
          return;
        }
        const s = e.target.closest("[data-service]");
        if (s) {
          const v = await pickOne({ anchor: s, title: "예배", options: SERVICES.map((x) => ({ value: x, label: x })), value: val(root, "service").value });
          if (v !== null && s.isConnected) { val(root, "service").value = v; s.querySelector(".pk-field-v").textContent = v || "고르기"; s.classList.toggle("empty", !v); }
          return;
        }
        const fb = e.target.closest("[data-find]");
        if (fb) {
          const g = fb.closest("[data-guide]");
          const name = g.querySelector('[data-f="gname"]').value.trim();
          if (!name) { g.querySelector('[data-f="gname"]').focus(); return; }
          fb.disabled = true;
          const r = await call("nfPeopleFind", { name });
          fb.disabled = false;
          if (!fb.isConnected) return;
          if (!r.ok) { await dialog({ text: failText(r), cancel: null }); return; }
          if (!(r.people || []).length) { await dialog({ text: `교인명부에 「${name}」 님이 없어요 — 목장과 전화를 손으로 적어 주세요`, cancel: null }); return; }
          const pick = await pickOne({ anchor: fb, title: "어느 분인가요", options: foundOptions(r.people), value: "", wrap: true });
          if (pick === null || !fb.isConnected) return;
          const p = r.people[Number(pick)];
          g.querySelector('[data-f="gname"]').value = p.name;
          g.querySelector('[data-f="gmok"]').value = foundMok(p);
        }
      });
      root.addEventListener("change", (e) => {
        if (e.target.matches('[data-f="selfCome"]')) root.querySelector("[data-guides]").hidden = e.target.checked;
      });
      first = JSON.stringify(readForm(root, f0));
    },
    isDirty: (root) => JSON.stringify(readForm(root, f0)) !== first,
    onSubmit: async (root) => {
      const c = formToCard(readForm(root, f0), year);
      if (c.error) return { ok: false, message: c.error };
      let r = await call("nfCardSave", c.body);
      if (!r.ok && r.error === "dup") {
        const go = await dialog({ title: "같은 분이 이미 있어요", text: "이름과 전화 뒷자리가 같은 분이 다른 카드에 있어요. 전에 오셨던 분일 수 있어요 — 그래도 새 카드로 넣을까요?", ok: "새 카드로 넣기" });
        if (!go) return { ok: false };
        r = await call("nfCardSave", { ...c.body, force: true });
      }
      if (!r.ok && r.error === "changed") { stale = true; return { ok: true, value: "stale" }; }
      if (!r.ok) return { ok: false, message: failText(r) };
      return { ok: true, value: { cardId: r.card_id } };
    },
  }).then((v) => (stale ? "stale" : v));
}
