// 개발 서버에 대고 도는 시험 — 네트워크와 개발 비밀 키가 필요해 preflight 에는 넣지 않는다(이름의 .dev.).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/server.dev.test.mjs
// 시험용 사람은 이메일 로그인으로 만들고(ca-test-…@example.test) 끝나면 지운다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ACTION_ROLES, knownRoles } from "../supabase/functions/church-admin/authz.ts";
import { HISTORY_UNMATCHED_YET } from "../supabase/functions/church-admin/history-db.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const ZERO = "00000000-0000-0000-0000-000000000000";
// UUID 꼴 값(user_id·auth id 등) — 이 파일의 누출 시험이 모두 이것 하나를 쓴다. g 깃발 없이(.test 가 lastIndex 상태를 갖지 않게).
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
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
// 성경필사 줄 시험(계획 Task 7) — 시험 회차 둘(draft · 2000-04·05) + 앱 계정 여섯. 이름에 모두 STAMP.
//   회차는 Task 5 after() 의 「성경필사 시험 회차」 단계가 ca-test-* 로 지운다(줄은 CASCADE).
//   계정(이름이 ca-test-rx 로 시작)은 아래 after() 줄이 지운다 — 그 계정의 줄·별칭(user_identity_aliases)은 CASCADE.
const RX = { ev: "ca-test-row-" + STAMP, evEl: "ca-test-rowel-" + STAMP, users: [], rowIds: [] };
const rxName = (tag) => `ca-test-rx${tag}-${STAMP}`;
const RX_SECRET = ["user_id", "auth_user_id", "ident_key", "answers", "phone", "memo", "person_id"];
let rxReady = null;
// 성경필사 명단 올리기·교인명부 찾기 시험(계획 Task 8) — draft 회차 하나(2000-06) · 앱 계정 셋 · 그 회차의 앱 줄 하나 · 교인명부 25분.
//   회차는 Task 5 after() 의 「성경필사 시험 회차」 단계가 ca-test-*<STAMP>* 로 지운다(줄은 CASCADE). 계정·교인명부 줄은 아래 after() 줄이.
//   교인명부 시험 줄은 교인ID 990000011~ 고정(990000001~3 은 교인명부 시험 것). 이름은 모두 ca-test-up-<STAMP>-<한 글자> — 지어낸 글자다.
//   ⚠️ 이름 끝이 숫자면 올리기 다듬기가 떼어 버린다 — 시험 이름은 한글 한 글자로 끝낸다(upName).
const UP = { ev: "ca-test-up-" + STAMP, uid: {} };
const upName = (k) => `ca-test-up-${STAMP}-${k}`;
//   교적 목장 칸(church_mok · 2026-09-30 친구 요청) 시험 네 분은 990000015~18 — 남(두 분 · 소망-남성1·소망-남성2) · 학(아이 · 중등부) · 청(청년부).
const UP_CM_IDS = [990000015, 990000016, 990000017, 990000018];
const UP_DIR_IDS = [990000011, 990000012, 990000013, 990000014, ...UP_CM_IDS, ...Array.from({ length: 21 }, (_, k) => 990000021 + k)];
const UP_OUT_KEYS = ["error", "i", "mark", "notes", "row"];
const UP_ROW_KEYS = ["group", "name", "position", "sub", "who_type"];
// 한 분 더하기 찾기(evPeopleLookup) 후보만 — 다섯 칸 + 교적 목장 칸 그대로(church_mok). evPerson·빈칸 채우기는 UP_ROW_KEYS 그대로.
const UP_CAND_KEYS = ["church_mok", ...UP_ROW_KEYS].sort();
let upReady = null;
// 사역신청·담당자 이름을 누르면(ministryPerson · 2026-09-30 검토 6) — 교인명부 같은 이름 세 분(교인ID 990000051~3 고정 ·
//   이름 ca-test-mp-<STAMP>-가 · 번호·주소는 지어낸 것). 첫 시험이 한 번 만든다(mpFixtures) · after() 가 지운다.
//   번호는 글자로 적지 않고 만든다(mpPhone) — 명단 검사(tools/leak-scan.mjs)가 이 파일의 번호 수를 센다.
const MP = { name: `ca-test-mp-${STAMP}-가`, ids: [990000051, 990000052, 990000053] };
const mpPhone = (n) => "010-0000-00" + n;
let mpReady = null;
// 교인명부 잇기(2026-10-01 · people_links) — 교인명부 세 분(교인ID 990000061~3 고정 · 이름 ca-test-pl-<STAMP>-가 둘 · -나 하나) ·
//   신청 넷(user_id = 신청마다 만든 시험 users 「ca-test-pl-<STAMP>-o1…o4」의 uuid) · 성경필사 회차 하나(archived — 초안은 잇지 않는다)와 줄 셋.
//   ⚠️ 신청의 user_id 에 글자를 넣지 않는다 — 칸은 text 라 들어가지만 신청 현황(ministryList)이 그 해 신청 줄 전부의 user_id 로
//      push_subscriptions(user_id uuid)를 물어 22P02 → 500(개발 DB 한 벌 — 모든 세션의 신청 현황이 깨진다). 기존 minTestUserId 와 같은 꼴.
//   첫 시험이 한 번 만든다(plFixtures) · after() 가 지운다(신청 → users 차례). 번호는 만든다(plPhone).
const PL = { a: `ca-test-pl-${STAMP}-가`, b: `ca-test-pl-${STAMP}-나`, ids: [990000061, 990000062, 990000063],
  ev: "ca-test-pl-" + STAMP, orders: {}, signups: {} };
const plPhone = (n) => "010-0000-01" + n;
let plReady = null;
const RUN_START = new Date().toISOString();   // 이번 실행이 만든 잇기 줄 찌꺼기 쓸기(after)
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
  "list_until", "updated_at", "count", "listedNow", "hasEligibility", "sort_order"].sort();
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
  // 시험 참여자(2026-09-30) — 없는 이름 찾기 · 없는 키 빼기(명단에 없으면 쓰지도 기록하지도 않는다)
  ministryTesters: {},
  ministryTesterFind: { name: "ca-test-probe-없음" },
  ministryTesterSave: { op: "remove", key: "ca-test-probe-없음" },
  // 이름을 누르면 교적 창(사역신청·담당자 · 2026-09-30) — 빈 이름 → no-name(명부에 묻지도 기록하지도 않는다)
  ministryPerson: { name: "" },
  // 결정된 신청 번호 지우기(2026-10-01) — 보낸 수가 지금 수와 달라(-1) conflict · 아무것도 안 지운다
  ministryPhoneClear: { count: -1 },
  // 「📮 정정 신청」(2026-10-01) — 목록은 읽기만 · 처리는 id 0 → bad-id(쓰지도 기록하지도 않는다)
  historyRequestList: { status: "open" },
  historyRequestSet: { id: 0, status: "확인 중", expect: "x" },
  peopleSearch: { q: "ca-test-probe-없음" },
  peoplePerson: { id: 0 },
  peopleStats: {},
  peopleExport: { q: "ca-test-probe-없음" },
  // 「자세히」 창 탭(2026-10-01) — 없는 교인 → not-found · 줄 0 → invalid(둘 다 읽지도 쓰지도 기록하지도 않는다)
  peopleHistory: { id: 0 },
  peopleLink: { kind: "order", row: 0, person: 0, how: "manual" },
  // 성경필사(암송)(Task 5) — 읽기만. 없는 회차·없는 이름을 가리킨다
  evEvents: {},
  evRoster: { event_id: "ca-test-probe-none" },
  evHistory: { name: "ca-test-probe-없음" },
  evStats: { event_ids: ["ca-test-probe-none"] },
  // 성경필사(암송) — 회차 만들기·설정(Task 6). 만들기는 **틀린 id** 로 검사(bad-event-id)에서 떨어져 아무것도 만들지 않는다.
  evEventCreate: { event: { id: "Bad ID!" } },
  evEventSave: { event_id: "ca-test-probe-none", expect: "", patch: {} },   // 없는 회차 → not-found
  evRowAdd: { event_id: "ca-test-probe-none", row: {} },
  evRowSave: { id: 0, expect: "", patch: {} },
  evRowDelete: { id: 0, expect: "" },
  // 성경필사 명단 올리기·교인명부 찾기(Task 8) — 없는 회차 → not-found · 빈 이름 → no-name(둘 다 쓰지도 기록하지도 않는다)
  evUploadCheck: { event_id: "ca-test-probe-none", rows: [], fill: false },
  evUploadSave: { event_id: "ca-test-probe-none", rows: [], fill: false },
  evPeopleLookup: { name: "" },
  // 이름을 누르면 교적 창(Task 16) — 빈 이름 → no-name(명부에 묻지도 기록하지도 않는다)
  evPerson: { name: "" },
  // 교인명부 기록 잇기 맞추기(2026-10-01) — apply 없이 부르면 세기만 한다(쓰지도 기록하지도 않는다)
  peopleLinkSync: {},
  // 사역 이력(2026-10-01) — 읽기 · 빈 올리기 · 없는 줄(0) · 확인 없는 다시 맞추기 · 없는 해 내려받기 — 아무것도 쓰지도 기록하지도 않는다
  historyList: {},
  historyUploadCheck: { rows: [] },
  historyUploadSave: { rows: [] },
  historyRowAdd: { row: {} },
  historyRowSave: { id: 0, expect: "", patch: {} },
  historyRowDelete: { id: 0, expect: "" },
  historyCandidates: { id: 0 },
  historyLink: { id: 0, op: "none" },
  historyRematch: {},
  historyExport: { years: [1951] },
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
  // 성경필사 줄 시험(Task 7) — 시험 계정. 그 계정의 줄·별칭은 CASCADE. 시험 회차는 Task 5 단계가 ca-test-* 로 지운다.
  for (const id of RX.users) await step("줄 시험 계정 " + id, () => rest(`users?id=eq.${id}`, "DELETE"));
  await step("줄 시험 계정 남음", async () => {
    const left = await rest(`users?select=id&name=like.ca-test-rx*-${STAMP}`, "GET");   // 이번 실행 것만(다른 세션 실행은 건드리지 않는다)
    assert.equal(left.length, 0, "줄 시험 계정이 남았다: " + left.length + "명");
  });
  // 성경필사 명단 올리기 시험(Task 8) — 교인명부 시험 줄 · 시험 계정 셋(올리기는 계정을 만들지 않는다).
  //   시험 회차는 Task 5 단계가 ca-test-*<STAMP>* 로 지운다(줄은 CASCADE).
  await step("올리기 시험 교인명부", () => rest(`church_people?person_id=in.(${UP_DIR_IDS.join(",")})`, "DELETE"));
  // 사역신청 이름 누르기 시험(ministryPerson) — 교인명부 세 분. 시험 담당자(people.mindir)는 위 사용자 줄이 지운다.
  await step("사역신청 이름 누르기 시험 교인명부", () => rest(`church_people?person_id=in.(${MP.ids.join(",")})`, "DELETE"));
  await step("올리기 시험 계정", async () => {
    await rest(`users?name=like.ca-test-up-${STAMP}-*`, "DELETE");
    assert.equal((await rest(`users?select=id&name=like.ca-test-up-${STAMP}-*`, "GET")).length, 0, "올리기 시험 계정이 남았다");
  });
  // 교인명부 잇기 시험 — 잇기 줄(FK 가 없어 저절로 안 지워진다) · 신청 · 교인명부. 회차는 「성경필사 시험 회차」 단계가 지운다(줄은 CASCADE).
  await step("잇기 시험", async () => {
    const oIds = Object.values(PL.orders), sIds = Object.values(PL.signups);
    if (oIds.length) await rest(`people_links?kind=eq.order&row_id=in.(${oIds.join(",")})`, "DELETE");
    if (sIds.length) await rest(`people_links?kind=eq.signup&row_id=in.(${sIds.join(",")})`, "DELETE");
    // 신청 먼저, 그다음 그 신청의 시험 users — plFixtures 가 도중에 멈췄어도(PL.orders 가 비어도) 이름으로 찾아 지운다
    const us = await rest(`users?select=id&name=like.ca-test-pl-${STAMP}-*`, "GET");
    if (us.length) await rest(`ministry_orders?user_id=in.(${us.map((u) => u.id).join(",")})`, "DELETE");
    await rest(`users?name=like.ca-test-pl-${STAMP}-*`, "DELETE");
    await rest(`church_people?person_id=in.(${PL.ids.join(",")})`, "DELETE");
  });
  // ⚠️ 이 세 분(PL.ids)은 이 기능 전용 고정 ID 다 — sweepLinks(RUN_START)는 "이번 실행이 건드린" 줄만 보므로,
  //   어느 실행(지난 실행·겹쳐 돈 실행)이 만들고 못 지운 고아(밑줄이 사라진)는 시각과 상관없이 여기서 모두 치운다
  //   (검토 후속 — ministryPaperSave 등이 만든 줄의 user_id 가 와일드카드와 안 맞으면 위 단계가 못 지운다).
  await step("잇기 시험 — 이 세 분의 남은 고아 줄(지난 실행 것 포함)", async () => {
    const rows = await rest(`people_links?select=kind,row_id&person_id=in.(${PL.ids.join(",")})`, "GET");
    for (const [kind, table] of [["order", "ministry_orders"], ["signup", "event_signups"]]) {
      const ids = rows.filter((l) => l.kind === kind).map((l) => l.row_id);
      if (!ids.length) continue;
      const alive = new Set((await rest(`${table}?select=id&id=in.(${ids.join(",")})`, "GET")).map((r) => r.id));
      const gone = ids.filter((id) => !alive.has(id));
      if (gone.length) await rest(`people_links?kind=eq.${kind}&row_id=in.(${gone.join(",")})`, "DELETE");
    }
  });
  await step("이번 실행이 만든 잇기 찌꺼기", () => sweepLinks(RUN_START));
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
    assert.equal(x.tester, false);   // 🧪 시험 참여자 명단에 없는 분(2026-10-01)
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
  assert.equal(ap.body.phoneCleared, false, "결정 때는 번호를 지우지 않는다(2026-10-01 · 단추·180일로)");
  assert.equal("church" in ap.body, false);
  // 취소 — 사유 없이는 안 됨
  assert.equal((await call(m, "ministrySetStatus", { id: bRow.id, status: "취소", expect: "신청완료" })).body.error, "cancel-note-required");
  assert.equal((await call(m, "ministrySetStatus", { id: bRow.id, status: "취소", expect: "신청완료", note: "시험 취소" })).body.ok, true);
  const after = (await call(m, "ministryList")).body.list.filter((x) => x.name === "ca-test-min");
  assert.equal(after.find((x) => x.id === bRow.id).note, "시험 취소");
  assert.equal(after.find((x) => x.id === bRow.id).phone, "010-0000-0000", "취소해도 번호는 남는다");
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

test("종이 명단: 살펴보기는 안 만든다 · 넣기 → 저장·계정 생성 · 재업로드는 멱등 · 취소 사유 없음 · 없는 팀 · 4번째 줄 상한 · 결정줄 번호 남김 · 지명 팀 · 바뀐 기록", async () => {
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

  // 2) 넣기 — 저장됨 · 계정 생김 · 결정 상태라 임명일을 찍는다(번호는 남긴다 · 2026-10-01)
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
  assert.equal(order1.phone, "010-1234-5678", "결정 상태 줄도 번호를 남긴다(2026-10-01)");
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
  // 맨 위 교구 카드(2026-09-30) — 일곱 줄 · 가구는 세대주 교구 · 응답에 교인ID·목장 이름이 없다(person_id 는 세대주 판정에만)
  assert.deepEqual(st.body.stats.guCards.map((c) => c.gu), ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨"]);
  const stJson = JSON.stringify(st.body);
  for (const bad of ["990000001", "990000002", "시험-0목장", "시험-5목장", "ca-test"]) assert.ok(!stJson.includes(bad), "교인 현황에 실렸다: " + bad);

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
  //   다른 세션이 같은 개발 DB에 동시에 쓰면 남의 회차 수는 그사이 바뀐다 — 이번 실행 회차만 맞댄다.
  for (const e of r.body.events.filter((x) => [EV_ID, EV_EL_ID].includes(x.id))) {
    assert.equal(e.count, await dbCount(e.id), "인원이 DB 와 다르다: " + e.id);
  }
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
    assert.ok(!UUID_RE.test(text), label + " 응답에 UUID 꼴 값이 있다: " + (text.match(UUID_RE) || [""])[0]);
    for (const mk of marks) assert.ok(!text.includes(mk), `${label} 응답에 감출 값이 실렸다(표지 ${marks.indexOf(mk) + 1}번)`);
    const bad = keysOf(r.body).filter((k) => FORBIDDEN.includes(k) || CHURCH_COLS.includes(k));
    assert.deepEqual(bad, [], label + " 응답에 감출 칸이 있다: " + bad.join(","));
  }
});

// ---------- 성경필사(암송) — 회차 만들기·설정(Task 6) ----------
// 시험 회차 — EVT_ID_RE 에 맞는 꼴. 지우기는 Task 5 의 before()·after() 가 events?id=like.ca-test-* 로 한다(줄은 CASCADE).
const EVC_NEW = `ca-test-${STAMP}-new`;
// 회차 응답에 새면 안 되는 것 — UUID 꼴 값(user_id 등)과 줄·설정 쪽 칸 이름
// (sort_order 는 2026-09-30 부터 싣는다 — 회차 설정 창이 쓰는 성도님 앱 차례 · 비밀이 아니다)
function evcNoLeak(body, label) {
  const text = JSON.stringify(body);
  assert.ok(!UUID_RE.test(text), label + ": UUID 꼴 값이 실렸다");
  for (const k of ["user_id", "auth_user_id", "ident_key", "answers", "phone", "memo", "person_id", "needs", "copy"]) {
    assert.ok(!text.includes(`"${k}"`), label + ": " + k + " 칸이 실렸다");
  }
}

test("evEventCreate — 회차 만들기: 검사 코드마다 아무것도 안 만든다 · draft 고정 · needs 기본값 · kind signup · sort_order 는 받는다 · exists · 기록", async () => {
  const t = people.bibleevent.token;
  const base = { id: EVC_NEW, title: "ca-test 회차", short_title: "시험", subtitle: "", season: "2026-4Q",
    opens_on: "2026-10-20", closes_on: "2026-11-30", list_until: "" };
  const bad = [
    [{ ...base, id: "Bad ID!" }, "bad-event-id"],
    [{ ...base, id: "a" }, "bad-event-id"],                    // 두 글자 이상
    [{ ...base, id: undefined }, "bad-event-id"],              // id 없음(JSON 에서 빠진다)
    [{ ...base, id: 12345 }, "bad-event-id"],                  // 글자가 아닌 id
    [{ ...base, title: "   " }, "no-title"],
    [{ ...base, title: { a: 1 } }, "no-title"],                // 객체는 "" 로 — 「[object Object]」 제목이 생기지 않는다
    [{ ...base, opens_on: "2026/10/20" }, "bad-period"],
    [{ ...base, closes_on: "2026-10-01" }, "period-reversed"],
    [{ ...base, list_until: "언젠가" }, "bad-list-until"],
    [{ ...base, list_until: "2026-11-01" }, "list-until-before-close"],
    // 회차 차례(-999~999 정수) · 글자 칸 길이(창의 maxlength 와 같은 값) — 2026-09-30 SEC-6
    [{ ...base, sort_order: "1000" }, "bad-sort-order"],
    [{ ...base, sort_order: "1.5" }, "bad-sort-order"],
    [{ ...base, title: "가".repeat(101) }, "event-too-long"],
    [{ ...base, short_title: "가".repeat(41) }, "event-too-long"],
  ];
  for (const [event, code] of bad) {
    const r = await call(t, "evEventCreate", { event });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { ok: false, error: code }, JSON.stringify(event));
  }
  assert.deepEqual(await rest(`events?select=id&id=eq.${EVC_NEW}`, "GET"), [], "검사에 걸린 만들기가 회차를 남겼다");
  assert.deepEqual(await rest(`events?select=id&id=eq.12345`, "GET"), [], "글자가 아닌 id 로 회차가 생겼다");

  // 만들기 — 상태·종류·needs·copy 를 보내도 서버가 정한다(draft · signup · 직분만 받는 기본 needs · 빈 copy) · sort_order 는 받는다
  const c = await call(t, "evEventCreate", { event: { ...base, status: "open", kind: "quiz", sort_order: 7,
    needs: { eligibility: { start: "2026-01-01" } }, copy: { intro: "x" } } });
  assert.equal(c.body.ok, true, JSON.stringify(c.body));
  assert.deepEqual(Object.keys(c.body).sort(), ["event", "ok"]);
  assert.deepEqual(Object.keys(c.body.event).sort(), EV_OUT_KEYS);
  evcNoLeak(c.body, "evEventCreate");
  assert.equal(c.body.event.id, EVC_NEW);
  assert.equal(c.body.event.title, "ca-test 회차");
  assert.equal(c.body.event.status, "draft");
  assert.equal(c.body.event.kind, "signup");
  assert.equal(c.body.event.list_until, null);
  assert.equal(c.body.event.count, 0);
  assert.equal(c.body.event.listedNow, false);
  assert.equal(c.body.event.hasEligibility, false);
  assert.equal(c.body.event.sort_order, 7);
  const [row] = await rest(`events?select=status,kind,needs,copy,list_until,sort_order,updated_at&id=eq.${EVC_NEW}`, "GET");
  const { updated_at: dbUpdatedAt, ...stored } = row;
  assert.deepEqual(stored, { status: "draft", kind: "signup", needs: { position: true, phone: false, memo: false, extra: [] },
    copy: {}, list_until: null, sort_order: 7 });
  assert.equal(c.body.event.updated_at, dbUpdatedAt, "화면이 expect 로 쓸 updated_at 이 DB 와 같아야 한다");

  // 같은 id 다시 → exists · 덮어쓰지 않는다
  const again = await call(t, "evEventCreate", { event: { ...base, title: "덮어쓰기 시도" } });
  assert.deepEqual(again.body, { ok: false, error: "exists" });
  assert.equal((await rest(`events?select=title&id=eq.${EVC_NEW}`, "GET"))[0].title, "ca-test 회차");

  // 기록 — event.create 한 줄(바꾼 기록 기본 보기) · 검사에 걸린 것·exists 는 기록을 남기지 않는다
  const logs = (await call(people.super.token, "auditList", { limit: 50 })).body.rows
    .filter((r) => r.action === "event.create" && r.target === EVC_NEW);
  assert.equal(logs.length, 1, JSON.stringify(logs));
  assert.equal(logs[0].detail.title, "ca-test 회차");
  assert.deepEqual(logs[0].detail.before, {});
  assert.deepEqual(logs[0].detail.after, { title: "ca-test 회차", short_title: "시험", subtitle: "", season: "2026-4Q",
    opens_on: "2026-10-20", closes_on: "2026-11-30", status: "draft", list_until: null, sort_order: "7" });
});

