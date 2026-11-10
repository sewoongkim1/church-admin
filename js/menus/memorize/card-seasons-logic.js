// 💌 말씀카드 기간 — 순수 규칙·말(화면 card-seasons.js · 시험 tests/mem-card-seasons-logic.test.mjs). DOM 을 만지지 않는다.
//   성경암송 앱 「💌 축복기도 말씀카드」의 철마다 카드(성탄·새해)는 「개시 기간」 동안만 주제 고르기 화면 「지금 이때」에 보인다.
//   그 기간을 app_config cardSeasons 에 적는다(성경암송 api 프록시 getConfig·saveConfig — 역할 memorizeadmin).
//   값의 꼴(성경암송 앱과 함께 쓰는 약속 — 바꾸지 말 것):
//     { "christmas": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }, "newyear": { … } } — 한국 날짜 · 시작일·끝날 모두 포함.
//     키가 없으면 「앱의 기본 기간」을 쓴다. 그래서 「기본으로」 = 그 키를 지우는 것.
// ⚠️ 저장할 때 모르는 키(앞으로 더할 카드)와 한 카드 안의 모르는 칸은 그대로 둔다 — 바꾼 카드의 키 하나만 쓴다(mergeSeason).
// ⚠️ 못 불러왔으면(「모름」) 저장을 막는다 — 빈 값 위에 한 카드만 써 넣으면 다른 카드 날짜가 지워진다.
import { fmtDateLabel, kstToday } from "../../core/picker.js";

export const CONFIG_KEY = "cardSeasons";
export const MAX_DAYS = 92;   // 한 철의 길이 상한(시작일·끝날 포함 날 수) — 해를 잘못 골라 한 해 내내 보이는 일을 막는다

// 성경암송 js/pray-share.js CARD_SETS 의 season 과 같게 — 두 곳(카드를 더하면 둘 다)
//   from·to = 앱의 기본 기간(이 화면에서 아무것도 넣지 않았을 때 앱이 쓰는 날짜).
//   note = 카드 아래 한 줄(그 카드만 다른 점) · 🎓 수험생은 기간 밖에도 사라지지 않는다(「시험·취업 준비」로 늘 — 친구 11/07 · 기간 줄은 11/10 친구 「수험생 넣는 기간도」)
//   ⚠️ 수험생 기본 기간은 성경암송 app.js CARD_SUNEUNG_SEASON 과도 같아야 한다(세 곳)
export const SEASONS = [
  { key: "suneung", name: "🎓 수험생 응원기도카드", from: "2026-11-07", to: "2026-12-11",
    note: "기간 안에는 「지금 이때」 맨 앞에 「수험생」으로, 기간 밖에는 「늘 쓰는 카드」 끝에 「시험·취업 준비」로 나옵니다(사라지지 않아요)." },
  { key: "christmas", name: "🎄 성탄 축복기도카드", from: "2026-11-29", to: "2026-12-26" },
  { key: "newyear", name: "🌅 새해 축복기도카드", from: "2026-12-26", to: "2027-01-15" },
];

export const EXPLAIN = "성도님 앱 「💌 축복기도 말씀카드」 주제 고르기 화면의 「지금 이때」에 이 기간 동안만 보입니다. " +
  "시작일과 끝날을 모두 포함합니다. 성도님이 다음에 카드 화면을 열 때부터 반영됩니다.";
export const UNKNOWN_TEXT = "설정을 불러오지 못했어요 — 잠시 뒤 다시";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

