---
title: "Service Worker(origin 단위 네트워크 프록시)"
date: "2026-10-26"
summary: "한 탭이나 여러 탭이 아니라 origin 전체에 사는 백그라운드 컨텍스트인 Service Worker를 라이프사이클, fetch 가로채기, Cache 전략, Push API, 흔한 함정 관점에서 정리하고 Worklet 패밀리도 짧게 짚었다."
category: "Frontend"
tags:
  - Browser
  - Worker
  - Service Worker
  - PWA
  - Cache
featured: false
series: "실시간 웹 통신과 브라우저 런타임"
seriesOrder: 9
---

# Service Worker(origin 단위 네트워크 프록시)

Dedicated Worker는 **한 탭**, Shared Worker는 **같은 origin의 여러 탭**이 함께 쓰는 워커였다. 둘 다 탭이 모두 닫히면 사라진다.

Service Worker는 한 단계 더 나간다. **origin 전체에 등록된 백그라운드 컨텍스트**다. 탭이 다 닫혀도 살아있고 사용자가 사이트를 다시 열면 브라우저가 자동으로 그 워커를 깨워 다시 일을 시킨다. 그 위에 **네트워크 요청 가로채기**와 **푸시 알림**이 얹혀 있다.

이 글은 Service Worker를 "PWA 만들기" 관점이 아니라 시리즈의 두 축에서 **"어디서 돌릴까"의 가장 멀리 있는 자리**로서 정리한다.

---

## 먼저 결론

| 상황 | Service Worker가 맞는가 |
|---|---|
| 오프라인 동작이 필요함 | 적합 |
| 정적 자원 캐시로 로드 속도 개선 | 적합 |
| 푸시 알림 수신 | 적합 |
| 백그라운드 동기화 | 적합 (Background Sync) |
| 무거운 계산을 메인 스레드 밖으로 빼기 | 부적합 (Dedicated Worker) |
| 같은 사용자의 여러 탭이 한 연결을 공유 | 가능하지만 SharedWorker가 더 단순 |

Service Worker의 본질은 "**브라우저와 네트워크 사이에 끼어드는 프록시**"다. 그 위에 캐시, 푸시, 동기화가 응용된 것이다.

---

## 세 종류 워커 한 장 비교

| | Dedicated Worker | Shared Worker | Service Worker |
|---|---|---|---|
| 범위 | 한 탭 | 같은 origin의 모든 탭 | origin 전체 |
| 탭과의 관계 | 만든 탭이 닫히면 종료 | 모든 사용 탭이 닫히면 종료 | **탭과 독립**, 필요 시 브라우저가 깨움 |
| DOM 접근 | 불가 | 불가 | 불가 |
| 네트워크 가로채기 | 불가 | 불가 | **가능** |
| 푸시 알림 | 불가 | 불가 | **가능** |
| 보안 컨텍스트 | HTTP/HTTPS 모두 | HTTP/HTTPS 모두 | **HTTPS 필수** (localhost 예외) |
| 등록 | `new Worker(url)` | `new SharedWorker(url, name)` | `navigator.serviceWorker.register(url)` |

Service Worker는 일반 인스턴스가 아니라 **등록**한다는 점이 다르다. 한 번 등록하면 origin에 묶여 사용자가 사이트를 떠나도 남아있고 다음 방문에서 다시 활성화된다.

---

## 라이프사이클: install / activate / fetch

Service Worker는 일반 워커보다 라이프사이클이 풍부하다.

```text
[Registration]
  navigator.serviceWorker.register("/sw.js")
        │
        ▼
[install]
  새 SW 스크립트가 다운로드되고 평가됨
  - 정적 자원 사전 캐싱은 여기서
        │
        ▼
[waiting]
  기존 컨트롤러가 있으면 대기
  (skipWaiting()으로 건너뛸 수 있음)
        │
        ▼
[activate]
  새 SW가 컨트롤러가 됨
  - 옛 캐시 정리는 여기서
        │
        ▼
[fetch / push / sync ... 이벤트 처리]
```

### install: 한 번만 실행, 사전 캐싱 자리

```js
// sw.js
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open("static-v1").then((cache) =>
      cache.addAll(["/", "/styles.css", "/app.js", "/offline.html"])
    )
  );
});
```

`event.waitUntil(promise)`로 install을 비동기로 늘릴 수 있다. 이 Promise가 resolve되어야 install이 끝난다.

### activate: 오래된 캐시 정리

