import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  STATUS_RANK, orderCourses, courseLabel, courseHint, courseOptions, initialCourse, ruleText, attendText, candidateOf, countsOf, pendingOf, headLine,
  markOf, rowAction, issueLabel, issueAsk, belowAsk, revokeAsk, issueDoneText, revokeDoneText, certErrorText, reloadAfter, printCerts, NO_PRINT,
  ISSUER_MAX, BODY_MAX, BODY_HINT, fillBody, normIssuer, normBody, countText, settingsPatch, SEAL_STEPS, SEAL_MAX_BYTES, fitSize, dataUrlBytes, hasAlpha,
  whiteToAlpha, sealOutType, sealFileError, isChief,
} from "../js/menus/education/certs-logic.js";
import { CERT_GEOM, CERT_LOGO, certYmd, certPeriod, certCourseText, certTextEm, certLines, certInfoHeight, certBodySize, sealSrc, certHtml }
  from "../js/menus/education/cert-template.js";
import { eduCertCandidate, certListOut, eduCertBody, checkCertSettings, checkCertSeal, CERT_SEAL_MAX, CERT_ISSUER_MAX, CERT_BODY_MAX }
  from "../supabase/functions/church-admin/edu-rules.ts";
import { errorWord } from "../js/menus/education/enrollments-logic.js";

// ---------- 수료증 틀 ----------
// 자리 표의 지문 — 성경암송 tests/edu-front.test.cjs 에 **같은 값**이 박혀 있다(js/edu.js EDU_CERT_GEOM · 앱 수료증 캔버스).
//   자리를 일부러 고칠 때는 두 곳(cert-template.js CERT_GEOM · 성경암송 js/edu.js EDU_CERT_GEOM)을 같은 값·같은 차례로 고치고 두 지문을 함께 바꾼다.
const CERT_GEOM_SHA256 = "957637f91b3f4464e1861611440b2ca3391dddc6ff6aefa543b8fa0e194c45e8";
test("CERT_GEOM — 앱 캔버스(성경암송 EDU_CERT_GEOM)와 같은 자리 표(지문)", () => {
  const sha = createHash("sha256").update(JSON.stringify(CERT_GEOM)).digest("hex");
  assert.equal(sha, CERT_GEOM_SHA256, "자리 표가 바뀌었다 — 성경암송 js/edu.js EDU_CERT_GEOM·두 시험 지문을 함께 고칠 것 (지금 " + sha + ")");
  assert.ok(Math.abs(CERT_GEOM.ratio - 210 / 297) < 0.0001, "A4 가로");
  assert.ok(CERT_GEOM.issTop + CERT_GEOM.issSize / 2 + CERT_GEOM.sealH / 2 < CERT_GEOM.ratio * 100 - CERT_GEOM.frame - CERT_GEOM.gap, "직인이 안쪽 테두리 안");
  assert.ok(CERT_GEOM.mainBottom < CERT_GEOM.dateTop && CERT_GEOM.dateTop + CERT_GEOM.dateSize < CERT_GEOM.issTop, "가운데 덩이 → 발급일 → 명의");
  assert.deepEqual([...CERT_GEOM.bodySizes].sort((a, b) => b - a), CERT_GEOM.bodySizes, "문안 크기는 큰 것부터");
  assert.equal(CERT_LOGO, "img/logo-gocheok.png");
});

test("certYmd·certPeriod·certCourseText — 증서 날짜는 해를 모두 적는다 · 틀린 날짜는 빈 글", () => {
  assert.equal(certYmd("2026-12-13"), "2026년 12월 13일");
  assert.equal(certYmd("2027-03-03"), "2027년 3월 3일");
  for (const x of ["2026-02-30", "", null, undefined, "2026-1-3", "x"]) assert.equal(certYmd(x), "", String(x));
  assert.equal(certPeriod("2026-10-25", "2026-12-13"), "2026년 10월 25일 ~ 2026년 12월 13일");
  assert.equal(certPeriod("2026-10-25", "2026-10-25"), "2026년 10월 25일");
  assert.equal(certPeriod("2026-10-25", null), "2026년 10월 25일 ~");
  assert.equal(certPeriod(null, "2026-12-13"), "~ 2026년 12월 13일");
  assert.equal(certPeriod(null, null), "");
  assert.equal(certCourseText("구원론 3차", "2026 하반기"), "구원론 3차 (2026 하반기)");
  assert.equal(certCourseText(" 교사 연수 ", ""), "교사 연수");
  assert.equal(certCourseText("교사 연수", null), "교사 연수");
});

