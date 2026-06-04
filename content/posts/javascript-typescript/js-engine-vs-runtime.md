---
title: "JavaScript는 어디서 실행되는가 — 엔진(V8), 런타임(브라우저·Node), 그리고 window"
date: "2026-06-05"
summary: "같은 JS 코드가 브라우저에서도 Node에서도 도는데 window는 한쪽에만 있다. 언어·엔진·런타임·라이브러리의 네 층을 구분하고, V8과 Web API의 경계, window가 만들어지는 과정, Node가 언어가 아니라 런타임인 이유, Buffer와 바이트까지 정리했다."
category: "JavaScript / TypeScript"
tags:
  - JavaScript
  - V8
  - Node.js
  - Browser
  - Runtime
featured: false
---

# JavaScript는 어디서 실행되는가

`atob`은 브라우저에 있고 Node에는 `Buffer`가 있다. `document`는 브라우저에만 있고 Node에는 `window`조차 없다. 그런데 `Array`, `JSON`, `Promise`는 양쪽 다 똑같이 있다. 같은 JavaScript인데 왜 어떤 건 있고 어떤 건 없을까.

이 질문은 "JavaScript가 어디서, 무엇 위에서 실행되는가"를 알면 깔끔하게 풀린다. 핵심은 **언어 / 엔진 / 런타임 / 라이브러리**를 구분하는 것이다. 이 글은 그 네 층을 정리하고, V8과 Web API의 경계, `window`가 만들어지는 과정, Node.js가 언어가 아닌 이유, 그리고 `Buffer` 같은 바이트 타입까지 이어서 본다.

비동기 동작의 이벤트 루프 측면은 [JavaScript 동기와 비동기](/posts/js-sync-async-basics)에서, 브라우저의 프로세스·스레드 구조는 [브라우저 렌더링 파이프라인과 Chrome 동작 원리](/posts/browser-rendering-and-chrome-internals)에서 다룬다. 이 글은 "코드가 올라앉는 바닥"에 집중한다.

---

## 네 개의 층 — 언어, 엔진, 런타임, 라이브러리

가장 자주 섞이는 개념부터 줄을 세운다.

```text
[언어]        JavaScript            ← 문법 (let, function, 배열…)
   │
[엔진]        V8 / JavaScriptCore   ← 언어를 파싱·컴파일·실행
   │
[런타임/호스트] 브라우저 또는 Node.js ← 엔진 + 추가 API를 묶은 실행 환경
   │
[라이브러리]   React, Vue, axios…    ← 내 코드에 import해서 쓰는 도구
```

| 층 | 정체 | 예 |
|---|---|---|
| 언어 | 문법 규칙 | JavaScript(ECMAScript) |
| 엔진 | 언어를 실제로 실행하는 프로그램 | V8(Chrome/Node), JavaScriptCore(Safari) |
| 런타임 | 엔진 + 환경 API를 묶은 실행 환경 | 브라우저, Node.js |
| 라이브러리 | 런타임 위에서 도는 내 코드의 도구 | React, Vue |

흔한 오해가 "Node.js는 React, Vue 같은 거 아니냐"인데, 레벨이 완전히 다르다. React/Vue는 **내가 import해서 쓰는 코드**고, Node.js는 그 코드를 **실행해 주는 환경 그 자체**다. 비유하면 React는 전자레인지에 넣는 음식, 브라우저와 Node는 전자레인지다.

---

## 엔진은 언어만 실행한다 — V8과 Blink

사람들이 흔히 "크롬 V8 엔진"이라고 부르는 V8은 **JavaScript 실행 엔진**이다. 그런데 브라우저가 V8 하나로 돌아가는 건 아니다. 크롬은 여러 엔진의 조합이다.

| 부품 | 역할 | 크롬 |
|---|---|---|
| 렌더링 엔진 | HTML/CSS를 화면 픽셀로 | Blink |
| JS 엔진 | JavaScript 실행 | V8 |
| 그 외 | 네트워크, 저장소, 보안 | 크롬 내부 모듈 |

여기서 결정적인 사실은, **V8은 "순수 JavaScript 언어"만 실행한다**는 것이다. `Object`, `Array`, `JSON`, `Promise`, `Math` 같은 언어 표준(ECMAScript 명세)은 V8이 제공한다. 그래서 이 빌트인들은 브라우저든 Node든 어디서나 똑같이 있다.

