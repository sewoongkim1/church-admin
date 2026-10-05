// 사역 이력 — 표를 읽고 쓰는 쪽(서버 · 2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md §3·§5·§6·§7)
//   규칙은 history-match.ts(순수), 여기는 표 읽기·쓰기·응답 모양. index.ts 의 switch 가 makeHistory(...) 의 함수를 부른다.
// ⚠️ npm import 를 두지 않는다 — db(supabase 클라이언트)를 받아 쓴다(Node 시험·교인명부 세션이 이 파일을 import 한다).
// ⚠️ 응답은 칸 지도(rowOut·candOut)로만. person_id 는 full(교인명부·총괄 역할)일 때만 싣는다 — 사역신청 역할에게는 없다.
// ⚠️ 기록(audit) detail 에 이름·교인ID 를 싣지 않는다(줄 id·해·수만). people.lookup 만 이름을 싣는다(교인명부 기록 · 다른 화면과 같다) —
//   줄 창 후보는 q(찾은 이름) · 올리기 살펴보기는 askedNames(명부에 맞춰 본 이름 · from:"history-check" · 2026-10-01 최종 검토).
// 교인명부 세션(자세히 창 「이분 것」)이 쓰는 것: rematchHistoryRows(db, ids) · history-match.ts 의 historyLinkPatch·historyUnlinkPatch.
import { matchAll, srcKey, hKey, teamKey, historyLinkPatch, historyUnlinkPatch, toHPerson, candFp, nameKeyVariants,
  HISTORY_PEOPLE_COLS, WEAK_RE, nfc, mokNameKey, R_NONE, R_HAND_NONE } from "./history-match.ts";
import type { HRow, HPerson } from "./history-match.ts";
import { personLabel } from "./events-person.ts";
import { positionFromChurch, churchMok } from "./events-people.ts";

