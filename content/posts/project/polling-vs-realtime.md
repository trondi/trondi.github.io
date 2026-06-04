---
title: "Polling, SSE, WebSocket — 클러스터 설치 상태에 무엇을 골랐나"
date: "2026-05-31"
summary: "실시간 알람은 SSE를 골랐는데, 클러스터 설치 상태 화면에서는 Short Polling을 골랐다. 같은 '서버 → 클라이언트 실시간' 문제인데 왜 선택이 달랐는지 정리했다."
category: "Project"
tags:
  - Polling
  - SSE
  - WebSocket
  - Real-time
  - React Query
featured: false
---

# Polling, SSE, WebSocket — 클러스터 설치 상태에 무엇을 골랐나

알람 시스템에서는 [SSE를 골랐다](/posts/project/sse-shared-worker-in-practice). 그런데 같은 프로젝트의 클러스터 설치 상태 화면에서는 **Short Polling**을 선택했다.

둘 다 "서버에서 상태가 바뀌면 화면에 반영한다"는 같은 요구사항인데 왜 다른 선택을 했는지, 그리고 Polling을 고를 때 어떤 기준으로 short / long을 결정하는지 정리한다.

---

## Polling의 두 가지 종류 (짧게)

둘을 가르는 핵심은 **클라이언트 요청 간격이 아니라, 서버가 응답을 즉시 주는가 보류하는가** 다.

- **Short Polling** — 클라이언트가 일정 간격(`setInterval`)으로 요청하고, 서버는 즉시 응답한다. 데이터가 없으면 빈 응답이라도 바로 돌려준다.
- **Long Polling** — 클라이언트가 요청하면 서버가 **데이터가 생길 때까지 응답을 보류**한다. 클라이언트는 응답을 받으면 즉시 다음 요청을 보낸다.

| | Short Polling | Long Polling |
|---|---|---|
| 트리거 | 타이머 (`setInterval`) | 루프 (`while`, 응답 받으면 다음) |
| 서버 응답 | 즉시 | 데이터 생길 때까지 보류 |
| 간격 | 정해짐 (2초, 5초) | 정해지지 않음 (서버 응답 타이밍) |
| 최신성 | 폴링 간격만큼 지연 | 거의 실시간 |

> 가장 많이 하는 오해: Long Polling은 "일정 시간마다"가 아니다. **Short는 시간 기반, Long은 응답 기반**이다. 그리고 한 번 누르는 "조회 버튼"은 polling이 아니다 — polling은 사용자 액션 없이 백그라운드에서 자동으로 도는 루프다.

short/long이 내부에서 어떻게 동작하는지 — 서버가 응답을 어떻게 "보류"하는지(`bus.emit`/`await`), idle timeout, short vs long 흐름 비교, Comet/hanging GET의 역사까지 — 는 개념 레퍼런스에 따로 정리했다.

→ [HTTP polling과 long polling — 실시간을 흉내내는 가장 오래된 방법](/posts/frontend/http-polling-and-long-polling)

이 글은 그 개념을 전제로, **padion에서 실제로 무엇을 골랐는지**에 집중한다.

---

## padion의 선택 — Cluster 설치 상태에 Short Polling

클러스터를 새로 설치하면 노드별로 컴포넌트가 순차적으로 배포된다. 설치 진행 상태를 화면에 보여줘야 했다. Task가 어느 노드에서 어떤 상태인지 (running / preparing / failed 등) 표시한다.

### 코드

[`ClusterStatusController.tsx`](apps/pandora-frontend/src/app/docker/cluster/controller/form/install/ClusterStatusController.tsx) 에서 React Query의 `refetchInterval` 옵션 하나로 polling을 구현했다.

```ts
const { data: clusterStatusData, isLoading } = useQuery({
  queryKey: [QUERY_KEY.CLST_INSTALL_STAT_NODE_LIST, clusterInfo.clusterId],
  enabled: !!clusterInfo.clusterId,
  refetchInterval: CLUSTER_STATUS_REFRESH_INTERVAL_MS, // 2000ms
  queryFn: async () => {
    // 1) Node 예상 목록 조회
    const nodeRes = await getClusterCmpntNodeList({ clusterId });
    const nodeBuckets = nodeRes?.data ?? [];

    // 2) Component 상세 (task 상태 포함) 조회
    const cmpntRes = await getClusterCmpntList({ clusterId });
    const cmpntList = cmpntRes?.data ?? [];

    // 3) 두 응답을 clusterCmpntMapId / swarmNodeId 로 merge
    // ...
    return merged;
  },
});
```

2초마다 두 API를 호출하고, 응답을 merge해 테이블 데이터를 만든다.

### 왜 Short Polling이었나

알람 시스템은 SSE를 골랐는데 여기서는 왜 Polling이었을까.

