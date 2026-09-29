// 개발 서버에 대고 도는 시험 — 네트워크와 개발 비밀 키가 필요해 preflight 에는 넣지 않는다(이름의 .dev.).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/server.dev.test.mjs
// 시험용 사람은 이메일 로그인으로 만들고(ca-test-…@example.test) 끝나면 지운다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTION_ROLES, knownRoles } from "../supabase/functions/church-admin/authz.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const ZERO = "00000000-0000-0000-0000-000000000000";
const PAPER_NAME = "ca-test-paper-" + STAMP;   // 종이 명단(Task 5) 시험 인물 — 교구 시험, 목장 0
const people = {};
// 교인명부(2026-09-29) 시험 자료 — 교인ID 990000001~ (가짜 명부 900001~ 와 겹치지 않게) · 끝나면 지운다
const PEOPLE_IDS = [990000001, 990000002, 990000003];
const PEOPLE_SOURCE_DATE = "2000-01-01";   // 시험 올린 기록의 기준일 — 이 날짜 줄은 시험 것뿐이다(정리할 때 이 날짜로 지운다)
const DIR_NAME = "ca-test-dir-" + STAMP;    // 거르기 시험 인물(990000003) — 교구·구분·출석·직분이 앞의 두 분과 모두 다르다
// 명부에만 있는 전화(990000001 의 연락처2) — 사역 응답에 이 번호가 보이면 교적 값이 샌 것이다
const CHURCH_ONLY_PHONE = "010-7" + String(STAMP).slice(-3) + "-" + String(STAMP).slice(-7, -3);
// 명부 쪽 칸 이름 — 사역 응답의 줄에 이 칸이 더해지면 교적 값이 샌 것이다(id·name·position 은 사역 줄에도 원래 있다)
const CHURCH_COLS = ["person_id", "position_detail", "gender", "birth", "birth_date", "lunar", "age", "spouse", "spouse_position",
  "household_head", "household_rel", "household_id", "kind1", "kind2", "kind3", "registered", "registered_date", "reg_type",
  "phone1", "phone2", "guide", "email", "mok_path", "mok1", "mok2", "mok3", "mok_leader", "school_path", "school_dept", "teacher",
  "youth_path", "mission", "address", "address_jibun", "has_photo", "photo_hash", "name_key", "phone_digits"];
const PHOTO_PATH = "church-people-photos/990000001.jpg";
// 성경필사(암송)(2026-09-29) 시험 자료 — 초안(draft) 회차 둘(보통·자격) + 줄 여섯. draft 라 성도님 화면에는 안 보인다.
//   회차 id 는 모두 ca-test- 로 시작하고 STAMP 를 담는다(Task 6~8 도) — after() 가 이번 실행의 회차를 한꺼번에 지운다(줄은 CASCADE).
//   앱 줄 하나는 시험 users 에 잇는다(누출 시험용).
const EV_ID = "ca-test-" + STAMP;              // EVT_ID_RE(/^[a-z0-9][a-z0-9-]{1,40}$/)에 맞는다 — 21자
const EV_EL_ID = "ca-test-el-" + STAMP;        // 자격 회차(needs.eligibility 있음)
const EV_NAME = "ca-test-ev-" + STAMP;         // 명부에 없는 분 — 두 회차·두 소속에 나온다(사람 묶음 시험)
const EV_APP_NAME = "ca-test-evapp-" + STAMP;  // 앱에서 낸 줄의 분(user_id 있음)
// 앱 줄에만 있는 값 — 담당자 응답에 이 글자가 보이면 성도님 전화·메모·답(answers)이 샌 것이다
const EV_PHONE = "010-8" + String(STAMP).slice(-3) + "-" + String(STAMP).slice(-7, -3);
const EV_MEMO = "ca-test-memo-" + STAMP;
const EV_ANSWER = "ca-test-answer-" + STAMP;
// 화면이 기대하는 칸(CONTRACT 2절) — 하나라도 더해지거나 빠지면 시험이 잡는다
const EV_OUT_KEYS = ["id", "title", "short_title", "subtitle", "season", "kind", "status", "opens_on", "closes_on",
  "list_until", "updated_at", "count", "listedNow", "hasEligibility"].sort();
const ROW_OUT_KEYS = ["id", "who_type", "group", "sub", "name", "position", "note", "source", "hasUser", "at",
  "updated_at", "church"].sort();
const HIST_ROW_KEYS = ["event_id", "title", "closes_on", "who_type", "group", "sub", "position", "source", "hasUser"].sort();

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t }; } }

async function makeUser(label) {
  const email = `ca-test-${label}-${STAMP}@example.test`, password = "T" + STAMP + "!x";
  const u = await body(await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc,
    body: JSON.stringify({ email, password, email_confirm: true }) }));
  assert.ok(u.id, "사용자 만들기 실패: " + JSON.stringify(u));
  const s = await body(await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  assert.ok(s.access_token, "로그인 실패: " + JSON.stringify(s));
  return { uid: u.id, token: s.access_token };
}

async function rest(path, method, data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method, headers: { ...svc, Prefer: "return=representation" },
    body: data ? JSON.stringify(data) : undefined });
  const x = await body(r);
  assert.ok(r.ok, path + " " + JSON.stringify(x));
  return x;
}

async function makeMember(p, status, roles) {
  const [m] = await rest("admin_members", "POST", { auth_user_id: p.uid, name: "시험-" + status, gu: "사랑", mok: "1", status });
  for (const role_id of roles) await rest("admin_role_grants", "POST", { member_id: m.id, role_id });
  p.memberId = m.id;
}

async function call(token, action, extra = {}) {
  const r = await fetch(FN, { method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ ...extra, action }) });
  return { status: r.status, body: await body(r) };
}

// super 액션마다 「통과하면 아무것도 안 바뀌는」 입력 — 없는 사람(ZERO)을 가리킨다
const PROBE = {
  membersList: {},
  membersApprove: { member_id: ZERO, roles: ["ministry"] },
  membersSetRoles: { member_id: ZERO, roles: ["ministry"] },
  membersSetStatus: { member_id: ZERO, status: "disabled" },
  auditList: { limit: 1 },
  ministryAppointed: {},
  ministryList: {},
  ministrySetStatus: { id: 0, status: "접수완료" },
  ministryDelete: { id: 0 },
  ministryCatalogAdmin: {},
  ministryCatalogSave: { id: 0 },
  ministryCatalogOrder: { ids: [] },
  ministryPaperCheck: { rows: [] },
  ministryPaperSave: { rows: [] },
  peopleSearch: { q: "ca-test-probe-없음" },
  peoplePerson: { id: 0 },
  peopleStats: {},
  peopleExport: { q: "ca-test-probe-없음" },
  // 성경필사(암송)(Task 5) — 읽기만. 없는 회차·없는 이름을 가리킨다
  evEvents: {},
  evRoster: { event_id: "ca-test-probe-none" },
  evHistory: { name: "ca-test-probe-없음" },
  evStats: { event_ids: ["ca-test-probe-none"] },
};
const GATES = ["unknown-action", "not-registered", "pending", "disabled", "forbidden"];

// 신청 현황(3단계) 시험 자료 — users 한 줄 + ministry_orders 두 줄(서로 다른 사역팀)
let minTestUserId = null;
let evTestUserId = null;               // 성경필사(암송) 앱 줄의 시험 users id — after() 에서 지운다
const minTestOrderIds = [];

// 사역팀 정보(4·5단계 · Task 2) 시험 자료 — 개발 ministry_catalog 의 실제 줄을 빌려 쓴다.
// ⚠️ 시험이 끝나면 개발 DB 가 시험 전과 같아야 한다 — 여기서 원래 값을 읽어 두고 after() 에서 되돌린다
// (되돌리기는 결과와 상관없이 늘 돈다 — assert 가 도중에 던져도 after 는 실행된다).
let catalogRow = null;                 // desc_note/day_sun/time 시험에 쓸 한 줄(원래 값 스냅샷)
let catalogCommittee = null;           // 차례 시험에 쓸 위원회
let catalogCommitteeIds = [];          // 그 위원회의 id 들 — sort_order 오름차순
let catalogCommitteeSlots = [];        // 그 id 들이 원래 갖고 있던 sort_order 값(같은 순서)

// 교인명부 시험 자료 지우기 — before() 첫머리(지난번이 도중에 멈춰 남긴 찌꺼기)와 after() 맨 앞에서 부른다
async function clearPeopleFixtures() {
  await rest(`church_people?person_id=in.(${PEOPLE_IDS.join(",")})`, "DELETE");
  await rest(`church_people_imports?source_date=eq.${PEOPLE_SOURCE_DATE}`, "DELETE");
}

