-- 다른 앱(메모 · 유튜브 노트 · 요약 · 질문 기록 · 활동 기록)의 표를 「그 앱 허가 명단」에 묶는다 (2026-09-28)
--
-- 까닭: 통합 프로젝트에 있는 이 다섯 표의 정책은 「로그인한 사람(authenticated)이면」 열려 있었다
--   (memos · youtube_notes 는 전부 읽기, 나머지는 자기 줄 읽기·쓰기). 교회 관리 화면이 카카오 로그인을 켜면
--   카카오 계정만 있으면 누구나 authenticated 가 된다. 관리 화면의 승인은 church-admin 함수에만 걸려 있어,
--   로그인 토큰으로 DB 에 바로 묻는 길(/rest/v1/memos)은 막지 못한다 — 표의 정책에도 허가를 걸어야 한다.
-- 방법: 그 앱 전용 허가 명단(legacy_app_users)을 만들고, **지금 있는 이메일 로그인 계정**을 그 자리에서 넣는다
--   (계정 id 를 이 파일에 적지 않는다 — 공개 저장소). 다섯 표의 정책에 「명단에 있는 사람만」을 AND 로 더한다.
--   그 앱의 사용자는 늘지 않는다(친구 확인 2026-09-28). 늘려야 하면:
--     insert into public.legacy_app_users (user_id) values ('<auth.users 의 id>');
-- ⚠️ 개발 먼저, 그다음 운영. 여러 번 돌려도 안전하다 — 정책은 원래 조건을 다시 적어 통째로 바꾸므로 AND 가 겹쳐 쌓이지 않는다.
-- ⚠️ 이메일로 **새로** 가입한 사람은 명단에 없다 — Supabase 는 이메일 새 가입만 따로 끌 수 없어서(전체 가입을 끄면
--    카카오도 막힌다) 가입이 아니라 명단으로 막는다.
-- 실행: supabase --workdir <작업 폴더> db query --linked -f C:/Projects/church-admin/supabase/sql/002_gate_legacy_app_tables.sql
begin;

create table if not exists public.legacy_app_users (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.legacy_app_users enable row level security;
revoke all on public.legacy_app_users from anon, authenticated;
-- 정책 안의 exists(...) 는 부르는 사람 권한으로 돈다 — 자기 줄 하나만 보이게 읽기를 연다
grant select on public.legacy_app_users to authenticated;
drop policy if exists "legacy app users read own row" on public.legacy_app_users;
create policy "legacy app users read own row" on public.legacy_app_users
  for select to authenticated using (user_id = auth.uid());

-- ⚠️ **처음 한 번만** 채운다(명단이 비어 있을 때만). 조건 없이 두면 이 파일을 다시 돌릴 때마다 그사이 이메일로
--    가입한 사람까지 명단에 들어간다 — 개발에서 다시 돌렸더니 4명이 5명이 됐다(2026-09-28).
insert into public.legacy_app_users (user_id)
select id from auth.users
where coalesce(raw_app_meta_data->>'provider', '') = 'email'
  and not exists (select 1 from public.legacy_app_users)
on conflict (user_id) do nothing;

alter policy "users read own activity" on public.activity_log
  using ((auth.uid() = user_id)
         and exists (select 1 from public.legacy_app_users l where l.user_id = auth.uid()));
alter policy "users insert own activity for today" on public.activity_log
  with check ((auth.uid() = user_id) and (occurred_on = ((now() at time zone 'Asia/Seoul'))::date)
              and exists (select 1 from public.legacy_app_users l where l.user_id = auth.uid()));
alter policy "users select own chat history" on public.chat_history
  using ((auth.uid() = user_id)
         and exists (select 1 from public.legacy_app_users l where l.user_id = auth.uid()));
alter policy "users insert own chat history" on public.chat_history
  with check ((auth.uid() = user_id)
              and exists (select 1 from public.legacy_app_users l where l.user_id = auth.uid()));
alter policy "users read own digests" on public.digests
  using ((auth.uid() = user_id)
         and exists (select 1 from public.legacy_app_users l where l.user_id = auth.uid()));
alter policy "authenticated users select all memos" on public.memos
  using (exists (select 1 from public.legacy_app_users l where l.user_id = auth.uid()));
alter policy "authenticated users select all youtube notes" on public.youtube_notes
  using (exists (select 1 from public.legacy_app_users l where l.user_id = auth.uid()));

commit;

select (select count(*) from public.legacy_app_users) as allowed_users,
       (select count(*) from pg_policies where schemaname = 'public'
          and tablename in ('memos', 'youtube_notes', 'activity_log', 'chat_history', 'digests')
          and coalesce(qual, '') || coalesce(with_check, '') like '%legacy_app_users%') as gated_policies;
