// 성경필사(암송) — 이름을 누르면 교적 창(evPerson)의 순수 함수(2026-09-30 · 계획 Task 16)
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md
//         §0 「이름을 누르면 교적 창」 · §2 evPerson · §3 「이름을 누르면 교적 창」 · §8-8
//   서버(Deno, index.ts)와 시험(Node, tests/events-person.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum·namespace 금지, node --experimental-strip-types 가 그대로 읽는다).
//
// ⚠️ 고르는 규칙을 새로 만들지 않는다 — 명단의 교적 표시(people-match.ts matchChurch)가 쓰는 **sameAffiliation 그대로**다
//    (성경필사 줄은 signupSame — 교구 줄에서 명부의 아이를 빼고 「옮겨 적은 줄」 transcribedSame 을 더한 것.
//     명단의 표시 churchForSignup 도 같은 signupSame 을 쓴다 · 아래 절).
//    ① 소속까지 같은 분이 한 분 → 그분(교적 표시 「맞음」인 줄은 늘 그 한 분이 열린다)
//    ② 소속이 같은 분이 없고 이름이 명부 전체에 한 분뿐 → 그분(교적 표시는 「확인 필요 · 같은 이름 1명」 — 창에도 그 표시가 보인다)
//    ③ 그 밖(같은 소속 둘 이상 · 소속 다른 동명이인) → 고르지 않는다(후보만 · 화면이 고르게 한다)
// ⚠️ 고른 분이 있으면 **그 한 분만** 싣는다 — 같은 이름의 다른 분 값은 필요할 때(고르지 못했을 때)만 나간다.
//    total 은 명부에서 이 이름인 분 수(스무 분으로 자르기 전) — 화면이 「같은 이름 21분(앞 20분)」처럼 사실대로 적게.
// ⚠️ 모양은 부른 사람의 역할로 갈린다(역할 확인은 index.ts — ctx.roles):
//    full(교인명부 역할·총괄) — 교인ID·이름·소속 한 줄·직분. 화면이 교인ID 로 교인명부 peoplePerson(「자세히」 창)을 연다.
//    basic(성경필사 역할만) — lookupOut 다섯 칸(evPeopleLookup 의 다섯 칸과 같다 · church_mok 은 없음)과 교적 표시. 교인ID 는 싣지 않는다.
//    (evPeopleLookup 후보에만 붙는 교적 목장 칸 church_mok 은 여기 싣지 않는다 — lookupCandOut 은 찾기 전용 · 2026-09-30)
//    연락처·주소·생년월일·사진은 어느 쪽에도 없다(서버도 그 칸을 읽지 않는다 · 스프레드 금지).
//
// 사역신청·담당자 화면(ministryPerson · 2026-09-30 친구 요청)도 이 규칙을 쓴다 — 신청 현황·임명현황·종이 명단 올리기 결과·
//    시스템 → 담당자·역할. 맞대 볼 줄(Applicant)만 부르는 쪽이 만들고(personPickFor·personOutFor), 고르기·응답 모양은 한 벌이다.
// ⚠️ 전화 단계는 ministryPerson 만 쓴다(성경필사 명단엔 전화가 없다 — applicantFromSignup 이 phone 을 늘 "" 로 둔다).
//    ④ 위 ①② 로 못 골랐고 부르는 쪽이 번호를 줬으면 — 같은 소속 안에서(같은 소속이 없으면 같은 이름 전부에서) 명부 번호가
//       **정확히 한 분**과 맞을 때만 그분. 두 분 이상과 맞거나 아무와도 안 맞으면 고르지 않는다.
//    명부 번호(phone_digits)는 고르는 데만 쓴다 — 응답은 아래 명시적 칸 지도(full 넷 · basic 다섯 + 교적 표시)로만 나간다.
//    목장을 확인할 줄(mokToConfirm — 99·빈칸, 그리고 교적 남성 목장에 같은 이름이 없는 「화평 남성」)은 같은 소속이 없고
//    같은 교구 후보가 있으면 번호도 **그 안에서만** 본다 — 명단의 교적 표시(matchChurch)가 「목장 확인(같은 교구 N명)」을
//    번호보다 먼저 보는 차례 그대로(2026-09-30 검토 1). ⚠️ 「남성」은 이제 목장을 모르는 줄이 아니다 — 교적 남성 목장과 맞댄다(people-match.ts candMen).
// ⚠️ 번호로 고르는 것은 full(교인명부·총괄 — 이미 연락처로 찾을 수 있는 분)뿐이다(2026-09-30 검토 4). basic(사역신청 역할만)에서
//    번호로 한 분을 가려 주면 화면이 보낸 아무 번호로 「이 번호는 믿음 1목장 권사 홍길동」을 떠볼 수 있다 — 명단의 교적 표시는
//    「같은 이름 가운데 누군가의 번호(소속 다름)」까지만 알려 준다. basic 은 번호를 교적 표시(matchChurch)에만 쓴다.
import { mapChurchPerson, positionFromChurch, type ChurchPerson } from "./events-people.ts";
import { affLabel } from "./events-stats.ts";
import { lookupOut, LOOKUP_MAX } from "./events-upload.ts";
import { legacyNorm } from "./paper.ts";
import { applicantFromSignup, applicantFromWho, candKid, churchFor, matchChurch, mokToConfirm, nameKey, phoneDigits, sameAffiliation, toCand, type Applicant, type Cand, type Church } from "./people-match.ts";
import { BE_FIELD_MAX, tidyMok } from "./events-rules.ts";

