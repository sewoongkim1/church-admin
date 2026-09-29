// 공용 고르개 — 시스템 창(<select>·날짜·시각 칸) 대신 우리가 그리는 창(2026-09-29 · 친구 요구
// 「모바일에서는 팝업을 우리 것으로, 시스템 팝업을 띄우지 말 것」).
//   좁은 화면(≤719px) = 화면 아래에 붙는 바텀 시트 · 넓은 화면 = 누른 단추 바로 아래의 작은 판.
//   모두 Promise — 고르면 값, 취소(Esc·뒤 막·「닫기」)면 null. 한 번에 하나만 열린다.
// ⚠️ 이 파일은 Node 시험(tests/picker.test.mjs)이 읽는다 — 맨 위에서 document·matchMedia 를 만지지 않는다.
import { esc } from "./ui.js";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const p2 = (n) => String(n).padStart(2, "0");

// ───────── 순수 도우미 (Node 시험) ─────────

// 한 달 달력 — 일요일 시작, 주마다 7칸, 빈칸은 null. m 은 1~12.
export function monthGrid(y, m) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function addMonth(y, m, n) {
  const i = y * 12 + (m - 1) + n;
  return [Math.floor(i / 12), (i % 12) + 1];
}

// 시 24개("00"~"23") · 분은 step 간격("00","05",…). step 이 이상하면 1분.
export function timeSlots(step = 5) {
  const s = Number.isInteger(step) && step > 0 && step <= 60 ? step : 1;
  const hours = Array.from({ length: 24 }, (_, i) => p2(i));
  const minutes = [];
  for (let i = 0; i < 60; i += s) minutes.push(p2(i));
  return { hours, minutes };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// "2026-09-29" → 「9월 29일 (화)」
export function fmtDateLabel(s) {
  const m = DATE_RE.exec(String(s || ""));
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d) || d.getUTCDate() !== +m[3]) return "";
  return `${+m[2]}월 ${+m[3]}일 (${WD[d.getUTCDay()]})`;
}

// "09" → 「오전 9시」 · "00" → 「오전 12시」 · "12" → 「오후 12시」
export function hourLabel(h) {
  const n = Number(h);
  return `${n < 12 ? "오전" : "오후"} ${n % 12 === 0 ? 12 : n % 12}시`;
}

// "09:05" → 「오전 9:05」 (값은 늘 24시간 HH:MM — 글자만 읽기 쉽게)
export function fmtTimeLabel(s) {
  const m = TIME_RE.exec(String(s || ""));
  if (!m) return "";
  const n = Number(m[1]);
  return `${n < 12 ? "오전" : "오후"} ${n % 12 === 0 ? 12 : n % 12}:${m[2]}`;
}

