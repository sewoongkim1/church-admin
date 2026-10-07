// 봉사 당번 — 순수 규칙(2026-10-06 · 설계 v2 docs/superpowers/specs/2026-10-06-duty-roster-design.md §3·§4·§6)
//   서버(duty-db.ts)와 시험(tests/duty-rules.test.mjs)이 같은 파일을 읽는다 — Deno 전용 API·원격 import 금지 · enum 금지.
//   ⚠️ 정원·겹침·잠금·쉼은 여기 없다 — 성경암송 supabase/duty.sql 의 SQL 함수 한 곳(duty_apply·duty_cancel·duty_move·duty_day_set …).
//      여기는 입력 확인(당번·자리 틀·날짜) · 「누가 무엇을 고칠 수 있나」 · 응답 칸 지도 · 엑셀 줄만 맡는다.
//   ⚠️ 응답 칸 지도(boardOut·rosterOut)에 user_id·ident_key·confirmed_by 를 싣지 않는다 — SQL duty_roster 가 이미 싣지 않지만
//      여기서도 **칸을 하나씩 골라** 옮긴다(SQL 이 칸을 늘려도 화면으로 새지 않게).
import { norm } from "./authz.ts";
import { whoOf } from "./edu-rules.ts";

export const DUTY_STATUS = ["draft", "open", "closed", "archived"] as const;
export const DUTY_STATUS_LABEL: Record<string, string> = { draft: "준비 중", open: "받는 중", closed: "지원 멈춤", archived: "보관" };
// 당번 총괄 — 모든 당번을 만지는 역할(총괄 관리자 super 와 당번 총괄 duty). 그 밖(dutylead)은 맡은 당번만(duty-db.ts mayTouch).
export const DUTY_CHIEF_ROLES = ["super", "duty"];
export const dutyChief = (roles: unknown): boolean => Array.isArray(roles) && roles.some((r) => DUTY_CHIEF_ROLES.includes(String(r)));
// 담당자로 지정할 수 있는 역할 — 당번 담당(맡은 당번)이 본래 자리이고, 당번 총괄도 지정할 수 있다(이름을 카드에 적어 두려고)
export const DUTY_STAFF_ROLES = ["dutylead", "duty"];
export const DUTY_LIMITS: Record<string, number> = { title: 40, description: 1000, place: 40, contact_note: 60, service: 12, task: 20, note: 60, staff_note: 500 };
export const DUTY_WEEKDAYS = ["주일", "월", "화", "수", "목", "금", "토"];   // 0=주일 … 6=토(SQL extract(dow) 와 같다)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// 제어 글자(줄바꿈 포함) · 방향 바꿈 글자(U+061C · U+200E·F · U+202A~E · U+2066~9) · 줄·문단 가름(U+2028·9) — 한 줄짜리 칸에 넣지 않는다
//   (앱 화면·알림 글에 그대로 나간다 · 성경암송 duty.sql duty_name_out 과 같은 글자들)
const CTRL_RE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2066-\u2069]/;
// 여러 줄 글(설명·담당자 메모)용 — 줄바꿈·탭은 되고 널(\u0000 — DB 가 못 받는다)·그 밖의 제어·방향 바꿈 글자는 안 된다
const CTRL_ML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;
// 직접 적은 신원(새가족)의 칸에 제어 글자가 있는가 — checkTypedIdent(교육과 함께 쓰는 검사)는 | 와 길이만 본다
export const identHasCtrl = (ident: any): boolean => ["name", "who_type", "group_name", "sub_name"].some((k) => CTRL_RE.test(String(ident?.[k] ?? "")));

