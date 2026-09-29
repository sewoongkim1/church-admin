// 🗂️ 사역팀 정보 — 팀마다 시간·하는 일·필요 인원·담당·지금 섬기는 분을 적어 성도님 화면에 보여 준다.
// 성경암송 admin-stats.html 의 renderMinistryCatalog·mcLoad·mcRender·mcSave·mcMove 를 옮겨 왔다
// (2026-09-29 · 옛 화면은 얼린 채 둔다). 원문과 지켜야 할 동작 목록: docs/port/ministry-catalog-legacy.md 2절·3절.
// 화면 조각(HTML)은 catalog-ui.js, 여기는 상태·서버 호출·이벤트 배선만.
//
// 원문과 달라진 것 —
//   ① 원문 ministryCatalog(성도 화면과 공유)는 게이트가 없었지만, 여기서는 ministryCatalogAdmin 이
//      처음부터 관리자 전용(canCall→ministry 역할)이다 — pw/staff 를 따로 보내지 않는다(신청 현황과 같다).
//   ② mcLoaded 캐시를 없앴다 — 이 메뉴를 열 때마다(= render 가 불릴 때마다) 새로 불러온다
//      (신청 현황이 이미 같은 방향으로 고친 것과 같다 — "여러 담당자가 서로 옛 화면을 보던 것"을 막는다).
//   ③ ▲▼(차례 바꾸기)는 **부서를 하나 고르고 찾기·「비어 있는 것만」을 끈 상태에서만** 보인다.
//      원문은 "전체" 탭에서 눌러도 버튼이 나와 있었지만 차례 저장이 늘 실패했고(빈 위원회로 보냄),
//      검색/필터로 줄어든 목록 기준으로 ▲▼를 비활성화하면서 실제 이동은 부서 전체 기준이라 화면에
//      안 보이는 팀과도 자리가 바뀔 수 있었다(원문 문서 체크리스트 17·18, "발견 사항"). 조건을 좁혀
//      아예 그 상황을 만들지 않는다.
//   ④ 저장 뒤 폼을 다시 그린다(원문은 그 칸만 DOM 패치) — 다른 화면(신청 현황)과 같은 결로 단순화.
import { esc, toast, dialog, busy, errorText } from "../../core/ui.js";
import { MC_DAYS, MC_FREQS, MC_WHEN_KEYS, mcHasWhen, mcEmpty, mcHit, mcBrs, tabsHtml, cardHtml, mcTimeText } from "./catalog-ui.js";
import { pickTime } from "../../core/picker.js";

const TITLE = `<h2 class="page-title">🗂️ 사역팀 정보</h2>`;

// 서버 error 는 두 결이다 — 알려진 코드(not-found 등, ui.js MESSAGES 에 있다)와
// 이 화면 전용 액션(ministryCatalogSave/Order)이 그 자리에서 지어내는 한국어 문장
// ("순서를 바꿀 팀이 없습니다" 등, MESSAGES 에는 없다). 코드 꼴(영문 소문자+하이픈)이 아니면 그대로 보여준다.
const errMsg = (d) => esc(d?.error && !/^[a-z-]+$/.test(d.error) ? d.error : errorText(d));

// 서버 목록 한 줄 → 화면이 다루는 모양. ⚠️ members 는 membersNote(관리자가 직접 넣은 원본)다 —
// x.members(접수완료 자동 명단이 섞인 합본)를 담으면 저장할 때 자동 명단이 굳어 중복된다(원문 체크리스트 9).
const toRow = (x) => ({
  id: x.id, committee: x.committee, group: x.group || "", team: x.team, appoint: !!x.appoint,
  sched: x.sched || "", desc: x.desc || "", capacity: x.capacity || "",
  members: x.membersNote || "", leader: x.leader || "",
  sun: !!(x.day && x.day.sun), fri: !!(x.day && x.day.fri), sat: !!(x.day && x.day.sat), week: !!(x.day && x.day.week),
  weekly: !!(x.freq && x.freq.weekly), biweekly: !!(x.freq && x.freq.biweekly),
  monthly: !!(x.freq && x.freq.monthly), adhoc: !!(x.freq && x.freq.adhoc),
  from: x.from || "", to: x.to || "",
});

