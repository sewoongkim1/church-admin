// 📅 당번 명단의 입력 창들 — 자리 틀 · 날짜 더하기 · 쉬는 기간 · 대신 넣기 · 메모 · 정원 (봉사 당번 1단계 · 2026-10-06)
//   서버: dutyLineSave·dutyDateAdd·dutyDaysOff·dutyPeopleLookup·dutySignAdd·dutySignNote·dutyDaySet·dutySlotSet. 말·규칙은 duty-logic.js(시험).
// ⚠️ 교인ID 는 화면에 오지 않는다 — 대신 넣기는 찾은 이름·몇 번째·소속 확인값(check)만 서버로 보내고 서버가 같은 찾기를 다시 돌려 확인한다(교육 대신 등록과 같다).
// ⚠️ 정원·겹침은 서버가 알려 준 뒤(full·overlap) 확인 한 번으로 넘긴다(force) — 화면이 먼저 판단하지 않는다.
// ⚠️ 쉬는 날은 먼저 세고(expect 없이 = 아무것도 안 바꿈) → 그 수를 확인 창에 보여 주고 → 그 수(expect)로 쓴다. 그사이 수가 바뀌면 다시 묻는다.
// ⚠️ 고르기·날짜·시각은 picker.js 고르개만. 서버 글자는 모두 esc.
import { esc, toast, dialog, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne, pickMany, pickDate, pickTime, fmtTimeLabel } from "../../core/picker.js";
import { pickArgs, TYPED_SUB_HINT } from "../education/enrollments-logic.js";
import { WEEKDAY_OPTIONS, weekdayText, formToLine, lineToForm, lineText, dayLabel, addDays, slotName, timeRange, forceAsk, needsForce, offAsk, addDoneText,
  dutyWord, addNote, notifyFailed } from "./duty-logic.js";

export const failText = (r) => dutyWord(r?.error) || errorText(r);
// 저장 뒤 한 줄 — 평소에는 지나가는 토스트. **앱 알림을 보내지 못했으면 창으로 띄워 확인을 받는다**: 그분께 따로 알려야 하는데 4초짜리 글은 놓친다
//   (core/ui.js 「놓치면 안 되는 것은 toast 가 아니라 dialog」). 빼기·넣기·옮기기·쉼은 다시 눌러 보낼 길도 없다(not-active·already 로 끝난다 · 검토 반영 2026-10-07).
export async function sayDone(text, r) {
  if (notifyFailed(r)) await dialog({ title: "앱 알림을 보내지 못했어요", text, ok: "확인", cancel: null });
  else toast(text);
}
const hid = (k, v) => `<input type="hidden" data-f="${k}" value="${esc(v)}">`;
const txt = (k, label, v, attrs = "", hint = "") => `<label class="field"><span>${esc(label)}${hint ? ` <small>(${esc(hint)})</small>` : ""}</span>` +
  `<input data-f="${k}" value="${esc(v)}" autocomplete="off" ${attrs}></label>`;
const pickBtn = (attr, label, text, empty) => `<div class="field"><span>${esc(label)}</span>
  <button type="button" class="pk-field${empty ? " empty" : ""}" ${attr} aria-haspopup="dialog" aria-expanded="false"
    aria-label="${esc(label)}, ${esc(text)}"><span class="pk-field-v">${esc(text)}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>`;
const setBtn = (b, label, text, empty) => {
  b.querySelector(".pk-field-v").textContent = text;
  b.setAttribute("aria-label", `${label}, ${text}`);
  b.classList.toggle("empty", !!empty);
};
const vals = (root) => Object.fromEntries([...root.querySelectorAll("[data-f]")].map((i) => [i.dataset.f, i.value.trim()]));
const dateText = (v) => (v ? `${v.slice(0, 4)}년 ${dayLabel(v)}` : "날짜 고르기");
const timeText = (v) => (v ? fmtTimeLabel(v) : "시각 고르기");

