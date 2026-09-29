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
  assert.deepEqual(superActions.sort(), ["auditList", "membersApprove", "membersList", "membersSetRoles", "membersSetStatus"]);
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
    [{ status: "active", roles: ["ministry"] }, "ok"],
    [{ status: "active", roles: ["super"] }, "ok"],
  ];
  const ministryActions = Object.keys(ACTION_ROLES).filter((k) => ACTION_ROLES[k] === "ministry");
  assert.deepEqual(ministryActions.sort(), ["ministryAppointed", "ministryCatalogAdmin", "ministryCatalogOrder",
    "ministryCatalogSave", "ministryDelete", "ministryList", "ministrySetStatus"]);
  for (const a of ministryActions) for (const [m, want] of cases) assert.equal(canCall(a, m), want, a);
  assert.deepEqual(knownRoles(), ["ministry", "super"]);
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
