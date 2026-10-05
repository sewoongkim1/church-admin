// ============================================================
// 교회 어드민 — 서버 함수 church-admin (2026-09-28)
//   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-09-28-church-admin-design.md
//   배포: supabase functions deploy church-admin --no-verify-jwt --project-ref <개발 먼저>
//   ⚠️ --no-verify-jwt 는 「검사를 안 한다」가 아니다 — 게이트웨이 대신 **여기서** 요청마다
//      auth.getUser(토큰)로 사람을 확인한다. 토큰이 없거나 틀리면 401.
//   ⚠️ 막는 것은 이 파일이다. 화면에서 메뉴를 숨기는 것은 편의일 뿐.
//   ⚠️ 응답에 auth_user_id 를 싣지 않는다(MEMBER_COLS 에 없다).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { canCall, identityCandidates, kakaoAvatar, kakaoNickname, norm, parseIdentity, parseRoles } from "./authz.ts";
import { statusPatch } from "./ministry.ts";
import { ministryFreqOf, ministryHtml, ministryMemberLine, ministryTimeIn, MINISTRY_FREQ_COLS, MINISTRY_FREQ_KEYS } from "./catalog.ts";
import { appIdentityKey, legacyNorm, ministryPaperKeys, ministryPaperOne, paperName, PAPER_MAX_ROWS } from "./paper.ts";
import { applicantFromPaper, applicantFromWho, churchFor, lookupKeys, toCand, type Cand } from "./people-match.ts";
import { parseSearch, searchDetail, sortOrder, statsOf, PAGE_SIZE, PHOTO_TTL, FILTER_KEYS, type Search } from "./people-query.ts";
// 성경필사(암송)(Task 5) — 기존 import 줄은 고치지 않고 새 줄로 더한다. Task 6~8 은 여기 든 이름을 다시 들이지 않는다(두 번 선언 = 배포 실패).
import { applicantFromSignup, nameKey, type Church } from "./people-match.ts";
import { BE_BAD_CHARS, BE_FIELD_MAX, EVT_ID_RE, evtListable, isEligEvent, kstToday } from "./events-rules.ts";
// ⚠️ people-query.ts 의 statsOf(교인명부 현황)와 이름이 같다 — 이벤트 통계는 eventStatsOf 로만 부른다
import { affLabel, personGroups, statsOf as eventStatsOf, type StatIn } from "./events-stats.ts";
// 성경필사(암송) 회차 만들기·설정(Task 6)이 더 쓰는 이름 — ⚠️ 위의 import 에 이미 있는 이름(EVT_ID_RE·evtListable·kstToday 등)은 적지 않는다.
import { BE_NEEDS_DEFAULT, checkEvent, eligibilityStart, EV_CREATE_KEYS, EV_EDIT_KEYS, eventDiff, eventFields, mergeEventPatch, pickEventPatch, type EvEvent } from "./events-rules.ts";
// 성경필사(암송) — 한 분 더하기·줄 고치기·빼기(계획 Task 7)
import { checkNote, checkRow, identKey, type EvRow } from "./events-rules.ts";
import { ADD_TAG, askableKeys, checkChanged, formRow, oddPosition, rowPatch, sameKeys, tagNote, touchesRow } from "./events-rows.ts";
// 성경필사(암송) 명단 올리기·교인명부 찾기(Task 8) — 이 과제의 이름은 events-upload.ts 에서만 가져온다(CONTRACT 5)
import { applyFill, fillNames, filledNames, judgeUpload, lookupCandOut, lookupName, LOOKUP_MAX, tidyUpload, tooManyRows, uploadCounts, uploadEventError, uploadKeys, uploadOut, uploadRecords } from "./events-upload.ts";

// 성경필사(암송) 이름을 누르면 교적 창(Task 16) — 이 과제의 이름은 events-person.ts 에서만 가져온다(CONTRACT 5)
import { personAsk, personOut, type PersonCand } from "./events-person.ts";
// 사역신청·담당자 이름을 누르면 교적 창(ministryPerson · 2026-09-30) — ⚠️ 이미 들인 이름(applicantFromSignup·applicantFromWho·personAsk·readName)은 적지 않는다
import { personOutFor } from "./events-person.ts";
// ministryPerson 의 맞대 볼 줄·기록(2026-09-30 검토 3·5) — 받은 줄을 읽는 식과 기록 모양을 순수 함수로(시험이 명단 쪽 식과 맞댄다)
import { ministryApplicant, ministryLookupLog } from "./events-person.ts";
// 목장이 비었거나 99 인 교구 줄의 같은 분 판정(최종 검토 I1) — 위 import 에 없는 이름만
import { looseKey, looseSame } from "./events-rows.ts";
import { looseIndex } from "./events-upload.ts";
// 이력 정렬을 통계와 같은 코드 포인트 차례로(history-sort-localecompare · 2026-09-30) — localeCompare 는 ICU 에 따라 달라진다
import { codeCmp } from "./events-stats.ts";
// 읽기만 하는 이름(👤 이력 · 이름을 누르면) — 괄호·쉼표가 든 옛 이름도 받는다(최종 검토 SEC-7)
import { readName } from "./events-upload.ts";
// 한글 키 .in() 묶음을 개수(100)와 주소 길이(6KB)로 함께 자른다(최종 검토 SEC-4 · churchcands-url-length)
import { inChunks } from "./events-rows.ts";
// 회차 설정의 글자 길이·차례 검사 · DB 에 쓸 값(sort_order 는 수로) — 2026-09-30 E(SEC-6 · 회차 차례)
import { checkEventEdit, eventDbPatch } from "./events-rules.ts";
// 친구 결정(2026-09-30) — 지난 회차에 넣는 줄의 낸 날(M2) · people.fill 에 물은 이름(SEC-2) · 위 import 에 없는 이름만
import { pastEventCreatedAt } from "./events-rules.ts";
import { fillRecord } from "./events-upload.ts";
// 성경필사 명단 줄의 교적 표시 — 옮겨 적은 줄은 맞음(signupSame · 2026-09-30 친구 제보). evRoster·evRowChurch 가 쓴다.
//   ⚠️ 그래서 위 「성경필사(암송)(Task 5)」 줄의 applicantFromSignup 은 이제 이 파일에서 부르지 않는다 — 기존 import 줄이라 고치지 않고 두었다.
//      명단 줄의 교적 표시를 applicantFromSignup + churchFor 로 되돌려 짜면 옮겨 적은 줄·아이 빼기가 빠진다 — churchForSignup 을 쓴다.
import { churchForSignup } from "./events-person.ts";
// 사역신청 번호 보관(2026-10-01) — 결정 상태 목록(번호 지우기 단추가 같은 목록을 센다)
import { DECIDED } from "./ministry.ts";
// 교인명부 — 기록과 교인 잇기(2026-10-01 · people_links) — 이 묶음의 이름은 people-links.ts 에서만 가져온다
import { orderAutoRecs, signupAutoRecs, syncCounts, toLinkCand, linkRowOf, type AutoRec, type LinkKind, type LinkLook, type LinkRow } from "./people-links.ts";
// 교인명부 「자세히」 창 사역·성경필사 탭(2026-10-01 · Task 5) — 이 묶음의 이름은 people-links.ts 에서만 가져온다
import { historyTabs, unlinkedRows, movedOrderIds, parseLink, linkPatch, unlinkRec, missingTable } from "./people-links.ts";
// b6 「사역 이력」 표 잇기(2026-10-01 · b6 설계 §7 약속) — 잇는 모양·다시 맞추기는 b6 모듈 그대로
import { historyLinkPatch, historyUnlinkPatch } from "./history-match.ts";
import { linkNameOk, historyNameMatches } from "./people-links.ts";
// 탭 자료 읽기가 실패해도 「자세히」 창·잇기 쓰기는 그대로(2026-10-02 가지 마지막 검토)
import { historyOrNull, withHistory } from "./people-links.ts";
import { rematchHistoryRows } from "./history-db.ts";
// 사역 이력 확인 · 정정 신청(성경암송 앱 · 2026-10-01) — ⚠️ 위 import 에 이미 든 이름은 적지 않는다
import { loginNameKey, matchLoginPerson, type LoginWho } from "./people-match.ts";
import { hcUserId, historyRowOut, HISTORY_SELECT, internalKeyOk, parseRequest, readLoginWho, REQ_OPEN, requestBlock, requestInsert, requestOut, REQUEST_SELECT, sortHistory } from "./history-check.ts";
// 「📮 정정 신청」 담당자 처리(2026-10-01) — ⚠️ 위 import 에 이미 든 이름은 적지 않는다
import { filterRequests, parseRequestSet, REQ_FILTERS, REQUEST_ADMIN_SELECT, requestAdminOut, requestAuditDetail, requestCounts, requestSetBlock, requestSetNoop, requestSetPatch, ROW_ADMIN_SELECT } from "./history-check.ts";
// 사역 이력(2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md) — 표 읽기·쓰기는 history-db.ts 한 곳
import { makeHistory } from "./history-db.ts";
// 「빠진 사역」 정정 신청을 「반영」하면 그 해 사역 이력에 한 줄(2026-10-01) — ⚠️ 위 import 에 이미 든 이름은 적지 않는다
import { applyMissingRequest, undoMissingRequest } from "./history-db.ts";
// 빠진 사역을 고쳐서 반영 · 목록의 줄 미리 채우기(2026-10-02) — ⚠️ 위 import 에 이미 든 이름은 적지 않는다
import { parseRequestLine, requestKey, requestLineOut, type MissingApply, type ReqLine } from "./history-db.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } });

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const MEMBER_COLS = "id,type,gu,mok,bu,grade,name,kakao_nickname,kakao_avatar,status,approved_by,approved_at,last_login_at,created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Member = {
  id: string; type: string; gu: string; mok: string; bu: string; grade: string; name: string;
  kakao_nickname: string; kakao_avatar: string; status: "pending" | "active" | "disabled";
  approved_by: string | null; approved_at: string | null; last_login_at: string | null; created_at: string;
};
type Ctx = { uid: string; meta: unknown; member: Member | null; roles: string[] };

async function loadCtx(uid: string, meta: unknown): Promise<Ctx> {
  const { data: m, error } = await db.from("admin_members").select(MEMBER_COLS).eq("auth_user_id", uid).maybeSingle();
  if (error) throw error;
  let roles: string[] = [];
  if (m) {
    const { data: g, error: e2 } = await db.from("admin_role_grants").select("role_id").eq("member_id", m.id);
    if (e2) throw e2;
    roles = (g ?? []).map((r: any) => r.role_id).sort();
  }
  return { uid, meta, member: (m as Member) ?? null, roles };
}

// 바꾸는 요청은 모두 한 줄씩 남긴다. 기록이 실패하면 숨기지 않고 오류로 올린다.
async function audit(ctx: Ctx, action: string, target: string, detail: Record<string, unknown> = {}) {
  const { error } = await db.from("admin_audit").insert({ member_id: ctx.member?.id ?? null, action, target, detail });
  if (error) throw error;
}

// 사역 이력 액션 열(history-db.ts makeHistory) — db·audit 를 넘겨 만든다(이름은 historyApi — 「history」는 브라우저 전역과 헷갈린다)
const historyApi = makeHistory({ db, audit });

async function knownRoleIds(): Promise<string[]> {
  const { data, error } = await db.from("admin_roles").select("id");
  if (error) throw error;
  return (data ?? []).map((r: any) => r.id);
}

async function getMember(id: unknown): Promise<Member | null> {
  const s = norm(id);
  if (!UUID.test(s)) return null;
  const { data, error } = await db.from("admin_members").select(MEMBER_COLS).eq("id", s).maybeSingle();
  if (error) throw error;
  return (data as Member) ?? null;
}

// 지금 사용 중인 총괄 관리자들 — 마지막 한 분을 빼거나 정지하지 못하게
async function activeSuperIds(): Promise<string[]> {
  const { data: g, error } = await db.from("admin_role_grants").select("member_id").eq("role_id", "super");
  if (error) throw error;
  const ids = (g ?? []).map((x: any) => x.member_id);
  if (!ids.length) return [];
  const { data: ms, error: e2 } = await db.from("admin_members").select("id").in("id", ids).eq("status", "active");
  if (e2) throw e2;
  return (ms ?? []).map((x: any) => x.id);
}

// ---------- 기존 사역 담당자와 같은 분인지 (갈아타기 동안 승인을 돕는 표시일 뿐 — 권한을 주지 않는다) ----------
// ⚠️ 키가 아니라 사람(user_id)으로 맞댄다 — 소속을 고친 분의 옛 키는 user_identity_aliases 로 간다(2026-09-17 리뷰).
async function keysToUserIds(list: string[]): Promise<Map<string, string>> {
  // 옛 app_config.ministryAdmins 에 이상한 키가 섞여 있어도 .in() 이 깨지지 않게 걸러 낸다(authz.parseIdentity 의 bad-char 참고)
  const uniq = [...new Set(list.map((k) => norm(k)).filter((k) => k && !/["\\,()]/.test(k)))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const { data: us, error: e1 } = await db.from("users").select("id,identity_key").in("identity_key", uniq);
  if (e1) throw e1;
  for (const u of (us ?? []) as any[]) out.set(u.identity_key, u.id);
  const rest = uniq.filter((k) => !out.has(k));
  if (rest.length) {
    const { data: al, error: e2 } = await db.from("user_identity_aliases").select("identity_key,user_id").in("identity_key", rest);
    if (e2) throw e2;
    for (const a of (al ?? []) as any[]) out.set(a.identity_key, a.user_id);
  }
  return out;
}

async function ministryStaffUserIds(): Promise<Set<string>> {
  const { data, error } = await db.from("app_config").select("value").eq("key", "ministryAdmins").maybeSingle();
  if (error) throw error;
  const keys = Array.isArray(data?.value) ? (data!.value as unknown[]).map((x) => norm(x)).filter(Boolean) : [];
  return new Set((await keysToUserIds(keys)).values());
}

// ---------- 액션 ----------
async function me(ctx: Ctx) {
  const m = ctx.member;
  if (m) {
    const { error } = await db.from("admin_members").update({ last_login_at: new Date().toISOString() }).eq("id", m.id);
    if (error) throw error;
  }
  const roles = m?.status === "active" ? ctx.roles : [];   // 정지·대기인 분에게는 역할을 알려 주지 않는다
  let roles_info: { id: string; label: string }[] = [];
  if (roles.length) {
    const { data, error } = await db.from("admin_roles").select("id,label").in("id", roles).order("id");
    if (error) throw error;
    roles_info = (data ?? []) as any;
  }
  return { ok: true, registered: !!m, status: m?.status ?? null, member: m, roles, roles_info,
    kakao_nickname: kakaoNickname(ctx.meta) };
}

// 처음 로그인한 분의 승인 요청. 대기 중에는 적은 것을 고칠 수 있고, 승인·정지된 뒤에는 못 바꾼다.
async function register(ctx: Ctx, b: any) {
  if (ctx.member && ctx.member.status !== "pending") return { ok: false, error: "already-registered" };
  const p = parseIdentity(b.identity);
  if (!p.ok) return { ok: false, error: p.error };
  const row = { ...p.identity, kakao_nickname: kakaoNickname(ctx.meta), kakao_avatar: kakaoAvatar(ctx.meta) };
  if (ctx.member) {
    // 바뀐 칸이 없으면(여섯 칸 + kakao 두 칸) 업데이트·기록 없이 바로 돌려준다
    const unchanged = (Object.keys(row) as (keyof typeof row)[]).every((k) => (ctx.member as any)[k] === row[k]);
    if (unchanged) return await me(ctx);
    const { data: upd, error } = await db.from("admin_members").update(row)
      .eq("id", ctx.member.id).eq("status", "pending").select("id");
    if (error) throw error;
    if (!upd?.length) return { ok: false, error: "already-registered" };   // 그 사이 승인됨
  } else {
    const { error } = await db.from("admin_members").insert({ ...row, auth_user_id: ctx.uid, status: "pending" });
    if (error) {
      if ((error as any).code === "23505") return { ok: false, error: "already-registered" };  // 두 번 눌러 동시에 들어온 것
      throw error;
    }
  }
  const next = await loadCtx(ctx.uid, ctx.meta);
  await audit(next, ctx.member ? "register.update" : "register", next.member!.id, row);
  return await me(next);
}

async function membersList() {
  const [ms, gs, rs] = await Promise.all([
    db.from("admin_members").select(MEMBER_COLS).order("created_at", { ascending: true }),
    db.from("admin_role_grants").select("member_id,role_id"),
    db.from("admin_roles").select("id,label,description").order("id"),
  ]);
  if (ms.error) throw ms.error;
  if (gs.error) throw gs.error;
  if (rs.error) throw rs.error;
  const members = (ms.data ?? []) as Member[];
  const rolesBy = new Map<string, string[]>();
  for (const g of (gs.data ?? []) as any[]) rolesBy.set(g.member_id, [...(rolesBy.get(g.member_id) ?? []), g.role_id].sort());
  const nameBy = new Map(members.map((m) => [m.id, m.name]));
  const known = new Set<string>();
  const pending = members.filter((m) => m.status === "pending");
  if (pending.length) {
    const staff = await ministryStaffUserIds();
    if (staff.size) {
      const cands = new Map(pending.map((m) => [m.id, identityCandidates(m)]));
      const who = await keysToUserIds([...cands.values()].flat());
      for (const [id, ks] of cands) if (ks.some((k) => staff.has(who.get(k) ?? ""))) known.add(id);
    }
  }
  return {
    ok: true,
    roles: rs.data ?? [],
    members: members.map((m) => ({
      ...m,
      roles: rolesBy.get(m.id) ?? [],
      approved_by_name: m.approved_by ? nameBy.get(m.approved_by) ?? "" : "",
      known_ministry_staff: known.has(m.id),
    })),
  };
}

async function membersApprove(ctx: Ctx, b: any) {
  const m = await getMember(b.member_id);
  if (!m) return { ok: false, error: "not-found" };
  if (m.status !== "pending") return { ok: false, error: "not-pending" };
  const r = parseRoles(b.roles, await knownRoleIds());
  if (!r.ok) return { ok: false, error: r.error };
  const { data: upd, error } = await db.from("admin_members")
    .update({ status: "active", approved_by: ctx.member!.id, approved_at: new Date().toISOString() })
    .eq("id", m.id).eq("status", "pending").select("id");
  if (error) throw error;
  if (!upd?.length) return { ok: false, error: "conflict" };   // 다른 관리자가 먼저 처리했다
  const { error: e2 } = await db.from("admin_role_grants")
    .insert(r.roles.map((role_id) => ({ member_id: m.id, role_id, granted_by: ctx.member!.id })));
  if (e2) throw e2;
  await audit(ctx, "members.approve", m.id, { name: m.name, roles: r.roles });
  return { ok: true };
}

async function membersSetRoles(ctx: Ctx, b: any) {
  const m = await getMember(b.member_id);
  if (!m) return { ok: false, error: "not-found" };
  if (m.status === "pending") return { ok: false, error: "use-approve" };
  const r = parseRoles(b.roles, await knownRoleIds());
  if (!r.ok) return { ok: false, error: r.error };
  const { data: cur, error } = await db.from("admin_role_grants").select("role_id").eq("member_id", m.id);
  if (error) throw error;
  const before = (cur ?? []).map((x: any) => x.role_id).sort();
  if (before.includes("super") && !r.roles.includes("super")) {
    if (m.id === ctx.member!.id) return { ok: false, error: "self-super" };   // 스스로 문을 잠그지 않게
    const supers = await activeSuperIds();
    if (supers.includes(m.id) && supers.length <= 1) return { ok: false, error: "last-super" };
  }
  const add = r.roles.filter((x) => !before.includes(x));
  const del = before.filter((x: string) => !r.roles.includes(x));
  if (del.length) {
    const { error: e } = await db.from("admin_role_grants").delete().eq("member_id", m.id).in("role_id", del);
    if (e) throw e;
  }
  if (add.length) {
    const { error: e } = await db.from("admin_role_grants")
      .insert(add.map((role_id) => ({ member_id: m.id, role_id, granted_by: ctx.member!.id })));
    if (e) throw e;
  }
  await audit(ctx, "members.roles", m.id, { name: m.name, before, after: r.roles });
  return { ok: true };
}

// 정지 · 다시 사용 · 대기 중인 분 거절(대기 → 정지). 대기 → 사용은 「승인」으로만.
async function membersSetStatus(ctx: Ctx, b: any) {
  const status = norm(b.status);
  if (status !== "active" && status !== "disabled") return { ok: false, error: "invalid-status" };
  const m = await getMember(b.member_id);
  if (!m) return { ok: false, error: "not-found" };
  if (m.status === "pending" && status === "active") return { ok: false, error: "use-approve" };
  if (m.id === ctx.member!.id) return { ok: false, error: "self" };
  if (m.status === status) return { ok: true, already: true };
  if (status === "disabled") {
    const supers = await activeSuperIds();
    if (supers.includes(m.id) && supers.length <= 1) return { ok: false, error: "last-super" };
  }
  const { error } = await db.from("admin_members").update({ status }).eq("id", m.id);
  if (error) throw error;
  await audit(ctx, "members.status", m.id, { name: m.name, before: m.status, after: status });
  return { ok: true };
}

async function auditList(b: any) {
  const limit = Math.min(Math.max(Number(b.limit) || 100, 1), 200);
  let q = db.from("admin_audit").select("id,at,member_id,action,target,detail").order("id", { ascending: false }).limit(limit);
  const beforeId = Number(b.before);
  if (Number.isSafeInteger(beforeId) && beforeId > 0) q = q.lt("id", beforeId);
  // 교인명부 열람(people.*)은 따로 본다 — 찾기·보기가 많아 바꾼 일을 덮지 않게
  q = b.kind === "people" ? q.like("action", "people.%") : q.not("action", "like", "people.%");
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.flatMap((r) => [r.member_id, UUID.test(r.target) ? r.target : null]).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ms, error: e2 } = await db.from("admin_members").select("id,name").in("id", ids);
    if (e2) throw e2;
    for (const m of (ms ?? []) as any[]) names.set(m.id, m.name);
  }
  return {
    ok: true,
    rows: rows.map((r) => ({ id: r.id, at: r.at, who: names.get(r.member_id) ?? "", action: r.action,
      target: names.get(r.target) ?? r.target, detail: r.detail })),
  };
}

// ---------- 사역신청 (2단계 · 2026-09-28) ----------
// 성경암송 api 의 ministryList 에서 임명현황에 필요한 칸만 옮겨 왔다 — 「누가 어디에」만.
// ⚠️ 번호(phone)·담당자 메모(note)·user_id 는 싣지 않는다. 현황(3단계)이 오면 ministryList 를 따로 옮긴다.
// 연도는 성경암송과 같은 app_config('ministry').year(없으면 2027).
const kstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// PostgREST 는 한 번에 max_rows(기본 1000)까지만 돌려준다 — .limit 을 크게 줘도 **오류 없이 조용히** 잘린다.
// 그래서 빈 쪽이 나올 때까지 쪽을 넘긴다(실제로 받은 줄 수만큼 넘기므로 max_rows 가 얼마든 빠지지 않는다).
// ⚠️ 쪽을 넘길 때 차례가 흔들리지 않게 부르는 쪽은 order 를 id 까지 준다.
const PAGE = 1000;
async function allRows(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0, guard = 0; guard < 100; guard++) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    const got = (data ?? []) as any[];
    if (!got.length) return out;
    out.push(...got);
    from += got.length;
  }
  throw new Error("too-many-pages");
}

