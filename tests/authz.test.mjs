import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_ROLES, canCall, knownRoles, norm, parseIdentity, identityKey,
  identityCandidates, parseRoles, kakaoNickname, kakaoAvatar,
} from "../supabase/functions/church-admin/authz.ts";

test("모르는 액션은 막는다 — 객체 기본 이름(toString·__proto__)도", () => {
  const sup = { status: "active", roles: ["super"] };
  assert.equal(canCall("nope", sup), "unknown-action");
  assert.equal(canCall("toString", sup), "unknown-action");
  assert.equal(canCall("__proto__", null), "unknown-action");
});

test("me·register 는 로그인만 되어 있으면(등록 전·대기·정지도)", () => {
  for (const a of ["me", "register"]) {
    assert.equal(canCall(a, null), "ok");
    assert.equal(canCall(a, { status: "pending", roles: [] }), "ok");
    assert.equal(canCall(a, { status: "disabled", roles: [] }), "ok");
  }
});

test("super 액션 × 사람 다섯 가지", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["super"] }, "pending"],
    [{ status: "disabled", roles: ["super"] }, "disabled"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const superActions = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "super");
  assert.deepEqual(superActions.sort(), ["auditList", "membersApprove", "membersList", "membersSetRoles", "membersSetStatus",
    "ministryTesterFind", "ministryTesterSave", "ministryTesters", "peopleLinkSync"]);
  for (const a of superActions) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
});

test("knownRoles 는 super 를 늘 담는다", () => {
  assert.ok(knownRoles().includes("super"));
  assert.deepEqual(knownRoles(), [...knownRoles()].sort());
});

test("ministry 액션 × 사람 여섯 가지 — 사역 담당·총괄은 통과, 역할 없는 분은 막힘", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["ministry"] }, "pending"],
    [{ status: "disabled", roles: ["ministry"] }, "disabled"],
    [{ status: "active", roles: [] }, "forbidden"],
    [{ status: "active", roles: ["bibleevent"] }, "forbidden"],
    [{ status: "active", roles: ["ministry"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const ministryActions = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "ministry");
  assert.deepEqual(ministryActions.sort(), ["historyCandidates", "historyExport", "historyGroups", "historyLink", "historyLinkGroup", "historyList", "historyRematch",
    "historyRequestDelete", "historyRequestList", "historyRequestSet", "historyRowAdd", "historyRowDelete", "historyRowSave", "historyUploadCheck", "historyUploadSave",
    "ministryAppointed", "ministryCatalogAdmin", "ministryCatalogOrder",
    "ministryCatalogSave", "ministryDelete", "ministryList", "ministryPaperCheck", "ministryPaperSave",
    "ministryPerson", "ministryPhoneClear", "ministrySetStatus", "ministryStats"]);
  for (const a of ministryActions) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
  assert.deepEqual(knownRoles(), ["bibleevent", "directory", "duty", "dutylead", "education", "educourse", "ministry", "super", "teacher"]);
});

test("directory(교인명부) 액션 × 사람 — 교인명부 역할·총괄만 통과, 사역 담당은 막힘", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["directory"] }, "pending"],
    [{ status: "disabled", roles: ["directory"] }, "disabled"],
    [{ status: "active", roles: ["bibleevent"] }, "forbidden"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["directory"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const acts = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "directory");
  assert.deepEqual(acts.sort(), ["peopleExport", "peopleHistory", "peopleLink", "peoplePerson", "peopleSearch", "peopleStats"]);
  for (const a of acts) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
});

test("bibleevent(성경필사(암송)) 액션 × 사람 — 이 역할·총괄만 통과, 사역·교인명부 담당은 막힘", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["bibleevent"] }, "pending"],
    [{ status: "disabled", roles: ["bibleevent"] }, "disabled"],
    [{ status: "active", roles: [] }, "forbidden"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["directory"] }, "forbidden"],
    [{ status: "active", roles: ["bibleevent"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const acts = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "bibleevent");
  // ⚠️ Task 6~8 이 bibleevent 액션을 더할 때마다 이 목록에도 더한다 — 빠진 액션이 다른 역할로 새지 않게
  assert.deepEqual(acts.sort(), ["evEventCreate", "evEventSave", "evEvents", "evHistory", "evPeopleLookup", "evPerson", "evRoster",
    "evRowAdd", "evRowDelete", "evRowSave", "evStats", "evUploadCheck", "evUploadSave"]);
  for (const a of acts) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
});

