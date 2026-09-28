// 🎉 임명현황 — 임명이 끝난 명단을 부서별·교구별·사람별로 본다.
// 성경암송 admin-stats.html 의 renderMinistryAppointed 를 옮겨 왔다(2026-09-28 · 옛 화면은 얼린 채 둔다).
// ⚠️ 사람은 「김세웅-화평20」 한 가지 꼴로만 — 직분·번호는 싣지 않는다(서버도 주지 않는다).
// ⚠️ 상태는 임명확정만 — 서버(ministryAppointed)가 그것만 준다. 신청·접수는 현황 화면(3단계)이 맡는다.
// ⚠️ 내려받기는 지금 화면에 보이는 것만(찾기가 걸려 있으면 그것만) — 화면과 파일이 달라지면 안 된다.
import { esc, toast, errorText } from "../../core/ui.js";

// 성경암송 앱(app.js GU_LIST)과 같게 — 교구 차례
const GU_LIST = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
const TITLE = `<h2 class="page-title">🎉 임명현황</h2>`;
const VIEWS = [["dept", "부서별"], ["gu", "교구별"], ["person", "사람별"]];

// 보기·찾기는 메뉴를 옮겨 다녀도 남는다(옛 화면과 같게)
let view = "dept";
let q = "";

export const whoShort = (w) => String(w || "").replace(/\s+/g, "").replace(/목장$/, "");
export const label = (r) => (r.name || "이름 없음") + "-" + whoShort(r.who);
export const guOf = (r) => String(r.who || "").trim().split(/\s+/)[0] || "그 밖";
export const mokOf = (r) => { const m = /(\d+)/.exec(String(r.who || "")); return m ? Number(m[1]) : 9999; };

export function filterRows(rows, query) {
  const s = String(query || "").trim().toLowerCase();
  if (!s) return rows;
  return rows.filter((r) => [r.name, r.who, r.team, r.committee, label(r)]
    .some((v) => String(v || "").toLowerCase().includes(s)));
}

const byKo = (a, b) => String(a).localeCompare(String(b), "ko");
const kstDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
};

// 엑셀에서 바로 열리게 CSV(BOM). 부서 → 사역팀 → 이름 차례.
export function csvText(rows) {
  const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = ["표시", "이름", "소속", "교구", "부서", "사역팀", "하위 선택", "신청일", "임명일", "들어온 길"];
  const body = [...rows]
    .sort((a, b) => byKo(a.committee, b.committee) || byKo(a.team, b.team) || byKo(a.name, b.name))
    .map((r) => [label(r), r.name, r.who, guOf(r), r.committee, r.team, r.option, r.at, kstDate(r.decided_at),
      r.source === "paper" ? "종이" : "앱"]);
  return "﻿" + [head, ...body].map((row) => row.map(cell).join(",")).join("\r\n");
}