test("certTextEm·certLines·certBodySize — 기본 문안은 가장 큰 단계 · 길면 한 단계씩 작게 · 300자도 가장 작은 단계 안", () => {
  assert.equal(certTextEm("가나"), 2);
  assert.equal(certTextEm("ab 1"), 0.55 * 3 + 0.3);
  assert.equal(certTextEm("「」"), 2);
  assert.equal(certTextEm(""), 0);
  assert.equal(certLines("", 2, 64), 1);
  assert.equal(certLines("가\n나", 2, 64), 2);
  const base = { title: "구원론 3차", term: "2026 하반기", from: "2026-10-25", to: "2026-12-13" };
  const body = eduCertBody("위 사람은 고척교회가 주관한 「{과정}」 과정을 성실히 마쳤기에 이 증서를 드립니다.", base.title);
  assert.equal(certBodySize({ ...base, body }), CERT_GEOM.bodySizes[0]);
  const long = "가".repeat(200);
  const s = certBodySize({ ...base, body: long });
  assert.ok(s < CERT_GEOM.bodySizes[0] && CERT_GEOM.bodySizes.includes(s), String(s));
  const max = "가".repeat(CERT_BODY_MAX);
  const sm = certBodySize({ ...base, body: max });
  assert.ok(certLines(max, sm, CERT_GEOM.mainW) * sm * CERT_GEOM.bodyLH <= CERT_GEOM.mainBottom - CERT_GEOM.mainTop - certInfoHeight(base) - CERT_GEOM.mainGap,
    "300자 문안도 가운데 칸 안");
  // 과정 이름이 길면(두 줄) 덩이가 높아진다 · 기간이 없으면 한 줄 덜
  assert.ok(certInfoHeight({ ...base, title: "제자훈련 1단계 — 말씀과 삶을 함께 나누는 열두 주 과정과 그 너머의 긴 이름" }) > certInfoHeight(base));
  assert.ok(certInfoHeight({ title: "a" }) < certInfoHeight(base));
});

const CERT = { name: "홍길동", title: "구원론 3차", term: "2026 하반기", from: "2026-10-25", to: "2026-12-13", certNo: "고척-2026-0001", issuedOn: "2026-12-13",
  issuer: "고척교회 담임목사 홍길동", body: "위 사람은 「구원론 3차」 과정을 마쳤습니다.", seal: "data:image/png;base64,iVBORw0KGgo=" };
test("certHtml — 칸이 모두 있고 서버 글자는 esc · 직인은 PNG·JPEG data URL 일 때만", () => {
  const h = certHtml(CERT);
  for (const t of ["제 고척-2026-0001 호", "수료증", "홍길동", "구원론 3차 (2026 하반기)", "2026년 10월 25일 ~ 2026년 12월 13일", "2026년 12월 13일",
    "고척교회 담임목사 홍길동", 'src="img/logo-gocheok.png"', 'class="ec-cert-seal" src="data:image/png;base64,iVBORw0KGgo="', "성 명", "과 정", "기 간"]) {
    assert.ok(h.includes(t), t);
  }
  assert.ok(!/\d\.\d{4,}cqw/.test(h), "cqw 값에 긴 소수(0.30000000000000004)가 없다");
  const x = certHtml({ ...CERT, name: `<script>"x"</script>`, issuer: "a&b", body: "<b>", title: "<i>" });
  assert.ok(!x.includes("<script>") && x.includes("&lt;script&gt;&quot;x&quot;&lt;/script&gt;") && x.includes("a&amp;b") && x.includes("&lt;b&gt;"));
  assert.ok(!x.includes("<i>"));
  // 명의·문안에 꺾쇠가 들어 와도 글자로만(태그가 되지 않는다)
  const y = certHtml({ ...CERT, issuer: "<img src=x onerror=alert(1)>", body: "1 < 2 > 0" });
  assert.ok(!y.includes("<img src=x") && y.includes("&lt;img src=x onerror=alert(1)&gt;") && y.includes("1 &lt; 2 &gt; 0"));
  for (const bad of ["javascript:alert(1)", "https://x.example/s.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,ab\"onerror=1", null, 1]) {
    assert.equal(sealSrc(bad), "", String(bad));
    assert.ok(!certHtml({ ...CERT, seal: bad }).includes("ec-cert-seal"), String(bad));
  }
  assert.equal(sealSrc("data:image/jpeg;base64,/9j/4A=="), "data:image/jpeg;base64,/9j/4A==");
  const np = certHtml({ ...CERT, from: null, to: null, certNo: "", issuedOn: null });
  assert.ok(!np.includes("기 간") && !np.includes("ec-cert-no") && !np.includes("ec-cert-date"));
});