async function ministryYear(): Promise<number> {
  const { data, error } = await db.from("app_config").select("value").eq("key", "ministry").maybeSingle();
  if (error) throw error;
  return Number((data?.value as any)?.year) || 2027;
}

async function ministryAppointed() {
  const year = await ministryYear();
  const rows = await allRows(() => db.from("ministry_orders")
    .select("user_id,name,who,committee,team,option,created_at,decided_at,source")
    .eq("year", year).eq("status", "임명확정")
    .order("created_at", { ascending: true }).order("id", { ascending: true }));
  // 이름·소속이 비어 있는 옛 행은 users 에서 채운다(api ministryList 와 같은 규칙)
  const need = [...new Set(rows.filter((r) => !r.name || !r.who).map((r) => r.user_id).filter(Boolean))];
  const umap = new Map<string, any>();
  if (need.length) {
    const { data: us, error: e2 } = await db.from("users").select("id,type,gu,mok,bu,grade,name").in("id", need);
    if (e2) throw e2;
    for (const u of (us ?? []) as any[]) umap.set(u.id, u);
  }
  return {
    ok: true,
    year,
    rows: rows.map((r) => {
      const u = umap.get(r.user_id);
      const uWho = u ? (u.type === "교구" ? [u.gu, u.mok ? u.mok + "목장" : ""] : [u.bu, u.grade]).filter(Boolean).join(" ") : "";
      return {
        name: r.name || u?.name || "",
        who: r.who || uWho,
        committee: r.committee ?? "",
        team: r.team ?? "",
        option: r.option ?? "",
        at: r.created_at ? kstDay(r.created_at) : "",
        decided_at: r.decided_at ?? null,
        source: r.source === "paper" ? "paper" : "app",
      };
    }),
  };
}

// ---------- 사역신청 — 신청 현황 (3단계 · 2026-09-28) ----------
// 원문: docs/port/ministry-status-legacy.md 1.4~1.7. 옛 화면과 같은 규칙 + 동시 수정 대조(expect).
async function ministryList() {
  const year = await ministryYear();
  const rows = await allRows(() => db.from("ministry_orders")
    .select("id,user_id,committee,team,option,position,status,created_at,decided_at,name,who,note,notified_at,phone,source")
    .eq("year", year).order("created_at", { ascending: false }).order("id", { ascending: false }));
  const need = [...new Set(rows.filter((r) => !r.name || !r.who).map((r) => r.user_id).filter(Boolean))];
  const umap = new Map<string, any>();
  if (need.length) {
    const { data: us, error: e2 } = await db.from("users").select("id,type,gu,mok,bu,grade,name").in("id", need);
    if (e2) throw e2;
    for (const u of (us ?? []) as any[]) umap.set(u.id, u);
  }
  // 알림을 켜 두지 않은 분은 푸시가 안 간다 — 담당자가 게시·연락으로 메워야 하므로 화면이 알 수 있게 한다
  const hasPush = new Set<string>();
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 200) {   // .in() 주소 길이를 넘지 않게 나눠 묻는다
    const { data: subs, error: e3 } = await db.from("push_subscriptions").select("user_id").in("user_id", ids.slice(i, i + 200));
    if (e3) throw e3;
    for (const s of (subs ?? []) as any[]) hasPush.add(s.user_id);
  }
  // 교적 표시(교인명부 · 2026-09-29) — { state, reason } 만. 교적 값은 싣지 않는다.
  //   같은 물음에 교인ID 를 함께 읽어 그때그때 잇기에도 쓴다(2026-10-01 · 묻기가 늘지 않는다 · 실패해도 목록은 그대로)
  const look = await churchLookupLinked(rows.map((r) => r.name || umap.get(r.user_id)?.name || ""));
  const churchIdx = look ? look.idx : null;
  await linkOrders(rows.map((r) => {
    const u = umap.get(r.user_id);
    return { id: r.id, name: r.name || u?.name || "", who: r.who || (u ? appUserWho(u) : ""), phone: r.phone ?? "" };
  }), look);
  // 🧪 시험 참여자(app_config.ministryTesters)의 신청인가(2026-10-01) — 신청 기간 전 시험 신청을 진짜와 가른다. 사람으로 맞댄다.
  const testerIds = new Set((await keysToUserIds(await testerKeys())).values());
  return {
    ok: true,
    year,
    list: rows.map((r) => {
      const u = umap.get(r.user_id);
      const uWho = u ? (u.type === "교구" ? [u.gu, u.mok ? u.mok + "목장" : ""] : [u.bu, u.grade]).filter(Boolean).join(" ") : "";
      return {
        id: r.id, committee: r.committee ?? "", team: r.team ?? "", option: r.option ?? "", position: r.position ?? "",
        status: r.status, at: r.created_at ? kstDay(r.created_at) : "", decided_at: r.decided_at ?? null,
        name: r.name || u?.name || "", who: r.who || uWho,
        note: r.note ?? "", notified_at: r.notified_at ?? null, canPush: hasPush.has(r.user_id),
        phone: r.phone ?? "", source: r.source === "paper" ? "paper" : "app",
        church: churchFor(churchIdx, applicantFromWho(r.name || u?.name || "", r.who || uWho, r.phone ?? "")),
        tester: testerIds.has(r.user_id),
      };
    }),
  };
}

// 임명 알림은 성경암송 api 의 내부 액션이 보낸다(한 벌) — 실패해도 상태 바꾸기는 이미 끝났으니 결과만 알린다
async function notifyAppointed(id: number) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    // 성경암송 api 가 멈춰도 담당자의 「임명」이 오래 걸리지 않게 8초에서 끊고 「알림 실패」로 알린다.
    const res = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/api", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": key },
      body: JSON.stringify({ action: "internalMinistryNotify", id }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await res.json().catch(() => null);
    if (!j || j.ok !== true) {
      console.error("notifyAppointed", res.status, j);
      return { pushed: 0, pushError: "notify-failed", already: false };
    }
    return { pushed: Number(j.pushed) || 0, pushError: j.pushError ?? null, already: !!j.already };
  } catch (e) {
    console.error("notifyAppointed", e);
    return { pushed: 0, pushError: "notify-failed", already: false };
  }
}

async function ministrySetStatus(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const { data: row, error } = await db.from("ministry_orders")
    .select("id,status,name,who,committee,team,user_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false, error: "not-found" };
  // 화면이 본 상태와 지금 상태가 다르면 — 다른 담당자가 먼저 바꿨다
  if (typeof b.expect === "string" && b.expect !== row.status) return { ok: false, error: "conflict", status: row.status };
  const p = statusPatch(row.status, b.status, b.note, new Date().toISOString());
  if (!p.ok) return { ok: false, error: p.error };
  const { data: upd, error: e2 } = await db.from("ministry_orders").update(p.patch)
    .eq("id", id).eq("status", row.status).select("id");
  if (e2) throw e2;
  if (!upd?.length) {
    const { data: now } = await db.from("ministry_orders").select("status").eq("id", id).maybeSingle();
    return { ok: false, error: "conflict", status: now?.status ?? null };
  }
  await audit(ctx, "ministry.status", String(id), {
    name: row.name ?? "", who: row.who ?? "", team: row.team ?? "", before: row.status, after: p.patch.status,
    ...(typeof p.patch.note === "string" ? { note: p.patch.note } : {}),
  });
  const n = p.notify ? await notifyAppointed(id) : { pushed: 0, pushError: null, already: false };
  const phoneCleared = p.patch.phone === null;
  return { ok: true, status: p.patch.status, pushed: n.pushed, pushError: n.pushError, already: n.already,
    phoneCleared, ...(phoneCleared ? { church: await orderChurchNoPhone(row) } : {}) };
}

// 결정(임명·취소)으로 번호를 지운 건의 교적 표시를 **번호 없이** 다시 센다 — ministryList 가 다음에 불러올 때와 같은 값.
// ⚠️ 화면이 표시를 그냥 비우면(2026-09-30 첫 판) 임명한 분의 「교적 ✓」가 새로 불러오기 전까지 사라졌다(친구 제보).
//    번호로 센 옛 표시(「소속 다름」)를 남기면 이름을 눌러 뜨는 창(번호 없이 셈)과 어긋난다 — 그래서 다시 센 값으로 갈아 끼운다.
//    이름·소속이 빈 옛 줄은 ministryList 처럼 앱 계정(users)에서 채운다.
async function orderChurchNoPhone(row: { name?: string | null; who?: string | null; user_id?: string | null }) {
  let name = row.name || "", who = row.who || "";
  if ((!name || !who) && row.user_id) {
    const { data: u, error } = await db.from("users").select("type,gu,mok,bu,grade,name").eq("id", row.user_id).maybeSingle();
    if (error) throw error;
    if (u) { name = name || u.name || ""; who = who || appUserWho(u); }
  }
  return churchFor(await churchLookup([name]), applicantFromWho(name, who, ""));
}

// 신청 한 건을 아주 지운다(되돌릴 수 없다 — 화면이 두 번 묻는다). 3개 상한의 자리도 도로 빈다.
async function ministryDelete(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const { data: row, error } = await db.from("ministry_orders")
    .select("id,name,who,committee,team,status").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!row) return { ok: false, error: "not-found" };
  const { error: e2 } = await db.from("ministry_orders").delete().eq("id", id);
  if (e2) throw e2;
  const deleted = { id: row.id, name: row.name ?? "", who: row.who ?? "", committee: row.committee ?? "",
    team: row.team ?? "", status: row.status };
  await audit(ctx, "ministry.delete", String(id), deleted);
  return { ok: true, deleted };
}

// 결정된 신청 번호 지우기(2026-10-01 · 교인명부 세션 설계 §6) — 그 해(app_config) 결정(임명확정·미채택·취소)이고 번호가 남은 줄만.
//   count = 화면이 단추에 보인 수. 지금 수와 다르면(그사이 누가 임명·지우기를 했다) 쓰지 않고 conflict + 지금 수 —
//   담당자가 본 것보다 많이 지우지 않게(시험 PROBE 도 이 길로 아무것도 안 바꾼다).
//   지운 뒤 교적 표시는 화면이 목록을 다시 불러와(ministryList) 번호 없이 다시 센다. 번호로 이어 둔 교인 잇기(people_links)는 남는다
//   (지우는 것은 ministry_orders 의 번호뿐 · 그 뒤의 다시 맞추기는 people-links.ts phoneLinkKept 가 번호 줄을 건너뛴다).
async function ministryPhoneClear(ctx: Ctx, b: any) {
  const year = await ministryYear();
  const { count, error } = await db.from("ministry_orders").select("id", { count: "exact", head: true })
    .eq("year", year).in("status", DECIDED).not("phone", "is", null).neq("phone", "");
  if (error) throw error;
  const now = count ?? 0;
  const want = Number(b.count);
  if (!Number.isSafeInteger(want) || want !== now) return { ok: false, error: "conflict", count: now };
  if (!now) return { ok: true, year, count: 0 };
  const { data, error: e2 } = await db.from("ministry_orders").update({ phone: null, updated_at: new Date().toISOString() })
    .eq("year", year).in("status", DECIDED).not("phone", "is", null).neq("phone", "").select("id");
  if (e2) throw e2;
  const n = (data ?? []).length;
  await audit(ctx, "ministry.phoneclear", String(year), { count: n });
  return { ok: true, year, count: n };
}

// ---------- 사역신청 — 시험 참여자(2026-09-30) ----------
// 명단에 오른 앱 계정은 기간 밖에도 성경암송 첫 화면에 🤝 사역신청이 보이고 신청·취소가 된다(그쪽 api ministryTester·ministryApply).
// 명단은 app_config.ministryTesters = identity_key 배열(ministryAdmins 와 같은 모양). ⚠️ 성경암송 PUBLIC_CONFIG_KEYS 에 넣지 않는다(이름이 든다).
// ⚠️ 키가 아니라 사람으로 맞댄다 — 등록 뒤 소속이 바뀐 분의 옛 키는 user_identity_aliases 로 간다(keysToUserIds).
// ⚠️ 응답에 user_id 를 싣지 않는다. 손잡이는 identity_key(이름·소속으로 만든 값이라 비밀이 아니다).
// ⚠️ 읽고-고쳐-쓰기다. 화면이 저장 중 단추를 잠그고, 저장 뒤 **다시 읽은** 명단을 돌려준다.
const TESTERS_KEY = "ministryTesters";
const appUserWho = (u: any) =>
  (u.type === "교구" ? [u.gu, u.mok ? u.mok + "목장" : ""] : [u.bu, u.grade]).filter(Boolean).join(" ");

async function testerKeys(): Promise<string[]> {
  const { data, error } = await db.from("app_config").select("value").eq("key", TESTERS_KEY).maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? (data!.value as unknown[]).map((x) => norm(x)).filter(Boolean) : [];
}

async function testersView(keys: string[]) {
  const who = await keysToUserIds(keys);
  const ids = [...new Set(who.values())];
  const byId = new Map<string, any>();
  if (ids.length) {
    const { data, error } = await db.from("users")
      .select("id,identity_key,type,gu,mok,bu,grade,name,last_seen_at").in("id", ids);
    if (error) throw error;
    for (const u of (data ?? []) as any[]) byId.set(u.id, u);
  }
  return keys.map((k) => {
    const u = byId.get(who.get(k) ?? "");
    // 계정이 지워졌거나 키에 쓸 수 없는 글자가 섞였다 — 들어올 수 없으니 화면이 「빼 주세요」로 알린다
    if (!u) return { key: k, name: "", who: "", last_seen_at: null, moved: false, missing: true };
    return { key: k, name: u.name ?? "", who: appUserWho(u), last_seen_at: u.last_seen_at ?? null,
      moved: u.identity_key !== k, missing: false };
  });
}

async function ministryTesters() {
  return { ok: true, testers: await testersView(await testerKeys()) };
}

// 이름으로 앱 계정 찾기 — 앱에 한 번이라도 로그인한 분만 있다. 동명이인은 소속·마지막 접속으로 가른다.
async function ministryTesterFind(b: any) {
  const q = norm(b.name);
  if (!q) return { ok: false, error: "no-name" };
  if (q.length > 40) return { ok: false, error: "too-long" };
  const pattern = q.replace(/[\\%_]/g, "\\$&");
  const { data, error } = await db.from("users")
    .select("id,identity_key,type,gu,mok,bu,grade,name,last_seen_at")
    .ilike("name", `%${pattern}%`).order("name").order("id").limit(31);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const mine = new Set((await keysToUserIds(await testerKeys())).values());
  return { ok: true, more: rows.length > 30, users: rows.slice(0, 30).map((u) => ({
    key: u.identity_key, name: u.name ?? "", who: appUserWho(u), last_seen_at: u.last_seen_at ?? null, tester: mine.has(u.id) })) };
}

// 한 분씩 더하기·빼기 — 목록을 통째로 받지 않는다(옛 화면·동시 편집이 다른 분을 조용히 지운다)
async function ministryTesterSave(ctx: Ctx, b: any) {
  const op = String(b.op ?? "");
  const key = norm(b.key);
  if ((op !== "add" && op !== "remove") || !key || key.length > 200) return { ok: false, error: "invalid" };
  const keys = await testerKeys();
  let name = "", who = "";
  if (op === "add") {
    // 더할 때는 users 에 있는 키만 — 화면은 찾기 결과에서 고른다
    const { data: u, error } = await db.from("users").select("id,type,gu,mok,bu,grade,name").eq("identity_key", key).maybeSingle();
    if (error) throw error;
    if (!u) return { ok: false, error: "not-found" };
    // 같은 분이 옛 키로 이미 있으면 더하지 않는다(사람으로 맞댄다)
    const have = new Set((await keysToUserIds(keys)).values());
    if (have.has(u.id)) return { ok: true, already: true, testers: await testersView(keys) };
    keys.push(key);
    name = u.name ?? ""; who = appUserWho(u);
  } else {
    const i = keys.indexOf(key);
    if (i < 0) return { ok: true, already: true, testers: await testersView(keys) };   // 이미 빠졌다 — 쓰지도 기록하지도 않는다
    const [v] = await testersView([key]);
    name = v.name; who = v.who;
    keys.splice(i, 1);
  }
  const { error } = await db.from("app_config").upsert(
    { key: TESTERS_KEY, value: keys, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
  await audit(ctx, "ministry.tester", "", { op, name, who });
  return { ok: true, testers: await testersView(await testerKeys()) };
}

// ---------- 사역신청 — 사역팀 정보(4·5단계 · 2026-09-29) ----------
// 원문: docs/port/ministry-catalog-legacy.md 1.2·1.4·1.7·1.8. 원문 ministryCatalog 는 성도 화면과
// 공유해 게이트가 없었지만, 여기서는 관리자 전용(canCall)이라 ministryAdminError 를 두지 않는다.
// ⚠️ 연도는 요청이 아니라 3단계와 같은 ministryYear() — 관리자가 다른 연도를 몰래 넣을 수 없게.
const MINISTRY_ROSTER = ["접수완료", "임명확정"];   // 「지금 섬기는 분」에 넣을 신청 상태(원문 1.1)

// 신청 기간만 옮긴다(원문 ministryCfg 의 open/close/isOpen 계산) — 연도는 ministryYear() 가 이미 준다.
async function ministryPeriod(): Promise<{ open: string; close: string; isOpen: boolean }> {
  const { data, error } = await db.from("app_config").select("value").eq("key", "ministry").maybeSingle();
  if (error) throw error;
  const v = (data?.value ?? {}) as any;
  const open = norm(v.open), close = norm(v.close);
  const today = kstDay(new Date().toISOString());
  const isOpen = !!(open && close && today >= open && today <= close);
  return { open, close, isOpen };
}

async function ministryCatalogAdmin() {
  const year = await ministryYear();
  const period = await ministryPeriod();
  const rows = await allRows(() => db.from("ministry_catalog")
    .select("id,committee,group_name,team,kind,schedule_note,desc_note,capacity_note,"
      + "option_note,members_note,leader_note,sort_order,"
      + "day_sun,day_fri,day_sat,day_week,time_from,time_to," + MINISTRY_FREQ_COLS)
    .eq("year", year)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true }));   // ⚠️ 겹칠 때 차례가 흔들리지 않게 둘째 열쇠

  // 팀마다 「지금 섬기는 분」 — 관리자가 손으로 넣은 members_note 가 먼저, 그 뒤에 접수완료 이상인 신청자
  const roster = new Map<number, string[]>();
  const served = await allRows(() => db.from("ministry_orders")
    .select("team_id,name,position,who,status,created_at")
    .eq("year", year).in("status", MINISTRY_ROSTER)
    .order("created_at", { ascending: true }));
  for (const r of served) {
    const line = ministryMemberLine(r);
    if (!line) continue;
    const k = Number(r.team_id);
    if (!roster.has(k)) roster.set(k, []);
    roster.get(k)!.push(line);
  }

  return {
    ok: true,
    year,
    period,
    list: rows.map((r: any) => ({
      id: r.id, committee: r.committee, group: r.group_name, team: r.team,
      appoint: r.kind === "appoint",
      sched: ministryHtml(r.schedule_note, 160),
      desc: ministryHtml(r.desc_note, 400),
      capacity: ministryHtml(r.capacity_note, 80),
      leader: ministryHtml(r.leader_note, 200),
      members: [ministryHtml(r.members_note, 1200), (roster.get(Number(r.id)) ?? []).join("<br>")]
        .filter(Boolean).join("<br>"),
      // ⚠️ 관리자 편집기는 이것만 고친다 — 위 members 를 되돌려 저장하면 자동 명단이 굳어 중복된다
      membersNote: ministryHtml(r.members_note, 1200),
      opt: r.option_note,
      day: { sun: !!r.day_sun, fri: !!r.day_fri, sat: !!r.day_sat, week: !!r.day_week },
      freq: ministryFreqOf(r),
      from: r.time_from || "", to: r.time_to || "",
    })),
  };
}

