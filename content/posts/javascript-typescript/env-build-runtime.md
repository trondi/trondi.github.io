---
title: "env의 종류와 빌드·런타임 실행 시점 완전 정리"
date: "2026-04-19"
summary: ".env 파일 종류, NEXT_PUBLIC_ 접두사의 의미, 빌드 타임과 런타임에 어느 환경변수가 살아있는지 Next.js 기준으로 정리했다."
category: "JavaScript / TypeScript"
tags:
  - Environment Variables
  - Next.js
  - Build
  - Runtime
featured: false
---

# env의 종류와 빌드·런타임 실행 시점 완전 정리

## .env 파일 종류

Next.js는 여러 `.env` 파일을 우선순위에 따라 로드한다.

| 파일 | 적용 환경 | 커밋 여부 |
|---|---|---|
| `.env` | 모든 환경 | O (공통 기본값) |
| `.env.local` | 모든 환경 (로컬 오버라이드) | X (gitignore) |
| `.env.development` | `next dev` 실행 시 | O |
| `.env.production` | `next build / start` 시 | O |
| `.env.test` | 테스트 환경 | O |

**우선순위**: `.env.local` > `.env.development` (또는 `.env.production`) > `.env`

```bash
# .env (공통 기본값 — 커밋 가능)
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_SITE_NAME=My Blog

# .env.local (로컬 개발용 — 절대 커밋 금지)
DATABASE_URL=postgres://localhost:5432/dev
SECRET_KEY=local_dev_secret_key
```

---

## NEXT_PUBLIC_ — 클라이언트 노출 여부

환경변수는 기본적으로 **서버에서만** 접근 가능하다. 클라이언트(브라우저)에서도 사용하려면 `NEXT_PUBLIC_` 접두사가 필요하다.

```bash
# 서버 전용 (클라이언트에서 undefined)
DATABASE_URL=postgres://...
SECRET_API_KEY=sk_live_...

# 클라이언트에도 노출 (빌드 시 번들에 인라인됨)
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

```tsx
// 서버 컴포넌트
const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } } // ✅
});

// 클라이언트 컴포넌트
console.log(process.env.DATABASE_URL);       // undefined ❌
console.log(process.env.NEXT_PUBLIC_API_URL); // "https://api.example.com" ✅
```

> **주의**: `NEXT_PUBLIC_` 변수는 빌드 시 값이 번들에 **하드코딩**된다. 민감한 정보를 절대 넣으면 안 된다.

---

## 빌드 타임 vs 런타임

이것이 env에서 가장 헷갈리는 부분이다.

### 빌드 타임에 결정되는 것

`next build`가 실행될 때 값이 코드에 인라인된다.

- **`NEXT_PUBLIC_` 변수 전체**: 빌드 시점의 값으로 JS 번들에 대체된다.

```tsx
// 작성한 코드
const url = process.env.NEXT_PUBLIC_API_URL;

// 빌드 후 번들에서
const url = "https://api.example.com"; // 하드코딩됨
```

즉, 빌드 후에 `NEXT_PUBLIC_API_URL`을 바꿔도 **재빌드 없이는 적용되지 않는다.**

### 런타임에 결정되는 것

서버가 실제로 실행될 때 읽힌다.

- **`NEXT_PUBLIC_` 접두사 없는 서버 환경변수**: `process.env`로 언제든 접근 가능
- **`next start` 또는 배포 환경의 환경변수**

```tsx
// 서버 컴포넌트 / API Route — 런타임에 읽힘
export async function GET() {
  const key = process.env.SECRET_API_KEY; // 서버 실행 시점 값 사용
  // ...
}
```

---

## 실제 문제 사례

### 문제 1 — NEXT_PUBLIC 변수가 배포 후에도 이전 값

```
빌드 시: NEXT_PUBLIC_API_URL=https://staging.api.com
배포 후 환경변수 변경: NEXT_PUBLIC_API_URL=https://prod.api.com
→ 재빌드 없이는 여전히 staging URL 사용
```

**해결**: `NEXT_PUBLIC_` 변수 변경 시 반드시 재빌드.

### 문제 2 — 서버 전용 변수를 클라이언트에서 사용

```tsx
'use client';
const apiKey = process.env.SECRET_KEY; // undefined
fetch(`/api/data?key=${apiKey}`); // 의도치 않은 동작
```

**해결**: 클라이언트에서 직접 비밀 키를 사용하지 말고, 서버 API Route를 경유하게 설계.

---

## Next.js 런타임 환경변수 (Edge / Node.js)

`next.config.js`에서 런타임 환경변수를 명시적으로 노출할 수 있다.

```js
// next.config.js
module.exports = {
  serverRuntimeConfig: {
    // 서버에서만 접근 가능
    mySecret: process.env.MY_SECRET,
  },
  publicRuntimeConfig: {
    // 서버 + 클라이언트 모두 접근 가능 (NEXT_PUBLIC_ 대안)
    apiUrl: process.env.API_URL,
  },
};
```

```tsx
import getConfig from 'next/config';
const { serverRuntimeConfig, publicRuntimeConfig } = getConfig();
```

다만 App Router에서는 이 방식보다 `NEXT_PUBLIC_` 접두사 또는 서버 컴포넌트에서 직접 접근하는 방식을 권장한다.

---

## 환경별 설정 전략 정리

```
개발 환경  → .env + .env.development + .env.local
프로덕션  → .env + .env.production + 배포 플랫폼의 환경변수
테스트    → .env + .env.test
```

```bash
# 추천 구조
.env                  # 공통 기본값 (커밋 O)
.env.development      # 개발 전용 (커밋 O, 비밀값 X)
.env.production       # 프로덕션 기본값 (커밋 O, 비밀값 X)
.env.local            # 로컬 오버라이드 (커밋 X, gitignore)
.env.production.local # 프로덕션 로컬 테스트용 (커밋 X)
```

---

## 정리

| 구분 | 접근 가능 위치 | 결정 시점 |
|---|---|---|
| `NEXT_PUBLIC_FOO` | 서버 + 클라이언트 | 빌드 타임 (하드코딩) |
| `FOO` (접두사 없음) | 서버만 | 런타임 |
| `serverRuntimeConfig` | 서버만 | 런타임 |
| `publicRuntimeConfig` | 서버 + 클라이언트 | 런타임 |

핵심은 **"클라이언트에 보이면 안 되는 값은 절대 `NEXT_PUBLIC_` 붙이지 말 것"**, 그리고 **"`NEXT_PUBLIC_` 값은 빌드 후 변경 불가"** 두 가지다.
