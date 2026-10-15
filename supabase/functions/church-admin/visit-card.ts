// 교회 어드민 — 🏠 심방 준비 한 장(시험판 · 2026-10-15 · 친구 요청 「② 심방 준비 한 장 구현」): 카드 재료 · AI 에 줄 사실 목록 · 답 검사(순수 함수)
//   시안: v2 docs/superpowers/specs/2026-10-15-pastor-ai-ask-design.md 「② 심방 준비 한 장」 · 캔버스 Visit.dc.html.
//   서버(Deno, index.ts)와 시험(Node, tests/visit-card.test.mjs)이 **같은 파일**을 읽는다 — 원격 import·enum 금지.
//   재료는 교인명부 「자세히」와 같은 것(church_people 한 줄 · 같은 가구 · personHistory 의 사역 · 성경필사 · 교육 탭).
//   ⚠️ 카드에는 연락처 · 주소 · 생년월일을 싣지 않는다(「교인명부 자세히」 단추로 본다).
//   ⚠️ AI 에게 가는 것은 visitFacts 의 줄뿐 — **이름이 없다**(본인 · 가족 모두 「이분」 · 관계로만). 시험이 지킨다.
//   가족(2026-10-15 친구 「심방정보에 가족에 대한 부분도」) — 같은 가구 한 분마다 섬김 · 성경필사 · 교육 · 성경암송을 한 줄로(famLine).
//   성경암송(memo-rec.ts MemoSummary)은 본인 칸 · 가족 줄 모두 — 서버가 총괄에게만 만든다(심방 카드 자체가 총괄만).

const s = (v: unknown): string => String(v ?? "").normalize("NFC").trim();
const yearOf = (d: unknown): number | null => { const m = /^(\d{4})/.exec(s(d)); return m ? Number(m[1]) : null; };
const ageOf = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 120 ? Math.floor(n) : null;
};

export type VisitCard = {
  head: { name: string; position: string; gu: string; mok: string; kind: string; age: number | null; gender: string;
    regYear: number | null; regYears: number | null; household_rel: string };
  tags: string[];
  family: FamilyLine[];
  memo: MemoBrief | null;
  service: { total: number; first: number | null; last: number | null; thisYear: boolean; years: { year: number; teams: string[] }[] };
  orders: { year: number; team: string; status: string }[];
  bible: { year: number | null; title: string }[];
  education: { term: string; title: string; status: string }[];
};

// 성경암송 — 카드에 싣는 만큼(MemoSummary 에서 · 계정 이름 · 소속은 「찾은 방법」과 수만)
export type MemoBrief = { accounts: number; how: string[]; done: number; doneWeekly: number; donePsalm: number; doneNavi: number;
  started: number; days: number; days30: number; lastDay: string; recent: { ref: string; day: string }[] };
export function memoBrief(m: any): MemoBrief | null {
  if (!m || typeof m !== "object") return null;
  const n = (v: unknown) => Math.max(0, Number(v) || 0);
  return { accounts: Array.isArray(m.accounts) ? m.accounts.length : 0, how: [...new Set(((m.accounts ?? []) as any[]).map((a) => s(a?.how)).filter(Boolean))],
    done: n(m.done), doneWeekly: n(m.doneWeekly), donePsalm: n(m.donePsalm), doneNavi: n(m.doneNavi), started: n(m.started),
    days: n(m.days), days30: n(m.days30), lastDay: s(m.lastDay),
    recent: ((m.recent ?? []) as any[]).slice(0, 5).map((r) => ({ ref: s(r?.ref), day: s(r?.day) })).filter((r) => r.ref) };
}
// 가족 한 분 — 섬김(모두 몇 해 · 올해 · 가장 최근 해의 팀) · 성경필사(번 · 가장 최근) · 교육(수료 수) · 성경암송(요약)
export type FamilyLine = { id: number; name: string; rel: string; position: string; age: number | null;
  service: { total: number; last: number | null; thisYear: boolean; teams: string[] } | null;
  bible: { count: number; lastYear: number | null; lastTitle: string } | null;
  eduDone: number | null; memo: MemoBrief | null };

// 사역 이력(임명 명단) 줄을 해마다 묶는다(같은 해 같은 팀은 한 번) — 본인 · 가족이 같이 쓴다
function serviceYears(history: any): { year: number; teams: string[] }[] {
  const byYear = new Map<number, string[]>();
  for (const m of (history?.ministry ?? []) as any[]) {
    if (m?.kind !== "history") continue;
    const y = Number(m?.year);
    if (!Number.isInteger(y) || y <= 0) continue;
    const team = s(m?.team) || s(m?.committee) || "(팀 이름 없음)";
    const list = byYear.get(y) ?? [];
    if (!list.includes(team)) list.push(team);
    byYear.set(y, list);
  }
  return [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, teams]) => ({ year, teams }));
}
const bibleOf = (history: any) => ((history?.bible ?? []) as any[])
  .map((b) => ({ year: yearOf(b?.opens_on), title: s(b?.short_title) || s(b?.title) }))
  .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
