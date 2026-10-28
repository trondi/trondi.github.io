---
title: "여러 탭, 하나의 연결(SharedWorker와 BroadcastChannel로 SSE/WebSocket 공유하기)"
date: "2026-10-26"
summary: "같은 사용자가 같은 사이트를 여러 탭에서 열어도 SSE/WebSocket 연결은 하나만 유지하기 위한 두 가지 모델 ― SharedWorker 허브와 BroadcastChannel+Web Locks 버스 ― 을 코드와 함께 비교하고 Service Worker로 같은 일을 할 때의 트레이드오프까지 정리했다."
category: "Frontend"
tags:
  - Network
  - Realtime
  - Shared Worker
  - BroadcastChannel
  - Web Locks
  - WebSocket
  - SSE
featured: true
series: "실시간 웹 통신과 브라우저 런타임"
seriesOrder: 10
---

# 여러 탭, 하나의 연결(SharedWorker와 BroadcastChannel로 SSE/WebSocket 공유하기)

지금까지 시리즈에서 두 축을 따로 정리했다.

```text
[축 A] 통신 프로토콜       polling / SSE / WebSocket / WebRTC
[축 B] JS 실행 컨텍스트    Main / Dedicated W / Shared W / Service W
```

이 마지막 글은 두 축이 만나는 한 자리만을 다룬다. **"같은 사용자가 같은 사이트를 여러 탭에서 열어도, 실시간 연결은 하나만 유지하기."**

흔한 일이다. 사용자가 알림이 뜨는 사이트를 열어 두고 다른 작업하면서 같은 사이트를 또 한 번 연다. 탭마다 별도 SSE/WebSocket 연결을 띄우면 서버 부하가 N배가 되고 브라우저의 동시 연결 한도까지 깎아먹는다. 이걸 해결하는 두 가지 모델이 있다.

- **허브 모델 (SharedWorker)**: 워커 하나가 연결을 들고 있고 탭들은 그 워커에 붙어 메시지만 받음
- **버스 모델 (BroadcastChannel + Web Locks)**: 누군가 한 탭이 "리더"가 되어 연결을 들고 BroadcastChannel로 다른 탭에 뿌림

같은 문제의 두 풀이다. 어디서 쓰일지에 따라 한쪽이 더 잘 맞는다.

---

## 먼저 결론

| 환경 / 요구 | 권장 |
|---|---|
| Chrome / Firefox 데스크톱만 | **SharedWorker** (가장 단순) |
| Android Chrome 포함 크로스브라우저 | **BroadcastChannel + Web Locks** |
| 탭이 모두 닫혀도 푸시 받기 | **Service Worker** (다른 카테고리) |
| 메시지만 fan-out, 연결 공유 안 함 | **BroadcastChannel 단독** |

세 도구의 자리를 한 줄씩 정리해 둔다.

- SharedWorker = 코드와 상태를 들고 있는 **사람**
- BroadcastChannel = 메시지가 흘러가는 **단톡방**
- Web Locks = "지금 이 일은 누가 책임지는가"를 결정하는 **자물쇠**

---

## 왜 탭마다 따로 열면 안 되나

다시 한 번 짚어 본다.

1. **브라우저 동시 연결 한도**: HTTP/1.1에서 같은 도메인 동시 연결은 6개로 제한. 탭 6개가 SSE를 열면 7번째 탭의 일반 fetch가 막힌다.
2. **서버 자원 낭비**: 같은 사용자에게 같은 데이터를 N번 보내야 한다. 알림 fan-out 비용이 N배.
3. **상태 불일치**: 탭마다 별도 연결이면 같은 이벤트가 어느 탭에 먼저 도착할지 보장이 없다. UI 상태가 어긋난다.
4. **모바일 배터리**: 모든 탭이 각자 백그라운드에서 하트비트를 보낸다. 무선 라디오가 깨어있는 시간이 길어진다.

이 네 가지를 한 번에 해결하는 게 "한 사용자, 한 연결" 패턴이다.

---

## 허브 모델: SharedWorker로 SSE 감싸기

가장 단순한 모양부터 본다. SSE 연결을 SharedWorker 안에서 하나만 만들고 모든 탭은 워커에 붙어 받는다.

### 워커 코드