| 기준 | 알람 시스템 | 클러스터 설치 상태 |
|---|---|---|
| 데이터 발생 빈도 | 예측 불가, 항상 열려 있어야 함 | 설치 중에만, 끝나면 종료 |
| 화면 체류 시간 | 사용자가 페이지 떠나도 백그라운드에서 필요 | 설치 진행 중에만 본다 |
| 최신성 요구 | 즉시 (보안/장애 알람) | 2~3초 지연 허용 |
| 서버 인프라 | 새로 SSE endpoint 구축 | 기존 REST API 그대로 |
| 다중 탭 | 같은 알람을 여러 탭이 본다 | 보통 1탭에서만 본다 |

설치 상태는 본질적으로 **유한한 작업의 진행도**다. 설치가 끝나면 polling도 멈춘다. 영구적으로 열어두는 채널을 만들 이유가 없었다.

반면 알람은 **사용자가 로그인되어 있는 한 계속** 받아야 한다. polling으로 처리하면 빈 응답이 압도적으로 많고, 알람이 발생한 시점과 화면 반영 시점 사이에 polling 간격만큼 지연이 생긴다.

### Short Polling의 함정 — useQuery에서 주의할 것

```ts
refetchInterval: 2000,
```

이 한 줄로 polling이 시작되지만, 몇 가지 알아둘 점이 있다.

**1. 컴포넌트 unmount 시 자동 정지**

React Query는 query가 사용되는 컴포넌트가 모두 unmount되면 polling을 멈춘다. 페이지를 떠나면 자동으로 중단되므로 따로 cleanup이 필요 없다.

**2. 탭 비활성 시 동작 (`refetchIntervalInBackground`)**

기본값은 `false` — 탭이 백그라운드로 가면 polling이 멈춘다. 설치 상태처럼 "보고 있을 때만 최신이면 된다"는 경우엔 이게 맞다. 알람처럼 백그라운드에서도 받아야 하는 경우엔 `true`로 바꿔야 하지만, 그 시점에 이미 polling은 잘못된 선택이다.

**3. queryFn이 무거우면 부하가 곱해진다**

이 화면은 한 사이클에 API를 2번 부른다 — 2초 × 2개 = **초당 1 API 호출**. 사용자가 100명 동시에 보면 초당 100 호출. polling 간격을 정할 때 동시 사용자 수를 고려해야 한다.

**4. 진행 상태 페이지에선 "끝나면 멈추기" 로직이 필요할 수도**

현재 코드는 페이지에 머무는 한 계속 polling한다. 설치가 완료된 후에도 사용자가 페이지에 남아있으면 불필요한 호출이 이어진다. 개선한다면

```ts
refetchInterval: (query) => {
  const data = query.state.data;
  const allDone = data?.every((row) => row.swarmTaskList.every((t) => t.swarmTaskStat === 'running'));
  return allDone ? false : 2000;
},
```

완료 조건을 만족하면 `false`를 반환해 polling을 멈출 수 있다.

---

## useQuery의 "알아서 갱신"은 Long Polling이 아니다

React Query를 쓰면 "캐싱해주고 알아서 최신으로 바꿔준다"고들 한다. 그래서 내부가 Long Polling 기반인가 오해하기 쉬운데, **정반대다.**

| | Long Polling | useQuery (기본) |
|---|---|---|
| 변경 감지 주체 | 서버 (데이터 바뀌면 응답) | 없음 (서버는 모른다) |
| 업데이트 방향 | 서버 → 클라이언트 (사실상 push) | 클라이언트가 알아서 다시 묻기 |
| 트리거 | 서버 응답 | mount / focus / reconnect 등 |
| 서버 코드 | `await`로 보류 로직 필요 | 평범한 REST |

Long Polling은 **서버 주도**다. 서버가 변경을 알고 응답으로 알려준다. useQuery는 **클라이언트 주도**다. 서버는 자기 데이터가 바뀐 걸 클라이언트에게 알릴 방법이 없고, 클라이언트가 "이쯤이면 다시 물어볼 만하다"는 휴리스틱으로 알아서 다시 부른다.

### refetch가 일어나는 트리거

전부 **클라이언트 쪽 이벤트**다.

| 트리거 | 언제 | 옵션 |
|---|---|---|
| Mount | 컴포넌트 첫 마운트 | `refetchOnMount` |
| Window focus | 탭에 다시 포커스 | `refetchOnWindowFocus` |
| Reconnect | 네트워크 재연결 | `refetchOnReconnect` |
| Interval | 정해진 시간마다 (= Short Polling) | `refetchInterval` |
| Manual | `refetch()` / `invalidateQueries()` | — |

### staleTime과 gcTime — 캐시의 두 가지 시계

refetch가 "일어날 수 있는" 트리거는 위와 같고, "실제로 일어나는지"는 **stale 여부**가 결정한다.

**`staleTime`** — 데이터를 받은 후 이 시간 동안은 fresh(신선)하다고 본다. fresh면 트리거가 와도 캐시만 반환하고 네트워크를 타지 않는다. 지나면 stale이 되고, 다음 트리거에서 refetch한다.

```ts
useQuery({
  queryKey: ['users'],
  queryFn: fetchUsers,
  staleTime: 60_000, // 60초 동안 fresh
});
```

