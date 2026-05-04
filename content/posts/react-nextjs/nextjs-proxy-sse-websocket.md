---
title: "Next.js에서 SSE와 WebSocket은 Proxy로 처리해도 될까"
date: "2026-05-04"
summary: "Next.js Proxy가 일반 HTTP rewrite에는 적합하지만 SSE와 WebSocket 같은 장기 연결에는 Route Handler, custom server, gateway 분리가 필요한 이유를 정리했다."
category: "React / Next.js"
tags:
  - Next.js
  - Proxy
  - SSE
  - WebSocket
  - Streaming
featured: false
---

# Next.js에서 SSE와 WebSocket은 Proxy로 처리해도 될까

Next.js Proxy는 요청을 가로채 redirect하거나 rewrite하는 데 좋다. 하지만 모든 네트워크 요구사항을 Proxy에 넣는 것은 위험하다.

특히 SSE와 WebSocket은 일반 HTTP API와 다르게 오래 유지되는 연결이다.

---

## 일반 HTTP API와 스트리밍 연결은 다르다

일반 API는 요청과 응답이 짧다.

```text
GET /api/proxy/users
  → Backend /users
  → JSON 응답
  → 연결 종료
```

이런 요청은 Proxy rewrite로 처리하기 좋다.

```ts
return NextResponse.rewrite(destination);
```

하지만 SSE는 연결을 열어둔 채 서버가 계속 이벤트를 밀어준다.

```text
GET /alarm/connect
  → text/event-stream
  → event
  → event
  → event
  → ...
```

WebSocket도 마찬가지다. HTTP 요청으로 시작하지만 `upgrade` 이후에는 양방향 연결로 바뀐다.

```text
HTTP Upgrade
  → WebSocket connection
  → client ↔ server
```

요청과 응답이 짧게 끝나는 API와, 연결 자체가 기능인 SSE/WebSocket은 다르게 설계해야 한다.

---

## SSE를 Proxy rewrite로 처리할 때의 문제

SSE는 응답 body를 즉시 흘려보내야 한다. 중간 계층이 응답을 버퍼링하면 브라우저는 이벤트를 제때 받지 못한다.

따라서 다음처럼 일반 rewrite로 처리하면 문제가 생길 수 있다.

```ts
return NextResponse.rewrite(new URL("/alarm/connect", backendOrigin));
```

실제 프로젝트에서는 SSE 경로만 Proxy에서 통과시키고, Route Handler에서 Node.js runtime으로 직접 처리하는 방식을 사용했다.

```ts
if (pathname === "/api/proxy/alarm/connect") {
  return NextResponse.next();
}
```

이렇게 하면 `/api/proxy/alarm/connect` 요청은 Proxy rewrite 대상에서 제외되고, App Router의 Route Handler가 처리한다.

---

## SSE는 Route Handler에서 처리한다

App Router에서는 Route Handler를 만들 수 있다.

```text
app
└─ api
   └─ proxy
      └─ alarm
         └─ connect
            └─ route.ts
```

SSE는 Node.js runtime에서 직접 stream을 반환하는 편이 안전하다.

```ts
import { NextRequest } from "next/server";
import http from "node:http";
import https from "node:https";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const protocol = process.env.BE_SERVER_PROTOCOL;
  const host = process.env.BE_SERVER_URL;
  const port = process.env.BE_SERVER_PORT;

  const client = protocol === "https" ? https : http;

  return new Promise<Response>((resolve) => {
    const req = client.request(
      {
        hostname: host,
        port: port ? Number(port) : protocol === "https" ? 443 : 80,
        path: "/alarm/connect",
        method: "GET",
        headers: {
          cookie: request.headers.get("cookie") ?? "",
          accept: "text/event-stream",
          "cache-control": "no-cache",
        },
      },
      (res) => {
        const stream = new ReadableStream({
          start(controller) {
            res.on("data", (chunk) => {
              controller.enqueue(chunk);
            });

            res.on("end", () => {
              controller.close();
            });

            res.on("error", () => {
              controller.close();
            });
          },
          cancel() {
            req.destroy();
          },
        });

        resolve(
          new Response(stream, {
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache",
              "x-accel-buffering": "no",
            },
          }),
        );
      },
    );

    request.signal.addEventListener("abort", () => {
      req.destroy();
    });

    req.on("error", () => {
      resolve(new Response(null, { status: 502 }));
    });

    req.end();
  });
}
```

핵심은 세 가지다.

- `runtime = "nodejs"`를 명시한다.
- 백엔드 SSE 응답을 `ReadableStream`으로 그대로 전달한다.
- 브라우저 연결이 끊기면 백엔드 요청도 종료한다.

