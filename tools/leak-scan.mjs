// 공개 저장소에 교인 명단이 들어가지 않게 — preflight 가 부른다(node tools/leak-scan.mjs · 2026-09-29 교인명부).
// 한 번 커밋되면 지워도 기록에 남는다. 이름 규칙(.gitignore)을 피해 들어온 파일까지 여기서 잡는다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const PHONE_RE = /01[016-9]-?\d{3,4}-?\d{4}/g;
export const PHONE_LIMIT = 20;                          // 서로 다른 휴대폰 번호가 이만큼이면 명단으로 본다
export const SHEET_OK = new Set(["files/사역명단_올리기_양식.xlsx"]);   // 빈 양식(이름·번호 없음)
const SHEET_EXT = /\.(xls|xlsx|csv)$/i;

export function findLeaks(files) {
  const out = [];
  for (const { path: p, text } of files) {
    if (SHEET_EXT.test(p) && !SHEET_OK.has(p)) { out.push(`${p} — 표 파일(명단일 수 있다)`); continue; }
    if (text == null) continue;
    const nums = new Set((text.match(PHONE_RE) || []).map((m) => m.replace(/\D/g, "")));
    if (nums.size >= PHONE_LIMIT) out.push(`${p} — 서로 다른 휴대폰 번호 ${nums.size}개`);
  }
  return out;
}

function readText(abs) {
  const buf = readFileSync(abs);
  return buf.includes(0) ? null : buf.toString("utf8");   // 0 바이트가 있으면 그림·압축 파일
}

// 직접 돌릴 때만(시험이 import 할 때는 안 돈다). 윈도는 드라이브 글자 대소문자가 섞여 들어와 소문자로 견준다 —
// 어긋나면 검사가 아예 안 돌고 「통과」로 보이는 사고가 난다.
const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const list = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString("utf8").split("\0").filter(Boolean);
  const leaks = findLeaks(list.map((p) => ({ path: p, text: readText(path.join(root, p)) })));
  if (leaks.length) { console.error(leaks.join("\n")); process.exit(1); }
  console.log(`명단 검사 통과 — 파일 ${list.length}개`);
}
