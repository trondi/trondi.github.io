---
title: "프록시가 에러를 삼킬 때 - 401이 200으로 가려져 생긴 SSE 무한 재연결 루프"
date: "2026-07-15"
summary: "콘솔에 '재연결 성공'이 끝없이 찍힌다. 백엔드의 401을 프록시가 200 SSE로 포장하면서 EventSource 내장 재연결이 무한 반복된 원인 사슬과, 상태코드 passthrough + 백오프 일원화로 수렴시킨 과정."
category: "Project"
tags:
  - SSE
  - Next.js
  - Proxy
  - Debugging
series: "알람 SSE 리워크"
seriesOrder: 6
---

# 프록시가 에러를 삼킬 때 - 401이 200으로 가려져 생긴 SSE 무한 재연결 루프

> 콘솔에 "[Client] SSE 재연결 성공"이 끝없이 찍힌다. 성공했다는데 왜 계속 재연결을 하지?

## 증상 - 성공 로그가 반복되는 이상한 상태

알람 SSE를 붙이고 나서 페이지 콘솔에 이상한 패턴이 보였다.

```
[Client] SSE 재연결 성공
[Client] SSE 재연결 성공
[Client] SSE 재연결 성공
...
```

"성공"이 몇 초 간격으로 무한 반복. 네트워크 탭을 보면 `alarm/connect` 요청이
계속 새로 생기고, 각각 잠깐 살았다가 죽는다. 연결이 실제로는 **계속 끊기고
있는데**, 로그만 매번 성공이라고 찍힌다.

## 구조 - 중간에 프록시가 있다

브라우저가 백엔드에 바로 붙는 게 아니라, Next.js의 route handler가
SSE 릴레이를 한다 (CORS·쿠키·30초 fetch timeout 회피 등의 이유로 node:http 릴레이).
왜 일반 rewrite로는 안 되고 Route Handler를 따로 두는지는
[Next.js에서 SSE와 WebSocket은 Proxy로 처리해도 될까](/posts/nextjs-proxy-sse-websocket)에 정리해뒀다.

```
브라우저 EventSource ── Next.js route.ts (프록시) ── 백엔드 /alarm/connect
```

그리고 문제의 코드. 프록시가 백엔드 응답을 릴레이하면서 **상태코드를 무시하고
무조건 200 + SSE 헤더로 응답**하고 있었다.

```js
// 문제의 형태 (요지)
const backendRes = await connectToBackend();
return new Response(stream, {
  status: 200,                                  // ← 백엔드가 뭐라 했든 200
  headers: { 'Content-Type': 'text/event-stream', ... },
});
```

## 원인 사슬 - 3개가 겹쳤다

**① 백엔드는 사실 401을 주고 있었다.**

프록시를 우회해 직접 확인하니 이랬다.

```json
HTTP 401
{"error":"Unauthorized","message":"Authentication required for SSE connection"}
```

**② 프록시가 401을 200 SSE로 포장했다.**

브라우저 입장에서는 "연결 성공(200) → 스트림이 곧바로 끝남"으로 보인다.
401이라는 정보는 프록시 단계에서 증발했다.

**③ EventSource의 내장 자동 재연결이 반복을 만들었다.**

EventSource는 연결이 "정상적으로 열렸다가 끊기면" 스스로 재연결한다.
[개념 글](/posts/server-sent-events)에서 SSE의 장점으로 꼽았던 바로 그 기능인데,
백오프도 상한도 없다는 조건이 여기서 발목을 잡는다. 그래서 이런 사이클이 돈다.

```
연결(200) → onopen 발화 → 스트림 즉시 종료 → 내장 재연결 → 연결(200) → ...
```

무한 사이클. 게다가 우리 onopen 핸들러가 첫 연결/재연결 구분 없이
"재연결 성공"을 브로드캐스트했고, 연결된 포트(탭) 수만큼 중복 출력됐다.
그래서 콘솔에 성공 로그가 반복해서 찍힌 것.

**요약: 에러(401)가 있었는데, 중간 계층이 그걸 성공(200)으로 번역해서
아무도 에러인 줄 몰랐다.**

수정 전/후의 흐름을 나란히 놓으면 다음과 같다.

```diagram
sse-proxy-error-chain
```

## 수정 - 두 곳

### 1. 프록시: 상태코드 passthrough

백엔드가 non-200이면 상태와 body를 그대로 돌려준다. 포장하지 않는다.

