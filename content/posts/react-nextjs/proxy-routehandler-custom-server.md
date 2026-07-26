---
title: "proxy.ts, Route Handler, custom server - 무엇을 어디에 둘까"
date: "2026-07-19"
summary: "요청을 가로채 백엔드로 넘기는 자리가 Next.js에는 셋이다. proxy.ts로 충분한 경우, Route Handler가 필요한 경우, custom server까지 가야 하는 경우를 두 프로젝트의 선택을 놓고 갈랐다."
category: "React / Next.js"
tags:
  - Next.js
  - Proxy
  - Route Handler
  - Architecture
featured: false
---

# proxy.ts, Route Handler, custom server - 무엇을 어디에 둘까

> 같은 "요청을 백엔드로 넘긴다"인데 세 군데에 놓을 수 있다. 무엇을 기준으로 고를까.

## 자리가 셋이라는 것부터

브라우저 요청을 백엔드로 중계하는 코드를 Next.js에서 어디에 둘지 고르라면 선택지는 셋이다.

- **`proxy.ts`** - Next.js 라우팅 앞단에서 도는 얇은 레이어다. `redirect`, `rewrite`, 헤더 조작을 한다.
- **Route Handler** - `app/api/**/route.ts`에서 요청을 직접 받아 응답을 만든다. 런타임을 고를 수 있다.
- **custom server** - Next.js 앞에 Express 같은 서버를 세우고 그 서버가 중계까지 맡는다.

아래로 갈수록 제어력이 커지고 표준 배포 모델에서는 멀어진다. 어디까지 내려갈지는 **무엇을 중계하느냐**가 정한다.

이 글은 서로 다른 선택을 한 두 프로젝트를 놓고 그 경계를 그린다. App Router 기반으로 `proxy.ts`를 쓰는 쪽을 A, Pages Router에 custom Express server를 세운 쪽을 B라고 부르겠다.

## 프로젝트 A - proxy.ts와 Route Handler의 분업

A는 일반 API를 `proxy.ts` 한 곳에서 처리한다. 브라우저는 항상 same-origin인 `/api/proxy` 아래로 호출하고, `proxy.ts`가 prefix를 떼어 백엔드로 `rewrite`한다. 이 BFF 패턴 자체는
[Next.js Proxy로 BFF 만들기](/posts/nextjs-proxy-bff-pattern)에 정리해뒀다.

다만 전부를 `proxy.ts`에 맡기지는 않았다. SSE만 따로 빠져 있다.

```ts
// proxy.ts - SSE 경로는 rewrite하지 않고 통과시킨다
const SSE_PASS_THROUGH_PATHS = [ /* 알람 SSE 경로들 */ ];
if (SSE_PASS_THROUGH_PATHS.includes(pathname)) {
  return response;   // Route Handler가 이어받는다
}
```

Edge에서 도는 `rewrite`가 스트리밍 응답을 버퍼링할 수 있어서, SSE는 Node.js 런타임 Route Handler가 `node:http`로 직접 릴레이한다. 이 분업의 이유는
[Next.js에서 SSE와 WebSocket은 Proxy로 처리해도 될까](/posts/nextjs-proxy-sse-websocket)에서 다뤘다.

정리하면 A의 경계는 **연결의 수명**에 그어져 있다. 짧게 끝나는 요청은 `proxy.ts`가, 오래 열려 있는 스트림은 Route Handler가 맡는다.

## 프로젝트 B - custom server까지 내려간 이유

B에는 `proxy.ts`도 `middleware.ts`도 없다. 대신 `server.js`에서 Express와 `http-proxy`를 직접 쓴다.