```js
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== "static-v1").map((k) => caches.delete(k)))
    )
  );
});
```

새 버전의 SW가 activate되는 시점이 옛 캐시를 정리할 자연스러운 자리다.

### fetch: 핵심

```js
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached ?? fetch(e.request))
  );
});
```

페이지에서 발생하는 거의 모든 네트워크 요청이 이 이벤트로 들어온다. `event.respondWith(response)`로 응답을 직접 만들어 돌려주거나 `fetch(request)`로 그냥 통과시킬 수 있다.

---

## 등록과 스코프

```js
// 페이지 코드
if ("serviceWorker" in navigator) {
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
}
```

`scope`는 이 SW가 다룰 URL의 범위다. 기본값은 **SW 스크립트가 놓인 경로 이하**다. `/sw.js`는 사이트 전체를 다룰 수 있지만 `/app/sw.js`는 `/app/` 이하만 다룬다.

이 규칙 때문에 SW 파일은 보통 **사이트 루트**에 둔다. 깊은 경로에 두면 그 위 경로의 요청을 가로챌 수 없다.

---

## 캐시 전략 네 가지

`fetch` 이벤트 안에서 어떤 응답을 만들지는 전적으로 우리 몫이다. 자주 쓰는 패턴이 네 가지다.

### 1. Cache First

```js
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached ?? fetch(e.request))
  );
});
```

캐시가 있으면 그것을, 없으면 네트워크. **정적 자원**(폰트, 이미지, 빌드된 JS)에 어울린다.

### 2. Network First

```js
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
```

네트워크 응답을 먼저 시도하고 실패하면 캐시. **자주 바뀌는 API 응답**에 어울린다.

### 3. Stale-While-Revalidate

```js
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.open("runtime").then(async (cache) => {
      const cached = await cache.match(e.request);
      const fresh = fetch(e.request).then((res) => {
        cache.put(e.request, res.clone());
        return res;
      });
      return cached ?? fresh;
    })
  );
});
```

캐시된 응답을 즉시 돌려주면서 **백그라운드로 새 응답을 받아 캐시를 갱신**한다. 빠른 응답과 최신성을 동시에. 뉴스 피드, 대시보드 같은 곳에 어울린다.

### 4. Cache Only / Network Only

오프라인 페이지 표시(`/offline.html`은 cache only), 결제 같이 절대 캐싱하면 안 되는 요청(network only)에 쓰인다.

---

## Cache API 핵심

`Cache`는 Request/Response 객체를 그대로 저장하는 영구 저장소다.

```js
const cache = await caches.open("static-v1");

await cache.add("/styles.css");                  // fetch 후 저장
await cache.addAll(["/", "/app.js"]);            // 여러 개 한 번에

const res = await cache.match("/styles.css");    // 찾아오기
await cache.put(request, response);              // 임의 Response 저장
await cache.delete("/styles.css");

const keys = await caches.keys();                // 모든 캐시 이름
await caches.delete("static-v0");                // 옛 캐시 삭제
```

`Cache`는 origin 단위 저장소다. 페이지에서도 같은 `caches.open(...)`으로 같은 캐시에 접근할 수 있어서 SW와 페이지가 캐시를 공유할 수 있다.

---

## Push API + Notifications

Service Worker가 빛나는 다른 자리. 사용자가 사이트를 닫아도 푸시 알림을 받을 수 있다.

```js
// sw.js
self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? "알림", {
      body: data.body,
      icon: "/icon.png",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow("/inbox"));
});
```

이 흐름이 동작하려면 페이지 쪽에서 사용자 권한을 받고 Push 구독을 만들어 서버에 보내는 절차가 필요하다. 그 부분은 Web Push 명세(`PushManager.subscribe`)와 VAPID 인증의 영역이라 여기서는 생략한다.

---

## Background Sync: 네트워크 복귀 시 작업 재시도

```js
// 페이지 쪽
const reg = await navigator.serviceWorker.ready;
await reg.sync.register("upload-pending");
```

```js
// sw.js
self.addEventListener("sync", (e) => {
  if (e.tag === "upload-pending") {
    e.waitUntil(uploadPendingItems());
  }
});
```

오프라인일 때 큐에 쌓아둔 작업을, 네트워크가 돌아온 시점에 SW가 깨어나 처리한다. 사용자가 사이트를 떠나 있어도 동작한다는 점이 특이하다. 다만 브라우저 지원 범위가 일정하지 않으므로 보조 수단으로 보는 게 안전하다.

