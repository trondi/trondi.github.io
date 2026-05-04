---
title: "Next.js Proxy란 무엇인가 — middleware에서 proxy로 바뀐 이유"
date: "2026-05-04"
summary: "Next.js 16에서 middleware.ts가 proxy.ts로 바뀐 이유와 Proxy의 실행 위치, matcher, redirect, rewrite 사용 기준을 정리했다."
category: "React / Next.js"
tags:
  - Next.js
  - Proxy
  - Middleware
  - Routing
featured: false
---

# Next.js Proxy란 무엇인가 — middleware에서 proxy로 바뀐 이유

Next.js 16부터 기존 `middleware.ts` convention은 `proxy.ts`로 이름이 바뀌었다.

기능이 완전히 새로 생긴 것은 아니다. 요청이 실제 page, route handler, static file에 도달하기 전에 가로채서 redirect, rewrite, header 조작 등을 수행하는 역할은 유지된다.

다만 이름이 바뀐 이유가 중요하다. `middleware`라는 이름은 Express middleware처럼 애플리케이션 내부 로직을 계속 이어 붙이는 곳처럼 오해되기 쉽다. Next.js의 Proxy는 그런 용도보다는 애플리케이션 앞단의 네트워크 경계에서 요청을 다루는 얇은 계층에 가깝다.

참고: [Next.js Proxy docs](https://nextjs.org/docs/app/getting-started/proxy), [Renaming Middleware to Proxy](https://nextjs.org/docs/messages/middleware-to-proxy)

---

## 기본 형태

`proxy.ts`는 프로젝트 루트 또는 `src` 아래에 둔다.

```text
src
├─ app
└─ proxy.ts
```

기본 코드는 다음과 같다.

```ts
import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
```

`proxy` 함수는 `NextRequest`를 받고, `NextResponse`를 반환한다. `NextResponse.next()`는 요청을 그대로 다음 단계로 넘긴다.

---

## Proxy는 언제 실행되는가

Proxy는 Next.js 라우팅이 실제 페이지를 찾기 전에 실행된다.

대략적인 흐름은 다음과 같다.

```text
Request
  → headers
  → redirects
  → proxy.ts
  → beforeFiles rewrites
  → static files / app routes / pages routes
  → afterFiles rewrites
  → dynamic routes
```

즉 Proxy는 page component나 route handler보다 앞에서 요청을 볼 수 있다.

공식 문서의 API reference도 Proxy가 `headers`, `redirects` 이후, filesystem route 매칭 전에 실행된다고 설명한다. 참고: [proxy.js API reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

---

## Proxy에서 할 수 있는 일

대표적으로 다음 작업이 가능하다.

- `NextResponse.next()`로 그대로 통과
- `NextResponse.redirect()`로 다른 URL로 이동
- `NextResponse.rewrite()`로 내부 또는 외부 URL로 rewrite
- request header 추가
- response header 추가
- cookie 읽기/쓰기
- matcher로 실행 경로 제한

예를 들어 `/`로 들어온 사용자를 `/dashboard`로 보낼 수 있다.

```ts
import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}
```

---

## Proxy에 잘 맞는 작업

Proxy는 가볍고 빠른 요청 분기에 적합하다.

- 루트 경로 redirect
- 짧은 alias URL 정규화
- locale 분기
- 인증 여부에 따른 1차 redirect
- request id 헤더 추가
- same-origin API rewrite
- A/B 테스트 분기

예를 들어 `/container`를 `/container/list`로 정규화할 수 있다.

```ts
const redirectMap: Record<string, string> = {
  "/container": "/container/list",
  "/host": "/host/list",
};

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (redirectMap[pathname]) {
    const url = request.nextUrl.clone();
    url.pathname = redirectMap[pathname];
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
```

이런 URL 정규화는 page component까지 들어가기 전에 처리하는 편이 깔끔하다.

---

## Proxy에 넣지 않는 편이 좋은 작업

다음 작업은 Proxy에 과하게 넣지 않는 편이 좋다.

- 긴 DB 조회
- 복잡한 비즈니스 로직
- 대량의 권한 계산
- 오래 걸리는 외부 API 호출
- SSE 같은 장기 스트리밍 연결
- WebSocket proxy
- 무거운 로깅/분석 처리

Proxy는 모든 요청 앞단에서 실행될 수 있기 때문에, 무거워지면 전체 애플리케이션의 병목이 된다.

공식 문서도 Proxy가 slow data fetching에 적합하지 않고, 단순 redirect는 먼저 `next.config`의 `redirects`를 고려하라고 설명한다. Proxy는 요청 데이터가 필요하거나 조건이 복잡할 때 쓰는 것이 맞다.

---

## matcher를 좁혀야 하는 이유

`matcher: ["/:path*"]`는 모든 요청에 대해 Proxy가 실행된다는 뜻이다.

```ts
export const config = {
  matcher: ["/:path*"],
};
```

로직이 아주 가볍다면 괜찮다. 하지만 정적 파일, 이미지, favicon까지 모두 거치게 된다.

필요하다면 정적 리소스를 제외할 수 있다.

```ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
```

또는 API proxy만 처리한다면 matcher를 더 좁힐 수 있다.

```ts
export const config = {
  matcher: ["/api/proxy/:path*"],
};
```

matcher를 좁힐수록 불필요한 실행을 줄일 수 있다. 단, 실제로 Proxy가 필요한 경로가 빠지지 않았는지 확인해야 한다.

---

## 인증은 어디까지 맡길까

Proxy에서 로그인 여부를 보고 redirect할 수는 있다.

```ts
export function proxy(request: NextRequest) {
  const token = request.cookies.get("access-token");

  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}
```

하지만 이것만으로 권한 검증을 끝내면 위험하다. Proxy는 UX 개선용 1차 관문에 가깝다. 실제 보안 판단은 API, Route Handler, Server Function, 백엔드 내부에서 다시 해야 한다.

특히 matcher에서 특정 경로가 빠지면 해당 요청은 Proxy를 거치지 않는다. 따라서 중요한 데이터 접근 제어를 Proxy 하나에만 의존하면 안 된다.

---

## 정리

Next.js Proxy는 애플리케이션 내부 로직을 처리하는 곳이 아니라, 요청이 앱에 들어오기 전 네트워크 경계에서 가볍게 분기하는 곳이다.

- URL을 바꿔야 하면 Proxy가 적합하다.
- request header를 추가해야 하면 Proxy가 적합하다.
- 일반 HTTP API를 rewrite해야 하면 Proxy를 고려할 수 있다.
- 오래 유지되는 연결이나 무거운 로직은 Proxy 밖으로 빼는 것이 낫다.
- 인증/인가의 최종 판단은 Proxy가 아니라 실제 API 처리 지점에서 해야 한다.

Proxy는 강력하지만 작게 유지해야 한다. 이름이 `middleware`에서 `proxy`로 바뀐 이유도 이 점을 더 분명하게 보여준다.

---

## 참고 문서

- [Next.js Proxy docs](https://nextjs.org/docs/app/getting-started/proxy)
- [proxy.js API reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Renaming Middleware to Proxy](https://nextjs.org/docs/messages/middleware-to-proxy)
- [Next.js Version 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
