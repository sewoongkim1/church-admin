// 성경필사(암송) — 교인명부 한 분을 이벤트 줄 모양으로 옮겨 적기 · 빈칸 채우기 판정(순수 함수 · 2026-09-29)
//   설계: 성경암송 저장소 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md §2
//   「교인명부 → 이벤트 줄로 옮겨 적는 규칙」 — 2026-09-29 일괄 맞추기에서 **한 번 틀리고 바로잡은 규칙** 그대로.
//   서버(Deno, index.ts)와 시험(Node, tests/events-people.test.mjs)이 **같은 파일**을 읽는다(authz.ts 와 같은 제약).
//
// ⚠️ people-match.ts 는 「교적 값은 모듈 밖으로 내보내지 않는다」가 원칙이다. 이 모듈은 친구 결정(설계 §0 「교인명부 쓰기」)으로
//    그 원칙을 **다섯 칸에 한해** 넓힌 자리다 — 이름·구분·소속·세부·직분(한 분 더하기 찾기 후보에만 교적 목장 칸 하나 더 —
//    churchMok · 2026-09-30 친구 요청). 연락처·주소·생년월일·사진·가족·교인ID 는
//    ChurchPerson 에 아예 없다(서버도 이 칸들만 select 한다).
import { BE_GU } from "./events-rules.ts";
import { legacyNorm } from "./paper.ts";
import { mokNumber } from "./people-match.ts";

export type ChurchPerson = { name_key: string; kind2: string; mok1: string; mok3: string;
  school_dept: string; position: string; position_detail: string };
export type Affil = { who_type: "교구" | "교회학교"; group_name: string; sub_name: string };

// 교적 칸 — 완성형으로, 앞뒤 빈칸 없이(명부 원본에 자모분리·빈칸이 섞여 온다 · people-match.ts 와 같은 까닭)
const txt = (s: unknown): string => legacyNorm(String(s ?? "").normalize("NFC"));

const GU7 = BE_GU.filter((g) => g !== "새가족");               // 명부의 새가족 목장 칸은 연도·월이다 — 소속을 정하지 않는다
const YOUTH_MOK1 = ["청년부", "청년공동체", "청년새가족"];
const KID_KIND2 = ["교회학교", "학생"];
const POS_PREFIX = ["명예", "은퇴", "원로"];

// 규칙 1~4 — 차례가 규칙이다.
//   1. kind2 교회학교·학생 → 교회학교 · school_dept(없으면 소속을 정하지 않는다)
//      ⚠️ 명부에는 **아이도 가족의 교구·목장(mok1·mok3)이 있다** — 이것을 먼저 보면 아이가 부모 목장으로 간다(2026-09-29 135줄).
//   2. mok1 이 7교구 → 교구 · 목장 = mok3 끝 숫자(「소망-남성1」처럼 「남성」이 들어 있으면 남성 · 둘 다 없으면 비움)
//   3. mok1 청년부·청년공동체·청년새가족 → 교회학교 청년부
//   4. 그 밖에 school_dept 가 있으면 → 교회학교 그 부서. 없으면 null(새가족·임시교구 등)
export function mapChurchPerson(p: ChurchPerson): Affil | null {
  const kind2 = txt(p?.kind2), mok1 = txt(p?.mok1), mok3 = txt(p?.mok3), dept = txt(p?.school_dept);
  if (KID_KIND2.includes(kind2)) return dept ? { who_type: "교회학교", group_name: dept, sub_name: "" } : null;
  if (GU7.includes(mok1)) {
    const n = mokNumber(mok3);
    const sub = /남성/.test(mok3) ? "남성" : n === null ? "" : String(n);
    return { who_type: "교구", group_name: mok1, sub_name: sub };
  }
  if (YOUTH_MOK1.includes(mok1)) return { who_type: "교회학교", group_name: "청년부", sub_name: "" };
  if (dept) return { who_type: "교회학교", group_name: dept, sub_name: "" };
  return null;
}

