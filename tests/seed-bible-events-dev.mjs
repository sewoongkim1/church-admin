// 개발 DB 에 성경필사(암송) 화면 확인용 회차 셋과 앱 사용자 셋을 넣는다/지운다. 개발 전용(계획 Task 14).
//   set -a; . ~/.church-admin/dev.env; set +a
//   node --experimental-strip-types tests/seed-bible-events-dev.mjs          # 넣기(ca-demo- 가 있으면 지우고 다시)
//   node --experimental-strip-types tests/seed-bible-events-dev.mjs --clean  # 지우기만
// ⚠️ 진짜 이름을 넣지 않는다(공개 저장소) — 회차 명단의 이름은 아래 음절 표로 지어내고, 찾기·채우기에 쓸 이름은
//    개발 DB 의 **가짜** 교인명부(tools/people/fake_people.py)에서 그때그때 고른다(파일에 적지 않는다).
// ⚠️ 회차 id 는 ca-demo- — 개발 서버 시험(server.dev)의 before()·after() 는 ca-test- 만 지우므로 서로 안 건드린다.
// ⚠️ 표(events·event_signups·users)는 성경암송 앱의 것이다 — 칸을 바꾸지 않고 줄만 넣고 뺀다.
// ⚠️ 이름에 .test. 가 없어 preflight(배포 전 점검)는 이 파일을 돌리지 않는다 — 개발 DB 가 있어야 돈다.
import { appIdentityKey } from "../supabase/functions/church-admin/paper.ts";

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

const GU = ["믿음", "소망", "사랑", "섬김", "은혜", "화평", "기쁨", "새가족"];
const GU7 = GU.slice(0, 7);       // 교인명부 → 줄 옮겨 적기 규칙 2 의 일곱 교구(새가족은 교구로 옮기지 않는다)
const FAMILY = ["가", "나", "다", "라", "마", "바", "사", "아", "자", "차"];   // 가짜 명부의 성씨와 겹치지 않는 글자
const GIVEN = ["하늘", "바다", "들꽃", "새벽", "나무", "구름", "햇살", "별빛", "시내", "언덕", "노을"];
const NAMES = FAMILY.flatMap((f) => GIVEN.map((g) => f + g));   // 110 가지 — 지어낸 이름
const POS = ["성도", "집사", "권사", "안수집사", "장로", "명예권사", ""];
const DEMO_USER = "데모앱성도";
const NEEDS = { position: true, phone: false, memo: false, extra: [] };
const BIG = "ca-demo-big", SMALL = "ca-demo-small", EL = "ca-demo-el";
const now = () => new Date().toISOString();

// 줄 하나 — ident_key 는 앱 로그인과 같은 식(appIdentityKey · NFC 안 함 · events-rules.ts identKey 와 같은 칸 배치)
function row(eventId, who, group, sub, name, position, extra = {}) {
  const isGu = who === "교구";
  const key = appIdentityKey({ type: who, gu: isGu ? group : "", mok: isGu ? sub : "",
    bu: isGu ? "" : group, grade: isGu ? "" : sub, name });
  return { event_id: eventId, user_id: null, ident_key: key, who_type: who, group_name: group, sub_name: sub,
    name, position, phone: "", memo: "", answers: {}, note: "", source: "import", updated_at: now(), ...extra };
}
// 앱에서 낸 줄 — 앱은 users 값을 그대로 적는다(목장 「07」도 그대로)
const app = (eventId, u, position, extra = {}) =>
  ({ ...row(eventId, "교구", u.gu, u.mok, u.name, position), user_id: u.id, ident_key: u.identity_key, source: "app", ...extra });
// 가짜 명부 목장(「화평-03목장」) → 줄의 목장 숫자(「3」) — 옮겨 적기 규칙 2
function mokNum(mok3) {
  const s = String(mok3 || "");
  if (s.includes("남성")) return "남성";
  const m = /(\d+)(?:목장)?$/.exec(s);
  return m ? String(Number(m[1])) : "";
}

async function clean() {
  const ev = await rest("events?select=id&id=like.ca-demo-*");
  if (ev.length) await rest("events?id=like.ca-demo-*", "DELETE");            // 줄은 CASCADE
  const us = await rest(`users?select=id&name=like.${encodeURIComponent(DEMO_USER + "*")}`);
  if (us.length) await rest(`users?name=like.${encodeURIComponent(DEMO_USER + "*")}`, "DELETE");
  console.log(`지웠다: 회차 ${ev.length} · 앱 사용자 ${us.length}`);
}

async function insertRows(rows) {
  for (let i = 0; i < rows.length; i += 500) await rest("event_signups", "POST", rows.slice(i, i + 500));
}

