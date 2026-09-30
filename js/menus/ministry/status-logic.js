// 신청 현황 — 화면 논리(순수 함수). 원문: docs/port/ministry-status-legacy.md 2.0·2.5·2.7·2.13.
// ⚠️ 「미채택」은 뺐다(2026-09-17) — 서버 MINISTRY_STATUS 와 같게. SHORT·CLS 에는 옛 행 표시용으로 남긴다.
export const STATES = ["신청완료", "접수완료", "임명확정", "취소"];
export const SHORT = { "신청완료": "신청", "접수완료": "접수", "임명확정": "임명", "미채택": "미채택", "취소": "취소" };
export const CLS = { "신청완료": "s1", "접수완료": "s2", "임명확정": "s3", "미채택": "s4", "취소": "s4" };

export const kstToday = (now) => new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function rangeDates(range, from, to, now) {
  if (range === "today") { const t = kstToday(now); return [t, t]; }
  if (range === "7d") return [kstToday(new Date(now.getTime() - 6 * 86400 * 1000)), kstToday(now)];
  if (range === "custom") return [from || "", to || ""];
  return ["", ""];
}

// 상태(하나도 안 고르면 전체) · 신청일(YYYY-MM-DD 문자열 비교 — r.at 도 같은 꼴) · 찾기(단순 부분일치)
export function filterRows(rows, { stOn, range, from, to, q }, now) {
  const on = stOn || [];
  const [f, t] = rangeDates(range, from, to, now);
  const s = String(q || "").trim();
  return rows.filter((r) => {
    if (on.length && !on.includes(r.status)) return false;
    if (f && r.at < f) return false;
    if (t && r.at > t) return false;
    if (s && ![r.name, r.who, r.position, r.team, r.committee].join(" ").includes(s)) return false;
    return true;
  });
}

export const personKey = (r) => (r.name || "") + "/" + (r.who || "");
export const teamKey = (r) => (r.committee || "") + " · " + (r.team || "");
const digits = (p) => String(p || "").replace(/[^0-9]/g, "");

// 같은 휴대폰 번호 → 그 번호로 신청한 사람들. ⚠️ 명단 **전체**로 센다(거르기로 한쪽이 가려져도 표시는 남는다).
// 번호는 결정이 나면 서버가 지우므로 남은 것끼리만 본다.
export function dupMap(allRows) {
  const m = new Map();
  for (const r of allRows) {
    const d = digits(r.phone);
    if (!d) continue;
    if (!m.has(d)) m.set(d, new Map());
    m.get(d).set(personKey(r), { name: r.name || "", who: r.who || "" });
  }
  // 한 사람만 쓰는 번호는 중복이 아니다
  for (const [d, people] of m) if (people.size < 2) m.delete(d);
  return m;
}

// 이 신청(들)과 같은 번호를 쓰는 **다른 사람**들 — 이름이 같으면 「다른 소속」, 다르면 「다른 신청자」(가족 등)
export function dupOthers(m, rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  const me = new Set(list.map(personKey));
  const seen = new Map();
  for (const r of list) {
    const people = m.get(digits(r.phone));
    if (!people) continue;
    people.forEach((p, k) => { if (!me.has(k)) seen.set(k, p); });
  }
  const name = (list[0] || {}).name || "";
  return [...seen.values()].map((p) => p.name === name
    ? { kind: "소속", label: p.who || "소속 없음", name: p.name, who: p.who }
    : { kind: "사람", label: (p.name || "이름 없음") + (p.who ? " · " + p.who : ""), name: p.name, who: p.who });
}

// 팀별 신청 수 — **지금 걸러진 목록**으로 센다(서버 합계는 취소까지 넣어 화면과 어긋났다)
export function teamCounts(rows) {
  const c = new Map();
  for (const r of rows) c.set(teamKey(r), (c.get(teamKey(r)) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"));
}

export function statusCounts(rows) {
  const o = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const r of rows) if (r.status in o) o[r.status]++;
  return o;
}

// 결정(임명·취소)으로 서버가 번호를 지웠다(phoneCleared) — 카드의 번호와 함께 **교적 표시도** 비운다(2026-09-30 검토 2).
// 교적 표시(r.church)는 서버가 불러올 때 그 번호로 셈한 것이라(「소속 다름」) 번호가 없어진 뒤엔 이름을 눌러 뜨는 창
// (번호 없이 다시 셈 → 「같은 이름 N명」)과 어긋난다. 새로 불러오기 전까지는 그리지 않는다 — 사실과 다른 표시를 남기지 않게.
// ⚠️ 지운 번호를 메모리에 따로 두고 창에 계속 보내지 않는다 — 서버가 결정 뒤 번호를 지우는 까닭(더 갖고 있지 않기)에 어긋난다.
export function clearPhone(r) {
  r.phone = "";
  r.church = null;
}