---

## Service Worker로 cross-tab 공유하기

[시리즈 마지막 글](/posts/cross-tab-shared-connection)의 예고편으로, SW도 SharedWorker처럼 cross-tab 공유 도구가 될 수 있다.

```js
// sw.js
const bc = new BroadcastChannel("app");

self.addEventListener("message", (e) => {
  if (e.data.type === "fanout") {
    bc.postMessage(e.data.payload);
  }
});
```

페이지들이 `BroadcastChannel("app")`에 listen만 해두면 SW에서 들어온 푸시·sync 이벤트를 모든 탭에 흘려보낼 수 있다. SharedWorker의 대안이지만 책임 범위가 다르다.

| 도구 | 잘 맞는 자리 |
|---|---|
| Shared Worker | 같은 사용자가 켠 탭들 간 **상태 공유** + 연결 공유. 데스크톱 환경. |
| Service Worker | **오프라인 + 푸시 + 캐시**. 모바일 포함 광범위. |
| BroadcastChannel | **메시지 fan-out만** 필요할 때. SW나 SharedWorker와 조합. |

---

## 흔한 함정

### 1. 업데이트가 즉시 반영되지 않는다

기본 동작상 새 SW는 기존 탭이 모두 닫혀야 활성화된다. 개발 중에는 답답하다. `self.skipWaiting()`을 install에서 호출하고 `clients.claim()`을 activate에서 호출하면 즉시 교체된다.

```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
```

### 2. HTTPS 필수

Service Worker는 보안 컨텍스트에서만 동작한다. `localhost`는 예외라 개발 중에는 그대로 쓰면 되지만 배포 시에는 반드시 HTTPS다.

### 3. 캐시 무효화 실수

캐시 이름에 버전을 붙이고(`static-v1`, `static-v2`) 새 버전의 SW가 activate될 때 옛 버전 캐시를 지우는 패턴이 안전하다. 같은 캐시 이름에 계속 새 응답을 덮어쓰면 오래된 응답이 영구히 남는 사고가 흔하다.

### 4. 디버깅

Chrome DevTools의 **Application 패널 → Service Workers** 섹션에서 등록 상태, 업데이트, 강제 종료를 다룰 수 있다. "Update on reload" 옵션이 개발 중에는 거의 필수다.

---

## Worklet 패밀리도 짧게

시리즈 초반에 워커 패밀리를 정리하면서 한 가지 더 언급한 게 있다. 바로 `Worklet`이다. 통신 맥락의 글이라 본문에 끼우진 않았는데, 같은 "워커 사촌"으로 짧게 짚어둔다.

| 종류 | 역할 |
|---|---|
| **Audio Worklet** | Web Audio 처리 그래프 안에 들어가는 오디오 스레드 콜백 |
| **Paint Worklet** | CSS `paint()` 함수로 커스텀 페인트 |
| **Animation Worklet** | 메인 스레드 밖에서 애니메이션 구동 (지원 진행 중) |
| **Layout Worklet** | 커스텀 CSS 레이아웃 (실험적) |

Workers가 "**별도 JS 프로그램을 띄우는 느낌**"이라면, Worklets는 "**브라우저 엔진의 특정 파이프라인에 콜백을 꽂는 느낌**"이다. 자기 이벤트 루프가 없고 API가 매우 제한적이다. 실시간 통신 맥락과는 무관하니 깊게 다루지 않지만 "워커 패밀리에는 또 이런 가벼운 사촌도 있다"는 정도로 기억해 두면 충분하다.

---

## 다음: 두 축이 만나는 마지막 글

여기까지가 시리즈의 두 축이다.

```text
[축 A] 통신 프로토콜       polling / SSE / WebSocket / WebRTC
[축 B] JS 실행 컨텍스트    Main / Dedicated W / Shared W / Service W
```

[다음 글](/posts/cross-tab-shared-connection)은 두 축이 만나는 자리, **"같은 사용자의 여러 탭이 어떻게 SSE/WebSocket 연결 하나만 유지하나"**다. SharedWorker로 푸는 길, BroadcastChannel + Web Locks로 푸는 길, Service Worker로 비슷한 일을 해보는 길까지, 시리즈를 마무리하는 실전편이 된다.

---

## 참고

- [W3C: Service Workers](https://www.w3.org/TR/service-workers/)
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN: Cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [Workbox: 캐시 전략 정리](https://developer.chrome.com/docs/workbox/caching-strategies-overview)