async function allPeople() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const page = await rest(`church_people?select=name,name_key,kind2,mok1,mok3,school_dept,position&order=person_id&offset=${from}&limit=1000`);
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

if (process.argv.includes("--clean")) { await clean(); process.exit(0); }

// ① 찾기·채우기에 쓸 이름을 가짜 명부에서 **먼저** 고른다 — 모자라면 아무것도 넣지 않고 멈춘다
const by = new Map();
for (const p of await allPeople()) by.set(p.name_key, [...(by.get(p.name_key) || []), p]);
const lists = [...by.values()];
const isKid = (p) => ["교회학교", "학생"].includes(p.kind2);
const adults = lists.filter((l) => l.length === 1 && !isKid(l[0]) && GU7.includes(l[0].mok1) && /\d/.test(l[0].mok3) && l[0].position)
  .map((l) => l[0]);
const [pA, pB, pC, pD] = adults;   // A·B: 올리기 빈칸 채우기 · C: 교적 「맞음」 줄 · D: 「＋ 한 분 더하기」 찾기
const two = lists.find((l) => l.length >= 2);                                        // 동명이인
const kid = (lists.find((l) => l.length === 1 && isKid(l[0]) && l[0].school_dept) || [])[0];
if (!pD || !two || !kid) {
  throw new Error("개발 가짜 명부에서 이름을 다 고르지 못했다 — 교회 어드민 CLAUDE.md 「교인명부」 절대로 가짜 명부(tools/people/fake_people.py)를 다시 넣을 것");
}
const otherGu = GU7.find((g) => g !== pA.mok1);

await clean();

// ② 앱 사용자 셋 — 가: 앱 줄 · 나: 한 분 더하기로 「잇기」 · 다: 목장 「07」(「7」로 더하면 이미 있음)
const users = [];
for (const [gu, mok, suffix] of [["화평", "20", "가"], ["화평", "21", "나"], ["소망", "07", "다"]]) {
  const name = DEMO_USER + suffix;
  const [u] = await rest("users", "POST", { type: "교구", gu, mok, name,
    identity_key: appIdentityKey({ type: "교구", gu, mok, bu: "", grade: "", name }) });
  users.push(u);
}
const [U1, , U3] = users;

// ③ 회차 셋 — 모두 성도님께 안 보이는 상태로 시작(준비 중이거나 공개 종료일이 지남)
await rest("events", "POST", [
  { id: BIG, title: "화면 확인 — 큰 회차(1,100줄)", short_title: "큰 회차", subtitle: "", season: "2025-3Q",
    kind: "signup", status: "closed", opens_on: "2025-06-01", closes_on: "2025-08-31", list_until: "2025-08-31",
    needs: NEEDS, updated_at: now() },
  { id: SMALL, title: "화면 확인 — 작은 회차(준비 중)", short_title: "작은 회차", subtitle: "고치기·빼기·공개 확인",
    season: "2026-1Q", kind: "signup", status: "draft", opens_on: "2026-01-01", closes_on: "2026-01-31", list_until: null,
    needs: NEEDS, updated_at: now() },
  { id: EL, title: "화면 확인 — 자격 회차", short_title: "자격 회차", subtitle: "더하기·올리기가 막혀야 한다",
    season: "2026-4Q", kind: "signup", status: "draft", opens_on: "2026-10-27", closes_on: "2026-11-28", list_until: "2026-12-13",
    needs: { ...NEEDS, eligibility: { start: "2026-10-11", weeks: 6, perWeek: 3, need: 3, minNeed: 2 } }, updated_at: now() },
]);

// ④ 큰 회차 1,100줄 — 이름 110 × 소속 10(교구 여덟 + 청년부 + 중등부 2) · 이름·소속이 겹치는 줄 없음
const big = Array.from({ length: 1100 }, (_, i) => {
  const name = NAMES[i % 110], k = Math.floor(i / 110);
  if (k < 8) return row(BIG, "교구", GU[k], String((i % 30) + 1), name, POS[i % POS.length]);
  return k === 8 ? row(BIG, "교회학교", "청년부", "", name, "청년")
                 : row(BIG, "교회학교", "중등부", "2", name, "학생");
});
await insertRows(big);
const rep = big.find((r) => r.name === "사햇살" && r.group_name === "사랑");   // 세 회차에 모두 넣을 분(「여러 번 참여」)

