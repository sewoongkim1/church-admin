// 봉사 당번 — 화면 규칙(순수 함수 · tests/duty-logic.test.mjs) · 🧰 당번 관리(boards.js)와 📅 당번 명단(roster.js)이 함께 쓴다.
//   설계 v2 docs/superpowers/specs/2026-10-06-duty-roster-design.md §6. 판정(잠김·빈 자리·겹침)은 서버가 준 값 그대로 — 여기는 말과 차례만 고른다.
// ⚠️ 이 파일은 Node 시험이 읽는다 — document·window 를 만지지 않는다.
import { esc } from "../../core/ui.js";

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
// 지난 날을 얼마나 불러올 수 있나 — 서버 명단은 한 번에 400일까지(지난 날 + 보이는 기간)
export const maxBack = (openDays) => Math.max(14, 400 - (Number(openDays) || 56));
// 당번을 저장한 뒤 한 줄 — 끝 날짜 뒤에 선 분이 있으면 알린다
export function boardSavedText(r, created) {
  const base = created ? "당번을 만들었어요 — 「📅 당번 명단」에서 자리 틀을 넣어 주세요" : "저장했어요";
  return r && r.after ? `${base} · 끝 날짜 뒤에 ${r.after}분이 서 있어요 — 명단에서 옮기거나 빼 주세요` : base;
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
// 칩 하나 — { date, label, tag, kind } · kind: off(쉼) · past(지난 날) · ask(못 온다는 분) · need(빈 자리) · full(다 참) · none(자리 없음)
//   차례: 쉼 → 지난 날 → 못 온다 → 빈 자리 → 다 참. 확정(담당자)·잠김(전날 저녁)은 lock 으로 따로(🔒) · today = 오늘인 날(칩에 「오늘」).
export function dayChip(d, today = "") {
  const base = { date: d.date, label: dayShort(d.date), lock: d.locked === true && !d.off && !d.past, today: !!today && d.date === today };
  if (d.off) return { ...base, kind: "off", tag: "쉼" };
  if (d.past) return { ...base, kind: "past", tag: "지난 날" };
  if (!(d.slots || []).length) return { ...base, kind: "none", tag: "자리 없음" };
  if (d.asks > 0) return { ...base, kind: "ask", tag: `못 온다 ${d.asks}` };
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
// 그날 판의 단추 — [{ act, label, danger? }] (보관한 당번은 없음 · 지난 날은 메모만)
//   확정: 아직 안 잠긴 오늘 이후 날 · 확정 풀기: 담당자가 확정했고 전날 저녁 마감 전(locked 이고 confirmed 인데 마감이 안 지남 = canUnconfirm)
export function dayActions(d, { archived = false, now = Date.now() } = {}) {
  if (!d || archived) return [];
  const out = [];
  const cut = Date.parse(d.cutoff || "");
  const beforeCut = !isNaN(cut) && now < cut;
  if (!d.past && !d.off) {
    if (!d.locked) out.push({ act: "confirm", label: "이 날 확정" });
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
// 지원 줄의 딱지들 — [{ text, cls }] (앱/담당자 · 앱 없음 · 알림 꺼짐 · 확정 뒤 지원 · 옮김 · 같은 분일 수 있어요)
export function signupBadges(e) {
  const out = [{ text: e.source === "staff" ? "담당자" : "앱", cls: "" }];
  if (!e.hasApp) out.push({ text: "앱 없음", cls: "warn", title: "앱 계정이 없어 알림이 가지 않아요 — 따로 알려 주세요" });
  else if (!e.hasPush) out.push({ text: "알림 꺼짐", cls: "warn", title: "앱 알림을 받는 기기가 없어요 — 따로 알려 주세요" });
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

// 옮길 자리 고르기 — 같은 당번의 다른 자리(쉬는 날·쉬는 자리·지난 날 빼고 · 같은 날 자리는 지난 날이어도). 같은 날 먼저, 그다음 날짜 차례.
export function moveOptions(days, fromSlotId, fromDate) {
  const out = [];
  for (const d of days || []) {
    if (d.off || (d.past && d.date !== fromDate)) continue;
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
export function confirmDayAsk(d) {
  const n = dayActive(d);
  return `${dayLabel(d.date)}을 확정할까요? 확정하면 성도님은 앱에서 취소·변경을 못 해요(지금 ${n}분${d.need ? ` · 빈 자리 ${d.need}` : ""}). ` +
    "빈 자리 지원은 계속 받아요 — 바꿀 일은 담당자가 넣기·빼기·옮기기로 해요.";
}
export const unconfirmAsk = (d) => `${dayLabel(d.date)}의 확정을 풀까요? 풀면 성도님이 앱에서 다시 취소할 수 있어요(전날 저녁 7시에는 다시 자동으로 확정돼요).`;
// 쉬는 날로 / 다시 열기 — active = 그 기간에 살아 있는 지원 수(서버가 센 값) · days = 바뀌는 날 수
export function offAsk({ from, to, off, active, days }) {
  const span = from === to ? dayLabel(from) : `${dayLabel(from)} ~ ${dayLabel(to)}`;
  if (!days) return off ? `${span}에는 쉬게 할 날이 없어요(자리가 없거나 이미 쉬는 날이에요).` : `${span}에는 다시 열 날이 없어요.`;
  const dn = from === to ? "" : ` ${days}일`;
  if (off) {
    return `${span}${dn}을 쉬는 날로 바꿀까요?` + (active ? ` 이미 지원한 ${active}분께는 「이날은 쉬어요」로 보여요 — 지원은 지우지 않고 두었다가 다시 열면 그대로 살아나요.` : " 아직 지원한 분은 없어요.");
  }
  return `${span}${dn}을 다시 열까요?` + (active ? ` 쉬기 전에 지원한 ${active}분의 자리가 그대로 살아나요.` : "");
}
export const removeAsk = (e, d, s) => `${e.name} 님을 ${dayLabel(d.date)} ${slotName(s)}에서 뺄까요? 뺀 분은 앱에서 이 자리에 스스로 다시 지원할 수 없어요(담당자는 다시 넣을 수 있어요).`;
export function slotOffAsk(s, off) {
  const n = ((s && s.signups) || []).length;
  return off ? `${slotName(s)} 자리만 쉬게 할까요?${n ? ` 지원한 ${n}분께는 「쉬어요」로 보여요(지원은 그대로 두었다가 다시 열면 살아나요).` : ""}`
    : `${slotName(s)} 자리를 다시 열까요?${n ? ` 지원한 ${n}분의 자리가 그대로 살아나요.` : ""}`;
}
// 당번을 앱에서 안 보이게 바꿀 때(받는 중·지원 멈춤 → 준비·보관) — 앞날에 선 분이 있으면
export const hideAsk = (active, status) => `앞날에 ${active}분이 서 있어요. 그래도 「${STATUS_LABEL[status] || status}」으로 바꿀까요? 그분들 앱에서 이 당번과 내 당번이 사라져요(지원 줄은 지우지 않아요).`;
export const OPEN_WARN = "「받는 중」으로 저장하면 성경암송 앱(🙋 봉사 당번이 보이는 분)에 이 당번이 바로 보이고 지원을 받아요.";

// ---------- 저장 뒤 한 줄 ----------
// 알림(3단계) — notified·notifyError 가 있으면 덧붙인다
export function notifyTail(r) {
  if (!r || r.notifyError === undefined) return "";
  if (r.notifyError) return " · 앱 알림은 보내지 못했어요";
  return r.notified ? ` · ${r.notified}분께 앱 알림을 보냈어요` : "";
}
export function addDoneText(r, name) {
  const base = r && r.already ? `${name} — 이미 이 자리에 서 계세요` : r && r.revived ? `${name} — 다시 넣었어요` : `${name} — 넣었어요`;
  return base + (r && r.locked && !r.already ? " (확정된 날)" : "") + notifyTail(r);
}
export const movedText = (r, name) => (r && r.already ? "같은 자리예요" : `${name} — ${r && r.to ? `${dayLabel(r.to.date)} ${slotName(r.to)}(${r.to.start})` : "새 자리"}로 옮겼어요${notifyTail(r)}`);
export const dateAddedText = (r, date) => (r && r.made ? `${dayLabel(date)}에 자리 ${r.made}개를 만들었어요${r.existed ? ` · 이미 있던 ${r.existed}개는 그대로예요` : ""}` : `${dayLabel(date)}에는 고른 자리가 이미 있어요`);
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
  "bad-range": "기간을 다시 골라 주세요 (오늘부터 · 한 번에 석 달까지)",
  changed: "그사이 지원이 바뀌었어요 — 다시 확인해 주세요",
  past: "지난 날짜는 확정할 수 없어요",
  "too-late": "전날 저녁 7시가 지나 확정을 풀 수 없어요 — 넣기·빼기·옮기기로 바꿔 주세요",
  "below-count": "지금 서 있는 분보다 적게는 줄일 수 없어요 — 먼저 옮기거나 빼 주세요",
  "has-signups": "지원한 분(빠진 분 포함)이 있어 지울 수 없어요 — 「이 자리만 쉬기」를 써 주세요",
  "use-off": "매주 생기는 자리라 지워도 다시 생겨요 — 「이 자리만 쉬기」를 써 주세요",
  off: "쉬는 날(또는 쉬는 자리)이에요 — 먼저 다시 열어 주세요",
  full: "정원이 찼어요",
  overlap: "같은 날 겹치는 자리에 이미 서 계세요",
  "already-there": "옮길 자리에 이미 서 계세요",
  "wrong-board": "다른 당번의 자리로는 옮길 수 없어요",
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