// ---------- 강좌·한 분 ----------
const C = (id, status, o = {}) => ({ id, title: "강좌" + id, term: "2026 하반기", status, statusLabel: status, attendPct: 80, checkLabel: null, counts: { confirmed: 3 }, ...o });
test("강좌 — 진행 중·끝이 위(같은 단계는 서버 차례) · 고르개 글 · 처음 강좌", () => {
  const list = [C("a", "draft"), C("b", "done"), C("c", "running"), C("d", "open"), C("e", "running"), C("f", "archived"), C("g", "weird")];
  assert.deepEqual(orderCourses(list).map((c) => c.id), ["c", "e", "b", "d", "a", "f", "g"]);
  assert.deepEqual(orderCourses(null), []);
  assert.equal(STATUS_RANK.running, 0);
  assert.equal(courseLabel({ title: "t", term: "", statusLabel: "진행 중" }), "t · 학기 없음 · 진행 중");
  assert.equal(courseHint(C("a", "running", { checkLabel: "과제" })), "확정 3분 · 수료 기준 80% + 과제");
  assert.equal(courseHint(C("a", "running", { attendPct: null, counts: null })), "확정 0분");
  assert.deepEqual(courseOptions([C("a", "draft"), C("b", "running")]).map((o) => o.value), ["b", "a"]);
  assert.equal(initialCourse(list, "d").id, "d");
  assert.equal(initialCourse(list, "zz"), null);
  assert.equal(initialCourse([C("a", "done")], "").id, "a");
});

test("ruleText·attendText", () => {
  assert.equal(ruleText({ attendPct: 80, checkLabel: "과제" }), "출석 80% 이상 + 과제 확인");
  assert.equal(ruleText({ attendPct: 75 }), "출석 75% 이상");
  assert.equal(ruleText({ attendPct: null, checkLabel: " " }), "출석 기준 없음");
  assert.equal(attendText({ attended: 6, denom: 7, pct: 86, excused: 1 }), "출석 6/7 · 86%");
  assert.equal(attendText({ attended: 0, denom: 2, pct: 0 }), "출석 0/2 · 0%");
  assert.equal(attendText({ pct: null, excused: 2 }), "공결 2회");
  assert.equal(attendText({ pct: null, excused: 0 }), "출석 기록 없음");
  assert.equal(attendText(null), "출석 기록 없음");
});

// 서버 certListOut 이 만든 사람으로 — 화면의 candidateOf·countsOf 가 서버 candidate·counts 와 같다(확인 체크 직후 다시 셀 때 같은 답)
test("candidateOf·countsOf — 서버 eduCertCandidate·certListOut 과 같은 답", () => {
  const ss = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const ppl = [
    { id: 11, name: "가", check_done: true }, { id: 12, name: "나", check_done: false }, { id: 13, name: "다", check_done: true, completed: true, cert_no: "고척-2026-0001", completed_at: "2026-12-13T01:00:00Z" },
    { id: 14, name: "라", check_done: true, cert_revoked: true, cert_no: "고척-2026-0002", completed_at: "2026-12-13T01:00:00Z" }, { id: 15, name: "마" },
  ];
  const rows = [];
  for (const p of ppl) ss.forEach((s, i) => { if (p.id === 15) return; rows.push({ enrollment_id: p.id, session_id: s.id, state: p.id === 12 && i === 0 ? "absent" : i === 3 && p.id === 11 ? "late" : "present" }); });
  for (const [pct, label] of [[80, "과제"], [80, null], [100, "과제"], [0, null]]) {
    const out = certListOut({ attend_pct: pct, check_label: label }, ss, ppl, rows);
    for (const p of out.people) {
      assert.equal(candidateOf(p, { attendPct: pct, checkLabel: label }), p.candidate, `${p.name} ${pct} ${label}`);
      assert.equal(candidateOf(p, { attendPct: pct, checkLabel: label }), eduCertCandidate({ attend: p.attend, attendPct: pct, checkLabel: label, checkDone: p.checkDone }));
    }
    assert.deepEqual(countsOf(out.people), out.counts);
    assert.equal(pendingOf(out.people).length, out.counts.candidates);
  }
  assert.equal(candidateOf({ attend: { pct: 90 } }, { attendPct: "80" }), false, "기준이 수가 아니면 아니다");
  assert.deepEqual(countsOf(null), { total: 0, candidates: 0, completed: 0, revoked: 0 });
});

