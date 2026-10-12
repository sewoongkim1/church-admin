# 사역 이력 · 📮 정정 신청 · 📊 사역 통계 (교회 어드민)

> CLAUDE.md 에서 옮겨 온 상세 기록이다(2026-10-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다).
> **언제 읽나:** 📜 사역 이력(`ministry_history` · `history-match.ts`·`history-db.ts`)·📮 정정 신청(`historyRequest*`)·부서 이음표(`tools/history/`)·📊 사역 통계(`ministry-stats.ts`)를 손볼 때. 이 표를 지워 달라는 요청은 CLAUDE.md 「비상 절차 ②-1」
> ⚠️ 여기 ⚠️ 표시는 대부분 **실제로 한 번씩 사고를 겪고** 남긴 것이다. 요약해 옮기지 말고 그대로 둘 것.
> 원문에서 「v2 …」·「성경암송 `…`」라고 적은 경로는 형제 저장소 `bible-memorize-church-app-v2` 의 파일이다 — 그쪽에도 `docs/notes/` 가 있으니 이 저장소의 노트와 헷갈리지 말 것.

---

## CLAUDE.md 에서 옮김 2026-10-12

> 원문 그대로다(2026-10-12, 두 겹으로 나눔 — 내용은 한 글자도 안 고쳤다). 절 제목 줄만 한 단계 낮췄다(`##` → `###`).
> 들여쓰기·굵은 글씨도 그대로다. 지금 상태는 CLAUDE.md 의 그 절 한두 줄을 볼 것.

### 사역 이력 (2026-10-01)
지난 해 사역 임명 명단(엑셀 · 2022~2026, 더 오래된 해도)을 올려 교인명부의 교인ID 와 잇는다. 메뉴 「📜 사역 이력」(`js/menus/ministry/history.js` · 역할 `ministry`).
설계 v2 `docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md` · 계획 v2 `docs/superpowers/plans/2026-10-01-church-admin-ministry-history.md`.
- 표 `ministry_history`·`ministry_history_imports`·함수 `ministry_history_apply`(SQL 005) — 서버만. 맞춤 규칙은 `history-match.ts`(순수), 표 쪽은 `history-db.ts`(`makeHistory` · npm import 없음 — 교인명부 세션이 import 한다).
- ⚠️ **교인명부 세션(자세히 창 사역 탭)이 이 표를 person_id 로 읽고 「이분 것」으로 고친다** — 칸 이름·`historyLinkPatch`·`historyUnlinkPatch`·`rematchHistoryRows(db, ids)` 를 바꾸면 그쪽도(설계 §7).
- ⚠️ `person_id` 는 `directory`·`super` 응답에만(`rowOut(r, full)`). 사역신청 역할의 「이분」은 후보 차례 번호 + 지문 `fp`(화면 글자로 만든 FNV — 교인ID 로 만들지 않는다).
- ⚠️ `link_how` `manual`·`none` 은 자동 맞춤이 덮지 않는다. 다시 맞추기는 **모든 해를 함께** 계산한다(다른 해 같은 팀 「유지」가 근거라 해 하나만 돌리면 결과가 달라진다).
- 같은 줄 열쇠 `src_key`(해|부서|팀|이름|목장|직분)는 올린 그대로 — 고쳐도 안 바뀐다. 빼기는 `deleted_at` 표시만(다시 올려도 안 되살아난다).
- 진짜 원본 엑셀은 저장소 밖으로 옮겼다(2026-10-01 친구) — 대조 도구는 `python tools/history/check_real.py <명단 엑셀> [교인명부 정리 엑셀]` 로 경로를 준다.
- 2025년 이전 명단의 「기쁨-1」은 목장 모름으로 읽는다(검증 추정 · 2026-10-01 친구 확인) — 바뀌면 `parseRow` 한 줄과 시험만.
- 규칙을 바꾸면 이 PC 에서 `python tools/history/check_real.py` — 진짜 명부·통합 엑셀로 수와 검증 지적 64줄을 맞대 본다(2026-09-29 명부 기준 4,042 · 51 · 수만 찍는다).
- **부서 이음표(2026-10-06 · 사역 통계 준비 — 아직 표·화면은 없다):** `python tools/history/dept_lineage_draft.py` — 통합 엑셀 둘(2010~2026 · 17,971줄)을 읽어 `C:\Projects\Data\정리\부서이음표_2차.xlsx`(저장소 밖 · 사람 이름 없음)를 만든다.
  해마다 달리 적힌 부서 97가지·부서-팀 쌍 541가지를 **큰 분류(찬양 · 교회학교 · 그 밖 — 목양·기관은 따로) → 계열 21 → 표준 팀** 으로 잇는다.
  1차의 물음 17가지에 친구가 답했다(같은 날 · 그 파일의 `ANSWER` — 답이 적힌 엑셀은 `부서이음표_초안_답_2026-10-06.xlsx`): **「부설기관」 계열에 복지재단·봉사센터 · 도서관 · 시니어학교 · 샬롬부·사랑부** · 찬양부 아래 중보기도팀은 전도·중보기도 · 주보간지는 예배. 남은 확인 셋은 `OPEN`.
  ⚠️ 부서를 **이름만 보고 잇지 말 것** — 그 파일의 `EVENTS` 처럼 팀까지 내려가 앞뒤 해 사람 흐름으로 확인한다(이름으로 미뤘다가 세 번 틀렸다). ⚠️ 친구가 답을 적은 엑셀 위에 다시 만들지 말 것 — 새 판은 다른 이름으로.
  설계·근거는 성경암송 `docs/analysis/2026-10-06-ministry-stats-options.md` · `2026-10-06-work-ministry-dept-lineage-draft.md`.
