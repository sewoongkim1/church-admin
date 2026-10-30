// 교회 어드민 — 🤖 성도 묻기(시험판 · 2026-10-15): 조건 트리의 규약 · 검사 · 셈 · 칩 글(순수 함수)
//   설계 v2 docs/superpowers/specs/2026-10-15-pastor-ai-ask-design.md(「Claude ↔ 서버 규약」 · 「할 수 없는 조건이 섞이면」).
//   서버(Deno, index.ts)와 시험(Node, tests/ask-people.test.mjs)이 **같은 파일**을 읽는다.
//   ⚠️ Deno 전용 API·원격 import·enum 을 쓰지 않는다 — node --experimental-strip-types 가 그대로 읽어야 한다.
//   ⚠️ AI(Claude)에게 가는 글은 askSystemPrompt · askSchema 둘뿐이다 — 필드 목록과 이름 없는 값 목록(교구·구분·부서 이름)만 담는다.
//      사람 자료(이름·교인ID·나이·목장 이름)는 이 둘에 넣지 않는다(시험이 지킨다). 명단은 AI 를 거치지 않고 runTree 가 거른다.
//   흐름: 질문 → (Claude) 조건 JSON → checkTree(꼴·뜻 검사 — 못 하는 것은 unsupported 로) → runTree(교인마다 셈) → rowOut(화면 줄).
import { positionBucket } from "./ministry-stats.ts";
import { BE_GU } from "./events-rules.ts";   // 교회 정한 교구 차례(고르기 목록 · 2026-10-19)

export const ASK_CONTRACT = "ask-v1";     // 규약 판 — 지시문 · 응답 · 바꾼 기록에 함께 싣는다
export const ASK_Q_MAX = 300;             // 질문 글자 수 상한
export const ASK_ROW_MAX = 200;           // 화면에 보이는 줄 상한(셈은 모두)
export const ASK_MAX_LEAVES = 10;         // 조건(잎) 수 상한 — 넘친 것은 「아직 못 하는 조합」

export const OPS = [">=", "<=", "=", "in", "has"];
export const GROUPS = ["all", "any", "none"];                      // 그리고 · 또는 · 아님
export const GROUP_LABEL: Record<string, string> = { all: "그리고", any: "또는", none: "아님" };
export const UNSUP_KINDS = ["no_data", "out_of_range", "not_allowed", "judgment", "too_complex"];
export const UNSUP_LABEL: Record<string, string> = {
  no_data: "자료가 없어요", out_of_range: "자료 범위 밖이에요", not_allowed: "이 조건으로는 찾지 않아요",
  judgment: "사람을 평가하는 조건은 찾지 않아요", too_complex: "아직 못 하는 조합이에요",
};
export const DEPT_LEVELS = ["big", "family", "mid", "team"];       // 큰 분류 · 계열 · 중분류 · 표준 팀(부서 이음표 ministry_dept_map)
export const POSITIONS = ["장로", "안수집사", "권사", "집사", "그 밖", "직분 없음"];
// 화면 고르기 칸(2026-10-19 · 설계 성경암송 docs/superpowers/specs/2026-10-19-ask-people-picks-design.md) — **AI 에는 보내지 않는다.**
//   FIELDS 에 넣지 않는다(AI 스키마의 field 값 · 지시문의 필드 표가 FIELDS 에서 나온다). checkLeaf 만 PICK_FIELDS 를 함께 본다
//   (칩 × 길 askPeopleRun 의 트리에 이 잎이 있어도 같은 검사를 거쳐야 한다).
export const PICK_GROUPS = ["장로", "안수집사", "권사", "집사"];          // 「X 전체」로 고르는 큰 묶음
export const PICK_ALL = " 전체";
// 고른 잎의 from_text — ⚠️ 화면 js/menus/people/ask-logic.js 의 PICK_FROM 과 글자까지 같게(tests/ask-picks-ui.test.mjs 가 본다)
export const PICK_FROM = { pos: "고른 직분", gu: "고른 교구", reg: "고른 등록년도", age: "고른 연령대" };
export const PICK_MAX = 200;                                             // 칸마다 고른 값 상한(넘으면 앞에서 자르고 화면에 알린다 — 2026-10-19 결정)
// 등록년도 칸(2026-10-30 친구 「2019년 이전은 하나로 · 그 뒤는 해마다 · 최근 해가 위로」) — 값은 「2026」 꼴 해 또는 REG_OLD 하나.
//   등록일(registered_date)이 없는 분은 어느 값에도 안 걸린다(이 칸을 고르면 빠진다).
export const REG_PICK_FROM = 2020;                                       // 이 해부터 해마다 · 그 앞은 모두 REG_OLD
export const REG_OLD = `${REG_PICK_FROM - 1}년 이전`;
const regToken = (x: string): string | null => (x === REG_OLD || (/^\d{4}$/.test(x) && Number(x) >= REG_PICK_FROM) ? x : null);
// 연령대 칸(2026-10-30 친구 「20세 이하 · 21~25 · 26~30 … 66~70 · 71세 이상」) — 5살씩 · 값 = 이름 · 교인명부 기준일의 나이(age). 나이 없는 분은 안 걸린다.
export const AGE_BANDS: { label: string; min: number; max: number }[] = [
  { label: "20세 이하", min: 0, max: 20 },
  ...Array.from({ length: 10 }, (_, i) => ({ label: `${21 + i * 5}~${25 + i * 5}세`, min: 21 + i * 5, max: 25 + i * 5 })),
  { label: "71세 이상", min: 71, max: 999 },
];
const AGE_BY_LABEL = new Map(AGE_BANDS.map((b) => [b.label, b]));