test("headLine·markOf·rowAction", () => {
  assert.equal(headLine({ total: 20, candidates: 12, completed: 5, revoked: 0 }), "확정 20분 · 후보 12분 · 수료 5분");
  assert.equal(headLine({ total: 20, candidates: 0, completed: 5, revoked: 1 }), "확정 20분 · 후보 0분 · 수료 5분 · 수료 취소 1분");
  assert.deepEqual(markOf({ completed: true, certNo: "고척-2026-0001", candidate: true }), { cls: "done", text: "고척-2026-0001" });
  assert.deepEqual(markOf({ revoked: true, certNo: "고척-2026-0002", candidate: true }), { cls: "rv", text: "취소됨 · 고척-2026-0002" });
  assert.deepEqual(markOf({ candidate: true }), { cls: "cand", text: "후보" });
  assert.equal(markOf({}), null);
  assert.deepEqual(rowAction({ completed: true }, { archived: true }), { op: "revoke", label: "취소", danger: true });
  assert.equal(rowAction({ candidate: true }, { archived: true }), null, "보관 강좌는 확정 없음");
  assert.deepEqual(rowAction({ revoked: true }, {}), { op: "issue", label: "다시 확정", primary: false });
  assert.deepEqual(rowAction({ candidate: true }, {}), { op: "issue", label: "확정", primary: true });
});

test("확인 창·알림 글", () => {
  assert.equal(issueLabel(12), "후보 12분 수료 확정");
  assert.ok(issueAsk(3).startsWith("아래 3분을 수료로 확정할까요?"));
  assert.ok(belowAsk({ name: "홍길동" }, { attendPct: 80, checkLabel: "과제" }).includes("수료 기준(출석 80% 이상 + 과제 확인)"));
  assert.ok(revokeAsk({ name: "홍길동", certNo: "고척-2026-0007" }).includes("고척-2026-0007는 남아서"));
  assert.equal(issueDoneText([{ id: 1, certNo: "고척-2026-0007", how: "new" }, { id: 2, certNo: "고척-2026-0008", how: "new" }, { id: 3, certNo: "고척-2026-0009", how: "new" }]),
    "3분을 수료로 확정했어요 (고척-2026-0007~0009)");
  assert.equal(issueDoneText([{ id: 1, certNo: "고척-2026-0007", how: "new" }]), "1분을 수료로 확정했어요 (고척-2026-0007)");
  assert.equal(issueDoneText([{ id: 1, certNo: "고척-2026-0003", how: "restored" }, { id: 2, certNo: "고척-2026-0001", how: "already" }]),
    "1분은 같은 번호로 되살렸어요 · 1분은 이미 수료였어요");
  assert.equal(issueDoneText([]), "바뀐 것이 없어요");
  assert.equal(revokeDoneText({ ok: true, certNo: "고척-2026-0001" }), "수료를 취소했어요 — 번호 고척-2026-0001는 남아요");
  assert.equal(revokeDoneText({ ok: true, already: true }), "이미 취소된 수료예요");
});

// 서버(edu-db.ts·edu-rules.ts · 보고서 1-1 표)가 수료 액션에서 돌려주는 오류 코드 — 모두 한국말이 있어야 한다
const SERVER_CODES = ["bad-id", "not-assigned", "not-found", "bad-done", "course-archived", "not-confirmed", "bad-ids", "too-many", "wrong-course",
  "not-completed", "forbidden", "nothing", "bad-issuer", "bad-body", "no-body", "bad-seal", "seal-too-big"];
