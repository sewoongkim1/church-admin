// 교인명부 「🎓 교육」 탭(교육신청 4단계 B · 2026-10-06) — 순수 규칙(edu-rules.ts) + 가짜 db 로 eduPersonTab(edu-db.ts) 시험 · preflight 가 돈다.
//   그분의 교육 기록 = 이어진 앱 계정(matchLoginPerson — 같은 소속에 같은 이름 한 분)의 신청 + ident_key 「person|교인ID」 줄.
//   가짜 db 는 거르기(eq·in·ilike·is)를 지키고, 쪽(range) 없이 물으면 MAX 줄에서 자른다(PostgREST 1,000줄 한도를 흉내 — 쪽 넘기기를 잊으면 떨어진다).
// 이름·교인ID 는 모두 지어낸 것.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeEdu } from "../supabase/functions/church-admin/edu-db.ts";
import { personIdOfKey, eduNamePattern, eduLinkedUserIds, eduRowsForPerson, eduTabItems } from "../supabase/functions/church-admin/edu-rules.ts";
import { withEduTab } from "../supabase/functions/church-admin/people-links.ts";

const ITEM_KEYS = ["attendPct", "certNo", "certRevoked", "status", "statusLabel", "term", "title"];
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const C = (n) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---------- 가짜 db ----------
const likeRe = (p) => new RegExp("^" + String(p).replace(/\\([%_\\])|([%_])|([.*+?^${}()|[\]\\])/g,
  (m, esc, wild, special) => (esc ? "\\" + esc : wild ? (wild === "%" ? ".*" : ".") : "\\" + special)) + "$", "is");
function fakeDb(tables, { max = 5 } = {}) {
  const log = { selects: [], unpaged: [], rpc: [] };
  const from = (table) => {
    const st = { cols: "", f: [], range: null, single: false };
    const q = {
      select(cols) { st.cols = cols; log.selects.push([table, cols]); return q; },
      eq(c, v) { st.f.push((r) => r[c] === v); return q; },
      neq(c, v) { st.f.push((r) => r[c] !== v); return q; },
      in(c, vs) { st.f.push((r) => vs.includes(r[c])); return q; },
      is(c, v) { st.f.push((r) => (r[c] ?? null) === v); return q; },
      ilike(c, p) { const re = likeRe(p); st.f.push((r) => re.test(String(r[c] ?? ""))); return q; },
      order() { return q; },
      limit() { return q; },
      range(a, b) { st.range = [a, b]; return q; },
      maybeSingle() { st.single = true; return q; },
      then(res, rej) {
        try {
          const cols = st.cols.split(",").map((s) => s.trim());
          let rows = (tables[table] || []).filter((r) => st.f.every((f) => f(r)))
            .map((r) => Object.fromEntries(cols.map((k) => [k, r[k] ?? null])));
          if (st.single) return res({ data: rows[0] ?? null, error: null });
          if (st.range) rows = rows.slice(st.range[0], Math.min(st.range[1] + 1, st.range[0] + max));
          else { if (rows.length > max) log.unpaged.push(table); rows = rows.slice(0, max); }
          res({ data: rows, error: null });
        } catch (e) { rej(e); }
      },
    };
    return q;
  };
  return { from, rpc: async (fn, args) => { log.rpc.push([fn, args]); return { data: null, error: null }; }, log };
}
// index.ts allRows 와 같은 쪽 넘기기(쪽마다 받은 만큼 넘어간다 · 빈 쪽에서 멈춘다)
const allRows = async (build) => {
  const out = [];
  for (let from = 0, guard = 0; guard < 1000; guard++) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    if (!data.length) return out;
    out.push(...data);
    from += data.length;
  }
  throw new Error("too-many-pages");
};
function setup(tables, opts) {
  const db = fakeDb(tables, opts);
  const audits = [];
  const edu = makeEdu(db, async (...a) => { audits.push(a); }, { peopleLookup: async () => ({}), personPick: async () => ({}), allRows });
  return { edu, db, audits };
}

// ---------- 지어낸 자료 ----------
// 명부: 홍길동 셋(화평 20 · 소망 3 · 화평 21) · 이영희 둘(둘 다 화평 20 — 같은 소속 동명이인) · 김철수(다른 이름)
const person = (person_id, name, mok1, mok3, o = {}) => ({ person_id, name, name_key: name, kind2: "장년", mok1, mok3, school_dept: "", ...o });
const PEOPLE = [person(11, "홍길동", "화평", "화평-20목장"), person(12, "홍길동", "소망", "소망-3목장"), person(13, "홍길동", "화평", "화평-21목장"),
  person(15, "이영희", "화평", "화평-20목장"), person(16, "이영희", "화평", "화평-20목장"), person(14, "김철수", "화평", "화평-20목장")];