const eduOf = (history: any) => ((history?.education ?? []) as any[])
  .map((e) => ({ term: s(e?.term), title: s(e?.title), status: e?.certNo && !e?.certRevoked ? "수료" : s(e?.statusLabel) || s(e?.status) }));

// 가족 한 분의 줄 — f = church_people 한 줄(FAMILY_COLS) + history(personHistory · 읽기 실패면 null) + memo(MemoSummary · 없으면 null)
export function famLine(f: any, Y: number): FamilyLine {
  const h = f?.history ?? null;
  const yrs = h ? serviceYears(h) : [];
  const bible = h ? bibleOf(h) : [];
  return {
    id: Number(f?.person_id) || 0, name: s(f?.name), rel: s(f?.household_rel), position: s(f?.position), age: ageOf(f?.age),
    service: h ? { total: yrs.length, last: yrs.length ? yrs[0].year : null, thisYear: yrs.some((x) => x.year === Y), teams: yrs.length ? yrs[0].teams : [] } : null,
    bible: h ? { count: bible.length, lastYear: bible[0]?.year ?? null, lastTitle: bible[0]?.title ?? "" } : null,
    eduDone: h && Array.isArray(h.education) ? eduOf(h).filter((e) => e.status === "수료").length : null,
    memo: memoBrief(f?.memo),
  };
}

// person = church_people 한 줄 · family = 같은 가구(본인 빼고 · 한 분마다 history · memo 를 붙여 와도 된다) ·
//   history = personHistory(사역 · 성경필사 · 교육) · today = KST 날짜 · memo = 본인 성경암송(MemoSummary · 없으면 null)
export function visitCard(person: any, family: any[], history: any, today: string, memo: any = null): VisitCard {
  const Y = Number(today.slice(0, 4));
  const regYear = yearOf(person?.registered_date) ?? yearOf(person?.registered);
  // 섬김 — 사역 이력(임명 명단) 줄만 해마다 묶는다(같은 해 같은 팀은 한 번)
  const years = serviceYears(history);
  const ys = years.map((x) => x.year);
  // 사역신청(내년 신청 등) — 따로 보인다(임명 전일 수 있다)
  const orders = ((history?.ministry ?? []) as any[]).filter((m) => m?.kind === "order")
    .map((m) => ({ year: Number(m?.year) || 0, team: s(m?.team) || s(m?.committee), status: s(m?.status) }))
    .sort((a, b) => b.year - a.year);
  const bible = bibleOf(history);
  const education = eduOf(history);
  const thisYear = ys.includes(Y);
  const mb = memoBrief(memo);
  const tags: string[] = [];
  tags.push(!ys.length ? "사역한 적 없음" : thisYear ? `${Y}년 섬기는 중` : `${Y}년 사역 쉼`);
  if (bible.some((b) => b.year === Y)) tags.push(`${Y}년 성경필사`);
  if (education.some((e) => e.status === "수료")) tags.push("교육 수료");
  if (mb && mb.done) tags.push(`성경암송 ${mb.done}구절`);
  return {
    head: { name: s(person?.name), position: s(person?.position), gu: s(person?.mok1), mok: s(person?.mok3), kind: s(person?.kind2),
      age: ageOf(person?.age), gender: s(person?.gender), regYear, regYears: regYear ? Y - regYear + 1 : null, household_rel: s(person?.household_rel) },
    tags,
    family: (family ?? []).map((f) => famLine(f, Y)),
    memo: mb,
    service: { total: ys.length, first: ys.length ? Math.min(...ys) : null, last: ys.length ? Math.max(...ys) : null, thisYear, years },
    orders, bible, education,
  };
}

