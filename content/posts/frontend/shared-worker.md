---
title: "Shared Worker — 여러 탭이 공유하는 워커"
date: "2026-05-17"
summary: "Dedicated Worker가 한 탭 전용이라면, Shared Worker는 같은 origin의 여러 탭이 같은 워커 인스턴스를 공유한다. 라이프사이클, MessagePort, onconnect, 디버깅, Safari 한계까지 정리했다."
category: "Frontend"
tags:
  - Browser
  - Worker
  - Shared Worker
  - Concurrency
  - JavaScript
featured: false
---

# Shared Worker — 여러 탭이 공유하는 워커

Dedicated Worker는 한 탭이 자기만 쓰는 백그라운드 스레드였다. 같은 사이트를 다른 탭에서 열면 워커도 또 만들어졌고, 두 워커는 같은 코드라도 완전히 독립이었다.

Shared Worker는 한 줄로 요약하면 — "**같은 origin의 모든 탭이 같은 워커 인스턴스를 공유한다**".

```text
[ Dedicated Worker ]              [ Shared Worker ]

  Tab A ─ DW A                      Tab A ─┐
  Tab B ─ DW B                      Tab B ─┼── SharedWorker (한 개)
  Tab C ─ DW C                      Tab C ─┘
```

이 차이가 SSE/WebSocket 연결을 한 사용자당 하나로 줄이는 패턴의 토대가 된다. 시리즈 마지막 글에서 본격적으로 다룰 그 패턴의 한 축이다.

---

## 먼저 결론

| 상황 | Shared Worker가 맞는가 |
|---|---|
| 같은 사용자의 여러 탭이 하나의 WebSocket/SSE 연결을 공유해야 함 | 적합 (단, Safari iOS는 미지원) |
| 한 탭에서만 쓰는 무거운 계산 | 부적합 (Dedicated Worker) |
| 탭을 모두 닫아도 살아있어야 하는 백그라운드 작업 | 부적합 (Service Worker) |
| 푸시 알림을 받고 싶음 | 부적합 (Service Worker) |
| Cross-tab 메시지 브로드캐스트만 필요함 | 부적합 (BroadcastChannel이 더 가벼움) |

Shared Worker는 "**상태와 코드를 들고 있어야 하는** cross-tab 공유"가 필요할 때의 도구다. 메시지만 주고받으면 되면 다른 도구가 더 가볍다.

---

## Dedicated와 무엇이 다른가

세 가지가 다르다.

| | Dedicated Worker | Shared Worker |
|---|---|---|
| 누가 쓰나 | 만든 탭 하나 | 같은 origin의 모든 탭 |
| 인스턴스화 | `new Worker(url)` | `new SharedWorker(url, name)` |
| 통신 진입점 | `self.onmessage` | `self.onconnect` → `MessagePort` |
| 종료 시점 | 만든 탭이 닫히면 | 사용하는 모든 탭이 닫히면 |
| Safari iOS | 지원 | **미지원** |

같은 점도 있다.

- DOM에 접근할 수 없다.
- `localStorage`가 없다.
- `IndexedDB`, `fetch`, `WebSocket`, `EventSource`는 쓸 수 있다.
- 별도 스레드에서 자기 글로벌 스코프 안에서 동작한다.

---

## 같은 워커에 붙는 조건

`new SharedWorker(url, name)`이 만들어내는 워커는 다음 셋이 모두 같을 때 **하나의 인스턴스**가 된다.

1. 같은 origin (스킴 + 호스트 + 포트)
2. 같은 URL
3. 같은 name (생략 가능, 생략하면 빈 문자열)

이 조건이 충족되는 모든 탭은 **이미 떠 있는 워커가 있으면 거기에 연결**하고, 없으면 **새로 만든다**. 즉 두 번째 탭이 같은 SharedWorker를 만들 때 워커가 또 생기는 게 아니라, 기존 워커에 또 다른 `MessagePort`로 붙는다.

---

## 메시지 채널은 MessagePort 기반이다

Dedicated Worker는 메인 ↔ 워커가 1:1이라서 `worker.postMessage(...)`와 `self.onmessage`만으로 충분했다. Shared Worker는 여러 탭이 붙기 때문에 채널이 N개 필요하고, 그래서 `MessagePort`로 추상화된다.

