# 사역신청 「현황」 화면 — 레거시 추출 (읽기 전용 조사)

대상: `admin-stats.html`(성경암송 v2, `renderMinistryAdmin` 및 부속) + `supabase/functions/api/index.ts`(`ministryList`·`ministrySetStatus`·`ministryDelete` 및 헬퍼) + `supabase/*.sql`(`ministry_orders` 테이블 이력).
범위 밖(요청에서 제외): 🗂️ 사역팀 정보(`renderMinistryCatalog`) · 📋 종이 명단(`renderMinistryPaper`) · 🎉 임명현황(`renderMinistryAppointed`) · 🔑 담당자(`renderMinistryAdmins`).

---

## 1. 서버 액션 (index.ts)

### 1.0 게이트 — `ministryAdminError`(명시 요청 목록엔 없지만 세 액션 모두의 첫 줄에서 호출되는 필수 헬퍼)

`index.ts:184-191`

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

동작: 관리자 암호(`ADMIN_SECRET`)가 맞으면 그냥 통과(담당자 확인 없이). 아니면 `MINISTRY_SECRET`과 대조하고, 맞아도 `ministryStaffKey`(등록 담당자 `ministryAdmins` 목록을 `user_id`로 풀어 대조, `index.ts:199-228`)가 그 사람을 찾아내야 통과한다. 틀린 암호와 "맞는 암호이지만 담당자 아님"은 **완전히 같은 문자열 `"unauthorized"`**를 반환한다 — 대칭성이 보안 요구사항이다. `ministryList`·`ministrySetStatus`·`ministryDelete` 세 액션 모두 첫 줄이 `const err = await ministryAdminError(b); if (err) return { ok: false, error: err };`이며, **액션마다** 다시 확인한다(로그인 화면에서 한 번 보고 끝내지 않음).

### 1.1 상수 — 상태·잠금·상한 규칙

`index.ts:4052-4066`

```ts
const MINISTRY_STATUS = ["신청완료", "접수완료", "임명확정", "취소"];
// 담당자가 **접수완료**를 누르면 그 건은 잠긴다 — 성도가 고치거나 뺄 수 없고,
// 그 순간 팀 「자세히 보기」의 명단에 이름이 올라간다(2026-09-09 성도님 요구).
// ⚠️ 잠겨도 「3개가 안 찼으면 더 신청」은 열려 있다. 그래서 한 사람이 한 행이 아니라
//    **한 팀이 한 행**이다 — 행이 통째로 잠기면 더 담을 자리가 없어진다.
// ⚠️ 「취소」도 잠긴다 — 관리자가 부서장 요청을 받아 내린 결정이라 성도가 되돌리지 못한다.
const MINISTRY_LOCKED = ["접수완료", "임명확정", "미채택", "취소"];
const isLocked = (st: string) => MINISTRY_LOCKED.indexOf(st) >= 0;
// ⚠️ 「미채택」은 자리를 **비운다**. 잠기기는 해도(그 팀은 결과가 났다) 3개 상한에서는
//    빼야 한다 — 안 그러면 떨어진 분이 다른 팀에 신청조차 못 하는 막다른 길이 된다.
// ⚠️ 「미채택」과 「취소」는 자리를 **도로 내놓는다**. 안 그러면 떨어지거나 취소당한 분이
//    다른 사역에 신청조차 못 하는 막다른 길이 된다.
const countsToCap = (st: string) => st !== "미채택" && st !== "취소";
// 명단에 오르는 상태 — 미채택은 함께 섬기는 분이 아니다
const MINISTRY_ROSTER = ["접수완료", "임명확정"];
```

⚠️ **화면(`MN_STATES`, admin-stats.html:3555)에서는 "미채택"이 이미 빠져 있다** — 2026-09-17 성도님 결정으로 화면·서버 액션 둘 다 신규 발급을 멈췄지만, **DB CHECK와 이 서버 상수 배열(`MINISTRY_LOCKED`·`MINISTRY_ROSTER`)에는 옛 값이 남아 있다**. 운영에 옛 "미채택" 행이 있다면(현재는 0건) 여전히 잠긴 것으로, 명단에서는 빠진 것으로 처리된다. `MINISTRY_STATUS`(신규 저장 허용값)에는 "미채택"이 없으므로 `ministrySetStatus`로 새로 "미채택"을 매길 수는 없다.

### 1.2 `ministryCfg` — 신청 기간·연도

`index.ts:4099-4108`

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

`ministryList`는 `year` 파라미터가 없으면 `cfg.year`(app_config `ministry` 키의 `year`, 기본 2027)를 쓴다. `isOpen`은 신청 화면(성도용)에만 영향 — 담당자 화면(`ministryList`/`SetStatus`/`Delete`)은 기간과 무관하게 언제나 동작한다.

### 1.3 `ministryRow` — 성도 응답에도 쓰이는 공용 변환기

`index.ts:4125-4143`

```ts
function ministryRow(r: any) {
  return {
    id: r.id,
    year: r.year,
    team_id: r.team_id,
    committee: r.committee ?? "",
    team: r.team ?? "",
    option: r.option ?? "",
    status: r.status,
    locked: isLocked(r.status),
    // ⚠️ note(담당자 메모·취소 사유)는 **여기 싣지 않는다.** 이 함수는 ministryMine 을 타고
    //    성도 화면까지 간다 — 「관리자만 본다」는 약속이 그 한 줄로 깨진다.
    //    관리자에게는 ministryList 가 따로 싣는다.
    position: r.position ?? "",
    at: kstDay(r.created_at).replace(/-/g, "."),
    created_at: r.created_at,
    decided_at: r.decided_at ?? null,
  };
}
```

`ministryList`는 이 함수의 결과에 `...ministryRow(r)`을 스프레드한 뒤 `name`·`who`·`note`·`notified_at`·`canPush`·`phone`·`source`를 관리자 전용으로 덧붙인다(`index.ts:4700-4709`, 아래 1.4).

### 1.4 `ministryList`

`index.ts:4667-4720`

```ts
async function ministryList(b: any) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const cfg = await ministryCfg();
  const year = Number(b.year) || cfg.year;
  const { data, error } = await db.from("ministry_orders")
    .select("*").eq("year", year).order("created_at", { ascending: false }).limit(2000);
  if (error) throw error;
  const rows = (data ?? []) as any[];

  // 이름·소속은 신청 당시 스냅샷을 쓰되, 비어 있으면 users에서 채운다
  const need = [...new Set(rows.filter((r) => !r.name).map((r) => r.user_id))];
  const umap = new Map<string, any>();
  if (need.length) {
    const { data: users } = await db.from("users")
      .select("id,type,gu,mok,bu,grade,name").in("id", need);
    for (const u of (users ?? []) as any[]) umap.set(u.id, u);
  }
  // ⚠️ 알림을 켜 두지 않은 분은 푸시가 안 간다 — 담당자가 게시·연락으로 메워야 하므로
  //    화면이 그 사실을 알 수 있게 함께 내려준다(필사 신청에서 배운 것).
  const hasPush = new Set<string>();
  if (rows.length) {
    const { data: subs } = await db.from("push_subscriptions")
      .select("user_id").in("user_id", rows.map((r) => r.user_id));
    for (const s of ((subs ?? []) as any[])) hasPush.add(s.user_id);
  }

  const list = rows.map((r) => {
    const u = umap.get(r.user_id);
    let who = r.who ?? "";
    if (!who && u) {
      who = (u.type === "교구" ? [u.gu, u.mok ? u.mok + "목장" : ""] : [u.bu, u.grade])
        .filter(Boolean).join(" ");
    }
    return {
      ...ministryRow(r),
      name: r.name || (u ? u.name : "") || "",
      who,
      note: r.note ?? "",         // ⚠️ 관리자 전용 — 성도 응답에는 없다
      notified_at: r.notified_at,
      canPush: hasPush.has(r.user_id),
      phone: r.phone ?? "",       // 교적 대조·연락용 — 결정이 나면 서버가 지운다
      source: r.source ?? "app",  // app 앱 신청 · paper 담당자가 올린 종이 명단
    };
  });

  // 팀별 신청 수 — 담당자가 가장 먼저 궁금해하는 숫자
  // ⚠️ 한 행 = 한 팀 이 되었으므로 행을 그대로 센다(옛 choices 칸은 지워졌다)
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const k = (r.committee ?? "") + " · " + (r.team ?? "");
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { ok: true, year, list, counts };
}
```

- 반환값: `{ ok, year, list[], counts{} }`. `list`의 각 항목은 `ministryRow`의 필드 전부(`id,year,team_id,committee,team,option,status,locked,position,at,created_at,decided_at`) + `name,who,note,notified_at,canPush,phone,source`.
- **`user_id`는 응답 어디에도 없다**(공개 API 규칙).
- `limit(2000)` — 신청 건수가 2000을 넘으면 조용히 잘린다(경고 주석 없음, 발견 사항).
- `counts`는 **연도 전체 상태 무관 전량**을 센 것 — 화면은 이 값을 안 쓰고 걸러진 `rows`로 직접 다시 센다(2026-09-18, 아래 2절 `mnRender` 참고). 서버 `counts`는 현재 죽은 필드나 다름없다(호환용으로만 남아 있음, 발견 사항).

### 1.5 `ministryDelete`

`index.ts:4728-4742`

```ts
async function ministryDelete(b: any) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id) || 0;
  if (!id) return { ok: false, error: "id 확인" };
  const { data: row, error: e0 } = await db.from("ministry_orders")
    .select("id,year,name,who,committee,team,status").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!row) return { ok: false, error: "신청을 찾을 수 없습니다 (이미 지워졌을 수 있어요)" };
  const { error } = await db.from("ministry_orders").delete().eq("id", id);
  if (error) throw error;
  // 무엇을 지웠는지 돌려준다 — 화면이 「○○님의 △△ 신청을 지웠습니다」로 알릴 수 있게.
  // ⚠️ user_id 는 싣지 않는다(공개 API 규칙).
  return { ok: true, deleted: { id: row.id, name: row.name ?? "", who: row.who ?? "",
                                committee: row.committee ?? "", team: row.team ?? "", status: row.status } };
}
```

바로 위 주석(`index.ts:4722-4727`):
```ts
// 관리자 상태 변경 — '임명확정'으로 바뀌면 앱 푸시를 한 번 보낸다
// 신청 한 건을 **아주 지운다**(2026-09-26 성도님) — 「완전히 잘못 들어온 것은 남기지 않는다」.
// ⚠️ 되돌릴 수 없다. 상태 「취소」와 다르다 — 취소는 자취가 남고(사유·decided_at) 성도님 화면에도
//    「부서 요청으로 취소되었어요」로 보인다. 지우면 성도님 화면에서도 그 줄이 통째로 사라지고,
//    3개 상한의 자리도 도로 비어 다시 신청할 수 있게 된다.
// ⚠️ 화면(mnDialog)이 한 번 더 묻지만, **서버도 자기 자리에서 막는다** — 담당자 암호가 없으면 안 된다.
```

- 상태·상한값에 새 값을 더하는 것이 아니다(DB CHECK·`MINISTRY_STATUS` 불변, 마이그레이션 없음) — 행을 물리적으로 지울 뿐.
- 지우기 전 `note`(취소 사유 등)를 조회하지 않는다 — `select`에 `note`가 없다. 삭제 확인창(화면)에는 사유가 안 뜬다(상태·이름·소속·위원회·팀만).

### 1.6 `ministrySetStatus`

`index.ts:4744-4796`

```ts
async function ministrySetStatus(b: any) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id) || 0;
  const status = norm(b.status);
  if (!id || MINISTRY_STATUS.indexOf(status) < 0) return { ok: false, error: "id/status 확인" };
  const { data: row } = await db.from("ministry_orders").select("*").eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "신청을 찾을 수 없습니다" };

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  // ⚠️ 결정이 나면 휴대폰 뒷 4자리를 지운다 — 고치기 확인도, 교적 대조도 끝난 자리다.
  //    사람이 기억해서 지우는 약속은 언젠가 지켜지지 않으니, 상태를 바꾸는 그 자리에서 지운다
  //    (필사 신청이 배부완료에서 번호를 지우는 것과 같은 규칙).
  if (status === "임명확정" || status === "미채택" || status === "취소") {
    patch.decided_at = new Date().toISOString();
    patch.phone = null;
  }
  // ⚠️ 취소는 **사유 없이 못 한다.** 부서장 요청을 오프라인으로 받아 처리하는 일이라,
  //    적어 두지 않으면 나중에 「왜 취소됐지」를 아무도 모른다(성도님 결정 2026-09-10).
  if (status === "취소" && !norm(b.note)) {
    return { ok: false, error: "취소 사유를 적어 주세요 (관리자만 봅니다)" };
  }
  // 임명확정에서 물러나면 그 행의 「알림 보냈음」도 지운다(이미 나간 알림을 무를 수는 없다)
  if (row.status === "임명확정" && status !== "임명확정") patch.notified_at = null;
  if (typeof b.note === "string") patch.note = norm(b.note);

  let pushed = 0;
  let pushError: string | null = null;
  let already = false;
  // ⚠️ 확정 알림은 **한 사람에게 한 해에 한 번**이다. 한 행이 한 팀이 되면서
  //    세 건을 확정하면 푸시가 세 번 갔다(2026-09-09 감사). 그 사람의 다른 건이
  //    이미 보냈는지를 본다 — 행 하나만 보면 못 막는다.
  if (status === "임명확정") {
    // ⚠️ **아직 살아 있는 확정**만 센다. 되돌린 확정의 흔적까지 세면 그 뒤 어떤 팀을
    //    확정해도 알림이 영영 안 간다 — 성도는 틀린 알림만 받고 담당자는 「이미 나갔다」로
    //    읽어 손을 뗀다(2026-09-09 감사).
    const { data: sentRows } = await db.from("ministry_orders")
      .select("id").eq("year", row.year).eq("user_id", row.user_id)
      .eq("status", "임명확정").not("notified_at", "is", null).limit(1);
    if ((sentRows ?? []).length) {
      already = true;                        // 이미 알렸다 — 「안 켜심」과 구분해 돌려준다
    } else {
      const res = await ministryNotify(row);
      pushed = res.sent;
      pushError = res.error;
      if (res.sent > 0) patch.notified_at = new Date().toISOString();
    }
  }
  const { error } = await db.from("ministry_orders").update(patch).eq("id", id);
  if (error) throw error;
  // 결정이 나면 4자리를 지운다 — 화면이 그 사실을 바로 반영하도록 알려 준다
  return { ok: true, status, pushed, pushError, already,
           phoneCleared: patch.phone === null };
}
```

상태 전이 규칙 요약:
- 유효 상태는 `MINISTRY_STATUS` 4개뿐(`신청완료·접수완료·임명확정·취소`) — 그 외 값(옛 "미채택" 포함)은 즉시 `"id/status 확인"` 오류.
- `임명확정 | 미채택 | 취소`로 바뀌면: `decided_at = now()`, `phone = null`(휴대폰 번호 삭제). "미채택"은 `MINISTRY_STATUS`에 없어 이 액션으로는 도달 불가능한 죽은 분기(현재 코드상 존재하지만 실행 불가) — 발견 사항.
- `취소`로 바뀌는데 `note`가 비어 있으면 거부(`"취소 사유를 적어 주세요 (관리자만 봅니다)"`).
- 예전에 `임명확정`이었다가 다른 상태로 바뀌면 `notified_at`을 `null`로 되돌린다(이미 나간 알림 자체는 취소 안 됨, 재확정 시 다시 보낼 수 있게 하는 장치).
- `note`는 `typeof b.note === "string"`일 때만 갱신(안 보내면 기존 값 유지 — "보내온 것만 고친다" 규칙).
- `임명확정`으로 확정될 때만 `ministryNotify` 호출 조건: **그 해·그 user_id로 이미 살아있는(notified_at not null) 임명확정 행이 하나라도 있으면 스킵**(`already:true`) — 한 사람 한 해 한 번 원칙. 없으면 발송하고 성공 시(`sent>0`)만 `notified_at` 기록.
- 반환값: `{ ok:true, status, pushed, pushError, already, phoneCleared }`. `pushed`(발송 기기 수), `pushError`(마지막 실패 사유 또는 `"not-subscribed"`), `already`(이미 그 해 알림 나감), `phoneCleared`(번호를 지웠는지 — 화면이 카드에서 전화번호를 즉시 지우는 신호).

### 1.7 `ministryNotify`

`index.ts:5025-5040`

```ts
// 그 성도의 기기에만 발송. 알림을 켜 두지 않았으면 조용히 0건 —
// ⚠️ 그때는 게시로 알린다. 푸시가 게시를 대신하는 것이 아니라 함께 가는 것이다(2026-09-08 결정).
async function ministryNotify(row: any) {
  const { data: subs } = await db.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth").eq("user_id", row.user_id);
  const list = (subs ?? []) as any[];
  if (!list.length) return { sent: 0, error: "not-subscribed" };
  const who = norm(row.name);
  const teams = norm(row.team);
  const payload = JSON.stringify({
    title: "[고척교회 사역신청]",
    body: (who ? who + " 성도님, " : "성도님, ") +
      row.year + "년도 사역 임명이 확정되었습니다" + (teams ? " (" + teams + ")" : "") +
      ". 자세한 내용은 게시판에서도 확인하실 수 있습니다. 샬롬!",
    url: "https://gocheok.onlybible.kr/",
  });
  return await pushToSubs(list, payload, "ministry", "사역 임명확정");
}
```