// 필터·펼침 상태는 메뉴를 옮겨 다녀도 남는다(신청 현황·임명현황과 같은 규칙) — 명단(rows)은 남기지 않는다.
let mcPick = "";        // 지금 보고 있는 위원회("" = 전체)
let mcTabsOpen = false; // 부서 고르기 접힘/펼침(접어 두는 것이 기본)
let mcQ = "";           // 찾는 글자
let mcOnlyEmpty = false;
let mcOpen = 0;         // 펼쳐 본 팀(한 번에 하나)
let mcEdit = 0;         // 고치는 중인 팀(한 번에 하나)

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const res = await call("ministryCatalogAdmin");
  if (!res.ok) { el.innerHTML = TITLE + `<p class="empty">목록을 불러오지 못했어요 — ${errMsg(res)}</p>`; return; }
  const rows = (res.list || []).map(toRow);
  let orderDirty = false;   // 차례를 바꿨는데 아직 안 보낸 상태 — 이번에 불러온 명단에 한정

  el.innerHTML = `<h2 class="page-title">🗂️ 사역팀 정보 <span class="muted">${esc(res.year)}년</span></h2>
    <div class="acts mc-acts"><button type="button" class="btn" id="mc-reload">↻ 새로 불러오기</button></div>
    <div class="card mc-panel">
      <div class="mc-head">
        <input type="search" id="mc-q" class="search" placeholder="🔍 팀 · 부서 · 담당자 · 하는 일" autocomplete="off" aria-label="찾기">
        <button type="button" class="mc-pick" id="mc-pick-t" aria-expanded="false" aria-controls="mc-tabs">
          <span class="mc-pick-l">부서</span><b id="mc-pick-n">전체</b><span class="mc-pick-x" aria-hidden="true">▾</span>
        </button>
      </div>
      <div class="mc-head-b">
        <label class="mc-only"><input type="checkbox" id="mc-empty"> 비어 있는 것만</label>
        <span id="mc-found" class="mc-found"></span>
      </div>
      <div id="mc-tabs" class="mc-tabs" hidden></div>
      <div id="mc-sum" class="mc-sum"></div>
      <div id="mc-bar"></div>
      <details class="mc-guide">
        <summary>📌 적는 법 · 주의할 것</summary>
        <p class="mc-help">성도님 화면에서 팀 이름 아래 작게 보이는 설명입니다.
          <b>비어 있으면 이름만 보입니다</b> — 무엇을 하는 사역인지 알 수 없어 고르기 어렵습니다.<br>
          <b>「② 언제」 여덟 칸</b>은 성도님이 <b>필터로 사역을 찾을 때</b> 쓰입니다 —
          비워 두면 「정해진 날 없음 · 때마다 다름」으로 보입니다(목록에서 사라지지는 않습니다).<br>
          팀을 눌러 <b>고치기</b>를 누르면 입력칸이 열리고, ▲▼로 <b>같은 부서 안의 차례</b>를 바꿉니다
          — 부서를 하나 고르고 찾기·「비어 있는 것만」을 끈 상태에서만 나옵니다.
          ⚠️ 팀을 <b>더하거나 지우거나 이름을 바꾸는 것은 부서 확인 엑셀</b>에서 합니다 —
          여기서 만들면 다음에 목록을 다시 심을 때 지워집니다.<br>
          <span class="mc-tags">꾸밈을 넣을 수 있습니다 —
            <code>&lt;b&gt;굵게&lt;/b&gt;</code>
            <code>&lt;span style="color:#c0392b"&gt;색&lt;/span&gt;</code>
            <code>&lt;br&gt;</code>
            <code>&lt;u&gt;</code> <code>&lt;em&gt;</code> <code>&lt;mark&gt;</code>.
            ⚠️ 그 밖의 태그(스크립트·이미지·링크)는 서버가 지웁니다.</span></p>
      </details>
      <div id="mc-list"></div>
    </div>`;
  el.querySelector("#mc-q").value = mcQ;
  el.querySelector("#mc-empty").checked = mcOnlyEmpty;

  const tabsEl = el.querySelector("#mc-tabs");
  const pickBtn = el.querySelector("#mc-pick-t");
  const pickN = el.querySelector("#mc-pick-n");
  const sumEl = el.querySelector("#mc-sum");
  const barEl = el.querySelector("#mc-bar");
  const foundEl = el.querySelector("#mc-found");
  const listEl = el.querySelector("#mc-list");

  // ⚠️ ▲▼는 부서를 하나 고르고, 찾기·「비어 있는 것만」이 꺼져 있을 때만 — 그래야 화면에 보이는
  //    목록이 그 부서 전체와 정확히 같아서(체크리스트 16) 차례 저장이 항상 성공한다(원문 발견 사항 17·18 예방).
  const orderable = () => !!mcPick && !mcQ && !mcOnlyEmpty;
  const hasDirty = () => orderDirty || rows.some((x) => x._d);

  const draw = () => {
    // 부서 고르기 — 채운 팀 수 함께(다시 그릴 때마다 전체 rows 기준으로 새로 센다)
    tabsEl.innerHTML = tabsHtml(rows, mcPick);
    tabsEl.hidden = !mcTabsOpen;
    pickBtn.setAttribute("aria-expanded", String(mcTabsOpen));
    pickN.textContent = mcPick || "전체";

    // 채움 개수
    const apply = rows.filter((r) => !r.appoint);
    const filled = apply.filter((r) => r.sched || r.desc).length;
    const when = apply.filter(mcHasWhen).length;
    sumEl.innerHTML = `설명 <b>${filled}</b> / ${apply.length}팀
      &nbsp;·&nbsp; 언제 <b>${when}</b> / ${apply.length}팀
      <span class="mc-rest">${apply.length - filled}팀은 아직 이름만 보입니다</span>`;

    // 차례 바꾸기 알림 막대
    barEl.innerHTML = orderDirty
      ? `<div class="mc-bar"><span>▲▼로 차례를 바꾸셨습니다. <b>보내야</b> 성도님 화면에 반영됩니다.</span>
         <button type="button" class="btn primary" data-act="ord-save">차례 저장</button>
         <button type="button" class="btn" data-act="ord-undo">되돌리기</button></div>`
      : "";

    // ⚠️ 찾을 때는 위원회를 넘어 전체에서(체크리스트 11) — 지금 고른 부서에만 없어서 0건이면 없는 줄 오인한다
    const inPick = rows.filter((r) => !mcPick || mcQ || r.committee === mcPick);
    const shown = inPick.filter((r) => mcHit(r, mcQ) && (!mcOnlyEmpty || mcEmpty(r)));
    foundEl.innerHTML = `보이는 팀 <b>${shown.length}</b>` +
      (mcQ ? ` <i>(전체에서 찾음)</i>` : shown.length !== inPick.length ? ` <i>(${esc(mcPick || "전체")} ${inPick.length})</i>` : "");

    if (!shown.length) {
      listEl.innerHTML = `<p class="empty">${mcQ ? `'${esc(mcQ)}'에 맞는 사역팀이 없습니다.` : "보여 줄 사역팀이 없습니다."}</p>`;
      return;
    }
    const canOrd = orderable();
    listEl.innerHTML = shown.map((r, i) => cardHtml(r, {
      open: mcOpen === r.id, edit: mcEdit === r.id, canOrder: canOrd, isFirst: i === 0, isLast: i === shown.length - 1,
    })).join("");
  };

  // 화면에 있는 값을 rows 에 담는다. 다시 그리기 전에 반드시 부른다 —
  // 안 부르면 ▲▼ 한 번, 부서 전환 한 번에 치고 있던 글이 사라진다(원문 체크리스트 14).
  const syncInputs = () => {
    el.querySelectorAll("[data-f][data-id]").forEach((input) => {
      const r = rows.find((x) => x.id === Number(input.dataset.id));
      if (!r) return;
      const f = input.dataset.f;
      const v = input.type === "checkbox" ? input.checked : f === "members" ? mcBrs(input.value) : String(input.value || "").trim();
      if (r[f] !== v) { r[f] = v; r._d = true; }
    });
  };

  // 새로 불러오기는 새 <section> 에 — 같은 el 에 다시 그리면 click 처리가 겹쳐 쌓인다
  const reload = () => {
    if (!el.isConnected) return;
    const fresh = document.createElement("section");
    el.replaceWith(fresh);
    render(fresh, { call });
  };

  // 같은 위원회 안에서만 자리를 바꾼다 — 다른 부서로 건너가지 않는다
  const move = (id, dir) => {
    syncInputs();
    const me = rows.find((x) => x.id === id);
    if (!me) return;
    const same = rows.filter((x) => x.committee === me.committee);
    const at = same.indexOf(me), to = at + dir;
    if (to < 0 || to >= same.length) return;
    const a = rows.indexOf(same[at]), b = rows.indexOf(same[to]);
    rows[a] = same[to]; rows[b] = same[at];
    orderDirty = true;
    draw();
  };

  async function saveOrder() {
    // ⚠️ 그 위원회 전부를 보낸다 — orderable() 이 true 인 동안에만 이 단추가 보이므로 rows 를
    //    committee 로만 걸러도 지금 화면에 보이는 목록과 정확히 같다.
    const ids = rows.filter((x) => x.committee === mcPick).map((x) => x.id);
    const d = await busy(el, () => call("ministryCatalogOrder", { ids }));
    if (!d.ok) { dialog({ title: "⚠️ 차례를 저장하지 못했습니다", html: errMsg(d), ok: "확인", cancel: null, danger: true }); return; }
    orderDirty = false;
    draw();
    toast(`차례를 저장했습니다 (${d.n}팀)`);
  }

  async function save(id) {
    const r = rows.find((x) => x.id === id);
    const box = el.querySelector(`[data-row="${id}"]`);
    if (!r || !box) return;
    const get = (f) => box.querySelector(`[data-f="${f}"]`)?.value || "";
    const ck = (f) => !!box.querySelector(`[data-f="${f}"]`)?.checked;
    const next = {
      sched: get("sched").trim(), desc: get("desc").trim(), capacity: get("capacity").trim(),
      members: mcBrs(get("members")), leader: get("leader").trim(), from: get("from").trim(), to: get("to").trim(),
    };
    MC_WHEN_KEYS.forEach((k) => { next[k] = ck(k); });
    const d = await busy(el, () => call("ministryCatalogSave", {
      id,
      schedule_note: next.sched, desc_note: next.desc, capacity_note: next.capacity,
      members_note: next.members, leader_note: next.leader,
      day_sun: next.sun, day_fri: next.fri, day_sat: next.sat, day_week: next.week,
      freq_weekly: next.weekly, freq_biweekly: next.biweekly, freq_monthly: next.monthly, freq_adhoc: next.adhoc,
      time_from: next.from, time_to: next.to,
    }));
    if (!d.ok) { dialog({ title: "⚠️ 저장하지 못했습니다", html: errMsg(d), ok: "확인", cancel: null, danger: true }); return; }
    Object.assign(r, next);
    r._d = false;
    // 걸러진 뒤의 값 · 주일을 끄면 비워진 시각으로 맞춘다(화면이 「내가 친 것」이 아니라 「실제」를 보게)
    if (d.day) {
      r.sun = !!d.day.sun; r.fri = !!d.day.fri; r.sat = !!d.day.sat; r.week = !!d.day.week;
      const f = d.freq || {};
      r.weekly = !!f.weekly; r.biweekly = !!f.biweekly; r.monthly = !!f.monthly; r.adhoc = !!f.adhoc;
      r.from = d.from || ""; r.to = d.to || "";
    }
    if (d.desc !== undefined) { r.desc = d.desc; r.sched = d.sched; r.capacity = d.capacity; }
    if (d.membersNote !== undefined) r.members = d.membersNote;
    if (d.leader !== undefined) r.leader = d.leader;
    draw();
    toast(`${r.team || ""} 저장했습니다`);
    // ⚠️ 넘치면 서버가 말없이 자른다 — 그대로 두면 넣은 글이 조용히 사라진다(체크리스트 7)
    if (d.truncated && d.truncated.length) {
      dialog({ title: "✂️ 글이 길어 잘렸습니다", ok: "확인", cancel: null, danger: true,
        html: `「${esc(d.truncated.join(", "))}」 칸이 길이를 넘어 잘렸습니다.<br>잘린 뒤의 내용은 저장되지 않았어요 — 줄여서 다시 넣어 주세요.` });
    }
  }

  // 주일 시각 — 단추를 누르면 pickTime. 값은 옆 hidden 칸(data-f)에 넣는다 — 저장(save)·syncInputs 가
  // 옛 시각 칸과 똑같이 [data-f].value 로 읽는다. 다시 그리지 않는다(치던 글 유실 방지 — 주일 끄기와 같은 규칙)
  const setTime = (btn, v) => {
    const hid = btn.parentElement.querySelector(`input[data-f="${btn.dataset.time}"]`);
    if (hid) hid.value = v;
    btn.querySelector(".pk-field-v").textContent = mcTimeText(btn.dataset.time, v);
    btn.classList.toggle("empty", !v);
  };

  el.addEventListener("click", async (e) => {
    const tBtn = e.target.closest("[data-time]");
    if (tBtn) {
      const hid = tBtn.parentElement.querySelector(`input[data-f="${tBtn.dataset.time}"]`);
      const v = await pickTime({ anchor: tBtn, title: tBtn.dataset.time === "from" ? "주일 시작 시각" : "주일 끝 시각",
        value: hid ? hid.value : "", step: 5 });
      if (v !== null && tBtn.isConnected && !tBtn.disabled) setTime(tBtn, v);
      return;
    }
    if (e.target.closest("#mc-reload")) {
      syncInputs();
      if (hasDirty() && !(await dialog({ title: "↻ 저장하지 않은 것이 있어요",
        html: "고치던 내용을 버리고 서버에서 다시 불러올까요?", ok: "버리고 불러오기", cancel: "그대로 두기", danger: true }))) return;
      mcOpen = 0; mcEdit = 0;
      return reload();
    }
    if (e.target.closest("#mc-pick-t")) { mcTabsOpen = !mcTabsOpen; draw(); return; }
    const mcBtn = e.target.closest("[data-mc]");
    if (mcBtn) {
      // ⚠️ 옮겨만 놓고 안 보낸 차례가 있는데 말없이 버리면, 관리자는 저장된 줄 안다(체크리스트 15)
      if (orderDirty) {
        if (!(await dialog({ title: "↕️ 저장하지 않은 차례가 있어요",
          html: "▲▼로 바꾼 차례를 아직 저장하지 않았습니다.<br>버리고 다른 부서로 옮길까요?",
          ok: "버리고 옮기기", cancel: "그대로 두기", danger: true }))) return;
        mcPick = mcBtn.dataset.mc; mcOpen = 0; mcEdit = 0;
        return reload();
      }
      syncInputs();
      mcPick = mcBtn.dataset.mc; mcOpen = 0; mcEdit = 0; mcTabsOpen = false;
      draw();
      return;
    }
    const openBtn = e.target.closest("[data-open]");
    if (openBtn) {
      const id = Number(openBtn.dataset.open);
      syncInputs();
      if (mcOpen === id) { mcOpen = 0; mcEdit = 0; } else { mcOpen = id; mcEdit = 0; }
      draw();
      return;
    }
    const editBtn = e.target.closest("[data-edit]");
    if (editBtn) { mcEdit = Number(editBtn.dataset.edit); mcOpen = mcEdit; draw(); return; }
    const doneBtn = e.target.closest("[data-done]");
    if (doneBtn) { syncInputs(); mcEdit = 0; draw(); return; }
    const saveBtn = e.target.closest("[data-save]");
    if (saveBtn) return save(Number(saveBtn.dataset.save));
    const upBtn = e.target.closest("[data-up]");
    if (upBtn) return move(Number(upBtn.dataset.up), -1);
    const dnBtn = e.target.closest("[data-dn]");
    if (dnBtn) return move(Number(dnBtn.dataset.dn), 1);
    const act = e.target.closest("button[data-act]")?.dataset.act;
    if (act === "ord-save") return saveOrder();
    if (act === "ord-undo") { mcOpen = 0; mcEdit = 0; return reload(); }
  });

  el.addEventListener("input", (e) => {
    if (e.target.matches("#mc-q")) { mcQ = e.target.value.trim(); mcOpen = 0; mcEdit = 0; draw(); return; }
    // 미리보기는 관리자가 방금 친 것이라 아직 서버 거르개를 안 거쳤다 — 저장하면 다를 수 있다
    if (e.target.dataset?.f === "desc") {
      const p = el.querySelector(`[data-prev="${e.target.dataset.id}"]`);
      if (p) p.innerHTML = e.target.value || `<span class="mc-none">비어 있음 — 성도님 화면에는 이름만 보입니다</span>`;
    }
  });

  el.addEventListener("change", (e) => {
    if (e.target.matches("#mc-empty")) { mcOnlyEmpty = e.target.checked; mcOpen = 0; mcEdit = 0; draw(); return; }
    // ⚠️ 시각은 주일에만(DB 제약도 같다). 주일을 끄면 그 자리에서 칸을 잠가 비운다 — 다시 그리지 않는다(타이핑 유실 방지)
    if (e.target.matches('[data-f="sun"]')) {
      const card = e.target.closest(".mc-card");
      if (!card) return;
      card.querySelectorAll("[data-time]").forEach((b) => {
        b.disabled = !e.target.checked;
        if (!e.target.checked) setTime(b, "");
      });
      const off = card.querySelector("[data-off]");
      if (off) off.hidden = e.target.checked;
    }
  });

  // 엔터로도 저장 — 여러 줄을 쓰는 「하는 일」·「지금 섬기는 분」은 빼고(줄바꿈이 막힌다)
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const f = e.target.closest("[data-f][data-id]");
    if (!f || f.tagName === "TEXTAREA") return;
    e.preventDefault();
    save(Number(f.dataset.id));
  });

  draw();
}
