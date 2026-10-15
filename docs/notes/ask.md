# 🤖 성도 묻기 (시험판 · 2026-10-15)

> **언제 읽나:** 「성도 묻기」 메뉴(`js/menus/people/ask.js`) · 서버 `askPeople`·`askPeopleRun` · 규약 `supabase/functions/church-admin/ask-people.ts` 를 손볼 때.
> 설계는 형제 저장소 v2 `docs/superpowers/specs/2026-10-15-pastor-ai-ask-design.md`(필드 목록 규약 · Claude ↔ 서버 규약 · 할 수 없는 조건 · 다른 서버 자료),
> 흐름도 v2 `자료/ai-ask/AI-성도조회-흐름도.html`.

말로 물으면 교인명부 · 사역 이력에서 찾는다. **AI(Claude)는 질문을 조건(JSON)으로 바꾸기만** 하고, 명단은 서버가 표에서 직접 거른다.
지금은 **총괄(super)만** 보인다 — 담임목사 역할 · 무엇을 물을 수 있게 할지(뜻)는 교회가 정한 뒤(Claude Docs 「AI 성도 조회 — 뜻을 정해 주실 것」).

## 흐름
1. 화면 → `askPeople {question}` → 서버가 재료(교인명부 · 사역 이력 · 부서 이음표 `ministry_dept_map` · 명단이 일부인 해 `ministry_list_gaps`)를 읽어 10분 담아 둔다.
2. Claude(`ASK_MODEL` 기본 `claude-haiku-5-5`(2026-10-15 친구 결정 — 비용 · 시크릿 ASK_MODEL 로 코드 없이 바꾼다) · effort low · 구조화 출력 `output_config.format`)에 **질문 + 지시문(필드 목록 · 교구·구분·부서 이름) + 스키마**만 보낸다.
3. 돌아온 조건을 `checkTree` 가 검사 — 필드 목록에 없거나 범위 밖 · 명부에 없는 값은 `unsupported`(까닭 다섯: no_data · out_of_range · not_allowed · judgment · too_complex).
4. 갈래: `ok` → 셈 · `partial` → **세지 않고 멈춘다**(화면 「나머지 조건으로만 찾기」 → `askPeopleRun`) · `none` → 「찾을 수 있는 조건이 없어요」.
5. 칩의 × · 「나머지 조건으로만」은 `askPeopleRun {tree}` — **AI 를 다시 부르지 않고** 같은 검사를 다시 거쳐 센다(화면을 믿지 않는다).
6. 기록: `people.ask {q(앞 120자), status, total}` · `people.ask.run {status, total, dropped}` — 「바꾼 기록」의 교인명부 기록.

## ⚠️ 함정
- **AI 에게 가는 글은 `askSystemPrompt` · `askSchema` 둘뿐이다.** 사람 자료(이름 · 교인ID · 나이 · 목장 이름)를 넣지 말 것 — `tests/ask-people.test.mjs` 가 지시문에 이름·목장이 없는지 본다. 지시문의 예시에도 실제 있을 법한 목장 이름을 쓰지 않는다.
- **스키마에 null 갈래 칸(anyOf · 타입 배열)을 두지 말 것.** 갈래 칸이 많으면 API 가 400 「Schemas contains too many parameters with union types」(2026-10-15 개발에서 24칸으로 걸림).
  「안 씀」은 정해 둔 값 — num -1 · years_ago -1 · text "" · list [] · within 셋 다 0 · dept level "none". 시험이 갈래 칸 0을 지킨다.
- 구조화 출력은 재귀 · `minimum`/`maximum` 을 못 쓴다 → 트리는 묶음 셋(all·any·none)에 펼치고 범위는 서버가 본다.
- 값 목록(교구 · 부서 이름)은 스키마가 아니라 지시문에 — 스키마가 늘 같아야 컴파일 캐시(24시간)가 산다.
- 해는 AI 가 셈하지 않게 `years_ago`(0 = 올해)로 받는다 · 「올해」는 서버의 KST 날짜.
- **사역 이력은 교인명부에 있는 분 · 교인ID 로 이어진 줄만 센다**(운영 2026-10-15: 17,848줄 중 15,769줄). 떠난 분 · 못 이은 줄은 빠진다 — 화면 아래 「셈」 줄이 수를 보인다.
- 「N해 이하」·「잇따라 N해 이하」는 **섬긴 적 있는 분 중에서** · 「= 0」은 한 번도 안 섬긴 분.
- 잇따라 섬긴 해는 **명단이 일부인 해**(`ministry_list_gaps` — 전체 `*` 2021 · `g:교회학교` · `f:재정`)를 끊긴 것으로 보지 않는다(부서를 그쪽으로 걸었을 때만 g:·f:).
- 지시문에는 **기록 범위 안의** 일부 해만 말한다(범위 밖 해를 말하면 AI 가 그 해를 기록이 있는 해로 오해했다 · 개발 2026-10-15).
- 거절 대비 서버 쪽 대체(`fallbacks: "default"` · beta `server-side-fallback-2026-07-01`)는 **Opus · Sonnet · Fable 일 때만** 켠다(Haiku 는 서버 쪽 대체가 없어 400 — 매번 한 번 헛걸음이 된다). 그 조합이 400 이면 대체 없이 한 번 더 부른다.
- 실패 응답에 API 오류 문장 한 줄(`msg`)을 싣는다(총괄만 보는 응답 · 키·사람 자료 없음).
- 성경필사는 아직 교인과 이어진 줄이 거의 없어(2026-10-15 운영: 2,833줄 중 5줄) 필드로 넣지 않았다 — 지시문에서 no_data 로 보낸다. 「🔗 기록 잇기 맞추기」 뒤에 필드로 더한다.
- 새 액션 둘은 `ACTION_ROLES` + `case` + `tests/server.dev.test.mjs` PROBE(빈 질문 · 트리 없음 — 재료도 AI 도 안 부른다) + `tests/authz.test.mjs` super 목록.

## 개발에서 확인(2026-10-15)
개발 DB(가짜 교인 99 · 사역 이력 2024~2026)에서 시험 계정으로 질문 다섯 — 4~11초 · 범위 밖(10년)은 out_of_range 로 멈춤 → 「나머지로만」 78명 ·
「요즘 예배에 잘 안 나오시는」은 no_data · 빈 질문은 no-question. 스크립트는 저장소 밖(시험 계정을 만들고 지운다).
