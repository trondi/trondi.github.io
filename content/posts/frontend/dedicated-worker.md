---
title: "Dedicated Worker(가장 기본이 되는 백그라운드 스레드)"
date: "2026-10-26"
summary: "메인 스레드를 막지 않고 무거운 일을 시키기 위한 가장 단순한 도구인 Dedicated Worker를 별도 글로벌 스코프, postMessage와 구조화 복제, transferable 객체, 모듈 워커, 흔한 함정 관점에서 정리했다."
category: "Frontend"
tags:
  - Browser
  - Worker
  - Concurrency
  - Performance
  - JavaScript
featured: false
series: "실시간 웹 통신과 브라우저 런타임"
seriesOrder: 7
---

# Dedicated Worker(가장 기본이 되는 백그라운드 스레드)

지금까지의 글은 "어떻게 데이터를 옮길까"에 대한 이야기였다. 이 글부터는 다른 축, **"그 일을 어디서 돌릴까"**로 옮긴다. 시리즈 초반에 정리했던 두 축 중 두 번째다.

```text
[축 A] 통신 프로토콜       polling / SSE / WebSocket / WebRTC
[축 B] JS 실행 컨텍스트    Main thread / Dedicated W / Shared W / Service W
```

축 B는 같은 자바스크립트를 "**어느 실행 환경에서 돌릴지**"의 이야기다. 첫 번째 글에서는 그 중 가장 단순하고 흔히 쓰이는 `Dedicated Worker`를 본다.

---

## 먼저 결론

| 상황 | Dedicated Worker가 맞는가 |
|---|---|
| 한 탭에서 무거운 계산을 메인 스레드 밖에서 돌리고 싶다 | 적합 |
| 여러 탭이 한 백그라운드 작업을 공유해야 한다 | 부적합 (Shared Worker) |
| 네트워크 요청을 가로채거나 푸시 알림을 받고 싶다 | 부적합 (Service Worker) |
| 카메라/마이크 같은 사용자 미디어를 다룬다 | 부적합 (메인 스레드에서) |
| 메인 스레드를 점유하는 JSON 파싱이나 해시 계산을 분리하고 싶다 | 적합 |

Dedicated Worker는 "**한 탭이 자기만 쓰는 별도 스레드**"다. DOM에 접근할 수 없고 메인 스레드와는 `postMessage`로만 통신한다.

---

## 한 줄 정의

Dedicated Worker는 **메인 스레드와 다른 JS 글로벌 스코프를 가진 별도 실행 환경**이다. 자기만의 이벤트 루프와 힙을 가지며 OS 스레드 단위로 격리된다.

```text
[메인 스레드]                 [Dedicated Worker]
- window 글로벌               - DedicatedWorkerGlobalScope
- DOM 접근 O                  - DOM 접근 X
- UI 렌더링                   - 렌더링 없음
- worker.postMessage(...)  ───▶ self.onmessage = ...
- worker.onmessage = ...   ◀─── self.postMessage(...)
```

여기서 중요한 점이 하나 있다. **같은 글로벌 변수를 공유하지 않는다.** `let counter = 0` 같은 변수가 메인과 워커 양쪽에 따로 존재한다. 상태를 주고받으려면 명시적으로 메시지를 보내야 한다.

---

## 기본 사용: 클래식 워커

```js
// main.js
const worker = new Worker("/worker.js");

worker.postMessage({ type: "hash", payload: bigString });

worker.onmessage = (e) => {
  console.log("결과:", e.data);
};
```

```js
// worker.js
self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === "hash") {
    const result = computeHash(payload);
    self.postMessage(result);
  }
};
```

`new Worker(url)`의 URL은 같은 origin이어야 한다. cross-origin 워커는 명세상 허용되지만 실무에서는 거의 동작하지 않게 막혀 있다.

워커 안에서는 `self`가 `DedicatedWorkerGlobalScope`다. `window`가 없다. `document`도 없다. `alert`도 없다.

---

## 모듈 워커: 지금의 표준 형태

옛날에는 워커 안에서 다른 스크립트를 불러오려면 `importScripts(url)`을 써야 했다. 지금은 ES 모듈을 그대로 쓸 수 있다.

