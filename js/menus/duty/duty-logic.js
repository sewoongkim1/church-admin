// 봉사 당번 — 화면 규칙(순수 함수 · tests/duty-logic.test.mjs) · 🧰 당번 관리(boards.js)와 📅 당번 명단(roster.js)이 함께 쓴다.
//   설계 v2 docs/superpowers/specs/2026-10-06-duty-roster-design.md §6. 판정(잠김·빈 자리·겹침)은 서버가 준 값 그대로 — 여기는 말과 차례만 고른다.
// ⚠️ 이 파일은 Node 시험이 읽는다 — document·window 를 만지지 않는다.
import { esc } from "../../core/ui.js";
import { monthGrid } from "../../core/picker.js";

export const STATUS_OPTIONS = [
  { value: "draft", label: "준비 중", hint: "앱에 안 보여요" },
  { value: "open", label: "받는 중", hint: "앱에서 지원을 받아요" },
  { value: "closed", label: "지원 멈춤", hint: "앱에 명단은 보이고 지원만 멈춰요 · 담당자가 넣어요" },
  { value: "archived", label: "보관", hint: "앱에 안 보이고 고칠 수 없어요" },
];
export const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));
// 당번 담당(맡은 당번)이 고를 수 있는 상태 — 받는 중 ↔ 지원 멈춤(준비·보관은 당번 총괄만)
export const LEAD_STATUS_OPTIONS = STATUS_OPTIONS.filter((o) => o.value === "open" || o.value === "closed");
export const leadCanSetStatus = (status) => status === "open" || status === "closed";

