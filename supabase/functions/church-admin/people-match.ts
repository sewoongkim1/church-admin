// 교인명부 — 사역신청 줄을 교적과 맞대는 규칙(순수 함수 · 2026-09-29)
//   서버(Deno, index.ts)와 시험(Node, tests/people-match.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum 금지, node --experimental-strip-types 가 그대로 읽는다).
// ⚠️ 사역 담당자에게는 { state, reason } 두 칸만 간다. 교적의 값(연락처·주소·생년월일·직분)은 이 모듈 밖으로 내보내지 않는다.

// 성경암송 앱 GU_LIST 와 같은 차례
export const MATCH_GU = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];

export const nameKey = (s: unknown): string => String(s ?? "").normalize("NFC").replace(/\s+/g, "");
export const phoneDigits = (s: unknown): string => String(s ?? "").replace(/\D/g, "");

// 소속 칸(교구·목장·부서) — 완성형으로, 앞뒤 빈칸 없이. 이름(nameKey)과 같은 까닭(맥에서 온 자모분리 · 2026-09-20 찬양대 NFC 사고)
const txt = (s: unknown): string => String(s ?? "").normalize("NFC").trim();

// 「기쁨-12목장」·「12」·「12목장」·「청년-03」 → 12·12·12·3 (끝에 붙은 수). 없으면 null.
// ⚠️ 「소망-남성1」도 1 이 나온다 — 교적 남성 목장의 번호일 뿐 「소망 1목장」이 아니다. 목장을 견줄 때는 candMen 을 먼저 본다(sameAffiliation).
export function mokNumber(s: unknown): number | null {
  const m = /(\d+)\s*(?:목장)?\s*$/.exec(String(s ?? "").trim());
  return m ? Number(m[1]) : null;
}

// kind2(장년·교회학교·학생 …)는 판정에만 쓴다 — 명부의 아이 가리기(candKid)와 성경필사 줄의 「옮겨 적은 줄」(events-person.ts transcribedSame).
//   맨 위 ⚠️ 그대로, 밖으로 내보내지 않는다.
export type Cand = { kind2: string; mok1: string; mok3: string; school_dept: string; phones: string[] };
// men — 신청 쪽 목장 칸에 「남성」이 적혔다(「소망 남성」·「남성목장」). 교회학교 줄은 늘 false.
export type Applicant = { type: "교구" | "교회학교"; gu: string; mok: number | null; men: boolean; bu: string; name: string; phone: string };
export type Church = { state: "맞음" | "확인 필요" | "없음"; reason: string };

export function toCand(r: any): Cand {
  return {
    kind2: txt(r?.kind2), mok1: txt(r?.mok1), mok3: txt(r?.mok3), school_dept: txt(r?.school_dept),
    phones: String(r?.phone_digits ?? "").split(/\s+/).filter(Boolean),
  };
}

// 신청 현황의 who — 「기쁨 12목장」(교구) · 「고등부 1학년」(교회학교). 목록 밖 교구라도 둘째 말이 「N목장」이면 교구로 본다.
export function applicantFromWho(name: unknown, who: unknown, phone: unknown): Applicant {
  const parts = txt(who).split(/\s+/).filter(Boolean);
  const head = parts[0] ?? "";
  const n = String(name ?? ""), p = String(phone ?? "");
  if (MATCH_GU.includes(head) || /목장$/.test(parts[1] ?? "")) {
    const rest = parts.slice(1).join("");
    return { type: "교구", gu: head, mok: mokNumber(rest), men: /남성/.test(rest), bu: "", name: n, phone: p };
  }
  return { type: "교회학교", gu: "", mok: null, men: false, bu: head, name: n, phone: p };
}

export function applicantFromPaper(r: any): Applicant {
  const mok = txt(r?.mok);
  return { type: "교구", gu: txt(r?.gu), mok: mokNumber(mok), men: /남성/.test(mok), bu: "", name: String(r?.name ?? ""), phone: String(r?.phone ?? "") };
}

