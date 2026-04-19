---
title: "실무에서 SSE + Shared Worker를 도입하며 마주친 것들"
date: "2026-04-19"
summary: "실시간 알람 시스템을 SSE와 Shared Worker로 구축하면서 실제로 고민했던 것들 — Next.js Edge Runtime 문제, 배치 전략 설계, 재연결 정책, 탭 간 상태 동기화까지."
category: "JavaScript / TypeScript"
tags:
  - SSE
  - Shared Worker
  - Real-time
  - Next.js
  - Architecture
featured: true
---

# 실무에서 SSE + Shared Worker를 도입하며 마주친 것들

## 배경

인프라 모니터링 대시보드를 개발하면서 실시간 알람 기능이 필요해졌다. Host(서버)와 Container 각각의 상태 변화 — 생성, 삭제, 시작, 중지 — 를 화면에서 즉시 반영해야 했다.

선택지는 크게 세 가지였다.

- **폴링**: 일정 주기로 API를 반복 호출
- **WebSocket**: 양방향 실시간 통신
- **SSE(Server-Sent Events)**: 서버 → 클라이언트 단방향 스트리밍

알람은 서버에서 클라이언트 방향으로만 흐른다. 클라이언트가 서버에 실시간으로 메시지를 보낼 필요가 없다. 그렇다면 WebSocket은 오버스펙이고, SSE가 적합하다. 폴링은 최신성과 서버 부하 사이에서 균형을 맞추기 어려웠다.

SSE로 결정한 이후, 진짜 고민이 시작됐다.

---

## 고민 1 — 탭마다 SSE 연결이 생기는 문제

처음엔 단순하게 구현했다. 페이지 컴포넌트가 마운트될 때 `EventSource`를 열고, 언마운트될 때 닫는다.

```typescript
// 처음 구현 (단순 버전)
useEffect(() => {
  const es = new EventSource('/api/proxy/alarm/connect');
  es.onmessage = handleAlarm;
  return () => es.close();
}, []);
```

문제는 금방 드러났다. 이 대시보드는 Host 목록, Container 목록, 헤더 알람 아이콘이 **각자 독립적으로 알람을 구독**한다. 탭을 여러 개 열면 탭마다 각 컴포넌트가 별도로 `EventSource`를 생성한다.

탭 5개 × 구독 컴포넌트 3개 = 서버 SSE 연결 **15개**.

브라우저는 같은 도메인에 대해 HTTP/1.1에서 연결을 6개로 제한한다. 연결 15개가 붙으면 일부는 큐에서 대기하게 된다. 서버 입장에서도 각 연결마다 상태를 유지해야 하므로 부하가 불필요하게 늘어난다.

### Shared Worker로 연결을 1개로 줄이기

**Shared Worker**는 같은 오리진의 모든 탭이 하나의 백그라운드 스레드를 공유하는 Web API다. `new SharedWorker(url, { name: 'PadionAlarmWorker' })`처럼 이름을 지정하면 브라우저는 같은 이름의 Worker가 이미 있으면 새로 만들지 않고 기존 것을 재사용한다.

```
[ 탭1: Host 목록 ]  ─┐
[ 탭1: Header     ]  ─┤── MessagePort ── Shared Worker ── SSE 1개 ──▶ 서버
[ 탭2: Host 목록 ]  ─┤── MessagePort ─┘
[ 탭2: Container  ]  ─┘
```

Worker 내부에서 SSE 연결은 딱 한 번만 열린다.

```typescript
// worker.ts
let eventSource: EventSource | null = null;

function setupSSE(baseURL: string) {
  // 이미 연결되어 있으면 아무것도 하지 않음
  if (eventSource && eventSource.readyState !== EventSource.CLOSED) return;

  eventSource = new EventSource(`${baseURL}/alarm/connect`, {
    withCredentials: true, // 쿠키 기반 인증
  });

  eventSource.onmessage = (e) => {
    const alarm: AlarmInfo = JSON.parse(e.data);
    allAlarmQueue.push(alarm);
    broadcastToAllPorts(alarm);
  };
}
```

각 컴포넌트는 `MessagePort`를 통해 Worker와 통신한다. Worker가 알람을 받으면 연결된 모든 포트에 `postMessage`로 분배한다.

탭 수가 몇 개든 SSE 연결은 1개다.

---

## 고민 2 — Next.js에서 SSE 프록시가 안 된다

백엔드 API가 내부망에 있어서 Next.js API Route를 프록시로 써야 했다. 처음엔 `fetch`로 프록시를 만들었다.