// 필드 목록 — 「물을 수 있는 것」. 이 목록 하나에서 AI 스키마의 field 값 · 지시문의 필드 표 · 검사 · 셈 · 칩 이름이 나온다.
//   value: num(수) · year(해 — num 에 해, 또는 years_ago) · text(값 하나) · list(값 여럿)
//   service: 사역 이력에서 세는 것 — within(기간) · dept(부서)를 붙일 수 있다.
//   pilsa: 성경필사 명단(이어진 줄)에서 세는 것 — within(기간) · text(종류 — 비우면 모두)를 붙일 수 있다(2026-10-15).
export type FieldDef = { id: string; label: string; ops: string[]; value: "num" | "year" | "text" | "list"; service: boolean; pilsa?: boolean; desc: string };
export const FIELDS: FieldDef[] = [
  { id: "gu", label: "교구", ops: ["in"], value: "list", service: false, desc: "교인명부의 교구 — 아래 [교구 이름] 가운데서 list 로" },
  { id: "mok", label: "목장", ops: ["="], value: "text", service: false, desc: "교인명부의 목장(「교구-번호」 꼴 — 질문에 나온 그대로). 목장이 비어 있는 분은 text 「목장 없음」" },
  { id: "position", label: "직분", ops: ["in"], value: "list", service: false, desc: "아래 [직분] 가운데서 list 로. 은퇴·명예·서리가 붙어도 같은 칸 · 직분이 없는 분은 「직분 없음」" },
  { id: "gender", label: "성별", ops: ["="], value: "text", service: false, desc: "text 「남」 또는 「여」" },
  { id: "age", label: "나이", ops: [">=", "<=", "="], value: "num", service: false, desc: "교인명부 기준일의 나이. 「50대」는 age >= 50 과 age <= 59 두 잎" },
  { id: "kind", label: "구분", ops: ["="], value: "text", service: false, desc: "아래 [구분 이름] 가운데서(장년·청년 같은 것)" },
  { id: "registered_year", label: "등록한 해", ops: [">=", "<=", "="], value: "year", service: false, desc: "교인명부 등록일의 해. 「최근 3년 안에 등록」은 >= years_ago 2" },
  { id: "served_years_count", label: "섬긴 해 수", ops: [">=", "<=", "="], value: "num", service: true,
    desc: "사역 임명 명단에 오른 서로 다른 해의 수(한 해에 팀이 여럿이어도 1). 「N해 이하」는 섬긴 적 있는 분 중에서. 한 번도 안 섬긴 분은 = 0" },
  { id: "served_in_year", label: "그 해 섬김", ops: ["has"], value: "year", service: true,
    desc: "그 해 사역 명단에 있음. 「올해는 안 하시는」은 none 묶음에 years_ago 0" },
  { id: "first_served_year", label: "처음 섬긴 해", ops: [">=", "<=", "="], value: "year", service: true, desc: "처음 임명된 해" },
  { id: "last_served_year", label: "마지막 섬긴 해", ops: [">=", "<=", "="], value: "year", service: true,
    desc: "마지막으로 임명된 해. 「3년 넘게 쉬고 계신」은 <= years_ago 4 처럼(섬긴 적이 없는 분은 맞지 않는다)" },
  { id: "served_streak_max", label: "잇따라 섬긴 해", ops: [">=", "<="], value: "num", service: true,
    desc: "쉬지 않고 이어 섬긴 가장 긴 해 수. 명단이 일부인 해는 끊긴 것으로 보지 않는다" },
  // 성경필사(2026-10-15 친구 요청 「2026년 성경필사 하신 분」) — 교인과 이어진 성경필사 명단 줄(people_links)로 센다
  { id: "pilsa_count", label: "성경필사 횟수", ops: [">=", "<=", "="], value: "num", service: false, pilsa: true,
    desc: "성경필사 명단에 오른 회차 수. 「N번 이하」는 한 번이라도 한 분 중에서 · 한 번도 안 한 분은 = 0" },
  { id: "pilsa_in_year", label: "그 해 성경필사", ops: ["has"], value: "year", service: false, pilsa: true,
    desc: "그 해 성경필사 명단에 있음. 「2026년 성경필사 하신 분」= has num 2026" },
];
const FIELD_BY_ID: Record<string, FieldDef> = Object.fromEntries(FIELDS.map((f) => [f.id, f]));
export const PICK_FIELDS: FieldDef[] = [
  { id: "pos_pick", label: "직분", ops: ["in"], value: "list", service: false, desc: "화면 고르기 칸 — 「장로 전체」 꼴 큰 묶음 또는 세부 직분" },
  { id: "reg_pick", label: "등록년도", ops: ["in"], value: "list", service: false, desc: "화면 고르기 칸 — 「2026」 꼴 해(REG_PICK_FROM 부터) 또는 REG_OLD" },
  { id: "age_pick", label: "연령대", ops: ["in"], value: "list", service: false, desc: "화면 고르기 칸 — AGE_BANDS 의 이름(「21~25세」 꼴)" },
];
const CHECK_BY_ID: Record<string, FieldDef> = { ...FIELD_BY_ID, ...Object.fromEntries(PICK_FIELDS.map((f) => [f.id, f])) };
export const FIELD_IDS = FIELDS.map((f) => f.id);

// ---------- 글자 다듬기 ----------
// 사역 이력 · 부서 이음표 열쇠와 같은 규칙(SQL mh_key · history-match.ts nospace): NFC · 띄어쓰기(줄바꿈 없는 빈칸 · 전각 빈칸 포함) 없음
export function mhKey(t: unknown): string {
  return String(t ?? "").normalize("NFC").replace(/[\s 　]+/g, "");
}
const clean = (t: unknown): string => String(t ?? "").normalize("NFC").trim();
const str = (t: unknown, max: number): string => clean(t).slice(0, max);
// 목장 비교 열쇠 — 「화평-20목장」 · 「화평-20」 · 「화평 - 20 목장」이 같다.
//   번호 앞 0 · 빠진 「-」도 같게(2026-10-15 견주기 — 명부는 「기쁨-06」, 「기쁨교구 6목장」을 AI 는 「기쁨-6」으로 써서 두 모델 모두 못 찾았다)
export function mokKey(t: unknown): string {
  const k = mhKey(t).replace(/목장$/, "");
  const m = /^(\D+?)-?0*(\d+)$/.exec(k);
  return m ? `${m[1].replace(/교구$/, "")}-${m[2]}` : k;
}
const intOr = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
function yearOf(d: unknown): number | null {
  const m = /^(\d{4})/.exec(String(d ?? ""));
  return m ? Number(m[1]) : null;
}
function posOf(p: unknown): string {
  const b = positionBucket(p);
  return b === "모름" ? "직분 없음" : b;
}

// 세부 직분 — 직분상세 → 비었으면 직분 → 둘 다 비면(「-」도) 「직분 없음」. 모든 분이 한 값에 든다(고르기 목록 · pos_pick).
export function posDetailOf(position: unknown, detail: unknown): string {
  const t = (x: unknown) => { const s = clean(x); return s === "-" ? "" : s; };
  return t(detail) || t(position) || "직분 없음";
}

// ---------- 재료 ----------
export type AskPerson = {
  id: number; name: string; position: string; pos: string; posDetail: string; gender: string; age: number | null;
  gu: string; mok: string; mokKey: string; kind: string; regYear: number | null;
};
export type Seat = { year: number; big: string; family: string; mid: string; team: string };
export type DeptRow = { big: string; family: string; mid: string; team: string };
export type AskGap = { scope: string; from: number; to: number | null };
export type AskVocab = {
  gu: string[]; kind: string[]; posDetail: string[]; big: string[]; family: string[]; mid: string[]; team: string[];
  mokKeys: string[]; rows: DeptRow[]; yearMin: number; yearMax: number; gaps: AskGap[];
  pilsaSeries: string[]; pilsaMin: number; pilsaMax: number; pilsaEventYears: number[];   // 성경필사 — 이어진 줄이 있는 회차만
};
export type PilsaEntry = { year: number; series: string; event: string };
export type AskData = { people: AskPerson[]; seats: Map<number, Seat[]>; pilsa: Map<number, PilsaEntry[]>; vocab: AskVocab;
  linked: number; histRows: number; pilsaLinked: number };

const byCount = (m: Map<string, number>): string[] =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k]) => k);
const sortedSet = (s: Set<string>): string[] => [...s].filter(Boolean).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

// 표 넷을 받아 셈 재료로 — 교인명부 · 사역 이력(지운 줄 빼고) · 부서 이음표 · 명단이 일부인 해.
//   사역 이력은 교인명부에 있는 분의 줄만 센다(교인ID 가 이어지지 않은 줄 · 떠난 분의 줄은 셈에서 빠진다).
// 성경필사 회차의 종류 — 회차 id 의 앞머리(lent-booklet · lent · summer)로, 모르면 제목에서 해를 뗀 것
export function pilsaSeriesOf(id: unknown, title: unknown): string {
  const i = clean(id), tt = clean(title);
  if (/^lent-booklet/.test(i) || /소책자/.test(tt)) return "사순절 소책자";
  if (/^summer/.test(i) || /썸머/.test(tt)) return "썸머 써 바이블";
  if (/^lent/.test(i) || /사순절/.test(tt)) return "사순절 필사";
  return tt.replace(/^\d{4}\s*/, "") || i;
}

