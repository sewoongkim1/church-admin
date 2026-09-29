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
import { applyFill, fillNames, filledNames, judgeUpload, lookupName, lookupOut, LOOKUP_MAX, tidyUpload, tooManyRows, uploadCounts, uploadEventError, uploadKeys, uploadOut, uploadRecords } from "./events-upload.ts";

// 성경필사(암송) 이름을 누르면 교적 창(Task 16) — 이 과제의 이름은 events-person.ts 에서만 가져온다(CONTRACT 5)
import { personAsk, personOut, type PersonCand } from "./events-person.ts";

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
  const churchIdx = await churchLookup(rows.map((r) => r.name || umap.get(r.user_id)?.name || ""));
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
    .select("id,status,name,who,committee,team").eq("id", id).maybeSingle();
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
  return { ok: true, status: p.patch.status, pushed: n.pushed, pushError: n.pushError, already: n.already,
    phoneCleared: p.patch.phone === null };
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
    .select("id,user_id,name,phone,team_id,status").eq("year", year));

  const rows = raws.map((r: any, i: number) => ministryPaperOne(r, i));
  // 교적 표시(교인명부 · 2026-09-29) — 오류 줄에도 붙인다(이름·소속을 고칠 때 도움이 된다). 교적 값은 싣지 않는다.
  const churchIdx = await churchLookup(rows.map((r: any) => r.name));
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
  // ⚠️ 결정이 난 상태(임명확정·취소)면 한 건씩 바꿀 때와 같이 휴대폰 번호를 지우고 decided_at 을 찍는다.
  const now = new Date().toISOString();
  let added = 0;
  for (const r of good) {
    try {
      const st = r.status || status;
      const decided = st === "임명확정" || st === "취소";
      const why = r.rowNote || "";
      if (r.same) { r.saved = true; continue; }          // 이미 그 상태다 — 건드리지 않는다
      if (r.dupId) {                                      // 앱 신청이 있다 — 상태만 바꾼다
        // ⚠️ 신청일은 앱에 남은 그대로 둔다 — 성도님이 실제로 낸 날이다. 임명일만 종이 것으로.
        const patch: Record<string, unknown> = { status: st, updated_at: now };
        if (decided) { patch.decided_at = r.decidedAt || now; patch.phone = null; }
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
        position: r.position, phone: decided ? null : r.phone,
        team_id: r.team_id, committee: r.committee, team: r.team, option: r.option || "",
        status: st, source: "paper", note: why || null,
        decided_at: decided ? (r.decidedAt || now) : null, updated_at: now,
      };
      if (r.appliedAt) insert.created_at = r.appliedAt;
      const { error: e4 } = await db.from("ministry_orders").insert(insert);
      if (e4) throw e4;
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

// 명부 기준일 — 마지막으로 올린 기록. 한 번도 안 올렸으면 null(화면은 「아직 명부가 없어요」)
async function peopleSource(): Promise<{ source_date: string; total: number } | null> {
  const { data, error } = await db.from("church_people_imports").select("source_date,total")
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { source_date: data.source_date, total: data.total } : null;
}

// 사역신청 줄을 교적과 맞댄다 — 명부가 한 번도 안 올라왔으면 null(화면이 표시를 아예 그리지 않는다).
// 신청자 이름으로만 묻는다(200개씩) — 8,672명 전체를 읽지 않게.
async function churchLookup(names: unknown[]): Promise<Map<string, Cand[]> | null> {
  if (!(await peopleSource())) return null;
  const keys = lookupKeys(names);
  const out = new Map<string, Cand[]>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await db.from("church_people").select("name_key,mok1,mok3,school_dept,phone_digits")
      .in("name_key", keys.slice(i, i + 200));
    if (error) throw error;
    for (const r of (data ?? []) as any[]) {
      if (!out.has(r.name_key)) out.set(r.name_key, []);
      out.get(r.name_key)!.push(toCand(r));
    }
  }
  return out;
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
  await audit(ctx, "people.view", String(id), { name: data.name });
  return { ok: true, person: { ...data, photo: urls.get(id) ?? "" }, family };
}

async function peopleStats() {
  const source = await peopleSource();
  if (!source) return { ok: true, source: null, stats: null };
  const rows = await allRows(() => db.from("church_people")
    .select("mok1,mok3,kind2,kind3,position,school_dept,gender,age,has_photo,household_id").order("person_id", { ascending: true }));
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

// ---------- 성경필사(암송) — 이벤트 명단 (2026-09-29) ----------
// 설계: v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md · 옛 동작 원문 docs/port/event-roster-legacy.md
// 표 events·event_signups 는 **성경암송 앱의 것**이다 — 칸·제약·RLS 를 바꾸지 않는다(여기서는 읽고 쓰기만).
// ⚠️ 응답은 아래 칸 지도(evOut·rowOut·evHistory 줄)로만 만든다. user_id 는 판정(hasUser·사람 묶음)에 쓰려고
//    읽기만 하고 내보내지 않는다 — 성경암송 api 는 user_id 하나로 그 사람 행세가 된다. 성도님 memo·answers·phone 은
//    이 절의 어느 칸 목록에도 없다(성도님 메모 memo 와 담당자 메모 note 는 다른 칸).
// ⚠️ 줄은 allRows 로 읽는다(1,000행에서 오류 없이 잘린다 — 2026-09-29 성경암송 576acfc), 인원은 head 개수.
// ⚠️ 자격 회차 판정은 events-rules.ts 의 isEligEvent(needs) 하나 — 여기서 따로 만들지 않는다(대조 뒤 결정).
const EV_COLS = "id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,updated_at,needs";
// 줄 칸 목록은 이것 하나 — 명단(evRoster)·한 분 더하기·고치기(Task 7)·올리기(Task 8)가 모두 이것을 쓴다(두 벌 두지 않는다)
const EV_ROW_COLS = "id,event_id,user_id,who_type,group_name,sub_name,name,position,note,source,created_at,updated_at";

// 회차 한 줄 — 화면(📋 회차·명단)이 기대하는 칸 그대로. needs·copy·sort_order 는 싣지 않는다.
function evOut(ev: any, count: number) {
  return {
    id: ev.id, title: ev.title ?? "", short_title: ev.short_title ?? "", subtitle: ev.subtitle ?? "",
    season: ev.season ?? "", kind: ev.kind ?? "signup", status: ev.status,
    opens_on: ev.opens_on, closes_on: ev.closes_on, list_until: ev.list_until ?? null,
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
  const idx = await churchLookup(rows.map((r) => r.name));
  return {
    ok: true,
    event: evOut(ev, counts.get(ev.id) ?? 0),
    source: src ? { date: src.source_date, total: src.total } : null,
    rows: rows.map((r) => rowOut(r, churchFor(idx, applicantFromSignup(r)))),
  };
}

// 👤 이름으로 모든 회차의 줄 — 사람 묶음(합집합)마다. 이름은 NFC·띄어쓰기 없음(nameKey)으로 맞댄다.
// ⚠️ DB 에 name=eq 로 묻지 않는다 — 맥에서 온 자모분리(NFD)·띄어쓰기가 다른 줄을 놓친다. 줄 전체를 쪽을
//    나눠 읽고(2026-09-29 기준 2,834행 = 세 쪽) 여기서 거른다. 교적 값이 아니라 기록은 남기지 않는다.
async function evHistory(b: any) {
  const raw = legacyNorm(b.name);
  if (!raw) return { ok: false, error: "no-name" };
  if (BE_BAD_CHARS.test(raw)) return { ok: false, error: "bad-char" };
  if (raw.length > BE_FIELD_MAX) return { ok: false, error: "too-long" };
  const key = nameKey(raw);
  const [evs, all] = await Promise.all([
    allRows(() => db.from("events").select("id,title,closes_on").order("id", { ascending: true })),
    allRows(() => db.from("event_signups").select("id,event_id,user_id,who_type,group_name,sub_name,name,position,source")
      .order("id", { ascending: true })),
  ]);
  const evBy = new Map(evs.map((e) => [e.id, e]));
  // 최근 회차 먼저 — 마감일 늦은 것 → 같은 마감일이면 회차 id 큰 것 → 같은 회차면 줄 id 큰 것.
  // ⚠️ 이 차례는 events-stats.ts statsOf 가 「가장 최근 줄」을 고르는 차례(마감일·회차 id 오름차순의 마지막, 같은 회차면 뒤 줄)와
  //    **같아야** 한다 — 그래야 이력 이름표와 통계 「여러 번 참여한 분」 이름표가 같은 글자가 된다. 묶음 순번도 이 차례로 매겨진다.
  const rows = all.filter((r) => nameKey(r.name) === key).sort((x, y) =>
    String(evBy.get(y.event_id)?.closes_on ?? "").localeCompare(String(evBy.get(x.event_id)?.closes_on ?? ""))
    || String(y.event_id).localeCompare(String(x.event_id)) || Number(y.id) - Number(x.id));
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
// ⚠️ needs·copy·kind·sort_order 는 받지 않는다(EV_EDIT_KEYS 밖) — 가을 말씀 동행의 자격 규칙·문구가
//    저장 한 번에 지워지지 않게. 보내도 버린다. sort_order 는 새 회차도 DB 기본값 0(이번에 설정 화면에 없다).
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
    opens_on: "", closes_on: "", status: "draft", list_until: null };
  // 새 회차는 draft 로만 — status 는 EV_CREATE_KEYS 에 없어 보내도 버려진다. 공개는 만든 뒤 설정에서(공개 확인을 거쳐).
  const ev: EvEvent = { ...mergeEventPatch(blank, pickEventPatch(src, EV_CREATE_KEYS)), id, status: "draft" };
  const bad = checkEvent(ev, null);   // 같은 검사 함수 — DB CHECK(기간)에 걸려 500 이 나지 않게. 새 회차엔 자격 규칙이 없다.
  if (bad) return { ok: false, error: bad };
  const { error } = await db.from("events").insert({
    id, title: ev.title, short_title: ev.short_title, subtitle: ev.subtitle, season: ev.season,
    opens_on: ev.opens_on, closes_on: ev.closes_on, list_until: ev.list_until, status: "draft",
    kind: "signup", needs: structuredClone(BE_NEEDS_DEFAULT),   // 앱 등록 폼에 직분 칸이 생기게(설계 §2) — 사본을 넣는다
    // copy·sort_order·created_at·updated_at 은 DB 기본값({} · 0 · now())
  });
  if (error) {
    if ((error as any).code === "23505") return { ok: false, error: "exists" };   // 있는 회차는 덮지 않는다
    throw error;
  }
  const saved = await evRead(id);
  if (!saved) return { ok: false, error: "not-found" };
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
  const today = kstToday();
  const listedBefore = evtListable(before, today);
  const listedNow = evtListable(next, today);
  if (!listedBefore && listedNow && b.confirmListed !== true) return { ok: false, error: "needs-confirm" };
  const diff = eventDiff(before, next);
  let saved = cur;
  if (Object.keys(diff.after).length) {
    // 조건부 update — 읽은 뒤 쓰기 전 사이에 다른 담당자가 저장했으면 0행 → conflict(남의 저장을 덮지 않는다)
    const { data: upd, error } = await db.from("events")
      .update({ ...diff.after, updated_at: new Date().toISOString() })
      .eq("id", id).eq("updated_at", cur.updated_at).select("id");
    if (error) throw error;
    if (!upd?.length) return { ok: false, error: "conflict" };
    saved = await evRead(id);
    if (!saved) return { ok: false, error: "not-found" };
    await audit(ctx, "event.settings", id, { title: saved.title, before: diff.before, after: diff.after });
  }
  const count = (await evCountMap([id])).get(id) ?? 0;
  return { ok: true, event: evOut(saved, count), listedBefore, listedNow };
}

// ---------- 성경필사(암송) — 한 분 더하기 · 줄 고치기 · 빼기 (계획 Task 7) ----------
// 설계 §1 「같은 분 판정과 앱 계정 잇기」·§2 evRowAdd/evRowSave/evRowDelete.
// ⚠️ 앱 계정은 **조회만** 해서 잇는다 — member_login 을 부르지 않는다(주간 리포트 「신규 인원」이 부풀지 않게).
// ⚠️ user_id·ident_key 는 서버 안에서만 쓴다 — 응답은 rowOut(명시적 칸 지도) 하나로만 만든다.
// ⚠️ 줄 칸은 Task 5 의 EV_ROW_COLS 하나만 쓴다(같은 목록을 두 벌 두지 않는다).
// ⚠️ 자격 회차 판정은 events-rules.ts isEligEvent(needs) 하나 — 화면의 hasEligibility(evOut)와 같은 함수다.

// 신원 키 → 앱 계정 id 들. users.identity_key 와 user_identity_aliases(소속을 고친 분의 옛 키) 둘 다 본다.
// ⚠️ 한글 키는 주소가 길다 — 100개씩 나눠 묻는다(성경암송 eventImport 는 164개에서 GET 주소 한도를 넘어 조용히 0명이 됐다).
// ⚠️ 키를 다시 다듬지 않는다 — candidateKeys 가 appIdentityKey 로 만든 그대로 맞댄다(keysToUserIds 는 NFC 로 맞춰서 못 쓴다).
async function usersByKeys(keys: string[]): Promise<Map<string, string[]>> {
  const uniq = askableKeys(keys);
  const out = new Map<string, string[]>();
  const add = (k: string, id: string) => {
    const l = out.get(k) ?? [];
    if (!l.includes(id)) l.push(id);
    out.set(k, l);
  };
  for (let i = 0; i < uniq.length; i += 100) {
    const part = uniq.slice(i, i + 100);
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
  for (let i = 0; i < keys.length; i += 100) {
    let q = db.from("event_signups").select("id").eq("event_id", eventId).in("ident_key", keys.slice(i, i + 100));
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
  return null;
}

async function evRowRead(id: number): Promise<any | null> {
  const { data, error } = await db.from("event_signups").select(EV_ROW_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// 한 줄의 교적 표시 — 이름 하나만 묻는다. 쓰기 **전에** 부른다(쓴 뒤에 실패해 500 이 되지 않게).
async function evRowChurch(r: { who_type: string; group_name: string; sub_name: string; name: string }) {
  return churchFor(await churchLookup([r.name]), applicantFromSignup(r));
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
  const church = await evRowChurch(row);

  const { data: saved, error } = await db.from("event_signups").insert({
    event_id: ev.id, user_id: userId, ident_key: identKey(row),
    who_type: row.who_type, group_name: row.group_name, sub_name: row.sub_name, name: row.name, position: row.position,
    note, source: "import", updated_at: new Date().toISOString(),
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
  const church = await evRowChurch(next);
  // 읽은 뒤 그사이 바뀌었으면 0행 — 지워졌으면 not-found, 고쳐졌으면 conflict
  const { data: saved, error } = await db.from("event_signups").update(upd)
    .eq("id", id).eq("updated_at", cur.updated_at).select(EV_ROW_COLS);
  if (error) throw error;
  if (!saved?.length) return { ok: false, error: (await evRowRead(id)) ? "conflict" : "not-found" };

  const before: Record<string, unknown> = {}, after: Record<string, unknown> = {};
  for (const f of changed) { before[EV_AUDIT_FIELD[f]] = cur[f]; after[EV_AUDIT_FIELD[f]] = next[f]; }
  if (noteChanged) { before.note = cur.note ?? ""; after.note = note; }
  await audit(ctx, "event.edit", String(id), { event_id: cur.event_id, name: next.name, before, after });
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
      note: cur.note ?? "", source: cur.source, hasUser: !!cur.user_id },
  });
  return { ok: true, deleted: { id: cur.id, name: cur.name } };
}

// ---------- 성경필사(암송) — 명단 올리기 · 교인명부 찾기 (Task 8 · 2026-09-29) ----------
// 설계 §1(같은 분 판정)·§2(evUploadCheck/Save·evPeopleLookup)·§3(명단 올리기). 판정은 events-upload.ts(순수 함수)에 있다.
// ⚠️ 살펴보기와 넣기가 판정을 **처음부터 다시** 돈다 — 화면이 보낸 살펴보기 결과를 믿지 않는다(그 사이 누가 더했을 수 있다).
// ⚠️ 자격 회차(needs.eligibility — isEligEvent 하나로 판정)에는 올리지 않는다 — 가을 설계 §12 「대리 등록은 보정 창구로만」.
// ⚠️ 앱 계정은 찾기만 한다(member_login 을 부르지 않는다). user_id·ident_key 는 응답에 싣지 않는다.
// ⚠️ 교인명부 값은 다섯 칸(이름·구분·소속·세부·직분)으로만 나간다 — 찾기는 people.lookup(검색어·결과 수),
//    살펴보기에서 채운 값을 돌려줄 때는 people.fill(채운 이름)로 남긴다. 둘 다 「교인명부 기록」 보기로 간다.
// ⚠️ 같은 분 판정을 줄마다 sameInEvent 로 부르지 않는다 — 600줄이면 요청이 2천 번을 넘는다.
//    회차 명단을 한 번(allRows), 앱 계정을 한 번(evAccountIndex) 읽고 judgeUpload 가 같은 규칙으로 맞댄다.
const EV_FILL_COLS = "name_key,kind2,mok1,mok3,school_dept,position,position_detail";   // ChurchPerson — 연락처·주소·생년월일은 읽지 않는다
const EV_LOOKUP_COLS = "name," + EV_FILL_COLS;

// 빈칸 채우기용 명부 후보 — 이름 키로만, 100개씩(한글 키 .in() 주소 길이). 한 묶음이 1,000행을 넘어도 잘리지 않게 allRows.
async function evChurchCands(keys: string[]): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  for (let i = 0; i < keys.length; i += 100) {
    const part = keys.slice(i, i + 100);
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
  const signups = await allRows(() => db.from("event_signups").select("id,ident_key,user_id")
    .eq("event_id", eventId).order("id", { ascending: true }));
  judgeUpload(items, {
    eventKeys: new Set(signups.map((r) => r.ident_key)),
    eventUids: new Set(signups.map((r) => r.user_id).filter(Boolean)),
    users: uploadKeys(items).length ? await evAccountIndex() : new Map<string, string[]>(),
  });
  const counts = uploadCounts(items);

  if (!save) {
    // 채운 교적 값이 화면으로 나간다 — 넣기와 상관없이 남긴다(설계 §2 기록 표)
    const filled = filledNames(items);
    if (filled.length) await audit(ctx, "people.fill", eventId, { rows: filled.length, names: filled });
    return { ok: true, total: signups.length, rows: uploadOut(items), counts };
  }

  // ── 넣기 ── 500줄 묶음. 묶음이 실패하면 그 묶음만 한 줄씩 다시(한 줄 때문에 나머지가 막히지 않게).
  const recs = uploadRecords(items, eventId, new Date().toISOString());
  let saved = 0;
  const failed: { i: number; error: string }[] = [];
  for (let s = 0; s < recs.length; s += 500) {
    const chunk = recs.slice(s, s + 500);
    const { error } = await db.from("event_signups").insert(chunk.map((x) => x.rec));
    if (!error) { saved += chunk.length; continue; }
    console.error("evUploadSave chunk", error);
    for (const x of chunk) {
      const { error: e1 } = await db.from("event_signups").insert(x.rec);
      if (!e1) { saved++; continue; }
      // 23505 = 그 사이 같은 계정의 줄이 들어왔다(unique event_id+user_id) → 「이미 있음」. 그 밖은 서버 기록으로만.
      const dup = (e1 as any).code === "23505";
      if (!dup) console.error("evUploadSave row", x.i, e1);
      failed.push({ i: x.i, error: dup ? "already" : "server" });
    }
  }
  // 건수만, 납작하게(CONTRACT 5 「기록 모양」) — 이름을 싣지 않는다(설계 §2 기록 표). failed 는 개수.
  if (raws.length) {
    await audit(ctx, "event.upload", eventId, { rows: raws.length, fillOn: fill, ...counts, saved, failed: failed.length });
  }
  return { ok: true, counts, saved, failed };
}

// 교인명부에서 이름으로 찾기 — 이름 키가 **정확히 같은** 분만, 20명까지, 다섯 칸만.
// 화면은 「찾기」 단추·Enter 로만 부른다(글자마다 부르지 않는다). 부를 때마다 검색어·결과 수를 기록한다(people.search 와 같게).
async function evPeopleLookup(ctx: Ctx, b: any) {
  const q = lookupName(b.name);                          // no-name · bad-char · too-long
  if (q.error) return { ok: false, error: q.error };
  const src = await peopleSource();
  if (!src) return { ok: true, source: null, people: [] };   // 명부가 없으면 묻지 않는다(기록할 열람도 없다)
  const { data, error } = await db.from("church_people").select(EV_LOOKUP_COLS)
    .eq("name_key", q.key).order("person_id", { ascending: true }).limit(LOOKUP_MAX);
  if (error) throw error;
  const people = ((data ?? []) as any[]).map((p) => lookupOut(p));
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
  const q = lookupName(b.name);                                     // no-name · bad-char · too-long(evPeopleLookup 과 같은 규칙)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
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
      case "ministryCatalogAdmin": return json(await ministryCatalogAdmin());
      case "ministryCatalogSave":  return json(await ministryCatalogSave(ctx, b));
      case "ministryCatalogOrder": return json(await ministryCatalogOrder(ctx, b));
      case "ministryPaperCheck": return json(await ministryPaper(ctx, b, false));
      case "ministryPaperSave":  return json(await ministryPaper(ctx, b, true));
      case "peopleSearch": return json(await peopleSearch(ctx, b));
      case "peoplePerson": return json(await peoplePerson(ctx, b));
      case "peopleStats":  return json(await peopleStats());
      case "peopleExport": return json(await peopleExport(ctx, b));
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
