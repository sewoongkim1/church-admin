# 「🎉 이벤트 관리」 — 레거시 추출 (읽기 전용 조사 · 성경필사(암송) 옮기기의 기준)

대상: 성경암송 v2 저장소(`C:\Projects\bible-memorize-church-app-v2`) **커밋 `4261dea`**(2026-09-29) —
`admin-event.html`(이벤트 관리 화면 전부) + `supabase/functions/api/index.ts`(관리자 이벤트 액션 다섯과 그 헬퍼,
판단 근거가 되는 성도님 액션 넷) + `supabase/events.sql`·`events_display.sql`·`event_stamp_2026.sql`(표·칸·가을 회차 행)
+ `supabase/member_merge.sql` 발췌 + `admin.html` 타일 한 줄 + `js/api.js` 래퍼 + `tests/event-smoke.sh` 발췌.
옮길 곳: 교회 어드민 메뉴 묶음 「성경필사(암송)」(역할 `bibleevent`) — 설계
`C:\Projects\bible-memorize-church-app-v2\docs\superpowers\specs\2026-09-29-church-admin-bible-events-design.md`.
범위 밖: 옛 「말씀 이벤트」(퀴즈형 — `eventEnter`·`eventStatus`·`eventBoard`·`eventEntrants`, 표 `event_entries`) ·
필사 노트 신청(`pilsa*`, 표 `pilsa_orders`) · 가을 도장판 계산(`eventStamps`·`evtStampsFor`·`evtPhase`·`evtNeedFor`·
`evtCanReach`·RPC `v2_event_weeks` — 이름만).

> 원문은 `git -C C:\Projects\bible-memorize-church-app-v2 show 4261dea:<경로>` 를 **스크립트로** 옮겼다(손으로 베끼지 않았다 —
> 블록마다 첫 줄을 대조해 줄 번호가 맞는지 확인했다). 줄 번호는 그 커밋의 것이다. 여러 세션이 함께 고치는 파일이라
> **함수 이름으로 다시 찾을 것** — 얼리기(Task 15)처럼 이 파일들을 고칠 때도 줄 번호가 아니라 글(앵커)로 찾는다.
> 원문 주석의 예시 이름 두 개(「이름-목장」 꼴)는 공개 저장소 규칙에 따라 「홍길동」·「홍길순」으로 바꿨다 —
> 그 밖은 한 글자도 바꾸지 않았다.

**이 스냅샷 뒤에 위 원본 파일을 바꾼 성경암송 커밋**(채울 때 `git log 4261dea..HEAD` 로 적었다 — 있으면 그 커밋을 먼저 읽을 것):

- 없음 — 스냅샷이 지금 원본과 같다

---

## 0. 한눈에 — 옛 것과 새 것

| 옛 것(성경암송) | 새 것(교회 어드민) | 달라지는 것 |
|---|---|---|
| `adminError` — 관리자 비밀번호 하나(1.0) | 카카오 로그인 + 역할 `bibleevent`(`authz.ts` `ACTION_ROLES`) | 액션마다 역할 확인 · `admin_audit` 기록 |
| `eventRoster` — 회차 목록 + 줄 + 자격 계산(1.6) | `evEvents`(회차·인원·`listedNow`·`hasEligibility`) + `evRoster`(한 회차 줄 전부·교적 표시) | 1,000행은 `allRows` · 응답에 `phone`·`memo` 를 싣지 않음 · 자격 계산·미신청 목록은 옮기지 않음 |
| `eventSave` — upsert 하나로 만들기·고치기(1.8) | `evEventCreate`(insert 만 · draft 고정 · `needs` 기본값) + `evEventSave`(보낸 칸만 · `expect` · `needs-confirm`) | 목록 밖 status 는 `bad-status` · 공개 확인 · `before-eligibility` · `needs`·`copy`·`kind`·`sort_order` 를 받지 않음(보내면 조용히 무시 · 새 회차 `sort_order` 는 DB 기본값 0 — 4-2) |
| `eventSetNote` — 담당자 메모(1.7) | `evRowSave` 의 `note` | `expect` 확인 · 500자 넘으면 `note-too-long`(옛것은 말없이 자름) |
| `eventImport` — 그 회차 import 줄을 지우고 다시 넣기(1.9) | `evUploadCheck`/`evUploadSave`(더하기만 · 지우지 않음) · `evRowAdd`(한 분) | 상한 5,000→600 · 다듬기 규칙을 서버 순수 함수로 · 계정 잇기에 `user_identity_aliases` 포함 · `already` 판정 · 자격 회차는 `eligibility-event` · `note` 는 붙임말(`담당자가 더함`·`명단 올리기`)을 붙인 **뒤** 500자 넘으면 `note-too-long` |
| (없음) | `evRowSave`(줄 고치기) · `evRowDelete`(줄 빼기) · `evHistory` · `evStats` · `evPeopleLookup` | 새로 · app 줄과 자격 회차의 줄은 메모만 고치고 빼지 않는다(`app-row-note-only`·`app-row`·`eligibility-event`) |
| `evtListable`·`evtToday`·`EVT_ID_RE`·`EVT_STATUS`(1.4) | `events-rules.ts` `evtListable`·`kstToday`·`EVT_ID_RE`·`EVT_STATUS` | 글자 그대로 |
| `evtImportPosition`(1.9) | `events-rules.ts` `cleanPosition` | 원문 그대로 + 끝에 한 번 더 다듬기(4-2 · 「집사 님」→「집사」) |
| `norm`·`identityKey`(1.2) | `paper.ts` `legacyNorm`·`appIdentityKey`(이미 있음) | NFC 안 함 — 그대로 |
| `MIN_POSITIONS`(1.3) | `paper.ts` `MIN_POSITIONS`(이미 있음) | 막지 않고 경고만(설계 0절 「직분 검사」) |
| `EVT_GU_ORDER`·`evtSubRank`(1.10 공개 명단 차례) | `events-rules.ts` `BE_GU` · `roster-logic.js` `groupRows` | 관리 화면도 공개 명단 차례로(옛 관리 화면 3.9 는 가나다) |
| `evtRule`(1.5 자격 회차 판정) | `events-rules.ts` `isEligEvent`·`eligibilityStart` — `evEvents` 의 `hasEligibility` · `eligibility-event` · `before-eligibility` 가 모두 이 둘만 쓴다 | 4-2 정함 — `needs.eligibility` 가 객체면 모양이 틀려도 자격 회차(막는 쪽) · 시작일은 날짜 꼴일 때만 |
| `admin-event.html`(3절) | `js/menus/bibleevent/roster*.js`·`event-form.js`·`row-form.js` | `prompt`·`alert`·`<select>`·`type=date` 없이 직접 만든 창·고르개 |
| `eventRosterPublic`·`eventOpenList`·`eventSignup`·`eventDrop`·`eventStamps` | 옮기지 않는다 — 성도님 액션, 건드리지 않음 | — |
| `eventExcuse`·자격 회차 미신청 목록 | 옮기지 않는다 — 성경암송에 남김(설계 4-3·7절) | — |

---

## 1. 서버 액션 (`supabase/functions/api/index.ts`)

### 1.0 게이트 — `adminError`(관리자 비밀번호 하나 · 역할 없음)

`supabase/functions/api/index.ts:166-172`:
```ts
// 관리자 비밀 확인 → null이면 통과, 아니면 에러코드
function adminError(b: any): string | null {
  const secret = Deno.env.get("ADMIN_SECRET");
  if (!secret) return "no-password-set";
  if ((b.pw ?? "") !== secret) return "unauthorized";
  return null;
}
```

관리자 이벤트 액션 다섯(`eventRoster`·`eventSetNote`·`eventExcuse`·`eventSave`·`eventImport`)이 모두 첫 줄에서 이것만 부른다.
비밀번호 하나로 관리자 액션 50여 개가 함께 열린다(설계 0절 「방식」에서 B 를 버린 까닭). 새 쪽은 카카오 로그인 + 역할 `bibleevent`.

### 1.1 라우팅 — 이벤트 플랫폼 액션 열

`supabase/functions/api/index.ts:453-466`:
```ts
      // ---- 이벤트 플랫폼 (분기 회차 · 2026-09-10) ----
      //  ⚠️ 바로 위 event* 넷(eventEnter/Status/Board/Entrants)은 옛 「말씀 이벤트」
      //     (퀴즈형, app_config('event') + event_entries)다. 이름이 비슷하지만
      //     표도 흐름도 다르다 — 섞지 말 것.
      case "eventOpenList": return json(await eventOpenList(body));
      case "eventStamps":   return json(await eventStamps(body));
      case "eventSignup":   return json(await eventSignup(body));
      case "eventDrop":     return json(await eventDrop(body));
      case "eventRoster":   return json(await eventRoster(body));
      case "eventSetNote":  return json(await eventSetNote(body));
      case "eventExcuse":   return json(await eventExcuse(body));
      case "eventSave":     return json(await eventSave(body));
      case "eventImport":   return json(await eventImport(body));
      case "eventRosterPublic": return json(await eventRosterPublic(body));
```

`eventOpenList`·`eventStamps`·`eventSignup`·`eventDrop`·`eventRosterPublic` 은 성도님 앱이 부르고,
`eventRoster`·`eventSetNote`·`eventExcuse`·`eventSave`·`eventImport` 는 관리자 비밀번호로 부른다.
얼리기(설계 4-3)는 이 가운데 `eventImport`·`eventSave`·`eventSetNote` 셋이다(막는 줄의 자리는 4-1).

### 1.2 공용 헬퍼 — `norm` / `identityKey` / `kstDay`

`supabase/functions/api/index.ts:152-157`:
```ts
const norm = (s: unknown) => (s ?? "").toString().trim().replace(/\s+/g, " ");
const identityKey = (u: any) =>
  [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(norm).join("|");
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const kstDay = (iso: string) =>
  new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
```

교회 어드민 `supabase/functions/church-admin/paper.ts` 의 `legacyNorm`·`appIdentityKey` 가 이 두 줄을 글자 그대로 옮긴 것이다
(완성형(NFC)으로 바꾸지 않는다). `event_signups.ident_key` 는 반드시 이것으로 만든다 — `authz.ts` 의 `identityKey`(NFC)로
만들면 앱 계정과 영영 안 맞는다.

### 1.3 직분 목록 — `MIN_POSITIONS`

`supabase/functions/api/index.ts:4804-4811`:
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

앱에서 내는 `eventSignup` 은 이 목록으로 **막고**(1.12), 이관 `eventImport` 는 **막지 않고 알리기만** 한다(1.9 `oddPositions`).
교회 어드민 `paper.ts` 에 같은 목록이 있다(app.js · api · DB CHECK · paper.ts 네 곳).

### 1.4 이벤트 블록 머리 · 상수 · 날짜 · 공개 판정 · 성도 응답 한 줄

`supabase/functions/api/index.ts:5079-5139`:
```ts
// 이벤트 플랫폼 (분기 회차) — 2026-09-10
//   설계: docs/superpowers/specs/2026-09-10-event-platform-design.html
//   계획: docs/superpowers/plans/2026-09-10-event-platform.md
//
//   ⚠️ 위쪽 eventEnter/eventStatus/eventBoard/eventEntrants 는 옛 「말씀 이벤트」
//      (퀴즈형, app_config('event') + event_entries)다. 이 블록과 무관하다.
//
//   참여는 앱 로그인으로만 받는다 — user_id 가 신원의 전부이고, 「회차당 한 번」은
//   event_signups 의 unique 제약이 지킨다(서버가 중복을 검사하지 않는다).
//   노출은 설정 키가 아니라 데이터가 결정한다 — 열린 회차가 없으면 목록이 비어 있다.
// ============================================================

const EVT_STATUS = ["draft", "open", "closed", "archived"];
const EVT_KINDS = ["signup", "quiz"];
// 회차 id — URL(?ev=)에 그대로 쓰이므로 좁게 묶는다. js/events.js 와 같은 모양.
const EVT_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const EVT_MEMO_MAX = 300;

// ⚠️ 직분 기본값을 사역신청 기록에서도 찾을 것인가 — 「자기 기록을 자기에게 보여주는
//    것」이라 켜 두었다(설계 질문 2). 안 된다고 결정되면 이 한 줄을 false 로.
//    전화번호는 어느 쪽이든 가져오지 않는다 — privacy/ 가 용도를 한정해 적어 두었다.
const EVT_POSITION_FROM_MINISTRY = true;

// KST 오늘(YYYY-MM-DD). ymd(new Date())는 UTC라 자정 무렵 하루가 어긋난다.
const evtToday = () =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

// 지금 등록을 받는가 — 상태와 날짜를 함께 본다(기간 판정을 서버가 한다)
function evtOpenNow(ev: any, today: string): boolean {
  return ev.status === "open" && today >= ev.opens_on && today <= ev.closes_on;
}

// 지금 성도님께 **보여 줄** 회차인가.
// ⚠️ 「등록을 받는가」와 다른 물음이다. 마감된 뒤에도 명단은 계속 보이는 것이 기본이고
//    (옛 썸머 사이트가 마감되면 조회까지 죽어 막다른 화면이 되던 자리),
//    `list_until` 이 있으면 그날까지만 보인다. 비어 있으면 기한이 없다.
function evtListable(ev: any, today: string): boolean {
  if (ev.status !== "open" && ev.status !== "closed") return false;
  const until = norm(ev.list_until);
  return !until || today <= until;
}

// 화면에 쓸 이름 — 짧은 이름이 있으면 그것을, 없으면 원래 이름을.
//   title       "2026 썸머 써 바이블 완서자 등록"  ← 관리자 목록·명단 제목(길어도 된다)
//   short_title "썸머 써 바이블"                 ← 첫 화면 단추(한 줄에 들어가야 한다)
const evtShown = (ev: any) => norm(ev.short_title) || norm(ev.title);

// 성도에게 돌려줄 참가 기록 한 줄 — 화이트리스트.
// ⚠️ 스프레드(...r)를 쓰지 않는다. user_id · ident_key · note · 신원 스냅샷이
//    구조적으로 빠진다(앱은 이미 자기가 누구인지 안다).
function evtRow(r: any) {
  return {
    id: r.id,
    eventId: r.event_id,
    position: r.position ?? "",
    phone: r.phone ?? "",
    memo: r.memo ?? "",
    answers: r.answers ?? {},
    at: r.created_at,
  };
}
```

- `EVT_ID_RE` — 회차 id. 주소(`?ev=`)에 그대로 쓰인다.
- `EVT_STATUS` — draft·open·closed·archived. DB CHECK(2.1)와 같다.
- `evtToday` — KST 오늘. `ymd(new Date())` 는 UTC 라 자정 무렵 하루가 어긋난다.
- `evtOpenNow`(등록을 받는가)와 `evtListable`(성도님께 보이는가)은 **다른 물음**이다. 마감(closed)도 보이고,
  `list_until` 이 있으면 그날까지만 보인다(비면 기한 없음).
- `evtShown` — 짧은 이름이 있으면 그것. 관리 화면 칩은 `title` 을 쓴다(3.6).
- `evtRow` — 성도님 응답 한 줄의 화이트리스트. `user_id`·`ident_key`·`note` 가 구조적으로 빠진다.

### 1.5 자격 회차 판정 — `evtRule`

`supabase/functions/api/index.ts:5150-5165`:
```ts
// needs.eligibility 를 읽어 규칙으로. 모양이 틀리면 null — 「자격 회차가 아니다」다.
function evtRule(ev: any): any | null {
  const e = ((ev?.needs ?? {}) as any).eligibility;
  if (!e || typeof e !== "object") return null;
  const start = norm(e.start);
  const weeks = Number(e.weeks), perWeek = Number(e.perWeek), need = Number(e.need);
  const minNeed = Number(e.minNeed ?? 2);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  // ⚠️ 정수를 강제한다. 3.5 같은 값이 들어오면 evtCanReach 의 for 경계가 어긋난다.
  if (![weeks, perWeek, need, minNeed].every(Number.isInteger)) return null;
  if (!(weeks >= 1 && weeks <= 26)) return null;
  if (!(perWeek >= 1 && perWeek <= 7)) return null;
  if (!(need >= 1 && need <= weeks)) return null;
  if (!(minNeed >= 1 && minNeed <= need)) return null;
  return { start, weeks, perWeek, need, minNeed };
}
```

⚠️ 성경암송 서버에서 「자격 회차인가」는 `needs.eligibility` 가 **있는가**가 아니라 **이 함수가 규칙을 돌려주는가**다 — 모양이 틀리면
(`start` 가 날짜 꼴이 아님 · 정수가 아님 · 범위 밖) null 이고, 그러면 `eventRoster`·`eventSignup`·`eventStamps` 가 그 회차를 보통 회차로 본다.
새 쪽은 이 차이를 알고 **일부러 다르게** 정했다 — `isEligEvent`(객체면 자격 회차)·`eligibilityStart`(날짜 꼴일 때만) · 4-2.

### 1.6 `eventRoster` — 관리자 명단(회차 목록 + 줄 + 자격 계산)

