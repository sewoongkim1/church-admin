// 성경필사(암송) 명단 올리기 판정·교인명부 찾기 모양 — 순수 함수 시험(preflight 가 돈다 · 계획 Task 8)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rawOf, tidyUpload, fillNames, applyFill, uploadKeys, judgeUpload,
  uploadCounts, uploadOut, uploadRecords, filledNames, tooManyRows, uploadEventError,
  lookupName, lookupOut, UPLOAD_TAG, FILL_TAG, LOOKUP_MAX,
} from "../supabase/functions/church-admin/events-upload.ts";
import { sameKeys } from "../supabase/functions/church-admin/events-rows.ts";

// 시험 이름은 모두 지어낸 글자다(진짜 명단은 저장소에 넣지 않는다)
const R = (name, gu = "", mok = "", pos = "") => ({ name, gu, mok, pos });
const P = (o) => ({ name_key: "", kind2: "장년", mok1: "", mok3: "", school_dept: "", position: "", position_detail: "", ...o });
const NO_IDX = { eventKeys: new Set(), eventUids: new Set(), users: new Map() };

test("tooManyRows · uploadEventError — 600줄까지 · 없는 회차 not-found · 자격 회차 eligibility-event", () => {
  assert.equal(tooManyRows(Array.from({ length: 600 }, () => ({}))), false);
  assert.equal(tooManyRows(Array.from({ length: 601 }, () => ({}))), true);
  assert.equal(uploadEventError(null), "not-found");
  assert.equal(uploadEventError({ id: "x", needs: { position: true, eligibility: { start: "2026-10-11", weeks: 6 } } }), "eligibility-event");
  assert.equal(uploadEventError({ id: "x", needs: { position: true } }), null);
  assert.equal(uploadEventError({ id: "x", needs: {} }), null);
});

test("rawOf — 칸 네 개만, 글자로(엑셀 숫자 칸도) · 객체가 아니면 빈칸", () => {
  assert.deepEqual(rawOf({ name: "홍길동", gu: "화평", mok: 7, pos: "집사", extra: "x" }), { name: "홍길동", gu: "화평", mok: "7", pos: "집사" });
  assert.deepEqual(rawOf(null), { name: "", gu: "", mok: "", pos: "" });
  assert.deepEqual(rawOf(["홍길동"]), { name: "", gu: "", mok: "", pos: "" });
  assert.equal(rawOf({ name: "가".repeat(500) }).name.length, 200);
});

test("tidyUpload — 다듬기 · 소속이 빈 줄(no-group)은 blank · 모양 틀림은 bad", () => {
  const it = tidyUpload([
    R("홍길동2", "화평교구", "07", "집사님"),   // 0 다듬어 넣음
    R("홍길동"),                                 // 1 소속 없음 — 교구 칸이 비어 구분도 모른다
    R("홍,길동", "화평", "1"),                   // 2 bad-char
    R("", "", "", ""),                           // 3 빈 줄 — no-name
    R("홍길동", "교회학교", "", ""),             // 4 부서 없음 — 빈칸(구분은 교회학교)
    null,                                        // 5 객체가 아님 — no-name
    R("홍길동", "없는교구", "1"),                // 6 bad-group
  ]);
  assert.deepEqual(it.map((x) => x.mark), ["add", "blank", "bad", "bad", "blank", "bad", "bad"]);
  assert.deepEqual(it[0].row, { who_type: "교구", group_name: "화평", sub_name: "7", name: "홍길동", position: "집사" });
  assert.ok(it[0].notes.length >= 1, "이름 끝 숫자를 뗐다는 알림");
  assert.equal(it[0].uid, null);
  assert.equal(it[0].filled, false);
  assert.deepEqual(it[1].row, { who_type: "", group_name: "", sub_name: "", name: "홍길동", position: "" });
  assert.equal(it[1].error, null);
  assert.ok(it[1].notes.some((n) => n.includes("비어 있어요")));
  assert.deepEqual(it[4].row, { who_type: "교회학교", group_name: "", sub_name: "", name: "홍길동", position: "" });
  assert.deepEqual([it[2].error, it[3].error, it[5].error, it[6].error], ["bad-char", "no-name", "no-name", "bad-group"]);
  assert.equal(it[3].row, null);
  assert.deepEqual(it.map((x) => x.i), [0, 1, 2, 3, 4, 5, 6]);
});