before(async () => {
  await clearPeopleFixtures();   // 고정 ID 라 지난번 찌꺼기가 있으면 PK 중복으로 깨진다
  // 성경필사(암송) — 지난번이 도중에 멈춰 남긴 시험 회차(줄은 CASCADE)·앱 줄 시험 계정. **한 시간 넘은 것만** —
  //   다른 세션이 개발에서 같은 시험을 돌리는 중이면 그쪽 회차를 지우지 않게.
  const evStale = new Date(Date.now() - 3600 * 1000).toISOString();
  await rest(`events?id=like.ca-test-*&created_at=lt.${evStale}`, "DELETE");
  await rest(`users?name=like.ca-test-evapp-*&created_at=lt.${evStale}`, "DELETE");
  for (const k of ["none", "pending", "disabled", "ministry", "directory", "bibleevent", "super"]) people[k] = await makeUser(k);
  await makeMember(people.pending, "pending", []);
  await makeMember(people.disabled, "disabled", ["super"]);
  await makeMember(people.ministry, "active", ["ministry"]);
  await makeMember(people.directory, "active", ["directory"]);
  await makeMember(people.bibleevent, "active", ["bibleevent"]);
  await makeMember(people.super, "active", ["super"]);

  const [u] = await rest("users", "POST", {
    type: "교구", gu: "시험", mok: "0", name: "ca-test-min",
    identity_key: "교구|시험|0|||ca-test-min-" + STAMP,
  });
  minTestUserId = u.id;
  // team_id 는 not null + (year,user_id,team_id) 유일 제약이 있다 — 가짜 id 를 만들지 않고
  // 개발 ministry_catalog 에서 서로 다른 두 줄의 id 를 그대로 읽어 쓴다.
  const cats = await rest("ministry_catalog?select=id&order=id&limit=2", "GET");
  assert.ok(cats.length >= 2, "ministry_catalog 에 팀이 둘 이상 있어야 한다");
  const cfg = await rest("app_config?select=value&key=eq.ministry", "GET");
  const year = Number(cfg[0]?.value?.year) || 2027;
  for (const [team_id, team] of [[cats[0].id, "시험팀A"], [cats[1].id, "시험팀B"]]) {
    const [row] = await rest("ministry_orders", "POST", {
      year, user_id: minTestUserId, team_id, committee: "시험부", team, name: "ca-test-min",
      status: "신청완료", phone: "010-0000-0000", source: "app",
    });
    minTestOrderIds.push(row.id);
  }

  // 사역팀 정보(Task 2) — 팀이 둘 이상인 위원회를 하나 찾아 원래 sort_order 순서를 기록해 둔다.
  const allCat = await rest(`ministry_catalog?select=id,committee,sort_order&year=eq.${year}&order=committee,sort_order`, "GET");
  const byCommittee = new Map();
  for (const r of allCat) {
    if (!byCommittee.has(r.committee)) byCommittee.set(r.committee, []);
    byCommittee.get(r.committee).push(r);
  }
  const found = [...byCommittee.values()].find((list) => list.length >= 2);
  assert.ok(found, "팀이 둘 이상인 위원회가 있어야 한다(사역팀 정보 시험)");
  catalogCommittee = found[0].committee;
  catalogCommitteeIds = found.map((r) => r.id);
  catalogCommitteeSlots = found.map((r) => r.sort_order);
  const [row0] = await rest(`ministry_catalog?select=id,desc_note,day_sun,time_from,time_to,capacity_note&id=eq.${found[0].id}`, "GET");
  catalogRow = row0;

  // 교인명부 — 두 분(하나는 사진 있음) + 올린 기록 한 줄(명부 기준일이 있어야 교적 표시가 나온다) + 사진 한 장
  // ⚠️ PostgREST 배치 insert 는 배열 안 객체들의 칸이 전부 같아야 한다(PGRST102) — 두 분의 칸이
  //   달라(주소·직분 등) 한 번에 넣으면 실패하므로 따로 넣는다.
  await rest("church_people", "POST",
    { person_id: 990000001, name: "ca-test-min", name_key: "ca-test-min", mok1: "시험", mok2: "시험", mok3: "시험-0목장",
      mok_path: "시험 > 시험 > 시험-0목장", kind1: "교인", kind2: "장년", kind3: "출석교인", position: "집사",
      phone1: "010-0000-0000", phone2: CHURCH_ONLY_PHONE, phone_digits: "01000000000 " + CHURCH_ONLY_PHONE.replace(/\D/g, ""),
      address: "시험시 비밀주소 " + STAMP, has_photo: true, photo_hash: "t", age: 45,
      household_id: 990000001, household_head: "ca-test-min", household_rel: "본인" });
  await rest("church_people", "POST",
    { person_id: 990000002, name: PAPER_NAME, name_key: PAPER_NAME, mok1: "시험", mok2: "시험", mok3: "시험-5목장",
      phone1: "010-1234-5678", phone_digits: "01012345678", has_photo: false,
      household_id: 990000001, household_head: "ca-test-min", household_rel: "아들1" });   // 두 분은 한 가족
  // 거르기 시험 — 교구(시험B)·구분·출석·직분이 앞의 두 분과 다르고, 전화 뒷자리에 0000 이 있고, 사진이 「있음」
  await rest("church_people", "POST",
    { person_id: 990000003, name: DIR_NAME, name_key: DIR_NAME, mok1: "시험B", mok2: "시험B", mok3: "시험B-1목장",
      kind1: "교인", kind2: "청년", kind3: "새신자", position: "권사",
      phone1: "010-5555-0000", phone_digits: "01055550000", has_photo: true, photo_hash: "t", age: 30 });   // 002 는 나이 모름(정렬 시험)
  await rest("church_people_imports", "POST",
    { source_date: PEOPLE_SOURCE_DATE, total: 3, added: 3, changed: 0, removed: 0, photos: 2 });
  const up = await fetch(`${URL_}/storage/v1/object/${PHOTO_PATH}`, { method: "POST",
    headers: { ...svc, "Content-Type": "image/jpeg", "x-upsert": "true" }, body: new TextEncoder().encode("ca-test-photo") });
  assert.ok(up.ok, "시험 사진 올리기 실패: " + await up.text());

  // 성경필사(암송) — 시험 users 한 줄(앱 줄용) + draft 회차 둘 + 줄 여섯
  // ⚠️ PostgREST 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — sig() 가 늘 같은 칸을 채운다.
  const [eu] = await rest("users", "POST",
    { type: "교구", gu: "시험", mok: "0", name: EV_APP_NAME, identity_key: "교구|시험|0|||" + EV_APP_NAME });
  evTestUserId = eu.id;
  const evBase = { short_title: "", subtitle: "시험 회차", season: "", kind: "signup", status: "draft", list_until: null,
    needs: { position: true, phone: false, memo: false, extra: [] } };
  await rest("events", "POST", [
    { ...evBase, id: EV_ID, title: "ca-test 회차 " + STAMP, opens_on: "2000-01-01", closes_on: "2000-01-31" },
    { ...evBase, id: EV_EL_ID, title: "ca-test 자격 회차 " + STAMP, opens_on: "2000-02-01", closes_on: "2000-02-28",
      needs: { ...evBase.needs, eligibility: { start: "2000-02-01", weeks: 4, perWeek: 3, need: 3 } } },
  ]);
  const sig = (event_id, who_type, group_name, sub_name, name, extra = {}) => ({
    event_id, user_id: null, source: "import", who_type, group_name, sub_name, name,
    ident_key: who_type === "교구" ? `교구|${group_name}|${sub_name}|||${name}` : `교회학교|||${group_name}|${sub_name}|${name}`,
    position: "", phone: "", memo: "", answers: {}, note: "", ...extra,
  });
  await rest("event_signups", "POST", [
    sig(EV_ID, "교구", "시험", "0", "ca-test-min", { position: "집사", note: "담당자가 더함" }),   // 명부 990000001(시험-0목장) → 맞음
    sig(EV_ID, "교구", "시험", "3", DIR_NAME, { position: "권사" }),                            // 명부는 시험B → 확인 필요
    sig(EV_ID, "교구", "시험", "7", EV_NAME),                                                  // 명부에 없음
    sig(EV_ID, "교회학교", "청년부", "", EV_NAME),                                             // 같은 이름 · 다른 소속(다른 묶음)
    sig(EV_ID, "교구", "시험", "0", EV_APP_NAME,                                               // 앱에서 낸 줄
      { user_id: evTestUserId, source: "app", phone: EV_PHONE, memo: EV_MEMO, answers: { q: EV_ANSWER } }),
    sig(EV_EL_ID, "교구", "시험", "7", EV_NAME, { note: "명단 올리기" }),                     // 셋째 줄과 같은 분(한 묶음)
  ]);
});

