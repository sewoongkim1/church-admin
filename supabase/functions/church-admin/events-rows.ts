// 성경필사(암송) — 줄 한 분 더하기·고치기의 순수 규칙(2026-09-29 · 계획 Task 7)
//   서버(Deno, index.ts)와 시험(Node, tests/events-rows.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum·namespace 금지, node --experimental-strip-types 가 그대로 읽는다).
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §1·§2
// ⚠️ 규칙을 새로 만들지 않는다 — 다듬기는 events-rules.ts tidyRow(올리기 tidyRaw 가 부르는 것과 같은 함수),
//    판정표는 checkRow, 같은 분 후보 키는 candidateKeys(「07」·「N목장」·NFC/NFD 포함). 자격 회차 판정도
//    events-rules.ts isEligEvent 하나다(여기 두지 않는다 — 화면의 hasEligibility 와 서버의 막기가 어긋나지 않게).
//    여기는 그 규칙들을 「폼 한 줄」·「보낸 칸만」·「바뀐 칸만」·「메모 머리」에 맞게 부르는 자리다.
import { candidateKeys, checkRow, tidyRow, type EvRow } from "./events-rules.ts";
import { legacyNorm, MIN_POSITIONS } from "./paper.ts";

// 담당자가 한 분 더한 줄의 메모 머리 — 운영에 이미 쓰인 표기 그대로(설계 §1 「메모에 남기는 표기」)
export const ADD_TAG = "담당자가 더함";

// 줄의 다섯 칸(DB 이름) — 고치기가 「실제로 바뀐 칸」을 세는 차례
export const ROW_FIELDS = ["who_type", "group_name", "sub_name", "name", "position"] as const;
export type RowField = (typeof ROW_FIELDS)[number];
// 화면이 보내는 칸 이름(계약: group·sub) — 메모(note)는 따로 본다
const PATCH_KEYS = ["who_type", "group", "sub", "name", "position"];