test("norm — 공백·자모분리(NFD)", () => {
  assert.equal(norm("  김   세웅 "), "김 세웅");
  assert.equal(norm("\u1100\u1175\u11B7"), "김");
  assert.equal(norm(null), "");
  assert.equal(norm(20), "20");
});

test("parseIdentity — 교구", () => {
  assert.deepEqual(parseIdentity({ type: "교구", gu: "화평", mok: " 20 ", name: "김  세웅", bu: "중등부" }),
    { ok: true, identity: { type: "교구", gu: "화평", mok: "20", bu: "", grade: "", name: "김 세웅" } });
});

test("parseIdentity — 교회학교는 교구·목장을 버린다", () => {
  assert.deepEqual(parseIdentity({ type: "교회학교", gu: "화평", mok: "3", bu: "중등부", grade: "3학년", name: "홍길동" }),
    { ok: true, identity: { type: "교회학교", gu: "", mok: "", bu: "중등부", grade: "3학년", name: "홍길동" } });
});

test("parseIdentity — 틀린 입력", () => {
  assert.deepEqual(parseIdentity(null), { ok: false, error: "invalid" });
  assert.deepEqual(parseIdentity([]), { ok: false, error: "invalid" });
  assert.deepEqual(parseIdentity({ type: "성가대", name: "a" }), { ok: false, error: "invalid-type" });
  assert.deepEqual(parseIdentity({ gu: "화평", mok: "20" }), { ok: false, error: "name-required" });
  assert.deepEqual(parseIdentity({ type: "교구", gu: "화평", name: "a" }), { ok: false, error: "gu-mok-required" });
  assert.deepEqual(parseIdentity({ type: "교회학교", bu: "중등부", name: "a" }), { ok: false, error: "bu-grade-required" });
  assert.deepEqual(parseIdentity({ gu: "화평", mok: "20", name: "가".repeat(41) }), { ok: false, error: "too-long" });
});

test("parseIdentity — 특수문자(postgrest .in() 을 깨는 문자)는 거절", () => {
  assert.deepEqual(parseIdentity({ gu: "화평", mok: "20", name: '김,"' }), { ok: false, error: "bad-char" });
  assert.deepEqual(parseIdentity({ gu: "화평", mok: "2|0", name: "김세웅" }), { ok: false, error: "bad-char" });
});

test("identityKey — 성경암송 앱 users.identity_key 와 같은 꼴", () => {
  assert.equal(identityKey({ type: "교구", gu: "화평", mok: "20", bu: "", grade: "", name: "김세웅" }), "교구|화평|20|||김세웅");
});

test("identityCandidates — 목장·학년 표기 차이", () => {
  const a = identityCandidates({ type: "교구", gu: "화평", mok: "20", bu: "", grade: "", name: "김세웅" });
  assert.deepEqual([...a].sort(), ["교구|화평|20목장|||김세웅", "교구|화평|20|||김세웅"].sort());
  const b = identityCandidates({ type: "교구", gu: "화평", mok: "20목장", bu: "", grade: "", name: "김세웅" });
  assert.ok(b.includes("교구|화평|20|||김세웅"));
  const c = identityCandidates({ type: "교회학교", gu: "", mok: "", bu: "중등부", grade: "3", name: "홍" });
  assert.deepEqual([...c].sort(), ["교회학교|||중등부|3학년|홍", "교회학교|||중등부|3|홍"].sort());
});

