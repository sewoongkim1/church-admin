// 📋 신청 현황 — 사역신청 한 건 한 건을 보고 상태를 바꾼다(접수·임명·취소) · 같은 번호 확인 · 삭제.
// 성경암송 admin-stats.html 의 renderMinistryAdmin·mnRender·mnSetStatus·mnDeleteOne 을 옮겨 왔다(2026-09-28 · 옛 화면은 얼린 채 둔다).
// 원문과 지켜야 할 동작 목록: docs/port/ministry-status-legacy.md 2절·3절. 순수 논리는 status-logic.js, HTML 조각·확인 창은 status-ui.js.
// 옛 화면보다 나아진 것 —
//   ① 상태를 바꿀 때 화면이 본 상태(expect)를 함께 보낸다. 다른 담당자가 먼저 바꿨으면 되돌리고 알린 뒤 새로 불러온다.
//   ② 메뉴를 열 때마다 새로 불러온다(옛 mnLoaded 캐시를 없앰 — 여러 담당자가 서로 옛 화면을 보던 것).
//   ③ 임명 알림 결과 넷(이미 보냄 / 보냄 N대 / 안 켜심 / 발송 실패)을 가른다. 발송 실패는 toast 가 아니라 창으로.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { STATES, SHORT, CLS, rangeDates, filterRows, personKey, teamKey, dupMap, dupOthers, teamCounts, statusCounts, clearPhone }
  from "./status-logic.js";
import { cardHtml, groupsHtml, dupBadgeHtml, tableHtml, askCancelReason, confirmAppoint, confirmDelete } from "./status-ui.js";
import { CHURCH_LEGEND, hasChurch } from "../people/church-badge.js";
import { pickDate, fmtDateLabel } from "../../core/picker.js";
import { openChurchPerson } from "../bibleevent/person-popup.js";
import { PERSON_ACTION, rowAsk } from "./person-link.js";

const TITLE = `<h2 class="page-title">📋 신청 현황</h2>`;
const VIEWS = [["row", "건별", "건"], ["person", "사람별", "명"], ["team", "사역별", "팀"]];
const RANGES = [["all", "전체"], ["today", "오늘"], ["7d", "7일"], ["custom", "직접"]];
const TO = { "신청완료": "신청으로", "접수완료": "접수로", "취소": "취소로" };
const PUSH_ERR = { "notify-failed": "알림을 보내는 서버에 닿지 못했어요" };

// 보기·거르기는 메뉴를 옮겨 다녀도 남는다. 명단은 남기지 않는다 — 열 때마다 새로 불러온다.
let view = "row";                      // row 건별 · person 사람별 · team 사역별
const stOn = new Set(["신청완료"]);    // 상태 거르기 — 처음엔 처리할 것(신청완료)만. 비면 전체
let range = "all", from = "", to = ""; // 신청일: all · today · 7d · custom
let q = "";
let condOpen = false;                  // 📅 신청일 칸 — 처음엔 접어 둔다(명단이 길다)
const openSet = new Set();             // 펼쳐 둔 묶음 — 다시 그려도 접히지 않게