// "YYYY-MM-DD" 이고 달력에 있는 날인가(2026-02-30 은 아니다)
export function isDate(s) {
  const m = DATE_RE.exec(String(s ?? ""));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
const dayNo = (s) => { const m = DATE_RE.exec(s); return Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000; };
// 시작일·끝날 모두 포함한 날 수(같은 날이면 1)
export const spanDays = (from, to) => dayNo(to) - dayNo(from) + 1;

// 「11월 29일」 — 올해(thisYear)가 아니면 「2027년 1월 15일」
export function fmtMD(s, thisYear = "") {
  const m = DATE_RE.exec(String(s ?? ""));
  if (!m) return "";
  return `${m[1] === String(thisYear) ? "" : `${+m[1]}년 `}${+m[2]}월 ${+m[3]}일`;
}
// 기간 한 줄 — 「2026년 11월 29일 (일) ~ 12월 26일 (토)」 · 해가 바뀌면 끝날에도 해를 붙인다
export function fmtRange(from, to) {
  if (!isDate(from) || !isDate(to)) return "";
  const y1 = from.slice(0, 4), y2 = to.slice(0, 4);
  return `${+y1}년 ${fmtDateLabel(from)} ~ ${y1 === y2 ? "" : `${+y2}년 `}${fmtDateLabel(to)}`;
}

// getConfig 답 → { state:"ok", stored } · { state:"unknown", why }
//   why: "key"(성경암송 api 가 아직 cardSeasons 를 모르는 판 — 「허용되지 않은 키」) · "shape"(저장된 값이 객체가 아니다) · "fail"(그 밖)
//   값이 없음(null) = 아무것도 넣지 않음 = 모두 기본.
//   ⚠️ 성경암송 api getConfig 는 다른 키의 읽기 오류를 null 로 뭉갠다 — cardSeasons 는 STRICT_CONFIG_KEYS 라 오류를 ok:false 로 알린다
//      (null 을 「없음」으로 믿고 그 위에 한 카드만 써서 다른 카드 날짜를 지우지 않게 · 2026-11-10 검토).
export function readStored(r) {
  if (!r || r.ok !== true) return { state: "unknown", why: r && r.error === "허용되지 않은 키" ? "key" : "fail" };
  if (r.value == null) return { state: "ok", stored: {} };
  if (!isObj(r.value)) return { state: "unknown", why: "shape" };
  return { state: "ok", stored: { ...r.value } };
}
export const UNKNOWN_WHY = {
  key: "성경암송 서버가 아직 이 설정(cardSeasons)을 받지 않는 판이에요 — 개발 담당에게 알려 주세요.",
  shape: "저장된 값의 꼴이 이상해요 — 덮어쓰지 않도록 저장을 막았어요. 개발 담당에게 알려 주세요.",
  fail: "",   // 화면이 ui.js errorText 로 까닭을 붙인다
};

// 저장 직전에 다시 읽은 값과 화면을 연 때의 값이 같은가(한 카드) — 다르면 다른 분이 그사이 고친 것이다
export const sameWin = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export const CHANGED_TEXT = "다른 분이 방금 이 카드의 날짜를 바꿨어요 — 새 값으로 다시 불러왔으니, 확인한 뒤 다시 저장해 주세요.";

// 한 카드의 저장된 기간이 쓸 수 있는 꼴인가(두 날짜 · 시작일 ≤ 끝날)
export const validWin = (w) => isObj(w) && isDate(w.from) && isDate(w.to) && w.from <= w.to;

// 지금 앱이 쓰는 기간 — { from, to, registered } · 저장된 값이 읽을 수 없는 꼴이면 { bad:true, raw }
export function effective(season, stored) {
  if (!stored || !Object.prototype.hasOwnProperty.call(stored, season.key)) {
    return { from: season.from, to: season.to, registered: false, bad: false };
  }
  const w = stored[season.key];
  if (validWin(w)) return { from: w.from, to: w.to, registered: true, bad: false };
  return { from: "", to: "", registered: true, bad: true, raw: w };
}

// 오늘(한국 날짜)과 견준 상태 — { kind: "now"|"soon"|"past", text }
export function statusOf(win, today = kstToday()) {
  if (today < win.from) return { kind: "soon", text: `${fmtMD(win.from, today.slice(0, 4))}부터 보임` };
  if (today > win.to) return { kind: "past", text: "지났어요 — 다음 철 날짜를 넣어 주세요" };
  return { kind: "now", text: "지금 보임" };
}

// 저장 전 확인 — { ok:true } · { ok:false, message }
export function checkWin(from, to) {
  if (!isDate(from) || !isDate(to)) return { ok: false, message: "시작일과 끝날을 모두 골라 주세요." };
  if (from > to) return { ok: false, message: "끝날이 시작일보다 앞이에요 — 끝날은 시작일과 같은 날이거나 그 뒤여야 해요." };
  const n = spanDays(from, to);
  if (n > MAX_DAYS) {
    return { ok: false, message: `기간이 ${n}일이에요 — 한 철은 ${MAX_DAYS}일(약 석 달)까지만 넣을 수 있어요. 해를 잘못 고르지 않았는지 봐 주세요.` };
  }
  return { ok: true };
}

// 저장할 값 — stored 를 고치지 않고 새 객체로. win = { from, to } 면 그 키만 쓰고, null 이면 그 키를 지운다(「기본으로」).
//   다른 키(모르는 카드 포함)는 그대로 · 그 카드 안의 모르는 칸도 그대로 두고 from·to 만 바꾼다.
export function mergeSeason(stored, key, win) {
  const out = isObj(stored) ? { ...stored } : {};
  if (!win) { delete out[key]; return out; }
  const prev = isObj(out[key]) ? out[key] : {};
  out[key] = { ...prev, from: win.from, to: win.to };
  return out;
}

// 화면의 고치는 중인 값 — { useDefault, from, to }
export function draftOf(season, stored) {
  const e = effective(season, stored);
  if (!e.registered) return { useDefault: true, from: season.from, to: season.to };
  if (e.bad) {
    const raw = isObj(e.raw) ? e.raw : {};
    return { useDefault: false, from: isDate(raw.from) ? raw.from : "", to: isDate(raw.to) ? raw.to : "" };
  }
  return { useDefault: false, from: e.from, to: e.to };
}
// 고치는 중인 값 → 저장할 기간(기본이면 null)
export const draftWin = (d) => (d.useDefault ? null : { from: d.from, to: d.to });
// 저장된 것과 다른가(저장 단추를 켤지)
export function draftDirty(season, stored, d) {
  const e = effective(season, stored);
  if (d.useDefault) return e.registered;
  return !e.registered || e.bad || e.from !== d.from || e.to !== d.to;
}
// 시작일·끝날을 고르면 — 기본에서 벗어나 「등록」이 된다
export const setDraftDate = (d, which, value) => ({ useDefault: false, from: d.from, to: d.to, [which]: value });
export const defaultDraft = (season) => ({ useDefault: true, from: season.from, to: season.to });

// 저장한 뒤 알림 한 줄
export function savedText(season, win) {
  return win ? `「${season.name}」 기간을 저장했어요 — ${fmtRange(win.from, win.to)}` : `「${season.name}」를 기본 기간으로 되돌렸어요.`;
}
