# 「📋 종이 명단 올리기」 화면 — 레거시 추출 (읽기 전용 조사)

대상: `admin-stats.html`(성경암송 v2, `renderMinistryPaper` 및 부속) + `supabase/functions/api/index.ts`
(`ministryPaperCheck`/`ministryPaperSave` → `ministryPaper(b, save)` 및 헬퍼, `member_login` RPC 호출 경로) +
`supabase/*.sql`(`ministry_orders` 테이블 중 종이 명단이 실제로 건드리는 칸의 이력, `member_login` RPC 정의).
범위 밖: 신청현황(`renderMinistryAdmin`, → `docs/port/ministry-status-legacy.md`) · 임명현황 · 담당자 ·
🗂️ 사역팀 정보(`renderMinistryCatalog` → `docs/port/ministry-catalog-legacy.md`, 같은 조사에서 함께 뽑음).

> 참고 원본: `C:\Projects\bible-memorize-church-app-v2\docs\notes\ministry-2027.md`,
> `C:\Projects\bible-memorize-church-app-v2\docs\notes\ministry-admin-ui.md` — 둘 다 전문을 읽고 아래
> 체크리스트에 반영했다. 줄 번호는 여러 세션이 함께 고치는 파일이라 **함수/선택자 이름으로 다시 찾을 것**
> (이 문서 작성 시점 스냅샷).

---

## 1. 서버 액션 (`supabase/functions/api/index.ts`)

### 1.0 게이트 — `ministryAdminError`(두 액션 모두의 첫 줄에서 호출)

`index.ts:167-172`(밑에 깔린 관리자 확인):
```ts
// 관리자 비밀 확인 → null이면 통과, 아니면 에러코드
function adminError(b: any): string | null {
  const secret = Deno.env.get("ADMIN_SECRET");
  if (!secret) return "no-password-set";
  if ((b.pw ?? "") !== secret) return "unauthorized";
  return null;
}
```

`index.ts:184-191`:
```ts
async function ministryAdminError(b: any): Promise<string | null> {
  if (!adminError(b)) return null;
  const ms = Deno.env.get("MINISTRY_SECRET");
  if (!ms || (b.pw ?? "") !== ms) return adminError(b);
  // ⚠️ 담당자가 아니어도 「unauthorized」 — 틀린 암호와 **같은 답**을 준다(2026-09-17 리뷰).
  //    답을 가르면 담당자를 몰라도 「사역 암호가 맞았다」를 알아낼 수 있어 두 겹 확인이 한 겹씩 뚫린다.
  return (await ministryStaffKey(b)) ? null : "unauthorized";
}
```
`ministryStaffKey`/`ministryStaffCandidates`/`ministryAdminKeys`(담당자 목록 확인 경로)는 신청현황과
완전히 같다 — 전문은 `docs/port/ministry-status-legacy.md` 1.0절 참고, 여기서는 재인용하지 않는다.

### 1.1 액션 라우팅

`index.ts:480-481`:
```ts
case "ministryPaperCheck": return json(await ministryPaper(body, false));
case "ministryPaperSave":  return json(await ministryPaper(body, true));
```
두 액션은 **같은 함수**를 `save` 플래그만 다르게 호출한다 — "살펴보기"와 "명단 넣기"가 판정 로직을
공유해야 화면이 보여준 판정과 실제 저장 결과가 어긋나지 않는다.

### 1.2 공용 헬퍼 — `norm` / `identityKey`(어디서나 쓰는 기본기, verbatim)

`index.ts:152-154`:
```ts
const norm = (s: unknown) => (s ?? "").toString().trim().replace(/\s+/g, " ");
const identityKey = (u: any) =>
  [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(norm).join("|");
```
`identityKey`는 앱 로그인이 계정을 찾을 때 쓰는 것과 **완전히 같은 식**이다 — 종이 명단도 이 식으로
계정을 맞대 봐야 나중에 그 성도가 앱에 로그인했을 때 같은 사람으로 이어진다.

### 1.3 `ministryKeysToUsers` — identity_key → user id(옛 키는 별칭까지 따라간다)

`index.ts:230-245`:
```ts
// identity_key → user id (지금 키면 users, 옛 키면 user_identity_aliases)
async function ministryKeysToUsers(list: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(list.map((k) => norm(k)).filter(Boolean))];
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
```
`ministryPaper`가 줄마다 계정을 **미리** 찾을 때(저장 전 판정 단계) 쓴다 — 없으면 저장 시점에
`member_login` RPC로 새로 만든다(아래 1.9).

### 1.4 `ministryCfg` — 신청 기간·연도(공용)

`index.ts:4100-4109`:
```ts
async function ministryCfg() {
  const { data } = await db.from("app_config").select("value").eq("key", "ministry").maybeSingle();
  const v = (data?.value ?? {}) as any;
  const year = Number(v.year) || 2027;
  const open = norm(v.open), close = norm(v.close);
  const today = kstDay(new Date().toISOString());
  // 기간이 비어 있으면 닫힌 것으로 본다 — 실수로 상시 개방되지 않게
  const isOpen = !!(open && close && today >= open && today <= close);
  return { year, open, close, today, isOpen };
}
```
`ministryPaper`는 **신청 기간(`isOpen`)을 전혀 확인하지 않는다** — `cfg.year`만 가져다 쓴다(발견 사항 —
관리자가 종이 명단을 올릴 때는 기간과 무관하게 항상 열려 있다는 뜻. `ministryApply`/`ministryCancel`
(성도 신청)과는 다른 점).

### 1.5 잠금·상한 규칙 — `isLocked` / `countsToCap` / `MINISTRY_MAX`(종이 명단이 참조하는 것)

`index.ts:4059-4065`:
```ts
const MINISTRY_LOCKED = ["접수완료", "임명확정", "미채택", "취소"];
const isLocked = (st: string) => MINISTRY_LOCKED.indexOf(st) >= 0;
// ⚠️ 「미채택」은 자리를 **비운다**. 잠기기는 해도(그 팀은 결과가 났다) 3개 상한에서는
//    빼야 한다 — 안 그러면 떨어진 분이 다른 팀에 신청조차 못 하는 막다른 길이 된다.
// ⚠️ 「미채택」과 「취소」는 자리를 **도로 내놓는다**. 안 그러면 떨어지거나 취소당한 분이
//    다른 사역에 신청조차 못 하는 막다른 길이 된다.
const countsToCap = (st: string) => st !== "미채택" && st !== "취소";
```
`index.ts:4092`:
```ts
const MINISTRY_MAX = 3;
```
종이 명단도 **한 분 최대 3개** 상한을 지킨다(아래 1.10 `heldOf`/`addedBy`). `isLocked` 자체는
`ministryPaper` 안에서 직접 호출되지 않지만(잠금 여부를 따로 판정하지 않고 상태를 그대로 덮어씀),
`countsToCap`은 상한 계산에 쓰인다.

### 1.6 전화번호 정규화 — `PILSA_PHONE_RE` / `pilsaPhone`(필사 신청과 공유하는 규칙)

`index.ts:3525-3535`:
```ts
const PILSA_PHONE_RE = /^01[016-9]-?[0-9]{3,4}-?[0-9]{4}$/;

// 010-1234-5678 꼴로 통일 — 명단에서 전화 걸기 좋게
function pilsaPhone(v: unknown): string {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  if (d.length === 11) return d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7);
  if (d.length === 10) return d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
  return String(v ?? "").trim();
}
```
⚠️ 이름은 `PILSA_*`(필사 노트 신청)지만 사역신청이 **따로 만들지 않고 그대로 가져다 쓴다** — "따로
만들면 한쪽만 고치게 된다"는 주석이 index.ts:4096-4097에 있다.

### 1.7 직분 허용 목록 — `MIN_POSITIONS`(세 곳 중 하나 — 나머지 둘은 화면·DB CHECK)

`index.ts:4804-4811`:
```ts
// 직분 — 고른 것만 받는다. 자유 입력이면 「집사님」·「집사 」가 섞여
// 교적 대조가 도로 사람 손일이 된다(그러라고 받는 값이 아니다).
// ⚠️ 사역신청·이벤트 플랫폼이 **함께 쓰는 목록**이다. 여기 값을 늘리면 사역신청의
//    직분 칩에도 그대로 생긴다(app.js:9081 에 같은 목록이 한 벌 더 있다 — 함께 고칠 것).
//    2026-09-10: 옛 썸머 명단에 「사모님」이 있었는데 이 목록에 사모가 없어 이관에서
//    직분을 잃을 뻔했다. 성도님 결정으로 더했다.
const MIN_POSITIONS = new Set(
  ["성도", "집사", "권사", "안수집사", "장로", "전도사", "목사", "사모", "학생"]);
```
⚠️ **이 목록은 세 곳에 있다**(app.js `MIN_POSITIONS` · 여기 서버 allowlist · DB CHECK
`ministry_orders_position_chk`) — 하나만 고치면 화면은 열리는데 저장이 500으로 막히거나, 값은
들어가는데 화면에 안 뜨는 사고가 난다(`supabase/ministry_position_samo.sql`이 실제로 겪은 사고 기록,
아래 1.13).

### 1.8 종이 명단 전용 상수 — `PAPER_MAX_ROWS` / `PAPER_STATUS` / `PAPER_ALIAS` / `paperName`

