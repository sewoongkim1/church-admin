# -*- coding: utf-8 -*-
# 📅 당번 명단의 **화면 자리**를 진짜 브라우저에서 잰다 — 다시 그린 뒤 화면이 어디에 서는가(js/menus/duty/roster.js settleView · duty-logic.js calSettle).
#   node 시험(tests/duty-cal.test.mjs)의 가짜 화면은 문서가 줄어드는 것을 흉내 낼 뿐이고, 고르개·입력 창이 뜨는 길(「옮기기」·날짜 더하기)은 밟지 못한다.
#   이 자리는 2026-10-07 하루에 세 번 어긋났다(다시 그리면 달력이 달아남 → 고침이 「옮기기」 뒤 빈 화면을 만듦 → 그 고침이 옮긴 줄을 화면 밖으로 보냄) —
#   세 번 모두 node 시험과 그때의 탐침은 통과했다. **화면 자리(settleView·calSettle·달력·날짜 줄의 css)를 고치면 이 도구를 돌린다**(CLAUDE.md 「봉사 당번」 절).
#
#   하는 일: 작업 폴더를 127.0.0.1 에 띄우고(포트는 OS 가 고른다 · 파일을 만들지 않는다 — 탐침 화면은 메모리에서 준다) 진짜 roster.js 를 **가짜 서버**(페이지 안의 메모리)로
#     그린 뒤 사람처럼 눌러 본다. 어디에도 쓰지 않는다 · 로그인하지 않는다 · 바깥으로 나가는 요청이 하나라도 있으면 실패 · 이름은 가짜(성도N).
#   재는 것: ① 「옮기기」로 다른 날에(같은 자리로 · 첫 자리로 · 끝 자리로 · 짧은 날로) — 옮긴 분의 줄이 다 보이는가 · 새 판이 보이는가 · 문서를 늘리지 않았는가
#            ② 같은 자리의 다음 주일로 옮기면 굴린 자리가 그대로인가 ③ 서버가 거절해 다시 읽은 때 · 맡은 당번에서 빠져 남은 당번이 열린 때 · 날짜 더하기 — 빈 화면이 아닌가
#            ④ 같은 날을 다시 그리는 저장(빼기) — 굴린 자리가 그대로인가 ⑤ 붙은 달력(PC)에서 날짜·달 단추 — 그날 판이 붙은 선에서 시작하고 달력이 제자리인가(마우스·자판)
#            ⑥ 불러오는 중에(또는 저장 중에) 다른 메뉴로 옮긴 뒤 — 늦게 온 그리기가 지금 보이는 메뉴를 굴리지 않는가 ⑦ 큰 화면의 짧은 명단 — 묶음을 늘리지 않는가
#   준비물: python 3 + playwright(`pip install playwright`). 크롬은 PC 에 깔린 것을 쓴다(channel="chrome") · 사파리 엔진·파이어폭스는 `python -m playwright install webkit firefox`.
#   쓰는 법: python tools/duty-view-probe.py [--engine chrome|webkit|firefox] [--quick] [--only move,same,reject,lost,dateadd,sameday,sticky,detached,short]
#     --quick = 크기 둘(폰 390×844 · PC 1280×900)만. 끝에 「N가지 가운데 N가지 통과」 — 하나라도 실패하면 종료 코드 1.
import argparse, http.server, pathlib, sys, threading

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parent.parent
TODAY = "2026-10-07"   # 수요일 — 가짜 서버가 말하는 오늘(진짜 날짜와 상관없다)
HEAD, LINE, GAP = 56, 64, 8   # 머리줄 높이 · 붙은 달력의 선(머리줄 + 8) · 화면 아래 여백 — duty-logic.js calSettle 의 값과 같다

