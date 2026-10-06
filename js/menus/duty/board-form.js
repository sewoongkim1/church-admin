// 당번 만들기·고치기 창 — 🧰 당번 관리(당번 총괄 · 담당자 지정 포함)와 📅 당번 명단의 〔당번 설정〕(총괄·담당)이 함께 쓴다.
//   서버: dutyBoardSave(·dutyStaffSet). 규칙·말은 duty-logic.js(시험).
//   당번 담당(맡은 당번)은 이름과 「준비 중·보관」을 못 바꾼다 — 그 칸을 글로만 보여 준다(막는 것은 서버 chief-only).
// ⚠️ 「받는 중」으로 **바꾸는** 저장에만 확인을 한 번 더(앱에 바로 보인다). 앱에서 안 보이게 되는 저장(준비·보관)은 앞날에 선 분이 있으면
//    서버가 has-upcoming 으로 멈춘다 → 수를 보여 주고 확인받아 force 로 다시 보낸다.
// ⚠️ 고르기·날짜는 picker.js 고르개만 — 시스템 select·date 칸 금지. 서버 글자는 모두 esc.
import { esc, dialog, errorText } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { pickOne, pickMany, pickDate } from "../../core/picker.js";
import { staffOptions, staffFieldText, sameIds } from "../education/courses-logic.js";
import { STATUS_OPTIONS, LEAD_STATUS_OPTIONS, STATUS_LABEL, leadCanSetStatus, openDaysOptions, openDaysText, formToBoard, boardToForm, hideAsk, OPEN_WARN,
  dutyWord, dayLabel, staffFailText, STAFF_NO_CAND, STAFF_ROLE_HINTS } from "./duty-logic.js";

const labelOf = (opts, v) => (opts.find((o) => o.value === v) || {}).label || v || "";
const hid = (k, v) => `<input type="hidden" data-f="${k}" value="${esc(v)}">`;
const txt = (k, label, v, attrs = "", hint = "") => `<label class="field"><span>${esc(label)}${hint ? ` <small>(${esc(hint)})</small>` : ""}</span>` +
  `<input data-f="${k}" value="${esc(v)}" autocomplete="off" ${attrs}></label>`;
const pickBtn = (attr, label, text, empty, hint = "") => `<div class="field"><span>${esc(label)}${hint ? ` <small>(${esc(hint)})</small>` : ""}</span>
  <button type="button" class="pk-field${empty ? " empty" : ""}" ${attr} aria-haspopup="dialog" aria-expanded="false"
    aria-label="${esc(label)}, ${esc(text)}"><span class="pk-field-v">${esc(text)}</span><span class="pk-field-x" aria-hidden="true"></span></button></div>`;
const fixed = (label, text, hint) => `<div class="field"><span>${esc(label)}</span><p class="dty-fixed"><b>${esc(text)}</b>${hint ? ` <small class="muted">${esc(hint)}</small>` : ""}</p></div>`;
const untilText = (v) => (v ? `${v.slice(0, 4)}년 ${dayLabel(v)}` : "정하지 않음(계속)");

