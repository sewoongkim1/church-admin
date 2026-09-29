# 「🗂️ 사역팀 정보」 화면 — 레거시 추출 (읽기 전용 조사)

대상: `admin-stats.html`(성경암송 v2, `renderMinistryCatalog` 및 부속) + `supabase/functions/api/index.ts`
(`ministryCatalog`·`ministryCatalogSave`·`ministryCatalogOrder` 및 헬퍼) + `supabase/*.sql`(`ministry_catalog`
테이블 이력).
범위 밖: 신청현황(`renderMinistryAdmin`, → `docs/port/ministry-status-legacy.md`) · 임명현황 · 담당자 ·
📋 종이 명단 올리기(`renderMinistryPaper` → `docs/port/ministry-paper-legacy.md`, 같은 조사에서 함께 뽑음).

> 참고 원본: `C:\Projects\bible-memorize-church-app-v2\docs\notes\ministry-2027.md`,
> `C:\Projects\bible-memorize-church-app-v2\docs\notes\ministry-admin-ui.md` — 둘 다 전문을 읽고 아래
> 체크리스트에 반영했다. 줄 번호는 여러 세션이 함께 고치는 파일이라 **함수/선택자 이름으로 다시 찾을 것**
> (이 문서 작성 시점 스냅샷).

---

## 1. 서버 액션 (`supabase/functions/api/index.ts`)

### 1.0 게이트 — `ministryAdminError`(쓰기 액션 둘의 첫 줄에서 호출. `ministryCatalog`(읽기)는 게이트가 **없다** — 아래 1.4 참고)

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

`ministryStaffKey`(담당자 확인, `index.ts:199-212`)·`ministryStaffCandidates`(217-228)·`ministryKeysToUsers`(231-245)는
신청현황과 완전히 같은 경로다 — 전문은 `docs/port/ministry-status-legacy.md` 1.0절 및 아래 1.2(이 문서에서
`ministryKeysToUsers`는 `ministryCatalogSave`/`Order`에서 직접 쓰이지 않으므로 이름만 남긴다).

**⚠️ 핵심 발견 — `ministryCatalog`(목록을 읽는 액션)는 `ministryAdminError`를 전혀 호출하지 않는다.**
성도용 신청 화면과 관리자 「사역팀 정보」 화면이 **같은 액션을 공유**하기 때문에 이 액션 자체는 완전히
공개(비번 없이 누구나 호출 가능)다. 관리자 전용으로 잠그는 것은 **저장**(`ministryCatalogSave`)과
**차례 바꾸기**(`ministryCatalogOrder`) 둘뿐이다. 화면(`mcLoad`)도 이 사실을 그대로 반영해
`callApi({ action:"ministryCatalog" })`를 **`pw`/`staff` 없이** 부른다(아래 2.6).

### 1.1 상수 — 잠금·상한·명단 규칙(`ministryCatalog`가 참조하는 것만)

`index.ts:4059-4067`:
```ts
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
`ministryCatalog`는 `MINISTRY_ROSTER`(= `["접수완료","임명확정"]`)만 실제로 쓴다 — "지금 섬기는 분" 자동
명단에 넣을 신청 상태를 그 값으로 거른다(아래 1.4).

### 1.2 `ministryCfg` — 신청 기간·연도(공용)

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
`ministryCatalog`는 `b.year`가 없으면 `cfg.year`(기본 2027)를 쓰고, 응답에 `period:{open,close,isOpen}`을
함께 실어 성도 화면이 신청 가능 여부를 판단하게 한다(관리자 화면은 이 값을 쓰지 않는다).

### 1.3 이름·꾸밈(HTML) 관련 헬퍼 — `ministryWhoShort` / `ministryEsc` / `ministryMemberLine`

「지금 섬기는 분」 자동 명단 한 줄(`김세웅 안수집사 (화평-20)`)을 만드는 데 쓰인다.

`index.ts:4069-4091`:
```ts
// 「화평 20목장」 → 「화평-20」, 「중등부 2학년」 → 「중등부-2」
// ⚠️ 정규식을 쓰지 않는다 — 이 파일이 껍데기를 거쳐 고쳐질 때 역슬래시가 풀린 적이 있다.
function ministryWhoShort(who: unknown): string {
  return norm(who).split(" ").map((x: string) => {
    const t = x.trim();
    return (t.endsWith("목장") || t.endsWith("학년")) ? t.slice(0, -2) : t;
  }).filter(Boolean).join("-");
}

// 명단 한 줄 — 「김세웅 안수집사 (화평-20)」
// ⚠️ 이름은 성도가 스스로 적은 값이라 반드시 막아서 내보낸다. 이 줄은 앱이 날 HTML로
//    그리는 자리다(관리자가 넣은 꾸밈을 살리려고). 막지 않으면 이름 한 칸이 화면을 먹는다.
function ministryEsc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function ministryMemberLine(r: any): string {
  const nm = ministryEsc(norm(r.name));
  if (!nm) return "";
  const pos = ministryEsc(norm(r.position));
  const wh = ministryEsc(ministryWhoShort(r.who));
  return nm + (pos ? " " + pos : "") + (wh ? " (" + wh + ")" : "");
}
```

### 1.4 `ministryCatalog` — 목록을 읽는 액션(성도 화면과 공유, **게이트 없음**)

`index.ts:4165-4229`:
```ts
// 사역팀 목록 — 임명직도 함께 내려준다(화면에서 잠근 채 보여 준다)
async function ministryCatalog(b: any) {
  const cfg = await ministryCfg();
  const year = Number(b.year) || cfg.year;
  const { data, error } = await db.from("ministry_catalog")
    .select("id,committee,group_name,team,kind,schedule_note,desc_note,capacity_note,"
      + "option_note,members_note,leader_note,sort_order,"
      + "day_sun,day_fri,day_sat,day_week,time_from,time_to," + MINISTRY_FREQ_COLS)
    .eq("year", year)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });   // ⚠️ 겹칠 때 차례가 흔들리지 않게 둘째 열쇠
  if (error) throw error;

  // 팀마다 「지금 섬기는 분」 — 담당자가 **접수완료**를 누른 건부터 보인다(성도님 요구 ①).
  // ⚠️ 신청완료(아직 접수 전)는 넣지 않는다. 확정 전 신청자를 남에게 보이는 일이 된다.
  // ⚠️ 관리자가 손으로 넣은 members_note 가 **먼저** 온다 — 앱을 거치지 않고 지금 섬기시는
  //    분들이라 첫해에는 그쪽이 명단의 전부다.
  const roster = new Map<number, string[]>();
  const { data: served } = await db.from("ministry_orders")
    .select("team_id,name,position,who,status,created_at")
    .eq("year", year).in("status", MINISTRY_ROSTER)
    .order("created_at", { ascending: true });
  for (const r of ((served ?? []) as any[])) {
    const line = ministryMemberLine(r);
    if (!line) continue;
    const k = Number(r.team_id);
    if (!roster.has(k)) roster.set(k, []);
    roster.get(k)!.push(line);
  }

  return {
    ok: true,
    year,
    period: { open: cfg.open, close: cfg.close, isOpen: cfg.isOpen },
    list: (data ?? []).map((r: any) => ({
      id: r.id, committee: r.committee, group: r.group_name, team: r.team,
      appoint: r.kind === "appoint",
      sched: ministryHtml(r.schedule_note, 160),
      desc: ministryHtml(r.desc_note, 400),
      capacity: ministryHtml(r.capacity_note, 80),
      // 사역 담당자(문의처) — 그냥 글자다. 화면에서 「섬기는 분」 위에 보인다(2026-09-18 성도님).
      leader: ministryHtml(r.leader_note, 200),
      // 「지금 섬기는 분」 — 관리자가 적어 둔 분들 + 담당자가 접수완료한 신청자
      members: [ministryHtml(r.members_note, 1200), (roster.get(Number(r.id)) ?? []).join("<br>")]
        .filter(Boolean).join("<br>"),
      // ⚠️ 관리자 편집기는 **이것만** 고친다. 위 members 를 되돌려 저장하면
      //    자동 명단이 members_note 에 굳어 중복되고, 미채택된 분 이름도 영영 남는다.
      membersNote: ministryHtml(r.members_note, 1200),
      opt: r.option_note,
      // 필터용 — ⚠️ 구간(6~9 …)으로 바꾸지 않고 **시각 그대로** 내보낸다.
      //    구간은 화면이 묶는다. 그래야 구간을 다시 그어도 서버·부서를 안 건드린다.
      //    비어 있음 = 「모름」이다: 요일 셋이 다 false 면 화면이 「정해진 날 없음」으로,
      //    시각이 비면 「때마다 다름」으로 다룬다(숨기지 않는다).
      // ⚠️ 금요일을 따로 둔다 — 금요성령집회·행복전도대(금)처럼 금요일 사역이 많은데
      //    「평일」로 뭉뚱그리면 금요일만 되는 분이 골라 찾을 수 없다.
      //    그래서 여기의 week 는 **금요일을 뺀 평일**이다.
      day: { sun: !!r.day_sun, fri: !!r.day_fri, sat: !!r.day_sat, week: !!r.day_week },
      // ⚠️ 주기는 **여럿일 수 있다**(매주 또는 격주인 팀이 있다). 한 칸 text 였던 것을
      //    네 칸으로 나눴다 — 요일과 같은 모양이라 화면도 같은 방식으로 다룬다.
      freq: ministryFreqOf(r),
      // ⚠️ 시각은 **주일 사역에만** 있다(성도님 결정 2026-09-10). DB 제약
      //    ministry_catalog_time_sun_chk 가 같은 규칙을 지킨다.
      from: r.time_from || "", to: r.time_to || "",
    })),
  };
}
```
반환값: `{ ok, year, period{open,close,isOpen}, list[] }`. `list`의 각 항목은
`id,committee,group,team,appoint,sched,desc,capacity,leader,members,membersNote,opt,day{sun,fri,sat,week},freq{weekly,biweekly,monthly,adhoc},from,to`.
`user_id`는 어디에도 없다.

### 1.5 `ministryHtml` — 저장·조회 양쪽에서 거치는 XSS 필터(관리자만 넣을 수 있는 꾸밈 HTML)

`ministryCatalog`가 `sched/desc/capacity/leader/membersNote`를 내려줄 때, `ministryCatalogSave`가 저장할
때 **양쪽 다** 이 필터를 거친다. 저장할 때만 거르면 옛 시드(엑셀)로 들어온 값이 안 걸러진다.

`index.ts:4799-4814`(허용 태그·의도 주석):
```ts
// 사역 설명은 **꾸밈(HTML)을 허용한다** — 관리자만 넣기 때문이다(성도님 지시, 2026-09-08).
// ⚠️ 다만 아무 태그나 통과시키지는 않는다. 이 글은 성도님 **모두의 화면**에서 렌더되므로,
//    관리자 비번이 한 번 새면 그대로 저장형 XSS 가 된다. 그래서 꾸밈에 쓰는 태그와
//    style 속성만 남기고 나머지는 서버가 지운다(스크립트·이벤트 핸들러·링크·이미지 전부).
//    ⚠️ 저장할 때와 내려줄 때 **양쪽에서** 거른다 — 엑셀 시드로 들어온 값도 거쳐야 한다.
const MIN_POSITIONS = new Set(
  ["성도", "집사", "권사", "안수집사", "장로", "전도사", "목사", "사모", "학생"]);