// 날짜 꼴 + 실제 날짜 + 해 범위(2000~2100 — 0000-01-01 같은 값은 JS 는 받지만 DB 가 못 받아 500 이 된다)
export function isDate(s: unknown): boolean {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  if (s < "2000-01-01" || s > "2100-12-31") return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
// 숫자 칸 — 숫자 또는 숫자 글자만(true·"3명" 같은 값이 숫자로 읽히지 않게)
function intOf(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (isInt(v)) return Number.isSafeInteger(v) ? v : undefined;
  if (typeof v === "string" && /^-?\d{1,15}$/.test(v.trim())) return Number(v.trim());
  return undefined;   // 틀린 값(안전한 정수 밖도 — DB 의 int·bigint 변환 오류가 500 이 되지 않게)
}

// 당번 입력 → DB 줄(duty_boards). 칸·제약은 성경암송 supabase/duty.sql 이 정한다.
//   거절: no-title · too-long · bad-char(한 줄 칸의 줄바꿈·제어 글자) · bad-days(7~370) · bad-date · bad-max(1~200) · bad-status
export function checkBoard(x: any): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const o = x && typeof x === "object" ? x : {};
  const txt = (k: string) => norm(o[k]);
  const description = (o.description ?? "").toString().normalize("NFC").trim();   // 설명은 줄바꿈을 살린다
  const title = txt("title");
  if (!title) return { ok: false, error: "no-title" };
  for (const k of ["title", "place", "contact_note"]) {
    if (txt(k).length > DUTY_LIMITS[k]) return { ok: false, error: "too-long" };
    if (CTRL_RE.test((o[k] ?? "").toString().trim())) return { ok: false, error: "bad-char" };
  }
  if (description.length > DUTY_LIMITS.description) return { ok: false, error: "too-long" };
  if (CTRL_ML.test(description)) return { ok: false, error: "bad-char" };
  const days = o.open_days === undefined ? 56 : intOf(o.open_days);
  if (days === undefined || days === null || days < 7 || days > 370) return { ok: false, error: "bad-days" };
  const until = txt("until_date");
  if (until && !isDate(until)) return { ok: false, error: "bad-date" };
  const max = intOf(o.max_ahead);
  if (max === undefined || (max !== null && (max < 1 || max > 200))) return { ok: false, error: "bad-max" };
  const status = txt("status") || "draft";
  if (!(DUTY_STATUS as readonly string[]).includes(status)) return { ok: false, error: "bad-status" };
  return { ok: true, row: { title, description, place: txt("place"), contact_note: txt("contact_note"), open_days: days,
    until_date: until || null, max_ahead: max, status } };
}

// 누가 무엇을 고칠 수 있나 — 총괄은 전부. 담당(맡은 당번)은 이름과 「준비·보관」을 못 건드린다:
//   이름이 바뀌었거나 · 상태가 바뀌었는데 받는 중↔지원 멈춤이 아니면 chief-only(forbidden 이 아니다 — 화면이 forbidden 을 받으면 통째로 다시 부팅한다).
export function boardPatchFor(chief: boolean, before: { title?: string; status?: string }, row: Record<string, unknown>):
  { ok: true; patch: Record<string, unknown> } | { ok: false; error: string } {
  if (chief) return { ok: true, patch: { ...row } };
  if (norm(before?.title) !== row.title) return { ok: false, error: "chief-only" };
  const was = String(before?.status ?? ""), now = String(row.status ?? "");
  const pause = ["open", "closed"];
  if (was !== now && !(pause.includes(was) && pause.includes(now))) return { ok: false, error: "chief-only" };
  return { ok: true, patch: { ...row } };
}

// 앱에서 안 보이게 되는 바꿈인가(받는 중·지원 멈춤 → 준비·보관) — 앞날에 선 분이 있으면 확인을 한 번 더 받는다(has-upcoming)
export function hidesFromApp(was: unknown, now: unknown): boolean {
  const seen = ["open", "closed"], hidden = ["draft", "archived"];
  return seen.includes(String(was)) && hidden.includes(String(now));
}

