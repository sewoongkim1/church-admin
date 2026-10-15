// 교회 어드민 — 🏠 심방 준비 한 장(시험판 · 2026-10-15 · 친구 요청 「② 심방 준비 한 장 구현」): 카드 재료 · AI 에 줄 사실 목록 · 답 검사(순수 함수)
//   시안: v2 docs/superpowers/specs/2026-10-15-pastor-ai-ask-design.md 「② 심방 준비 한 장」 · 캔버스 Visit.dc.html.
//   서버(Deno, index.ts)와 시험(Node, tests/visit-card.test.mjs)이 **같은 파일**을 읽는다 — 원격 import·enum 금지.
//   재료는 교인명부 「자세히」와 같은 것(church_people 한 줄 · 같은 가구 · personHistory 의 사역 · 성경필사 · 교육 탭).
//   ⚠️ 카드에는 연락처 · 주소 · 생년월일을 싣지 않는다(「교인명부 자세히」 단추로 본다).
//   ⚠️ AI 에게 가는 것은 visitFacts 의 줄뿐 — **이름이 없다**(본인 · 가족 모두 「이분」 · 관계로만). 시험이 지킨다.

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
  family: { name: string; rel: string; position: string; age: number | null }[];
  service: { total: number; first: number | null; last: number | null; thisYear: boolean; years: { year: number; teams: string[] }[] };
  orders: { year: number; team: string; status: string }[];
  bible: { year: number | null; title: string }[];
  education: { term: string; title: string; status: string }[];
};

// person = church_people 한 줄 · family = 같은 가구(본인 빼고) · history = personHistory(사역 · 성경필사 · 교육) · today = KST 날짜
export function visitCard(person: any, family: any[], history: any, today: string): VisitCard {
  const Y = Number(today.slice(0, 4));
  const regYear = yearOf(person?.registered_date) ?? yearOf(person?.registered);
  // 섬김 — 사역 이력(임명 명단) 줄만 해마다 묶는다(같은 해 같은 팀은 한 번)
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
  const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, teams]) => ({ year, teams }));
  const ys = years.map((x) => x.year);
  // 사역신청(내년 신청 등) — 따로 보인다(임명 전일 수 있다)
  const orders = ((history?.ministry ?? []) as any[]).filter((m) => m?.kind === "order")
    .map((m) => ({ year: Number(m?.year) || 0, team: s(m?.team) || s(m?.committee), status: s(m?.status) }))
    .sort((a, b) => b.year - a.year);
  const bible = ((history?.bible ?? []) as any[])
    .map((b) => ({ year: yearOf(b?.opens_on), title: s(b?.short_title) || s(b?.title) }))
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const education = ((history?.education ?? []) as any[])
    .map((e) => ({ term: s(e?.term), title: s(e?.title), status: e?.certNo && !e?.certRevoked ? "수료" : s(e?.statusLabel) || s(e?.status) }));
  const thisYear = byYear.has(Y);
  const tags: string[] = [];
  tags.push(!ys.length ? "사역한 적 없음" : thisYear ? `${Y}년 섬기는 중` : `${Y}년 사역 쉼`);
  if (bible.some((b) => b.year === Y)) tags.push(`${Y}년 성경필사`);
  if (education.some((e) => e.status === "수료")) tags.push("교육 수료");
  return {
    head: { name: s(person?.name), position: s(person?.position), gu: s(person?.mok1), mok: s(person?.mok3), kind: s(person?.kind2),
      age: ageOf(person?.age), gender: s(person?.gender), regYear, regYears: regYear ? Y - regYear + 1 : null, household_rel: s(person?.household_rel) },
    tags,
    family: (family ?? []).map((f) => ({ name: s(f?.name), rel: s(f?.household_rel), position: s(f?.position), age: ageOf(f?.age) })),
    service: { total: ys.length, first: ys.length ? Math.min(...ys) : null, last: ys.length ? Math.max(...ys) : null, thisYear, years },
    orders, bible, education,
  };
}

// AI 에 줄 사실 목록 — **이름 없음**(본인은 「이분」, 가족은 관계 · 직분 · 나이만). 팀 · 회차 · 강좌 이름은 사람 정보가 아니다.
export function visitFacts(c: VisitCard, today: string): string[] {
  const Y = Number(today.slice(0, 4));
  const h = c.head;
  const sv = c.service;
  const fam = c.family.map((f) => [f.rel || "가족", f.position, f.age !== null ? `${f.age}세` : ""].filter(Boolean).join(" "));
  return [
    `오늘: ${today}`,
    `이분: 직분 ${h.position || "없음"} · 성별 ${h.gender || "모름"} · 나이 ${h.age ?? "모름"} · 구분 ${h.kind || "모름"}` +
      (h.regYear ? ` · ${h.regYear}년 등록(${h.regYears}년째)` : ""),
    `가족(같은 가구): ${fam.length ? fam.join(" · ") : "명부에 없음"}`,
    sv.total
      ? `사역(임명 명단): 모두 ${sv.total}해 · ${sv.first}~${sv.last} · ${Y}년 ${sv.thisYear ? "섬기는 중" : "쉼"} · 해마다: ` +
        sv.years.slice(0, 12).map((x) => `${x.year} ${x.teams.join("·")}`).join(" / ")
      : "사역(임명 명단): 기록 없음",
    c.orders.length ? `사역신청: ${c.orders.map((o) => `${o.year} ${o.team}(${o.status})`).join(" / ")}` : "",
    `성경필사: ${c.bible.length ? c.bible.map((b) => `${b.year ?? ""} ${b.title}`.trim()).join(" / ") : "기록 없음"}`,
    `교육: ${c.education.length ? c.education.map((e) => `${e.term} ${e.title}(${e.status})`.trim()).join(" / ") : "기록 없음"}`,
  ].filter(Boolean);
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
