// 교인명부 화면 — 순수 함수(2026-09-29). tests/people-logic.test.mjs 가 같은 파일을 읽는다(DOM 을 쓰지 않는다).
export const STALE_DAYS = 90;

export function sourceLine(source, todayIso) {
  if (!source) return { text: "아직 명부가 없어요 — 새 명단을 올려 주세요", stale: true };
  const days = Math.floor((Date.parse(todayIso) - Date.parse(source.source_date)) / 86400000);
  const base = `명부 기준일 ${source.source_date} · ${Number(source.total || 0).toLocaleString("ko-KR")}명`;
  return days > STALE_DAYS
    ? { text: `${base} — 명부가 오래됐어요, 새 명단을 올려 주세요`, stale: true }
    : { text: base, stale: false };
}

// 소속 한 줄 — 「기쁨 12목장」 · 「새가족 3월」 · 「청년부 청년-03」 · 「고등부」
export function affText(p) {
  const m = /(\d+)목장$/.exec(String(p.mok3 || ""));
  if (p.mok1 && m && p.mok1 !== "새가족") return `${p.mok1} ${Number(m[1])}목장`;
  if (p.mok1 && p.mok3) return `${p.mok1} ${p.mok3}`;
  if (p.school_dept) return p.school_dept;
  return p.mok1 || "";
}

export const initialOf = (name) => String(name || "").trim().charAt(0) || "?";

export const searchPayload = (s) => ({
  q: s.q || "", mok1: s.mok1 || "", kind2: s.kind2 || "", kind3: s.kind3 || "", position: s.position || "",
  noPhoto: !!s.noPhoto, household: s.household || null, page: s.page || 0,
});

// 가족 차례 — 세대주(교인ID = 세대주 교인ID)가 맨 앞, 그다음 나이 많은 차례, 같으면 가나다
export function familyOrder(list, headId) {
  const age = (x) => (x.age === null || x.age === undefined || x.age === "" ? -1 : Number(x.age));
  return [...list].sort((a, b) => (b.person_id === headId) - (a.person_id === headId)
    || age(b) - age(a) || String(a.name).localeCompare(String(b.name), "ko"));
}

export function pageInfo(total, page, size) {
  return { from: total ? page * size + 1 : 0, to: Math.min(total, (page + 1) * size),
    hasPrev: page > 0, hasNext: (page + 1) * size < total };
}

export const exportName = (source, n) => `교인명부_${source?.source_date || "기준일없음"}_${n}명.csv`;

// 내려받기 칸 — 서버 PEOPLE_ALL_COLS 에서 목장 세 단계(목장 칸에 이미 있다)만 뺐다
export const EXPORT_COLS = [
  ["person_id", "교인ID"], ["name", "이름"], ["position", "직분"], ["position_detail", "직분상세"], ["gender", "성별"],
  ["birth", "생년월일"], ["lunar", "양음력"], ["age", "나이"], ["spouse", "배우자"], ["spouse_position", "배우자직분"],
  ["household_head", "신앙세대주"], ["household_rel", "세대주관계"], ["household_id", "세대주 교인ID"],
  ["kind1", "교인구분1"], ["kind2", "교인구분2"],
  ["kind3", "교인구분3"], ["registered", "등록일"], ["reg_type", "등록구분"], ["phone1", "연락처1"], ["phone2", "연락처2"],
  ["guide", "인도자"], ["email", "이메일"], ["mok_path", "목장"], ["mok_leader", "목장리더"], ["school_path", "교회학교"],
  ["teacher", "교사"], ["youth_path", "청년"], ["mission", "선교회"], ["address", "주소"], ["address_jibun", "지번주소"],
  ["has_photo", "사진"],
];

export function csvText(rows) {
  const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = EXPORT_COLS.map(([, h]) => h);
  const body = rows.map((r) => EXPORT_COLS.map(([k]) => (k === "has_photo" ? (r[k] ? "있음" : "없음") : r[k])));
  return "﻿" + [head, ...body].map((row) => row.map(cell).join(",")).join("\r\n");
}

// 자세히 보기의 오른쪽 묶음 — [{ key, title, fields:[{ label, value, tel?, wide? }] }]. 빈 값·빈 묶음은 뺀다.
// 왼쪽(사진 옆)에 이미 있는 것 — 이름·직분·소속·성별·나이·연락처 — 는 여기 되풀이하지 않는다(person-detail.js).
// wide 는 칸 두 개 폭(긴 주소·교회학교 경로). 화면은 빈자리를 채워 가며 놓는다(grid dense).
export function detailSections(p) {
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
  const join = (sep, ...xs) => xs.filter(has).map((x) => String(x).trim()).join(sep);
  const f = (label, value, extra) => ({ label, value: has(value) ? String(value).trim() : "", ...extra });
  const W = { wide: true };
  const sections = [
    { key: "basic", title: "기본", fields: [
      f("생년월일", join(" · ", p.birth, p.lunar)),
      f("교인 구분", join(" > ", p.kind1, p.kind2, p.kind3)),
      f("등록", join(" · ", p.registered, p.reg_type)),
      f("인도자", p.guide),
    ] },
    { key: "contact", title: "연락", fields: [
      f("이메일", p.email, W),
      f("주소", p.address, W),
      f("지번 주소", p.address_jibun, W),
    ] },
    { key: "affil", title: "소속", fields: [
      f("목장 리더", p.mok_leader),
      f("교회학교", p.school_path, W),
      f("교사", p.teacher),
      f("청년", p.youth_path, W),
      f("선교회", p.mission),
    ] },
    { key: "family", title: "가족", fields: [
      f("배우자", join(" · ", p.spouse, p.spouse_position)),
      f("신앙세대주", join(" · ", p.household_head, p.household_rel)),
    ] },
  ];
  return sections.map((s) => ({ ...s, fields: s.fields.filter((x) => x.value !== "") })).filter((s) => s.fields.length);
}
