---
title: "정적 블로그에 동적 기능 더하기 — GitHub Pages + Supabase Edge Function"
date: "2026-06-18"
summary: "서버가 없는 GitHub Pages 정적 블로그에 댓글·조회수·이모지 리액션·방명록을 붙였다. Supabase Edge Function을 백엔드로 쓰고, 익명이지만 식별 가능한 댓글·본인 제외 조회수·무료 운영까지 실제로 구축하며 내린 결정들을 정리했다."
category: "Project"
tags:
  - Supabase
  - Edge Function
  - Next.js
  - Static Site
  - Serverless
featured: false
---

# 정적 블로그에 동적 기능 더하기

이 블로그는 Next.js를 `output: "export"`로 빌드해 **GitHub Pages**에 올린 완전 정적 사이트다. 빠르고 무료지만 한 가지 한계가 있다 — **서버가 없다.** 그런데 댓글, 조회수, 방명록 같은 기능은 본질적으로 "누가 쓰면 어딘가에 저장"하는 동적 동작이다. 정적 호스팅만으론 불가능하다.

이 글은 그 한계를 **Supabase Edge Function**으로 우회하며 댓글·삭제·이모지 리액션·조회수·방명록·알림까지 붙인 기록이다.

---

## 왜 Supabase Edge Function인가

처음 떠올린 후보는 셋이었다.

| 방식 | 장점 | 왜 탈락/채택 |
|------|------|-------------|
| Giscus (GitHub Discussions) | 셋업 5분, 무료 | **GitHub 로그인 강제** — 익명 댓글 불가, IP 기록 불가 |
| 블로그를 Vercel로 이사 | Route Handler 그대로 사용 | 배포처 변경 부담, 댓글 하나 때문에 과함 |
| Supabase (Postgres + Edge Function) | 익명 가능, 데이터 통제권 | ✅ 채택 |

핵심 요구가 "**로그인 없는 익명 댓글 + IP 기록 + 삭제 정책 통제**"였는데, Giscus는 정확히 그 반대 지점(로그인 강제, 데이터가 GitHub 소유)이라 탈락했다. 데이터 통제권이 필요하면 결국 내 백엔드를 거쳐야 한다.

문제는 정적 호스팅엔 그 백엔드를 둘 곳이 없다는 것. 그래서 **Supabase Edge Function**(서버리스 함수)이 백엔드 역할을 대신한다.

```
[GitHub Pages 정적 블로그]
        │ fetch()
        ▼
[Supabase Edge Function]   ← IP 해시, 비밀번호 검증, 도배 차단
        │ service_role
        ▼
[Supabase Postgres]        ← comments / reactions / views / guestbook
```

---

## 설계 1 — 익명이지만 식별 가능한 댓글

디시인사이드의 "유동닉"처럼, **로그인 없이도 같은 사람인지 식별**하고 싶었다. 핵심은 두 가지다.

- **비밀번호**: 댓글마다 선택적으로 받아 PBKDF2 해시로 저장. 나중에 본인이 삭제할 때 검증용.
- **IP 해시**: `sha256(ip + salt)`로 저장. 평문 IP는 절대 저장하지 않는다.
  - 관리/도배 차단용 `ip_hash`(비공개)
  - 공개 식별자 `anon_id` = 같은 해시의 앞 6자리 → `홍길동 (a3f9k2)`처럼 표시

```ts
const ipHash = ip ? await sha256Hex(ip + IP_SALT) : null;
const anonId = ip ? (await sha256Hex(ip + slug + IP_SALT)).slice(0, 6) : null;
```

> 댓글은 `ip + slug`를 해시해서 "같은 글 안에서만" 식별되게 했다. 글이 다르면 같은 IP라도 ID가 달라져 추적을 막는다.

### 삭제는 되지만, 함부로는 안 되게

UPDATE/DELETE 엔드포인트를 **처음엔 아예 만들지 않았다.** RLS 정책도 두지 않아 클라이언트가 직접 테이블을 건드릴 방법이 원천 차단된다. 이후 "비밀번호를 입력하면 본인 삭제"를 추가할 때, 저장해둔 PBKDF2 해시를 **상수 시간 비교**로 검증한다.

```ts
// 타이밍 공격 방지 — 길이/내용 비교를 상수 시간으로
let diff = 0;
for (let i = 0; i < actual.length; i++) {
  diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
}
return diff === 0;
```

---

## 설계 2 — 빌드 타임 환경변수의 함정

정적 사이트라 댓글 API 주소를 `NEXT_PUBLIC_COMMENTS_API_URL`로 주입했는데, 여기서 한 번 막혔다.

`NEXT_PUBLIC_` 변수는 **런타임이 아니라 빌드 시점에 번들 코드로 박힌다.** 즉 빌드가 도는 GitHub Actions 환경에 값이 있어야 한다. 그런데 `.env`는 `.gitignore`라 깃에 안 올라가니, **GitHub 저장소 Secret으로 따로 등록**해야 빌드에 반영된다.

