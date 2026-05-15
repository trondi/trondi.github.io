---
title: "JavaScript 동기와 비동기 — 이벤트 루프부터 async/await까지"
date: "2026-05-16"
summary: "JavaScript의 동기/비동기 모델을 콜 스택, 이벤트 루프, 태스크 큐 관점에서 정리하고 콜백, Promise, async/await의 차이와 실무에서 자주 만나는 함정을 함께 다룬다."
category: "JavaScript / TypeScript"
tags:
  - JavaScript
  - Async
  - Event Loop
  - Promise
  - async/await
featured: false
---

# JavaScript 동기와 비동기 — 이벤트 루프부터 async/await까지

JavaScript를 어느 정도 쓰다 보면 `then`, `await`, `setTimeout`, `useEffect` 같은 비동기 코드를 자주 만나게 된다. 동작은 익숙하지만 “왜 이렇게 돌아가는지”는 의외로 흐릿한 경우가 많다. 콜 스택이 비어 있는데도 콜백이 실행되고, `await`은 코드를 멈추는 것처럼 보이지만 사실은 멈추지 않는다.

이 글은 JavaScript의 동기/비동기 모델을 한 번에 정리하는 것을 목표로 한다. 이벤트 루프, 태스크 큐, 마이크로태스크 큐 같은 런타임 구조에서 시작해 콜백, Promise, `async/await`까지 이어진다. 다음 글 [React와 Next.js에서의 동기와 비동기](/posts/react-nextjs-async-patterns)에서는 같은 개념을 컴포넌트와 데이터 fetching 관점에서 다시 본다.

---

## 동기와 비동기는 무엇이 다른가

가장 기본적인 정의부터 정리한다.

- 동기(synchronous): 코드가 위에서 아래로, 한 줄이 끝나기 전에는 다음 줄로 가지 않는 실행 모델.
- 비동기(asynchronous): 어떤 작업의 완료를 기다리지 않고 다음 줄을 먼저 실행하고, 작업이 끝나면 그 결과를 별도의 방식으로 처리하는 모델.

동기 코드는 직관적이다.

```js
console.log("1");
console.log("2");
console.log("3");
// 1
// 2
// 3
```

비동기 코드는 직관과 다르게 움직인다.

```js
console.log("1");
setTimeout(() => console.log("2"), 0);
console.log("3");
// 1
// 3
// 2
```

`setTimeout`의 지연이 `0`인데도 `2`가 마지막에 찍힌다. 이 결과를 이해하려면 “JavaScript가 어떤 환경에서, 어떤 순서로 코드를 실행하는지”를 봐야 한다.

---

## JavaScript는 싱글 스레드인데 어떻게 비동기인가

자주 인용되는 문장이 있다. “JavaScript는 싱글 스레드다.” 정확히 말하면 한 시점에 하나의 콜 스택만 가지고, 한 번에 하나의 함수만 실행한다는 뜻이다.

그런데 우리는 분명 비동기 코드를 쓴다. 네트워크 요청을 보내면서 UI를 멈추지 않고, 타이머를 걸어두면서도 클릭 이벤트를 처리한다. 이게 가능한 이유는 비동기 작업이 **JavaScript 엔진 안이 아니라 호스트 환경에서 처리**되기 때문이다.

브라우저를 기준으로 보면 구조는 대략 다음과 같다.

```text
JavaScript Engine            Host Environment (브라우저 / Node.js)
┌────────────────┐          ┌────────────────────────────────┐
│   Call Stack   │          │   Web APIs (Timers, Fetch, …)  │
│                │          │   I/O, Network, DOM events      │
└───────┬────────┘          └──────────────┬─────────────────┘
        │                                  │
        │       Event Loop                 │
        │  ┌──────────────────┐            │
        └──┤ Microtask Queue  │ ◄──────────┘
           │ Task Queue       │
           └──────────────────┘
```