const MIN_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "br", "span", "small", "mark"]);
const MIN_STYLE_OK = /^(color|background-color|font-weight|font-size|text-decoration)$/;
```
(`MIN_POSITIONS`은 이 화면에서 직접 쓰이지 않는다 — 신청/종이 명단 쪽 헬퍼다. `docs/port/ministry-paper-legacy.md` 참고.)

`index.ts:4816-4831`:
```ts
function ministryStyleAttr(attrs: string): string {
  const m = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs || "");
  const raw = m ? (m[2] ?? m[3] ?? "") : "";
  const out: string[] = [];
  for (const part of raw.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    // ⚠️ 따옴표·백틱·역슬래시를 지운다 — 남기면 style="..." 을 닫고 속성을 새로 연다
    const v = part.slice(i + 1).trim().replace(/["'`\\]/g, "");
    if (!MIN_STYLE_OK.test(k)) continue;
    if (/[<>()]|url|expression|javascript/i.test(v)) continue;   // url(...)·javascript: 차단
    out.push(k + ":" + v.slice(0, 40));
  }
  return out.join(";").slice(0, 160);
}

// 잘린 자리에 열린 채 남은 태그를 닫아 준다 — 안 닫으면 뒤 내용까지 물든다
function ministryCloseTags(html: string): string {
  const stack: string[] = [];
  const re = /<(\/?)([a-z]+)[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const t = m[2];
    if (t === "br") continue;
    if (m[1]) { const i = stack.lastIndexOf(t); if (i >= 0) stack.splice(i, 1); }
    else stack.push(t);
  }
  let out = html;
  for (let i = stack.length - 1; i >= 0; i--) out += "</" + stack[i] + ">";
  return out;
}

// ⚠️ 자르기는 **태그 밖에서만** 한다. 예전엔 그냥 slice 라 <span style="co 처럼
//    속성 한가운데가 잘려, 뒤에 이어 붙는 명단이 통째로 속성값으로 삼켜졌다.
function ministryCut(html: string, max: number): string {
  if (html.length <= max) return html;
  let out = html.slice(0, max);
  const l = out.lastIndexOf("<");
  if (l >= 0 && out.indexOf(">", l) < 0) out = out.slice(0, l);   // 태그 조각은 버린다
  return ministryCloseTags(out);
}

// 자리표 — 입력에서 **먼저 지우므로** 관리자가 이 글자를 쳐 넣어도 섞이지 않는다
const MIN_L = "%%mLT%%";
const MIN_R = "%%mGT%%";
```

`index.ts:4863-4892`:
```ts
// ⚠️ **걸러 내지 않고 다시 지어 낸다.** 예전엔 허용 밖 태그를 지우는 식이었는데,
//    태그 정규식이 닫는 > 를 요구해서 `<img src=x onerror="…"` 처럼 > 를 뺀 문자열이
//    한 글자도 안 바뀌고 나갔다. 그리고 앱이 '<span…>' + 값 + '</span>' 로 감싸거나
//    명단을 <br> 로 이어 붙이면서 **빠진 > 를 대신 채워** 태그를 완성시켰다
//    (2026-09-09 감사에서 실제 실행으로 확인 — onerror 가 돌았다).
//    이제 허용 태그를 자리표로 옮긴 뒤 **남은 꺾쇠를 전부 글자로** 만든다.
function ministryHtml(raw: unknown, max = 400): string {
  let s = String(raw ?? "").split(MIN_L).join("").split(MIN_R).join("");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // ① 허용 태그만 자리표로 옮긴다
  s = s.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/g, (_m, close, tag, attrs) => {
    const t = String(tag).toLowerCase();
    if (!MIN_TAGS.has(t)) return "";          // 허용 밖이면 태그만 지운다(글자는 남는다)
    if (close) return MIN_L + "/" + t + MIN_R;
    if (t === "br") return MIN_L + "br" + MIN_R;
    const st = ministryStyleAttr(String(attrs || ""));
    return MIN_L + t + (st ? ' style="' + st + '"' : "") + MIN_R;
  });

  // ② 남은 꺾쇠는 태그가 아니다 — 글자로 만든다. 여기가 막힌 구멍이다.
  // ⚠️ & 는 건드리지 않는다. 이 함수는 **저장할 때와 읽을 때 두 번** 걸리므로
  //    & 를 &amp; 로 바꾸면 읽을 때마다 겹쳐 쌓인다(&lt; → &amp;lt; → &amp;amp;lt;).
  //    태그를 만드는 것은 꺾쇠뿐이고, 실체 참조로 디코드된 글자는 마크업이 되지 않는다.
  s = s.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ③ 자리표를 진짜 꺾쇠로 되돌린다
  s = s.split(MIN_L).join("<").split(MIN_R).join(">");
  return ministryCut(s, max);
}
```

### 1.6 「② 언제」 필터 칸 헬퍼 — `MINISTRY_FREQ_KEYS`/`MINISTRY_FREQ_COLS`/`ministryFreqOf`/`ministryTimeIn`

`index.ts:4900-4907`:
```ts
// 주기 네 칸 — 화면·양식·시드가 모두 이 이름을 쓴다(supabase/ministry_when_v2.sql).
// ⚠️ 옛 `freq` text 한 칸은 **DB 에서 지웠다.** 「같은 뜻이 두 곳」이면 조용히 갈라진다.
const MINISTRY_FREQ_KEYS = ["weekly", "biweekly", "monthly", "adhoc"] as const;
const MINISTRY_FREQ_COLS = MINISTRY_FREQ_KEYS.map((k) => "freq_" + k).join(",");
const ministryFreqOf = (r: any) => ({
  weekly: !!r.freq_weekly, biweekly: !!r.freq_biweekly,
  monthly: !!r.freq_monthly, adhoc: !!r.freq_adhoc,
});
```

`index.ts:4909-4919`:
```ts
// 'H:MM' 도 받아 'HH:MM' 로 맞춘다. 못 알아보면 까닭을 돌려준다 —
// ⚠️ 조용히 null 로 만들면 관리자는 넣었다고 믿는데 화면에서는 「때마다 다름」이 된다.
function ministryTimeIn(v: unknown, label: string): { v: string | null; err?: string } {
  const t = norm(v);
  if (!t) return { v: null };
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return { v: null, err: label + "은(는) 09:00 꼴로 넣어 주세요" };
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return { v: null, err: label + "이(가) 00:00~23:59 밖입니다" };
  return { v: String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0") };
}
```

### 1.7 `ministryCatalogSave` — 설명 네 칸 + 「② 언제」 고치기(**관리자만**)

`index.ts:4921-4985`:
```ts
async function ministryCatalogSave(b: any) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const id = Number(b.id) || 0;
  if (!id) return { ok: false, error: "id 필요" };
  // ⚠️ **보내온 칸만** 고친다 — 옛 admin 화면을 물고 있는 브라우저가 저장 한 번에 다른 칸을
  //    비우는 일을 막고, 한 칸만 고치는 도구(담당 한 줄 채우기 같은)도 나머지를 안 지운다.
  const patch: Record<string, unknown> = {};
  for (const [key, max] of [["schedule_note", 160], ["desc_note", 400],
                            ["capacity_note", 80], ["members_note", 1200],
                            ["leader_note", 200]] as [string, number][]) {
    if (key in b) patch[key] = ministryHtml((b as any)[key], max);
  }
  // ── 「② 언제」 ────────────────────────────────────────────────
  // ⚠️ **보내온 칸만** 고친다. 늘 넣도록 짜면, 옛 admin 화면을 물고 있는 브라우저가
  //    저장 한 번에 이 칸들을 통째로 비운다(캐시가 남는 것을 막을 길이 없다).
  for (const c of ["day_sun", "day_fri", "day_sat", "day_week",
                   ...MINISTRY_FREQ_KEYS.map((k) => "freq_" + k)]) {
    if (c in b) patch[c] = !!b[c];
  }
  for (const [key, label] of [["time_from", "시작 시각"], ["time_to", "끝 시각"]]) {
    if (!(key in b)) continue;
    const r = ministryTimeIn(b[key], label);
    if (r.err) return { ok: false, error: r.err };
    patch[key] = r.v;
  }
  // ⚠️ **시각은 주일에만** 남긴다(성도님 결정 2026-09-10). 주일을 끄면서 시각을 그대로
  //    두면 DB 제약(ministry_catalog_time_sun_chk)에 걸려 **저장이 통째로 실패**한다 —
  //    관리자에게는 까닭 없는 오류로 보인다. 여기서 미리 비운다.
  // ⚠️ 「보내온 칸만」 규칙 때문에 day_sun 이 이번 요청에 없을 수 있다. 그때는
  //    **DB 에 있는 값**을 봐야 한다 — 안 그러면 시각만 고치는 저장이 매번 지워진다.
  let sunOn: boolean;
  if ("day_sun" in b) {
    sunOn = !!b.day_sun;
  } else {
    const { data: cur } = await db.from("ministry_catalog")
      .select("day_sun").eq("id", id).maybeSingle();
    sunOn = !!(cur && cur.day_sun);
  }
  if (!sunOn) { patch.time_from = null; patch.time_to = null; }
  // ⚠️ 말없이 자르면 관리자가 넣은 이름이 조용히 사라진다 — 잘린 칸을 돌려준다
  // ⚠️ **이번에 보낸 칸만** 견준다 — 안 보낸 칸을 재려다 undefined.length 로 500 이 났다(2026-09-18).
  const cut: string[] = [];
  for (const [key, label] of [["schedule_note", "시간"], ["desc_note", "하는 일"],
                              ["capacity_note", "필요 인원"], ["members_note", "지금 섬기는 분"],
                              ["leader_note", "담당(문의)"]] as [string, string][]) {
    if (!(key in patch)) continue;
    if (ministryHtml((b as any)[key], 99999).length > String(patch[key] ?? "").length) cut.push(label);
  }

  const { data, error } = await db.from("ministry_catalog")
    .update(patch).eq("id", id)
    .select("id,committee,team,schedule_note,desc_note,capacity_note,members_note,leader_note,"
      + "day_sun,day_fri,day_sat,day_week,time_from,time_to," + MINISTRY_FREQ_COLS).single();
  if (error) throw error;
  // 걸러진 뒤의 값을 돌려준다 — 화면이 「내가 친 것」이 아니라 「실제 저장된 것」을 보여야 한다
  return { ok: true, id: data.id, team: data.team,
           sched: data.schedule_note, desc: data.desc_note, capacity: data.capacity_note,
           membersNote: data.members_note, leader: data.leader_note ?? "", truncated: cut,
           // 저장된 값을 그대로 돌려준다 — 화면이 「내가 친 것」이 아니라 「실제」를 보게
           // (주일을 끄면 시각이 비어 돌아온다 — 화면이 그걸 보고 칸을 비운다)
           day: { sun: !!data.day_sun, fri: !!data.day_fri,
                  sat: !!data.day_sat, week: !!data.day_week },
           freq: ministryFreqOf(data),
           from: data.time_from || "", to: data.time_to || "" };
}
```
고칠 수 있는 칸은 **설명 네 칸(schedule_note/desc_note/capacity_note/members_note) + 담당 한 줄(leader_note)
+ 「② 언제」 열 칸(day_sun/day_fri/day_sat/day_week/freq_weekly/freq_biweekly/freq_monthly/freq_adhoc/time_from/time_to)**뿐이다.
`committee`·`team`·`group_name`·`kind`·`sort_order`는 이 액션으로 바꿀 수 없다(팀 추가·삭제·이름 변경·차례는
엑셀 시드와 `ministryCatalogOrder` 몫 — 성도님 결정 2026-09-10).

### 1.8 `ministryCatalogOrder` — 같은 위원회 안에서 차례 바꾸기(**관리자만**)

`index.ts:4987-5022`:
```ts
// 한 위원회 안에서 보이는 차례를 바꾼다.
// ⚠️ **그 줄들이 이미 갖고 있던 sort_order 값을 모아 다시 나눠 준다.** 0,1,2… 로 새로
//    매기면 그 위원회가 목록 맨 앞으로 통째로 올라가 버린다 — 자리는 그대로 두고
//    누가 어느 자리에 앉는지만 바꾸는 것이다.
// ⚠️ 팀 추가·삭제·이름은 여기서 하지 않는다(성도님 결정 2026-09-10 — 그쪽 원본은
//    부서 확인 엑셀이다). 여기서 만들면 엑셀과 DB 가 갈라지고, 다음 시드에 지워진다.
async function ministryCatalogOrder(b: any) {
  const err = await ministryAdminError(b); if (err) return { ok: false, error: err };
  const ids: number[] = Array.isArray(b.ids) ? b.ids.map(Number).filter((n: number) => n > 0) : [];
  if (!ids.length) return { ok: false, error: "순서를 바꿀 팀이 없습니다" };
  if (new Set(ids).size !== ids.length) return { ok: false, error: "같은 팀이 두 번 들어 있습니다" };

  const { data, error } = await db.from("ministry_catalog")
    .select("id,year,committee,sort_order").in("id", ids);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length !== ids.length) return { ok: false, error: "없는 팀이 섞여 있습니다" };
  if (new Set(rows.map((r) => r.committee + "|" + r.year)).size !== 1) {
    return { ok: false, error: "한 위원회 안에서만 차례를 바꿀 수 있습니다" };
  }
  // ⚠️ 위원회 전체가 와야 한다 — 일부만 보내면 보내지 않은 줄의 자리를 빼앗는다
  const { count } = await db.from("ministry_catalog")
    .select("id", { count: "exact", head: true })
    .eq("year", rows[0].year).eq("committee", rows[0].committee);
  if ((count ?? 0) !== ids.length) {
    return { ok: false, error: "그 위원회의 팀이 " + count + "개인데 " + ids.length + "개만 왔습니다" };
  }

  const slots = rows.map((r) => Number(r.sort_order)).sort((a, b2) => a - b2);
  for (let i = 0; i < ids.length; i++) {
    const { error: e2 } = await db.from("ministry_catalog")
      .update({ sort_order: slots[i] }).eq("id", ids[i]);
    if (e2) throw e2;
  }
  return { ok: true, n: ids.length };
}
```
검증 3단계: ① 보낸 id 전부가 실제 존재 ② 전부 **같은 위원회·같은 연도** ③ 보낸 개수가 그 위원회의
**전체** 팀 수와 정확히 같음(부분만 보내면 안 보낸 줄의 자리를 도둑맞는다). 반환값은 `{ok:true, n}`뿐 —
갱신된 목록을 다시 안 주므로 화면이 로컬 `mcRows`를 낙관적으로 바로 반영한다(아래 2.6/2.8).

### 1.9 공용 헬퍼 — 이름만(다른 곳에서 이미 정의, 이 화면이 참조)

- `norm`(`index.ts:152`) — 문자열 트림+공백정규화.
- `db`(Supabase 서비스롤 클라이언트), `json()` 응답 래퍼 — 모든 액션 공통.

### 1.10 DB — `ministry_catalog` 테이블 정의(원본 + 마이그레이션, verbatim)

원본 생성(`supabase/ministry.sql:21-48`):
```sql
-- ============================================================
-- 1) 사역팀 목록 — 성도가 고르는 대상
--    자료는 ministry/ministry_catalog_2027.json(부서 확인 확정본)에서 온다.
--    INSERT 문은 tools/ministry-seed-sql.py 가 만들어 준다(손으로 적지 않는다).
-- ============================================================
create table if not exists public.ministry_catalog (
  id            bigserial   primary key,
  year          int         not null,
  committee     text        not null,              -- 위원회/부서
  group_name    text        not null default '',   -- 중분류(없으면 빈 문자열)
  team          text        not null,              -- 사역팀명
  kind          text        not null default 'apply',  -- apply=신청 / appoint=임명직
  schedule_note text        not null default '',   -- 사역 시간·요일
  desc_note     text        not null default '',   -- 하는 일 한 줄
  capacity_note text        not null default '',   -- 필요 인원(참고용 — 신청을 막지 않는다)
  option_note   text        not null default '',   -- 하위 선택 안내(어와나 택1 등)
  sort_order    int         not null default 0,    -- 화면에 뿌리는 순서(JSON 순서 그대로)
  created_at    timestamptz not null default now(),
  unique (year, committee, group_name, team)
);

