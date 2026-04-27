-- =============================================
-- WorkRide 사내 카풀 - Supabase 마이그레이션
-- Supabase SQL Editor에 붙여넣기 후 실행하세요
-- =============================================

-- 카풀 등록 테이블
create table if not exists listings (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('driver', 'passenger')),
  name        text not null,
  dept        text not null,
  rank        text not null,
  avatar      text not null default '😊',
  from_loc    text not null,
  via_loc     text,
  direction   text not null default '출근',
  depart_time time not null,
  seats       int,           -- 드라이버: 탑승 가능 인원
  cost        int,           -- 드라이버: 1인 분담금
  people      int,           -- 동승자: 탑승 인원
  budget      int,           -- 동승자: 최대 예산
  days        int[] not null default '{1,1,1,1,1}', -- 월~금
  tags        text[] not null default '{}',
  rating      numeric(2,1) not null default 5.0,
  review_cnt  int not null default 0,
  matched     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 매칭 요청 테이블
create table if not exists match_requests (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references listings(id) on delete cascade,
  requester_name text not null,
  requester_dept text not null,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now()
);

-- RLS(Row Level Security) 활성화
alter table listings enable row level security;
alter table match_requests enable row level security;

-- 모든 사용자가 읽기 가능 (사내 서비스이므로)
create policy "listings_select" on listings for select using (true);
create policy "listings_insert" on listings for insert with check (true);
create policy "listings_update" on listings for update using (true);

create policy "requests_select" on match_requests for select using (true);
create policy "requests_insert" on match_requests for insert with check (true);
create policy "requests_update" on match_requests for update using (true);

-- 찜(PAW) 테이블
create table if not exists paws (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  listing_id  uuid not null references listings(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique(user_id, listing_id)
);

alter table paws enable row level security;
create policy "paws_select" on paws for select using (true);
create policy "paws_insert" on paws for insert with check (true);
create policy "paws_delete" on paws for delete using (true);

-- 인덱스
create index if not exists idx_listings_type    on listings(type);
create index if not exists idx_listings_dept    on listings(dept);
create index if not exists idx_listings_matched on listings(matched);
create index if not exists idx_requests_listing on match_requests(listing_id);
create index if not exists idx_requests_status  on match_requests(status);
create index if not exists idx_paws_user        on paws(user_id);
create index if not exists idx_paws_listing     on paws(listing_id);

-- 샘플 데이터
insert into listings (type, name, dept, rank, avatar, from_loc, via_loc, direction, depart_time, seats, cost, days, tags, rating, review_cnt) values
  ('driver',    '이민준', '기술혁신팀', '과장', '👨‍💼', '서초구 잠원동', '강남구 논현동', '출퇴근', '08:20', 3, 2500, '{1,1,1,1,1}', '{"비흡연","에어컨 완비"}', 4.9, 54),
  ('driver',    '박지수', '마케팅팀',   '대리', '👩‍💼', '강남구 개포동', null,           '출근',   '08:45', 2, 2000, '{1,0,1,0,1}', '{"조용한 탑승","여성 전용"}', 4.8, 32),
  ('driver',    '최도윤', 'IT인프라팀', '주임', '🧑‍💻', '송파구 잠실동', null,           '출퇴근', '09:00', 3, 1500, '{1,1,1,1,0}', '{"대화 OK","음악 OK"}', 4.7, 18),
  ('passenger', '한예린', '기술혁신팀', '사원', '👩‍🎓', '강남구 역삼동', null,           '출근',   '08:30', null, null, '{1,1,1,1,1}', '{"정시 탑승","비흡연"}', 4.6, 11),
  ('passenger', '강준호', '연구개발팀', '대리', '🧑‍🔬', '서초구 방배동', null,           '출퇴근', '09:00', null, null, '{1,0,1,0,1}', '{"짐 없음"}', 4.5, 7),
  ('passenger', '오서현', '경영기획팀', '과장', '👩‍💼', '마포구 서교동', null,           '출근',   '08:00', null, null, '{1,1,0,1,1}', '{"음악 OK","대화 OK"}', 4.9, 40)
on conflict do nothing;

-- =============================================
-- 완료! Supabase 대시보드 > Project Settings >
-- API 에서 URL과 anon key를 복사하세요.
-- =============================================
