import { test } from "node:test";
import assert from "node:assert/strict";
import { isKakaoInApp, externalUrl, closeUrl, shouldLeaveKakao } from "../js/core/inapp.js";

const ANDROID_KAKAO = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410810";
const IOS_KAKAO = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.0";
const CHROME = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";

test("isKakaoInApp — 카카오톡 안 브라우저만", () => {
  assert.equal(isKakaoInApp(ANDROID_KAKAO), true);
  assert.equal(isKakaoInApp(IOS_KAKAO), true);
  assert.equal(isKakaoInApp(CHROME), false);
  assert.equal(isKakaoInApp(SAFARI), false);
  assert.equal(isKakaoInApp(""), false);
  assert.equal(isKakaoInApp(), false);
});

test("externalUrl — 메뉴 주소(#/…)까지 그대로 넘긴다", () => {
  const href = "https://admin.onlybible.kr/#/status?y=2027&q=김";
  const out = externalUrl(href);
  assert.ok(out.startsWith("kakaotalk://web/openExternal?url="));
  assert.equal(decodeURIComponent(out.slice("kakaotalk://web/openExternal?url=".length)), href);
  assert.ok(!out.includes("#"), "# 이 그대로 있으면 카카오톡이 주소를 거기서 자른다");
});

test("closeUrl — 아이폰·안드로이드", () => {
  assert.equal(closeUrl(IOS_KAKAO), "kakaoweb://closeBrowser");
  assert.equal(closeUrl(ANDROID_KAKAO), "kakaotalk://inappbrowser/close");
});

test("shouldLeaveKakao — 카카오톡에서 처음 열 때만 넘긴다", () => {
  const home = "https://admin.onlybible.kr/";
  assert.equal(shouldLeaveKakao({ ua: ANDROID_KAKAO, href: home }), true);
  assert.equal(shouldLeaveKakao({ ua: IOS_KAKAO, href: home + "#/members" }), true);
  assert.equal(shouldLeaveKakao({ ua: CHROME, href: home }), false);
  assert.equal(shouldLeaveKakao({ ua: SAFARI, href: home }), false);
  // 「그냥 볼게요」를 누른 탭
  assert.equal(shouldLeaveKakao({ ua: ANDROID_KAKAO, href: home, stay: true }), false);
  // 로그인하고 돌아온 주소 — 넘기면 로그인이 끊긴다
  assert.equal(shouldLeaveKakao({ ua: ANDROID_KAKAO, href: home + "?code=abc" }), false);
  assert.equal(shouldLeaveKakao({ ua: IOS_KAKAO, href: home + "?error=access_denied&error_description=x" }), false);
});
