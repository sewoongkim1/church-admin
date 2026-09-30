// 회차 만들기 · 회차 설정 고치기 — 직접 만든 창(js/core/modal.js openForm). 설계 §2 evEventCreate·evEventSave · §3 「회차 설정」.
// ⚠️ 새 회차는 「준비 중」(draft)으로만 만든다 — 상태 칸이 없다(서버도 draft 로 고정). 공개는 만든 뒤 설정에서.
// ⚠️ 고치기는 **바뀐 칸만** 보낸다(eventPatch). needs·copy·kind 는 보내지 않는다 — 자격 규칙·문구가 조용히 지워지지 않게.
// ⚠️ 검사는 서버가 한다(checkEvent — 공개 확인보다 먼저). 틀리면 창 안 빨간 줄로 보이고 창은 그대로다.
// ⚠️ 저장하면 성도님께 보이게 되는 경우 서버는 아무것도 쓰지 않고 needs-confirm 을 돌려준다 → 확인 창(ui.js dialog)에서
//    「보이게 하기」를 누를 때만 confirmListed:true 로 다시 보낸다.
// ⚠️ 날짜·상태는 시스템 칸(<input type=date>·<select>)이 아니라 picker.js 고르개(pickDate·pickOne)로.
// ⚠️ 다른 분이 먼저 바꿨으면(conflict·not-found) 창을 닫지 않고 창 안에 알린다(친 글을 옮겨 적을 수 있게) —
//    창이 닫히면 onStale(code) 로 부른 쪽이 새로 불러온다.
import { esc, dialog } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickDate, pickOne, fmtDateLabel } from "../../core/picker.js";
import { EV_STATUS, STATUS_KO, STATUS_HINT, norm, eventPatch } from "./roster-logic.js";
// 글자 칸 상한(서버 events-rules.ts EV_TEXT_MAX 와 같다 — 서버도 event-too-long 으로 막는다 · SEC-6)
import { EV_TEXT_MAX } from "./roster-logic.js";
import { ELIG_LINE, UNTIL_WARN } from "./roster-ui.js";

const CONFIRM_TEXT = "이 회차가 성도님 첫 화면에 나타납니다 — 명단(이름·소속·직분)이 로그인 없이 보여요";
const STALE = {
  conflict: "다른 분이 먼저 이 회차를 바꿨어요 — 적으신 것을 적어 두고 「닫기」를 누르면 새로 불러올게요",
  "not-found": "이 회차를 찾지 못했어요 — 「닫기」를 누르면 새로 불러올게요",
};
const DATE_TITLE = { opens_on: "기간 — 시작일", closes_on: "기간 — 마감일", list_until: "명단 공개 종료일" };
const DATE_NONE = { opens_on: "시작일 고르기", closes_on: "마감일 고르기", list_until: "비움 — 기한 없음" };
const dateText = (k, v) => (v ? `${v.slice(0, 4)}년 ${fmtDateLabel(v)}` : DATE_NONE[k]);

const textField = (k, label, hint, v, attrs) => `<label class="field"><span>${esc(label)}${hint ? ` <small>(${esc(hint)})</small>` : ""}</span>` +
  `<input data-f="${k}" value="${esc(v)}" autocomplete="off" ${attrs}></label>`;
const dateField = (k, v) => `<div class="field"><span>${esc(DATE_TITLE[k])}</span><input type="hidden" data-f="${k}" value="${esc(v)}">` +
  `<button type="button" class="pk-field${v ? "" : " empty"}" data-date="${k}" aria-haspopup="dialog" aria-expanded="false" aria-label="${esc(DATE_TITLE[k])}, ${esc(dateText(k, v))}">` +
  `<span class="pk-field-v">${esc(dateText(k, v))}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>`;
const statusField = (st) => `<div class="field"><span>상태</span><input type="hidden" data-f="status" value="${esc(st)}">` +
  `<button type="button" class="pk-field" data-pick="status" aria-haspopup="dialog" aria-expanded="false" aria-label="상태, ${esc(STATUS_KO[st] || st)}">` +
  `<span class="pk-field-v">${esc(STATUS_KO[st] || st)}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>`;

function formHtml(v, ev) {
  return (!ev
      ? `<p class="be-note">새 회차는 「준비 중」으로 만들어져 성도님께 안 보여요 — 만든 뒤 ⚙️ 회차 설정에서 상태를 바꿔 주세요</p>` +
        textField("id", "회차 ID", "영문 소문자·숫자·붙임표 · 만든 뒤 못 바꿔요", v.id, `maxlength="41" autocapitalize="off" spellcheck="false" placeholder="예: summer-2027"`)
      : `<p class="be-hint">회차 ID <b>${esc(ev.id)}</b> — 만든 뒤에는 바꿀 수 없어요</p>` + (ev.hasEligibility ? ELIG_LINE : "")) +
    textField("title", "이름", "관리 목록·명단 제목", v.title, `maxlength="${EV_TEXT_MAX.title}" placeholder="예: 2027 썸머 써 바이블"`) +
    textField("short_title", "짧은 이름", "첫 화면 단추 — 20자 안쪽 권함 · 비우면 이름 그대로", v.short_title, `maxlength="${EV_TEXT_MAX.short_title}"`) +
    textField("subtitle", "부제", "안 써도 돼요", v.subtitle, `maxlength="${EV_TEXT_MAX.subtitle}"`) +
    textField("season", "묶음", "분기 표기 · 예: 2027-3Q", v.season, `maxlength="${EV_TEXT_MAX.season}"`) +
    // 회차 차례 — 성도님 앱 eventOpenList 는 ① 등록할 수 있고 안 낸 것 ② 마감일 ③ 이 차례 ④ id 로 세운다.
    // type=number 는 쓰지 않는다(바퀴·화살표로 값이 바뀌고 빈칸·「-」가 조용히 버려진다) — 숫자 자판만 띄운다. 검사는 서버(bad-sort-order).
    textField("sort_order", "같은 날 마감하는 회차끼리 차례", "작을수록 위 · 보통 0 · 성도님 앱 목록과 첫 화면 단추가 이 차례를 따라요",
      v.sort_order, `inputmode="numeric" maxlength="4" spellcheck="false"`) +
    `<div class="be-2col">${dateField("opens_on", v.opens_on)}${dateField("closes_on", v.closes_on)}</div>` +
    (ev ? statusField(v.status) : "") +
    dateField("list_until", v.list_until) +
    `<p class="be-warn" data-warn="until"${v.list_until ? " hidden" : ""}>${esc(UNTIL_WARN)}</p>`;
}

