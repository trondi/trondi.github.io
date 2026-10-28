---
title: "React/Next.js에서 WebSocket·SSE 연결 다루기(라이프사이클, StrictMode, SSR)"
date: "2026-10-26"
summary: "컴포넌트 수명보다 오래 사는 장기 연결을 React useEffect, React 18 StrictMode 이중 마운트, useSyncExternalStore, Next.js SSR 경계와 어떻게 정합시키는지 정리했다."
category: "React / Next.js"
tags:
  - React
  - Next.js
  - WebSocket
  - SSE
  - StrictMode
  - useSyncExternalStore
  - SSR
featured: false
---

# React/Next.js에서 WebSocket·SSE 연결 다루기

WebSocket과 SSE는 본질적으로 **컴포넌트 수명보다 오래 사는 자원**이다. React는 컴포넌트가 마운트와 언마운트를 반복하는 모델이고 Next.js는 그 컴포넌트의 일부를 서버에서 미리 렌더링한다. 두 모델의 결을 맞추는 데서 미묘한 버그들이 자주 생긴다.

이 글은 둘을 맞추는 패턴을 정리한다. 프로토콜 자체와 SharedWorker로 연결을 공유하는 패턴은 다른 글에서 다뤘다.

- [브라우저 WebSocket API 제대로 쓰기](/posts/websocket-browser-api)
- [끊김에 강한 WebSocket(재연결·하트비트·백오프)](/posts/websocket-reconnect-heartbeat-backoff)
- [여러 탭, 하나의 연결](/posts/cross-tab-shared-connection)
- [SSE 알람으로 테이블을 실시간 업데이트하는 법](/posts/sse-alarm-table-update)
- [Next.js에서 SSE와 WebSocket은 Proxy로 처리해도 될까](/posts/nextjs-proxy-sse-websocket)

---

## 먼저 결론

| 자주 막히는 지점 | 핵심 한 줄 |
|---|---|
| 개발 모드에서 WebSocket이 두 번 만들어진다 | StrictMode의 이중 마운트. cleanup이 정리하면 견디는 코드로 짜거나, 모듈 전역에 인스턴스 보관 |
| 메시지가 올 때마다 모든 자식이 리렌더된다 | `useSyncExternalStore`로 외부 store와 잇거나 Zustand selector로 좁히기 |
| `useEffect` 안에서 메시지를 받았는데 setState가 묶이지 않는다 | dependency array가 문제. `useReducer`나 ref+forceUpdate로 회피 |
| Next.js에서 `WebSocket is not defined` | `"use client"` + 브라우저 가드 |
| 컴포넌트가 사라졌는데 연결이 끊겼다 | SharedWorker나 모듈 전역으로 연결 소유권을 컴포넌트 밖에 두기 |

---

## 1. 왜 어렵나: 라이프사이클의 결이 다르다

React는 다음 그림을 전제한다.

```text
mount → render → effect setup → ... → effect cleanup → unmount
```

useEffect의 setup은 컴포넌트가 생길 때, cleanup은 사라질 때. 이건 짧은 비동기 작업에는 잘 맞는다. 하지만 WebSocket은 다르다.

```text
한 번 열면 며칠도 유지될 수 있음
재연결 시 새 socket 인스턴스로 교체
끊김·복귀가 컴포넌트 라이프와 무관하게 발생
```

이 차이를 인지하지 않고 컴포넌트 안에 `new WebSocket()`을 그냥 두면, 컴포넌트가 두 번 마운트되거나(StrictMode), props가 바뀌어 effect가 재실행되거나, 부모가 잠시 unmount하면, **연결이 우수수 다시 만들어진다.** 서버에는 1초 안에 같은 사용자에서 5개의 연결이 떴다 사라진다.

---

## 2. useEffect 기본 패턴: cleanup이 핵심

가장 단순한 모양은 다음과 같다.

```tsx
function Chat() {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const ws = new WebSocket("wss://example.com/chat");
    ws.onmessage = (e) => setMessages((prev) => [...prev, e.data]);
    return () => ws.close();
  }, []);

  return <Messages list={messages} />;
}
```