### 워커 안 — onconnect

```js
// shared.worker.js
const ports = new Set();

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.add(port);

  port.onmessage = (msg) => {
    // 어떤 탭에서 온 메시지든 모든 탭에 브로드캐스트
    for (const p of ports) p.postMessage(msg.data);
  };

  port.start();
};
```

새 탭이 연결할 때마다 `connect` 이벤트가 발생하고, 그 안의 `e.ports[0]`이 그 탭과의 채널이다. `ports` 컬렉션에 추가해 두면 워커가 누구와 연결되어 있는지 추적할 수 있다.

### 탭 쪽 — SharedWorker.port

```js
// main.js
const sw = new SharedWorker(
  new URL("./shared.worker.js", import.meta.url),
  { type: "module", name: "app" }
);

sw.port.onmessage = (e) => {
  console.log("받음:", e.data);
};

sw.port.start(); // 명시적으로 시작 (onmessage 사용 시 자동 시작되지만 명시 권장)

sw.port.postMessage({ type: "hello" });
```

`sw.port`는 워커 쪽 `onconnect`에서 받은 `port`의 다른 쪽 끝이다. 둘이 서로 `postMessage`로 메시지를 주고받는다.

---

## 한 화면에 모은 패턴 — 모든 탭이 공유하는 카운터

가장 단순한 예시로 시작하면 감이 잡힌다.

```js
// counter.worker.js
let counter = 0;
const ports = new Set();

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.add(port);

  port.postMessage({ type: "snapshot", value: counter });

  port.onmessage = (msg) => {
    if (msg.data.type === "increment") {
      counter += 1;
      for (const p of ports) p.postMessage({ type: "snapshot", value: counter });
    }
  };

  port.start();
};
```

```js
// main.js
const sw = new SharedWorker(
  new URL("./counter.worker.js", import.meta.url),
  { type: "module", name: "counter" }
);

sw.port.onmessage = (e) => {
  if (e.data.type === "snapshot") {
    document.querySelector("#counter").textContent = e.data.value;
  }
};

document.querySelector("#inc").onclick = () => {
  sw.port.postMessage({ type: "increment" });
};
```

이 페이지를 두 탭에서 열면, 한 탭에서 `+` 버튼을 누를 때마다 **두 탭 모두 같은 카운트로 갱신된다.** 워커가 상태를 들고 있고, 모든 탭에 결과를 뿌리기 때문이다.

---

## 라이프사이클 — 누가 살리고 누가 죽이나

명세상 SharedWorker는 **연결된 탭이 하나라도 있으면 살아있고, 모두 끊기면 종료될 수 있다.**

```text
Tab A 열림 → SharedWorker 시작
Tab B 열림 → 기존 SharedWorker에 연결
Tab A 닫힘 → SharedWorker 살아있음 (Tab B가 있음)
Tab B 닫힘 → SharedWorker 종료 가능 상태
```

"종료 가능"이 "즉시 종료"는 아니다. 브라우저가 메모리 압박 등을 보고 적당한 시점에 정리한다. 그래서 **마지막 탭이 닫힌 직후 새 탭이 열리면, 기존 워커가 그대로 살아있어서 그 인스턴스에 또 붙는 일도 있다.** 이 점이 디버깅 때 헷갈리는 부분이다.

### 명시적 종료

워커 안에서 `self.close()`를 호출하면 즉시 종료한다. 다만 외부에서 강제로 끝내는 메서드는 없다. Dedicated Worker의 `worker.terminate()`에 해당하는 게 SharedWorker에는 없다.

탭 쪽에서 `sw.port.close()`를 호출하면 그 탭의 채널만 끊긴다. 워커 자체가 죽지는 않는다.

---

## 안에서 쓸 수 있는 API

`SharedWorkerGlobalScope`는 `WorkerGlobalScope`를 상속한다. Dedicated와 같은 API 세트에 `onconnect` 이벤트가 추가된 모양이다.