test("fillNames — 빈칸이 있는 줄의 이름만 묻는다(교회학교 학년 빈칸은 묻지 않는다)", () => {
  const it = tidyUpload([R("가 나"), R("다라", "화평", "", "집사"), R("카타", "화평", "3", "집사"), R("파하", "교회학교", "유년부", "학생"), R("x,y", "", "", "")]);
  assert.deepEqual(fillNames(it).sort(), ["가나", "다라"].sort());
});

test("applyFill — 한 분이면 빈칸만 · 소속이 다르면 아무것도 안 채운다 · 교구 칸을 채우면 목장도 명부 값 · 동명이인", () => {
  const it = tidyUpload([
    R("가나"),                    // 0 소속 없음 · 명부 한 분(소망 12 권사) → 채움
    R("다라", "화평", "", "집사"), // 1 목장만 빔 · 명부도 화평 → 목장만(직분 집사는 그대로)
    R("마바"),                    // 2 소속 없음 · 명부에 두 분 → 교인명부 동명이인
    R("사아"),                    // 3 소속 없음 · 명부에 없음 → 빈칸
    R("자차", "화평", "", ""),     // 4 명단은 화평 · 명부는 소망 → 아무것도 안 채움(넣음 그대로)
    R("마바", "믿음", "1", ""),    // 5 소속이 적혀 있고 직분만 빔 · 동명이인 → 넣음(직분은 빈 채로)
    R("아자", "", "21", ""),       // 6 교구 칸 빔 · 목장 21 → 명부(화평 20)로 교구를 채우면 목장도 20
  ]);
  const cands = new Map([
    ["가나", [P({ name_key: "가나", mok1: "소망", mok3: "소망-12목장", position: "권사" })]],
    ["다라", [P({ name_key: "다라", mok1: "화평", mok3: "화평-5목장", position: "권사" })]],
    ["마바", [P({ name_key: "마바", mok1: "믿음", mok3: "믿음-1목장" }), P({ name_key: "마바", mok1: "사랑", mok3: "사랑-2목장" })]],
    ["자차", [P({ name_key: "자차", mok1: "소망", mok3: "소망-3목장", position: "집사" })]],
    ["아자", [P({ name_key: "아자", mok1: "화평", mok3: "화평-20목장", position: "권사" })]],
  ]);
  applyFill(it, cands);
  assert.deepEqual(it.map((x) => x.mark), ["fill", "fill", "same-name", "blank", "add", "add", "fill"]);
  assert.equal(it[0].filled, true);
  assert.deepEqual(it[0].row, { who_type: "교구", group_name: "소망", sub_name: "12", name: "가나", position: "권사" });
  assert.deepEqual(it[1].row, { who_type: "교구", group_name: "화평", sub_name: "5", name: "다라", position: "집사" });
  assert.equal(it[2].filled, false);
  assert.ok(it[3].notes.some((n) => n.includes("교인명부에 없는")));
  // 명단은 화평, 명부는 소망 — 소망의 목장 번호(3)도 직분(집사)도 화평 줄에 들어가면 안 된다
  assert.deepEqual(it[4].row, { who_type: "교구", group_name: "화평", sub_name: "", name: "자차", position: "" });
  assert.equal(it[4].filled, false);
  assert.ok(it[4].notes.some((n) => n.includes("소속이 달라")));
  // 소속이 적힌 줄의 동명이인은 same-name 이 아니라 넣음 — 직분은 빈 채로
  assert.deepEqual(it[5].row, { who_type: "교구", group_name: "믿음", sub_name: "1", name: "마바", position: "" });
  assert.ok(it[5].notes.some((n) => n.includes("같은 이름이 여러 분")));
  // 교구 칸을 명부로 채웠다 — 적혀 있던 목장 21 은 버리고 명부 목장 20
  assert.deepEqual(it[6].row, { who_type: "교구", group_name: "화평", sub_name: "20", name: "아자", position: "권사" });
  assert.ok(it[6].notes.some((n) => n.includes("적힌 목장 21 대신 교인명부 목장")));
  assert.deepEqual(filledNames(it).sort(), ["가나", "다라", "아자"].sort());
  // 알림에 명부의 원래 칸 값이 새지 않는다
  const text = JSON.stringify(it);
  for (const k of ["소망-12목장", "소망-3목장", "화평-20목장", "화평-5목장"]) assert.ok(!text.includes(k), "새어 나감: " + k);
});