test("evEventSave — 회차 설정: 없는 회차 · expect(conflict) · 검사 코드 · 보낸 칸만 · 공개 확인은 쓰기 전에(needs-confirm 이면 그대로) · 지난 공개 종료일 · 자격 시작일 · 기록", async () => {
  const t = people.bibleevent.token;
  const COLS = "id,title,short_title,subtitle,season,kind,status,opens_on,closes_on,list_until,needs,copy,sort_order,updated_at";
  const read = async () => (await rest(`events?select=${COLS}&id=eq.${EVC_NEW}`, "GET"))[0];
  const save = (expect, patch, extra = {}) => call(t, "evEventSave", { event_id: EVC_NEW, expect, patch, ...extra });
  const settingsLogs = async () => (await call(people.super.token, "auditList", { limit: 200 })).body.rows
    .filter((r) => r.action === "event.settings" && r.target === EVC_NEW);
  const okShape = (r, label) => {
    assert.equal(r.body.ok, true, label + " " + JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body).sort(), ["event", "listedBefore", "listedNow", "ok"], label);
    assert.deepEqual(Object.keys(r.body.event).sort(), EV_OUT_KEYS, label);
    evcNoLeak(r.body, label);
  };
  let cur = await read();
  assert.ok(cur, "앞 시험(evEventCreate)이 만든 회차가 있어야 한다");

  // 없는 회차 · 모양이 틀린 id · 빈 id → not-found(아무것도 안 만든다)
  for (const event_id of [`ca-test-${STAMP}-none`, "Bad ID!", ""]) {
    const r = await call(t, "evEventSave", { event_id, expect: cur.updated_at, patch: { title: "x" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { ok: false, error: "not-found" }, event_id);
  }
  assert.deepEqual(await rest(`events?select=id&id=eq.ca-test-${STAMP}-none`, "GET"), []);

  // expect 가 없거나 다르면 conflict
  assert.deepEqual((await call(t, "evEventSave", { event_id: EVC_NEW, patch: { title: "x" } })).body, { ok: false, error: "conflict" });
  assert.deepEqual((await save("2000-01-01T00:00:00+00:00", { title: "x" })).body, { ok: false, error: "conflict" });
  assert.deepEqual(await read(), cur, "conflict 인데 줄이 바뀌었다");

  // 검사 코드 — 하나씩, 줄은 그대로
  const bad = [
    [{ title: "  " }, "no-title"],
    [{ opens_on: "2026/10/20" }, "bad-period"],
    [{ closes_on: "" }, "bad-period"],
    [{ closes_on: "2026-10-01" }, "period-reversed"],
    [{ status: "published" }, "bad-status"],
    [{ list_until: "언젠가" }, "bad-list-until"],
    [{ list_until: "2026-11-01" }, "list-until-before-close"],
    [{ closes_on: "2026-12-31", list_until: "2026-12-01" }, "list-until-before-close"],
  ];
  for (const [patch, code] of bad) {
    assert.deepEqual((await save(cur.updated_at, patch)).body, { ok: false, error: code }, JSON.stringify(patch));
  }
  assert.deepEqual(await read(), cur, "검사에 걸린 저장이 줄을 바꿨다");

  // 보낸 칸만 — needs·kind·copy·id 는 보내도 버린다(sort_order 는 받는 칸이라 아래 「회차 차례」 시험이 따로 본다)
  const s1 = await save(cur.updated_at, { subtitle: "  시험 부제  ", needs: {}, kind: "quiz", copy: { intro: "x" },
    id: `ca-test-${STAMP}-hijack` });
  okShape(s1, "보낸 칸만");
  assert.equal(s1.body.listedBefore, false);
  assert.equal(s1.body.listedNow, false);
  assert.equal(s1.body.event.subtitle, "시험 부제");
  const r1 = await read();
  assert.equal(r1.subtitle, "시험 부제");
  assert.notEqual(r1.updated_at, cur.updated_at);
  assert.equal(s1.body.event.updated_at, r1.updated_at);
  assert.deepEqual({ ...r1, subtitle: cur.subtitle, updated_at: cur.updated_at }, cur, "부제·updated_at 밖의 칸이 바뀌었다");
  assert.deepEqual(await rest(`events?select=id&id=eq.ca-test-${STAMP}-hijack`, "GET"), [], "id 가 바뀌거나 새 회차가 생겼다");

  // 옛 expect 로 또 → conflict(그사이 누가 고친 것과 같다) · 줄은 그대로
  assert.deepEqual((await save(cur.updated_at, { title: "늦은 저장" })).body, { ok: false, error: "conflict" });
  assert.deepEqual(await read(), r1);
  cur = r1;

  // 바뀐 것이 없으면 쓰지 않는다(updated_at 그대로)
  const same = await save(cur.updated_at, { subtitle: "시험 부제" });
  okShape(same, "바뀐 것 없음");
  assert.equal(same.body.event.updated_at, cur.updated_at);
  assert.deepEqual(await read(), cur);

  // 공개 확인 — 안 보이던 회차가 보이게 되는 저장은 confirmListed:true 가 없으면 **아무것도 쓰지 않는다**
  const n0 = (await settingsLogs()).length;
  for (const extra of [{}, { confirmListed: "true" }, { confirmListed: 1 }, { confirmListed: false }]) {
    for (const status of ["open", "closed"]) {
      const r = await save(cur.updated_at, { status, title: "보이게 하며 고친 이름" }, extra);
      assert.deepEqual(r.body, { ok: false, error: "needs-confirm" }, status + " " + JSON.stringify(extra));
    }
  }
  assert.deepEqual(await read(), cur, "needs-confirm 인데 줄이 바뀌었다");
  assert.equal((await settingsLogs()).length, n0, "needs-confirm 인데 기록이 남았다");

  // 확인을 받으면 쓴다                                                                   (기록 1)
  const open = await save(cur.updated_at, { status: "open" }, { confirmListed: true });
  okShape(open, "공개");
  assert.equal(open.body.listedBefore, false);
  assert.equal(open.body.listedNow, true);
  assert.equal(open.body.event.status, "open");
  assert.equal(open.body.event.listedNow, true);
  cur = await read();
  // 이미 보이는 회차의 다른 칸은 확인 없이                                                 (기록 2)
  const ren = await save(cur.updated_at, { title: "ca-test 회차 고침" });
  okShape(ren, "보이는 회차 이름 고치기");
  assert.equal(ren.body.listedBefore, true);
  assert.equal(ren.body.listedNow, true);
  cur = await read();
  // 다시 draft — 안 보이게 하는 것은 확인 없이(개발 첫 화면에 오래 두지 않는다)               (기록 3)
  const hide = await save(cur.updated_at, { status: "draft" });
  okShape(hide, "다시 draft");
  assert.equal(hide.body.listedBefore, true);
  assert.equal(hide.body.listedNow, false);
  cur = await read();
  assert.equal(cur.status, "draft");

  // 공개 종료일 — 날짜로 넣었다가 비우면 null                                              (기록 4·5)
  const lu = await save(cur.updated_at, { list_until: "2026-12-31" });
  okShape(lu, "공개 종료일");
  assert.equal(lu.body.event.list_until, "2026-12-31");
  cur = await read();
  const lu2 = await save(cur.updated_at, { list_until: "" });
  okShape(lu2, "공개 종료일 비우기");
  assert.equal(lu2.body.event.list_until, null);
  cur = await read();
  assert.equal(cur.list_until, null);

  // 공개 종료일이 지나 안 보이던 회차 — 종료일을 비우거나 늦추면 다시 보이게 된다 → 역시 확인이 먼저
  // (서비스 키로 옛 회차 모양을 만든다 — 2000년 날짜라 오늘이 언제든 「지났다」)
  await rest(`events?id=eq.${EVC_NEW}`, "PATCH",
    { status: "closed", opens_on: "2000-01-01", closes_on: "2000-01-31", list_until: "2000-02-01" });
  cur = await read();
  for (const list_until of ["", "2099-12-31"]) {
    assert.deepEqual((await save(cur.updated_at, { list_until })).body, { ok: false, error: "needs-confirm" }, "list_until " + list_until);
  }
  assert.deepEqual(await read(), cur, "needs-confirm 인데 줄이 바뀌었다(공개 종료일)");
  // 지난 날짜끼리 바꾸는 것은 여전히 안 보이므로 확인 없이                                  (기록 6)
  const past = await save(cur.updated_at, { list_until: "2000-03-01" });
  okShape(past, "지난 공개 종료일");
  assert.deepEqual([past.body.listedBefore, past.body.listedNow], [false, false]);
  // 되돌린다(서비스 키 — 기록 없음)
  await rest(`events?id=eq.${EVC_NEW}`, "PATCH",
    { status: "draft", opens_on: "2026-10-20", closes_on: "2026-11-30", list_until: null });
  cur = await read();

  // 자격 회차 — opens_on 은 needs.eligibility.start 보다 앞설 수 없다 · 저장해도 needs 는 그대로   (기록 7)
  const needs = { position: true, phone: false, memo: false, extra: [],
    eligibility: { start: "2026-10-11", weeks: 6, perWeek: 3, need: 3, minNeed: 2 } };
  await rest(`events?id=eq.${EVC_NEW}`, "PATCH", { needs });   // 서비스 키로 — 이 메뉴는 needs 를 못 바꾼다
  cur = await read();
  assert.deepEqual((await save(cur.updated_at, { opens_on: "2026-10-01" })).body, { ok: false, error: "before-eligibility" });
  assert.deepEqual(await read(), cur);
  const el = await save(cur.updated_at, { opens_on: "2026-10-11" });          // 같은 날은 된다
  okShape(el, "자격 시작일과 같은 날");
  assert.equal(el.body.event.hasEligibility, true);
  assert.deepEqual((await read()).needs, needs, "저장 한 번에 자격 규칙이 바뀌었다");

  // 기록 — 바뀐 저장만, 바뀐 칸만 전·후로
  const logs = await settingsLogs();
  assert.equal(logs.length, n0 + 7, "공개·이름·draft·종료일 둘·지난 종료일·시작일 = 일곱 건");
  const opened = logs.find((r) => r.detail?.after?.status === "open");
  assert.ok(opened, "공개로 바꾼 기록이 없다");
  assert.deepEqual(opened.detail.before, { status: "draft" });
  assert.deepEqual(opened.detail.after, { status: "open" });
  assert.equal(opened.detail.title, "ca-test 회차");
  const sub = logs.find((r) => r.detail?.after?.subtitle === "시험 부제");
  assert.ok(sub, "부제 기록이 없다");
  assert.deepEqual(sub.detail.before, { subtitle: "" });
  assert.deepEqual(sub.detail.after, { subtitle: "시험 부제" });            // needs·kind·copy 는 기록에도 없다
});

// 회차 차례(sort_order) — 성도님 앱 eventOpenList 가 마감일이 같은 회차끼리 이 차례로 세운다(첫 화면 단추도).
// 글자 칸 길이 — 창의 maxlength 와 같은 값을 서버도 막는다(SEC-6) · 바꾼 칸만 본다(옛 값은 막지 않는다).
test("evEventSave — 회차 차례(sort_order)·글자 길이", async () => {
  const t = people.bibleevent.token;
  const read = async () => (await rest(`events?select=id,title,subtitle,sort_order,updated_at&id=eq.${EVC_NEW}`, "GET"))[0];
  const save = (expect, patch) => call(t, "evEventSave", { event_id: EVC_NEW, expect, patch });
  let cur = await read();
  assert.ok(cur, "앞 시험(evEventCreate)이 만든 회차가 있어야 한다");
  assert.equal(cur.sort_order, 7, "앞 시험이 차례 7 로 만들었다");

  // 음수도 된다 · 응답·DB 는 수 · 기록은 글자(event.settings)
  const neg = await save(cur.updated_at, { sort_order: "-3" });
  assert.equal(neg.body.ok, true, JSON.stringify(neg.body));
  assert.deepEqual(Object.keys(neg.body.event).sort(), EV_OUT_KEYS);
  evcNoLeak(neg.body, "차례 -3");
  assert.equal(neg.body.event.sort_order, -3);
  cur = await read();
  assert.equal(cur.sort_order, -3);
  assert.equal(neg.body.event.updated_at, cur.updated_at);
  const logs = (await call(people.super.token, "auditList", { limit: 200 })).body.rows
    .filter((r) => r.action === "event.settings" && r.target === EVC_NEW && r.detail?.after?.sort_order === "-3");
  assert.equal(logs.length, 1, JSON.stringify(logs));
  assert.deepEqual(logs[0].detail.before, { sort_order: "7" });
  assert.deepEqual(logs[0].detail.after, { sort_order: "-3" });

  // 빈칸 = 0
  const blank = await save(cur.updated_at, { sort_order: "" });
  assert.equal(blank.body.ok, true, JSON.stringify(blank.body));
  assert.equal(blank.body.event.sort_order, 0);
  cur = await read();
  assert.equal(cur.sort_order, 0);

  // -999~999 정수가 아니면 bad-sort-order · 이름 101자는 event-too-long — 아무것도 안 쓴다
  for (const [patch, code] of [[{ sort_order: "1000" }, "bad-sort-order"], [{ sort_order: "abc" }, "bad-sort-order"],
    [{ title: "가".repeat(101) }, "event-too-long"]]) {
    assert.deepEqual((await save(cur.updated_at, patch)).body, { ok: false, error: code }, JSON.stringify(patch));
  }
  assert.deepEqual(await read(), cur, "검사에 걸린 저장이 줄을 바꿨다");

  // 옛 값은 막지 않는다 — 서비스 키로 차례를 5000(범위 밖)으로 두고 부제만 고쳐도 저장된다 · 차례는 그대로
  await rest(`events?id=eq.${EVC_NEW}`, "PATCH", { sort_order: 5000 });
  cur = await read();
  const keep = await save(cur.updated_at, { subtitle: "차례 시험" });
  assert.equal(keep.body.ok, true, JSON.stringify(keep.body));
  assert.equal(keep.body.event.sort_order, 5000);
  const after = await read();
  assert.equal(after.subtitle, "차례 시험");
  assert.equal(after.sort_order, 5000);
  await rest(`events?id=eq.${EVC_NEW}`, "PATCH", { sort_order: 0 });        // 되돌린다(서비스 키 — 기록 없음)
});

// ---------- 성경필사(암송) — 한 분 더하기 · 줄 고치기 · 빼기 (계획 Task 7) ----------
// 시험 자료는 첫 시험이 한 번 만든다(뒤 시험은 같은 약속을 기다린다).
function rowFixtures() {
  rxReady ??= (async () => {
    // 지난번이 도중에 멈춰 남긴 시험 계정 — 그 계정의 줄·별칭은 CASCADE. **한 시간 넘은 것만**
    //   (다른 세션이 개발에서 같은 시험을 돌리는 중이면 그쪽 계정을 지우지 않게 — Task 5 before()·Task 8 과 같은 규칙).
    const rxStale = new Date(Date.now() - 3600 * 1000).toISOString();
    await rest(`users?name=like.ca-test-rx*&created_at=lt.${rxStale}`, "DELETE");
    const needs = { position: true, phone: false, memo: false, extra: [] };
    await rest("events", "POST", { id: RX.ev, title: "ca-test 줄 시험 " + STAMP, opens_on: "2000-04-01", closes_on: "2000-04-30",
      status: "draft", kind: "signup", needs });
    await rest("events", "POST", { id: RX.evEl, title: "ca-test 자격 줄 시험 " + STAMP, opens_on: "2000-05-01", closes_on: "2000-05-31",
      status: "draft", kind: "signup", needs: { ...needs, eligibility: { start: "2000-05-01", weeks: 4, perWeek: 3, need: 3 } } });
    const user = async (tag, gu, mok) => {
      const [u] = await rest("users", "POST",
        { type: "교구", gu, mok, name: rxName(tag), identity_key: `교구|${gu}|${mok}|||${rxName(tag)}` });
      RX.users.push(u.id);
      return u.id;
    };
    RX.u7 = await user("seven", "사랑", "07");      // 앱에서 목장 「07」로 로그인한 분
    RX.uLink = await user("link", "믿음", "3");     // 계정 하나 → 잇는다
    RX.uAlias = await user("alias", "소망", "5");   // 지금 소속 소망 5 · 옛 소속(별칭) 소망 4
    await rest("user_identity_aliases", "POST", { identity_key: `교구|소망|4|||${rxName("alias")}`, user_id: RX.uAlias });
    RX.uTwoA = await user("twoacc", "은혜", "2");   // 같은 분 계정이 둘(「2」·「2목장」) → 잇지 않는다
    RX.uTwoB = await user("twoacc", "은혜", "2목장");
    RX.uRace = await user("race", "기쁨", "9");     // 동시에 셋이 더하기
    const put = async (x) => (await rest("event_signups", "POST", x))[0];
    // 앱에서 낸 줄 — 목장 「07」 그대로(앱 로그인 값)
    RX.app = await put({ event_id: RX.ev, user_id: RX.u7, ident_key: `교구|사랑|07|||${rxName("seven")}`, who_type: "교구",
      group_name: "사랑", sub_name: "07", name: rxName("seven"), position: "집사", source: "app" });
    // 이관 줄 — 옛 값이 지금 규칙에 어긋난다(이름에 괄호 · 교구 칸 「화평교구」). 다른 칸만 고칠 때 막히면 안 된다.
    RX.old = await put({ event_id: RX.ev, ident_key: `교구|화평교구|1|||${rxName("old")}(구)`, who_type: "교구",
      group_name: "화평교구", sub_name: "1", name: rxName("old") + "(구)", position: "집사", note: "원래: 화평 30 · 집사", source: "import" });
    // 이관 줄 — 고치기 시험용
    RX.edit = await put({ event_id: RX.ev, ident_key: `교구|섬김|1|||${rxName("edit")}`, who_type: "교구",
      group_name: "섬김", sub_name: "1", name: rxName("edit"), position: "집사", note: "원래: 화평 30 · 집사", source: "import" });
    // 자격 회차의 이관 줄 — 메모만 고치고, 빼지 못한다
    RX.el = await put({ event_id: RX.evEl, ident_key: `교구|화평|1|||${rxName("elig")}`, who_type: "교구",
      group_name: "화평", sub_name: "1", name: rxName("elig"), source: "import" });
  })();
  return rxReady;
}

// 응답 어디에도 UUID 꼴 값(user_id)이 없고, 줄에 숨길 칸이 없다
function rxClean(r) {
  const s = JSON.stringify(r.body);
  assert.ok(!UUID_RE.test(s), "응답에 UUID 꼴 값: " + s);
  if (r.body.row) for (const k of RX_SECRET) assert.equal(k in r.body.row, false, "줄에 " + k);
}
const rxDb = async (id) => (await rest(
  `event_signups?select=id,user_id,ident_key,name,group_name,sub_name,position,note,source,updated_at&id=eq.${id}`, "GET"))[0];
// 고치기·빼기 시험은 「한 분 더하기」 시험이 RX 에 남긴 줄을 쓴다 — 하나만 골라 돌리면 TypeError 대신 이 알림으로 멈춘다
const rxNeed = (v, what) => { assert.ok(v, `${what} 가 없다 — 「성경필사 한 분 더하기」 시험이 먼저 돌아야 한다(파일 전체로 돌릴 것)`); return v; };

test("성경필사 한 분 더하기: 넣음(import·메모 머리·다듬기) · 계정 잇기(별칭 포함) · 계정 둘 · 이미 있음(07/7·계정·키) · 자격 회차 · 메모 길이(머리 포함) · 모양 틀림 · 계정을 만들지 않음", async () => {
  await rowFixtures();
  const t = people.bibleevent.token;
  const add = (row, ev = RX.ev) => call(t, "evRowAdd", { event_id: ev, row: { who_type: "교구", position: "", note: "", ...row } });

  // 1) 앱 계정이 없는 분 — 넣음 · 잇지 않음 · 「화평교구」→화평 · 「07」→7 · 「집사님」→집사 · 메모 머리
  const a1 = await add({ group: "화평교구", sub: "07", name: rxName("new"), position: "집사님", note: "시험 메모" });
  assert.equal(a1.body.ok, true, JSON.stringify(a1.body));
  rxClean(a1);
  assert.deepEqual(Object.keys(a1.body.row).sort(), ROW_OUT_KEYS);
  assert.equal(a1.body.linked, false);
  assert.deepEqual(a1.body.warnings, []);
  const r1 = a1.body.row;
  assert.deepEqual([r1.who_type, r1.group, r1.sub, r1.name, r1.position, r1.source, r1.hasUser],
    ["교구", "화평", "7", rxName("new"), "집사", "import", false]);
  assert.equal(r1.note, "담당자가 더함 / 시험 메모");
  RX.rowIds.push(r1.id);
  RX.added = r1;
  const d1 = await rxDb(r1.id);
  assert.equal(d1.ident_key, `교구|화평|7|||${rxName("new")}`);
  assert.equal(d1.user_id, null);
  assert.equal(d1.source, "import");
  assert.equal((await rest(`users?select=id&name=eq.${rxName("new")}`, "GET")).length, 0, "계정을 만들면 안 된다");

  // 2) 같은 분을 다른 표기로 다시 — 「7목장」·「07」 둘 다 already
  assert.equal((await add({ group: "화평", sub: "7목장", name: rxName("new") })).body.error, "already");
  assert.equal((await add({ group: "화평", sub: "07", name: rxName("new") })).body.error, "already");

  // 3) 07/7 — 앱에서 목장 「07」로 낸 분을 담당자가 「7」로 더하면 already(설계 §1-1)
  assert.equal((await add({ group: "사랑", sub: "7", name: rxName("seven") })).body.error, "already");

  // 4) 앱 계정 하나 → 잇는다 · 목록 밖 직분은 경고만
  const a4 = await add({ group: "믿음", sub: "3", name: rxName("link"), position: "명예권사" });
  assert.equal(a4.body.ok, true, JSON.stringify(a4.body));
  rxClean(a4);
  assert.equal(a4.body.linked, true);
  assert.equal(a4.body.row.hasUser, true);
  assert.equal(a4.body.row.position, "명예권사");
  assert.equal(a4.body.warnings.length, 1, JSON.stringify(a4.body.warnings));
  assert.match(a4.body.warnings[0], /명예권사/);
  assert.equal((await rxDb(a4.body.row.id)).user_id, RX.uLink);
  RX.rowIds.push(a4.body.row.id);
  RX.linked = a4.body.row;
  assert.equal((await add({ group: "믿음", sub: "03", name: rxName("link") })).body.error, "already");

  // 5) 옛 소속(별칭 「소망 4」)으로 적어도 그 계정에 잇는다
  const a5 = await add({ group: "소망", sub: "4", name: rxName("alias") });
  assert.equal(a5.body.ok, true, JSON.stringify(a5.body));
  rxClean(a5);
  assert.equal(a5.body.linked, true);
  assert.equal((await rxDb(a5.body.row.id)).user_id, RX.uAlias);
  RX.rowIds.push(a5.body.row.id);
  RX.aliasRow = a5.body.row;
  // 지금 소속 「소망 5」로 적으면 키는 다르지만 그 계정이 이미 회차에 있다 → already
  assert.equal((await add({ group: "소망", sub: "5", name: rxName("alias") })).body.error, "already");

  // 6) 계정이 둘 → 잇지 않고 알린다
  const a6 = await add({ group: "은혜", sub: "2", name: rxName("twoacc") });
  assert.equal(a6.body.ok, true, JSON.stringify(a6.body));
  rxClean(a6);
  assert.equal(a6.body.linked, false);
  assert.equal(a6.body.row.hasUser, false);
  assert.ok(a6.body.warnings.some((w) => /계정이 2개/.test(w)), JSON.stringify(a6.body.warnings));
  RX.rowIds.push(a6.body.row.id);

  // 7) 자격 회차 → eligibility-event · 아무것도 안 들어간다
  assert.equal((await add({ group: "화평", sub: "1", name: rxName("elnew") }, RX.evEl)).body.error, "eligibility-event");
  assert.equal((await rest(`event_signups?select=id&event_id=eq.${RX.evEl}&name=eq.${rxName("elnew")}`, "GET")).length, 0);

  // 8) 메모 길이는 머리 표기를 붙인 **뒤**로 센다 — 「담당자가 더함 / 」(10자) + 490 = 500 은 넣고, 491 은 note-too-long
  const n1 = await add({ group: "화평", sub: "2", name: rxName("note"), note: "가".repeat(490) });
  assert.equal(n1.body.ok, true, JSON.stringify(n1.body).slice(0, 300));
  assert.equal(n1.body.row.note.length, 500);
  RX.rowIds.push(n1.body.row.id);

  // 9) 모양 틀림(설계 §1 판정표) · 없는 회차 — 아무것도 안 들어간다
  //   이름 하나(rxName("bad"))로만 보면 「홍,길동」·빈 이름·긴 이름 줄은 못 본다 — 회차 인원 전체로도 맞댄다
  const before9 = await dbCount(RX.ev);
  const bad = async (row, want) => assert.equal((await add(row)).body.error, want, JSON.stringify(row).slice(0, 200));
  await bad({ group: "화평", sub: "1", name: "" }, "no-name");
  await bad({ group: "화평", sub: "1", name: "홍,길동" }, "bad-char");
  await bad({ group: "화평", sub: "1", name: "가".repeat(41) }, "too-long");
  await bad({ who_type: "성가대", group: "화평", sub: "1", name: rxName("bad") }, "bad-type");
  await bad({ group: "없는교구", sub: "1", name: rxName("bad") }, "bad-group");
  await bad({ who_type: "교회학교", group: "", sub: "", name: rxName("bad") }, "no-group");
  await bad({ group: "화평", sub: "셋", name: rxName("bad") }, "bad-sub");
  await bad({ group: "화평", sub: "1", name: rxName("bad"), position: "가".repeat(41) }, "too-long");
  await bad({ group: "화평", sub: "1", name: rxName("bad"), note: "가".repeat(491) }, "note-too-long");
  for (const event_id of ["ca-test-none-" + STAMP, "BAD ID"]) {
    const none = await call(t, "evRowAdd", { event_id, row: { who_type: "교구", group: "화평", sub: "1", name: rxName("bad") } });
    assert.equal(none.body.error, "not-found", event_id);
  }
  assert.equal(await dbCount(RX.ev), before9, "모양 틀림·없는 회차인데 줄이 들어갔다");
  assert.equal((await rest(`event_signups?select=id&name=eq.${rxName("bad")}`, "GET")).length, 0);
});

test("성경필사 한 분 더하기: 같은 분을 동시에 셋 — 하나만 들어가고 둘은 already(23505 → already · 500 없음)", async () => {
  await rowFixtures();
  const t = people.bibleevent.token;
  const rs = await Promise.all([1, 2, 3].map(() => call(t, "evRowAdd",
    { event_id: RX.ev, row: { who_type: "교구", group: "기쁨", sub: "9", name: rxName("race"), position: "", note: "" } })));
  const bodies = JSON.stringify(rs.map((r) => r.body));
  for (const r of rs) assert.notEqual(r.status, 500, bodies);
  assert.equal(rs.filter((r) => r.body.ok).length, 1, bodies);
  assert.equal(rs.filter((r) => r.body.error === "already").length, 2, bodies);
  const inDb = await rest(`event_signups?select=id,user_id&event_id=eq.${RX.ev}&name=eq.${rxName("race")}`, "GET");
  assert.equal(inDb.length, 1);
  assert.equal(inDb[0].user_id, RX.uRace);
  RX.rowIds.push(inDb[0].id);
});

test("성경필사 한 분 더하기·고치기: 교구 줄은 한쪽 목장이 비었거나 99 면 같은 교구·같은 이름을 already(최종 검토 I1) · 번호끼리 다르면 다른 분", async () => {
  await rowFixtures();
  const t = people.bibleevent.token;
  const add = (row) => call(t, "evRowAdd", { event_id: RX.ev, row: { who_type: "교구", position: "", note: "", ...row } });
  // 1) 목장 없이 더한 분 — 교인명부로 목장(20)을 채워 다시 더하면 already · 99 · 「20목장」도 already
  const a1 = await add({ group: "섬김", sub: "", name: rxName("open") });
  assert.equal(a1.body.ok, true, JSON.stringify(a1.body));
  RX.rowIds.push(a1.body.row.id);
  for (const sub of ["20", "99", "20목장"]) {
    assert.equal((await add({ group: "섬김", sub, name: rxName("open") })).body.error, "already", "섬김 " + sub);
  }
  // 다른 교구는 다른 분 · 번호끼리(은혜 20 ↔ 은혜 21)는 다르면 다른 분
  const a2 = await add({ group: "은혜", sub: "20", name: rxName("open") });
  assert.equal(a2.body.ok, true, JSON.stringify(a2.body));
  RX.rowIds.push(a2.body.row.id);
  const a3 = await add({ group: "은혜", sub: "21", name: rxName("open") });
  assert.equal(a3.body.ok, true, JSON.stringify(a3.body));
  RX.rowIds.push(a3.body.row.id);
  // 2) 앱에서 목장 「99」(목장 없음)로 로그인해 낸 줄 — 목장(20)을 적어 더해도, 빈 목장으로 더해도 already
  //    (앱 줄은 계정이 있어야 한다 — event_signups_app_only_chk · 계정은 after() 가 RX.users 로 지운다)
  const [u99] = await rest("users", "POST",
    { type: "교구", gu: "기쁨", mok: "99", name: rxName("n99"), identity_key: `교구|기쁨|99|||${rxName("n99")}` });
  RX.users.push(u99.id);
  await rest("event_signups", "POST", { event_id: RX.ev, user_id: u99.id, ident_key: `교구|기쁨|99|||${rxName("n99")}`,
    who_type: "교구", group_name: "기쁨", sub_name: "99", name: rxName("n99"), position: "", source: "app" });
  for (const sub of ["20", ""]) {
    assert.equal((await add({ group: "기쁨", sub, name: rxName("n99") })).body.error, "already", "기쁨 " + JSON.stringify(sub));
  }
  // 3) 고치기 — 은혜 20 을 섬김으로(섬김에 목장 빈 줄) already · 은혜 99 로(은혜 21 과) already · 자기 줄은 빼고 본다
  const save = (row, patch) => call(t, "evRowSave", { id: row.id, expect: row.updated_at, patch });
  assert.equal((await save(a2.body.row, { group: "섬김" })).body.error, "already");
  assert.equal((await save(a2.body.row, { sub: "99" })).body.error, "already");
  const s1 = await save(a1.body.row, { sub: "5" });   // 섬김 빈 줄 → 섬김 5(같은 이름의 다른 섬김 줄이 없다)
  assert.equal(s1.body.ok, true, JSON.stringify(s1.body));
  rxClean(s1);
  // 막힌 것은 아무것도 들어가지 않았다
  assert.equal((await rest(`event_signups?select=id&event_id=eq.${RX.ev}&name=eq.${rxName("open")}`, "GET")).length, 3);
  assert.equal((await rest(`event_signups?select=id&event_id=eq.${RX.ev}&name=eq.${rxName("n99")}`, "GET")).length, 1);
});

test("성경필사 줄 고치기: 메모 · 동시 수정 · 바뀐 칸만 검사 · 신원 키 다시(계정 그대로) · 자기 줄 빼고 already · 앱 줄·자격 회차는 메모만", async () => {
  const linked = rxNeed(RX.linked, "RX.linked"), aliasRow = rxNeed(RX.aliasRow, "RX.aliasRow");
  await rowFixtures();
  const t = people.bibleevent.token;
  const save = (row, patch, expect = row.updated_at) => call(t, "evRowSave", { id: row.id, expect, patch });

  // 1) 메모만 — 옛 표기 뒤에 더한 것 그대로
  const s1 = await save(RX.edit, { note: "원래: 화평 30 · 집사 / 확인함" });
  assert.equal(s1.body.ok, true, JSON.stringify(s1.body));
  assert.deepEqual(Object.keys(s1.body.row).sort(), ROW_OUT_KEYS);
  assert.equal(s1.body.row.note, "원래: 화평 30 · 집사 / 확인함");
  assert.notEqual(s1.body.row.updated_at, RX.edit.updated_at);
  // 2) 같은 expect 로 한 번 더 → conflict · 저장 안 됨
  assert.equal((await save(RX.edit, { note: "덮어쓰기" })).body.error, "conflict");
  assert.equal((await rxDb(RX.edit.id)).note, "원래: 화평 30 · 집사 / 확인함");
  RX.edit = s1.body.row;

  // 3) 바뀐 칸만 검사 — 옛 이름에 괄호·교구 칸 「화평교구」가 있어도 직분만 고치면 저장된다(옛 칸은 그대로)
  const s3 = await save(RX.old, { position: "권사님" });
  assert.equal(s3.body.ok, true, JSON.stringify(s3.body));
  assert.equal(s3.body.row.position, "권사");
  const d3 = await rxDb(RX.old.id);
  assert.equal(d3.name, rxName("old") + "(구)");
  assert.equal(d3.group_name, "화평교구");
  // …하지만 바꾼 칸이 틀리면 막는다
  assert.equal((await save(s3.body.row, { name: "홍,길동" })).body.error, "bad-char");
  assert.equal((await save(s3.body.row, { group: "없는" })).body.error, "bad-group");
  assert.equal((await save(s3.body.row, { note: "가".repeat(501) })).body.error, "note-too-long");

  // 4) 신원을 바꾸면 ident_key 를 다시 만들고, 이어진 계정(user_id)은 그대로
  const s4 = await save(linked, { sub: "4" });
  assert.equal(s4.body.ok, true, JSON.stringify(s4.body));
  assert.equal(s4.body.row.sub, "4");
  assert.equal(s4.body.row.hasUser, true);
  const d4 = await rxDb(linked.id);
  assert.equal(d4.ident_key, `교구|믿음|4|||${rxName("link")}`);
  assert.equal(d4.user_id, RX.uLink);

  // 5) 자기 줄은 빼고 본다 — 별칭으로 이은 줄(소망 4)을 지금 소속(소망 5)으로: 그 계정의 줄은 이 줄 자신뿐 → 저장
  const s5 = await save(aliasRow, { sub: "5" });
  assert.equal(s5.body.ok, true, JSON.stringify(s5.body));
  assert.equal((await rxDb(aliasRow.id)).user_id, RX.uAlias);

  // 6) 다른 줄과 겹치게 고치면 already · 그대로 남는다(07/7 포함)
  assert.equal((await save(RX.edit, { group: "화평", sub: "7", name: rxName("new") })).body.error, "already");
  assert.equal((await save(RX.edit, { group: "사랑", sub: "7", name: rxName("seven") })).body.error, "already");
  assert.equal((await rxDb(RX.edit.id)).name, rxName("edit"));

  // 7) 앱에서 낸 줄 — 메모 밖 칸이 오기만 해도 거절(값이 같아도) · 메모는 저장
  assert.equal((await save(RX.app, { name: rxName("seven") })).body.error, "app-row-note-only");
  assert.equal((await save(RX.app, { note: "x", position: "집사" })).body.error, "app-row-note-only");
  const s7 = await save(RX.app, { note: "앱 줄 메모" });
  assert.equal(s7.body.ok, true, JSON.stringify(s7.body));
  assert.equal(s7.body.row.note, "앱 줄 메모");
  assert.equal(s7.body.row.source, "app");
  RX.app = s7.body.row;

  // 8) 자격 회차의 줄(이관이어도) — 메모만
  assert.equal((await save(RX.el, { position: "권사" })).body.error, "app-row-note-only");
  const s8 = await save(RX.el, { note: "자격 줄 메모" });
  assert.equal(s8.body.ok, true, JSON.stringify(s8.body));
  RX.el = s8.body.row;

  // 9) 없는 줄 · 바뀐 것 없음(쓰지 않고 그대로 돌려준다)
  assert.equal((await call(t, "evRowSave", { id: 0, expect: "", patch: { note: "x" } })).body.error, "not-found");
  const same = await save(RX.el, { note: "자격 줄 메모" });
  assert.equal(same.body.ok, true, JSON.stringify(same.body));
  assert.equal(same.body.row.updated_at, RX.el.updated_at, "바뀐 것이 없으면 쓰지 않는다");

  for (const r of [s1, s3, s4, s5, s7, s8]) rxClean(r);
});

test("성경필사 줄 빼기: 앱 줄은 app-row · 자격 회차 줄은 eligibility-event · 동시 수정 · 뺀 뒤 not-found · 바꾼 기록 event.add/edit/delete(UUID 없음)", async () => {
  const added = rxNeed(RX.added, "RX.added"); rxNeed(RX.linked, "RX.linked");
  await rowFixtures();
  const t = people.bibleevent.token;
  const del = (row, expect = row.updated_at) => call(t, "evRowDelete", { id: row.id, expect });

  assert.equal((await del(RX.app)).body.error, "app-row");
  assert.equal((await del(RX.el)).body.error, "eligibility-event");      // 계약 §5 — 자격 회차의 줄 빼기도 서버가 막는다
  assert.equal((await rest(`event_signups?select=id&id=in.(${RX.app.id},${RX.el.id})`, "GET")).length, 2, "앱 줄·자격 줄은 남는다");
  assert.equal((await del(added, "1999-01-01T00:00:00+00:00")).body.error, "conflict");
  const d = await del(added);
  assert.equal(d.body.ok, true, JSON.stringify(d.body));
  assert.deepEqual(d.body.deleted, { id: added.id, name: rxName("new") });
  rxClean(d);
  assert.equal((await rest(`event_signups?select=id&id=eq.${added.id}`, "GET")).length, 0);
  assert.equal((await del(added)).body.error, "not-found");
  assert.equal((await call(t, "evRowDelete", { id: 0, expect: "" })).body.error, "not-found");

  // 바꾼 기록 — Task 13 audit.js 가 읽는 모양
  const ours = new Set([...RX.rowIds, RX.edit.id, RX.old.id, RX.app.id, RX.el.id].map(String));
  const logs = (await call(people.super.token, "auditList", { limit: 200 })).body.rows
    .filter((r) => r.action.startsWith("event.") && ours.has(r.target));
  const acts = new Set(logs.map((r) => r.action));
  for (const a of ["event.add", "event.edit", "event.delete"]) assert.ok(acts.has(a), a + " " + JSON.stringify([...acts]));
  assert.ok(!UUID_RE.test(JSON.stringify(logs.map((r) => r.detail))), "기록에 UUID 꼴 값(user_id)이 실렸다");
  const addLog = logs.find((r) => r.action === "event.add" && r.target === String(RX.linked.id));
  assert.deepEqual(addLog.detail, { event_id: RX.ev, name: rxName("link"),
    row: { who_type: "교구", group: "믿음", sub: "3", position: "명예권사" }, linked: true });
  const editLog = logs.find((r) => r.action === "event.edit" && r.target === String(RX.linked.id));
  assert.deepEqual([editLog.detail.event_id, editLog.detail.name], [RX.ev, rxName("link")]);
  assert.deepEqual([editLog.detail.before, editLog.detail.after], [{ sub: "3" }, { sub: "4" }]);   // 바뀐 칸만
  const noteLog = logs.find((r) => r.action === "event.edit" && r.target === String(RX.edit.id));
  assert.deepEqual([noteLog.detail.before, noteLog.detail.after],
    [{ note: true }, { note: true }]);             // 메모는 고쳤다는 것만 — 글은 기록에 남기지 않는다(SEC-1)
  const delLog = logs.find((r) => r.action === "event.delete" && r.target === String(added.id));
  assert.deepEqual(delLog.detail, { event_id: RX.ev, name: rxName("new"),
    row: { who_type: "교구", group: "화평", sub: "7", position: "집사", hasNote: true, source: "import", hasUser: false } });
  const logText = JSON.stringify(logs.map((r) => r.detail));
  for (const memo of ["시험 메모", "확인함"]) assert.ok(!logText.includes(memo), "메모 글이 기록에 실렸다(SEC-1): " + memo);
});

// ---------- 성경필사(암송) — 명단 올리기 · 교인명부 찾기 (계획 Task 8) ----------
// 시험 자료는 첫 시험이 한 번 만든다(뒤 시험은 같은 약속을 기다린다).
function upFixtures() {
  upReady ??= (async () => {
    // 지난번이 도중에 멈춰 남긴 찌꺼기 — 고정 교인ID(PK 가 부딪혀 늘 지운다) · 시험 계정은 **한 시간 넘은 것만**
    //   (다른 세션이 개발에서 같은 시험을 돌리는 중이면 그쪽 계정을 지우지 않게 — Task 5 before() 와 같은 규칙).
    await rest(`church_people?person_id=in.(${UP_DIR_IDS.join(",")})`, "DELETE");
    const upStale = new Date(Date.now() - 3600 * 1000).toISOString();
    await rest(`users?name=like.ca-test-up-*&created_at=lt.${upStale}`, "DELETE");
    await rest("events", "POST", { id: UP.ev, title: "ca-test 명단 올리기 " + STAMP, opens_on: "2000-06-01", closes_on: "2000-06-30",
      status: "draft", kind: "signup", needs: { position: true, phone: false, memo: false, extra: [] } });
    // 앱 계정 셋 — 갑: 목장 「7」 · 을: 앱 로그인이 받은 「07」 그대로 · 병: 지금 소망 3(이 회차엔 옛 소속 소망 9 로 낸 앱 줄)
    for (const [k, gu, mok] of [["갑", "화평", "7"], ["을", "화평", "07"], ["병", "소망", "3"]]) {
      const [u] = await rest("users", "POST",
        { type: "교구", gu, mok, name: upName(k), identity_key: `교구|${gu}|${mok}|||${upName(k)}` });
      UP.uid[k] = u.id;
    }
    await rest("event_signups", "POST", { event_id: UP.ev, user_id: UP.uid["병"], ident_key: `교구|소망|9|||${upName("병")}`,
      who_type: "교구", group_name: "소망", sub_name: "9", name: upName("병"), position: "권사", source: "app" });
    // 교인명부 — 정(한 분 · 소망 12 권사) · 무(한 분 · 화평 5 권사) · 기(두 분 · 동명이인) · 다(21분 · 찾기 상한 20)
    // ⚠️ 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — dir() 한 모양으로만 만든다.
    const dir = (person_id, k, mok1, mok3, position) =>
      ({ person_id, name: upName(k), name_key: upName(k), kind2: "장년", mok1, mok3, position });
    await rest("church_people", "POST", [
      dir(990000011, "정", "소망", "소망-12목장", "권사"),
      dir(990000012, "무", "화평", "화평-5목장", "권사"),
      dir(990000013, "기", "믿음", "믿음-1목장", "집사"),
      dir(990000014, "기", "사랑", "사랑-2목장", "집사"),
      ...Array.from({ length: 21 }, (_, k) => dir(990000021 + k, "다", "은혜", "은혜-1목장", "")),
    ]);
    // 교적 목장 칸(church_mok) — 부서 칸까지 적는 모양이 달라 따로 한 번(PGRST102). 학은 아이인데 가족 교구·목장이 있다(나가면 안 된다).
    const dirCm = (person_id, k, kind2, mok1, mok3, school_dept, position) =>
      ({ person_id, name: upName(k), name_key: upName(k), kind2, mok1, mok3, school_dept, position });
    await rest("church_people", "POST", [
      dirCm(990000015, "남", "장년", "소망", "소망-남성1", "", "집사"),
      dirCm(990000016, "남", "장년", "소망", "소망-남성2", "", "집사"),
      dirCm(990000017, "학", "교회학교", "화평", "화평-3목장", "중등부", ""),
      dirCm(990000018, "청", "청년", "청년부", "", "", ""),
    ]);
  })();
  return upReady;
}

// 올릴 줄 열 — 차례가 곧 i(0부터)
const upRows = () => [
  { name: upName("갑") + "2", gu: "화평교구", mok: "07", pos: "집사님" }, // 0 넣음 — 끝 숫자·「교구」·07·「님」 다듬기, 계정 갑과 잇는다
  { name: upName("갑"), gu: "화평", mok: "7목장", pos: "집사" },          // 1 이미 — 파일 안(위 1번 줄)
  { name: upName("을"), gu: "화평", mok: "07", pos: "" },                 // 2 넣음 — 「07」 계정 을과 잇는다(명부엔 없어 직분은 빈칸)
  { name: upName("병"), gu: "소망", mok: "3", pos: "권사" },              // 3 이미 — 계정 병의 앱 줄(옛 소속 9 로 냈다)
  { name: upName("정"), gu: "", mok: "", pos: "" },                       // 4 채움 — 소망 12 권사
  { name: upName("무"), gu: "화평", mok: "", pos: "집사" },               // 5 채움 — 같은 교구라 목장 5 만, 직분 집사는 그대로
  { name: upName("기"), gu: "", mok: "", pos: "" },                       // 6 교인명부 동명이인(소속을 못 정했다)
  { name: upName("경"), gu: "", mok: "", pos: "" },                       // 7 빈칸 — 명부에 없음
  { name: 'ca-test-"x', gu: "화평", mok: "1", pos: "" },                  // 8 모양 틀림(bad-char)
  { name: upName("신"), gu: "화평", mok: "3", pos: "명예권사" },          // 9 넣음 — 목록 밖 직분(경고만)
];

test("성경필사 명단 올리기 살펴보기: 줄마다 판정 · 빈칸만 채운다 · 아무것도 안 넣는다 · 계정·교적 값이 새지 않는다 · people.fill", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const chk = await call(t, "evUploadCheck", { event_id: UP.ev, rows: upRows(), fill: true });
  assert.equal(chk.body.ok, true, JSON.stringify(chk.body));
  assert.deepEqual(Object.keys(chk.body).sort(), ["counts", "ok", "rows", "total"]);
  assert.equal(chk.body.total, 1, "이 회차 지금 인원(앱 줄 하나)");
  assert.deepEqual(chk.body.rows.map((r) => r.i), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(chk.body.rows.map((r) => r.mark),
    ["add", "same", "add", "same", "fill", "fill", "same-name", "blank", "bad", "add"], JSON.stringify(chk.body.rows));
  assert.deepEqual(chk.body.counts, { add: 3, same: 2, blank: 1, bad: 1, fill: 2, sameName: 1, oddPosition: 1 });
  const at = (i) => chk.body.rows[i];
  // 알림(notes)은 화면이 그대로 보인다 — 글자까지 맞댄다(events-upload.ts · events-rules.ts tidyRaw 의 문구)
  assert.deepEqual(at(0).notes, [`이름 끝 숫자를 뗐어요 (${upName("갑")}2 → ${upName("갑")})`, "앱 계정과 이어요"]);
  assert.deepEqual(at(4).notes, ["소속(교구·부서)이 비어 있어요", "빈칸을 교인명부로 채웠어요"]);
  assert.deepEqual(at(7).notes, ["소속(교구·부서)이 비어 있어요", "교인명부에 없는 이름이라 빈칸을 채우지 못했어요"]);
  assert.ok(at(9).notes.includes("직분 「명예권사」 — 앱 직분 목록에 없어요(적은 그대로 넣어요)"), JSON.stringify(at(9).notes));
  assert.deepEqual(at(0).row, { who_type: "교구", group: "화평", sub: "7", name: upName("갑"), position: "집사" });
  assert.deepEqual(at(4).row, { who_type: "교구", group: "소망", sub: "12", name: upName("정"), position: "권사" });
  assert.deepEqual(at(5).row, { who_type: "교구", group: "화평", sub: "5", name: upName("무"), position: "집사" },
    "빈 칸(목장)만 채우고 적혀 있던 직분은 덮지 않는다");
  assert.equal(at(8).error, "bad-char");
  for (const r of chk.body.rows) {
    assert.deepEqual(Object.keys(r).sort(), UP_OUT_KEYS);
    if (r.row) assert.deepEqual(Object.keys(r.row).sort(), UP_ROW_KEYS);
  }
  const text = JSON.stringify(chk.body);
  assert.ok(!UUID_RE.test(text), "응답에 계정 id(UUID 꼴)가 실렸다");
  for (const k of ["user_id", "ident_key", "person_id", "소망-12목장", "화평-5목장"]) assert.ok(!text.includes(k), "새어 나감: " + k);
  // 살펴보기는 아무것도 넣지 않는다 — 앱 줄 하나 그대로
  assert.equal(await dbCount(UP.ev), 1);

  // 채우기를 끄면 — 소속이 빈 줄은 모두 빈칸, 목장만 빈 줄(5)은 그대로 넣음
  const off = await call(t, "evUploadCheck", { event_id: UP.ev, rows: upRows(), fill: false });
  assert.deepEqual(off.body.rows.map((r) => r.mark), ["add", "same", "add", "same", "blank", "add", "blank", "blank", "bad", "add"]);
  assert.equal(off.body.rows[5].row.sub, "");

  // people.fill — 채운 두 분의 이름이 「교인명부 기록」에 한 줄(채우기를 끈 살펴보기는 남기지 않는다)
  const fills = (await call(people.super.token, "auditList", { limit: 100, kind: "people" })).body.rows
    .filter((r) => r.action === "people.fill" && r.target === UP.ev);
  assert.equal(fills.length, 1, JSON.stringify(fills));
  assert.equal(fills[0].detail.rows, 2);
  assert.deepEqual([...fills[0].detail.names].sort(), [upName("무"), upName("정")].sort());
  // 물은 이름(SEC-2) — 빈칸이 있는 줄(을·정·무·기·경)만, 줄 차례대로 · 빈칸이 없는 줄(갑·병·신)과 모양 틀린 줄은 묻지 않았다
  assert.deepEqual(Object.keys(fills[0].detail).sort(), ["asked", "askedNames", "names", "rows"]);   // jsonb 는 칸 차례를 안 지킨다
  assert.equal(fills[0].detail.asked, 5);
  assert.deepEqual(fills[0].detail.askedNames, ["을", "정", "무", "기", "경"].map(upName));
});

test("성경필사 명단 올리기 넣기: 넣을 줄만 · 계정은 찾기만 해서 잇는다 · 메모 표기 · 두 번째는 0건 · event.upload 는 건수만(납작하게)", async () => {
  await upFixtures();
  // 이 회차의 people.fill 수 — 살펴보기 시험이 앞에서 돌았는지와 상관없이 「넣기 전과 같다」로만 본다
  const fillsOf = async () => (await call(people.super.token, "auditList", { limit: 200, kind: "people" })).body.rows
    .filter((r) => r.action === "people.fill" && r.target === UP.ev).length;
  const fills0 = await fillsOf();
  const t = people.bibleevent.token;
  const s1 = await call(t, "evUploadSave", { event_id: UP.ev, rows: upRows(), fill: true });
  assert.equal(s1.body.ok, true, JSON.stringify(s1.body));
  assert.deepEqual(Object.keys(s1.body).sort(), ["counts", "failed", "ok", "saved"]);
  assert.equal(s1.body.saved, 5, JSON.stringify(s1.body));
  assert.deepEqual(s1.body.failed, []);
  assert.ok(!UUID_RE.test(JSON.stringify(s1.body)));
  const got = await rest(`event_signups?select=name,user_id,ident_key,group_name,sub_name,position,note,source`
    + `&event_id=eq.${UP.ev}&source=eq.import&order=id`, "GET");
  const by = Object.fromEntries(got.map((r) => [r.name, r]));
  assert.deepEqual(Object.keys(by).sort(), [upName("갑"), upName("을"), upName("정"), upName("무"), upName("신")].sort());
  assert.equal(by[upName("갑")].user_id, UP.uid["갑"]);
  assert.equal(by[upName("갑")].ident_key, `교구|화평|7|||${upName("갑")}`);
  assert.equal(by[upName("갑")].note, "명단 올리기");
  assert.equal(by[upName("을")].user_id, UP.uid["을"], "앱 로그인이 받은 「07」 계정도 잇는다");
  assert.equal(by[upName("을")].sub_name, "7");
  assert.equal(by[upName("정")].user_id, null);
  assert.deepEqual([by[upName("정")].group_name, by[upName("정")].sub_name, by[upName("정")].position], ["소망", "12", "권사"]);
  assert.equal(by[upName("정")].note, "명단 올리기 / 소속: 교인명부로 채움");
  assert.deepEqual([by[upName("무")].sub_name, by[upName("무")].position], ["5", "집사"]);
  assert.equal(by[upName("신")].position, "명예권사");
  // 계정을 새로 만들지 않는다 · 앱 줄은 건드리지 않는다
  assert.equal((await rest(`users?select=id&name=like.ca-test-up-${STAMP}-*`, "GET")).length, 3);
  assert.deepEqual(await rest(`event_signups?select=sub_name,source,note&event_id=eq.${UP.ev}&source=eq.app`, "GET"),
    [{ sub_name: "9", source: "app", note: "" }]);

  // 같은 것을 다시 넣으면 모두 「이미 있음」 — 0건
  const s2 = await call(t, "evUploadSave", { event_id: UP.ev, rows: upRows(), fill: true });
  assert.equal(s2.body.ok, true, JSON.stringify(s2.body));
  assert.equal(s2.body.saved, 0, JSON.stringify(s2.body));
  assert.equal(s2.body.counts.add + s2.body.counts.fill, 0, JSON.stringify(s2.body.counts));
  assert.equal(s2.body.counts.same, 7, JSON.stringify(s2.body.counts));
  assert.equal(await dbCount(UP.ev), 6);

  // 기록 — event.upload 두 줄(건수만 · 납작하게 · 이름 없음 · 최근 먼저) · people.fill 은 넣기로 늘지 않는다
  const ups = (await call(people.super.token, "auditList", { limit: 100 })).body.rows
    .filter((r) => r.action === "event.upload" && r.target === UP.ev);
  assert.equal(ups.length, 2, JSON.stringify(ups));
  assert.deepEqual(ups.map((u) => u.detail.saved), [0, 5]);
  assert.deepEqual(ups[1].detail, { rows: 10, fillOn: true, add: 3, same: 2, blank: 1, bad: 1, fill: 2, sameName: 1,
    oddPosition: 1, saved: 5, failed: 0 });
  for (const u of ups) assert.ok(!JSON.stringify(u.detail).includes("ca-test-up-"), "event.upload 에 이름이 실렸다");
  assert.equal(await fillsOf(), fills0, "people.fill 은 살펴보기에서만 남는다 — 넣기로 늘지 않는다");
});

test("성경필사 명단 올리기: 채우기 끄고 올린 뒤 채우기 켜고 다시 올려도 0건 · 앱의 99 줄이 있으면 목장을 적어 올려도 이미 있음(최종 검토 I1)", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const ev = "ca-test-up2-" + STAMP;                   // after() 가 ca-test-*<STAMP>* 로 지운다(줄은 CASCADE)
  await rest("events", "POST", { id: ev, title: "ca-test 명단 올리기 2 " + STAMP, opens_on: "2000-07-01", closes_on: "2000-07-31",
    status: "draft", kind: "signup", needs: { position: true, phone: false, memo: false, extra: [] } });
  // 앱에서 목장 「99」(목장 없음)로 로그인해 낸 줄(앱 줄은 계정이 있어야 한다 — 계정은 after() 가 ca-test-up-<STAMP>-* 로 지운다)
  const [u99] = await rest("users", "POST",
    { type: "교구", gu: "은혜", mok: "99", name: upName("구"), identity_key: `교구|은혜|99|||${upName("구")}` });
  await rest("event_signups", "POST", { event_id: ev, user_id: u99.id, ident_key: `교구|은혜|99|||${upName("구")}`,
    who_type: "교구", group_name: "은혜", sub_name: "99", name: upName("구"), position: "", source: "app" });
  const rows = [{ name: upName("무"), gu: "화평", mok: "", pos: "집사" }];   // 교인명부: 무 = 화평 5(한 분)
  const s1 = await call(t, "evUploadSave", { event_id: ev, rows, fill: false });
  assert.equal(s1.body.ok, true, JSON.stringify(s1.body));
  assert.equal(s1.body.saved, 1, "채우기를 끄면 목장이 빈 채로 넣는다 " + JSON.stringify(s1.body));
  const s2 = await call(t, "evUploadSave", { event_id: ev, rows, fill: true });
  assert.equal(s2.body.ok, true, JSON.stringify(s2.body));
  assert.equal(s2.body.saved, 0, "채우기를 켜고 다시 올려도 두 번 넣지 않는다 " + JSON.stringify(s2.body));
  assert.equal(s2.body.counts.same, 1, JSON.stringify(s2.body.counts));
  const chk = await call(t, "evUploadCheck", { event_id: ev, rows: [{ name: upName("구"), gu: "은혜", mok: "20", pos: "" }], fill: false });
  assert.equal(chk.body.ok, true, JSON.stringify(chk.body));
  assert.deepEqual(chk.body.rows.map((r) => r.mark), ["same"], JSON.stringify(chk.body.rows));
  assert.equal((await rest(`event_signups?select=id&event_id=eq.${ev}`, "GET")).length, 2);
});