test("certErrorText — 서버 오류 코드마다 한국말 · too-long 은 칸으로 · ids 가 붙으면 이름 · 모르는 코드는 빈 글", () => {
  for (const c of SERVER_CODES) assert.ok(certErrorText({ error: c }), c);
  assert.equal(certErrorText({ error: "too-long", field: "issuer" }), `발급 명의는 ${CERT_ISSUER_MAX}자까지 적을 수 있어요`);
  assert.equal(certErrorText({ error: "too-long", field: "body" }), `문안은 ${CERT_BODY_MAX}자까지 적을 수 있어요`);
  assert.equal(certErrorText({ error: "too-long" }), "");
  assert.equal(certErrorText({ error: "x" }), "");
  assert.equal(certErrorText(null), "");
  const people = [{ id: 1, name: "김가은" }, { id: 2, name: "이나래" }];
  assert.equal(certErrorText({ error: "not-confirmed", ids: [2, 1, 99] }, people), "신청 현황에서 확정된 분만 수료할 수 있어요 — 새로 불러올게요 (이나래·김가은)");
  assert.equal(certErrorText({ error: "not-confirmed", ids: [99] }, people), "신청 현황에서 확정된 분만 수료할 수 있어요 — 새로 불러올게요");
  const many = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: "이" + i }));
  assert.ok(certErrorText({ error: "wrong-course", ids: many.map((p) => p.id) }, many).endsWith("(이0·이1·이2·이3·이4 외 2분)"));
  assert.equal(reloadAfter("not-assigned"), "courses");
  for (const c of ["not-found", "not-confirmed", "wrong-course", "not-completed", "course-archived"]) assert.equal(reloadAfter(c), "list", c);
  assert.equal(reloadAfter("too-many"), "");
});

test("신청 현황 — 번호 있는 줄의 has-cert 거절 말(3단계)", () => {
  assert.equal(errorWord("has-cert"), "수료번호가 있는 분은 취소·변경할 수 없어요 — 「🎓 수료」에서 먼저 수료를 취소해 주세요");
});

test("printCerts — eduCertPrint 답을 한 장씩 · 받은 차례 그대로", () => {
  const d = { course: { id: "c", title: "구원론 3차", term: "2026 하반기", from: "2026-10-25", to: null }, issuer: "명의", body: "문안", seal: null,
    people: [{ id: 2, name: "가", certNo: "고척-2026-0002", issuedOn: "2026-12-13" }, { id: 1, name: "나", certNo: "고척-2026-0001", issuedOn: "2026-12-13" }] };
  const out = printCerts(d);
  assert.deepEqual(out.map((x) => x.certNo), ["고척-2026-0002", "고척-2026-0001"]);
  assert.deepEqual(out[0], { name: "가", title: "구원론 3차", term: "2026 하반기", from: "2026-10-25", to: null, certNo: "고척-2026-0002", issuedOn: "2026-12-13",
    issuer: "명의", body: "문안", seal: null });
  assert.deepEqual(printCerts({}), []);
  assert.ok(NO_PRINT.includes("수료한 분이 아직 없어요"));
});

// ---------- 수료증 설정 ----------
test("settingsPatch — 바뀐 칸만 · 서버와 같은 다듬기·한도 · 보낸 patch 는 서버 checkCertSettings 를 지난다", () => {
  const cur = { issuer: "고척교회", body: "위 사람은 「{과정}」 과정을 마쳤습니다.", seal: null };
  assert.deepEqual(settingsPatch(cur, { issuer: " 고척교회 ", body: cur.body + "\r\n", seal: null }), { ok: true, patch: {} });
  assert.deepEqual(settingsPatch(cur, { issuer: "고척교회  담임목사   홍길동", body: cur.body, seal: null }), { ok: true, patch: { issuer: "고척교회 담임목사 홍길동" } });
  assert.deepEqual(settingsPatch(cur, { issuer: "고척교회", body: "새 문안\r\n둘째 줄", seal: null }), { ok: true, patch: { body: "새 문안\n둘째 줄" } });
  assert.deepEqual(settingsPatch(cur, { issuer: "고척교회", body: cur.body, seal: "data:image/png;base64,iVBORw0KGgo=" }), { ok: true, patch: { seal: "data:image/png;base64,iVBORw0KGgo=" } });
  assert.deepEqual(settingsPatch({ ...cur, seal: "data:image/png;base64,iVBORw0KGgo=" }, { issuer: "고척교회", body: cur.body, seal: null }), { ok: true, patch: { seal: null } });
  assert.equal(settingsPatch(cur, { issuer: "x", body: "  ", seal: null }).message, "문안을 적어 주세요");
  assert.equal(settingsPatch(cur, { issuer: "가".repeat(ISSUER_MAX + 1), body: "a", seal: null }).ok, false);
  assert.equal(settingsPatch(cur, { issuer: "가".repeat(ISSUER_MAX), body: "a", seal: null }).ok, true);
  assert.equal(settingsPatch(cur, { issuer: "", body: "\u{1F600}".repeat(BODY_MAX), seal: null }).ok, true, "코드 포인트로 센다(서버 char_length)");
  assert.equal(settingsPatch(cur, { issuer: "", body: "가".repeat(BODY_MAX + 1), seal: null }).ok, false);
  assert.equal(ISSUER_MAX, CERT_ISSUER_MAX);
  assert.equal(BODY_MAX, CERT_BODY_MAX);
  for (const next of [{ issuer: "  고척교회  담임목사 ", body: "  문안 {과정}\r\n끝  ", seal: null }, { issuer: "", body: "\u{1F600}".repeat(BODY_MAX), seal: null }]) {
    const p = settingsPatch({ issuer: "옛", body: "옛", seal: "data:image/png;base64,iVBORw0KGgo=" }, next).patch;
    const s = checkCertSettings(p);
    assert.equal(s.ok, true, JSON.stringify(next));
    assert.deepEqual(s.patch, p, "서버가 다듬어도 같은 값");
  }
  assert.equal(normIssuer(" a \n b "), "a b");
  assert.equal(normBody(" a\r\nb "), "a\nb");
  assert.equal(countText("가\u{1F600}", 60), "2/60");
  assert.equal(fillBody("「{과정}」 · {과정}", "$& 반"), eduCertBody("「{과정}」 · {과정}", "$& 반"), "미리보기 문안 = 서버 채우기");
  assert.equal(BODY_HINT, "{과정} 자리에 강좌 이름이 들어가요");
});

