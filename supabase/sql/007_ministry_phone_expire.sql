-- 교회 어드민 — 사역신청 휴대폰 번호 180일 자동 지우기(2026-10-01)
--   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §6
-- 결정(임명확정·미채택·취소 — decided_at 이 찍힌 줄) 뒤 180일이 지나면 번호를 지운다.
-- 담당자가 신청 현황 「결정된 신청 번호 지우기」를 잊어도 개인정보 안내의 약속(늦어도 180일)이 지켜지게.
-- ⚠️ 개발 먼저. 개발엔 pg_cron 이 없다(2026-10-01 확인) — 그때는 함수만 만들고 예약은 건너뛴다(notice 한 줄). 운영엔 있다(daily-push).
-- ⚠️ 매일 18:17 UTC = 03:17 KST(pg_cron 은 UTC 로 돈다). 같은 이름으로 다시 부르면 예약을 고쳐 쓴다(pg_cron 1.4+).
-- ⚠️ security definer — 누가 부르든 표를 고친다. 그래서 public·anon·authenticated 실행 권한을 뺀다(서버·예약만).
-- ⚠️ 배포 다음 날 cron.job_run_details 로 실제로 돌았는지 본다(계획 Task 11).
begin;

create or replace function ministry_phone_expire() returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update ministry_orders set phone = null, updated_at = now()
   where phone is not null and decided_at < now() - interval '180 days';
  get diagnostics n = row_count;
  return n;
end
$$;
revoke execute on function ministry_phone_expire() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ministry-phone-expire', '17 18 * * *', 'select public.ministry_phone_expire()');
  else
    raise notice 'pg_cron 이 없다 — 함수만 만들고 예약은 건너뛴다(개발)';
  end if;
end
$$;

commit;

select 'anon 실행(false)' as t, has_function_privilege('anon', 'public.ministry_phone_expire()', 'EXECUTE')::text as v
union all select 'authenticated 실행(false)', has_function_privilege('authenticated', 'public.ministry_phone_expire()', 'EXECUTE')::text
union all select '함수 주인(postgres)', (select proowner::regrole::text from pg_proc where proname = 'ministry_phone_expire')
union all select 'pg_cron 있음(운영 1 · 개발 0)', (select count(*)::text from pg_extension where extname = 'pg_cron');
