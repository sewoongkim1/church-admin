// 봉사 당번 알림 — 교회 어드민 → 성경암송 api 로 「실제로 나간 분(notified)·가지 않은 분(missed)·꺼 둠(notify-off)」이 이어지는가(개발 전용 · 쓰기).
//   저장소의 다른 시험은 가짜 dutyNotify 로 규칙만 본다 — index.ts notifyDuty 가 api 의 답을 실제로 옮기는지는 이 시험만 본다(고침 검토 반영 2026-10-07).
//   돌리는 법: set -a; . ~/.church-admin/dev.env; set +a; node --test tests/duty-notify.dev.test.mjs   (개발 프로젝트에서만 돈다 · preflight 는 .dev. 시험을 건너뛴다)
// 하는 일: 당번 총괄 한 분(이메일 로그인)과 시험 당번(받는 중)을 만들고, 개발 dutyOpen 을 잠깐 켠 뒤(끝나면 원래대로) 앱 계정이 있는 줄(기기 없는 개발 사용자)을
//   확정 → 빼기 → 다시 넣기(되살리기) 하며 응답의 notified·missed·notifyError 를 본다. 스위치(dutyNotifyOff)를 켜면 알릴 분이 있던 저장은 notify-off,
//   알릴 분이 없던 저장(어제 자리의 줄을 뺌 — 지난 날은 원래 알림이 없다)은 평소처럼 조용하다(api 의 held 0).
//   끝나면(실패해도) 지원 → 자리 → 날짜 → 틀 → 당번 → 기록·역할·담당자 → auth 사용자를 지우고 app_config 를 원래대로 둔다. ⚠️ 키·비밀번호·계정 번호를 찍지 않는다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트(ktpwthwqzgcqcrmsafdo)에만 돌린다");
if (!ANON || !SERVICE) throw new Error("DEV_ANON·DEV_SERVICE_KEY 가 없다");
const FN = URL_ + "/functions/v1/church-admin";
const svc = { apikey: SERVICE, "Content-Type": "application/json", ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now(), TAG = "ca-test-dutynotify-";
async function body(res) { const t = await res.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200) }; } }
async function rest(path, method = "GET", data, prefer = "return=representation") {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method, headers: { ...svc, Prefer: prefer }, body: data ? JSON.stringify(data) : undefined });
  const x = await body(r);
  assert.ok(r.ok, path.split("?")[0] + " " + r.status + " " + JSON.stringify(x).slice(0, 200));
  return x;
}
async function call(token, action, extra = {}) {
  const r = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + token }, body: JSON.stringify({ ...extra, action }) });
  return { status: r.status, body: await body(r) };
}
const kst = (d = 0) => new Date(Date.now() + 9 * 3600000 + d * 86400000).toISOString().slice(0, 10);
const dow = (ds) => new Date(ds + "T00:00:00Z").getUTCDay();
const made = { users: [], members: [], boards: [] };
const chief = {};
const cfg = { open: undefined, off: undefined };   // 시작 전 app_config 값(없으면 null)
const setCfg = (key, value) => rest("app_config?on_conflict=key", "POST", { key, value }, "resolution=merge-duplicates,return=representation");
const delCfg = (key) => rest(`app_config?key=eq.${key}`, "DELETE");

before(async () => {
  for (const [k, key] of [["open", "dutyOpen"], ["off", "dutyNotifyOff"]]) {
    const rows = await rest(`app_config?select=value&key=eq.${key}`);
    cfg[k] = rows.length ? rows[0].value : null;
  }
  assert.equal(cfg.off, null, "개발 dutyNotifyOff 가 켜져 있다 — 시험할 수 없다");
  const email = `${TAG}${STAMP}@example.test`, password = "T" + STAMP + "!x";
  const u = await body(await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc, body: JSON.stringify({ email, password, email_confirm: true }) }));
  assert.ok(u.id, "사용자 만들기 실패"); made.users.push(u.id);
  const s = await body(await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  assert.ok(s.access_token, "로그인 실패"); chief.token = s.access_token;
  const [m] = await rest("admin_members", "POST", { auth_user_id: u.id, name: "시험-당번총괄(알림)", gu: "사랑", mok: "1", status: "active" });
  made.members.push(m.id);
  await rest("admin_role_grants", "POST", { member_id: m.id, role_id: "duty" });
});