// ⑤ 작은 회차 — 고치기·빼기·중복 표시·목록 밖 직분·교적 표시·앱 줄(메모·전화가 화면에 나오면 안 된다)
const small = [
  row(SMALL, "교구", "화평", "20", "가하늘", "집사", { note: "담당자가 더함" }),
  row(SMALL, "교구", "화평", "7", "나바다", "권사", { note: "원래: 화평 30 · 집사" }),
  row(SMALL, "교구", "화평", "7", "나바다", "권사"),                              // 「중복일 수 있음」
  row(SMALL, "교구", "소망", "남성", "다들꽃", "안수집사"),
  row(SMALL, "교회학교", "청년부", "", "라새벽", "청년"),
  row(SMALL, "교회학교", "중등부", "2", "마나무", "학생"),
  row(SMALL, "교구", "믿음", "3", "바구름", "은퇴안수집사"),                      // 목록 밖 직분(경고만)
  row(SMALL, "교구", "사랑", rep.sub_name, "사햇살", "집사"),                     // 세 회차에 모두 — 「여러 번 참여」
  row(SMALL, "교구", pC.mok1, mokNum(pC.mok3), pC.name, pC.position),             // 교적 「맞음」
  row(SMALL, "교구", "기쁨", "1", two[0].name, ""),                               // 교적 「확인 필요」(같은 이름 여럿)
  app(SMALL, U1, "권사", { phone: "010-0000-0000", memo: "성도 한 줄 — 담당자 화면에 나오면 안 됨" }),
  app(SMALL, U3, "성도"),                                                         // 목장 「07」
];
await insertRows(small);

// ⑥ 자격 회차 — 앱 줄 하나(answers 는 화면에 나오면 안 된다) · 이관 줄 하나(사햇살 — 세 번째 회차)
await insertRows([
  app(EL, U1, "권사", { answers: { weeks: [3, 3, 3, 0, 0, 0] } }),
  row(EL, "교구", "사랑", rep.sub_name, "사햇살", "집사", { note: "명단 올리기" }),
]);
console.log(`넣었다: 회차 3 · 줄 ${big.length} + ${small.length} + 2 · 앱 사용자 ${users.length}`);
console.log(`여러 번 참여 확인용: 사햇살 · 사랑 ${rep.sub_name}목장 — 세 회차에 모두`);
console.log(`가짜 명부에서 고른 이름 — A: ${pA.name} · B: ${pB.name} · C(교적 맞음 줄): ${pC.name} · D(한 분 더하기): ${pD.name}` +
  ` · 동명이인(${two.length}분): ${two[0].name} · 아이: ${kid.name}`);

// ⑦ 📤 명단 올리기에 붙여 넣을 글(칸: 이름·교구·목장·직분 · 탭) — 다듬기·판정 규칙을 한 번씩 다 밟는다
const paste = [
  ["성명", "교구", "목장", "직분"],              // 제목 줄 — 건너뛴다
  ["홍길동", "화평교구", "20목장", "집사님"],     // 화평 20 · 집사
  ["홍길순", "소망", "07", "권사"],               // 소망 7(앞 0 뗌)
  ["홍길남", "사랑", "남성목장", "안수집사"],     // 사랑 남성
  ["홍길서", "교회학교", "유년", ""],             // 교회학교 유년부
  ["홍길북", "청년", "청년", "청년"],             // 교회학교 청년부 · 직분 「청년」 그대로(「청년부」가 되면 틀림)
  ["홍길동2", "믿음", "3", "성도"],               // 이름 끝 숫자를 떼고 알림 → 홍길동 믿음 3
  ["홍길중", "화평", "5", "권사님"],              // 권사
  ["홍길(동", "화평", "3", ""],                   // 모양 틀림(bad-char)
  ["홍길돌", "평화", "3", ""],                    // 모양 틀림(bad-group)
  [pA.name, "", "", ""],                          // 빈칸 → 채우기 켜면 교인명부로 채움(교구·목장·직분)
  [pB.name, "", "99", ""],                        // 빈칸 → 채우기 켜면 교인명부 교구·목장(적힌 99 는 버린다는 알림)
  [pA.name, otherGu, "3", ""],                    // 소속이 명부와 달라 채우지 않음 → 넣음(직분 빈칸)
  [two[0].name, "", "", ""],                      // 빈칸 → 채우기 켜면 동명이인(넣지 않음)
  [two[0].name, "화평", "3", ""],                 // 소속이 적혀 있어 동명이인이어도 넣음(직분 빈칸)
  [kid.name, "화평", "3", ""],                    // 교구 줄인데 명부는 아이 → 채우지 않음 → 넣음(직분 빈칸)
  ["가하늘", "화평", "20", "집사"],               // ca-demo-small 에 이미 있음
  ["나바다", "화평", "7", "권사"],                // 이미 있음
].map((c) => c.join("\t")).join("\n");
console.log("----- 📤 붙여 넣을 글(아래 줄부터 끝까지) -----\n" + paste);