```typescript
// 처음 시도 (문제 있음)
export async function GET(request: NextRequest) {
  const response = await fetch('http://internal-backend/alarm/connect', {
    headers: { cookie: request.headers.get('cookie') ?? '' },
  });
  return response; // SSE 스트리밍 전달
}
```

**30초마다 연결이 끊겼다.** Next.js의 `fetch`는 내부적으로 body 읽기에 타임아웃을 걸어두고 있다. SSE는 연결이 계속 열려있어야 하는데, 30초 후 fetch가 응답 body를 포기해 버린다.

다음으로 Edge Runtime을 의심했다. Next.js Route의 기본 runtime은 `nodejs`지만, `export const runtime = 'edge'`를 명시했을 때 Cloudflare Workers 같은 환경은 스트리밍 응답을 내부적으로 버퍼링할 수 있다. 버퍼링이 일어나면 SSE가 실시간으로 전달되지 않는다.

### node:http로 직접 연결

해결책은 `fetch`를 버리고 Node.js 내장 `http`/`https` 모듈로 직접 연결하는 것이었다.

```typescript
// route.ts
export const runtime = 'nodejs'; // Edge Runtime 아님을 명시

import http from 'node:http';

export async function GET(request: NextRequest) {
  return new Promise<Response>((resolve) => {
    const req = http.request({
      hostname: 'internal-backend',
      path: '/alarm/connect',
      headers: {
        cookie: request.headers.get('cookie') ?? '',
        accept: 'text/event-stream',
        'cache-control': 'no-cache',
      },
    }, (res) => {
      let closed = false;

      const stream = new ReadableStream({
        start(controller) {
          res.on('data', (chunk: Buffer) => {
            if (!closed) {
              try {
                controller.enqueue(chunk);
              } catch {
                // 브라우저가 이미 연결을 끊음
                closed = true;
                req.destroy();
              }
            }
          });

          res.on('end', () => controller.close());
          res.on('error', () => controller.error());
        },
        cancel() {
          // 브라우저가 연결을 끊으면 백엔드 요청도 종료
          req.destroy();
        },
      });

      resolve(new Response(stream, {
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'x-accel-buffering': 'no', // nginx 등 프록시의 버퍼링 비활성화
        },
      }));
    });

    // 브라우저 연결 끊기 → 백엔드 요청도 종료
    request.signal.addEventListener('abort', () => req.destroy());

    req.end();
  });
}
```

`x-accel-buffering: no` 헤더도 중요하다. nginx 같은 리버스 프록시가 앞에 있으면 SSE 응답을 버퍼링할 수 있는데, 이 헤더로 비활성화한다.

`closed` 플래그도 필요했다. 브라우저가 먼저 연결을 끊으면 `ReadableStream`이 이미 닫힌 상태에서 `controller.enqueue()`를 호출해 에러가 발생한다. 플래그로 이를 방지한다.

---

## 고민 3 — 알람이 쏟아질 때 화면을 어떻게 갱신할까

Host/Container 목록은 React Query로 관리한다. 알람이 올 때마다 `refetch()`를 호출하는 게 가장 단순하지만, 서버에서 초당 수십 개의 알람이 연속으로 올 수 있다. 그때마다 전체 목록을 다시 불러오면 API 호출이 폭증한다.

두 가지 전략을 나눠서 생각했다.

**FULL_REFRESH**: 전체 목록 API를 다시 호출

**ROW_UPDATE**: 영향받은 행만 API로 가져와 React Query 캐시를 직접 수정

### 언제 FULL_REFRESH를 할까

알람에는 `notiAct` 필드가 있다. `create`, `destroy`처럼 행 자체가 추가되거나 사라지는 액션은 ROW_UPDATE로 처리할 수 없다 — 업데이트할 행이 없거나 삭제된 행이기 때문이다.

```typescript
// 이 액션들은 FULL_REFRESH
const ALARM_FULL_REFRESH_ACTION_HOST = ['CRT', 'DEL'];
const ALARM_FULL_REFRESH_ACTION_CNTR = ['create', 'destroy', 'CRT', 'RM', 'RMF'];
```

또한 짧은 시간에 알람이 쏟아지면 — 8개 이상이 큐에 쌓이면 — 개별 업데이트보다 전체 새로고침이 더 효율적이다. 어차피 화면은 이미 크게 달라진 상태다.