test("applyFill — 명부가 한 번도 안 올라왔으면(null) 채우지 않고 알린다", () => {
  const it = applyFill(tidyUpload([R("가나")]), null);
  assert.equal(it[0].mark, "blank");
  assert.ok(it[0].notes.some((n) => n.includes("교인명부가 아직")));
});

test("uploadKeys — 넣을 줄만 · 한 분 더하기와 같은 후보 키(sameKeys · 「07」 꼴 포함)", () => {
  const it = tidyUpload([R("홍길동", "화평", "7"), R("가나"), R("x,y", "화평", "1")]);
  const ks = uploadKeys(it);
  assert.deepEqual([...ks].sort(), [...sameKeys(it[0].row)].sort(), "blank·bad 줄의 키는 묻지 않는다");
  assert.ok(ks.includes("교구|화평|7|||홍길동"));
  assert.ok(ks.includes("교구|화평|07|||홍길동"), "앱 로그인이 받은 「07」 계정도 찾게");
});

test("judgeUpload — 이 회차에 이미(키·계정) · 파일 안 접기(먼저 나온 줄이 남는다) · 계정은 하나일 때만 잇는다", () => {
  const it = tidyUpload([
    R("홍길동", "화평", "07", "집사"),  // 0 넣음 — 「07」로 등록된 앱 계정 U1 과 잇는다
    R("홍길동2", "화평교구", "7목장"),  // 1 위 1번 줄과 같은 분
    R("나다", "소망", "3"),            // 2 이 회차에 계정 U2 의 줄(옛 소속으로 낸 앱 줄)이 있다
    R("라마", "사랑", "4"),            // 3 이 회차에 같은 신원 키 줄이 있다(계정 없는 이관 줄)
    R("바사", "믿음", "5", "명예권사"), // 4 넣음 — 계정이 둘이라 잇지 않는다 · 목록 밖 직분
  ]);
  judgeUpload(it, {
    eventKeys: new Set(["교구|사랑|4|||라마"]),
    eventUids: new Set(["U2"]),
    users: new Map([
      ["교구|화평|07|||홍길동", ["U1"]],
      ["교구|소망|3|||나다", ["U2"]],
      ["교구|믿음|5|||바사", ["U3", "U4"]],
    ]),
  });
  assert.deepEqual(it.map((x) => x.mark), ["add", "same", "same", "same", "add"]);
  assert.equal(it[0].uid, "U1");
  assert.ok(it[1].notes.some((n) => n.includes("위 1번 줄")));
  assert.ok(it[2].notes.some((n) => n.includes("이미 있어요")));
  assert.ok(it[3].notes.some((n) => n.includes("이미 있어요")));
  assert.equal(it[4].uid, null);
  assert.ok(it[4].notes.some((n) => n.includes("2개")));
  assert.ok(it[4].notes.some((n) => n.includes("명예권사")));
});

test("judgeUpload — 채운 줄(fill)도 이미 있으면 same · 계정 하나로 파일 안에서 겹치면 접는다", () => {
  const it = tidyUpload([R("가나"), R("아자", "기쁨", "1"), R("아자", "기쁨", "2")]);
  applyFill(it, new Map([["가나", [P({ name_key: "가나", mok1: "소망", mok3: "소망-12목장" })]]]));
  judgeUpload(it, {
    eventKeys: new Set(["교구|소망|12|||가나"]), eventUids: new Set(),
    users: new Map([["교구|기쁨|1|||아자", ["U9"]], ["교구|기쁨|2|||아자", ["U9"]]]),   // 소속을 고친 분(별칭) — 같은 계정
  });
  assert.deepEqual(it.map((x) => x.mark), ["same", "add", "same"]);
  assert.equal(it[0].filled, true, "채운 값은 화면에 나갔다 — people.fill 기록 대상");
  assert.ok(it[2].notes.some((n) => n.includes("위 2번 줄")));
});