test("parseRoles", () => {
  const known = ["ministry", "super"];
  assert.deepEqual(parseRoles(["super", " ministry ", "super"], known), { ok: true, roles: ["ministry", "super"] });
  assert.deepEqual(parseRoles("super", known), { ok: false, error: "invalid-roles" });
  assert.deepEqual(parseRoles([], known), { ok: false, error: "roles-required" });
  assert.deepEqual(parseRoles(["", " "], known), { ok: false, error: "roles-required" });
  assert.deepEqual(parseRoles(["root"], known), { ok: false, error: "unknown-role" });
});

test("kakaoNickname — 여러 칸 중 있는 것(카카오는 실제로 name 에 담아 온다 — Task 1)", () => {
  assert.equal(kakaoNickname({ nickname: " 행복 " }), "행복");
  assert.equal(kakaoNickname({ name: "홍길동", full_name: "홍길동", preferred_username: "홍길동" }), "홍길동");
  assert.equal(kakaoNickname({ nickname: "", name: "홍길동" }), "홍길동");
  assert.equal(kakaoNickname({ full_name: "가".repeat(50) }).length, 40);
  assert.equal(kakaoNickname(null), "");
});

test("kakaoAvatar — http 는 https 로, 주소가 아니면 비움", () => {
  assert.equal(kakaoAvatar({ avatar_url: "http://k.kakaocdn.net/dn/a/img_640x640.jpg" }), "https://k.kakaocdn.net/dn/a/img_640x640.jpg");
  assert.equal(kakaoAvatar({ avatar_url: "https://k.kakaocdn.net/x.jpg" }), "https://k.kakaocdn.net/x.jpg");
  assert.equal(kakaoAvatar({ avatar_url: "javascript:alert(1)" }), "");
  assert.equal(kakaoAvatar({ avatar_url: 'https://a.b/x" onerror="y' }), "");
  assert.equal(kakaoAvatar({}), "");
  assert.equal(kakaoAvatar(null), "");
  assert.equal(kakaoAvatar({ avatar_url: "https://evil.example/x.jpg" }), "");
  assert.equal(kakaoAvatar({ avatar_url: "http://img1.kakaocdn.net/dn/a.jpg" }), "https://img1.kakaocdn.net/dn/a.jpg");
});

test("education(교육 총괄) 액션 × 사람 — 교육 총괄·총괄만 통과 · 교육 담당(맡은 강좌)은 막힘", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["education"] }, "pending"],
    [{ status: "disabled", roles: ["education"] }, "disabled"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["educourse"] }, "forbidden"],
    [{ status: "active", roles: ["teacher"] }, "forbidden"],
    [{ status: "active", roles: ["directory"] }, "forbidden"],
    [{ status: "active", roles: ["education"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const acts = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "education");
  // 강좌 만들기·고치기·복사·회차 저장·담당자 지정은 총괄만(2026-10-05 친구 결정) · 수료증 설정(명의·문안·직인)도 총괄만(3단계) ·
  //   📊 교육 통계도 총괄만(4단계 C · 2026-10-06 — 교육 담당·강사·교인명부 역할은 forbidden)
  assert.deepEqual(acts.sort(), ["eduCertSettings", "eduCertSettingsSave", "eduCourseCopy", "eduCourseSave", "eduSessionsSave", "eduStaffCandidates",
    "eduStaffSet", "eduStats"]);
  for (const a of acts) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
});