- **📊 사역 통계(2026-10-06 운영 · 메뉴 `mn-stats` · 역할 ministry + 총괄 · 읽기만):** 설계 v2 `docs/superpowers/specs/2026-10-06-ministry-stats-design.md` · 계획 `…/plans/2026-10-06-ministry-stats.md`.
  SQL 013(`mh_key` · 표 `ministry_dept_map` 이음표 · `ministry_list_gaps` 명단이 일부인 해 · 함수 `ministry_stats_facts()` — 사람을 그 부름 안의 번호로 바꾼 재료 jsonb 하나) + 013b(이음표 씨앗 493줄 — `dept_lineage_draft.py --seed-sql` 로 다시 만든다) → 서버 `ministry-stats.ts`(순수 `buildStats` · 세는 규칙 전부) → 액션 `ministryStats` → 화면 `js/menus/ministry/stats.js`(+ `stats-logic.js`).
  ⚠️ 응답·화면에 이름·교인ID·사람 번호·태어난 해를 싣지 않는다(묶음 숫자와 부서·팀 이름뿐 · 시험이 지킨다). 나이·성별·직분은 그 해 봉사자 30명부터, 1~4명 칸은 「5 미만」.
  ⚠️ 명단이 일부인 해(`ministry_list_gaps`)는 견주는 해로 쓰지 않는다 — 안 그러면 「돌아옴」이 부풀려진다. 지금 넷은 **숫자로 미룬 후보**(사역 담당 확인 전) — 확인이 오면 이 표를 고친다. `tools/history/stats_check.py` 의 GAPS 도 같이.
  ⚠️ 떠난 분을 가르는 못 이은 까닭 글자(`history-match.ts` R_NONE·R_KID·R_MISFIT·R_HAND_NONE·R_MANUAL_NONE)가 SQL 013 에도 있다 — 바꾸면 둘 다(`tests/ministry-stats.test.mjs` 가 맞댄다).
  진짜 자료 대조(이 PC): `python tools/history/stats_check.py` — 통합 엑셀로 TS 세기와 따로 센 값을 맞댄다(2026-10-06: 7,803칸 같음 · 이름 기준 어림이라 운영 수와는 다르다).
  운영 반영 2026-10-06: SQL 013·013b → 함수(내려받아 대조 뒤) → 푸시(5bd97f0). 재료 17,848줄 · 이음표에 없는 쌍 0 · 교인 1,682 · 떠난 분 577 · 못 정한 197(운영 묶음 수).
