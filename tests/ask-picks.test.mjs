// 🤖 성도 묻기 — 직분 · 교구 고르기 칸(2026-10-19 · 설계 성경암송 docs/superpowers/specs/2026-10-19-ask-people-picks-design.md)
//   서버 규약(supabase/functions/church-admin/ask-people.ts)의 순수 함수. 이름은 모두 지어낸 것(시험-가 …). DB 없이 돈다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  askOptions, askPicks, askSchema, askSystemPrompt, buildAskData, checkTree, describeLeaf, picksToLeaves, posDetailOf,
  runTree, statusOf, withPicks, ASK_MAX_LEAVES, PICK_FROM, PICK_MAX,
} from "../supabase/functions/church-admin/ask-people.ts";

const TODAY = "2026-10-19";
const Y = 2026;
// 교인 일곱 — 세부 직분이 고루 섞이게
const P = (id, name, position, position_detail, mok1) =>
  ({ person_id: id, name, position, position_detail, gender: "남", age: 50, mok1, mok3: `${mok1}-1목장`, kind2: "장년", registered_date: "2001-01-01" });
const PEOPLE = [
  P(1, "시험-가", "장로", "시무장로", "믿음"),
  P(2, "시험-나", "장로", "은퇴장로", "화평"),
  P(3, "시험-다", "안수집사", "시무안수집사", "기쁨"),
  P(4, "시험-라", "권사", "", "화평"),
  P(5, "시험-마", "", "", "임시교구"),
  P(6, "시험-바", "장로", "시무장로", "화평"),
  P(7, "시험-사", "-", "", "믿음"),
];
const D = buildAskData(PEOPLE, [], [], [], [], []);
const names = (raw) => runTree(checkTree(raw, D.vocab, Y).tree, D).map((p) => p.name).sort();
const pick = (list) => ({ field: "pos_pick", op: "in", list, from_text: PICK_FROM.pos });

test("세부 직분 — 직분상세 · 비면 직분 · 둘 다 비거나 「-」면 「직분 없음」 · 앞뒤 빈칸 다듬기", () => {
  assert.equal(posDetailOf("장로", "시무장로"), "시무장로");
  assert.equal(posDetailOf("권사", ""), "권사");
  assert.equal(posDetailOf("", ""), "직분 없음");
  assert.equal(posDetailOf("-", ""), "직분 없음");
  assert.equal(posDetailOf("집사", " 서리집사 "), "서리집사");
  assert.equal(D.people.find((p) => p.id === 4).posDetail, "권사");
  assert.equal(D.people.find((p) => p.id === 7).posDetail, "직분 없음");
  assert.ok(D.vocab.posDetail.includes("시무장로") && D.vocab.posDetail.includes("직분 없음"));
});

test("pos_pick — 「장로 전체」= 큰 묶음 · 세부 값 · 같은 칸은 「또는」 · 큰 묶음과 세부 섞기", () => {
  assert.deepEqual(names({ all: [pick(["장로 전체"])] }), ["시험-가", "시험-나", "시험-바"]);
  assert.deepEqual(names({ all: [pick(["시무장로", "시무안수집사"])] }), ["시험-가", "시험-다", "시험-바"]);
  assert.deepEqual(names({ all: [pick(["장로 전체", "권사"])] }), ["시험-가", "시험-나", "시험-라", "시험-바"]);
  assert.deepEqual(names({ all: [pick(["직분 없음"])] }), ["시험-마", "시험-사"]);
});

test("pos_pick — 목록 밖 값은 알리고 뺀다 · 모두 목록 밖이면 unsupported(no_data)", () => {
  const c = checkTree({ all: [pick(["시무장로", "없는직분"])] }, D.vocab, Y);
  assert.deepEqual(c.tree.all[0].list, ["시무장로"]);
  assert.ok(c.notices.some((x) => x.includes("없는직분")));
  const bad = checkTree({ all: [pick(["없는직분"])] }, D.vocab, Y);
  assert.equal(bad.tree.all.length, 0);
  assert.equal(bad.unsupported[0].kind, "no_data");
  assert.equal(statusOf(bad), "none");
});

test("고르기 → 잎 — 직분 · 교구 · 빈 칸은 잎 없음 · 직분 칸과 교구 칸은 「그리고」", () => {
  assert.deepEqual(picksToLeaves({ pos: [], gu: [] }), []);
  const leaves = picksToLeaves({ pos: ["시무장로"], gu: ["화평"] });
  assert.deepEqual(leaves.map((l) => [l.field, l.from_text]), [["pos_pick", PICK_FROM.pos], ["gu", PICK_FROM.gu]]);
  assert.deepEqual(names(withPicks({}, leaves)), ["시험-바"]);
});

