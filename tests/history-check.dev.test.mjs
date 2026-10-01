// 사역 이력 확인 · 정정 신청 — 교회 어드민 내부 갈래(성경암송 api 가 서비스 키로 부른다)를 개발 서버에 대고 본다.
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types --test tests/history-check.dev.test.mjs
// ⚠️ 공용 server.dev.test.mjs 는 여러 세션이 고치는 중이라 따로 둔다(이름의 .dev. — preflight 에서 빠진다).
// 시험 자료: 교인ID 990000081~84 · 기록 src_key ca-test-hc-<STAMP>-… · 신청은 지어낸 user_id 하나 — 끝나면 모두 지운다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { HISTORY_OUT_KEYS, REQUEST_OUT_KEYS } from "../supabase/functions/church-admin/history-check.ts";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다 — dev.env 를 확인할 것");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");

const FN = URL_ + "/functions/v1/church-admin";
const REST = URL_ + "/rest/v1/";
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const NAME = `ca-test-hc-${STAMP}-가`;   // 같은 소속(기쁨-12)에 한 분 + 다른 교구에 한 분
const TWIN = `ca-test-hc-${STAMP}-나`;   // 같은 목장에 같은 이름 둘
const IDS = [990000081, 990000082, 990000083, 990000084];
const UID = crypto.randomUUID();         // 앱 계정 자리 — 이 표는 users 를 잇지 않는다(FK 없음)
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const WHO = { type: "교구", gu: "기쁨", mok: "12", bu: "", grade: "", name: NAME };
const hist = {};   // src_key 끝 글자 → 기록 줄 id

async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t }; } }
async function rest(method, path, data) {
  const res = await fetch(REST + path, { method, headers: { ...svc, Prefer: "return=representation" },
    body: data ? JSON.stringify(data) : undefined });
  const j = await body(res);
  if (!res.ok) throw new Error(method + " " + path + " " + res.status + " " + JSON.stringify(j));
  return j;
}
const internal = (payload, key = SERVICE) => fetch(FN, { method: "POST",
  headers: { "Content-Type": "application/json", "x-internal-key": key }, body: JSON.stringify(payload) });
const call = async (payload) => body(await internal(payload));

before(async () => {
  const person = (id, name, mok1, mok3) => ({ person_id: id, name, name_key: name, mok1, mok3, kind2: "장년" });
  await rest("POST", "church_people", [
    person(IDS[0], NAME, "기쁨", "기쁨-12목장"), person(IDS[1], NAME, "소망", "소망-3목장"),
    person(IDS[2], TWIN, "기쁨", "기쁨-12목장"), person(IDS[3], TWIN, "기쁨", "기쁨-12목장"),
  ]);
  // ⚠️ 한꺼번에 넣는 줄은 칸이 모두 같아야 한다(PostgREST 는 첫 줄의 칸으로 넣는다 — 빠진 칸이 null 이 되어 NOT NULL 에 걸린다)
  const h = (k, o) => ({ src_key: `ca-test-hc-${STAMP}-${k}`, name: NAME, year: 0, committee: "", team: "", role_title: "",
    position: "", mok: "", person_id: null, deleted_at: null, ...o });
  const rows = await rest("POST", "ministry_history", [
    h("a", { year: 2025, committee: "찬양위원회", team: "시온성가대", position: "집사", person_id: IDS[0], mok: "기쁨-12" }),
    h("b", { year: 2026, committee: "교육위원회", team: "유년부", role_title: "교사", position: "집사", person_id: IDS[0] }),
    h("c", { year: 2024, committee: "봉사위원회", team: "주차팀", position: "집사", person_id: IDS[0], deleted_at: new Date().toISOString() }),
    h("d", { year: 2026, committee: "찬양위원회", team: "호산나찬양대", position: "권사", person_id: IDS[1] }),
  ]);
  for (const r of rows) hist[r.src_key.split("-").pop()] = r.id;
});

after(async () => {
  await rest("DELETE", `ministry_history_requests?user_id=eq.${UID}`);
  await rest("DELETE", `ministry_history?src_key=like.ca-test-hc-${STAMP}-*`);
  await rest("DELETE", `church_people?person_id=in.(${IDS.join(",")})`);
});

test("서비스 키 머리가 없으면 지금처럼 토큰 검사로 간다(401 unauthenticated)", async () => {
  const res = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ action: "internalMyHistory", who: WHO, user_id: UID }) });
  assert.equal(res.status, 401);
  assert.equal((await body(res)).error, "unauthenticated");
});

test("틀린 키는 막는다(401 unauthorized) · 토큰 갈래의 액션은 내부 갈래로 못 부른다", async () => {
  const bad = await internal({ action: "internalMyHistory", who: WHO, user_id: UID }, SERVICE + "x");
  assert.equal(bad.status, 401);
  assert.equal((await body(bad)).error, "unauthorized");
  const me = await internal({ action: "membersList" });
  assert.equal(me.status, 400);
  assert.equal((await body(me)).error, "unknown-action");
});