// 설명 네 칸 + 담당 한 줄 + 「② 언제」 — 관리자만. **보내온 칸만** 고친다(원문 1.7 그대로).
async function ministryCatalogSave(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const { data: cur, error: e0 } = await db.from("ministry_catalog")
    .select("day_sun").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!cur) return { ok: false, error: "not-found" };

  const patch: Record<string, unknown> = {};
  for (const [key, max] of [["schedule_note", 160], ["desc_note", 400],
                            ["capacity_note", 80], ["members_note", 1200],
                            ["leader_note", 200]] as [string, number][]) {
    if (key in b) patch[key] = ministryHtml((b as any)[key], max);
  }
  for (const c of ["day_sun", "day_fri", "day_sat", "day_week",
                   ...MINISTRY_FREQ_KEYS.map((k) => "freq_" + k)]) {
    if (c in b) patch[c] = !!b[c];
  }
  for (const [key, label] of [["time_from", "시작 시각"], ["time_to", "끝 시각"]]) {
    if (!(key in b)) continue;
    const r = ministryTimeIn(b[key], label);
    if (r.err) return { ok: false, error: r.err };
    patch[key] = r.v;
  }
  // ⚠️ 시각은 주일에만 남긴다(DB 제약 ministry_catalog_time_sun_chk). day_sun 이 이번 요청에
  //    없으면 위에서 미리 읽어 둔 DB 값을 본다 — 시각만 고치는 저장이 매번 지워지지 않게.
  const sunOn = "day_sun" in b ? !!b.day_sun : !!cur.day_sun;
  if (!sunOn) { patch.time_from = null; patch.time_to = null; }

  // 잘린 칸을 돌려준다 — ⚠️ 이번에 보낸 칸만 견준다(안 보낸 칸을 재려다 undefined.length 500 사고, 원문 참고)
  const cut: string[] = [];
  for (const [key, label] of [["schedule_note", "시간"], ["desc_note", "하는 일"],
                              ["capacity_note", "필요 인원"], ["members_note", "지금 섬기는 분"],
                              ["leader_note", "담당(문의)"]] as [string, string][]) {
    if (!(key in patch)) continue;
    if (ministryHtml((b as any)[key], 99999).length > String(patch[key] ?? "").length) cut.push(label);
  }

  const { data, error } = await db.from("ministry_catalog")
    .update(patch).eq("id", id)
    .select("id,committee,team,schedule_note,desc_note,capacity_note,members_note,leader_note,"
      + "day_sun,day_fri,day_sat,day_week,time_from,time_to," + MINISTRY_FREQ_COLS).single();
  if (error) throw error;
  await audit(ctx, "ministry.catalog", String(id), { team: data.team, fields: Object.keys(patch) });
  // 걸러진 뒤의 값을 돌려준다 — 화면이 「내가 친 것」이 아니라 「실제로 저장된 것」을 보게
  return { ok: true, id: data.id, team: data.team,
           sched: data.schedule_note, desc: data.desc_note, capacity: data.capacity_note,
           membersNote: data.members_note, leader: data.leader_note ?? "", truncated: cut,
           day: { sun: !!data.day_sun, fri: !!data.day_fri,
                  sat: !!data.day_sat, week: !!data.day_week },
           freq: ministryFreqOf(data),
           from: data.time_from || "", to: data.time_to || "" };
}

// 한 위원회 안에서 보이는 차례를 바꾼다(원문 1.8 그대로) — 팀 추가·삭제·이름은 여기서 하지 않는다.
async function ministryCatalogOrder(ctx: Ctx, b: any) {
  const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter((n: number) => n > 0) : [];
  if (!ids.length) return { ok: false, error: "순서를 바꿀 팀이 없습니다" };
  if (new Set(ids).size !== ids.length) return { ok: false, error: "같은 팀이 두 번 들어 있습니다" };

  const { data, error } = await db.from("ministry_catalog")
    .select("id,year,committee,sort_order").in("id", ids);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length !== ids.length) return { ok: false, error: "없는 팀이 섞여 있습니다" };
  if (new Set(rows.map((r) => r.committee + "|" + r.year)).size !== 1) {
    return { ok: false, error: "한 위원회 안에서만 차례를 바꿀 수 있습니다" };
  }
  // ⚠️ 위원회 전체가 와야 한다 — 일부만 보내면 보내지 않은 줄의 자리를 빼앗는다
  const { count } = await db.from("ministry_catalog")
    .select("id", { count: "exact", head: true })
    .eq("year", rows[0].year).eq("committee", rows[0].committee);
  if ((count ?? 0) !== ids.length) {
    return { ok: false, error: "그 위원회의 팀이 " + count + "개인데 " + ids.length + "개만 왔습니다" };
  }

  // ⚠️ 그 줄들이 이미 갖고 있던 sort_order 값을 모아 다시 나눠 준다 — 0,1,2… 로 새로 매기면
  //    그 위원회가 목록 맨 앞으로 통째로 올라간다. 자리는 그대로 두고 앉는 사람만 바꾼다.
  const slots = rows.map((r) => Number(r.sort_order)).sort((a, b2) => a - b2);
  for (let i = 0; i < ids.length; i++) {
    const { error: e2 } = await db.from("ministry_catalog")
      .update({ sort_order: slots[i] }).eq("id", ids[i]);
    if (e2) throw e2;
  }
  await audit(ctx, "ministry.order", rows[0].committee, { ids });
  return { ok: true, n: ids.length };
}

// ---------- 사역신청 — 종이(오프라인) 명단 올리기 (4·5단계 Task 5 · 2026-09-29) ----------
// 원문: docs/port/ministry-paper-legacy.md 1.2·1.3·1.5·1.6~1.13. 원문의 게이트(ministryAdminError)는
// 옮기지 않는다 — canCall(ministry)이 dispatch 전에 이미 막으므로(ministryCatalogAdmin 과 같은 판단).
// ⚠️ save=false(살펴보기)·save=true(넣기)가 **같은 판정을 처음부터 다시** 돈다 — 화면이 보낸 살펴보기
//    결과를 믿지 않는다(그 사이 성도가 앱으로 신청했을 수 있다).
// ⚠️ 신청 기간(ministryPeriod)은 원문처럼 확인하지 않는다 — 종이 명단은 기간과 무관하게 언제나 열려 있다.

// 원문 1.5 — 종이 명단이 참조하는 잠금·상한 규칙만(isLocked·MINISTRY_LOCKED 는 ministryPaper 안에서
// 쓰이지 않아 옮기지 않는다 — 원문 발견 사항과 같다).
const MINISTRY_MAX = 3;
const countsToCap = (st: string) => st !== "미채택" && st !== "취소";

// 원문 1.3 ministryKeysToUsers → paperKeysToUsers. ⚠️ legacyNorm(NFC 로 바꾸지 않음)을 쓴다 —
// 위 keysToUserIds(authz 담당자 대조용)는 NFC 로 맞추므로 여기서는 쓸 수 없다(paper.ts 머리 설명 참고).
async function paperKeysToUsers(list: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(list.map((k) => legacyNorm(k)).filter(Boolean))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const { data: us, error: e1 } = await db.from("users").select("id,identity_key").in("identity_key", uniq);
  if (e1) throw e1;
  for (const u of (us ?? []) as any[]) out.set(u.identity_key, u.id);
  const rest = uniq.filter((k) => !out.has(k));
  if (rest.length) {
    const { data: al, error: e2 } = await db.from("user_identity_aliases").select("identity_key,user_id").in("identity_key", rest);
    if (e2) throw e2;
    for (const a of (al ?? []) as any[]) out.set(a.identity_key, a.user_id);
  }
  return out;
}

// ⚠️ 줄 판정에 쓰는 user_id 는 밖으로 내보내지 않는다 — 성경암송 api 는 user_id 하나로 그 사람 행세가 된다(2026-09-29 검토).
const paperPublicRows = (list: any[]) => list.map(({ user_id: _u, ...rest }) => rest);

// 원문 1.12 본체. ⚠️ ministry_catalog·ministry_orders 읽기는 원문의 평범한 select(.limit(5000))가
// 아니라 이 저장소의 allRows(PostgREST max_rows 로 조용히 잘리지 않게, 위 ministryList 등과 같은 규칙)로
// 옮겼다 — 유일한 의도적 변형.
async function ministryPaper(ctx: Ctx, b: any, save: boolean) {
  const year = await ministryYear();
  const status = "임명확정";
  const raws = Array.isArray(b.rows) ? b.rows : [];
  if (!raws.length) return { ok: false, error: "올릴 줄이 없습니다" };
  if (raws.length > PAPER_MAX_ROWS) {
    return { ok: false, error: "한 번에 " + PAPER_MAX_ROWS + "줄까지 올릴 수 있습니다 (지금 " + raws.length + "줄)" };
  }

  // 사역팀 — 이름만 적어도 찾게 하되, 같은 이름이 둘이면 위원회를 물어본다
  const cat = await allRows(() => db.from("ministry_catalog").select("id,committee,team,kind").eq("year", year));
  const flat = (s: string) => legacyNorm(s).replace(/\s+/g, "").toLowerCase();
  const byTeam = new Map<string, any[]>();
  const byFull = new Map<string, any>();
  for (const t of cat as any[]) {
    const k = flat(t.team);
    if (!byTeam.has(k)) byTeam.set(k, []);
    byTeam.get(k)!.push(t);
    byFull.set(flat(t.committee) + "|" + k, t);
  }

  // 올해 신청 전부 — 3개 상한·같은 사역 중복·같은 이름/번호 확인에 쓴다
  const orders = await allRows(() => db.from("ministry_orders")
    .select("id,user_id,name,who,phone,team_id,status").eq("year", year));

  const rows = raws.map((r: any, i: number) => ministryPaperOne(r, i));
  // 교적 표시(교인명부 · 2026-09-29) — 오류 줄에도 붙인다(이름·소속을 고칠 때 도움이 된다). 교적 값은 싣지 않는다.
  const look = await churchLookupLinked(rows.map((r: any) => r.name));   // 넣은 뒤 그때그때 잇기에도 쓴다(2026-10-01)
  const churchIdx = look ? look.idx : null;
  for (const r of rows) r.church = churchFor(churchIdx, applicantFromPaper(r));

  // 줄마다 계정 찾기 — 있으면 잇고, 없으면 save 때 만든다
  const keyOf = new Map<number, string[]>();
  const allKeys: string[] = [];
  for (const r of rows) {
    if (r.error) continue;
    const ks = ministryPaperKeys(r.gu, r.mok, r.name);
    keyOf.set(r.i, ks);
    allKeys.push(...ks);
  }
  const found = allKeys.length
    ? await paperKeysToUsers([...new Set(allKeys)]) : new Map<string, string>();

  // 이 뭉치 안에서 같은 사람이 여러 줄이면 그 수도 상한에 더한다
  const addedBy = new Map<string, number>();
  const heldOf = (uid: string) =>
    orders.filter((o: any) => o.user_id === uid && countsToCap(o.status)).length;

  for (const r of rows) {
    if (r.error) continue;
    const tk = flat(r.team);
    const cand = r.committee
      ? [byFull.get(flat(r.committee) + "|" + tk)].filter(Boolean)
      : (byTeam.get(tk) ?? []);
    if (!cand.length) { r.error = "사역 목록에 없는 이름입니다"; continue; }
    if (cand.length > 1) {
      r.error = "같은 이름의 사역이 " + cand.length + "개입니다 — 위원회도 적어 주세요 (" +
        cand.map((t: any) => t.committee).join(", ") + ")";
      continue;
    }
    const t = cand[0];
    const st = r.rowStatus || status;                 // 줄에 적었으면 그 줄만 그대로
    r.status = st;
    // 취소는 까닭 없이 못 한다 — 그 줄에 사유가 있어야 한다(한 건씩 바꿀 때와 같은 규칙)
    if (st === "취소" && !r.rowNote) {
      r.error = "취소 사유를 적어 주세요 (사유 칸)";
      continue;
    }
    if (t.kind === "appoint" && st !== "임명확정") {
      r.error = "지명으로 정해지는 자리입니다";
      continue;
    }
    r.team_id = t.id; r.committee = t.committee; r.team = t.team;

    const uid = (keyOf.get(r.i) ?? []).map((k) => found.get(k)).find(Boolean) || "";
    r.user_id = uid;
    r.isNew = !uid;

    if (uid) {
      // ⚠️ 앱으로 낸 것과 겹치면 새로 넣지 않고 그 건의 상태만 바꾼다(2026-09-18 성도님).
      //    종이는 결정 난 명단이라, 같은 사역이 두 건이 되는 것이 아니라 그 신청이 임명된 것이다.
      const had = orders.find((o: any) => o.user_id === uid && Number(o.team_id) === Number(t.id));
      if (had) {
        r.dupId = had.id;
        r.same = had.status === st;
        r.warn = r.same
          ? "이미 " + paperName(st) + " 상태입니다 — 그대로 둡니다"
          : "앱으로 낸 신청(" + paperName(had.status) + ")이 있습니다 — 그 건을 " +
            paperName(st) + "으로 바꿉니다";
        r.ok = true;
        continue;
      }
      if (countsToCap(st)) {
        const held = heldOf(uid) + (addedBy.get(uid) ?? 0);
        if (held + 1 > MINISTRY_MAX) {
          r.error = "이미 " + held + "건이라 " + MINISTRY_MAX + "개를 넘습니다"; continue;
        }
        addedBy.set(uid, (addedBy.get(uid) ?? 0) + 1);
      }
    }

    // 막지 않고 알리기만 하는 것들
    const warns: string[] = [];
    if (r.isNew) warns.push("앱에 없는 분 — 계정을 새로 만듭니다");
    if (orders.some((o: any) => o.name === r.name && o.phone === r.phone && o.user_id !== uid)) {
      warns.push("같은 이름·번호로 낸 다른 신청이 있습니다");
    }
    r.warn = warns.join(" · ");
    r.ok = true;
  }

  const good = rows.filter((r: any) => r.ok);
  if (!save) {
    return { ok: true, year, rows: paperPublicRows(rows), okCount: good.length, badCount: rows.length - good.length };
  }

  // ── 넣기 ──────────────────────────────────────────────────────
  // ⚠️ 한 줄이 실패해도 나머지는 들어간다 — 담당자가 고친 줄만 다시 올리면 된다.
  // ⚠️ 결정이 난 상태(임명확정·취소)면 decided_at 을 찍는다. 번호는 지우지 않는다(2026-10-01 친구 결정 — 「결정된 신청 번호 지우기」 단추·결정 뒤 180일 자동).
  const now = new Date().toISOString();
  let added = 0;
  const newIds = new Map<number, number>();   // 새로 넣은 신청 id — 그때그때 잇기용(응답엔 싣지 않는다)
  for (const r of good) {
    try {
      const st = r.status || status;
      const decided = st === "임명확정" || st === "취소";
      const why = r.rowNote || "";
      if (r.same) { r.saved = true; continue; }          // 이미 그 상태다 — 건드리지 않는다
      if (r.dupId) {                                      // 앱 신청이 있다 — 상태만 바꾼다
        // ⚠️ 신청일은 앱에 남은 그대로 둔다 — 성도님이 실제로 낸 날이다. 임명일만 종이 것으로.
        const patch: Record<string, unknown> = { status: st, updated_at: now };
        if (decided) patch.decided_at = r.decidedAt || now;
        if (why) patch.note = why;
        const { error: e5 } = await db.from("ministry_orders").update(patch).eq("id", r.dupId);
        if (e5) throw e5;
        r.saved = true; r.changed = true; added++;
        continue;
      }
      let uid = r.user_id;
      if (!uid) {
        const mok = r.mok.replace(/목장$/, "");
        const profile = { type: "교구", gu: r.gu, mok, bu: null, grade: null, name: r.name };
        const { data: u, error: e3 } = await db.rpc("member_login", {
          p_profile: { ...profile, identity_key: appIdentityKey({ type: "교구", gu: r.gu, mok, bu: "", grade: "", name: r.name }) } });
        if (e3) throw e3;
        uid = u.id;
      }
      // 종이에 적힌 날짜가 있으면 그것을 쓴다 — 없으면 지금
      const insert: Record<string, unknown> = {
        year, user_id: uid, name: r.name,
        who: r.gu + " " + r.mok.replace(/목장$/, "") + "목장",
        position: r.position, phone: r.phone,
        team_id: r.team_id, committee: r.committee, team: r.team, option: r.option || "",
        status: st, source: "paper", note: why || null,
        decided_at: decided ? (r.decidedAt || now) : null, updated_at: now,
      };
      if (r.appliedAt) insert.created_at = r.appliedAt;
      const { data: ins, error: e4 } = await db.from("ministry_orders").insert(insert).select("id").single();
      if (e4) throw e4;
      newIds.set(r.i, Number(ins.id));
      r.saved = true; added++;
    } catch (ex) {
      r.ok = false; r.saved = false;
      r.error = "넣지 못했습니다: " + String((ex as any)?.message ?? ex).slice(0, 120);
    }
  }
  // 이름·번호는 싣지 않는다 — 몇 건을 어떻게 처리했는지만 남긴다
  const byStatus: Record<string, number> = {};
  for (const r of good) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  await audit(ctx, "ministry.paper", String(year), {
    saved: added,
    created: good.filter((r: any) => r.saved && !r.dupId && !r.same).length,
    same: good.filter((r: any) => r.same).length,
    errors: rows.filter((r: any) => !r.saved).length,
    byStatus,
  });
  // 그때그때 잇기(2026-10-01) — 넣거나 바꾼 신청을 교인과 잇는다(읽어 둔 look · 실패해도 넣기 결과는 그대로).
  //   앱 신청과 겹친 줄(dupId — 바꿨거나 그대로)은 그 신청에 남은 이름·소속·번호로(신청 현황의 교적 표시와 같은 줄).
  const byId = new Map(orders.map((o: any) => [Number(o.id), o]));
  await linkOrders(good.filter((r: any) => r.saved).map((r: any) => {
    if (r.dupId) {
      const o = byId.get(Number(r.dupId));
      return { id: Number(r.dupId), name: o?.name ?? "", who: o?.who ?? "", phone: o?.phone ?? "" };
    }
    return { id: newIds.get(r.i) ?? 0, name: r.name, who: r.gu + " " + r.mok.replace(/목장$/, "") + "목장", phone: r.phone };
  }).filter((x: any) => x.id > 0), look);
  return { ok: true, year, rows: paperPublicRows(rows), added,
           changed: good.filter((r: any) => r.changed).length,
           same: good.filter((r: any) => r.same).length,
           failed: good.filter((r: any) => !r.saved).length,
           badCount: rows.length - good.length };
}

// ---------- 교인명부 (2026-09-29) ----------
// 설계: v2 docs/superpowers/specs/2026-09-29-church-people-directory-design.md
// ⚠️ 읽기만 — 원본은 dimode, 고치는 길은 tools/people/load_people.py 하나.
// ⚠️ 찾기·보기·내려받기는 admin_audit 에 남긴다(people.*). 현황은 숫자만이라 남기지 않는다.
// ⚠️ 사진은 비공개 칸 — 10분짜리 서명 주소만 준다. 목록은 그 쪽 사람 것만 만든다.
const PEOPLE_BUCKET = "church-people-photos";
const PEOPLE_LIST_COLS = "person_id,name,position,gender,age,mok1,mok3,school_dept,kind2,phone1,has_photo,household_id,household_rel";
const PEOPLE_ALL_COLS = "person_id,name,position,position_detail,gender,birth,lunar,age,spouse,spouse_position," +
  "household_head,household_rel,household_id,kind1,kind2,kind3,registered,reg_type,phone1,phone2,guide,email," +
  "mok_path,mok1,mok2,mok3,mok_leader,school_path,school_dept,teacher,youth_path,mission,address,address_jibun,has_photo";
// 가족(같은 신앙세대주) — 자세히 보기 아래에 이름·관계만. 연락처는 그분을 눌러 열어야 보인다(열람 기록이 남게).
const FAMILY_COLS = "person_id,name,household_rel,gender,age,position";

// 명부 기준 — 마지막으로 올린 기록. 한 번도 안 올렸으면 null(화면은 「아직 명부가 없어요」)
// id 는 잇기(people_links.import_id — 「어느 명부로 맞췄나」)에만 쓴다 — 응답에는 peopleSource(기준일·인원)만 나간다.
async function peopleImport(): Promise<{ id: number; source_date: string; total: number } | null> {
  const { data, error } = await db.from("church_people_imports").select("id,source_date,total")
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { id: Number(data.id), source_date: data.source_date, total: data.total } : null;
}
async function peopleSource(): Promise<{ source_date: string; total: number } | null> {
  const s = await peopleImport();
  return s ? { source_date: s.source_date, total: s.total } : null;
}