### 1.8 `pushToSubs` — 서명 + 동작 요약(verbatim 아님, 지시대로)

`index.ts:3715`
```ts
async function pushToSubs(list: any[], payload: string, mode: string, title: string) {
```

동작 요약(10줄 이내): 구독 목록(`{endpoint,p256dh,auth}` 배열)을 돌며 `webpush.sendNotification`으로 하나씩 보낸다. 성공마다 `sent++`, 실패마다 `failed++`. 실패 시 상태코드가 404·410(구독 만료)이면 그 자리에서 `push_subscriptions`에서 그 행을 삭제한다. 마지막 실패 메시지를 `[코드] 본문`(최대 120자)으로 `last`에 저장해 둔다. 끝나면 `push_log`에 `{mode,title,sent,failed,total,ok:sent>0}`를 기록(로그 실패는 무시). 반환값은 `{ sent, error: sent ? null : last }` — 성공이 하나라도 있으면 `error:null`.

### 1.9 DB — `ministry_orders` 테이블 정의(원본 + 마이그레이션 전체, verbatim)

원본 생성(`supabase/ministry.sql:56-88`):

```sql
create table if not exists public.ministry_orders (
  id          bigserial   primary key,
  year        int         not null,
  user_id     text        not null,
  name        text,                                -- 신청 당시 이름(명단 조회용 스냅샷)
  who         text,                                -- 신청 당시 소속(교구·목장 / 부서·학년)
  choices     jsonb       not null default '[]'::jsonb,
  -- choices 는 [{id, committee, team, option}] 최대 3개.
  -- ⚠️ 순위가 없다(2026-09-08 결정). 배열 순서는 남지만 뜻을 부여하지 않는다 —
  --    나중에 순위가 필요해지면 이 순서를 화면에서 보여주기만 하면 된다.
  -- ⚠️ 팀 이름을 함께 박아 둔다(스냅샷). 목록이 바뀌어도 "그때 무엇을 냈는지"가 남는다.
  status      text        not null default '신청완료',
  note        text,                                -- 담당자 메모
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  decided_at  timestamptz,                         -- 임명확정/미채택으로 바꾼 시각
  notified_at timestamptz,                         -- 임명확정 푸시를 보낸 시각
  unique (year, user_id)
);

create index if not exists ministry_orders_year_idx
  on public.ministry_orders (year, created_at desc);

alter table public.ministry_orders drop constraint if exists ministry_orders_status_chk;
alter table public.ministry_orders add constraint ministry_orders_status_chk
  check (status in ('신청완료', '검토중', '임명확정', '미채택'));

-- ⚠️ 최대 3개는 화면·서버·DB 세 곳에서 지킨다. 화면은 편의고, 규칙은 여기서 끝난다.
alter table public.ministry_orders drop constraint if exists ministry_orders_max3_chk;
alter table public.ministry_orders add constraint ministry_orders_max3_chk
  check (jsonb_array_length(choices) between 1 and 3);

alter table public.ministry_orders enable row level security;
```

마이그레이션 ① `supabase/ministry_per_team.sql`(2026-09-09, 전문) — 「한 행 = 한 팀」으로 전환, `choices` 폐지 준비, `team_id/committee/team/option` 추가, unique를 `(year,user_id,team_id)`로, 상태값에서 "검토중"→"접수완료":

```sql
-- 사역신청 — 한 행 = 한 팀 으로 편다 (2026-09-09)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 왜 바꾸나 — 성도님이 요구한 세 가지가 모두 「팀마다 따로」를 가리킨다(2026-09-09).
--   ① 담당자가 **접수완료**하면 그 팀 명단에 이름이 보인다
--   ② **접수완료 전까지만** 성도가 고칠 수 있다
--   ③ 접수완료된 뒤에도 **3개가 안 찼으면 또 신청**할 수 있다
-- 전에는 한 사람이 한 행이고 고른 팀 셋이 choices 배열에 들어 있었다. 그러면
-- ①은 세 팀에 한꺼번에만 올릴 수 있고(부서마다 따로 접수하지 못한다),
-- ③은 행이 통째로 잠겨 더 담을 자리가 없다.
--
-- ⚠️ choices 칸은 아직 지우지 않는다. 지금 돌고 있는 함수가 그 칸을 읽으므로,
--    함수를 새로 올린 뒤 ministry_per_team_drop.sql 로 따로 지운다.

begin;

-- 1) 새 칸 — 팀 하나를 행에 박는다(스냅샷: 목록이 바뀌어도 무엇을 냈는지 남는다)
alter table public.ministry_orders
  add column if not exists team_id   bigint,
  add column if not exists committee text,
  add column if not exists team      text,
  add column if not exists option    text;

-- 2) 행을 늘리기 전에 막는 제약부터 푼다
alter table public.ministry_orders drop constraint if exists ministry_orders_max3_chk;
alter table public.ministry_orders alter column choices drop not null;
do $$
declare c text;
begin
  -- unique (year, user_id) 의 실제 이름을 짐작하지 않는다 — 유일 제약을 찾아 지운다
  for c in select conname from pg_constraint
            where conrelid = 'public.ministry_orders'::regclass and contype = 'u'
  loop execute format('alter table public.ministry_orders drop constraint %I', c); end loop;
end $$;

-- 3) choices 배열을 행으로 편다
insert into public.ministry_orders
  (year, user_id, name, who, position, phone4, team_id, committee, team, option,
   status, note, created_at, updated_at, decided_at, notified_at)
select o.year, o.user_id, o.name, o.who, o.position, o.phone4,
       (c->>'id')::bigint, c->>'committee', c->>'team', coalesce(c->>'option', ''),
       o.status, o.note, o.created_at, o.updated_at, o.decided_at, o.notified_at
  from public.ministry_orders o
       cross join lateral jsonb_array_elements(coalesce(o.choices, '[]'::jsonb)) c
 where o.team_id is null;

delete from public.ministry_orders where team_id is null;

-- 4) 이제 한 사람이 한 팀에 한 번만
alter table public.ministry_orders alter column team_id set not null;
alter table public.ministry_orders
  add constraint ministry_orders_uni unique (year, user_id, team_id);

-- 5) 상태 사다리 — 「검토중」 자리를 「접수완료」가 대신한다.
--    담당자가 눌러 **잠그는** 그 자리이고, 그 순간 팀 명단에 이름이 올라간다.
alter table public.ministry_orders drop constraint if exists ministry_orders_status_chk;
update public.ministry_orders set status = '접수완료' where status = '검토중';
alter table public.ministry_orders add constraint ministry_orders_status_chk
  check (status in ('신청완료', '접수완료', '임명확정', '미채택'));

-- 6) 팀 명단을 뽑는 길 — 「이 팀에 접수된 분」을 자주 묻게 된다
create index if not exists ministry_orders_team_idx
  on public.ministry_orders (year, team_id, status);

commit;

-- 확인
--   select year,user_id,team,status from ministry_orders where year=2027 order by user_id,team;
--   select conname from pg_constraint where conrelid='public.ministry_orders'::regclass;
```

마이그레이션 ② `supabase/ministry_per_team_drop.sql`(전문):

```sql
-- 사역신청 — 다 쓴 choices 칸 치우기 (2026-09-09)
-- ⚠️ ministry_per_team.sql 을 돌리고 **새 함수를 올린 뒤에** 실행한다.
--    옛 함수는 이 칸을 읽으므로, 먼저 지우면 그 사이에 신청 화면이 깨진다.
alter table public.ministry_orders drop column if exists choices;
```

마이그레이션 ③ `supabase/ministry_position_members.sql`(전문, `position` 칸 추가 — `members_note`는 `ministry_catalog` 소속이라 신청서 테이블과 무관):

```sql
-- 사역신청 — 직분 받기 + 팀별 「지금 섬기는 분」 (2026-09-09)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.

-- ── 1) 신청서에 직분 ───────────────────────────────────────────────
-- 왜 받나: 담당자가 명단을 교적과 맞대 볼 때 이름만으로는 동명이인이 갈리지 않고,
--          임명 뒤 팀 명단을 「김세웅 안수집사」꼴로 적을 때 그대로 쓴다.
-- ⚠️ 값은 고른 것만 들어온다(서버 allowlist) — 자유 입력이면 「집사님」·「집사 」가
--    섞여 교적 대조가 도로 사람 손일이 된다.
alter table public.ministry_orders
  add column if not exists position text;

alter table public.ministry_orders drop constraint if exists ministry_orders_position_chk;
alter table public.ministry_orders add constraint ministry_orders_position_chk
  check (position is null or position in
    ('성도','집사','권사','안수집사','장로','전도사','목사','학생'));

-- ── 2) 팀마다 「지금 섬기는 분」 ─────────────────────────────────────
-- 왜 받나: 이름과 하는 일만으로는 「내가 낄 자리인가」가 안 그려진다.
--          아는 얼굴이 하나라도 보이면 신청 문턱이 확 낮아진다(성도님 요청 2026-09-09).
-- ⚠️ **관리자가 손으로 넣는다.** 이 앱은 교적·조직표를 갖고 있지 않다.
--    자동으로 채우려면 신청 결과를 쓸 수밖에 없는데, 그건 「올해 임명 결과」이지
--    「지금 섬기는 분」이 아니고, 확정 전 신청자를 남에게 보이는 일이 된다.
-- ⚠️ 한 줄에 한 분씩 적는다(줄바꿈은 <br> 로 저장된다).
--    예)  김세웅 안수집사 (화평-20)
alter table public.ministry_catalog
  add column if not exists members_note text;

-- 확인
--   select id, committee, team, members_note from ministry_catalog where year = 2027 limit 5;
--   select name, position, phone4, status from ministry_orders where year = 2027;
```

마이그레이션 ④ `supabase/ministry_position_samo.sql`(전문, position CHECK에 "사모" 추가 — 세 곳 중 하나만 고쳐 500 오류를 냈던 실제 사고):

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

마이그레이션 ⑤ `supabase/ministry_phone4.sql`(전문, 폐기됨 — 뒷 4자리 방식):

```sql
-- 사역신청 — 휴대폰 뒷 4자리 (2026-09-08)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 왜 받나 — 두 가지다.
--   ① **최소 본인 확인.** 이 앱은 비밀번호가 없다(교구·목장·이름 로그인).
--      신청을 고치거나 취소할 때 이 4자리를 다시 받아 맞는지 본다.
--      완전한 인증은 아니지만, 남이 우연히 남의 신청을 건드리는 일은 막는다.
--   ② **교적 대조.** 담당자가 신청자 명단을 교적과 맞대 볼 때 쓴다.
--      ⚠️ 앱은 교적을 모른다 — 자동으로 맞춰 보지 못한다. 사람이 본다.
--
-- ⚠️ 뒷 4자리만 받는다. 번호 전체를 받지 않는 것은 그것으로 충분하고,
--    적게 가질수록 지킬 것도 적기 때문이다(개인정보 안내 /privacy/ 에 함께 적었다).

alter table public.ministry_orders
  add column if not exists phone4 text;

-- 숫자 4자리만 — 빈 값(옛 행)은 그대로 둔다
alter table public.ministry_orders drop constraint if exists ministry_orders_phone4_chk;
alter table public.ministry_orders add constraint ministry_orders_phone4_chk
  check (phone4 is null or phone4 ~ '^[0-9]{4}$');

-- 확인
--   select id, name, phone4, status from ministry_orders where year = 2027;
```

마이그레이션 ⑥ `supabase/ministry_phone_full.sql`(전문, `phone4`를 대체하는 **현재** 방식 — 전체 번호, 결정 시 삭제):

```sql
-- 사역신청 — 뒷 4자리 대신 휴대폰 번호 전체 (2026-09-09)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 왜 바꾸나(성도님 결정 2026-09-09): 뒷 4자리는 교적 대조에는 모자라고, 임명이
-- 정해진 뒤 담당자가 연락할 길도 없었다. 필사 노트 신청과 같은 방식으로 맞춘다.
-- ⚠️ 더 많이 받는 만큼 약속도 같아야 한다 — **결정이 나면 서버가 번호를 지운다**
--    (ministrySetStatus). 개인정보 안내 /privacy/ 에도 함께 적었다.
-- ⚠️ 옛 뒷 4자리는 번호로 되살릴 수 없다. 그대로 버리고 새로 받는다
--    (신청 기간 2026-12-13 시작 전이라 운영에는 시험 행뿐이다).

alter table public.ministry_orders
  add column if not exists phone text;

alter table public.ministry_orders drop constraint if exists ministry_orders_phone4_chk;
alter table public.ministry_orders drop column if exists phone4;

-- 확인
--   select name, phone, status from ministry_orders where year = 2027;
```

⚠️ `phone` 컬럼 자체에는 형식 CHECK가 없다(서버의 `PILSA_PHONE_RE`만 검사). 길이·자릿수 제약을 DB에서 기대하면 틀린다(발견 사항).

마이그레이션 ⑦ `supabase/ministry_cancel_status.sql`(전문, 상태값에 "취소" 추가 + `note` 코멘트):

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

⚠️ **이 파일명(`ministry_cancel_status.sql`)이 상태 CHECK의 최종본이다** — "취소"까지 포함한 5개 값(`신청완료·접수완료·임명확정·미채택·취소`)이 지금 DB에 걸려 있는 값이다. 서버 `MINISTRY_STATUS`(4개, 미채택 제외)보다 DB CHECK가 더 넓다 — DB는 옛 데이터 호환을 위해 "미채택"을 여전히 허용하지만 서버 코드로는 새로 만들 수 없다.

마이그레이션 ⑧ `supabase/ministry_paper_leader.sql`(전문 — `source` 칸은 `ministry_orders` 소속, `leader_note`는 `ministry_catalog` 소속):

```sql
-- 사역신청 — ① 종이(오프라인) 신청 표시 ② 사역마다 담당자 한 줄 (2026-09-18)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영(xnomlgydifiqiybervtf)에 올린다.
-- ⚠️ **이 SQL 이 먼저, 코드가 나중이다.** 새 칸을 읽고 쓰는 코드를 먼저 올리면
--    칸이 없는 DB 에서 사역 목록 조회가 통째로 실패한다(성도님 화면이 빈다).

-- ── 1) 종이로 받은 신청 표시 ────────────────────────────────────────
-- 왜 받나: 12월 신청은 앱과 종이가 섞인다. 담당자가 화면에서 가려 보고,
--          나중에 「앱 몇 건·종이 몇 건」을 셀 수 있어야 한다(성도님 결정 2026-09-18).
-- ⚠️ 종이 건은 **앱 알림이 가지 않는다**(그분이 앱을 안 쓰실 수 있다) — 임명 안내는
--    담당자가 따로 한다. 화면이 그 사실을 말해 주어야 해서 표시가 필요하다.
alter table public.ministry_orders
  add column if not exists source text not null default 'app';

alter table public.ministry_orders drop constraint if exists ministry_orders_source_chk;
alter table public.ministry_orders add constraint ministry_orders_source_chk
  check (source in ('app', 'paper'));

comment on column public.ministry_orders.source is
  'app = 성도님이 앱에서 낸 신청 · paper = 담당자가 종이 신청을 대신 넣은 것';

-- ── 2) 사역마다 담당자 한 줄 ───────────────────────────────────────
-- 왜 받나: 「궁금하면 누구에게 물어야 하나」가 신청 전 가장 큰 물음이다(종이 양식에도
--          문의처 칸을 둔 것과 같은 까닭). 화면에서는 「섬기는 분」 **위**에 보인다.
-- ⚠️ 그냥 글자다(성도님 결정 2026-09-18) — 계정과 잇지 않는다. 담당자가 교체되면
--    관리자 화면에서 고쳐 쓰면 된다.
--    예)  김세웅 안수집사 (010-1234-5678)
alter table public.ministry_catalog
  add column if not exists leader_note text;

comment on column public.ministry_catalog.leader_note is
  '사역 담당자(문의처) — 관리자가 손으로 넣는 한 줄. 화면에서 「섬기는 분」 위에 보인다';

-- 확인
--   select source, count(*) from ministry_orders where year = 2027 group by source;
--   select id, committee, team, leader_note from ministry_catalog where year = 2027 limit 5;
```

**`ministry_orders` 논리 스키마 현재 상태(위 이력을 합성)**:
`id bigserial pk · year int not null · user_id text not null · name text · who text · position text (CHECK 9종: 성도/집사/권사/안수집사/장로/전도사/목사/사모/학생) · phone text(형식 CHECK 없음) · team_id bigint not null · committee text · team text · option text · status text default '신청완료' (CHECK: 신청완료/접수완료/임명확정/미채택/취소) · note text(담당자 전용) · source text not null default 'app' (CHECK: app/paper) · created_at timestamptz default now() · updated_at timestamptz default now() · decided_at timestamptz · notified_at timestamptz · unique(year,user_id,team_id) · index(year,created_at desc) · index(year,team_id,status) · RLS enabled(서비스 롤만 접근)`. `choices jsonb`는 폐지되어 더 이상 존재하지 않는다.

