import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PAPER_MAX_ROWS, PAPER_ALIAS, paperName, paperDay,
  legacyNorm, appIdentityKey, ministryPaperKeys,
  PILSA_PHONE_RE, pilsaPhone, MIN_POSITIONS, ministryPaperOne,
} from "../supabase/functions/church-admin/paper.ts";

test("paperDay — 「2026-12-15」·「2026.12.15」·「2026. 12. 15.」 다 한국 자정의 ISO로", () => {
  const want = { v: "2026-12-14T15:00:00.000Z" }; // 한국(+09:00) 자정 = UTC 전날 15시
  assert.deepEqual(paperDay("2026-12-15"), want);
  assert.deepEqual(paperDay("2026.12.15"), want);
  assert.deepEqual(paperDay("2026. 12. 15."), want);
});

test("paperDay — 틀린 꼴은 오류, 빈 칸은 null", () => {
  assert.deepEqual(paperDay(""), { v: null });
  assert.deepEqual(paperDay(null), { v: null });
  assert.deepEqual(paperDay(undefined), { v: null });
  assert.deepEqual(paperDay("2026년 12월 15일"), { v: null, err: "날짜는 2026-12-15 꼴로 적어 주세요" });
  assert.deepEqual(paperDay("12-15"), { v: null, err: "날짜는 2026-12-15 꼴로 적어 주세요" });
});

test("PAPER_ALIAS — 임명·확정·취소·신청·접수 다 받는다", () => {
  assert.equal(PAPER_ALIAS["임명"], "임명확정");
  assert.equal(PAPER_ALIAS["확정"], "임명확정");
  assert.equal(PAPER_ALIAS["취소"], "취소");
  assert.equal(PAPER_ALIAS["신청"], "신청완료");
  assert.equal(PAPER_ALIAS["접수"], "접수완료");
  assert.equal(paperName("임명확정"), "임명");
  assert.equal(paperName("신청완료"), "신청");
  assert.equal(paperName("접수완료"), "접수");
  assert.equal(paperName("취소"), "취소"); // 매핑 밖은 그대로
});

test("ministryPaperKeys(\"화평\",\"20목장\",\"김세웅\") — 「20」·「20목장」 두 키", () => {
  const keys = ministryPaperKeys("화평", "20목장", "김세웅");
  assert.deepEqual(new Set(keys), new Set(["교구|화평|20|||김세웅", "교구|화평|20목장|||김세웅"]));
  assert.equal(keys.length, 2);
});

test("appIdentityKey — 성경암송 로그인 규칙과 같다(완성형으로 바꾸지 않는다)", () => {
  const u = { type: "교구", gu: "화평", mok: "20", bu: "", grade: "", name: "김세웅" };
  assert.equal(appIdentityKey(u), "교구|화평|20|||김세웅");
  // ⚠️ NFC 로 바꾸면 안 된다 — 자모분리(NFD) 이름이 들어오면 NFD 그대로 나와야 앱 로그인이
  //    만드는 identity_key(같은 NFD)와 글자 그대로 같아진다(authz.ts 의 norm 은 반대로 NFC 로 맞춘다).
  const nfdName = "김세웅".normalize("NFD");
  const key = appIdentityKey({ type: "교구", gu: "화평", mok: "20", bu: "", grade: "", name: nfdName });
  assert.equal(key, "교구|화평|20|||" + nfdName);
  assert.notEqual(key, key.normalize("NFC")); // 정말 NFD 가 살아 있다면 NFC 로 되돌릴 때 달라져야 한다
});

test("pilsaPhone — 11자리·10자리는 형식화, 틀린 번호는 원문대로", () => {
  assert.equal(pilsaPhone("01012345678"), "010-1234-5678");
  assert.equal(pilsaPhone("010-1234-5678"), "010-1234-5678");
  assert.equal(pilsaPhone("0212345678"), "021-234-5678"); // 10자리는 형식만 맞추고 유효성은 안 본다
  assert.equal(pilsaPhone("  1234  "), "1234"); // 자릿수가 안 맞으면 원문(trim)만
  assert.equal(pilsaPhone(""), "");
  assert.equal(pilsaPhone(null), "");
});

test("PILSA_PHONE_RE — 010~019 만, 하이픈 있거나 없거나", () => {
  assert.ok(PILSA_PHONE_RE.test("010-1234-5678"));
  assert.ok(PILSA_PHONE_RE.test("01012345678"));
  assert.ok(!PILSA_PHONE_RE.test("02-1234-5678"));
  assert.ok(!PILSA_PHONE_RE.test("010-12-5678"));
});