JavaScript 엔진은 콜 스택만 관리한다. `setTimeout`이나 `fetch` 같은 비동기 함수는 엔진이 직접 수행하지 않고, **브라우저나 Node.js 같은 호스트 환경의 API에 “이 작업 좀 해달라”고 위임**한다.

MDN의 동시성 모델 설명도 비슷한 그림을 사용한다. JavaScript 런타임은 한 번에 하나의 메시지를 처리하고, 새 메시지는 큐에 쌓이며, 콜 스택이 비면 이벤트 루프가 큐에서 다음 메시지를 꺼낸다. 참고: [MDN — Concurrency model and event loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop)

즉 JavaScript 자체는 싱글 스레드지만, **시간이 오래 걸리는 일은 환경이 대신 처리하고, 결과만 큐에 넣어준다**. 이 구조 덕분에 싱글 스레드 언어가 멀티태스킹처럼 보이게 동작한다.

---

## 콜 스택과 이벤트 루프

조금 더 구체적으로 본다. 다음 코드를 다시 보자.

```js
console.log("1");
setTimeout(() => console.log("2"), 0);
console.log("3");
```

실행 순서는 다음과 같다.

1. `console.log("1")`가 콜 스택에 올라간다. 실행되고 빠진다. → `1` 출력
2. `setTimeout(...)`이 콜 스택에 올라간다. 타이머는 브라우저의 Web API에 등록되고, 콜백은 일정 시간이 지난 뒤 태스크 큐로 넘어간다.
3. `console.log("3")`이 콜 스택에 올라가 실행된다. → `3` 출력
4. 콜 스택이 비면 이벤트 루프가 태스크 큐에서 타이머 콜백을 꺼내 콜 스택에 올린다. → `2` 출력

핵심은 **콜 스택이 비어야만 큐에서 콜백을 꺼낸다**는 점이다. `setTimeout`의 지연이 `0`이어도 현재 동기 코드가 다 끝나기 전에는 절대 끼어들지 않는다.

```js
console.log("start");
setTimeout(() => console.log("timeout"), 0);
for (let i = 0; i < 1e9; i++) {}
console.log("end");
// start
// (긴 for 루프 동안 아무것도 안 찍힘)
// end
// timeout
```

이 “콜 스택이 비기 전에는 비동기 콜백이 실행되지 않는다”는 규칙이 자칫 위험할 수 있다. 동기 작업이 길어지면 그 사이 모든 비동기 이벤트(클릭, 입력, 애니메이션 프레임)가 밀린다. 브라우저에서 이런 상황을 흔히 “메인 스레드 블로킹”이라고 부른다.

---

## 태스크 큐와 마이크로태스크 큐

큐는 하나가 아니다. 비동기 콜백은 종류에 따라 들어가는 큐가 다르다. 두 종류만 알면 대부분 설명이 된다.

- 태스크 큐(Task Queue, Macrotask Queue): `setTimeout`, `setInterval`, I/O, UI 이벤트 콜백이 들어가는 큐.
- 마이크로태스크 큐(Microtask Queue): Promise의 `then`/`catch`/`finally`, `queueMicrotask`, `MutationObserver` 콜백이 들어가는 큐.

이벤트 루프는 한 번에 하나의 매크로태스크를 꺼내 실행하고, **그 매크로태스크가 끝난 직후 마이크로태스크 큐를 모두 비울 때까지 처리**한다. 그 다음에야 다음 매크로태스크를 꺼낸다.

```js
console.log("script start");

setTimeout(() => console.log("setTimeout"), 0);

Promise.resolve()
  .then(() => console.log("promise 1"))
  .then(() => console.log("promise 2"));

console.log("script end");
```

출력 순서는 다음과 같다.

```text
script start
script end
promise 1
promise 2
setTimeout
```

`setTimeout`의 지연이 `0`이라도, 같은 시점에 등록된 Promise then 콜백이 먼저 실행된다. 마이크로태스크가 매크로태스크보다 우선이기 때문이다.

