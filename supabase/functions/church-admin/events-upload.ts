// 성경필사(암송) — 명단 올리기 판정 · 교인명부 찾기 모양(순수 함수 · 2026-09-29 · 계획 Task 8)
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md
//         §1 「같은 분 판정」·「메모에 남기는 표기」 · §2 evUploadCheck/evUploadSave/evPeopleLookup · §3 「📤 명단 올리기」
//   서버(Deno, index.ts)와 시험(Node, tests/events-upload.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum·namespace 금지, node --experimental-strip-types 가 그대로 읽는다).
//
//   흐름: tooManyRows → [서버: 회차] → uploadEventError → tidyUpload(다듬기·모양) → [서버: 교인명부 후보] → applyFill(빈칸 채우기)
//        → [서버: 이 회차 명단·앱 계정] → judgeUpload(이미 있음·파일 안 접기·계정 잇기)
//        → uploadCounts · uploadOut(화면) · uploadRecords(넣기) · fillRecord(people.fill — 물은 이름·채운 이름)
//   ⚠️ 살펴보기(evUploadCheck)와 넣기(evUploadSave)가 이 흐름을 **처음부터 똑같이** 돈다 — 화면이 보낸 판정을 믿지 않는다.
//   ⚠️ 같은 분 후보 키는 한 분 더하기·고치기와 **같은 함수**(events-rows.ts sameKeys — 「07」 꼴 포함)를 쓴다.
//   ⚠️ 계정은 찾기만 한다(만들지 않는다). uid 는 서버 안에서만 쓰고 uploadOut 에 싣지 않는다.
//   ⚠️ 「넣음」은 add·fill 둘뿐이다. same-name 은 소속을 못 정한 줄(빈칸)에만 붙는다 — 소속이 적힌 줄은 채우지 못해도 그대로 넣는다.
//   ⚠️ 채울지·무엇을 채울지는 fillDecision(Task 3 · CONTRACT 5 보강판) 하나가 정한다 — 여기서는 얹고 알리기만 한다.
//   ⚠️ index.ts 는 이 과제의 이름을 **이 모듈에서만** 가져온다(CONTRACT 5 — 다른 과제의 import 와 이름이 겹치지 않게).
//      그래서 찾기의 이름 다듬기(lookupName)·다섯 칸(lookupOut)·찾기 후보 한 줄(lookupCandOut)·올리기 막기(tooManyRows·uploadEventError)도 여기 있다.
import { BE_BAD_CHARS, BE_FIELD_MAX, BE_MAX_UPLOAD, checkRow, identKey, isEligEvent, tidyRaw, type EvRow, type RawCells } from "./events-rules.ts";
import { churchMok, fillDecision, lookupView, type ChurchPerson } from "./events-people.ts";
import { oddPosition, sameKeys, tagNote } from "./events-rows.ts";
import { legacyNorm } from "./paper.ts";
import { nameKey } from "./people-match.ts";
import { looseKey, openMok } from "./events-rows.ts";

