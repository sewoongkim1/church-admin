// 한 분 더하기 · 줄 고치기 · 줄 빼기 — 직접 만든 창(js/core/modal.js openForm).
// 설계 §1 「같은 분 판정」·「줄 모양 검사」 · §2 evRowAdd·evRowSave·evRowDelete·evPeopleLookup · §3 「＋ 한 분 더하기」.
// ⚠️ 줄 검사·다듬기(「화평교구」·「20목장」·「07」·「유년」·직분 「님」)는 서버가 한다(events-rules.ts tidyRow·checkRow) —
//    창은 적은 그대로 보내고, 틀리면 서버 코드를 창 안 빨간 줄로 보인다(판정표를 두 벌 두지 않는다).
// ⚠️ 교인명부 찾기는 「찾기」 단추·Enter 로만 부른다(글자마다 부르지 않는다) — 부를 때마다 서버가 people.lookup 기록(찾은 이름)을
//    남긴다. 돌아오는 것은 이름·구분·소속·세부·직분 다섯뿐이다.
// ⚠️ 앱에서 낸 줄(source='app')과 자격 회차의 줄은 **메모만** — 성도님이 앱에서 「고치기」를 누르면 소속·직분이 통째로 덮이고,
//    자격 회차 명단은 「꾸준히 했다는 판정 결과」다(가을 설계 §10·§12). 서버도 막는다(app-row-note-only) — 그래서 메모만 보낸다.
// ⚠️ 고치기 창은 지금 메모를 그대로 채운다 — 「원래: 화평 30 · 집사」 같은 옛 기록이 지워지지 않게.
// ⚠️ 메모 창의 글자 수 상한은 480(NOTE_FORM_MAX) — 서버는 「담당자가 더함 / 」를 붙인 **뒤** 500자로 센다. 메모는 한 줄로 저장된다.
// ⚠️ 다른 분이 먼저 바꿨으면(conflict·not-found) 창 안에 알리고, 창이 닫히면 onStale(code).
import { esc, toast, dialog, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne } from "../../core/picker.js";
import { GU_ORDER, ROW_KEYS, NOTE_FORM_MAX, norm, whoText, rowPatch } from "./roster-logic.js";

const STALE = {
  conflict: "다른 분이 먼저 이 줄을 바꿨어요 — 적으신 것을 적어 두고 「닫기」를 누르면 새로 불러올게요",
  "not-found": "이 줄(회차)을 찾지 못했어요 — 다른 분이 뺐을 수 있어요. 「닫기」를 누르면 새로 불러올게요",
};
// evRowAdd 의 warnings 는 서버(Task 7)가 만든 한국말 문장이다(「직분 「명예권사」 — 앱 직분 목록에 없어요…」·
// 「같은 이름·소속의 앱 계정이 2개라 잇지 않았어요」) — 그대로 보인다

const posHtml = (p) => (p ? `<em class="be-pos">${esc(p)}</em>` : "");
const roHtml = (r) => `<div class="be-ro"><b>${esc(r.name)}</b> <span>${esc(whoText(r))}</span>${posHtml(r.position)}</div>`;
const noteField = (note) => `<label class="field"><span>담당자 메모 <small>(성도님께는 안 보여요 · 한 줄로 저장돼요 · ${NOTE_FORM_MAX}자까지)</small></span>` +
  `<textarea data-f="note" maxlength="${NOTE_FORM_MAX}" rows="3">${esc(note)}</textarea></label>`;

