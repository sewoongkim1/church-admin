-- 교회 어드민 — 새가족 등록(2026-10-07 · 설계 v2 성경암송 저장소 docs/superpowers/specs/2026-10-07-newfamily-design.md §2·§4)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- 종이 등록카드 → 섬김이 배정 → 섬김이 교육 네 번 → 목사님 교육 → 섬김이 보고서 → 교구 배정 → 등록식.
-- 관리 화면에만 있는 개념이라 성경암송 저장소가 아니라 여기 둔다. 성도님 앱은 이 표를 읽지 않는다.
-- 역할 둘:
--   newfamily = 새가족 운영팀 — 새가족 묶음의 모든 것
--   nfteam    = 새가족 섬김 — 영접팀·정착팀 총무·섬김이·새가족 목사님. 무엇을 하는지는 nf_staff.kind 가 정한다.
--     「자기 것만」은 서버(nf-db.ts mayTouch)가 줄마다 지킨다(not-assigned) — 화면에서 숨기는 것만으로 끝내지 않는다.
-- ⚠️ 새가족은 아직 교인이 아닌 분이다. 모든 표는 서버(church-admin 함수의 service role)만 읽고 쓴다 —
--   RLS 를 켜고 정책을 두지 않으며 public·anon·authenticated 권한을 뺀다.
--   2026-09-28 부터 authenticated = 카카오 계정만 있으면 누구나 — TO authenticated 로 열지 말 것(storage 정책도).
-- ⚠️ 단계 칸은 없다 — 서버 nf-rules.ts stageOf 가 사실(helper_id·교육 줄 수·pastor_class_on·report_sent_at·parish·cert_no)에서 읽는다.
-- ⚠️ 수료번호(cert_no)는 nf_ceremony_confirm 한 곳에서만 매긴다. 손으로 넣거나 고치지 말 것(번호가 겹치거나 건너뛴다).
-- 여러 번 돌려도 안전하다(if not exists · on conflict · create or replace).
begin;

insert into admin_roles (id, label, description) values
  ('newfamily', '새가족 운영팀', '새가족 카드 · 현황 · 등록식 명단·수료번호 · 통계 · 함께 쓰는 분(영접팀·정착팀·목사님) 넣기'),
  ('nfteam',    '새가족 섬김',   '영접팀(카드 입력) · 정착팀 총무(섬김이 배정) · 섬김이(교육 기록) · 새가족 목사님(교구 배정) — 하는 일은 새가족 운영팀이 정한다')
on conflict (id) do update set label = excluded.label, description = excluded.description;

-- 섬김이(정착팀 구성원) — 로그인한 적이 없어도 이름만으로 먼저 넣어 배정할 수 있다. member_id 는 이어진 뒤에 찬다.
create table if not exists public.nf_helpers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  church_person_id int,                                   -- 교인명부에서 고른 분(church_people.person_id · 명부는 갈아 끼우므로 FK 없음)
  services         text not null default '',              -- 섬기는 예배(예: 2부·3부)
  member_id        uuid unique references public.admin_members(id) on delete set null,
  resting          boolean not null default false,        -- 쉬는 중 — 배정 목록에서 빠진다(지난 기록은 남는다)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 하는 일 — 한 분이 여럿을 가질 수 있다(총무이면서 섬김이)
create table if not exists public.nf_staff (
  member_id  uuid not null references public.admin_members(id) on delete cascade,
  kind       text not null check (kind in ('greeter', 'lead', 'helper', 'pastor')),
  created_at timestamptz not null default now(),
  primary key (member_id, kind)
);