`supabase/functions/api/index.ts:5462-5589`:
```ts
// ---------- eventRoster: 관리자 명단 (이름·소속·직분·전화번호가 실리는 유일한 자리) ----------
async function eventRoster(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };

  // ⚠️ 관리자 화면의 편집 폼이 이 응답으로 칸을 채운다 — **고칠 수 있는 칸은 빠짐없이**
  //    돌려줘야 한다. 하나라도 빠지면 그 칸이 빈 채로 그려지고, 저장하는 순간
  //    원래 값이 지워진다(2026-09-10 subtitle·kind·sort_order 가 그럴 뻔했다).
  const { data: evs, error: e1 } = await db.from("events")
    .select("id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,sort_order")
    .order("closes_on", { ascending: false });
  if (e1) throw e1;

  // 회차 칩에 적을 건수는 **추리기 전 전체 기준**이어야 한다(필사·사역과 같은 규약).
  // ⚠️ 행을 받아서 세지 않는다 — PostgREST 는 한 번에 1,000행까지만 돌려주고
  //    `.limit(20000)` 으로도 그 위로 못 올린다. 표 전체가 1,000행을 넘는 순간 칩 숫자가
  //    **오류 없이 조용히** 줄어든다(2026-09-29 지난 회차 명단 이관으로 1,723행이 되자
  //    실제 244명인 회차가 0으로 보였다). 회차마다 개수만 묻는다(head — 행은 안 받는다).
  const counts: Record<string, number> = {};
  await Promise.all(((evs ?? []) as any[]).map(async (ev) => {
    const { count, error: e2 } = await db.from("event_signups")
      .select("id", { count: "exact", head: true }).eq("event_id", ev.id);
    if (e2) throw e2;
    counts[ev.id] = count ?? 0;
  }));

  const eventId = norm(b.event_id);
  let q = db.from("event_signups").select("*")
    .order("created_at", { ascending: false }).limit(2000);
  if (eventId) q = q.eq("event_id", eventId);
  const { data, error } = await q;
  if (error) throw error;

  // ── 자격 회차면 「지금 다시 센 값」을 함께 내려 준다 ───────────────────
  // ⚠️ 응모 시점 스냅샷(answers)으로 시상하지 않는다 — 일찍 신청한 분의 스냅샷은
  //    그때 값으로 굳어, 그 뒤 더 채워도 안 바뀐다(일찍 신청한 분이 벌을 받는다).
  // ⚠️ answers 원본은 내보내지 않는다. 파생값만.
  const rowsOut = (data ?? []).map((r: any) => ({
    id: r.id, eventId: r.event_id, name: r.name, whoType: r.who_type,
    group: r.group_name, sub: r.sub_name ?? "", position: r.position ?? "",
    phone: r.phone ?? "", memo: r.memo ?? "", note: r.note ?? "",
    source: r.source, at: r.created_at, hasUser: !!r.user_id,
    excused: !!((r.answers ?? {}) as any).excused,
    // 인정한 까닭 — 담당자만 보는 응답이라 실어도 된다. 화면이 「(인정)」 옆에 그대로 보여 준다.
    excuseReason: norm(((r.answers ?? {}) as any).excuseReason),
  })) as any[];

  let missing: any[] = [];
  let missingTotal = 0;
  const pickedEv = eventId ? (evs ?? []).find((e: any) => e.id === eventId) : null;
  const pickedRule = pickedEv ? evtRule(pickedEv) : null;
  if (pickedRule) {
    // ⚠️ **한 번만 부른다.** 예전에는 신청자마다 evtStampsFor 를 await 했는데,
    //    그 함수는 한 사람당 RPC 두 번(v2_event_weeks + v2_mydays)을 만든다 —
    //    신청자 200명이면 **순차 400왕복**이고, 그중 days 는 이 응답에 쓰지도 않는다.
    //    게다가 아래 「안 하신 분」 계산이 이미 전 교인을 한 번에 받아 온다.
    //    그 한 번의 결과로 둘 다 만든다(200명 기준 401왕복 → 2왕복).
    const { data: all, error: allErr } = await db.rpc("v2_event_weeks", {
      p_start: pickedRule.start, p_weeks: pickedRule.weeks,
      p_per_week: pickedRule.perWeek, p_users: null,
    });
    if (allErr) throw allErr;
    // ⚠️ 창 안에 활동이 없는 사람은 **행이 아예 없다**(0 행이 아니라 부재다).
    //    그래서 못 찾으면 0 주로 친다 — 안 그러면 기록 없는 분이 명단에서 조용히 사라진다.
    const byUser = new Map<string, any>();
    for (const w of ((all ?? []) as any[])) byUser.set(String(w.user_id), w);

    const { data: srows } = await db.from("event_signups")
      .select("id,user_id").eq("event_id", eventId).limit(2000);
    const rowUser = new Map<number, string>();
    for (const sr of ((srows ?? []) as any[])) {
      if (sr.user_id) rowUser.set(sr.id, String(sr.user_id));
    }

    const stampedAt = new Date().toISOString();
    for (const row of rowsOut) {
      const uid = rowUser.get(row.id);
      if (!uid) continue;                       // 이관된 옛 기록(user_id 없음)
      const w = byUser.get(uid) ?? null;
      const weeksDone = Number(w?.weeks_done ?? 0);
      const firstDay = w?.first_day ? String(w.first_day).slice(0, 10) : null;
      const need = evtNeedFor(pickedRule, firstDay);
      row.weeksDone = weeksDone;
      row.perfect = weeksDone >= pickedRule.weeks;
      row.eligible = weeksDone >= need || row.excused;
      row.computedAt = stampedAt;
    }

    // 자격은 되는데 아직 신청 안 하신 분 — 마감 전에 알려 드리려고.
    // ⚠️ 이름·소속만. user_id 를 싣지 않는다.
    const signedUp = new Set([...rowUser.values()]);
    const cand = ((all ?? []) as any[]).filter((w) => {
      if (signedUp.has(String(w.user_id))) return false;
      const fd = w.first_day ? String(w.first_day).slice(0, 10) : null;
      return Number(w.weeks_done) >= evtNeedFor(pickedRule, fd);
    });
    // ⚠️ 300 에서 자른다(.in 의 주소 길이). **자른 사실을 화면이 알아야 한다** —
    //    모르면 담당자가 「이게 전부」로 읽는다. 그래서 총수를 함께 내려 준다.
    missingTotal = cand.length;
    if (cand.length) {
      const { data: us } = await db.from("users")
        .select("id,type,gu,mok,bu,grade,name")
        .in("id", cand.map((w) => String(w.user_id)).slice(0, 300));
      missing = ((us ?? []) as any[]).map((u: any) => ({
        name: norm(u.name),
        whoType: u.type,
        group: u.type === "교구" ? norm(u.gu) : norm(u.bu),
        sub: u.type === "교구" ? norm(u.mok) : norm(u.grade),
      }));
    }
  }

  return {
    ok: true,
    events: (evs ?? []).map((e: any) => ({
      id: e.id, title: e.title, shortTitle: e.short_title ?? "",
      subtitle: e.subtitle ?? "", season: e.season ?? "",
      kind: e.kind, status: e.status, opensOn: e.opens_on, closesOn: e.closes_on,
      listUntil: e.list_until ?? null,
      sortOrder: e.sort_order ?? 0, count: counts[e.id] ?? 0,
      // 지금 성도님께 보이는가 — 관리자가 「왜 안 보이지」를 화면에서 바로 알게.
      listedNow: evtListable(e, evtToday()),
    })),
    rows: rowsOut,
    missing,
    missingTotal,
  };
}
```

- 회차 목록은 `closes_on` 내림차순, 회차마다 `head:true` 개수(1,000행 사고 뒤 커밋 `576acfc`).
- 줄은 `select("*")` + `.limit(2000)` — PostgREST 는 1,000행에서 **오류 없이** 자른다. `event_id` 를 주면 한 회차(지금 최대 515줄)라
  드러나지 않지만, 주지 않으면(화면 첫 진입) 전 회차 2,834행 가운데 1,000행만 온다. 새 쪽은 `allRows`.
- 줄 응답에 `user_id`·`ident_key`·`answers` 원본은 없고 `hasUser`·`excused`·`excuseReason` 파생값만 있다. **`phone`·`memo` 는 싣는다**
  (새 쪽 `RowOut` 은 둘 다 싣지 않는다).
- 자격 회차를 골랐을 때만 `v2_event_weeks` 한 번으로 줄마다 `weeksDone`·`perfect`·`eligible` 과 「아직 신청 안 하신 분」
  (300명에서 자르고 `missingTotal`)을 만든다 — **옮기지 않는다**(성경암송에 남김, 설계 4-3·7절).
- 회차 칸에 `needs`·`copy` 는 없다. `listedNow` 가 여기서 처음 나온다.

### 1.7 `eventSetNote` — 담당자 메모

`supabase/functions/api/index.ts:5591-5608`:
```ts
// ---------- eventSetNote: 담당자 메모 ----------
// ⚠️ note 는 성도님 응답(evtRow·eventRosterPublic)에 절대 실리지 않는다 — 담당자만 본다.
async function eventSetNote(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "bad-args" };
  const note = norm(b.note).slice(0, 500);
  // ⚠️ PostgREST 는 **맞는 행이 없어도 오류를 안 낸다.** 그냥 update 만 하면
  //    없는 id 에도 {ok:true} 가 돌아가, 담당자는 저장된 줄 알지만 아무 일도 안 일어난다.
  //    자매 함수 eventExcuse 와 같은 잣대로 맞춘다 — 없으면 not-found.
  const { data: hit, error } = await db.from("event_signups")
    .update({ note, updated_at: new Date().toISOString() })
    .eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!hit) return { ok: false, error: "not-found" };
  return { ok: true };
}
```

- `norm` 이라 줄바꿈이 빈칸 하나로 접히고, 500자에서 **말없이 잘린다**(새 쪽은 `note-too-long` 으로 거절한다).
- app 줄·import 줄을 가리지 않는다. 동시 고침 검사(`expect`)가 없다 — 나중 저장이 이긴다.
- 0행 update 에 PostgREST 가 오류를 안 내므로 `.select("id").maybeSingle()` 로 `not-found` 를 가린다(새 쪽도 같은 까닭으로 `not-found`).

### 1.8 `eventSave` — 회차 만들기·고치기(upsert 하나)

`supabase/functions/api/index.ts:5635-5701`:
```ts
// ---------- eventSave: 관리자 회차 만들기 / 고치기 ----------
async function eventSave(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };

  const e = (b.event ?? {}) as any;
  const id = norm(e.id);
  if (!EVT_ID_RE.test(id)) return { ok: false, error: "bad-event-id" };

  // ⚠️ **보낸 칸만 바꾼다.** 예전에는 받은 것으로 통째로 덮어썼는데, 그러면 화면에 없는
  //    칸(needs·copy·kind·sort_order)이 저장할 때마다 기본값으로 되돌아간다 —
  //    「무엇을 받는가」가 조용히 초기화되는 자리였다(2026-09-10 관리자 화면을 만들다 찾았다).
  //    클라이언트가 매번 전부 되돌려 보내게 하는 것은 약속에 기대는 것이라 서버에서 막는다.
  //    비우고 싶으면 빈 문자열을 **명시해서** 보내면 된다.
  const { data: cur } = await db.from("events").select("*").eq("id", id).maybeSingle();
  const has = (k: string) => Object.prototype.hasOwnProperty.call(e, k);

  const title = has("title") ? norm(e.title) : (cur ? cur.title : "");
  if (!title) return { ok: false, error: "no-title" };

  const dateOk = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const opens = has("opens_on") ? norm(e.opens_on) : (cur ? String(cur.opens_on) : "");
  const closes = has("closes_on") ? norm(e.closes_on) : (cur ? String(cur.closes_on) : "");
  if (!dateOk(opens) || !dateOk(closes)) return { ok: false, error: "bad-period" };
  if (closes < opens) return { ok: false, error: "period-reversed" };

  const statusIn = norm(e.status);
  const status = has("status") && EVT_STATUS.indexOf(statusIn) >= 0
    ? statusIn : (cur ? cur.status : "draft");
  const kindIn = norm(e.kind);
  const kind = has("kind") && EVT_KINDS.indexOf(kindIn) >= 0
    ? kindIn : (cur ? cur.kind : "signup");
  const objOf = (v: any) => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};

  // 명단 공개 종료일 — 비우면 기한 없음(null). 값이 있으면 날짜 꼴이어야 하고,
  // 등록 마감일보다 앞설 수 없다(마감 전에 명단이 사라지면 앞뒤가 안 맞는다).
  let listUntil: string | null = cur ? (cur.list_until ?? null) : null;
  if (has("list_until")) {
    const v = norm(e.list_until);
    if (!v) listUntil = null;
    else if (!dateOk(v)) return { ok: false, error: "bad-list-until" };
    else if (v < closes) return { ok: false, error: "list-until-before-close" };
    else listUntil = v;
  }

  const row = {
    id,
    title,
    short_title: has("short_title") ? norm(e.short_title) : (cur ? cur.short_title : ""),
    list_until: listUntil,
    subtitle: has("subtitle") ? norm(e.subtitle) : (cur ? cur.subtitle : ""),
    season: has("season") ? norm(e.season) : (cur ? cur.season : ""),
    kind,
    opens_on: opens,
    closes_on: closes,
    status,
    needs: has("needs") ? objOf(e.needs) : (cur ? cur.needs : {}),
    copy: has("copy") ? objOf(e.copy) : (cur ? cur.copy : {}),
    sort_order: has("sort_order") ? (Number(e.sort_order) || 0) : (cur ? cur.sort_order : 0),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await db.from("events")
    .upsert(row, { onConflict: "id" }).select().maybeSingle();
  if (error) throw error;
  return { ok: true, event: data };
}
```

- **보낸 칸만** 바꾼다(`has()` = hasOwnProperty). 만들기와 고치기가 upsert 하나라 **이미 있는 id 로 「만들기」를 하면 고치기가 된다**
  (새 쪽은 `evEventCreate` 가 insert 만 하고 `exists`).
- 검사 차례: `bad-event-id` → `no-title` → `bad-period` → `period-reversed` → (`status`·`kind` 는 목록 밖이면 **오류 없이 기존 값**,
  새 회차면 draft·signup) → `bad-list-until` → `list-until-before-close`.
- ⚠️ `list_until` 검사는 `list_until` 을 **보냈을 때만** 돈다 — `closes_on` 만 뒤로 미루면 `list_until < closes_on` 인 회차가 생길 수 있다
  (DB 에도 CHECK 가 없다). 화면(3.13)은 늘 `list_until` 을 함께 보내 이 길을 밟지 않았다.
- 공개 확인이 없다 — draft 를 open 으로 바꾸는 저장 한 번으로 곧바로 성도님 첫 화면에 뜬다.
- 자격 회차의 `opens_on` 이 `needs.eligibility.start` 보다 앞서도 막지 않는다(2.3 머리 경고뿐).
- `needs`·`copy`·`sort_order`·`kind` 도 받는다(화면은 `needs`·`copy` 를 일부러 안 보낸다 — 3.13). 응답은 upsert 한 행 전체(`needs`·`copy` 포함).

### 1.9 `eventImport` — 옛 명단 이관(그 회차 import 줄을 **지우고** 다시 넣는다)