```
.env (로컬)         → 로컬 dev에서만 동작
GitHub Secret      → Actions 빌드 시 번들에 인라인 → 운영 동작
```

반대로 **Edge Function의 시크릿**(IP salt, 웹훅 URL 등)은 런타임 환경변수라 빌드와 무관하고, 값만 바꿔도 된다. "빌드 타임 vs 런타임"의 차이가 실무에서 이렇게 갈린다.

미설정 시 위젯이 깨지지 않도록, 환경변수가 없으면 컴포넌트가 `null`을 반환하게 했다. Supabase 셋업 전에도 빌드/배포가 안전하다.

```ts
const COMMENTS_API = process.env.NEXT_PUBLIC_COMMENTS_API_URL;
if (!COMMENTS_API) return null;   // 미설정이면 섹션 자체를 렌더 안 함
```

---

## 설계 3 — 조회수에서 본인 제외하기

내가 글을 열 때마다 조회수가 오르면 의미가 없다. 세 겹으로 막았다.

1. **본인 제외** — `localStorage`에 `blog_no_count` 플래그가 있으면 기록 요청을 생략. 한 번 켜두면 그 브라우저에 영구 유지된다(`sessionStorage`였다면 탭 닫을 때마다 다시 해야 한다).
2. **중복 방지** — 같은 IP 해시가 30분 내 재방문하면 카운트하지 않음.
3. **봇 제외** — 크롤러 user-agent는 카운트하지 않음.

집계는 `post_views`(카운터)와 `post_view_events`(이벤트 로그)를 **trigger로 연결한 hybrid 구조**로, 조회는 카운터 한 행만 빠르게 읽고 분석은 이벤트 로그로 한다.

---

## 설계 4 — 무료로 운영하기 위한 장치들

### CORS — 로컬과 운영 둘 다 허용

Edge Function이 `ALLOWED_ORIGIN`(콤마 구분 목록)에 있는 origin이면 그 값을 그대로 돌려준다. 덕분에 `localhost:3000`과 운영 도메인을 동시에 허용하면서, 아무 사이트나 호출하는 건 막는다.

### 일시정지 방지

Supabase 무료 프로젝트는 **7일간 요청이 없으면 일시정지**된다. GitHub Actions cron으로 주 2회 ping을 보내 살아있게 한다.

```yaml
on:
  schedule:
    - cron: "0 0 * * 1,4"   # 월/목
```

### 새 글 알림 — 무료 웹훅

댓글/방명록이 달리면 **Discord 웹훅**으로 즉시 알림을 보낸다. comments 함수의 INSERT 직후 `fetch`를 **await 없이**(fire-and-forget) 호출 — 알림 서버가 느리거나 죽어도 댓글 작성 응답이 지연되지 않는다.

```ts
// 알림 실패가 본 기능을 막지 않도록 await 하지 않는다
fetch(webhook, { method: "POST", body: JSON.stringify({ content }) })
  .catch(() => {});
```

> Discord/Slack/Telegram 모두 무료 웹훅을 제공한다. 본문 필드 이름만 다르다(Discord `content`, Slack `text`, Telegram `chat_id`+`text`).

---

## 보안 관점 정리

정적 사이트 + 서버리스 조합에서 지킨 원칙들:

- **service_role 키는 Edge Function 안에만** — 브라우저엔 절대 노출 안 됨. 모든 쓰기는 함수를 거친다.
- **응답에서 민감 컬럼 제외** — `ip_hash`, `password_hash`, `user_agent`는 SELECT 목록에서 빼서 클라이언트에 안 보낸다.
- **IP는 해시만** — 평문 저장 안 함. 개인정보 위험을 낮추고 처리방침에 명시.
- **도배 차단** — 같은 IP 60초 내 N개 초과 시 429.
- **시크릿은 코드/깃에 없음** — Supabase Secrets + GitHub Secrets로만 관리.

---

## 마치며

"정적 사이트라 동적 기능은 못 한다"는 건 옛말이다. **서버리스 함수 + 매니지드 DB**를 백엔드로 두면, 호스팅은 정적 그대로 두면서 댓글·조회수·방명록 같은 동적 기능을 무료로 붙일 수 있다.

핵심은 세 가지였다.

1. **데이터 통제권이 필요하면 내 백엔드를 거쳐라** — 익명·IP·삭제 정책을 원하면 Giscus 같은 호스티드 위젯으론 부족하다.
2. **빌드 타임 vs 런타임 환경변수를 구분하라** — `NEXT_PUBLIC_`은 빌드에 박히므로 CI Secret이 필요하다.
3. **무료 티어의 제약을 설계로 메워라** — 일시정지는 cron ping으로, 알림은 웹훅으로, 본인 제외는 localStorage로.

> 이 블로그의 댓글·리액션·조회수·방명록이 모두 이 구조로 동작한다. 글 맨 아래에서 직접 확인할 수 있다.