// pilsaRows = 교인과 이어진 성경필사 줄 [{person_id, event_id}](people_links signup · 이분 아님 빼고) · eventRows = events(초안은 뺀다)
export function buildAskData(peopleRows: any[], histRows: any[], mapRows: any[], gapRows: any[], pilsaRows: any[] = [], eventRows: any[] = []): AskData {
  const people: AskPerson[] = [];
  const ids = new Set<number>();
  const guN = new Map<string, number>(), kindN = new Map<string, number>(), posDN = new Map<string, number>(), moks = new Set<string>();
  for (const r of peopleRows ?? []) {
    const id = Number(r?.person_id);
    if (!Number.isSafeInteger(id) || ids.has(id)) continue;
    const ageN = r?.age === null || r?.age === undefined || r?.age === "" ? NaN : Number(r.age);
    const age = Number.isFinite(ageN) && ageN >= 0 && ageN <= 120 ? Math.floor(ageN) : null;
    const gu = clean(r?.mok1), mok = clean(r?.mok3), kind = clean(r?.kind2);
    const posDetail = posDetailOf(r?.position, r?.position_detail);
    people.push({ id, name: clean(r?.name), position: clean(r?.position), pos: posOf(r?.position), posDetail, gender: clean(r?.gender),
      age, gu, mok, mokKey: mokKey(mok), kind, regYear: yearOf(r?.registered_date) });
    posDN.set(posDetail, (posDN.get(posDetail) ?? 0) + 1);
    ids.add(id);
    if (gu) guN.set(gu, (guN.get(gu) ?? 0) + 1);
    if (kind) kindN.set(kind, (kindN.get(kind) ?? 0) + 1);
    if (mok) moks.add(mokKey(mok));
  }
  const map = new Map<string, any>();
  const big = new Set<string>(), family = new Set<string>(), mid = new Set<string>(), team = new Set<string>();
  const rowKeys = new Set<string>(), rows: DeptRow[] = [];
  const addRow = (d: DeptRow) => {
    const k = [d.big, d.family, d.mid, d.team].join("|");
    if (rowKeys.has(k)) return;
    rowKeys.add(k); rows.push(d);
    big.add(d.big); family.add(d.family); if (d.mid) mid.add(d.mid); team.add(d.team);
  };
  for (const m of mapRows ?? []) {
    map.set(clean(m?.committee_key) + "|" + clean(m?.team_key), m);
    addRow({ big: clean(m?.big_group), family: clean(m?.family), mid: clean(m?.mid), team: clean(m?.team_std) });
  }
  const seats = new Map<number, Seat[]>();
  let yearMin = Infinity, yearMax = -Infinity, linked = 0, histN = 0;
  for (const h of histRows ?? []) {
    const year = Number(h?.year);
    if (!Number.isInteger(year)) continue;
    histN++;
    yearMin = Math.min(yearMin, year); yearMax = Math.max(yearMax, year);
    const pid = Number(h?.person_id);
    if (!ids.has(pid)) continue;
    linked++;
    const d = map.get(mhKey(h?.committee) + "|" + mhKey(h?.team));
    // 이음표에 없는 쌍은 사역 통계(ministry_stats_facts)와 같이 「그 밖 · 미정 · 팀 원문」
    const s: Seat = d ? { year, big: clean(d.big_group), family: clean(d.family), mid: clean(d.mid), team: clean(d.team_std) }
      : { year, big: "그 밖", family: "미정", mid: "", team: clean(h?.team) || "(팀 이름 없음)" };
    if (!d) addRow({ big: s.big, family: s.family, mid: s.mid, team: s.team });
    const list = seats.get(pid);
    if (list) list.push(s); else seats.set(pid, [s]);
  }
  if (!Number.isFinite(yearMin)) { yearMin = 0; yearMax = 0; }
  const evs = new Map<string, { year: number; series: string }>();
  for (const e of eventRows ?? []) {
    if (clean(e?.status) === "draft") continue;
    const m = /(\d{4})$/.exec(clean(e?.id));
    const year = yearOf(e?.opens_on) ?? (m ? Number(m[1]) : null);
    if (year === null) continue;
    evs.set(clean(e?.id), { year, series: pilsaSeriesOf(e?.id, e?.title) });
  }
  const pilsa = new Map<number, PilsaEntry[]>();
  const usedEv = new Set<string>(), series = new Set<string>();
  let pilsaLinked = 0;
  for (const r of pilsaRows ?? []) {
    const pid = Number(r?.person_id), ev = clean(r?.event_id), e = evs.get(ev);
    if (!ids.has(pid) || !e) continue;
    pilsaLinked++;
    usedEv.add(ev); series.add(e.series);
    const list = pilsa.get(pid), x = { year: e.year, series: e.series, event: ev };
    if (list) list.push(x); else pilsa.set(pid, [x]);
  }
  const pilsaEventYears = [...usedEv].map((ev) => evs.get(ev)!.year);
  const gaps: AskGap[] = (gapRows ?? []).map((g: any) => ({ scope: clean(g?.scope), from: Number(g?.year_from), to: g?.year_to === null || g?.year_to === undefined ? null : Number(g.year_to) }))
    .filter((g: AskGap) => g.scope && Number.isInteger(g.from));
  return {
    people, seats, pilsa, linked, histRows: histN, pilsaLinked,
    vocab: { gu: byCount(guN), kind: byCount(kindN), posDetail: byCount(posDN), big: sortedSet(big), family: sortedSet(family), mid: sortedSet(mid), team: sortedSet(team),
      mokKeys: [...moks], rows, yearMin, yearMax, gaps,
      pilsaSeries: [...series].sort(), pilsaEventYears,
      pilsaMin: pilsaEventYears.length ? Math.min(...pilsaEventYears) : 0, pilsaMax: pilsaEventYears.length ? Math.max(...pilsaEventYears) : 0 },
  };
}

// ---------- AI 에게 주는 것: 스키마 · 지시문 ----------
// 구조화 출력(output_config.format)의 JSON 스키마. 재귀 · minimum/maximum 을 못 쓰므로(Claude 구조화 출력의 한계)
// 트리는 묶음 셋(all · any · none)에 잎을 펼쳐 두고, 범위 · 값이 명부에 있는지는 checkTree 가 본다.
// ⚠️ null 을 받는 칸(anyOf · 타입 배열)을 쓰지 않는다 — 갈래 칸이 많으면 API 가 400(「too many parameters with union types」 ·
//    2026-10-15 개발에서 24칸으로 걸렸다). 그래서 「안 씀」은 정해 둔 값으로 받는다: num -1 · years_ago -1 · text "" · list [] ·
//    within 은 셋 다 0 · dept 는 level "none"(이름 ""). checkLeaf 가 이 값을 「없음」으로 읽는다.
// 값 목록(교구·부서 이름)은 스키마에 넣지 않는다 — 스키마가 늘 같아야 컴파일 캐시가 산다. 이름은 지시문에 두고 서버가 검사한다.
function leafSchema(): any {
  return {
    type: "object", additionalProperties: false,
    required: ["field", "op", "num", "years_ago", "text", "list", "within", "dept", "from_text"],
    properties: {
      field: { type: "string", enum: FIELD_IDS },
      op: { type: "string", enum: OPS },
      num: { type: "number" },
      years_ago: { type: "integer" },
      text: { type: "string" },
      list: { type: "array", items: { type: "string" } },
      within: { type: "object", additionalProperties: false, required: ["last_years", "from", "to"],
        properties: { last_years: { type: "integer" }, from: { type: "integer" }, to: { type: "integer" } } },
      dept: { type: "object", additionalProperties: false, required: ["level", "name"],
        properties: { level: { type: "string", enum: [...DEPT_LEVELS, "none"] }, name: { type: "string" } } },
      from_text: { type: "string" },
    },
  };
}
export function askSchema(): any {
  return {
    type: "object", additionalProperties: false,
    required: ["all", "any", "none", "unsupported", "alternatives"],
    properties: {
      all: { type: "array", items: leafSchema() },
      any: { type: "array", items: leafSchema() },
      none: { type: "array", items: leafSchema() },
      unsupported: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "kind", "note"],
        properties: { text: { type: "string" }, kind: { type: "string", enum: UNSUP_KINDS }, note: { type: "string" } } } },
      alternatives: { type: "array", items: { type: "string" } },
    },
  };
}

