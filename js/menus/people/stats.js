// 📊 교인 현황 (2026-09-29) — 숫자만. 이름·연락처는 이 화면에 없다(서버 peopleStats 도 주지 않는다).
// 거르기(2026-09-30 친구 요청 「교구별 출석 필터, 직분 출석 필터 · 교구별·직분별을 위로 · 연령별 성별 출석 및 교구 필터」):
//   차례 — 교구 카드 일곱 → 교구별 → 직분별 → 장년·청년·교회학교 → 출석 구분 → 교회학교 부서 → 연령대·성별.
// 위 카드(2026-09-30 친구 요청 「위 카드(전체·가구·사진 없는 분)는 의미를 갖기 어렵네요. 교구별로 인원수만 · 인원 수 & 가구 수」):
//   믿음·소망·사랑·섬김·은혜·화평·기쁨 일곱(이 차례 · 0명이어도 카드는 있다) — 교구 이름 / 「1,234명」 / 「612가구」.
//   인원은 아래 교구별 표(거르기 없음)와 같고, 가구는 신앙세대주 기준(서버 people-query.ts householdsByGu).
//   전체 인원은 맨 위 「명부 기준일 … · N명」 줄에 있다. 「사진 없는 분」 카드도 함께 뺐다(교인 찾기의 ?nophoto=1 은 그대로 산다).
//   교구별·직분별 표 위에 「출석」, 연령대·성별 표 위에 「출석」·「교구」 — 성별은 거르기가 아니라 칸(남·여·모름)이다.
//   거르기는 표마다 따로(한 표의 거르기가 다른 표를 바꾸지 않는다) · 아무것도 안 고르면 전체 · 표 아래 합계 줄.
//   바꿀 때 서버를 다시 부르지 않는다 — 서버가 한 번 준 숫자 묶음(stats.facts)으로 다시 센다(stats-logic.js).
//   고른 것은 이 화면 안에서만 산다(주소·저장 안 함 — 메뉴를 옮기면 전체로 돌아온다).
//   단추·고르개는 🔎 교인 찾기와 같다(.pp-pick-b + pickMany — 폰은 바텀 시트, PC 는 단추 아래 작은 판 · 고를 목록에 인원 수).
//   고를 목록의 인원은 같은 표의 다른 거르기 안에서 센다 · 출석 「(없음)」도 고른다(stats-logic.js statsChoices).
// ⚠️ 이벤트는 route() 가 만든 이 화면의 el 에만 단다(공용 #view 에 달면 다음 메뉴로 새어 간다).
import { esc, errorText } from "../../core/ui.js";
import { sourceLine, pickSummary, sameSet } from "./people-logic.js";
import { guTable, positionTable, ageTable, pickOptions, statsChoices, guCardRows } from "./stats-logic.js";
import { pickMany } from "../../core/picker.js";

