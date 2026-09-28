-- 로그인한 사용자(authenticated)가 읽을 수 있는 표·뷰 — 운영에서 카카오 로그인을 켜기 **전에** 본다.
--   supabase --workdir <작업 폴더> db query --linked -f supabase/sql/check-authenticated-exposure.sql
-- 읽는 법:
--   · anon_select = true 인 줄은 이미 공개 키로도 읽히는 것 — 새로 생기는 노출이 아니다(따로 판단).
--   · anon_select = false 인데 이 목록에 나온 줄이 **문제**다: 로그인만 하면(카카오든 이메일 가입이든) 누구나 읽는다.
--     → revoke select … from authenticated, 또는 정책을 고친 뒤에 로그인을 켠다.
--   · 뷰는 RLS 대상이 아니다(security_invoker = on 이 아니면 만든 사람 권한으로 돈다).
with rels as (
  select c.oid, n.nspname as schema, c.relname as name, c.relkind, c.relrowsecurity as rls,
         coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'off') as invoker
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
), pol as (
  select schemaname, tablename, string_agg(policyname || '(' || array_to_string(roles, ',') || ')', ', ') as policies
  from pg_policies
  where cmd in ('SELECT', 'ALL') and ('authenticated' = any(roles) or 'public' = any(roles))
  group by 1, 2
)
select case r.relkind when 'v' then '뷰' when 'm' then '구체화 뷰' else '표' end as kind,
       r.name, r.rls, r.invoker,
       has_table_privilege('anon', r.oid, 'SELECT') as anon_select,
       p.policies
from rels r
left join pol p on p.schemaname = r.schema and p.tablename = r.name
where has_table_privilege('authenticated', r.oid, 'SELECT')
  and (r.relkind in ('v', 'm') or not r.rls or p.policies is not null)
order by anon_select, kind, r.name;