const user = (n, name, gu, mok, o = {}) => ({ id: U(n), type: "교구", gu, mok, bu: "", grade: "", name, identity_key: `교구|${gu}|${mok}|||${name}`, ...o });
const USERS = [
  user(1, "홍길동", "화평", "20"),            // → 11
  user(2, "홍 길동", "화평", "20"),           // 빈칸을 넣어 등록한 같은 분 → 11(이름 열쇠가 같다)
  user(3, "홍길동", "소망", "3"),             // → 12
  user(4, "홍길동", "화평", "99"),            // 목장 모름 → 아무에게도
  user(5, "홍길동", "기쁨", "5"),             // 명부에 그 소속이 없다 → 아무에게도(「이름이 명부에 한 분뿐」으로 잇지 않는다)
  user(6, "홍길동A", "화평", "20"),           // 넓게 읽혀도(ilike) 이름 열쇠가 달라 빠진다
  user(7, "이영희", "화평", "20"),            // 같은 소속 동명이인 둘 → 아무에게도(여럿)
  user(8, "김철수", "화평", "20"),            // 다른 이름
  user(9, "홍길동", "중등부", "", { type: "교회학교", gu: "", mok: "", bu: "중등부", grade: "2" }),   // 명부 홍길동은 모두 어른 → 아무에게도
];
const COURSES = [
  { id: C(1), title: "제자훈련 1단계", term: "2027 상반기", starts_on: "2027-03-03", created_at: "2026-12-01T00:00:00Z" },
  { id: C(2), title: "교사 연수", term: "2026 하반기", starts_on: null, created_at: "2026-08-01T00:00:00Z" },
  { id: C(3), title: "교사 대학", term: "2027 상반기", starts_on: "2027-02-01", created_at: "2026-12-02T00:00:00Z" },
  { id: C(4), title: "새가족반", term: "", starts_on: null, created_at: "2025-03-01T00:00:00Z" },
  { id: C(5), title: "보관한 시험 강좌", term: "2027 상반기", starts_on: null, created_at: "2026-12-03T00:00:00Z", status: "archived" },
];
const SECRET = "비밀메모-담당자만";
const enr = (id, course, user_id, ident_key, status = "confirmed", o = {}) => ({ id, course_id: C(course), user_id: user_id ? U(user_id) : null, ident_key,
  status, name: "신청자이름" + id, who_type: "교구", group_name: "화평", sub_name: "20", staff_note: SECRET, cert_no: null, cert_revoked: false, completed: false, ...o });
const ENROLLS = [
  enr(101, 1, 1, "교구|화평|20|||홍길동", "confirmed", { cert_no: "고척-2027-0001", completed: true }),   // 11 · 앱
  enr(102, 3, 2, "교구|화평|20|||홍 길동", "waitlisted"),                                                 // 11 · 둘째 계정
  enr(103, 2, null, "person|11", "confirmed"),                                                             // 11 · 명부에서 대신 등록
  enr(104, 4, 3, "person|11", "cancelled", { cert_no: "고척-2025-0007", cert_revoked: true }),             // 11 · 12 의 계정에 붙었지만 person|11
  enr(105, 1, 1, "person|12", "applied"),                                                                  // 12 · 11 의 계정에 붙은 person|12 → 11 창에 안 보임
  enr(106, 2, 3, "교구|소망|3|||홍길동", "declined"),                                                      // 12 · 앱
  enr(107, 1, 4, "교구|화평|99|||홍길동"),                                                                 // 아무에게도
  enr(108, 1, null, "staff|새가족|||홍길동"),                                                               // 직접 입력 — 아무에게도
  enr(109, 1, 5, "교구|기쁨|5|||홍길동"),                                                                  // 아무에게도
  enr(110, 1, 6, "교구|화평|20|||홍길동A"),                                                                // 아무에게도
  enr(111, 1, 7, "교구|화평|20|||이영희"),                                                                 // 아무에게도(여럿)
  enr(112, 3, 8, "교구|화평|20|||김철수"),                                                                 // 14 와 이어진 계정
  enr(113, 1, null, "person|13"),                                                                          // 13
  enr(114, 1, null, "person|110"),                                                                         // 11 과 글자가 겹치는 다른 교인ID — 11 창에 안 보임
  enr(115, 1, 9, "교회학교|||중등부|2|홍길동"),
  enr(116, 5, null, "person|11", "confirmed"),                                                            // 11 · 보관한 강좌 — 탭에 안 보인다                                                            // 아무에게도
];
// 출석 — 101: 출석 3·지각 1·결석 1·공결 2 → 4/5 = 80% · 103: 결석 2 → 0% · 104: 출석 1(취소 줄도 칸이 남아 있으면 그대로 센다 — 앱 「내 강좌」와 같다) · 102: 없음
const att = (enrollment_id, session_id, state) => ({ enrollment_id, session_id, state, marked_by: U(99) });
const ATT = [att(101, 1, "present"), att(101, 2, "present"), att(101, 3, "present"), att(101, 4, "late"), att(101, 5, "absent"),
  att(101, 6, "excused"), att(101, 7, "excused"), att(103, 8, "absent"), att(103, 9, "absent"), att(104, 10, "present"),
  att(105, 1, "present"), att(112, 11, "absent")];
