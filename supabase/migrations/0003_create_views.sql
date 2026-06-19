-- ─────────────────────────────────────────────────────────────────────────────
-- post_views — 글별 조회수 (집계 + 이벤트 hybrid)
--
-- 설계 원칙
--  * post_views:        빠른 조회용 집계 카운터 (slug 당 1행).
--  * post_view_events:  중복/봇 방지를 위한 조회 이벤트 로그.
--    같은 ip_hash가 30분 내 재방문하면 카운트하지 않는다 (Edge Function에서 판정).
--  * 본인(블로그 운영자) 조회는 클라이언트가 localStorage 플래그로 POST 자체를 생략.
--  * INSERT 시 trigger로 post_views.view_count 를 자동 증가.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists post_views (
  post_slug   text        primary key,
  view_count  bigint      not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists post_view_events (
  id          bigserial   primary key,
  post_slug   text        not null,
  ip_hash     text,
  viewed_at   timestamptz not null default now()
);

create index if not exists post_view_events_dedup_idx
  on post_view_events (post_slug, ip_hash, viewed_at desc);

-- 이벤트 INSERT 시 집계 카운터 자동 증가
create or replace function increment_view_count()
returns trigger as $$
begin
  insert into post_views (post_slug, view_count, updated_at)
  values (new.post_slug, 1, now())
  on conflict (post_slug)
  do update set
    view_count = post_views.view_count + 1,
    updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_increment_view_count on post_view_events;
create trigger trg_increment_view_count
after insert on post_view_events
for each row execute function increment_view_count();

-- 모든 접근은 Edge Function(service_role)을 통해서만. anon 키로는 차단.
alter table post_views enable row level security;
alter table post_view_events enable row level security;
