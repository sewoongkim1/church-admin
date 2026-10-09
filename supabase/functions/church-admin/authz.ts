// 교회 어드민 — 권한과 신원 규칙(순수 함수)
//   서버(Deno, index.ts)와 시험(Node, tests/authz.test.mjs)이 **같은 파일**을 읽는다.
//   ⚠️ Deno 전용 API·원격 import 를 쓰지 않는다 — node --experimental-strip-types 가 그대로 읽어야 한다.
//   ⚠️ enum·namespace 처럼 「타입만 지워서는 안 되는」 TS 문법도 쓰지 않는다.

// 액션마다 필요한 역할. null = 로그인만 되어 있으면(등록 전·대기·정지인 분도 자기 상태는 알아야 한다).
//   배열이면 그 가운데 하나만 있어도 된다(교육 — 총괄 education 과 맡은 강좌 담당 educourse · 2026-10-05 · 봉사 당번 duty·dutylead · 2026-10-06).
// ⚠️ 새 액션을 만들면 반드시 여기에 한 줄 — 없으면 unknown-action 으로 막힌다(열리는 쪽으로 틀리지 않게).
//    tests/server.dev.test.mjs 의 PROBE 에도 한 줄(시험이 빠진 액션을 잡는다).
// 교육 신청 현황 쪽 — 교육 총괄(education)과 교육 담당(educourse) 둘 다. 담당은 **맡은 강좌만**이고 그것은 edu-db.ts 가 강좌마다 본다(not-assigned).
const EDU_BOTH = ["education", "educourse"];
// 출석부(2단계) — 교육 총괄·교육 담당·강사(teacher · SQL 012)
const EDU_ATTEND = ["education", "educourse", "teacher"];
// 봉사 당번(2026-10-06 · SQL 015) — 당번 총괄(duty)과 당번 담당(dutylead) 둘 다. 담당은 **맡은 당번만**이고 그것은 duty-db.ts 가 당번마다 본다(not-assigned).
const DUTY_BOTH = ["duty", "dutylead"];
// 새가족(2026-10-07 · SQL 016) — 새가족 운영팀(newfamily)과 새가족 섬김(nfteam · 영접팀·정착팀 총무·섬김이·목사님) 둘 다.
//   섬김은 **하는 일(nf_staff.kind)과 자기 줄만**이고 그것은 nf-db.ts 가 액션마다 본다(not-assigned · 운영팀만 되는 일은 chief-only).
const NF_BOTH = ["newfamily", "nfteam"];
export const ACTION_ROLES: Record<string, string | string[] | null> = {
  me: null,
  register: null,
  membersList: "super",
  membersApprove: "super",
  membersSetRoles: "super",
  membersSetStatus: "super",
  auditList: "super",
  // 교회 생활 확인 번호 풀기(2026-10-08) — 번호를 잊었거나 남이 먼저 정한 분을 총괄이 푼다.
  lifeResetList: "super",
  lifeResetDo: "super",
  // 교인명부(2026-10-01) — 새 명부를 올린 뒤 사역신청·성경필사 기록을 교인과 다시 잇는다(auto 줄만 · 사람이 정한 줄은 그대로).
  //   apply:true 가 아니면 세기만 한다(시험 PROBE 가 아무것도 안 바꾸게). 기록 people.linksync(수만).
  peopleLinkSync: "super",
  // 사역신청(2단계 · 2026-09-28) — 임명현황. 읽기만, 임명확정만, 번호·메모 없음.
  ministryAppointed: "ministry",
  // 사역신청(3단계) — 신청 현황. 목록은 번호·메모를 담는다(관리 화면 전용). 상태 바꾸기·삭제는 바꾼 기록에 남는다.
  ministryList: "ministry",
  ministrySetStatus: "ministry",
  ministryDelete: "ministry",
  // 사역신청(4·5단계 · 2026-09-29) — 사역팀 정보(하는 일·시간·필요 인원). 목록은 게이트만
  // 더한 것(원문은 성도 화면과 공유해 게이트가 없었다), 저장·차례는 관리자만.
  ministryCatalogAdmin: "ministry",
  ministryCatalogSave: "ministry",
  ministryCatalogOrder: "ministry",
  // 사역신청(4·5단계 Task 5 · 2026-09-29) — 종이(오프라인) 명단 올리기. 살펴보기(check)는 아무것도
  // 안 바꾸고, 넣기(save)만 계정·신청을 만든다 — 둘 다 담당자만.
  ministryPaperCheck: "ministry",
  ministryPaperSave: "ministry",
  // 사역신청(2026-09-30 친구 요청) — 이름을 누르면 교적 창 — 담당자·역할 화면(총괄)도 이것을 부른다.
  // 모양은 index.ts ministryPerson 이 부른 분의 역할로 정한다(evPerson 과 같다 — 교인명부 역할·총괄이면 교인ID, 아니면 다섯 칸 + 교적 표시).
  ministryPerson: "ministry",
  // 「📮 정정 신청」(2026-10-01) — 성경암송 앱 「사역 이력 확인」에서 온 정정 신청 목록·처리. 응답에 user_id·person_id 없음 · 처리는 바꾼 기록에.
  historyRequestList: "ministry",
  historyRequestSet: "ministry",
  // 신청 삭제(2026-10-02 친구 요청) — 신청 줄을 지운다(앱 「내 정정 신청」에서도 사라짐) · 빠진 사역이 「반영」으로 더한 줄은 빼 둔다.
  //   바꾼 기록 history.request.delete 에는 번호·종류·상태만(이름·글 없음).
  historyRequestDelete: "ministry",
  // 교인명부(2026-09-29) — 찾기·한 분 보기·현황·내려받기. 읽기만(원본은 dimode). 찾기·보기·내려받기는 열람 기록에 남는다.
  peopleSearch: "directory",
  peoplePerson: "directory",
  peopleStats: "directory",
  peopleExport: "directory",
  // 성도 계정 관리(2026-10-09 · 성경암송 admin-members 이전) — 앱 계정(users) 찾기·이름/소속 변경·변경 이력은 members,
  //   계정 합치기(미리보기+실행)는 되돌릴 수 없어 super 만. 합치기 로직(RPC)은 성경암송에 두고 서버가 부른다.
  memberFind: "members",
  memberUpdate: "members",
  memberHistory: "members",
  memberMergePreview: "super",
  memberMerge: "super",
  // 성경암송 관리(2026-10-09 · admin-stats 안전 묶음 이전) — 통계·게시판·설정·필사·말씀기록.
  //   실제 일은 성경암송 api 를 내부 키로 부른다(index.ts memCall). 여기서는 역할만 건다.
  stats: "memorizeadmin", participants: "memorizeadmin", verses: "memorizeadmin",
  blessingUsage: "memorizeadmin", ranking: "memorizeadmin",
  boardList: "memorizeadmin", boardModerate: "memorizeadmin", boardReply: "memorizeadmin",
  boardPost: "memorizeadmin", boardReports: "memorizeadmin", boardReportResolve: "memorizeadmin",
  sermonAnswerReports: "memorizeadmin", sermonAnswerReportResolve: "memorizeadmin",
  getConfig: "memorizeadmin", saveConfig: "memorizeadmin", eventEntrants: "memorizeadmin",
  getPassages: "memorizeadmin", savePassage: "memorizeadmin", deletePassage: "memorizeadmin",
  pilsaList: "memorizeadmin", pilsaSetStatus: "memorizeadmin",
  sermonChatLog: "memorizeadmin", embedSermons: "memorizeadmin",
  clearChatCache: "memorizeadmin", clearSummaryCache: "memorizeadmin",
  // 알림 조회·시스템 상태(묶음4 · 읽기만 · 발송은 안 옮긴다)
  pushStats: "memorizeadmin", pushSubscribers: "memorizeadmin", pushHistory: "memorizeadmin",
  pushPreview: "memorizeadmin", monitor: "memorizeadmin",
  // 설교·찬양(묶음5 · 담당자 역할 content) — 삭제만 super(되돌릴 수 없음). 워크플로 콜백은 넣지 않는다(기계용).
  sermonStaffList: "content", sermonJobCreate: "content", sermonJobs: "content", sermonJobRetry: "content",
  sermonStaffSave: "content", staffVerseSave: "content", sermonDelete: "super",
  verseImgList: "content", verseImgScenes: "content", verseImgGenerate: "content",
  verseImgAlt: "content", verseImgSave: "content", verseImgHide: "content",
  // 교인명부 「자세히」 창 사역·성경필사 탭(2026-10-01) — 이름이 같고 아직 안 이어진 기록(읽기만 · 기록 없음 — 창을 연 people.view 가 있다) ·
  //   「이분 것」·「이분 아님」·「풀기」(줄 이름 = 교인 이름일 때만 · 바꾼 기록 people.link). 메모·사유·전화·앱 계정은 싣지 않는다.
  peopleHistory: "directory",
  peopleLink: "directory",
  // 성경필사(암송)(2026-09-29) — 성경암송 앱의 이벤트 명단(events·event_signups). 여기는 읽기 넷
  // (회차 목록·명단·사람별 이력·통계). 줄은 이름·소속·직분·담당자 메모·교적 표시만 — user_id·신원 키·
  // 성도님 전화·메모·답은 싣지 않는다. 쓰기(회차 설정·줄 고치기·올리기)는 Task 6~8 이 이 아래에 더한다.
  evEvents: "bibleevent",
  evRoster: "bibleevent",
  evHistory: "bibleevent",
  evStats: "bibleevent",
  // 성경필사(암송) — 회차 만들기·설정(Task 6). 만들기는 draft 로만, 성도님께 보이게 되는 저장은
  // confirmListed 를 받아야 쓴다(needs-confirm). 둘 다 바꾼 기록(event.create·event.settings)에 남는다.
  evEventCreate: "bibleevent",
  evEventSave: "bibleevent",
  // 성경필사(암송) — 한 분 더하기·줄 고치기·빼기(계획 Task 7). 앱 계정은 조회만 해서 잇는다(만들지 않는다).
  // 앱에서 낸 줄·자격 회차의 줄은 메모만, 자격 회차에는 더하기·빼기 없음. 바꾼 기록 event.add / event.edit / event.delete.
  evRowAdd: "bibleevent",
  evRowSave: "bibleevent",
  evRowDelete: "bibleevent",
  // 성경필사(암송) — 명단 올리기·교인명부 찾기(계획 Task 8). 살펴보기는 아무것도 안 바꾼다(채우기를 켜면 people.fill 기록),
  // 넣기는 「넣음」 줄만 더한다(앱 계정은 조회만). 찾기는 이름·구분·소속·세부·직분 다섯 칸 + 교적 목장 칸(church_mok), 부를 때마다 people.lookup.
  evUploadCheck: "bibleevent",
  evUploadSave: "bibleevent",
  evPeopleLookup: "bibleevent",
  // 성경필사(암송) — 이름을 누르면 교적 창(계획 Task 16 · 2026-09-30). 모양은 index.ts evPerson 이 부른 분의 역할로 정한다:
  // 교인명부 역할·총괄이면 교인ID(「자세히」 창은 peoplePerson 이 역할을 다시 본다), 아니면 다섯 칸 + 교적 표시(people.lookup).
  evPerson: "bibleevent",
  // 사역신청 시험 참여자(2026-09-30) — 기간 밖에도 성경암송 첫 화면에 🤝 사역신청이 보이는 앱 계정. 명단은 app_config.ministryTesters
  // (성경암송 api 가 읽는다). 찾기는 앱 계정(users)을 이름으로 — user_id 는 싣지 않는다. 더하기·빼기는 바꾼 기록 ministry.tester.
  // 2026-10-02 친구 요청으로 총괄(super)만 — 메뉴도 「시스템」 묶음으로 옮겼다. 사역신청 담당은 신청 현황의 🧪 딱지만 본다.
  ministryTesters: "super",
  ministryTesterFind: "super",
  ministryTesterSave: "super",
  // 사역신청 번호 보관(2026-10-01 · 교인명부 세션 설계 §6) — 결정 때 번호를 지우지 않고, 신청 현황 「결정된 신청 번호 지우기(N건)」로.
  //   보낸 수(count)가 지금 수와 같을 때만 지운다(그사이 바뀌었으면 conflict · 시험 PROBE 도 이 길로 아무것도 안 바꾼다). 바꾼 기록 ministry.phoneclear.
  ministryPhoneClear: "ministry",
  // 사역 이력(2026-10-01) — 지난 해 사역 임명 명단(엑셀)과 교인ID 잇기(표 ministry_history · history-db.ts). 응답의 person_id 는
  // 교인명부·총괄 역할일 때만(서버가 ctx.roles 로). 후보 보기는 「교인명부 기록」 people.lookup(from:"history") · 쓰기는 「바꾼 기록」 history.*.
  historyList: "ministry",
  historyUploadCheck: "ministry",
  historyUploadSave: "ministry",
  historyRowAdd: "ministry",
  historyRowSave: "ministry",
  historyRowDelete: "ministry",
  historyCandidates: "ministry",
  historyLink: "ministry",
  // 「👥 묶어 보기」(2026-10-04) — 못 맞춘 줄을 목장·이름 묶음으로 보고 한 번에 잇기(바꾼 기록 history.linkgroup)
  historyGroups: "ministry",
  historyLinkGroup: "ministry",
  historyRematch: "ministry",
  historyExport: "ministry",
  // 📊 사역 통계(2026-10-06 · 설계 v2 docs/superpowers/specs/2026-10-06-ministry-stats-design.md) — 읽기만 · 기록 없음.
  //   응답은 묶음 숫자와 부서·팀 이름뿐(이름·교인ID·사람 번호·태어난 해 없음 — ministry-stats.ts buildStats).
  ministryStats: "ministry",
  // 교육신청 1단계(2026-10-05 · 설계 v2 docs/superpowers/specs/2026-10-05-education-courses-design.md) — 역할 education(교육 총괄).
  //   강좌 만들기·회차·신청 현황·대신 등록·엑셀. 정원·대기 규칙은 성경암송 supabase/edu.sql 의 SQL 함수가 정한다(여기서 상태를 직접 쓰지 않는다).
  //   응답에 user_id·ident_key 없음(edu-rules.ts 칸 지도) · 쓰기는 바꾼 기록 edu.*(이름 없이 id·수만).
  // 강좌별 담당자(2026-10-05 친구 요청 · SQL 011 edu_course_staff) — 강좌·회차·복사·담당자 지정은 총괄만,
  //   신청 현황(목록·상태·대신 등록·교재비·메모·엑셀·명부 찾기)과 읽기(강좌·회차)는 총괄·담당 둘 다(담당은 맡은 강좌만 — edu-db.ts mayTouch).
  eduCourseSave: "education",
  eduCourseCopy: "education",
  eduSessionsSave: "education",
  eduStaffCandidates: "education",
  eduStaffSet: "education",
  eduCourses: EDU_BOTH,
  eduSessions: EDU_BOTH,
  eduEnrollList: EDU_BOTH,
  eduEnrollSet: EDU_BOTH,
  eduEnrollAdd: EDU_BOTH,
  eduFeeSet: EDU_BOTH,
  eduExport: EDU_BOTH,
  eduPeopleLookup: EDU_BOTH,
  // 출석부(2단계 · 2026-10-05 · SQL 012 강사 teacher) — 교육 총괄·교육 담당·강사. 강좌는 edu-db.ts 가 본다(mayTouch + attendKinds:
  //   강사는 teacher 줄 · 교육 담당은 manager·teacher 줄 · 아니면 not-assigned). 쓰기는 SQL 함수 edu_attendance_set·edu_attendance_bulk.
  //   ⚠️ 강사(teacher)를 위 신청 현황 액션(EDU_BOTH)에 넣지 않는다 — 강사는 명단의 이름·소속과 출석만 본다(신청 상태·교재비·메모·명부 찾기 없음).
  //   응답에 user_id·ident_key·marked_by 없음 · 기록 edu.attend.set·edu.attend.bulk·edu.attend.export(id·수만).
  eduAttendCourses: EDU_ATTEND,
  eduAttendSessions: EDU_ATTEND,
  eduAttendSheet: EDU_ATTEND,
  eduAttendSet: EDU_ATTEND,
  eduAttendBulk: EDU_ATTEND,
  eduAttendSummary: EDU_ATTEND,
  eduAttendExport: EDU_ATTEND,
  // 수료(3단계 · 2026-10-05 · 계획 v2 docs/superpowers/plans/2026-10-05-education-stage3-certificates.md) — 수료 확정은 교육 총괄 + 그 강좌 교육 담당
  //   (manager 줄 · edu-db.ts mayTouch 기본 · 아니면 not-assigned). ⚠️ 강사(teacher)는 넣지 않는다 — 강사는 출석만.
  //   수료·번호·확인 체크는 v2 SQL edu_issue_certs·edu_revoke_cert·edu_check_set(번호는 SQL 한 곳). 응답에 user_id·ident_key 없음 ·
  //   기록 edu.cert.check·issue·revoke·print(id·수만).
  eduCertList: EDU_BOTH,
  eduCheckSet: EDU_BOTH,
  eduCertIssue: EDU_BOTH,
  eduCertRevoke: EDU_BOTH,
  eduCertPrint: EDU_BOTH,
  // 수료증 설정(발급 명의·문안·직인 이미지) — 교육 총괄만 · 기록 edu.cert.settings 에는 바뀐 칸 이름만(이미지 없음)
  eduCertSettings: "education",
  eduCertSettingsSave: "education",
  // 📊 교육 통계(4단계 C · 2026-10-06) — 교육 총괄만(edu-db.ts 도 eduChief 로 한 번 더). 읽기만 · 숫자만이라 기록 없음(📊 교인 현황과 같다).
  //   수는 v2 SQL edu_stats(p_term) 한 번(jsonb — 신청 줄을 받아 세지 않는다). 응답에 이름·user_id 없음(edu-rules.ts statsOut).
  //   교인명부 「🎓 교육」 탭(4단계 B)은 액션을 따로 두지 않는다 — peoplePerson·peopleLink(directory)의 history.education 으로 간다.
  eduStats: "education",
  // 봉사 당번 1단계(2026-10-06 · 설계 v2 docs/superpowers/specs/2026-10-06-duty-roster-design.md §3·§9) — 역할 duty(당번 총괄)·dutylead(당번 담당).
  //   정원·겹침·잠금·쉼 규칙은 성경암송 supabase/duty.sql 의 SQL 함수가 정한다(여기서 상태를 직접 쓰지 않는다).
  //   응답에 user_id·ident_key·confirmed_by 없음(duty-rules.ts 칸 지도) · 쓰기는 바꾼 기록 duty.*(이름 없이 id·수·날짜만).
  //   담당자 지정은 총괄만. 그 밖은 총괄·담당 둘 다(담당은 맡은 당번만 — duty-db.ts mayTouch · 줄 번호로 와도 그 줄의 당번을 서버가 읽는다).
  //   당번 만들기·이름·준비/보관은 dutyBoardSave 안에서 총괄만(chief-only — forbidden 이 아니다).
  dutyStaffCandidates: "duty",
  dutyStaffSet: "duty",
  dutyBoardList: DUTY_BOTH,
  dutyBoardSave: DUTY_BOTH,
  dutyLineSave: DUTY_BOTH,
  dutyLineRemove: DUTY_BOTH,
  dutyDateAdd: DUTY_BOTH,
  dutyRoster: DUTY_BOTH,
  dutyExport: DUTY_BOTH,
  dutyDaySet: DUTY_BOTH,
  dutyDaysOff: DUTY_BOTH,
  dutySlotSet: DUTY_BOTH,
  dutySlotDelete: DUTY_BOTH,
  dutySignAdd: DUTY_BOTH,
  dutySignRemove: DUTY_BOTH,
  dutySignRestore: DUTY_BOTH,
  dutySignMove: DUTY_BOTH,
  dutySignNote: DUTY_BOTH,
  dutyAskClear: DUTY_BOTH,
  // 새가족 1단계(2026-10-07 · 설계 v2 성경암송 docs/superpowers/specs/2026-10-07-newfamily-design.md §5) — 카드·사진·명단·섬김이 배정.
  //   함께 쓰는 분(nfStaff*·nfHelperSave)은 운영팀만 — nfStaffApprove 는 대기 중인 분을 승인하며 nfteam **하나만** 준다(친구 2026-10-07).
  //   응답은 nf-rules.ts personOut 이 하는 일에 따라 칸을 고른다(섬김이에게는 주소·생일·가족·사진 없음) · 기록 nf.*(새가족 이름·전화 없음).
  nfMe: NF_BOTH,
  nfStaffList: "newfamily",
  nfStaffApprove: "newfamily",
  nfStaffSet: "newfamily",
  nfHelperSave: "newfamily",
  nfPeopleFind: NF_BOTH,
  nfCardGet: NF_BOTH,
  nfCardSave: NF_BOTH,
  nfPhotoPut: NF_BOTH,
  nfPhotoUrl: NF_BOTH,
  nfList: NF_BOTH,
  nfPersonSet: "newfamily",
  nfAssign: NF_BOTH,
  // 새가족 2단계(2026-10-07 · 설계 §3) — 교육 줄(= 섬김이 보고서의 한 줄) · 목사님 교육 참석 · 보고서 보내기·돌려보내기 · 교구 배정.
  //   줄의 내용은 운영팀·목사님·그분의 섬김이만 읽는다(nf-db.ts canLessonRead) · 목사님 일(참석·돌려보내기·교구)은 kind pastor 와 운영팀만.
  nfLessons: NF_BOTH,
  nfLessonSave: NF_BOTH,
  nfLessonDelete: NF_BOTH,
  nfPastorClass: NF_BOTH,
  nfReportSend: NF_BOTH,
  nfReportReturn: NF_BOTH,
  nfParishList: NF_BOTH,
  nfParishSet: NF_BOTH,
  // 새가족 3단계(2026-10-07 · 설계 §4) — 등록식 명단·확정(수료번호는 SQL nf_ceremony_confirm 한 곳)·엑셀 · 한 분 지우기. 운영팀만.
  nfCeremonyList: "newfamily",
  nfCeremonySave: "newfamily",
  nfCeremonyPeople: "newfamily",
  nfCeremonyConfirm: "newfamily",
  nfExport: "newfamily",
  nfPersonDelete: "newfamily",
  // 새가족 4단계 — 통계(숫자와 교구·섬김이 이름뿐 · 새가족 이름 없음). 운영팀과 새가족 목사님(nf-db.ts canPastor).
  nfStats: NF_BOTH,
  // 대신 넣기의 명부 찾기 — 맡은 당번의 창에서만(board_id 필수 · 총괄도) · 기록 people.lookup from:"duty"
  dutyPeopleLookup: DUTY_BOTH,
  // 👥 봉사자(사람별 봉사 이력 · 2026-10-07) — 총괄은 모든 당번 · 담당은 맡은 당번 안에서만(duty-db.ts peopleBoards — 사람을 잇는 것도 그 안의 줄만으로).
  //   읽기 둘은 기록 없음(명단 읽기와 같다) · 엑셀은 기록 duty.people.export(이름 없이 해·줄 수·당번 수만). 응답에 user_id·ident_key·교인ID 없음(duty-rules.ts peopleOut·historyOut).
  dutyPeople: DUTY_BOTH,
  dutyPersonHistory: DUTY_BOTH,
  dutyPeopleExport: DUTY_BOTH,
};