```js
// main.js
const worker = new Worker(
  new URL("./worker.js", import.meta.url),
  { type: "module" }
);
```

```js
// worker.js
import { computeHash } from "./hash.js";

self.onmessage = (e) => {
  if (e.data.type === "hash") {
    self.postMessage(computeHash(e.data.payload));
  }
};
```

두 가지 포인트.

- `{ type: "module" }`을 지정하면 워커 안에서 `import` 구문이 동작한다.
- `new URL("./worker.js", import.meta.url)` 패턴은 Vite, Webpack 5, esbuild 같은 번들러가 인식해서 워커 파일을 별도로 빌드해준다. 그냥 문자열 경로를 쓰면 프로덕션 빌드에서 깨진다.

---

## postMessage와 구조화 복제

`postMessage`는 단순히 객체 참조를 넘기는 게 아니라, **구조화 복제 알고리즘(structured clone)**으로 깊은 복사를 한다.

복제할 수 있는 것:

- `string`, `number`, `boolean`, `null`, `undefined`
- `Object`, `Array`, `Map`, `Set`
- `Date`, `RegExp`, `Blob`, `File`, `FileList`
- `ArrayBuffer`, `TypedArray`, `DataView`
- `ImageData`, `ImageBitmap`

복제할 수 없는 것:

- 함수 (`function`)
- DOM 노드 (`Element`, `Node` 등)
- 프로토타입 체인 (클래스 인스턴스는 평범한 객체로 복제됨)
- 심볼 키

```js
// 동작 X
worker.postMessage({ onDone: () => {} }); // 함수는 복제 안 됨, 에러

// 동작 O
worker.postMessage({ id: 1, name: "Alice", scores: [10, 20] });
```

큰 데이터를 보낼 때 주의할 점은 **복제 비용**이다. 100MB짜리 `ArrayBuffer`를 그냥 `postMessage`로 보내면 100MB만큼의 복제가 일어난다.

---

## Transferable Objects: 복제 대신 소유권 이전

큰 바이너리 데이터는 복제 대신 **소유권 이전(transfer)**으로 보낼 수 있다.

```js
const buffer = new ArrayBuffer(100 * 1024 * 1024);
worker.postMessage(buffer, [buffer]);

console.log(buffer.byteLength); // 0 — 소유권이 워커로 넘어가서 메인에서는 비어버림
```

두 번째 인자(transfer list)에 객체를 넣으면, 메모리 사본을 만들지 않고 **포인터만 워커에게 넘긴다.** 메인 스레드는 그 시점부터 그 객체를 더 이상 쓸 수 없다.

Transferable이 되는 객체는 정해져 있다.

| 타입 | 용도 |
|---|---|
| `ArrayBuffer` | 바이너리 데이터 |
| `MessagePort` | 양방향 메시지 채널 |
| `ImageBitmap` | 디코딩된 이미지 |
| `OffscreenCanvas` | 워커에서 그릴 캔버스 |
| `ReadableStream`, `WritableStream`, `TransformStream` | 스트림 |

웹 워커에서 이미지 디코딩이나 압축을 처리하고 결과를 메인으로 넘기는 패턴이라면 transfer가 거의 필수다.

---

## 워커에서 쓸 수 있는 전역 객체

`DedicatedWorkerGlobalScope`에서 쓸 수 있는 주요 API를 정리했다.

