# 교인명부 (교회 어드민)

> CLAUDE.md 에서 옮겨 온 상세 기록이다(2026-10-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다).
> **언제 읽나:** 교인명부 찾기·「자세히」 창(🤝 사역·✍️ 성경필사 탭)·새 명단 올리기(`tools/people/`)·잇기 표 `people_links`·사역 화면의 교적 표시와 「이름을 누르면 교적 창」·사역신청 휴대폰 번호(180일)를 손볼 때
> ⚠️ 여기 ⚠️ 표시는 대부분 **실제로 한 번씩 사고를 겪고** 남긴 것이다. 요약해 옮기지 말고 그대로 둘 것.
> 원문에서 「v2 …」·「성경암송 `…`」라고 적은 경로는 형제 저장소 `bible-memorize-church-app-v2` 의 파일이다 — 그쪽에도 `docs/notes/` 가 있으니 이 저장소의 노트와 헷갈리지 말 것.

---

## CLAUDE.md 에서 옮김 2026-10-12

> 원문 그대로다(2026-10-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다). 절 제목 줄만 한 단계 낮췄다(`##` → `###`).
> 들여쓰기·굵은 글씨도 그대로다. 지금 상태는 CLAUDE.md 의 그 절 한두 줄을 볼 것.

### 교인명부 (2026-09-29 운영 개시)
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
