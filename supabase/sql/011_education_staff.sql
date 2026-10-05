-- 교회 어드민 — 교육 강좌별 담당자(2026-10-05 친구 요청 「교육 강좌별로 담당자를 지정 할 수 있게」)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 성경암송 저장소 supabase/edu.sql(edu_courses)이 먼저 들어가 있어야 한다 — 이 표가 강좌를 가리킨다.
-- 역할 둘:
--   education = 교육 총괄(라벨만 바꾼다 · id 그대로) — 강좌 만들기·고치기·회차·복사·담당자 지정 · 모든 강좌의 신청 현황
--   educourse = 교육 담당(맡은 강좌) — edu_course_staff 에 (강좌, 나, 'manager') 줄이 있는 강좌의 신청 현황만
--     「맡은 강좌만」은 서버(edu-db.ts mayTouch)가 지킨다(not-assigned) — 화면에서 숨기는 것만으로 끝내지 않는다.
-- edu_course_staff 는 관리 화면에만 있는 개념이라 성경암송 edu.sql 이 아니라 여기 둔다.
--   kind 'teacher' 는 2단계(강사 · 출석)가 같은 표를 쓰려고 미리 둔 값이다.
-- 이 표는 서버(church-admin 함수의 service role)만 읽고 쓴다 — RLS 를 켜고 정책을 두지 않으며 public·anon·authenticated 권한을 뺀다.
--   ⚠️ 2026-09-28 부터 authenticated = 카카오 계정만 있으면 누구나 — TO authenticated 로 열지 말 것.
-- 여러 번 돌려도 안전하다(if not exists · on conflict).
begin;

insert into admin_roles (id, label, description) values
  ('education', '교육 총괄', '강좌 만들기·고치기·회차·복사 · 강좌별 담당자 지정 · 모든 강좌의 신청 현황 · 대신 등록 · 엑셀'),
  ('educourse', '교육 담당(맡은 강좌)', '맡은 강좌의 신청 현황 · 대신 등록 · 교재비 · 엑셀')
on conflict (id) do update set label = excluded.label, description = excluded.description;

create table if not exists public.edu_course_staff (
  course_id  uuid not null references public.edu_courses(id) on delete cascade,
  member_id  uuid not null references public.admin_members(id) on delete cascade,
  kind       text not null default 'manager' check (kind in ('manager', 'teacher')),
  created_at timestamptz default now(),
  primary key (course_id, member_id, kind)
);
-- 「내가 맡은 강좌」(eduCourses · 담당 확인)를 사람으로 찾는다 — 강좌 쪽은 기본 키가 받는다
create index if not exists edu_course_staff_member_idx on public.edu_course_staff (member_id, kind);

alter table public.edu_course_staff enable row level security;
revoke all on public.edu_course_staff from public, anon, authenticated;
grant select, insert, update, delete on public.edu_course_staff to service_role;

commit;

-- 확인(CLI 는 마지막 SELECT 하나만 보여 준다 — 한 줄로 묶었다)
--   기대: 교육 총괄 · 교육 담당(맡은 강좌) · rls_on true · anon·authenticated 권한 false · service_role true
select
  (select label from admin_roles where id = 'education') as education_label,
  (select label from admin_roles where id = 'educourse') as educourse_label,
  (select relrowsecurity from pg_class where oid = 'public.edu_course_staff'::regclass) as rls_on,
  has_table_privilege('anon', 'public.edu_course_staff', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.edu_course_staff', 'select') as authenticated_select,
  has_table_privilege('authenticated', 'public.edu_course_staff', 'insert') as authenticated_insert,
  has_table_privilege('service_role', 'public.edu_course_staff', 'delete') as service_role_delete,
  (select count(*) from public.edu_course_staff) as staff_rows;