```typescript
export const getUpdateStrategy = (
  queue: Map<string, AlarmInfo>,
  threshold: number,
  pageType: AlarmPageType,
): UpdateStrategyResult => {
  // 1. 행 추가/삭제 액션 → 무조건 전체 새로고침
  for (const alarm of queue.values()) {
    if (FULL_REFRESH_ACTIONS.includes(alarm.notiAct)) {
      return { strategy: UPDATE_STRATEGY.FULL_REFRESH };
    }
  }

  // 2. 큐가 임계값 초과 → 전체 새로고침
  if (queue.size >= threshold) {
    return { strategy: UPDATE_STRATEGY.FULL_REFRESH };
  }

  // 3. 기본 → 행 단위 업데이트
  return { strategy: UPDATE_STRATEGY.ROW_UPDATE };
};
```

### FULL_REFRESH_GAP — 전체 새로고침 최소 간격

문제가 하나 더 있었다. `destroy` 알람이 연속으로 5개 오면 FULL_REFRESH가 5번 발생한다. 각각 API 호출이 일어나는 건 낭비다.

`FULL_REFRESH_GAP`을 8초로 설정했다. 마지막 FULL_REFRESH로부터 8초가 지나지 않았다면 즉시 실행하지 않고 타이머로 예약만 해둔다. 8초 안에 다시 FULL_REFRESH 조건이 발생해도 타이머가 이미 걸려 있으니 추가 API 호출은 없다.

```typescript
const lastFullRefreshTime = useRef<number>(0);
const fullRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

function scheduleFullRefresh() {
  const now = Date.now();
  const elapsed = now - lastFullRefreshTime.current;

  if (elapsed >= FULL_REFRESH_GAP) {
    // 충분한 시간이 지났으면 즉시 실행
    executeFullRefresh();
    lastFullRefreshTime.current = now;
  } else {
    // 아직 간격이 안 됐으면 타이머 예약 (이미 있으면 그대로 유지)
    if (!fullRefreshTimer.current) {
      fullRefreshTimer.current = setTimeout(() => {
        executeFullRefresh();
        lastFullRefreshTime.current = Date.now();
        fullRefreshTimer.current = null;
      }, FULL_REFRESH_GAP - elapsed);
    }
  }
}
```

ROW_UPDATE는 5초 단위로 throttle한다. 5초 동안 들어온 알람을 모아서 한 번에 처리한다.

---

## 고민 4 — 재연결을 어떻게 할까

SSE 연결이 끊기는 건 피할 수 없다. 서버 재시작, 네트워크 일시 장애, 인증 만료 등 이유는 다양하다.

브라우저의 `EventSource`는 연결이 끊기면 자동으로 재연결을 시도한다. 문제는 이 재연결 간격이 짧아서 서버가 순간적으로 다운됐을 때 대량의 재연결 요청이 쏟아질 수 있다는 것이다.

Shared Worker 안에서 직접 재연결 로직을 구현했다. `eventSource.onerror` 이벤트를 받으면 기존 `EventSource`를 닫고 **exponential backoff**로 재시도한다.

```typescript
// worker.ts
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // 1초
const MAX_RECONNECT_DELAY = 30000;    // 30초

let reconnectAttempt = 0;

function attemptReconnect(baseURL: string) {
  if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
    // 5회 실패 → 모든 탭에 알림
    broadcastToAllPorts({ type: 'SSE_RECONNECT_FAILED' });
    return;
  }

  const delay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempt),
    MAX_RECONNECT_DELAY,
  );
  // 1초 → 2초 → 4초 → 8초 → 16초

  broadcastToAllPorts({ type: 'SSE_RECONNECT_ATTEMPT', attempt: reconnectAttempt + 1 });

  setTimeout(() => {
    reconnectAttempt += 1;
    setupSSE(baseURL);
  }, delay);
}
```

재연결에 성공하면 `reconnectAttempt`를 0으로 리셋하고 연결된 모든 탭에 `SSE_RECONNECTED`를 전송한다. 탭에서는 이 메시지를 받으면 알람 목록을 새로고침한다.

5회 모두 실패하면 `SSE_RECONNECT_FAILED`를 탭들에 알린다. 이 경우 UI에서 "실시간 연결이 끊어졌습니다" 같은 메시지를 보여줄 수 있다.

---

## 고민 5 — 탭 간 읽음 상태를 어떻게 동기화할까

헤더에 알람 벨 아이콘이 있다. 읽지 않은 알람이 있으면 빨간 점이 표시된다. 탭 1에서 읽음 처리를 하면 탭 2의 빨간 점도 사라져야 한다.

Shared Worker의 메모리(`lastReadNotiSeq`)는 Worker가 살아있는 동안 유지된다. 하지만 새 탭이 열리면 처음에 Worker에 `REGISTER` 메시지를 보내서 현재 읽음 상태를 받아와야 한다.

