// 새가족 — 표를 읽고 쓰는 쪽(서버 · 2026-10-07 · 설계 v2 성경암송 docs/superpowers/specs/2026-10-07-newfamily-design.md §2·§5)
//   규칙·칸 지도는 nf-rules.ts(순수). index.ts 의 switch 가 makeNf(...) 의 함수를 부른다.
// ⚠️ npm import 를 두지 않는다 — db(supabase 클라이언트)를 받아 쓴다(Node 시험이 이 파일을 import 할 수 있게).
// ⚠️ 「누가 무엇을」: 액션 문(authz.ts ACTION_ROLES)은 역할 newfamily·nfteam 으로 열고, 여기서 **하는 일(kind)과 줄**을 본다.
//    nfteam 에게 열린 액션은 모두 viewOf 를 지나 갈래를 탄다 — 아니면 not-assigned(그분의 것을 읽지도 쓰지도 않는다).
//    운영팀만 되는 일의 거절은 chief-only(forbidden 을 돌려주면 화면이 통째로 다시 부팅한다).
// ⚠️ 응답에 auth_user_id·교인ID 를 싣지 않는다. 담당자 번호(admin_members.id)는 운영팀의 「함께 쓰는 분」 응답에만(교육 담당자 지정과 같다).
//    새가족 칸은 personOut 이 하는 일에 따라 고른다 — 여기서 줄을 통째로 돌려주지 않는다.
// ⚠️ 기록(audit) detail 에 새가족의 이름·전화를 싣지 않는다(줄 id·수만). 담당자 이름은 다른 메뉴와 같이 실린다(nf.staff).
// ⚠️ 승인(nfStaffApprove): 대기 중인 분을 active 로 만들며 **nfteam 하나만** 준다 — 역할 이름을 몸통에서 받지 않는다(친구 2026-10-07 판단 A).
import { canAssign, canCardRead, canCardWrite, checkCard, checkKinds, dupKey, kstDate, listScope, NF_BAD, NF_KINDS, personOut, stageOf,
  type NfView } from "./nf-rules.ts";
import { norm } from "./authz.ts";

