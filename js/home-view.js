// 처음 화면(홈) 그리기 — 순수 함수. 로그인 없이 시험·화면 확인을 하려고 main.js 에서 떼어 냈다.
import { esc, affiliation } from "./core/ui.js";
import { menuGroups } from "./menus/registry.js";

// 메뉴 카드 하나 — PC 는 대분류 구역 안에서 테두리 없는 간결한 메뉴 단추로 바뀐다.
const cardHtml = (m) => `<a class="card home-card" href="#/${esc(m.id)}" title="${esc(m.desc)}">` +
  `<span class="hc-main"><span class="hc-ic" aria-hidden="true">${m.icon}</span><b class="hc-t">${esc(m.label)}</b></span>` +
  `<span class="muted hc-d">${esc(m.desc)}</span></a>`;

// member·rolesInfo([{label}])·roles(역할 글자들)·menus(menusFor 결과) → 홈 HTML
export function homeHtml({ member, rolesInfo, roles, menus }) {
  const labels = (rolesInfo || []).map((r) => r.label);
  return `<div class="home"><h2 class="page-title">${esc(member.name)} 님, 평안하세요</h2>
    <p class="muted home-who">${esc(affiliation(member))} · ${esc(labels.join(" · ") || "역할 없음")}</p>
    ${menus && menus.length
      ? `<div class="home-sections">${menuGroups(menus).map((g) => `<section class="home-group">` +
          `<h3 class="home-g"><span aria-hidden="true">${g.icon}</span>${esc(g.group)}</h3>` +
          `<div class="home-grid">${g.menus.map(cardHtml).join("")}</div></section>`).join("")}</div>`
      : roles && roles.length
        ? `<p class="empty">이 역할의 메뉴는 곧 열려요</p>`
        : `<p class="empty">아직 쓸 수 있는 메뉴가 없어요 — 총괄 관리자에게 역할을 받아 주세요</p>`}</div>`;
}
