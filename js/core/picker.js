// 공용 고르개 — 시스템 창(select 목록·날짜·시각 칸) 대신 우리가 그리는 창(2026-09-29 · 친구 요구
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

// 기간 고르기 — ds 가 [min, max] 안이면 true. 한계가 비었거나 날짜 꼴이 아니면 그쪽은 열려 있다.
// ("YYYY-MM-DD" 는 글자 비교가 곧 날짜 비교다)
export function dayAllowed(ds, min, max) {
  if (DATE_RE.test(min || "") && ds < min) return false;
  if (DATE_RE.test(max || "") && ds > max) return false;
  return true;
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

// 작은 판의 높이 상한 — css/admin.css `.pk-dim.pop .pk{max-height:min(480px,calc(100vh - 16px))}` 와 같은 값.
// ⚠️ 둘 중 하나를 바꾸면 다른 쪽도.
export const POP_MAX_H = 480;
// 판이 실제로 그려질 높이 — 틀(머리·아래 줄) + 내용 전체 높이를 CSS 상한으로 자른다. 자르지 않고 placePopover 에
// 넘기면, 단추 위에 붙일 때 「넘치는 키」만큼 위로 올라가 판과 단추 사이에 틈이 생긴다(2바퀴 지적 ⑥).
export function popHeight(chrome, content, vh, cap = POP_MAX_H) {
  return Math.max(0, Math.min(chrome + content, cap, vh - 16));
}

// 달력을 처음 열 때 보여 줄 달 [해, 달] — 지금 값 → 오늘(고를 수 있으면) → 오늘이 시작일(min) 앞이면 min → 그 밖엔 끝날(max).
// 날짜 꼴이 아닌 값·한계는 없는 것으로 본다.
export function calStart({ value = "", today, min = "", max = "" } = {}) {
  let s;
  if (DATE_RE.test(value || "")) s = value;
  else if (dayAllowed(today, min, max)) s = today;
  else if (DATE_RE.test(min || "") && today < min) s = min;
  else s = max;
  const [y, m] = s.split("-").map(Number);
  return [y, m];
}

// 시각 고르개의 두 열 — 시 24개 · 분 step 간격. 지금 값(value)의 분이 간격에 안 맞으면(예: 09:07) 분 목록에
// 끼워 둔다 — 열었다 「확인」만 눌러도 값이 바뀌지 않게. h·mi 는 지금 값("" 이면 아직 안 고름).
export function timeColumns(step, value) {
  const { hours, minutes } = timeSlots(step);
  const mm = TIME_RE.exec(value || "");
  const h = mm ? mm[1] : "", mi = mm ? mm[2] : "";
  if (mi && !minutes.includes(mi)) { minutes.push(mi); minutes.sort(); }
  return { hours, minutes, h, mi };
}

// "09:30" 에 n분 더하기 — 하루 안에서만(00:00 ~ 23:59 로 자른다). 꼴이 아니면 "".
export function shiftTime(v, n) {
  const mm = TIME_RE.exec(String(v || ""));
  if (!mm) return "";
  const t = Math.min(23 * 60 + 59, Math.max(0, Number(mm[1]) * 60 + Number(mm[2]) + n));
  return `${p2(Math.floor(t / 60))}:${p2(t % 60)}`;
}

// 처음 굴려 둘 자리 { h, m } — 지금 값이 있으면 그 자리, 없으면 near("HH:MM" · 예: 끝 시각 창이면 시작+1시간),
// 그것도 없으면 오전 9시 정각. 분은 목록에서 가장 가까운 칸(near 가 간격에 안 맞아도 그 언저리로).
export function timeScrollTarget({ h = "", mi = "", minutes = [], near = "" } = {}) {
  if (h) return { h, m: mi || "00" };
  const nm = TIME_RE.exec(near || "");
  if (!nm) return { h: "09", m: "00" };
  const want = Number(nm[2]);
  const m = minutes.reduce((best, x) => (Math.abs(Number(x) - want) < Math.abs(Number(best) - want) ? x : best), minutes[0] || "00");
  return { h: nm[1], m };
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
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("hashchange", onHash);
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
      // 제 키(자연 높이)는 높이 제한을 풀지 않고 계산한다 — 풀었다 다시 걸면 그 사이 내용 칸이 안 넘쳐
      // 브라우저가 스크롤 자리를 0 으로 잘라 버린다(굴리던 달력이 맨 위로 튄다). CSS 상한(480px)으로 자른다(popHeight).
      const natural = popHeight(box.offsetHeight - body.clientHeight, body.scrollHeight, innerHeight);
      const { left, top, maxHeight } = placePopover(r, { width: box.offsetWidth, height: natural },
        { width: document.documentElement.clientWidth, height: innerHeight });
      box.style.left = left + "px";
      box.style.top = top + "px";
      box.style.maxHeight = maxHeight ? maxHeight + "px" : "";
    }
    // 판 **안의** 목록을 굴린 것은 무시한다(scroll 을 잡는 단계로 들으므로 안의 스크롤도 여기로 온다)
    const onScroll = (e) => { if (e.target instanceof Node && box.contains(e.target)) return; place(); };
    // 뒤로 가기로 화면이 바뀌면 창도 닫는다(안드로이드 뒤로 단추·스와이프로 시트를 닫으려는 분이 많다)
    const onHash = () => close(null);
    // 뜬 뒤 300ms 동안은 막·선택지 누름을 받지 않는다 — 여는 단추를 두 번 톡톡 누르면 둘째 탭이
    // 시트의 선택지에 떨어져 모르는 새 다른 값이 골라진다(ui.js dialog 와 같은 값 · 2026-09-17 사고)
    const openedAt = Date.now();
    dim.addEventListener("click", (e) => {
      if (Date.now() - openedAt <= 300) { e.stopPropagation(); e.preventDefault(); }
    }, true);
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
    window.addEventListener("hashchange", onHash);
    if (!sheet) { window.addEventListener("resize", place); window.addEventListener("scroll", onScroll, true); }
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

// 여러 개 고르기 — 체크박스 · 「모두 해제」 · 「확인」 → 고른 values 배열. hint 는 항목 오른쪽의 작은 글자(인원 수 등).
// 고를 것이 없으면 「고를 것이 없어요」. 「모두 해제」는 켠 것이 하나도 없으면 잠긴다.
export function pickMany({ anchor, title, options = [], values = [], mode } = {}) {
  const has = new Set((values || []).map(String));
  return openShell({ anchor, title, mode, cls: "pk-many", onBuild: ({ body, foot, close }) => {
    body.innerHTML = options.length ? `<div class="pk-list">${options.map((o, i) =>
      `<label class="pk-chk"><input type="checkbox" data-i="${i}"${has.has(String(o.value)) ? " checked" : ""}>` +
      `<span class="pk-opt-t">${esc(o.label ?? o.value)}</span>${o.hint ? `<small class="pk-hint">${esc(o.hint)}</small>` : ""}</label>`).join("")}</div>`
      : `<p class="pk-none">고를 것이 없어요</p>`;
    foot.hidden = false;
    foot.innerHTML = `<button type="button" class="btn" data-k="clear">모두 해제</button>` +
      `<button type="button" class="btn primary" data-k="ok">확인</button>`;
    const boxes = () => [...body.querySelectorAll("input[type=checkbox]")];
    const clear = foot.querySelector('[data-k="clear"]');
    const sync = () => { clear.disabled = !boxes().some((c) => c.checked); };
    sync();
    body.addEventListener("change", sync);
    foot.addEventListener("click", (e) => {
      const k = e.target.closest("button[data-k]")?.dataset.k;
      if (k === "clear") { boxes().forEach((c) => { c.checked = false; }); sync(); body.querySelector("input")?.focus({ preventScroll: true }); }
      if (k === "ok") close(boxes().filter((c) => c.checked).map((c) => options[Number(c.dataset.i)].value));
    });
    return body.querySelector("input") || foot.querySelector('[data-k="ok"]');
  } });
}

// 날짜 — 달력. 날을 누르면 곧 닫힌다. 「지우기」 → "" · 「오늘」 → 오늘(한국 시각)
// min·max("YYYY-MM-DD" | "") — 기간을 고를 때 반대쪽 끝. 그 날은 옅은 테두리로 보이고, 넘어선 날은 흐리게 막는다.
export function pickDate({ anchor, title, value = "", min = "", max = "", mode } = {}) {
  const today = kstToday();
  const cur = DATE_RE.test(value || "") ? value : "";
  const ok = (ds) => dayAllowed(ds, min, max);
  let [y, m] = calStart({ value: cur, today, min, max });
  return openShell({ anchor, title, mode, cls: "pk-date", onBuild: ({ body, foot, close, redraw }) => {
    const draw = () => {
      const weeks = monthGrid(y, m);
      body.innerHTML = `<div class="pk-cal-nav">
          <button type="button" class="pk-nav" data-nav="-1" aria-label="이전 달"><span class="pk-field-x" aria-hidden="true"></span></button>
          <b aria-live="polite">${y}년 ${m}월</b>
          <button type="button" class="pk-nav" data-nav="1" aria-label="다음 달"><span class="pk-field-x" aria-hidden="true"></span></button></div>
        <div class="pk-cal"><div class="pk-wd" aria-hidden="true">${WD.map((w, i) => `<span${i === 0 ? ` class="sun"` : ""}>${w}</span>`).join("")}</div>
        ${weeks.map((w) => `<div class="pk-wk">${w.map((d, i) => {
          if (!d) return `<span class="pk-day none"></span>`;
          const ds = `${y}-${p2(m)}-${p2(d)}`;
          const edge = ds === min || ds === max;
          const c = ["pk-day", i === 0 ? "sun" : "", ds === today ? "today" : "", ds === cur ? "on" : "",
            edge ? "edge" : "", ok(ds) ? "" : "out"].filter(Boolean).join(" ");
          const tag = ds === today ? " 오늘" : ds === min ? " 시작일" : ds === max ? " 끝날" : "";
          return `<button type="button" class="${c}" data-d="${ds}" aria-label="${esc(fmtDateLabel(ds))}${tag}"${
            ds === cur ? ` aria-pressed="true"` : ""}${ok(ds) ? "" : " disabled"}>${d}</button>`;
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
      if (d && !d.disabled && ok(d.dataset.d)) close(d.dataset.d);
    });
    foot.hidden = false;
    foot.innerHTML = `<button type="button" class="btn" data-k="clear">지우기</button>
      <button type="button" class="btn" data-k="today"${ok(today) ? "" : " disabled"}>오늘</button>`;
    foot.addEventListener("click", (e) => {
      const k = e.target.closest("button[data-k]")?.dataset.k;
      if (k === "clear") close("");
      if (k === "today" && ok(today)) close(today);
    });
    return body.querySelector(".pk-day.on:not([disabled])") || body.querySelector(".pk-day.today:not([disabled])")
      || body.querySelector(".pk-day:not([disabled])");
  } });
}

// 시각 — 두 열(시 · 분). 「확인」 → "HH:MM" · 「지우기」 → ""
// near("HH:MM") — 빈 값으로 열 때 처음 굴려 둘 자리(예: 끝 시각 창은 시작+1시간). 고르지는 않는다(초점만 그 시에).
export function pickTime({ anchor, title, value = "", step = 5, near = "", mode } = {}) {
  const cols = timeColumns(step, value);
  const { hours, minutes } = cols;
  let { h, mi } = cols;
  const aim = timeScrollTarget({ h, mi, minutes, near });
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
    // 지금 값(없으면 near, 그것도 없으면 오전 9시)이 열 가운데 오게 미리 굴려 둔다
    requestAnimationFrame(() => {
      const center = (c, sel) => {
        const b = c.querySelector(sel);
        if (b) c.scrollTop = b.offsetTop - c.clientHeight / 2 + b.offsetHeight / 2;
      };
      center(body.querySelector('[data-col="h"]'), `[data-h="${aim.h}"]`);
      center(body.querySelector('[data-col="m"]'), `[data-m="${aim.m}"]`);
    });
    return body.querySelector("[data-h].on") || body.querySelector(`[data-h="${aim.h}"]`);
  } });
}