`index.ts:4419-4440`:
```ts
// 관리자 명단 — 신청은 많아야 수백 건이라 전부 내려주고 화면에서 추린다

// ── 종이(오프라인) 명단 올리기 ──────────────────────────────────────
// 12월 신청은 앱과 종이가 섞인다. 담당자가 종이로 받은 것을 엑셀에 옮겨 적고, 그 칸을 통째로
// 붙여넣어 한꺼번에 올린다(2026-09-18 성도님 결정).
// ⚠️ **종이는 이미 임명·취소가 정해진 명단이다**(성도님) — 그래서 「신청완료」가 아니라
//    담당자가 고른 상태(기본 임명확정)로 바로 들어간다.
// ⚠️ **알림은 가지 않는다.** 임명 알림은 한 건씩 누를 때만 나간다(ministrySetStatus).
//    수백 건을 올리며 푸시가 한꺼번에 나가면 되돌릴 수 없다.
// ⚠️ **두 걸음이다.** check 가 줄마다 살펴 보여 주고, save 가 넣는다. save 도 **처음부터 다시 살핀다** —
//    그 사이에 성도님이 앱으로 같은 사역을 냈을 수 있고, 화면이 보낸 판정을 믿어선 안 된다.
// ⚠️ 계정은 **로그인과 같은 길**(member_login RPC)로 찾거나 만든다. 그래야 그분이 나중에 앱에
//    로그인하면 「내 신청」에 그대로 보인다. 이름·목장을 한 글자라도 다르게 적으면 딴 사람이 된다.
const PAPER_MAX_ROWS = 300;
const PAPER_STATUS = new Set(["임명확정", "취소", "신청완료", "접수완료"]);
// 줄에 적은 상태 — 「임명」·「임명확정」 둘 다 받는다(엑셀에는 짧게 적으신다)
const PAPER_ALIAS: Record<string, string> = {
  "임명": "임명확정", "임명확정": "임명확정", "확정": "임명확정",
  "취소": "취소", "신청": "신청완료", "신청완료": "신청완료",
  "접수": "접수완료", "접수완료": "접수완료",
};
// 담당자 화면이 쓰는 짧은 이름 — 창과 목록이 「임명」인데 여기만 「임명확정」이면 따로 논다
const paperName = (st: string) =>
  st === "임명확정" ? "임명" : st === "신청완료" ? "신청" : st === "접수완료" ? "접수" : st;
```
⚠️ **발견 사항 — `PAPER_STATUS`(Set)는 정의만 되고 `ministryPaper` 안에서 실제로 참조되지 않는다.**
실제 상태 유효성은 `PAPER_ALIAS`에 키가 있는지(`out.rowStatus = stRaw ? (PAPER_ALIAS[stRaw] || "") : ""`)로
판정한다 — `PAPER_STATUS`는 죽은 상수로 보인다(index.ts 전체에서 `PAPER_STATUS`를 다시 검색해 확인할 것).

### 1.9 날짜 파싱 — `paperDay`

`index.ts:4442-4453`:
```ts
// 종이에 적힌 날짜 한 칸 — 「2026-12-15」·「2026.12.15」·「2026. 12. 15.」 다 받는다.
// ⚠️ 한국 날짜로 읽는다(자정 +09:00) — UTC 로 읽으면 하루가 밀린다.
function paperDay(v: unknown): { v: string | null; err?: string } {
  const t = norm(v);
  if (!t) return { v: null };
  const m = /^(\d{4})[.\-\/\s]+(\d{1,2})[.\-\/\s]+(\d{1,2})\.?$/.exec(t);
  if (!m) return { v: null, err: "날짜는 2026-12-15 꼴로 적어 주세요" };
  const iso = m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0") + "T00:00:00+09:00";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { v: null, err: "날짜를 확인해 주세요 (" + t + ")" };
  return { v: d.toISOString() };
}
```

### 1.10 계정 키 후보 — `ministryPaperKeys`

`index.ts:4455-4462`:
```ts
function ministryPaperKeys(gu: string, mok: string, name: string): string[] {
  const m = norm(mok);
  const out = new Set<string>();
  for (const one of [m, m.replace(/목장$/, "")]) {
    out.add(identityKey({ type: "교구", gu, mok: one, bu: "", grade: "", name }));
  }
  return [...out];
}
```
목장을 「20」·「20목장」 두 표기 모두로 `identity_key`를 만들어 본다 — 적은 표기가 사람마다 달라도
같은 계정을 찾을 수 있게(교구/목장 로그인만 지원 — 교회학교 부서·학년 표기는 이 헬퍼에 없다,
**발견 사항**: 종이 명단은 교구 신자만 가정하고 있다).

### 1.11 줄 하나 겉모양 검사 — `ministryPaperOne`

`index.ts:4464-4490`:
```ts
// 줄 하나의 겉모양을 살핀다 — 되돌려주는 말은 화면이 그대로 보여 준다
function ministryPaperOne(raw: any, i: number) {
  const gu = norm(raw && raw.gu), mok = norm(raw && raw.mok), name = norm(raw && raw.name);
  const position = norm(raw && raw.position);
  const phone = pilsaPhone(raw && raw.phone);
  const out: any = {
    i, gu, mok, name, position, phone,
    committee: norm(raw && raw.committee), team: norm(raw && raw.team),
    option: norm(raw && raw.option), ok: false, error: "", warn: "",
  };
  const at = paperDay(raw && raw.appliedAt), dec = paperDay(raw && raw.decidedAt);
  out.appliedAt = at.v; out.decidedAt = dec.v;
  // 줄에 적은 상태·사유가 있으면 그 줄만 그대로 따른다(2026-09-18 성도님 — 한 명단에 임명·취소가 섞인다)
  const stRaw = norm(raw && raw.status);
  out.rowStatus = stRaw ? (PAPER_ALIAS[stRaw] || "") : "";
  out.rowNote = norm(raw && raw.note);
  if (stRaw && !out.rowStatus) out.badStatus = stRaw;
  if (!gu || !mok) out.error = "교구·목장을 적어 주세요";
  else if (!name) out.error = "이름을 적어 주세요";
  else if (!MIN_POSITIONS.has(position)) out.error = "직분이 목록에 없습니다";
  else if (!PILSA_PHONE_RE.test(phone)) out.error = "휴대폰 번호를 확인해 주세요 (010-1234-5678)";
  else if (!out.team) out.error = "사역팀을 적어 주세요";
  else if (at.err) out.error = "신청일 — " + at.err;
  else if (dec.err) out.error = "임명일 — " + dec.err;
  else if (out.badStatus) out.error = "상태는 임명·취소·신청 중에 적어 주세요 (" + out.badStatus + ")";
  return out;
}
```
검증 순서(첫 실패에서 멈춤): 교구·목장 → 이름 → 직분(허용 목록) → 휴대폰 형식 → 사역팀 존재 →
신청일 형식 → 임명일 형식 → 상태 문구 인식. **부서(committee)·하위 선택(option)은 이 단계에서 필수
검증이 없다**(팀 이름 매칭 단계 1.12에서 동명이인일 때만 요구됨).

### 1.12 본체 — `ministryPaper(b, save)`

`index.ts:4492-4666`:
```ts
async function ministryPaper(b: any, save: boolean) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const cfg = await ministryCfg();
  const year = cfg.year;
  // ⚠️ 상태는 **줄마다** 적는다(2026-09-18 성도님 — 한 명단에 임명과 취소가 섞인다).
  //    비어 있으면 임명이다(종이는 이미 정해진 명단이니까). 취소 사유도 그 줄에 적는다.
  const status = "임명확정";
  const raws = Array.isArray(b.rows) ? b.rows : [];
  if (!raws.length) return { ok: false, error: "올릴 줄이 없습니다" };
  if (raws.length > PAPER_MAX_ROWS) {
    return { ok: false, error: "한 번에 " + PAPER_MAX_ROWS + "줄까지 올릴 수 있습니다 (지금 " + raws.length + "줄)" };
  }

  // 사역팀 — 이름만 적어도 찾게 하되, 같은 이름이 둘이면 위원회를 물어본다
  const { data: cat, error: e1 } = await db.from("ministry_catalog")
    .select("id,committee,team,kind").eq("year", year);
  if (e1) throw e1;
  const flat = (s: string) => norm(s).replace(/\s+/g, "").toLowerCase();
  const byTeam = new Map<string, any[]>();
  const byFull = new Map<string, any>();
  for (const t of ((cat ?? []) as any[])) {
    const k = flat(t.team);
    if (!byTeam.has(k)) byTeam.set(k, []);
    byTeam.get(k)!.push(t);
    byFull.set(flat(t.committee) + "|" + k, t);
  }

  // 올해 신청 전부 — 3개 상한·같은 사역 중복·같은 이름/번호 확인에 쓴다
  const { data: allOrders, error: e2 } = await db.from("ministry_orders")
    .select("id,user_id,name,phone,team_id,status").eq("year", year).limit(5000);
  if (e2) throw e2;
  const orders = (allOrders ?? []) as any[];

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
    ? await ministryKeysToUsers([...new Set(allKeys)]) : new Map<string, string>();

  // 이 뭉치 안에서 같은 사람이 여러 줄이면 그 수도 상한에 더한다
  const addedBy = new Map<string, number>();
  const heldOf = (uid: string) =>
    orders.filter((o) => o.user_id === uid && countsToCap(o.status)).length;

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
      // ⚠️ 앱으로 낸 것과 겹치면 **새로 넣지 않고 그 건의 상태만** 바꾼다(2026-09-18 성도님).
      //    종이는 결정 난 명단이라, 같은 사역이 두 건이 되는 것이 아니라 그 신청이 임명된 것이다.
      const had = orders.find((o) => o.user_id === uid && Number(o.team_id) === Number(t.id));
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
    if (orders.some((o) => o.name === r.name && o.phone === r.phone && o.user_id !== uid)) {
      warns.push("같은 이름·번호로 낸 다른 신청이 있습니다");
    }
    r.warn = warns.join(" · ");
    r.ok = true;
  }

  const good = rows.filter((r: any) => r.ok);
  if (!save) {
    return { ok: true, year, rows, okCount: good.length, badCount: rows.length - good.length };
  }

  // ── 넣기 ──────────────────────────────────────────────────────
  // ⚠️ 한 줄이 실패해도 나머지는 들어간다 — 담당자가 고친 줄만 다시 올리면 된다.
  // ⚠️ 결정이 난 상태(임명확정·취소)면 한 건씩 바꿀 때와 같이 **휴대폰 번호를 지우고**
  //    decided_at 을 찍는다. 규칙이 들어온 길에 따라 달라지면 안 된다.
  const now = new Date().toISOString();
  let added = 0;
  for (const r of good) {
    try {
      const st = r.status || status;
      const decided = st === "임명확정" || st === "취소";
      const why = r.rowNote || "";
      if (r.same) { r.saved = true; continue; }          // 이미 그 상태다 — 건드리지 않는다
      if (r.dupId) {                                      // 앱 신청이 있다 — 상태만 바꾼다
        // ⚠️ 신청일은 **앱에 남은 그대로 둔다** — 성도님이 실제로 낸 날이다. 임명일만 종이 것으로.
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
          p_profile: { ...profile, identity_key: identityKey({ type: "교구", gu: r.gu, mok, bu: "", grade: "", name: r.name }) } });
        if (e3) throw e3;
        uid = u.id;
      }
      // 종이에 적힌 날짜가 있으면 그것을 쓴다 — 없으면 지금(2026-09-18 성도님)
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
  return { ok: true, year, rows, added,
           changed: good.filter((r: any) => r.changed).length,
           same: good.filter((r: any) => r.same).length,
           failed: good.filter((r: any) => !r.saved).length,
           badCount: rows.length - good.length };
}
```

