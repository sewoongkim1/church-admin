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
import { parseSearch, searchDetail, statsOf, PAGE_SIZE, PHOTO_TTL, type Search } from "./people-query.ts";

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

function peopleFilter(q: any, s: Search) {
  if (s.name) q = q.ilike("name_key", `%${s.name}%`);
  if (s.tail) q = q.ilike("phone_digits", `%${s.tail}%`);
  if (s.mok1) q = q.eq("mok1", s.mok1);
  if (s.kind2) q = q.eq("kind2", s.kind2);
  if (s.kind3) q = q.eq("kind3", s.kind3);
  if (s.position) q = q.eq("position", s.position);
  if (s.noPhoto) q = q.eq("has_photo", false);
  if (s.household) q = q.eq("household_id", s.household);
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
  const { data, error, count } = await peopleFilter(db.from("church_people").select(PEOPLE_LIST_COLS, { count: "exact" }), s)
    .order("name_key", { ascending: true }).order("person_id", { ascending: true })
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
  const rows = await allRows(() => peopleFilter(db.from("church_people").select(PEOPLE_ALL_COLS), p.s)
    .order("name_key", { ascending: true }).order("person_id", { ascending: true }));
  await audit(ctx, "people.export", "", { q: norm(b.q).slice(0, 40), filters: searchDetail(p.s), count: rows.length });
  return { ok: true, source, rows };
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