---

## 2. 화면 (admin-stats.html) — 신청 현황

### 2.0 상태·전역 변수

`admin-stats.html:3550-3566`

```js
// 필사 신청 화면(pl*)과 같은 뼈대다 — 상태 칩으로 추리고, 카드마다 드롭다운으로
// 상태를 바꾸고, 바꾼 결과(알림 발송)를 한 줄로 알려 준다.
// ⚠️ 필사에서 배운 것을 그대로 가져온다: 발송 «실패»를 «안 켜심»으로 뭉뚱그리면
//    담당자는 게시만 하고 넘어가고, 푸시가 고장 난 사실은 아무도 모르게 된다.
// ⚠️ 「미채택」은 뺐다(2026-09-17 성도님 결정) — 서버 MINISTRY_STATUS 와 같게.
const MN_STATES = ["신청완료", "접수완료", "임명확정", "취소"];
const MN_CLS = { "신청완료": "s1", "접수완료": "s2", "임명확정": "s3", "미채택": "s4", "취소": "s4" };
const MN_SHORT = { "신청완료": "신청", "접수완료": "접수", "임명확정": "임명", "미채택": "미채택", "취소": "취소" };
let mnRows = [];      // [{ id, at, who, name, position, committee, team, option, status, ... }]
// ⚠️ 한 건 = 한 팀 이다(2026-09-09). 한 사람이 최대 3건이고, 담당자는 건마다 따로 접수한다.
let mnView = "row";   // row 건별 · person 사람별 · team 사역별
const mnStOn = new Set(["신청완료"]);   // 상태 거르기 — 비면 전체. 처음엔 처리할 것(신청완료)만
let mnRange = "all";   // 신청일: all · today · 7d · custom
let mnCondOpen = false; // 조회 조건(검색·신청일) 펼침 — 처음엔 접어 둔다(명단이 길다)
const mnOpen = new Set();   // 펼쳐 둔 묶음 — 상태를 바꿔 다시 그려도 접히지 않게
let mnLoaded = false;
```

⚠️ **화면 초기값이 "신청완료"만 켜져 있다** — 새로 열면 접수·임명·취소 건은 안 보인다("처리할 것"만 기본으로). `mnRows`는 로그인 중 한 번 불러온 뒤 로컬 상태로만 갱신되고(`mnLoad`가 `mnLoaded` 플래그로 캐시), 상태 변경(`mnSetStatus`)·삭제(`mnDeleteOne`)는 서버 성공 후 이 배열을 직접 patch한다(재조회 없음).

### 2.1 인증/저장소 헬�퍼 — `getStaff` / `getPw` / `minAuthLost`

`admin-stats.html:943-967`

```js
const MINISTRY_ONLY = new URLSearchParams(location.search).get("only") === "ministry";
const PW_KEY = MINISTRY_ONLY ? "ministry-pw" : "admin-pw";
const STAFF_KEY = "ministry-staff";
function getStaff(){
  if(!MINISTRY_ONLY) return null;
  try { return JSON.parse(sessionStorage.getItem(STAFF_KEY) || "null"); } catch(_) { return null; }
}
if(MINISTRY_ONLY){
  document.title = "사역신청 관리";
  document.querySelector(".topbar h1").textContent = "🤝 사역신청 관리";
  document.getElementById("hub-link").hidden = true;
}
const GU_LIST = ["믿음","소망","사랑","섬김","은혜","화평","기쁨","새가족"];
const BU_LIST = ["사랑부","영아부","유아부","유치부","유년부","초등부","중등부","고등부","청년부"];
const app = document.getElementById("app");
const logoutBtn = document.getElementById("logout");

logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem(PW_KEY);
  sessionStorage.removeItem(STAFF_KEY);
  logoutBtn.hidden = true;
  renderLogin();
});

function getPw(){ return sessionStorage.getItem(PW_KEY) || ""; }
```

`admin-stats.html:1090-1098`

```js
// ⑤ 담당자에서 빠졌거나 암호가 바뀌면 열린 화면을 그대로 두지 않고 로그인으로 돌려보낸다(2026-09-17 리뷰)
function minAuthLost(d){
  if(!MINISTRY_ONLY || !d || d.error!=="unauthorized") return false;
  sessionStorage.removeItem(PW_KEY);
  sessionStorage.removeItem(STAFF_KEY);
  renderLogin();
  const e=document.getElementById("lerr");
  if(e) e.textContent="로그인이 풀렸습니다(담당자 등록이나 암호가 바뀌었을 수 있습니다). 다시 로그인해 주세요.";
  return true;
}
```

`admin.html`(허브)에서 관리자 암호로 들어오면 `MINISTRY_ONLY=false`이므로 `getStaff()`는 항상 `null`을 반환 — `staff`를 실어 보내는 것은 **담당자 전용 화면(`admin-ministry.html?only=ministry`)일 때뿐**이고, 관리자 허브 경로에서는 서버가 `ministryAdminError`의 `adminError(b)` 분기(관리자 암호)로 바로 통과된다.

### 2.2 공용 유틸 — `plCloseMenus` / `plEsc`

`admin-stats.html:2279-2291`

```js
function plCloseMenus(){
  document.querySelectorAll(".pl-drop.open").forEach(w=>{
    w.classList.remove("open"); w.classList.remove("up");
    const b=w.querySelector("[data-drop],[data-mndrop]"); if(b) b.setAttribute("aria-expanded","false");
  });
}
if(!window.__plMenuBound){
  window.__plMenuBound = true;
  document.addEventListener("click", plCloseMenus);
  document.addEventListener("keydown", e=>{ if(e.key==="Escape") plCloseMenus(); });
}

function plEsc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c])); }
```

`.pl-*` 드롭다운은 필사 노트 신청 화면과 완전히 공유되는 부품 — 문서 바깥 클릭·Escape로 전역에서 한 번만 바인딩된다(`window.__plMenuBound` 가드).

### 2.3 `renderMinistryAdmin` — 화면 뼈대·이벤트 바인딩

`admin-stats.html:3944-4034`

```js
function renderMinistryAdmin(){
  window.scrollTo(0, 0);        // 앞 화면에서 내려둔 자리가 남지 않게(표준 v1)
  // ⚠️ 거르기 영역을 작게 다시 짰다(2026-09-17 성도님 — 「칸만 크고 글꼴도 제각각」).
  //    상태는 숫자 막대(누르면 그 상태만, 더 누르면 더하고, 전체는 모두), 요약 숫자는 보기 단추 안으로,
  //    신청일은 전체·오늘·7일·직접(직접일 때만 날짜 칸).
  const stBtn=(key, cls, label, cntAttr)=>`<button type="button" class="${cls}" data-st="${key}">
      <b ${cntAttr}>0</b><span>${label}</span></button>`;
  app.innerHTML=`
    <div class="rep-head mn-top">
      <button class="back-btn" id="back">← 메뉴</button>
      <h2>🤝 사역신청 현황</h2>
    </div>
    <!-- 화면 전체에 대한 동작은 제목 줄 바로 아래 한 줄에만(표준 v1 ⑦) -->
    <div class="adm-acts">
      <button type="button" class="push-btn ghost" id="mn-reload">↻ 새로 불러오기</button>
    </div>
    <div class="push-card mn-panel">
      <!-- ⚠️ 붙는 머리에는 「지금 무엇을 보고 있나」만 둔다(표준 v1 ⑧) — 보기 단추와 펼치는 조회 조건은
           머리 **밖** 형제로 내렸다. 접힌 머리까지 152px 이라 360×640 폰에서 화면의 1/4을 먹었다. -->
      <div class="mn-head" id="mn-head">
        <div class="mn-stlb">상태 <i>(전체 기준)</i></div>
        <div class="mn-stbar" id="mn-st" role="group" aria-label="상태로 거르기">
          ${stBtn("", "all", "전체", "data-mncnt-all")}
          ${MN_STATES.map(x=>stBtn(x, MN_CLS[x], MN_SHORT[x], `data-mncnt="${x}"`)).join("")}
        </div>
        <div class="mn-condbar">
          <button type="button" class="mn-cond-toggle" id="mn-cond-toggle" aria-expanded="${mnCondOpen}" aria-controls="mn-cond">
            <span class="mn-cond-t">📅 신청일</span><span class="mn-cond-sum" id="mn-cond-sum"></span><span class="mn-cond-arrow" aria-hidden="true">▾</span>
          </button>
        </div>
      </div>
      <div class="mn-vlb">지금 보이는 것</div>
      <div class="mn-view" id="mn-view" role="tablist">
        <button type="button" data-view="row" class="${mnView==="row"?"on":""}">건별 <em data-vcnt="row">0</em>건</button>
        <button type="button" data-view="person" class="${mnView==="person"?"on":""}">사람별 <em data-vcnt="person">0</em>명</button>
        <button type="button" data-view="team" class="${mnView==="team"?"on":""}">사역별 <em data-vcnt="team">0</em>팀</button>
      </div>
      <!-- 찾기는 세 화면(현황·사역팀 정보·임명현황) 모두 **늘 보이는 같은 자리**에 둔다(2026-09-18).
           그전에는 이 칸만 접힌 「조회 조건」 안에 숨어, 같은 모양인데 하나만 펴야 보이는 꼴이었다. -->
      <div class="mn-search mn-search-top">
        <span class="mn-search-ico" aria-hidden="true">🔍</span>
        <input type="search" id="mn-q" placeholder="이름 · 소속 · 사역팀" autocomplete="off">
      </div>
      <div class="mn-cond" id="mn-cond"${mnCondOpen?"":" hidden"}>
          <div class="mn-range" id="mn-range">
            <span class="mn-range-lb">신청일</span>
            ${[["all","전체"],["today","오늘"],["7d","7일"],["custom","직접"]].map(([k,t])=>
              `<button type="button" data-range="${k}" class="${mnRange===k?"on":""}">${t}</button>`).join("")}
          </div>
          <div class="mn-custom" id="mn-custom"${mnRange==="custom"?"":" hidden"}>
            <input type="date" id="mn-from" aria-label="신청일 시작"><span>~</span><input type="date" id="mn-to" aria-label="신청일 끝">
          </div>
      </div>
      <div id="mn-sum" class="mn-sum"></div>
      <div id="mn-list"><p class="msg">불러오는 중...</p></div>
      <div id="mn-teams" class="mn-teams"></div>
    </div>`;
  document.getElementById("back").addEventListener("click", renderMenu);
  document.getElementById("mn-reload").addEventListener("click", ()=>{ mnLoaded=false; mnLoad(); });
  document.getElementById("mn-q").addEventListener("input", mnRender);
  ["mn-from","mn-to"].forEach(id=>document.getElementById(id).addEventListener("change", mnRender));
  document.getElementById("mn-cond-toggle").addEventListener("click", ()=>{
    mnCondOpen=!mnCondOpen;
    document.getElementById("mn-cond").hidden=!mnCondOpen;
    document.getElementById("mn-cond-toggle").setAttribute("aria-expanded", mnCondOpen);
    if(mnCondOpen) setTimeout(()=>document.getElementById("mn-q").focus(), 0);
  });
  document.querySelectorAll("#mn-view button").forEach(b=>b.addEventListener("click", ()=>{
    mnView=b.dataset.view;
    document.querySelectorAll("#mn-view button").forEach(x=>x.classList.toggle("on", x===b));
    mnRender();
  }));
  document.querySelectorAll("#mn-range button").forEach(b=>b.addEventListener("click", ()=>{
    mnRange=b.dataset.range;
    document.querySelectorAll("#mn-range button").forEach(x=>x.classList.toggle("on", x===b));
    document.getElementById("mn-custom").hidden = mnRange!=="custom";
    mnRender();
  }));
  // 상태 막대 — 「전체」 상태에서 하나를 누르면 그것만, 이미 고른 게 있으면 더하거나 뺀다. 「전체」는 모두.
  document.querySelectorAll("#mn-st button").forEach(b=>b.addEventListener("click", ()=>{
    const st=b.dataset.st;
    if(!st) mnStOn.clear();
    else if(mnStOn.has(st)) mnStOn.delete(st);
    else mnStOn.add(st);
    if(mnStOn.size===MN_STATES.length) mnStOn.clear();   // 다 고르면 곧 전체
    mnSyncStBar();
    mnRender();
  }));
  mnSyncStBar();
  mnLoad();
}
```

주의: 코드 안 `data-st` 버튼 클릭 핸들러가 `#mn-st button`을 대상으로 삼지만, 실제 상태 칩은 `<button class="${cls}" data-st="${key}">`로 렌더된다(label이 아니라 button) — CSS의 `.pl-st label` 규칙군은 이 화면이 아니라 **필사 신청 화면**의 것이고, `.mn-stbar button`이 실제로 쓰이는 규칙이다(2.9 CSS 절 참고, 발견 사항: 문서 안에 죽은 `.pl-st label` 룰이 혼재).

### 2.4 상태 막대 동기화 — `mnSyncStBar`

`admin-stats.html:4035-4041`

```js
function mnSyncStBar(){
  document.querySelectorAll("#mn-st button").forEach(b=>{
    const st=b.dataset.st;
    b.classList.toggle("on", st ? mnStOn.has(st) : mnStOn.size===0);
    b.setAttribute("aria-pressed", b.classList.contains("on"));
  });
}
```

### 2.5 신청일 범위 계산 — `mnRangeDates`

`admin-stats.html:4043-4050`

```js
function mnRangeDates(){
  const kst=d=>new Date(d.getTime()+9*3600*1000).toISOString().slice(0,10);
  const now=new Date();
  if(mnRange==="today"){ const t=kst(now); return [t,t]; }
  if(mnRange==="7d") return [kst(new Date(now.getTime()-6*86400*1000)), kst(now)];
  if(mnRange==="custom") return [document.getElementById("mn-from")?.value||"", document.getElementById("mn-to")?.value||""];
  return ["",""];
}
```

### 2.6 서버 조회 — `mnLoad`

`admin-stats.html:4052-4071`

```js
async function mnLoad(){
  const box=document.getElementById("mn-list"); if(!box) return;
  box.innerHTML=`<p class="msg">불러오는 중...</p>`;
  if(!mnLoaded){
    const d=await callApi({ action:"ministryList", pw:getPw(), staff:getStaff() }).catch(()=>({ok:false,error:"network"}));
    if(minAuthLost(d)) return;
    if(!d.ok){
      box.innerHTML=`<p class="msg err">명단을 불러오지 못했습니다: ${plEsc(d.error||"오류")}</p>`;
      return;
    }
    mnRows=(d.list||[]).map(x=>({
      id:x.id, at:(x.at||"").replace(/\./g,"-"), who:x.who||"", name:x.name||"",
      status:x.status, canPush:!!x.canPush, notified_at:x.notified_at||null,
      phone:x.phone||"", position:x.position||"", note:x.note||"", source:x.source||"app",
      committee:x.committee||"", team:x.team||"", option:x.option||"",
    }));
    mnLoaded=true;
  }
  mnRender();
}
```

`x.at`은 서버가 `.`로 구분한 KST 날짜(`kstDay().replace(/-/g,".")`)를 다시 `-`로 복원해서 저장 — 필터 비교(`mnFiltered`)가 `YYYY-MM-DD` 문자열 비교로 되게 하기 위함. **`mnLoaded`가 true인 동안은 "새로 불러오기"를 누르기 전까지 서버를 다시 안 부른다** — 다른 담당자가 동시에 바꾼 내용은 반영 안 됨(발견 사항, 여러 담당자 동시 편집 시 서로 옛 화면을 볼 수 있음).

### 2.7 필터링 — `mnFiltered`

`admin-stats.html:4073-4087`

```js
function mnFiltered(){
  const on=[...mnStOn];
  const q=(document.getElementById("mn-q")?.value||"").trim();
  const [f, t]=mnRangeDates();   // YYYY-MM-DD — r.at 도 같은 꼴(KST 날짜)
  return mnRows.filter(r=>{
    if(on.length && on.indexOf(r.status)<0) return false;   // 하나도 안 고르면 전체
    if(f && r.at < f) return false;
    if(t && r.at > t) return false;
    if(q){
      const hay=[r.name, r.who, r.position, r.team, r.committee].join(" ");
      if(hay.indexOf(q)<0) return false;
    }
    return true;
  });
}
```

검색은 대소문자·부분일치 단순 `indexOf`(정규화·자모분리 무관), 대상 필드는 `name·who·position·team·committee`(전화번호·메모는 검색 대상 아님).

### 2.8 렌더 — `mnRender`(카드 템플릿 `mnCard`는 이 함수 안 클로저)

`admin-stats.html:4089-4208`