반대로 `document`, `fetch`, `atob`, `localStorage`는 V8이 제공하지 않는다. 이것들은 V8 위에 호스트(브라우저)가 따로 얹어 주는 것이다.

---

## 호스트가 얹어주는 것 = Web API

브라우저가 V8 위에 꽂아 주는 기능들을 통틀어 **Web API**라고 부른다. 전부 웹 표준(WHATWG/W3C)으로 정의되고, 브라우저가 대부분 C++로 구현해 전역 객체에 노출한다.

| 분류 | 예 |
|---|---|
| DOM | `document`, `Element`, `querySelector` |
| 네트워크 | `fetch`, `WebSocket`, `XMLHttpRequest` |
| 저장소 | `localStorage`, `sessionStorage`, `IndexedDB` |
| 동시성 | `Worker`, `SharedWorker`, `ServiceWorker` |
| 타이머 | `setTimeout`, `requestAnimationFrame` |
| 인코딩/암호 | `atob`/`btoa`, `TextEncoder`/`TextDecoder`, `crypto.subtle` |

`localStorage.setItem(...)`을 호출하면 V8이 JS 코드를 실행하다가 브라우저의 C++ 구현으로 넘어가 실제로 디스크에 쓴다. V8은 "JS를 굴리는 부분"만 맡고, 저장은 브라우저가 한다. 그래서 `IndexedDB`나 `Worker`는 "엔진 기능"이 아니라 "브라우저가 제공하는 API"다.

### Web API와 TypeScript 타입은 다른 것

여기서 한 가지 헷갈리기 쉬운 비유를 정리해 둔다. "Web API는 그냥 내장 유틸 함수 같은 거고, TypeScript 타입처럼 명시돼 있는 것 아니냐"는 질문이 자주 나온다. 절반만 맞다.

| | Web API | TypeScript 타입(`lib.dom.d.ts`) |
|---|---|---|
| 정체 | 실제로 동작하는 객체·함수 | 설명서(명세)일 뿐 |
| 존재 시점 | 런타임 | 컴파일 타임만, 빌드되면 사라짐 |
| 구현 | 브라우저가 C++로 구현 | 구현 없음 |

Web API는 실제로 일을 하는 전자레인지라면, TypeScript 타입 선언은 그 전자레인지의 설명서다. "이 버튼은 데우기"라고 적혀만 있을 뿐 데워 주지는 않는다. 타입은 자동완성과 타입 체크를 위해 API를 **설명**할 뿐, 런타임에는 관여하지 않는다.

---

## window는 어떻게 생기나 — 실행 환경의 생성

`window`는 import도 선언도 하지 않는데 첫 줄부터 그냥 있다. 브라우저가 페이지를 열 때 **자동으로 만들어 주는 전역 객체**이기 때문이다. 그 과정은 대략 이렇다.

```text
브라우저
 └─ 탭 열기 → Renderer Process 생성    (탭/사이트별 격리)
      └─ Main Thread
           ├─ Blink  (HTML/CSS 렌더링)
           └─ V8     (JS 엔진)
                └─ Isolate           ← 격리된 엔진 인스턴스 (독립 힙 + GC)
                     └─ Context/Realm ← 문서마다 하나
                          ├─ ① 전역 객체 window 생성
                          ├─ ② 언어 빌트인 설치 (Object, Array, JSON…)  ← V8
                          └─ ③ Web API 바인딩 설치 (document, fetch…)   ← 브라우저
      + Event Loop (브라우저 제공)
```

브라우저는 탭마다 Renderer Process를 띄우고, 그 안에서 V8이 **Isolate**(독립 힙을 가진 엔진 인스턴스)를 만든다. Isolate 안에 문서마다 **Context(Realm)**를 만드는데, 이게 "실행 환경" 본체다. 이 Context에 전역 객체 `window`를 만들고 언어 빌트인과 Web API를 전부 꽂은 다음에야 내 `<script>`가 실행된다.

중요한 결과는 **탭과 iframe마다 Realm이 따로**라는 점이다. 각자 자기 `window`, 자기 `Array`를 가지므로, 다른 iframe에서 만든 배열은 내 쪽의 `Array`로는 `instanceof`가 성립하지 않는다.

### globalThis — window, self, global

전역 객체의 이름은 환경마다 다르다. 그래서 표준 공통 이름으로 `globalThis`가 생겼다.