// 규칙 5 — 직분 = position(대분류) 앞에 position_detail 의 명예·은퇴·원로를 붙인다.
//   서리·시무·협동·이명은 뗀다: 은퇴협동권사 → 은퇴권사 · 서리집사은퇴 → 은퇴집사 · 시무장로 → 장로. position 이 비면 "".
export function positionFromChurch(p: ChurchPerson): string {
  const pos = txt(p?.position);
  if (!pos) return "";
  const detail = txt(p?.position_detail);
  const pre = POS_PREFIX.find((x) => detail.includes(x));
  return pre && !pos.startsWith(pre) ? pre + pos : pos;
}

// evPeopleLookup 한 줄 — **다섯 칸만**(이름·구분·소속·세부·직분). 소속을 못 정하면 세 칸이 빈 글자.
// ⚠️ 스프레드(...p)를 쓰지 않는다 — name_key·kind2·mok3·position_detail 같은 원래 칸이 따라 나가지 않게.
// ⚠️ 응답 칸 이름은 group·sub 다(CONTRACT §2) — Task 8 이 칸 지도로 옮겨 적는다(스프레드 금지).
export function lookupView(p: ChurchPerson, name: string):
  { name: string; who_type: string; group_name: string; sub_name: string; position: string } {
  const a = mapChurchPerson(p);
  return {
    name: legacyNorm(name),
    who_type: a ? a.who_type : "",
    group_name: a ? a.group_name : "",
    sub_name: a ? a.sub_name : "",
    position: positionFromChurch(p),
  };
}

// 교적 목장 칸 그대로(2026-09-30 친구 요청) — **한 분 더하기 찾기 후보(evPeopleLookup)에만** 싣는다(events-upload.ts lookupCandOut).
//   소망은 남성1·남성2 목장이 있는데 옮겨 적으면(규칙 2) 둘 다 「남성」이라 같은 이름 두 분을 후보에서 가려내지 못한다.
//   교구 분(mapChurchPerson 이 교구로 보내는 분 — 같은 판정을 쓰려고 그 함수를 부른다)은 mok3 그대로(「소망-남성1」 · 숫자로 바꾸지 않는다).
//   그 밖(아이·청년·새가족·임시교구)은 school_dept, 없으면 mok1 — 아이의 가족 교구 목장(mok3)은 싣지 않는다(규칙 1).
//   없으면 "". 다듬기는 다른 칸과 같다(완성형 · 앞뒤 빈칸).
export function churchMok(p: ChurchPerson): string {
  const a = mapChurchPerson(p);
  if (a && a.who_type === "교구") return txt(p?.mok3);
  return txt(p?.school_dept) || txt(p?.mok1);
}

// ============================================================================
// 빈칸 채우기(올리기의 「□ 빈칸은 교인명부로 채우기」 · 설계 §2 · CONTRACT §5 「빈칸 채우기 보강」)
// ============================================================================
export type FillReason = "filled" | "not-in-directory" | "same-name" | "no-affiliation" | "different-affiliation"
  | "kid-adult" | "youth-parish" | "nothing-blank";

const KID_POSITIONS = ["학생", "어린이"];

// 적힌 소속과 견줄 명부 소속 — mapChurchPerson 이 정한 것. 못 정했어도 명부 교구 칸이 「새가족」이면 교구 새가족으로 본다
// (새가족의 목장 칸은 연도·월이라 **채우지는** 않지만, 명단에 「새가족」이라 적힌 분과 같은 소속인지는 견줄 수 있다).
function dirAffil(c: ChurchPerson): { who_type: string; group_name: string } | null {
  const a = mapChurchPerson(c);
  if (a) return a;
  return txt(c?.mok1) === "새가족" ? { who_type: "교구", group_name: "새가족" } : null;
}

