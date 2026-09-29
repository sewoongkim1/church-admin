# 고척교회 사역관리 (church-admin · admin.onlybible.kr)

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
- 메뉴 화면은 `route()` 가 새로 만든 `<section>` 에 그린다 — 공용 `#view` 에 이벤트를 달면 다음 메뉴로 새어 간다.
- 응답에 `auth_user_id` 를 싣지 않는다. 담당자 이름을 코드·SQL 파일에 적지 않는다(공개 저장소).
- `supabase db query --linked -f` 의 파일 경로는 link 한 작업 폴더 기준으로 풀린다 — **절대 경로**로 줄 것.
- 주소 `#` 뒤 쿼리에 `code`·`error`·`error_description`·`access_token`·`refresh_token`·`type` 이름을 쓰지 않는다 — supabase-js 가 로그인 값으로 읽는다.
- 카카오 별명·사진은 `identities[kakao].identity_data` 에서 읽는다(`user_metadata` 는 본인이 고칠 수 있다). 사진은 `kakaocdn.net` 만.
- 로그아웃은 `scope:"local"` — 기본값 global 은 다른 기기까지 끊는다.
- 카카오톡 안 브라우저로 열리면 `kakaotalk://web/openExternal` 로 기본 브라우저에 넘긴다(`js/core/inapp.js` · `main.js` `start()`). 로그인하고 돌아온 주소(`?code=`·`?error=`)는 넘기지 않는다 — PKCE 열쇠가 그 브라우저에만 있다.
- 이름·소속에 `" \ , ( ) |` 금지(postgrest `.in()` 이 이스케이프하지 않는다).
- 개인정보 안내는 `privacy.html` — 모으는 것을 바꾸면 이 파일도 함께. 배포 목록(deploy.yml cp)에 들어 있어야 한다.

## 교인명부 (2026-09-29 운영 개시)
dimode(교적 프로그램) 교인목록·사진을 역할 `directory`(교인명부) 담당자가 찾고·보고·내려받는다. 사역 화면에는 **교적 표시**(맞음·확인 필요·없음)만.
설계·계획: v2 `docs/superpowers/specs/2026-09-29-church-people-directory-design.md` · `docs/superpowers/plans/2026-09-29-church-people-directory.md`
- 표 `church_people`(한 분 한 줄 · `household_id` = 세대주 교인ID) · `church_people_imports`(올린 기록 = 화면의 「명부 기준일」) · 비공개 사진 칸 `church-people-photos` — 모두 서버만 연다(SQL 003).
- **새 명단이 오면**(저장소 밖 작업 폴더 `C:\Projects\교인명부_작업\<기준일>\`):
  `python tools/people/parse_people.py "<xls>" --date <기준일>` → `fetch_photos.py --date <기준일>` → `load_people.py --work <폴더> --target prod`(살펴보기) → 수가 이치에 맞으면 `--apply`.
  키는 `~/.church-admin/prod.env`(PROD_URL·PROD_SERVICE_KEY) — CLI 는 새 방식 secret 키를 **가려서** 주므로 옛 `service_role`(JWT)을 쓴다.
- ⚠️ **진짜 명단은 저장소에 절대 안 들어간다**(공개 저장소). `.gitignore` + `tools/leak-scan.mjs`(preflight) + `.githooks/pre-commit`(`git config core.hooksPath .githooks` — 저장소 설정이라 모든 체크아웃이 공유). `--no-verify` 금지.
- ⚠️ **개발 DB 엔 가짜 명부만**(`tools/people/fake_people.py`) — load 가 방향을 거절한다. 빠짐이 5% 넘으면 멈춘다(`--allow-drop` 으로만).
- ⚠️ 원본 대조는 「원본 낱말이 결과 어딘가에 있나」만 본다(칸이 뒤바뀌어도 통과) — **살펴보기의 새로·바뀜·빠짐 수가 평소와 다르면 넣지 말고 멈출 것.** dimode 표 모양이 바뀌어 「기타사항」 뒤에 값 칸이 생기면 지번주소 자리로 들어갈 수 있다.
- 원본 함정: 교회학교 소속 없는 분 전원의 「교사」에 같은 한 사람이 찍힌다(비운다) · 세대주 번호 `0` = 「연결 없음」(가족 없음) · 기타사항은 칸이 아니라 `title` 속성에(올리지 않는다).
- 사역 응답(`ministryList`·`ministryPaper*`)에는 `church:{state,reason}` **두 칸만** — 교적의 연락처·주소·직분을 싣지 않는다. 명부가 없으면 `null`(화면이 표시를 안 그린다).
- 찾기·보기·내려받기는 `admin_audit` 의 `people.*` — 「바꾼 기록」 기본 보기에선 빠지고 「교인명부 기록」 보기에서만 보인다. 이 기록은 명단에서 빠져도 지우지 않는다(개인정보 안내 6번).
- 다음 명단(12월 무렵) 전에 할 다듬기: v2 계획서 끝의 최종 검토 「나중」 목록(옛 기준일 폴더로 덮어쓰기 막기 · 깨진 글자 멈춤 · 씨앗 사진 원자 복사 등).

## 비상 절차
① **유일한 총괄 관리자가 카카오 계정을 잃었을 때** — 새 카카오로 로그인·등록 → 작업 폴더에서
`select id,name,gu,mok,kakao_nickname from admin_members where status='pending'` 로 id 확인 →
```sql
with m as (update admin_members set status='active', approved_at=now() where id='<id>' and status='pending' returning id)
insert into admin_role_grants (member_id, role_id) select id,'super' from m
```
(이름은 파일에 적지 않는다)
② **사람을 완전히 지우기** — Supabase 대시보드 Authentication → Users 에서 그 카카오 사용자 삭제(admin_members·역할은 cascade, 바꾼 기록은 「지워진 분」)
③ **카카오 Redirect URI** 는 카카오 콘솔 「앱 → 플랫폼 키 → REST API 키」 화면에 있다(「고급 → 로그아웃 리다이렉트」와 다르다)
④ **Client Secret** 을 바꿀 때는 카카오에서 새로 만든 뒤 개발·운영 Supabase Kakao 설정 두 곳을 같은 날 바꾼다.
- 카톡·문자 공유 미리보기는 `index.html` 의 `og:*`(이미지 `img/og-admin.png`, 1200×630, 절대 주소). 새 파일·폴더를 화면에 쓰면 `deploy.yml` 의 `cp` 목록에도 넣는다(안 넣으면 404).
  카카오는 미리보기를 오래 기억한다 — 바꾼 뒤 옛 것이 뜨면 developers.kakao.com/tool/clear/og 에서 `https://admin.onlybible.kr/` 를 지운다.