**핵심 규칙 요약**:
- `save=false`(살펴보기)와 `save=true`(넣기)가 **같은 판정 로직**을 처음부터 다시 돈다 — 화면이 보여준
  살펴보기 결과를 믿지 않고, 저장 순간의 `ministry_orders`/`ministry_catalog`를 다시 읽어 대조한다
  (그 사이 성도가 앱으로 신청했을 수 있으므로).
- 사역팀은 **이름만으로 찾되, 같은 이름의 팀이 여러 부서에 있으면 위원회(`committee`)를 요구**한다
  (`byTeam`/`byFull` 두 맵).
- 상태는 **줄마다** 적을 수 있고 비어 있으면 `"임명확정"`(모듈 상수 `status`)이 기본값이다.
- "취소"로 넣는 줄은 **그 줄에 사유가 있어야** 한다(신청현황의 `ministrySetStatus`와 같은 규칙).
- 임명직(`kind === "appoint"`)인 팀에는 "임명확정" 외의 상태로 넣을 수 없다.
- **앱 신청과 같은 사람·같은 팀이 이미 있으면 새 행을 만들지 않고 그 행의 상태만 바꾼다**(`r.dupId`
  경로) — 이미 같은 상태면(`r.same`) **아예 손대지 않는다**(같은 명단을 두 번 올려도 안전).
- 3개 상한(`MINISTRY_MAX`)은 **이번 뭉치 안에서 같은 사람이 여러 줄**인 경우까지 합산해서 검사한다
  (`addedBy` 맵).
- 계정이 없으면(`r.isNew`) 저장 단계에서 비로소 `member_login` RPC로 새로 만든다(살펴보기 단계에서는
  만들지 않는다 — 순수 조회만).
- 결정 상태(임명확정·취소)로 들어가면 **휴대폰 번호를 저장 즉시 null로 지운다**(경로에 무관하게
  한 건씩 상태를 바꿀 때(`ministrySetStatus`)와 같은 규칙 — "규칙이 들어온 길에 따라 달라지면 안 된다").
- 앱 신청과 겹친 줄은 **신청일(`created_at`)을 건드리지 않는다** — 성도가 실제로 낸 날짜를 보존하고,
  임명일(`decided_at`)만 종이에 적힌 값으로 덮어쓴다.
- 한 줄이 저장 중 예외를 던지면 그 줄만 실패 처리되고 **나머지 줄은 계속 진행**된다(`try/catch`가
  `good` 배열의 각 항목을 개별적으로 감쌈).
- 반환값(살펴보기): `{ok, year, rows[], okCount, badCount}`. 반환값(넣기): `{ok, year, rows[], added,
  changed, same, failed, badCount}`. `rows[]`의 각 항목은 `ministryPaperOne`이 만든 필드에
  `status/team_id/committee/team/user_id/isNew/dupId/same/warn/saved/changed` 등이 덧붙어 온다.

### 1.13 계정 생성 — `member_login` RPC(로그인과 완전히 같은 길)

`ministryPaper`(save 단계, `index.ts:4638-4639`)가 계정이 없는 줄마다 호출:
```ts
const { data: u, error: e3 } = await db.rpc("member_login", {
  p_profile: { ...profile, identity_key: identityKey({ type: "교구", gu: r.gu, mok, bu: "", grade: "", name: r.name }) } });
```

RPC 정의(`supabase/member_profile.sql:43-67`, `advisory lock` 포함 전문 — 로그인 액션이 부르는 것과
**같은 함수**):
```sql
-- 로그인과 변경은 같은 잠금을 사용한다. 옛 정보로 로그인하는 순간 변경되어도
-- 별도 사용자가 생기거나 변경한 프로필이 옛 값으로 덮어써지지 않는다.
create or replace function public.member_login(p_profile jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_user public.users;
  v_key text := p_profile->>'identity_key';
begin
  perform pg_advisory_xact_lock(7240910, 1);
  select u.* into v_user from public.users u where u.identity_key = v_key;
  if not found then
    select u.* into v_user from public.user_identity_aliases a
      join public.users u on u.id = a.user_id where a.identity_key = v_key;
  end if;
  if v_user.id is null then
    insert into public.users(type, gu, mok, bu, grade, name, identity_key, last_seen_at)
    values (p_profile->>'type', p_profile->>'gu', p_profile->>'mok',
      p_profile->>'bu', p_profile->>'grade', p_profile->>'name', v_key, now())
    returning * into v_user;
  else
    update public.users set last_seen_at = now() where id = v_user.id returning * into v_user;
  end if;
  return to_jsonb(v_user);
end;
$$;
```
`supabase/member_profile.sql:110, 112`(권한):
```sql
revoke all on function public.member_login(jsonb) from public, anon, authenticated;
grant execute on function public.member_login(jsonb) to service_role;
```
동작: `identity_key`로 `users`를 먼저 찾고, 없으면 `user_identity_aliases`(소속·이름이 바뀐 옛 키)를
따라간다. 그래도 없으면 **새 계정을 만든다**. 있으면 `last_seen_at`만 갱신한다. `pg_advisory_xact_lock`으로
동시 로그인·동시 종이 명단 저장이 같은 사람의 계정을 중복 생성하지 않도록 잠근다.
⚠️ **`bu`/`grade`를 `null`로 보낸다**(`profile = { type:"교구", gu, mok, bu:null, grade:null, name }`) —
종이 명단은 **교구 신자만** 가정하며 교회학교(부서·학년) 경로는 지원하지 않는다(1.10절과 같은 제약,
발견 사항).

### 1.14 서버가 직접 쓰는 `ministry_orders` 칸(요약) — 전체 이력은 `docs/port/ministry-status-legacy.md` 1.9절

`ministryPaper`가 `insert`/`update`하는 칸: `year, user_id, name, who, position, phone, team_id, committee,
team, option, status, source, note, decided_at, created_at, updated_at`. 아래는 그중 **종이 명단이기
때문에 특별히 의미가 있는** 칸의 CHECK 제약만 발췌(전체 마이그레이션 순서·되돌리기 불가한 이력은
신청현황 문서가 이미 verbatim으로 갖고 있음).

원본 테이블(`supabase/ministry.sql:56-88`, `ministry_orders` 최초 생성분 — `choices` 칸은 이후 마이그레이션
`ministry_per_team.sql`로 폐지되어 지금은 존재하지 않는다. 최신 스키마는 아래 "논리 스키마" 참고):
```sql
create table if not exists public.ministry_orders (
  id          bigserial   primary key,
  year        int         not null,
  user_id     text        not null,
  name        text,                                -- 신청 당시 이름(명단 조회용 스냅샷)
  who         text,                                -- 신청 당시 소속(교구·목장 / 부서·학년)
  choices     jsonb       not null default '[]'::jsonb,
  status      text        not null default '신청완료',
  note        text,                                -- 담당자 메모
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  decided_at  timestamptz,                         -- 임명확정/미채택으로 바꾼 시각
  notified_at timestamptz,                         -- 임명확정 푸시를 보낸 시각
  unique (year, user_id)
);

alter table public.ministry_orders drop constraint if exists ministry_orders_status_chk;
alter table public.ministry_orders add constraint ministry_orders_status_chk
  check (status in ('신청완료', '검토중', '임명확정', '미채택'));
```

