// 교회 어드민 — 📖 성경암송 기록(2026-10-15 친구 요청 「교인카드 안에 성경암송 기록도」): 교인 → 앱 계정 찾기 · 기록 요약(순수 함수)
//   서버(Deno, index.ts memoOf)와 시험(Node, tests/memo-rec.test.mjs)이 **같은 파일**을 읽는다 — 원격 import·enum 금지.
//   쓰는 곳: 교인명부 「자세히」 창의 📖 성경암송 탭(history.memo) · 🏠 심방 준비 한 장(본인 · 가족).
//   ⚠️ **총괄(super)만** — 성경암송 방침 「암송 기록은 본인과 운영진(신앙운동팀)이 봅니다」(v2 privacy/). 다른 역할에 열려면
//      방침 문장부터(플레이 심사 중에는 방침을 고치지 않는다). 서버가 ctx.roles 로 정한다(peoplePerson · visitCard 는 이미 총괄만).
//   계정 찾기 — 둘 중 하나:
//     ① 확인 번호로 이은 계정(life_pins person_how auto · staff — 교인카드의 「🔐 성경암송 본인 확인됨」과 같은 줄)
//     ② 이름 · 소속이 같은 계정 — 앱 계정(users)의 이름 · 교구 · 목장(교회학교는 부서)을 사역신청 줄처럼 교적과 맞대(autoLink ·
//        같은 소속이 이분 한 분일 때만) 이분께 오면. 번호는 쓰지 않는다(앱 계정에 번호가 없다).
//        ⚠️ 확인 번호로 **다른 분께** 이어진 계정은 ②에서 뺀다(사람이 확인한 것을 이름이 뒤집지 않는다).
//   ⚠️ user_id 는 응답에 싣지 않는다(이 API 는 user_id 하나로 그 사람 행세가 된다 — v2 CLAUDE.md 「보안」).
import { autoLink, type LinkCand } from "./people-links.ts";
import { applicantFromWho, nameKey } from "./people-match.ts";

const s = (v: unknown): string => String(v ?? "").normalize("NFC").trim();
export const MEMO_HOW_PIN = "본인 확인";
export const MEMO_HOW_NAME = "이름 · 소속이 같음";
export const MEMO_RECENT = 5;            // 최근 다 마친 말씀 몇 개까지

// 앱 계정의 소속 글 — 교회 어드민 index.ts appUserWho 와 같다(「화평 20목장」 · 「고등부 1학년」)
export const appWho = (u: any): string =>
  (u?.type === "교구" ? [u?.gu, u?.mok ? u.mok + "목장" : ""] : [u?.bu, u?.grade]).map(s).filter(Boolean).join(" ");

// 구절 번호의 갈래 — v2 isPsalmNo(1001~1999 쉴만한 물가) · 2001~ 주제별(네비게이토) · 그 밖 주간 말씀
export function verseKind(no: unknown): "weekly" | "psalm" | "navi" {
  const n = Number(no);
  if (n >= 1001 && n <= 1999) return "psalm";
  if (n >= 2001) return "navi";
  return "weekly";
}

// 한국 날짜(YYYY-MM-DD) — timestamptz 를 한국 시간으로
export function kstDay(iso: unknown): string {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
}

export type MemoPin = { user_id: string; person_id: number | null; person_how: string };
const pinned = (p: MemoPin) => p.person_how === "auto" || p.person_how === "staff";

// 이분(person)의 앱 계정 — users = 앱 계정들(이름이 같은 분만 넘겨도 된다) · cands = 이 이름의 명부 후보(toLinkCand) ·
//   pins = 이분 · 이 계정들의 life_pins 줄. 차례: 확인 번호 먼저, 그다음 이름 · 소속.
export function memoAccountsFor(person: { person_id: number; name: string }, users: any[], cands: LinkCand[], pins: MemoPin[]):
  { user: any; how: string }[] {
  const id = Number(person?.person_id);
  const key = nameKey(person?.name);
  const byId = new Map<string, any>((users ?? []).map((u) => [String(u?.id), u]));
  const out: { user: any; how: string }[] = [];
  const seen = new Set<string>();
  for (const p of pins ?? []) {
    if (!pinned(p) || Number(p.person_id) !== id) continue;
    const u = byId.get(String(p.user_id));
    if (!u || seen.has(String(u.id))) continue;
    seen.add(String(u.id));
    out.push({ user: u, how: MEMO_HOW_PIN });
  }
  if (!key) return out;
  const elsewhere = new Set((pins ?? []).filter((p) => pinned(p) && p.person_id !== null && Number(p.person_id) !== id).map((p) => String(p.user_id)));
  const mine = (cands ?? []).filter((c) => c && Number.isSafeInteger(c.person_id));
  for (const u of users ?? []) {
    const uid = String(u?.id ?? "");
    if (!uid || seen.has(uid) || elsewhere.has(uid) || nameKey(u?.name) !== key) continue;
    const l = autoLink(mine, applicantFromWho(u?.name, appWho(u), ""));
    if (l.person_id !== id) continue;
    seen.add(uid);
    out.push({ user: u, how: MEMO_HOW_NAME });
  }
  return out;
}

