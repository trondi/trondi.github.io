---
title: "SSE와 Shared Worker — 실시간 통신의 두 가지 접근"
date: "2026-04-19"
summary: "SSE로 서버 알림을 받고 Shared Worker로 탭 간 상태를 동기화하는 실전 패턴 — pageType 기반 팬아웃 필터링과 markAsRead 크로스탭 동기화를 중심으로 설명한다."
category: "JavaScript / TypeScript"
tags:
  - SSE
  - Shared Worker
  - Real-time
  - Web API
featured: false
---

# SSE와 Shared Worker — 실시간 통신의 두 가지 접근

## 왜 이 둘을 같이 보는가

여러 탭에서 동일한 알림을 보는 대시보드를 만든다고 하자. 탭 A에서 알림을 읽으면 탭 B의 배지도 꺼져야 한다. 이 단순해 보이는 요건이 두 가지 선택을 결정했다.

**SSE를 선택한 이유** — 알림은 서버가 클라이언트에게 밀어주기만 하면 된다. 클라이언트가 서버로 데이터를 보낼 일이 없으니 WebSocket은 오버스펙이다.

**Shared Worker를 선택한 이유** — 탭마다 SSE 연결을 만들면 서버 비용이 탭 수만큼 늘어나고, 탭 간 상태를 동기화할 수단이 없다. Worker를 하나만 두면 SSE 연결도 하나로 줄고, `lastReadNotiSeq` 같은 공유 상태를 Worker 메모리에 보관할 수 있다.

```
서버 ──SSE──→ Shared Worker (lastReadNotiSeq 보관)
                  ├─ [ALL  탭] 배지 업데이트
                  ├─ [HOST 탭] 호스트·컨테이너 알람
                  └─ [CNTR 탭] 컨테이너 알람만
```

탭마다 구독 범위(pageType)가 다르기 때문에, Worker는 단순히 전체 브로드캐스트를 하는 것이 아니라 각 포트의 pageType에 맞는 알람만 골라서 전달한다.

---

## SSE — Server-Sent Events

### WebSocket과 비교

| | WebSocket | SSE |
|---|---|---|
| 방향 | 양방향 | 서버 → 클라이언트 단방향 |
| 프로토콜 | ws:// / wss:// | HTTP |
| 자동 재연결 | 직접 구현 | 브라우저가 자동 처리 |
| 텍스트/바이너리 | 둘 다 | 텍스트만 |
| 방화벽 통과 | 간혹 문제 | HTTP이므로 우수 |

알림처럼 서버가 데이터를 밀어주기만 하는 경우, WebSocket의 양방향 기능은 오버스펙이다. SSE는 HTTP 그대로 동작하고 브라우저가 재연결도 처리해 준다.

### 서버 구현 (Next.js API Route)

```ts
// app/api/events/route.ts
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // SSE 포맷: "data: <내용>\n\n"
      const send = (data: object) => {
        const text = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(text));
      };

      // 초기 이벤트
      send({ type: 'connected', time: Date.now() });

      // 주기적 이벤트 (예: 실시간 알림 대기)
      const interval = setInterval(() => {
        send({ type: 'ping', time: Date.now() });
      }, 30_000);

      // 클라이언트 연결 종료 시 정리
      // (stream cancel 시 호출됨)
      return () => clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### 클라이언트 구현

```ts
// EventSource 생성 — 브라우저가 자동 재연결 처리
const es = new EventSource('/api/events');

es.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('받은 이벤트:', data);
};

es.onerror = (error) => {
  console.error('SSE 연결 오류:', error);
  // 브라우저가 자동으로 재연결 시도함
};

// 특정 이벤트 타입 구독 (서버에서 "event: notification\n" 설정 시)
es.addEventListener('notification', (event) => {
  showNotification(JSON.parse(event.data));
});

// 정리
function cleanup() {
  es.close();
}
```

### SSE 이벤트 포맷 상세

```
# 기본 메시지
data: {"type":"ping"}\n\n

