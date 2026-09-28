// 들어오는 화면들 — 로그인 · 처음 등록 · 승인 대기 · 정지 · 오류
import { esc, errorText, busy, affiliation } from "../core/ui.js";

// 성경암송 앱(app.js GU_LIST·BU_LIST)과 같게 — 교구·부서가 늘면 두 곳을 함께 고친다(서버는 목록을 거르지 않는다)
const GU_LIST = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
const BU_LIST = ["사랑부", "영아부", "유아부", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부"];

// onSwitch — 「다른 카카오 계정으로」. 로그아웃해도 브라우저의 카카오 로그인은 남아 「카카오로 시작하기」가
// 같은 계정으로 바로 들어가므로, 공용 PC 에서 다른 분이 들어오려면 카카오에 계정을 다시 묻게 해야 한다.
export function renderLogin(el, { onKakao, onSwitch, notice = "" }) {
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>고척교회 관리</h2>
    <p>교회 담당자만 들어올 수 있어요.<br>카카오로 로그인한 뒤 승인을 받으면 메뉴가 열려요.</p>
    ${notice ? `<p class="err">${esc(notice)}</p>` : ""}
    <div class="stack">
      <button type="button" class="kakao">카카오로 시작하기</button>
      <button type="button" class="btn wide other">다른 카카오 계정으로</button>
    </div>
    <p class="muted" style="margin-top:14px">로그인하면 카카오 회원번호·별명·사진(이메일은 동의한 경우)과 적으신 이름·소속을 담당자 확인에 써요. <a href="privacy.html">개인정보 안내</a></p>
  </div></div>`;
  el.querySelector(".kakao").onclick = onKakao;
  el.querySelector(".other").onclick = onSwitch;
}

export function renderRegister(el, { nickname = "", member = null, onSubmit, onSignOut, onSwitch }) {
  const v = member || { type: "교구", gu: "", mok: "", bu: "", grade: "", name: "" };
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>${member ? "적은 것 고치기" : "처음 오셨어요"}</h2>
    <p>${nickname ? `카카오 「${esc(nickname)}」로 로그인했어요.<br>` : ""}성경암송 앱에 로그인할 때와 같이 적어 주세요.</p>
    <form novalidate>
      <div class="seg" role="group" aria-label="소속 종류">
        <button type="button" data-t="교구">교구</button><button type="button" data-t="교회학교">교회학교</button>
      </div>
      <div data-for="교구">
        <label class="field"><span>교구</span><select name="gu"><option value="">고르기</option>${GU_LIST.map((g) => `<option>${g}</option>`).join("")}</select></label>
        <label class="field"><span>목장</span><input name="mok" placeholder="숫자 또는 남성 (예: 3, 남성, 없으면 99)" autocomplete="off"></label>
      </div>
      <div data-for="교회학교">
        <label class="field"><span>부서</span><select name="bu"><option value="">고르기</option>${BU_LIST.map((b) => `<option>${b}</option>`).join("")}</select></label>
        <label class="field"><span>학년</span><input name="grade" placeholder="예: 3학년" autocomplete="off"></label>
      </div>
      <label class="field"><span>이름</span><input name="name" autocomplete="name"></label>
      <p class="err" aria-live="polite"></p>
      <p class="muted">로그인하면 카카오 회원번호·별명·사진(이메일은 동의한 경우)과 적으신 이름·소속을 담당자 확인에 써요. <a href="privacy.html">개인정보 안내</a></p>
      <button type="submit" class="btn primary wide">승인 요청하기</button>
    </form>
    <div class="stack" style="margin-top:12px"><button type="button" class="btn wide out">다른 카카오 계정으로</button></div>
  </div></div>`;
  const f = el.querySelector("form");
  let type = v.type === "교회학교" ? "교회학교" : "교구";
  const setType = (t) => {
    type = t;
    el.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
    el.querySelectorAll("[data-for]").forEach((d) => (d.hidden = d.dataset.for !== t));
  };
  el.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => setType(b.dataset.t)));
  for (const k of ["gu", "mok", "bu", "grade", "name"]) f.elements[k].value = v[k] || "";
  setType(type);
  el.querySelector(".out").onclick = onSwitch;
  f.onsubmit = (e) => {
    e.preventDefault();
    const identity = { type, name: f.elements.name.value };
    if (type === "교구") Object.assign(identity, { gu: f.elements.gu.value, mok: f.elements.mok.value });
    else Object.assign(identity, { bu: f.elements.bu.value, grade: f.elements.grade.value });
    busy(el, async () => {
      const r = await onSubmit(identity);
      if (r && !r.ok) el.querySelector(".err").textContent = errorText(r);
    });
  };
}

export function renderPending(el, { member, onRefresh, onEdit, onSignOut }) {
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>승인을 기다리고 있어요</h2>
    <p><b>${esc(affiliation(member))} ${esc(member.name)}</b> 님으로 요청했어요.<br>총괄 관리자에게 「승인 요청했어요」라고 알려 주세요.</p>
    <div class="stack">
      <button type="button" class="btn primary wide r">승인됐는지 다시 보기</button>
      <button type="button" class="btn wide e">적은 것 고치기</button>
      <button type="button" class="btn wide o">로그아웃</button>
    </div></div></div>`;
  el.querySelector(".r").onclick = onRefresh;
  el.querySelector(".e").onclick = onEdit;
  el.querySelector(".o").onclick = onSignOut;
}

export function renderDisabled(el, { onSignOut }) {
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>사용이 멈춘 계정이에요</h2>
    <p>다시 쓰셔야 하면 총괄 관리자에게 알려 주세요.</p>
    <div class="stack"><button type="button" class="btn wide o">로그아웃</button></div>
  </div></div>`;
  el.querySelector(".o").onclick = onSignOut;
}

export function renderError(el, { message, onRetry, onSignOut }) {
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>열지 못했어요</h2><p>${esc(message)}</p>
    <div class="stack">
      <button type="button" class="btn primary wide r">다시 시도</button>
      ${onSignOut ? `<button type="button" class="btn wide o">로그아웃</button>` : ""}
    </div>
  </div></div>`;
  el.querySelector(".r").onclick = onRetry;
  if (onSignOut) el.querySelector(".o").onclick = onSignOut;
}
