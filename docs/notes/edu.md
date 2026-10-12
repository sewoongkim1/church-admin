# 교육 (교회 어드민)

> CLAUDE.md 에서 옮겨 온 상세 기록이다(2026-10-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다).
> **언제 읽나:** 📚 강좌 관리·📝 신청 현황·✅ 출석부·🎓 수료·확정 알림(`edu-db.ts`·`edu-rules.ts`·`js/menus/education/`)을 손볼 때. 성도님 앱 쪽 노트는 성경암송 `docs/notes/education.md`
> ⚠️ 여기 ⚠️ 표시는 대부분 **실제로 한 번씩 사고를 겪고** 남긴 것이다. 요약해 옮기지 말고 그대로 둘 것.
> 원문에서 「v2 …」·「성경암송 `…`」라고 적은 경로는 형제 저장소 `bible-memorize-church-app-v2` 의 파일이다 — 그쪽에도 `docs/notes/` 가 있으니 이 저장소의 노트와 헷갈리지 말 것.

---

## CLAUDE.md 에서 옮김 2026-10-12

> 원문 그대로다(2026-10-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다). 절 제목 줄만 한 단계 낮췄다(`##` → `###`).
> 들여쓰기·굵은 글씨도 그대로다. 지금 상태는 CLAUDE.md 의 그 절 한두 줄을 볼 것.

### 교육 (2026-10-05 운영 개시 · 성도님 쪽은 게이트 닫힘)

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