// v = boardToForm 결과 · chief = 당번 총괄인가 · staff = {ids, opts, cands}(총괄이 담당자를 고를 때만 — null 이면 칸 없음)
export function boardFormHtml(v, { isNew = false, chief = false, staff = null } = {}) {
  const statusOpts = chief ? STATUS_OPTIONS : LEAD_STATUS_OPTIONS;
  const canStatus = chief || leadCanSetStatus(v.status);
  const staffText = staff ? (staff.cands === null ? "담당자 후보를 불러오지 못했어요" : staffFieldText(staff.ids, staff.opts, "담당자 없음")) : "";
  return (isNew ? `<p class="be-note">새 당번은 「준비 중」으로 만들어져 성도님께 안 보여요 — 📅 당번 명단에서 자리 틀을 넣고 상태를 「받는 중」으로 바꾸면 보여요</p>` : "") +
    (chief ? txt("title", "당번 이름", v.title, `maxlength="40" placeholder="예: 식당 봉사"`)
      : hid("title", v.title) + fixed("당번 이름", v.title, "이름은 당번 총괄이 바꿔요")) +
    `<label class="field"><span>설명 <small>(앱 당번 화면 맨 위에 보여요)</small></span><textarea data-f="description" maxlength="1000" rows="4" placeholder="예: 예배 뒤 식당에서 함께 설거지해요. 앞치마는 식당에 있어요.">${esc(v.description)}</textarea></label>` +
    txt("place", "장소", v.place, `maxlength="40" placeholder="예: 지하 1층 식당"`) +
    txt("contact", "문의", v.contact, `maxlength="60" placeholder="예: 홍길동 집사 010-1234-5678"`, "앱에 그대로 보여요 — 알려도 되는 번호만") +
    hid("openDays", v.openDays) + pickBtn(`data-pick="openDays"`, "얼마나 앞까지 보여 줄까요", `앞으로 ${openDaysText(v.openDays)}`, false, "그만큼 자리가 저절로 생겨요") +
    hid("untilDate", v.untilDate) + pickBtn(`data-date="untilDate"`, "끝 날짜", untilText(v.untilDate), !v.untilDate, "이 날 뒤로는 앱에 안 보여요 · 비우면 계속") +
    txt("maxAhead", "한 분이 미리 잡아 둘 수 있는 자리 수", v.maxAhead, `inputmode="numeric" maxlength="3" placeholder="비우면 제한 없음"`, "비우면 제한 없음") +
    hid("status", v.status) + (canStatus
      ? pickBtn(`data-pick="status"`, "상태", labelOf(statusOpts, v.status) || STATUS_LABEL[v.status] || "고르기", false)
      : fixed("상태", STATUS_LABEL[v.status] || v.status, "준비 중·보관은 당번 총괄이 바꿔요")) +
    (staff ? hid("staff", JSON.stringify(staff.ids)) + `<div class="field"><span>담당자 <small>(📅 당번 명단에서 이 당번만 다뤄요)</small></span>
      <button type="button" class="pk-field${staff.ids.length ? "" : " empty"}" data-staff aria-haspopup="dialog" aria-expanded="false"
        aria-label="담당자, ${esc(staffText)}"${staff.cands === null ? " disabled" : ""}><span class="pk-field-v">${esc(staffText)}</span><span class="pk-field-x" aria-hidden="true"></span></button>
      ${staff.cands && !staff.cands.length ? `<p class="muted ec-hint">${esc(STAFF_NO_CAND)}</p>` : ""}</div>` : "") +
    hid("id", v.id || "");
}
const readForm = (root) => {
  const o = Object.fromEntries([...root.querySelectorAll("[data-f]")].map((i) => [i.dataset.f, i.value.trim()]));
  if ("staff" in o) { try { o.staff = JSON.parse(o.staff || "[]"); } catch { o.staff = []; } }
  return o;
};

