// 사역신청 종이(오프라인) 명단 올리기 — 상태 별칭·날짜·계정 키(로그인과 같은 규칙)·전화·직분,
// 줄 하나 겉모양 검사(ministryPaperOne). 성경암송 api(supabase/functions/api/index.ts) 의
// 동명 헬퍼를 글자 그대로 옮겨 왔다(2026-09-29 · 원문 docs/port/ministry-paper-legacy.md
// 1.2·1.6·1.7·1.8·1.9·1.10·1.11).
// 서버(Deno, index.ts)와 시험(Node, tests/paper.test.mjs)이 함께 읽는다 —
// authz.ts·ministry.ts·catalog.ts 와 같은 제약(원격 import·enum 금지, node --experimental-strip-types
// 가 그대로 읽는다).
//
// ⚠️ 아래 legacyNorm/appIdentityKey 는 **완성형(NFC)으로 바꾸지 않는다** — authz.ts 의 norm/identityKey
//    와는 다른 규칙이다. 종이 명단이 계정을 찾거나 만드는 길(member_login RPC)은 성경암송 앱의 로그인과
//    **글자 그대로 같은 identity_key**를 만들어야 같은 사람으로 이어진다. 여기서 NFC 로 바꾸면 맥에서
//    온 자모분리(NFD) 이름을 앱 로그인과 다른 키로 만들어 딴 사람 계정이 생긴다
//    (2026-09-20 찬양대 NFC/NFD 사고와 같은 자리 — 다만 이번엔 "맞추면 안 되는" 반대 방향).

// ============================================================================
// 1.2 공용 헬퍼 — legacyNorm(원문 norm) / appIdentityKey(원문 identityKey)
// ============================================================================
export const legacyNorm = (s: unknown): string => (s ?? "").toString().trim().replace(/\s+/g, " ");

