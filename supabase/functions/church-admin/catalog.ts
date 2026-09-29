// 사역팀 정보 순수 함수 — 꾸밈(HTML) 거르개·「② 언제」 필터 칸·「지금 섬기는 분」 명단 한 줄.
// 성경암송 api(supabase/functions/api/index.ts) 의 ministryCatalog/ministryCatalogSave 헬퍼를
// 글자 그대로 옮겨 왔다(2026-09-29 · 원문 docs/port/ministry-catalog-legacy.md 1.3·1.5·1.6).
// 서버(Deno, index.ts)와 시험(Node, tests/catalog.test.mjs)이 함께 읽는다 —
// authz.ts·ministry.ts 와 같은 제약(원격 import·enum 금지, node --experimental-strip-types 가 그대로 읽는다).
//
// ⚠️ 아래 norm 은 **옛 규칙 그대로**다(authz.ts 의 norm 처럼 NFC 로 바꾸지 않는다) —
//    옛 저장값(members_note 등)과 한 글자라도 달라지면 안 되기 때문이다.
const norm = (s: unknown): string => (s ?? "").toString().trim().replace(/\s+/g, " ");

// ============================================================================
// 1.3 이름·꾸밈(HTML) 관련 헬퍼 — ministryWhoShort / ministryEsc / ministryMemberLine
// ============================================================================
// 「지금 섬기는 분」 자동 명단 한 줄(「김세웅 안수집사 (화평-20)」)을 만드는 데 쓰인다.

// 「화평 20목장」 → 「화평-20」, 「중등부 2학년」 → 「중등부-2」
// ⚠️ 정규식을 쓰지 않는다 — 이 파일이 껍데기를 거쳐 고쳐질 때 역슬래시가 풀린 적이 있다.
export function ministryWhoShort(who: unknown): string {
  return norm(who).split(" ").map((x: string) => {
    const t = x.trim();
    return (t.endsWith("목장") || t.endsWith("학년")) ? t.slice(0, -2) : t;
  }).filter(Boolean).join("-");
}

// 명단 한 줄 — 「김세웅 안수집사 (화평-20)」
// ⚠️ 이름은 성도가 스스로 적은 값이라 반드시 막아서 내보낸다. 이 줄은 앱이 날 HTML로
//    그리는 자리다(관리자가 넣은 꾸밈을 살리려고). 막지 않으면 이름 한 칸이 화면을 먹는다.
export function ministryEsc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function ministryMemberLine(r: any): string {
  const nm = ministryEsc(norm(r.name));
  if (!nm) return "";
  const pos = ministryEsc(norm(r.position));
  const wh = ministryEsc(ministryWhoShort(r.who));
  return nm + (pos ? " " + pos : "") + (wh ? " (" + wh + ")" : "");
}

// ============================================================================
// 1.5 ministryHtml — 저장·조회 양쪽에서 거치는 XSS 필터(관리자만 넣을 수 있는 꾸밈 HTML)
// ============================================================================
// ministryCatalog 가 sched/desc/capacity/leader/membersNote 를 내려줄 때,
// ministryCatalogSave 가 저장할 때 **양쪽 다** 이 필터를 거친다. 저장할 때만 거르면
// 옛 시드(엑셀)로 들어온 값이 안 걸러진다.

// 사역 설명은 **꾸밈(HTML)을 허용한다** — 관리자만 넣기 때문이다(성도님 지시, 2026-09-08).
// ⚠️ 다만 아무 태그나 통과시키지는 않는다. 이 글은 성도님 **모두의 화면**에서 렌더되므로,
//    관리자 비번이 한 번 새면 그대로 저장형 XSS 가 된다. 그래서 꾸밈에 쓰는 태그와
//    style 속성만 남기고 나머지는 서버가 지운다(스크립트·이벤트 핸들러·링크·이미지 전부).
//    ⚠️ 저장할 때와 내려줄 때 **양쪽에서** 거른다 — 엑셀 시드로 들어온 값도 거쳐야 한다.
const MIN_TAGS = new Set(["b", "strong", "i", "em", "u", "s", "br", "span", "small", "mark"]);
const MIN_STYLE_OK = /^(color|background-color|font-weight|font-size|text-decoration)$/;

