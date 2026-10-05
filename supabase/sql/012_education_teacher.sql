-- 교회 어드민 — 교육 강사 역할(2026-10-05 · 교육신청 2단계 출석부 · 계획 v2 docs/superpowers/plans/2026-10-05-education-stage2-attendance.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 성경암송 저장소 supabase/edu.sql 2단계(edu_attendance 표 · edu_attendance_set·edu_attendance_bulk)가 먼저 들어가 있어야
--    이 역할로 출석부를 쓸 수 있다(역할 한 줄은 그 전에 넣어도 해가 없다).
-- teacher = 강사 — edu_course_staff 에 (강좌, 나, 'teacher') 줄이 있는 강좌의 출석부만(출석 체크·현황·엑셀).
--   「맡은 강좌만」은 서버(edu-db.ts mayTouch)가 지킨다(not-assigned) · 신청 현황 액션(eduEnrollList 등)은 ACTION_ROLES 에 없어 못 부른다(forbidden).
--   강사 줄은 1단계 표 edu_course_staff 를 그대로 쓴다(kind 'teacher' 는 011 이 미리 둔 값 · 표·RLS 는 바꾸지 않는다).
-- 여러 번 돌려도 안전하다(on conflict).
begin;

insert into admin_roles (id, label, description) values
  ('teacher', '강사', '맡은 강좌의 출석부')
on conflict (id) do update set label = excluded.label, description = excluded.description;

commit;

-- 확인(CLI 는 마지막 SELECT 하나만 보여 준다 — 한 줄로 묶었다)
--   기대: 강사 · 맡은 강좌의 출석부 · kind_check true(011 의 kind 제약에 teacher 가 있다) · rls_on true · anon·authenticated 권한 false
select
  (select label from admin_roles where id = 'teacher') as teacher_label,
  (select description from admin_roles where id = 'teacher') as teacher_description,
  (select pg_get_constraintdef(oid) like '%teacher%' from pg_constraint
     where conrelid = 'public.edu_course_staff'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%kind%' limit 1) as kind_check,
  (select relrowsecurity from pg_class where oid = 'public.edu_course_staff'::regclass) as rls_on,
  has_table_privilege('anon', 'public.edu_course_staff', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.edu_course_staff', 'select') as authenticated_select,
  (select count(*) from public.edu_course_staff where kind = 'teacher') as teacher_rows;