# 이벤트 타입 지정
event: notification\n
data: {"title":"새 댓글","count":3}\n\n

# 이벤트 ID (재연결 시 Last-Event-ID 헤더로 전송됨)
id: 42\n
data: {"message":"hello"}\n\n

# 재연결 대기 시간 설정 (ms)
retry: 5000\n\n
```

### React에서 사용

```tsx
import { useEffect, useState } from 'react';

export function useSSE<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Event | null>(null);

  useEffect(() => {
    const es = new EventSource(url);

    es.onmessage = (event) => {
      setData(JSON.parse(event.data));
    };

    es.onerror = (err) => {
      setError(err);
    };

    return () => es.close();
  }, [url]);

  return { data, error };
}

// 사용
function NotificationBadge() {
  const { data } = useSSE<{ count: number }>('/api/notifications');
  return <span>{data?.count ?? 0}</span>;
}
```

---

## Shared Worker

### Worker 종류 비교

| | Web Worker | Shared Worker | Service Worker |
|---|---|---|---|
| 생명주기 | 탭과 동일 | 모든 탭이 닫힐 때 종료 | 브라우저가 별도 관리 |
| 탭 간 공유 | ✗ | ✓ | ✓ |
| 주 용도 | 무거운 연산 | 탭 간 상태 공유 | 오프라인/캐싱 |
| 통신 방식 | postMessage | MessagePort | postMessage |

Shared Worker는 탭 간 공유 상태를 자연스럽게 가질 수 있다. `lastReadNotiSeq`처럼 여러 탭이 동의해야 하는 값을 Worker 메모리에 두면, 어느 탭에서 변경하든 Worker가 중재자 역할을 한다.

### 문제 상황: 탭마다 SSE 연결이 생긴다

탭을 5개 열면 서버에 SSE 연결이 5개 생긴다. Shared Worker를 쓰면 연결이 1개로 줄어든다.

```diagram
sse-shared-worker
```

```
[탭1] ──┐
[탭2] ──┤── Shared Worker ── SSE → 서버
[탭3] ──┘
```

### Shared Worker 구현

```js
// public/shared-worker.js
const ports = new Set();
let es = null;

function startSSE() {
  es = new EventSource('/api/events');

  es.onmessage = (event) => {
    // 연결된 모든 탭에 브로드캐스트
    for (const port of ports) {
      port.postMessage({ type: 'sse', data: JSON.parse(event.data) });
    }
  };

  es.onerror = () => {
    for (const port of ports) {
      port.postMessage({ type: 'error' });
    }
  };
}

// 탭이 Worker에 연결될 때
self.onconnect = (event) => {
  const port = event.ports[0];
  ports.add(port);

  // 첫 탭 연결 시 SSE 시작
  if (!es) startSSE();

  port.onmessage = (e) => {
    // 탭 → Worker 메시지 처리 (양방향 통신 가능)
    if (e.data.type === 'send') {
      // 탭에서 보낸 데이터를 다른 탭에 relay
      for (const p of ports) {
        if (p !== port) p.postMessage(e.data);
      }
    }
  };

  // 탭이 닫히면 정리
  port.addEventListener('close', () => {
    ports.delete(port);
    if (ports.size === 0) {
      es?.close();
      es = null;
    }
  });

  port.start();
};
```

### 탭(클라이언트)에서 Shared Worker 사용

```ts
// lib/shared-worker-client.ts
let worker: SharedWorker | null = null;

export function getSharedWorker() {
  if (!worker && typeof SharedWorker !== 'undefined') {
    worker = new SharedWorker('/shared-worker.js');
    worker.port.start();
  }
  return worker;
}

