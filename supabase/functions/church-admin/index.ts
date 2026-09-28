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