test("uploadCounts · uploadOut(칸 지도) · uploadRecords(메모 표기·칸이 모두 같다)", () => {
  const it = tidyUpload([
    R("홍길동", "화평", "3", "명예권사"), // 0 add · 목록 밖 직분
    R("홍길동", "화평", "3"),             // 1 same(파일 안)
    R("가나"),                            // 2 fill
    R("카타"),                            // 3 blank(명부에 없음)
    R("x,y", "화평", "1"),                // 4 bad
  ]);
  applyFill(it, new Map([["가나", [P({ name_key: "가나", mok1: "소망", mok3: "소망-12목장", position: "권사" })]]]));
  judgeUpload(it, { ...NO_IDX, users: new Map([["교구|화평|3|||홍길동", ["U1"]]]) });
  assert.deepEqual(uploadCounts(it), { add: 1, same: 1, blank: 1, bad: 1, fill: 1, sameName: 0, oddPosition: 1 });

  const out = uploadOut(it);
  for (const o of out) assert.deepEqual(Object.keys(o).sort(), ["error", "i", "mark", "notes", "row"]);
  assert.deepEqual(out[0].row, { who_type: "교구", group: "화평", sub: "3", name: "홍길동", position: "명예권사" });
  assert.deepEqual(out[4].row, { who_type: "교구", group: "화평", sub: "1", name: "x,y", position: "" });   // 모양 틀린 줄도 다듬은 값을 보인다
  assert.equal(out[4].error, "bad-char");
  assert.ok(!JSON.stringify(out).includes("U1"), "계정 id 는 화면에 싣지 않는다");

  const recs = uploadRecords(it, "ev-1", "2026-09-29T00:00:00.000Z");
  assert.deepEqual(recs.map((x) => x.i), [0, 2]);
  assert.deepEqual(recs[0].rec, {
    event_id: "ev-1", user_id: "U1", ident_key: "교구|화평|3|||홍길동", who_type: "교구", group_name: "화평", sub_name: "3",
    name: "홍길동", position: "명예권사", note: UPLOAD_TAG, source: "import", updated_at: "2026-09-29T00:00:00.000Z",
  });
  assert.equal(UPLOAD_TAG, "명단 올리기");
  assert.equal(FILL_TAG, "소속: 교인명부로 채움");
  assert.equal(recs[1].rec.note, "명단 올리기 / 소속: 교인명부로 채움");
  assert.equal(recs[1].rec.user_id, null);
  assert.equal(new Set(recs.map((x) => Object.keys(x.rec).sort().join(","))).size, 1, "묶음 insert 는 칸이 같아야 한다(PGRST102)");
});

test("lookupName — 다듬기 · 이름 키(띄어쓰기 없음·완성형) · 판정표 코드(no-name·bad-char·too-long)", () => {
  assert.deepEqual(lookupName("  홍  길동 "), { name: "홍 길동", key: "홍길동", error: null });
  assert.equal(lookupName("홍길동".normalize("NFD")).key, "홍길동");
  assert.equal(lookupName("").error, "no-name");
  assert.equal(lookupName(null).error, "no-name");
  assert.equal(lookupName("홍,길동").error, "bad-char");
  assert.equal(lookupName("홍|길동").error, "bad-char");
  assert.equal(lookupName("홍,길동").key, "", "틀린 이름은 명부에 묻지 않는다");
  assert.equal(lookupName("가".repeat(41)).error, "too-long");
  assert.equal(lookupName("가".repeat(40)).error, null);
  assert.equal(LOOKUP_MAX, 20);
});