export const HISTORY_MAX_UPLOAD = 3000;      // 한 번에 받는 줄(화면은 해마다 나눠 보낸다 · 통합 파일 4,093줄)
export const HISTORY_FIELD_MAX = 100;        // 부서·팀·이름·직분·목장·직책·신규/유지 칸
export const HISTORY_NOTE_MAX = 500;         // 원본 메모
export const HISTORY_LIST_PAGE = 100;
export const HISTORY_GROUP_PAGE = 100;       // 「👥 묶어 보기」 한 쪽의 묶음 수
export const HISTORY_GROUP_MAX = 300;        // 한 묶음을 한 번에 잇는 줄 수(같은 목장·이름 — 실제로는 열 줄 안팎)
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
//   ids 를 주면 그 줄과 **같은 목장·이름(mokNameKey) 묶음의 자동 줄**도 함께 고친다(2026-10-05 친구 요청 「하나를 이어짐으로 고치면
//   같은 데이터도」) — 사람이 정한 것을 따르는 규칙(history-match.ts)이 그 줄들을 바꾼다. extraKeys — 지금은 그 열쇠가 아닌 줄
//   (고쳐서 목장·이름이 바뀐 줄의 옛 열쇠 · 뺀 줄의 열쇠)의 묶음도 다시 맞추게.
//   명부가 비었으면(올린 적 없음) 아무것도 고치지 않는다 — 맞춘 것을 모두 지우지 않게.
//   패치에는 읽었던 맞춤 상태(old_person_id·old_basis·old_reason)도 싣는다 — apply 는 그 상태 그대로인 줄에만 쓴다.
//   다시 맞추기는 updated_at 을 올리지 않으므로, 이게 없으면 동시에 돈 두 다시 맞추기 중 늦게 끝난 낡은 쪽이 새 결과를 덮는다.
export async function rematchHistoryRows(db: Db, ids: number[] | null, extraKeys: string[] = []):
  Promise<{ changed: number; linked: number; total: number; noDirectory?: boolean }> {
  if (!(await hasDirectory(db))) return { changed: 0, linked: 0, total: 0, noDirectory: true };
  const [rows, people] = await Promise.all([loadHistory(db), loadPeople(db)]);
  const res = matchAll(rows.map(asHRow), people);
  const want = ids ? new Set(ids.map(Number)) : null;
  if (want) {
    const keys = new Set(extraKeys.filter(Boolean));
    for (const r of rows) if (want.has(Number(r.id))) { const k = mokNameKey(r); if (k) keys.add(k); }
    if (keys.size) for (const r of rows) if (r.link_how === "auto" && keys.has(mokNameKey(r))) want.add(Number(r.id));
  }
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

// 찾기 칸(2026-10-02 친구 요청 · 동명이인 중 한 분만) — 빈칸·「+」·「,」로 낱말을 가르고, 줄은 **모든** 낱말이 맞아야 남는다.
//   낱말 하나는 이름(hKey) · 목장 · 부서 · 팀 · 직책 · 직분 중 하나에 들어 있으면 맞다(NFC · 띄어쓰기 없앰 · 영문 대소문자 무시).
//   목장은 끝의 「목장」을 양쪽 다 떼고도 본다(「20목장」·「20」 → 「화평-20」·「화평-20목장」).
//   낱말 하나일 때 오늘(이름·팀·부서 · 한 덩이)보다 좁아지지 않는다 — 칸이 늘었고 대소문자를 안 가린다.
//   「#숫자」는 교인ID(person_id) — 교인명부·총괄(full)만. 아니면 거르지 않고 error:"need-directory"(던지지 않는다 · 교인ID 로
//   줄을 가려 보는 길도 교인ID 를 보는 것과 같다). # 없는 숫자는 글자 그대로(목장 번호 「12」).
const Q_SEP_RE = /[\s+,]+/;
const Q_ID_RE = /^#(\d+)$/;
const fold = (s: unknown): string => nfc(s).replace(/\s+/g, "").toLowerCase();
const noMok = (s: string): string => s.replace(/목장$/, "");
const Q_TEXT_KEYS = ["committee", "team", "role_title", "position"] as const;
function wordHit(r: any, w: string): boolean {
  if (hKey(r.name).toLowerCase().includes(hKey(w).toLowerCase())) return true;
  if (Q_TEXT_KEYS.some((k) => fold(r[k]).includes(w))) return true;
  const mok = fold(r.mok);
  if (mok.includes(w)) return true;
  const wm = noMok(w);                                   // 「목장」 한 낱말은 떼면 빈 글 — 그때는 글자 그대로만(위)
  return !!wm && wm !== w && noMok(mok).includes(wm);
}

// 목록·내려받기 공용 거르기(해 · 못 맞춤/근거 약함 · 찾기) — 둘이 따로 거르면 화면에 보인 줄과 내려받은 줄이 어긋난다
//   opt.full — 교인명부·총괄 역할(isFull). 안 넘기면 full 이 아닌 것으로 본다.
export function historyFilter(rows: any[], b: any, opt: { full?: boolean } = {}):
  { hit: any[]; years: number[]; q: string; only: "" | "none" | "weak"; error?: "need-directory" } {
  const years = Array.isArray(b?.years) ? b.years.map(Number).filter(Number.isInteger) : [];
  const only = b?.only === "none" || b?.only === "weak" ? b.only : "";
  const words: string[] = [], pids: number[] = [];
  // 「# 123」(# 뒤 빈칸)은 「#123」으로 붙인다 · 「#」 하나만(치는 중)은 버린다 — 그 낱말이 아무 줄에도 안 맞아 목록이 까닭 없이 비지 않게
  for (const raw of cut(b?.q, 40).replace(/#\s+(?=\d)/g, "#").split(Q_SEP_RE)) {
    const w = fold(raw);
    if (!w || w === "#") continue;
    const m = Q_ID_RE.exec(w);
    if (m) pids.push(Number(m[1])); else words.push(w);
  }
  const q = [...words, ...pids.map((n) => "#" + n)].join(" ");   // 찾은 것이 있는가(내려받기 기록 search:true) — 기록에는 싣지 않는다
  if (pids.length && !opt.full) return { hit: [], years, q, only, error: "need-directory" };
  let hit = rows.filter((r) => !years.length || years.includes(r.year));
  if (only === "none") hit = hit.filter((r) => r.person_id === null);
  if (only === "weak") hit = hit.filter((r) => r.person_id !== null && r.match_basis && WEAK_RE.test(r.match_basis));
  for (const n of pids) hit = hit.filter((r) => r.person_id !== null && r.person_id !== undefined && Number(r.person_id) === n);
  if (words.length) hit = hit.filter((r) => words.every((w) => wordHit(r, w)));
  return { hit, years, q, only };
}

/// ── 「빠진 사역」 정정 신청을 「반영」하면 그 해 사역 이력에 한 줄(2026-10-01 · index.ts historyRequestSet 이 부른다) ──
//   성도님이 성경암송 앱 「🗂️ 사역 이력 확인」에서 낸 부서·팀(requestDraft)을 창에 미리 채우고(requestLineOut · draft),
//   담당자가 연도·부서·팀·직책을 고쳐 「반영」하면 그 내용(line)으로 넣는다(2026-10-02 친구 요청).
//   부서·팀은 두 꼴(history-check.ts ReqIn): 두 칸 신청(committee_text 가 글자 · 2026-10-02 「부서」「팀」 두 칸)은 칸 그대로,
//   옛 한 칸 신청(committee_text null · 칸 이름표 「부서 · 팀」 · 보기 「찬양위원회 시온성가대」)은 team_text 를 parseTeamText 로 나눈다.
//   ⚠️ 성도님 신청 글(year·committee_text·team_text)은 바꾸지 않는다 — 고친 값은 사역 이력 줄에만 들어간다.
//   ⚠️ 직분은 교적(교인명부)의 직분이다(친구 2026-10-01 「직분은 교적 기준」) — 글에 적힌 직분은 줄에 쓰지 않는다(한 칸 글은 떼어 내기만 한다 ·
//      두 칸 신청은 칸 그대로라 팀 칸 끝에 「집사」를 적었으면 그대로 남는다 — 담당자가 「사역 이력에 넣을 내용」에서 고친다).
//   ⚠️ 이 줄의 열쇠는 srcKey 가 아니라 `req:<신청 id>` 다 — 신청 하나에 줄 하나(두 번 반영해도 하나 · 되돌리면 그 줄만 뺀다).
//      그래서 나중에 그 해 엑셀 명단을 올렸는데 같은 사역이 들어 있으면 엑셀 줄은 **따로 한 줄**로 들어간다(열쇠가 달라 「이미 있음」이 아니다)
//      — 겹치면 담당자가 📜 사역 이력에서 하나를 뺀다.
//   ⚠️ SQL 008 mhr_line_chk 가 빠진 사역 신청에 history_id 를 막는다 — 신청 ↔ 줄은 이 열쇠로만 잇는다(SQL 을 바꾸지 않는다).
export const requestKey = (reqId: unknown): string => `req:${Number(reqId)}`;
const REQ_SEP_RE = /[·•\/|]/;
// 직분으로 볼 끝 낱말 — 낱말 **전체**가 (앞말)직분(님)일 때만(2026-10-02 리뷰 D5 · 「대학청년」·「중고등학생」·「권사회」·「청년부」는 팀 이름이다) · 끝의 「님」은 뗀다
//   앞말에 서리·이명도(교적이 쓰는 직분 「서리집사」·「이명권사」 — events-people.ts positionFromChurch 가 떼는 앞말 · 2026-10-02 최종 검토 #10)
//   앞말은 둘까지·끝에 「은퇴」 한 번(교적의 겹꼴 「은퇴협동권사」·「서리집사은퇴」 — positionFromChurch 주석 · 2026-10-02 검증 2차 #6)
//   ⚠️ 앞말·뒷말만(「서리」·「서리은퇴」)은 직분이 아니다 — 가운데 직분 낱말이 꼭 있어야 한다
const REQ_POS_RE = /^(?:부|담임|협동|시무|안수|명예|은퇴|원로|서리|이명){0,2}(집사|권사|장로|목사|전도사|사모|성도|청년|학생)(?:은퇴)?(님)?$/;
// 창에서 고칠 수 있는 칸 — 이 넷만 줄에 들어간다(이름·목장은 신청에서, 직분은 교적에서)
const LINE_KEYS = ["year", "committee", "team", "role_title"] as const;

// 글 → 부서·팀·직분. 「·」「•」「/」「|」로 나눈다 → 끝 조각(또는 끝 조각의 마지막 낱말)이 직분이면 떼고 →
//   조각이 하나뿐이고 빈칸이 있으면 첫 빈칸에서 둘로 → 둘 이상이면 부서 = 첫 조각, 팀 = 나머지(「 · 」로 잇기) · 하나면 팀만.
//   position 은 읽어 둘 뿐이다 — 줄의 직분은 교적에서(missingRowFromRequest).
export function parseTeamText(text: unknown): { committee: string; team: string; position: string } {
  let parts = nfc(text).split(REQ_SEP_RE).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  let position = "";
  if (parts.length) {
    const words = parts[parts.length - 1].split(" ");
    const tail = words[words.length - 1];
    // 끝 조각이 직분 하나뿐이면 조각이 둘 이상일 때만 뗀다(「집사」 한 마디만 적었으면 그대로 팀으로 둔다)
    if (REQ_POS_RE.test(tail) && (words.length > 1 || parts.length >= 2)) {
      position = tail.replace(/님$/, "");
      if (words.length > 1) parts[parts.length - 1] = words.slice(0, -1).join(" ");
      else parts = parts.slice(0, -1);
    }
  }
  if (parts.length === 1) {
    const m = /^(\S+) (.+)$/.exec(parts[0]);
    if (m) parts = [m[1], m[2]];
  }
  if (parts.length >= 2) return { committee: parts[0], team: parts.slice(1).join(" · "), position };
  return { committee: "", team: parts[0] ?? "", position };
}

// 창이 고쳐 보낸 「사역 이력에 넣을 내용」 — 연도·부서·팀·직책 + expect(창이 본 줄의 updated_at · 줄이 없던 때는 "").
export type ReqLine = { year: number; committee: string; team: string; role_title: string; expect: string };

// 화면(requests-logic.js lineCheck)과 같은 검사 — 정하는 것은 여기. 오류는 코드 하나(bad-year · need-team · history-too-long).
//   글은 NFC · 빈칸 접기 · 앞뒤 자르기(nfc·cut — 줄 칸 다듬기 tidyHistoryRow 와 같은 식).
export function parseRequestLine(x: any): { line: ReqLine | null; error: string } {
  const y = nfc(x?.year), year = Number(y);
  if (!y || !Number.isInteger(year) || year < 1950 || year > 2100) return { line: null, error: "bad-year" };
  const committee = cut(x?.committee, HISTORY_FIELD_MAX + 1), team = cut(x?.team, HISTORY_FIELD_MAX + 1);
  const role_title = cut(x?.role_title, HISTORY_FIELD_MAX + 1);
  if (!committee && !team) return { line: null, error: "need-team" };
  if ([committee, team, role_title].some((v) => v.length > HISTORY_FIELD_MAX)) return { line: null, error: "history-too-long" };
  return { line: { year, committee, team, role_title, expect: String(x?.expect ?? "").trim() }, error: "" };
}

// 신청의 부서·팀(미리 채움 · line 없이 반영할 때) — 신청에서 부서·팀을 읽는 곳은 이 하나다(목록 draft · line 없는 반영 · missingRowFromRequest).
//   두 칸 신청(committee_text 가 글자 · 빈 글자도): 칸 그대로(NFC · 빈칸 접기 · 앞뒤 자르기만 · 나누지도 직분을 떼지도 않는다)
//   옛 한 칸 신청(committee_text null · 칸 없음): team_text 를 parseTeamText 로(지금까지처럼)
export function requestDraft(req: any): { committee: string; team: string } {
  if (req?.committee_text != null) {
    const t = (v: unknown) => nfc(v).replace(/\s+/g, " ");
    return { committee: t(req.committee_text), team: t(req.team_text) };
  }
  const p = parseTeamText(req?.team_text);
  return { committee: p.committee, team: p.team };
}

// 줄이 없을 때 창에 채울 내용 — 신청의 부서·팀(requestDraft) · 신청 해(직책은 비움)
function requestDraftLine(req: any): { year: number | null; committee: string; team: string; role_title: string } {
  const d = requestDraft(req);
  return { year: req?.year == null ? null : Number(req.year), committee: d.committee, team: d.team, role_title: "" };
}

// 목록(historyRequestList)이 빠진 사역 신청마다 싣는 line — 정해진 일곱 칸만(이름·목장·교인ID 를 싣지 않는다 · history-check.ts requestAdminOut 이 한 번 더 고른다)
//   row: 이 신청의 req:<id> 줄(없으면 null) — 살아 있으면 in · 빼 두었으면 out · 없으면 draft(신청의 부서·팀 · requestDraft)
export function requestLineOut(req: any, row: any | null) {
  if (row) {
    return { state: row.deleted_at ? "out" : "in", year: Number(row.year), committee: String(row.committee ?? ""), team: String(row.team ?? ""),
      role_title: String(row.role_title ?? ""), position: String(row.position ?? ""), expect: String(row.updated_at ?? "") };
  }
  const d = requestDraftLine(req);
  return { state: "draft", year: d.year, committee: d.committee, team: d.team, role_title: "", position: "", expect: "" };
}

// 신청 한 줄 → 사역 이력 한 줄(다듬기·검사는 tidyHistoryRow 그대로).
//   line: 창이 고쳐 보낸 연도·부서·팀·직책(없으면 신청의 부서·팀 draft · requestDraft) · position: 교적(교인명부)의 직분(D4 — 글의 직분은 쓰지 않는다)
//   부서나 팀 하나는 있어야 한다(need-team · 둘 다 비면 넣지 않는다)
//   목장: 교구 「교구-목장」(목장이 99·빈칸이면 교구만 — requests-logic.js whoText 와 같은 규칙 · D3) · 교회학교 「부서」 · 이름은 신청 때의 로그인 이름.
export function missingRowFromRequest(req: any, line: Partial<ReqLine> | null, position: unknown): { row: Record<string, any> | null; error: string } {
  const l: any = line ?? requestDraftLine(req);
  if (!nfc(l?.committee) && !nfc(l?.team)) return { row: null, error: "need-team" };
  const group = nfc(req?.who_group), sub = nfc(req?.who_sub);
  const mok = nfc(req?.who_type) === "교회학교" ? group : (sub && sub !== "99" ? `${group}-${sub}` : group);
  const t = tidyHistoryRow({
    year: l?.year, committee: l?.committee, team: l?.team, role_title: l?.role_title, name: req?.who_name,
    position: nfc(position), mok, renewal: "", src_note: `정정 신청 #${Number(req?.id)}`,
  });
  if (!t.row) return { row: null, error: t.error };
  return { row: { ...t.row, src_key: requestKey(req?.id) }, error: "" };
}

// 교인명부의 직분(그분의 교인ID 로 한 줄 · 명예·은퇴·원로 앞말 포함 — positionFromChurch)
async function churchPosition(db: Db, personId: number): Promise<string> {
  const { data, error } = await db.from("church_people").select("position,position_detail").eq("person_id", personId).maybeSingle();
  if (error) throw error;
  return data ? positionFromChurch(data) : "";
}

// 그 줄의 마지막 「빼기」 기록(detail) — 정정 신청 쪽이 뺐으면 {from:"request"} 가 있다(「📜 사역 이력」에서 손으로 뺀 rowDelete 는 {year} 만).
//   되살릴지는 이것 하나로 정한다(applyMissingRequest) — 신청 「삭제」로 뺀 줄(why:"request-deleted")도 from:"request" 지만 되살리지 않는다.
//   ⚠️ 신청이 지워졌으니 다시 「반영」할 길이 없을 것 같아도, 지우기 직전에 신청을 읽어 둔 「반영 한 번 더」(noop 갈래)가 그 뒤에 닿을 수 있다
//      (2026-10-02 최종 검토 #2 — 그래서 why 를 따로 본다 · index.ts historyRequestSet 도 그 갈래에서 신청이 아직 있는지 다시 본다).
async function lastDeleteDetail(db: Db, rowId: number): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from("admin_audit").select("detail").eq("action", "history.delete").eq("target", String(rowId))
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data?.detail ?? null;
}

// 줄과 고친 내용이 다른 칸(연도·부서·팀·직책) — 칸 차례는 LINE_KEYS(기록 fields 의 차례)
function lineDiff(line: ReqLine | null, row: any): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (!line) return patch;
  for (const k of LINE_KEYS) {
    const want = k === "year" ? Number(line.year) : String(line[k] ?? "");
    const cur = k === "year" ? Number(row.year) : String(row[k] ?? "");
    if (want !== cur) patch[k] = want;
  }
  return patch;
}