// 사역신청 줄을 교적과 맞댄다 — 명부가 한 번도 안 올라왔으면 null(화면이 표시를 아예 그리지 않는다).
// 신청자 이름으로만 묻는다(200개씩) — 8,672명 전체를 읽지 않게.
// kind2 — 판정에만 쓴다: 명부의 아이 가리기(people-match.ts candKid — 「남성」 갈래는 사역 줄도) · 성경필사 줄의 「옮겨 적은 줄」(churchForSignup).
//   ⚠️ 이 칸을 select 에서 빼면 아이를 못 가려 조용히 틀린다(오류가 아니다). 응답엔 { state, reason } 두 칸만 간다.
// 같은 물음에 교인ID 한 칸만 더 읽어 그때그때 잇기에도 쓴다(2026-10-01 · 묻기가 늘지 않는다 · person_id 는 잇기에만 — 응답에 싣지 않는다).
//   asked = 물어본 이름 키(명부에 없는 이름도) — 잇기는 물어본 이름의 줄만 맞춘다(안 물어본 이름을 「못 맞춤」으로 적지 않게).
async function churchLookupLinked(names: unknown[]): Promise<LinkLook | null> {
  const imp = await peopleImport();
  if (!imp) return null;
  const keys = lookupKeys(names);
  const idx = new Map<string, ReturnType<typeof toLinkCand>[]>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await db.from("church_people").select("person_id,name_key,mok1,mok3,school_dept,phone_digits,kind2")
      .in("name_key", keys.slice(i, i + 200));
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      if (!idx.has(r.name_key)) idx.set(r.name_key, []);
      idx.get(r.name_key)!.push(toLinkCand(r));
    }
  }
  return { idx, asked: new Set(keys), importId: imp.id };
}
async function churchLookup(names: unknown[]): Promise<Map<string, Cand[]> | null> {
  const look = await churchLookupLinked(names);
  return look ? look.idx : null;
}

function peopleFilter(q: any, s: Search) {
  if (s.name) q = q.ilike("name_key", `%${s.name}%`);
  if (s.tail) q = q.ilike("phone_digits", `%${s.tail}%`);
  // 거르기 넷은 여러 개(.in) — 빈 배열이면 거르지 않는다. 값의 " \ 는 parseSearch 가 이미 막았다(.in() 이 이스케이프 안 함)
  for (const k of FILTER_KEYS) if (s[k].length) q = q.in(k, s[k]);
  if (s.noPhoto) q = q.eq("has_photo", false);
  if (s.household) q = q.eq("household_id", s.household);
  return q;
}

// 정렬(화면의 표 머리·정렬 칩) — 찾기·내려받기가 같은 차례를 쓴다(끝은 늘 person_id)
function peopleOrder(q: any, s: Search) {
  for (const [col, opt] of sortOrder(s)) q = q.order(col, opt);
  return q;
}

// 사진 서명 주소 — 실패하면 사진만 빠진다(목록 전체를 실패로 만들지 않는다)
async function photoUrls(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!ids.length) return out;
  const { data, error } = await db.storage.from(PEOPLE_BUCKET).createSignedUrls(ids.map((id) => `${id}.jpg`), PHOTO_TTL);
  if (error) { console.error("photoUrls", error); return out; }
  for (const x of (data ?? []) as any[]) {
    const id = Number(String(x.path ?? "").replace(/\.jpg$/, ""));
    if (x.signedUrl && !x.error) out.set(id, x.signedUrl);
  }
  return out;
}

async function peopleSearch(ctx: Ctx, b: any) {
  const p = parseSearch(b);
  if (!p.ok) return { ok: false, error: p.error };
  const s = p.s;
  const source = await peopleSource();
  if (!source) return { ok: true, source: null, total: 0, page: 0, pageSize: PAGE_SIZE, rows: [] };
  const from = s.page * PAGE_SIZE;
  const { data, error, count } = await peopleOrder(
    peopleFilter(db.from("church_people").select(PEOPLE_LIST_COLS, { count: "exact" }), s), s)
    .range(from, from + PAGE_SIZE - 1);
  if (error && (error as any).code !== "PGRST103") throw error;   // PGRST103 = 끝을 넘은 쪽 → 빈 쪽
  let total = count ?? 0;
  if (error) {   // PGRST103 = 끝을 넘은 쪽 — 빈 쪽이지만 전체 수는 따로 세어 돌려준다(0 이라 하면 「없음」으로 보인다)
    const c = await peopleFilter(db.from("church_people").select("person_id", { count: "exact", head: true }), s);
    if (c.error) throw c.error;
    total = c.count ?? 0;
  }
  const rows = (error ? [] : data ?? []) as any[];
  const urls = await photoUrls(rows.filter((r) => r.has_photo).map((r) => r.person_id));
  await audit(ctx, "people.search", "", { q: norm(b.q).slice(0, 40), filters: searchDetail(s), total, page: s.page });
  return { ok: true, source, total, page: s.page, pageSize: PAGE_SIZE,
    rows: rows.map((r) => ({ ...r, photo: urls.get(r.person_id) ?? "" })) };
}

async function peoplePerson(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const { data, error } = await db.from("church_people").select(PEOPLE_ALL_COLS).eq("person_id", id).maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, error: "not-found" };
  const urls = data.has_photo ? await photoUrls([id]) : new Map<number, string>();
  let family: any[] = [];
  if (data.household_id) {
    const { data: fam, error: e2 } = await db.from("church_people").select(FAMILY_COLS)
      .eq("household_id", data.household_id).neq("person_id", id).order("person_id", { ascending: true }).limit(50);
    if (e2) throw e2;
    family = fam ?? [];
  }
  // 사역·성경필사 탭(2026-10-01) — 칸 지도로만(people-links.ts historyTabs) · 기록은 people.view 한 줄 그대로
  // ⚠️ 탭은 덧붙는 기능 — 읽기가 실패하면 history 를 빼고 예전 창(탭 없이)으로 연다(창 전체를 500 으로 만들지 않는다 · personHistorySafe)
  const history = await personHistorySafe(id);
  await audit(ctx, "people.view", String(id), { name: data.name });
  return withHistory({ ok: true, person: { ...data, photo: urls.get(id) ?? "" }, family }, history);
}

async function peopleStats() {
  const source = await peopleSource();
  if (!source) return { ok: true, source: null, stats: null };
  // person_id 는 교구 카드의 가구를 세대주 교구에 두는 데만 쓴다(householdsByGu) — statsOf 가 응답에 싣지 않는다
  const rows = await allRows(() => db.from("church_people")
    .select("person_id,mok1,mok3,kind2,kind3,position,school_dept,gender,age,has_photo,household_id").order("person_id", { ascending: true }));
  return { ok: true, source, stats: statsOf(rows) };
}

// 기록은 응답을 돌려주기 직전에 — 실패한 내려받기는 기록하지 않는다
async function peopleExport(ctx: Ctx, b: any) {
  const p = parseSearch({ ...b, page: 0 });
  if (!p.ok) return { ok: false, error: p.error };
  const source = await peopleSource();
  if (!source) return { ok: true, source: null, rows: [] };
  const rows = await allRows(() => peopleOrder(peopleFilter(db.from("church_people").select(PEOPLE_ALL_COLS), p.s), p.s));
  await audit(ctx, "people.export", "", { q: norm(b.q).slice(0, 40), filters: searchDetail(p.s), count: rows.length });
  return { ok: true, source, rows };
}

// ---------- 교인명부 — 기록과 교인 잇기(people_links · 2026-10-01) ----------
// 설계: v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §3 · 규칙은 people-links.ts(순수).
// ⚠️ 자동 쓰기는 people_links_auto()(SQL 006) 하나로만 — 그 안의 where 가 manual·none 을 덮지 않게 막는다.
// ⚠️ 그때그때 잇기는 덧붙는 일이다 — 실패해도 던지지 않는다(명단·넣기 결과는 그대로 · 서버 로그로만).
const LINK_COLS = "kind,row_id,person_id,link_how,match_basis,import_id";

async function linksOf(kind: LinkKind, ids: number[]): Promise<Map<number, LinkRow>> {
  const out = new Map<number, LinkRow>();
  const uniq = [...new Set(ids.filter((x) => Number.isSafeInteger(x) && x > 0))];
  for (let i = 0; i < uniq.length; i += 300) {
    const { data, error } = await db.from("people_links").select(LINK_COLS).eq("kind", kind).in("row_id", uniq.slice(i, i + 300));
    if (error) throw error;
    for (const r of (data ?? []) as any[]) out.set(Number(r.row_id), linkRowOf(r));
  }
  return out;
}
async function writeAutoLinks(recs: AutoRec[]): Promise<number> {
  let n = 0;
  for (let i = 0; i < recs.length; i += 500) {
    const { data, error } = await db.rpc("people_links_auto", { p_rows: recs.slice(i, i + 500) });
    if (error) throw error;
    n += Number(data) || 0;
  }
  return n;
}
// 이름·소속이 빈 옛 신청 줄은 앱 계정(users)에서 채운다 — ministryList 와 같은 규칙(appUserWho). user_id 는 메모리에만.
async function fillOrderNames(rows: any[]): Promise<any[]> {
  const need = [...new Set(rows.filter((r) => !r.name || !r.who).map((r) => r.user_id).filter(Boolean))];
  const umap = new Map<string, any>();
  for (let i = 0; i < need.length; i += 200) {
    const { data, error } = await db.from("users").select("id,type,gu,mok,bu,grade,name").in("id", need.slice(i, i + 200));
    if (error) throw error;
    for (const u of (data ?? []) as any[]) umap.set(u.id, u);
  }
  return rows.map((r) => {
    const u = umap.get(r.user_id);
    return { ...r, name: r.name || u?.name || "", who: r.who || (u ? appUserWho(u) : "") };
  });
}
async function linkOrders(rows: { id: number; name: string; who: string; phone?: string | null }[], look: LinkLook | null, force = false) {
  if (!look || !rows.length) return;
  try {
    const recs = orderAutoRecs(rows, look, await linksOf("order", rows.map((r) => Number(r.id))), force);
    if (recs.length) await writeAutoLinks(recs);
  } catch (e) { console.error("linkOrders", e); }
}
async function linkSignups(rows: any[], look: LinkLook | null, force = false) {
  if (!look || !rows.length) return;
  try {
    const recs = signupAutoRecs(rows, look, await linksOf("signup", rows.map((r) => Number(r.id))), force);
    if (recs.length) await writeAutoLinks(recs);
  } catch (e) { console.error("linkSignups", e); }
}
// 교적 후보를 아직 안 읽은 자리(명단 올리기 넣기) — 넣은 줄의 이름으로 한 번 묻고 잇는다
async function linkSignupsByName(rows: any[], force = false) {
  if (!rows.length) return;
  try { await linkSignups(rows, await churchLookupLinked(rows.map((r) => r.name)), force); }
  catch (e) { console.error("linkSignupsByName", e); }
}

// 기록 잇기 맞추기(총괄 · 설계 §3.1-1) — 새 명부를 올린 뒤 한 번. 사역신청 줄 전부(모든 해)와 성경필사 줄 전부(초안 회차 빼고)를
// 지금 명부로 다시 맞춘다(auto·줄 없음만 — manual·none 은 그대로). apply:true 가 아니면 세기만 한다(쓰지도 기록하지도 않는다).
async function peopleLinkSync(ctx: Ctx, b: any) {
  const apply = b.apply === true;
  if (!(await peopleImport())) return { ok: false, error: "no-directory" };
  const [orders, signups, evs, links] = await Promise.all([
    allRows(() => db.from("ministry_orders").select("id,user_id,name,who,phone").order("id", { ascending: true })),
    allRows(() => db.from("event_signups").select("id,event_id,who_type,group_name,sub_name,name").order("id", { ascending: true })),
    allRows(() => db.from("events").select("id,status").order("id", { ascending: true })),
    allRows(() => db.from("people_links").select(LINK_COLS).order("kind", { ascending: true }).order("row_id", { ascending: true })),
  ]);
  const ord = await fillOrderNames(orders);
  const draft = new Set(evs.filter((e) => e.status === "draft").map((e) => e.id));
  const sig = signups.filter((s) => !draft.has(s.event_id));
  const look = await churchLookupLinked([...ord.map((o) => o.name), ...sig.map((s) => s.name)]);
  if (!look) return { ok: false, error: "no-directory" };
  const cur = { order: new Map<number, LinkRow>(), signup: new Map<number, LinkRow>() };
  for (const l of links) { const r = linkRowOf(l); if (r.kind === "order" || r.kind === "signup") cur[r.kind].set(r.row_id, r); }
  const oRecs = orderAutoRecs(ord, look, cur.order, true), sRecs = signupAutoRecs(sig, look, cur.signup, true);
  const oc = syncCounts(cur.order, oRecs), sc = syncCounts(cur.signup, sRecs);
  const counts = { orders: ord.length, signups: sig.length, added: oc.added + sc.added, changed: oc.changed + sc.changed,
    unmatched: oc.unmatched + sc.unmatched };
  if (!apply) return { ok: true, dry: true, ...counts };
  const written = await writeAutoLinks([...oRecs, ...sRecs]);
  await audit(ctx, "people.linksync", String(look.importId), { ...counts, written });
  return { ok: true, dry: false, ...counts, written };
}

// ---------- 교인명부 — 「자세히」 창의 사역·성경필사 탭(2026-10-01 · 설계 §4·§5) ----------
// ⚠️ 칸은 아래 목록으로만 읽는다 — 메모(note)·취소 사유·번호(phone)·앱 계정(user_id)·ident_key·memo·answers 는 읽지도 않는다.
//    응답은 people-links.ts 칸 지도(historyTabs·unlinkedRows) — 시험이 키 집합을 대조한다.
const ORDER_TAB_COLS = "id,year,committee,team,option,status";
const SIGNUP_TAB_COLS = "id,event_id,who_type,group_name,sub_name,position";
const EVENT_TAB_COLS = "id,title,short_title,opens_on,status";
// b6 「사역 이력」 표(설계 §2.2 · b6 설계 §7) — 읽기만. link_how 는 「사람이 이음」 표시에만.
const HISTORY_TAB_COLS = "id,year,committee,team,role_title,position,mok,source,link_how";

async function rowsByIds(table: string, cols: string, ids: (number | string)[]): Promise<any[]> {
  const uniq = [...new Set(ids)];
  const out: any[] = [];
  for (let i = 0; i < uniq.length; i += 300) {
    const { data, error } = await db.from(table).select(cols).in("id", uniq.slice(i, i + 300));
    if (error) throw error;
    out.push(...((data ?? []) as any[]));
  }
  return out;
}
// 사역 이력 표가 아직 없으면(운영 SQL 005 전) 빈 것 — 사역 탭은 신청만 보인다(설계 §2.2)
async function historyRowsOf(personId: number): Promise<any[]> {
  const { data, error } = await db.from("ministry_history").select(HISTORY_TAB_COLS)
    .eq("person_id", personId).is("deleted_at", null).order("year", { ascending: false }).limit(500);
  if (missingTable(error)) return [];
  if (error) throw error;
  return (data ?? []) as any[];
}
// 이력으로 넘긴 신청(b6 §8 · order_id) — 빼지 않은 이력 줄이 가리키는 신청은 신청 쪽으로 읽지 않는다(두 번 보이지 않게)
async function movedOrders(orderIds: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  for (let i = 0; i < orderIds.length; i += 300) {
    const { data, error } = await db.from("ministry_history").select("order_id")
      .in("order_id", orderIds.slice(i, i + 300)).is("deleted_at", null);
    if (missingTable(error)) return out;
    if (error) throw error;
    for (const id of movedOrderIds((data ?? []) as any[])) out.add(id);
  }
  return out;
}
async function personHistory(personId: number) {
  const links = await allRows(() => db.from("people_links").select("kind,row_id,link_how")
    .eq("person_id", personId).in("link_how", ["auto", "manual"]).order("kind", { ascending: true }).order("row_id", { ascending: true }));
  const ids = (k: string) => links.filter((l) => l.kind === k).map((l) => Number(l.row_id));
  const [orders, signups, history, moved] = await Promise.all([
    rowsByIds("ministry_orders", ORDER_TAB_COLS, ids("order")),
    rowsByIds("event_signups", SIGNUP_TAB_COLS, ids("signup")),
    historyRowsOf(personId),
    movedOrders(ids("order")),
  ]);
  const events = await rowsByIds("events", EVENT_TAB_COLS, signups.map((s) => s.event_id));
  return historyTabs({ links, orders, signups, events, history, moved });
}
// 탭 자료 — 실패하면 null(오류는 서버 기록에만). 「자세히」 창·잇기 쓰기 응답이 이것을 쓴다(people-links.ts historyOrNull).
//   예: 함수가 SQL 006 보다 먼저 나가 people_links 가 없을 때(PGRST205 · 개발 함수는 한 벌을 함께 쓴다) · ministry_history 권한 오류.
const personHistorySafe = (personId: number) =>
  historyOrNull(() => personHistory(personId), (e) => console.error("personHistory", personId, e));

// 이름이 같고 아직 안 이어진 기록 — 이름으로 넓게 찾는다(신청·명단 전부를 읽어 메모리에서 nameKey 로 · evHistory 와 같은 방식 · 느리다).
// 창의 탭을 누를 때 한 번 부른다. 기록은 남기지 않는다(창을 연 people.view 가 이미 있다).
async function peopleHistory(b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const { data: p, error } = await db.from("church_people").select("person_id,name_key").eq("person_id", id).maybeSingle();
  if (error) throw error;
  if (!p) return { ok: false, error: "not-found" };
  const key = String(p.name_key ?? "");
  const [orders, signups, events] = await Promise.all([
    allRows(() => db.from("ministry_orders").select("id,user_id,year,committee,team,option,status,position,name,who").order("id", { ascending: true })),
    allRows(() => db.from("event_signups").select("id,event_id,who_type,group_name,sub_name,name,position").order("id", { ascending: true })),
    allRows(() => db.from("events").select(EVENT_TAB_COLS).order("id", { ascending: true })),
  ]);
  // 이름이 빈 옛 신청 줄만 앱 계정 이름을 묻는다(fillOrderNames) — 그다음 이 분 이름만 남긴다
  const mineO = (await fillOrderNames(orders.filter((o) => !o.name || nameKey(o.name) === key))).filter((o) => nameKey(o.name) === key);
  const mineS = signups.filter((s) => nameKey(s.name) === key);
  const [orderLinks, signupLinks, moved] = await Promise.all([
    linksOf("order", mineO.map((o) => Number(o.id))), linksOf("signup", mineS.map((s) => Number(s.id))),
    movedOrders(mineO.map((o) => Number(o.id))),
  ]);
  // 사역 이력(b6)에서 아무에게도 안 이어진 줄(person_id null — auto 못 맞춤·none) · 표가 없으면 빈 것
  //   이름은 b6 와 같은 열쇠(historyNameMatches — 끝 영문자·괄호) — 정확한 열쇠로 거르면 「홍길동A」 분의 창에 「홍길동」 줄이 안 뜬다
  let hist: any[] = [];
  try {
    hist = (await allRows(() => db.from("ministry_history").select("id,year,committee,team,role_title,position,mok,name,link_how")
      .is("deleted_at", null).is("person_id", null).order("id", { ascending: true }))).filter((h) => historyNameMatches(h.name, key));
  } catch (e) { if (!missingTable(e)) throw e; }
  return { ok: true, rows: unlinkedRows({ orders: mineO, signups: mineS, events, orderLinks, signupLinks, moved, history: hist }) };
}