직분 CHECK 최종본(`supabase/ministry_position_samo.sql`, 전문 34줄 — **`ministryPaperOne`의
`MIN_POSITIONS.has(position)` 검사와 반드시 같은 목록이어야 하는 자리**, "사모" 누락 사고 기록 포함):
```sql
-- 사역신청 — 직분 제약에 「사모」를 더한다 (2026-09-10)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 왜: 2026-09-10에 옛 썸머 명단의 「사모님」 때문에 직분 목록에 **사모**가 더해졌다
--     (app.js 의 MIN_POSITIONS, index.ts 의 서버 allowlist, js/events.js 의 폴백).
--     그런데 **DB 의 CHECK 제약은 그대로 8개**였다. 그래서 화면에는 사모가 뜨는데
--     신청을 누르면 DB 가 거부한다.
--
--     개발에서 실제로 재현했다:
--       집사 → {"ok":true}
--       사모 → HTTP 500  new row ... violates check constraint
--                        "ministry_orders_position_chk"
--
--     ⚠️ 더 나쁜 것은 **성도님께 보이는 말**이다. 500 은 minErr 가 통신 오류로 보아
--        「연결이 고르지 않아…」로 뜬다 — 사모님은 까닭도 모른 채 신청을 못 한다.
--
-- ⚠️⚠️ **이 목록은 세 곳에 있다.** 하나를 고치면 셋을 함께 고쳐야 한다:
--        ① app.js          MIN_POSITIONS
--        ② supabase/functions/api/index.ts   서버 allowlist(ministryPosition)
--        ③ 여기 CHECK 제약
--      셋 중 ①②만 고치면 화면은 열리는데 저장이 막힌다(이번에 그랬다).
--      ③만 고치면 값이 들어갈 수는 있으나 화면에 안 뜬다.
--      CLAUDE.md 가 적어 둔 challenge_log.mode 사고와 **같은 자리**다.

alter table public.ministry_orders drop constraint if exists ministry_orders_position_chk;
alter table public.ministry_orders add constraint ministry_orders_position_chk
  check (position is null or position in
    ('성도','집사','권사','안수집사','장로','전도사','목사','사모','학생'));

-- 확인
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'ministry_orders_position_chk';   -- 사모가 들어 있어야 한다
```

상태 CHECK 최종본(`supabase/ministry_cancel_status.sql`, 전문 25줄 — `ministryPaperOne`/`ministryPaper`가
쓰는 실제 값 5종이 여기서 확정됨):
```sql
-- 사역신청 — 관리자 취소 상태 (2026-09-10)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 성도님 결정: 접수완료·임명확정된 뒤에는 **성도가 취소하지 못한다.**
-- 취소는 관리자가 한다. 관리자는 신청자가 아니라 **담당 부서장에게 오프라인으로**
-- 요청을 받아 처리하고, **사유를 적는다.** 그 사유는 **관리자만** 본다.
--
-- ⚠️ 행을 지우지 않고 「취소」 상태로 남긴다 — 지우면 사유도 함께 사라져
--    「왜 취소됐지」를 나중에 아무도 알 수 없다.
-- ⚠️ 취소는 **자리를 도로 내놓는다**(미채택과 같다). 안 그러면 취소당한 분이
--    다른 사역에 신청조차 못 하는 막다른 길이 된다.

alter table public.ministry_orders drop constraint if exists ministry_orders_status_chk;
alter table public.ministry_orders add constraint ministry_orders_status_chk
  check (status in ('신청완료', '접수완료', '임명확정', '미채택', '취소'));

-- note 는 **담당자 메모**다(취소 사유 포함). 성도 화면에는 절대 내보내지 않는다 —
-- 서버의 ministryRow 에서 뺐고, ministryList(관리자)에만 싣는다.
comment on column public.ministry_orders.note is
  '담당자 메모·취소 사유. 관리자 전용 — 성도 응답(ministryMine)에 실으면 안 된다.';

-- 확인
--   select team, status, note from ministry_orders where year = 2027;
```

`source` 칸 CHECK(`supabase/ministry_paper_leader.sql:12-20`, 종이/앱 구분의 근거 — 전체 파일은
`docs/port/ministry-catalog-legacy.md` 1.10절에 `leader_note` 쪽과 함께 전문이 있음):
```sql
alter table public.ministry_orders
  add column if not exists source text not null default 'app';

alter table public.ministry_orders drop constraint if exists ministry_orders_source_chk;
alter table public.ministry_orders add constraint ministry_orders_source_chk
  check (source in ('app', 'paper'));

comment on column public.ministry_orders.source is
  'app = 성도님이 앱에서 낸 신청 · paper = 담당자가 종이 신청을 대신 넣은 것';
```

직분 칸 최초 추가(`supabase/ministry_position_members.sql:10-16`, 8종 최초본 — `ministry_position_samo.sql`이
9종으로 확장):
```sql
alter table public.ministry_orders
  add column if not exists position text;

alter table public.ministry_orders drop constraint if exists ministry_orders_position_chk;
alter table public.ministry_orders add constraint ministry_orders_position_chk
  check (position is null or position in
    ('성도','집사','권사','안수집사','장로','전도사','목사','학생'));
```

**`ministry_orders` 논리 스키마 현재 상태(전체 이력 합성 — `docs/port/ministry-status-legacy.md` 1.9절과
동일 결론)**: `id bigserial pk · year int not null · user_id text not null · name text · who text ·
position text(CHECK 9종, 위 참고) · phone text(형식 CHECK 없음 — 서버의 `PILSA_PHONE_RE`만 검사) ·
team_id bigint not null · committee text · team text · option text ·
status text default '신청완료'(CHECK: 신청완료/접수완료/임명확정/미채택/취소) · note text(담당자 전용) ·
source text not null default 'app'(CHECK: app/paper) · created_at/updated_at timestamptz default now() ·
decided_at timestamptz · notified_at timestamptz · unique(year,user_id,team_id) ·
index(year,created_at desc) · index(year,team_id,status) · RLS enabled(서비스 롤만 접근)`.
`choices jsonb`는 폐지되어 더 이상 존재하지 않는다.

### 1.15 `ministryCatalog`의 `kind` 참조(종이 명단이 읽기만 함 — 정의는 catalog 문서 소관)

`ministryPaper`는 `ministry_catalog`에서 `id,committee,team,kind`만 읽어 팀을 매칭하고, `t.kind ===
"appoint"`인 팀에는 "임명확정" 외 상태를 막는다(1.12절). `ministry_catalog` 테이블 자체의 create/alter/
CHECK 전문은 `docs/port/ministry-catalog-legacy.md` 1.10절에 있다(중복 방지를 위해 이 문서에는 발췌하지
않음).

---

## 2. 화면 (`admin-stats.html`) — 📋 종이 명단 올리기

### 2.0 상태·전역 변수

`admin-stats.html:3736-3743`:
```js
/* ── 종이(오프라인) 명단 올리기 ─────────────────────────────────────
   담당자가 종이로 받은 것을 엑셀에 옮겨 적고, 그 칸을 통째로 붙여넣는다(2026-09-18 성도님).
   ⚠️ **종이는 이미 임명·취소가 정해진 명단이다** — 기본 상태가 「임명」이다.
   ⚠️ **알림은 가지 않는다.** 임명 알림은 현황 화면에서 한 건씩 누를 때만 나간다.
   ⚠️ 서버가 줄마다 다시 살핀다(ministryPaperCheck/Save) — 이 화면의 판정은 보여 주기용이다. */
const MP_COLS = ["교구", "목장", "이름", "직분", "휴대폰", "사역팀", "부서(선택)", "하위 선택(선택)", "신청일(선택)", "임명일(선택)", "상태(선택)", "사유(취소일 때)"];
let mpRows = [];      // 서버가 살펴 준 줄들
let mpBusy = false;
```
⚠️ `MP_COLS`(열두 칸 라벨)는 **화면 안내용일 뿐** — 실제 파싱(`mpParse`, 아래 2.2)은 **칸 이름이 아니라
자리(순서)**를 본다. 양식의 칸 차례를 바꾸면 조용히 어긋난다(`docs/notes/ministry-2027.md` 경고와 일치).

### 2.1 메뉴 진입점 — `renderMinistryMenu`의 「📋 종이 명단 올리기」 카드(범위 밖 함수지만 진입 부분만)

`admin-stats.html:1128-1135`(카드 마크업):
```html
<div class="rep-card" id="rep-minpaper">
  <div class="ic">📋</div>
  <div class="rep-text">
    <div class="ti">종이 명단 올리기</div>
    <div class="de">엑셀에서 붙여넣어 한꺼번에 — 종이는 정해진 명단이라 기본이 「임명」</div>
  </div>
  <div class="rep-arrow">›</div>
</div>
```
`admin-stats.html:1147`(바인딩, 파일 안에 1147행·1384행 두 곳에 같은 줄이 나온다 — 발견 사항, 사역팀
정보 문서 2.1절과 같은 현상):
```js
document.getElementById("rep-minpaper").addEventListener("click", renderMinistryPaper);
```

### 2.2 상태→화면 이름 변환 · 붙여넣기 파싱 — `mpName` / `mpParse`