test("교육 신청 현황 액션(역할 배열) × 사람 — 교육 총괄·교육 담당·총괄 통과 · 대기·정지·다른 역할은 막힘", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["educourse"] }, "pending"],
    [{ status: "pending", roles: ["education"] }, "pending"],
    [{ status: "disabled", roles: ["educourse"] }, "disabled"],
    [{ status: "disabled", roles: ["education", "educourse"] }, "disabled"],
    [{ status: "active", roles: [] }, "forbidden"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["directory", "bibleevent"] }, "forbidden"],
    [{ status: "active", roles: ["teacher"] }, "forbidden"],                 // 강사(2단계)는 신청 현황을 못 부른다
    [{ status: "active", roles: ["educourse"] }, "ok"],
    [{ status: "active", roles: ["education"] }, "ok"],
    [{ status: "active", roles: ["ministry", "educourse"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  // 신청 현황 쪽(EDU_BOTH) — 출석부 액션(강사 포함)은 아래 시험이 따로 본다 · 수료(3단계)도 총괄 + 교육 담당(강사 아님)
  //   (역할 배열은 봉사 당번도 쓴다 — 교육 것만 고른다 · 당번은 맨 아래 시험)
  const acts = Object.keys(ACTION_ROLES).filter((k) => Array.isArray(ACTION_ROLES[k]) && ACTION_ROLES[k].includes("education") && !ACTION_ROLES[k].includes("teacher"));
  assert.deepEqual(acts.sort(), ["eduCertIssue", "eduCertList", "eduCertPrint", "eduCertRevoke", "eduCheckSet",
    "eduCourses", "eduEnrollAdd", "eduEnrollList", "eduEnrollSet", "eduExport", "eduFeeSet", "eduPeopleLookup", "eduSessions"]);
  for (const a of acts) {
    assert.deepEqual([...ACTION_ROLES[a]].sort(), ["education", "educourse"], a);
    for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
  }
  // 배열 안의 역할도 서버가 아는 역할
  assert.ok(knownRoles().includes("educourse"));
  // 모든 액션의 값은 null·글자·글자 배열 셋 가운데 하나(빈 배열 금지 — 아무도 못 부르는 액션이 된다)
  for (const [a, v] of Object.entries(ACTION_ROLES)) {
    assert.ok(v === null || typeof v === "string" || (Array.isArray(v) && v.length > 0 && v.every((r) => typeof r === "string" && r)), a);
  }
});

test("출석부 액션(2단계 · 강사 teacher) × 사람 — 교육 총괄·교육 담당·강사·총괄 통과 · 강사는 신청 현황·강좌 관리 액션을 못 부른다", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["teacher"] }, "pending"],
    [{ status: "disabled", roles: ["teacher"] }, "disabled"],
    [{ status: "active", roles: [] }, "forbidden"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["directory", "bibleevent"] }, "forbidden"],
    [{ status: "active", roles: ["teacher"] }, "ok"],
    [{ status: "active", roles: ["educourse"] }, "ok"],
    [{ status: "active", roles: ["education"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const acts = Object.keys(ACTION_ROLES).filter((k) => Array.isArray(ACTION_ROLES[k]) && ACTION_ROLES[k].includes("teacher"));
  assert.deepEqual(acts.sort(), ["eduAttendBulk", "eduAttendCourses", "eduAttendExport", "eduAttendSessions", "eduAttendSet", "eduAttendSheet", "eduAttendSummary"]);
  for (const a of acts) {
    assert.deepEqual([...ACTION_ROLES[a]].sort(), ["education", "educourse", "teacher"], a);
    for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
  }
  // 강사만 있는 분 — 출석부 밖의 교육 액션은 모두 forbidden(신청 현황 eduEnrollList 포함 · 서버 문에서 막힌다)
  const teacher = { status: "active", roles: ["teacher"] };
  const eduOther = Object.keys(ACTION_ROLES).filter((k) => k.startsWith("edu") && !acts.includes(k));
  assert.ok(eduOther.includes("eduEnrollList") && eduOther.includes("eduEnrollSet") && eduOther.includes("eduExport") && eduOther.includes("eduPeopleLookup"));
  for (const a of eduOther) assert.equal(canCall(a, teacher), "forbidden", a);
  assert.equal(canCall("eduEnrollList", teacher), "forbidden");
  assert.ok(knownRoles().includes("teacher"));
});

test("수료 액션(3단계) — 강사는 문에서 막힌다 · 교육 담당은 확정·인쇄는 되고 설정은 안 된다 · 총괄은 모두", () => {
  const teacher = { status: "active", roles: ["teacher"] };
  const course = { status: "active", roles: ["educourse"] };
  const chief = { status: "active", roles: ["education"] };
  const cert = ["eduCertList", "eduCheckSet", "eduCertIssue", "eduCertRevoke", "eduCertPrint"];
  const settings = ["eduCertSettings", "eduCertSettingsSave"];
  for (const a of [...cert, ...settings]) {
    assert.equal(canCall(a, teacher), "forbidden", a);
    assert.equal(canCall(a, chief), "ok", a);
    assert.equal(canCall(a, { status: "active", roles: ["super"] }), "ok", a);
  }
  for (const a of cert) assert.equal(canCall(a, course), "ok", a);
  for (const a of settings) assert.equal(canCall(a, course), "forbidden", a);
  assert.equal(canCall("eduCertSettingsSave", { status: "active", roles: ["educourse", "teacher"] }), "forbidden");
});

// ---------- 봉사 당번(2026-10-06 · SQL 015 역할 duty·dutylead) ----------
test("봉사 당번 — 담당자 지정은 당번 총괄·총괄만 · 당번 담당(맡은 당번)은 막힘", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["duty"] }, "pending"],
    [{ status: "disabled", roles: ["duty"] }, "disabled"],
    [{ status: "active", roles: [] }, "forbidden"],
    [{ status: "active", roles: ["dutylead"] }, "forbidden"],
    [{ status: "active", roles: ["education"] }, "forbidden"],
    [{ status: "active", roles: ["ministry", "directory"] }, "forbidden"],
    [{ status: "active", roles: ["duty"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const acts = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "duty");
  assert.deepEqual(acts.sort(), ["dutyStaffCandidates", "dutyStaffSet"]);
  for (const a of acts) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
});

