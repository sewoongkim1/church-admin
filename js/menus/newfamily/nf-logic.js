// 새가족 — 화면의 순수 규칙·말(2026-10-07 · 설계 v2 성경암송 docs/superpowers/specs/2026-10-07-newfamily-design.md §6)
//   화면(cards.js·board.js·staff.js·card-form.js)과 시험(tests/nf-logic.test.mjs)이 같은 파일을 읽는다 — document·window 를 만지지 않는다.
//   ⚠️ 막는 것은 서버다(nf-db.ts). 여기는 「무엇을 보일지」와 「서버에 보낼 꼴」만.

export const KIND_LABEL = { greeter: "영접팀", lead: "정착팀 총무", helper: "섬김이", pastor: "새가족 목사님" };
export const KIND_OPTIONS = [
  { value: "greeter", label: "영접팀", hint: "카드 넣기 · 사진" },
  { value: "lead", label: "정착팀 총무", hint: "섬김이 배정" },
  { value: "helper", label: "섬김이", hint: "맡은 새가족 교육 기록" },
  { value: "pastor", label: "새가족 목사님", hint: "목사님 교육 · 보고서 · 교구 배정" },
];
export const SERVICES = ["1부", "2부", "3부", "찬양", "수요", "그 밖"];
export const BAPTIZED_LABEL = { yes: "받음", no: "안 받음", unknown: "모름" };
// 현황 화면의 묶음 차례 — 누군가 할 일이 있는 단계가 위로
export const STAGE_ORDER = ["wait_helper", "learning", "wait_class", "wait_report", "wait_parish", "registered", "stopped", "done", "info"];
export const STAGE_HINT = {
  wait_helper: "정착팀 총무가 섬김이를 정해 주세요", learning: "섬김이 교육 네 번", wait_class: "새가족 목사님 교육을 기다려요",
  wait_report: "섬김이가 보고서를 보낼 차례예요", wait_parish: "목사님이 교구를 정할 차례예요", registered: "등록식을 기다려요",
  stopped: "멈춘 분", done: "등록식을 마친 분", info: "수료 대상이 아닌 분(정보만)",
};
export const LESSONS = 4;

const WORDS = {
  "not-assigned": "맡은 일이 아니에요",
  "chief-only": "새가족 운영팀만 할 수 있어요",
  "no-consent": "카드 아래 「개인정보 제공에 동의합니다」에 체크하셨는지 보고 표시해 주세요",
  "bad-date": "날짜를 다시 골라 주세요 (앞날은 안 돼요)",
  "bad-service": "예배를 다시 골라 주세요",
  "no-name": "이름을 적어 주세요",
  "bad-name": "이름·목장에는 \" \\ , ( ) | 를 쓸 수 없어요",
  "no-target": "수료 대상인지 「예 / 아니오」를 사람마다 골라 주세요",
  "bad-gender": "성별을 다시 골라 주세요",
  "bad-birth": "생년월일을 다시 적어 주세요 (예: 19591015)",
  "bad-phone": "전화번호를 다시 적어 주세요",
  "bad-baptized": "세례를 다시 골라 주세요",
  "too-long": "글이 너무 길어요",
  "too-many": "한 카드에 사람은 8분, 인도자는 2분까지예요",
  "self-and-guide": "「스스로 오심」이면 인도자를 비워 주세요",
  changed: "그사이 다른 분이 고쳤어요 — 새로 불러올게요",
  "has-progress": "섬김이가 배정됐거나 교육 기록이 있는 분은 카드에서 뺄 수 없어요",
  "not-target": "수료 대상이 아닌 분이에요",
  stopped: "멈춘 분이에요 — 먼저 「멈춤 풀기」를 해 주세요",
  sent: "보고서를 보낸 뒤에는 바꿀 수 없어요",
  resting: "쉬는 중인 섬김이예요",
  "helper-taken": "그 섬김이 줄은 다른 계정과 이어져 있어요",
  "no-kind": "하는 일을 하나 이상 골라 주세요",
  "bad-kind": "하는 일을 다시 골라 주세요",
  "not-team": "새가족 섬김 역할이 없는 분이에요 — 새로 불러와 주세요",
  "bad-photo": "사진 파일을 읽지 못했어요 — 다시 찍어 주세요",
  "too-big": "사진이 너무 커요 — 다시 찍어 주세요",
  "no-photo": "아직 사진이 없어요",
  "bad-which": "잘못된 요청이에요",
  "has-lessons": "교육 기록이 있는 분이에요",
  confirmed: "수료번호를 드린 분은 바꿀 수 없어요",
  "bad-id": "잘못된 요청이에요 — 새로 불러와 주세요",
};
export const nfWord = (code) => WORDS[code] || "";

