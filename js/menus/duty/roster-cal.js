// 📅 당번 명단 — 달력 조각(HTML 만 · 2026-10-07 친구 요청 「어드민에서도 달력으로 확인」). 날짜가 넷 이상이면(duty-logic.js calUse) 날짜 칩 줄 대신 이 달력으로 날짜를 고른다(roster.js).
//   칸 = 단추(data-day — 칩과 같은 누름) · 날짜 아래 「채워진 인원/필요 인원」(성경암송 앱 달력과 같은 셈) · 칸의 뜻은 칩과 같은 판정(calCell = dayChip + 수):
//     빈 자리가 있는 날은 금색 바탕 · 못 온다는 분이 있는 날은 붉은 바탕 + ⚠ · 다 찬 날은 초록 숫자 · 쉼·지난 날·자리 없음은 흐린 바탕 · 🔒 = 확정된 날.
//   고른 날은 남색 · 오늘은 남색 테두리(aria-current) · 공휴일(hol)과 일요일(sun)은 **날짜 숫자만** 빨갛게(holidays.js · duty-logic.js isSunday — 당번이 없는 날도 ·
//   칸의 바탕과 인원 글은 뜻 색 그대로 · 요일 줄의 「일」도 빨갛다 — 친구 결정 2026-10-07 「네 빨갛게」).
//   앞뒤 달 단추는 날짜가 있는 달로만(data-cal) · 더 앞 달이 없고 지난 날을 더 불러올 수 있으면 「◀ 지난 날」(data-act="older" — 칩 줄의 「지난 날 더 보기」와 같은 일).
//   아래 풀이는 이 당번에 실제로 있는 표시만(색만으로 말하지 않는다 — 글·기호를 함께). 글자는 모두 esc.
//   공휴일 표가 덮지 않는 달(holidays.js holOutside)에는 풀이가 그렇게 말한다 — 빨간 날짜가 없는 것이 「공휴일이 없다」로 읽히지 않게.
//   ⚠️ 그리는 달은 **통째로 읽은 달**이어야 한다(roster.js 가 달의 1일부터 읽는다 — duty-logic.js rosterFrom). 달 가운데서 자른 명단을 주면
//      아직 읽지 않은 날짜가 「당번 없는 날」과 같은 칸으로 그려진다.
// ⚠️ 이 파일은 Node 시험이 읽는다(tests/duty-cal.test.mjs) — document·window 를 만지지 않는다.
import { esc } from "../../core/ui.js";
import { calMonths, calMonth, calTitle, calMonthWord, calCell, calMark, calLabel, isSunday } from "./duty-logic.js";
import { holidayName, holItems, holOutside, holOutsideText } from "./holidays.js";

export function calHtml(days, day, today, { older = false } = {}) {
  const list = (days || []).filter((d) => d && d.date), ym = String(day || "").slice(0, 7), months = calMonths(list), at = months.indexOf(ym);
  const by = new Map(), seen = {};
  for (const d of list) {
    const x = calCell(d, today);
    by.set(d.date, { d, x });
    seen[x.kind] = true;
    if (x.lock) seen.lock = true;
    if (x.kind !== "off" && x.cap > 0) seen.count = true;
  }
  const month = calMonth(ym);
  const cells = month.map((c) => {
    if (!c.date) return `<span class="dty-cal-c"></span>`;
    const it = by.get(c.date), hol = holidayName(c.date), now = c.date === today;
    const cls = `${now ? " today" : ""}${isSunday(c.date) ? " sun" : ""}${hol ? " hol" : ""}`, cur = now ? ` aria-current="date"` : "";
    if (!it) return `<span class="dty-cal-c${cls}"${cur}${hol ? ` title="${esc(hol)}"` : ""}><span>${c.n}</span></span>`;
    const { d, x } = it, on = c.date === day;
    // 인원 글은 「/」 뒤에서 줄을 바꿀 수 있다(<wbr>) — 칸에 한 줄로 못 들 때만 두 줄이 된다(「100/120」 · 좁은 폰 · 글씨를 키운 브라우저). 넘친 글자가 이웃 칸에 묻히지 않게
    return `<button type="button" class="dty-cal-c has k-${x.kind}${x.lock ? " lock" : ""}${on ? " on" : ""}${cls}" data-day="${esc(c.date)}" aria-pressed="${on}"${cur} aria-label="${esc(calLabel(d, x, hol))}">` +
      `<span>${c.n}</span><i aria-hidden="true">${esc(calMark(x)).replace("/", "/<wbr>")}</i>${x.kind === "ask" ? `<em class="wn" aria-hidden="true">⚠</em>` : ""}${x.lock ? `<em class="lk" aria-hidden="true">🔒</em>` : ""}</button>`;
  }).join("");
  const prev = at > 0 ? months[at - 1] : "", next = at >= 0 ? months[at + 1] || "" : "";
  const left = prev ? `<button type="button" class="btn dty-cal-nav l" data-cal="prev" aria-label="${esc(calTitle(prev))} 보기">◀ ${esc(calMonthWord(prev))}</button>`
    : older ? `<button type="button" class="btn dty-cal-nav l" data-act="older" aria-label="지난 날 더 보기">◀ 지난 날</button>` : `<span></span>`;
  const right = next ? `<button type="button" class="btn dty-cal-nav r" data-cal="next" aria-label="${esc(calTitle(next))} 보기">${esc(calMonthWord(next))} ▶</button>` : `<span></span>`;
  const hols = holItems(month).map((x) => `<span class="ki">${esc(x)}</span>`).join(" · ");   // 한 조각씩 줄이 갈리지 않게(.ki)
  const key = [
    seen.count ? "숫자는 채워진 인원 / 필요 인원이에요." : "",
    [seen.need ? `<span class="ki"><span class="k need" aria-hidden="true"></span>빈 자리가 있는 날</span>` : "",
      seen.ask ? `<span class="ki"><span class="wn" aria-hidden="true">⚠</span> 못 온다는 분이 있는 날</span>` : "",
      seen.lock ? `<span class="ki">🔒 확정된 날</span>` : "",
      month.some((c) => c.date && c.date === today) ? `<span class="ki"><span class="k today" aria-hidden="true"></span>오늘</span>` : ""].filter(Boolean).join(" · "),
    // 빨간 날짜의 풀이 — 공휴일이 있는 달에만 이름과 함께(일요일뿐인 달은 요일 줄의 빨간 「일」이 말한다) · 표 밖의 달은 「일요일만 빨갛게 보여요(다른 공휴일은 …)」
    hols ? `<span class="hd">빨간 날짜</span>는 일요일과 공휴일이에요(${hols}).` : esc(holOutsideText(holOutside(ym))),
    "날짜를 누르면 그날의 명단이 보여요.",
  ].filter(Boolean).join("<br>");
  return `<div class="dty-cal" role="group" aria-label="날짜 고르기">
    <div class="dty-cal-h">${left}<b>${esc(calTitle(ym))}</b>${right}</div>
    <div class="dty-cal-w" aria-hidden="true"><span class="sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
    <div class="dty-cal-g">${cells}</div>
    <p class="dty-cal-k">${key}</p></div>`;
}