const obj = (x: unknown): Record<string, unknown> =>
  (x && typeof x === "object" && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
const has = (o: Record<string, unknown>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

// 한 분 더하기 폼 → 줄. 다듬기만 하고 검사는 checkRow 가 한다.
export function formRow(x: unknown): EvRow {
  const o = obj(x);
  return tidyRow({ who_type: o.who_type, group_name: o.group, sub_name: o.sub, name: o.name, position: o.position });
}

// 고치기 — **보낸 칸만** 다듬어 얹는다. 안 보낸 칸은 DB 값 그대로(옛 값을 다시 다듬어 몰래 바꾸지 않게).
// 교구 칸·목장 칸은 (보냈든 안 보냈든) **바뀐 뒤의 구분**의 규칙으로 다듬는다.
export function rowPatch(cur: EvRow, patch: unknown): { next: EvRow; changed: RowField[] } {
  const p = obj(patch);
  const who = has(p, "who_type") ? legacyNorm(p.who_type) : cur.who_type;
  const t = tidyRow({ who_type: who, group_name: p.group, sub_name: p.sub, name: p.name, position: p.position });
  const next: EvRow = {
    who_type: who as EvRow["who_type"],
    group_name: has(p, "group") ? t.group_name : cur.group_name,
    sub_name: has(p, "sub") ? t.sub_name : cur.sub_name,
    name: has(p, "name") ? t.name : cur.name,
    position: has(p, "position") ? t.position : cur.position,
  };
  return { next, changed: ROW_FIELDS.filter((f) => next[f] !== cur[f]) };
}

// 앱에서 낸 줄·자격 회차의 줄은 메모만 — 메모 밖 칸이 **오기만 해도** 거절한다(설계 §2 evRowSave)
export function touchesRow(patch: unknown): boolean {
  const p = obj(patch);
  return PATCH_KEYS.some((k) => has(p, k));
}

// 바뀐 칸만 검사한다(설계 §1 끝) — 안 바뀐 칸은 checkRow 를 늘 통과하는 자리값으로 바꿔 넣고 checkRow 를 부른다.
// 구분(who_type)이 바뀌면 교구·목장도 새 구분의 규칙으로 다시 본다.
const SAFE_GROUP: Record<string, string> = { "교구": "믿음", "교회학교": "청년부" };
export function checkChanged(next: EvRow, changed: readonly string[]): string | null {
  const typeChanged = changed.includes("who_type");
  const who = typeChanged ? next.who_type : (next.who_type === "교회학교" ? "교회학교" : "교구");
  const probe: EvRow = {
    who_type: who as EvRow["who_type"],
    group_name: typeChanged || changed.includes("group_name") ? next.group_name : SAFE_GROUP[who],
    sub_name: typeChanged || changed.includes("sub_name") ? next.sub_name : "",
    name: changed.includes("name") ? next.name : "홍길동",
    position: changed.includes("position") ? next.position : "",
  };
  return checkRow(probe);
}

// 같은 분 후보 키 — events-rules.ts candidateKeys 그대로(한 자리 목장의 「0N」까지 거기서 만든다).
// 한 분 더하기·고치기(sameInEvent)·올리기(Task 8)가 이 이름 하나로 부른다 — 규칙이 두 벌이 되지 않게.
export function sameKeys(row: EvRow): string[] {
  return candidateKeys(row);
}

// 목장이 비었거나 「99」인 교구 줄 — 같은 분 판정을 목장 빼고 느슨하게 본다(최종 검토 I1 · 2026-09-30).
//   앱 로그인은 목장이 없으면 「99」로 받고, 담당자 줄은 목장을 비워 둘 수 있다(checkRow 가 받는다). 그런 줄과
//   목장이 적힌 줄(교인명부로 채운 「20」 등)은 신원 키가 달라 같은 분으로 안 보여 두 번 들어갔다.
//   규칙: 교구 줄끼리 같은 교구·같은 이름(완성형)이고 **한쪽이라도** 목장이 비었거나 99 면 같은 분. 둘 다 번호면 정본 키(sameKeys)가 본다.
//   교회학교(학년)는 느슨하게 보지 않는다. 화면의 「중복일 수 있음」(roster-logic.js dupFlags)도 같은 규칙이다.
export function openMok(sub: unknown): boolean {
  const t = legacyNorm(sub).replace(/\s+/g, "");
  const m = /^(\d+)(목장)?$/.exec(t);
  const n = m ? m[1].replace(/^0+(?=\d)/, "") : t;
  return n === "" || n === "99";
}
// 느슨한 키 — 구분|교구|이름(완성형). 교구 줄이 아니거나 교구·이름이 비면 null(맞대지 않는다).
export function looseKey(row: { who_type: string; group_name: string; name: string }): string | null {
  if (row.who_type !== "교구") return null;
  const g = legacyNorm(row.group_name).normalize("NFC"), n = legacyNorm(row.name).normalize("NFC");
  return g && n ? `교구|${g}|${n}` : null;
}
export function looseSame(a: EvRow, b: EvRow): boolean {
  const k = looseKey(a);
  return k !== null && k === looseKey(b) && (openMok(a.sub_name) || openMok(b.sub_name));
}

// supabase-js .in() 은 " \ 를 이스케이프하지 않고 , ( ) 는 감싸기만 한다 — 그런 키는 묻지 않는다
// (index.ts keysToUserIds·people-match LOOKUP_BAD 와 같은 거르기). 「|」는 신원 키의 구분자라 거르지 않는다.
// 새로 적는 칸은 checkRow 가 이미 막으니, 여기 걸리는 것은 「안 바꾼 옛 이름」(예: 「홍길동(구)」)뿐이다.
const IN_BAD = /["\\,()]/;
export function askableKeys(keys: readonly unknown[]): string[] {
  return [...new Set(keys.filter((k): k is string => typeof k === "string" && k !== "" && !IN_BAD.test(k)))];
}

// 메모 앞에 표기를 붙인다 — 겹치면 「 / 」로 잇고, 이미 붙어 있으면 다시 붙이지 않는다. 메모는 한 줄로(줄바꿈은 빈칸 하나).
export function tagNote(tag: string, note: unknown): string {
  const n = legacyNorm(note);
  if (!n) return tag;
  if (n === tag || n.startsWith(tag + " / ")) return n;
  return tag + " / " + n;
}

// 앱 직분 목록(9개) 밖이면 경고만 — 막지 않는다(설계 §0 「직분 검사」: 명예·은퇴 직분이 수백 줄)
export const oddPosition = (position: string): boolean => !!position && !MIN_POSITIONS.has(position);
