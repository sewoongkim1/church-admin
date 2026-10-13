// 📜 내 안에 거하는 말씀 — 주기도문·사도신경 같은 긴 본문(passages) 더하기·고치기·지우기 · 성도님께 공개(app_config passagesPublic).
//   성경암송 api 프록시(getPassages·savePassage·deletePassage · getConfig·saveConfig) — 역할 memorizeadmin. 규칙·말은 passages-logic.js(시험).
//   옛 화면: 성경암송 admin-stats.html renderPassages(2026-10-13 옮김 — 옛 화면은 관리 이전 마지막 묶음에서 걷는다 · 그때까지 둘 다 같은 표를 쓴다).
//   옛 「편집할 본문 선택」 콤보는 본문 카드 목록 + 「고치기」 창으로 바꿨다(시스템 select 금지 · picker.js 규칙).
// ⚠️ getPassages 는 「성도님 목록에 보이기」(is_active)가 켜진 본문만 준다 — 끈 본문은 이 화면에서도 안 보이고 여기서 다시 켤 수 없다.
//    그래서 새 본문에는 그 칸을 두지 않고(만들자마자 사라지는 본문), 고칠 때 끄면 한 번 더 묻는다.
// ⚠️ 지우면 그 본문의 성도님 진행 기록(passage_progress — 마친 마디·다 외움)이 함께 지워진다(on delete cascade). 그래서 두 번 묻는다.
// ⚠️ 성도님 진행 기록은 「몇째 마디」(0부터)로 남는다 — 줄 수나 차례가 바뀌는 저장은 먼저 묻는다(linesChange).
// ⚠️ 공개 스위치는 이 화면 한 곳 — ⚙️ 앱 설정·문구 목록에서는 뺐다(JSON 으로 "false" 라고 적으면 글자라서 앱이 「켜짐」으로 읽는다).
//    성도님 앱은 공개 값을 열 때 받아 두었다가 다음 첫 화면부터 쓴다(app.js refreshPassagesPublic) — 바로 안 보일 수 있다고 사실대로 말한다.
// ⚠️ 서버 글자는 모두 esc. 확인은 dialog 만(브라우저 confirm 금지) · 저장 중엔 busy / openForm 이 단추를 잠근다.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import {
  PUBLIC_KEY, BAD_HINT, chunksOf, countText, passageToForm, formToPassage, linesChange, linesChangeText,
  PROGRESS_NOTE, ACTIVE_OFF_WARN, publicState, PUBLIC_TEXT, publicWarn, publicConfirm, previewUrl, passageErrorText,
} from "./passages-logic.js";

const TITLE = `<h2 class="page-title">📜 내 안에 거하는 말씀</h2>`;
const failText = (r) => passageErrorText(r) || errorText(r);
// 본문 칸 보기 글 — 줄바꿈은 &#10; 로(esc 를 거치지 않는 고정 글)
const LINES_PLACEHOLDER = "하늘에 계신 우리 아버지여 이름이 거룩히 여김을 받으시오며&#10;" +
  "나라가 임하시오며 뜻이 하늘에서 이루어진 것 같이 땅에서도 이루어지이다&#10;오늘 우리에게 일용할 양식을 주시옵고 …";

const badgeCls = { on: " ok", off: "", unknown: " mp-warn" };

function pubCard(pub, count, preview) {
  const warn = publicWarn(pub, count);
  const btn = pub === "unknown"
    ? `<button type="button" class="btn" data-act="reload">다시 불러오기</button>`
    : pub === "on"
      ? `<button type="button" class="btn" data-act="pub" data-to="0">숨기기</button>`
      : `<button type="button" class="btn primary" data-act="pub" data-to="1">성도님께 보이게 하기</button>`;
  return `<div class="card mp-pub">
    <div class="mp-pub-h"><b>성도님께 공개</b> <span class="badge${badgeCls[pub]}">${esc(PUBLIC_TEXT[pub])}</span></div>
    <p class="muted">켜면 성도님 첫 화면에 「📜 내 안에 거하는 말씀」 단추가 생겨요. 바꾼 뒤 성도님 앱에는 바로 안 보일 수 있어요 — 앱이 열 때 받아 두었다가 그다음 첫 화면부터 써요.</p>
    ${warn ? `<p class="be-warn">${esc(warn)}</p>` : ""}
    <div class="acts">${btn}${preview ? `<a class="btn" href="${esc(preview)}" target="_blank" rel="noopener">▶ 성도님 화면으로 미리 보기</a>` : ""}</div>
    <p class="muted mp-pv">${preview
      ? "미리 보기 주소(?passages=1)는 공개를 꺼 둬도 열려요 — 주소를 아는 분은 누구나 볼 수 있어요."
      : "개발 DB 로 보는 중이라 미리 보기 단추가 없어요 — 성경암송 앱을 이 PC 에서 띄워 주소 끝에 ?passages=1 을 붙이면 같은 화면이 열려요."}</p>
  </div>`;
}