const TABLES = () => ({ church_people: PEOPLE.map((p) => ({ ...p })), users: USERS.map((u) => ({ ...u })), edu_enrollments: ENROLLS.map((e) => ({ ...e })),
  edu_courses: COURSES.map((c) => ({ ...c })), edu_attendance: ATT.map((a) => ({ ...a })) });

// ---------- 순수 ----------
test("personIdOfKey — 「person|N」(양의 정수)만 · 그 밖 null", () => {
  assert.equal(personIdOfKey("person|11"), 11);
  for (const k of ["person|0", "person|-1", "person|1.5", "person|11 ", " person|11", "person|", "staff|새가족|||홍길동", "교구|화평|20|||홍길동", null, undefined, 11])
    assert.equal(personIdOfKey(k), null, String(k));
});

test("eduNamePattern — 이름 열쇠 글자 사이마다 % · % _ 는 \\ 로 · 물을 수 없는 이름(\" \\ , ( ))은 빈 글", () => {
  assert.equal(eduNamePattern("홍길동"), "%홍%길%동%");
  assert.equal(eduNamePattern(" 홍 길동 "), "%홍%길%동%", "빈칸은 열쇠에서 빠진다");
  assert.equal(eduNamePattern("a_b%"), "%a%\\_%b%\\%%");
  for (const bad of ["김,철", "김(철)", '김"', "김\\철", "", null]) assert.equal(eduNamePattern(bad), "", String(bad));
  assert.ok(likeRe(eduNamePattern("홍길동")).test("홍 길동") && likeRe(eduNamePattern("홍길동")).test("홍길동A"), "넓게 잡는다(다음에 열쇠로 거른다)");
});

test("eduLinkedUserIds — 같은 소속에 같은 이름 한 분일 때만(matchLoginPerson) · 빈칸 넣은 같은 분도 · 목장 모름·소속 없음·동명이인 여럿·다른 이름은 안 이음", () => {
  const cands = (key) => PEOPLE.filter((p) => p.name_key === key);
  assert.deepEqual([...eduLinkedUserIds({ person_id: 11, name_key: "홍길동" }, cands("홍길동"), USERS)].sort(), [U(1), U(2)]);
  assert.deepEqual([...eduLinkedUserIds({ person_id: 12, name_key: "홍길동" }, cands("홍길동"), USERS)], [U(3)]);
  assert.deepEqual([...eduLinkedUserIds({ person_id: 13, name_key: "홍길동" }, cands("홍길동"), USERS)], [], "화평 21 계정이 없다");
  assert.deepEqual([...eduLinkedUserIds({ person_id: 15, name_key: "이영희" }, cands("이영희"), USERS)], [], "같은 소속 동명이인 — 여럿이면 안 잇는다");
  assert.deepEqual([...eduLinkedUserIds({ person_id: 16, name_key: "이영희" }, cands("이영희"), USERS)], []);
  assert.deepEqual([...eduLinkedUserIds({ person_id: 14, name_key: "김철수" }, cands("김철수"), USERS)], [U(8)]);
  // 명부 후보를 빼먹고 부르면(그분 한 분만 넘기면) 동명이인 여럿을 못 본다 — 부르는 쪽은 같은 이름 열쇠 전부를 넘긴다
  assert.deepEqual([...eduLinkedUserIds({ person_id: 11, name_key: "홍길동" }, [], USERS)], [], "명부 후보가 없으면 아무도");
  assert.deepEqual([...eduLinkedUserIds({ person_id: 0, name_key: "홍길동" }, cands("홍길동"), USERS)], []);
  assert.deepEqual([...eduLinkedUserIds({ person_id: 11, name_key: "" }, cands("홍길동"), USERS)], []);
});