// React 훅
export function useSharedWorker() {
  const [message, setMessage] = useState<unknown>(null);

  useEffect(() => {
    const sw = getSharedWorker();
    if (!sw) return;

    const handler = (event: MessageEvent) => {
      setMessage(event.data);
    };

    sw.port.addEventListener('message', handler);
    return () => sw.port.removeEventListener('message', handler);
  }, []);

  const send = useCallback((data: unknown) => {
    getSharedWorker()?.port.postMessage(data);
  }, []);

  return { message, send };
}
```

### 타입스크립트에서 Shared Worker 타입 지정

```ts
// tsconfig.json에 "lib": ["webworker.sharedworker"] 추가 필요
// 또는 /// <reference lib="webworker" /> 선언
```

---

## SSE + Shared Worker 조합 — 실전 패턴

```diagram
sse-shared-worker-arch
```

### pageType 등록 — 탭마다 구독 범위를 다르게

Worker에 연결할 때 이 탭이 어떤 맥락인지 알려준다. 헤더 배지는 `ALL`, 특정 데이터 테이블은 `HOST` 또는 `CNTR`. Worker는 이 정보를 port와 함께 저장해 두었다가 알람 팬아웃 시 필터 기준으로 쓴다.

```ts
// worker.ts
type PageType = 'ALL' | 'HOST' | 'CNTR';
type AlarmType = 'HOST' | 'CNTR';

interface ConnectedPort { port: MessagePort; pageType: PageType; }

const connectedPorts: ConnectedPort[] = [];
let lastReadNotiSeq = 0;

const worker = self as unknown as SharedWorkerGlobalScope;

worker.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  port.start();

  port.onmessage = (msg) => {
    const { type, pageType, baseURL } = msg.data;

    if (type === 'REGISTER') {
      connectedPorts.push({ port, pageType });
      port.postMessage({ type: 'CONNECTED_ACK' });
      if (baseURL) setupSSE(baseURL); // 첫 탭 연결 시 SSE 시작
    }

    if (type === 'CLOSE') {
      const idx = connectedPorts.findIndex((p) => p.port === port);
      if (idx > -1) connectedPorts.splice(idx, 1);
    }
  };
};
```

클라이언트 쪽은 `getWorker`를 호출할 때 pageType을 함께 넘긴다.

```ts
// client.ts — Worker 연결 및 pageType 등록
function getWorkerPort(pageType: PageType, baseURL: string): MessagePort {
  const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), {
    name: 'notification-worker',
    type: 'module',
  });
  worker.port.start();
  worker.port.postMessage({ type: 'REGISTER', pageType, baseURL });
  return worker.port;
}
```

### pageType 기반 팬아웃 — 단순 브로드캐스트가 아닌 필터링

SSE 이벤트가 도착하면 Worker는 connectedPorts를 순회하면서 각 탭의 pageType에 맞는 알람만 전달한다. 브로드캐스트처럼 보이지만 실제로는 유니캐스트 필터링이다.

```ts
// worker.ts — SSE 이벤트 수신 시
eventSource.onmessage = (event) => {
  const alarm: { notiType: AlarmType; notiSeq: number } = JSON.parse(event.data);

  connectedPorts.forEach(({ port, pageType }) => {
    const isHost = alarm.notiType === 'HOST';
    const isCntr = alarm.notiType === 'CNTR';

    const shouldSend =
      pageType === 'ALL' ||                          // 헤더: 모든 알람 수신
      (pageType === 'HOST' && (isHost || isCntr)) || // 호스트 테이블: 호스트 + 컨테이너
      (pageType === 'CNTR' && isCntr);               // 컨테이너 테이블: 컨테이너만

    if (shouldSend) {
      port.postMessage({ type: 'ALARM_RECEIVED', data: alarm });
    }
  });

  broadcastUnreadStatus(); // 새 알람 수신 시마다 읽음 상태 갱신
};
```

필터를 Worker에 두면 탭 쪽 코드가 단순해진다. 각 탭은 "내게 온 알람"만 처리하면 된다. 알람 타입이 추가될 때도 Worker 한 곳만 수정하면 된다.

### markAsRead — 한 탭에서 읽으면 모든 탭이 갱신

읽음 처리는 Worker가 `lastReadNotiSeq`를 갱신하고 모든 `ALL` 탭에 `UNREAD_STATUS_CHANGED`를 보내는 방식으로 구현한다. 탭끼리 직접 통신하지 않아도 된다.

```
탭 A (사용자가 "읽음" 클릭)
  → MARK_AS_READ → Worker: lastReadNotiSeq 갱신
    → broadcastUnreadStatus()
      → ALL 타입 탭 전체에 UNREAD_STATUS_CHANGED 전송