export type MemberStatus = "pending" | "active" | "disabled";
export type Gate = "ok" | "unknown-action" | "not-registered" | "pending" | "disabled" | "forbidden";

export function canCall(action: string, member: { status: MemberStatus; roles: string[] } | null): Gate {
  // hasOwnProperty — "toString" 같은 객체 기본 이름이 액션으로 통과하지 않게
  if (!Object.prototype.hasOwnProperty.call(ACTION_ROLES, action)) return "unknown-action";
  const need = ACTION_ROLES[action];
  if (need === null) return "ok";
  if (!member) return "not-registered";
  if (member.status === "pending") return "pending";
  if (member.status !== "active") return "disabled";
  const needs = Array.isArray(need) ? need : [need];
  if (member.roles.includes("super") || needs.some((r) => member.roles.includes(r))) return "ok";
  return "forbidden";
}

// 서버가 아는 역할 이름 — 메뉴 목록(js/menus/registry.js)이 이 밖의 역할을 쓰면 시험이 실패한다. 배열은 펼쳐 담는다.
export function knownRoles(): string[] {
  const s = new Set<string>(["super"]);
  for (const v of Object.values(ACTION_ROLES)) for (const r of Array.isArray(v) ? v : v ? [v] : []) s.add(r);
  return [...s].sort();
}

