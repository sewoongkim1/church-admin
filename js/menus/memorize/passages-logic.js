// 📜 내 안에 거하는 말씀 — 순수 규칙·말(화면 passages.js · 시험 tests/mem-passages-logic.test.mjs). DOM 을 만지지 않는다.
//   성경암송 api savePassage 가 받는 꼴: { id?, title, ref, category, sortOrder, lines[], is_active } — 서버는 제목·본문(한 줄 이상)만
//   본다(title-required · lines-required). 글자 수 상한은 서버·DB 어디에도 없다(그래서 여기서도 막지 않고 마디 수·가장 긴 마디만 보여 준다).
// ⚠️ 마디 = 한 줄. 앞뒤 빈칸을 깎고 빈 줄은 건너뛴다 — 서버 savePassage · 앱 passageChunks · AI 도우미 passageHelp 가 모두 같은 규칙이다.
// ⚠️ 성도님 앱은 제목·출처·마디 글자를 이스케이프하지 않고 화면에 넣는다(app.js renderPassageList · renderPassageChunk 의
//    data-answer="${word}" · aria-label="${p.title} 듣기"). 그래서 < > " 는 받지 않는다 — 글자가 사라지거나 빈칸 정답이 깨진다.
// ⚠️ 한글은 완성형(NFC)으로 저장한다 — 맥에서 붙여 넣은 자모 분리(NFD) 글자는 빈칸 정답과 안 맞을 수 있다(찬양 NFC 사고 2026-09-20 과 같은 결).

export const PUBLIC_KEY = "passagesPublic";
// 성도님 앱의 미리 보기 주소 — 공개 스위치와 상관없이 목록이 열린다(app.js getPassagesPreview). 운영 화면에서만 단추를 둔다.
export const PREVIEW_URL = "https://gocheok.onlybible.kr/?passages=1";