`supabase/functions/api/index.ts:5790-5932`:
```ts
// ---------- eventImport: 옛 명단 이관 (관리자) ----------
//   ⚠️ 왜 액션인가 — 성도 명단(이름·교구·목장)을 **공개 저장소의 시드 SQL 파일**에
//      넣을 수 없다. 이 저장소는 public 이다. 그래서 시트 → 이 액션 → DB 로 곧장
//      보내고 디스크에도 git 에도 개인정보를 한 줄도 남기지 않는다.
//   ⚠️ 다시 돌려도 안전하다 — 그 회차의 source='import' 행을 먼저 지우고 넣는다.
//      (이관 행은 user_id 가 없어 unique 가 막아 주지 않으므로, 안 지우면 조용히
//       두 배가 된다.)
const EVT_IMPORT_MAX = 5000;

// 옛 시트의 직분 표기를 다듬는다 — '집사님' → '집사' · '안수집사님 (시무/은퇴)' → '안수집사'.
// ⚠️ allowlist(MIN_POSITIONS) 밖이어도 **버리지 않고 그대로 둔다.**
//    옛 썸머 폼에는 「사모님」이 있는데 사역신청 allowlist 에는 사모가 없다. 이관에서
//    그걸 지우면 그분의 직분이 사라진다 — 없는 값을 지어내는 것보다야 낫지만,
//    **있는 값을 버리는 것은 더 나쁘다.** 이관은 「그때 이렇게 냈다」를 남기는 일이다.
//    (앱으로 새로 내는 eventSignup 은 그대로 allowlist 를 강제한다. 그 둘은 다른 일이다.)
//    allowlist 를 넓히는 것은 사역신청과 공유하는 상수라 여기서 혼자 정할 일이 아니다.
function evtImportPosition(v: unknown): string {
  const s = norm(norm(v).replace(/\(.*?\)/g, "")).replace(/님$/, "");
  return s;
}

async function eventImport(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };

  const eventId = norm(b.event_id);
  if (!EVT_ID_RE.test(eventId)) return { ok: false, error: "bad-event-id" };
  const { data: ev } = await db.from("events").select("id").eq("id", eventId).maybeSingle();
  if (!ev) return { ok: false, error: "not-found" };

  const rows = Array.isArray(b.rows) ? b.rows : null;
  if (!rows) return { ok: false, error: "bad-args" };
  if (rows.length > EVT_IMPORT_MAX) return { ok: false, error: "too-many" };

  // ① 신원으로 접는다 — 옛 시트에는 같은 사람이 여러 줄 있을 수 있다(중복 등록).
  //    가장 이른 것만 남긴다.
  const byKey = new Map<string, any>();
  let dropped = 0;
  for (const r of rows) {
    const whoType = norm(r.type) === "교회학교" ? "교회학교" : "교구";
    const isGu = whoType === "교구";
    const group = norm(r.group);
    const sub = norm(r.sub);
    const name = norm(r.name);
    if (!name || !group) { dropped++; continue; }
    const key = identityKey({
      type: whoType,
      gu: isGu ? group : "", mok: isGu ? sub : "",
      bu: isGu ? "" : group, grade: isGu ? "" : sub,
      name,
    });
    const at = norm(r.regDate);
    const prev = byKey.get(key);
    if (prev && String(prev._at || "") <= at) { dropped++; continue; }
    if (prev) dropped++;
    byKey.set(key, {
      event_id: eventId,
      ident_key: key,
      who_type: whoType,
      group_name: group,
      sub_name: sub,
      name,
      position: evtImportPosition(r.position),
      phone: "",
      memo: "",
      note: norm(r.note),
      source: "import",
      _at: at,
    });
  }

  // ② 앱을 쓰는 분이면 user_id 를 채운다 — 그러면 그분은 지난 회차 등록도 앱에서 본다.
  // ⚠️ `.in("identity_key", [키 수백 개])` 로 하지 않는다. 신원 키는 한글이라 URL 인코딩이
  //    길고, 164개만 넣어도 GET 주소가 한도를 넘어 조회가 통째로 실패한다. 그런데 그 실패는
  //    「이어붙은 사람 0명」으로만 보여 **조용히 지나간다**(2026-09-10 운영 이관에서 실제로
  //    겪었다 — 키는 한 글자도 안 틀렸는데 matched 가 0이었다).
  //    users 는 몇백 행이라 통째로 받아 메모리에서 맞추는 편이 짧고 확실하다.
  const idOf = new Map<string, string>();
  {
    const { data: us, error: uerr } = await db.from("users")
      .select("id,identity_key").limit(20000);
    if (uerr) throw uerr;                       // 삼키지 않는다
    (us ?? []).forEach((u: any) => {
      if (u.identity_key) idOf.set(u.identity_key, u.id);
    });
  }

  // ③ 이미 **앱으로** 낸 분과 부딪히지 않게 — 그 회차에 앱 등록이 있으면 이관 행에는
  //    user_id 를 비워 둔다(unique 충돌로 이관이 통째로 멈추는 것을 막는다).
  // ⚠️ `source='import'` 는 세지 않는다. 그 행들은 아래 ④에서 지워질 것이라 자리를
  //    비켜 줄 참인데, 세어 버리면 **재이관할 때마다 이어붙기가 줄어든다**
  //    (2026-09-10 개발에서 실제로 그랬다 — 두 번째 실행에서 matched 가 하나 사라졌다).
  const { data: existing, error: exerr } = await db.from("event_signups")
    .select("user_id").eq("event_id", eventId)
    .not("user_id", "is", null).neq("source", "import");
  if (exerr) throw exerr;                       // 여기도 삼키지 않는다
  const taken = new Set((existing ?? []).map((r: any) => r.user_id));

  let matched = 0;
  let noDate = 0;
  const out = [...byKey.values()].map((r) => {
    const uid = idOf.get(r.ident_key);
    const useUid = uid && !taken.has(uid) ? uid : null;
    if (useUid) { matched++; taken.add(useUid); }
    const at = r._at;
    delete r._at;
    const row: any = { ...r, user_id: useUid };
    // ⚠️ 옛 시트의 등록일시 형식을 모른다. 날짜로 안 읽히면 created_at 을 아예 빼서
    //    DB 기본값(now())이 들어가게 한다 — 형식 하나 때문에 이관이 통째로 멈추지 않게.
    const t = at ? Date.parse(at.replace(" ", "T")) : NaN;
    if (Number.isFinite(t)) row.created_at = new Date(t).toISOString();
    else if (at) noDate++;
    return row;
  });

  // ④ 다시 돌려도 안전하게 — 그 회차의 이관 행을 먼저 지운다(앱 등록은 건드리지 않는다)
  const { error: derr } = await db.from("event_signups")
    .delete().eq("event_id", eventId).eq("source", "import");
  if (derr) throw derr;

  // ⚠️ PostgREST 묶음 삽입은 **모든 행의 키가 같아야** 한다 — 한 행에만 created_at 이
  //    있으면 나머지는 NULL 이 되어 not-null 위반으로 이관이 통째로 멈춘다.
  //    그래서 「날짜를 읽은 것」과 「못 읽은 것」을 갈라 넣는다. 못 읽은 쪽은 키를
  //    아예 빼서 DB 기본값(now())이 들어가게 둔다 — 없는 날짜를 지어내지 않는다.
  let inserted = 0;
  const withDate = out.filter((r) => r.created_at !== undefined);
  const noDateRows = out.filter((r) => r.created_at === undefined)
    .map(({ created_at: _drop, ...rest }) => rest);
  for (const group of [withDate, noDateRows]) {
    for (let i = 0; i < group.length; i += 500) {
      const chunk = group.slice(i, i + 500);
      const { error: ierr } = await db.from("event_signups").insert(chunk);
      if (ierr) throw ierr;
      inserted += chunk.length;
    }
  }

  // allowlist 밖 직분이 몇이나 되는지 알려 준다 — 버리지는 않되 눈에는 보이게.
  const oddPositions = [...new Set(out.map((r: any) => r.position)
    .filter((p: string) => p && !MIN_POSITIONS.has(p)))];

  return { ok: true, received: rows.length, inserted, matched, dropped, noDate, oddPositions };
}
```

- ⚠️ ④ 에서 그 회차의 `source='import'` 줄을 **전부 지운 뒤** 넣는다 — 한 분만 보내면 나머지가 사라진다. 지운 뒤 넣기가 실패하면(→ 500)
  그 회차의 이관 줄이 **빈 채로 남는다**(한 트랜잭션이 아니다). 설계가 이 액션을 서버에서 얼리는 까닭.
- 상한 5,000줄(`too-many`). 이름이나 소속이 비면 버리고 `dropped` 로 센다.
- `type` 이 「교회학교」가 아니면 전부 교구. 소속·목장·이름은 `norm` 만 한다 — 「화평교구」·「20목장」·「07」·이름 끝 숫자 다듬기는
  **없다**(부르는 쪽이 다듬어 보냈다 — 「찾지 못한 것」 4).
- 같은 신원 키는 한 줄로 접고 `regDate` 가 가장 이른 줄을 남긴다.
- 직분은 `evtImportPosition`(괄호 속과 끝 「님」을 뗀다) — 목록 밖이어도 버리지 않고 `oddPositions` 로 알린다.
- 계정 잇기: `users` 를 **통째로** 읽어(`.limit(20000)` — 그래도 1,000행에서 잘린다 · 지금 421명) `identity_key` 가 글자 그대로 같으면 잇는다.
  `user_identity_aliases`(옛 키)는 **보지 않는다.** 그 회차에 앱으로 낸 줄의 계정은 잇지 않는다(`taken`).
- `regDate` 를 날짜로 못 읽으면 `created_at` 을 빼 DB 기본값(now())이 들어가게 한다. 500줄 묶음 insert.
- 응답은 건수만(`received`·`inserted`·`matched`·`dropped`·`noDate`·`oddPositions`) — 이름을 싣지 않는다.

### 1.10 `eventRosterPublic` — 성도님께 보이는 명단(옮기지 않는다 · 묶음 차례의 원본)

`supabase/functions/api/index.ts:5703-5788`:
```ts
// ---------- eventRosterPublic: 성도님께 보이는 명단 ----------
//   회차 하나의 참여자를 소속으로 묶어 돌려준다. 화면 규격은 성도님이 직접 그려 주셨다:
//       화평
//        - 홍길동-20
//   ⚠️ **내보낼 칸을 손으로 못 박는다.** 지금 phone·memo·note 는 비어 있지만 **칸은
//      존재한다.** 나중에 값이 들어갔을 때 `select("*")` 를 펼치는 코드가 있으면 그날로
//      새어 나간다 — 게시판이 정확히 그렇게 user_id 를 흘렸다. 여기서 나가는 것은
//      **이름 · 구분 · 소속 · 세부 · 직분 다섯뿐**이고 id 도 user_id 도 싣지 않는다.
//   ⚠️ 마감된 회차도 보여 준다(status='closed'). 옛 사이트는 마감되면 조회까지 죽었다.
const EVT_GU_ORDER = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
const EVT_BU_ORDER = ["사랑부", "영아부", "유아부", "유치부", "유년부",
                      "초등부", "중등부", "고등부", "청년부"];

// 목장·구역은 글자다 — 「1」~「39」 사이에 **「남성」** 이 섞여 있다.
// 그냥 글자로 정렬하면 1, 12, 2, 3… 이 되고 「남성」이 숫자 사이에 낀다.
// 숫자는 숫자로, 숫자가 아닌 것은 뒤로 보낸다.
function evtSubRank(v: unknown): [number, number, string] {
  const s = norm(v);
  const n = /^\d+$/.test(s) ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) ? [0, n, s] : [1, 0, s];
}

async function eventRosterPublic(b: any) {
  const eventId = norm(b.event_id);
  if (!EVT_ID_RE.test(eventId)) return { ok: false, error: "bad-args" };

  const { data: ev, error: eerr } = await db.from("events")
    .select("id,title,short_title,subtitle,season,status,opens_on,closes_on,list_until")
    .eq("id", eventId).maybeSingle();
  if (eerr) throw eerr;
  // draft·archived 는 성도님께 안 보이고, 명단 공개 종료일이 지나도 안 보인다.
  // (관리자는 eventRoster 로 본다 — 그쪽은 이 제한을 받지 않는다.)
  if (!ev || !evtListable(ev, evtToday())) {
    return { ok: false, error: "not-found" };
  }

  const { data, error } = await db.from("event_signups")
    .select("who_type,group_name,sub_name,name,position")   // ← 다섯 칸만
    .eq("event_id", eventId).limit(5000);
  if (error) throw error;
  const rows = (data ?? []) as any[];

  const bag = new Map<string, any>();
  for (const r of rows) {
    const isGu = r.who_type === "교구";
    const g = norm(r.group_name);
    const k = (isGu ? "g:" : "s:") + g;
    if (!bag.has(k)) {
      const order = isGu ? EVT_GU_ORDER.indexOf(g) : EVT_BU_ORDER.indexOf(g);
      bag.set(k, {
        type: r.who_type, name: g,
        // 교구를 먼저, 교회학교를 뒤에. 목록에 없는 이름은 그 묶음 맨 뒤로.
        _o: (isGu ? 0 : 1000) + (order < 0 ? 900 : order),
        members: [] as any[],
      });
    }
    bag.get(k).members.push({
      name: norm(r.name), sub: norm(r.sub_name), position: norm(r.position),
    });
  }

  const groups = [...bag.values()].sort((a, b2) => a._o - b2._o).map((g) => {
    g.members.sort((m1: any, m2: any) => {
      const [t1, n1, s1] = evtSubRank(m1.sub);
      const [t2, n2, s2] = evtSubRank(m2.sub);
      if (t1 !== t2) return t1 - t2;
      if (n1 !== n2) return n1 - n2;
      if (s1 !== s2) return s1 < s2 ? -1 : 1;
      return m1.name < m2.name ? -1 : (m1.name > m2.name ? 1 : 0);
    });
    return { type: g.type, name: g.name, count: g.members.length, members: g.members };
  });

  return {
    ok: true,
    event: {
      id: ev.id, title: ev.title, shown: evtShown(ev),
      subtitle: ev.subtitle ?? "",
      season: ev.season ?? "", status: ev.status,
      opensOn: ev.opens_on, closesOn: ev.closes_on,
      listUntil: ev.list_until ?? null,
    },
    total: rows.length,
    groups,
  };
}
```

- 로그인 없이 누구나 부른다. `evtListable` 이 아니면 `not-found`. 내보내는 칸은 **이름·구분·소속·세부·직분 다섯**뿐이다
  (담당자가 넣은 줄도 공개 기간 동안 여기 보인다 — 설계 0절 「개인정보 안내」).
- 묶음 차례: 교구(`EVT_GU_ORDER` 차례) → 교회학교(`EVT_BU_ORDER` 차례) → 목록 밖 이름은 그 묶음 뒤. 안에서는 목장 숫자 →
  숫자 아닌 것(「남성」) → 이름. 새 쪽 관리 화면(`roster-logic.js` `groupRows`)이 이 차례를 따른다(옛 관리 화면 3.9 는 가나다였다).
- `.limit(5000)` 이지만 PostgREST 상한 1,000 — 한 회차 최대 515줄이라 지금은 드러나지 않는다.

### 1.11 `eventOpenList` — 첫 화면 회차 목록(옮기지 않는다 · 공개 판정을 쓰는 곳)

`supabase/functions/api/index.ts:5287-5349`:
```ts
// ---------- eventOpenList: 보여 줄 회차 + 내가 낸 것 + 직분 기본값 ----------
async function eventOpenList(b: any) {
  const userId = String(b.user_id ?? "").trim();
  const today = evtToday();
  // draft 는 관리자 비번이 맞을 때만 — b.preview 같은 깃발을 쓰지 않는다.
  // (사역신청이 열어 둔 `|| b.preview` 는 서버가 확인할 수 없는 값이라 복사하지 않는다.)
  const isAdmin = adminError(b) === null;
  const statuses = isAdmin ? ["draft", "open", "closed"] : ["open", "closed"];

  const { data, error } = await db.from("events").select("*").in("status", statuses);
  if (error) throw error;
  const rows = (data ?? []) as any[];

  let mine: any[] = [];
  let hint = "";
  if (userId) {
    const { data: ms, error: merr } = await db.from("event_signups")
      .select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (merr) throw merr;
    mine = (ms ?? []) as any[];
    hint = evtPositionHint(mine) || await evtPositionFromMinistry(userId);
  }
  const mineIds = new Set(mine.map((r) => r.event_id));

  const list = rows
    // ⚠️ 명단 공개 종료일이 지난 회차는 목록에서 아예 뺀다 — 관리자는 예외.
    //    (그래야 첫 화면 단추도 함께 사라진다. 게이트가 이 목록의 길이를 본다.)
    .filter((r) => isAdmin || evtListable(r, today))
    .map((r) => ({
      id: r.id,
      title: r.title,
      shortTitle: r.short_title ?? "",
      shown: evtShown(r),                 // 화면에 쓸 이름(짧은 이름 우선)
      subtitle: r.subtitle ?? "",
      season: r.season ?? "",
      kind: r.kind,
      opensOn: r.opens_on,
      closesOn: r.closes_on,
      listUntil: r.list_until ?? null,
      status: r.status,
      needs: r.needs ?? {},
      copy: r.copy ?? {},
      canSignup: evtOpenNow(r, today),
      // 단추에 「등록」이라 쓸지 「조회」라 쓸지 — 서버가 정해서 내려준다.
      // 화면마다 따로 판단하면 갈라진다.
      verb: evtOpenNow(r, today) ? "등록" : "조회",
      mine: mineIds.has(r.id),
      sortOrder: r.sort_order ?? 0,
    }));

  // 겹칠 때 무엇이 위로 오는지가 곧 「무엇을 먼저 하세요」다.
  //   ① 등록할 수 있고 아직 안 낸 것 ② 마감 가까운 순 ③ sort_order ④ id
  list.sort((x, y) => {
    const px = (x.canSignup && !x.mine) ? 0 : 1;
    const py = (y.canSignup && !y.mine) ? 0 : 1;
    if (px !== py) return px - py;
    if (x.closesOn !== y.closesOn) return x.closesOn < y.closesOn ? -1 : 1;
    if (x.sortOrder !== y.sortOrder) return x.sortOrder - y.sortOrder;
    return x.id < y.id ? -1 : 1;
  });

  return { ok: true, events: list, mine: mine.map(evtRow), positionHint: hint };
}
```

- 관리자 비밀번호가 맞으면 draft 까지, 아니면 open·closed 가운데 `evtListable` 인 회차만 — 이것이 「성도님 첫 화면에 보인다」의 정의다
  (새 쪽 `listedNow`·`needs-confirm` 이 같은 판정을 쓴다).
- 겹칠 때 차례: 등록할 수 있고 아직 안 낸 것 → 마감 가까운 순 → `sort_order` → id.

### 1.12 `eventSignup` / `eventDrop` — 성도님 액션(옮기지 않는다 · 「앱 줄은 메모만」의 근거)

`supabase/functions/api/index.ts:5351-5436`:
```ts
// ---------- eventSignup: 등록 / 고치기(덮어쓰기) ----------
async function eventSignup(b: any) {
  const userId = String(b.user_id ?? "").trim();
  if (!userId) return { ok: false, error: "no-user" };
  const eventId = norm(b.event_id);
  if (!EVT_ID_RE.test(eventId)) return { ok: false, error: "bad-args" };

  const { data: ev, error: eerr } = await db.from("events")
    .select("*").eq("id", eventId).maybeSingle();
  if (eerr) throw eerr;
  if (!ev) return { ok: false, error: "not-found" };

  const isAdmin = adminError(b) === null;
  const today = evtToday();
  if (!evtOpenNow(ev, today) && !isAdmin) {
    // 「아직 안 열렸다」·「아직 안 시작했다」·「마감했다」를 뭉개지 않는다.
    // ⚠️ 옛 코드는 status 가 open 이면 아직 시작 전이어도 「마감했어요」라고 답했다.
    if (ev.status !== "open") return { ok: false, error: "not-open" };
    return { ok: false, error: today < norm(ev.opens_on) ? "not-yet" : "closed-period" };
  }

  // 이름·소속은 앱이 보낸 값을 믿지 않고 users 에서 가져온다.
  const { data: u, error: uerr } = await db.from("users")
    .select("type,gu,mok,bu,grade,name").eq("id", userId).maybeSingle();
  if (uerr) throw uerr;
  if (!u) return { ok: false, error: "no-user" };

  const needs = (ev.needs ?? {}) as any;
  const isGu = u.type === "교구";

  let position = "";
  if (needs.position) {
    position = norm(b.position);
    // 서버에서 allowlist 로 다시 거른다 — 자유 입력이면 표기가 섞여 교적 대조가
    // 도로 사람 손일이 된다(사역신청과 같은 이유·같은 목록).
    if (!MIN_POSITIONS.has(position)) return { ok: false, error: "bad-position" };
  }
  let phone = "";
  if (needs.phone) {
    phone = pilsaPhone(b.phone);
    if (!PILSA_PHONE_RE.test(phone)) return { ok: false, error: "bad-phone" };
  }
  const memo = needs.memo ? norm(b.memo).slice(0, EVT_MEMO_MAX) : "";
  // 자격 회차 — 서버가 다시 센다. **화면이 잠겨 있어도 이 액션은 열려 있다.**
  // ⚠️ b.answers 를 읽지 않는다. JWT 가 없어 누구나 weeks:[9,9,9,9,9,9] 를 보낼 수 있다.
  const rule = evtRule(ev);
  let answers: any;
  if (rule) {
    const st = await evtStampsFor(userId, rule, today);
    if (!st.eligible && !isAdmin) return { ok: false, error: "not-eligible" };
    answers = {
      weeks: st.weekDays,
      weeksDone: st.weeksDone,
      need: st.need,
      rule: { start: rule.start, weeks: rule.weeks, perWeek: rule.perWeek, need: rule.need },
      computed_at: new Date().toISOString(),
    };
  } else {
    answers = (b.answers && typeof b.answers === "object" && !Array.isArray(b.answers))
      ? b.answers : {};
  }

  const row = {
    event_id: eventId,
    user_id: userId,
    ident_key: identityKey(u),
    who_type: u.type,
    group_name: isGu ? norm(u.gu) : norm(u.bu),
    sub_name: isGu ? norm(u.mok) : norm(u.grade),
    name: norm(u.name),
    position,
    phone,
    memo,
    answers,
    source: "app",
    updated_at: new Date().toISOString(),
  };

  // 두 번째 제출은 실패가 아니라 덮어쓰기다 — 「이벤트당 한 번」은 unique 가 지킨다.
  // ⚠️ onConflict 는 event_signups_uniq(일반 unique)를 추론한다. 부분 인덱스로
  //    두면 여기서 "no unique or exclusion constraint matching" 오류가 난다.
  const { data, error } = await db.from("event_signups")
    .upsert(row, { onConflict: "event_id,user_id" }).select().maybeSingle();
  if (error) throw error;
  return { ok: true, signup: evtRow(data) };
}
```