// 한국 시각 기준 오늘 "YYYY-MM-DD"
export function kstToday(now = new Date()) {
  const d = new Date(now.getTime() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

// 넓은 화면의 작은 판 자리 — 단추 바로 아래(6px), 밑이 모자라면 위. 둘 다 모자라면 넓은 쪽에 두고
// 높이를 그만큼으로 줄인다(maxHeight — 내용만 스크롤). 그 자리도 240px 이 안 되면 화면 안으로 올려 덮는다.
// 오른쪽이 넘치면 안쪽으로. 화면 가장자리 여백 8px.
export function placePopover(a, size, vp) {
  const GAP = 6, M = 8, MIN = 240;
  let left = a.left;
  if (left + size.width > vp.width - M) left = vp.width - M - size.width;
  left = Math.max(M, left);
  const below = vp.height - M - (a.bottom + GAP), above = a.top - GAP - M;
  if (size.height <= below) return { left, top: a.bottom + GAP };
  if (size.height <= above) return { left, top: a.top - GAP - size.height };
  if (Math.max(below, above) >= MIN) {
    return below >= above ? { left, top: a.bottom + GAP, maxHeight: below } : { left, top: M, maxHeight: above };
  }
  return { left, top: Math.max(M, vp.height - M - size.height) };
}

// ───────── 창 (브라우저에서만) ─────────

let current = null;   // 지금 열린 창을 닫는 함수 — 한 번에 하나만
let seq = 0;

const wantSheet = (mode) => mode === "sheet" || (mode !== "popover" && matchMedia("(max-width:719px)").matches);

// 창 틀 — body(내용)·foot(아래 줄)를 그리는 것은 부르는 쪽. resolve 는 한 번만.
function openShell({ anchor, title, mode, cls = "", onBuild }) {
  if (current) current(null);
  return new Promise((resolve) => {
    const sheet = wantSheet(mode);
    const id = "pk-t" + ++seq;
    const dim = document.createElement("div");
    dim.className = "pk-dim " + (sheet ? "sheet" : "pop");
    dim.innerHTML = `<div class="pk ${cls}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      ${sheet ? `<div class="pk-grip" aria-hidden="true"></div>` : ""}
      <div class="pk-h"><h3 id="${id}"></h3><button type="button" class="pk-x">닫기</button></div>
      <div class="pk-b"></div><div class="pk-f" hidden></div></div>`;
    const box = dim.querySelector(".pk");
    dim.querySelector("h3").textContent = title || "";
    const body = dim.querySelector(".pk-b"), foot = dim.querySelector(".pk-f");

    let done = false;
    const close = (v) => {
      if (done) return;
      done = true;
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      dim.remove();
      if (current === close) current = null;
      if (anchor) {
        anchor.setAttribute("aria-expanded", "false");
        if (anchor.isConnected) anchor.focus({ preventScroll: true });
      }
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(null); return; }
      if (e.key !== "Tab") return;
      // 초점이 창 밖으로 나가지 않게 — 끝에서 처음으로, 처음에서 끝으로
      const f = [...box.querySelectorAll("button:not([disabled]),input:not([disabled])")].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      else if (i < 0) { e.preventDefault(); f[0].focus(); }
    };
    function place() {
      if (sheet || !anchor || !anchor.isConnected) return;
      const r = anchor.getBoundingClientRect();
      box.style.maxHeight = "";   // 제 키로 재고 나서 자리를 고른다
      const { left, top, maxHeight } = placePopover(r, { width: box.offsetWidth, height: box.offsetHeight },
        { width: document.documentElement.clientWidth, height: innerHeight });
      box.style.left = left + "px";
      box.style.top = top + "px";
      if (maxHeight) box.style.maxHeight = maxHeight + "px";
    }
    // 뒤 막 — 눌렀다 뗄 때 모두 막이어야 닫는다(dialog 와 같은 규칙: 글을 끌다 밖에서 떼도 안 닫힌다)
    let downOut = false;
    dim.addEventListener("pointerdown", (e) => { downOut = e.target === dim; });
    dim.addEventListener("click", (e) => {
      if (e.target.closest(".pk-x")) return close(null);
      if (e.target === dim && downOut) close(null);
    });

    const focusFirst = onBuild({ body, foot, close, box, redraw: () => place() });
    document.body.appendChild(dim);
    if (!sheet && anchor) box.style.minWidth = Math.max(260, anchor.getBoundingClientRect().width) + "px";
    place();
    current = close;
    document.addEventListener("keydown", onKey, true);
    if (!sheet) { window.addEventListener("resize", place); window.addEventListener("scroll", place, true); }
    if (anchor) { anchor.setAttribute("aria-haspopup", "dialog"); anchor.setAttribute("aria-expanded", "true"); }
    (focusFirst || dim.querySelector(".pk-x")).focus({ preventScroll: true });
  });
}

// 한 줄 고르기 — 누르면 곧 닫힌다. 지금 값은 ✓
export function pickOne({ anchor, title, options = [], value = "", mode } = {}) {
  return openShell({ anchor, title, mode, cls: "pk-one", onBuild: ({ body, close }) => {
    body.innerHTML = `<div class="pk-list">${options.map((o, i) => {
      const on = String(o.value) === String(value);
      return `<button type="button" class="pk-opt${on ? " on" : ""}" data-i="${i}" aria-pressed="${on}">
        <span class="pk-opt-t">${esc(o.label ?? o.value)}${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</span>
        <span class="pk-ck" aria-hidden="true">${on ? "✓" : ""}</span></button>`;
    }).join("")}</div>`;
    body.addEventListener("click", (e) => {
      const b = e.target.closest(".pk-opt");
      if (b) close(options[Number(b.dataset.i)].value);
    });
    const on = body.querySelector(".pk-opt.on");
    if (on) requestAnimationFrame(() => on.scrollIntoView({ block: "nearest" }));
    return on || body.querySelector(".pk-opt");
  } });
}

// 여러 개 고르기 — 체크박스 · 「모두 해제」 · 「확인」 → 고른 values 배열
export function pickMany({ anchor, title, options = [], values = [], mode } = {}) {
  const has = new Set((values || []).map(String));
  return openShell({ anchor, title, mode, cls: "pk-many", onBuild: ({ body, foot, close }) => {
    body.innerHTML = `<div class="pk-list">${options.map((o, i) =>
      `<label class="pk-chk"><input type="checkbox" data-i="${i}"${has.has(String(o.value)) ? " checked" : ""}>
        <span class="pk-opt-t">${esc(o.label ?? o.value)}${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</span></label>`).join("")}</div>`;
    foot.hidden = false;
    foot.innerHTML = `<button type="button" class="btn" data-k="clear">모두 해제</button>
      <button type="button" class="btn primary" data-k="ok">확인</button>`;
    foot.addEventListener("click", (e) => {
      const k = e.target.closest("button[data-k]")?.dataset.k;
      if (k === "clear") body.querySelectorAll("input[type=checkbox]").forEach((c) => { c.checked = false; });
      if (k === "ok") close([...body.querySelectorAll("input[type=checkbox]")].filter((c) => c.checked).map((c) => options[Number(c.dataset.i)].value));
    });
    return body.querySelector("input");
  } });
}

// 날짜 — 달력. 날을 누르면 곧 닫힌다. 「지우기」 → "" · 「오늘」 → 오늘(한국 시각)
export function pickDate({ anchor, title, value = "", mode } = {}) {
  const today = kstToday();
  const cur = DATE_RE.test(value || "") ? value : "";
  let [y, m] = (cur || today).split("-").map(Number);
  return openShell({ anchor, title, mode, cls: "pk-date", onBuild: ({ body, foot, close, redraw }) => {
    const draw = () => {
      const weeks = monthGrid(y, m);
      body.innerHTML = `<div class="pk-cal-nav">
          <button type="button" class="pk-nav" data-nav="-1" aria-label="이전 달">‹</button>
          <b aria-live="polite">${y}년 ${m}월</b>
          <button type="button" class="pk-nav" data-nav="1" aria-label="다음 달">›</button></div>
        <div class="pk-cal"><div class="pk-wd" aria-hidden="true">${WD.map((w, i) => `<span${i === 0 ? ` class="sun"` : ""}>${w}</span>`).join("")}</div>
        ${weeks.map((w) => `<div class="pk-wk">${w.map((d, i) => {
          if (!d) return `<span class="pk-day none"></span>`;
          const ds = `${y}-${p2(m)}-${p2(d)}`;
          const c = ["pk-day", i === 0 ? "sun" : "", ds === today ? "today" : "", ds === cur ? "on" : ""].filter(Boolean).join(" ");
          return `<button type="button" class="${c}" data-d="${ds}" aria-label="${esc(fmtDateLabel(ds))}${ds === today ? " 오늘" : ""}"${
            ds === cur ? ` aria-pressed="true"` : ""}>${d}</button>`;
        }).join("")}</div>`).join("")}</div>`;
      redraw();
    };
    draw();
    body.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-nav]");
      if (nav) {
        [y, m] = addMonth(y, m, Number(nav.dataset.nav));
        draw();
        body.querySelector(`[data-nav="${nav.dataset.nav}"]`)?.focus({ preventScroll: true });
        return;
      }
      const d = e.target.closest("[data-d]");
      if (d) close(d.dataset.d);
    });
    foot.hidden = false;
    foot.innerHTML = `<button type="button" class="btn" data-k="clear">지우기</button>
      <button type="button" class="btn" data-k="today">오늘</button>`;
    foot.addEventListener("click", (e) => {
      const k = e.target.closest("button[data-k]")?.dataset.k;
      if (k === "clear") close("");
      if (k === "today") close(today);
    });
    return body.querySelector(".pk-day.on") || body.querySelector(".pk-day.today");
  } });
}

