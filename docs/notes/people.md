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
- **✍️ 성경필사 「이분 것」은 같은 교구 기록을 한 번에(2026-10-15 친구 「교구가 같으면 한번 이을 때 다 같이」 · 같은 날 운영에서 실사용 확인 — 친구)** — `person-history.js` `sameGroupSignups`(순수 · 시험 `tests/person-history.test.mjs`) · `person-tabs.js` `link`.
  누른 줄과 **구분(who_type) · 교구/부서(group)가 같고 아직 안 이어진** 성경필사 줄을 함께 잇는다(목장 · 학년은 안 본다). 단추는 「이분 것 · N건」 + 목록 위 안내 한 줄.
  서버는 **줄마다 따로** `peopleLink`(manual) — 이름 확인 · 기록(`people.link`)이 줄마다 그대로 · 하나가 안 돼도 나머지는 계속(알림에 「N건은 잇지 못했어요」).
  ⚠️ 「이분 아님」으로 둔 줄은 함께 잇지 않는다(사람이 정한 것) · 교구가 빈 줄은 묶지 않는다 · 사역 탭은 묶지 않는다(친구 요청은 성경필사).

## 성경필사 줄 「이름 한 분」 잇기 (2026-10-15 친구 결정)

「성경필사를 한 분이면 모두 이어 주세요」 — 성경필사 줄은 같은 소속(signupSame)도 번호도 없을 때 **이름이 명부에 한 분뿐이면 그분**으로 잇는다(근거 `이름 한 분` · `people-links.ts` `BASIS_NAME_ONE` · `autoLink` 의 `nameOne`).
- 2026-10-01 결정(「이름 한 분뿐」만으로는 잇지 않는다)은 **사역신청 줄에 그대로** 남는다 — 바뀐 것은 성경필사 줄뿐.
- 교구 줄은 명부의 아이(kind2 교회학교·학생)를 빼고 센다 · 교회학교 줄은 그대로(그사이 자라 청년이 됐을 수 있다) · 같은 소속 후보가 둘 이상이면 잇지 않는다.
- 까닭: 운영 2,833줄 중 5줄만 이어져 「자세히」 창 · 🤖 성도 묻기에 성경필사가 비어 보였다(2026-10-15 셈).
- ⚠️ 소속이 다른 명부에 없는 동명이인(떠난 분 · 손님)을 잘못 이을 수 있다 — 「자세히」 창에서 「이분 아님」(none)으로 고치면 다시 맞추기가 덮지 않는다.
- 이 규칙은 다음 「🔗 기록 잇기 맞추기」(교인 현황 맨 아래 · 총괄)부터 적용된다. 명단 올리기 때의 그때그때 잇기(linkSignupsByName)도 같은 `signupAutoRecs` 라 함께 바뀐다.
- 명단의 교적 표시(✓ · 확인 필요)는 그대로다 — 「이름 한 분」으로 이은 줄도 명단에는 「같은 이름 1명」 · 「확인 필요」로 보일 수 있다(표시는 소속 판정, 잇기는 이 규칙).
- ✅ **운영에서 처음 맞춤 — 2026-10-15 14:33**(친구 요청 · 총괄 화면 「🔗 기록 잇기 맞추기」 · 그전에는 한 번도 안 눌렸다): 새로 이음 2,644 · 바뀜 0 · 못 맞춤 173.
  성경필사 2,833줄 = 맞음 2,592 · **이름 한 분 52** · 사람이 이음 16 · 못 맞춤 173(명부에 없는 이름 · 어른 동명이인) · 사역신청 7줄 그대로 · 확인 번호 다시 맞대기 0.
  대부분은 원래 규칙(맞음)으로 이어졌다 — 맞추기를 한 번도 안 돌려서 비어 있었던 것이다.

## 📖 성경암송 탭 · 🏠 심방자료 단추 (2026-10-15 친구 요청 · 총괄만)
「자세히」 창에 다섯째 탭 **📖 성경암송**(수 = 다 마친 말씀)과 왼쪽 단에 **🏠 심방자료** 단추(창을 닫고 심방 카드 — `docs/notes/ask.md` 「심방 준비 한 장」).
- ⚠️ **총괄(super)만** — 서버 `peoplePerson` 이 `ctx.roles` 로 정한다(`history.memo` · `person.canVisit`). 까닭: 성경암송 방침(v2 `privacy/`)이
  「암송 기록은 본인과 운영진(신앙운동팀)이 봅니다」라고 적고 있다. **교인명부 역할 · 담임목사 역할에 열려면 방침 문장부터**(플레이 심사 중에는 방침을 고치지 않는다).
- 앱 계정 찾기(`memo-rec.ts memoAccountsFor`) — ① 확인 번호로 이은 계정(`life_pins` person_how auto · staff — 「🔐 성경암송 본인 확인됨」과 같은 줄) ·
  ② 앱 계정의 이름 · 교구 · 목장(교회학교는 부서)을 사역신청 줄처럼 교적과 맞대(`autoLink` · 같은 소속이 이분 한 분일 때만) 이분께 오면 「이름 · 소속이 같음」.
  확인 번호로 **다른 분께** 이어진 계정은 ②에서 뺀다. 화면에 찾은 방법을 함께 적는다(사람이 확인한 것과 구분).