// 이름·구분·소속·세부·직분·메모 — 교구 칸과 교회학교 칸을 따로 두고 구분 단추(.seg)로 하나만 보인다
function fullHtml(v, { adding, linked }) {
  const isGu = v.who_type !== "교회학교";
  return `<div class="field"><span>이름</span><div class="be-find">` +
      `<input data-f="name" value="${esc(v.name)}" maxlength="40" autocomplete="off" enterkeyhint="search" aria-label="이름">` +
      `<button type="button" class="btn" data-act="find">🔎 찾기</button></div></div>` +
    `<p class="be-hint">이름을 적고 「찾기」(또는 Enter)를 누르면 교인명부에서 소속·직분을 찾아 채워요 · 찾은 이름은 교인명부 열람 기록에 남아요</p>` +
    `<div class="be-cands" aria-live="polite" hidden></div>` +
    `<input type="hidden" data-f="who_type" value="${esc(v.who_type || "교구")}">` +
    `<div class="seg" role="group" aria-label="구분"><button type="button" data-t="교구" aria-pressed="false">교구</button>` +
      `<button type="button" data-t="교회학교" aria-pressed="false">교회학교</button></div>` +
    `<div data-for="교구"><div class="field"><span>교구</span><input type="hidden" data-f="gu" value="${esc(isGu ? v.group : "")}">` +
      `<button type="button" class="pk-field" data-pick="gu" aria-haspopup="dialog" aria-expanded="false"><span class="pk-field-v"></span>` +
      `<span class="pk-field-x" aria-hidden="true"></span></button></div>` +
      `<label class="field"><span>목장 <small>(숫자 또는 남성 · 모르면 비워 두기)</small></span>` +
      `<input data-f="mok" value="${esc(isGu ? v.sub : "")}" maxlength="40" autocomplete="off"></label></div>` +
    `<div data-for="교회학교"><label class="field"><span>부서 <small>(예: 청년부 · 중등부 · 소년2부)</small></span>` +
      `<input data-f="bu" value="${esc(isGu ? "" : v.group)}" maxlength="40" autocomplete="off"></label>` +
      `<label class="field"><span>학년·세부 <small>(모르면 비워 두기)</small></span>` +
      `<input data-f="grade" value="${esc(isGu ? "" : v.sub)}" maxlength="40" autocomplete="off"></label></div>` +
    `<label class="field"><span>직분 <small>(예: 집사 · 권사 · 성도)</small></span>` +
      `<input data-f="position" value="${esc(v.position)}" maxlength="40" autocomplete="off"></label>` +
    noteField(v.note) +
    (adding ? `<p class="be-hint">저장하면 메모 앞에 「담당자가 더함」이 붙어요 · 이름·소속이 같은 앱 계정이 있으면 이어요(새로 만들지 않아요) — ` +
      `이어지면 성도님 앱 「📋 이미 내신 것」에도 보여요</p>` : "") +
    (linked ? `<p class="be-warn" data-warn="linked" hidden>🔗 앱 계정과 이어진 줄이에요 — 이름·소속을 바꿔도 계정 연결은 그대로 남아요</p>` : "");
}

// 창의 칸 → 줄 모양(서버와 같이 빈칸을 다듬어). 메모만 고치는 창은 {note}
function readForm(root) {
  const g = (k) => norm(root.querySelector(`[data-f="${k}"]`)?.value);
  if (!root.querySelector('[data-f="who_type"]')) return { note: g("note") };
  const t = g("who_type");
  const isGu = t !== "교회학교";
  return { who_type: t, group: isGu ? g("gu") : g("bu"), sub: isGu ? g("mok") : g("grade"),
    name: g("name"), position: g("position"), note: g("note") };
}

function candsHtml(r, name) {
  if (!r.source) return `<p class="be-hint">교인명부가 아직 없어요 — 손으로 적어 주세요</p>`;
  const list = r.people || [];
  const head = `<p class="be-hint">교인명부 ${esc(r.source.date)} 기준 · ‘${esc(name)}’ ` +
    (list.length ? `${list.length}분 — 고르면 아래 칸이 채워져요(손으로 고칠 수 있어요)</p>` : `— 같은 이름이 없어요, 손으로 적어 주세요</p>`);
  return head + list.map((p, i) => `<button type="button" class="be-cand" data-cand="${i}"><b>${esc(p.name)}</b>` +
    `<span>${esc(p.who_type ? whoText(p) || p.who_type : "소속을 정할 수 없어요")}</span>${posHtml(p.position)}</button>`).join("");
}