// positionFailed — 넣을 때 교적 직분 읽기가 실패해 직분을 빈칸으로 넣었다(불리언만 · 화면이 「직분을 채워 주세요」 창 · 2026-10-02 최종 검토 #9)
export type MissingApply = { id?: number; year?: number; created?: boolean; restored?: boolean; edited?: boolean; fields?: string[];
  positionFailed?: boolean; error?: string };
export type MissingApplyOpts = {
  line?: ReqLine | null; memberId: string | null; nowIso: string;
  positionLookup?: (personId: number) => Promise<string>;                         // 시험이 교적 직분 읽기를 바꿔 끼운다(없으면 church_people)
  lastDeleteLookup?: (rowId: number) => Promise<Record<string, unknown> | null>;  // 시험이 마지막 빼기 기록 읽기를 바꿔 끼운다(없으면 admin_audit)
};

// 「반영」 — 이 신청의 줄(req:<id>)이
//   살아 있으면: 고친 내용(line)이 다를 때만, 창이 본 그대로(updated_at = line.expect)일 때 고친다(edited · fields) — 아니면 line-conflict · 같으면 그대로(created:false)
//   빼 두었으면: 마지막 빼기가 정정 신청 쪽(from:"request")이었을 때만 되살린다(restored · 고친 내용도 함께).
//               「📜 사역 이력」에서 손으로 뺀 줄(기록에 from 없음)·빼기 기록이 없는 줄은 되살리지 않는다(history-removed · 2026-10-02 리뷰 D2).
//               신청 「삭제」로 뺀 줄(why:"request-deleted")도 되살리지 않는다(history-removed · 2026-10-02 최종 검토 #2).
//               ⚠️ 상태가 어디서 왔는지(확인 중→반영인지 반영에 머문 다시 누름인지)는 보지 않는다 — 263fa20 은 「반영으로 들어올 때만」도 보았는데,
//               「확인 중→반영」에서 되살리다 DB 오류가 나면 안내(「잠시 뒤 「반영」을 한 번 더」)를 따른 다음 누름이 반영에 머문 길이라
//               「직접 뺀 줄이라 다시 넣지 않았어요」로 잘못 답했다(2026-10-02 · 그 조건을 걷었다).
//   없으면: 넣는다(created) — 본인 교인ID 로 사람이 이은 줄(manual · 근거 「본인 정정 신청」 · 다시 맞추기가 덮지 않는다).
//   교인ID 가 없는 신청은 넣지 않는다(no-person) — 서버(requestBlock)가 빠진 사역은 교적을 찾은 분에게만 받는다.
export async function applyMissingRequest(db: Db, req: any, opts: MissingApplyOpts): Promise<MissingApply> {
  const { line = null, memberId, nowIso, positionLookup, lastDeleteLookup } = opts;
  const pid = req?.person_id !== null && req?.person_id !== undefined && Number(req.person_id) > 0 ? Number(req.person_id) : null;
  if (pid === null) return { error: "no-person" };
  const key = requestKey(req?.id);
  const { data: ex, error: e0 } = await db.from("ministry_history").select("id,year,committee,team,role_title,deleted_at,updated_at")
    .eq("src_key", key).maybeSingle();
  if (e0) throw e0;
  if (ex && !ex.deleted_at) {
    const patch = lineDiff(line, ex);
    const fields = Object.keys(patch);
    if (!fields.length) return { id: Number(ex.id), year: ex.year, created: false };
    // 창이 본 뒤로 그 줄이 바뀌었다(「📜 사역 이력」에서 고침 · 다른 분이 먼저 고침 · 창은 줄이 없던 때를 봤다) — 덮지 않는다
    if (String(ex.updated_at ?? "") !== line!.expect) return { error: "line-conflict" };
    const { data, error } = await db.from("ministry_history").update({ ...patch, updated_at: nowIso })
      .eq("id", ex.id).eq("updated_at", line!.expect).is("deleted_at", null).select("id,year");
    if (error) throw error;
    if (!(data ?? []).length) return { error: "line-conflict" };   // 그사이 바뀌었거나 빠졌다
    return { id: Number(ex.id), year: Number(patch.year ?? ex.year), edited: true, fields };
  }
  if (ex) {
    const last = await (lastDeleteLookup ?? ((x: number) => lastDeleteDetail(db, x)))(Number(ex.id));
    if (last?.from !== "request" || last?.why === "request-deleted") return { error: "history-removed", id: Number(ex.id) };
    // 창이 빼 둔 그 줄을 보고 고쳤다면 그대로일 때만(줄이 없던 때를 봤으면 잠그지 않는다 — 고친 내용은 그래도 넣는다)
    const expect = line?.expect ?? "";
    if (expect && String(ex.updated_at ?? "") !== expect) return { error: "line-conflict" };
    const patch = lineDiff(line, ex);
    let q = db.from("ministry_history").update({ ...patch, deleted_at: null, deleted_by: null, updated_at: nowIso })
      .eq("id", ex.id).not("deleted_at", "is", null);
    if (expect) q = q.eq("updated_at", expect);
    const { data, error } = await q.select("id,year");
    if (error) throw error;
    // 0행 — 그사이 바뀌었다(expect 가 있으면) · 다른 분이 먼저 되살렸다(없으면)
    if (!(data ?? []).length) return expect ? { error: "line-conflict" } : { id: Number(ex.id), year: ex.year, created: false };
    return { id: Number(ex.id), year: Number(patch.year ?? ex.year), restored: true, fields: Object.keys(patch) };
  }
  // 지워 달라는 요청으로 이름까지 지운 줄(CLAUDE.md 비상 절차 ②-1 — 열쇠가 해시)이면 되살리지 않는다(rowAdd 와 같은 까닭)
  const { data: erased, error: e1 } = await db.from("ministry_history").select("id").eq("src_key", await erasedKey(key)).maybeSingle();
  if (e1) throw e1;
  if (erased) return { error: "history-deleted" };
  // 직분은 교적에서 — 읽기가 실패해도 줄은 넣는다(직분만 빈칸 · 담당자가 「📜 사역 이력」에서 채울 수 있다)
  //   실패는 positionFailed 로 알린다(빈칸이 「교적에 직분이 없음」과 같아 보여 담당자가 모르고 지나가지 않게 · 2026-10-02 최종 검토 #9)
  let position = "", positionFailed = false;
  try {
    position = await (positionLookup ?? ((x: number) => churchPosition(db, x)))(pid);
  } catch (err) {
    console.error("history request church position", err);
    position = "";
    positionFailed = true;
  }
  const t = missingRowFromRequest(req, line, position);
  if (!t.row) return { error: t.error };
  const rec = {
    ...t.row, source: "admin", source_file: "(정정 신청)", person_id: pid, link_how: "manual",
    linked_by: memberId, linked_at: nowIso, match_basis: "본인 정정 신청", match_reason: "", updated_at: nowIso,
  };
  const { data, error } = await db.from("ministry_history").insert(rec).select("id,year").single();
  if (error) {
    if ((error as any).code !== "23505") throw error;
    // 같은 때 두 번 눌렀다 — 먼저 들어간 줄을 그대로 돌려준다
    const { data: again, error: e2 } = await db.from("ministry_history").select("id,year").eq("src_key", key).maybeSingle();
    if (e2) throw e2;
    if (!again) throw error;
    return { id: Number(again.id), year: again.year, created: false };
  }
  return { id: Number(data.id), year: data.year, created: true, ...(positionFailed ? { positionFailed: true } : {}) };
}

