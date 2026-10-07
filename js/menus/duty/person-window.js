// 🙋 한 분의 봉사 이력 창 — 👥 봉사자(people.js)와 📅 당번 명단(roster.js — 이름을 누르면)이 함께 쓴다(2026-10-07 친구 요청).
//   서버 dutyPersonHistory {signup_id, board_id?, year?} — 그 줄의 당번을 **서버가 읽어** 볼 수 있는 당번인지 보고, 볼 수 있는 당번(좁혔으면 그 하나) 안의 줄만으로 그분을 잇는다.
//   앞으로(가까운 날부터) · 섰던 날 · 빠진 기록(까닭과 함께 — 접힌 채로). 읽기만 — 넣기·빼기는 📅 당번 명단에서.
//   말·차례는 people-logic.js(시험). ⚠️ 서버 글자는 모두 esc · 응답에 계정 번호·교인ID 는 없다(사람은 지원 번호로 가리킨다).
//   (독립 검토 반영 2026-10-08) ① 불러오는 동안 부른 화면의 단추를 잠근다(받는 중 표시 · 두 번 누름 · 다른 줄 누름) ② 답이 늦어 그사이 메뉴를 옮겼으면 창을 띄우지 않는다
//   ③ 범위 한 줄을 늘 보인다(담당의 수는 맡은 당번 안의 수다) ④ 창 본문에 초점을 준다(입력 칸이 없는 창이라 초점이 뒤 화면에 남았다 — 자판으로 굴리고 Tab 으로 단추에 간다)
//   ⑤ 「빠진 기록」은 세모가 붙은 단추로 펼친다(<details> 는 창의 Tab 가두기 목록에 없다) ⑥ 맡은 당번에서 빠졌으면(not-assigned) 부른 쪽이 다시 불러오게 lost 를 돌려준다.
import { esc, toast, busy } from "../../core/ui.js";
import { openForm } from "../../core/modal.js";
import { failText } from "./roster-forms.js";
import { lostBoard } from "./duty-logic.js";
import { dateWord, historyParts, historyBadges, historyTotals, historyCut, historyScope, widenLabel, personBadges, rowPlace, whyText } from "./people-logic.js";

const badgeHtml = (b) => `<span class="badge${b.cls ? " " + b.cls : ""}"${b.title ? ` title="${esc(b.title)}"` : ""}>${esc(b.text)}</span>`;
const rowHtml = (r, today) => {
  const why = r.kind === "missed" ? whyText(r, today) : "";
  const badges = historyBadges(r);
  return `<div class="dpp-hr ${esc(r.kind)}"><span class="dpp-d">${esc(dateWord(r.date, today))}${r.date === today ? " · 오늘" : ""}</span>
    <span class="dpp-w">${esc(rowPlace(r))}</span>${why ? `<span class="dpp-why">${esc(why)}</span>` : ""}${
    badges.length ? `<span class="dpp-bd">${badges.map(badgeHtml).join(" ")}</span>` : ""}</div>`;
};

// title = 좁힌 당번의 이름 · year = 고른 해(없으면 서버의 해) · fold = 「빠진 기록」을 펼쳐 두었나
function bodyHtml(h, { title, year, fold }) {
  const p = h.person, parts = historyParts(h.rows), cut = historyCut(h), today = h.today;
  // 묶음 머리의 수는 **서버가 센 수**(자리마다 한 번 · 앞으로는 쉬는 날·쉬는 자리를 빼고) — 줄 수로 적으면 쉼 줄이 낀 「앞으로 2」가 위의 「앞으로 1번」과 어긋난다
  const sec = (name, n, list, empty) => `<h4 class="dpp-sec">${esc(name)} <em>${esc(n)}</em></h4>${
    list.length ? list.map((r) => rowHtml(r, today)).join("") : `<p class="dpp-none">${esc(empty)}</p>`}`;
  return `<p class="dpp-h">${p.who ? `<span class="muted">${esc(p.who)}</span>` : ""}${personBadges(p).map(badgeHtml).join(" ")}</p>
    <p class="dpp-tot">${esc(historyTotals(h, year ?? h.year, today))}</p>
    <p class="be-note dpp-scope"><span>${esc(historyScope(h, title))}</span>${
      h.narrowed ? `<button type="button" class="btn dpp-all" data-act="all">${esc(widenLabel(h))}</button>` : ""}</p>
    ${sec("앞으로", h.upcoming || 0, parts.up, "앞으로 설 날이 없어요")}
    ${sec("섰던 날", h.served || 0, parts.served, "아직 선 날이 없어요")}
    ${parts.missed.length ? `<button type="button" class="dpp-foldb" data-act="fold" aria-expanded="${fold ? "true" : "false"}"><span class="dpp-tri" aria-hidden="true">${fold ? "▾" : "▸"}</span>빠진 기록 <em>${
      parts.missed.length}</em></button><div class="dpp-foldc"${fold ? "" : " hidden"}>${parts.missed.map((r) => rowHtml(r, today)).join("")}</div>` : ""}
    ${cut ? `<p class="muted dpp-cut">${esc(cut)}</p>` : ""}`;
}