| 카테고리 | 사용 가능 |
|---|---|
| 기본 | `self`, `onconnect`, `close`, `importScripts` |
| 비동기 | `setTimeout`, `setInterval`, `queueMicrotask`, `Promise` |
| 네트워크 | `fetch`, `WebSocket`, `EventSource` |
| 저장 | `IndexedDB`, `Cache` |
| 통신 | `BroadcastChannel`, `MessageChannel`, `MessagePort` |
| 암호 | `crypto.subtle` |

쓸 수 없는 것은 Dedicated와 동일하다 — `window`, `document`, DOM 일체, `localStorage`.

---

## Safari iOS 미지원 — 가장 큰 함정

Shared Worker의 가장 큰 제약은 **Safari iOS에서 동작하지 않는다는 점**이다. 데스크톱 Safari는 한때 지원했다가 막혔고, iOS Safari는 일관되게 지원하지 않는다.

웹앱이 모바일 사용자를 무시할 수 없다면, Shared Worker만으로는 cross-tab 공유 기능을 완성할 수 없다. 시리즈 마지막 글에서 다룰 **BroadcastChannel + Web Locks 리더 선출** 패턴이 이 경우의 표준 대안이다.

```text
[ 환경별 cross-tab 공유 전략 ]

Chrome / Firefox  →  SharedWorker가 가장 단순
Safari iOS         →  BroadcastChannel + Web Locks
모든 환경 단일 코드 →  BroadcastChannel + Web Locks (SharedWorker 대신)
```

크로스브라우저 안정성을 우선한다면 SharedWorker를 쓰지 않는 선택지도 합리적이다.

---

## 디버깅 — 어디서 보나

Shared Worker는 탭의 DevTools에 직접 뜨지 않는다. Chromium 계열에서는 별도 페이지가 있다.

```text
chrome://inspect/#workers
```

여기에 떠 있는 Shared Worker 인스턴스를 찾아 `inspect`를 누르면, 그 워커 전용 DevTools가 열린다. `console.log` 출력, `Sources` 패널의 브레이크포인트가 모두 그 안에서 동작한다.

Firefox는 `about:debugging`에서 비슷한 화면을 제공한다.

---

## SSE/WebSocket 공유의 출발점

시리즈 10편의 핵심 패턴을 간단히 미리 본다.

```js
// connection.worker.js (Shared Worker)
const ports = new Set();
const es = new EventSource("/sse");

es.onmessage = (e) => {
  // SSE에서 받은 이벤트를 모든 연결된 탭으로 fan-out
  for (const p of ports) p.postMessage({ type: "event", data: e.data });
};

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.add(port);
  port.start();
};
```

이 구조의 의미는 명확하다.

- 같은 사용자가 탭 5개를 켜도 **SSE 연결은 1개**.
- 받은 이벤트는 워커가 모든 탭에 뿌림.
- 한 탭이 닫혀도 워커는 살아있어 다른 탭이 계속 수신.

WebSocket도 같은 패턴을 쓸 수 있고, 그쪽은 추가로 **재연결 책임이 워커로 옮겨가는** 효과까지 얻는다. 메인 스레드의 코드가 단순해진다.

이 패턴의 완성판과 BroadcastChannel 폴백은 10편에서 다룬다.

---

## 다음 — 탭을 모두 닫아도 살아있어야 한다면

Shared Worker는 "**모든 탭이 닫히면 사라진다**"는 한계가 있다. 푸시 알림을 받거나, 백그라운드에서 캐시를 갱신하거나, 오프라인에서 네트워크 요청을 가로채는 일은 SharedWorker로 불가능하다.

탭과 무관하게 origin 단위로 살아남고, 브라우저가 필요할 때 깨워서 일을 시킬 수 있는 워커가 다음 글의 주제 — `Service Worker`다.

---

## 참고

- [실무에서 SSE + Shared Worker를 도입하며 마주친 것들](/posts/project/sse-shared-worker-in-practice) — SSE 연결 공유에 Shared Worker를 적용한 사례
- [WHATWG HTML — Shared workers](https://html.spec.whatwg.org/multipage/workers.html#shared-workers)
- [MDN — SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)
- [MDN — Using Shared Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers#shared_workers)
