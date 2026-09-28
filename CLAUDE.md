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

## 배포
- 화면: main 푸시 → Actions: preflight → stamp(파일마다 `?v=해시`, 커밋 안 함) → Pages. **bump 없음.**
- 서버: `supabase functions deploy church-admin --no-verify-jwt --project-ref ktpwthwqzgcqcrmsafdo`(개발 먼저) → `xnomlgydifiqiybervtf`.
- SQL: `supabase/sql/` — 개발 먼저. CLI 는 저장소 밖 작업 폴더로만 link 한다(`~/.church-admin/supa-dev`·`supa-prod`). 저장소 루트 link 금지.
- 개발 서버 시험: `set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types --test tests/server.dev.test.mjs`

## ⚠️ 함정
- `--no-verify-jwt` 여도 토큰 검사는 `index.ts` 가 요청마다 한다. **새 액션 = `authz.ts` `ACTION_ROLES` 한 줄 + `tests/server.dev.test.mjs` `PROBE` 한 줄.** 표에 없으면 막힌다(열리는 쪽으로 틀리지 않게).
- `admin_*` 표는 서버만 읽는다. 새 표는 그 자리에서 RLS 켜고 `anon`·`authenticated` revoke.
- 역할 목록은 `admin_roles` 표 한 곳. CHECK·코드 목록에 박지 않는다.
- 확인·알림은 `ui.js` 의 `dialog`/`toast` 만(브라우저 confirm/alert 금지). 저장 중엔 `busy()` 로 단추를 잠근다.
- 메뉴 화면은 `route()` 가 새로 만든 `<section>` 에 그린다 — 공용 `#view` 에 이벤트를 달면 다음 메뉴로 새어 간다.
- 응답에 `auth_user_id` 를 싣지 않는다. 담당자 이름을 코드·SQL 파일에 적지 않는다(공개 저장소).
