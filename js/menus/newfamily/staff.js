// 🧑‍🤝‍🧑 함께 쓰는 분 — 영접팀·정착팀 총무·섬김이·새가족 목사님을 운영팀이 직접 넣고 뺀다(새가족 1단계 · 2026-10-07 · 설계 v2 §2-3)
//   서버: nfStaffList · nfStaffApprove(들어오신 분 승인 — 「새가족 섬김」 역할 하나만 준다) · nfStaffSet(하는 일 바꾸기·빼기) · nfHelperSave(섬김이 줄).
//   섬김이는 이름만으로 먼저 넣어 둘 수 있다(배정은 바로 된다). 그분이 카카오로 들어와 「등록」하면 「들어오신 분」에 뜨고, 승인하며 섬김이 줄과 잇는다.
// ⚠️ 여기서 줄 수 있는 것은 새가족 메뉴의 일뿐이다 — 다른 메뉴의 역할은 총괄 관리자가 준다. 서버 글자는 모두 esc.
import { esc, toast, busy, dialog, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne, pickMany } from "../../core/picker.js";
import { KIND_LABEL, KIND_OPTIONS, nfWord } from "./nf-logic.js";

const TITLE = `<h2 class="page-title">🧑‍🤝‍🧑 함께 쓰는 분</h2>`;
const failText = (r) => nfWord(r?.error) || errorText(r);
const kindsText = (ks) => (ks.length ? ks.map((k) => KIND_LABEL[k] || k).join(" · ") : "하는 일 없음");
const NEW_HELPER = "+new";

// 하는 일 고르기 창 — 섬김이를 고르면 어느 섬김이 줄과 이을지도 묻는다. → { kinds, helperId } · 닫으면 null
function openKindsForm({ title, okLabel, member, helpers, kinds0 = [], helper0 = "", onSave }) {
  let kinds = [...kinds0], helperId = helper0 || "";
  // 이을 수 있는 줄 — 아직 계정이 없는 줄 + 지금 이분과 이어진 줄
  const free = helpers.filter((h) => !h.linked || h.id === helper0);
  const helperOpts = [...free.map((h) => ({ value: h.id, label: h.name + (h.services ? ` · ${h.services}` : "") })),
    { value: NEW_HELPER, label: `「${member.name}」 이름으로 새로 만들기` }];
  const helperLabel = () => (helperId ? (helperOpts.find((o) => o.value === helperId) || {}).label || "" : "고르기");
  if (!helperId) helperId = (free.find((h) => h.name === member.name) || {}).id || "";
  return openForm({
    title, okLabel,
    html: `<p class="be-note"><b>${esc(member.name)}</b>${member.sub ? ` <small>${esc(member.sub)}</small>` : ""} 님께 새가족 메뉴의 일을 드려요. 다른 메뉴는 열리지 않아요.</p>
      <div class="field"><span>하는 일 <small>(여럿 고를 수 있어요)</small></span>
        <button type="button" class="pk-field${kinds.length ? "" : " empty"}" data-kinds aria-haspopup="dialog" aria-expanded="false">
          <span class="pk-field-v">${esc(kinds.length ? kindsText(kinds) : "고르기")}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>
      <div class="field" data-hbox ${kinds.includes("helper") ? "" : "hidden"}><span>섬김이 명단의 어느 분인가요 <small>(이으면 그분께 배정된 새가족이 보여요)</small></span>
        <button type="button" class="pk-field${helperId ? "" : " empty"}" data-helper aria-haspopup="dialog" aria-expanded="false">
          <span class="pk-field-v">${esc(helperLabel())}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>`,
    onOpen: (root) => {
      root.addEventListener("click", async (e) => {
        const kb = e.target.closest("[data-kinds]");
        if (kb) {
          const got = await pickMany({ anchor: kb, title: "하는 일", options: KIND_OPTIONS, values: kinds });
          if (got === null || !kb.isConnected) return;
          kinds = KIND_OPTIONS.map((o) => o.value).filter((v) => got.includes(v));
          kb.querySelector(".pk-field-v").textContent = kinds.length ? kindsText(kinds) : "고르기";
          kb.classList.toggle("empty", !kinds.length);
          root.querySelector("[data-hbox]").hidden = !kinds.includes("helper");
          return;
        }
        const hb = e.target.closest("[data-helper]");
        if (hb) {
          const got = await pickOne({ anchor: hb, title: "섬김이 명단", options: helperOpts, value: helperId, wrap: true });
          if (got === null || !hb.isConnected) return;
          helperId = got;
          hb.querySelector(".pk-field-v").textContent = helperLabel();
          hb.classList.toggle("empty", !helperId);
        }
      });
    },
    isDirty: () => JSON.stringify(kinds) !== JSON.stringify(kinds0) || helperId !== (helper0 || ""),
    onSubmit: async () => {
      if (!kinds.length) return { ok: false, message: nfWord("no-kind") };
      if (kinds.includes("helper") && !helperId) return { ok: false, message: "섬김이 명단의 어느 분인지 골라 주세요" };
      const r = await onSave({ kinds, helper_id: kinds.includes("helper") && helperId !== NEW_HELPER ? helperId : "" });
      return r.ok ? { ok: true } : { ok: false, message: failText(r) };
    },
  });
}