더 큰 문제는 **Worker가 종료됐을 때**다. 모든 탭이 닫히면 Shared Worker도 종료된다. 새 탭을 열면 Worker가 새로 생성되고 읽음 상태가 초기화된다.

이를 해결하기 위해 `localStorage`에 마지막 읽음 시퀀스를 함께 저장한다.

```typescript
// Worker가 읽음 상태를 변경할 때 → 모든 탭에 알림
function handleMarkAsRead(newSeq: number) {
  lastReadNotiSeq = newSeq;

  // 각 탭에 localStorage 저장 요청
  broadcastToAllPorts({
    type: 'SAVE_LAST_READ',
    notiSeq: newSeq,
  });
}

// 각 탭에서 처리
port.onmessage = (msg) => {
  if (msg.data.type === 'SAVE_LAST_READ') {
    localStorage.setItem('padion_last_read_noti_seq', String(msg.data.notiSeq));
  }
};
```

새 탭에서 Worker에 연결하면 Worker는 `INIT_LAST_READ`를 보내고, 탭은 localStorage에서 읽어서 Worker에게 알려준다.

Worker가 localStorage에 직접 접근할 수 없기 때문에(Shared Worker는 DOM에 접근 불가) 이런 우회 방식을 써야 했다.

---

## 고민 6 — 새 탭에서 이전 알람을 어떻게 보여줄까

알람 히스토리를 어떻게 처리할지도 고민이었다.

Worker는 `allAlarmQueue`라는 배열에 수신한 알람을 최대 100개까지 메모리에 보관한다. 새 탭이 Worker에 연결되면 Worker는 이 큐를 `INIT_HISTORY`로 전달한다. 탭을 새로 열어도 방금 전 알람 목록을 볼 수 있다.

```typescript
// worker.ts — 새 포트 연결 시
connectedPorts.push({ port, pageType });

// 기존 알람 이력 전달
port.postMessage({
  type: ALARM_MESSAGE_TYPE.INIT_HISTORY,
  data: allAlarmQueue.slice(-100), // 최근 100개
});
```

다만 이 방식의 한계는 Worker가 종료되면 이력도 사라진다는 것이다. 완벽한 이력 관리가 필요하다면 서버에서 알람 이력 API를 별도로 제공하는 것이 맞다. 이 프로젝트에서는 "방금 전 알람 정도는 보여주면 충분하다"는 결론을 내렸다.

---

## 고민 7 — pageType별 필터링

Host 목록 페이지는 Host 알람과 Container 알람 둘 다 받아야 한다. Container 목록 페이지는 Container 알람만 받으면 된다. 헤더는 모든 알람을 받는다.

Worker에서 각 포트를 등록할 때 `pageType`을 함께 저장하고, 알람을 분배할 때 필터링한다.

```typescript
function broadcastAlarm(alarm: AlarmInfo) {
  connectedPorts.forEach(({ port, pageType }) => {
    const isHost = alarm.notiType === 'HOST';
    const isCntr = alarm.notiType === 'CNTR' || alarm.notiType === 'container';

    let shouldSend = false;
    if (pageType === 'ALL') shouldSend = true;
    if (pageType === 'HOST' && (isHost || isCntr)) shouldSend = true;
    if (pageType === 'CNTR' && isCntr) shouldSend = true;

    if (shouldSend) {
      port.postMessage({ type: ALARM_MESSAGE_TYPE.ALARM_RECEIVED, data: alarm });
    }
  });
}
```

---

## 결론 — 선택의 이유들

이 구현에서 내린 주요 결정들을 다시 정리하면:

| 결정 | 이유 |
|---|---|
| SSE (WebSocket 대신) | 알람은 서버→클라이언트 단방향. WebSocket은 오버스펙 |
| Shared Worker | 탭마다 SSE 연결 생기는 문제 해결. 연결 수 최소화 |
| node:http (fetch 대신) | Edge Runtime + fetch의 30초 타임아웃 문제 우회 |
| FULL_REFRESH_GAP | create/destroy 알람 연속 발생 시 API 호출 폭증 방지 |
| Exponential backoff | 서버 장애 시 재연결 요청 집중 방지 |
| localStorage 병용 | Worker 종료 후에도 읽음 상태 유지 |
| Worker 메모리 큐 | 새 탭 열었을 때 최근 이력 즉시 표시 |

처음에는 "SSE 하나 붙이면 되겠지" 싶었는데, 실제로 부딪혀보니 고민할 것들이 꽤 많았다. 특히 Next.js의 런타임 제약과 다중 탭 환경은 예상하지 못한 변수였다. 결국 각 문제를 하나씩 풀어가면서 지금의 구조가 만들어졌다.
