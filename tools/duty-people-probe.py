# -*- coding: utf-8 -*-
# 👥 봉사자 화면(js/menus/duty/people.js · person-window.js)과 📅 당번 명단의 이름 단추를 **진짜 브라우저**에서 재고 눌러 본다(2026-10-07 · 독립 검토 반영 2026-10-08).
#   하는 일: 작업 폴더를 127.0.0.1 에 띄우고(포트는 OS 가 고른다 · 탐침 화면은 메모리에서 준다) 진짜 화면 모듈을 **가짜 서버**(페이지 안의 메모리)로 그린 뒤
#     폭마다 사람처럼 눌러 본다. 어디에도 쓰지 않는다 · 로그인하지 않는다 · 바깥으로 나가는 요청이 하나라도 있으면 실패 · 이름은 가짜(성도N).
#   재는 것: ① 가로로 넘치지 않는가(문서 · 줄 · 위 단추 · 이력 창) ② 위 단추가 누를 만한가(40px) · 긴 당번 이름의 말줄임 ③ 찾기(띄어쓰기 무시 · 글자 칸에 초점 ·
#            숨긴 분도 찾으면 나온다) · 차례(이름순) · 당번 하나로 좁히기(서버에 board_id · 안내 글의 범위) · 숨긴 분 「함께 보기」
#            ④ 줄을 누르면 이력 창 — 범위 한 줄 · 묶음의 수는 서버가 센 수 · 같은 자리 두 줄은 한 번 · 세모 단추로 「빠진 기록」 펼치기 · 잘린 줄 안내 ·
#            창 본문에 초점 · 넓혀 보기(board_id 없이 다시 · 초점이 본문에 남는다) · 닫으면 누른 줄로 초점
#            ⑤ 엑셀(가짜 SheetJS — 파일 이름 · 시트 둘 · 내려받은 뒤의 말) ⑥ 못 불러오면 「다시 불러오기」 · 맡은 당번에서 빠지면 목록부터 다시 · 불러오는 동안 단추 잠금 ·
#            늦게 온 답이 떼어진 화면에 창을 띄우지 않는다 ⑦ 당번 명단의 이름(서 있는 분 · 빠진 분)을 누르면 같은 이력 창이 board_id 없이 열린다 · 줄 높이는 예전 그대로.
#   준비물: python 3 + playwright. 크롬은 PC 에 깔린 것(channel="chrome") · 사파리 엔진·파이어폭스는 `python -m playwright install webkit firefox`.
#   쓰는 법: python tools/duty-people-probe.py [--engine chrome|webkit|firefox] [--shots 폴더] — 끝에 「N가지 가운데 N가지 통과」 · 하나라도 실패면 종료 코드 1.
#     --shots 를 주면 크기마다 목록·이력 창 화면을 그 폴더에 찍는다(저장소 밖에 둘 것 — 가짜 이름이어도 그림은 커밋하지 않는다).
import argparse, http.server, pathlib, sys, threading

sys.stdout.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parent.parent
TODAY = "2026-10-07"