```js
function mnRender(){
  const box=document.getElementById("mn-list"); if(!box) return;
  const rows=mnFiltered();
  // 칩 옆 숫자는 추리기 전 전체 기준 — 어디에 몇 건인지 늘 보이게
  MN_STATES.forEach(x=>{
    const el=document.querySelector(`[data-mncnt="${x}"]`);
    if(el) el.textContent=mnRows.filter(r=>r.status===x).length;
  });
  const allEl=document.querySelector("[data-mncnt-all]");
  if(allEl) allEl.textContent=mnRows.length;
  const dupOf=mnDupMap();
  // 조회 조건 요약 — 접혀 있어도 무엇이 걸렸는지 보인다(안 보이는 조건이 명단을 줄이면 헷갈린다)
  const condSum=document.getElementById("mn-cond-sum");
  if(condSum){
    const q=(document.getElementById("mn-q")?.value||"").trim();
    const [f,t]=mnRangeDates();
    // 이 토글 안에 남은 조건은 **신청일 하나**다(찾기는 위 칸, 상태는 위 막대) — 그것만 적는다
    const bits=[];
    if(mnRange==="today") bits.push("오늘");
    else if(mnRange==="7d") bits.push("최근 7일");
    else if(mnRange==="custom" && (f||t)) bits.push(`${(f||"").slice(5).replace("-",".")}~${(t||"").slice(5).replace("-",".")}`);
    condSum.textContent = bits.length ? bits.join(" · ") : "전체";
    condSum.classList.toggle("on", bits.length>0);
  }
  // 요약 숫자는 보기 단추 안에 — 지금 걸러진 것 기준(건·명·사역)
  const vc={ row:rows.length, person:new Set(rows.map(mnPersonKey)).size, team:new Set(rows.map(mnTeamKey)).size };
  document.querySelectorAll("[data-vcnt]").forEach(el=>{ el.textContent=vc[el.dataset.vcnt]; });

  // inView: 묶음 안 카드면 "person"·"team". 머리에 이미 적힌 것은 카드에서 뺀다(2026-09-18 성도님 —
  // 머리 목록과 펼친 카드가 같은 것을 두 번 보여 줘 구분이 안 됐다). 사람별 카드 = 사역·상태·신청일,
  // 사역별 카드 = 사람·번호·상태. ⚠️ rows.map(mnCard) 로 부르면 둘째 인자에 번호가 들어온다 — 화살표로 감쌀 것.
  const mnCard=(r, inView)=>{
    // 신청한 사역은 카드에서 가장 잘 보여야 한다(2026-09-17 성도님) — 이름 아래 굵게, 위원회는 작게
    const teams=`<div class="mn-team-main"><span class="mn-team-ico" aria-hidden="true">🤝</span><b>${plEsc(r.team)}</b>${
        r.option?`<i>(${plEsc(r.option)})</i>`:""}<span class="mn-team-com">${plEsc(r.committee)}</span></div>`;
    // 알림을 켰는지는 카드에서 뺐다(2026-09-17 성도님 요청 — 화면을 덜어 낸다).
    // 푸시가 안 가는 분이라는 안내는 임명확정 창(mnDialog)이 그 자리에서 한다.
    const dup = mnDupOthers(dupOf, r);
    const dupHtml = mnDupBadge(dup);
    const at = plEsc((r.at||"").replace(/-/g,"."));
    // 종이로 올린 건은 한눈에 — 앱 알림이 가지 않는 분일 수 있다(2026-09-18)
    const paper = r.source==="paper" ? `<em class="mn-paper" title="담당자가 올린 종이 명단">📋 종이</em>` : "";
    const nm = inView==="person"
      ? `<div class="mn-in-team"><b>${plEsc(r.team)}</b>${r.option?`<i>(${plEsc(r.option)})</i>`:""}</div>`+
        `<span class="mn-sub"><i>${plEsc(r.committee)}</i><span class="mn-date" title="신청일">${at} 신청</span></span>`
      : `<b>${plEsc(r.name)}</b>${r.position?`<em class="mn-pos">${plEsc(r.position)}</em>`:""}${paper}`+
        `<span class="mn-sub"><i>${plEsc(r.who)}</i>${inView==="team"&&r.option?`<i class="mn-in-opt">(${plEsc(r.option)})</i>`:""}<span class="mn-date" title="신청일">${at}</span></span>`;
    return `
      <div class="pl-card ${MN_CLS[r.status]}${inView?" mn-in":""}">
        <div class="pl-hd">
          <div class="pl-nm">
            ${nm}
          </div>
          <div class="pl-drop">
            <button type="button" class="pl-sel ${MN_CLS[r.status]}" data-mndrop="${r.id}"
              aria-haspopup="listbox" aria-expanded="false">${MN_SHORT[r.status]||r.status}</button>
            <div class="pl-menu" role="listbox">
              ${MN_STATES.map(x=>`
                <button type="button" class="pl-opt ${MN_CLS[x]}${x===r.status?" on":""}"
                  data-mnid="${r.id}" data-mnst="${x}" role="option">${MN_SHORT[x]||x}</button>`).join("")}
              <!-- ⚠️ 삭제는 상태가 아니라 **하는 일**이다(되돌릴 수 없다) — 줄을 긋고 붉은 꼴로 떼어 둔다 -->
              <button type="button" class="pl-opt pl-del" data-mnid="${r.id}" data-mndel="${r.id}"
                role="option">🗑 삭제</button>
            </div>
          </div>
        </div>
        ${inView?"":teams}
        ${inView==="person"?"":`<div class="mn-contact">
          ${mnPhoneHtml(r.phone)}
          ${dupHtml?`<span class="mn-dups">${dupHtml}</span>`:""}
        </div>`}
        ${r.note?`<div class="mn-note">📝 ${plEsc(r.note)} <i>(관리자만 봄)</i></div>`:""}
      </div>`;
  };
  if(!rows.length){ box.innerHTML=`<p class="msg">조건에 맞는 신청이 없습니다.</p>`; }
  else if(mnView==="row") box.innerHTML=rows.map(r=>mnCard(r)).join("");
  else box.innerHTML=mnGroupsHtml(rows, mnCard);
  mnBindGroups(box);

  // 팀별 신청 수 — 담당자가 가장 먼저 궁금해하는 숫자
  // ⚠️ **지금 걸러진 목록(rows)** 으로 센다(2026-09-18). 서버의 d.counts 는 취소까지 넣은 전체라,
  //    「접수」만 켜 두면 목록은 4건인데 팀 숫자는 합이 6으로 어긋났다.
  const tbox=document.getElementById("mn-teams");
  if(tbox){
    const cnt={};
    rows.forEach(r=>{ const k=mnTeamKey(r); cnt[k]=(cnt[k]||0)+1; });
    const list=Object.entries(cnt).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],"ko"));
    tbox.innerHTML=list.length
      ? `<div class="mn-teams-t">팀별 신청 수 <i>${rows.length}건</i></div>` +
        list.map(([k,n])=>`<span class="mn-tcount">${plEsc(k)} <b>${n}</b>건</span>`).join("")
      : "";
    // 사역별 보기에서도 보인다(2026-09-18 성도님) — 묶음 머리에도 숫자가 있지만, 보기마다 아래 통계가 있다 없다 하면 헷갈린다
  }

  box.querySelectorAll("[data-mndrop]").forEach(b=>{
    b.addEventListener("click", e=>{
      e.stopPropagation();
      const wrap=b.parentElement, was=wrap.classList.contains("open");
      plCloseMenus();
      if(!was){
        // 메뉴 높이 ≈ 4×44+12 = 188px — 아래가 모자라면 위로 연다(표준 v1 ⑨)
        // 메뉴 높이 = 44×4 + 여백 12 + 취소 구분선 6 + 테두리 ≈ 195px, top 이 +6px 이라 201px 필요
        wrap.classList.toggle("up", b.getBoundingClientRect().bottom + 210 > innerHeight);
        wrap.classList.add("open"); b.setAttribute("aria-expanded","true");
      }
    });
  });
  box.querySelectorAll("[data-mnst][data-mnid]").forEach(o=>{
    o.addEventListener("click", e=>{
      e.stopPropagation(); plCloseMenus();
      mnSetStatus(Number(o.dataset.mnid), o.dataset.mnst);
    });
  });
  box.querySelectorAll("[data-mndel]").forEach(o=>{
    o.addEventListener("click", e=>{
      e.stopPropagation(); plCloseMenus();
      mnDeleteOne(Number(o.dataset.mndel));
    });
  });
}
```

`mnCard`는 **독립 함수가 아니라 `mnRender` 내부의 화살표 함수 클로저**다(전역에 `function mnCard`는 없음) — 이식 시 이 사실이 중요: 이 함수는 `dupOf`(위에서 계산한 `mnDupMap()` 결과)를 클로저로 캡처한다.

### 2.9 삭제(2단계 확인) — `mnDeleteOne`

`admin-stats.html:4210-4240`

```js
// 신청 한 건을 아주 지운다(2026-09-26 성도님 — 「완전히 잘못 들어온 것은 남기지 않는다」).
// ⚠️ **되돌릴 수 없다.** 그래서 ① 무엇을 지우는지 이름·사역·상태를 보여 주고 ② 한 번 더 묻는다.
// ⚠️ 「취소」와 다르다 — 취소는 자취가 남고 성도님 화면에도 보이지만, 지우면 그 줄이 통째로 사라지고
//    3개 상한의 자리도 도로 비어 성도님이 다시 신청하실 수 있게 된다. 창에 그 말을 적는다.
async function mnDeleteOne(id){
  const r=mnRows.find(x=>x.id===id); if(!r) return;
  const 무엇 = `<b>${plEsc(r.name)}</b>님의 <b>«${plEsc(r.team)}»</b> 신청` +
    `<br><span style="color:#6b778c">${plEsc(r.who||"")} · ${plEsc(r.committee||"")} · 지금 ` +
    `${plEsc(MN_SHORT[r.status]||r.status)}</span>`;
  if(!(await mnDialog({ icon:"🗑", title:"이 신청을 지울까요?", tone:"danger",
    ok:"지웁니다", cancel:"그만두기", html:
      `${무엇}<br><br>잘못 들어온 신청을 <b>아주 지웁니다.</b>`,
    note:"되돌릴 수 없어요. 결정을 남겨 두려면 「취소」를 쓰세요 — 취소는 자취가 남습니다.",
    noteTone:"off" }))) return;
  // ⚠️ 한 번 더 묻는다(성도님 요구) — 첫 창은 무엇인지 보는 자리, 둘째 창은 정말인지 답하는 자리다
  if(!(await mnDialog({ icon:"⚠️", title:"정말 지웁니다", tone:"danger",
    ok:"네, 지웁니다", cancel:"아니요",
    html:`마지막 확인이에요.<br>${무엇}<br><br>이 줄은 성도님 화면에서도 사라집니다.` }))) return;

  const d=await callApi({ action:"ministryDelete", pw:getPw(), staff:getStaff(), id })
    .catch(()=>({ok:false,error:"network"}));
  if(!d.ok){
    if(minAuthLost(d)) return;
    mnDialog({ icon:"⚠️", title:"지우지 못했습니다", tone:"danger", ok:"확인", cancel:null,
      html: plEsc(d.error||"오류") });
    return;
  }
  mnRows = mnRows.filter(x=>x.id!==id);       // 화면에서도 그 자리에서 뺀다
  mnRender();
  mnNote(`🗑 ${r.name}님의 ${r.team} 신청을 지웠습니다`);
}
```

변수명 `무엇`이 한글 식별자로 실제 코드에 그대로 쓰였다(오타 아님 — verbatim).

### 2.10 상태 변경 — `mnSetStatus`(임명확정 확인창 + 취소 사유창 + 결과 안내)

`admin-stats.html:4242-4286`

```js
async function mnSetStatus(id, status){
  const r=mnRows.find(x=>x.id===id); if(!r) return;
  // 확정은 성도님께 알림이 나가는 자리 — 한 번 묻는다(되돌려도 알림은 이미 갔다)
  if(status==="임명확정" && !r.notified_at && !(await mnDialog({
    icon:"🎉", title:"임명", tone:"ok", ok:"임명", cancel:"그만두기",
    html:`<b>${plEsc(r.name)}</b>님을 <b>«${plEsc(r.team)}»</b> 사역에<br><b>임명</b>합니다.`,
    note: r.canPush
      ? "🔔 앱 알림을 켜 두신 분이라 <b>알림이 한 번 나갑니다.</b><br>되돌려도 이미 나간 알림은 취소되지 않아요."
      : "🔕 앱 알림을 켜지 않으신 분이라 <b>알림이 가지 않아요.</b><br>게시판이나 연락으로 알려 주세요.",
    noteTone: r.canPush ? "on" : "off",
  }))) return;
  // ⚠️ 취소는 **부서장에게 오프라인으로 요청받아** 하는 일이다. 왜 취소했는지 적어 두지
  //    않으면 나중에 아무도 모른다 — 사유 없이는 보내지 않는다(성도님 결정 2026-09-10).
  let note;
  if(status==="취소"){
    note=await mnAskCancelReason(r);
    if(note===null) return;                  // 그만둠 — 사유 없이는 보내지 않는다(창이 막는다)
  }
  const before=r.status;
  r.status=status; mnRender();                 // 먼저 반영하고, 실패하면 되돌린다
  const d=await callApi({ action:"ministrySetStatus", pw:getPw(), staff:getStaff(), id, status,
    ...(note!==undefined?{note}:{}) })
    .catch(()=>({ok:false,error:"network"}));
  if(!d.ok){
    r.status=before;
    if(minAuthLost(d)) return;
    mnRender();
    mnDialog({ icon:"⚠️", title:"상태를 바꾸지 못했습니다", tone:"danger", ok:"확인", cancel:null,
      html: plEsc(d.error||"오류") });
    return;
  }
  // 결정이 나면 서버가 번호를 지운다 — 카드도 그 자리에서 지워야 사실과 맞다
  if(d.phoneCleared){ r.phone=""; mnRender(); }
  if(note!==undefined){ r.note=note; mnRender(); }
  if(status==="임명확정"){
    // 서버가 «보냄 / 이미 보냄 / 안 켜심 / 실패» 넷을 구분해 준다. 뭉뚱그리지 않는다.
    // ⚠️ 「이미 보냄」을 「안 켜심」으로 적으면, 알림이 간 분께 담당자가 또 연락한다.
    if(d.already)   mnNote(`✅ ${r.name}님께는 이미 알림이 나갔습니다 (한 해 한 번)`);
    else if(d.pushed>0){ r.notified_at=new Date().toISOString(); mnRender();
                    mnNote(`📨 ${r.name}님께 알림을 보냈습니다 (기기 ${d.pushed}대)`); }
    else if(!d.pushError || d.pushError==="not-subscribed")
                    mnNote(`📋 ${r.name}님은 앱 알림을 켜지 않으셨어요 — 게시판·주보로 알려 주세요`);
    else            mnNote(`⚠️ 알림 발송 실패 — 게시로 알려 주세요. (${d.pushError})`);
  }
}
```

**낙관적 갱신(optimistic update)** 패턴: 서버 호출 전에 `r.status=status; mnRender()`로 화면을 먼저 바꾸고, 실패하면 `r.status=before`로 되돌린 뒤 다시 그린다. 임명확정 확인창은 `!r.notified_at`일 때만 뜬다 — **이미 그 사람에게 알림이 나간 적 있으면(재확정) 확인창 없이 바로 진행**한다(발견 사항: 되돌렸다 다시 확정하는 경우 확인 절차가 생략됨).

### 2.11 공용 확인/알림 창 — `mnDialog`

`admin-stats.html:4293-4321`

```js
function mnDialog(o){
  o=o||{};
  const tone=o.tone||"primary", hasCancel=o.cancel!==null;
  return new Promise(resolve=>{
    const wrap=document.createElement("div");
    wrap.className="mn-modal";
    wrap.innerHTML=`<div class="mn-modal-box mn-dialog" role="${hasCancel?"dialog":"alertdialog"}" aria-modal="true">
      ${o.icon?`<div class="mn-modal-ico" aria-hidden="true">${o.icon}</div>`:""}
      <h3 class="t-${tone}">${o.title||""}</h3>
      ${o.html?`<div class="mn-modal-body">${o.html}</div>`:""}
      ${o.note?`<div class="mn-modal-note ${o.noteTone||""}">${o.note}</div>`:""}
      <div class="mn-modal-foot">
        ${hasCancel?`<button type="button" class="no" data-no>${o.cancel||"그만두기"}</button>`:""}
        <button type="button" class="yes ${tone}" data-yes>${o.ok||"확인"}</button>
      </div>
    </div>`;
    document.body.appendChild(wrap);
    const done=v=>{ document.removeEventListener("keydown", onKey); wrap.remove(); resolve(v); };
    const onKey=e=>{ if(e.key==="Escape") done(!hasCancel); };
    wrap.querySelector("[data-yes]").addEventListener("click", ()=>done(true));
    if(hasCancel) wrap.querySelector("[data-no]").addEventListener("click", ()=>done(false));
    // 누르기와 떼기가 모두 바깥일 때만 닫는다
    let downOut=false;
    wrap.addEventListener("mousedown", e=>{ downOut = e.target===wrap; });
    wrap.addEventListener("click", e=>{ if(downOut && e.target===wrap) done(!hasCancel); downOut=false; });
    document.addEventListener("keydown", onKey);
    setTimeout(()=>wrap.querySelector(hasCancel?"[data-no]":"[data-yes]").focus(), 0);
  });
}
```

`Promise<boolean>` 반환. `cancel:null`이면 버튼 하나짜리 알림 창이 되고 어떻게 닫아도(Escape·바깥 클릭·확인 버튼) `true`를 반환한다.

### 2.12 취소 사유 창 — `mnAskCancelReason`

`admin-stats.html:4326-4361`

