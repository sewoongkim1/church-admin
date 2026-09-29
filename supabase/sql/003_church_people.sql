-- 교회 어드민 — 교인명부 (2026-09-29 · 설계 v2 docs/superpowers/specs/2026-09-29-church-people-directory-design.md)
-- ⚠️ 개발(ktpwthwqzgcqcrmsafdo) 먼저, 그다음 운영(xnomlgydifiqiybervtf).
-- ⚠️ 서버(church-admin 함수의 service role)만 읽고 쓴다. 공개 키·로그인 사용자(카카오 계정만 있으면 누구나) 모두 막는다.
--    RLS 를 켜고 정책을 두지 않으며 anon·authenticated 권한을 뺀다. 사진 칸은 public=false · 정책 없음.
-- ⚠️ 원본은 dimode(교적 프로그램)다 — 이 표는 읽기 전용 사본. 고치는 길은 올리기 스크립트(tools/people/) 하나뿐.
-- 여러 번 돌려도 안전하다(if not exists · on conflict).
begin;

create table if not exists church_people (
  person_id       int primary key,                  -- dimode 교인ID
  name            text not null default '',
  position        text not null default '',
  position_detail text not null default '',
  gender          text not null default '',
  birth           text not null default '',          -- 원본 글자 그대로(「1975-03-02」·「1975」·「--」)
  birth_date      date,                              -- 날짜로 읽히는 것만
  lunar           text not null default '',
  age             numeric,                           -- 명단 기준일의 나이(원본 그대로 · 음수·소수도 있다)
  spouse          text not null default '',
  spouse_position text not null default '',
  household_head  text not null default '',
  household_rel   text not null default '',
  household_id    int,                               -- 신앙세대주의 교인ID(원본 PersonMiniViewJs 번호 · 가족 묶기).
                                                     -- 세대주가 이 명단에 없을 수 있어 FK 를 걸지 않는다(2026-09-29: 331명)
  kind1           text not null default '',
  kind2           text not null default '',
  kind3           text not null default '',
  registered      text not null default '',
  registered_date date,
  reg_type        text not null default '',
  phone1          text not null default '',
  phone2          text not null default '',
  guide           text not null default '',
  email           text not null default '',
  mok_path        text not null default '',
  mok1            text not null default '',
  mok2            text not null default '',
  mok3            text not null default '',
  mok_leader      text not null default '',
  school_path     text not null default '',
  school_dept     text not null default '',
  teacher         text not null default '',
  youth_path      text not null default '',
  mission         text not null default '',
  address         text not null default '',
  address_jibun   text not null default '',
  has_photo       boolean not null default false,
  photo_hash      text not null default '',          -- 사진 md5 — 다시 올릴 때 바뀐 사진만 올린다
  name_key        text not null default '',          -- 이름 NFC · 띄어쓰기 없음(찾기·맞대기)
  phone_digits    text not null default '',          -- 연락처1·2 숫자만, 띄어쓰기로 이음(전화 뒷자리 찾기·맞대기)
  updated_at      timestamptz not null default now()
);
create index if not exists church_people_name_key_idx on church_people (name_key);
create index if not exists church_people_mok1_idx on church_people (mok1);
create index if not exists church_people_household_idx on church_people (household_id);

create table if not exists church_people_imports (
  id          bigserial primary key,
  imported_at timestamptz not null default now(),
  source_date date not null,                         -- 명단 기준일(dimode 에서 내려받은 날)
  total       int not null,
  added       int not null default 0,
  changed     int not null default 0,
  removed     int not null default 0,
  photos      int not null default 0                 -- 이번에 올린 사진 수
);

alter table church_people         enable row level security;
alter table church_people_imports enable row level security;
revoke all on church_people, church_people_imports from anon, authenticated;
revoke all on sequence church_people_imports_id_seq from anon, authenticated;

insert into admin_roles (id, label, description) values
  ('directory', '교인명부', '교인 찾기 · 현황 · 내려받기')
on conflict (id) do nothing;

-- 사진 칸 — 공개 끔 · 정책 없음(서버만 연다). 이미 있으면 공개만 다시 끈다.
insert into storage.buckets (id, name, public) values ('church-people-photos', 'church-people-photos', false)
on conflict (id) do update set public = false;

commit;

select 'church_people' as t, count(*) from church_people
union all select 'imports', count(*) from church_people_imports
union all select 'role directory', count(*) from admin_roles where id = 'directory'
union all select 'bucket 공개(0이어야)', count(*) from storage.buckets where id = 'church-people-photos' and public;