create index if not exists ministry_catalog_year_idx
  on public.ministry_catalog (year, sort_order);

alter table public.ministry_catalog drop constraint if exists ministry_catalog_kind_chk;
alter table public.ministry_catalog add constraint ministry_catalog_kind_chk
  check (kind in ('apply', 'appoint'));

-- ⚠️ 표를 만들면 그 자리에서 RLS를 켠다. event_entries 가 이걸 빠뜨려
--    user_id 47건이 공개 키로 읽혔다. 정책 없이 켜면 기본 차단이고,
--    Edge Function(service_role)만 읽고 쓴다.
alter table public.ministry_catalog enable row level security;
```

마이그레이션 ①「② 언제」 필터 칸 1차(`supabase/ministry_filter_cols.sql`, 전문 39줄):
```sql
-- 사역신청 — 필터용 칸 (2026-09-10)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영에 올린다.
--
-- 88팀을 위원회 아코디언만으로 훑기 어려워 필터를 넣는다(ministry/2027_사역신청_필터안.html).
-- 축 셋: 언제(요일) · 얼마나 자주(주기) · 몇 시쯤(시각).
--
-- ⚠️ **받는 것은 시각, 묶는 것은 화면.** 구간(6~9, 8~11 …)을 DB 에 넣지 않는다 —
--    구간은 나중에 다시 그을 수 있어야 하고, 그때 부서에 두 번 묻지 않으려면
--    시각 그대로 갖고 있어야 한다.
--
-- ⚠️ **비어 있음은 「모름」이지 「해당 없음」이 아니다.** 요일 셋이 다 false 면 화면에서
--    「정해진 날 없음」으로, 시각이 비면 「때마다 다름」으로 보인다.
--    부서가 아무것도 안 적어도 그 팀이 필터에서 사라지지 않게 하는 것이 핵심이다 —
--    「미기입 = 제외」로 짜면 회신율이 곧 실종률이 된다.

alter table public.ministry_catalog
  add column if not exists day_sun   boolean not null default false,  -- 주일에 하나
  add column if not exists day_week  boolean not null default false,  -- 평일에 하나
  add column if not exists day_sat   boolean not null default false,  -- 토요일에 하나
  add column if not exists time_from text,                            -- 'HH:MM' 모이는 시각
  add column if not exists time_to   text,                            -- 'HH:MM' 마치는 시각
  add column if not exists freq      text;                            -- 한 사람이 서는 주기

-- ⚠️ 「팀이 모이는 주기」가 아니라 **한 사람이 서는 주기**다. 당번을 나눠 도는 팀은
--    팀은 매주라도 한 사람은 격주다 — 성도님이 재는 것은 자기 부담이다.
alter table public.ministry_catalog drop constraint if exists ministry_catalog_freq_chk;
alter table public.ministry_catalog add constraint ministry_catalog_freq_chk
  check (freq is null or freq in ('매주', '격주', '매달', '그때그때'));

