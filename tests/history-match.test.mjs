// 사역 이력 맞춤 규칙(history-match.ts) — 가짜 명부로 규칙마다(설계 §4)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  srcKey, parseRow, matchAll, teamKey, historyLinkPatch, historyUnlinkPatch, R_MANUAL_NONE,
  toHPerson, candFp, nameKeyVariants, WEAK_RE,
} from "../supabase/functions/church-admin/history-match.ts";

let pid = 1000;
const person = (o) => ({
  person_id: ++pid, name: "가나다", gender: "여", kind2: "장년", mok1: "기쁨", mok3: "기쁨-19목장", school_dept: "",
  position: "집사", position_detail: "", birth_year: 1970, birth_month: 5, reg_year: 2000, household: "", ...o,
});
let rid = 0;
const row = (o) => ({
  id: ++rid, year: 2024, committee: "찬양부", team: "가브리엘찬양대", name: "가나다", position: "집사", mok: "기쁨-19",
  renewal: "신규", link_how: "auto", person_id: null, ...o,
});
const one = (rows, people, id) => matchAll(rows, people).find((r) => r.id === (id ?? rows[0].id));

test("srcKey — 칸마다 NFC·띄어쓰기 없음 · 끝 영문자 대문자", () => {
  const a = srcKey({ year: 2024, committee: "찬양 부", team: "가브리엘 찬양대", name: "가나다 a", mok: "기쁨 - 19", position: " 집사" });
  assert.equal(a, "2024|찬양부|가브리엘찬양대|가나다A|기쁨-19|집사");
  const nfd = "가나다".normalize("NFD");
  assert.equal(srcKey({ year: 2024, committee: "", team: "", name: nfd, mok: "", position: "" }), "2024|||가나다||");
});

test("parseRow — 목장 꼴", () => {
  assert.deepEqual([parseRow(2024, "기쁨-19", "집사").kind, parseRow(2024, "기쁨-19", "집사").mok], ["교구", 19]);
  assert.equal(parseRow(2025, "기쁨25", "집사").mok, 25);
  assert.equal(parseRow(2025, "소망남성", "집사").men, true);
  assert.equal(parseRow(2024, "믿음-남성", "집사").men, true);
  const t = parseRow(2026, "청년05또래", "청년");
  assert.deepEqual([t.kind, t.ttae], ["청년", 5]);
  assert.equal(parseRow(2024, "92또래", "").ttae, 92);
  assert.equal(parseRow(2022, "2교구 20목장", "집사").kind, "모름");
  assert.equal(parseRow(2022, "", "청년").kind, "청년");
  assert.equal(parseRow(2025, "", "고등부").kind, "학생");
  assert.equal(parseRow(2026, "새가족", "성도").kind, "새가족");
  const typo = parseRow(2023, "믿은-15", "권사");
  assert.deepEqual([typo.gu, typo.mok, typo.notes], ["믿음", 15, ["목장 오타 고쳐 읽음"]]);
});

test("parseRow — 2025년 이전 「기쁨-1」은 목장 모름, 2026 은 진짜 1목장", () => {
  assert.equal(parseRow(2024, "기쁨-1", "권사").kind, "모름");
  const now = parseRow(2026, "기쁨-1", "권사");
  assert.deepEqual([now.kind, now.gu, now.mok], ["교구", "기쁨", 1]);
});

test("teamKey — 앞말·빈칸·괄호 · 주일찬양(2부)=주일2부찬양", () => {
  assert.equal(teamKey("사역팀-사랑부"), "사랑부");
  assert.equal(teamKey("미취학-새싹부"), "새싹부");
  assert.equal(teamKey("주일찬양(2부)"), teamKey("주일2부찬양"));
});

test("차례 1 — 같은 소속 한 분", () => {
  const p = person({}), q = person({ mok3: "기쁨-3목장" });
  const r = one([row({})], [p, q]);
  assert.deepEqual([r.person_id, r.match_basis], [p.person_id, "같은 소속"]);
});

