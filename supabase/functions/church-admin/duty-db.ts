// 봉사 당번 — 표를 읽고 쓰는 쪽(서버 · 2026-10-06 · 설계 v2 docs/superpowers/specs/2026-10-06-duty-roster-design.md §3·§9)
//   규칙·칸 지도는 duty-rules.ts(순수), 정원·겹침·잠금·쉼은 SQL 함수(성경암송 supabase/duty.sql). index.ts 의 switch 가 makeDuty(...) 의 함수를 부른다.
// ⚠️ npm import 를 두지 않는다 — db(supabase 클라이언트)를 받아 쓴다(Node 시험이 이 파일을 import 할 수 있게).
// ⚠️ 응답에 user_id·ident_key·confirmed_by 를 싣지 않는다(boardOut·rosterOut 이 칸을 하나씩 고른다 · SQL 함수의 답도 그대로 돌려주지 않고 칸을 고른다).
//    기록(audit) detail 에 이름을 싣지 않는다(id·수·날짜만).
// ⚠️ 「맡은 당번만」: 당번 담당(dutylead)은 duty_board_staff 에 (당번, 나) 줄이 있는 당번만 — 당번·자리·지원을 건드리는 액션은 모두 mayTouch 를
//    먼저 지난다(아니면 not-assigned · 그 당번의 것을 읽지도 쓰지도 않는다). 당번 총괄(duty)·총괄 관리자(super)는 지나간다.
//    ⚠️ 당번은 **줄에서 읽는다** — 자리 번호는 자리 줄 → 당번, 지원 번호는 지원 줄 → 자리 → 당번, 틀 번호는 틀 줄 → 당번.
//       몸통의 board_id 를 믿고 남의 당번의 줄 번호를 건드리지 못하게(교육 guardEnrollment 와 같은 까닭).
//    ⚠️ 총괄만 되는 일(만들기·이름·준비/보관·담당자 지정)의 거절은 chief-only — forbidden 을 돌려주면 화면이 통째로 다시 부팅한다.
//    액션 권한(어느 역할이 부르나)은 authz.ts ACTION_ROLES — 여기는 「어느 당번인가」만 본다.
// ⚠️ 상태는 SQL 함수로만 바꾼다(지원·빼기·옮기기·확정·쉼·정원·틀·담당자 메모). 여기서 표에 직접 쓰는 것은 둘뿐:
//    당번 설정(duty_boards) · 담당자 줄(duty_board_staff).
//    ⚠️ **duty_signups 에는 직접 쓰지 않는다**(메모 한 칸도 duty_note_set) — 쓰기 연결 트리거가 「줄 → 전역 잠금」 차례로 잠가
//       그 줄을 빼거나 옮기는 SQL 함수(전역 잠금 → 줄)와 서로 기다린다(검토 반영 2026-10-06).
// ⚠️ 알림(3단계)은 저장·기록이 **끝난 뒤** 부탁만 한다(deps.dutyNotify — 없으면 아무것도 안 한다 · 실패해도 저장은 성공 → notified·missed·notifyError).
//    notified = 실제로 나간 분 수 · missed = 가지 않은 분 수(받는 기기 없음 — 0 이면 싣지 않는다) · notifyError: notify-failed(부르지 못함) · notify-off(알림을 꺼 둠).
import { boardOrder, boardOut, boardPatchFor, checkBoard, checkLine, checkLineIds, checkNote, dutyChief, DUTY_STAFF_ROLES, exportSheets,
  hidesFromApp, historyOut, identHasCtrl, isDate, overlapForStaff, peopleInfoSheet, peopleOut, peopleSheet, placeOut, rosterOut, staffByBoard, staffNames, yearOf } from "./duty-rules.ts";
import { checkStaffIds, checkTypedIdent, kstDate, staffCandidateOut } from "./edu-rules.ts";
import { norm } from "./authz.ts";