-- 시각은 'HH:MM' 24시간 꼴만 (30분 단위로 받지만 제약은 분까지 열어 둔다)
alter table public.ministry_catalog drop constraint if exists ministry_catalog_time_chk;
alter table public.ministry_catalog add constraint ministry_catalog_time_chk
  check ((time_from is null or time_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     and (time_to   is null or time_to   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'));

-- 확인
--   select team, day_sun, day_week, day_sat, time_from, time_to, freq
--     from ministry_catalog where year = 2027 limit 10;
```

마이그레이션 ②「② 언제」 재구성 — 금요일 추가 · 주기 4칸으로 분리 · 시각은 주일에만
(`supabase/ministry_when_v2.sql`, 전문 69줄, **현재 유효한 최종 규칙**):
```sql
-- 사역신청 「② 언제」 재구성 (2026-09-10, 성도님 지시)
-- ⚠️ 이 저장소는 공개(public)입니다 — 비밀번호·키를 절대 넣지 마세요.
-- ⚠️ **개발 DB(ktpwthwqzgcqcrmsafdo)에 먼저** 돌린 뒤 운영(xnomlgydifiqiybervtf).
-- ⚠️ 여러 번 돌려도 안전하다.
--
-- ⚠️⚠️ **이 SQL 을 두 DB 에 먼저 돌린 뒤에야 코드를 배포한다.** 새 코드가 이 칸들을
--    읽는데 칸이 없으면 ministryCatalog 가 통째로 실패하고 사역신청 화면이 죽는다.
--    이 저장소는 작업 트리를 여러 세션이 공유해서, **커밋하지 않아도 누가 배포하면
--    함께 나간다**(2026-09-10 psalm_frames 건이 그 사고였다).
--
-- 바뀌는 것 셋:
--   ① 요일에 **금요일**을 더한다 — 금요성령집회·행복전도대(금) 처럼 금요일 사역이
--      많은데 「평일」로 뭉뚱그리면 성도님이 금요일만 골라 찾을 수 없다.
--   ② 주기를 **여러 개 고를 수 있게** 한다(매주 또는 격주인 팀이 있다).
--      text 한 칸으로는 여럿을 담을 수 없어 네 칸으로 나눈다 — 요일과 같은 모양이다.
--   ③ 시각은 **주일에만** 받는다. 주일이 아닌 팀의 시각은 지운다.

-- ── ① 금요일 ──────────────────────────────────────────────────────
alter table public.ministry_catalog
  add column if not exists day_fri boolean not null default false;

-- ⚠️ 「평일」은 이제 **금요일을 뺀 날**을 뜻한다(화면 라벨에도 그렇게 적었다).
--    기존 자료는 금요일을 평일에 넣어 두었을 수 있으나, 어느 팀이 금요일인지
--    자료만으로는 알 수 없다 — **자동으로 옮기지 않는다.** 부서 확인 때 채워진다.
--    (지어낸 값을 사실처럼 넣지 않는다.)

-- ── ② 주기 넷 ─────────────────────────────────────────────────────
alter table public.ministry_catalog
  add column if not exists freq_weekly   boolean not null default false,  -- 매주
  add column if not exists freq_biweekly boolean not null default false,  -- 격주(교대형식)
  add column if not exists freq_monthly  boolean not null default false,  -- 매달
  add column if not exists freq_adhoc    boolean not null default false;  -- 그때그때

-- 옛 한 칸(freq)에 있던 값을 옮긴다. 이미 옮겼으면 아무 일도 안 한다.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_name = 'ministry_catalog' and column_name = 'freq') then
    -- ⚠️ coalesce 를 반드시 쓴다 — freq 가 null 이면 `false or null` 이 **null** 이 되어
    --    not null 제약에 걸린다(2026-09-10 처음 돌릴 때 실제로 막혔다).
    update public.ministry_catalog set
      freq_weekly   = freq_weekly   or coalesce(freq, '') = '매주',
      freq_biweekly = freq_biweekly or coalesce(freq, '') = '격주',
      freq_monthly  = freq_monthly  or coalesce(freq, '') = '매달',
      freq_adhoc    = freq_adhoc    or coalesce(freq, '') = '그때그때';
  end if;
end $$;

-- ⚠️ 옛 칸을 **지운다.** 남겨 두면 「같은 뜻이 두 곳」이 되어 나중에 한쪽만 고치게 된다
--    (2026-09-10 직분 목록에서 겪은 그대로 — 화면·서버·DB 셋이 갈라지면 조용히 틀린다).
alter table public.ministry_catalog drop constraint if exists ministry_catalog_freq_chk;
alter table public.ministry_catalog drop column if exists freq;

-- ── ③ 시각은 주일에만 ─────────────────────────────────────────────
-- 먼저 주일이 아닌 팀의 시각을 비운다(아래 제약이 걸리려면 먼저 정리돼야 한다).
update public.ministry_catalog
   set time_from = null, time_to = null
 where not day_sun and (time_from is not null or time_to is not null);

-- ⚠️ 규칙을 **DB 에도** 새긴다. 코드에만 두면 다음 사람이 서버를 고칠 때 조용히 깨진다.
alter table public.ministry_catalog drop constraint if exists ministry_catalog_time_sun_chk;
alter table public.ministry_catalog add constraint ministry_catalog_time_sun_chk
  check (day_sun or (time_from is null and time_to is null));

-- 확인
--   select team, day_sun, day_fri, day_sat, day_week,
--          freq_weekly, freq_biweekly, freq_monthly, freq_adhoc, time_from, time_to
--     from ministry_catalog where year = 2027 order by sort_order limit 10;
--   select count(*) from ministry_catalog where not day_sun and time_from is not null;  -- 0 이어야 한다
```
⚠️ **`ministry_catalog_time_chk`(마이그레이션 ①의 정규식 제약)는 지워지지 않고 그대로 남는다** —
②는 `ministry_catalog_freq_chk`만 지우고 `time_chk`는 건드리지 않는다(발견 사항, 코드로 확인). 즉
현재 시각 칸에는 **정규식 형식 제약(HH:MM) + 주일 종속 제약(`time_sun_chk`)이 함께** 걸려 있다.

마이그레이션 ③ 「지금 섬기는 분」 자동/수동 명단 칸(`supabase/ministry_position_members.sql`, 전문 32줄 —
직분(`position`) 부분은 `ministry_orders` 소속이라 `docs/port/ministry-paper-legacy.md` 참고, 여기서는
`members_note` 부분만 관련):
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

마이그레이션 ④ 담당(문의) 한 줄 + 종이 표시(`supabase/ministry_paper_leader.sql`, 전문 37줄 — `source`는
`ministry_orders` 소속이라 종이 명단 문서 참고, 여기서는 `leader_note` 부분만 관련):
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

**`ministry_catalog` 논리 스키마 현재 상태(위 이력을 합성)**:
`id bigserial pk · year int not null · committee text not null · group_name text not null default '' ·
team text not null · kind text not null default 'apply' (CHECK: apply/appoint) · schedule_note/desc_note/
capacity_note/option_note text not null default '' · sort_order int not null default 0 ·
day_sun/day_fri/day_sat/day_week boolean not null default false · time_from/time_to text
(CHECK: 'HH:MM' 정규식 + `day_sun` 이어야만 non-null) · freq_weekly/freq_biweekly/freq_monthly/freq_adhoc
boolean not null default false(옛 `freq` text 칸·그 CHECK 는 삭제됨) · members_note text · leader_note text ·
created_at timestamptz default now() · unique(year,committee,group_name,team) · index(year,sort_order) ·
RLS enabled(서비스 롤만 접근)`.

시드/샘플(스키마 변경 없음, 참고만 — `grep` 결과 DDL 없음): `supabase/ministry_sample_notes.sql`(샘플 설명
채워넣기) · `supabase/ministry_seed_2027.sql`(94팀 INSERT, `tools/ministry-seed-sql.py` 산출물) ·
`supabase/ministry_testdata.sql` · `supabase/ministry_filter_sample.sql` — 전부 INSERT/UPDATE 데이터
문이며 CREATE/ALTER 문은 없다(확인 완료, verbatim 옮기지 않음).

---

## 2. 화면 (`admin-stats.html`) — 🗂️ 사역팀 정보

### 2.0 상태·전역 변수

`admin-stats.html:4513-4525`:
```js
// ---------- 🗂️ 사역팀 정보 (시간·하는 일·필요 인원) ----------
// ⚠️ 성도 화면에 「이름만」 뜨면 무엇을 하는 사역인지 알 수 없어 신청 자체가 어렵다
//    (기획(안)이 「가장 큰 문제」로 적은 자리). 부서 회신을 기다리는 동안 담당자가
//    아는 것부터 여기서 채운다.
// ⚠️ **팀 추가·삭제·이름 바꾸기는 여기서 하지 않는다**(성도님 결정 2026-09-10 —
//    "나머지는 엑셀에서"). 그쪽 원본은 부서 확인 엑셀 → JSON → 시드다. 여기서 만들면
//    엑셀과 DB 가 갈라지고, 다음 시드에 조용히 지워진다.
//    고칠 수 있는 것: 설명 네 칸 + 필터 여섯 칸 + 같은 위원회 안의 차례.
let mcRows = [];      // [{ id, committee, group, team, appoint, sched, desc, capacity,
                      //    sun, week, sat, from, to, freq, _d }]
let mcPick = "";      // 지금 보고 있는 위원회
let mcLoaded = false;
let mcOrderDirty = false;   // 차례를 바꿨는데 아직 안 보낸 상태
// 요일 넷 · 주기 넷 — **열쇠 이름이 DB 칸 이름과 짝이다**(day_sun · freq_weekly …).
// ⚠️ 한쪽만 고치면 화면은 멀쩡한데 저장이 조용히 안 걸린다(오늘 직분 목록에서 겪었다).
// ⚠️ 「평일」은 **금요일을 뺀 날**이다 — 금요 사역이 많아 따로 뺐다(성도님 지시).
const MC_DAYS = [["sun","주일",""],["fri","금요일",""],["sat","토요일",""],
                 ["week","평일","(금 제외)"]];
const MC_FREQS = [["weekly","매주",""],["biweekly","격주","(교대형식)"],
                  ["monthly","매달",""],["adhoc","그때그때",""]];
const MC_WHEN_KEYS = MC_DAYS.map(x=>x[0]).concat(MC_FREQS.map(x=>x[0]));
```

`admin-stats.html:4648-4652`(찾기·필터·펼침 상태 — `mcRender` 뒤에 선언되지만 `mcRender`가 참조한다):
```js
let mcTabsOpen = false;  // 부서 고르기를 펴 두었나(접어 두는 것이 기본)
let mcQ = "";            // 찾는 글자
let mcOnlyEmpty = false; // 설명이 비어 있는 팀만
let mcOpen = 0;          // 펼쳐 본 팀
let mcEdit = 0;          // 고치는 중인 팀(한 번에 하나)
```

### 2.1 메뉴 진입점 — `renderMinistryMenu`의 「🗂️ 사역팀 정보」 카드(범위 밖 함수지만 진입 부분만)

`admin-stats.html:1136-1143`(카드 마크업):
```html
<div class="rep-card" id="rep-mincat">
  <div class="ic">🗂️</div>
  <div class="rep-text">
    <div class="ti">사역팀 정보 (시간·하는 일)</div>
    <div class="de">성도님 화면에 보이는 설명 — 비어 있으면 이름만 보인다</div>
  </div>
  <div class="rep-arrow">›</div>
</div>
```
`admin-stats.html:1146`(바인딩, 화면 안에 두 곳에서 중복 등록됨 — 1146·1383):
```js
document.getElementById("rep-mincat").addEventListener("click", renderMinistryCatalog);
```
⚠️ **발견 사항**: `renderMinistryMenu` 함수 자체 안에서 `document.getElementById("rep-mincat")...`가
**1146행과 1383행 두 곳에** 나온다(같은 함수가 아니라 `renderMinistryMenu`가 두 벌 존재하거나, 코드 중복 —
이 문서의 조사 범위에서는 어느 쪽이 실제로 실행되는지까지는 확인하지 않았다. 포팅 시 `admin-stats.html`
전체에서 `function renderMinistryMenu` 를 검색해 실제 호출되는 한 벌만 옮길 것).

### 2.2 `renderMinistryCatalog` — 화면 뼈대·이벤트 바인딩

`admin-stats.html:4527-4600`:
```js
function renderMinistryCatalog(){
  window.scrollTo(0, 0);        // 앞 화면에서 내려둔 자리가 남지 않게(표준 v1)
  // 폰에서 **보는 일**이 먼저다(2026-09-18 성도님) — 찾기·위원회·「비어 있는 것만」을 위에 붙여 두고,
  // 긴 안내는 접어 둔다. 자세한 것은 팀을 눌렀을 때만 펼친다.
  app.innerHTML=`
    <div class="rep-head mn-top">
      <button class="back-btn" id="back">← 메뉴</button>
      <h2>🗂️ 사역팀 정보</h2>
    </div>
    <!-- 화면 전체에 대한 동작은 제목 줄 바로 아래 한 줄에만(표준 v1 ⑦).
         ⚠️ mcLoaded 캐시 때문에 지금까지는 서버 값을 다시 읽을 길이 아예 없었다. -->
    <div class="adm-acts">
      <button type="button" class="push-btn ghost" id="mc-reload">↻ 새로 불러오기</button>
    </div>
    <div class="push-card mc-panel">
      <div class="mc-head">
        <div class="mn-search mc-search">
          <span class="mn-search-ico" aria-hidden="true">🔍</span>
          <input type="search" id="mc-q" placeholder="팀 · 부서 · 담당자 · 하는 일" autocomplete="off">
        </div>
        <!-- ⚠️ 부서 칩을 옆으로 미는 줄(가로 스크롤)로 두었더니 **뒤쪽 부서가 있는지도 모른다**
             (2026-09-18 성도님) — 접어 두고 펴서 고른다. 고르면 저절로 접힌다. -->
        <button type="button" class="mc-pick" id="mc-pick-t" aria-expanded="false" aria-controls="mc-tabs">
          <span class="mc-pick-l">부서</span>
          <b id="mc-pick-n">전체</b>
          <span class="mc-pick-x" aria-hidden="true">▾</span>
        </button>
      </div>
      <div class="mc-head-b">
        <label class="mc-only"><input type="checkbox" id="mc-empty"> 비어 있는 것만</label>
        <span id="mc-found" class="mc-found"></span>
      </div>
      <!-- 펼치는 것은 붙는 머리 **밖**에(표준 v1 ⑧) — 펴면 일곱 줄이라 머리가 화면을 먹는다 -->
      <div id="mc-tabs" class="mc-tabs" hidden></div>
      <div id="mc-sum" class="mc-sum"></div>
      <div id="mc-bar"></div>
      <details class="mc-guide">
        <summary>📌 적는 법 · 주의할 것</summary>
        <p class="mc-help">성도님 화면에서 팀 이름 아래 작게 보이는 설명입니다.
          <b>비어 있으면 이름만 보입니다</b> — 무엇을 하는 사역인지 알 수 없어 고르기 어렵습니다.<br>
          <b>「② 언제」 여섯 칸</b>은 성도님이 <b>필터로 사역을 찾을 때</b> 쓰입니다 —
          비워 두면 「정해진 날 없음 · 때마다 다름」으로 보입니다(목록에서 사라지지는 않습니다).<br>
          팀을 눌러 <b>고치기</b>를 누르면 입력칸이 열리고, ▲▼로 <b>같은 부서 안의 차례</b>를 바꿉니다.
          ⚠️ 팀을 <b>더하거나 지우거나 이름을 바꾸는 것은 부서 확인 엑셀</b>에서 합니다 —
          여기서 만들면 다음에 목록을 다시 심을 때 지워집니다.<br>
          <span class="mc-tags">꾸밈을 넣을 수 있습니다 —
            <code>&lt;b&gt;굵게&lt;/b&gt;</code>
            <code>&lt;span style="color:#c0392b"&gt;색&lt;/span&gt;</code>
            <code>&lt;br&gt;</code>
            <code>&lt;u&gt;</code> <code>&lt;em&gt;</code> <code>&lt;mark&gt;</code>.
            ⚠️ 그 밖의 태그(스크립트·이미지·링크)는 서버가 지웁니다.</span></p>
      </details>
      <p id="mc-msg" class="mc-msg" hidden></p>
      <div id="mc-list"><p class="msg">불러오는 중...</p></div>
    </div>`;
  document.getElementById("back").addEventListener("click", renderMenu);
  document.getElementById("mc-q").addEventListener("input", e=>{
    mcQ=e.target.value.trim(); mcOpen=0; mcEdit=0; mcRender();
  });
  document.getElementById("mc-empty").addEventListener("change", e=>{
    mcOnlyEmpty=e.target.checked; mcOpen=0; mcEdit=0; mcRender();
  });
  // ⚠️ 고치던 것이 있으면 묻고 버린다 — 부서를 바꿀 때와 같은 관문(표준 v1 ⑦)
  document.getElementById("mc-reload").addEventListener("click", async ()=>{
    mcSyncInputs();
    if((mcOrderDirty || mcRows.some(r=>r._d)) && !(await mnDialog({ icon:"↻", title:"저장하지 않은 것이 있어요",
      tone:"danger", html:"고치던 내용을 버리고 서버에서 다시 불러올까요?", ok:"버리고 불러오기", cancel:"그대로 두기" }))) return;
    mcOrderDirty=false; mcLoaded=false; mcOpen=0; mcEdit=0; mcLoad();
  });
  document.getElementById("mc-pick-t").addEventListener("click", ()=>{
    mcTabsOpen=!mcTabsOpen; mcSyncTabs();
  });
  mcLoad();
}
```
⚠️ **`logoutBtn.hidden=false`가 없다**(발견 사항) — 다른 사역신청 화면(`renderMinistryAdmin`
`admin-stats.html:3945`·`renderMinistryPaper` `3765`·`renderMinistryMenu` `1102`)은 모두 이 줄로 로그아웃
단추를 보이게 하는데 `renderMinistryCatalog`만 빠져 있다. 포팅 시 의도적 생략인지 실수인지 원본 동작을
그대로 재현할지 결정할 것(로그아웃 단추가 이 화면에서만 안 보일 수 있다).

### 2.3 서버 조회 — `mcLoad`

`admin-stats.html:4602-4620`:
```js
async function mcLoad(){
  const box=document.getElementById("mc-list"); if(!box) return;
  if(!mcLoaded){
    const d=await callApi({ action:"ministryCatalog" }).catch(()=>({ok:false,error:"network"}));
    if(!d.ok){ box.innerHTML=`<p class="msg err">목록을 불러오지 못했습니다: ${plEsc(d.error||"오류")}</p>`; return; }
    mcRows=(d.list||[]).map(x=>({ id:x.id, committee:x.committee, group:x.group||"", team:x.team,
      appoint:!!x.appoint, sched:x.sched||"", desc:x.desc||"", capacity:x.capacity||"",
      members:x.membersNote||"",       // ⚠️ x.members 는 자동 명단이 섞인 것 — 저장하면 굳는다
      leader:x.leader||"",
      sun:!!(x.day&&x.day.sun), fri:!!(x.day&&x.day.fri),
      sat:!!(x.day&&x.day.sat), week:!!(x.day&&x.day.week),
      weekly:!!(x.freq&&x.freq.weekly), biweekly:!!(x.freq&&x.freq.biweekly),
      monthly:!!(x.freq&&x.freq.monthly), adhoc:!!(x.freq&&x.freq.adhoc),
      from:x.from||"", to:x.to||"" }));
    // 처음에는 「전체」다(2026-09-18) — 폰에서는 부서를 고르기보다 찾기부터 쓴다.
    mcLoaded=true;
  }
  mcRender();
}
```
⚠️ 이 호출은 `pw`/`staff`를 **보내지 않는다** — 1.4절대로 `ministryCatalog` 액션 자체가 공개다.
`mcLoaded` 캐시가 true인 동안은 재조회하지 않고(「↻ 새로 불러오기」로만 강제 재조회), 응답의
`x.members`(자동 명단 섞인 합본)가 아니라 **`x.membersNote`(관리자가 직접 넣은 원본)** 를 편집 상태에 싣는다.

### 2.4 채움 개수 집계 — `mcCounts`

`admin-stats.html:4625-4639`:
```js
// ⚠️ 셈을 두 군데서 따로 쓰면 갈라진다 — 한 곳에서만 그린다
function mcCounts(){
  const apply=mcRows.filter(r=>!r.appoint);
  const filled=apply.filter(r=>r.sched||r.desc).length;
  const when=apply.filter(mcHasWhen).length;
  const sum=document.getElementById("mc-sum");
  if(sum) sum.innerHTML=`설명 <b>${filled}</b> / ${apply.length}팀
    &nbsp;·&nbsp; 언제 <b>${when}</b> / ${apply.length}팀
    <span class="mc-rest">${apply.length-filled}팀은 아직 이름만 보입니다</span>`;
  const tab=document.querySelector(`.mc-tab.on em`);
  if(tab){
    const mine=mcRows.filter(x=>x.committee===mcPick&&!x.appoint);
    tab.textContent=`${mine.filter(x=>x.sched||x.desc).length}/${mine.length}`;
  }
}
```
`mcHasWhen`(`admin-stats.html:4623`): `function mcHasWhen(r){ return MC_WHEN_KEYS.some(k=>r[k]) || !!r.from || !!r.to; }`
— 「② 언제」 여덟 체크박스 중 하나라도 켜져 있거나 시각이 있으면 "채움"으로 센다.

`mcNote`(`admin-stats.html:4641`): `function mcNote(t){ if(t) mnNote(t); }` — `mnNote`(공용, 신청현황과
공유)를 감싸는 한 줄짜리 래퍼. 표준 v1 ⑰의 "결과 안내는 한 자리·한 꼴" 규칙을 따른다.

### 2.5 카드용 표시 헬퍼 — `mcWhenText` / `mcEmpty` / `mcHit` / `mcLine` / `mcSyncTabs`

`admin-stats.html:4655-4685`:
```js
// 「② 언제」를 사람 말로 — 카드 한 줄에 들어갈 만큼만
function mcWhenText(r){
  const days=[[ "sun","주일" ],[ "fri","금" ],[ "sat","토" ],[ "week","평일" ]]
    .filter(([k])=>r[k]).map(([,t])=>t).join("·");
  const freq=[[ "weekly","매주" ],[ "biweekly","격주" ],[ "monthly","매달" ],[ "adhoc","그때그때" ]]
    .filter(([k])=>r[k]).map(([,t])=>t).join("·");
  const time=r.from||r.to ? (r.from||"")+"~"+(r.to||"") : "";
  return [days, time, freq].filter(Boolean).join(" ");
}
function mcEmpty(r){ return !r.appoint && !r.sched && !r.desc; }
function mcHit(r){
  if(!mcQ) return true;
  const q=mcQ.toLowerCase();
  return [r.team, r.committee, r.group, r.leader, r.desc, r.sched, r.capacity, r.members]
    .some(v=>String(v||"").toLowerCase().indexOf(q)>=0);
}
// 읽기 줄 하나 — 비어 있으면 회색으로 「비어 있음」(빠뜨린 칸이 보이게)
function mcLine(label, html, none){
  return `<div class="mc-r"><span class="mc-r-l">${label}</span>` +
    (html ? `<span class="mc-r-v">${html}</span>`
          : `<span class="mc-r-v none">${none||"비어 있음"}</span>`) + `</div>`;
}

// 부서 고르기 — 접힘/펼침과 지금 고른 부서 이름을 맞춘다
function mcSyncTabs(){
  const t=document.getElementById("mc-tabs"), btn=document.getElementById("mc-pick-t");
  if(!t||!btn) return;
  t.hidden=!mcTabsOpen;
  btn.setAttribute("aria-expanded", mcTabsOpen);
  const n=document.getElementById("mc-pick-n");
  if(n) n.textContent = mcPick || "전체";
}
```
⚠️ `mcHit`은 **부서(`mcPick`)를 넘어 항상 전체 `mcRows`에서** 검색어를 대조할 수 있는 구조다(실제로
검색 문자열이 있으면 `mcRender`가 부서 필터를 무시하도록 짜여 있다 — 아래 2.6).

### 2.6 렌더 — `mcRender`(위원회 탭 + 카드 목록)

`admin-stats.html:4687-4780`:
```js
function mcRender(){
  const box=document.getElementById("mc-list"); if(!box) return;
  mcCounts();

  // 위원회 고르기 — 「전체」를 앞에 두고, 채운 팀 수를 함께(어디가 비었는지 한눈에)
  const tabs=document.getElementById("mc-tabs");
  if(tabs){
    const names=[]; mcRows.forEach(r=>{ if(names.indexOf(r.committee)<0) names.push(r.committee); });
    const all=mcRows.filter(r=>!r.appoint);
    tabs.innerHTML=`<button class="mc-tab${mcPick?"":" on"}" data-mc="">전체 <em>${
      all.filter(r=>!mcEmpty(r)).length}/${all.length}</em></button>` +
      names.map(c=>{
        const mine=mcRows.filter(r=>r.committee===c&&!r.appoint);
        const got=mine.filter(r=>!mcEmpty(r)).length;
        return `<button class="mc-tab${c===mcPick?" on":""}${got===mine.length&&mine.length?" done":""}"
          data-mc="${plEsc(c)}">${plEsc(c)} <em>${got}/${mine.length}</em></button>`;
      }).join("");
    tabs.querySelectorAll("[data-mc]").forEach(b=>{
      b.addEventListener("click", async ()=>{
        // ⚠️ 옮겨만 놓고 안 보낸 차례가 있는데 말없이 버리면, 관리자는 저장된 줄 안다
        if(mcOrderDirty && !(await mnDialog({ icon:"↕️", title:"저장하지 않은 차례가 있어요", tone:"danger",
          html:"▲▼로 바꾼 차례를 아직 저장하지 않았습니다.<br>버리고 다른 부서로 옮길까요?",
          ok:"버리고 옮기기", cancel:"그대로 두기" }))) return;
        if(mcOrderDirty){ mcOrderDirty=false; mcLoaded=false; mcPick=b.dataset.mc; mcLoad(); return; }
        mcSyncInputs();
        mcPick=b.dataset.mc; mcOpen=0; mcEdit=0; mcTabsOpen=false; mcRender();
      });
    });
  }
  mcSyncTabs();

  const bar=document.getElementById("mc-bar");
  if(bar){
    bar.innerHTML = mcOrderDirty
      ? `<span>▲▼로 차례를 바꾸셨습니다. <b>보내야</b> 성도님 화면에 반영됩니다.</span>
         <button id="mc-ord-save">차례 저장</button>
         <button id="mc-ord-undo" style="background:#fff;color:#7a5f1e;border-color:#e8d6a8">되돌리기</button>` : "";
    const sv=document.getElementById("mc-ord-save");
    if(sv) sv.addEventListener("click", mcSaveOrder);
    const un=document.getElementById("mc-ord-undo");
    if(un) un.addEventListener("click", ()=>{ mcOrderDirty=false; mcLoaded=false; mcLoad(); });
  }

  // ⚠️ 찾을 때는 **위원회를 넘어 전체에서** 찾는다 — 「찬양」을 쳤는데 지금 고른 부서에만 없어서
  //    0건이 되면, 없는 줄 알고 되돌아간다(2026-09-18 실제로 그랬다).
  const inPick=mcRows.filter(r=>!mcPick || mcQ || r.committee===mcPick);
  const rows=inPick.filter(r=>mcHit(r) && (!mcOnlyEmpty || mcEmpty(r)));
  const found=document.getElementById("mc-found");
  if(found) found.innerHTML = `보이는 팀 <b>${rows.length}</b>` +
    (mcQ ? ` <i>(전체에서 찾음)</i>` : rows.length!==inPick.length ? ` <i>(${mcPick||"전체"} ${inPick.length})</i>` : "");

  if(!rows.length){
    box.innerHTML=`<p class="msg">${mcQ?`‘${plEsc(mcQ)}’에 맞는 사역팀이 없습니다.`:"보여 줄 사역팀이 없습니다."}</p>`;
    return;
  }

  box.innerHTML=rows.map((r,ri)=>{
    const open=mcOpen===r.id, edit=mcEdit===r.id;
    const when=mcWhenText(r);
    const sub=[r.sched||when, r.leader, r.capacity].filter(Boolean).join(" · ");
    const head=`<button type="button" class="mc-c-h" data-open="${r.id}" aria-expanded="${open}">
        <span class="mc-c-nm">${r.group?`<em>${plEsc(r.group)}</em>`:""}<b>${plEsc(r.team)}</b>
          ${r.appoint?`<span class="mc-tag">지명</span>`:""}
          ${mcEmpty(r)?`<span class="mc-tag empty">설명 없음</span>`:""}
          ${r._d?`<span class="mc-dot">● 저장 안 됨</span>`:""}</span>
        <span class="mc-c-x" aria-hidden="true">${open?"▾":"▸"}</span>
        ${sub?`<span class="mc-c-sub">${sub}</span>`:""}
      </button>`;
    // 펼쳐 본 모습 — 성도님 화면에 무엇이 보이는지 그대로
    const read=`<div class="mc-open">
        <!-- ⚠️ sched·desc·leader·capacity·members 는 **서버가 이미 걸러 돌려준 HTML** 이다
             (굵게·색·<br>). plEsc 로 또 싸면 태그가 글자로 보인다(2026-09-18 라이브에서 그랬다). -->
        ${mcLine("언제", r.sched || (when?plEsc(when):""), "비어 있음 — 「때마다 다름」으로 보입니다")}
        ${mcLine("찾기 칸", when?plEsc(when):"", "비어 있음 — 성도님 필터에 안 걸립니다")}
        ${mcLine("하는 일", r.desc, "비어 있음 — 이름만 보입니다")}
        ${mcLine("담당(문의)", r.leader)}
        ${mcLine("필요 인원", r.capacity)}
        ${mcLine("섬기는 분", r.members)}
        <div class="mc-open-acts">
          <button type="button" class="mc-btn" data-edit="${r.id}">✏️ 고치기</button>
          <span class="mc-ord">
            <button data-up="${r.id}"${ri===0?" disabled":""} title="위로">▲</button>
            <button data-dn="${r.id}"${ri===rows.length-1?" disabled":""} title="아래로">▼</button>
          </span>
        </div>
      </div>`;
    return `<div class="mc-card${r.appoint?" off":""}${r._d?" dirty":""}${open?" on":""}" data-row="${r.id}">
      ${head}
      ${!open ? "" : edit ? mcFormHtml(r) : read}
    </div>`;
  }).join("");

  mcWire(box);
}
```
⚠️ ▲▼(`data-up`/`data-dn`)는 **`rows`(지금 필터링된 목록) 안에서의 첫/마지막**만 비활성화한다 —
`mcMove`(2.9)는 실제로는 **부서 전체(`mcRows` 안에서 `committee` 일치)** 기준으로 이동하므로, 검색·필터로
일부만 보이는 상태에서 ▲▼를 누르면 화면에 안 보이는 형제 줄과도 자리가 바뀐다(발견 사항 — 필터 중
차례 바꾸기를 삼가야 함을 시사).

### 2.7 고치는 폼 — `mcFormHtml`

`admin-stats.html:4783-4820`:
```js
// 고치는 폼 — 펼친 팀 하나에만 그린다(그전에는 94팀이 모두 폼이었다)
function mcFormHtml(r){
  if(r.appoint) return `<div class="mc-note">지명 자리라 성도님이 고르지 않습니다 — 설명이 없어도 됩니다.</div>`;
  return `<div class="mc-in">
    <label>시간·요일<input type="text" data-f="sched" data-id="${r.id}"
      value="${plEsc(r.sched)}" placeholder="예: 매주 화 오전 10시"></label>
    <div class="mc-when">
      <span class="mc-w-t">② 언제
        <em>성도님이 이걸로 사역을 찾습니다 — 비우면 「정해진 날 없음 · 때마다 다름」</em></span>
      <span class="mc-w-r"><b>요일</b>${MC_DAYS.map(([k,t,h])=>
        `<label><input type="checkbox" data-f="${k}" data-id="${r.id}"${r[k]?" checked":""}>${t}${
          h?`<i>${h}</i>`:""}</label>`).join("")}</span>
      <span class="mc-w-r"><b>주기</b>${MC_FREQS.map(([k,t,h])=>
        `<label><input type="checkbox" data-f="${k}" data-id="${r.id}"${r[k]?" checked":""}>${t}${
          h?`<i>${h}</i>`:""}</label>`).join("")}</span>
      <span class="mc-w-r mc-w-time"><b>주일 시각</b>
        <input type="time" data-f="from" data-id="${r.id}" value="${plEsc(r.from)}" step="300"${r.sun?"":" disabled"}>
        <span class="mc-w-tw">~</span>
        <input type="time" data-f="to" data-id="${r.id}" value="${plEsc(r.to)}" step="300"${r.sun?"":" disabled"}>
        <i class="mc-w-off" data-off="${r.id}"${r.sun?" hidden":""}>주일을 체크하면 넣을 수 있어요</i></span>
    </div>
    <label class="wide">하는 일<textarea data-f="desc" data-id="${r.id}" rows="2"
      placeholder="예: 주일 예배 전 주차를 안내합니다. &lt;b&gt;굵게&lt;/b&gt; 도 됩니다">${plEsc(r.desc)}</textarea></label>
    <div class="mc-prev" data-prev="${r.id}">${r.desc||"<span class='mc-none'>비어 있음 — 성도님 화면에는 이름만 보입니다</span>"}</div>
    <label>필요 인원<input type="text" data-f="capacity" data-id="${r.id}"
      value="${plEsc(r.capacity)}" placeholder="예: 10명 (선택)"></label>
    <label class="wide">담당(문의) <span class="mc-hint">성도님 화면 「하는 일」 아래에 보입니다 · 비우면 줄이 안 나옵니다</span>
      <input type="text" data-f="leader" data-id="${r.id}"
        value="${plEsc(r.leader)}" placeholder="예: 홍길동 집사 (010-1234-5678)"></label>
    <label class="wide">지금 섬기는 분 <span class="mc-hint">한 줄에 한 분씩</span>
      <textarea data-f="members" data-id="${r.id}" rows="3"
        placeholder="홍길동 집사 (화평-20)&#10;이영희 권사 (사랑-3)">${plEsc(mcLines(r.members))}</textarea>
      <span class="mc-hint">접수완료된 신청자는 여기 안 적어도 자동으로 함께 보입니다.</span></label>
    <div class="mc-in-acts">
      <button class="mc-save" data-save="${r.id}">저장</button>
      <button type="button" class="mc-btn" data-done="${r.id}">보기로</button>
    </div>
  </div>`;
}
```
⚠️ 주일 시각 두 칸은 **`r.sun`이 false면 폼 렌더 시점부터 `disabled`**로 그려진다(서버가 저장을 막는
것과 같은 규칙을 화면에서 선반영).

### 2.8 이벤트 위임 — `mcWire`

`admin-stats.html:4822-4864`:
```js
function mcWire(box){
  box.querySelectorAll("[data-open]").forEach(b=>b.addEventListener("click", ()=>{
    const id=Number(b.dataset.open);
    mcSyncInputs();
    if(mcOpen===id){ mcOpen=0; mcEdit=0; } else { mcOpen=id; mcEdit=0; }
    mcRender();
  }));
  box.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", e=>{
    e.stopPropagation(); mcEdit=Number(b.dataset.edit); mcOpen=mcEdit; mcRender();
  }));
  box.querySelectorAll("[data-done]").forEach(b=>b.addEventListener("click", e=>{
    e.stopPropagation(); mcSyncInputs(); mcEdit=0; mcRender();
  }));
  box.querySelectorAll("[data-save]").forEach(b=>
    b.addEventListener("click", ()=> mcSave(Number(b.dataset.save))));
  // ⚠️ 시각은 **주일에만** 받는다(DB 제약도 같다). 주일을 끄면 그 자리에서 칸을 잠가
  //    「넣었는데 저장되면 사라지는」 일을 없앤다. 다시 그리지 않는다 — 치던 글이 날아간다.
  box.querySelectorAll('[data-f="sun"]').forEach(ck=>{
    ck.addEventListener("change", ()=>{
      const row=ck.closest(".mc-card"); if(!row) return;
      row.querySelectorAll('input[type="time"]').forEach(t=>{
        t.disabled = !ck.checked;
        if(!ck.checked) t.value = "";
      });
      const off=row.querySelector("[data-off]"); if(off) off.hidden = ck.checked;
    });
  });
  box.querySelectorAll("[data-up]").forEach(b=>
    b.addEventListener("click", e=>{ e.stopPropagation(); mcMove(Number(b.dataset.up), -1); }));
  box.querySelectorAll("[data-dn]").forEach(b=>
    b.addEventListener("click", e=>{ e.stopPropagation(); mcMove(Number(b.dataset.dn), 1); }));
  box.querySelectorAll("[data-f]").forEach(i=>{
    // 엔터로도 저장 — 단 여러 줄을 쓰는 「하는 일」은 빼고(줄바꿈이 막힌다)
    if(i.tagName!=="TEXTAREA")
      i.addEventListener("keydown", e=>{ if(e.key==="Enter") mcSave(Number(i.dataset.id)); });
    if(i.dataset.f==="desc") i.addEventListener("input", ()=>{
      const p=box.querySelector(`[data-prev="${i.dataset.id}"]`);
      // ⚠️ 미리보기는 «관리자가 방금 친 것»이라 아직 서버 거르개를 안 거쳤다.
      //    저장하면 서버가 걸러 돌려주므로, 여기 보이는 것과 다를 수 있다.
      if(p) p.innerHTML = i.value || "<span class='mc-none'>비어 있음 — 성도님 화면에는 이름만 보입니다</span>";
    });
  });
}
```

### 2.9 입력값 회수·차례 이동 — `mcSyncInputs` / `mcMove` / `mcSaveOrder`

`admin-stats.html:4866-4909`:
```js
// 화면에 있는 값을 mcRows 에 담는다.
// ⚠️ 다시 그리기 전에 반드시 부른다 — 안 부르면 ▲▼ 한 번에 **치고 있던 글이 사라진다.**
//    바뀐 줄에는 「저장 안 됨」 표를 남긴다(저장된 줄 알고 넘어가지 않게).
function mcSyncInputs(){
  const box=document.getElementById("mc-list"); if(!box) return;
  box.querySelectorAll("[data-f][data-id]").forEach(el=>{
    const r=mcRows.find(x=>x.id===Number(el.dataset.id)); if(!r) return;
    const f=el.dataset.f;
    const v = el.type==="checkbox" ? el.checked
            : (f==="members" ? mcBrs(el.value) : String(el.value||"").trim());
    if(r[f]!==v){ r[f]=v; r._d=true; }
  });
}

