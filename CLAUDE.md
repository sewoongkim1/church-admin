# 고척교회 관리 (church-admin · admin.onlybible.kr)

교회 담당자만 카카오 로그인으로 들어오는 관리 웹. 1차 메뉴는 사역신청(성경암송 앱의 관리 화면에서 옮겨 오는 중).
설계·계획: 형제 저장소 `bible-memorize-church-app-v2` 의
`docs/superpowers/specs/2026-09-28-church-admin-design.md` · `docs/superpowers/plans/2026-09-28-church-admin-stage1.md`

## 어디에 무엇이 적혀 있나 (2026-10-12 — 두 겹으로 나눴다)

이 문서는 **지도**다. 매 세션이 통째로 읽으므로 짧게 둔다(91,481바이트까지 불어나 한 번 나눴다 — 형제 저장소 성경암송도 같은 날 같은 꼴로).
기능별 상세 기록과 ⚠️ 함정은 `docs/notes/` 에 **한 글자도 안 버리고** 옮겼다(옮긴 커밋을 보면 원본이 그대로 있다).
⚠️ **그 자리를 손대기 전에 해당 문서를 먼저 읽는다.** 여기 한두 줄만 보고 고치면, 그 문서에 적힌 「한 번씩 사고를 낸 자리」를 그대로 다시 밟는다.

⚠️ **새로 적을 때도 두 겹으로.** 기능을 만들거나 함정을 발견하면 **자세한 것은 `docs/notes/` 에** 적고,
여기에는 **한두 줄 + 「손대기 전에 읽을 것」 링크**만 더한다. 모든 세션이 어기기 쉬운 전역 규칙(아래 「⚠️ 함정」·배포·비상 절차)만 여기에 둔다.
`docs/` 는 사이트(admin.onlybible.kr)로 나가지 않는다(`deploy.yml` 이 화면 파일만 `cp`) — 다만 **저장소는 공개**라 GitHub 에서는 누구나 읽는다. 이름·연락처·키를 적지 말 것.

| 무엇을 손댈 때 | 읽을 것 |
|---|---|
| 교인명부 — 찾기·「자세히」 창 탭·새 명단 올리기·잇기 표 `people_links`·사역 화면의 교적 표시·사역신청 번호 180일 | `docs/notes/people.md` |
| 성경필사(암송) — 회차·명단·올리기·사람별 이력·통계(`js/menus/bibleevent/`) | `docs/notes/bible-events.md` · 옛 동작 `docs/port/event-roster-legacy.md` |
| 사역 이력 · 📮 정정 신청 · 부서 이음표 · 📊 사역 통계 | `docs/notes/history.md` |
| 사역신청 다섯 메뉴의 옛 동작(성경암송 관리 화면에서 옮겨 올 때의 원문) | `docs/port/ministry-catalog-legacy.md` · `ministry-paper-legacy.md` · `ministry-status-legacy.md` |
| 교육 — 강좌·신청 현황·출석부·수료·확정 알림 | `docs/notes/edu.md` |
| 봉사 당번 — 당번 관리·명단·👥 봉사자·앱 알림·지난 날의 명단 | `docs/notes/duty.md` |
| 봉사 당번 — 📅 달력·명단 화면의 자리·공휴일 표 | `docs/notes/duty-calendar.md` |
| 새가족 — 카드·현황·등록식·통계·함께 쓰는 분 | `docs/notes/newfamily.md` |
| Edge Function `church-admin` 배포 — `tools/deploy-fn.py` 가드(직접 deploy 금지) | `docs/notes/deploy-guard.md` |
| 총괄이 카카오 계정을 잃었을 때 · 사람·사역 이력을 지울 때 · 카카오 설정 | 이 문서 맨 아래 「비상 절차」 |

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
- 서버: `python tools/deploy-fn.py church-admin --dev`(개발 먼저 · main 에 없는 내 가지는 `--allow-ahead`) → localhost 확인 → `python tools/deploy-fn.py church-admin --prod`(origin/main 과 같아야만). 검사만은 `--dry-run`.
  ⚠️ `supabase functions deploy` 직접 금지 — 읽을 것 `docs/notes/deploy-guard.md`(커밋 안 된 것·뒤처진 체크아웃·빠지는 액션을 막는다 · 걸리면 까닭을 고친다).
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
- **「📮 정정 신청」·`ministry_history_requests`**(응답 칸 · 빠진 사역의 `req:` 줄 · 「삭제」 · 두 칸 SQL 009 · 성경암송 트리거 `redirect_merged_member_write` 와 `member_merge.sql`)의 함정은 `docs/notes/history.md` 「「⚠️ 함정」 절에서 옮김」 — 이 표·응답을 손대기 전에 읽을 것.