test("성경필사 명단 올리기 막기: 자격 회차 eligibility-event · 600줄 넘음 too-many · 없는 회차 not-found — 아무것도 안 들어간다", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const one = [{ name: upName("갑"), gu: "화평", mok: "7", pos: "" }];
  const many = Array.from({ length: 601 }, () => ({ name: "홍길동", gu: "화평", mok: "1", pos: "" }));
  const elBefore = await dbCount(EV_EL_ID);   // Task 5 의 자격 회차(needs.eligibility)
  const upBefore = await dbCount(UP.ev);
  for (const a of ["evUploadCheck", "evUploadSave"]) {
    assert.equal((await call(t, a, { event_id: EV_EL_ID, rows: one, fill: true })).body.error, "eligibility-event", a);
    assert.equal((await call(t, a, { event_id: UP.ev, rows: many, fill: false })).body.error, "too-many", a);
    assert.equal((await call(t, a, { event_id: "ca-test-none-" + STAMP, rows: one, fill: false })).body.error, "not-found", a);
    assert.equal((await call(t, a, { event_id: "BAD ID", rows: one, fill: false })).body.error, "not-found", a);
  }
  assert.equal(await dbCount(EV_EL_ID), elBefore, "자격 회차에 줄이 들어갔다");
  assert.equal(await dbCount(UP.ev), upBefore);
});