이건 작은 시나리오에서는 동작한다. 다만 다음 함정 셋이 따라붙는다.

### 함정 1: dependency array

```tsx
useEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = (e) => onMessage(e.data); // ⚠️ onMessage가 매 렌더마다 새 함수면?
  return () => ws.close();
}, [url, onMessage]); // ⚠️ 매 렌더마다 effect 재실행
```

`onMessage` 같은 핸들러가 매 렌더 새 함수가 되면, effect가 매번 재실행되어 **WebSocket이 매 렌더마다 새로 만들어진다.** `useCallback`으로 안정시키거나, 핸들러는 dependency에서 빼고 ref로 잡는다.

```tsx
const onMessageRef = useRef(onMessage);
useEffect(() => { onMessageRef.current = onMessage; });

useEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = (e) => onMessageRef.current(e.data);
  return () => ws.close();
}, [url]); // url만 의존
```

### 함정 2: 부모 재마운트

상위 레이아웃이 잠시 사라졌다 돌아오는 흔한 경우(라우트 이동, Suspense fallback)에도 WebSocket이 새로 만들어진다. 정말로 한 사용자 = 한 연결을 보장하려면 컴포넌트보다 더 위(모듈 전역이나 SharedWorker)에 연결 소유권을 두는 게 답이다.

### 함정 3: cleanup의 의미

`ws.close()`는 close 프레임을 보내고 즉시 리턴한다. 비동기로 완전히 닫히기까지는 시간이 좀 걸린다. 그 사이 새 마운트가 또 일어나면 socket이 두 개 공존하는 짧은 순간이 있다. 보통 무시할 만하지만 메시지를 정확히 1번만 받아야 하는 시나리오에서는 의식해야 한다.

---

## 3. StrictMode의 이중 마운트: React 18+의 함정

React 18부터 개발 모드 StrictMode는 모든 컴포넌트의 effect를 **두 번 실행한다.** mount → unmount → mount 순서다.

```text
[StrictMode 개발 모드]

setup    → cleanup    → setup
WebSocket → close      → WebSocket  // 새 연결이 또 만들어짐
```

처음 보면 버그처럼 느껴지지만 이건 의도된 동작이다. 명세적으로 effect는 cleanup으로 자기 자신을 완전히 정리할 수 있어야 한다는 약속을 강제한다. **cleanup이 부족한 코드를 개발 단계에서 발견하기 위함**이다.

그런데 WebSocket 같은 자원은 이 시나리오에 자연스럽게 어울리지 않는다. 두 가지 길이 있다.

### 길 1: cleanup이 정리하면 재setup이 새로 만드는 패턴을 그냥 견디기

위에서 본 기본 패턴 그대로다. setup에서 새 WebSocket을 만들고 cleanup에서 close. 개발 모드에서 두 번 만들어졌다 사라지지만 결과적으로 한 인스턴스만 살아남는다. **단순한 시나리오에서는 이걸로 충분하다.** 다만 서버 로그에 connect/disconnect가 한 쌍씩 더 찍힌다.

### 길 2: 모듈 전역 또는 ref로 인스턴스 보관

```tsx
// connection.ts
let ws: WebSocket | null = null;
let refCount = 0;

export function acquireSocket() {
  if (!ws) {
    ws = new WebSocket("wss://example.com/chat");
  }
  refCount += 1;
  return ws;
}

export function releaseSocket() {
  refCount -= 1;
  if (refCount <= 0 && ws) {
    ws.close();
    ws = null;
  }
}
```

```tsx
function Chat() {
  useEffect(() => {
    const ws = acquireSocket();
    ws.addEventListener("message", onMsg);
    return () => {
      ws.removeEventListener("message", onMsg);
      releaseSocket();
    };
  }, []);
}
```

