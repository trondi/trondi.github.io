---
title: "끊김에 강한 WebSocket(재연결, 하트비트, 백오프)"
date: "2026-10-26"
summary: "기본 WebSocket API 위에 직접 얹어야 하는 끊김 감지, 하트비트, 지수 백오프와 지터, online/visibility 이벤트 연동, 좀비 연결 회피 패턴을 RFC 6455의 control frame 규정과 함께 정리했다."
category: "Frontend"
tags:
  - Network
  - Realtime
  - WebSocket
  - Reconnect
  - Heartbeat
  - Backoff
featured: false
series: "실시간 웹 통신과 브라우저 런타임"
seriesOrder: 5
---

# 끊김에 강한 WebSocket(재연결, 하트비트, 백오프)

브라우저 `WebSocket` API는 메시지를 보내고 받는 것까지만 책임진다. 연결이 끊겼을 때 다시 붙이는 일, 살아있는 것처럼 보이지만 사실은 죽어있는 좀비 연결을 감지하는 일, 서버가 죽었을 때 모든 클라이언트가 동시에 재접속해서 서버를 폭격하지 않게 막는 일은 **모두 우리가 직접 얹어야 한다.**

이 글은 그 위에 얹는 세 겹을 RFC 6455의 control frame 규정과 함께 정리한다.

1. **끊김을 어떻게 감지하나**: close 이벤트로는 부족하다
2. **하트비트**: ping/pong으로 좀비 연결을 회피
3. **재연결 전략**: exponential backoff + jitter + 네트워크 상태 신호

---

## 먼저 결론

| 문제 | 해결 |
|---|---|
| `close` 이벤트는 잘 안 와도 사실 연결이 죽었다 | 앱 레벨 하트비트로 좀비 감지 |
| 끊기자마자 재연결하면 서버가 폭격당한다 | exponential backoff + jitter |
| 백그라운드 탭이 백오프를 무한정 늘린다 | Page Visibility 변화 시 백오프 리셋 |
| 비행기 모드에서도 재시도 반복한다 | `navigator.onLine` + `online`/`offline` 이벤트 |
| 브라우저는 WebSocket ping을 못 보낸다 | 앱 레벨 JSON ping/pong을 따로 정의 |

---

## 끊김을 감지하는 두 가지 경로

연결이 죽었다는 사실을 알 수 있는 경로는 두 가지다.

### 1. close 이벤트: 명확한 끊김

```js
ws.onclose = (e) => {
  console.log(e.code, e.reason, e.wasClean);
};
```

상대가 close 프레임을 보냈거나, TCP가 명시적으로 끊겼거나, 브라우저가 에러를 감지한 경우다. `code`와 `reason`이 단서를 준다.

이 경로의 문제는 **항상 빠르게 오지 않는다**는 것이다. 모바일 환경에서 사용자가 비행기 모드를 켜거나, NAT 테이블이 만료되거나, 무선 AP가 잠시 끊겼다 붙으면, TCP는 죽은 줄 모르고 살아있는 척한다. `onclose`가 도착하는 데 수십 초가 걸릴 수도 있다.

### 2. 좀비 연결: TCP는 살아있는데 데이터가 안 옴

이게 더 흔한 문제다. WebSocket의 `readyState`가 `OPEN`이고 `bufferedAmount`도 0인데, 실제로는 서버가 어떤 메시지도 받지 못하고 있다. `send()`는 성공한 것처럼 보이지만 메시지가 도달하지 않는다.

이걸 감지하려면 **주기적으로 살아있는지를 확인하는 메시지**를 보내고 일정 시간 안에 응답이 안 오면 강제로 끊는 패턴이 필요하다.

---

## 하트비트와 ping/pong

RFC 6455 §5.5.2는 `Ping` 프레임(opcode 0x9), §5.5.3은 `Pong` 프레임(opcode 0xA)을 정의한다. 본문은 한 줄이다.

> The Ping frame contains an opcode of 0x9. Upon receipt of a Ping frame, an endpoint MUST send a Pong frame in response, unless it already received a Close frame.

즉 ping을 받으면 즉시 pong을 응답해야 한다. 이건 프로토콜이 강제하는 규칙이다.

### 그런데 브라우저에서는 ping을 못 보낸다

여기 함정이 있다. **브라우저 `WebSocket` API에는 ping 프레임을 보내는 메서드가 없다.** `send()`로는 텍스트나 바이너리만 보낼 수 있고 ping/pong은 브라우저 내부에서만 처리된다.

