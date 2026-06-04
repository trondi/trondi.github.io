---
title: "Web Worker로 메인 스레드 비우기 — 멀티스레딩이 없는 줄 알았던 JavaScript"
date: "2026-06-05"
summary: "JavaScript는 싱글 스레드라 무거운 작업이 UI를 멈춘다. Web Worker로 별도 스레드에서 작업을 돌리는 법, postMessage 통신, 무엇을 옮길 수 있고 무엇은 못 하는지, 그리고 SharedWorker와의 차이를 정리했다."
category: "Frontend"
tags:
  - Frontend
  - Web Worker
  - Performance
  - Concurrency
  - Browser
featured: false
---

# Web Worker로 메인 스레드 비우기

[JavaScript 동기와 비동기](/posts/js-sync-async-basics)에서 JS는 싱글 스레드라 한 시점에 하나의 콜 스택만 가진다고 했다. 문제는 무거운 동기 작업(큰 배열 정렬, 이미지 처리, 암호 연산)이 그 하나뿐인 스레드를 점유하면, 그 동안 클릭·입력·애니메이션이 전부 멈춘다는 것이다. 화면이 "먹통"이 되는 순간이다.

`async/await`은 이걸 해결하지 못한다. 비동기는 "기다리는 작업"을 미룰 뿐, **CPU를 오래 쓰는 작업** 자체를 다른 곳으로 옮기지는 않기 때문이다. 그 옮길 곳이 **Web Worker**다.

---

## 메인 스레드가 막힌다는 것

브라우저의 메인 스레드는 JS 실행과 [렌더링](/posts/browser-rendering-and-chrome-internals)을 함께 담당한다. 그래서 긴 동기 작업은 렌더링까지 막는다.

```js
// 메인 스레드에서 실행하면 이 동안 화면이 멈춘다
const result = heavyComputation(hugeArray);
```

이런 작업을 Worker로 옮기면, 메인 스레드는 자유로워져 UI가 계속 반응한다.

---

## Web Worker 기본

Worker는 별도 파일의 스크립트를 **다른 스레드에서** 실행한다. 메인과 Worker는 메모리를 공유하지 않고, **메시지를 주고받아** 통신한다.

```js
// main.js
const worker = new Worker('worker.js');
worker.postMessage(hugeArray);             // 작업 보내기
worker.onmessage = (e) => console.log(e.data); // 결과 받기
```

```js
// worker.js
onmessage = (e) => {
  const result = heavyComputation(e.data); // 별도 스레드에서 계산
  postMessage(result);                      // 결과 돌려보내기
};
```

`heavyComputation`이 도는 동안에도 메인 스레드는 멈추지 않는다. 계산이 끝나면 메시지로 결과만 받는다.

---

## 무엇을 주고받을 수 있나

`postMessage`로 넘기는 데이터는 **구조화된 복제(structured clone)**로 복사된다. 객체, 배열, `ArrayBuffer`, `Blob` 등은 넘어가지만, 함수나 DOM 노드는 복제할 수 없어 넘기지 못한다.

큰 `ArrayBuffer`는 복사 대신 **소유권을 넘기는(transfer)** 방식으로 비용 없이 이동시킬 수 있다.

```js
worker.postMessage(buffer, [buffer]); // buffer를 복사 없이 이전 (이후 메인에선 사용 불가)
```

([브라우저에서 바이너리 다루기](/posts/browser-binary-data)의 ArrayBuffer가 여기서 다시 등장한다.)

---

## Worker가 못 하는 것 — DOM 접근

가장 중요한 제약이다. **Worker는 DOM에 접근할 수 없다.** `document`, `window`가 없다. 화면을 직접 건드릴 수 없고, 계산 결과를 메인에 돌려보내면 메인이 DOM을 갱신해야 한다.

이 제약은 설계 의도다. 여러 스레드가 동시에 DOM을 만지면 경쟁 상태가 생기므로, DOM은 메인 스레드만 다루게 막아둔 것이다. Worker에서는 `fetch`, `crypto`, `IndexedDB` 같은 계산·데이터 API는 쓸 수 있다.

---

## SharedWorker — 탭 간 공유

일반 Worker는 그것을 만든 페이지에 종속된다. **SharedWorker**는 같은 출처의 **여러 탭이 하나의 Worker를 공유**한다. 탭마다 따로 연결을 맺는 대신, 공유 Worker 하나가 연결을 관리하고 탭들에 나눠줄 수 있다.

대표적 활용이 실시간 연결 공유다. 이 블로그의 [SSE와 SharedWorker 실전](/posts/sse-shared-worker-in-practice)에서, 여러 탭이 SSE 연결을 중복으로 맺지 않도록 SharedWorker로 묶는 사례를 다룬다.

---

## 언제 쓰나

Worker가 항상 답은 아니다. 메시지 통신과 스레드 생성에도 비용이 있어서, 가벼운 작업은 오히려 오버헤드만 늘린다.

- **적합**: 큰 데이터 처리, 이미지/비디오 가공, 암호 연산, 파싱처럼 CPU를 오래 쓰는 작업.
- **부적합**: DOM 조작이 주인 작업, 아주 짧은 계산.

---

## 정리

- JS는 싱글 스레드라 긴 동기 작업이 메인 스레드를 막아 UI를 멈춘다. `async/await`은 이를 해결하지 못한다.
- **Web Worker**는 작업을 별도 스레드로 옮긴다. 메모리를 공유하지 않고 `postMessage`로 통신한다.
- 데이터는 구조화된 복제로 넘어가며, 큰 `ArrayBuffer`는 transfer로 비용 없이 이전할 수 있다.
- Worker는 **DOM에 접근할 수 없다.** 결과는 메인에 돌려보내 갱신한다.
- **SharedWorker**는 여러 탭이 하나의 Worker를 공유한다. 실시간 연결 공유에 쓴다.

싱글 스레드라는 제약은 여전하지만, "엔진은 여러 개 띄울 수 있다"는 사실이 그 제약을 푼다. 무거운 일은 옆 스레드로 보내고, 메인은 사용자에게 반응하는 데만 쓰는 것이다.

---

## 참고 문서

- [MDN — Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [MDN — SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)
- [MDN — The structured clone algorithm](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)
