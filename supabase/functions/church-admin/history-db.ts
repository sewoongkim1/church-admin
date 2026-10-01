// 사역 이력 — 표를 읽고 쓰는 쪽(서버 · 2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md §3·§5·§6·§7)
//   규칙은 history-match.ts(순수), 여기는 표 읽기·쓰기·응답 모양. index.ts 의 switch 가 makeHistory(...) 의 함수를 부른다.
// ⚠️ npm import 를 두지 않는다 — db(supabase 클라이언트)를 받아 쓴다(Node 시험·교인명부 세션이 이 파일을 import 한다).
// ⚠️ 응답은 칸 지도(rowOut·candOut)로만. person_id 는 full(교인명부·총괄 역할)일 때만 싣는다 — 사역신청 역할에게는 없다.
// ⚠️ 기록(audit) detail 에 이름·교인ID 를 싣지 않는다(줄 id·해·수만). people.lookup 만 이름을 싣는다(교인명부 기록 · 다른 화면과 같다) —
//   줄 창 후보는 q(찾은 이름) · 올리기 살펴보기는 askedNames(명부에 맞춰 본 이름 · from:"history-check" · 2026-10-01 최종 검토).
// 교인명부 세션(자세히 창 「이분 것」)이 쓰는 것: rematchHistoryRows(db, ids) · history-match.ts 의 historyLinkPatch·historyUnlinkPatch.
import { matchAll, srcKey, hKey, teamKey, historyLinkPatch, historyUnlinkPatch, toHPerson, candFp, nameKeyVariants,
  HISTORY_PEOPLE_COLS, WEAK_RE, nfc } from "./history-match.ts";
import type { HRow, HPerson } from "./history-match.ts";
import { personLabel } from "./events-person.ts";
import { positionFromChurch, churchMok } from "./events-people.ts";

export const HISTORY_MAX_UPLOAD = 3000;      // 한 번에 받는 줄(화면은 해마다 나눠 보낸다 · 통합 파일 4,093줄)
export const HISTORY_FIELD_MAX = 100;        // 부서·팀·이름·직분·목장·직책·신규/유지 칸
export const HISTORY_NOTE_MAX = 500;         // 원본 메모
export const HISTORY_LIST_PAGE = 100;
const PAGE = 1000;
const ROW_COLS = "id,year,committee,team,role_title,name,position,mok,renewal,src_note,person_id,link_how,match_basis,match_reason,source,source_file,linked_at,updated_at";
const MATCH_COLS = "id,year,committee,team,name,position,mok,renewal,link_how,person_id,match_basis,match_reason,updated_at";
const TEXT_KEYS = ["committee", "team", "role_title", "name", "position", "mok", "renewal"] as const;
export const HISTORY_EDIT_KEYS = ["year", ...TEXT_KEYS, "src_note"] as const;
// 고치면 다시 맞추기가 도는 칸 — 신규/유지(renewal)도 방아쇠다(§4.4 「다른 해 같은 팀」이 뒤쪽 해 줄의 신규/유지를 읽는다).
//   화면(history-logic.js REMATCH_KEYS)이 같은 목록으로 「고른 분 보내기」를 막는다 — 시험이 맞댄다.
export const HISTORY_REMATCH_KEYS = ["year", "name", "position", "mok", "team", "renewal"] as const;
// 새 줄의 자리 표시 사유 — 넣은 뒤 다시 맞추기가 덮는다. 맞추지 못하고 남은 줄(중간에 멈춤·명부 없음)이 화면에서 스스로 드러나게.
export const HISTORY_UNMATCHED_YET = "아직 맞추지 않음 — 🔄 다시 맞추기";

type Db = any;
export type HCtx = { member: { id: string } | null; roles: string[] };
type Audit = (ctx: any, action: string, target: string, detail?: Record<string, unknown>) => Promise<void>;

async function all(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0, guard = 0; guard < 200; guard++) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    const got = (data ?? []) as any[];
    if (!got.length) return out;
    out.push(...got);
    from += got.length;
  }
  throw new Error("too-many-pages");
}

const isFull = (ctx: HCtx): boolean => ctx.roles.includes("directory") || ctx.roles.includes("super");
const cut = (s: unknown, n: number): string => nfc(s).replace(/\s+/g, " ").slice(0, n);