after(async () => {
  // ⚠️ 단계마다 오류를 모았다가 끝에 한 번 던진다 — 한 단계가 던져도 뒤 단계(특히 교인명부·사진)는 돈다.
  //   교인명부 정리는 맨 앞 — 고정 ID 라 남으면 다음 before() 가 깨지고, 2000-01-01 올린 기록이 개발 화면 기준일을 틀어 놓는다.
  const errs = [];
  const step = async (label, fn) => { try { await fn(); } catch (e) { errs.push(label + " — " + (e?.message ?? e)); } };
  await step("교인명부 줄·올린 기록", clearPeopleFixtures);
  await step("교인 사진", async () => {
    const r = await fetch(`${URL_}/storage/v1/object/church-people-photos`, { method: "DELETE", headers: svc,
      body: JSON.stringify({ prefixes: ["990000001.jpg"] }) });
    if (!r.ok) throw new Error(r.status + " " + await r.text());
  });
  // 성경필사(암송) — 이번 실행(STAMP)의 시험 회차 전부(Task 6~8 것 포함 · 줄은 CASCADE) · 앱 줄의 시험 users.
  //   회차를 먼저 — users 를 먼저 지우면 앱 줄이 CASCADE 로 먼저 사라져 「줄이 남았나」를 제대로 못 본다.
  await step("성경필사 시험 회차", async () => {
    await rest(`events?id=like.ca-test-*${STAMP}*`, "DELETE");
    const left = await rest(`event_signups?select=id&event_id=like.ca-test-*${STAMP}*`, "GET");
    assert.equal(left.length, 0, "시험 회차의 줄이 남았다(CASCADE)");
  });
  if (evTestUserId) await step("성경필사 시험 users", () => rest("users?id=eq." + evTestUserId, "DELETE"));
  for (const p of Object.values(people)) {
    if (p.uid) await step("사용자 " + p.uid, async () => {
      const r = await fetch(URL_ + "/auth/v1/admin/users/" + p.uid, { method: "DELETE", headers: svc });
      if (!r.ok && r.status !== 404) throw new Error(r.status + " " + await r.text());
    });
  }
  // ministry_orders 먼저, 그다음 users — 이미 지워진(id) 것이 있어도 오류로 보지 않는다
  for (const id of minTestOrderIds) await step("신청 " + id, () => rest("ministry_orders?id=eq." + id, "DELETE"));
  if (minTestUserId) await step("시험 users", () => rest("users?id=eq." + minTestUserId, "DELETE"));
  // ⚠️ 사역팀 정보 — 시험 중 무엇을 어디까지 바꿨든(assert 가 도중에 던졌어도) 원래 값으로 되돌린다.
  //   차례 시험은 항상 원래 순서(같은 차례) 아니면 검증 단계에서 막혀 sort_order 를 안 건드리므로
  //   여긴 desc_note/day_sun/time/capacity_note 만.
  if (catalogRow) {
    await step("사역팀 정보 되돌리기", () => rest(`ministry_catalog?id=eq.${catalogRow.id}`, "PATCH", {
      desc_note: catalogRow.desc_note, day_sun: catalogRow.day_sun,
      time_from: catalogRow.time_from, time_to: catalogRow.time_to,
      capacity_note: catalogRow.capacity_note,
    }));
  }
  // ⚠️ 종이 명단(Task 5) — 저장 시험이 계정을 만들었을 수도, 살펴보기만으로 끝나 안 만들었을 수도
  //   있다. 그 이름의 users 를 찾아 딸린 ministry_orders·user_identity_aliases 를 먼저 지우고,
  //   마지막으로 users 자체를 지운다.
  await step("종이 명단 계정", async () => {
    const paperUsers = await rest(`users?select=id&name=eq.${encodeURIComponent(PAPER_NAME)}`, "GET");
    for (const u of paperUsers) {
      await rest(`ministry_orders?user_id=eq.${u.id}`, "DELETE");
      await rest(`user_identity_aliases?user_id=eq.${u.id}`, "DELETE");
    }
    if (paperUsers.length) await rest(`users?name=eq.${encodeURIComponent(PAPER_NAME)}`, "DELETE");
    const paperRemain = await rest(`users?select=id&name=eq.${encodeURIComponent(PAPER_NAME)}`, "GET");
    assert.equal(paperRemain.length, 0, "종이 명단 시험 계정이 지워지지 않았다: " + PAPER_NAME);
  });
  if (errs.length) throw new Error("정리 실패 " + errs.length + "건: " + errs.join(" / "));
});

test("역할이 필요한 액션마다 시험 입력(PROBE)이 있다", () => {
  for (const [a, role] of Object.entries(ACTION_ROLES)) if (role) assert.ok(a in PROBE, "PROBE 에 없음: " + a);
});

test("서버가 아는 역할이 admin_roles 표에 있다", async () => {
  const rows = await rest("admin_roles?select=id", "GET");
  const ids = rows.map((r) => r.id);
  for (const r of knownRoles()) assert.ok(ids.includes(r), "admin_roles 에 없음: " + r);
});

test("토큰 없음·공개 키를 토큰처럼 → 401", async () => {
  assert.equal((await call(null, "me")).status, 401);
  assert.equal((await call(ANON, "me")).status, 401);
});

test("모르는 액션 → 400", async () => {
  const r = await call(people.super.token, "nope");
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "unknown-action");
});

test("권한 표: 사람 다섯 × 역할이 필요한 액션", async () => {
  const want = (who, role) => ({
    none: "not-registered", pending: "pending", disabled: "disabled",
    ministry: role === "ministry" ? null : "forbidden",
    directory: role === "directory" ? null : "forbidden",
    bibleevent: role === "bibleevent" ? null : "forbidden",
    super: null,
  })[who];
  for (const [a, payload] of Object.entries(PROBE)) {
    const role = ACTION_ROLES[a];
    for (const who of ["none", "pending", "disabled", "ministry", "directory", "bibleevent", "super"]) {
      const gate = want(who, role);
      const r = await call(people[who].token, a, payload);
      if (gate) {
        assert.equal(r.status, 403, `${who} ${a} ${JSON.stringify(r.body)}`);
        assert.equal(r.body.error, gate, `${who} ${a}`);
      } else {
        assert.notEqual(r.status, 500, `${who} ${a} ${JSON.stringify(r.body)}`);
        assert.ok(!GATES.includes(r.body.error), `${who} ${a} ${JSON.stringify(r.body)}`);
      }
    }
  }
});

test("me: 다섯 사람 모두 자기 상태를 안다 · 정지된 분에게는 역할을 알려 주지 않는다", async () => {
  const want = { none: [false, null], pending: [true, "pending"], disabled: [true, "disabled"], ministry: [true, "active"], super: [true, "active"] };
  for (const [who, [reg, st]] of Object.entries(want)) {
    const r = await call(people[who].token, "me");
    assert.equal(r.body.ok, true, who);
    assert.equal(r.body.registered, reg, who);
    assert.equal(r.body.status, st, who);
  }
  assert.deepEqual((await call(people.disabled.token, "me")).body.roles, []);
  const m = await call(people.ministry.token, "me");
  assert.deepEqual(m.body.roles, ["ministry"]);
  assert.equal(m.body.roles_info[0].label, "사역신청 담당");
  assert.equal("auth_user_id" in m.body.member, false);
});