// → { id, after, staffErr }(저장 · after = 끝 날짜 뒤에 선 분 수 · staffErr = 당번은 저장됐는데 담당자 저장이 실패한 말) · 닫았으면 null ·
//   그사이 없어졌거나 맡은 당번에서 빠졌으면 "gone".
//   board = 서버 boardOut 꼴(없으면 새 당번) · cands = 담당자 후보(dutyStaffCandidates · 못 불러왔으면 null · undefined 면 담당자 칸 없음)
export function openBoardForm({ call, board = null, chief = false, cands }) {
  const v = boardToForm(board);
  const withStaff = chief && cands !== undefined;
  const staff0 = withStaff ? ((board && board.staff) || []).map((x) => x.id) : [];
  const staffOpts = withStaff ? staffOptions(cands || [], (board && board.staff) || [], STAFF_ROLE_HINTS) : [];
  const statusOpts = chief ? STATUS_OPTIONS : LEAD_STATUS_OPTIONS;
  let first = "", gone = false;
  const setBtn = (b, label, text, empty) => {
    b.querySelector(".pk-field-v").textContent = text;
    b.setAttribute("aria-label", `${label}, ${text}`);
    b.classList.toggle("empty", !!empty);
  };
  return openForm({
    title: board ? "⚙️ 당번 설정" : "＋ 새 당번", okLabel: board ? "저장" : "만들기",
    html: boardFormHtml(v, { isNew: !board, chief, staff: withStaff ? { ids: staff0, opts: staffOpts, cands } : null }),
    onOpen: (root) => {
      root.addEventListener("click", async (e) => {
        const sb = e.target.closest("[data-staff]");
        if (sb) {
          const got = await pickMany({ anchor: sb, title: "담당자", options: staffOpts, values: readForm(root).staff });
          if (got !== null && sb.isConnected) {
            root.querySelector('[data-f="staff"]').value = JSON.stringify(got);
            setBtn(sb, "담당자", staffFieldText(got, staffOpts, "담당자 없음"), !got.length);
          }
          return;
        }
        const p = e.target.closest("[data-pick]");
        if (p) {
          const k = p.dataset.pick, cur = readForm(root);
          if (k === "openDays") {
            const got = await pickOne({ anchor: p, title: "얼마나 앞까지 보여 줄까요", options: openDaysOptions(cur.openDays), value: cur.openDays });
            if (got !== null && p.isConnected) { root.querySelector('[data-f="openDays"]').value = got; setBtn(p, "얼마나 앞까지 보여 줄까요", `앞으로 ${openDaysText(got)}`, false); }
          } else if (k === "status") {
            const got = await pickOne({ anchor: p, title: "상태", options: statusOpts, value: cur.status });
            if (got !== null && p.isConnected) { root.querySelector('[data-f="status"]').value = got; setBtn(p, "상태", labelOf(statusOpts, got), false); }
          }
          return;
        }
        const d = e.target.closest("[data-date]");
        if (d) {
          const got = await pickDate({ anchor: d, title: "끝 날짜", value: readForm(root).untilDate });
          if (got !== null && d.isConnected) { root.querySelector('[data-f="untilDate"]').value = got; setBtn(d, "끝 날짜", untilText(got), !got); }
        }
      });
      first = JSON.stringify(readForm(root));
    },
    isDirty: (root) => JSON.stringify(readForm(root)) !== first,
    onSubmit: async (root) => {
      const vals = readForm(root);
      const f = formToBoard(vals);
      if (f.error) return { ok: false, message: f.error };
      if (board && !f.board.id) return { ok: false, message: "당번 번호를 읽지 못했어요 — 닫고 다시 열어 주세요" };   // 고치기가 새 당번을 만들지 않게
      // 받는 중으로 **바꿀 때만** 확인(이미 받는 중인 당번의 다른 칸을 고칠 때는 묻지 않는다)
      if (f.board.status === "open" && (!board || board.status !== "open")) {
        const yes = await dialog({ title: "👁 지원을 받을까요?", text: OPEN_WARN, ok: "저장", cancel: "그만두기" });
        if (!root.isConnected) return { ok: false };
        if (!yes) return { ok: false, message: "저장하지 않았어요 — 아무것도 바뀌지 않았어요" };
      }
      let r = await call("dutyBoardSave", { board: f.board });
      if (!r.ok && r.error === "has-upcoming") {
        const yes = await dialog({ title: "앱에서 안 보이게 돼요", text: hideAsk(r.active, f.board.status), ok: "바꾸기", cancel: "그만두기", danger: true });
        if (!root.isConnected) return { ok: false };
        if (!yes) return { ok: false, message: "저장하지 않았어요 — 아무것도 바뀌지 않았어요" };
        r = await call("dutyBoardSave", { board: f.board, force: true });
      }
      if (r.ok) {
        // 담당자 — 바뀐 때만(새 당번은 방금 받은 id 로). 실패해도 당번은 이미 저장됐으니 창을 닫고 알린다(다시 누르면 새 당번이 또 생긴다)
        let staffErr = "";
        if (withStaff && cands !== null && !sameIds(vals.staff, staff0)) {
          const s = await call("dutyStaffSet", { board_id: r.id, member_ids: vals.staff });
          if (!s.ok) staffErr = staffFailText(dutyWord(s.error) || errorText(s));
        }
        return { ok: true, value: { id: r.id, after: Number(r.after) || 0, staffErr } };
      }
      if (r.error === "not-found" || r.error === "not-assigned") { gone = true; return { ok: true, value: null }; }   // 창을 닫고 목록을 새로 불러온다
      const m = dutyWord(r.error);
      return m ? { ok: false, message: m } : r;
    },
  }).then((x) => (gone ? "gone" : x));
}