| 카테고리 | 사용 가능 |
|---|---|
| 기본 | `self`, `postMessage`, `close`, `importScripts` |
| 비동기 | `setTimeout`, `setInterval`, `queueMicrotask`, `Promise` |
| 네트워크 | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` |
| 저장 | `IndexedDB`, `Cache` |
| 캐스트/암호 | `crypto` (`SubtleCrypto` 포함) |
| 그래픽 | `OffscreenCanvas`, `ImageBitmap` |

쓸 수 없는 것:

- `window`, `document`, `Element` (DOM 일체)
- `alert`, `confirm`, `prompt`
- `localStorage`, `sessionStorage` (워커에는 없음. IndexedDB는 가능)
- 직접적인 UI 조작

저장소에서 `localStorage`가 빠진 점이 특히 자주 발목 잡힌다. 같은 origin의 메인 스레드와 워커가 공통의 키-값 저장소를 공유하려면 `IndexedDB`나 `Cache API`를 써야 한다.

---

## 언제 쓰나: 현실적인 자리

대부분의 앱에서 Dedicated Worker가 빛나는 자리는 이렇다.

- **무거운 JSON 파싱이나 변환**: 수 MB짜리 응답을 메인 스레드에서 파싱하면 그 동안 UI가 멈춘다. 워커에서 파싱하고 결과만 넘기면 메인은 자유롭다.
- **해시, 압축, 암복호화**: SHA-256, gzip, AES 같은 작업은 CPU를 점유한다.
- **이미지 처리**: 클라이언트에서 리사이즈, 필터링, 포맷 변환. `OffscreenCanvas`와 함께 쓰면 워커가 직접 그릴 수도 있다.
- **WASM 실행**: 무거운 WASM 모듈은 워커에서 돌리는 것이 거의 표준이다(Figma, Excel Online 등).
- **AI 추론**: 클라이언트 측 ONNX/TensorFlow.js 추론을 워커에서 돌려 UI 응답성 유지.

**메인 스레드의 응답성을 지키는 게 핵심 목적**이다. 사용자가 클릭, 스크롤, 입력을 할 때 60fps를 유지하려면 메인 스레드의 task가 16ms 안에 끝나야 한다. 무거운 일을 워커에 넘기는 것은 이 예산을 지키기 위한 가장 직접적인 방법이다.

---

## 흔한 함정: 워커 인스턴스 누적

`new Worker(...)`로 만든 워커는 `terminate()` 하거나 안에서 `self.close()` 하기 전까지 살아있다. 컴포넌트가 마운트될 때마다 워커를 새로 만들고 정리하지 않으면, 그만큼 OS 스레드가 누적된다.

```js
useEffect(() => {
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = handleMessage;

  return () => {
    worker.terminate(); // 잊지 말 것
  };
}, []);
```

React에서 워커를 다룰 때 정리(`terminate`)가 빠지면 페이지 이동마다 워커가 쌓인다. 메모리 누수의 흔한 원인이다.

---

## 한 화면에 모은 패턴

```js
// main.js
const worker = new Worker(
  new URL("./hash.worker.js", import.meta.url),
  { type: "module" }
);

worker.onmessage = (e) => {
  const { id, result } = e.data;
  resolve(id, result);
};

worker.onerror = (e) => {
  console.error("worker error:", e.message);
};

function hashAsync(buffer) {
  return new Promise((res, rej) => {
    const id = crypto.randomUUID();
    pending.set(id, { res, rej });
    worker.postMessage({ id, buffer }, [buffer]); // transfer
  });
}
```

```js
// hash.worker.js
self.onmessage = async (e) => {
  const { id, buffer } = e.data;
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  self.postMessage({ id, result: hash }, [hash]); // 결과도 transfer
};
```

특징:

- `id`로 요청과 응답을 매칭 (여러 요청이 동시에 진행될 수 있음)
- 큰 `ArrayBuffer`는 transfer로 넘김
- 결과 `ArrayBuffer`도 transfer로 돌려받음

---

## 다음: 같은 워커지만 여러 탭이 공유한다면

Dedicated Worker는 **한 탭이 자기만 쓰는 워커**다. 같은 사이트를 다른 탭에서 열면, 그 탭은 자기 워커를 또 만든다. 두 워커는 같은 코드라도 완전히 독립이다.

만약 "같은 사용자가 켜놓은 모든 탭이 하나의 워커를 함께 쓴다"가 필요하면 그게 [다음 글](/posts/shared-worker)의 `Shared Worker`다. SSE/WebSocket 같은 연결을 한 사용자당 하나로 줄이려는 시리즈의 마무리 패턴이 거기서 등장한다.

---

## 참고

- [WHATWG HTML: Web workers](https://html.spec.whatwg.org/multipage/workers.html)
- [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [MDN: Structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
- [MDN: Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