// phone_digits — ministryPerson 만 읽는다(명부 번호 · 띄어쓰기로 여럿 · toCand 가 나눈다). 고르는 데만 쓰고 응답엔 없다.
export type PersonCand = ChurchPerson & { person_id: number | string; name: string; phone_digits?: string };
export type PersonAsk = { who_type: string; group_name: string; sub_name: string; name: string };
export type PersonFull = { person_id: number; name: string; label: string; position: string };
export type PersonBasic = { name: string; who_type: string; group: string; sub: string; position: string };
export type PersonOut =
  | { mode: "full"; pick: 0 | null; total: number; candidates: PersonFull[] }
  | { mode: "basic"; pick: 0 | null; total: number; people: PersonBasic[]; church: Church };

const cut = (v: unknown): string => legacyNorm(v).slice(0, BE_FIELD_MAX);
const txt = (v: unknown): string => legacyNorm(String(v ?? "").normalize("NFC"));

// ---------- 성경필사 줄 — 「옮겨 적은 줄은 맞음」(2026-09-30 친구 제보) ----------
// 명단에는 교적에서 옮겨 적은 줄이 있다(한 분 더하기 창의 「교인명부에서 찾기」 · 올리기의 빈칸 채우기 — events-people.ts mapChurchPerson).
// 그 줄이 교적 표시에서 「맞음」이 못 되는 일이 있었다 — 옮겨 적기와 교적 표시(sameAffiliation)가 서로 다른 규칙이라서:
//   청년공동체·청년새가족 → 「청년부」(sameAffiliation 은 명부 교구 칸 「청년부」만 본다) · 번호 없는 목장 → 목장 빈칸(「목장 모름」으로 봤다) ·
//   「소망-남성1」 → 「남성」(이제 sameAffiliation 도 맞댄다 — people-match.ts candMen).
// 그래서 명부 한 분을 **같은 규칙(mapChurchPerson)으로 옮겨 적었을 때 이 줄과 같으면** 같은 소속으로 친다(signupSame 이 더한다).
//   구분·소속은 완성형·앞뒤 빈칸 정리로, 목장은 tidyMok 꼴로(「20목장」=「20」·「07」=「7」·「남성목장」=「남성」) 견준다.
// ⚠️ 목장 빈칸 교구 줄(「화평 · 빈칸」)은 **같은 교구 어른이 그분 한 분뿐일 때만** 옮겨 적은 줄로 본다(2026-09-30 옮겨 적기 검토 1·3).
//    빈칸은 둘 중 하나다 — 번호 없는 목장(「화평-교역자」·「화평-」·빈 칸)을 옮겨 적었거나, 적는 사람이 목장을 몰라 비웠거나
//    (한 분 더하기 창 「모르면 비워 두기」 · 명단 올리기 · 옛 이관 줄). 빈칸 채우기(fillDecision)는 동명이인이 있으면 멈추므로
//    빈칸으로 남는 줄이 바로 동명이인이 있는 줄이다. 줄 값만으로는 둘을 가를 수 없다(events-rows looseSame 도 빈칸을 「모름」으로 본다).
//    같은 교구에 어른 홍길동이 둘(번호 없는 분 · 20목장 분)인데 번호 없는 분만 「맞음」으로 치면 people-match.ts 의 ⚠️
//    「교구만 맞다고 맞음으로 치지 않는다」를 뒤집는다 — 그때는 예전처럼 「목장 확인(같은 교구 N명)」이다(창에도 둘 다 보인다).
//    한 분뿐이면(친구 제보 꼴) 맞음.
//    어른만 센다(candKid 빼고) — 명부의 아이는 가족 교구를 가지지만 교구 줄의 그분일 수 없다(signupSame · fillDecision kid-adult).
//    그래서 cands(이 이름의 명부 전체 — 판정할 분이 든 목록)를 함께 받는다. 빠뜨리면 빈 목록 — 빈칸 교구 줄은 옮겨 적은 줄로 치지 않는다(안전한 쪽).
// ⚠️ 성경필사 줄만 — 사역신청(ministryPerson·ministryList·ministryPaper) 줄은 옮겨 적기가 없는 줄이라 쓰지 않는다.
// ⚠️ 판정에만 쓴다 — kind2·mok3 같은 교적 칸은 이 함수 밖으로 나가지 않는다(people-match.ts 맨 위 ⚠️).
export type SignupRow = { who_type: string; group_name: string; sub_name: string };
export function transcribedSame(row: SignupRow, cands: Cand[] | undefined): (c: Cand) => boolean {
  const who = txt(row?.who_type), group = txt(row?.group_name), sub = tidyMok(txt(row?.sub_name));
  const lone = who !== "교구" || sub !== "" ||
    (cands ?? []).filter((c) => txt(c?.mok1) === group && !candKid(toCand(c))).length === 1;
  return (c: Cand): boolean => {
    if (!lone) return false;
    const m = mapChurchPerson({ name_key: "", kind2: c?.kind2 ?? "", mok1: c?.mok1 ?? "", mok3: c?.mok3 ?? "",
      school_dept: c?.school_dept ?? "", position: "", position_detail: "" });
    return !!m && m.who_type === who && m.group_name === group && tidyMok(txt(m.sub_name)) === sub;
  };
}