PAGE = r"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>당번 명단 화면 자리 탐침</title>
<link rel="stylesheet" href="css/tokens.css"><link rel="stylesheet" href="css/admin.css"></head>
<body><div id="app">
<header class="top"><button type="button" class="icon-btn menu" aria-label="메뉴 열기">☰</button><h1>고척교회 관리</h1><span class="who">탐침</span><button type="button" class="out">로그아웃</button></header>
<nav class="nav" aria-label="메뉴"><a href="#/" data-id="">🏠 처음</a><div class="nav-g"><h3>봉사 당번</h3><a class="on" href="#/dutyroster">📅 당번 명단</a></div></nav>
<div class="nav-dim" hidden></div><main class="view" id="view"></main></div>
<script type="module">
import { render } from "./js/menus/duty/roster.js";
const P = new URLSearchParams(location.search), TODAY = "__TODAY__";
const NAMES = [["1부", "안내", "07:30", "08:30"], ["2부", "설거지", "11:30", "12:30"], ["2부", "배식", "11:00", "12:00"], ["3부", "설거지", "13:00", "14:00"], ["3부", "배식", "12:30", "13:30"]];
let seq = 1000;
const iso = (t) => new Date(t).toISOString().slice(0, 10), at = (d) => Date.parse(d + "T00:00:00Z");
const who = () => ({ id: ++seq, name: "성도" + seq, who: "화평 1목장", source: "app", hasApp: true, hasPush: true });
const slot = (i, n, cap = 3) => ({ id: ++seq, lineId: i + 1, service: NAMES[i][0], task: NAMES[i][1], start: NAMES[i][2], end: NAMES[i][3], capacity: cap, off: false, leftover: false, signups: Array.from({ length: n }, who), ended: [] });
const mkDay = (d, n, k = 5) => ({ date: d, off: false, note: "", confirmed: false, locked: false, cutoff: iso(at(d) - 864e5) + "T10:00:00Z", past: d < TODAY, afterUntil: false, notYet: false, asks: 0, need: 0,
  slots: Array.from({ length: k }, (_, i) => slot(i, n)) });
const sundays = (start, count) => Array.from({ length: count }, (_, i) => iso(at(start) + i * 7 * 864e5));
// 당번의 꼴 — full: 주일마다 자리 다섯 × 세 분(긴 판 → 긴 판) · thin: 10/18 까지만 차 있고 그 뒤는 비어 간다(긴 판 → 짧은 판) · small: 자리 둘 × 한 분(화면에 다 드는 짧은 명단)
const KINDS = {
  full: () => sundays("2026-09-06", 20).map((d) => mkDay(d, 3)),
  thin: () => sundays("2026-09-06", 20).map((d) => mkDay(d, d <= "2026-10-18" ? 3 : d === "2026-10-25" ? 1 : 0)),
  small: () => sundays("2026-10-11", 8).map((d) => mkDay(d, 1, 2)),
};
const boards = (P.get("bs") || "full").split(",").map((k, i) => ({ id: "probe-" + i, title: "식당 봉사(탐침 " + (i + 1) + ")", days: KINDS[k]() }));
const lost = new Set(), LINES = NAMES.map((x, i) => ({ id: i + 1, active: true, service: x[0], task: x[1], start: x[2], end: x[3], capacity: 3, weekday: 0, sort: i }));
window.__calls = []; window.__lat = Number(P.get("lat") || 40); window.__fail = P.get("fail") || ""; window.__lose = P.get("lose") || ""; window.__routed = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const findSign = (id) => { for (const b of boards) for (const d of b.days) for (const s of d.slots) { const i = s.signups.findIndex((e) => String(e.id) === String(id)); if (i >= 0) return [d, s, i]; } return [null, null, -1]; };
const findSlot = (id) => { for (const b of boards) for (const d of b.days) for (const s of d.slots) if (String(s.id) === String(id)) return [d, s]; return [null, null]; };
const N = { notified: 1, missed: 0, notifyError: "" };
let cur = "";
const call = async (action, body = {}) => {
  window.__calls.push(action);
  await wait(window.__lat);
  if (window.__lose && action === window.__lose) { lost.add(cur); window.__lose = ""; return { ok: false, error: "not-assigned" }; }
  const live = boards.filter((b) => !lost.has(b.id));
  if (action === "dutyBoardList") return { ok: true, scope: lost.size ? "assigned" : "all", today: TODAY, boards: live.map((b) => ({ id: b.id, title: b.title, status: "open", statusLabel: "받는 중" })) };
  if (action === "dutyRoster") {
    const b = boards.find((x) => x.id === body.board_id);
    if (!b) return { ok: false, error: "not-found" };
    if (lost.has(b.id)) return { ok: false, error: "not-assigned" };
    cur = b.id;
    for (const d of b.days) d.need = d.slots.reduce((k, s) => k + Math.max(0, s.capacity - s.signups.length), 0);
    return { ok: true, chief: true, appOpen: false, today: TODAY, staff: [], lines: LINES,
      board: { id: b.id, title: b.title, status: "open", statusLabel: "받는 중", openDays: 182, untilDate: "", place: "1층 식당", contact: "", maxAhead: null },
      days: structuredClone(b.days.filter((d) => d.date >= body.from && (d.off || d.note || d.confirmed || d.slots.length)).sort((a, z) => (a.date < z.date ? -1 : 1))) };
  }
  if (action === "dutySignMove") {
    if (window.__fail) return { ok: false, error: window.__fail };
    const [d, s, i] = findSign(body.id), [td, ts] = findSlot(body.to_slot);
    if (!s || !ts) return { ok: false, error: "not-found" };
    const [e] = s.signups.splice(i, 1); ts.signups.push({ ...e, moved: true });   // 줄 번호는 그대로다(성경암송 duty_move 가 같은 줄을 고친다)
    return { ok: true, to: { date: td.date, service: ts.service, task: ts.task, start: ts.start }, ...N };
  }
  if (action === "dutySignRemove") { const [d, s, i] = findSign(body.id); if (!s) return { ok: false, error: "not-active" }; const [e] = s.signups.splice(i, 1); s.ended.unshift({ ...e, reason: "staff" }); return { ok: true, ...N }; }
  if (action === "dutyDateAdd") {
    const b = boards.find((x) => x.id === body.board_id); if (!b) return { ok: false, error: "not-found" };
    let d = b.days.find((x) => x.date === body.date), made = 0;
    if (!d) { d = { ...mkDay(body.date, 0, 0) }; b.days.push(d); }
    for (const id of body.line_ids) { if (d.slots.some((s) => s.lineId === id)) continue; d.slots.push(slot(id - 1, 0)); made++; }
    return { ok: true, made, existed: 0, reopened: 0 };
  }
  return { ok: false, error: "unknown-action" };
};
// main.js 의 route 와 같은 차례(scrollTo 0 · 새 section 으로 갈아 끼움 · render) — 메뉴를 옮기는 것을 흉내 낸다
window.__route = async () => { window.scrollTo(0, 0); const host = document.createElement("section"); document.getElementById("view").replaceChildren(host);
  host.innerHTML = '<p class="empty">불러오는 중…</p>'; await render(host, { call, query: {} }); window.__routed++; };
