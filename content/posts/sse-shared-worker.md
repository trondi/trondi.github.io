---
title: "SSE와 Shared Worker — 실시간 통신의 두 가지 접근"
date: "2026-04-19"
summary: "Server-Sent Events로 서버 → 클라이언트 단방향 스트리밍을 구현하는 방법과, Shared Worker로 탭 간 상태를 공유하는 방법을 정리했다."
category: "Project"
tags:
  - SSE
  - Shared Worker
  - Real-time
  - Web API
featured: false
---

# SSE와 Shared Worker — 실시간 통신의 두 가지 접근

## 왜 이 둘을 같이 보는가

실시간 기능을 구현할 때 자주 마주치는 두 가지 도구다.

- **SSE**: 서버가 클라이언트에게 데이터를 **밀어주는** 단방향 채널
- **Shared Worker**: 여러 탭이 **하나의 백그라운드 스레드를 공유**하는 방법

SSE로 서버 이벤트를 받고, Shared Worker로 그 이벤트를 여러 탭에 분배하면 강력한 조합이 된다.

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

데이터를 서버에서만 클라이언트로 보내는 경우(알림, 피드, 진행 상황)라면 SSE가 더 단순하다.

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

## SSE + Shared Worker 조합

```
서버 ──SSE──→ Shared Worker ──postMessage──→ 탭1
                                          ──postMessage──→ 탭2
                                          ──postMessage──→ 탭3
```

```js
// shared-worker.js — 실전 버전
const ports = new Set();

function broadcast(msg) {
  for (const port of ports) port.postMessage(msg);
}

// Last-Event-ID 추적으로 재연결 시 누락 방지
let lastEventId = '';

function connect() {
  const url = lastEventId
    ? `/api/events?lastEventId=${lastEventId}`
    : '/api/events';

  const es = new EventSource(url);

  es.onmessage = (e) => {
    lastEventId = e.lastEventId;
    broadcast({ type: 'message', data: JSON.parse(e.data) });
  };

  es.onerror = () => {
    es.close();
    // 5초 후 재연결 (브라우저 자동 재연결 대신 수동 제어)
    setTimeout(connect, 5000);
  };
}

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.add(port);
  if (ports.size === 1) connect();
  port.start();
};
```

---

## 정리

| | SSE | Shared Worker |
|---|---|---|
| 역할 | 서버 → 클라이언트 스트리밍 | 탭 간 공유 백그라운드 스레드 |
| 연결 대상 | 서버 | 브라우저 내부 |
| 핵심 장점 | HTTP 기반, 자동 재연결, 단순 API | 연결 수 감소, 탭 간 상태 동기화 |
| 주의 사항 | 단방향 (서버→클라이언트만) | Safari 지원 제한적, SharedWorker 미지원 환경 폴백 필요 |

실시간 알림, 라이브 피드처럼 서버 → 클라이언트 단방향 데이터 흐름에는 WebSocket 대신 **SSE**가 더 적합하다. 여러 탭이 동일한 연결을 공유해야 한다면 **Shared Worker**와 조합하면 서버 부하를 크게 줄일 수 있다.
