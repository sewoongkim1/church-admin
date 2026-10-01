// 사역 이력 대조의 Node 쪽 — check_real.py 가 임시 폴더(people.json·rows.json)를 넘긴다. 수와 줄 번호만 찍는다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { matchAll } from "../../supabase/functions/church-admin/history-match.ts";

const dir = process.argv[2];
const people = JSON.parse(readFileSync(path.join(dir, "people.json"), "utf8"));
const rows = JSON.parse(readFileSync(path.join(dir, "rows.json"), "utf8"));
const res = matchAll(rows, people);
const by = new Map(res.map((r) => [r.id, r]));
const pid = (n) => by.get(n)?.person_id ?? null;

const got = res.filter((r) => r.person_id !== null).length;
console.log(`줄 ${rows.length} · 교적 이어짐 ${got} · 못 맞춤 ${rows.length - got}   (2026-09-29 명부 기대값: 4,042 · 51)`);
const cnt = new Map();
for (const r of res) {
  const k = (r.person_id !== null ? "✓ " + r.match_basis : "— " + r.match_reason).replace(/\d+명/, "N명");
  cnt.set(k, (cnt.get(k) ?? 0) + 1);
}
for (const [k, v] of [...cnt.entries()].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k);

// 2026-10-01 독립 검증이 짚은 줄(통합 엑셀 2022-2026_사역임명_통합.xlsx 의 줄 번호) — 통합 엑셀이 아니면 건너뛴다
if (rows.length === 4093) {
  const expect = [];
  const same = (l, a, b) => expect.push([l, pid(a) !== null && pid(a) === pid(b)]);
  const blank = (l, n) => expect.push([l, pid(n) === null]);
  const filled = (l, n) => expect.push([l, pid(n) !== null]);
  blank("2032 권사→남자 — 비움", 2032);
  for (const n of [3801, 3802, 3803]) expect.push([`${n} 약한 근거로만(사람 확인)`, pid(n) === null || /같은 교구|이름이 한 분/.test(by.get(n).match_basis)]);
  same("981 → 2807 의 분", 981, 2807); same("1755 → 2807 의 분", 1755, 2807);
  for (const n of [1181, 1182, 1183, 1815]) same(`${n} → 2881 의 분`, n, 2881);
  blank("490 안수집사→직분 없는 36세 — 비움", 490);
  same("2365 고등부 → 3324 의 분", 2365, 3324);
  for (const n of [1296, 1297, 1298, 1299, 1300, 1301, 2112, 567, 3385]) filled(`${n} 같은 해 목장 차이 — 되살림`, n);
  for (const n of [3219, 3252, 3325]) filled(`${n} 또래`, n);
  for (const n of [436, 1086, 1087, 1491, 2052, 2053, 2460]) same(`${n} → 3436 의 분`, n, 3436);
  for (const n of [298, 277, 282, 835, 1654, 3965, 3966]) filled(`${n} 다른 해 이음`, n);
  for (const n of [95, 216, 274, 389, 456, 458, 613, 876, 942, 943, 2092, 2159]) filled(`${n} 오타`, n);
  for (const n of [121, 1687, 1688, 2708, 204, 205, 587, 2782, 3832, 3833]) filled(`${n} 가족`, n);
  for (const n of [403, 259, 792, 2153]) blank(`${n} 비워 둠`, n);
  const bad = expect.filter(([, ok]) => !ok);
  console.log(`검증 지적 ${expect.length}줄 중 기대대로 ${expect.length - bad.length}`);
  for (const [l] of bad) console.log("  ✗", l);
  process.exitCode = bad.length ? 1 : 0;
}