// 요일 — 0=주일 … 6=토(서버·SQL 과 같다) · "" = 날짜를 골라 넣는 줄(한 번짜리 모집 · 특별 예배)
export const WEEKDAYS = ["주일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
export const WEEKDAY_OPTIONS = [
  ...WEEKDAYS.map((w, i) => ({ value: String(i), label: `매주 ${w}` })),
  { value: "", label: "날짜를 골라 넣어요", hint: "한 번짜리 모집 · 특별 예배" },
];
export const weekdayText = (wd) => (wd === null || wd === undefined || wd === "" ? "날짜를 골라" : `매주 ${WEEKDAYS[Number(wd)] || ""}`);

// 보이는 기간(open_days) 고르기 — 날 수로 저장한다. 목록에 없는 값(직접 고친 값)은 「N일」로 한 줄 더한다.
const OPEN_DAYS = [[14, "2주"], [28, "4주"], [56, "8주"], [84, "12주"], [182, "6개월"], [364, "1년"]];
export const openDaysText = (n) => (OPEN_DAYS.find(([d]) => d === Number(n)) || [0, `${Number(n) || 56}일`])[1];
export function openDaysOptions(cur) {
  const out = OPEN_DAYS.map(([d, t]) => ({ value: String(d), label: `앞으로 ${t}` }));
  const c = Number(cur);
  if (c && !OPEN_DAYS.some(([d]) => d === c)) out.push({ value: String(c), label: `앞으로 ${c}일` });
  return out;
}

// ---------- 날짜 글 ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WD1 = "일월화수목금토";
const utc = (ds) => new Date(ds + "T00:00:00Z");
export const isDate = (s) => typeof s === "string" && DATE_RE.test(s) && !isNaN(utc(s).getTime());
// 그 날짜가 일요일인가 — 날짜만 있는 값(한국 달력날)이라 UTC 자정으로 읽어 요일이 밀리지 않는다. 달력이 일요일의 날짜 숫자를 빨갛게 적는다(친구 결정 2026-10-07).
export const isSunday = (s) => isDate(s) && utc(s).toISOString().slice(0, 10) === s && utc(s).getUTCDay() === 0;
// 「10월 18일(일)」 — 요일 글자는 성경암송 앱·교육 화면과 같은 꼴
export function dayLabel(ds) {
  if (!isDate(ds)) return "";
  const d = utc(ds);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WD1.charAt(d.getUTCDay())})`;
}
// 칩에 쓰는 짧은 꼴 「10/18(일)」
export function dayShort(ds) {
  if (!isDate(ds)) return "";
  const d = utc(ds);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD1.charAt(d.getUTCDay())})`;
}
export function addDays(ds, n) {
  if (!isDate(ds)) return "";
  const d = utc(ds);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// 서버가 준 마감 시각(ISO) → 「10월 17일(토) 저녁 7시」(한국 시각 · 분이 0 이 아니면 「오후 7시 30분」 꼴)
export function cutoffText(iso) {
  const t = Date.parse(iso || "");
  if (isNaN(t)) return "";
  const k = new Date(t + 9 * 3600 * 1000);
  const h = k.getUTCHours(), m = k.getUTCMinutes();
  const part = h < 12 ? "오전" : h < 18 ? "오후" : "저녁";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dayLabel(k.toISOString().slice(0, 10))} ${part} ${h12}시${m ? ` ${m}분` : ""}`;
}

// ---------- 자리 틀 ----------
export const slotName = (s) => [s && s.service, s && s.task].filter(Boolean).join(" ");
export const timeRange = (s) => [s && s.start, s && s.end].filter(Boolean).join("~");
// 「매주 주일 · 2부 설거지 · 11:30~12:30 · 2명」
export const lineText = (l) => [weekdayText(l && l.weekday), slotName(l), timeRange(l), `${(l && l.capacity) || 0}명`].filter(Boolean).join(" · ");
// 당번 카드의 자리 틀 요약 — 세 줄까지 적고 나머지는 수로
export function linesSummary(lines, max = 3) {
  const ls = (lines || []).filter((l) => l && l.active !== false);
  if (!ls.length) return "자리 틀이 아직 없어요";
  const head = ls.slice(0, max).map((l) => [weekdayText(l.weekday).replace(/^매주 /, ""), slotName(l), l.start, `${l.capacity}명`].filter(Boolean).join(" "));
  return head.join(" · ") + (ls.length > max ? ` 외 ${ls.length - max}개` : "");
}

// 틀 폼 값(글자) → 서버 line. 틀리면 { error: 한국말 }.
export function formToLine(v) {
  const o = v || {};
  const service = String(o.service || "").trim(), task = String(o.task || "").trim();
  if (!service) return { error: "예배·조 이름을 적어 주세요 (예: 2부 · 토요 · 김장)" };
  if (service.length > 12) return { error: "예배·조 이름은 12자까지 적을 수 있어요" };
  if (task.length > 20) return { error: "하는 일은 20자까지 적을 수 있어요" };
  if (!o.start || !o.end) return { error: "시작 시각과 끝 시각을 골라 주세요" };
  if (!(o.start < o.end)) return { error: "끝 시각이 시작 시각보다 늦어야 해요 (자정을 넘는 자리는 23:55 에서 끊어 주세요)" };
  const cap = String(o.capacity || "").trim();
  if (!/^\d+$/.test(cap) || Number(cap) < 1 || Number(cap) > 200) return { error: "정원은 1~200 사이 숫자로 적어 주세요" };
  const wd = o.weekday === "" || o.weekday === null || o.weekday === undefined ? null : Number(o.weekday);
  const line = { service, task, start: o.start, end: o.end, capacity: Number(cap), weekday: wd, sort: Number(o.sort) || 0 };
  if (o.id) line.id = Number(o.id);
  return { line };
}
export const lineToForm = (l) => ({ id: l && l.id ? String(l.id) : "", service: (l && l.service) || "", task: (l && l.task) || "", start: (l && l.start) || "",
  end: (l && l.end) || "", capacity: l && l.capacity ? String(l.capacity) : "2", weekday: l && l.weekday !== null && l.weekday !== undefined ? String(l.weekday) : (l ? "" : "0"),
  sort: l && l.sort ? String(l.sort) : "0" });

// 틀 저장 뒤 한 줄 — 만든 자리 · 정원을 바꾼 자리 · 요일을 바꿔 남긴 자리
export function lineSavedText(r, created) {
  const bits = [created ? "자리 틀을 더했어요" : "자리 틀을 고쳤어요"];
  if (r && r.made) bits.push(`자리 ${r.made}개를 만들었어요`);
  if (r && r.updated) bits.push(`앞날 자리 ${r.updated}개의 정원을 바꿨어요`);
  if (r && r.kept) bits.push(`옛 요일 자리 가운데 지원이 있는 ${r.kept}개는 남겨 두었어요 — 명단에서 옮기거나 쉬게 해 주세요`);
  return bits.join(" · ");
}
export function lineRemovedText(r) {
  if (r && r.deleted) return "자리 틀을 지웠어요";
  return r && r.kept ? `자리 틀을 뺐어요 — 지원이 있는 앞날 자리 ${r.kept}개는 남겨 두었어요(명단에서 옮기거나 쉬게 해 주세요)` : "자리 틀을 뺐어요 — 지난 자리는 기록으로 남아요";
}

// ---------- 당번 폼 ----------
// 폼 값(글자) → 서버 board. 틀리면 { error }.
export function formToBoard(v) {
  const o = v || {};
  const title = String(o.title || "").trim();
  if (!title) return { error: "당번 이름을 적어 주세요 (예: 식당 봉사)" };
  if (title.length > 40) return { error: "당번 이름은 40자까지 적을 수 있어요" };
  const max = String(o.maxAhead || "").trim();
  if (max && (!/^\d+$/.test(max) || Number(max) < 1 || Number(max) > 200)) return { error: "미리 잡아 둘 수 있는 자리 수는 1~200 사이 숫자로 적어 주세요 (비우면 제한 없음)" };
  const board = { title, description: String(o.description || "").trim(), place: String(o.place || "").trim(), contact_note: String(o.contact || "").trim(),
    open_days: Number(o.openDays) || 56, until_date: o.untilDate || "", max_ahead: max ? Number(max) : null, status: o.status || "draft" };
  if (o.id) board.id = o.id;
  return { board };
}
export const boardToForm = (b) => ({ id: (b && b.id) || "", title: (b && b.title) || "", description: (b && b.description) || "", place: (b && b.place) || "",
  contact: (b && b.contact) || "", openDays: String((b && b.openDays) || 56), untilDate: (b && b.untilDate) || "",
  maxAhead: b && b.maxAhead ? String(b.maxAhead) : "", status: (b && b.status) || "draft" });

// 당번 카드의 수 줄 — 「앞날 자리 16 · 빈 자리 5 · 못 온다는 분 1」
export function countsLine(c) {
  const n = c || {};
  if (!n.lines) return "자리 틀을 먼저 넣어 주세요";
  return [`앞날 자리 ${n.slots || 0}`, `빈 자리 ${n.need || 0}`, n.asks ? `못 온다는 분 ${n.asks}` : "", n.after ? `끝 날짜 뒤에 선 분 ${n.after}` : ""].filter(Boolean).join(" · ");
}
// 당번 설정 한 줄(명단 화면 머리·당번 카드) — 보이는 기간 · 끝 날짜 · 미리 잡는 수(장소·문의는 화면이 따로 그린다 — 문의의 전화는 눌러서 걸린다)
export function boardRest(b) {
  if (!b) return "";
  return [`앞으로 ${openDaysText(b.openDays)}까지 보여요`, b.untilDate ? `${dayLabel(b.untilDate)}까지` : "", b.maxAhead ? `한 분 ${b.maxAhead}자리까지` : ""].filter(Boolean).join(" · ");
}
// 문의 글 → HTML. 전화번호가 들어 있으면 눌러서 바로 걸리게(교육 강좌 카드와 같은 규칙 · 숫자만 tel: 로) — 나머지 글자는 모두 esc.
export function contactHtml(text) {
  const t = String(text ?? "");
  const m = t.match(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/);
  if (!m) return esc(t);
  return esc(t.slice(0, m.index)) + `<a href="tel:${m[0].replace(/\D/g, "")}">${esc(m[0])}</a>` + esc(t.slice(m.index + m[0].length));
}
// 지난 날을 얼마나 불러올 수 있나 — 52주. 서버 명단(duty_roster)은 끝을 안 준 요청이면 앞날(오늘 + 400일)과 지난 날(오늘 − 400일)을
//   **따로** 자른다 — 먼 앞날에 날짜를 더해 두어도 지난 날이 줄지 않는다(검토 반영 2026-10-06).
export const maxBack = () => 364;
// 명단을 어느 날부터 불러올까 — 「오늘 − back일」이 든 **달의 1일**부터(달을 통째로 읽는다).
//   달력은 한 달을 통째로 그린다 — 달 가운데서 자르면 아직 읽지 않은 지난 날짜가 「당번 없는 날」과 같은 칸으로 보인다
//   (매달 중순 뒤에는 그 달의 첫 주일들이 그랬다 — 독립 검토 반영 2026-10-07). 가장 멀어도(back 364) 오늘 − 394일 안쪽이라 서버가 자르는 곳(오늘 − 400일)보다 뒤다.
export function rosterFrom(today, back) {
  const d = addDays(today, -Math.max(0, Number(back) || 0));
  return d ? `${d.slice(0, 8)}01` : "";
}
// 명단을 실제로 읽을 처음 — rosterFrom 이되 **이 화면이 이 당번에서 이미 읽은 처음(read)보다 뒤로 가지 않는다**.
//   rosterFrom 은 달 단위로 뛴다: 화면을 연 채 날이 바뀌어 「오늘 − back」이 달을 넘으면(처음 화면은 매달 14 → 15일) 읽던 지난달이 통째로 빠지고,
//   그 달의 날을 보던 판이 저장 뒤 다른 날짜의 판으로 바뀐다(올리기 전 확인 2026-10-07 — 하루씩 읽던 앞 판에서는 창 끝의 하루만 빠졌다).
//   서버가 자르는 곳(오늘 − 400일)보다 앞으로는 가지 않는다 — 52주가 든 달의 1일(rosterFrom(today, maxBack()))까지만.
export function rosterFromKeep(today, back, read = "") {
  const want = rosterFrom(today, back), floor = rosterFrom(today, maxBack());   // 오늘을 모르면 둘 다 빈 글 — 아래도 빈 글을 돌려준다(처음을 보내지 않는다)
  const from = isDate(read) && read < want ? read : want;
  return from < floor ? floor : from;
}
// 「지난 날 더 보기」 한 번 뒤의 back — step(4주)씩 늘리되 **불러오는 달이 실제로 앞으로 갈 때까지**
//   (달의 29~31일에서 4주를 빼면 같은 달이라, 눌러도 같은 것을 다시 읽고 「더 지난 날짜가 없어요」라고만 하게 된다) · 52주까지.
//   read = 이미 읽은 처음(rosterFromKeep 이 지켜 준 것 — 날이 바뀐 뒤에는 「오늘 − back」의 달보다 앞일 수 있다): 그보다 앞 달이 될 때까지 간다.
export function olderBack(today, back, step = 28, read = "") {
  const max = maxBack(), s = Math.max(1, Number(step) || 28), at = rosterFrom(today, back), was = isDate(read) && at && read < at ? read : at;
  let b = Math.max(0, Number(back) || 0);
  do { b = Math.min(max, b + s); } while (was && b < max && rosterFrom(today, b) >= was);
  return b;
}
// 당번을 저장한 뒤 한 줄 — 끝 날짜 뒤에 선 분이 있으면 알린다
export function boardSavedText(r, created) {
  const base = created ? "당번을 만들었어요 — 「📅 당번 명단」에서 자리 틀을 넣어 주세요" : "저장했어요";
  return r && r.after ? `${base} · 끝 날짜 뒤에 지원 ${r.after}건이 있어요 — 명단에서 옮기거나 빼 주세요` : base;
}

// ---------- 날짜 칩 · 그날 판 ----------
// 처음 고를 날짜 — 오늘(자리가 있는 날) → 다음 날짜 → 마지막 날짜. 없으면 "".
export function initialDay(days, today, want = "") {
  const ds = (days || []).filter((d) => d && d.date);
  if (want && ds.some((d) => d.date === want)) return want;
  const next = ds.find((d) => d.date >= today);
  return next ? next.date : ds.length ? ds[ds.length - 1].date : "";
}
// 그날 살아 있는 지원 수(쉬는 자리 포함 — 쉼을 풀면 살아난다)
export const dayActive = (d) => ((d && d.slots) || []).reduce((n, s) => n + ((s.signups || []).length), 0);
// 칩 하나 — { date, label, tag, kind } · kind: off(쉼) · past(지난 날) · ask(못 온다는 분) · need(빈 자리) · full(다 참) · none(자리 없음 · 남은 자리뿐)
//   차례: 쉼 → 지난 날 → 자리 없음 → 자리 쉼 → 못 온다 → 남은 자리뿐 → 빈 자리 → 다 참. 확정(담당자)·잠김(전날 저녁)은 lock 으로 따로(🔒) · today = 오늘인 날(칩에 「오늘」).
export function dayChip(d, today = "") {
  const base = { date: d.date, label: dayShort(d.date), lock: d.locked === true && !d.off && !d.past, today: !!today && d.date === today };
  if (d.off) return { ...base, kind: "off", tag: "쉼" };
  if (d.past) return { ...base, kind: "past", tag: "지난 날" };
  if (!(d.slots || []).length) return { ...base, kind: "none", tag: "자리 없음" };
  // 자리를 하나씩 모두 쉬게 한 날 — 빈 자리가 0 이라고 「다 찼어요」로 보이면 안 된다(엑셀 당번표도 「쉼」으로 적는다)
  if (d.slots.every((s) => s.off)) return { ...base, kind: "off", tag: "자리 쉼" };
  if (d.asks > 0) return { ...base, kind: "ask", tag: `못 온다 ${d.asks}` };
  // 쉬지 않는 자리가 모두 남은 자리(뺀 틀·요일을 바꾼 틀)인 날 — 빈 자리 수에 안 들어 0 이지만 「다 찼어요」가 아니다(옮기거나 정리할 날)
  if (d.slots.every((s) => s.off || s.leftover)) return { ...base, kind: "none", tag: "남은 자리" };
  if (d.need > 0) return { ...base, kind: "need", tag: `빈 자리 ${d.need}` };
  return { ...base, kind: "full", tag: "다 찼어요" };
}
// 그날 상태 한 줄 — 「쉬는 날」/「담당자 확정」/「전날 저녁 자동 확정」/「…에 자동으로 확정돼요」
export function dayStateText(d) {
  if (!d) return "";
  const note = d.note ? ` — ${d.note}` : "";
  if (d.off) return `😴 쉬는 날${note}`;
  if (d.past) return `지난 날${note}`;
  if (d.confirmed) return `🔒 담당자 확정${note}`;
  if (d.locked) return `🔒 전날 저녁에 자동으로 확정됐어요${note}`;
  const at = cutoffText(d.cutoff);
  return `${at ? `${at}에 자동으로 확정돼요` : "아직 확정 전이에요"}${note}`;
}
// 그날이 앱에 안 보이는 까닭 한 줄(없으면 "") — 끝 날짜 뒤 · 보이는 기간 밖(미리 만들어 둔 날)
export function dayHiddenText(d) {
  if (!d || d.past) return "";
  if (d.afterUntil) return "끝 날짜 뒤라 앱에는 안 보이는 날이에요 — 선 분이 있으면 옮기거나 빼 주세요";
  if (d.notYet) return "보이는 기간 밖이라 앱에는 아직 안 보이는 날이에요(날이 가까워지면 저절로 보여요)";
  return "";
}
// 그날 판의 단추 — [{ act, label, danger? }] (보관한 당번은 없음 · 지난 날은 메모만)
//   확정: 아직 안 잠긴 오늘 이후 날 · 확정 풀기: 담당자가 확정했고 전날 저녁 마감 전(locked 이고 confirmed 인데 마감이 안 지남 = canUnconfirm)
//   서버가 늘 거절할 단추는 두지 않는다: 자리가 없는 날의 확정(no-slots).
export function dayActions(d, { archived = false, now = Date.now() } = {}) {
  if (!d || archived) return [];
  const out = [];
  const cut = Date.parse(d.cutoff || "");
  const beforeCut = !isNaN(cut) && now < cut;
  if (!d.past && !d.off) {
    if (!d.locked) { if ((d.slots || []).length) out.push({ act: "confirm", label: "이 날 확정" }); }
    else if (d.confirmed && beforeCut) out.push({ act: "unconfirm", label: "확정 풀기" });
  }
  if (!d.past) out.push(d.off ? { act: "reopen", label: "다시 열기" } : { act: "off", label: "쉬는 날로", danger: true });
  out.push({ act: "note", label: d.note ? "메모 고치기" : "메모" });
  return out;
}
// 자리 머리 — 「2부 설거지 · 11:30~12:30」 + 수 「1/2명」·「쉼」
export function slotCount(s) {
  const n = ((s && s.signups) || []).length, cap = (s && s.capacity) || 0;
  return { n, cap, need: Math.max(0, cap - n), over: n > cap, text: `${n}/${cap}명` };
}
// ---------- 달력(2026-10-07 친구 요청 — 「어드민에서도 달력으로 확인」 · 그리기는 roster-cal.js) ----------
// 날짜가 이 수 이상이면 날짜 칩 줄 대신 달력으로 고른다 — 성경암송 앱 달력(js/duty.js DUTY_CAL_MIN)과 같은 수. 한두 번짜리 모집(김장 등)은 칩 그대로.
export const CAL_MIN = 4;
export const calUse = (days) => (days || []).filter((d) => d && d.date).length >= CAL_MIN;
const YM_RE = /^\d{4}-\d{2}$/;
const ymOf = (ds) => String(ds || "").slice(0, 7);
// 날짜들이 걸친 달 — ["2026-10", "2026-11"] (이른 달부터 · 날짜가 없는 달은 건너뛴다)
export function calMonths(days) {
  const out = [];
  for (const d of days || []) { const ym = ymOf(d && d.date); if (YM_RE.test(ym) && !out.includes(ym)) out.push(ym); }
  return out.sort();
}
export const calTitle = (ym) => (YM_RE.test(String(ym || "")) ? `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월` : "");   // 2026년 10월
export const calMonthWord = (ym) => (YM_RE.test(String(ym || "")) ? `${Number(ym.slice(5, 7))}월` : "");                          // 10월 — 앞뒤 달 단추에
// 그 달의 칸들(일요일부터 · 주를 채운다) — 빈칸은 { date: "", n: 0 } · 날짜 칸은 { date: "YYYY-MM-DD", n: 날 }. 달의 꼴은 고르개 달력과 같은 함수(picker.js monthGrid).
export function calMonth(ym) {
  const s = String(ym || "");
  if (!YM_RE.test(s)) return [];
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7));
  if (!(m >= 1 && m <= 12)) return [];
  return monthGrid(y, m).flat().map((n) => (n ? { date: `${s}-${String(n).padStart(2, "0")}`, n } : { date: "", n: 0 }));
}
// 달력의 그날 한 칸 — 칩의 판정(dayChip: kind·tag·lock·today)에 「채워진 인원 n / 필요 인원 cap」을 더한다.
//   쉬는 자리는 세지 않는다 · 남은 자리(뺀 틀·요일을 바꾼 틀)는 서 있는 분만 센다(빈 칸은 필요 인원이 아니다 — 새 지원을 받지 않는다) ·
//   정원을 넘겨 넣은 자리는 정원까지만 센다(한 자리에 셋을 넣었다고 다른 빈 자리가 찬 것처럼 보이지 않게 — 자리 머리의 「3/2명」은 그대로 보인다).
//   → cap − n = 서버가 준 그날의 「빈 자리」(d.need — 성경암송 duty_roster 가 같은 규칙으로 센다). 성도님 앱 달력(dutyCalCell)과도 같은 수다 — **남은 자리 둘만 빼고**:
//     ① 지원 멈춤 당번의 남은 자리 ② 받는 중 당번에서 **보는 분 자신의 줄이 있는** 남은 자리(서 있거나 담당자가 뺀 줄 — 그분의 앱에서만).
//     앱은 그 자리가 남은 자리인지 받지 못해 정원을 모두 센다(정원 2 인 남은 자리에 혼자 선 분의 앱은 「1/2」 · 여기와 다른 분의 앱은 「1/1」 — 독립 검토 반영 2026-10-07).
export function calCell(d, today = "") {
  let n = 0, cap = 0;
  for (const s of (d && d.slots) || []) {
    if (!s || s.off) continue;
    const k = (s.signups || []).length, c = Math.max(0, Number(s.capacity) || 0), use = s.leftover ? Math.min(k, c) : c;
    cap += use; n += Math.min(k, use);
  }
  return { ...dayChip(d, today), n, cap };
}
// 칸에 적는 글 — 「1/2」 · 쉬는 날은 「쉼」 · 셀 것이 없는 날(자리가 없다 · 아무도 없는 남은 자리뿐)은 「–」
export const calMark = (c) => (c && c.kind === "off" ? "쉼" : c && c.cap > 0 ? `${c.n}/${c.cap}` : "–");
// 그 칸을 읽어 주는 말(단추의 이름 — 화면 낭독) — 「10월 18일(일) — 빈 자리 1 · 필요 3명 가운데 2명 채워졌어요 · 확정된 날 · 공휴일(개천절) · 오늘」
export function calLabel(d, c, hol = "") {
  const x = c || {};
  return [`${dayLabel(d && d.date)} — ${x.tag || ""}`, x.kind !== "off" && x.cap > 0 ? `필요 ${x.cap}명 가운데 ${x.n}명 채워졌어요` : "",
    x.lock ? "확정된 날" : "", hol ? `공휴일(${hol})` : "", x.today ? "오늘" : ""].filter(Boolean).join(" · ");
}
// 그 달(ym)에서 고를 날 — 칩과 같은 차례(initialDay: 오늘 이후 첫 날 → 마지막 날). 그 달에 날짜가 없으면 "".
export const calPick = (days, ym, today) => initialDay((days || []).filter((d) => d && ymOf(d.date) === ym), today);
// 앞뒤 달로 — 고른 날(day)의 달에서 날짜가 있는 앞(prev)·다음(next) 달로 가 그 달에서 고를 날을 준다. 그쪽에 달이 없으면 "".
export function calStep(days, day, dir, today) {
  const months = calMonths(days), at = months.indexOf(ymOf(day));
  const to = at < 0 ? "" : months[at + (dir === "next" ? 1 : -1)];
  return to ? calPick(days, to, today) : "";
}
// 「지난 날」을 더 불러와 새로 생긴 지난 날짜들 — before = 불러오기 전의 날짜 글자들 · after = 불러온 뒤의 days(그사이 저절로 생긴 앞날 자리는 세지 않는다)
const olderFresh = (before, after, today) => { const had = new Set(before || []); return (after || []).filter((d) => d && d.date && !had.has(d.date) && (!today || d.date < today)); };
// 달력에서 「◀ 지난 날」을 누른 뒤 고를 날 — 보던 달에 지난 날짜가 새로 생겼으면 그대로, 아니면 새로 생긴 앞 달의 마지막 날로 간다(새 날짜가 없으면 그대로).
export function olderPick(before, after, day, today) {
  const fresh = olderFresh(before, after, today);
  if (!fresh.length || fresh.some((d) => ymOf(d.date) === ymOf(day))) return day;
  return calStep(after, day, "prev", today) || day;
}
// 더 불러온 뒤의 한 줄 — 달력에서는 칸 하나가 더 생기는 것이라 눈에 잘 안 띈다. 새 날짜가 없으면 그렇다고 말한다(단추를 눌러도 아무 일이 없는 것처럼 보이지 않게).
export function olderText(before, after, back, today) {
  const n = olderFresh(before, after, today).length;
  return n ? `지난 날짜 ${n}개를 더 불러왔어요` : `지난 ${Math.round((Number(back) || 0) / 7)}주 안에는 더 지난 날짜가 없어요`;
}
// 달력에서 날짜를 누른 뒤, 그날 판이 화면 아래에 가려 있으면 얼마나 굴릴까(px · 0 = 그대로).
//   top = 그날 판의 위(화면 위에서부터) · viewH = 화면 높이 · keep = 적어도 이만큼은 보이게 · head = 머리줄 높이(판을 그 아래로는 올리지 않는다).
//   판이 달력 **아래**에 있을 때(폰)의 셈이다 — 달력 옆에 판이 있는 PC 에서는 calSettle 이 이 셈을 건너뛴다.
export function revealBy(top, viewH, { head = 56, keep = 220 } = {}) {
  const t = Number(top), h = Number(viewH);
  if (!(h > 0) || !Number.isFinite(t)) return 0;
  const short = keep - (h - t);
  return short <= 0 ? 0 : Math.max(0, Math.round(Math.min(short, t - head - 8)));
}
// 달력이 있는 명단을 다시 그린 뒤 화면을 어디에 둘까 — 순수 셈(roster.js 가 잰 값을 넣는다 · 모두 px · 독립 검토 반영 2026-10-07).
//   다시 그리면 그날 판의 길이가 달라진다. 판이 짧아지면 문서가 줄어 브라우저가 굴린 자리를 잘라 내고, 달력이 손끝에서 달아나 **같은 자리에 다른 단추가 온다**
//   (붙어 있는 달력의 달 단추를 이어 누르다 「쉬는 기간」 창이 열렸다). 그래서:
//   ① 굴린 자리를 지킨다(y0) — 문서가 모자라면 .dty-split 을 그만큼 늘린다(grow · 다음 그리기에서 다시 셈한다)
//   ② 달력을 눌렀고 그때 달력이 머리줄 아래에 **붙어 있었으면**(stuck = 붙은 선 · PC) 그날 판의 위를 그 선에 맞춘다 — 붙은 달력의 자리는 그대로이고 판은 맨 위부터 보인다.
//      붙지 않는 PC(낮은 화면)에서는 올리지 않는다 — 올리면 눌렀던 칸이 손끝에서 달아난다.
//   ③ 달력에서 날짜를 눌렀고(reveal) 그날 판이 달력 **아래**에 있으면(폰) 판이 보일 만큼만 내린다(revealBy — 짧은 판은 그 끝이 보일 때까지만)
//   ④ 자판으로 눌렀으면(kb) 손끝이 없다 — 초점(focusTop·focusBottom)이 머리줄 밑·화면 밖에 남지 않게: ③ 은 초점이 머리줄 아래에 남는 만큼만, 그래도 가려 있으면 보일 만큼 옮긴다.
//      ② 로 간 때에는 하지 않는다 — 그 초점은 **붙은 달력 안**(칸·달 단추)이라 문서를 굴려도 화면에서 제자리다. 문서와 함께 움직인다고 보고 셈하면
//      판이 맨 위도 굴린 자리도 아닌 가운데로 수백 px 튄다(올리기 전 확인 2026-10-07).
//   ⑤ 달력을 누르지 않았는데 **보이는 날(또는 당번)이 바뀐** 그리기(moved — 「옮기기」로 다른 날에 · 날짜 더하기 · 맡은 당번에서 빠져 남은 당번이 저절로 열림)는
//      ① 을 하지 않는다: 옛 날의 긴 판에서 굴려 둔 자리를 지키면 짧은 새 판이 화면 위로 사라지고 늘린 빈 자리만 남는다(올리기 전 확인 — 「옮기기」 뒤 빈 화면).
//      브라우저가 둔 자리(y)에서, 새 판의 위가 머리줄 아래 선보다 위에 있을 때만 그 선까지 올린다 — 아래로는 굴리지 않고 문서도 늘리지 않는다(지킬 손끝이 없다).
//   g = { y0: 그리기 전 굴린 자리 · y: 지금 굴린 자리 · viewH · endBottom: 내용의 끝(명단 화면의 아래끝) · splitTop · splitH · panelTop · panelBottom · focusTop · focusBottom · stuck · reveal · kb · moved }
//     — top·bottom 은 지금(y) 화면 기준 · 잴 수 없는 값은 null. 굴린 자리를 잴 수 없으면(y 없음) ③ 만 한다.
//     ⚠️ 문서의 끝은 **내용의 아래끝**으로 잰다(scrollHeight 가 아니다) — 내용이 화면보다 짧으면 scrollHeight 는 화면 높이라, 그것으로 셈하면 덜 늘려 달력이 내려간다(1920×1080 에서 잡았다).
//     ⚠️ 갈 자리가 맨 위(0)면 늘리지 않는다 — 맨 위는 늘 닿는다. 내용이 화면에 다 들어가는 큰 화면에서 처음 그릴 때부터 늘리면 올림 탓에 문서가 화면보다 1px 길어져
//        없던 세로 굴림줄이 생긴다(올리기 전 확인).
//   → { to: 먼저 갈 자리(바로 — null 이면 그대로) · by: 이어서 더 굴릴 거리(부드럽게) · grow: .dty-split 의 min-height(0 = 그대로) }
export function calSettle(g, { head = 56, keep = 220, gap = 8 } = {}) {
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const o = g || {}, y = num(o.y), viewH = num(o.viewH), panelTop = num(o.panelTop), splitTop = num(o.splitTop);
  if (viewH === null || !(viewH > 0)) return { to: null, by: 0, grow: 0 };
  const side = splitTop !== null && panelTop !== null && Math.abs(panelTop - splitTop) <= 4;   // 달력 옆에 판(PC 두 칸) — 달력이 보이면 판도 같은 높이에서 보인다
  if (y === null) return { to: null, by: o.reveal && panelTop !== null && !side ? revealBy(panelTop, viewH, { head, keep }) : 0, grow: 0 };
  const y0 = num(o.y0) ?? y, stuck = num(o.stuck), floor = head + gap;
  if (o.moved) return { to: Math.max(0, Math.round(panelTop === null ? y : Math.min(y, y + panelTop - floor))), by: 0, grow: 0 };   // ⑤
  const pinned = stuck !== null && splitTop !== null;   // ② — 붙어 있던 달력을 눌렀다
  let to = Math.max(0, Math.round(pinned ? y + splitTop - stuck : y0));
  const at = (v) => v + (y - to);   // 그 자리(to)로 간 뒤의 화면 기준 위치
  let by = 0;
  if (o.reveal && panelTop !== null && !side) {
    by = revealBy(at(panelTop), viewH, { head, keep });
    const end = num(o.panelBottom);
    if (by > 0 && end !== null) by = Math.max(0, Math.min(by, Math.ceil(at(end) - (viewH - gap))));
  }
  const fTop = num(o.focusTop), fBottom = num(o.focusBottom);
  if (o.kb && !pinned && fTop !== null && fBottom !== null) {
    by = Math.max(0, Math.min(by, Math.floor(at(fTop) - floor)));
    const t = at(fTop) - by, b = at(fBottom) - by;
    if (t < floor) to = Math.max(0, Math.round(to + (t - floor)));
    else if (b > viewH - gap) to = Math.round(to + Math.min(b - (viewH - gap), t - floor));
  }
  const end = num(o.endBottom), splitH = num(o.splitH);
  const short = end === null || splitH === null ? 0 : to + by + viewH - (y + end);   // 갈 자리의 화면 아래끝 − 내용의 끝(문서 기준)
  return { to, by, grow: short > 0 && to + by > 0 ? Math.ceil(splitH + short) : 0 };
}
// 앱 알림(확정·전날·담당자가 바꾼 것)이 실제로 나가는가 — 2026-10-06 3단계(성경암송 api internalDutyNotify)를 운영에 올려 true 로 바꿨다.
//   false 인 동안에는 「알림 꺼짐」 딱지를 그리지 않는다(딱지 없는 분께는 알림이 간다는 뜻으로 읽힌다 — 검토 반영 2026-10-06).
//   ⚠️ 알림을 되돌리면(api 의 internalDutyNotify 를 뺀 판으로) 이 값도 false 로 되돌린다.
export const NOTIFY_LIVE = true;
// 이 당번의 명단에 「알림 꺼짐」 딱지를 그릴까 — 알림이 나가는 때(NOTIFY_LIVE)이고 **받는 중·지원 멈춤 당번**일 때만. 준비 중·보관 당번의 줄에는 어떤 알림도
//   가지 않는다(성경암송 duty_notify_rows 가 그 당번의 줄을 주지 않는다) — 거기에 딱지를 달면 「딱지 없는 분께는 알림이 간다」로 읽힌다(검토 반영 2026-10-07).
export const notifyBadges = (status, live = NOTIFY_LIVE) => !!live && (status === "open" || status === "closed");
// 지원 줄의 딱지들 — [{ text, cls }] (앱/담당자 · 앱 없음 · 알림 꺼짐 · 시간 겹침 · 확정 뒤 지원 · 옮김 · 같은 분일 수 있어요)
export function signupBadges(e, { notify = NOTIFY_LIVE } = {}) {
  const out = [{ text: e.source === "staff" ? "담당자" : "앱", cls: "" }];
  if (!e.hasApp) out.push({ text: "앱 없음", cls: "warn", title: "앱 계정이 이어지지 않은 분이에요 — 앱의 내 당번·알림에 안 보이니 따로 알려 주세요" });
  else if (notify && !e.hasPush) out.push({ text: "알림 꺼짐", cls: "warn", title: "앱 알림을 받는 기기가 없어요 — 따로 알려 주세요" });
  if (e.overlap) out.push({ text: "시간 겹침", cls: "warn", title: "같은 날 시각이 겹치는 다른 자리에도 서 계세요 — 한쪽을 옮기거나 빼 주세요" });
  if (e.afterLock) out.push({ text: "확정 뒤 들어옴", cls: "" });
  if (e.moved) out.push({ text: "옮김", cls: "" });
  if (e.maybeDup) out.push({ text: "같은 분일 수 있어요", cls: "dup", title: "같은 날 같은 이름이 또 있어요 — 같은 분이면 한 줄을 빼 주세요" });
  return out;
}
// 「못 가게 됐어요」 까닭 말
export const ASK_WHY = { cant: "사정이 생겨 못 온대요", mistake: "잘못 눌렀대요", notme: "본인이 지원한 것이 아니래요" };
export const askText = (e) => (e && e.asked ? `⚠️ ${ASK_WHY[e.why] || "못 온다고 알렸어요"}` : "");
// 빠진 분 줄의 까닭
export const endedText = (e) => (e && e.reason === "staff" ? "담당자가 뺌" : e && e.reason === "merge" ? "기록을 합치며 정리" : "본인 취소");

// 옮길 자리 고르기 — 같은 당번의 다른 자리(쉬는 날·쉬는 자리·지난 날·끝 날짜 뒤 날 빼고 · 같은 날 자리는 지난 날이어도). 같은 날 먼저, 그다음 날짜 차례.
export function moveOptions(days, fromSlotId, fromDate) {
  const out = [];
  for (const d of days || []) {
    if (d.off || ((d.past || d.afterUntil) && d.date !== fromDate)) continue;   // 끝 날짜 뒤 날은 앱에 안 보인다 — 그리로 옮기지 않는다(같은 날 안에서는 된다)
    for (const s of d.slots || []) {
      if (s.off || s.id === fromSlotId) continue;
      const c = slotCount(s);
      out.push({ value: String(s.id), date: d.date, label: `${dayLabel(d.date)} · ${slotName(s)} ${s.start}`,
        hint: [c.text, c.need ? "" : "다 찼어요", d.locked && !d.past ? "확정된 날" : ""].filter(Boolean).join(" · ") });
    }
  }
  const rank = (o) => (o.date === fromDate ? 0 : 1);
  return out.sort((a, z) => rank(a) - rank(z) || (a.date < z.date ? -1 : a.date > z.date ? 1 : 0));
}

// ---------- 확인 창 글 ----------
// 정원·겹침을 넘겨 넣기/옮기기 전에 묻는 글 — r 은 서버 거절(full{active,capacity,with?} · overlap{with})
export function forceAsk(r, verb = "넣을까요") {
  const bits = [];
  if (r && r.error === "full") bits.push(`정원(${r.capacity}명)이 찼어요(지금 ${r.active}분).`);
  const w = r && r.with;
  if (w) bits.push(w.same && w.label ? `같은 날 겹치는 자리(${w.label})에 이미 서 계세요.` : "같은 날 다른 당번의 겹치는 시간에 이미 서 계세요.");
  if (!bits.length) return "";
  return `${bits.join(" ")} 그래도 ${verb}?`;
}
export const needsForce = (r) => !!r && !r.ok && (r.error === "full" || r.error === "overlap");
//   status = 당번 상태 — 받는 중일 때만 「빈 자리 지원은 계속 받아요」(지원 멈춤 당번은 앱 지원을 받지 않는다 — 담당자가 넣는다 · 검증 2026-10-06)
export function confirmDayAsk(d, status = "open") {
  const n = dayActive(d);
  return `${dayLabel(d.date)}을 확정할까요? 확정하면 성도님은 앱에서 취소·변경을 못 해요(지금 지원 ${n}건${d.need ? ` · 빈 자리 ${d.need}` : ""}). ` +
    (status === "open" ? "빈 자리 지원은 계속 받아요 — " : "빈 자리는 담당자가 「넣기」로 채워요 — ") + "바꿀 일은 담당자가 넣기·빼기·옮기기로 해요.";
}
export const unconfirmAsk = (d) => `${dayLabel(d.date)}의 확정을 풀까요? 풀면 앱으로 지원한 분은 다시 스스로 취소할 수 있어요` +
  `(담당자가 넣은 분은 그대로 못 빼요 · ${cutoffText(d.cutoff) || "전날 저녁"}에는 다시 자동으로 확정돼요).`;
// 쉬는 날로 / 다시 열기 — active = 그 기간에 살아 있는 지원 **줄 수**(서버가 센 값 — 한 분이 여섯 주를 서 있으면 6) · days = 바뀌는 날 수
//   ⚠️ 그래서 「N분」이 아니라 「지원 N건」이라고 말한다 — 저장 뒤의 「N분께 앱 알림을 보냈어요」는 사람 수라, 줄 수를 「분」이라 하면 한 화면의 두 수가 어긋난다
//      (확정·당번 숨기기·끝 날짜 당기기의 확인 글도 같다 — 고침 검토 반영 2026-10-07).
//   tail = 덧붙일 한 마디(날 판의 「다시 열기」가 그날 메모를 함께 지울 때 그 글)
export function offAsk({ from, to, off, active, days, tail = "" }) {
  const span = from === to ? dayLabel(from) : `${dayLabel(from)} ~ ${dayLabel(to)}`;
  if (!days) return off ? `${span}에는 쉬게 할 날이 없어요(자리가 없거나 이미 쉬는 날이에요).` : `${span}에는 다시 열 날이 없어요.`;
  const dn = from === to ? "" : ` ${days}일`;
  if (off) {
    return `${span}${dn}을 쉬는 날로 바꿀까요?` + (active ? ` 이미 들어온 지원 ${active}건은 그분들 앱에 「이날은 쉬어요」로 보여요 — 지원은 지우지 않고 두었다가 다시 열면 그대로 살아나요.` : " 아직 지원한 분은 없어요.");
  }
  return `${span}${dn}을 다시 열까요?` + (active ? ` 쉬기 전의 지원 ${active}건이 그대로 살아나요.` : "") + (tail ? ` ${tail}` : "");
}
// 빼기 확인 — 앱 계정이 이어진 분은 뺀 뒤 스스로 다시 지원하지 못한다(계정 없이 넣은 줄은 그 말이 맞지 않아 뺀다 — 검토 반영)
//   **같은 자리에 같은 이름의 줄이 또 있을 때** 앱에 이어진 줄을 빼려 하면 말한다 — 서버는 같은 자리에 같은 이름의 살아 있는 줄이 남으면 「빼 드렸어요 — 안 나오셔도 돼요」
//   알림을 보내지 않는다(겹친 줄을 정리한 것으로 본다 — 그분은 남은 줄로 서 있다 · 성경암송 duty_notify_rows 의 dup). 그래서 범위도 서버와 같다(같은 자리 — slotTwins).
//   ⚠️ 다른 자리의 같은 이름(한 분의 두 당번 · 동명이인)에는 말하지 않는다 — 「이 줄은 두고 앱 없음 줄을 빼 주세요」가 다른 당번의 줄을 가리키게 된다
//      (고침 검토 반영 2026-10-07). 그 줄들의 딱지 「같은 분일 수 있어요」(그날 전체 — maybeDup)는 그대로다.
const nameKey = (v) => String(v == null ? "" : v).normalize("NFC").replace(/\s+/g, "");
// 같은 자리에 선 같은 이름의 다른 줄 — any: 있다 · noApp: 그 가운데 앱에 안 이어진 줄(「앱 없음」)이 있다
export function slotTwins(e, s) {
  const k = nameKey(e && e.name);
  const list = k ? ((s && s.signups) || []).filter((x) => x && x.id !== e.id && nameKey(x.name) === k) : [];
  return { any: list.length > 0, noApp: list.some((x) => !x.hasApp) };
}
const DUP_REMOVE_HEAD = "⚠️ 이 자리에 같은 이름의 줄이 또 있어요 — 같은 이름의 줄이 남아 있는 동안에는 이 줄을 빼도 그분께 앱 알림이 가지 않아요.";
// 남는 줄 가운데 「앱 없음」 줄이 있다 — 같은 분의 겹친 줄이면 그 줄을 빼는 것이 맞다(앱에 이어진 줄이 남아야 그분 앱·알림에 보인다)
//   ⚠️ 「…차례로 빼야 앱 알림이 **가요**」라고 약속하지 않는다 — 준비 중 당번·지난 날·오늘 끝난 자리·문이 닫힌 동안의 시험 참여자 아닌 분께는 차례를 지켜도 알림이 없다
//      (화면은 그 저장이 알림 대상인지 모른다). 어느 경우에도 참인 꼴로 쓴다: 「이 줄을 먼저 빼면 앱 알림을 보내지 않아요」(회귀 확인 반영 2026-10-07).
export const DUP_REMOVE_NOAPP = `${DUP_REMOVE_HEAD} 같은 분의 겹친 줄이면 이 줄(앱에 이어진 줄)은 두고 「앱 없음」 줄을 빼 주세요 — 그분을 아예 빼려면 「앱 없음」 줄을 먼저 빼 주세요(이 줄을 먼저 빼면 앱 알림을 보내지 않아요). 다른 분이면 따로 알려 주세요.`;
// 남는 줄이 모두 앱에 이어진 줄이다(동명이인 · 한 분의 옛 계정과 새 계정) — 가리킬 「앱 없음」 줄이 없다
export const DUP_REMOVE_APP = `${DUP_REMOVE_HEAD} 빼는 분께 따로 알려 주세요.`;
// 지난 날의 줄(앱에 이어진 분)을 뺄 때 — 성경암송 앱의 「지난 봉사」(그분의 봉사 이력 · 2026-10-07)는 **지난 날짜의 당번표에 남아 있는 줄**을 센다:
//   빼면 그분의 이력에서도 빠진다(안 오신 분을 바로잡는 길이 이것이다). 「스스로 다시 지원할 수 없어요」는 지난 날에는 할 말이 아니다(지난 날에는 누구도 지원하지 못한다).
export const REMOVE_PAST_NOTE = " 지난 날짜의 줄을 빼면 그분 앱의 「지난 봉사」에 남지 않아요(안 오신 분을 바로잡을 때 이렇게 해요).";
export const removeAsk = (e, d, s) => {
  const twins = e.hasApp ? slotTwins(e, s) : { any: false, noApp: false };
  return `${e.name} 님을 ${dayLabel(d.date)} ${slotName(s)}에서 뺄까요?` +
    (e.hasApp ? (d && d.past ? REMOVE_PAST_NOTE : " 뺀 분은 앱에서 이 자리에 스스로 다시 지원할 수 없어요.") : "") + " 잘못 뺐으면 「빠진 분」에서 다시 넣을 수 있어요." +
    (twins.any ? ` ${twins.noApp ? DUP_REMOVE_NOAPP : DUP_REMOVE_APP}` : "");
};
export const restoreAsk = (e, d, s) => `${e.name} 님을 ${dayLabel(d.date)} ${slotName(s)}에 다시 넣을까요? 빠지기 전 그 줄이 그대로 살아나요.`;
export const restoredText = (r, name) => (r && r.already ? `${name} — 이미 서 계세요` : `${name} — 다시 넣었어요${notifyTail(r)}`);
export function slotOffAsk(s, off) {
  const n = ((s && s.signups) || []).length;
  return off ? `${slotName(s)} 자리만 쉬게 할까요?${n ? ` 지원한 ${n}분께는 「쉬어요」로 보여요(지원은 그대로 두었다가 다시 열면 살아나요).` : ""}`
    : `${slotName(s)} 자리를 다시 열까요?${n ? ` 지원한 ${n}분의 자리가 그대로 살아나요.` : ""}`;
}
// 당번을 앱에서 안 보이게 바꿀 때(받는 중·지원 멈춤 → 준비·보관) — 앞날에 선 분이 있으면
export const hideAsk = (active, status) => `앞날에 지원 ${active}건이 있어요. 그래도 「${STATUS_LABEL[status] || status}」으로 바꿀까요? 그분들 앱에서 이 당번과 내 당번이 사라져요(지원 줄은 지우지 않아요).`;
// 성경암송 앱에 봉사 당번 화면이 있는가 — 2026-10-06 2단계(앱 화면 + api 성도님 액션)를 운영에 올려 true 로 바꿨다(시험 한 줄도 함께).
//   false 인 동안에는 「시험 참여자에게 보여요」라고 말하지 않는다 — 앱에 화면이 아예 없다(검토 반영 2026-10-06).
//   ⚠️ 앱 쪽 2단계를 되돌리면(성경암송 화면 revert) 이 값도 false 로 되돌린다.
export const APP_LIVE = true;
// 앱에 아직 열지 않은 동안(문 dutyOpen 닫힘) — 받는 중·지원 멈춤 당번에 선 분의 이름이 🧪 시험 참여자 앱에 보인다.
//   개인정보 안내에 적기 전이라 진짜 명단은 「준비 중」에 넣어 두게 한다(설계 §11 ⚠️ · 검토 반영 2026-10-06).
export const TESTERS_SEE_NAMES = "받는 중·지원 멈춤 당번에 선 분의 이름이 시험 참여자 앱에 보여요 — 앱에 열기 전에는 시험 당번만 열어 두고, 진짜 명단은 「준비 중」 당번에 넣어 두세요";
// 플레이스토어 앱에서는 🙋 단추를 숨겨 두었다(성경암송 app.js `MINISTRY_HIDE_ON_PLAY` — 심사가 끝난 날 그쪽을 false 로 뒤집을 때 이 값도 false 로).
//   그 앱을 쓰는 시험 참여자에게는 「시험 참여자만 볼 수 있어요」라는 말과 달리 단추가 없다 — 까닭을 화면이 말한다(검증 2026-10-06).
export const PLAY_HIDDEN = true;
export const PLAY_NOTE = "플레이스토어 앱에서는 심사가 끝날 때까지 🙋 단추가 보이지 않아요 — 안드로이드는 크롬으로 열어 확인해 주세요";
// ── 앱 당번표에 무엇이 보이나(받는 중·지원 멈춤 당번) ──
//   앱(duty_board_view)은 오늘 ~ 오늘+보이는 기간 · 끝 날짜까지의 **자리가 있는 날**만 보여 준다. 그래서 「앱에 날짜가 안 보여요」는 그 범위의 자리 수(shown)가 0 일 때만 참이다.
//   o = { lines: 살아 있는 자리 틀 수 · shown: 그 범위의 자리 수 · later: 범위 밖(끝 날짜 안)의 앞날 자리 수 · untilPast: 끝 날짜가 지났다 }
//   → ""          날짜가 보이고 틀도 있다(또는 준비 중·보관 — 앱에 없다)
//     "no-lines"  틀도 자리도 없다(당번 설정만 저장하고 열었다 — 친구 제보 2026-10-06)
//     "leftover"  살아 있는 틀은 없는데 남은 자리(지원이 달려 못 지운 자리)의 날짜·이름은 앱에 보인다 — 「날짜가 안 보여요」라고 하면 거짓이다
//     "until-past" 끝 날짜가 지났다 · "later" 자리가 모두 보이는 기간 밖이다(가까워지면 저절로 보인다 — 김장처럼 먼 날짜를 더해 둔 당번)
//     "no-dates"  틀은 있는데 보일 날짜가 없다(날짜를 골라 넣는 틀에 날짜를 아직 안 더함 · 끝 날짜가 첫 날보다 이름)
export function emptyKind(status, o = {}) {
  if (status !== "open" && status !== "closed") return "";
  const v = o || {}, lines = Number(v.lines) > 0;
  if (Number(v.shown) > 0) return lines ? "" : "leftover";
  if (v.untilPast === true) return "until-past";
  if (Number(v.later) > 0) return "later";
  return lines ? "no-dates" : "no-lines";
}
const EMPTY_WHY = {
  "no-lines": "자리 틀이 아직 없어요 — 앱 당번표에 날짜가 보이지 않아 지원할 수 없어요. 「자리 틀」에서 먼저 넣어 주세요(예: 매주 주일 · 2부 · 설거지 · 11:30~12:30 · 2명)",
  leftover: "살아 있는 자리 틀이 없어요 — 앱 당번표에는 남은 자리의 날짜와 선 분 이름만 보이고, 새 날짜가 생기지 않아 지원을 받지 않아요. 「자리 틀」에서 넣어 주세요",
  "until-past": "끝 날짜가 지났어요 — 앱 당번표에 날짜가 보이지 않아요. 계속 받으려면 「당번 설정」에서 끝 날짜를 늦추거나 비워 주세요",
  later: "앞날 자리가 모두 보이는 기간 밖이에요 — 앱 당번표에는 아직 날짜가 보이지 않아요(날이 가까워지면 저절로 보여요). 지금부터 받으려면 「당번 설정」의 「얼마나 앞까지 보여 줄까요」를 늘려 주세요",
  "no-dates": "앱에 보이는 날짜가 없어요 — 「날짜 더하기」로 날짜를 넣거나 끝 날짜를 확인해 주세요",
};
const EMPTY_CHIP = {
  "no-lines": "자리 틀 없음 — 앱에 날짜가 안 보여요", leftover: "자리 틀 없음 — 앱에 남은 자리만 보여요", "until-past": "끝 날짜 지남 — 앱에 날짜가 안 보여요",
  later: "보이는 기간 밖 — 앱에 아직 날짜가 안 보여요", "no-dates": "날짜 없음 — 앱에 날짜가 안 보여요",
};
// 📅 당번 명단 머리의 한 줄 · 🧰 당번 카드의 경고 칩(없으면 "")
export const emptyWhy = (status, o) => EMPTY_WHY[emptyKind(status, o)] || "";
export const emptyChip = (status, o) => EMPTY_CHIP[emptyKind(status, o)] || "";
// 살아 있는 자리 틀 수(목록의 lines 는 살아 있는 것만 · 명단의 lines 는 active 칸이 있다)
export const liveLineCount = (lines) => (Array.isArray(lines) ? lines : []).filter((l) => l && l.active !== false).length;
// emptyKind 의 재료 — 🧰 당번 관리(목록)에서: counts.shown 은 서버(duty_board_counts)가 준다. 옛 서버면 칸이 없다 → slots 로 본다
//   (slots = 끝 날짜까지의 앞날 자리 — 보이는 기간으로 자르지 않은 수라 「보이는 기간 밖뿐인 당번」을 못 가린다. 0 이면 shown 도 0 이라 거짓 경고는 없다)
export function seenOfCounts(b, today = "") {
  const n = (b && b.counts) || {}, known = n.shown !== null && n.shown !== undefined, slots = Number(n.slots) || 0, shown = known ? Number(n.shown) || 0 : slots;
  return { lines: liveLineCount(b && b.lines), shown, later: known ? Math.max(0, slots - shown) : 0, untilPast: !!(b && b.untilDate && today && b.untilDate < today) };
}
// emptyKind 의 재료 — 📅 당번 명단에서: 날짜마다 past·notYet(보이는 기간 밖)·afterUntil(끝 날짜 뒤)이 온다(duty_roster) — 앱과 같은 범위로 센다
export function seenOfRoster(ros, today = "") {
  const days = (ros && ros.days) || [], b = (ros && ros.board) || {};
  const cnt = (keep) => days.filter((x) => x && !x.past && !x.afterUntil && keep(x)).reduce((k, x) => k + ((x.slots || []).length), 0);
  return { lines: liveLineCount(ros && ros.lines), shown: cnt((x) => !x.notYet), later: cnt((x) => x.notYet === true), untilPast: !!(b.untilDate && today && b.untilDate < today) };
}
// 「받는 중」으로 바꾸는 저장의 확인 글 — appOpen = 봉사 당번이 성도님 앱에 열렸는가(서버가 준다 · app_config dutyOpen)
//   kind = emptyKind("open", …) — 열어도 앱에 지원할 날짜가 없으면 그 까닭을 한 줄 덧붙인다(막지는 않는다 — 저장한 뒤 넣어도 된다).
//   ⚠️ 같은 저장이 끝 날짜·보이는 기간도 바꾸면 저장 뒤의 날짜를 알 수 없다 — 부르는 쪽(board-form.js)이 틀에 관한 말(no-lines·leftover)만 남긴다.
const OPEN_TAIL = {
  "no-lines": " ⚠️ 자리 틀이 아직 없어요 — 넣기 전에는 앱 당번표에 날짜가 보이지 않아 지원할 수 없어요(저장한 뒤 「📅 당번 명단」의 「자리 틀」에서 넣어 주세요).",
  leftover: " ⚠️ 살아 있는 자리 틀이 없어요 — 앱 당번표에는 남은 자리의 날짜만 보이고 새 지원은 받지 않아요(「📅 당번 명단」의 「자리 틀」에서 넣어 주세요).",
  "until-past": " ⚠️ 끝 날짜가 지났어요 — 끝 날짜를 늦추거나 비우기 전에는 앱 당번표에 날짜가 보이지 않아 지원할 수 없어요.",
  later: " ⚠️ 앞날 자리가 모두 보이는 기간 밖이에요 — 날이 가까워질 때까지 앱 당번표에 날짜가 보이지 않아요(지금부터 받으려면 「얼마나 앞까지 보여 줄까요」를 늘려 주세요).",
  "no-dates": " ⚠️ 앱에 보이는 날짜가 아직 없어요 — 「📅 당번 명단」의 「날짜 더하기」로 날짜를 넣기 전에는 지원할 수 없어요.",
};
export const openWarn = (appOpen, opt = {}) => openWarnBase(appOpen, opt) + (OPEN_TAIL[opt.kind] || "");
const openWarnBase = (appOpen, { live = APP_LIVE, play = PLAY_HIDDEN } = {}) => (!live
  ? "「받는 중」으로 저장해요. 성경암송 앱에는 아직 봉사 당번 화면이 없어서 지금은 성도님께 보이지 않아요 — 화면이 열리는 날 이 당번이 바로 보이고 지원을 받아요."
  : appOpen
    ? "「받는 중」으로 저장하면 성경암송 앱의 🙋 봉사 당번 신청에 이 당번이 바로 보이고 지원을 받아요."   // 앱의 단추·화면 제목과 같은 이름(2026-10-07 「봉사 당번」 → 「봉사 당번 신청」)
    : `「받는 중」으로 저장해요. 봉사 당번은 아직 성도님 앱에 열지 않아서, 지금은 🧪 시험 참여자에게만 보여요 — 앱에 열리는 날 이 당번이 바로 보이고 지원을 받아요. ⚠️ ${TESTERS_SEE_NAMES}.${play ? ` ${PLAY_NOTE}.` : ""}`);
// 화면 머리에 두는 안내 한 줄(사실대로 · 없으면 "") — 앱에 화면이 없다 / 아직 열지 않았다(시험 참여자만) / 앱 알림이 아직 안 나간다.
//   문이 닫힌 동안에는 알림이 나가도(NOTIFY_LIVE) 시험 참여자에게만 간다 — 그렇게 말한다.
//   알림 말은 문(appOpen)과 따로다 — 문을 열어도 알림(3단계 · NOTIFY_LIVE)이 올라가기 전에는 「따로 알려 주세요」가 그대로 뜬다.
export function appNote(appOpen, { live = APP_LIVE, notify = NOTIFY_LIVE, play = PLAY_HIDDEN } = {}) {
  const tell = "넣거나 바꾼 것은 그분께 따로 알려 주세요";
  if (!live) return `🙈 성경암송 앱에는 아직 봉사 당번 화면이 없어요 — 지금 넣는 것은 준비예요. 성도님께는 보이지도 알림이 가지도 않으니 ${tell}.`;
  if (!appOpen) return `🙈 봉사 당번은 아직 성도님 앱에 열지 않았어요 — 지금은 🧪 시험 참여자만 볼 수 있어요. ⚠️ ${TESTERS_SEE_NAMES}.` + (play ? ` ${PLAY_NOTE}.` : "") +
    // 알림이 나가는 때에도 문이 닫힌 동안에는 시험 참여자에게만 간다(성경암송 api dutyNotifySend — 앱에서 🙋 가 보이는 분과 같은 규칙) — 「알림 꺼짐」 딱지가 없다고 그분께 알림이 가는 것이 아니다
    (notify ? ` 앱 알림도 시험 참여자에게만 가요 — 다른 분께는 ${tell}.` : ` 앱 알림도 아직 보내지 않으니 ${tell}.`);
  return notify ? "" : `🔕 앱 알림(확정·전날·담당자가 바꾼 것)은 아직 보내지 않아요 — ${tell}.`;
}
// 설정 창을 연 뒤 다른 분이 그 당번을 고쳤을 때(dutyBoardSave changed) — 창을 닫고 새로 불러온 뒤 알린다
export const STALE_BOARD = "그사이 다른 분이 이 당번 설정을 고쳤어요 — 새로 불러왔어요. 다시 확인하고 고쳐 주세요";
// 끝 날짜를 당기는 저장 — 그 뒤에 선 분이 있을 때
export const afterAsk = (active, until) => `새 끝 날짜${dayLabel(until) ? `(${dayLabel(until)})` : ""} 뒤에 지원 ${active}건이 있어요. 그래도 끝 날짜를 당길까요? ` +
  "그 뒤 날짜는 앱에서 안 보이게 돼요(지원 줄은 지우지 않아요 — 명단에서 옮기거나 빼 주세요).";
// 넣기 창의 안내 한 줄 — ① 담당자가 넣은 분은 앱에서 스스로 못 뺀다 ② 못 오시면 앱의 「못 가게 됐어요」로 이 명단에 표시가 뜬다
//   (담당자 휴대폰으로 가는 알림이 아니다 — 명단을 열어야 보인다) ③ 넣은 분(앱을 안 쓰는 분·새가족 포함)의 이름이 앱 당번표에 보인다(설계 §0-1 ⑫ —
//   받는 중·지원 멈춤 당번일 때 · 준비 중·보관 당번은 앱에 없다).
//   ⚠️ 지난 날·끝 날짜 뒤·보이는 기간 밖 날에도 「넣기」가 있다(담당자 길은 그 날짜도 받는다) — 그날은 앱 당번표에 실리지 않으므로 「보여요」라고 하지 않는다
//      (「내 당번」은 오늘 이후 내 줄을 보이는 기간과 무관하게 싣는다 — 앱을 쓰는 분께는 거기에 보인다 · 검증 2026-10-06).
const ADD_BASE = "담당자가 넣은 분은 앱에서 스스로 뺄 수 없어요 — 못 오시면 앱의 「못 가게 됐어요」로 이 명단에 표시해 와요(담당자께 따로 알림은 오지 않아요)";
export function addNote(d) {
  // 지난 날 — 앱 당번표에는 실리지 않는다. 다만 앱에 이어진 분께는 「지난 봉사」(봉사 이력 · 2026-10-07)에 보인다(준비 중 당번은 빼고) — 「앱에는 보이지 않아요」라고만 하면 사실이 아니다
  if (d && d.past) return "지난 날짜예요 — 앱 당번표에는 보이지 않아요(명단에 기록으로 남고, 앱을 쓰는 분께는 「지난 봉사」에 보여요 — 준비 중 당번은 빼고)";
  if (d && d.afterUntil) return `${ADD_BASE} · 끝 날짜 뒤라 이 날짜는 앱 당번표에 보이지 않아요(앱을 쓰는 분의 「내 당번」에는 보여요)`;
  if (d && d.notYet) return `${ADD_BASE} · 보이는 기간 밖이라 이 날짜는 앱 당번표에 아직 안 보여요(앱을 쓰는 분의 「내 당번」에는 보이고, 날이 가까워지면 당번표에도 이름이 보여요)`;
  return `${ADD_BASE} · 넣은 분의 이름은 받는 중·지원 멈춤 당번이면 성경암송 앱 당번표에 보여요(이름만)`;
}
export const ADD_NOTE = addNote(null);
// 넣기 창 머리의 한 줄 더 — 이 자리의 「빠진 분」에 앱에 이어진 줄이 있을 때. 그분을 다시 넣는 맞는 길은 「빠진 분 → 다시 넣기」다(그 줄이 그대로 살아나 앱·알림에 이어진다).
//   「＋ 넣기」는 이번 명부 찾기가 앱 계정을 못 맞추면(명부와 앱의 소속 글자가 다르다 · 직접 입력) 그 줄을 되살리지 못하고 **앱에 안 이어진 새 줄**을 만든다 —
//   그분 앱에는 여전히 「담당자가 빼 드렸어요」이고 「넣어 드렸어요」 알림도 가지 않는다(서버는 두 줄이 같은 분인지 알 길이 없다 · 고침 검토 반영 2026-10-07).
//   넣기 **전에** 말한다(넣은 뒤에는 두 줄을 이을 길이 없다). 이름만으로는 같은 분인지 모르므로 「그분을 다시 넣으려면」이라고 조건으로 쓴다.
export function addEndedNote(slot) {
  const names = [...new Set(((slot && slot.ended) || []).filter((e) => e && e.hasApp && e.name).map((e) => e.name))];
  if (!names.length) return "";
  const who = names.slice(0, 3).join(" · ") + (names.length > 3 ? ` 외 ${names.length - 3}분` : "");
  return `⚠️ 이 자리에서 빠진 분 가운데 앱에 이어진 분이 있어요(${who}) — 그분을 다시 넣으려면 여기 말고 명단의 「빠진 분 → 다시 넣기」를 써 주세요. 여기서 넣으면 그분 앱·알림에 이어지지 않은 새 줄이 될 수 있어요.`;
}
// 준비 중인 당번의 안내 — 총괄은 스스로 열 수 있고, 담당은 총괄께 부탁한다
//   준비 중에는 앱 알림도 가지 않는다(넣기·확정·빼기 모두) — 그 말을 함께 한다(문이 닫힌 동안 진짜 명단을 넣어 두라고 권하는 자리가 여기다)
const DRAFT_NO_NOTIFY = " 준비 중에는 넣기·확정을 해도 앱 알림이 가지 않아요.";
export const draftNote = (chief) => (chief
  ? "아직 앱에 안 보이는 당번이에요(준비 중) — 자리 틀을 넣고 「당번 설정」에서 상태를 「받는 중」으로 바꾸면 지원을 받아요."
  : "아직 앱에 안 보이는 당번이에요(준비 중) — 자리 틀을 넣은 뒤 당번 총괄께 「받는 중」으로 열어 달라고 말씀해 주세요.") + DRAFT_NO_NOTIFY;

// ---------- 저장 뒤 한 줄 ----------
// 알림(3단계) — notified(실제로 나간 분) · missed(가지 않은 분) · notifyError 가 있으면 덧붙인다
//   ⚠️ 「보냈어요」는 **실제로 나간 분 수**로만 말한다 — 앱 계정은 있어도 알림을 켜지 않은 분이 많다. 그분까지 세어 「보냈어요」라고 하면 담당자가 따로 알리지 않는다
//      (같은 명단의 「알림 꺼짐 — 따로 알려 주세요」 딱지와도 어긋났다 · 뺀 뒤에는 그 딱지도 안 보인다 · 검토 반영 2026-10-07).
//   가지 않은 까닭은 넘겨짚지 않는다(받는 기기가 없다 · 보낸 것이 모두 실패했다 — 화면은 어느 쪽인지 모른다).
export function notifyTail(r) {
  if (!r || r.notifyError === undefined) return "";
  if (r.notifyError === "notify-off") return " · 앱 알림은 지금 꺼 두었어요 — 그분께 따로 알려 주세요";
  if (r.notifyError) return " · 앱 알림은 보내지 못했어요 — 그분께 따로 알려 주세요";
  const sent = Number(r.notified) || 0, missed = Number(r.missed) || 0;
  return (sent ? ` · ${sent}분께 앱 알림을 보냈어요` : "") + (missed ? ` · ${missed}분께는 앱 알림이 가지 않았어요 — 따로 알려 주세요` : "");
}
// 알림을 보내지 못한 저장인가(부르지 못함 · 꺼 둠) — 그때는 지나가는 토스트가 아니라 창으로 알린다(roster-forms.js sayDone)
export const notifyFailed = (r) => !!(r && r.notifyError);
// 날짜 확정 뒤 한 줄 — 알림을 부르지 못했으면(notify-failed) 다시 보내 볼 길을 말한다. ⚠️ **약속하지 않는다**: 다시 확정해 실제로 가는 것은 아직 잡히지 않은 줄뿐이다
//   (잡은 뒤 끊긴 줄 · 받는 기기가 없던 분 · 문이 닫힌 동안의 시험 참여자 아닌 분께는 다시 가지 않는다 — 화면은 어느 쪽인지 모른다). 그래서 「다시 보내요」가 아니라
//   「한 번 더 보내 봐요 — 그때 『N분께 보냈어요』가 안 뜨면 따로」라고 말한다. status = 당번 상태 — 준비 중·보관 당번은 알림이 없어 그 길을 말하지 않는다
//   (고침 검토 반영 2026-10-07 · 이미 받은 분은 서버가 한 번만 보낸다).
export const CONFIRM_RETRY = " (「확정 풀기」 뒤 다시 확정하면 아직 보내지 못한 분께 한 번 더 보내 봐요 — 그때 「N분께 앱 알림을 보냈어요」가 뜨지 않으면 다시 보내지 못한 것이니 따로 알려 주세요)";
export const confirmDoneText = (r, date, status = "open") => (r && r.already ? "이미 확정된 날이에요"
  : `${dayLabel(date)}을 확정했어요${notifyTail(r)}${r && r.notifyError === "notify-failed" && notifyBadges(status, true) ? CONFIRM_RETRY : ""}`);
export function addDoneText(r, name) {
  const base = r && r.already ? `${name} — 이미 이 자리에 서 계세요` : r && r.revived ? `${name} — 다시 넣었어요` : `${name} — 넣었어요`;
  return base + (r && r.locked && !r.already ? " (확정된 날)" : "") + notifyTail(r);
}
export const movedText = (r, name) => (r && r.already ? "같은 자리예요" : `${name} — ${r && r.to ? `${dayLabel(r.to.date)} ${slotName(r.to)}(${r.to.start})` : "새 자리"}로 옮겼어요${notifyTail(r)}`);
// reopened = 이미 있던 남은 자리(요일을 바꾼 틀의 옛 요일 자리)를 다시 살린 수 — 앱에서 지원을 다시 받는다
export const dateAddedText = (r, date) => (r && (r.made || r.reopened)
  ? [r.made ? `${dayLabel(date)}에 자리 ${r.made}개를 만들었어요` : "",
     r.reopened ? `${r.made ? "" : `${dayLabel(date)}의 `}남은 자리 ${r.reopened}개를 다시 열었어요` : "",
     r.existed ? `이미 있던 ${r.existed}개는 그대로예요` : ""].filter(Boolean).join(" · ")
  : `${dayLabel(date)}에는 고른 자리가 이미 있어요`);
export const offDoneText = (r, off) => (r && r.days ? `${r.days}일을 ${off ? "쉬는 날로 바꿨어요" : "다시 열었어요"}${notifyTail(r)}` : "바뀐 날이 없어요");

// ---------- 오류 말 ----------
const WORDS = {
  "not-assigned": "맡은 당번이 아니에요 — 목록을 새로 불러올게요",
  "chief-only": "당번 총괄만 할 수 있어요 (당번 만들기 · 이름 · 준비 중·보관)",
  "has-upcoming": "앞날에 서 있는 분이 있어요 — 다시 확인해 주세요",
  archived: "보관한 당번이에요 — 당번 총괄이 상태를 먼저 바꿔야 고칠 수 있어요",
  "no-title": "당번 이름을 적어 주세요",
  "bad-days": "보이는 기간을 다시 골라 주세요",
  "bad-max": "미리 잡아 둘 수 있는 자리 수는 1~200 사이로 적어 주세요",
  "bad-status": "상태를 다시 골라 주세요",
  "bad-char": "한 줄짜리 칸에는 줄바꿈이나 특수 제어 글자를 쓸 수 없어요",
  "too-long": "글이 너무 길어요 — 줄여 주세요",
  "no-service": "예배·조 이름을 적어 주세요",
  "bad-time": "시작·끝 시각을 다시 골라 주세요 (끝이 시작보다 늦어야 해요)",
  "bad-capacity": "정원은 1~200 사이 숫자로 적어 주세요",
  "bad-weekday": "요일을 다시 골라 주세요",
  "bad-line": "자리 틀의 칸을 다시 확인해 주세요",
  "dup-line": "같은 이름(예배·조 + 하는 일)의 자리 틀이 이미 있어요",
  "bad-date": "날짜를 다시 골라 주세요",
  "after-until": "끝 날짜 뒤예요 — 당번 설정에서 끝 날짜를 먼저 늦춰 주세요",
  "bad-lines": "자리 틀을 하나 이상 골라 주세요",
  "bad-range": "기간을 다시 골라 주세요 (오늘부터 · 한 번에 석 달까지 · 400일 안)",
  changed: "그사이 지원이 바뀌었어요 — 다시 확인해 주세요",
  past: "지난 날짜는 확정할 수 없어요",
  "too-late": "전날 저녁 마감이 지나 확정을 풀 수 없어요 — 넣기·빼기·옮기기로 바꿔 주세요",
  "no-slots": "이 날은 자리가 없어 확정할 것이 없어요",
  "too-many-lines": "자리 틀은 한 당번에 40개까지 둘 수 있어요 — 안 쓰는 틀을 빼 주세요",
  "has-after": "새 끝 날짜 뒤에 서 있는 분이 있어요 — 다시 확인해 주세요",
  "below-count": "지금 서 있는 분보다 적게는 줄일 수 없어요 — 먼저 옮기거나 빼 주세요",
  "has-signups": "지원한 분(빠진 분 포함)이 있어 지울 수 없어요 — 「이 자리만 쉬기」를 써 주세요",
  "use-off": "매주 생기는 자리라 지워도 다시 생겨요 — 「이 자리만 쉬기」를 써 주세요",
  off: "쉬는 날(또는 쉬는 자리)이에요 — 먼저 다시 열어 주세요",
  full: "정원이 찼어요",
  overlap: "같은 날 겹치는 자리에 이미 서 계세요",
  "already-there": "옮길 자리에 이미 서 계세요",
  "wrong-board": "다른 당번의 자리로는 옮길 수 없어요",
  "to-past": "지난 날짜의 자리로는 옮길 수 없어요 — 빼고, 그날 자리에 「＋ 넣기」로 넣어 주세요",
  "not-active": "이미 빠진 줄이에요 — 새로 불러올게요",
  "bad-ident": "이름을 다시 확인해 주세요 (40자까지 · \" \\ , ( ) | 는 쓸 수 없어요)",
  "bad-note": "메모를 다시 적어 주세요",
  "bad-member": "당번 역할이 없거나 사용이 멈춘 분이 있어요 — 빼고 저장해 주세요",
  "no-name": "이름을 써 주세요",
  nothing: "바꿀 것이 없어요",
};
export const hasWord = (code) => Object.prototype.hasOwnProperty.call(WORDS, code);
export const dutyWord = (code) => WORDS[code] || "";
// 명단을 통째로 다시 불러와야 하는 거절(그사이 상태가 달라졌다)
export const needsReload = (code) => ["changed", "not-active", "not-found", "below-count", "off", "already-there", "archived", "after-until"].includes(code);
// 맡은 당번이 바뀌었을 수 있는 거절 — 당번 목록부터 다시
export const lostBoard = (code) => code === "not-assigned";

// ---------- 엑셀 ----------
export const fileTitle = (title) => String(title || "").replace(/[\\/:*?"<>|\s]+/g, " ").trim().slice(0, 30) || "당번";
export const exportFileName = (title, today) => `봉사당번_${fileTitle(title)}_${today}.xlsx`;
// 내려받을 기간 고르기 — [{ value, label, from, to }]
export function exportRanges(today, openDays) {
  return [
    { value: "next4", label: "앞으로 4주", from: today, to: addDays(today, 27) },
    { value: "all", label: `앞으로 ${openDaysText(openDays)}(보이는 기간 전체)`, from: today, to: addDays(today, Number(openDays) || 56) },
    { value: "prev4", label: "지난 4주", from: addDays(today, -28), to: addDays(today, -1) },
  ];
}

// ---------- 담당자 고르기 ----------
export const STAFF_NO_CAND = "⚙️ 담당자·역할에서 「당번 담당(맡은 당번)」 역할을 먼저 주세요";
export const STAFF_ROLE_HINTS = [["duty", "당번 총괄"]];
// 당번은 저장됐는데 담당자 저장이 실패했을 때 알릴 말(창은 닫는다 — 새 당번을 두 번 만들지 않게)
export const staffFailText = (message) => `당번은 저장했어요 — 담당자는 저장하지 못했어요${message ? ` (${message})` : ""}. 다시 「고치기」로 골라 주세요`;
export const EMPTY_ASSIGNED = "맡은 당번이 아직 없어요 — 당번 총괄께 「🧰 당번 관리」에서 담당자로 넣어 달라고 말씀해 주세요";
export const EMPTY_ALL = "아직 당번이 없어요 — 「🧰 당번 관리」에서 먼저 만들어 주세요";