// 성경필사(암송) 명단 줄(event_signups · 2026-09-29) — 교구는 group_name·sub_name(목장 숫자 글자 · 「남성」), 교회학교는 부서.
// 전화는 넣지 않는다(이 기능은 phone 칸을 쓰지 않는다) — 그래서 「소속 다름」 대신 「같은 이름 N명」으로 간다.
// 「남성」은 men(교적 남성 목장과 맞댄다 · 아래 sameAffiliation) · 빈 목장·99 는 mok 이 null·99 라 mokUnknown 이 「목장 확인」으로 돌린다.
export function applicantFromSignup(r: { who_type: string; group_name: string; sub_name: string; name: string }): Applicant {
  const name = String(r?.name ?? "");
  if (txt(r?.who_type) === "교회학교") return { type: "교회학교", gu: "", mok: null, men: false, bu: txt(r?.group_name), name, phone: "" };
  const sub = txt(r?.sub_name);
  return { type: "교구", gu: txt(r?.group_name), mok: mokNumber(sub), men: /남성/.test(sub), bu: "", name, phone: "" };
}

// 앱 로그인은 목장으로 숫자나 「남성」만 받고, 목장이 없으면 99 를 쓴다(성경암송 app.js MOK_RE).
// 99·빈 목장은 명부 목장 번호가 아니다 — 목장을 모르는 신청이다(새가족 제외).
// ⚠️ 교구만 맞다고 「맞음」으로 치지 않는다(같은 교구 다른 목장의 동명이인일 수 있다). matchChurch 가 「목장 확인」으로 돌린다.
// 「남성」은 이제 「아는 목장」이다(2026-09-30 친구 제보 — 교적에 한 분뿐인 「소망-남성1」 분이 「목장 확인(같은 교구 1명)」으로 떴다).
//   교적 목장 칸에 「남성」이 든 분(candMen)과 맞댄다. 운영 교적의 남성 목장 칸 표기(2026-09-30 친구 허락으로 센 것):
//   「믿음-남성」·「사랑-남성」·「섬김-남성」·「소망-남성1」·「소망-남성2」·「은혜-남성목장」·「화평-남성」(기쁨엔 없다) —
//   꼴이 제각각이라 글자로 견주지 않고 「남성」이 들었는지만 본다. 신청 쪽에 번호까지 있으면(「남성2」) 번호도 같아야.
// ⚠️ 명단·앱 계정의 목장은 「남성」 그대로 적는다(앱 로그인·계정 잇기 열쇠가 「남성」이다) — 고친 것은 표시 규칙뿐이다.
export const NO_MOK = 99;
export const mokUnknown = (a: Applicant): boolean =>
  a.type === "교구" && a.gu !== "새가족" && !a.men && (a.mok === null || a.mok === NO_MOK);

// 교적 목장 칸에 「남성」이 든 분 — 「소망-남성1」·「은혜-남성목장」 모두.
export const candMen = (c: Cand): boolean => /남성/.test(c.mok3);

// 명부의 아이(kind2 교회학교·학생) — events-people.ts KID_KIND2 와 **같은 목록**이다(그쪽은 이 파일을 import 하므로 거꾸로 들이지 않는다 ·
//   tests/people-match.test.mjs 가 mapChurchPerson 의 규칙 1 과 맞대 본다).
// ⚠️ 명부에는 아이도 가족의 교구·목장(mok1·mok3)이 있다(events-people.ts ⚠️ · 2026-09-29 135줄) — 「소망-남성1」 목장 칸의 아이는
//    그 목장 아버지의 아이일 뿐 「소망 남성」 줄의 어른이 아니다. 저장소도 교구 줄과 명부의 아이를 다른 사람으로 본다(fillDecision kid-adult).
export const KID_KIND2 = ["교회학교", "학생"];
export const candKid = (c: Cand): boolean => KID_KIND2.includes(c.kind2);