## 교인명부 (2026-09-29 운영 개시)
dimode(교적 프로그램) 교인목록·사진을 역할 `directory`(교인명부) 담당자가 찾고·보고·내려받는다. 사역 화면에는 **교적 표시**(맞음·확인 필요·없음)와 「이름을 누르면 교적 창」(`ministryPerson` · 사역신청만이면 다섯 칸 — 아래).
- ⚠️ 손대기 전에 읽을 것 `docs/notes/people.md` — **진짜 명단은 저장소에 절대 안 들어간다**(공개 저장소 · `--no-verify` 금지) · 개발 DB 엔 가짜 명부만 · 새 명단을 올리는 차례(넣은 뒤 「🔗 기록 잇기 맞추기」) · 사역 응답의 교적은 `church` 두 칸만 · `people_links` 의 `manual`·`none` 은 자동이 덮지 않는다 · 사역신청 번호는 결정 때 안 지우고 180일.

## 성경필사(암송) (2026-09-30 운영 개시)
성경암송 앱의 이벤트 명단(`events`·`event_signups` — 사순절·썸머 써 바이블·소책자·가을 말씀 동행)을 역할 `bibleevent`(「성경필사(암송)」) 담당자가
보고·고치고·올리고·통계 낸다. 메뉴 셋 `js/menus/bibleevent/`: 📋 회차·명단(`be-roster`) · 📤 명단 올리기(`be-upload`) · 👤 사람별 이력·통계(`be-history`).
- ⚠️ 손대기 전에 읽을 것 `docs/notes/bible-events.md` — **명단을 고치는 곳은 여기 한 곳**(성경암송 `eventImport`·`eventSave`·`eventSetNote` 를 되살리지 말 것) · `ident_key` 는 `appIdentityKey`(NFC 안 함) · 교인명부에서 주는 값은 다섯뿐(`lookupOut` 을 넓히지 말 것) · 팝업 없음. 옛 동작 원문 `docs/port/event-roster-legacy.md`.
- 아래 세 묶음은 `tests/be-roster-logic.test.mjs` 가 **이 절에서** 읽는다(메모 상한 `doc-note-max` · 계정 지우기·합치기 `doc-m7`) — 그래서 notes 로 옮기지 않고 여기에 남겼다(notes 에는 「여기 남겼다」는 자리 표시만).
- 표는 성경암송 것 — **칸·제약·RLS 를 바꾸지 않는다**(새 SQL 은 역할 한 줄 `004_bibleevent_role.sql` 뿐).
  담당자가 더한 줄은 `source='import'` + `note` 앞에 `담당자가 더함`·`명단 올리기`·`소속: 교인명부로 채움`(소속을 하나라도 채움)·`직분: 교인명부로 채움`(직분만 채움 · 2026-09-30 M5)(겹치면 ` / `). 서버는 붙임말을 붙인 **뒤** 500자를 넘으면 `note-too-long` — 창의 글자 수 상한은 더하기 480(NOTE_FORM_MAX · 붙임말 몫) · 고치기·메모만 고치기 500(NOTE_EDIT_MAX — 고칠 땐 붙임말을 안 붙이고 서버도 500 그대로 센다).
- 앱 계정에 이어 둔 줄은 성경암송에서 그 계정을 지우면 함께 지워진다(`event_signups.user_id` on delete cascade · 담당자 줄도 · 교회 어드민 기록에는 안 남는다 — DB 가 지워 `event.delete` 가 없다). 계정 합치기로는 안 사라진다(줄을 새 계정으로 옮긴 **뒤** 옛 계정을 지운다 · `member_merge.sql`). 표는 성경암송 것이라 문서로만 알린다(2026-09-30 M7).
- 같은 분의 두 계정이 한 회차에 줄을 하나씩 가져 성경암송 기록 합치기가 막히면(`merge-signup-conflict` · 성경암송 `admin-members.html` 「같은 이벤트의 상세 신청이 양쪽에 있습니다」), 교회 어드민에서 담당자 줄을 뺀 뒤 다시 합친다. 뺄 수 있는 것은 담당자 줄(`source='import'`)뿐 — 두 줄 다 앱에서 낸 줄(`app-row` · 성도님이 등록 기간 안에 앱에서 취소)이거나 자격 회차(`eligibility-event`)면 여기서는 못 뺀다.