test("공개 키·로그인 사용자 모두 admin_* 표를 직접 못 읽는다", async () => {
  for (const t of ["admin_members", "admin_roles", "admin_role_grants", "admin_audit"]) {
    const a = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON } });
    assert.notEqual(a.status, 200, "공개 키로 열림: " + t);
    const b = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`,
      { headers: { apikey: ANON, Authorization: "Bearer " + people.super.token } });
    assert.notEqual(b.status, 200, "로그인 사용자로 열림: " + t);
  }
});

test("register: 틀린 칸 → 등록 → 대기 중엔 고치기 → 승인된 분은 못 바꿈", async () => {
  const badChar = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", mok: "1", name: '김,"' } });
  assert.equal(badChar.body.error, "bad-char");
  const bad = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", name: "" } });
  assert.equal(bad.body.error, "name-required");
  const r1 = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", mok: "1", name: "시험등록" } });
  assert.equal(r1.body.status, "pending");
  const r2 = await call(people.none.token, "register", { identity: { type: "교구", gu: "사랑", mok: "2", name: "시험등록" } });
  assert.equal(r2.body.member.mok, "2");
  const r3 = await call(people.ministry.token, "register", { identity: { type: "교구", gu: "사랑", mok: "1", name: "바꿔치기" } });
  assert.equal(r3.body.error, "already-registered");
});

test("승인 · 역할 · 정지 한 바퀴 + 스스로 잠그지 않기 + 기록", async () => {
  const s = people.super.token;
  const list = await call(s, "membersList");
  assert.equal(list.body.ok, true);
  const target = list.body.members.find((m) => m.name === "시험등록");
  assert.ok(target, "대기 목록에 시험등록이 있어야 한다");
  assert.equal("auth_user_id" in target, false);
  assert.equal((await call(s, "membersApprove", { member_id: target.id, roles: ["root"] })).body.error, "unknown-role");
  assert.equal((await call(s, "membersApprove", { member_id: target.id, roles: ["ministry"] })).body.ok, true);
  assert.equal((await call(s, "membersApprove", { member_id: target.id, roles: ["ministry"] })).body.error, "not-pending");
  assert.deepEqual((await call(people.none.token, "me")).body.roles, ["ministry"]);
  assert.equal((await call(s, "membersSetRoles", { member_id: target.id, roles: ["ministry", "super"] })).body.ok, true);
  assert.equal((await call(s, "membersSetRoles", { member_id: target.id, roles: ["ministry"] })).body.ok, true);
  assert.equal((await call(s, "membersSetStatus", { member_id: target.id, status: "disabled" })).body.ok, true);
  assert.equal((await call(people.none.token, "membersList")).body.error, "disabled");
  assert.equal((await call(s, "membersSetStatus", { member_id: people.super.memberId, status: "disabled" })).body.error, "self");
  assert.equal((await call(s, "membersSetRoles", { member_id: people.super.memberId, roles: ["ministry"] })).body.error, "self-super");
  assert.equal((await call(s, "membersSetStatus", { member_id: people.pending.memberId, status: "active" })).body.error, "use-approve");
  const acts = (await call(s, "auditList", { limit: 20 })).body.rows.map((r) => r.action);
  for (const a of ["register", "register.update", "members.approve", "members.roles", "members.status"]) {
    assert.ok(acts.includes(a), "기록에 없음: " + a + " — " + JSON.stringify(acts));
  }
});

test("임명현황: 임명확정만 · 여덟 칸만 · 개수가 DB 와 같다", async () => {
  const r = await call(people.ministry.token, "ministryAppointed");
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.ok(Number.isInteger(r.body.year));
  const allowed = ["name", "who", "committee", "team", "option", "at", "decided_at", "source"];
  for (const row of r.body.rows) {
    assert.deepEqual(Object.keys(row).sort(), [...allowed].sort());
    assert.match(row.at, /^(\d{4}-\d{2}-\d{2})?$/);
    assert.ok(row.source === "app" || row.source === "paper");
  }
  // 옛 화면과 같은 명단인지 — 서비스 키로 DB 를 직접 세어 맞댄다
  const res = await fetch(`${URL_}/rest/v1/ministry_orders?select=id&year=eq.${r.body.year}&status=eq.${encodeURIComponent("임명확정")}`,
    { headers: { ...svc, Prefer: "count=exact", Range: "0-0" } });
  const total = Number((res.headers.get("content-range") || "").split("/")[1]);
  assert.equal(r.body.rows.length, total, "DB 의 임명확정 수와 다르다");
});

test("신청 현황: 목록 모양 · 동시 수정 · 취소 사유 · 임명 알림(개발 api 내부 액션) · 삭제 · 바꾼 기록", async () => {
  const m = people.ministry.token;
  const list = await call(m, "ministryList");
  assert.equal(list.body.ok, true);
  const mine = list.body.list.filter((x) => x.name === "ca-test-min");
  assert.equal(mine.length, 2);
  for (const x of mine) {
    assert.equal("user_id" in x, false);
    assert.equal(x.phone, "010-0000-0000");
    assert.equal(x.canPush, false);
  }
  for (const x of mine) assert.equal(x.who, "시험 0목장");
  const [a, bRow] = mine.sort((x, y) => x.team.localeCompare(y.team));
  // 접수 → 같은 expect 로 한 번 더 → conflict
  assert.equal((await call(m, "ministrySetStatus", { id: a.id, status: "접수완료", expect: "신청완료" })).body.ok, true);
  const c = await call(m, "ministrySetStatus", { id: a.id, status: "임명확정", expect: "신청완료" });
  assert.equal(c.body.error, "conflict");
  assert.equal(c.body.status, "접수완료");
  // 임명 → 알림 안 켜심(시험 사용자는 구독이 없다) · 번호 지움
  const ap = await call(m, "ministrySetStatus", { id: a.id, status: "임명확정", expect: "접수완료" });
  assert.equal(ap.body.ok, true, JSON.stringify(ap.body));
  assert.equal(ap.body.pushed, 0);
  assert.equal(ap.body.pushError, "not-subscribed");
  assert.equal(ap.body.phoneCleared, true);
  // 취소 — 사유 없이는 안 됨
  assert.equal((await call(m, "ministrySetStatus", { id: bRow.id, status: "취소", expect: "신청완료" })).body.error, "cancel-note-required");
  assert.equal((await call(m, "ministrySetStatus", { id: bRow.id, status: "취소", expect: "신청완료", note: "시험 취소" })).body.ok, true);
  const after = (await call(m, "ministryList")).body.list.filter((x) => x.name === "ca-test-min");
  assert.equal(after.find((x) => x.id === bRow.id).note, "시험 취소");
  assert.equal(after.find((x) => x.id === bRow.id).phone, "");
  // 삭제
  const del = await call(m, "ministryDelete", { id: bRow.id });
  assert.equal(del.body.ok, true);
  assert.equal(del.body.deleted.name, "ca-test-min");
  assert.equal((await call(m, "ministryDelete", { id: bRow.id })).body.error, "not-found");
  const acts = (await call(people.super.token, "auditList", { limit: 20 })).body.rows.map((r) => r.action);
  assert.ok(acts.includes("ministry.status") && acts.includes("ministry.delete"), JSON.stringify(acts));
});

test("사역 화면의 교적 표시: 두 칸만 · 교적 값은 싣지 않는다 · 맞음/확인 필요/없음", async () => {
  const m = people.ministry.token;
  const list = await call(m, "ministryList");
  assert.equal(list.body.ok, true, JSON.stringify(list.body));
  const mine = list.body.list.filter((x) => x.name === "ca-test-min");
  assert.ok(mine.length >= 1);
  for (const x of mine) assert.deepEqual(x.church, { state: "맞음", reason: "" });

  const row = (name) => ({ gu: "시험", mok: "0", name, position: "집사", phone: "010-1234-5678", team: "없는팀-" + STAMP });
  const chk = await call(m, "ministryPaperCheck", { rows: [row(PAPER_NAME), row("ca-test-nobody-" + STAMP)] });
  assert.equal(chk.body.ok, true, JSON.stringify(chk.body));
  assert.deepEqual(chk.body.rows[0].church, { state: "확인 필요", reason: "소속 다름" });   // 명부는 시험-5목장, 전화가 같다
  assert.deepEqual(chk.body.rows[1].church, { state: "없음", reason: "" });

  // 교적 값이 새지 않는다 — 두 응답 모두. ① 명부에만 있는 글자(목장·주소·연락처2) ② 줄의 칸 이름 ③ church 는 두 칸만
  const marks = ["시험-0목장", "시험-5목장", "비밀주소", CHURCH_ONLY_PHONE, CHURCH_ONLY_PHONE.replace(/\D/g, "")];
  for (const [label, resp, rows] of [["신청 현황", list.body, list.body.list], ["종이 명단", chk.body, chk.body.rows]]) {
    const text = JSON.stringify(resp);
    for (const mk of marks) assert.ok(!text.includes(mk), `${label} 응답에 교적 값이 실렸다(표지 ${marks.indexOf(mk) + 1}번)`);
    for (const r of rows) {
      const extra = Object.keys(r).filter((k) => CHURCH_COLS.includes(k));
      assert.deepEqual(extra, [], `${label} 줄에 명부 칸이 더해졌다: ${extra.join(",")}`);
      if (r.church) assert.deepEqual(Object.keys(r.church).sort(), ["reason", "state"], label + " church 칸");
    }
  }
});

test("사역팀 정보: 목록 모양 · 설명 고치기(원래대로 되돌림) · 주일 끄면 시각 비움 · <script> 안 먹힘 · 차례(전체 ok·일부 오류) · 바뀐 기록", async () => {
  const m = people.ministry.token;

  // 목록 모양 — user_id 없음, 우리가 빌린 줄을 찾을 수 있다
  const list = await call(m, "ministryCatalogAdmin");
  assert.equal(list.body.ok, true, JSON.stringify(list.body));
  assert.ok(Number.isInteger(list.body.year));
  assert.equal(typeof list.body.period?.isOpen, "boolean");
  assert.ok(list.body.list.some((x) => x.id === catalogRow.id), "시험 줄을 목록에서 찾아야 한다");
  for (const x of list.body.list) assert.equal("user_id" in x, false);

  // 설명 고치기 → 원래 값으로(after() 의 안전망과 별개로, 되돌리기 자체도 이 액션으로 되는지 확인)
  const origDesc = catalogRow.desc_note ?? "";
  const s1 = await call(m, "ministryCatalogSave", { id: catalogRow.id, desc_note: "시험 설명 " + STAMP });
  assert.equal(s1.body.ok, true, JSON.stringify(s1.body));
  assert.equal(s1.body.desc, "시험 설명 " + STAMP);

  // <script> 는 저장되지 않는다(ministryHtml 이 허용 밖 태그를 지운다)
  const xss = await call(m, "ministryCatalogSave", { id: catalogRow.id, desc_note: "<script>alert(1)</script>안내" });
  assert.equal(xss.body.ok, true, JSON.stringify(xss.body));
  assert.ok(!xss.body.desc.toLowerCase().includes("<script"), xss.body.desc);
  assert.ok(!xss.body.desc.toLowerCase().includes("</script"), xss.body.desc);

  const restore = await call(m, "ministryCatalogSave", { id: catalogRow.id, desc_note: origDesc });
  assert.equal(restore.body.ok, true, JSON.stringify(restore.body));
  assert.equal(restore.body.desc, origDesc);

  // 없는 id → not-found
  assert.equal((await call(m, "ministryCatalogSave", { id: 0 })).body.error, "not-found");

  // 주일을 끈 채 시각을 보내면 시각이 비어 돌아온다
  const t = await call(m, "ministryCatalogSave", { id: catalogRow.id, day_sun: false, time_from: "09:00", time_to: "10:00" });
  assert.equal(t.body.ok, true, JSON.stringify(t.body));
  assert.equal(t.body.day.sun, false);
  assert.equal(t.body.from, "");
  assert.equal(t.body.to, "");

  // 주일을 켜고 시각을 저장한 뒤, day_sun 을 보내지 않는 저장(다른 칸만 고침)은 시각을 지우면 안 된다
  // — 서버가 이번 요청이 아니라 DB 에 있는 day_sun 값을 읽어 판단해야 한다.
  const dayOn = await call(m, "ministryCatalogSave", { id: catalogRow.id, day_sun: true, time_from: "09:00" });
  assert.equal(dayOn.body.ok, true, JSON.stringify(dayOn.body));
  assert.equal(dayOn.body.day.sun, true);
  assert.equal(dayOn.body.from, "09:00");
  const descOnly = await call(m, "ministryCatalogSave", { id: catalogRow.id, desc_note: "시험 설명(주일 유지) " + STAMP });
  assert.equal(descOnly.body.ok, true, JSON.stringify(descOnly.body));
  assert.equal(descOnly.body.from, "09:00", "day_sun 을 안 보내도 DB 값을 읽어 시각이 지켜져야 한다");
  const dayOff = await call(m, "ministryCatalogSave", { id: catalogRow.id, day_sun: false });
  assert.equal(dayOff.body.ok, true, JSON.stringify(dayOff.body));
  assert.equal(dayOff.body.day.sun, false);
  assert.equal(dayOff.body.from, "", "주일을 끄면 시각이 비어야 한다");

  // 「필요 인원」 칸도 80자에서 잘리고, truncated 목록에 그 이름이 떠야 한다
  const capSave = await call(m, "ministryCatalogSave", { id: catalogRow.id, capacity_note: "가".repeat(120) });
  assert.equal(capSave.body.ok, true, JSON.stringify(capSave.body));
  assert.ok(capSave.body.truncated.includes("필요 인원"), JSON.stringify(capSave.body.truncated));
  assert.ok(capSave.body.capacity.length <= 80, "capacity.length=" + capSave.body.capacity.length);

  // 차례 — 같은 위원회 전체를 원래 순서 그대로 보내면 ok, 자리 값이 바뀌지 않는다
  const ord = await call(m, "ministryCatalogOrder", { ids: catalogCommitteeIds });
  assert.equal(ord.body.ok, true, JSON.stringify(ord.body));
  assert.equal(ord.body.n, catalogCommitteeIds.length);
  const afterRows = await rest(`ministry_catalog?select=id,sort_order&year=eq.${list.body.year}&committee=eq.${encodeURIComponent(catalogCommittee)}&order=id`, "GET");
  const bySlot = new Map(afterRows.map((r) => [r.id, r.sort_order]));
  for (let i = 0; i < catalogCommitteeIds.length; i++) {
    assert.equal(bySlot.get(catalogCommitteeIds[i]), catalogCommitteeSlots[i],
      "자리 값이 바뀌면 안 된다(id=" + catalogCommitteeIds[i] + ")");
  }

  // 일부만 보내면 오류(자리를 빼앗기지 않게) — 아무것도 바뀌지 않는다
  const partial = await call(m, "ministryCatalogOrder", { ids: catalogCommitteeIds.slice(0, -1) });
  assert.equal(partial.body.ok, false);
  assert.match(partial.body.error, /개인데.*개만 왔습니다/);

  const acts = (await call(people.super.token, "auditList", { limit: 30 })).body.rows.map((r) => r.action);
  assert.ok(acts.includes("ministry.catalog"), JSON.stringify(acts));
  assert.ok(acts.includes("ministry.order"), JSON.stringify(acts));
});

test("종이 명단: 살펴보기는 안 만든다 · 넣기 → 저장·계정 생성 · 재업로드는 멱등 · 취소 사유 없음 · 없는 팀 · 4번째 줄 상한 · 결정줄 번호 비움 · 지명 팀 · 바뀐 기록", async () => {
  const m = people.ministry.token;
  const cfg = await rest("app_config?select=value&key=eq.ministry", "GET");
  const year = Number(cfg[0]?.value?.year) || 2027;
  const cat = await rest(`ministry_catalog?select=id,committee,team,kind&year=eq.${year}&order=id`, "GET");
  const normal = cat.filter((t) => t.kind !== "appoint");
  assert.ok(normal.length >= 4, "지명이 아닌 팀이 넷 이상 있어야 한다(종이 명단 시험)");
  const appointTeam = cat.find((t) => t.kind === "appoint") || null;

  const rowFor = (t, extra = {}) => ({
    gu: "시험", mok: "0", name: PAPER_NAME, position: "집사", phone: "010-1234-5678",
    committee: t.committee, team: t.team, ...extra,
  });

  // 1) 살펴보기 — 아무것도 안 만든다
  const chk1 = await call(m, "ministryPaperCheck", { rows: [rowFor(normal[0])] });
  assert.equal(chk1.body.ok, true, JSON.stringify(chk1.body));
  for (const r of chk1.body.rows) assert.equal("user_id" in r, false);
  assert.equal(chk1.body.okCount, 1, JSON.stringify(chk1.body));
  assert.equal(chk1.body.rows[0].error, "");
  const before1 = await rest(`users?select=id&name=eq.${encodeURIComponent(PAPER_NAME)}`, "GET");
  assert.equal(before1.length, 0, "살펴보기만으로 계정이 생기면 안 된다");

  // 2) 넣기 — 저장됨 · 계정 생김 · 결정 상태라 번호를 지우고 임명일을 찍는다
  const save1 = await call(m, "ministryPaperSave", { rows: [rowFor(normal[0])] });
  assert.equal(save1.body.ok, true, JSON.stringify(save1.body));
  for (const r of save1.body.rows) assert.equal("user_id" in r, false);
  assert.equal(save1.body.added, 1, JSON.stringify(save1.body));
  assert.equal(save1.body.rows[0].saved, true);
  const [u1] = await rest(`users?select=id,identity_key&name=eq.${encodeURIComponent(PAPER_NAME)}`, "GET");
  assert.ok(u1, "계정이 생겨야 한다");
  assert.equal(u1.identity_key, "교구|시험|0|||" + PAPER_NAME);
  const [order1] = await rest(`ministry_orders?select=id,status,phone,decided_at,team_id&user_id=eq.${u1.id}`, "GET");
  assert.equal(order1.status, "임명확정");
  assert.equal(order1.phone, null, "결정 상태 줄은 번호를 지운다");
  assert.ok(order1.decided_at, "결정 상태 줄은 임명일을 찍는다");
  assert.equal(order1.team_id, normal[0].id);

  // 3) 같은 명단 다시 넣기 — 모두 「그대로」(멱등)
  const save2 = await call(m, "ministryPaperSave", { rows: [rowFor(normal[0])] });
  assert.equal(save2.body.ok, true, JSON.stringify(save2.body));
  for (const r of save2.body.rows) assert.equal("user_id" in r, false);
  assert.equal(save2.body.added, 0, JSON.stringify(save2.body));
  assert.equal(save2.body.same, 1, JSON.stringify(save2.body));
  assert.equal(save2.body.rows[0].same, true);

  // 4) 취소 줄에 사유 없음 — 그 줄만 오류
  const chkCancel = await call(m, "ministryPaperCheck", { rows: [rowFor(normal[1], { status: "취소" })] });
  assert.equal(chkCancel.body.ok, true, JSON.stringify(chkCancel.body));
  for (const r of chkCancel.body.rows) assert.equal("user_id" in r, false);
  assert.equal(chkCancel.body.okCount, 0);
  assert.equal(chkCancel.body.rows[0].error, "취소 사유를 적어 주세요 (사유 칸)");

  // 5) 없는 팀 이름 — 그 줄만 오류
  const chkNoTeam = await call(m, "ministryPaperCheck",
    { rows: [{ gu: "시험", mok: "0", name: PAPER_NAME, position: "집사", phone: "010-1234-5678", team: "존재하지않는팀-" + STAMP }] });
  assert.equal(chkNoTeam.body.ok, true, JSON.stringify(chkNoTeam.body));
  for (const r of chkNoTeam.body.rows) assert.equal("user_id" in r, false);
  assert.equal(chkNoTeam.body.rows[0].error, "사역 목록에 없는 이름입니다");

  // 6) 한 사람 4줄(이미 저장된 1건 + 이번 3줄) — 넷째 줄(이번 배치의 셋째 줄)이 상한 오류
  //    계정이 이미 있어(2번) 상한 계산이 실제로 걸린다 — held=1(2번 저장분)+addedBy 로 1→2→3→초과
  const capRows = [normal[1], normal[2], normal[3]].map((t) => rowFor(t));
  const chkCap = await call(m, "ministryPaperCheck", { rows: capRows });
  assert.equal(chkCap.body.ok, true, JSON.stringify(chkCap.body));
  for (const r of chkCap.body.rows) assert.equal("user_id" in r, false);
  assert.equal(chkCap.body.rows[0].error, "", JSON.stringify(chkCap.body.rows[0]));
  assert.equal(chkCap.body.rows[1].error, "", JSON.stringify(chkCap.body.rows[1]));
  assert.equal(chkCap.body.rows[2].error, "이미 3건이라 3개를 넘습니다", JSON.stringify(chkCap.body.rows[2]));
  assert.equal(chkCap.body.okCount, 2);
  assert.equal(chkCap.body.badCount, 1);

  // 7) 지명 팀에는 「임명확정」 외 상태를 못 넣는다(개발 catalog 에 지명 팀이 있을 때만)
  if (appointTeam) {
    const chkAppoint = await call(m, "ministryPaperCheck", { rows: [rowFor(appointTeam, { status: "신청" })] });
    for (const r of chkAppoint.body.rows) assert.equal("user_id" in r, false);
    assert.equal(chkAppoint.body.rows[0].error, "지명으로 정해지는 자리입니다", JSON.stringify(chkAppoint.body.rows[0]));
  } else {
    console.log("종이 명단 시험: 개발 ministry_catalog 에 지명(kind='appoint') 팀이 없어 그 검증은 건너뜀");
  }

  // 8) 바뀐 기록 — ministry.paper 한 줄 이상
  const acts = (await call(people.super.token, "auditList", { limit: 30 })).body.rows.map((r) => r.action);
  assert.ok(acts.includes("ministry.paper"), JSON.stringify(acts));
});

test("교인명부: 찾기(이름·전화 뒷자리·사진 없음) · 한 분 · 현황 · 내려받기 · 사진 주소 · 열람 기록은 따로", async () => {
  const d = people.directory.token;
  const s = await call(d, "peopleSearch", { q: "ca-test-min" });
  assert.equal(s.body.ok, true, JSON.stringify(s.body));
  assert.equal(s.body.source.source_date, "2000-01-01");
  assert.equal(s.body.pageSize, 50);
  const row = s.body.rows.find((x) => x.person_id === 990000001);
  assert.ok(row, JSON.stringify(s.body));
  assert.deepEqual(Object.keys(row).sort(),
    ["age", "gender", "has_photo", "household_id", "household_rel", "kind2", "mok1", "mok3", "name", "person_id", "phone1",
     "photo", "position", "school_dept"]);
  assert.match(row.photo, /\/storage\/v1\/object\/sign\/church-people-photos\/990000001\.jpg\?token=/);
  assert.equal((await fetch(row.photo)).status, 200, "서명 주소로 사진이 열려야 한다");
  // 거르기 — 서버가 조건을 **붙이는 줄**(index.ts peopleFilter)을 지킨다. 한 줄이 빠지면 「빼야 할 분」이 나와 깨진다.
  //   세 분: 001(시험·장년·출석교인·집사·전화 0000·사진 있음) · 002(시험·빈칸·전화 1234-5678·사진 없음)
  //         003(시험B·청년·새신자·권사·전화 5555-0000·사진 있음). 이름은 모두 「ca-test」 로 걸린다.
  const ids = async (payload) => {
    const r = await call(d, "peopleSearch", payload);
    assert.equal(r.body.ok, true, JSON.stringify(r.body));
    return r.body.rows.map((x) => x.person_id).filter((id) => PEOPLE_IDS.includes(id)).sort();
  };
  assert.deepEqual(await ids({ q: "ca-test" }), [990000001, 990000002, 990000003], "세 분 모두 이름에 걸려야 한다");
  // 전화 줄이 빠지면 002(시험 · 0000 없음), 교구 줄이 빠지면 003(시험B · 0000 있음)이 나온다
  // 거르기 넷은 배열(여러 개 · 2026-09-29 체크박스). 문자열 하나(옛 화면)도 받는다.
  assert.deepEqual(await ids({ q: "0000", mok1: ["시험"] }), [990000001], "전화 뒷자리 + 교구");
  assert.deepEqual(await ids({ q: "ca-test", mok1: ["시험B"] }), [990000003], "교구");
  assert.deepEqual(await ids({ q: "ca-test", kind2: ["청년"] }), [990000003], "구분(kind2)");
  assert.deepEqual(await ids({ q: "ca-test", kind3: ["새신자"] }), [990000003], "출석(kind3)");
  assert.deepEqual(await ids({ q: "ca-test", position: ["권사"] }), [990000003], "직분");
  assert.deepEqual(await ids({ q: "ca-test", noPhoto: true }), [990000002], "사진 없는 분만");
  // 여러 값 — 한 거르기 안은 「또는」, 거르기끼리는 「그리고」
  assert.deepEqual(await ids({ q: "ca-test", mok1: ["시험", "시험B"] }), [990000001, 990000002, 990000003], "교구 둘");
  assert.deepEqual(await ids({ q: "ca-test", position: ["집사", "권사"] }), [990000001, 990000003], "직분 둘");
  assert.deepEqual(await ids({ q: "ca-test", mok1: ["시험", "시험B"], kind2: ["청년"] }), [990000003], "교구 둘 + 구분");
  assert.deepEqual(await ids({ q: "ca-test", mok1: [], kind2: [] }), [990000001, 990000002, 990000003], "빈 배열은 거르지 않는다");
  assert.deepEqual(await ids({ q: "ca-test", mok1: "시험B" }), [990000003], "문자열 하나(옛 화면)");
  assert.equal((await call(d, "peopleSearch", { mok1: ['시"험'] })).body.error, "invalid", "따옴표 든 값");
  assert.equal((await call(d, "peopleSearch", { mok1: Array.from({ length: 51 }, (_, i) => "v" + i) })).body.error, "invalid", "51개");
  // 정렬(2026-09-29 머리 누르기) — 세 분: 001(ca-test-min · 45세) · 002(ca-test-paper-… · 나이 모름) · 003(ca-test-dir-… · 30세)
  //   차례를 그대로 본다(sort 하지 않는다). 나이 모르는 분은 오름·내림 모두 맨 뒤.
  const T = { q: "ca-test", mok1: ["시험", "시험B"] };
  const order = async (payload, act = "peopleSearch") => {
    const r = await call(d, act, payload);
    assert.equal(r.body.ok, true, JSON.stringify(r.body));
    return r.body.rows.map((x) => x.person_id).filter((id) => PEOPLE_IDS.includes(id));
  };
  assert.deepEqual(await order({ ...T, sort: "age", dir: "desc" }), [990000001, 990000003, 990000002], "나이 내림 — 모름은 맨 뒤");
  // ⚠️ 「나이 오름」 [003,001,002] 은 기본(이름 오름) 차례와 같아 이것만으로는 나이 정렬을 증명하지 못한다 —
  //   나이 정렬과 「모름은 맨 뒤(nullsFirst:false)」를 못 박는 것은 위의 「나이 내림」이다. 이 줄은 오름에서도 모름이 뒤인지만 본다.
  assert.deepEqual(await order({ ...T, sort: "age", dir: "asc" }), [990000003, 990000001, 990000002], "나이 오름 — 모름은 그래도 맨 뒤");
  // 소속 — 교구(시험 < 시험B) > 목장(시험-0 < 시험-5). 내림은 정확히 거꾸로
  assert.deepEqual(await order({ ...T, sort: "aff" }), [990000001, 990000002, 990000003], "소속 오름");
  assert.deepEqual(await order({ ...T, sort: "aff", dir: "desc" }), [990000003, 990000002, 990000001], "소속 내림");
  // 구분 — 002 는 구분이 빈 칸('' · 칸이 not null default '' 라 null 이 아니다) → 오름 맨 앞 · 내림 맨 뒤(people-query.ts sortOrder 주석)
  assert.deepEqual(await order({ ...T, sort: "kind2" }), [990000002, 990000001, 990000003], "구분 오름 — 빈 칸이 맨 앞");
  assert.deepEqual(await order({ ...T, sort: "kind2", dir: "desc" }), [990000003, 990000001, 990000002], "구분 내림 — 빈 칸이 맨 뒤");
  assert.deepEqual(await order({ ...T, sort: "name", dir: "desc" }), [990000002, 990000001, 990000003], "이름 내림");
  assert.deepEqual(await order({ ...T }), [990000003, 990000001, 990000002], "기본 — 이름 오름");
  assert.deepEqual(await order({ ...T, sort: "age", dir: "desc" }, "peopleExport"), [990000001, 990000003, 990000002], "내려받기도 같은 차례");
  assert.deepEqual(await order({ ...T, sort: "name", dir: "desc" }, "peopleExport"), [990000002, 990000001, 990000003], "내려받기 이름 내림");
  assert.equal((await call(d, "peopleSearch", { ...T, sort: "phone1" })).body.error, "invalid", "모르는 정렬");
  assert.equal((await call(d, "peopleExport", { ...T, dir: "up" })).body.error, "invalid", "모르는 방향(내려받기)");
  const sortLog = (await call(people.super.token, "auditList", { limit: 20, kind: "people" })).body.rows
    .find((r) => r.action === "people.search" && r.detail?.filters?.sort === "age");
  assert.deepEqual(sortLog?.detail?.filters, { mok1: ["시험", "시험B"], sort: "age", dir: "asc" }, JSON.stringify(sortLog));
  // 열람 기록 — 배열이 그대로 남는다
  const logged = (await call(people.super.token, "auditList", { limit: 20, kind: "people" })).body.rows
    .find((r) => r.action === "people.search" && r.detail?.q === "ca-test" && r.detail?.filters?.kind2);
  assert.deepEqual(logged?.detail?.filters, { mok1: ["시험", "시험B"], kind2: ["청년"] }, JSON.stringify(logged));
  assert.equal((await call(d, "peopleSearch", { page: -1 })).body.error, "invalid");
  // 끝을 넘은 쪽 — 빈 쪽이지만 전체 수는 진짜 수(0 이 아니다)
  const over = await call(d, "peopleSearch", { q: "ca-test-min", page: 5 });
  assert.equal(over.body.ok, true, JSON.stringify(over.body));
  assert.deepEqual(over.body.rows, []);
  assert.equal(over.body.total, 1);
  // 가족 보기 — 세대주 교인ID 로 한 가족만
  const fam = await call(d, "peopleSearch", { household: 990000001 });
  assert.deepEqual(fam.body.rows.map((x) => x.person_id).sort(), [990000001, 990000002]);
  assert.equal((await call(d, "peopleSearch", { household: "x" })).body.error, "invalid");

  const one = await call(d, "peoplePerson", { id: 990000001 });
  assert.equal(one.body.ok, true, JSON.stringify(one.body));
  assert.equal(one.body.person.address, "시험시 비밀주소 " + STAMP);
  assert.equal(one.body.person.household_id, 990000001);
  assert.deepEqual(one.body.family.map((f) => f.person_id), [990000002]);          // 자기는 빼고
  assert.deepEqual(Object.keys(one.body.family[0]).sort(), ["age", "gender", "household_rel", "name", "person_id", "position"]);
  for (const k of ["name_key", "phone_digits", "photo_hash", "birth_date", "registered_date", "updated_at"]) {
    assert.equal(k in one.body.person, false, "내부 칸이 나갔다: " + k);
  }
  assert.equal((await call(d, "peoplePerson", { id: 1 })).body.error, "not-found");

  const st = await call(d, "peopleStats");
  assert.equal(st.body.ok, true, JSON.stringify(st.body));
  assert.ok(st.body.stats.total >= 2);
  assert.ok(st.body.stats.households >= 1);
  assert.ok(st.body.stats.options.mok1.includes("시험"));

  const ex = await call(d, "peopleExport", { q: "ca-test-min" });
  assert.deepEqual(ex.body.rows.map((x) => x.person_id), [990000001]);
  // 내려받기도 배열 거르기 — 받은 명단과 기록에 여러 값이 그대로
  const ex2 = await call(d, "peopleExport", { q: "ca-test", position: ["집사", "권사"] });
  assert.deepEqual(ex2.body.rows.map((x) => x.person_id).filter((id) => PEOPLE_IDS.includes(id)).sort(), [990000001, 990000003]);
  const exLog = (await call(people.super.token, "auditList", { limit: 10, kind: "people" })).body.rows
    .find((r) => r.action === "people.export" && r.detail?.q === "ca-test");
  assert.deepEqual(exLog?.detail?.filters, { position: ["집사", "권사"] }, JSON.stringify(exLog));

  const logs = (await call(people.super.token, "auditList", { limit: 40, kind: "people" })).body.rows.map((r) => r.action);
  for (const a of ["people.search", "people.view", "people.export"]) assert.ok(logs.includes(a), a + " " + JSON.stringify(logs));
  const changes = (await call(people.super.token, "auditList", { limit: 100 })).body.rows.map((r) => r.action);
  assert.ok(!changes.some((a) => a.startsWith("people.")), "바꾼 기록 기본 보기에 열람이 섞였다");
});

test("교인명부 표·사진은 공개 키·로그인 사용자 모두 못 연다", async () => {
  for (const t of ["church_people", "church_people_imports"]) {
    const a = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON } });
    assert.notEqual(a.status, 200, "공개 키로 열림: " + t);
    const b = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`,
      { headers: { apikey: ANON, Authorization: "Bearer " + people.super.token } });
    assert.notEqual(b.status, 200, "로그인 사용자로 열림: " + t);
  }
  const pub = await fetch(`${URL_}/storage/v1/object/public/${PHOTO_PATH}`);
  assert.notEqual(pub.status, 200, "공개 주소로 사진이 열림");
  const au = await fetch(`${URL_}/storage/v1/object/authenticated/${PHOTO_PATH}`,
    { headers: { apikey: ANON, Authorization: "Bearer " + people.super.token } });
  assert.notEqual(au.status, 200, "로그인 사용자로 사진이 열림");
  const sign = await fetch(`${URL_}/storage/v1/object/sign/${PHOTO_PATH}`, { method: "POST",
    headers: { apikey: ANON, Authorization: "Bearer " + people.super.token, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }) });
  assert.notEqual(sign.status, 200, "로그인 사용자가 서명 주소를 만듦");
});