export type MemoSummary = {
  accounts: { name: string; who: string; how: string; joined: string; lastSeen: string }[];
  done: number; doneWeekly: number; donePsalm: number; doneNavi: number;   // 다 마친 말씀(3단계 · 한 구절은 한 번 — 한글 · 영어를 함께 센다)
  started: number;                                                          // 1단계라도 마친 말씀
  days: number; days30: number; firstDay: string; lastDay: string;          // 활동한 날(집계표 daily_activity · 한국 날짜)
  learn: number; challenge: number;                                         // 암송(learn-*) · 도전(그 밖 — 복습 포함) 횟수
  recent: { ref: string; day: string }[];                                   // 최근 다 마친 말씀(MEMO_RECENT 개)
};

// accounts = memoAccountsFor 의 결과 · progress = 그 계정들의 progress 줄(user_id · verse_no · stage · updated_at) ·
//   activity = daily_activity 줄(day · user_id · mode · cnt) · refs = 구절 번호 → 출처 글 · today = 한국 날짜
export function memoSummary(accounts: { user: any; how: string }[], progress: any[], activity: any[], refs: Map<number, string>, today: string): MemoSummary {
  const ids = new Set((accounts ?? []).map((a) => String(a.user?.id)));
  const best = new Map<number, { stage: number; at: string }>();
  for (const r of progress ?? []) {
    if (!ids.has(String(r?.user_id))) continue;
    const no = Number(r?.verse_no), st = Number(r?.stage) || 0;
    if (!Number.isSafeInteger(no)) continue;
    const cur = best.get(no);
    const at = s(r?.updated_at);
    if (!cur || st > cur.stage || (st === cur.stage && at > cur.at)) best.set(no, { stage: st, at });
  }
  const doneList = [...best.entries()].filter(([, v]) => v.stage >= 3);
  const kinds = { weekly: 0, psalm: 0, navi: 0 };
  for (const [no] of doneList) kinds[verseKind(no)]++;
  const from30 = new Date(Date.parse(today + "T00:00:00Z") - 29 * 86400_000).toISOString().slice(0, 10);
  const days = new Set<string>(), days30 = new Set<string>();
  let learn = 0, challenge = 0;
  for (const a of activity ?? []) {
    if (!ids.has(String(a?.user_id))) continue;
    const d = s(a?.day).slice(0, 10), n = Number(a?.cnt) || 0;
    if (!d || n <= 0) continue;
    days.add(d);
    if (d >= from30 && d <= today) days30.add(d);
    if (s(a?.mode).startsWith("learn-")) learn += n; else challenge += n;
  }
  const dayList = [...days].sort();
  const recent = doneList.sort((a, b) => (a[1].at < b[1].at ? 1 : a[1].at > b[1].at ? -1 : b[0] - a[0])).slice(0, MEMO_RECENT)
    .map(([no, v]) => ({ ref: refs.get(no) || `${no}번 말씀`, day: kstDay(v.at) }));
  return {
    accounts: (accounts ?? []).map((a) => ({ name: s(a.user?.name), who: appWho(a.user), how: a.how,
      joined: kstDay(a.user?.created_at), lastSeen: kstDay(a.user?.last_seen_at) })),
    done: doneList.length, doneWeekly: kinds.weekly, donePsalm: kinds.psalm, doneNavi: kinds.navi,
    started: [...best.values()].filter((v) => v.stage >= 1).length,
    days: days.size, days30: days30.size, firstDay: dayList[0] ?? "", lastDay: dayList[dayList.length - 1] ?? "",
    learn, challenge, recent,
  };
}

// 출처를 물을 구절 번호 — 다 마친(3단계) 말씀 전부(여러 분의 progress 줄을 한 번에 · 서버가 verses 에 묻는다)
export function doneVerseNos(progress: any[]): number[] {
  const out = new Set<number>();
  for (const r of progress ?? []) {
    const no = Number(r?.verse_no);
    if (Number(r?.stage) >= 3 && Number.isSafeInteger(no)) out.add(no);
  }
  return [...out].sort((x, y) => x - y);
}

// 교인명부 「자세히」 창의 탭 자료(history)에 성경암송 칸을 붙인다 — 수는 「다 마친 말씀」. memo 가 없으면(총괄이 아님 · 읽기 실패) 그대로.
export function withMemoTab<H extends { counts: Record<string, number> }>(h: H | null, memo: MemoSummary | null | undefined): H | null {
  if (!h || !memo) return h;
  return { ...h, counts: { ...h.counts, memo: memo.done }, memo } as H;
}
