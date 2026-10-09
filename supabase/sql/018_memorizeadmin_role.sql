-- 교회 어드민 — 성경암송 관리 역할 (2026-10-09 · 설계 docs/superpowers/specs/2026-10-09-church-admin-memorize-safe-bundle-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf · 운영 배포 날).
-- ⚠️ 이 파일은 역할 한 줄뿐이다. 실제 기능은 성경암송 api 를 내부 키로 부른다(백엔드·표를 안 바꾼다).
--    새 표·뷰·함수·정책이 없어 authenticated 노출도 늘지 않는다(운영에서 check-authenticated-exposure.sql 0행 확인).
-- 여러 번 돌려도 안전하다(on conflict do nothing).
begin;

insert into admin_roles (id, label, description) values
  ('memorizeadmin', '성경암송 관리', '통계 · 게시판 관리 · 앱 설정/문구 · 필사 명단 · 말씀 질문 기록')
on conflict (id) do nothing;

commit;

select 'role memorizeadmin' as t, count(*) from admin_roles where id = 'memorizeadmin'
union all select 'label 성경암송 관리', count(*) from admin_roles where id = 'memorizeadmin' and label = '성경암송 관리';