test("eduRowsForPerson — person|N 은 N 일 때만(계정이 이어져 있어도 남의 person 줄은 안 받는다) · 그 밖은 이어진 계정 줄만 · 같은 줄은 한 번", () => {
  const linked = new Set([U(1), U(2)]);
  const ids = (rows) => rows.map((r) => r.id).sort((a, b) => a - b);
  assert.deepEqual(ids(eduRowsForPerson(11, ENROLLS, linked)), [101, 102, 103, 104, 116]);   // 116 = 보관한 강좌(줄 고르기는 받고 강좌 읽기가 뺀다)
  assert.deepEqual(ids(eduRowsForPerson(11, [...ENROLLS, ...ENROLLS], linked)), [101, 102, 103, 104, 116], "겹쳐 받아도 한 번");
  assert.deepEqual(ids(eduRowsForPerson(12, ENROLLS, new Set([U(3)]))), [105, 106]);
  assert.deepEqual(ids(eduRowsForPerson(110, ENROLLS, new Set())), [114]);
  assert.deepEqual(ids(eduRowsForPerson(11, ENROLLS, new Set())), [103, 104, 116], "이어진 계정이 없으면 명부 줄만");
});

test("eduTabItems — 칸 지도 일곱 · 학기 새것부터(학기 안에서 시작일 늦은 것부터) · 출석률 eduAttendRate(지각 = 출석 · 공결 뺌 · 체크 없으면 null) · 수료번호(취소됨)", () => {
  const rows = ENROLLS.filter((e) => [101, 102, 103, 104].includes(e.id));
  const items = eduTabItems(rows, COURSES, ATT);
  for (const it of items) assert.deepEqual(Object.keys(it).sort(), ITEM_KEYS);
  assert.deepEqual(items.map((x) => [x.term, x.title]), [["2027 상반기", "제자훈련 1단계"], ["2027 상반기", "교사 대학"],
    ["2026 하반기", "교사 연수"], ["", "새가족반"]]);
  assert.deepEqual(items.map((x) => [x.status, x.statusLabel]), [["confirmed", "확정"], ["waitlisted", "대기"], ["confirmed", "확정"], ["cancelled", "취소"]]);
  assert.deepEqual(items.map((x) => x.attendPct), [80, null, 0, 100]);
  assert.deepEqual(items.map((x) => [x.certNo, x.certRevoked]), [["고척-2027-0001", false], [null, false], [null, false], ["고척-2025-0007", true]]);
  const s = JSON.stringify(items);
  for (const leak of [SECRET, "신청자이름", "person|", "교구|", U(1), U(2), U(3), "user_id", "ident_key", "staff_note"]) assert.ok(!s.includes(leak), leak);
  assert.deepEqual(eduTabItems([], COURSES, ATT), []);
  assert.deepEqual(eduTabItems([enr(1, 9, 1, "x")], COURSES, []), [], "강좌를 못 찾은 줄은 뺀다");
  // 반려 상태 · 같은 날·같은 학기면 제목 → 신청 번호 큰 것부터
  const tie = eduTabItems([enr(7, 1, 1, "x", "declined"), enr(9, 1, 1, "y", "applied")], COURSES, []);
  assert.deepEqual(tie.map((x) => x.statusLabel), ["신청", "반려"]);
});

test("withEduTab — 배열이면 education 칸과 counts.education · 아니면(교육 읽기 실패 null) 그대로(사역·성경필사 탭은 남는다)", () => {
  const h = { counts: { ministry: 2, bible: 1 }, ministry: [1, 2], bible: [3] };
  assert.deepEqual(withEduTab(h, [{ a: 1 }]), { counts: { ministry: 2, bible: 1, education: 1 }, ministry: [1, 2], bible: [3], education: [{ a: 1 }] });
  assert.deepEqual(withEduTab(h, []).counts, { ministry: 2, bible: 1, education: 0 });
  assert.equal(withEduTab(h, null), h);
  assert.equal(withEduTab(h, undefined), h);
  assert.equal("education" in h.counts, false, "들어온 자료는 바꾸지 않는다");
});