// 자리 틀 입력 → SQL duty_line_save 의 p_line. 검사는 SQL 과 같은 규칙(여기서 먼저 걸러 한국말로 답한다).
//   {id?, service, task, start, end, capacity, weekday(0~6 | null = 날짜를 골라 넣는 줄), sort}
//   거절: bad-id · no-service · too-long · bad-char · bad-time(꼴·시작이 끝보다 늦음 — 자정을 넘는 자리는 23:59 에서 끊는다) · bad-capacity · bad-weekday · bad-sort
export function checkLine(x: any): { ok: true; line: Record<string, unknown> } | { ok: false; error: string } {
  const o = x && typeof x === "object" ? x : {};
  const id = intOf(o.id);
  if (id === undefined || (id !== null && id < 1)) return { ok: false, error: "bad-id" };
  const service = norm(o.service), task = norm(o.task);
  if (!service) return { ok: false, error: "no-service" };
  if (service.length > DUTY_LIMITS.service || task.length > DUTY_LIMITS.task) return { ok: false, error: "too-long" };
  if (CTRL_RE.test((o.service ?? "").toString().trim()) || CTRL_RE.test((o.task ?? "").toString().trim())) return { ok: false, error: "bad-char" };
  const start = norm(o.start), end = norm(o.end);
  if (!TIME_RE.test(start) || !TIME_RE.test(end) || !(start < end)) return { ok: false, error: "bad-time" };
  const capacity = intOf(o.capacity);
  if (capacity === undefined || capacity === null || capacity < 1 || capacity > 200) return { ok: false, error: "bad-capacity" };
  const weekday = intOf(o.weekday);
  if (weekday === undefined || (weekday !== null && (weekday < 0 || weekday > 6))) return { ok: false, error: "bad-weekday" };
  const sort = intOf(o.sort);
  if (sort === undefined || (sort !== null && (sort < -999 || sort > 999))) return { ok: false, error: "bad-sort" };
  return { ok: true, line: { ...(id ? { id } : {}), service, task, start, end, capacity, weekday, sort: sort ?? 0 } };
}

// 틀 id 목록(날짜 더하기) — 양의 정수 · 겹친 것은 하나로 · 1~50개
export function checkLineIds(x: unknown): { ok: true; ids: number[] } | { ok: false; error: string } {
  if (!Array.isArray(x) || !x.length) return { ok: false, error: "bad-lines" };
  const ids: number[] = [];
  for (const v of x) {
    const n = intOf(v);
    if (n === undefined || n === null || n < 1) return { ok: false, error: "bad-lines" };
    if (!ids.includes(n)) ids.push(n);
  }
  return ids.length > 50 ? { ok: false, error: "bad-lines" } : { ok: true, ids };
}

// 한 줄 글(날짜 메모 60자 · 담당자 메모 500자) — NFC · 앞뒤 빈칸 · 메모는 줄바꿈을 살린다
export function checkNote(x: unknown, max: number, oneLine: boolean): { ok: true; note: string } | { ok: false; error: string } {
  if (typeof x !== "string") return { ok: false, error: "bad-note" };
  const note = x.normalize("NFC").trim();
  if (note.length > max) return { ok: false, error: "too-long" };
  if (oneLine ? CTRL_RE.test(note) : CTRL_ML.test(note)) return { ok: false, error: "bad-char" };
  return { ok: true, note };
}

// ---------- 응답 칸 지도 ----------
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

