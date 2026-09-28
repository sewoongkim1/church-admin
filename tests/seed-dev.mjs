// 개발 DB 에 화면 확인용 「승인 대기」 담당자 셋을 넣는다/지운다. 개발 전용.
//   set -a; . ~/.church-admin/dev.env; set +a
//   node tests/seed-dev.mjs          # 넣기(셋 중 하나는 개발의 기존 사역 담당자 「사랑 1목장 사역담당시험」과 같은 분)
//   node tests/seed-dev.mjs --clean  # ca-seed-·ca-test- 로 시작하는 시험 사용자를 모두 지운다
const URL_ = process.env.DEV_URL, SERVICE = process.env.DEV_SERVICE_KEY;
if (!URL_ || !URL_.includes("ktpwthwqzgcqcrmsafdo")) throw new Error("개발 프로젝트에만 돌린다");
const svc = { apikey: SERVICE, "Content-Type": "application/json",
  ...(SERVICE.startsWith("sb_secret_") ? {} : { Authorization: "Bearer " + SERVICE }) };

async function listTestUsers() {
  const r = await (await fetch(URL_ + "/auth/v1/admin/users?per_page=1000", { headers: svc })).json();
  return (r.users ?? []).filter((u) => /^ca-(seed|test)-/.test(u.email ?? ""));
}

if (process.argv.includes("--clean")) {
  const us = await listTestUsers();
  for (const u of us) await fetch(URL_ + "/auth/v1/admin/users/" + u.id, { method: "DELETE", headers: svc });
  console.log(`지웠다: ${us.length}명`);
} else {
  const seeds = [
    { name: "사역담당시험", gu: "사랑", mok: "1목장", kakao_nickname: "기존담당" },
    { name: "새담당시험", gu: "화평", mok: "20", kakao_nickname: "행복한하루" },
    { type: "교회학교", name: "교사시험", bu: "중등부", grade: "3학년", kakao_nickname: "" },
  ];
  for (const [i, s] of seeds.entries()) {
    const email = `ca-seed-${i}-${Date.now()}@example.test`;
    const u = await (await fetch(URL_ + "/auth/v1/admin/users", { method: "POST", headers: svc,
      body: JSON.stringify({ email, password: "S" + Date.now() + "!x", email_confirm: true }) })).json();
    const r = await fetch(URL_ + "/rest/v1/admin_members", { method: "POST", headers: svc,
      body: JSON.stringify({ type: "교구", ...s, auth_user_id: u.id, status: "pending" }) });
    console.log(s.name, r.status);
  }
}