// ---------- 자리 틀 ----------
// → { r, created }(저장) · null(닫음) · "gone"(그사이 틀·당번이 없어졌다 — 새로 불러온다)
export function openLineForm({ call, boardId, line = null }) {
  const v = lineToForm(line);
  let first = "", gone = false;
  return openForm({
    title: line ? "✏️ 자리 틀 고치기" : "＋ 자리 틀 더하기", okLabel: line ? "저장" : "더하기",
    html: (line ? "" : `<p class="be-note">자리 틀 하나 = 「매주 주일 · 2부 · 설거지 · 11:30~12:30 · 2명」. 매주 그 요일에 자리가 저절로 생겨요.</p>`) +
      txt("service", "예배·조 이름", v.service, `maxlength="12" placeholder="예: 2부 · 토요 · 김장"`) +
      txt("task", "하는 일", v.task, `maxlength="20" placeholder="예: 설거지"`, "안 써도 돼요") +
      hid("weekday", v.weekday) + pickBtn(`data-pick="weekday"`, "요일", weekdayText(v.weekday), false) +
      (line ? `<p class="muted ec-hint">요일을 바꾸면 옛 요일의 빈 자리는 지우고, 지원이 있는 자리는 남겨요</p>` : "") +
      `<div class="ec-pair">${hid("start", v.start)}${pickBtn(`data-time="start"`, "시작", timeText(v.start), !v.start)}
        ${hid("end", v.end)}${pickBtn(`data-time="end"`, "끝", timeText(v.end), !v.end)}</div>` +
      txt("capacity", "정원(명)", v.capacity, `inputmode="numeric" maxlength="3"`) +
      (line ? `<label class="dty-check"><input type="checkbox" data-future checked> 앞날 자리의 정원도 함께 바꾸기 <small class="muted">(자리마다 따로 고친 정원은 그대로 둬요)</small></label>` : "") +
      hid("id", v.id) + hid("sort", v.sort),
    onOpen: (root) => {
      root.addEventListener("click", async (e) => {
        const p = e.target.closest("[data-pick]");
        if (p) {
          const got = await pickOne({ anchor: p, title: "요일", options: WEEKDAY_OPTIONS, value: vals(root).weekday });
          if (got !== null && p.isConnected) { root.querySelector('[data-f="weekday"]').value = got; setBtn(p, "요일", weekdayText(got), false); }
          return;
        }
        const t = e.target.closest("[data-time]");
        if (t) {
          const k = t.dataset.time, cur = vals(root), label = k === "start" ? "시작" : "끝";
          const got = await pickTime({ anchor: t, title: `${label} 시각`, value: cur[k], near: k === "end" ? cur.start : "" });
          if (got !== null && t.isConnected) { root.querySelector(`[data-f="${k}"]`).value = got; setBtn(t, label, timeText(got), !got); }
        }
      });
      first = JSON.stringify(vals(root));
    },
    isDirty: (root) => JSON.stringify(vals(root)) !== first,
    onSubmit: async (root) => {
      const f = formToLine(vals(root));
      if (f.error) return { ok: false, message: f.error };
      if (line && !f.line.id) return { ok: false, message: "틀 번호를 읽지 못했어요 — 닫고 다시 열어 주세요" };   // 고치기가 새 틀을 만들지 않게
      const future = root.querySelector("[data-future]");
      const r = await call("dutyLineSave", { board_id: boardId, line: f.line, apply_future: !!(future && future.checked) });
      if (r.ok) return { ok: true, value: { r, created: !line } };
      if (r.error === "not-found" || r.error === "not-assigned") { gone = true; return { ok: true, value: null }; }
      return { ok: false, message: failText(r) };
    },
  }).then((x) => (gone ? "gone" : x));
}