// appIdentityKey 는 앱 로그인이 계정을 찾을 때 쓰는 것과 **완전히 같은 식**이다 — 종이 명단도 이
// 식으로 계정을 맞대 봐야 나중에 그 성도가 앱에 로그인했을 때 같은 사람으로 이어진다.
export const appIdentityKey = (u: any): string =>
  [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(legacyNorm).join("|");

// ============================================================================
// 1.6 전화번호 정규화 — PILSA_PHONE_RE / pilsaPhone(필사 신청과 공유하는 규칙)
// ============================================================================
// ⚠️ 이름은 PILSA_*(필사 노트 신청)지만 사역신청이 따로 만들지 않고 그대로 가져다 쓴다 —
//    따로 만들면 한쪽만 고치게 된다(원문 index.ts:4096-4097 주석).
export const PILSA_PHONE_RE = /^01[016-9]-?[0-9]{3,4}-?[0-9]{4}$/;

// 010-1234-5678 꼴로 통일 — 명단에서 전화 걸기 좋게
export function pilsaPhone(v: unknown): string {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  if (d.length === 11) return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  if (d.length === 10) return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
  return String(v ?? "").trim();
}

// ============================================================================
// 1.7 직분 허용 목록 — MIN_POSITIONS
// ============================================================================
// 직분 — 고른 것만 받는다. 자유 입력이면 「집사님」·「집사 」가 섞여 교적 대조가 도로 사람 손일이
// 된다(그러라고 받는 값이 아니다).
// ⚠️⚠️ 이 목록은 **이제 네 곳**이다 — ① 성경암송 app.js MIN_POSITIONS ② 성경암송 api(index.ts)
//    서버 allowlist ③ DB CHECK(ministry_orders_position_chk) ④ 여기(church-admin paper.ts).
//    값을 더하려면 **넷 다** 고쳐야 하고, 순서는 **CHECK 가 먼저**다(「허용 목록은 여러 곳」 사고 —
//    ①②만 고치면 화면은 열리는데 저장이 500 으로 막히고, ③만 고치면 값은 들어가도 화면에 안 뜬다).
export const MIN_POSITIONS = new Set(
  ["성도", "집사", "권사", "안수집사", "장로", "전도사", "목사", "사모", "학생"]);

// ============================================================================
// 1.8 종이 명단 전용 상수 — PAPER_MAX_ROWS / PAPER_ALIAS / paperName
// ============================================================================
// ⚠️ 죽은 상수 PAPER_STATUS(원문 index.ts) 는 옮기지 않는다 — 실제 유효성은 PAPER_ALIAS 에 키가
//    있는지로 판정하고, PAPER_STATUS 는 원문에서도 정의만 되고 참조되지 않는다(원문 발견 사항).
export const PAPER_MAX_ROWS = 300;

// 줄에 적은 상태 — 「임명」·「임명확정」 둘 다 받는다(엑셀에는 짧게 적으신다)
export const PAPER_ALIAS: Record<string, string> = {
  "임명": "임명확정", "임명확정": "임명확정", "확정": "임명확정",
  "취소": "취소", "신청": "신청완료", "신청완료": "신청완료",
  "접수": "접수완료", "접수완료": "접수완료",
};

// 담당자 화면이 쓰는 짧은 이름 — 창과 목록이 「임명」인데 여기만 「임명확정」이면 따로 논다
export const paperName = (st: string): string =>
  st === "임명확정" ? "임명" : st === "신청완료" ? "신청" : st === "접수완료" ? "접수" : st;

// ============================================================================
// 1.9 날짜 파싱 — paperDay
// ============================================================================
// 종이에 적힌 날짜 한 칸 — 「2026-12-15」·「2026.12.15」·「2026. 12. 15.」 다 받는다.
// ⚠️ 한국 날짜로 읽는다(자정 +09:00) — UTC 로 읽으면 하루가 밀린다.
export function paperDay(v: unknown): { v: string | null; err?: string } {
  const t = legacyNorm(v);
  if (!t) return { v: null };
  const m = /^(\d{4})[.\-\/\s]+(\d{1,2})[.\-\/\s]+(\d{1,2})\.?$/.exec(t);
  if (!m) return { v: null, err: "날짜는 2026-12-15 꼴로 적어 주세요" };
  const iso = m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") + "T00:00:00+09:00";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { v: null, err: "날짜를 확인해 주세요 (" + t + ")" };
  return { v: d.toISOString() };
}

// ============================================================================
// 1.10 계정 키 후보 — ministryPaperKeys
// ============================================================================
// 목장을 「20」·「20목장」 두 표기 모두로 identity_key 를 만들어 본다 — 적은 표기가 사람마다 달라도
// 같은 계정을 찾을 수 있게(교구/목장 로그인만 지원 — 교회학교 부서·학년 표기는 이 헬퍼에 없다).
export function ministryPaperKeys(gu: string, mok: string, name: string): string[] {
  const m = legacyNorm(mok);
  const out = new Set<string>();
  for (const one of [m, m.replace(/목장$/, "")]) {
    out.add(appIdentityKey({ type: "교구", gu, mok: one, bu: "", grade: "", name }));
  }
  return [...out];
}

// ============================================================================
// 1.11 줄 하나 겉모양 검사 — ministryPaperOne
// ============================================================================
// 줄 하나의 겉모양을 살핀다 — 되돌려주는 말은 화면이 그대로 보여 준다.
// ⚠️ 여기서는 사역팀 매칭·계정 조회·상한 검사(원문 1.12 ministryPaper 소관)를 하지 않는다 —
//    out.ok 는 이 함수 안에서는 항상 false 로 남는다(뒤 단계가 통과시켜야 true 가 된다). 검증 순서
//    (첫 실패에서 멈춤): 교구·목장 → 이름 → 직분(허용 목록) → 휴대폰 형식 → 사역팀 존재 → 신청일
//    형식 → 임명일 형식 → 상태 문구 인식.
export function ministryPaperOne(raw: any, i: number) {
  const gu = legacyNorm(raw && raw.gu), mok = legacyNorm(raw && raw.mok), name = legacyNorm(raw && raw.name);
  const position = legacyNorm(raw && raw.position);
  const phone = pilsaPhone(raw && raw.phone);
  const out: any = {
    i, gu, mok, name, position, phone,
    committee: legacyNorm(raw && raw.committee), team: legacyNorm(raw && raw.team),
    option: legacyNorm(raw && raw.option), ok: false, error: "", warn: "",
  };
  const at = paperDay(raw && raw.appliedAt), dec = paperDay(raw && raw.decidedAt);
  out.appliedAt = at.v; out.decidedAt = dec.v;
  // 줄에 적은 상태·사유가 있으면 그 줄만 그대로 따른다(2026-09-18 성도님 — 한 명단에 임명·취소가 섞인다)
  const stRaw = legacyNorm(raw && raw.status);
  out.rowStatus = stRaw ? (PAPER_ALIAS[stRaw] || "") : "";
  out.rowNote = legacyNorm(raw && raw.note);
  if (stRaw && !out.rowStatus) out.badStatus = stRaw;
  if (!gu || !mok) out.error = "교구·목장을 적어 주세요";
  else if (!name) out.error = "이름을 적어 주세요";
  else if (!MIN_POSITIONS.has(position)) out.error = "직분이 목록에 없습니다";
  else if (!PILSA_PHONE_RE.test(phone)) out.error = "휴대폰 번호를 확인해 주세요 (010-1234-5678)";
  else if (!out.team) out.error = "사역팀을 적어 주세요";
  else if (at.err) out.error = "신청일 — " + at.err;
  else if (dec.err) out.error = "임명일 — " + dec.err;
  else if (out.badStatus) out.error = "상태는 임명·취소·신청 중에 적어 주세요 (" + out.badStatus + ")";
  return out;
}
