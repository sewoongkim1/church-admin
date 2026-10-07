# 고척교회 관리 (church-admin · admin.onlybible.kr)

교회 담당자만 카카오 로그인으로 들어오는 관리 웹. 1차 메뉴는 사역신청(성경암송 앱의 관리 화면에서 옮겨 오는 중).
설계·계획: 형제 저장소 `bible-memorize-church-app-v2` 의
`docs/superpowers/specs/2026-09-28-church-admin-design.md` · `docs/superpowers/plans/2026-09-28-church-admin-stage1.md`

## 스택
- 빌드 없음 · 브라우저 ES 모듈. 메뉴 하나 = `js/menus/<묶음>/<메뉴>.js` 하나 + `js/menus/registry.js` 한 줄.
- 서버: `supabase/functions/church-admin`. 권한 규칙은 `authz.ts`(순수 함수 — Node 시험이 같은 파일을 읽는다).
- DB: Supabase 통합 프로젝트(운영 `xnomlgydifiqiybervtf` / 개발 `ktpwthwqzgcqcrmsafdo`) — 성경암송 앱과 **같은 DB**.

## 개발 / 운영
- `js/core/config.js` 가 주소를 보고 고른다 — `admin.onlybible.kr` 만 운영, 나머지는 개발 + 「개발 DB」 띠.
- 로컬: `python -m http.server 8000` → http://localhost:8000 (카카오가 돌아오는 주소가 이 포트로 등록돼 있다).
- ⚠️ **도메인을 연결한 뒤(2026-09-28)로는 `sewoongkim1.github.io/church-admin/` 이 `admin.onlybible.kr`(운영)로 넘어간다.**
  개발 DB 로 화면을 보는 곳은 이제 **localhost 뿐**이다. 푸시하면 곧바로 운영 화면이 바뀐다 — 로컬에서 먼저 볼 것.

## 같은 프로젝트의 다른 앱 (2026-09-28)
통합 프로젝트에는 교회 앱 말고 **digest.onlybible.kr**(저장소 `myfavorite`, 이메일+비밀번호 로그인)의 표 다섯
(`memos`·`youtube_notes`·`digests`·`chat_history`·`activity_log`)이 있다. 그 정책이 「로그인한 사람이면」 열려 있어서,
카카오를 켜기 전에 **그 앱 허가 명단 `legacy_app_users`** 로 묶었다(`supabase/sql/002_gate_legacy_app_tables.sql`, 개발·운영 적용).
- digest 앱에 사용자를 **더하면 이 명단에도 넣어야** 그 사람이 메모·노트를 본다: `insert into public.legacy_app_users (user_id) values ('<auth.users id>');`
- 002 를 다시 돌려도 명단은 늘지 않는다(처음 한 번만 채운다 — 다시 채우면 그사이 이메일 가입자가 들어간다).
- **운영에 새 표·뷰·함수·storage 정책을 만들 때 `TO authenticated` 로 열지 말 것** — 이제 authenticated = 카카오 계정만 있으면 누구나다.
  바꾼 뒤엔 `check-authenticated-exposure.sql` 을 운영에서 돌려 0행인지 본다.

## 배포
- 화면: main 푸시 → Actions: preflight → stamp(파일마다 `?v=해시`, 커밋 안 함) → Pages. **bump 없음.**
- 서버: `supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo`(개발 먼저) → `xnomlgydifiqiybervtf`.
- SQL: `supabase/sql/` — 개발 먼저. CLI 는 저장소 밖 작업 폴더로만 link 한다(`~/.church-admin/supa-dev`·`supa-prod`). 저장소 루트 link 금지.
- 개발 서버 시험: `set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test tests/server.dev.test.mjs`

## ⚠️ 함정
- `--no-verify-jwt` 여도 토큰 검사는 `index.ts` 가 요청마다 한다. **새 액션 = `authz.ts` `ACTION_ROLES` + `index.ts` `switch` 의 case + `tests/server.dev.test.mjs` `PROBE`** — 셋 중 하나라도 빠지면 400/시험 실패(열리는 쪽으로 틀리지 않게).
- `admin_*` 표는 서버만 읽는다. 새 표는 그 자리에서 RLS 켜고 `anon`·`authenticated` revoke.
- 역할 목록은 `admin_roles` 표 한 곳. CHECK·코드 목록에 박지 않는다.
- 확인·알림은 `ui.js` 의 `dialog`/`toast` 만(브라우저 confirm/alert 금지). 저장 중엔 `busy()` 로 단추를 잠근다.
- **고르기·날짜·시각은 `js/core/picker.js`**(`pickOne`·`pickMany`·`pickDate`·`pickTime` — 폰은 바텀 시트, PC 는 작은 판)만. `<select>`·`type="date"`·`type="time"` 을 쓰지 않는다 — 폰에서 시스템 창이 뜬다(2026-09-29 친구 요청 · preflight 는 아직 안 막으니 `grep -rn '<select\|type="date"\|type="time"' js/` 로 볼 것).
- **PC(≥1024px) 배치(2026-10-05):** `.view` 는 `max-width:1440px` 상한 · 처음 화면은 `js/home-view.js` `homeHtml` 이 만든 `.home-grid` 카드 격자(최대 1280px) · 교육 강좌 카드 `.ec-list` 격자 · 신청 현황 `.ee-page` 1000px. 폰은 옛 한 줄 카드 그대로 — 새 규칙은 모두 `@media (min-width:1024px)` 안(css 맨 끝).
- 메뉴 화면은 `route()` 가 새로 만든 `<section>` 에 그린다 — 공용 `#view` 에 이벤트를 달면 다음 메뉴로 새어 간다.
- 응답에 `auth_user_id` 를 싣지 않는다. 담당자 이름을 코드·SQL 파일에 적지 않는다(공개 저장소).
- `supabase db query --linked -f` 의 파일 경로는 link 한 작업 폴더 기준으로 풀린다 — **절대 경로**로 줄 것.
- 주소 `#` 뒤 쿼리에 `code`·`error`·`error_description`·`access_token`·`refresh_token`·`type` 이름을 쓰지 않는다 — supabase-js 가 로그인 값으로 읽는다.
- 카카오 별명·사진은 `identities[kakao].identity_data` 에서 읽는다(`user_metadata` 는 본인이 고칠 수 있다). 사진은 `kakaocdn.net` 만.
- 로그아웃은 `scope:"local"` — 기본값 global 은 다른 기기까지 끊는다.
- 카카오톡 안 브라우저로 열리면 `kakaotalk://web/openExternal` 로 기본 브라우저에 넘긴다(`js/core/inapp.js` · `main.js` `start()`). 로그인하고 돌아온 주소(`?code=`·`?error=`)는 넘기지 않는다 — PKCE 열쇠가 그 브라우저에만 있다.
- 이름·소속에 `" \ , ( ) |` 금지(postgrest `.in()` 이 이스케이프하지 않는다).
- 개인정보 안내는 `privacy.html` — 모으는 것을 바꾸면 이 파일도 함께. 배포 목록(deploy.yml cp)에 들어 있어야 한다.
- 엑셀 읽기(SheetJS)는 `js/core/xlsx.js` `loadXlsx` 한 곳(📤 명단 올리기·📋 종이 명단 올리기·📜 사역 이력 · FE-6 2026-09-30). 파일은 저장소 `vendor/xlsx-<판>.full.min.js`(받은 곳 cdn.sheetjs.com · integrity sha384 · deploy.yml cp 에 `vendor` · `.gitattributes` 가 줄바꿈을 막는다).
  판을 올릴 때는 **새 이름**으로 넣고 판·integrity 를 함께 바꾼다(`tests/xlsx-loader.test.mjs` 가 파일 해시와 대조). npm·jsdelivr 의 xlsx 는 0.18.5(CVE 둘 · 한국 시간대에서 날짜 칸을 하루 앞으로 읽음)에서 멈췄다 — 되돌리지 말 것.
- **`x-internal-key` 머리가 있는 요청은 토큰 검사 앞에서 내부 갈래(`internalRoute`)로만 간다**(성경암송 「사역 이력 확인」 · 2026-10-01). 내부 액션은 `ACTION_ROLES` 에 넣지 않는다 — 토큰으로 부르면 unknown-action. 설계 v2 `docs/superpowers/specs/2026-10-01-ministry-history-check-design.md`.
- **「📮 정정 신청」**(`historyRequestList`·`historyRequestSet`·`historyRequestDelete`): 응답에 `user_id`·`person_id`·`handled_by` 를 싣지 않는다(`requestAdminOut`) · 「반영 안 함」 답 필수 · `not_mine` 반영은 `verified` · 상태로 거를 때 `.in()` 금지(「확인 중」 빈칸). 설계 v2 `docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md`.
  - **빠진 사역(2026-10-02):** 「반영」하면 그 해 `ministry_history` 에 `req:<신청 id>` 줄(본인 교인ID · `manual` · 직분은 교적)을 넣고, 「반영」에서 벗어나면 그 줄만 뺀다(`history-db.ts` `applyMissingRequest`·`undoMissingRequest`). 담당자가 창의 「사역 이력에 넣을 내용」(연도·부서·팀·직책 · `line` · 줄의 `updated_at` 잠금)을 고쳐 넣는다 — 성도님 글(`year`·`team_text`·`committee_text`)은 그대로 둔다.
    ⚠️ 빼 둔 `req:` 줄은 **마지막 `history.delete` 기록이 `from:"request"` 일 때만** 되살린다 — 📜 사역 이력에서 손으로 뺀 줄·신청 삭제(`why:"request-deleted"`)로 뺀 줄은 `history-removed`. 그래서 `req:` 줄을 SQL 로 빼거나 되살리지 말 것(기록이 안 남아 판정이 틀어진다).
  - **「삭제」**(`historyRequestDelete`): 신청 줄을 지우고(DELETE · 되돌릴 수 없다) 그 신청의 살아 있는 `req:` 줄은 빼 둔 줄로. 기록 `history.request.delete` 는 `{id, kind, status}` 만.
  - **두 칸(SQL 009 `committee_text`):** `null` = 옛 한 칸 신청(`team_text` 를 `parseTeamText` 로 나눔) · 글자 = 두 칸(나누지 않음) — `requestDraft` 한 곳. 배포 차례 SQL 009 → 이 함수 → 성경암송 `api` → 앱.
- **`ministry_history_requests` 에는 성경암송 쪽 트리거 `redirect_merged_member_write` 가 붙어 있다**(2026-10-02 · 앱 계정 합치기 `member_merge.sql`). 이 표를 지웠다 다시 만들면 성경암송 `supabase/member_merge.sql` 을 다시 돌릴 것 · `REQ_OPEN` 글자(「신청」·「확인 중」)나 부분 unique 색인 조건을 바꾸면 `member_merge.sql` 도 함께 고칠 것 (합치기는 새 계정에 같은 줄 열린 신청이 있으면 옛 계정 열린 신청을 지우고, 나머지는 user_id 만 옮긴다).