// ── 생년월일 ─────────────────────────────────────────────────────────────
// 손으로 친 것 → "YYYY-MM-DD". 빈칸은 "" · 못 읽으면 null. 여덟 자리(19591015)·여섯 자리(591015)·구분 글자(59.10.15 · 1959-10-15)를 받는다.
//   두 자리 해는 올해 두 자리보다 크면 1900년대(종이 카드에 「59년」으로 적는다).
export function birthIn(text, todayYear) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  let parts = raw.split(/[^0-9]+/).filter(Boolean);
  if (parts.length === 1) {
    const d = parts[0];
    if (d.length === 8) parts = [d.slice(0, 4), d.slice(4, 6), d.slice(6)];
    else if (d.length === 6) parts = [d.slice(0, 2), d.slice(2, 4), d.slice(4)];
    else return null;
  }
  if (parts.length !== 3) return null;
  let [y, m, d] = parts.map(Number);
  if (parts[0].length <= 2) y += y > todayYear % 100 ? 1900 : 2000;
  const s = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const t = new Date(s + "T00:00:00Z");
  return !isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s ? s : null;
}
export const birthText = (s) => (s ? s.replace(/-/g, ".") : "");

// ── 카드 폼 ──────────────────────────────────────────────────────────────
export const blankPerson = (first) => ({ id: "", relation: first ? "본인" : "", name: "", gender: "", birth: "", birthLunar: false, phone: "", tel: "", baptized: "unknown", target: null });
export const blankGuide = () => ({ name: "", mok: "", phone: "" });

// nfCardGet 의 답 → 폼 값(없으면 새 카드)
export function cardToForm(r, today) {
  if (!r) return { cardId: "", base: "", regDate: today, service: "", pastor: "", address: "", carNo: "", note: "", selfCome: false, draft: false,
    consent: false, people: [blankPerson(true)], guides: [blankGuide(), blankGuide()] };
  const c = r.card || {};
  const guides = (r.guides || []).map((g) => ({ name: g.name || "", mok: g.mok || "", phone: g.phone || "" }));
  while (guides.length < 2) guides.push(blankGuide());
  return {
    cardId: c.id || "", base: c.updatedAt || "", regDate: c.regDate || today, service: c.service || "", pastor: c.pastor || "",
    address: c.address || "", carNo: c.carNo || "", note: c.note || "", selfCome: c.selfCome === true, draft: c.draft === true, consent: true,
    people: (r.people || []).map((p) => ({ id: p.id, relation: p.relation || "", name: p.name || "", gender: p.gender || "", birth: birthText(p.birth),
      birthLunar: p.birthLunar === true, phone: p.phone || "", tel: p.tel || "", baptized: p.baptized || "unknown", target: p.target === true })),
    guides,
  };
}

// 폼 값 → 서버 몸통. 틀리면 { error: 한국말 }(서버에 보내기 전에 잡는 것 — 서버가 같은 것을 다시 본다).
export function formToCard(f, todayYear) {
  if (!f.consent) return { error: nfWord("no-consent") };
  const people = [];
  for (let i = 0; i < f.people.length; i++) {
    const p = f.people[i];
    const name = String(p.name || "").trim();
    if (!name) {
      if (i === 0) return { error: "새가족의 이름을 적어 주세요" };
      continue;                                   // 이름 없는 가족 줄은 빈 줄로 보고 건너뛴다
    }
    const birth = birthIn(p.birth, todayYear);
    if (birth === null) return { error: `${name} 님의 ${nfWord("bad-birth")}` };
    if (typeof p.target !== "boolean") return { error: `${name} 님이 ${nfWord("no-target")}` };
    people.push({ ...(p.id ? { id: p.id } : {}), relation: i === 0 ? "본인" : String(p.relation || "").trim(), name, gender: p.gender || "",
      birth, birth_lunar: !!birth && p.birthLunar === true, phone: p.phone || "", tel: p.tel || "", baptized: p.baptized || "unknown", target: p.target });
  }
  const guides = f.selfCome ? [] : f.guides.filter((g) => String(g.name || "").trim())
    .map((g) => ({ name: String(g.name).trim(), mok: String(g.mok || "").trim(), phone: g.phone || "" }));
  return { body: {
    ...(f.cardId ? { card_id: f.cardId, base: f.base } : {}),
    consent: true, reg_date: f.regDate, service: f.service || "", pastor: f.pastor || "", address: f.address || "", car_no: f.carNo || "",
    note: f.note || "", self_come: f.selfCome === true, draft: f.draft === true, people, guides,
  } };
}