test("lookupOut — 교인명부 한 분 → 다섯 칸(이름·구분·소속·세부·직분)만 · 화면 이름 group·sub", () => {
  const o = lookupOut({ ...P({ name_key: "홍길동", mok1: "화평", mok3: "화평-20목장", position: "권사", position_detail: "은퇴협동권사" }), name: " 홍길동 " });
  assert.deepEqual(o, { name: "홍길동", who_type: "교구", group: "화평", sub: "20", position: "은퇴권사" });
  assert.deepEqual(Object.keys(o).sort(), ["group", "name", "position", "sub", "who_type"]);
  // 아이는 가족의 교구·목장이 아니라 부서로 — 가족 교구 값이 따라 나가지 않는다
  const kid = lookupOut({ ...P({ name_key: "홍길동", kind2: "교회학교", mok1: "화평", mok3: "화평-20목장", school_dept: "중등부" }), name: "홍길동" });
  assert.deepEqual(kid, { name: "홍길동", who_type: "교회학교", group: "중등부", sub: "", position: "" });
  assert.ok(!JSON.stringify(kid).includes("화평"));
});

// ---------- 목장이 비었거나 99 인 줄 — 채우기를 켜고 다시 올려도, 앱의 99 줄이 있어도 두 번 넣지 않는다(최종 검토 I1) ----------
import { looseIndex } from "../supabase/functions/church-admin/events-upload.ts";

// 넣은 줄 → 회차 명단(서버가 event_signups 에서 읽는 모양) — 판정에 쓰는 칸만
const asSignups = (items) => uploadRecords(items, "ev-1", "2026-09-30T00:00:00.000Z").map((x) => x.rec);
const idxOf = (signups) => ({
  eventKeys: new Set(signups.map((r) => r.ident_key)),
  eventUids: new Set(signups.map((r) => r.user_id).filter(Boolean)),
  users: new Map(),
  loose: looseIndex(signups),
});

test("judgeUpload — 채우기 끄고 올린 뒤(목장 빈 채) 채우기 켜고 다시 올리면 채운 줄도 이미 있음(채우기 전 줄의 키로도 본다)", () => {
  const raws = [R("홍길동", "화평", "", "집사")];
  // ① 채우기 끔 — 목장이 빈 채로 넣는다
  const first = judgeUpload(tidyUpload(raws), NO_IDX);
  assert.deepEqual(first.map((x) => x.mark), ["add"]);
  const signups = asSignups(first);
  assert.equal(signups[0].ident_key, "교구|화평||||홍길동");
  // ② 같은 글을 채우기 켜고 — 교인명부(화평 20)로 목장을 채워도 같은 분
  const again = applyFill(tidyUpload(raws), new Map([["홍길동", [P({ name_key: "홍길동", mok1: "화평", mok3: "화평-20목장", position: "집사" })]]]));
  assert.equal(again[0].mark, "fill");
  assert.equal(again[0].row.sub_name, "20");
  judgeUpload(again, idxOf(signups));
  assert.deepEqual(again.map((x) => x.mark), ["same"], JSON.stringify(again[0].notes));
  assert.ok(again[0].notes.some((n) => n.includes("이미 있어요")));
  assert.deepEqual(uploadRecords(again, "ev-1", "t"), [], "두 번째 올리기는 아무것도 넣지 않는다");
  // 느슨한 색인이 없어도(옛 서버 모양) 채우기 전 줄의 정본 키만으로 막힌다 — 필수 고침 ①
  const again2 = applyFill(tidyUpload(raws), new Map([["홍길동", [P({ name_key: "홍길동", mok1: "화평", mok3: "화평-20목장" })]]]));
  judgeUpload(again2, { eventKeys: new Set(signups.map((r) => r.ident_key)), eventUids: new Set(), users: new Map() });
  assert.deepEqual(again2.map((x) => x.mark), ["same"]);
});

