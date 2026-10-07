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
import { canAssign, canCardRead, canCardWrite, canLessonRead, canLessonWrite, canPastor, certNo, checkCard, checkKinds, checkLesson, classGate, dupKey, isDate, NF_LESSONS,
  kstDate, lessonGate, lessonKindFor, lessonOut, listScope, NF_BAD, NF_BASES, NF_KINDS, buildStats, parishGate, personOut, reportGate, stageOf, type NfView } from "./nf-rules.ts";
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
// 편성 교구 글자 — 「교구-목장」(예: 믿음-35 · 소망-남성1)
const PARISH_RE = /^[가-힣]{1,6}-[0-9가-힣]{1,8}$/;
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
    if (scope === "none") return { ok: true, scope, today: today(), people: [], helpers: [], cards: [], canWrite: false, canAssign: false, chief: false, canPastor: false, myHelperId: null };
    const people = scope === "mine"
      ? await deps.allRows(() => db.from("nf_people").select(PERSON_COLS).eq("helper_id", v.helperId).order("created_at", { ascending: false }))
      : await deps.allRows(() => db.from("nf_people").select(PERSON_COLS).order("created_at", { ascending: false }));
    const cardIds = [...new Set(people.map((p: any) => String(p.card_id)))];
    const cards = new Map<string, any>(), guides = new Map<string, any[]>();
    for (let i = 0; i < cardIds.length; i += 200) {
      const part = cardIds.slice(i, i + 200);
      const [cs, gs] = await Promise.all([
        deps.allRows(() => db.from("nf_cards").select("id,reg_date,service,address,draft,card_photo,welcome_photo").in("id", part)),
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
    // 카드 묶음(새가족 카드 메뉴) — 카드를 읽는 분에게만. 사진은 있는지만(주소는 nfPhotoUrl 이 볼 때마다 만든다)
    const cardList = canCardRead(v) ? [...cards.values()].map((c: any) => ({
      id: String(c.id), regDate: c.reg_date, service: c.service || "", draft: c.draft === true,
      hasCardPhoto: !!c.card_photo, hasWelcomePhoto: !!c.welcome_photo,
    })) : [];
    return { ok: true, scope, today: t, people: out, helpers, cards: cardList, canWrite: canCardWrite(v), canAssign: canAssign(v), chief: v.chief,
      canPastor: canPastor(v), myHelperId: v.helperId };
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


  // ══════════ 2단계 — 교육 줄 · 목사님 교육 · 보고서 · 교구 배정(§3) ══════════
  // 교육 줄 = 섬김이 보고서의 한 줄(일자 · 내용 · 비고). 따로 쓰는 보고서는 없다 — 네 줄이 차고 목사님 교육을 마치면 「목사님께 보내기」.
  const LESSON_COLS = "id,person_id,kind,met_on,content,note,written_by,updated_at";
  async function lessonRows(id: string): Promise<any[]> {
    const { data, error } = await db.from("nf_lessons").select(LESSON_COLS).eq("person_id", id).order("met_on").order("created_at");
    if (error) throw error;
    return data ?? [];
  }
  // 한 분의 줄(이름표용) — 카드 두 칸과 인도자
  async function personExtra(p: any, lessons: any[], names: Map<string, string>) {
    const [{ data: c, error: e1 }, { data: gs, error: e2 }] = await Promise.all([
      db.from("nf_cards").select("id,reg_date,service,address").eq("id", p.card_id).maybeSingle(),
      db.from("nf_guides").select("seq,name,mok").eq("card_id", p.card_id).order("seq"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const ls = lessons.filter((l) => l.kind === "lesson");
    return { lessons: ls.length, lastOn: ls.length ? ls[ls.length - 1].met_on : null,
      helperName: p.helper_id ? (names.get(String(p.helper_id)) ?? "") : "", guides: gs ?? [], card: c };
  }

  // 한 분의 교육 기록(= 보고서) 읽기. 내용은 운영팀·목사님·그분의 섬김이에게만 — 영접팀·총무는 not-assigned(몇 번째인지는 명단에 있다).
  async function nfLessons(ctx: any, b: any) {
    const v = await viewOf(ctx);
    const id = uuidOf(b?.person_id);
    if (!id) return BAD_ID;
    const p = await personRow(id);
    if (!p) return NOT_FOUND;
    if (!canLessonRead(v, p)) return NOT_ASSIGNED;
    const [rows, names] = await Promise.all([lessonRows(id), helperNames()]);
    const extra = await personExtra(p, rows, names);
    const mine = canLessonWrite(v, p);
    if (!mine || v.chief) await audit(ctx, "nf.view", id, { what: "report", lines: rows.length });   // 섬김이 본인이 제 줄을 여는 것은 남기지 않는다
    return {
      ok: true, person: personOut(p, v, extra, today()),
      lessons: rows.map((l: any) => lessonOut(l, l.written_by ? (names.get(String(l.written_by)) ?? "") : "")),
      reportReturn: p.report_return || "", sent: !!p.report_sent_at, classOn: p.pastor_class_on || null, parish: p.parish || "",
      canWrite: mine && !lessonGate(p) && !p.stopped_at, canSend: mine && !reportGate(p) && !p.stopped_at, canPastor: canPastor(v),
    };
  }

  // 줄 넣기·고치기 — 그분의 섬김이(또는 운영팀)만. 네 번까지는 교육(lesson), 그 뒤는 덧붙인 줄(extra).
  //   같은 날 교육 두 번은 same-day · 보고서를 보낸 뒤에는 sent · 섬김이가 없으면 no-helper.
  async function nfLessonSave(ctx: any, b: any) {
    const v = await viewOf(ctx);
    const id = uuidOf(b?.person_id);
    if (!id) return BAD_ID;
    const p = await personRow(id);
    if (!p) return NOT_FOUND;
    if (!canLessonWrite(v, p)) return NOT_ASSIGNED;
    const gate = lessonGate(p);
    if (gate) return { ok: false, error: gate };
    if (p.stopped_at) return { ok: false, error: "stopped" };
    const chk = checkLesson(b, today());
    if (!chk.ok) return chk;
    const raw = norm(b?.id);
    const lid = raw ? uuidOf(raw) : "";
    if (raw && !lid) return BAD_ID;
    const stamp = nowIso();
    const dupDay = (e: any) => String(e?.code) === "23505";
    if (lid) {
      const { data, error } = await db.from("nf_lessons").update({ ...chk.row, updated_at: stamp }).eq("id", lid).eq("person_id", id).select("id");
      if (error) { if (dupDay(error)) return { ok: false, error: "same-day" }; throw error; }
      if (!data?.length) return NOT_FOUND;
      await audit(ctx, "nf.lesson", id, { op: "edit", on: chk.row.met_on });
      return { ok: true, id: lid };
    }
    const kind = lessonKindFor(await lessonCount(id));
    // 쓴 분 — 섬김이 본인이면 그분, 운영팀이 대신 적으면 그분의 섬김이
    const writer = v.helperId && String(p.helper_id) === v.helperId ? v.helperId : String(p.helper_id);
    const { data, error } = await db.from("nf_lessons").insert({ person_id: id, kind, ...chk.row, written_by: writer, updated_at: stamp }).select("id").single();
    if (error) { if (dupDay(error)) return { ok: false, error: "same-day" }; throw error; }
    await audit(ctx, "nf.lesson", id, { op: "new", kind, on: chk.row.met_on });
    return { ok: true, id: String(data.id), kind };
  }

  async function nfLessonDelete(ctx: any, b: any) {
    const v = await viewOf(ctx);
    const id = uuidOf(b?.person_id), lid = uuidOf(b?.id);
    if (!id || !lid) return BAD_ID;
    const p = await personRow(id);
    if (!p) return NOT_FOUND;
    if (!canLessonWrite(v, p)) return NOT_ASSIGNED;
    const gate = lessonGate(p);
    if (gate) return { ok: false, error: gate };
    if (p.pastor_class_on) return { ok: false, error: "class-done" };   // 목사님 교육을 마친 뒤에는 줄을 지워 네 번 아래로 내리지 못한다(고치기는 된다)
    const { data, error } = await db.from("nf_lessons").delete().eq("id", lid).eq("person_id", id).select("id");
    if (error) throw error;
    if (!data?.length) return NOT_FOUND;
    await audit(ctx, "nf.lesson", id, { op: "delete" });
    return { ok: true };
  }

  // 한 분 줄을 고친다 — 읽은 때(updated_at)가 그대로일 때만(그사이 다른 분이 바꿨으면 changed)
  async function patchPerson(p: any, patch: Record<string, unknown>): Promise<Fail | { ok: true; updatedAt: string }> {
    const stamp = nowIso();
    const { data, error } = await db.from("nf_people").update({ ...patch, updated_at: stamp }).eq("id", p.id).eq("updated_at", p.updated_at).select("id");
    if (error) throw error;
    return data?.length ? { ok: true, updatedAt: stamp } : { ok: false, error: "changed" };
  }

  // 새가족 목사님 교육 — 한 번 · 참석 여부만(친구 2026-10-07). on:true 참석(날짜는 오늘 · date 로 지난 날) · on:false 풀기(보고서를 보내기 전까지).
  async function nfPastorClass(ctx: any, b: any) {
    const v = await viewOf(ctx);
    if (!canPastor(v)) return NOT_ASSIGNED;
    const id = uuidOf(b?.person_id);
    if (!id) return BAD_ID;
    if (typeof b?.on !== "boolean") return { ok: false, error: "bad-input" };
    const p = await personRow(id);
    if (!p) return NOT_FOUND;
    if (p.stopped_at) return { ok: false, error: "stopped" };
    const gate = classGate(p, await lessonCount(id), b.on);
    if (gate) return { ok: false, error: gate };
    let on: string | null = null;
    if (b.on) {
      on = norm(b?.date) || today();
      if (!isDate(on) || on > today()) return { ok: false, error: "bad-date" };
    }
    const r = await patchPerson(p, { pastor_class_on: on });
    if (r.ok) await audit(ctx, "nf.class", id, { on: b.on });
    return r;
  }

  // 섬김이가 보고서(교육 줄들)를 목사님께 보낸다 — 목사님 교육을 마친 분만. 보낸 뒤에는 줄을 못 고친다.
  async function nfReportSend(ctx: any, b: any) {
    const v = await viewOf(ctx);
    const id = uuidOf(b?.person_id);
    if (!id) return BAD_ID;
    const p = await personRow(id);
    if (!p) return NOT_FOUND;
    if (!canLessonWrite(v, p)) return NOT_ASSIGNED;
    if (p.stopped_at) return { ok: false, error: "stopped" };
    const gate = reportGate(p);
    if (gate) return { ok: false, error: gate };
    const r = await patchPerson(p, { report_sent_at: nowIso(), report_return: "" });
    if (r.ok) await audit(ctx, "nf.report", id, { op: "send" });
    return r;
  }

  // 목사님이 보고서를 섬김이께 돌려보낸다(한마디와 함께) — 교구를 정하기 전까지. 돌려보내면 섬김이가 다시 고칠 수 있다.
  async function nfReportReturn(ctx: any, b: any) {
    const v = await viewOf(ctx);
    if (!canPastor(v)) return NOT_ASSIGNED;
    const id = uuidOf(b?.person_id);
    if (!id) return BAD_ID;
    const note = norm(b?.note);
    if (!note) return { ok: false, error: "no-note" };
    if (note.length > 300) return { ok: false, error: "too-long" };
    const p = await personRow(id);
    if (!p) return NOT_FOUND;
    if (!p.report_sent_at) return { ok: false, error: "not-ready" };
    if (p.parish) return { ok: false, error: "has-parish" };
    const r = await patchPerson(p, { report_sent_at: null, report_return: note });
    if (r.ok) await audit(ctx, "nf.report", id, { op: "return" });
    return r;
  }

  // 편성 교구 고르기 목록 — 교인명부의 목장 값(예: 믿음-35 · 목장까지 — 친구 2026-10-07). 10분 동안 기억해 둔다.
  let mokCache: { at: number; list: string[] } | null = null;
  async function mokList(): Promise<string[]> {
    const t = deps.now ? deps.now() : Date.now();
    if (mokCache && t - mokCache.at < 600000) return mokCache.list;
    const rows = await deps.allRows(() => db.from("church_people").select("mok3").neq("mok3", "").order("person_id"));
    const set = new Set<string>();
    // 교적의 목장 칸은 「기쁨-02목장」 꼴이다 — 끝의 「목장」을 떼어 「기쁨-02」로(등록식 교구 편성표에 적던 꼴)
    for (const r of rows) { const m = norm(r.mok3).replace(/\s*목장$/, ""); if (PARISH_RE.test(m)) set.add(m); }
    const list = [...set].sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
    mokCache = { at: t, list };
    return list;
  }
  async function nfParishList(ctx: any) {
    const v = await viewOf(ctx);
    if (!canPastor(v)) return NOT_ASSIGNED;
    return { ok: true, list: await mokList() };
  }

  // 교구 배정 — 보고서가 온 분만 · 등록식에서 수료번호를 드리기 전까지 바꿀 수 있다. 여기까지가 등록 절차다.
  //   목록(교인명부의 목장)에 있는 글자만 받는다. 명부가 없는 DB(목록이 빔)에서는 「교구-목장」 꼴이면 받는다.
  async function nfParishSet(ctx: any, b: any) {
    const v = await viewOf(ctx);
    if (!canPastor(v)) return NOT_ASSIGNED;
    const id = uuidOf(b?.person_id);
    if (!id) return BAD_ID;
    const parish = norm(b?.parish);
    if (!parish || parish.length > 20 || !PARISH_RE.test(parish)) return { ok: false, error: "bad-parish" };
    const list = await mokList();
    if (list.length && !list.includes(parish)) return { ok: false, error: "bad-parish" };
    const p = await personRow(id);
    if (!p) return NOT_FOUND;
    if (p.stopped_at) return { ok: false, error: "stopped" };
    const gate = parishGate(p);
    if (gate) return { ok: false, error: gate };
    const r = await patchPerson(p, { parish, parish_at: nowIso() });
    if (r.ok) await audit(ctx, "nf.parish", id, { op: p.parish ? "change" : "set", parish });
    return r;
  }


  // ══════════ 3단계 — 등록식(§4) · 운영팀만 ══════════
  // 명단은 운영팀이 만든다(저절로 채우지 않는다 — 교육이 끝나도 바로 등록식에 서지 않는 분이 있다). 후보 = 교구 배정까지 끝났고 아직 수료번호가 없는 분.
  // 수료번호는 확정할 때 SQL 함수 nf_ceremony_confirm 이 매긴다(참석으로 표시한 분 · 이름순 · 2026년은 201부터).
  const idList = (x: unknown): string[] | null => {
    if (x === undefined || x === null) return [];
    if (!Array.isArray(x) || x.length > 200) return null;
    const out = x.map((v) => uuidOf(v));
    return out.some((v) => !v) ? null : [...new Set(out)];
  };
  async function ceremonyRow(id: string): Promise<any | null> {
    const { data, error } = await db.from("nf_ceremonies").select("id,held_on,note,confirmed_at,first_no,last_no").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  async function nfCeremonyList(ctx: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const [cs, people, names, settings] = await Promise.all([
      deps.allRows(() => db.from("nf_ceremonies").select("id,held_on,note,confirmed_at,first_no,last_no").order("held_on", { ascending: false })),
      deps.allRows(() => db.from("nf_people").select(PERSON_COLS).eq("target", true).not("report_sent_at", "is", null).order("name")),
      helperNames(),
      deps.allRows(() => db.from("nf_settings").select("year,next_no")),
    ]);
    const row = (p: any) => ({ id: String(p.id), name: p.name, gender: p.gender || "", parish: p.parish || "",
      helperName: p.helper_id ? (names.get(String(p.helper_id)) ?? "") : "" });
    const by = new Map<string, any[]>();
    for (const p of people) if (p.ceremony_id) by.set(String(p.ceremony_id), [...(by.get(String(p.ceremony_id)) ?? []), p]);
    const nextOf = new Map(settings.map((s: any) => [Number(s.year), Number(s.next_no)]));
    return {
      ok: true, today: today(),
      ceremonies: cs.map((c: any) => {
        const y = Number(String(c.held_on).slice(0, 4));
        return {
          id: String(c.id), heldOn: c.held_on, note: c.note || "", confirmed: !!c.confirmed_at,
          first: c.first_no ? certNo(y, c.first_no) : "", last: c.last_no ? certNo(y, c.last_no) : "",
          nextNo: c.confirmed_at ? "" : certNo(y, nextOf.get(y) ?? 1),   // 지금 확정하면 붙을 첫 번호
          people: (by.get(String(c.id)) ?? []).map((p: any) => ({ ...row(p), attended: p.attended === true, certNo: p.cert_no || "" })),
        };
      }),
      // 후보 — 교구 배정까지 끝났고 아직 어느 등록식에도 담기지 않은 분(기다린 날 수 = 교구를 정한 날부터)
      candidates: people.filter((p: any) => stageOf(p, NF_LESSONS) === "registered" && !p.ceremony_id)
        .map((p: any) => ({ ...row(p), parishAt: p.parish_at, waitNote: p.wait_note || "", updatedAt: p.updated_at })),
      // 교구 배정을 기다리는 분 — 담을 수 없다(보이기만 · 등록식 전에 목사님께 여쭐 수 있게)
      waiting: people.filter((p: any) => stageOf(p, NF_LESSONS) === "wait_parish").map(row),
    };
  }

  // 등록식 만들기·날짜 고치기·지우기(확정 전까지). 지우면 담아 둔 분은 다시 후보로.
  async function nfCeremonySave(ctx: any, b: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const raw = norm(b?.id);
    const id = raw ? uuidOf(raw) : "";
    if (raw && !id) return BAD_ID;
    let cur: any = null;
    if (id) {
      cur = await ceremonyRow(id);
      if (!cur) return NOT_FOUND;
      if (cur.confirmed_at) return { ok: false, error: "confirmed" };
    }
    if (b?.delete === true) {
      if (!id) return BAD_ID;
      const { error: e1 } = await db.from("nf_people").update({ ceremony_id: null, attended: null }).eq("ceremony_id", id).is("cert_no", null);
      if (e1) throw e1;
      const { error: e2 } = await db.from("nf_ceremonies").delete().eq("id", id).is("confirmed_at", null);
      if (e2) throw e2;
      await audit(ctx, "nf.ceremony", id, { op: "delete" });
      return { ok: true };
    }
    const on = norm(b?.held_on), note = norm(b?.note);
    if (!isDate(on)) return { ok: false, error: "bad-date" };
    if (note.length > 120) return { ok: false, error: "too-long" };
    if (id) {
      const { error } = await db.from("nf_ceremonies").update({ held_on: on, note }).eq("id", id).is("confirmed_at", null);
      if (error) throw error;
      await audit(ctx, "nf.ceremony", id, { op: "edit", on });
      return { ok: true, id };
    }
    const { data, error } = await db.from("nf_ceremonies").insert({ held_on: on, note }).select("id").single();
    if (error) throw error;
    await audit(ctx, "nf.ceremony", String(data.id), { op: "new", on });
    return { ok: true, id: String(data.id) };
  }

  // 명단에 담기(add) · 빼기(remove) · 참석 표시(attend: [{id, on}]) — 확정 전까지.
  //   담을 수 있는 분은 교구 배정까지 끝났고 멈추지 않았고 수료번호가 없고 다른 등록식에 담기지 않은 분뿐(아니면 조용히 건너뛰고 skipped 로 알린다).
  async function nfCeremonyPeople(ctx: any, b: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const id = uuidOf(b?.ceremony_id);
    if (!id) return BAD_ID;
    const add = idList(b?.add), remove = idList(b?.remove);
    const att = Array.isArray(b?.attend) && b.attend.length <= 200 ? b.attend : b?.attend === undefined ? [] : null;
    if (!add || !remove || !att) return BAD_ID;
    for (const a of att) if (!uuidOf(a?.id) || typeof a?.on !== "boolean") return BAD_ID;
    const c = await ceremonyRow(id);
    if (!c) return NOT_FOUND;
    if (c.confirmed_at) return { ok: false, error: "confirmed" };
    const stamp = nowIso();
    let added = 0;
    if (add.length) {
      const { data, error } = await db.from("nf_people").update({ ceremony_id: id, attended: true, updated_at: stamp })
        .in("id", add).is("ceremony_id", null).is("cert_no", null).is("stopped_at", null).eq("target", true).neq("parish", "").select("id");
      if (error) throw error;
      added = (data ?? []).length;
    }
    if (remove.length) {
      const { error } = await db.from("nf_people").update({ ceremony_id: null, attended: null, updated_at: stamp }).in("id", remove).eq("ceremony_id", id).is("cert_no", null);
      if (error) throw error;
    }
    for (const on of [true, false]) {
      const ids = att.filter((a: any) => a.on === on).map((a: any) => uuidOf(a.id));
      if (!ids.length) continue;
      const { error } = await db.from("nf_people").update({ attended: on, updated_at: stamp }).in("id", ids).eq("ceremony_id", id).is("cert_no", null);
      if (error) throw error;
    }
    await audit(ctx, "nf.ceremony", id, { op: "people", added, removed: remove.length, attend: att.length });
    return { ok: true, added, skipped: add.length - added };
  }

  // 확정 — 참석으로 표시한 분에게 수료번호를 매긴다(되돌릴 수 없다). 화면이 본 참석 수(expect)가 지금과 다르면 changed.
  async function nfCeremonyConfirm(ctx: any, b: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const id = uuidOf(b?.ceremony_id);
    if (!id) return BAD_ID;
    if (typeof b?.expect !== "number" || !Number.isSafeInteger(b.expect) || b.expect < 1) return { ok: false, error: "bad-input" };
    const c = await ceremonyRow(id);
    if (!c) return NOT_FOUND;
    const { count, error: e0 } = await db.from("nf_people").select("id", { count: "exact", head: true }).eq("ceremony_id", id).eq("attended", true);
    if (e0) throw e0;
    if ((count ?? 0) !== b.expect) return { ok: false, error: "changed" };
    const { data, error } = await db.rpc("nf_ceremony_confirm", { p_ceremony: id });
    if (error) throw error;
    if (!data?.ok) return { ok: false, error: String(data?.error || "server") };
    await audit(ctx, "nf.ceremony", id, { op: "confirm", count: data.count, first: data.first, last: data.last });
    return { ok: true, count: Number(data.count), first: String(data.first), last: String(data.last) };
  }

  // 등록식 명단 내려받기(엑셀 한 장) — 지금 쓰시는 「당월등록식명단」 시트의 칸 차례. 열람 기록 nf.export(수만).
  async function nfExport(ctx: any, b: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const id = uuidOf(b?.ceremony_id);
    if (!id) return BAD_ID;
    const c = await ceremonyRow(id);
    if (!c) return NOT_FOUND;
    const [people, names] = await Promise.all([
      deps.allRows(() => db.from("nf_people").select(PERSON_COLS).eq("ceremony_id", id).order("cert_no", { nullsFirst: false }).order("name")),
      helperNames(),
    ]);
    const cardIds = [...new Set(people.map((p: any) => String(p.card_id)))];
    const cards = new Map<string, any>(), guides = new Map<string, any[]>();
    if (cardIds.length) {
      const [cs, gs] = await Promise.all([
        deps.allRows(() => db.from("nf_cards").select("id,reg_date,self_come").in("id", cardIds)),
        deps.allRows(() => db.from("nf_guides").select("card_id,seq,name,mok").in("card_id", cardIds).order("seq")),
      ]);
      for (const x of cs) cards.set(String(x.id), x);
      for (const g of gs) guides.set(String(g.card_id), [...(guides.get(String(g.card_id)) ?? []), g]);
    }
    const BAP: Record<string, string> = { yes: "O", no: "X", unknown: "" };
    const table: unknown[][] = [["No", "수료번호", "성명", "성별", "생일", "연락처", "인도자", "등록일", "섬김이", "전도 교구", "편성 교구", "참석", "세례"]];
    people.forEach((p: any, i: number) => {
      const card = cards.get(String(p.card_id)), gs = guides.get(String(p.card_id)) ?? [];
      table.push([i + 1, p.cert_no || "", p.name, p.gender || "", p.birth ? p.birth + (p.birth_lunar ? " (음)" : "") : "", p.phone || "",
        card?.self_come ? "스스로" : gs.map((g: any) => g.name).join(", "), card?.reg_date || "", p.helper_id ? (names.get(String(p.helper_id)) ?? "") : "",
        card?.self_come ? "스스로" : gs.map((g: any) => g.mok).filter(Boolean).join(", "), p.parish || "",
        p.cert_no ? "O" : p.attended === true ? "O" : p.attended === false ? "X" : "", BAP[p.baptized] ?? ""]);
    });
    await audit(ctx, "nf.export", id, { count: people.length });
    return { ok: true, heldOn: c.held_on, confirmed: !!c.confirmed_at, table };
  }

  // 한 분 지우기 — 본인이 지워 달라고 하셨을 때(§7). 교육 줄은 함께 지워진다. 카드에 아무도 남지 않으면 카드와 사진도 지운다.
  //   수료번호를 드린 분은 지우지 않는다(confirmed — 번호가 비면 안 된다). 화면이 본 때(base)가 다르면 changed.
  async function nfPersonDelete(ctx: any, b: any) {
    if (!isChief(ctx)) return CHIEF_ONLY;
    const id = uuidOf(b?.person_id);
    if (!id) return BAD_ID;
    const p = await personRow(id);
    if (!p) return NOT_FOUND;
    if (!sameTime(b?.base, p.updated_at)) return { ok: false, error: "changed" };
    if (p.cert_no) return { ok: false, error: "confirmed" };
    const { data, error } = await db.from("nf_people").delete().eq("id", id).eq("updated_at", p.updated_at).select("id");
    if (error) throw error;
    if (!data?.length) return { ok: false, error: "changed" };
    const { count, error: e1 } = await db.from("nf_people").select("id", { count: "exact", head: true }).eq("card_id", p.card_id);
    if (e1) throw e1;
    let cardGone = false;
    if (!count) {
      await db.storage.from(NF_BUCKET).remove([`cards/${p.card_id}/card.jpg`, `cards/${p.card_id}/welcome.jpg`]);
      const { error: e2 } = await db.from("nf_cards").delete().eq("id", p.card_id);
      if (e2) throw e2;
      cardGone = true;
    }
    await audit(ctx, "nf.person", id, { op: "delete", cardGone });
    return { ok: true, cardGone };
  }


  // ══════════ 4단계 — 통계(운영팀·새가족 목사님) ══════════
  // 숫자만 돌려준다(nf-rules.ts buildStats). basis: card·parish·ceremony · year: 볼 해(없으면 올해).
  async function nfStats(ctx: any, b: any) {
    const v = await viewOf(ctx);
    if (!canPastor(v)) return NOT_ASSIGNED;
    const basis = norm(b?.basis) || "card";
    if (!(NF_BASES as readonly string[]).includes(basis)) return { ok: false, error: "bad-input" };
    const thisYear = Number(today().slice(0, 4));
    const year = b?.year === undefined || b?.year === null || b?.year === "" ? thisYear : Number(b.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, error: "bad-input" };
    const [people, cards, guides, cers, lessons, names] = await Promise.all([
      deps.allRows(() => db.from("nf_people").select("id,card_id,target,helper_id,pastor_class_on,report_sent_at,parish,parish_at,ceremony_id,cert_no,stopped_at").order("id")),
      deps.allRows(() => db.from("nf_cards").select("id,reg_date,self_come").order("id")),
      deps.allRows(() => db.from("nf_guides").select("card_id,seq,mok").order("card_id").order("seq")),
      deps.allRows(() => db.from("nf_ceremonies").select("id,held_on").order("id")),
      deps.allRows(() => db.from("nf_lessons").select("person_id").eq("kind", "lesson").order("id")),
      helperNames(),
    ]);
    const gm = new Map<string, any[]>(), lm = new Map<string, number>();
    for (const g of guides) gm.set(String(g.card_id), [...(gm.get(String(g.card_id)) ?? []), g]);
    for (const l of lessons) lm.set(String(l.person_id), (lm.get(String(l.person_id)) ?? 0) + 1);
    const out = buildStats({ people, cards: new Map(cards.map((c: any) => [String(c.id), c])), guides: gm,
      ceremonies: new Map(cers.map((c: any) => [String(c.id), String(c.held_on)])), lessons: lm, helpers: names }, basis, year);
    return { ok: true, today: today(), ...out };
  }

  return { viewOf, nfMe, nfStaffList, nfStaffApprove, nfStaffSet, nfHelperSave, nfPeopleFind,
    nfCardGet, nfCardSave, nfPhotoPut, nfPhotoUrl, nfList, nfPersonSet, nfAssign,
    nfLessons, nfLessonSave, nfLessonDelete, nfPastorClass, nfReportSend, nfReportReturn, nfParishList, nfParishSet,
    nfCeremonyList, nfCeremonySave, nfCeremonyPeople, nfCeremonyConfirm, nfExport, nfPersonDelete, nfStats };
}
