// 💌 말씀카드 기간 — 성경암송 「💌 축복기도 말씀카드」의 철마다 카드(🎄 성탄 · 🌅 새해)가 보이는 기간(app_config cardSeasons).
//   성경암송 api 프록시(getConfig·saveConfig) — 역할 memorizeadmin. 규칙·말은 card-seasons-logic.js(시험).
// ⚠️ 못 불러왔으면(「모름」 — 실패 · 「허용되지 않은 키」 · 이상한 꼴) 카드를 그리지 않고 저장을 막는다(일부만 든 값으로 덮어쓰지 않게).
// ⚠️ 저장은 카드 하나씩 — 저장 직전에 지금 값을 다시 읽어 그 카드의 키만 바꿔 쓴다(다른 카드·모르는 키는 그대로 · 다른 분이 방금 바꾼 것도 지우지 않게).
// ⚠️ 날짜는 picker.js pickDate 만(시스템 날짜 칸 금지) · 확인·알림은 dialog/toast 만 · 저장 중엔 busy.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { pickDate, kstToday } from "../../core/picker.js";
import {
  CONFIG_KEY, SEASONS, EXPLAIN, UNKNOWN_TEXT, UNKNOWN_WHY, readStored, effective, statusOf, checkWin, mergeSeason,
  draftOf, draftWin, draftDirty, setDraftDate, defaultDraft, fmtRange, fmtMD, savedText, sameWin, CHANGED_TEXT } from "./card-seasons-logic.js";

const TITLE = `<h2 class="page-title">💌 말씀카드 기간</h2>`;
const STATUS_CLS = { now: " ok", soon: " cs-soon", past: " cs-past" };

// 날짜 단추 — 올해 날짜는 「11월 29일」, 다른 해는 「2027년 1월 15일」
function dateBtn(which, label, value, thisYear) {
  return `<button type="button" class="btn cs-date" data-act="${which}"><small>${label}</small>` +
    `<b>${value ? esc(fmtMD(value, thisYear)) : "고르기"}</b></button>`;
}

