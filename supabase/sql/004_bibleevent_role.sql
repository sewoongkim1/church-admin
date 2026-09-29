-- 교회 어드민 — 성경필사(암송) 역할 (2026-09-29 · 설계 v2 docs/superpowers/specs/2026-09-29-church-admin-bible-events-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf · 여는 날 Task 15).
-- ⚠️ 이 파일은 역할 한 줄뿐이다. 명단 표(events·event_signups)는 성경암송 앱의 것 — 칸·제약·RLS 를 바꾸지 않는다.
--    새 표·뷰·함수·정책이 없어 authenticated 노출도 늘지 않는다(운영에서는 그래도 check-authenticated-exposure.sql 0행 확인).
-- ⚠️ 역할 id 는 pilsa 가 아니다 — 성경암송 「필사 노트 신청」(pilsa_orders·pilsaApply)이 이미 쓰는 이름이다.
-- 여러 번 돌려도 안전하다(on conflict do nothing).
begin;

insert into admin_roles (id, label, description) values
  ('bibleevent', '성경필사(암송)', '성경필사·암송 이벤트 명단 보기 · 고치기 · 올리기 · 통계')
on conflict (id) do nothing;

commit;

select 'role bibleevent' as t, count(*) from admin_roles where id = 'bibleevent'
union all select 'label 성경필사(암송)', count(*) from admin_roles where id = 'bibleevent' and label = '성경필사(암송)';
