-- 성경암송 앱 「사역 이력 확인」 빠진 사역 신청 — 「부서」「팀」 두 칸 (2026-10-02 친구 요청 「네 두칸으로 해주세요」)
--   지금까지는 칸 하나(team_text · 「부서 · 팀」 · 보기 「찬양위원회 시온성가대」)에 적어 받아 담당자 쪽이 나눴다(history-db.ts parseTeamText).
--   이제 부서는 committee_text, 팀은 team_text 에 따로 받는다.
--     committee_text = null  : 옛 한 칸 신청(이 파일 전에 들어온 것 · 옛 캐시 앱) — team_text 에 「부서·팀」 글, 나눠서 읽는다
--     committee_text = 글자  : 두 칸 신청(빈 글자도) — committee_text 가 부서, team_text 가 팀(빈 글자일 수 있다) · 나누지 않는다
--   규칙을 정하는 곳: 교회 어드민 history-check.ts parseRequest(둘 중 하나는 · 칸마다 100자) · 성경암송 app.js mhCheck 가 따라 한다.
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 배포 차례: 이 SQL → church-admin 함수(committee_text 를 읽고 쓴다 — 칸이 없으면 신청 넣기·목록이 모두 막힌다)
--    → 성경암송 api(committee_text 를 넘긴다) → 성경암송 앱(두 칸).
--    칸만 더해 두는 것은 안전하다 — 옛 함수는 이 칸을 모르고, 넣지 않으면 null(옛 한 칸 신청과 같은 뜻)이다.
-- ⚠️ 권한: 008 이 표에 RLS 를 켜고 정책 없이 anon·authenticated 권한을 모두 뺐다(service role 만). 표 단위 revoke 라 새 칸에도
--    그대로 걸린다 — 따로 grant·revoke 할 것이 없다(칸 권한을 주지 말 것 · 운영 카카오 로그인 — authenticated = 카카오 계정만 있으면 누구나).
-- 여러 번 돌려도 안전하다(if not exists).
-- 실행: supabase --workdir <작업 폴더> db query --linked -f C:/Projects/church-admin/supabase/sql/009_ministry_history_requests_committee.sql
begin;

alter table ministry_history_requests
  add column if not exists committee_text text
    constraint mhr_committee_text_len check (committee_text is null or char_length(committee_text) <= 100);

comment on column ministry_history_requests.committee_text is
  '빠진 사역 「부서」 칸(2026-10-02 두 칸). null = 옛 한 칸 신청(team_text 에 「부서·팀」 글 — 나눠서 읽는다) · 글자(빈 글자도) = 두 칸 신청(committee_text 부서 · team_text 팀 — 나누지 않는다).';

commit;

select column_name, data_type, is_nullable from information_schema.columns
 where table_name = 'ministry_history_requests' and column_name = 'committee_text';