`fetch`로도 스트림을 다룰 수 있는 경우가 있지만, 플랫폼이나 런타임의 timeout, buffering, abort 동작을 반드시 확인해야 한다. 장기 연결은 일반 JSON API보다 훨씬 민감하다.

---

## 클라이언트에서는 EventSource를 사용한다

브라우저에서는 `EventSource`로 SSE를 연결한다.

```ts
const eventSource = new EventSource("/api/proxy/alarm/connect", {
  withCredentials: true,
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
};

eventSource.onerror = () => {
  eventSource.close();
};
```

브라우저 입장에서는 여전히 same-origin `/api/proxy/alarm/connect`를 호출한다. 하지만 서버 내부에서는 Proxy rewrite가 아니라 Route Handler가 스트림을 관리한다.

---

## WebSocket은 Proxy보다 custom server나 gateway가 낫다

WebSocket은 HTTP upgrade 이벤트를 직접 다뤄야 한다.

기존 프로젝트에서는 Express custom server와 `http-proxy`를 사용했다.

```js
function getProxyServerWithWS(isWebSocket) {
  return httpProxy.createProxyServer({
    target: `${BE_PROXY}://${BE_URL}:${BE_PORT}`,
    changeOrigin: true,
    ws: isWebSocket,
  });
}
```

그리고 `upgrade` 이벤트에서 WebSocket proxy를 수행했다.

```js
wsApp.on("upgrade", (req, socket, head) => {
  const parsedUrl = parse(req.url, true);
  const { pathname } = parsedUrl;

  if (!pathname.startsWith("/_next")) {
    wsProxy.ws(req, socket, head);
    return;
  }
});
```

이 구조는 Next.js Proxy와 다르다. Next.js Proxy는 request/response를 다루는 경계이고, WebSocket upgrade를 직접 처리하는 서버가 아니다.

WebSocket이 필요하면 보통 다음 중 하나를 선택한다.

- custom Express server
- 별도 WebSocket gateway
- Nginx/Ingress 같은 reverse proxy
- 백엔드 WebSocket origin을 클라이언트에서 직접 사용
- 플랫폼이 제공하는 WebSocket 라우팅 기능

---

## 어떤 기준으로 나눌까

| 요구사항 | 추천 |
|---|---|
| 일반 HTTP API | `proxy.ts` rewrite |
| OAuth redirect | `proxy.ts`에서 별도 rewrite |
| SSE | Node.js runtime Route Handler |
| WebSocket | custom server 또는 별도 gateway |
| 인증/인가 최종 검증 | Backend 또는 Route Handler |
| URL alias redirect | `proxy.ts` |

핵심 기준은 연결의 성격이다.

짧게 끝나는 요청은 Proxy가 잘 맞는다. 계속 열려 있어야 하는 연결은 Proxy 밖에서 명시적으로 다루는 편이 낫다.

---

## 왜 분리해야 하는가

Proxy에 모든 네트워크 처리를 넣으면 처음에는 단순해 보인다. 하지만 시간이 지나면 다음 문제가 생긴다.

- Proxy가 모든 요청의 병목이 된다.
- 스트리밍 연결의 buffering 문제를 디버깅하기 어렵다.
- WebSocket upgrade를 다루기 어렵다.
- 인증/인가 책임이 애매해진다.
- 배포 환경별 런타임 제약을 맞추기 어려워진다.

따라서 요청의 성격에 따라 계층을 나누는 것이 좋다.

```text
짧은 HTTP 요청
  → proxy.ts rewrite

긴 SSE 연결
  → route.ts Node.js runtime

WebSocket
  → custom server / gateway / reverse proxy
```

---

## 정리

Next.js Proxy는 강력하지만 모든 네트워크 문제의 답은 아니다.

일반 HTTP API rewrite에는 적합하다. 하지만 SSE와 WebSocket처럼 연결을 오래 유지하거나 upgrade가 필요한 경우에는 Route Handler, custom server, 별도 gateway를 고려해야 한다.

실무 기준은 단순하다.

- 짧게 끝나는 요청은 Proxy
- 계속 열려 있어야 하는 연결은 Proxy 밖
- 최종 보안 검증은 실제 API 처리 지점

이 기준을 지키면 Proxy는 얇게 유지되고, 스트리밍/실시간 통신은 각자 맞는 계층에서 안정적으로 처리할 수 있다.

---

## 참고 문서

- [Next.js Proxy docs](https://nextjs.org/docs/app/getting-started/proxy)
- [proxy.js API reference](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [MDN - Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [MDN - WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