받은 ping에 대해 pong을 응답하는 건 브라우저가 자동으로 해주지만 우리가 능동적으로 ping을 보낼 수는 없다.

이 때문에 브라우저 쪽에서 좀비 연결을 감지하려면 **앱 레벨 ping/pong**을 정의해야 한다. 프로토콜의 control frame이 아니라, 그냥 우리 약속으로 정한 JSON 메시지 하나다.

```js
ws.send(JSON.stringify({ type: "ping" }));

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "pong") onPong();
};
```

서버는 이 ping을 받으면 곧바로 pong을 응답해야 한다. 둘이 서로 약속한 형식이면 무엇이든 좋다.

### 하트비트 구현

전형적인 모양은 이렇다.

```js
const HEARTBEAT_INTERVAL = 30_000; // 30초마다 ping
const PONG_TIMEOUT = 10_000;       // 10초 안에 pong 없으면 죽었다고 판단

let heartbeatTimer;
let pongTimer;

function startHeartbeat() {
  heartbeatTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "ping" }));
    pongTimer = setTimeout(() => {
      console.warn("pong 안 옴, 좀비 연결로 판단");
      ws.close(4000, "heartbeat timeout");
    }, PONG_TIMEOUT);
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  clearTimeout(pongTimer);
}

ws.onopen = () => startHeartbeat();
ws.onclose = () => stopHeartbeat();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "pong") clearTimeout(pongTimer);
};
```

핵심은 다음 세 가지다.

- **주기적 ping**: 30초~60초가 흔한 값. 더 길면 idle timeout에 잘리고 더 짧으면 트래픽 낭비.
- **pong 타임아웃**: pong을 기다리는 동안 별도 타이머. 응답이 안 오면 강제로 `close()`.
- **`close()` 호출 → 재연결 트리거**: `onclose` 핸들러에서 재연결 로직이 이어받는다.

---

## 재연결 전략: exponential backoff + jitter

`onclose` 이벤트를 받았다고 곧바로 다시 연결을 시도하면 문제가 생긴다.

### 즉시 재연결의 문제: thundering herd

서버가 잠시 죽었다가 다시 살아난 상황을 생각해보자. 클라이언트 1만 명이 동시에 `onclose`를 받고 **1초 이내에 모두 재접속을 시도한다.** 막 살아난 서버는 다시 죽는다. 살아나면 또 폭격받는다. 이걸 thundering herd라고 부른다.

해결은 두 가지를 조합한다.

### 1. exponential backoff: 실패할수록 간격을 늘린다

```js
let attempt = 0;

function nextDelay() {
  const base = 1000;             // 1초
  const max = 30_000;            // 최대 30초
  return Math.min(base * 2 ** attempt, max);
}

ws.onclose = () => {
  const delay = nextDelay();
  setTimeout(connect, delay);
  attempt += 1;
};

function onOpen() {
  attempt = 0; // 성공하면 리셋
}
```

1초 → 2초 → 4초 → 8초 → 16초 → 30초 → 30초 → ... 이런 식으로 늘어난다. 서버에 숨 쉴 틈을 준다.

### 2. jitter: 모두가 같은 타이밍에 재접속하지 않게 흔든다

backoff만 쓰면 모든 클라이언트가 정확히 같은 시점에 동시 재시도한다(예: 시점 1초, 2초, 4초). 결과적으로 폭격이 sparse하게 일어날 뿐 사라지지 않는다.

jitter는 백오프 값에 랜덤 변동을 더해서 동시성을 깬다.

```js
function nextDelay() {
  const base = 1000;
  const max = 30_000;
  const exp = Math.min(base * 2 ** attempt, max);
  return Math.random() * exp; // "full jitter"
}
```

`Math.random() * exp`는 "full jitter"라 부르는 방식이다. AWS Architecture Blog의 [Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) 글에서 다양한 변형을 비교하는데, 단순함과 효과 면에서 full jitter가 좋은 기본값이다.

---

## 네트워크 상태 신호와 연동

backoff만으로는 부족한 경우가 있다. 비행기 모드, 와이파이 끊김, 백그라운드 탭 같은 상태를 브라우저가 알려주는 신호를 같이 써야 한다.

### online / offline 이벤트

```js
window.addEventListener("offline", () => {
  console.log("오프라인 — 재시도 멈춤");
  cancelReconnect();
});

window.addEventListener("online", () => {
  console.log("온라인 복귀 — 즉시 재연결");
  connect();
});
```