type Db = any;
type Audit = (ctx: any, action: string, target: string, detail?: Record<string, unknown>) => Promise<void>;
type Fail = { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ASSIGNED: Fail = { ok: false, error: "not-assigned" };
const CHIEF_ONLY: Fail = { ok: false, error: "chief-only" };
const BAD_ID: Fail = { ok: false, error: "bad-id" };
const NOT_FOUND: Fail = { ok: false, error: "not-found" };
const TEAM_ROLE = "nfteam";
const CARD_COLS = "id,reg_date,service,pastor,address,car_no,note,consent,self_come,draft,card_photo,welcome_photo,created_at,updated_at";
const PERSON_COLS = "id,card_id,seq,relation,name,gender,birth,birth_lunar,phone,tel,baptized,target,helper_id,assigned_at,pastor_class_on," +
  "report_sent_at,report_return,parish,parish_at,ceremony_id,attended,cert_no,stopped_at,stop_reason,wait_note,updated_at";
const HELPER_COLS = "id,name,services,member_id,resting";
export const NF_BUCKET = "newfamily";
export const NF_PHOTO_MAX = 1500000;   // 1.5MB — 화면이 긴 변 1600px JPEG 로 줄여 보낸다
export const NF_PHOTO_TTL = 300;       // 서명 주소 5분
const PHOTO_COL: Record<string, string> = { card: "card_photo", welcome: "welcome_photo" };

// deps — peopleLookup: 교인명부에서 이름으로 찾기(후보 모양 · 교인ID 없음 · 기록 people.lookup from:"newfamily")
//        allRows: 1,000줄 쪽 넘기기(index.ts) · now: 시험이 날짜를 고정한다
export function makeNf(db: Db, audit: Audit, deps: {
  peopleLookup: (ctx: any, b: any) => Promise<any>;
  allRows: (build: () => any) => Promise<any[]>;
  now?: () => number;
}) {
  const today = () => kstDate(deps.now ? deps.now() : Date.now());
  const nowIso = () => new Date(deps.now ? deps.now() : Date.now()).toISOString();
  const memberId = (ctx: any): string => {
    const id = String(ctx?.member?.id ?? "");
    return UUID.test(id) ? id : "";
  };
  const uuidOf = (v: unknown): string => {
    const s = norm(v).toLowerCase();
    return UUID.test(s) ? s : "";
  };
  // 화면이 본 때(base)와 줄의 때가 같은가 — 글자가 아니라 시각으로 견준다(서버가 돌려준 「…Z」와 DB 의 「…+00:00」이 같은 때다)
  const sameTime = (a: unknown, b: unknown): boolean => {
    const x = Date.parse(norm(a)), y = Date.parse(norm(b));
    return !isNaN(x) && x === y;
  };
  const isChief = (ctx: any): boolean => (ctx?.roles ?? []).includes("super") || (ctx?.roles ?? []).includes("newfamily");

  // ---------- 누가 무엇을 ----------
  // 이분의 view — 운영팀이면 chief. 하는 일은 nfteam 역할이 있을 때만 읽는다(역할을 빼면 nf_staff 줄이 남아 있어도 아무것도 못 한다).
  async function viewOf(ctx: any): Promise<NfView> {
    const chief = isChief(ctx);
    const mid = memberId(ctx);
    if (!mid || !(ctx?.roles ?? []).includes(TEAM_ROLE)) return { chief, kinds: [], helperId: null };
    const { data: ks, error } = await db.from("nf_staff").select("kind").eq("member_id", mid);
    if (error) throw error;
    const kinds = (ks ?? []).map((r: any) => String(r.kind)).filter((k: string) => (NF_KINDS as readonly string[]).includes(k));
    let helperId: string | null = null;
    if (kinds.includes("helper")) {
      const { data: h, error: e2 } = await db.from("nf_helpers").select("id").eq("member_id", mid).maybeSingle();
      if (e2) throw e2;
      helperId = h?.id ? String(h.id) : null;
    }
    return { chief, kinds, helperId };
  }

  async function nfMe(ctx: any) {
    const v = await viewOf(ctx);
    let helper: { id: string; name: string } | null = null;
    if (v.helperId) {
      const { data, error } = await db.from("nf_helpers").select("id,name").eq("id", v.helperId).maybeSingle();
      if (error) throw error;
      if (data) helper = { id: String(data.id), name: data.name };
    }
    return { ok: true, chief: v.chief, kinds: v.kinds, helper, today: today() };
  }

  // ---------- 함께 쓰는 분(운영팀만 · §2-3) ----------
  // 섬김이마다 지금 맡은 수(교육 중·목사님 교육 전인 분) — 배정 화면과 함께 쓰는 분 화면이 같이 쓴다
  async function helperLoads(): Promise<Map<string, number>> {
    const rows = await deps.allRows(() => db.from("nf_people")
      .select("id,helper_id,target,pastor_class_on,report_sent_at,parish,cert_no,stopped_at").not("helper_id", "is", null));
    const out = new Map<string, number>();
    for (const p of rows) {
      const st = stageOf(p, 0);   // 줄 수와 상관없이 「아직 섬김이 손에 있는 분」 = learning(줄 수를 모르니 wait_class 도 learning 으로 읽힌다)
      if (st === "learning") out.set(String(p.helper_id), (out.get(String(p.helper_id)) ?? 0) + 1);
    }
    return out;
  }
  const helperOut = (h: any, load: number, memberName: string) => ({
    id: String(h.id), name: h.name, services: h.services || "", resting: h.resting === true,
    linked: !!h.member_id, memberName, load,
  });

  async function nfStaffList(ctx: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const [helpers, staff, grants, pending, loads] = await Promise.all([
      deps.allRows(() => db.from("nf_helpers").select(HELPER_COLS).order("name")),
      deps.allRows(() => db.from("nf_staff").select("member_id,kind")),
      deps.allRows(() => db.from("admin_role_grants").select("member_id").eq("role_id", TEAM_ROLE)),
      deps.allRows(() => db.from("admin_members").select("id,name,gu,mok,kakao_nickname,created_at").eq("status", "pending").order("created_at")),
      helperLoads(),
    ]);
    const teamIds = [...new Set(grants.map((g: any) => String(g.member_id)))];
    let members: any[] = [];
    if (teamIds.length) {
      const { data, error } = await db.from("admin_members").select("id,name,status").in("id", teamIds);
      if (error) throw error;
      members = data ?? [];
    }
    const nameOf = new Map(members.map((m: any) => [String(m.id), m.name]));
    const kindsOf = new Map<string, string[]>();
    for (const s of staff) kindsOf.set(String(s.member_id), [...(kindsOf.get(String(s.member_id)) ?? []), String(s.kind)]);
    const helperOf = new Map(helpers.filter((h: any) => h.member_id).map((h: any) => [String(h.member_id), String(h.id)]));
    return {
      ok: true,
      helpers: helpers.map((h: any) => helperOut(h, loads.get(String(h.id)) ?? 0, h.member_id ? (nameOf.get(String(h.member_id)) ?? "") : "")),
      team: members.map((m: any) => ({
        id: String(m.id), name: m.name, status: m.status,
        kinds: (NF_KINDS as readonly string[]).filter((k) => (kindsOf.get(String(m.id)) ?? []).includes(k)),
        helperId: helperOf.get(String(m.id)) ?? null,
      })).sort((a: any, b: any) => a.name.localeCompare(b.name, "ko")),
      // 들어오신 분 — 카카오로 들어와 등록만 한 대기 줄(소속·카카오 별명은 본인 확인용)
      pending: pending.map((m: any) => ({ id: String(m.id), name: m.name, gu: m.gu || "", mok: m.mok || "", nickname: m.kakao_nickname || "", createdAt: m.created_at })),
    };
  }

  // 하는 일을 통째로 갈아 끼운다 + 섬김이 줄 잇기. helper 를 골랐는데 이을 섬김이 줄이 없으면 그분 이름으로 만든다.
  async function writeKinds(mid: string, kinds: string[], helperId: string, name: string): Promise<Fail | null> {
    if (helperId) {
      const { data: h, error } = await db.from("nf_helpers").select("id,member_id").eq("id", helperId).maybeSingle();
      if (error) throw error;
      if (!h) return NOT_FOUND;
      if (h.member_id && String(h.member_id) !== mid) return { ok: false, error: "helper-taken" };
    }
    const { error: e1 } = await db.from("nf_staff").delete().eq("member_id", mid);
    if (e1) throw e1;
    if (kinds.length) {
      const { error: e2 } = await db.from("nf_staff").insert(kinds.map((kind) => ({ member_id: mid, kind })));
      if (e2) throw e2;
    }
    // 이 계정에 이어져 있던 섬김이 줄 — 고른 줄이 아니면 푼다(섬김이 줄과 그분의 새가족·교육 줄은 그대로 남는다)
    const { error: e3 } = helperId
      ? await db.from("nf_helpers").update({ member_id: null }).eq("member_id", mid).neq("id", helperId)
      : await db.from("nf_helpers").update({ member_id: null }).eq("member_id", mid);
    if (e3) throw e3;
    if (!kinds.includes("helper")) return null;
    if (helperId) {
      const { error } = await db.from("nf_helpers").update({ member_id: mid, updated_at: nowIso() }).eq("id", helperId);
      if (error) throw error;
    } else {
      const { error } = await db.from("nf_helpers").insert({ name, member_id: mid });
      if (error) throw error;
    }
    return null;
  }
  // 몸통 읽기 — member_id · kinds · helper_id(섬김이를 고를 때만)
  function staffIn(b: any): { ok: true; mid: string; kinds: string[]; helperId: string } | Fail {
    const mid = uuidOf(b?.member_id);
    if (!mid) return BAD_ID;
    const kinds = checkKinds(b?.kinds);
    if (!kinds) return { ok: false, error: "bad-kind" };
    const raw = norm(b?.helper_id);
    const helperId = raw ? uuidOf(raw) : "";
    if (raw && !helperId) return BAD_ID;
    if (helperId && !kinds.includes("helper")) return { ok: false, error: "bad-kind" };
    return { ok: true, mid, kinds, helperId };
  }

  // 대기 중인 분을 승인하며 nfteam 을 준다 — 역할은 이것 하나뿐(몸통의 역할 이름을 받지 않는다).
  async function nfStaffApprove(ctx: any, b: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const x = staffIn(b);
    if (!x.ok) return x;
    if (!x.kinds.length) return { ok: false, error: "no-kind" };
    const { data: m, error } = await db.from("admin_members").select("id,name,status").eq("id", x.mid).maybeSingle();
    if (error) throw error;
    if (!m) return NOT_FOUND;
    if (m.status !== "pending") return { ok: false, error: "not-pending" };
    if (x.helperId) {   // 승인 전에 본다 — 잇지 못할 줄이면 아무것도 바꾸지 않는다
      const { data: h, error: e0 } = await db.from("nf_helpers").select("id,member_id").eq("id", x.helperId).maybeSingle();
      if (e0) throw e0;
      if (!h) return NOT_FOUND;
      if (h.member_id) return { ok: false, error: "helper-taken" };
    }
    const { data: upd, error: e1 } = await db.from("admin_members")
      .update({ status: "active", approved_by: memberId(ctx) || null, approved_at: nowIso() })
      .eq("id", x.mid).eq("status", "pending").select("id");
    if (e1) throw e1;
    if (!upd?.length) return { ok: false, error: "conflict" };   // 다른 분이 먼저 처리했다
    const { error: e2 } = await db.from("admin_role_grants")
      .upsert({ member_id: x.mid, role_id: TEAM_ROLE, granted_by: memberId(ctx) || null }, { onConflict: "member_id,role_id", ignoreDuplicates: true });
    if (e2) throw e2;
    const w = await writeKinds(x.mid, x.kinds, x.helperId, m.name);
    if (w) return w;
    await audit(ctx, "nf.staff", x.mid, { op: "approve", name: m.name, kinds: x.kinds });
    return { ok: true };
  }

  // 이미 새가족 섬김(nfteam)인 분의 하는 일 바꾸기. kinds 가 비면 빼기 — nf_staff 줄과 nfteam 역할만 뺀다(다른 역할·승인 상태는 그대로).
  async function nfStaffSet(ctx: any, b: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const x = staffIn(b);
    if (!x.ok) return x;
    const { data: m, error } = await db.from("admin_members").select("id,name,status").eq("id", x.mid).maybeSingle();
    if (error) throw error;
    if (!m) return NOT_FOUND;
    const { data: g, error: e0 } = await db.from("admin_role_grants").select("role_id").eq("member_id", x.mid).eq("role_id", TEAM_ROLE);
    if (e0) throw e0;
    if (!(g ?? []).length) return { ok: false, error: "not-team" };   // 대기 중인 분은 nfStaffApprove · 다른 역할만 가진 분은 총괄이 준다
    const w = await writeKinds(x.mid, x.kinds, x.helperId, m.name);
    if (w) return w;
    if (!x.kinds.length) {
      const { error: e1 } = await db.from("admin_role_grants").delete().eq("member_id", x.mid).eq("role_id", TEAM_ROLE);
      if (e1) throw e1;
    }
    await audit(ctx, "nf.staff", x.mid, { op: x.kinds.length ? "set" : "remove", name: m.name, kinds: x.kinds });
    return { ok: true };
  }

  // 섬김이 줄 넣기·고치기(이름·섬기는 예배·쉬는 중) — 로그인한 적이 없어도 이름만으로 먼저 넣는다
  async function nfHelperSave(ctx: any, b: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const name = norm(b?.name), services = norm(b?.services);
    if (!name) return { ok: false, error: "no-name" };
    if (NF_BAD.test(name) || NF_BAD.test(services)) return { ok: false, error: "bad-name" };
    if (name.length > 20 || services.length > 30) return { ok: false, error: "too-long" };
    const row = { name, services, resting: b?.resting === true, updated_at: nowIso() };
    const raw = norm(b?.id);
    if (raw) {
      const id = uuidOf(raw);
      if (!id) return BAD_ID;
      const { data, error } = await db.from("nf_helpers").update(row).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) return NOT_FOUND;
      await audit(ctx, "nf.staff", id, { op: "helper", resting: row.resting });
      return { ok: true, id };
    }
    const { data, error } = await db.from("nf_helpers").insert(row).select("id").single();
    if (error) throw error;
    await audit(ctx, "nf.staff", String(data.id), { op: "helper-new" });
    return { ok: true, id: String(data.id) };
  }

  // ---------- 교인명부 찾기(인도자·섬김이 고르기) ----------
  async function nfPeopleFind(ctx: any, b: any) {
    const v = await viewOf(ctx);
    if (!(canCardWrite(v) || canAssign(v))) return NOT_ASSIGNED;
    return deps.peopleLookup(ctx, b);
  }

  // ---------- 카드 ----------
  const guideOut = (g: any) => ({ seq: g.seq, name: g.name, mok: g.mok || "", phone: g.phone || "" });
  const cardOut = (c: any) => ({
    id: String(c.id), regDate: c.reg_date, service: c.service || "", pastor: c.pastor || "", address: c.address || "", carNo: c.car_no || "",
    note: c.note || "", selfCome: c.self_come === true, draft: c.draft === true,
    hasCardPhoto: !!c.card_photo, hasWelcomePhoto: !!c.welcome_photo, createdAt: c.created_at, updatedAt: c.updated_at,
  });
  // 여러 분의 교육 줄 수·마지막 날(kind='lesson' 만)
  async function lessonStats(ids: string[]): Promise<Map<string, { n: number; last: string }>> {
    const out = new Map<string, { n: number; last: string }>();
    for (let i = 0; i < ids.length; i += 200) {
      const part = ids.slice(i, i + 200);
      const rows = await deps.allRows(() => db.from("nf_lessons").select("person_id,met_on").eq("kind", "lesson").in("person_id", part));
      for (const r of rows) {
        const k = String(r.person_id), cur = out.get(k) ?? { n: 0, last: "" };
        out.set(k, { n: cur.n + 1, last: r.met_on > cur.last ? r.met_on : cur.last });
      }
    }
    return out;
  }
  async function helperNames(): Promise<Map<string, string>> {
    const rows = await deps.allRows(() => db.from("nf_helpers").select("id,name"));
    return new Map(rows.map((h: any) => [String(h.id), h.name]));
  }

  async function nfCardGet(ctx: any, b: any) {
    const v = await viewOf(ctx);
    if (!canCardRead(v)) return NOT_ASSIGNED;
    const id = uuidOf(b?.card_id);
    if (!id) return BAD_ID;
    const { data: c, error } = await db.from("nf_cards").select(CARD_COLS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!c) return NOT_FOUND;
    const [{ data: people, error: e1 }, { data: guides, error: e2 }, names] = await Promise.all([
      db.from("nf_people").select(PERSON_COLS).eq("card_id", id).order("seq"),
      db.from("nf_guides").select("seq,name,mok,phone").eq("card_id", id).order("seq"),
      helperNames(),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const stats = await lessonStats((people ?? []).map((p: any) => String(p.id)));
    const t = today();
    return {
      ok: true, card: cardOut(c), guides: (guides ?? []).map(guideOut),
      people: (people ?? []).map((p: any) => personOut(p, v, {
        lessons: stats.get(String(p.id))?.n ?? 0, lastOn: stats.get(String(p.id))?.last || null,
        helperName: p.helper_id ? (names.get(String(p.helper_id)) ?? "") : "", guides: guides ?? [], card: c,
      }, t)),
    };
  }

  // 카드 한 장 저장(새로·고치기) — 카드 + 사람들 + 인도자. 고칠 때는 화면이 본 updated_at 을 base 로 보낸다(다르면 changed).
  //   같은 분이 이미 있으면(이름 + 전화 뒷자리 4) dup — 화면이 확인을 받고 force 로 다시 보낸다.
  //   고치면서 뺀 사람: 섬김이가 배정됐거나 교육 줄이 있으면 has-progress(그분의 기록을 카드 고치기로 지우지 않는다).
  async function nfCardSave(ctx: any, b: any) {
    const v = await viewOf(ctx);
    if (!canCardWrite(v)) return NOT_ASSIGNED;
    const chk = checkCard(b, today());
    if (!chk.ok) return chk;
    const raw = norm(b?.card_id);
    const cardId = raw ? uuidOf(raw) : "";
    if (raw && !cardId) return BAD_ID;

    let before: any[] = [];
    let cardStamp = "";
    if (cardId) {
      const { data: c, error } = await db.from("nf_cards").select("id,updated_at").eq("id", cardId).maybeSingle();
      if (error) throw error;
      if (!c) return NOT_FOUND;
      if (!sameTime(b?.base, c.updated_at)) return { ok: false, error: "changed" };
      cardStamp = String(c.updated_at);
      const { data: ps, error: e1 } = await db.from("nf_people").select("id,helper_id").eq("card_id", cardId);
      if (e1) throw e1;
      before = ps ?? [];
    }
    const beforeIds = new Set(before.map((p: any) => String(p.id)));
    for (const p of chk.people) {
      if (p.id && !beforeIds.has(String(p.id).toLowerCase())) return BAD_ID;   // 남의 카드의 사람 번호
    }
    const keepIds = new Set(chk.people.filter((p) => p.id).map((p) => String(p.id).toLowerCase()));
    const gone = before.filter((p: any) => !keepIds.has(String(p.id)));
    if (gone.length) {
      if (gone.some((p: any) => p.helper_id)) return { ok: false, error: "has-progress" };
      const { data: ls, error } = await db.from("nf_lessons").select("id").in("person_id", gone.map((p: any) => p.id)).limit(1);
      if (error) throw error;
      if ((ls ?? []).length) return { ok: false, error: "has-progress" };
    }

    if (b?.force !== true) {
      const fresh = chk.people.filter((p) => !p.id).map((p) => ({ name: String(p.name), key: dupKey(p.name, p.phone) })).filter((x) => x.key);
      if (fresh.length) {
        const { data: same, error } = await db.from("nf_people").select("id,name,phone,card_id").in("name", [...new Set(fresh.map((x) => x.name))]);
        if (error) throw error;
        const keys = new Set(fresh.map((x) => x.key));
        const hit = (same ?? []).filter((r: any) => keys.has(dupKey(r.name, r.phone)) && String(r.card_id) !== cardId);
        if (hit.length) return { ok: false, error: "dup", count: hit.length };
      }
    }

    const stamp = nowIso();
    let id = cardId;
    if (id) {
      const { data: upd, error } = await db.from("nf_cards").update({ ...chk.card, updated_at: stamp })
        .eq("id", id).eq("updated_at", cardStamp).select("id");
      if (error) throw error;
      if (!upd?.length) return { ok: false, error: "changed" };
    } else {
      const { data, error } = await db.from("nf_cards").insert({ ...chk.card, created_by: memberId(ctx) || null, updated_at: stamp }).select("id").single();
      if (error) throw error;
      id = String(data.id);
    }
    try {
      for (let i = 0; i < chk.people.length; i++) {
        const { id: pid, ...row } = chk.people[i] as any;
        if (pid) {
          const { error } = await db.from("nf_people").update({ ...row, seq: i + 1, updated_at: stamp }).eq("id", pid).eq("card_id", id);
          if (error) throw error;
        } else {
          const { error } = await db.from("nf_people").insert({ ...row, card_id: id, seq: i + 1, updated_at: stamp });
          if (error) throw error;
        }
      }
      if (gone.length) {
        const { error } = await db.from("nf_people").delete().in("id", gone.map((p: any) => p.id)).eq("card_id", id);
        if (error) throw error;
      }
      const { error: e1 } = await db.from("nf_guides").delete().eq("card_id", id);
      if (e1) throw e1;
      if (chk.guides.length) {
        const { error: e2 } = await db.from("nf_guides").insert(chk.guides.map((g: any) => ({ card_id: id, seq: g.seq, name: g.name, mok: g.mok, phone: g.phone })));
        if (e2) throw e2;
      }
    } catch (e) {
      // 새 카드가 반쯤 들어갔으면 통째로 걷는다(사람·인도자는 카드를 따라 지워진다) — 반쪽 카드를 남기지 않는다
      if (!cardId) await db.from("nf_cards").delete().eq("id", id);
      throw e;
    }
    await audit(ctx, "nf.card", id, { op: cardId ? "edit" : "new", people: chk.people.length, guides: chk.guides.length, draft: chk.card.draft === true });
    return { ok: true, card_id: id, updatedAt: stamp };
  }

  // ---------- 사진(비공개 칸 · §4) ----------
  // 올리기 — data: base64 JPEG. 크기와 JPEG 머리만 본다(위치 정보는 화면이 다시 그려 뗀다).
  async function nfPhotoPut(ctx: any, b: any) {
    const v = await viewOf(ctx);
    if (!canCardWrite(v)) return NOT_ASSIGNED;
    const id = uuidOf(b?.card_id), which = norm(b?.which);
    if (!id) return BAD_ID;
    if (!PHOTO_COL[which]) return { ok: false, error: "bad-which" };
    const s = typeof b?.data === "string" ? b.data : "";
    if (!s || s.length > NF_PHOTO_MAX * 1.4) return { ok: false, error: s ? "too-big" : "no-photo" };
    let bytes: Uint8Array;
    try {
      const bin = atob(s);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch (_) {
      return { ok: false, error: "bad-photo" };
    }
    if (bytes.length > NF_PHOTO_MAX) return { ok: false, error: "too-big" };
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { ok: false, error: "bad-photo" };
    const { data: c, error } = await db.from("nf_cards").select("id").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!c) return NOT_FOUND;
    const path = `cards/${id}/${which}.jpg`;
    const { error: e1 } = await db.storage.from(NF_BUCKET).upload(path, bytes, { contentType: "image/jpeg", upsert: true });
    if (e1) throw e1;
    const { error: e2 } = await db.from("nf_cards").update({ [PHOTO_COL[which]]: path }).eq("id", id);
    if (e2) throw e2;
    await audit(ctx, "nf.photo", id, { which, bytes: bytes.length });
    return { ok: true };
  }

  // 보기 — 5분짜리 서명 주소. 열 때마다 기록(nf.view).
  async function nfPhotoUrl(ctx: any, b: any) {
    const v = await viewOf(ctx);
    if (!canCardRead(v)) return NOT_ASSIGNED;
    const id = uuidOf(b?.card_id), which = norm(b?.which);
    if (!id) return BAD_ID;
    if (!PHOTO_COL[which]) return { ok: false, error: "bad-which" };
    const { data: c, error } = await db.from("nf_cards").select(`id,${PHOTO_COL[which]}`).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!c) return NOT_FOUND;
    const path = String((c as any)[PHOTO_COL[which]] || "");
    if (!path) return { ok: false, error: "no-photo" };
    const { data, error: e1 } = await db.storage.from(NF_BUCKET).createSignedUrl(path, NF_PHOTO_TTL);
    if (e1) throw e1;
    await audit(ctx, "nf.view", id, { what: "photo", which });
    return { ok: true, url: data?.signedUrl || "", ttl: NF_PHOTO_TTL };
  }

  // ---------- 명단 ----------
  // 모든 분(카드 읽는 분) 또는 내게 배정된 분(섬김이). 줄은 personOut 이 하는 일에 따라 고른다.
  async function nfList(ctx: any) {
    const v = await viewOf(ctx);
    const scope = listScope(v);
    if (scope === "none") return { ok: true, scope, today: today(), people: [], helpers: [] };
    const people = scope === "mine"
      ? await deps.allRows(() => db.from("nf_people").select(PERSON_COLS).eq("helper_id", v.helperId).order("created_at", { ascending: false }))
      : await deps.allRows(() => db.from("nf_people").select(PERSON_COLS).order("created_at", { ascending: false }));
    const cardIds = [...new Set(people.map((p: any) => String(p.card_id)))];
    const cards = new Map<string, any>(), guides = new Map<string, any[]>();
    for (let i = 0; i < cardIds.length; i += 200) {
      const part = cardIds.slice(i, i + 200);
      const [cs, gs] = await Promise.all([
        deps.allRows(() => db.from("nf_cards").select("id,reg_date,service,address,draft").in("id", part)),
        deps.allRows(() => db.from("nf_guides").select("card_id,seq,name,mok").in("card_id", part).order("seq")),
      ]);
      for (const c of cs) cards.set(String(c.id), c);
      for (const g of gs) guides.set(String(g.card_id), [...(guides.get(String(g.card_id)) ?? []), g]);
    }
    const [stats, names] = await Promise.all([lessonStats(people.map((p: any) => String(p.id))), helperNames()]);
    const t = today();
    const out = people.map((p: any) => personOut(p, v, {
      lessons: stats.get(String(p.id))?.n ?? 0, lastOn: stats.get(String(p.id))?.last || null,
      helperName: p.helper_id ? (names.get(String(p.helper_id)) ?? "") : "",
      guides: guides.get(String(p.card_id)) ?? [], card: cards.get(String(p.card_id)),
    }, t));
    // 배정하는 분에게만 섬김이 목록(쉬는 중 포함 · 맡은 수) — 섬김이·영접팀·목사님에게는 싣지 않는다
    let helpers: any[] = [];
    if (canAssign(v)) {
      const hs = await deps.allRows(() => db.from("nf_helpers").select(HELPER_COLS).order("name"));
      const load = new Map<string, number>();
      for (const p of out) if (p.stage === "learning" && p.helperId) load.set(String(p.helperId), (load.get(String(p.helperId)) ?? 0) + 1);
      helpers = hs.map((h: any) => ({ id: String(h.id), name: h.name, services: h.services || "", resting: h.resting === true, load: load.get(String(h.id)) ?? 0 }));
    }
    return { ok: true, scope, today: t, people: out, helpers };
  }

  // 한 분 줄 읽기(쓰기 액션이 먼저 부른다)
  async function personRow(id: string): Promise<any | null> {
    const { data, error } = await db.from("nf_people").select(PERSON_COLS).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ?? null;
  }
  async function lessonCount(id: string): Promise<number> {
    const { count, error } = await db.from("nf_lessons").select("id", { count: "exact", head: true }).eq("person_id", id).eq("kind", "lesson");
    if (error) throw error;
    return count ?? 0;
  }

  // 운영팀 — 수료 대상 바꾸기 · 멈춤/풀기 · 등록식을 미루는 사정. 화면이 본 updated_at(base)이 다르면 changed.
  //   수료 대상을 「아니오」로: 교육 줄이 있으면 has-lessons → force(줄은 지우지 않는다) · 수료번호를 드린 분은 confirmed.
  async function nfPersonSet(ctx: any, b: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const id = uuidOf(b?.person_id);
    if (!id) return BAD_ID;
    const p = await personRow(id);
    if (!p) return NOT_FOUND;
    if (!sameTime(b?.base, p.updated_at)) return { ok: false, error: "changed" };
    const patch: Record<string, unknown> = {};
    if (typeof b?.target === "boolean" && b.target !== p.target) {
      if (!b.target) {
        if (p.cert_no) return { ok: false, error: "confirmed" };
        if (b?.force !== true && (await lessonCount(id)) > 0) return { ok: false, error: "has-lessons" };
      }
      patch.target = b.target;
    }
    if (typeof b?.stopped === "boolean") {
      const reason = norm(b?.reason);
      if (reason.length > 120) return { ok: false, error: "too-long" };
      if (b.stopped && p.cert_no) return { ok: false, error: "confirmed" };
      patch.stopped_at = b.stopped ? (p.stopped_at || nowIso()) : null;
      patch.stop_reason = b.stopped ? reason : "";
    }
    if (typeof b?.wait_note === "string") {
      const w = norm(b.wait_note);
      if (w.length > 120) return { ok: false, error: "too-long" };
      patch.wait_note = w;
    }
    if (!Object.keys(patch).length) return { ok: true, updatedAt: p.updated_at };
    const stamp = nowIso();
    const { data: upd, error } = await db.from("nf_people").update({ ...patch, updated_at: stamp }).eq("id", id).eq("updated_at", p.updated_at).select("id");
    if (error) throw error;
    if (!upd?.length) return { ok: false, error: "changed" };
    await audit(ctx, "nf.person", id, { keys: Object.keys(patch).sort() });
    return { ok: true, updatedAt: stamp };
  }

  // 섬김이 배정·바꾸기·풀기(운영팀 · 정착팀 총무). 교육이 1:1 이라 한 분에 한 분.
  //   수료 대상이 아니면 not-target · 멈춘 분 stopped · 보고서를 보낸 뒤에는 sent · 쉬는 중인 섬김이 resting.
  //   바꿔도 적어 둔 교육 줄은 그대로 남는다(줄마다 쓴 분이 있다).
  async function nfAssign(ctx: any, b: any) {
    const v = await viewOf(ctx);
    if (!canAssign(v)) return NOT_ASSIGNED;
    const id = uuidOf(b?.person_id);
    if (!id) return BAD_ID;
    const raw = norm(b?.helper_id);
    const helperId = raw ? uuidOf(raw) : "";
    if (raw && !helperId) return BAD_ID;
    const p = await personRow(id);
    if (!p) return NOT_FOUND;
    if (!p.target) return { ok: false, error: "not-target" };
    if (p.stopped_at) return { ok: false, error: "stopped" };
    if (p.report_sent_at) return { ok: false, error: "sent" };
    if (helperId) {
      const { data: h, error } = await db.from("nf_helpers").select("id,resting").eq("id", helperId).maybeSingle();
      if (error) throw error;
      if (!h) return NOT_FOUND;
      if (h.resting) return { ok: false, error: "resting" };
    }
    if ((p.helper_id ? String(p.helper_id) : "") === helperId) return { ok: true, updatedAt: p.updated_at };
    const stamp = nowIso();
    const { data: upd, error } = await db.from("nf_people")
      .update({ helper_id: helperId || null, assigned_at: helperId ? stamp : null, updated_at: stamp })
      .eq("id", id).eq("updated_at", p.updated_at).select("id");
    if (error) throw error;
    if (!upd?.length) return { ok: false, error: "changed" };
    await audit(ctx, "nf.assign", id, { op: !helperId ? "clear" : p.helper_id ? "change" : "set", helper: helperId || null });
    return { ok: true, updatedAt: stamp };
  }

  return { viewOf, nfMe, nfStaffList, nfStaffApprove, nfStaffSet, nfHelperSave, nfPeopleFind,
    nfCardGet, nfCardSave, nfPhotoPut, nfPhotoUrl, nfList, nfPersonSet, nfAssign };
}