const read = (root) => Object.fromEntries([...root.querySelectorAll("[data-f]")].map((i) => [i.dataset.f, norm(i.value)]));

function setDate(root, k, v) {
  root.querySelector(`[data-f="${k}"]`).value = v;
  const b = root.querySelector(`[data-date="${k}"]`);
  b.querySelector(".pk-field-v").textContent = dateText(k, v);
  b.setAttribute("aria-label", `${DATE_TITLE[k]}, ${dateText(k, v)}`);
  b.classList.toggle("empty", !v);
  if (k === "list_until") root.querySelector('[data-warn="until"]').hidden = !!v;
}
function setStatus(root, st) {
  root.querySelector('[data-f="status"]').value = st;
  const b = root.querySelector('[data-pick="status"]');
  b.querySelector(".pk-field-v").textContent = STATUS_KO[st] || st;
  b.setAttribute("aria-label", `상태, ${STATUS_KO[st] || st}`);
}

// → 만든/저장한 회차(EvEventOut) · 닫거나 바뀐 것이 없으면 null
export async function openEventForm({ call, ev = null, onStale = null } = {}) {
  const v = ev
    ? { title: ev.title || "", short_title: ev.short_title || "", subtitle: ev.subtitle || "", season: ev.season || "",
        opens_on: ev.opens_on || "", closes_on: ev.closes_on || "", status: ev.status || "draft", list_until: ev.list_until || "",
        sort_order: String(ev.sort_order ?? 0) }
    : { id: "", title: "", short_title: "", subtitle: "", season: "", opens_on: "", closes_on: "", list_until: "", sort_order: "0" };
  let first = "", staleCode = "";
  const out = await openForm({
    title: ev ? "⚙️ 회차 설정 고치기" : "＋ 새 회차 만들기",
    okLabel: ev ? "저장" : "만들기",
    html: formHtml(v, ev),
    onOpen: (root) => {
      root.addEventListener("click", async (e) => {
        const d = e.target.closest("[data-date]");
        if (d) {
          const k = d.dataset.date, cur = read(root);
          // 기간이라 반대쪽 끝을 넘지 못하게 — 시작일은 마감일까지, 마감일은 시작일부터, 공개 종료일은 마감일부터
          const got = await pickDate({ anchor: d, title: DATE_TITLE[k], value: cur[k],
            min: k === "closes_on" ? cur.opens_on : k === "list_until" ? cur.closes_on : "",
            max: k === "opens_on" ? cur.closes_on : "" });
          if (got !== null && d.isConnected) setDate(root, k, got);
          return;
        }
        const s = e.target.closest('[data-pick="status"]');
        if (s) {
          const got = await pickOne({ anchor: s, title: "상태", value: read(root).status,
            options: EV_STATUS.map((x) => ({ value: x, label: STATUS_KO[x], hint: STATUS_HINT[x] })) });
          if (got !== null && s.isConnected) setStatus(root, got);
        }
      });
      first = JSON.stringify(read(root));
    },
    isDirty: (root) => JSON.stringify(read(root)) !== first,
    onSubmit: async (root) => {
      const cur = read(root);
      if (!ev) {
        const r = await call("evEventCreate", { event: { id: cur.id, title: cur.title, short_title: cur.short_title,
          subtitle: cur.subtitle, season: cur.season, opens_on: cur.opens_on, closes_on: cur.closes_on, list_until: cur.list_until,
          sort_order: cur.sort_order } });
        return r.ok ? { ok: true, value: r.event } : r;
      }
      const patch = eventPatch(ev, cur);
      if (!Object.keys(patch).length) return { ok: true, value: null };   // 바뀐 것이 없다 — 부르지 않는다
      const body = { event_id: ev.id, expect: ev.updated_at, patch };
      let r = await call("evEventSave", body);
      if (!r.ok && r.error === "needs-confirm") {
        // 서버는 아직 아무것도 쓰지 않았다 — 「보이게 하기」를 누를 때만 다시 보낸다
        const yes = await dialog({ title: "👁 성도님께 보이게 할까요?", text: CONFIRM_TEXT, ok: "보이게 하기", cancel: "그만두기" });
        // 확인 창이 떠 있는 사이 창이 닫혔다(메뉴 옮김·다시 부팅) — 「보이게 하기」를 눌렀어도 보내지 않는다(FE-4)
        if (!root.isConnected) return { ok: false };
        if (!yes) return { ok: false, message: "저장하지 않았어요 — 아무것도 바뀌지 않았어요" };
        r = await call("evEventSave", { ...body, confirmListed: true });
      }
      if (!r.ok && STALE[r.error]) { staleCode = r.error; return { ok: false, message: STALE[r.error] }; }
      return r.ok ? { ok: true, value: r.event } : r;
    },
  });
  if (!out && staleCode && onStale) onStale(staleCode);
  return out || null;
}