export type UploadMark = "add" | "same" | "blank" | "bad" | "fill" | "same-name";
// 판정 중인 줄 — 소속이 빈 줄은 who_type 이 "" 라 EvRow 보다 느슨하다
export type UpRow = { who_type: string; group_name: string; sub_name: string; name: string; position: string };
export type UploadItem = {
  i: number;              // 보낸 rows 의 차례(0부터) — 화면은 i+1 번 줄로 보인다
  mark: UploadMark;
  row: UpRow | null;
  error: string | null;   // 모양 틀림 코드(checkRow 의 코드)
  notes: string[];        // 한국어 한 줄들 — 화면이 그대로 보인다(교인명부의 원래 칸 값은 싣지 않는다)
  filled: boolean;        // 교인명부 값이 들어갔나(people.fill 기록 대상)
  uid: string | null;     // 이을 앱 계정 — 찾은 계정이 하나일 때만
  orig?: UpRow;           // 채우기 **전** 줄 — 채우기 없이도 넣을 수 있던 줄(add)을 채웠을 때만(applyFill · 최종 검토 I1)
  asked?: boolean;        // 이 줄 이름을 교인명부에 물었나(applyFill · 명부가 있을 때만) — people.fill 의 물은 이름(SEC-2)
  fillKeys?: string[];    // 교인명부로 채운 칸(who_type·group_name·sub_name·position) — 메모 표기를 가른다(M5)
};
export type UploadCounts = { add: number; same: number; blank: number; bad: number; fill: number; sameName: number; oddPosition: number };
export type UploadOut = {
  i: number; mark: UploadMark;
  row: { who_type: string; group: string; sub: string; name: string; position: string } | null;
  error: string | null; notes: string[];
};
// loose — 이 회차 교구 줄의 느슨한 키(구분|교구|이름): all = 모든 줄 · open = 목장이 비었거나 99 인 줄(looseIndex · I1)
export type LooseIdx = { all: Set<string>; open: Set<string> };
export type JudgeIdx = { eventKeys: Set<string>; eventUids: Set<string>; users: Map<string, string[]>; loose?: LooseIdx };

// 메모(note) 머리 표기 — 설계 §1 「메모에 남기는 표기」 그대로. 겹치면 tagNote 가 " / " 로 잇는다.
// 올리기의 메모는 이 표기뿐이라 500자(BE_NOTE_MAX)에 닿지 않는다.
export const UPLOAD_TAG = "명단 올리기";
export const FILL_TAG = "소속: 교인명부로 채움";
// 직분만 채운 줄(구분·교구·목장은 명단 그대로) — M5(2026-09-30 친구 결정). 소속을 하나라도 채웠으면 위 FILL_TAG 그대로
// (운영에 이미 그 표기로 들어간 줄이 있다 — 바꾸지 않는다).
export const POSITION_FILL_TAG = "직분: 교인명부로 채움";
const AFFIL_KEYS = ["who_type", "group_name", "sub_name"];
// 교인명부 찾기 상한(설계 §2 evPeopleLookup)
export const LOOKUP_MAX = 20;

const BLANK_NOTE = "소속(교구·부서)이 비어 있어요";
const NO_DIRECTORY_NOTE = "교인명부가 아직 올라오지 않아 빈칸을 채우지 못했어요";
const FILLED_NOTE = "빈칸을 교인명부로 채웠어요";
const BAD_FILL_NOTE = "교인명부 값이 명단 모양에 맞지 않아 채우지 않았어요";
const ALREADY_NOTE = "이 회차 명단에 이미 있어요";
const LOOSE_NOTE = "이 회차 명단에 이미 있어요(같은 교구·같은 이름 — 한쪽 목장이 비었거나 99)";
const LINK_NOTE = "앱 계정과 이어요";
// fillDecision 의 까닭 → 화면 알림. nothing-blank(채울 것이 없다)는 알리지 않는다.
const FILL_NOTE: Record<string, string> = {
  "not-in-directory": "교인명부에 없는 이름이라 빈칸을 채우지 못했어요",
  "same-name": "교인명부에 같은 이름이 여러 분이라 빈칸을 채우지 않았어요",
  "no-affiliation": "교인명부에 소속이 적혀 있지 않아 채우지 못했어요",
  "kid-adult": "명단과 교인명부의 구분(아이·어른)이 달라 다른 분으로 보고 채우지 않았어요",
  "youth-parish": "명단은 청년부인데 교인명부는 교구라 채우지 않았어요(청년부를 둡니다)",
  "different-affiliation": "명단의 소속과 교인명부의 소속이 달라 다른 분일 수 있어 채우지 않았어요",
};

const live = (it: UploadItem): boolean => it.mark === "add" || it.mark === "fill";