```js
// ---------- 취소 사유 창 ----------
// ⚠️ 사유 없이는 「취소」 단추가 눌리지 않는다 — 서버도 사유 없는 취소를 거절한다(ministrySetStatus).
// 사유는 관리자·담당자만 본다. 자주 쓰는 사유는 눌러서 채우고 고쳐 쓸 수 있다.
function mnAskCancelReason(r){
  return new Promise(resolve=>{
    const presets=["중복 신청 (다른 소속으로 한 번 더 내심)","본인 요청","부서장 요청","신청 자격 확인 필요"];
    const wrap=document.createElement("div");
    wrap.className="mn-modal";
    wrap.innerHTML=`<div class="mn-modal-box" role="dialog" aria-modal="true" aria-labelledby="mn-cx-t">
      <h3 id="mn-cx-t">신청 취소</h3>
      <p><b>${plEsc(r.name)}</b>님의 <b>«${plEsc(r.team)}»</b> 신청을 취소합니다.<br>
        취소하면 휴대폰 번호가 지워지고 되돌릴 수 없습니다.</p>
      <div class="mn-modal-presets">${presets.map(x=>`<button type="button" data-preset="${plEsc(x)}">${plEsc(x)}</button>`).join("")}</div>
      <textarea class="push-in" id="mn-cx-note" placeholder="취소 사유 (예: 찬양부장 요청 — 같은 시간 다른 사역과 겹침)"></textarea>
      <div class="mn-modal-hint">관리자·담당자만 봅니다 — 성도님께는 보이지 않습니다.</div>
      <div class="mn-modal-foot">
        <button type="button" class="no" data-no>그만두기</button>
        <button type="button" class="yes" data-yes disabled>취소하기</button>
      </div>
    </div>`;
    document.body.appendChild(wrap);
    const ta=wrap.querySelector("#mn-cx-note"), yes=wrap.querySelector("[data-yes]");
    const sync=()=>{ yes.disabled=!ta.value.trim(); };
    const done=v=>{ document.removeEventListener("keydown", onKey); wrap.remove(); resolve(v); };
    const onKey=e=>{ if(e.key==="Escape") done(null); };
    ta.addEventListener("input", sync);
    wrap.querySelectorAll("[data-preset]").forEach(b=>b.addEventListener("click", ()=>{
      ta.value=b.getAttribute("data-preset"); sync(); ta.focus();
    }));
    wrap.querySelector("[data-no]").addEventListener("click", ()=>done(null));
    yes.addEventListener("click", ()=>{ const v=ta.value.trim(); if(v) done(v); });
    // ⚠️ 누르기와 떼기가 **둘 다** 바깥일 때만 닫는다 — 사유를 끌어 선택하다 밖에서 떼면 닫혀 글이 사라졌다
    let downOut=false;
    wrap.addEventListener("mousedown", e=>{ downOut = e.target===wrap; });
    wrap.addEventListener("click", e=>{ if(downOut && e.target===wrap) done(null); downOut=false; });
    document.addEventListener("keydown", onKey);
    // ⚠️ 자동 초점을 두지 않는다(표준 v1 ⑯) — 키보드가 올라와 미리 만든 사유 단추를 덮는다.
  });
}
```

`Promise<string|null>` 반환(`null`=그만둠). 4개 프리셋 문구 고정.

### 2.13 중복 전화번호 탐지·묶음·전화 링크·토스트

`admin-stats.html:4365-4502`

```js
// ---------- 사역신청 현황 — 사람별 · 사역별 묶음 ----------
// ⚠️ 카드는 건별과 **같은 것**(mnCard)을 묶음 안에 넣는다 — 상태 바꾸기가 어느 보기에서나 그대로 된다.
function mnPersonKey(r){ return (r.name||"")+"/"+(r.who||""); }
// 같은 휴대폰 번호 → 그 번호로 신청한 사람(이름/소속)들. 번호는 결정이 나면 지워지므로 남은 것끼리만 본다.
// ⚠️ 명단 **전체**(mnRows)로 센다 — 필터로 한쪽이 가려져도 중복 표시는 그대로여야 한다.
function mnDupMap(){
  const m=new Map();
  mnRows.forEach(r=>{
    const d=String(r.phone||"").replace(/[^0-9]/g,"");
    if(!d) return;
    if(!m.has(d)) m.set(d, new Map());
    m.get(d).set(mnPersonKey(r), { name:r.name||"", who:r.who||"" });
  });
  return m;
}
// 이 신청(들)과 같은 번호를 쓰는 **다른 사람**들 — 이름이 같으면 「다른 소속」, 다르면 「다른 신청자」(가족 등)
// rows 는 한 건이어도, 사람별 묶음 전체여도 된다(묶음 중 어느 신청이든 번호가 남아 있으면 잡는다).
function mnDupOthers(m, rows){
  const list=Array.isArray(rows)?rows:[rows];
  const me=new Set(list.map(mnPersonKey));
  const seen=new Map();
  list.forEach(r=>{
    const d=String(r.phone||"").replace(/[^0-9]/g,"");
    const people=d && m.get(d);
    if(!people) return;
    people.forEach((p,k)=>{ if(!me.has(k)) seen.set(k,p); });
  });
  const name=(list[0]||{}).name||"";
  return [...seen.values()].map(p=> p.name===name
    ? { kind:"소속", label:p.who||"소속 없음", name:p.name, who:p.who }
    : { kind:"사람", label:(p.name||"이름 없음")+(p.who?" · "+p.who:""), name:p.name, who:p.who });
}
// ⚠️ **한 줄에 들어가게 짧게**(2026-09-17 성도님 요청 — 전화번호 옆에서 두세 줄로 꺾였다).
//    전체 설명은 title(길게 누르기·마우스 올리기)에 둔다. 여럿이면 「외 N」.
function mnDupBadge(dup){
  if(!dup.length) return "";
  const same=dup.filter(x=>x.kind==="소속");
  const other=dup.filter(x=>x.kind==="사람");
  const more=n=>n>1?` 외 ${n-1}`:"";
  return [
    same.length ? `<span class="mn-dup" title="같은 이름·번호로 다른 소속(${plEsc(same.map(x=>x.label).join(", "))})에서도 신청 — 다른 교구·목장으로 로그인해 한 번 더 내셨을 수 있습니다">⚠️ ${plEsc(String(same[0].label).replace(/목장$/,""))}${more(same.length)}</span>` : "",
    other.length ? `<span class="mn-dup other" title="같은 번호로 다른 분(${plEsc(other.map(x=>x.label).join(", "))})도 신청 — 가족 등 번호를 함께 쓰는 분일 수 있습니다">☎️ 번호 같음 · ${plEsc(other[0].name||"이름 없음")}${more(other.length)}</span>` : "",
  ].join("");
}
function mnTeamKey(r){ return (r.committee||"")+" · "+(r.team||""); }
function mnStatusChips(list){
  return MN_STATES.map(st=>{
    const n=list.filter(r=>r.status===st).length;
    return n?`<span class="pl-chip ${MN_CLS[st]}">${MN_SHORT[st]||st} ${n}</span>`:"";
  }).join("");
}
// 묶음 머리의 줄 목록 — 접어 둔 채로도 사람별은 신청한 사역을, 사역별은 신청한 사람을 **상태와 함께** 모두 본다
// (2026-09-17 성도님). 줄은 상태 순서(신청→접수→임명→취소)로, 오른쪽에 상태를 글자로 붙인다.
// main·sub 는 글자 그대로 받아 여기서 plEsc 한다.
function mnRowsHtml(list, mainOf, subOf, extraOf){
  const order=st=>{ const i=MN_STATES.indexOf(st); return i<0 ? 99 : i; };
  const sorted=[...list].sort((a,b)=>order(a.status)-order(b.status) || String(mainOf(a)).localeCompare(String(mainOf(b)),"ko"));
  return `<span class="mn-grp-rows">${sorted.map(r=>{
    const cls=MN_CLS[r.status]||"";
    const ex=extraOf ? extraOf(r) : "";      // 사역별: 둘째 줄에 전화번호 · 중복 정보(HTML)
    return `<span class="mn-rowi ${cls}"><span class="mn-rowi-top"><span class="mn-rowi-t"><b>${plEsc(mainOf(r))}</b><small>${plEsc(subOf(r))}</small></span>`+
      `<span class="mn-rowi-st ${cls}">${plEsc(MN_SHORT[r.status]||r.status)}</span></span>`+
      (ex ? `<span class="mn-rowi-ex mn-phone-line">${ex}</span>` : "")+`</span>`;
  }).join("")}</span>`;
}
// 전화번호 — 누르면 전화로 연결(tel:). 번호가 지워졌으면(결정 뒤) 안내만. small=true 는 줄 목록용 작은 꼴.
// ⚠️ 묶음 머리(summary) 안에서 눌러도 묶음이 열고 닫히지 않게 mnBindGroups 가 막는다.
function mnPhoneHtml(phone, small){
  const digits=String(phone||"").replace(/[^0-9]/g,"");
  if(!digits) return small ? "" : `<span class="mn-p4 none">번호 없음 · 결정 후 삭제</span>`;
  return `<a class="mn-p4 mn-tel${small?" sm":""}" href="tel:${digits}" title="전화 걸기">📞 <b>${plEsc(phone)}</b></a>`;
}
function mnGroupsHtml(rows, card){
  const by=new Map();
  const keyOf = mnView==="person" ? mnPersonKey : mnTeamKey;
  const dupAll = mnDupMap();          // 한 번만 만든다(묶음마다 만들지 않게)
  rows.forEach(r=>{ const k=keyOf(r); if(!by.has(k)) by.set(k, []); by.get(k).push(r); });
  let groups=[...by.entries()];
  if(mnView==="person") groups.sort((a,b)=>a[0].localeCompare(b[0],"ko"));
  else groups.sort((a,b)=>b[1].length-a[1].length || a[0].localeCompare(b[0],"ko"));   // 신청 많은 사역부터
  const tools=`<div class="mn-grp-tools"><button type="button" data-mnall="open">모두 펼치기</button>`+
    `<button type="button" data-mnall="close">모두 접기</button></div>`;
  return tools + groups.map(([k, list])=>{
    const r0=list[0];
    const gk=mnView+"|"+k;
    let title;
    if(mnView==="person"){
      const pos=list.map(r=>r.position).find(Boolean)||"";
      const phone=list.map(r=>r.phone).find(Boolean)||"";
      const teams=new Set(list.map(mnTeamKey)).size;
      const dup=mnDupOthers(dupAll, list);
      title=`<span class="mn-grp-t">${plEsc(r0.name)}${pos?` <em>${plEsc(pos)}</em>`:""}<i>${plEsc(r0.who)}</i></span>
        <span class="mn-grp-n">${teams}개 사역</span>
        ${(phone||dup.length)?`<span class="mn-grp-sub mn-phone-line">${phone?mnPhoneHtml(phone):""}${mnDupBadge(dup)}</span>`:""}
        ${mnRowsHtml(list, r=>r.team, r=>r.committee)}`;
    } else {
      const people=new Set(list.map(mnPersonKey)).size;
      title=`<span class="mn-grp-t"><em>${plEsc(r0.committee)}</em>${plEsc(r0.team)}</span>
        <span class="mn-grp-n">${list.length}건 · ${people}명</span>
        ${mnRowsHtml(list, r=>r.name, r=>r.who, r=>{
          const dup=mnDupOthers(dupAll, r);
          return (r.phone||dup.length) ? mnPhoneHtml(r.phone, true)+mnDupBadge(dup) : "";
        })}`;
    }
    return `<details class="mn-grp" data-mngk="${plEsc(gk)}"${mnOpen.has(gk)?" open":""}>
      <summary>${title}</summary>
      <div class="mn-grp-body">${list.map(r=>card(r, mnView)).join("")}</div>
    </details>`;
  }).join("");
}
function mnBindGroups(box){
  box.querySelectorAll("summary .mn-tel").forEach(a=>a.addEventListener("click", e=>{
    // 전화는 걸고, 묶음은 그대로 — summary 의 열고 닫기만 막는다(링크 이동은 막지 않는다)
    e.stopPropagation();
    const d=a.closest("details"); if(!d) return;
    const was=d.open; setTimeout(()=>{ if(d.open!==was) d.open=was; }, 0);
  }));
  box.querySelectorAll("details.mn-grp").forEach(d=>d.addEventListener("toggle", ()=>{
    const k=d.getAttribute("data-mngk");
    if(d.open) mnOpen.add(k); else mnOpen.delete(k);
  }));
  box.querySelectorAll("[data-mnall]").forEach(b=>b.addEventListener("click", ()=>{
    const open=b.dataset.mnall==="open";
    box.querySelectorAll("details.mn-grp").forEach(d=>{ d.open=open; });
  }));
}

// 명단 위에 잠깐 뜨는 안내 한 줄
// 결과 안내는 여섯 화면이 **같은 자리·같은 꼴**(표준 v1 ⑰) — 화면 아래 토스트 하나.
// ⚠️ 그전에는 #mn-sum 안에 붙여, 그 칸이 없는 화면(사역팀 정보·담당자)에서는 **아무것도 안 떴다**.
// ⚠️ 놓치면 안 되는 것(연락 필요·되돌릴 수 없는 것)은 토스트가 아니라 mnDialog 로 남긴다.
function mnNote(msg, tone){
  let el=document.getElementById("adm-toast");
  if(!el){ el=document.createElement("div"); el.id="adm-toast"; el.className="adm-toast";
           el.setAttribute("role","status"); document.body.appendChild(el); }
  el.className="adm-toast" + (tone==="warn" ? " warn" : "");
  el.textContent=msg;
  clearTimeout(mnNote._t);
  mnNote._t=setTimeout(()=>{ el.remove(); }, 4000);
}
```

⚠️ **발견 사항 — `mnStatusChips`는 죽은 코드다.** 함수는 정의돼 있지만(`4408-4413`) 화면 어디서도 호출되지 않는다(전체 파일 검색 결과 정의 1회뿐). 노트(`ministry-admin-ui.md`)의 "처음엔 칩으로 늘어놨다가 여러 줄로 엉켜 줄 목록(`mnRowsHtml`)으로 바꿨다"는 기록과 일치 — 리팩터 후 남은 잔재이며 이식 대상이 아니다.

정렬 규칙 요약:
- **건별(row)**: 서버가 준 순서 그대로(`created_at desc`) — 화면에서 재정렬 안 함.
- **사람별(person) 묶음 순서**: `mnPersonKey`(이름/소속) 가나다순.
- **사역별(team) 묶음 순서**: 신청 건수 많은 순, 동률이면 가나다순.
- **묶음 안 줄 목록(`mnRowsHtml`)**: 상태 순서(`신청완료→접수완료→임명확정→취소`), 동률이면 `mainOf`(사람별은 팀명, 사역별은 이름) 가나다순.
- **팀별 신청 수 패널**: 건수 많은 순, 동률 가나다순.

### 2.14 CSV/내보내기

**신청 현황 화면에는 CSV·엑셀 내려받기 기능이 없다.** (`downloadCsv`/`attachCsvButton`은 통계 리포트 탭에, `maplCsv`는 별도 화면인 🎉 임명현황(`admin-stats.html:3702-3731`, `maplCsvRows`/`maplCsv`)에만 있다 — 범위 밖.)

---

### 2.15 CSS — `.mn-*` · `.pl-*`(신청 현황이 실제로 쓰는 규칙, verbatim)

`admin-stats.html:307-401`(필사 카드 부품 공유 + 사역신청 카드 전용 부분 — 사이에 섞인 `.mc-*`(사역팀 정보 화면 전용)는 범위 밖이지만 같은 연속 블록이라 줄 번호 보존을 위해 함께 표기):

