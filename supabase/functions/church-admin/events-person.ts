// 성경필사(암송) — 이름을 누르면 교적 창(evPerson)의 순수 함수(2026-09-30 · 계획 Task 16)
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md
//         §0 「이름을 누르면 교적 창」 · §2 evPerson · §3 「이름을 누르면 교적 창」 · §8-8
//   서버(Deno, index.ts)와 시험(Node, tests/events-person.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum·namespace 금지, node --experimental-strip-types 가 그대로 읽는다).
//
// ⚠️ 고르는 규칙을 새로 만들지 않는다 — 명단의 교적 표시(people-match.ts matchChurch)가 쓰는 **sameAffiliation 그대로**다.
//    ① 소속까지 같은 분이 한 분 → 그분(교적 표시 「맞음」인 줄은 늘 그 한 분이 열린다)
//    ② 소속이 같은 분이 없고 이름이 명부 전체에 한 분뿐 → 그분(교적 표시는 「확인 필요 · 같은 이름 1명」 — 창에도 그 표시가 보인다)
//    ③ 그 밖(같은 소속 둘 이상 · 소속 다른 동명이인) → 고르지 않는다(후보만 · 화면이 고르게 한다)
// ⚠️ 고른 분이 있으면 **그 한 분만** 싣는다 — 같은 이름의 다른 분 값은 필요할 때(고르지 못했을 때)만 나간다.
//    total 은 명부에서 이 이름인 분 수(스무 분으로 자르기 전) — 화면이 「같은 이름 21분(앞 20분)」처럼 사실대로 적게.
// ⚠️ 모양은 부른 사람의 역할로 갈린다(역할 확인은 index.ts — ctx.roles):
//    full(교인명부 역할·총괄) — 교인ID·이름·소속 한 줄·직분. 화면이 교인ID 로 교인명부 peoplePerson(「자세히」 창)을 연다.
//    basic(성경필사 역할만) — 다섯 칸(lookupOut — evPeopleLookup 과 같은 칸 지도)과 교적 표시. 교인ID 는 싣지 않는다.
//    연락처·주소·생년월일·사진은 어느 쪽에도 없다(서버도 그 칸을 읽지 않는다 · 스프레드 금지).
import { mapChurchPerson, positionFromChurch, type ChurchPerson } from "./events-people.ts";
import { affLabel } from "./events-stats.ts";
import { lookupOut, LOOKUP_MAX } from "./events-upload.ts";
import { legacyNorm } from "./paper.ts";
import { applicantFromSignup, matchChurch, sameAffiliation, toCand, type Church } from "./people-match.ts";
import { BE_FIELD_MAX } from "./events-rules.ts";

export type PersonCand = ChurchPerson & { person_id: number | string; name: string };
export type PersonAsk = { who_type: string; group_name: string; sub_name: string; name: string };
export type PersonFull = { person_id: number; name: string; label: string; position: string };
export type PersonBasic = { name: string; who_type: string; group: string; sub: string; position: string };
export type PersonOut =
  | { mode: "full"; pick: 0 | null; total: number; candidates: PersonFull[] }
  | { mode: "basic"; pick: 0 | null; total: number; people: PersonBasic[]; church: Church };

const cut = (v: unknown): string => legacyNorm(v).slice(0, BE_FIELD_MAX);
const txt = (v: unknown): string => legacyNorm(String(v ?? "").normalize("NFC"));

// 화면이 보낸 명단 줄(구분·소속·세부) + 다듬은 이름(부르는 쪽이 lookupName 으로 검사한 것) → 맞대 볼 줄.
// 소속 칸은 DB 에 묻지 않고 메모리에서 견주기만 한다 — 그래도 한 칸 40자로 자른다. 구분은 둘 밖이면 비운다.
export function personAsk(b: unknown, name: string): PersonAsk {
  const o = (b && typeof b === "object" && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
  const who = legacyNorm(o.who_type);
  return {
    who_type: who === "교구" || who === "교회학교" ? who : "",
    group_name: cut(o.group), sub_name: cut(o.sub), name: legacyNorm(name),
  };
}

// 후보 차례와 고른 분 — 같은 소속 먼저(교인ID 차례), 그다음 나머지(교인ID 차례). pick 은 list 의 자리(늘 0 또는 null).
// 받은 배열은 바꾸지 않는다.
export function personPick(cands: PersonCand[], ask: PersonAsk): { pick: 0 | null; list: PersonCand[] } {
  const all = [...(cands ?? [])].sort((a, b) => Number(a.person_id) - Number(b.person_id));
  const a = applicantFromSignup(ask);
  const same = all.filter((c) => sameAffiliation(toCand(c), a));
  const list = [...same, ...all.filter((c) => !same.includes(c))];
  if (same.length === 1) return { pick: 0, list };
  if (same.length === 0 && all.length === 1) return { pick: 0, list };
  return { pick: null, list };
}

// 교인명부 역할에게 보이는 소속 한 줄 — 명단과 같은 꼴(affLabel · 「화평 20목장」·「소망 남성」·「중등부」).
// 옮겨 적는 규칙이 소속을 못 정한 분(새가족·임시교구 등)은 명부의 교구(또는 부서) 칸 그대로 — 교인명부 역할은 원래 보는 값이다.
export function personLabel(p: ChurchPerson): string {
  const a = mapChurchPerson(p);
  if (a) return affLabel(a);
  return txt(p?.mok1) || txt(p?.school_dept) || "(소속 없음)";
}

// 응답(ok 빼고) — 명시적 칸 지도로만. 고르지 못했으면 스무 분까지(evPeopleLookup 과 같은 상한) · total 은 자르기 전 수.
export function personOut(cands: PersonCand[], ask: PersonAsk, full: boolean): PersonOut {
  const { pick, list } = personPick(cands, ask);
  const shown = pick === null ? list.slice(0, LOOKUP_MAX) : [list[pick]];
  const total = list.length;
  if (full) {
    return {
      mode: "full", pick, total,
      candidates: shown.map((p) => ({
        person_id: Number(p.person_id), name: legacyNorm(p.name), label: personLabel(p), position: positionFromChurch(p),
      })),
    };
  }
  // 교적 표시 — 명단(evRoster)과 같은 함수·같은 후보(이 이름의 명부 전체)로. 그래서 창의 표시와 명단의 표시가 같다.
  return {
    mode: "basic", pick, total, people: shown.map((p) => lookupOut(p)),
    church: matchChurch((cands ?? []).map(toCand), applicantFromSignup(ask)),
  };
}