const VALUE_HINT: Record<string, string> = { num: "num", year: "num(해) 또는 years_ago", text: "text", list: "list" };
export function askSystemPrompt(v: AskVocab, today: string): string {
  const y = Number(today.slice(0, 4));
  // 명단이 일부인 해 — 기록이 있는 해 안의 것만(범위 밖 해를 말하면 AI 가 그 해를 기록이 있는 해로 오해한다 · 2026-10-15 개발에서 봄)
  const partial = v.gaps.filter((g) => g.scope === "*" && g.from <= v.yearMax && (g.to ?? v.yearMax) >= v.yearMin)
    .map((g) => (g.to === null || g.to === g.from ? `${g.from}` : `${g.from}~${g.to}`));
  return [
    "너는 교회 관리 화면의 「조건 만들기」다. 담임목사님이 말로 물은 것을 아래 [필드 목록]의 조건으로만 바꾼다.",
    "명단을 찾거나 사람을 지어내지 않는다 — 조건만 만든다. 사람을 평가하지 않는다.",
    `오늘은 ${today}, 올해는 ${y}년이다. 사역 기록이 있는 해: ${v.yearMin}~${v.yearMax}년` + (partial.length ? ` (${partial.join(" · ")}년은 명단이 일부)` : "") + "."
      + (v.pilsaEventYears.length ? ` 성경필사 명단이 있는 해: ${v.pilsaMin}~${v.pilsaMax}년(회차 ${v.pilsaEventYears.length}개).` : ""),
    "",
    "[묶음]",
    "- all: 모두 맞아야 하는 조건(그리고)",
    "- any: 이 가운데 하나 이상 맞으면 되는 조건(또는) — 질문에 「또는」이 있을 때만",
    "- none: 하나라도 맞으면 빼는 조건(아님) — 「올해는 안 하시는」은 none 에 served_in_year(years_ago 0)",
    "",
    "[필드 목록]",
    ...FIELDS.map((f) => `- ${f.id}(${f.label}) · op ${f.ops.join(" ")} · 값 ${VALUE_HINT[f.value]} · ${f.desc}` + (f.service ? " · within·dept 를 붙일 수 있음" : "")
      + (f.pilsa ? " · within(기간) · text(성경필사 종류 — 아래 [성경필사 종류]에서 · 비우면 모두)를 붙일 수 있음" : "")),
    "",
    "[값 쓰는 법]",
    "- 쓰지 않는 칸: num -1 · years_ago -1 · text \"\" · list [] · within 은 last_years·from·to 모두 0 · dept 는 level \"none\", name \"\".",
    "- 해: 질문에 정확한 해(2015년)가 있으면 num 에 그 해. 「올해·작년·N년 전」은 years_ago(0=올해, 1=작년). 해를 직접 셈하지 않는다.",
    "- within(기간): 「최근 N년」= last_years N · 「2015년부터 2020년까지」= from 2015, to 2020(last_years 0).",
    "- dept(부서): 아래 [부서 이름]에서 그대로 고른다 — 질문에 가장 가까운 단계. 예: 「찬양대」= mid 찬양대 · 「교회학교」= big 교회학교 · 「시온찬양대」= team 시온찬양대.",
    "- 「N년 동안 사역」처럼 뜻이 갈리면 하나를 고르고(기본: 합쳐서 센 해 served_years_count), 다른 읽기는 alternatives 에 한국어 한 줄로.",
    "- 「봉사」·「섬김」·「사역」은 모두 사역 임명 명단(served_… 필드)으로 읽는다. 봉사 당번은 질문에 「당번」이 있을 때만이다(자료 없음).",
    "- 「…하지 않는」·「쉬고 계신」처럼 때를 말하지 않으면 올해(years_ago 0)로 읽고, 「한 번도」가 있으면 served_years_count = 0.",
    "- 직분은 질문에 나온 그대로: 「집사님」= 집사 · 「안수집사님」= 안수집사 · 「권사님」= 권사. 다른 직분을 보태지 않는다.",
    "- 성경필사 종류 이름(아래 [성경필사 종류])이 질문에 나오면 pilsa_… 잎의 text 에 그 이름을 꼭 넣는다 — 「썸머 써 바이블에 참여」= pilsa_count >= 1, text 썸머 써 바이블.",
    "- from_text: 그 조건이 나온 질문의 말을 그대로.",
    "",
    "[할 수 없는 것 — unsupported]",
    "필드로 못 바꾸는 말은 잎을 만들지 말고 unsupported 에 { text: 질문의 그 말, kind, note: 짧은 까닭 } 으로 넣는다.",
    "- no_data: 이 시스템에 자료가 없는 것 — 출석·예배 참석·헌금·심방·기도 제목·건강·교육 수료·봉사 당번(「당번」이라고 할 때) · 가을 말씀암송 동행 · 성경암송 앱 활동",
    "- out_of_range: 자료 범위 밖 — 사역 기록이 있는 해 앞, 또는 그보다 긴 기간",
    "- not_allowed: 연락처·주소·정확한 생년월일·사진·메모 같은 개인정보",
    "- judgment: 열심·믿음·성품·「힘들어 보이는」처럼 사람을 평가하는 말",
    "- too_complex: 가족·부부·목장 식구 사이처럼 한 사람의 필드로 못 묶는 조합",
    "질문의 모든 말은 잎의 from_text 나 unsupported 의 text 가운데 하나에 들어가야 한다. 버리는 말이 없게.",
    "unsupported 가 있어도 필드로 바꿀 수 있는 나머지 말(직분 · 나이 · 교구 …)은 반드시 잎으로 만든다 — 예: 「믿음이 좋은 권사님」= position 권사 잎 + judgment 하나.",
    "조건과 상관없는 말뿐이면 묶음을 모두 비우고 unsupported 에 too_complex 하나.",
    "",
    "[교구 이름]", v.gu.join(" · "),
    "", "[구분 이름]", v.kind.join(" · "),
    "", "[직분]", POSITIONS.join(" · "),
    "", "[성경필사 종류]", v.pilsaSeries.join(" · ") || "(없음)",
    "", "[부서 이름]",
    `- big: ${v.big.join(" · ")}`,
    `- family: ${v.family.join(" · ")}`,
    `- mid: ${v.mid.join(" · ")}`,
    `- team: ${v.team.join(" · ")}`,
  ].join("\n");
}