// 「반영」을 되돌렸다(확인 중·반영 안 함으로) · 신청을 지웠다 — 이 신청의 살아 있는 줄만 뺀다(표시만 · 다시 반영하면 되살아난다)
export async function undoMissingRequest(db: Db, reqId: unknown, memberId: string | null, nowIso: string):
  Promise<{ id?: number; year?: number; removed: boolean }> {
  const { data, error } = await db.from("ministry_history").update({ deleted_at: nowIso, deleted_by: memberId, updated_at: nowIso })
    .eq("src_key", requestKey(reqId)).is("deleted_at", null).select("id,year");
  if (error) throw error;
  const r = (data ?? [])[0];
  return r ? { id: Number(r.id), year: r.year, removed: true } : { removed: false };
}

// 해마다 요약(목록·묶어 보기 공용) — 줄 수 · 이어짐 · 못 맞춤 · 근거 약함
function yearsSummary(rows: any[]) {
  const by = new Map<number, { year: number; total: number; linked: number; none: number; weak: number }>();
  for (const r of rows) {
    const y = by.get(r.year) ?? { year: r.year, total: 0, linked: 0, none: 0, weak: 0 };
    y.total++;
    if (r.person_id !== null) { y.linked++; if (r.match_basis && WEAK_RE.test(r.match_basis)) y.weak++; } else y.none++;
    by.set(r.year, y);
  }
  return [...by.values()].sort((a, b) => b.year - a.year);
}

