// 개발 DB 에 가짜 사역 이력 씨앗 — 교인명부 세션(자세히 창 사역 탭)과 화면 확인용(2026-10-01).
//   set -a; . ~/.church-admin/dev.env; set +a; node --experimental-strip-types tests/seed-history-dev.mjs [--clean]
// ⚠️ 개발 프로젝트에만 돈다. 이름은 개발 church_people(가짜 명부)에서 그때 읽는다 — 이 파일에 이름을 적지 않는다.
// ⚠️ source_file = 'ca-demo-seed' 줄만 만들고 지운다(server.dev 시험은 ca-test- 만 지운다 — 서로 안 건드린다).
// 2024~2026 세 해 · 앞 40분 · 일부는 목장을 바꾸고(같은 교구 다름) · 명부에 없는 이름 셋 · 맞춤은 history-match.ts 로 계산해 apply 로 쓴다.
import { matchAll, srcKey, toHPerson, HISTORY_PEOPLE_COLS } from "../supabase/functions/church-admin/history-match.ts";

const URL_ = process.env.DEV_URL, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트에만 돌린다");
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };
async function rest(path, method = "GET", data) {
  const r = await fetch(URL_ + "/rest/v1/" + path, { method,
    headers: { ...svc, Prefer: "return=representation" }, body: data ? JSON.stringify(data) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : [];
}
async function all(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`${path}&offset=${from}&limit=1000`);
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

await rest("ministry_history?source_file=eq.ca-demo-seed", "DELETE");
if (process.argv.includes("--clean")) { console.log("지움"); process.exit(0); }

const dir = await all(`church_people?select=${HISTORY_PEOPLE_COLS}&order=person_id`);
const adults = dir.filter((p) => p.mok1 && /-\d+목장$/.test(p.mok3)).slice(0, 40);
if (!adults.length) throw new Error("개발 church_people 에 교구 분이 없다 — tools/people/fake_people.py 로 가짜 명부부터");
const TEAMS = [["찬양부", "ca-demo 찬양대"], ["전도부", "ca-demo 전도대"], ["교육위원회", "ca-demo 유년부"]];
const recs = [];
for (const [yi, year] of [2024, 2025, 2026].entries()) {
  adults.forEach((p, i) => {
    if ((i + yi) % 3 === 0) return;                                   // 해마다 조금씩 다른 분
    const n = Number(/-(\d+)목장$/.exec(p.mok3)[1]);
    const mok = i % 7 === 0 && year < 2026 ? `${p.mok1}-${n + 10}` : `${p.mok1}-${n}`;   // 옛 해엔 목장이 달랐던 분
    const [committee, team] = TEAMS[i % TEAMS.length];
    recs.push({ year, committee, team, name: p.name, position: p.position || "집사", mok, renewal: yi ? "유지" : "신규" });
  });
  for (const k of ["가", "나", "다"]) recs.push({ year, committee: "찬양부", team: "ca-demo 찬양대", name: `ca-demo-없는분${k}`, position: "집사", mok: "기쁨-1", renewal: "신규" });
}
const rows = recs.map((r) => ({ ...r, role_title: "", src_note: "", src_key: srcKey(r), source: "excel", source_file: "ca-demo-seed", link_how: "auto" }));
const ins = [];
for (let i = 0; i < rows.length; i += 500) ins.push(...(await rest("ministry_history", "POST", rows.slice(i, i + 500))));
const res = matchAll(ins.map((r) => ({ ...r, id: Number(r.id) })), dir.map(toHPerson));
const byId = new Map(ins.map((r) => [Number(r.id), r]));
// old_* — apply 는 읽었던 맞춤 상태 그대로인 줄에만 쓴다(SQL 005 · 2026-10-01 최종 검토)
const p = res.map((x) => { const r = byId.get(x.id);
  return { id: x.id, expect: r.updated_at, old_person_id: r.person_id ?? null, old_basis: r.match_basis ?? "", old_reason: r.match_reason ?? "",
    person_id: x.person_id, match_basis: x.match_basis, match_reason: x.match_reason }; });
const n = await rest("rpc/ministry_history_apply", "POST", { p });
console.log(`씨앗 ${ins.length}줄 · 교적 이어짐 ${res.filter((x) => x.person_id !== null).length} · 맞춤 쓴 줄 ${n}`);