test("성경필사 교인명부 찾기: 이름이 정확히 같은 분만 · 20명까지 · 다섯 칸 + 교적 목장 칸만 · 기준일 · people.lookup 에 검색어·결과 수", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const one = await call(t, "evPeopleLookup", { name: upName("정") });
  assert.equal(one.body.ok, true, JSON.stringify(one.body));
  assert.deepEqual(Object.keys(one.body).sort(), ["ok", "people", "source"]);
  assert.equal(one.body.source.date, "2000-01-01");      // before() 가 올린 시험 명부 기록이 가장 최근이다
  assert.equal(typeof one.body.source.total, "number");
  assert.deepEqual(one.body.people,
    [{ name: upName("정"), who_type: "교구", group: "소망", sub: "12", position: "권사", church_mok: "소망-12목장" }]);
  const two = await call(t, "evPeopleLookup", { name: upName("기") });
  assert.equal(two.body.people.length, 2);
  for (const p of [...one.body.people, ...two.body.people]) assert.deepEqual(Object.keys(p).sort(), UP_CAND_KEYS);
  // 띄어쓰기가 달라도 같은 이름(이름 키) · 21분이어도 20명까지
  assert.equal((await call(t, "evPeopleLookup", { name: " " + upName("다") + " " })).body.people.length, 20, "상한 20명");
  assert.deepEqual((await call(t, "evPeopleLookup", { name: "ca-test-up-" + STAMP })).body.people, [],
    "앞부분만 같은 이름은 찾지 않는다(정확히 같은 이름만)");
  const text = JSON.stringify([one.body, two.body]);
  for (const k of ["person_id", "name_key", "mok1", "mok3", "kind2", "position_detail", "school_dept"]) assert.ok(!text.includes(k), "새어 나감: " + k);
  assert.equal((await call(t, "evPeopleLookup", { name: "" })).body.error, "no-name");
  assert.equal((await call(t, "evPeopleLookup", { name: "홍,길동" })).body.error, "bad-char");
  assert.equal((await call(t, "evPeopleLookup", { name: "가".repeat(41) })).body.error, "too-long");

  const logs = (await call(people.super.token, "auditList", { limit: 100, kind: "people" })).body.rows
    .filter((r) => r.action === "people.lookup");
  const qs = logs.map((r) => r.detail.q);
  for (const k of ["정", "기", "다"]) assert.ok(qs.includes(upName(k)), "people.lookup 에 검색어가 없다: " + k);
  assert.equal(logs.find((r) => r.detail.q === upName("정")).detail.count, 1);
  assert.equal(logs.find((r) => r.detail.q === upName("다")).detail.count, 20);
  const changes = (await call(people.super.token, "auditList", { limit: 100 })).body.rows.map((r) => r.action);
  assert.ok(!changes.includes("people.lookup") && !changes.includes("people.fill"), "교인명부 열람이 「바꾼 기록」 기본 보기에 섞였다");
});

// 친구 요청(2026-09-30) — 소망은 남성1·남성2 목장이 있는데 옮겨 적으면 둘 다 「남성」이라 같은 이름 두 분을 가려내지 못한다.
// 찾기 후보에만 교적 목장 칸 그대로(church_mok)를 싣는다 — 교구 분은 mok3, 그 밖은 부서(없으면 mok1). evPerson·빈칸 채우기는 다섯 칸 그대로.
test("성경필사 교인명부 찾기 후보의 교적 목장(church_mok): 소망-남성1·남성2 를 가려낸다 · 아이는 부서(가족 목장 아님) · 청년부 · evPerson·빈칸 채우기엔 없다", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const men = await call(t, "evPeopleLookup", { name: upName("남") });
  assert.equal(men.body.ok, true, JSON.stringify(men.body));
  assert.deepEqual(men.body.people, [
    { name: upName("남"), who_type: "교구", group: "소망", sub: "남성", position: "집사", church_mok: "소망-남성1" },
    { name: upName("남"), who_type: "교구", group: "소망", sub: "남성", position: "집사", church_mok: "소망-남성2" },
  ], "옮겨 적은 다섯 칸은 같고 교적 목장 칸으로 갈린다(교인ID 차례)");
  const kid = await call(t, "evPeopleLookup", { name: upName("학") });
  assert.deepEqual(kid.body.people,
    [{ name: upName("학"), who_type: "교회학교", group: "중등부", sub: "", position: "", church_mok: "중등부" }]);
  const youth = await call(t, "evPeopleLookup", { name: upName("청") });
  assert.deepEqual(youth.body.people,
    [{ name: upName("청"), who_type: "교회학교", group: "청년부", sub: "", position: "", church_mok: "청년부" }]);
  for (const b of [men.body, kid.body, youth.body]) for (const p of b.people) assert.deepEqual(Object.keys(p).sort(), UP_CAND_KEYS);
  const text = JSON.stringify([men.body, kid.body, youth.body]);
  assert.ok(!text.includes("화평"), "아이의 가족 교구·목장이 나갔다");
  assert.ok(!UUID_RE.test(text), "UUID 꼴 값이 실렸다");
  for (const id of UP_CM_IDS) assert.ok(!text.includes(String(id)), "교인ID 가 실렸다: " + id);
  for (const k of ["person_id", "name_key", "mok1", "mok3", "kind2", "position_detail", "school_dept", "phone", "address", "birth", "photo"]) {
    assert.ok(!text.includes(k), "새어 나감: " + k);
  }
  // evPerson(성경필사 역할만 · basic) — 다섯 칸 그대로(교적 목장 칸 없음)
  const ep = await call(t, "evPerson", { name: upName("남"), who_type: "교구", group: "소망", sub: "남성" });
  assert.equal(ep.body.ok, true, JSON.stringify(ep.body));
  assert.equal(ep.body.mode, "basic");
  assert.ok(ep.body.people.length >= 1, JSON.stringify(ep.body));
  for (const p of ep.body.people) assert.deepEqual(Object.keys(p).sort(), UP_ROW_KEYS);
  const epText = JSON.stringify(ep.body);
  assert.ok(!epText.includes("church_mok") && !epText.includes("남성1") && !epText.includes("남성2"), "evPerson 이 넓어졌다: " + epText);
  // 빈칸 채우기(살펴보기) — 채운 줄도 다섯 칸 그대로 · 이 시험만의 회차(after() 가 ca-test-*<STAMP>* 로 지운다)
  const ev = "ca-test-upcm-" + STAMP;
  await rest("events", "POST", { id: ev, title: "ca-test 교적 목장 " + STAMP, opens_on: "2000-08-01", closes_on: "2000-08-31",
    status: "draft", kind: "signup", needs: { position: true, phone: false, memo: false, extra: [] } });
  const chk = await call(t, "evUploadCheck", { event_id: ev, fill: true, rows: [
    { name: upName("학"), gu: "", mok: "", pos: "" },       // 아이 한 분 → 중등부로 채움
    { name: upName("청"), gu: "", mok: "", pos: "" },       // 청년 한 분 → 청년부로 채움
  ] });
  assert.equal(chk.body.ok, true, JSON.stringify(chk.body));
  assert.deepEqual(chk.body.rows.map((r) => r.mark), ["fill", "fill"], JSON.stringify(chk.body.rows));
  assert.deepEqual(chk.body.rows.map((r) => r.row.group), ["중등부", "청년부"]);
  for (const r of chk.body.rows) assert.deepEqual(Object.keys(r.row).sort(), UP_ROW_KEYS);
  assert.ok(!JSON.stringify(chk.body).includes("church_mok"), "빈칸 채우기가 넓어졌다");
});

// ---------- 성경필사(암송) — 이름을 누르면 교적 창 evPerson (계획 Task 16) ----------
// 교인명부는 before() 의 세 분(990000001~3)과 Task 8 upFixtures 의 스물다섯 분(ca-test-up-<STAMP>-정·무·기·기·다×21)을 쓴다.
// 「성경필사 + 교인명부」 두 역할을 가진 분은 처음 부를 때 한 번 만든다 — people 에 먼저 넣어 두면 after() 가 지운다
// (권한 표는 사람 이름을 따로 적어 돌므로 이분은 거기 끼지 않는다). 함수 선언이라 파일 끝에 있어도 먼저 읽힌다.
async function bedirPerson() {
  if (!people.bedir) {
    people.bedir = await makeUser("bedir");
    await makeMember(people.bedir, "active", ["bibleevent", "directory"]);
  }
  return people.bedir;
}