// ---------- 검사 ----------
export type Leaf = {
  field: string; op: string; num: number | null; year: number | null; text: string | null; list: string[];
  within: { from: number; to: number } | null; dept: { level: string; name: string } | null; from_text: string;
};
export type Tree = { all: Leaf[]; any: Leaf[]; none: Leaf[] };
export type Unsup = { text: string; kind: string; note: string };
export type Checked = { tree: Tree; unsupported: Unsup[]; notices: string[]; alternatives: string[] };
type LeafCheck = { ok: true; leaf: Leaf; notices: string[] } | { ok: false; unsup: Unsup };

const GENDER: Record<string, string> = { "남": "남", "남자": "남", "남성": "남", "형제": "남", "여": "여", "여자": "여", "여성": "여", "자매": "여" };

function findName(list: string[], name: unknown): string | null {
  const k = mhKey(name);
  if (!k) return null;
  return list.find((x) => mhKey(x) === k) ?? null;
}
// 고르기 칸 직분 값 — 「장로 전체」 꼴(큰 묶음)이면 그 묶음 이름, 아니면 null
const pickGroup = (t: string): string | null => PICK_GROUPS.find((g) => t === g + PICK_ALL) ?? null;
// 고르기 칸 직분 값을 목록과 맞대 본다 — 큰 묶음 「X 전체」 또는 명부의 세부 직분. 목록 밖이면 null
//   (견주기 askEval 은 운영 값 목록 vocab 을 따로 넘기는데 거기엔 posDetail 이 없다 — 비어 있어도 죽지 않게 ?? [])
function pickToken(v: AskVocab, x: string): string | null {
  if (pickGroup(x)) return x;
  const d = v.posDetail ?? [];
  return d.includes(x) ? x : findName(d, x);   // 띄어쓰기만 다른 값이 둘이면 정확히 같은 쪽이 먼저
}
// 부서 이름을 이음표에서 찾는다 — 말한 단계에 없으면 다른 단계에서(「찬양」이 big 에도 family 에도 있다)
function findDept(v: AskVocab, level: unknown, name: unknown): { level: string; name: string } | null {
  const levels = [String(level), ...DEPT_LEVELS.filter((l) => l !== level)].filter((l) => DEPT_LEVELS.includes(l));
  for (const l of levels) {
    const hit = findName((v as any)[l] as string[], name);
    if (hit) return { level: l, name: hit };
  }
  return null;
}

function checkLeaf(r: any, v: AskVocab, thisYear: number): LeafCheck {
  const f = CHECK_BY_ID[String(r?.field ?? "")];
  const from_text = str(r?.from_text, 80);
  const no = (kind: string, note: string): LeafCheck => ({ ok: false, unsup: { text: from_text || (f ? f.label : "조건"), kind, note } });
  if (!f) return no("no_data", "모르는 조건이에요");
  let op = String(r?.op ?? "");
  if (f.value === "list" && (op === "=" || op === "in")) op = "in";
  if (!f.ops.includes(op)) return no("too_complex", `「${f.label}」에는 「${op}」 비교를 쓸 수 없어요`);
  const leaf: Leaf = { field: f.id, op, num: null, year: null, text: null, list: [], within: null, dept: null, from_text: from_text || f.label };
  const notices: string[] = [];
  const span0 = v.yearMax - v.yearMin + 1;

  // 기간 · 부서 — 사역 필드에만
  const lo = f.pilsa ? v.pilsaMin : v.yearMin, hi = f.pilsa ? v.pilsaMax : v.yearMax;
  const what = f.pilsa ? "성경필사 기록" : "사역 기록";
  if ((f.service || f.pilsa) && r?.within && typeof r.within === "object") {
    const w = r.within;
    const pos = (x: unknown) => { const k = intOr(x); return k !== null && k > 0 ? k : null; };   // 0 · -1 · null = 안 씀
    const n = pos(w.last_years);
    const from = n !== null ? thisYear - n + 1 : pos(w.from);
    const to = n !== null ? thisYear : pos(w.to);
    if (from !== null || to !== null) {
      let a = from ?? v.yearMin, b = to ?? thisYear;
      if (a > b) [a, b] = [b, a];
      if (b < lo || a > hi) return no("out_of_range", `${what}은 ${lo}~${hi}년만 있어요`);
      if (a < lo) { notices.push(`「${leaf.from_text}」 — ${what}이 ${lo}년부터라 ${lo}년부터 셌어요`); a = lo; }
      leaf.within = { from: a, to: b };
    }
  }
  if (f.service && r?.dept && typeof r.dept === "object" && clean(r.dept.name)) {
    const d = findDept(v, r.dept.level, r.dept.name);
    if (!d) return no("no_data", `부서 「${str(r.dept.name, 30)}」을(를) 부서 이음표에서 찾지 못했어요`);
    leaf.dept = d;
  }
  const span = leaf.within ? leaf.within.to - Math.max(leaf.within.from, v.yearMin) + 1 : span0;
  if (f.pilsa) {
    const t = clean(r?.text);   // "" = 모든 종류
    if (t) {
      const sname = findName(v.pilsaSeries, t);
      if (!sname) return no("no_data", `성경필사 종류 「${str(t, 20)}」을(를) 찾지 못했어요`);
      leaf.text = sname;
    }
  }

  if (f.value === "num") {
    const n = typeof r?.num === "number" && Number.isFinite(r.num) && r.num >= 0 ? Math.round(r.num) : null;   // -1 = 안 씀
    if (n === null) return no("too_complex", `「${f.label}」의 수를 알 수 없어요`);
    if (f.id === "age" && (n < 0 || n > 120)) return no("out_of_range", "나이가 이치에 맞지 않아요");
    if ((f.id === "served_years_count" || f.id === "served_streak_max") && n < 0) return no("too_complex", "해 수가 이치에 맞지 않아요");
    if ((f.id === "served_years_count" || f.id === "served_streak_max") && n > span && op !== "<=")
      return no("out_of_range", leaf.within ? `그 기간은 ${span}해라 ${n}해를 셀 수 없어요`
        : `사역 기록이 ${v.yearMin}년부터라 ${span}해까지만 셀 수 있어요`);
    if (f.id === "pilsa_count" && op !== "<=") {
      const w = leaf.within, nev = v.pilsaEventYears.filter((yy) => !w || (yy >= w.from && yy <= w.to)).length;
      if (n > nev) return no("out_of_range", `그 기간의 성경필사 회차는 모두 ${nev}번이라 ${n}번을 셀 수 없어요`);
    }
    leaf.num = n;
  } else if (f.value === "year") {
    let y: number | null = Number.isInteger(r?.year) ? r.year : null;
    if (y === null && Number.isInteger(r?.years_ago) && r.years_ago >= 0) y = thisYear - r.years_ago;   // -1 = 안 씀
    if (y === null && typeof r?.num === "number" && Number.isFinite(r.num) && r.num >= 0) y = Math.round(r.num);
    if (y === null || y < 1900 || y > thisYear + 1) return no("too_complex", "해를 알 수 없어요");
    if (f.pilsa && op === "has" && (y < v.pilsaMin || y > v.pilsaMax))
      return no("out_of_range", `성경필사 기록은 ${v.pilsaMin}~${v.pilsaMax}년만 있어요`);
    if (f.service && op !== "<=" && op !== ">=" && (y < v.yearMin || y > v.yearMax))
      return no("out_of_range", `사역 기록은 ${v.yearMin}~${v.yearMax}년만 있어요`);
    if (f.service && v.gaps.some((g) => g.scope === "*" && y! >= g.from && y! <= (g.to ?? v.yearMax)))
      notices.push(`${y}년은 사역 명단이 일부예요 — 빠진 분이 있을 수 있어요`);
    leaf.year = y;
  } else if (f.value === "text") {
    const t = clean(r?.text) || clean(Array.isArray(r?.list) ? r.list[0] : "");   // "" = 안 씀
    if (f.id === "mok") {
      if (/^목장\s*없음$/.test(t)) leaf.text = "목장 없음";
      else if (t && v.mokKeys.includes(mokKey(t))) leaf.text = t;
      else return no("no_data", `목장 「${str(t, 20)}」을(를) 교인명부에서 찾지 못했어요`);
    } else if (f.id === "gender") {
      const g = GENDER[mhKey(t)];
      if (!g) return no("too_complex", "성별은 남 · 여 가운데서만 찾아요");
      leaf.text = g;
    } else if (f.id === "kind") {
      const k = findName(v.kind, t);
      if (!k) return no("no_data", `구분 「${str(t, 20)}」이(가) 교인명부에 없어요`);
      leaf.text = k;
    }
  } else if (f.value === "list") {
    const raw = (Array.isArray(r?.list) && r.list.length ? r.list : r?.text ? [r.text] : []).map((x: unknown) => clean(x)).filter(Boolean);
    const ok: string[] = [], bad: string[] = [];
    for (const x of raw) {
      if (f.id === "gu") {
        const g = findName(v.gu, x) ?? findName(v.gu, String(x).replace(/교구$/, ""));
        if (g) { if (!ok.includes(g)) ok.push(g); } else bad.push(x);
      } else if (f.id === "position") {
        let p: string | null = null;
        if (POSITIONS.includes(x)) p = x;
        else if (/^(성도|없음|평신도|직분없음)$/.test(mhKey(x))) p = "직분 없음";
        else { const b = positionBucket(x); p = b === "모름" ? null : b; }
        if (p) { if (!ok.includes(p)) ok.push(p); } else bad.push(x);
      } else if (f.id === "pos_pick") {
        const tk = pickToken(v, x);
        if (tk) { if (!ok.includes(tk)) ok.push(tk); } else bad.push(x);
      } else if (f.id === "reg_pick") {
        const tk = regToken(x);
        if (tk) { if (!ok.includes(tk)) ok.push(tk); } else bad.push(x);
      } else if (f.id === "age_pick") {
        if (AGE_BY_LABEL.has(x)) { if (!ok.includes(x)) ok.push(x); } else bad.push(x);
      }
    }
    if (!ok.length) return no("no_data", `「${str(raw.join(", ") || f.label, 30)}」을(를) ${f.label} 목록에서 찾지 못했어요`);
    if (bad.length) notices.push(`${f.label} 「${bad.join(", ")}」은(는) 목록에 없어 뺐어요`);
    leaf.list = ok;
  }
  return { ok: true, leaf, notices };
}