function passageCard(p) {
  const chunks = chunksOf(p.lines);
  return `<div class="card mp-card" data-id="${esc(p.id)}">
    <div class="mp-h"><b>${esc(p.title)}</b>${p.ref ? ` <span class="muted">${esc(p.ref)}</span>` : ""}</div>
    <div class="mp-chips">${p.category ? `<span class="badge">${esc(p.category)}</span>` : ""}<span class="badge">마디 ${chunks.length}개</span>` +
      `<span class="badge">차례 ${esc(p.sortOrder ?? 0)}</span><span class="badge">번호 ${esc(p.id)}</span></div>
    <p class="muted mp-first">${esc(chunks[0] || "")}${chunks.length > 1 ? " …" : ""}</p>
    <div class="acts"><button type="button" class="btn" data-act="edit">고치기</button>
      <button type="button" class="btn danger" data-act="del">지우기</button></div>
  </div>`;
}

// 창의 칸 — v = passageToForm 결과 · isNew = 새 본문(「목록에 보이기」 칸 없음)
function formHtml(v, isNew) {
  const txt = (k, label, hint, attrs = "") => `<label class="field"><span>${esc(label)} <small>(${esc(hint)})</small></span>` +
    `<input data-f="${k}" value="${esc(v[k])}" autocomplete="off" ${attrs}></label>`;
  return `<div class="mp-form">` + (isNew ? "" : `<p class="be-note">${esc(PROGRESS_NOTE)}</p>`) +
    txt("title", "제목", "꼭", `placeholder="예: 주기도문"`) +
    txt("ref", "출처", "선택 · 성도님 목록에 제목 옆으로 보여요", `placeholder="예: 마 6:9-13"`) +
    txt("category", "분류", "선택 · 지금은 성도님 화면에 안 보여요", `placeholder="예: 기도문 / 신앙고백 / 시편 / 주제"`) +
    txt("sortOrder", "차례", "정수 · 작을수록 위 · 비우면 0", `inputmode="numeric" placeholder="0"`) +
    `<label class="field"><span>본문 <small>(꼭 · 한 줄 = 한 번에 외울 분량(마디))</small></span>` +
    `<textarea data-f="text" rows="10" placeholder="${LINES_PLACEHOLDER}">${esc(v.text)}</textarea></label>` +
    `<p class="be-hint mp-count" data-count aria-live="polite">${esc(countText(v.text))}</p>` +
    `<p class="be-hint">한 줄에 한 번에 외울 분량씩 적어 주세요. 그 한 줄이 앱에서 마디 하나가 돼요(짧으면 짧게, 길면 길게). 줄바꿈이 곧 마디 경계이고, 빈 줄은 건너뛰어요. ${esc(BAD_HINT)}.</p>` +
    (isNew ? "" : `<div class="checks"><label><input type="checkbox" data-f="active" checked> 성도님 목록에 보이기</label></div>` +
      `<p class="be-warn" data-active-warn hidden>${esc(ACTIVE_OFF_WARN)}</p>`) +
    `</div>`;
}
const readForm = (root) => {
  const g = (k) => root.querySelector(`[data-f="${k}"]`);
  const a = g("active");
  return { title: g("title").value, ref: g("ref").value, category: g("category").value,
    sortOrder: g("sortOrder").value, text: g("text").value, active: a ? a.checked : true };
};

// → { id, hidden } 저장했으면 · null 닫았으면(메뉴를 옮겨 닫혀도 null — 그때도 쓰기는 됐을 수 있다 · 메뉴를 다시 열면 새로 불러온다)
function openPassageForm({ call, passage = null }) {
  const isNew = !passage;
  let initial = "";
  return openForm({
    title: isNew ? "＋ 새 본문" : "✏️ 본문 고치기", okLabel: isNew ? "더하기" : "저장",
    html: formHtml(passageToForm(passage), isNew),
    onOpen: (root) => {
      initial = JSON.stringify(readForm(root));
      root.addEventListener("input", (e) => {
        if (e.target.matches('[data-f="text"]')) root.querySelector("[data-count]").textContent = countText(e.target.value);
      });
      root.addEventListener("change", (e) => {
        if (e.target.matches('[data-f="active"]')) root.querySelector("[data-active-warn]").hidden = e.target.checked;
      });
    },
    isDirty: (root) => JSON.stringify(readForm(root)) !== initial,
    onSubmit: async (root) => {
      const out = formToPassage(readForm(root), isNew ? null : passage.id);
      if (!out.ok) return out;
      if (!isNew) {
        const kind = linesChange(passage.lines, out.passage.lines);
        if ((kind === "count" || kind === "moved") && !(await dialog({
          title: "마디가 바뀌어요", text: linesChangeText(kind, passage.lines, out.passage.lines), ok: "그래도 저장", cancel: "돌아가기",
        }))) return { ok: false };
        if (!out.passage.is_active && !(await dialog({
          title: "이 본문을 목록에서 뺄까요?", text: ACTIVE_OFF_WARN, ok: "빼고 저장", cancel: "돌아가기", danger: true,
        }))) return { ok: false };
      }
      // id 를 맨 위에도 — 교회 어드민 「바꾼 기록」(memProxy audit)이 b.id 를 읽는다(api savePassage 는 passage.id 만 본다)
      const r = await call("savePassage", { id: out.passage.id, passage: out.passage });
      if (!r.ok) return { ok: false, message: failText(r) };
      return { ok: true, value: { id: r.id ?? out.passage.id, hidden: !out.passage.is_active } };
    },
  });
}

