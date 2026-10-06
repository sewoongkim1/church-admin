-- 교회 어드민 — 봉사 당번 역할 둘 · 당번별 담당자(2026-10-06 · 설계 v2 docs/superpowers/specs/2026-10-06-duty-roster-design.md §3·§4)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 성경암송 저장소 supabase/duty.sql(duty_boards)이 먼저 들어가 있어야 한다 — 이 표가 당번을 가리킨다.
-- 역할 둘:
--   duty     = 당번 총괄 — 당번 만들기·이름·상태(준비·보관) · 담당자 지정 · 모든 당번의 자리·명단
--   dutylead = 당번 담당(맡은 당번) — duty_board_staff 에 (당번, 나) 줄이 있는 당번의 자리 틀·날짜·쉬는 날·명단·확정·대신 넣기·엑셀
--     「맡은 당번만」은 서버(duty-db.ts mayTouch)가 지킨다(not-assigned) — 화면에서 숨기는 것만으로 끝내지 않는다.
-- duty_board_staff 는 관리 화면에만 있는 개념이라 성경암송 duty.sql 이 아니라 여기 둔다(교육의 edu_course_staff · 011 과 같은 자리).
-- 이 표는 서버(church-admin 함수의 service role)만 읽고 쓴다 — RLS 를 켜고 정책을 두지 않으며 public·anon·authenticated 권한을 뺀다.
--   ⚠️ 2026-09-28 부터 authenticated = 카카오 계정만 있으면 누구나 — TO authenticated 로 열지 말 것.
-- 여러 번 돌려도 안전하다(if not exists · on conflict).
begin;

insert into admin_roles (id, label, description) values
  ('duty',     '당번 총괄',           '봉사 당번 만들기·이름·상태 · 당번별 담당자 지정 · 모든 당번의 자리·명단'),
  ('dutylead', '당번 담당(맡은 당번)', '맡은 당번의 자리 틀·날짜·쉬는 날 · 명단·확정 · 대신 넣기 · 엑셀')
on conflict (id) do update set label = excluded.label, description = excluded.description;

create table if not exists public.duty_board_staff (
  board_id   uuid not null references public.duty_boards(id) on delete cascade,
  member_id  uuid not null references public.admin_members(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (board_id, member_id)
);
-- 「내가 맡은 당번」(dutyBoardList · 담당 확인)을 사람으로 찾는다 — 당번 쪽은 기본 키가 받는다
create index if not exists duty_board_staff_member_idx on public.duty_board_staff (member_id);

alter table public.duty_board_staff enable row level security;
revoke all on public.duty_board_staff from public, anon, authenticated;
grant select, insert, update, delete on public.duty_board_staff to service_role;

commit;

-- 확인(CLI 는 마지막 SELECT 하나만 보여 준다 — 한 줄로 묶었다)
--   기대: 당번 총괄 · 당번 담당(맡은 당번) · rls_on true · anon·authenticated 권한 false · service_role true
select
  (select label from admin_roles where id = 'duty') as duty_label,
  (select label from admin_roles where id = 'dutylead') as dutylead_label,
  (select relrowsecurity from pg_class where oid = 'public.duty_board_staff'::regclass) as rls_on,
  has_table_privilege('anon', 'public.duty_board_staff', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.duty_board_staff', 'select') as authenticated_select,
  has_table_privilege('authenticated', 'public.duty_board_staff', 'insert') as authenticated_insert,
  has_table_privilege('service_role', 'public.duty_board_staff', 'delete') as service_role_delete,
  (select count(*) from public.duty_board_staff) as staff_rows;