const nfc = (s) => String(s ?? "").normalize("NFC");
const BAD = /[<>"]/;
export const BAD_HINT = `" < > 는 쓸 수 없어요 — 성도님 화면에서 글자가 깨져요(따옴표는 “ ” 로 바꿔 주세요)`;

// 본문 칸 글 → 마디 배열
export function splitLines(text) {
  return nfc(text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
// 서버에서 온 lines 배열 → 마디 배열(같은 규칙)
export const chunksOf = (lines) => splitLines((Array.isArray(lines) ? lines : []).map((s) => String(s ?? "")).join("\n"));

// 본문 칸 아래 셈 — 마디 수 · 가장 긴 마디의 글자 수(한글 한 자 = 1)
export function lineStats(text) {
  const lines = splitLines(text);
  return { count: lines.length, longest: lines.reduce((m, s) => Math.max(m, [...s].length), 0) };
}
export function countText(text) {
  const { count, longest } = lineStats(text);
  return count ? `마디 ${count}개 · 가장 긴 마디 ${longest}자` : "마디 0개 — 한 줄 이상 적어 주세요";
}

// 차례 칸 → 정수(비우면 0) · 정수가 아니면 null. DB 칸이 int 라 그 범위 안에서만.
export function parseSortOrder(v) {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  if (!/^[+-]?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && Math.abs(n) <= 2147483647 ? (n === 0 ? 0 : n) : null;
}

// 서버 본문 → 창의 칸 값
export function passageToForm(p) {
  const x = p || {};
  return {
    title: String(x.title ?? ""), ref: String(x.ref ?? ""), category: String(x.category ?? ""),
    sortOrder: String(x.sortOrder ?? 0), text: chunksOf(x.lines).join("\n"), active: true,
  };
}

// 창의 칸 값 → { ok:true, passage } · { ok:false, message }(창 안 빨간 줄로)
//   id — 고칠 때만(새 본문은 비움 → 서버가 번호를 매긴다)
export function formToPassage(f = {}, id = null) {
  const title = nfc(f.title).trim(), ref = nfc(f.ref).trim(), category = nfc(f.category).trim();
  const lines = splitLines(f.text);
  if (!title) return { ok: false, message: "제목을 적어 주세요" };
  if (!lines.length) return { ok: false, message: "본문을 한 줄 이상 적어 주세요 — 한 줄이 마디 하나예요" };
  const sortOrder = parseSortOrder(f.sortOrder);
  if (sortOrder === null) return { ok: false, message: "차례는 정수로 적어 주세요 (보통 0 · 작을수록 위)" };
  for (const [label, v] of [["제목", title], ["출처", ref], ["분류", category]]) {
    if (BAD.test(v)) return { ok: false, message: `${label}에 ${BAD_HINT}` };
  }
  const bad = lines.findIndex((s) => BAD.test(s));
  if (bad >= 0) return { ok: false, message: `${bad + 1}째 마디에 ${BAD_HINT}` };
  const passage = { title, ref, category, sortOrder, lines, is_active: f.active !== false };
  if (id != null && id !== "") passage.id = Number(id);
  return { ok: true, passage };
}

// 고칠 때 마디가 어떻게 바뀌나 — "same"(그대로) · "edited"(글자만) · "moved"(같은 마디들의 차례만) · "count"(수가 바뀜)
//   성도님 진행 기록(passage_progress.done_seq)은 「몇째 마디」(0부터)라 moved·count 면 마친 마디 표시가 어긋난다.
export function linesChange(before, after) {
  const a = chunksOf(before), b = chunksOf(after);
  if (a.length !== b.length) return "count";
  if (a.every((s, i) => s === b[i])) return "same";
  const sa = [...a].sort(), sb = [...b].sort();
  return sa.every((s, i) => s === sb[i]) ? "moved" : "edited";
}
export function linesChangeText(kind, before, after) {
  const n0 = chunksOf(before).length, n1 = chunksOf(after).length;
  const head = kind === "count" ? `마디가 ${n0}개에서 ${n1}개로 바뀌어요.` : kind === "moved" ? "마디 차례가 바뀌어요." : "";
  if (!head) return "";
  return `${head} 성도님 진행 기록은 「몇째 마디」로 남아 있어서, 이미 외우던 분들의 마친 마디 표시가 어긋날 수 있어요. ` +
    "「다 외움」 표시는 그대로 남아요. 글자만 고치는 것은 괜찮아요.";
}

// 고치기 창 맨 위 안내
export const PROGRESS_NOTE = "성도님 진행 기록은 「몇째 마디」로 남아요 — 이미 외우는 분이 있는 본문의 줄을 더하거나 빼거나 차례를 바꾸면 " +
  "마친 마디 표시가 어긋나요. 글자만 고치는 것은 괜찮아요(고친 마디의 풀이·기억법·영어 도우미는 성도님이 처음 열 때 AI 가 새로 만들어요).";
// 「성도님 목록에 보이기」를 끌 때 — getPassages 는 켜진 본문만 준다
export const ACTIVE_OFF_WARN = "끄고 저장하면 이 본문이 성도님 목록에서 빠지고, 이 화면 목록에서도 사라져요. 여기서는 다시 켤 수 없어요" +
  "(서버가 켜진 본문만 돌려줘요). 성도님 진행 기록은 지워지지 않고 남아요.";

// 공개 스위치(app_config passagesPublic) — getConfig 답 → "on" · "off" · "unknown"(못 불러옴)
//   성도님 앱과 같은 읽기(app.js refreshPassagesPublic: d.value 가 참 같은 값이면 공개 · 없음(null)도 닫힘).
export function publicState(r) {
  if (!r || r.ok !== true) return "unknown";
  return r.value ? "on" : "off";
}
export const PUBLIC_TEXT = {
  on: "켜짐 — 성도님 첫 화면에 보여요",
  off: "꺼짐 — 성도님께 안 보여요",
  unknown: "모름 — 불러오지 못했어요",
};
// 공개는 켜졌는데 보일 본문이 없을 때(count = 본문 수 · 목록을 못 불러왔으면 null → 말하지 않는다)
export function publicWarn(state, count) {
  return state === "on" && count === 0 ? "공개는 켜져 있는데 본문이 없어요 — 성도님은 「아직 등록된 본문이 없어요」만 봐요" : "";
}
// 바꾸기 전 확인 창의 글 — to = 켤까(true)·끌까(false) · count = 지금 본문 수(모르면 null)
export const PUBLIC_DELAY = "성도님 앱에는 바로 안 보일 수 있어요 — 앱이 열 때 이 값을 받아 두었다가 그다음 첫 화면부터 써요.";
export function publicConfirm(to, count) {
  if (to) {
    return {
      title: "성도님께 보이게 할까요?", ok: "보이게 하기", cancel: "그만두기", danger: false,
      text: "성도님 첫 화면에 「📜 내 안에 거하는 말씀」 단추가 생겨요." +
        (count === 0 ? " 지금은 본문이 없어서 빈 목록이 보여요." : count ? ` 지금 본문 ${count}개가 보여요.` : "") + " " + PUBLIC_DELAY,
    };
  }
  return {
    title: "성도님께 숨길까요?", ok: "숨기기", cancel: "그만두기", danger: true,
    text: "성도님 첫 화면에서 단추가 빠져요. 본문과 성도님 진행 기록은 그대로 남아요. " + PUBLIC_DELAY,
  };
}

// 운영 화면에서만 미리 보기 주소 — 개발 DB 로 볼 때 운영 앱을 열면 다른 본문(운영 것)이 보인다
export const previewUrl = (env) => (env === "prod" ? PREVIEW_URL : "");

// 성경암송 api 의 이 화면 오류 → 한 문장(모르는 코드는 "" — 부르는 쪽이 ui.js errorText 로)
const ERR = {
  "title-required": "제목을 적어 주세요",
  "lines-required": "본문을 한 줄 이상 적어 주세요 — 한 줄이 마디 하나예요",
  "id-required": "어느 본문인지 알 수 없어요 — 다시 불러와 주세요",
  unauthorized: "성경암송 서버가 이 요청을 받지 않았어요 — 개발 담당에게 알려 주세요",
  "no-password-set": "성경암송 서버가 이 요청을 받지 않았어요 — 개발 담당에게 알려 주세요",
};
export const passageErrorText = (r) => ERR[r && r.error] || "";