`supabase/functions/api/index.ts:5438-5460`:
```ts
// ---------- eventDrop: 취소 = 행 삭제 ----------
async function eventDrop(b: any) {
  const userId = String(b.user_id ?? "").trim();
  const id = Number(b.id);
  if (!userId || !Number.isFinite(id)) return { ok: false, error: "bad-args" };

  // ⚠️ 순번 id 만으로 지우지 않는다 — 짐작 가능하다. 소유자 조건을 함께 건다.
  const { data: row, error: rerr } = await db.from("event_signups")
    .select("id,event_id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (rerr) throw rerr;
  if (!row) return { ok: false, error: "not-found" };

  const { data: ev } = await db.from("events")
    .select("status,opens_on,closes_on").eq("id", row.event_id).maybeSingle();
  if (!(ev && evtOpenNow(ev, evtToday())) && adminError(b) !== null) {
    return { ok: false, error: "closed-period" };
  }

  const { error } = await db.from("event_signups")
    .delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
  return { ok: true };
}
```

- 이름·소속은 앱이 보낸 값이 아니라 `users` 에서 가져오고 `ident_key = identityKey(u)`, `sub_name = users.mok` **그대로**
  (「07」로 가입한 분은 07 — 설계 1절 「같은 분 판정」 1 의 까닭).
- `(event_id, user_id)` upsert 가 소속·직분·phone·memo·answers·`source='app'`·`updated_at` 을 **통째로 덮는다**.
  `note`·`created_at` 은 보내지 않으므로 남는다. ⚠️ 그래서 담당자가 계정에 이어 둔 import 줄에 그분이 앱에서 내면
  **그 줄이 app 줄이 된다**(같은 `(event_id, user_id)`) — 설계 1절 「같은 분 판정」 6 「이어진 줄의 부작용」.
- 자격 회차면 서버가 다시 센다(`not-eligible`) · 관리자 비밀번호면 통과.
- `eventDrop` 은 `id`+`user_id` 가 맞는 줄만, 등록 기간 안에서만(관리자 비밀번호면 기간 밖도) 지운다 — 이어 둔 import 줄도 그분이 지울 수 있다.

### 1.13 `eventExcuse` — 자격 인정(성경암송에 남긴다)

`supabase/functions/api/index.ts:5610-5633`:
```ts
// ---------- eventExcuse: 사정이 있으셨던 분을 인정 ----------
// 입원·장례·간병처럼 자동 규칙으로 못 잡는 자리. 사유를 반드시 남긴다.
// ⚠️ challenge_log·daily_activity 를 손대지 않는다 — 순위·통계·주간 리포트가 함께 오염된다.
//    event_signups 쪽에만 쓴다.
async function eventExcuse(b: any) {
  const err = adminError(b);
  if (err) return { ok: false, error: err };
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "bad-args" };
  const excused = !!b.excused;
  const reason = norm(b.reason).slice(0, 200);
  if (excused && !reason) return { ok: false, error: "no-reason" };

  const { data: cur, error: e1 } = await db.from("event_signups")
    .select("answers").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!cur) return { ok: false, error: "not-found" };

  const answers = { ...((cur.answers ?? {}) as any), excused, excuseReason: reason };
  const { error } = await db.from("event_signups")
    .update({ answers, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return { ok: true };
}
```

`answers` 에 `excused`·`excuseReason` 을 합쳐 쓴다. 옮기지 않는다(설계 4-3 「남기는 것」·7절). 새 쪽은 `answers` 를 읽지도 쓰지도 않는다.

### 1.14 앱 쪽 API 래퍼 — `js/api.js`(관리자 넷은 부르는 곳이 없다)

`js/api.js:114-125`:
```js
  // ---- 이벤트 플랫폼 (분기 회차) ----
  //  ⚠️ 위 event* 넷(eventEnter/Status/Board/Entrants)은 옛 「말씀 이벤트」(퀴즈형)
  //     것이다. 이름이 비슷하지만 표도 흐름도 다르다 — 섞지 말 것.
  eventOpenList: (user_id) => supaCall("eventOpenList", { user_id }),
  eventStamps: (user_id, event_id) => supaCall("eventStamps", { user_id, event_id }),
  eventSignup: (payload) => supaCall("eventSignup", payload),
  eventDrop: (user_id, id) => supaCall("eventDrop", { user_id, id }),
  eventRosterPublic: (event_id) => supaCall("eventRosterPublic", { event_id }),
  eventRoster: (pw, event_id) => supaCall("eventRoster", { pw, event_id }),
  eventSetNote: (pw, id, note) => supaCall("eventSetNote", { pw, id, note }),
  eventExcuse: (pw, id, excused, reason) => supaCall("eventExcuse", { pw, id, excused, reason }),
  eventSave: (pw, event) => supaCall("eventSave", { pw, event }),
```

`eventRoster`·`eventSetNote`·`eventExcuse`·`eventSave` 래퍼는 부르는 곳이 없다(`git grep` 0건 — 관리 화면은 자기 `callApi` 를 쓴다).
`eventImport` 래퍼는 아예 없다.

---

## 2. DB

### 2.1 `supabase/events.sql` 전문 — 두 표

`supabase/events.sql:1-129`:
```sql
-- 이벤트 플랫폼 — 회차 정의 + 참가 기록
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영(xnomlgydifiqiybervtf).
-- ⚠️ 여러 번 돌려도 안전하다(if not exists · drop/add 쌍).
--
-- 설계: docs/superpowers/specs/2026-09-10-event-platform-design.html
-- 계획: docs/superpowers/plans/2026-09-10-event-platform.md
--
-- 왜 표 둘인가 — 지금 앱의 이벤트는 회차 설정을 app_config('event') 한 행에 담아
-- 다음 회차를 열면 지난 회차가 덮여 사라진다. 분기마다 도는 것이 전제라면
-- 3년에 회차가 열둘이고, 그 시점에는 이미 성도님 기록이 얹혀 있다.
--
-- ⚠️ 이 두 표는 옛 「말씀 이벤트」(퀴즈형)의 event_entries 와 무관하다.
--    그쪽은 app_config('event') + event_entries 로 따로 돌아간다.

-- ① 회차 정의 ------------------------------------------------------
create table if not exists public.events (
  id          text        primary key,          -- 'summer-2026' 사람이 읽는 슬러그
  title       text        not null,             -- '2026 썸머 써 바이블 완서자 등록'
  subtitle    text        not null default '',
  season      text        not null default '',  -- '2026-3Q' 목록 묶음 표기
  kind        text        not null default 'signup',
  opens_on    date        not null,
  closes_on   date        not null,
  status      text        not null default 'draft',
  needs       jsonb       not null default '{}'::jsonb,  -- 무엇을 받는가
  copy        jsonb       not null default '{}'::jsonb,  -- 화면 문구
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- status 가 노출의 문지기다. 날짜와 따로 논다:
--   draft    성도님께 안 보인다(관리자 미리보기만)
--   open     날짜 안이면 등록 가능 · 밖이면 「마감했어요」. 조회는 언제나 된다
--   closed   등록 불가 · 조회는 된다   ← 옛 사이트가 마감 시 조회까지 죽던 자리
--   archived 목록에서 사라진다(관리자만)
alter table public.events drop constraint if exists events_status_chk;
alter table public.events add  constraint events_status_chk
  check (status in ('draft', 'open', 'closed', 'archived'));

alter table public.events drop constraint if exists events_kind_chk;
alter table public.events add  constraint events_kind_chk
  check (kind in ('signup', 'quiz'));

-- 마감일이 시작일보다 앞설 수 없다(화면·서버에도 있지만 마지막 방어선을 DB에 둔다)
alter table public.events drop constraint if exists events_period_chk;
alter table public.events add  constraint events_period_chk
  check (closes_on >= opens_on);

create index if not exists idx_events_status on public.events (status, closes_on);

-- ② 참가 기록 ------------------------------------------------------
create table if not exists public.event_signups (
  id          bigserial   primary key,
  event_id    text        not null references public.events (id) on delete cascade,

  -- 앱에서 낸 것은 반드시 채워진다. NULL 은 이관된 옛 기록뿐이다.
  user_id     uuid        references public.users (id) on delete cascade,

  -- users.identity_key 와 **같은 규칙**(여섯 조각). 쓰임은 둘뿐이다:
  --   ① 이관된 옛 기록(user_id 없음)을 사람에 붙이기
  --   ② 직분 기본값을 지난 기록에서 찾기
  -- 중복 판정은 이 칸이 하지 않는다 — user_id 가 한다.
  ident_key   text        not null,

  -- 신원 스냅샷 — 그때 무엇을 냈는지가 남는다(사역신청과 같은 이유).
  who_type    text        not null,              -- '교구' | '교회학교'
  group_name  text        not null,              -- 교구 | 부서
  sub_name    text        not null default '',   -- 목장 | 학년
  name        text        not null,

  position    text        not null default '',   -- needs.position 일 때만
  phone       text        not null default '',   -- needs.phone 일 때만
  memo        text        not null default '',   -- 성도가 남기는 한 줄
  answers     jsonb       not null default '{}'::jsonb,

  note        text        not null default '',   -- 담당자 메모 — 성도 응답에 절대 싣지 않는다
  source      text        not null default 'app',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 「이벤트당 한 번」 — 이 한 줄이 중복 검사를 대신한다.
  -- ⚠️ 부분 인덱스(where user_id is not null)로 쓰면 안 된다 — PostgreSQL 은 부분
  --    인덱스를 ON CONFLICT 추론에 쓰지 못해 upsert(고치기)가 통째로 막힌다.
  --    일반 unique 로 두면 의도가 그대로 지켜진다: unique 제약은 NULL 을 서로 다른
  --    값으로 보므로(기본 NULLS DISTINCT) user_id 가 NULL 인 이관 행은 몇 개든
  --    들어가고, user_id 가 있는 앱 등록만 회차당 하나로 묶인다.
  constraint event_signups_uniq unique (event_id, user_id)
);

-- 참여는 앱을 통해서만 — user_id 없는 행은 「이관된 옛 기록」뿐이다.
alter table public.event_signups drop constraint if exists event_signups_app_only_chk;
alter table public.event_signups add  constraint event_signups_app_only_chk
  check (user_id is not null or source = 'import');

alter table public.event_signups drop constraint if exists event_signups_source_chk;
alter table public.event_signups add  constraint event_signups_source_chk
  check (source in ('app', 'import'));

create index if not exists idx_event_signups_at
  on public.event_signups (event_id, created_at desc);

-- 회차를 넘어 「이 사람의 기록」을 찾는다 — 직분 기본값 · 옛 기록 매칭
create index if not exists idx_event_signups_ident
  on public.event_signups (ident_key);

-- ③ RLS — 정책을 두지 않는다 = 기본 차단. Edge Function(service_role)만 통과.
-- ⚠️ event_entries 가 이 한 줄을 빠뜨려 user_id 47건이 공개 키로 읽힌 사고가 있었다.
alter table public.events        enable row level security;
alter table public.event_signups enable row level security;

-- 확인 ①: 표와 제약이 다 들어갔는지 (아래 10개가 나와야 한다)
--   events_kind_chk · events_period_chk · events_pkey · events_status_chk ·
--   event_signups_app_only_chk · event_signups_event_id_fkey · event_signups_pkey ·
--   event_signups_source_chk · event_signups_uniq · event_signups_user_id_fkey
--
-- select conname from pg_constraint
--  where conrelid in ('public.events'::regclass, 'public.event_signups'::regclass)
--  order by 1;

-- 확인 ②: RLS 가 켜졌는지 — 둘 다 t 여야 한다. f 면 여기서 멈출 것.
-- select relname, relrowsecurity from pg_class
--  where relname in ('events','event_signups');

-- 확인 ③: 공개 키로 새어 나가지 않는지 (행이 담긴 배열이 오면 열려 있는 것이다)
-- curl -s "https://<ref>.supabase.co/rest/v1/events?select=*&limit=1" -H "apikey: <anon>"
```

- `events.status` CHECK(draft·open·closed·archived) · `kind` CHECK(signup·quiz) · `closes_on >= opens_on` CHECK.
- `event_signups.event_id` 는 `on delete cascade`(회차를 지우면 줄도) · **`user_id` 도 `on delete cascade`** — 계정을 지우면 그 계정에
  이어진 줄(담당자가 넣고 이어 둔 import 줄 포함)이 함께 사라진다.
- `unique (event_id, user_id)` 는 NULLS DISTINCT — `user_id` 없는 줄의 중복은 DB 가 막지 않는다(설계 1절 「같은 분 판정」 3).
- `user_id` 가 없으면 `source='import'` 여야 한다(app_only CHECK) · `source` ∈ app·import.
- `who_type`·`group_name` 에는 CHECK 가 없다(서버가 막아야 한다). `updated_at` 을 채우는 트리거가 없다(코드가 넣는다).
- RLS 켜짐 · 정책 없음. `revoke ... from anon, authenticated` 줄은 없다(RLS 가 막는다).

### 2.2 `supabase/events_display.sql` 전문 — `short_title` · `list_until`

`supabase/events_display.sql:1-37`:
```sql
-- 이벤트 플랫폼 — 화면용 짧은 이름 + 명단 공개 종료일
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: Supabase 대시보드 → SQL Editor에 붙여넣고 실행
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영(xnomlgydifiqiybervtf).
-- ⚠️ 여러 번 돌려도 안전하다(add column if not exists).
--
-- ⚠️⚠️ **이 SQL 을 두 DB 에 먼저 돌린 뒤에야 코드를 커밋한다.**
--    새 코드가 이 칸들을 읽는데, 칸이 없으면 eventOpenList 가 통째로 실패하고
--    그러면 첫 화면 이벤트 단추가 죽는다. 그리고 이 저장소는 작업 트리를 여러
--    세션이 공유해서, **커밋하지 않아도 누가 배포하면 함께 나간다.**
--    (2026-09-10 psalm_frames 건이 정확히 그 사고였다.)
--
-- 설계: docs/superpowers/specs/2026-09-10-event-platform-design.html

alter table public.events
  -- 화면에 쓰는 짧은 이름. 비어 있으면 title 을 쓴다.
  --   title       "2026 썸머 써 바이블 완서자 등록"   ← 관리자 목록·명단 제목용(길어도 된다)
  --   short_title "썸머 써 바이블"                  ← 첫 화면 단추용(한 줄에 들어가야 한다)
  -- ⚠️ 첫 화면 단추는 **한 줄이 규칙**이다. 22자면 폰(390px)에서 두 줄로 넘어가고,
  --    글씨 크게 쓰시는 어르신 설정에서는 확실히 넘친다.
  add column if not exists short_title text not null default '',

  -- 명단을 언제까지 보여 줄 것인가(KST 날짜). **null 이면 기한 없음**(지금까지의 동작).
  -- ⚠️ closes_on 과 다른 것이다:
  --      closes_on  = 등록을 언제까지 받나   (지나면 등록만 막힌다)
  --      list_until = 명단을 언제까지 보이나 (지나면 성도님께 아예 안 보인다)
  --    마감 뒤에도 명단은 계속 보이는 것이 기본이다 — 옛 썸머 사이트가 마감되면
  --    조회까지 죽어 막다른 화면이 되던 것을 고친 자리라, 그 성질을 지운 게 아니라
  --    **끝나는 날을 정할 수 있게** 한 것이다.
  add column if not exists list_until date;

-- 확인:
-- select id, title, short_title, status, opens_on, closes_on, list_until from public.events;
--
-- 지금 있는 회차에 짧은 이름을 넣고 싶으면(예시 — 어드민 화면에서 해도 된다):
-- update public.events set short_title = '썸머 써 바이블' where id = 'summer-2026';
```

`events.sql` 에 없는 두 칸은 여기서 더했다. `short_title` 은 첫 화면 단추(한 줄 — 서버 상한은 없고 화면 `maxlength="20"` 뿐),
`list_until` 은 null 이면 기한 없음.

