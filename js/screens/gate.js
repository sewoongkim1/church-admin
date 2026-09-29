// 들어오는 화면들 — 로그인 · 처음 등록 · 승인 대기 · 정지 · 오류
import { esc, errorText, busy, affiliation } from "../core/ui.js";
import { pickOne } from "../core/picker.js";

// 성경암송 앱(app.js GU_LIST·BU_LIST)과 같게 — 교구·부서가 늘면 두 곳을 함께 고친다(서버는 목록을 거르지 않는다)
const GU_LIST = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
const BU_LIST = ["사랑부", "영아부", "유아부", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부"];
// 교구·부서는 시스템 select 목록 대신 우리 고르개(picker.js)로 — 값은 hidden 칸(name="gu"·"bu")에 둬서
// 제출하는 코드(f.elements.gu.value)가 그대로 읽는다. 단추는 글자만 보여 준다.
const PICKS = { gu: { list: GU_LIST, what: "교구" }, bu: { list: BU_LIST, what: "부서" } };
const pickField = (k) => `<div class="field"><span id="lb-${k}">${PICKS[k].what}</span><input type="hidden" name="${k}">
  <button type="button" class="pk-field" data-pick="${k}" aria-haspopup="dialog" aria-expanded="false"
    aria-labelledby="lb-${k} pv-${k}"><span class="pk-field-v" id="pv-${k}"></span><span class="pk-field-x" aria-hidden="true"></span></button></div>`;

// onSwitch — 「다른 카카오 계정으로」. 로그아웃해도 브라우저의 카카오 로그인은 남아 「카카오로 시작하기」가
// 같은 계정으로 바로 들어가므로, 공용 PC 에서 다른 분이 들어오려면 카카오에 계정을 다시 묻게 해야 한다.
export function renderLogin(el, { onKakao, onSwitch, notice = "" }) {
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>고척교회 사역관리</h2>
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

// 카카오톡 안 브라우저에서 열렸을 때 — 기본 브라우저로 넘기는 동안 · 안 넘어갔을 때 이 화면이 남는다
export function renderOpenExternal(el, { onOpen, onClose, onStay }) {
  el.innerHTML = `<div class="gate"><div class="card">
    <h2>기본 브라우저로 열고 있어요</h2>
    <p>이 관리 화면은 카카오톡 안이 아니라<br>크롬·사파리 같은 기본 브라우저에서 열어요.</p>
    <div class="stack">
      <button type="button" class="btn primary wide o">기본 브라우저로 열기</button>
      <button type="button" class="btn wide c">카카오톡으로 돌아가기</button>
    </div>
    <p class="muted" style="margin-top:14px">안 열리면 화면의 ⋮ 또는 공유 단추에서 「다른 브라우저로 열기」를 눌러 주세요.</p>
    <p class="muted"><a href="#" class="s">카카오톡 안에서 그냥 볼게요</a></p>
  </div></div>`;
  el.querySelector(".o").onclick = onOpen;
  el.querySelector(".c").onclick = onClose;
  el.querySelector(".s").onclick = (e) => { e.preventDefault(); onStay(); };
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
        ${pickField("gu")}
        <label class="field"><span>목장</span><input name="mok" placeholder="숫자 또는 남성 (예: 3, 남성, 없으면 99)" autocomplete="off"></label>
      </div>
      <div data-for="교회학교">
        ${pickField("bu")}
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
  // 교구·부서 단추 글자 — 목록에 없는 옛 값은 비운다(옛 select 목록도 그런 값은 「고르기」로 두어 빈 값으로 보냈다)
  const showPick = (k) => {
    const h = f.elements[k];
    if (!PICKS[k].list.includes(h.value)) h.value = "";
    const b = f.querySelector(`[data-pick="${k}"]`);
    b.querySelector(".pk-field-v").textContent = h.value || `${PICKS[k].what} 고르기`;
    b.classList.toggle("empty", !h.value);
  };
  Object.keys(PICKS).forEach(showPick);
  f.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = async () => {
    const k = b.dataset.pick;
    const got = await pickOne({ anchor: b, title: `${PICKS[k].what} 고르기`, value: f.elements[k].value,
      options: PICKS[k].list.map((x) => ({ value: x, label: x })) });
    if (got === null) return;
    f.elements[k].value = got;
    showPick(k);
  }));
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