// 당번 한 줄(duty_boards) + 요약 수(duty_board_counts) + 담당자 + 살아 있는 자리 틀(duty_lines 줄) → 화면 칸
//   counts.after = 끝 날짜 뒤에 살아 있는 지원 수(그 자리는 앱에 안 보인다 — 담당자가 옮기거나 뺀다) · counts.shown = 앱이 보여 주는 기간의 자리 수
export function boardOut(r: any, counts: any = {}, staff: { id?: string; name: string; stale?: boolean }[] = [], lines: any[] = []) {
  return {
    id: r.id, title: str(r.title), description: str(r.description), place: str(r.place), contact: str(r.contact_note),
    openDays: num(r.open_days) || 56, untilDate: r.until_date || null, maxAhead: r.max_ahead ?? null,
    status: str(r.status), statusLabel: DUTY_STATUS_LABEL[r.status] || str(r.status), updatedAt: r.updated_at || null,
    counts: { lines: num(counts?.lines), slots: num(counts?.slots), need: num(counts?.need), asks: num(counts?.asks), active: num(counts?.active),
      after: num(counts?.after),
      // shown = 성도님 앱 당번표가 보여 주는 기간의 자리 수(duty_board_counts — 0 이면 앱에 날짜가 안 보인다). SQL 이 줄 때만 싣는다 — 옛 SQL 이면 칸이 없고 화면은 slots 로 본다
      ...(counts?.shown === undefined || counts?.shown === null ? {} : { shown: num(counts.shown) }) },
    // 담당자 — 총괄에게는 {id, name}, 담당에게는 이름만(duty-db.ts 가 staffNames 로 id 를 뗀 목록을 넘긴다 — id 칸을 아예 싣지 않는다)
    staff: (staff || []).map((x: any) => ({ ...(x.id ? { id: x.id } : {}), name: x.name, ...(x.stale === true ? { stale: true } : {}) })),
    lines: (lines || []).map(lineRowOut).sort(lineOrder),
  };
}
// 당번 목록 차례 — 받는 중 → 지원 멈춤 → 준비 중 → 보관, 같으면 이름(가나다)
const BOARD_STATUS_ORDER: Record<string, number> = { open: 0, closed: 1, draft: 2, archived: 3 };
export const boardOrder = (a: { status: string; title: string; id: string }, z: { status: string; title: string; id: string }): number =>
  (BOARD_STATUS_ORDER[a.status] ?? 9) - (BOARD_STATUS_ORDER[z.status] ?? 9) || a.title.localeCompare(z.title, "ko") || (a.id < z.id ? -1 : a.id > z.id ? 1 : 0);
// duty_lines 줄(start_time·end_time 은 "HH:MM:SS") → 화면 칸 · 차례는 SQL duty_roster 와 같다(시작 시각 → sort → id)
const hm = (t: unknown): string => str(t).slice(0, 5);
export const lineRowOut = (l: any) => ({ id: num(l?.id), sort: num(l?.sort), service: str(l?.service), task: str(l?.task), start: hm(l?.start_time),
  end: hm(l?.end_time), capacity: num(l?.capacity), weekday: l?.weekday === null || l?.weekday === undefined ? null : num(l.weekday), active: l?.active !== false });
export const lineOrder = (a: { start: string; sort: number; id: number }, z: { start: string; sort: number; id: number }): number =>
  (a.start < z.start ? -1 : a.start > z.start ? 1 : 0) || a.sort - z.sort || a.id - z.id;

