---
title: "Next.js Proxy — 실제 프로젝트 코드로 보는 사용 기준"
date: "2026-05-04"
summary: "Next.js 16에서 middleware가 proxy로 바뀐 이유와 실제 프로젝트의 proxy.ts, custom Express proxy, SSE 처리 사례를 바탕으로 사용 기준을 정리한 초안."
category: "React / Next.js"
tags:
  - Next.js
  - Proxy
  - Middleware
  - Rewrite
  - BFF
featured: false
draft: true
---

# Next.js Proxy — 실제 프로젝트 코드로 보는 사용 기준

> 초안. `/Users/trond/Documents/BCORE/frontend/pandora-frontend/`와 `/Users/trond/Documents/BCORE/2309-front/smartsql-frontend/`의 proxy 관련 구현을 보고 정리했다.

Next.js 16부터 `middleware.ts`라는 이름은 `proxy.ts`로 바뀌었다. 기능 자체가 완전히 새로 생긴 것은 아니지만, 이름이 바뀐 이유는 중요하다. Next.js 공식 문서는 `middleware`라는 이름이 Express 미들웨어처럼 오해될 수 있고, 남용을 유도할 수 있기 때문에 네트워크 경계 앞에서 요청을 가로채는 목적을 더 명확히 하기 위해 `proxy`라는 이름으로 바꿨다고 설명한다. 참고: [Next.js Proxy docs](https://nextjs.org/docs/app/getting-started/proxy), [Renaming Middleware to Proxy](https://nextjs.org/docs/messages/middleware-to-proxy)

이 글은 Proxy의 API만 설명하는 글이 아니라, 실제 프로젝트에서 어떤 목적으로 쓰였고 어디까지 맡기는 것이 적절한지 정리하는 글이다.

---

## 먼저 결론

Next.js Proxy는 “요청이 라우트에 도달하기 전”에 실행되는 얇은 네트워크 경계 레이어다. 여기서는 다음 정도의 작업이 잘 맞는다.

- 짧은 alias URL을 정식 URL로 redirect
- 루트 경로를 기본 랜딩 페이지로 redirect
- 요청 헤더를 추가해서 뒤쪽 route/page에서 사용
- 특정 prefix 요청을 백엔드로 rewrite
- 인증이 필요한 페이지의 optimistic redirect
- A/B 테스트나 locale 같은 request 기반 분기

반대로 다음 작업은 Proxy에 과하게 넣지 않는 편이 좋다.

- 긴 DB 조회
- 복잡한 권한 검증 전체
- 오래 걸리는 API 호출
- SSE 같은 장기 스트리밍 연결
- WebSocket proxy
- 대량의 비즈니스 로직

공식 문서도 Proxy는 slow data fetching에 적합하지 않고, 단순 redirect는 먼저 `next.config`의 `redirects`를 고려하라고 설명한다. Proxy는 “요청 데이터가 필요하거나 조건이 복잡할 때” 쓰는 것이 맞다.

---

## Next.js Proxy의 위치

`proxy.ts`는 프로젝트 루트 또는 `src` 아래에 둔다. `app` 또는 `pages`와 같은 레벨이어야 한다.

```text
src
├─ app
└─ proxy.ts
```

기본 형태는 다음과 같다.

```ts
import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
```

`matcher`는 Proxy가 어떤 경로에서 실행될지 정한다. `matcher: ["/:path*"]`는 전체 요청에 대해 실행한다는 뜻이다.

공식 문서에 따르면 Proxy는 `headers`, `redirects` 이후, filesystem route가 매칭되기 전에 실행된다. 즉 Next.js page, route handler, 정적 파일보다 앞단에서 요청을 먼저 볼 수 있다. 참고: [proxy.js API reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

---

## 프로젝트 1: pandora-frontend의 proxy.ts

`pandora-frontend`에는 두 앱의 Proxy가 있다.

```text
/Users/trond/Documents/BCORE/frontend/pandora-frontend/
├─ apps/pandora-frontend/src/proxy.ts
└─ apps/pandora-mgt-front/src/proxy.ts
```

두 파일 모두 Next.js 16 스타일의 `export function proxy(request: NextRequest)`를 사용한다.

---

## pandora-mgt-front: redirect와 header 주입 중심

`apps/pandora-mgt-front/src/proxy.ts`는 비교적 단순하다.

역할은 세 가지다.

- 모든 요청에 `x-url` 헤더 추가
- `/` 요청을 `/dashboard`로 redirect
- 짧은 메뉴 경로를 실제 list 경로로 redirect

예를 들면 이런 구조다.

```ts
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-url", request.url);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const { pathname } = request.nextUrl;

  if (request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const redirectMap: Record<string, string> = {
    "/component": "/component/list",
    "/application": "/application/list",
    "/package": "/package/list",
    "/deploy": "/deploy/list",
  };

  if (redirectMap[pathname]) {
    const url = request.nextUrl.clone();
    url.pathname = redirectMap[pathname];
    return NextResponse.redirect(url);
  }

  return response;
}
```

이건 Proxy 사용처로 적절하다. 요청이 실제 page까지 가기 전에 URL만 정규화하면 되기 때문이다. DB 조회도 없고, 응답 body를 직접 만들지도 않는다.

다만 `matcher: ["/:path*"]`라서 모든 요청에서 실행된다. 현재 로직은 가볍기 때문에 큰 문제는 아니지만, Proxy 안의 분기가 늘어나면 `_next/static`, 이미지, favicon 같은 정적 리소스까지 매번 거치는 비용이 생길 수 있다.

개선한다면 matcher에서 정적 리소스를 제외하는 방식도 고려할 수 있다.

```ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
```

단, matcher를 좁힐 때는 실제로 Proxy가 필요한 경로가 빠지지 않는지 확인해야 한다.

---

## pandora-frontend: redirect + BFF rewrite + OAuth 경로 처리

`apps/pandora-frontend/src/proxy.ts`는 더 많은 일을 한다.

주요 역할은 다음이다.

- `x-url`, `x-request-id` 요청 헤더 추가
- `/`를 `/cluster/application/list`로 redirect
- `/container/add` 진입 시 필수 query 검증
- `/container`, `/host`, `/image` 같은 alias URL을 list 페이지로 redirect
- `/oauth2`, `/login`, `/logout` 경로를 백엔드로 rewrite
- `/api/proxy/*` 요청을 백엔드 API로 rewrite
- `/api/proxy/alarm/connect` SSE 경로는 Proxy에서 처리하지 않고 Route Handler로 넘김

전체 구조를 단순화하면 다음과 같다.

```text
브라우저
  → /api/proxy/containers
  → Next.js proxy.ts
  → /api/proxy prefix 제거
  → backendOrigin + /containers 로 rewrite
  → Backend API
```

이 프로젝트의 핵심 설계는 브라우저가 백엔드 origin을 직접 호출하지 않도록 하고, 항상 same-origin인 `/api/proxy`를 먼저 호출하게 만드는 것이다.

```ts
const API_PROXY_PREFIX = "/api/proxy";
```

CSR에서는 axios baseURL이 `/api/proxy`를 바라본다.

```js
// CSR: axios → /api/proxy 경유
const baseURL = "/api/proxy";
```

Proxy는 `/api/proxy` prefix를 제거한 뒤 백엔드 origin으로 rewrite한다.

```ts
const backendPath = stripProxyPrefix(pathname);
const destination = new URL(`${backendPath}${request.nextUrl.search}`, backendOrigin);

return NextResponse.rewrite(destination);
```

이 구조는 BFF(Backend for Frontend)에 가깝다. 브라우저 입장에서는 같은 origin으로 요청하므로 CORS 부담이 줄고, 백엔드 주소를 클라이언트 코드 곳곳에 흩뿌리지 않아도 된다.

---

## OAuth 경로는 /api/proxy 없이 백엔드로 보낸다

pandora-frontend에서는 OAuth 관련 경로를 별도로 처리한다.

```ts
const OAUTH_PREFIXES = ["/oauth2/", "/login/", "/logout/"];
```

이 경로들은 `/api/proxy` prefix 없이 백엔드로 바로 rewrite한다.

```text
/oauth2/authorization/keycloak
  → proxy.ts
  → backend /oauth2/authorization/keycloak
```

그리고 `X-Forwarded-*` 헤더를 명시적으로 설정한다.

```ts
requestHeaders.set("X-Forwarded-Host", `${request.nextUrl.hostname}:3002`);
requestHeaders.set("X-Forwarded-Port", "3002");
requestHeaders.set("X-Forwarded-Proto", request.nextUrl.protocol.replace(":", ""));
```

OAuth는 redirect URL, callback URL, host/protocol 정보에 민감하다. 백엔드가 “사용자가 실제로 접근한 프론트 주소”를 알아야 올바른 callback URL을 만들 수 있다. 그래서 이 경로를 일반 API proxy와 분리한 것은 합리적이다.

다만 포트 `3002`가 코드에 고정되어 있다. 환경별 포트가 달라질 수 있다면 env로 빼는 편이 안전하다.

---

## SSE는 proxy.ts가 아니라 Route Handler가 처리한다

pandora-frontend에서 가장 중요한 포인트는 SSE 처리다.

```ts
if (pathname === `${API_PROXY_PREFIX}/alarm/connect`) {
  return response;
}
```

이 코드는 `/api/proxy/alarm/connect`를 Proxy에서 rewrite하지 않고 그대로 통과시킨다. 실제 처리는 다음 파일이 담당한다.

```text
apps/pandora-frontend/src/app/api/proxy/alarm/connect/route.ts
```

이 Route Handler는 Node.js runtime을 명시한다.

```ts
export const runtime = "nodejs";
```

그리고 `fetch` 대신 `node:http` 또는 `node:https`로 백엔드 SSE에 직접 연결한다.

```ts
const client = protocol === "https" ? https : http;

const req = client.request(
  {
    hostname: host,
    port: port ? parseInt(port, 10) : defaultPort,
    path: "/alarm/connect",
    method: "GET",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
      accept: "text/event-stream",
      "cache-control": "no-cache",
    },
  },
  (res) => {
    // ReadableStream으로 그대로 전달
  },
);
```

프로젝트 README에도 이유가 적혀 있다.

| 경로 | 처리 | 이유 |
|---|---|---|
| `GET /api/proxy/alarm/connect` | `route.ts` | SSE 스트리밍. Proxy rewrite는 버퍼링 문제가 있음 |
| `GET /api/proxy/*` | `proxy.ts` | 일반 HTTP 요청은 rewrite로 충분 |

이 판단이 중요하다. Proxy는 짧은 request 분기와 rewrite에는 좋지만, 오래 열려 있어야 하는 streaming 연결을 맡기기에는 맞지 않을 수 있다. SSE나 WebSocket은 Route Handler, custom server, 별도 gateway처럼 스트리밍에 맞는 계층에서 처리하는 편이 낫다.

---

## 프로젝트 2: smartsql-frontend는 proxy.ts가 아니라 custom server

`/Users/trond/Documents/BCORE/2309-front/smartsql-frontend/`에는 `proxy.ts`나 `middleware.ts`가 없다.

대신 `server.js`에서 Express와 `http-proxy`를 직접 사용한다.

```text
smartsql-frontend
├─ server.js
├─ next.config.js
└─ pages
```

패키지 버전도 Next.js 13.4.19이고 Pages Router 기반이다.

```json
{
  "next": "13.4.19",
  "express": "^4.18.3",
  "http-proxy": "^1.18.1",
  "next-http-proxy-middleware": "^1.2.5"
}
```

핵심 구조는 다음이다.

```js
function getProxyServerWithWS(isWebSocket) {
  return httpProxy.createProxyServer({
    target: `${BE_PROXY}://${BE_URL}:${BE_PORT}`,
    changeOrigin: true,
    xfwd: false,
    ws: isWebSocket,
  });
}
```

프론트 서버는 `/api`로 시작하는 요청을 백엔드로 넘긴다.

```js
if (pathname.startsWith("/api")) {
  req.url = req.url.replace(/^\/api\/proxy/, "");
  apiProxy.web(req, res, (err) => {
    if (err) {
      console.error("API Proxy error:", err);
      res.status(500).send("Internal Server Error");
    }
  });
  return;
}
```

WebSocket은 별도 포트에서 upgrade 이벤트로 처리한다.

```js
wsApp.on("upgrade", (req, socket, head) => {
  if (!pathname.startsWith("/_next")) {
    wsProxy.ws(req, socket, head);
    return;
  }
});
```

즉 smartsql은 Next.js Proxy가 아니라 “Next.js 앞에 Express custom server를 세우고, 그 서버가 API/WebSocket proxy 역할까지 같이 맡는 구조”다.

---

## smartsql 구조의 장단점

장점은 명확하다.

- WebSocket upgrade를 직접 다룰 수 있다.
- HTTP proxy 동작을 세밀하게 제어할 수 있다.
- Next.js 버전이나 App Router 기능과 무관하게 동작한다.
- 기존 Pages Router 프로젝트에 얹기 쉽다.

하지만 비용도 있다.

- Next.js의 표준 배포 모델과 멀어진다.
- 서버 실행이 `next start`가 아니라 `node server.js`가 된다.
- Vercel 같은 표준 Next.js 플랫폼 최적화를 그대로 쓰기 어렵다.
- Express server, Next handler, API proxy, WS proxy가 한 파일에 섞인다.
- 보안/헤더/에러 처리 책임이 custom server로 넘어온다.

smartsql의 `next.config.js`에도 rewrites/serverRuntimeConfig를 시도했던 흔적이 주석으로 남아 있다.

```js
// async rewrites() {
//   return [
//     {
//       source: "/:path*",
//       destination: `${process.env.NEXT_PUBLIC_SERVER_PROXY}://${process.env.NEXT_PUBLIC_SERVER_URL}:${process.env.NEXT_PUBLIC_SERVER_PORT}/:path*`,
//     },
//   ];
// },
```

결국 API/WebSocket을 함께 처리하기 위해 custom server로 간 구조로 볼 수 있다.

---

## Next.js Proxy와 custom Express proxy 비교

| 기준 | Next.js proxy.ts | custom Express + http-proxy |
|---|---|---|
| 위치 | Next.js 라우팅 앞단 | Next.js 서버 바깥 |
| 사용 방식 | `NextResponse.redirect/rewrite/next` | `apiProxy.web`, `wsProxy.ws` |
| redirect/rewrite | 간단함 | 직접 구현 |
| API BFF | 가능 | 가능 |
| SSE | Route Handler와 분리 권장 | 직접 처리 가능 |
| WebSocket | 적합하지 않음 | upgrade 직접 처리 가능 |
| 배포 표준성 | Next.js 표준에 가까움 | custom server 운영 필요 |
| 복잡도 | 낮음 | 높음 |

일반 HTTP API rewrite와 URL 정규화는 `proxy.ts`가 더 단순하다. 반면 WebSocket처럼 HTTP upgrade를 직접 다뤄야 하는 경우에는 custom server나 별도 gateway가 필요할 수 있다.

---

## Proxy에서 하기 좋은 일

실제 프로젝트 기준으로 Proxy에 잘 맞는 작업은 다음이다.

### 1. 루트 경로 redirect

```ts
if (pathname === "/") {
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
```

사용자가 `/`로 들어왔을 때 실제 서비스 랜딩으로 보내는 정도는 Proxy에 적합하다.

### 2. alias URL 정규화

```ts
const redirectMap: Record<string, string> = {
  "/container": "/container/list",
  "/host": "/host/list",
};

if (redirectMap[pathname]) {
  const url = request.nextUrl.clone();
  url.pathname = redirectMap[pathname];
  return NextResponse.redirect(url);
}
```

이런 redirect는 page 컴포넌트까지 들어가기 전에 처리하는 편이 깔끔하다.

### 3. request header 주입

```ts
const requestHeaders = new Headers(request.headers);
requestHeaders.set("x-url", request.url);
requestHeaders.set("x-request-id", requestId);

return NextResponse.next({
  request: {
    headers: requestHeaders,
  },
});
```

뒤쪽 page, route handler, server-side 코드에서 원본 URL이나 request id가 필요하다면 Proxy에서 헤더로 넘길 수 있다.

### 4. same-origin API proxy

```ts
if (pathname.startsWith("/api/proxy")) {
  const backendPath = stripProxyPrefix(pathname);
  const destination = new URL(`${backendPath}${request.nextUrl.search}`, backendOrigin);
  return NextResponse.rewrite(destination);
}
```

브라우저는 `/api/proxy/*`만 호출하고, Proxy가 백엔드 origin으로 rewrite한다. CORS와 백엔드 origin 노출을 줄이는 데 도움이 된다.

---

## Proxy에서 조심해야 할 일

### 1. matcher를 너무 넓게 잡는 것

`matcher: ["/:path*"]`는 모든 요청에 대해 Proxy가 실행된다.

```ts
export const config = {
  matcher: ["/:path*"],
};
```

로직이 아주 가볍다면 괜찮다. 하지만 Proxy 안에서 조건이 많아지고 header/cookie 처리, 외부 호출이 들어가면 비용이 누적된다.

정적 리소스를 제외할 수 있다면 제외하는 편이 낫다.

```ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
```

### 2. 인증을 Proxy에만 의존하는 것

Proxy에서 로그인 여부를 보고 redirect할 수는 있다. 하지만 이것만으로 권한 검증을 끝내면 위험하다. 공식 문서도 Proxy matcher가 특정 경로를 제외하면 Server Function 요청도 같이 빠질 수 있으므로, 각 Server Function 내부에서도 인증/인가를 검증해야 한다고 설명한다.

Proxy는 UX 개선용 1차 관문이고, 실제 보안 판단은 API/Route Handler/Server Function 내부에서 다시 해야 한다.

### 3. 긴 스트리밍 연결을 Proxy에 맡기는 것

pandora-frontend는 SSE를 Proxy rewrite로 처리하지 않았다. 대신 `/api/proxy/alarm/connect/route.ts`에서 Node.js runtime으로 직접 stream을 전달한다.

이 패턴은 좋은 기준이 된다.

- 짧은 HTTP API: Proxy rewrite
- SSE: Route Handler에서 stream 반환
- WebSocket: custom server 또는 별도 gateway

### 4. 환경변수를 NEXT_PUBLIC_로만 두는 것

pandora와 smartsql 모두 백엔드 주소를 `NEXT_PUBLIC_BE_SERVER_*` 형태로 사용한다.

Proxy와 Route Handler는 서버에서 실행되므로 원칙적으로 `NEXT_PUBLIC_`가 필요하지 않다. 클라이언트 코드에서 직접 읽어야 하는 값이 아니라면 서버 전용 환경변수로 분리하는 편이 더 안전하다.

```text
BE_SERVER_PROTOCOL
BE_SERVER_URL
BE_SERVER_PORT
```

단, 이미 Docker build arg나 클라이언트 코드가 `NEXT_PUBLIC_`에 의존하고 있다면 한 번에 바꾸기보다 호출 구조를 먼저 정리해야 한다.

---

## 설계 기준: proxy.ts, Route Handler, custom server를 어떻게 나눌까

실제 프로젝트 기준으로는 다음 기준이 실용적이다.

| 요구사항 | 추천 위치 |
|---|---|
| 단순 redirect | `next.config redirects` 우선, 조건 필요하면 `proxy.ts` |
| alias URL 정규화 | `proxy.ts` |
| request header 추가 | `proxy.ts` |
| 일반 HTTP API BFF | `proxy.ts` rewrite 또는 Route Handler |
| 쿠키 전달이 필요한 SSR fetch | Server Component/Route Handler에서 직접 백엔드 호출 |
| SSE | Node.js runtime Route Handler |
| WebSocket | custom server, 별도 gateway, reverse proxy |
| 복잡한 인증/인가 | API/Route Handler/Server Function 내부 |

pandora-frontend는 이 기준에 가깝다. 일반 API는 `proxy.ts` rewrite로 처리하고, SSE는 Route Handler로 분리했다.

smartsql은 WebSocket까지 프론트 서버가 같이 맡아야 해서 custom Express server를 사용한다. Next.js Proxy로 완전히 대체하기보다는, HTTP API는 Proxy/Route Handler로 줄이고 WebSocket은 별도 계층으로 남기는 식의 점진 분리가 현실적이다.

---

## 마이그레이션 관점

기존 `middleware.ts`가 있다면 Next.js 16 기준으로 `proxy.ts`로 바꾸는 것이 맞다.

```bash
mv middleware.ts proxy.ts
```

함수 이름도 바꾼다.

```ts
// before
export function middleware(request: NextRequest) {}

// after
export function proxy(request: NextRequest) {}
```

Next.js 공식 업그레이드 문서는 `middleware` 파일 convention이 deprecated 되었고 `proxy`로 이름이 바뀌었다고 설명한다. Next.js 16 codemod도 이 변경을 처리할 수 있다. 참고: [Next.js Version 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)

다만 custom Express proxy를 무조건 `proxy.ts`로 옮길 수는 없다. smartsql처럼 WebSocket upgrade를 직접 처리한다면 Next.js Proxy만으로는 목적이 다르다.

---

## 정리

Next.js Proxy는 Express middleware처럼 앱 내부 로직을 계속 이어 붙이는 곳이 아니다. 이름 그대로 애플리케이션 앞단의 네트워크 경계에서 요청을 보고 redirect, rewrite, header/cookie 조작을 수행하는 얇은 레이어다.

두 프로젝트를 비교하면 기준이 명확해진다.

- `pandora-mgt-front`: redirect와 header 주입 중심. Proxy에 적합하다.
- `pandora-frontend`: 일반 HTTP API는 `/api/proxy`로 통일하고 Proxy에서 백엔드로 rewrite한다. SSE는 Route Handler로 분리한다.
- `smartsql-frontend`: `proxy.ts`가 아니라 custom Express server와 `http-proxy`로 API/WebSocket을 처리한다. WebSocket 요구가 있으면 이런 구조나 별도 gateway가 필요할 수 있다.

실무 기준으로는 이렇게 기억하면 된다.

- URL을 바꾸는 일은 Proxy에 잘 맞는다.
- 일반 HTTP API를 백엔드로 넘기는 BFF rewrite도 Proxy에 맞다.
- 오래 유지되는 연결은 Proxy보다 Route Handler나 custom server가 낫다.
- 인증/인가의 최종 판단은 Proxy가 아니라 실제 API 처리 지점에서 해야 한다.
- Proxy는 가능하면 작게 유지하고, matcher를 좁힐 수 있으면 좁힌다.

---

## 참고 문서

- [Next.js Proxy docs](https://nextjs.org/docs/app/getting-started/proxy)
- [proxy.js API reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Renaming Middleware to Proxy](https://nextjs.org/docs/messages/middleware-to-proxy)
- [Next.js Version 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
