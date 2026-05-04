---
title: "Next.js Proxy로 BFF 만들기 — /api/proxy 패턴"
date: "2026-05-04"
summary: "브라우저 API 요청을 /api/proxy로 통일하고 Next.js Proxy에서 백엔드로 rewrite하는 BFF 패턴을 실제 프로젝트 구조를 바탕으로 정리했다."
category: "React / Next.js"
tags:
  - Next.js
  - Proxy
  - BFF
  - Rewrite
  - API
featured: false
---

# Next.js Proxy로 BFF 만들기 — /api/proxy 패턴

프론트엔드에서 백엔드 API를 직접 호출하면 CORS, 쿠키, 환경별 origin 관리 문제가 생긴다.

예를 들어 브라우저 코드에서 백엔드 주소를 직접 들고 있으면 환경마다 baseURL을 바꿔야 한다.

```ts
const baseURL = "https://backend.example.com";
```

이 방식 대신 브라우저는 항상 같은 origin의 `/api/proxy`만 호출하고, Next.js Proxy가 백엔드로 rewrite하는 구조를 만들 수 있다.

```text
Browser
  → /api/proxy/users
  → Next.js proxy.ts
  → Backend /users
```

이 구조는 가벼운 BFF(Backend for Frontend) 패턴으로 볼 수 있다.

---

## 왜 /api/proxy를 쓰는가

브라우저에서 백엔드를 직접 호출하는 구조는 단순하지만 운영 환경에서 불편해진다.

```text
Browser
  → https://api.dev.example.com/users
  → https://api.stage.example.com/users
  → https://api.prod.example.com/users
```

프론트 코드가 백엔드 origin을 직접 알게 되고, CORS 설정도 맞춰야 한다.

`/api/proxy` 패턴을 쓰면 브라우저 요청은 항상 같은 origin으로 고정된다.

```text
Browser
  → https://front.example.com/api/proxy/users
```

백엔드 origin은 서버 쪽 Proxy가 결정한다.

```text
Next.js proxy.ts
  → https://backend.example.com/users
```

장점은 명확하다.

- 브라우저는 same-origin만 호출한다.
- CORS 설정 부담이 줄어든다.
- 백엔드 origin이 클라이언트 코드에 퍼지지 않는다.
- 환경별 backend URL 교체가 쉬워진다.
- 쿠키 기반 인증 흐름을 맞추기 쉽다.
- API 호출 경로가 `/api/proxy`로 통일된다.

---

## 클라이언트 baseURL

먼저 API prefix를 정한다.

```ts
const API_PROXY_PREFIX = "/api/proxy";
```

클라이언트 axios는 백엔드 origin을 모른다.

```ts
import axios from "axios";

export const api = axios.create({
  baseURL: "/api/proxy",
  withCredentials: true,
});
```

브라우저에서는 이렇게 호출한다.

```ts
api.get("/users");
```

실제 요청 경로는 다음이 된다.

```text
GET /api/proxy/users
```

---

## Proxy에서 백엔드 origin 만들기

Proxy는 서버에서 실행되므로 백엔드 origin을 환경변수에서 읽을 수 있다.

```ts
const readBackendOrigin = () => {
  const protocol = process.env.BE_SERVER_PROTOCOL;
  const host = process.env.BE_SERVER_URL;
  const port = process.env.BE_SERVER_PORT;

  if (!protocol || !host) {
    return null;
  }

  return port ? `${protocol}://${host}:${port}` : `${protocol}://${host}`;
};
```

클라이언트에서 직접 읽을 필요가 없다면 `NEXT_PUBLIC_` 접두사를 붙이지 않는 편이 낫다.

```text
BE_SERVER_PROTOCOL=https
BE_SERVER_URL=backend.example.com
BE_SERVER_PORT=443
```

`NEXT_PUBLIC_` 환경변수는 클라이언트 번들에 노출될 수 있다. Proxy에서만 필요한 값이라면 서버 전용 이름을 쓰는 것이 더 적절하다.

---

## /api/proxy prefix 제거하기

백엔드는 `/api/proxy/users`라는 경로를 모른다. 백엔드에는 `/users`만 전달해야 한다.

```ts
const stripProxyPrefix = (pathname: string) => {
  const strippedPath = pathname.slice(API_PROXY_PREFIX.length);
  return strippedPath.startsWith("/") ? strippedPath : `/${strippedPath}`;
};
```

예시는 다음과 같다.

| 브라우저 요청 | 백엔드 요청 |
|---|---|
| `/api/proxy/users` | `/users` |
| `/api/proxy/users?page=1` | `/users?page=1` |
| `/api/proxy/orders/10` | `/orders/10` |

---

## rewrite 구현

전체 코드는 다음처럼 구성할 수 있다.

```ts
import { NextRequest, NextResponse } from "next/server";

const API_PROXY_PREFIX = "/api/proxy";

const readBackendOrigin = () => {
  const protocol = process.env.BE_SERVER_PROTOCOL;
  const host = process.env.BE_SERVER_URL;
  const port = process.env.BE_SERVER_PORT;

  if (!protocol || !host) return null;

  return port ? `${protocol}://${host}:${port}` : `${protocol}://${host}`;
};

