---
title: "SharedWorker는 이름이 인스턴스다 - docker/k8s 스코프 분리"
date: "2026-07-18"
summary: "SharedWorker는 최초 연결의 baseURL로 SSE가 고정된다. k8s 스코프를 추가하자 먼저 연 탭의 스코프로 전체가 고정되는 문제가 생겼다 - 워커 이름을 파티셔닝 키로 쓰고, 프록시는 catch-all 라우트 하나로 합친 과정."
category: "Project"
tags:
  - Shared Worker
  - SSE
  - Next.js
  - Architecture
series: "알람 SSE 리워크"
seriesOrder: 9
---

# SharedWorker는 이름이 인스턴스다 - docker/k8s 스코프 분리

> 워커 이름이 같으면, 먼저 연 탭의 스코프로 전체가 고정된다.

## 배경 - 스코프가 둘이 됐다

알람 시스템은 원래 docker 스코프 하나였다. SharedWorker가 SSE 연결을
독점하고 모든 탭이 MessagePort로 붙는 구조
([구조 설명은 이 글에서](/posts/sharedworker-sse-pitfalls)).

여기에 k8s 지원이 추가되면서 SSE 엔드포인트가 둘이 됐다.

```
docker:  /api/proxy/alarm/connect
k8s:     /api/proxy/k8s/alarm/connect
```

같은 앱 안에서 docker 페이지와 k8s 페이지가 각각 자기 스코프의 알람만
받아야 한다. "SSE 연결은 1개"라는 기존 설계를 그대로 두면 어떻게 될까?

## 함정 - SharedWorker는 최초 baseURL로 고정된다

워커의 SSE 연결은 최초 REGISTER 때 1회만 열린다.

```js
// worker.ts - 이미 연결돼 있으면 no-op
function setupSSE(baseURL) {
  if (eventSource && eventSource.readyState !== EventSource.CLOSED) return;
  eventSource = new EventSource(`${baseURL}/alarm/connect`, { withCredentials: true });
  // ...
}
```

이 no-op 가드가 단일 연결의 핵심인데, 스코프가 둘이 되는 순간 **부작용**이 된다.

1. 사용자가 docker 페이지를 먼저 연다 → 워커 생성, docker baseURL로 SSE 연결
2. 같은 브라우저에서 k8s 페이지를 연다 → **같은 이름의 워커가 이미 있으므로** 브라우저는 새 워커를 만들지 않고 포트만 추가한다
3. k8s 탭의 REGISTER가 k8s baseURL을 보내도 `setupSSE`는 no-op - 이미 docker SSE가 살아 있으니까
4. 결과: **k8s 탭이 docker 알람을 받는다.** 반대 순서면 반대로.

에러도 안 난다. 연결은 멀쩡하고 알람도 흐른다 - 다만 **남의 스코프 알람**이다.
이런 버그가 제일 늦게 발견된다.

## 해법 1 - 워커 이름을 파티셔닝 키로

SharedWorker의 식별 규칙이 답이었다. 브라우저는 SharedWorker를
**(스크립트 URL + name) 조합**으로 식별한다. 이름이 다르면 같은 스크립트라도
별개 인스턴스가 뜬다.

```js
// client.ts - 스코프별로 이름을 분리해 인스턴스를 나눔
const worker = new SharedWorker(new URL('./worker.ts', import.meta.url), {
  name: `PadionAlarmWorker${isK8s ? '-k8s' : ''}`,
  type: 'module',
});
```

이제 구조는 이렇게 된다.

```
docker 탭들 ─ MessagePort ─ [PadionAlarmWorker]     ─ SSE ─ /alarm/connect
k8s 탭들    ─ MessagePort ─ [PadionAlarmWorker-k8s] ─ SSE ─ /k8s/alarm/connect
```

```diagram
sharedworker-scope
```

- 워커 코드는 **한 파일 그대로** - 인스턴스만 스코프 수만큼 뜬다.
- 각 인스턴스의 상태(연결, 이력 큐, 읽음 마커)도 자연스럽게 스코프별로 격리된다.
- "스코프당 SSE 1개"라는 원래 불변식도 유지된다. 전체 연결 수는 스코프 수와 같다 (탭 수와 무관).

스코프 정보를 워커에 별도로 전달할 필요도 없었다 - baseURL 경로에 이미
스코프가 반영돼 있어서(`/k8s/...`), 워커는 자기가 어느 스코프인지 몰라도 된다.

## 해법 2 - 프록시는 catch-all 라우트 하나로

엔드포인트가 둘이 되면 Next.js 쪽 SSE 프록시 라우트도 둘이 필요할까?
SSE 릴레이는 [fetch의 30초 타임아웃 문제](/posts/sse-shared-worker-in-practice) 때문에
`node:http`로 직접 릴레이하는 특수 라우트인데, 이걸 경로마다 복사하면
같은 스트리밍 코드가 두 벌이 된다.

대신 **catch-all 라우트 하나**로 합쳤다.

```
app/api/proxy/[...path]/route.ts   ← docker·k8s 요청을 모두 수신
```

```ts
// route.ts (요지)
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // /api/proxy/alarm/connect      → /alarm/connect
  // /api/proxy/k8s/alarm/connect  → /k8s/alarm/connect
  const backendPath = request.nextUrl.pathname.slice(API_PROXY_PREFIX.length);

  // 여기 도달하는 건 알람 SSE 경로뿐 - 그 외는 rewrite 대상이라 방어만
  if (!backendPath.endsWith(ALARM_CONNECT_PATH)) {
    return new Response(null, { status: 404 });
  }

  // 이하 node:http 릴레이 (상태코드 passthrough 포함) - 스코프 무관 공통
}
```

일반 API는 여전히 Edge 프록시(`proxy.ts`)가 `NextResponse.rewrite`로 처리하고,
SSE 경로만 통과시켜 이 라우트가 받는다. 프록시 prefix를 벗기면 그대로
백엔드 경로가 되도록 URL 규칙을 맞춰둔 덕에, 스코프 분기 코드가 라우트 안에
하나도 없다 - **경로가 곧 스코프**다.

## 배운 것

1. **SharedWorker의 `name`은 라벨이 아니라 인스턴스 식별자다.** "연결을 공유한다"는 특성의 반대면은 "상태도 공유된다"는 것 - 스코프별 상태가 필요한 순간, 이름이 파티셔닝 수단이 된다.
2. **싱글턴의 no-op 가드는 전제(단일 스코프)가 깨지면 버그가 된다.** `if (already) return`류의 가드를 볼 때는 "이게 막고 있는 게 중복인가, 아니면 다른 설정인가"를 물어야 한다.
3. 분기가 필요해 보일 때, **식별자(워커 이름)와 경로(URL)에 정보를 실으면 분기 코드 자체가 사라진다.** 워커도 라우트도 스코프를 모른 채 스코프별로 동작한다.