레퍼런스 카운트로 "여러 컴포넌트가 같은 연결을 공유하면서 마지막 사용자가 사라지면 정리"하는 모양을 만들 수 있다. StrictMode가 일으키는 짧은 0→1→0→1 흐름은 인스턴스를 매번 새로 만들지 않게 막아준다.

더 위로 가면 모듈 전역이 아니라 **SharedWorker나 BroadcastChannel + Web Locks**가 같은 일을 더 깔끔하게 한다. 시리즈 [10편의 패턴](/posts/cross-tab-shared-connection) 그대로다.

---

## 4. 커스텀 훅으로 추상화

위 패턴들을 매 컴포넌트마다 적는 건 비효율이다. 한 번 만들어 두고 쓰는 게 자연스럽다.

```tsx
// useWebSocket.ts
import { useEffect, useRef, useState } from "react";

type Options = {
  onMessage?: (data: unknown) => void;
};

export function useWebSocket(url: string, opts: Options = {}) {
  const [state, setState] = useState<"connecting" | "open" | "closed">("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setState("open");
    ws.onmessage = (e) => {
      try {
        optsRef.current.onMessage?.(JSON.parse(e.data));
      } catch {
        optsRef.current.onMessage?.(e.data);
      }
    };
    ws.onclose = () => setState("closed");

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [url]);

  const send = (payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  };

  return { state, send };
}
```

세 가지 포인트.

- 옵션을 **ref에 넣어 매번 최신값을 참조**한다. 의존성에 옵션을 넣었으면 매 렌더마다 effect가 재실행됐을 것이다.
- `wsRef`로 `send` 함수가 클로저로 옛 인스턴스를 잡지 않게 한다.
- `state`만 useState로 노출. 메시지는 큐로 모으지 않고 콜백으로 흘려보낸다. 메시지가 자주 오면 setState로 쌓을수록 리렌더 폭탄.

`react-use-websocket` 같은 라이브러리도 비슷한 모양으로 추상화한다. 직접 만들지 라이브러리를 쓸지는 프로젝트 규모와 요구사항에 달렸다.

---

## 5. `useSyncExternalStore`: 외부 store와 React를 잇는 정공법

WebSocket으로 들어온 메시지를 컴포넌트 트리 곳곳에서 구독하고 싶다고 하자. 매번 setState로 올려보내면 리렌더가 폭주한다. React 18에 들어온 `useSyncExternalStore`가 이 자리에 정확히 맞는다.

```tsx
// store.ts
type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: { lastMessage: unknown; status: string } = { lastMessage: null, status: "closed" };

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getSnapshot() {
  return snapshot;
}

export function setSnapshot(next: typeof snapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

// WebSocket은 모듈 전역에 둠
const ws = new WebSocket("wss://example.com/chat");
ws.onopen = () => setSnapshot({ ...snapshot, status: "open" });
ws.onmessage = (e) => setSnapshot({ ...snapshot, lastMessage: JSON.parse(e.data) });
ws.onclose = () => setSnapshot({ ...snapshot, status: "closed" });
```

```tsx
// 컴포넌트에서 사용
import { useSyncExternalStore } from "react";
import { subscribe, getSnapshot } from "./store";

function StatusBadge() {
  const { status } = useSyncExternalStore(subscribe, getSnapshot);
  return <span>{status}</span>;
}
```

이 패턴의 장점:

- WebSocket이 **컴포넌트 트리 밖에서** 한 번만 생성된다. 어떤 컴포넌트가 마운트되든 새 연결이 만들어지지 않는다.
- React는 store를 구독만 한다. 메시지 수신과 React 렌더가 분리되어 있어 리렌더 흐름이 명확해진다.
- SSR도 자연스럽게 처리된다. 서버 렌더링 시 store는 초기값을 돌려주면 된다.

Zustand나 Jotai 같은 라이브러리는 내부적으로 정확히 이 메커니즘을 쓴다. 손으로 짤지 라이브러리에 맡길지의 선택이다.

---

## 6. Next.js: SSR 경계 처리

Next.js App Router에서 WebSocket을 쓰는 컴포넌트는 반드시 클라이언트 컴포넌트여야 한다. 서버에는 `WebSocket`이 없다.

