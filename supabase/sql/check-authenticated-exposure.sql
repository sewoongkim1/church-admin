-- 운영에서 카카오 로그인을 켜기 **전에** 본다:
--   「로그인만 하면(카카오 계정만 있으면 누구나) 공개 키(anon)보다 더 할 수 있는 것」
-- ✅ 통과 = 0행. 한 줄이라도 나오면 그 자리를 막은 뒤(개발 → 운영) 로그인을 켠다.
-- ⚠️ Supabase 는 public 의 새 표마다 anon·authenticated 에 기본 GRANT 를 준다 —
--    그래서 「권한이 있나」가 아니라 「로그인한 쪽만 더 할 수 있나」(정책·권한 차이)로 가른다.
-- 실행(CLI 는 마지막 SELECT 하나만 보여 주므로 한 문장으로 묶었다 · -f 는 **절대 경로**):
--   supabase --workdir <작업 폴더> db query --linked -f C:/Projects/church-admin/supabase/sql/check-authenticated-exposure.sql
select * from (
  -- ① authenticated 에게만 열린 정책 — 명령 종류(SELECT·INSERT·UPDATE·DELETE·ALL) 무관, 모든 스키마(storage 포함)
  select '1 로그인 전용 정책' as kind, p.schemaname as schema_name, p.tablename as name,
         p.policyname || ' · ' || p.cmd || ' · ' || p.permissive || ' · ' || array_to_string(p.roles, ',') as detail
  from pg_policies p
  where 'authenticated' = any(p.roles) and not ('anon' = any(p.roles) or 'public' = any(p.roles))
  union all
  -- ② 조건 안에서 로그인 여부를 보는 정책(public·authenticated 에 걸린 것) — auth.role()·auth.uid()·auth.jwt()
  select '2 조건에 auth.*', p.schemaname, p.tablename,
         p.policyname || ' · ' || p.cmd || ' · ' || p.permissive
  from pg_policies p
  where ('public' = any(p.roles) or 'authenticated' = any(p.roles))
    and (coalesce(p.qual, '') ~ 'auth\.(role|uid|jwt)' or coalesce(p.with_check, '') ~ 'auth\.(role|uid|jwt)')
  union all
  -- ③ RLS 가 꺼진 표(또는 RLS 대상이 아닌 뷰)에서 authenticated 만 가진 권한
  select '3 RLS 없이 로그인 전용 권한', n.nspname, c.relname,
         concat_ws(',',
           case when has_table_privilege('authenticated', c.oid, 'SELECT') and not has_table_privilege('anon', c.oid, 'SELECT') then 'SELECT' end,
           case when has_table_privilege('authenticated', c.oid, 'INSERT') and not has_table_privilege('anon', c.oid, 'INSERT') then 'INSERT' end,
           case when has_table_privilege('authenticated', c.oid, 'UPDATE') and not has_table_privilege('anon', c.oid, 'UPDATE') then 'UPDATE' end,
           case when has_table_privilege('authenticated', c.oid, 'DELETE') and not has_table_privilege('anon', c.oid, 'DELETE') then 'DELETE' end)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage') and c.relkind in ('r', 'p', 'v', 'm')
    and (c.relkind in ('v', 'm') or not c.relrowsecurity)
    and ((has_table_privilege('authenticated', c.oid, 'SELECT') and not has_table_privilege('anon', c.oid, 'SELECT'))
      or (has_table_privilege('authenticated', c.oid, 'INSERT') and not has_table_privilege('anon', c.oid, 'INSERT'))
      or (has_table_privilege('authenticated', c.oid, 'UPDATE') and not has_table_privilege('anon', c.oid, 'UPDATE'))
      or (has_table_privilege('authenticated', c.oid, 'DELETE') and not has_table_privilege('anon', c.oid, 'DELETE')))
  union all
  -- ④ authenticated 만 부를 수 있는 함수(RPC) — SECURITY DEFINER 면 표 권한을 건너뛴다
  select '4 로그인 전용 함수', n.nspname, p.proname,
         pg_get_function_identity_arguments(p.oid) || case when p.prosecdef then ' · SECURITY DEFINER' else '' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'storage')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE')
  union all
  -- ⑤ auth.users 에 걸린 트리거 — 카카오로 처음 로그인할 때마다 발동한다(다른 앱 표에 행을 만들 수 있다)
  select '5 가입 트리거', 'auth', t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t
  where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal
) x
order by 1, 2, 3;
