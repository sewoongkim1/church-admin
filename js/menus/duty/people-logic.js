// 👥 봉사자 — 말·차례·거르기(시험 tests/duty-people.test.mjs). 그리기는 people.js(목록) · person-window.js(한 분의 이력 창).
//   (2026-10-07 친구 요청 「담당자 쪽에는 "이분의 봉사 이력"을 사람별로 모아 보는 화면」 · 서버 dutyPeople·dutyPersonHistory·dutyPeopleExport)
//   셈(섰던 날·앞으로·빠진 기록)과 사람 잇기는 서버 SQL duty_people 한 곳 — 여기서는 받은 수를 그대로 쓰고 차례·거르기·말만 정한다.
//   ⚠️ 화면의 말은 어느 경우에도 참이어야 한다 — 범위(모든 당번/맡은 당번/좁힌 당번)는 서버가 준 scope·narrowed 로 말한다(짐작하지 않는다).
import { dayLabel, slotName, timeRange, ASK_WHY, fileTitle } from "./duty-logic.js";

export const FIRST_YEAR = 2026;   // 봉사 당번이 생긴 해 — 해 고르기는 여기까지만
export const PEOPLE_SORTS = [
  { value: "served", label: "많이 선 순" },
  { value: "recent", label: "최근에 선 순" },
  { value: "name", label: "이름순" },
];
export const YEAR_TITLE = "몇 년의 횟수를 볼까요";
// 화면 위의 안내 — 어느 당번의 기록인가(좁힌 당번 · 맡은 당번 · 모든 당번) + 「섰던 날」의 뜻 + 성도님 앱 「지난 봉사」와 수가 다를 수 있는 까닭(SQL duty_people 머리 설명)
export function peopleNote(scope, boardTitle = "") {
  const where = boardTitle ? `「${boardTitle}」 당번의 기록만 사람마다 모았어요(다른 당번에서 선 날은 여기 없어요). `
    : scope === "assigned" ? "맡은 당번의 기록을 사람마다 모았어요(다른 당번에서 선 날은 여기 없어요). " : "모든 당번의 기록을 사람마다 모았어요. ";
  return where + "「섰던 날」은 이름이 남은 채 끝난 자리예요(쉬는 날·쉬는 자리, 당번을 보관한 뒤의 자리는 세지 않아요). " +
    "준비 중 당번과 명부에서 넣은 줄도 세고 오늘 끝난 자리도 바로 세기 때문에 성도님 앱 「지난 봉사」의 수보다 클 수 있어요.";
}
// 같은 분이 두 줄로 갈리는 까닭 — 잇는 것은 「계정과 명부 키를 함께 가진 줄」뿐이고 그것도 이 범위 안의 줄이어야 한다(직접 적은 이름은 어느 줄과도 이어지지 않는다)
export const SPLIT_NOTE = "같은 분이 두 줄로 보일 수 있어요 — 앱 계정·교인명부·직접 적은 이름의 기록이 같은 분의 것인지 이 범위 안에서 확인되지 않았을 때예요(당번을 좁히면 더 갈릴 수 있어요).";

const key = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, "").toLowerCase();
const byName = (x, y) => String(x.name || "").localeCompare(String(y.name || ""), "ko") || (x.id || 0) - (y.id || 0);

// 차례 — 새 배열. served = 많이 선 순(그해 · 최근 · 이름) · recent = 마지막으로 선 날이 최근인 순(선 적 없는 분은 끝에) · name = 이름순
export function sortPeople(list, sort) {
  const a = [...(list || [])];
  if (sort === "name") return a.sort(byName);
  if (sort === "recent") return a.sort((x, y) => (y.last || "").localeCompare(x.last || "") || byName(x, y));
  return a.sort((x, y) => (y.served || 0) - (x.served || 0) || (y.inYear || 0) - (x.inYear || 0) || (y.last || "").localeCompare(x.last || "") || byName(x, y));
}
// 찾기 — 이름·소속에 든 글(띄어쓰기·대소문자 무시 · 「기쁨3」도 「기쁨 3목장」에 맞는다)
export function filterPeople(list, q) {
  const k = key(q);
  if (!k) return [...(list || [])];
  return (list || []).filter((p) => key(p.name).includes(k) || key(p.who).includes(k));
}
// 선 날도 앞으로 설 날도 없는 분(취소했거나 빠진 기록만 있는 분) — 목록은 기본으로 숨기고(찾으면 나온다) 엑셀에는 싣지 않는다(서버 peopleIdle 과 같은 뜻)
export const isIdle = (p) => !((p && p.served > 0) || (p && p.upcoming > 0));
export const idleNote = (n, showing) => (showing ? `선 날도 앞으로 설 날도 없는 ${n}분도 함께 보고 있어요` : `선 날도 앞으로 설 날도 없는 ${n}분(취소했거나 빠진 기록만 있는 분)은 숨겼어요`);

