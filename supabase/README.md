# 댓글 시스템 셋업 가이드 (Supabase)

익명 댓글(이름 + 선택 비밀번호, IP 해시 저장, 비밀번호 검증 삭제) 시스템.
블로그는 GitHub Pages 정적 배포이므로, 서버 역할은 Supabase Edge Function이 담당한다.

```
[GitHub Pages 정적 블로그] ── fetch ──▶ [Edge Function: comments] ──▶ [Postgres: comments 테이블]
```

## 1. Supabase 프로젝트 생성

1. https://supabase.com 가입 (GitHub 로그인 가능)
2. New Project → 이름/리전(Seoul `ap-northeast-2`) 선택 → 생성

## 2. 테이블 생성

Supabase Studio → SQL Editor → `migrations/0001_create_comments.sql` 내용 붙여넣고 Run.

## 3. Supabase CLI로 Edge Function 배포

```bash
# CLI 설치 (macOS)
brew install supabase/tap/supabase

# 로그인 + 프로젝트 연결 (ref는 대시보드 URL의 프로젝트 ID)
supabase login
supabase link --project-ref <PROJECT_REF>

# 시크릿 설정
#   IP_SALT:        아무 긴 랜덤 문자열 (예: openssl rand -hex 32)
#   ALLOWED_ORIGIN: 블로그 주소 (CORS)
supabase secrets set IP_SALT=$(openssl rand -hex 32)
supabase secrets set ALLOWED_ORIGIN=https://trondi.github.io

# 배포 — 익명 사용자가 호출하므로 JWT 검증 해제 필수
supabase functions deploy comments --no-verify-jwt
```

배포 후 엔드포인트:

```
https://<PROJECT_REF>.supabase.co/functions/v1/comments
```

## 4. 블로그 빌드 환경변수

정적 export 빌드 시점에 주입된다. 미설정이면 댓글 섹션이 렌더되지 않는다 (빌드는 정상).

- 로컬: `.env.local`

  ```
  NEXT_PUBLIC_COMMENTS_API_URL=https://<PROJECT_REF>.supabase.co/functions/v1/comments
  ```

- GitHub Pages 배포: 저장소 Settings → Secrets and variables → Actions →
  `NEXT_PUBLIC_COMMENTS_API_URL` 추가 후, 빌드 워크플로(`nextjs.yml`)의 build step에
  `env: NEXT_PUBLIC_COMMENTS_API_URL: ${{ secrets.NEXT_PUBLIC_COMMENTS_API_URL }}` 전달.

## 5. Keep-Alive

무료 프로젝트는 7일 미사용 시 일시정지된다.
`.github/workflows/supabase-keepalive.yml`이 주 2회 ping을 보낸다.
저장소 Secret `COMMENTS_API_URL`에 위 엔드포인트 주소를 등록할 것.

## 운영 메모

- **댓글 숨김**: Studio → Table Editor → comments → 해당 행 `is_hidden = true`
- **본인 삭제**: DELETE 엔드포인트에 댓글 id + 비밀번호를 보내면, 저장된
  PBKDF2 해시와 검증 후 일치할 때만 삭제. 비밀번호 없이 작성한 댓글은
  본인 삭제 불가(403) — 운영자만 Studio에서 처리.
- **수정 불가**: UPDATE 엔드포인트는 없다. RLS 정책도 없어 anon 키로는
  직접 쓰기 불가, 모든 변경은 Edge Function을 거친다.
- **IP**: 평문 저장하지 않는다. `ip_hash`(전체 해시, 비공개)와
  `anon_id`(글 단위 6자리, 공개) 두 가지만 저장.
- **비밀번호**: PBKDF2-SHA256 해시로 저장하며, 삭제 시 상수 시간 비교로 검증.
- **도배 차단**: 같은 IP 60초 내 3개 초과 시 429.
