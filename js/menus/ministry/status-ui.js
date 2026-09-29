// 📋 신청 현황 — 화면 조각(HTML 만드는 함수)과 확인 창. 원문: docs/port/ministry-status-legacy.md 2.8~2.13.
// 성경암송 admin-stats.html 의 mnCard·mnRowsHtml·mnPhoneHtml·mnDupBadge·mnGroupsHtml·mnAskCancelReason 을 옮겼다.
// ⚠️ 사람·서버 글자는 모두 esc — 이 파일이 만든 글이 그대로 innerHTML 로 들어간다.
// ⚠️ ui.js dialog 의 본문은 white-space:pre-line 이다 — dialog 에 넘기는 html 에는 줄바꿈 글자를 넣지 않는다.
import { esc, dialog } from "../../core/ui.js";
import { STATES, SHORT, CLS, personKey, teamKey, dupOthers } from "./status-logic.js";
import { churchBadgeHtml } from "../people/church-badge.js";

const short = (st) => SHORT[st] || st;

// 전화번호 — 누르면 전화(tel:). 번호가 없으면 안내만. small=true 는 묶음 머리 줄 목록용 작은 꼴.
// status 를 주면 까닭을 가른다 — 결정(임명·취소) 뒤면 서버가 지운 것, 그 전이면 처음부터 없는 것
// (결정 전 건에 「결정 후 삭제」라고 쓰면 사실이 아니다 — 2026-09-29 표에서 보임).
const DECIDED = ["임명확정", "미채택", "취소"];
export function phoneHtml(phone, small, status) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if (!digits) return small ? "" : `<span class="mn-p4 none">${DECIDED.includes(status) ? "번호 지움 · 결정 뒤" : "번호 없음"}</span>`;
  return `<a class="mn-p4 mn-tel${small ? " sm" : ""}" href="tel:${digits}" title="전화 걸기">📞 <b>${esc(phone)}</b></a>`;
}

// 같은 번호 배지 — 한 줄에 들어가게 짧게, 긴 설명은 title 에. 여럿이면 「외 N」.
export function dupBadgeHtml(dup) {
  if (!dup || !dup.length) return "";
  const same = dup.filter((x) => x.kind === "소속");
  const other = dup.filter((x) => x.kind === "사람");
  const more = (n) => (n > 1 ? ` 외 ${n - 1}` : "");
  return [
    same.length ? `<span class="mn-dup" title="같은 이름·번호로 다른 소속(${esc(same.map((x) => x.label).join(", "))})에서도 신청 — 다른 교구·목장으로 로그인해 한 번 더 내셨을 수 있습니다">⚠️ ${esc(String(same[0].label).replace(/목장$/, ""))}${more(same.length)}</span>` : "",
    other.length ? `<span class="mn-dup other" title="같은 번호로 다른 분(${esc(other.map((x) => x.label).join(", "))})도 신청 — 가족 등 번호를 함께 쓰는 분일 수 있습니다">☎️ 번호 같음 · ${esc(other[0].name || "이름 없음")}${more(other.length)}</span>` : "",
  ].join("");
}

// 상태 메뉴 — 카드도 표도 이 마크업을 쓴다(`.pl-drop` … `data-id`). 같은 click 처리(status.js)로
// 바꾸고 지운다 — 여기 하나만 고치면 카드·표 어느 쪽에서 눌러도 그대로 이어진다.
function statusMenuHtml(r) {
  const cls = CLS[r.status] || "";
  const id = esc(r.id);
  return `<div class="pl-drop">
        <button type="button" class="pl-sel ${cls}" data-act="drop" data-id="${id}" aria-haspopup="listbox" aria-expanded="false">${esc(short(r.status))}</button>
        <div class="pl-menu" role="listbox">
          ${STATES.map((x) => `<button type="button" class="pl-opt ${CLS[x]}${x === r.status ? " on" : ""}" data-act="set" data-id="${id}" data-st="${esc(x)}" role="option">${esc(short(x))}</button>`).join("")}
          <button type="button" class="pl-opt pl-del" data-act="del" data-id="${id}" role="option">🗑 삭제</button>
        </div>
      </div>`;
}