const stripProxyPrefix = (pathname: string) => {
  const strippedPath = pathname.slice(API_PROXY_PREFIX.length);
  return strippedPath.startsWith("/") ? strippedPath : `/${strippedPath}`;
};

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith(API_PROXY_PREFIX)) {
    return NextResponse.next();
  }

  const backendOrigin = readBackendOrigin();

  if (!backendOrigin) {
    return NextResponse.json(
      { message: "Backend proxy environment is not configured." },
      { status: 500 },
    );
  }

  const backendPath = stripProxyPrefix(pathname);
  const destination = new URL(
    `${backendPath}${request.nextUrl.search}`,
    backendOrigin,
  );

  return NextResponse.rewrite(destination);
}

export const config = {
  matcher: ["/api/proxy/:path*"],
};
```

여기서 핵심은 세 가지다.

- Proxy 실행 범위를 `/api/proxy/:path*`로 좁힌다.
- 백엔드 origin은 서버 환경변수에서 읽는다.
- 백엔드에 넘길 때 `/api/proxy` prefix를 제거한다.

---

## request id 헤더 추가

디버깅을 위해 Proxy에서 request id를 추가할 수 있다.

```ts
export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-url", request.url);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}
```

API rewrite와 같이 쓰려면 destination rewrite에 request headers를 넘긴다.

```ts
return NextResponse.rewrite(destination, {
  request: {
    headers: requestHeaders,
  },
});
```

백엔드 로그에 `x-request-id`를 같이 남기면 프론트 요청과 백엔드 요청을 연결해서 보기 쉬워진다.

---

## OAuth 경로는 별도로 볼 수 있다

OAuth 로그인은 일반 API와 다르게 redirect URL, host, protocol 정보에 민감하다.

예를 들어 다음 경로는 백엔드 OAuth 엔드포인트로 직접 넘겨야 할 수 있다.

```text
/oauth2/authorization/keycloak
/login/oauth2/code/keycloak
/logout
```

이런 경우 `/api/proxy` prefix를 붙이지 않고 별도 분기로 처리한다.

```ts
const OAUTH_PREFIXES = ["/oauth2/", "/login/", "/logout/"];

if (OAUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
  const backendOrigin = readBackendOrigin();

  if (!backendOrigin) {
    return NextResponse.json(
      { message: "Backend proxy environment is not configured." },
      { status: 500 },
    );
  }

  const destination = new URL(
    `${pathname}${request.nextUrl.search}`,
    backendOrigin,
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("X-Forwarded-Host", request.nextUrl.host);
  requestHeaders.set("X-Forwarded-Proto", request.nextUrl.protocol.replace(":", ""));

  return NextResponse.rewrite(destination, {
    request: {
      headers: requestHeaders,
    },
  });
}
```

OAuth 서버가 실제 프론트 host와 protocol을 알아야 callback URL을 올바르게 만들 수 있기 때문이다.

---

## SSR에서는 proxy를 꼭 거치지 않아도 된다

Server Component나 Route Handler에서 백엔드를 호출할 때는 굳이 `/api/proxy`를 거칠 필요가 없다.

```tsx
export default async function Page() {
  const res = await fetch(`${process.env.BE_ORIGIN}/users`, {
    headers: {
      Cookie: cookieHeader,
    },
  });

  const users = await res.json();

  return <UserList users={users} />;
}
```

CSR은 `/api/proxy`를 거치고, SSR은 서버에서 백엔드를 직접 호출하는 방식도 가능하다.

```text
CSR
  Browser → /api/proxy → Proxy → Backend

SSR
  Server Component → Backend
```

이렇게 나누면 브라우저에서는 CORS와 origin 노출을 줄이고, 서버에서는 불필요한 내부 hop을 줄일 수 있다.

---

## 주의할 점

이 구조도 만능은 아니다.

- Proxy에서 인증/인가를 끝내면 안 된다.
- 백엔드에서도 권한 검증을 해야 한다.
- SSE나 WebSocket은 일반 rewrite로 처리하기 어렵다.
- 백엔드 origin 환경변수는 가능하면 서버 전용으로 둔다.
- matcher를 `/api/proxy/:path*`처럼 좁히는 편이 낫다.
- 에러 응답 형식을 통일해야 디버깅이 쉽다.

특히 보안 관점에서 Proxy는 최종 방어선이 아니다. 사용자가 Proxy를 우회할 수 없더라도, 실제 데이터 접근 권한은 백엔드나 Route Handler 내부에서 다시 검증해야 한다.

---

## 정리

`/api/proxy` 패턴은 Next.js 앱에서 BFF를 가볍게 만들기 좋은 방식이다.

브라우저는 백엔드 origin을 모르고, Next.js Proxy가 요청을 백엔드로 rewrite한다.

다만 Proxy는 얇게 유지해야 한다. 일반 HTTP API rewrite까지는 적합하지만, 복잡한 인증 로직이나 장기 스트리밍 연결은 Route Handler나 별도 서버로 분리하는 편이 낫다.

---

## 참고 문서

- [Next.js Proxy docs](https://nextjs.org/docs/app/getting-started/proxy)
- [proxy.js API reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [NextResponse API](https://nextjs.org/docs/app/api-reference/functions/next-response)