// 같은 소속이 없을 때 같은 교구 후보 수로 「목장 확인(같은 교구 N명)」을 낼 줄 — 목장을 모르거나(99·빈칸),
// 「남성」이라 적었는데 교적 남성 목장에 같은 이름이 없는 분(교적은 숫자 목장 — 사실대로 「목장 확인」).
// matchChurch 와 events-person.ts personPickFor(번호를 같은 교구 안에서만 보는 단계)가 **같은 함수**로 판정한다.
export const mokToConfirm = (a: Applicant): boolean =>
  mokUnknown(a) || (a.type === "교구" && a.gu !== "새가족" && !!a.men);

export function sameAffiliation(c: Cand, a: Applicant): boolean {
  if (a.type === "교구") {
    if (!a.gu || c.mok1 !== a.gu) return false;
    if (a.gu === "새가족") return true;              // 새가족의 명부 목장 칸은 연도·월이다 — 교구만 본다
    // 남성 목장의 아이(candKid)는 빼고 센다 — 가족 목장 칸이 「소망-남성1」인 아이가 「소망 남성」 줄과 「맞음」이 되던 틈(2026-09-30 옮겨 적기 검토 4).
    //   이 갈래는 2026-09-30 에 새로 연 것이라 사역 줄에도 넣는다 — 아이뿐이면 이 갈래를 열기 전 결과(「목장 확인(같은 교구 N명)」)로 돌아간다.
    // ⚠️ 숫자 목장·새가족 갈래는 아이를 빼지 **않는다** — 사역 줄(ministryList·ministryPaper·ministryPerson) 표시가 함께 바뀌는
    //    오래된 동작이라 친구에게 묻기 전엔 그대로 둔다. 성경필사 줄은 events-person.ts signupSame 이 교구 갈래 모두에서 아이를 뺀다.
    if (a.men) return !candKid(c) && candMen(c) && (a.mok === null || mokNumber(c.mok3) === a.mok);
    if (mokUnknown(a)) return false;
    // ⚠️ 숫자 목장은 교적 남성 목장과 맞대지 않는다 — mokNumber("소망-남성1") = 1 이라 「소망 1목장」 신청의 동명이인이
    //    남성1 목장 분이면 같은 소속으로 잘못 셌다(2026-09-30 바로잡음).
    return !candMen(c) && mokNumber(c.mok3) === a.mok;
  }
  return !!a.bu && (c.school_dept === a.bu || c.mok1 === a.bu);   // 청년부는 명부의 목장 첫 칸에 있다
}

// isSame — 부르는 쪽이 「같은 소속」 판정을 **통째로** 줄 때(성경필사 줄 · events-person.ts signupSame — 교구 줄에서 아이를 빼고
//   「옮겨 적은 줄」을 더한다). 사역신청 줄은 넘기지 않는다. 넘기지 않으면 sameAffiliation 그대로.
//   (2026-09-30 처음엔 「더할 분」 more 였다 — 아이를 **빼야** 해서(옮겨 적기 검토 2) 판정 전체를 받게 바꿨다.)
// ⚠️ 뒤 단계(「목장 확인(같은 교구 N명)」·「소속 다름」·「같은 이름 N명」)는 isSame 과 상관없이 같은 식이다 — N 은 이 이름의 명부 전체에서 센다.
export function matchChurch(cands: Cand[] | undefined, a: Applicant, isSame?: (c: Cand) => boolean): Church {
  const list = cands ?? [];
  if (!list.length) return { state: "없음", reason: "" };
  const same = list.filter(isSame ?? ((c: Cand) => sameAffiliation(c, a)));
  if (same.length === 1) return { state: "맞음", reason: "" };
  if (same.length > 1) return { state: "확인 필요", reason: `같은 소속에 같은 이름 ${same.length}명` };
  // 목장을 모르는 신청(99·빈칸)·교적 남성 목장에 없는 「남성」 신청 — 전화가 같다고 「소속 다름」이라 하면 사실이 아니다.
  // 같은 교구 후보를 먼저 센다(mokToConfirm).
  if (mokToConfirm(a) && a.gu) {
    const gu = list.filter((c) => c.mok1 === a.gu).length;
    if (gu > 0) return { state: "확인 필요", reason: `목장 확인(같은 교구 ${gu}명)` };
  }
  const ph = phoneDigits(a.phone);
  if (ph && list.some((c) => c.phones.includes(ph))) return { state: "확인 필요", reason: "소속 다름" };
  return { state: "확인 필요", reason: `같은 이름 ${list.length}명` };
}