// 섬김이 줄 넣기·고치기 → true · 닫으면 null
function openHelperForm({ call, helper = null }) {
  return openForm({
    title: helper ? "섬김이 고치기" : "＋ 섬김이", okLabel: "저장",
    html: `${helper ? "" : `<p class="be-note">아직 이 화면에 들어온 적이 없는 분도 이름만으로 넣어 두면 바로 배정할 수 있어요.</p>`}
      <label class="field"><span>이름</span><input data-f="name" maxlength="20" value="${esc(helper?.name || "")}" autocomplete="off"></label>
      <label class="field"><span>섬기는 예배 <small>(예: 2부 · 3부)</small></span><input data-f="services" maxlength="30" value="${esc(helper?.services || "")}" autocomplete="off"></label>
      <label class="nf-check"><input type="checkbox" data-f="resting" ${helper?.resting ? "checked" : ""}> 쉬는 중 <small class="muted">(배정 목록에서 빠져요 · 지난 기록은 남아요)</small></label>`,
    isDirty: (root) => root.querySelector('[data-f="name"]').value.trim() !== (helper?.name || "") ||
      root.querySelector('[data-f="services"]').value.trim() !== (helper?.services || "") || root.querySelector('[data-f="resting"]').checked !== (helper?.resting === true),
    onSubmit: async (root) => {
      const r = await call("nfHelperSave", { ...(helper ? { id: helper.id } : {}), name: root.querySelector('[data-f="name"]').value.trim(),
        services: root.querySelector('[data-f="services"]').value.trim(), resting: root.querySelector('[data-f="resting"]').checked });
      return r.ok ? { ok: true } : { ok: false, message: failText(r) };
    },
  });
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let data = null;

  const load = async () => {
    const r = await call("nfStaffList", {});
    if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(failText(r))}</p>`; return false; }
    data = r;
    return true;
  };
  const draw = () => {
    const pend = data.pending.map((m) => `<div class="card nf-row" data-pid="${esc(m.id)}">
      <div class="nf-row-h"><b>${esc(m.name)}</b> <span class="badge">승인 기다림</span></div>
      <p class="nf-sub">${esc([m.gu, m.mok ? m.mok + "목장" : "", m.nickname ? `카카오 「${m.nickname}」` : ""].filter(Boolean).join(" · "))}</p>
      <div class="acts"><button type="button" class="btn primary" data-act="approve">승인하고 하는 일 정하기</button></div></div>`).join("");
    const team = data.team.map((m) => `<div class="card nf-row" data-mid="${esc(m.id)}">
      <div class="nf-row-h"><b>${esc(m.name)}</b>${m.status !== "active" ? ` <span class="badge">사용 멈춤</span>` : ""}</div>
      <p class="nf-sub">${esc(kindsText(m.kinds))}</p>
      <div class="acts"><button type="button" class="btn" data-act="set">하는 일 바꾸기</button><button type="button" class="btn danger" data-act="remove">빼기</button></div></div>`).join("");
    const helpers = data.helpers.map((h) => `<div class="card nf-row" data-hid="${esc(h.id)}">
      <div class="nf-row-h"><b>${esc(h.name)}</b>${h.resting ? ` <span class="badge">쉬는 중</span>` : ""}
        <span class="badge${h.linked ? " ok" : ""}">${h.linked ? "들어오심" : "아직 안 들어오심"}</span></div>
      <p class="nf-sub">${esc([h.services, `지금 ${h.load}분 교육 중`].filter(Boolean).join(" · "))}</p>
      <div class="acts"><button type="button" class="btn" data-act="helper">고치기</button></div></div>`).join("");
    el.innerHTML = TITLE +
      `<h3 class="nf-h3">들어오신 분 <span class="nf-count">${data.pending.length}</span></h3>
       <p class="muted nf-hint">카카오로 들어와 등록만 하신 분이에요. 새가족을 섬기는 분인지 보고 승인해 주세요. 다른 부서의 분이면 그대로 두세요 — 총괄 관리자가 봐요.</p>
       ${pend || `<p class="empty">기다리는 분이 없어요</p>`}
       <h3 class="nf-h3">새가족을 섬기는 분 <span class="nf-count">${data.team.length}</span></h3>
       ${team || `<p class="empty">아직 없어요</p>`}
       <h3 class="nf-h3">섬김이 명단 <span class="nf-count">${data.helpers.length}</span></h3>
       <div class="acts nf-top"><button type="button" class="btn" data-act="helper-new">＋ 섬김이</button></div>
       ${helpers || `<p class="empty">아직 없어요 — 「＋ 섬김이」로 이름을 넣어 두면 배정할 수 있어요</p>`}`;
  };
  const reload = async () => { if (await load()) draw(); };

  if (!(await load())) return;
  draw();

  const open = new Set();
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const card = b.closest(".card");
    const key = act + (card?.dataset.pid || card?.dataset.mid || card?.dataset.hid || "");
    if (open.has(key)) return;
    open.add(key);
    let done = false;
    try {
      if (act === "approve") {
        const m = data.pending.find((x) => x.id === card.dataset.pid);
        if (!m) return;
        const got = await openKindsForm({ title: "승인하고 하는 일 정하기", okLabel: "승인", member: { name: m.name, sub: [m.gu, m.mok].filter(Boolean).join(" ") },
          helpers: data.helpers, onSave: (x) => call("nfStaffApprove", { member_id: m.id, ...x }) });
        done = !!got;
        if (got) toast(`${m.name} 님을 승인했어요`);
      } else if (act === "set") {
        const m = data.team.find((x) => x.id === card.dataset.mid);
        if (!m) return;
        const got = await openKindsForm({ title: "하는 일 바꾸기", okLabel: "저장", member: { name: m.name }, helpers: data.helpers,
          kinds0: m.kinds, helper0: m.helperId || "", onSave: (x) => call("nfStaffSet", { member_id: m.id, ...x }) });
        done = !!got;
        if (got) toast("바꿨어요");
      } else if (act === "remove") {
        const m = data.team.find((x) => x.id === card.dataset.mid);
        if (!m) return;
        if (!(await dialog({ title: `${m.name} 님을 뺄까요?`, text: "새가족 메뉴가 그분께 보이지 않게 돼요. 섬김이 명단의 줄과 적어 둔 교육 기록은 그대로 남아요.", ok: "빼기", danger: true }))) return;
        const r = await call("nfStaffSet", { member_id: m.id, kinds: [] });
        done = true;
        toast(r.ok ? "뺐어요" : failText(r));
      } else if (act === "helper" || act === "helper-new") {
        const h = act === "helper" ? data.helpers.find((x) => x.id === card.dataset.hid) : null;
        const got = await openHelperForm({ call, helper: h });
        done = !!got;
        if (got) toast("저장했어요");
      }
    } finally {
      open.delete(key);
      if (done) await busy(el, reload);
    }
  });
}