// 성경필사 줄의 「같은 소속」 판정 — matchChurch·personPickFor 의 isSame 으로 넘긴다.
//   signupChurch·churchForSignup(명단)·personPick·personOut(창) **네 곳이 이 하나**를 쓴다 — 창의 표시 = 명단의 표시.
//   = sameAffiliation 에서 교구 줄의 아이를 빼고(아래 ⚠️) + 옮겨 적은 줄(transcribedSame).
// ⚠️ 명부의 아이는 가족의 교구·목장(mok1·mok3)을 가진다 — mapChurchPerson 이 아이를 **먼저** 거르는 것(규칙 1)과 같은 차례로
//    교구 줄에서 뺀다(2026-09-30 옮겨 적기 검토 2). 안 빼면 옮겨 적은 어른 줄(소망 · 남성 / 소망 · 12)이 같은 목장의 아이 동명이인
//    때문에 「같은 소속에 같은 이름 2명」이 되어 「옮겨 적은 줄은 맞음」이 깨진다. 교회학교 줄은 그대로(아이가 그 줄의 사람이다).
//    사역 줄의 숫자 목장 갈래는 아이를 빼지 않는다(people-match.ts sameAffiliation ⚠️ — 친구에게 물을 일).
// cands — transcribedSame 에 그대로(이 이름의 명부 전체).
export function signupSame(row: SignupRow, cands: Cand[] | undefined): (c: Cand) => boolean {
  const a = applicantFromSignup({ who_type: row?.who_type, group_name: row?.group_name, sub_name: row?.sub_name, name: "" });
  const moved = transcribedSame(row, cands);
  return (c: Cand): boolean => (sameAffiliation(c, a) && !(a.type === "교구" && candKid(c))) || moved(c);
}