// ---------- 성경필사(암송) — 읽기 넷(Task 5) ----------
// 개수를 DB 에서 직접 센다(서비스 키 · 행은 한 줄만) — 서버의 head 개수와 맞댄다
async function dbCount(eventId) {
  const r = await fetch(`${URL_}/rest/v1/event_signups?select=id&limit=1&event_id=eq.${encodeURIComponent(eventId)}`,
    { headers: { ...svc, Prefer: "count=exact" } });
  assert.ok(r.ok, "개수 세기 실패 " + r.status);
  return Number((r.headers.get("content-range") || "").split("/")[1]);
}

test("성경필사(암송) 회차 목록: 역할 이름 · 칸 · 인원(head) · 성도님께 보임 · 자격 회차 · 최근 먼저", async () => {
  const be = people.bibleevent.token;
  const me = await call(be, "me");
  assert.deepEqual(me.body.roles, ["bibleevent"]);
  assert.equal(me.body.roles_info[0].label, "성경필사(암송)");

  const r = await call(be, "evEvents");
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.match(r.body.today, /^\d{4}-\d{2}-\d{2}$/);
  for (const e of r.body.events) assert.deepEqual(Object.keys(e).sort(), EV_OUT_KEYS, e.id);
  const closes = r.body.events.map((e) => e.closes_on);
  assert.deepEqual(closes, [...closes].sort().reverse(), "마감일 늦은 회차가 먼저");
  const mine = r.body.events.find((e) => e.id === EV_ID);
  const el = r.body.events.find((e) => e.id === EV_EL_ID);
  assert.ok(mine && el, "시험 회차 둘이 목록에 있어야 한다");
  assert.equal(mine.count, 5);
  assert.equal(el.count, 1);
  assert.equal(mine.status, "draft");
  assert.equal(mine.listedNow, false, "draft 는 성도님께 안 보인다");
  assert.equal(mine.hasEligibility, false);
  assert.equal(el.hasEligibility, true, "needs.eligibility 가 객체면 자격 회차(isEligEvent)");
  assert.equal(mine.list_until, null);
  assert.equal(mine.kind, "signup");
  assert.equal(mine.title, "ca-test 회차 " + STAMP);
  assert.equal(typeof mine.updated_at, "string");
  assert.ok(mine.updated_at.length > 0);
  // 인원은 회차마다 DB 개수와 같다(행을 받아 세면 1,000에서 잘린다)
  for (const e of r.body.events) assert.equal(e.count, await dbCount(e.id), "인원이 DB 와 다르다: " + e.id);
});