## 교인명부 (2026-09-29 운영 개시)
dimode(교적 프로그램) 교인목록·사진을 역할 `directory`(교인명부) 담당자가 찾고·보고·내려받는다. 사역 화면에는 **교적 표시**(맞음·확인 필요·없음)와 「이름을 누르면 교적 창」(`ministryPerson` · 사역신청만이면 다섯 칸 — 아래).
설계·계획: v2 `docs/superpowers/specs/2026-09-29-church-people-directory-design.md` · `docs/superpowers/plans/2026-09-29-church-people-directory.md`
- 표 `church_people`(한 분 한 줄 · `household_id` = 세대주 교인ID) · `church_people_imports`(올린 기록 = 화면의 「명부 기준일」) · 비공개 사진 칸 `church-people-photos` — 모두 서버만 연다(SQL 003).
- **새 명단이 오면**(저장소 밖 작업 폴더 `C:\Projects\교인명부_작업\<기준일>\`):
  `python tools/people/parse_people.py "<xls>" --date <기준일>` → `fetch_photos.py --date <기준일>` → `load_people.py --work <폴더> --target prod`(살펴보기) → 수가 이치에 맞으면 `--apply`. → 넣은 뒤 **총괄이 📊 교인 현황 맨 아래 「🔗 기록 잇기 맞추기」를 한 번**(사역신청·성경필사 기록을 새 명부로 다시 잇는다 — 사람이 정한 것은 그대로).
  키는 `~/.church-admin/prod.env`(PROD_URL·PROD_SERVICE_KEY) — CLI 는 새 방식 secret 키를 **가려서** 주므로 옛 `service_role`(JWT)을 쓴다.
- ⚠️ **진짜 명단은 저장소에 절대 안 들어간다**(공개 저장소). `.gitignore` + `tools/leak-scan.mjs`(preflight) + `.githooks/pre-commit`(`git config core.hooksPath .githooks` — 저장소 설정이라 모든 체크아웃이 공유). `--no-verify` 금지.
- ⚠️ **개발 DB 엔 가짜 명부만**(`tools/people/fake_people.py`) — load 가 방향을 거절한다. 빠짐이 5% 넘으면 멈춘다(`--allow-drop` 으로만).
- ⚠️ 원본 대조는 「원본 낱말이 결과 어딘가에 있나」만 본다(칸이 뒤바뀌어도 통과) — **살펴보기의 새로·바뀜·빠짐 수가 평소와 다르면 넣지 말고 멈출 것.** dimode 표 모양이 바뀌어 「기타사항」 뒤에 값 칸이 생기면 지번주소 자리로 들어갈 수 있다.
- 원본 함정: 교회학교 소속 없는 분 전원의 「교사」에 같은 한 사람이 찍힌다(비운다) · 세대주 번호 `0` = 「연결 없음」(가족 없음) · 기타사항은 칸이 아니라 `title` 속성에(올리지 않는다).
- 사역 응답(`ministryList`·`ministryPaper*`)에는 `church:{state,reason}` **두 칸만** — 교적의 연락처·주소·직분을 싣지 않는다. 명부가 없으면 `null`(화면이 표시를 안 그린다).
- 사역신청·담당자 「이름을 누르면 교적 창」(2026-09-30 · `ministryPerson` · 역할 `ministry` — 담당자·역할 화면은 총괄이 부른다 · 화면 `js/menus/ministry/person-link.js` → `openChurchPerson({action:"ministryPerson"})`):
  모양·기록은 `evPerson` 과 같다(`full`/`basic`). 맞대는 줄은 `ministryApplicant` 하나(신청 현황·임명현황 who·번호 → `applicantFromWho` · 종이 명단 gu·mok → `applicantFromPaper` 와 같은 결과 · 담당자 identity) — **명단 교적 표시와 같은 줄**이라야 「맞음」인 분이 늘 열린다.
  ⚠️ **번호로 한 분을 고르는 것은 `full` 만**(사역신청만이면 번호는 교적 표시 「소속 다름」에만 — 번호→교인 조회 통로를 만들지 않는다). 번호는 DOM(`data-*`)·응답·기록에 싣지 않는다(단추엔 줄 열쇠만 · 누를 때 메모리의 줄에서 꺼낸다).
- 교적 표시의 「남성」(2026-09-30 친구 제보): 명단 목장 「남성」은 교적 목장 칸에 「남성」이 든 분(운영 표기 `믿음-남성`·`사랑-남성`·`섬김-남성`·`소망-남성1`·`소망-남성2`·`은혜-남성목장`·`화평-남성` · 기쁨엔 없음)과 맞댄다.
  ⚠️ `mokNumber("소망-남성1")` 은 1 이다 — 숫자 목장 신청은 남성 목장 분을 **빼고** 맞댄다(안 빼면 「소망 1목장」 동명이인이 같은 소속이 된다). 「목장 확인」은 99·빈 목장(과 「남성」인데 교적은 숫자 목장)만.
  성경필사 줄만 「옮겨 적은 줄은 맞음」(`transcribedSame` — 줄이 동명이인 중 정확히 한 분의 `mapChurchPerson` 결과와 같으면 같은 소속) · 사역 줄엔 쓰지 않는다. 명단에 적는 값은 그대로 「남성」(앱 로그인·계정 잇기 열쇠).
- 찾기·보기·내려받기는 `admin_audit` 의 `people.*` — 「바꾼 기록」 기본 보기에선 빠지고 「교인명부 기록」 보기에서만 보인다. 이 기록은 명단에서 빠져도 지우지 않는다(개인정보 안내 6번).
- 「자세히」 창의 🤝 사역 · ✍️ 성경필사 탭(2026-10-01 · 설계 v2 `docs/superpowers/specs/2026-10-01-person-history-tabs-design.md` · 계획 `docs/superpowers/plans/2026-10-01-person-history-tabs.md`):
  기록과 교인을 잇는 표 `people_links`(SQL 006 · `(kind,row_id)` — `order`=ministry_orders · `signup`=event_signups · FK 없음 · 앱 표엔 칸을 안 더한다). 규칙·칸 지도는 `people-links.ts`(순수).
  ⚠️ **`manual`·`none` 은 자동이 절대 덮지 않는다** — 자동 맞춤의 쓰기는 SQL 함수 `people_links_auto` 하나로만(그 안의 where), 사람의 쓰기는 `peopleLink` 하나(「이분 것」·「이분 아님」 `linkPatch` · 「풀기」 `unlinkRec` — 풀기는 사람이 고른 일이라 그 줄 하나를 직접 upsert 로 auto 로 되돌린다). **그 밖의 자리**(기록 잇기 맞추기·그때그때 잇기·새 코드)에서 표에 직접 upsert 로 auto 를 쓰지 말 것.
  ⚠️ 「이름이 명부에 한 분뿐」은 **자동으로 잇지 않는다**(`autoLink` — 이름 누르기의 `personPickFor` ②와 다르다 · 친구 결정). 그때그때 잇기는 신청 현황·종이 명단 넣기·성경필사 명단·올리기·더하기·고치기(실패해도 화면은 그대로 · 서버 로그) — 초안 회차는 잇지 않는다.
  ⚠️ **번호로 이은 줄(`match_basis` 「번호」)은 그 신청의 번호가 지워진 뒤 다시 맞추지 않는다**(`phoneLinkKept` — 설계 §3.1-3 · 개인정보 안내 6번 「번호로 이어 둔 교인ID 는 남아요」). 이 조건을 빼면 번호가 지워진 뒤의 새 명단·「기록 잇기 맞추기」에서 번호로 이은 줄이 모두 null 로 끊긴다.
  ⚠️ 탭 응답은 칸 지도로만 — `user_id`·`ident_key`·`memo`·`phone`·`answers`·`note`·b6 원본 메모 `src_note` 금지(시험이 키 집합 대조).
  ⚠️ 탭 자료 읽기(`personHistory`)가 실패해도 창·쓰기는 그대로 — `personHistorySafe`(`historyOrNull`)가 null 을 주고 `withHistory` 가 `history` 칸째 뺀다(창은 예전 모양 · 잇기는 성공 알림 + 「창을 다시 열면」). 감싸지 않고 부르면 SQL 006 전·권한 오류 때 「자세히」 창 전체가 500 이 된다. 탭·잇기 단추에 `data-v`·`data-fam` 금지(dialog 가 닫기로, 가족 단추로 읽는다). 「풀기」 확인은 줄 안(창 위에 창 없음).
  ⚠️ PC 무스크롤은 CSS(`.pd-tabbed` · 사역·성경필사 칸 `contain:size`)가 지킨다 — 칸·탭을 더하면 1366×657 을 다시 잴 것(계획 Task 6 Step 9 하네스).
  사역 이력(b6 `ministry_history`)은 `person_id` · `deleted_at is null` 로 읽고, 「이분 것」·「이분 아님」·「풀기」로 **고치기도 한다**(Task 10 · `peopleLink` kind `history` → `historyLinkFor`) — 쓰는 모양은 b6 의 `historyLinkPatch`·`historyUnlinkPatch`, 풀기 뒤 그 줄 다시 맞추기는 `rematchHistoryRows`(try/catch) · 기록은 「바꾼 기록」 `history.link {op,year,by:"directory"}`(이름·교인ID 없음) · expect 를 주면 `historyWriteGuarded` 의 UPDATE WHERE 로 잠금 · 이름 확인은 「이분 것」만(`linkNameOk` — 사역 이력은 b6 열쇠 `historyNameMatches`). 표가 없으면 42P01·PGRST205 를 빈 것으로 · 넘긴 신청(`order_id`)은 신청 쪽으로 안 읽는다.
- 사역신청 휴대폰 번호(2026-10-01 친구 결정) — **결정(임명·취소) 때 지우지 않는다.** 신청 현황 「📵 결정된 신청 번호 지우기(N건)」(`ministryPhoneClear` — 보낸 수가 맞을 때만 · 기록 `ministry.phoneclear`) + 결정 뒤 **180일 자동**(SQL 007 `ministry_phone_expire()` · pg_cron `ministry-phone-expire` 매일 03:17 KST).
  ⚠️ 약속이 문서(개인정보 안내 6번 · 성경암송 `privacy/` · 성경암송 `app.js` 세 곳 — 개인정보 화면·도움말·사역 신청서 안내)와 코드 두 곳이다 — 예약이 실제로 도는지 `cron.job_run_details` 로 본다. 옛 성경암송 관리 화면(얼림)은 결정 때 바로 지운다(더 엄격하니 둔다).
  ⚠️ 180일 자동도 **지금 결정 상태인 줄만**(`status in DECIDED` + `decided_at` · 2026-10-02) — 결정에서 되돌려도 `decided_at` 은 남는다(`statusPatch`). 단추와 같은 셈이다 · 목록은 `ministry.ts DECIDED` 와 같아야 한다(`tests/ministry.test.mjs` 가 SQL 을 읽어 맞댄다).
- 다음 명단(12월 무렵) 전에 할 다듬기: v2 계획서 끝의 최종 검토 「나중」 목록(옛 기준일 폴더로 덮어쓰기 막기 · 깨진 글자 멈춤 · 씨앗 사진 원자 복사 등).

## 성경필사(암송) (2026-09-30 운영 개시)
성경암송 앱의 이벤트 명단(`events`·`event_signups` — 사순절·썸머 써 바이블·소책자·가을 말씀 동행)을 역할 `bibleevent`(「성경필사(암송)」) 담당자가
보고·고치고·올리고·통계 낸다. 메뉴 셋 `js/menus/bibleevent/`: 📋 회차·명단(`be-roster`) · 📤 명단 올리기(`be-upload`) · 👤 사람별 이력·통계(`be-history`).
규칙은 순수 모듈 여섯 — `events-rules.ts`(회차·줄 검사 · 신원 키 · 자격 회차 `isEligEvent`/`eligibilityStart`) · `events-people.ts`(교인명부 → 줄) ·
`events-stats.ts`(사람 묶음·통계) · `events-rows.ts`(한 분 더하기·고치기 · 같은 분 후보 키 `sameKeys`) · `events-upload.ts`(올리기 판정) · `events-person.ts`(이름을 누르면 교적 창). Node 시험이 같은 파일을 읽는다.
설계 v2 `docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md` · 옛 동작 원문 `docs/port/event-roster-legacy.md`.
- ⚠️ **명단을 고치는 곳은 여기 한 곳이다.** 운영을 여는 날부터 성경암송 `api` 의 `eventImport`·`eventSave`·`eventSetNote` 는 비밀번호 확인 **바로 뒤**에서
  `moved-to-church-admin` 을 돌려준다(`EVT_MOVED` · 비밀번호 없는 호출은 예전처럼 `unauthorized`). **되살리지 말 것** — `eventImport` 는 그 회차의 `source='import'` 줄을
  **전부 지우고** 다시 넣어, 여기서 고친 것·더한 분·줄 id·이어 둔 계정이 한 번에 사라진다. 직접 SQL 로 줄을 넣지 않는다 · 성경암송 `supabase/event_stamp_2026.sql` 을 다시 돌리지 않는다(가을 회차 설정을 덮는다).
- 성경암송 쪽에 **남긴 것**: `eventRoster`(읽기)·`eventExcuse`(자격 인정)·자격 회차 미신청 목록 — 가을 말씀 동행용, 다음 단계에서 옮긴다(그때 성경암송 `admin.html` 이벤트 타일도 이리로).
  성도님 앱 액션(`eventOpenList`·`eventSignup`·`eventDrop`·`eventRosterPublic`·`eventStamps`)은 건드리지 않는다.
- 표는 성경암송 것 — **칸·제약·RLS 를 바꾸지 않는다**(새 SQL 은 역할 한 줄 `004_bibleevent_role.sql` 뿐).
  담당자가 더한 줄은 `source='import'` + `note` 앞에 `담당자가 더함`·`명단 올리기`·`소속: 교인명부로 채움`(소속을 하나라도 채움)·`직분: 교인명부로 채움`(직분만 채움 · 2026-09-30 M5)(겹치면 ` / `). 서버는 붙임말을 붙인 **뒤** 500자를 넘으면 `note-too-long` — 창의 글자 수 상한은 더하기 480(NOTE_FORM_MAX · 붙임말 몫) · 고치기·메모만 고치기 500(NOTE_EDIT_MAX — 고칠 땐 붙임말을 안 붙이고 서버도 500 그대로 센다).
- 낸 날(`created_at`): 마감일이 오늘(KST)보다 앞선 회차에 넣는 줄(올리기·한 분 더하기)은 **그 마감일 한국 자정**, 열린·앞날 회차는 DB 기본값 now()(`events-rules.ts` `pastEventCreatedAt` · 2026-09-30 M2). 성경암송 `evtPositionHint`(앱 등록 폼의 직분 기본값)·「이미 내신 것」 차례가 created_at 이 가장 늦은 줄을 「가장 최근」으로 본다 — 2022 명단을 오늘 올린 줄이 가장 새것이 되면 안 된다. 그래서 지난 회차 줄의 낸 날(응답 `at` · 성경암송 `eventRoster`)은 마감일이 된다(고친 때 `updated_at` 은 지금).
- `note`(담당자 메모)와 `memo`(성도님 한 줄)는 다른 칸이다. `memo`·`phone`·`answers` 는 쓰지 않고, `user_id`·`ident_key` 와 함께 응답에 싣지 않는다(명시적 칸 지도 · 줄 칸 목록은 `EV_ROW_COLS` 하나 · 계정은 `hasUser` 로만).
- `ident_key` 는 `paper.ts` `appIdentityKey`(NFC 안 함) — `authz.ts` `identityKey`(NFC)를 쓰면 앱 계정과 영영 안 맞는다. 같은 분 판정은 `sameKeys`(07/7·N목장·NFC) 한 규칙 — 한 분 더하기·고치기·올리기가 함께 쓴다. 더해서 교구 줄은 **한쪽 목장이 비었거나 99** 면 같은 교구·같은 이름을 같은 분으로 본다(`looseSame` · 올리기는 채우기 전 줄의 키도 · 화면 `dupFlags` 도 같게 · 2026-09-30 최종 검토 I1).
- 앱 계정은 **조회만** 해서 잇는다(만들지 않는다 · `member_login` 금지). 한글 키 `.in()` 은 100개·6KB 씩(`inChunks`).
  읽기만 하는 이름(👤 이력·이름 누르기)은 `readName` — 큰따옴표·역슬래시·세로줄만 막는다(괄호가 든 옛 이름도 누를 수 있게) · 직분은 완성형(NFC)으로 다듬는다(신원 키에 안 들어간다).
- 앱 계정에 이어 둔 줄은 성경암송에서 그 계정을 지우면 함께 지워진다(`event_signups.user_id` on delete cascade · 담당자 줄도 · 교회 어드민 기록에는 안 남는다 — DB 가 지워 `event.delete` 가 없다). 계정 합치기로는 안 사라진다(줄을 새 계정으로 옮긴 **뒤** 옛 계정을 지운다 · `member_merge.sql`). 표는 성경암송 것이라 문서로만 알린다(2026-09-30 M7).
- 같은 분의 두 계정이 한 회차에 줄을 하나씩 가져 성경암송 기록 합치기가 막히면(`merge-signup-conflict` · 성경암송 `admin-members.html` 「같은 이벤트의 상세 신청이 양쪽에 있습니다」), 교회 어드민에서 담당자 줄을 뺀 뒤 다시 합친다. 뺄 수 있는 것은 담당자 줄(`source='import'`)뿐 — 두 줄 다 앱에서 낸 줄(`app-row` · 성도님이 등록 기간 안에 앱에서 취소)이거나 자격 회차(`eligibility-event`)면 여기서는 못 뺀다.
- 자격 회차 판정은 `isEligEvent(needs)` 하나(화면의 `hasEligibility` 도 이것). 앱에서 낸 줄(`source='app'`)과 자격 회차의 줄은 **메모만** 고친다(`app-row-note-only`).
  자격 회차엔 더하기·올리기·빼기가 막힌다(`eligibility-event` · 가을 설계 §12). 회차 설정의 시작일은 `eligibilityStart(needs)` 보다 앞설 수 없다(`before-eligibility`).
- 빈칸 채우기(`fillDecision`)는 교인명부 전체에서 이름이 한 분일 때만, 빈 칸만 채운다. 줄에 적힌 소속이 명부 소속과 다르면 아무것도 채우지 않는다(`different-affiliation`).
- 회차를 성도님께 보이게 하는 저장은 `needs-confirm`(아무것도 안 쓴 상태) → 화면 확인 창 → `confirmListed:true`. 공개 확인은 쓰기 **전**이다.
  회차 차례(`sort_order`)는 회차 설정의 「같은 날 마감하는 회차끼리 차례」(정수 -999~999 · 작을수록 위 · 새 회차 0). 성도님 앱 eventOpenList 는 ① 등록할 수 있고 안 낸 것 ② 마감일 ③ 차례 ④ id 로 세운다 — 차례는 마감일이 같은 회차끼리만 앞뒤를 가르고, 그때 첫 화면 단추(맨 앞 회차)도 정한다. 회차 글자 칸(이름 100 · 짧은 이름 40 · 부제 100 · 묶음 20자)은 서버도 막는다(`event-too-long` · 바꾼 칸만 — 옛 값이 길어도 다른 칸 저장은 된다).
- 교인명부에서 주는 값은 **이름·구분·소속·세부·직분 다섯**뿐(예외 둘 — 아래 `evPerson` 의 `full` · 찾기 후보에는 교적의 목장 칸 그대로도 — 같은 교구에 같은 이름이 있을 때 가려내려고: `evPeopleLookup` 에만 `church_mok`(`events-people.ts` `churchMok` — `mapChurchPerson` 이 교구로 보내는 분은 `mok3` 그대로, 그 밖은 `school_dept`·없으면 `mok1` · 화면 「교적: 소망-남성1」 · 2026-09-30 친구 요청). **`lookupOut` 을 넓히지 말 것** — `evPerson` `basic`·빈칸 채우기는 다섯 그대로(`lookupCandOut` 이 찾기 후보 전용)). 기록: `event.*` 는 「바꾼 기록」 · `people.lookup`(`{q, count}` · `evPeopleLookup`·`evPerson`·`ministryPerson` 세 곳 — `ministryPerson` 은 `from:"ministry"`, 번호로 골랐으면 `byPhone:true` · 번호 자체는 싣지 않는다)·`people.fill`(`{rows, names, asked, askedNames}` · 살펴보기에서 명부에 물었으면 **채운 것이 없어도** 한 줄 — 2026-09-30 SEC-2 · `fillRecord`)은 「교인명부 기록」 ·
  `event.upload` 는 건수만 **납작하게**. 칸 이름을 바꾸면 `js/menus/system/audit.js`·`tests/audit.test.mjs` 도 함께(안 고치면 기록 줄이 0·빈칸으로 보인다).
- 이름을 누르면 교적 창(`evPerson` · `events-person.ts` · 화면 `person-popup.js`): **부른 분의 역할로 서버가 모양을 정한다**(`ctx.roles` — 화면이 보낸 것을 믿지 않는다) — `directory`·`super` 면 `full`(교인ID·이름·소속·직분 → 화면이 교인명부 `openPerson` → `peoplePerson` 「자세히」 창 · 기록은 그쪽 `people.view`, 한 분으로 못 골라 후보를 줄 때만 여기서 `people.lookup`), 성경필사만이면 `basic`(다섯 칸 + 교적 표시 · 늘 `people.lookup`). **교인ID 를 `basic` 에 싣지 말 것** — 교인ID 가 나가는 예외는 `full` 하나다(위 「다섯뿐」의 다른 예외 `church_mok` 은 찾기 후보에만 · 교인ID 아님).
  고르는 규칙은 교적 표시와 같은 `sameAffiliation`(같은 소속 한 분 → 이름이 한 분뿐 → 못 고르면 후보 스무 분 · `total` 은 자르기 전 수). 창은 뒤로 가기 한 칸(`history.state` `{bePerson:1}`)을 쌓아 뒤로 가기가 창만 닫는다 — `modal.js` 와 같은 차례(「닫기」로 닫으면 그 칸을 거둔 뒤에 끝낸다).
- 1,000행: 명단·이력·통계·계정 읽기는 `allRows`(`order(id)`), 인원은 `head:true`. 올리기 상한 600줄(회차 최대가 515줄).
- 개발 서버 시험의 회차는 `ca-test-`(시험이 만들고 지운다).
- 팝업 없음(친구 결정 2026-09-29): `alert`·`confirm`·`prompt`·`beforeunload`·`<select>`·`<input type=date|time>`·`datalist` 금지 →
  `ui.js` `dialog`/`toast` · 입력 창 `js/core/modal.js` `openForm` · 고르기·날짜 `js/core/picker.js` `pickOne`/`pickMany`/`pickDate`. 예외는 엑셀 **파일 고르기** 하나(붙여넣기·끌어다 놓기를 함께 둔다).
- 회차는 **콤보(`pickOne`)로 고른다**(2026-09-30 친구 요구 · 칩 줄은 걷었다) — 연·월(`opens_on` → 「2026년 3월」 · 없으면 「날짜 없음」)+제목 전체. 세 화면(📋 콤보·📤 올릴 회차·👤 통계에 넣을 회차)이 **같은 표기** `evPickLabel`·`evPickHint`(`roster-logic.js` `evPickOptions` · 시작일 최근 먼저)를 쓴다 — 화면마다 따로 짓지 말 것(같은 제목 「사순절 마가복음 완서자」가 2023·2026 두 번 있다).
  📋 콤보의 고르개는 `pickOne({ wrap: true })` — PC 판이 제목 한 줄 너비로 늘지 않게 상한 640px(콤보가 더 넓으면 콤보 너비)·글 줄바꿈(`.pk-dim.pop .pk.pk-wrap` · 폰 시트는 그대로). 고른 뒤 route 가 다시 그리면 초점을 콤보로 돌려준다(`comboRefocus` · 첫 열기·↻ 새로 불러오기는 그대로).
  👤 **통계 이름표는 따로다**(2026-10-01 친구 · 막대·교구×회차 머리 칸·「고른 회차 N개」 줄·통계 내려받기): `history-logic.js` `statLabel` — **제목**에서 앞 연도를 떼고 따로 선 「완서자·이벤트·참여자·성경필사」를 빼고 시작일 연도를 앞에(「2026 사순절 마가복음」 · 짧은 이름은 「사순절 완서자」처럼 책 이름이 빠진 회차가 있어 안 쓴다). 차례는 시작일→마감일 늦은 것 먼저→id(`orderStats` — 통계를 받은 한 곳에서 세운다 · 서버는 마감일 오름차순으로 준다). 고르개 표기(`evPickLabel`)·DB 제목은 그대로.
- 개인정보 안내는 `privacy.html` 7번(+6번 쓰는 곳·보는 사람·기록). 성경암송 `privacy/` 는 손대지 않았다(친구 결정 — 앱이 새로 모으는 것이 없다).
- 개발 화면 확인용 가짜 회차: `node --experimental-strip-types tests/seed-bible-events-dev.mjs`(`--clean` 으로 지움 · 회차 id `ca-demo-` · 명단 이름은 음절 표로 지어내고 찾기 이름은 개발 가짜 명부에서 고른다).

## 사역 이력 (2026-10-01)
지난 해 사역 임명 명단(엑셀 · 2022~2026, 더 오래된 해도)을 올려 교인명부의 교인ID 와 잇는다. 메뉴 「📜 사역 이력」(`js/menus/ministry/history.js` · 역할 `ministry`).
설계 v2 `docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md` · 계획 v2 `docs/superpowers/plans/2026-10-01-church-admin-ministry-history.md`.
- 표 `ministry_history`·`ministry_history_imports`·함수 `ministry_history_apply`(SQL 005) — 서버만. 맞춤 규칙은 `history-match.ts`(순수), 표 쪽은 `history-db.ts`(`makeHistory` · npm import 없음 — 교인명부 세션이 import 한다).
- ⚠️ **교인명부 세션(자세히 창 사역 탭)이 이 표를 person_id 로 읽고 「이분 것」으로 고친다** — 칸 이름·`historyLinkPatch`·`historyUnlinkPatch`·`rematchHistoryRows(db, ids)` 를 바꾸면 그쪽도(설계 §7).
- ⚠️ `person_id` 는 `directory`·`super` 응답에만(`rowOut(r, full)`). 사역신청 역할의 「이분」은 후보 차례 번호 + 지문 `fp`(화면 글자로 만든 FNV — 교인ID 로 만들지 않는다).
- ⚠️ `link_how` `manual`·`none` 은 자동 맞춤이 덮지 않는다. 다시 맞추기는 **모든 해를 함께** 계산한다(다른 해 같은 팀 「유지」가 근거라 해 하나만 돌리면 결과가 달라진다).
- 같은 줄 열쇠 `src_key`(해|부서|팀|이름|목장|직분)는 올린 그대로 — 고쳐도 안 바뀐다. 빼기는 `deleted_at` 표시만(다시 올려도 안 되살아난다).
- 진짜 원본 엑셀은 저장소 밖으로 옮겼다(2026-10-01 친구) — 대조 도구는 `python tools/history/check_real.py <명단 엑셀> [교인명부 정리 엑셀]` 로 경로를 준다.
- 2025년 이전 명단의 「기쁨-1」은 목장 모름으로 읽는다(검증 추정 · 2026-10-01 친구 확인) — 바뀌면 `parseRow` 한 줄과 시험만.
- 규칙을 바꾸면 이 PC 에서 `python tools/history/check_real.py` — 진짜 명부·통합 엑셀로 수와 검증 지적 64줄을 맞대 본다(2026-09-29 명부 기준 4,042 · 51 · 수만 찍는다).
- **부서 이음표(2026-10-06 · 사역 통계 준비 — 아직 표·화면은 없다):** `python tools/history/dept_lineage_draft.py` — 통합 엑셀 둘(2010~2026 · 17,971줄)을 읽어 `C:\Projects\Data\정리\부서이음표_2차.xlsx`(저장소 밖 · 사람 이름 없음)를 만든다.
  해마다 달리 적힌 부서 97가지·부서-팀 쌍 541가지를 **큰 분류(찬양 · 교회학교 · 그 밖 — 목양·기관은 따로) → 계열 21 → 표준 팀** 으로 잇는다.
  1차의 물음 17가지에 친구가 답했다(같은 날 · 그 파일의 `ANSWER` — 답이 적힌 엑셀은 `부서이음표_초안_답_2026-10-06.xlsx`): **「부설기관」 계열에 복지재단·봉사센터 · 도서관 · 시니어학교 · 샬롬부·사랑부** · 찬양부 아래 중보기도팀은 전도·중보기도 · 주보간지는 예배. 남은 확인 셋은 `OPEN`.
  ⚠️ 부서를 **이름만 보고 잇지 말 것** — 그 파일의 `EVENTS` 처럼 팀까지 내려가 앞뒤 해 사람 흐름으로 확인한다(이름으로 미뤘다가 세 번 틀렸다). ⚠️ 친구가 답을 적은 엑셀 위에 다시 만들지 말 것 — 새 판은 다른 이름으로.
  설계·근거는 성경암송 `docs/analysis/2026-10-06-ministry-stats-options.md` · `2026-10-06-work-ministry-dept-lineage-draft.md`.
- **📊 사역 통계(2026-10-06 운영 · 메뉴 `mn-stats` · 역할 ministry + 총괄 · 읽기만):** 설계 v2 `docs/superpowers/specs/2026-10-06-ministry-stats-design.md` · 계획 `…/plans/2026-10-06-ministry-stats.md`.
  SQL 013(`mh_key` · 표 `ministry_dept_map` 이음표 · `ministry_list_gaps` 명단이 일부인 해 · 함수 `ministry_stats_facts()` — 사람을 그 부름 안의 번호로 바꾼 재료 jsonb 하나) + 013b(이음표 씨앗 493줄 — `dept_lineage_draft.py --seed-sql` 로 다시 만든다) → 서버 `ministry-stats.ts`(순수 `buildStats` · 세는 규칙 전부) → 액션 `ministryStats` → 화면 `js/menus/ministry/stats.js`(+ `stats-logic.js`).
  ⚠️ 응답·화면에 이름·교인ID·사람 번호·태어난 해를 싣지 않는다(묶음 숫자와 부서·팀 이름뿐 · 시험이 지킨다). 나이·성별·직분은 그 해 봉사자 30명부터, 1~4명 칸은 「5 미만」.
  ⚠️ 명단이 일부인 해(`ministry_list_gaps`)는 견주는 해로 쓰지 않는다 — 안 그러면 「돌아옴」이 부풀려진다. 지금 넷은 **숫자로 미룬 후보**(사역 담당 확인 전) — 확인이 오면 이 표를 고친다. `tools/history/stats_check.py` 의 GAPS 도 같이.
  ⚠️ 떠난 분을 가르는 못 이은 까닭 글자(`history-match.ts` R_NONE·R_KID·R_MISFIT·R_HAND_NONE·R_MANUAL_NONE)가 SQL 013 에도 있다 — 바꾸면 둘 다(`tests/ministry-stats.test.mjs` 가 맞댄다).
  진짜 자료 대조(이 PC): `python tools/history/stats_check.py` — 통합 엑셀로 TS 세기와 따로 센 값을 맞댄다(2026-10-06: 7,803칸 같음 · 이름 기준 어림이라 운영 수와는 다르다).
  운영 반영 2026-10-06: SQL 013·013b → 함수(내려받아 대조 뒤) → 푸시(5bd97f0). 재료 17,848줄 · 이음표에 없는 쌍 0 · 교인 1,682 · 떠난 분 577 · 못 정한 197(운영 묶음 수).
- 개발 DB 씨앗: `node --experimental-strip-types tests/seed-history-dev.mjs [--clean]`(source_file `ca-demo-seed`).
- 쓰기 액션은 쓴 뒤 바로 기록하고, 다시 맞추기는 try/catch — 실패하면 응답 rematched:false(화면이 「🔄 다시 맞추기」를 권한다).
- 줄 응답의 in_directory(true/false/null) — 이어 둔 분이 지금 명부에 없으면 화면에 「⚠ 명부에 없음」. 12월 새 명부 뒤 「🔄 다시 맞추기」.
- ⚠️ **12월 새 명부 뒤**: 떠난 분에게 자동으로 이어진 줄은 다시 맞추기(🔄 · 또는 아무 올리기 — 올리기도 모든 자동 줄을 다시 맞춘다)가 비우거나 동명이인에게 옮길 수 있다(「⚠ 명부에 없음」은 사람이 이은 줄에만 남는다) — 🔄 전에 「근거 약한 줄만」으로 확인(설계 §3.3 · 처리는 12월 새 명부 때 정하기로 2026-10-01 친구 결정).
- 개인정보 안내 `privacy.html` 8번(+6번 쓰는 곳·보는 사람·기록) — 모으는 것·보는 사람이 바뀌면 함께.
- 올리기 살펴보기(`historyUploadCheck`)도 교인명부에 묻는다 — 새 줄이 있고 명부가 있으면 `people.lookup`(`from:"history-check"` · `{asked, askedNames(상한 없음 — 한 번에 받는 줄이 이미 HISTORY_MAX_UPLOAD 로 묶인다), count}`) 한 줄(「교인명부 기록」 · 이어진 수가 생년·등록연도의 답이 된다 · 2026-10-01 최종 검토). 줄 창 후보는 `from:"history"`(지금 이어진 분을 끝에 더했으면 `extra:1`) · 고치기 창에서 후보에 영향 줄 칸을 고쳐 다시 맞췄으면 `from:"history-edit"`(`{q: 고친 뒤 이름, count: 이번에 이어졌으면 1 아니면 0}`).
- 여러 해를 넣으면 묶음마다 받은 수는 다른 해로 이어진 줄을 못 센다 — 화면은 넣은 뒤 다시 불러온 해마다 요약으로 최종 수를 보인다. 새 줄은 「아직 맞추지 않음 — 🔄 다시 맞추기」 사유로 들어가고 다시 맞추기가 덮는다.
- 찾기 칸(2026-10-02 · `history-db.ts` `historyFilter` — 목록·내려받기 공용 · 40자): 빈칸·「+」·「,」로 가른 낱말이 **모두** 맞는 줄(낱말마다 이름·목장·부서·팀·직책·직분 중 하나 · 목장 끝 「목장」은 떼고도 본다 · 동명이인은 「이름 목장」으로). `#숫자` 는 교인ID — `directory`·`super` 만(사역신청 역할은 `need-directory` · 화면 안내 「교인ID 는 #번호」도 full 일 때만) · `#` 없는 숫자는 글자(목장 번호). 내려받기 기록은 `search:true` 만.
- 한 번에 3,000줄(`HISTORY_MAX_UPLOAD`) · 화면은 해마다 나눠 보낸다(`sendParts`). 「이분」·「이분 아님」·「되돌리기」는 줄의 `updated_at` 을 `expect` 로 보낸다(없으면 잠그지 않는다 — 교인명부 세션 옛 부름). `ministry_history_apply` 는 읽었던 맞춤 상태(`old_*`)까지 맞아야 쓴다.
- 나중: 「이력으로 넘기기」(2027 임명확정 → 이 표 · `order_id` · 교인ID 는 교인명부 세션의 `people_links` 에서) — 설계 §8.

## 교육 (2026-10-05 운영 개시 · 성도님 쪽은 게이트 닫힘)

- 메뉴 📚 **강좌 관리**·📝 **신청 현황** — 역할 `education`(SQL 010). 액션은 `edu-db.ts` · 순수 규칙 `edu-rules.ts` · 화면 `js/menus/education/`.
- **강좌별 담당자(2026-10-05 · SQL 011):** 역할 둘 — `education` = **교육 총괄**(강좌·회차·복사·담당자 지정 · 모든 강좌) · `educourse` = **교육 담당(맡은 강좌)**(📝 신청 현황만 — 목록·상태·대신 등록·교재비·메모·엑셀).
  담당 줄은 이 저장소 표 `edu_course_staff`(강좌, 담당자 `admin_members.id`, `kind` manager · 2단계 teacher). `ACTION_ROLES` 값이 **배열이면 그 가운데 하나**(메뉴는 `roles: [...]` · `menuRoles`).
  ⚠️ 「맡은 강좌만」은 **서버가** 강좌마다 본다(`edu-db.ts` `mayTouch` — 신청 줄은 그 줄의 강좌를 먼저 읽는다) → 아니면 `not-assigned`(아무것도 쓰지 않음) · `eduCourses` 는 맡은 강좌만 준다(`scope`) · 명부 찾기도 `course_id` 가 맡은 강좌여야. 새 교육 액션을 둘 다에게 열면 `mayTouch` 를 꼭 지나게.
  역할을 빼거나 정지해도 담당 줄은 **남긴다**(`canCall` 이 이미 막고 정지는 잠깐일 수 있다) → `courseOut.staff` 의 `stale:true`(카드에 흐리게 「(역할 없음)」) · `eduStaffSet` 은 **새로 더하는 분만** 후보 확인(남긴 stale 분은 그대로 저장 · 조용히 빼지 않는다).
- **출석부(2단계 · 2026-10-05 · SQL 012 역할 `teacher` 「강사」 · 개발만):** 액션 `eduAttend*` 일곱(역할 education·educourse·teacher) — 강좌 확인은 `mayTouch(ctx, id, attendKinds(roles))`(강사 = teacher 줄 · 교육 담당 = manager·teacher 줄). ⚠️ **강사를 신청 현황 액션(`EDU_BOTH`)에 넣지 않는다.** 쓰기는 v2 SQL `edu_attendance_set`·`edu_attendance_bulk` 만 · `eduAttendSet` 은 회차의 강좌로 확인(몸통 course_id 를 믿지 않음) · 응답에 `marked_by` 없음 · 사람×회차는 `allRows`. 출석률 `eduAttendRate` 는 성경암송 `js/edu.js` 와 **같은 글자**(함수 앞에 export 를 붙이지 말 것). 강사 지정은 `eduStaffSet`·`eduStaffCandidates` 의 `kind:'teacher'` · 카드 `courseOut.teachers`. ⚠️ **회차 저장은 id 로**(검토 반영) — `eduSessions` 가 주는 회차 `id` 를 고칠 줄에 그대로 실어 `eduSessionsSave` 로 보낸다(id 없는 줄 = 새 회차 · 목록에 없는 회차 = 지움 · `no` 는 차례만 · 출석 있는 회차를 빼면 `has-attendance`·`nos`). `eduAttendSet` 은 `state === null` 만 지움(빈 글자 `bad-state`) · 지우기는 확정이 아닌 줄에도 된다(합치기 `merge-edu-attendance` 를 푸는 길). 개발 시험 `tests/attendance.dev.test.mjs`.
- ⚠️ **표·SQL 함수는 성경암송 저장소 `supabase/edu.sql` 의 것**(관리 화면 전용 `edu_course_staff` 만 여기 011) — 칸·제약·RLS 를 여기서 바꾸지 않는다. 상태는 SQL 함수(`edu_apply(p_staff)`·`edu_cancel(p_staff)`·`edu_staff_set`·`edu_course_refill`·`edu_sessions_replace`)로만 바꾼다. **함수가 새 SQL 함수를 부르면 그 SQL 이 운영에 먼저**(함수 → 화면 순서와 함께).
- **대신 등록(명부):** 교인ID 는 화면에 안 나간다 — `eduPeopleLookup` 후보 → 화면이 `{name, pick, check:{who_type, group, sub, church_mok, position}}` → 서버가 같은 찾기(`lookupFetch`)를 다시 돌려 확인(`changed`). 앱 계정과 정확히 하나가 맞을 때만 그 계정에, 아니면 `ident_key = person|<교인ID>`. 반려했던 분은 `was-declined` → 확인 → `force`(「반려 유지」).
- **「같은 분일 수 있어요」**(`maybeDup`) — 살아 있는 줄 가운데 이름이 같고 앱 줄·담당자 줄이 섞인 묶음. 근본(앱 계정과 잇기)은 성경암송 계획 과제 11.
- 정원을 늘리는 저장에만 `edu_course_refill`(대기자 차례로 확정 · 응답 `promoted`) · 회차 저장은 `edu_sessions_replace` 한 번에(id 보존 · 끝난·보관 강좌 `course-closed`).
- 응답 칸은 `courseOut`·`enrollOut` 이 정한다(`user_id`·`ident_key` 없음) · 기록 `edu.*` 는 id·수만 · 명부 찾기는 `people.lookup` `from:"education"`.
- 지우는 길 없음(`on delete restrict`) — 시험 강좌는 `archived`. 노트·함정 전체는 성경암송 `docs/notes/education.md`.
- **수료(3단계 · 2026-10-05 · 개발만):** 액션 `eduCertList`·`eduCheckSet`·`eduCertIssue`·`eduCertRevoke`·`eduCertPrint`(역할 `EDU_BOTH` · manager 줄 · ⚠️ 강사 아님) · `eduCertSettings`·`eduCertSettingsSave`(교육 총괄만 · 서버도 `eduChief`). 수료·번호·확인 체크는 v2 SQL `edu_issue_certs`·`edu_revoke_cert`·`edu_check_set` 만 — **번호를 여기서 짓지 않는다**(SQL `edu_cert_take` 한 곳). 번호 차례 = `certIssueOrder`(이름 가나다 → 소속 → id)로 세워 보낸 배열 차례. 직인은 PNG·JPEG data URL(머리 바이트까지 · 풀어서 300KB · `checkCertSeal`) · 보낸 칸만 저장 · 기록 `edu.cert.settings` 는 바뀐 칸 이름만. `maskName`(한 글자 이름도 `*`)·`eduCertNoValid`·`eduCertBody` 는 성경암송 api 와 **같은 글자**(함수 앞에 export 금지 · 지문 시험). **살아 있는 수료 줄**(번호 있고 취소 아님)은 `eduEnrollSet` 이 `has-cert` · 수료를 취소한 줄은 취소·반려 된다(번호는 그 줄에 남아 다시 안 쓰임 · 진위 확인 「취소됨」). 개발 시험 `tests/certs.dev.test.mjs`(설정·번호 차례를 시작 전 값으로 되돌린다).
  화면(2026-10-05 · 개발만) 🎓 **수료**(`certs.js` · 역할 education·educourse — 강사 없음) · 수료증 한 장은 `cert-template.js` 하나(인쇄·인쇄 미리보기·설정 미리보기) — 자리 `CERT_GEOM`(cqw)은 성경암송 `js/edu.js` `EDU_CERT_GEOM`(앱 캔버스)과 **같은 값**(두 시험 지문) · 인쇄 `@page`(A4 가로·여백 0)는 인쇄 판을 연 동안만 `<style>` 로 · 명조는 그때 구글 글꼴로(이름을 `text=` 로 보내지 않는다) · 직인은 화면이 600px·흰 바탕 투명·GIF→PNG·300KB 안으로 다듬어 보낸다 · 「⚙️ 수료증 설정」 단추는 총괄(education·super)에게만.
- **확정 알림(4단계 · 2026-10-05 · 개발만):** `eduEnrollSet`(확정 → 그 줄 · 다른 op 의 `promoted` → 「자리가 나서」 · `edu_staff_set` 이 `already`(이미 그 상태 — 낡은 화면에서 다시 누름)면 부탁하지 않는다 · 2026-10-06)·`eduEnrollAdd`(앱 계정 + 확정 + `already` 아님)·`eduCourseSave`(`edu_course_refill` 의 `ids`)가 **저장·기록이 끝난 뒤** `edu-db.ts` `withNotify` → `index.ts` `notifyEduConfirmed` → 성경암송 api 내부 액션 `internalEduNotify`(서비스 키 `x-internal-key` · 임명 알림과 같은 `appApiInternal` · 8초). ⚠️ 알림이 실패해도 저장은 성공 — 응답에 `notified`·`notifyError` 만 더한다(던지지 않는다). 같은 신청에 한 번·확정·앱 계정 확인과 「교육이 열리기 전(`eduOpen` 이 true 아님)에는 🧪 시험 참여자에게만」은 api(`eduNotifySend` · SQL `edu_notify_claim`) 몫 — 여기서 걸러 내거나 알림 기록을 쓰지 말 것. 배포 차례 v2 SQL(`edu.sql`) → v2 `api` → 이 함수(이 함수가 먼저 나가면 알림만 `notify-failed`). 노트 v2 `docs/notes/education.md` 「앱 알림」.
- **출석부(2단계 · 2026-10-05)** — 메뉴 ✅ 출석부(역할 `education`·`educourse`·`teacher`) · 강사(`teacher`)는 `edu_course_staff.kind='teacher'` 로 맡은 강좌만 · 신청 현황 액션은 못 부른다 · 출석은 SQL `edu_attendance_set`·`_bulk` 만(확정자만 · 같은 강좌 · 마친 강좌 `course-closed`) · 출석률 `eduAttendRate`(지각=출석 · 공결 뺌) 세 곳 지문 시험 · ⚠️ 회차는 **id 로** 맞춘다(`eduSessionsSave` 가 id 를 품고 보낸다 · 번호는 차례 · 「이대로 채우기」는 일부러 id 없이 — 차례로 id 를 잇지 말 것 · 출석 있는 회차 지우기는 `has-attendance`).

## 봉사 당번 (2026-10-06 운영 반영 · 1단계 담당자 화면 · 2단계 성도님 앱 — 문은 닫힘)

- 묶음 「봉사 당번」: 🧰 **당번 관리**(역할 `duty` = 당번 총괄) · 📅 **당번 명단**(`duty` · `dutylead` = 당번 담당 — 맡은 당번만) — SQL 015.
  액션 `duty-db.ts`(20개) · 순수 규칙 `duty-rules.ts` · 화면 `js/menus/duty/`(`duty-logic.js` 시험 · `board-form.js` · `boards.js` · `roster.js` · `roster-forms.js`) · CSS 접두사 `dty-`.
- ⚠️ **표·SQL 함수는 성경암송 저장소 `supabase/duty.sql` 의 것**(여기 015 는 역할 둘과 `duty_board_staff` 뿐) — 칸·제약·RLS 를 여기서 바꾸지 않는다.
  **상태는 SQL 함수로만 바꾼다**(`duty_apply(p_staff)`·`duty_cancel(p_staff)`·`duty_restore`·`duty_move`·`duty_note_set`·`duty_day_set`·`duty_days_off`·`duty_slot_set`·`duty_slot_delete`·`duty_line_save`·`duty_line_remove`·`duty_date_add`·`duty_ask_clear`).
  이 함수가 표에 직접 쓰는 것은 둘뿐: 당번 설정(`duty_boards`) · 담당자 줄(`duty_board_staff`).
  ⚠️ **`duty_signups` 에는 직접 쓰지 않는다**(담당자 메모 한 칸도 `duty_note_set`) — 직접 update 하면 성경암송의 쓰기 연결 트리거가 「줄 → 전역 잠금」 차례로 잠가 그 줄을 빼거나 옮기는 SQL 함수와 교착한다.
  **함수가 새 SQL 함수를 부르면 그 SQL 이 운영에 먼저.**
- 뼈대: **당번(board) → 자리 틀(line: 요일·예배·일·시각·정원) → 날짜(day: 쉼·확정·메모) → 자리(slot) → 지원(signup)**. 자리는 읽을 때 저절로 생긴다(`duty_ensure_slots` — 오늘 ~ 보이는 기간 · 끝 날짜까지). 요일 없는 틀은 「날짜 더하기」로(한 번짜리 모집).
- ⚠️ **「맡은 당번만」은 서버가** 본다(`duty-db.ts` `mayTouch`) → 아니면 `not-assigned`(읽지도 쓰지도 않음).
  **당번은 줄에서 읽는다** — 자리 번호 → 자리 줄의 당번 · 지원 번호 → 자리 → 당번 · 틀 번호 → 틀 줄의 당번(`slotBoard`·`signupBoard`·`lineBoard`). 몸통의 `board_id` 를 믿지 않는다. 새 액션을 둘 다에게 열면 이 길을 꼭 지나게.
  옮기기의 도착 자리는 SQL 이 같은 당번인지 본다(`wrong-board`) · 날짜 더하기의 틀도 SQL 이 본다(`bad-lines`).
- ⚠️ **총괄만 되는 일의 거절은 `chief-only`**(만들기 · 이름 · 준비 중·보관 · 담당자 지정) — `forbidden` 을 돌려주면 화면이 통째로 다시 부팅한다. 담당은 받는 중 ↔ 지원 멈춤과 설명·장소·문의·기간만.
  담당에게 가는 응답에는 **담당자 번호를 싣지 않는다**(이름만 — `boardOut`·`staffNames`).
- **당번 설정 저장의 세 멈춤**(`dutyBoardSave`): ① `changed` — 창을 연 뒤 다른 분이 고쳤다(화면이 창을 열 때 본 `updatedAt` 을 `base` 로 보낸다 → 창을 닫고 새로 불러온다 · 낡은 창이 보관·지원 멈춤·끝 날짜를 되돌리지 않게)
  ② `has-upcoming` — 앱에서 안 보이게 되는 상태(준비·보관)인데 앞날에 선 분이 있다 → 확인 → `force` ③ `has-after` — 끝 날짜를 당기는데 그 뒤에 선 분이 있다 → 확인 → `force_after`. ②③ 은 **따로 묻고 따로 답한다**(둘 다면 두 번).
  지우는 길 없음(시험 당번은 `archived` — 보관한 당번은 쓰기 거절 · 명단은 읽힌다).
- **잠금은 표에 쓰는 값이 아니다** — SQL 이 그때그때 셈한다(담당자 확정 또는 전날 19:00 KST 지남). 「19시」는 SQL `duty_cutoff` 한 곳 — 화면은 서버가 준 `cutoff`·`locked` 만 쓴다(`cutoffText`). 확정 풀기는 마감 전에만(`too-late`) · 자리가 없는 날은 확정하지 않는다(`no-slots` — 화면도 그 단추를 두지 않는다).
- **쉬는 날은 스위치** — 지원 줄을 건드리지 않는다. 화면은 먼저 세고(`expect` 없이 = `dry`) → 그 수를 확인 창에 → `expect` 로 쓴다(그사이 바뀌면 `changed`). 메모: 쉬는 날로 = 그 기간의 쉬는 날 모두 · 다시 열기 = 이번에 연 날에만. 기간은 오늘 + 400일 안(날짜 줄은 지울 길이 없다).
- **끝 날짜(`until_date`)** — 그 뒤 자리는 앱에 안 보이고 지원도 안 받는다(`after-until`) · 자리·줄은 지우지 않는다(늦추면 살아난다) · 저장 뒤 응답 `after` · 카드 `counts.after`.
- **넣기·옮기기·다시 넣기의 정원·겹침**은 SQL 이 알려 준 뒤(`full`·`overlap` — full 에 겹친 자리 `with` 도 함께 온다) 확인 한 번으로 `force`. 겹친 자리 이름은 **같은 당번일 때만** 화면에 싣는다(`overlapForStaff` — 맡지 않은 당번의 이름을 싣지 않는다). 이미 겹쳐 선 줄은 명단에 「시간 겹침」(`overlap`).
- 담당자가 넣은 줄(`source staff`)은 본인이 앱에서 못 뺀다 · 담당자가 뺀 줄은 본인이 못 되살린다 → **잘못 뺐으면 「빠진 분 → 다시 넣기」**(`dutySignRestore` — 그 줄 그대로) · 「못 가게 됐어요」 표시는 빼기·옮기기가 지우고, 통화로 풀렸으면 「표시 거두기」(`dutyAskClear`).
- **남은 자리**(`leftover` — 뺀 틀·요일을 바꾼 틀의 자리)는 앱에서 새 지원을 안 받는다. 담당자는 넣고 옮길 수 있다 — 화면이 그 자리에 안내를 달고, 남은 자리뿐인 날의 칩은 「남은 자리」. 요일을 바꾼 틀의 남은 자리는 「날짜 더하기」로 다시 살린다(응답 `reopened`).
- **명단 기간** — 화면은 `from`(오늘 − 불러온 날 수)만 보낸다. 서버가 앞날(가장 먼 날짜 줄까지 · 오늘 + 400일)과 지난 날(오늘 − 400일)을 **따로** 자른다. 「지난 날 더 보기」는 52주까지(`maxBack`). 보이는 기간 밖에 더해 둔 날은 `notYet`.
- **대신 넣기(명부):** 교육과 같은 길(`dutyPeopleLookup` → `{name, pick, check}` → 서버가 같은 찾기를 다시 · `personPick` 은 교육과 **같은 함수**) — **맡은 당번의 창에서만**(총괄도 `board_id` 필수 · 보관 당번은 찾기 전에 거절) · 기록 `people.lookup` `from:"duty"`(거절된 넣기도 `pick:true` 로 남는다).
  계정 없는 줄로 서 있던 분을 이번에 앱 계정까지 찾아 다시 넣으면 SQL 이 그 줄에 계정을 잇는다(`already` + `linked`) — 「이미 서 계세요」지만 쓴 것이 있으므로 기록(`duty.sign.add` `linked:true`)을 남기고 잠긴 날이면 알린다.
- 응답 칸은 `boardOut`·`rosterOut` 이 **하나씩 골라** 옮긴다(`user_id`·`ident_key`·`confirmed_by` 없음). `pk` = 같은 분 표식(SQL 이 응답마다 새 소금으로) → 같은 날 「이름은 같은데 pk 가 다른 줄」에 `maybeDup` 을 달고 **pk 는 버린다**.
  SQL 함수의 거절도 그대로 돌려주지 않고 `error`(+정한 칸)만 옮긴다(`applyFail`). 기록 `duty.*`(16가지)는 id·수·날짜만(이름·메모 글 없음 · target = 당번 id).
- ⚠️ **화면이 사실대로 말하게 하는 세 스위치**(`duty-logic.js` — 바꿀 때 시험 한 줄도 함께): `APP_LIVE`(성경암송 앱에 당번 화면이 있는가 — **2026-10-06 2단계를 운영에 올려 `true`** · 그래서 문이 닫힌 동안 화면이 「🧪 시험 참여자만 볼 수 있어요 · 선 분의 이름이 시험 참여자 앱에 보여요 — 진짜 명단은 준비 중에」(`TESTERS_SEE_NAMES`)라고 말한다 · 플레이스토어 앱에서는 시험 참여자에게도 심사 동안 안 보인다) · `NOTIFY_LIVE`(앱 알림이 나가는가 — **2026-10-07 3단계를 운영에 올려 `true`** · 문이 닫힌 동안에는 알림도 시험 참여자에게만 간다 — `appNote` 가 「앱 알림도 시험 참여자에게만 가요」라고 말한다) · `PLAY_HIDDEN`(플레이스토어 앱에서 🙋 단추를 숨겨 둔 동안 `true` — 성경암송 `app.js` 의 `MINISTRY_HIDE_ON_PLAY` 를 `false` 로 뒤집는 날 함께 `false` · 문이 닫힌 동안의 두 글에 「플레이스토어 앱에서는 … 크롬으로 열어 확인」이 붙는다).
  넣기 창의 한 줄(`ADD_NOTE`)은 「넣은 분의 이름이 앱 당번표에 보인다 · 「못 가게 됐어요」는 명단의 표시일 뿐 담당자께 알림이 오지 않는다」를 말한다 — 성도님 앱도 「알렸어요」가 아니라 「당번표에 표시했어요 · 급하시면 직접 연락」이라 말한다.
  `appNote(appOpen)` 이 두 화면 머리의 한 줄을 고른다: 화면이 없다 → 「지금 넣는 것은 준비예요」 / 화면은 있고 문(`app_config.dutyOpen` → 응답 `appOpen`)이 닫혔다 → 「시험 참여자만」 / 알림이 아직이면 「따로 알려 주세요」. 「받는 중」 확인 글(`openWarn`)도 같은 값을 본다.
- ⚠️ **「앱에 날짜가 안 보여요」는 앱이 보여 주는 범위의 자리가 0 일 때만 말한다**(`emptyKind` — 2026-10-06 친구 제보 + 그날 밤 검증). 성도님 앱(`duty_board_view`)은
  오늘 ~ 오늘+보이는 기간 · 끝 날짜까지의 **자리가 있는 날**만 싣는다. 재료는 그 범위로 센다: 당번 카드는 서버의 `counts.shown`(성경암송 SQL `duty_board_counts` — 옛 SQL 이면 칸이 없어 `slots` 로 본다 ·
  `boardOut` 은 SQL 이 줄 때만 싣는다) · 명단은 날짜의 `past`·`notYet`·`afterUntil`(`seenOfRoster`).
  까닭 다섯: 틀도 자리도 없음(`no-lines`) · 틀은 없는데 남은 자리의 날짜·이름은 앱에 보임(`leftover` — 「날짜가 안 보여요」라고 하면 거짓 · 수 칩 줄도 그대로 그린다) · 끝 날짜 지남(`until-past`) ·
  자리가 모두 보이는 기간 밖(`later` — 김장처럼 먼 날짜를 더해 둔 당번 · `slots` 만 보면 놓친다) · 틀은 있는데 날짜 없음(`no-dates`).
  「받는 중」 확인 글(`openWarn(appOpen, { kind })`)도 같은 까닭을 덧붙이되, 같은 저장이 끝 날짜·보이는 기간을 바꾸면 틀에 관한 말만 한다(저장 뒤의 날짜를 알 수 없다).
  넣기 창의 한 줄은 `addNote(day)` — 지난 날·끝 날짜 뒤·보이는 기간 밖 날에는 「앱 당번표에 보여요」라고 하지 않는다. 날짜 확정 창의 「빈 자리 지원은 계속 받아요」는 받는 중 당번에서만(`confirmDayAsk(d, status)`).
- ⚠️ **알림(3단계 · 2026-10-07 운영)** — 저장·기록 **뒤에** 성경암송 `api` 의 `internalDutyNotify` 로 부탁만 한다(`index.ts` `notifyDuty` → `deps.dutyNotify` · 지원 번호만 보낸다). 실패해도 저장은 성공(`notified`·`missed`·`notifyError`).
  ⚠️ **「N분께 앱 알림을 보냈어요」는 실제로 나간 분 수(`notified`)로만 말한다** — 가지 않은 분(`missed` — 받는 기기가 없다 · 자기 기기가 모두 실패했다)은 「M분께는 앱 알림이 가지 않았어요 — 따로 알려 주세요」로 따로(`notifyTail`). 세는 것은 성경암송 `api` 다(받는 분마다 — 자기 기기 가운데 하나라도 받아들여진 분만 `notified`).
  처음에는 api 가 준 수(글을 만든 분 수)를 그대로 「보냈어요」라고 해, 「알림 꺼짐」 딱지가 달린 분까지 보냈다고 말했다(검토 반영 2026-10-07). 알림을 보내지 못했으면(`notify-failed` · 꺼 둔 `notify-off`) 토스트가 아니라 **창**으로(`roster-forms.js` `sayDone`).
  ⚠️ **꺼 둔 동안(`dutyNotifyOff`)의 창은 알릴 분이 있던 저장에만** — `api` 가 `held`(꺼 두지 않았으면 보냈을 분 수)를 주고, 0 이면 `withNotify` 가 평소처럼 조용히 끝낸다(지난 날 바로잡기 · 준비 중 당번 · 앱 계정 없는 줄 —
  「따로 알려 주세요」는 알릴 분이 있을 때만 참이다 · 모르면(옛 `api`·읽기 실패) 알리는 쪽 · 고침 검토 반영 2026-10-07). `api` 의 답을 옮기는 것은 순수 함수 `duty-rules.ts` `dutyNotifyOut`(시험이 값으로 본다).
  날짜 확정 알림을 부르지 못했을 때의 「다시 확정」 안내는 **약속하지 않는다**(`CONFIRM_RETRY` — 다시 가는 것은 아직 잡히지 않은 줄뿐이다 · 준비 중·보관 당번에서는 말하지 않는다 — `confirmDoneText(r, date, status)`).
  「＋ 넣기」의 알림은 **그 줄의 앱 계정**(SQL `hadUser`)으로 정하고, **되살린 줄(`revived`)은 잠기지 않은 날에도 알린다**(「빠진 분 → 다시 넣기」와 같게 — 그분의 마지막 알림이 「빼 드렸어요」일 수 있다).
  「알림 꺼짐」 딱지는 받는 중·지원 멈춤 당번에서만(`notifyBadges` — 준비 중·보관 당번의 줄에는 어떤 알림도 가지 않는다 · `draftNote` 가 그렇게 말한다). **같은 자리에** 같은 이름의 줄이 또 있을 때 앱 줄을 빼려 하면 말한다(`slotTwins` → `DUP_REMOVE_NOAPP`·`DUP_REMOVE_APP` — 서버가 「빼 드렸어요」를 거르는 범위와 같다 · 다른 자리의 같은 이름에 「이 줄은 두고 앱 없음 줄을 빼 주세요」라고 하면 다른 당번의 줄을 빼게 된다 · 남는 줄이 모두 앱 줄이면 「빼는 분께 따로 알려 주세요」만 · 고침 검토 반영 2026-10-07). 그 글은 **알림이 간다고 약속하지 않는다**(「이 줄을 먼저 빼면 앱 알림을 보내지 않아요」 — 준비 중 당번·지난 날에는 차례를 지켜도 알림이 없다 · 회귀 확인 반영).
  넣기 창은 그 자리의 「빠진 분」에 앱 줄이 있으면 「빠진 분 → 다시 넣기」를 권한다(`addEndedNote` — 「＋ 넣기」가 앱 계정을 못 맞추면 앱에 안 이어진 새 줄이 되어 그분의 마지막 알림이 「빼 드렸어요」로 남는다 · 넣기 **전에** 말한다).
  ⚠️ 확인 창·저장 뒤 글의 수는 **「지원 N건」**(줄 수)이다 — 「N분」이라 하면 저장 뒤의 「N분께 앱 알림을 보냈어요」(사람 수)와 한 화면에서 어긋난다(`confirmDayAsk`·`offAsk`·`hideAsk`·`afterAsk`·`boardSavedText`).
  문·한 번만·앱 계정·오늘 이후 자리·글은 모두 그쪽(`dutyNotifySend`)이 본다 — 여기서 걸러 보내지 않는다. ⚠️ 성경암송 `api` 가 `internalDutyNotify` 를 가진 판이어야 한다(없는 판으로 되돌리면 저장마다 「앱 알림을 보내지 못했어요」 창이 뜬다 — 그때는 **`makeDuty` 에 `dutyNotify` 를 넘기지 않는 커밋**을 함께 올린다: `NOTIFY_LIVE` 만 `false` 로 두면 딱지·안내만 바뀌고 창은 그대로 뜬다 — `withNotify`·`sayDone` 은 그 값을 보지 않는다. 급히 멈추려면 성경암송 `app_config` 의 `dutyNotifyOff` 한 줄이 먼저다 · 차례는 성경암송 `docs/notes/duty-roster.md` 「통째로 걷는 차례」).
- **📅 당번 명단의 달력**(2026-10-07 친구 요청 「어드민에서도 달력으로 확인」 · `roster-cal.js` 가 그리고 규칙은 `duty-logic.js` 의 `cal*`): 날짜가 **넷 이상**이면(`calUse` — 성도님 앱과 같은 수) 날짜 칩 줄 대신 달력으로 고른다.
  칸은 칩과 **같은 판정**(`calCell` = `dayChip` + 수 — 칸의 뜻을 따로 짜지 않는다)에 「채워진 인원/필요 인원」을 더한다: 쉬는 자리는 세지 않고 · 남은 자리는 서 있는 분만 · 정원을 넘긴 자리는 정원까지 → **필요 − 채워진 = 서버의 `need`**(시험이 본다).
  PC(1024px~)는 달력 옆에 그날 판(`.dty-split`), 폰은 달력 아래 — 달력에서 날짜를 누르면 그날 판이 보일 만큼만 굴린다(`revealBy` · 칩·달 단추는 굴리지 않는다). 달 단추·날짜 누름은 서버를 부르지 않는다.
  다시 그리면 눌렀던 단추가 사라지므로 **초점을 돌려준다**(`calFocus` — 한 번 쓰고 지운다 · 못 불러온 뒤에 남기지 않는다). 「◀ 지난 날」은 4주 더 불러와 보던 달에 새 날짜가 없으면 새로 생긴 앞 달로 가고(`olderPick`),
  새 날짜가 없으면 그렇다고 말한다(`olderText` — 못 불러왔을 때는 「없어요」라고 하지 않고 불러온 날 수를 되돌린다). 날짜가 하나도 없는 당번(끝난 한 번짜리 모집)에도 「◀ 지난 날 더 보기」를 둔다.
  ⚠️ 색은 새로 만들지 않는다(칩이 쓰는 값 + 토큰 · 시험이 글자 값을 센다) · ⚠·🔒 는 칸 맨 위 띠에 놓아 좁은 폰(칸 37px)에서도 숫자에 얹히지 않는다 · 고른 날 규칙(`.on`)은 뜻 색·공휴일 색 **뒤에** 둔다(같은 무게라 뒤가 이긴다).
  시험 `tests/duty-cal.test.mjs` — 규칙 · 달력 조각 · **명단 화면을 가짜 화면에 그리고 눌러 본다**(달 옮기기 · 굴리기 · 지난 날 · 초점 · 칩으로 물러서기). 모양·대비는 브라우저에서(스크래치의 탐침 — 일곱 크기).
- ⚠️ **공휴일 표(`js/menus/duty/holidays.js`)는 성경암송 앱 `js/duty.js` 의 `DUTY_HOLIDAYS` 와 같은 표다** — 달력의 빨간 날짜(일요일은 칠하지 않는다 · 당번이 없는 날도 · 이름은 풀이에). 한쪽만 고치면 성도님과 담당자가 다른 달력을 본다:
  두 저장소의 시험이 **같은 지문**을 본다(표를 고치면 떨어지며 새 값을 보여 준다). 음력·대체공휴일을 **코드로 셈하지 말 것** — 2026년에 노동절·제헌절이 공휴일이 됐고, 2027·2028년 설날은 중국 춘절보다 하루 늦다.
  표는 2028-12-31 까지(2027년 6월 말 「2028년 월력요항」과 대조 · 2028년 가을에 2029년 줄 · 임시공휴일은 한 줄). 근거·고치는 차례 = 성경암송 `docs/notes/duty-roster.md` 「공휴일」.
- 엑셀 두 시트: 「당번표」(날짜 × 자리 틀 · **이름만** — 벽에 붙는다) · 「명단」(한 분 한 줄 · 소속·넣은 곳 · **메모 없음**).
- 개발 시험 `tests/duty-notify.dev.test.mjs`(알림 잇기 — 이 함수가 성경암송 `api` 의 답(`notified`·`missed`·`notify-off`·`held`)을 실제로 옮기는가 · 다른 시험은 가짜 `dutyNotify` 로 규칙만 본다 · 개발 `dutyOpen`·`dutyNotifyOff` 를 잠깐 바꿨다 되돌린다 — 스위치가 이미 켜져 있으면 멈추고 그 줄을 건드리지 않는다) · 화면·함수의 배선은 `tests/duty-logic.test.mjs` 끝의 글자 검사(`roster.js`·`roster-forms.js`·`index.ts` 가 그 규칙을 실제로 쓰는가).
- 개발 시험 `tests/duty.dev.test.mjs`(16가지 — 맡은 당번만 · 줄 번호로도 · 다시 넣기 · 겹침 · 끝 날짜 · 낡은 창 · 기록에 이름 없음 · 공개 키·로그인 사용자로 안 열림). 규칙·동시성 시험은 성경암송 `supabase/tests/duty_rules.dev.sql` · `tests/duty-concurrency.dev.sh`.
- 설계·노트(운영 반영 차례 · 되돌리기 포함): 성경암송 `docs/superpowers/specs/2026-10-06-duty-roster-design.md` · `docs/notes/duty-roster.md`.

## 새가족 (2026-10-07 · 1~4단계 개발 반영 · 운영 전)

종이 「새가족 등록카드」 → 섬김이 배정 → 섬김이 교육 네 번 → 새가족 목사님 교육 → 섬김이 보고서 → 교구 배정(여기까지 등록 절차) → 등록식(수료번호).
**성도님 앱에는 아무것도 없다**(내부 담당자만). 설계 v2 `docs/superpowers/specs/2026-10-07-newfamily-design.md` · 담당자용 기획서 v2 `newfamily/`.
- 묶음 「새가족」: 🌱 **새가족 카드** · 👣 **새가족 현황** · 🎉 **등록식** · 📊 **새가족 통계** · 🧑‍🤝‍🧑 **함께 쓰는 분** — SQL 016.
  액션 `nf-db.ts`(28개) · 순수 규칙 `nf-rules.ts` · 화면 `js/menus/newfamily/`(`nf-logic.js` 시험 · `cards.js`·`card-form.js`·`photo.js`·`board.js`·`record.js`·`ceremony.js`·`stats.js`·`staff.js`) · CSS 접두사 `nf-`.
- **역할 둘**: `newfamily` = 새가족 운영팀(전부) · `nfteam` = 새가족 섬김 — **하는 일은 `nf_staff.kind`**(greeter 영접팀 · lead 정착팀 총무 · helper 섬김이 · pastor 새가족 목사님 · 여럿 가능).
  ⚠️ 「자기 것만」은 **서버가** 본다(`nf-db.ts` `viewOf` → `nf-rules.ts` `canCardRead`·`canAssign`·`canLessonRead`·`canLessonWrite`·`canPastor`) → 아니면 `not-assigned` · 운영팀만 되는 일은 `chief-only`(`forbidden` 을 돌려주면 화면이 통째로 다시 부팅한다).
  새 액션을 `NF_BOTH` 로 열면 이 갈래를 꼭 지나게. `nfteam` 역할이 없으면 `nf_staff` 줄이 남아 있어도 아무것도 못 한다.
- ⚠️ **새가족은 아직 교인이 아닌 분이다 — 하는 일마다 보는 칸이 다르다**(`nf-rules.ts` `personOut` 한 곳). 섬김이에게는 주소·생일·가족·사진이 가지 않고, 영접팀·총무에게는 교육 줄의 내용이 가지 않는다.
  줄을 통째로 돌려주지 말 것 · 응답에 `auth_user_id`·교인ID 없음 · 「바꾼 기록」 `nf.*` 에 새가족의 이름·전화·교육 내용 없음(줄 id·수만).
- ⚠️ **운영팀이 「승인」을 한다**(`nfStaffApprove` · 친구 2026-10-07): 대기 중인 분을 active 로 만들며 **`nfteam` 하나만** 준다 — 몸통의 역할 이름을 받지 않는다.
  건드릴 수 있는 분은 대기 중인 분과 이미 `nfteam` 인 분뿐(`not-team`). 뺄 때는 `nf_staff` 줄과 `nfteam` 만(다른 역할·승인 상태는 그대로). 이 액션을 넓히지 말 것.
- **단계는 저장하지 않는다** — `stageOf(person, 교육 줄 수)` 가 사실에서 읽는다(`helper_id`·줄 수·`pastor_class_on`·`report_sent_at`·`parish`·`cert_no`·`stopped_at`). 단계 칸을 만들지 말 것(어긋난다).
- **교육 줄 = 섬김이 보고서의 한 줄**(일자·내용·비고 · `nf_lessons`). 따로 쓰는 보고서는 없다. 네 번까지 `lesson`, 그 뒤는 `extra`(횟수에 안 든다).
  같은 날 교육 두 번은 `same-day`(부분 unique 색인) · 보고서를 보낸 뒤에는 줄이 잠긴다(`sent`) — 목사님이 돌려보내야(`nfReportReturn`) 풀린다 · 목사님 교육 뒤에는 줄을 지울 수 없다(`class-done`).
- ⚠️ **수료번호는 SQL 함수 `nf_ceremony_confirm` 한 곳에서만 매긴다**(참석으로 표시한 분 · 이름순 · 그해 `nf_settings.next_no` — 2026년은 201부터, 다른 해는 1부터 저절로).
  `cert_no`·`nf_settings` 를 손으로 고치지 말 것. 확정은 되돌리는 길이 없다 — 확정 뒤에는 빼기·등록식 지우기·교구 바꾸기·그분 지우기가 모두 `confirmed`.
  등록식 명단은 저절로 채우지 않는다(운영팀이 후보에서 담는다) · 후보 = 교구 배정까지 끝난 분.
- **편성 교구**는 교인명부 `church_people.mok3` 에서 끝의 「목장」을 뗀 글자(예 `믿음-35`) — 목록에 없는 글자는 `bad-parish`(명부가 빈 DB 에서는 꼴만 본다). 10분 기억.
- **사진**(카드 사진·환영 사진): 비공개 칸 `newfamily` · 정책 없음(service role 만) · 볼 때마다 5분 서명 주소(`nfPhotoUrl` · 기록 `nf.view`). 화면이 캔버스에 다시 그려 줄인다(긴 변 1600 · 위치 정보 떨어짐) — 원본 파일을 그대로 보내지 말 것.
- **통계**(`buildStats`): 「오신 분」·「수료 대상」은 늘 카드를 쓴 날 · 「등록」만 기준(card·parish·ceremony)을 따른다. 표 머리와 엑셀 맨 위에 기준을 적는다.
- 화면이 본 때(`base`)는 **시각으로** 견준다(`sameTime` — 서버가 돌려준 「…Z」와 DB 의 「…+00:00」).
- 개발 시험: `tests/nf.dev.test.mjs`(지어낸 이름 · 스스로 지우고 그해 다음 번호를 되돌린다). 진짜 카드·명단·사진은 저장소 밖(`C:\Projects\Data\새가족\`)에만 — 개발 DB 에는 지어낸 이름만.
- **남은 것**: ① 카드 사진 판독(`nfCardRead` · Gemini — 실제 카드로 먼저 잰다 · 켜면 `privacy.html` 10번에 바깥 서비스로 보내는 것을 적을 것) ② 인쇄물 여섯 가지 ③ 수료번호를 드린 분의 지우기 ④ 운영 반영(SQL 016 → 함수 → 화면 · 친구 허락 뒤).

## 비상 절차
① **유일한 총괄 관리자가 카카오 계정을 잃었을 때** — 새 카카오로 로그인·등록 → 작업 폴더에서
`select id,name,gu,mok,kakao_nickname from admin_members where status='pending'` 로 id 확인 →
```sql
with m as (update admin_members set status='active', approved_at=now() where id='<id>' and status='pending' returning id)
insert into admin_role_grants (member_id, role_id) select id,'super' from m
```
(이름은 파일에 적지 않는다)
② **사람을 완전히 지우기** — Supabase 대시보드 Authentication → Users 에서 그 카카오 사용자 삭제(admin_members·역할은 cascade, 바꾼 기록은 「지워진 분」)
②-1 **사역 이력을 지워 달라는 요청**(개인정보 안내 4번 요청처로) — 화면의 「빼기」는 표시만이라 이름·교인ID 가 남는다. **개발에서 먼저 같은 문장을 돌려 본 뒤** 운영 작업 폴더에서
`delete from ministry_history where id=<줄 id>`(⚠️ 그러면 같은 원본 파일을 다시 올릴 때 그 줄이 새 줄로 되살아난다) —
되살아나지 않게 하려면 지우는 대신 `update ministry_history set name='', src_note='', person_id=null, link_how='none', match_basis='', match_reason='', deleted_at=coalesce(deleted_at, now()), updated_at=now(), src_key='erased:' || encode(sha256(convert_to(src_key, 'UTF8')), 'hex') where id=<줄 id> and src_key not like 'erased:%'`
(열쇠에도 이름이 들어 있어 해시로 바꾼다 — 올리기 판정 `judgeUpload` 가 `erasedKey` 로 같은 해시를 만들어 「빼 둔 줄과 같음」으로 건너뛴다.
⚠️ `and src_key not like 'erased:%'` 를 꼭 둔다 — 안 두면 같은 문장을 두 번 돌릴 때 이미 해시인 `src_key` 를 또 해시해 `erasedKey` 가 더는 못 맞히는 값이 된다).
그리고 `insert into admin_audit (action, target, detail) values ('history.delete', '<줄 id>', '{"erased": true}')` 로 「바꾼 기록」에 한 줄(이름은 적지 않는다).
⚠️ 정정 신청으로 더한 줄(`src_key` 가 `req:` 로 시작)은 `delete` 하지 말고 해시 `update` 만 — 지우면 그 신청을 누가 「저장」만 해도(빠진 사역은 같은 상태여도 늘 다시 보낸다) 새 줄로 다시 들어간다(해시가 있으면 `history-deleted` 로 막는다).
그다음 그 신청을 📮 「삭제」로 지운다(또는 `delete from ministry_history_requests where id=<신청 번호>` — 신청 줄에 이름·교인ID·글이 남아 📮 와 앱 「내 정정 신청」에 보인다). 그분이 낸 다른 정정 신청도 같은 길로 지운다 —
찾기는 `select id, kind, status from ministry_history_requests where person_id=<교인ID> or user_id=(select user_id from ministry_history_requests where id=<신청 번호>)`(교적을 못 찾은 신청은 person_id 가 비어 user_id 로만 잡힌다).
⚠️ SQL 로 지우면 📮 「삭제」와 달리 `history.request.delete` 기록이 남지 않는다 — `insert into admin_audit (action, target, detail) values ('history.request.delete', '<신청 번호>', '{"id": <신청 번호>, "kind": "<종류>", "status": "<상태>"}')` 로 손으로 한 줄씩.
③ **카카오 Redirect URI** 는 카카오 콘솔 「앱 → 플랫폼 키 → REST API 키」 화면에 있다(「고급 → 로그아웃 리다이렉트」와 다르다)
④ **Client Secret** 을 바꿀 때는 카카오에서 새로 만든 뒤 개발·운영 Supabase Kakao 설정 두 곳을 같은 날 바꾼다.
- 카톡·문자 공유 미리보기는 `index.html` 의 `og:*`(이미지 `img/og-admin.png`, 1200×630, 절대 주소). 새 파일·폴더를 화면에 쓰면 `deploy.yml` 의 `cp` 목록에도 넣는다(안 넣으면 404).
  카카오는 미리보기를 오래 기억한다 — 바꾼 뒤 옛 것이 뜨면 developers.kakao.com/tool/clear/og 에서 `https://admin.onlybible.kr/` 를 지운다.