window.__other = () => { window.scrollTo(0, 0); const host = document.createElement("section"); host.id = "other";
  host.innerHTML = '<h2 class="page-title">다른 메뉴(가짜)</h2>' + Array.from({ length: 80 }, (_, i) => '<p style="height:50px">줄 ' + (i + 1) + "</p>").join("");
  document.getElementById("view").replaceChildren(host); };
const host = document.createElement("section");
document.getElementById("view").replaceChildren(host);
await render(host, { call, query: {} });
window.__ready = true;
</script></body></html>
"""

STATE = """() => {
  const q = (s) => document.querySelector(s), box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, h: r.height }; };
  const day = q('.dty-day'), sp = q('.dty-split'), cal = q('.dty-cal'), bar = q('.dty-bar'), de = document.documentElement, d = box(day);
  return { sy: scrollY, vh: innerHeight, docH: de.scrollHeight, bar: (q('.dty-bar b') || {}).textContent || '', day: d, cal: box(cal), barBox: box(bar), grow: sp ? sp.style.minHeight : '',
    calPos: cal ? getComputedStyle(cal).position : '', inView: d ? Math.max(0, Math.min(innerHeight, d.b) - Math.max(56, d.t)) : 0, modal: !!q('.pk-dim, .dlg-dim, .be-modal'),
    toast: (q('.adm-toast') || {}).textContent || '', rosterCalls: (window.__calls || []).filter((c) => c === 'dutyRoster').length };
}"""
ROW = """(sid) => { const x = document.querySelector('[data-sid="' + sid + '"]'); if (!x) return null; const r = x.getBoundingClientRect(); return { t: r.top, b: r.bottom }; }"""
SLOT = "document.querySelectorAll('.dty-slot')[%d]"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css"}   # 윈도 레지스트리에 기대지 않는다

    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def do_GET(self):
        if self.path.split("?")[0] == "/__duty_probe.html":
            body = PAGE.replace("__TODAY__", TODAY).encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store")
            self.end_headers(); self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


results, errs, outside = [], [], []


def check(name, ok, extra=""):
    results.append((name, bool(ok)))
    if not ok:
        print("  실패 " + name + ((" — " + str(extra)) if extra != "" else ""), flush=True)


class Probe:
    def __init__(self, browser, base, engine):
        self.browser, self.base, self.engine = browser, base, engine

    def open(self, w, h, touch, query):
        touch = touch and self.engine != "firefox"   # 파이어폭스는 폰 흉내(is_mobile)를 받지 않는다 — 폭만 좁힌다
        ctx = self.browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if touch else 1, is_mobile=touch, has_touch=touch, locale="ko-KR",
                                       reduced_motion="reduce", service_workers="block")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errs.append(str(e)[:300]))
        page.on("request", lambda r: outside.append(r.url[:160]) if not r.url.startswith(self.base) else None)
        page.goto(self.base + "__duty_probe.html" + query, wait_until="networkidle")
        page.wait_for_function("() => window.__ready === true", timeout=20000)
        return ctx, page, touch


def st(page):
    return page.evaluate(STATE)


def box_of(page, js):
    return page.evaluate("() => { const x = (%s); if (!x) return null; const q = x.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }; }" % js)


def press(page, b, touch):
    (page.touchscreen.tap if touch else page.mouse.click)((b["l"] + b["r"]) / 2, (b["t"] + b["b"]) / 2)


def scroll_by(page, dy, touch, w, h):
    """사람처럼 굴린다 — PC 는 진짜 휠 · 폰은 scrollBy(손가락 대신)."""
    if touch:
        page.evaluate("(d) => window.scrollBy(0, d)", dy)
    else:
        page.mouse.move(w * 0.7, h * 0.6)
        page.mouse.wheel(0, dy)
    page.wait_for_timeout(250)


def bring(page, js, touch, w, h, frac=0.5):
    """js 의 요소가 화면의 frac 높이쯤 오게 굴린다."""
    far = "(f) => { const x = (%s); if (!x) return null; const r = x.getBoundingClientRect(); return r.top - innerHeight * f; }" % js
    dy = page.evaluate(far, frac)
    if dy is None:
        return False
    if abs(dy) > 2:
        scroll_by(page, dy, touch, w, h)
        page.wait_for_timeout(250)
        rest = page.evaluate(far, frac)   # 휠의 걸음은 엔진마다 다르다(파이어폭스는 덜 간다) — 남은 만큼 맞춘다
        if rest is not None and abs(rest) > 40:
            page.evaluate("(d) => window.scrollBy(0, d)", rest)
            page.wait_for_timeout(200)
    return True


def after_reload(page, n):
    """명단을 다시 읽고 그릴 때까지 — n = 누르기 전의 dutyRoster 호출 수"""
    page.wait_for_function("(n) => window.__calls.filter((c) => c === 'dutyRoster').length > n", arg=n, timeout=8000)
    page.wait_for_timeout(350)


def pick(page, touch, text, nth=0):
    page.wait_for_selector(".pk-dim .pk-opt", timeout=4000)
    page.wait_for_timeout(400)          # 창이 뜬 직후의 누름은 무시된다(두 번 누르는 버릇 막기)
    opts = page.locator(".pk-opt", has_text=text) if text else page.locator(".pk-opt")
    if opts.count() <= nth:
        return False
    opt = opts.nth(nth)
    opt.scroll_into_view_if_needed()
    (opt.tap if touch else opt.click)()
    return True


def dlg_ok(page, touch):
    page.wait_for_selector('.dlg-dim .btn[data-v="1"]', timeout=4000)
    page.wait_for_timeout(350)
    b = page.locator('.dlg-dim .btn[data-v="1"]')
    (b.tap if touch else b.click)()


def under_of(s):
    """옮긴 줄이 가려지지 않는 위쪽 끝 — 날짜 줄이 머리줄 아래에 붙어 있으면 그 아래끝"""
    b = s["barBox"]
    return max(float(LINE), b["b"]) if b and b["t"] <= HEAD + 1 else float(LINE)


# ── ① ② 「옮기기」로 다른 날에 ──
def do_move(p, size, bs, k, date_text, j, query=""):
    name, w, h, touch = size
    ctx, page, touch = p.open(w, h, touch, "?bs=%s%s" % (bs, query))
    try:
        js = (SLOT % k) + ".querySelector('[data-op=\"move\"]')"
        if not box_of(page, js):
            return None
        bring(page, js, touch, w, h)
        s0 = st(page)
        sid = page.evaluate("() => (%s).closest('[data-sid]').dataset.sid" % js)
        press(page, box_of(page, js), touch)
        if not pick(page, touch, date_text, j):
            return None
        after_reload(page, s0["rosterCalls"])
        s1 = st(page)
        return s0, s1, page.evaluate(ROW, sid)
    finally:
        ctx.close()


def run_move(p, sizes):
    for bs in ("full", "thin"):
        for size in sizes:
            for k, date_text, j, label in ((0, "10월 18일", 4, "첫 자리 → 다음 주일의 끝 자리"), (0, "11월 1일", 0, "첫 자리 → 3주 뒤의 첫 자리"),
                                           (4, "10월 18일", 0, "끝 자리 → 다음 주일의 첫 자리"), (4, "10월 18일", 2, "끝 자리 → 다음 주일의 가운데 자리"),
                                           (4, "11월 1일", 0, "끝 자리 → 3주 뒤의 첫 자리"), (2, "11월 1일", 4, "가운데 자리 → 3주 뒤의 끝 자리")):
                got = do_move(p, size, bs, k, date_text, j)
                tag = "옮기기 · %s · %s · %s" % (bs, size[0], label)
                if not got:
                    check(tag + " — 누를 수 있다", False, "옮기기 단추나 선택지를 찾지 못했다")
                    continue
                s0, s1, row = got
                und = under_of(s1)
                check(tag + " — 옮긴 날의 판", date_text in s1["bar"] and not s1["modal"], s1["bar"])
                check(tag + " — 옮긴 분의 줄이 다 보인다", bool(row) and row["t"] >= und - 1 and row["b"] <= s1["vh"] - GAP + 1,
                      "줄 %s · 위쪽 끝 %.0f · 화면 %d · 굴린 자리 %d→%d" % (row and "%.0f~%.0f" % (row["t"], row["b"]), und, s1["vh"], s0["sy"], s1["sy"]))
                check(tag + " — 새 판이 보이고 문서를 늘리지 않았다", s1["inView"] > 40 and not s1["grow"], "보임 %d · min-height %r" % (s1["inView"], s1["grow"]))


def run_same(p, sizes):
    for size in sizes:
        for k in (1, 3, 4):
            got = do_move(p, size, "full", k, "10월 18일", k)
            tag = "같은 자리의 다음 주일로 · %s · %d번째 자리" % (size[0], k + 1)
            if not got:
                check(tag + " — 누를 수 있다", False)
                continue
            s0, s1, row = got
            check(tag + " — 굴린 자리 그대로", abs(s1["sy"] - s0["sy"]) < 1.5 and not s1["grow"], "%d→%d · min-height %r" % (s0["sy"], s1["sy"], s1["grow"]))
            check(tag + " — 옮긴 분의 줄이 다 보인다", bool(row) and row["t"] >= under_of(s1) - 1 and row["b"] <= s1["vh"] - GAP + 1, row)


# ── ③ 빈 화면이 아닌가 — 거절돼 다시 읽은 때 · 남은 당번이 열린 때 · 날짜 더하기 ──
def run_reject(p, sizes):
    for size in sizes:
        got = do_move(p, size, "thin", 4, "11월 1일", 0, "&fail=changed")
        tag = "거절된 옮기기(다시 읽기) · %s" % size[0]
        if not got:
            check(tag + " — 누를 수 있다", False)
            continue
        s0, s1, row = got
        check(tag + " — 옮기려던 날의 판이 보인다(빈 화면 아님)", "11월 1일" in s1["bar"] and s1["inView"] > 150 and not s1["grow"], "보임 %d · min-height %r · %s" % (s1["inView"], s1["grow"], s1["bar"]))
        check(tag + " — 그 줄은 옮겨지지 않았다(옛 날에 그대로 — 화면에는 없다)", row is None, row)


def run_lost(p, sizes):
    for size in sizes:
        name, w, h, touch = size
        ctx, page, touch = p.open(w, h, touch, "?bs=thin,small&lose=dutySignRemove")
        try:
            b = box_of(page, "document.querySelector('.dty-board')")
            press(page, b, touch)
            pick(page, touch, None, 0)
            page.wait_for_timeout(700)
            js = (SLOT % 4) + ".querySelector('[data-op=\"remove\"]')"
            if not box_of(page, js):
                check("맡은 당번에서 빠짐 · %s — 누를 수 있다" % name, False)
                continue
            bring(page, js, touch, w, h)
            s0 = st(page)
            press(page, box_of(page, js), touch)
            dlg_ok(page, touch)
            after_reload(page, s0["rosterCalls"])
            s1 = st(page)
            board = page.evaluate("() => (document.querySelector('.dty-board') || {}).textContent || ''")
            check("맡은 당번에서 빠짐 → 남은 당번 · %s — 남은 당번의 판이 보인다(빈 화면 아님)" % name, "탐침 2" in board and s1["inView"] > 150 and not s1["grow"],
                  "%s · 보임 %d · min-height %r · 굴린 자리 %d→%d" % (board[:20], s1["inView"], s1["grow"], s0["sy"], s1["sy"]))
        finally:
            ctx.close()


def run_dateadd(p, sizes):
    for size in sizes:
        name, w, h, touch = size
        ctx, page, touch = p.open(w, h, touch, "?bs=thin")
        try:
            js = "document.querySelector('[data-act=\"date-add\"]')"
            bring(page, js, touch, w, h, 0.12)
            s0 = st(page)
            press(page, box_of(page, js), touch)
            page.wait_for_selector(".be-modal [data-date]", timeout=4000); page.wait_for_timeout(400)
            b = page.locator(".be-modal [data-date]"); (b.tap if touch else b.click)()
            page.wait_for_selector('.pk-dim [data-d="2026-10-14"]', timeout=4000); page.wait_for_timeout(400)
            d = page.locator('.pk-dim [data-d="2026-10-14"]'); (d.tap if touch else d.click)()
            page.wait_for_timeout(250)
            page.wait_for_selector(".be-modal .be-ok", timeout=4000); page.wait_for_timeout(400)
            ok = page.locator(".be-modal .be-ok"); (ok.tap if touch else ok.click)()
            after_reload(page, s0["rosterCalls"])
            s1 = st(page)
            # 폰에서는 달력 아래에 판이 있다 — 「날짜 더하기」 단추는 달력 위에 있어, 누른 자리에서는 달력(더한 날이 골라져 있다)과 판의 머리만 보이거나
            #   작은 폰(360×640)에서는 달력만 보인다(운영하던 판도 같다 · 날짜 더하기는 굴리지 않는다). 빈 화면이 아니면 된다: 새 판이 보이거나, 더한 날이 골라진 달력 칸이 보인다.
            on = page.evaluate("""() => { const x = document.querySelector('.dty-cal-c.on'); if (!x) return null; const r = x.getBoundingClientRect();
              return { day: x.dataset.day, seen: r.top >= 56 && r.bottom <= innerHeight }; }""")
            check("날짜 더하기 · %s — 더한 날(10/14)의 판이나 그날이 골라진 달력이 보인다" % name,
                  "10월 14일" in s1["bar"] and not s1["grow"] and not s1["modal"] and (s1["inView"] > 40 or bool(on and on["day"] == "2026-10-14" and on["seen"])),
                  "%s · 판 보임 %d · 달력의 고른 칸 %s · min-height %r" % (s1["bar"], s1["inView"], on, s1["grow"]))
        finally:
            ctx.close()


# ── ④ 같은 날을 다시 그리는 저장 — 굴린 자리 그대로 ──
def run_sameday(p, sizes):
    for size in sizes:
        name, w, h, touch = size
        ctx, page, touch = p.open(w, h, touch, "?bs=full")
        try:
            js = (SLOT % 4) + ".querySelector('[data-op=\"remove\"]')"
            bring(page, js, touch, w, h)
            s0 = st(page)
            press(page, box_of(page, js), touch)
            dlg_ok(page, touch)
            after_reload(page, s0["rosterCalls"])
            s1 = st(page)
            check("같은 날의 빼기 · %s — 굴린 자리 그대로" % name, abs(s1["sy"] - s0["sy"]) < 1.5 and s1["bar"] == s0["bar"], "%d→%d" % (s0["sy"], s1["sy"]))
        finally:
            ctx.close()


# ── ⑤ 붙은 달력(PC) — 날짜·달 단추를 눌러도 달력은 제자리 · 그날 판은 붙은 선에서 ──
def run_sticky(p, sizes):
    for name, w, h, touch in [s for s in sizes if not s[3] and s[2] >= 760]:
        for how in ("마우스", "자판"):
            ctx, page, _ = p.open(w, h, False, "?bs=thin")
            try:
                scroll_by(page, 700, False, w, h)
                s0 = st(page)
                if s0["calPos"] != "sticky" or not s0["cal"] or abs(s0["cal"]["t"] - LINE) > 1.5:
                    check("붙은 달력 · %s — 달력이 머리줄 아래에 붙어 있다" % name, False, "%s · 달력 위 %s" % (s0["calPos"], s0["cal"] and s0["cal"]["t"]))
                    continue
                for what, sel in (("날짜(11/1)", '.dty-cal-c[data-day="2026-10-25"]'), ("달 단추(▶)", ".dty-cal-nav.r")):
                    b = box_of(page, "document.querySelector('%s')" % sel)
                    if how == "마우스":
                        press(page, b, False)
                    else:
                        page.evaluate("(s) => document.querySelector(s).focus({ preventScroll: true })", sel)
                        page.keyboard.press("Enter")
                    page.wait_for_timeout(350)
                    s1 = st(page)
                    check("붙은 달력 · %s · %s · %s — 달력은 제자리 · 그날 판은 붙은 선에서" % (name, how, what),
                          s1["cal"] and abs(s1["cal"]["t"] - LINE) < 1.5 and s1["day"] and abs(s1["day"]["t"] - LINE) < 1.5,
                          "달력 위 %s · 판 위 %s · 굴린 자리 %d→%d" % (s1["cal"] and round(s1["cal"]["t"]), s1["day"] and round(s1["day"]["t"]), s0["sy"], s1["sy"]))
            finally:
                ctx.close()


# ── ⑥ 떼어진 화면 — 늦게 온 그리기가 지금 보이는 다른 메뉴를 굴리지 않는다 ──
def run_detached(p, sizes):
    for name, w, h, touch in sizes:
        ctx, page, touch = p.open(w, h, touch, "?bs=thin")
        try:
            page.evaluate("() => { window.__other(); window.__lat = 1200; window.__route(); }")   # 명단 메뉴를 다시 연다(불러오는 중…)
            page.wait_for_timeout(200)
            page.evaluate("() => window.__other()")                                                # 답이 오기 전에 다른 메뉴로
            page.evaluate("() => window.scrollTo(0, 500)")
            page.wait_for_timeout(300)
            y0 = page.evaluate("() => scrollY")
            page.wait_for_function("() => window.__routed >= 1", timeout=10000)
            page.wait_for_timeout(300)
            y1 = page.evaluate("() => scrollY")
            check("불러오는 중에 다른 메뉴로 · %s — 늦게 온 처음 그리기가 그 메뉴를 굴리지 않는다" % name, y0 == 500 and y1 == y0, "%s → %s" % (y0, y1))
        finally:
            ctx.close()
        ctx, page, touch = p.open(w, h, touch, "?bs=thin")
        try:
            js = (SLOT % 1) + ".querySelector('[data-op=\"move\"]')"
            bring(page, js, touch, w, h)
            n = st(page)["rosterCalls"]
            press(page, box_of(page, js), touch)
            page.wait_for_selector(".pk-dim .pk-opt", timeout=4000); page.wait_for_timeout(400)
            page.evaluate("() => { window.__lat = 1200; }")
            opt = page.locator(".pk-opt", has_text="11월 1일").first
            opt.scroll_into_view_if_needed(); (opt.tap if touch else opt.click)()
            page.wait_for_timeout(200)
            page.evaluate("() => window.__other()")
            page.evaluate("() => window.scrollTo(0, 500)")
            page.wait_for_timeout(300)
            y0 = page.evaluate("() => scrollY")
            after_reload(page, n)
            page.wait_for_timeout(1500)                                                            # 명단을 다시 읽은 답(1.2초)과 그리기
            y1 = page.evaluate("() => scrollY")
            check("「옮기기」 저장 중에 다른 메뉴로 · %s — 늦게 온 다시 그리기가 그 메뉴를 굴리지 않는다" % name, y0 == 500 and y1 == y0, "%s → %s" % (y0, y1))
        finally:
            ctx.close()


# ── ⑦ 큰 화면의 짧은 명단 — 묶음을 늘리지 않는다(늘리면 문서가 화면보다 길어져 없던 굴림줄이 생긴다) ──
def run_short(p, sizes):
    for name, w, h in (("PC1920x1080", 1920, 1080), ("PC1280x900", 1280, 900)):
        ctx, page, _ = p.open(w, h, False, "?bs=small")
        try:
            s0 = st(page)
            fits = s0["docH"] <= s0["vh"]
            for sel in (".dty-cal-nav.r", '.dty-cal-c.has:not(.on)', ".dty-cal-nav.l"):
                b = box_of(page, "document.querySelector('%s')" % sel)
                if b:
                    press(page, b, False)
                    page.wait_for_timeout(300)
            s1 = st(page)
            check("짧은 명단 · %s — 처음 그리기와 달·날짜 누름 뒤에도 묶음을 늘리지 않는다" % name, not s0["grow"] and not s1["grow"] and (not fits or s1["docH"] <= s1["vh"]),
                  "min-height %r → %r · 문서 %d/%d → %d/%d" % (s0["grow"], s1["grow"], s0["docH"], s0["vh"], s1["docH"], s1["vh"]))
        finally:
            ctx.close()


RUNS = {"move": run_move, "same": run_same, "reject": run_reject, "lost": run_lost, "dateadd": run_dateadd, "sameday": run_sameday, "sticky": run_sticky, "detached": run_detached, "short": run_short}
SIZES = [("폰390x844", 390, 844, True), ("폰360x640", 360, 640, True), ("PC1280x900", 1280, 900, False), ("PC1366x650", 1366, 650, False), ("판820x1180", 820, 1180, True)]


def main():
    ap = argparse.ArgumentParser(description="당번 명단의 화면 자리를 진짜 브라우저에서 잰다(가짜 서버 · 어디에도 쓰지 않는다)")
    ap.add_argument("--engine", default="chrome", choices=["chrome", "webkit", "firefox"])
    ap.add_argument("--quick", action="store_true", help="크기 둘(폰 390×844 · PC 1280×900)만")
    ap.add_argument("--only", default="", help="돌릴 묶음(쉼표) — " + ",".join(RUNS))
    a = ap.parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright 가 없습니다 — pip install playwright")
        return 2
    want = [k for k in (a.only.split(",") if a.only else RUNS) if k]
    bad = [k for k in want if k not in RUNS]
    if bad:
        print("모르는 묶음: %s — 쓸 수 있는 것: %s" % (",".join(bad), ",".join(RUNS)))
        return 2
    sizes = [s for s in SIZES if not a.quick or s[0] in ("폰390x844", "PC1280x900")]
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)   # 포트 0 = OS 가 빈 포트를 고른다(다른 세션의 서버와 겹치지 않는다)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d/" % httpd.server_address[1]
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True) if a.engine == "chrome" else getattr(pw, a.engine).launch(headless=True)
            p = Probe(browser, base, a.engine)
            for k in want:
                before = len(results)
                try:
                    RUNS[k](p, sizes)
                except Exception as x:   # 한 묶음이 멈춰도 나머지는 돈다 — 멈춘 것은 실패로 센다
                    check("%s — 끝까지 돌았다" % k, False, str(x)[:300].replace("\n", " "))
                got = results[before:]
                print("%-9s %d가지 가운데 %d가지 통과" % (k, len(got), sum(1 for _, ok in got if ok)), flush=True)
            browser.close()
    finally:
        httpd.shutdown()   # 내가 띄운 서버만(같은 프로세스 안의 스레드)
    check("JS 오류 없음", not errs, errs[:3])
    check("바깥으로 나간 요청 없음", not outside, outside[:3])
    ok = sum(1 for _, v in results if v)
    print("\n%s — %d가지 가운데 %d가지 통과" % (a.engine, len(results), ok))
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