// 지우기 — 되돌릴 수 없다. ① 무엇이 함께 지워지는지 보여 주고 ② 한 번 더 묻는다(사역 신청 현황 confirmDelete 와 같은 꼴).
//   ⚠️ dialog 의 html 에 줄바꿈 글자를 넣지 않는다(.dlg .body 가 pre-line 이라 빈 줄이 생긴다) — <br> 만.
async function confirmDelete(p) {
  const what = `<b>「${esc(p.title)}」</b>${p.ref ? ` <span class="muted">${esc(p.ref)}</span>` : ""}` +
    `<br><span class="muted">번호 ${esc(p.id)} · 마디 ${chunksOf(p.lines).length}개</span>`;
  if (!(await dialog({
    title: "🗑 이 본문을 지울까요?", ok: "지웁니다", cancel: "그만두기", danger: true,
    html: `${what}<br><br>본문과 함께 <b>이 본문을 외우던 성도님들의 진행 기록(마친 마디 · 다 외움)도 모두 지워져요.</b>` +
      `<p class="muted">되돌릴 수 없어요. 진행 기록은 남기고 성도님 목록에서만 빼려면 지우지 말고 「고치기」에서 「성도님 목록에 보이기」를 끄세요(그것도 여기서는 다시 켤 수 없어요).</p>`,
  }))) return false;
  return dialog({
    title: "⚠️ 정말 지울까요 — 되돌릴 수 없어요", ok: "네, 지웁니다", cancel: "아니요", danger: true,
    html: `마지막 확인이에요.<br>${what}<br><br>성도님 앱의 목록에서도 사라져요.`,
  });
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const preview = previewUrl(window.SUPA && window.SUPA.env);
  let list = null;      // 본문 — null = 못 불러옴
  let listErr = "";
  let pub = "unknown";  // 공개 스위치 — on · off · unknown

  const load = async () => {
    const [r, c] = await Promise.all([call("getPassages", {}), call("getConfig", { key: PUBLIC_KEY })]);
    if (r.ok) { list = r.passages || []; listErr = ""; } else { list = null; listErr = failText(r); }
    pub = publicState(c);
  };
  const draw = () => {
    el.innerHTML = TITLE + pubCard(pub, list ? list.length : null, preview) +
      (list
        ? `<h3 class="sec-title">본문 ${list.length}개</h3>
          <div class="acts mp-top"><button type="button" class="btn primary" data-act="new">＋ 새 본문</button>
            <button type="button" class="btn" data-act="reload">다시 불러오기</button></div>
          <p class="muted mp-order">성도님 목록은 「차례」가 작은 것부터, 같으면 먼저 만든 것부터예요.</p>
          <div class="mp-list">${list.length ? list.map(passageCard).join("")
            : `<p class="empty">아직 본문이 없어요 — 「＋ 새 본문」으로 더해 주세요<br>(예: 주기도문 · 사도신경 · 시편 23편)</p>`}</div>`
        : `<p class="empty">${esc(listErr)}</p><div class="acts mp-top"><button type="button" class="btn" data-act="reload">다시 불러오기</button></div>`);
  };
  const reload = async () => { await load(); draw(); };

  await reload();

  let opening = false;   // 창을 여는 단추를 두 번 눌러 창이 둘 뜨지 않게
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b || opening) return;
    const act = b.dataset.act;
    const card = b.closest("[data-id]");
    const p = card && list ? list.find((x) => String(x.id) === card.dataset.id) : null;

    if (act === "reload") { await busy(el, reload); return; }

    if (act === "pub") {
      const to = b.dataset.to === "1";
      const q = publicConfirm(to, list ? list.length : null);
      if (!(await dialog(q))) return;
      await busy(el, async () => {
        const r = await call("saveConfig", { key: PUBLIC_KEY, value: to });
        toast(r.ok ? (to ? "성도님께 보이게 했어요." : "성도님께 숨겼어요.") : errorText(r));
        await reload();   // 서버가 지금 무엇을 갖고 있는지 다시 읽어 그대로 보인다(다른 분이 함께 바꿨어도)
      });
      return;
    }

    if (act === "new" || (act === "edit" && p)) {
      opening = true;
      let saved = null;
      try { saved = await openPassageForm({ call, passage: act === "edit" ? p : null }); } finally { opening = false; }
      if (!saved) return;
      toast(saved.hidden ? "목록에서 뺐어요 — 성도님께도 안 보여요." : act === "new" ? "더했어요." : "저장했어요.");
      await busy(el, reload);
      return;
    }

    if (act === "del" && p) {
      if (!(await confirmDelete(p))) return;
      await busy(el, async () => {
        const r = await call("deletePassage", { id: p.id });
        toast(r.ok ? `「${p.title}」 본문을 지웠어요.` : failText(r));
        if (r.ok) await reload();
      });
    }
  });
}