// 날짜 글 — 올해면 「10월 4일(일)」 · 다른 해면 「2025년 12월 28일(일)」(해가 넘어간 뒤의 「마지막 12월 28일」이 어느 해인지 알 수 있게)
export const dateWord = (ds, today) => (ds && String(ds).slice(0, 4) !== String(today || "").slice(0, 4) ? `${String(ds).slice(0, 4)}년 ` : "") + dayLabel(ds);
const dayWord = (ds, today) => (ds === today ? "오늘" : dateWord(ds, today));
// 「올해」 · 「2025년」
export const yearWord = (year, today) => (Number(year) === Number(String(today || "").slice(0, 4)) ? "올해" : `${year}년`);
// 고를 수 있는 해 — 올해부터 봉사 당번이 생긴 해까지(하나뿐이면 화면이 고르기 단추를 숨긴다)
export function yearOptions(today) {
  const y = Number(String(today || "").slice(0, 4));
  const top = Number.isInteger(y) && y >= FIRST_YEAR ? y : FIRST_YEAR;
  const out = [];
  for (let k = top; k >= FIRST_YEAR; k--) out.push(k);
  return out;
}

// 한 분 한 줄의 수 — 「올해 3번 · 지금까지 5번 · 마지막 10월 4일(일) · 앞으로 1번(10월 11일(일)부터)」 · 오늘이면 「마지막 오늘」·「앞으로 1번(오늘부터)」
export function countLine(p, year, today) {
  const parts = [`${yearWord(year, today)} ${p.inYear || 0}번`, `지금까지 ${p.served || 0}번`];
  if (p.last) parts.push(`마지막 ${dayWord(p.last, today)}`);
  if (p.upcoming) parts.push(`앞으로 ${p.upcoming}번${p.next ? `(${dayWord(p.next, today)}부터)` : ""}`);
  return parts.join(" · ");
}
// 그분의 기록이 어디서 왔나 — 글자만으로 뜻이 서게(📅 당번 명단의 「앱」 딱지는 「앱으로 지원한 줄」이라 뜻이 다르다 · 폰에서는 풀이(title)를 볼 수 없다)
export function personBadges(p) {
  const b = [];
  if (p && p.hasApp) b.push({ text: "앱 계정", title: "앱 계정이 이어진 분이에요" });
  if (p && p.directory) b.push({ text: "명부에서 넣음", title: "교인명부에서 넣은 기록이 있어요" });
  if (p && !p.hasApp && !p.directory) b.push({ text: "직접 적음", title: "담당자가 이름을 직접 적어 넣은 분이에요" });
  return b;
}
// 목록 머리의 수 — 「12분」 · 찾는 중이면 「3분(모두 12분)」
export const peopleSum = (shown, all) => (shown === all ? `${all}분` : `${shown}분(모두 ${all}분)`);
// 빈 목록 — all = 이 범위에 이름이 오른 모든 분 · live = 그 가운데 선 날이나 앞날이 있는 분
export function peopleEmpty(q, all, live = all) {
  if (!all) return "아직 이 범위의 당번에 이름이 오른 분이 없어요";   // 목록에는 앞으로 설 분도 있다 — 비었다는 것은 지원 줄이 하나도 없다는 뜻
  const k = String(q || "").trim();
  if (k) return `「${k}」에 맞는 분이 없어요`;
  return live ? "보일 분이 없어요" : "선 날이나 앞으로 설 날이 있는 분이 아직 없어요";
}
// 엑셀 파일 이름 — 좁힌 당번의 이름 · 아니면 범위 말(총괄 「모든 당번」 · 담당 「맡은 당번」)
export const peopleFileName = (boardTitle, year, today, scopeWord = "모든 당번") => `봉사자_${year}년_${boardTitle ? fileTitle(boardTitle) : scopeWord}_${today}.xlsx`;
// 엑셀을 내려받은 뒤의 말 — 찾기 글·차례와 상관없이 범위의 모든 분이 내려간다는 것 · 뺀 분이 있으면 그 수
export function exportDone(count, { searching = false, hidden = 0 } = {}) {
  return [`${count || 0}분을 내려받았어요`, hidden > 0 ? `선 날도 앞날도 없는 ${hidden}분은 뺐어요` : "", searching ? "찾기 글과 상관없이 이 범위의 모든 분이에요" : ""].filter(Boolean).join(" — ");
}