// 「이분 것」(manual) · 「이분 아님」(none) · 「풀기」(auto — auto 로 되돌리고 그 줄만 다시 맞춘다).
// ⚠️ manual 은 대상 줄의 이름이 이 교인과 같아야 한다(다른 사람 줄을 잇지 못하게 · linkNameOk — 신청·명단 nameKey · 사역 이력 b6 열쇠) ·
//    그 교인이 지금 명부에 있어야 한다.
// ⚠️ none·auto 는 그 줄이 지금 이 분께 이어져 있을 때만(not-linked) — 이게 주인 확인이라 이름은 보지 않는다(2026-10-02 가지 마지막 검토:
//    규칙이 정확한 이름이 아닌 줄을 이었거나 새 명부에서 이름 열쇠가 바뀌면 「풀기」·「이분 아님」이 늘 other-name 으로 막혔다).
//    화면은 이어진 줄에만 그 단추를 둔다.
// ⚠️ 사람의 쓰기는 이 표에 바로 upsert(사람이 정한 것이 자동을 이긴다) · 응답에 이 분의 탭 자료를 다시 실어 보낸다(people.view 를 늘리지 않게).
const ORDER_LINK_COLS = "id,user_id,name,who,phone";
const SIGNUP_LINK_COLS = "id,event_id,who_type,group_name,sub_name,name";
async function peopleLink(ctx: Ctx, b: any) {
  const p = parseLink(b);
  if (!p.ok) return { ok: false, error: p.error };
  const { data: person, error: e0 } = await db.from("church_people").select("person_id,name_key").eq("person_id", p.person).maybeSingle();
  if (e0) throw e0;
  if (!person) return { ok: false, error: "not-found" };
  if (p.kind === "history") return await historyLinkFor(ctx, p, person);
  const kind = p.kind as LinkKind;
  let row: any = null;
  if (kind === "order") {
    const { data, error } = await db.from("ministry_orders").select(ORDER_LINK_COLS).eq("id", p.row).maybeSingle();
    if (error) throw error;
    row = data ? (await fillOrderNames([data]))[0] : null;
  } else {
    const { data, error } = await db.from("event_signups").select(SIGNUP_LINK_COLS).eq("id", p.row).maybeSingle();
    if (error) throw error;
    row = data;
  }
  if (!row) return { ok: false, error: "not-found" };
  if (!linkNameOk(kind, p.how, row.name, person.name_key)) return { ok: false, error: "other-name" };
  const cur = (await linksOf(kind, [p.row])).get(p.row);
  if (p.how !== "manual" && cur?.person_id !== p.person) return { ok: false, error: "not-linked" };
  const now = new Date().toISOString();
  let relinked = false;
  if (p.how === "auto") {
    const look = await churchLookupLinked([row.name]);
    if (!look) return { ok: false, error: "no-directory" };
    const rec = (kind === "order" ? orderAutoRecs([row], look, new Map(), true) : signupAutoRecs([row], look, new Map(), true))[0];
    const l = { person_id: rec?.person_id ?? null, basis: rec?.match_basis ?? "" };
    const { error } = await db.from("people_links").upsert(unlinkRec(kind, p.row, l, look.importId, now), { onConflict: "kind,row_id" });
    if (error) throw error;
    relinked = l.person_id === p.person;
  } else {
    const { error } = await db.from("people_links")
      .upsert(linkPatch(kind, p.row, p.how, p.person, ctx.member?.id ?? null, now), { onConflict: "kind,row_id" });
    if (error) throw error;
  }
  await audit(ctx, "people.link", String(p.row), { kind, row: p.row, how: p.how });
  // 쓰기·기록은 끝났다 — 탭 자료 다시 읽기가 실패해도 성공으로 알리고 history 만 뺀다(화면이 「창을 다시 열면」을 덧붙인다)
  return withHistory({ ok: true, how: p.how, relinked }, await personHistorySafe(p.person));
}

// 쓰기 하나를 거는 자리(검토 지적 2026-10-02 · history-db.ts link() 468~474행과 같은 패턴) — expect 가 있으면
//   UPDATE 의 WHERE 에도 eq(updated_at) 를 넣어, 그사이(이 함수의 SELECT 뒤 ~ 이 UPDATE 사이) 다른 요청이 먼저 쓴 줄을
//   조건 없이 덮지 않는다. 0행이면(그사이 바뀜·지워짐) 다시 읽어 conflict(아직 있음)·not-found(지워짐)를 가린다.
//   ⚠️ 이전엔 비교(앞서 읽은 h.updated_at 과 p.expect)만 앱 코드에서 하고 이 UPDATE 자체는 조건 없이 썼다 — 그 사이의
//   진짜 경합(TOCTOU)은 안 걸렸다. expect 가 없으면(옛 호출) 전처럼 걸지 않는다.
async function historyWriteGuarded(row: number, expect: string | null, expectAt: string, patch: Record<string, unknown>) {
  let upd = db.from("ministry_history").update(patch).eq("id", row).is("deleted_at", null);
  if (expect !== null) upd = upd.eq("updated_at", expectAt);
  const { data, error } = await upd.select("id");
  if (error) throw error;
  if ((data ?? []).length) return null;
  const { data: cur, error: ec } = await db.from("ministry_history").select("id,deleted_at").eq("id", row).maybeSingle();
  if (ec) throw ec;
  return { ok: false as const, error: (expect !== null && cur && !cur.deleted_at ? "conflict" : "not-found") as const };
}

// 사역 이력 줄 하나를 이 분께(설계 §5 · b6 §7) — 이름 확인(manual 만 · b6 열쇠)·이어진 줄만 풀기는 신청·명단과 같다(linkNameOk). 쓰는 모양은 b6 의 historyLinkPatch·historyUnlinkPatch,
// 풀기 뒤 그 줄 다시 맞추기는 b6 의 rematchHistoryRows. 기록 history.link 는 b6 사역 이력 메뉴와 같은 모양({op, year, by}) — 이름·교인ID 없음.
// ⚠️ 쓰기 차례(b6 약속①): 표 줄 고치기 → 기록(audit) → rematchHistoryRows 는 try/catch(다시 맞추기가 실패해도 넘어간다 — 던지면
//    이미 바뀐 표 상태와 응답(500)이 어긋난다). ⚠️ expect(b6 약속②) — 실제 잠금은 historyWriteGuarded 의 UPDATE WHERE 가 건다.
async function historyLinkFor(ctx: Ctx, p: { row: number; person: number; how: string; expect: string | null }, person: { person_id: number; name_key: string }) {
  const { data: h, error } = await db.from("ministry_history").select("id,year,name,person_id,link_how,deleted_at,updated_at").eq("id", p.row).maybeSingle();
  if (missingTable(error)) return { ok: false, error: "bad-kind" };
  if (error) throw error;
  if (!h || h.deleted_at) return { ok: false, error: "not-found" };
  if (!linkNameOk("history", p.how, h.name, person.name_key)) return { ok: false, error: "other-name" };
  if (p.how !== "manual" && Number(h.person_id) !== p.person) return { ok: false, error: "not-linked" };
  if (p.expect !== null && p.expect !== h.updated_at) return { ok: false, error: "conflict" };
  const now = new Date().toISOString();
  let relinked = false;
  if (p.how === "auto") {
    const fail = await historyWriteGuarded(p.row, p.expect, h.updated_at, historyUnlinkPatch(now));
    if (fail) return fail;
    await audit(ctx, "history.link", String(p.row), { op: "auto", year: h.year, by: "directory" });
    try {
      await rematchHistoryRows(db, [p.row]);
      const { data: after, error: e2 } = await db.from("ministry_history").select("person_id").eq("id", p.row).maybeSingle();
      if (e2) throw e2;
      relinked = Number(after?.person_id) === p.person;
    } catch (err) {
      console.error("history rematch after directory link", err);
      relinked = false;
    }
  } else {
    const patch = historyLinkPatch(p.how === "manual" ? p.person : null, ctx.member?.id ?? null, now);
    const fail = await historyWriteGuarded(p.row, p.expect, h.updated_at, patch);
    if (fail) return fail;
    await audit(ctx, "history.link", String(p.row), { op: p.how === "manual" ? "pick" : "none", year: h.year, by: "directory" });
    // 같은 목장·이름 자동 줄도 이 결정을 따르게(2026-10-05 · rematchHistoryRows 가 그 묶음을 찾는다) — 실패해도 넘어간다(약속①)
    try { await rematchHistoryRows(db, [p.row]); } catch (err) { console.error("history rematch after directory link", err); }
  }
  return withHistory({ ok: true, how: p.how, relinked }, await personHistorySafe(p.person));   // 다시 읽기 실패면 history 만 빠진다(peopleLink 와 같다)
}

// ---------- 성경필사(암송) — 이벤트 명단 (2026-09-29) ----------
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md · 옛 동작 원문 docs/port/event-roster-legacy.md
// 표 events·event_signups 는 **성경암송 앱의 것**이다 — 칸·제약·RLS 를 바꾸지 않는다(여기서는 읽고 쓰기만).
// ⚠️ 응답은 아래 칸 지도(evOut·rowOut·evHistory 줄)로만 만든다. user_id 는 판정(hasUser·사람 묶음)에 쓰려고
//    읽기만 하고 내보내지 않는다 — 성경암송 api 는 user_id 하나로 그 사람 행세가 된다. 성도님 memo·answers·phone 은
//    이 절의 어느 칸 목록에도 없다(성도님 메모 memo 와 담당자 메모 note 는 다른 칸).
// ⚠️ 줄은 allRows 로 읽는다(1,000행에서 오류 없이 잘린다 — 2026-09-29 성경암송 576acfc), 인원은 head 개수.
// ⚠️ 자격 회차 판정은 events-rules.ts 의 isEligEvent(needs) 하나 — 여기서 따로 만들지 않는다(대조 뒤 결정).
// ⚠️ sort_order 를 빼지 말 것 — 빠지면 eventFields 가 "0" 으로 읽어 회차 설정을 저장할 때마다 차례가 0 으로 바뀐다.
const EV_COLS = "id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,updated_at,needs,sort_order";
// 줄 칸 목록은 이것 하나 — 명단(evRoster)·한 분 더하기·고치기(Task 7)·올리기(Task 8)가 모두 이것을 쓴다(두 벌 두지 않는다)
const EV_ROW_COLS = "id,event_id,user_id,who_type,group_name,sub_name,name,position,note,source,created_at,updated_at";

// 회차 한 줄 — 화면(📋 회차·명단)이 기대하는 칸 그대로. needs·copy 는 싣지 않는다 · sort_order 는 회차 설정 창이 쓴다(성도님 앱 차례 · 비밀이 아니다)
function evOut(ev: any, count: number) {
  return {
    id: ev.id, title: ev.title ?? "", short_title: ev.short_title ?? "", subtitle: ev.subtitle ?? "",
    season: ev.season ?? "", kind: ev.kind ?? "signup", status: ev.status,
    opens_on: ev.opens_on, closes_on: ev.closes_on, list_until: ev.list_until ?? null,
    sort_order: Number(ev.sort_order ?? 0) || 0,
    updated_at: ev.updated_at ?? "",                         // 회차 설정 저장의 expect
    count,                                                   // head 개수(evCountMap)
    listedNow: evtListable(ev, kstToday()),                  // 지금 성도님께 보이는가(KST · 성경암송 evtListable 규칙)
    hasEligibility: isEligEvent(ev.needs),                   // 자격 회차(더하기·올리기를 막는 쪽 · Task 7·8 도 같은 함수)
  };
}

// 명단 한 줄 — 명시적 칸 지도. church 는 { state, reason } | null(교적 값은 싣지 않는다).
function rowOut(r: any, church: Church | null) {
  return {
    id: r.id, who_type: r.who_type ?? "", group: r.group_name ?? "", sub: r.sub_name ?? "",
    name: r.name ?? "", position: r.position ?? "", note: r.note ?? "",
    source: r.source === "app" ? "app" : "import",
    hasUser: !!r.user_id,                                    // 앱 계정과 이어졌는가(user_id 자체는 싣지 않는다)
    at: r.created_at ? kstDay(r.created_at) : "",            // 낸 날(KST 「YYYY-MM-DD」)
    updated_at: r.updated_at ?? "",                           // 줄 고치기·빼기의 expect(DB 문자열 그대로)
    church,
  };
}