`navigator.onLine`이 `false`인 동안에는 백오프 타이머가 돌아도 헛수고다. 네트워크가 죽어있다는 걸 아는 시점에는 **재시도를 멈추고** online으로 돌아오면 **백오프를 무시하고 즉시 한 번 시도**한다.

### Page Visibility: 백그라운드 탭의 백오프 리셋

탭이 백그라운드에 가 있는 동안 재시도가 여러 번 실패해서 백오프가 30초까지 늘어났다고 하자. 사용자가 탭으로 돌아오는 순간, 그 30초가 사용자 경험에 그대로 노출된다. **탭이 다시 보이는 시점에 한 번은 즉시 시도**하는 것이 자연스럽다.

```js
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && ws.readyState !== WebSocket.OPEN) {
    attempt = 0; // 백오프 리셋
    connect();
  }
});
```

---

## 한 화면에 모은 패턴

위의 모든 조각을 합친 최소 구현이다.

```js
const URL = "wss://example.com/chat";
const HEARTBEAT_INTERVAL = 30_000;
const PONG_TIMEOUT = 10_000;

let ws;
let attempt = 0;
let reconnectTimer;
let heartbeatTimer;
let pongTimer;

function connect() {
  clearTimeout(reconnectTimer);
  ws = new WebSocket(URL);

  ws.onopen = () => {
    attempt = 0;
    startHeartbeat();
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "pong") {
      clearTimeout(pongTimer);
      return;
    }
    handleMessage(msg);
  };

  ws.onclose = () => {
    stopHeartbeat();
    if (!navigator.onLine) return; // 오프라인이면 online 이벤트에 맡김
    scheduleReconnect();
  };

  ws.onerror = () => {
    // 사유는 onclose에서 확인
  };
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "ping" }));
    pongTimer = setTimeout(() => {
      ws.close(4000, "heartbeat timeout");
    }, PONG_TIMEOUT);
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  clearTimeout(pongTimer);
}

function scheduleReconnect() {
  const base = 1000;
  const max = 30_000;
  const exp = Math.min(base * 2 ** attempt, max);
  const delay = Math.random() * exp;
  attempt += 1;
  reconnectTimer = setTimeout(connect, delay);
}

window.addEventListener("offline", () => {
  clearTimeout(reconnectTimer);
});

window.addEventListener("online", () => {
  attempt = 0;
  connect();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && ws.readyState !== WebSocket.OPEN) {
    attempt = 0;
    connect();
  }
});

connect();
```

여기서 더 다듬을 수 있는 지점들:

- `attempt`의 상한선을 두어 무한 재시도 막기
- 첫 핸드셰이크와 재연결을 다르게 처리(예: 첫 실패는 즉시 한 번 더 시도)
- 재연결 성공 시 서버에 마지막 수신 메시지 ID를 보내 누락된 이벤트만 보강 (SSE의 `Last-Event-ID` 같은 패턴을 직접 만들어야 함)
- 큐잉: 끊긴 동안 사용자가 보낸 메시지를 모아두었다가 재연결 시 일괄 전송

---

## 서버 쪽에서도 필요한 것

클라이언트만 챙긴다고 끝이 아니다. 서버도 다음을 챙겨야 좀비 연결을 막을 수 있다.

- **앱 레벨 ping 응답**: 클라이언트가 보낸 `{type: "ping"}`에 즉시 `{type: "pong"}`을 돌려줘야 한다.
- **서버 측 idle timeout**: 일정 시간(예: 60초) 동안 클라이언트로부터 어떤 프레임도 안 오면 강제 close. 클라이언트 하트비트가 멈추면 서버도 이걸로 끊는다.
- **로드밸런서의 idle timeout 정렬**: AWS NLB, GCP LB, Nginx 모두 idle timeout 기본값이 다르다. 하트비트 주기는 이 값보다 짧아야 한다.

---

## 다음

이로써 WebSocket의 핸드셰이크, API, 끊김 처리까지 한 바퀴를 돌았다. [다음 글](/posts/webrtc-overview)에서는 잠시 곁가지로 **WebRTC**를 다룬다. WebRTC도 자주 WebSocket과 한 문장에서 언급되지만 카테고리가 다른 프로토콜이라는 점을, ICE/STUN/TURN/SDP/SCTP/DTLS가 각자 어디서 무슨 일을 하는지 한 장의 지도로 정리한다.

---

## 참고

- [RFC 6455 §5.5: Control Frames](https://www.rfc-editor.org/rfc/rfc6455.html#section-5.5)
- [RFC 6455 §7.4: Status Codes](https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4)
- [AWS Architecture Blog: Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
