// ⚙️ 앱 설정·문구 — 환영 인트로·오늘의 메시지·응원·이벤트 문구 등. 성경암송 api 프록시(getConfig·saveConfig). 역할 memorizeadmin.
//   ⚠️ 값은 JSON 으로 다룬다(배열·객체·문자열). 저장 전 JSON 이 맞는지 검사한다.
//   ⚠️ 관리 설정(loginLimit·lifePin)은 다루지 않는다 — 이 목록에 없다.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">⚙️ 앱 설정·문구</h2>`;
const KEYS = [
  ["introSlides", "환영 인트로"],
  ["dailyMessage", "오늘의 메시지(공지·격려)"],
  ["heartMessages", "마음에 둠(축하 메시지)"],
  ["milestoneMessages", "10회 단위 응원"],
  ["event", "말씀 이벤트 문구"],
  ["passagesPublic", "내 안에 거하는 말씀 공개 여부"],
];

export async function render(el, { call }) {
  el.innerHTML = TITLE + `
    <label class="field"><span>고칠 설정</span>
      <select id="cf-key">${KEYS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></label>
    <p class="muted">값은 <b>JSON</b> 꼴이에요. 모양을 지키면서 내용만 고쳐 주세요.</p>
    <textarea id="cf-val" class="pl-memo-in" rows="14" style="width:100%;font-family:monospace;font-size:13px"></textarea>
    <div class="acts"><button class="btn primary" id="cf-save">저장</button> <button class="btn" id="cf-reload">다시 불러오기</button></div>
    <p class="muted" id="cf-status"></p>`;

  const $ = (id) => el.querySelector("#" + id);
  const keySel = $("cf-key");

  const load = async () => {
    const key = keySel.value;
    $("cf-status").textContent = "불러오는 중…";
    const r = await call("getConfig", { key });
    if (!r.ok) { $("cf-status").textContent = errorText(r); return; }
    $("cf-val").value = JSON.stringify(r.value ?? null, null, 2);
    $("cf-status").textContent = `${key} 불러왔어요.`;
  };

  const save = async () => {
    const key = keySel.value;
    let value;
    try { value = JSON.parse($("cf-val").value); }
    catch (_) { $("cf-status").textContent = "JSON 모양이 맞지 않아요 — 따옴표·쉼표·괄호를 확인해 주세요."; return; }
    const go = await dialog({ title: "저장할까요?", text: `${key} 를 바꿔요. 성도님 화면에 바로 반영돼요.`, ok: "저장", cancel: "그만두기" });
    if (!go) return;
    await busy(el, async () => {
      const r = await call("saveConfig", { key, value });
      if (r.ok) { toast("저장했어요."); $("cf-status").textContent = `${key} 저장했어요.`; }
      else $("cf-status").textContent = errorText(r);
    });
  };

  keySel.addEventListener("change", load);
  $("cf-save").addEventListener("click", save);
  $("cf-reload").addEventListener("click", load);
  await load();
}