test("내 기록 — 같은 교구·목장·이름 한 분의 줄만(빼 둔 줄·다른 분 줄 없이 · 연도 내림차순 · 정해진 칸)", async () => {
  const j = await call({ action: "internalMyHistory", who: WHO, user_id: UID });
  assert.equal(j.ok, true);
  assert.equal(j.found, true);
  assert.deepEqual(j.rows.map((r) => r.id), [hist.b, hist.a]);
  for (const r of j.rows) assert.deepEqual(Object.keys(r).sort(), HISTORY_OUT_KEYS);
  assert.deepEqual(j.requests, []);
  const text = JSON.stringify(j);
  assert.ok(!IDS.some((id) => text.includes(String(id))), "교인ID 가 샜다");
  assert.ok(!UUID_RE.test(text), "uuid 가 샜다");
  assert.ok(!text.includes("기쁨-12"), "그때 목장이 샜다");
});

test("목장 99 · 같은 목장 동명이인 둘 · 다른 교구면 찾지 못함", async () => {
  for (const who of [{ ...WHO, mok: "99" }, { ...WHO, name: TWIN }, { ...WHO, gu: "사랑" }]) {
    const j = await call({ action: "internalMyHistory", who, user_id: UID });
    assert.equal(j.ok, true);
    assert.equal(j.found, false, JSON.stringify(who));
    assert.deepEqual(j.rows, []);
  }
});

test("모양이 틀린 who·user_id 는 bad-who", async () => {
  assert.equal((await call({ action: "internalMyHistory", who: { type: "x", name: NAME }, user_id: UID })).error, "bad-who");
  assert.equal((await call({ action: "internalMyHistory", who: WHO, user_id: "abc" })).error, "bad-who");
  assert.equal((await call({ action: "internalHistoryRequest", who: WHO, user_id: "abc", kind: "find_me" })).error, "bad-who");
});

test("정정 신청 — 이분 줄에 넣고, 같은 줄 두 번 · 남의 줄 · 빼 둔 줄 · 찾았는데 찾아 주세요는 막는다", async () => {
  const send = (o) => call({ action: "internalHistoryRequest", who: WHO, user_id: UID, ...o });
  assert.deepEqual(await send({ kind: "wrong_team", history_id: hist.a, detail: "그해에는 호산나찬양대였어요" }), { ok: true });
  assert.equal((await send({ kind: "not_mine", history_id: hist.a })).error, "already-open");
  assert.equal((await send({ kind: "not_mine", history_id: hist.d })).error, "not-yours");
  assert.equal((await send({ kind: "not_mine", history_id: hist.c })).error, "not-yours");
  assert.equal((await send({ kind: "find_me" })).error, "already-found");
  assert.equal((await send({ kind: "missing", year: "", team_text: "주차팀" })).error, "bad-year");
  assert.deepEqual(await send({ kind: "missing", year: 2023, team_text: "찬양위원회 시온성가대" }), { ok: true });
  // 두 칸(2026-10-02 · committee_text 가 글자면 부서·팀을 따로 · SQL 009) — 둘 다 비면 need-team · 칸마다 100자
  assert.equal((await send({ kind: "missing", year: 2024, committee_text: " ", team_text: "" })).error, "need-team");
  assert.equal((await send({ kind: "missing", year: 2024, committee_text: "가".repeat(101), team_text: "주차팀" })).error, "too-long");
  assert.deepEqual(await send({ kind: "missing", year: 2024, committee_text: " 봉사위원회 ", team_text: "주차팀" }), { ok: true });
});

test("찾지 못한 분은 「찾아 주세요」 하나만", async () => {
  const send = (o) => call({ action: "internalHistoryRequest", who: { ...WHO, mok: "99" }, user_id: UID, ...o });
  assert.equal((await send({ kind: "not_mine", history_id: hist.a })).error, "not-found");
  assert.deepEqual(await send({ kind: "find_me", detail: "목장이 바뀌었어요" }), { ok: true });
  assert.equal((await send({ kind: "find_me" })).error, "already-open");
});

test("내 신청 현황 — 최근 것이 위 · 정해진 칸만 · uuid 없음", async () => {
  const j = await call({ action: "internalMyHistory", who: WHO, user_id: UID });
  assert.deepEqual(j.requests.map((r) => r.kind), ["find_me", "missing", "missing", "wrong_team"]);
  for (const r of j.requests) assert.deepEqual(Object.keys(r).sort(), REQUEST_OUT_KEYS);
  // 두 칸 신청은 committee_text 가 글자(다듬은 그대로) · 옛 한 칸 신청은 null(team_text 에 「부서·팀」 글)
  const [two, one] = j.requests.filter((r) => r.kind === "missing");
  assert.deepEqual([two.year, two.committee_text, two.team_text], [2024, "봉사위원회", "주차팀"]);
  assert.deepEqual([one.year, one.committee_text, one.team_text], [2023, null, "찬양위원회 시온성가대"]);
  assert.ok(j.requests.filter((r) => r.kind !== "missing").every((r) => r.committee_text === null));
  assert.ok(j.requests.every((r) => r.status === "신청"));
  assert.ok(!UUID_RE.test(JSON.stringify(j)), "uuid 가 샜다");
});