// 명단 줄의 교적 표시 — 후보(이 이름의 명부 전체)가 이미 있을 때 · 명부 색인에서 찾을 때(churchFor 의 null 규칙 그대로).
// evRoster·evRowChurch(index.ts)가 churchForSignup 을, 이름을 누르면 창(personOut basic)이 같은 식을 쓴다 — 창의 표시 = 명단의 표시.
export function signupChurch(cands: Cand[] | undefined, row: SignupRow & { name: string }): Church {
  return matchChurch(cands, applicantFromSignup(row), signupSame(row, cands));
}
export function churchForSignup(idx: Map<string, Cand[]> | null, row: SignupRow & { name: string }): Church | null {
  // 후보는 churchFor 가 찾는 것과 같은 열쇠(nameKey(이름))로 — transcribedSame 이 같은 교구 어른을 셀 목록
  return churchFor(idx, applicantFromSignup(row), signupSame(row, idx ? idx.get(nameKey(row?.name)) : undefined));
}

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

// 후보 차례와 고른 분 — 고른 분 맨 앞, 그다음 나머지 같은 소속(교인ID 차례), 그다음 나머지(교인ID 차례).
// pick 은 list 의 자리(늘 0 또는 null). 받은 배열은 바꾸지 않는다.
//   pool = 소속까지 같은 분(sameAffiliation · 성경필사 줄은 signupSame)이 하나라도 있으면 그분들, 없으면 같은 이름 전부
//   pool 이 한 분 → 그분 · 아니고 번호가 있으면 → pool 에서 명부 번호가 맞는 분이 정확히 한 분일 때 그분 · 그 밖 → null
// ⚠️ 번호가 없으면 옛 personPick 과 **같은 모양**이다(같은 소속 1 → 고름 · 같은 소속 0 이고 이름 전체 1 → 고름 · 그 밖 null) —
//    번호 단계를 더할 때 evPerson(성경필사)의 동작이 바뀌지 않게 했다. 시험(events-person.test.mjs)이 여러 경우를 맞대 본다.
//    2026-09-30 부터 「같은 소속」이 바뀌었다(「남성」 목장 · 성경필사의 옮겨 적은 줄·교구 줄의 아이 빼기) — 고르는 차례는 그대로다.
// ⚠️ 같은 소속이 있으면 번호도 **그 안에서만** 본다 — 같은 소속이 둘인데 번호가 소속 밖 한 분과 맞으면 고르지 않는다
//    (명단의 교적 표시가 「같은 소속에 같은 이름 N명」인데 창이 소속 다른 분을 여는 일이 없게).
// ⚠️ 목장을 확인할 줄(mokToConfirm — 99·빈칸, 그리고 교적 남성 목장에 없는 「화평 남성」)도 같다 — 같은 소속은 없지만
//    같은 교구 후보가 있으면 번호는 그분들 안에서만
//    (명단 표시 「목장 확인(같은 교구 N명)」인데 번호가 다른 교구 한 분과 맞았다고 그분을 열면, 표시가 가리키는 같은 교구 분이 창에서 사라진다 · 검토 1).
//    좁히는 것은 번호 단계뿐 — 「이름이 명부에 한 분뿐이면 그분」은 옛 규칙대로 같은 이름 전부로 본다(번호가 없을 때 옛 personPick 그대로).
// isSame — matchChurch 의 셋째 인자와 같은 것(성경필사 줄의 signupSame). 넘기지 않으면(ministryPerson) sameAffiliation 그대로.
export function personPickFor(cands: PersonCand[], a: Applicant, isSame?: (c: Cand) => boolean): { pick: 0 | null; list: PersonCand[] } {
  const all = [...(cands ?? [])].sort((x, y) => Number(x.person_id) - Number(y.person_id));
  const judge = isSame ?? ((k: Cand) => sameAffiliation(k, a));
  const same = all.filter((c) => judge(toCand(c)));
  const rest = all.filter((c) => !same.includes(c));
  const pool = same.length ? same : all;
  let chosen: PersonCand | null = pool.length === 1 ? pool[0] : null;
  const ph = phoneDigits(a?.phone);
  if (!chosen && ph) {
    const gu = !same.length && a && mokToConfirm(a) && a.gu ? all.filter((c) => toCand(c).mok1 === a.gu) : [];
    const hit = (gu.length ? gu : pool).filter((c) => toCand(c).phones.includes(ph));
    if (hit.length === 1) chosen = hit[0];
  }
  if (!chosen) return { pick: null, list: [...same, ...rest] };
  const c = chosen;
  return { pick: 0, list: [c, ...same.filter((x) => x !== c), ...rest.filter((x) => x !== c)] };
}