// ── 명단 ─────────────────────────────────────────────────────────────────
// 한 분의 둘째 줄 — 「여 · 60대 · 3부 · 10.04 등록」
export function personLine(p) {
  const reg = p.regDate ? `${Number(p.regDate.slice(5, 7))}.${p.regDate.slice(8, 10)} 등록` : "";
  return [p.relation && p.relation !== "본인" ? p.relation : "", p.gender, p.ageBand, p.service, reg].filter(Boolean).join(" · ");
}
export const guideLine = (p) => ((p.guides || []).length ? "인도 " + p.guides.map((g) => (g.mok ? `${g.name}(${g.mok})` : g.name)).join(", ") : "");
export const stageText = (p) => (p.stage === "learning" ? `교육 중 ${p.lessons}/${LESSONS}` : p.stageLabel || "");

// 단계별 묶음 — STAGE_ORDER 차례 · 비어 있는 단계는 뺀다 · 교육 중은 소식 없는 분이 위로 · 이름 찾기(q)
export function groupByStage(people, q = "") {
  const k = String(q || "").trim();
  const list = k ? (people || []).filter((p) => String(p.name || "").includes(k)) : people || [];
  return STAGE_ORDER.map((stage) => {
    const ps = list.filter((p) => p.stage === stage);
    if (stage === "learning") ps.sort((a, b) => Number(b.quiet) - Number(a.quiet));
    return { stage, label: ps[0]?.stageLabel || stage, hint: STAGE_HINT[stage] || "", people: ps };
  }).filter((g) => g.people.length);
}

// 카드별 묶음(새가족 카드 메뉴) — 카드 정보(cards)에 그 카드의 사람들을 붙인다 · 등록일 늦은 것부터
export function groupByCard(cards, people) {
  const by = new Map();
  for (const p of people || []) by.set(p.cardId, [...(by.get(p.cardId) || []), p]);
  return (cards || []).map((c) => ({ ...c, people: (by.get(c.id) || []).sort((a, b) => (a.relation === "본인" ? -1 : b.relation === "본인" ? 1 : 0)) }))
    .sort((a, b) => (a.regDate < b.regDate ? 1 : a.regDate > b.regDate ? -1 : 0));
}

// 섬김이 고르기 — 쉬는 중인 분은 뺀다 · 「이섬김 · 3부 · 지금 2분」 · 맡은 수가 적은 분부터
export function helperOptions(helpers, { withClear = false } = {}) {
  const opts = (helpers || []).filter((h) => !h.resting).sort((a, b) => a.load - b.load || a.name.localeCompare(b.name, "ko"))
    .map((h) => ({ value: h.id, label: [h.name, h.services, `지금 ${h.load}분`].filter(Boolean).join(" · ") }));
  return withClear ? [...opts, { value: "", label: "배정 풀기" }] : opts;
}

// 명부에서 찾은 분 → 고르기 줄 · 목장 글자(교적 목장이 있으면 그것, 없으면 소속-세부)
export const foundMok = (p) => p.church_mok || [p.group, p.sub].filter(Boolean).join("-");
export const foundOptions = (people) => (people || []).map((p, i) => ({ value: String(i), label: [p.name, foundMok(p), p.position].filter(Boolean).join(" · ") }));

// ── 사진 줄이기 ──────────────────────────────────────────────────────────
// 긴 변을 max 로 — 작으면 그대로
export function shrinkSize(w, h, max = 1600) {
  const long = Math.max(w, h);
  if (!(long > max)) return { w, h };
  const k = max / long;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}