// supabase-js .in() 은 " \ 를 이스케이프하지 않고 , ( ) 는 감싸기만 한다(authz.parseIdentity 참고) — 그런 이름은 묻지 않는다
export const LOOKUP_BAD = /["\\,()]/;
export const lookupKeys = (names: unknown[]): string[] =>
  [...new Set(names.map(nameKey).filter((k) => k && !LOOKUP_BAD.test(k)))];

// 명부가 없거나(null) 물을 수 없는 이름이면 null — 화면은 표시를 그리지 않는다(「교적 없음」은 사실이 아닐 수 있다)
// isSame 은 matchChurch 로 그대로 흘린다(성경필사 줄 — events-person.ts churchForSignup).
export function churchFor(idx: Map<string, Cand[]> | null, a: Applicant, isSame?: (c: Cand) => boolean): Church | null {
  if (!idx) return null;
  const k = nameKey(a.name);
  if (!k || LOOKUP_BAD.test(k)) return null;
  return matchChurch(idx.get(k), a, isSame);
}

// ── 성경암송 앱 로그인으로 교인 한 분 찾기(사역 이력 확인 · 2026-10-01) ──
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §3
//   교구 = 교구 + 목장 + 이름, 교회학교 = 부서 + 이름 — sameAffiliation 그대로(교적 표시 「맞음」과 같은 기준 · 친구 결정).
//   같은 소속에 그 이름이 딱 한 분일 때만 그분. why 는 서버 안에서만 쓴다 — 화면엔 「찾지 못했어요」 하나(동명이인이 있다는 것을 알리지 않는다).
// ⚠️ 이 파일의 sameAffiliation·mokNumber 를 고치면 성경암송 앱의 「사역 이력 확인」도 함께 바뀐다(그래서 규칙을 여기 둔다).
export type LoginWho = { type: string; gu: string; mok: string; bu: string; grade: string; name: string };

// 앱 로그인(users 줄) → 신청자 모양. 성경필사 명단 줄과 같은 읽기(목장 「12」·「남성」·「99」).
export function applicantFromLogin(w: LoginWho): Applicant {
  const school = txt(w?.type) === "교회학교";
  return applicantFromSignup({
    who_type: school ? "교회학교" : "교구",
    group_name: school ? String(w?.bu ?? "") : String(w?.gu ?? ""),
    sub_name: school ? "" : String(w?.mok ?? ""),
    name: String(w?.name ?? ""),
  });
}

// 명부에 물을 이름 열쇠 — 비었거나 물을 수 없는 글자(LOOKUP_BAD)면 null(그 이름은 찾지 않는다)
export function loginNameKey(w: LoginWho): string | null {
  const k = nameKey(w?.name);
  return k && !LOOKUP_BAD.test(k) ? k : null;
}

// rows = 명부에서 같은 이름(name_key)으로 가져온 줄 { person_id, kind2, mok1, mok3, school_dept }
export function matchLoginPerson(rows: any[] | undefined, w: LoginWho): { personId: number | null; why: "" | "없음" | "여럿" } {
  const a = applicantFromLogin(w);
  const same = (rows ?? []).filter((r) => sameAffiliation(toCand(r), a));
  if (same.length === 1) return { personId: Number(same[0].person_id), why: "" };
  return { personId: null, why: same.length ? "여럿" : "없음" };
}