test("남성 목장 — 「소망-남성」은 남성1 분, 숫자 1목장 줄은 남성1 분과 안 맞는다", () => {
  const m = person({ gender: "남", mok1: "소망", mok3: "소망-남성1" });
  assert.equal(one([row({ mok: "소망-남성" })], [m]).match_basis, "같은 소속");
  const r = one([row({ mok: "소망-1" })], [m]);
  assert.deepEqual([r.person_id, r.match_basis], [m.person_id, "같은 교구(목장 다름)"]);
});

test("빼기 — 권사 줄과 남자 분 · 그해보다 늦게 등록", () => {
  const man = person({ gender: "남" });
  const r = one([row({ position: "권사" })], [man]);
  assert.equal(r.person_id, null);
  assert.match(r.match_reason, /성별/);
  const late = person({ reg_year: 2025 });
  assert.equal(one([row({ year: 2024 })], [late]).person_id, null);
});

test("빼기 — 집사 줄과 아이 · 직분 없는 청년 · 직분 없는 40세 미만(권사 이상)", () => {
  const kid = person({ kind2: "교회학교", position: "", birth_year: 2012 });
  const r = one([row({})], [kid]);
  assert.equal(r.person_id, null);
  assert.match(r.match_reason, /교회학교 학생/);
  const youth = person({ kind2: "청년", position: "", birth_year: 2001, mok1: "섬김", mok3: "섬김-1목장" });
  assert.equal(one([row({})], [youth]).person_id, null);
  const young = person({ gender: "남", position: "", birth_year: 1986, mok3: "기쁨-28목장" });
  assert.equal(one([row({ year: 2022, position: "안수집사", mok: "기쁨-26" })], [young]).person_id, null);
});

test("직분이 빈 교구 줄 — 14세 이상 · 가족 목장이 같은 아이는 「학생으로 봄」", () => {
  const teen = person({ kind2: "교회학교", position: "", birth_year: 2009, school_dept: "고등부" });
  const r = one([row({ year: 2025, position: "" })], [teen]);
  assert.equal(r.person_id, teen.person_id);
  assert.match(r.match_basis, /학생으로 봄/);
});

test("또래 — 출생 연도 끝 두 자리(1~2월생은 다음 또래도)", () => {
  const a = person({ kind2: "청년", mok1: "청년부", mok3: "청년-5", position: "", birth_year: 2005 });
  const b = person({ kind2: "청년", mok1: "청년부", mok3: "청년-95", position: "", birth_year: 1995 });
  assert.equal(one([row({ year: 2026, mok: "청년05또래", position: "청년" })], [a, b]).person_id, a.person_id);
  const jan = person({ kind2: "청년", mok1: "청년부", position: "", birth_year: 2006, birth_month: 1 });
  assert.equal(one([row({ year: 2026, mok: "청년05또래", position: "청년" })], [jan]).person_id, jan.person_id);
});

test("차례 2 — 같은 교구 한 분 · 다른 교구에 같은 이름이 있으면 붙임말", () => {
  const g = person({ mok3: "기쁨-7목장" }), o = person({ mok1: "은혜", mok3: "은혜-3목장" });
  const r = one([row({})], [g, o]);
  assert.deepEqual([r.person_id, r.match_basis], [g.person_id, "같은 교구(목장 다름) · 다른 교구에 같은 이름"]);
});

test("차례 3 — 명부에 이름이 한 분", () => {
  const o = person({ mok1: "은혜", mok3: "은혜-3목장" });
  assert.equal(one([row({})], [o]).match_basis, "이름이 한 분뿐(소속 다름)");
});

test("차례 4 — 같은 목장 둘 중 권사 갈래", () => {
  const k = person({ position: "권사" }), d = person({ position: "집사" });
  const r = one([row({ position: "은퇴권사" })], [k, d]);
  assert.deepEqual([r.person_id, r.match_basis], [k.person_id, "같은 소속 · 직분으로 가림"]);
});