const normalize = (x) => ({
  id: x.id, at: String(x.at || "").replace(/\./g, "-"), who: x.who || "", name: x.name || "", church: x.church || null,
  status: x.status, canPush: !!x.canPush, notified_at: x.notified_at || null,
  phone: x.phone || "", position: x.position || "", note: x.note || "", source: x.source || "app",
  committee: x.committee || "", team: x.team || "", option: x.option || "",
});

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const res = await call("ministryList");
  if (!res.ok) { el.innerHTML = TITLE + `<p class="empty">명단을 불러오지 못했어요 — ${esc(errorText(res))}</p>`; return; }
  let rows = (res.list || []).map(normalize);

  const stBtn = (key, cls, label) => `<button type="button" class="${cls}" data-act="st" data-st="${esc(key)}" aria-pressed="false">` +
    `<b data-cnt="${esc(key || "all")}">0</b><span>${esc(label)}</span></button>`;
  // ⚠️ 붙는 머리(.mn-head)에는 「지금 무엇을 보고 있나」만 둔다 — 보기 단추·찾기·신청일 칸은 머리 밖에
  el.innerHTML = `<h2 class="page-title">📋 신청 현황 <span class="muted">${esc(res.year)}년</span></h2>
    <div class="acts mn-acts"><button type="button" class="btn" data-act="reload">↻ 새로 불러오기</button></div>
    ${hasChurch(rows) ? CHURCH_LEGEND : ""}
    <div class="card mn-panel">
      <div class="mn-head">
        <div class="mn-stlb">상태 <i>(전체 기준)</i></div>
        <div class="mn-stbar" role="group" aria-label="상태로 거르기">${stBtn("", "all", "전체")}${STATES.map((x) => stBtn(x, CLS[x], SHORT[x])).join("")}</div>
        <div class="mn-condbar">
          <button type="button" class="mn-cond-toggle" data-act="cond" aria-expanded="${condOpen}" aria-controls="mn-cond">
            <span class="mn-cond-t">📅 신청일</span><span class="mn-cond-sum"></span><span class="mn-cond-arrow pk-field-x" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      <div class="mn-vlb">지금 보이는 것</div>
      <div class="mn-view" role="tablist">${VIEWS.map(([v, t, u]) =>
        `<button type="button" role="tab" data-act="view" data-v="${v}">${t} <em data-vcnt="${v}">0</em>${u}</button>`).join("")}</div>
      <input type="search" class="search mn-q" placeholder="🔍 이름 · 소속 · 사역팀" autocomplete="off" aria-label="찾기">
      <div class="mn-cond" id="mn-cond"${condOpen ? "" : " hidden"}>
        <div class="mn-range"><span class="mn-range-lb">신청일</span>${RANGES.map(([k, t]) =>
          `<button type="button" data-act="range" data-range="${k}">${t}</button>`).join("")}</div>
        <div class="mn-custom" hidden>
          <button type="button" class="pk-field mn-from" data-act="date" data-k="from" aria-haspopup="dialog" aria-expanded="false"
            aria-label="신청일 시작"><span class="pk-field-v"></span><span class="pk-field-x" aria-hidden="true"></span></button>
          <span>~</span>
          <button type="button" class="pk-field mn-to" data-act="date" data-k="to" aria-haspopup="dialog" aria-expanded="false"
            aria-label="신청일 끝"><span class="pk-field-v"></span><span class="pk-field-x" aria-hidden="true"></span></button>
        </div>
      </div>
      <div class="mn-list"></div>
      <div class="mn-teams"></div>
    </div>`;
  el.querySelector(".mn-q").value = q;
  const list = el.querySelector(".mn-list");
  const find = (id) => rows.find((x) => String(x.id) === String(id));
  // PC(≥1024px) 건별만 표로 — 창 폭을 바꾸면 다시 그린다(detach 는 아래 document 리스너와 함께 묶는다)
  const mqWide = matchMedia("(min-width:1024px)");

  const draw = () => {
    const now = new Date();
    const shown = filterRows(rows, { stOn: [...stOn], range, from, to, q }, now);
    // 상태 막대 — 숫자는 추리기 **전** 전체 기준(어디에 몇 건인지 늘 보이게)
    const sc = statusCounts(rows);
    el.querySelectorAll("[data-cnt]").forEach((b) => { b.textContent = b.dataset.cnt === "all" ? rows.length : (sc[b.dataset.cnt] ?? 0); });
    el.querySelectorAll('[data-act="st"]').forEach((b) => {
      const on = b.dataset.st ? stOn.has(b.dataset.st) : stOn.size === 0;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    // 신청일 — 접혀 있어도 무엇이 걸렸는지 보인다(안 보이는 조건이 명단을 줄이면 헷갈린다)
    const [f, t] = rangeDates(range, from, to, now);
    const sum = range === "today" ? "오늘" : range === "7d" ? "최근 7일"
      : range === "custom" && (f || t) ? `${f.slice(5).replace("-", ".")}~${t.slice(5).replace("-", ".")}` : "";
    const cs = el.querySelector(".mn-cond-sum");
    cs.textContent = sum || "전체";
    cs.classList.toggle("on", !!sum);
    el.querySelectorAll('[data-act="range"]').forEach((b) => b.classList.toggle("on", b.dataset.range === range));
    el.querySelector(".mn-custom").hidden = range !== "custom";
    // 직접 고른 날 — 시스템 날짜 칸 대신 단추(picker.js). 값은 from·to 변수 하나뿐
    // 이름에 고른 날도 함께 — 화면 읽기 프로그램이 「신청일 시작, 9월 1일 (화)」로 읽게
    for (const [k, v, none, nm] of [["from", from, "시작일 고르기", "신청일 시작"], ["to", to, "끝날 고르기", "신청일 끝"]]) {
      const b = el.querySelector(".mn-" + k);
      const txt = v ? fmtDateLabel(v) : none;
      b.querySelector(".pk-field-v").textContent = txt;
      b.setAttribute("aria-label", `${nm}, ${txt}`);
      b.classList.toggle("empty", !v);
    }
    // 보기 — 단추 안 숫자는 지금 걸러진 것 기준(건·명·팀)
    const vc = { row: shown.length, person: new Set(shown.map(personKey)).size, team: new Set(shown.map(teamKey)).size };
    el.querySelectorAll("[data-vcnt]").forEach((e) => { e.textContent = vc[e.dataset.vcnt]; });
    el.querySelectorAll('[data-act="view"]').forEach((b) => {
      b.classList.toggle("on", b.dataset.v === view);
      b.setAttribute("aria-selected", String(b.dataset.v === view));
    });
    // ⚠️ 같은 번호는 명단 **전체**로 — 거르기로 한쪽이 가려져도 표시는 남는다
    const dupM = dupMap(rows);
    // 건별 + PC(≥1024px)면 표로 — 사람별·사역별은 그대로 묶음
    const wide = view === "row" && mqWide.matches;
    list.innerHTML = !shown.length ? `<p class="empty">조건에 맞는 신청이 없어요</p>`
      : view === "row" ? (wide ? tableHtml(shown, dupM) : shown.map((r) => cardHtml(r, "", dupBadgeHtml(dupOthers(dupM, r)))).join(""))
      : groupsHtml(shown, view, openSet, dupM);
    // 팀별 신청 수 — **지금 걸러진 목록**으로 센다. 어느 보기에서나 아래에 있다
    const tc = teamCounts(shown);
    el.querySelector(".mn-teams").innerHTML = tc.length
      ? `<div class="mn-teams-t">팀별 신청 수 <i>${shown.length}건</i></div>` +
        tc.map(([k, n]) => `<span class="mn-tcount">${esc(k)} <b>${n}</b>건</span>`).join("")
      : "";
  };

  // 새로 불러오기는 새 <section> 에 — 같은 el 에 다시 그리면 click 처리가 겹쳐 쌓인다
  const reload = () => {
    if (!el.isConnected) return;
    const fresh = document.createElement("section");
    el.replaceWith(fresh);
    render(fresh, { call });
  };
  // 다른 담당자가 먼저 바꿨거나(status) 지웠다(null) — 알리고 새로 불러온다
  const stale = async (status) => {
    await dialog(status
      ? { title: "다른 분이 먼저 바꿨어요", text: "지금 상태: " + (SHORT[status] || status) + " — 새로 불러올게요", cancel: null }
      : { title: "이미 지워진 신청이에요", text: "다른 분이 지웠어요 — 새로 불러올게요", cancel: null });
    reload();
  };

  async function setStatus(id, status) {
    const r = find(id);
    if (!r) return;
    // 임명은 성도님께 알림이 나가는 자리라 한 번 묻는다(이미 알림이 나간 분이면 묻지 않는다)
    if (status === "임명확정" && !(await confirmAppoint(r))) return;
    // 취소는 사유 없이 보내지 않는다(창이 막고, 서버도 막는다)
    let note;
    if (status === "취소") { note = await askCancelReason(r); if (note === null) return; }
    if (!el.isConnected) return;
    const before = r.status;
    r.status = status; draw();   // 먼저 반영하고, 실패하면 되돌린다
    const d = await busy(el, () => call("ministrySetStatus",
      { id: r.id, status, expect: before, ...(note !== undefined ? { note } : {}) }));
    if (!d.ok) {
      r.status = before; draw();
      if (d.error === "conflict" || d.error === "not-found") return stale(d.status);
      dialog({ title: "⚠️ 상태를 바꾸지 못했어요", text: errorText(d), cancel: null });
      return;
    }
    if (d.status) r.status = d.status;
    // 결정이 나면 서버가 번호를 지운다 — 카드도 그 자리에서 지워야 사실과 맞다. 교적 표시는 서버가 번호 없이 다시 센 값(d.church)으로(clearPhone)
    if (d.phoneCleared) clearPhone(r, d.church);
    if (note !== undefined) r.note = note;
    if (status === "임명확정") {
      // 넷을 가른다. ⚠️ 「이미 보냄」을 「안 켜심」으로 적으면, 알림이 간 분께 담당자가 또 연락한다
      if (d.already) toast(`✅ ${r.name}님은 이미 알림이 나간 분이에요 (한 해 한 번)`);
      else if (d.pushed > 0) { r.notified_at = new Date().toISOString(); toast(`🔔 ${r.name}님께 알림을 보냈어요 (${d.pushed}대)`); }
      else if (!d.pushError || d.pushError === "not-subscribed") toast(`🔕 ${r.name}님은 알림을 안 켜신 분이에요 — 게시·연락으로 알려 주세요`);
      else dialog({ title: "⚠️ 알림이 가지 않았어요", cancel: null,
        text: `${r.name}님 임명은 저장됐지만 알림이 가지 않았어요 — 게시·연락으로 알려 주세요.\n(${PUSH_ERR[d.pushError] || d.pushError})` });
    } else {
      // 처음엔 「신청」만 보이므로 바꾼 카드가 목록에서 빠진다 — 어디로 갔는지 한 줄 남긴다
      toast(`${r.name}님 «${r.team}» — ${TO[r.status] || r.status} 바꿨어요`);
    }
    draw();
  }

  async function remove(id) {
    const r = find(id);
    if (!r || !(await confirmDelete(r))) return;
    if (!el.isConnected) return;
    const d = await busy(el, () => call("ministryDelete", { id: r.id }));
    if (!d.ok) {
      if (d.error === "not-found") return stale(null);
      dialog({ title: "⚠️ 지우지 못했어요", text: errorText(d), cancel: null });
      return;
    }
    rows = rows.filter((x) => x !== r);   // 화면에서도 그 자리에서 뺀다
    draw();
    toast(`🗑 ${r.name}님의 ${r.team} 신청을 지웠어요`);
  }

  // 신청일 직접 — 고르면(지우기 = "") 옛 날짜 칸의 change 와 같게 값을 바꾸고 다시 그린다. 닫기(null)면 그대로
  async function pickDay(b) {
    const k = b.dataset.k;
    // 기간이라 반대쪽 끝을 넘지 못하게 — 시작일 창은 끝날까지, 끝날 창은 시작일부터
    const v = await pickDate({ anchor: b, title: k === "from" ? "신청일 시작" : "신청일 끝", value: k === "from" ? from : to,
      min: k === "to" ? from : "", max: k === "from" ? to : "" });
    if (v === null || !el.isConnected) return;
    if (k === "from") from = v; else to = v;
    draw();
  }

  // 상태 메뉴 — 한 번에 하나만 연다. 아래 여유가 모자라면 위로(표준 v1: 210px — 삭제가 더해져 메뉴가 그보다 길면 그 높이로)
  const closeMenus = () => el.querySelectorAll(".pl-drop.open").forEach((w) => {
    w.classList.remove("open", "up");
    w.querySelector('[data-act="drop"]')?.setAttribute("aria-expanded", "false");
  });
  const toggleMenu = (b) => {
    const wrap = b.parentElement, was = wrap.classList.contains("open");
    closeMenus();
    if (was) return;
    wrap.classList.add("open");
    b.setAttribute("aria-expanded", "true");
    const need = Math.max(210, wrap.querySelector(".pl-menu").offsetHeight + 12);
    wrap.classList.toggle("up", b.getBoundingClientRect().bottom + need > innerHeight);
  };

  el.addEventListener("click", (e) => {
    // 묶음 머리 안의 전화번호 — 전화는 걸고, 묶음은 그대로(열고 닫기만 되돌린다)
    const tel = e.target.closest("summary a.mn-tel");
    if (tel) {
      const g = tel.closest("details"), was = g.open;
      setTimeout(() => { if (g.open !== was) g.open = was; }, 0);
      return;
    }
    // 이름 → 교적 창(2026-09-30) — 단추엔 신청 id 만 있다. 보낼 것(이름·소속·번호)은 메모리의 줄에서 꺼낸다(번호를 DOM 에 싣지 않는다).
    // 사람별 묶음 머리(<summary>) 안에서 눌러도 묶음이 여닫히지 않게 기본 동작을 막는다(열린 상태 메뉴는 아래 onDoc 이 닫는다).
    const nb = e.target.closest("[data-person]");
    if (nb) {
      e.preventDefault();
      const r = find(nb.dataset.person);
      if (r) openChurchPerson({ call, action: PERSON_ACTION, ...rowAsk(r), anchor: nb });
      return;
    }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "drop") return toggleMenu(b);
    closeMenus();
    if (act === "reload") return reload();
    if (act === "set") return setStatus(b.dataset.id, b.dataset.st);
    if (act === "del") return remove(b.dataset.id);
    if (act === "cond") {
      condOpen = !condOpen;
      el.querySelector(".mn-cond").hidden = !condOpen;
      b.setAttribute("aria-expanded", String(condOpen));
      return;
    }
    if (act === "date") return pickDay(b);
    if (act === "all") { el.querySelectorAll("details.mn-grp").forEach((g) => { g.open = b.dataset.v === "open"; }); return; }
    if (act === "st") {
      // 「전체」면 모두 · 하나를 누르면 더하거나 뺀다 · 다 고르면 곧 전체
      const st = b.dataset.st;
      if (!st) stOn.clear(); else if (stOn.has(st)) stOn.delete(st); else stOn.add(st);
      if (stOn.size === STATES.length) stOn.clear();
    } else if (act === "view") view = b.dataset.v;
    else if (act === "range") range = b.dataset.range;
    else return;
    draw();
  });
  el.addEventListener("input", (e) => { if (e.target.matches(".mn-q")) { q = e.target.value; draw(); } });
  // <details> 의 toggle 은 거품이 일지 않는다 — 잡는 단계(capture)에서 받는다
  el.addEventListener("toggle", (e) => {
    const g = e.target;
    if (!(g instanceof Element) || !g.matches("details.mn-grp")) return;
    if (g.open) openSet.add(g.dataset.gk); else openSet.delete(g.dataset.gk);
  }, true);
  // 메뉴 바깥(머리줄·여백 포함)을 누르거나 Esc — 닫는다(원문 plCloseMenus). 이 화면이 사라지면 스스로 떨어진다.
  // mqWide 의 change(창 폭을 바꿔 1024px 을 넘나들 때)도 같은 자리에서 붙이고 뗀다.
  const detach = () => {
    document.removeEventListener("click", onDoc);
    document.removeEventListener("keydown", onKey);
    mqWide.removeEventListener("change", onMqChange);
  };
  const onDoc = (e) => {
    if (!el.isConnected) return detach();
    if (!(e.target instanceof Element) || !e.target.closest(".pl-drop")) closeMenus();
  };
  const onKey = (e) => {
    if (!el.isConnected) return detach();
    if (e.key === "Escape") closeMenus();
  };
  const onMqChange = () => {
    if (!el.isConnected) return detach();
    draw();
  };
  document.addEventListener("click", onDoc);
  document.addEventListener("keydown", onKey);
  mqWide.addEventListener("change", onMqChange);
  draw();
}