// AI 에 줄 사실 목록 — **이름 없음**(본인은 「이분」, 가족은 관계 · 직분 · 나이만). 팀 · 회차 · 강좌 이름은 사람 정보가 아니다.
export function visitFacts(c: VisitCard, today: string): string[] {
  const Y = Number(today.slice(0, 4));
  const h = c.head;
  const sv = c.service;
  const fam = c.family.map((f) => famFact(f, Y));
  const m = c.memo;
  return [
    `오늘: ${today}`,
    `이분: 직분 ${h.position || "없음"} · 성별 ${h.gender || "모름"} · 나이 ${h.age ?? "모름"} · 구분 ${h.kind || "모름"}` +
      (h.regYear ? ` · ${h.regYear}년 등록(${h.regYears}년째)` : ""),
    fam.length ? `가족(같은 가구) ${fam.length}명:` : "가족(같은 가구): 명부에 없음",
    ...fam.map((x) => `- ${x}`),
    sv.total
      ? `사역(임명 명단): 모두 ${sv.total}해 · ${sv.first}~${sv.last} · ${Y}년 ${sv.thisYear ? "섬기는 중" : "쉼"} · 해마다: ` +
        sv.years.slice(0, 12).map((x) => `${x.year} ${x.teams.join("·")}`).join(" / ")
      : "사역(임명 명단): 기록 없음",
    c.orders.length ? `사역신청: ${c.orders.map((o) => `${o.year} ${o.team}(${o.status})`).join(" / ")}` : "",
    `성경필사: ${c.bible.length ? c.bible.map((b) => `${b.year ?? ""} ${b.title}`.trim()).join(" / ") : "기록 없음"}`,
    `교육: ${c.education.length ? c.education.map((e) => `${e.term} ${e.title}(${e.status})`.trim()).join(" / ") : "기록 없음"}`,
    !m ? "" : !m.accounts ? "성경암송 앱: 계정을 찾지 못함" :
      `성경암송 앱: 다 마친 말씀 ${m.done}구절 · 활동한 날 모두 ${m.days}일(최근 30일 ${m.days30}일)` +
      (m.lastDay ? ` · 마지막 ${m.lastDay}` : "") + (m.recent.length ? ` · 최근 외운 말씀 ${m.recent.map((r) => r.ref).join(", ")}` : ""),
  ].filter(Boolean);
}

// 가족 한 분의 사실 한 줄 — 이름 없이(관계 · 직분 · 나이 · 섬김 · 성경필사 · 교육 · 성경암송)
export function famFact(f: FamilyLine, Y: number): string {
  const head = [f.rel || "가족", f.position, f.age !== null ? `${f.age}세` : ""].filter(Boolean).join(" ");
  const bits: string[] = [];
  if (f.service) bits.push(!f.service.total ? "사역 기록 없음"
    : `사역 ${f.service.total}해 · ${f.service.thisYear ? `${Y}년 ${f.service.teams.join("·")}` : `마지막 ${f.service.last}년 ${f.service.teams.join("·")}`}`);
  if (f.bible) {
    const y = f.bible.lastYear && !f.bible.lastTitle.startsWith(String(f.bible.lastYear)) ? f.bible.lastYear : "";   // 회차 이름에 해가 있으면 한 번만
    bits.push(f.bible.count ? `성경필사 ${f.bible.count}번(최근 ${[y, f.bible.lastTitle].filter(Boolean).join(" ")})` : "성경필사 없음");
  }
  if (f.eduDone) bits.push(`교육 수료 ${f.eduDone}`);
  if (f.memo) bits.push(f.memo.accounts ? `성경암송 ${f.memo.done}구절 · 최근 30일 ${f.memo.days30}일` : "성경암송 앱 계정 못 찾음");
  return bits.length ? `${head} — ${bits.join(" · ")}` : head;
}

export const VISIT_SYSTEM = [
  "너는 담임목사님의 심방 준비를 돕는다. 아래 [사실]만 보고 심방 때 나눌 이야깃거리를 세 가지 쓴다.",
  "- 한 가지에 한국어 한두 문장. 감사 · 격려 · 안부 · 다음 걸음을 여쭙는 말로.",
  "- [사실]에 없는 것을 짐작하지 않는다 — 건강 · 형편 · 마음 · 사역을 쉬는 까닭을 지어내지 않는다.",
  "- 사람을 평가하거나 판단하는 말(열심이 부족 · 소홀 · 신앙이 약함 등)을 쓰지 않는다.",
  "- 이름을 쓰지 않는다 — 「이분」. 가족은 [사실]의 관계 · 직분 · 나이만 쓴다.",
  "- 숫자와 해는 [사실]에 있는 그대로 쓴다.",
].join("\n");

// 구조화 출력 스키마 — 갈래 칸(anyOf) 없음 · 세 가지는 서버가 자른다(배열 길이 제약은 스키마로 못 건다)
export function visitSchema(): any {
  return { type: "object", additionalProperties: false, required: ["points"],
    properties: { points: { type: "array", items: { type: "string" } } } };
}

// AI 답 검사 — 문자열만 · 비지 않은 것 · 세 가지까지 · 한 가지 200자까지
export function visitPointsOut(raw: any): string[] {
  const arr = Array.isArray(raw?.points) ? raw.points : [];
  return arr.map((x: unknown) => s(x).slice(0, 200)).filter(Boolean).slice(0, 3);
}