// 줄 하나 다듬기·검사(올리기·한 줄 더하기·고치기가 함께 쓴다) — 오류는 코드 하나
export function tidyHistoryRow(x: any): { row: Record<string, any> | null; error: string } {
  const year = Number(x?.year);
  if (!Number.isInteger(year) || year < 1950 || year > 2100) return { row: null, error: "bad-year" };
  const row: Record<string, any> = { year };
  for (const k of TEXT_KEYS) row[k] = cut(x?.[k], HISTORY_FIELD_MAX + 1);
  row.src_note = cut(x?.src_note, HISTORY_NOTE_MAX + 1);
  if (!row.name) return { row: null, error: "no-name" };
  if (TEXT_KEYS.some((k) => row[k].length > HISTORY_FIELD_MAX)) return { row: null, error: "history-too-long" };
  if (row.src_note.length > HISTORY_NOTE_MAX) return { row: null, error: "note-too-long" };
  return { row, error: "" };
}

export function rowOut(r: any, full: boolean, inDirectory?: boolean) {
  const hasPerson = r.person_id !== null && r.person_id !== undefined;
  const o: Record<string, unknown> = {
    id: Number(r.id), year: r.year, committee: r.committee, team: r.team, role_title: r.role_title, name: r.name,
    position: r.position, mok: r.mok, renewal: r.renewal, src_note: r.src_note,
    linked: hasPerson, link_how: r.link_how,
    match_basis: r.match_basis, match_reason: r.match_reason, weak: !!r.match_basis && WEAK_RE.test(r.match_basis),
    source: r.source, updated_at: r.updated_at,
    in_directory: hasPerson ? (inDirectory === undefined ? null : inDirectory) : null,
  };
  if (full) o.person_id = r.person_id ?? null;
  return o;
}

// person_id 들이 지금 교인명부(church_people)에 있는가 — 100개씩(정수라 .in() 이스케이프 걱정 없음 · 설계 §3.3 「명부에 없음」)
async function directorySet(db: Db, ids: number[]): Promise<Set<number>> {
  const out = new Set<number>();
  const uniq = [...new Set(ids)];
  for (let i = 0; i < uniq.length; i += 100) {
    const part = uniq.slice(i, i + 100);
    const { data, error } = await db.from("church_people").select("person_id").in("person_id", part);
    if (error) throw error;
    for (const p of (data ?? []) as any[]) out.add(Number(p.person_id));
  }
  return out;
}
// 모든 person_id — exportRows 처럼 수천 줄을 한 번에 가릴 때(수천 번 .in() 대신 전체를 한 번 페이지로)
//   ⚠️ 정렬을 꼭 둔다 — 정렬 없이 쪽을 넘기면 그사이 고쳐진 행이 물리 순서상 옮겨져 교인ID 가 빠지거나 겹친다(「명부에 없음」이 거짓으로).
async function allDirectoryIds(db: Db): Promise<Set<number>> {
  const rows = await all(() => db.from("church_people").select("person_id").order("person_id", { ascending: true }));
  return new Set(rows.map((r: any) => Number(r.person_id)));
}

async function hasDirectory(db: Db): Promise<boolean> {
  const { count, error } = await db.from("church_people").select("person_id", { count: "exact", head: true });
  if (error) throw error;
  return (count ?? 0) > 0;
}
async function loadPeople(db: Db): Promise<HPerson[]> {
  const rows = await all(() => db.from("church_people").select(HISTORY_PEOPLE_COLS).order("person_id", { ascending: true }));
  return rows.map(toHPerson);
}
async function loadHistory(db: Db): Promise<any[]> {
  return all(() => db.from("ministry_history").select(MATCH_COLS).is("deleted_at", null).order("id", { ascending: true }));
}
const asHRow = (r: any): HRow => ({
  id: Number(r.id), year: r.year, committee: r.committee, team: r.team, name: r.name, position: r.position, mok: r.mok,
  renewal: r.renewal, link_how: r.link_how, person_id: r.person_id ?? null,
});

// 다시 맞추기 — ids 가 null 이면 auto 줄 전부, 아니면 그 줄들만 고친다(계산은 늘 모든 해를 함께 — 다른 해 줄이 근거다 · 설계 §3.3)
//   명부가 비었으면(올린 적 없음) 아무것도 고치지 않는다 — 맞춘 것을 모두 지우지 않게.
//   패치에는 읽었던 맞춤 상태(old_person_id·old_basis·old_reason)도 싣는다 — apply 는 그 상태 그대로인 줄에만 쓴다.
//   다시 맞추기는 updated_at 을 올리지 않으므로, 이게 없으면 동시에 돈 두 다시 맞추기 중 늦게 끝난 낡은 쪽이 새 결과를 덮는다.
export async function rematchHistoryRows(db: Db, ids: number[] | null): Promise<{ changed: number; linked: number; total: number; noDirectory?: boolean }> {
  if (!(await hasDirectory(db))) return { changed: 0, linked: 0, total: 0, noDirectory: true };
  const [rows, people] = await Promise.all([loadHistory(db), loadPeople(db)]);
  const res = matchAll(rows.map(asHRow), people);
  const want = ids ? new Set(ids.map(Number)) : null;
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  const patches: any[] = [];
  for (const x of res) {
    const r = byId.get(x.id)!;
    if (r.link_how !== "auto" || (want && !want.has(x.id))) continue;
    if ((r.person_id ?? null) === x.person_id && r.match_basis === x.match_basis && r.match_reason === x.match_reason) continue;
    patches.push({ id: x.id, expect: r.updated_at, old_person_id: r.person_id ?? null, old_basis: r.match_basis ?? "",
      old_reason: r.match_reason ?? "", person_id: x.person_id, match_basis: x.match_basis, match_reason: x.match_reason });
  }
  let changed = 0;
  for (let i = 0; i < patches.length; i += 500) {
    const { data, error } = await db.rpc("ministry_history_apply", { p: patches.slice(i, i + 500) });
    if (error) throw error;
    changed += Number(data) || 0;
  }
  const linked = res.filter((x) => x.person_id !== null).length;
  return { changed, linked, total: res.length };
}