test("AI 트리 + 고른 잎 — 고른 잎이 「그리고」 맨 앞 · 잎 상한에서 고른 잎이 남는다", () => {
  const ai = { all: Array.from({ length: ASK_MAX_LEAVES }, () => ({ field: "age", op: ">=", num: 1, from_text: "나이" })), any: [], none: [] };
  const c = checkTree(withPicks(ai, picksToLeaves({ pos: ["장로 전체"], gu: ["화평"] })), D.vocab, Y);
  assert.equal(c.tree.all.length, ASK_MAX_LEAVES);
  assert.deepEqual(c.tree.all.slice(0, 2).map((l) => l.field), ["pos_pick", "gu"]);
  assert.equal(c.unsupported.filter((u) => u.kind === "too_complex").length, 2);
});

test("askPicks — 문자열만 · 빈 것 빼고 · 겹친 것 하나로 · 칸마다 PICK_MAX 개까지", () => {
  assert.deepEqual(askPicks({ pos: ["시무장로", "시무장로", 3, "", null, "권사"], gu: "화평" }), { pos: ["시무장로", "권사"], gu: [], cut: 0 });
  assert.deepEqual(askPicks(null), { pos: [], gu: [], cut: 0 });
});

test("칩 글 — 고른 직분", () => {
  const c = checkTree({ all: [pick(["장로 전체", "시무안수집사"])] }, D.vocab, Y);
  assert.equal(describeLeaf(c.tree.all[0]), "직분 장로 전체·시무안수집사");
});

test("고르기 목록 — 큰 묶음(사람 있는 것만) → 세부(큰 묶음 차례 · 많은 순 · 「직분 없음」 끝) · 교구는 BE_GU 차례 → 그 밖", () => {
  const o = askOptions(D);
  assert.equal(o.people, 7);
  assert.deepEqual(o.positions.map((x) => [x.value, x.count, x.kind, x.group]), [
    ["장로 전체", 3, "group", "장로"], ["안수집사 전체", 1, "group", "안수집사"], ["권사 전체", 1, "group", "권사"],
    ["시무장로", 2, "detail", "장로"], ["은퇴장로", 1, "detail", "장로"], ["시무안수집사", 1, "detail", "안수집사"], ["권사", 1, "detail", "권사"], ["직분 없음", 2, "detail", ""],
  ]);
  assert.deepEqual(o.gu, [{ value: "믿음", count: 2 }, { value: "화평", count: 3 }, { value: "기쁨", count: 1 }, { value: "임시교구", count: 1 }]);
  for (const x of o.positions) assert.deepEqual(Object.keys(x).sort(), ["count", "group", "kind", "label", "value"]);
});

test("AI 에게 가는 것은 그대로 — 스키마 field 값에 pos_pick 없음 · 지시문에 pos_pick · 세부 직분 값 없음", () => {
  const fields = askSchema().properties.all.items.properties.field.enum;
  assert.ok(!fields.includes("pos_pick"));
  const sys = askSystemPrompt(D.vocab, TODAY);
  for (const w of ["pos_pick", "시무장로", "은퇴장로", "시무안수집사", PICK_FROM.pos, PICK_FROM.gu]) assert.ok(!sys.includes(w), w);
});

test("askPicks — 상한 PICK_MAX(200) 넘으면 앞에서 자르고 cut 에 센다 · 작으면 cut 0 · 40자 넘는 값은 40자로", () => {
  assert.equal(PICK_MAX, 200);
  const r = askPicks({ pos: Array.from({ length: PICK_MAX + 5 }, (_, i) => `직분${i}`), gu: ["화평"] });
  assert.equal(r.pos.length, PICK_MAX);
  assert.equal(r.cut, 5);
  assert.equal(r.pos[0], "직분0");
  assert.equal(askPicks({ pos: ["시무장로"] }).cut, 0);
  assert.equal(askPicks({ pos: ["가".repeat(50)] }).pos[0].length, 40);
});

test("집사 큰 묶음 — 「집사 전체」가 목록에 뜨고 세부(서리집사) 사람이 걸린다", () => {
  const D2 = buildAskData([P(1, "시험-가", "집사", "서리집사", "믿음"), P(2, "시험-나", "장로", "시무장로", "화평")], [], [], [], [], []);
  const o = askOptions(D2);
  assert.ok(o.positions.some((x) => x.value === "집사 전체" && x.kind === "group" && x.count === 1));
  const n = runTree(checkTree({ all: [pick(["집사 전체"])] }, D2.vocab, Y).tree, D2).map((p) => p.name);
  assert.deepEqual(n, ["시험-가"]);
});

test("띄어쓰기만 다른 세부 직분 — 정확히 같은 값이 먼저 맞는다", () => {
  const D3 = buildAskData([P(1, "시험-가", "장로", "시무장로", "믿음"), P(2, "시험-나", "장로", "시무 장로", "화평")], [], [], [], [], []);
  const nm = (v) => runTree(checkTree({ all: [pick([v])] }, D3.vocab, Y).tree, D3).map((p) => p.name);
  assert.deepEqual(nm("시무 장로"), ["시험-나"]);
  assert.deepEqual(nm("시무장로"), ["시험-가"]);
});
