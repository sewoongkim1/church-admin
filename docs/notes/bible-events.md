# 성경필사(암송) (교회 어드민)

> CLAUDE.md 에서 옮겨 온 상세 기록이다(2026-10-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다).
> **언제 읽나:** 📋 회차·명단 · 📤 명단 올리기 · 👤 사람별 이력·통계(`js/menus/bibleevent/` · `events-*.ts`)를 손볼 때. 옮겨 오기 전 성경암송 쪽 동작 원문은 `docs/port/event-roster-legacy.md`
> ⚠️ 여기 ⚠️ 표시는 대부분 **실제로 한 번씩 사고를 겪고** 남긴 것이다. 요약해 옮기지 말고 그대로 둘 것.
> 원문에서 「v2 …」·「성경암송 `…`」라고 적은 경로는 형제 저장소 `bible-memorize-church-app-v2` 의 파일이다 — 그쪽에도 `docs/notes/` 가 있으니 이 저장소의 노트와 헷갈리지 말 것.

---

## CLAUDE.md 에서 옮김 2026-10-12

> 원문 그대로다(2026-10-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다). 절 제목 줄만 한 단계 낮췄다(`##` → `###`).
> 들여쓰기·굵은 글씨도 그대로다. 지금 상태는 CLAUDE.md 의 그 절 한두 줄을 볼 것.

### 성경필사(암송) (2026-09-30 운영 개시)
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
- (원래 이 자리에 있던 줄은 CLAUDE.md 「성경필사(암송)」 절에 **그대로 남겼다** — `tests/be-roster-logic.test.mjs` 가 그 줄을 CLAUDE.md 의 그 절에서 읽는다(시험 이름 `doc-note-max`·`doc-m7`). 같은 글을 두 곳에 두면 한쪽만 고쳐져 갈리므로 여기엔 두지 않는다: 표는 성경암송 것 — 칸·제약·RLS 를 바꾸지 않는다 · 담당자가 더한 줄의 `note` 붙임말과 메모 상한.)
- 낸 날(`created_at`): 마감일이 오늘(KST)보다 앞선 회차에 넣는 줄(올리기·한 분 더하기)은 **그 마감일 한국 자정**, 열린·앞날 회차는 DB 기본값 now()(`events-rules.ts` `pastEventCreatedAt` · 2026-09-30 M2). 성경암송 `evtPositionHint`(앱 등록 폼의 직분 기본값)·「이미 내신 것」 차례가 created_at 이 가장 늦은 줄을 「가장 최근」으로 본다 — 2022 명단을 오늘 올린 줄이 가장 새것이 되면 안 된다. 그래서 지난 회차 줄의 낸 날(응답 `at` · 성경암송 `eventRoster`)은 마감일이 된다(고친 때 `updated_at` 은 지금).
- `note`(담당자 메모)와 `memo`(성도님 한 줄)는 다른 칸이다. `memo`·`phone`·`answers` 는 쓰지 않고, `user_id`·`ident_key` 와 함께 응답에 싣지 않는다(명시적 칸 지도 · 줄 칸 목록은 `EV_ROW_COLS` 하나 · 계정은 `hasUser` 로만).
- `ident_key` 는 `paper.ts` `appIdentityKey`(NFC 안 함) — `authz.ts` `identityKey`(NFC)를 쓰면 앱 계정과 영영 안 맞는다. 같은 분 판정은 `sameKeys`(07/7·N목장·NFC) 한 규칙 — 한 분 더하기·고치기·올리기가 함께 쓴다. 더해서 교구 줄은 **한쪽 목장이 비었거나 99** 면 같은 교구·같은 이름을 같은 분으로 본다(`looseSame` · 올리기는 채우기 전 줄의 키도 · 화면 `dupFlags` 도 같게 · 2026-09-30 최종 검토 I1).
- 앱 계정은 **조회만** 해서 잇는다(만들지 않는다 · `member_login` 금지). 한글 키 `.in()` 은 100개·6KB 씩(`inChunks`).
  읽기만 하는 이름(👤 이력·이름 누르기)은 `readName` — 큰따옴표·역슬래시·세로줄만 막는다(괄호가 든 옛 이름도 누를 수 있게) · 직분은 완성형(NFC)으로 다듬는다(신원 키에 안 들어간다).
- (원래 이 자리에 있던 줄은 CLAUDE.md 「성경필사(암송)」 절에 **그대로 남겼다** — `tests/be-roster-logic.test.mjs` 가 그 줄을 CLAUDE.md 의 그 절에서 읽는다(시험 이름 `doc-note-max`·`doc-m7`). 같은 글을 두 곳에 두면 한쪽만 고쳐져 갈리므로 여기엔 두지 않는다: 이어 둔 줄과 성경암송 계정 지우기(cascade) · 두 계정이 한 회차에 줄을 하나씩 가져 합치기가 막힐 때.)
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