// 같은 이름의 명부 후보(창 · 고르기) — person_id 차례. 화면 글자(이름·소속·직분·교적 목장)로 지문을 만든다.
// ⚠️ 지문(fp)은 「최종으로 보여 준 목록」을 기준으로 만든다 — link() 의 op:"pick" 이 고를 때도 반드시 이 함수 하나로
//   같은 목록을 다시 만든다(둘이 따로 만들면 지문이 어긋나 「이분」이 늘 candidates-changed 가 난다).
async function candidatesFor(db: Db, row: any) {
  // postgrest .in() 은 " \ , ( ) 를 이스케이프하지 않는다 — 그런 열쇠는 묻지 않는다(괄호 든 이름은 괄호 뗀 열쇠로 묻는다)
  const keys = nameKeyVariants(row.name).filter((k) => !/["\\,()]/.test(k));
  const people: any[] = keys.length ? await all(() => db.from("church_people").select(HISTORY_PEOPLE_COLS + ",name_key")
    .in("name_key", keys).order("person_id", { ascending: true })) : [];
  // 「이름 한 글자 다름(오타로 봄)」같이 다른 이름 규칙으로 이어진 줄은 지금 이어진 분이 이름 열쇠 후보에 없을 수 있다 —
  // 그분을 빼고 보여 주면 담당자가 지금 이어진 분을 확인할 수 없으니 끝에 더한다(설계 §4.5·§5 줄 창).
  const pid = row.person_id !== null && row.person_id !== undefined ? Number(row.person_id) : null;
  let extra = false;                                     // 지금 이어진 분을 끝에 더했는가(기록에 extra:1 · 이름 열쇠로 찾은 분이 아니다)
  if (pid !== null && !people.some((p) => Number(p.person_id) === pid)) {
    const { data, error } = await db.from("church_people").select(HISTORY_PEOPLE_COLS + ",name_key").eq("person_id", pid).maybeSingle();
    if (error) throw error;
    if (data) { people.push(data); extra = true; }
  }
  if (!people.length) return { list: [], fp: candFp([]), extra };
  const tk = teamKey(row.team);
  const ids = people.map((p) => Number(p.person_id));
  const served = new Map<number, number>();
  if (ids.length) {
    const hist = await all(() => db.from("ministry_history").select("id,year,team,person_id")
      .in("person_id", ids).is("deleted_at", null).order("id", { ascending: true }));
    for (const h of hist) if (h.year !== row.year && teamKey(h.team) === tk) served.set(h.person_id, (served.get(h.person_id) ?? 0) + 1);
  }
  const list = people.map((p) => ({
    person_id: Number(p.person_id), name: nfc(p.name), label: personLabel(p), position: positionFromChurch(p),
    church_mok: churchMok(p), served: served.get(Number(p.person_id)) ?? 0,
  }));
  const fp = candFp(list.map((c) => [c.name, c.label, c.position, c.church_mok].join("|")));
  return { list, fp, extra };
}
const candOut = (c: any, full: boolean, current: number | null) => {
  const o: Record<string, unknown> = { name: c.name, label: c.label, position: c.position, church_mok: c.church_mok,
    served: c.served, current: current !== null && c.person_id === current };
  if (full) o.person_id = c.person_id;
  return o;
};

async function readRow(db: Db, id: number) {
  const { data, error } = await db.from("ministry_history").select(ROW_COLS + ",deleted_at").eq("id", id).maybeSingle();
  if (error) throw error;
  return data && !data.deleted_at ? data : null;
}
// 줄 하나 + 교적 있는지(person_id 있을 때만 묻는다) → rowOut. readRow 뒤에 늘 이걸로 감싼다.
async function outOrNull(db: Db, r: any, full: boolean) {
  if (!r) return null;
  if (r.person_id === null || r.person_id === undefined) return rowOut(r, full);
  const dir = await directorySet(db, [Number(r.person_id)]);
  return rowOut(r, full, dir.has(Number(r.person_id)));
}
const idOf = (v: unknown): number => { const n = Number(v) || 0; return Number.isSafeInteger(n) && n > 0 ? n : 0; };

// 지워 달라는 요청으로 이름을 지운 줄(CLAUDE.md 비상 절차 ②-1)의 열쇠 — 원래 src_key(이름이 든다)의 SHA-256(16진) 앞에 「erased:」.
//   SQL 로 지울 때와 같은 값: 'erased:' || encode(sha256(convert_to(src_key, 'UTF8')), 'hex') — 같은 원본을 다시 올려도 「빼 둔 줄과 같음」.
export async function erasedKey(key: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return "erased:" + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 올리기 판정(살펴보기·넣기 공용) — 새 줄 · 이미 있음 · 빼 둔 줄과 같음 · 파일 안 겹침 · 틀림
async function judgeUpload(db: Db, raws: unknown[]) {
  const items = raws.map((x, i) => {
    const t = tidyHistoryRow(x);
    return { i, row: t.row, error: t.error, key: t.row ? srcKey(t.row as any) : "", mark: t.row ? "add" : "bad" };
  });
  const years = [...new Set(items.filter((x) => x.row).map((x) => x.row!.year))];
  const existing = new Map<string, boolean>();          // src_key → 빼 둔 줄인가(모든 해를 본다 — 줄의 해를 고쳐도 src_key 는 안 바뀌어
                                                          //   연도로만 거르면 고친 줄을 놓친다 · 설계 §3.2)
  if (years.length) {
    const rows = await all(() => db.from("ministry_history").select("id,src_key,deleted_at").order("id", { ascending: true }));
    for (const r of rows) existing.set(r.src_key, !!r.deleted_at);
  }
  const seen = new Set<string>();
  const anyErased = [...existing.keys()].some((k) => String(k).startsWith("erased:"));   // 지운 줄이 있을 때만 열쇠를 해시해 본다
  for (const x of items) {
    if (!x.row) continue;
    if (existing.has(x.key)) x.mark = existing.get(x.key) ? "deleted" : "same";
    else if (anyErased && existing.has(await erasedKey(x.key))) x.mark = "deleted";
    else if (seen.has(x.key)) x.mark = "dup";
    seen.add(x.key);
  }
  const counts = { total: items.length, add: 0, same: 0, deleted: 0, dup: 0, bad: 0 };
  for (const x of items) (counts as any)[x.mark]++;
  return { items, years, counts };
}
const reasonKey = (s: string): string => s.replace(/\d+명/, "N명").replace(/ \(.*\)$/, "");

// 목록·내려받기 공용 거르기(해 · 못 맞춤/근거 약함 · 이름·팀·부서 찾기) — 둘이 따로 거르면 화면에 보인 줄과 내려받은 줄이 어긋난다
export function historyFilter(rows: any[], b: any): { hit: any[]; years: number[]; q: string; only: "" | "none" | "weak" } {
  const years = Array.isArray(b?.years) ? b.years.map(Number).filter(Number.isInteger) : [];
  const q = cut(b?.q, 40).replace(/\s+/g, "");
  const only = b?.only === "none" || b?.only === "weak" ? b.only : "";
  let hit = rows.filter((r) => !years.length || years.includes(r.year));
  if (only === "none") hit = hit.filter((r) => r.person_id === null);
  if (only === "weak") hit = hit.filter((r) => r.person_id !== null && r.match_basis && WEAK_RE.test(r.match_basis));
  if (q) hit = hit.filter((r) => hKey(r.name).includes(hKey(q)) || nfc(r.team).replace(/\s+/g, "").includes(q) ||
    nfc(r.committee).replace(/\s+/g, "").includes(q));
  return { hit, years, q, only };
}

export function makeHistory({ db, audit }: { db: Db; audit: Audit }) {
  // 쓴 뒤 다시 맞추기 — 실패하거나 명부가 없어 못 맞췄으면 false(응답 rematched:false → 화면이 「🔄 다시 맞추기」를 권한다)
  async function tryRematch(ids: number[], what: string): Promise<boolean> {
    try {
      const m = await rematchHistoryRows(db, ids);
      return !m.noDirectory;
    } catch (err) {
      console.error("history rematch after " + what, err);
      return false;
    }
  }

  async function list(ctx: HCtx, b: any) {
    const full = isFull(ctx);
    const rows = await all(() => db.from("ministry_history").select(ROW_COLS).is("deleted_at", null).order("id", { ascending: true }));
    const yearsAll = new Map<number, { year: number; total: number; linked: number; none: number; weak: number }>();
    for (const r of rows) {
      const y = yearsAll.get(r.year) ?? { year: r.year, total: 0, linked: 0, none: 0, weak: 0 };
      y.total++;
      if (r.person_id !== null) { y.linked++; if (r.match_basis && WEAK_RE.test(r.match_basis)) y.weak++; } else y.none++;
      yearsAll.set(r.year, y);
    }
    const { hit } = historyFilter(rows, b);
    hit.sort((a, b2) => b2.year - a.year || String(a.committee).localeCompare(b2.committee, "ko") ||
      String(a.team).localeCompare(b2.team, "ko") || String(a.name).localeCompare(b2.name, "ko") || a.id - b2.id);
    const page = Math.max(0, Math.floor(Number(b.page) || 0));
    const shown = hit.slice(page * HISTORY_LIST_PAGE, (page + 1) * HISTORY_LIST_PAGE);
    const dir = await directorySet(db, shown.filter((r) => r.person_id !== null).map((r) => Number(r.person_id)));
    return { ok: true, full, rows: shown.map((r) => rowOut(r, full, r.person_id === null ? undefined : dir.has(Number(r.person_id)))),
      total: hit.length, page, pageSize: HISTORY_LIST_PAGE, years: [...yearsAll.values()].sort((a, b2) => b2.year - a.year) };
  }

  async function upload(ctx: HCtx, b: any, save: boolean) {
    const raws: unknown[] = Array.isArray(b.rows) ? b.rows : [];
    if (raws.length > HISTORY_MAX_UPLOAD) return { ok: false, error: "history-too-many" };
    if (!raws.length) return { ok: true, counts: { total: 0, add: 0, same: 0, deleted: 0, dup: 0, bad: 0 }, bad: [], saved: 0, failed: 0 };
    const fileName = cut(b.file_name, 200);
    const j = await judgeUpload(db, raws);
    const bad = j.items.filter((x) => x.mark === "bad").slice(0, 50).map((x) => ({ i: x.i, error: x.error }));
    const adds = j.items.filter((x) => x.mark === "add");
    if (!save) {
      // 미리보기 — 새 줄을 지금 표와 함께 맞춰 본다(쓰지 않는다)
      let preview: { linked: number; unlinked: number; reasons: [string, number][]; noDirectory?: boolean } =
        { linked: 0, unlinked: 0, reasons: [] };
      if (adds.length) {
        if (!(await hasDirectory(db))) {
          preview.noDirectory = true;
        } else {
          const [rows, people] = await Promise.all([loadHistory(db), loadPeople(db)]);
          const temp: HRow[] = adds.map((x, n) => ({ id: -(n + 1), ...(x.row as any), link_how: "auto", person_id: null }));
          const res = matchAll([...rows.map(asHRow), ...temp], people).filter((r) => r.id < 0);
          const rc = new Map<string, number>();
          for (const r of res) if (r.person_id === null) rc.set(reasonKey(r.match_reason), (rc.get(reasonKey(r.match_reason)) ?? 0) + 1);
          preview = { linked: res.filter((r) => r.person_id !== null).length, unlinked: res.filter((r) => r.person_id === null).length,
            reasons: [...rc.entries()].sort((a, c) => c[1] - a[1]) };
          // ⚠️ 살펴보기도 교인명부에 물은 것이다 — 이어진 수가 생년·등록연도·성별의 답이 된다(최종 검토 · 성경필사 people.fill 과 같은 규칙).
          //   명부를 실제로 읽은 때만(새 줄 있음 · 명부 있음) 「교인명부 기록」에 한 줄. 이름은 이름 열쇠마다 하나 — 상한을 따로
          //   두지 않는다(한 번에 받는 줄이 이미 HISTORY_MAX_UPLOAD 로 묶여 있어 이름 수도 그 안에 든다).
          const seen = new Set<string>();
          const askedNames: string[] = [];
          for (const x of adds) {
            const k = hKey(x.row!.name);
            if (!k || seen.has(k)) continue;
            seen.add(k);
            askedNames.push(String(x.row!.name));
          }
          await audit(ctx, "people.lookup", "", { from: "history-check", asked: askedNames.length, askedNames, count: preview.linked });
        }
      }
      return { ok: true, counts: j.counts, bad, preview };
    }
    if (!adds.length) return { ok: true, counts: j.counts, bad, saved: 0, failed: 0 };
    const { data: imp, error: e1 } = await db.from("ministry_history_imports").insert({
      member_id: ctx.member?.id ?? null, file_name: fileName, years: j.years, total: j.counts.total, added: 0,
      skipped_same: j.counts.same, skipped_deleted: j.counts.deleted, skipped_dup: j.counts.dup,
    }).select("id").single();
    if (e1) throw e1;
    const recs = adds.map((x) => ({ ...(x.row as any), src_key: x.key, source: "excel", source_file: fileName, import_id: imp.id,
      link_how: "auto", match_reason: HISTORY_UNMATCHED_YET }));
    let saved = 0, failed = 0;
    for (let i = 0; i < recs.length; i += 500) {
      const part = recs.slice(i, i + 500);
      const { error } = await db.from("ministry_history").insert(part);
      if (!error) { saved += part.length; continue; }
      for (const one of part) {                          // 한 묶음이 막히면 한 줄씩 — 그사이 같은 줄이 들어왔으면(23505) 건너뜀
        const { error: e2 } = await db.from("ministry_history").insert(one);
        if (!e2) saved++;
        // 판정 때는 「새 줄」이었는데 그사이 같은 줄이 들어왔다 — add 에서 same 으로(합이 total 과 맞게)
        else if ((e2 as any).code === "23505") { j.counts.same++; j.counts.add--; }
        else { failed++; console.error("history insert", e2); }
      }
    }
    // ⚠️ 기록은 넣은 바로 뒤에 — 올린 기록 표 고치기·다시 맞추기가 실패해도(아래) 「넣었는데 기록이 없다」가 되지 않게
    await audit(ctx, "history.upload", String(imp.id), { years: j.years, rows: raws.length, ...j.counts, saved, failed });
    try {
      const { error: e3 } = await db.from("ministry_history_imports")
        .update({ added: saved, skipped_same: j.counts.same }).eq("id", imp.id);
      if (e3) throw e3;
    } catch (err) {
      console.error("history import row update", err);   // 올린 기록 표의 수만 어긋난다 — 줄은 들어갔고 기록도 남았다
    }
    // 한 줄도 못 넣었으면 다시 맞추지 않는다 — rematched:false · 화면은 saved 로 갈라 「명단은 들어갔어요」라고 말하지 않는다
    if (!saved) return { ok: true, counts: j.counts, bad, saved, failed, rematched: false };
    let rematched = true;
    let linked = 0, unlinked = saved;
    try {
      const m = await rematchHistoryRows(db, null);
      if (m.noDirectory) throw new Error("no-directory");   // 명부가 없어 맞추지 못했다 — 줄은 자리 표시 사유 그대로
      const { count, error: e4 } = await db.from("ministry_history").select("id", { count: "exact", head: true })
        .eq("import_id", imp.id).not("person_id", "is", null);
      if (e4) throw e4;
      linked = count ?? 0;
      unlinked = saved - linked;
    } catch (err) {
      console.error("history rematch after upload", err);
      rematched = false;
    }
    return rematched
      ? { ok: true, counts: j.counts, bad, saved, failed, linked, unlinked, rematched }
      : { ok: true, counts: j.counts, bad, saved, failed, rematched };
  }

  async function rowAdd(ctx: HCtx, b: any) {
    const t = tidyHistoryRow(b.row);
    if (!t.row) return { ok: false, error: t.error };
    const key = srcKey(t.row as any);
    // 지워 달라는 요청으로 이름까지 지운 줄(CLAUDE.md 비상 절차 ②-1)의 src_key 는 해시(`erasedKey`)라 unique 제약이
    // 원래 열쇠(key)와 부딪히지 않는다 — 그대로 두면 지운 분의 이름이 조용히 되살아난다. 넣기 전에 먼저 물어본다.
    const { data: erased, error: e0 } = await db.from("ministry_history").select("id").eq("src_key", await erasedKey(key)).maybeSingle();
    if (e0) throw e0;
    if (erased) return { ok: false, error: "history-deleted" };
    const { data, error } = await db.from("ministry_history").insert({ ...t.row, src_key: key, source: "admin",
      source_file: "(화면에서 더함)", link_how: "auto", match_reason: HISTORY_UNMATCHED_YET }).select("id").single();
    if (error) {
      if ((error as any).code === "23505") {
        const { data: clash, error: e1 } = await db.from("ministry_history").select("deleted_at").eq("src_key", key).maybeSingle();
        if (e1) throw e1;
        return { ok: false, error: clash?.deleted_at ? "history-deleted" : "history-exists" };
      }
      throw error;
    }
    await audit(ctx, "history.add", String(data.id), { year: t.row.year });
    const rematched = await tryRematch([Number(data.id)], "add");
    return { ok: true, rematched, row: await outOrNull(db, await readRow(db, data.id), isFull(ctx)) };
  }

  async function rowSave(ctx: HCtx, b: any) {
    const id = idOf(b.id);
    if (!id) return { ok: false, error: "not-found" };
    const cur = await readRow(db, id);
    if (!cur) return { ok: false, error: "not-found" };
    if (String(b.expect ?? "") !== cur.updated_at) return { ok: false, error: "conflict" };
    const merged: any = { ...cur };
    const patch = b.patch && typeof b.patch === "object" ? b.patch : {};
    for (const k of HISTORY_EDIT_KEYS) if (k in patch) merged[k] = patch[k];
    const t = tidyHistoryRow(merged);
    if (!t.row) return { ok: false, error: t.error };
    const upd: Record<string, unknown> = {};
    for (const k of HISTORY_EDIT_KEYS) if (t.row[k] !== cur[k]) upd[k] = t.row[k];
    if (!Object.keys(upd).length) return { ok: true, row: await outOrNull(db, cur, isFull(ctx)) };
    upd.updated_at = new Date().toISOString();
    const { data, error } = await db.from("ministry_history").update(upd).eq("id", id).eq("updated_at", cur.updated_at).select("id");
    if (error) throw error;
    if (!(data ?? []).length) return { ok: false, error: (await readRow(db, id)) ? "conflict" : "not-found" };
    await audit(ctx, "history.edit", String(id), { year: t.row.year, fields: Object.keys(upd).filter((k) => k !== "updated_at") });
    // 신규/유지(renewal) 도 다시 맞추기 방아쇠다 — §4.4 「다른 해 같은 팀」이 뒤쪽 해 줄의 신규/유지를 읽는다(HISTORY_REMATCH_KEYS)
    const needRematch = HISTORY_REMATCH_KEYS.some((k) => k in upd) && cur.link_how === "auto";
    const rematched = needRematch ? await tryRematch([id], "edit") : true;
    const fresh = await readRow(db, id);
    // 후보에 영향 줄 수 있는 칸(이름·직분·목장·팀·해·신규유지)을 고쳐 **실제로** 다시 맞춘 것도 이름을 떠본 것이다 —
    // 고치기로 명부를 찔러보는 흔적을 남긴다(2026-10-01 최종 검토 · 올리기 살펴보기와 같은 기준: 명부를 실제로 읽었을 때만).
    // rematched 가 false 면 명부가 없어 묻지 못했으니(noDirectory) 쓰지 않는다. candidatesFor 를 또 불러 후보 수를 세지 않고
    // (질의가 하나 더 든다), 이번 다시 맞추기로 이어졌는지만(0/1) 싣는다 — q 는 고친 뒤(지금) 이름.
    if (needRematch && rematched) {
      await audit(ctx, "people.lookup", "", { from: "history-edit", q: t.row.name, count: fresh && fresh.person_id !== null ? 1 : 0 });
    }
    const out: Record<string, unknown> = { ok: true, row: await outOrNull(db, fresh, isFull(ctx)) };
    if (needRematch) out.rematched = rematched;
    return out;
  }

  async function rowDelete(ctx: HCtx, b: any) {
    const id = idOf(b.id);
    if (!id) return { ok: false, error: "not-found" };
    const cur = await readRow(db, id);
    if (!cur) return { ok: false, error: "not-found" };
    if (String(b.expect ?? "") !== cur.updated_at) return { ok: false, error: "conflict" };
    const now = new Date().toISOString();
    const { data, error } = await db.from("ministry_history").update({ deleted_at: now, deleted_by: ctx.member?.id ?? null, updated_at: now })
      .eq("id", id).eq("updated_at", cur.updated_at).select("id");
    if (error) throw error;
    if (!(data ?? []).length) return { ok: false, error: (await readRow(db, id)) ? "conflict" : "not-found" };
    await audit(ctx, "history.delete", String(id), { year: cur.year });
    return { ok: true };
  }

  async function candidates(ctx: HCtx, b: any) {
    const id = idOf(b.id);
    const row = id ? await readRow(db, id) : null;
    if (!row) return { ok: false, error: "not-found" };
    const full = isFull(ctx);
    const { list, fp, extra } = await candidatesFor(db, row);
    // extra:1 — 이름 열쇠로 찾은 분 말고 지금 이어진 분(오타 규칙 등 다른 이름)도 끝에 보였다(count 에 든다)
    await audit(ctx, "people.lookup", "", { q: row.name, count: list.length, from: "history", ...(extra ? { extra: 1 } : {}) });
    return { ok: true, full, fp, row: await outOrNull(db, row, full), candidates: list.map((c) => candOut(c, full, row.person_id ?? null)) };
  }

  async function link(ctx: HCtx, b: any) {
    const id = idOf(b.id);
    const row = id ? await readRow(db, id) : null;
    if (!row) return { ok: false, error: "not-found" };
    const now = new Date().toISOString();
    const op = b.op === "pick" || b.op === "none" || b.op === "auto" ? b.op : "";
    if (!op) return { ok: false, error: "invalid" };
    // 낙관적 잠금(화면은 줄의 updated_at 을 expect 로 보낸다) — 창을 연 뒤 다른 분(또는 교인명부 「이분 것」)이 이은 것을 말없이 덮지 않게.
    //   expect 가 없으면(교인명부 세션 등 옛 부름) 예전처럼 잠그지 않는다.
    const expect = b.expect === undefined || b.expect === null || b.expect === "" ? null : String(b.expect);
    if (expect !== null && expect !== row.updated_at) return { ok: false, error: "conflict" };
    let patch: Record<string, unknown>;
    if (op === "pick") {
      const { list, fp } = await candidatesFor(db, row);
      const n = Number(b.pick);
      if (String(b.fp ?? "") !== fp || !Number.isInteger(n) || n < 0 || n >= list.length) return { ok: false, error: "candidates-changed" };
      patch = historyLinkPatch(list[n].person_id, ctx.member?.id ?? null, now);
    } else if (op === "none") patch = historyLinkPatch(null, ctx.member?.id ?? null, now);
    else patch = historyUnlinkPatch(now);
    // .select("id") 로 실제로 살아 있는 줄을 건드렸는지 본다 — 그사이 빠졌으면(deleted_at) 쓰지 않은 것과 같다(기록도 안 남긴다)
    //   expect 가 있으면 그사이 바뀐 줄(updated_at 다름)도 0행 — 줄이 아직 있으면 conflict, 없으면 not-found
    let upd = db.from("ministry_history").update(patch).eq("id", id).is("deleted_at", null);
    if (expect !== null) upd = upd.eq("updated_at", row.updated_at);
    const { data, error } = await upd.select("id");
    if (error) throw error;
    if (!(data ?? []).length) return { ok: false, error: expect !== null && (await readRow(db, id)) ? "conflict" : "not-found" };
    await audit(ctx, "history.link", String(id), { op, year: row.year, by: "ministry" });
    const rematched = op === "auto" ? await tryRematch([id], "link") : true;
    const out: Record<string, unknown> = { ok: true, row: await outOrNull(db, await readRow(db, id), isFull(ctx)) };
    if (op === "auto") out.rematched = rematched;
    return out;
  }

  async function rematch(ctx: HCtx, b: any) {
    if (b.confirm !== true) return { ok: false, error: "needs-confirm" };
    let m: { changed: number; linked: number; total: number; noDirectory?: boolean };
    try {
      m = await rematchHistoryRows(db, null);
    } catch (err) {
      // 다시 맞추기 자체가 실패해도 「시도했다」는 기록은 남긴다(실패를 조용히 삼키지 않게) — 그다음 다시 던진다
      await audit(ctx, "history.rematch", "", { failed: true });
      throw err;
    }
    if (m.noDirectory) return { ok: false, error: "no-directory" };
    await audit(ctx, "history.rematch", "", { changed: m.changed, linked: m.linked, total: m.total });
    return { ok: true, ...m };
  }

  async function exportRows(ctx: HCtx, b: any) {
    const full = isFull(ctx);
    const every = await all(() => db.from("ministry_history").select(ROW_COLS).is("deleted_at", null).order("id", { ascending: true }));
    // 목록과 같은 거르기(해 · 못 맞춘 줄만/근거 약한 줄만 · 찾기) — 화면에서 거른 그대로 내려받는다
    const { hit: rows, years, q, only } = historyFilter(every, b);
    if (!rows.length) return { ok: true, full, rows: [] };
    rows.sort((a, c) => a.year - c.year || a.id - c.id);
    // 명부 전체를 한 번만 읽는다(내보내는 줄마다 .in() 을 부르지 않게 — 수천 줄이면 수천 번이 된다)
    const dirIds = await allDirectoryIds(db);
    // 찾은 글자(q)는 이름일 수 있어 싣지 않는다 — 찾기로 걸렀다는 것만
    await audit(ctx, "history.export", "", { count: rows.length, years, ...(only ? { only } : {}), ...(q ? { search: true } : {}) });
    return { ok: true, full, rows: rows.map((r) => ({
      ...rowOut(r, full, r.person_id === null ? undefined : dirIds.has(Number(r.person_id))), source_file: r.source_file,
    })) };
  }

  return { list, upload, rowAdd, rowSave, rowDelete, candidates, link, rematch, exportRows };
}