test("성경필사(암송) 명단: 줄 칸 · 교적 표시 세 가지 · 앱 줄 표시 · id 차례 · 없는 회차", async () => {
  const be = people.bibleevent.token;
  const r = await call(be, "evRoster", { event_id: EV_ID });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body).sort(), ["event", "ok", "rows", "source"]);
  assert.deepEqual(Object.keys(r.body.event).sort(), EV_OUT_KEYS);
  assert.equal(r.body.event.id, EV_ID);
  assert.equal(r.body.event.count, 5);
  assert.deepEqual(r.body.source, { date: PEOPLE_SOURCE_DATE, total: 3 });   // before() 가 올린 시험 명부 기록
  assert.equal(r.body.rows.length, 5);
  for (const x of r.body.rows) assert.deepEqual(Object.keys(x).sort(), ROW_OUT_KEYS);
  const ids = r.body.rows.map((x) => x.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b), "줄은 id 차례");
  const by = (name, type = "교구") => r.body.rows.find((x) => x.name === name && x.who_type === type);
  assert.deepEqual(by("ca-test-min").church, { state: "맞음", reason: "" });
  assert.deepEqual(by(DIR_NAME).church, { state: "확인 필요", reason: "같은 이름 1명" });
  assert.deepEqual(by(EV_NAME).church, { state: "없음", reason: "" });
  assert.deepEqual(by(EV_NAME, "교회학교").church, { state: "없음", reason: "" });
  const min = by("ca-test-min");
  assert.deepEqual([min.group, min.sub, min.position, min.note, min.source, min.hasUser],
    ["시험", "0", "집사", "담당자가 더함", "import", false]);
  assert.match(min.at, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(typeof min.updated_at, "string");
  const cy = by(EV_NAME, "교회학교");
  assert.deepEqual([cy.group, cy.sub], ["청년부", ""]);
  const app = by(EV_APP_NAME);
  assert.deepEqual([app.source, app.hasUser, app.note], ["app", true, ""]);

  const el = await call(be, "evRoster", { event_id: EV_EL_ID });
  assert.equal(el.body.event.hasEligibility, true);
  assert.deepEqual(el.body.rows.map((x) => [x.name, x.note]), [[EV_NAME, "명단 올리기"]]);

  for (const bad of [{ event_id: "ca-test-none-" + STAMP }, { event_id: "BAD ID" }, {}]) {
    assert.equal((await call(be, "evRoster", bad)).body.error, "not-found", JSON.stringify(bad));
  }
});