test("성경필사 이름을 누르면(evPerson) — 성경필사 역할만: 다섯 칸 + 교적 표시 · 교인ID·연락처·주소 없음 · 고르는 규칙은 명단의 교적 표시와 같다 · people.lookup", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const ask = (name, who_type, group, sub) => call(t, "evPerson", { name, who_type, group, sub });
  const none = "ca-test-pp-" + STAMP;   // 명부에 없는 이름 — 이 두 시험만 쓴다(기록 세기)

  // ① 소속까지 같은 분 한 분(명부 믿음 1) → 그분 한 분만(같은 이름의 사랑 2 분은 싣지 않는다)
  const one = await ask(upName("기"), "교구", "믿음", "1");
  assert.equal(one.body.ok, true, JSON.stringify(one.body));
  assert.deepEqual(Object.keys(one.body).sort(), ["church", "mode", "ok", "people", "pick", "total"]);
  assert.deepEqual([one.body.mode, one.body.pick, one.body.total], ["basic", 0, 2], "total 은 명부의 같은 이름 수(고른 한 분만 싣더라도)");
  assert.deepEqual(one.body.people, [{ name: upName("기"), who_type: "교구", group: "믿음", sub: "1", position: "집사" }]);
  assert.deepEqual(one.body.church, { state: "맞음", reason: "" });
  // ② 같은 소속이 없고 동명이인 둘 → 고르지 않고 둘 다(교인ID 차례)
  const two = await ask(upName("기"), "교구", "믿음", "3");
  assert.deepEqual([two.body.pick, two.body.total], [null, 2]);
  assert.deepEqual(two.body.people.map((p) => p.group), ["믿음", "사랑"]);
  assert.deepEqual(two.body.church, { state: "확인 필요", reason: "같은 이름 2명" });
  // ③ 이름이 명부에 한 분뿐 → 소속이 달라도 그분(교적 표시는 「확인 필요」 그대로 함께 간다)
  const lone = await ask(upName("정"), "교구", "화평", "5");
  assert.deepEqual([lone.body.pick, lone.body.total], [0, 1]);
  assert.deepEqual(lone.body.people.map((p) => [p.group, p.sub, p.position]), [["소망", "12", "권사"]]);
  assert.deepEqual(lone.body.church, { state: "확인 필요", reason: "같은 이름 1명" });
  // ④ 명단(evRoster)의 교적 표시와 같다 — 같은 줄로 물으면 같은 표시(같은 함수·같은 후보)
  const ros = await call(t, "evRoster", { event_id: EV_ID });
  for (const row of ros.body.rows) {
    const r = await ask(row.name, row.who_type, row.group, row.sub);
    assert.deepEqual(r.body.church, row.church, row.name);
  }
  // ⑤ 명부에 없는 이름 → 빈 목록 · 「없음」
  const miss = await ask(none, "교구", "시험", "7");
  assert.deepEqual([miss.body.mode, miss.body.pick, miss.body.total, miss.body.people, miss.body.church],
    ["basic", null, 0, [], { state: "없음", reason: "" }]);
  // ⑥ 못 고르면 스무 분까지(evPeopleLookup 과 같은 상한) — total 은 자르기 전 수(화면이 「21분(앞 20분만)」으로 적는다)
  const many = (await ask(upName("다"), "교구", "화평", "1")).body;
  assert.deepEqual([many.pick, many.people.length, many.total], [null, 20, 21]);
  // ⑦ 새어 나가지 않는다 — 교인ID(숫자)·UUID·명부에만 있는 전화·주소·원래 칸
  const min = await ask("ca-test-min", "교구", "시험", "0");
  assert.deepEqual(min.body.people, [{ name: "ca-test-min", who_type: "", group: "", sub: "", position: "집사" }],
    "명부 교구 칸이 일곱 교구 밖(시험)이면 소속 세 칸은 비운다(옮겨 적기 규칙)");
  const text = JSON.stringify([one.body, two.body, lone.body, min.body]);
  assert.ok(!UUID_RE.test(text), "UUID 꼴 값이 실렸다");
  for (const id of [990000001, 990000003, ...UP_DIR_IDS]) assert.ok(!text.includes(String(id)), "교인ID 가 실렸다: " + id);
  for (const k of ["person_id", CHURCH_ONLY_PHONE, "010-0000-0000", "비밀주소", "photo", "name_key", "mok1", "mok3", "kind2",
    "position_detail", "소망-12목장"]) assert.ok(!text.includes(k), "새어 나감: " + k);
  for (const b of [one.body, two.body, lone.body, min.body]) for (const p of b.people) assert.deepEqual(Object.keys(p).sort(), UP_ROW_KEYS);
  // ⑧ 틀린 이름은 명부에 묻지 않는다
  assert.equal((await ask("", "교구", "화평", "1")).body.error, "no-name");
  // 읽기만 하는 길은 readName — 큰따옴표·역슬래시·세로줄만 막는다(쉼표·괄호가 든 옛 이름은 누를 수 있다 · SEC-7)
  assert.equal((await ask('홍"길동', "교구", "화평", "1")).body.error, "bad-char");
  assert.equal((await ask("가".repeat(41), "교구", "화평", "1")).body.error, "too-long");
  // ⑨ 기록 — 부를 때마다 people.lookup {q, count}(「교인명부 기록」 · evPeopleLookup 과 같은 모양) · 명부에 없는 이름도
  const logs = (await call(people.super.token, "auditList", { limit: 100, kind: "people" })).body.rows
    .filter((r) => r.action === "people.lookup");
  const mine = logs.filter((r) => r.detail.q === none);
  assert.equal(mine.length, 1, JSON.stringify(mine));
  assert.deepEqual(mine[0].detail, { q: none, count: 0 });
  assert.ok(logs.some((r) => r.detail.q === upName("기") && r.detail.count === 1), "고른 한 분만 보여 준 것도 남는다(결과 수 1)");
});

test("성경필사 이름을 누르면(evPerson) — 교인명부 역할도 있으면·총괄: 교인ID 로 「자세히」 창 · 못 고르면 후보 · 한 분을 골랐으면 기록하지 않고 못 고르면 people.lookup", async () => {
  const none = "ca-test-pp-" + STAMP;   // 명부에 없는 이름 — 앞 시험(basic)과 이 시험만 쓴다(기록 세기)
  await upFixtures();
  const bedir = await bedirPerson();
  const q = { name: upName("기"), who_type: "교구", group: "믿음", sub: "1" };
  // 교인명부 기록 가운데 mark(기록 id) 뒤에 남은 people.lookup — 최근 것이 앞(auditList 는 id 내림차순)
  //   이번 실행의 두 검색어만 — 같은 개발 DB의 다른 세션 people.lookup 이 섞이거나 한 쪽(200줄) 밖으로 밀리지 않게
  const lookupsAfter = async (mark) => (await call(people.super.token, "auditList", { limit: 200, kind: "people" })).body.rows
    .filter((r) => r.id > mark && r.action === "people.lookup" && [upName("기"), none].includes(r.detail?.q)).map((r) => r.detail);
  const mark = (await call(people.super.token, "auditList", { limit: 1, kind: "people" })).body.rows[0]?.id ?? 0;
  for (const who of ["bedir", "super"]) {
    const r = await call(people[who].token, "evPerson", q);
    assert.equal(r.body.ok, true, who + " " + JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body).sort(), ["candidates", "mode", "ok", "pick", "total"], who);
    assert.deepEqual([r.body.mode, r.body.pick, r.body.total], ["full", 0, 2], who);
    assert.deepEqual(r.body.candidates, [{ person_id: 990000013, name: upName("기"), label: "믿음 1목장", position: "집사" }], who);
  }
  // 한 분을 골랐으면(pick 0) 여기서는 남기지 않는다 — 화면이 곧바로 「자세히」 창을 열고 peoplePerson 이 people.view 를 남긴다
  assert.deepEqual(await lookupsAfter(mark), [], "pick 0 인 full 이 people.lookup 을 남겼다(이름 한 번에 두 줄이 된다)");
  // 못 고르면 후보 — 교인ID 차례 · 이때는 이름·소속·직분·교인ID 가 여러 분 나가므로 people.lookup {q, count}
  const two = await call(bedir.token, "evPerson", { ...q, sub: "3" });
  assert.deepEqual([two.body.pick, two.body.total], [null, 2]);
  assert.deepEqual(two.body.candidates.map((c) => [c.person_id, c.label]), [[990000013, "믿음 1목장"], [990000014, "사랑 2목장"]]);
  assert.deepEqual(await lookupsAfter(mark), [{ q: upName("기"), count: 2 }]);
  // 연락처·주소·사진·원래 칸은 full 에도 없다 — 그것은 「자세히」 창(peoplePerson)이 교인명부 역할을 다시 확인하고 준다
  const min = await call(bedir.token, "evPerson", { name: "ca-test-min", who_type: "교구", group: "시험", sub: "0" });
  assert.deepEqual(min.body.candidates, [{ person_id: 990000001, name: "ca-test-min", label: "시험", position: "집사" }]);
  const text = JSON.stringify([min.body, two.body]);
  assert.ok(!UUID_RE.test(text), "UUID 꼴 값이 실렸다");
  for (const k of [CHURCH_ONLY_PHONE, "010-0000-0000", "비밀주소", "photo", "household", "name_key", "mok3", "kind2", "position_detail"]) {
    assert.ok(!text.includes(k), "새어 나감: " + k);
  }
  const pp = await call(bedir.token, "peoplePerson", { id: min.body.candidates[0].person_id });
  assert.equal(pp.body.ok, true, JSON.stringify(pp.body));
  assert.equal(pp.body.person.name, "ca-test-min");
  // 명부에 없는 이름 → 빈 후보(pick null) · 못 고른 것이니 people.lookup {q, count: 0} — 앞 시험의 basic 한 줄과 합해 두 줄
  //   (ca-test-min 은 명부에 한 분뿐이라 골랐다(pick 0) — 그 부름은 기록이 없고, 위 peoplePerson 이 people.view 를 남겼다)
  const miss = await call(bedir.token, "evPerson", { name: none, who_type: "교구", group: "시험", sub: "7" });
  assert.deepEqual([miss.body.mode, miss.body.pick, miss.body.total, miss.body.candidates], ["full", null, 0, []]);
  assert.deepEqual(await lookupsAfter(mark), [{ q: none, count: 0 }, { q: upName("기"), count: 2 }]);
  const logs = (await call(people.super.token, "auditList", { limit: 100, kind: "people" })).body.rows;
  assert.equal(logs.filter((r) => r.action === "people.lookup" && r.detail.q === none).length, 2, "basic(앞 시험) 한 줄 + 못 고른 full 한 줄");
  // 교인명부 역할만 있는 분은 이 액션을 못 부른다(성경필사 메뉴의 액션 — 권한 표도 PROBE 로 본다)
  const dir = await call(people.directory.token, "evPerson", q);
  assert.deepEqual([dir.status, dir.body.error], [403, "forbidden"]);
});

// ---------- 사역신청·담당자 — 이름을 누르면 교적 창 ministryPerson (2026-09-30 검토 3·4·5·6) ----------
// evPerson 시험을 본떴다. 교인명부는 mpFixtures 의 세 분(믿음 1 집사 · 사랑 2 권사 · 사랑 2 집사 — 같은 이름, 번호 하나씩)과
// before() 의 ca-test-min(시험-0목장) · PAPER_NAME(시험-5목장)을 쓴다. 이름·번호·주소는 모두 지어낸 것.
function mpFixtures() {
  mpReady ??= (async () => {
    await rest(`church_people?person_id=in.(${MP.ids.join(",")})`, "DELETE");   // 고정 교인ID — 지난번 찌꺼기(PK 가 부딪힌다)
    // ⚠️ 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — d() 한 모양으로만 만든다.
    const d = (person_id, mok1, mok3, position, n) => ({ person_id, name: MP.name, name_key: MP.name, kind2: "장년", mok1, mok3,
      position, phone1: mpPhone(n), phone_digits: mpPhone(n).replace(/\D/g, ""), address: "시험시 비밀주소 " + STAMP });
    await rest("church_people", "POST", [
      d(MP.ids[0], "믿음", "믿음-1목장", "집사", 51),
      d(MP.ids[1], "사랑", "사랑-2목장", "권사", 52),
      d(MP.ids[2], "사랑", "사랑-2목장", "집사", 53),
    ]);
  })();
  return mpReady;
}

// 「사역신청 + 교인명부」 두 역할을 가진 분 — 처음 부를 때 한 번 만든다(people 에 넣어 두면 after() 가 지운다 · bedirPerson 과 같다)
async function mindirPerson() {
  if (!people.mindir) {
    people.mindir = await makeUser("mindir");
    await makeMember(people.mindir, "active", ["ministry", "directory"]);
  }
  return people.mindir;
}

// 교인명부 기록의 마지막 id — 그 뒤에 남은 people.lookup 만 센다(같은 개발 DB의 다른 세션 기록이 섞이지 않게 이번 실행의 검색어로 거른다)
async function auditMark() {
  return (await call(people.super.token, "auditList", { limit: 1, kind: "people" })).body.rows[0]?.id ?? 0;
}
async function lookupsSince(mark, qs) {
  return (await call(people.super.token, "auditList", { limit: 200, kind: "people" })).body.rows
    .filter((r) => r.id > mark && r.action === "people.lookup" && qs.includes(r.detail?.q)).map((r) => r.detail);
}

// 응답에 실리면 안 되는 것 — 교인ID(숫자)·UUID·명부 번호(글자·숫자)·보낸 번호·주소·명부 원래 칸
function mpNoLeak(bodies, { ids = true } = {}) {
  const text = JSON.stringify(bodies);
  assert.ok(!UUID_RE.test(text), "UUID 꼴 값이 실렸다");
  if (ids) for (const id of [...MP.ids, 990000001, 990000002]) assert.ok(!text.includes(String(id)), "교인ID 가 실렸다: " + id);
  const phones = [51, 52, 53, 59].flatMap((n) => [mpPhone(n), mpPhone(n).replace(/\D/g, "")]);
  for (const k of [...phones, "010-1234-5678", "01012345678", CHURCH_ONLY_PHONE, "phone", "비밀주소", "address", "name_key", "mok1",
    "mok3", "kind2", "position_detail", "믿음-1목장", "사랑-2목장"]) assert.ok(!text.includes(k), "새어 나감: " + k);
}

test("사역신청 이름을 누르면(ministryPerson) — 사역신청 역할만: 다섯 칸 + 교적 표시 · 번호로 고르지 않는다 · 명단 표시와 같다 · 새지 않는다 · people.lookup {q, count, from}", async () => {
  await mpFixtures();
  const m = people.ministry.token;
  const ask = (extra) => call(m, "ministryPerson", { name: MP.name, ...extra });
  const mark = await auditMark();

  // ① 같은 소속 한 분(믿음 1) → 그분 한 분만(같은 이름 두 분은 싣지 않는다)
  const one = await ask({ who: "믿음 1목장" });
  assert.equal(one.body.ok, true, JSON.stringify(one.body));
  assert.deepEqual(Object.keys(one.body).sort(), ["church", "mode", "ok", "people", "pick", "total"]);
  assert.deepEqual([one.body.mode, one.body.pick, one.body.total], ["basic", 0, 3]);
  assert.deepEqual(one.body.people, [{ name: MP.name, who_type: "교구", group: "믿음", sub: "1", position: "집사" }]);
  assert.deepEqual(one.body.church, { state: "맞음", reason: "" });
  // ② 소속 다른 줄 + 명부 한 분(사랑 2 권사)의 번호 → 고르지 않는다(검토 4 — 아무 번호로 「이 번호는 누구」를 떠볼 수 없게).
  //    교적 표시만 명단처럼 「소속 다름」
  const ph = await ask({ who: "기쁨 3목장", phone: mpPhone(52) });
  assert.deepEqual([ph.body.mode, ph.body.pick, ph.body.total], ["basic", null, 3], JSON.stringify(ph.body));
  assert.deepEqual(ph.body.people.map((p) => [p.group, p.sub, p.position]), [["믿음", "1", "집사"], ["사랑", "2", "권사"], ["사랑", "2", "집사"]]);
  assert.deepEqual(ph.body.church, { state: "확인 필요", reason: "소속 다름" });
  // 번호가 틀려도 후보는 같다 — 번호에 따라 달라지는 것은 교적 표시뿐(명단 표시와 같은 수준)
  const wrong = await ask({ who: "기쁨 3목장", phone: mpPhone(59) });
  assert.deepEqual([wrong.body.pick, wrong.body.people], [null, ph.body.people]);
  assert.deepEqual(wrong.body.church, { state: "확인 필요", reason: "같은 이름 3명" });
  // 같은 소속 둘(사랑 2) + 그중 한 분 번호 → 그래도 고르지 않는다(같은 소속 먼저 · 교인ID 차례)
  const two = await ask({ who: "사랑 2목장", phone: mpPhone(53) });
  assert.deepEqual([two.body.pick, two.body.church], [null, { state: "확인 필요", reason: "같은 소속에 같은 이름 2명" }]);
  assert.deepEqual(two.body.people.map((p) => [p.group, p.position]), [["사랑", "권사"], ["사랑", "집사"], ["믿음", "집사"]]);

  // ③ 창의 표시 = 명단의 표시 — 신청 현황(ministryList)·종이 명단 살펴보기(ministryPaperCheck)의 줄을 화면이 보내는 그대로 보낸다
  //    (rowAsk: 이름·who·번호 / paperAsk: 교구·목장·이름·번호). 서버가 되읽는 식(ministryApplicant)과 명단 쪽 식이 갈라지면 여기서 잡힌다.
  const list = await call(m, "ministryList");
  assert.equal(list.body.ok, true, JSON.stringify(list.body));
  const mine = list.body.list.filter((x) => x.name === "ca-test-min");
  assert.ok(mine.length >= 1);
  for (const x of mine) {
    const r = await call(m, "ministryPerson", { name: x.name, who: x.who, ...(x.phone ? { phone: x.phone } : {}) });
    assert.deepEqual(r.body.church, x.church, "신청 현황 " + x.id);
  }
  const chk = await call(m, "ministryPaperCheck",
    { rows: [{ gu: "시험", mok: "0", name: PAPER_NAME, position: "집사", phone: "010-1234-5678", team: "없는팀-" + STAMP }] });
  assert.equal(chk.body.ok, true, JSON.stringify(chk.body));
  const pr = chk.body.rows[0];
  const pw = await call(m, "ministryPerson", { name: pr.name, who_type: "교구", group: pr.gu, sub: pr.mok, phone: pr.phone });
  assert.deepEqual(pw.body.church, pr.church, "종이 명단");
  assert.deepEqual(pw.body.church, { state: "확인 필요", reason: "소속 다름" }, "명부는 시험-5목장, 번호가 같다");

  // ④ 새어 나가지 않는다 — 교인ID·명부 번호·보낸 번호·주소·원래 칸
  mpNoLeak([one.body, ph.body, wrong.body, two.body, pw.body]);
  for (const b of [one.body, ph.body, two.body, pw.body]) for (const p of b.people) assert.deepEqual(Object.keys(p).sort(), UP_ROW_KEYS);
  // 틀린 이름은 명부에 묻지 않는다(evPerson 과 같은 readName)
  assert.equal((await call(m, "ministryPerson", { name: "", who: "믿음 1목장" })).body.error, "no-name");
  assert.equal((await call(m, "ministryPerson", { name: 'ca-test-"x', who: "믿음 1목장" })).body.error, "bad-char");

  // ⑤ 기록 — 부를 때마다 people.lookup 한 줄 {q, count, from:"ministry"} · 번호는 없다 · byPhone 없음(basic 은 번호로 고르지 않는다)
  //    최근 것이 앞(auditList 는 id 내림차순)
  const F = { q: MP.name, from: "ministry" };
  assert.deepEqual(await lookupsSince(mark, [MP.name]), [{ ...F, count: 3 }, { ...F, count: 3 }, { ...F, count: 3 }, { ...F, count: 1 }]);
  // 기록 줄을 담당자 화면이 「명부 찾기(사역신청·담당자)」로 읽는다 — audit.js 는 detail.from 을 본다(tests/audit.test.mjs)
});

test("사역신청 이름을 누르면(ministryPerson) — 교인명부 역할도 있으면·총괄: 교인ID 로 「자세히」 창 · 소속으로 한 분이면 기록 없음 · 번호로 고르면 byPhone · 못 고르면 people.lookup", async () => {
  await mpFixtures();
  const md = await mindirPerson();
  const mark = await auditMark();
  // 소속으로 한 분(믿음 1) — 번호가 다른 분 것이어도 소속이 먼저 · 기록 없음(「자세히」 창의 peoplePerson 이 people.view 를 남긴다)
  for (const who of ["mindir", "super"]) {
    const r = await call(people[who].token, "ministryPerson", { name: MP.name, who: "믿음 1목장", phone: mpPhone(52) });
    assert.equal(r.body.ok, true, who + " " + JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body).sort(), ["candidates", "mode", "ok", "pick", "total"], who);
    assert.deepEqual([r.body.mode, r.body.pick, r.body.total], ["full", 0, 3], who);
    assert.deepEqual(r.body.candidates, [{ person_id: MP.ids[0], name: MP.name, label: "믿음 1목장", position: "집사" }], who);
  }
  assert.deepEqual(await lookupsSince(mark, [MP.name]), [], "소속으로 고른 full 이 people.lookup 을 남겼다(이름 한 번에 두 줄이 된다)");
  // 같은 소속 둘(사랑 2) + 그중 한 분 번호 → 그분 · 번호로 가렸다는 사실만 한 줄(byPhone · 번호 없음)
  const bp = await call(md.token, "ministryPerson", { name: MP.name, who: "사랑 2목장", phone: mpPhone(53) });
  assert.deepEqual([bp.body.mode, bp.body.pick, bp.body.total], ["full", 0, 3], JSON.stringify(bp.body));
  assert.deepEqual(bp.body.candidates, [{ person_id: MP.ids[2], name: MP.name, label: "사랑 2목장", position: "집사" }]);
  const F = { q: MP.name, from: "ministry" };
  assert.deepEqual(await lookupsSince(mark, [MP.name]), [{ ...F, count: 1, byPhone: true }]);
  // 번호가 같은 소속 밖 분(믿음 1)과만 맞으면 고르지 않는다 — 같은 소속 먼저 · 교인ID 차례
  const out = await call(md.token, "ministryPerson", { name: MP.name, who: "사랑 2목장", phone: mpPhone(51) });
  assert.equal(out.body.pick, null);
  assert.deepEqual(out.body.candidates.map((c) => c.person_id), [MP.ids[1], MP.ids[2], MP.ids[0]]);
  // 담당자 화면 모양(who 없이 구분·소속·세부 · 번호 없음) — 같은 소속 둘이라 못 고름 → 후보 셋
  const mem = await call(md.token, "ministryPerson", { name: MP.name, who_type: "교구", group: "사랑", sub: "2" });
  assert.deepEqual([mem.body.pick, mem.body.candidates.map((c) => c.person_id)], [null, [MP.ids[1], MP.ids[2], MP.ids[0]]]);
  assert.deepEqual(await lookupsSince(mark, [MP.name]), [{ ...F, count: 3 }, { ...F, count: 3 }, { ...F, count: 1, byPhone: true }]);
  // 연락처·주소·원래 칸은 full 에도 없다(교인ID 만) — 그것은 「자세히」 창(peoplePerson)이 교인명부 역할을 다시 확인하고 준다
  mpNoLeak([bp.body, out.body, mem.body], { ids: false });
  const pp = await call(md.token, "peoplePerson", { id: bp.body.candidates[0].person_id });
  assert.equal(pp.body.ok, true, JSON.stringify(pp.body));
  assert.equal(pp.body.person.name, MP.name);
});