// 회차 하나(EV_COLS — needs·updated_at 포함) · 모양이 틀린 id 는 묻지 않고 null
async function evRead(id: unknown): Promise<any | null> {
  const s = legacyNorm(id);
  if (!EVT_ID_RE.test(s)) return null;
  const { data, error } = await db.from("events").select(EV_COLS).eq("id", s).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// 회차마다 인원 — 행을 받지 않고 head 개수만(행을 받아 세면 1,000에서 잘린다)
async function evCountMap(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  await Promise.all([...new Set(ids)].map(async (id) => {
    const { count, error } = await db.from("event_signups").select("id", { count: "exact", head: true }).eq("event_id", id);
    if (error) throw error;
    out.set(id, count ?? 0);
  }));
  return out;
}

// 줄의 소속 한 줄 — events-stats.ts 의 affLabel 을 그대로 부른다(사본을 두지 않는다 — CONTRACT 5절:
// 이력(evHistory groups[].label)과 통계(repeaters[].label)가 같은 글자를 쓰게).
function evWho(r: any): string {
  return affLabel(r);
}

// 📋 회차 목록 — 최근(마감일 늦은) 회차 먼저
async function evEvents() {
  const evs = await allRows(() => db.from("events").select(EV_COLS)
    .order("closes_on", { ascending: false }).order("id", { ascending: true }));
  const counts = await evCountMap(evs.map((e) => e.id));
  return { ok: true, today: kstToday(), events: evs.map((e) => evOut(e, counts.get(e.id) ?? 0)) };
}

// 📋 한 회차의 명단 전부 + 줄마다 교적 표시
async function evRoster(b: any) {
  const ev = await evRead(b.event_id);
  if (!ev) return { ok: false, error: "not-found" };
  const [counts, rows, src] = await Promise.all([
    evCountMap([ev.id]),
    allRows(() => db.from("event_signups").select(EV_ROW_COLS).eq("event_id", ev.id).order("id", { ascending: true })),
    peopleSource(),
  ]);
  // 교적 표시 — 명부가 한 번도 안 올라왔으면 null(화면이 표시를 그리지 않는다). 이름으로만 묻는다(200개씩).
  const look = await churchLookupLinked(rows.map((r) => r.name));
  const idx = look ? look.idx : null;
  if (ev.status !== "draft") await linkSignups(rows, look);   // 그때그때 잇기(2026-10-01 · 초안 회차는 잇지 않는다)
  return {
    ok: true,
    event: evOut(ev, counts.get(ev.id) ?? 0),
    source: src ? { date: src.source_date, total: src.total } : null,
    rows: rows.map((r) => rowOut(r, churchForSignup(idx, r))),   // 옮겨 적은 줄은 맞음(transcribedSame) — 이름을 누르면 창(evPerson)과 같은 식
  };
}

// 👤 이름으로 모든 회차의 줄 — 사람 묶음(합집합)마다. 이름은 NFC·띄어쓰기 없음(nameKey)으로 맞댄다.
// ⚠️ DB 에 name=eq 로 묻지 않는다 — 맥에서 온 자모분리(NFD)·띄어쓰기가 다른 줄을 놓친다. 줄 전체를 쪽을
//    나눠 읽고(2026-09-29 기준 2,834행 = 세 쪽) 여기서 거른다. 교적 값이 아니라 기록은 남기지 않는다.
async function evHistory(b: any) {
  // 이름은 메모리에서만 맞댄다(DB 에 묻지 않는다) — 괄호·쉼표가 든 옛 이름도 받는다(readName · SEC-7)
  const q = readName(b.name);
  if (q.error) return { ok: false, error: q.error };
  const key = q.key;
  const [evs, all] = await Promise.all([
    allRows(() => db.from("events").select("id,title,closes_on").order("id", { ascending: true })),
    allRows(() => db.from("event_signups").select("id,event_id,user_id,who_type,group_name,sub_name,name,position,source")
      .order("id", { ascending: true })),
  ]);
  const evBy = new Map(evs.map((e) => [e.id, e]));
  // 최근 회차 먼저 — 마감일 늦은 것 → 같은 마감일이면 회차 id 큰 것 → 같은 회차면 줄 id 큰 것.
  // ⚠️ 이 차례는 events-stats.ts statsOf 가 「가장 최근 줄」을 고르는 차례(마감일·회차 id 오름차순의 마지막, 같은 회차면 뒤 줄)와
  //    **같아야** 한다 — 그래야 이력 이름표와 통계 「여러 번 참여한 분」 이름표가 같은 글자가 된다. 묶음 순번도 이 차례로 매겨진다.
  //    두 곳 모두 코드 포인트 차례(codeCmp)로 — localeCompare 는 ICU 에 따라 「-」 같은 글자의 차례가 달라질 수 있다.
  const rows = all.filter((r) => nameKey(r.name) === key).sort((x, y) =>
    codeCmp(String(evBy.get(y.event_id)?.closes_on ?? ""), String(evBy.get(x.event_id)?.closes_on ?? ""))
    || codeCmp(String(y.event_id), String(x.event_id)) || Number(y.id) - Number(x.id));
  const gi = personGroups(rows as StatIn[]);
  const groups: { n: number; label: string; rows: any[] }[] = [];
  rows.forEach((r, i) => {
    const g = gi[i];
    // 묶음 이름표 = 「이름 · 소속」(가장 최근 줄 · CONTRACT 5절 — 통계 repeaters 의 name·label 과 같은 글자).
    // 순번(n)은 user_id 대신 쓰는 이름표다 — user_id 로 이름표를 만들지 않는다.
    if (!groups[g]) groups[g] = { n: g + 1, label: `${legacyNorm(r.name)} · ${evWho(r)}`, rows: [] };
    const e = evBy.get(r.event_id);
    groups[g].rows.push({
      event_id: r.event_id, title: e?.title ?? "", closes_on: e?.closes_on ?? "",
      who_type: r.who_type ?? "", group: r.group_name ?? "", sub: r.sub_name ?? "",
      position: r.position ?? "", source: r.source === "app" ? "app" : "import", hasUser: !!r.user_id,
    });
  });
  return { ok: true, groups: groups.filter(Boolean) };
}

// 👤 통계 — 고른 회차(빈 배열 = 전부)로 회차별 인원 · 교구(부서)×회차 · 여러 번 참여한 분
async function evStats(b: any) {
  if (!Array.isArray(b.event_ids)) return { ok: false, error: "bad-event-id" };
  const ids = [...new Set(b.event_ids.map((x: unknown) => legacyNorm(x)))] as string[];
  if (ids.length > 100 || ids.some((id) => !EVT_ID_RE.test(id))) return { ok: false, error: "bad-event-id" };
  const evsAll = await allRows(() => db.from("events").select("id,title,closes_on")
    .order("closes_on", { ascending: false }).order("id", { ascending: true }));
  const evs = ids.length ? evsAll.filter((e) => ids.includes(e.id)) : evsAll;   // 없는 id 는 조용히 빠진다
  if (!evs.length) return { ok: true, ...eventStatsOf([], []) };
  const pick = evs.map((e) => e.id);
  // 고른 것이 있으면 .in() 으로 좁힌다(회차 id 는 EVT_ID_RE 로 좁힌 영문 슬러그 · 최대 100개라 주소가 깨지지 않는다).
  // 빈 배열(= 전부)이면 거르지 않고 다 읽는다 — 회차가 늘어도 주소가 길어지지 않게.
  const rows = await allRows(() => {
    let q = db.from("event_signups").select("id,event_id,user_id,who_type,group_name,sub_name,name,position");
    if (ids.length) q = q.in("event_id", pick);
    return q.order("id", { ascending: true });
  });
  return { ok: true, ...eventStatsOf(rows as StatIn[], evs) };
}

// ---------- 성경필사(암송) — 회차 만들기·설정 (Task 6) ----------
// 설계 §2 evEventCreate·evEventSave · 옛 동작: 성경암송 api eventSave(docs/port/event-roster-legacy.md).
//   옛것은 만들기·고치기를 upsert 하나로 했다 — 여기서는 둘로 나눈다(만들기는 insert 만 · 고치기는 있는 회차만).
// ⚠️ needs·copy·kind 는 받지 않는다(EV_EDIT_KEYS 밖) — 가을 말씀 동행의 자격 규칙·문구가
//    저장 한 번에 지워지지 않게. 보내도 버린다. sort_order 는 2026-09-30 부터 받는다(정수 글자 -999~999 ·
//    DB 에 쓸 때 eventDbPatch 가 수로 · 새 회차는 보내지 않으면 0) — 성도님 앱 eventOpenList 의 셋째 잣대(마감일이 같은 회차끼리).
// ⚠️ 글자 칸 길이(EV_TEXT_MAX — 창의 maxlength 와 같은 값)·차례는 checkEventEdit 가 **바꾼 칸만** 본다(SEC-6).
// ⚠️ 쓴 뒤 다시 읽지 않는다 — insert/update 에서 .select(EV_COLS) 로 바로 받는다(쓴 뒤 not-found·기록 빠짐이 없게 · SEC-5).
// ⚠️ 공개 확인은 **쓰기 전에** — 지금 성도님께 안 보이는 회차가 이 저장으로 보이게 되면(evtListable 전후)
//    confirmListed:true 없이는 아무것도 쓰지 않고 needs-confirm. 화면이 확인 창을 띄운 뒤 다시 보낸다.
//    저장한 뒤에 물으면 확인을 누르기 전부터 명단(이름·소속·직분)이 로그인 없이 보인다.
//    상태를 open·closed 로 바꿀 때만이 아니라 지난 공개 종료일을 비우거나 늦출 때도 같다.
// ⚠️ 자격 회차의 기준일은 eligibilityStart(needs) 하나로만 꺼낸다(Task 2 · evOut 의 hasEligibility 는 isEligEvent).
async function evEventCreate(ctx: Ctx, b: any) {
  const src = b.event && typeof b.event === "object" && !Array.isArray(b.event) ? b.event : {};
  const id = typeof src.id === "string" ? src.id.trim() : "";
  if (!EVT_ID_RE.test(id)) return { ok: false, error: "bad-event-id" };   // 만든 뒤엔 못 바꾼다(주소 ?ev= 에 쓰인다)
  const blank: EvEvent = { id, title: "", short_title: "", subtitle: "", season: "",
    opens_on: "", closes_on: "", status: "draft", list_until: null, sort_order: "0" };
  // 새 회차는 draft 로만 — status 는 EV_CREATE_KEYS 에 없어 보내도 버려진다. 공개는 만든 뒤 설정에서(공개 확인을 거쳐).
  const ev: EvEvent = { ...mergeEventPatch(blank, pickEventPatch(src, EV_CREATE_KEYS)), id, status: "draft" };
  const bad = checkEvent(ev, null);   // 같은 검사 함수 — DB CHECK(기간)에 걸려 500 이 나지 않게. 새 회차엔 자격 규칙이 없다.
  if (bad) return { ok: false, error: bad };
  const bad2 = checkEventEdit(null, ev);   // 글자 길이·차례(만들기 = 모든 칸)
  if (bad2) return { ok: false, error: bad2 };
  // 쓴 줄을 그대로 받는다(.select(EV_COLS)) — 다시 읽다 null 이면 기록 없이 not-found 가 나던 자리(evread-null-after-write)
  const { data: saved, error } = await db.from("events").insert({
    id, title: ev.title, short_title: ev.short_title, subtitle: ev.subtitle, season: ev.season,
    opens_on: ev.opens_on, closes_on: ev.closes_on, list_until: ev.list_until, status: "draft",
    sort_order: Number(ev.sort_order) || 0,
    kind: "signup", needs: structuredClone(BE_NEEDS_DEFAULT),   // 앱 등록 폼에 직분 칸이 생기게(설계 §2) — 사본을 넣는다
    // copy·created_at·updated_at 은 DB 기본값({} · now())
  }).select(EV_COLS).single();
  if (error) {
    if ((error as any).code === "23505") return { ok: false, error: "exists" };   // 있는 회차는 덮지 않는다
    throw error;
  }
  const f = eventFields(saved);
  const after: Record<string, string | null> = {};
  for (const k of EV_EDIT_KEYS) after[k] = (f as unknown as Record<string, string | null>)[k];
  await audit(ctx, "event.create", id, { title: f.title, before: {}, after });
  return { ok: true, event: evOut(saved, 0) };
}

async function evEventSave(ctx: Ctx, b: any) {
  const cur = await evRead(b.event_id);   // 모양이 틀린 id·빈 id 는 묻지 않고 null(Task 5)
  if (!cur) return { ok: false, error: "not-found" };
  const id: string = cur.id;
  // 화면이 본 판과 지금 판이 다르면 — 그사이 누가 고쳤다(expect = 그 회차의 updated_at 글자 그대로)
  if (typeof b.expect !== "string" || b.expect !== cur.updated_at) return { ok: false, error: "conflict" };
  const before = eventFields(cur);
  const next: EvEvent = { ...mergeEventPatch(before, pickEventPatch(b.patch, EV_EDIT_KEYS)), id };
  // 합친 회차 전체를 검사한다 — 마감일만 늦춰 공개 종료일보다 뒤로 가는 것도 여기서 잡힌다
  const bad = checkEvent(next, eligibilityStart(cur.needs));
  if (bad) return { ok: false, error: bad };
  // 글자 길이·차례 — **바꾼 칸만**(옛 값이 길거나 차례가 범위 밖이어도 다른 칸 저장은 막지 않는다 · SEC-6)
  const bad2 = checkEventEdit(before, next);
  if (bad2) return { ok: false, error: bad2 };
  const today = kstToday();
  const listedBefore = evtListable(before, today);
  const listedNow = evtListable(next, today);
  if (!listedBefore && listedNow && b.confirmListed !== true) return { ok: false, error: "needs-confirm" };
  const diff = eventDiff(before, next);
  let saved = cur;
  // 인원은 쓰기 **전에** 센다 — 회차 설정은 인원을 바꾸지 않는다. 쓴 뒤에 세다 실패하면 저장은 됐는데 500 이 났다(SEC-5).
  const count = (await evCountMap([id])).get(id) ?? 0;
  if (Object.keys(diff.after).length) {
    // 조건부 update — 읽은 뒤 쓰기 전 사이에 다른 담당자가 저장했으면 0행 → conflict(남의 저장을 덮지 않는다)
    // 쓴 줄을 그대로 받는다(.select(EV_COLS)) — 다시 읽다 null 이면 기록 없이 not-found 가 나던 자리(evread-null-after-write)
    const { data: upd, error } = await db.from("events")
      .update({ ...eventDbPatch(diff.after), updated_at: new Date().toISOString() })
      .eq("id", id).eq("updated_at", cur.updated_at).select(EV_COLS);
    if (error) throw error;
    if (!upd?.length) return { ok: false, error: "conflict" };
    saved = upd[0];
    await audit(ctx, "event.settings", id, { title: saved.title, before: diff.before, after: diff.after });
  }
  return { ok: true, event: evOut(saved, count), listedBefore, listedNow };
}

// ---------- 성경필사(암송) — 한 분 더하기 · 줄 고치기 · 빼기 (계획 Task 7) ----------
// 설계 §1 「같은 분 판정과 앱 계정 잇기」·§2 evRowAdd/evRowSave/evRowDelete.
// ⚠️ 앱 계정은 **조회만** 해서 잇는다 — member_login 을 부르지 않는다(주간 리포트 「신규 인원」이 부풀지 않게).
// ⚠️ user_id·ident_key 는 서버 안에서만 쓴다 — 응답은 rowOut(명시적 칸 지도) 하나로만 만든다.
// ⚠️ 줄 칸은 Task 5 의 EV_ROW_COLS 하나만 쓴다(같은 목록을 두 벌 두지 않는다).
// ⚠️ 자격 회차 판정은 events-rules.ts isEligEvent(needs) 하나 — 화면의 hasEligibility(evOut)와 같은 함수다.

// 신원 키 → 앱 계정 id 들. users.identity_key 와 user_identity_aliases(소속을 고친 분의 옛 키) 둘 다 본다.
// ⚠️ 한글 키는 주소가 길다 — 100개·6KB 씩(inChunks) 나눠 묻는다(성경암송 eventImport 는 164개에서 GET 주소 한도를 넘어 조용히 0명이 됐다).
// ⚠️ 키를 다시 다듬지 않는다 — candidateKeys 가 appIdentityKey 로 만든 그대로 맞댄다(keysToUserIds 는 NFC 로 맞춰서 못 쓴다).
async function usersByKeys(keys: string[]): Promise<Map<string, string[]>> {
  const uniq = askableKeys(keys);
  const out = new Map<string, string[]>();
  const add = (k: string, id: string) => {
    const l = out.get(k) ?? [];
    if (!l.includes(id)) l.push(id);
    out.set(k, l);
  };
  for (const part of inChunks(uniq)) {                     // 100개·6KB 씩(한글 키 주소 길이 · SEC-4)
    const { data: us, error: e1 } = await db.from("users").select("id,identity_key").in("identity_key", part);
    if (e1) throw e1;
    for (const u of (us ?? []) as any[]) add(u.identity_key, u.id);
    const { data: al, error: e2 } = await db.from("user_identity_aliases").select("identity_key,user_id").in("identity_key", part);
    if (e2) throw e2;
    for (const a of (al ?? []) as any[]) add(a.identity_key, a.user_id);
  }
  return out;
}

// 설계 §1 같은 분 판정 3 — 그 회차에 ① 신원 키가 후보에 드는 줄, 또는 ② 후보 키로 찾은 계정의 줄(앱에서 낸 줄 포함)이 있으면 already.
// user_id 가 없는 줄은 DB unique 가 막지 않으므로(NULLS DISTINCT) 이 판정이 유일한 막이다. excludeId = 고치는 줄 자신.
async function sameInEvent(eventId: string, row: EvRow, excludeId?: number): Promise<"already" | null> {
  const keys = askableKeys(sameKeys(row));
  for (const part of inChunks(keys)) {                     // 100개·6KB 씩(한글 키 주소 길이 · SEC-4)
    let q = db.from("event_signups").select("id").eq("event_id", eventId).in("ident_key", part);
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.limit(1);
    if (error) throw error;
    if ((data ?? []).length) return "already";
  }
  const ids = [...new Set([...(await usersByKeys(keys)).values()].flat())];
  for (let i = 0; i < ids.length; i += 200) {
    let q = db.from("event_signups").select("id").eq("event_id", eventId).in("user_id", ids.slice(i, i + 200));
    if (excludeId) q = q.neq("id", excludeId);
    const { data, error } = await q.limit(1);
    if (error) throw error;
    if ((data ?? []).length) return "already";
  }
  // ③ 교구 줄 — 한쪽 목장이 비었거나 99 면 같은 교구·같은 이름은 같은 분(최종 검토 I1 · events-rows.ts looseSame).
  //   🔎 교인명부로 목장(20)을 채워 더했는데 회차에는 앱의 99 줄·목장 빈 줄이 있으면 신원 키가 달라 위에서 못 찾는다.
  //   같은 교구·같은 이름의 줄만 읽어(몇 줄 안 된다) 판정은 순수 함수로 한다 — sub_name 의 빈 글자를 .in() 으로 묻지 않게.
  if (looseKey(row)) {
    const variants = (v: string) => [...new Set([v, v.normalize("NFC"), v.normalize("NFD")])];
    const names = askableKeys(variants(legacyNorm(row.name)));
    const groups = askableKeys(variants(legacyNorm(row.group_name)));
    if (names.length && groups.length) {
      let q = db.from("event_signups").select("id,who_type,group_name,sub_name,name")
        .eq("event_id", eventId).eq("who_type", "교구").in("group_name", groups).in("name", names);
      if (excludeId) q = q.neq("id", excludeId);
      const { data, error } = await q.order("id", { ascending: true }).limit(200);
      if (error) throw error;
      if (((data ?? []) as any[]).some((r) => looseSame(row, r as EvRow))) return "already";
    }
  }
  return null;
}

async function evRowRead(id: number): Promise<any | null> {
  const { data, error } = await db.from("event_signups").select(EV_ROW_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// 한 줄의 교적 표시 — 이름 하나만 묻는다. 쓰기 **전에** 부른다(쓴 뒤에 실패해 500 이 되지 않게).
// 명단(evRoster)과 같은 식(churchForSignup — 옮겨 적은 줄은 맞음).
async function evRowChurch(r: { who_type: string; group_name: string; sub_name: string; name: string }) {
  return churchForSignup(await churchLookup([r.name]), r);
}

// 한 분 더하기 — source='import' · 메모 앞에 「담당자가 더함」 · 계정은 **하나일 때만** 잇는다(둘 이상이면 알리기만).
// 자격 회차(가을 말씀 동행)는 막는다 — 가을 설계 §12 「대리 등록은 보정 창구로만」.
async function evRowAdd(ctx: Ctx, b: any) {
  const ev = await evRead(b.event_id);                 // 모양이 틀린 id 는 묻지 않고 null(Task 5)
  if (!ev) return { ok: false, error: "not-found" };
  if (isEligEvent(ev.needs)) return { ok: false, error: "eligibility-event" };
  const row = formRow(b.row);
  const bad = checkRow(row);
  if (bad) return { ok: false, error: bad };
  // 메모 길이는 머리 표기(「담당자가 더함 / 」)를 붙인 **뒤**로 센다(계약 §5 — 창의 글자 수 상한은 480)
  const note = tagNote(ADD_TAG, (b.row ?? {}).note);
  const nbad = checkNote(note);
  if (nbad) return { ok: false, error: nbad };
  if (await sameInEvent(ev.id, row)) return { ok: false, error: "already" };

  // sameInEvent 가 통과했으니 찾은 계정은 이 회차에 없다(그 사이 앱에서 냈으면 아래 23505 가 already 로 돌린다)
  const accounts = [...new Set([...(await usersByKeys(sameKeys(row))).values()].flat())];
  const userId = accounts.length === 1 ? accounts[0] : null;
  const warnings: string[] = [];
  if (accounts.length > 1) warnings.push(`같은 이름·소속의 앱 계정이 ${accounts.length}개라 잇지 않았어요`);
  if (oddPosition(row.position)) warnings.push(`직분 「${row.position}」 — 앱 직분 목록에 없어요(적은 그대로 넣었어요)`);
  const look = await churchLookupLinked([row.name]);   // 교적 표시와 그때그때 잇기가 같은 후보(2026-10-01)
  const church = churchForSignup(look ? look.idx : null, row);
  // 지난 회차(마감일 < 오늘 KST)면 낸 날을 그 마감일 한국 자정으로 — 열린·앞날 회차는 DB 기본값 now()(M2 · 2026-09-30 친구 결정)
  const createdAt = pastEventCreatedAt(ev.closes_on, kstToday());

  const { data: saved, error } = await db.from("event_signups").insert({
    event_id: ev.id, user_id: userId, ident_key: identKey(row),
    who_type: row.who_type, group_name: row.group_name, sub_name: row.sub_name, name: row.name, position: row.position,
    note, source: "import", updated_at: new Date().toISOString(),
    ...(createdAt ? { created_at: createdAt } : {}),
  }).select(EV_ROW_COLS).single();
  if (error) {
    // (event_id, user_id) unique — 같은 계정을 동시에 둘이 넣었다. 500 이 아니라 「이미 있음」.
    if ((error as any).code === "23505") return { ok: false, error: "already" };
    throw error;
  }
  await audit(ctx, "event.add", String(saved.id), {
    event_id: ev.id, name: row.name,
    row: { who_type: row.who_type, group: row.group_name, sub: row.sub_name, position: row.position },
    linked: !!userId,
  });
  if (ev.status !== "draft") await linkSignups([saved], look);
  return { ok: true, row: rowOut(saved, church), linked: !!userId, warnings };
}

// 기록(event.edit)의 칸 이름은 화면 이름(group·sub) — event.add/delete 의 row 와 같게(Task 13 audit.js 가 한 벌로 읽는다)
const EV_AUDIT_FIELD: Record<string, string> = { who_type: "who_type", group_name: "group", sub_name: "sub", name: "name", position: "position" };

// 줄 고치기 — **보낸 칸만**, 검사도 **바뀐 칸만**(옛 값 때문에 저장이 막히지 않게 · 설계 §1 끝).
// 신원 칸이 바뀌면 ident_key 를 다시 만들고 user_id 는 그대로(이어진 계정을 떼거나 바꾸지 않는다).
// 앱에서 낸 줄·자격 회차의 줄은 메모만 — 성도님이 앱에서 고치면 소속·직분이 통째로 덮인다(eventSignup upsert).
async function evRowSave(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const cur = await evRowRead(id);
  if (!cur) return { ok: false, error: "not-found" };
  if (String(b.expect ?? "") !== cur.updated_at) return { ok: false, error: "conflict" };
  const p = b.patch && typeof b.patch === "object" && !Array.isArray(b.patch) ? b.patch : {};
  const ev = await evRead(cur.event_id);
  if (!ev) return { ok: false, error: "not-found" };
  if ((cur.source !== "import" || isEligEvent(ev.needs)) && touchesRow(p)) return { ok: false, error: "app-row-note-only" };

  const { next, changed } = rowPatch(cur, p);
  const bad = checkChanged(next, changed);
  if (bad) return { ok: false, error: bad };
  const hasNote = Object.prototype.hasOwnProperty.call(p, "note");
  const note = hasNote ? legacyNorm(p.note) : (cur.note ?? "");     // 메모는 한 줄로(성경암송 eventSetNote 와 같다)
  const nbad = hasNote ? checkNote(note) : null;
  if (nbad) return { ok: false, error: nbad };
  const noteChanged = note !== (cur.note ?? "");
  if (!changed.length && !noteChanged) return { ok: true, row: rowOut(cur, await evRowChurch(cur)) };   // 쓰지 않는다

  const identity = changed.some((f) => f !== "position");
  if (identity && await sameInEvent(cur.event_id, next, id)) return { ok: false, error: "already" };
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of changed) upd[f] = next[f];
  if (identity) upd.ident_key = identKey(next);
  if (noteChanged) upd.note = note;
  const look = await churchLookupLinked([next.name]);
  const church = churchForSignup(look ? look.idx : null, next);
  // 읽은 뒤 그사이 바뀌었으면 0행 — 지워졌으면 not-found, 고쳐졌으면 conflict
  const { data: saved, error } = await db.from("event_signups").update(upd)
    .eq("id", id).eq("updated_at", cur.updated_at).select(EV_ROW_COLS);
  if (error) throw error;
  if (!saved?.length) return { ok: false, error: (await evRowRead(id)) ? "conflict" : "not-found" };

  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  for (const f of changed) { before[EV_AUDIT_FIELD[f]] = cur[f]; after[EV_AUDIT_FIELD[f]] = next[f]; }
  // 메모는 고쳤다는 것만(참) — 글은 남기지 않는다(SEC-1 · 기록은 지우지 않고 남으니 쓰이지 않는 글을 쌓지 않는다 ·
  // 기록 화면 audit.js 는 after 에 note 칸이 있는지만 보고 「메모 고침」이라 적는다)
  if (noteChanged) { before.note = true; after.note = true; }
  await audit(ctx, "event.edit", String(id), { event_id: cur.event_id, name: next.name, before, after });
  if (ev.status !== "draft") await linkSignups([saved[0]], look, true);   // 소속·이름을 고쳤을 수 있다 — auto 줄은 다시 맞춘다
  return { ok: true, row: rowOut(saved[0], church) };
}

// 줄 빼기 — 담당자가 넣은(import) 줄만. 앱에서 낸 줄은 app-row(성도님이 앱에서 취소한다).
// 자격 회차의 줄은 eligibility-event(계약 §5) — 그 명단은 「꾸준히 했다는 판정 결과」다(가을 설계 §10). 화면도 빼기를 숨긴다.
async function evRowDelete(ctx: Ctx, b: any) {
  const id = Number(b.id) || 0;
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "not-found" };
  const cur = await evRowRead(id);
  if (!cur) return { ok: false, error: "not-found" };
  if (String(b.expect ?? "") !== cur.updated_at) return { ok: false, error: "conflict" };
  if (cur.source !== "import") return { ok: false, error: "app-row" };
  const ev = await evRead(cur.event_id);
  if (!ev) return { ok: false, error: "not-found" };
  if (isEligEvent(ev.needs)) return { ok: false, error: "eligibility-event" };
  const { data: gone, error } = await db.from("event_signups").delete()
    .eq("id", id).eq("updated_at", cur.updated_at).select("id");
  if (error) throw error;
  if (!gone?.length) return { ok: false, error: (await evRowRead(id)) ? "conflict" : "not-found" };
  await audit(ctx, "event.delete", String(id), {
    event_id: cur.event_id, name: cur.name,
    row: { who_type: cur.who_type, group: cur.group_name, sub: cur.sub_name, position: cur.position,
      hasNote: !!cur.note, source: cur.source, hasUser: !!cur.user_id },   // 메모는 있었는지만(SEC-1 — 글은 남기지 않는다)
  });
  return { ok: true, deleted: { id: cur.id, name: cur.name } };
}

// ---------- 성경필사(암송) — 명단 올리기 · 교인명부 찾기 (Task 8 · 2026-09-29) ----------
// 설계 §1(같은 분 판정)·§2(evUploadCheck/Save·evPeopleLookup)·§3(명단 올리기). 판정은 events-upload.ts(순수 함수)에 있다.
// ⚠️ 살펴보기와 넣기가 판정을 **처음부터 다시** 돈다 — 화면이 보낸 살펴보기 결과를 믿지 않는다(그 사이 누가 더했을 수 있다).
// ⚠️ 자격 회차(needs.eligibility — isEligEvent 하나로 판정)에는 올리지 않는다 — 가을 설계 §12 「대리 등록은 보정 창구로만」.
// ⚠️ 앱 계정은 찾기만 한다(member_login 을 부르지 않는다). user_id·ident_key 는 응답에 싣지 않는다.
// ⚠️ 교인명부 값은 다섯 칸(이름·구분·소속·세부·직분)으로만 나간다(찾기 후보에만 교적 목장 칸 그대로 하나 더 — church_mok) — 찾기는 people.lookup(검색어·결과 수),
//    채우기를 켠 살펴보기가 명부에 물었으면 people.fill(물은 이름·채운 이름 — 채운 것이 없어도 · SEC-2)로 남긴다. 둘 다 「교인명부 기록」 보기로 간다.
// ⚠️ 같은 분 판정을 줄마다 sameInEvent 로 부르지 않는다 — 600줄이면 요청이 2천 번을 넘는다.
//    회차 명단을 한 번(allRows), 앱 계정을 한 번(evAccountIndex) 읽고 judgeUpload 가 같은 규칙으로 맞댄다.
const EV_FILL_COLS = "name_key,kind2,mok1,mok3,school_dept,position,position_detail";   // ChurchPerson — 연락처·주소·생년월일은 읽지 않는다
const EV_LOOKUP_COLS = "name," + EV_FILL_COLS;

// 빈칸 채우기용 명부 후보 — 이름 키로만, 100개·6KB 씩(한글 키 .in() 주소 길이 — 40자 이름 100개면 36KB 라 500 이 났다 · SEC-4).
// 한 묶음이 1,000행을 넘어도 잘리지 않게 allRows.
async function evChurchCands(keys: string[]): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  for (const part of inChunks(keys)) {
    const rows = await allRows(() => db.from("church_people").select(EV_FILL_COLS)
      .in("name_key", part).order("person_id", { ascending: true }));
    for (const r of rows) {
      if (!out.has(r.name_key)) out.set(r.name_key, []);
      out.get(r.name_key)!.push(r);
    }
  }
  return out;
}