`admin-stats.html:3745-3761`:
```js
// 「임명확정」을 화면에서는 「임명」으로 — 값은 서버·DB 가 쓰는 그대로 둔다
function mpName(st){ return MN_SHORT[st] || st || "임명"; }
function mpParse(text){
  const out=[];
  String(text||"").split(/\r?\n/).forEach(line=>{
    const t=line.trim(); if(!t) return;
    const cells=(line.indexOf("\t")>=0 ? line.split("\t") : line.split(",")).map(x=>x.trim());
    if(!cells.some(Boolean)) return;
    out.push({ gu:cells[0]||"", mok:cells[1]||"", name:cells[2]||"", position:cells[3]||"",
               phone:cells[4]||"", team:cells[5]||"", committee:cells[6]||"", option:cells[7]||"",
               appliedAt:cells[8]||"", decidedAt:cells[9]||"",
               status:cells[10]||"", note:cells[11]||"" });
  });
  // 엑셀에서 머리글까지 딸려 오는 일이 많다 — 첫 줄이 머리글이면 뺀다
  if(out.length && /교구/.test(out[0].gu) && /이름/.test(out[0].name)) out.shift();
  return out;
}
```
`MN_SHORT`(신청현황과 공유하는 상태→짧은 이름 매핑, 정의는 `admin-stats.html:3555`,
`docs/port/ministry-status-legacy.md` 2.0절)를 그대로 가져다 쓴다 — 이름만 남기고 재정의하지 않는다.
탭이 있으면 탭으로, 없으면 콤마로 나눈다(엑셀 붙여넣기는 탭 구분, CSV는 콤마 구분 둘 다 지원).
칸 순서는 `MP_COLS`와 정확히 같은 **자리 기반**(교구·목장·이름·직분·휴대폰·사역팀·부서·하위선택·
신청일·임명일·상태·사유 = 인덱스 0~11).

### 2.3 화면 뼈대·이벤트 바인딩 — `renderMinistryPaper`

`admin-stats.html:3763-3813`:
```js
function renderMinistryPaper(){
  window.scrollTo(0, 0);        // 앞 화면에서 내려둔 자리가 남지 않게(표준 v1)
  logoutBtn.hidden = false;
  mpRows = [];
  app.innerHTML = `
    <div class="rep-head mn-top">
      <button class="back-btn" id="back">← 메뉴</button>
      <h2>📋 종이 명단 올리기</h2>
    </div>
    <!-- 단추는 **맨 위에**(2026-09-18 성도님) — 명단이 길어지면 아래 단추는 한참 내려야 보인다.
         나가기는 다른 관리 화면과 같이 제목 줄의 「← 메뉴」가 맡는다(360px 에서 셋은 넘쳤다). -->
    <div class="adm-acts">
      <button type="button" class="push-btn ghost" id="mp-check">살펴보기</button>
      <button type="button" class="push-btn" id="mp-save" hidden>명단 넣기</button>
    </div>
    <div class="push-card">
      <div class="mp-how">
        <div class="mp-files">
          <a class="mp-dl" href="ministry/2027_사역명단_올리기_양식.xlsx" download>⬇️ 양식 내려받기</a>
          <button type="button" class="mp-dl pick" id="mp-pick">📂 양식 올리기</button>
          <input type="file" id="mp-file" accept=".xlsx,.xls,.csv" hidden>
          <span class="mp-fname" id="mp-fname"></span>
        </div>
        <div class="mp-cols">${MP_COLS.map((c,i)=>`<span${i>5?' class="dim"':''}>${plEsc(c)}</span>`).join("")}</div>
      </div>
      <!-- 긴 안내는 접어 둔다(표준 v1 ⑯) — 늘 펼쳐 두면 정작 붙여넣을 칸이 화면 밖으로 밀린다 -->
      <details class="mc-guide">
        <summary>📌 적는 법 · 주의할 것</summary>
        <ul class="mp-how-ul">
          <li><b>교구·목장·이름</b>은 앱 로그인과 <b>똑같이</b> 적어 주세요 — 한 글자만 달라도 다른 분이 됩니다.</li>
          <li>앱에 없는 분이면 계정을 새로 만듭니다. 나중에 그분이 앱에 로그인하면 이 신청이 그대로 보입니다.</li>
          <li>사역팀 이름이 여러 부서에 있으면 <b>부서</b>도 적어 주세요.</li>
          <li>앱으로 이미 낸 신청과 겹치면 <b>새로 넣지 않고 그 건의 상태만</b> 바꿉니다.</li>
          <li>이미 같은 상태인 줄은 <b>손대지 않습니다</b> — 같은 명단을 두 번 올려도 안전합니다.</li>
          <li><b>신청일·임명일</b>은 적으면 그 날짜로, 비우면 오늘로 들어갑니다 (2026-12-15 꼴).</li>
          <li><b>상태</b>는 줄마다 「임명」·「취소」·「신청」으로 적습니다. <b>비우면 임명</b>이에요.
              취소로 적은 줄은 <b>사유</b>도 함께 적어 주세요(관리자만 봅니다).</li>
          <li><b>알림은 가지 않습니다.</b> 임명 알림이 필요하면 현황 화면에서 한 분씩 눌러 주세요.</li>
        </ul>
      </details>
      <textarea id="mp-text" class="mp-text" rows="8" placeholder="화평&#9;20&#9;홍길동&#9;집사&#9;010-1234-5678&#9;신앙운동&#9;제자양육부&#9;&#9;2026-12-15&#9;2026-12-27&#9;임명"></textarea>
      <div id="mp-sum" class="mn-sum"></div>
      <div id="mp-list"></div>
    </div>`;
  document.getElementById("back").addEventListener("click", renderMenu);
  document.getElementById("mp-text").addEventListener("input", mpReset);
  document.getElementById("mp-file").addEventListener("change", mpFile);
  document.getElementById("mp-pick").addEventListener("click", ()=>document.getElementById("mp-file").click());
  document.getElementById("mp-check").addEventListener("click", ()=>mpRun(false));
  document.getElementById("mp-save").addEventListener("click", ()=>mpRun(true));
}
```
⚠️ 양식 내려받기 링크가 가리키는 파일: `ministry/2027_사역명단_올리기_양식.xlsx`(아래 4절, `tools/`
스크립트 산출물 — 저장소에 실제로 존재).

### 2.4 엑셀/CSV 파일 업로드 — `mpLoadXlsx` / `mpCell` / `mpFile`

`admin-stats.html:3815-3872`:
```js
// ── 엑셀 파일을 그대로 올리기 ────────────────────────────────────────
// 붙여넣기와 **같은 길로 모은다** — 파일에서 읽은 것을 아래 칸에 글자로 채워 넣고,
// 그다음은 붙여넣었을 때와 똑같이 「살펴보기 → 넣기」로 간다(담당자가 읽힌 것을 눈으로 본다).
// ⚠️ .xlsx 는 압축 파일이라 브라우저가 혼자 못 읽는다 — 필요할 때만 SheetJS 를 내려받는다.
//    통신이 막히면 「엑셀에서 복사해 붙여넣어 주세요」로 안내한다(길이 하나 더 있다).
// ⚠️ 시트가 여럿이면 「명단」 시트를 먼저 본다(양식의 「적는 법」 시트를 읽지 않게).
function mpLoadXlsx(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((res, rej)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload=()=>window.XLSX?res(window.XLSX):rej(new Error("no-xlsx"));
    s.onerror=()=>rej(new Error("no-cdn"));
    document.head.appendChild(s);
  });
}
function mpCell(v){
  if(v===null || v===undefined) return "";
  if(v instanceof Date){                       // 엑셀 날짜 칸 → 2026-12-15
    const p=n=>String(n).padStart(2,"0");
    return v.getFullYear()+"-"+p(v.getMonth()+1)+"-"+p(v.getDate());
  }
  return String(v).trim();
}
async function mpFile(e){
  const f=e.target.files && e.target.files[0]; if(!f) return;
  const name=document.getElementById("mp-fname");
  name.textContent=f.name+" 읽는 중…";
  try{
    let lines=[];
    if(/\.csv$/i.test(f.name)){
      const text=await f.text();
      lines=text.split(/\r?\n/).map(l=>l.split(",").map(x=>x.trim()));
    } else {
      const XLSX=await mpLoadXlsx();
      const wb=XLSX.read(await f.arrayBuffer(), { type:"array", cellDates:true });
      const sheet=wb.SheetNames.indexOf("명단")>=0 ? "명단" : wb.SheetNames[0];
      lines=XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header:1, blankrows:false, raw:true })
        .map(row=>(row||[]).map(mpCell));
    }
    // 빈 줄·안내 줄은 버린다(양식 맨 아래 「↑ 위 …」 한 줄)
    lines=lines.filter(r=>r.some(x=>x) && !/^[↑※]/.test(r[0]||""));
    if(!lines.length) throw new Error("empty");
    document.getElementById("mp-text").value=lines.map(r=>r.join("\t")).join("\n");
    mpReset();
    name.textContent=f.name+" · "+lines.length+"줄 읽음";
  }catch(err){
    name.textContent="";
    const why=String(err && err.message)==="no-cdn"
      ? "인터넷에서 엑셀 읽기 도구를 못 받았습니다. 엑셀에서 칸을 복사해 아래 칸에 붙여넣어 주세요."
      : String(err && err.message)==="empty"
        ? "파일에서 읽을 줄이 없습니다. 「명단」 시트에 적으셨는지 봐 주세요."
        : "파일을 읽지 못했습니다. 엑셀에서 칸을 복사해 붙여넣어 주셔도 됩니다.";
    mnDialog({ icon:"📂", title:"파일을 읽지 못했습니다", tone:"danger", ok:"확인", cancel:null, html:plEsc(why) });
  }finally{
    e.target.value="";                         // 같은 파일을 다시 고를 수 있게
  }
}
```
⚠️ SheetJS(`xlsx@0.18.5`)는 **그때그때 CDN(`cdn.jsdelivr.net`)에서 내려받는다** — 번들에 포함돼 있지
않다. 실패하면 파일 업로드를 포기하고 붙여넣기로 안내한다(길이 하나 더 있는 구조 — 절대 막다른 길이
아니게).