// 같은 위원회 안에서만 자리를 바꾼다 — 다른 부서로 건너가지 않는다
function mcMove(id, dir){
  mcSyncInputs();
  const me=mcRows.find(x=>x.id===id); if(!me) return;
  const same=mcRows.filter(x=>x.committee===me.committee);
  const at=same.indexOf(me), to=at+dir;
  if(to<0||to>=same.length) return;
  const a=mcRows.indexOf(same[at]), b=mcRows.indexOf(same[to]);
  mcRows[a]=same[to]; mcRows[b]=same[at];
  mcOrderDirty=true;
  mcRender();
}

async function mcSaveOrder(){
  // ⚠️ 그 위원회 **전부**를 보낸다 — 서버가 개수를 맞대 보고 모자라면 거절한다
  const ids=mcRows.filter(x=>x.committee===mcPick).map(x=>x.id);
  const btn=document.getElementById("mc-ord-save");
  if(btn){ btn.disabled=true; btn.textContent="보내는 중…"; }
  const d=await callApi({ action:"ministryCatalogOrder", pw:getPw(), staff:getStaff(), ids })
    .catch(()=>({ok:false,error:"network"}));
  if(minAuthLost(d)) return;
  if(!d.ok){
    if(btn){ btn.disabled=false; btn.textContent="차례 저장"; }
    mnDialog({ icon:"⚠️", title:"차례를 저장하지 못했습니다", tone:"danger", ok:"확인", cancel:null, html: plEsc(d.error||"오류") });
    return;
  }
  mcOrderDirty=false;
  mcRender();
  mcNote(`차례를 저장했습니다 (${d.n}팀)`);
}
```
⚠️ **`mcSaveOrder`는 `mcPick`(지금 고른 위원회)을 기준으로 id를 뽑는다** — `mcPick`이 빈 문자열(「전체」
탭)일 때 이 필터(`x.committee===mcPick`)는 **아무 것도 매치하지 못해 빈 배열**이 되고, 서버는
`"순서를 바꿀 팀이 없습니다"`를 돌려준다(발견 사항 — "전체" 탭에서는 차례 저장이 사실상 항상 실패).

### 2.10 저장 — `mcSave`(+ `mcLines`/`mcBrs` 줄바꿈 변환)

`admin-stats.html:4911-4977`:
```js
// 명단은 DB에 <br> 로 눔지만 관리자에게는 줄로 보여야 한다 — 오갈 길을 둘 둔다.
// ⚠️ 서버 거르개가 남기는 태그는 <br> 뿐이라 줄바꿈을 그대로 저장하면 한 줄로 붙는다.
function mcLines(h){ return String(h||"").replace(/<br\s*\/?>/gi,"\n"); }
function mcBrs(t){
  return String(t||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean).join("<br>");
}