// cands = 교인명부에서 **이름(name_key)이 같은** 분 모두(서버가 찾아 넘긴다). row 는 다듬은 뒤의 줄
// (올리기에서 교구 칸이 비었던 줄은 who_type 이 "" 일 수 있다 — 빈칸으로 본다).
//   · 명부 전체에서 한 분일 때만 채운다(둘 이상 → same-name · 없으면 not-in-directory).
//     소속이 적힌 줄의 same-name 을 그대로 넣을지(add)는 부르는 쪽(Task 8)이 정한다 — 여기서는 「채우지 않는다」만.
//   · 다른 사람으로 보고 채우지 않는 것(kid-adult · youth-parish):
//     명단은 아이(교회학교 부서 · 직분 학생·어린이 · 교회학교인데 부서 빈칸)인데 명부는 어른 /
//     명단은 교구 줄인데 명부는 교회학교 아이 / 명단은 청년부인데 명부는 교구(가족 교구일 수 있다 — 청년부를 둔다).
//   · 소속이 **비었으면**: 구분·소속·세부(목장) **세 칸을 한 벌로** 명부 값으로 — 적혀 있던 목장은 버린다(다른 교구의 번호일 수 있다).
//     patch 에 who_type·group_name·sub_name 이 늘 함께 있다(sub_name 은 "" 일 수 있다 — 부르는 쪽은 그대로 얹고,
//     적힌 목장과 다르면 「적힌 목장 N 대신 교인명부 목장」을 알린다 · Task 8).
//     명부도 소속을 못 정하면(새가족·임시교구·부서 없는 아이) no-affiliation — 직분만 채우지 않는다(어차피 넣을 수 없는 줄).
//   · 소속이 **적혀 있으면**: 명부 소속(구분·교구/부서)과 같을 때만 빈 목장(교구 줄)·빈 직분을 채운다.
//     다르면 different-affiliation · 명부가 소속을 못 정하면 no-affiliation — 둘 다 **아무것도 채우지 않는다**
//     (같은 이름의 다른 분일 수 있다 — 직분 하나라도 남의 것을 얹지 않는다).
// patch 에 name 은 절대 담지 않는다.
export function fillDecision(
  row: { who_type?: string; group_name?: string; sub_name?: string; name: string; position?: string },
  cands: ChurchPerson[],
): { patch: Partial<Affil & { position: string }> | null; reason: FillReason } {
  if (!cands || cands.length === 0) return { patch: null, reason: "not-in-directory" };
  if (cands.length > 1) return { patch: null, reason: "same-name" };
  const c = cands[0];
  const a = mapChurchPerson(c);
  const pos = positionFromChurch(c);
  const who = legacyNorm(row.who_type), group = txt(row.group_name), sub = txt(row.sub_name), rpos = txt(row.position);

  const dirKid = KID_KIND2.includes(txt(c?.kind2));
  const rowKid = (who === "교회학교" && group !== "" && group !== "청년부") || KID_POSITIONS.includes(rpos);
  const rowSchoolBlank = who === "교회학교" && group === "";
  const rowParish = who === "교구" && group !== "";
  if ((rowKid && !dirKid) || (rowParish && dirKid) || (rowSchoolBlank && a !== null && a.who_type === "교구")) {
    return { patch: null, reason: "kid-adult" };
  }
  if (who === "교회학교" && group === "청년부" && a !== null && a.who_type === "교구") return { patch: null, reason: "youth-parish" };

  const patch: Partial<Affil & { position: string }> = {};
  if (!group) {
    if (!a) return { patch: null, reason: "no-affiliation" };
    patch.who_type = a.who_type;                       // 소속 한 벌 — 교구를 명부로 정했으면 목장도 명부 것
    patch.group_name = a.group_name;
    patch.sub_name = a.sub_name;
  } else {
    const d = dirAffil(c);
    if (!d) return { patch: null, reason: "no-affiliation" };
    if ((who && who !== d.who_type) || group !== d.group_name) return { patch: null, reason: "different-affiliation" };
    if (who === "교구" && !sub && a !== null && a.sub_name) patch.sub_name = a.sub_name;   // 같은 교구일 때만 빈 목장을
  }
  if (!rpos && pos) patch.position = pos;
  if (Object.keys(patch).length === 0) return { patch: null, reason: "nothing-blank" };
  return { patch, reason: "filled" };
}
