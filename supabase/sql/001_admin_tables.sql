-- 교회 어드민 — 담당자 · 역할 · 바꾼 기록 (2026-09-28)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 이 표들은 서버(church-admin 함수의 service role)만 읽고 쓴다. 공개 키·로그인 사용자 모두 막는다.
--    RLS 를 켜고 정책을 두지 않으며, anon·authenticated 권한도 뺀다(뷰를 만들면 security_invoker = on).
-- 여러 번 돌려도 안전하다(if not exists · on conflict).
begin;

-- 역할 목록의 원본은 이 표 하나다. 역할을 늘리려면 행 하나만 넣는다(CHECK 나 코드에 박지 않는다).
create table if not exists admin_roles (
  id          text primary key,
  label       text not null,
  description text not null default ''
);

-- 들어올 수 있는 사람. 카카오 로그인(auth.users) 한 명 = 한 줄.
-- 신원 여섯 칸은 성경암송 앱 로그인(users.identity_key)과 같은 꼴 — 기존 사역 담당자와 맞대기 위해서다.
create table if not exists admin_members (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid not null unique references auth.users(id) on delete cascade,
  type           text not null default '교구',
  gu             text not null default '',
  mok            text not null default '',
  bu             text not null default '',
  grade          text not null default '',
  name           text not null,
  kakao_nickname text not null default '',
  kakao_avatar   text not null default '',   -- 카카오 프로필 사진 주소(https). 승인 목록에서 본인 확인용
  status         text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  approved_by    uuid references admin_members(id) on delete set null,
  approved_at    timestamptz,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists admin_role_grants (
  member_id  uuid not null references admin_members(id) on delete cascade,
  role_id    text not null references admin_roles(id),
  granted_by uuid references admin_members(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (member_id, role_id)
);

-- 누가 언제 무엇을 바꿨나. 사람이 지워져도 기록은 남는다(member_id 만 비워진다).
create table if not exists admin_audit (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  member_id uuid references admin_members(id) on delete set null,
  action    text not null,
  target    text not null default '',
  detail    jsonb not null default '{}'::jsonb
);
create index if not exists admin_audit_at_idx on admin_audit (at desc);

alter table admin_roles       enable row level security;
alter table admin_members     enable row level security;
alter table admin_role_grants enable row level security;
alter table admin_audit       enable row level security;

revoke all on admin_roles, admin_members, admin_role_grants, admin_audit from anon, authenticated;
revoke all on sequence admin_audit_id_seq from anon, authenticated;

insert into admin_roles (id, label, description) values
  ('super',    '총괄 관리자',   '모든 메뉴 + 담당자 승인·역할·정지'),
  ('ministry', '사역신청 담당', '사역신청 메뉴 전체')
on conflict (id) do nothing;

commit;

select id, label from admin_roles order by id;