// ---------- 날짜 더하기 ----------
// 요일과 무관하게 그 날짜에 고른 틀의 자리를 만든다(특별 예배 · 한 번짜리 모집). lines = 살아 있는 틀 · → { date, r } · null
export function openDateAddForm({ call, boardId, lines, today, untilDate = "" }) {
  const opts = (lines || []).map((l) => ({ value: String(l.id), label: lineText(l) }));
  const loose = (lines || []).filter((l) => l.weekday === null).map((l) => String(l.id));
  let picked = loose.length ? loose : opts.map((o) => o.value);     // 「날짜를 골라 넣는」 틀이 있으면 그것만, 없으면 모두
  let date = "", first = "";
  // 단추에는 짧은 이름만(「1부 설거지, 2부 설거지」) — 요일·시각·정원까지 적으면 한 줄에 다 안 보인다(고르개 안에는 다 보인다)
  const linesText = () => (picked.length ? (lines || []).filter((l) => picked.includes(String(l.id))).map((l) => slotName(l)).join(", ") : "자리 틀 고르기");
  return openForm({
    title: "＋ 날짜 더하기", okLabel: "자리 만들기",
    html: `<p class="be-note">요일과 상관없이 그 날짜에 자리를 만들어요 — 성탄절·특별 예배나 김장 같은 한 번짜리 모집에 써요.</p>` +
      pickBtn("data-date", "날짜", dateText(""), true) + pickBtn("data-lines", "만들 자리(자리 틀)", linesText(), !picked.length),
    onOpen: (root) => {
      root.addEventListener("click", async (e) => {
        const d = e.target.closest("[data-date]");
        if (d) {
          const got = await pickDate({ anchor: d, title: "날짜", value: date, min: addDays(today, -31), max: untilDate || addDays(today, 400) });
          if (got !== null && d.isConnected) { date = got; setBtn(d, "날짜", dateText(got), !got); }
          return;
        }
        const l = e.target.closest("[data-lines]");
        if (l) {
          const got = await pickMany({ anchor: l, title: "만들 자리(자리 틀)", options: opts, values: picked });
          if (got !== null && l.isConnected) { picked = got; setBtn(l, "만들 자리(자리 틀)", linesText(), !got.length); }
        }
      });
      first = JSON.stringify([date, picked]);
    },
    isDirty: () => JSON.stringify([date, picked]) !== first,
    onSubmit: async () => {
      if (!date) return { ok: false, message: "날짜를 골라 주세요" };
      if (!picked.length) return { ok: false, message: "자리 틀을 하나 이상 골라 주세요" };
      const r = await call("dutyDateAdd", { board_id: boardId, date, line_ids: picked.map(Number) });
      return r.ok ? { ok: true, value: { date, r } } : { ok: false, message: failText(r) };
    },
  });
}

// ---------- 쉬는 날 ----------
// 먼저 세고 → 확인 → 쓴다. → { ok:true, r } · { cancelled:true } · { error: 서버 거절 }
//   note: undefined 면 메모를 건드리지 않는다 · 다시 열기에는 "" 를 보내 쉬는 까닭을 지운다(서버가 이번에 연 날에만 지운다).
//   tail: 확인 글 끝에 덧붙일 한 마디(날 판의 「다시 열기」가 그날 메모를 함께 지울 때)
export async function offFlow({ call, boardId, from, to, off, note, tail = "" }) {
  const base = { board_id: boardId, from, to, off, ...(note === undefined ? {} : { note }) };
  for (let i = 0; i < 3; i++) {
    const d = await call("dutyDaysOff", base);                       // expect 없이 = 세기만
    if (!d.ok) return { error: d };
    const text = offAsk({ from, to, off, active: d.active, days: d.days, tail });
    if (!d.days) { await dialog({ title: off ? "😴 쉬는 날로" : "다시 열기", text, ok: "확인", cancel: null }); return { cancelled: true }; }
    const yes = await dialog({ title: off ? "😴 쉬는 날로" : "다시 열기", text, ok: off ? "쉬는 날로" : "다시 열기", cancel: "그만두기", danger: off });
    if (!yes) return { cancelled: true };
    const r = await call("dutyDaysOff", { ...base, expect: d.active });
    if (r.ok) return { ok: true, r };
    if (r.error !== "changed") return { error: r };
    toast("그사이 지원이 바뀌었어요 — 다시 확인해 주세요");
  }
  return { error: { ok: false, error: "changed" } };
}