test("judgeUpload — 채운 줄이 파일 안 앞줄(채우기 전 목장이 빈 줄)과 같은 분이면 접는다", () => {
  const it = applyFill(tidyUpload([R("홍길동", "화평", "", "집사"), R("홍길동", "화평", "", "")]),
    new Map([["홍길동", [P({ name_key: "홍길동", mok1: "화평", mok3: "화평-20목장", position: "집사" })]]]));
  judgeUpload(it, NO_IDX);
  assert.deepEqual(it.map((x) => x.mark), ["fill", "same"]);
  assert.ok(it[1].notes.some((n) => n.includes("위 1번 줄")));
});

test("judgeUpload — 교구 줄은 한쪽 목장이 비었거나 99 면 구분|교구|이름으로 같은 분(99↔20 · 빈칸↔20) · 번호끼리 다르면 다른 분 · 교회학교는 안 느슨하다", () => {
  const signups = [
    { ident_key: "교구|화평|99|||홍길동", user_id: null, who_type: "교구", group_name: "화평", sub_name: "99", name: "홍길동" },   // 앱 로그인 「목장 없음」
    { ident_key: "교구|소망|20|||성춘향", user_id: null, who_type: "교구", group_name: "소망", sub_name: "20", name: "성춘향" },
    { ident_key: "교구|믿음|3|||이몽룡", user_id: null, who_type: "교구", group_name: "믿음", sub_name: "3", name: "이몽룡" },
    { ident_key: "교회학교|||중등부||임꺽정", user_id: null, who_type: "교회학교", group_name: "중등부", sub_name: "", name: "임꺽정" },
  ];
  const it = tidyUpload([
    R("홍길동", "화평", "20"),      // 0 이미 — 회차의 앱 줄이 99
    R("성춘향", "소망", ""),        // 1 이미 — 올리는 줄의 목장이 비었다(회차는 20)
    R("성춘향", "소망", "99"),      // 2 이미 — 99 도 같다
    R("이몽룡", "믿음", "4"),       // 3 넣음 — 번호끼리(3·4)는 다른 분
    R("임꺽정", "교회학교", "중등부"), // 4 이미 — 정본 키가 같다(교회학교)
    R("홍길동", "사랑", ""),        // 5 넣음 — 다른 교구
    R("장보고", "은혜", ""),        // 6 넣음
    R("장보고", "은혜", "12"),      // 7 이미 — 파일 안 앞줄(목장 빈칸)과 같은 분
    R("장길산", "기쁨", "5"),       // 8 넣음
    R("장길산", "기쁨", "99"),      // 9 이미 — 파일 안 앞줄(5)과 99
    R("장길산", "기쁨", "6"),       // 10 넣음 — 앞줄 5 와는 번호끼리 다르다(99 줄은 접혀 없다)
  ]);
  judgeUpload(it, idxOf(signups));
  assert.deepEqual(it.map((x) => x.mark),
    ["same", "same", "same", "add", "same", "add", "add", "same", "add", "same", "add"], JSON.stringify(it.map((x) => x.notes)));
  assert.ok(it[7].notes.some((n) => n.includes("위 7번 줄")));
  assert.ok(it[9].notes.some((n) => n.includes("위 9번 줄")));
  assert.ok(it[0].notes.some((n) => n.includes("이미 있어요")));
});

// ---------- 읽기만 하는 이름(👤 이력 · 이름을 누르면 evPerson) — 괄호·쉼표가 든 옛 이름도 받는다(최종 검토 SEC-7 · 2026-09-30) ----------
import { readName } from "../supabase/functions/church-admin/events-upload.ts";