```css
/* ── 성경필사 노트 신청 관리 ── */
.pl-st{display:flex;flex-wrap:nowrap;gap:5px;margin-top:12px;
  overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
.pl-st::-webkit-scrollbar{display:none;}
.pl-st label{display:inline-flex;align-items:center;gap:5px;cursor:pointer;user-select:none;
  flex:none;white-space:nowrap;
  font-size:12px;font-weight:700;border-radius:999px;padding:5px 11px 5px 8px;
  border:1.5px solid #dde3ee;background:#fff;color:#8a95a8;}
.pl-st label input{margin:0;accent-color:#1a3a6b;width:13px;height:13px;flex:none;}
.pl-st label em{font-style:normal;font-size:11px;opacity:.7;}
.pl-st label.on.s1{background:#eef3fb;border-color:#a9c3e8;color:#1a3a6b;}
.pl-st label.on.s2{background:#fdf6e3;border-color:#e6cf94;color:#7a5f16;}
.pl-st label.on.s3{background:#eaf6ee;border-color:#a9d8bb;color:#1f5c3a;}
.pl-st label.on.s4{background:#f4f6fa;border-color:#c3cad6;color:#5a6273;}
.pl-find{display:grid;grid-template-columns:1fr auto;gap:8px;margin:12px 0 10px;}
.pl-find .push-in{min-width:0;}
.pl-find #pl-q{grid-column:1/2;grid-row:1;}
.pl-find #pl-search, .pl-find #mn-search{grid-column:2/3;grid-row:1;}
.pl-find #mn-q{grid-column:1/2;grid-row:1;}
.pl-dates{grid-column:1/3;grid-row:2;display:flex;align-items:center;gap:6px;}
.pl-dates .push-in{flex:1 1 0;min-width:0;font-size:13px;padding:8px 10px;}
.pl-sep{color:#8a95a8;font-weight:700;flex:none;}
.pl-sum{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;
  padding:10px 12px;background:#f2f5fb;border:1px solid #dde3ee;border-radius:10px;margin-bottom:10px;}
.pl-total{font-size:14px;color:#1a3a6b;}
.pl-total b{font-size:16px;}
.pl-chips{display:flex;flex-wrap:wrap;gap:5px;}
.pl-chip{font-size:11px;font-weight:700;border-radius:999px;padding:3px 9px;border:1px solid;}
.pl-chip.s1{background:#eef3fb;border-color:#a9c3e8;color:#1a3a6b;}
.pl-chip.s2{background:#fdf6e3;border-color:#e6cf94;color:#7a5f16;}
.pl-chip.s3{background:#eaf6ee;border-color:#a9d8bb;color:#1f5c3a;}
.pl-chip.s4{background:#f4f6fa;border-color:#dde3ee;color:#5a6273;}
.pl-note{margin-top:8px;padding:9px 12px;border-radius:9px;background:#eef3fb;
  border:1px solid #a9c3e8;color:#1a3a6b;font-size:13px;font-weight:600;line-height:1.5;word-break:keep-all;}

/* 신청 한 건 = 카드 하나 */
.pl-card{border:1px solid #dde3ee;border-radius:12px;background:#fff;padding:12px 14px;margin-bottom:10px;}
.pl-card.s1{border-left:4px solid #6f9be0;}
.pl-card.s2{border-left:4px solid #d9b45c;}
.pl-card.s3{border-left:4px solid #5aab7c;}
.pl-card.s4{border-left:4px solid #c3cad6;}
/* 사역신청 — 필사 카드 부품을 그대로 쓰고, 팀 목록과 알림 여부만 더한다 */
.mn-teams-in{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
/* 카드의 신청 사역 — 이름 아래 굵게 */
.mn-team-main{display:flex;align-items:baseline;flex-wrap:wrap;gap:2px 6px;margin:9px 0 2px;padding:7px 10px;
  background:#f3f6fb;border-left:3px solid #1a3a6b;border-radius:8px;}
.mn-team-ico{font-size:14px;align-self:center;}
.mn-team-main b{font-size:16px;font-weight:800;color:#1a3a6b;}
.mn-team-main i{font-style:normal;font-size:12.5px;color:#41506b;}
.mn-team-com{font-size:12px;color:#7a869c;}
/* 묶음 머리의 사역·사람 칩 — 색은 상태 막대와 같게 */
/* 묶음 머리의 줄 목록 — 사람별은 사역, 사역별은 사람. 줄마다 오른쪽에 상태를 글자로(색만으로 짐작하지 않게) */
.mn-grp-rows{flex-basis:100%;display:flex;flex-direction:column;margin:2px 0 0 18px;background:#fff;
  border:1px solid #e3e8f1;border-radius:10px;overflow:hidden;}
.mn-rowi{display:flex;flex-direction:column;gap:4px;padding:7px 10px;border-top:1px solid #eef1f6;}
.mn-rowi-top{display:flex;align-items:center;gap:8px;}
.mn-rowi-ex{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
.mn-rowi-ex .mn-dup{font-size:11px;padding:2px 8px;}
.mn-rowi:first-child{border-top:none;}
.mn-rowi-t{flex:1;min-width:0;display:flex;align-items:baseline;gap:6px;white-space:nowrap;overflow:hidden;}
.mn-rowi-t b{font-size:14px;font-weight:800;color:#1a3a6b;overflow:hidden;text-overflow:ellipsis;}
.mn-rowi-t small{font-size:11.5px;color:#8a95a8;flex:none;}
.mn-rowi-st{flex:none;font-size:11.5px;font-weight:800;border-radius:999px;padding:2px 9px;background:#eef3fb;color:#1a3a6b;}
.mn-rowi-st.s2{background:#fdf6e3;color:#7a5f16;}
.mn-rowi-st.s3{background:#eaf6ee;color:#1f5c3a;}
.mn-rowi-st.s4{background:#f1f3f7;color:#8a95a8;}
.mn-rowi.s4 .mn-rowi-t{opacity:.55;}
.mn-team{font-size:13px;background:#f3f6fb;border:1px solid #e2e8f4;border-radius:8px;padding:5px 9px;color:#2c3a52;}
.mn-team em{font-style:normal;color:#7a869c;font-size:11.5px;margin-right:3px;}
.mn-team i{font-style:normal;color:#8a95a8;font-size:11.5px;}
/* 사역팀 정보 편집 — 관리자만 쓰는 화면이라 넉넉하게 */
.mc-help{font-size:13px;color:#5b6472;line-height:1.7;margin:0 0 12px;}
.mn-note{font-size:12px;color:#7a5f1e;background:#fbf1d8;border-radius:8px;padding:6px 9px;margin-top:6px;line-height:1.5}
.mn-note i{color:#a08a4a;font-style:normal}
.mn-paper{font-style:normal;font-size:11px;font-weight:800;color:#41506b;background:#eef1f8;
  border:1px solid #dde3ee;border-radius:999px;padding:1px 7px;margin-left:5px;white-space:nowrap;}
.mn-pos{font-style:normal;font-size:.78rem;font-weight:700;color:#8a6a1e;
  background:#fbf1d8;border-radius:999px;padding:1px 8px;margin-left:6px}
```

⚠️ **발견 사항 — `.pl-st label.*` 규칙(308-320)은 신청 현황에서 실제로 렌더되는 마크업(`<button data-st>`)과 맞지 않는다.** 상태 막대는 `.mn-stbar button`(아래 580-590) 규칙이 실제로 적용되는 것이고, `.pl-st label`은 필사 신청 화면(체크박스 다중 필터)의 것이다 — 사역신청 현황과는 무관, 이식 시 가져올 필요 없음.

`admin-stats.html:490-606`(전화·중복 배지·모달·상태 막대·보기 탭·신청일 범위, 사이의 `.mc-save`는 사역팀 정보용, `.mapl-g/.mapl-h`는 임명현황용 — 범위 밖이지만 줄 번호 보존을 위해 표기):

```css
.mc-msg{font-size:12.5px;color:#2c5f2d;font-weight:600;margin:0 0 8px;}
.mc-save{align-self:flex-end;font:inherit;font-size:12.5px;font-weight:700;padding:7px 16px;
  border:1px solid #1a3a6b;border-radius:8px;background:#1a3a6b;color:#fff;cursor:pointer;}
.mc-save.ok{background:#2c5f2d;border-color:#2c5f2d;}
.mn-p4{font-size:12px;font-weight:700;color:#41506b;background:#eef1f8;border-radius:7px;padding:3px 8px;}
.mn-p4 b{letter-spacing:.08em;color:#1a3a6b;}
.mn-p4.none{color:#a0a9b8;background:#f5f6f8;font-weight:600;}
/* 사역신청 현황 카드 — 전화·알림은 상태 단추 기둥 아래로 빼 카드 전체 폭을 쓴다(두 줄로 꺾이던 것) */
/* 전화번호 오른쪽에 중복 문구 — 번호는 한 줄로 두고, 문구는 남은 폭에서 줄바꿈 */
.mn-contact{display:flex;align-items:flex-start;gap:8px;margin-top:8px;}
.mn-contact .mn-p4{flex:none;white-space:nowrap;}
.mn-dups{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px;}
.mn-dups .mn-dup{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4;border-radius:999px;padding:3px 8px;align-self:flex-start;max-width:100%;}
.mn-contact{gap:6px;}
/* 전화번호 — 누르면 전화 연결 */
a.mn-tel{text-decoration:none;cursor:pointer;}
a.mn-tel:active{background:#dfe6f3;}
a.mn-tel.sm{font-size:11.5px;padding:2px 8px;}
.mn-phone-line{align-items:center;}
/* 전화번호 옆에 중복 정보를 **한 줄로** — 좁으면 중복 문구 끝만 줄임표 */
.mn-rowi-ex, .mn-grp-sub.mn-phone-line{flex-wrap:nowrap;min-width:0;}
.mn-phone-line a.mn-tel{flex:none;}
.mn-phone-line a.mn-tel b{letter-spacing:.01em;}
.mn-phone-line .mn-dup{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mn-contact .mn-p4 b{letter-spacing:.02em;}
/* 둘째 줄: 소속 · 신청일 — 한 줄에 이름·직분·소속·상태 단추가 다 안 들어가 신청일만 떨어지던 것 */
.mn-sub{display:block;margin-top:3px;white-space:nowrap;}
#mn-list .mn-sub i{margin-left:0;}
.mn-date{font-size:12px;color:#a0a9b8;}
.mn-date::before{content:"·";margin:0 5px;color:#c3cad6;}
/* 신청일 거르기 — 글자를 위로 올려 날짜 두 칸이 한 줄 전체를 나눠 쓴다(좁아 날짜가 잘렸다) */
.pl-find .mn-dates{grid-column:1/3;grid-row:2;}
.mn-dates-lb{display:block;font-size:12px;font-weight:700;color:#7a869c;margin:0 2px 4px;}
.mn-dates-row{display:flex;align-items:center;gap:6px;}
.mn-dates-row .push-in{flex:1 1 0;min-width:0;font-size:15px;padding:10px 8px;}
#mn-list .pl-nm i{white-space:nowrap;}
/* 취소 사유 창 — 브라우저 기본 prompt 는 휴대폰에서 눈에 안 띄고 앱과 딴판이었다 */
.mn-modal{position:fixed;inset:0;background:rgba(13,27,62,.45);display:flex;align-items:center;justify-content:center;
  padding:16px;z-index:1000;}
.mn-modal-box{width:100%;max-width:420px;background:#fff;border-radius:16px;padding:20px 18px 16px;
  box-shadow:0 12px 40px rgba(13,27,62,.25);}
.mn-modal-box h3{margin:0 0 6px;font-size:1.08rem;color:#a33;}
.mn-modal-box p{margin:0 0 12px;font-size:.88rem;color:#41506b;line-height:1.55;}
.mn-modal-box p b{color:#1a3a6b;}
.mn-modal-presets{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}
.mn-modal-presets button{font:inherit;font-size:12.5px;font-weight:700;color:#1a3a6b;background:#eef3fb;
  border:1.5px solid #a9c3e8;border-radius:999px;padding:5px 11px;cursor:pointer;}
.mn-modal-box textarea{width:100%;min-height:84px;box-sizing:border-box;}
.mn-modal-hint{font-size:.78rem;color:#8a95a8;margin:6px 2px 12px;}
.mn-modal-foot{display:flex;gap:8px;}
.mn-modal-foot button{flex:1;min-height:46px;font:inherit;font-size:1rem;font-weight:800;border-radius:10px;cursor:pointer;}
.mn-modal-foot .no{background:#fff;color:#41506b;border:1.5px solid #dde3ee;}
.mn-modal-foot .yes{background:#a33;color:#fff;border:none;}
.mn-modal-foot .yes:disabled{opacity:.45;cursor:default;}
/* 공용 창(mnDialog) — 브라우저 기본 confirm/alert 는 휴대폰에서 「gocheok.onlybible.kr 내용:」으로 떠
   앱과 딴판이었다(2026-09-17 성도님 지적). 취소 사유 창과 같은 모양으로 맞춘다. */
.mn-dialog{text-align:center;padding-top:22px;}
.mn-dialog .mn-modal-ico{font-size:34px;line-height:1;margin:0 0 10px;}
.mn-dialog h3{font-size:1.12rem;margin:0 0 8px;}
.mn-dialog h3.t-primary{color:#1a3a6b;}
.mn-dialog h3.t-ok{color:#2c5f2d;}
.mn-dialog h3.t-danger{color:#a33;}
.mn-modal-body{font-size:.92rem;color:#41506b;line-height:1.6;margin:0 0 14px;word-break:keep-all;}
.mn-modal-body b{color:#1a3a6b;}
.mn-modal-note{text-align:left;font-size:.85rem;line-height:1.55;border-radius:10px;padding:10px 12px;margin:0 0 16px;word-break:keep-all;
  background:#f3f6fb;color:#41506b;}
.mn-modal-note.on{background:#e7f3e8;color:#2c5f2d;}
.mn-modal-note.off{background:#fdeceb;color:#a33;}
.mn-modal-foot .yes.primary{background:#1a3a6b;}
.mn-modal-foot .yes.ok{background:#2c5f2d;}
.mn-modal-foot .yes.danger{background:#a33;}
.mn-dup{font-size:11.5px;font-weight:800;border-radius:999px;padding:3px 9px;background:#fff4d6;color:#8a5a00;border:1px solid #f0d58a;}
.mn-dup.other{background:#f3f6fb;color:#41506b;border-color:#dde3ee;}
.mn-dup{white-space:normal;}
/* 상태 칩 — 옆으로 밀려 잘리지 않게 줄바꿈, 맨 앞에 「전체」 */
#mn-st{flex-wrap:wrap;overflow:visible;}
#mn-st label.all.on{background:#1a3a6b;border-color:#1a3a6b;color:#fff;}
#mn-st label.all input{accent-color:#fff;}
.mn-teams{margin-top:14px;}
/* 보기: 건별 · 사람별 · 사역별 (2026-09-17 성도님 요청) */
/* ── 사역신청 현황 거르기 — 작게 · 한 글꼴 (2026-09-17 다시 짬) ── */
.mn-panel button, .mn-panel input{font-family:inherit;}
.mn-search{display:flex;align-items:center;gap:6px;height:44px;padding:0 4px 0 12px;border:1px solid var(--border);
  border-radius:12px;background:#fff;}
.mn-search:focus-within{border-color:#1a3a6b;}
.mn-search-ico{font-size:15px;opacity:.55;flex:none;}
.mn-search input{flex:1;min-width:0;height:100%;border:none;outline:none;background:transparent;font-size:15px;color:#222;}
.mn-search input::placeholder{color:#a0a9b8;}
.mn-search button{flex:none;width:36px;height:36px;border:none;border-radius:9px;background:#eef3fb;color:#1a3a6b;
  font-size:18px;font-weight:800;cursor:pointer;}
.mn-stbar{display:grid;grid-template-columns:repeat(5,1fr);gap:0;margin:10px 0;border:1px solid #dde3ee;border-radius:12px;
  overflow:hidden;background:#fff;}
.mn-stbar button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:7px 2px 6px;
  border:none;background:#fff;color:#8a95a8;cursor:pointer;border-right:1px solid #eef1f6;}
.mn-stbar button:last-child{border-right:none;}
.mn-stbar b{font-size:17px;line-height:1.1;font-weight:800;}
.mn-stbar span{font-size:11.5px;font-weight:700;}
.mn-stbar button.on{color:#1a3a6b;background:#eef3fb;box-shadow:inset 0 -3px 0 #1a3a6b;}
.mn-stbar button.s2.on{color:#7a5f16;background:#fdf6e3;box-shadow:inset 0 -3px 0 #d9b45c;}
.mn-stbar button.s3.on{color:#1f5c3a;background:#eaf6ee;box-shadow:inset 0 -3px 0 #5aab7c;}
.mn-stbar button.s4.on{color:#5a6273;background:#f4f6fa;box-shadow:inset 0 -3px 0 #a0a9b8;}
.mn-view{display:flex;margin:0 0 8px;padding:3px;gap:3px;background:#eef1f6;border-radius:11px;}
.mn-view button{flex:1;min-height:34px;font-size:13.5px;font-weight:800;color:#5a6273;background:transparent;border:none;
  border-radius:8px;cursor:pointer;}
.mn-view button em{font-style:normal;font-weight:700;opacity:.7;margin-left:2px;}
.mn-view button.on{background:#fff;color:#1a3a6b;box-shadow:0 1px 3px rgba(13,27,62,.12);}
.mn-range{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin:0 0 10px;}
.mn-range-lb{font-size:12px;font-weight:700;color:#8a95a8;margin-right:2px;}
.mn-range button{font-size:12.5px;font-weight:700;color:#5a6273;background:#fff;border:1px solid #dde3ee;border-radius:999px;
  padding:4px 11px;cursor:pointer;}
.mn-range button.on{color:#fff;background:#1a3a6b;border-color:#1a3a6b;}
.mn-custom{display:flex;align-items:center;gap:6px;margin:-4px 0 10px;}
.mn-custom input{flex:1 1 0;min-width:0;height:40px;font-size:15px;padding:0 8px;border:1px solid var(--border);border-radius:10px;background:#fff;color:#222;}
.mn-custom span{color:#a0a9b8;font-weight:700;}
/* ⚠️ display:flex 가 hidden 속성을 이긴다 — 없으면 「직접」이 아닐 때도 날짜 칸이 보였다 */
.mn-custom[hidden], .mn-cond[hidden]{display:none;}
.mn-sum:empty{display:none;}
/* 임명현황 — 사람은 「김세웅-화평20」 한 가지 꼴로만 */
.mapl-g{border:1px solid #e3e8f1;border-radius:12px;background:#fff;padding:10px 12px;margin-bottom:10px;}
.mapl-h{display:flex;align-items:baseline;gap:8px;border-bottom:1px solid #eef1f6;padding-bottom:7px;margin-bottom:8px;}
```