// 교구/교회학교 전환 · 교구 고르기 · 교인명부 찾기 · 후보 고르기
function wireFull(root, { call, onChange }) {
  const $ = (s) => root.querySelector(s);
  const set = (k, v) => { const i = $(`[data-f="${k}"]`); if (i) i.value = v ?? ""; };
  const setType = (t) => {
    set("who_type", t);
    root.querySelectorAll(".seg [data-t]").forEach((b) => {
      const on = b.dataset.t === t;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    root.querySelectorAll("[data-for]").forEach((d) => { d.hidden = d.dataset.for !== (t === "교회학교" ? "교회학교" : "교구"); });
    onChange();
  };
  const showGu = () => {
    const v = $('[data-f="gu"]').value, b = $('[data-pick="gu"]');
    b.querySelector(".pk-field-v").textContent = v || "교구 고르기";
    b.setAttribute("aria-label", `교구, ${v || "고르기"}`);
    b.classList.toggle("empty", !v);
  };
  const cands = $(".be-cands");
  let people = [], seqNo = 0;
  const find = async () => {
    const input = $('[data-f="name"]'), btn = $('[data-act="find"]');
    const name = norm(input.value);
    cands.hidden = false;
    if (!name) { cands.innerHTML = `<p class="be-hint">이름을 먼저 적어 주세요</p>`; input.focus(); return; }
    const my = ++seqNo;
    btn.disabled = true;
    cands.innerHTML = `<p class="be-hint">교인명부에서 찾는 중…</p>`;
    const r = await call("evPeopleLookup", { name });
    btn.disabled = false;
    if (my !== seqNo || !cands.isConnected) return;
    if (!r.ok) { cands.innerHTML = `<p class="be-warn">${esc(errorText(r))}</p>`; return; }
    people = r.people || [];
    cands.innerHTML = candsHtml(r, name);
  };
  const fill = (i) => {
    const p = people[i];
    if (!p) return;
    set("name", p.name);
    if (p.who_type === "교구" || p.who_type === "교회학교") {
      setType(p.who_type);
      if (p.who_type === "교구") { set("gu", p.group); set("mok", p.sub); showGu(); }
      else { set("bu", p.group); set("grade", p.sub); }
    }
    if (p.position) set("position", p.position);
    cands.innerHTML = `<p class="be-hint">✅ 교인명부 값으로 채웠어요 — 손으로 고칠 수 있어요</p>`;
    onChange();
  };
  root.addEventListener("click", async (e) => {
    const t = e.target.closest(".seg [data-t]");
    if (t) { setType(t.dataset.t); return; }
    const pk = e.target.closest('[data-pick="gu"]');
    if (pk) {
      const got = await pickOne({ anchor: pk, title: "교구 고르기", value: $('[data-f="gu"]').value,
        options: GU_ORDER.map((g) => ({ value: g, label: g })) });
      if (got !== null && pk.isConnected) { set("gu", got); showGu(); onChange(); }
      return;
    }
    if (e.target.closest('[data-act="find"]')) { find(); return; }
    const c = e.target.closest("[data-cand]");
    if (c) fill(Number(c.dataset.cand));
  });
  $('[data-f="name"]').addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();   // 창의 「더하기·저장」이 아니라 찾기
    find();
  });
  root.addEventListener("input", onChange);
  setType($('[data-f="who_type"]').value);
  showGu();
}

// 계정이 이어진 줄의 이름·소속을 바꾸려 하면 경고 줄을 보인다(계정 연결은 서버가 그대로 둔다)
function syncLinked(root, row) {
  const w = root.querySelector('[data-warn="linked"]');
  if (!w) return;
  const p = rowPatch(row, readForm(root));
  w.hidden = !["who_type", "group", "sub", "name"].some((k) => k in p);
}