HTML 명세도 이벤트 루프가 매크로태스크 1개 → 마이크로태스크 모두 → 렌더링 후보 단계를 반복한다고 설명한다. 참고: [HTML spec — Event loops](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)

이 규칙은 실무에서도 자주 부딪힌다. 예를 들어 `then` 안에서 다시 `then`을 거는 코드는 마이크로태스크 큐 안에서 계속 처리되기 때문에, 그 사이에 다른 타이머나 UI 콜백이 끼어들지 않는다. 반대로 마이크로태스크가 너무 길어지면 매크로태스크가 영원히 처리되지 못하는 “마이크로태스크 폭주” 상황이 생길 수 있다.

---

## 콜백 기반 비동기

가장 오래된 비동기 패턴은 콜백이다. 작업이 끝나면 결과를 가지고 호출해 달라고 함수를 넘기는 방식이다.

```js
function getUser(id, callback) {
  setTimeout(() => {
    callback(null, { id, name: "Tom" });
  }, 100);
}

getUser(1, (err, user) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(user);
});
```

Node.js의 전통적인 API는 대부분 이런 “error-first callback” 패턴을 따른다.

콜백은 단순하지만 두 가지 문제가 있다.

### 1. 콜백 지옥

여러 비동기 작업을 순차적으로 이어붙이면 코드가 빠르게 안쪽으로 들여쓰기된다.

```js
getUser(1, (err, user) => {
  if (err) return handle(err);
  getPosts(user.id, (err, posts) => {
    if (err) return handle(err);
    getComments(posts[0].id, (err, comments) => {
      if (err) return handle(err);
      // ...
    });
  });
});
```

읽기도 어렵고, 에러 처리도 매번 반복해야 한다.

### 2. 제어권 역전

콜백을 넘긴다는 것은 “이 함수가 내 콜백을 언제, 몇 번, 어떤 인자로 호출할지”에 대한 통제를 상대 함수에 맡긴다는 뜻이다. 라이브러리가 콜백을 두 번 호출하거나, 실패 시 호출하지 않거나, 예외를 삼키면 우리 코드는 손쓰기 어렵다.

이 두 문제를 해결하기 위해 등장한 것이 Promise다.

---

## Promise

Promise는 “미래에 완료될 작업의 결과를 담는 객체”다. 작업이 끝나는 시점에 값이 채워진다.

```js
const p = new Promise((resolve, reject) => {
  setTimeout(() => resolve("done"), 100);
});

p.then((value) => console.log(value)); // 100ms 뒤 "done"
```

Promise는 세 가지 상태를 가진다.

| 상태 | 의미 |
|---|---|
| pending | 아직 결과가 정해지지 않은 초기 상태 |
| fulfilled | `resolve(value)`로 성공한 상태 |
| rejected | `reject(error)`로 실패한 상태 |

한 번 fulfilled 또는 rejected가 되면 다시 바뀌지 않는다. 이를 “settled” 상태라고 부른다.

MDN은 Promise를 비동기 작업의 최종 결과(성공 또는 실패)와 그 결과 값을 표현하는 객체로 설명한다. 참고: [MDN — Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)

### 체이닝

`then`은 새 Promise를 반환한다. 그래서 호출을 이어붙일 수 있다.

```js
getUser(1)
  .then((user) => getPosts(user.id))
  .then((posts) => getComments(posts[0].id))
  .then((comments) => console.log(comments))
  .catch((err) => console.error(err));
```

콜백 지옥처럼 들여쓰기가 깊어지지 않고, 에러를 마지막 `catch` 하나에서 받아 처리할 수 있다.

### 에러 전파

체인 중 어디서 에러가 나든, 다음 `catch`까지 흘러간다.

```js
fetchUser()
  .then((user) => fetchPosts(user.id)) // 여기서 reject돼도
  .then((posts) => render(posts))      // 이건 스킵되고
  .catch((err) => showError(err));     // 여기로 온다
```

이 동작은 동기 `try/catch`와 닮았다. 다만 `then` 안에서 던진 예외도 자동으로 reject로 바뀌어 다음 `catch`로 간다는 점이 다르다.