test("성경필사(암송) 사람별 이력: 같은 소속은 한 묶음 · 다른 소속은 따로 · 최근 먼저 · 띄어쓰기 달라도 찾음 · 틀린 이름", async () => {
  const be = people.bibleevent.token;
  const h = await call(be, "evHistory", { name: EV_NAME });
  assert.equal(h.body.ok, true, JSON.stringify(h.body));
  assert.equal(h.body.groups.length, 2, JSON.stringify(h.body.groups));
  const [g1, g2] = h.body.groups;
  for (const g of h.body.groups) {
    assert.deepEqual(Object.keys(g).sort(), ["label", "n", "rows"]);
    for (const x of g.rows) assert.deepEqual(Object.keys(x).sort(), HIST_ROW_KEYS);
  }
  assert.deepEqual([g1.n, g2.n], [1, 2]);
  assert.deepEqual(g1.rows.map((x) => x.event_id), [EV_EL_ID, EV_ID], "2월 마감 회차가 먼저 · 교구 두 줄은 한 묶음");
  assert.deepEqual(g2.rows.map((x) => [x.event_id, x.who_type, x.group, x.sub]), [[EV_ID, "교회학교", "청년부", ""]]);
  // 이름표 = 「이름 · 소속」(CONTRACT 5절 — 교구는 숫자 목장에만 「목장」)
  assert.equal(g1.label, EV_NAME + " · 시험 7목장");
  assert.equal(g2.label, EV_NAME + " · 청년부");
  assert.deepEqual([g1.rows[0].title, g1.rows[0].closes_on, g1.rows[0].source, g1.rows[0].hasUser],
    ["ca-test 자격 회차 " + STAMP, "2000-02-28", "import", false]);

  const a = await call(be, "evHistory", { name: EV_APP_NAME });
  assert.equal(a.body.groups.length, 1);
  assert.deepEqual([a.body.groups[0].rows[0].source, a.body.groups[0].rows[0].hasUser], ["app", true]);

  // 이름은 NFC·띄어쓰기 없음으로 맞댄다 — 가운데 빈칸·앞뒤 빈칸이 있어도 같은 분
  assert.equal((await call(be, "evHistory", { name: "  ca-test-ev- " + STAMP + " " })).body.groups.length, 2);

  assert.equal((await call(be, "evHistory", { name: "" })).body.error, "no-name");
  assert.equal((await call(be, "evHistory", {})).body.error, "no-name");
  assert.equal((await call(be, "evHistory", { name: 'ca"test' })).body.error, "bad-char");
  assert.equal((await call(be, "evHistory", { name: "가".repeat(41) })).body.error, "too-long");
  assert.deepEqual((await call(be, "evHistory", { name: "ca-test-없는분-" + STAMP })).body, { ok: true, groups: [] });
});