// 쉬는 기간 창 — 하루(시작일 = 끝날) 또는 기간 · 쉬는 날로 / 다시 열기 · 쉬는 까닭 한 줄. → { r, off } · null
export function openOffForm({ call, boardId, today, from = "", to = "", note = "" }) {
  const st = { from, to: to || from, off: true };
  let first = "";
  const snap = (root) => JSON.stringify([st.from, st.to, st.off, root.querySelector("[data-note]").value]);
  return openForm({
    title: "😴 쉬는 기간", okLabel: "다음",
    html: `<div class="tabs" role="tablist"><button type="button" role="tab" data-off="1" class="on">쉬는 날로</button>
        <button type="button" role="tab" data-off="0">다시 열기</button></div>
      <p class="be-note" data-help>쉬는 동안에는 앱에 「이날은 쉬어요」로 보이고 지원을 받지 않아요. 이미 지원한 분의 줄은 지우지 않고 두었다가 다시 열면 그대로 살아나요.</p>
      <div class="be-2col">${pickBtn(`data-d="from"`, "시작일", dateText(st.from), !st.from)}${pickBtn(`data-d="to"`, "끝날", dateText(st.to), !st.to)}</div>
      <label class="field" data-note-w><span>쉬는 까닭 <small>(앱에 함께 보여요 · 안 써도 돼요)</small></span>
        <input data-note maxlength="60" autocomplete="off" value="${esc(note)}" placeholder="예: 여름 휴가"></label>`,
    onOpen: (root) => {
      root.addEventListener("click", async (e) => {
        const t = e.target.closest("[data-off]");
        if (t) {
          st.off = t.dataset.off === "1";
          root.querySelectorAll("[data-off]").forEach((b) => b.classList.toggle("on", b === t));
          root.querySelector("[data-note-w]").hidden = !st.off;
          root.querySelector("[data-help]").textContent = st.off
            ? "쉬는 동안에는 앱에 「이날은 쉬어요」로 보이고 지원을 받지 않아요. 이미 지원한 분의 줄은 지우지 않고 두었다가 다시 열면 그대로 살아나요."
            : "쉬는 날로 해 둔 날을 다시 열어요 — 쉬기 전에 지원한 분의 자리가 그대로 살아나고, 적어 둔 쉬는 까닭은 지워요.";
          return;
        }
        const d = e.target.closest("[data-d]");
        if (d) {
          const k = d.dataset.d, label = k === "from" ? "시작일" : "끝날";
          // 시작일은 끝날에 묶지 않는다 — 더 늦은 날을 고르면 끝날이 따라온다(하루만 쉬는 일이 많아 끝날을 같은 날로 채워 두기 때문)
          const got = await pickDate({ anchor: d, title: label, value: st[k], min: k === "to" && st.from ? st.from : today, max: addDays(today, 400) });
          if (got !== null && d.isConnected) {
            st[k] = got; setBtn(d, label, dateText(got), !got);
            if (k === "from" && got && (!st.to || st.to < got)) { st.to = got; setBtn(root.querySelector('[data-d="to"]'), "끝날", dateText(got), false); }
          }
        }
      });
      first = snap(root);
    },
    isDirty: (root) => snap(root) !== first,
    onSubmit: async (root) => {
      if (!st.from || !st.to) return { ok: false, message: "시작일과 끝날을 골라 주세요" };
      if (st.to < st.from) return { ok: false, message: "끝날이 시작일보다 앞서요" };
      const memo = root.querySelector("[data-note]").value.trim();
      const g = await offFlow({ call, boardId, from: st.from, to: st.to, off: st.off, note: st.off ? (memo || undefined) : "" });
      if (!root.isConnected) return { ok: false };
      if (g.cancelled) return { ok: false };
      if (g.error) return { ok: false, message: failText(g.error) };
      return { ok: true, value: { r: g.r, off: st.off } };
    },
  });
}

