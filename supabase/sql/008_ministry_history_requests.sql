-- 성경암송 앱 「사역 이력 확인」 정정 신청 (2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-ministry-history-check-design.md §5.1)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 서버(church-admin 함수의 service role)만 읽고 쓴다 — 성경암송 api 는 church-admin 내부 갈래를 거쳐서만 닿는다.
--    RLS 를 켜고 정책을 두지 않으며 anon·authenticated 권한을 뺀다(운영 카카오 로그인 — authenticated = 카카오 계정만 있으면 누구나).
-- ⚠️ user_id·history_id·person_id 에 FK 를 걸지 않는다 — 계정이 합쳐지거나, 기록 줄을 빼 두거나, 새 명부에서 빠져도 신청은 남는다.
-- ⚠️ kind·status 글자는 교회 어드민 history-check.ts 와 성경암송 app.js MH_* 가 같은 글자를 쓴다(세 곳) — 하나만 고치면 저장이 막힌다.
-- 2026-10-01 「직분이 틀려요」(wrong_position) 뺌 — 직분은 교적 기준(운영에 돌리기 전이라 파일을 고쳤다 · 개발은 제약을 다시 만들었다).
-- 여러 번 돌려도 안전하다(if not exists).
-- 실행: supabase --workdir <작업 폴더> db query --linked -f C:/Projects/church-admin/.worktrees/history-check/supabase/sql/008_ministry_history_requests.sql
begin;

create table if not exists ministry_history_requests (
  id          bigserial primary key,
  user_id     uuid not null,                       -- 앱 계정(users.id) — 어떤 응답에도 싣지 않는다
  person_id   int,                                 -- 신청 때 찾은 교인ID(찾지 못했으면 null)
  history_id  bigint,                              -- 정정할 줄(ministry_history.id) — 줄 정정만
  kind        text not null check (kind in ('not_mine', 'wrong_team', 'other', 'missing', 'find_me')),
  detail      text not null default '' check (char_length(detail) <= 200),
  year        int check (year between 1950 and 2100),                  -- missing 의 연도
  team_text   text not null default '' check (char_length(team_text) <= 100),   -- missing 의 「부서·팀」 글
  who_type    text not null default '',            -- 신청 때 로그인 소속·이름 사본(담당자가 찾을 때)
  who_group   text not null default '',            -- 교구 또는 부서
  who_sub     text not null default '',            -- 목장 또는 학년
  who_name    text not null default '',
  status      text not null default '신청' check (status in ('신청', '확인 중', '반영', '반영 안 함')),
  answer      text not null default '' check (char_length(answer) <= 300),   -- 담당자가 적은 말(반영 안 함의 사유 등)
  handled_by  uuid references admin_members(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint mhr_line_chk check ((kind in ('not_mine', 'wrong_team', 'other')) = (history_id is not null)),
  constraint mhr_missing_chk check ((kind = 'missing') = (year is not null))
);
create index if not exists mhr_user_idx   on ministry_history_requests (user_id);
create index if not exists mhr_status_idx on ministry_history_requests (status, created_at);
-- 같은 때 두 번 눌러도 하나만(서버가 먼저 세지만, 동시에 들어온 둘은 여기서 막힌다 → 23505 → already-open)
create unique index if not exists mhr_open_line_uq on ministry_history_requests (user_id, history_id)
  where history_id is not null and status in ('신청', '확인 중');
create unique index if not exists mhr_open_find_uq on ministry_history_requests (user_id)
  where kind = 'find_me' and status in ('신청', '확인 중');

alter table ministry_history_requests enable row level security;
revoke all on ministry_history_requests from anon, authenticated;
revoke all on sequence ministry_history_requests_id_seq from anon, authenticated;

commit;