test("성경필사(암송) 통계: 회차별 인원 · 교구(부서)×회차 · 여러 번 참여(이름·소속 따로) · 빈 배열은 전부 · 틀린 회차 id", async () => {
  const be = people.bibleevent.token;
  const s = await call(be, "evStats", { event_ids: [EV_ID, EV_EL_ID] });
  assert.equal(s.body.ok, true, JSON.stringify(s.body));
  assert.deepEqual(Object.fromEntries(s.body.perEvent.map((x) => [x.id, x.count])), { [EV_ID]: 5, [EV_EL_ID]: 1 });
  const gu = s.body.byGroup.find((g) => g.who_type === "교구" && g.group_name === "시험");
  const cy = s.body.byGroup.find((g) => g.who_type === "교회학교" && g.group_name === "청년부");
  assert.ok(gu && cy, JSON.stringify(s.body.byGroup));
  assert.equal(gu.counts[EV_ID] ?? 0, 4);
  assert.equal(gu.counts[EV_EL_ID] ?? 0, 1);
  assert.equal(cy.counts[EV_ID] ?? 0, 1);
  assert.equal(cy.counts[EV_EL_ID] ?? 0, 0);
  for (const g of s.body.byGroup) for (const v of Object.values(g.counts)) assert.equal(typeof v, "number");
  assert.deepEqual(s.body.repeaters, [], "두 회차뿐이라 3회 이상인 분이 없다");

  // 셋째 회차를 잠깐 더해 같은 분(교구 시험 7)을 세 번으로 — 여러 번 참여 한 줄의 모양(CONTRACT 5절)
  const REP_ID = "ca-test-rep-" + STAMP;
  await rest("events", "POST", { id: REP_ID, title: "ca-test 셋째 회차 " + STAMP, short_title: "", subtitle: "", season: "",
    kind: "signup", status: "draft", list_until: null, opens_on: "2000-04-01", closes_on: "2000-04-30", needs: {} });
  try {
    await rest("event_signups", "POST", { event_id: REP_ID, user_id: null, source: "import", who_type: "교구",
      group_name: "시험", sub_name: "7", name: EV_NAME, ident_key: `교구|시험|7|||${EV_NAME}`, position: "", note: "" });
    const s3 = await call(be, "evStats", { event_ids: [EV_ID, EV_EL_ID, REP_ID] });
    assert.equal(s3.body.ok, true, JSON.stringify(s3.body));
    assert.equal(s3.body.repeaters.length, 1, JSON.stringify(s3.body.repeaters));
    const rep = s3.body.repeaters[0];
    assert.deepEqual(Object.keys(rep).sort(), ["events", "label", "n", "name", "times"]);
    assert.equal(rep.name, EV_NAME);
    assert.equal(rep.label, "시험 7목장", "이름표는 소속만(이름은 name 칸에)");
    assert.equal(rep.times, 3);
    assert.deepEqual([...rep.events].sort(), [EV_ID, EV_EL_ID, REP_ID].sort());
    assert.ok(Number.isInteger(rep.n) && rep.n >= 1);
    // 사람별 이력의 묶음 이름표와 같은 모양 — 두 화면이 같은 분을 같은 글자로 부른다
    const h = await call(be, "evHistory", { name: EV_NAME });
    assert.equal(h.body.groups[0].label, rep.name + " · " + rep.label);
  } finally {
    await rest(`events?id=eq.${REP_ID}`, "DELETE");   // 줄은 CASCADE — 뒤 시험(누출·Task 6~8)이 이 회차를 보지 않게
  }

  const all = await call(be, "evStats", { event_ids: [] });
  assert.equal(all.body.ok, true, JSON.stringify(all.body));
  assert.ok(all.body.perEvent.some((x) => x.id === EV_ID && x.count === 5), "빈 배열이면 모든 회차");
  assert.ok(all.body.perEvent.some((x) => x.id === EV_EL_ID), "빈 배열이면 모든 회차");

  const none = await call(be, "evStats", { event_ids: ["ca-test-none-" + STAMP] });
  assert.equal(none.body.ok, true, JSON.stringify(none.body));
  assert.deepEqual(none.body.perEvent, []);

  assert.equal((await call(be, "evStats", {})).body.error, "bad-event-id");
  assert.equal((await call(be, "evStats", { event_ids: "x" })).body.error, "bad-event-id");
  assert.equal((await call(be, "evStats", { event_ids: ["BAD ID"] })).body.error, "bad-event-id");
});

test("성경필사(암송) 1,000행 넘는 회차: 명단·인원·통계가 잘리지 않는다(쪽 나누기 · head 개수)", async () => {
  const be = people.bibleevent.token;
  const BIG_ID = "ca-test-big-" + STAMP, N = 1001;   // 지우기는 after() 가 한다(줄은 CASCADE)
  await rest("events", "POST", { id: BIG_ID, title: "ca-test 큰 회차 " + STAMP, short_title: "", subtitle: "", season: "",
    kind: "signup", status: "draft", list_until: null, opens_on: "2000-03-01", closes_on: "2000-03-31", needs: {} });
  await rest("event_signups", "POST", Array.from({ length: N }, (_, i) => ({
    event_id: BIG_ID, user_id: null, source: "import", who_type: "교구", group_name: "시험", sub_name: String(i % 50),
    name: "ca-test-big-" + i, ident_key: `교구|시험|${i % 50}|||ca-test-big-${i}`, position: "", note: "" })));
  const r = await call(be, "evRoster", { event_id: BIG_ID });
  assert.equal(r.body.ok, true, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.rows.length, N, "명단이 1,000에서 잘렸다");
  assert.equal(new Set(r.body.rows.map((x) => x.id)).size, N, "쪽을 넘기며 같은 줄이 두 번 들어왔다");
  assert.equal(r.body.event.count, N);
  assert.equal((await call(be, "evEvents")).body.events.find((e) => e.id === BIG_ID).count, N);
  const s = await call(be, "evStats", { event_ids: [BIG_ID] });
  assert.deepEqual(s.body.perEvent.map((x) => [x.id, x.count]), [[BIG_ID, N]]);
});

test("성경필사(암송) 누출: 응답 어디에도 UUID 꼴 값·user_id·신원 키·성도님 전화·메모·답·교적 값이 없다", async () => {
  const be = people.bibleevent.token;
  const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const FORBIDDEN = ["user_id", "auth_user_id", "ident_key", "answers", "phone", "memo", "person_id"];
  // 응답 전체의 칸 이름(깊이 상관없이). counts 의 열쇠는 회차 id(값은 수)라 칸 이름으로 모으지 않는다.
  const keysOf = (v, out = []) => {
    if (Array.isArray(v)) { for (const x of v) keysOf(x, out); }
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) { out.push(k); if (k !== "counts") keysOf(x, out); }
    }
    return out;
  };
  // ① 앱 줄에만 있는 값 ② 시험 계정 id ③ 신원 키 꼴 ④ 명부에만 있는 값(목장 원문·주소·연락처2)
  const marks = [EV_PHONE, EV_PHONE.replace(/\D/g, ""), EV_MEMO, EV_ANSWER, evTestUserId, "교구|시험|",
    "시험-0목장", "시험B-1목장", "비밀주소", CHURCH_ONLY_PHONE, CHURCH_ONLY_PHONE.replace(/\D/g, "")];
  const resps = [
    ["evEvents", await call(be, "evEvents")],
    ["evRoster", await call(be, "evRoster", { event_id: EV_ID })],
    ["evRoster 자격", await call(be, "evRoster", { event_id: EV_EL_ID })],
    ["evHistory 앱 줄", await call(be, "evHistory", { name: EV_APP_NAME })],
    ["evHistory", await call(be, "evHistory", { name: EV_NAME })],
    ["evStats", await call(be, "evStats", { event_ids: [EV_ID, EV_EL_ID] })],
    ["evStats 전부", await call(be, "evStats", { event_ids: [] })],
  ];
  for (const [label, r] of resps) {
    assert.equal(r.body.ok, true, label + " " + JSON.stringify(r.body));
    const text = JSON.stringify(r.body);
    assert.ok(!UUID_ANY.test(text), label + " 응답에 UUID 꼴 값이 있다: " + (text.match(UUID_ANY) || [""])[0]);
    for (const mk of marks) assert.ok(!text.includes(mk), `${label} 응답에 감출 값이 실렸다(표지 ${marks.indexOf(mk) + 1}번)`);
    const bad = keysOf(r.body).filter((k) => FORBIDDEN.includes(k) || CHURCH_COLS.includes(k));
    assert.deepEqual(bad, [], label + " 응답에 감출 칸이 있다: " + bad.join(","));
  }
});
