// 교회 어드민 — 권한과 신원 규칙(순수 함수)
//   서버(Deno, index.ts)와 시험(Node, tests/authz.test.mjs)이 **같은 파일**을 읽는다.
//   ⚠️ Deno 전용 API·원격 import 를 쓰지 않는다 — node --experimental-strip-types 가 그대로 읽어야 한다.
//   ⚠️ enum·namespace 처럼 「타입만 지워서는 안 되는」 TS 문법도 쓰지 않는다.

// 액션마다 필요한 역할. null = 로그인만 되어 있으면(등록 전·대기·정지인 분도 자기 상태는 알아야 한다).
// ⚠️ 새 액션을 만들면 반드시 여기에 한 줄 — 없으면 unknown-action 으로 막힌다(열리는 쪽으로 틀리지 않게).
//    tests/server.dev.test.mjs 의 PROBE 에도 한 줄(시험이 빠진 액션을 잡는다).
export const ACTION_ROLES: Record<string, string | null> = {
  me: null,
  register: null,
  membersList: "super",
  membersApprove: "super",
  membersSetRoles: "super",
  membersSetStatus: "super",
  auditList: "super",
};

export type MemberStatus = "pending" | "active" | "disabled";
export type Gate = "ok" | "unknown-action" | "not-registered" | "pending" | "disabled" | "forbidden";

export function canCall(action: string, member: { status: MemberStatus; roles: string[] } | null): Gate {
  // hasOwnProperty — "toString" 같은 객체 기본 이름이 액션으로 통과하지 않게
  if (!Object.prototype.hasOwnProperty.call(ACTION_ROLES, action)) return "unknown-action";
  const need = ACTION_ROLES[action];
  if (need === null) return "ok";
  if (!member) return "not-registered";
  if (member.status === "pending") return "pending";
  if (member.status !== "active") return "disabled";
  if (member.roles.includes("super") || member.roles.includes(need)) return "ok";
  return "forbidden";
}

// 서버가 아는 역할 이름 — 메뉴 목록(js/menus/registry.js)이 이 밖의 역할을 쓰면 시험이 실패한다.
export function knownRoles(): string[] {
  const s = new Set<string>(["super"]);
  for (const v of Object.values(ACTION_ROLES)) if (v) s.add(v);
  return [...s].sort();
}

// 완성형(NFC)으로 — 맥에서 온 자모분리 이름이 딴 사람이 되지 않게(2026-09-20 찬양대 NFC/NFD 사고)
export const norm = (s: unknown): string =>
  (s ?? "").toString().normalize("NFC").trim().replace(/\s+/g, " ");

export type Identity = { type: string; gu: string; mok: string; bu: string; grade: string; name: string };
export type ParsedIdentity = { ok: true; identity: Identity } | { ok: false; error: string };

const MAX_LEN = 40;

// 등록 칸 확인 — 교구 목록은 서버가 거르지 않는다(교구가 늘 때 서버까지 고치지 않게). 화면이 목록으로 받는다.
export function parseIdentity(x: unknown): ParsedIdentity {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, error: "invalid" };
  const o = x as Record<string, unknown>;
  const type = norm(o.type) || "교구";
  if (type !== "교구" && type !== "교회학교") return { ok: false, error: "invalid-type" };
  const f = (k: string) => norm(o[k]);
  const identity: Identity = type === "교구"
    ? { type, gu: f("gu"), mok: f("mok"), bu: "", grade: "", name: f("name") }
    : { type, gu: "", mok: "", bu: f("bu"), grade: f("grade"), name: f("name") };
  if (Object.values(identity).some((v) => v.length > MAX_LEN)) return { ok: false, error: "too-long" };
  // supabase-js 의 .in() 은 값에 , ( ) 가 있으면 "…" 로 감싸기만 하고 " \ 를 이스케이프하지 않는다 —
  // 이름을 김," 로 등록하면 membersList 가 그 사람이 대기하는 동안 500 이 된다. | 는 identity_key 의 구분자.
  if (Object.values(identity).some((v) => /["\\,()|]/.test(v))) return { ok: false, error: "bad-char" };
  if (!identity.name) return { ok: false, error: "name-required" };
  if (type === "교구" && (!identity.gu || !identity.mok)) return { ok: false, error: "gu-mok-required" };
  if (type === "교회학교" && (!identity.bu || !identity.grade)) return { ok: false, error: "bu-grade-required" };
  return { ok: true, identity };
}

// 성경암송 앱 users.identity_key 와 같은 꼴(supabase/functions/api/index.ts 의 identityKey)
export const identityKey = (u: Identity): string =>
  [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(norm).join("|");

// 적은 표기가 사람마다 달라 여러 꼴로 맞춰 본다(api 의 ministryStaffCandidates 를 양방향으로 넓힘)
//  · 목장 「20」·「20목장」  · 학년 「3」·「3학년」
export function identityCandidates(u: Identity): string[] {
  const m0 = u.mok.replace(/목장$/, "");
  const moks = [u.mok, m0, /^\d+$/.test(m0) ? m0 + "목장" : m0];
  const g0 = u.grade.replace(/학년$/, "");
  const grades = [u.grade, g0, /^\d+$/.test(g0) ? g0 + "학년" : g0];
  const out = new Set<string>();
  for (const mok of moks) for (const grade of grades) out.add(identityKey({ ...u, mok, grade }));
  return [...out];
}

// 역할 고르기 확인 — known 은 admin_roles 표에서 읽은 id 들(역할 목록의 원본은 표 하나)
export function parseRoles(x: unknown, known: string[]):
  { ok: true; roles: string[] } | { ok: false; error: string } {
  if (!Array.isArray(x)) return { ok: false, error: "invalid-roles" };
  const roles = [...new Set(x.map((r) => norm(r)))].filter(Boolean).sort();
  if (!roles.length) return { ok: false, error: "roles-required" };
  if (roles.some((r) => !known.includes(r))) return { ok: false, error: "unknown-role" };
  return { ok: true, roles };
}

// 카카오 별명 — index.ts 가 카카오 identity 의 identity_data 를 넘긴다(user_metadata 가 아니다 —
// 본인이 auth.updateUser 로 고칠 수 있어서). 2026-09-28 확인: name·full_name·preferred_username·user_name 칸에 담긴다.
// nickname 칸은 오지 않지만 판이 바뀔 때를 대비해 여럿을 본다.
export function kakaoNickname(meta: unknown): string {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const v = m.nickname || m.name || m.full_name || m.preferred_username || m.user_name || "";
  return norm(v).slice(0, MAX_LEN);
}

// 카카오 프로필 사진 — 승인 목록에서 본인 확인용(카카오 동의항목에 그렇게 적었다).
// 카카오는 http:// 로 준다 → https 페이지에서 막히지 않게 https:// 로.
// 호스트를 카카오 CDN 만 허용한다 — 다른 서버 주소면 목록을 여는 관리자의 IP·시각이 그 서버에 남는다.
export function kakaoAvatar(meta: unknown): string {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const v = String(m.avatar_url || m.picture || "").trim();
  if (!/^https?:\/\/([a-z0-9-]+\.)*kakaocdn\.net\/[^\s"'<>]*$/i.test(v)) return "";
  return v.replace(/^http:\/\//i, "https://").slice(0, 500);
}
