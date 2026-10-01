-- 교회 어드민 — 사역 이력(지난 해 사역 임명 · 교인ID) (2026-10-01 · 설계 v2 docs/superpowers/specs/2026-10-01-church-admin-ministry-history-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 서버(church-admin 함수의 service role)만 읽고 쓴다. 공개 키·로그인 사용자(카카오 계정만 있으면 누구나) 모두 막는다.
--    RLS 를 켜고 정책을 두지 않으며 anon·authenticated 권한을 뺀다. 맞춤 결과를 한꺼번에 쓰는 함수도 service_role 만 부른다.
-- ⚠️ person_id 에 FK 를 걸지 않는다 — 12월 새 교인명부에서 빠진 분의 줄도 남아야 한다(명부에 없으면 화면이 「명부에 없음」).
-- ⚠️ 교인명부 세션(자세히 창)은 이 표를 person_id 로 **읽기만** 한다 — 칸 이름을 바꾸면 그쪽 설계(2026-10-01-person-history-tabs)도.
-- 여러 번 돌려도 안전하다(if not exists · create or replace).
-- 실행: supabase --workdir <작업 폴더> db query --linked -f C:/Projects/church-admin/supabase/sql/005_ministry_history.sql
begin;

create table if not exists ministry_history_imports (
  id              bigserial primary key,
  imported_at     timestamptz not null default now(),
  member_id       uuid references admin_members(id) on delete set null,
  file_name       text not null default '',
  years           int[] not null default '{}',
  total           int not null default 0,         -- 파일에서 읽은 줄
  added           int not null default 0,
  skipped_same    int not null default 0,         -- 이미 있는 같은 줄
  skipped_deleted int not null default 0,         -- 빼 둔 줄과 같음
  skipped_dup     int not null default 0          -- 파일 안 겹침
);

create table if not exists ministry_history (
  id           bigserial primary key,
  year         int  not null check (year between 1950 and 2100),
  committee    text not null default '',          -- 부서(위원회) — 엑셀 「부서」
  team         text not null default '',          -- 팀명
  role_title   text not null default '',          -- 직책(팀장·부팀장 …) — 엑셀에 없으면 빈칸
  name         text not null,                     -- 그때의 이름(원문 · NFC)
  position     text not null default '',          -- 그때의 직분(원문)
  mok          text not null default '',          -- 그때의 목장(원문 「기쁨-19」·「청년05또래」)
  renewal      text not null default '',          -- 신규 / 유지
  src_note     text not null default '',          -- 원본 메모(2022 H열 등)
  person_id    int,                               -- 교인ID(church_people.person_id) · null = 못 맞춤/이분 아님
  link_how     text not null default 'auto' check (link_how in ('auto', 'manual', 'none')),
  match_basis  text not null default '',          -- 맞춤 근거(person_id 가 있을 때)
  match_reason text not null default '',          -- 못 맞춘 사유 = 화면·내려받기의 「비고」
  linked_by    uuid references admin_members(id) on delete set null,
  linked_at    timestamptz,
  source       text not null default 'excel' check (source in ('excel', 'admin', 'app')),   -- admin = 화면에서 한 줄 더함
  source_file  text not null default '',
  import_id    bigint references ministry_history_imports(id) on delete set null,
  order_id     bigint,                            -- source='app' 일 때 원래 ministry_orders.id(넘기기 · 나중)
  src_key      text not null,                     -- 같은 줄 열쇠 — 올린 그대로, 고쳐도 안 바뀐다
  deleted_at   timestamptz,                       -- 빼 둔 때(지우지 않는다 — 다시 올려도 되살아나지 않게)
  deleted_by   uuid references admin_members(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ministry_history_app_order_chk check ((source = 'app') = (order_id is not null))
);
create unique index if not exists ministry_history_src_key_uq on ministry_history (src_key);
create unique index if not exists ministry_history_order_uq   on ministry_history (order_id) where order_id is not null;
create index if not exists ministry_history_person_idx on ministry_history (person_id) where deleted_at is null;
create index if not exists ministry_history_year_idx   on ministry_history (year);

alter table ministry_history_imports enable row level security;
alter table ministry_history         enable row level security;
revoke all on ministry_history, ministry_history_imports from anon, authenticated;
revoke all on sequence ministry_history_id_seq, ministry_history_imports_id_seq from anon, authenticated;

-- 맞춤 결과 한꺼번에 쓰기(다시 맞추기) — 자동 줄만, 그사이 사람이 고친 줄(updated_at 이 다름)은 건너뛴다.
--   p = [{ "id": 1, "expect": "<updated_at 그대로>", "person_id": 123 | null, "match_basis": "…", "match_reason": "…" }, …]
--   updated_at 은 올리지 않는다(맞춤만 바뀌었다 — 열려 있는 고치기 창이 conflict 로 막히지 않게).
create or replace function public.ministry_history_apply(p jsonb)
returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  update ministry_history h
     set person_id    = nullif(x->>'person_id', '')::int,
         match_basis  = coalesce(x->>'match_basis', ''),
         match_reason = coalesce(x->>'match_reason', '')
    from jsonb_array_elements(p) x
   where h.id = (x->>'id')::bigint
     and h.link_how = 'auto'
     and h.deleted_at is null
     and h.updated_at = (x->>'expect')::timestamptz;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.ministry_history_apply(jsonb) from public, anon, authenticated;
grant execute on function public.ministry_history_apply(jsonb) to service_role;

commit;

select 'ministry_history' as t, count(*) from ministry_history
union all select 'imports', count(*) from ministry_history_imports
union all select 'anon·authenticated 표 권한(0이어야)', count(*) from information_schema.role_table_grants
  where table_name in ('ministry_history', 'ministry_history_imports') and grantee in ('anon', 'authenticated')
union all select 'apply 를 authenticated 가 부름(0이어야)', count(*) from information_schema.routine_privileges
  where routine_name = 'ministry_history_apply' and grantee in ('anon', 'authenticated', 'PUBLIC');