| 환경 | 전역 객체 |
|---|---|
| 브라우저 | `window` (= `globalThis`) |
| Web Worker | `self` (= `globalThis`) |
| Node.js | `global` (= `globalThis`) |

전역 함수에 `window.`을 붙이지 않아도 되는 이유도 여기 있다. JS가 변수를 못 찾으면 마지막으로 전역 객체에서 찾는데, 브라우저에서는 그 전역 객체가 `window`이기 때문이다.

---

## CSR과 SSR — window를 못 쓰는 건 서버다

"CSR이면 `window`를 못 쓰는 거 아니냐"는 오해가 많은데, 방향이 반대다.

| | 렌더링 위치 | `window` |
|---|---|---|
| CSR (Client-Side Rendering) | 브라우저 | 있음 — 사용 가능 |
| SSR (Server-Side Rendering) | Node 서버에서 먼저 | 없음 — 서버엔 window가 없음 |

CSR은 브라우저에서 그리므로 `window`가 당연히 있다. 문제는 SSR이다. Next.js 같은 환경에서는 컴포넌트 코드가 서버(Node)에서 먼저 한 번 실행되는데, 거기엔 `window`가 없어서 `window`를 건드리면 `window is not defined`로 터진다. 그래서 가드가 필요하다.

```js
// 방법 1: 존재 확인
if (typeof window !== 'undefined') {
  window.localStorage.getItem('x');
}

// 방법 2: useEffect (브라우저에서만 실행됨)
useEffect(() => {
  const w = window.innerWidth;
}, []);
```

주의할 점은 Next.js의 `"use client"` 컴포넌트도 서버에서 한 번 미리 렌더된다는 것이다. "클라이언트 컴포넌트니까 괜찮겠지"가 아니라, 렌더 중에 `window`를 만지면 서버 패스에서 터진다. `useEffect`나 이벤트 핸들러처럼 브라우저에서만 도는 곳에서 써야 안전하다.

---

## Node.js는 언어가 아니라 런타임이다

Node.js를 Java나 Python 같은 "언어"로 생각하기 쉽지만, 정확히는 다르다. **언어는 JavaScript이고, Node.js는 그 JavaScript를 브라우저 밖에서 실행해 주는 런타임**이다.

| 층 | JavaScript 진영 | Java 진영 | Python 진영 |
|---|---|---|---|
| 언어 | JavaScript | Java | Python |
| 런타임(실행기) | Node.js / 브라우저 | JVM | CPython |

즉 "Node.js : JavaScript = JVM : Java = CPython : Python" 관계다. Node.js는 V8(엔진)에 libuv(I/O 라이브러리)를 묶어, 브라우저가 주던 Web API 대신 `fs`, `Buffer`, `process`, `http` 같은 시스템 API를 얹은 환경이다.

또 Node.js는 서버 전용도 아니다. 백엔드 서버가 가장 유명한 용도지만, 빌드 도구(webpack, vite), CLI 도구, 데스크톱 앱(Electron) 모두 Node 위에서 돈다. 이 블로그를 빌드할 때도 Node가 돈다.

---

## 바이트를 다루는 이유와 Buffer

Node가 자주 다루는 것 중 하나가 `Buffer`다. `Buffer`는 JavaScript 표준 타입이 아니라 **Node.js가 만든 클래스**이고, 브라우저에는 없다. 그런데 "바이트 배열"이라는 감은 정확하다.

먼저 "왜 바이트를 직접 다루나"부터. 메모리 관리 때문이 아니라, **데이터의 가장 밑바닥 모습이 바이트**이기 때문이다. 텍스트는 바이트를 UTF-8 같은 규칙으로 해석한 한 가지 모습일 뿐이고, 세상 데이터의 상당수는 텍스트가 아니다.

```text
파일 읽기:   photo.jpg   → 글자 아님. 바이트 [0xFF 0xD8 0xFF …]
네트워크:    TCP 패킷     → 바이트 흐름
압축/암호:   gzip, AES    → 바이트 단위 연산
base64 디코딩: 글자 → 바이트 → (다시) 글자
```

이미지나 암호문을 문자열로 다루면 깨진다. 그래서 해석하기 전의 원본(raw 바이트)을 그대로 다뤄야 하고, 그게 `Buffer`나 `Uint8Array`의 역할이다.

