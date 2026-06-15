-- ─────────────────────────────────────────────────────────────────────────────
-- comments — 익명 댓글 (디시 스타일: 이름 + 선택적 비밀번호)
--
-- 설계 원칙
--  * 로그인 없음. 댓글마다 이름 + (선택) 비밀번호를 받는다.
--  * password_hash: 비밀번호의 PBKDF2 해시. 지금은 삭제 기능을 열지 않지만
--    나중에 "비밀번호 검증 후 본인 삭제" 정책으로 바꿀 때 소급 적용 가능.
--  * ip_hash:    sha256(ip + salt). 관리/도배 차단용. 절대 클라이언트에 노출 금지.
--  * anon_id:    sha256(ip + slug + salt) 앞 6자리. "같은 글 안에서 같은 사람"
--                표시용 공개 식별자. 글이 다르면 같은 IP라도 ID가 달라진다.
--  * is_hidden:  신고/스팸 댓글 숨김 처리용 (운영자가 Studio에서 토글).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists comments (
  id            uuid        primary key default gen_random_uuid(),
  post_slug     text        not null,
  author_name   text        not null check (char_length(author_name) between 1 and 30),
  content       text        not null check (char_length(content) between 1 and 1000),
  password_hash text,
  ip_hash       text,
  anon_id       text,
  user_agent    text,
  is_hidden     boolean     not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists comments_post_slug_idx
  on comments (post_slug, created_at);

create index if not exists comments_ip_hash_idx
  on comments (ip_hash, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
--  * 정책을 하나도 만들지 않으면 anon/authenticated 키로는 아무것도 못 한다.
--  * 모든 접근은 Edge Function(service_role)을 통해서만 이뤄진다.
--    → 클라이언트가 직접 INSERT/UPDATE/DELETE 할 방법이 원천 차단됨.
--    → SELECT도 Edge Function이 공개 컬럼만 골라서 반환 (ip_hash 노출 방지).
-- ─────────────────────────────────────────────────────────────────────────────

alter table comments enable row level security;