### 기본: `"use client"`

```tsx
// app/chat/page.tsx
"use client";

import { useWebSocket } from "@/hooks/useWebSocket";

export default function Chat() {
  const { state, send } = useWebSocket("wss://example.com/chat");
  // ...
}
```

`"use client"` 한 줄로 이 컴포넌트와 그 자식 트리가 클라이언트로 옮겨간다.

### 모듈 최상위에서 `new WebSocket()`을 호출하면

```tsx
// 위험한 패턴
"use client";
const ws = new WebSocket("wss://example.com"); // ⚠️ 모듈 평가 시점에 실행
```

`"use client"`가 있어도 **모듈 평가 시점은 서버일 수 있다.** 빌드 타임에 RSC가 이 모듈을 처음 import할 때 평가가 일어나면 서버에서 `WebSocket is not defined` 에러가 난다. 위의 store 패턴을 쓴다면 다음과 같이 가드한다.

```tsx
"use client";

if (typeof window !== "undefined") {
  const ws = new WebSocket("wss://example.com/chat");
  // ...
}
```

또는 lazy하게 처음 호출 시점에 만든다.

```tsx
let ws: WebSocket | null = null;
function getSocket() {
  if (!ws && typeof window !== "undefined") {
    ws = new WebSocket("wss://example.com/chat");
  }
  return ws;
}
```

### dynamic import + ssr:false

서버 렌더링을 아예 비활성화하고 싶으면 `dynamic` import를 쓸 수 있다.

```tsx
// app/chat/page.tsx
import dynamic from "next/dynamic";

const ChatClient = dynamic(() => import("./ChatClient"), { ssr: false });

export default function Page() {
  return <ChatClient />;
}
```

이 컴포넌트는 클라이언트에서만 렌더된다. 가장 안전하지만 그만큼 초기 로드 UX 손해가 있다. 사용자는 placeholder를 보다가 hydrate 후에 실제 화면을 받게 된다.

---

## 7. 상태관리 라이브러리와 묶기: 세 가지 길

### 7-1. Context

작은 앱이라면 가장 단순하다.

```tsx
const WSContext = createContext<{ state: string; send: (p: unknown) => void }>(null!);

export function WSProvider({ children }: { children: ReactNode }) {
  const value = useWebSocket("wss://...");
  return <WSContext.Provider value={value}>{children}</WSContext.Provider>;
}
```

다만 **메시지를 그대로 Context 값으로 흘리면 모든 소비자가 리렌더된다.** 메시지는 store에 두고 Context에는 `send`만 두는 등의 분리가 필요하다.

### 7-2. Zustand

리렌더 범위를 selector로 좁힐 수 있다는 점이 큰 장점이다.

```tsx
const useStore = create<{
  lastMessage: unknown;
  setLastMessage: (m: unknown) => void;
}>((set) => ({
  lastMessage: null,
  setLastMessage: (m) => set({ lastMessage: m }),
}));

// 모듈 최상위에서 WebSocket 만들고 store에 흘리기
if (typeof window !== "undefined") {
  const ws = new WebSocket("wss://example.com/chat");
  ws.onmessage = (e) => useStore.getState().setLastMessage(JSON.parse(e.data));
}

// 컴포넌트에서는 필요한 조각만 구독
function MessageCount() {
  const count = useStore((s) => (s.lastMessage as { count: number } | null)?.count ?? 0);
  return <div>{count}</div>;
}
```

### 7-3. React Query (TanStack Query)

이건 좀 특이한 결합인데, **메시지가 도달할 때마다 캐시를 직접 갱신**하는 패턴이다. 이전 글 [SSE 알람으로 테이블을 실시간 업데이트하는 법](/posts/sse-alarm-table-update)에서 잘 풀려있는 패턴이라 여기서는 짧게만.

```tsx
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "ROW_UPDATE") {
    queryClient.setQueryData(["table", msg.tableId], (old) => updateRow(old, msg));
  }
  if (msg.type === "FULL_REFRESH") {
    queryClient.invalidateQueries({ queryKey: ["table"] });
  }
};
```

