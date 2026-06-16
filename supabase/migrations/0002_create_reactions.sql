-- ─────────────────────────────────────────────────────────────────────────────
-- reactions — 글별 이모지 리액션 (슬랙 스타일)
--
-- 설계 원칙
--  * 로그인 없음. 익명 사용자가 이모지로 반응.
--  * 한 사람(ip_hash)이 같은 글의 같은 이모지를 누르면 1회만 카운트.
--    다시 누르면 토글(취소). UNIQUE 제약으로 보장.
--  * ip_hash: sha256(ip + salt). 본인 식별/중복 방지용. 클라이언트 노출 금지.
--  * emoji는 허용 목록(Edge Function)에서만 받는다 — 임의 문자열 저장 방지.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists reactions (
  id          uuid        primary key default gen_random_uuid(),
  post_slug   text        not null,
  emoji       text        not null,
  ip_hash     text        not null,
  created_at  timestamptz not null default now(),
  unique (post_slug, emoji, ip_hash)
);

create index if not exists reactions_post_slug_idx
  on reactions (post_slug);

-- 모든 접근은 Edge Function(service_role)을 통해서만. anon 키로는 차단.
alter table reactions enable row level security;
