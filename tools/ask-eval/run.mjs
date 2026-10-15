// 🤖 성도 묻기 견주기 ③ — 개발 함수 askEval 로 질문(cases.mjs)을 모델마다 돌려 「맞는 조건」을 센다(2026-10-15).
//   개발에서만 — 시험용 총괄 계정을 만들어 부르고 지운다. 명단은 세지 않는다(조건만). 결과 파일은 저장소 밖에.
//   set -a; . ~/.church-admin/dev.env; set +a
//   node tools/ask-eval/run.mjs <vocab.json> <결과.json> claude-haiku-5-5,claude-opus-5-5 [반복 수]
import { readFileSync, writeFileSync } from "node:fs";
import { CASES } from "./cases.mjs";

const URL_ = process.env.DEV_URL, ANON = process.env.DEV_ANON, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 주소(DEV_URL)에서만 돈다");
const [vocabPath, outPath, modelsArg, repArg] = process.argv.slice(2);
if (!vocabPath || !outPath || !modelsArg) throw new Error("쓰는 법: run.mjs <vocab.json> <결과.json> <모델,모델> [반복 수]");
const vocab = JSON.parse(readFileSync(vocabPath, "utf8"));
const MODELS = modelsArg.split(",");
const REP = Number(repArg) || 1;
// 100만 토큰당 달러(입력 · 출력) — 바뀌면 여기만
const PRICE = { "claude-haiku-5-5": [0.10, 0.50], "claude-sonnet-5-5": [1.5, 7.5], "claude-opus-5-5": [4, 20] };

const svc = { apikey: SERVICE, "Content-Type": "application/json", ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
const STAMP = Date.now();
const body = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t.slice(0, 300) }; } };
const email = `ca-test-eval-${STAMP}@example.test`, password = "T" + STAMP + "!x";
const u = await body(await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc, body: JSON.stringify({ email, password, email_confirm: true }) }));
let memberId = null;
const results = [];
try {
  const s = await body(await fetch(URL_ + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }));
  const [m] = await body(await fetch(URL_ + "/rest/v1/admin_members", { method: "POST", headers: { ...svc, Prefer: "return=representation" },
    body: JSON.stringify({ auth_user_id: u.id, name: "시험-견주기", gu: "사랑", mok: "1", status: "active" }) }));
  memberId = m.id;
  await fetch(URL_ + "/rest/v1/admin_role_grants", { method: "POST", headers: svc, body: JSON.stringify({ member_id: m.id, role_id: "super" }) });
  const call = async (question, model) => {
    for (let k = 0; k < 2; k++) {
      const r = await fetch(URL_ + "/functions/v1/church-admin", { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON, Authorization: "Bearer " + s.access_token },
        body: JSON.stringify({ action: "askEval", question, model, vocab }) });
      const b = await body(r);
      // 한꺼번에 부르면 함수가 깨어나며 BOOT_ERROR 를 낸다 · API 429/5xx — 한 번만 다시
      const retry = (b.error === "ask-ai" && /429|5\d\d|net/.test(String(b.code))) || /BOOT_ERROR|WORKER/.test(JSON.stringify(b).slice(0, 200));
      if (b.ok || k === 1 || !retry) return b;
      await new Promise((ok) => setTimeout(ok, 3000));
    }
  };
  await call("", MODELS[0]);   // 깨우기(빈 질문 — AI 안 부름)
  const jobs = [];
  for (let rep = 0; rep < REP; rep++) CASES.forEach((c, i) => MODELS.forEach((model) => jobs.push({ i, c, model, rep })));
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { i, c, model, rep } = jobs[next++];
      const t0 = Date.now();
      const b = await call(c.q, model);
      let pass = false, err = "";
      if (b.ok) { try { pass = !!c.ok(b, b.tree); } catch (e) { err = "check: " + e.message; } }
      else err = [b.error, b.code, b.msg].filter(Boolean).join(" ");
      results.push({ i, rep, q: c.q, model, pass, err, ms: b.ms ?? Date.now() - t0, usage: b.usage, status: b.status, chips: b.chips,
        unsupported: b.unsupported, alternatives: b.alternatives, tree: b.tree });
      process.stdout.write(pass ? "." : "x");
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log();
} finally {
  if (memberId) await fetch(URL_ + "/rest/v1/admin_audit?member_id=eq." + memberId, { method: "DELETE", headers: svc });
  if (memberId) await fetch(URL_ + "/rest/v1/admin_members?id=eq." + memberId, { method: "DELETE", headers: svc });
  if (u.id) await fetch(URL_ + "/auth/v1/admin/users/" + u.id, { method: "DELETE", headers: svc });
}
results.sort((a, b) => a.i - b.i || (a.model < b.model ? -1 : 1) || a.rep - b.rep);
writeFileSync(outPath, JSON.stringify(results, null, 1));
for (const model of MODELS) {
  const rs = results.filter((r) => r.model === model);
  const pass = rs.filter((r) => r.pass).length, errs = rs.filter((r) => r.err && !r.err.startsWith("check")).length;
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  const tin = rs.reduce((a, r) => a + (r.usage?.input || 0), 0), tout = rs.reduce((a, r) => a + (r.usage?.output || 0), 0);
  const p = PRICE[model] || [0, 0];
  console.log(`${model}: 맞음 ${pass}/${rs.length} · 오류 ${errs} · 걸린 시간 가운데 ${ms[Math.floor(ms.length / 2)]}ms · 가장 김 ${ms[ms.length - 1]}ms`
    + ` · 토큰 입력 ${tin} 출력 ${tout} · 비용 $${((tin * p[0] + tout * p[1]) / 1e6).toFixed(4)}`);
}
for (const r of results.filter((x) => !x.pass)) console.log(`  ✗ ${r.i + 1}(${r.model.replace("claude-", "")}) ${r.q} — ${r.err || JSON.stringify(r.chips)}`);