리스트성 데이터를 실시간으로 갱신하는 시나리오에서 가장 자연스러운 모양 중 하나다.

---

## 8. SharedWorker를 React에서

[10편](/posts/cross-tab-shared-connection)에서 다룬 SharedWorker 패턴을 React 안에서 쓸 때 주의할 점만 정리한다.

```tsx
// shared-connection.ts (모듈 전역)
const sw = typeof SharedWorker !== "undefined"
  ? new SharedWorker(new URL("./connection.worker.ts", import.meta.url), { type: "module" })
  : null;

sw?.port.start();

const listeners = new Set<(data: unknown) => void>();
sw?.port.addEventListener("message", (e) => {
  listeners.forEach((l) => l(e.data));
});

export function subscribeSocket(l: (data: unknown) => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
```

```tsx
// 컴포넌트
useEffect(() => {
  const unsubscribe = subscribeSocket((data) => {
    if (data.type === "event") setMessages((prev) => [...prev, data.payload]);
  });
  return unsubscribe;
}, []);
```

핵심:

- **SharedWorker는 모듈 전역**에서 한 번만 만든다. 컴포넌트 안에서 만들면 안 된다.
- 컴포넌트 unmount 시 `sw.port.close()`를 호출하면 안 된다. 그 워커를 다른 탭/컴포넌트가 같이 쓰고 있을 수 있다.
- listener만 add/remove하는 패턴이다.
- `typeof SharedWorker !== "undefined"` 가드로 Android Chrome 같은 미지원 환경을 처리한다.

---

## 9. 흔한 버그 패턴 정리

| 증상 | 원인 | 대처 |
|---|---|---|
| 같은 메시지가 두 번 처리됨 | StrictMode 이중 마운트 + 모듈 전역에 listener를 add만 하고 cleanup에서 remove 안 함 | cleanup에서 정확히 remove |
| 메시지가 가끔 누락 | dependency array 변경으로 effect 재실행되면서 listener 등록 직전에 도착한 메시지 | 모듈 전역 store 패턴으로 옮기기 |
| 페이지 이동 후 돌아오면 화면이 비어있다 | 부모 unmount로 WebSocket이 닫힘 + 다음 마운트가 첫 메시지를 받지 못함 | 연결을 컴포넌트 밖에 두고, 최근 스냅샷도 store에 캐싱 |
| 메시지 수신마다 100개 자식이 리렌더 | Context 값에 `lastMessage`를 넣음 | `useSyncExternalStore`나 Zustand selector로 좁히기 |
| 빌드는 통과하는데 배포에서 "is not defined" | 모듈 평가 시점에 `WebSocket`을 호출 | `typeof window !== "undefined"` 가드 또는 dynamic import |

---

## 마무리

React/Next.js는 컴포넌트 라이프사이클을 중심으로 짜는 게 자연스럽지만 **장기 연결은 그 라이프사이클 밖에 두는 편이 거의 항상 옳다.** 핵심 원칙 셋:

1. **연결은 컴포넌트 트리 밖에 둔다.** 모듈 전역, ref, 또는 SharedWorker.
2. **메시지는 외부 store에 흘리고 React는 그 store를 구독한다.** `useSyncExternalStore`나 Zustand가 자리에 맞다.
3. **SSR 경계에서는 브라우저 가드.** `"use client"` + `typeof window` 또는 `dynamic({ ssr: false })`.

이 셋을 지키면 StrictMode 이중 마운트, 라우트 이동, props 변경 같은 일상적 흔들림에도 연결이 흔들리지 않는다.

---

## 참고

- [React Docs: useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
- [React Docs: StrictMode](https://react.dev/reference/react/StrictMode)
- [Next.js Docs: Client Components](https://nextjs.org/docs/app/building-your-application/rendering/client-components)
- [react-use-websocket](https://github.com/robtaussig/react-use-websocket): 참고용 라이브러리