test("readName — 괄호·쉼표가 든 옛 이름(「홍길동(구)」)도 받는다 · 큰따옴표·역슬래시·세로줄만 bad-char · 빈 이름 · 41자", () => {
  assert.deepEqual(readName("홍길동(구)"), { name: "홍길동(구)", key: "홍길동(구)", error: null });
  assert.deepEqual(readName("  홍  길동 "), { name: "홍 길동", key: "홍길동", error: null });
  assert.equal(readName("홍길동".normalize("NFD")).key, "홍길동");
  assert.equal(readName("홍,길동").error, null);
  for (const bad of ['홍"길동', "홍" + String.fromCharCode(92) + "길동", "홍|길동"]) {   // 92 = 역슬래시
    assert.equal(readName(bad).error, "bad-char", bad);
    assert.equal(readName(bad).key, "", "틀린 이름은 묻지 않는다: " + bad);
  }
  assert.equal(readName("  ").error, "no-name");
  assert.equal(readName(null).error, "no-name");
  assert.equal(readName("가".repeat(41)).error, "too-long");
  assert.equal(readName("가".repeat(40)).error, null);
  // 한 분 더하기의 찾기(lookupName)는 새 이름을 적는 길이라 그대로 막는다
  assert.equal(lookupName("홍길동(구)").error, "bad-char");
  assert.equal(lookupName("홍,길동").error, "bad-char");
});

// ---------- 아이 줄의 빈 직분 때문에 교인명부를 읽지 않는다(kid-position-reads-directory · 2026-09-30) ----------
test("fillNames — 교회학교 부서 줄(청년부 빼고)은 직분·학년이 비어도 묻지 않는다 · 청년부 줄은 직분이 비면 묻는다", () => {
  const it = tidyUpload([R("하카", "교회학교", "유년", ""), R("타파", "청년부", "", ""), R("차카", "교회학교", "", "")]);
  assert.equal(it[0].row.group_name, "유년부");
  assert.equal(it[1].row.group_name, "청년부");
  assert.deepEqual(fillNames(it).sort(), ["차카", "타파"].sort(), "부서가 빈 교회학교 줄(소속 없음)은 묻는다");
});

test("applyFill — 아이 줄(교회학교 유년부 · 직분 빈칸)은 명부 후보가 있어도 건드리지 않는다(넣음 그대로 · 교인명부 알림 없음)", () => {
  const it = tidyUpload([R("하카", "교회학교", "유년", ""), R("파카", "교회학교", "중등부", "")]);
  applyFill(it, new Map([
    ["하카", [P({ name_key: "하카", kind2: "교회학교", school_dept: "유년부", position: "학생" })]],
    ["파카", [P({ name_key: "파카", mok1: "화평", mok3: "화평-5목장", position: "권사" })]],
  ]));
  assert.deepEqual(it.map((x) => x.mark), ["add", "add"]);
  assert.deepEqual(it[0].row, { who_type: "교회학교", group_name: "유년부", sub_name: "", name: "하카", position: "" });
  assert.equal(it[0].filled, false);
  for (const x of it) assert.ok(!x.notes.some((n) => n.includes("교인명부")), JSON.stringify(x.notes));
});

// ---------- applyFill 의 갈래 둘(applyfill-branches-untested · 2026-09-30) ----------
test("applyFill — 교구 칸이 빈 줄을 명부로 채웠는데 명부 목장이 없으면 적힌 목장을 비우고 알린다", () => {
  const it = tidyUpload([R("아차", "", "21", "")]);
  applyFill(it, new Map([["아차", [P({ name_key: "아차", mok1: "화평", mok3: "화평", position: "권사" })]]]));
  assert.equal(it[0].mark, "fill");
  assert.deepEqual(it[0].row, { who_type: "교구", group_name: "화평", sub_name: "", name: "아차", position: "권사" });
  assert.ok(it[0].notes.some((n) => n.includes("적힌 목장 21 대신 교인명부처럼 목장을 비웠어요")), JSON.stringify(it[0].notes));
});

test("applyFill — 명부 값이 명단 모양에 맞지 않으면(부서 「유년부(1)」) 채우지 않고 알린다", () => {
  const it = tidyUpload([R("가다")]);
  const before = { ...it[0].row };
  applyFill(it, new Map([["가다", [P({ name_key: "가다", kind2: "교회학교", school_dept: "유년부(1)" })]]]));
  assert.equal(it[0].mark, "blank");
  assert.equal(it[0].filled, false);
  assert.deepEqual(it[0].row, before);
  assert.ok(it[0].notes.some((n) => n.includes("교인명부 값이 명단 모양에 맞지 않아 채우지 않았어요")), JSON.stringify(it[0].notes));
});
