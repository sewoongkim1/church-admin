-- 운영에서 카카오 로그인을 켜기 **전에** 본다:
--   「로그인만 하면(카카오 계정만 있으면 누구나) 공개 키(anon)보다 더 할 수 있는 것」
-- ✅ 통과 = 0행. 한 줄이라도 나오면 그 자리를 막은 뒤(개발 → 운영) 로그인을 켠다.
-- ⚠️ Supabase 는 public 의 새 표마다 anon·authenticated 에 기본 GRANT 를 준다 —
--    그래서 「권한이 있나」가 아니라 「로그인한 쪽만 더 할 수 있나」(정책·권한 차이)로 가른다.
-- 실행(CLI 는 마지막 SELECT 하나만 보여 주므로 한 문장으로 묶었다 · -f 는 **절대 경로**):
--   supabase --workdir <작업 폴더> db query --linked -f C:/Projects/church-admin/supabase/sql/check-authenticated-exposure.sql
-- 보는 것 여섯 가지:
--   ① authenticated 에게만 열린 정책 — 명령 종류 무관, storage 포함
--   ② 정책 조건 안에서 auth.role()·auth.uid()·auth.jwt()·auth.email()·request.jwt() 로 로그인 여부를 가르는 것
--   ③ authenticated 만 가진 표 권한(GRANT) — RLS 켜짐·꺼짐·뷰 가리지 않고 전부 본다
--      (RLS 켜짐 + `TO public USING(true)` 정책 + anon 만 SELECT 를 뺀 경우도 여기서 잡힌다)
--   ④ authenticated 만 실행할 수 있는 함수(RPC) — SECURITY DEFINER 면 표 권한을 건너뛴다
--   ⑤ auth.users 에 걸린 가입 트리거
--   ⑥ anon·authenticated 둘 다 실행할 수 있지만 함수 몸통 안에서 auth.*()·request.jwt() 로 갈리는 함수
-- 빼고 보는 것(2026-09-28): 다른 앱 표 다섯을 「그 앱 허가 명단」에 묶은 정책(조건에 legacy_app_users 가 든 것)과
--   그 명단 표 자체(자기 줄만 읽는 정책 · authenticated SELECT) — 002_gate_legacy_app_tables.sql 이 일부러 둔 것이다.
--   ⚠️ 정책 조건에 legacy_app_users 만 넣고 다른 길을 열면 여기서 안 보인다 — 그 표들의 정책을 고칠 때는 이 점검을 믿지 말고 눈으로 볼 것.
select * from (
  -- ① authenticated 에게만 열린 정책 — 명령 종류(SELECT·INSERT·UPDATE·DELETE·ALL) 무관, 모든 스키마(storage 포함)
  select '1 로그인 전용 정책' as kind, p.schemaname as schema_name, p.tablename as name,
         p.policyname || ' · ' || p.cmd || ' · ' || p.permissive || ' · ' || array_to_string(p.roles, ',') as detail
  from pg_policies p
  where 'authenticated' = any(p.roles) and not ('anon' = any(p.roles) or 'public' = any(p.roles))
    and not (p.schemaname = 'public' and p.tablename = 'legacy_app_users')
    and coalesce(p.qual, '') || coalesce(p.with_check, '') not like '%legacy_app_users%'
  union all
  -- ② 조건 안에서 로그인 여부를 보는 정책(public·authenticated 에 걸린 것) — auth.role()·auth.uid()·auth.jwt()·auth.email()·request.jwt()
  select '2 조건에 auth.*', p.schemaname, p.tablename,
         p.policyname || ' · ' || p.cmd || ' · ' || p.permissive
  from pg_policies p
  where ('public' = any(p.roles) or 'authenticated' = any(p.roles))
    and (coalesce(p.qual, '') ~ 'auth\.(role|uid|jwt|email)|request\.jwt' or coalesce(p.with_check, '') ~ 'auth\.(role|uid|jwt|email)|request\.jwt')
    and not (p.schemaname = 'public' and p.tablename = 'legacy_app_users')
    and coalesce(p.qual, '') || coalesce(p.with_check, '') not like '%legacy_app_users%'
  union all
  -- ③ authenticated 만 가진 표 권한 — RLS 가 켜져 있어도 본다(RLS 켜짐 + TO public USING(true) 정책 +
  --   anon 만 SELECT 뺀 경우 로그인한 사람은 전부 읽는데 ①·②는 못 잡는다)
  select '3 로그인 전용 권한', n.nspname, c.relname,
         concat_ws(',',
           case when has_table_privilege('authenticated', c.oid, 'SELECT') and not has_table_privilege('anon', c.oid, 'SELECT') then 'SELECT' end,
           case when has_table_privilege('authenticated', c.oid, 'INSERT') and not has_table_privilege('anon', c.oid, 'INSERT') then 'INSERT' end,
           case when has_table_privilege('authenticated', c.oid, 'UPDATE') and not has_table_privilege('anon', c.oid, 'UPDATE') then 'UPDATE' end,
           case when has_table_privilege('authenticated', c.oid, 'DELETE') and not has_table_privilege('anon', c.oid, 'DELETE') then 'DELETE' end)
         || (case when c.relkind in ('v', 'm') then ' · 뷰' when c.relrowsecurity then ' · RLS 켜짐' else ' · RLS 꺼짐' end)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage') and c.relkind in ('r', 'p', 'v', 'm')
    and not (n.nspname = 'public' and c.relname = 'legacy_app_users')
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
  union all
  -- ⑥ anon·authenticated 둘 다 실행할 수 있지만 몸통 안에서 auth.*()·request.jwt() 로 갈리는 함수 —
  --   GRANT 는 같아서 ④는 못 잡는다. 함수 정의 글자 그대로를 본다.
  select '6 함수 안에서 로그인 확인', n.nspname, p.proname,
         pg_get_function_identity_arguments(p.oid) || case when p.prosecdef then ' · SECURITY DEFINER' else '' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'storage')
    and p.prokind in ('f', 'p')
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and pg_get_functiondef(p.oid) ~ 'auth\.(role|uid|jwt|email)|request\.jwt'
) x
order by 1, 2, 3;
