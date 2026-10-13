// 📊 통계 — 성경암송 사용 통계 네 보기(2026-10-13 · 옛 성경암송 admin-stats.html 의 네 화면을 옮겼다). 역할 memorizeadmin.
//   ① 기간별 사용현황(stats — 구분·소속별 수 카드 · 막대 · 상세 표) ② 구절별 현황(verses — 말씀 순번마다 참여자·참여횟수)
//   ③ 도전 현황(ranking — 사람마다 타이핑·음성 · 구분·소속 거르기) ④ 축복 기도문 사용현황(blessingUsage — 많이 읽히는 편 · 누가 얼마나).
//   성경암송 api 를 교회 어드민 서버가 내부 키로 부른다(index.ts memProxy). 말씀 이름은 getVerses(앱이 로그인 없이 받는 말씀 목록 · 읽기만).
//   기간(from·to)은 네 보기가 함께 쓴다 — 날짜는 picker.js pickDate 단추(시스템 날짜 칸 금지) · 빠른 기간 「전체기간·이번 달·최근 7일」.
//   날짜를 고르거나 빠른 기간을 누르면 곧 다시 받는다 · 「조회」는 같은 기간을 새로 받는다(보기마다 받은 것을 기간과 함께 기억해 둔다).
//   ⚠️ 참여자별 세부·성도 검색은 「성도 계정」 메뉴로 — 옛 「참여자 현황」(participants)은 여기에 옮기지 않았다.
//      이름이 보이는 표는 옛 화면에도 있던 둘(③ 도전 현황 · ④ 누가 얼마나)뿐이다.
//   ⚠️ 옛 화면의 CSV 내려받기는 옮기지 않았다(js/core 에 내려받기 도구가 없다 · 이름이 든 표를 기록 없이 내보내게 된다).
//   글·차례·합계는 stats-logic.js(시험 tests/mem-stats-logic.test.mjs) · 이벤트는 route() 가 만든 이 화면의 el 에만.
import { esc, errorText, busy } from "../../core/ui.js";
import { pickDate, pickMany, kstToday } from "../../core/picker.js";
import { pickSummary, sameSet } from "../people/people-logic.js";
import { TABS, QUICK, GUBUNS, MSG, nText, sumOf, quickRange, quickOf, defaultRange, rangeText, dateText, gubunCls,
  USAGE_KPI, usageCols, usageCell, usageBars, barPct, verseLabels, verseView, sosokOptions, challengeView, sosokLabel,
  blessingView, blessingWho } from "./stats-logic.js";

const TITLE = `<h2 class="page-title">📊 통계</h2>`;
// 메뉴를 나갔다 와도 남는 것(모듈 안) — 보던 보기 · 기간 · 도전 현황 거르기. 수는 메뉴를 열 때마다 새로 받는다.
let lastTab = "usage";
let period = null;                         // { from, to } — null 이면 처음 기간(최근 30일)
let chal = { gubun: "전체", sosok: [] };   // 도전 현황 거르기 — 소속은 비면 전체

// ── 그리기 도우미(글은 모두 esc) ──
const kpis = (items) => `<ul class="ms-kpis">` + items.map(([n, l, c]) =>
  `<li class="ms-kpi${c ? " " + c : ""}"><b>${esc(nText(n))}</b><span>${esc(l)}</span></li>`).join("") + `</ul>`;
const toolbar = (from, to, extra) => `<p class="muted ms-bar">기간: <b>${esc(rangeText(from, to))}</b>${extra ? ` · ${esc(extra)}` : ""}</p>`;
const th = (t, cls = "") => `<th scope="col"${cls ? ` class="${cls}"` : ""}>${esc(t)}</th>`;
const td = (t, cls = "") => `<td${cls ? ` class="${cls}"` : ""}>${esc(t)}</td>`;
const tdB = (n) => `<td><b>${esc(nText(n))}</b></td>`;
const table = (head, body, foot = "") => `<div class="ms-tw"><table class="ms-t"><thead><tr>${head}</tr></thead>` +
  `<tbody>${body}</tbody>${foot ? `<tfoot><tr>${foot}</tr></tfoot>` : ""}</table></div>`;
const tag = (g) => `<td class="l"><span class="${gubunCls(g)}">${esc(g || "-")}</span></td>`;
const empty = (t) => `<p class="empty">${esc(t)}</p>`;