```js
function getProxyServerWithWS(isWebSocket) {
  return httpProxy.createProxyServer({
    target: `${protocol}://${host}:${port}`,
    changeOrigin: true,
    ws: isWebSocket,
  });
}
```

HTTP API는 경로를 보고 넘긴다.

```js
if (pathname.startsWith('/api')) {
  req.url = req.url.replace(/^\/api\/proxy/, '');
  apiProxy.web(req, res, (err) => {
    if (err) res.status(500).send('Internal Server Error');
  });
  return;
}
```

여기까지는 `proxy.ts`로도 된다. 내려간 진짜 이유는 그다음이다.

```js
wsApp.on('upgrade', (req, socket, head) => {
  if (!pathname.startsWith('/_next')) {
    wsProxy.ws(req, socket, head);
  }
});
```

**WebSocket이다.** WebSocket은 HTTP `upgrade` 핸드셰이크로 프로토콜을 바꾸는데, `proxy.ts`는 요청과 응답을 다루는 레이어라 소켓 자체를 넘겨받을 자리가 없다. `upgrade` 이벤트를 직접 잡으려면 Next.js 바깥의 서버가 필요하다.

흥미로운 건 B의 `next.config.js`에 `rewrites`를 시도했던 흔적이 주석으로 남아 있다는 점이다. 처음엔 표준 방식으로 가려다, WebSocket까지 같이 처리해야 해서 custom server로 옮겨간 경로가 보인다.

## 두 접근의 값

| 기준 | proxy.ts | custom Express + http-proxy |
|---|---|---|
| 위치 | Next.js 라우팅 앞단 | Next.js 서버 바깥 |
| redirect / rewrite | 내장 API로 간단 | 직접 구현 |
| API BFF | 가능 | 가능 |
| SSE | Route Handler로 분리 권장 | 직접 처리 가능 |
| WebSocket | 불가 | `upgrade` 직접 처리 |
| 실행 | `next start` | `node server.js` |
| 배포 표준성 | 높음 | 별도 운영 필요 |
| 복잡도 | 낮음 | 높음 |

custom server의 비용은 코드 난이도보다 **책임 이전**에 있다. 서버 실행 방식이 `next start`에서 벗어나고, 헤더·에러 처리·보안이 전부 그 파일로 넘어온다. Express 핸들러와 Next 핸들러, API proxy, WS proxy가 한곳에 섞이기도 쉽다.

## 판단 기준

두 프로젝트를 겹쳐보면 기준이 나온다.

| 요구사항 | 두는 자리 |
|---|---|
| 단순 redirect | `next.config`의 `redirects`, 조건이 필요하면 `proxy.ts` |
| alias URL 정규화 | `proxy.ts` |
| request 헤더 추가 | `proxy.ts` |
| 일반 HTTP API BFF | `proxy.ts` rewrite 또는 Route Handler |
| 쿠키가 필요한 SSR fetch | Server Component나 Route Handler에서 백엔드 직접 호출 |
| SSE | Node.js 런타임 Route Handler |
| WebSocket | custom server, 별도 gateway, reverse proxy |
| 복잡한 인증·인가 | Route Handler나 서버 로직 내부 |

한 줄로 줄이면 이렇다. **요청이 짧으면 위에서, 연결이 길면 아래에서 처리한다.** redirect와 rewrite는 요청 하나로 끝나니 앞단이 맞고, SSE는 응답을 계속 흘려보내야 하니 런타임을 고를 수 있는 Route Handler가 맞고, WebSocket은 프로토콜 자체를 바꾸니 서버가 필요하다.

B처럼 이미 custom server로 간 프로젝트라고 전부 되돌릴 필요도 없다. HTTP API만 `proxy.ts`나 Route Handler로 덜어내고 WebSocket은 별도 계층으로 남기는 점진적 분리가 현실적이다.

## 곁가지 - 환경변수를 NEXT_PUBLIC_로만 두는 문제

두 프로젝트 모두 백엔드 주소를 `NEXT_PUBLIC_` 접두사가 붙은 변수로 읽고 있었다.

그런데 `proxy.ts`와 Route Handler는 **서버에서 실행된다.** 클라이언트 번들이 읽을 필요가 없는 값이라면 `NEXT_PUBLIC_`을 뗀 서버 전용 변수가 더 안전하다. 접두사가 붙는 순간 그 값은 브라우저로 내려가는 번들에 박제된다.

```text
BE_SERVER_PROTOCOL
BE_SERVER_URL
BE_SERVER_PORT
```

다만 Docker build arg나 클라이언트 코드가 이미 `NEXT_PUBLIC_`에 의존하고 있다면 변수 이름부터 바꾸는 건 순서가 틀렸다. 누가 그 값을 읽는지, 호출 구조를 먼저 정리해야 한다.

## 곁가지 - middleware.ts에서 proxy.ts로

Next.js 16에서 `middleware` 파일 컨벤션이 `proxy`로 바뀌었다. 기존 프로젝트라면 파일과 함수 이름을 함께 바꾼다.

```ts
// before
export function middleware(request: NextRequest) {}

// after
export function proxy(request: NextRequest) {}
```

이름이 바뀐 배경은 [Next.js Proxy란 무엇인가](/posts/nextjs-proxy-basics)에 정리했다. 공식 codemod로도 처리된다.

다만 custom Express proxy를 이 흐름에 맞춰 `proxy.ts`로 옮길 수 있다고 생각하면 곤란하다. 이름은 비슷해도 목적이 다르다. B가 서버를 세운 이유는 middleware가 낡아서가 아니라 WebSocket 때문이었다.

## 배운 것

1. **"프록시"라는 한 단어가 세 가지 다른 자리를 가린다.** 요청을 넘긴다는 동작은 같아도 `proxy.ts`, Route Handler, custom server는 다룰 수 있는 것이 다르다. 무엇을 넘기는지 먼저 보면 자리가 정해진다.
2. **경계는 기능이 아니라 연결의 수명이 긋는다.** 같은 API 중계라도 짧은 요청과 긴 스트림은 다른 층에서 처리해야 한다.
3. custom server는 기술 선택이 아니라 **운영 책임의 이전**이다. 배포 방식과 에러·보안 처리가 함께 넘어온다는 것을 알고 골라야 한다.

## 참고

- [Next.js Proxy란 무엇인가 - middleware에서 proxy로 바뀐 이유](/posts/nextjs-proxy-basics)
- [Next.js Proxy로 BFF 만들기 - /api/proxy 패턴](/posts/nextjs-proxy-bff-pattern)
- [Next.js에서 SSE와 WebSocket은 Proxy로 처리해도 될까](/posts/nextjs-proxy-sse-websocket)
- [SharedWorker는 이름이 인스턴스다 - docker/k8s 스코프 분리](/posts/sharedworker-scope-partitioning)
- [Next.js Version 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
