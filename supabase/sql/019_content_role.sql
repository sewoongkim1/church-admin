-- 교회 어드민 — 설교·찬양 담당자 역할 (2026-10-09 · 묶음5 · 설계 docs/superpowers/specs/2026-10-09-church-admin-memorize-safe-bundle-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 실제 일은 성경암송 api 를 내부 키로 부른다(백엔드·워크플로·Gemini 를 안 바꾼다). 여기선 역할 한 줄뿐.
--    옛 담당자 암호(CONTENT_STAFF_SECRET)·contentAdmins 는 안 쓴다 — 이제 카카오 로그인 + 이 역할로 정한다.
-- 여러 번 돌려도 안전하다(on conflict do nothing).
begin;

insert into admin_roles (id, label, description) values
  ('content', '설교·찬양', '설교 올리기 · 설교 목록·메타 · 주간 구절 · 연상 그림 · 매일 묵상 조회')
on conflict (id) do nothing;

commit;

select 'role content' as t, count(*) from admin_roles where id = 'content'
union all select 'label 설교·찬양', count(*) from admin_roles where id = 'content' and label = '설교·찬양';