// ---------- 한 분의 이력 ----------
// 앞으로(가까운 날부터) · 섰던 날(가까운 날부터) · 빠진 기록(가까운 날부터).
//   같은 자리의 두 줄(아직 이어지지 않은 앱 줄과 명부 줄이 한 자리에 — 서버는 그 자리를 한 번 센다)은 앞으로·섰던 날에서 한 번만 보인다.
export function historyParts(rows) {
  const slotKey = (r) => [r.date, r.board, r.service, r.task, r.start, r.end].join("|");
  const once = (list) => { const seen = new Set(); return list.filter((r) => (seen.has(slotKey(r)) ? false : (seen.add(slotKey(r)), true))); };
  const all = rows || [];
  const up = once(all.filter((r) => r.kind === "upcoming")).sort((a, b) => a.date.localeCompare(b.date) || String(a.start).localeCompare(String(b.start)));
  const served = once(all.filter((r) => r.kind === "served"));
  const missed = all.filter((r) => r.kind === "missed");
  return { up, served, missed };
}
// 빠진 기록의 까닭 — archived = 보관한 뒤의 자리(보관한 당번의 오늘·앞날이면 「서지 않는 날」)
export function whyText(r, today) {
  if (!r) return "";
  if (r.why === "self") return "본인이 취소했어요";
  if (r.why === "staff") return "담당자가 뺐어요";
  if (r.why === "off-day") return "쉬는 날이 됐어요";
  if (r.why === "off-slot") return "그 자리를 쉬었어요";
  if (r.why === "archived") return r.date >= today ? "보관한 당번이라 서지 않는 날이에요" : "당번을 보관한 뒤의 자리예요";
  return "";
}
// 줄의 딱지 — 쉼(앞으로 목록의 쉬는 날·자리) · 「못 가게 됐어요」 · 옮김 · 담당자가 넣음 · 당번 상태
export function historyBadges(r) {
  const b = [];
  if (!r) return b;
  if (r.kind === "upcoming" && r.off) b.push({ text: "쉼", cls: "" });
  if (r.asked) b.push({ text: `⚠️ ${ASK_WHY[r.askWhy] || "못 온다고 알렸어요"}`, cls: "warn" });
  if (r.moved) b.push({ text: "옮김", cls: "" });
  if (r.source === "staff") b.push({ text: "담당자가 넣음", cls: "" });
  if (r.boardStatus === "archived") b.push({ text: "보관한 당번", cls: "" });
  else if (r.boardStatus === "draft") b.push({ text: "준비 중 당번", cls: "" });
  return b;
}
// 「식당 봉사 · 2부 설거지 · 11:30~12:30」
export const rowPlace = (r) => [r && r.board, slotName(r || {}), timeRange(r || {})].filter(Boolean).join(" · ");
// 이력 창 머리의 수 — 「올해 3번 · 지금까지 5번 · 앞으로 1번」
export const historyTotals = (h, year, today) => `${yearWord(year, today)} ${h.inYear || 0}번 · 지금까지 ${h.served || 0}번 · 앞으로 ${h.upcoming || 0}번`;
// 이력 창의 범위 한 줄 — 「지금까지 N번」이 어느 당번 안의 수인가(서버가 준 scope·narrowed·boards 로 말한다 — 담당의 수는 맡은 당번 안의 수다)
export function historyScope(h, boardTitle = "") {
  if (h && h.narrowed) return `「${boardTitle || "고른"}」 당번의 기록만 보고 있어요`;
  const n = h && Number.isInteger(h.boards) ? `(${h.boards}개)` : "";
  return h && h.scope === "assigned" ? `맡은 당번${n}의 기록이에요 — 다른 당번에서 선 날은 여기 없어요` : `모든 당번${n}의 기록이에요`;
}
// 좁힌 창을 넓히는 단추의 글 — 담당에게 「모든 당번」이라고 하지 않는다
export const widenLabel = (h) => (h && h.scope === "assigned" ? "맡은 당번 모두의 기록 보기" : "모든 당번 기록 보기");
// 줄이 잘렸나(서버는 가까운 날부터 400줄까지)
export const historyCut = (h) => (h && h.total > (h.rows || []).length ? `가장 가까운 ${(h.rows || []).length}줄만 보여요(모두 ${h.total}줄)` : "");
