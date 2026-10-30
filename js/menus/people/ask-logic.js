// 🤖 성도 묻기 — 직분 · 교구 고르기 칸의 순수 도우미(2026-10-19 · 설계 성경암송 docs/superpowers/specs/2026-10-19-ask-people-picks-design.md)
//   시험 tests/ask-picks-ui.test.mjs. DOM 을 쓰지 않는다.

// 고른 잎의 from_text — ⚠️ 서버 supabase/functions/church-admin/ask-people.ts 의 PICK_FROM 과 글자까지 같게(시험이 본다).
//   칩 × 로 고른 조건을 빼면 화면이 이 글로 알아보고 그 고르기 칸을 비운다(보이는 것 = 걸린 것).
export const PICK_FROM = { pos: "고른 직분", gu: "고른 교구", reg: "고른 등록년도", age: "고른 연령대" };

// 서버 askPeopleOptions 의 직분 묶음 차례(서버 PICK_GROUPS 넷 + 「그 밖」)
export const POS_TREE_GROUPS = ["장로", "안수집사", "권사", "집사", "그 밖"];
const TOKEN_GROUPS = ["장로", "안수집사", "권사", "집사"];   // 「X 전체」 값을 서버가 아는 묶음
export const VIRTUAL_PREFIX = "@";                           // 화면에만 있는 위 단계(「@그 밖」) — 서버로 보내지 않는다
const hintOf = (n) => `${Number(n || 0).toLocaleString("ko-KR")}명`;

// 서버 목록 → 고르개 줄. 세부에 group 이 있으면 단계로(위: 큰 묶음 · 아래: 세부), 없으면(옛 서버) 지금처럼 한 줄씩.
//   위 단계 값: 장로·안수집사·권사·집사는 「X 전체」(서버가 아는 값) · 「그 밖」은 「@그 밖」(화면에만).
export function posPickOptions(positions) {
  const list = Array.isArray(positions) ? positions : [];
  const groups = list.filter((o) => o.kind === "group"), details = list.filter((o) => o.kind === "detail");
  if (!details.length || details.some((o) => typeof o.group !== "string"))
    return list.map((o) => ({ value: o.value, label: o.label ?? o.value, hint: hintOf(o.count) }));
  const out = [];
  for (const g of POS_TREE_GROUPS) {
    const kids = details.filter((o) => o.group === g);
    const ge = groups.find((o) => o.group === g || o.value === `${g} 전체`);
    if (!kids.length) { if (ge) out.push({ value: ge.value, label: ge.label ?? ge.value, hint: hintOf(ge.count) }); continue; }
    const value = TOKEN_GROUPS.includes(g) ? `${g} 전체` : VIRTUAL_PREFIX + g;
    out.push({ value, label: g, hint: hintOf(ge ? ge.count : kids.reduce((s, k) => s + Number(k.count || 0), 0)) });
    for (const k of kids) out.push({ value: k.value, label: k.label ?? k.value, hint: hintOf(k.count), parent: value });
  }
  for (const o of details.filter((d) => !POS_TREE_GROUPS.includes(d.group)))
    out.push({ value: o.value, label: o.label ?? o.value, hint: hintOf(o.count) });
  return out;
}

// 🗓️ 등록년도 · 🎂 연령대(2026-10-30) — 서버 목록(등록년도는 최근 해부터 · 「2019년 이전」 끝 / 연령대는 어린 쪽부터)을
//   차례 그대로 한 단계 고르개 줄로. 옛 서버(그 칸 없음)면 빈 목록 — 화면이 그 단추를 잠근다.
export function flatPickOptions(list) {
  return (Array.isArray(list) ? list : []).map((o) => ({ value: o.value, label: o.label ?? o.value, hint: hintOf(o.count) }));
}

// 고른 값 → { send: 서버로 보낼 값, show: 단추에 보일 이름 }.
//   다 고른 위 단계는 하나로 접는다 — 「X 전체」는 그 값을 보내고, 「@그 밖」은 아래 세부를 보낸다(보일 때는 둘 다 「… 전체」).
//   일부만 고른 위 단계는 고른 세부만. 목록에 없는 값은 버린다. 목록 줄을 다 고르면 조건이 없는 것과 같아 send [] · show ["모두"].
export function pickedView(values, options) {
  const opts = Array.isArray(options) ? options : [];
  const has = new Set((values || []).map(String));
  const picked = (o) => has.has(String(o.value));
  if (!opts.some(picked)) return { send: [], show: [] };
  if (opts.every(picked)) return { send: [], show: ["모두"] };
  const send = [], show = [];
  for (const o of opts) {
    if (o.parent != null) continue;
    const kids = opts.filter((k) => k.parent != null && String(k.parent) === String(o.value));
    if (!kids.length) {
      if (picked(o)) { send.push(o.value); show.push(o.label ?? o.value); }
      continue;
    }
    const got = kids.filter(picked);
    if (!got.length) continue;
    if (got.length === kids.length) {
      show.push(`${o.label ?? o.value} 전체`);
      if (String(o.value).startsWith(VIRTUAL_PREFIX)) send.push(...kids.map((k) => k.value)); else send.push(o.value);
    } else {
      send.push(...got.map((k) => k.value));
      show.push(...got.map((k) => k.label ?? k.value));
    }
  }
  return { send, show };
}
export const picksToSend = (values, options) => pickedView(values, options).send;
// 단추 글 — 안 고름 「전체」 · 하나 「시무장로」/「장로 전체」 · 여럿 「장로 전체 외 2」 · 모두 「모두」
export function pickSummary(values, options) {
  const { show } = pickedView(values, options);
  if (!show.length) return "전체";
  if (show.length === 1 && show[0] === "모두") return "모두";
  return show.length === 1 ? show[0] : `${show[0]} 외 ${show.length - 1}`;
}
