// 바꾼 기록 — 총괄 관리자(super)만. 최근 100건.
// 「교인명부 기록」(people.*)은 따로 본다 — 찾기·보기가 많아 바꾼 일을 덮지 않게(서버 auditList 의 kind · 2026-09-29).
// 성경필사(암송): event.* 는 「바꾼 기록」, people.lookup·people.fill 은 people.* 라 「교인명부 기록」으로 간다.
// people.lookup 은 세 곳이 남긴다 — 성경필사 evPeopleLookup·evPerson(detail 에 from 없음) · 사역신청·담당자 ministryPerson
// (from:"ministry" · 2026-09-30 검토 5). 이름은 labelOf 가 detail 을 보고 가른다(LABEL 만 보면 사역신청 열람이 「성경필사」로 찍힌다).
import { esc, kstTime, errorText } from "../../core/ui.js";

const TITLE = `<h2 class="page-title">📜 바꾼 기록</h2>`;
// 시험(tests/audit.test.mjs)이 읽으려고 내보낸다 — 화면 동작은 그대로
export const LABEL = {
  register: "승인 요청", "register.update": "요청 고침",
  "members.approve": "승인", "members.roles": "역할 바꿈", "members.status": "상태 바꿈",
  "ministry.status": "사역 상태 바꿈", "ministry.delete": "사역 신청 삭제",
  "ministry.catalog": "사역팀 정보 고침", "ministry.order": "사역팀 차례 바꿈",
  "ministry.paper": "종이 명단 넣음",
  "ministry.tester": "사역 시험 참여자",
  "ministry.phoneclear": "사역 번호 지움",
  "people.search": "명부 찾기", "people.view": "교인 보기", "people.export": "명부 내려받기", "people.import": "명부 올림",
  "people.linksync": "기록 잇기 맞추기",
  "people.link": "교적 잇기",
  // 성경필사(암송) — detail 모양은 서버 index.ts 의 audit() 호출과 한 벌(tests/audit.test.mjs 가 못 박는다)
  "event.create": "성경필사 회차 만듦", "event.settings": "성경필사 회차 설정 바꿈",
  "event.add": "성경필사 명단 더함", "event.edit": "성경필사 명단 고침", "event.delete": "성경필사 명단 뺌",
  "event.upload": "성경필사 명단 올림",
  "people.lookup": "명부 찾기(성경필사)", "people.fill": "명부로 빈칸 채움(성경필사)",
};
// detail 로 가르는 이름 — 같은 action 을 여러 화면이 남길 때(칸 이름·값은 서버 events-person.ts ministryLookupLog 와 한 벌)
export const LOOKUP_MINISTRY = "명부 찾기(사역신청·담당자)";
export function labelOf(r) {
  const a = (r && r.action) || "";
  if (a === "people.lookup" && r.detail && r.detail.from === "ministry") return LOOKUP_MINISTRY;
  return LABEL[a] || a;
}
const STATUS = { pending: "대기", active: "사용", disabled: "정지" };
const KINDS = [["", "바꾼 기록"], ["people", "교인명부 기록"]];

// 거르기 — 여러 개(배열)는 「기쁨·소망」으로 잇는다. 문자열 하나(2026-09-29 전 옛 기록)도 그대로 받는다.
const filtersText = (f) => Object.entries(f || {})
  .map(([k, v]) => (k === "noPhoto" ? "사진 없음" : k === "household" ? `가족(세대주 ${v})`
    : Array.isArray(v) ? v.join("·") : v)).join(" · ");

// ---- 성경필사(암송) 기록 줄 ----
// 칸 이름은 서버 index.ts 의 audit() 호출 그대로다 — event.create·settings(Task 6) · event.add·edit·delete(Task 7) ·
// event.upload·people.lookup·people.fill(Task 8 · CONTRACT 5 「기록 모양」: upload 는 납작하게, lookup 은 {q, count} ·
// fill 은 {rows, names, asked, askedNames} — asked·askedNames 는 2026-09-30 SEC-2 부터).
// ⚠️ 칸 이름을 바꾸면 여기와 tests/audit.test.mjs 를 함께 — 안 고치면 기록 줄이 오류 없이 0·빈칸으로 보인다.
const EV_STATUS = { draft: "준비 중", open: "열림", closed: "마감", archived: "보관" };   // 📋 회차·명단의 상태 이름과 같다
const EV_FIELD = { title: "이름", short_title: "짧은 이름", subtitle: "부제", season: "묶음",
  opens_on: "시작일", closes_on: "마감일", status: "상태", list_until: "공개 종료일", sort_order: "차례" };