// 신청 한 건 = 카드 하나. 세 보기가 모두 이것을 쓴다 — 상태 바꾸기·삭제가 어느 보기에서나 그대로 된다.
// inView: 묶음 안 카드면 "person"·"team" — 머리에 이미 적힌 것은 카드에서 뺀다
//   (사람별 카드 = 사역·상태·신청일, 사역별 카드 = 사람·번호·상태).
export function cardHtml(r, inView, dupHtml) {
  const cls = CLS[r.status] || "";
  const opt = r.option ? `<i>(${esc(r.option)})</i>` : "";
  // 신청한 사역은 카드에서 가장 잘 보여야 한다 — 이름 아래 굵게, 위원회는 작게
  const teams = `<div class="mn-team-main"><span class="mn-team-ico" aria-hidden="true">🤝</span><b>${esc(r.team)}</b>${opt}<span class="mn-team-com">${esc(r.committee)}</span></div>`;
  const at = esc(String(r.at || "").replace(/-/g, "."));
  // 종이로 올린 건은 한눈에 — 앱 알림이 가지 않는 분일 수 있다
  const paper = r.source === "paper" ? `<em class="mn-paper" title="담당자가 올린 종이 명단">📋 종이</em>` : "";
  const nm = inView === "person"
    ? `<div class="mn-in-team"><b>${esc(r.team)}</b>${opt}</div>` +
      `<span class="mn-sub"><i>${esc(r.committee)}</i><span class="mn-date" title="신청일">${at} 신청</span></span>`
    : `<b>${esc(r.name)}</b>${r.position ? `<em class="mn-pos">${esc(r.position)}</em>` : ""}${paper}${churchBadgeHtml(r.church)}` +
      `<span class="mn-sub"><i>${esc(r.who)}</i>${inView === "team" && r.option ? `<i class="mn-in-opt">(${esc(r.option)})</i>` : ""}<span class="mn-date" title="신청일">${at}</span></span>`;
  return `<div class="pl-card ${cls}${inView ? " mn-in" : ""}">
    <div class="pl-hd">
      <div class="pl-nm">${nm}</div>
      ${statusMenuHtml(r)}
    </div>
    ${inView ? "" : teams}
    ${inView === "person" ? "" : `<div class="mn-contact">${phoneHtml(r.phone, false, r.status)}${dupHtml ? `<span class="mn-dups">${dupHtml}</span>` : ""}</div>`}
    ${r.note ? `<div class="mn-note">📝 ${esc(r.note)} <i>(관리자만 봄)</i></div>` : ""}
  </div>`;
}