// 완성형(NFC)으로 — 맥에서 온 자모분리 이름이 딴 사람이 되지 않게(2026-09-20 찬양대 NFC/NFD 사고)
export const norm = (s: unknown): string =>
  (s ?? "").toString().normalize("NFC").trim().replace(/\s+/g, " ");

export type Identity = { type: string; gu: string; mok: string; bu: string; grade: string; name: string };
export type ParsedIdentity = { ok: true; identity: Identity } | { ok: false; error: string };

const MAX_LEN = 40;

// 등록 칸 확인 — 교구 목록은 서버가 거르지 않는다(교구가 늘 때 서버까지 고치지 않게). 화면이 목록으로 받는다.
export function parseIdentity(x: unknown): ParsedIdentity {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, error: "invalid" };
  const o = x as Record<string, unknown>;
  const type = norm(o.type) || "교구";
  if (type !== "교구" && type !== "교회학교") return { ok: false, error: "invalid-type" };
  const f = (k: string) => norm(o[k]);
  const identity: Identity = type === "교구"
    ? { type, gu: f("gu"), mok: f("mok"), bu: "", grade: "", name: f("name") }
    : { type, gu: "", mok: "", bu: f("bu"), grade: f("grade"), name: f("name") };
  if (Object.values(identity).some((v) => v.length > MAX_LEN)) return { ok: false, error: "too-long" };
  // supabase-js 의 .in() 은 값에 , ( ) 가 있으면 "…" 로 감싸기만 하고 " \ 를 이스케이프하지 않는다 —
  // 이름을 김," 로 등록하면 membersList 가 그 사람이 대기하는 동안 500 이 된다. | 는 identity_key 의 구분자.
  if (Object.values(identity).some((v) => /["\\,()|]/.test(v))) return { ok: false, error: "bad-char" };
  if (!identity.name) return { ok: false, error: "name-required" };
  if (type === "교구" && (!identity.gu || !identity.mok)) return { ok: false, error: "gu-mok-required" };
  if (type === "교회학교" && (!identity.bu || !identity.grade)) return { ok: false, error: "bu-grade-required" };
  return { ok: true, identity };
}

// 성경암송 앱 users.identity_key 와 같은 꼴(supabase/functions/api/index.ts 의 identityKey)
export const identityKey = (u: Identity): string =>
  [u.type, u.gu, u.mok, u.bu, u.grade, u.name].map(norm).join("|");

// 적은 표기가 사람마다 달라 여러 꼴로 맞춰 본다(api 의 ministryStaffCandidates 를 양방향으로 넓힘)
//  · 목장 「20」·「20목장」  · 학년 「3」·「3학년」
export function identityCandidates(u: Identity): string[] {
  const m0 = u.mok.replace(/목장$/, "");
  const moks = [u.mok, m0, /^\d+$/.test(m0) ? m0 + "목장" : m0];
  const g0 = u.grade.replace(/학년$/, "");
  const grades = [u.grade, g0, /^\d+$/.test(g0) ? g0 + "학년" : g0];
  const out = new Set<string>();
  for (const mok of moks) for (const grade of grades) out.add(identityKey({ ...u, mok, grade }));
  return [...out];
}

// 역할 고르기 확인 — known 은 admin_roles 표에서 읽은 id 들(역할 목록의 원본은 표 하나)
export function parseRoles(x: unknown, known: string[]):
  { ok: true; roles: string[] } | { ok: false; error: string } {
  if (!Array.isArray(x)) return { ok: false, error: "invalid-roles" };
  const roles = [...new Set(x.map((r) => norm(r)))].filter(Boolean).sort();
  if (!roles.length) return { ok: false, error: "roles-required" };
  if (roles.some((r) => !known.includes(r))) return { ok: false, error: "unknown-role" };
  return { ok: true, roles };
}

// 카카오 별명 — index.ts 가 카카오 identity 의 identity_data 를 넘긴다(user_metadata 가 아니다 —
// 본인이 auth.updateUser 로 고칠 수 있어서). 2026-09-28 확인: name·full_name·preferred_username·user_name 칸에 담긴다.
// nickname 칸은 오지 않지만 판이 바뀔 때를 대비해 여럿을 본다.
export function kakaoNickname(meta: unknown): string {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const v = m.nickname || m.name || m.full_name || m.preferred_username || m.user_name || "";
  return norm(v).slice(0, MAX_LEN);
}

// 카카오 프로필 사진 — 승인 목록에서 본인 확인용(카카오 동의항목에 그렇게 적었다).
// 카카오는 http:// 로 준다 → https 페이지에서 막히지 않게 https:// 로.
// 호스트를 카카오 CDN 만 허용한다 — 다른 서버 주소면 목록을 여는 관리자의 IP·시각이 그 서버에 남는다.
export function kakaoAvatar(meta: unknown): string {
  const m = (meta && typeof meta === "object" ? meta : {}) as Record<string, unknown>;
  const v = String(m.avatar_url || m.picture || "").trim();
  if (!/^https?:\/\/([a-z0-9-]+\.)*kakaocdn\.net\/[^\s"'<>]*$/i.test(v)) return "";
  return v.replace(/^http:\/\//i, "https://").slice(0, 500);
}
