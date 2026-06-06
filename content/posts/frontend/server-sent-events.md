---
title: "Server-Sent Events — HTTP 위의 단방향 스트림"
date: "2026-05-16"
summary: "polling의 한계를 넘어 서버가 클라이언트에 이벤트를 흘려보내는 가장 단순한 방법인 SSE를, 포맷·EventSource API·자동 재연결·HTTP/2와의 궁합·한계 관점에서 정리했다."
category: "Frontend"
tags:
  - Network
  - Realtime
  - SSE
  - EventSource
  - HTTP
featured: false
---

# Server-Sent Events — HTTP 위의 단방향 스트림

지난 글에서 polling의 한계를 정리하면서, 그 다음 단계로 가는 핵심 아이디어를 짚었다. **연결 하나를 유지하고 그 위로 이벤트를 흘려보내자**. 이걸 HTTP 위에서 가장 단순하게 구현한 게 `Server-Sent Events`, 줄여서 SSE다.

SSE는 별도 프로토콜을 새로 만들지 않는다. 그냥 HTTP GET 응답을 끊지 않고 길게 유지하면서, 그 응답 본문 안에 이벤트들을 텍스트로 흘려보낸다. 명세는 [WHATWG HTML Living Standard의 Server-sent events 절](https://html.spec.whatwg.org/multipage/server-sent-events.html)에 있다. 한때 W3C의 별도 표준이었지만 지금은 HTML 표준에 통합되어 있다.

---

## 먼저 결론

| 상황 | SSE가 맞는 선택인가 |
|---|---|
| 서버 → 클라이언트 단방향 이벤트 스트림 | 좋은 선택 |
| 알림, 진행률, 라이브 피드, AI 응답 스트리밍 | 좋은 선택 |
| 채팅처럼 양방향 메시지 | 부적합 (WebSocket이 자연스러움) |
| 바이너리 데이터 | 부적합 (텍스트 전용) |
| 매우 낮은 지연이 필요한 미디어 | 부적합 (WebRTC) |

SSE의 강점은 단순함이다. HTTP 그대로라 기존 인프라가 거의 그대로 동작하고, 자동 재연결과 이벤트 ID 같은 기능이 표준에 포함되어 있어 직접 구현할 게 적다.

---

## 핵심 아이디어 — 응답을 안 끊는 GET

일반 HTTP 요청-응답은 다음과 같다.

```text
GET /api/data
Host: example.com

HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 42

{ "value": 1 }
```

응답 본문이 끝나면 연결도 끝난다(또는 keep-alive로 다른 요청에 재사용).

SSE는 이 모양을 살짝 비튼다.

```text
GET /events
Host: example.com
Accept: text/event-stream

HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

data: hello

data: world

data: { "type": "tick", "value": 42 }
```

핵심 차이는 다음과 같다.

- `Content-Type`이 `text/event-stream`이다.
- `Content-Length`가 없다. 응답이 언제 끝날지 모른다.
- 본문에 메시지들이 줄단위 텍스트로 계속 흘러온다.

브라우저는 `text/event-stream`을 보면 "이건 끊지 말고 계속 읽는 스트림이다"로 이해하고, 도착하는 줄을 파싱해서 이벤트로 변환한다.

---

## text/event-stream 포맷

명세가 정의한 포맷은 의외로 단순하다. 메시지는 **빈 줄로 구분**되고, 한 메시지 안에서는 `필드: 값` 형태의 줄들이 모인다.

지원되는 필드는 다음 네 가지가 전부다.

| 필드 | 의미 |
|---|---|
| `data` | 실제 메시지 본문. 여러 줄에 걸쳐도 됨. |
| `event` | 이벤트 이름. 지정하면 그 이름의 이벤트로 dispatch. 기본은 `message`. |
| `id` | 이벤트 ID. 연결이 끊긴 뒤 재연결할 때 마지막 ID부터 이어받기 위한 식별자. |
| `retry` | 재연결 대기 시간(ms). 클라이언트에게 다음 재연결까지 N ms 기다리라고 알려준다. |

예시는 이렇게 생긴다.

```text
data: 첫 번째 메시지

event: notification
data: 두 번째 메시지

id: 100
data: { "userId": 1, "score": 200 }

retry: 5000
```

`data:`가 여러 줄에 걸치면 줄바꿈으로 이어진 한 문자열로 합쳐진다. 빈 줄이 메시지 종료 신호다.

```text
data: 첫 줄
data: 둘째 줄
data: 셋째 줄

```

이렇게 보내면 클라이언트에 도착하는 문자열은 `"첫 줄\n둘째 줄\n셋째 줄"`이다.

---

## 브라우저 EventSource API

브라우저는 이 포맷을 직접 파싱할 필요가 없다. `EventSource` 객체가 모두 처리한다.

```js
const es = new EventSource("/events");

es.onopen = () => {
  console.log("연결됨");
};

es.onmessage = (e) => {
  console.log("기본 message 이벤트:", e.data);
};

es.addEventListener("notification", (e) => {
  console.log("notification 이벤트:", e.data);
});

es.onerror = () => {
  console.log("에러 또는 끊김");
};
```

핵심 동작은 다음과 같다.

- `data:` 필드 → `MessageEvent.data` (문자열)
- `event:` 필드 없는 메시지 → `message` 이벤트로 dispatch
- `event: foo` 필드 → `foo` 이벤트로 dispatch (`addEventListener("foo", ...)`)
- `id:` 필드 → 내부 `lastEventId`에 저장
- `retry:` 필드 → 다음 재연결 대기 시간 갱신

`EventSource.readyState`로 현재 상태를 알 수 있다.

| 값 | 상수 | 의미 |
|---|---|---|
| 0 | `CONNECTING` | 연결 중 |
| 1 | `OPEN` | 열림 |
| 2 | `CLOSED` | 영구 종료 (`close()` 호출 또는 비복구 에러) |

---

## 자동 재연결 — SSE가 polling보다 우월한 핵심 이유

SSE에서 가장 강력한 기능은 **연결이 끊기면 브라우저가 자동으로 다시 연결한다는 점**이다. 별도 코드를 짤 필요가 없다.

흐름은 다음과 같다.

```text
1. 서버가 응답을 보내는 중에 네트워크가 끊김
2. 브라우저는 readyState를 CONNECTING으로 바꾸고 onerror 호출
3. retry로 지정된 시간(기본 보통 3초) 후 같은 URL로 재요청
4. 마지막으로 받은 id가 있으면 Last-Event-ID 헤더에 담아 보냄
5. 서버는 그 ID 이후 이벤트부터 다시 보내면 됨
```

재연결 요청 헤더는 이렇게 생긴다.

```text
GET /events
Accept: text/event-stream
Last-Event-ID: 100
```

서버가 이 헤더를 보고 "그럼 id 101부터 보내야겠다"고 판단할 수 있다. 즉 SSE는 **이벤트 순서와 누락 방지를 위한 메커니즘이 프로토콜 차원에 내장되어 있다.** WebSocket으로 같은 일을 하려면 직접 시퀀스 번호를 설계해 넣어야 한다.

---

## 헤더 오버헤드가 사라진다

polling은 메시지 하나마다 새 HTTP 요청을 보냈고, 매번 HTTP 헤더가 따라갔다. SSE는 처음 한 번만 헤더를 보내고, 그 다음에는 본문만 흘려보낸다.

```text
Polling (메시지 5개)
  요청 5번 × (헤더 + 본문) = 헤더 5번 + 본문 5번

SSE (메시지 5개)
  요청 1번 × 헤더 + 본문 5번 = 헤더 1번 + 본문 5번
```

짧은 메시지를 자주 보내는 환경일수록 차이가 커진다.

---

## 한계 1 — 단방향이다

SSE는 서버 → 클라이언트 한 방향만 지원한다. 클라이언트가 서버로 보낼 메시지가 있으면 평범한 POST 요청을 따로 띄워야 한다.

```js
const es = new EventSource("/events");

es.onmessage = (e) => updateFromServer(e.data);

async function sendCommand(cmd) {
  await fetch("/commands", {
    method: "POST",
    body: JSON.stringify(cmd),
  });
}
```

이게 큰 문제가 되는 경우와 그렇지 않은 경우가 있다.

| 유스케이스 | SSE 적합도 |
|---|---|
| 서버 알림, 푸시 | 자연스러움 |
| 진행률, 로그 스트림 | 자연스러움 |
| 라이브 스코어, 주식 시세 | 자연스러움 |
| 채팅 | 가능하지만 어색 (보내기는 POST, 받기는 SSE) |
| 게임 입력처럼 빈번한 양방향 | 부적합 (WebSocket이 자연스러움) |

---

## 한계 2 — 텍스트 전용

`text/event-stream`이라는 이름이 말해주듯, SSE는 **UTF-8 텍스트만** 전송한다. 바이너리(이미지, 오디오 청크, 압축된 페이로드 등)는 직접 보낼 수 없다.

바이너리를 꼭 보내야 하면 Base64로 인코딩해야 하는데, 그 순간 33%의 크기 오버헤드와 인코딩/디코딩 비용이 붙는다. 바이너리가 핵심 데이터라면 WebSocket이 더 맞다.

---

## 한계 3 — HTTP/1.1에서의 동시 연결 한도

브라우저는 같은 도메인에 동시 HTTP 연결을 6개까지만 허용한다(HTTP/1.1 기준). SSE는 그중 하나를 계속 점유한다. 사용자가 같은 사이트를 **탭 6개** 열고 모두 SSE 연결을 띄우면, 7번째 탭부터는 일반 HTTP 요청도 막힌다.

이 문제는 두 가지 방향으로 해결된다.

1. **HTTP/2로 가기**: HTTP/2는 한 TCP 연결 위에서 여러 스트림을 다중화한다. 같은 도메인 동시 연결 한도가 사실상 사라진다.
2. **여러 탭이 SSE 연결을 공유하기**: SharedWorker 안에 SSE 하나만 두고, 받은 이벤트를 BroadcastChannel이나 postMessage로 모든 탭에 뿌리는 패턴. 이 시리즈 마지막 글에서 본격적으로 다룬다.

---

## CORS와 인증

SSE도 CORS 정책을 따른다. 다른 origin의 SSE 엔드포인트에 붙으려면 서버가 `Access-Control-Allow-Origin`을 제대로 응답해야 한다.

쿠키 같은 자격 증명을 함께 보내려면 두 번째 인자에 `withCredentials: true`를 지정한다.

```js
const es = new EventSource("/events", { withCredentials: true });
```

그리고 헤더 한 가지 주의 사항이 있다. **EventSource는 커스텀 헤더를 지정할 수 없다.** `new EventSource(url, headers)` 같은 옵션이 없다. JWT 토큰을 헤더에 넣어 인증하는 패턴이라면, 쿠키 기반 인증으로 바꾸거나 URL 쿼리에 토큰을 담아야 한다. 후자는 로그에 토큰이 남는 보안 이슈가 생긴다.

이 한계 때문에 인증이 까다로운 환경에서는 EventSource 대신 `fetch`로 직접 `text/event-stream` 응답을 받아 처리하는 라이브러리도 많이 쓰인다(`@microsoft/fetch-event-source` 등). 그렇게 하면 헤더를 자유롭게 지정할 수 있지만, 자동 재연결을 비롯한 EventSource의 편의는 직접 구현해야 한다.

---

## HTTP/2와 SSE — 좋아진 점과 변하지 않은 점

HTTP/2가 SSE의 약점 일부를 메워준다.

| 항목 | HTTP/1.1 | HTTP/2 |
|---|---|---|
| 같은 도메인 동시 연결 수 | 6개 제한 | 사실상 무제한 (한 TCP 위 다중 스트림) |
| 헤더 압축 | 없음 | HPACK 압축 |
| TCP 연결 비용 | 매번 새 TCP/TLS 핸드셰이크 가능성 | 한 연결 재사용 |

다만 SSE의 본질적 한계(단방향, 텍스트 전용)는 HTTP/2에서도 그대로다.

---

## 서버 쪽 모양

참고로 Node.js로 가장 단순한 SSE 엔드포인트를 만들면 이렇게 생긴다.

```js
import http from "node:http";

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let id = 0;
  const timer = setInterval(() => {
    id += 1;
    res.write(`id: ${id}\n`);
    res.write(`data: ${JSON.stringify({ time: Date.now() })}\n\n`);
  }, 1000);

  req.on("close", () => clearInterval(timer));
}).listen(3000);
```

핵심 포인트는 다음과 같다.

- `Content-Type: text/event-stream`을 명시한다.
- `res.end()`를 호출하지 않는다. 응답을 끊지 않는 게 SSE의 본질이다.
- 메시지마다 `\n\n`(빈 줄)을 잊지 않는다.
- 클라이언트 연결이 끊기면(`req.on("close")`) 타이머를 정리해야 한다. 안 그러면 좀비 타이머가 쌓인다.

---

## SSE의 자리

polling보다 거의 모든 면에서 우월하지만, WebSocket보다는 제한적이다.

- polling보다 우월한 점: 자동 재연결, 이벤트 ID, 헤더 오버헤드 없음, 단순한 텍스트 포맷
- WebSocket보다 약한 점: 단방향, 텍스트 전용, 헤더 지정 제약

그래서 SSE는 **서버에서 클라이언트로 흘려보내기만 하면 충분한 시나리오**의 기본 선택지로 자리 잡았다. 알림, 진행률, 라이브 피드, AI 응답 스트리밍 같은 자리가 대표적이다. 요즘 LLM API 응답 스트리밍에는 SSE가 거의 표준처럼 쓰인다.

다음 글에서는 양방향 통신이 필요한 경우의 표준인 WebSocket으로 넘어간다. 출발점은 IETF 드래프트 `draft-abarth-websocket-handshake-01`과 그 최종 형태인 `RFC 6455`의 핸드셰이크 분석이다.

---

## 참고

- [실무에서 SSE + Shared Worker를 도입하며 마주친 것들](/posts/project/sse-shared-worker-in-practice) — 이 SSE를 실무에서 적용한 사례
- [WHATWG HTML — Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [MDN — EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
