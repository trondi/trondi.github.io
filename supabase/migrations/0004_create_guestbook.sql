-- ─────────────────────────────────────────────────────────────────────────────
-- guestbook — 방명록 (사이트 전체에 하나, 글과 무관)
--
-- 댓글(comments)과 거의 동일한 구조지만 post_slug가 없다 (단일 목록).
--  * 로그인 없음. 이름 + 선택적 비밀번호로 작성.
--  * password_hash: PBKDF2 해시. 비밀번호 검증 후 본인 삭제용.
--  * ip_hash:  sha256(ip + salt). 도배 차단/관리용. 클라이언트 노출 금지.
--  * anon_id:  sha256(ip + salt) 앞 6자리. 공개 식별자.
--  * is_hidden: 신고/스팸 숨김 처리용.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists guestbook (
  id            uuid        primary key default gen_random_uuid(),
  author_name   text        not null check (char_length(author_name) between 1 and 30),
  content       text        not null check (char_length(content) between 1 and 500),
  password_hash text,
  ip_hash       text,
  anon_id       text,
  user_agent    text,
  is_hidden     boolean     not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists guestbook_created_idx
  on guestbook (created_at desc);

create index if not exists guestbook_ip_hash_idx
  on guestbook (ip_hash, created_at);

-- 모든 접근은 Edge Function(service_role)을 통해서만. anon 키로는 차단.
alter table guestbook enable row level security;
