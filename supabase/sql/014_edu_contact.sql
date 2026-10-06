-- 교육 강좌 「문의」 한 줄(2026-10-06 · 친구 요청) — 담당자가 자유롭게 적는다(보통 이름 + 직분 + 전화번호 · 60자)
--   성도님 앱 강좌 자세히 화면의 한눈에 카드에 그대로 보인다(모집 전·진행 중에도). 알려도 되는 번호만 적는다.
--   ⚠️ 표는 성경암송 저장소 supabase/edu.sql 이 원본이다 — 거기에도 같은 줄이 있다(다시 돌려도 안전).
alter table public.edu_courses add column if not exists contact_note text not null default '';
alter table public.edu_courses drop constraint if exists edu_courses_contact_len;
alter table public.edu_courses add constraint edu_courses_contact_len check (char_length(contact_note) <= 60);