after(async () => {
  const errs = [];
  const step = async (name, fn) => { try { await fn(); } catch (e) { errs.push(name + ": " + String(e?.message).slice(0, 160)); } };
  await step("dutyNotifyOff", () => delCfg("dutyNotifyOff"));
  await step("dutyOpen", () => (cfg.open === null ? delCfg("dutyOpen") : cfg.open === undefined ? null : setCfg("dutyOpen", cfg.open)));
  if (made.boards.length) {
    const bs = made.boards.join(",");
    await step("지원", async () => { const slots = (await rest(`duty_slots?select=id&board_id=in.(${bs})`)).map((x) => x.id); if (slots.length) await rest(`duty_signups?slot_id=in.(${slots.join(",")})`, "DELETE"); });
    for (const t of ["duty_slots", "duty_days", "duty_lines", "duty_board_staff"]) await step(t, () => rest(`${t}?board_id=in.(${bs})`, "DELETE"));
    await step("당번", () => rest(`duty_boards?id=in.(${bs})`, "DELETE"));
  }
  if (made.members.length) {
    const ms = made.members.join(",");
    await step("기록", () => rest(`admin_audit?member_id=in.(${ms})`, "DELETE"));
    await step("역할", () => rest(`admin_role_grants?member_id=in.(${ms})`, "DELETE"));
    await step("담당자", () => rest(`admin_members?id=in.(${ms})`, "DELETE"));
  }
  for (const uid of made.users) await step("auth 사용자", async () => { const x = await fetch(URL_ + "/auth/v1/admin/users/" + uid, { method: "DELETE", headers: svc }); assert.ok(x.ok, "auth delete " + x.status); });
  await step("0 줄 확인", async () => { if (made.boards.length) assert.equal((await rest(`duty_boards?select=id&id=in.(${made.boards.join(",")})`)).length, 0); });
  await step("app_config 원래대로", async () => {
    const now = await rest("app_config?select=key,value&key=in.(dutyOpen,dutyNotifyOff)");
    const open = now.find((x) => x.key === "dutyOpen");
    assert.equal(now.some((x) => x.key === "dutyNotifyOff"), false, "dutyNotifyOff 가 남았다");
    assert.deepEqual(open ? open.value : null, cfg.open === undefined ? null : cfg.open, "dutyOpen 이 원래 값이 아니다");
  });
  if (errs.length) throw new Error("정리 실패 " + errs.length + "건: " + errs.join(" / "));
});