// ---------- 가짜 db 로 eduPersonTab ----------
test("eduPersonTab — 홍길동(11): 이어진 두 계정의 줄 + person|11 줄만 · 12 의 계정에 붙은 person|11 줄도 · 11 계정에 붙은 person|12 줄은 아님", async () => {
  const { edu, db, audits } = setup(TABLES());
  const items = await edu.eduPersonTab(11);
  assert.deepEqual(items.map((x) => x.title), ["제자훈련 1단계", "교사 대학", "교사 연수", "새가족반"], "보관한 강좌(116)는 안 보인다");
  assert.deepEqual(items.map((x) => x.attendPct), [80, null, 0, 100], "출석 칸이 쪽(5줄)을 넘어도 다 센다");
  assert.equal(audits.length, 0, "기록 없음 — 창을 연 people.view 가 이미 있다");
  assert.deepEqual(db.log.unpaged, [], "쪽 넘기기 없이 물은 표가 있다(1,000줄 함정)");
  assert.deepEqual(db.log.rpc, []);
});

test("eduPersonTab — 남의 것이 안 보인다: 12 · 13 · 동명이인 여럿(15·16) · 다른 이름(14) · 없는 분 · 0", async () => {
  const { edu } = setup(TABLES());
  assert.deepEqual((await edu.eduPersonTab(12)).map((x) => [x.title, x.statusLabel]), [["제자훈련 1단계", "신청"], ["교사 연수", "반려"]]);
  assert.deepEqual((await edu.eduPersonTab(13)).map((x) => x.title), ["제자훈련 1단계"], "person|13 줄만(화평 21 계정은 없다)");
  assert.deepEqual(await edu.eduPersonTab(15), [], "같은 소속 이영희 둘 — 그 계정 줄은 누구 창에도 안 보인다");
  assert.deepEqual(await edu.eduPersonTab(16), []);
  assert.deepEqual((await edu.eduPersonTab(14)).map((x) => x.title), ["교사 대학"]);
  assert.deepEqual(await edu.eduPersonTab(999), [], "명부에 없는 분");
  assert.deepEqual(await edu.eduPersonTab(0), []);
  assert.deepEqual(await edu.eduPersonTab("x"), []);
});

test("eduPersonTab — 읽는 칸: 신청 줄은 메모(staff_note)·신청자 이름을 읽지도 않는다 · 앱 계정은 소속·이름만 · 출석은 marked_by 없이", async () => {
  const { edu, db } = setup(TABLES());
  const items = await edu.eduPersonTab(11);
  const cols = (t) => db.log.selects.filter(([tb]) => tb === t).map(([, c]) => c);
  for (const c of cols("edu_enrollments")) {
    assert.equal(/staff_note|\bname\b|who_type|group_name|fee_paid/.test(c), false, c);
  }
  for (const c of cols("edu_attendance")) assert.equal(/marked_by/.test(c), false, c);
  for (const c of cols("users")) assert.equal(/identity_key|phone|cid/.test(c), false, c);
  for (const c of cols("church_people")) assert.equal(/phone|address|birth|photo/.test(c), false, c);
  const s = JSON.stringify(items);
  for (const leak of [SECRET, "신청자이름", "person|", U(1), U(2), U(3), U(99)]) assert.ok(!s.includes(leak), leak);
  for (const it of items) assert.deepEqual(Object.keys(it).sort(), ITEM_KEYS);
});

test("eduPersonTab — 물을 수 없는 이름(쉼표·괄호)인 분은 계정을 묻지 않고 person|ID 줄만", async () => {
  const t = TABLES();
  t.church_people.push(person(21, "김(철)", "화평", "화평-20목장"));
  t.users.push(user(21, "김(철)", "화평", "20"));
  t.edu_enrollments.push(enr(201, 1, 21, "교구|화평|20|||김(철)"), enr(202, 2, null, "person|21"));
  const { edu, db } = setup(t);
  assert.deepEqual((await edu.eduPersonTab(21)).map((x) => x.title), ["교사 연수"]);
  assert.equal(db.log.selects.some(([tb]) => tb === "users"), false, "users 를 묻지 않았다");
});