// PC(≥1024px) 건별 표 — 한 행 = 한 건. 칸: 이름(직분) · 소속 · 부서 › 사역팀(하위) · 신청일 · 전화 · 상태.
// 상태 칸은 카드와 같은 statusMenuHtml 을 그대로 써 status.js 의 click 처리(변경·삭제)가 손대지 않고도 통한다.
// dupM 은 명단 전체로 만든 dupMap(status.js 가 넘겨준다) — groupsHtml 과 같은 규칙.
export function tableHtml(rows, dupM) {
  if (!rows.length) return `<p class="empty">조건에 맞는 신청이 없어요</p>`;
  const head = `<tr><th>이름(직분)</th><th>소속</th><th>부서 › 사역팀</th><th>신청일</th><th>전화</th><th>상태</th></tr>`;
  const body = rows.map((r) => {
    const cls = CLS[r.status] || "";
    const opt = r.option ? `<i>(${esc(r.option)})</i>` : "";
    const paper = r.source === "paper" ? `<em class="mn-paper" title="담당자가 올린 종이 명단">📋 종이</em>` : "";
    const push = `<span class="mn-tbl-push" title="${r.canPush ? "앱 알림 켜심" : "앱 알림 안 켜심"}" aria-hidden="true">${r.canPush ? "🔔" : "🔕"}</span>`;
    const at = esc(String(r.at || "").replace(/-/g, "."));
    const dupHtml = dupBadgeHtml(dupOthers(dupM, r));
    return `<tr class="${cls}">
      <td class="mn-tbl-nm"><b>${esc(r.name)}</b>${r.position ? `<em class="mn-pos">${esc(r.position)}</em>` : ""}${push}${paper}${churchBadgeHtml(r.church)}</td>
      <td>${esc(r.who)}</td>
      <td class="mn-tbl-team"><i>${esc(r.committee)}</i> › <b>${esc(r.team)}</b>${opt}</td>
      <td class="mn-date">${at}</td>
      <td class="mn-tbl-tel"><div class="mn-tbl-telbox">${phoneHtml(r.phone, false, r.status)}${dupHtml ? `<span class="mn-dups">${dupHtml}</span>` : ""}</div></td>
      <td class="mn-tbl-st">${statusMenuHtml(r)}</td>
    </tr>`;
  }).join("");
  return `<table class="mn-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// 묶음 머리의 줄 목록 — 접어 둔 채로도 사람별은 신청한 사역을, 사역별은 신청한 사람을 상태와 함께 본다.
// 줄은 상태 순서(신청→접수→임명→취소), 같으면 가나다. mainOf·subOf 는 글자 그대로 받아 여기서 esc 한다.
// extraOf 는 HTML(전화번호·같은 번호 배지)을 돌려준다.
export function rowsHtml(list, mainOf, subOf, extraOf) {
  const order = (st) => { const i = STATES.indexOf(st); return i < 0 ? 99 : i; };
  const sorted = [...list].sort((a, b) => order(a.status) - order(b.status) ||
    String(mainOf(a)).localeCompare(String(mainOf(b)), "ko"));
  return `<span class="mn-grp-rows">${sorted.map((r) => {
    const cls = CLS[r.status] || "";
    const ex = extraOf ? extraOf(r) : "";
    return `<span class="mn-rowi ${cls}"><span class="mn-rowi-top"><span class="mn-rowi-t"><b>${esc(mainOf(r))}</b><small>${esc(subOf(r))}</small></span>` +
      `<span class="mn-rowi-st ${cls}">${esc(short(r.status))}</span></span>` +
      (ex ? `<span class="mn-rowi-ex mn-phone-line">${ex}</span>` : "") + `</span>`;
  }).join("")}</span>`;
}

// 사람별·사역별 묶음(<details>). 펼친 묶음은 openSet 에 남아 다시 그려도 접히지 않는다.
// dupM 은 명단 **전체**로 만든 dupMap — 거르기로 한쪽이 가려져도 같은 번호 표시는 그대로.
export function groupsHtml(rows, view, openSet, dupM) {
  const by = new Map();
  const keyOf = view === "person" ? personKey : teamKey;
  for (const r of rows) { const k = keyOf(r); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const groups = [...by.entries()];
  if (view === "person") groups.sort((a, b) => a[0].localeCompare(b[0], "ko"));
  else groups.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ko"));   // 신청 많은 사역부터
  const tools = `<div class="mn-grp-tools"><button type="button" data-act="all" data-v="open">모두 펼치기</button>` +
    `<button type="button" data-act="all" data-v="close">모두 접기</button></div>`;
  return tools + groups.map(([k, list]) => {
    const r0 = list[0];
    const gk = view + "|" + k;
    let title;
    if (view === "person") {
      const pos = list.map((r) => r.position).find(Boolean) || "";
      const phone = list.map((r) => r.phone).find(Boolean) || "";
      const teams = new Set(list.map(teamKey)).size;
      const dup = dupOthers(dupM, list);
      title = `<span class="mn-grp-t">${esc(r0.name)}${churchBadgeHtml(r0.church)}${pos ? ` <em>${esc(pos)}</em>` : ""}<i>${esc(r0.who)}</i></span>` +
        `<span class="mn-grp-n">${teams}개 사역</span>` +
        ((phone || dup.length) ? `<span class="mn-grp-sub mn-phone-line">${phone ? phoneHtml(phone) : ""}${dupBadgeHtml(dup)}</span>` : "") +
        rowsHtml(list, (r) => r.team, (r) => r.committee);
    } else {
      const people = new Set(list.map(personKey)).size;
      title = `<span class="mn-grp-t"><em>${esc(r0.committee)}</em>${esc(r0.team)}</span>` +
        `<span class="mn-grp-n">${list.length}건 · ${people}명</span>` +
        rowsHtml(list, (r) => r.name, (r) => r.who, (r) => {
          const dup = dupOthers(dupM, r);
          return (r.phone || dup.length) ? phoneHtml(r.phone, true) + dupBadgeHtml(dup) : "";
        });
    }
    const cards = list.map((r) => cardHtml(r, view, dupBadgeHtml(dupOthers(dupM, r)))).join("");
    return `<details class="mn-grp" data-gk="${esc(gk)}"${openSet.has(gk) ? " open" : ""}>` +
      `<summary>${title}</summary><div class="mn-grp-body">${cards}</div></details>`;
  }).join("");
}

// 임명 확인 — 성도님께 알림이 나가는 자리라 한 번 묻는다(되돌려도 이미 나간 알림은 못 무른다).
// ⚠️ 그분께 이미 알림이 나갔으면(notified_at) 묻지 않고 바로 간다 — 원문 그대로.
export function confirmAppoint(r) {
  if (r.notified_at) return Promise.resolve(true);
  const note = r.canPush
    ? "🔔 앱 알림을 켜 두신 분이라 <b>알림이 한 번 나갑니다.</b><br>되돌려도 이미 나간 알림은 취소되지 않아요."
    : "🔕 앱 알림을 켜지 않으신 분이라 <b>알림이 가지 않아요.</b><br>게시판이나 연락으로 알려 주세요.";
  return dialog({
    title: "🎉 임명", ok: "임명", cancel: "그만두기",
    html: `<b>${esc(r.name)}</b>님을 <b>«${esc(r.team)}»</b> 사역에<br><b>임명</b>합니다.` +
      `<p class="muted mn-dlg-note ${r.canPush ? "on" : "off"}">${note}</p>`,
  });
}

// 삭제 — 되돌릴 수 없다. ① 무엇을 지우는지 보여 주고 ② 한 번 더 묻는다.
// 「취소」와 다르다 — 취소는 자취가 남지만, 지우면 성도님 화면에서도 사라지고 3개 상한의 자리도 빈다.
export async function confirmDelete(r) {
  const what = `<b>${esc(r.name)}</b>님의 <b>«${esc(r.team)}»</b> 신청` +
    `<br><span class="muted">${esc(r.who || "")} · ${esc(r.committee || "")} · 지금 ${esc(short(r.status))}</span>`;
  if (!(await dialog({
    title: "🗑 이 신청을 지울까요?", ok: "지웁니다", cancel: "그만두기", danger: true,
    html: `${what}<br><br>잘못 들어온 신청을 <b>아주 지웁니다.</b>` +
      `<p class="muted">되돌릴 수 없어요. 결정을 남겨 두려면 「취소」를 쓰세요 — 취소는 자취가 남습니다.</p>`,
  }))) return false;
  return dialog({
    title: "⚠️ 정말 지울까요 — 되돌릴 수 없어요", ok: "네, 지웁니다", cancel: "아니요", danger: true,
    html: `마지막 확인이에요.<br>${what}<br><br>이 줄은 성도님 화면에서도 사라집니다.`,
  });
}

// 취소 사유 창 → Promise<string|null>(null = 그만둠).
// ⚠️ 사유 없이는 「취소하기」가 눌리지 않는다 — 서버도 사유 없는 취소를 거절한다.
// ⚠️ 자동 초점을 두지 않는다 — 키보드가 올라와 미리 만든 사유 단추를 덮는다.
const PRESETS = ["중복 신청 (다른 소속으로 한 번 더 내심)", "본인 요청", "부서장 요청", "신청 자격 확인 필요"];
export function askCancelReason(r) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "mn-modal";
    wrap.innerHTML = `<div class="mn-modal-box" role="dialog" aria-modal="true" aria-labelledby="mn-cx-t">
      <h3 id="mn-cx-t">신청 취소</h3>
      <p><b>${esc(r.name)}</b>님의 <b>«${esc(r.team)}»</b> 신청을 취소합니다.<br>
        취소하면 휴대폰 번호가 지워지고 되돌릴 수 없습니다.</p>
      <div class="mn-modal-presets">${PRESETS.map((x) => `<button type="button" data-preset="${esc(x)}">${esc(x)}</button>`).join("")}</div>
      <textarea maxlength="500" aria-label="취소 사유" placeholder="취소 사유 (예: 찬양부장 요청 — 같은 시간 다른 사역과 겹침)"></textarea>
      <div class="mn-modal-hint">관리자·담당자만 봅니다 — 성도님께는 보이지 않습니다.</div>
      <div class="mn-modal-foot">
        <button type="button" class="no" data-no>그만두기</button>
        <button type="button" class="yes" data-yes disabled>취소하기</button>
      </div>
    </div>`;
    const ta = wrap.querySelector("textarea");
    const yes = wrap.querySelector("[data-yes]");
    const sync = () => { yes.disabled = !ta.value.trim(); };
    const onKey = (e) => { if (e.key === "Escape") done(null); };
    const done = (v) => { document.removeEventListener("keydown", onKey); wrap.remove(); resolve(v); };
    ta.addEventListener("input", sync);
    // ⚠️ 누르기와 떼기가 **둘 다** 바깥일 때만 닫는다 — 사유를 끌어 고르다 밖에서 떼면 닫혀 글이 사라졌다
    let downOut = false;
    wrap.addEventListener("pointerdown", (e) => { downOut = e.target === wrap; });
    wrap.addEventListener("click", (e) => {
      const p = e.target.closest("[data-preset]");
      if (p) { ta.value = p.getAttribute("data-preset"); sync(); ta.focus(); return; }
      if (e.target.closest("[data-no]")) return done(null);
      if (e.target.closest("[data-yes]")) { const v = ta.value.trim(); if (v) done(v); return; }
      if (e.target === wrap && downOut) done(null);
      downOut = false;
    });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
  });
}
