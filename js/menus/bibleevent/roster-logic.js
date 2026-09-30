// 📋 회차·명단 — 화면 논리(순수 함수). tests/be-roster-logic.test.mjs 가 같은 파일을 읽는다(DOM·import 없음).
// 서버 규칙(supabase/functions/church-admin/events-rules.ts)과 겹치는 표는 시험이 서버 것과 같은지 본다 —
//   GU_ORDER = BE_GU · EV_STATUS = EVT_STATUS · EV_EDIT_KEYS = EV_EDIT_KEYS(Task 6). 브라우저는 .ts 를 못 읽어 한 벌 더 둔다.
// ⚠️ 줄·회차 **검사는 서버 한 곳**(events-rules.ts checkRow·checkEvent)이다. 화면은 판정표를 따로 두지 않고, 서버가
//    돌려준 코드를 입력 창 안 빨간 줄(ui.js MESSAGES)로 보인다 — 서버는 「화평교구」·「07」·「유년」을 다듬어 받는데,
//    화면에 판정표를 한 벌 더 두면 언젠가 화면이 서버보다 엄해져 받을 수 있는 줄을 막는다.

export const GU_ORDER = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
// 성경암송 앱의 명단 화면(api index.ts eventRosterPublic 의 EVT_BU_ORDER)과 같은 차례 — 목록에 없는 부서(소년2부 등)는 그 뒤에
export const BU_ORDER = ["사랑부", "영아부", "유아부", "유치부", "유년부", "초등부", "중등부", "고등부", "청년부"];
export const EV_STATUS = ["draft", "open", "closed", "archived"];
export const STATUS_KO = { draft: "준비 중", open: "열림", closed: "마감", archived: "보관" };
export const STATUS_HINT = {
  draft: "성도님께 안 보여요",
  open: "기간 안에서 등록을 받고 명단이 보여요",
  closed: "등록은 막고 명단은 보여요",
  archived: "성도님 목록에서 사라져요",
};
export const SRC_LABEL = { app: "📱 앱", import: "📋 이관" };
const SRC_TEXT = { app: "앱", import: "이관" };
export const CHURCH_STATES = ["맞음", "확인 필요", "없음"];
export const EV_EDIT_KEYS = ["title", "short_title", "subtitle", "season", "opens_on", "closes_on", "status", "list_until", "sort_order"];
// 회차 글자 칸의 상한 — 창(event-form.js)의 maxlength 가 이 값을 쓴다. 서버 events-rules.ts EV_TEXT_MAX 와 같다(시험이 맞대 본다 · SEC-6)
export const EV_TEXT_MAX = { title: 100, short_title: 40, subtitle: 100, season: 20 };
export const ROW_KEYS = ["who_type", "group", "sub", "name", "position", "note"];
// 담당자 메모 창의 글자 수 상한 — 서버는 머리 표기(「담당자가 더함 / 」 10자)를 붙인 **뒤** 500자로 센다(계약 §5)
export const NOTE_FORM_MAX = 480;
// 고치기 창 — 서버 BE_NOTE_MAX 그대로(고칠 땐 머리 표기를 붙이지 않는다 · 붙어 있던 490자 메모도 이어 쓸 수 있게 · note-maxlength-edit)
export const NOTE_EDIT_MAX = 500;

const byKo = (a, b) => String(a).localeCompare(String(b), "ko");
const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// 서버 legacyNorm 과 같다 — 앞뒤 빈칸 떼고 가운데 빈칸(줄바꿈 포함)은 하나로. 메모도 서버가 한 줄로 저장한다
export const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ");
const nfc = (v) => String(v ?? "").normalize("NFC");
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

// 목장 칸 다듬기 — 서버 events-rules.ts tidyRow 의 목장 규칙과 같다(Task 2 시험과 같은 보기):
// 「20목장」·「20 목장」→「20」 · 「07」→「7」 · 「00」→「0」 · 「남성목장」→「남성」. 그 밖의 꼴(「이십」)은 그대로 — 서버가 bad-sub 로 막는다.
// (Number() 로 바꾸지 않는다 — 긴 숫자도 앞 0 만 뗀다)
export function tidyMok(v) {
  const s = norm(nfc(v));
  const t = s.replace(/\s+/g, "");
  if (/^남성(목장)?$/.test(t)) return "남성";
  const m = /^(\d+)(목장)?$/.exec(t);
  return m ? m[1].replace(/^0+(?=\d)/, "") : s;
}

