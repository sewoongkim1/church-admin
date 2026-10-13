// 🚩 게시판 관리 — 📢 공지 쓰기 · 관리자 답글의 순수 규칙(2026-10-13 · 성경암송 admin-stats 「📢 공지 쓰기」·「관리자 답글 달기」 이전).
//   tests/mem-board-logic.test.mjs 가 이 파일을 읽는다 — DOM 을 쓰지 말 것.
//   ⚠️ 길이·빈 글 규칙은 성경암송 api boardPost·boardReply 와 같아야 한다 — 서버는 trim 한 뒤 String.length(UTF-16)로 2,000 을 센다.
//      그래서 여기서도 이모지 하나를 2자로 센다(코드포인트로 세면 화면은 통과인데 서버가 too-long 으로 거절한다).
import { esc, errorText } from "../../core/ui.js";

export const BOARD_MAX = 2000;            // 글·답글 본문 — api `content.length > 2000` → too-long
export const NAME_MAX = 40;               // 공지 글쓴이 — api 는 넘는 것을 말없이 자른다(slice 0,40) · 화면은 maxlength 로 막는다
export const NOTICE_NAME = "제자양육부";   // 옛 화면의 기본 글쓴이 — 비우면 이것(api 는 비우면 「익명」이라 화면이 먼저 채운다)

const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export const boardLen = (s) => String(s ?? "").trim().length;

// 글자 수 표시 — 「123 / 2,000자」 · over 면 화면이 빨갛게
export function countInfo(s, max = BOARD_MAX) {
  const n = boardLen(s);
  return { n, over: n > max, text: `${comma(n)} / ${comma(max)}자` };
}

// 본문 검사 → null(괜찮음) | 한 문장
export function contentProblem(s) {
  const n = boardLen(s);
  if (!n) return "내용을 적어 주세요";
  if (n > BOARD_MAX) return `${comma(BOARD_MAX)}자까지 올릴 수 있어요 — 지금 ${comma(n)}자예요`;
  return null;
}

// 📢 공지 → { ok:true, body:{ name, content, rich } } | { ok:false, message }
//   rich 는 참일 때만 참(체크 칸의 checked) — api 는 내부 키(관리자)로 온 글에만 rich 를 붙인다.
export function noticeBody({ name, content, rich } = {}) {
  const p = contentProblem(content);
  if (p) return { ok: false, message: p };
  const nm = String(name ?? "").trim().slice(0, NAME_MAX) || NOTICE_NAME;
  return { ok: true, body: { name: nm, content: String(content).trim(), rich: rich === true } };
}

// 관리자 답글 → { ok:true, body:{ post_id, id, content } } | { ok:false, message }
//   id 는 교회 어드민 「바꾼 기록」의 대상 칸 몫이다(memProxy 가 b.id 로 채운다 · 성경암송 boardReply 는 id 를 읽지 않는다 · 2026-10-13).
export function replyBody(postId, content) {
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "답글을 달 글을 찾지 못했어요 — 새로 불러와 주세요" };
  const p = contentProblem(content);
  if (p) return { ok: false, message: p };
  return { ok: true, body: { post_id: id, id, content: String(content).trim() } };
}

// HTML 태그처럼 보이는 것이 있나(<b> · </p> · <br/> · <span style=…>) — 「HTML 로 그리기」를 끈 채면 태그가 글자 그대로 보인다
export const looksLikeHtml = (s) => /<\/?[a-z][a-z0-9]*(\s[^<>]*)?\/?>/i.test(String(s ?? ""));

// 「HTML 로 그리기」 안내 — 쓰는 동안 칸 아래에 보인다. 성경암송 app.js boardRich 가 실제로 하는 일만 적는다.
//   · 켜면: 엔터로 바꾼 줄은 이어 붙어 보인다(.board-text 에 white-space 가 없다) · 정해 둔 태그만 그린다(RICH_TAGS) · 링크는 http(s)만
//   · 끄면: 태그가 글자 그대로 보인다(boardEsc)
export function noticeHints({ content, rich } = {}) {
  const s = String(content ?? "");
  const out = [];
  if (rich) {
    if (/\n/.test(s.trim()) && !/<(br|p|div|li|h3|h4|hr|blockquote)\b/i.test(s)) {
      out.push("줄을 바꾼 곳이 있는데 <br>·<p> 가 없어요 — HTML 로 그리면 엔터로 바꾼 줄이 앱에서 한 줄로 이어져 보여요.");
    }
  } else if (looksLikeHtml(s)) {
    out.push("글에 HTML 태그가 보여요 — 「HTML 로 그리기」를 끈 채로 올리면 태그가 글자 그대로 보여요.");
  }
  return out;
}

// 확인 창에 보일 앞부분(글자로 · 줄바꿈은 빈칸) — esc 는 부르는 쪽이
export function excerpt(s, n = 120) {
  const t = String(s ?? "").trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// 확인 창 본문(html) — 이름·글은 esc 로 감싼다
export function noticeConfirmHtml(body) {
  const n = boardLen(body.content);
  return `<p>글쓴이 <b>${esc(body.name)}</b> · ${comma(n)}자${body.rich ? " · <b>HTML 로 그려요</b>" : ""}</p>` +
    `<p class="muted" style="margin:6px 0;white-space:pre-wrap">${esc(excerpt(body.content))}</p>` +
    `<p class="muted">올리면 게시판을 여는 성도님께 바로 보여요. 앱 알림은 따로 가지 않아요. 잘못 올렸으면 「글 목록」에서 숨기거나 지울 수 있어요.</p>`;
}
// post — 답글을 달 글({ hidden, deleted }) · 숨김·삭제된 글에 단 답글은 성도님께 안 보인다(api boardList 가 글째 뺀다)
export function replyConfirmHtml(body, post) {
  const away = post && (post.hidden || post.deleted);
  return `<p class="muted" style="margin:0 0 6px;white-space:pre-wrap">${esc(excerpt(body.content))}</p>` +
    `<p class="muted">성도님 앱에는 이름 대신 「관리자」 표시와 함께 보여요. 글쓴 분께 알림은 따로 가지 않아요.</p>` +
    (away ? `<p class="muted"><b>이 글은 ${post.hidden ? "숨김" : "삭제"} 상태라 답글도 성도님께 보이지 않아요.</b></p>` : "");
}

// api 의 게시판 쓰기 오류 → 한 문장.
//   ⚠️ 공용 errorText 의 too-long 은 「한 칸에 40자」(교회 어드민 이름 칸)라 여기서 먼저 가른다.
//   no-user·rules-needed·unauthorized 는 api 가 이 부름을 관리자 글로 받지 않았다는 뜻이다(내부 키 화이트리스트가 빠졌을 때) — 고칠 곳은 서버다.
const BOARD_ERR = {
  empty: "내용을 적어 주세요",
  "too-long": `${comma(BOARD_MAX)}자까지 올릴 수 있어요`,
  "no-post": "답글을 달 글을 찾지 못했어요 — 새로 불러와 주세요",
};
const NOT_ADMIN = new Set(["no-user", "rules-needed", "unauthorized"]);
export function boardErrorText(r) {
  const e = r?.error;
  if (BOARD_ERR[e]) return BOARD_ERR[e];
  if (NOT_ADMIN.has(e)) return `성경암송 서버가 관리자 글로 받지 않았어요 — 개발자에게 알려 주세요 (${e})`;
  return errorText(r);
}
