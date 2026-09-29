// 📤 명단 올리기 — 성경필사(암송) 회차에 엑셀·붙여넣기로 여러 분을 한꺼번에 더한다(2026-09-29).
// 설계: 성경암송 저장소 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md 3절 「📤 명단 올리기」·1절 「같은 분 판정」.
// 틀은 사역신청 「종이 명단 올리기」(ministry/paper.js)와 같다 — 살펴보기 → 넣기. 순수 논리는 upload-logic.js.
// 서버 evUploadCheck(살펴보기)·evUploadSave(넣기)가 둘 다 **처음부터 다시** 다듬고 판정한다 — 이 화면은 칸을 나눠 보내고
// 받은 판정을 보여 줄 뿐이다. 넣은 줄은 source='import', 메모 「명단 올리기」(서버가 붙인다).
// ⚠️ 자격 회차(needs.eligibility 가 있는 회차 — 가을 말씀 동행)는 고르개에 나오지 않는다(서버도 eligibility-event 로 막는다).
// ⚠️ 「빈칸은 교인명부로 채우기」를 켜고 살펴보면 교인명부 값(소속·직분)이 화면에 나온다 — 서버가 people.fill 기록(채운 분 이름)을 남긴다.
// ⚠️ 시스템 창을 띄우지 않는다 — 확인·알림은 ui.js dialog, 고르기는 picker.js pickOne. 엑셀 **파일 고르기**만 운영체제 창이라
//    붙여넣기 칸과 끌어다 놓기를 함께 둔다.
// ⚠️ 회차를 고르면 주소를 #/be-upload?ev=<id> 로 바꾼다 — replaceState 라 hashchange 가 안 나고(route 가 다시 안 그린다),
//    붙여넣은 글이 그대로 남는다.
import { esc, dialog, busy, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";
import {
  ORDERS, COL_LABEL, MAX_ROWS, PUBLIC_MAX, MARKS, MARK_ORDER, orderOf, parseSheet, sampleLine, sheetText, decodeText,
  sigOf, markCounts, countOf, displayRow, eventOptions, pickFrom, evHint, overLimit, confirmHtml,
} from "./upload-logic.js";

const TITLE = `<h2 class="page-title">📤 명단 올리기</h2>`;
const XLSX_CDN = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";   // ministry/paper.js 와 같은 판
const evHref = (id) => "#/be-upload?ev=" + encodeURIComponent(id);

// 메뉴를 옮겨 다녀도 남는 것 — 고른 회차·칸 차례·채우기. 붙여넣은 글과 판정은 남기지 않는다(다시 살펴보게).
let lastEv = "";
let order = ORDERS[0].id;
let fill = false;

// 서버 error 는 코드(ui.js MESSAGES)거나 한국어 문장이다 — 코드 꼴이 아니면 그 문장 그대로(ministry/paper.js errMsg 와 같다)
const errMsg = (d) => (d?.error && !/^[a-z-]+$/.test(d.error) ? d.error : errorText(d));

// .xlsx 는 압축 파일이라 브라우저가 혼자 못 읽는다 — 고를 때만 CDN 에서 내려받는다(ministry/paper.js loadXlsx 를 베꼈다)
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = XLSX_CDN;
    s.onload = () => (window.XLSX ? res(window.XLSX) : rej(new Error("no-xlsx")));
    s.onerror = () => rej(new Error("no-cdn"));
    document.head.appendChild(s);
  });
}

const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");