test("차례 5 — 가족이 같은 해 같은 목장 글자로 명단에 있는 분", () => {
  const a = person({ household: "h1", mok3: "기쁨-14목장" }), b = person({ household: "h2", mok3: "기쁨-14목장" });
  const spouse = person({ name: "라마바", gender: "남", household: "h1", mok3: "기쁨-14목장" });
  const rows = [row({ mok: "기쁨-14" }), row({ name: "라마바", mok: "기쁨-14", team: "유아부" })];
  assert.equal(one(rows, [a, b, spouse], rows[0].id).person_id, a.person_id);
});

test("같은 소속 여럿 — 못 가리면 비우고 사유", () => {
  const a = person({}), b = person({});
  const r = one([row({})], [a, b]);
  assert.equal(r.person_id, null);
  assert.equal(r.match_reason, "같은 목장에 같은 이름 2명 — 누군지 못 가림");
});

test("다른 해 같은 팀 「유지」 — 약한 맞춤을 다른 분으로 바로잡는다", () => {
  const old = person({ mok3: "기쁨-2목장", position: "집사" });                  // 같은 교구에 남은 동명이인
  const moved = person({ mok1: "은혜", mok3: "은혜-7목장", position: "권사" });   // 은혜로 옮긴 분
  const rows = [
    row({ year: 2024, position: "집사", mok: "기쁨-9", team: "행복전도대-토" }),
    row({ year: 2025, position: "집사", mok: "은혜-7", team: "행복전도대-토", renewal: "유지" }),
  ];
  const res = matchAll(rows, [old, moved]);
  assert.equal(res[1].person_id, moved.person_id);
  assert.deepEqual([res[0].person_id, res[0].match_basis], [moved.person_id, "다른 해 같은 팀"]);
});

test("오타 — 같은 목장에 한 글자 다른 분이 다른 해 같은 팀에 있으면", () => {
  const p = person({ name: "가나라", mok1: "사랑", mok3: "사랑-15목장", position: "권사" });
  const rows = [
    row({ year: 2023, name: "가나다", position: "권사", mok: "사랑-15", team: "중보기도" }),
    row({ year: 2024, name: "가나라", position: "권사", mok: "사랑-15", team: "중보기도" }),
  ];
  const res = matchAll(rows, [p]);
  assert.deepEqual([res[0].person_id, res[0].match_basis], [p.person_id, "이름 한 글자 다름(오타로 봄)"]);
});

test("같은 해 겹침 — 다른 교구면 약한 쪽을 비우고, 같은 교구 목장 차이는 둘 다 둔다", () => {
  const p = person({});
  const diffGu = [row({ mok: "기쁨-19" }), row({ mok: "화평-3", team: "주차" })];
  const r1 = matchAll(diffGu, [p]);
  assert.equal(r1[0].person_id, p.person_id);
  assert.equal(r1[1].person_id, null);
  assert.match(r1[1].match_reason, /같은 해에 다른 교구/);
  const sameGu = [row({ mok: "기쁨-19" }), row({ mok: "기쁨-25", team: "주차" })];
  assert.ok(matchAll(sameGu, [p]).every((r) => r.person_id === p.person_id));
});

test("사람이 이은 줄(manual·none)은 그대로 · manual 은 다른 해 근거가 된다", () => {
  const a = person({ mok3: "기쁨-2목장" }), b = person({ mok1: "은혜", mok3: "은혜-7목장" });
  const rows = [
    row({ year: 2025, link_how: "manual", person_id: b.person_id, mok: "기쁨-9", renewal: "유지" }),
    row({ year: 2024, mok: "기쁨-9" }),
    row({ year: 2023, link_how: "none", mok: "기쁨-9" }),
  ];
  const res = matchAll(rows, [a, b]);
  assert.equal(res[0].person_id, b.person_id);
  assert.deepEqual([res[1].person_id, res[1].match_basis], [b.person_id, "다른 해 같은 팀"]);
  assert.deepEqual([res[2].person_id, res[2].match_reason], [null, R_MANUAL_NONE]);
});