export function checkTree(raw: any, v: AskVocab, thisYear: number): Checked {
  const tree: Tree = { all: [], any: [], none: [] };
  const unsupported: Unsup[] = [], notices: string[] = [];
  let leaves = 0;
  for (const g of GROUPS) {
    const arr = Array.isArray(raw?.[g]) ? raw[g] : [];
    for (const r of arr) {
      const c = checkLeaf(r, v, thisYear);
      if (!c.ok) { unsupported.push(c.unsup); continue; }
      if (leaves >= ASK_MAX_LEAVES) { unsupported.push({ text: c.leaf.from_text, kind: "too_complex", note: `조건은 ${ASK_MAX_LEAVES}개까지만 써요` }); continue; }
      (tree as any)[g].push(c.leaf); leaves++;
      for (const n of c.notices) if (!notices.includes(n)) notices.push(n);
    }
  }
  // 「또는」이 하나뿐이면 「그리고」와 같다
  if (tree.any.length === 1) { tree.all.push(tree.any[0]); tree.any = []; }
  for (const u of Array.isArray(raw?.unsupported) ? raw.unsupported : []) {
    const text = str(u?.text, 100);
    if (!text) continue;
    unsupported.push({ text, kind: UNSUP_KINDS.includes(u?.kind) ? u.kind : "too_complex", note: str(u?.note, 120) });
  }
  const alternatives = (Array.isArray(raw?.alternatives) ? raw.alternatives : []).map((a: unknown) => str(a, 120)).filter(Boolean).slice(0, 3);
  return { tree, unsupported, notices, alternatives };
}

export const leafCount = (t: Tree): number => t.all.length + t.any.length + t.none.length;
// 세 갈래 — ok 모두 됨 · partial 섞임(멈추고 여쭙기) · none 하나도 못 함
export function statusOf(c: Checked): "ok" | "partial" | "none" {
  if (!leafCount(c.tree)) return "none";
  return c.unsupported.length ? "partial" : "ok";
}

// ---------- 셈 ----------
const cmp = (a: number, op: string, b: number): boolean => (op === ">=" ? a >= b : op === "<=" ? a <= b : a === b);

function deptHit(s: Seat, d: { level: string; name: string } | null): boolean {
  if (!d) return true;
  return d.level === "big" ? s.big === d.name : d.level === "family" ? s.family === d.name : d.level === "mid" ? s.mid === d.name : s.team === d.name;
}
// 그 잎이 보는 해 — 부서 · 기간으로 거른 사역 이력의 서로 다른 해
function yearsFor(p: AskPerson, l: Leaf, d: AskData): Set<number> {
  const out = new Set<number>();
  for (const s of d.seats.get(p.id) ?? []) {
    if (!deptHit(s, l.dept)) continue;
    if (l.within && (s.year < l.within.from || s.year > l.within.to)) continue;
    out.add(s.year);
  }
  return out;
}
// 명단이 일부인 해 — 전체(*)는 늘, 큰 분류(g:)·계열(f:)은 부서를 그쪽으로 걸었을 때만(ministry_list_gaps)
export function gapYears(dept: { level: string; name: string } | null, v: AskVocab): Set<number> {
  const bigs = new Set<string>(), fams = new Set<string>();
  if (dept) for (const r of v.rows) if (deptHit({ year: 0, ...r }, dept)) { bigs.add(r.big); fams.add(r.family); }
  const out = new Set<number>();
  for (const g of v.gaps) {
    const on = g.scope === "*" || (g.scope.startsWith("g:") && bigs.has(g.scope.slice(2))) || (g.scope.startsWith("f:") && fams.has(g.scope.slice(2)));
    if (!on) continue;
    for (let y = g.from; y <= (g.to ?? v.yearMax); y++) out.add(y);
  }
  return out;
}
// 잇따라 섬긴 가장 긴 해 수 — 명단이 일부인 해는 끊긴 것으로 보지 않는다(세지도 않는다)
export function streakOf(years: Set<number>, gaps: Set<number>): number {
  if (!years.size) return 0;
  const lo = Math.min(...years), hi = Math.max(...years);
  let run = 0, best = 0;
  for (let y = lo; y <= hi; y++) {
    if (years.has(y)) { run++; best = Math.max(best, run); }
    else if (!gaps.has(y)) run = 0;
  }
  return best;
}

// 그 잎이 보는 성경필사 줄 — 종류(text) · 기간(within)으로 거른 것
function pilsaFor(p: AskPerson, l: Leaf, d: AskData): PilsaEntry[] {
  return (d.pilsa.get(p.id) ?? []).filter((e) => (!l.text || e.series === l.text) && (!l.within || (e.year >= l.within.from && e.year <= l.within.to)));
}