// duty_board_staff 줄(admin_members(name,status) 을 붙여 읽은 것) → 당번 id 별 [{id, name, stale?}](이름 차례)
//   holders = 지금 당번 역할(dutylead·duty)을 가진 담당자 id 들. 사용 중이 아니거나 그 역할이 없으면 stale:true(줄은 남긴다 — 교육과 같다).
export function staffByBoard(rows: any[], holders: Set<string> = new Set()): Map<string, { id: string; name: string; stale?: true }[]> {
  const by = new Map<string, { id: string; name: string; stale?: true }[]>();
  for (const r of rows || []) {
    if (!r?.board_id || !r?.member_id) continue;
    const list = by.get(r.board_id) || [];
    const stale = r.admin_members?.status !== "active" || !holders.has(String(r.member_id));
    list.push(stale ? { id: r.member_id, name: norm(r.admin_members?.name), stale: true } : { id: r.member_id, name: norm(r.admin_members?.name) });
    by.set(r.board_id, list);
  }
  for (const list of by.values()) list.sort((a, b) => a.name.localeCompare(b.name, "ko") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return by;
}

const lineOut = (l: any) => ({ id: num(l?.id), sort: num(l?.sort), service: str(l?.service), task: str(l?.task), start: str(l?.start), end: str(l?.end),
  capacity: num(l?.capacity), weekday: l?.weekday === null || l?.weekday === undefined ? null : num(l.weekday), active: l?.active !== false });

// 담당자 목록을 이름만으로 — 당번 담당(맡은 당번)에게는 담당자 id(admin_members.id)를 싣지 않는다(id 는 총괄의 담당자 고르기에만 쓴다)
export const staffNames = (list: { id?: string; name: string; stale?: boolean }[]) =>
  (list || []).map((x) => (x.stale === true ? { name: x.name, stale: true } : { name: x.name }));

// 같은 날 「이름은 같은데 같은 분인지 모르는」 줄 — pk(SQL 이 응답마다 새로 섞어 주는 표식)가 다른데 다듬은 이름이 같은 살아 있는 줄들의 id.
//   같은 분이 1부·2부를 함께 서는 것(pk 가 같다)은 고르지 않는다. 앱 줄과 담당자가 넣은 줄 · 옛 계정과 새 계정을 잡는다.
export function sameNameIds(signups: { id: number; name?: string; pk?: string }[]): Set<number> {
  const by = new Map<string, { pks: Set<string>; ids: number[] }>();
  for (const e of signups || []) {
    const key = norm(e?.name).replace(/\s+/g, "");
    if (!key) continue;
    const g = by.get(key) || { pks: new Set<string>(), ids: [] };
    g.pks.add(str(e?.pk)); g.ids.push(num(e?.id));
    by.set(key, g);
  }
  const out = new Set<number>();
  for (const g of by.values()) if (g.pks.size > 1) for (const id of g.ids) out.add(id);
  return out;
}

// SQL duty_roster 의 jsonb → 화면 응답. 칸을 하나씩 골라 옮긴다(pk 는 「같은 분일 수 있어요」를 정한 뒤 버린다).
export function rosterOut(j: any) {
  const b = j?.board || {};
  const days = (Array.isArray(j?.days) ? j.days : []).map((d: any) => {
    const slots = Array.isArray(d?.slots) ? d.slots : [];
    const dup = sameNameIds(slots.flatMap((s: any) => (Array.isArray(s?.signups) ? s.signups : [])));
    return {
      date: str(d?.date), off: d?.off === true, note: str(d?.note), confirmed: d?.confirmed === true, locked: d?.locked === true,
      cutoff: d?.cutoff || null, past: d?.past === true, afterUntil: d?.afterUntil === true, notYet: d?.notYet === true,
      need: num(d?.need), asks: num(d?.asks),
      slots: slots.map((s: any) => ({
        id: num(s?.id), lineId: num(s?.lineId), service: str(s?.service), task: str(s?.task), start: str(s?.start), end: str(s?.end),
        capacity: num(s?.capacity), off: s?.off === true, leftover: s?.leftover === true,
        signups: (Array.isArray(s?.signups) ? s.signups : []).map((e: any) => ({
          id: num(e?.id), name: str(e?.name), who: whoOf({ who_type: e?.whoType, group_name: e?.group, sub_name: e?.sub }),
          source: e?.source === "staff" ? "staff" : "app", hasApp: e?.hasApp === true, hasPush: e?.hasPush === true, note: str(e?.note),
          moved: e?.moved === true, asked: e?.asked === true, why: e?.why || null, appliedAt: e?.appliedAt || null, afterLock: e?.afterLock === true,
          overlap: e?.overlap === true, maybeDup: dup.has(num(e?.id)),
        })),
        ended: (Array.isArray(s?.ended) ? s.ended : []).map((e: any) => ({
          id: num(e?.id), name: str(e?.name), who: whoOf({ who_type: e?.whoType, group_name: e?.group, sub_name: e?.sub }),
          source: e?.source === "staff" ? "staff" : "app", hasApp: e?.hasApp === true, status: str(e?.status), reason: e?.reason || null, endedAt: e?.endedAt || null,
        })),
      })),
    };
  });
  return {
    today: str(j?.today), from: str(j?.from), to: str(j?.to),
    board: { id: b.id, title: str(b.title), description: str(b.description), place: str(b.place), contact: str(b.contact), openDays: num(b.openDays) || 56,
      untilDate: b.untilDate || null, maxAhead: b.maxAhead ?? null, status: str(b.status), statusLabel: DUTY_STATUS_LABEL[b.status] || str(b.status),
      updatedAt: b.updatedAt || null },      // 설정 창이 dutyBoardSave 의 base 로 되돌려 보낸다(그사이 다른 분이 고쳤는지)
    lines: (Array.isArray(j?.lines) ? j.lines : []).map(lineOut),
    days,
  };
}

// 겹침 답(duty_apply·duty_move 의 overlap.with)을 담당자 화면에 실을 만큼만 — 같은 당번이면 자리 이름, 다른 당번이면 「다른 당번」뿐
//   (맡지 않은 당번의 이름·자리를 싣지 않는다).
export function overlapForStaff(w: any): { same: boolean; label: string } {
  if (w?.same_board === true) {
    return { same: true, label: [str(w.service), str(w.task)].filter(Boolean).join(" ") + (w.start ? " " + str(w.start) : "") };
  }
  return { same: false, label: "" };
}

// 옮기기 답의 자리(duty_move 의 from·to) — 칸을 골라 옮긴다
export const placeOut = (p: any) => ({ date: str(p?.date), service: str(p?.service), task: str(p?.task), start: str(p?.start) });

// ---------- 엑셀 ----------
const mdw = (d: string): string => {
  if (!isDate(d)) return "";
  const t = new Date(d + "T00:00:00Z");
  return `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일(${"일월화수목금토".charAt(t.getUTCDay())})`;
};
export const slotLabel = (s: { service?: string; task?: string }): string => [str(s?.service), str(s?.task)].filter(Boolean).join(" ");

// 엑셀 두 시트 — rosterOut 결과를 받는다.
//   「당번표」: 한 줄 = 날짜 · 칸 = 자리 틀(시작 시각·차례 순으로 그 기간에 자리가 있는 틀) · 값 = 이름들(가나다) + 빈 자리 수만큼 「(빈 자리)」
//              (쉼표로 잇는다 — 줄바꿈은 엑셀에서 「줄 바꿈」을 켜야 보인다) ·
//              끝 칸 = 상태(확정·쉬는 날·메모). **이름만** — 벽에 붙이는 표다(소속·넣은 곳·메모·앱 여부를 싣지 않는다).
//   「명단」  : 한 분 한 줄 — 날짜·자리·시각·이름·소속·넣은 곳(담당자용 · 메모는 싣지 않는다 — 파일째 돌려도 되게).
export function exportSheets(r: { board: { title: string }; days: any[]; lines?: any[] }): { table: string[][]; list: string[][] } {
  const cols: { id: number; label: string }[] = [];
  const order = new Map<number, number>();
  (r.lines || []).forEach((l: any, i: number) => order.set(num(l.id), i));
  const seen = new Set<number>();
  for (const d of r.days || []) for (const s of d.slots || []) {
    if (!seen.has(s.lineId)) { seen.add(s.lineId); cols.push({ id: s.lineId, label: slotLabel(s) + (s.start ? ` ${s.start}` : "") }); }
  }
  cols.sort((a, z) => (order.get(a.id) ?? 999) - (order.get(z.id) ?? 999));
  const table: string[][] = [["날짜", ...cols.map((c) => c.label), "상태"]];
  const list: string[][] = [["당번", "날짜", "자리", "시각", "이름", "소속", "넣은 곳"]];
  for (const d of r.days || []) {
    const byLine = new Map<number, any>((d.slots || []).map((s: any) => [s.lineId, s]));
    const cells = cols.map((c) => {
      const s = byLine.get(c.id);
      if (!s) return "";
      if (d.off || s.off) return "쉼";
      const names = (s.signups || []).map((e: any) => e.name);
      const empty = Math.max(0, num(s.capacity) - names.length);
      return [...names, ...Array(empty).fill("(빈 자리)")].join(", ");
    });
    const state = [d.off ? "쉬는 날" : d.locked ? "확정" : "", str(d.note)].filter(Boolean).join(" · ");
    table.push([mdw(d.date), ...cells, state]);
    if (d.off) continue;
    for (const s of d.slots || []) {
      if (s.off) continue;
      for (const e of s.signups || []) {
        list.push([str(r.board?.title), mdw(d.date), slotLabel(s), [s.start, s.end].filter(Boolean).join("~"), e.name, e.who, e.source === "staff" ? "담당자" : "앱"]);
      }
    }
  }
  return { table, list };
}

// ---------- 👥 봉사자(사람별 봉사 이력 · 2026-10-07 친구 요청) ----------
//   SQL duty_people(성경암송 supabase/duty.sql)의 jsonb → 화면 응답. 칸을 하나씩 골라 옮긴다 — SQL 이 칸을 늘려도 신원 칸(user_id·ident_key·교인ID)이
//   화면으로 새지 않게. 사람을 가리키는 것은 지원 번호(id — 명단에 이미 보이는 번호)뿐이다.
export const PEOPLE_KINDS = ["served", "upcoming", "missed"];
export const PEOPLE_WHYS = ["self", "staff", "off-day", "off-slot", "archived"];
const ASK_WHYS = ["cant", "mistake", "notme"];
const cnt = (v: unknown): number => { const x = Math.floor(Number(v)); return Number.isFinite(x) && x > 0 ? x : 0; };
const idOf = (v: unknown): number => { const x = Number(v); return Number.isSafeInteger(x) && x > 0 ? x : 0; };
const dayOrNull = (v: unknown): string | null => (isDate(v) ? String(v) : null);
// 「그해」 — 2000~2100 의 정수만(그 밖은 null — SQL 이 올해로 본다)
export const yearOf = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 2000 && v <= 2100 ? v : null);