test("이름 끝 영문자 — 명단 「가나다」는 명부 「가나다A」도 후보, 명단 「가나다B」가 없으면 떼고", () => {
  const a = person({ name: "가나다A" });
  assert.equal(one([row({})], [a]).person_id, a.person_id);
  const r = one([row({ name: "가나다 B" })], [person({ name: "가나다", mok3: "기쁨-19목장" })]);
  assert.match(r.match_basis, /이름 끝 영문자 떼고/);
});

test("historyLinkPatch / historyUnlinkPatch 모양(교인명부 세션과의 약속 §7)", () => {
  const now = "2026-10-01T00:00:00.000Z";
  assert.deepEqual(historyLinkPatch(7, "m1", now), {
    person_id: 7, link_how: "manual", linked_by: "m1", linked_at: now, match_basis: "사람이 이음", match_reason: "", updated_at: now,
  });
  assert.deepEqual(historyLinkPatch(null, "m1", now), {
    person_id: null, link_how: "none", linked_by: "m1", linked_at: now, match_basis: "", match_reason: R_MANUAL_NONE, updated_at: now,
  });
  assert.deepEqual(historyUnlinkPatch(now), { link_how: "auto", linked_by: null, linked_at: null, updated_at: now });
});

// ── 2026-10-01 검토 반영 — 아래부터 추가 ───────────────────────────────────

test("학생 줄(#1) — 생년 모르는 장년은 못 고르고, 12~19세 띠 안의 아이만 「같은 구분(학생)」", () => {
  const teenInBand = person({ kind2: "교회학교", position: "", birth_year: 2010 });   // 2026년 16세
  const tooYoung = person({ kind2: "교회학교", position: "", birth_year: 2016 });      // 2026년 10세 — 빼기에서 제외
  const adultUnknown = person({ kind2: "장년", position: "집사", birth_year: null });  // 생년 모름 — 학생 줄엔 못 고른다
  const r = one([row({ year: 2026, position: "고등부", mok: "" })], [teenInBand, tooYoung, adultUnknown]);
  assert.equal(r.person_id, teenInBand.person_id);
  assert.match(r.match_basis, /같은 구분\(학생\)/);
});

test("뒤섞기(#2) — 줄 차례를 바꿔도 결과가 같다", () => {
  const old = person({ name: "쉬플대", mok3: "기쁨-2목장", position: "집사" });
  const moved = person({ name: "쉬플대", mok1: "은혜", mok3: "은혜-7목장", position: "권사" });
  const typo = person({ name: "오타라", mok1: "사랑", mok3: "사랑-15목장", position: "권사" });
  const r1 = row({ year: 2024, name: "쉬플대", position: "집사", mok: "기쁨-9", team: "행복전도대-토" });
  const r2 = row({ year: 2025, name: "쉬플대", position: "집사", mok: "은혜-7", team: "행복전도대-토", renewal: "유지" });
  const r3 = row({ year: 2023, name: "오타다", position: "권사", mok: "사랑-15", team: "중보기도" });
  const r4 = row({ year: 2024, name: "오타라", position: "권사", mok: "사랑-15", team: "중보기도" });
  const people = [old, moved, typo];
  const norm = (res) => [...res].sort((a, b) => a.id - b.id);
  const base = norm(matchAll([r1, r2, r3, r4], people));
  assert.deepEqual(norm(matchAll([r4, r1, r3, r2], people)), base);
  assert.deepEqual(norm(matchAll([r3, r2, r4, r1], people)), base);
  assert.deepEqual(norm(matchAll([...[r1, r2, r3, r4]].reverse(), people)), base);
  assert.equal(base.find((r) => r.id === r1.id).person_id, moved.person_id);
  assert.equal(base.find((r) => r.id === r4.id).person_id, typo.person_id);
});