### 2.3 `supabase/event_stamp_2026.sql` 전문 — 가을 회차 한 건(다른 쓰는 길 ①)

`supabase/event_stamp_2026.sql:1-75`:
```sql
-- 가을 말씀 동행 — **이 회차 한 건**의 행과 규칙 (자료)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
--
-- 적용: 개발 먼저, 확인한 뒤 운영. 여러 번 돌려도 안전하다(on conflict do update).
-- 구조(RPC·인덱스)는 supabase/event_streak.sql 에 있다 — 그것을 먼저 돌린다.
-- 설계: docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md
--
-- ⚠️ status 는 **draft** 로 넣는다. 개시는 2026-10-11 아침에 담당자가
--    admin-event.html 에서 draft → open 으로 한 번 바꾸는 것이다(사람이 손으로 한다).
-- ⚠️ 측정 창(needs.eligibility.start + weeks)과 신청 창(opens_on/closes_on)은 **다르다.**
--    3주가 가장 빨리 성립하는 날이 10/27 이라, 그전에 신청을 열면 화면이 16일 동안
--    「등록하세요」라고 거짓말한다.
-- ⚠️ 날짜를 옮기면 app.js 의 FEAT_SINCE.stamp 도 함께 옮긴다(7일 단위로만).
-- ⚠️ **opens_on 은 언제나 eligibility.start 보다 뒤여야 한다.** 앞서면 화면은
--    「10월 11일에 시작해요」(phase=before)라고 하면서 신청 단추는 열린 상태가 된다
--    — 두 값을 보는 잣대가 다르기 때문이다(phase 는 start, 신청 가능은 opens_on).
--    2026-09-23 개발에서 날짜를 당겨 시험하다 실제로 그 상태를 만들어 봤다.

insert into public.events
  (id, title, short_title, subtitle, season, kind, status,
   opens_on, closes_on, list_until, sort_order, needs, copy)
values (
  'autumn-2026',
  '2026 가을 말씀 동행',
  '가을 말씀 동행',
  '여섯 주 가운데 세 주를 채우시면 신청이 열려요',
  '2026-4Q',
  'signup',
  'draft',
  '2026-10-27',          -- 신청 시작(3주가 가장 빨리 성립하는 날)
  '2026-11-28',          -- 신청 마감(측정은 11/21 에 끝난다 — 일주일 여유)
  '2026-12-13',          -- 명단 공개 종료. ⚠️ 비우면 12월에도 첫 화면에 박혀 있다
  10,
  jsonb_build_object(
    'eligibility', jsonb_build_object(
      'start',   '2026-10-11',   -- 주일
      'weeks',   6,
      'perWeek', 3,
      'need',    3,
      'minNeed', 2               -- 이벤트 중 처음 오신 분의 최소 필요 주수
    )
  ),
  jsonb_build_object(
    'intro',
      '하루에 한 번만 말씀과 함께하면 그날 한 칸이 채워져요.' || chr(10) ||
      '한 주에 3일이면 그 주가 채워집니다 — 매일 하지 않아도 돼요.' || chr(10) ||
      '여섯 주 가운데 세 주만 채우시면 신청 단추가 열려요.' || chr(10) ||
      '신청하신 분께는 모두 드립니다.',
    'doneBadge', '✅ 신청하셨어요',
    'mineBtn',   '신청 내용 보기 →',
    'sentState', '신청'
  )
)
on conflict (id) do update set
  title       = excluded.title,
  short_title = excluded.short_title,
  subtitle    = excluded.subtitle,
  season      = excluded.season,
  opens_on    = excluded.opens_on,
  closes_on   = excluded.closes_on,
  list_until  = excluded.list_until,
  sort_order  = excluded.sort_order,
  needs       = excluded.needs,
  copy        = excluded.copy,
  updated_at  = now();
-- ⚠️ status 는 일부러 안 덮어쓴다 — 개시한 뒤 이 파일을 다시 돌려도
--    성도님 화면이 draft 로 되돌아가지 않게.

-- 확인 ① 규칙이 제대로 들어갔는지
-- select id, status, opens_on, closes_on, list_until, needs->'eligibility'
--   from public.events where id = 'autumn-2026';

-- 확인 ② 지금 성도님께 보이는 회차가 몇 개인지 — 둘이면 첫 화면이 「이벤트 2개」로 접힌다
-- select id, status, opens_on, closes_on, list_until from public.events
--  where status in ('open','closed') order by closes_on;
```

- `on conflict (id) do update` 가 제목·짧은 이름·부제·묶음·기간·`list_until`·`sort_order`·`needs`·`copy` 를 **덮어쓴다**(`status` 만 안 덮는다).
  교회 어드민에서 회차 설정을 고친 뒤 이 파일을 다시 돌리면 고친 것이 사라진다 — 설계 4-3 ①.
- 머리 8-9행 「2026-10-11 아침에 담당자가 admin-event.html 에서 draft → open」 — 설계 4-3 ② 가 고칠 문구.
- 머리 14-17행 「opens_on 은 언제나 eligibility.start 보다 뒤」 — 새 쪽 `before-eligibility` 검사의 원문.

### 2.4 `supabase/member_merge.sql` 발췌 — 계정 합치기가 이벤트 줄을 건드리는 자리

`supabase/member_merge.sql:18-41`:
```sql
-- 예전 앱이 합치기 전 번호로 저장하더라도 대상 사용자에게 기록된다.
-- 합치기와 저장이 겹치면 트랜잭션 잠금을 기다린 뒤 최신 연결을 확인한다.
create or replace function public.redirect_merged_member_write()
returns trigger language plpgsql security invoker set search_path = public as $$
declare col text; original text; resolved uuid; row_data jsonb := to_jsonb(new); saved_stage integer;
begin
  perform pg_advisory_xact_lock(7240910, 1);
  foreach col in array tg_argv loop
    original := row_data->>col;
    if original ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select target_user_id into resolved from public.user_merges where source_user_id = original::uuid;
      if found then row_data := jsonb_set(row_data, array[col], to_jsonb(resolved::text)); end if;
    end if;
  end loop;
  if tg_table_name='progress' then
    select stage into saved_stage from public.progress where user_id=(row_data->>'user_id')::uuid
      and verse_no=(row_data->>'verse_no')::int and lang=row_data->>'lang';
    if found then row_data := jsonb_set(row_data, '{stage}', to_jsonb(greatest(saved_stage,(row_data->>'stage')::int))); end if;
  end if;
  new := jsonb_populate_record(new, row_data);
  return new;
end;
$$;
revoke all on function public.redirect_merged_member_write() from public, anon, authenticated;
```

`supabase/member_merge.sql:43-59`:
```sql
do $$
declare t text;
begin
  foreach t in array array['progress','challenge_log','reviews','passage_progress','blessing_log','feature_log',
    'board_posts','board_replies','board_reactions','event_entries','push_subscriptions',
    'pilsa_orders','ministry_orders','event_signups','daily_activity'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists redirect_merged_member_write on public.%I', t);
      execute format('create trigger redirect_merged_member_write before insert or update on public.%I for each row execute function public.redirect_merged_member_write(''user_id'')', t);
    end if;
  end loop;
  if to_regclass('public.rank_cheers') is not null then
    drop trigger if exists redirect_merged_member_write on public.rank_cheers;
    create trigger redirect_merged_member_write before insert or update on public.rank_cheers
      for each row execute function public.redirect_merged_member_write('from_user_id','target_user_id');
  end if;
end $$;
```

`supabase/member_merge.sql:125-130`:
```sql
  if to_regclass('public.event_signups') is not null then
    if exists(select 1 from public.event_signups a join public.event_signups b on a.event_id=b.event_id
      where a.user_id=s.id and b.user_id=t.id) then
      return jsonb_build_object('ok',false,'error','merge-signup-conflict');
    end if;
  end if;
```

- `event_signups` 에는 **BEFORE INSERT OR UPDATE 트리거** `redirect_merged_member_write` 가 걸린다(이 파일이 DB 에 적용됐다면 —
  「찾지 못한 것」 7). 합쳐져 사라진 옛 계정 id 로 쓰면 새 계정 id 로 바꿔 넣고, 줄마다 전역 잠금 `pg_advisory_xact_lock(7240910, 1)`
  (`member_login` 과 같은 잠금)을 잡는다. 교회 어드민의 insert·update 도 이 트리거를 지난다.
- 두 계정이 같은 회차에 모두 줄이 있으면 합치기가 `merge-signup-conflict` 로 멈춘다 — 담당자가 이어 둔 줄이 합치기를 막을 수 있다.

---

## 3. 화면 (`admin-event.html`) — 🎉 이벤트 관리

### 3.0 머리 — 파일을 따로 둔 까닭

`admin-event.html:1-18`:
```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>이벤트 관리 | 고척교회 성경암송</title>
<link rel="icon" href="favicon.png" />
<!--
  이벤트 플랫폼 관리자 화면 — 2026-09-10
    설계: docs/superpowers/specs/2026-09-10-event-platform-design.html
    계획: docs/superpowers/plans/2026-09-10-event-platform.md (4단계)

  ⚠️ admin-stats.html 이 아니라 새 파일로 지었다. 그 파일은 188KB 이고 여러 작업이
     함께 쓰고 있어, 여기에 또 얹으면 충돌 표면만 커진다.
  ⚠️ 웹폰트를 부르지 않는다(글꼴 765KB 사건) · ?v= 캐시 태그를 붙이지 않는다
     — bump.py 는 루트 index.html 만 손보므로 붙여 봐야 거짓 안심만 준다.
     고친 뒤에는 Ctrl+F5 한 번.
-->
```

### 3.1 CSS 전문

`admin-event.html:19-119`:
```html
<style>
*{box-sizing:border-box}
body{margin:0;background:#f5f6f8;color:#232730;
  font-family:"Malgun Gothic","맑은 고딕",system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6}
.topbar{background:#1a3a6b;color:#fff;padding:13px 18px;display:flex;align-items:center;
  justify-content:space-between;gap:10px;flex-wrap:wrap}
.topbar h1{margin:0;font-size:1.05rem;font-weight:800}
.topbar a,.topbar button{padding:8px 13px;border-radius:9px;font-weight:700;font-size:.82rem;
  text-decoration:none;white-space:nowrap;cursor:pointer}
.topbar a{border:1.5px solid rgba(255,255,255,.5);color:#fff;background:none}
.topbar button{border:none;background:rgba(255,255,255,.18);color:#fff}
main{max-width:1080px;margin:0 auto;padding:18px 16px 80px}

.login-card{max-width:380px;margin:60px auto;background:#fff;border:1px solid #e3e7ee;
  border-radius:14px;padding:26px 24px;text-align:center}
.login-card h2{margin:0 0 6px;font-size:1.1rem;color:#1a3a6b}
.login-card p{margin:0 0 16px;color:#5a6273;font-size:14px}
.login-card input{width:100%;padding:11px 12px;border:1.5px solid #d8dde6;border-radius:9px;
  font-size:16px;margin-bottom:10px}
.login-card button{width:100%;padding:12px 0;border:none;border-radius:9px;background:#1a3a6b;
  color:#fff;font-size:15px;font-weight:800;cursor:pointer}
.err{background:#fbeeec;border:1px solid #e6bdb6;color:#a8322a;border-radius:8px;
  padding:9px 11px;font-size:13.5px;margin-bottom:10px}
.err:empty{display:none}

.card{background:#fff;border:1px solid #e3e7ee;border-radius:13px;padding:16px 18px;margin-bottom:16px}
.card h2{margin:0 0 4px;font-size:1rem;color:#1a3a6b}
.card .sub{margin:0 0 12px;font-size:13px;color:#6a7383}

.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{border:1.5px solid #d8dde6;background:#fff;color:#40495a;border-radius:999px;
  padding:7px 13px;font-size:13.5px;font-weight:700;cursor:pointer;display:inline-flex;
  align-items:center;gap:6px}
.chip.on{background:#1a3a6b;border-color:#1a3a6b;color:#fff}
.chip em{font-style:normal;font-weight:800;font-size:12px;opacity:.8}
.chip .st{font-size:11px;padding:1px 6px;border-radius:5px;background:#eef1f6;color:#5a6273}
.chip.on .st{background:rgba(255,255,255,.22);color:#fff}

.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}
.bar input,.bar select{padding:8px 10px;border:1.5px solid #d8dde6;border-radius:8px;font-size:14px}
.bar input[type=search]{min-width:190px}
.btn{padding:8px 14px;border:1.5px solid #1a3a6b;background:#eef1f8;color:#1a3a6b;
  border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}
.btn.p{background:#1a3a6b;color:#fff}
.btn[disabled]{opacity:.55;cursor:default}

.sum{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;margin:10px 0 4px;font-size:14px}
.sum b{font-size:17px;color:#1a3a6b}
.tag{font-size:12.5px;background:#eef1f6;border-radius:6px;padding:2px 8px;color:#42506a}

.tw{overflow-x:auto;border:1px solid #e3e7ee;border-radius:10px;background:#fff}
table{border-collapse:collapse;width:100%;font-size:14px;min-width:640px}
th,td{padding:8px 11px;border-bottom:1px solid #eef1f5;text-align:left;white-space:nowrap}
thead th{background:#f7f8fb;color:#42506a;font-size:12.5px;font-weight:800;
  position:sticky;top:0;border-bottom:1.5px solid #e3e7ee;cursor:pointer;user-select:none}
tbody tr:last-child td{border-bottom:0}
tbody tr:nth-child(even){background:#fbfcfd}
td.num{text-align:right;font-variant-numeric:tabular-nums;color:#6a7383}
.badge{font-size:11.5px;padding:1px 7px;border-radius:5px;font-weight:700}
.badge.gu{background:#eef1f8;color:#1a3a6b}
.badge.sc{background:#f0f6ee;color:#2f6b4f}
.badge.app{background:#e9f2ff;color:#1a5aa8}
.badge.imp{background:#f4f1e8;color:#7a6220}
.empty{padding:40px 16px;text-align:center;color:#7a8394}

.form{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:11px}
.form label{display:block;font-size:12.5px;font-weight:800;color:#42506a;margin-bottom:4px}
.form input,.form select{width:100%;padding:9px 10px;border:1.5px solid #d8dde6;border-radius:8px;font-size:14px}
.form .wide{grid-column:1/-1}
.note{background:#fdf9ef;border:1px solid #ecdcb8;border-radius:9px;padding:10px 12px;
  font-size:13.5px;color:#6b5620;line-height:1.7;margin-top:10px}
.ok{background:#eef6f1;border:1px solid #bcd9c8;color:#2f6b4f;border-radius:8px;
  padding:9px 11px;font-size:13.5px;margin:10px 0}
.ok:empty,.note:empty{display:none}

/* 묶음 보기 — 소속으로 묶고 한 줄에 여러 명. 주보·공지에 그대로 옮겨 적기 좋다. */
.gv-g{margin:0 0 13px;break-inside:avoid}
.gv-t{font-weight:800;color:#1a3a6b;background:#eef1f8;border-radius:8px;
  padding:6px 11px;font-size:14px}
.gv-t em{font-style:normal;font-weight:700;font-size:12px;color:#6b7688;margin-left:7px}
.gv-l{display:flex;flex-wrap:wrap;margin-top:7px;padding-left:4px;line-height:1.9}
.gv-l span{font-size:14px;color:#2f3947;white-space:nowrap}
.gv-l span::after{content:"·";color:#b9c1cf;margin:0 8px}
.gv-l span:last-child::after{content:""}
.gv-l span.app{font-weight:700}
@media print{
  .gv-t{background:none;border-bottom:1px solid #999;border-radius:0;padding:2px 0}
  .gv-l{line-height:1.7}
  .gv-l span{font-size:12px}
}
@media print{
  .topbar,.bar,.chips,.no-print,.btn{display:none!important}
  body{background:#fff}
  main{max-width:none;padding:0}
  .card{border:none;padding:0;margin:0 0 8px}
  .tw{border:none}
  thead th{position:static}
  table{min-width:0;font-size:12px}
  th,td{padding:4px 6px}
}
</style>
```

### 3.2 뼈대 마크업

`admin-event.html:120-131`:
```html
</head>
<body>
<div class="topbar">
  <h1>🎉 이벤트 관리</h1>
  <div style="display:flex;align-items:center;gap:8px">
    <a href="admin.html">← 관리자 허브</a>
    <button id="logout" hidden>로그아웃</button>
  </div>
</div>
<main id="app"></main>

<script src="js/config.js"></script>
```

### 3.3 상수 · 상태 · 호출 · 비밀번호 확인