// 숫자 목장만 「목장」을 붙인다 — 서버 evWho(Task 5)·upload-logic.js whoText(Task 11)와 같은 꼴(세 메뉴가 같게 읽히게)
const mokWord = (s) => (/^\d+$/.test(s) ? s + "목장" : s);
// 「화평 20목장」·「소망 남성」·「청년부」·「중등부 3학년」
export function whoText(r) {
  const g = norm(r?.group), s = norm(r?.sub);
  if (r?.who_type === "교구") return [g, s ? mokWord(s) : ""].filter(Boolean).join(" ");
  return [g, s].filter(Boolean).join(" ");
}
// 묶음 안에서 — 묶음 이름(교구·부서)은 머리에 있으니 세부만: 「20목장」·「남성」·「3학년」·""
export function subText(r) {
  const s = norm(r?.sub);
  if (!s) return "";
  return r?.who_type === "교구" ? mokWord(s) : s;
}

// 소속이 빈 줄은 구분(교구·교회학교·없음)과 상관없이 「소속 없음」 한 묶음 「|」 — 구분별로 둘셋으로 갈리지 않게(no-affil-group-split)
export const groupKey = (r) => (norm(r?.group) ? `${norm(r?.who_type)}|${norm(r?.group)}` : "|");
function groupRank(type, group) {
  const list = type === "교구" ? GU_ORDER : type === "교회학교" ? BU_ORDER : [];
  const i = list.indexOf(group);
  return (type === "교구" ? 0 : type === "교회학교" ? 1000 : 2000) + (i < 0 ? 900 : i);
}
// 목장은 글자다 — 숫자는 숫자로, 숫자 아닌 것(빈칸·남성)은 뒤로(앱 evtSubRank 와 같게)
function subRank(v) {
  const s = norm(v);
  return /^\d+$/.test(s) ? [0, parseInt(s, 10), s] : [1, 0, s];
}
function rowOrder(a, b) {
  const [t1, n1, s1] = subRank(a.sub), [t2, n2, s2] = subRank(b.sub);
  return t1 - t2 || n1 - n2 || byCode(s1, s2) || byKo(a.name, b.name) || (Number(a.id) - Number(b.id) || 0);
}

// 명단을 교구·부서로 묶는다 — 성도님 앱 명단(eventRosterPublic)과 같은 차례:
// 교구(앱 차례) → 모르는 교구 → 교회학교(앱 차례) → 모르는 부서(가나다) → 구분 없음. 안에서는 목장 숫자 → 숫자 아닌 것 → 이름
export function groupRows(rows) {
  const bag = new Map();
  for (const r of rows || []) {
    const k = groupKey(r);
    if (!bag.has(k)) bag.set(k, { key: k, label: norm(r.group) || "소속 없음",
      rank: norm(r.group) ? groupRank(norm(r.who_type), norm(r.group)) : 2900, rows: [] });   // 소속 없음은 구분 없음 자리(맨 뒤)
    bag.get(k).rows.push(r);
  }
  return [...bag.values()]
    .sort((a, b) => a.rank - b.rank || byKo(a.label, b.label))
    .map((g) => ({ key: g.key, label: g.label, rows: [...g.rows].sort(rowOrder) }));
}

// 거르기 — groups(groupKey) · positions("" = 직분 없음) 는 비면 전체, church·source 는 "" 면 전체, q 는 이름·소속·직분
export const blankFilter = () => ({ groups: [], positions: [], church: "", source: "", q: "" });
export const filterActive = (f) => !!f && ((f.groups || []).length > 0 || (f.positions || []).length > 0
  || !!f.church || !!f.source || !!norm(f.q));