const ROW_FIELD = { who_type: "구분", group: "소속", sub: "세부", name: "이름", position: "직분" };
const SRC = { app: "📱 앱", import: "📋 이관" };                                           // 📋 회차·명단의 출처 표시와 같다
const LINK_KIND = { order: "사역신청", signup: "성경필사", history: "사역 이력" };
const LINK_HOW = { manual: "이분 것", none: "이분 아님", auto: "잇기 풀기" };
const joinDot = (...parts) => parts.filter(Boolean).join(" · ");
const evVal = (k, v) => (v == null || v === "") ? (k === "list_until" ? "기한 없음" : "(없음)")
  : k === "status" ? (EV_STATUS[v] || String(v)) : String(v);
const rowVal = (v) => (v == null || v === "") ? "(없음)" : String(v);
// 「화평 20목장」·「소망 남성」·「청년부」·「중등부 2」 — 서버 evWho 와 같은 꼴(교구 줄의 숫자 목장에만 「목장」)
function rowWho(w) {
  const g = String((w && w.group) || ""), s = String((w && w.sub) || "");
  const sub = w && w.who_type === "교구" && /^\d+$/.test(s) ? s + "목장" : s;
  return [g, sub].filter(Boolean).join(" ");
}
const evChanges = (b, a) => Object.keys(a || {})
  .map((k) => `${EV_FIELD[k] || k} ${evVal(k, (b || {})[k])} → ${evVal(k, a[k])}`);
// 물은·채운 분 이름 — 스무 분까지 적고 나머지는 수로(한 번에 600줄까지 올릴 수 있다)
const someNames = (names, max = 20) => {
  const n = Array.isArray(names) ? names : [];
  return n.slice(0, max).join(", ") + (n.length > max ? ` 외 ${n.length - max}명` : "");
};

