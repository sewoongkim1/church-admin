-- 읽기만 · 성도 묻기 견주기용 「값 목록」 — 이름 · 연락처 · 교인ID 를 꺼내지 않는다(묶음 값과 수만)
-- 운영에서 한 번(supabase db query --linked -o json -f tools/ask-eval/vocab.sql > <저장소 밖>/vocab-raw.json) → build-vocab.mjs
select json_build_object(
  'users', (select count(*) from users),
  'p', (select json_agg(x) from (select mok1, mok3, kind2, count(*) n from church_people group by 1,2,3) x),
  'h', (select json_agg(x) from (
         select h.year, h.committee, h.team, bool_or(c.person_id is not null) linked
         from ministry_history h left join church_people c on c.person_id = h.person_id
         where h.deleted_at is null group by 1,2,3) x),
  'm', (select json_agg(x) from (select committee_key, team_key, big_group, family, mid, team_std from ministry_dept_map) x),
  'g', (select json_agg(x) from (select scope, year_from, year_to from ministry_list_gaps) x),
  'e', (select json_agg(x) from (
         select e.id, e.title, e.opens_on, e.status,
                exists(select 1 from event_signups s join people_links l on l.kind='signup' and l.row_id=s.id
                       where s.event_id=e.id and l.person_id is not null and l.link_how <> 'none') linked
         from events e) x)
) as v;
