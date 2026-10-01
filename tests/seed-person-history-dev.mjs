// 개발 DB 에 「자세히」 창 사역·성경필사 탭 확인용 가짜 기록을 넣는다/지운다(2026-10-01 · 계획 Task 8). 개발 전용.
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types tests/seed-person-history-dev.mjs          # 넣기(있으면 지우고 다시)
//   node --experimental-strip-types tests/seed-person-history-dev.mjs --clean  # 지우기만
// ⚠️ 진짜 이름을 넣지 않는다 — 이름은 개발 DB 의 **가짜** 교인명부(tools/people/fake_people.py)에서 장년 동명이인을 그때그때 고른다.
// ⚠️ 신청 줄의 user_id 는 신청마다 만든 가짜 앱 계정(users · 이름 「ca-demo-hist-N」)의 uuid — 글자를 넣으면 안 된다:
//    칸은 text 라 들어가지만 신청 현황(ministryList)이 그 해 신청 줄 전부의 user_id 로 push_subscriptions(user_id uuid)를 물어
//    22P02 → 개발의 📋 신청 현황이 **모든 세션에서** 500 이 된다. 지울 때는 잇기 줄 → 신청 → users 차례.
// ⚠️ 회차는 ca-demo-hist1(closed)·hist2(archived) — 초안이면 탭에 안 나온다. seed-bible-events-dev 의 --clean(ca-demo-*)이
//    이 회차도 지운다(괜찮다 — 다시 넣으면 된다 · 그쪽은 users 를 「데모앱성도」 이름으로만 지워 이 계정은 안 건드린다).
// ⚠️ 잇기 줄은 넣지 않는다 — 신청 현황·회차 명단을 열거나 총괄 「기록 잇기 맞추기」를 누르면 서버가 잇는다(그것을 보려는 시드다).
// ⚠️ 이름에 .test. 가 없어 preflight 는 이 파일을 돌리지 않는다.
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
const UID = "ca-demo-hist-", EVS = ["ca-demo-hist1", "ca-demo-hist2"];
const GU7 = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨"];
const mokNum = (mok3) => (/(\d+)(?:목장)?$/.exec(String(mok3 || ""))?.[1] ?? "").replace(/^0+(?=\d)/, "");
const hasTable = async (t) => { try { await rest(`${t}?select=id&limit=1`); return true; } catch (e) { if (/PGRST205|42P01/.test(e.message)) return false; throw e; } };

async function clean() {
  const us = await rest(`users?select=id&name=like.${UID}*`);
  const os = us.length ? await rest(`ministry_orders?select=id&user_id=in.(${us.map((u) => u.id).join(",")})`) : [];
  const ss = await rest(`event_signups?select=id&event_id=in.(${EVS.join(",")})`);
  if (os.length) await rest(`people_links?kind=eq.order&row_id=in.(${os.map((r) => r.id).join(",")})`, "DELETE");
  if (ss.length) await rest(`people_links?kind=eq.signup&row_id=in.(${ss.map((r) => r.id).join(",")})`, "DELETE");
  if (os.length) await rest(`ministry_orders?id=in.(${os.map((r) => r.id).join(",")})`, "DELETE");
  if (us.length) await rest(`users?name=like.${UID}*`, "DELETE");                             // 신청 다음에 계정
  await rest(`events?id=in.(${EVS.join(",")})`, "DELETE");                                    // 줄은 CASCADE
  let mh = 0;
  if (await hasTable("ministry_history")) {
    mh = (await rest("ministry_history?select=id&src_key=like.ca-demo-hist*")).length;
    if (mh) await rest("ministry_history?src_key=like.ca-demo-hist*", "DELETE");
  }
  console.log(`지웠다: 신청 ${os.length} · 앱 계정 ${us.length} · 명단 ${ss.length} · 사역 이력 ${mh}`);
}

if (process.argv.includes("--clean")) { await clean(); process.exit(0); }
await clean();