// ---------- 대신 넣기 ----------
const candLine = (p) => [p.who_type, p.group, p.sub].filter(Boolean).join(" · ");
const candCard = (p, i) => `<div class="card ee-row" data-cand="${i}">
  <div><b>${esc(p.name)}</b></div><div class="muted">${esc(candLine(p))}</div>
  ${p.church_mok || p.position ? `<div class="muted">${esc([p.church_mok, p.position].filter(Boolean).join(" · "))}</div>` : ""}
  <div class="ee-acts"><button type="button" class="btn primary" data-reg="${i}">넣기</button></div></div>`;

// → 넣기 요청을 한 번이라도 보냈으면 true(명단을 다시 불러온다). day·slot = 명단의 그날·그 자리(제목과 서버로 보낼 slot_id)
export async function openAddForm({ call, boardId, day, slot }) {
  let tab = "pick", added = false, adding = false;
  let tried = false;   // 넣기 요청을 한 번이라도 보냈나 — 응답 전에 창을 닫아도 명단을 다시 불러오게(넣어졌을 수 있다)
  let inflight = null; // 지금 서버에 가 있는 넣기(끝나면 그 답) — 창을 닫아도 이것이 끝난 뒤에야 명단을 다시 불러온다
  let rootEl = null, lastName = "", shown = false;   // shown = 방금 끝난 넣기의 결과를 창 안에서 이미 알렸나
  let cands = [], searched = "", first = "";
  const typedVals = (root) => ({ name: root.querySelector("[data-t=name]").value, who: root.querySelector("[data-t=who]").value,
    group: root.querySelector("[data-t=group]").value, sub: root.querySelector("[data-t=sub]").value });

  // 한 번 부르고, 정원·겹침에 걸리면 알려 준 뒤 같은 인자에 force 를 더해 다시 부른다
  //   창을 닫은 뒤에 온 정원·겹침 거절에는 확인 창을 띄우지 않는다(닫힌 창의 물음이 명단 위에 뜨지 않게) — 넣지 않고 { kept, late } 로 끝낸다.
  const addCall = (args, name) => {
    tried = true; shown = false; lastName = name;
    const run = (async () => {
      let r = await call("dutySignAdd", { slot_id: slot.id, ...args });
      if (needsForce(r)) {
        if (!rootEl || !rootEl.isConnected) return { kept: true, late: true };
        const yes = await dialog({ title: "그래도 넣을까요?", text: forceAsk(r, "넣을까요"), ok: "넣기", cancel: "그만두기" });
        if (!yes) return { kept: true };
        r = await call("dutySignAdd", { slot_id: slot.id, ...args, force: true });
      }
      return r;
    })();
    inflight = run.catch(() => null);
    return run;
  };

  return openForm({
    title: `＋ 넣기 — ${dayLabel(day.date)} ${slotName(slot)}`, okLabel: "넣기", cancelLabel: "닫기", hideOk: true,   // 찾기 쪽은 카드마다 「넣기」가 있다
    html: `<p class="muted dty-addsub">${esc(timeRange(slot))}${day.locked && !day.past ? " · 확정된 날" : ""} · ${esc(addNote(day))}</p>
      <div class="tabs" role="tablist"><button type="button" role="tab" data-tab="pick" class="on">교인명부에서 찾기</button>
        <button type="button" role="tab" data-tab="typed">직접 입력(새가족 등)</button></div>
      <div data-panel="pick">
        <label class="field"><span>이름</span><input data-q maxlength="40" autocomplete="off" placeholder="이름을 쓰고 찾기를 눌러 주세요"></label>
        <button type="button" class="btn ee-find" data-find>찾기</button>
        <div data-res></div></div>
      <div data-panel="typed" hidden>
        <label class="field"><span>이름</span><input data-t="name" maxlength="40" autocomplete="off"></label>
        <label class="field"><span>구분</span><input data-t="who" maxlength="40" value="새가족" autocomplete="off"></label>
        <label class="field"><span>소속 <small>(안 써도 돼요)</small></span><input data-t="group" maxlength="40" autocomplete="off"></label>
        <label class="field"><span>세부 <small>(안 써도 돼요)</small></span><input data-t="sub" maxlength="40" autocomplete="off"></label>
        <p class="muted ee-hint">${esc(TYPED_SUB_HINT)}</p></div>`,
    onOpen: (root) => {
      const res = root.querySelector("[data-res]"), q = root.querySelector("[data-q]");
      rootEl = root;
      first = JSON.stringify(typedVals(root));
      const find = async () => {
        const name = q.value;
        if (!name.trim()) { res.innerHTML = `<p class="empty">이름을 써 주세요</p>`; return; }
        res.innerHTML = `<p class="empty">찾는 중…</p>`;
        const r = await call("dutyPeopleLookup", { name, board_id: boardId });   // 맡은 당번의 창에서만 찾을 수 있다(서버가 당번을 본다)
        if (!root.isConnected) return;
        if (!r.ok) { cands = []; res.innerHTML = `<p class="empty">${esc(failText(r))}</p>`; return; }
        if (r.source === null) { cands = []; res.innerHTML = `<p class="empty">교인명부가 없어 직접 입력으로 넣어 주세요</p>`; return; }
        cands = r.people || []; searched = name;
        res.innerHTML = cands.length ? cands.map(candCard).join("") : `<p class="empty">교인명부에 없어요 — 「직접 입력」으로 넣어 주세요</p>`;
      };
      q.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); find(); } });
      root.addEventListener("click", async (ev) => {
        const t = ev.target.closest("[data-tab]");
        if (t) {
          tab = t.dataset.tab;
          root.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === t));
          root.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== tab; });
          if (tab === "pick") root.dataset.hideOk = "1"; else delete root.dataset.hideOk;
          return;
        }
        if (ev.target.closest("[data-find]")) { await find(); return; }
        const reg = ev.target.closest("[data-reg]");
        if (!reg || adding) return;
        const i = Number(reg.dataset.reg), p = cands[i];
        if (!p) return;
        adding = true; reg.disabled = true;
        let done = false;
        try {
          // name 은 찾을 때 넣은 그 글자 · pick 은 받은 목록의 차례(0부터) · check 는 그 카드의 다섯 칸 그대로
          const r = await addCall(pickArgs(searched, i, p), p.name);
          if (!root.isConnected || r.kept) return;      // 닫힌 뒤에 끝난 넣기는 아래 then 이 알린다
          if (r.ok) { added = true; done = true; shown = true; reg.textContent = "넣음"; await sayDone(addDoneText(r, p.name), r); return; }
          shown = true;
          if (r.error === "changed") { cands = []; res.innerHTML = `<p class="empty">그사이 교인명부가 바뀌었어요 — 다시 찾아 주세요</p>`; return; }
          toast(failText(r));
        } finally { adding = false; if (reg.isConnected && !done) reg.disabled = false; }
      });
    },
    isDirty: (root) => JSON.stringify(typedVals(root)) !== first,
    onSubmit: async (root) => {
      if (adding) return { ok: false };
      const v = typedVals(root);
      if (!v.name.trim()) return { ok: false, message: "이름을 써 주세요" };
      adding = true;
      try {
        const r = await addCall({ ident: { name: v.name, who_type: v.who, group_name: v.group, sub_name: v.sub } }, v.name.trim());
        shown = true;
        if (r.kept) return { ok: false };
        if (r.ok) { added = true; await sayDone(addDoneText(r, v.name.trim()), r); return { ok: true, value: true }; }
        return { ok: false, message: failText(r) };
      } finally { adding = false; }
    },
  }).then(async () => {
    // 창을 닫을 때 아직 가 있는 넣기가 있으면 끝나기를 기다린다 — 그래야 다시 불러온 명단에 그분이 보인다. 창 안에서 못 알린 결과는 여기서 알린다.
    const last = inflight ? await inflight : null;
    if (last && !shown) {
      if (last.ok) await sayDone(addDoneText(last, lastName), last);
      else if (last.late) toast("정원이 찼거나 겹치는 자리라 넣지 않았어요 — 다시 「＋ 넣기」에서 확인해 주세요");
      else if (!last.kept) toast(failText(last));
    }
    return added || tried;
  });
}

