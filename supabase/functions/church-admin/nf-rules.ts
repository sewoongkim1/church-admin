// 새가족 — 순수 규칙(2026-10-07 · 설계 v2 성경암송 저장소 docs/superpowers/specs/2026-10-07-newfamily-design.md)
//   서버(nf-db.ts)와 시험(tests/nf-rules.test.mjs)이 같은 파일을 읽는다 — Deno 전용 API·원격 import 금지 · enum 금지.
//   ⚠️ 단계는 저장하지 않는다 — stageOf 한 곳이 사실(배정·교육 줄 수·목사님 교육·보고서·교구·수료번호)에서 읽는다(§3).
//   ⚠️ 응답 칸 지도(personOut·cardOut)에 member_id·auth_user_id·교인ID 를 싣지 않는다. 섬김이는 nf_helpers.id 와 이름으로만.
//   ⚠️ 새가족은 아직 교인이 아닌 분이다 — 하는 일(kind)마다 보는 칸이 다르다(§2-2). 칸을 더할 때 personOut 의 갈래를 꼭 지나게.
import { norm } from "./authz.ts";

export const NF_KINDS = ["greeter", "lead", "helper", "pastor"] as const;
export const NF_KIND_LABEL: Record<string, string> = { greeter: "영접팀", lead: "정착팀 총무", helper: "섬김이", pastor: "새가족 목사님" };
export const NF_SERVICES = ["1부", "2부", "3부", "찬양", "수요", "그 밖"] as const;
export const NF_BAPTIZED = ["yes", "no", "unknown"] as const;
export const NF_LESSONS = 4;          // 섬김이 교육 횟수(주가 아니라 횟수 · 친구 2026-10-07)
export const NF_QUIET_DAYS = 21;      // 「3주 넘게 소식 없는 분」
export const NF_PEOPLE_MAX = 8;       // 카드 한 장의 사람 수(본인 + 가족)
export const NF_GUIDES_MAX = 2;       // 인도자 — 종이 카드에 두 줄