### 2.5 붙여넣은 값 초기화 — `mpReset`

`admin-stats.html:3874-3880`:
```js
// 붙여넣은 글이 바뀌면 앞서 살핀 결과는 버린다 — 옛 판정으로 넣는 일을 막는다
function mpReset(){
  mpRows=[];
  const b=document.getElementById("mp-save"); if(b) b.hidden=true;
  const l=document.getElementById("mp-list"); if(l) l.innerHTML="";
  const s=document.getElementById("mp-sum"); if(s) s.textContent="";
}
```

### 2.6 서버 호출 — `mpRun(save)`

`admin-stats.html:3882-3917`:
```js
async function mpRun(save){
  if(mpBusy) return;
  const rows=mpParse(document.getElementById("mp-text").value);
  if(!rows.length){
    mnDialog({ icon:"📋", title:"붙여넣은 것이 없습니다", ok:"확인", cancel:null,
      html:"엑셀에서 칸을 복사해 붙여넣어 주세요." });
    return;
  }
  if(save){
    const go=mpRows.filter(r=>r.ok&&!r.same);
    const by={};
    go.forEach(r=>{ const k=mpName(r.status); by[k]=(by[k]||0)+1; });
    const yes=await mnDialog({ icon:"📥", title:"명단을 넣습니다", tone:"ok", ok:`${go.length}건 넣기`, cancel:"그만두기",
      html:`<b>${go.length}건</b>을 넣습니다 — ` +
        Object.keys(by).map(k=>`<b>${plEsc(k)} ${by[k]}건</b>`).join(" · "),
      note:"앱 알림은 가지 않습니다. 넣은 뒤에는 현황 화면에서 한 건씩 고칠 수 있어요.", noteTone:"off" });
    if(!yes) return;
  }
  mpBusy=true;
  const btn=document.getElementById(save?"mp-save":"mp-check");
  const was=btn.textContent; btn.disabled=true; btn.textContent=save?"넣는 중…":"살펴보는 중…";
  const d=await callApi({ action: save?"ministryPaperSave":"ministryPaperCheck",
    pw:getPw(), staff:getStaff(), rows })
    .catch(()=>({ok:false,error:"network"}));
  mpBusy=false; btn.disabled=false; btn.textContent=was;
  if(minAuthLost(d)) return;
  if(!d.ok){
    mnDialog({ icon:"⚠️", title: save?"넣지 못했습니다":"살펴보지 못했습니다", tone:"danger", ok:"확인", cancel:null,
      html: plEsc(d.error||"오류") });
    return;
  }
  mpRows=d.rows||[];
  mpRender(save, d);
  // 단추는 맨 위, 결과는 칸 아래 — 살펴본 뒤 결과로 데려간다(왕복을 없앤다)
  document.getElementById("mp-sum")?.scrollIntoView({ block:"center" });
}
```
⚠️ **저장 확인창(`mnDialog`)은 `mpRows`(직전 "살펴보기" 결과)를 기준으로 건수를 센다** — `save`를 누르기
전에 텍스트를 고쳤는데 "살펴보기"를 다시 안 누르면, 확인창에 뜨는 건수와 실제로 서버에 보낼
`mpParse(...)` 결과가 어긋날 수 있다(화면이 "명단 넣기" 단추를 `mpReset`으로 숨겨 두므로 실제로는 이
경로를 타기 어렵지만, 코드 구조상 `mpRun(true)`는 `rows`를 다시 파싱해서 보내고 확인창만 `mpRows`를
본다는 점은 발견 사항으로 남긴다).

### 2.7 결과 렌더 — `mpRender`

`admin-stats.html:3919-3942`:
```js
function mpRender(saved, d){
  // ⚠️ 같은 명단을 다시 올린 줄(r.same)은 **손대지 않는다**(2026-09-18 성도님) — 「넣을 것」에서 빼고 따로 센다.
  const okN=mpRows.filter(r=>r.ok&&!r.same).length;
  const sameN=mpRows.filter(r=>r.same).length;
  const badN=mpRows.filter(r=>!r.ok).length;
  document.getElementById("mp-sum").innerHTML = saved
    ? `📥 <b>${d.added||0}건</b>을 넣었습니다${d.changed?` (그중 상태만 바꾼 것 ${d.changed}건)`:""}` +
      `${d.same?` · 그대로 둔 줄 ${d.same}`:""}${d.failed?` · 실패 ${d.failed}건`:""}${badN?` · 못 넣은 줄 ${badN}`:""}`
    : `살펴본 줄 <b>${mpRows.length}</b> · 넣을 것 <b>${okN}</b>` +
      `${sameN?` · 그대로 둘 것 <b>${sameN}</b>`:""}${badN?` · 고칠 것 <b>${badN}</b>`:""}`;
  document.getElementById("mp-save").hidden = saved || !okN;
  document.getElementById("mp-list").innerHTML = mpRows.map(r=>{
    const cls = r.same ? "same" : r.saved ? "done" : r.ok ? "ok" : "bad";
    const mark = r.same ? "＝" : r.saved ? "✅" : r.ok ? "◻️" : "⚠️";
    return `<div class="mp-item ${cls}">
      <div class="mp-i-top"><span class="mp-i-ic">${mark}</span>
        <b>${plEsc(r.name||"(이름 없음)")}</b><small>${plEsc([r.gu,r.mok].filter(Boolean).join(" "))}</small>
        ${r.status?`<span class="mp-i-st ${r.status==="취소"?"off":""}">${plEsc(mpName(r.status))}</span>`:""}
        <span class="mp-i-team">${plEsc(r.team||"")}${r.committee?` <i>${plEsc(r.committee)}</i>`:""}</span></div>
      ${r.error?`<div class="mp-i-msg bad">${plEsc(r.error)}</div>`:""}
      ${r.warn?`<div class="mp-i-msg warn">${plEsc(r.warn)}</div>`:""}
    </div>`;
  }).join("");
}
```
줄 마크 4종: `＝`(이미 같은 상태 — 손 안 댐) · `✅`(저장 완료) · `◻️`(저장 전, 넣을 예정) · `⚠️`(오류,
못 넣음). "명단 넣기" 단추는 **살펴보기 뒤(`!saved`) + 넣을 것이 하나라도 있을 때(`okN`)만** 보인다.

### 2.8 공용 헬퍼 — 이미 다른 곳에 포팅됐거나 이 조사 범위 밖(이름만)

`mnDialog` · `mnNote` · `plEsc` · `.pl-*` 상태 부품 · `callApi` · `getPw`/`getStaff` · `minAuthLost` ·
`MN_SHORT`(정의는 `admin-stats.html:3555`) — 모두 신청현황(`renderMinistryAdmin`)이 이미 쓰는 것과 완전히
같은 함수/상수를 그대로 재사용한다(`docs/port/ministry-status-legacy.md` 2.0/2.1/2.2/2.11절 참고). 이
문서에서는 다시 옮기지 않는다.

### 2.9 CSS — `.mp-*`(이 화면 전용, verbatim)

`admin-stats.html:621-664`:
```css
/* 종이 명단 올리기 */
.mp-how{font-size:13px;line-height:1.7;color:#41506b;background:#f3f6fb;border-radius:12px;padding:11px 13px;margin-bottom:10px;}
.mp-how ul{margin:6px 0 0;padding-left:18px;}
.mp-how-ul{margin:10px 12px 12px;padding-left:18px;font-size:13px;line-height:1.7;color:#41506b;}
.mp-how-ul li{margin:2px 0;}
.mp-how li{margin:2px 0;}
.mp-files{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:8px 0 2px;}
.mp-dl{display:inline-block;font-size:12.5px;font-weight:800;color:#1a3a6b;
  background:#fff;border:1px solid #a9c3e8;border-radius:999px;padding:6px 12px;text-decoration:none;cursor:pointer;}
.mp-dl.pick{background:#eef3fb;}
.mp-fname{font-size:12px;color:#41506b;}
.mp-dl:active{background:#dfe6f3;}
.mp-cols{display:flex;flex-wrap:wrap;gap:4px;margin:7px 0 2px;}
.mp-cols span{font-size:11.5px;font-weight:800;color:#1a3a6b;background:#fff;border:1px solid #cdd8ea;border-radius:7px;padding:2px 7px;}
.mp-cols span.dim{color:#8a95a8;border-color:#e3e8f1;font-weight:700;}
.mp-row{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:8px;}
.mp-row label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:800;color:#41506b;flex:1 1 150px;}
.mp-row select{font:inherit;font-size:14px;padding:9px 8px;border:1px solid #dde3ee;border-radius:10px;background:#fff;color:#1a3a6b;}
.mp-row label[hidden]{display:none;}
.mp-dim{font-weight:600;color:#8a95a8;}
.mp-text{width:100%;box-sizing:border-box;font:inherit;font-size:13px;line-height:1.6;padding:10px;border:1px solid #dde3ee;border-radius:10px;background:#fff;color:#1a3a6b;}
.adm-acts{display:flex;gap:8px;margin:0 0 10px;}
/* ⚠️ .push-btn 은 padding 0 24px · 글씨 1rem · nowrap 이라 **줄어들지 못한다** — 360px 에서
   셋을 나란히 두면 화면 밖으로 나갔다(2026-09-18). 여기서는 줄어들 수 있게 고쳐 쓴다. */
.adm-acts .push-btn{flex:1 1 0;min-width:0;padding:0 10px;font-size:.93rem;
  overflow:hidden;text-overflow:ellipsis;}
.adm-acts .push-btn.ghost{background:#eef3fb;color:#1a3a6b;border:1px solid #a9c3e8;}
.adm-acts .push-btn[hidden]{display:none;}
.mp-item{border:1px solid #e3e8f1;border-left:4px solid #a9c3e8;border-radius:10px;padding:8px 10px;margin-top:6px;background:#fff;}
.mp-item.bad{border-left-color:#e0a3a3;background:#fdf5f5;}
.mp-item.done{border-left-color:#7fc39b;background:#f4faf6;}
.mp-item.same{border-left-color:#cdd8ea;background:#f7f9fc;}
.mp-item.same .mp-i-top b{color:#6b7a90;}
.mp-i-top{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 7px;}
.mp-i-top b{font-size:14px;font-weight:800;color:#1a3a6b;}
.mp-i-top small{font-size:11.5px;color:#8a95a8;}
.mp-i-st{font-size:11px;font-weight:800;color:#1a3a6b;background:#eef3fb;border:1px solid #cdd8ea;
  border-radius:999px;padding:1px 8px;}
.mp-i-st.off{color:#8a95a8;background:#f4f6fa;border-color:#dde3ee;}
.mp-i-team{font-size:12.5px;font-weight:700;color:#41506b;margin-left:auto;}
.mp-i-team i{font-style:normal;font-size:11px;color:#8a95a8;}
.mp-i-msg{font-size:12px;line-height:1.6;margin-top:4px;}
.mp-i-msg.bad{color:#a33;}
.mp-i-msg.warn{color:#7a5f16;}
```
⚠️ `.adm-acts`(화면 전체 동작 줄)는 이름은 공용이지만 **이 파일에서 처음 정의되는 자리가 종이 명단
CSS 뭉치 안**이다(642-648행) — 실제로는 여섯 사역신청 화면이 공유하는 표준 v1 부품이다(발견 사항,
혼동 주의. 표준 v1 블록 안에도 `.adm-acts` 재정의가 있다 — 2.10절).