```js
// connection.worker.js
const ports = new Set();
let es;

function connectSSE() {
  if (es) return;
  es = new EventSource("/sse");

  es.onmessage = (e) => {
    for (const p of ports) p.postMessage({ type: "event", data: e.data });
  };

  es.onerror = () => {
    // EventSource는 자동 재연결한다. 별도 로직 불필요.
    for (const p of ports) p.postMessage({ type: "status", state: "reconnecting" });
  };

  es.onopen = () => {
    for (const p of ports) p.postMessage({ type: "status", state: "open" });
  };
}

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.add(port);

  port.start();
  port.postMessage({ type: "status", state: es?.readyState === 1 ? "open" : "connecting" });

  port.onmessageerror = () => ports.delete(port);

  // 첫 연결 시점에 SSE 시작
  connectSSE();
};
```

### 탭 쪽 코드

```js
// main.js
const sw = new SharedWorker(
  new URL("./connection.worker.js", import.meta.url),
  { type: "module", name: "realtime" }
);

sw.port.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "event") handleEvent(JSON.parse(msg.data));
  if (msg.type === "status") setConnectionStatus(msg.state);
};

sw.port.start();
```

이게 끝이다. 한 사용자가 탭을 몇 개 열든 SSE는 1개고 모든 탭이 같은 이벤트를 받는다. SSE의 자동 재연결은 워커 안에서 알아서 동작한다.

---

## WebSocket으로 가면 재연결 책임이 워커로 옮겨간다

WebSocket은 SSE와 달리 자동 재연결이 없다. [시리즈 5편](/posts/websocket-reconnect-heartbeat-backoff)의 재연결·하트비트 로직을 워커 안에 둔다.

```js
// ws.worker.js
const ports = new Set();
let ws;
let attempt = 0;
let reconnectTimer;
let heartbeatTimer;
let pongTimer;

function broadcast(msg) {
  for (const p of ports) p.postMessage(msg);
}

function connect() {
  clearTimeout(reconnectTimer);
  ws = new WebSocket("wss://example.com/ws");

  ws.onopen = () => {
    attempt = 0;
    broadcast({ type: "status", state: "open" });
    startHeartbeat();
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === "pong") {
      clearTimeout(pongTimer);
      return;
    }
    broadcast({ type: "event", payload: msg });
  };

  ws.onclose = () => {
    stopHeartbeat();
    broadcast({ type: "status", state: "closed" });
    scheduleReconnect();
  };
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "ping" }));
    pongTimer = setTimeout(() => ws.close(4000, "heartbeat timeout"), 10_000);
  }, 30_000);
}

function stopHeartbeat() {
  clearInterval(heartbeatTimer);
  clearTimeout(pongTimer);
}

function scheduleReconnect() {
  const exp = Math.min(1000 * 2 ** attempt, 30_000);
  attempt += 1;
  reconnectTimer = setTimeout(connect, Math.random() * exp);
}

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.add(port);
  port.start();

  port.onmessage = (msg) => {
    if (msg.data.type === "send" && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg.data.payload));
    }
  };

  port.postMessage({ type: "status", state: ws?.readyState === 1 ? "open" : "connecting" });

  if (!ws) connect();
};
```

탭 쪽 코드는 SSE 버전과 거의 같다.

```js
// main.js
const sw = new SharedWorker(
  new URL("./ws.worker.js", import.meta.url),
  { type: "module", name: "ws" }
);

sw.port.onmessage = (e) => {
  if (e.data.type === "event") handleEvent(e.data.payload);
  if (e.data.type === "status") setStatus(e.data.state);
};

sw.port.start();

function sendMessage(payload) {
  sw.port.postMessage({ type: "send", payload });
}
```

세 가지 효과가 한 번에 떨어진다.

- WebSocket 연결이 사용자당 1개로 통일
- 재연결·하트비트·백오프 로직이 워커 안에 격리되어 각 탭의 컴포넌트가 단순해짐
- 한 탭이 닫혀도 워커는 살아있어서 다른 탭에 영향 없이 연결 유지

---

## SharedWorker가 안 되는 환경: 버스 모델

Android Chrome은 SharedWorker를 지원하지 않는다. 8편에서 짚었듯, 크로스브라우저로 같은 효과를 내려면 다른 도구 조합이 필요하다.

**핵심 발상**: 한 탭을 "리더"로 정하고 그 탭만 WebSocket을 들고 있게 한다. 받은 메시지는 BroadcastChannel로 다른 탭에 뿌린다. 리더 탭이 닫히면 다른 탭이 자동으로 리더가 된다.