test("MIN_POSITIONS — 9개(사모 포함)", () => {
  assert.equal(MIN_POSITIONS.size, 9);
  assert.deepEqual(
    [...MIN_POSITIONS].sort(),
    ["권사", "목사", "사모", "성도", "안수집사", "장로", "전도사", "집사", "학생"].sort(),
  );
});

test("PAPER_MAX_ROWS — 300", () => {
  assert.equal(PAPER_MAX_ROWS, 300);
});

// ── ministryPaperOne — 원문 검사 순서: 교구·목장 → 이름 → 직분 → 전화 → 사역팀 → 신청일 → 임명일 → 상태 ──

test("ministryPaperOne — 교구·목장 없음", () => {
  const r = ministryPaperOne({ name: "김세웅", position: "집사", phone: "01012345678", team: "찬양팀" }, 0);
  assert.equal(r.error, "교구·목장을 적어 주세요");
  assert.equal(r.ok, false);
});

test("ministryPaperOne — 이름 없음", () => {
  const r = ministryPaperOne({ gu: "화평", mok: "20", position: "집사", phone: "01012345678", team: "찬양팀" }, 0);
  assert.equal(r.error, "이름을 적어 주세요");
});

test("ministryPaperOne — 직분이 목록 밖", () => {
  const r = ministryPaperOne(
    { gu: "화평", mok: "20", name: "김세웅", position: "집사님", phone: "01012345678", team: "찬양팀" }, 0);
  assert.equal(r.error, "직분이 목록에 없습니다");
});

test("ministryPaperOne — 휴대폰 번호 틀림", () => {
  const r = ministryPaperOne(
    { gu: "화평", mok: "20", name: "김세웅", position: "집사", phone: "1234", team: "찬양팀" }, 0);
  assert.equal(r.error, "휴대폰 번호를 확인해 주세요 (010-1234-5678)");
});

test("ministryPaperOne — 사역팀 없음", () => {
  const r = ministryPaperOne(
    { gu: "화평", mok: "20", name: "김세웅", position: "집사", phone: "01012345678" }, 0);
  assert.equal(r.error, "사역팀을 적어 주세요");
});

test("ministryPaperOne — 신청일·임명일 꼴이 틀림", () => {
  const r1 = ministryPaperOne(
    { gu: "화평", mok: "20", name: "김세웅", position: "집사", phone: "01012345678", team: "찬양팀",
      appliedAt: "작년 봄" }, 0);
  assert.equal(r1.error, "신청일 — 날짜는 2026-12-15 꼴로 적어 주세요");

  const r2 = ministryPaperOne(
    { gu: "화평", mok: "20", name: "김세웅", position: "집사", phone: "01012345678", team: "찬양팀",
      decidedAt: "작년 봄" }, 0);
  assert.equal(r2.error, "임명일 — 날짜는 2026-12-15 꼴로 적어 주세요");
});

test("ministryPaperOne — 상태 문구를 못 알아봄", () => {
  const r = ministryPaperOne(
    { gu: "화평", mok: "20", name: "김세웅", position: "집사", phone: "01012345678", team: "찬양팀",
      status: "보류" }, 0);
  assert.equal(r.error, "상태는 임명·취소·신청 중에 적어 주세요 (보류)");
  assert.equal(r.badStatus, "보류");
});

test("ministryPaperOne — 다 맞는 줄은 error 없이 넘어간다(뒤 단계 전까지 ok 는 false)", () => {
  const r = ministryPaperOne(
    { gu: "화평", mok: "20목장", name: "김세웅", position: "집사", phone: "010-1234-5678",
      team: "찬양팀", status: "임명", appliedAt: "2026-09-01", decidedAt: "2026-09-15" }, 3);
  assert.equal(r.error, "");
  assert.equal(r.ok, false); // ministryPaperOne 자체는 통과시키지 않는다 — 원문 1.12 소관
  assert.equal(r.i, 3);
  assert.equal(r.phone, "010-1234-5678");
  assert.equal(r.rowStatus, "임명확정");
  assert.equal(r.appliedAt, "2026-08-31T15:00:00.000Z");
  assert.equal(r.decidedAt, "2026-09-14T15:00:00.000Z");
});