`admin-event.html:132-175`:
```html
<script>
// 어느 프로젝트를 볼지는 js/config.js 가 주소를 보고 정한다(개발이면 「개발 DB」 띠가 뜬다).
const API = window.SUPA.URL + "/functions/v1/api";
const ANON = window.SUPA.ANON;
const PW_KEY = "admin-pw";            // 허브·통계 화면과 공유(같은 도메인)
const app = document.getElementById("app");
const logoutBtn = document.getElementById("logout");

const EV_STATUS = ["draft", "open", "closed", "archived"];
const EV_STATUS_KO = { draft:"준비 중", open:"열림", closed:"마감", archived:"보관" };

let evEvents = [];       // 회차 목록
let evRows = [];         // ⚠️ 「지금 고른 회차」가 아니다 — load(pick) 을 인자 없이 부르면(첫 진입·
                          //    로그인 직후) 서버가 event_id 필터 없이 **전 회차**를 담아 준다.
                          //    회차 하나로 좁힌 값이 필요하면 반드시 curRows() 를 쓸 것.
let evMissing = [];      // 자격은 되는데 아직 신청 안 하신 분(이름·소속만 — user_id 없음)
let evMissingTotal = 0;  // ⚠️ evMissing 은 300명에서 잘린다 — 이건 자르기 전 총수다.
let evPick = "";         // 고른 회차 id
let evSort = { key:"at", dir:-1 };
let evQ = "", evType = "", evGroup = "";
// 표 / 묶음 — 고른 것을 기억한다(볼 때마다 다시 고르게 하지 않는다)
let evView = (function(){ try { return localStorage.getItem("ev-view") || "table"; }
                          catch(e){ return "table"; } })();

function getPw(){ return sessionStorage.getItem(PW_KEY) || ""; }
function esc(v){
  return String(v==null?"":v).replace(/[&<>"']/g,
    m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
}
async function callApi(payload){
  const res = await fetch(API, { method:"POST",
    headers:{ "Content-Type":"application/json", "apikey":ANON, "Authorization":"Bearer "+ANON },
    body: JSON.stringify(payload) });
  let d={}; try{ d=await res.json(); }catch(_){}
  if(!res.ok && !d.error) d={ ok:false, error:"HTTP "+res.status };
  return d;
}
// 응답이 unauthorized 면 비번이 바뀐 것 — 저장된 것을 버리고 로그인으로 되돌린다.
function guard(d){
  if(d && d.error === "unauthorized"){
    sessionStorage.removeItem(PW_KEY); renderLogin(); return false;
  }
  return true;
}
```

### 3.4 로그인 — `renderLogin`

`admin-event.html:177-201`:
```html
// ---------- 로그인 ----------
function renderLogin(){
  logoutBtn.hidden = true;
  app.innerHTML = `
    <div class="login-card">
      <h2>🔒 관리자 로그인</h2>
      <p>이벤트 회차와 명단을 보려면 관리자 비밀번호를 입력하세요.</p>
      <div class="err" id="lerr"></div>
      <input type="password" id="pw" placeholder="비밀번호" autocomplete="current-password" />
      <button id="login">로그인</button>
    </div>`;
  const pw = document.getElementById("pw");
  const go = async () => {
    const v = pw.value.trim();
    if(!v){ document.getElementById("lerr").textContent = "비밀번호를 입력해 주세요."; return; }
    const d = await callApi({ action:"authCheck", pw:v });
    if(d && d.ok){ sessionStorage.setItem(PW_KEY, v); load(); }
    else document.getElementById("lerr").textContent =
      d && d.error === "no-password-set" ? "서버에 관리자 비밀번호가 설정되어 있지 않습니다."
                                         : "비밀번호가 맞지 않습니다.";
  };
  document.getElementById("login").addEventListener("click", go);
  pw.addEventListener("keydown", e => { if(e.key === "Enter") go(); });
  pw.focus();
}
```

### 3.5 불러오기 — `load`

`admin-event.html:203-231`:
```html
// ---------- 불러오기 ----------
async function load(pick){
  logoutBtn.hidden = false;
  app.innerHTML = `<div class="card"><div class="empty">불러오는 중…</div></div>`;
  const d = await callApi({ action:"eventRoster", pw:getPw(), event_id: pick || "" });
  if(!guard(d)) return;
  if(!d.ok){
    app.innerHTML = `<div class="card"><div class="err">불러오지 못했습니다 — ${esc(d.error||"")}</div>
      <button class="btn" onclick="location.reload()">다시 시도</button></div>`;
    return;
  }
  evEvents = d.events || [];
  evRows = d.rows || [];
  // 자격은 되는데 아직 신청 안 하신 분 — 서버가 event_id 를 골랐을 때만(자격 규칙이
  // 있는 회차일 때만) 채워 준다. missingTotal 은 300명 자르기 **전** 총수.
  evMissing = d.missing || [];
  evMissingTotal = d.missingTotal != null ? d.missingTotal : evMissing.length;
  if(pick) evPick = pick;
  else if(!evPick){
    evPick = (evEvents.find(e => e.status === "open") || evEvents[0] || {}).id || "";
    // ⚠️ 첫 진입은 event_id 없이 불렀다 — 서버는 그때 「아직 신청 안 하신 분」을 **아예 안 센다**
    //    (회차를 골라야 자격 규칙을 알 수 있다). 기본 회차를 방금 정했으니 한 번 더 부른다.
    //    안 그러면 담당자가 **화면을 여는 그 순간에만** 그 배지가 조용히 안 뜬다
    //    — 칩을 한 번 더 눌러야 나오는데, 그걸 알아챌 사람이 없다.
    //    ⚠️ 되돌이 걱정 없음: 아래는 pick 을 주고 부르므로 이 갈래로 다시 오지 않는다.
    if(evPick) return load(evPick);
  }
  render();
}
```

### 3.6 그리기 · 회차 칩 · 회차 폼 — `render` / `evChipsHtml` / `evFormHtml`

`admin-event.html:233-303`:
```html
// ---------- 그리기 ----------
function render(){
  const ev = evEvents.find(e => e.id === evPick) || null;
  app.innerHTML = evChipsHtml() + evFormHtml(ev) + evListHtml(ev);
  wire();
}

function evChipsHtml(){
  if(!evEvents.length){
    return `<div class="card"><h2>회차</h2>
      <p class="sub">아직 만든 회차가 없습니다. 아래에서 새 회차를 만드세요.</p></div>`;
  }
  return `<div class="card"><h2>회차</h2>
    <p class="sub">숫자는 그 회차의 <b>전체</b> 신청 건수입니다(아래 필터와 무관).</p>
    <div class="chips" id="ev-chips">${
      evEvents.map(e => `<button class="chip${e.id===evPick?" on":""}" data-id="${esc(e.id)}">
        ${esc(e.title)} <em>${e.count}</em>
        <span class="st">${EV_STATUS_KO[e.status]||esc(e.status)}</span></button>`).join("")
    }</div></div>`;
}

function evFormHtml(ev){
  // ⚠️ 여기서 읽는 칸은 eventRoster 가 **전부** 돌려줘야 한다. 하나라도 빠지면
  //    빈 칸으로 그려지고 저장하는 순간 원래 값이 지워진다.
  const v = ev || { id:"", title:"", shortTitle:"", subtitle:"", season:"", kind:"signup",
                    opensOn:"", closesOn:"", status:"draft", sortOrder:0, listUntil:"" };
  return `<div class="card no-print">
    <h2>${ev ? "회차 고치기" : "새 회차 만들기"}</h2>
    <p class="sub">
      <b>준비 중</b>은 성도님께 안 보입니다 · <b>열림</b>은 기간 안에서만 등록됩니다 ·
      <b>마감</b>은 등록만 막히고 <b>조회는 살아 있습니다</b> · <b>보관</b>은 목록에서 사라집니다.
    </p>
    <div class="ok" id="f-ok"></div><div class="err" id="f-err"></div>
    <div class="form">
      <div><label for="f-id">회차 ID</label>
        <input id="f-id" value="${esc(v.id)}" placeholder="summer-2026" ${ev?"readonly":""} />
      </div>
      <div><label for="f-status">상태</label>
        <select id="f-status">${EV_STATUS.map(s =>
          `<option value="${s}"${s===v.status?" selected":""}>${EV_STATUS_KO[s]}</option>`).join("")}</select>
      </div>
      <div><label for="f-opens">시작일</label><input id="f-opens" type="date" value="${esc(v.opensOn)}" /></div>
      <div><label for="f-closes">마감일</label><input id="f-closes" type="date" value="${esc(v.closesOn)}" /></div>
      <div><label for="f-until">명단 공개 종료일 <span style="font-weight:400;color:#8a93a3">(비우면 계속)</span></label>
        <input id="f-until" type="date" value="${esc(v.listUntil||"")}" /></div>
      <div class="wide"><label for="f-title">이벤트 이름 <span style="font-weight:400;color:#8a93a3">(관리자 목록·명단 제목)</span></label>
        <input id="f-title" value="${esc(v.title)}" placeholder="2026 썸머 써 바이블 완서자 등록" /></div>
      <div class="wide"><label for="f-short">첫 화면 단추 이름 <span style="font-weight:400;color:#8a93a3">(비우면 위 이름을 그대로)</span></label>
        <input id="f-short" value="${esc(v.shortTitle||"")}" placeholder="썸머 써 바이블" maxlength="20" /></div>
      <div class="wide"><label for="f-sub">한 줄 설명 <span style="font-weight:400;color:#8a93a3">(안 써도 됩니다)</span></label>
        <input id="f-sub" value="${esc(v.subtitle||"")}" /></div>
      <div><label for="f-season">분기 표기</label>
        <input id="f-season" value="${esc(v.season||"")}" placeholder="2026-3Q" /></div>
      <div><label for="f-order">차례 <span style="font-weight:400;color:#8a93a3">(작을수록 위)</span></label>
        <input id="f-order" type="number" value="${Number(v.sortOrder)||0}" /></div>
    </div>
    <div class="bar">
      <button class="btn p" id="f-save">${ev ? "고치기" : "만들기"}</button>
      ${ev ? `<button class="btn" id="f-new">+ 새 회차</button>` : ""}
    </div>
    ${ev && !ev.listedNow ? `<div class="note" style="background:#fbeeec;border-color:#e6bdb6;color:#a8322a">
      <b>지금 성도님께 안 보입니다.</b> ${
        ev.status === "draft" ? "상태가 <b>준비 중</b>이라 그렇습니다 — <b>마감</b>이나 <b>열림</b>으로 바꾸면 보입니다."
        : ev.status === "archived" ? "상태가 <b>보관</b>이라 그렇습니다."
        : "<b>명단 공개 종료일</b>이 지났습니다 — 날짜를 미루거나 비우면 다시 보입니다."
      }</div>` : ""}
    <div class="note">회차 ID 는 만든 뒤 바꿀 수 없습니다 — 신청 기록이 이 값으로 묶여 있습니다.
      영문 소문자·숫자·붙임표만 씁니다(예 <b>summer-2026</b>). 이 값이 딥링크에도 그대로 쓰입니다:
      <b>gocheok.onlybible.kr/?ev=summer-2026</b></div>
  </div>`;
}
```

### 3.7 한 회차로 좁히기 · 거르기 · 정렬 — `curRows` / `shown`

`admin-event.html:305-335`:
```html
// ⚠️ evRows 는 전 회차가 섞여 올 수 있다(위 선언부 참고) — 여기서 evPick 으로 한 번
//    좁혀 두고, shown()·evListHtml() 의 요약·목록·묶음 보기가 전부 이 하나만 쓴다.
//    (2026-09-11 — 「명단이 전 회차 섞여 나온다」치명 지적 반영. 회차가 하나뿐일 때는
//    안 드러나다가 회차가 둘이 되는 순간 머리말·표·인쇄물이 모두 어긋났다.)
function curRows(){
  return evPick ? evRows.filter(r => r.eventId === evPick) : evRows;
}

function shown(){
  return curRows().filter(r => {
    if(evType && r.whoType !== evType) return false;
    if(evGroup && r.group !== evGroup) return false;
    if(evQ){
      const q = evQ.toLowerCase();
      if(!(String(r.name).toLowerCase().includes(q) ||
           String(r.group).toLowerCase().includes(q) ||
           String(r.sub).toLowerCase().includes(q))) return false;
    }
    return true;
  }).sort((a,b) => {
    const k = evSort.key;
    // ⚠️ 숫자 정렬 — 문자열 비교로는 "10" < "2" 가 된다(evSubRank 가 다루는 것과 같은 함정).
    if(k === "weeksDone"){
      return (Number(a.weeksDone || 0) - Number(b.weeksDone || 0)) * evSort.dir;
    }
    const x = String(a[k]==null?"":a[k]), y = String(b[k]==null?"":b[k]);
    const n1 = parseFloat(x), n2 = parseFloat(y);
    const c = (!isNaN(n1) && !isNaN(n2) && k === "sub") ? n1 - n2 : x.localeCompare(y, "ko");
    return c * evSort.dir;
  });
}
```

### 3.8 명단 카드(요약 · 거르기 막대 · 표) — `evListHtml`

`admin-event.html:337-400`:
```html
function evListHtml(ev){
  if(!ev) return "";
  const list = shown();
  const rows = curRows();
  const groups = [...new Set(rows.map(r => r.group))].sort((a,b)=>a.localeCompare(b,"ko"));
  const byGroup = {};
  rows.forEach(r => { byGroup[r.group] = (byGroup[r.group]||0)+1; });
  const app_ = rows.filter(r => r.hasUser).length;
  const head = (k, label) =>
    `<th data-k="${k}">${label}${evSort.key===k ? (evSort.dir>0?" ▲":" ▼") : ""}</th>`;
  return `<div class="card">
    <h2>명단 — ${esc(ev.title)}</h2>
    ${rows.some(r => r.weeksDone != null) ? `<div class="sum"><span class="tag">
      도장 기간 2026-10-11 ~ 11-21 · 주 3일 · 6주 중 3주 (원본 supabase/event_stamp_2026.sql)
    </span></div>` : ""}
    <div class="sum">
      <span><b>${rows.length}</b>명</span>
      <span class="tag">앱 계정 연결 ${app_}명</span>
      <span class="tag">앱 등록 ${rows.filter(r=>r.source==="app").length}건</span>
      <span class="tag">이관 ${rows.filter(r=>r.source==="import").length}건</span>
      ${rows.some(r => r.weeksDone != null) ? `
        <span class="tag">채운 주 3주 이상 ${rows.filter(r=>r.eligible).length}명</span>
        <span class="tag">여섯 주 ${rows.filter(r=>r.perfect).length}명</span>
        <span class="tag">인정 ${rows.filter(r=>r.excused).length}명</span>` : ""}
      ${evMissing.length ? `<span class="tag">아직 신청 안 하신 분 ${evMissing.length}명${
        evMissingTotal > evMissing.length ? ` 외 ${evMissingTotal - evMissing.length}명` : ""}</span>` : ""}
      ${evQ||evType||evGroup ? `<span class="tag">추린 결과 ${list.length}명</span>` : ""}
    </div>
    <div class="bar no-print">
      <select id="q-type"><option value="">구분 전체</option>
        <option value="교구"${evType==="교구"?" selected":""}>교구</option>
        <option value="교회학교"${evType==="교회학교"?" selected":""}>교회학교</option></select>
      <select id="q-group"><option value="">소속 전체</option>${
        groups.map(g => `<option value="${esc(g)}"${evGroup===g?" selected":""}>${esc(g)} (${byGroup[g]})</option>`).join("")
      }</select>
      <input type="search" id="q-find" placeholder="이름 · 소속으로 찾기" value="${esc(evQ)}" />
      <button class="btn" id="q-view">${evView==="table" ? "🧾 묶음 보기" : "📊 표 보기"}</button>
      <button class="btn" id="q-clear">초기화</button>
      <button class="btn" id="q-print">🖨️ 인쇄</button>
      <button class="btn" id="q-csv">⬇️ CSV (찾은 것만)</button>
    </div>
    ${list.length && evView === "group" ? evGroupedHtml(list) : ""}
    ${list.length && evView === "table" ? `<div class="tw"><table><thead><tr>
      <th class="num">#</th>${head("whoType","구분")}${head("group","소속")}${head("sub","목장·학년")}
      ${head("position","직분")}${head("name","성명")}${head("weeksDone","주")}${head("at","등록일")}<th>기록</th>
    </tr></thead><tbody>${
      list.map((r,i) => `<tr>
        <td class="num">${i+1}</td>
        <td><span class="badge ${r.whoType==="교구"?"gu":"sc"}">${esc(r.whoType)}</span></td>
        <td>${esc(r.group)}</td><td>${esc(r.sub)}</td>
        <td>${esc(r.position)}</td><td><b>${esc(r.name)}</b></td>
        <td>${r.weeksDone == null ? "" :
             esc(String(r.weeksDone)) + (r.perfect ? " ✨" : "") + (r.excused ? (" (인정" + (r.excuseReason ? " · " + esc(r.excuseReason) : "") + ")") : "")}</td>
        <td>${esc(kstDate(r.at))}</td>
        <td><span class="badge ${r.source==="app"?"app":"imp"}">${r.source==="app"?"앱":"이관"}</span>${
          r.hasUser ? ` <span class="badge app">계정</span>` : ""}
          ${r.weeksDone == null ? "" : ` <button class="btn no-print" data-excuse="${r.id}" data-on="${r.excused?0:1}">${r.excused?"인정 취소":"인정"}</button>`}
          <button class="btn no-print" data-note="${r.id}">메모</button>
        </td>
      </tr>`).join("")
    }</tbody></table></div>` : ""}
    ${list.length ? "" : `<div class="empty">${rows.length ? "추린 결과가 없습니다." : "아직 신청이 없습니다."}</div>`}
  </div>`;
}
```

### 3.9 묶음 보기 — `evSubRank` / `evGroupedHtml`

`admin-event.html:402-434`:
```html
// 소속으로 묶고 한 줄에 여러 명 — 「화평 / 홍길동-20 · 홍길순-3 · …」
// ⚠️ 묶음 차례는 **구분(교구 먼저) → 가나다**다. 교구의 관례 차례(믿음·소망·사랑…)를
//    여기 베껴 두지 않았다 — 목록을 두 곳에 두면 조용히 갈라진다(오늘 직분 목록에서
//    겪은 그대로). 관례 차례로 하고 싶으면 서버가 이미 가진 차례를 내려받아 쓸 것.
// ⚠️ 구역은 글자다. 「1」~「39」 사이에 **「남성」** 이 섞여 있어 그냥 정렬하면
//    1, 12, 2, 3… 이 되고 「남성」이 숫자 사이에 낀다. 숫자는 숫자로, 나머지는 뒤로.
function evSubRank(v){
  const t = String(v == null ? "" : v).trim();
  const n = /^\d+$/.test(t) ? parseInt(t, 10) : NaN;
  return isFinite(n) ? [0, n, t] : [1, 0, t];
}
function evGroupedHtml(list){
  const bag = new Map();
  list.forEach(r => {
    const k = (r.whoType === "교구" ? "0" : "1") + "|" + (r.group || "");
    if (!bag.has(k)) bag.set(k, { name: r.group || "(소속 없음)", members: [] });
    bag.get(k).members.push(r);
  });
  const keys = [...bag.keys()].sort((a, b) => a < b ? -1 : (a > b ? 1 : 0));
  return `<div class="gv">${keys.map(k => {
    const g = bag.get(k);
    g.members.sort((m1, m2) => {
      const a = evSubRank(m1.sub), b = evSubRank(m2.sub);
      if (a[0] !== b[0]) return a[0] - b[0];
      if (a[1] !== b[1]) return a[1] - b[1];
      if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1;
      return (m1.name || "") < (m2.name || "") ? -1 : 1;
    });
    return `<div class="gv-g"><div class="gv-t">${esc(g.name)}<em>${g.members.length}명</em></div>
      <div class="gv-l">${g.members.map(m =>
        `<span${m.hasUser ? ' class="app"' : ''}>${esc(m.name)}-${esc(m.sub)}</span>`).join("")}</div></div>`;
  }).join("")}</div>`;
}
```

