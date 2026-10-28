// 교육 신청 「교적ID 가 같으면 한 건으로」(2026-10-28 친구) — 담당자 대신 등록 쪽: 같은 교적ID 의 분이 이미 앱으로 신청해 있으면 그 계정으로 한 건 처리.
//   findAppUserOfPerson(edu-db.ts)은 교인명부 「🎓 교육」 탭과 같은 규칙(eduLinkedUserIds)으로 고른다 · eduEnrollAdd 는 그 계정으로 edu_apply 를 부른다.
//   가짜 db 는 거르기(eq·in·is·not)를 지킨다. 이름·교인ID 는 모두 지어낸 것. preflight 가 돈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findAppUserOfPerson, makeEdu } from "../supabase/functions/church-admin/edu-db.ts";

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COURSE = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const CHIEF = { member: { id: "55555555-5555-4555-8555-555555555555" }, roles: ["education"] };

function fakeDb(tables) {
  const rpc = [];
  const from = (table) => {
    const st = { cols: "", f: [], single: false };
    const q = {
      select(c) { st.cols = c; return q; },
      eq(c, v) { st.f.push((r) => r[c] === v); return q; },
      in(c, vs) { st.f.push((r) => vs.includes(r[c])); return q; },
      is(c, v) { st.f.push((r) => (r[c] ?? null) === v); return q; },
      not(c, op, v) { st.f.push((r) => !(op === "is" && (r[c] ?? null) === v)); return q; },
      order() { return q; }, limit() { return q; }, range() { return q; },
      maybeSingle() { st.single = true; return q; },
      then(res, rej) {
        try {
          const cols = st.cols.split(",").map((s) => s.trim());
          const rows = (tables[table] || []).filter((r) => st.f.every((f) => f(r))).map((r) => Object.fromEntries(cols.map((k) => [k, r[k] ?? null])));
          res({ data: st.single ? (rows[0] ?? null) : rows, error: null });
        } catch (e) { rej(e); }
      },
    };
    return q;
  };
  return { from, rpc: async (fn, args) => { rpc.push([fn, args]); return { data: { ok: true, id: 7, status: "confirmed", already: true }, error: null }; }, calls: rpc };
}
// 쪽 넘기기 대신 한 번에(가짜 db 가 range 를 무시한다 — 한 쪽이면 두 번째 부름이 같은 줄을 또 줘 끝나지 않으므로 여기서는 한 번만 돌려준다)
const allRows = async (build) => { const { data } = await build(); return data; };

const person = (person_id, name, mok1, mok3, o = {}) => ({ person_id, name_key: name, kind2: "장년", mok1, mok3, school_dept: "", ...o });
const PEOPLE = [person(11, "홍길동", "화평", "화평-20목장"), person(12, "홍길동", "소망", "소망-3목장"),
  person(15, "이영희", "화평", "화평-20목장"), person(16, "이영희", "화평", "화평-20목장")];
const user = (n, name, gu, mok) => ({ id: U(n), type: "교구", gu, mok, bu: "", grade: "", name });
const USERS = [user(1, "홍길동", "화평", "20"), user(2, "홍길동", "소망", "3"), user(3, "이영희", "화평", "20"), user(4, "홍길동", "화평", "99")];
const enr = (id, course, uid, status) => ({ id, course_id: course, user_id: uid ? U(uid) : null, status });

test("같은 교적ID 의 앱 신청 계정 — 같은 소속에 같은 이름 한 분일 때만 · 이 강좌의 앱 신청 줄에서만", async () => {
  const db = fakeDb({ church_people: PEOPLE, users: USERS, edu_enrollments: [enr(1, COURSE, 1, "confirmed"), enr(2, COURSE, 2, "applied")] });
  assert.equal(await findAppUserOfPerson(db, allRows, COURSE, 11), U(1));    // 화평 20 홍길동 → 11
  assert.equal(await findAppUserOfPerson(db, allRows, COURSE, 12), U(2));    // 소망 3 홍길동 → 12
  assert.equal(await findAppUserOfPerson(db, allRows, OTHER, 11), null);     // 다른 강좌에는 신청이 없다
});