// ① 기간별 사용현황 — 수 카드 · 소속별 막대(총 도전) · 상세 표(받은 키 그대로 + 합계 줄)
function usageHtml(rows, from, to) {
  if (!rows.length) return empty(MSG.empty);
  const items = usageBars(rows), max = Math.max(1, ...items.map((x) => x.v));
  const chart = `<div class="card ms-chart"><b class="ms-ct">📊 소속별 참여(총 도전)</b>` + items.map((x) =>
    `<div class="ms-barrow"><span class="ms-bl">${esc(x.label)}</span><span class="ms-bt"><span style="width:${barPct(x.v, max)}%"></span></span>` +
    `<span class="ms-bv">${esc(nText(x.v))}</span></div>`).join("") + `</div>`;
  const cols = usageCols(rows);
  const cls = (c) => (c.num ? "" : "l");
  const foot = cols.map((c, i) => (i === 0 ? td("합계", cls(c)) : c.num ? td(nText(sumOf(rows, c.key))) : td("", "l"))).join("");
  return kpis(USAGE_KPI.map(([k, l, c]) => [sumOf(rows, k), l, c])) + toolbar(from, to, `그룹 ${nText(rows.length)}개`) + chart +
    `<h3 class="sec-title">상세</h3>` +
    table(cols.map((c) => th(c.label, cls(c))).join(""),
      rows.map((r) => `<tr>${cols.map((c) => td(usageCell(r[c.key]), cls(c))).join("")}</tr>`).join(""), foot);
}

// ② 구절별 현황 — 사용된 구절 수 · 총 참여횟수 · 순번·말씀·참여자·참여횟수 + 합계
function versesHtml(d, from, to) {
  const v = verseView(d.list, d.labels);
  if (!v.rows.length) return empty(MSG.empty);
  const note = d.noLabels ? MSG.noLabels : v.unnamed ? MSG.someUnnamed : "";
  return kpis([[v.used, "사용된 구절 수"], [v.count, "총 참여횟수"]]) + toolbar(from, to) +
    table(th("말씀 순번", "c") + th("말씀", "l") + th("참여자") + th("참여횟수"),
      v.rows.map((r) => `<tr>${td(r.no, "c")}${td(r.label, "l ms-wrap")}${td(nText(r.participants))}${tdB(r.count)}</tr>`).join(""),
      td("") + td("합계", "l") + td("") + td(nText(v.count))) +
    (note ? `<p class="muted ms-note">${esc(note)}</p>` : "");
}

// ③ 도전 현황 — 참여자 수 · 타이핑 · 음성 · 총 도전횟수 · 사람마다 한 줄 + 합계
function challengeHtml(list, f, from, to) {
  const v = challengeView(list, f);
  if (!v.rows.length) return empty(MSG.noChallenge);
  return kpis([[v.people, "참여자 수"], [v.typing, "타이핑"], [v.voice, "음성"], [v.count, "총 도전횟수"]]) +
    toolbar(from, to, `참여자 ${nText(v.people)}명`) +
    table(th("#", "c") + th("구분", "l") + th("교구/교회학교", "l") + th("목장/학년", "c") + th("성명", "l") + th("타이핑") + th("음성") + th("도전횟수"),
      v.rows.map((r, i) => `<tr>${td(i + 1, "c")}${tag(r.gubun)}${td(r.sosok || "-", "l")}${td(r.sebu || "-", "c")}${td(r.name || "-", "l")}` +
        `${td(nText(r.typing))}${td(nText(r.voice))}${tdB(r.count)}</tr>`).join(""),
      td("") + td("합계", "l") + td("") + td("") + td("") + td(nText(v.typing)) + td(nText(v.voice)) + td(nText(v.count)));
}

// ④ 축복 기도문 사용현황 — 본 사람 · 총 열어본 횟수 · 활동일수 · 많이 읽히는 편 · 누가 얼마나(서버 차례 그대로)
function blessingHtml(d, from, to) {
  if (d.empty) return empty(MSG.empty);
  const s = d.summary;
  return kpis([[s.people, "본 사람"], [s.total, "총 열어본 횟수"], [s.days, "활동일수"]]) +
    toolbar(from, to, `읽힌 편 ${nText(d.byPrayer.length)}개`) +
    `<h3 class="sec-title">많이 읽히는 편</h3>` +
    table(th("번호", "c") + th("제목", "l") + th("본 사람") + th("횟수"),
      d.byPrayer.map((r) => `<tr>${td(r.no, "c")}<td class="l ms-wrap">${esc(r.title || "")}${r.group ? ` <span class="ms-grp">${esc(r.group)}</span>` : ""}</td>` +
        `${td(nText(r.people))}${tdB(r.count)}</tr>`).join("")) +
    `<h3 class="sec-title">누가 얼마나</h3>` +
    table(th("구분", "l") + th("소속", "l") + th("이름", "l") + th("본 날수") + th("본 편수") + th("횟수") + th("마지막", "c"),
      d.byUser.map((r) => `<tr>${tag(r.gubun)}${td(blessingWho(r), "l")}${td(r.name || "-", "l")}${td(nText(r.days))}${td(nText(r.prayers))}` +
        `${tdB(r.count)}${td(r.last || "-", "c")}</tr>`).join(""));
}