export const NF_STAGES = ["info", "stopped", "done", "registered", "wait_parish", "wait_report", "wait_class", "learning", "wait_helper"] as const;
export const NF_STAGE_LABEL: Record<string, string> = {
  info: "정보만", stopped: "멈춤", done: "등록식 마침", registered: "등록 완료", wait_parish: "교구 배정 기다림",
  wait_report: "보고서 기다림", wait_class: "목사님 교육 기다림", learning: "교육 중", wait_helper: "배정 기다림",
};
// 다음 차례 — 화면이 「누가 할 일인지」를 보인다
export const NF_STAGE_TURN: Record<string, string> = {
  info: "", stopped: "chief", done: "", registered: "chief", wait_parish: "pastor",
  wait_report: "helper", wait_class: "pastor", learning: "helper", wait_helper: "lead",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// 이름·소속에 못 쓰는 글자(postgrest .in() 이 이스케이프하지 않는다 — CLAUDE.md 함정)
export const NF_BAD = /["\\,()|]/;
const LIMITS = { name: 20, relation: 10, address: 120, car_no: 20, note: 500, pastor: 20, mok: 20, content: 1000, lnote: 300, reason: 120, parish: 20 };

export const kstDate = (ms: number = Date.now()): string => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);

export function isDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// 전화 — 숫자만 남겨 붙임표로. 빈칸은 "" · 모양이 아니면 null
export function phoneOf(v: unknown): string | null {
  const d = (v ?? "").toString().replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 11 && d.startsWith("01")) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10 && d.startsWith("02")) return `02-${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && d.startsWith("02")) return `02-${d.slice(2, 5)}-${d.slice(5)}`;
  return null;
}

// ── 단계(§3) ─────────────────────────────────────────────────────────────
export type NfPerson = {
  target: boolean; helper_id?: string | null; pastor_class_on?: string | null; report_sent_at?: string | null;
  parish?: string | null; cert_no?: string | null; stopped_at?: string | null;
};
// lessons = 그분의 kind='lesson' 줄 수(extra 는 세지 않는다)
export function stageOf(p: NfPerson, lessons: number): string {
  if (!p.target) return "info";
  if (p.stopped_at) return "stopped";
  if (p.cert_no) return "done";
  if (p.parish) return "registered";
  if (p.report_sent_at) return "wait_parish";
  if (p.pastor_class_on) return "wait_report";
  if (p.helper_id && lessons >= NF_LESSONS) return "wait_class";
  if (p.helper_id) return "learning";
  return "wait_helper";
}

// 「3주 넘게 소식 없는 분」 — 교육 중인데 마지막 만남(없으면 배정한 날)이 21일보다 앞
export function isQuiet(stage: string, lastOn: string | null | undefined, today: string): boolean {
  if (stage !== "learning" || !lastOn || !isDate(lastOn.slice(0, 10)) || !isDate(today)) return false;
  const gap = (Date.parse(today + "T00:00:00Z") - Date.parse(lastOn.slice(0, 10) + "T00:00:00Z")) / 86400000;
  return gap > NF_QUIET_DAYS;
}

// ── 누가 무엇을(§2-2) ────────────────────────────────────────────────────
//   chief = 역할 newfamily(또는 super) · kinds = nf_staff 의 줄 · helperId = 이어진 nf_helpers.id(없으면 null)
export type NfView = { chief: boolean; kinds: string[]; helperId: string | null };
const has = (v: NfView, k: string) => v.kinds.includes(k);

export const canCardRead = (v: NfView) => v.chief || has(v, "greeter") || has(v, "lead") || has(v, "pastor");
export const canCardWrite = (v: NfView) => v.chief || has(v, "greeter");
export const canAssign = (v: NfView) => v.chief || has(v, "lead");
export const canPastor = (v: NfView) => v.chief || has(v, "pastor");
const isMine = (v: NfView, p: { helper_id?: string | null }) => has(v, "helper") && !!v.helperId && p.helper_id === v.helperId;
// 교육 줄의 내용·보고서 — 운영팀·목사님·그분의 섬김이만(영접팀·총무는 몇 번째인지만)
export const canLessonRead = (v: NfView, p: { helper_id?: string | null }) => v.chief || has(v, "pastor") || isMine(v, p);
export const canLessonWrite = (v: NfView, p: { helper_id?: string | null }) => v.chief || isMine(v, p);
// 명단 범위 — all: 모든 분 · mine: 내게 배정된 분만 · none: 볼 것이 없다
export function listScope(v: NfView): "all" | "mine" | "none" {
  if (canCardRead(v)) return "all";
  return has(v, "helper") && v.helperId ? "mine" : "none";
}
// 한 분을 볼 수 있나(mayTouch 의 순수 부분)
export const canSeePerson = (v: NfView, p: { helper_id?: string | null }) => canCardRead(v) || isMine(v, p);

// 하는 일 목록 검사 — 모르는 값·겹침을 뺀다(운영팀이 「함께 쓰는 분」에서 고른 것)
export function checkKinds(x: unknown): string[] | null {
  if (!Array.isArray(x)) return null;
  const out: string[] = [];
  for (const k of x) {
    const s = norm(k);
    if (!(NF_KINDS as readonly string[]).includes(s)) return null;
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

// ── 카드 입력(§4 · §6) ───────────────────────────────────────────────────
type Fail = { ok: false; error: string };
export type CardIn = {
  ok: true;
  card: Record<string, unknown>;
  people: Record<string, unknown>[];
  guides: Record<string, unknown>[];
};
const tooLong = (v: string, k: keyof typeof LIMITS) => v.length > LIMITS[k];

// 카드 한 장(카드 + 사람들 + 인도자) → DB 줄들. today = 한국 날짜(앞날 등록일·생일을 막는다).
//   꼭 있어야 하는 것: 등록일 · 본인 이름 · 사람마다 수료 대상 예/아니오 · 동의. 나머지는 「마저 채울 카드」(draft)로 남길 수 있다.
export function checkCard(x: any, today: string): CardIn | Fail {
  const o = x && typeof x === "object" ? x : {};
  if (o.consent !== true) return { ok: false, error: "no-consent" };
  const reg = norm(o.reg_date);
  if (!isDate(reg) || reg > today) return { ok: false, error: "bad-date" };
  const service = norm(o.service);
  if (service && !(NF_SERVICES as readonly string[]).includes(service)) return { ok: false, error: "bad-service" };
  const address = norm(o.address), car = norm(o.car_no), pastor = norm(o.pastor);
  const note = (o.note ?? "").toString().normalize("NFC").trim();   // 비고는 줄바꿈을 살린다
  if (tooLong(address, "address") || tooLong(car, "car_no") || tooLong(pastor, "pastor") || tooLong(note, "note")) return { ok: false, error: "too-long" };

  const rawPeople = Array.isArray(o.people) ? o.people : [];
  if (!rawPeople.length) return { ok: false, error: "no-name" };
  if (rawPeople.length > NF_PEOPLE_MAX) return { ok: false, error: "too-many" };
  const people: Record<string, unknown>[] = [];
  for (let i = 0; i < rawPeople.length; i++) {
    const r = rawPeople[i] && typeof rawPeople[i] === "object" ? rawPeople[i] : {};
    const name = norm(r.name);
    if (!name) return { ok: false, error: "no-name" };
    if (NF_BAD.test(name)) return { ok: false, error: "bad-name" };
    const relation = i === 0 ? "본인" : norm(r.relation);
    if (tooLong(name, "name") || tooLong(relation, "relation")) return { ok: false, error: "too-long" };
    const gender = norm(r.gender);
    if (gender && gender !== "남" && gender !== "여") return { ok: false, error: "bad-gender" };
    const birth = norm(r.birth);
    if (birth && (!isDate(birth) || birth > today)) return { ok: false, error: "bad-birth" };
    const phone = phoneOf(r.phone), tel = phoneOf(r.tel);
    if (phone === null || tel === null) return { ok: false, error: "bad-phone" };
    const baptized = norm(r.baptized) || "unknown";
    if (!(NF_BAPTIZED as readonly string[]).includes(baptized)) return { ok: false, error: "bad-baptized" };
    if (typeof r.target !== "boolean") return { ok: false, error: "no-target" };   // 예/아니오를 골라야 저장된다
    const id = norm(r.id);
    people.push({
      ...(id ? { id } : {}), relation, name, gender, birth: birth || null, birth_lunar: birth ? r.birth_lunar === true : false,
      phone, tel, baptized, target: r.target,
    });
  }

  const selfCome = o.self_come === true;
  const rawGuides = Array.isArray(o.guides) ? o.guides.filter((g: any) => g && norm(g.name)) : [];
  if (selfCome && rawGuides.length) return { ok: false, error: "self-and-guide" };
  if (rawGuides.length > NF_GUIDES_MAX) return { ok: false, error: "too-many" };
  const guides: Record<string, unknown>[] = [];
  for (let i = 0; i < rawGuides.length; i++) {
    const g = rawGuides[i];
    const name = norm(g.name), mok = norm(g.mok);
    if (NF_BAD.test(name) || NF_BAD.test(mok)) return { ok: false, error: "bad-name" };
    if (tooLong(name, "name") || tooLong(mok, "mok")) return { ok: false, error: "too-long" };
    const phone = phoneOf(g.phone);
    if (phone === null) return { ok: false, error: "bad-phone" };
    // pick = 교인명부에서 고른 분의 표시(서버가 교인ID 로 바꾼다 — 화면은 교인ID 를 모른다). 손으로 적은 분은 없음.
    guides.push({ seq: i + 1, name, mok, phone, pick: norm(g.pick) || null });
  }

  return {
    ok: true,
    card: { reg_date: reg, service, pastor, address, car_no: car, note, consent: true, self_come: selfCome, draft: o.draft === true },
    people, guides,
  };
}

// 같은 분이 또 들어오는지 — 이름 + 전화 뒷자리 4(전화가 없으면 이름만으로는 묻지 않는다)
export function dupKey(name: unknown, phone: unknown): string {
  const d = (phone ?? "").toString().replace(/\D/g, "");
  const n = norm(name).replace(/\s+/g, "");
  return n && d.length >= 4 ? `${n}|${d.slice(-4)}` : "";
}

// ── 교육 줄(§3) ──────────────────────────────────────────────────────────
// 줄 하나 → DB 줄. 앞날은 안 된다. 내용은 비어도 된다(「오늘 만났어요」만 누르고 나중에 적는 분).
export function checkLesson(x: any, today: string): { ok: true; row: { met_on: string; content: string; note: string } } | Fail {
  const o = x && typeof x === "object" ? x : {};
  const on = norm(o.met_on) || today;
  if (!isDate(on) || on > today) return { ok: false, error: "bad-date" };
  const content = (o.content ?? "").toString().normalize("NFC").trim();
  const note = norm(o.note);
  if (tooLong(content, "content") || tooLong(note, "lnote")) return { ok: false, error: "too-long" };
  return { ok: true, row: { met_on: on, content, note } };
}
// 새 줄의 종류 — 네 번까지는 교육(lesson), 그 뒤는 덧붙인 줄(extra · 횟수에 안 든다)
export const lessonKindFor = (lessons: number): "lesson" | "extra" => (lessons < NF_LESSONS ? "lesson" : "extra");
// 줄을 적거나 고칠 수 있나 — 섬김이가 배정돼 있어야 하고, 보고서를 보낸 뒤에는 잠긴다(운영팀은 예외 없음 — 목사님이 돌려보내야 풀린다)
export function lessonGate(p: NfPerson): string | null {
  if (!p.target) return "not-target";
  if (!p.helper_id) return "no-helper";
  if (p.report_sent_at) return "sent";
  return null;
}
// 목사님 교육 참석 표시 — 교육 네 번이 찬 분만 · 보고서를 보낸 뒤에는 풀 수 없다
export function classGate(p: NfPerson, lessons: number, on: boolean): string | null {
  if (!p.target) return "not-target";
  if (on) return lessons >= NF_LESSONS && p.helper_id ? null : "not-ready";
  return p.report_sent_at ? "sent" : null;
}
// 보고서 보내기 — 목사님 교육을 마친 분만
export function reportGate(p: NfPerson): string | null {
  if (!p.pastor_class_on) return "not-ready";
  return p.report_sent_at ? "sent" : null;
}
// 교구 배정 — 보고서가 온 분만 · 수료번호를 드린 뒤에는 못 바꾼다
export function parishGate(p: NfPerson): string | null {
  if (p.cert_no) return "confirmed";
  return p.report_sent_at ? null : "not-ready";
}

// ── 등록식(§4) ───────────────────────────────────────────────────────────
export const certNo = (year: number, n: number): string => `${String(year % 100).padStart(2, "0")}-${String(n).padStart(3, "0")}`;

// ── 응답 칸 지도 ─────────────────────────────────────────────────────────
// 나이대 — 섬김이 화면처럼 생일을 싣지 않는 곳에 쓴다
export function ageBand(birth: string | null | undefined, today: string): string {
  if (!birth || !isDate(birth)) return "";
  const age = Number(today.slice(0, 4)) - Number(birth.slice(0, 4));
  if (age < 0) return "";
  if (age < 8) return "미취학";
  if (age < 20) return "10대 이하";
  return age >= 80 ? "80대 이상" : `${Math.floor(age / 10) * 10}대`;
}

// 한 분 — view 에 따라 칸이 다르다. extra = { lessons(수), lastOn, helperName, guides([{name,mok}]), card }
export function personOut(p: any, v: NfView, extra: any, today: string): Record<string, unknown> {
  const lessons = Number(extra?.lessons || 0);
  const stage = stageOf(p, lessons);
  const base: Record<string, unknown> = {
    id: p.id, cardId: p.card_id, relation: p.relation, name: p.name, target: p.target === true,
    stage, stageLabel: NF_STAGE_LABEL[stage], turn: NF_STAGE_TURN[stage], lessons,
    quiet: isQuiet(stage, extra?.lastOn || p.assigned_at, today),
    helperId: p.helper_id || null, helperName: extra?.helperName || "",
    guides: (extra?.guides || []).map((g: any) => ({ name: g.name, mok: g.mok || "" })),
    regDate: extra?.card?.reg_date || null,
  };
  if (!canCardRead(v)) {
    // 섬김이 — 이름·전화·인도자·몇 번째인지만(주소·차량·생일·가족·사진 없음)
    return { ...base, phone: p.phone || "", gender: p.gender || "", ageBand: ageBand(p.birth, today) };
  }
  return {
    ...base, gender: p.gender || "", birth: p.birth || null, birthLunar: p.birth_lunar === true, ageBand: ageBand(p.birth, today),
    phone: p.phone || "", tel: p.tel || "", baptized: p.baptized || "unknown",
    service: extra?.card?.service || "", address: extra?.card?.address || "",
    pastorClassOn: p.pastor_class_on || null, reportSentAt: p.report_sent_at || null,
    parish: p.parish || "", parishAt: p.parish_at || null, certNo: p.cert_no || "",
    stoppedAt: p.stopped_at || null, stopReason: p.stop_reason || "", waitNote: p.wait_note || "",
    updatedAt: p.updated_at || null,
  };
}

// 교육 줄 — 내용은 canLessonRead 인 분에게만(서버가 부르기 전에 본다). written = 쓴 섬김이 이름
export const lessonOut = (l: any, written: string): Record<string, unknown> => ({
  id: l.id, kind: l.kind, metOn: l.met_on, content: l.content || "", note: l.note || "", writtenBy: written || "", updatedAt: l.updated_at || null,
});

// ── 통계(§1 「세는 기준 날짜를 고른다」 · 친구 2026-10-07 — 보는 기준이 그때그때 다르다) ───────────────
// 기준 셋: card = 카드를 쓴 날 · parish = 교구가 배정된 날 · ceremony = 등록식 날.
//   「오신 분」·「수료 대상」은 늘 카드를 쓴 날로 센다. 「등록」만 기준을 따른다:
//     card     → 교구 배정까지 끝난 분을 **카드를 쓴 날**에(그해 오신 분 가운데 몇 분이 등록까지 가셨나)
//     parish   → 교구 배정까지 끝난 분을 **교구가 배정된 날**에(그해에 등록 절차를 마친 분)
//     ceremony → 수료번호를 받은 분을 **등록식 날**에
//   12월에 카드를 쓰고 이듬해 1월에 교구가 배정된 분은 card 로는 앞의 해, parish 로는 뒤의 해에 들어간다.
// ⚠️ 응답은 숫자와 교구·섬김이 이름뿐이다 — 새가족의 이름·전화·번호를 싣지 않는다.
export const NF_BASES = ["card", "parish", "ceremony"] as const;
export const NF_BASIS_LABEL: Record<string, string> = { card: "카드를 쓴 날", parish: "교구가 배정된 날", ceremony: "등록식 날" };
// timestamptz → 한국 날짜
export const kstDay = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const t = Date.parse(iso);
  return isNaN(t) ? "" : kstDate(t);
};
// 「믿음-35」 → 「믿음」(교구) · 붙임표가 없으면 그대로
export const parishGroup = (s: string | null | undefined): string => norm(s).split("-")[0] || "";

type StatIn = {
  people: any[];                       // nf_people 줄
  cards: Map<string, any>;             // id → { reg_date, self_come }
  guides: Map<string, any[]>;          // card_id → [{ mok }]
  ceremonies: Map<string, string>;     // id → held_on
  lessons: Map<string, number>;        // person_id → 교육 줄 수
  helpers: Map<string, string>;        // helper id → 이름
};
export function buildStats(d: StatIn, basis: string, year: number) {
  const b = (NF_BASES as readonly string[]).includes(basis) ? basis : "card";
  const months = new Map<string, { came: number; target: number; done: number }>();
  const cell = (ym: string) => {
    let c = months.get(ym);
    if (!c) months.set(ym, c = { came: 0, target: 0, done: 0 });
    return c;
  };
  const stages: Record<string, number> = {};
  const stopAt = [0, 0, 0, 0, 0];
  const byParish = new Map<string, number>(), byGuide = new Map<string, number>();
  const helper = new Map<string, { assigned: number; done: number }>();
  const y = String(year);
  for (const p of d.people) {
    const card = d.cards.get(String(p.card_id));
    const reg = String(card?.reg_date || "");
    const n = d.lessons.get(String(p.id)) ?? 0;
    const st = stageOf(p, n);
    stages[st] = (stages[st] ?? 0) + 1;
    if (st === "stopped") stopAt[Math.min(n, NF_LESSONS)]++;
    if (reg) {
      const c = cell(reg.slice(0, 7));
      c.came++;
      if (p.target) c.target++;
    }
    // 「등록」을 세는 날 — 기준에 따라
    const doneOn = b === "ceremony" ? (p.cert_no ? String(d.ceremonies.get(String(p.ceremony_id)) || "") : "")
      : p.parish ? (b === "parish" ? kstDay(p.parish_at) : reg) : "";
    if (doneOn) {
      cell(doneOn.slice(0, 7)).done++;
      if (doneOn.startsWith(y)) { const g = parishGroup(p.parish) || "모름"; byParish.set(g, (byParish.get(g) ?? 0) + 1); }
    }
    // 전도 교구 — 그해에 오신 수료 대상을 인도자의 목장(교구)으로. 인도자가 둘이면 반씩.
    if (p.target && reg.startsWith(y)) {
      const gs = (d.guides.get(String(p.card_id)) ?? []).map((g) => parishGroup(g.mok) || "모름");
      const keys = card?.self_come || !gs.length ? ["스스로"] : gs;
      for (const k of keys) byGuide.set(k, (byGuide.get(k) ?? 0) + 1 / keys.length);
    }
    if (p.helper_id && p.target) {
      const k = String(p.helper_id), h = helper.get(k) ?? { assigned: 0, done: 0 };
      h.assigned++;
      if (p.parish) h.done++;
      helper.set(k, h);
    }
  }
  const ms = [...months.entries()].map(([ym, c]) => ({ ym, ...c })).sort((a, b2) => (a.ym < b2.ym ? -1 : 1));
  const years = new Map<string, { came: number; target: number; done: number }>();
  for (const m of ms) {
    const k = m.ym.slice(0, 4), c = years.get(k) ?? { came: 0, target: 0, done: 0 };
    c.came += m.came; c.target += m.target; c.done += m.done;
    years.set(k, c);
  }
  const list = (m: Map<string, number>) => [...m.entries()].map(([name, n]) => ({ name, n: Math.round(n * 10) / 10 }))
    .sort((a, b2) => b2.n - a.n || a.name.localeCompare(b2.name, "ko"));
  return {
    basis: b, basisLabel: NF_BASIS_LABEL[b], year,
    years: [...years.entries()].map(([yy, c]) => ({ year: Number(yy), ...c })).sort((a, b2) => a.year - b2.year),
    months: ms.filter((m) => m.ym.startsWith(y)),
    stages, stopAt,
    byParish: list(byParish), byGuide: list(byGuide),
    helpers: [...helper.entries()].map(([id, h]) => ({ name: d.helpers.get(id) ?? "", ...h }))
      .sort((a, b2) => b2.assigned - a.assigned || a.name.localeCompare(b2.name, "ko")),
  };
}