test("이어지지 않는 경우는 모두 null — 목장 모름 · 같은 소속 동명이인 · 앱 신청 없음 · 명부에 없는 번호 · 잘못된 번호", async () => {
  const db = fakeDb({ church_people: PEOPLE, users: USERS, edu_enrollments: [enr(1, COURSE, 4, "confirmed"), enr(2, COURSE, 3, "confirmed"), enr(3, COURSE, null, "confirmed")] });
  assert.equal(await findAppUserOfPerson(db, allRows, COURSE, 11), null);   // 계정 4 는 목장 99(모름)
  assert.equal(await findAppUserOfPerson(db, allRows, COURSE, 15), null);   // 같은 소속 이영희 둘 → 여럿
  assert.equal(await findAppUserOfPerson(db, allRows, COURSE, 999), null);  // 명부에 없다
  for (const bad of [0, -1, NaN, 1.5, "x"]) assert.equal(await findAppUserOfPerson(db, allRows, COURSE, bad), null);
  assert.equal(await findAppUserOfPerson(fakeDb({ church_people: PEOPLE, users: USERS, edu_enrollments: [enr(3, COURSE, null, "confirmed")] }), allRows, COURSE, 11), null);   // 대신 등록 줄뿐
});

test("취소·반려한 앱 줄도 같은 분이다(되살릴 줄) — 살아 있는 줄이 있으면 그쪽을 먼저", async () => {
  const one = fakeDb({ church_people: PEOPLE, users: USERS, edu_enrollments: [enr(1, COURSE, 1, "cancelled")] });
  assert.equal(await findAppUserOfPerson(one, allRows, COURSE, 11), U(1));
  // 한 분이 계정 둘(같은 소속·같은 이름)로 이어지면 살아 있는 쪽을 고른다
  const twin = [...USERS, user(5, "홍길동", "화평", "20")];
  const two = fakeDb({ church_people: PEOPLE, users: twin, edu_enrollments: [enr(9, COURSE, 5, "cancelled"), enr(1, COURSE, 1, "waitlisted")] });
  assert.equal(await findAppUserOfPerson(two, allRows, COURSE, 11), U(1));
});

test("대신 등록 — 같은 교적ID 의 앱 계정이 있으면 그 계정으로 edu_apply(새 줄을 만들지 않는다) · 못 찾으면 그대로 계정 없는 줄", async () => {
  const mk = (appUserOfPerson, pickUser = null) => {
    const db = fakeDb({ edu_enrollments: [] });
    const edu = makeEdu(db, async () => {}, { peopleLookup: async () => ({}), allRows: async () => [],
      personPick: async () => ({ ok: true, ident: { name: "홍길동", who_type: "교구", group_name: "화평", sub_name: "20", ident_key: "person|11" }, appUserId: pickUser }),
      ...(appUserOfPerson ? { appUserOfPerson } : {}) });
    return { db, edu };
  };
  const seen = [];
  const a = mk(async (c, p) => { seen.push([c, p]); return U(1); });
  const r = await a.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍길동", pick: 0, check: {} });
  assert.deepEqual(seen, [[COURSE, 11]]);
  assert.equal(a.db.calls[0][0], "edu_apply"); assert.equal(a.db.calls[0][1].p_user, U(1)); assert.equal(a.db.calls[0][1].p_staff, true);
  assert.equal(r.already, true);
  const b = mk(async () => null);
  await b.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍길동", pick: 0, check: {} });
  assert.equal(b.db.calls[0][1].p_user, null);
  const c = mk(null);   // dep 가 없으면 건너뛴다(옛 호출)
  await c.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍길동", pick: 0, check: {} });
  assert.equal(c.db.calls[0][1].p_user, null);
  const d = mk(async () => { throw new Error("must not run"); }, U(9));   // 명부 고르기가 이미 앱 계정을 찾았으면 묻지 않는다
  await d.edu.eduEnrollAdd(CHIEF, { course_id: COURSE, name: "홍길동", pick: 0, check: {} });
  assert.equal(d.db.calls[0][1].p_user, U(9));
});

test("직접 적은 새가족(ident) 은 이어 붙이기를 건너뛴다 — 교적ID 가 없다", async () => {
  const db = fakeDb({ edu_enrollments: [] });
  let asked = 0;
  const edu = makeEdu(db, async () => {}, { peopleLookup: async () => ({}), allRows: async () => [], personPick: async () => ({}), appUserOfPerson: async () => { asked++; return U(1); } });
  await edu.eduEnrollAdd(CHIEF, { course_id: COURSE, ident: { name: "새가족", who_type: "교구", group_name: "기쁨", sub_name: "1" } });
  assert.equal(asked, 0); assert.equal(db.calls[0][1].p_user, null);
});
