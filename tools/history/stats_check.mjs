// 📊 사역 통계 — 진짜 자료 대조의 Node 쪽(이 PC 에서만 · tools/history/stats_check.py 가 부른다).
//   node --experimental-strip-types tools/history/stats_check.mjs <재료 json>  →  buildStats 결과에서 흐름 칸만 json 으로 찍는다(수만).
import { readFileSync } from "node:fs";
import { buildStats } from "../../supabase/functions/church-admin/ministry-stats.ts";

const facts = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out = buildStats(facts);
const KEYS = ["year", "seats", "people", "multi", "gap", "prev", "base", "stay", "back", "first", "firstEver", "firstOther", "left", "moved", "rest", "gone", "keep"];
const units = {};
for (const [u, v] of Object.entries(out.units)) units[u] = { group: v.group, rows: v.rows.map((r) => KEYS.map((k) => r[k])) };
process.stdout.write(JSON.stringify({ years: out.years, keys: KEYS, units, inner: Object.keys(out.inner).sort(), meta: out.meta }));