```js
if (backendRes.statusCode !== 200) {
  return new Response(body, { status: backendRes.statusCode });
}
// 200일 때만 SSE 스트림 릴레이
```

이제 401은 브라우저까지 401로 도착한다. EventSource는 열리지 못하고
`onerror`로 빠진다 - "성공했다 끊김"이라는 거짓 신호가 사라진다.

### 2. 워커: 내장 재연결에 맡기지 않는다

EventSource의 내장 재연결은 백오프가 없어서, 실패가 지속되는 상황에서는
요청이 짧은 간격으로 무한 반복된다. `onerror`에서 항상 `close()` 하고 직접 관리한다.

```js
eventSource.onerror = () => {
  eventSource.close();          // 내장 재연결 차단 - 모든 재연결을 한 경로로
  attemptReconnect();           // 지수 백오프 + 최대 횟수 캡
};
```

재연결 로직 자체는 평범한 지수 백오프다. 핵심은 **모든 재연결이 이 한 경로만
타게** 만든 것 - 내장 재연결과 커스텀 재연결이 섞이면 시도 횟수도 상태 전이도
추적이 안 된다.

```js
const attemptReconnect = () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    setConnectionState(SSE_CONNECTION_STATE.DISCONNECTED);  // 소진 - Offline 확정
    return;
  }
  reconnectAttempts += 1;
  const delay = BASE_DELAY * 2 ** (reconnectAttempts - 1);  // 1s → 2s → 4s → ...

  // 진행 상황을 모든 탭에 전파 - 헤더 툴팁에 "재연결 중 (2/5)" 표시
  connectedPorts.forEach(({ port }) => {
    port.postMessage({
      type: ALARM_MESSAGE_TYPE.SSE_RECONNECT_ATTEMPT,
      attempt: reconnectAttempts,
      maxAttempts: MAX_RECONNECT_ATTEMPTS,
    });
  });

  setTimeout(() => setupSSE(baseURL), delay);
};

eventSource.onopen = () => {
  reconnectAttempts = 0;                                    // 성공 시 카운터 리셋
  setConnectionState(SSE_CONNECTION_STATE.CONNECTED);
};
```

수정 후의 타임라인을 숫자로 정리하면 다음과 같다.

| 시도 | 지연 | 누적 경과 | 상태 표시 |
|---|---|---|---|
| 1회 | 1초 | 1초 | Connecting (1/5) |
| 2회 | 2초 | 3초 | Connecting (2/5) |
| 3회 | 4초 | 7초 | Connecting (3/5) |
| 4회 | 8초 | 15초 | Connecting (4/5) |
| 5회 | 16초 | 31초 | Connecting (5/5) |
| 소진 | - | - | **Offline 확정** |

결과: 401 상황에서 5회 시도 후 DISCONNECTED로 **수렴**한다. 무한루프 없음.
연결 상태는 헤더 UI(Live / Connecting / Offline + 툴팁의 시도 횟수)로 노출해서,
콘솔이 아니라 화면에서 상태를 본다.

## 남은 논점 - 5회에서 멈추는 게 맞나

관제 성격의 화면이라면 "5회 시도 후 포기"가 아니라 "최대 지연을 캡으로
무한 재시도"가 맞을 수도 있다 (서버가 새벽에 재기동되는 경우 등).
우리는 일단 5회 캡 + 수동 새로고침으로 두고, 정책은 열어뒀다.
또 하나 - 401처럼 "재시도해봐야 소용없는" 실패는 즉시 중단하는 게 이상적인데,
EventSource가 상태코드를 노출하지 않아 별도 장치가 필요하다
([다음 글](/posts/eventsource-no-headers)에서).

## 배운 것

1. **중간 계층은 에러를 정직하게 전달해야 한다.** 프록시·게이트웨이·BFF가 상태코드를 뭉개면, 하류의 모든 에러 처리(재시도 정책, 사용자 안내, 모니터링)가 깜깜이가 된다. 이번 무한루프의 근본 원인은 인증도 SSE도 아니고 **에러 정보의 유실**이었다.
2. **"성공 로그가 반복된다"는 것 자체가 시그널이다.** 성공은 반복해서 보고할 일이 없다. 반복되는 성공 로그는 실패 신호일 가능성이 높다.
3. 자동 재연결 같은 내장 편의 기능은 **실패가 지속되는 시나리오**를 기준으로 평가해야 한다. 정상 흐름에선 편리한 기능이 장애 상황에선 문제를 키운다.

