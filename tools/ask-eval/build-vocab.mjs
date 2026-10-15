// 🤖 성도 묻기 견주기 ② — 운영 「값 목록」(vocab.sql 결과 · 묶음 값과 수만) → buildAskData 의 vocab 꼴(askEval 에 실어 보낸다).
//   사람 줄은 지어낸 번호로 세운다(이름 없음). 결과 파일은 저장소 밖에 둔다(교구 · 목장 · 부서 이름 — 공개 저장소에 올리지 않는다).
//   node --experimental-strip-types tools/ask-eval/build-vocab.mjs <vocab.sql 결과 json> <내보낼 vocab.json>
import { readFileSync, writeFileSync } from "node:fs";
import { buildAskData } from "../../supabase/functions/church-admin/ask-people.ts";

const [rawPath, outPath] = process.argv.slice(2);
if (!rawPath || !outPath) throw new Error("쓰는 법: build-vocab.mjs <vocab.sql 결과 json> <내보낼 vocab.json>");
let raw = JSON.parse(readFileSync(rawPath, "utf8"));
if (Array.isArray(raw)) raw = raw[0];
if (raw.rows) raw = raw.rows[0];
const v = typeof raw.v === "string" ? JSON.parse(raw.v) : raw.v;
if (!(v.users > 400)) throw new Error(`users ${v.users} — 운영이 아니다(사백이 넘어야 운영)`);
const people = [];
let id = 1;
for (const p of v.p) for (let i = 0; i < p.n; i++) people.push({ person_id: id++, name: "", mok1: p.mok1, mok3: p.mok3, kind2: p.kind2 });
const hist = v.h.map((h, i) => ({ id: i + 1, person_id: h.linked ? 1 : -1, year: h.year, committee: h.committee, team: h.team }));
const pilsaRows = v.e.filter((e) => e.linked).map((e) => ({ person_id: 1, event_id: e.id }));
const d = buildAskData(people, hist, v.m, v.g, pilsaRows, v.e);
writeFileSync(outPath, JSON.stringify(d.vocab));
const vo = d.vocab;
console.log(`교인 ${d.people.length} · 교구 ${vo.gu.length} · 목장 ${vo.mokKeys.length} · 부서 이음 ${vo.rows.length} · 사역 ${vo.yearMin}~${vo.yearMax} · 성경필사 ${vo.pilsaMin}~${vo.pilsaMax}`);