### 2.10 CSS — "사역신청 관리 표준 v1" 중 `.mp-*`/`.adm-acts`를 다시 스타일링하는 부분(발췌, 전문은 `docs/port/ministry-status-legacy.md` 2.16절)

`admin-stats.html:11-17`(`:root` 토큰):
```css
:root{
  --navy:#1a3a6b; --navy-dark:#0d1b3e; --gold:#c8a84b;
  --cream:#fdf8f0; --gray:#6b7280; --border:#ddd6c8; --light:#f3f0ea;
  --green:#2c5f2d; --error:#c0392b;
  /* 사역신청 관리 표준 v1 — 누르는 것의 세 크기와 여백(2026-09-18) */
  --tap-lg:48px; --tap:44px; --chip:36px; --gap:10px; --gap-s:6px; --card-pad:18px;
}
```

`admin-stats.html:827, 844, 850, 852, 868, 1811-1815`(표준 v1 블록 중 `.mp-*`/`.adm-acts`에 닿는 줄만 발췌):
```css
.mp-dl{min-height:var(--tap);display:inline-flex;align-items:center;padding:0 16px;font-size:.95rem;}
.mapl-p,.mp-cols span,.mn-tcount{border:none;background:#f3f6fb;color:#41506b;}
.mn-date,.mn-rowi-t small,.ma-nm .ma-at,.mc-tag,.mc-r-v.none,.mp-cols span.dim,.mn-cond-sum{
  font-size:13px;color:#6b778c;}
.mn-stbar span,.mn-rowi-st,.mc-c-sub,.mn-tcount,.mp-i-st,.mc-r-l,.mn-teams-t{font-size:13px;}
.mp-item{margin-top:var(--gap);}
.adm-acts{display:flex;gap:8px;margin:0 0 12px;}
.adm-acts>.push-btn{flex:1 1 0;min-width:0;min-height:var(--tap-lg);font-size:1rem;padding:0 12px;
  overflow:hidden;text-overflow:ellipsis;}
.adm-acts>.push-btn[hidden]{display:none;}
.push-btn.ghost{background:#eef3fb;color:#1a3a6b;border:1px solid #a9c3e8;}
```
⚠️ **`.adm-acts`가 두 번 정의된다**(642-648행의 종이 명단 전용 버전과 1811-1815행의 표준 v1 버전) —
CSS 소스 순서상 표준 v1(803행 이후)이 **나중**이라 `min-height:var(--tap-lg)`·`margin:0 0 12px` 등이
최종 적용된다(마진값 `10px` vs `12px`처럼 서로 다른 값이 있어 **표준 v1 쪽이 이긴다**는 점을 포팅 시
분명히 할 것 — 발견 사항).

---

## 3. 동작 목록 (체크리스트)

1. 「📋 종이 명단 올리기」는 `ministryPaperCheck`/`ministryPaperSave` 두 액션 모두 담당자 암호로 매번
   재확인된다(`ministryAdminError`, 호출마다) — index.ts:4493.
2. **살펴보기와 넣기가 같은 판정 함수(`ministryPaper`)를 처음부터 다시 돈다** — 화면이 보여준 살펴보기
   결과를 그대로 믿고 저장하지 않는다. 그 사이 성도가 앱으로 신청했을 수 있기 때문 — index.ts:4426-4427
   주석, 4608-4666.
3. **신청 기간(`isOpen`)을 확인하지 않는다** — 관리자가 종이 명단을 올리는 것은 성도용 신청 기간과
   무관하게 언제나 가능하다(발견 사항) — `ministryCfg` 호출은 하지만 `cfg.isOpen`을 쓰지 않음.
4. 붙여넣기 파싱은 **칸 이름이 아니라 순서(위치)**를 본다 — 교구·목장·이름·직분·휴대폰·사역팀·부서·
   하위선택·신청일·임명일·상태·사유(0~11번 인덱스) — `mpParse`(admin-stats.html:3747-3761),
   `docs/notes/ministry-2027.md` "화면은 머리글 이름이 아니라 자리(순서)를 본다" 절.
5. 엑셀에서 붙여넣을 때 첫 줄이 머리글("교구"+"이름"이 첫 줄에 있으면)이면 자동으로 한 줄 버린다 —
   `mpParse`(admin-stats.html:3759).
6. 「📂 엑셀 파일 올리기」는 파일을 읽어 **붙여넣기 칸을 채우기만 하고 곧장 저장하지 않는다** — 담당자가
   읽힌 내용을 눈으로 확인한 뒤 "살펴보기 → 넣기"를 다시 눌러야 한다 — `mpFile`(admin-stats.html:3858).
7. `.xlsx`는 SheetJS를 **그 자리에서 CDN(jsdelivr)으로 내려받는다** — 번들에 없다. 통신이 막히면
   "복사해 붙여넣어 주세요"로 안내한다(막다른 길을 만들지 않음) — `mpLoadXlsx`(admin-stats.html:3821-3830).
8. 시트가 여럿이면 **"명단" 시트를 우선** 읽는다(양식의 "적는 법" 시트를 실수로 읽지 않게) —
   `mpFile`(admin-stats.html:3851).
9. 한 번에 올릴 수 있는 줄은 **최대 300줄**이며 넘으면 저장을 거절한다 — `PAPER_MAX_ROWS`
   (index.ts:4430), `ministryPaper`(index.ts:4501-4503).
10. 상태는 **줄마다** 적으며(임명·임명확정·확정→임명확정 / 취소 / 신청·신청완료→신청완료 /
    접수·접수완료→접수완료로 별칭 처리) **비어 있으면 "임명확정"**이 기본값이다(종이는 이미 정해진
    명단이라는 성도님 결정) — `PAPER_ALIAS`(index.ts:4433-4437), `ministryPaper`(index.ts:4557).
11. **"취소"로 넣는 줄은 그 줄에 사유가 있어야 한다** — 없으면 그 줄만 오류 처리(전체 저장이 막히지
    않음, 그 줄만 빠짐) — `ministryPaperOne`이 아니라 `ministryPaper` 본문에서 검사(index.ts:4560-4563).
12. **지명(임명직, `kind==="appoint"`) 팀에는 "임명확정" 외의 상태로 넣을 수 없다** —
    index.ts:4564-4567.
13. 사역팀은 **이름만으로 찾되, 같은 이름의 팀이 여러 부서에 있으면 부서(committee)도 요구**한다 —
    없으면 "사역 목록에 없는 이름입니다", 여럿이면 "같은 이름의 사역이 N개입니다 — 위원회도 적어
    주세요"로 그 부서 목록까지 알려준다 — index.ts:4546-4555.
14. **앱으로 이미 낸 신청과 같은 사람·같은 팀이 겹치면 새 행을 만들지 않고 그 신청의 상태만 바꾼다**
    (source는 그대로 "app"으로 남고 새로 "paper" 행이 생기지 않음) — index.ts:4576-4587, 4624-4632,
    `docs/notes/ministry-2027.md` "앱 신청과 겹치면 새 행을 만들지 않고" 절.
15. **이미 같은 상태인 줄은 손대지 않는다** — 같은 명단을 두 번 올려도 안전(멱등) —
    index.ts:4580-4585(`r.same`), 4623(`if (r.same) { r.saved = true; continue; }`).
16. 3개 상한(`MINISTRY_MAX=3`)은 **이번에 올리는 뭉치 안에서 같은 사람이 여러 줄일 때도 합산**해서
    검사한다(`addedBy` 맵으로 누적) — index.ts:4540-4541, 4588-4594.