```

```ts
// worker.ts — MARK_AS_READ 수신 시
if (type === 'MARK_AS_READ') {
  if (alarmQueue.length > 0) {
    lastReadNotiSeq = alarmQueue[alarmQueue.length - 1].notiSeq;
  }
  broadcastUnreadStatus();
}

function broadcastUnreadStatus() {
  const latestSeq = alarmQueue.length > 0 ? alarmQueue[alarmQueue.length - 1].notiSeq : 0;
  const hasUnread = latestSeq > lastReadNotiSeq;

  connectedPorts.forEach(({ port, pageType }) => {
    if (pageType === 'ALL') {
      port.postMessage({ type: 'UNREAD_STATUS_CHANGED', hasUnread });
    }
  });
}
```

React hook에서는 port 연결과 메시지 처리를 캡슐화한다.

```tsx
// useNotification.ts
export function useNotification(pageType: PageType) {
  const [hasUnread, setHasUnread] = useState(false);
  const portRef = useRef<MessagePort | null>(null);

  useEffect(() => {
    const port = getWorkerPort(pageType, '/api');
    portRef.current = port;

    port.onmessage = (event) => {
      if (event.data.type === 'UNREAD_STATUS_CHANGED') {
        setHasUnread(event.data.hasUnread);
      }
      // ALARM_RECEIVED는 각 탭의 UI 업데이트에 활용
    };

    return () => port.postMessage({ type: 'CLOSE' });
  }, [pageType]);

  const markAsRead = useCallback(() => {
    portRef.current?.postMessage({ type: 'MARK_AS_READ' });
  }, []);

  return { hasUnread, markAsRead };
}

// 사용 예
function NotificationBadge() {
  const { hasUnread, markAsRead } = useNotification('ALL');
  return (
    <button onClick={markAsRead}>
      알림 {hasUnread && <span className="badge" />}
    </button>
  );
}
```

---

## 정리

| | SSE | Shared Worker |
|---|---|---|
| 역할 | 서버 → 클라이언트 스트리밍 | 탭 간 공유 백그라운드 스레드 |
| 연결 대상 | 서버 | 브라우저 내부 |
| 핵심 장점 | HTTP 기반, 자동 재연결, 단순 API | 연결 수 감소, 탭 간 상태 동기화 |
| 주의 사항 | 단방향 (서버→클라이언트만) | Safari 지원 제한적, SharedWorker 미지원 환경 폴백 필요 |

이 조합에서 Shared Worker가 담당하는 것:

| Worker 역할 | 설명 |
|---|---|
| 단일 SSE 연결 유지 | 탭 수와 무관하게 서버 연결 1개 |
| pageType 기반 팬아웃 | 탭의 구독 범위에 맞는 알람만 전달 |
| `lastReadNotiSeq` 보관 | 어느 탭에서 읽든 Worker가 단일 진실 원천 |
| 읽음 상태 브로드캐스트 | ALL 탭 전체에 UNREAD_STATUS_CHANGED 전송 |

실시간 알림처럼 서버 → 클라이언트 단방향 흐름에는 SSE가 더 적합하다. Shared Worker를 더하면 서버 연결을 1개로 줄이는 것 이상의 이점이 생긴다 — Worker가 `lastReadNotiSeq` 같은 공유 상태의 단일 진실 원천이 되어, 탭 간 직접 통신 없이도 읽음 상태를 자연스럽게 동기화할 수 있다.
