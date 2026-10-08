// 메뉴 목록 — 메뉴 하나 = 한 줄. role 은 서버 authz.ts 가 아는 역할이어야 한다(tests/registry.test.mjs).
//   여러 역할 가운데 하나만 있어도 보이는 메뉴는 roles: [...] (role 을 배열로 써도 같다 · menuRoles 가 읽는다 · 2026-10-05 교육 담당).
// ⚠️ 여기서 숨기는 것은 편의일 뿐, 막는 것은 서버다.
// 줄 차례 = 왼쪽 메뉴·처음 화면의 차례. 묶음(group)이 대분류, 줄이 중분류다 — 한 묶음의 줄은 붙여 둔다.
// 교인명부가 맨 위(친구 2026-09-30).
export const MENUS = [
  { id: "people", group: "교인명부", icon: "🔎", label: "교인 찾기", desc: "이름·전화 뒷자리로 찾기 · 사진 · 내려받기",
    role: "directory", load: () => import("./people/search.js") },
  { id: "people-stats", group: "교인명부", icon: "📊", label: "교인 현황", desc: "교구별 인원·가구 · 직분·부서·연령대별 인원",
    role: "directory", load: () => import("./people/stats.js") },
  { id: "status", group: "사역 신청", icon: "📋", label: "신청 현황", desc: "접수·임명·취소 · 같은 번호 확인 · 삭제",
    role: "ministry", load: () => import("./ministry/status.js") },
  { id: "catalog", group: "사역 신청", icon: "🗂️", label: "사역팀 정보", desc: "팀 설명 · 언제 · 담당 · 지금 섬기는 분 · 차례",
    role: "ministry", load: () => import("./ministry/catalog.js") },
  { id: "paper", group: "사역 신청", icon: "📋", label: "종이 명단 올리기", desc: "엑셀·붙여넣기로 한꺼번에 · 알림은 가지 않아요",
    role: "ministry", load: () => import("./ministry/paper.js") },
  { id: "appointed", group: "사역 신청", icon: "🎉", label: "임명현황", desc: "임명된 분을 부서·교구·사람별로 · 내려받기",
    role: "ministry", load: () => import("./ministry/appointed.js") },
  { id: "mn-history", group: "사역 신청", icon: "📜", label: "사역 이력", desc: "지난 해 사역 임명 명단 올리기 · 교적 잇기 · 못 맞춘 줄 고치기",
    role: "ministry", load: () => import("./ministry/history.js") },
  { id: "mn-requests", group: "사역 신청", icon: "📮", label: "정정 신청", desc: "앱에서 온 사역 이력 정정 신청 보기·처리",
    role: "ministry", load: () => import("./ministry/requests.js") },
  { id: "mn-stats", group: "사역 신청", icon: "📊", label: "사역 통계", desc: "해마다 봉사자·자리 · 계속·처음·쉼 · 계열별 · 나이·직분 · 엑셀",
    role: "ministry", load: () => import("./ministry/stats.js") },
  { id: "be-roster", group: "성경 필사·암송", icon: "📋", label: "회차·명단", desc: "완서자 명단 보기 · 고치기 · 회차 설정",
    role: "bibleevent", load: () => import("./bibleevent/roster.js") },
  { id: "be-upload", group: "성경 필사·암송", icon: "📤", label: "명단 올리기", desc: "엑셀·붙여넣기로 한꺼번에 더하기",
    role: "bibleevent", load: () => import("./bibleevent/upload.js") },
  { id: "be-history", group: "성경 필사·암송", icon: "👤", label: "사람별 이력·통계", desc: "이름으로 찾기 · 회차별·교구별 · 여러 번 참여",
    role: "bibleevent", load: () => import("./bibleevent/history.js") },
  // 🎓 교육신청(2026-10-05 · 1단계) — 강좌 관리(교육 총괄만 · 담당자 지정도 여기) · 신청 현황(교육 총괄 = 모든 강좌 ·
  //   교육 담당(맡은 강좌) = 지정받은 강좌만 — 서버 edu-db.ts 가 강좌마다 막는다 not-assigned).
  { id: "edu-courses", group: "교육 신청", icon: "📚", label: "강좌 관리", desc: "강좌 만들기 · 회차 · 담당자 · 지난 학기 복사 · 모집 열기",
    role: "education", load: () => import("./education/courses.js") },
  { id: "edu-enroll", group: "교육 신청", icon: "📝", label: "신청 현황", desc: "확정·대기·반려 · 대신 등록 · 교재비 · 엑셀",
    roles: ["education", "educourse"], load: () => import("./education/enrollments.js") },
  // ✅ 출석부(2026-10-05 · 2단계) — 교육 총괄(모든 강좌) · 교육 담당·강사(맡은 강좌만 — 서버 edu-db.ts attendKinds 가 막는다 not-assigned).
  //   강사(teacher)는 이 메뉴만 — 신청 현황(이름·상태·교재비·메모)은 못 본다.
  { id: "edu-attend", group: "교육 신청", icon: "✅", label: "출석부", desc: "회차마다 출석·지각·결석·공결 · 출석 현황 · 엑셀",
    roles: ["education", "educourse", "teacher"], load: () => import("./education/attendance.js") },
  // 🎓 수료(2026-10-05 · 3단계) — 교육 총괄(모든 강좌) · 교육 담당(manager 로 맡은 강좌만 — 서버 edu-db.ts mayTouch 가 not-assigned).
  //   ⚠️ 강사(teacher)는 넣지 않는다 — 강사는 출석만(서버 authz.ts EDU_BOTH 도 강사를 문에서 forbidden). 「수료증 설정」 단추는 총괄만.
  { id: "edu-cert", group: "교육 신청", icon: "🎓", label: "수료", desc: "수료 기준·후보 · 수료 확정·취소 · 수료증 인쇄",
    roles: ["education", "educourse"], load: () => import("./education/certs.js") },
  // 📊 교육 통계(2026-10-06 · 4단계 C) — 교육 총괄만(서버 authz.ts eduStats "education" · edu-db.ts eduChief). 교육 묶음 맨 끝.
  { id: "edu-stats", group: "교육 신청", icon: "📊", label: "교육 통계", desc: "학기별 강좌마다 신청·확정·출석률·수료 · 교구별 · 엑셀",
    role: "education", load: () => import("./education/stats.js") },
  // 🙋 봉사 당번(2026-10-06 · 1단계) — 당번 관리(당번 총괄만 · 만들기·이름·상태·담당자 지정) · 당번 명단(당번 총괄 = 모든 당번 ·
  //   당번 담당(맡은 당번) = 지정받은 당번만 — 서버 duty-db.ts 가 당번마다 막는다 not-assigned). 자리 틀·날짜·쉬는 날도 명단 메뉴에서.
  { id: "duty-boards", group: "봉사 당번 신청", icon: "🧰", label: "당번 관리", desc: "당번 만들기 · 상태 · 담당자 지정",
    role: "duty", load: () => import("./duty/boards.js") },
  { id: "duty-roster", group: "봉사 당번 신청", icon: "📅", label: "당번 명단", desc: "날짜마다 선 분 · 넣기·빼기·옮기기 · 확정 · 쉬는 날 · 자리 틀 · 엑셀",
    roles: ["duty", "dutylead"], load: () => import("./duty/roster.js") },
  // 👥 봉사자(2026-10-07 친구 요청 — 담당자 쪽 「이분의 봉사 이력」을 사람별로) — 당번 총괄 = 모든 당번 · 당번 담당 = 맡은 당번 안에서만
  //   (서버 duty-db.ts peopleBoards — 사람을 잇는 것도 그 안의 줄만으로). 📅 당번 명단의 이름을 눌러도 같은 이력 창(person-window.js)이 열린다.
  { id: "duty-people", group: "봉사 당번 신청", icon: "👥", label: "봉사자", desc: "사람마다 선 날 · 그해·지금까지 몇 번 · 앞으로 · 빠진 기록 · 엑셀",
    roles: ["duty", "dutylead"], load: () => import("./duty/people.js") },
  // 🌱 새가족(2026-10-07 · 1단계) — 종이 등록카드 → 섬김이 배정 → 교육 → 교구 배정 → 등록식. 성도님 앱에는 없다(내부 담당자만).
  //   새가족 운영팀(newfamily) = 전부 · 새가족 섬김(nfteam) = 영접팀·정착팀 총무·섬김이·목사님 — 하는 일과 자기 줄은 서버 nf-db.ts 가 본다(not-assigned).
  { id: "nf-card", group: "새가족 관리", icon: "🌱", label: "새가족 카드", desc: "등록카드 넣기·고치기 · 카드 사진 · 환영 사진",
    roles: ["newfamily", "nfteam"], load: () => import("./newfamily/cards.js") },
  { id: "nf-board", group: "새가족 관리", icon: "👣", label: "새가족 현황", desc: "한 분마다 지금 몇째 걸음인지 · 섬김이 배정 · 교육 기록 · 목사님 교육 · 교구 배정",
    roles: ["newfamily", "nfteam"], load: () => import("./newfamily/board.js") },
  { id: "nf-ceremony", group: "새가족 관리", icon: "🎉", label: "등록식", desc: "후보에서 골라 명단 만들기 · 확정하면 수료번호 · 엑셀",
    role: "newfamily", load: () => import("./newfamily/ceremony.js") },
  { id: "nf-stats", group: "새가족 관리", icon: "📊", label: "새가족 통계", desc: "오신 분 · 수료 대상 · 등록 — 세는 기준 날짜를 골라서 · 교구별 · 엑셀",
    roles: ["newfamily", "nfteam"], load: () => import("./newfamily/stats.js") },
  { id: "nf-staff", group: "새가족 관리", icon: "🧑‍🤝‍🧑", label: "함께 쓰는 분", desc: "영접팀 · 정착팀 총무 · 섬김이 · 새가족 목사님 넣기·빼기",
    role: "newfamily", load: () => import("./newfamily/staff.js") },
  { id: "members", group: "시스템", icon: "🔑", label: "담당자·역할", desc: "승인 대기 · 역할 주기 · 정지",
    role: "super", load: () => import("./system/members.js") },
  // 🧪 시험 참여자 — 시스템 묶음 · 총괄만(2026-10-02 친구 요청 · 그전에는 사역신청 묶음 · 역할 ministry).
  //   사역신청 담당이 스스로 시험 참여자를 더하지 않게 서버(authz.ts)도 super 로 막는다.
  { id: "testers", group: "시스템", icon: "🧪", label: "시험 참여자", desc: "신청 기간 전에 성경암송 첫 화면 사역현황을 열어 줄 분 · 더하기·빼기",
    role: "super", load: () => import("./ministry/testers.js") },
  { id: "audit", group: "시스템", icon: "📜", label: "바꾼 기록", desc: "누가 언제 무엇을 바꿨나",
    role: "super", load: () => import("./system/audit.js") },
  { id: "life-reset", group: "시스템", icon: "🔑", label: "확인 번호 풀기", desc: "교회 생활 확인 번호를 잊은 분 풀어 주기",
    role: "super", load: () => import("./system/life-reset.js") },
];