// → 더한/고친 줄(RowOut) · 닫거나 바뀐 것이 없으면 null
export async function openRowForm({ call, ev, row = null, onStale = null } = {}) {
  if (!row && ev.hasEligibility) { toast(errorText({ error: "eligibility-event" })); return null; }
  const noteOnly = !!row && (row.source === "app" || !!ev.hasEligibility);
  const why = row && row.source === "app"
    ? "📱 성도님이 앱에서 낸 신청이라 메모만 고칠 수 있어요 · 빼기는 성도님이 앱에서 해요"
    : "🔒 자격 회차의 줄이라 메모만 고칠 수 있어요";
  const init = row
    ? { who_type: row.who_type, group: row.group || "", sub: row.sub || "", name: row.name || "", position: row.position || "", note: row.note || "" }
    : { who_type: "교구", group: "", sub: "", name: "", position: "", note: "" };
  let first = "", staleCode = "", extra = null;
  const snap = (root) => JSON.stringify(readForm(root));
  const out = await openForm({
    title: !row ? "＋ 한 분 더하기" : noteOnly ? "📝 메모 고치기" : "✏️ 줄 고치기",
    okLabel: !row ? "더하기" : "저장",
    html: noteOnly ? roHtml(row) + `<p class="be-note">${esc(why)}</p>` + noteField(init.note)
      : fullHtml(init, { adding: !row, linked: !!(row && row.hasUser) }),
    onOpen: (root) => {
      if (!noteOnly) wireFull(root, { call, onChange: () => { if (row) syncLinked(root, row); } });
      first = snap(root);
    },
    isDirty: (root) => snap(root) !== first,
    onSubmit: async (root) => {
      const v = readForm(root);
      if (!row) {
        const r = await call("evRowAdd", { event_id: ev.id, row: v });
        if (!r.ok && r.error === "not-found") { staleCode = r.error; return { ok: false, message: STALE["not-found"] }; }
        if (!r.ok) return r;
        extra = { linked: !!r.linked, warnings: r.warnings || [] };
        return { ok: true, value: r.row };
      }
      const patch = rowPatch(row, v, noteOnly ? ["note"] : ROW_KEYS);
      if (!Object.keys(patch).length) return { ok: true, value: null };   // 바뀐 것이 없다 — 부르지 않는다
      const r = await call("evRowSave", { id: row.id, expect: row.updated_at, patch });
      if (!r.ok && STALE[r.error]) { staleCode = r.error; return { ok: false, message: STALE[r.error] }; }
      return r.ok ? { ok: true, value: r.row } : r;
    },
  });
  if (!out) { if (staleCode && onStale) onStale(staleCode); return null; }
  if (!row) {
    toast(`✅ ${out.name}님을 더했어요${extra && extra.linked ? " · 앱 계정과 이었어요" : ""}`);
    if (extra && extra.warnings.length) {
      await dialog({ title: "확인해 주세요", text: extra.warnings.map(String).join(" · "), ok: "알겠어요", cancel: null });
    }
  } else toast(`✏️ ${out.name}님 줄을 고쳤어요`);
  return out;
}

// 줄 빼기 — 한 창 안에서 두 단계(① 무엇을 빼는지 ② 「네, 뺍니다」). import 줄만 — 메뉴가 앱 줄·자격 회차의 줄엔 빼기를 주지 않고,
// 서버도 app-row·eligibility-event 로 막는다.
export async function openRowDelete({ call, row, onStale = null } = {}) {
  let step = 1, staleCode = "";
  const out = await openForm({
    title: "🗑 이 줄을 뺄까요?", okLabel: "빼기", cancelLabel: "그만두기", danger: true,
    html: roHtml(row) + `<p class="be-hint">잘못 들어온 줄을 명단에서 뺍니다 — 성도님 앱의 명단에서도 사라져요</p>` +
      `<p class="be-warn" data-step2 hidden>⚠️ 마지막 확인이에요 — 되돌릴 수 없어요. 「네, 뺍니다」를 누르면 빠져요</p>`,
    onSubmit: async (root) => {
      if (step === 1) {
        step = 2;
        root.querySelector("[data-step2]").hidden = false;
        root.querySelector(".be-ok").textContent = "네, 뺍니다";
        // 두 번 톡톡 눌러 두 단계가 한꺼번에 지나가지 않게 — 창이 onSubmit 동안 단추를 잠그므로 잠긴 채 잠깐 둔다
        await new Promise((res) => setTimeout(res, 600));
        return { ok: false };
      }
      const r = await call("evRowDelete", { id: row.id, expect: row.updated_at });
      if (!r.ok && STALE[r.error]) { staleCode = r.error; return { ok: false, message: STALE[r.error] }; }
      return r.ok ? { ok: true, value: r.deleted } : r;
    },
  });
  if (!out) { if (staleCode && onStale) onStale(staleCode); return null; }
  toast(`🗑 ${row.name}님 줄을 뺐어요`);
  return out;
}