export function detailText(r) {
  const d = r.detail || {};
  if (r.action === "members.approve") return "역할: " + (d.roles || []).join(", ");
  if (r.action === "members.roles") return (d.before || []).join(", ") + " → " + (d.after || []).join(", ");
  if (r.action === "members.status") return (STATUS[d.before] || d.before || "") + " → " + (STATUS[d.after] || d.after || "");
  if (r.action.startsWith("register")) return [d.gu, d.mok, d.bu, d.grade].filter(Boolean).join(" ");
  if (r.action === "ministry.status") return `${d.name || ""} · ${d.team || ""} · ${d.before || ""} → ${d.after || ""}${d.note ? " · 사유: " + d.note : ""}`;
  if (r.action === "ministry.delete") return `${d.name || ""} · ${d.who || ""} · ${d.committee || ""} ${d.team || ""} (${d.status || ""})`;
  if (r.action === "ministry.catalog") return `${d.team || ""} · ${(d.fields || []).join(", ")}`;
  if (r.action === "ministry.order") return `${(d.ids || []).length}팀`;
  if (r.action === "ministry.paper") return `저장 ${d.saved} · 새 계정 ${d.created} · 그대로 ${d.same} · 오류 ${d.errors}`;
  if (r.action === "ministry.tester") return [d.op === "add" ? "더함" : "뺌", d.name, d.who].filter(Boolean).join(" · ");
  if (r.action === "ministry.phoneclear") return `결정된 신청 ${d.count ?? 0}건의 번호`;
  if (r.action === "people.search") {
    const f = filtersText(d.filters);
    return `${d.q ? `‘${d.q}’` : "(검색어 없음)"}${f ? " · " + f : ""} · ${d.total}명${d.page ? ` · ${d.page + 1}쪽` : ""}`;
  }
  if (r.action === "people.view") return d.name || "";
  if (r.action === "people.export") {
    const f = filtersText(d.filters);
    return `${d.count}명${d.q ? ` · ‘${d.q}’` : ""}${f ? " · " + f : ""}`;
  }
  if (r.action === "people.import") return `기준일 ${d.source_date} · 전체 ${d.total} · 새로 ${d.added} · 바뀜 ${d.changed} · 빠짐 ${d.removed} · 사진 ${d.photos}`;
  if (r.action === "people.linksync") return joinDot(`사역신청 ${d.orders ?? 0}줄`, `성경필사 ${d.signups ?? 0}줄`,
    `새로 이음 ${d.added ?? 0}`, `바뀜 ${d.changed ?? 0}`, `못 맞춤 ${d.unmatched ?? 0}`);
  if (r.action === "people.link") return joinDot(`${LINK_KIND[d.kind] || d.kind || ""} 줄 ${d.row ?? ""}`, LINK_HOW[d.how] || d.how || "");
  if (r.action === "event.create") {
    const a = d.after || {};
    return joinDot(`‘${d.title || a.title || ""}’`, `${a.opens_on || ""} ~ ${a.closes_on || ""}`,
      evVal("status", a.status), `명단 공개 종료 ${evVal("list_until", a.list_until)}`);
  }
  if (r.action === "event.settings") return joinDot(`‘${d.title || ""}’`, ...evChanges(d.before, d.after));
  if (r.action === "event.add") {
    const w = d.row || {};
    return joinDot(d.name, rowWho(w), w.position, `회차 ${d.event_id || ""}`, d.linked ? "앱 계정 이음" : "");
  }
  if (r.action === "event.edit") {
    const b = d.before || {}, a = d.after || {};
    const parts = Object.keys(a).filter((k) => k !== "note")
      .map((k) => `${ROW_FIELD[k] || k} ${rowVal(b[k])} → ${rowVal(a[k])}`);
    return joinDot(d.name, `회차 ${d.event_id || ""}`, ...parts, "note" in a ? "메모 고침" : "");
  }
  if (r.action === "event.delete") {
    const w = d.row || {};
    return joinDot(d.name, rowWho(w), w.position, `회차 ${d.event_id || ""}`, SRC[w.source] || w.source,
      w.hasUser ? "계정 이어짐" : "");
  }
  // 올리기는 건수만 — 이름을 싣지 않는다(설계 §2 기록 표). 서버는 납작하게 남긴다(counts 로 싸지 않는다 · failed 는 개수).
  if (r.action === "event.upload") {
    return joinDot(`올린 줄 ${d.rows ?? 0}`, `넣음 ${d.saved ?? 0}`, `이미 있음 ${d.same ?? 0}`, `빈칸 ${d.blank ?? 0}`,
      `틀림 ${d.bad ?? 0}`, d.fillOn ? `교인명부로 채움 ${d.fill ?? 0}` : "", d.sameName ? `동명이인 ${d.sameName}` : "",
      d.oddPosition ? `목록 밖 직분 ${d.oddPosition}` : "", d.failed ? `실패 ${d.failed}` : "");
  }
  // 사역신청·담당자 화면이 명부 번호로 한 분을 가렸으면 byPhone(번호 자체는 서버가 싣지 않는다)
  if (r.action === "people.lookup") return `‘${d.q || ""}’ · ${d.count ?? 0}명${d.byPhone === true ? " · 번호로 고름" : ""}`;
  // people.fill — 2026-09-30 부터 명부에 물은 이름(asked·askedNames)도 남는다(SEC-2 · 채운 것이 없어도 한 줄). 그 전 기록은 옛 모양 그대로.
  if (r.action === "people.fill") {
    if (d.asked == null) return joinDot(`채운 줄 ${d.rows ?? 0}`, someNames(d.names));
    const filled = someNames(d.names);
    return joinDot(`물은 이름 ${d.asked}(${someNames(d.askedNames)})`, `채운 줄 ${d.rows ?? 0}${filled ? `(${filled})` : ""}`);
  }
  return "";
}

export async function render(el, { call, query }) {
  const kind = query && query.kind === "people" ? "people" : "";
  const tabs = `<div class="acts" style="margin-bottom:10px">${KINDS.map(([k, t]) =>
    `<a class="btn${k === kind ? " primary" : ""}" href="#/audit${k ? "?kind=" + k : ""}">${t}</a>`).join("")}</div>`;
  el.innerHTML = TITLE + tabs + `<p class="empty">불러오는 중…</p>`;
  const r = await call("auditList", { limit: 100, kind });
  if (!r.ok) { el.innerHTML = TITLE + tabs + `<p class="empty">${esc(errorText(r))}</p>`; return; }
  el.innerHTML = TITLE + tabs + `<p class="muted" style="margin-bottom:10px">최근 ${r.rows.length}건</p>` +
    (r.rows.length ? r.rows.map((x) => {
      const dt = detailText(x);
      const who = x.who || (x.action === "people.import" ? "(올리기 스크립트)" : "(지워진 분)");
      return `<div class="card">
      <div><b>${esc(labelOf(x))}</b>${x.target ? ` · ${esc(x.target)}` : ""}</div>
      <div class="muted">${esc(kstTime(x.at))} · ${esc(who)}</div>
      ${dt ? `<div style="margin-top:4px;font-size:14px">${esc(dt)}</div>` : ""}
    </div>`;
    }).join("") : `<p class="empty">아직 기록이 없어요</p>`);
}
