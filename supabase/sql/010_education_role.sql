-- 교회 어드민 — 교육 담당 역할(2026-10-05 · 설계 v2 docs/superpowers/specs/2026-10-05-education-courses-design.md §4)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 역할 한 줄뿐 — 강좌·신청 표는 성경암송 저장소 supabase/edu.sql 의 것(칸·제약·RLS 를 여기서 바꾸지 않는다).
-- 강사(teacher)는 2단계에서 더한다. 여러 번 돌려도 안전하다.
begin;
insert into admin_roles (id, label, description) values
  ('education', '교육', '교육 강좌 만들기 · 신청 현황 · 대신 등록 · 엑셀')
on conflict (id) do nothing;
commit;
select 'role education' as t, count(*) from admin_roles where id = 'education';
