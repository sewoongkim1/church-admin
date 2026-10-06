-- 교회 어드민 — 📊 사역 통계 (2026-10-06 · 설계 v2 docs/superpowers/specs/2026-10-06-ministry-stats-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf). 여러 번 돌려도 안전하다(if not exists · or replace · on conflict).
-- ⚠️ 서버(church-admin 함수의 service role)만 읽는다. 표는 RLS 를 켜고 정책을 두지 않으며 anon·authenticated 권한을 뺀다. 함수도 service_role 만.
-- 무엇: ① 부서 이음표(부서·팀 → 큰 분류·계열·중분류·표준 팀) ② 명단이 일부인 해 ③ 통계의 재료 한 묶음을 내는 함수.
--   세는 일은 여기서 하지 않는다 — supabase/functions/church-admin/ministry-stats.ts(순수 · 시험)가 센다.
--   이음표의 줄은 013b_ministry_dept_map_seed.sql(tools/history/dept_lineage_draft.py --seed-sql 이 만든다)로 넣는다.
begin;

-- 글자 다듬기 — 사역 이력의 같은 줄 열쇠(history-match.ts nospace)와 같은 규칙: NFC · 띄어쓰기 없음.
--   자바스크립트 \s 에 드는 줄바꿈 없는 빈칸(U+00A0)·전각 빈칸(U+3000)도 함께 없앤다.
create or replace function public.mh_key(t text) returns text
  language sql immutable set search_path = public
  as $$ select regexp_replace(normalize(coalesce(t, ''), NFC), '[\s 　]+', '', 'g') $$;

-- ① 부서 이음표 — (부서, 팀) → 큰 분류 · 계열 · 중분류 · 표준 팀
create table if not exists ministry_dept_map (
  committee_key text not null,                 -- mh_key(부서 원문)
  team_key      text not null,                 -- mh_key(팀 원문)
  big_group     text not null check (big_group in ('찬양', '교회학교', '그 밖', '목양', '기관')),
  family        text not null,                 -- 계열(이름이 바뀌거나 합치고 나뉜 부서를 한 선으로)
  mid           text not null default '',      -- 중분류(찬양 · 교회학교 · 부설기관만)
  team_std      text not null,                 -- 표준 팀
  note          text not null default '',
  source        text not null default 'seed' check (source in ('seed', 'admin')),   -- admin = 화면에서 고친 줄(씨앗이 덮지 않는다)
  updated_at    timestamptz not null default now(),
  primary key (committee_key, team_key)
);

-- ② 명단이 일부인 해 — 그 해는 견주는 해로 쓰지 않는다(없다고 「쉼」으로 세면 다음 해 「돌아옴」이 부풀려진다).
--   scope: '*' = 그 해 전체 · 'g:교회학교' = 큰 분류(와 그 안의 계열) · 'f:재정' = 계열. year_to null = 그 뒤로 계속.
create table if not exists ministry_list_gaps (
  scope     text not null,
  year_from int  not null check (year_from between 1950 and 2100),
  year_to   int  check (year_to is null or year_to between year_from and 2100),
  note      text not null default '',
  primary key (scope, year_from)
);
-- 처음 넣는 넷 — 숫자로 미루어 본 후보다(사역 담당 확인 전 · 부서 이음표 2차 「남은 확인 N02」). 확인이 오면 이 표를 고친다.
insert into ministry_list_gaps (scope, year_from, year_to, note) values
  ('*',          2021, 2021, '부서 12곳만 실렸다 — 선교부·총무부·새가족양육부·M-12 가 통째로 없고 찬양이 25줄'),
  ('g:교회학교', 2014, 2014, '부서는 다 있는데 부서마다 인원이 얇다(136줄 · 앞뒤 해 248·194)'),
  ('g:교회학교', 2023, 2024, '부서마다 인원이 얇다(89줄 · 71줄 · 앞뒤 해 177·167)'),
  ('f:재정',     2022, null, '2022년부터 명단에 거의 싣지 않는다(2021년 44줄 → 0~4줄)')
on conflict (scope, year_from) do nothing;

alter table ministry_dept_map  enable row level security;
alter table ministry_list_gaps enable row level security;
revoke all on ministry_dept_map, ministry_list_gaps from anon, authenticated;

-- ③ 통계의 재료 — jsonb 하나(줄을 받아 세면 PostgREST 1,000줄 한도에 걸린다).
--   사람은 이 부름 안에서만 뜻이 있는 번호(dense_rank)로 바꾼다 — 교인ID·이름은 함수 밖으로 나가지 않는다.
--   사람 종류: m = 교인명부에 있는 분 · g = 떠난 분 · u = 아직 못 정함.
--     g: 교인ID 가 붙었지만 지금 명부에 없는 분 · 담당자가 「이분 아님」(link_how none) · 못 이은 까닭이 아래 넷으로 시작하는 줄
--        (history-match.ts 의 R_NONE · R_KID·R_MISFIT 의 앞머리 · R_HAND_NONE · R_MANUAL_NONE — 글자가 바뀌면 여기도. tests/ministry-stats.test.mjs 가 맞댄다)
--     u: 그 밖의 못 이은 줄(「누군지 못 가림」·「아직 맞추지 않음」) — 같은 이름·같은 목장 글자일 때만 같은 분으로 본다.
--   직분: 교인은 교적의 지금 직분 · 떠난 분·못 정한 분은 명단의 그때 직분(가장 늦은 해).
create or replace function public.ministry_stats_facts() returns jsonb
  language sql stable set search_path = public