PAGE = r"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>봉사자 화면 탐침</title>
<link rel="stylesheet" href="css/tokens.css"><link rel="stylesheet" href="css/admin.css"></head>
<body><div id="app">
<header class="top"><button type="button" class="icon-btn menu" aria-label="메뉴 열기">☰</button><h1>고척교회 관리</h1><span class="who">탐침</span><button type="button" class="out">로그아웃</button></header>
<nav class="nav" aria-label="메뉴"><a href="#/" data-id="">🏠 처음</a><div class="nav-g"><h3>봉사 당번</h3><a class="on" href="#/duty-people">👥 봉사자</a></div></nav>
<div class="nav-dim" hidden></div><main class="view" id="view"></main></div>
<script type="module">
const P = new URLSearchParams(location.search), MODE = P.get("m") || "people", TODAY = "__TODAY__";
// fail = 처음 몇 번 실패할 액션(「이름:횟수」) · lose = 한 번 not-assigned 로 답할 액션 · lat = 답이 오기까지(ms)
window.__calls = []; window.__file = null; window.__lat = Number(P.get("lat") || 30); window.__lose = P.get("lose") || "";
const FAIL = Object.fromEntries((P.get("fail") || "").split(",").filter(Boolean).map((x) => { const [k, n] = x.split(":"); return [k, Number(n || 1)]; }));
// 가짜 SheetJS — loadXlsx 는 window.XLSX 가 있으면 그것을 쓴다(파일을 받으러 나가지 않는다)
window.XLSX = { utils: { book_new: () => ({ s: [] }), aoa_to_sheet: (a) => ({ rows: a.length }), book_append_sheet: (wb, s, n) => wb.s.push([n, s.rows]) },
  writeFile: (wb, name) => { window.__file = { name, sheets: wb.s }; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BOARDS = [{ id: "b-open", title: "식당 봉사", status: "open", statusLabel: "받는 중" },
  { id: "b-arch", title: "옛 주차 봉사", status: "archived", statusLabel: "보관" },
  { id: "b-draft", title: "김장 봉사(아주 긴 당번 이름이 들어가면 단추가 어떻게 보이는지 보는 줄)", status: "draft", statusLabel: "준비 중" }];
// 40분은 선 날이 있고, 뒤의 3분은 선 날도 앞날도 없다(취소·빠짐만 — 기본으로 숨는다)
const people = Array.from({ length: 43 }, (_, i) => (i >= 40 ? { id: 5000 + i, name: "취소한분" + (i - 39), who: "화평 2목장", hasApp: true, directory: false, served: 0, inYear: 0, upcoming: 0, last: null, next: null }
  : { id: 5000 + i,
    name: i === 3 ? "가나다라마바사아자차카타파하가나다라마바사" : "성도" + (i + 1),
    who: i % 5 === 0 ? "" : i === 7 ? "유년부 아주긴부서이름학년반 선생님 모임" : "기쁨 " + ((i % 9) + 1) + "목장",
    hasApp: i % 3 !== 0, directory: i % 4 === 0, served: 40 - i, inYear: Math.max(0, 20 - i), upcoming: i % 6 === 0 ? 0 : i % 4,
    last: i === 39 ? null : i === 1 ? TODAY : "2026-10-04", next: i % 6 === 0 || i % 4 === 0 ? null : i === 1 ? TODAY : "2026-10-11" }));
const R = (o) => ({ board: "식당 봉사", boardStatus: "open", service: "2부", task: "설거지", start: "11:30", end: "12:30", why: null, off: false, asked: false, askWhy: null,
  moved: false, source: "app", ...o });
const hist = (id, narrowed) => ({ ok: true, today: TODAY, year: 2026, scope: "all", narrowed, boards: narrowed ? 1 : 3,
  person: { name: (people.find((p) => p.id === id) || { name: "성도" + id }).name, who: "기쁨 3목장", hasApp: true, directory: true },
  served: 3, inYear: 3, upcoming: 1, total: 450, rows: [
    R({ id: 9, date: "2026-11-01", board: "옛 주차 봉사", boardStatus: "archived", kind: "missed", why: "archived" }),
    R({ id: 1, date: "2026-10-18", kind: "upcoming", off: true, asked: true, askWhy: "cant" }),
    R({ id: 2, date: "2026-10-11", kind: "upcoming" }),
    R({ id: 3, date: "2026-10-04", kind: "served", source: "staff", moved: true }),
    R({ id: 4, date: "2026-10-04", kind: "served" }),
    R({ id: 5, date: "2026-09-27", board: "옛 주차 봉사(아주 긴 당번 이름 — 줄이 넘치지 않는지)", boardStatus: "archived", service: "주차 안내", task: "정문 앞 아주 긴 일 이름",
      start: "07:00", end: "08:00", kind: "served" }),
    R({ id: 6, date: "2025-12-28", kind: "served", boardStatus: "draft", board: "김장 봉사" }),
    R({ id: 7, date: "2026-09-13", kind: "missed", why: "self" }),
    R({ id: 8, date: "2026-09-06", kind: "missed", why: "staff" }),
  ] });
const ROSTER = { ok: true, chief: true, appOpen: false, today: TODAY, staff: [],
  lines: [{ id: 1, active: true, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 3, weekday: 0, sort: 0 }],
  board: { id: "b-open", title: "식당 봉사", status: "open", statusLabel: "받는 중", openDays: 56, untilDate: "", place: "1층 식당", contact: "", maxAhead: null },
  days: [{ date: "2026-10-11", off: false, note: "", confirmed: false, locked: false, cutoff: "2026-10-10T10:00:00Z", past: false, afterUntil: false, notYet: false, asks: 0, need: 1,
    slots: [{ id: 77, lineId: 1, service: "2부", task: "설거지", start: "11:30", end: "12:30", capacity: 3, off: false, leftover: false,
      signups: [{ id: 801, name: "성도1", who: "기쁨 3목장", source: "app", hasApp: true, hasPush: true },
        { id: 802, name: "아주아주긴이름을가진성도님입니다아주아주긴이름", who: "유년부 2학년", source: "staff", hasApp: false, hasPush: false }],
      ended: [{ id: 803, name: "뺀성도", who: "", reason: "staff" }] }] }] };
const call = async (action, body = {}) => {
  window.__calls.push([action, body]);
  await wait(window.__lat);
  if (FAIL[action] > 0) { FAIL[action]--; return { ok: false, error: "network" }; }
  if (window.__lose === action) { window.__lose = ""; return { ok: false, error: "not-assigned" }; }
  if (action === "dutyBoardList") return { ok: true, scope: "all", chief: true, today: TODAY, appOpen: false, boards: MODE === "roster" ? BOARDS.slice(0, 1) : BOARDS };
  if (action === "dutyPeople") return { ok: true, today: TODAY, year: body.year || 2026, people: body.board_id ? people.slice(0, 12) : people,
    scope: "all", narrowed: !!body.board_id, boards: body.board_id ? 1 : 3 };
  if (action === "dutyPersonHistory") return hist(body.signup_id, !!body.board_id);
  if (action === "dutyPeopleExport") return { ok: true, today: TODAY, year: 2026, count: 40, hidden: 3, scope: "all", narrowed: !!body.board_id, boards: body.board_id ? 1 : 3,
    sheet: [["이름", "소속", "2026년", "지금까지", "마지막으로 선 날", "앞으로"], ...people.slice(0, 40).map((p) => [p.name, p.who, p.inYear, p.served, p.last || "", p.upcoming])],
    info: [["범위", "모든 당번 3개"], ["기준일", TODAY], ["횟수의 해", "2026년"], ["지금까지", "뜻"], ["앞으로", "뜻"], ["이 파일에 없는 분", "3분"], ["성도님 앱과 다른 점", "뜻"]] };
  if (action === "dutyRoster") return structuredClone(ROSTER);
  return { ok: false, error: "unknown-action" };
};
const { render } = await import(MODE === "roster" ? "./js/menus/duty/roster.js" : "./js/menus/duty/people.js");
const host = document.createElement("section");
document.getElementById("view").replaceChildren(host);
// 다른 메뉴로 옮기는 것을 흉내 낸다(main.js route 처럼 화면 판을 갈아 끼운다)
window.__other = () => { const o = document.createElement("section"); o.id = "other"; o.innerHTML = '<h2 class="page-title">다른 메뉴(가짜)</h2>'; document.getElementById("view").replaceChildren(o); };
await render(host, { call, query: {} });
window.__ready = true;
</script></body></html>
"""

SIZES = [("폰280x640", 280, 640, True), ("폰320x568", 320, 568, True), ("폰360x740", 360, 740, True), ("폰390x844", 390, 844, True),
         ("폰430x932", 430, 932, True), ("태블릿768x1024", 768, 1024, True), ("PC1280x900", 1280, 900, False), ("PC1920x1080", 1920, 1080, False)]

# 가로로 넘치는 것 — 문서 · 그리고 고른 것들 하나하나(오른쪽 끝이 화면 밖 · 안의 글이 상자보다 넓다)
OVER = """(sel) => { const W = innerWidth, de = document.documentElement, bad = [];
  if (de.scrollWidth > W + 1) bad.push('문서 ' + de.scrollWidth + '>' + W);
  for (const e of document.querySelectorAll(sel)) { const r = e.getBoundingClientRect(); if (r.width === 0) continue;
    if (r.right > W + 1 || r.left < -1) bad.push((e.className || e.tagName) + ' 화면 밖 ' + Math.round(r.left) + '~' + Math.round(r.right));
    if (e.scrollWidth > e.clientWidth + 1) bad.push((e.className || e.tagName) + ' 안이 넘침 ' + e.scrollWidth + '>' + e.clientWidth); }
  return bad.slice(0, 4); }"""
FOCUS = "() => { const a = document.activeElement; return a ? (a.className || a.tagName) + '' : ''; }"


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css"}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def do_GET(self):
        if self.path.split("?")[0] == "/__people_probe.html":
            body = PAGE.replace("__TODAY__", TODAY).encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body)))
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


def open_page(browser, base, engine, w, h, touch, mode, query=""):
    touch = touch and engine != "firefox"
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if touch else 1, is_mobile=touch, has_touch=touch, locale="ko-KR",
                              reduced_motion="reduce", service_workers="block")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errs.append(str(e)[:300]))
    page.on("request", lambda r: outside.append(r.url[:160]) if not r.url.startswith(base) else None)
    page.goto(base + "__people_probe.html?m=" + mode + query, wait_until="networkidle")
    page.wait_for_function("() => window.__ready === true", timeout=20000)
    return ctx, page, touch


def tap(page, loc, touch):
    loc.scroll_into_view_if_needed()
    (loc.tap if touch else loc.click)()


def pick(page, touch, text):
    page.wait_for_selector(".pk-dim .pk-opt", timeout=4000)
    page.wait_for_timeout(400)          # 창이 뜬 직후의 누름은 무시된다(두 번 누르는 버릇 막기)
    tap(page, page.locator(".pk-opt", has_text=text).first, touch)
    page.wait_for_selector(".pk-dim", state="detached", timeout=4000)


def last_call(page, action):
    return page.evaluate("(a) => { const c = window.__calls.filter((x) => x[0] === a); return c.length ? c[c.length - 1][1] : null; }", action)


def count_calls(page, action):
    return page.evaluate("(a) => window.__calls.filter((x) => x[0] === a).length", action)


def wait_window(page):
    page.wait_for_selector(".be-modal .dpp-tot", timeout=4000)
    page.wait_for_timeout(400)          # 창이 뜬 뒤 300ms 동안의 누름은 창이 받지 않는다(두 번 누름 막기 · modal.js)


def run_people(browser, base, engine, shots):
    for name, w, h, touch0 in SIZES:
        ctx, page, touch = open_page(browser, base, engine, w, h, touch0, "people")
        try:
            n = page.locator(".dpp-row").count()
            check("%s 목록 40줄(선 날도 앞날도 없는 3분은 숨김)" % name, n == 40, n)
            note = page.locator(".be-note").first.inner_text()
            check("%s 안내 — 모든 당번 · 오늘 끝난 자리도 바로" % name, note.startswith("모든 당번의 기록을") and "오늘 끝난 자리도 바로" in note, note[:60])
            idle = page.locator(".dpp-idle").inner_text()
            check("%s 숨긴 분 안내 「3분 … 숨겼어요」" % name, "3분" in idle and "숨겼어요" in idle, idle)
            bad = page.evaluate(OVER, ".dpp-row, .dpp-top .btn, .dpp-q, .be-note, .dpp-split, .dpp-idle")
            check("%s 목록이 가로로 넘치지 않는다" % name, not bad, bad)
            small = page.evaluate("() => [...document.querySelectorAll('.dpp-top .btn, .dpp-idleb')].filter((b) => b.getBoundingClientRect().height < 40).map((b) => b.textContent.trim())")
            check("%s 단추 높이 40px 이상" % name, not small, small)
            check("%s 해 고르기 단추는 해가 하나면 없다" % name, page.locator('[data-act="year"]').count() == 0)
            second = page.locator(".dpp-row .dpp-cnt").nth(1).inner_text()
            check("%s 오늘 선 분 — 「마지막 오늘」·「오늘부터」" % name, "마지막 오늘" in second and "(오늘부터)" in second, second)
            if shots:
                page.screenshot(path=str(pathlib.Path(shots) / ("people-%s-%s.png" % (engine, name))), full_page=False)
            # 숨긴 분 — 함께 보기(43줄 · 단추에 초점이 남는다) → 숨기기
            tap(page, page.locator('[data-act="idle"]'), touch)
            page.wait_for_function("() => document.querySelectorAll('.dpp-row').length === 43", timeout=4000)
            check("%s 함께 보기 — 43줄 · 단추 글 「숨기기」 · 초점" % name, page.locator('[data-act="idle"]').inner_text().strip() == "숨기기" and "dpp-idleb" in page.evaluate(FOCUS), page.evaluate(FOCUS))
            tap(page, page.locator('[data-act="idle"]'), touch)
            page.wait_for_function("() => document.querySelectorAll('.dpp-row').length === 40", timeout=4000)
            # 찾기 — 「성도 1」(띄어쓰기) = 성도1 · 성도10~19 → 11분 · 글자 칸에 초점이 남는다 · 숨긴 분도 찾으면 나온다
            q = page.locator(".dpp-q")
            tap(page, q, touch)
            q.type("성도 1", delay=10)
            page.wait_for_timeout(150)
            n = page.locator(".dpp-row").count()
            check("%s 찾기 — 띄어쓰기 무시 11분" % name, n == 11, n)
            check("%s 찾기 — 수 「11분(모두 43분)」" % name, page.locator(".dpp-sum").inner_text().strip() == "11분(모두 43분)", page.locator(".dpp-sum").inner_text())
            check("%s 찾기 — 글자 칸에 초점이 남는다" % name, page.evaluate("() => document.activeElement && document.activeElement.classList.contains('dpp-q')"))
            q.fill("취소한분")
            page.wait_for_timeout(150)
            check("%s 찾기 — 숨긴 분도 찾으면 나온다(3분)" % name, page.locator(".dpp-row").count() == 3, page.locator(".dpp-row").count())
            q.fill("")
            page.wait_for_timeout(100)
            # 차례 — 이름순이면 「가나다…」가 맨 위
            tap(page, page.locator('[data-act="sort"]'), touch)
            pick(page, touch, "이름순")
            first = page.locator(".dpp-row b").first.inner_text()
            check("%s 차례 — 이름순" % name, first.startswith("가나다라"), first)
            # 당번 하나로 좁히기 — 서버에 board_id · 단추 글이 그 당번 · 안내 글의 범위도 그 당번
            tap(page, page.locator('[data-act="board"]'), touch)
            pick(page, touch, "식당 봉사")
            page.wait_for_function("() => document.querySelectorAll('.dpp-row').length === 12", timeout=4000)
            body = last_call(page, "dutyPeople")
            check("%s 좁히기 — board_id" % name, body and body.get("board_id") == "b-open", body)
            check("%s 좁히기 — 단추 글" % name, page.locator('[data-act="board"]').inner_text().strip() == "식당 봉사")
            check("%s 좁히기 — 안내 글이 「식당 봉사」 당번의 기록만" % name, page.locator(".be-note").first.inner_text().startswith("「식당 봉사」 당번의 기록만"))
            # 이력 창 — 좁힌 당번으로 열리고(범위 줄) · 묶음의 수는 서버가 센 수 · 같은 자리 두 줄은 한 번 · 빠진 기록(세모 단추) · 잘린 줄 안내 · 본문에 초점
            tap(page, page.locator(".dpp-row").first, touch)
            wait_window(page)
            body = last_call(page, "dutyPersonHistory")
            check("%s 이력 — 좁힌 당번으로 연다" % name, body and body.get("board_id") == "b-open" and body.get("signup_id") == 5003, body)
            scope = page.locator(".be-modal .dpp-scope span").first.inner_text()
            check("%s 이력 — 범위 줄 「식당 봉사」 당번의 기록만" % name, scope == "「식당 봉사」 당번의 기록만 보고 있어요", scope)
            check("%s 이력 — 창 본문에 초점" % name, "be-body" in page.evaluate(FOCUS), page.evaluate(FOCUS))
            secs = page.evaluate("() => [...document.querySelectorAll('.be-modal .dpp-sec')].map((x) => x.textContent.replace(/\\s+/g, ' ').trim())")
            check("%s 이력 — 묶음의 수는 서버가 센 수(앞으로 1 — 쉼 줄은 빼고 · 섰던 날 3)" % name, secs == ["앞으로 1", "섰던 날 3"], secs)
            rows = page.evaluate("() => [document.querySelectorAll('.be-modal .dpp-hr.upcoming').length, document.querySelectorAll('.be-modal .dpp-hr.served').length]")
            check("%s 이력 — 줄은 앞으로 둘(쉼 줄 포함) · 섰던 날 셋(같은 자리 두 줄은 한 번)" % name, rows == [2, 3], rows)
            dates = page.evaluate("() => [...document.querySelectorAll('.be-modal .dpp-hr.served .dpp-d')].map((x) => x.textContent)")
            check("%s 이력 — 지난 해의 날짜에는 해" % name, dates and dates[-1] == "2025년 12월 28일(일)", dates)
            fold = page.locator(".be-modal .dpp-foldb")
            check("%s 이력 — 「▸ 빠진 기록 3」 단추(접힌 채)" % name, fold.inner_text().replace("\n", " ").split() == ["▸", "빠진", "기록", "3"] and fold.get_attribute("aria-expanded") == "false"
                  and not page.locator(".be-modal .dpp-foldc").is_visible(), fold.inner_text())
            check("%s 이력 — 잘린 줄 안내" % name, "모두 450줄" in page.locator(".be-modal .dpp-cut").inner_text())
            tap(page, fold, touch)
            page.wait_for_timeout(150)
            #   (사파리 엔진은 누른 단추에 초점을 주지 않는다 — 초점이 창 안(그 단추나 본문)에 남아 있으면 된다 · 다시 그리지 않으니 뒤 화면으로 떨어지지 않는다)
            check("%s 이력 — 펼치면 ▾ · aria-expanded · 초점은 창 안" % name, fold.inner_text().strip().startswith("▾") and fold.get_attribute("aria-expanded") == "true"
                  and page.locator(".be-modal .dpp-foldc").is_visible() and ("dpp-foldb" in page.evaluate(FOCUS) or "be-body" in page.evaluate(FOCUS)), page.evaluate(FOCUS))
            bad = page.evaluate(OVER, ".be-box, .be-modal .dpp-hr, .be-modal .dpp-scope, .be-modal .dpp-tot, .be-modal .dpp-foldb")
            check("%s 이력 창이 가로로 넘치지 않는다" % name, not bad, bad)
            whys = page.evaluate("() => [...document.querySelectorAll('.be-modal .dpp-why')].map((x) => x.textContent)")
            check("%s 이력 — 빠진 기록의 까닭" % name, whys == ["보관한 당번이라 서지 않는 날이에요", "본인이 취소했어요", "담당자가 뺐어요"], whys)
            if shots:
                page.screenshot(path=str(pathlib.Path(shots) / ("history-%s-%s.png" % (engine, name))), full_page=False)
            tap(page, page.locator('.be-modal [data-act="all"]'), touch)
            page.wait_for_function("() => !document.querySelector('.be-modal [data-act=\"all\"]')", timeout=4000)
            body = last_call(page, "dutyPersonHistory")
            check("%s 이력 — 넓혀 보기(board_id 없이)" % name, body and "board_id" not in body and body.get("signup_id") == 5003, body)
            scope = page.locator(".be-modal .dpp-scope span").first.inner_text()
            check("%s 이력 — 넓힌 뒤 범위 줄 · 펼쳐 둔 「빠진 기록」은 그대로 · 초점은 본문" % name, scope == "모든 당번(3개)의 기록이에요" and page.locator(".be-modal .dpp-foldc").is_visible()
                  and "be-body" in page.evaluate(FOCUS), [scope, page.evaluate(FOCUS)])
            tap(page, page.locator(".be-modal .be-cancel"), touch)
            page.wait_for_selector(".be-modal", state="detached", timeout=4000)
            page.wait_for_timeout(250)
            check("%s 이력 창이 닫히면 초점은 누른 줄" % name, page.locator(".be-modal").count() == 0 and "dpp-row" in page.evaluate(FOCUS), page.evaluate(FOCUS))
            # 엑셀 — 좁힌 당번 · 파일 이름 · 시트 둘 · 내려받은 뒤의 말
            tap(page, page.locator('[data-act="export"]'), touch)
            page.wait_for_function("() => !!window.__file", timeout=4000)
            f = page.evaluate("() => window.__file")
            check("%s 엑셀 — 파일 이름 · 시트 둘(봉사자 · 안내)" % name, f["name"] == "봉사자_2026년_식당 봉사_2026-10-07.xlsx" and f["sheets"] == [["봉사자", 41], ["안내", 7]], f)
            check("%s 엑셀 — 좁힌 당번으로" % name, (last_call(page, "dutyPeopleExport") or {}).get("board_id") == "b-open")
            page.wait_for_selector(".adm-toast", timeout=3000)
            toast = page.locator(".adm-toast").last.inner_text()
            check("%s 엑셀 — 「40분을 내려받았어요 — … 3분은 뺐어요」" % name, toast.startswith("40분을 내려받았어요") and "3분은 뺐어요" in toast, toast)
            # 긴 당번 이름 — 단추 안에서 말줄임(넘치지 않는다) · 다 보이는 글은 title · 폰에서도 당번·차례 단추가 한 줄
            tap(page, page.locator('[data-act="board"]'), touch)
            pick(page, touch, "김장 봉사")
            page.wait_for_function("() => (document.querySelector('[data-act=\"board\"]') || {}).title?.startsWith('김장 봉사')", timeout=4000)
            bad = page.evaluate(OVER, ".dpp-top .btn")   # 말줄임 글(.dpp-pick-t) 자체는 일부러 넘친 채 잘린다 — 단추가 안 넘치면 된다
            check("%s 긴 당번 이름 — 위 단추가 넘치지 않는다" % name, not bad, bad)
            same = page.evaluate("() => { const a = document.querySelector('[data-act=\"board\"]').getBoundingClientRect(), b = document.querySelector('[data-act=\"sort\"]').getBoundingClientRect(); return Math.abs(a.top - b.top) < 1; }")
            check("%s 당번·차례 단추가 한 줄" % name, same)
        finally:
            ctx.close()


def run_flows(browser, base, engine, shots):
    """못 불러옴 · 맡은 당번에서 빠짐 · 불러오는 동안 잠금 · 늦게 온 답 — 크기 둘에서"""
    for name, w, h, touch0 in [s for s in SIZES if s[0] in ("폰390x844", "PC1280x900")]:
        # ① 처음에 당번 목록을 못 불러옴 → 「다시 불러오기」 단추 → 누르면 목록
        ctx, page, touch = open_page(browser, base, engine, w, h, touch0, "people", "&fail=dutyBoardList:1")
        try:
            check("%s 못 불러오면 「다시 불러오기」 단추" % name, page.locator('[data-act="retry"]').count() == 1 and page.locator(".dpp-row").count() == 0)
            tap(page, page.locator('[data-act="retry"]'), touch)
            page.wait_for_function("() => document.querySelectorAll('.dpp-row').length === 40", timeout=5000)
            check("%s 다시 불러오기 → 목록" % name, True)
        except Exception as x:
            check("%s 다시 불러오기 → 목록" % name, False, str(x)[:160])
        finally:
            ctx.close()
        # ② 사람 목록을 못 불러옴(당번 목록은 옴) → 같은 단추
        ctx, page, touch = open_page(browser, base, engine, w, h, touch0, "people", "&fail=dutyPeople:1")
        try:
            check("%s 사람 목록을 못 불러와도 「다시 불러오기」" % name, page.locator('[data-act="retry"]').count() == 1)
            tap(page, page.locator('[data-act="retry"]'), touch)
            page.wait_for_function("() => document.querySelectorAll('.dpp-row').length === 40", timeout=5000)
        except Exception as x:
            check("%s 사람 목록 다시 불러오기" % name, False, str(x)[:160])
        finally:
            ctx.close()
        # ③ 당번을 좁히려다 실패(끊김) → 단추 글과 목록이 그대로(어긋나지 않는다)
        ctx, page, touch = open_page(browser, base, engine, w, h, touch0, "people")
        try:
            tap(page, page.locator('[data-act="board"]'), touch)
            # 다음 dutyPeople 한 번을 not-assigned 로 답하게 한다(그 당번에서 그사이 빠졌다 → 말한 대로 목록부터 다시 불러온다)
            page.evaluate("() => { window.__lose = 'dutyPeople'; }")
            before = count_calls(page, "dutyBoardList")
            pick(page, touch, "식당 봉사")
            page.wait_for_function("(n) => window.__calls.filter((x) => x[0] === 'dutyBoardList').length > n", arg=before, timeout=5000)
            page.wait_for_function("() => document.querySelectorAll('.dpp-row').length === 40", timeout=5000)
            check("%s 좁히려던 당번에서 빠졌으면 — 목록부터 다시 · 단추 글은 보던 범위 그대로" % name, page.locator('[data-act="board"]').inner_text().strip() == "모든 당번"
                  and page.locator(".be-note").first.inner_text().startswith("모든 당번의 기록을"), page.locator('[data-act="board"]').inner_text())
            # ④ 이력 창을 열려는데 맡은 당번에서 빠짐 → 창은 안 뜨고 목록부터 다시
            page.evaluate("() => { window.__lose = 'dutyPersonHistory'; }")
            before = count_calls(page, "dutyBoardList")
            tap(page, page.locator(".dpp-row").first, touch)
            page.wait_for_function("(n) => window.__calls.filter((x) => x[0] === 'dutyBoardList').length > n", arg=before, timeout=5000)
            page.wait_for_timeout(300)
            check("%s 이력 창 — 맡은 당번에서 빠졌으면 창 없이 목록부터 다시" % name, page.locator(".be-modal").count() == 0 and page.locator(".dpp-row").count() == 40)
            # ⑤ 불러오는 동안 줄·단추가 잠긴다(받는 중 표시 · 두 번 누름 · 다른 줄 누름이 겹치지 않는다)
            page.evaluate("() => { window.__lat = 900; }")
            before = count_calls(page, "dutyPersonHistory")
            tap(page, page.locator(".dpp-row").first, touch)
            page.wait_for_timeout(200)
            locked = page.evaluate("() => [...document.querySelectorAll('.dpp-row, .dpp-top .btn')].every((b) => b.disabled)")
            check("%s 이력을 불러오는 동안 줄·단추가 잠긴다" % name, locked)
            page.evaluate("() => { const r = document.querySelectorAll('.dpp-row')[1]; if (r) r.click(); }")
            wait_window(page)
            check("%s 그동안 다른 줄을 눌러도 창은 하나 · 부름도 한 번" % name, page.locator(".be-modal").count() == 1 and count_calls(page, "dutyPersonHistory") == before + 1, count_calls(page, "dutyPersonHistory") - before)
            tap(page, page.locator(".be-modal .be-cancel"), touch)
            page.wait_for_selector(".be-modal", state="detached", timeout=4000)
            # ⑥ 답이 오기 전에 다른 메뉴로 옮김 → 늦게 온 답이 그 메뉴 위에 창·토스트를 띄우지 않는다
            page.wait_for_timeout(300)
            tap(page, page.locator(".dpp-row").first, touch)
            page.wait_for_timeout(150)
            page.evaluate("() => window.__other()")
            page.wait_for_timeout(1400)
            check("%s 늦게 온 답 — 다른 메뉴 위에 창을 띄우지 않는다" % name, page.locator(".be-modal").count() == 0 and page.locator("#other").count() == 1)
        except Exception as x:
            check("%s 흐름(빠짐·잠금·늦은 답) — 끝까지 돌았다" % name, False, str(x)[:200].replace("\n", " "))
        finally:
            ctx.close()


def run_roster(browser, base, engine, shots):
    for name, w, h, touch0 in SIZES:
        ctx, page, touch = open_page(browser, base, engine, w, h, touch0, "roster")
        try:
            check("%s 명단 — 서 있는 분 이름 단추 둘" % name, page.locator(".dty-row .dty-name").count() == 2)
            bad = page.evaluate(OVER, ".dty-row, .dty-name, .dty-slot")
            check("%s 명단이 가로로 넘치지 않는다" % name, not bad, bad)
            # 누를 자리 — 줄 높이는 예전 그대로(명단의 화면 자리) · ::after 로 위아래 3px 밖도 그 단추가 받는다
            #   (화면 밖의 점은 elementFromPoint 가 null 을 준다 — 폰에서는 첫 자리가 화면 아래에 있으니 줄마다 가운데로 굴린 뒤 잰다)
            miss = page.evaluate("""() => [...document.querySelectorAll('.dty-row .dty-name')].filter((b) => { b.scrollIntoView({ block: 'center' });
              const r = b.getClientRects()[0]; const x = r.left + Math.min(8, r.width / 2);
              return document.elementFromPoint(x, r.top - 3) !== b || document.elementFromPoint(x, r.bottom + 3) !== b; }).length""")
            check("%s 이름 단추 — 글 위아래 3px 밖도 누를 수 있다" % name, miss == 0, miss)
            hs = page.evaluate("() => [...document.querySelectorAll('.dty-row .dty-who')].map((w) => Math.round(w.getBoundingClientRect().height))")
            check("%s 이름 줄 높이가 예전 같다(한 줄 이름 ≤ 26px)" % name, hs and hs[0] <= 26, hs)
            sel = page.evaluate("() => getComputedStyle(document.querySelector('.dty-name')).userSelect || getComputedStyle(document.querySelector('.dty-name')).webkitUserSelect")
            check("%s 이름을 끌어 고를 수 있다(user-select:text)" % name, sel == "text", sel)
            tap(page, page.locator(".dty-row .dty-name").first, touch)
            wait_window(page)
            body = last_call(page, "dutyPersonHistory")
            check("%s 명단 이름 → 이력 창(board_id 없이)" % name, body == {"signup_id": 801}, body)
            scope = page.locator(".be-modal .dpp-scope span").first.inner_text()
            check("%s 명단에서 연 창 — 범위 줄 「모든 당번(3개)의 기록」 · 넓혀 보기 단추 없음" % name, scope == "모든 당번(3개)의 기록이에요" and page.locator('.be-modal [data-act="all"]').count() == 0, scope)
            tap(page, page.locator(".be-modal .be-cancel"), touch)
            page.wait_for_selector(".be-modal", state="detached", timeout=4000)
            page.wait_for_timeout(250)
            check("%s 창이 닫히면 초점은 누른 이름" % name, "dty-name" in page.evaluate(FOCUS), page.evaluate(FOCUS))
            tap(page, page.locator(".dty-fold summary"), touch)
            page.wait_for_timeout(150)
            tap(page, page.locator(".dty-ended .dty-name"), touch)
            wait_window(page)
            body = last_call(page, "dutyPersonHistory")
            check("%s 빠진 분 이름 → 이력 창" % name, body == {"signup_id": 803}, body)
            if shots and name in ("폰360x740", "PC1280x900"):
                page.locator(".be-modal .be-cancel").click()
                page.wait_for_selector(".be-modal", state="detached", timeout=4000)
                page.screenshot(path=str(pathlib.Path(shots) / ("roster-%s-%s.png" % (engine, name))), full_page=False)
            else:
                tap(page, page.locator(".be-modal .be-cancel"), touch)
                page.wait_for_selector(".be-modal", state="detached", timeout=4000)
            # 맡은 당번에서 빠진 채 이름을 누르면 — 말한 대로 목록부터 다시 불러온다
            page.evaluate("() => { window.__lose = 'dutyPersonHistory'; }")
            before = count_calls(page, "dutyBoardList")
            tap(page, page.locator(".dty-row .dty-name").first, touch)
            page.wait_for_function("(n) => window.__calls.filter((x) => x[0] === 'dutyBoardList').length > n", arg=before, timeout=5000)
            check("%s 명단 — 맡은 당번에서 빠졌으면 목록부터 다시" % name, page.locator(".be-modal").count() == 0)
        finally:
            ctx.close()


def main():
    ap = argparse.ArgumentParser(description="👥 봉사자 화면을 진짜 브라우저에서 재고 눌러 본다(가짜 서버 · 어디에도 쓰지 않는다)")
    ap.add_argument("--engine", default="chrome", choices=["chrome", "webkit", "firefox"])
    ap.add_argument("--shots", default="", help="화면을 찍어 둘 폴더(저장소 밖)")
    a = ap.parse_args()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright 가 없습니다 — pip install playwright")
        return 2
    if a.shots:
        pathlib.Path(a.shots).mkdir(parents=True, exist_ok=True)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)   # 포트 0 = OS 가 빈 포트를 고른다(다른 세션의 서버와 겹치지 않는다)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d/" % httpd.server_address[1]
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True) if a.engine == "chrome" else getattr(pw, a.engine).launch(headless=True)
            for k, fn in (("people", run_people), ("flows", run_flows), ("roster", run_roster)):
                before = len(results)
                try:
                    fn(browser, base, a.engine, a.shots)
                except Exception as x:   # 한 묶음이 멈춰도 나머지는 돈다 — 멈춘 것은 실패로 센다
                    check("%s — 끝까지 돌았다" % k, False, str(x)[:300].replace("\n", " "))
                got = results[before:]
                print("%-7s %d가지 가운데 %d가지 통과" % (k, len(got), sum(1 for _, ok in got if ok)), flush=True)
            browser.close()
    finally:
        httpd.shutdown()   # 내가 띄운 서버만(같은 프로세스 안의 스레드)
    check("JS 오류 없음", not errs, errs[:3])
    check("바깥으로 나간 요청 없음", not outside, outside[:3])
    ok = sum(1 for _, v in results if v)
    print("%s — %d가지 가운데 %d가지 통과" % (a.engine, len(results), ok))
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