⚠️ **발견 사항 — `#mn-st label.all` 규칙(575-577)도 죽은 선택자다.** 실제 마크업은 `<button data-st="">` (class는 `"all"`이지 `label`이 아니다) 이므로 `#mn-st label.all.on`은 절대 매치되지 않는다. `.mn-stbar button.on`(587)이 실제로 색을 준다 — "전체" 버튼은 `data-st=""`라서 `MN_CLS[undefined]`가 되어 클래스가 `"all"` 하나뿐이고, 590라인까지의 `.s2/.s3/.s4.on` 계열도 안 붙어 `.mn-stbar button.on`(남색)만 적용된다. 이식 시 `#mn-st label*` 규칙은 가져올 필요 없음.

`admin-stats.html:660-720`(붙는 머리 · 묶음 details · 묶음 안 카드 · 도구줄 · 팀 카운트, 사이의 `.mp-i-*`는 종이명단용 — 범위 밖):

```css
.mp-i-team{font-size:12.5px;font-weight:700;color:#41506b;margin-left:auto;}
.mp-i-team i{font-style:normal;font-size:11px;color:#8a95a8;}
.mp-i-msg{font-size:12px;line-height:1.6;margin-top:4px;}
.mp-i-msg.bad{color:#a33;}
.mp-i-msg.warn{color:#7a5f16;}
/* 머리 — 목록을 내려도 화면 위에 붙는다(카드 여백까지 덮게 음수 여백) */
.mn-head{position:sticky;top:0;z-index:20;background:#fff;margin:calc(-1 * var(--card-pad)) calc(-1 * var(--card-pad)) 10px;padding:10px 18px 8px;
  border-radius:14px 14px 0 0;border-bottom:1px solid #eef1f6;}
.mn-head .mn-stbar{margin:0 0 6px;}
.mn-condbar{display:flex;gap:6px;align-items:stretch;}
.mn-cond-toggle{flex:1;min-width:0;display:flex;align-items:center;gap:6px;height:36px;padding:0 10px;border:1px solid #dde3ee;
  border-radius:10px;background:#fff;cursor:pointer;color:#41506b;}
.mn-cond-t{font-size:13px;font-weight:800;flex:none;}
.mn-cond-sum{flex:1;min-width:0;text-align:left;font-size:12.5px;color:#a0a9b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.mn-cond-sum.on{color:#1a3a6b;font-weight:700;}
.mn-cond-arrow{flex:none;font-size:12px;color:#8a95a8;transition:transform .15s;}
.mn-cond-toggle[aria-expanded="true"] .mn-cond-arrow{transform:rotate(180deg);}
.mn-cond{margin-top:8px;}
.mn-cond .mn-search{height:40px;margin-bottom:8px;}
.mn-cond .mn-range{margin-bottom:6px;}
.mn-cond .mn-custom{margin:0 0 4px;}
.mn-grp{border:1px solid #dde3ee;border-radius:12px;background:#f8fafd;margin-bottom:10px;}
.mn-grp > summary{list-style:none;cursor:pointer;padding:11px 13px;display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;}
.mn-grp > summary::-webkit-details-marker{display:none;}
.mn-grp > summary::before{content:"▸";color:#7a869c;font-size:12px;width:10px;}
.mn-grp[open] > summary::before{content:"▾";}
.mn-grp-t{font-size:15px;font-weight:800;color:#1a3a6b;}
.mn-grp-t em{font-style:normal;font-size:12px;color:#7a869c;font-weight:700;margin-right:4px;}
.mn-grp-t i{font-style:normal;font-size:12.5px;color:#6b778c;font-weight:600;margin-left:5px;}
.mn-grp-n{font-size:13px;font-weight:800;color:#41506b;margin-left:auto;white-space:nowrap;}
.mn-grp-sub{flex-basis:100%;display:flex;flex-wrap:wrap;gap:5px;padding-left:18px;}
.mn-grp-body{padding:0 10px 2px;}
/* 펼친 묶음(2026-09-18) — 접혔을 때는 머리의 줄 목록이 요약, 펼치면 그 목록을 숨기고 카드(상태 바꾸기)가 대신한다.
   머리는 짙게 칠해 「이 묶음 안」이 한눈에 보이게. */
/* ⚠️ 여기에 overflow:hidden 을 두면 **묶음 안 카드의 상태 메뉴(.pl-menu)가 잘려** 사람별·사역별에서
   임명·취소를 누를 수 없다(2026-09-18 점검에서 발견 — 건별에서만 되던 까닭). 둥근 모서리는 summary 가 맡는다. */
.mn-grp[open]{background:#fff;border-color:#1a3a6b;}
.mn-grp[open] > summary{background:#1a3a6b;color:#fff;padding:10px 13px;border-radius:11px 11px 0 0;}
.mn-grp[open] > summary::before{color:#c9d6ec;}
.mn-grp[open] > summary .mn-grp-rows{display:none;}
.mn-grp[open] .mn-grp-t{color:#fff;}
.mn-grp[open] .mn-grp-t em, .mn-grp[open] .mn-grp-t i{color:#c9d6ec;}
.mn-grp[open] .mn-grp-n{color:#e4ebf7;}
.mn-grp[open] > summary .mn-p4{background:rgba(255,255,255,.14);color:#e4ebf7;}
.mn-grp[open] > summary .mn-p4 b{color:#fff;}
.mn-grp[open] > summary .mn-dup.other{background:rgba(255,255,255,.14);color:#e4ebf7;border-color:rgba(255,255,255,.25);}
.mn-grp[open] > .mn-grp-body{padding:10px 10px 2px;background:#f3f6fb;}
/* 묶음 안 카드 — 머리에 있는 것은 뺐다 */
.pl-card.mn-in{padding:10px 12px;}
.mn-in-team{display:flex;align-items:baseline;gap:5px;flex-wrap:wrap;}
.mn-in-team b{font-size:16px;font-weight:800;color:#1a3a6b;}
.mn-in-team i{font-style:normal;font-size:12.5px;color:#41506b;margin:0;}
.mn-in .mn-sub{margin-top:2px;}
#mn-list .mn-in-opt{margin-left:5px;color:#41506b;}
.mn-grp-tools{display:flex;justify-content:flex-end;gap:12px;margin:-2px 2px 8px;}
.mn-grp-tools button{font:inherit;font-size:12.5px;font-weight:700;color:#1a3a6b;background:none;border:none;cursor:pointer;text-decoration:underline;}
.mn-teams-t{font-size:12px;font-weight:800;color:#7a869c;margin-bottom:6px;}
.mn-teams-t i{font-style:normal;font-weight:700;margin-left:4px;color:#1a3a6b;}
.mn-tcount{display:inline-block;font-size:12px;color:#41506b;background:#f3f6fb;border-radius:7px;
  padding:4px 8px;margin:0 5px 5px 0;}
.mn-tcount b{color:#1a3a6b;}
.pl-hd{display:flex;align-items:flex-start;gap:8px;flex-wrap:nowrap;}
```

`admin-stats.html:738-776`(카드 머리·상태 드롭다운 부품 `.pl-nm/.pl-drop/.pl-sel/.pl-menu/.pl-opt` — 사이의 `.ma-*`는 담당자 화면용, 범위 밖):

```css
.pl-nm{flex:1 1 auto;min-width:0;}
.pl-hd .pl-sel{align-self:flex-start;}
.pl-nm b{font-size:16px;color:#1a3a6b;}
.pl-nm i{font-style:normal;font-size:12px;color:#8a95a8;margin-left:6px;}
.pl-nm .pl-at{display:block;font-size:11px;color:#a0a9b8;margin-top:2px;}
.pl-contact{display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap;}
.pl-tel{font-size:13.5px;font-weight:800;color:#1a5fb4;text-decoration:none;letter-spacing:.02em;}
.pl-tel.none{color:#b0b8c6;font-weight:700;}
.pl-sms{font-size:11.5px;font-weight:800;font-family:inherit;cursor:pointer;white-space:nowrap;
  border:1.5px solid #a9c3e8;background:#eef3fb;color:#1a3a6b;
  border-radius:999px;padding:4px 9px;line-height:1.3;}
.pl-sms:hover{background:#e2ebf8;}
/* 상태 고르기 — 브라우저 기본 목록을 쓰지 않고 직접 만든다 */
.pl-drop{position:relative;flex:none;}
.pl-sel{appearance:none;-webkit-appearance:none;border:1.5px solid;cursor:pointer;
  padding:6px 25px 6px 12px;border-radius:999px;font-size:12px;font-weight:800;
  font-family:inherit;line-height:1.3;white-space:nowrap;
  background-repeat:no-repeat;background-position:right 9px center;background-size:10px 6px;
  transition:box-shadow .12s,filter .12s;}
.pl-sel:hover{filter:brightness(.97);}
.pl-drop.open .pl-sel{box-shadow:0 0 0 3px rgba(26,58,107,.14);}
.pl-sel.s1{background-color:#eef3fb;border-color:#a9c3e8;color:#1a3a6b;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%231a3a6b' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");}
.pl-sel.s2{background-color:#fdf6e3;border-color:#e6cf94;color:#7a5f16;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%237a5f16' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");}
.pl-sel.s3{background-color:#eaf6ee;border-color:#a9d8bb;color:#1f5c3a;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%231f5c3a' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");}
.pl-sel.s4{background-color:#f4f6fa;border-color:#c3cad6;color:#5a6273;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%235a6273' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");}
.pl-menu{display:none;position:absolute;right:0;top:calc(100% + 6px);z-index:30;
  min-width:118px;padding:5px;border-radius:12px;background:#fff;
  border:1px solid #dde3ee;box-shadow:0 10px 26px rgba(26,42,72,.16);}
.pl-drop.open .pl-menu{display:block;}
.pl-opt{display:block;width:100%;text-align:left;cursor:pointer;font-family:inherit;
  font-size:12.5px;font-weight:700;padding:8px 10px;border:none;border-radius:8px;
  background:transparent;color:#4a5568;white-space:nowrap;}
.pl-opt:hover{background:#f2f5fb;}
.pl-opt.on{font-weight:800;}
.pl-opt.on::after{content:"✓";float:right;margin-left:10px;}
.pl-opt.s1.on{background:#eef3fb;color:#1a3a6b;}
.pl-opt.s2.on{background:#fdf6e3;color:#7a5f16;}
.pl-opt.s3.on{background:#eaf6ee;color:#1f5c3a;}
.pl-opt.s4.on{background:#f4f6fa;color:#5a6273;}
```

### 2.16 CSS — "사역신청 관리 표준 v1" 블록 전문(verbatim, 여섯 화면 공유 — 신청현황이 실제로 쓰는 부분 다수 포함)

`admin-stats.html:803-905`

```css
/* ═══ 사역신청 관리 표준 v1 (2026-09-18) ═══════════════════════════════
   폰 한 손으로 예배 앞뒤 30초에 쓰는 화면이다. 규칙은 셋뿐이다.
   ① 누르는 것의 높이는 **48(주 동작) · 44(보조) · 36(칩·탭)** 뿐이고 글씨는 13px 아래로 안 간다.
   ② 색이 뜻이다 — 남색 채움은 「자료를 바꾸는 것」에만, 조회·내려받기는 ghost, 빼기·취소는 붉은 꼴.
   ③ 값은 :root 토큰과 이 덩이에서만 나온다.
   ⚠️ 이 덩이는 위의 `@media (max-width:420px)` **뒤**다 — 여기에 flex-direction·align-items 를
      적으면 좁은 폰의 고치기 폼이 되돌아간다. **크기·색·여백만** 적을 것.
   ⚠️ .pl-* 는 필사 노트 신청과 **함께 쓰는 부품**이다. 여기서 키우면 그 화면도 함께 커진다(좋은 쪽이지만 한 번 볼 것).
   ───────────────────────────────────────────────────────────────── */
/* ① 가장 많이 누르는 것 — 상태 바꾸기(현황) */
.pl-sel{min-height:var(--tap);padding:0 30px 0 14px;font-size:14px;display:inline-flex;align-items:center;}
.pl-opt{min-height:var(--tap);padding:0 14px;font-size:14px;display:flex;align-items:center;}
.pl-menu{min-width:150px;padding:6px;}
.pl-opt.s4{margin-top:6px;border-top:1px solid #eef1f6;}   /* 되돌릴 수 없는 「취소」만 떼어 놓는다 */
/* 삭제는 상태가 아니라 하는 일이다 — 줄을 긋고 붉은 꼴로(2026-09-26) */
.pl-opt.pl-del{margin-top:6px;border-top:1px solid #eef1f6;color:#a33;font-weight:800;}
.pl-opt.pl-del:hover{background:#fdeceb;}
/* 아래 자리가 모자라면 위로 연다(메뉴 높이 ≈ 4×44+12 = 188px) */
.pl-drop.up .pl-menu{top:auto;bottom:calc(100% + 6px);}

/* ② 보조 단추 44px · 주 동작 48px */
.back-btn{min-height:var(--tap);padding:0 16px;font-size:.95rem;display:inline-flex;align-items:center;}
.mc-btn{min-height:var(--tap);padding:0 16px;font-size:.95rem;}
.ma-btn{min-height:var(--tap);padding:0 14px;font-size:.95rem;}
.mp-dl{min-height:var(--tap);display:inline-flex;align-items:center;padding:0 16px;font-size:.95rem;}
.mc-ord{gap:8px;}
.mc-ord button{width:var(--tap);height:var(--tap);font-size:15px;padding:0;}
.mc-save{align-self:auto;min-height:var(--tap-lg);font-size:1rem;min-width:9em;padding:0 16px;}
.mc-in-acts{align-items:stretch;}
.mc-bar button{min-height:var(--tap-lg);padding:0 16px;font-size:1rem;}

/* ③ 고르는 줄 — 칩·탭 36px, 한 줄 입력·토글 44px */
.mn-range button,.mc-tab,.mn-view button,.mn-modal-presets button{
  min-height:var(--chip);padding:0 14px;font-size:13px;}
.mn-grp-tools{gap:8px;}
.mn-grp-tools button{min-height:var(--chip);padding:0 14px;font-size:13px;text-decoration:none;
  border:1.5px solid #a9c3e8;background:#eef3fb;border-radius:999px;color:#1a3a6b;}
.mn-cond-toggle,.mc-pick{height:var(--tap);}
.mn-cond .mn-search,.mn-custom input{height:var(--tap);}

/* ④ 눌리지 않는 <span> 칩은 단추처럼 보이지 않게 — 테두리를 버리고 회색으로 */
.mapl-p,.mp-cols span,.mn-tcount{border:none;background:#f3f6fb;color:#41506b;}
.mapl-search,.mn-search-top{margin-bottom:10px;}
.mn-search-top{height:var(--tap);}
#mapl-sum i{font-style:normal;color:#6b778c;font-weight:600;}

/* ⑤ 판단에 쓰는 작은 글씨 — 13px 바닥, 회색은 #6b778c 까지만(11~12px + #a0a9b8 은 대비 2.4:1) */
.mn-date,.mn-rowi-t small,.ma-nm .ma-at,.mc-tag,.mc-r-v.none,.mp-cols span.dim,.mn-cond-sum{
  font-size:13px;color:#6b778c;}
.mn-stbar span,.mn-rowi-st,.mc-c-sub,.mn-tcount,.mp-i-st,.mc-r-l,.mn-teams-t{font-size:13px;}
.mc-c-sub,.mc-r-l,.mn-teams-t{color:#6b778c;}

/* ⑥ 고치기 폼 — 손가락에 닿는 칸 44px, 체크박스 20px(방향은 적지 않는다) */
.mc-when input[type=checkbox]{width:20px;height:20px;}
.mc-in .mc-when label{min-height:var(--tap);padding:0 10px;border:1px solid #dde3ee;border-radius:10px;font-size:13px;}
.mc-in .mc-when input[type=time]{min-height:var(--tap);font-size:15px;padding:0 6px;width:auto;min-width:0;flex:1 1 0;}
.mc-in .mc-when .mc-w-tw{flex:none;}
/* 시각 두 칸은 이름표를 윗줄로 올려 한 줄을 다 쓴다 — 84px 로 좁아지면 「오전 ]」처럼 잘린다 */
.mc-in .mc-when .mc-w-time{flex-wrap:wrap;}
.mc-in .mc-when .mc-w-time>b{flex-basis:100%;margin-bottom:4px;}
.mc-in .mc-when .mc-w-time input[type=time]{flex:1 1 0;min-width:108px;padding:0 8px;}
.mc-w-r{gap:8px;}

/* ⑦ 카드 사이 여백은 한 값(10px) */
.mc-card,.ma-row{margin-bottom:var(--gap);}
.mp-item{margin-top:var(--gap);}

/* ⑧ 확인 창 — 길면 스크롤되고 단추는 남는다 */
.mn-modal{align-items:flex-start;overflow-y:auto;padding:16px 16px 24px;}
.mn-modal-box{margin:auto 0;}
.mn-modal-foot{position:sticky;bottom:0;background:#fff;padding-top:8px;}
.mn-modal-foot button{min-height:var(--tap-lg);}

/* ⑨ 요약 줄은 여섯 화면 같은 꼴 */
.mn-sum{font-size:13px;color:#41506b;background:#eef1f8;border-radius:8px;padding:8px 12px;margin-bottom:10px;}
.mn-sum b{color:#1a3a6b;}

/* ⑩ 붙는 제목 줄 — 나가는 길은 늘 화면에 있다(.mn-top 을 단 다섯 화면만) */
.rep-head.mn-top{position:sticky;top:0;z-index:30;background:var(--cream);padding:8px 0;margin-bottom:12px;}
.mn-head,.mc-head{top:60px;max-height:40vh;overflow-y:auto;}

/* ⑫ 띠 안 단추도 서로 맞춘다(띠를 키우지 않는 선에서 40px) */
.topbar .logout,#hub-link{min-height:40px;padding:0 16px;display:inline-flex;align-items:center;}
/* ⑬ 체크박스는 20px 이고 줄 전체가 눌린다 */
.mc-only{min-height:var(--tap);}
.mc-only input[type=checkbox]{width:20px;height:20px;}

/* ⑪ 화면 전체에 대한 동작은 제목 줄 바로 아래 한 줄에만 — 한 줄에 둘까지, 48px */
.mn-stlb,.mn-vlb{font-size:11.5px;font-weight:800;color:#8a95a8;margin:0 2px 3px;line-height:1.2;}
.mn-vlb{margin-top:10px;}
.mn-stlb i{font-style:normal;font-weight:700;color:#a0a9b8;}
.ma-btn.ghost,.push-btn.ghost{background:#eef3fb;color:#1a3a6b;border:1px solid #a9c3e8;}
.ma-btn[data-maadd]{background:var(--navy);color:#fff;border-color:var(--navy);}   /* 등록을 확정하는 단추 */
.adm-toast{position:fixed;left:16px;right:16px;bottom:16px;z-index:1100;min-height:var(--tap);
  display:flex;align-items:center;gap:8px;padding:12px 14px;border-radius:12px;
  background:#eef3fb;border:1px solid #a9c3e8;color:#1a3a6b;font-size:14px;font-weight:700;
  box-shadow:0 8px 24px rgba(13,27,62,.18);}
.adm-toast.warn{background:#fdf1f1;border-color:#e6bcbc;color:#a33;}
.adm-acts{display:flex;gap:8px;margin:0 0 12px;}
.adm-acts>.push-btn{flex:1 1 0;min-width:0;min-height:var(--tap-lg);font-size:1rem;padding:0 12px;
  overflow:hidden;text-overflow:ellipsis;}
.adm-acts>.push-btn[hidden]{display:none;}
.push-btn.ghost{background:#eef3fb;color:#1a3a6b;border:1px solid #a9c3e8;}
```