// 앱 계정 전부 — 신원 키 → 계정 id 들(users.identity_key + user_identity_aliases 의 옛 키).
// ⚠️ 설계 §1-2: users 는 쪽을 나눠 **전부** 읽는다(지금 421행). 올리기의 후보 키는 수천 개라 usersByKeys(100개씩 .in())로
//    물으면 요청이 수십 번이고 한글 키 100개 주소가 11KB 안팎이다 — 성경암송 eventImport 는 164개에서 주소 한도를 넘었다.
//    usersByKeys 는 키가 스무 개 안쪽인 한 분 더하기·고치기(Task 7)에만 쓴다.
// ⚠️ 키를 다시 다듬지 않는다(NFC 금지) — sameKeys 가 appIdentityKey 로 만든 그대로 맞댄다.
async function evAccountIndex(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const add = (k: unknown, id: unknown) => {
    if (typeof k !== "string" || !k || typeof id !== "string" || !id) return;
    const l = out.get(k) ?? [];
    if (!l.includes(id)) l.push(id);
    out.set(k, l);
  };
  const us = await allRows(() => db.from("users").select("id,identity_key").order("id", { ascending: true }));
  for (const u of us) add(u.identity_key, u.id);
  const al = await allRows(() => db.from("user_identity_aliases").select("identity_key,user_id")
    .order("identity_key", { ascending: true }));
  for (const a of al) add(a.identity_key, a.user_id);
  return out;
}

async function evUpload(ctx: Ctx, b: any, save: boolean) {
  const raws: unknown[] = Array.isArray(b.rows) ? b.rows : [];
  if (tooManyRows(raws)) return { ok: false, error: "too-many" };   // 회차를 읽기 전에
  const ev = await evRead(b.event_id);                               // 모양이 틀린 id 는 묻지 않고 null
  const blocked = uploadEventError(ev);                              // not-found · eligibility-event
  if (blocked) return { ok: false, error: blocked };
  const eventId: string = ev.id;
  const fill = b.fill === true;

  // ① 다듬기·모양 ② (켰으면) 빈칸 채우기 — 빈칸이 있는 줄의 이름만 명부에 묻는다
  const items = tidyUpload(raws);
  if (fill) {
    const need = fillNames(items);
    if (need.length) applyFill(items, (await peopleSource()) ? await evChurchCands(need) : null);
  }
  // ③ 이 회차 명단(전부 · 1,000행 넘어도)과 앱 계정(통째로 한 번 — 넣을 줄이 있을 때만)에 맞댄다
  //   교구·목장·이름도 읽는다 — 한쪽 목장이 비었거나 99 인 같은 교구·같은 이름 줄을 같은 분으로 보려고(looseIndex · I1)
  const signups = await allRows(() => db.from("event_signups").select("id,ident_key,user_id,who_type,group_name,sub_name,name")
    .eq("event_id", eventId).order("id", { ascending: true }));
  judgeUpload(items, {
    eventKeys: new Set(signups.map((r) => r.ident_key)),
    eventUids: new Set(signups.map((r) => r.user_id).filter(Boolean)),
    users: uploadKeys(items).length ? await evAccountIndex() : new Map<string, string[]>(),
    loose: looseIndex(signups),
  });
  const counts = uploadCounts(items);

  if (!save) {
    // 명부에 물었으면(채우기 켬 · 명부 있음 · 물은 이름 > 0) 채운 것이 없어도 한 줄 — 채운 값뿐 아니라 「명부에 없는 이름」·
    // 「같은 이름이 여러 분」·「소속이 달라」 같은 알림도 명부의 답이다(SEC-2 · 2026-09-30 친구 결정). 넣기와 상관없이 남긴다(설계 §2 기록 표).
    const rec = fillRecord(items);
    if (rec) await audit(ctx, "people.fill", eventId, rec);
    return { ok: true, total: signups.length, rows: uploadOut(items), counts };
  }

  // ── 넣기 ── 500줄 묶음. 묶음이 실패하면 그 묶음만 한 줄씩 다시(한 줄 때문에 나머지가 막히지 않게).
  //   지난 회차(마감일 < 오늘 KST)면 낸 날(created_at)을 그 마감일 한국 자정으로 — 모든 줄에 같은 값(M2 · 2026-09-30 친구 결정)
  const recs = uploadRecords(items, eventId, new Date().toISOString(), pastEventCreatedAt(ev.closes_on, kstToday()));
  let saved = 0;
  const savedRows: any[] = [];   // 그때그때 잇기용 — 넣은 줄의 id·구분·소속·세부·이름
  const failed: { i: number; error: string }[] = [];
  for (let s = 0; s < recs.length; s += 500) {
    const chunk = recs.slice(s, s + 500);
    const { data: got, error } = await db.from("event_signups").insert(chunk.map((x) => x.rec)).select("id,who_type,group_name,sub_name,name");
    if (!error) { saved += chunk.length; savedRows.push(...((got ?? []) as any[])); continue; }
    console.error("evUploadSave chunk", error);
    for (const x of chunk) {
      const { data: one, error: e1 } = await db.from("event_signups").insert(x.rec).select("id,who_type,group_name,sub_name,name");
      if (!e1) { saved++; savedRows.push(...((one ?? []) as any[])); continue; }
      // 23505 = 그 사이 같은 계정의 줄이 들어왔다(unique event_id+user_id) → 「이미 있음」. 그 밖은 서버 기록으로만.
      const dup = (e1 as any).code === "23505";
      if (!dup) console.error("evUploadSave row", x.i, e1);
      failed.push({ i: x.i, error: dup ? "already" : "server" });
    }
  }
  // 건수만, 납작하게(CONTRACT 5 「기록 모양」) — 이름을 싣지 않는다(설계 §2 기록 표). failed 는 개수.
  if (ev.status !== "draft") await linkSignupsByName(savedRows);
  if (raws.length) {
    await audit(ctx, "event.upload", eventId, { rows: raws.length, fillOn: fill, ...counts, saved, failed: failed.length });
  }
  return { ok: true, counts, saved, failed };
}

// 교인명부에서 이름으로 찾기 — 이름 키가 **정확히 같은** 분만, 20명까지, 다섯 칸 + 교적 목장 칸 그대로(church_mok).
// 화면은 「찾기」 단추·Enter 로만 부른다(글자마다 부르지 않는다). 부를 때마다 검색어·결과 수를 기록한다(people.search 와 같게).
// ⚠️ church_mok 은 **이 액션에만**(lookupCandOut · 2026-09-30 친구 요청 — 소망 남성1·남성2 의 같은 이름 두 분을 가려내려고).
//    evPerson basic·빈칸 채우기는 다섯 칸 그대로다. 읽는 칸은 EV_LOOKUP_COLS 그대로(새로 읽는 칸 없음).
async function evPeopleLookup(ctx: Ctx, b: any) {
  const q = lookupName(b.name);                          // no-name · bad-char · too-long
  if (q.error) return { ok: false, error: q.error };
  const src = await peopleSource();
  if (!src) return { ok: true, source: null, people: [] };   // 명부가 없으면 묻지 않는다(기록할 열람도 없다)
  const { data, error } = await db.from("church_people").select(EV_LOOKUP_COLS)
    .eq("name_key", q.key).order("person_id", { ascending: true }).limit(LOOKUP_MAX);
  if (error) throw error;
  const people = ((data ?? []) as any[]).map((p) => lookupCandOut(p));
  await audit(ctx, "people.lookup", "", { q: q.name, count: people.length });
  return { ok: true, source: { date: src.source_date, total: src.total }, people };
}

// ---------- 성경필사(암송) — 이름을 누르면 교적 창 (Task 16 · 2026-09-30) ----------
// 설계 §0 「이름을 누르면 교적 창」·§2 evPerson·§3 · 친구 결정 §8-8. 고르는 규칙·응답 모양은 events-person.ts(순수 함수)에 있다.
// ⚠️ 모양은 **부른 분의 역할**로 여기서 정한다(ctx.roles — 화면이 보낸 것을 믿지 않는다):
//    「교인명부」(directory) 또는 총괄(super) → full: 교인ID·이름·소속 한 줄·직분. 화면은 그 교인ID 로 peoplePerson(「자세히」 창)을
//    부른다 — 사진·연락처·주소·가족은 **그 액션**이 directory 역할을 다시 확인하고 내준다(여기서는 싣지 않는다).
//    그 밖(성경필사 역할만) → basic: 이름·구분·소속·세부·직분 다섯 칸 + 교적 표시. 교인ID 는 싣지 않는다(설계 §0 「교인명부 쓰기」).
// ⚠️ 기록 — people.lookup {q, count}(evPeopleLookup 과 같은 action·같은 모양 → 「교인명부 기록」 · audit.js 가 그대로 읽는다 · count = 보여 준 분 수).
//    basic 은 늘 남긴다. full 은 **고르지 못했을 때(pick null — 후보 스무 분까지·빈 후보)만** 남긴다 — 이름·소속·직분·교인ID 가
//    여러 분 나가는데, 고르개를 닫으면 people.view 도 없어 여기서 안 남기면 기록이 아예 없다.
//    한 분을 골랐으면(pick 0) 남기지 않는다: 화면이 곧바로 「자세히」 창을 열고 peoplePerson 이 people.view(그분 이름·교인ID)를
//    남긴다. 여기서도 남기면 이름 한 번 누를 때마다 교인명부 기록이 두 줄씩 쌓여 누가 누구를 봤는지 읽기 어려워진다.
// ⚠️ 읽는 칸은 EV_PERSON_COLS 뿐 — Task 8 의 EV_LOOKUP_COLS(이름 + 옮겨 적기 재료 일곱)에 교인ID 하나. 연락처·주소·생년월일·사진은 읽지 않는다.
// ⚠️ 같은 이름을 **모두** 읽는다(allRows) — 같은 소속인 분이 교인ID 차례로 스무 번째 뒤에 있어도 고르는 규칙이 틀리지 않게(total 도 이 수).
const EV_PERSON_COLS = "person_id," + EV_LOOKUP_COLS;

async function evPerson(ctx: Ctx, b: any) {
  const q = readName(b.name);                                       // no-name · bad-char(" \ | 만) · too-long — 이름은 .eq() 로만 묻는다 · 괄호가 든 옛 이름도 누를 수 있게(SEC-7)
  if (q.error) return { ok: false, error: q.error };
  if (!(await peopleSource())) return { ok: true, mode: "none" };   // 명부가 한 번도 안 올라왔다 — 묻지도 기록하지도 않는다
  const cands = await allRows(() => db.from("church_people").select(EV_PERSON_COLS)
    .eq("name_key", q.key).order("person_id", { ascending: true }));
  const full = ctx.roles.includes("directory") || ctx.roles.includes("super");
  const out = personOut(cands as PersonCand[], personAsk(b, q.name), full);
  if (out.mode === "basic" || out.pick === null) {
    await audit(ctx, "people.lookup", "", { q: q.name, count: out.mode === "basic" ? out.people.length : out.candidates.length });
  }
  return { ok: true, ...out };
}

// ---------- 사역신청·담당자 — 이름을 누르면 교적 창 (2026-09-30 · 친구 요청) ----------
// 성경필사 evPerson 과 **같은 창·같은 규칙·같은 모양**(events-person.ts personOutFor) — 신청 현황·임명현황·종이 명단 올리기 결과,
// 그리고 시스템 → 담당자·역할(총괄 — ministry 게이트를 super 로 지난다)이 부른다. evPerson 은 고치지 않았다(성경필사 역할이 부른다).
// ⚠️ 모양은 **부른 분의 역할**로 여기서 정한다(ctx.roles — 화면이 보낸 것을 믿지 않는다): directory·super → full(교인ID →
//    화면이 peoplePerson 「자세히」 창 · 그 액션이 directory 를 다시 본다), 그 밖(사역신청 역할만) → basic(다섯 칸 + 교적 표시).
// ⚠️ 맞대 볼 줄 — ministryApplicant(events-person.ts) 하나로 읽는다: who(신청 현황·임명현황 줄의 「화평 20목장」·「유치부 …」)가
//    오면 ministryList 의 교적 표시와 **같은 함수** applicantFromWho(그래야 창의 표시 = 명단의 표시), 없으면 구분·소속·세부(personAsk —
//    종이 명단: 교구·교구·목장 / 담당자: 교구·교구·목장 또는 교회학교·부서·학년). 여기서 따로 읽지 말 것 — 시험이 그 함수를 명단 쪽 식과 맞댄다.
// ⚠️ 전화를 받는 까닭 — 사역신청 줄엔 성도님이 적은 번호가 있고, 명단의 교적 표시(「소속 다름」)도 그 번호로 나온다.
//    **번호로 고르는 것은 full(교인명부·총괄)뿐**(personOutFor — 검토 4): 같은 소속이 둘이거나 소속 다른 동명이인일 때 명부 번호가
//    **정확히 한 분**과 맞으면 그분. 사역신청 역할만(basic)이면 번호는 교적 표시에만 쓰고 고르지 않는다 — 화면이 보낸 아무 번호로
//    「이 번호는 어느 목장 누구」를 떠볼 수 없게.
//    명부 번호(phone_digits)는 고르는 데만 읽고 **응답에 싣지 않는다**(personOutFor 의 명시적 칸 지도) · 받은 번호는 기록에도 안 남긴다.
//    주소·생년월일·사진 칸은 읽지 않는다(EV_PERSON_COLS + 번호 하나).
// ⚠️ 기록 people.lookup — ministryLookupLog: basic 이면 늘, full 이면 고르지 못했을 때(pick null)와 **번호로 골랐을 때**(byPhone:true).
//    모양 {q, count, from:"ministry"(+ byPhone)} — 「교인명부 기록」이 「명부 찾기(사역신청·담당자)」로 가른다(evPerson 은 from 없음 → 성경필사).
const MIN_PERSON_COLS = EV_PERSON_COLS + ",phone_digits";

async function ministryPerson(ctx: Ctx, b: any) {
  const q = readName(b.name);                                       // evPerson 과 같은 이름 검사(no-name · bad-char · too-long)
  if (q.error) return { ok: false, error: q.error };
  if (!(await peopleSource())) return { ok: true, mode: "none" };   // 명부가 한 번도 안 올라왔다 — 묻지도 기록하지도 않는다
  const a = ministryApplicant(b, q.name);
  const cands = await allRows(() => db.from("church_people").select(MIN_PERSON_COLS)
    .eq("name_key", q.key).order("person_id", { ascending: true }));
  const full = ctx.roles.includes("directory") || ctx.roles.includes("super");
  const out = personOutFor(cands as PersonCand[], a, full);
  const log = ministryLookupLog(cands as PersonCand[], a, out, q.name);
  if (log) await audit(ctx, "people.lookup", "", log);
  return { ok: true, ...out };
}

// ── 사역 이력 확인 · 정정 신청(성경암송 앱 · 2026-10-01) ─────────────────
//   성경암송 api 가 서비스 키(x-internal-key)로만 부른다 — 카카오 토큰 길이 아니다(Deno.serve 맨 앞 갈래).
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §5
//   ⚠️ 응답 모양은 history-check.ts(historyRowOut·requestOut)가 정한다 — 교인ID·user_id·맞춤 근거·그때 목장을 싣지 않는다.
//   ⚠️ 이 두 액션은 authz.ts ACTION_ROLES 에 넣지 않는다 — 토큰으로 부르면 canCall 이 unknown-action 으로 막는다(시험이 본다).
async function hcFindPerson(w: LoginWho): Promise<number | null> {
  const k = loginNameKey(w);
  if (!k) return null;
  const { data, error } = await db.from("church_people").select("person_id,kind2,mok1,mok3,school_dept")
    .eq("name_key", k).order("person_id", { ascending: true });
  if (error) throw error;
  return matchLoginPerson(data ?? [], w).personId;
}

// 이 계정의 신청 — .in("status", …) 대신 받아서 거른다(「확인 중」의 빈칸을 PostgREST 목록 글자로 넘기지 않으려고)
async function hcRequests(uid: string): Promise<any[]> {
  const { data, error } = await db.from("ministry_history_requests").select(REQUEST_SELECT)
    .eq("user_id", uid).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(500);
  if (error) throw error;
  return data ?? [];
}

async function internalMyHistory(b: any) {
  const w = readLoginWho(b.who), uid = hcUserId(b.user_id);
  if (!w || !uid) return { ok: false, error: "bad-who" };
  const pid = await hcFindPerson(w);
  const rows = pid === null ? [] : await allRows(() => db.from("ministry_history").select(HISTORY_SELECT)
    .eq("person_id", pid).is("deleted_at", null).order("id", { ascending: true }));
  const reqs = await hcRequests(uid);
  return { ok: true, found: pid !== null, rows: sortHistory(rows.map(historyRowOut)), requests: reqs.slice(0, 100).map(requestOut) };
}

async function internalHistoryRequest(b: any) {
  const w = readLoginWho(b.who), uid = hcUserId(b.user_id);
  if (!w || !uid) return { ok: false, error: "bad-who" };
  const p = parseRequest(b);
  if (!p.ok) return p;
  const pid = await hcFindPerson(w);
  const mine = new Set<number>();
  if (pid !== null && p.req.history_id !== null) {
    const { data, error } = await db.from("ministry_history").select("id")
      .eq("id", p.req.history_id).eq("person_id", pid).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (data) mine.add(Number(data.id));
  }
  const open = (await hcRequests(uid)).filter((r: any) => REQ_OPEN.includes(r.status))
    .map((r: any) => ({ history_id: r.history_id == null ? null : Number(r.history_id), kind: String(r.kind) }));
  const block = requestBlock(p.req, pid !== null, mine, open);
  if (block) return { ok: false, error: block };
  const { error: ie } = await db.from("ministry_history_requests").insert(requestInsert(p.req, uid, pid, w));
  if (ie) {
    if ((ie as any).code === "23505") return { ok: false, error: "already-open" };   // 같은 때 두 번 — 부분 unique 색인이 막았다
    throw ie;
  }
  return { ok: true };
}

// ── 「📮 정정 신청」 — 사역 이력 정정 신청 처리(담당자 · 역할 ministry · 2026-10-01) ──
//   설계: v2 docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md §4
//   ⚠️ 응답에 user_id·person_id·handled_by 를 싣지 않는다(requestAdminOut).
//   ⚠️ 상태로 거를 때 .in() 을 쓰지 않는다 — 「확인 중」의 빈칸을 PostgREST 목록 글자로 넘기지 않으려고(hcRequests 와 같은 까닭). 받아서 거른다.
async function hrRows(ids: number[]): Promise<Map<number, any>> {
  const m = new Map<number, any>();
  const uniq = [...new Set(ids.filter((x) => Number.isSafeInteger(x) && x > 0))];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data, error } = await db.from("ministry_history").select(ROW_ADMIN_SELECT).in("id", uniq.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) m.set(Number(r.id), r);
  }
  return m;
}

// 빠진 사역 신청들의 줄(src_key req:<신청 id> · 빼 둔 줄도) — 200개씩. 열쇠는 「req:」+정수라 .in() 이스케이프 걱정이 없다.
//   ⚠️ 교인명부(church_people)는 읽지 않는다 — 직분은 그 줄에 적힌 것을 보인다.
async function hrLines(reqIds: number[]): Promise<Map<string, any>> {
  const m = new Map<string, any>();
  const keys = [...new Set(reqIds.filter((x) => Number.isSafeInteger(x) && x > 0))].map(requestKey);
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await db.from("ministry_history").select("id,year,committee,team,role_title,position,deleted_at,updated_at,src_key")
      .in("src_key", keys.slice(i, i + 200));
    if (error) throw error;
    for (const r of data ?? []) m.set(String(r.src_key), r);
  }
  return m;
}

async function historyRequestList(b: any) {
  const filter = String(b.status ?? "open");
  if (!REQ_FILTERS.includes(filter)) return { ok: false, error: "bad-status" };
  const all = (await allRows(() => db.from("ministry_history_requests").select(REQUEST_ADMIN_SELECT).order("id", { ascending: true })))
    .map((r: any) => ({ ...r, id: Number(r.id) }));
  const pick = filterRequests(all, filter);
  const rows = await hrRows(pick.map((r: any) => Number(r.history_id)));
  // 빠진 사역 — 「사역 이력에 넣을 내용」 미리 채움(in · out · draft · 2026-10-02) · 다른 종류는 line:null
  const lines = await hrLines(pick.filter((r: any) => r.kind === "missing").map((r: any) => Number(r.id)));
  return {
    ok: true, counts: requestCounts(all),
    list: pick.map((r: any) => requestAdminOut(r, r.history_id == null ? null : rows.get(Number(r.history_id)) ?? null,
      r.kind === "missing" ? requestLineOut(r, lines.get(requestKey(r.id)) ?? null) : null)),
  };
}