test("사역신청 이름을 누르면(ministryPerson) — 성경필사·교인명부 역할만인 분은 못 부른다(403)", async () => {
  await mpFixtures();
  for (const who of ["bibleevent", "directory"]) {
    const r = await call(people[who].token, "ministryPerson", { name: MP.name, who: "믿음 1목장" });
    assert.deepEqual([r.status, r.body.error], [403, "forbidden"], who);
  }
});

// ---------- 성경필사(암송) 작은 지적 A(2026-09-30) — 직분 NFC · 구분만 바꾸기 · 읽기 이름 · .in() 길이 ----------
test("성경필사 한 분 더하기: 자모분리(NFD) 직분도 완성형으로 — 「집사님」→집사 · 목록 안이라 경고 없음(최종 검토 M1)", async () => {
  await rowFixtures();
  const t = people.bibleevent.token;
  const a = await call(t, "evRowAdd", { event_id: RX.ev,
    row: { who_type: "교구", group: "화평", sub: "3", name: rxName("nfdpos"), position: "집사님".normalize("NFD"), note: "" } });
  if (a.body.row?.id) RX.rowIds.push(a.body.row.id);
  assert.equal(a.body.ok, true, JSON.stringify(a.body));
  rxClean(a);
  assert.equal(a.body.row.position, "집사");
  assert.deepEqual(a.body.warnings, [], "목록 안 직분인데 「앱 직분 목록에 없어요」 경고가 붙었다");
  assert.equal((await rxDb(a.body.row.id)).position, "집사");
});

test("성경필사 줄 고치기: 구분만 바꾸고 소속을 안 보내면 no-group — 옛 교구가 새 구분에 남지 않는다 · 소속을 함께 보내면 저장(최종 검토 M4)", async () => {
  await rowFixtures();
  const t = people.bibleevent.token;
  const a = await call(t, "evRowAdd", { event_id: RX.ev,
    row: { who_type: "교구", group: "화평", sub: "20", name: rxName("typechg"), position: "", note: "" } });
  if (a.body.row?.id) RX.rowIds.push(a.body.row.id);
  assert.equal(a.body.ok, true, JSON.stringify(a.body));
  const id = a.body.row.id;
  const s = await call(t, "evRowSave", { id, expect: a.body.row.updated_at, patch: { who_type: "교회학교" } });
  assert.equal(s.body.error, "no-group", JSON.stringify(s.body));
  const [d] = await rest(`event_signups?select=who_type,group_name,sub_name,updated_at&id=eq.${id}`, "GET");
  assert.deepEqual([d.who_type, d.group_name, d.sub_name], ["교구", "화평", "20"], "막힌 저장이 줄을 바꿨다");
  assert.equal(d.updated_at, a.body.row.updated_at);
  // 소속을 함께 보내면 저장된다(학년 칸 20 은 막지 않는다)
  const s2 = await call(t, "evRowSave", { id, expect: a.body.row.updated_at, patch: { who_type: "교회학교", group: "중등부" } });
  assert.equal(s2.body.ok, true, JSON.stringify(s2.body));
  rxClean(s2);
  assert.deepEqual([s2.body.row.who_type, s2.body.row.group, s2.body.row.sub], ["교회학교", "중등부", "20"]);
});

test("성경필사 이력·이름 누르기: 괄호가 든 옛 이름(「…(구)」)도 찾는다 · 큰따옴표·역슬래시·세로줄은 그대로 막는다(최종 검토 SEC-7)", async () => {
  const ev = `ca-test-paren-${STAMP}`;
  const name = `ca-test-paren-${STAMP}(구)`;
  await rest("events", "POST", { id: ev, title: "ca-test 괄호 이름 " + STAMP, opens_on: "2000-08-01", closes_on: "2000-08-31",
    status: "draft", kind: "signup", needs: { position: true, phone: false, memo: false, extra: [] } });
  await rest("event_signups", "POST", { event_id: ev, who_type: "교구", group_name: "화평", sub_name: "1", name,
    ident_key: `교구|화평|1|||${name}`, source: "import", position: "", note: "" });
  const t = people.bibleevent.token;
  const h = await call(t, "evHistory", { name });
  assert.equal(h.body.ok, true, JSON.stringify(h.body));
  assert.equal(h.body.groups.length, 1, JSON.stringify(h.body.groups));
  assert.deepEqual(h.body.groups[0].rows.map((x) => x.event_id), [ev]);
  assert.equal(h.body.groups[0].label, name + " · 화평 1목장");
  const p = await call(t, "evPerson", { name, who_type: "교구", group: "화평", sub: "1" });
  assert.equal(p.body.ok, true, JSON.stringify(p.body));
  assert.equal(p.body.mode, "basic");
  assert.deepEqual(p.body.people, [], "명부에 없는 이름");
  for (const bad of ['ca"test', "ca\\test", "ca|test"]) {
    assert.equal((await call(t, "evHistory", { name: bad })).body.error, "bad-char", "evHistory " + bad);
    assert.equal((await call(t, "evPerson", { name: bad, who_type: "교구", group: "화평", sub: "1" })).body.error, "bad-char", "evPerson " + bad);
  }
  // 한 분 더하기의 찾기(새 이름)는 그대로 막는다
  assert.equal((await call(t, "evPeopleLookup", { name })).body.error, "bad-char");
});

test("성경필사 명단 올리기 살펴보기: 40자 한글 이름 150줄도 빈칸 채우기가 주소 길이에 막히지 않는다(.in() 100개·6KB 묶음 · 최종 검토 SEC-4)", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  // 지어낸 이름 — 「험」 38자 + 음절 표 두 글자(끝이 숫자가 아니게 · 올리기는 이름 끝 숫자를 뗀다). 한 자 = 주소 9바이트라 100개면 36KB
  const S = "가나다라마바사아자차카타파하";
  const rows = Array.from({ length: 150 }, (_, i) => ({ name: "험".repeat(38) + S[i % 14] + S[Math.floor(i / 14) % 14], gu: "", mok: "", pos: "" }));
  assert.equal(new Set(rows.map((r) => r.name)).size, 150);
  const before = await dbCount(UP.ev);
  const r = await call(t, "evUploadCheck", { event_id: UP.ev, rows, fill: true });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.ok, true, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.rows.length, 150);
  for (const x of r.body.rows) {
    assert.equal(x.mark, "blank", JSON.stringify(x));
    assert.ok(x.notes.some((n) => n.includes("교인명부에 없는 이름")), JSON.stringify(x.notes));
  }
  assert.equal(await dbCount(UP.ev), before, "살펴보기가 줄을 넣었다");
});

// ---------- 사역신청 시험 참여자(2026-09-30) ----------
test("시험 참여자: 찾기 → 더하기 → 명단 → 다시 더하기(already) → 빼기 · user_id 안 실음", async () => {
  const [row] = await rest("app_config?select=value&key=eq.ministryTesters", "GET");
  const orig = row ? row.value : null;
  const tok = people.ministry.token;
  const key = "교구|시험|0|||ca-test-min-" + STAMP;
  try {
    const f = await call(tok, "ministryTesterFind", { name: "ca-test-min" });
    assert.equal(f.body.ok, true, JSON.stringify(f.body));
    const me = f.body.users.find((u) => u.key === key);
    assert.ok(me, "찾기에 시험 계정이 없다");
    assert.equal(me.tester, false);
    assert.ok(!UUID_RE.test(JSON.stringify(f.body)), "찾기 응답에 UUID");

    const a = await call(tok, "ministryTesterSave", { op: "add", key });
    assert.equal(a.body.ok, true, JSON.stringify(a.body));
    const t = a.body.testers.find((x) => x.key === key);
    assert.ok(t && t.name === "ca-test-min" && t.missing === false, JSON.stringify(a.body.testers));
    assert.ok(!UUID_RE.test(JSON.stringify(a.body)), "명단 응답에 UUID");

    // 신청 현황 줄에 🧪 — 명단에 든 분의 신청은 tester:true(2026-10-01). 앞 시험이 지우고 남은 줄만 본다.
    const l1 = (await call(tok, "ministryList")).body.list.filter((x) => x.name === "ca-test-min");
    for (const x of l1) assert.equal(x.tester, true);

    const again = await call(tok, "ministryTesterSave", { op: "add", key });
    assert.equal(again.body.already, true);
    assert.equal(again.body.testers.filter((x) => x.key === key).length, 1);

    const f2 = await call(tok, "ministryTesterFind", { name: "ca-test-min" });
    assert.equal(f2.body.users.find((u) => u.key === key).tester, true);

    const nf = await call(tok, "ministryTesterSave", { op: "add", key: key + "-없음" });
    assert.equal(nf.body.error, "not-found");
    assert.equal((await call(tok, "ministryTesterFind", { name: "" })).body.error, "no-name");
    assert.equal((await call(tok, "ministryTesterSave", { op: "x", key })).body.error, "invalid");

    const r = await call(tok, "ministryTesterSave", { op: "remove", key });
    assert.equal(r.body.ok, true);
    assert.equal(r.body.testers.some((x) => x.key === key), false);
    for (const x of (await call(tok, "ministryList")).body.list.filter((y) => y.name === "ca-test-min")) assert.equal(x.tester, false);

    const log = await rest(`admin_audit?select=action,detail&action=eq.ministry.tester&member_id=eq.${people.ministry.memberId}&order=id.desc&limit=2`, "GET");
    assert.deepEqual(log.map((x) => x.detail.op), ["remove", "add"]);
  } finally {
    await rest("app_config?key=eq.ministryTesters", "DELETE");
    if (orig !== null) await rest("app_config", "POST", { key: "ministryTesters", value: orig });
  }
});

// ---------- 친구 결정(2026-09-30) — SEC-2 · M2 · M5 ----------
// 회차 둘을 스스로 만든다(앞 시험 순서에 기대지 않게) — 지난 회차(2000-08 마감) · 앞날 회차(2099 마감). 둘 다 draft 라 성도님께 안 보인다.
//   after() 가 ca-test-*<STAMP>* 로 지운다(줄은 CASCADE). 이름은 올리기 시험의 교인명부(정 = 한 분 소망 12 권사 · 기 = 동명이인)를 빌린다.
test("성경필사 친구 결정: 명부에 물었으면 채운 것이 없어도 people.fill(물은 이름) · 직분만 채운 줄은 「직분: 교인명부로 채움」 · 지난 회차에 넣은 줄의 낸 날은 마감일 KST 자정(올리기·더하기) · 열린 회차는 지금", async () => {
  await upFixtures();
  const t = people.bibleevent.token;
  const past = "ca-test-upd-" + STAMP, future = "ca-test-upn-" + STAMP;
  const needs = { position: true, phone: false, memo: false, extra: [] };
  await rest("events", "POST", [
    { id: past, title: "ca-test 지난 회차 " + STAMP, opens_on: "2000-08-01", closes_on: "2000-08-31", status: "draft", kind: "signup", needs },
    { id: future, title: "ca-test 앞날 회차 " + STAMP, opens_on: "2099-12-01", closes_on: "2099-12-31", status: "draft", kind: "signup", needs },
  ]);
  const fillsOf = async (ev) => (await call(people.super.token, "auditList", { limit: 200, kind: "people" })).body.rows
    .filter((r) => r.action === "people.fill" && r.target === ev);

  // SEC-2 ① 채운 것이 없어도 — 명부에 없는 이름(경) · 동명이인(기) 두 이름을 물었다 → 한 줄 {rows 0, names [], asked 2}
  const c1 = await call(t, "evUploadCheck", { event_id: past, fill: true,
    rows: [{ name: upName("경"), gu: "", mok: "", pos: "" }, { name: upName("기"), gu: "", mok: "", pos: "" }] });
  assert.equal(c1.body.ok, true, JSON.stringify(c1.body));
  assert.deepEqual(c1.body.rows.map((r) => r.mark), ["blank", "same-name"], JSON.stringify(c1.body.rows));
  let fills = await fillsOf(past);
  assert.equal(fills.length, 1, JSON.stringify(fills));
  assert.deepEqual(fills[0].detail, { rows: 0, names: [], asked: 2, askedNames: [upName("경"), upName("기")] });
  // ② 물을 것이 없으면(빈칸 없는 줄뿐) · 채우기를 끄면 — 남기지 않는다
  const c2 = await call(t, "evUploadCheck", { event_id: past, fill: true, rows: [{ name: upName("신"), gu: "화평", mok: "3", pos: "집사" }] });
  assert.equal(c2.body.ok, true, JSON.stringify(c2.body));
  const c3 = await call(t, "evUploadCheck", { event_id: past, fill: false, rows: [{ name: upName("경"), gu: "", mok: "", pos: "" }] });
  assert.equal(c3.body.ok, true, JSON.stringify(c3.body));
  assert.equal((await fillsOf(past)).length, 1, "물을 것이 없거나 채우기를 끈 살펴보기가 people.fill 을 남겼다");

  // M5 · M2 — 소속(소망 12)이 적힌 줄의 빈 직분만 교인명부(권사)로 · 지난 회차라 낸 날은 2000-08-31 한국 자정
  const s1 = await call(t, "evUploadSave", { event_id: past, fill: true, rows: [{ name: upName("정"), gu: "소망", mok: "12", pos: "" }] });
  assert.equal(s1.body.ok, true, JSON.stringify(s1.body));
  assert.equal(s1.body.saved, 1, JSON.stringify(s1.body));
  const [pr] = await rest(`event_signups?select=group_name,sub_name,position,note,created_at,updated_at&event_id=eq.${past}`
    + `&name=eq.${encodeURIComponent(upName("정"))}`, "GET");
  assert.deepEqual([pr.group_name, pr.sub_name, pr.position], ["소망", "12", "권사"]);
  assert.equal(pr.note, "명단 올리기 / 직분: 교인명부로 채움");
  const PAST_AT = Date.parse("2000-08-31T00:00:00+09:00");
  assert.equal(Date.parse(pr.created_at), PAST_AT, "지난 회차 올리기 — 낸 날은 마감일 KST 자정: " + pr.created_at);
  assert.ok(Math.abs(Date.parse(pr.updated_at) - Date.now()) < 10 * 60 * 1000, "고친 때는 지금: " + pr.updated_at);
  // 한 분 더하기도 같다 — 화면의 「낸 날」(at)은 마감일
  const a1 = await call(t, "evRowAdd", { event_id: past, row: { who_type: "교구", group: "화평", sub: "4", name: upName("임"), position: "", note: "" } });
  assert.equal(a1.body.ok, true, JSON.stringify(a1.body));
  assert.equal(a1.body.row.at, "2000-08-31");
  const [ar] = await rest(`event_signups?select=created_at&id=eq.${a1.body.row.id}`, "GET");
  assert.equal(Date.parse(ar.created_at), PAST_AT, "지난 회차 더하기 — 낸 날은 마감일 KST 자정: " + ar.created_at);

  // 열린·앞날 회차 — 낸 날은 지금(DB 기본값)
  const s2 = await call(t, "evUploadSave", { event_id: future, fill: false, rows: [{ name: upName("신"), gu: "화평", mok: "3", pos: "집사" }] });
  assert.equal(s2.body.saved, 1, JSON.stringify(s2.body));
  const a2 = await call(t, "evRowAdd", { event_id: future, row: { who_type: "교구", group: "화평", sub: "4", name: upName("임"), position: "", note: "" } });
  assert.equal(a2.body.ok, true, JSON.stringify(a2.body));
  const nowRows = await rest(`event_signups?select=name,created_at,note&event_id=eq.${future}&order=id`, "GET");
  assert.equal(nowRows.length, 2);
  for (const r of nowRows) assert.ok(Math.abs(Date.parse(r.created_at) - Date.now()) < 10 * 60 * 1000, "열린 회차는 지금: " + JSON.stringify(r));
  assert.deepEqual(nowRows.map((r) => r.note), ["명단 올리기", "담당자가 더함"]);
});

// ---------- 사역신청 번호 보관 — 결정된 신청 번호 지우기(ministryPhoneClear · 2026-10-01) ----------
test("결정된 신청 번호 지우기: 수가 다르면 쓰지 않는다 · 결정된 줄만 · 결정 안 된 줄은 그대로 · 바꾼 기록", async () => {
  const m = people.ministry.token;
  const DEC = ["임명확정", "미채택", "취소"];
  const list = (await call(m, "ministryList")).body.list;
  const decided = list.filter((x) => DEC.includes(x.status) && x.phone);
  const open = list.filter((x) => !DEC.includes(x.status) && x.phone);
  assert.ok(decided.length >= 1, "앞 시험(신청 현황)의 임명 줄이 번호를 갖고 있어야 한다");
  const bad = await call(m, "ministryPhoneClear", { count: decided.length + 1 });
  assert.deepEqual([bad.body.ok, bad.body.error, bad.body.count], [false, "conflict", decided.length]);
  const still = (await call(m, "ministryList")).body.list;
  for (const x of decided) assert.equal(still.find((y) => y.id === x.id)?.phone, x.phone, "conflict 인데 지웠다 " + x.id);
  const ok = await call(m, "ministryPhoneClear", { count: decided.length });
  assert.equal(ok.body.ok, true, JSON.stringify(ok.body));
  assert.equal(ok.body.count, decided.length);
  const after = (await call(m, "ministryList")).body.list;
  for (const x of decided) assert.equal(after.find((y) => y.id === x.id)?.phone, "", "결정된 줄의 번호가 남았다 " + x.id);
  for (const x of open) assert.equal(after.find((y) => y.id === x.id)?.phone, x.phone, "결정 안 된 줄의 번호가 지워졌다 " + x.id);
  const log = (await call(people.super.token, "auditList", { limit: 30 })).body.rows.find((r) => r.action === "ministry.phoneclear");
  assert.equal(log?.detail?.count, decided.length, JSON.stringify(log));
  assert.equal((await call(people.directory.token, "ministryPhoneClear", { count: 0 })).status, 403);
});

// ---------- 교인명부 — 기록과 교인 잇기(people_links · 2026-10-01) ----------
function plFixtures() {
  plReady ??= (async () => {
    await rest(`church_people?person_id=in.(${PL.ids.join(",")})`, "DELETE");
    const d = (person_id, name, mok1, mok3, n) => ({ person_id, name, name_key: name, kind2: "장년", mok1, mok3, position: "집사",
      phone1: plPhone(n), phone_digits: plPhone(n).replace(/\D/g, "") });
    await rest("church_people", "POST", [d(PL.ids[0], PL.a, "화평", "화평-20목장", 61), d(PL.ids[1], PL.a, "소망", "소망-3목장", 62),
      d(PL.ids[2], PL.b, "믿음", "믿음-1목장", 63)]);
    const cfg = await rest("app_config?select=value&key=eq.ministry", "GET");
    const year = Number(cfg[0]?.value?.year) || 2027;
    const [cat] = await rest("ministry_catalog?select=id&order=id&limit=1", "GET");
    // 신청마다 시험 users 한 줄(진짜 uuid — 위 PL 주석 ⚠️) · 기존 신청 현황 시험(minTestUserId)과 같은 꼴
    const us = await rest("users", "POST", ["o1", "o2", "o3", "o4"].map((k) => ({ type: "교구", gu: "시험", mok: "0",
      name: `ca-test-pl-${STAMP}-${k}`, identity_key: `교구|시험|0|||ca-test-pl-${STAMP}-${k}` })));
    const uid = Object.fromEntries(us.map((u) => [u.name.split("-").pop(), u.id]));    // "o1" → uuid
    const kOf = Object.fromEntries(us.map((u) => [u.id, u.name.split("-").pop()]));    // uuid → "o1"
    // ⚠️ 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — o() 한 모양
    const o = (k, name, who, phone) => ({ year, user_id: uid[k], team_id: cat.id, committee: "시험부", team: "시험팀",
      name, who, phone, status: "신청완료", source: "app" });
    const rows = await rest("ministry_orders", "POST", [o("o1", PL.a, "화평 20목장", null), o("o2", PL.a, "기쁨 5목장", plPhone(62)),
      o("o3", PL.a, "기쁨 5목장", null), o("o4", PL.b, "사랑 2목장", null)]);
    for (const r of rows) PL.orders[kOf[r.user_id]] = r.id;
    await rest("events", "POST", { id: PL.ev, title: "ca-test 잇기 회차 " + STAMP, short_title: "", subtitle: "", season: "",
      kind: "signup", status: "archived", opens_on: "2000-07-01", closes_on: "2000-07-31", list_until: null,
      needs: { position: true, phone: false, memo: false, extra: [] } });
    const s = (k, name, group, sub) => ({ event_id: PL.ev, user_id: null, source: "import", who_type: "교구", group_name: group,
      sub_name: sub, name, ident_key: `교구|${group}|${sub}|||${name}`, position: "집사", phone: "", memo: "", answers: {}, note: k });
    const sig = await rest("event_signups", "POST", [s("s1", PL.a, "화평", "20"), s("s2", PL.a, "기쁨", "5"), s("s3", PL.b, "사랑", "2")]);
    for (const r of sig) PL.signups[r.note] = r.id;
  })();
  return plReady;
}
const linkOf = async (kind, id) =>
  (await rest(`people_links?select=person_id,link_how,match_basis,import_id,linked_by&kind=eq.${kind}&row_id=eq.${id}`, "GET"))[0] ?? null;
// 이번 실행이 만든 잇기 줄 가운데 원래 줄이 지워진 것(시험 신청·명단 줄) — FK 가 없어 저절로 안 지워진다
async function sweepLinks(since) {
  const links = await rest(`people_links?select=kind,row_id&updated_at=gte.${encodeURIComponent(since)}&limit=5000`, "GET");
  for (const [kind, table] of [["order", "ministry_orders"], ["signup", "event_signups"]]) {
    const ids = links.filter((l) => l.kind === kind).map((l) => l.row_id);
    for (let i = 0; i < ids.length; i += 200) {
      const part = ids.slice(i, i + 200);
      const alive = new Set((await rest(`${table}?select=id&id=in.(${part.join(",")})`, "GET")).map((r) => r.id));
      const gone = part.filter((id) => !alive.has(id));
      if (gone.length) await rest(`people_links?kind=eq.${kind}&row_id=in.(${gone.join(",")})`, "DELETE");
    }
  }
}