// 성경필사 명단 줄(구분·소속·세부 — 전화 없음)로 고르기. evPerson 이 부른다. 같은 소속은 명단 표시와 같은 signupSame.
export function personPick(cands: PersonCand[], ask: PersonAsk): { pick: 0 | null; list: PersonCand[] } {
  return personPickFor(cands, applicantFromSignup(ask), signupSame(ask, (cands ?? []).map(toCand)));
}

// 교인명부 역할에게 보이는 소속 한 줄 — 명단과 같은 꼴(affLabel · 「화평 20목장」·「소망 남성」·「중등부」).
// 옮겨 적는 규칙이 소속을 못 정한 분(새가족·임시교구 등)은 명부의 교구(또는 부서) 칸 그대로 — 교인명부 역할은 원래 보는 값이다.
export function personLabel(p: ChurchPerson): string {
  const a = mapChurchPerson(p);
  if (a) return affLabel(a);
  return txt(p?.mok1) || txt(p?.school_dept) || "(소속 없음)";
}

// 응답(ok 빼고) — 명시적 칸 지도로만. 고르지 못했으면 스무 분까지(evPeopleLookup 과 같은 상한) · total 은 자르기 전 수.
// ⚠️ phone_digits 는 어느 모양에도 싣지 않는다 — full 은 아래 네 칸, basic 은 lookupOut 다섯 칸 + 교적 표시 { state, reason }.
// ⚠️ basic 은 번호로 고르지 않는다(맨 위 「검토 4」) — 고르기엔 번호를 빼고 넘기고, 번호는 교적 표시(matchChurch)에만 쓴다.
//    인자로 받지 않고 full 에 묶는다 — 부르는 쪽이 넘기기를 잊어 basic 이 번호로 고르는 일이 없게.
// isSame — personPickFor·matchChurch 에 그대로(성경필사 personOut 만 넘긴다 · ministryPerson 은 넘기지 않는다).
export function personOutFor(cands: PersonCand[], a: Applicant, full: boolean, isSame?: (c: Cand) => boolean): PersonOut {
  const { pick, list } = personPickFor(cands, full ? a : { ...a, phone: "" }, isSame);
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
  // 교적 표시 — 명단(evRoster·ministryList·ministryPaper)과 같은 함수·같은 후보(이 이름의 명부 전체)로. 그래서 창의 표시와 명단의 표시가 같다.
  //   번호를 받았으면(ministryPerson) 명단과 똑같이 「소속 다름」까지 나온다 — 명단도 그 번호로 matchChurch 를 부른다.
  //   성경필사(personOut)는 isSame = signupSame — 명단의 churchForSignup(signupChurch)과 같은 식이다.
  return {
    mode: "basic", pick, total, people: shown.map((p) => lookupOut(p)),
    church: matchChurch((cands ?? []).map(toCand), a, isSame),
  };
}

// 성경필사 명단 줄로(evPerson) — 전화 없는 personOutFor + 성경필사 줄의 같은 소속(signupSame).
export function personOut(cands: PersonCand[], ask: PersonAsk, full: boolean): PersonOut {
  return personOutFor(cands, applicantFromSignup(ask), full, signupSame(ask, (cands ?? []).map(toCand)));
}