// ⓪ 올리기 막기 — 줄 수는 회차를 읽기 **전에**(상한 600줄 · 회차당 최대가 515줄), 회차는 읽은 뒤에.
export const tooManyRows = (raws: unknown[]): boolean => raws.length > BE_MAX_UPLOAD;
// 없는(모양이 틀린) 회차 → not-found · 자격 회차 → eligibility-event(가을 설계 §12 「대리 등록은 보정 창구로만」).
// ⚠️ 자격 회차 판정은 events-rules.ts isEligEvent(needs) 하나(CONTRACT 5) — 여기서 따로 판정하지 않는다.
export function uploadEventError(ev: { needs?: unknown } | null): "not-found" | "eligibility-event" | null {
  if (!ev) return "not-found";
  return isEligEvent(ev.needs) ? "eligibility-event" : null;
}

// 화면이 보낸 한 줄 → 네 칸 글자. 엑셀 숫자 칸(목장 7)도 글자로. 터무니없이 긴 칸은 200자에서 자른다(판정은 40자에서 too-long).
const cell = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "").slice(0, 200);
export function rawOf(x: unknown): RawCells {
  const o = (x && typeof x === "object" && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
  return { name: cell(o.name), gu: cell(o.gu), mok: cell(o.mok), pos: cell(o.pos) };
}

// ① 다듬기·모양 — 줄마다 tidyRaw(설계 §3 다듬기 → §1 판정표).
//   판정표의 no-group(소속이 비었다)은 「모양 틀림」이 아니라 「빈칸(소속 없음)」이다 — 채우기를 켜면 applyFill 이 채워 본다.
//   교구 칸이 비었으면 구분도 모른다 — tidyRaw 가 둔 「교구」는 기본값일 뿐이라 비워 둔다
//   (그대로 두면 fillDecision 이 교회학교 소속을 교구 줄에 얹으려다 막힌다).
export function tidyUpload(raws: unknown[]): UploadItem[] {
  return raws.map((x, i): UploadItem => {
    const raw = rawOf(x);
    const base = { i, filled: false, uid: null };
    const t = tidyRaw(raw);
    if (t.error === "no-group" && t.row) {
      return { ...base, mark: "blank", error: null, notes: [...t.notes, BLANK_NOTE],
        row: { ...t.row, who_type: legacyNorm(raw.gu) ? t.row.who_type : "" } };
    }
    if (t.error || !t.row) {
      return { ...base, mark: "bad", row: t.row ? { ...t.row } : null, error: t.error ?? "no-name", notes: [...t.notes] };
    }
    return { ...base, mark: "add", row: { ...t.row }, error: null, notes: [...t.notes] };
  });
}

// 채울 빈칸이 있나 — 교회학교 줄의 학년은 원래 비어 있어 묻지 않는다(아이 교적을 쓸데없이 읽지 않게)
// 교회학교 부서 줄(청년부 빼고)은 학년·직분이 원래 비어 있어 묻지 않는다 — 아이 교적을 쓸데없이 읽지 않게 · 소속이 빈 줄은 묻는다
const kidRow = (r: UpRow): boolean => r.who_type === "교회학교" && !!r.group_name && r.group_name !== "청년부";
const needsFill = (r: UpRow): boolean =>
  !r.who_type || !r.group_name || (!r.position && !kidRow(r)) || (r.who_type === "교구" && !r.sub_name);

// 명부에 물어볼 이름 키 — 빈칸이 있는 줄만(빈칸이 없는 줄의 교적은 읽지 않는다)
export function fillNames(items: UploadItem[]): string[] {
  const out = new Set<string>();
  for (const it of items) {
    if ((it.mark !== "add" && it.mark !== "blank") || !it.row || !needsFill(it.row)) continue;
    const k = nameKey(it.row.name);
    if (k) out.add(k);
  }
  return [...out];
}

const FILL_KEYS = ["who_type", "group_name", "sub_name", "position"] as const;
const own = (o: Record<string, unknown>, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k) && typeof o[k] === "string";

// ② 빈칸 채우기 — cands: name_key → 교인명부 후보. 명부가 한 번도 안 올라왔으면 null.
//   채울지·무엇을은 fillDecision(Task 3 · CONTRACT 5 보강판)이 정한다:
//     한 분일 때만 · 빈 칸만 · 아이↔어른 / 청년부↔교구 는 채우지 않음 · 소속이 적혀 있는데 명부와 다르면 아무것도(different-affiliation).
//   여기서 하는 일은 셋 — 결과를 줄에 얹기 · 교구 칸이 빈 줄이면 목장도 명부 값(적혀 있던 목장은 버리고 알림) · 알림 적기.
export function applyFill(items: UploadItem[], cands: Map<string, ChurchPerson[]> | null): UploadItem[] {
  for (const it of items) {
    if ((it.mark !== "add" && it.mark !== "blank") || !it.row || !needsFill(it.row)) continue;
    if (!cands) { it.notes.push(NO_DIRECTORY_NOTE); continue; }
    const row = it.row;
    const key = nameKey(row.name);
    if (key) it.asked = true;                  // fillNames 가 명부에 물은 이름 키(빈 키는 묻지 않았다)
    const d = fillDecision(row, cands.get(key) ?? []);
    if (d.reason !== "filled" || !d.patch) {
      // 동명이인 — 소속을 못 정한 줄만 「교인명부 동명이인」. 소속이 적힌 줄은 add 그대로(빈 직분은 빈 채로 넣는다).
      if (it.mark === "blank" && d.reason === "same-name") it.mark = "same-name";
      if (FILL_NOTE[d.reason]) it.notes.push(FILL_NOTE[d.reason]);
      continue;
    }
    const p = d.patch as Record<string, unknown>;
    const next: UpRow = { ...row };
    const extra: string[] = [];
    if (!row.group_name && own(p, "group_name")) {
      // 소속을 교인명부로 정했다 — 구분·목장도 교인명부 값. 적혀 있던 목장은 다른 교구의 번호일 수 있어 버리고 알린다(CONTRACT 5).
      if (own(p, "who_type")) next.who_type = p.who_type as string;
      next.group_name = p.group_name as string;
      next.sub_name = own(p, "sub_name") ? (p.sub_name as string) : "";
      if (row.sub_name && row.sub_name !== next.sub_name) {
        extra.push(next.sub_name
          ? `적힌 목장 ${row.sub_name} 대신 교인명부 목장을 넣었어요`
          : `적힌 목장 ${row.sub_name} 대신 교인명부처럼 목장을 비웠어요`);
      }
    } else if (!row.sub_name && own(p, "sub_name")) {
      next.sub_name = p.sub_name as string;          // 같은 소속일 때만 온다(다르면 fillDecision 이 different-affiliation)
    }
    if (!row.position && own(p, "position")) next.position = p.position as string;
    // 이름은 무엇이 와도 바꾸지 않는다(patch 에 name 이 있어도 보지 않는다)
    if (FILL_KEYS.every((k) => next[k] === row[k])) continue;
    if (checkRow(next as EvRow)) { it.notes.push(BAD_FILL_NOTE); continue; }
    // 채우기 전 줄을 남긴다 — 채우기 없이도 넣을 수 있던 줄(add)만. 채우기를 끄고 먼저 올렸으면 그 줄은
    // 목장이 빈 채로 들어가 있어 채운 목장의 키로는 못 찾는다 → judgeUpload 가 이 줄의 키로도 본다(I1).
    if (it.mark === "add") it.orig = { ...row };
    it.fillKeys = FILL_KEYS.filter((k) => next[k] !== row[k]);
    it.row = next;
    it.mark = "fill";
    it.filled = true;
    it.notes.push(FILLED_NOTE, ...extra);
  }
  return items;
}

// 넣을 줄(add·fill)의 후보 키 전부 — 한 분 더하기와 같은 sameKeys(「07」 꼴 포함). 넣을 줄이 없으면 계정을 읽지 않는다.
export function uploadKeys(items: UploadItem[]): string[] {
  const out = new Set<string>();
  for (const it of items) if (live(it)) for (const k of sameKeys(it.row as EvRow)) out.add(k);
  return [...out];
}

// ③ 같은 분 판정 2~4 — 이 회차에 이미(키·계정) · 이 파일 안(먼저 나온 줄이 남는다) · 계정은 하나일 때만 잇는다
//   idx.users 는 신원 키 → 계정 id 들(users.identity_key + user_identity_aliases). 후보 키로만 찾아본다.
//   ⚠️ 목장이 비었거나 99 인 교구 줄(최종 검토 I1): ① 채운 줄은 채우기 전 줄(it.orig)의 정본 키로도 맞댄다
//      ② 한쪽 목장이 비었거나 99 면 구분|교구|이름으로 같은 분(idx.loose · 파일 안도 같게). 계정 잇기는 채운 줄의 키로만.
export function looseIndex(rows: readonly { who_type?: unknown; group_name?: unknown; sub_name?: unknown; name?: unknown }[]): LooseIdx {
  const all = new Set<string>(), open = new Set<string>();
  for (const r of rows) {
    const k = looseKey({ who_type: legacyNorm(r.who_type), group_name: legacyNorm(r.group_name), name: legacyNorm(r.name) });
    if (!k) continue;
    all.add(k);
    if (openMok(r.sub_name)) open.add(k);
  }
  return { all, open };
}

export function judgeUpload(items: UploadItem[], idx: JudgeIdx): UploadItem[] {
  const seenKey = new Map<string, number>();
  const seenUid = new Map<string, number>();
  const seenLoose = new Map<string, number>();       // 느슨한 키 → 먼저 나온 줄(목장이 무엇이든)
  const seenLooseOpen = new Map<string, number>();   // 느슨한 키 → 먼저 나온 줄 가운데 목장이 비었거나 99 인 줄
  const loose: LooseIdx = idx.loose ?? { all: new Set(), open: new Set() };
  for (const it of items) {
    if (!live(it)) continue;
    const row = it.row as EvRow;
    const keys = sameKeys(row);
    const allKeys = it.orig ? [...new Set([...keys, ...sameKeys(it.orig as EvRow)])] : keys;
    const uids = [...new Set(keys.flatMap((k) => idx.users.get(k) ?? []))];
    const lk = looseKey(row);
    const open = lk !== null && openMok(row.sub_name);
    // 이 회차에 이미 — 신원 키가 후보에 들거나, 찾은 계정의 줄이 있으면(앱에서 낸 줄 포함).
    // ⚠️ user_id 가 없는 줄은 DB unique 가 막지 않는다(NULLS DISTINCT) — 이 판정이 유일한 막이다.
    if (allKeys.some((k) => idx.eventKeys.has(k)) || uids.some((u) => idx.eventUids.has(u))) {
      it.mark = "same";
      it.notes.push(ALREADY_NOTE);
      continue;
    }
    if (lk !== null && (open ? loose.all.has(lk) : loose.open.has(lk))) {
      it.mark = "same";
      it.notes.push(LOOSE_NOTE);
      continue;
    }
    const looseSeen = lk === null ? undefined : open ? seenLoose.get(lk) : seenLooseOpen.get(lk);
    const hits = [...allKeys.map((k) => seenKey.get(k)), ...uids.map((u) => seenUid.get(u)), looseSeen]
      .filter((j): j is number => j !== undefined);
    if (hits.length) {
      it.mark = "same";
      it.notes.push(`위 ${Math.min(...hits) + 1}번 줄과 같은 분이에요`);
      continue;
    }
    for (const k of allKeys) seenKey.set(k, it.i);
    for (const u of uids) seenUid.set(u, it.i);
    if (lk !== null) {
      if (!seenLoose.has(lk)) seenLoose.set(lk, it.i);
      if (open && !seenLooseOpen.has(lk)) seenLooseOpen.set(lk, it.i);
    }
    if (uids.length === 1) { it.uid = uids[0]; it.notes.push(LINK_NOTE); }
    else if (uids.length > 1) it.notes.push(`같은 이름·소속의 앱 계정이 ${uids.length}개라 잇지 않아요`);
    const p = it.row!.position;
    if (oddPosition(p)) it.notes.push(`직분 「${p}」 — 앱 직분 목록에 없어요(적은 그대로 넣어요)`);
  }
  return items;
}

export function uploadCounts(items: UploadItem[]): UploadCounts {
  const c: UploadCounts = { add: 0, same: 0, blank: 0, bad: 0, fill: 0, sameName: 0, oddPosition: 0 };
  for (const it of items) {
    if (it.mark === "same-name") c.sameName++;
    else c[it.mark]++;
    if (live(it) && it.row && oddPosition(it.row.position)) c.oddPosition++;
  }
  return c;
}

// 화면에 주는 모양 — 칸 지도로만 만든다(uid·filled 는 싣지 않는다)
export function uploadOut(items: UploadItem[]): UploadOut[] {
  return items.map((it) => ({
    i: it.i,
    mark: it.mark,
    row: it.row
      ? { who_type: it.row.who_type, group: it.row.group_name, sub: it.row.sub_name, name: it.row.name, position: it.row.position }
      : null,
    error: it.error,
    notes: [...it.notes],
  }));
}

// 채운 줄의 메모 표기 — 소속(구분·교구·목장)을 하나라도 채웠으면 「소속: …」, 직분만 채웠으면 「직분: …」(M5).
//   무엇을 채웠는지 모르면(fillKeys 없음) 운영에 쓰여 온 「소속: …」.
const fillTagOf = (it: UploadItem): string =>
  it.fillKeys && it.fillKeys.length && !it.fillKeys.some((k) => AFFIL_KEYS.includes(k)) ? POSITION_FILL_TAG : FILL_TAG;

// 넣을 줄 — 모든 줄의 칸이 같다(PostgREST 묶음 insert 는 칸이 다르면 PGRST102). phone·memo·answers 는 넣지 않는다(기본값).
//   createdAt — 지난 회차면 그 마감일 KST 자정(events-rules.ts pastEventCreatedAt · M2). 없으면 칸을 싣지 않는다(DB 기본값 now()).
//   한 번 올리기는 한 회차라 모든 줄이 같은 값이다(묶음 칸이 같게).
export function uploadRecords(items: UploadItem[], eventId: string, now: string, createdAt: string | null = null):
  { i: number; rec: Record<string, unknown> }[] {
  return items.filter(live).map((it) => {
    const r = it.row as EvRow;
    return {
      i: it.i,
      rec: {
        event_id: eventId, user_id: it.uid, ident_key: identKey(r),
        who_type: r.who_type, group_name: r.group_name, sub_name: r.sub_name, name: r.name, position: r.position,
        note: it.mark === "fill" ? tagNote(UPLOAD_TAG, fillTagOf(it)) : UPLOAD_TAG,
        source: "import", updated_at: now,
        ...(createdAt ? { created_at: createdAt } : {}),
      },
    };
  });
}

// people.fill 기록에 남길 이름 — 교인명부 값이 들어간 줄(이미 있음으로 끝난 줄도 채운 값은 화면에 나간다)
export const filledNames = (items: UploadItem[]): string[] =>
  items.filter((it) => it.filled && it.row).map((it) => it.row!.name);

// people.fill 한 줄 — 명부에 물었으면(채우기 켬 · 명부 있음 · 물은 이름 > 0) 채운 것이 없어도 남긴다(SEC-2 · 2026-09-30 친구 결정).
//   채우지 못한 까닭 알림(「교인명부에 없는 이름」·「같은 이름이 여러 분」·「아이·어른이 달라」·「소속이 달라」)도 명부의 답이라서다.
//   물은 이름은 이름 키마다 하나(fillNames 가 키마다 한 번 묻는다 · 먼저 나온 줄의 이름) · asked = 그 수. 물은 것이 없으면 null(기록 없음).
//   ⚠️ 칸 이름을 바꾸면 js/menus/system/audit.js · tests/audit.test.mjs 도 함께.
export function fillRecord(items: UploadItem[]): { rows: number; names: string[]; asked: number; askedNames: string[] } | null {
  const seen = new Set<string>();
  const askedNames: string[] = [];
  for (const it of items) {
    if (!it.asked || !it.row) continue;
    const k = nameKey(it.row.name);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    askedNames.push(it.row.name);
  }
  if (!askedNames.length) return null;
  const names = filledNames(items);
  return { rows: names.length, names, asked: askedNames.length, askedNames };
}

// ④ 교인명부 찾기 — 이름 다듬기·판정표(no-name → bad-char → too-long, checkRow 와 같은 차례)·이름 키(완성형·띄어쓰기 없음).
//   틀린 이름이면 key 는 "" — 명부에 묻지 않는다.
export function lookupName(v: unknown): { name: string; key: string; error: string | null } {
  const name = legacyNorm(v);
  const error = !name ? "no-name" : BE_BAD_CHARS.test(name) ? "bad-char" : name.length > BE_FIELD_MAX ? "too-long" : null;
  return { name, key: error ? "" : nameKey(name), error };
}

// 읽기만 하는 길(👤 이력 · 이름을 누르면 evPerson) — 이름은 .eq()·메모리로만 쓰인다. 괄호·쉼표가 든 옛 이름(「홍길동(구)」)도
// 누를 수 있게(SEC-7). .in() 으로 가는 길(checkRow·askableKeys·lookupKeys)과 새 이름을 적는 찾기(lookupName)는 그대로 막는다.
// 막는 글자는 셋 — 큰따옴표·역슬래시(주소·따옴표 이스케이프) · 세로줄(신원 키 구분자). BE_BAD_CHARS 에서 쉼표·괄호를 뺀 것.
const READ_BAD_CHARS = /["\\|]/;
export function readName(v: unknown): { name: string; key: string; error: string | null } {
  const name = legacyNorm(v);
  const error = !name ? "no-name" : READ_BAD_CHARS.test(name) ? "bad-char" : name.length > BE_FIELD_MAX ? "too-long" : null;
  return { name, key: error ? "" : nameKey(name), error };
}

// 명부 한 분 → 다섯 칸(이름·구분·소속·세부·직분). 화면 이름은 group·sub(CONTRACT 2).
// ⚠️ 스프레드(...p)를 쓰지 않는다 — name_key·kind2·mok1·mok3·position_detail 같은 원래 칸이 따라 나가지 않게.
export function lookupOut(p: ChurchPerson & { name?: unknown }): { name: string; who_type: string; group: string; sub: string; position: string } {
  const v = lookupView(p, legacyNorm(p.name));
  return { name: v.name, who_type: v.who_type, group: v.group_name, sub: v.sub_name, position: v.position };
}

// 한 분 더하기 찾기(evPeopleLookup) 후보 한 줄 — 다섯 칸 + 교적 목장 칸 그대로(church_mok · events-people.ts churchMok · 2026-09-30 친구 요청).
//   소망 남성1·남성2 목장의 같은 이름 두 분은 다섯 칸이 같다(둘 다 「소망 남성」) — 화면이 「교적: 소망-남성1」로 가려내게.
// ⚠️ **찾기 후보에만.** lookupOut 을 넓히지 않는다 — evPerson basic(events-person.ts)·빈칸 채우기는 다섯 칸 그대로(시험이 맞댄다).
// ⚠️ 칸 지도로만(스프레드 금지) — 읽는 칸은 index.ts EV_LOOKUP_COLS 그대로(churchMok 재료 kind2·mok1·mok3·school_dept 는 이미 읽는다).
export function lookupCandOut(p: ChurchPerson & { name?: unknown }):
  { name: string; who_type: string; group: string; sub: string; position: string; church_mok: string } {
  const o = lookupOut(p);
  return { name: o.name, who_type: o.who_type, group: o.group, sub: o.sub, position: o.position, church_mok: churchMok(p) };
}