### Promise.all / allSettled / race / any

여러 Promise를 묶어 처리할 때 자주 쓰는 정적 메서드들이다.

| 메서드 | 동작 | 실패 시 |
|---|---|---|
| `Promise.all` | 전부 성공해야 결과를 반환 | 하나라도 실패하면 즉시 reject |
| `Promise.allSettled` | 전부 끝날 때까지 기다림 | 각 결과를 `{status, value/reason}` 형태로 반환 |
| `Promise.race` | 가장 먼저 settled된 것 | 그 결과를 그대로 사용 |
| `Promise.any` | 가장 먼저 fulfilled된 것 | 전부 실패하면 `AggregateError` |

병렬 요청이 필요한 상황을 구분해서 골라야 한다.

```js
// 모두 성공해야 의미가 있을 때
const [user, settings] = await Promise.all([fetchUser(), fetchSettings()]);

// 일부 실패해도 가능한 만큼 결과를 받고 싶을 때
const results = await Promise.allSettled([fetchA(), fetchB(), fetchC()]);
```

특히 사용자 화면을 그릴 때는 `Promise.all`보다 `Promise.allSettled`가 안전한 경우가 많다. 부가 정보 하나가 실패했다고 전체 화면이 깨지면 안 되는 화면이 많기 때문이다.

---

## async / await

`async/await`은 Promise를 쓰는 더 읽기 좋은 문법이다. 새로운 동시성 모델이 아니라 **Promise 위에 얹은 syntactic sugar**다.

```js
async function load() {
  const user = await fetchUser();
  const posts = await fetchPosts(user.id);
  return posts;
}
```

`async` 함수는 항상 Promise를 반환한다. 함수 안에서 `return value`를 하면 그 값으로 resolve된 Promise가, `throw err`를 하면 reject된 Promise가 만들어진다.

`await`은 “이 Promise가 settled될 때까지 함수의 다음 줄 실행을 미룬다”는 뜻이다. 다만 진짜로 스레드를 멈추는 것이 아니라, **함수를 일시 중단하고 호출자에게 제어권을 돌려준 뒤, 결과가 준비되면 마이크로태스크로 이어서 실행**한다.

```js
async function main() {
  console.log("A");
  await Promise.resolve();
  console.log("B");
}

console.log("1");
main();
console.log("2");
// 1
// A
// 2
// B
```

`await Promise.resolve()`를 만나는 순간 `main`은 중단되고 호출자(전역 코드)로 돌아간다. `2`가 먼저 찍히고, 마이크로태스크 단계에서 `B`가 찍힌다.

### try / catch로 통일된 에러 처리

`await`을 쓰면 비동기 에러를 동기 코드처럼 처리할 수 있다.

```js
async function load() {
  try {
    const user = await fetchUser();
    return user;
  } catch (err) {
    console.error(err);
    throw err;
  }
}
```

콜백처럼 매 단계 `if (err)`를 반복하지 않아도 되고, Promise 체인의 `catch`보다 흐름이 직관적이다.

### 흔히 하는 실수: 직렬로 await

여러 요청을 차례로 `await`하면 의도치 않게 직렬 실행이 된다.

```js
// 비효율적: a가 끝나야 b를 시작한다
const a = await fetchA();
const b = await fetchB();
```

서로 의존하지 않는 작업이라면 동시에 시작한 뒤 결과만 함께 기다리는 것이 빠르다.

```js
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

반대로 `b`가 `a`의 결과에 의존한다면 직렬이 맞다.

```js
const a = await fetchA();
const b = await fetchB(a.id);
```

“동시에 해도 되는가” 또는 “순서가 중요한가”를 의식하면서 코드를 짜는 것이 중요하다.

### 흔히 하는 실수: forEach 안의 await

`Array.prototype.forEach`는 콜백의 반환값(Promise 포함)을 기다리지 않는다.

```js
ids.forEach(async (id) => {
  await save(id); // forEach는 이 Promise를 기다리지 않는다
});
console.log("done"); // 실제로는 save가 끝나기 전에 찍힘
```

순서대로 기다리려면 `for...of`를 쓰거나, 동시에 처리해도 되면 `Promise.all`을 쓴다.

```js
// 순서대로
for (const id of ids) {
  await save(id);
}