// 시각 — 두 열(시 · 분). 「확인」 → "HH:MM" · 「지우기」 → ""
export function pickTime({ anchor, title, value = "", step = 5, mode } = {}) {
  const { hours, minutes } = timeSlots(step);
  const mm = TIME_RE.exec(value || "");
  let h = mm ? mm[1] : "", mi = mm ? mm[2] : "";
  // 지금 값이 간격에 안 맞으면(예: 09:07) 목록에 끼워 둔다 — 열었다 확인만 눌러도 값이 바뀌지 않게
  if (mi && !minutes.includes(mi)) { minutes.push(mi); minutes.sort(); }
  return openShell({ anchor, title, mode, cls: "pk-time", onBuild: ({ body, foot, close }) => {
    const col = (k, list, lab, sel, name) => `<div class="pk-col" data-col="${k}" role="group" aria-label="${name}">${list.map((v) =>
      `<button type="button" class="pk-cell${v === sel ? " on" : ""}" data-${k}="${v}" aria-pressed="${v === sel}">${lab(v)}</button>`).join("")}</div>`;
    body.innerHTML = `<div class="pk-now" aria-live="polite"></div>
      <div class="pk-cols">${col("h", hours, hourLabel, h, "시")}${col("m", minutes, (v) => `${v}분`, mi, "분")}</div>`;
    const now = body.querySelector(".pk-now");
    foot.hidden = false;
    foot.innerHTML = `<button type="button" class="btn" data-k="clear">지우기</button>
      <button type="button" class="btn primary" data-k="ok">확인</button>`;
    const ok = foot.querySelector('[data-k="ok"]');
    const show = () => {
      now.textContent = h ? fmtTimeLabel(`${h}:${mi || "00"}`) : "시를 골라 주세요";
      ok.disabled = !h;
      body.querySelectorAll("[data-h]").forEach((b) => { b.classList.toggle("on", b.dataset.h === h); b.setAttribute("aria-pressed", String(b.dataset.h === h)); });
      body.querySelectorAll("[data-m]").forEach((b) => { b.classList.toggle("on", b.dataset.m === mi); b.setAttribute("aria-pressed", String(b.dataset.m === mi)); });
    };
    show();
    body.addEventListener("click", (e) => {
      const hb = e.target.closest("[data-h]"), mb = e.target.closest("[data-m]");
      if (hb) { h = hb.dataset.h; if (!mi) mi = "00"; }
      else if (mb) mi = mb.dataset.m;
      else return;
      show();
    });
    foot.addEventListener("click", (e) => {
      const k = e.target.closest("button[data-k]")?.dataset.k;
      if (k === "clear") close("");
      if (k === "ok" && h) close(`${h}:${mi || "00"}`);
    });
    // 지금 값(없으면 오전 9시)이 열 가운데 오게 미리 굴려 둔다
    requestAnimationFrame(() => {
      const center = (c, sel) => {
        const b = c.querySelector(sel);
        if (b) c.scrollTop = b.offsetTop - c.clientHeight / 2 + b.offsetHeight / 2;
      };
      center(body.querySelector('[data-col="h"]'), `[data-h="${h || "09"}"]`);
      center(body.querySelector('[data-col="m"]'), `[data-m="${mi || "00"}"]`);
    });
    return body.querySelector("[data-h].on") || body.querySelector('[data-h="09"]');
  } });
}
