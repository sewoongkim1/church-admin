// 담당자·역할 — 총괄 관리자(super)만.
//   승인 대기 → 승인(역할 고르기) / 거절 · 사용 중 → 역할 바꾸기 / 정지 · 정지됨 → 다시 사용
// 막는 것은 서버다(스스로 정지·스스로 super 빼기·마지막 super 는 서버가 거절한다). 화면은 그 단추를 미리 감출 뿐.
// ⚠️ 기존 담당자 표시(known_ministry_staff)는 본인이 적은 이름·소속만 맞춘 것 — 권한의 근거가 아니다.
// 이름을 누르면 교적 창(2026-09-30) — 본인이 적은 이름·소속으로 교인명부를 찾는다(총괄만 보는 화면이라 늘 「자세히」 창).
//   단추엔 담당자 id 만 싣는다(ministry/person-link.js). 승인 전 본인 확인을 돕는 것일 뿐 — 이것도 권한의 근거가 아니다.
import { esc, affiliation, kstTime, toast, dialog, busy, errorText } from "../../core/ui.js";
import { openChurchPerson } from "../bibleevent/person-popup.js";
import { PERSON_ACTION, personLinkHtml, memberAsk } from "../ministry/person-link.js";

const TITLE = `<h2 class="page-title">🔑 담당자·역할</h2>`;