// 카드 하나 — season · stored(저장된 값) · d(고치는 중인 값) · today
function seasonCard(season, stored, d, today) {
  const e = effective(season, stored);
  const dirty = draftDirty(season, stored, d);
  const st = e.bad ? null : statusOf(e, today);
  const now = e.bad
    ? `<p class="be-warn">저장된 날짜를 읽을 수 없어요 — 날짜를 다시 골라 저장하거나 「기본으로」를 눌러 주세요.</p>`
    : `<p class="cs-win">${esc(fmtRange(e.from, e.to))} <span class="badge">${e.registered ? "등록" : "기본"}</span></p>`;
  let pending = "";
  if (dirty) {
    const chk = d.useDefault ? { ok: true } : checkWin(d.from, d.to);
    pending = chk.ok
      ? `<p class="be-note">저장 전이에요 — 저장하면 ${d.useDefault ? "기본 기간 " : ""}${esc(fmtRange(d.from, d.to))} · ` +
        `${esc(statusOf(d, today).text)}</p>`
      : `<p class="be-warn">${esc(chk.message)}</p>`;
  }
  return `<div class="card cs-card" data-key="${esc(season.key)}">
    <div class="cs-h"><b>${esc(season.name)}</b>${st ? ` <span class="badge${STATUS_CLS[st.kind]}">${esc(st.text)}</span>` : ""}</div>
    ${season.note ? `<p class="muted cs-note">${esc(season.note)}</p>` : ""}
    ${now}
    <div class="cs-dates">${dateBtn("from", "시작일", d.from, today.slice(0, 4))}<span class="cs-tilde" aria-hidden="true">~</span>${dateBtn("to", "끝날", d.to, today.slice(0, 4))}</div>
    ${pending}
    <div class="acts"><button type="button" class="btn" data-act="default"${d.useDefault ? " disabled" : ""}>기본으로</button>
      <button type="button" class="btn primary" data-act="save"${dirty ? "" : " disabled"}>저장</button></div>
    <p class="muted cs-def">기본 기간: ${esc(fmtRange(season.from, season.to))}</p>
  </div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  let got = { state: "unknown", why: "fail" };   // readStored 결과
  let failMsg = "";
  const drafts = {};                               // 카드 키 → 고치는 중인 값

  // 다시 읽기 — 저장하지 않은 다른 카드의 고친 값은 남긴다(except = 방금 저장한 카드는 서버 값으로)
  const load = async (except = "") => {
    const r = await call("getConfig", { key: CONFIG_KEY });
    got = readStored(r);
    failMsg = got.state === "unknown" ? (UNKNOWN_WHY[got.why] || errorText(r)) : "";
    if (got.state !== "ok") return;
    for (const s of SEASONS) {
      const keep = drafts[s.key] && s.key !== except && draftDirty(s, got.stored, drafts[s.key]);
      if (!keep) drafts[s.key] = draftOf(s, got.stored);
    }
  };
  const draw = () => {
    if (got.state !== "ok") {
      el.innerHTML = TITLE + `<div class="card cs-unknown"><p class="be-warn">${esc(UNKNOWN_TEXT)}</p>` +
        (failMsg ? `<p class="muted">${esc(failMsg)}</p>` : "") +
        `<p class="muted">못 불러온 동안에는 저장할 수 없어요(지금 저장된 날짜를 지우지 않으려고요).</p>` +
        `<div class="acts"><button type="button" class="btn" data-act="reload">다시 불러오기</button></div></div>`;
      return;
    }
    const today = kstToday();
    el.innerHTML = TITLE + `<p class="be-note cs-explain">${esc(EXPLAIN)}</p>` +
      `<div class="cs-list">${SEASONS.map((s) => seasonCard(s, got.stored, drafts[s.key], today)).join("")}</div>` +
      `<div class="acts cs-top"><button type="button" class="btn" data-act="reload">다시 불러오기</button></div>`;
  };

  await load();
  draw();

  let picking = false;   // 달력을 두 번 띄우지 않게
  el.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled || picking) return;
    const act = b.dataset.act;
    if (act === "reload") { await busy(el, async () => { await load(); draw(); }); return; }
    if (got.state !== "ok") return;   // 모름 — 저장·고르기 단추는 그려지지 않지만 한 번 더 막는다
    const card = b.closest("[data-key]");
    const season = card && SEASONS.find((s) => s.key === card.dataset.key);
    if (!season) return;
    const d = drafts[season.key];

    if (act === "from" || act === "to") {
      picking = true;
      let v = null;
      try {
        v = await pickDate({ anchor: b, title: `${season.name} — ${act === "from" ? "시작일" : "끝날"}`,
          value: d[act], min: act === "to" ? d.from : "" });
      } finally { picking = false; }
      if (v === null || !el.isConnected) return;
      drafts[season.key] = setDraftDate(d, act, v);
      draw();
      return;
    }

    if (act === "default") { drafts[season.key] = defaultDraft(season); draw(); return; }

    if (act === "save") {
      const win = draftWin(d);
      if (win) {
        const chk = checkWin(win.from, win.to);
        if (!chk.ok) { await dialog({ title: "저장하지 않았어요", text: chk.message, ok: "확인", cancel: null }); return; }
      }
      await busy(el, async () => {
        // 저장 직전에 지금 값을 다시 읽는다 — 그 위에 이 카드의 키만 바꿔 쓴다
        const fr = await call("getConfig", { key: CONFIG_KEY });
        const fresh = readStored(fr);
        if (fresh.state !== "ok") {
          await dialog({ title: "저장하지 않았어요", cancel: null,
            text: `지금 저장된 값을 다시 읽지 못했어요 — 잠시 뒤 다시 해 주세요. ${UNKNOWN_WHY[fresh.why] || errorText(fr)}` });
          return;
        }
        // 이 화면을 연 뒤 다른 분이 같은 카드의 날짜를 바꿨으면 덮어쓰지 않는다 — 새 값을 보여 주고 다시 저장하게(고치던 날짜는 남긴다)
        if (!sameWin(fresh.stored[season.key], got.stored[season.key])) {
          await load();
          draw();
          await dialog({ title: "저장하지 않았어요", cancel: null, text: CHANGED_TEXT });
          return;
        }
        const r = await call("saveConfig", { key: CONFIG_KEY, value: mergeSeason(fresh.stored, season.key, win) });
        if (!r.ok) {
          await dialog({ title: "저장하지 못했어요", cancel: null,
            text: r.error === "허용되지 않은 키" ? UNKNOWN_WHY.key : errorText(r) });
          return;
        }
        toast(savedText(season, win));
        await load(season.key);   // 서버가 지금 갖고 있는 값을 그대로 보인다
        draw();
      });
    }
  });
}