토큰 정의(`:root`, `admin-stats.html:11-17`):
```css
:root{
  --navy:#1a3a6b; --navy-dark:#0d1b3e; --gold:#c8a84b;
  --cream:#fdf8f0; --gray:#6b7280; --border:#ddd6c8; --light:#f3f0ea;
  --green:#2c5f2d; --error:#c0392b;
  /* 사역신청 관리 표준 v1 — 누르는 것의 세 크기와 여백(2026-09-18) */
  --tap-lg:48px; --tap:44px; --chip:36px; --gap:10px; --gap-s:6px; --card-pad:18px;
}
```

### 2.17 `.min-` 접두 클래스 — 이 화면에는 없음

`admin-stats.html` 전체를 검색했으나 `.min-` 접두 CSS 선택자는 **0건**이다. 노트(`docs/notes/ministry-2027.md` "단추 줄은 화면 아래 고정" 절)의 `.min-acts`(고정 단추줄) · `.min-screen`(96px 아래 여백) · `.min-dates`(신청일·임명일 두 줄)는 **성도용 화면(app.js, `index.html`이 로드하는 프런트)의 클래스**이며 관리자 신청현황 화면과는 다른 파일에 있다 — 이 조사 범위(admin-stats.html) 밖.

---

## 3. 동작 목록 (체크리스트)

1. 신청 현황 화면은 담당자 암호(`MINISTRY_SECRET`)+등록 담당자, 또는 관리자 암호(`ADMIN_SECRET`) 중 하나로 열리며 **`ministryList`/`SetStatus`/`Delete` 호출마다 매번 재확인**된다 — `ministryAdminError`(index.ts:184).
2. 틀린 암호와 "맞는 암호이나 등록 담당자 아님"은 서버가 **완전히 같은 오류 문자열(`"unauthorized"`)**을 준다 — `ministryStaffKey`, `docs/notes/ministry-2027.md` "틀린 암호와 「맞는 암호 + 담당자 아님」은 같은 답" 절.
3. 담당자 전용 화면에서 권한이 사라지면(빠짐/암호변경) 자동으로 로그인 화면으로 돌려보내고 안내 문구를 띄운다 — `minAuthLost`(admin-stats.html:1090).
4. 화면은 처음 열릴 때 **상태 필터가 "신청완료"만 켜진 채** 시작한다(다른 상태는 안 보임) — `mnStOn = new Set(["신청완료"])`(3561).
5. 유효 상태는 4개(신청·접수·임명·취소)이며 "미채택"은 화면·서버 신규 액션 모두에서 제외됐지만 DB는 옛 값을 여전히 허용한다 — `MN_STATES`/`MINISTRY_STATUS`, `docs/notes/ministry-2027.md` "「미채택」 상태를 뺐다" 절.
6. 상태 숫자 막대는 **누르면 그 상태만, 이미 켜진 게 있으면 더하거나 뺀다, 전체를 다 고르면 자동으로 "전체"로 리셋**된다 — `renderMinistryAdmin`의 `#mn-st` 클릭 핸들러(admin-stats.html:4023-4031).
7. 상태 칩 옆 숫자는 **걸러지기 전 전체 기준**으로 항상 표시된다 — `mnRender`(admin-stats.html:4093-4098).
8. 보기는 건별·사람별·사역별 3가지이며 보기 단추 안의 숫자는 **지금 걸러진 것 기준**이다 — `mnRender`(4114-4115).
9. 신청일 필터는 전체/오늘/7일/직접 4종이며 KST 날짜 문자열 비교로 처리된다 — `mnRangeDates`(4043).
10. 찾기(검색)는 이름·소속·직분·팀·위원회 5개 필드에 대한 단순 부분일치이며 상시 노출(접힌 "조회 조건" 밖)이다 — `mnFiltered`(4073-4087), `docs/notes/ministry-admin-ui.md` "찾기는 세 화면 같은 자리".
11. "조회 조건" 토글은 접혀 있어도 걸린 조건을 요약 문구로 보여준다(신청일만 대상 — 찾기·상태는 이미 상시 노출) — `mnRender`(4100-4112).
12. 팀별 신청 수 패널은 **지금 걸러진 목록 기준**으로 화면이 다시 센다(서버 `counts`는 취소 포함 연도 전체라 불일치가 나서 안 씀) — `docs/notes/ministry-2027.md` "「팀별 신청 수」는 지금 걸러진 목록으로 센다" 절, `mnRender`(4168-4181).
13. 카드는 세 보기 모두 **같은 함수(`mnCard`, `mnRender` 내부 클로저)**를 쓰며 어느 보기에서든 상태 변경·삭제가 그대로 동작한다.
14. 사람별·사역별은 묶음(`<details>`)이며 접힌 기본 상태, 펼친 묶음은 다시 그려도 열림 상태가 유지된다(`mnOpen` Set) — `mnGroupsHtml`/`mnBindGroups`(4435-4488).
15. 묶음을 펼치면 머리(summary)의 요약 줄 목록이 사라지고 짙은 남색으로 칠해지며, 카드에는 머리에 이미 나온 항목을 뺀다 — `docs/notes/ministry-admin-ui.md` "접힘 = 요약, 펼침 = 처리" 절, CSS `.mn-grp[open] > summary .mn-grp-rows{display:none}`.
16. `.mn-grp[open]`에 `overflow:hidden`을 다시 넣으면 묶음 안 카드의 상태 메뉴가 잘려 사람별·사역별에서 임명·취소를 누를 수 없게 된다 — CSS 주석(admin-stats.html:694-695), `docs/notes/ministry-admin-ui.md` 규칙 항목.
17. 같은 휴대폰 번호로 여러 사람이 신청했으면 "⚠️ 소속(같은 이름)" 또는 "☎️ 번호 같음(다른 이름)" 배지가 뜬다. **명단 전체(mnRows) 기준**이라 필터로 한쪽이 가려져도 배지는 그대로 남는다 — `mnDupMap`/`mnDupOthers`/`mnDupBadge`(4368-4406).
18. 전화번호는 결정(접수완료·임명확정·미채택·취소 — 실제로는 임명확정/취소만 도달 가능)이 나면 서버가 지우므로, 중복 배지도 **번호가 남아있는 신청끼리만** 비교된다.
19. 전화번호를 누르면 `tel:` 링크로 바로 전화가 걸리고, 묶음 머리(summary) 안에서 눌러도 묶음이 열리거나 닫히지 않는다 — `mnPhoneHtml`/`mnBindGroups`(4430, 4473-4479).
20. 상태 변경은 드롭다운(`.pl-drop`/`.pl-sel`/`.pl-menu`)이며, 아래 공간이 210px 미만이면 위로 열린다(`up` 클래스) — `mnRender`(4183-4195).
21. 메뉴 맨 아래엔 상태 옵션과 구분선으로 떨어진 **🗑 삭제**가 있다 — `mnCard`(4149-4152).
22. "임명확정"으로 바꾸면 확인창이 뜨고, **알림을 켠 분(🔔 알림이 한 번 나감)과 안 켠 분(🔕)**을 갈라 다른 문구를 보여준다 — `mnSetStatus`(4245-4252).
23. **이미 그 성도에게 알림이 나간 적 있는(재확정) 경우엔 확인창 자체가 생략**되고 바로 서버 호출로 진행된다(`!r.notified_at` 조건) — 발견 사항, `mnSetStatus`.
24. "취소"로 바꾸려면 반드시 사유를 입력해야 하며(화면·서버 이중 검사), 취소 사유 창은 4개 프리셋 버튼 + 자유 입력, 자동 초점을 주지 않는다(키보드가 프리셋을 가리는 문제 때문) — `mnAskCancelReason`(4326-4361), `docs/notes/ministry-admin-ui.md` "취소 사유 창의 자동 초점 제거".
25. 상태 변경은 **낙관적 갱신**(먼저 화면 반영 → 서버 실패 시 롤백)으로 처리된다 — `mnSetStatus`(4260-4272).
26. 결정이 나면 서버가 전화번호를 지우고(`phoneCleared:true`), 화면은 그 신호로 카드에서 즉시 번호를 지운다 — `mnSetStatus`(4274).
27. 임명확정 알림 결과는 "이미 보냄/보냄(기기 수)/안 켜심/발송 실패" 4가지로 구분해 토스트로 안내되며, "이미 보냄"과 "안 켜심"을 섞으면 안 된다(안 켜진 분께 담당자가 또 연락하게 됨) — `mnSetStatus`(4276-4284), `docs/notes/ministry-2027.md`.
28. 확정 알림은 **한 사람·한 해 한 번**만 나간다 — 살아있는(`notified_at not null`) 임명확정 행이 이미 있으면 스킵, 되돌린 확정의 흔적까지 세면 이후 어떤 팀을 확정해도 영영 안 나가므로 "아직 살아 있는 것"만 센다 — `ministrySetStatus`(index.ts:4776-4790).
29. 삭제는 **되돌릴 수 없다**는 것을 두 번 확인하는 창(① 무엇을 지우는지 ② 정말인지)을 거쳐야 하며, 취소와 달리 자취가 남지 않고 3개 상한 자리도 되돌아간다 — `mnDeleteOne`(4210-4240), `docs/notes/ministry-2027.md` "신청 한 건을 아주 지우기" 절.
30. 서버도 삭제를 담당자 암호 없이는 거절한다(화면 확인창과 별개로 서버가 자기 자리에서 다시 막음) — `ministryDelete`(index.ts:4728).
31. 삭제·상태변경 오류는 공용 `mnDialog`(단추 하나짜리 알림창)로 뜨고, 성공은 화면 아래 4초짜리 토스트(`mnNote`)로 뜬다 — 실패(연락 필요/되돌릴 수 없음)는 토스트가 아니라 다이얼로그를 쓴다는 규칙 — `docs/notes/ministry-admin-ui.md` "결과 안내는 한 자리·한 꼴".
32. `note`(담당자 메모·취소 사유)는 성도 응답(`ministryMine`/`ministryRow`)에는 절대 실리지 않고 `ministryList`(관리자 전용)에만 실린다 — index.ts:4135-4137, 4704.
33. 응답 어디에도 `user_id`가 노출되지 않는다(신청 목록·삭제 결과 모두) — index.ts:4047-4048, 4739.
34. 브라우저 기본 `confirm`/`alert`/`prompt`를 쓰지 않는다 — 휴대폰에서 "gocheok.onlybible.kr 내용:"으로 뜨는 문제 때문에 전부 `mnDialog`/`mnAskCancelReason`로 교체됐다 — `docs/notes/ministry-2027.md` "확인·알림 창은 공용 mnDialog".
35. 이 화면(신청 현황)에는 CSV/엑셀 내려받기가 없다 — 발견 사항(별도 임명현황 화면에만 있음).
36. 제목 줄(`.rep-head.mn-top`)과 붙는 머리(`.mn-head`)는 각각 sticky이며, 붙는 머리는 카드 padding까지 덮는 음수 마진으로 위쪽 모서리를 맞춘다 — CSS(admin-stats.html:666, 881).
37. `.mn-custom[hidden]`/`.mn-cond[hidden]`처럼 `display:flex` 규칙이 `hidden` 속성을 이기는 문제를 별도 CSS로 막아뒀다 — `docs/notes/ministry-admin-ui.md`, `docs/notes/ministry-2027.md` "현황 거르기를 작게 다시 짬" 절.
38. `mnStatusChips` 함수는 정의돼 있지만 실제로는 호출되지 않는 죽은 코드다(칩 방식에서 줄 목록 방식(`mnRowsHtml`)으로 교체된 잔재) — 발견 사항, `docs/notes/ministry-admin-ui.md`의 "처음엔 칩으로 늘어놨다가 여러 줄로 엉켜 줄 목록으로 바꿨다" 기록과 일치.
39. `.pl-st label.*`, `#mn-st label.all*` CSS 규칙은 이 화면의 실제 마크업(`<button>`)과 매치되지 않는 죽은 선택자다 — 발견 사항.
40. `mnLoad`는 `mnLoaded` 캐시 플래그가 true인 동안 서버를 다시 안 부른다("↻ 새로 불러오기"를 눌러야 재조회) — 여러 담당자가 동시에 쓰면 서로 옛 화면을 볼 수 있다 — 발견 사항.
41. `ministryList`는 `.limit(2000)`으로 자른다 — 2000건을 넘는 연도는 조용히 일부만 내려온다 — 발견 사항.
42. `.min-*` 접두 CSS는 이 관리자 화면에 없다(성도용 app.js 화면의 것) — 확인 사항, 혼동 주의.

---

## 4. 크기

**Section 1(index.ts) verbatim 코드**: 함수/상수 코드 약 **190줄**(ministryAdminError 8 · 상수블록 15 · ministryCfg 10 · ministryRow 19 · ministryList 54 · ministryDelete 15 · ministrySetStatus 53 · ministryNotify 16) + SQL 테이블 정의(원본 + 8개 마이그레이션 파일 전문) 약 **281줄** = **약 471줄**.

**Section 2(admin-stats.html) verbatim 코드**: JS(상태/전역변수·인증헬퍼·plCloseMenus/plEsc·renderMinistryAdmin·mnSyncStBar·mnRangeDates·mnLoad·mnFiltered·mnRender(+inline mnCard)·mnDeleteOne·mnSetStatus·mnDialog·mnAskCancelReason·mnPersonKey~mnNote 일괄) 약 **604줄** + CSS(`.mn-`/`.pl-` 관련 블록 4개 구간 + 표준 v1 전문 + `:root` 토큰) 약 **376줄** = **약 980줄**.

**합계 약 1,451줄**의 verbatim 코드를 이식 대상으로 추출했다(위 코드블록 실측 기준 근사치 — 정확한 라인 수는 각 절에 표기한 `파일:시작-끝` 범위로 재확인 가능).

---

## 찾지 못한 것

없음 — 요청된 `ministryList`·`ministrySetStatus`·`ministryDelete`·`ministryRow`·`ministryCfg`·`isLocked`·`ministryNotify`·`pushToSubs`·`MINISTRY_STATUS`·`renderMinistryAdmin`·`mnDialog`·`mnNote`·`mnAskCancelReason`·`mnPhoneHtml`·`mnRowsHtml`·`mnBindGroups`·`.pl-*`/`.pl-menu`/`.pl-drop`/`.pl-del`·`ministry_orders` 테이블 정의 전부를 실제 파일에서 찾아 verbatim으로 옮겼다. 다만 `mnCard`는 독립 함수가 아니라 `mnRender` 내부의 익명 클로저로 존재한다(2.8절에 명시).
