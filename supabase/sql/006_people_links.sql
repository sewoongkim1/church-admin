-- 교회 어드민 — 기록과 교인을 잇는 표(잇기 표 · 2026-10-01)
--   설계: bible-memorize-church-app-v2 docs/superpowers/specs/2026-10-01-person-history-tabs-design.md §2.1 · §3
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf · 친구 허락 뒤 · 계획 Task 11).
-- ⚠️ 서버(church-admin 함수의 service role)만 읽고 쓴다 — RLS 켜고 정책 없음 · anon·authenticated 권한 뺌.
--    운영은 카카오 로그인이 켜져 있다(authenticated = 카카오 계정만 있으면 누구나) — TO authenticated 로 열지 않는다.
-- ⚠️ 앱 표(ministry_orders·event_signups)에 칸을 더하지 않는다 — 이 표가 그 줄 id 를 가리킨다(FK 없음: 앱 줄·명부가 지워져도 남는다).
-- link_how 는 b6 「사역 이력」(ministry_history)과 같은 말: auto(규칙이 정함 · 다시 맞추기가 바꾼다) · manual(사람이 「이분 것」) · none(사람이 「이분 아님」).
-- ⚠️ manual·none 은 자동이 절대 덮지 않는다 — 자동 쓰기는 아래 people_links_auto() 하나로만 한다(on conflict 의 where 가 막는다).
--    사람의 쓰기(peopleLink)는 서버가 이 표에 바로 upsert 한다.
-- 여러 번 돌려도 안전하다(if not exists · create or replace).
begin;

create table if not exists people_links (
  kind        text   not null check (kind in ('order','signup')),  -- order = ministry_orders · signup = event_signups
  row_id      bigint not null,                                     -- 그 표의 id(FK 없음)
  person_id   int,                                                 -- 교인ID · null = 못 맞춤/이분 아님 · FK 없음(명부가 바뀌어도 줄은 남는다)
  link_how    text   not null default 'auto' check (link_how in ('auto','manual','none')),
  match_basis text   not null default '',                          -- 「맞음」·「번호」·「사람이 이음」
  import_id   bigint,                                              -- auto 일 때 맞춘 명부(church_people_imports.id)
  linked_by   uuid references admin_members(id) on delete set null,
  linked_at   timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (kind, row_id)
);
create index if not exists people_links_person_idx on people_links (person_id) where person_id is not null;
alter table people_links enable row level security;
revoke all on people_links from anon, authenticated;

-- 자동 잇기 쓰기 — [{kind,row_id,person_id,match_basis,import_id}, …] 를 넣거나 **auto 줄만** 고친다. 넣거나 고친 줄 수를 돌려준다.
-- ⚠️ 한 번에 같은 (kind,row_id) 가 두 번 오면 오류다(on conflict 가 한 줄을 두 번 못 고친다) — 부르는 쪽(people-links.ts)이 줄마다 하나로 만든다.
create or replace function people_links_auto(p_rows jsonb) returns int
language sql
set search_path = public
as $$
  with x as (
    select r->>'kind' as kind, (r->>'row_id')::bigint as row_id, (r->>'person_id')::int as person_id,
           coalesce(r->>'match_basis', '') as match_basis, (r->>'import_id')::bigint as import_id
    from jsonb_array_elements(p_rows) r
  ), up as (
    insert into people_links (kind, row_id, person_id, link_how, match_basis, import_id, updated_at)
    select kind, row_id, person_id, 'auto', match_basis, import_id, now() from x
    on conflict (kind, row_id) do update
      set person_id = excluded.person_id, match_basis = excluded.match_basis,
          import_id = excluded.import_id, updated_at = now()
      where people_links.link_how = 'auto'
    returning 1
  )
  select count(*)::int from up
$$;
revoke execute on function people_links_auto(jsonb) from public, anon, authenticated;
grant execute on function people_links_auto(jsonb) to service_role;

commit;

select 'people_links 줄' as t, count(*)::text as v from people_links
union all select 'RLS 켜짐(true)', relrowsecurity::text from pg_class where oid = 'public.people_links'::regclass
union all select 'anon 읽기(false)', has_table_privilege('anon', 'public.people_links', 'SELECT')::text
union all select 'authenticated 읽기(false)', has_table_privilege('authenticated', 'public.people_links', 'SELECT')::text
union all select 'anon 함수(false)', has_function_privilege('anon', 'public.people_links_auto(jsonb)', 'EXECUTE')::text
union all select 'authenticated 함수(false)', has_function_privilege('authenticated', 'public.people_links_auto(jsonb)', 'EXECUTE')::text;
