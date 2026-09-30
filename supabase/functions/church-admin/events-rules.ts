// 성경필사(암송) — 회차 검사 · 공개 판정 · 자격 회차 판정 · 명단 줄 다듬기 · 줄 모양 판정표 · 신원 키(순수 함수 · 2026-09-29)
//   설계: 성경암송 저장소 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §1·§2·§3
//   옛 동작 원문: docs/port/event-roster-legacy.md — 성경암송 api/index.ts 의 EVT_ID_RE·EVT_STATUS·
//   evtListable·evtRule(첫 잣대)·evtImportPosition·identityKey·eventSave 검사를 옮겼다.
//   서버(Deno, index.ts)와 시험(Node, tests/events-rules.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum·namespace·parameter property 금지).
//
// ⚠️ 신원 키(ident_key)는 paper.ts 의 appIdentityKey 로만 만든다 — **완성형(NFC)으로 바꾸지 않는다.**
//    authz.ts 의 identityKey(NFC)를 쓰면 맥에서 가입한 분(자모분리 이름)의 앱 계정과 영영 안 맞는다.
import { appIdentityKey, legacyNorm } from "./paper.ts";

// 회차 id — 성도님 앱 주소(?ev=)에 그대로 쓰인다. 성경암송 api EVT_ID_RE 와 글자 그대로 같다.
export const EVT_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const EVT_STATUS = ["draft", "open", "closed", "archived"];
// 성경암송 앱 GU_LIST 와 같은 차례(people-match.ts MATCH_GU 와도 같다 — 시험이 둘을 맞대 본다)
export const BE_GU = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
export const BE_MAX_UPLOAD = 600;   // 올리기 한 번 상한(회차당 최대가 515줄)
export const BE_NOTE_MAX = 500;     // 담당자 메모(note) — 성경암송 eventSetNote 의 slice(500) 와 같은 길이
export const BE_FIELD_MAX = 40;     // 이름·소속·세부·직분 한 칸(authz.parseIdentity 의 40자와 같다)
// 새 회차의 needs — 앱 등록 폼에 직분 칸이 생기게. 서버는 이것을 **복사해서** 넣는다(설계 §2 evEventCreate).
export const BE_NEEDS_DEFAULT = { position: true, phone: false, memo: false, extra: [] as unknown[] };
// 이름·소속에 받지 않는 글자 — 「|」는 신원 키 구분자, 나머지는 postgrest .in() 이 이스케이프하지 않는다.
export const BE_BAD_CHARS = /["\\,()|]/;

export type EvRow = { who_type: "교구" | "교회학교"; group_name: string; sub_name: string; name: string; position: string };
export type EvEvent = { id: string; title: string; short_title: string; subtitle: string; season: string;
  opens_on: string; closes_on: string; status: string; list_until: string | null; sort_order: string };
export type RawCells = { name: string; gu: string; mok: string; pos: string };

// 한국 날짜(YYYY-MM-DD). new Date().toISOString() 은 UTC 라 자정~오전 9시에 하루가 어긋난다.
export function kstToday(now?: Date): string {
  const t = (now ?? new Date()).getTime();
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 지금 성도님께 **보이는** 회차인가 — 성경암송 api evtListable 을 글자 그대로.
// ⚠️ 「등록을 받는가」와 다른 물음이다. 마감(closed)해도 명단은 보이고, list_until 이 있으면 그날까지만.
export function evtListable(ev: { status: string; list_until: string | null }, today: string): boolean {
  if (ev.status !== "open" && ev.status !== "closed") return false;
  const until = legacyNorm(ev.list_until);
  return !until || today <= until;
}

// 「2026-10-11」 꼴이면서 달력에 있는 날(2026-02-30 은 아니다). DB 의 date 칸이 500 을 내지 않게 여기서 거른다.
export function isDay(s: unknown): boolean {
  const t = String(s ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(t + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

// ── 자격 회차(가을 말씀 동행처럼 needs.eligibility 가 있는 회차) — **이 두 함수만** 쓴다(CONTRACT §5) ──
// hasEligibility(evOut · Task 5) · before-eligibility(evEventSave · Task 6) · eligibility-event(Task 7·8)가
// 모두 이 둘을 부른다. 서버·화면이 「자격 회차인가」를 세 가지로 다르게 판정하던 것을 한 곳으로 모았다.
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

// needs 가 객체이고 needs.eligibility 가 null 아닌 객체면 자격 회차다.
// ⚠️ 모양(start·weeks·perWeek·need)은 따지지 않는다 — 성경암송 evtRule 은 모양이 틀리면 「자격 회차 아님」으로 보지만,
//    여기서는 **막는 쪽으로** 틀린다(더하기·올리기·빼기를 막고 메모만 고치게 둔다).
export function isEligEvent(needs: unknown): boolean {
  return isObj(needs) && isObj(needs.eligibility);
}

// 자격 회차의 측정 시작일 — needs.eligibility.start 가 달력에 있는 YYYY-MM-DD 일 때만, 아니면 null.
// checkEvent 의 둘째 인자로 그대로 넘긴다(before-eligibility).
export function eligibilityStart(needs: unknown): string | null {
  if (!isEligEvent(needs)) return null;
  const s = legacyNorm((needs as { eligibility: Record<string, unknown> }).eligibility.start);
  return isDay(s) ? s : null;
}

// 회차 설정 검사 — 만들기(evEventCreate)·저장(evEventSave)이 **같은 함수**를 쓴다(DB CHECK 에 걸려 500 이 나지 않게).
// eligibilityStart = 자격 회차의 측정 시작일(위 eligibilityStart(ev.needs)) · 자격 회차가 아니면 null.
// 오류 코드 차례: no-title · bad-period · period-reversed · bad-status · bad-list-until · list-until-before-close · before-eligibility
export function checkEvent(ev: EvEvent, eligibilityStart: string | null): string | null {
  if (!legacyNorm(ev.title)) return "no-title";
  const opens = legacyNorm(ev.opens_on), closes = legacyNorm(ev.closes_on);
  if (!isDay(opens) || !isDay(closes)) return "bad-period";
  if (closes < opens) return "period-reversed";
  if (!EVT_STATUS.includes(legacyNorm(ev.status))) return "bad-status";
  const until = legacyNorm(ev.list_until);
  if (until) {
    if (!isDay(until)) return "bad-list-until";
    if (until < closes) return "list-until-before-close";   // 마감 전에 명단이 사라지면 앞뒤가 안 맞는다
  }
  if (eligibilityStart && opens < eligibilityStart) return "before-eligibility";
  return null;
}

// 회차 설정에서 담당자가 바꿀 수 있는 칸 — needs·copy·kind·id 는 받지 않는다 · sort_order 는 2026-09-30 부터 받는다(정수 글자 · DB 에 쓸 때 eventDbPatch 가 수로)
// (자격 규칙·문구가 조용히 지워지지 않게 · 성경암송 eventSave 가 겪은 「화면에 없는 칸이 기본값으로」 사고).
// ⚠️ 이 파일 끝의 EV_EDIT_KEYS 와 **같은 아홉 칸**이어야 한다(시험이 두 방향으로 맞대 본다).
const EVT_EDITABLE = ["title", "short_title", "subtitle", "season", "opens_on", "closes_on", "status", "list_until", "sort_order"];

// **보낸 칸만** 바꾼다(hasOwnProperty) · 글자는 앞뒤 빈칸을 떼고 가운데 빈칸을 하나로 · list_until 빈칸 = null(기한 없음).
// sort_order — 빈칸은 "0" · 정수 꼴이면 앞자리 0·「-0」을 다듬은 글자 · 그 밖(「+5」·「1.5」·「abc」)은 그대로 두어 checkEventEdit 가 막는다.
export function mergeEventPatch(cur: EvEvent, patch: Record<string, unknown>): EvEvent {
  const out: EvEvent = { ...cur };
  const p = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  for (const k of EVT_EDITABLE) {
    if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
    const v = legacyNorm(p[k]);
    if (k === "sort_order") { out.sort_order = v === "" ? "0" : /^-?\d+$/.test(v) ? String(parseInt(v, 10)) : v; continue; }
    if (k === "list_until") out.list_until = v || null;
    else (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// ============================================================================
// 명단 줄 다듬기 · 줄 모양 판정표(설계 §1 「줄 모양 검사」 · §3 「읽을 때 다듬는 것」)
// ============================================================================

// 소속 칸(교구·목장·부서) — 완성형(NFC)으로, 앞뒤 빈칸 없이, 가운데 빈칸은 하나로.
// ⚠️ 이름에는 쓰지 않는다 — 이름은 앱 로그인이 적은 글자 그대로 둬야 신원 키가 맞는다.
const aff = (s: unknown): string => legacyNorm(String(s ?? "").normalize("NFC"));

// 직분 다듬기 — 성경암송 api evtImportPosition: 괄호 속 떼기 · 끝 「님」 떼기.
// 원문은 「님」을 뗀 뒤 다시 다듬지 않아 「집사 님」이 「집사 」(끝 빈칸)가 됐다 — 여기서는 마지막에 한 번 더 다듬는다.
// ⚠️ 앱 직분 목록(MIN_POSITIONS · 9개)으로 **막지 않는다** — 명예권사·은퇴장로 같은 값이 수백 줄 있다(목록 밖은 경고만).
// 직분은 완성형(NFC)으로 — 신원 키(appIdentityKey)에 들어가지 않아 계정 매칭에 해가 없다 · 이름은 여전히 NFC 금지(최종 검토 M1)
export function cleanPosition(v: unknown): string {
  const s = legacyNorm(String(v ?? "").normalize("NFC"));
  return legacyNorm(legacyNorm(s.replace(/\(.*?\)/g, "")).replace(/님$/, ""));
}

// 목장 칸 — 「20목장」→20 · 「07」→7(앞자리 0) · 「남성목장」→남성. 그 밖의 글자는 그대로 두어 checkRow 가 bad-sub 로 잡는다.
// ⚠️ Number() 로 바꾸지 않는다(긴 숫자가 반올림된다) — 앞의 0 만 뗀다.
function tidyMok(s: string): string {
  const t = s.replace(/\s+/g, "");
  if (/^남성(목장)?$/.test(t)) return "남성";
  const m = /^(\d+)(목장)?$/.exec(t);
  return m ? m[1].replace(/^0+(?=\d)/, "") : s;
}

// 부서 줄임말에 「부」 붙이기 — 「유년」→유년부 · 「소년2」→소년2부 · 「청년」→청년부.
// ⚠️ 교구·목장 칸에만 쓴다. 직분 칸의 「청년」을 「청년부」로 바꾸면 부서로 오인된다(2026-09-29 한 번 그럴 뻔했다).
const DEPT_SHORT = /^(사랑|영아|유아|유치|유년|초등|소년|중등|고등|청년)(\d*)$/;
const withBu = (s: string): string => (DEPT_SHORT.test(s) ? s + "부" : s);

// 구분이 정해진 줄 하나를 다듬는다 — 올리기(tidyRaw)가 쓴다. 필요하면 다른 과제도 쓸 수 있게 내보낸다
// (한 분 더하기·고치기 창의 다듬기는 Task 7 events-rows.ts 의 formRow/rowPatch 가 따로 한다).
// 이름 끝 숫자는 떼지 않는다(창에 적은 이름은 담당자가 정한 것이다 — 올리기만 뗀다).
export function tidyRow(r: { who_type?: unknown; group_name?: unknown; sub_name?: unknown; name?: unknown; position?: unknown }): EvRow {
  const who = legacyNorm(r?.who_type);
  let group = aff(r?.group_name), sub = aff(r?.sub_name);
  if (who === "교구") {
    group = group.replace(/\s*교구$/, "");      // 「화평교구」→화평
    sub = tidyMok(sub);
  } else if (who === "교회학교") {
    group = withBu(group);
  }
  return { who_type: who as EvRow["who_type"], group_name: group, sub_name: sub, name: legacyNorm(r?.name), position: cleanPosition(r?.position) };
}

// 줄 모양 판정표 — 첫 번째로 걸린 코드 하나. 다듬은 **뒤의** 줄을 받는다.
//   이름 1~40자 · 「" \ , ( ) |」 없음 → no-name · bad-char · too-long
//   구분 교구/교회학교 → bad-type
//   소속이 비었으면 → no-group (구분과 상관없이 · 올리기 화면은 이것을 「빈칸(소속 없음)」으로 센다)
//   교구 줄: 8교구 중 하나 → bad-group · 목장은 숫자(앞자리 0 없이)·「남성」·빈칸 → bad-sub
//   교회학교 줄: 부서·학년 40자 이하 · 금지 글자 없음 → too-long · bad-char
//   직분 40자 이하 → too-long (목록 밖이어도 통과 — 경고는 부르는 쪽이)
export function checkRow(row: EvRow): string | null {
  const name = String(row?.name ?? "");
  if (!name.trim()) return "no-name";
  if (BE_BAD_CHARS.test(name)) return "bad-char";
  if (name.length > BE_FIELD_MAX) return "too-long";
  const who = String(row?.who_type ?? "");
  if (who !== "교구" && who !== "교회학교") return "bad-type";
  const group = String(row?.group_name ?? ""), sub = String(row?.sub_name ?? "");
  if (!group.trim()) return "no-group";
  if (who === "교구") {
    if (!BE_GU.includes(group)) return "bad-group";
    if (sub !== "" && sub !== "남성" && !/^(0|[1-9]\d{0,2})$/.test(sub)) return "bad-sub";
  } else {
    if (BE_BAD_CHARS.test(group) || BE_BAD_CHARS.test(sub)) return "bad-char";
    if (group.length > BE_FIELD_MAX || sub.length > BE_FIELD_MAX) return "too-long";
  }
  if (String(row?.position ?? "").length > BE_FIELD_MAX) return "too-long";
  return null;
}

// 담당자 메모 길이 — ⚠️ 서버는 붙임말(「담당자가 더함 / 」·「명단 올리기」 등)을 **붙인 뒤의** 글을 넣기 직전에 이것으로 본다.
// 창(Task 10)의 글자 수 상한은 480 — 「담당자가 더함 / 」(10자)을 붙여도 500 을 넘지 않게(CONTRACT §5).
export function checkNote(note: unknown): string | null {
  return String(note ?? "").length > BE_NOTE_MAX ? "note-too-long" : null;
}

// 올리기 한 줄(이름·교구·목장·직분 네 칸)을 이벤트 줄로 — 2026-09-29 손 작업에서 나온 규칙(설계 §3).
//   · 교구 칸: 「화평교구」→화평 · 「청년/청년부」→교회학교 청년부(목장 칸 「청년」은 버림) ·
//     「교회학교」+목장 칸 부서→교회학교 그 부서 · 「유년」 같은 부서 줄임말→교회학교 유년부
//   · 목장 칸: 「20목장」→20 · 「07」→7 · 「남성목장」→남성
//   · 이름 끝 숫자(「홍길동2」 — 옛 시트의 동명이인 표시)는 떼고 알린다. 숫자 앞이 한글일 때만(「ca-test-3」은 그대로).
//   · 제목 줄(「성명」)은 화면(upload-logic.js parseSheet)이 거른다 — 여기 오면 그냥 한 줄로 판정한다.
// 돌려주는 것: row = 다듬은 줄(네 칸이 다 비었을 때만 null) · notes = 알릴 말 · error = checkRow(row)
// ⚠️ 교구 칸이 비면 구분은 「교구」로 두고 error 가 no-group 이다 — 「교구」는 기본값일 뿐이다(Task 8 이 빈칸 줄의 구분을 비워 채우기에 넘긴다).
export function tidyRaw(raw: RawCells): { row: EvRow | null; notes: string[]; error: string | null } {
  const notes: string[] = [];
  let name = legacyNorm(raw?.name);
  const gu = aff(raw?.gu), mok = aff(raw?.mok), pos = legacyNorm(raw?.pos);
  if (!name && !gu && !mok && !pos) return { row: null, notes, error: "no-name" };

  const tail = /^(.*[가-힣ᄀ-ᇿ])\s*\d+$/.exec(name);
  if (tail) {
    notes.push(`이름 끝 숫자를 뗐어요 (${name} → ${tail[1]})`);
    name = tail[1];
  }

  const bu = (s: string): string => {
    const b = withBu(s);
    if (b !== s) notes.push(`「${s}」 → 「${b}」로 읽었어요`);   // 조사(을/를)를 쓰지 않는다 — 받침에 따라 틀린다
    return b;
  };

  let who = "교구", group = "", sub = mok;
  const g = gu.replace(/\s*교구$/, "");
  if (!gu || BE_GU.includes(g)) {
    group = g;                                         // 교구 줄(교구 칸이 비면 소속 없음 → no-group)
  } else if (gu === "교회학교") {
    who = "교회학교"; group = bu(mok); sub = "";        // 목장 칸이 부서
  } else {
    const b = bu(gu);
    if (/부$/.test(b)) {
      who = "교회학교"; group = b;                       // 교구 칸에 부서(청년부·유년부…)
      if (b === "청년부" && (mok === "청년" || mok === "청년부")) {
        notes.push(`목장 칸 「${mok}」 — 청년부에는 목장이 없어 뺐어요`);
        sub = "";
      }
    } else {
      group = g;                                       // 모르는 교구 이름 → bad-group
    }
  }

  const row = tidyRow({ who_type: who, group_name: group, sub_name: sub, name, position: pos });
  return { row, notes, error: checkRow(row) };
}

// ============================================================================
// 신원 키 · 같은 분 판정의 후보 키(설계 §1 「같은 분 판정과 앱 계정 잇기」 1번)
// ============================================================================

// 정본 키 — 성경암송 eventImport 가 만드는 모양 그대로(교구: gu·mok / 교회학교: bu·grade).
// event_signups.ident_key 에 넣는 값이다. NFC 를 하지 않는다(맨 위 ⚠️).
export function identKey(row: EvRow): string {
  const isGu = row.who_type === "교구";
  return appIdentityKey({
    type: row.who_type,
    gu: isGu ? row.group_name : "", mok: isGu ? row.sub_name : "",
    bu: isGu ? "" : row.group_name, grade: isGu ? "" : row.sub_name,
    name: row.name,
  });
}

// 같은 분일 수 있는 키 모두 — (목장: 원문 · 앞자리 0 뗀 꼴 · 「N목장」 · 한 자리면 「0N」·「0N목장」) × (이름: 원문 · NFC · NFD).
//   앱 로그인은 「07」도 받고(app.js MOK_RE /^(\d+|남성)$/) 앱에서 낸 줄의 sub_name 은 users 값 그대로라,
//   담당자 줄을 「7」로 다듬으면 「07」 계정·줄과 어긋난다 — 그래서 한 자리 목장은 「0N」도 만든다(계약의 세 꼴보다 넓다).
//   이름은 맥에서 가입한 분(자모분리 NFD)과 윈도 엑셀(완성형 NFC)이 서로를 찾게 두 꼴을 다 만든다.
// 첫 값은 늘 identKey(row)(정본). 겹치는 키는 한 번만.
export function candidateKeys(row: EvRow): string[] {
  const s = legacyNorm(row.sub_name);
  const subs = [s];
  if (row.who_type === "교구") {
    const m = /^(\d+)(목장)?$/.exec(s.replace(/\s+/g, ""));
    if (m) {
      const n = m[1].replace(/^0+(?=\d)/, "");
      subs.push(n, n + "목장");
      if (n.length === 1) subs.push("0" + n, "0" + n + "목장");
    }
  }
  const nm = legacyNorm(row.name);
  const names = [nm, nm.normalize("NFC"), nm.normalize("NFD")];
  const out = new Set<string>([identKey(row)]);
  for (const sb of subs) for (const n of names) out.add(identKey({ ...row, sub_name: sb, name: n }));
  return [...out];
}

// ---------- 회차 만들기·설정(Task 6) — 서버 evEventCreate·evEventSave 가 쓴다 ----------
// 담당자가 회차 설정에서 바꿀 수 있는 칸. needs·copy·kind·id 는 받지 않는다 · sort_order 는 2026-09-30 부터 받는다(정수 글자 · DB 에 쓸 때 eventDbPatch 가 수로) —
// 가을 말씀 동행의 자격 규칙(needs.eligibility)·문구(copy)가 저장 한 번에 조용히 지워지지 않게(설계 §2).
// sort_order = 성도님 앱 eventOpenList 의 셋째 잣대(① 등록할 수 있고 안 낸 것 ② 마감일 ③ 차례 ④ id) — 마감일이 같은 회차끼리만 앞뒤를 가른다.
// ⚠️ mergeEventPatch 안의 EVT_EDITABLE 과 **같은 아홉 칸**이어야 한다(시험이 맞대 본다).
export const EV_EDIT_KEYS = ["title", "short_title", "subtitle", "season", "opens_on", "closes_on", "status", "list_until", "sort_order"];
// 새 회차에 받는 칸 — status 도 없다(새 회차는 draft 로만 · 공개는 만든 뒤 설정에서 공개 확인을 거쳐).
export const EV_CREATE_KEYS = EV_EDIT_KEYS.filter((k) => k !== "status");

// 화면이 보낸 것에서 keys 에 든 칸만, **보낸 칸만**(hasOwnProperty — 물려받은 이름은 안 본다) 꺼낸다.
// 값은 글자로: 글자는 그대로(다듬기는 mergeEventPatch 가) · 유한한 숫자는 글자로 · 나머지(null·undefined·참거짓·객체)는 "".
// (mergeEventPatch 에 객체가 그대로 가면 「[object Object]」 라는 제목이 검사를 통과한다.)
export function pickEventPatch(src: unknown, keys: string[]): Record<string, string> {
  const o = src && typeof src === "object" && !Array.isArray(src) ? (src as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
    const v = o[k];
    out[k] = typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  }
  return out;
}

// events 표의 한 줄 → 규칙이 보는 열 칸(EvEvent · id + 고칠 수 있는 아홉 칸). 날짜는 PostgREST 가 "YYYY-MM-DD" 글자로 준다.
// sort_order 는 글자로(없음·null·빈 것은 DB 기본값 "0") — ⚠️ 부르는 쪽이 sort_order 칸을 읽어 와야 한다(index.ts EV_COLS).
//   안 읽으면 "0" 으로 보여 저장할 때마다 차례가 0 으로 바뀐다.
// needs·copy·kind·updated_at 같은 나머지 칸은 버린다.
export function eventFields(r: Record<string, unknown>): EvEvent {
  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const lu = r.list_until, so = r.sort_order;
  return {
    id: s(r.id), title: s(r.title), short_title: s(r.short_title), subtitle: s(r.subtitle), season: s(r.season),
    opens_on: s(r.opens_on), closes_on: s(r.closes_on), status: s(r.status),
    list_until: lu === null || lu === undefined || lu === "" ? null : String(lu),
    sort_order: so === null || so === undefined || so === "" ? "0" : String(so),
  };
}

// 회차 글자 칸의 상한 — 창(event-form.js)의 maxlength 와 같은 값(화면 roster-logic.js EV_TEXT_MAX 와 시험이 맞대 본다).
// 짧은 이름·이름은 성도님 앱 첫 화면 단추·회차 카드에 그대로 뜬다 — 붙여 넣은 한 문단이 모든 분의 단추를 깨지 않게(SEC-6).
export const EV_TEXT_MAX: Record<string, number> = { title: 100, short_title: 40, subtitle: 100, season: 20 };

// 회차 설정의 길이·차례 검사 — checkEvent(기간·상태·공개 종료일) 뒤에 부른다. **바꾼 칸만** 본다
// (before 가 null 이면 모두 = 만들기) — 옛 값이 길거나 차례가 범위 밖이어도 다른 칸 저장은 막지 않는다.
//   글자 칸이 EV_TEXT_MAX 보다 길면 event-too-long · sort_order 가 -999~999 정수 글자가 아니면 bad-sort-order
export function checkEventEdit(before: EvEvent | null, next: EvEvent): string | null {
  const b = before as unknown as Record<string, unknown> | null;
  const n = next as unknown as Record<string, unknown>;
  const changed = (k: string) => !b || b[k] !== n[k];
  for (const k of Object.keys(EV_TEXT_MAX)) {
    if (changed(k) && String(n[k] ?? "").length > EV_TEXT_MAX[k]) return "event-too-long";
  }
  if (changed("sort_order") && !/^-?\d{1,3}$/.test(String(n.sort_order ?? ""))) return "bad-sort-order";
  return null;
}

// eventDiff 의 after(글자) → DB 에 쓸 값. sort_order 만 수로(int 칸) · 나머지는 그대로 · 받은 것을 고치지 않는다(사본).
export function eventDbPatch(after: Record<string, string | null>): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = { ...after };
  if (Object.prototype.hasOwnProperty.call(after, "sort_order")) out.sort_order = Number(after.sort_order) || 0;
  return out;
}

// 바뀐 칸만 전·후로 — 서버가 update 할 칸이자 event.settings 기록의 detail. 같으면 둘 다 빈 것. id 는 보지 않는다.
export function eventDiff(before: EvEvent, after: EvEvent):
  { before: Record<string, string | null>; after: Record<string, string | null> } {
  const b: Record<string, string | null> = {};
  const a: Record<string, string | null> = {};
  const x = before as unknown as Record<string, string | null>;
  const y = after as unknown as Record<string, string | null>;
  for (const k of EV_EDIT_KEYS) {
    const p = x[k] ?? null, q = y[k] ?? null;
    if (p !== q) { b[k] = p; a[k] = q; }
  }
  return { before: b, after: a };
}