17. 계정이 없는 분은 **저장(`save=true`) 단계에서만** `member_login` RPC로 새로 만든다(살펴보기 단계는
    순수 조회만, 계정을 만들지 않음) — index.ts:4634-4641.
18. `member_login`은 **로그인 화면과 완전히 같은 함수**이고, `identity_key`로 먼저 찾고 없으면
    `user_identity_aliases`(옛 키)까지 따라가며, 그래도 없으면 새로 만든다. 동시성은
    `pg_advisory_xact_lock(7240910, 1)`로 막는다 — `supabase/member_profile.sql:45-67`.
19. 계정 생성 시 **교회학교(부서·학년) 경로는 지원하지 않는다** — 항상 `type:"교구"`로 고정해 계정을
    만든다(발견 사항) — index.ts:4637, `ministryPaperKeys`(4455-4462)도 교구 표기만 다룸.
20. **결정 상태(임명확정·취소)로 들어가는 순간 휴대폰 번호를 곧바로 지운다**(신청현황에서 한 건씩 상태를
    바꿀 때와 같은 규칙 — 경로에 따라 규칙이 달라지지 않음) — index.ts:4627, 4647.
21. **앱 신청과 겹친 줄은 신청일(created_at)을 손대지 않는다** — 성도가 실제로 낸 날짜를 보존하고,
    임명일(decided_at)만 종이에 적힌 값(또는 오늘)으로 넣는다 — index.ts:4625-4626.
22. 신청일·임명일을 안 적으면 **오늘 날짜**로 들어간다. 날짜 형식은 `2026-12-15`·`2026.12.15`·
    `2026. 12. 15.`를 모두 받고(한국 자정 `+09:00` 기준), 형식이 틀리면 그 줄만 오류 — `paperDay`
    (index.ts:4442-4453).
23. **알림은 절대 가지 않는다** — 종이 명단 저장은 `ministryNotify`를 전혀 호출하지 않는다. 임명 알림이
    필요하면 신청현황 화면에서 한 건씩 눌러야 한다(수백 건 일괄 푸시가 되돌릴 수 없기 때문) —
    `ministryPaper` 전체에 `ministryNotify` 참조 없음(확인 완료), `docs/notes/ministry-2027.md`
    "알림은 가지 않는다" 절.
24. **한 줄이 저장 중 실패해도 나머지 줄은 계속 저장된다**(줄마다 독립된 try/catch) —
    index.ts:4618-4660.
25. 저장 결과 화면은 줄마다 4가지 기호로 구분해 보여준다 — `＝`(그대로 둠) `✅`(저장됨) `◻️`(넣을
    예정) `⚠️`(오류) — `mpRender`(admin-stats.html:3931-3932).
26. "명단 넣기" 단추는 **"살펴보기"를 먼저 실행해 결과가 있고, 넣을 것(okN)이 하나 이상일 때만**
    보인다 — `mpRender`(admin-stats.html:3929), 텍스트를 고치면 `mpReset`이 이 단추를 다시 숨긴다
    (admin-stats.html:3808, 3877).
27. **넣기 전 확인창은 상태별 건수를 요약해서 보여준다**(예: "임명 12건 · 취소 2건") —
    `mpRun`(admin-stats.html:3891-3897).
28. 직분은 서버 `MIN_POSITIONS`(9종: 성도·집사·권사·안수집사·장로·전도사·목사·사모·학생) 안에 있는
    값만 허용하며, 이 목록은 **화면(app.js)·서버·DB CHECK 세 곳**에 각각 있어 하나만 고치면 화면은
    열리는데 저장이 500으로 막히는 사고가 실제로 있었다(사모 추가 사고, 2026-09-10) — index.ts:4810-4811,
    `supabase/ministry_position_samo.sql`.
29. 휴대폰 번호는 `PILSA_PHONE_RE`(010-으로 시작하는 형식)로 검사하고 `010-1234-5678` 꼴로 정규화한다
    (필사 노트 신청과 완전히 같은 규칙, 별도로 만들지 않음) — index.ts:3525-3535.
30. **발견 사항 — `PAPER_STATUS`(Set 상수)는 정의만 되고 실제 판정에 쓰이지 않는 죽은 코드로 보인다** —
    실제 상태 유효성 검사는 `PAPER_ALIAS`에 키가 있는지로만 판정한다 — index.ts:4431 vs 4478.
31. **발견 사항 — `renderMinistryPaper`의 저장 확인창은 `mpRows`(직전 "살펴보기" 결과)로 건수를 세는데,
    실제 전송 데이터는 `mpParse(현재 텍스트)`를 다시 계산한다** — 텍스트를 고치고 "살펴보기"를 건너뛰면
    확인창 숫자와 실제 전송 내용이 어긋날 수 있는 구조(단, "명단 넣기" 단추 자체가 `mpReset`으로
    숨겨지므로 실제 도달 가능성은 낮음) — admin-stats.html:3882-3898.
32. **발견 사항 — `.adm-acts` CSS가 두 곳(642-648행 종이 명단 전용, 1811-1815행 표준 v1)에 정의되고
    값이 다르다**(마진 10px vs 12px 등) — CSS 소스 순서상 표준 v1이 나중이라 그쪽이 이긴다. 포팅 시
    표준 v1 값을 최종값으로 채택할 것.
33. **발견 사항 — `document.getElementById("rep-minpaper").addEventListener(...)`가 파일 안에 두 곳
    (1147행·1384행)**에 나온다 — 실제 실행되는 한 벌만 옮길 것(사역팀 정보 문서와 같은 현상).

---

## 4. 크기

**Section 1(index.ts) verbatim 코드**: 함수/상수 코드 약 **207줄**(adminError 6 · ministryAdminError 8 ·
norm/identityKey 3 · ministryKeysToUsers 16 · ministryCfg 10 · isLocked/countsToCap/MINISTRY_LOCKED 7 ·
MINISTRY_MAX 1 · PILSA_PHONE_RE/pilsaPhone 8 · MIN_POSITIONS 8 · PAPER_MAX_ROWS~paperName 22 · paperDay 12 ·
ministryPaperKeys 8 · ministryPaperOne 26 · ministryPaper 175 · member_login RPC 25 · SQL 발췌는 아래 별도) —
JS/TS만 세면 약 **335줄**. + SQL(member_profile.sql 발췌 28 · ministry.sql 발췌 24 · ministry_position_samo.sql
34 · ministry_cancel_status.sql 25 · ministry_paper_leader.sql 발췌 9 · ministry_position_members.sql
발췌 7) 약 **127줄** = **약 462줄**.

**Section 2(admin-stats.html) verbatim 코드**: JS(상태/전역변수 8 · 메뉴 카드 8+1 · mpName/mpParse 17 ·
renderMinistryPaper 51 · mpLoadXlsx/mpCell/mpFile 58 · mpReset 7 · mpRun 36 · mpRender 24) 약 **210줄**
+ CSS(`.mp-*` 본 블록 44 · 표준 v1 발췌 11 · `:root` 7) 약 **62줄** = **약 272줄**.

**합계 약 734줄**의 verbatim 코드를 이식 대상으로 추출했다(위 코드블록 실측 기준 근사치 — 정확한
라인 수는 각 절에 표기한 `파일:시작-끝` 범위로 재확인 가능. 파일은 여러 세션이 함께 고쳐 줄 번호가
움직이므로, 포팅 시점에는 함수/선택자 이름으로 다시 찾을 것).

## 찾지 못한 것

`tools/ministry-paper-xlsx-gen.py`가 쓰는 산출물 경로 `ministry/2027_사역명단_올리기_양식.xlsx`는
**실제로 저장소에 존재**한다(`C:\Projects\bible-memorize-church-app-v2\ministry\2027_사역명단_올리기_양식.xlsx`,
확인 완료 — 바이너리 내용은 지시대로 복사하지 않았다). 이 스크립트 자체는 verbatim으로 옮길 필요가
없는 "만드는 도구"라 코드 인용 없이 경로와 존재 여부만 보고한다(요청사항).

그 외 요청된 것은 모두 찾았다 — `renderMinistryPaper`와 부속 전부(`mpName`·`mpParse`·`mpLoadXlsx`·
`mpCell`·`mpFile`·`mpReset`·`mpRun`·`mpRender`), 서버 액션 `ministryPaperCheck`/`ministryPaperSave` →
`ministryPaper(b,save)`와 그 헬퍼(`ministryPaperOne`·`ministryPaperKeys`·`paperDay`·`PAPER_ALIAS`류·
`ministryKeysToUsers`·`identityKey`·`pilsaPhone`·`MIN_POSITIONS`), `member_login` RPC 정의(`member_profile.sql`)
을 실제 파일에서 찾아 verbatim으로 옮겼다.

⚠️ 다만 `ministryPaperKeys`(index.ts:4455-4462)는 **교구(`type:"교구"`) 로그인 표기만** 다룬다 —
교회학교(부서·학년) 신자를 종이 명단으로 올리는 경로는 코드 어디에도 없다(2.9절 체크리스트 19번,
`ministryPaper` 저장부의 `profile = { type: "교구", ... }` 고정 참고). 이것이 "찾지 못한 기능"인지
"의도적으로 지원 안 함"인지는 `docs/notes/ministry-2027.md`/`ministry-admin-ui.md`에도 명시적 언급이
없어 원 저장소 담당자에게 확인이 필요하다(추정이나 지어낸 설명을 붙이지 않고 사실만 보고함).