// 사람 목록 — {today, year, people: [{id, name, who, hasApp, directory, served, inYear, upcoming, last, next}]} (SQL 의 차례 그대로 · 번호 없는 줄은 버린다)
export function peopleOut(j: any) {
  const people = (Array.isArray(j?.people) ? j.people : []).filter((p: any) => idOf(p?.id)).map((p: any) => ({
    id: idOf(p.id), name: str(p?.name), who: whoOf({ who_type: str(p?.whoType), group_name: str(p?.group), sub_name: str(p?.sub) }),
    hasApp: p?.hasApp === true, directory: p?.directory === true,
    served: cnt(p?.served), inYear: Math.min(cnt(p?.inYear), cnt(p?.served)), upcoming: cnt(p?.upcoming), last: dayOrNull(p?.last), next: dayOrNull(p?.next),
  }));
  return { today: dayOrNull(j?.today) || "", year: yearOf(j?.year), people };
}

// 한 분의 이력 — {today, year, person, served, inYear, upcoming, total, rows: [가까운 날부터 · 400줄까지]}
//   kind: served(섰던 날 — 끝난 자리) · upcoming(앞으로 — 안 끝난 자리) · missed(빠진 기록 — why: self 본인 취소 · staff 담당자가 뺌 · off-day · off-slot · archived 보관한 뒤의 자리)
export function historyOut(j: any) {
  const p = j?.person || {};
  const rows = (Array.isArray(j?.rows) ? j.rows : []).filter((r: any) => isDate(r?.date) && idOf(r?.id)).slice(0, 400).map((r: any) => {
    const kind = PEOPLE_KINDS.includes(r?.kind) ? r.kind : "missed";
    return {
      id: idOf(r.id), date: String(r.date), board: str(r?.board), boardStatus: (DUTY_STATUS as readonly string[]).includes(r?.boardStatus) ? r.boardStatus : "",
      service: str(r?.service), task: str(r?.task), start: str(r?.start), end: str(r?.end), kind,
      why: kind === "missed" && PEOPLE_WHYS.includes(r?.why) ? r.why : null, off: r?.off === true,
      asked: r?.asked === true, askWhy: r?.asked === true && ASK_WHYS.includes(r?.askWhy) ? r.askWhy : null,
      moved: r?.moved === true, source: r?.source === "staff" ? "staff" : "app",
    };
  });
  const served = cnt(j?.served);
  return {
    today: dayOrNull(j?.today) || "", year: yearOf(j?.year),
    person: { name: str(p.name), who: whoOf({ who_type: str(p.whoType), group_name: str(p.group), sub_name: str(p.sub) }), hasApp: p.hasApp === true, directory: p.directory === true },
    served, inYear: Math.min(cnt(j?.inYear), served), upcoming: cnt(j?.upcoming), total: Math.max(cnt(j?.total), rows.length), rows,
  };
}