// ---------- 작은 창들 ----------
// 담당자 메모(지원 줄) — 담당자만 본다(앱·엑셀에 싣지 않는다). → true · null
export function openNoteForm({ call, e }) {
  let first = "";
  return openForm({
    title: `📝 메모 — ${e.name}`, okLabel: "저장",
    html: `<label class="field"><span>메모 <small>(담당자만 봐요 · 500자까지)</small></span><textarea data-note maxlength="500" rows="5">${esc(e.note || "")}</textarea></label>`,
    onOpen: (root) => { first = root.querySelector("[data-note]").value; },
    isDirty: (root) => root.querySelector("[data-note]").value !== first,
    onSubmit: async (root) => {
      const r = await call("dutySignNote", { id: e.id, note: root.querySelector("[data-note]").value.trim() });
      return r.ok ? { ok: true, value: true } : { ok: false, message: r.error === "too-long" ? "메모는 500자까지 적을 수 있어요" : failText(r) };
    },
  });
}

// 그날 한 줄 메모 — 성도님 앱에도 보인다(「추수감사주일」·「여름 휴가」). → true · null
export function openDayNoteForm({ call, boardId, day }) {
  let first = "";
  return openForm({
    title: `📝 ${dayLabel(day.date)} 메모`, okLabel: "저장",
    html: `<label class="field"><span>한 줄 메모 <small>(성도님 앱에도 보여요 · 60자까지 · 비우면 지워요)</small></span>
      <input data-note maxlength="60" autocomplete="off" value="${esc(day.note || "")}" placeholder="예: 추수감사주일 — 평소보다 손이 더 필요해요"></label>`,
    onOpen: (root) => { first = root.querySelector("[data-note]").value; },
    isDirty: (root) => root.querySelector("[data-note]").value !== first,
    onSubmit: async (root) => {
      const r = await call("dutyDaySet", { board_id: boardId, date: day.date, op: "note", note: root.querySelector("[data-note]").value.trim() });
      return r.ok ? { ok: true, value: true } : { ok: false, message: r.error === "too-long" ? "메모는 60자까지 적을 수 있어요" : failText(r) };
    },
  });
}