test("「학생으로 봄」 메모(#3)는 실제로 고른 분이 그 아이일 때만 붙는다(새지 않는다)", () => {
  const adult = person({ household: "h1", mok3: "기쁨-14목장" });
  const teen = person({ kind2: "교회학교", birth_year: 2010, household: "h3", mok3: "기쁨-14목장" }); // 2024년 14세
  const spouse = person({ name: "라마바", gender: "남", household: "h1", mok3: "기쁨-14목장" });
  const rows = [
    row({ position: "", mok: "기쁨-14" }),
    row({ name: "라마바", position: "", mok: "기쁨-14", team: "유아부" }),
  ];
  const res = one(rows, [adult, teen, spouse], rows[0].id);
  assert.equal(res.person_id, adult.person_id);
  assert.ok(!res.match_basis.includes("학생으로 봄"), `새어 나감: ${res.match_basis}`);
});

test("A/B 동명이인(#4) — 끝 영문자가 다르면 다른 해 같은 팀으로도 안 잇는다", () => {
  const plain = person({ mok3: "기쁨-30목장" });                                   // 「가나다」(붙임말 없음)
  const b = person({ name: "가나다B", mok1: "은혜", mok3: "은혜-7목장", position: "권사" });
  const rows = [
    row({ year: 2024, name: "가나다A", position: "집사", mok: "기쁨-9", team: "제자터" }),   // 명부에 「가나다A」는 없다
    row({ year: 2025, name: "가나다B", position: "권사", mok: "은혜-7", team: "제자터", renewal: "유지" }),
  ];
  const res = matchAll(rows, [plain, b]);
  assert.equal(res[1].person_id, b.person_id);
  assert.equal(res[0].person_id, plain.person_id);
  assert.match(res[0].match_basis, /같은 교구/);
  assert.ok(!res[0].match_basis.startsWith("다른 해"), `A/B 가 섞임: ${res[0].match_basis}`);
});

test("다른 해 같은 목장 — 팀이 달라도 같은 목장 글자·직분이면 잇는다", () => {
  const x = person({ household: "hx", mok3: "기쁨-22목장", position: "집사" });
  const x2 = person({ household: "hy", mok3: "기쁨-22목장", position: "집사" });   // 진짜 동명이인(다른 세대)
  const spouse = person({ name: "마바사", gender: "남", household: "hx", mok3: "기쁨-22목장", position: "집사" });
  const rows = [
    row({ year: 2024, position: "집사", mok: "기쁨-22", team: "A부서" }),
    row({ year: 2024, name: "마바사", position: "집사", mok: "기쁨-22", team: "유아부" }),
    row({ year: 2025, position: "집사", mok: "기쁨-22", team: "B부서" }),
  ];
  const res = matchAll(rows, [x, x2, spouse]);
  assert.deepEqual([res[2].person_id, res[2].match_basis], [x.person_id, "다른 해 같은 목장"]);
});

test("기쁨-1 경계(#5) — 2025 자리표시 줄은 2026 진짜 1목장 줄과 「다른 해 같은 목장」으로 안 잇는다", () => {
  const p1 = person({ mok3: "기쁨-1목장" });
  const p2 = person({ mok1: "소망", mok3: "소망-9목장" });   // 모호하게 만드는 동명이인
  const rows = [
    row({ year: 2025, mok: "기쁨-1", team: "A팀" }),
    row({ year: 2026, mok: "기쁨-1", team: "B팀" }),
  ];
  const res = matchAll(rows, [p1, p2]);
  assert.equal(res[1].person_id, p1.person_id);   // 2026 진짜 1목장은 정상
  assert.equal(res[0].person_id, null);            // 2025 자리표시는 안 이어진다
});

