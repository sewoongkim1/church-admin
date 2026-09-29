// 메뉴 목록 — 메뉴 하나 = 한 줄. role 은 서버 authz.ts 가 아는 역할이어야 한다(tests/registry.test.mjs).
// ⚠️ 여기서 숨기는 것은 편의일 뿐, 막는 것은 서버다.
export const MENUS = [
  { id: "status", group: "사역신청", icon: "📋", label: "신청 현황", desc: "접수·임명·취소 · 같은 번호 확인 · 삭제",
    role: "ministry", load: () => import("./ministry/status.js") },
  { id: "catalog", group: "사역신청", icon: "🗂️", label: "사역팀 정보", desc: "팀 설명 · 언제 · 담당 · 지금 섬기는 분 · 차례",
    role: "ministry", load: () => import("./ministry/catalog.js") },
  { id: "paper", group: "사역신청", icon: "📋", label: "종이 명단 올리기", desc: "엑셀·붙여넣기로 한꺼번에 · 알림은 가지 않아요",
    role: "ministry", load: () => import("./ministry/paper.js") },
  { id: "appointed", group: "사역신청", icon: "🎉", label: "임명현황", desc: "임명된 분을 부서·교구·사람별로 · 내려받기",
    role: "ministry", load: () => import("./ministry/appointed.js") },
  { id: "be-roster", group: "성경필사(암송)", icon: "📋", label: "회차·명단", desc: "완서자 명단 보기 · 고치기 · 회차 설정",
    role: "bibleevent", load: () => import("./bibleevent/roster.js") },
  { id: "be-upload", group: "성경필사(암송)", icon: "📤", label: "명단 올리기", desc: "엑셀·붙여넣기로 한꺼번에 더하기",
    role: "bibleevent", load: () => import("./bibleevent/upload.js") },
  { id: "be-history", group: "성경필사(암송)", icon: "👤", label: "사람별 이력·통계", desc: "이름으로 찾기 · 회차별·교구별 · 여러 번 참여",
    role: "bibleevent", load: () => import("./bibleevent/history.js") },
  { id: "people", group: "교인명부", icon: "🔎", label: "교인 찾기", desc: "이름·전화 뒷자리로 찾기 · 사진 · 내려받기",
    role: "directory", load: () => import("./people/search.js") },
  { id: "people-stats", group: "교인명부", icon: "📊", label: "교인 현황", desc: "교구·부서·직분·연령대별 인원 · 사진 없는 분",
    role: "directory", load: () => import("./people/stats.js") },
  { id: "members", group: "시스템", icon: "🔑", label: "담당자·역할", desc: "승인 대기 · 역할 주기 · 정지",
    role: "super", load: () => import("./system/members.js") },
  { id: "audit", group: "시스템", icon: "📜", label: "바꾼 기록", desc: "누가 언제 무엇을 바꿨나",
    role: "super", load: () => import("./system/audit.js") },
];

export function menusFor(roles) {
  const r = new Set(roles || []);
  return MENUS.filter((m) => r.has("super") || r.has(m.role));
}