as $$
with h0 as (
  select h.year, h.committee, h.team, public.mh_key(h.committee) as ck, public.mh_key(h.team) as tk,
         h.person_id, h.position as row_position, public.mh_key(h.name) as nk, public.mh_key(h.mok) as mk,
         (p.person_id is not null) as in_church,
         (h.link_how = 'none'
           or h.match_reason like '교인명부에 같은 이름이 없음%'
           or h.match_reason like '교인명부의 같은 이름은%'
           or h.match_reason like '같은 목장·이름 줄을 담당자가%'
           or h.match_reason like '이분 아님%') as gone_reason,
         coalesce(extract(year from p.birth_date)::int, nullif(substring(p.birth from '^(\d{4})'), '')::int) as birth_year,
         coalesce(p.gender, '') as gender,
         p.position as church_position
    from ministry_history h
    left join church_people p on p.person_id = h.person_id
   where h.deleted_at is null
),
h as (
  select h0.*,
         case when h0.person_id is not null then (case when h0.in_church then 'm' else 'g' end)
              when h0.gone_reason then 'g' else 'u' end as kind,
         case when h0.person_id is not null then 'm:' || h0.person_id::text
              when h0.gone_reason then 'g:' || upper(h0.nk)
              else 'u:' || upper(h0.nk) || '|' || h0.mk end as pkey
    from h0
),
m as (
  select h.*,
         coalesce(d.big_group, '그 밖') as big_group, coalesce(d.family, '미정') as family, coalesce(d.mid, '') as mid,
         coalesce(d.team_std, nullif(btrim(h.team), ''), '(팀 이름 없음)') as team_std,
         (d.committee_key is null) as unmapped
    from h left join ministry_dept_map d on d.committee_key = h.ck and d.team_key = h.tk
),
maps as (
  select big_group, family, mid, team_std, (row_number() over (order by big_group, family, mid, team_std) - 1)::int as mno
    from (select distinct big_group, family, mid, team_std from m) x
),
ppl as (
  select m.pkey, (dense_rank() over (order by m.pkey) - 1)::int as pno,
         -- 종류는 한 사람에 하나 — 같은 열쇠의 줄이 갈리면(없어야 한다) 교인 > 떠난 분 > 못 정함 차례로
         case when bool_or(m.kind = 'm') then 'm' when bool_or(m.kind = 'g') then 'g' else 'u' end as kind,
         max(m.birth_year) as birth_year, max(m.gender) as gender,
         coalesce(max(m.church_position), (array_agg(m.row_position order by m.year desc))[1], '') as position_text
    from m group by m.pkey
)
select jsonb_build_object(
  'years',  coalesce((select jsonb_agg(y order by y) from (select distinct year as y from m) t), '[]'::jsonb),
  'map',    coalesce((select jsonb_agg(jsonb_build_array(big_group, family, mid, team_std) order by mno) from maps), '[]'::jsonb),
  'seats',  coalesce((select jsonb_agg(jsonb_build_array(ppl.pno, m.year, maps.mno))
                        from m join ppl on ppl.pkey = m.pkey
                               join maps on maps.big_group = m.big_group and maps.family = m.family and maps.mid = m.mid and maps.team_std = m.team_std), '[]'::jsonb),
  'people', coalesce((select jsonb_agg(jsonb_build_array(kind, case when kind = 'm' and birth_year between 1900 and 2100 then birth_year end,
                                                         case when kind = 'm' then gender else '' end, position_text) order by pno) from ppl), '[]'::jsonb),
  'gaps',   coalesce((select jsonb_agg(jsonb_build_array(scope, year_from, year_to) order by scope, year_from) from ministry_list_gaps), '[]'::jsonb),
  'unmapped', coalesce((select jsonb_agg(jsonb_build_array(committee, team, n) order by n desc, committee, team)
                          from (select committee, team, count(*)::int as n from m where unmapped group by committee, team) u), '[]'::jsonb),
  'source_date', (select max(source_date)::text from church_people_imports)
)
$$;
revoke all on function public.mh_key(text) from public, anon, authenticated;
revoke all on function public.ministry_stats_facts() from public, anon, authenticated;
grant execute on function public.mh_key(text) to service_role;
grant execute on function public.ministry_stats_facts() to service_role;

commit;

-- 확인(수만) — 표 줄 수 · 열린 권한(0이어야) · 재료의 크기
select 'ministry_dept_map 줄' as t, count(*)::text as v from ministry_dept_map
union all select 'ministry_list_gaps 줄', count(*)::text from ministry_list_gaps
union all select 'anon·authenticated 표 권한(0이어야)', count(*)::text from information_schema.role_table_grants
  where table_name in ('ministry_dept_map', 'ministry_list_gaps') and grantee in ('anon', 'authenticated')
union all select '함수를 anon·authenticated·PUBLIC 이 부름(0이어야)', count(*)::text from information_schema.routine_privileges
  where routine_name in ('ministry_stats_facts', 'mh_key') and grantee in ('anon', 'authenticated', 'PUBLIC')
union all select '재료 — 자리(줄)', jsonb_array_length(f->'seats')::text from (select public.ministry_stats_facts() as f) x
union all select '재료 — 사람', jsonb_array_length(f->'people')::text from (select public.ministry_stats_facts() as f) x
union all select '재료 — 이음표에 없는 쌍', jsonb_array_length(f->'unmapped')::text from (select public.ministry_stats_facts() as f) x;