const TITLE = `<h2 class="page-title">📊 교인 현황</h2>`;
const n = (x) => Number(x || 0).toLocaleString("ko-KR");
const pairTable = (title, head, pairs) => !pairs.length ? "" :
  `<h3 class="sec-title">${esc(title)}</h3><table class="pp-stat"><thead><tr><th>${esc(head)}</th><th>인원</th></tr></thead>` +
  `<tbody>${pairs.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${n(v)}</td></tr>`).join("")}</tbody></table>`;

// 거르기가 달린 표 셋 — 열쇠 → [제목, 거르기 열쇠들]. 거르기 열쇠는 statsChoices(stats-logic.js · 같은 표의 다른 거르기 안에서 셈 ·
//   출석 「(없음)」 포함)의 열쇠 — 교인 찾기 filterChoices 와 다르다(그쪽은 「(없음)」을 못 고른다 · 맞추면 d) 가 되돌아간다).
const SECS = { gu: ["교구별", ["kind3"]], position: ["직분별", ["kind3"]], age: ["연령대 · 성별", ["kind3", "mok1"]] };
// 고르개 제목에 붙이는 짧은 표 이름 — 폰 시트 제목이 두 줄로 꺾이지 않게(「교구별 · 출석 — 여러 개 고르기」는 320px 에서 꺾였다)
const SHORT = { gu: "교구별", position: "직분별", age: "연령대" };
const PICK_LABEL = { kind3: "출석", mok1: "교구" };
const EMPTY = `<p class="empty">고른 출석에 해당하는 분이 없어요</p>`;
const EMPTY_AGE = `<p class="empty">고른 출석·교구에 해당하는 분이 없어요</p>`;
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);

// 「여러 개 고르기」 단추 — 🔎 교인 찾기(search.js pickHtml)와 같은 모양. 요약 글자·on·이름은 syncPicks 가 채운다.
const pickHtml = (sec, key) => `<button type="button" class="pp-pick-b" data-act="pick" data-sec="${sec}" data-pick="${key}" ` +
  `aria-haspopup="dialog" aria-expanded="false"><span class="pp-pick-l">${esc(PICK_LABEL[key])}</span><span class="pp-pick-v"></span>` +
  `<span class="pk-field-x" aria-hidden="true"></span></button>`;

const guHtml = (t) => !t.rows.length ? EMPTY :
  `<table class="pp-stat"><thead><tr><th>교구</th><th>목장 수</th><th>인원</th></tr></thead><tbody>` +
  t.rows.map((g) => `<tr><td>${esc(g.gu)}</td><td>${n(g.moks)}</td><td>${n(g.n)}</td></tr>`).join("") +
  `</tbody><tfoot><tr><th scope="row">합계</th><td>${n(t.total.moks)}</td><td>${n(t.total.n)}</td></tr></tfoot></table>`;

const positionHtml = (t) => !t.rows.length ? EMPTY :
  `<table class="pp-stat"><thead><tr><th>직분</th><th>인원</th></tr></thead><tbody>` +
  t.rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${n(v)}</td></tr>`).join("") +
  `</tbody><tfoot><tr><th scope="row">합계</th><td>${n(t.total)}</td></tr></tfoot></table>`;

// 합계가 0 이면(고른 출석×교구에 한 분도 없으면) 0 만 가득한 표 대신 한 줄 — 교구별·직분별의 빈 안내와 같은 꼴
export const ageHtml = (t) => t.total.m + t.total.f + t.total.x === 0 ? EMPTY_AGE :
  `<table class="pp-stat"><thead><tr><th>연령대</th><th>남</th><th>여</th><th>모름</th><th>합</th></tr></thead><tbody>` +
  t.rows.map((a) => `<tr><td>${esc(a.band)}</td><td>${n(a.m)}</td><td>${n(a.f)}</td><td>${n(a.x)}</td>` +
    `<td>${n(a.m + a.f + a.x)}</td></tr>`).join("") +
  `</tbody><tfoot><tr><th scope="row">합계</th><td>${n(t.total.m)}</td><td>${n(t.total.f)}</td><td>${n(t.total.x)}</td>` +
  `<td>${n(t.total.m + t.total.f + t.total.x)}</td></tr></tfoot></table>`;

// 맨 위 교구 카드 일곱 — 「1,234명」·「612가구」(숫자 뒤에 붙여 · 천 단위 쉼표). 가구가 null(옛 서버)이면 가구 줄을 안 그린다.
export const guCardsHtml = (rows) => `<ul class="pp-gucards" aria-label="교구별 인원 · 가구">` +
  rows.map((c) => `<li class="card pp-gucard"><span class="pp-gucard-g">${esc(c.gu)}</span><b>${n(c.n)}명</b>` +
    (c.households === null || c.households === undefined ? "" : `<span class="pp-gucard-h">${n(c.households)}가구</span>`) + `</li>`).join("") +
  `</ul>`;