// 병렬
await Promise.all(ids.map((id) => save(id)));
```

---

## 자주 만나는 함정들

### 1. await을 빼먹기

`await`을 빼면 Promise 자체가 결과처럼 다뤄진다.

```js
async function load() {
  const user = fetchUser();   // ← await 빠짐
  console.log(user.name);     // undefined 또는 에러
}
```

`fetchUser()`는 Promise를 반환하고, Promise 객체에는 `.name`이 없다. TypeScript를 쓰면 보통 잡히지만, JS만 쓸 때는 의외로 자주 새어 들어온다.

### 2. unhandled rejection

`await` 없이 호출한 비동기 함수가 reject되면 “처리되지 않은 거부”가 된다.

```js
async function fireAndForget() {
  doSomething(); // 실패해도 아무도 모름
}
```

브라우저는 `unhandledrejection` 이벤트로, Node.js는 프로세스 경고로 알린다. fire-and-forget이 의도라면 적어도 `.catch`로 결과를 막아야 한다.

```js
doSomething().catch((err) => log(err));
```

### 3. 경쟁 상태 (race condition)

같은 데이터를 여러 번 비동기로 갱신하면 마지막에 도착한 응답이 화면을 덮어쓰는 문제가 생긴다. 사용자가 빠르게 검색어를 바꾸는 상황이 대표적이다.

```js
async function search(q) {
  const res = await fetch(`/api/search?q=${q}`);
  setResult(await res.json());
}
```

`q`를 빠르게 바꾸면 이전 요청이 더 늦게 도착해서 결과를 덮어쓸 수 있다. 해결 패턴은 보통 다음 중 하나다.

- 요청에 식별자를 붙이고, 응답을 적용하기 전에 “이게 가장 최근 요청인가”를 검사한다.
- `AbortController`로 이전 요청을 취소한다.
- 라이브러리(SWR, React Query 등)에 키 기반 캐시와 취소를 위임한다.

```js
let abortController;
async function search(q) {
  abortController?.abort();
  abortController = new AbortController();
  const res = await fetch(`/api/search?q=${q}`, { signal: abortController.signal });
  setResult(await res.json());
}
```

### 4. await가 동기 코드를 멈춘다는 오해

`await`은 호출한 함수만 중단한다. 호출자는 계속 진행한다. 따라서 다음 코드는 `B`가 먼저 찍힌다.

```js
async function a() {
  await Promise.resolve();
  console.log("A");
}