// 「👥 묶어 보기」(2026-10-04 · 친구 제안 「교구-목장-이름을 DISTINCT 로 묶어 매핑」) — 못 맞춘 자동 줄을 목장 글자·이름(mokNameKey)으로
//   묶는다. 새 표 없이 줄마다 「사람이 이음」으로 적고, 같은 묶음에 나중에 올라온 줄은 맞춤 규칙이 따라 잇는다(history-match.ts).
//   빼는 것: 「이분 아님」 줄(link_how none — 이미 정했다) · 그 결정을 따라 비운 자동 줄(R_HAND_NONE).
//   목장이 비었거나 자리 표시면 mokNameKey 가 "" — 같은 이름의 다른 분일 수 있어 줄마다 따로(「#줄 id」 묶음).
//   cand=false — 사유가 모두 「교인명부에 같은 이름이 없음」(고를 분이 없다) · 화면은 수만 알린다.
const groupRowOut = (r: any) => ({ id: Number(r.id), year: r.year, committee: r.committee, team: r.team, role_title: r.role_title,
  position: r.position, mok: r.mok, updated_at: r.updated_at });
export function historyGroupsOf(rows: any[], b: any, opt: { full?: boolean } = {}) {
  const f = historyFilter(rows, { ...b, only: "none" }, opt);
  if (f.error) return { error: f.error, groups: [] as any[], nocand: 0 };
  const by = new Map<string, any[]>();
  for (const r of f.hit) {
    if (r.link_how !== "auto" || String(r.match_reason || "").startsWith(R_HAND_NONE)) continue;
    const k = mokNameKey(r) || `#${r.id}`;
    const l = by.get(k); if (l) l.push(r); else by.set(k, [r]);
  }
  const all = [...by.entries()].map(([key, list]) => {
    list.sort((x, y) => x.year - y.year || x.id - y.id);
    const reasons = new Map<string, number>();
    for (const r of list) { const w = String(r.match_reason || ""); reasons.set(w, (reasons.get(w) ?? 0) + 1); }
    return {
      key, name: list[0].name, mok: list[0].mok, n: list.length, years: [...new Set(list.map((r) => Number(r.year)))],
      last: Number(list[list.length - 1].year),
      reason: [...reasons.entries()].sort((x, y) => y[1] - x[1])[0][0],
      cand: !list.every((r) => String(r.match_reason || "").startsWith(R_NONE)),
      rows: list.map(groupRowOut),
    };
  });
  const groups = all.filter((g) => g.cand)
    .sort((x, y) => y.last - x.last || String(x.name).localeCompare(String(y.name), "ko") || x.key.localeCompare(y.key));
  return { error: "", groups, nocand: all.length - groups.length };
}
// 한 묶음 잇기 전에 — 보낸 줄이 모두 있고, 아직 못 맞춘 자동 줄이고, 같은 묶음(mokNameKey · 줄 하나면 열쇠가 "" 여도 된다)이고,
//   창을 연 때(expect)와 같아야 한다. 하나라도 어긋나면 아무것도 쓰지 않는다.
export function groupLinkCheck(rows: any[], ids: number[], expect: Map<number, string>): "" | "not-found" | "conflict" | "invalid" {
  if (rows.length !== ids.length) return "not-found";
  if (rows.some((r) => r.link_how !== "auto" || (r.person_id !== null && r.person_id !== undefined))) return "conflict";
  const keys = new Set(rows.map((r) => mokNameKey(r)));
  if (rows.length > 1 && (keys.size !== 1 || keys.has(""))) return "invalid";
  if (rows.some((r) => expect.get(Number(r.id)) !== r.updated_at)) return "conflict";
  return "";
}