이 "자동으로"를 가능하게 하는 게 **Web Locks API**다.

### Web Locks API 기본

```js
navigator.locks.request("my-lock", async (lock) => {
  // 락을 잡고 있는 동안 콜백이 실행됨.
  // 같은 origin의 다른 탭이 같은 락을 request하면 대기.
  await new Promise(() => {}); // 영원히 잡고 있고 싶다면
});
```

브라우저가 같은 origin 안에서 같은 이름의 락은 한 곳에서만 보유하도록 보장한다. 탭이 닫히면 락도 자동으로 해제되니 좀비 락이 없다.

### 전체 구현

```js
// realtime.js — 모든 탭이 이 파일을 import해서 씀

const BUS = new BroadcastChannel("realtime-bus");
let ws;

// 모든 탭에 메시지 뿌리기 (자기 자신은 BroadcastChannel이 빼줌)
function fanout(payload) {
  BUS.postMessage(payload);
}

async function becomeLeader() {
  // 이 콜백이 실행되면 내가 리더.
  ws = new WebSocket("wss://example.com/ws");

  ws.onopen = () => fanout({ type: "status", state: "open" });
  ws.onmessage = (e) => fanout({ type: "event", data: JSON.parse(e.data) });
  ws.onclose = () => fanout({ type: "status", state: "closed" });

  // 락은 이 Promise가 resolve할 때까지 잡혀있다.
  await new Promise(() => {});
}

// 모든 탭이 시작 시 리더가 되려고 시도한다.
// 한 명만 락을 얻고, 나머지는 대기 상태로 남는다.
// 리더 탭이 닫히면 락이 풀리고, 대기 중이던 다른 탭 하나가 자동으로 리더가 된다.
navigator.locks.request("ws-leader", becomeLeader);

// 모든 탭은 BroadcastChannel로 메시지를 수신한다.
BUS.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "event") handleEvent(msg.data);
  if (msg.type === "status") setStatus(msg.state);
};

// 메시지 보내기는 리더만 직접 할 수 있고, 다른 탭은 리더에게 요청해야 한다.
// 가장 단순한 방법: 또 다른 명령 채널을 두고 리더가 듣는다.
const COMMANDS = new BroadcastChannel("realtime-commands");
COMMANDS.onmessage = (e) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(e.data));
  }
};

export function sendMessage(payload) {
  COMMANDS.postMessage(payload);
}
```

### 흐름

```text
1. Tab A, B, C 동시에 시작 → 모두 navigator.locks.request("ws-leader") 호출
2. Tab A가 락을 얻음 → becomeLeader 실행 → WebSocket 연결
3. Tab B, C는 락 대기 상태. BroadcastChannel로 이벤트 수신만.
4. Tab A가 닫힘 → 락 자동 해제 → Tab B가 즉시 리더로 승격 → 새 WebSocket 연결
5. Tab D가 새로 열림 → 락 대기로 합류. Tab B가 닫히면 다음 차례.
```

리더가 바뀌는 순간 연결이 한 번 끊겼다가 다시 맺어진다. 짧은 끊김이 있지만 사용자 경험상 보통 무시할 수 있는 수준이다.

### 메시지 발신을 줄이고 싶다면

위 예시는 발신용 BroadcastChannel을 따로 뒀다. 한 채널로 통합하려면 메시지마다 출처(`fromLeader: true/false`)를 표시해 구분하면 된다. 명료성을 위해 두 채널이 깔끔하다.

---

## Service Worker로 같은 일을 할 수도 있다

Service Worker도 cross-tab 공유의 다른 길이다. 등록되면 origin 전체에 한 인스턴스만 살아있고 모든 탭이 같은 SW의 통제를 받는다.

```js
// sw.js
const ws = new WebSocket("wss://example.com/ws"); // SW 안에서 WebSocket
const bc = new BroadcastChannel("realtime-bus");

ws.onmessage = (e) => bc.postMessage({ type: "event", data: JSON.parse(e.data) });
```

문법적으로는 가능하지만 **실무에서는 권장되지 않는다.** 이유는 이렇다.