### 3.10 날짜 · CSV — `kstDate` / `downloadCsv`

`admin-event.html:436-468`:
```html
// 서버는 UTC 로 준다 — 한국 날짜로 바꿔 보여 준다(안 그러면 자정 무렵 하루가 어긋난다).
function kstDate(iso){
  if(!iso) return "";
  try{
    const d = new Date(iso);
    const k = new Date(d.getTime() + 9*3600*1000);
    return k.toISOString().slice(0,10);
  }catch(e){ return String(iso).slice(0,10); }
}

// ⚠️ 「찾은 것만」 나간다 — 화면에서 좁혀 놓고 전체가 나가면 담당자가 모르고 쓴다.
function downloadCsv(){
  const rows = shown();
  // ⚠️ memo 와 note 는 **다른 것**이다. memo 는 성도님이 남기신 한 줄,
  //    note 는 담당자 전용 메모다(성도님 응답에는 절대 안 실린다).
  //    둘을 한 칸에 뭉치면 성도님이 하신 말이 사라진다 — 칸을 나눠 싣는다. 인정 사유도 함께.
  const head = ["이름","구분","소속","목장·학년","직분","주","여섯주","인정","인정 사유",
                "등록일","성도 메모","담당자 메모"];
  // 줄바꿈·탭을 공백 하나로 — CSV 한 칸이 여러 줄로 깨지지 않게
  const oneline = (v) => String(v || "").replace(/\s+/g, " ").trim();
  const body = rows.map(r => [r.name, r.whoType, r.group, r.sub, r.position,
    r.weeksDone ?? "", r.perfect ? "O" : "", r.excused ? "O" : "", oneline(r.excuseReason),
    kstDate(r.at), oneline(r.memo), oneline(r.note)]);
  const csv = [head, ...body]
    .map(cols => cols.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
  // ⚠️ BOM 을 붙인다 — 없으면 엑셀이 한글을 깨뜨린다
  const blob = new Blob(["﻿" + csv], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${evPick || "event"}-명단.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
```

### 3.11 오류 말 · 인정 · 메모 — `admErr` / `askExcuse` / `askNote`

`admin-event.html:470-494`:
```html
// 사정이 있으셨던 주를 인정 — 사유를 반드시 받는다(비우면 서버가 no-reason 으로 막는다)
// 서버 슬러그를 사람 말로 — 담당자 화면에 영문 코드가 그대로 뜨면 무슨 일인지 모른다.
function admErr(e){
  if(e === "no-reason") return "사유를 적어 주세요. (공백만으로는 안 됩니다)";
  if(e === "not-found") return "그 줄을 찾지 못했습니다. 새로고침한 뒤 다시 해 주세요.";
  if(e === "bad-args") return "요청이 올바르지 않습니다.";
  return e || "알 수 없는 까닭";
}

async function askExcuse(id, on){
  const reason = on ? prompt("사유를 적어 주세요 (예: 10월 3주 입원)") : "";
  if(on && !reason) return;
  const d = await callApi({ action:"eventExcuse", pw:getPw(), id, excused:on, reason });
  if(!guard(d)) return;
  if(!d.ok){ alert("바꾸지 못했습니다 — " + admErr(d.error)); return; }
  await load(evPick);
}
async function askNote(id, cur){
  const note = prompt("담당자 메모 (성도님께는 안 보입니다)", cur || "");
  if(note == null) return;
  const d = await callApi({ action:"eventSetNote", pw:getPw(), id, note });
  if(!guard(d)) return;
  if(!d.ok){ alert("저장하지 못했습니다 — " + admErr(d.error)); return; }
  await load(evPick);
}
```

### 3.12 배선 — `wire`

`admin-event.html:496-546`:
```html
// ---------- 배선 ----------
function wire(){
  const chips = document.getElementById("ev-chips");
  if(chips) chips.addEventListener("click", e => {
    const b = e.target.closest(".chip"); if(!b) return;
    evPick = b.getAttribute("data-id"); evQ = ""; evType = ""; evGroup = "";
    load(evPick);
  });

  const save = document.getElementById("f-save");
  if(save) save.addEventListener("click", saveEvent);
  const nw = document.getElementById("f-new");
  if(nw) nw.addEventListener("click", () => { evPick = ""; evRows = []; render(); });

  const t = document.getElementById("q-type");
  if(t) t.addEventListener("change", () => { evType = t.value; render(); });
  const g = document.getElementById("q-group");
  if(g) g.addEventListener("change", () => { evGroup = g.value; render(); });
  const f = document.getElementById("q-find");
  if(f) f.addEventListener("input", () => {
    evQ = f.value.trim(); const at = f.selectionStart; render();
    const n = document.getElementById("q-find"); if(n){ n.focus(); n.setSelectionRange(at, at); }
  });
  const c = document.getElementById("q-clear");
  if(c) c.addEventListener("click", () => { evQ=""; evType=""; evGroup=""; render(); });
  const p = document.getElementById("q-print");
  if(p) p.addEventListener("click", () => window.print());
  const cs = document.getElementById("q-csv");
  if(cs) cs.addEventListener("click", downloadCsv);
  app.querySelectorAll("[data-excuse]").forEach(b => b.addEventListener("click", () =>
    askExcuse(Number(b.getAttribute("data-excuse")), b.getAttribute("data-on") === "1")));
  app.querySelectorAll("[data-note]").forEach(b => b.addEventListener("click", () => {
    const id = Number(b.getAttribute("data-note"));
    const row = evRows.find(r => r.id === id);
    askNote(id, row ? row.note : "");
  }));
  const v = document.getElementById("q-view");
  if(v) v.addEventListener("click", () => {
    evView = evView === "table" ? "group" : "table";
    try { localStorage.setItem("ev-view", evView); } catch(e) {}
    render();
  });

  document.querySelectorAll("thead th[data-k]").forEach(th => {
    th.addEventListener("click", () => {
      const k = th.getAttribute("data-k");
      evSort = { key:k, dir: (evSort.key === k ? -evSort.dir : 1) };
      render();
    });
  });
}
```

### 3.13 회차 저장 · 시작 — `saveEvent`

`admin-event.html:548-597`:
```html
async function saveEvent(){
  const err = document.getElementById("f-err"), ok = document.getElementById("f-ok");
  err.textContent = ""; ok.textContent = "";
  // ⚠️ 2026-09-10 이후 서버는 **보낸 칸만 바꾼다**(index.ts 의 `has("needs") ? … : cur.needs`).
  //    그러니 needs·copy 를 **보내지 않는다** — 보내면 자격 규칙이 조용히 지워지고,
  //    오류도 안 나며 아무에게도(또는 모두에게) 단추가 열린다.
  const cur = evEvents.find(e => e.id === evPick) || {};
  const ev = {
    id: document.getElementById("f-id").value.trim(),
    title: document.getElementById("f-title").value.trim(),
    subtitle: document.getElementById("f-sub").value.trim(),
    short_title: document.getElementById("f-short").value.trim(),
    list_until: document.getElementById("f-until").value,
    season: document.getElementById("f-season").value.trim(),
    kind: cur.kind || "signup",
    status: document.getElementById("f-status").value,
    opens_on: document.getElementById("f-opens").value,
    closes_on: document.getElementById("f-closes").value,
    sort_order: Number(document.getElementById("f-order").value) || 0,
  };
  // 서버도 같은 것을 다시 검사한다 — 여기 검사는 성도님(담당자)께 먼저 말해 주기 위한 것.
  if(!/^[a-z0-9][a-z0-9-]{1,40}$/.test(ev.id)){
    err.textContent = "회차 ID 는 영문 소문자·숫자·붙임표만 씁니다 (예: summer-2026)"; return; }
  if(!ev.title){ err.textContent = "이벤트 이름을 적어 주세요."; return; }
  if(!ev.opens_on || !ev.closes_on){ err.textContent = "기간을 골라 주세요."; return; }
  if(ev.closes_on < ev.opens_on){ err.textContent = "마감일이 시작일보다 앞섭니다."; return; }
  // 명단 공개 종료일은 등록 마감일보다 앞설 수 없다 — 마감 전에 명단이 사라지면
  // 앞뒤가 안 맞는다(등록은 받는데 명단은 안 보이는 상태).
  if(ev.list_until && ev.list_until < ev.closes_on){
    err.textContent = "명단 공개 종료일이 등록 마감일보다 앞섭니다."; return; }

  const btn = document.getElementById("f-save");
  const label = btn.textContent; btn.disabled = true; btn.textContent = "저장 중…";
  const d = await callApi({ action:"eventSave", pw:getPw(), event:ev });
  btn.disabled = false; btn.textContent = label;
  if(!guard(d)) return;
  if(!d.ok){ err.textContent = "저장하지 못했습니다 — " + (d.error||""); return; }
  ok.textContent = "저장했습니다.";
  await load(ev.id);
  const o = document.getElementById("f-ok"); if(o) o.textContent = "저장했습니다.";
}

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem(PW_KEY); logoutBtn.hidden = true; renderLogin();
});

if(getPw()) load(); else renderLogin();
</script>
</body>
</html>
```

### 3.14 관리 허브 타일(갈아타기 때 주소를 바꿀 한 줄)

`admin.html:72-76`:
```html
  // 관리 도구 목록 — 앞으로 여기에 한 줄씩 추가하면 됩니다
  const TOOLS = [
    { ic:"👤", title:"성도 정보 관리", desc:"이름 · 소속 변경 · 변경 이력 (기존 기록 유지)", href:"admin-members.html" },
    { ic:"📖", title:"성경암송 관리", desc:"통계 · 알림발송 · 주간리포트 · 게시판", href:"admin-stats.html?v=20260927a" },
    { ic:"🎉", title:"이벤트 관리", desc:"회차 만들기 · 신청 명단 · 인쇄", href:"admin-event.html" },
```

---

## 4. 동작 목록 (체크리스트)

꼬리표: **[옮김]** 새 쪽이 같게 한다 · **[바뀜]** 새 쪽이 일부러 다르게 한다(설계) · **[새로]** 옛 쪽에 없던 것 ·
**[안 옮김]** 성경암송에 남긴다 · **[다음 단계]** 이번이 아니라 자격 인정을 옮길 때 · **[근거]** 옮기지 않지만 새 쪽 규칙의 까닭 · **[발견]** 조사하다 찾은 것.

1. 관리자 이벤트 액션 다섯은 모두 관리자 비밀번호 하나(`adminError`)로만 막는다 — 역할·담당자 구분·기록이 없다 —
   index.ts:166-172, 5464-5465, 5594-5595, 5615-5616, 5637-5638, 5812-5813. **[바뀜]** 역할 `bibleevent` + `admin_audit`.
2. 회차 목록은 `closes_on` 내림차순이다 — index.ts:5470-5472.
3. 회차 칩 숫자는 회차마다 `head:true` 개수(추리기 전 전체 기준)다 — index.ts:5475-5486, admin-event.html:246. **[옮김]**
4. 명단 줄은 `.limit(2000)` 으로 받지만 PostgREST 가 1,000행에서 말없이 자른다 — `event_id` 없이 부르면(화면 첫 진입) 전 회차가 섞여
   1,000행만 온다 — index.ts:5488-5493, admin-event.html:204-229. **[발견]** 새 쪽은 `allRows`.
5. 화면은 전 회차가 섞여 와도 `curRows()` 로 고른 회차만 쓴다 — admin-event.html:144-146, 305-311.
6. 줄 응답에 `user_id`·`ident_key`·`answers` 원본이 없다 · `phone`·`memo`·`note` 는 있다 — index.ts:5499-5507. **[바뀜]** 새 `RowOut` 은 `phone`·`memo` 도 뺀다.
7. 자격 회차를 골랐을 때만 줄마다 채운 주·여섯 주·자격을 다시 세고 「아직 신청 안 하신 분」(300명에서 자름 · 총수 따로)을 준다 —
   index.ts:5509-5571. **[안 옮김]**
8. `listedNow` = 상태가 open·closed 이고 `list_until` 이 비었거나 KST 오늘 ≤ `list_until` — index.ts:5102-5104, 5115-5119, 5583. **[옮김]** 글자 그대로.
9. 화면은 `listedNow` 가 거짓이면 까닭(준비 중 / 보관 / 공개 종료일 지남)을 붉은 안내로 보인다 — admin-event.html:293-298. **[옮김]**
10. 메모(`eventSetNote`): id 가 양의 정수가 아니면 `bad-args` · `norm` 으로 줄바꿈을 접고 500자에서 말없이 자른다 · 없는 줄이면 `not-found` ·
    `updated_at` 을 새로 쓴다 — index.ts:5596-5607. **[바뀜]** 500자 넘으면 `note-too-long` · `expect` 확인.
11. 메모는 app 줄·import 줄을 가리지 않고 고친다 — index.ts:5602-5604. **[옮김]** 새 쪽도 app 줄·자격 회차 줄의 메모는 고칠 수 있다(그 줄은 메모만).
12. 메모는 브라우저 `prompt()` 로 받고(지금 메모를 채워 보임) 오류는 `alert()` — admin-event.html:487-494, 527-531. **[바뀜]** 직접 만든 창.
13. 표에는 담당자 메모가 보이지 않는다 — 「메모」 단추를 눌러야 `prompt` 안에 보인다 — admin-event.html:379-397. **[발견]**
14. 회차 저장(`eventSave`)은 **보낸 칸만** 바꾼다(`has()`) — index.ts:5644-5650. **[옮김]**
15. 만들기와 고치기가 `upsert(onConflict: "id")` 하나다 — 이미 있는 id 로 만들면 고치기가 된다 — index.ts:5697-5698. **[바뀜]** `evEventCreate` 는 insert 만(`exists`).
16. 검사 차례: `bad-event-id` → `no-title` → `bad-period` → `period-reversed` → `bad-list-until` → `list-until-before-close` —
    index.ts:5642, 5652-5659, 5669-5678. **[옮김]**
17. `status`·`kind` 가 목록 밖이면 오류 없이 기존 값(새 회차는 draft·signup)으로 둔다 — index.ts:5661-5666. **[바뀜]** `bad-status`.
18. `list_until` 을 보냈는데 비었으면 null(기한 없음) — index.ts:5673-5674. **[옮김]**
19. `list_until` 검사는 그 칸을 보냈을 때만 돈다 — `closes_on` 만 미루면 `list_until < closes_on` 이 될 수 있다 — index.ts:5671-5678. **[발견]**
20. 공개 확인이 없다 — draft → open 저장 한 번으로 곧장 성도님 첫 화면에 뜬다 — index.ts:5636-5701. **[바뀜]** `needs-confirm`(쓰기 전에).
21. 자격 회차의 `opens_on` 을 `eligibility.start` 앞으로 당겨도 막지 않는다 — index.ts:5655-5659, event_stamp_2026.sql:14-17. **[바뀜]** `before-eligibility`.
22. 동시 고침 검사가 없다 — 한 번 읽고(`cur`) upsert, 나중 저장이 이긴다 — index.ts:5649, 5697-5698. **[바뀜]** `expect` → `conflict`.
23. `needs`·`copy`·`sort_order`·`kind` 도 받는다 — index.ts:5664-5667, 5691-5693. 화면은 `needs`·`copy` 를 **일부러 안 보내고**(자격 규칙이
    조용히 지워지지 않게) `kind` 는 지금 값을 되돌려 보낸다 — admin-event.html:551-553, 562. **[바뀜]** 새 쪽은 넷 다 받지 않는다(만들 때 `needs` 기본값만 · 4-2).
24. 회차 폼: ID(만든 뒤 readonly) · 상태 `<select>` · 시작일·마감일·공개 종료일 `<input type=date>` · 이름 · 첫 화면 단추 이름(`maxlength="20"`) ·
    한 줄 설명 · 분기 표기 · 차례 `<input type=number>` — admin-event.html:266-288. **[바뀜]** `<select>`·`type=date` 없이 `pickOne`·`pickDate`.
25. 저장 전 화면 검사(ID 꼴 · 이름 · 기간 · 순서 · 공개 종료일 ≥ 마감) — 서버가 다시 검사한다 — admin-event.html:568-577.
26. 회차 저장 오류는 코드 그대로(「저장하지 못했습니다 — bad-period」) 보인다 — admin-event.html:584. **[바뀜]** `ui.js` `MESSAGES`.
27. 저장하면 그 회차를 다시 불러와 「저장했습니다」 — admin-event.html:585-587. 「+ 새 회차」는 폼을 비운다 — admin-event.html:507-508.
28. 첫 진입은 `event_id` 없이 한 번 부르고, 열린 회차(없으면 맨 앞)를 골라 한 번 더 부른다 — admin-event.html:204-231.
29. 회차 칩: 제목 · 전체 건수 · 상태 한국말(준비 중·열림·마감·보관) — admin-event.html:140-141, 240-252. 칩을 누르면 거르기를 비우고 다시 부른다 —
    admin-event.html:498-503.