// ---------- 사역신청·담당자 — ministryPerson 의 맞대 볼 줄 · 기록(2026-09-30 검토 3·5) ----------
// ⚠️ 사역신청 줄에는 signupSame(transcribedSame)을 **쓰지 않는다**(옮겨 적기가 없는 줄 — 명단 ministryList·ministryPaper 도 쓰지 않는다).
// ⚠️ index.ts ministryPerson 은 이 둘만 부른다 — 받은 줄을 읽는 식(글루)을 순수 함수로 두어, 명단의 교적 표시가 쓰는 식
//    (ministryList: applicantFromWho(이름, who, 번호) · ministryPaperCheck: applicantFromPaper(줄))과 **같은 신청자**가 되는지
//    오프라인 시험(tests/person-link.test.mjs)이 화면의 rowAsk·paperAsk → 여기 → 명단 쪽 식으로 맞대 본다.
//    누가 who 판단이나 번호 다듬기를 바꾸면 그 시험이 잡는다(창의 표시와 명단의 표시가 조용히 갈라지지 않게).
// who(신청 현황·임명현황 줄의 「화평 20목장」·「중등부 3학년」)가 오면 applicantFromWho(ministryList 와 같은 함수),
// 없으면 구분·소속·세부(personAsk — 종이 명단: 교구·교구·목장 / 담당자: 교구·교구·목장 또는 교회학교·부서·학년).
// 번호는 숫자만 스무 자까지(명부 phone_digits 와 같은 꼴 · matchChurch 도 숫자만 맞댄다). name = readName 으로 검사한 이름.
export function ministryApplicant(b: unknown, name: string): Applicant {
  const o = (b && typeof b === "object" && !Array.isArray(b) ? b : {}) as Record<string, unknown>;
  const phone = phoneDigits(o.phone).slice(0, 20);
  const w = o.who;
  const who = typeof w === "string" ? w.normalize("NFC").trim().slice(0, 80) : "";
  return who ? applicantFromWho(name, who, phone) : { ...applicantFromSignup(personAsk(o, name)), phone };
}

// ministryPerson 의 기록(people.lookup) — null 이면 남기지 않는다. evPerson 과 같은 규칙에 두 가지를 더한다.
//   남기는 때: basic 이면 늘 · full 이면 고르지 못했을 때(pick null) · 그리고 full 이 **번호로** 한 분을 골랐을 때(byPhone).
//     번호로 고른 것은 명부 번호로 신원을 가린 것이다 — 그 뒤 「자세히」 창의 people.view 에는 번호로 가렸다는 사실이 없으니
//     여기 한 줄을 더 남긴다(두 줄이 되는 것은 이때뿐 · 소속으로 고른 한 분은 전처럼 people.view 한 줄).
//   모양: { q, count, from: "ministry" } + 번호로 골랐으면 byPhone: true — 납작하게 · **번호 자체는 싣지 않는다**.
//     from 은 「교인명부 기록」 화면(js/menus/system/audit.js)이 「명부 찾기(사역신청·담당자)」로 가르는 표(검토 5) — 없으면 성경필사.
//   byPhone 판정: 번호를 빼고 고르면 못 고르는데(pick null) 번호로 골랐다(pick 0) — 번호 단계가 고른 것이다(앞 단계는 번호와 무관).
export type MinistryLookupLog = { q: string; count: number; from: "ministry"; byPhone?: true };
export function ministryLookupLog(cands: PersonCand[], a: Applicant, out: PersonOut, q: string): MinistryLookupLog | null {
  const count = out.mode === "basic" ? out.people.length : out.candidates.length;
  const byPhone = out.mode === "full" && out.pick === 0 && personPickFor(cands, { ...a, phone: "" }).pick === null;
  if (out.mode === "full" && out.pick === 0 && !byPhone) return null;
  return { q, count, from: "ministry", ...(byPhone ? { byPhone: true as const } : {}) };
}