- Service Worker는 **언제든 잠들 수 있다.** 브라우저가 메모리를 회수하면 SW가 중단되고 그때 WebSocket도 같이 끊긴다.
- SW의 라이프사이클이 install/activate/update 등으로 복잡해서 상시 연결을 관리하기 위한 도구가 아니다.
- "이벤트 처리"가 본업이지 "장기 연결 유지"가 본업이 아니다.

Service Worker의 자리는 **푸시 알림과 캐시**다. 상시 연결은 SharedWorker나 BroadcastChannel + Web Locks가 맞다.

다만 다음 조합은 빛난다. "**Service Worker가 푸시를 받아 BroadcastChannel로 모든 탭에 알림 fan-out**". 사용자가 사이트를 닫아 두어도 푸시는 도착하고 사이트를 다시 열면 모든 탭이 같은 알림을 보게 된다.

---

## 세 패턴 비교

| 패턴 | 연결 소유자 | 브라우저 지원 | 복잡도 | 잘 맞는 자리 |
|---|---|---|---|---|
| **SharedWorker 허브** | 워커 | Chrome/FF/Safari, Android Chrome 미지원 | 낮음 | 데스크톱 중심 웹앱 |
| **BC + Web Locks 버스** | 한 탭 (리더) | Chrome/FF/Safari 모두 | 중 | 크로스브라우저 필수 |
| **Service Worker** | 워커 | 거의 모두 | 높음, 부적합 | 푸시 알림 + 캐시 (상시 연결은 비추) |

크로스브라우저까지 같이 챙겨야 한다면 **BC + Web Locks**가 사실상 표준 대안이다. SharedWorker 코드를 짜놓고 Android Chrome만 BC + Web Locks로 폴백하는 방식도 가능하지만 두 구현을 유지보수하는 비용이 만만치 않다. 처음부터 한 쪽으로 가는 게 깔끔하다.

---

## 시리즈를 닫으며

10편을 거쳐 두 축이 한 그림으로 모였다.

```text
                  [축 A] 통신 프로토콜
                       │
   polling ─── SSE ─── WebSocket ─── WebRTC
       │       │           │            │
       │   이벤트 스트림  양방향 메시지   P2P 미디어
       │
       └── HTTP 그대로 (단순)

                  [축 B] JS 실행 컨텍스트
                       │
   Main ─── Dedicated W ─── Shared W ─── Service W
     │         │              │             │
     │      한 탭 전용     여러 탭 공유   origin 전체
     │      백그라운드     상태 공유      네트워크 프록시
     │                                    + 푸시
     └── DOM 있음
```

핵심만 한 줄씩 추려 본다.

- 데이터를 "어떻게 옮길까"와 "어디서 돌릴까"는 **다른 축**이고 서로 곱해진다.
- WebSocket 핸드셰이크가 이상하게 생긴 건 **cross-protocol 공격을 막기 위한 합의**의 결과다. abarth 드래프트들이 그 출발점이었다.
- WebSocket이 양방향이지만 자동 재연결도 하트비트도 없다. 그 위에 **재연결·하트비트·백오프·jitter**를 얹어야 끊김에 강해진다.
- WebRTC는 같은 카테고리가 아니다. **P2P 통신 스택**이고 시그널링 채널은 보통 WebSocket이다.
- Worker 패밀리(Dedicated/Shared/Service)는 **다른 자리에 사는 다른 도구**다. 발전 단계가 아니다.
- BroadcastChannel은 **단톡방**, Web Locks는 **자물쇠**, SharedWorker는 **사람**이다. 셋의 차이를 인지하면 cross-tab 패턴 설계가 깔끔해진다.

여기까지가 실시간 웹 통신과 브라우저 런타임에 대한 한 바퀴 정리다. 2010년 드래프트 `draft-abarth-websocket-handshake-01` 한 장에서 시작해 그 위에 쌓인 RFC와 명세, 그리고 우리가 매일 짜는 코드까지 한 줄로 연결된다.

이 연결들을 React 컴포넌트 수명이나 Next.js SSR 경계와 맞추는 문제는 외전 [React/Next.js에서 WebSocket·SSE 연결 다루기](/posts/websocket-sse-in-react-and-nextjs)에서 따로 다룬다.

---

## 참고

- [W3C: Web Locks API](https://www.w3.org/TR/web-locks/)
- [MDN: Web Locks API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
- [MDN: BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [Chrome for Developers: Web Locks](https://developer.chrome.com/docs/web-platform/web-locks)
