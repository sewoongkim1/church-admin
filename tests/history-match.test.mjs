// 사역 이력 맞춤 규칙(history-match.ts) — 가짜 명부로 규칙마다(설계 §4)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  srcKey, parseRow, matchAll, teamKey, historyLinkPatch, historyUnlinkPatch, R_MANUAL_NONE,
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
  assert.notEqual(r.match_basis, "같은 소속");
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