type Db = any;
type Audit = (ctx: any, action: string, target: string, detail?: Record<string, unknown>) => Promise<void>;
type Fail = { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOARD_COLS = "id,title,description,place,contact_note,open_days,until_date,max_ahead,status,created_at,updated_at";
const LINE_COLS = "id,board_id,sort,service,task,start_time,end_time,capacity,weekday,active";
// 당번 담당자 줄 + 이름·상태(admin_members 두 칸만 붙여 읽는다 — auth_user_id·카카오 칸은 읽지 않는다)
const STAFF_SEL = "board_id,member_id,admin_members(name,status)";
const NOT_ASSIGNED: Fail = { ok: false, error: "not-assigned" };
const CHIEF_ONLY: Fail = { ok: false, error: "chief-only" };
const BAD_ID: Fail = { ok: false, error: "bad-id" };
const NOT_FOUND: Fail = { ok: false, error: "not-found" };

// deps — peopleLookup: 교인명부에서 이름으로 찾기(후보 모양 · 교인ID 없음 · 기록 people.lookup from:"duty")
//        personPick: 같은 찾기를 서버가 다시 돌려 pick 번째 분의 신원을 만든다(교인ID 는 서버 안에만 — 교육 대신 등록과 같은 함수)
//        allRows: 1,000줄 쪽 넘기기(index.ts)
//        dutyNotify: 알림 부탁(3단계 — 성경암송 api internalDutyNotify) · kind: confirmed·added·moved·removed·off·reopen ·
//                    {sent, missed?, off?, held?} 또는 null(부르지 못함)
export function makeDuty(db: Db, audit: Audit, deps: {
  peopleLookup: (ctx: any, b: any) => Promise<any>;
  personPick: (name: unknown, pick: unknown, check: any) => Promise<{ ok: false; error: string } | { ok: true; ident: any; appUserId: string | null }>;
  allRows: (build: () => any) => Promise<any[]>;
  dutyNotify?: (kind: string, ids: number[]) => Promise<{ sent: number; missed?: number; off?: boolean; held?: number } | null>;
}) {
  // 알림 부탁 — 저장·기록 뒤에만 부른다. 알릴 번호가 없거나 dep 가 없으면 r 그대로.
  //   문(dutyOpen·시험 참여자)·같은 알림 한 번·앱 계정·오늘 이후 자리 확인은 api 가 한다 — 여기서는 지원 번호만 보낸다(이름·user_id 없음).
  async function withNotify(r: any, kind: string, ids: unknown) {
    const list = [...new Set((Array.isArray(ids) ? ids : []).map((x) => Number(x)).filter((n) => Number.isSafeInteger(n) && n > 0))];
    if (!list.length || !deps.dutyNotify) return r;
    try {
      const n = await deps.dutyNotify(kind, list);
      if (!n) return { ...r, notified: 0, notifyError: "notify-failed" };
      // 알림을 꺼 두었다 — 아무에게도 가지 않았다(화면이 「꺼 두었어요 — 따로 알려 주세요」 창을 띄운다). 다만 꺼 두지 않았어도 보낼 분이 없던 저장
      //   (held 0 — 지난 날 바로잡기 · 준비 중 당번 · 앱 계정 없는 줄 · 문이 닫힌 동안의 시험 참여자 아닌 분)이면 평소처럼 조용히 끝낸다: 「따로 알려 주세요」는
      //   알릴 분이 있을 때만 참이다(고침 검토 반영 2026-10-07). held 를 모르면(옛 api · 읽다 실패) 알리는 쪽으로 둔다.
      if (n.off === true) return n.held === 0 ? { ...r, notified: 0, notifyError: null } : { ...r, notified: 0, notifyError: "notify-off" };
      const missed = Number(n.missed) || 0;   // 가지 않은 분(받는 기기 없음·모두 실패) — 화면이 「N분께 보냈어요」와 따로 말한다
      return { ...r, notified: Number(n.sent) || 0, ...(missed ? { missed } : {}), notifyError: null };
    } catch (_) {
      return { ...r, notified: 0, notifyError: "notify-failed" };
    }
  }

  const memberId = (ctx: any): string => {
    const id = String(ctx?.member?.id ?? "");
    return UUID.test(id) ? id : "";
  };
  const posInt = (v: unknown): number => (typeof v === "number" && Number.isSafeInteger(v) && v >= 1 ? v : 0);
  // 화면이 본 「살아 있는 지원 수」(expect) — 0 ~ 100,000 의 정수(SQL 인자가 int 다 — 큰 값이 변환 오류가 되지 않게)
  const okExpect = (v: unknown): boolean => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 100000;

  // ---------- 맡은 당번 ----------
  // 이 분이 이 당번을 만져도 되나 — 총괄(super·duty)은 늘 · 그 밖은 (당번, 나) 줄이 있을 때만.
  async function mayTouch(ctx: any, boardId: string): Promise<boolean> {
    if (dutyChief(ctx?.roles)) return true;
    const mid = memberId(ctx);
    if (!mid || !UUID.test(boardId)) return false;
    const { data, error } = await db.from("duty_board_staff").select("board_id").eq("board_id", boardId).eq("member_id", mid).limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  }
  // 몸통의 board_id 로 오는 액션 — 꼴 확인 + 맡은 당번 확인. 통과면 당번 id, 아니면 거절.
  async function boardIn(ctx: any, b: any): Promise<{ ok: true; board: string } | Fail> {
    const board = norm(b?.board_id).toLowerCase();
    if (!UUID.test(board)) return BAD_ID;
    return (await mayTouch(ctx, board)) ? { ok: true, board } : NOT_ASSIGNED;
  }
  // 줄 번호로 오는 액션 — 그 줄의 당번을 **서버가 읽어** 맡은 당번인지 본다(없는 줄이면 not-found).
  async function slotBoard(ctx: any, slotId: number): Promise<{ ok: true; board: string } | Fail> {
    const { data, error } = await db.from("duty_slots").select("board_id").eq("id", slotId).maybeSingle();
    if (error) throw error;
    if (!data?.board_id) return NOT_FOUND;
    const board = String(data.board_id);
    return (await mayTouch(ctx, board)) ? { ok: true, board } : NOT_ASSIGNED;
  }
  async function signupBoard(ctx: any, signupId: number): Promise<{ ok: true; board: string } | Fail> {
    const { data, error } = await db.from("duty_signups").select("slot_id").eq("id", signupId).maybeSingle();
    if (error) throw error;
    if (!data?.slot_id) return NOT_FOUND;
    return slotBoard(ctx, Number(data.slot_id));
  }
  async function lineBoard(ctx: any, lineId: number): Promise<{ ok: true; board: string } | Fail> {
    const { data, error } = await db.from("duty_lines").select("board_id").eq("id", lineId).maybeSingle();
    if (error) throw error;
    if (!data?.board_id) return NOT_FOUND;
    const board = String(data.board_id);
    return (await mayTouch(ctx, board)) ? { ok: true, board } : NOT_ASSIGNED;
  }

  // 같은 때인가 — 화면이 되돌려 보낸 updated_at 과 지금 줄의 것(둘 다 DB 가 적은 글자 · 꼴이 달라도 같은 순간이면 같다)
  const sameInstant = (a: unknown, z: unknown): boolean => {
    const x = Date.parse(String(a ?? "")), y = Date.parse(String(z ?? ""));
    return Number.isFinite(x) && Number.isFinite(y) ? x === y : String(a ?? "") === String(z ?? "");
  };

  // ---------- 읽기 도우미 ----------
  // 봉사 당번이 성도님 앱에 열렸는가 — app_config dutyOpen 이 true 하나일 때만(성경암송 api 의 문과 같은 값). 읽지 못하면 닫힘으로.
  //   화면이 이 값으로 「아직 성도님 앱에는 열지 않았어요 — 시험 참여자만 볼 수 있어요 · 알림도 그분들께만」을 사실대로 말한다.
  async function appOpen(): Promise<boolean> {
    try {
      const { data, error } = await db.from("app_config").select("value").eq("key", "dutyOpen").maybeSingle();
      return !error && data?.value === true;
    } catch (_) { return false; }
  }
  // 당번마다 요약 수 — SQL 함수 한 번(jsonb 하나 · 줄 한도에 안 걸린다)
  async function countsOf(ids: string[]): Promise<Record<string, any>> {
    if (!ids.length) return {};
    const { data, error } = await db.rpc("duty_board_counts", { p_ids: ids });
    if (error) throw error;
    return (data && typeof data === "object" ? data : {}) as Record<string, any>;
  }
  // 당번 id 들의 담당자 — 한 질의(쪽 넘기기)로 읽어 당번별로 묶는다. 당번이 50개까지면 그 당번만 거르고, 더 많으면 담당 줄 전부(표가 작다).
  //   역할(dutylead·duty)을 잃었거나 사용 중이 아닌 분은 stale:true — 줄은 남긴다(교육과 같다).
  async function staffOf(ids: string[]) {
    const empty = new Map<string, { id: string; name: string; stale?: true }[]>();
    if (!ids.length) return empty;
    const rows = await deps.allRows(() => {
      let q = db.from("duty_board_staff").select(STAFF_SEL);
      if (ids.length <= 50) q = q.in("board_id", ids);
      return q.order("board_id").order("member_id");
    });
    if (!rows.length) return empty;
    const grants = await deps.allRows(() => db.from("admin_role_grants").select("member_id,role_id")
      .in("role_id", DUTY_STAFF_ROLES).order("member_id").order("role_id"));
    return staffByBoard(rows, new Set(grants.map((g: any) => String(g.member_id))));
  }
  // 당번 id 들의 살아 있는 자리 틀(당번 카드의 「자리 틀 요약」) — 당번별로 묶는다
  async function linesOf(ids: string[]) {
    const by = new Map<string, any[]>();
    if (!ids.length) return by;
    const rows = await deps.allRows(() => {
      let q = db.from("duty_lines").select(LINE_COLS).eq("active", true);
      if (ids.length <= 50) q = q.in("board_id", ids);
      return q.order("board_id").order("id");
    });
    const want = new Set(ids);
    for (const r of rows) {
      const k = String(r.board_id);
      if (!want.has(k)) continue;                         // 당번이 50개를 넘어 틀 전부를 읽었을 때 다른 당번 틀은 버린다
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    return by;
  }

  // ---------- 당번 ----------
  // 당번 목록 — 총괄은 모든 당번, 담당은 맡은 당번만. scope 로 어느 쪽인지 알린다 · chief = 총괄만 되는 단추를 보일지.
  async function dutyBoardList(ctx: any) {
    const chief = dutyChief(ctx?.roles);
    const base = { ok: true as const, scope: chief ? "all" : "assigned", chief, today: kstDate(), appOpen: await appOpen() };
    let rows: any[];
    if (chief) {
      const { data, error } = await db.from("duty_boards").select(BOARD_COLS).order("created_at", { ascending: true }).limit(500);
      if (error) throw error;
      rows = (data ?? []) as any[];
    } else {
      const mid = memberId(ctx);
      if (!mid) return { ...base, boards: [] };
      const { data: mine, error: e0 } = await db.from("duty_board_staff").select("board_id").eq("member_id", mid).limit(500);
      if (e0) throw e0;
      const ids = [...new Set(((mine ?? []) as any[]).map((r) => String(r.board_id)))];
      if (!ids.length) return { ...base, boards: [] };
      const { data, error } = await db.from("duty_boards").select(BOARD_COLS).in("id", ids).order("created_at", { ascending: true }).limit(500);
      if (error) throw error;
      const allowed = new Set(ids);
      rows = ((data ?? []) as any[]).filter((r) => allowed.has(String(r.id)));   // 거른 결과를 한 번 더(질의가 틀려도 남의 당번이 새지 않게)
    }
    const ids = rows.map((r) => String(r.id));
    const [counts, staff, lines] = await Promise.all([countsOf(ids), staffOf(ids), linesOf(ids)]);
    // 담당자 id 는 총괄에게만(담당자 고르기에 쓴다) — 담당에게는 이름만
    const staffFor = (id: string) => { const l = staff.get(id) || []; return chief ? l : (staffNames(l) as any[]); };
    return { ...base, boards: rows.map((r) => boardOut(r, counts[r.id], staffFor(r.id), lines.get(String(r.id)) || [])).sort(boardOrder) };
  }

  // 당번 만들기·고치기 — {board:{id?, title, description, place, contact_note, open_days, until_date, max_ahead, status}, force?}
  //   만들기는 총괄만(chief-only). 고치기는 맡은 당번 · 이름과 준비·보관은 총괄만(boardPatchFor → chief-only).
  //   보관한 당번은 상태를 먼저 바꿔야 고친다(archived) — 보관 = 쓰기 거절(SQL 함수들과 같다).
  //   앱에서 안 보이게 되는 저장(받는 중·지원 멈춤 → 준비·보관)은 앞날에 선 분이 있으면 force 를 받아야 쓴다(has-upcoming · active).
  //   끝 날짜를 당기는 저장은 그 뒤에 선 분이 있으면 force_after 를 받아야 쓴다(has-after · active — 상태 확인(force)과 **따로** 묻는다:
  //   한 번의 「바꾸기」가 두 물음에 함께 답하지 않게). 저장 뒤 after 로 그 수를 다시 알린다(자리·줄은 그대로 — 앱에는 안 보인다).
  //   base = 화면이 설정 창을 열 때 본 updated_at. 그사이 다른 분이 고쳤으면 changed(낡은 창이 보관·지원 멈춤·끝 날짜를 되돌리지 않게).
  async function dutyBoardSave(ctx: any, b: any) {
    const c = checkBoard(b?.board);
    if (!c.ok) return c;
    const chief = dutyChief(ctx?.roles);
    const raw = norm(b?.board?.id).toLowerCase();
    if (!raw) {
      if (!chief) return CHIEF_ONLY;
      const { data, error } = await db.from("duty_boards").insert(c.row).select("id").single();
      if (error) throw error;
      await audit(ctx, "duty.board.save", data.id, { status: c.row.status, created: true });
      return { ok: true, id: data.id, after: 0 };
    }
    if (!UUID.test(raw)) return BAD_ID;
    if (!(await mayTouch(ctx, raw))) return NOT_ASSIGNED;
    const { data: before, error: e0 } = await db.from("duty_boards").select("title,status,until_date,updated_at").eq("id", raw).maybeSingle();
    if (e0) throw e0;
    if (!before) return NOT_FOUND;
    const was = String(before.status);
    const base = norm(b?.base);
    if (base && !sameInstant(base, before.updated_at)) return { ok: false, error: "changed" };
    if (was === "archived" && c.row.status === "archived") return { ok: false, error: "archived" };
    const p = boardPatchFor(chief, before, c.row);
    if (!p.ok) return p;
    if (hidesFromApp(was, c.row.status) && b?.force !== true) {
      const n = Number((await countsOf([raw]))[raw]?.active) || 0;
      if (n > 0) return { ok: false, error: "has-upcoming", active: n };
    }
    // 읽은 상태(was)를 조건으로 건다 — 그사이 다른 분이 보관·준비로 바꿨으면 이 저장이 되돌리지 않게(changed · 화면이 새로 불러온다)
    // 끝 날짜를 당기는(또는 새로 두는) 저장 — 그 뒤 자리는 앱에서 사라진다. 그 뒤에 선 분이 있으면 먼저 묻는다(has-after · active → force).
    //   (상태를 바꾸지 않고도 「앱에서 안 보이게」가 되는 길이라 has-upcoming 과 같은 확인을 둔다 — 날짜를 잘못 고른 저장도 여기서 멈춘다)
    const newUntil = (c.row.until_date as string | null) || null, oldUntil = (before.until_date as string | null) || null;
    if (newUntil && (!oldUntil || newUntil < oldUntil) && b?.force_after !== true) {
      const { data: n, error: ea } = await db.rpc("duty_after_count", { p_board: raw, p_date: newUntil });
      if (ea) throw ea;
      if (Number(n) > 0) return { ok: false, error: "has-after", active: Number(n) };
    }
    const { data, error } = await db.from("duty_boards").update({ ...p.patch, updated_at: new Date().toISOString() })
      .eq("id", raw).eq("status", was).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: "changed" };
    await audit(ctx, "duty.board.save", raw, was === c.row.status ? { status: c.row.status } : { status: c.row.status, was });
    // 끝 날짜 뒤에 선 분 수 — 저장·기록은 이미 끝났다. 이 읽기가 실패해도 저장은 성공으로 답한다(화면이 담당자 지정을 이어 가게)
    let after = 0;
    try { after = Number((await countsOf([raw]))[raw]?.after) || 0; } catch (e) { console.error("dutyBoardSave after", e); }
    return { ok: true, id: raw, after };
  }

  // 담당자 후보 — 당번 담당(dutylead)·당번 총괄(duty) 역할이 있는 **사용 중**인 분. id·이름·소속·당번 역할만.
  async function dutyStaffCandidates(ctx: any) {
    if (!dutyChief(ctx?.roles)) return CHIEF_ONLY;
    const { data: gs, error } = await db.from("admin_role_grants").select("member_id,role_id").in("role_id", DUTY_STAFF_ROLES);
    if (error) throw error;
    const rolesBy = new Map<string, string[]>();
    for (const g of (gs ?? []) as any[]) rolesBy.set(g.member_id, [...(rolesBy.get(g.member_id) ?? []), String(g.role_id)]);
    if (!rolesBy.size) return { ok: true, members: [] };
    const { data: ms, error: e2 } = await db.from("admin_members").select("id,name,type,gu,mok,bu,grade")
      .in("id", [...rolesBy.keys()]).eq("status", "active");
    if (e2) throw e2;
    const members = ((ms ?? []) as any[]).map((m) => staffCandidateOut(m, rolesBy.get(m.id) ?? [], DUTY_STAFF_ROLES))
      .sort((a, z) => a.name.localeCompare(z.name, "ko") || a.who.localeCompare(z.who, "ko") || (a.id < z.id ? -1 : 1));
    return { ok: true, members };
  }

  // 당번의 담당자를 통째로 바꾼다 — 빈 배열이면 담당자 없음. **새로 더하는 분만** 사용 중 · 당번 역할이어야 한다(bad-member).
  //   이미 맡은 분이 역할을 잃었거나 정지돼도(stale) 보낸 목록에 있으면 남는다 — 저장으로 조용히 빼지 않는다(교육 eduStaffSet 과 같다).
  //   바뀐 것만 빼고 더한다(없으면 쓰지도 기록하지도 않는다 · changed:false). 기록 duty.staff.set {count}(이름 없음).
  async function dutyStaffSet(ctx: any, b: any) {
    if (!dutyChief(ctx?.roles)) return CHIEF_ONLY;
    const board = norm(b?.board_id).toLowerCase();
    if (!UUID.test(board)) return BAD_ID;
    const s = checkStaffIds(b?.member_ids);
    if (!s.ok) return s;
    const { data: c, error } = await db.from("duty_boards").select("id").eq("id", board).maybeSingle();
    if (error) throw error;
    if (!c) return NOT_FOUND;
    const { data: cur, error: e1 } = await db.from("duty_board_staff").select("member_id").eq("board_id", board);
    if (e1) throw e1;
    const before = new Set(((cur ?? []) as any[]).map((r) => String(r.member_id)));
    const add = s.ids.filter((id) => !before.has(id));
    const del = [...before].filter((id) => !s.ids.includes(id));
    if (add.length) {
      const cands: any = await dutyStaffCandidates(ctx);
      const can = new Set((cands.members || []).map((m: any) => m.id));
      if (add.some((id) => !can.has(id))) return { ok: false, error: "bad-member" };
    }
    if (!add.length && !del.length) return { ok: true, count: s.ids.length, changed: false };
    // 더하기 먼저 · 빼기 나중 — 더하기가 실패하면 아무것도 안 바뀌고, 빼기가 실패하면 넓은 쪽으로 남는다(맡은 분이 조용히 빠지지 않게)
    if (add.length) {
      // 두 창에서 같은 분을 동시에 더해도 기본 키(board_id, member_id) 충돌로 500 이 나지 않게
      const { error: ea } = await db.from("duty_board_staff")
        .upsert(add.map((member_id) => ({ board_id: board, member_id })), { onConflict: "board_id,member_id", ignoreDuplicates: true });
      if (ea) throw ea;
    }
    if (del.length) {
      const { error: ed } = await db.from("duty_board_staff").delete().eq("board_id", board).in("member_id", del);
      if (ed) throw ed;
    }
    await audit(ctx, "duty.staff.set", board, { count: s.ids.length });
    return { ok: true, count: s.ids.length, changed: true };
  }

  // ---------- 자리 틀 · 날짜 ----------
  // 틀 넣기·고치기 — {board_id, line:{id?, service, task, start, end, capacity, weekday, sort}, apply_future?}
  //   고치는 틀이 이 당번의 것인지는 SQL 이 본다(where id = … and board_id = … → not-found). 답 {id, kept, updated, made}.
  async function dutyLineSave(ctx: any, b: any) {
    const at = await boardIn(ctx, b);
    if (!at.ok) return at;
    const c = checkLine(b?.line);
    if (!c.ok) return c;
    const { data: r, error } = await db.rpc("duty_line_save", { p_board: at.board, p_line: c.line, p_apply_future: b?.apply_future === true });
    if (error) throw error;
    if (!r?.ok) return r?.error ? { ok: false, error: String(r.error) } : { ok: false, error: "server" };
    await audit(ctx, "duty.line.save", at.board, { line: r.id, created: !c.line.id, kept: r.kept, updated: r.updated, made: r.made });
    return { ok: true, id: r.id, kept: Number(r.kept) || 0, updated: Number(r.updated) || 0, made: Number(r.made) || 0 };
  }

  // 틀 빼기 — {id}. 자리가 하나도 없으면 지우고(deleted), 있으면 남기고 앞날의 빈 자리만 지운다(kept = 지원 줄이 있어 남긴 앞날 자리 수).
  async function dutyLineRemove(ctx: any, b: any) {
    const id = posInt(b?.id);
    if (!id) return BAD_ID;
    const at = await lineBoard(ctx, id);
    if (!at.ok) return at;
    const { data: r, error } = await db.rpc("duty_line_remove", { p_line: id });
    if (error) throw error;
    if (!r?.ok) return r?.error ? { ok: false, error: String(r.error) } : { ok: false, error: "server" };
    await audit(ctx, "duty.line.remove", at.board, { line: id, deleted: r.deleted === true, kept: Number(r.kept) || 0 });
    return { ok: true, deleted: r.deleted === true, kept: Number(r.kept) || 0 };
  }

  // 날짜 더하기 — {board_id, date, line_ids}. 요일과 무관하게 그 날짜에 고른 틀의 자리를 만든다(특별 예배 · 한 번짜리 모집).
  async function dutyDateAdd(ctx: any, b: any) {
    const at = await boardIn(ctx, b);
    if (!at.ok) return at;
    const date = norm(b?.date);
    if (!isDate(date)) return { ok: false, error: "bad-date" };
    const l = checkLineIds(b?.line_ids);
    if (!l.ok) return l;
    const { data: r, error } = await db.rpc("duty_date_add", { p_board: at.board, p_date: date, p_line_ids: l.ids });
    if (error) throw error;
    if (!r?.ok) return r?.error ? { ok: false, error: String(r.error) } : { ok: false, error: "server" };
    // reopened = 이미 있던 **남은 자리**(요일을 바꾼 틀의 옛 요일 자리)를 날짜로 더한 자리로 바꿔 다시 살린 수 — 앱 지원을 다시 받는다
    const n = { made: Number(r.made) || 0, existed: Number(r.existed) || 0, reopened: Number(r.reopened) || 0 };
    await audit(ctx, "duty.date.add", at.board, { date, ...n });
    return { ok: true, ...n };
  }

  // ---------- 주별 명단 ----------
  const rangeOf = (b: any): { ok: true; from: string | null; to: string | null } | Fail => {
    const from = norm(b?.from), to = norm(b?.to);
    if ((from && !isDate(from)) || (to && !isDate(to))) return { ok: false, error: "bad-date" };
    return { ok: true, from: from || null, to: to || null };
  };
  async function rosterRead(board: string, from: string | null, to: string | null) {
    const { data: r, error } = await db.rpc("duty_roster", { p_board: board, p_from: from, p_to: to });
    if (error) throw error;
    return r as any;
  }
  // {board_id, from?, to?} — 기본은 오늘 ~ 오늘 + 보이는 기간(SQL). 응답은 rosterOut 이 고른 칸 + 담당자 + chief.
  async function dutyRoster(ctx: any, b: any) {
    const at = await boardIn(ctx, b);
    if (!at.ok) return at;
    const g = rangeOf(b);
    if (!g.ok) return g;
    const r = await rosterRead(at.board, g.from, g.to);
    if (!r?.ok) return { ok: false, error: String(r?.error || "server") };
    const staff = (await staffOf([at.board])).get(at.board) || [];
    const chief = dutyChief(ctx?.roles);
    return { ok: true, chief, appOpen: await appOpen(), ...rosterOut(r), staff: chief ? staff : staffNames(staff) };
  }

  // ---------- 👥 봉사자(사람별 봉사 이력 · 2026-10-07 친구 요청 「담당자 쪽에는 이분의 봉사 이력을 사람별로 모아 보는 화면」) ----------
  //   셈과 사람 잇기는 SQL duty_people 한 곳(성경암송 supabase/duty.sql) — 여기는 「어느 당번들 안에서」만 정한다.
  // 이 분이 볼 수 있는 당번 — 총괄 = 모든 당번 · 담당 = 맡은 당번(dutyBoardList 와 같은 범위). board_id 를 주면 그 하나로 좁힌다
  //   (꼴이 틀리면 bad-id · 볼 수 없는 당번이면 담당은 not-assigned · 총괄은 not-found). ⚠️ SQL 은 이 당번들 **안의 줄만으로** 사람을 잇는다.
  //   scope·narrowed·boards 는 응답에 그대로 싣는다 — 화면이 「어느 범위의 수인지」를 서버가 본 대로 말하게(담당의 「지금까지 N번」은 맡은 당번 안의 수다).
  type Scope = { ok: true; boards: string[]; scope: "all" | "assigned"; narrowed: boolean };
  async function peopleBoards(ctx: any, b: any): Promise<Scope | Fail> {
    const want = norm(b?.board_id).toLowerCase();
    if (want && !UUID.test(want)) return BAD_ID;
    const chief = dutyChief(ctx?.roles);
    const scope = chief ? "all" as const : "assigned" as const;
    let ids: string[];
    if (chief) {
      const { data, error } = await db.from("duty_boards").select("id").limit(1000);
      if (error) throw error;
      ids = ((data ?? []) as any[]).map((r) => String(r.id));
    } else {
      const mid = memberId(ctx);
      if (!mid) return want ? NOT_ASSIGNED : { ok: true, boards: [], scope, narrowed: false };
      const { data, error } = await db.from("duty_board_staff").select("board_id").eq("member_id", mid).limit(500);
      if (error) throw error;
      ids = [...new Set(((data ?? []) as any[]).map((r) => String(r.board_id)))];
    }
    ids = ids.filter((x) => UUID.test(x));
    if (!want) return { ok: true, boards: ids, scope, narrowed: false };
    if (!ids.includes(want)) return chief ? NOT_FOUND : NOT_ASSIGNED;
    return { ok: true, boards: [want], scope, narrowed: true };
  }
  const scopeOut = (g: Scope) => ({ scope: g.scope, narrowed: g.narrowed, boards: g.boards.length });
  async function peopleRead(boards: string[], year: number | null, signup: number | null) {
    const { data: r, error } = await db.rpc("duty_people", { p_boards: boards, p_year: year, p_signup: signup });
    if (error) throw error;
    return r as any;
  }
  // 사람 목록 — {board_id?, year?} → {ok, today, year, people, scope, narrowed, boards} · 읽기만(기록 없음 — 명단 읽기와 같다)
  async function dutyPeople(ctx: any, b: any) {
    const g = await peopleBoards(ctx, b);
    if (!g.ok) return g;
    if (!g.boards.length) return { ok: true, today: kstDate(), year: yearOf(b?.year), people: [], ...scopeOut(g) };
    const r = await peopleRead(g.boards, yearOf(b?.year), null);
    if (!r?.ok) return { ok: false, error: String(r?.error || "server") };
    return { ok: true, ...peopleOut(r), ...scopeOut(g) };
  }
  // 한 분의 이력 — {signup_id, board_id?, year?}. 그 줄의 당번을 **서버가 읽어** 볼 수 있는 당번인지 본다(signupBoard — 몸통의 board_id 를 믿지 않는다).
  //   그다음 볼 수 있는 당번(좁혔으면 그 하나) 안의 줄만으로 그분을 잇는다. 좁힌 당번 밖의 줄이면 not-found.
  //   (없는 번호는 not-found · 맡지 않은 당번의 번호는 not-assigned — 번호가 있는지만 드러난다. 빼기·옮기기 등 signupBoard 를 쓰는 액션 모두 같은 꼴이다 · 이름·당번·날짜는 답에 없다)
  async function dutyPersonHistory(ctx: any, b: any) {
    const id = posInt(b?.signup_id);
    if (!id) return BAD_ID;
    const at = await signupBoard(ctx, id);
    if (!at.ok) return at;
    const g = await peopleBoards(ctx, b);
    if (!g.ok) return g;
    if (!g.boards.includes(at.board)) return NOT_FOUND;
    const r = await peopleRead(g.boards, yearOf(b?.year), id);
    if (!r?.ok) return { ok: false, error: r?.error === "not-found" ? "not-found" : String(r?.error || "server") };
    return { ok: true, ...historyOut(r), ...scopeOut(g) };
  }
  // 엑셀 — 목록과 같은 범위 · 시트 「봉사자」(peopleSheet — 이름·소속·수·날짜만 · 선 날도 앞날도 없는 분은 빼고) + 「안내」(범위·기준일·낱말의 뜻).
  //   기록 duty.people.export {year, count, boards}(이름 없이 · target = 좁힌 당번 id · 볼 수 있는 당번 모두면 빈 글 — 기록 화면이 「볼 수 있는 당번 N개」로 읽는다)
  async function dutyPeopleExport(ctx: any, b: any) {
    const g = await peopleBoards(ctx, b);
    if (!g.ok) return g;
    const r = g.boards.length ? await peopleRead(g.boards, yearOf(b?.year), null) : { ok: true, today: kstDate(), year: yearOf(b?.year), people: [] };
    if (!r?.ok) return { ok: false, error: String(r?.error || "server") };
    const out = peopleOut(r);
    const thisYear = Number(String(out.today || kstDate()).slice(0, 4)) || new Date().getUTCFullYear();
    const year = out.year ?? thisYear, sheet = peopleSheet(out, thisYear), count = sheet.length - 1;
    let scopeText = g.scope === "all" ? `모든 당번 ${g.boards.length}개` : `맡은 당번 ${g.boards.length}개`;
    if (g.narrowed) {
      const { data: bd, error } = await db.from("duty_boards").select("title").eq("id", g.boards[0]).maybeSingle();
      if (error) throw error;
      scopeText = `「${String(bd?.title ?? "")}」 당번`;
    }
    const info = peopleInfoSheet({ scopeText, today: out.today || kstDate(), year, hidden: out.people.length - count });
    await audit(ctx, "duty.people.export", g.narrowed ? g.boards[0] : "", { year, count, boards: g.boards.length });
    return { ok: true, today: out.today, year, sheet, info, count, hidden: out.people.length - count, ...scopeOut(g) };
  }

  // 엑셀 — {board_id, from?, to?} · 시트 「당번표」(이름만)·「명단」(소속·넣은 곳 — 메모 없음). 기록 duty.export {from, to, count}.
  async function dutyExport(ctx: any, b: any) {
    const at = await boardIn(ctx, b);
    if (!at.ok) return at;
    const g = rangeOf(b);
    if (!g.ok) return g;
    const r = await rosterRead(at.board, g.from, g.to);
    if (!r?.ok) return { ok: false, error: String(r?.error || "server") };
    const out = rosterOut(r);
    const sheets = exportSheets(out);
    await audit(ctx, "duty.export", at.board, { from: out.from, to: out.to, count: sheets.list.length - 1 });
    return { ok: true, title: out.board.title, from: out.from, to: out.to, table: sheets.table, list: sheets.list };
  }

  // 날짜 확정 · 확정 풀기 · 한 줄 메모 — {board_id, date, op:'confirm'|'unconfirm'|'note', note?}
  //   이미 그 상태면(already) 쓰지도 기록하지도 알리지도 않는다. 확정하면 그날 살아 있는 분께 알린다(3단계).
  async function dutyDaySet(ctx: any, b: any) {
    const at = await boardIn(ctx, b);
    if (!at.ok) return at;
    const date = norm(b?.date);
    if (!isDate(date)) return { ok: false, error: "bad-date" };
    const op = norm(b?.op);
    if (!["confirm", "unconfirm", "note"].includes(op)) return { ok: false, error: "bad-op" };
    let note: string | null = null;
    if (op === "note") {
      const n = checkNote(b?.note, 60, true);
      if (!n.ok) return n;
      note = n.note;
    }
    const { data: r, error } = await db.rpc("duty_day_set", { p_board: at.board, p_date: date, p_op: op, p_by: memberId(ctx) || null, p_note: note });
    if (error) throw error;
    if (!r?.ok) return r?.error ? { ok: false, error: String(r.error) } : { ok: false, error: "server" };
    if (r.already) return { ok: true, already: true };
    await audit(ctx, "duty.day.set", at.board, op === "confirm" ? { date, op, active: Number(r.active) || 0 } : { date, op });
    if (op === "confirm") return await withNotify({ ok: true, active: Number(r.active) || 0 }, "confirmed", r.ids);
    return { ok: true };
  }

  // 쉬는 날(하루·기간)로 / 다시 열기 — {board_id, from, to, off, note?, expect?}
  //   expect 가 없으면 **세기만** 한다({dry:true, active, days} · 아무것도 안 씀 · 기록 없음) — 화면이 그 수를 확인 창에 보여 주고 expect 로 다시 보낸다.
  //   그 사이 수가 바뀌었으면 changed(active). 지원 줄은 건드리지 않는다(다시 열면 그대로 살아난다).
  async function dutyDaysOff(ctx: any, b: any) {
    const at = await boardIn(ctx, b);
    if (!at.ok) return at;
    const from = norm(b?.from), to = norm(b?.to);
    if (!isDate(from) || !isDate(to)) return { ok: false, error: "bad-date" };
    if (typeof b?.off !== "boolean") return { ok: false, error: "bad-op" };
    let note: string | null = null;
    if (b?.note !== undefined && b?.note !== null) {
      const n = checkNote(b.note, 60, true);
      if (!n.ok) return n;
      note = n.note;
    }
    const dry = b?.expect === undefined || b?.expect === null;
    if (!dry && !okExpect(b.expect)) return { ok: false, error: "bad-expect" };
    const { data: r, error } = await db.rpc("duty_days_off", { p_board: at.board, p_from: from, p_to: to, p_off: b.off, p_note: note,
      p_expect: dry ? null : b.expect });
    if (error) throw error;
    if (!r?.ok) return r?.error === "changed" ? { ok: false, error: "changed", active: Number(r.active) || 0 }
      : { ok: false, error: String(r?.error || "server") };
    if (r.dry) return { ok: true, dry: true, active: Number(r.active) || 0, days: Number(r.days) || 0 };
    await audit(ctx, "duty.days.off", at.board, { from, to, off: b.off, days: Number(r.days) || 0, active: Number(r.active) || 0 });
    return await withNotify({ ok: true, days: Number(r.days) || 0, active: Number(r.active) || 0 }, b.off ? "off" : "reopen", r.ids);
  }

  // ---------- 자리 하나 ----------
  // 정원 · 이 자리만 쉼 — {slot_id, capacity?, off?, expect?}(바꿀 칸만 · 둘 다 없으면 nothing).
  //   쉼을 켤 때 그 자리에 선 분이 있으면 expect(화면이 본 수)가 맞아야 쓴다(changed · active).
  async function dutySlotSet(ctx: any, b: any) {
    const slot = posInt(b?.slot_id);
    if (!slot) return BAD_ID;
    const hasCap = b?.capacity !== undefined && b?.capacity !== null, hasOff = b?.off !== undefined && b?.off !== null;
    if (!hasCap && !hasOff) return { ok: false, error: "nothing" };
    if (hasCap && !(typeof b.capacity === "number" && Number.isInteger(b.capacity) && b.capacity >= 1 && b.capacity <= 200)) return { ok: false, error: "bad-capacity" };
    if (hasOff && typeof b.off !== "boolean") return { ok: false, error: "bad-op" };
    const hasExpect = b?.expect !== undefined && b?.expect !== null;
    if (hasExpect && !okExpect(b.expect)) return { ok: false, error: "bad-expect" };
    const at = await slotBoard(ctx, slot);
    if (!at.ok) return at;
    const { data: r, error } = await db.rpc("duty_slot_set", { p_slot: slot, p_capacity: hasCap ? b.capacity : null, p_off: hasOff ? b.off : null,
      p_expect: hasExpect ? b.expect : null });
    if (error) throw error;
    if (!r?.ok) return r?.error === "changed" || r?.error === "below-count" ? { ok: false, error: r.error, active: Number(r.active) || 0 }
      : { ok: false, error: String(r?.error || "server") };
    await audit(ctx, "duty.slot.set", at.board, { slot, ...(hasCap ? { capacity: r.capacity } : {}), ...(hasOff ? { off: r.off === true } : {}), active: Number(r.active) || 0 });
    return await withNotify({ ok: true, capacity: Number(r.capacity) || 0, off: r.off === true, active: Number(r.active) || 0 }, r.off === true ? "off" : "reopen", r.ids);
  }

  // 자리 지우기 — {slot_id}. 잘못 더한 날짜의 자리만(지원 줄이 하나라도 있으면 has-signups · 요일이 맞는 앞날 자리는 use-off — 쉼을 쓴다).
  async function dutySlotDelete(ctx: any, b: any) {
    const slot = posInt(b?.slot_id);
    if (!slot) return BAD_ID;
    const at = await slotBoard(ctx, slot);
    if (!at.ok) return at;
    const { data: r, error } = await db.rpc("duty_slot_delete", { p_slot: slot });
    if (error) throw error;
    if (!r?.ok) return { ok: false, error: String(r?.error || "server") };
    await audit(ctx, "duty.slot.delete", at.board, { slot });
    return { ok: true };
  }

  // ---------- 지원 줄 ----------
  // 겹침·정원 거절을 화면에 실을 만큼만 — 겹침은 같은 당번일 때만 자리 이름(맡지 않은 당번의 이름·자리를 싣지 않는다).
  //   정원 거절(full)에 겹친 자리(with)가 함께 오면 그것도 싣는다 — 화면이 확인 한 번에 둘 다 알리고 force 로 넘긴다.
  const applyFail = (r: any): Fail & Record<string, unknown> => {
    if (r?.error === "overlap") return { ok: false, error: "overlap", with: overlapForStaff(r.with) };
    if (r?.error === "full") return { ok: false, error: "full", active: Number(r.active) || 0, capacity: Number(r.capacity) || 0,
      ...(r.with ? { with: overlapForStaff(r.with) } : {}) };
    return { ok: false, error: String(r?.error || "server") };
  };

  // 대신 넣기 — 두 갈래: (1) 교인명부에서 고른 분 {slot_id, name, pick, check} (2) 직접 적은 분 {slot_id, ident}(새가족)
  //   정원·겹침은 알려 준 뒤 force:true 로 넘긴다(full · overlap). 담당자가 뺐던 분도 담당자는 다시 넣는다(revived).
  //   담당자가 넣은 줄은 본인이 앱에서 스스로 빼지 못한다(SQL staff-row) — 그래서 잠긴 날에 넣으면 그분 기기로 알린다(3단계).
  //   **되살린 줄(revived — 담당자가 뺐거나 본인이 취소했던 줄)은 잠기지 않은 날에도 알린다** — 그분이 마지막으로 들은 말이 「빼 드렸어요 — 안 나오셔도 돼요」일 수
  //   있다(「빠진 분 → 다시 넣기」는 늘 알린다 — 같은 일을 하는 두 길이 다르게 굴었다 · 검토 반영 2026-10-07).
  async function dutySignAdd(ctx: any, b: any) {
    const slot = posInt(b?.slot_id);
    if (!slot) return BAD_ID;
    const at = await slotBoard(ctx, slot);       // 명부 찾기(personPick)도 하기 전에
    if (!at.ok) return at;
    let ident: any, user: string | null = null;
    const picked = b?.ident === undefined || b?.ident === null;
    // 명부에서 고르는 길이 거절로 끝나도 한 줄 남긴다(검토 반영 2026-10-06) — 「이 이름·소속·직분이 명부에 있나」를 넣기 요청으로
    //   기록 없이 떠볼 수 없게. 성공한 넣기는 duty.sign.add 가 남는다. count = 그 조합이 명부와 맞았나(1) · 아니었나(0).
    const trace = (count: number) => audit(ctx, "people.lookup", "", { q: norm(b?.name).slice(0, 40), count, from: "duty", pick: true });
    if (picked) {
      // 보관한 당번은 명부를 찾기 전에 거절(dutyPeopleLookup 과 같다 — 어차피 넣지 못한다)
      const { data: bd, error: e0 } = await db.from("duty_boards").select("status").eq("id", at.board).maybeSingle();
      if (e0) throw e0;
      if (bd?.status === "archived") return { ok: false, error: "archived" };
      const p = await deps.personPick(b?.name, b?.pick, b?.check);
      if (!p.ok) { if (p.error === "changed") await trace(0); return p; }
      ident = p.ident; user = p.appUserId;
    } else {
      const t = checkTypedIdent(b.ident);
      if (!t.ok) return t;
      if (identHasCtrl(t.ident)) return { ok: false, error: "bad-ident" };
      ident = t.ident;
    }
    const force = b?.force === true;
    const { data: r, error } = await db.rpc("duty_apply", { p_slot: slot, p_user: user, p_ident: ident, p_staff: true, p_force: force, p_ack_locked: false });
    if (error) throw error;
    if (!r?.ok) { if (picked) await trace(1); return applyFail(r); }
    const out = { ok: true, id: r.id, locked: r.locked === true, ...(r.already ? { already: true } : {}), ...(r.revived ? { revived: true } : {}) };
    // 이미 서 있는 분 — 바뀐 것이 없다(기록·알림 없음). 다만 계정 없는 줄로 서 있던 분에게 이번에 앱 계정을 이었으면(linked — SQL 이 줄을 썼다)
    //   그것은 기록에 남기고, 잠긴 날이면 그분 기기로도 알린다(이제 그분 앱의 「내 당번」에 보이고 스스로 못 빼는 줄이다).
    const linked = r.already === true && r.linked === true;
    if (r.already && !linked) return out;
    await audit(ctx, "duty.sign.add", at.board, { slot, signup: r.id, app: !!user, revived: r.revived === true, force, locked: r.locked === true,
      ...(linked ? { linked: true } : {}) });
    // 알림을 정하는 것은 **그 줄의 앱 계정**(SQL hadUser)이다 — 이번 명부 찾기가 맞춘 계정(user)과 다를 수 있다(계정이 이어진 줄을 계정을 못 맞춘 채 되살려도
    //   줄의 계정은 그대로다 → 잠긴 날인데 알림이 안 갔다). 옛 SQL 은 그 칸이 없다 — 그때는 user 로 본다.
    const had = r.hadUser === undefined ? !!user : r.hadUser === true;
    return had && (r.locked === true || r.revived === true) ? await withNotify(out, "added", [r.id]) : out;
  }

  // 빼기 — {id}. 언제든(지난 날짜도 — 당일 안 온 분을 다음 날 바로잡는다). 뺀 분은 본인이 그 자리에 스스로 다시 지원하지 못한다.
  async function dutySignRemove(ctx: any, b: any) {
    const id = posInt(b?.id);
    if (!id) return BAD_ID;
    const at = await signupBoard(ctx, id);
    if (!at.ok) return at;
    const { data: r, error } = await db.rpc("duty_cancel", { p_signup: id, p_user: null, p_staff: true });
    if (error) throw error;
    if (!r?.ok) return { ok: false, error: String(r?.error || "server") };
    await audit(ctx, "duty.sign.remove", at.board, { signup: id, date: r.date, locked: r.locked === true });
    const out = { ok: true, date: r.date, locked: r.locked === true };
    return r.hadUser === true ? await withNotify(out, "removed", [id]) : out;
  }

  // 되살리기 — {id, force?}. 빠진 줄(담당자가 뺌 · 본인 취소)을 **그 줄 그대로** 살린다(잘못 뺐을 때). 넣은 곳(앱/담당자)은 그대로 —
  //   앱으로 지원했던 분은 되살린 뒤에도 스스로 취소할 수 있다. 정원·겹침은 넣기와 같이 force 로 넘긴다. 이미 살아 있으면 already(기록·알림 없음).
  async function dutySignRestore(ctx: any, b: any) {
    const id = posInt(b?.id);
    if (!id) return BAD_ID;
    const at = await signupBoard(ctx, id);
    if (!at.ok) return at;
    const force = b?.force === true;
    const { data: r, error } = await db.rpc("duty_restore", { p_signup: id, p_force: force });
    if (error) throw error;
    if (!r?.ok) return applyFail(r);
    if (r.already) return { ok: true, already: true };
    await audit(ctx, "duty.sign.restore", at.board, { signup: id, date: r.date, force, locked: r.locked === true });
    const out = { ok: true, date: r.date, locked: r.locked === true };
    return r.hadUser === true ? await withNotify(out, "added", [id]) : out;
  }

  // 옮기기 — {id, to_slot, force?}. 같은 당번 안에서만(SQL wrong-board — 그래서 떠나는 줄의 당번만 확인하면 된다). 같은 줄의 자리만 바뀐다.
  async function dutySignMove(ctx: any, b: any) {
    const id = posInt(b?.id), to = posInt(b?.to_slot);
    if (!id || !to) return BAD_ID;
    const at = await signupBoard(ctx, id);
    if (!at.ok) return at;
    const force = b?.force === true;
    const { data: r, error } = await db.rpc("duty_move", { p_signup: id, p_to_slot: to, p_force: force });
    if (error) throw error;
    if (!r?.ok) return applyFail(r);
    if (r.already) return { ok: true, already: true };
    await audit(ctx, "duty.sign.move", at.board, { signup: id, from: r.from?.date, to: r.to?.date, slot: to, force });
    const out = { ok: true, from: placeOut(r.from), to: placeOut(r.to), locked: r.locked === true };
    return r.hadUser === true ? await withNotify(out, "moved", [id]) : out;
  }

  // 담당자 메모 — {id, note}(500자 · '' 로 지움). 담당자만 본다(앱 응답·엑셀에 싣지 않는다). 보관한 당번은 고치지 않는다.
  async function dutySignNote(ctx: any, b: any) {
    const id = posInt(b?.id);
    if (!id) return BAD_ID;
    const n = checkNote(b?.note, 500, false);
    if (!n.ok) return n;
    const at = await signupBoard(ctx, id);
    if (!at.ok) return at;
    // 표에 직접 쓰지 않는다 — duty_note_set 이 전역 잠금을 먼저 잡고 쓴다(파일 머리 ⚠️). 보관한 당번·없는 줄은 SQL 이 거절한다.
    const { data: r, error } = await db.rpc("duty_note_set", { p_signup: id, p_note: n.note });
    if (error) throw error;
    if (!r?.ok) return { ok: false, error: String(r?.error || "server") };
    await audit(ctx, "duty.sign.note", at.board, { signup: id, has: n.note !== "" });
    return { ok: true };
  }

  // 「못 가게 됐어요」 표시 거두기 — {id}(통화해 보니 오시기로 한 경우 · 줄은 그대로). 표시가 없던 줄이면 cleared:false(기록 없음).
  async function dutyAskClear(ctx: any, b: any) {
    const id = posInt(b?.id);
    if (!id) return BAD_ID;
    const at = await signupBoard(ctx, id);
    if (!at.ok) return at;
    const { data: r, error } = await db.rpc("duty_ask_clear", { p_signup: id });
    if (error) throw error;
    if (!r?.ok) return { ok: false, error: String(r?.error || "server") };
    if (r.cleared === true) await audit(ctx, "duty.sign.askclear", at.board, { signup: id });
    return { ok: true, cleared: r.cleared === true };
  }

  // 대신 넣기의 명부 찾기 — {board_id, name}. **맡은 당번의 창에서만**(당번 역할만으로 교인명부를 이름으로 떠볼 수 없게 — 총괄도 board_id 를 보낸다).
  //   보관한 당번은 archived(어차피 넣지 못한다). 찾기·기록(people.lookup from:"duty")은 deps.peopleLookup.
  async function dutyPeopleLookup(ctx: any, b: any) {
    const at = await boardIn(ctx, b);
    if (!at.ok) return at;
    const { data: bd, error } = await db.from("duty_boards").select("status").eq("id", at.board).maybeSingle();
    if (error) throw error;
    if (!bd) return NOT_FOUND;
    if (bd.status === "archived") return { ok: false, error: "archived" };
    return deps.peopleLookup(ctx, b);
  }

  return { dutyBoardList, dutyBoardSave, dutyStaffCandidates, dutyStaffSet, dutyLineSave, dutyLineRemove, dutyDateAdd, dutyRoster, dutyExport,
    dutyPeople, dutyPersonHistory, dutyPeopleExport,
    dutyDaySet, dutyDaysOff, dutySlotSet, dutySlotDelete, dutySignAdd, dutySignRemove, dutySignRestore, dutySignMove, dutySignNote, dutyAskClear,
    dutyPeopleLookup };
}