JavaScript 표준으로 바이너리를 다루는 타입은 따로 있고, `Buffer`는 그 위에 얹혀 있다.

```text
ArrayBuffer        ← 실제 바이트 메모리 "통" (그 자체론 못 읽음)
   │  ↓ 이 통을 들여다보는 "뷰(view)"들 — 서로 형제:
   ├── Uint8Array     (1바이트씩, 0~255)
   │      └── Buffer  ← Node 전용. Uint8Array를 상속 + 인코딩 변환 메서드
   ├── Int8Array      (1바이트씩, -128~127)
   ├── Uint16Array    (2바이트씩)
   ├── Int32Array     (4바이트 정수)
   ├── Float64Array   (8바이트 실수)
   └── DataView       (엔디안·혼합 타입 자유)
```

정리하면 `ArrayBuffer`는 부모(원본 메모리), `Uint8Array`/`Int32Array`/`DataView` 등은 그 통을 다른 숫자 타입으로 보는 형제 뷰들, `Buffer`는 그중 `Uint8Array`의 자식이다. 그래서 `Buffer`는 배열처럼 인덱싱되면서 인코딩 변환 메서드가 딸려 있다.

```js
const buf = Buffer.from('Man');   // <Buffer 4d 61 6e>
buf[0];                            // 77   (배열처럼 인덱싱)
buf.length;                        // 3
buf instanceof Uint8Array;         // true (실은 Uint8Array)
buf.toString('base64');            // "TWFu"
```

Node가 `Buffer`를 쓰는 이유가 여기서 분명해진다. Node는 본질적으로 파일·소켓 같은 I/O 기계이고, 그 I/O 데이터가 곧 바이트다. `Buffer`의 메모리는 V8의 JS 힙 밖(C++ 영역)에 잡혀서 GC 부담 없이 OS 입출력에 바로 넘길 수 있고, base64/hex/utf-8 변환 메서드가 내장돼 있다. 그래서 SSR에서 base64를 풀 때 `Buffer.from(s, 'base64').toString('utf-8')`을 쓰는 것이다. 같은 일을 브라우저에서는 `Buffer`가 없으니 `Uint8Array` + `atob`/`TextDecoder`로 한다. 이 디코딩 이야기는 [브라우저에서 비밀값을 디코딩한다는 것](/posts/browser-secret-decoding)에서 이어진다.

---

## 정리

- JavaScript는 **언어**이고, 그것을 실행하는 건 **엔진(V8)**, 엔진에 환경 API를 묶은 게 **런타임(브라우저·Node)**, 그 위에서 도는 게 **라이브러리(React·Vue)**다.
- V8은 `Object`/`Array`/`Promise` 같은 **언어 빌트인만** 제공한다. `document`/`fetch`/`localStorage` 같은 **Web API는 브라우저가** 얹는다.
- TypeScript 타입은 Web API를 **설명만** 하는 컴파일 타임 명세이고, 런타임에 사라진다.
- `window`는 브라우저가 문서마다 만드는 Realm의 전역 객체다. 환경 공통 이름은 `globalThis`이고, Node에는 `window`가 없다.
- `window`를 못 쓰는 건 CSR이 아니라 **SSR(서버 실행)**이다. 렌더 중에는 가드가 필요하다.
- Node.js는 언어가 아니라 **런타임**이다. 위치로 치면 Java의 JVM, Python의 CPython 자리다.
- 데이터의 밑바닥은 바이트라서 `Buffer`/`Uint8Array`로 다룬다. `Buffer`는 `Uint8Array`를 상속한 Node 전용 클래스다.

`atob`이 한쪽에만 있고 `Array`는 어디에나 있는 이유는 결국 하나다. 전자는 호스트가 얹는 것, 후자는 엔진이 주는 것. 이 경계를 잡고 나면 "어디서 실행되는가"에 대한 대부분의 질문이 같은 답으로 풀린다.

---

## 참고 문서

- [MDN — JavaScript engines](https://developer.mozilla.org/en-US/docs/Glossary/Engine/JavaScript)
- [MDN — globalThis](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis)
- [MDN — Window](https://developer.mozilla.org/en-US/docs/Web/API/Window)
- [Node.js — Buffer](https://nodejs.org/api/buffer.html)
- [MDN — JavaScript typed arrays](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Typed_arrays)
- [V8 — Official site](https://v8.dev/)