test("그때그때 잇기: 신청 현황·성경필사 명단을 열면 이어진다 — 맞음·번호 · 이름 한 분뿐은 안 잇는다 · 사람이 정한 줄은 그대로 · 옛 명부 auto 는 다시", async () => {
  await plFixtures();
  const list = await call(people.ministry.token, "ministryList");
  assert.equal(list.body.ok, true, JSON.stringify(list.body));
  const o = PL.orders;
  const l1 = await linkOf("order", o.o1), l2 = await linkOf("order", o.o2), l3 = await linkOf("order", o.o3), l4 = await linkOf("order", o.o4);
  assert.deepEqual([l1?.person_id, l1?.link_how, l1?.match_basis, l1?.linked_by], [PL.ids[0], "auto", "맞음", null]);
  assert.deepEqual([l2?.person_id, l2?.match_basis], [PL.ids[1], "번호"]);
  assert.deepEqual([l3?.person_id, l3?.link_how], [null, "auto"], "같은 이름 둘 · 소속 다름 · 번호 없음 — 못 맞춤");
  assert.deepEqual([l4?.person_id, l4?.link_how], [null, "auto"], "이름이 명부에 한 분뿐이어도 소속이 다르면 잇지 않는다");
  assert.ok(Number(l1.import_id) > 0);
  const row1 = list.body.list.find((x) => x.id === o.o1);
  assert.deepEqual(row1.church, { state: "맞음", reason: "" });
  assert.equal("person_id" in row1, false, "잇기는 응답에 싣지 않는다");
  const ro = await call(people.bibleevent.token, "evRoster", { event_id: PL.ev });
  assert.equal(ro.body.ok, true, JSON.stringify(ro.body));
  const s1 = await linkOf("signup", PL.signups.s1);
  assert.deepEqual([s1?.person_id, s1?.match_basis], [PL.ids[0], "맞음"]);
  assert.deepEqual([(await linkOf("signup", PL.signups.s2))?.person_id, (await linkOf("signup", PL.signups.s3))?.person_id], [null, null]);
  // 사람이 정한 줄(서비스 키로 심는다)은 다시 열어도 그대로 · 옛 명부로 맞춘 auto 줄은 지금 명부로
  await rest(`people_links?kind=eq.order&row_id=eq.${o.o3}`, "PATCH", { person_id: PL.ids[1], link_how: "manual", match_basis: "사람이 이음" });
  await rest(`people_links?kind=eq.signup&row_id=eq.${PL.signups.s1}`, "PATCH", { person_id: null, link_how: "none", match_basis: "" });
  await rest(`people_links?kind=eq.order&row_id=eq.${o.o1}`, "PATCH", { import_id: 1 });
  await call(people.ministry.token, "ministryList");
  await call(people.bibleevent.token, "evRoster", { event_id: PL.ev });
  const m3 = await linkOf("order", o.o3), n1 = await linkOf("signup", PL.signups.s1);
  assert.deepEqual([m3?.person_id, m3?.link_how], [PL.ids[1], "manual"]);
  assert.deepEqual([n1?.person_id, n1?.link_how], [null, "none"]);
  assert.equal(Number((await linkOf("order", o.o1)).import_id), Number(l1.import_id), "옛 명부 auto 줄은 지금 명부로 다시");
  // 다음 시험을 위해 되돌린다(o3·s1 을 auto 로 — 다시 열면 규칙대로 맞춘다)
  await rest(`people_links?kind=eq.order&row_id=eq.${o.o3}`, "PATCH", { person_id: null, link_how: "auto", match_basis: "", import_id: 1 });
  await rest(`people_links?kind=eq.signup&row_id=eq.${PL.signups.s1}`, "PATCH", { person_id: null, link_how: "auto", match_basis: "", import_id: 1 });
});

test("기록 잇기 맞추기(peopleLinkSync): apply 없이는 쓰지 않는다 · apply 면 auto 줄만 다시 · 번호로 이은 줄은 번호를 지워도 그대로 · 수만 기록 · 총괄만", async () => {
  await plFixtures();
  await rest(`people_links?kind=eq.order&row_id=eq.${PL.orders.o2}`, "DELETE");     // 줄이 없으면 「새로 이음」
  const dry = await call(people.super.token, "peopleLinkSync", {});
  assert.equal(dry.body.ok, true, JSON.stringify(dry.body));
  assert.equal(dry.body.dry, true);
  for (const k of ["orders", "signups", "added", "changed", "unmatched"]) assert.equal(typeof dry.body[k], "number", k);
  assert.ok(dry.body.added >= 1, JSON.stringify(dry.body));
  assert.equal(await linkOf("order", PL.orders.o2), null, "apply 없이 썼다");
  const ap = await call(people.super.token, "peopleLinkSync", { apply: true });
  assert.equal(ap.body.ok, true, JSON.stringify(ap.body));
  assert.equal(ap.body.dry, false);
  assert.equal((await linkOf("order", PL.orders.o2))?.person_id, PL.ids[1]);
  assert.equal((await linkOf("signup", PL.signups.s1))?.person_id, PL.ids[0]);
  const log = (await call(people.super.token, "auditList", { limit: 20, kind: "people" })).body.rows.find((r) => r.action === "people.linksync");
  assert.ok(log, "people.linksync 기록");
  assert.deepEqual(Object.keys(log.detail).sort(), ["added", "changed", "orders", "signups", "unmatched", "written"]);
  // 번호로 이은 줄(o2 → 62 · 「번호」)은 그 신청의 번호를 지운 뒤에도 그대로(설계 §3.1-3) — 번호를 지우고(📵 단추·180일 작업 자리)
  //   새 명부로 바뀐 것처럼(import_id 1) 둔 뒤 「기록 잇기 맞추기」·신청 현황 열기를 해도 끊기지 않는다
  await rest(`ministry_orders?id=eq.${PL.orders.o2}`, "PATCH", { phone: null });
  await rest(`people_links?kind=eq.order&row_id=eq.${PL.orders.o2}`, "PATCH", { import_id: 1 });
  try {
    assert.equal((await call(people.super.token, "peopleLinkSync", { apply: true })).body.ok, true);
    await call(people.ministry.token, "ministryList");
    const k2 = await linkOf("order", PL.orders.o2);
    assert.deepEqual([k2?.person_id, k2?.link_how, k2?.match_basis], [PL.ids[1], "auto", "번호"], "번호를 지웠더니 잇기가 끊겼다");
  } finally {
    await rest(`ministry_orders?id=eq.${PL.orders.o2}`, "PATCH", { phone: plPhone(62) });   // 뒤 시험은 번호가 있는 o2 를 쓴다
  }
  assert.equal((await call(people.directory.token, "peopleLinkSync", { apply: true })).status, 403);
});

// ---------- 교인명부 — 「자세히」 창 사역·성경필사 탭(2026-10-01) ----------
const TAB_SECRET = /"(user_id|ident_key|memo|phone|answers|note)"\s*:/;
const MIN_ITEM_KEYS = ["committee", "how", "kind", "option", "role_title", "row", "status", "team", "year"];
const BIB_ITEM_KEYS = ["event_id", "group", "how", "kind", "opens_on", "position", "row", "short_title", "sub", "title", "who_type"];
const plOpen = async () => {
  await plFixtures();
  await call(people.ministry.token, "ministryList");                          // 그때그때 잇기(앞 시험과 상관없이)
  await call(people.bibleevent.token, "evRoster", { event_id: PL.ev });
};

test("「자세히」 창 탭(peoplePerson history): 이어진 기록만 · 칸 지도 · 메모·전화·앱 계정 없음 · people.view 한 줄", async () => {
  await plOpen();
  const mark = await auditMark();
  const r = await call(people.directory.token, "peoplePerson", { id: PL.ids[0] });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  const h = r.body.history;
  assert.deepEqual(Object.keys(h).sort(), ["bible", "counts", "ministry"]);
  assert.deepEqual(h.ministry.map((x) => [x.kind, x.row]), [["order", PL.orders.o1]]);
  assert.deepEqual(h.bible.map((x) => [x.kind, x.row]), [["signup", PL.signups.s1]]);
  assert.deepEqual(h.counts, { ministry: 1, bible: 1 });
  assert.deepEqual(Object.keys(h.ministry[0]).sort(), MIN_ITEM_KEYS);
  assert.deepEqual(Object.keys(h.bible[0]).sort(), BIB_ITEM_KEYS);
  assert.deepEqual([h.ministry[0].committee, h.ministry[0].team, h.ministry[0].status, h.ministry[0].how], ["시험부", "시험팀", "신청완료", "auto"]);
  assert.deepEqual([h.bible[0].event_id, h.bible[0].group, h.bible[0].sub, h.bible[0].opens_on], [PL.ev, "화평", "20", "2000-07-01"]);
  assert.ok(!TAB_SECRET.test(JSON.stringify(h)), "탭에 실으면 안 되는 칸");
  assert.ok(!UUID_RE.test(JSON.stringify(h)), "UUID 꼴 값");
  const views = (await call(people.super.token, "auditList", { limit: 50, kind: "people" })).body.rows
    .filter((x) => x.id > mark && x.target === String(PL.ids[0]));
  assert.deepEqual(views.map((x) => x.action), ["people.view"], "탭 때문에 기록이 늘었다");
});

test("아직 안 이어진 기록(peopleHistory): 같은 이름 · 아무에게도 안 이어진 줄 · 칸 지도 · 기록 없음", async () => {
  await plOpen();
  const mark = await auditMark();
  const pick = (rows) => rows.filter((x) => (x.kind === "order" && Object.values(PL.orders).includes(x.row)) ||
    (x.kind === "signup" && Object.values(PL.signups).includes(x.row)));
  const a = await call(people.directory.token, "peopleHistory", { id: PL.ids[0] });
  assert.equal(a.body.ok, true, JSON.stringify(a.body));
  assert.deepEqual(Object.keys(a.body).sort(), ["ok", "rows"]);
  assert.deepEqual(pick(a.body.rows).map((x) => [x.kind, x.row, x.how]), [["order", PL.orders.o3, "auto"], ["signup", PL.signups.s2, "auto"]]);
  const o3 = pick(a.body.rows)[0];
  assert.deepEqual(Object.keys(o3).sort(), ["committee", "how", "kind", "option", "position", "row", "status", "team", "who", "year"]);
  assert.equal(o3.who, "기쁨 5목장");
  assert.ok(!TAB_SECRET.test(JSON.stringify(a.body)));
  const b = await call(people.directory.token, "peopleHistory", { id: PL.ids[2] });
  assert.deepEqual(pick(b.body.rows).map((x) => [x.kind, x.row]), [["order", PL.orders.o4], ["signup", PL.signups.s3]]);
  assert.equal((await call(people.directory.token, "peopleHistory", { id: 1 })).body.error, "not-found");
  const logs = (await call(people.super.token, "auditList", { limit: 50, kind: "people" })).body.rows
    .filter((x) => x.id > mark && [String(PL.ids[0]), String(PL.ids[2])].includes(x.target));
  assert.equal(logs.length, 0, JSON.stringify(logs));
});

test("이분 것·이분 아님·풀기(peopleLink): 사람이 정한 줄 · 자동이 덮지 않음 · 이름이 다르면 막음 · 기록 people.link {kind,row,how}", async () => {
  await plOpen();
  const d = people.directory;
  const link = (kind, row, how, person = PL.ids[0]) => call(d.token, "peopleLink", { kind, row, person, how });
  // ① 이분 것 — 못 맞춘 o3 을 61 께
  const m = await link("order", PL.orders.o3, "manual");
  assert.equal(m.body.ok, true, JSON.stringify(m.body));
  assert.deepEqual(m.body.history.ministry.map((x) => x.row).sort((x, y) => x - y), [PL.orders.o1, PL.orders.o3].sort((x, y) => x - y));
  assert.equal(m.body.history.ministry.find((x) => x.row === PL.orders.o3).how, "manual");
  const lm = await linkOf("order", PL.orders.o3);
  assert.deepEqual([lm.person_id, lm.link_how, lm.match_basis, lm.linked_by, lm.import_id], [PL.ids[0], "manual", "사람이 이음", d.memberId, null]);
  await call(people.ministry.token, "ministryList");
  await call(people.super.token, "peopleLinkSync", { apply: true });
  assert.equal((await linkOf("order", PL.orders.o3)).link_how, "manual", "자동이 덮었다");
  // ② 이분 아님 — 이분께 이어진 줄만 · 그 뒤 「아직 안 이어진 기록」에 how none 으로
  const n = await link("order", PL.orders.o3, "none");
  assert.equal(n.body.ok, true, JSON.stringify(n.body));
  const ln = await linkOf("order", PL.orders.o3);
  assert.deepEqual([ln.person_id, ln.link_how, ln.match_basis], [null, "none", ""]);
  const un = await call(d.token, "peopleHistory", { id: PL.ids[0] });
  assert.equal(un.body.rows.find((x) => x.kind === "order" && x.row === PL.orders.o3)?.how, "none");
  // ③ 풀기 — 규칙이 다시 같은 분께 이으면 relinked(화면이 「이분 아님」을 권한다)
  const f = await link("signup", PL.signups.s1, "auto");
  assert.deepEqual([f.body.ok, f.body.relinked], [true, true], JSON.stringify(f.body));
  const lf = await linkOf("signup", PL.signups.s1);
  assert.deepEqual([lf.person_id, lf.link_how, lf.match_basis, lf.linked_by], [PL.ids[0], "auto", "맞음", null]);
  // ④ 막는 것
  assert.equal((await link("order", PL.orders.o4, "manual")).body.error, "other-name");
  assert.equal((await link("order", PL.orders.o2, "none")).body.error, "not-linked", "62 께 이어진 줄을 61 창에서 「이분 아님」");
  assert.equal((await link("order", PL.orders.o3, "manual", 999999999)).body.error, "not-found");
  assert.equal((await link("order", 0, "manual")).body.error, "invalid");
  assert.equal((await call(d.token, "peopleLink", { kind: "order", row: PL.orders.o3, person: PL.ids[0], how: "delete" })).body.error, "invalid");
  // ⑤ 기록 — people.link {kind,row,how}(이름·교인ID 없음 · 「교인명부 기록」)
  const logs = (await call(people.super.token, "auditList", { limit: 80, kind: "people" })).body.rows
    .filter((r) => r.action === "people.link" && ((r.detail?.kind === "order" && r.detail?.row === PL.orders.o3) ||
      (r.detail?.kind === "signup" && r.detail?.row === PL.signups.s1)));
  assert.deepEqual(logs.map((r) => r.detail).reverse(), [{ kind: "order", row: PL.orders.o3, how: "manual" },
    { kind: "order", row: PL.orders.o3, how: "none" }, { kind: "signup", row: PL.signups.s1, how: "auto" }]);
  // 되돌린다(o3 을 auto 로)
  await rest(`people_links?kind=eq.order&row_id=eq.${PL.orders.o3}`, "PATCH", { person_id: null, link_how: "auto", match_basis: "", import_id: 1 });
});

// 그때그때 잇기 — 나머지 네 자리(검토 지적 · 2026-10-01) — ministryPaperSave(새로 넣기·dupId) ·
//   evRowAdd(더하기 직후) · evRowSave(소속을 고치면 force 로 다시 맞춘다) · evUploadSave(linkSignupsByName).
// ⚠️ 위 두 시험(plFixtures 를 쓰는 「그때그때 잇기」·「기록 잇기 맞추기」)은 ministryList·evRoster 만 다졌다 —
//   나머지 네 자리는 코드만 있고 실행 증거가 없었다(검토 지적). 여기서 그 네 자리를 하나씩 직접 부른다.
// 새로 만드는 줄은 전부 PL 의 기존 명부 후보(PL.a·PL.b·PL.ids)와 맞대고, 뒷정리는 새로 만들지 않는다 —
//   ministryPaperSave 가 만드는 계정·신청은 이름이 PL.a(= `ca-test-pl-${STAMP}-가`)라 「잇기 시험」
//   after() 단계의 `users?name=like.ca-test-pl-${STAMP}-*` 가 그대로 쓸어 간다. evRowAdd·evRowSave 는
//   PL.ev(기존 회차)에 더하므로 그 회차가 지워질 때(성경필사 시험 회차 단계) 같이 사라지고, evUploadSave 는
//   이름에 STAMP 가 든 새 회차(ca-test-pl-up-STAMP)를 만들어 같은 단계가 쓴다. 남는 people_links 줄은
//   모두 sweepLinks(RUN_START)(after() 맨 끝)가 치운다 — 이 시험은 그 둘 다에 **기대어** 따로 지우지 않는다.
test("그때그때 잇기 — 나머지 네 자리(종이 명단 새로 넣기·dupId · 성경필사 더하기·고치기(강제 다시 맞춤)·올리기)", async () => {
  await plFixtures();
  const t = people.bibleevent.token, m = people.ministry.token;

  // ① evRowAdd — 더한 직후 바로 이어진다(「맞음」 · PL.b ↔ 믿음-1목장)
  const add1 = await call(t, "evRowAdd",
    { event_id: PL.ev, row: { who_type: "교구", group: "믿음", sub: "1", name: PL.b, position: "", note: "" } });
  assert.equal(add1.body.ok, true, JSON.stringify(add1.body));
  const addId = add1.body.row.id;
  const la1 = await linkOf("signup", addId);
  assert.deepEqual([la1?.person_id, la1?.link_how, la1?.match_basis], [PL.ids[2], "auto", "맞음"]);

  // ② evRowSave — 소속이 달라 못 맞춘 줄을 고치면(force=true) 즉시 다시 맞춰 이어진다(PL.a ↔ 소망-3목장)
  const add2 = await call(t, "evRowAdd",
    { event_id: PL.ev, row: { who_type: "교구", group: "은혜", sub: "8", name: PL.a, position: "", note: "" } });
  assert.equal(add2.body.ok, true, JSON.stringify(add2.body));
  const saveId = add2.body.row.id;
  assert.equal((await linkOf("signup", saveId))?.person_id, null, "소속이 달라 못 맞춰야 한다(은혜-8목장은 명부에 없다)");
  const save2 = await call(t, "evRowSave", { id: saveId, expect: add2.body.row.updated_at, patch: { group: "소망", sub: "3" } });
  assert.equal(save2.body.ok, true, JSON.stringify(save2.body));
  const ls2 = await linkOf("signup", saveId);
  assert.deepEqual([ls2?.person_id, ls2?.link_how, ls2?.match_basis], [PL.ids[1], "auto", "맞음"],
    "고치면 강제로 다시 맞춰야 한다(force) — import_id 가 그대로라도 다시 본다");

  // ③ ministryPaperSave — 새로 넣기(newIds)와 dupId(같은 명단 재업로드) 둘 다 이어진다(PL.a ↔ 화평-20목장)
  const cfg = await rest("app_config?select=value&key=eq.ministry", "GET");
  const year = Number(cfg[0]?.value?.year) || 2027;
  const cat = await rest(`ministry_catalog?select=id,committee,team,kind&year=eq.${year}&order=id`, "GET");
  const team = cat.find((c) => c.kind !== "appoint");
  assert.ok(team, "지명이 아닌 팀이 있어야 한다(종이 명단 잇기 시험)");
  const paperRow = { gu: "화평", mok: "20", name: PL.a, position: "집사", phone: "010-0000-0220",
    committee: team.committee, team: team.team };
  const ps1 = await call(m, "ministryPaperSave", { rows: [paperRow] });
  assert.equal(ps1.body.ok, true, JSON.stringify(ps1.body));
  assert.equal(ps1.body.added, 1, JSON.stringify(ps1.body));
  const [porder] = await rest(
    `ministry_orders?select=id&name=eq.${encodeURIComponent(PL.a)}&source=eq.paper&order=id.desc&limit=1`, "GET");
  assert.ok(porder, "종이로 넣은 신청을 찾아야 한다");
  const lp1 = await linkOf("order", porder.id);
  assert.deepEqual([lp1?.person_id, lp1?.link_how, lp1?.match_basis], [PL.ids[0], "auto", "맞음"], "새로 넣은 줄도 이어져야 한다(newIds)");

  const ps2 = await call(m, "ministryPaperSave", { rows: [paperRow] });   // 같은 명단 재업로드 — dupId(이미 그 상태)
  assert.equal(ps2.body.ok, true, JSON.stringify(ps2.body));
  assert.equal(ps2.body.added, 0, JSON.stringify(ps2.body));
  assert.equal(ps2.body.same, 1, JSON.stringify(ps2.body));
  const lp2 = await linkOf("order", porder.id);
  assert.deepEqual([lp2?.person_id, lp2?.link_how, lp2?.match_basis], [PL.ids[0], "auto", "맞음"],
    "dupId 로 다시 이어도 그대로여야 한다(byId 의 이름·소속·번호로 다시 이음)");

  // ④ evUploadSave — 새 회차에 올린 줄도 이어진다(linkSignupsByName · PL.b ↔ 믿음-1목장)
  const upEv = "ca-test-pl-up-" + STAMP;
  await rest("events", "POST", { id: upEv, title: "ca-test 잇기 올리기 " + STAMP, short_title: "", subtitle: "", season: "",
    kind: "signup", status: "archived", opens_on: "2000-08-01", closes_on: "2000-08-31", list_until: null,
    needs: { position: true, phone: false, memo: false, extra: [] } });
  const up1 = await call(t, "evUploadSave", { event_id: upEv, rows: [{ name: PL.b, gu: "믿음", mok: "1", pos: "" }], fill: false });
  assert.equal(up1.body.ok, true, JSON.stringify(up1.body));
  assert.equal(up1.body.saved, 1, JSON.stringify(up1.body));
  const [uprow] = await rest(`event_signups?select=id&event_id=eq.${upEv}&name=eq.${encodeURIComponent(PL.b)}`, "GET");
  assert.ok(uprow, "올린 줄을 찾아야 한다");
  const lu1 = await linkOf("signup", uprow.id);
  assert.deepEqual([lu1?.person_id, lu1?.link_how, lu1?.match_basis], [PL.ids[2], "auto", "맞음"]);
});

