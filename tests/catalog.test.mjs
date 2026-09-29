import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ministryHtml, ministryWhoShort, ministryEsc, ministryMemberLine,
  MINISTRY_FREQ_KEYS, MINISTRY_FREQ_COLS, ministryFreqOf, ministryTimeIn,
} from "../supabase/functions/church-admin/catalog.ts";

test("ministryHtml — <script>·on속성·javascript: 주소는 마크업으로 남지 않는다", () => {
  // <script> 태그 자체는 지워지지만(허용 밖) 안의 글자는 남는다 — "걸러 내지 않고 다시 지어 낸다"
  assert.equal(ministryHtml("<script>alert(1)</script>안내"), "alert(1)안내");
  assert.ok(!ministryHtml("<script>alert(1)</script>안내").includes("<script"));
  // <img onerror=...> 는 통째로 한 태그라 아무 글자도 안 남는다
  assert.equal(ministryHtml('<img src=x onerror="alert(1)">'), "");
  // <a href="javascript:..."> 는 a 가 허용 밖이라 태그만 지워지고 글자만 남는다
  assert.equal(ministryHtml('<a href="javascript:alert(1)">누르기</a>'), "누르기");
  assert.ok(!ministryHtml('<a href="javascript:alert(1)">누르기</a>').includes("javascript:"));
});

test("ministryHtml — 허용 태그(b·mark)는 남는다", () => {
  assert.equal(ministryHtml("<b>굵게</b>"), "<b>굵게</b>");
  assert.equal(ministryHtml("<mark>강조</mark>"), "<mark>강조</mark>");
});

test("ministryHtml — 허용 style 은 남고 위험한 값은 걸러진다", () => {
  assert.equal(ministryHtml('<span style="color:red">글자</span>'), '<span style="color:red">글자</span>');
  assert.equal(ministryHtml('<span style="background:url(x)">글자</span>'), "<span>글자</span>");
});

test("ministryHtml — max 를 넘으면 태그 밖에서 자르고 열린 태그를 닫는다", () => {
  assert.equal(ministryHtml("<span>가나다라마바사아자차카</span>", 8), "<span>가나</span>");
});

test("ministryHtml — null·undefined → 빈 문자열", () => {
  assert.equal(ministryHtml(null), "");
  assert.equal(ministryHtml(undefined), "");
});

test("ministryEsc — 꺾쇠·따옴표·앰퍼샌드를 실체 참조로", () => {
  assert.equal(ministryEsc("<script>"), "&lt;script&gt;");
  assert.equal(ministryEsc('a"b'), "a&quot;b");
  assert.equal(ministryEsc("a&b"), "a&amp;b");
  assert.equal(ministryEsc(null), "");
  assert.equal(ministryEsc(undefined), "");
});

test("ministryWhoShort — 「화평 20목장」→「화평-20」, 「중등부 2학년」→「중등부-2」", () => {
  assert.equal(ministryWhoShort("화평 20목장"), "화평-20");
  assert.equal(ministryWhoShort("중등부 2학년"), "중등부-2");
  assert.equal(ministryWhoShort(""), "");
  assert.equal(ministryWhoShort(null), "");
});

test("ministryMemberLine — 「이름 직분 (소속)」 꼴(원문 예시)", () => {
  assert.equal(
    ministryMemberLine({ name: "김세웅", position: "안수집사", who: "화평 20목장" }),
    "김세웅 안수집사 (화평-20)",
  );
  // 이름이 없으면 아예 빈 줄(그 행은 명단에 안 오른다)
  assert.equal(ministryMemberLine({ name: "", position: "집사", who: "화평 20목장" }), "");
  // 직분·소속이 없어도 이름만으로 한 줄
  assert.equal(ministryMemberLine({ name: "홍길동", position: "", who: "" }), "홍길동");
  // 이름은 성도가 스스로 적은 값이라 반드시 막아서 내보낸다
  assert.equal(
    ministryMemberLine({ name: "<b>김</b>세웅", position: "", who: "" }),
    "&lt;b&gt;김&lt;/b&gt;세웅",
  );
});

test("ministryFreqOf — 네 칸 불리언", () => {
  assert.deepEqual(
    ministryFreqOf({ freq_weekly: true, freq_biweekly: 0, freq_monthly: null, freq_adhoc: "x" }),
    { weekly: true, biweekly: false, monthly: false, adhoc: true },
  );
  assert.deepEqual(MINISTRY_FREQ_KEYS, ["weekly", "biweekly", "monthly", "adhoc"]);
  assert.equal(MINISTRY_FREQ_COLS, "freq_weekly,freq_biweekly,freq_monthly,freq_adhoc");
});

test("ministryTimeIn — 'H:MM' 을 'HH:MM' 로, 빈 값은 null, 범위·꼴 밖은 오류", () => {
  assert.deepEqual(ministryTimeIn("9:05", "시작 시각"), { v: "09:05" });
  assert.deepEqual(ministryTimeIn("", "시작 시각"), { v: null });
  assert.deepEqual(ministryTimeIn("25:00", "시작 시각"), { v: null, err: "시작 시각이(가) 00:00~23:59 밖입니다" });
  assert.deepEqual(ministryTimeIn("오전", "시작 시각"), { v: null, err: "시작 시각은(는) 09:00 꼴로 넣어 주세요" });
});