## 사역 이력 (2026-10-01)
지난 해 사역 임명 명단(엑셀 · 2022~2026, 더 오래된 해도)을 올려 교인명부의 교인ID 와 잇는다. 메뉴 「📜 사역 이력」(`js/menus/ministry/history.js` · 역할 `ministry`).
- ⚠️ 손대기 전에 읽을 것 `docs/notes/history.md` — 교인명부 세션(자세히 창 사역 탭)이 이 표를 `person_id` 로 읽고 고친다 · `person_id` 는 `directory`·`super` 응답에만 · 다시 맞추기는 **모든 해를 함께** · 12월 새 명부 뒤의 다시 맞추기 · 📮 정정 신청(아래 「⚠️ 함정」에서 옮긴 줄들) · 부서를 이름만 보고 잇지 말 것 · 📊 사역 통계 응답에 이름·교인ID·사람 번호 없음.

## 교육 (2026-10-05 운영 개시 · 성도님 쪽은 게이트 닫힘)

- 메뉴 📚 **강좌 관리**·📝 **신청 현황** — 역할 `education`(SQL 010). 액션은 `edu-db.ts` · 순수 규칙 `edu-rules.ts` · 화면 `js/menus/education/`.
- ⚠️ 손대기 전에 읽을 것 `docs/notes/edu.md` — **표·SQL 함수는 성경암송 `supabase/edu.sql` 의 것**(여기서 칸·제약·RLS 를 바꾸지 않는다 · 함수가 새 SQL 함수를 부르면 그 SQL 이 운영에 먼저) · 「맡은 강좌만」은 서버가(`mayTouch`) · 강사를 신청 현황 액션에 넣지 않는다 · 회차 저장은 id 로 · 수료번호는 SQL 한 곳 · 알림이 실패해도 저장은 성공.

## 봉사 당번 (2026-10-06 운영 반영 · 1단계 담당자 화면 · 2단계 성도님 앱 — 문은 닫힘)

- 묶음 「봉사 당번」: 🧰 **당번 관리**(역할 `duty` = 당번 총괄) · 📅 **당번 명단**(`duty` · `dutylead` = 당번 담당 — 맡은 당번만) · 👥 **봉사자**(같은 두 역할 — 사람별 봉사 이력 · 2026-10-07) — SQL 015.
  액션 `duty-db.ts`(23개) · 순수 규칙 `duty-rules.ts` · 화면 `js/menus/duty/`(`duty-logic.js` 시험 · `board-form.js` · `boards.js` · `roster.js` · `roster-forms.js` · `people.js` · `person-window.js` · `people-logic.js` 시험) · CSS 접두사 `dty-` · `dpp-`.
- ⚠️ 손대기 전에 읽을 것 `docs/notes/duty.md` — **표·SQL 함수는 성경암송 `supabase/duty.sql` 의 것** · 상태는 SQL 함수로만 · **`duty_signups` 에 직접 쓰지 않는다**(교착) · 「맡은 당번만」은 서버가(당번은 줄에서 읽는다 — 몸통의 `board_id` 를 믿지 않는다) · 총괄만 되는 일의 거절은 `chief-only` · 화면이 사실대로 말하게 하는 세 스위치(`APP_LIVE`·`NOTIFY_LIVE`·`PLAY_HIDDEN`) · 「N분께 앱 알림을 보냈어요」는 `notified` 로만 · 지난 날의 명단은 성도님 「지난 봉사」가 읽는 기록.
- 📅 달력·명단 화면의 자리·공휴일 표를 손대기 전에 `docs/notes/duty-calendar.md` — 화면 자리를 고치면 `python tools/duty-view-probe.py` · 공휴일 표는 **두 저장소에 같은 것**(⏰ 2027-06 말 대조 · 2029년 줄은 2027년 안에).

## 새가족 (2026-10-07 운영 반영 · 1~4단계 · 역할을 드리기 전에는 아무에게도 안 보인다)

종이 「새가족 등록카드」 → 섬김이 배정 → 섬김이 교육 네 번 → 새가족 목사님 교육 → 섬김이 보고서 → 교구 배정(여기까지 등록 절차) → 등록식(수료번호).
**성도님 앱에는 아무것도 없다**(내부 담당자만). 설계 v2 `docs/superpowers/specs/2026-10-07-newfamily-design.md` · 담당자용 기획서 v2 `newfamily/`.
- ⚠️ 손대기 전에 읽을 것 `docs/notes/newfamily.md` — 하는 일마다 보는 칸이 다르다(`personOut` 한 곳 · 줄을 통째로 돌려주지 말 것) · 「자기 것만」은 서버가 · 「승인」은 `nfteam` 하나만 · 단계는 저장하지 않는다 · 수료번호는 `nf_ceremony_confirm` 한 곳 · 사진은 캔버스로 다시 그려 보낸다.

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
