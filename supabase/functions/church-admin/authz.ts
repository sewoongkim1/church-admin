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
  // 교인명부(2026-10-01) — 새 명부를 올린 뒤 사역신청·성경필사 기록을 교인과 다시 잇는다(auto 줄만 · 사람이 정한 줄은 그대로).
  //   apply:true 가 아니면 세기만 한다(시험 PROBE 가 아무것도 안 바꾸게). 기록 people.linksync(수만).
  peopleLinkSync: "super",
  // 사역신청(2단계 · 2026-09-28) — 임명현황. 읽기만, 임명확정만, 번호·메모 없음.
  ministryAppointed: "ministry",
  // 사역신청(3단계) — 신청 현황. 목록은 번호·메모를 담는다(관리 화면 전용). 상태 바꾸기·삭제는 바꾼 기록에 남는다.
  ministryList: "ministry",
  ministrySetStatus: "ministry",
  ministryDelete: "ministry",
  // 사역신청(4·5단계 · 2026-09-29) — 사역팀 정보(하는 일·시간·필요 인원). 목록은 게이트만
  // 더한 것(원문은 성도 화면과 공유해 게이트가 없었다), 저장·차례는 관리자만.
  ministryCatalogAdmin: "ministry",
  ministryCatalogSave: "ministry",
  ministryCatalogOrder: "ministry",
  // 사역신청(4·5단계 Task 5 · 2026-09-29) — 종이(오프라인) 명단 올리기. 살펴보기(check)는 아무것도
  // 안 바꾸고, 넣기(save)만 계정·신청을 만든다 — 둘 다 담당자만.
  ministryPaperCheck: "ministry",
  ministryPaperSave: "ministry",
  // 사역신청(2026-09-30 친구 요청) — 이름을 누르면 교적 창 — 담당자·역할 화면(총괄)도 이것을 부른다.
  // 모양은 index.ts ministryPerson 이 부른 분의 역할로 정한다(evPerson 과 같다 — 교인명부 역할·총괄이면 교인ID, 아니면 다섯 칸 + 교적 표시).
  ministryPerson: "ministry",
  // 「📮 정정 신청」(2026-10-01) — 성경암송 앱 「사역 이력 확인」에서 온 정정 신청 목록·처리. 응답에 user_id·person_id 없음 · 처리는 바꾼 기록에.
  historyRequestList: "ministry",
  historyRequestSet: "ministry",
  // 신청 삭제(2026-10-02 친구 요청) — 신청 줄을 지운다(앱 「내 정정 신청」에서도 사라짐) · 빠진 사역이 「반영」으로 더한 줄은 빼 둔다.
  //   바꾼 기록 history.request.delete 에는 번호·종류·상태만(이름·글 없음).
  historyRequestDelete: "ministry",
  // 교인명부(2026-09-29) — 찾기·한 분 보기·현황·내려받기. 읽기만(원본은 dimode). 찾기·보기·내려받기는 열람 기록에 남는다.
  peopleSearch: "directory",
  peoplePerson: "directory",
  peopleStats: "directory",
  peopleExport: "directory",
  // 교인명부 「자세히」 창 사역·성경필사 탭(2026-10-01) — 이름이 같고 아직 안 이어진 기록(읽기만 · 기록 없음 — 창을 연 people.view 가 있다) ·
  //   「이분 것」·「이분 아님」·「풀기」(줄 이름 = 교인 이름일 때만 · 바꾼 기록 people.link). 메모·사유·전화·앱 계정은 싣지 않는다.
  peopleHistory: "directory",
  peopleLink: "directory",
  // 성경필사(암송)(2026-09-29) — 성경암송 앱의 이벤트 명단(events·event_signups). 여기는 읽기 넷
  // (회차 목록·명단·사람별 이력·통계). 줄은 이름·소속·직분·담당자 메모·교적 표시만 — user_id·신원 키·
  // 성도님 전화·메모·답은 싣지 않는다. 쓰기(회차 설정·줄 고치기·올리기)는 Task 6~8 이 이 아래에 더한다.
  evEvents: "bibleevent",
  evRoster: "bibleevent",
  evHistory: "bibleevent",
  evStats: "bibleevent",
  // 성경필사(암송) — 회차 만들기·설정(Task 6). 만들기는 draft 로만, 성도님께 보이게 되는 저장은
  // confirmListed 를 받아야 쓴다(needs-confirm). 둘 다 바꾼 기록(event.create·event.settings)에 남는다.
  evEventCreate: "bibleevent",
  evEventSave: "bibleevent",
  // 성경필사(암송) — 한 분 더하기·줄 고치기·빼기(계획 Task 7). 앱 계정은 조회만 해서 잇는다(만들지 않는다).
  // 앱에서 낸 줄·자격 회차의 줄은 메모만, 자격 회차에는 더하기·빼기 없음. 바꾼 기록 event.add / event.edit / event.delete.
  evRowAdd: "bibleevent",
  evRowSave: "bibleevent",
  evRowDelete: "bibleevent",
  // 성경필사(암송) — 명단 올리기·교인명부 찾기(계획 Task 8). 살펴보기는 아무것도 안 바꾼다(채우기를 켜면 people.fill 기록),
  // 넣기는 「넣음」 줄만 더한다(앱 계정은 조회만). 찾기는 이름·구분·소속·세부·직분 다섯 칸 + 교적 목장 칸(church_mok), 부를 때마다 people.lookup.
  evUploadCheck: "bibleevent",
  evUploadSave: "bibleevent",
  evPeopleLookup: "bibleevent",
  // 성경필사(암송) — 이름을 누르면 교적 창(계획 Task 16 · 2026-09-30). 모양은 index.ts evPerson 이 부른 분의 역할로 정한다:
  // 교인명부 역할·총괄이면 교인ID(「자세히」 창은 peoplePerson 이 역할을 다시 본다), 아니면 다섯 칸 + 교적 표시(people.lookup).
  evPerson: "bibleevent",
  // 사역신청 시험 참여자(2026-09-30) — 기간 밖에도 성경암송 첫 화면에 🤝 사역신청이 보이는 앱 계정. 명단은 app_config.ministryTesters
  // (성경암송 api 가 읽는다). 찾기는 앱 계정(users)을 이름으로 — user_id 는 싣지 않는다. 더하기·빼기는 바꾼 기록 ministry.tester.
  // 2026-10-02 친구 요청으로 총괄(super)만 — 메뉴도 「시스템」 묶음으로 옮겼다. 사역신청 담당은 신청 현황의 🧪 딱지만 본다.
  ministryTesters: "super",
  ministryTesterFind: "super",
  ministryTesterSave: "super",
  // 사역신청 번호 보관(2026-10-01 · 교인명부 세션 설계 §6) — 결정 때 번호를 지우지 않고, 신청 현황 「결정된 신청 번호 지우기(N건)」로.
  //   보낸 수(count)가 지금 수와 같을 때만 지운다(그사이 바뀌었으면 conflict · 시험 PROBE 도 이 길로 아무것도 안 바꾼다). 바꾼 기록 ministry.phoneclear.
  ministryPhoneClear: "ministry",
  // 사역 이력(2026-10-01) — 지난 해 사역 임명 명단(엑셀)과 교인ID 잇기(표 ministry_history · history-db.ts). 응답의 person_id 는
  // 교인명부·총괄 역할일 때만(서버가 ctx.roles 로). 후보 보기는 「교인명부 기록」 people.lookup(from:"history") · 쓰기는 「바꾼 기록」 history.*.
  historyList: "ministry",
  historyUploadCheck: "ministry",
  historyUploadSave: "ministry",
  historyRowAdd: "ministry",
  historyRowSave: "ministry",
  historyRowDelete: "ministry",
  historyCandidates: "ministry",
  historyLink: "ministry",
  // 「👥 묶어 보기」(2026-10-04) — 못 맞춘 줄을 목장·이름 묶음으로 보고 한 번에 잇기(바꾼 기록 history.linkgroup)
  historyGroups: "ministry",
  historyLinkGroup: "ministry",
  historyRematch: "ministry",
  historyExport: "ministry",
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