function leafTrue(l: Leaf, p: AskPerson, d: AskData): boolean {
  switch (l.field) {
    case "gu": return l.list.includes(p.gu);
    case "mok": return l.text === "목장 없음" ? p.mokKey === "" : mokKey(l.text) === p.mokKey;
    case "position": return l.list.includes(p.pos);
    case "pos_pick": return l.list.some((t) => { const g = pickGroup(t); return g ? p.pos === g : p.posDetail === t; });
    case "reg_pick": return p.regYear !== null && l.list.some((t) => (t === REG_OLD ? p.regYear! < REG_PICK_FROM : p.regYear === Number(t)));
    case "age_pick": return p.age !== null && l.list.some((t) => { const b = AGE_BY_LABEL.get(t); return !!b && p.age! >= b.min && p.age! <= b.max; });
    case "gender": return p.gender === l.text;
    case "age": return p.age !== null && cmp(p.age, l.op, l.num!);
    case "kind": return mhKey(p.kind) === mhKey(l.text);
    case "registered_year": return p.regYear !== null && cmp(p.regYear, l.op, l.year!);
    case "pilsa_count": {
      const n = new Set(pilsaFor(p, l, d).map((e) => e.event)).size;
      return l.op === "<=" ? n >= 1 && n <= l.num! : cmp(n, l.op, l.num!);
    }
    case "pilsa_in_year": return pilsaFor(p, l, d).some((e) => e.year === l.year);
  }
  const ys = yearsFor(p, l, d);
  switch (l.field) {
    case "served_years_count":
      // 「N해 이하」는 섬긴 적 있는 분 중에서 · 「= 0」은 한 번도 안 섬긴 분
      return l.op === "<=" ? ys.size >= 1 && ys.size <= l.num! : cmp(ys.size, l.op, l.num!);
    case "served_in_year": return ys.has(l.year!);
    case "first_served_year": return ys.size > 0 && cmp(Math.min(...ys), l.op, l.year!);
    case "last_served_year": return ys.size > 0 && cmp(Math.max(...ys), l.op, l.year!);
    case "served_streak_max": {
      const n = streakOf(ys, gapYears(l.dept, d.vocab));
      return l.op === "<=" ? n >= 1 && n <= l.num! : cmp(n, l.op, l.num!);
    }
  }
  return false;
}

export function runTree(t: Tree, d: AskData): AskPerson[] {
  if (!leafCount(t)) return [];
  return d.people.filter((p) => t.all.every((l) => leafTrue(l, p, d))
    && (t.any.length === 0 || t.any.some((l) => leafTrue(l, p, d)))
    && !t.none.some((l) => leafTrue(l, p, d)));
}