test("같은 소속(강한 맞춤) 줄은 다른 해 근거로 덮이지 않는다", () => {
  const x = person({ mok3: "기쁨-5목장" });
  const y = person({ mok1: "은혜", mok3: "은혜-9목장" });
  const rows = [
    row({ year: 2024, mok: "기쁨-5", team: "제자터" }),
    row({ year: 2025, mok: "은혜-9", team: "제자터", renewal: "유지" }),
  ];
  const res = matchAll(rows, [x, y]);
  assert.deepEqual([res[0].person_id, res[0].match_basis], [x.person_id, "같은 소속"]);
  assert.deepEqual([res[1].person_id, res[1].match_basis], [y.person_id, "같은 소속"]);
});

test("뒤쪽 해가 「신규」면 다른 해 같은 팀을 안 잇는다", () => {
  const old = person({ mok3: "기쁨-2목장", position: "집사" });
  const moved = person({ mok1: "은혜", mok3: "은혜-7목장", position: "권사" });
  const rows = [
    row({ year: 2024, position: "집사", mok: "기쁨-9", team: "행복전도대-토" }),
    row({ year: 2025, position: "집사", mok: "은혜-7", team: "행복전도대-토", renewal: "신규" }),
  ];
  const res = matchAll(rows, [old, moved]);
  assert.deepEqual([res[0].person_id, res[0].match_basis], [old.person_id, "같은 교구(목장 다름) · 다른 교구에 같은 이름"]);
});

test("같은 해 같은 팀에 같은 이름 줄이 둘이면(peers>1) 다른 해 같은 팀을 안 쓴다", () => {
  const other = person({ mok3: "기쁨-30목장", position: "집사" });        // 기쁨 교구의 동명이인(약한 맞춤)
  const moved = person({ mok1: "은혜", mok3: "은혜-7목장", position: "권사" });
  const rows = [
    row({ year: 2024, position: "집사", mok: "기쁨-9", team: "행복전도대-토" }),
    row({ year: 2024, position: "집사", mok: "기쁨-9", team: "행복전도대-토" }),  // 짝 줄(같은 해·같은 팀·같은 이름)
    row({ year: 2025, position: "집사", mok: "은혜-7", team: "행복전도대-토", renewal: "유지" }),
  ];
  const res = matchAll(rows, [other, moved]);
  assert.ok(res.slice(0, 2).every((r) => r.person_id === other.person_id && r.match_basis.startsWith("같은 교구")));
});

test("allowed 에 없는 anchor 는 거부된다(성별이 안 맞는 다른 해 근거)", () => {
  const sisterY = person({ gender: "남", mok1: "은혜", mok3: "은혜-7목장", position: "장로" });
  const guCand = person({ gender: "여", mok3: "기쁨-30목장", position: "권사" });
  const rows = [
    row({ year: 2024, position: "권사", mok: "기쁨-9", team: "제자터" }),             // 여성 줄 — guCand 만 성별 통과
    row({ year: 2025, position: "장로", mok: "은혜-7", team: "제자터", renewal: "유지" }), // 남성 줄 — sisterY 유일 후보
  ];
  const res = matchAll(rows, [sisterY, guCand]);
  assert.deepEqual([res[0].person_id, res[0].match_basis], [guCand.person_id, "같은 교구(목장 다름) · 다른 교구에 같은 이름"]);
});

test("같은 해 같은 줄 사람 — 팀 이름이 달라 오타 규칙이 못 본 줄도 같은 분으로 잇는다", () => {
  const p = person({ name: "가나라", mok1: "사랑", mok3: "사랑-15목장", position: "권사" });
  const rows = [
    row({ year: 2023, name: "가나다", position: "권사", mok: "사랑-15", team: "중보기도" }),
    row({ year: 2024, name: "가나라", position: "권사", mok: "사랑-15", team: "중보기도" }),
    row({ year: 2023, name: "가나다", position: "권사", mok: "사랑-15", team: "안내위원" }),
  ];
  const res = matchAll(rows, [p]);
  assert.deepEqual([res[0].person_id, res[0].match_basis], [p.person_id, "이름 한 글자 다름(오타로 봄)"]);
  assert.deepEqual([res[2].person_id, res[2].match_basis],
    [p.person_id, "이름 한 글자 다름(오타로 봄) · 같은 해 다른 팀 줄과 같은 분"]);
});