30. 요약 줄: 전체 명수 · 앱 계정 연결 · 앱 등록 · 이관 건수(자격 회차면 채운 주 3주 이상 · 여섯 주 · 인정 · 아직 신청 안 하신 분) —
    admin-event.html:352-364. 자격 회차 안내 문구에 날짜가 박혀 있다(「2026-10-11 ~ 11-21」) — admin-event.html:349-351. **[발견]**
31. 거르기: 구분 `<select>` · 소속 `<select>`(가나다 · 건수) · 이름·소속·목장 부분 찾기(글자마다 다시 그리고 커서 자리를 되살림) · 초기화 —
    admin-event.html:313-323, 365-374, 510-520. **[바뀜]** 칩 · 찾기.
32. 표 머리를 누르면 그 칸으로 정렬(다시 누르면 반대) · 목장은 둘 다 숫자일 때만 숫자로 · 기본은 등록일 최근 먼저 —
    admin-event.html:150, 324-334, 539-545.
33. 표 칸: # · 구분 · 소속 · 목장·학년 · 직분 · 성명 · 주 · 등록일(KST) · 기록(앱/이관 · 계정 · 인정 · 메모 단추) — admin-event.html:379-397, 436-444.
34. 묶음 보기: 구분(교구 먼저) → 소속 **가나다**(교구 관례 차례가 아님) · 안에서 목장 숫자 → 숫자 아닌 것 → 이름 · 「이름-목장」 꼴 ·
    계정 있는 분은 굵게 — admin-event.html:402-434. **[바뀜]** 공개 명단(1.10)의 교구 차례.
35. 표/묶음 보기 고른 것을 `localStorage['ev-view']` 에 기억한다 — admin-event.html:152-154, 532-537.
36. 인쇄는 `window.print()` · 인쇄 CSS 가 막대·단추·칩을 숨긴다 — admin-event.html:104-118, 521-522. **[안 옮김]** 설계 7절(로비 인쇄용은 다음에).
37. CSV: 화면에서 추린 줄만 · BOM · 칸 12개(이름·구분·소속·목장학년·직분·주·여섯주·인정·인정 사유·등록일·성도 메모·담당자 메모) ·
    줄 끝 `\n` · 파일 이름 `<회차id>-명단.csv` — admin-event.html:446-468. **[바뀜]** `csvText`: 칸 일곱(이름·구분·소속·세부·직분·출처·교적) · `\r\n` · 메모 없음.
38. 자격 인정은 `prompt()` 로 사유를 받고 `alert()` — admin-event.html:479-486, 525-526. **[안 옮김]** 설계 7절.
39. 오류 코드를 한국말로 바꾸는 것은 셋뿐(`no-reason`·`not-found`·`bad-args`) — admin-event.html:471-477. `unauthorized` 면 저장한 비밀번호를
    지우고 로그인 화면으로 — admin-event.html:169-175.
40. 로그인은 `authCheck` 로 확인해 `sessionStorage['admin-pw']` 에 둔다(허브·통계 화면과 공유) — admin-event.html:136, 177-201. **[바뀜]** 카카오 로그인.
41. 줄 고치기(이름·소속·직분) · 줄 빼기 · 한 분 더하기 · 명단 올리기 단추가 **없다** — admin-event.html 전체.
    **[새로]** `evRowSave`·`evRowDelete`·`evRowAdd`·`evUploadCheck`/`evUploadSave`.
42. 이관(`eventImport`)은 그 회차 `source='import'` 줄을 전부 지우고 넣는다 · 지운 뒤 넣기가 실패하면 빈 채로 남는다 — index.ts:5905-5925.
    **[바뀜]** 새 쪽은 더하기만 한다(성경암송 쪽은 설계 4-3 으로 얼린다).
43. 이관 상한 5,000줄 · 이름·소속 빈 줄은 버린다 — index.ts:5797, 5822, 5834. **[바뀜]** 600줄(`too-many`) · 소속 빈 줄은 「빈칸」 판정.
44. 이관은 신원 키로 접고 가장 이른 `regDate` 를 남긴다 — index.ts:5824-5859. **[바뀜]** 올리기 안의 중복은 먼저 나온 줄이 남는다(설계 1절 「같은 분 판정」 4).
45. 이관 직분은 괄호 속·끝 「님」을 떼고(`evtImportPosition`), 목록 밖이어도 버리지 않는다 — index.ts:5799-5809, 5927-5929. **[옮김]** `cleanPosition`.
    ⚠️ **[발견]** 「님」을 뗀 뒤 다시 다듬지 않아 「집사 님」은 「집사 」(끝 빈칸)가 된다 — index.ts:5807. **[바뀜]** 새 쪽은 끝에 한 번 더 다듬는다(4-2).
46. 이관 계정 잇기는 `users` 통째 읽기(1,000행에서 잘림)로 글자 그대로 같은 `identity_key` 만 본다 — `user_identity_aliases` 는 안 본다 —
    index.ts:5861-5875. **[바뀜]** `usersByKeys`(users + aliases, 100개씩).
47. 그 회차에 앱으로 낸 계정은 이관 줄에 잇지 않는다 · 한 계정은 한 줄에만 잇는다 — index.ts:5877-5893.
48. 이관 `note` 는 `norm` 만(길이 상한 없음) · `phone`·`memo` 는 빈 값 — index.ts:5853-5855. **[바뀜]** 새 쪽 `note` 는 붙임말(`담당자가 더함`·`명단 올리기`·`소속: 교인명부로 채움`·`직분: 교인명부로 채움`(직분만 채운 줄 · 2026-09-30), ` / ` 로 이음)을 붙인 **뒤** 500자가 넘으면 `note-too-long`(창의 글자 수 상한은 480) · `phone`·`memo` 는 쓰지 않는다.
49. 공개 명단(`eventRosterPublic`)은 로그인 없이 다섯 칸만, `evtListable` 인 회차만 준다 — index.ts:5725-5742. **[안 옮김]** 그대로 둔다.
50. 첫 화면 목록(`eventOpenList`)은 관리자 비밀번호가 없으면 `evtListable` 인 회차만 준다 — index.ts:5291-5294, 5311-5314. **[안 옮김]** 그대로 둔다.
51. 성도님이 앱에서 내면 `(event_id, user_id)` upsert 가 소속·직분·phone·memo·answers 를 덮고 `source='app'` 으로 만든다 · `note` 는 남는다 ·
    이어 둔 import 줄도 app 줄이 된다 — index.ts:5413-5435. **[근거]** 앱 줄은 메모만 고친다.
52. 성도님 취소(`eventDrop`)는 등록 기간 안에서 자기 줄을 지운다 — index.ts:5438-5460. **[근거]** 새 쪽은 app 줄을 빼지 않는다(`app-row`) · 자격 회차의 줄도 빼지 않는다(`eligibility-event` — 서버가 막는다).
53. DB: `events` 의 status·kind·기간 CHECK — events.sql:40-51. `event_signups` 의 `unique (event_id, user_id)`(NULLS DISTINCT) · app_only · source
    CHECK — events.sql:85-101. **[옮김]** 표를 고치지 않는다.
54. DB: `event_signups.user_id` 는 `on delete cascade` — 계정을 지우면 이어 둔 줄도 사라진다 — events.sql:61. **[발견]**
55. DB: `short_title`·`list_until` 은 `events_display.sql` 이 더한 칸이다 — events_display.sql:16-31.
56. 가을 회차 SQL 을 다시 돌리면 회차 설정(제목·기간·공개 종료일·needs·copy)을 덮어쓴다(status 는 안 덮음) — event_stamp_2026.sql:54-67.
    **[바뀜]** 설계 4-3 ① 머리 경고.
57. 계정 합치기 트리거가 `event_signups` 쓰기마다 옛 계정 id 를 새 id 로 바꾸고 전역 잠금을 잡는다 · 같은 회차에 두 계정 줄이 있으면 합치기가 멈춘다 —
    member_merge.sql:18-41, 43-59, 125-130.
58. 관리 허브의 「🎉 이벤트 관리」 타일 한 줄로 들어온다 — admin.html:76. **[다음 단계]** 설계 4-4 갈아타기는 자격 인정(`eventExcuse`)이 옮겨진 뒤에 한다 — 이번에는 타일을 그대로 두고 Task 15 「남은 것」에 적는다.
59. 웹폰트를 부르지 않고 `?v=` 캐시 태그도 없다(고친 뒤 Ctrl+F5) — admin-event.html:13-17.

### 4-1. 얼리기(설계 4-3)에 걸리는 것 — 발견

`tests/event-smoke.sh:94-102`:
```bash
echo "5) 관리자 액션은 비번 없이 열리지 않는다"
R=$(call '{"action":"eventRoster"}')
chk "eventRoster 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$R")" "True"
V=$(call '{"action":"eventSave","event":{"id":"x","title":"x","opens_on":"2026-01-01","closes_on":"2026-01-02"}}')
chk "eventSave 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$V")" "True"
N1=$(call '{"action":"eventSetNote","id":1,"note":"x"}')
chk "eventSetNote 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$N1")" "True"
N2=$(call '{"action":"eventExcuse","id":1,"excused":true}')
chk "eventExcuse 거부" "$(jqn 'd.get("error") in ("unauthorized","no-password-set")' "$N2")" "True"
```

- 이 스모크는 비밀번호 없이 부른 `eventSave`·`eventSetNote` 가 `unauthorized`/`no-password-set` 이기를 기대한다. 설계 4-3 대로 액션 **맨 앞**에
  `moved-to-church-admin` 을 두면 이 두 검사가 실패한다. **정함(2026-09-29 대조 뒤)**: 얼리는 줄은 세 액션 모두 `adminError` 검사
  **바로 뒤**에 둔다 — 비밀번호 없는 요청은 지금처럼 `unauthorized`, 맞는 비밀번호로 부르면 `moved-to-church-admin`. 스모크 기대값은 그대로 둔다.
  `eventImport` 는 스모크에 없다.
- 얼린 뒤 `admin-event.html` 의 「메모」·「고치기」 단추는 `moved-to-church-admin` 을 받는다 — `admErr`(3.11)는 이 코드를 몰라 코드가 그대로 뜬다
  → 설계 4-3 의 페이지 안 띠를 같은 배포에 넣는다.
- 가을 개시 절차 문구가 있는 곳: `event_stamp_2026.sql:8-9` · 가을 설계(`docs/superpowers/specs/2026-09-23-autumn-streak-event-design.md`) §13 의 12 — 설계 4-3 ②.
- `js/api.js:122-125` 의 래퍼(1.14)는 부르는 곳이 없어 얼리기에 영향이 없다.

### 4-2. 옮길 때 정한 것 — 발견과 결정(2026-09-29 대조 뒤)

- **자격 회차 판정**: 설계는 「`needs.eligibility` 있음」이라 적었고 성경암송 서버는 `evtRule`(모양이 맞을 때만, 1.5)로 본다. 모양이 틀린
  `needs.eligibility` 가 있으면 둘이 갈린다 — 성경암송은 보통 회차로 다뤄 앱에서 자격 없이 등록되는데, 「있음」 기준이면 새 쪽은 더하기·올리기를 막는다.
  **정함**: 막는 쪽. `events-rules.ts` 에 한 함수씩만 둔다 — `isEligEvent(needs)` 는 `needs` 가 객체이고 `needs.eligibility` 가 null 아닌 객체면 true,
  `eligibilityStart(needs)` 는 `eligibility.start` 가 `YYYY-MM-DD` 꼴일 때만 그 날짜(아니면 null). `evEvents` 의 `hasEligibility`, 더하기·올리기·줄 빼기의
  `eligibility-event`, 회차 설정의 `before-eligibility` 가 모두 이 둘만 쓴다(화면과 서버가 같은 회차를 자격 회차로 본다).
- **자격 회차의 줄 빼기**: 설계 표는 `evRowDelete` 에 자격 회차를 적지 않았다. **정함**: 서버가 막는다(`eligibility-event`) — 그 회차 명단은
  「꾸준히 했다는 판정 결과」(가을 설계 §10)라 담당자가 줄을 뺄 까닭이 없고, 메모만 고친다.
- **`sort_order`(차례)**: 옛 폼에 있고 성도님 첫 화면에서 회차가 겹칠 때 차례를 정하는데(1.11 ③), 새 회차 설정 칸(설계 3절 · `EvEventOut`)에는
  없다. **정함**: 이번에는 고치지 않는다 — 새 회차는 DB 기본값 0 으로 들어가고, 고치려면 SQL 이다. 설정 화면에 없다는 것을 Task 15 「남은 것」에 적는다.
- **`cleanPosition`**: 옛 `evtImportPosition` 을 글자 그대로 옮기면 「집사 님」이 「집사 」가 된다(45). **정함**: 끝에 한 번 더 다듬는다
  (「집사 님」→「집사」 · Task 2 시험).
- **메모 길이**: 옛 `eventSetNote` 는 500자에서 말없이 잘랐다(1.7). **정함**: 서버는 붙임말(`담당자가 더함 / ` 등)을 붙인 **뒤** 500자가 넘으면
  `note-too-long` 으로 거절하고, 창의 글자 수 상한은 480 으로 둔다(붙임말 몫).
- **교인명부로 채우기(찾지 못한 것 4 의 손 작업 규칙을 보강)**: 줄에 적힌 소속(구분·교구/부서)이 교인명부 분의 소속과 다르면 **아무것도 채우지 않는다**
  (`different-affiliation`). 교구 칸이 비어 교인명부로 채우면 목장도 교인명부 값을 쓴다(적혀 있던 목장은 버리고 알림). 소속이 적혀 있고 직분만 빈 줄은
  교인명부에 동명이인이 있어도 `add`(직분은 빈 채로) — 「동명이인」 판정은 소속을 못 정한 줄에만 — Task 3·8.
- **얼리는 줄의 자리**: 4-1 — `adminError` 검사 바로 뒤.
- **CSV·인쇄**: 옛 CSV 의 메모 두 칸·인정·주·등록일과 인쇄는 옮기지 않는다(설계 3절·7절). 자격 회차의 인정·주가 필요하면 남겨 둔 옛 화면에서 내려받는다.
- **관리 허브 타일(3.14 · 동작 58)**: 이번에는 옛 주소 그대로 — 자격 인정이 교회 어드민으로 옮겨진 다음 단계에서 갈아탄다.

---

## 5. 크기

| 원본(성경암송 커밋 `4261dea`) | 옮긴 원문 줄 |
|---|---:|
| `supabase/functions/api/index.ts` | 750 |
| `js/api.js` | 12 |
| `supabase/events.sql` | 129 |
| `supabase/events_display.sql` | 37 |
| `supabase/event_stamp_2026.sql` | 75 |
| `supabase/member_merge.sql` | 47 |
| `admin-event.html` | 587 |
| `admin.html` | 5 |
| `tests/event-smoke.sh` | 9 |
| **합계** (코드 블록 38개) | **1651** |

위 숫자는 채우기 스크립트가 블록마다 센 원문 줄 수다(설명 글·표는 빼고). 새 쪽이 **옮기는** 서버 액션 넷만 세면
`eventRoster` 128 · `eventSetNote` 18 · `eventSave` 67 · `eventImport` 143 = **356줄**, 화면은 `admin-event.html` 597줄 가운데
사이 빈 줄 10을 뺀 587줄이다.

## 찾지 못한 것

1. **줄 하나를 고치는(이름·소속·직분) 액션·화면** — 없다. 지금까지 유일한 길은 `eventImport` 로 그 회차를 통째로 다시 넣는 것이었다.
2. **관리자가 줄 하나를 빼는 액션** — 없다(`eventDrop` 은 성도님 본인 `user_id` 가 있어야 한다).
3. **회차를 지우는 액션** — 없다(설계 7절도 만들지 않는다).
4. **`eventImport` 를 부르는 화면·도구** — 저장소 어디에도 없다(index.ts 밖 `git grep` 0건 · 관리 화면·`js/api.js` 에도 없음). 관리자 비밀번호로
   API 를 직접 불렀고(2026-09-10 · 09-29 Claude 손 작업), 그때 쓴 **다듬기 규칙**(「화평교구」→화평 · 「20목장」→20 · 「07」→7 · 「남성목장」→남성 ·
   「유년」→유년부 · 교구 칸 「청년」→교회학교 청년부 · 이름 끝 숫자 떼기 · 교인명부 옮겨 적기 다섯 규칙)은 **코드로 남아 있지 않다**
   (저장소 밖 임시 폴더에서 계산하고 지웠다). 설계 2절 「옮겨 적는 규칙」·3절 「명단 올리기」가 유일한 원문이다.
5. **`hasEligibility` 라는 값** — 옛 쪽에 없다. 서버는 `evtRule(ev)`(1.5)로, 화면은 `rows.some(r => r.weeksDone != null)`(admin-event.html:349, 357)로
   자격 회차를 알아챘다. 새 쪽은 서버가 `isEligEvent` 로 정해 내려 주고 화면은 그 값만 본다(4-2).
6. **동시 고침 검사(`expect`·`updated_at` 비교)** — 옛 이벤트 쪽에 한 군데도 없다. 새로 만든다.
7. **`redirect_merged_member_write` 트리거가 개발·운영 DB 의 `event_signups` 에 실제로 걸려 있는지** — SQL 파일만 봤다. Task 7(첫 쓰기 액션) 전에 개발에서
   `select tgname from pg_trigger where tgrelid = 'public.event_signups'::regclass and not tgisinternal;` 로 볼 것(읽기만 하는 질의).
8. **가을 설계 §12 의 「보정 창구」** — 그 이름의 화면·액션은 코드에 없다. 가장 가까운 것은 `eventExcuse`(1.13 자격 인정)다.