async function mcSave(id){
  const r=mcRows.find(x=>x.id===id); if(!r) return;
  const box=document.querySelector(`[data-row="${id}"]`); if(!box) return;
  const get=f=>box.querySelector(`[data-f="${f}"]`)?.value||"";
  const ck=f=>!!box.querySelector(`[data-f="${f}"]`)?.checked;
  const next={ sched:get("sched").trim(), desc:get("desc").trim(), capacity:get("capacity").trim(),
               members:mcBrs(get("members")), leader:get("leader").trim(),
               from:get("from").trim(), to:get("to").trim() };
  MC_WHEN_KEYS.forEach(k=>{ next[k]=ck(k); });
  const btn=box.querySelector("[data-save]");
  if(btn){ btn.disabled=true; btn.textContent="저장 중…"; }
  const d=await callApi({ action:"ministryCatalogSave", pw:getPw(), staff:getStaff(), id,
    schedule_note:next.sched, desc_note:next.desc, capacity_note:next.capacity,
    members_note:next.members, leader_note:next.leader,
    day_sun:next.sun, day_fri:next.fri, day_sat:next.sat, day_week:next.week,
    freq_weekly:next.weekly, freq_biweekly:next.biweekly,
    freq_monthly:next.monthly, freq_adhoc:next.adhoc,
    time_from:next.from, time_to:next.to })
    .catch(()=>({ok:false,error:"network"}));
  if(minAuthLost(d)) return;
  if(!d.ok){
    if(btn){ btn.disabled=false; btn.textContent="저장"; }
    mnDialog({ icon:"⚠️", title:"저장하지 못했습니다", tone:"danger", ok:"확인", cancel:null, html: plEsc(d.error||"오류") });
    return;
  }
  Object.assign(r, next);
  r._d=false;
  box.classList.remove("dirty");
  const dot=box.querySelector(".mc-dot"); if(dot) dot.remove();
  mnNote((r.team||"") + " 저장했습니다");            // 표준 v1 ⑰ — 여섯 화면 한 자리
  if(d.day){                         // 저장된 값으로 맞춘다
    r.sun=!!d.day.sun; r.fri=!!d.day.fri; r.sat=!!d.day.sat; r.week=!!d.day.week;
    const f=d.freq||{};
    r.weekly=!!f.weekly; r.biweekly=!!f.biweekly; r.monthly=!!f.monthly; r.adhoc=!!f.adhoc;
    // ⚠️ 주일을 껐으면 서버가 시각을 비워 돌려준다 — 화면 칸도 그 자리에서 비운다.
    //    안 그러면 「넣었는데 왜 없지」가 된다.
    r.from=d.from||""; r.to=d.to||"";
    const set=(f2,v)=>{ const el=box.querySelector(`[data-f="${f2}"]`); if(el) el.value=v; };
    set("from", r.from); set("to", r.to);
  }
  if(d.desc !== undefined){          // 서버가 걸러 돌려준 값으로 맞춘다
    r.desc = d.desc; r.sched = d.sched; r.capacity = d.capacity;
    if(d.membersNote !== undefined){
      r.members = d.membersNote;
      const ml=box.querySelector('[data-f="members"]'); if(ml) ml.value = mcLines(d.membersNote);
    }
    const ta=box.querySelector('[data-f="desc"]'); if(ta) ta.value = d.desc;
    const p=box.querySelector(`[data-prev="${id}"]`);
    if(p) p.innerHTML = d.desc || "<span class='mc-none'>비어 있음 — 성도님 화면에는 이름만 보입니다</span>";
  }
  // ⚠️ 넘치면 서버가 말없이 자른다 — 그대로 두면 넣은 이름이 조용히 사라진다
  if(d.truncated && d.truncated.length){
    mnDialog({ icon:"✂️", title:"글이 길어 잘렸습니다", tone:"danger", ok:"확인", cancel:null,
      html:`「${plEsc(d.truncated.join(", "))}」 칸이 길이를 넘어 잘렸습니다.<br>잘린 뒤의 내용은 저장되지 않았어요 — 줄여서 다시 넣어 주세요.` });
  }
  if(btn){ btn.disabled=false; btn.textContent="저장됨 ✓"; btn.classList.add("ok");
           setTimeout(()=>{ btn.textContent="저장"; btn.classList.remove("ok"); }, 1800); }
  // 채움 개수·탭 숫자만 다시 그린다(입력 중인 칸을 건드리지 않게 목록은 그대로 둔다)
  mcCounts();
}
```

### 2.11 공용 헬퍼 — 이미 다른 곳에 포팅됐거나 이 조사 범위 밖(이름만)

`mnDialog` · `mnNote` · `plEsc` · `.pl-*` 상태 부품 · `callApi` · `getPw`/`getStaff` · `minAuthLost` —
모두 신청현황(`renderMinistryAdmin`)과 완전히 같은 함수/부품을 그대로 재사용한다(`docs/port/ministry-status-legacy.md`
2.1/2.2/2.11절 참고). 이 문서에서는 다시 옮기지 않는다.

### 2.12 CSS — `.mc-*`(이 화면 전용, verbatim)

`admin-stats.html:377-497`:
```css
/* 사역팀 정보 편집 — 관리자만 쓰는 화면이라 넉넉하게 */
.mc-help{font-size:13px;color:#5b6472;line-height:1.7;margin:0 0 12px;}
.mn-note{font-size:12px;color:#7a5f1e;background:#fbf1d8;border-radius:8px;padding:6px 9px;margin-top:6px;line-height:1.5}
.mn-note i{color:#a08a4a;font-style:normal}
.mn-paper{font-style:normal;font-size:11px;font-weight:800;color:#41506b;background:#eef1f8;
  border:1px solid #dde3ee;border-radius:999px;padding:1px 7px;margin-left:5px;white-space:nowrap;}
.mn-pos{font-style:normal;font-size:.78rem;font-weight:700;color:#8a6a1e;
  background:#fbf1d8;border-radius:999px;padding:1px 8px;margin-left:6px}
.mc-hint{font-weight:500;font-size:.74rem;color:#8a8f9a}
.mc-tags{font-size:12px;color:#7a869c;}
.mc-tags code{background:#f3f6fb;border:1px solid #e2e8f4;border-radius:5px;padding:1px 5px;font-size:11.5px;}
.mc-sum{font-size:13px;color:#41506b;background:#eef1f8;border-radius:8px;padding:8px 12px;margin-bottom:10px;}
.mc-sum b{font-size:15px;color:#1a3a6b;}
.mc-rest{color:#a33;margin-left:8px;font-size:12px;}
.mc-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}
.mc-tabs[hidden]{display:none;}
.mc-tabs .mc-tab{flex:none;white-space:nowrap;}
/* 부서 고르기 — 접어 두고 펴서 고른다(가로 스크롤을 없앴다) */
.mc-pick{display:flex;align-items:center;gap:7px;width:100%;height:38px;padding:0 12px;margin-bottom:8px;
  font:inherit;background:#fff;border:1px solid #dde3ee;border-radius:10px;cursor:pointer;color:#41506b;}
.mc-pick-l{font-size:12px;font-weight:800;color:#8a95a8;flex:none;}
.mc-pick b{flex:1;min-width:0;text-align:left;font-size:13.5px;font-weight:800;color:#1a3a6b;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mc-pick-x{flex:none;font-size:12px;color:#8a95a8;transition:transform .15s;}
.mc-pick[aria-expanded="true"] .mc-pick-x{transform:rotate(180deg);}
/* ── 폰에서 보기 좋은 사역팀 정보(2026-09-18) — 한 팀 = 한 줄 카드, 눌러야 자세히 ── */
.mc-panel{padding-top:10px;}
.mc-head{position:sticky;top:0;z-index:20;background:#fff;margin:-10px -18px 10px;padding:10px 18px 6px;
  border-bottom:1px solid #eef1f6;}
.mc-search{height:40px;margin-bottom:8px;}
.mc-head-b{display:flex;align-items:center;gap:8px;}
.mc-only{display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;color:#41506b;cursor:pointer;}
.mc-found{margin-left:auto;font-size:12.5px;color:#7a869c;}
.mc-found b{color:#1a3a6b;}
.mc-found i{font-style:normal;color:#a0a9b8;}
.mc-guide{margin:0 0 10px;border:1px solid #e3e8f1;border-radius:10px;background:#f8fafd;}
.mc-guide>summary{list-style:none;cursor:pointer;padding:9px 12px;font-size:13px;font-weight:800;color:#1a3a6b;}
.mc-guide>summary::-webkit-details-marker{display:none;}
.mc-guide[open]>summary{border-bottom:1px solid #e3e8f1;}
.mc-guide .mc-help{margin:10px 12px;}
.mc-card{border:1px solid #dde3ee;border-radius:12px;margin-bottom:8px;background:#fff;overflow:hidden;}
.mc-card.off{background:#f7f8fa;}
.mc-card.on{border-color:#1a3a6b;box-shadow:0 2px 10px rgba(26,58,107,.08);}
.mc-card.dirty{border-color:#c3a253;box-shadow:0 0 0 2px #f6edd8;}
.mc-c-h{display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px;width:100%;text-align:left;
  font:inherit;background:none;border:none;cursor:pointer;padding:11px 12px;}
.mc-c-nm{flex:1 1 auto;min-width:0;display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 6px;}
.mc-c-nm b{font-size:15px;font-weight:800;color:#1a3a6b;}
.mc-c-nm em{font-style:normal;font-size:11.5px;color:#8a95a8;}
.mc-c-sub{flex-basis:100%;font-size:12px;color:#7a869c;line-height:1.5;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.mc-c-x{flex:none;color:#8a95a8;font-size:12px;}
.mc-tag.empty{background:#fdf1f1;border-color:#e6bcbc;color:#a33;}
.mc-open{padding:2px 12px 12px;border-top:1px solid #eef1f6;}
.mc-r{display:flex;gap:8px;padding:7px 0;border-top:1px solid #f3f5f9;font-size:13px;line-height:1.6;}
.mc-r:first-child{border-top:none;}
.mc-r-l{flex:none;width:66px;font-size:12px;font-weight:800;color:#8a6a1e;}
.mc-r-v{flex:1;min-width:0;color:#41506b;word-break:break-word;}
.mc-r-v.none{color:#a0a9b8;}
.mc-open-acts{display:flex;align-items:center;gap:8px;margin-top:10px;}
.mc-btn{font:inherit;font-size:13px;font-weight:800;color:#1a3a6b;background:#eef3fb;
  border:1px solid #a9c3e8;border-radius:10px;padding:9px 14px;cursor:pointer;}
.mc-open-acts .mc-ord{margin-left:auto;}
.mc-in{padding:10px 12px 12px;border-top:1px solid #eef1f6;}
.mc-in-acts{display:flex;gap:8px;align-items:center;margin-top:4px;}
.mc-in-acts .mc-save{flex:1;}
.mc-tab{font:inherit;font-size:12.5px;padding:6px 10px;border:1px solid #dde3ee;border-radius:8px;
  background:#fff;color:#41506b;cursor:pointer;}
.mc-tab em{font-style:normal;color:#8a95a8;font-size:11px;margin-left:3px;}
.mc-tab.on{background:#1a3a6b;color:#fff;border-color:#1a3a6b;}
.mc-tab.on em{color:#cfe0ff;}
.mc-tab.done{border-color:#5aab7c;}
.mc-row{border:1px solid #dde3ee;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#fff;}
.mc-row.off{background:#f7f8fa;}
.mc-nm{font-size:14.5px;font-weight:800;color:#1a3a6b;margin-bottom:6px;}
.mc-nm em{font-style:normal;font-size:11.5px;color:#8a95a8;margin-right:4px;}
.mc-tag{font-size:11px;color:#8a95a8;font-weight:600;margin-left:6px;}
.mc-note{font-size:12.5px;color:#8a95a8;}
.mc-in{display:flex;flex-direction:column;gap:7px;}
.mc-in label{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#5b6472;font-weight:700;}
.mc-in label.wide{align-items:flex-start;}
.mc-in input,.mc-in textarea{flex:1;font:inherit;font-size:13.5px;padding:7px 10px;
  border:1px solid #dde3ee;border-radius:8px;min-width:0;}
.mc-in textarea{resize:vertical;line-height:1.6;}
/* 미리보기 — 성도님 화면에서 보이는 그대로(작은 회색 글씨) */
.mc-prev{font-size:12.5px;color:#6b7280;background:#f7f8fa;border-radius:7px;padding:7px 10px;
  margin-left:62px;line-height:1.6;}
.mc-none{color:#b0b8c6;}
.mc-when{display:flex;flex-direction:column;gap:4px;background:#f7f9fd;
  border:1px solid #e6ecf6;border-radius:8px;padding:7px 10px;}
.mc-w-t{font-size:11.5px;font-weight:800;color:#1a3a6b;}
.mc-w-t em{font-style:normal;font-weight:500;color:#8a95a8;margin-left:6px;}
/* 한 줄에 「요일 …」·「주기 …」·「주일 시각 …」 — 세 줄이면 상자가 납작하다 */
.mc-w-r{display:flex;flex-wrap:wrap;align-items:center;gap:3px 11px;}
.mc-w-r>b{font-size:11.5px;font-weight:800;color:#6b7688;min-width:52px;}
.mc-in .mc-when label{font-size:12.5px;font-weight:600;gap:4px;color:#41506b;}
.mc-when label i{font-style:normal;font-weight:500;font-size:11px;color:#9aa4b4;margin-left:2px;}
.mc-when input[type=checkbox]{width:15px;height:15px;flex:none;margin:0;}
.mc-in .mc-when input[type=time]{flex:none;font:inherit;font-size:12.5px;
  padding:3px 6px;border:1px solid #dde3ee;border-radius:6px;background:#fff;}
.mc-in .mc-when input[type=time]:disabled{background:#eef0f4;color:#aab2c0;}
.mc-w-off{font-style:normal;font-size:11px;color:#a3701e;}
.mc-w-tw{font-size:12px;color:#8a95a8;}
.mc-ord{display:inline-flex;gap:3px;margin-left:8px;vertical-align:middle;}
.mc-ord button{font:inherit;font-size:11px;line-height:1;padding:4px 7px;border:1px solid #dde3ee;
  border-radius:6px;background:#fff;color:#5b6472;cursor:pointer;}
.mc-ord button:disabled{opacity:.28;cursor:default;}
.mc-row.dirty{border-color:#c3a253;box-shadow:0 0 0 2px #f6edd8;}
.mc-dot{font-size:11px;font-weight:700;color:#a3791f;margin-left:6px;}
.mc-bar{display:flex;align-items:center;gap:10px;background:#fdf6e3;border:1px solid #e8d6a8;
  border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:12.5px;color:#7a5f1e;}
.mc-bar button{font:inherit;font-size:12.5px;font-weight:700;padding:6px 14px;border-radius:7px;
  border:1px solid #1a3a6b;background:#1a3a6b;color:#fff;cursor:pointer;}
.mc-msg{font-size:12.5px;color:#2c5f2d;font-weight:600;margin:0 0 8px;}
.mc-save{align-self:flex-end;font:inherit;font-size:12.5px;font-weight:700;padding:7px 16px;
  border:1px solid #1a3a6b;border-radius:8px;background:#1a3a6b;color:#fff;cursor:pointer;}
.mc-save.ok{background:#2c5f2d;border-color:#2c5f2d;}
```
⚠️ `.mn-note`·`.mn-paper`·`.mn-pos`(379-384)는 이름은 `mn-`이지만 이 CSS 뭉치(주석 "사역팀 정보 편집") 안에
섞여 있다 — 실제로는 신청현황 카드가 쓰는 규칙이다(발견 사항, 혼동 주의). `.mc-in`이 **두 번 선언**된다
(440행 `padding` 버전과 455행 `display:flex` 버전) — 후자가 나중에 나와 `display`/`gap`을 더한다(CSS는
합쳐지므로 실제로는 문제없이 병합된다).

### 2.13 CSS — "사역신청 관리 표준 v1" 중 `.mc-*`를 다시 스타일링하는 부분(발췌, 전문은 `docs/port/ministry-status-legacy.md` 2.16절)

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

`admin-stats.html:825-832, 835, 840, 844, 850-853, 856-864, 867, 882, 887-888`(표준 v1 블록 중 `.mc-*`에
닿는 줄만 발췌 — 전체 803-905 블록 전문은 신청현황 문서 2.16절에 이미 있다):
```css
.mc-btn{min-height:var(--tap);padding:0 16px;font-size:.95rem;}
.mc-ord{gap:8px;}
.mc-ord button{width:var(--tap);height:var(--tap);font-size:15px;padding:0;}
.mc-save{align-self:auto;min-height:var(--tap-lg);font-size:1rem;min-width:9em;padding:0 16px;}
.mc-in-acts{align-items:stretch;}
.mc-bar button{min-height:var(--tap-lg);padding:0 16px;font-size:1rem;}
.mn-range button,.mc-tab,.mn-view button,.mn-modal-presets button{
  min-height:var(--chip);padding:0 14px;font-size:13px;}
.mn-cond-toggle,.mc-pick{height:var(--tap);}
.mapl-p,.mp-cols span,.mn-tcount{border:none;background:#f3f6fb;color:#41506b;}
.mn-date,.mn-rowi-t small,.ma-nm .ma-at,.mc-tag,.mc-r-v.none,.mp-cols span.dim,.mn-cond-sum{
  font-size:13px;color:#6b778c;}
.mn-stbar span,.mn-rowi-st,.mc-c-sub,.mn-tcount,.mp-i-st,.mc-r-l,.mn-teams-t{font-size:13px;}
.mc-c-sub,.mc-r-l,.mn-teams-t{color:#6b778c;}
.mc-when input[type=checkbox]{width:20px;height:20px;}
.mc-in .mc-when label{min-height:var(--tap);padding:0 10px;border:1px solid #dde3ee;border-radius:10px;font-size:13px;}
.mc-in .mc-when input[type=time]{min-height:var(--tap);font-size:15px;padding:0 6px;width:auto;min-width:0;flex:1 1 0;}
.mc-in .mc-when .mc-w-tw{flex:none;}
.mc-in .mc-when .mc-w-time{flex-wrap:wrap;}
.mc-in .mc-when .mc-w-time>b{flex-basis:100%;margin-bottom:4px;}
.mc-in .mc-when .mc-w-time input[type=time]{flex:1 1 0;min-width:108px;padding:0 8px;}
.mc-w-r{gap:8px;}
.mc-card,.ma-row{margin-bottom:var(--gap);}
.mn-head,.mc-head{top:60px;max-height:40vh;overflow-y:auto;}
.mc-only{min-height:var(--tap);}
.mc-only input[type=checkbox]{width:20px;height:20px;}
```

### 2.14 `.mc-in label`보다 뒤에 있어야 이기는 좁은 폰 규칙

`admin-stats.html:794-800`:
```css
   ⚠️ 옛 .mc-in label 규칙(align-items:center)보다 **뒤에** 있어야 이긴다. */
  .mc-r-l{width:58px;}
  .mc-in label{flex-direction:column;align-items:flex-start;gap:4px;}
  .mc-in label.wide{align-items:flex-start;}
  .mc-in input,.mc-in textarea{width:100%;box-sizing:border-box;}
  .mc-in .mc-when label{flex-direction:row;align-items:center;}
```
이 규칙은 `@media (max-width:420px)` 안에 있으며, CSS 소스 순서상 **803행의 "표준 v1" 블록보다 앞**에
있다 — `docs/notes/ministry-admin-ui.md`가 "이 덩이는 `@media` **뒤**다"라고 적은 것과 일치(표준 v1이
크기·색·여백만 건드리고 `flex-direction`류는 건드리지 않기 때문에 이 규칙이 살아남는다).

---

## 3. 동작 목록 (체크리스트)

1. 「🗂️ 사역팀 정보」 화면에 들어가면 **로그인 후 서버를 다시 확인하지 않고**(`ministryCatalog` 액션
   자체가 비번을 받지 않음) 목록을 그냥 보여준다 — 신청현황 진입 때만 메뉴 단계에서 `ministryAuth`로
   재확인한다 — `mcLoad`(admin-stats.html:4602), `ministryCatalog`(index.ts:4165, 게이트 없음).
2. **저장**(`ministryCatalogSave`)과 **차례 바꾸기**(`ministryCatalogOrder`)만 담당자 암호로 잠겨 있고,
   두 액션 모두 `ministryAdminError`로 **호출마다** 재확인한다 — index.ts:4922, 4994.
3. 관리자가 고칠 수 있는 것은 **설명 네 칸(시간·요일 문장/하는 일/필요 인원/지금 섬기는 분) + 담당 한 줄
   + 「② 언제」 열 칸 + 같은 부서 안의 차례**뿐이다. 팀 이름·부서·임명직 여부·표시 순서 기준값(sort_order
   절대치)은 이 화면에서 못 바꾼다 — `docs/notes/ministry-2027.md` "어드민에서 고칠 수 있는 것" 절.
4. 저장은 **보내온 칸만** 고친다(`key in b` 검사) — 한 칸만 고치는 도구도 나머지 칸을 지우지 않는다 —
   `ministryCatalogSave`(index.ts:4927-4939).
5. 주일(`day_sun`)을 끄면 서버가 **시각을 자동으로 비운다**(DB 제약 `ministry_catalog_time_sun_chk` 위반을
   막기 위해 선제 처리) — 화면도 체크박스를 끄는 순간 시각 입력칸을 그 자리에서 잠그고 비운다(다시
   그리지 않음 — 타이핑 중인 값이 날아가지 않게) — index.ts:4946-4959, admin-stats.html:4839-4848.
6. `day_sun`이 이번 요청에 없으면(다른 칸만 고친 저장) 서버는 **DB의 현재 값**을 다시 읽어 판단한다 —
   안 그러면 시각만 고치는 저장마다 매번 시각이 지워진다 — index.ts:4949-4958.
7. 설명 칸이 허용 길이를 넘기면 서버가 **말없이 자르고**, 잘린 칸 이름들을 `truncated` 배열로 돌려준다 —
   화면은 「글이 길어 잘렸습니다」 창으로 알린다 — index.ts:4962-4968, admin-stats.html:4969-4972.
8. 설명(`desc_note`)·시간(`schedule_note`)·필요인원(`capacity_note`)·담당(`leader_note`)·섬기는분
   (`members_note`)은 **관리자만 넣을 수 있는 제한된 HTML**(`b,strong,i,em,u,s,br,span,small,mark` +
   `style`의 `color/background-color/font-weight/font-size/text-decoration`만)을 허용하며, 저장할 때와
   읽어올 때 **양쪽 다** `ministryHtml`로 거른다 — index.ts:4799-4892.
9. 「지금 섬기는 분」은 **관리자가 직접 넣은 `members_note`**와 **담당자가 접수완료(또는 임명확정)한
   신청자 자동 명단**을 합쳐서 성도 화면에 보여주지만, 관리자 편집 폼에는 **`membersNote`(원본)만**
   싣는다 — 합본을 되돌려 저장하면 자동 명단이 굳어 중복되고 미채택자 이름도 영영 남는다 —
   index.ts:4207-4211, admin-stats.html:4609(`x.membersNote`).
10. 자동 명단에 오르는 조건은 **접수완료 또는 임명확정** 상태의 신청뿐 — 신청완료(아직 미접수) 상태는
    확정 전 신청자를 노출하지 않기 위해 제외한다 — `MINISTRY_ROSTER`(index.ts:4067), `ministryCatalog`
    (index.ts:4184).
11. 화면은 **찾기(검색)가 있으면 지금 고른 부서를 무시하고 전체에서** 검색한다 — 특정 부서에서 검색해
    0건이 나오면 "없는 줄" 오인하는 문제를 막는다(2026-09-18 실제로 겪음) — `mcRender`
    (admin-stats.html:4732), `docs/notes/ministry-2027.md` "찾을 때는 위원회를 넘어 전체에서".
12. 부서 고르기는 **접혀서 시작**하고(가로 스크롤 대신 접기/펼치기), 고르면 저절로 접힌다 —
    `mcTabsOpen`/`mcSyncTabs`, `docs/notes/ministry-2027.md` "부서 고르기는 접기/펼치기" 절.
13. 목록은 **한 팀 = 한 줄 카드**이며, 누르면 읽기 전용 상세가 펼쳐지고 "✏️ 고치기"를 눌러야 입력 폼이
    나온다. **한 번에 한 팀만** 열 수 있다(`mcOpen`/`mcEdit`가 전역 단일 값) — `mcRender`/`mcWire`.
14. 다른 팀을 열거나 부서를 바꾸거나 새로고침을 누르기 **전에 항상 `mcSyncInputs()`를 먼저 불러** 입력
    중인 값을 `mcRows`에 담는다 — 안 부르면 ▲▼ 한 번에 타이핑 중이던 내용이 사라진다 —
    admin-stats.html:4866-4868 주석, 4825/4711/4591 호출부.
15. 위원회 내 차례 바꾸기(▲▼)는 **로컬에서 즉시 자리를 바꾸고 `mcOrderDirty=true`만 세운다** — 실제
    서버 반영은 "차례 저장"을 눌러야 하고, 부서를 옮기거나 새로고침하려 하면 저장 안 된 차례가 있다고
    한 번 더 묻는다 — `mcMove`/`mcSaveOrder`(admin-stats.html:4881-4909), 4592/4707 확인창.
16. 차례 저장은 **그 부서에 속한 팀 id 전부**를 보내야 하고, 서버는 개수가 그 부서의 실제 팀 수와
    정확히 같은지 대조해 다르면 거절한다 — 일부만 보내 다른 팀의 자리를 빼앗는 사고를 막는다 —
    index.ts:5007-5013.
17. **발견 사항 — "전체" 탭(부서 미선택)에서는 차례 저장이 사실상 항상 실패한다.** `mcSaveOrder`가
    `mcPick`(빈 문자열)과 일치하는 팀만 걸러 보내므로 빈 배열이 되어 서버가 "순서를 바꿀 팀이 없습니다"를
    돌려준다 — admin-stats.html:4895 vs index.ts:4996.
18. **발견 사항 — ▲▼ 비활성화는 검색/필터로 줄어든 목록(`rows`) 기준**이지만, 실제 이동(`mcMove`)은
    **부서 전체(`mcRows`) 기준**으로 계산된다 — 필터 중에 ▲▼를 누르면 화면에 안 보이는 팀과도 자리가
    바뀔 수 있다 — admin-stats.html:4768-4769 vs 4884.
19. **발견 사항 — `renderMinistryCatalog`는 `logoutBtn.hidden=false`를 실행하지 않는다**(다른 다섯
    사역신청 화면은 모두 실행). 포팅 시 의도적 차이인지 확인할 것 — admin-stats.html:4527-4600 전체.
20. **발견 사항 — `document.getElementById("rep-mincat").addEventListener(...)`가 파일 안에 두 곳
    (1146행·1383행)**에 나온다 — 실제 실행되는 한 벌만 옮길 것.

---

## 4. 크기

**Section 1(index.ts) verbatim 코드**: 함수/상수 코드 약 **316줄**(adminError 6 · ministryAdminError 8 ·
`MINISTRY_LOCKED`~`MINISTRY_ROSTER` 9 · ministryCfg 10 · ministryWhoShort/ministryEsc/ministryMemberLine 23 ·
ministryCatalog 65 · MIN_POSITIONS/MIN_TAGS/MIN_STYLE_OK 6 · ministryStyleAttr/CloseTags/Cut/MIN_L/MIN_R 45 ·
ministryHtml 24 · MINISTRY_FREQ_* 8 · ministryTimeIn 11 · ministryCatalogSave 65 · ministryCatalogOrder 36)
+ SQL(ministry.sql 발췌 28 · ministry_filter_cols.sql 39 · ministry_when_v2.sql 69 ·
ministry_position_members.sql 32 · ministry_paper_leader.sql 37) 약 **205줄** = **약 521줄**.

**Section 2(admin-stats.html) verbatim 코드**: JS(상태·전역변수 18 · 메뉴 카드 9 · renderMinistryCatalog 74 ·
mcLoad 19 · mcCounts/mcHasWhen/mcNote 17 · mcWhenText/mcEmpty/mcHit/mcLine/mcSyncTabs 31 · mcRender 94 ·
mcFormHtml 38 · mcWire 43 · mcSyncInputs/mcMove/mcSaveOrder 44 · mcLines/mcBrs/mcSave 67) 약 **454줄**
+ CSS(`.mc-*` 본 블록 121 · 표준 v1 발췌 24 · `:root` 7 · 좁은 폰 발췌 6) 약 **158줄** = **약 612줄**.

**합계 약 1,133줄**의 verbatim 코드를 이식 대상으로 추출했다(위 코드블록 실측 기준 근사치 — 정확한
라인 수는 각 절에 표기한 `파일:시작-끝` 범위로 재확인 가능. 파일은 여러 세션이 함께 고쳐 줄 번호가
움직이므로, 포팅 시점에는 함수/선택자 이름으로 다시 찾을 것).

## 찾지 못한 것

없음 — 요청된 `renderMinistryCatalog`와 그 부속 전부(`mcLoad`·`mcCounts`·`mcHasWhen`·`mcNote`·`mcWhenText`·
`mcEmpty`·`mcHit`·`mcLine`·`mcSyncTabs`·`mcRender`·`mcFormHtml`·`mcWire`·`mcSyncInputs`·`mcMove`·`mcSaveOrder`·
`mcLines`·`mcBrs`·`mcSave`), 서버 액션 `ministryCatalog`(읽기)·`ministryCatalogSave`·`ministryCatalogOrder`와
그 헬퍼(`ministryAdminError`·`ministryCfg`·`ministryHtml`류·`ministryMemberLine`류·`MINISTRY_FREQ_*`·
`ministryTimeIn`), `ministry_catalog` 테이블의 create/alter/CHECK 전부를 실제 파일에서 찾아 verbatim으로
옮겼다. `supabase/ministry_sample_notes.sql`·`ministry_seed_2027.sql`·`ministry_testdata.sql`·
`ministry_filter_sample.sql`은 `grep`으로 확인한 결과 CREATE/ALTER 문이 없는 순수 INSERT/UPDATE 데이터
파일이라 스키마 자료로서는 옮기지 않았다(1.10절에 명시). `MIN_POSITIONS`은 이 화면이 직접 쓰지 않는
값이라 참고용으로만 인용했다(정의는 `docs/port/ministry-paper-legacy.md`가 본 범위로 다룬다).