function download(text, year) {
  const t = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${year}_임명현황_${t}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const chip = (r) => `<span class="ap-p">${esc(label(r))}</span>`;

function listHtml(rows) {
  if (view === "dept") {   // 부서 → 사역팀(하위 선택) → 사람
    const byCom = new Map();
    for (const r of rows) {
      if (!byCom.has(r.committee)) byCom.set(r.committee, new Map());
      const teams = byCom.get(r.committee);
      const k = r.team + (r.option ? " (" + r.option + ")" : "");
      if (!teams.has(k)) teams.set(k, []);
      teams.get(k).push(r);
    }
    return [...byCom.entries()].sort((a, b) => byKo(a[0], b[0])).map(([com, teams]) => {
      const n = [...teams.values()].reduce((s, l) => s + l.length, 0);
      return `<div class="ap-g"><div class="ap-h"><b>${esc(com || "부서 없음")}</b><em>${n}명</em></div>` +
        [...teams.entries()].sort((a, b) => byKo(a[0], b[0])).map(([team, list]) =>
          `<div class="ap-t"><div class="ap-tn">${esc(team)} <i>${list.length}</i></div>` +
          `<div class="ap-ps">${list.sort((a, b) => byKo(a.name, b.name)).map(chip).join("")}</div></div>`).join("") +
        `</div>`;
    }).join("");
  }
  if (view === "gu") {     // 교구(차례) → 사람(목장 차례) · 한 사람은 한 번
    const byGu = new Map();
    for (const r of rows) { const g = guOf(r); if (!byGu.has(g)) byGu.set(g, []); byGu.get(g).push(r); }
    const rank = (g) => { const i = GU_LIST.indexOf(g); return i < 0 ? 99 : i; };
    return [...byGu.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || byKo(a[0], b[0])).map(([gu, list]) => {
      const seen = new Map();
      for (const r of list) if (!seen.has(label(r))) seen.set(label(r), r);
      const ones = [...seen.values()].sort((a, b) => mokOf(a) - mokOf(b) || byKo(a.name, b.name));
      return `<div class="ap-g"><div class="ap-h"><b>${esc(gu)}</b><em>${ones.length}명</em></div>` +
        `<div class="ap-ps">${ones.map(chip).join("")}</div></div>`;
    }).join("");
  }
  const byP = new Map();   // 사람 → 그분이 임명된 사역들
  for (const r of rows) { const k = label(r); if (!byP.has(k)) byP.set(k, []); byP.get(k).push(r); }
  return `<div class="ap-g">` + [...byP.entries()].sort((a, b) => byKo(a[0], b[0])).map(([lb, list]) =>
    `<div class="ap-one"><span class="ap-p">${esc(lb)}</span>` +
    `<span class="ap-tm">${list.map((r) => esc(r.team)).join(" · ")}</span></div>`).join("") + `</div>`;
}

export async function render(el, { call }) {
  el.innerHTML = TITLE + `<p class="empty">불러오는 중…</p>`;
  const r = await call("ministryAppointed");
  if (!r.ok) { el.innerHTML = TITLE + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  const all = r.rows;
  el.innerHTML = `<h2 class="page-title">🎉 임명현황 <span class="muted">${esc(r.year)}년</span></h2>
    <div class="acts" style="margin-bottom:10px">
      <button type="button" class="btn" data-act="csv">⬇️ 내려받기</button>
      <button type="button" class="btn" data-act="reload">↻ 새로 불러오기</button>
    </div>
    <input type="search" class="search" placeholder="🔍 이름 · 소속 · 사역팀 · 부서" autocomplete="off" aria-label="찾기">
    <div class="tabs" role="tablist">${VIEWS.map(([v, t]) =>
      `<button type="button" role="tab" data-v="${v}">${t} <em data-vn="${v}">0</em></button>`).join("")}</div>
    <p class="muted ap-sum"></p>
    <div class="ap-list"></div>`;
  const input = el.querySelector(".search");
  input.value = q;

  const draw = () => {
    const rows = filterRows(all, q);
    const people = new Set(rows.map(label));
    const vn = { dept: new Set(rows.map((x) => x.committee)).size, gu: new Set(rows.map(guOf)).size, person: people.size };
    el.querySelectorAll("[data-vn]").forEach((e) => { e.textContent = vn[e.dataset.vn]; });
    el.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
    el.querySelector(".ap-sum").innerHTML = `임명 <b>${rows.length}건</b> · <b>${people.size}명</b>` +
      (q ? ` <i>(‘${esc(q)}’로 찾은 것 · 전체 ${all.length}건)</i>` : "");
    el.querySelector(".ap-list").innerHTML = rows.length ? listHtml(rows)
      : `<p class="empty">${q ? `‘${esc(q)}’에 맞는 임명이 없어요` : "임명된 신청이 아직 없어요"}</p>`;
  };

  input.addEventListener("input", () => { q = input.value.trim(); draw(); });
  el.addEventListener("click", (e) => {
    const tab = e.target.closest(".tabs button");
    if (tab) { view = tab.dataset.v; draw(); return; }
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    // 새로 불러오기는 새 <section> 에 — 같은 el 에 다시 그리면 이 click 처리가 겹쳐 쌓인다
    if (b.dataset.act === "reload") { const fresh = document.createElement("section"); el.replaceWith(fresh); render(fresh, { call }); return; }
    if (b.dataset.act === "csv") {
      const rows = filterRows(all, q);
      if (!rows.length) { toast("내려받을 임명이 없어요"); return; }
      download(csvText(rows), r.year);
    }
  });
  draw();
}