export function filterRows(rows, f) {
  const groups = new Set(f.groups || []);
  const pos = new Set((f.positions || []).map(norm));
  const q = nfc(norm(f.q));
  return (rows || []).filter((r) => {
    if (groups.size && !groups.has(groupKey(r))) return false;
    if (pos.size && !pos.has(norm(r.position))) return false;
    if (f.church && (!r.church || r.church.state !== f.church)) return false;
    if (f.source && r.source !== f.source) return false;
    if (q && !nfc([r.name, r.group, r.sub, whoText(r), r.position].join(" ")).includes(q)) return false;
    return true;
  });
}

// 「중복일 수 있음」 — 같은 이름·같은 소속 줄이 둘 이상(설계 §1 ⚠️ 동시에 두 분이 같은 분을 더한 경우).
// ⚠️ 명단 **전체**로 센다 — 거르기로 한쪽이 가려져도 표시는 남는다.
// ⚠️ 교구 줄은 한쪽 목장이 비었거나 99(앱 로그인의 「목장 없음」)면 같은 교구·같은 이름을 같은 분으로 본다 —
//    서버의 같은 분 판정(events-rows.ts looseSame · 최종 검토 I1)과 같은 규칙. 둘 다 번호면 번호가 같아야 한다.
const nameKey = (v) => nfc(v).replace(/\s+/g, "");
const openSub = (v) => { const t = tidyMok(v); return t === "" || t === "99"; };
export function dupFlags(rows) {
  const by = new Map();   // 구분|소속|이름 → 줄들
  for (const r of rows || []) {
    const n = nameKey(r.name);
    if (!n) continue;
    const k = [norm(r.who_type), nfc(norm(r.group)), n].join("|");
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  const out = new Set();
  for (const list of by.values()) {
    if (list.length < 2) continue;
    // 목장이 비었거나 99 인 교구 줄이 하나라도 있으면 그 줄과 나머지가 모두 짝이 된다 — 모두 표시
    if (norm(list[0].who_type) === "교구" && list.some((r) => openSub(r.sub))) { list.forEach((r) => out.add(r.id)); continue; }
    const bySub = new Map();
    for (const r of list) {
      const s = tidyMok(r.sub);
      if (!bySub.has(s)) bySub.set(s, []);
      bySub.get(s).push(r.id);
    }
    for (const ids of bySub.values()) if (ids.length > 1) ids.forEach((id) => out.add(id));
  }
  return out;
}

// 직분 거르기 목록 — [직분, 수] 많은 차례, 같으면 가나다, 빈 직분(「직분 없음」)은 뒤
export function positionCounts(rows) {
  const m = new Map();
  for (const r of rows || []) { const p = norm(r.position); m.set(p, (m.get(p) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] === "") - (b[0] === "") || byKo(a[0], b[0]));
}

// CSV 한 칸 — 엑셀에서 바로 열리게 따옴표로 감싼다. = + - @ 로 시작하는 칸은 앞에 ' — 엑셀이 수식으로 읽지 않게.
// 성경필사(암송) 안의 다른 CSV(history-logic.js statsCsv 등)도 이 것을 쓴다 — 따로 만들지 않는다.
export const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};
// 내려받기 — 엑셀에서 바로 열리게(BOM · \r\n). **받은 차례 그대로**(화면에 보이는 차례를 부르는 쪽이 넘긴다). 메모는 싣지 않는다.
export function csvText(rows) {
  const head = ["이름", "구분", "소속", "세부", "직분", "출처", "교적"];
  const body = (rows || []).map((r) => [r.name, r.who_type, r.group, r.sub, r.position, SRC_TEXT[r.source] || r.source || "",
    r.church ? [r.church.state, r.church.reason].filter(Boolean).join(" · ") : ""]);
  return "\uFEFF" + [head, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

// 회차 차례(콤보·고르개) — 시작일 최근 먼저, 같으면 id 거꾸로
export function sortEvents(list) {
  return [...(list || [])].sort((a, b) => byCode(norm(b.opens_on), norm(a.opens_on)) || byCode(norm(b.id), norm(a.id)));
}

// ── 회차를 부르는 글(2026-09-30 · 친구 요구 「콤보로 고르게 · 연·월 · 제목」) ──
// ⚠️ 세 화면(📋 회차·명단 콤보 · 📤 올릴 회차 · 👤 통계에 넣을 회차)이 **이 한 벌**을 쓴다 — 화면마다 따로 지으면
//    「사순절 마가복음 완서자」가 2023·2026 두 번 나오듯 메뉴마다 같은 회차를 다르게 부르게 된다.
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// 시작일(opens_on · YYYY-MM-DD)의 연·월 — 「2026년 3월」(앞 0 없이). 비었거나 꼴이 아니면 「날짜 없음」
export function evYm(ev) {
  const m = YMD_RE.exec(norm(ev?.opens_on));
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return "날짜 없음";
  return `${+m[1]}년 ${+m[2]}월`;
}
// 회차 이름 전체 — 제목 → 짧은 이름 → id
export const evName = (ev) => norm(ev?.title) || norm(ev?.short_title) || norm(ev?.id);
// 고르개 한 줄 — 「2026년 3월 · 사순절 마가복음 완서자」
export const evPickLabel = (ev) => `${evYm(ev)} · ${evName(ev)}`;
// 고르개 작은 글 — 「231명 · 마감」(+ 「 · 👁」 성도님께 보이면). 상태 글자는 화면과 같은 STATUS_KO
export function evPickHint(ev) {
  const st = STATUS_KO[ev?.status] || norm(ev?.status);
  return [`${Number(ev?.count || 0).toLocaleString("ko-KR")}명`, st].filter(Boolean).join(" · ") + (ev?.listedNow ? " · 👁" : "");
}
// 고르개(picker.js pickOne·pickMany) 선택지 하나 · 목록(시작일 최근 먼저 — 받은 배열은 그대로)
export const evPickOption = (ev) => ({ value: ev.id, label: evPickLabel(ev), hint: evPickHint(ev) });
export const evPickOptions = (list) => sortEvents(list).map(evPickOption);

// 회차 설정 — 바뀐 칸만(서버 evEventSave 는 보낸 칸만 바꾼다). list_until 은 null 과 "" 가 같다(비움 — 서버가 null 로)
// sort_order(회차 차례)는 0·「0」·빈칸이 같다(서버가 빈칸을 0 으로) — 옛 응답에 칸이 없어도 0 으로 본다.
// needs·copy·kind·id 같은 칸은 EV_EDIT_KEYS 에 없어 보내지 않는다 — 자격 규칙·문구가 조용히 지워지지 않게.
export function eventPatch(before, v) {
  const out = {};
  for (const k of EV_EDIT_KEYS) {
    if (!own(v, k)) continue;
    const fix = k === "sort_order" ? (x) => norm(x) || "0" : norm;
    const a = fix(before?.[k]), b = fix(v[k]);
    if (a !== b) out[k] = b;
  }
  return out;
}

// 줄 고치기 — 바뀐 칸만(서버는 앱 줄·자격 회차의 줄에 메모 밖 칸이 **오기만 해도** app-row-note-only 로 막는다).
// 서버와 같이 앞뒤·가운데 빈칸을 다듬어 견준다(옛 줄의 겹빈칸 때문에 안 바꾼 칸이 가지 않게).
// 교구 목장은 **바꾼 때만** 다듬어 보낸다(tidyMok) — 옛 「07」을 그대로 두면 안 보낸다. keys — 메모만 고치는 줄은 ["note"].
export function rowPatch(before, v, keys = ROW_KEYS) {
  const out = {};
  const type = norm(own(v, "who_type") ? v.who_type : before?.who_type);
  for (const k of keys) {
    if (!own(v, k)) continue;
    const a = norm(before?.[k]), b = norm(v[k]);
    if (a === b) continue;
    out[k] = k === "sub" && type === "교구" ? tidyMok(b) : b;
  }
  // 다듬은 뒤 옛 값과 같아지면(옛 「7」 → 새 「7목장」) 바뀐 것이 아니다
  if (own(out, "sub") && !own(out, "who_type") && out.sub === norm(before?.sub)) delete out.sub;
  return out;
}