test("기기 없는 분은 「보냈어요」가 아니라 「가지 않았어요」로 온다 · 되살리면 잠기지 않은 날에도 알린다 · 꺼 두면 notify-off(알릴 분이 없던 저장은 조용)", async () => {
  const d3 = kst(3);
  let r = await call(chief.token, "dutyBoardSave", { board: { title: `${TAG}${STAMP}`, place: "시험 식당", status: "open" } });
  assert.equal(r.body.ok, true, JSON.stringify(r.body)); const board = r.body.id; made.boards.push(board);
  r = await call(chief.token, "dutyLineSave", { board_id: board, line: { service: "2부", task: "설거지", start: "11:00", end: "12:00", capacity: 2, weekday: dow(d3) } });
  assert.equal(r.body.ok, true, JSON.stringify(r.body)); const line = r.body.id;
  r = await call(chief.token, "dutyRoster", { board_id: board });
  const day = r.body.days.find((d) => d.date === d3); assert.ok(day && day.slots.length === 1, "사흘 뒤 자리");
  const slot = day.slots[0].id;
  // 알림 받는 기기가 없는 개발 사용자 한 분(번호는 찍지 않는다)
  const subs = new Set([...(await rest("push_subscriptions?select=user_id")).map((x) => x.user_id), ...(await rest("ios_push_tokens?select=user_id")).map((x) => x.user_id)]);
  const usr = (await rest("users?select=id&limit=50")).find((x) => !subs.has(x.id)); assert.ok(usr && usr.id, "기기 없는 개발 사용자");
  const ap = await rest("rpc/duty_apply", "POST", { p_slot: slot, p_user: usr.id, p_ident: { name: `${TAG}${STAMP}-w`, who_type: "교구", group_name: "믿음", sub_name: "99", ident_key: `staff|notify|${STAMP}` }, p_staff: true });
  assert.equal(ap.ok, true, JSON.stringify(ap).slice(0, 200)); assert.equal(ap.hadUser, true, "SQL 이 그 줄의 앱 계정 유무를 준다(hadUser)");
  await setCfg("dutyOpen", true);   // 문을 잠깐 연다(끝나면 원래대로) — 닫힌 동안에는 시험 참여자만 세어진다
  // 확정 — 기기 없는 분: notified 0 · missed 1
  r = await call(chief.token, "dutyDaySet", { board_id: board, date: d3, op: "confirm" });
  assert.deepEqual(r.body, { ok: true, active: 1, notified: 0, missed: 1, notifyError: null }, JSON.stringify(r.body));
  // 빼기 — 같다
  const ros = await call(chief.token, "dutyRoster", { board_id: board, from: d3, to: d3 });
  const sign = ros.body.days[0].slots[0].signups[0]; assert.ok(sign && sign.id, "지원 줄");
  assert.equal(sign.hasApp, true); assert.equal(sign.hasPush, false, "명단 딱지도 「알림 꺼짐」");
  r = await call(chief.token, "dutySignRemove", { id: sign.id });
  assert.equal(r.body.ok, true, JSON.stringify(r.body)); assert.deepEqual([r.body.notified, r.body.missed, r.body.notifyError], [0, 1, null], JSON.stringify(r.body));
  // 꺼 둔 알림 — 다시 넣기(되살리기)의 응답이 notify-off
  await setCfg("dutyNotifyOff", true);
  r = await call(chief.token, "dutySignRestore", { id: sign.id });
  assert.equal(r.body.ok, true, JSON.stringify(r.body)); assert.deepEqual([r.body.notified, r.body.notifyError], [0, "notify-off"], JSON.stringify(r.body)); assert.equal("missed" in r.body, false);
  // 꺼 둔 동안이라도 **알릴 분이 없던 저장**은 평소처럼 조용하다(api 가 held 0 을 준다) — 어제 자리(지난 날)의 줄을 빼는 것은 원래 알림이 없다
  const t0 = kst(-1);
  r = await call(chief.token, "dutyDateAdd", { board_id: board, date: t0, line_ids: [line] });
  assert.equal(r.body.ok, true, JSON.stringify(r.body));
  const rosT = await call(chief.token, "dutyRoster", { board_id: board, from: t0, to: t0 });
  const dayT = (rosT.body.days || []).find((d) => d.date === t0); assert.ok(dayT && dayT.slots.length === 1, "어제 자리");
  const apT = await rest("rpc/duty_apply", "POST", { p_slot: dayT.slots[0].id, p_user: usr.id, p_ident: { name: `${TAG}${STAMP}-w`, who_type: "교구", group_name: "믿음", sub_name: "99", ident_key: `staff|notify|${STAMP}` }, p_staff: true, p_force: true });
  assert.equal(apT.ok, true, JSON.stringify(apT).slice(0, 200));
  r = await call(chief.token, "dutySignRemove", { id: apT.id });
  assert.deepEqual([r.body.ok, r.body.notified, r.body.notifyError, "missed" in r.body], [true, 0, null, false], "꺼 둔 동안 · 알릴 분이 없던 저장 — 「따로 알려 주세요」를 말하지 않는다: " + JSON.stringify(r.body));
  await delCfg("dutyNotifyOff");
  // 확정을 풀고(잠기지 않은 날) 빼기 → 다시 넣기 — 되살리면 잠기지 않은 날에도 알림 부탁이 간다
  r = await call(chief.token, "dutyDaySet", { board_id: board, date: d3, op: "unconfirm" }); assert.equal(r.body.ok, true, JSON.stringify(r.body));
  r = await call(chief.token, "dutySignRemove", { id: sign.id }); assert.equal(r.body.ok, true, JSON.stringify(r.body));
  r = await call(chief.token, "dutySignRestore", { id: sign.id });
  assert.equal(r.body.locked, false); assert.deepEqual([r.body.notified, r.body.missed, r.body.notifyError], [0, 1, null], JSON.stringify(r.body));
  for (const x of [ap, apT, r.body, ros.body, rosT.body]) assert.equal(JSON.stringify(x).includes(usr.id), false, "응답에 계정 번호가 없다");
});