// ── 사역 이력(2026-10-01) — 표 둘이 안 열린다 · 올리기→맞춤→가리기→잇기→다시 맞추기→빼기→다시 올리기 ──
// 고정 교인ID 990000061~63(다른 시험과 겹치지 않는 번위) · 이름은 ca-test-hi-<STAMP><한글 한 글자> · 해는 2001(씨앗·다른 시험과 안 겹침)
const HI = { ids: [990000061, 990000062, 990000063], name: `ca-test-hi-${STAMP}가`, solo: `ca-test-hi-${STAMP}나`, none: `ca-test-hi-${STAMP}없`, year: 2001 };
const hiRows = (year) => [
  { year, committee: "찬양부", team: "ca-test 찬양대", name: HI.name, position: "집사", mok: "기쁨-19", renewal: "유지" },
  { year, committee: "찬양부", team: "ca-test 찬양대", name: HI.name, position: "집사", mok: "기쁨-19", renewal: "유지" },   // 파일 안 겹침
  { year, committee: "전도부", team: "ca-test 전도대", name: HI.solo, position: "안수집사", mok: "소망-2", renewal: "신규" },
  { year, committee: "전도부", team: "ca-test 전도대", name: HI.none, position: "집사", mok: "사랑-3", renewal: "신규" },
  { year: 1900, name: "ca-test-hi-틀림" },                                                                             // 틀림(bad-year)
];
async function hiClean() {
  await rest("ministry_history?name=like.ca-test-hi-*", "DELETE");
  await rest("ministry_history_imports?file_name=eq.ca-test-hi.xlsx", "DELETE");
  await rest(`church_people?person_id=in.(${HI.ids.join(",")})`, "DELETE");
}
async function hiFixtures() {
  await hiClean();                                         // 지난번 찌꺼기(고정 ID · 이름 앞말이 이 시험 것뿐이다)
  // ⚠️ 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — d() 한 모양으로만
  const d = (person_id, name, gender, mok1, mok3, position) => ({ person_id, name, name_key: name, gender, kind2: "장년", mok1, mok3, position });
  await rest("church_people", "POST", [
    d(HI.ids[0], HI.name, "여", "기쁨", "기쁨-19목장", "집사"),
    d(HI.ids[1], HI.name, "여", "은혜", "은혜-03목장", "권사"),
    d(HI.ids[2], HI.solo, "남", "화평", "화평-05목장", "안수집사"),
  ]);
}
const hiDb = (q) => rest(`ministry_history?select=id,name,person_id,link_how,match_basis,match_reason,updated_at&${q}&order=id`, "GET");
// 이 사람(member_id)이 이 액션으로 지금까지 남긴 기록의 가장 큰 id — 이 뒤(id=gt.)만 보면 이번 부름이 남긴 것만 본다
async function hiAuditMark(member_id, action) {
  const rows = await rest(`admin_audit?select=id&member_id=eq.${member_id}&action=eq.${action}&order=id.desc&limit=1`, "GET");
  return rows[0]?.id ?? 0;
}

test("사역 이력 — 표 둘(ministry_history·ministry_history_imports)은 공개 키·로그인 사용자로 안 열린다", async () => {
  for (const t of ["ministry_history", "ministry_history_imports"]) {
    const a = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON } });
    assert.notEqual(a.status, 200, "공개 키로 열림: " + t);
    const b = await fetch(`${URL_}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON, Authorization: "Bearer " + people.super.token } });
    assert.notEqual(b.status, 200, "로그인 사용자로 열림: " + t);
  }
  const r = await fetch(`${URL_}/rest/v1/rpc/ministry_history_apply`, { method: "POST",
    headers: { apikey: ANON, Authorization: "Bearer " + people.super.token, "Content-Type": "application/json" }, body: JSON.stringify({ p: [] }) });
  assert.notEqual(r.status, 200, "로그인 사용자가 ministry_history_apply 를 부름");
});

test("사역 이력 — 올리기(살펴보기·넣기) · 맞춤 · 교인ID 가리기 · 잇기(지문) · 다시 맞추기 · 되돌리기 · 빼기 · 다시 올리기", async () => {
  await hiFixtures();
  const m = people.ministry.token;
  const md = (await mindirPerson()).token;
  const year = HI.year;
  try {
    const chk = (await call(m, "historyUploadCheck", { rows: hiRows(year), file_name: "ca-test-hi.xlsx" })).body;
    assert.equal(chk.ok, true, JSON.stringify(chk));
    assert.deepEqual([chk.counts.add, chk.counts.dup, chk.counts.bad], [3, 1, 1]);
    assert.deepEqual([chk.preview.linked, chk.preview.unlinked], [2, 1]);
    assert.equal((await hiDb(`year=eq.${year}&name=like.ca-test-hi-*`)).length, 0, "살펴보기가 썼다");

    const sv = (await call(m, "historyUploadSave", { rows: hiRows(year), file_name: "ca-test-hi.xlsx" })).body;
    assert.deepEqual([sv.ok, sv.saved, sv.linked, sv.unlinked], [true, 3, 2, 1], JSON.stringify(sv));
    assert.equal(sv.rematched, true, JSON.stringify(sv));   // 계약 변경(0b37789) — 올린 뒤 맞춤이 끝났다
    const rows = await hiDb(`year=eq.${year}&name=like.ca-test-hi-*`);
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    assert.deepEqual([by[HI.name].person_id, by[HI.name].match_basis], [HI.ids[0], "같은 소속"]);
    assert.equal(by[HI.solo].person_id, HI.ids[2]);
    assert.deepEqual([by[HI.none].person_id, by[HI.none].match_reason], [null, "교인명부에 같은 이름이 없음"]);

    // 목록 — 사역신청 역할에게는 교인ID 칸 자체가 없다 · 교인명부도 있는 분에게는 있다
    const lm = (await call(m, "historyList", { years: [year], q: "ca-test-hi-" })).body;
    assert.equal(lm.total, 3);
    assert.ok(lm.rows.every((r) => !("person_id" in r)), "사역신청 역할에게 person_id 가 실렸다");
    for (const id of HI.ids) assert.ok(!JSON.stringify(lm).includes(String(id)), "교인ID 가 실렸다: " + id);
    const ld = (await call(md, "historyList", { years: [year], q: "ca-test-hi-" })).body;
    assert.ok(ld.rows.some((r) => r.person_id === HI.ids[0]));

    // 후보 — 같은 이름 두 분 · 사역신청 역할에게 교인ID 없음 · 지문 · people.lookup(from:"history")
    const id0 = by[HI.name].id;
    const cm = (await call(m, "historyCandidates", { id: id0 })).body;
    assert.equal(cm.candidates.length, 2);
    for (const id of HI.ids) assert.ok(!JSON.stringify(cm).includes(String(id)), "후보에 교인ID: " + id);
    assert.match(cm.fp, /^[0-9a-f]{8}$/);
    const cd = (await call(md, "historyCandidates", { id: id0 })).body;
    assert.deepEqual(cd.candidates.map((c) => c.person_id), [HI.ids[0], HI.ids[1]]);
    assert.equal(cd.fp, cm.fp, "지문은 역할과 상관없이 같다(화면 글자로만 만든다)");

    // 잇기 — 지문이 틀리면 막힘 · 맞으면 두 번째 분(권사)으로 · manual
    assert.equal((await call(m, "historyLink", { id: id0, op: "pick", pick: 1, fp: "00000000" })).body.error, "candidates-changed");
    assert.equal((await call(m, "historyLink", { id: id0, op: "pick", pick: 1, fp: cm.fp })).body.ok, true);
    // 다시 맞추기 — 확인 없으면 안 돈다 · 돌아도 사람이 이은 줄은 그대로
    assert.equal((await call(m, "historyRematch", {})).body.error, "needs-confirm");
    assert.equal((await call(m, "historyRematch", { confirm: true })).body.ok, true);
    const after = (await hiDb(`id=eq.${id0}`))[0];
    assert.deepEqual([after.person_id, after.link_how, after.match_basis], [HI.ids[1], "manual", "사람이 이음"]);
    // 자동으로 되돌리기 → 다시 같은 소속 분
    assert.equal((await call(m, "historyLink", { id: id0, op: "auto" })).body.ok, true);
    const back = (await hiDb(`id=eq.${id0}`))[0];
    assert.deepEqual([back.person_id, back.link_how], [HI.ids[0], "auto"]);

    // (계약 변경 b) 신규/유지만 바꿔도 — auto 줄이면 다시 맞추기가 돈다 → rematched: true
    const rsv = (await call(m, "historyRowSave", { id: id0, expect: back.updated_at, patch: { renewal: "신규" } })).body;
    assert.equal(rsv.ok, true, JSON.stringify(rsv));
    assert.equal(rsv.rematched, true, JSON.stringify(rsv));

    // (계약 변경 c) 다른 이름으로 이어진 줄 — 후보에 지금 이어진 분이 current:true 로 남는다(§4.5)
    const add2 = (await call(m, "historyRowAdd", {
      row: { year, committee: "찬양부", team: "ca-test 찬양대2", name: HI.name, position: "집사", mok: "기쁨-19", renewal: "유지" },
    })).body;
    assert.equal(add2.ok, true, JSON.stringify(add2));
    const id2 = add2.row.id;
    const cm2 = (await call(m, "historyCandidates", { id: id2 })).body;
    assert.equal(cm2.candidates.length, 2, "같은 이름 두 분이 후보여야 한다: " + JSON.stringify(cm2));
    assert.equal((await call(m, "historyLink", { id: id2, op: "pick", pick: 1, fp: cm2.fp })).body.ok, true);
    const row2 = (await hiDb(`id=eq.${id2}`))[0];
    assert.equal(row2.person_id, HI.ids[1]);
    const renamed = `${HI.name}-x`;   // 「ca-test-hi-」로 시작해야 hiClean() 이 지운다
    const sv2 = (await call(m, "historyRowSave", { id: id2, expect: row2.updated_at, patch: { name: renamed } })).body;
    assert.equal(sv2.ok, true, JSON.stringify(sv2));
    assert.ok(!("rematched" in sv2), "manual 줄의 이름만 바꿨는데 다시 맞췄다: " + JSON.stringify(sv2));
    const cc2 = (await call(m, "historyCandidates", { id: id2 })).body;
    assert.equal(cc2.candidates.length, 1, "다른 이름이 됐으니 이름으로는 후보가 없어야 한다: " + JSON.stringify(cc2));
    assert.equal(cc2.candidates[0].current, true, "지금 이어진 분이 current 로 안 남았다: " + JSON.stringify(cc2));

    // (계약 변경 a) 빼 둔 줄과 같은 src_key 로 한 줄 더하기 → history-deleted(되살리지 않는다)
    const nr = by[HI.none];
    assert.equal((await call(m, "historyRowDelete", { id: nr.id, expect: nr.updated_at })).body.ok, true);
    const addDel = (await call(m, "historyRowAdd", { row: hiRows(year)[3] })).body;
    assert.equal(addDel.error, "history-deleted", JSON.stringify(addDel));

    // 빼기 → 다시 올리면 「빼 둔 줄과 같음」 · 나머지는 「이미 있음」 · 아무것도 더하지 않는다
    const again = (await call(m, "historyUploadSave", { rows: hiRows(year), file_name: "ca-test-hi.xlsx" })).body;
    assert.deepEqual([again.saved, again.counts.same, again.counts.deleted, again.counts.bad], [0, 3, 1, 1]);

    // 기록 — history.upload 에 이름이 없다
    const logs = await rest(`admin_audit?select=action,detail&action=eq.history.upload&member_id=eq.${people.ministry.memberId}&order=id.desc&limit=2`, "GET");
    assert.ok(logs.length >= 1);
    assert.ok(!JSON.stringify(logs).includes("ca-test-hi-"), "기록에 이름이 실렸다");
  } finally {
    await hiClean();
  }
});

// ── 사역 이력 — 개발 다시 보기(2026-10-01 최종 검토 뒤) — 살펴보기 명부 기록 · 잇기 잠금(expect) · 내려받기 거르기 · 자리 표시 사유 ──
test("사역 이력 — 살펴보기 명부 기록(people.lookup) · 잇기 잠금(expect) · 내려받기 거르기(only·q) · 자리 표시 사유가 남지 않음", async () => {
  await hiFixtures();
  const m = people.ministry.token;
  const year = HI.year;
  const mid = people.ministry.memberId;
  try {
    // (a) 살펴보기(historyUploadCheck) — 새 줄이 있으면 people.lookup(from:"history-check") 한 줄, 물은 이름에 씨앗 이름들
    const markCheck = await hiAuditMark(mid, "people.lookup");
    const chk = (await call(m, "historyUploadCheck", { rows: hiRows(year), file_name: "ca-test-hi.xlsx" })).body;
    assert.equal(chk.ok, true, JSON.stringify(chk));
    const checkLogs = await rest(
      `admin_audit?select=id,detail&action=eq.people.lookup&member_id=eq.${mid}&id=gt.${markCheck}&order=id.desc`, "GET");
    const hcLogs = checkLogs.filter((r) => r.detail?.from === "history-check");
    assert.equal(hcLogs.length, 1, "살펴보기 기록이 정확히 한 줄이어야 한다: " + JSON.stringify(checkLogs));
    for (const n of [HI.name, HI.solo, HI.none]) {
      assert.ok(hcLogs[0].detail.askedNames.includes(n), "물은 이름에 없다(" + n + "): " + JSON.stringify(hcLogs[0].detail));
    }

    // PROBE 꼴(rows: []) — 아무것도 묻지 않았으니 기록도 없다
    const markEmpty = await hiAuditMark(mid, "people.lookup");
    const chkEmpty = (await call(m, "historyUploadCheck", { rows: [] })).body;
    assert.equal(chkEmpty.ok, true, JSON.stringify(chkEmpty));
    const emptyLogs = await rest(`admin_audit?select=id&action=eq.people.lookup&member_id=eq.${mid}&id=gt.${markEmpty}`, "GET");
    assert.equal(emptyLogs.length, 0, "rows:[] 인데도 기록이 남았다: " + JSON.stringify(emptyLogs));

    // (b) 넣기 — 자리 표시 사유가 다시 맞추기 뒤 실제 사유로 바뀐다(플레이스홀더가 남으면 안 된다)
    const sv = (await call(m, "historyUploadSave", { rows: hiRows(year), file_name: "ca-test-hi.xlsx" })).body;
    assert.equal(sv.ok, true, JSON.stringify(sv));
    assert.equal(sv.rematched, true, JSON.stringify(sv));   // 다시 맞추기가 실제로 돌았다 — 안 돌면 아래 사유 검사가 의미 없다
    const rows = await hiDb(`year=eq.${year}&name=like.ca-test-hi-*`);
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    assert.notEqual(by[HI.none].match_reason, HISTORY_UNMATCHED_YET,
      "못 맞춘 줄에 자리 표시 사유가 그대로 남았다: " + JSON.stringify(by[HI.none]));
    assert.ok(by[HI.none].match_reason, "못 맞춘 줄에 사유가 비어 있다: " + JSON.stringify(by[HI.none]));
    assert.equal(by[HI.name].match_reason, "", "맞춘 줄에 사유가 남았다: " + JSON.stringify(by[HI.name]));

    // (c) 잇기 잠금(expect) — 낡은 expect 는 conflict(기록도 안 남는다) · 새 expect 는 그대로 된다
    const row0 = by[HI.name];
    const staleAt = row0.updated_at;
    const bump = (await call(m, "historyRowSave", { id: row0.id, expect: staleAt, patch: { src_note: "ca-test-hi-bump-" + STAMP } })).body;
    assert.equal(bump.ok, true, JSON.stringify(bump));
    const freshAt = bump.row.updated_at;
    assert.notEqual(freshAt, staleAt, "src_note 를 고쳤는데 updated_at 이 그대로다");

    const markStale = await hiAuditMark(mid, "history.link");
    const staleLink = (await call(m, "historyLink", { id: row0.id, op: "none", expect: staleAt })).body;
    assert.equal(staleLink.error, "conflict", JSON.stringify(staleLink));
    const staleLogs = await rest(`admin_audit?select=id&action=eq.history.link&member_id=eq.${mid}&id=gt.${markStale}`, "GET");
    assert.equal(staleLogs.length, 0, "conflict 인데도 history.link 기록이 남았다: " + JSON.stringify(staleLogs));

    const markFresh = await hiAuditMark(mid, "history.link");
    const freshLink = (await call(m, "historyLink", { id: row0.id, op: "none", expect: freshAt })).body;
    assert.equal(freshLink.ok, true, JSON.stringify(freshLink));
    assert.equal(freshLink.row.linked, false, "이분 아님으로 풀었는데 linked 가 그대로다");
    const freshLogs = await rest(`admin_audit?select=id&action=eq.history.link&member_id=eq.${mid}&id=gt.${markFresh}`, "GET");
    assert.equal(freshLogs.length, 1, "잇기 성공인데 기록이 안 남았다: " + JSON.stringify(freshLogs));

    // (d) 내려받기 거르기 — only:"none" 은 이번 해의 못 맞춘 줄만(HI.name 을 방금 풀어 둘이 됐다) · q 는 이름으로만 더 좁힌다
    const scopeQ = String(STAMP);
    const expNone = (await call(m, "historyExport", { years: [year], only: "none", q: scopeQ })).body;
    assert.equal(expNone.ok, true, JSON.stringify(expNone));
    assert.deepEqual(new Set(expNone.rows.map((r) => r.name)), new Set([HI.name, HI.none]),
      "못 맞춘 줄만 거르기가 틀렸다: " + JSON.stringify(expNone.rows.map((r) => r.name)));
    assert.ok(expNone.rows.every((r) => !r.linked), "only:none 인데 이어진 줄이 섞였다: " + JSON.stringify(expNone.rows));

    const expQ = (await call(m, "historyExport", { years: [year], q: HI.none })).body;
    assert.equal(expQ.ok, true, JSON.stringify(expQ));
    assert.deepEqual(expQ.rows.map((r) => r.name), [HI.none], "q 거르기가 이름 말고 다른 줄도 돌려줬다: " + JSON.stringify(expQ.rows));
  } finally {
    await hiClean();
  }
});

// ---------- 사역 이력(b6) 잇기 — peopleLink kind history(2026-10-01 · 계획 Task 10) ----------
test("사역 이력 잇기: 탭에 붙는다 · 넘긴 신청은 빠진다 · 이분 것·이분 아님·풀기 · 기록 history.link {op,year,by}", async () => {
  await plOpen();
  const d = people.directory;
  const h = (o) => ({ year: 2024, committee: "시험부", team: "시험팀", role_title: "", name: PL.a, position: "집사", mok: "화평-20",
    person_id: null, link_how: "auto", match_basis: "", source: "excel", order_id: null, src_key: `ca-test-pl-${STAMP}|${o.k}`, ...o.v });
  const rows = await rest("ministry_history", "POST", [
    h({ k: "h1", v: { person_id: PL.ids[0], match_basis: "같은 소속" } }),            // 이어진 줄 → 탭에
    h({ k: "h2", v: { year: 2025, mok: "기쁨-5" } }),                                 // 못 맞춘 줄 → 아직 안 이어진 기록
    h({ k: "h3", v: { year: 2027, source: "app", order_id: PL.orders.o1, person_id: PL.ids[0], src_key: `app|${PL.orders.o1}` } }),   // 넘긴 신청
  ]);
  const [h1, h2, h3] = rows.map((r) => r.id);
  try {
    const p = (await call(d.token, "peoplePerson", { id: PL.ids[0] })).body.history;
    assert.deepEqual(p.ministry.map((x) => [x.kind, x.row]).filter(([k]) => k === "history").map(([, r]) => r).sort((x, y) => x - y), [h1, h3].sort((x, y) => x - y));
    assert.equal(p.ministry.some((x) => x.kind === "order" && x.row === PL.orders.o1), false, "넘긴 신청이 신청 쪽에도 보인다");
    assert.equal(p.ministry.find((x) => x.row === h1).status, "임명확정");
    const un = (await call(d.token, "peopleHistory", { id: PL.ids[0] })).body.rows;
    const u2 = un.find((x) => x.kind === "history" && x.row === h2);
    assert.deepEqual(Object.keys(u2).sort(), ["committee", "how", "kind", "mok", "position", "role_title", "row", "team", "year"]);
    const link = (row, how, person = PL.ids[0]) => call(d.token, "peopleLink", { kind: "history", row, person, how });
    const m = await link(h2, "manual");
    assert.equal(m.body.ok, true, JSON.stringify(m.body));
    let r2 = (await rest(`ministry_history?select=person_id,link_how,match_basis&id=eq.${h2}`, "GET"))[0];
    assert.deepEqual([r2.person_id, r2.link_how, r2.match_basis], [PL.ids[0], "manual", "사람이 이음"]);
    assert.equal((await link(h2, "none")).body.ok, true);
    r2 = (await rest(`ministry_history?select=person_id,link_how&id=eq.${h2}`, "GET"))[0];
    assert.deepEqual([r2.person_id, r2.link_how], [null, "none"]);
    const f = await link(h1, "auto");
    assert.equal(f.body.ok, true, JSON.stringify(f.body));
    assert.equal(typeof f.body.relinked, "boolean");
    assert.equal((await link(h2, "auto")).body.error, "not-linked");
    assert.equal((await link(h1, "manual", PL.ids[2])).body.error, "other-name");
    // expect(낙관적 잠금 · b6 약속② · history-db.ts link() 456~459행과 같은 패턴) — 낡은 expect → conflict(안 바뀜) · 맞는 expect → 성공
    const r1 = (await rest(`ministry_history?select=updated_at,person_id,link_how&id=eq.${h1}`, "GET"))[0];
    const stale = await call(d.token, "peopleLink", { kind: "history", row: h1, person: PL.ids[0], how: "manual", expect: "2000-01-01T00:00:00.000Z" });
    assert.equal(stale.body.error, "conflict", JSON.stringify(stale.body));
    assert.deepEqual((await rest(`ministry_history?select=updated_at,person_id,link_how&id=eq.${h1}`, "GET"))[0], r1, "conflict 뒤에도 줄이 안 바뀌어야 한다");
    const freshOk = await call(d.token, "peopleLink", { kind: "history", row: h1, person: PL.ids[0], how: "manual", expect: r1.updated_at });
    assert.equal(freshOk.body.ok, true, JSON.stringify(freshOk.body));
    const r1b = (await rest(`ministry_history?select=person_id,link_how,match_basis&id=eq.${h1}`, "GET"))[0];
    assert.deepEqual([r1b.person_id, r1b.link_how, r1b.match_basis], [PL.ids[0], "manual", "사람이 이음"]);
    const logs = (await call(people.super.token, "auditList", { limit: 50 })).body.rows
      .filter((r) => r.action === "history.link" && r.target === String(h2));
    assert.deepEqual(logs.map((r) => r.detail).reverse(), [{ op: "pick", year: 2025, by: "directory" }, { op: "none", year: 2025, by: "directory" }]);
  } finally {
    await rest(`ministry_history?id=in.(${[h1, h2, h3].join(",")})`, "DELETE");
  }
});