// 이 자리의 정원만 바꾸기(이 날만 3명). → 저장한 정원(숫자) · null
export function openCapacityForm({ call, day, slot }) {
  const n = (slot.signups || []).length;
  return openForm({
    title: `정원 — ${dayLabel(day.date)} ${slotName(slot)}`, okLabel: "저장",
    html: `<p class="muted dty-addsub">이 날 이 자리만 바꿔요(지금 ${n}분이 서 있어요). 매주 정원을 바꾸려면 「자리 틀」에서 고쳐 주세요.</p>
      <label class="field"><span>정원(명)</span><input data-cap inputmode="numeric" maxlength="3" autocomplete="off" value="${esc(slot.capacity)}"></label>`,
    isDirty: (root) => root.querySelector("[data-cap]").value.trim() !== String(slot.capacity),
    onSubmit: async (root) => {
      const v = root.querySelector("[data-cap]").value.trim();
      if (!/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 200) return { ok: false, message: "정원은 1~200 사이 숫자로 적어 주세요" };
      const r = await call("dutySlotSet", { slot_id: slot.id, capacity: Number(v) });
      if (r.ok) return { ok: true, value: Number(v) };
      return { ok: false, message: r.error === "below-count" ? `지금 ${r.active}분이 서 있어요 — 그보다 적게는 줄일 수 없어요(먼저 옮기거나 빼 주세요)` : failText(r) };
    },
  });
}