// 표 한 칸(제목 · 거르기 줄 · 표 자리). 숫자 묶음이 없으면(옛 서버) 거르기 줄 없이 서버 표 그대로.
const secHtml = (sec, withPicks) => `<div class="pp-ssec" data-sec="${sec}"><h3 class="sec-title">${esc(SECS[sec][0])}</h3>` +
  (withPicks ? `<div class="pp-sfilters">${SECS[sec][1].map((k) => pickHtml(sec, k)).join("")}</div>` : "") +
  `<div class="pp-stable"></div></div>`;

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("peopleStats");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  const src = sourceLine(r.source, new Date().toISOString().slice(0, 10));
  if (!r.source) { el.innerHTML = TITLE + `<p class="empty">${esc(src.text)}</p>`; return; }
  const s = r.stats;
  const F = s.facts || null;                       // ⚠️ 화면이 서버보다 먼저 나가면 없다 — 그때는 거르기 없이 예전 표
  const sel = { gu: { kind3: [] }, position: { kind3: [] }, age: { kind3: [], mok1: [] } };   // 이 화면 안에서만

  el.innerHTML = TITLE + `<p class="pp-src muted${src.stale ? " stale" : ""}">${esc(src.text)}</p>
    ${guCardsHtml(guCardRows(s))}
    ${secHtml("gu", !!F)}
    ${secHtml("position", !!F)}
    ${pairTable("장년 · 청년 · 교회학교", "구분", s.kind2)}
    ${pairTable("출석 구분", "출석", s.kind3)}
    ${pairTable("교회학교 부서", "부서", s.school)}
    ${secHtml("age", !!F)}`;

  // 그 표만 다시 센다 — 숫자 묶음이 없으면 서버 표 그대로
  const table = {
    gu: () => guHtml(F ? guTable(F, sel.gu.kind3)
      : { rows: s.gu, total: { moks: sum(s.gu, (g) => g.moks), n: sum(s.gu, (g) => g.n) } }),
    position: () => positionHtml(F ? positionTable(F, sel.position.kind3)
      : { rows: s.position, total: sum(s.position, ([, v]) => v) }),
    age: () => ageHtml(F ? ageTable(F, sel.age.kind3, sel.age.mok1)
      : { rows: s.age, total: { m: sum(s.age, (a) => a.m), f: sum(s.age, (a) => a.f), x: sum(s.age, (a) => a.x) } }),
  };
  function syncPicks(sec) {
    for (const b of el.querySelectorAll(`.pp-pick-b[data-sec="${sec}"]`)) {
      const key = b.dataset.pick, on = sel[sec][key];
      b.classList.toggle("on", on.length > 0);
      b.querySelector(".pp-pick-v").textContent = pickSummary(on);
      b.setAttribute("aria-label", `${SECS[sec][0]} ${PICK_LABEL[key]}, ${on.length ? on.join(", ") : "전체"} — 여러 개 고르기`);
    }
  }
  function draw(sec) {
    el.querySelector(`.pp-ssec[data-sec="${sec}"] .pp-stable`).innerHTML = table[sec]();
    syncPicks(sec);
  }
  Object.keys(SECS).forEach(draw);

  // 고르개 — 「확인」으로 닫았고 고른 것이 바뀌었을 때만 그 표를 다시 그린다(취소 = null · 같으면 그대로).
  // 판을 여닫는 일(초점 가두기·Esc·바깥 누름·aria-expanded·닫힌 뒤 초점을 단추로)은 고르개가 맡는다.
  async function openPick(b) {
    const sec = b.dataset.sec, key = b.dataset.pick;
    const before = [...sel[sec][key]];
    // 목록 인원은 여는 순간의 다른 거르기 안에서(연령대 표 — 출석을 골랐으면 교구 인원은 그 출석 안에서)
    const got = await pickMany({ anchor: b, title: `${PICK_LABEL[key]} 고르기 — ${SHORT[sec]}`, values: before,
      options: pickOptions(statsChoices(F, sel[sec])[key]) });
    if (got === null || !el.isConnected || sameSet(before, got)) return;
    sel[sec][key] = [...got];       // 늘 새 배열
    draw(sec);
  }
  el.addEventListener("click", (e) => {
    const b = e.target.closest('button[data-act="pick"]');
    if (b && el.contains(b)) openPick(b);
  });
}