-- 종이 카드 한 장(한 가정)
create table if not exists public.nf_cards (
  id            uuid primary key default gen_random_uuid(),
  reg_date      date not null,
  service       text not null default '',                 -- 1부·2부·3부·찬양·수요·그 밖(nf-rules.ts NF_SERVICES)
  pastor        text not null default '',                 -- 담당 교역자(글자)
  address       text not null default '',
  car_no        text not null default '',
  note          text not null default '',
  consent       boolean not null check (consent),         -- 카드의 동의에 체크하셨음 — false 인 줄은 없다
  self_come     boolean not null default false,           -- 인도자 없이 스스로 오심
  draft         boolean not null default false,           -- 마저 채울 카드
  card_photo    text not null default '',                 -- 저장소 칸 newfamily 의 경로(공개 주소 아님)
  welcome_photo text not null default '',
  created_by    uuid references public.admin_members(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists nf_cards_reg_idx on public.nf_cards (reg_date desc);

-- 등록식 한 번
create table if not exists public.nf_ceremonies (
  id           uuid primary key default gen_random_uuid(),
  held_on      date not null,
  note         text not null default '',
  confirmed_at timestamptz,
  first_no     int,
  last_no      int,
  created_at   timestamptz not null default now()
);

-- 사람 한 분(본인·가족이 줄마다)
create table if not exists public.nf_people (
  id              uuid primary key default gen_random_uuid(),
  card_id         uuid not null references public.nf_cards(id) on delete cascade,
  seq             int not null default 1,                 -- 카드 안의 차례(1 = 본인)
  relation        text not null default '본인',
  name            text not null,
  gender          text not null default '' check (gender in ('', '남', '여')),
  birth           date,
  birth_lunar     boolean not null default false,
  phone           text not null default '',
  tel             text not null default '',
  baptized        text not null default 'unknown' check (baptized in ('yes', 'no', 'unknown')),
  target          boolean not null,                       -- 수료 대상(교육 네 번을 받고 등록식에 서실 분) — 기본값 없음: 사람이 골라야 한다
  helper_id       uuid references public.nf_helpers(id) on delete set null,
  assigned_at     timestamptz,
  pastor_class_on date,                                   -- 새가족 목사님 교육 참석한 날
  report_sent_at  timestamptz,                            -- 섬김이가 보고서(교육 줄들)를 목사님께 보낸 때 — 차 있으면 줄을 못 고친다
  report_return   text not null default '',               -- 목사님이 돌려보내며 적은 한마디
  parish          text not null default '',               -- 편성 교구(목장까지 · 예: 믿음-35)
  parish_at       timestamptz,
  ceremony_id     uuid references public.nf_ceremonies(id) on delete set null,
  attended        boolean,                                -- 등록식 참석(명단에 담은 뒤 표시)
  cert_no         text unique,                            -- 수료번호(예: 26-201) — nf_ceremony_confirm 만 쓴다
  stopped_at      timestamptz,
  stop_reason     text not null default '',
  wait_note       text not null default '',               -- 등록식을 미루는 사정
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists nf_people_card_idx on public.nf_people (card_id, seq);
create index if not exists nf_people_helper_idx on public.nf_people (helper_id) where helper_id is not null;
create index if not exists nf_people_ceremony_idx on public.nf_people (ceremony_id) where ceremony_id is not null;
create index if not exists nf_people_name_idx on public.nf_people (name);

-- 카드의 인도자(두 분까지)
create table if not exists public.nf_guides (
  card_id          uuid not null references public.nf_cards(id) on delete cascade,
  seq              int not null check (seq in (1, 2)),
  name             text not null,
  mok              text not null default '',
  phone            text not null default '',
  church_person_id int,                                   -- 교인명부에서 고른 경우만(응답에 싣지 않는다)
  primary key (card_id, seq)
);

-- 교육 한 번 = 섬김이 보고서 한 줄(일자 · 내용 · 비고). lesson 은 네 번까지 · 그 뒤 덧붙인 줄은 extra(횟수에 안 든다)
create table if not exists public.nf_lessons (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.nf_people(id) on delete cascade,
  kind       text not null default 'lesson' check (kind in ('lesson', 'extra')),
  met_on     date not null,
  content    text not null default '',
  note       text not null default '',
  written_by uuid references public.nf_helpers(id) on delete set null,   -- 섬김이를 바꿔도 앞 줄은 쓴 분 이름으로 남는다
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 같은 분에게 같은 날 교육 두 번은 없다(잘못 두 번 누르는 것을 막는다 · 덧붙인 줄은 묶지 않는다)
create unique index if not exists nf_lessons_day_uq on public.nf_lessons (person_id, met_on) where kind = 'lesson';
create index if not exists nf_lessons_person_idx on public.nf_lessons (person_id, met_on);

-- 해마다 다음 수료번호. 2026년은 201 부터(엑셀에서 드린 26-0NN 과 겹치지 않게 · 친구 2026-10-07) · 다른 해는 1 부터 저절로 생긴다.
create table if not exists public.nf_settings (
  year    int primary key,
  next_no int not null check (next_no >= 1)
);
insert into public.nf_settings (year, next_no) values (2026, 201) on conflict (year) do nothing;

-- 등록식 확정 — 참석으로 표시한 분에게 이름순으로 수료번호를 차례로 매긴다. 그해 줄을 잠가 번호가 겹치지 않게 한다.
--   돌려주는 것: {"ok":true,"count":N,"first":"26-201","last":"26-203"} · 틀리면 {"ok":false,"error":"..."}
--   not-found · already(이미 확정) · empty(참석으로 표시한 분이 없다) · not-ready(교구가 없는 분이 섞였다)
create or replace function public.nf_ceremony_confirm(p_ceremony uuid) returns jsonb
  language plpgsql set search_path = public
as $$
declare
  c     public.nf_ceremonies%rowtype;
  y     int;
  n     int;
  first int;
  r     record;
  cnt   int := 0;
begin
  select * into c from public.nf_ceremonies where id = p_ceremony for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not-found'); end if;
  if c.confirmed_at is not null then return jsonb_build_object('ok', false, 'error', 'already'); end if;
  if not exists (select 1 from public.nf_people where ceremony_id = p_ceremony and attended is true) then
    return jsonb_build_object('ok', false, 'error', 'empty');
  end if;
  if exists (select 1 from public.nf_people
             where ceremony_id = p_ceremony and attended is true
               and (parish = '' or cert_no is not null or stopped_at is not null or target is not true)) then
    return jsonb_build_object('ok', false, 'error', 'not-ready');
  end if;

  y := extract(year from c.held_on)::int;
  insert into public.nf_settings (year, next_no) values (y, 1) on conflict (year) do nothing;
  select next_no into n from public.nf_settings where year = y for update;
  first := n;
  for r in select id from public.nf_people where ceremony_id = p_ceremony and attended is true order by name, id loop
    update public.nf_people
       set cert_no = lpad((y % 100)::text, 2, '0') || '-' || lpad(n::text, 3, '0'), updated_at = now()
     where id = r.id;
    n := n + 1;
    cnt := cnt + 1;
  end loop;
  update public.nf_settings set next_no = n where year = y;
  -- 담았지만 못 오신 분은 다시 후보로(다음 등록식 때 보인다)
  update public.nf_people set ceremony_id = null, attended = null, updated_at = now()
   where ceremony_id = p_ceremony and attended is not true;
  update public.nf_ceremonies set confirmed_at = now(), first_no = first, last_no = n - 1 where id = p_ceremony;
  return jsonb_build_object('ok', true, 'count', cnt,
    'first', lpad((y % 100)::text, 2, '0') || '-' || lpad(first::text, 3, '0'),
    'last',  lpad((y % 100)::text, 2, '0') || '-' || lpad((n - 1)::text, 3, '0'));
end $$;
revoke all on function public.nf_ceremony_confirm(uuid) from public, anon, authenticated;
grant execute on function public.nf_ceremony_confirm(uuid) to service_role;

do $$
declare t text;
begin
  foreach t in array array['nf_helpers', 'nf_staff', 'nf_cards', 'nf_ceremonies', 'nf_people', 'nf_guides', 'nf_lessons', 'nf_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- 사진(카드 사진 · 환영 사진) — 비공개 칸. 정책을 두지 않는다(서버가 service role 로 올리고, 볼 때마다 서명 주소를 만든다).
insert into storage.buckets (id, name, public) values ('newfamily', 'newfamily', false)
on conflict (id) do update set public = false;

commit;

-- 확인(CLI 는 마지막 SELECT 하나만 보여 준다 — 한 줄로 묶었다)
--   기대: 라벨 둘 · rls_off 0 · anon_open 0 · auth_open 0 · bucket_public false · next_2026 201 이상 · fn_anon false
select
  (select label from admin_roles where id = 'newfamily') as newfamily_label,
  (select label from admin_roles where id = 'nfteam') as nfteam_label,
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname like 'nf\_%' and relkind = 'r' and not relrowsecurity) as rls_off,
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname like 'nf\_%' and relkind = 'r'
     and has_table_privilege('anon', oid, 'select')) as anon_open,
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname like 'nf\_%' and relkind = 'r'
     and (has_table_privilege('authenticated', oid, 'select') or has_table_privilege('authenticated', oid, 'insert'))) as auth_open,
  (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname like 'nf\_%' and relkind = 'r') as nf_tables,
  (select public from storage.buckets where id = 'newfamily') as bucket_public,
  (select next_no from public.nf_settings where year = 2026) as next_2026,
  has_function_privilege('anon', 'public.nf_ceremony_confirm(uuid)', 'execute') as fn_anon,
  has_function_privilege('authenticated', 'public.nf_ceremony_confirm(uuid)', 'execute') as fn_authenticated;