const dateBtn = (k, label) => `<button type="button" class="pk-field ms-${k}" data-act="date" data-k="${k}" aria-haspopup="dialog" aria-expanded="false"` +
  ` aria-label="${label}"><span class="pk-field-v"></span><span class="pk-field-x" aria-hidden="true"></span></button>`;

export async function render(el, { call }) {
  el.classList.add("ms-page");   // PC 에서 읽기 좋은 폭(css .ms-page)
  let { from, to } = period || defaultRange(kstToday());
  let tab = TABS.some(([k]) => k === lastTab) ? lastTab : "usage";
  const cache = {};       // 보기마다 마지막으로 받은 것 { key: "from|to", data } — 기간이 같으면 다시 받지 않는다(「조회」는 새로)
  let labels = null;      // 말씀 이름(getVerses) — 받으면 이 화면 동안 둔다 · 못 받으면 다음 「조회」에 다시
  let seq = 0;

  el.innerHTML = TITLE + `
    <div class="tabs ms-tabs" role="group" aria-label="보기">${TABS.map(([k, t]) =>
      `<button type="button" data-act="tab" data-tab="${k}" aria-pressed="false">${esc(t)}</button>`).join("")}</div>
    <div class="ms-filter">
      <div class="ms-dates">${dateBtn("from", "시작일")}<span aria-hidden="true">~</span>${dateBtn("to", "종료일")}</div>
      <div class="ms-quick" role="group" aria-label="빠른 기간">${QUICK.map(([q, t]) =>
        `<button type="button" data-act="quick" data-q="${q}" aria-pressed="false">${esc(t)}</button>`).join("")}
        <button type="button" class="btn ms-go" data-act="go">조회</button></div>
      <div class="ms-chal" hidden>
        <div class="tabs ms-gubun" role="group" aria-label="구분">${GUBUNS.map((g) =>
          `<button type="button" data-act="gubun" data-g="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join("")}</div>
        <button type="button" class="pp-pick-b ms-sosok" data-act="sosok" aria-haspopup="dialog" aria-expanded="false">` +
          `<span class="pp-pick-l"></span><span class="pp-pick-v"></span><span class="pk-field-x" aria-hidden="true"></span></button>
        <p class="muted ms-hint" hidden>${esc(MSG.allSosok)}</p>
      </div>
    </div>
    <div class="ms-body"><p class="empty">불러오는 중…</p></div>`;
  const body = el.querySelector(".ms-body");

  // 단추 모양을 지금 값에 맞춘다(단추를 새로 만들지 않는다 — busy 가 잡아 둔 단추가 그대로 풀리게)
  function syncControls() {
    const today = kstToday();
    el.querySelectorAll('[data-act="tab"]').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    // 날짜 단추 — 비면 열린 끝(서버가 그쪽을 거르지 않는다). 이름에 고른 날도 함께(화면 읽기 프로그램용)
    for (const [k, v, none, nm] of [["from", from, "처음부터", "시작일"], ["to", to, "오늘까지", "종료일"]]) {
      const b = el.querySelector(".ms-" + k), txt = dateText(v, today, none);
      b.querySelector(".pk-field-v").textContent = txt;
      b.setAttribute("aria-label", `${nm}, ${txt}`);
      b.classList.toggle("empty", !v);
    }
    const q = quickOf(from, to, today);
    el.querySelectorAll('[data-act="quick"]').forEach((b) => {
      b.classList.toggle("on", b.dataset.q === q);
      b.setAttribute("aria-pressed", String(b.dataset.q === q));
    });
    // 도전 현황 거르기 — 그 보기에서만 · 「전체」면 소속 고르기를 잠그고 까닭을 적는다
    el.querySelector(".ms-chal").hidden = tab !== "challenge";
    el.querySelectorAll('[data-act="gubun"]').forEach((b) => {
      const on = b.dataset.g === chal.gubun;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const all = chal.gubun === "전체", sb = el.querySelector(".ms-sosok"), sum = all ? "전체" : pickSummary(chal.sosok);
    sb.disabled = all;
    sb.classList.toggle("on", !all && chal.sosok.length > 0);
    sb.querySelector(".pp-pick-l").textContent = sosokLabel(chal.gubun);
    sb.querySelector(".pp-pick-v").textContent = sum;
    sb.setAttribute("aria-label", `${sosokLabel(chal.gubun)}, ${sum}${all ? "" : " — 여러 개 고르기"}`);
    el.querySelector(".ms-hint").hidden = !all;
  }

  // 보기 t 의 수를 지금 기간으로 받는다 → { ok:true, … } 또는 서버의 실패 답
  async function fetchTab(t) {
    const p = { from, to };
    if (t === "usage") { const r = await call("stats", p); return r.ok ? { ok: true, list: r.list || [] } : r; }
    if (t === "verses") {
      const [r, lb] = await Promise.all([call("verses", p), labels ? Promise.resolve(null) : call("getVerses")]);
      if (!labels && lb && lb.ok) labels = verseLabels(lb.verses);
      return r.ok ? { ok: true, list: r.list || [], labels: labels || {}, noLabels: !labels } : r;
    }
    if (t === "challenge") { const r = await call("ranking", p); return r.ok ? { ok: true, list: r.list || [] } : r; }
    const r = await call("blessingUsage", p);
    return r.ok ? { ok: true, ...blessingView(r) } : r;
  }

  // 받아 둔 것을 그린다 — 지금 기간의 것이 없으면(받다가 실패) 그 자리의 안내를 그대로 둔다
  function draw() {
    syncControls();
    const c = cache[tab];
    if (!c || c.key !== `${from}|${to}`) return;
    const d = c.data;
    body.innerHTML = tab === "usage" ? usageHtml(d.list, from, to)
      : tab === "verses" ? versesHtml(d, from, to)
        : tab === "challenge" ? challengeHtml(d.list, chal, from, to)
          : blessingHtml(d, from, to);
  }

  // 지금 보기를 보인다 — 같은 기간으로 받아 둔 것이 있으면 그대로, 없거나 force 면 새로 받는다
  async function show(force = false) {
    syncControls();
    const t = tab, key = `${from}|${to}`;
    if (!force && cache[t] && cache[t].key === key) return draw();
    const my = ++seq;
    body.innerHTML = `<p class="empty">불러오는 중…</p>`;
    const got = await busy(el, () => fetchTab(t));
    if (!el.isConnected || my !== seq) return;
    if (!got || !got.ok) {
      delete cache[t];
      body.innerHTML = empty(errorText(got));
      syncControls();
      return;
    }
    cache[t] = { key, data: got };
    draw();
  }

  // 날짜 — 고르면(지우기 = "" · 그쪽 끝을 연다) 곧 다시 받는다. 닫기(null)면 그대로. 반대쪽 끝을 넘지 못한다.
  async function pickDay(b) {
    const k = b.dataset.k;
    const v = await pickDate({ anchor: b, title: k === "from" ? "시작일" : "종료일", value: k === "from" ? from : to,
      min: k === "to" ? from : "", max: k === "from" ? to : "" });
    if (v === null || !el.isConnected) return;
    if (k === "from") from = v; else to = v;
    period = { from, to };
    await show();
    if (b.isConnected && !b.disabled) b.focus({ preventScroll: true });
  }

  // 소속 — 여러 개 고르기(비우면 전체). 받은 기록 안에서 다시 거르기만 한다(서버를 다시 부르지 않는다)
  async function pickSosok(b) {
    const before = [...chal.sosok];
    const opts = sosokOptions(chal.gubun, cache.challenge?.data?.list);
    const got = await pickMany({ anchor: b, title: `${sosokLabel(chal.gubun)} — 여러 개 고르기`, values: before,
      options: opts.map((o) => ({ value: o.value, label: o.value, hint: `${nText(o.n)}명` })) });
    if (got === null || !el.isConnected || sameSet(before, got)) return;
    chal = { ...chal, sosok: [...got] };
    draw();
  }

  el.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled || !el.contains(b)) return;
    const act = b.dataset.act;
    if (act === "tab") {
      if (b.dataset.tab === tab) return;
      tab = lastTab = b.dataset.tab;
      show();
    } else if (act === "quick") {
      ({ from, to } = quickRange(b.dataset.q, kstToday()));
      period = { from, to };
      show();
    } else if (act === "go") show(true);
    else if (act === "date") pickDay(b);
    else if (act === "gubun") {
      if (b.dataset.g === chal.gubun) return;
      chal = { gubun: b.dataset.g, sosok: [] };   // 구분을 바꾸면 소속은 처음(전체)부터 — 옛 화면과 같다
      draw();
    } else if (act === "sosok") pickSosok(b);
  });

  await show();
}