- 개발 DB 씨앗: `node --experimental-strip-types tests/seed-history-dev.mjs [--clean]`(source_file `ca-demo-seed`).
- 쓰기 액션은 쓴 뒤 바로 기록하고, 다시 맞추기는 try/catch — 실패하면 응답 rematched:false(화면이 「🔄 다시 맞추기」를 권한다).
- 줄 응답의 in_directory(true/false/null) — 이어 둔 분이 지금 명부에 없으면 화면에 「⚠ 명부에 없음」. 12월 새 명부 뒤 「🔄 다시 맞추기」.
- ⚠️ **12월 새 명부 뒤**: 떠난 분에게 자동으로 이어진 줄은 다시 맞추기(🔄 · 또는 아무 올리기 — 올리기도 모든 자동 줄을 다시 맞춘다)가 비우거나 동명이인에게 옮길 수 있다(「⚠ 명부에 없음」은 사람이 이은 줄에만 남는다) — 🔄 전에 「근거 약한 줄만」으로 확인(설계 §3.3 · 처리는 12월 새 명부 때 정하기로 2026-10-01 친구 결정).
- 개인정보 안내 `privacy.html` 8번(+6번 쓰는 곳·보는 사람·기록) — 모으는 것·보는 사람이 바뀌면 함께.
- 올리기 살펴보기(`historyUploadCheck`)도 교인명부에 묻는다 — 새 줄이 있고 명부가 있으면 `people.lookup`(`from:"history-check"` · `{asked, askedNames(상한 없음 — 한 번에 받는 줄이 이미 HISTORY_MAX_UPLOAD 로 묶인다), count}`) 한 줄(「교인명부 기록」 · 이어진 수가 생년·등록연도의 답이 된다 · 2026-10-01 최종 검토). 줄 창 후보는 `from:"history"`(지금 이어진 분을 끝에 더했으면 `extra:1`) · 고치기 창에서 후보에 영향 줄 칸을 고쳐 다시 맞췄으면 `from:"history-edit"`(`{q: 고친 뒤 이름, count: 이번에 이어졌으면 1 아니면 0}`).
- 여러 해를 넣으면 묶음마다 받은 수는 다른 해로 이어진 줄을 못 센다 — 화면은 넣은 뒤 다시 불러온 해마다 요약으로 최종 수를 보인다. 새 줄은 「아직 맞추지 않음 — 🔄 다시 맞추기」 사유로 들어가고 다시 맞추기가 덮는다.
- 찾기 칸(2026-10-02 · `history-db.ts` `historyFilter` — 목록·내려받기 공용 · 40자): 빈칸·「+」·「,」로 가른 낱말이 **모두** 맞는 줄(낱말마다 이름·목장·부서·팀·직책·직분 중 하나 · 목장 끝 「목장」은 떼고도 본다 · 동명이인은 「이름 목장」으로). `#숫자` 는 교인ID — `directory`·`super` 만(사역신청 역할은 `need-directory` · 화면 안내 「교인ID 는 #번호」도 full 일 때만) · `#` 없는 숫자는 글자(목장 번호). 내려받기 기록은 `search:true` 만.
- 한 번에 3,000줄(`HISTORY_MAX_UPLOAD`) · 화면은 해마다 나눠 보낸다(`sendParts`). 「이분」·「이분 아님」·「되돌리기」는 줄의 `updated_at` 을 `expect` 로 보낸다(없으면 잠그지 않는다 — 교인명부 세션 옛 부름). `ministry_history_apply` 는 읽었던 맞춤 상태(`old_*`)까지 맞아야 쓴다.
- 나중: 「이력으로 넘기기」(2027 임명확정 → 이 표 · `order_id` · 교인ID 는 교인명부 세션의 `people_links` 에서) — 설계 §8.

### 「⚠️ 함정」 절에서 옮김 — 📮 정정 신청 · `ministry_history_requests`

- **「📮 정정 신청」**(`historyRequestList`·`historyRequestSet`·`historyRequestDelete`): 응답에 `user_id`·`person_id`·`handled_by` 를 싣지 않는다(`requestAdminOut`) · 「반영 안 함」 답 필수 · `not_mine` 반영은 `verified` · 상태로 거를 때 `.in()` 금지(「확인 중」 빈칸). 설계 v2 `docs/superpowers/specs/2026-10-01-ministry-history-requests-admin-design.md`.
  - **빠진 사역(2026-10-02):** 「반영」하면 그 해 `ministry_history` 에 `req:<신청 id>` 줄(본인 교인ID · `manual` · 직분은 교적)을 넣고, 「반영」에서 벗어나면 그 줄만 뺀다(`history-db.ts` `applyMissingRequest`·`undoMissingRequest`). 담당자가 창의 「사역 이력에 넣을 내용」(연도·부서·팀·직책 · `line` · 줄의 `updated_at` 잠금)을 고쳐 넣는다 — 성도님 글(`year`·`team_text`·`committee_text`)은 그대로 둔다.
    ⚠️ 빼 둔 `req:` 줄은 **마지막 `history.delete` 기록이 `from:"request"` 일 때만** 되살린다 — 📜 사역 이력에서 손으로 뺀 줄·신청 삭제(`why:"request-deleted"`)로 뺀 줄은 `history-removed`. 그래서 `req:` 줄을 SQL 로 빼거나 되살리지 말 것(기록이 안 남아 판정이 틀어진다).
  - **「삭제」**(`historyRequestDelete`): 신청 줄을 지우고(DELETE · 되돌릴 수 없다) 그 신청의 살아 있는 `req:` 줄은 빼 둔 줄로. 기록 `history.request.delete` 는 `{id, kind, status}` 만.
  - **두 칸(SQL 009 `committee_text`):** `null` = 옛 한 칸 신청(`team_text` 를 `parseTeamText` 로 나눔) · 글자 = 두 칸(나누지 않음) — `requestDraft` 한 곳. 배포 차례 SQL 009 → 이 함수 → 성경암송 `api` → 앱.
- **`ministry_history_requests` 에는 성경암송 쪽 트리거 `redirect_merged_member_write` 가 붙어 있다**(2026-10-02 · 앱 계정 합치기 `member_merge.sql`). 이 표를 지웠다 다시 만들면 성경암송 `supabase/member_merge.sql` 을 다시 돌릴 것 · `REQ_OPEN` 글자(「신청」·「확인 중」)나 부분 unique 색인 조건을 바꾸면 `member_merge.sql` 도 함께 고칠 것 (합치기는 새 계정에 같은 줄 열린 신청이 있으면 옛 계정 열린 신청을 지우고, 나머지는 user_id 만 옮긴다).