test("직인 그림 셈 — 600px 안 · 바이트는 서버 checkCertSeal 과 같은 셈 · 흰 바탕 투명 · 꼴", () => {
  assert.deepEqual(fitSize(1400, 1412), { w: 595, h: 600 });
  assert.deepEqual(fitSize(300, 200), { w: 300, h: 200 }, "작으면 그대로");
  assert.deepEqual(fitSize(2000, 10, 480), { w: 480, h: 2 });
  assert.deepEqual(fitSize(0, NaN), { w: 1, h: 1 });
  assert.deepEqual(SEAL_STEPS, [600, 480, 360]);
  assert.equal(SEAL_MAX_BYTES, CERT_SEAL_MAX);
  const b64 = (n) => Buffer.alloc(n).toString("base64");
  for (const n of [1, 2, 3, 10, 1000]) assert.equal(dataUrlBytes("data:image/png;base64," + b64(n)), n, String(n));
  assert.equal(dataUrlBytes("x"), Infinity);
  // 서버 한도와 맞물리는지 — 화면이 「된다」고 본 것을 서버도 받는다(머리 바이트는 PNG)
  const png = (n) => "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(n - 8)]).toString("base64");
  assert.equal(dataUrlBytes(png(SEAL_MAX_BYTES)) <= SEAL_MAX_BYTES && checkCertSeal(png(SEAL_MAX_BYTES)).ok, true);
  assert.equal(dataUrlBytes(png(SEAL_MAX_BYTES + 1)) > SEAL_MAX_BYTES && !checkCertSeal(png(SEAL_MAX_BYTES + 1)).ok, true);
  assert.equal(hasAlpha([255, 255, 255, 255, 1, 2, 3, 255]), false);
  assert.equal(hasAlpha([255, 255, 255, 255, 1, 2, 3, 0]), true);
  const px = [255, 255, 255, 255, 250, 248, 245, 255, 220, 220, 221, 255, 200, 30, 40, 255, 190, 195, 199, 255];
  whiteToAlpha(px);
  assert.deepEqual([px[3], px[7], px[11], px[15], px[19]], [0, 0, 134, 255, 255], "흰색·거의 흰색은 투명 · 옅은 회색은 반투명 · 붉은 인주·진한 칸은 그대로");
  assert.equal(sealOutType("image/jpeg", false), "image/jpeg");
  assert.equal(sealOutType("image/jpeg", true), "image/png");
  assert.equal(sealOutType("image/gif", false), "image/png", "GIF 는 PNG 로");
  assert.equal(sealOutType("image/png", false), "image/png");
  assert.equal(sealFileError({ type: "image/svg+xml", size: 10 }), "직인은 PNG·JPG·GIF 그림만 올릴 수 있어요");
  assert.equal(sealFileError({ type: "image/png", size: 11 * 1024 * 1024 }).includes("10MB"), true);
  assert.equal(sealFileError({ type: "image/gif", size: 100 }), "");
  assert.equal(sealFileError(null), "");
});

test("isChief — 교육 총괄·총괄만(설정 단추) · 교육 담당·강사는 아님", () => {
  assert.equal(isChief(["education"]), true);
  assert.equal(isChief(["super"]), true);
  assert.equal(isChief(["educourse"]), false);
  assert.equal(isChief(["teacher", "ministry"]), false);
  assert.equal(isChief(null), false);
});
