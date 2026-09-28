// 메뉴 목록 — 메뉴 하나 = 한 줄. role 은 서버 authz.ts 가 아는 역할이어야 한다(tests/registry.test.mjs).
// ⚠️ 여기서 숨기는 것은 편의일 뿐, 막는 것은 서버다.
export const MENUS = [
  { id: "appointed", group: "사역신청", icon: "🎉", label: "임명현황", desc: "임명된 분을 부서·교구·사람별로 · 내려받기",
    role: "ministry", load: () => import("./ministry/appointed.js") },
  { id: "members", group: "시스템", icon: "🔑", label: "담당자·역할", desc: "승인 대기 · 역할 주기 · 정지",
    role: "super", load: () => import("./system/members.js") },
  { id: "audit", group: "시스템", icon: "📜", label: "바꾼 기록", desc: "누가 언제 무엇을 바꿨나",
    role: "super", load: () => import("./system/audit.js") },
];

export function menusFor(roles) {
  const r = new Set(roles || []);
  return MENUS.filter((m) => r.has("super") || r.has(m.role));
}