// 엑셀 「봉사자」 시트 — peopleOut 결과를 받는다. 한 분 한 줄: 이름 · 소속 · 그해 · 지금까지 · 마지막으로 선 날 · 앞으로(수는 수로 — 엑셀에서 더하고 고를 수 있게).
//   계정·명부 여부·메모는 싣지 않는다(파일째 돌려도 되게 — 「명단」 시트와 같다).
//   선 날도 앞으로 설 날도 없는 분(취소·빠짐만 있는 분)은 싣지 않는다 — 0·0·빈칸·0 한 줄은 받는 분에게 뜻이 없다(독립 검토 반영 · 「안내」 시트가 그렇게 말한다).
export const peopleIdle = (p: any): boolean => !(cnt(p?.served) > 0 || cnt(p?.upcoming) > 0);
export function peopleSheet(r: { year: number | null; people: any[] }, thisYear: number): (string | number)[][] {
  const y = r.year ?? thisYear;
  return [["이름", "소속", `${y}년`, "지금까지", "마지막으로 선 날", "앞으로"],
    ...(r.people || []).filter((p: any) => !peopleIdle(p))
      .map((p: any) => [str(p.name), str(p.who), cnt(p.inYear), cnt(p.served), p.last ? String(p.last) : "", cnt(p.upcoming)])];
}
// 엑셀 「안내」 시트 — 파일만 받은 분이 무엇을 센 수인지 알 수 있게(범위 · 기준일 · 낱말의 뜻). 이름 없음.
//   scopeText = 「〈당번 이름〉 당번」 · 「모든 당번 5개」 · 「맡은 당번 2개」(duty-db.ts 가 정한다)
export function peopleInfoSheet(o: { scopeText: string; today: string; year: number; hidden: number }): string[][] {
  return [["범위", str(o.scopeText)], ["기준일", str(o.today)], ["횟수의 해", `${o.year}년(그 밖의 칸은 해와 상관없어요)`],
    ["지금까지", "이름이 남은 채 끝난 자리의 수 — 쉬는 날·쉬는 자리, 당번을 보관한 뒤의 자리는 세지 않아요"],
    ["앞으로", "아직 끝나지 않은 자리의 수 — 쉬는 날·쉬는 자리는 빼고"],
    ["이 파일에 없는 분", o.hidden > 0 ? `선 날도 앞으로 설 날도 없는 ${o.hidden}분(취소했거나 빠진 기록만 있는 분)` : "없음"],
    ["성도님 앱과 다른 점", "준비 중 당번과 명부에서 넣은 줄도 세고 오늘 끝난 자리도 바로 세어서, 앱 「지난 봉사」의 수보다 클 수 있어요"]];
}

// 성경암송 api internalDutyNotify 의 답 → {sent, missed, off[, held]} · null = 부르지 못했다(index.ts notifyDuty 가 쓴다 — 시험하려고 여기 둔다).
//   sent = 실제로 나간 분 수 · missed = 가지 않은 분 수(받는 기기가 없다 · 자기 기기가 모두 실패) · off = 알림을 꺼 두었다(성경암송 app_config dutyNotifyOff) ·
//   held = 꺼 둔 동안 「꺼 두지 않았으면 보냈을 분 수」(0 이면 알릴 분이 없던 저장이다 — 수가 아니면 싣지 않는다: 모르는 것으로).
//   ⚠️ 옛 api 는 missed·off·held 를 주지 않는다(0·false·없음으로 읽는다).
export function dutyNotifyOut(j: any): { sent: number; missed: number; off: boolean; held?: number } | null {
  if (!j) return null;
  const out: { sent: number; missed: number; off: boolean; held?: number } = { sent: Number(j.sent) || 0, missed: Number(j.missed) || 0, off: j.off === true };
  if (out.off && typeof j.held === "number" && Number.isFinite(j.held) && j.held >= 0) out.held = Math.floor(j.held);
  return out;
}