// 화면 줄 — 교인ID(이름을 누르면 교인명부 「자세히」 창 — peoplePerson) · 이름 · 직분 · 교구 · 목장 · 나이 · 섬긴 해 · 처음~마지막 · 주로 섬긴 곳.
//   연락처 · 주소는 싣지 않는다(「자세히」 창이 peoplePerson 으로 따로 읽고 people.view 를 남긴다).
//   ⚠️ 교인ID 는 교인명부 · 총괄 응답에만 — 이 액션이 총괄 밖으로 열리면(담임목사 역할) 그 역할이 교인명부도 볼 수 있는지부터 정할 것.
export function rowOut(p: AskPerson, d: AskData) {
  const seats = d.seats.get(p.id) ?? [];
  const years = [...new Set(seats.map((s) => s.year))].sort((a, b) => a - b);
  const where = new Map<string, Set<number>>();
  for (const s of seats) {
    const k = s.family === s.big ? (s.mid || s.team) : s.family;
    if (!where.has(k)) where.set(k, new Set());
    where.get(k)!.add(s.year);
  }
  const main = [...where.entries()].sort((a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1))[0];
  const pilsa = new Set((d.pilsa.get(p.id) ?? []).map((e) => e.event)).size;
  return { id: p.id, name: p.name, position: p.position, gu: p.gu, mok: p.mok, age: p.age, served: years.length, pilsa,
    first: years[0] ?? null, last: years.length ? years[years.length - 1] : null, main: main ? main[0] : "" };
}
const rowCmp = (a: ReturnType<typeof rowOut>, b: ReturnType<typeof rowOut>) =>
  b.served - a.served || (b.last ?? 0) - (a.last ?? 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

// ---------- 칩 글 ----------
const NUM_WORD: Record<string, string> = { ">=": " 이상", "<=": " 이하", "=": "" };
const YEAR_WORD: Record<string, string> = { ">=": " 이후", "<=": " 이전", "=": "" };
export function describeLeaf(l: Leaf): string {
  let s = "";
  switch (l.field) {
    case "gu": s = `교구 ${l.list.join("·")}`; break;
    case "mok": s = `목장 ${l.text}`; break;
    case "position": s = `직분 ${l.list.join("·")}`; break;
    case "pos_pick": s = `직분 ${l.list.join("·")}`; break;
    case "reg_pick": s = `등록년도 ${l.list.map((t) => (t === REG_OLD ? t : `${t}년`)).join("·")}`; break;
    case "age_pick": s = `연령대 ${l.list.join("·")}`; break;
    case "gender": s = `성별 ${l.text}`; break;
    case "kind": s = `구분 ${l.text}`; break;
    case "age": s = `나이 ${l.num}${NUM_WORD[l.op]}`; break;
    case "registered_year": s = `등록 ${l.year}년${YEAR_WORD[l.op]}`; break;
    case "served_years_count": s = l.op === "=" && l.num === 0 ? "사역한 적 없음" : `섬긴 해 ${l.num}해${NUM_WORD[l.op]}`; break;
    case "served_in_year": s = `${l.year}년 사역`; break;
    case "first_served_year": s = `처음 섬긴 해 ${l.year}년${YEAR_WORD[l.op]}`; break;
    case "last_served_year": s = `마지막 섬긴 해 ${l.year}년${YEAR_WORD[l.op]}`; break;
    case "served_streak_max": s = `잇따라 섬긴 해 ${l.num}해${NUM_WORD[l.op]}`; break;
    case "pilsa_count": s = l.op === "=" && l.num === 0 ? "성경필사 한 적 없음" : `성경필사 ${l.num}번${NUM_WORD[l.op]}`; break;
    case "pilsa_in_year": s = `${l.year}년 성경필사`; break;
    default: s = l.field;
  }
  if (l.within) s += ` · ${l.within.from}~${l.within.to}년`;
  if (l.text && FIELD_BY_ID[l.field]?.pilsa) s += ` · ${l.text}`;
  if (l.dept) s += ` · ${l.dept.name}`;
  return s;
}

// ---------- 질문 · 응답 ----------
export function askQuestion(q: unknown): { ok: true; q: string } | { ok: false; error: string } {
  const t = String(q ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, error: "no-question" };
  if (t.length > ASK_Q_MAX) return { ok: false, error: "question-too-long" };
  return { ok: true, q: t };
}

// AI 답(또는 화면이 고친 트리)을 검사하고, 갈래에 따라 센다.
//   fromAi: AI 에서 온 첫 답이면 partial 일 때 세지 않고 멈춘다(「나머지 조건으로만 찾기」를 누르면 화면이 askPeopleRun 으로 다시 부른다).
export function askOut(raw: any, d: AskData, today: string, fromAi: boolean) {
  const thisYear = Number(today.slice(0, 4));
  const c = checkTree(raw, d.vocab, thisYear);
  const status = statusOf(c);
  const out = {
    status, tree: c.tree,
    chips: { all: c.tree.all.map(describeLeaf), any: c.tree.any.map(describeLeaf), none: c.tree.none.map(describeLeaf) },
    unsupported: c.unsupported.map((u) => ({ ...u, label: UNSUP_LABEL[u.kind] ?? UNSUP_LABEL.too_complex })),
    alternatives: c.alternatives, notices: c.notices,
    total: null as number | null, rows: [] as ReturnType<typeof rowOut>[], truncated: false,
    source: { people: d.people.length, years: `${d.vocab.yearMin}~${d.vocab.yearMax}`, linked: d.linked, histRows: d.histRows,
      pilsaYears: d.vocab.pilsaEventYears.length ? `${d.vocab.pilsaMin}~${d.vocab.pilsaMax}` : "", pilsaLinked: d.pilsaLinked },
  };
  if (status === "none" || (status === "partial" && fromAi)) return out;
  const rows = runTree(c.tree, d).map((p) => rowOut(p, d)).sort(rowCmp);
  out.total = rows.length;
  out.rows = rows.slice(0, ASK_ROW_MAX);
  out.truncated = rows.length > ASK_ROW_MAX;
  return out;
}

// ---------- 화면 고르기 칸(2026-10-19) ----------
export type Picks = { pos: string[]; gu: string[]; reg: string[]; age: string[]; cut?: number };
// 화면이 보낸 picks 를 다듬는다 — 문자열만 · 빈 것 빼고 · 겹친 것 하나로 · 칸마다 PICK_MAX 개까지(넘친 것은 버리고 cut 에 센다).
//   「모두 고름」은 화면이 빈 배열로 보낸다(설계 §1-3) — 서버는 그 뜻을 따로 알 필요가 없다(모두 보내와도 같은 명단이다).
export function askPicks(raw: any): Picks {
  let cut = 0;
  const one = (a: unknown): string[] => {
    // 무거운 일 전에 먼저 자른다(PICK_MAX 의 두 배까지만 다듬는다 — 겹침·빈 값이 섞여도 PICK_MAX 개는 채울 수 있게)
    const arr = (Array.isArray(a) ? a : []).slice(0, PICK_MAX * 2);
    const all = [...new Set(arr.filter((x) => typeof x === "string").map((x) => str(x, 40)).filter(Boolean))];
    cut += Math.max(0, all.length - PICK_MAX);
    return all.slice(0, PICK_MAX);
  };
  const pos = one(raw?.pos), gu = one(raw?.gu), reg = one(raw?.reg), age = one(raw?.age);
  return { pos, gu, reg, age, cut };
}
// 고른 값 → 조건 잎(검사 전 꼴 — checkTree 가 AI 잎과 같은 검사를 한다). 빈 칸은 잎을 만들지 않는다. 교구는 이미 있는 gu 잎.
export function picksToLeaves(p: Picks): any[] {
  const out: any[] = [];
  if (p.pos.length) out.push({ field: "pos_pick", op: "in", list: p.pos, from_text: PICK_FROM.pos });
  if (p.gu.length) out.push({ field: "gu", op: "in", list: p.gu, from_text: PICK_FROM.gu });
  if (p.reg?.length) out.push({ field: "reg_pick", op: "in", list: p.reg, from_text: PICK_FROM.reg });
  if (p.age?.length) out.push({ field: "age_pick", op: "in", list: p.age, from_text: PICK_FROM.age });
  return out;
}
// AI 트리 앞에 고른 잎을 둔다(「그리고」 맨 앞 — 잎 상한 ASK_MAX_LEAVES 안에서 고른 잎이 먼저 자리를 차지한다)
export function withPicks(raw: any, leaves: any[]): any {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return { ...r, all: [...leaves, ...(Array.isArray(r.all) ? r.all : [])] };
}

// 고르기 목록(askPeopleOptions) — 값과 인원 수만(이름 · 교인ID 없음).
//   직분: 큰 묶음 넷(「X 전체」 · 사람이 있는 것만) → 세부(큰 묶음 차례 안에서 많은 순 · 「직분 없음」 맨 끝)
//   교구: 교회 정한 차례(BE_GU) 가운데 명부에 있는 것 → 그 밖(많은 순)
//   등록년도: REG_PICK_FROM 부터의 해 가운데 사람이 있는 해(최근 해부터) → REG_OLD(그 앞 모두 · 사람이 있으면) — 등록일 없는 분은 세지 않는다
//   연령대: AGE_BANDS 차례(어린 쪽부터) 가운데 사람이 있는 칸 — 나이 없는 분은 세지 않는다
const POS_ORDER = [...PICK_GROUPS, "그 밖"];
const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function askOptions(d: AskData) {
  const groupN = new Map<string, number>(), detN = new Map<string, number>(), guN = new Map<string, number>(), regN = new Map<string, number>(), ageN = new Map<string, number>();
  for (const p of d.people) {
    if (PICK_GROUPS.includes(p.pos)) groupN.set(p.pos, (groupN.get(p.pos) ?? 0) + 1);
    detN.set(p.posDetail, (detN.get(p.posDetail) ?? 0) + 1);
    if (p.gu) guN.set(p.gu, (guN.get(p.gu) ?? 0) + 1);
    if (p.regYear !== null) { const k = p.regYear < REG_PICK_FROM ? REG_OLD : String(p.regYear); regN.set(k, (regN.get(k) ?? 0) + 1); }
    if (p.age !== null) { const b = AGE_BANDS.find((x) => p.age! >= x.min && p.age! <= x.max); if (b) ageN.set(b.label, (ageN.get(b.label) ?? 0) + 1); }
  }
  const rank = (t: string) => (t === "직분 없음" ? 99 : Math.max(0, POS_ORDER.indexOf(positionBucket(t))));
  const details = [...detN.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1] || byName(a[0], b[0]));
  const positions = [
    ...PICK_GROUPS.filter((g) => groupN.get(g)).map((g) => ({ value: g + PICK_ALL, label: g + PICK_ALL, count: groupN.get(g)!, kind: "group" as const, group: g })),
    ...details.map(([t, n]) => ({ value: t, label: t, count: n, kind: "detail" as const,
      group: t === "직분 없음" ? "" : (positionBucket(t) === "모름" ? "그 밖" : positionBucket(t)) })),
  ];
  const known = BE_GU.filter((g) => guN.has(g));
  const rest = [...guN.entries()].filter(([g]) => !BE_GU.includes(g)).sort((a, b) => b[1] - a[1] || byName(a[0], b[0])).map(([g]) => g);
  const regYears = [...regN.keys()].filter((k) => k !== REG_OLD).sort((a, b) => Number(b) - Number(a));
  const reg = [...regYears.map((y) => ({ value: y, label: `${y}년`, count: regN.get(y)! })),
    ...(regN.has(REG_OLD) ? [{ value: REG_OLD, label: REG_OLD, count: regN.get(REG_OLD)! }] : [])];
  const age = AGE_BANDS.filter((b) => ageN.get(b.label)).map((b) => ({ value: b.label, label: b.label, count: ageN.get(b.label)! }));
  return { people: d.people.length, positions, gu: [...known, ...rest].map((g) => ({ value: g, count: guN.get(g)! })), reg, age };
}