export async function render(el, { call, query }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("evEvents");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">회차를 불러오지 못했어요 — ${esc(errorText(r))}</p>`; return; }
  const all = r.events || [];
  const opts = eventOptions(all);
  if (!opts.length) {
    el.innerHTML = TITLE + `<p class="empty">명단을 올릴 수 있는 회차가 없어요 — <a href="#/be-roster">📋 회차·명단</a>에서 새 회차를 먼저 만들어 주세요</p>`;
    return;
  }
  // 주소(?ev=)의 회차 → 없으면 지난번에 고른 회차. 주소의 회차가 자격 회차면 고르지 않고 알린다(지난번 회차로 넘어가지 않는다).
  let first = pickFrom(all, query?.ev || "");
  if (!first.ev && !first.blocked) first = pickFrom(all, lastEv);
  let ev = first.ev;
  let blocked = first.blocked;   // 주소의 회차가 자격 회차였다 — 다른 회차를 고를 때까지 알린다
  if (ev) {
    lastEv = ev.id;
    // 지난번 회차로 열었으면 주소도 그 회차로 — 새로고침해도 같은 회차(기다리는 사이 다른 메뉴로 갔으면 건드리지 않는다)
    if (query?.ev !== ev.id && el.isConnected) history.replaceState(null, "", evHref(ev.id));
  }

  el.innerHTML = TITLE + `
    <button type="button" class="be-up-ev" data-act="ev"></button>
    <div class="be-up-note" id="be-up-evnote" hidden></div>
    <div class="adm-acts">
      <button type="button" class="btn" data-act="check">살펴보기</button>
      <button type="button" class="btn primary" data-act="save" hidden>명단 넣기</button>
    </div>
    <div class="card">
      <div class="be-up-how">
        <div class="be-up-row"><b>칸 차례</b><button type="button" class="be-up-pill" data-act="order"></button></div>
        <div class="be-up-cols" id="be-up-cols"></div>
        <div class="be-up-row">
          <button type="button" class="be-up-pill" data-act="pick">📂 엑셀 파일 고르기</button>
          <input type="file" id="be-up-file" accept=".xlsx,.xls,.csv,.tsv,.txt" hidden>
          <span class="be-up-fname" id="be-up-fname"></span>
        </div>
      </div>
      <details class="be-up-guide">
        <summary>📌 적는 법 · 주의할 것</summary>
        <ul class="be-up-ul">
          <li>한 줄에 한 분 — 칸은 위 <b>칸 차례</b>대로 적습니다(엑셀에서 복사하면 탭, CSV 는 쉼표). 맨 위 「성명」·「이름」 제목 줄은 건너뜁니다.</li>
          <li>교구 칸에 <b>「교회학교」</b>를 적으면 목장 칸에 부서(유년부·중등부…)를, <b>「청년부」</b>(또는 「청년」)를 적으면 교회학교 청년부로 넣습니다.</li>
          <li>「화평교구」→화평 · 「20목장」→20 · 「07」→7 · 「남성목장」→남성 · 「유년」→유년부 · 직분 「집사님」→집사처럼 <b>알아서 다듬고</b> 줄마다 알려 드려요.</li>
          <li>이름 끝 숫자(「홍길동2」 — 시트의 동명이인 표시)는 떼고 알려 드려요.</li>
          <li>이 회차에 <b>이미 있는 분</b>(앱에서 낸 신청 포함)은 넣지 않아요 — 같은 명단을 두 번 올려도 안전합니다.
              교구 줄은 한쪽 목장이 비었거나 99 면 같은 교구·같은 이름을 같은 분으로 봐요.</li>
          <li>앱 계정이 있는 분은 <b>이어 드려요</b>(계정을 새로 만들지는 않아요). 이어진 분은 성도님 앱 「📋 이미 내신 것」에 보이고,
              등록 기간 중인 회차면 성도님이 앱에서 고치거나 취소할 수 있어요.</li>
          <li><b>빈칸은 교인명부로 채우기</b> — 교인명부에 그 이름이 한 분뿐일 때만, 비어 있는 칸만 채워요(적힌 교구·목장·직분은 덮지 않아요.
              교구 칸이 비어 교구를 채울 때만 목장도 교인명부 것으로 바꾸고 알려 드려요). 적힌 소속이 교인명부와 다르면 다른 분으로 보고 채우지 않아요.
              소속이 비었는데 같은 이름이 여러 분이면 <b>👥 동명이인</b>으로 넣지 않고, 소속이 적힌 줄은 직분만 빈 채로 넣어요.</li>
          <li>넣은 줄의 담당자 메모에 「명단 올리기」가 남아요. 한 번에 <b>${MAX_ROWS}줄</b>까지.</li>
        </ul>
      </details>
      <div class="be-up-drop">
        <textarea id="be-up-text" class="be-up-text" rows="8" spellcheck="false" aria-label="명단 붙여넣기"></textarea>
        <p class="be-up-droptip">엑셀에서 칸을 복사해 붙여넣거나, 엑셀·CSV 파일을 이 칸으로 끌어다 놓아도 돼요.</p>
      </div>
      <label class="be-up-fill"><input type="checkbox" id="be-up-fill">
        <span><b>빈칸은 교인명부로 채우기</b>
          <small>교인명부에 그 이름이 한 분뿐일 때만 비어 있는 교구·목장·직분을 채워요 — 적힌 칸은 덮지 않고, 적힌 소속이 교인명부와 다르면 채우지 않아요.
            살펴보기만 해도 채운 분 이름이 열람 기록에 남아요.</small></span></label>
      <div id="be-up-sum" class="be-up-sum"></div>
      <div id="be-up-marks" class="tabs be-up-marks" role="group" aria-label="판정으로 거르기" hidden></div>
      <div id="be-up-list"></div>
    </div>`;

  const $ = (s) => el.querySelector(s);
  const ta = $("#be-up-text"), fileInput = $("#be-up-file"), fname = $("#be-up-fname"), fillBox = $("#be-up-fill");
  const sumEl = $("#be-up-sum"), marksEl = $("#be-up-marks"), listEl = $("#be-up-list");
  const saveBtn = el.querySelector('[data-act="save"]'), drop = el.querySelector(".be-up-drop");
  const mqWide = matchMedia("(min-width:1024px)");
  let checked = null;    // 마지막 살펴보기 { evId, sig, sent, out, total, oddPosition } — sig 가 지금 글과 같을 때만 쓴다
  let savedRes = null;   // 넣은 뒤 서버 답 { saved, failed, counts }
  let mk = "all";        // 판정 거르기 칩
  fillBox.checked = fill;

  const drawEv = () => {
    $('[data-act="ev"]').innerHTML = `<span class="be-up-ev-t"><small>올릴 회차</small>` +
      (ev ? `<b>${esc(ev.title || ev.id)}</b><small>${esc(evHint(ev))}</small>` : `<b>회차를 골라 주세요</b>`) +
      `</span><span class="be-up-arrow" aria-hidden="true">▾</span>`;
    const note = $("#be-up-evnote");
    note.classList.toggle("info", !blocked);
    note.hidden = !blocked && !ev?.listedNow;
    note.textContent = blocked
      ? "주소의 회차는 자격 회차(가을 말씀 동행처럼 자격으로 정해지는 명단)라 여기서 올리지 않아요 — 다른 회차를 골라 주세요"
      : "이 회차는 지금 성도님께 보여요 — 넣은 분의 이름·소속·직분이 곧바로 앱 명단에 나와요";
  };

  const drawOrder = () => {
    const o = orderOf(order);
    $('[data-act="order"]').textContent = o.label + " ▾";
    $("#be-up-cols").innerHTML = o.cols.map((k) => `<span${k === "skip" ? ' class="dim"' : ""}>${esc(COL_LABEL[k])}${k === "skip" ? "(버림)" : ""}</span>`).join("");
    ta.placeholder = sampleLine(order);
  };

  // 글·회차·칸 차례·채우기가 바뀌면 앞서 살핀 결과는 버린다 — 옛 판정으로 넣는 일을 막는다
  const resetAfterEdit = () => {
    checked = null;
    savedRes = null;
    mk = "all";
    saveBtn.hidden = true;
    sumEl.innerHTML = "";
    marksEl.hidden = true;
    marksEl.innerHTML = "";
    listEl.innerHTML = "";
  };

  // 지금 글이 살펴본 것과 같은가 — 글·회차·칸 차례·채우기 중 하나라도 다르면 false(input 이벤트를 놓친 경우까지 막는다)
  const nowSig = () => sigOf(ev?.id, parseSheet(ta.value, order), fill);
  const staleNotice = async () => {
    resetAfterEdit();
    await dialog({ title: "📋 살펴본 뒤 바뀐 것이 있어요", text: "명단·회차·칸 차례·채우기 중 무엇이 바뀌었어요 — 「살펴보기」를 다시 눌러 주세요", cancel: null });
  };

  const cardHtml = (o) => {
    const m = MARKS[o.mark] || { icon: "•", text: o.mark };
    const d = displayRow(o, checked.sent);
    return `<div class="be-up-item m-${esc(o.mark)}">
      <div class="be-up-top"><span aria-hidden="true">${m.icon}</span><b>${esc(d.name || "(이름 없음)")}</b>
        <small>${esc(d.who)}</small>${d.position ? `<span class="be-up-pos">${esc(d.position)}</span>` : ""}
        <span class="be-up-no">${o.i + 1}번째</span></div>
      <div class="be-up-msg">${esc(m.text)}</div>
      ${o.error ? `<div class="be-up-msg bad">${esc(errMsg({ error: o.error }))}</div>` : ""}
      ${(o.notes || []).map((n) => `<div class="be-up-msg note">ℹ️ ${esc(n)}</div>`).join("")}
    </div>`;
  };
  const tableHtml = (rows) => `<div class="be-up-wrap"><table class="be-up-table"><thead><tr>` +
    `<th>순서</th><th>판정</th><th>이름</th><th>소속</th><th>직분</th><th>알림</th></tr></thead><tbody>` +
    rows.map((o) => {
      const m = MARKS[o.mark] || { icon: "•", short: o.mark };
      const d = displayRow(o, checked.sent);
      const msgs = [o.error ? `<div class="be-up-msg bad">${esc(errMsg({ error: o.error }))}</div>` : "",
        ...(o.notes || []).map((n) => `<div class="be-up-msg note">ℹ️ ${esc(n)}</div>`)].join("");
      return `<tr class="m-${esc(o.mark)}"><td>${o.i + 1}</td><td>${m.icon} ${esc(m.short)}</td>` +
        `<td><b>${esc(d.name || "(이름 없음)")}</b></td><td>${esc(d.who)}</td><td>${esc(d.position)}</td><td>${msgs}</td></tr>`;
    }).join("") + `</tbody></table></div>`;

  const drawResult = () => {
    if (!checked) return;
    const c = markCounts(checked.out);
    if (savedRes) {
      // 넣은 뒤 — 살펴본 목록은 이제 옛 판정이라 치우고, 넣은 수·못 넣은 줄·명단 보러 가기만 둔다
      const sc = savedRes.counts || {};
      sumEl.innerHTML = `📥 <b>${savedRes.saved}명</b>을 넣었어요` +
        (savedRes.failed.length ? ` · 넣지 못한 줄 <b>${savedRes.failed.length}</b>` : "") +
        ` · 넣을 때 다시 본 판정 — 이미 있음 ${sc.same || 0} · 소속 빈칸 ${(sc.blank || 0) + (sc.sameName || 0)} · 모양 틀림 ${sc.bad || 0}` +
        `<br><a href="#/be-roster?ev=${encodeURIComponent(checked.evId)}">📋 회차·명단에서 보기 →</a>`;
      saveBtn.hidden = true;
      marksEl.hidden = true;
      listEl.innerHTML = savedRes.failed.map((f) => {
        const d = displayRow(checked.out.find((o) => o.i === f.i) || { i: f.i, row: null }, checked.sent);
        return `<div class="be-up-item m-bad"><div class="be-up-top"><span aria-hidden="true">⚠️</span><b>${esc(d.name || "(이름 없음)")}</b>` +
          `<small>${esc(d.who)}</small><span class="be-up-no">${f.i + 1}번째</span></div>` +
          `<div class="be-up-msg bad">${esc(errMsg({ error: f.error }))}</div></div>`;
      }).join("");
      return;
    }
    const parts = [`살펴본 줄 <b>${c.total}</b> · 넣을 것 <b>${c.willAdd}</b>${c.fill ? ` (교인명부로 채운 ${c.fill} 포함)` : ""}`];
    if (c.same) parts.push(`이미 있음 <b>${c.same}</b>`);
    if (c.blank + c.sameName) parts.push(`소속 빈칸 <b>${c.blank + c.sameName}</b>`);
    if (c.bad) parts.push(`모양 틀림 <b>${c.bad}</b>`);
    let html = parts.join(" · ") + `<br>이 회차에 지금 <b>${Number(checked.total).toLocaleString("ko-KR")}명</b>`;
    if (checked.oddPosition) html += ` · 직분 확인 <b>${checked.oddPosition}</b>줄(앱 직분 목록 밖 — 막지는 않아요)`;
    if (overLimit(checked.total, c.willAdd)) {
      html += `<span class="warn">⚠️ 넣으면 이 회차가 ${PUBLIC_MAX.toLocaleString("ko-KR")}명을 넘어요 — 성도님 앱 명단은 ` +
        `${PUBLIC_MAX.toLocaleString("ko-KR")}명까지만 보여요. 넣기 전에 관리자에게 알려 주세요.</span>`;
    }
    sumEl.innerHTML = html;
    saveBtn.hidden = !c.willAdd;
    saveBtn.textContent = `${c.willAdd}명 넣기`;
    marksEl.hidden = false;
    marksEl.innerHTML = [["all", "모두", c.total], ...MARK_ORDER.map((k) => [k, MARKS[k].short, countOf(c, k)])]
      .filter(([k, , n]) => k === "all" || n)
      .map(([k, t, n]) => `<button type="button" data-mk="${k}" class="${mk === k ? "on" : ""}" aria-pressed="${mk === k}">${esc(t)} <em>${n}</em></button>`)
      .join("");
    const rows = mk === "all" ? checked.out : checked.out.filter((o) => o.mark === mk);
    listEl.innerHTML = !rows.length ? `<p class="empty">이 판정의 줄이 없어요</p>`
      : mqWide.matches ? tableHtml(rows) : rows.map(cardHtml).join("");
  };

  async function check() {
    if (!ev) { await dialog({ title: "📤 회차를 먼저 골라 주세요", text: "맨 위 「올릴 회차」를 눌러 골라 주세요", cancel: null }); return; }
    const rows = parseSheet(ta.value, order);
    if (!rows.length) { await dialog({ title: "📋 붙여넣은 것이 없어요", text: "엑셀에서 칸을 복사해 붙여넣거나 파일을 골라 주세요", cancel: null }); return; }
    if (rows.length > MAX_ROWS) {
      await dialog({ title: "📋 줄이 너무 많아요", text: `한 번에 ${MAX_ROWS}줄까지 올릴 수 있어요 — 지금 ${rows.length}줄이에요. 나눠서 올려 주세요.`, cancel: null });
      return;
    }
    // 보낸 값 그대로 기억한다 — 기다리는 사이 채우기 칸을 바꿔도 판정과 표식이 어긋나지 않게
    const evId = ev.id, fillNow = fill, sig = sigOf(evId, rows, fillNow);
    const d = await busy(el, () => call("evUploadCheck", { event_id: evId, rows, fill: fillNow }));
    if (!d.ok) { await dialog({ title: "⚠️ 살펴보지 못했어요", text: errMsg(d), cancel: null, danger: true }); return; }
    // 기다리는 사이 글·채우기가 바뀌었으면(input 이벤트가 이미 결과를 치웠다) 옛 판정을 그리지 않는다
    if (nowSig() !== sig) return;
    checked = { evId, sig, sent: rows, out: d.rows || [], total: Number(d.total) || 0, oddPosition: d.counts?.oddPosition || 0 };
    savedRes = null;
    mk = "all";
    drawResult();
    sumEl.scrollIntoView({ block: "center" });
  }

  async function save() {
    if (!ev || !checked) return;
    // ⚠️ 넣는 순간 **지금 글**을 다시 읽는다 — 살펴본 것과 하나라도 다르면(글·회차·칸 차례·채우기) 넣지 않는다.
    //    확인 창의 건수는 그 같은 글로 살펴본 판정 줄에서 다시 센다.
    const rows = parseSheet(ta.value, order);
    if (sigOf(ev.id, rows, fill) !== checked.sig) return staleNotice();
    const base = checked;
    const c = markCounts(base.out);
    if (!c.willAdd) return;
    const yes = await dialog({ title: "📥 명단을 넣습니다", ok: `${c.willAdd}명 넣기`, cancel: "그만두기", html: confirmHtml(ev, rows.length, c) });
    if (!yes) return;
    // 확인 창이 떠 있는 사이에 바뀌었을 수도 있다 — 한 번 더 본다
    if (checked !== base || nowSig() !== base.sig) return staleNotice();
    const evId = ev.id, fillNow = fill;
    const d = await busy(el, () => call("evUploadSave", { event_id: evId, rows, fill: fillNow }));
    if (!d.ok) { await dialog({ title: "⚠️ 넣지 못했어요", text: errMsg(d), cancel: null, danger: true }); return; }
    // 넣는 사이 글을 고쳐 결과가 치워졌어도 「몇 명을 넣었는지」는 꼭 보인다(살펴본 판정 base 로 그린다)
    checked = base;
    savedRes = { saved: Number(d.saved) || 0, failed: d.failed || [], counts: d.counts || {} };
    drawResult();
    sumEl.scrollIntoView({ block: "center" });
  }

  async function readFile(f) {
    fname.textContent = f.name + " 읽는 중…";
    try {
      let text;
      if (/\.(csv|tsv|txt)$/i.test(f.name)) {
        text = decodeText(new Uint8Array(await f.arrayBuffer()));
      } else if (/\.xlsx?$/i.test(f.name)) {
        // 시트가 여럿이면 「명단」 시트를 먼저 본다(안내 시트를 실수로 읽지 않게)
        const XLSX = await loadXlsx();
        const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
        const sheet = wb.SheetNames.indexOf("명단") >= 0 ? "명단" : wb.SheetNames[0];
        text = sheetText(XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false, raw: true }));
      } else {
        throw new Error("kind");
      }
      const n = parseSheet(text, order).length;
      if (!n) throw new Error("empty");
      ta.value = text;
      resetAfterEdit();   // 파일에서 채운 글도 「글이 바뀐 것」과 같다 — 살펴보기부터 다시
      fname.textContent = `${f.name} · ${n}줄 읽음`;
    } catch {
      fname.textContent = "";
      await dialog({ title: "📂 파일을 읽지 못했어요", text: "엑셀(.xlsx)·CSV 파일만 읽어요 — 안 되면 엑셀에서 칸을 복사해 붙여넣어 주세요", cancel: null, danger: true });
    }
  }

  el.addEventListener("click", async (e) => {
    const chip = e.target.closest("[data-mk]");
    if (chip) { mk = chip.dataset.mk; drawResult(); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "check") return check();
    if (act === "save") return save();
    if (act === "pick") return fileInput.click();
    if (act === "ev") {
      const v = await pickOne({ anchor: b, title: "어느 회차에 올릴까요?", options: opts, value: ev?.id || "" });
      if (v == null || v === ev?.id) return;
      const next = all.find((x) => x.id === v);
      if (!next || next.hasEligibility) return;
      ev = next;
      lastEv = ev.id;
      blocked = false;
      if (el.isConnected) history.replaceState(null, "", evHref(ev.id));
      resetAfterEdit();
      drawEv();
      return;
    }
    if (act === "order") {
      const v = await pickOne({ anchor: b, title: "칸 차례 — 엑셀 칸이 어떤 차례인가요?",
        options: ORDERS.map((o) => ({ value: o.id, label: o.label })), value: order });
      if (v == null || v === order) return;
      order = v;
      drawOrder();
      resetAfterEdit();
    }
  });
  el.addEventListener("input", (e) => { if (e.target === ta) resetAfterEdit(); });
  el.addEventListener("change", (e) => {
    if (e.target === fillBox) { fill = fillBox.checked; resetAfterEdit(); return; }
    if (e.target === fileInput) {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = "";   // 같은 파일을 다시 고를 수 있게
      if (f) readFile(f);
    }
  });

  // 끌어다 놓기 — 파일이면 읽고, 글이면 브라우저가 붙여넣는다(input 이벤트로 이어진다)
  drop.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", (e) => { if (!drop.contains(e.relatedTarget)) drop.classList.remove("over"); });
  drop.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    drop.classList.remove("over");
    const f = e.dataTransfer.files[0];
    if (f) readFile(f);
  });
  // 칸 밖에 떨어뜨려도 브라우저가 그 파일을 열어 화면을 떠나지 않게 — 이 화면이 떠 있는 동안만(사라지면 스스로 떨어진다)
  const detach = () => {
    window.removeEventListener("dragover", onWinDrag);
    window.removeEventListener("drop", onWinDrag);
    mqWide.removeEventListener("change", onMq);
  };
  const onWinDrag = (e) => {
    if (!el.isConnected) return detach();
    if (!hasFiles(e) || drop.contains(e.target)) return;
    e.preventDefault();
    if (e.type === "dragover") e.dataTransfer.dropEffect = "none";
  };
  const onMq = () => { if (!el.isConnected) return detach(); drawResult(); };
  window.addEventListener("dragover", onWinDrag);
  window.addEventListener("drop", onWinDrag);
  mqWide.addEventListener("change", onMq);

  drawEv();
  drawOrder();
}