// 묶음(대분류) 머리의 아이콘 — 메뉴 줄(중분류)의 아이콘과 겹치지 않게 고른다
export const GROUP_ICON = { "교인명부": "👥", "사역 신청": "🤝", "성경 필사·암송": "✍️", "교육 신청": "🎓", "봉사 당번 신청": "🙋", "새가족 관리": "💐", "시스템": "⚙️" };

// 메뉴 하나가 받는 역할들 — roles 배열 · role 배열 · role 글자 하나 모두 배열로
export function menuRoles(m) {
  if (Array.isArray(m && m.roles)) return m.roles;
  if (Array.isArray(m && m.role)) return m.role;
  return m && m.role ? [m.role] : [];
}

export function menusFor(roles) {
  const r = new Set(roles || []);
  return MENUS.filter((m) => r.has("super") || menuRoles(m).some((x) => r.has(x)));
}

// 받은 메뉴를 묶음 차례(MENUS 에 처음 나온 차례)대로 — [{ group, icon, menus }] · 메뉴가 없는 묶음은 뺀다
export function menuGroups(menus) {
  const out = [];
  for (const m of menus || []) {
    let g = out.find((x) => x.group === m.group);
    if (!g) out.push(g = { group: m.group, icon: GROUP_ICON[m.group] || "", menus: [] });
    g.menus.push(m);
  }
  return out;
}