a();
console.log("B");
// B
// A
```

UI 이벤트 핸들러에서 “이 함수가 끝날 때까지 다른 동작을 막고 싶다”는 의도라면 `await`만으로는 부족하다. 보통은 상태로 표현(`isLoading`, 버튼 disable)하거나, 큐로 직렬화한다.

---

## setTimeout과 setInterval의 정확한 이해

`setTimeout(fn, 1000)`은 “1초 뒤에 실행”이 아니라 “**최소 1초 뒤에 콜백을 큐에 넣는다**”에 가깝다. 실제 실행은 큐에서 꺼낼 차례가 와야 한다. 콜 스택이 길게 점유돼 있으면 그만큼 더 늦게 실행된다.

또한 HTML 명세상 중첩된 타이머는 일정 횟수 이후 최소 지연(약 4ms)이 강제된다. 그래서 `setTimeout(fn, 0)`은 정확히 “0ms 뒤”가 아니라 “지금 동기 코드와 마이크로태스크가 다 끝난 뒤, 그러나 다른 매크로태스크보다는 나중에”라고 이해하는 편이 맞다.

`setInterval`도 정확한 간격을 보장하지 않는다. 콜백 실행 시간이 길어지면 간격이 밀린다. 정확한 주기가 필요하면 `setInterval`보다 “이전 실행이 끝나면 다음 `setTimeout`을 거는” 방식이 안정적이다.

---

## fetch와 Web API

브라우저의 `fetch`도 Promise 기반 API다.

```js
const res = await fetch("/api/users");
if (!res.ok) throw new Error("failed");
const users = await res.json();
```

여기서 두 가지 주의할 점이 있다.

- `fetch`는 네트워크 실패(연결 자체 불가)에만 reject한다. 4xx, 5xx 같은 HTTP 에러는 reject가 아니라 `res.ok === false`로 표현된다.
- `res.json()`도 비동기다. 응답 본문 파싱을 별도 단계로 보기 때문이다.

MDN의 fetch 문서도 “네트워크 에러일 때만 reject”라고 명시한다. 참고: [MDN — Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)

비슷한 맥락에서 `AbortController`는 fetch뿐 아니라 다양한 Web API에서 작업을 취소하는 표준 패턴이 됐다. 비동기 작업은 시작만큼 “취소”도 중요하다.

```js
const ctrl = new AbortController();
fetch("/api/long", { signal: ctrl.signal });
// 어딘가에서
ctrl.abort();
```

---

## Node.js의 비동기는 어떻게 다른가

브라우저와 Node.js는 호스트 환경이 다르지만, 이벤트 루프 모델 자체는 비슷하다. 다만 Node.js는 libuv 위에서 동작하면서 매크로태스크 단계가 더 세분화돼 있다. timer, pending callbacks, idle/prepare, poll, check, close 같은 단계가 순서대로 처리된다.

또 Node.js에는 `process.nextTick`이 있다. 마이크로태스크보다도 우선순위가 높은 콜백 큐다.

```js
setTimeout(() => console.log("timeout"), 0);
Promise.resolve().then(() => console.log("promise"));
process.nextTick(() => console.log("nextTick"));

// nextTick
// promise
// timeout
```

웬만한 애플리케이션 코드에서 `process.nextTick`을 쓸 일은 거의 없지만, 라이브러리에서 비동기 보장을 “바로 다음 틱에 실행”으로 맞출 때 사용된다.

Node.js 공식 가이드도 이벤트 루프 단계를 그림과 함께 설명한다. 참고: [Node.js — The Node.js Event Loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)

---

## 정리

JavaScript의 비동기는 결국 다음 요약으로 압축할 수 있다.

- JS 엔진은 싱글 스레드, 한 시점에 하나의 콜 스택만 가진다.
- 시간이 오래 걸리는 작업은 호스트 환경(브라우저/Node.js)이 대신 처리하고, 결과는 큐로 전달된다.
- 이벤트 루프는 콜 스택이 빈 다음 큐에서 콜백을 꺼낸다. 한 번에 매크로태스크 1개 → 마이크로태스크 모두 → 렌더링 순서로 돈다.
- 콜백 → Promise → async/await으로 오면서 같은 모델 위에 더 읽기 좋은 문법이 추가됐다.
- `async/await`은 Promise를 더 보기 좋게 만든 문법이고, 실제 동시성 모델 자체는 바뀌지 않았다.
- 실무에서 만나는 함정은 대부분 “직렬 await”, “await 누락”, “unhandled rejection”, “race condition” 같은 패턴이다.

이 모델이 머릿속에 있어야 React의 `useEffect`, Suspense, Server Components, Next.js의 fetch 캐시 같은 개념이 자연스럽게 이어진다. 그 부분은 다음 글에서 다룬다. → [React와 Next.js에서의 동기와 비동기](/posts/react-nextjs-async-patterns)

---

## 참고 문서

- [MDN — Concurrency model and event loop](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Event_loop)
- [MDN — Promise](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)
- [MDN — async function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function)
- [MDN — Using Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)
- [HTML spec — Event loops](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
- [Node.js — The Node.js Event Loop](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)