// 창을 연다 → 닫힌 뒤 { ok:true } · 못 열었으면 { ok:false, lost } — lost = 맡은 당번에서 빠졌다(부른 쪽이 목록을 다시 불러온다 · 말한 대로) · gone = 그사이 메뉴를 옮겼다(아무것도 안 띄움).
//   host = 부른 화면(불러오는 동안 그 화면의 단추를 잠근다 · 떼어졌으면 창을 띄우지 않는다) · anchor = 누른 단추(창이 닫힌 뒤 초점이 돌아올 곳)
//   boardId·boardTitle = 좁힌 당번(👥 봉사자에서 당번 하나를 골라 둔 때) · year = 그해(없으면 올해 — 서버)
export async function openPersonHistory({ call, signupId, host = null, anchor = null, boardId = "", boardTitle = "", year = null }) {
  let narrow = boardId, fold = false, lost = false;
  const load = () => call("dutyPersonHistory", { signup_id: signupId, ...(narrow ? { board_id: narrow } : {}), ...(year ? { year } : {}) });
  let h = host ? await busy(host, load) : await load();
  if (host && host.isConnected === false) return { ok: false, gone: true };   // 늦게 온 답 — 지금 보이는 다른 메뉴 위에 창·토스트를 띄우지 않는다
  if (!h.ok) { toast(failText(h)); return { ok: false, lost: lostBoard(h.error) }; }
  // busy 가 단추를 잠갔다 풀며 초점이 풀렸다 — 누른 단추에 돌려 둔다(openForm 은 열 때의 초점을 기억했다가 닫힐 때 돌려준다)
  if (anchor && anchor.isConnected !== false && anchor.focus) anchor.focus({ preventScroll: true });
  const view = () => ({ title: boardTitle, year, fold });
  await openForm({
    title: `🙋 ${h.person.name || "이름 없음"} — 봉사 이력`, hideOk: true, cancelLabel: "닫기", html: bodyHtml(h, view()),
    onOpen: (root) => {
      const body = root.querySelector(".be-body");
      // 입력 칸이 없는 창 — 본문에 초점을 준다(자판의 화살표·PageDown 으로 굴리고 Tab 으로 단추에 간다). modal.js 의 focusFirst 는 숨은 「저장」 단추를 겨눠 초점을 옮기지 못한다
      body.tabIndex = 0;
      body.setAttribute("role", "group");
      body.setAttribute("aria-label", `${h.person.name || "이름 없음"} 님의 봉사 이력`);
      body.focus({ preventScroll: true });
      let busyNow = false;
      root.addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-act]");
        if (!b || busyNow) return;
        if (b.dataset.act === "fold") {
          // 펼치고 접기 — 다시 그리지 않는다(초점과 굴린 자리가 그대로)
          const box = body.querySelector(".dpp-foldc");
          if (!box) return;
          fold = !fold;
          box.hidden = !fold;
          b.setAttribute("aria-expanded", fold ? "true" : "false");
          const tri = b.querySelector(".dpp-tri");
          if (tri) tri.textContent = fold ? "▾" : "▸";
          return;
        }
        if (b.dataset.act !== "all") return;
        busyNow = true; b.disabled = true;
        const was = narrow;
        narrow = "";
        try {
          const x = await load();
          if (!root.isConnected) return;
          if (x.ok) {
            h = x;
            body.innerHTML = bodyHtml(h, view());
            body.focus({ preventScroll: true });   // 누른 단추가 사라졌다 — 초점이 뒤 화면(body)으로 떨어지지 않게
          } else if (lostBoard(x.error)) {
            // 그사이 맡은 당번에서 빠졌다 — 창을 닫고 부른 쪽이 목록을 다시 불러오게 한다
            lost = true;
            toast(failText(x));
            const c = root.querySelector(".be-cancel");
            if (c) c.click();
          } else { narrow = was; b.disabled = false; toast(failText(x)); }
        } finally { busyNow = false; }
      });
    },
  });
  return lost ? { ok: false, lost: true } : { ok: true };
}
