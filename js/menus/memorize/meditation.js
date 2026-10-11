// 🌿 매일 묵상 — 설교마다 다음 주 월~일, 하루 하나씩 성도님 앱(「🌿 매일 묵상」·위젯)에 보이는 묵상 7개(읽기만 · 2026-10-11).
//   성경암송 admin-stats 「매일 묵상 조회」를 옮겼다. 서버 meditationWeeks(역할 content)가 sermons 표에서 묵상이 있는 설교만 준다.
//   ⚠️ 「오늘 무엇을 보여 줄지」는 성경암송 app.js·api 두 곳이 고른다 — 여기서 「오늘」 표시는 그 규칙의 큰 줄기(설교 다음 날 월요일부터 7일)만 따른다.
import { esc, busy, errorText } from "../../core/ui.js";
import { pickOne } from "../../core/picker.js";

const TITLE = `<h2 class="page-title">🌿 매일 묵상</h2>`;
const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

// 「YYYY-MM-DD」 두 날 사이 날 수(b - a)
export function dayDiff(a, b) {
  const p = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000);
}
// 이 설교의 묵상이 오늘 몇 번째 날인가(0=월 … 6=일) — 설교 다음 날(월)부터 7일. 그 밖이면 -1.
export function todayIndex(sermonDate, today) {
  if (!sermonDate || !today) return -1;
  const k = dayDiff(sermonDate, today) - 1;
  return k >= 0 && k < 7 ? k : -1;
}
// 묵상 글의 **굵게** 만 살린다(나머지는 글자 그대로)
export function boldOnly(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `
    <p class="muted">설교를 올리면 <b>다음 날(월)부터 일요일까지</b> 하루 하나씩 성도님 앱의 「🌿 매일 묵상」과 위젯에 보여요.</p>
    <div class="acts"><button class="btn" id="md-pick">주차 고르기</button></div>
    <div id="md-body"><p class="muted">불러오는 중…</p></div>`;
  const $ = (id) => el.querySelector("#" + id);
  let weeks = [], today = "", cur = 0;

  function show(i) {
    cur = i;
    const w = weeks[i];
    if (!w) { $("md-body").innerHTML = ""; return; }
    const ti = todayIndex(w.date, today);
    $("md-pick").textContent = `주차 고르기 · ${w.date || ""}`;
    $("md-body").innerHTML = `
      <div class="card">
        <b>📖 ${esc(w.title)}</b>
        <div class="muted">${esc(w.date || "")}${w.preacher ? " · " + esc(w.preacher) : ""}${w.ref ? " · " + esc(w.ref) : ""}${w.hidden ? " · 숨긴 설교" : ""}</div>
        ${ti >= 0 ? `<div class="muted">지금 성도님 앱에 나오는 주차예요 — 오늘은 <b>${DAYS[ti]}요일</b> 것</div>` : ""}
      </div>` + w.days.map((d, k) => `
      <div class="card"${k === ti ? ' style="border:2px solid var(--navy)"' : ""}>
        <div><b>${DAYS[k] || "D" + (k + 1)}</b> · ${esc(d.heading)}${k === ti ? " <small>(오늘)</small>" : ""}</div>
        ${d.message ? `<div style="margin-top:6px;white-space:pre-line">${boldOnly(d.message)}</div>` : ""}
        ${d.question ? `<div class="muted" style="margin-top:6px">💬 ${boldOnly(d.question)}</div>` : ""}
      </div>`).join("");
  }

  $("md-pick").addEventListener("click", async (e) => {
    if (!weeks.length) return;
    const v = await pickOne({
      anchor: e.currentTarget, title: "주차(설교) 고르기", value: String(cur),
      options: weeks.map((w, i) => ({ value: String(i), label: `${w.date || ""} · ${w.title}`, hint: w.ref || "" })),
    });
    if (v != null && v !== "") show(Number(v));
  });

  await busy(el, async () => {
    const r = await call("meditationWeeks", {});
    if (!r.ok) { $("md-body").innerHTML = `<p class="muted">${esc(errorText(r))}</p>`; return; }
    weeks = r.weeks || []; today = r.today || "";
    if (!weeks.length) { $("md-body").innerHTML = `<p class="muted">아직 7일치 매일 묵상이 있는 설교가 없어요.</p>`; return; }
    // 처음엔 「지금 앱에 나오는 주차」 — 없으면(주일 오후 막 올린 설교 등) 가장 최근 설교
    const now = weeks.findIndex((w) => todayIndex(w.date, today) >= 0);
    show(now >= 0 ? now : 0);
  });
}