function ministryStyleAttr(attrs: string): string {
  const m = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs || "");
  const raw = m ? (m[2] ?? m[3] ?? "") : "";
  const out: string[] = [];
  for (const part of raw.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    // ⚠️ 따옴표·백틱·역슬래시를 지운다 — 남기면 style="..." 을 닫고 속성을 새로 연다
    const v = part.slice(i + 1).trim().replace(/["'`\\]/g, "");
    if (!MIN_STYLE_OK.test(k)) continue;
    if (/[<>()]|url|expression|javascript/i.test(v)) continue;   // url(...)·javascript: 차단
    out.push(k + ":" + v.slice(0, 40));
  }
  return out.join(";").slice(0, 160);
}

// 잘린 자리에 열린 채 남은 태그를 닫아 준다 — 안 닫으면 뒤 내용까지 물든다
function ministryCloseTags(html: string): string {
  const stack: string[] = [];
  const re = /<(\/?)([a-z]+)[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const t = m[2];
    if (t === "br") continue;
    if (m[1]) { const i = stack.lastIndexOf(t); if (i >= 0) stack.splice(i, 1); }
    else stack.push(t);
  }
  let out = html;
  for (let i = stack.length - 1; i >= 0; i--) out += "</" + stack[i] + ">";
  return out;
}

// ⚠️ 자르기는 **태그 밖에서만** 한다. 예전엔 그냥 slice 라 <span style="co 처럼
//    속성 한가운데가 잘려, 뒤에 이어 붙는 명단이 통째로 속성값으로 삼켜졌다.
function ministryCut(html: string, max: number): string {
  if (html.length <= max) return html;
  let out = html.slice(0, max);
  const l = out.lastIndexOf("<");
  if (l >= 0 && out.indexOf(">", l) < 0) out = out.slice(0, l);   // 태그 조각은 버린다
  return ministryCloseTags(out);
}

// 자리표 — 입력에서 **먼저 지우므로** 관리자가 이 글자를 쳐 넣어도 섞이지 않는다
const MIN_L = "%%mLT%%";
const MIN_R = "%%mGT%%";

// ⚠️ **걸러 내지 않고 다시 지어 낸다.** 예전엔 허용 밖 태그를 지우는 식이었는데,
//    태그 정규식이 닫는 > 를 요구해서 `<img src=x onerror="…"` 처럼 > 를 뺀 문자열이
//    한 글자도 안 바뀌고 나갔다. 그리고 앱이 '<span…>' + 값 + '</span>' 로 감싸거나
//    명단을 <br> 로 이어 붙이면서 **빠진 > 를 대신 채워** 태그를 완성시켰다
//    (2026-09-09 감사에서 실제 실행으로 확인 — onerror 가 돌았다).
//    이제 허용 태그를 자리표로 옮긴 뒤 **남은 꺾쇠를 전부 글자로** 만든다.
export function ministryHtml(raw: unknown, max = 400): string {
  let s = String(raw ?? "").split(MIN_L).join("").split(MIN_R).join("");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // ① 허용 태그만 자리표로 옮긴다
  s = s.replace(/<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>/g, (_m, close, tag, attrs) => {
    const t = String(tag).toLowerCase();
    if (!MIN_TAGS.has(t)) return "";          // 허용 밖이면 태그만 지운다(글자는 남는다)
    if (close) return MIN_L + "/" + t + MIN_R;
    if (t === "br") return MIN_L + "br" + MIN_R;
    const st = ministryStyleAttr(String(attrs || ""));
    return MIN_L + t + (st ? ' style="' + st + '"' : "") + MIN_R;
  });

  // ② 남은 꺾쇠는 태그가 아니다 — 글자로 만든다. 여기가 막힌 구멍이다.
  // ⚠️ & 는 건드리지 않는다. 이 함수는 **저장할 때와 읽을 때 두 번** 걸리므로
  //    & 를 &amp; 로 바꾸면 읽을 때마다 겹쳐 쌓인다(&lt; → &amp;lt; → &amp;amp;lt;).
  //    태그를 만드는 것은 꺾쇠뿐이고, 실체 참조로 디코드된 글자는 마크업이 되지 않는다.
  s = s.replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // ③ 자리표를 진짜 꺾쇠로 되돌린다
  s = s.split(MIN_L).join("<").split(MIN_R).join(">");
  return ministryCut(s, max);
}

// ============================================================================
// 1.6 「② 언제」 필터 칸 헬퍼 — MINISTRY_FREQ_KEYS/MINISTRY_FREQ_COLS/ministryFreqOf/ministryTimeIn
// ============================================================================

// 주기 네 칸 — 화면·양식·시드가 모두 이 이름을 쓴다(supabase/ministry_when_v2.sql).
// ⚠️ 옛 `freq` text 한 칸은 **DB 에서 지웠다.** 「같은 뜻이 두 곳」이면 조용히 갈라진다.
export const MINISTRY_FREQ_KEYS = ["weekly", "biweekly", "monthly", "adhoc"] as const;
export const MINISTRY_FREQ_COLS = MINISTRY_FREQ_KEYS.map((k) => "freq_" + k).join(",");
export const ministryFreqOf = (r: any) => ({
  weekly: !!r.freq_weekly, biweekly: !!r.freq_biweekly,
  monthly: !!r.freq_monthly, adhoc: !!r.freq_adhoc,
});

// 'H:MM' 도 받아 'HH:MM' 로 맞춘다. 못 알아보면 까닭을 돌려준다 —
// ⚠️ 조용히 null 로 만들면 관리자는 넣었다고 믿는데 화면에서는 「때마다 다름」이 된다.
export function ministryTimeIn(v: unknown, label: string): { v: string | null; err?: string } {
  const t = norm(v);
  if (!t) return { v: null };
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return { v: null, err: label + "은(는) 09:00 꼴로 넣어 주세요" };
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return { v: null, err: label + "이(가) 00:00~23:59 밖입니다" };
  return { v: String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0") };
}
