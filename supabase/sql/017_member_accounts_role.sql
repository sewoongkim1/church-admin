-- 교회 어드민 — 성도 계정 관리 역할 (2026-10-09 · 설계 docs/superpowers/specs/2026-10-09-church-admin-member-accounts-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf · 운영 배포 날).
-- ⚠️ 이 파일은 역할 한 줄뿐이다. users·user_profile_changes·member_merge 는 성경암송 앱의 것 — 칸·제약·RLS·함수를 바꾸지 않는다.
--    새 표·뷰·함수·정책이 없어 authenticated 노출도 늘지 않는다(운영에서 check-authenticated-exposure.sql 0행 확인).
-- 여러 번 돌려도 안전하다(on conflict do nothing).
begin;

insert into admin_roles (id, label, description) values
  ('members', '성도 계정', '성도 찾기 · 이름/소속 변경 · 변경 이력 (합치기는 총괄만)')
on conflict (id) do nothing;

commit;

select 'role members' as t, count(*) from admin_roles where id = 'members'
union all select 'label 성도 계정', count(*) from admin_roles where id = 'members' and label = '성도 계정';