const people = await rest("church_people?select=person_id,name,name_key,kind2,mok1,mok3,phone1&order=person_id&limit=1000");
const by = new Map();
for (const p of people) {
  if (p.kind2 !== "장년" || !GU7.includes(p.mok1) || !mokNum(p.mok3)) continue;
  if (!by.has(p.name_key)) by.set(p.name_key, []);
  by.get(p.name_key).push(p);
}
const pairs = [...by.values()].filter((l) => l.length >= 2 && l[0].mok1 !== l[1].mok1).slice(0, 3);
if (pairs.length < 2) throw new Error("가짜 명부에 교구가 다른 장년 동명이인이 둘 이상 있어야 한다 — fake_people.py(동명이인)를 개발에 넣었는지 볼 것");
const cfg = await rest("app_config?select=value&key=eq.ministry");
const year = Number(cfg[0]?.value?.year) || 2027;
const cat = await rest(`ministry_catalog?select=id,committee,team&year=eq.${year}&order=id&limit=6`);
const specs = [], signups = [], hist = [];
// ⚠️ 배치 insert 는 객체들의 칸이 모두 같아야 한다(PGRST102) — o()·s() 한 모양
const o = (y, p, gu, mok, phone, status, t) => ({ year: y, team_id: t.id, committee: t.committee, team: t.team,
  option: "", name: p.name, who: `${gu} ${mok}목장`, phone, status, source: "app", position: "집사",
  decided_at: status === "임명확정" ? `${y - 1}-12-27T00:00:00Z` : null });
const s = (ev, p, gu, mok) => ({ event_id: ev, user_id: null, source: "import", who_type: "교구", group_name: gu, sub_name: mok, name: p.name,
  ident_key: `교구|${gu}|${mok}|||${p.name}`, position: "집사", phone: "", memo: "", answers: {}, note: "명단 올리기" });
for (const [a, b] of pairs) {
  const other = GU7.find((g) => g !== a.mok1 && g !== b.mok1);
  specs.push(o(year, a, a.mok1, mokNum(a.mok3), null, "접수완료", cat[0]),            // 맞음 → a
    o(year - 1, a, a.mok1, mokNum(a.mok3), null, "임명확정", cat[1]),                 // 맞음 → a(지난 해)
    o(year - 2, b, b.mok1, mokNum(b.mok3), null, "임명확정", cat[2]),                 // 맞음 → b
    o(year, a, other, "9", a.phone1 || null, "신청완료", cat[3]),                      // 소속 다름 · 번호 → a(번호)
    o(year - 1, a, other, "8", null, "임명확정", cat[4]));                             // 못 맞춤 → 「아직 안 이어진 기록」
  signups.push(s(EVS[0], a, a.mok1, mokNum(a.mok3)), s(EVS[1], a, other, "8"));      // 맞음 → a · 못 맞춤
  hist.push({ year: 2024, committee: "교육위원회", team: "중등부", role_title: "교사", name: a.name, position: "집사",
    mok: `${a.mok1}-${mokNum(a.mok3)}`, person_id: a.person_id, link_how: "auto", match_basis: "같은 소속", source: "excel",
    src_key: `ca-demo-hist|${a.person_id}|2024` },
    { year: 2025, committee: "예배위원회", team: "안내팀", role_title: "", name: b.name, position: "집사",
    mok: `${other}-7`, person_id: null, link_how: "auto", match_basis: "", source: "excel",
    src_key: `ca-demo-hist|${b.person_id}|2025` });
}
// 신청마다 가짜 앱 계정 한 줄 — user_id 는 그 uuid(위 ⚠️ · 글자를 넣으면 신청 현황이 500)
const us = await rest("users", "POST", specs.map((_, i) => ({ type: "교구", gu: "시험", mok: "0", name: UID + (i + 1),
  identity_key: `교구|시험|0|||${UID}${i + 1}` })));
const uidOf = new Map(us.map((u) => [u.name, u.id]));
const orders = specs.map((x, i) => ({ ...x, user_id: uidOf.get(UID + (i + 1)) }));
await rest("ministry_orders", "POST", orders);
const ev = { short_title: "", subtitle: "화면 확인용", season: "", kind: "signup", list_until: null,
  needs: { position: true, phone: false, memo: false, extra: [] } };
await rest("events", "POST", [
  { ...ev, id: EVS[0], title: "2026 사순절 마가복음 성경필사 완서자", status: "closed", opens_on: "2026-03-01", closes_on: "2026-04-04" },
  { ...ev, id: EVS[1], title: "2025 썸머 써 바이블", status: "archived", opens_on: "2025-06-01", closes_on: "2025-08-31" },
]);
await rest("event_signups", "POST", signups);
const mh = await hasTable("ministry_history");
if (mh) await rest("ministry_history", "POST", hist);
console.log(`넣었다: 동명이인 ${pairs.length}쌍(${pairs.map((l) => l[0].name).join(", ")}) · 신청 ${orders.length}(앱 계정 ${us.length}) · 명단 ${signups.length}` +
  ` · 사역 이력 ${mh ? hist.length : "표 없음(b6 전)"} — 신청 현황·회차 명단을 열거나 총괄 「기록 잇기 맞추기」를 누르면 이어진다`);