export function makeHistory({ db, audit }: { db: Db; audit: Audit }) {
  // 쓴 뒤 다시 맞추기 — 실패하거나 명부가 없어 못 맞췄으면 false(응답 rematched:false → 화면이 「🔄 다시 맞추기」를 권한다)
  async function tryRematch(ids: number[], what: string, extraKeys: string[] = []): Promise<boolean> {
    try {
      const m = await rematchHistoryRows(db, ids, extraKeys);
      return !m.noDirectory;
    } catch (err) {
      console.error("history rematch after " + what, err);
      return false;
    }
  }

  async function list(ctx: HCtx, b: any) {
    const full = isFull(ctx);
    const rows = await all(() => db.from("ministry_history").select(ROW_COLS).is("deleted_at", null).order("id", { ascending: true }));
    const { hit, error } = historyFilter(rows, b, { full });
    if (error) return { ok: false, error };            // #교인ID 찾기 — 교인명부·총괄만(줄·수·해 요약도 싣지 않는다)
    hit.sort((a, b2) => b2.year - a.year || String(a.committee).localeCompare(b2.committee, "ko") ||
      String(a.team).localeCompare(b2.team, "ko") || String(a.name).localeCompare(b2.name, "ko") || a.id - b2.id);
    const page = Math.max(0, Math.floor(Number(b.page) || 0));
    const shown = hit.slice(page * HISTORY_LIST_PAGE, (page + 1) * HISTORY_LIST_PAGE);
    const dir = await directorySet(db, shown.filter((r) => r.person_id !== null).map((r) => Number(r.person_id)));
    return { ok: true, full, rows: shown.map((r) => rowOut(r, full, r.person_id === null ? undefined : dir.has(Number(r.person_id)))),
      total: hit.length, page, pageSize: HISTORY_LIST_PAGE, years: yearsSummary(rows) };
  }

  // 「👥 묶어 보기」 — 못 맞춘 줄을 목장·이름 묶음으로(historyGroupsOf) · 해·찾기는 목록과 같다 · 쪽마다 HISTORY_GROUP_PAGE 묶음
  async function groups(ctx: HCtx, b: any) {
    const full = isFull(ctx);
    const rows = await all(() => db.from("ministry_history").select(ROW_COLS).is("deleted_at", null).order("id", { ascending: true }));
    const g = historyGroupsOf(rows, b, { full });
    if (g.error) return { ok: false, error: g.error };
    const page = Math.max(0, Math.floor(Number(b.page) || 0));
    return { ok: true, full, groups: g.groups.slice(page * HISTORY_GROUP_PAGE, (page + 1) * HISTORY_GROUP_PAGE),
      total: g.groups.length, rowsTotal: g.groups.reduce((s, x) => s + x.n, 0), nocand: g.nocand,
      page, pageSize: HISTORY_GROUP_PAGE, years: yearsSummary(rows) };
  }

  // 한 묶음을 한 번에 「이분」·「이분 아님」(줄마다 사람이 이음 · historyLinkPatch) — 후보 고르기는 줄 창과 같다(첫 줄의 차례 번호 + 지문 fp).
  //   바꾼 기록 history.linkgroup(줄 수·해만 · 이름·교인ID 없음). 쓴 뒤 같은 묶음의 다른 자동 줄만 다시 맞춘다(사람이 정한 것을 따르게).
  async function linkGroup(ctx: HCtx, b: any) {
    const op = b.op === "pick" || b.op === "none" ? b.op : "";
    const ids = Array.isArray(b.ids) ? [...new Set<number>(b.ids.map(idOf))].filter((n) => n > 0) : [];
    if (!op || !ids.length) return { ok: false, error: "invalid" };
    if (ids.length > HISTORY_GROUP_MAX) return { ok: false, error: "group-too-big" };
    const expect = new Map<number, string>((Array.isArray(b.expect) ? b.expect : []).map((x: any) => [idOf(x?.[0]), String(x?.[1] ?? "")]));
    const rows: any[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from("ministry_history").select(ROW_COLS + ",deleted_at").in("id", ids.slice(i, i + 100));
      if (error) throw error;
      rows.push(...(data ?? []).filter((r: any) => !r.deleted_at));
    }
    rows.sort((x, y) => x.year - y.year || x.id - y.id);
    const bad = groupLinkCheck(rows, ids, expect);
    if (bad) return { ok: false, error: bad };
    let pid: number | null = null;
    if (op === "pick") {
      const { list, fp } = await candidatesFor(db, rows[0]);
      const n = Number(b.pick);
      if (String(b.fp ?? "") !== fp || !Number.isInteger(n) || n < 0 || n >= list.length) return { ok: false, error: "candidates-changed" };
      pid = list[n].person_id;
    }
    const patch = historyLinkPatch(pid, ctx.member?.id ?? null, new Date().toISOString());
    let written = 0;
    for (const r of rows) {
      const { data, error } = await db.from("ministry_history").update(patch).eq("id", r.id).is("deleted_at", null)
        .eq("updated_at", r.updated_at).select("id");
      if (error) throw error;
      written += (data ?? []).length;
    }
    await audit(ctx, "history.linkgroup", String(rows[0].id),
      { op, n: written, of: rows.length, years: [...new Set(rows.map((r) => Number(r.year)))] });
    const rematched = written ? await tryRematch(rows.map((r) => Number(r.id)), "linkgroup") : true;   // 같은 묶음 자동 줄까지
    return { ok: true, written, of: rows.length, rematched };
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
    //   사람이 정한 줄(manual·none)의 목장·이름이 바뀌면 — 그 결정을 따르던 옛 묶음 자동 줄과 새 묶음 자동 줄을 다시 맞춘다(2026-10-05)
    const oldKey = mokNameKey(cur);
    const handMoved = cur.link_how !== "auto" && oldKey !== mokNameKey({ ...cur, ...t.row });
    const rematched = needRematch || handMoved ? await tryRematch([id], "edit", handMoved ? [oldKey] : []) : true;
    const fresh = await readRow(db, id);
    // 후보에 영향 줄 수 있는 칸(이름·직분·목장·팀·해·신규유지)을 고쳐 **실제로** 다시 맞춘 것도 이름을 떠본 것이다 —
    // 고치기로 명부를 찔러보는 흔적을 남긴다(2026-10-01 최종 검토 · 올리기 살펴보기와 같은 기준: 명부를 실제로 읽었을 때만).
    // rematched 가 false 면 명부가 없어 묻지 못했으니(noDirectory) 쓰지 않는다. candidatesFor 를 또 불러 후보 수를 세지 않고
    // (질의가 하나 더 든다), 이번 다시 맞추기로 이어졌는지만(0/1) 싣는다 — q 는 고친 뒤(지금) 이름.
    if (needRematch && rematched) {
      await audit(ctx, "people.lookup", "", { from: "history-edit", q: t.row.name, count: fresh && fresh.person_id !== null ? 1 : 0 });
    }
    const out: Record<string, unknown> = { ok: true, row: await outOrNull(db, fresh, isFull(ctx)) };
    if (needRematch || handMoved) out.rematched = rematched;
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
    // 사람이 정한 줄을 뺐으면 — 그 결정을 따르던 같은 목장·이름 자동 줄을 다시 맞춘다(2026-10-05)
    const key = cur.link_how !== "auto" ? mokNameKey(cur) : "";
    if (key) return { ok: true, rematched: await tryRematch([], "delete", [key]) };
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
    // 되돌리기(auto)는 이 줄을, 이분·이분 아님은 같은 목장·이름 자동 줄을 다시 맞춘다(2026-10-05 「같은 데이터도」 · rematchHistoryRows)
    const rematched = await tryRematch([id], "link");
    const out: Record<string, unknown> = { ok: true, row: await outOrNull(db, await readRow(db, id), isFull(ctx)) };
    out.rematched = rematched;
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
    const { hit: rows, years, q, only, error } = historyFilter(every, b, { full });
    if (error) return { ok: false, error };            // 목록과 같은 답(need-directory) · 기록 없음
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

  return { list, groups, upload, rowAdd, rowSave, rowDelete, candidates, link, linkGroup, rematch, exportRows };
}