test("빼기 — 청년 줄과 45세 이상", () => {
  const old = person({ kind2: "청년", mok1: "청년부", position: "", birth_year: 1979 }); // 2024년 45세
  const r = one([row({ year: 2024, position: "청년", mok: "청년" })], [old]);
  assert.equal(r.person_id, null);
  assert.match(r.match_reason, /직분과 성별/);
});

test("같은 해 겹침 — 세기가 같으면 둘 다 비운다", () => {
  const p = person({});
  const rows = [row({ mok: "화평-3" }), row({ mok: "은혜-5", team: "주차" })];
  const res = matchAll(rows, [p]);
  assert.equal(res[0].person_id, null);
  assert.equal(res[1].person_id, null);
  assert.match(res[0].match_reason, /같은 해에 다른 교구/);
  assert.match(res[1].match_reason, /같은 해에 다른 교구/);
});

test("toHPerson — 생년월일은 birth_date 우선, 없으면 birth 글자 · 「0000」은 모름 · household_id 0 은 빈 글자", () => {
  const a = toHPerson({
    person_id: 7, name: "가나다", gender: "여", kind2: "장년", mok1: "기쁨", mok3: "기쁨-1목장",
    school_dept: "", position: "집사", position_detail: "", birth_date: "1988-07-15", birth: "1970",
    registered_date: "2005-01-01", registered: "1999", household_id: 3,
  });
  assert.deepEqual([a.birth_year, a.birth_month, a.reg_year, a.household], [1988, 7, 2005, "3"]);
  const b = toHPerson({ person_id: 8, birth: "1992-04", registered: "0000-00-00", household_id: 0 });
  assert.deepEqual([b.birth_year, b.birth_month, b.reg_year, b.household], [1992, 4, null, ""]);
  const c = toHPerson({ person_id: 9, birth_date: "0000-00-00", birth: "0000" });
  assert.equal(c.birth_year, null);
});

test("candFp — 16진 8자 · 같은 입력은 같은 값 · 차례가 다르면 값도 다르다", () => {
  const a = candFp(["가", "나", "다"]);
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(candFp(["가", "나", "다"]), a);
  assert.notEqual(candFp(["나", "가", "다"]), a);
});

test("nameKeyVariants — 바탕 이름 포함 · A~Z 대소문자 모두 · 괄호 뗀 꼴", () => {
  const v = nameKeyVariants("가나다");
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    assert.ok(v.includes("가나다" + c), `빠짐: 가나다${c}`);
    assert.ok(v.includes("가나다" + c.toLowerCase()), `빠짐: 가나다${c.toLowerCase()}`);
  }
  assert.ok(v.includes("가나다"));
  const p = nameKeyVariants("가나다(별명)");
  assert.ok(p.includes("가나다"));          // 괄호를 뗀 꼴도 들어간다
  assert.ok(p.includes("가나다(별명)"));    // 원래 꼴(hKey)도 들어간다
});

test("WEAK_RE — 근거 약한 줄 문구만 맞는다", () => {
  for (const s of ["같은 교구(목장 다름)", "이름이 한 분뿐(소속 다름)", "다른 해 같은 팀", "다른 해 같은 목장", "이름 한 글자 다름(오타로 봄)"]) {
    assert.ok(WEAK_RE.test(s), `약함으로 못 잡음: ${s}`);
  }
  assert.ok(!WEAK_RE.test("같은 소속"));
  assert.ok(!WEAK_RE.test("같은 소속 · 직분으로 가림"));
});
