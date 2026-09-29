// 교인명부 — 사역신청 줄을 교적과 맞대는 규칙(순수 함수 · 2026-09-29)
//   서버(Deno, index.ts)와 시험(Node, tests/people-match.test.mjs)이 **같은 파일**을 읽는다 —
//   authz.ts 와 같은 제약(원격 import·enum 금지, node --experimental-strip-types 가 그대로 읽는다).
// ⚠️ 사역 담당자에게는 { state, reason } 두 칸만 간다. 교적의 값(연락처·주소·생년월일·직분)은 이 모듈 밖으로 내보내지 않는다.

// 성경암송 앱 GU_LIST 와 같은 차례
export const MATCH_GU = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];

export const nameKey = (s: unknown): string => String(s ?? "").normalize("NFC").replace(/\s+/g, "");
export const phoneDigits = (s: unknown): string => String(s ?? "").replace(/\D/g, "");

// 「기쁨-12목장」·「12」·「12목장」·「청년-03」 → 12·12·12·3 (끝에 붙은 수). 없으면 null.
export function mokNumber(s: unknown): number | null {
  const m = /(\d+)\s*(?:목장)?\s*$/.exec(String(s ?? "").trim());
  return m ? Number(m[1]) : null;
}

export type Cand = { mok1: string; mok3: string; school_dept: string; phones: string[] };
export type Applicant = { type: "교구" | "교회학교"; gu: string; mok: number | null; bu: string; name: string; phone: string };
export type Church = { state: "맞음" | "확인 필요" | "없음"; reason: string };

export function toCand(r: any): Cand {
  return {
    mok1: String(r?.mok1 ?? ""), mok3: String(r?.mok3 ?? ""), school_dept: String(r?.school_dept ?? ""),
    phones: String(r?.phone_digits ?? "").split(/\s+/).filter(Boolean),
  };
}

// 신청 현황의 who — 「기쁨 12목장」(교구) · 「고등부 1학년」(교회학교). 목록 밖 교구라도 둘째 말이 「N목장」이면 교구로 본다.
export function applicantFromWho(name: unknown, who: unknown, phone: unknown): Applicant {
  const parts = String(who ?? "").trim().split(/\s+/).filter(Boolean);
  const head = parts[0] ?? "";
  const n = String(name ?? ""), p = String(phone ?? "");
  if (MATCH_GU.includes(head) || /목장$/.test(parts[1] ?? "")) {
    return { type: "교구", gu: head, mok: mokNumber(parts.slice(1).join("")), bu: "", name: n, phone: p };
  }
  return { type: "교회학교", gu: "", mok: null, bu: head, name: n, phone: p };
}

export function applicantFromPaper(r: any): Applicant {
  return { type: "교구", gu: String(r?.gu ?? ""), mok: mokNumber(r?.mok), bu: "", name: String(r?.name ?? ""), phone: String(r?.phone ?? "") };
}

export function sameAffiliation(c: Cand, a: Applicant): boolean {
  if (a.type === "교구") {
    if (!a.gu || c.mok1 !== a.gu) return false;
    if (a.gu === "새가족") return true;              // 새가족의 명부 목장 칸은 연도·월이다 — 교구만 본다
    return a.mok !== null && mokNumber(c.mok3) === a.mok;
  }
  return !!a.bu && (c.school_dept === a.bu || c.mok1 === a.bu);   // 청년부는 명부의 목장 첫 칸에 있다
}

export function matchChurch(cands: Cand[] | undefined, a: Applicant): Church {
  const list = cands ?? [];
  if (!list.length) return { state: "없음", reason: "" };
  const same = list.filter((c) => sameAffiliation(c, a));
  if (same.length === 1) return { state: "맞음", reason: "" };
  if (same.length > 1) return { state: "확인 필요", reason: `같은 소속에 같은 이름 ${same.length}명` };
  const ph = phoneDigits(a.phone);
  if (ph && list.some((c) => c.phones.includes(ph))) return { state: "확인 필요", reason: "소속 다름" };
  return { state: "확인 필요", reason: `같은 이름 ${list.length}명` };
}

// supabase-js .in() 은 " \ 를 이스케이프하지 않고 , ( ) 는 감싸기만 한다(authz.parseIdentity 참고) — 그런 이름은 묻지 않는다
export const LOOKUP_BAD = /["\\,()]/;
export const lookupKeys = (names: unknown[]): string[] =>
  [...new Set(names.map(nameKey).filter((k) => k && !LOOKUP_BAD.test(k)))];

// 명부가 없거나(null) 물을 수 없는 이름이면 null — 화면은 표시를 그리지 않는다(「교적 없음」은 사실이 아닐 수 있다)
export function churchFor(idx: Map<string, Cand[]> | null, a: Applicant): Church | null {
  if (!idx) return null;
  const k = nameKey(a.name);
  if (!k || LOOKUP_BAD.test(k)) return null;
  return matchChurch(idx.get(k), a);
}