- 요약(`memoSummary`): 다 마친 말씀(3단계 · 한글 · 영어는 한 구절 · 주간/주제별(2001~)/쉴만한 물가(1001~1999)) · 시작한 말씀 · 활동한 날(집계표 `daily_activity` · 최근 30일) ·
  암송(learn-*) · 도전 횟수 · 처음 · 마지막 · 최근 다 마친 말씀 다섯(출처는 `verses.ref_short`).
- ⚠️ **user_id 는 응답에 싣지 않는다**(메모리에서 맞대기만) — 개발 스모크가 응답에 uuid 가 없는지 본다.
- 잇기 · 풀기 응답(`peopleLink`)에는 성경암송 칸이 없다 → 화면이 보던 칸을 그대로 둔다(`person-history.js keepMemo` — 교육의 keepEdu 와 같은 까닭).
- 탭이 다섯이면 폰에서 세 칸 두 줄(`.pd-tabs5`). 앱 계정 목록은 5분 담아 둔다(`memoUsers`).
- 시험 `tests/memo-rec.test.mjs`(찾기 · 동명이인 · 확인 번호 우선 · 요약 · 탭 · 단추).

## 「자세히」 창 폰 모양 (2026-10-17 친구 「모바일에 맞게 깔끔하게 · 시연 자료」)
- 창 안쪽 720px 아래(폰 · 좁은 창)만 바뀐다 — PC 두 단은 그대로(`css/admin.css` 「📱 교인카드 폰 모양」 묶음).
- 짜임: 머리 카드(남색 신분증 꼴 — 사진 왼쪽 · 이름 · 직분 · 「소속 · 성별 · 나이」 한 줄 · 본인 확인 · 같은 날 친구 「너무 많이 차지」로 가운데 큰 사진에서 바꿈) 아래 흰 띠에 연락 타일(휴대폰 · 전화 · 심방자료 — `.pd-reach` 안에서 `.pd-tels`·`.pd-visits` 를 `display:contents`) → 탭 한 줄(이름 아래 수 · 그림 글자 `.pd-tab-i` 는 숨김 · 스크롤하면 위에 붙는다) → 칸은 흰 카드(라벨 왼쪽 · 값 오른쪽).
- 화면 600px 이하는 창이 화면을 꽉 채우고(바탕 `--light`) 「닫기」가 아래 한 줄을 채운다.
- ⚠️ 탭 줄이 붙는 자리는 창 위 여백 안쪽부터 잰다 — `top:calc(8px - var(--pd-pt))`. 창 위 여백(`.dlg.pd` padding)을 바꾸면 `--pd-pt` 도 같이. 둘레는 창 바탕색(`--pd-sheet`) 고리가 가린다.
- ⚠️ 탭 글은 `person-history.js tabsHtml` 이 그림 · 이름 · 수를 따로 감싼다(`.pd-tab-i`·`.pd-tab-l`·`em`) — 폰은 그림을 숨기고 이름 아래 수, PC 는 예전처럼 「🤝 사역 4」.
- 가족 단추는 폰에서 성경암송 앱 첫 화면의 줄 목록 꼴([아이콘 칸] 이름 … 관계 · 나이 ›) — 아이콘 칸(`.pd-fi`) · ›(`.pd-chev`)는 PC 에서 숨겨 예전 알약 그대로(2026-10-17 친구).

## 🅰 성경앱 스타일 — 처음 화면 · 교인명부 네 화면 (2026-10-17 친구 「모바일에 맞게 · 성경앱의 스타일로」 · 「첫 화면 메뉴도」)
- 성경암송 앱 첫 화면 A안과 같은 결: 묶음 제목(회색 굵게) + 흰 카드 한 장 안의 줄(위 가는 줄 · [아이콘 칸 38px 연파랑] 이름 / 설명 · ›).
- 선 아이콘은 `js/core/icons.js`(앱 `app.js HA_ICON` 과 같은 그림 · `lineSvg` · 화면 머리 `aTitle`). **메뉴를 더하면 `MENU_ICON` 에도 한 줄** — 빠지면 `tests/home-view.test.mjs` 가 잡는다(빠져도 화면은 그림 글자로 나온다).
- CSS 는 `css/admin.css` 끝 「🅰 성경앱 스타일」 묶음 — ⚠️ 다른 메뉴로 새지 않게 화면 칸(`.route-home` · `.route-people` · `.route-people-stats` · `.route-member-accounts` · `.route-people-ask` — main.js 가 메뉴마다 만든다) 아래에만.
- 폰(화면 1024px 아래)은 짜임까지 바꾼다 — 처음 화면은 줄 목록(PC 는 격자 그대로 · 그림만 작은 아이콘 칸) · 🔎 찾은 분은 흰 카드 한 장 안의 줄(PC 표 그대로) · 정렬은 한 줄 칸 · 👤 찾은 계정은 줄 · 🤖 예시는 줄 목록 · 명단은 720px 아래에서 카드 줄(`ask.js cardsHtml` — 표와 같은 `data-pid` · `data-visit`).
- 찾기 칸의 돋보기는 CSS 배경 그림(`.search.a-search`) — 자리 글에 🔍 를 다시 넣지 말 것(둘이 겹친다).