export async function render(el, { me, call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("membersList");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  draw(el, r, me, call);
}

const labelsOf = (roles, ids) => roles.filter((ro) => ids.includes(ro.id)).map((ro) => ro.label).join(" · ");
const picked = (card) => [...card.querySelectorAll(".checks input:checked")].map((i) => i.value);
const who = (m) => `${personLinkHtml(m.id, m.name)} <span class="muted">${esc(affiliation(m))}</span>`;

function roleChecks(roles, checked, disabledIds = []) {
  return `<div class="checks">${roles.map((ro) => `<label title="${esc(ro.description)}">
    <input type="checkbox" value="${esc(ro.id)}" ${checked.includes(ro.id) ? "checked" : ""} ${disabledIds.includes(ro.id) ? "disabled" : ""}>
    ${esc(ro.label)}</label>`).join("")}</div>`;
}

// 카카오 프로필 사진 — 승인할 때 본인을 알아보기 위해(카카오 동의항목에 적은 목적). 주소는 서버가 https 로 걸러 둔다.
const avatar = (m) => m.kakao_avatar
  ? `<img class="avatar" src="${esc(m.kakao_avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "";

function pendingCard(m, roles) {
  return `<div class="card" data-id="${esc(m.id)}">
    <div class="who-row">${avatar(m)}<div>${who(m)}</div></div>
    <div class="muted">카카오 「${esc(m.kakao_nickname || "별명 없음")}」 · 요청 ${esc(kstTime(m.created_at))}</div>
    ${m.known_ministry_staff ? `<p class="muted" style="margin-top:6px">ℹ️ 사역 담당자 명단의 이름·소속과 같아요 — 카카오 별명·사진으로 본인인지 확인해 주세요</p>` : ""}
    ${roleChecks(roles, [])}
    <div class="acts">
      <button type="button" class="btn danger" data-act="reject">거절</button>
      <button type="button" class="btn primary" data-act="approve">승인</button>
    </div>
  </div>`;
}

function activeCard(m, roles, meId) {
  const self = m.id === meId;
  const chips = roles.filter((ro) => m.roles.includes(ro.id)).map((ro) => `<span class="badge">${esc(ro.label)}</span>`).join(" ");
  return `<div class="card" data-id="${esc(m.id)}">
    <div>${who(m)} ${self ? `<span class="badge ok">나</span>` : ""}</div>
    <div style="margin:6px 0">${chips || `<span class="muted">역할 없음 — 메뉴가 보이지 않아요</span>`}</div>
    <div class="muted">마지막 접속 ${esc(kstTime(m.last_login_at) || "없음")}${m.approved_by_name ? ` · ${esc(m.approved_by_name)} 님이 승인` : ""}</div>
    <details style="margin-top:10px"><summary class="btn">역할 바꾸기</summary>
      ${roleChecks(roles, m.roles, self ? ["super"] : [])}
      <div class="acts"><button type="button" class="btn primary" data-act="roles">역할 저장</button></div>
    </details>
    ${self ? "" : `<div class="acts" style="margin-top:8px"><button type="button" class="btn danger" data-act="disable">정지</button></div>`}
  </div>`;
}

function disabledCard(m) {
  return `<div class="card" data-id="${esc(m.id)}">
    <div>${who(m)}</div>
    <div class="muted">카카오 「${esc(m.kakao_nickname || "별명 없음")}」${m.roles.length ? "" : " · 승인된 적 없음"}</div>
    <div class="acts" style="margin-top:8px"><button type="button" class="btn" data-act="enable">다시 사용</button></div>
  </div>`;
}

function draw(el, r, me, call) {
  const by = (s) => r.members.filter((m) => m.status === s);
  const pending = by("pending"), active = by("active"), disabled = by("disabled");
  el.innerHTML = TITLE + `
    <div class="acts" style="margin-bottom:4px"><button type="button" class="btn" data-act="reload">↻ 새로 불러오기</button></div>
    <h3 class="sec-title">승인 대기 ${pending.length}명</h3>
    ${pending.length ? pending.map((m) => pendingCard(m, r.roles)).join("") : `<p class="empty">기다리는 분이 없어요</p>`}
    <h3 class="sec-title">사용 중 ${active.length}명</h3>
    ${active.map((m) => activeCard(m, r.roles, me.member.id)).join("")}
    ${disabled.length ? `<h3 class="sec-title">정지됨 ${disabled.length}명</h3>${disabled.map(disabledCard).join("")}` : ""}`;

  const reload = () => render(el, { me, call });
  el.onclick = async (e) => {
    // 이름 → 교적 창 — 보낼 것(이름·교구·목장 또는 부서·학년)은 받은 담당자 줄에서 꺼낸다
    const nb = e.target.closest("[data-person]");
    if (nb) {
      const pm = r.members.find((x) => String(x.id) === nb.dataset.person);
      if (pm) openChurchPerson({ call, action: PERSON_ACTION, ...memberAsk(pm), anchor: nb });
      return;
    }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "reload") return reload();
    const card = b.closest(".card");
    const m = r.members.find((x) => x.id === card?.dataset.id);
    if (!m) return;
    const name = `${m.name}(${affiliation(m)})`;
    let res;
    if (act === "approve") {
      const roles = picked(card);
      if (!roles.length) return toast("역할을 하나 이상 골라 주세요");
      let text = `${name} 님을 승인하고\n「${labelsOf(r.roles, roles)}」 역할을 드려요.`;
      if (roles.includes("super")) text += `\n${name} 님은 모든 메뉴와 담당자 승인·정지를 할 수 있게 돼요.`;
      if (!(await dialog({ title: "승인할까요?", text, ok: "승인" }))) return;
      res = await busy(el, () => call("membersApprove", { member_id: m.id, roles }));
    } else if (act === "reject") {
      if (!(await dialog({ title: "거절할까요?", text: `${name} 님의 요청을 거절해요.\n「정지됨」으로 옮겨지고 들어올 수 없어요.`, ok: "거절", danger: true }))) return;
      res = await busy(el, () => call("membersSetStatus", { member_id: m.id, status: "disabled" }));
    } else if (act === "roles") {
      const roles = picked(card);
      if (!roles.length) return toast("역할을 하나 이상 골라 주세요 — 못 들어오게 하려면 「정지」를 눌러 주세요");
      if (!m.roles.includes("super") && roles.includes("super")) {
        if (!(await dialog({ title: "총괄 관리자 역할을 드릴까요?", text: `${name} 님은 모든 메뉴와 담당자 승인·정지를 할 수 있게 돼요.`, ok: "드리기" }))) return;
      }
      res = await busy(el, () => call("membersSetRoles", { member_id: m.id, roles }));
    } else if (act === "disable") {
      if (!(await dialog({ title: "정지할까요?", text: `${name} 님은 다음 요청부터 바로 아무 메뉴도 쓸 수 없어요.`, ok: "정지", danger: true }))) return;
      res = await busy(el, () => call("membersSetStatus", { member_id: m.id, status: "disabled" }));
    } else if (act === "enable") {
      res = await busy(el, () => call("membersSetStatus", { member_id: m.id, status: "active" }));
    } else {
      return;
    }
    if (!res.ok) {
      await dialog({ title: "처리하지 못했어요", text: errorText(res), cancel: null });
      return reload();
    }
    toast("저장했어요");
    reload();
  };
}