기본값은 `staleTime: 0` — **받자마자 stale**이다. 그래서 mount/focus마다 refetch가 일어나 "너무 자주 부른다"는 인상을 준다. 실무에서 `staleTime`을 명시적으로 잡는 게 튜닝의 90%다.

**`gcTime`** (구 `cacheTime`) — 쿼리가 더 이상 **사용되지 않을 때**(구독 컴포넌트가 모두 unmount) 캐시를 메모리에 얼마나 보관할지. 기본 5분. 이 시간 안에 같은 queryKey가 다시 구독되면 캐시에서 즉시 반환하고, 지나면 메모리에서 제거된다.

```
0초:   마운트 → fetch → 캐시 저장 (fresh, 60초간)
30초:  같은 쿼리 재사용 → fresh이므로 캐시 즉시 반환 (네트워크 X)
70초:  탭 복귀(focus) → 이미 stale → refetch
       (이때 stale 캐시를 먼저 보여주고, 백그라운드에서 갱신)
unmount 후 5분: gcTime 지남 → 캐시 제거. 다음엔 처음부터 fetch
```

`staleTime`은 "**언제 다시 물어볼까**", `gcTime`은 "**안 쓰는 캐시를 언제 버릴까**"를 정하는 별개의 시계다.

### 그래서 진짜 실시간이 필요하면

흔한 실무 패턴은 **SSE/WebSocket으로 "변경됨" 신호만 받고, 데이터는 useQuery 캐시를 무효화해 다시 받는** 것이다.

```ts
useEffect(() => {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    const { entity } = JSON.parse(e.data);
    queryClient.invalidateQueries({ queryKey: [entity] }); // 해당 쿼리만 refetch
  };
  return () => es.close();
}, []);
```

SSE는 작은 무효화 신호(`{ type: 'invalidate', key: 'users' }`)만 보내고, 실제 조회는 기존 REST + useQuery 캐시/dedup을 그대로 활용한다. [알람 시스템](/posts/project/sse-shared-worker-in-practice)에서 ROW_UPDATE / FULL_REFRESH 전략으로 캐시를 갱신한 게 이 패턴의 변형이다.

---

## 세 방식 비교

| | Short Polling | SSE | WebSocket |
|---|---|---|---|
| 방향 | 클라이언트 요청 → 서버 응답 | 서버 → 클라이언트 단방향 | 양방향 |
| 프로토콜 | HTTP 요청 반복 | HTTP keep-alive 스트림 | ws:// (HTTP Upgrade) |
| 실시간성 | polling 간격만큼 지연 | 거의 실시간 | 실시간 |
| 서버 부하 | 잦은 요청 (대부분 빈 응답) | connection 유지 | connection 유지 |
| 구현 복잡도 | 매우 낮음 | 중간 | 높음 |
| 자동 재연결 | 자연스러움 (다음 요청이 곧 재시도) | 브라우저가 처리 | 직접 구현 |
| 인프라 추가 | 없음 (기존 REST 그대로) | endpoint 추가 | 별도 gateway / custom server |
| 적합한 경우 | 유한한 작업 진행도, 느린 변화 | 알람, 피드, 진행 상황 | 채팅, 게임, 협업 도구 |

---

## 의사결정 트리

```
양방향 통신이 필요한가?
├─ Yes → WebSocket
└─ No (서버 → 클라이언트만)
    │
    데이터가 영구적으로 흐르는가?
    ├─ Yes (사용자가 로그인 중 계속) → SSE
    └─ No (유한한 작업 / 페이지 한정)
        │
        지연이 얼마나 허용되나?
        ├─ < 1초 → SSE (polling은 부하 대비 비효율)
        └─ 2~5초 OK → Short Polling
```

---

## 정리

같은 "서버 → 클라이언트 실시간"이라도 **데이터의 성격**에 따라 선택이 달라진다.

- 알람: 영구적, 즉시성 → **SSE**
- 클러스터 설치 상태: 유한, 2초 허용 → **Short Polling**
- 채팅, 협업: 양방향 → **WebSocket**

기술을 먼저 정하고 시나리오에 끼워 맞추면 오버엔지니어링이 되거나, 반대로 한계에 부딪힌다. 데이터가 어떤 모양으로 흐르는지부터 보고 거기에 맞는 도구를 고르는 편이 결과적으로 더 단순한 코드를 만든다.

Polling은 종종 "구식"으로 취급되지만 — 짧고 유한한 모니터링에는 여전히 가장 단순한 선택이다.

---

## 참고

- [HTTP polling과 long polling — 실시간을 흉내내는 가장 오래된 방법](/posts/frontend/http-polling-and-long-polling) — polling 동작 메커니즘 상세
- [SSE와 Shared Worker — 실시간 통신의 두 가지 접근](/posts/project/sse-shared-worker)
- [실무에서 SSE + Shared Worker를 도입하며 마주친 것들](/posts/project/sse-shared-worker-in-practice)
- [Next.js에서 SSE와 WebSocket은 Proxy로 처리해도 될까](/posts/react-nextjs/nextjs-proxy-sse-websocket)
- [TanStack Query — Refetching](https://tanstack.com/query/latest/docs/framework/react/guides/refetching)
