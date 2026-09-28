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
- 메뉴 화면은 `route()` 가 새로 만든 `<section>` 에 그린다 — 공용 `#view` 에 이벤트를 달면 다음 메뉴로 새어 간다.
- 응답에 `auth_user_id` 를 싣지 않는다. 담당자 이름을 코드·SQL 파일에 적지 않는다(공개 저장소).
- `supabase db query --linked -f` 의 파일 경로는 link 한 작업 폴더 기준으로 풀린다 — **절대 경로**로 줄 것.
- 주소 `#` 뒤 쿼리에 `code`·`error`·`error_description`·`access_token`·`refresh_token`·`type` 이름을 쓰지 않는다 — supabase-js 가 로그인 값으로 읽는다.
- 카카오 별명·사진은 `identities[kakao].identity_data` 에서 읽는다(`user_metadata` 는 본인이 고칠 수 있다). 사진은 `kakaocdn.net` 만.
- 로그아웃은 `scope:"local"` — 기본값 global 은 다른 기기까지 끊는다.
- 이름·소속에 `" \ , ( ) |` 금지(postgrest `.in()` 이 이스케이프하지 않는다).
- 개인정보 안내는 `privacy.html` — 모으는 것을 바꾸면 이 파일도 함께. 배포 목록(deploy.yml cp)에 들어 있어야 한다.

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