test("봉사 당번 — 그 밖의 액션(역할 배열)은 당번 총괄·당번 담당·총괄 통과 · 대기·정지·다른 역할은 막힘", () => {
  const cases = [
    [null, "not-registered"],
    [{ status: "pending", roles: ["dutylead"] }, "pending"],
    [{ status: "disabled", roles: ["duty", "dutylead"] }, "disabled"],
    [{ status: "active", roles: [] }, "forbidden"],
    [{ status: "active", roles: ["ministry"] }, "forbidden"],
    [{ status: "active", roles: ["education", "educourse", "teacher"] }, "forbidden"],
    [{ status: "active", roles: ["directory", "bibleevent"] }, "forbidden"],     // 교인명부 역할만으로는 당번 명단·명부 찾기를 못 부른다
    [{ status: "active", roles: ["dutylead"] }, "ok"],
    [{ status: "active", roles: ["duty"] }, "ok"],
    [{ status: "active", roles: ["ministry", "dutylead"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const acts = Object.keys(ACTION_ROLES).filter((k) => Array.isArray(ACTION_ROLES[k]) && ACTION_ROLES[k].includes("duty"));
  // ⚠️ 당번 액션을 더하면 이 목록에도 — 빠진 액션이 다른 역할로 새지 않게
  assert.deepEqual(acts.sort(), ["dutyAskClear", "dutyBoardList", "dutyBoardSave", "dutyDateAdd", "dutyDaySet", "dutyDaysOff", "dutyExport",
    "dutyLineRemove", "dutyLineSave", "dutyPeopleLookup", "dutyRoster", "dutySignAdd", "dutySignMove", "dutySignNote", "dutySignRemove",
    "dutySlotDelete", "dutySlotSet"]);
  for (const a of acts) {
    assert.deepEqual([...ACTION_ROLES[a]].sort(), ["duty", "dutylead"], a);
    for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
  }
  // duty 로 시작하는 액션은 위 두 묶음이 전부(다른 역할 값이 섞이지 않았다)
  const all = Object.keys(ACTION_ROLES).filter((k) => k.startsWith("duty")).sort();
  assert.deepEqual(all, [...acts, "dutyStaffCandidates", "dutyStaffSet"].sort());
  // 당번 역할만 있는 분은 교육·사역·교인명부 액션을 못 부른다
  for (const a of ["eduEnrollList", "eduAttendSheet", "ministryList", "peopleSearch", "evRoster", "membersList"]) {
    assert.equal(canCall(a, { status: "active", roles: ["duty", "dutylead"] }), "forbidden", a);
  }
  assert.ok(knownRoles().includes("duty") && knownRoles().includes("dutylead"));
});