// 「빠진 사역」(kind missing) 신청의 사역 이력 줄 — 「반영」이면 그 해 이력에 더하고(applyMissingRequest · 고친 내용 line 대로), 「반영」이 아니면 뺀다.
//   「반영」이 아니면 어디서 왔든 늘 뺀다(undoMissingRequest — 살아 있는 줄이 있을 때만 쓴다 · 없으면 0행이라 쓰지도 기록하지도 않는다).
//     「반영」에서 벗어나다 빼기가 실패했으면 같은 상태로 한 번 더 저장해 다시 뺀다(2026-10-02 최종 검토 #1 — 손으로 빼라고 하지 않는다:
//     「📜 사역 이력」에서 손으로 뺀 줄은 다시 「반영」해도 되살아나지 않아, 신청하신 분 교적에 이은 그 줄을 잃는다).
//   신청 상태는 이미 바뀌었다 — 줄 쓰기가 실패해도 상태 바꾼 것을 되돌리지 않는다(응답 history:{error} → 화면이 창으로 알린다).
//   ⚠️ try 는 줄 쓰기(applyMissingRequest·undoMissingRequest)만 감싼다 — 기록(audit)은 그 밖에서. 기록이 실패하면 다른 액션처럼 던진다(2026-10-02 리뷰 D1).
//   빼 둔 줄은 마지막 빼기 기록이 정정 신청 쪽(from:"request")일 때만 되살린다 — 「📜 사역 이력」에서 손으로 뺀 줄은 아니다(history-removed · D2).
//   상태가 어디서 왔는지는 보지 않는다 — 「확인 중→반영」에서 되살리다 실패한 뒤 반영에 머문 채 한 번 더 눌러도 되살린다(2026-10-02).
//   기록: history.add(더함 · 되살림 restored:true) · history.edit(고친 칸 fields — 되살리며 고쳤어도) · history.delete(뺌)
//         detail 은 {year, from:"request", request: 신청 id}(+ fields·restored)만(이름·교인ID·글 없음).
//   돌려주는 것: null(할 일 없음 · 뺄 줄이 없었다) · {id, year, created|restored|edited|removed (, fields · positionFailed)} · {error}
//     positionFailed — 넣을 때 교적 직분을 못 읽어 직분을 빈칸으로 넣었다(불리언만 · 화면이 창으로 · 최종 검토 #9)
async function missingRequestHistory(ctx: Ctx, req: any, to: string, line: ReqLine | null = null):
  Promise<Record<string, unknown> | null> {
  const now = new Date().toISOString();
  const mid = ctx.member?.id ?? null;
  const base = { from: "request", request: Number(req.id) };
  if (to === "반영") {
    let r: MissingApply;
    try {
      r = await applyMissingRequest(db, req, { line, memberId: mid, nowIso: now });
    } catch (err) {
      console.error("history request → ministry_history", err);
      return { error: "history-failed" };
    }
    if (r.error) return { error: r.error };
    const year = Number(r.year ?? req.year);
    const fields = r.fields ?? [];
    if (r.created) await audit(ctx, "history.add", String(r.id), { year, ...base });
    if (r.restored) await audit(ctx, "history.add", String(r.id), { year, ...base, restored: true });
    if ((r.edited || r.restored) && fields.length) await audit(ctx, "history.edit", String(r.id), { year, fields, ...base });
    if (r.edited) return { id: r.id, year: r.year, edited: true, fields };
    if (r.restored) return { id: r.id, year: r.year, restored: true, ...(fields.length ? { fields } : {}) };
    return { id: r.id, year: r.year, created: !!r.created, ...(r.positionFailed ? { positionFailed: true } : {}) };
  }
  let u: { id?: number; year?: number; removed: boolean };
  try {
    u = await undoMissingRequest(db, req.id, mid, now);
  } catch (err) {
    console.error("history request → ministry_history", err);
    return { error: "history-failed" };
  }
  if (!u.removed) return null;
  await audit(ctx, "history.delete", String(u.id), { year: Number(u.year ?? req.year), ...base });
  return { id: u.id, year: u.year, removed: true };
}

// 신청의 지금 상태 — 지워졌으면 null(「한 번 더」 갈래가 줄을 쓴 뒤 다시 본다 · 2026-10-02 검증 2차 #1)
async function requestStatusNow(reqId: number): Promise<string | null> {
  const { data, error } = await db.from("ministry_history_requests").select("id,status").eq("id", reqId).maybeSingle();
  if (error) throw error;
  return data ? String(data.status ?? "") : null;
}

// 「한 번 더」(같은 상태·같은 답)로 줄을 넣거나 되살리거나 고친 뒤 신청이 지워져 있었다(requestStatusNow 가 null · 2026-10-02 최종 검토 #2).
//   그 갈래는 신청을 읽은 뒤 잠금 없이 줄을 쓰므로, 그사이 다른 분이 신청을 지웠으면(historyRequestDelete — 그 빼기는 줄이 없을 때 지나갔다)
//   지운 신청의 살아 있는 줄이 남는다. 그 줄을 다시 빼고(기록 history.delete why:"request-deleted" — 다시 되살아나지 않는다)
//   {ok:false, error:"not-found"} · 빼기도 실패했으면 history:{error:"history-failed"} 를 함께(신청이 없어 다시 저장할 길이 없다 — 화면이 창으로).
async function missingRequestGone(ctx: Ctx, reqId: number): Promise<Record<string, unknown>> {
  let u: { id?: number; year?: number; removed: boolean };
  try {
    u = await undoMissingRequest(db, reqId, ctx.member?.id ?? null, new Date().toISOString());
  } catch (err) {
    console.error("history request gone → ministry_history", err);
    return { ok: false, error: "not-found", history: { error: "history-failed" } };
  }
  if (u.removed) await audit(ctx, "history.delete", String(u.id), { year: Number(u.year), from: "request", request: reqId, why: "request-deleted" });
  return { ok: false, error: "not-found" };
}

async function historyRequestSet(ctx: Ctx, b: any) {
  const p = parseRequestSet(b);
  if (!p.ok) return p;
  const { data: cur, error } = await db.from("ministry_history_requests").select(REQUEST_ADMIN_SELECT)
    .eq("id", p.set.id).maybeSingle();
  if (error) throw error;
  if (!cur) return { ok: false, error: "not-found" };
  // 빠진 사역을 「반영」 — 창이 고쳐 보낸 「사역 이력에 넣을 내용」(line)을 먼저 본다. 틀리면 아무것도 쓰지 않는다(2026-10-02).
  //   다른 종류·다른 상태로 보낸 line 은 읽지 않는다.
  //   창은 네 칸을 고쳤을 때만 line 을 싣는다(requests-logic.js lineBody · 최종 검토 #6) — 없으면 살아 있는 줄은 그대로 ·
  //   빼 둔 줄은 칸 그대로 되살리고 · 줄이 없으면 신청 글(requestDraft — 창에 미리 채운 것과 같다)로 넣는다.
  let line: ReqLine | null = null;
  if (cur.kind === "missing" && p.set.status === "반영" && b.line != null) {
    const lp = parseRequestLine(b.line);
    if (!lp.line) return { ok: false, error: lp.error };
    line = lp.line;
  }
  if (requestSetNoop(p.set, cur)) {
    // 빠진 사역 신청을 같은 상태·같은 답으로 한 번 더 —
    //   「반영」: 그 해 이력에 이 신청의 줄이 없으면(이 기능 전에 반영했다) 채우고, 고친 내용(line)이 줄과 다르면 고친다. 빼 둔 줄은
    //     마지막 빼기가 정정 신청 쪽일 때만 되살린다(「확인 중→반영」에서 되살리다 실패한 뒤의 다시 누름 · 손으로 뺀 줄은 history-removed).
    //   그 밖(확인 중·반영 안 함): 남아 있는 줄을 다시 뺀다(「반영」에서 벗어나다 빼기가 실패한 뒤 · 2026-10-02 최종 검토 #1).
    //   줄이 그대로면 예전처럼 쓰지도 기록하지도 않는다({ok, same}).
    if (cur.kind === "missing") {
      const h = await missingRequestHistory(ctx, cur, p.set.status, line);
      if (h) {
        // 이 갈래는 신청 줄의 잠금(updated_at)을 거치지 않는다 — 줄을 쓴 뒤 신청의 지금 상태를 다시 본다(2026-10-02 검증 2차 #1·#2).
        //   넣기·되살리기·고치기는 「반영」을, 빼기는 「반영 아님」을 가정하고 썼다.
        //   · 지워졌으면: 넣은 쪽이면 그 줄을 다시 뺀다(missingRequestGone · #2) · 뺐거나 직접 뺀 줄(history-removed)이면 그냥 not-found
        //     (지워진 신청의 줄을 「＋ 한 줄 더하기」로 넣으라고 하지 않는다 — 다른 분이 신청을 지우며 그 줄을 뺀 자리다)
        //   · 상태가 가정과 다르면(그사이 다른 분이 반영 ↔ 반영 아님으로 바꿨다 — 그분의 줄 쓰기가 이 쓰기보다 먼저 끝났을 수 있다):
        //     지금 상태로 한 번만 다시 맞추고(고친 내용 없이) conflict + 그 결과(history) — 되풀이하지 않는다(또 바뀌는 틈은 받아들인다).
        const added = !!(h.created || h.restored || h.edited), removed = !!h.removed;
        if (added || removed || h.error === "history-removed") {
          const now = await requestStatusNow(Number(cur.id));
          if (now === null) return added ? await missingRequestGone(ctx, Number(cur.id)) : { ok: false, error: "not-found" };
          if ((added || removed) && (now === "반영") !== added) {
            const h2 = await missingRequestHistory(ctx, { ...cur, status: now }, now, null);
            return { ok: false, error: "conflict", ...(h2 ? { history: h2 } : {}) };
          }
        }
        if (added || removed || h.error) return { ok: true, same: true, history: h };
      }
    }
    return { ok: true, same: true };   // 바뀐 것이 없으면 쓰지도 기록하지도 않는다
  }
  const block = requestSetBlock(p.set, cur);
  if (block) return { ok: false, error: block };
  // 본 뒤로 아무도 안 바꿨을 때만 쓴다(updated_at 조건) — 0행이면 그사이 누가 바꿨다
  const { data: upd, error: ue } = await db.from("ministry_history_requests")
    .update(requestSetPatch(p.set, ctx.member?.id ?? null, new Date().toISOString()))
    .eq("id", p.set.id).eq("updated_at", cur.updated_at).select(REQUEST_ADMIN_SELECT).maybeSingle();
  if (ue) {
    if ((ue as any).code === "23505") return { ok: false, error: "already-open" };   // 다시 열기 — 같은 줄에 열린 신청이 있다
    throw ue;
  }
  if (!upd) return { ok: false, error: "conflict" };
  await audit(ctx, "history.request", String(p.set.id), requestAuditDetail(cur, p.set));
  // 빠진 사역 — 「반영」이 되면 그 해 이력에 줄을 더하고, 「반영」이 아니면 남은 그 줄만 뺀다(상태는 이미 바뀌었다 · 실패는 history.error 로만)
  const h = cur.kind === "missing" ? await missingRequestHistory(ctx, cur, p.set.status, line) : null;
  const rows = await hrRows(upd.history_id == null ? [] : [Number(upd.history_id)]);
  const out: Record<string, unknown> = { ok: true, row: requestAdminOut(upd, upd.history_id == null ? null : rows.get(Number(upd.history_id)) ?? null) };
  if (h) out.history = h;
  return out;
}

// 신청 삭제(2026-10-02 친구 요청 · 역할 ministry) — 신청 줄을 지운다(성도님 앱 「내 정정 신청」에서도 사라짐 · 되돌릴 수 없다).
//   본 뒤로 아무도 안 바꿨을 때만(expect = 창이 본 updated_at) · 0행이면 conflict.
//   기록: history.request.delete {id, kind, status} — 이름·교인ID·글·답은 남기지 않는다. 그 신청의 history.request 기록은 그대로 둔다.
//   빠진 사역이면 그다음 「반영」으로 더한 살아 있는 줄을 빼 둔다(undoMissingRequest · 기록 history.delete why:"request-deleted").
//   ⚠️ try 는 줄 빼기만 감싼다 — 기록은 밖에서(D1). 줄을 못 뺐으면 history:{error:"history-failed"}(신청은 이미 지워졌다).
//   ⚠️ 두 쓰기(신청 지우기 · 줄 빼기)를 먼저 하고 기록은 그 뒤에 — 기록이 실패해 던져도 줄은 이미 빠져 있다(2026-10-02 최종 검토 #2 ·
//      전에는 신청 삭제 기록이 줄 빼기보다 먼저라, 그 기록이 실패하면 지운 신청의 줄이 살아 남고 다시 해 볼 신청도 없었다).
//   이미 지워진 신청이면 not-found — 그래도 그 신청의 살아 있는 줄은 빼고 history:{removed, id, year} 를 함께(다시 누르면 치운다 · 검증 2차 #3).
async function historyRequestDelete(ctx: Ctx, b: any) {
  const id = Number(b?.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "bad-id" };
  const expect = String(b?.expect ?? "").trim();
  if (!expect) return { ok: false, error: "conflict" };   // 무엇을 보고 지우는지 모르면 지우지 않는다
  const { data: cur, error } = await db.from("ministry_history_requests").select("id,kind,status,updated_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!cur) {
    // 이미 지워진 신청 — 그 신청의 살아 있는 줄이 남았으면 뺀다(2026-10-02 검증 2차 #3 · 지울 때 줄 빼기가 실패하고 기록까지 던져
    //   「…빼 주세요」 창도 못 띄운 뒤의 다시 누름 · 그사이 「한 번 더」가 넣은 줄). undoMissingRequest 는 살아 있는 req:<id> 줄만 건드려 몇 번 해도 같다.
    //   ⚠️ try 로 감싸지 않는다 — 던지면 서버 오류로 창이 그대로라 다시 누를 수 있다(줄이 있는지 모르는 채 「빼지 못했어요」라고 하지 않는다).
    //   뺐으면 기록 history.delete why:"request-deleted"(신청 삭제 기록 history.request.delete 는 남기지 않는다 — 종류·상태를 더는 모른다).
    const g = await undoMissingRequest(db, id, ctx.member?.id ?? null, new Date().toISOString());
    if (!g.removed) return { ok: false, error: "not-found" };
    await audit(ctx, "history.delete", String(g.id), { year: Number(g.year), from: "request", request: id, why: "request-deleted" });
    return { ok: false, error: "not-found", history: { removed: true, id: g.id, year: g.year } };
  }
  if (String(cur.updated_at) !== expect) return { ok: false, error: "conflict" };
  const { data: del, error: de } = await db.from("ministry_history_requests").delete()
    .eq("id", id).eq("updated_at", cur.updated_at).select("id");
  if (de) throw de;
  if (!(del ?? []).length) return { ok: false, error: "conflict" };   // 그사이 누가 바꿨거나 지웠다
  const out: Record<string, unknown> = { ok: true };
  let u: { id?: number; year?: number; removed: boolean } | null = null;
  if (cur.kind === "missing") {
    try {
      u = await undoMissingRequest(db, id, ctx.member?.id ?? null, new Date().toISOString());
    } catch (err) {
      console.error("history request delete → ministry_history", err);
      out.history = { error: "history-failed" };
    }
  }
  await audit(ctx, "history.request.delete", String(id), { id, kind: String(cur.kind), status: String(cur.status) });
  if (u?.removed) {
    await audit(ctx, "history.delete", String(u.id), { year: Number(u.year), from: "request", request: id, why: "request-deleted" });
    out.history = { removed: true, id: u.id, year: u.year };
  }
  return out;
}

async function internalRoute(req: Request): Promise<Response> {
  if (!internalKeyOk(req.headers.get("x-internal-key"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ ok: false, error: "bad-json" }, 400);
  const action = String(b.action ?? "");
  try {
    switch (action) {
      case "internalMyHistory":      return json(await internalMyHistory(b));
      case "internalHistoryRequest": return json(await internalHistoryRequest(b));
    }
    return json({ ok: false, error: "unknown-action" }, 400);
  } catch (e) {
    console.error(action, e);
    return json({ ok: false, error: "server" }, 500);   // e.message 를 싣지 않는다(아래 토큰 갈래와 같은 까닭)
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  // 성경암송 api 가 서비스 키로 부르는 길(사역 이력 확인 · 2026-10-01) — 머리가 있으면 이 갈래로만 간다(토큰 검사로 넘어가지 않는다)
  if (req.headers.has("x-internal-key")) return internalRoute(req);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ ok: false, error: "unauthenticated" }, 401);
  const { data: ud, error: ue } = await db.auth.getUser(token);
  if (ue || !ud?.user) return json({ ok: false, error: "unauthenticated" }, 401);
  let b: any;
  try { b = await req.json(); } catch { return json({ ok: false, error: "bad-json" }, 400); }
  if (!b || typeof b !== "object" || Array.isArray(b)) return json({ ok: false, error: "bad-json" }, 400);
  const action = String(b.action ?? "");
  try {
    // user_metadata 는 로그인한 본인이 auth.updateUser 로 고칠 수 있다 — 승인 목록의 별명·사진은 카카오가 준 원본에서 읽는다
    const kakao = (ud.user.identities ?? []).find((i: any) => i.provider === "kakao");
    const meta = kakao?.identity_data ?? {};
    const ctx = await loadCtx(ud.user.id, meta);
    const gate = canCall(action, ctx.member ? { status: ctx.member.status, roles: ctx.roles } : null);
    if (gate !== "ok") return json({ ok: false, error: gate }, gate === "unknown-action" ? 400 : 403);
    switch (action) {
      case "me":               return json(await me(ctx));
      case "register":         return json(await register(ctx, b));
      case "membersList":      return json(await membersList());
      case "membersApprove":   return json(await membersApprove(ctx, b));
      case "membersSetRoles":  return json(await membersSetRoles(ctx, b));
      case "membersSetStatus": return json(await membersSetStatus(ctx, b));
      case "auditList":        return json(await auditList(b));
      case "ministryAppointed": return json(await ministryAppointed());
      case "ministryList":      return json(await ministryList());
      case "ministrySetStatus": return json(await ministrySetStatus(ctx, b));
      case "ministryDelete":    return json(await ministryDelete(ctx, b));
      case "ministryPhoneClear": return json(await ministryPhoneClear(ctx, b));
      case "ministryCatalogAdmin": return json(await ministryCatalogAdmin());
      case "ministryCatalogSave":  return json(await ministryCatalogSave(ctx, b));
      case "ministryCatalogOrder": return json(await ministryCatalogOrder(ctx, b));
      case "ministryPaperCheck": return json(await ministryPaper(ctx, b, false));
      case "ministryPaperSave":  return json(await ministryPaper(ctx, b, true));
      case "ministryTesters":    return json(await ministryTesters());
      case "ministryTesterFind": return json(await ministryTesterFind(b));
      case "ministryTesterSave": return json(await ministryTesterSave(ctx, b));
      case "peopleSearch": return json(await peopleSearch(ctx, b));
      case "peoplePerson": return json(await peoplePerson(ctx, b));
      case "peopleStats":  return json(await peopleStats());
      case "peopleExport": return json(await peopleExport(ctx, b));
      case "peopleHistory": return json(await peopleHistory(b));
      case "peopleLink":    return json(await peopleLink(ctx, b));
      case "evEvents":  return json(await evEvents());
      case "evRoster":  return json(await evRoster(b));
      case "evHistory": return json(await evHistory(b));
      case "evStats":   return json(await evStats(b));
      case "evEventCreate": return json(await evEventCreate(ctx, b));
      case "evEventSave":   return json(await evEventSave(ctx, b));
      case "evRowAdd":    return json(await evRowAdd(ctx, b));
      case "evRowSave":   return json(await evRowSave(ctx, b));
      case "evRowDelete": return json(await evRowDelete(ctx, b));
      case "evUploadCheck":  return json(await evUpload(ctx, b, false));
      case "evUploadSave":   return json(await evUpload(ctx, b, true));
      case "evPeopleLookup": return json(await evPeopleLookup(ctx, b));
      case "evPerson":       return json(await evPerson(ctx, b));
      case "ministryPerson": return json(await ministryPerson(ctx, b));
      case "peopleLinkSync": return json(await peopleLinkSync(ctx, b));
      case "historyRequestList": return json(await historyRequestList(b));
      case "historyRequestSet":  return json(await historyRequestSet(ctx, b));
      case "historyRequestDelete": return json(await historyRequestDelete(ctx, b));
      case "historyList":        return json(await historyApi.list(ctx, b));
      case "historyUploadCheck": return json(await historyApi.upload(ctx, b, false));
      case "historyUploadSave":  return json(await historyApi.upload(ctx, b, true));
      case "historyRowAdd":      return json(await historyApi.rowAdd(ctx, b));
      case "historyRowSave":     return json(await historyApi.rowSave(ctx, b));
      case "historyRowDelete":   return json(await historyApi.rowDelete(ctx, b));
      case "historyCandidates":  return json(await historyApi.candidates(ctx, b));
      case "historyLink":        return json(await historyApi.link(ctx, b));
      case "historyGroups":      return json(await historyApi.groups(ctx, b));
      case "historyLinkGroup":   return json(await historyApi.linkGroup(ctx, b));
      case "historyRematch":     return json(await historyApi.rematch(ctx, b));
      case "historyExport":      return json(await historyApi.exportRows(ctx, b));
    }
    // ACTION_ROLES 에는 있는데 여기 없는 것 — 시험(PROBE)이 500/400 으로 잡는다
    return json({ ok: false, error: "unknown-action" }, 400);
  } catch (e) {
    console.error(action, e);
    // e.message 를 응답에 싣지 않는다 — 내부 사정(표 이름·SQL 조각)이 클라이언트로 새 나갈 수 있다. 메시지는 로그로만.
    const rawCode = (e as any)?.code;
    const code = typeof rawCode === "string" ? rawCode.slice(0, 40) : "unknown";
    return json({ ok: false, error: "server", code }, 500);
  }
});
