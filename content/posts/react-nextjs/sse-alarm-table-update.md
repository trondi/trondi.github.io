---
title: "SSE 알람으로 테이블을 실시간 업데이트하는 법 — SharedWorker + React Query 캐시 전략"
date: "2026-04-27"
summary: "SSE로 수신한 알람을 SharedWorker에서 받아 배칭하고, FULL_REFRESH와 ROW_UPDATE 두 전략으로 분기해 React Query 캐시를 직접 업데이트하는 설계를 파헤쳤다."
category: "React / Next.js"
tags:
  - React Query
  - SSE
  - SharedWorker
  - TanStack Query
  - Realtime Update
  - Batching
featured: false
---

# SSE 알람으로 테이블을 실시간 업데이트하는 법

서버에서 이벤트가 발생하면 테이블의 특정 행만 살며시 바뀐다. 페이지 전체를 새로고침하지 않고, 로딩 스피너도 없다. 이 경험을 만드는 코드 안을 분해했다.

---

## 전체 구조 한눈에 보기

```
SSE 서버
  └─▶ SharedWorker (단일 연결 유지)
        └─▶ MessagePort.onmessage  ← useAlarmHandler (컴포넌트마다 독립 인스턴스)
              │
              ├─ pendingQueue에 알람 누적
              ├─ getUpdateStrategy()로 전략 결정
              │
              ├─ FULL_REFRESH → refetch() 전체 재조회
              └─ ROW_UPDATE  → executePartialUpdateLogic()
                                  ├─ getCntrList() / getHostList() API
                                  └─ queryClient.setQueryData() 캐시 직접 교체
```

핵심은 세 가지다. **SharedWorker로 SSE 연결을 단 하나만 유지**하고, **배칭 로직으로 업데이트 빈도를 제어**하며, **React Query 캐시를 직접 수술**해 리렌더를 최소화한다.

---

## SharedWorker — SSE 연결을 탭 간 공유

같은 오리진의 탭이 여러 개 열려 있어도 SSE 연결은 하나다. SharedWorker 덕분이다.

```ts
// useAlarmHandler.ts
const port = alarmWorkerClient.getWorker(pageType, baseURL, { MAX_HISTORY_QUEUE_SIZE });
portRef.current = port;

port.onmessage = (event) => {
  const { type, data } = event.data;
  // ...
};
```

`alarmWorkerClient.getWorker`는 동일 URL의 SharedWorker 인스턴스를 반환한다. 탭을 새로 열어도 Worker를 새로 만들지 않고 기존 Worker에 포트를 추가로 연결한다. 컴포넌트가 언마운트되면 `CLOSE` 메시지만 보낸다. Worker 자체는 모든 포트가 닫혀야 종료된다.

---

## 알람 수신 — pageType 필터링과 pendingQueue

알람이 도착하면 가장 먼저 이 컴포넌트가 처리해야 하는 알람인지 판단한다.

```ts
const isHostAlarm = newAlarm.notiType === NOTI_TYPE.HOST;
const isCntrAlarm = [NOTI_TYPE.CNTR, NOTI_TYPE.container].includes(newAlarm.notiType);

let isRelevant = false;
if (pageType === ALARM_PAGE_TYPE.ALL)  isRelevant = true;           // Header, NotiTable
if (pageType === ALARM_PAGE_TYPE.HOST && (isHostAlarm || isCntrAlarm)) isRelevant = true; // HostTable
if (pageType === ALARM_PAGE_TYPE.CNTR && isCntrAlarm) isRelevant = true; // CntrTable
```

관련 있는 알람만 `pendingQueue`에 쌓는다. 큐의 키는 `cntr-{cntrId}-{hostId}` 또는 `host-{hostId}` 형태다. **같은 대상에 대한 알람이 여러 개 들어와도 Map이라 최신 1개만 남는다.**

---

## 전략 결정 — FULL_REFRESH vs ROW_UPDATE

큐를 분석해 두 전략 중 하나를 결정한다.

```ts
// alarmBatchUtils.ts
export const getUpdateStrategy = (
  queue: Map<string, AlarmInfo>,
  threshold: number,
  pageType: AlarmPageType,
  currentPageIds?: CurrentPageIds,
): UpdateStrategyResult => { ... }
```

### FULL_REFRESH가 결정되는 경우

| 조건 | 설명 |
|------|------|
| HOST 페이지 + notiAct ∈ `['CRT', 'DEL']` | 호스트가 추가/삭제됨 → 행 수 자체가 변함 |
| CNTR 페이지 + notiAct ∈ `['create', 'destroy', 'CRT', 'RM', 'RMF']` | 컨테이너 생성/삭제 |
| relevantQueue.size ≥ threshold (기본 8개) | 알람이 폭발적으로 쌓임 |

행의 **존재 여부**가 바뀌는 액션이면 부분 업데이트로는 처리가 안 된다. 전체를 다시 가져오는 게 맞다.

### ROW_UPDATE가 결정되는 경우

상태 변화(재시작, 일시정지 등)처럼 **행은 그대로인데 데이터만 바뀌는** 경우다. 이때는 해당 행만 API로 다시 가져와 캐시에 꽂는다.

### currentPageIds로 현재 페이지와 무관한 알람 걸러내기

```ts
// HOST 페이지: notiHostId로 현재 테이블에 보이는 호스트인지 확인
const hostRow = hostRowIdMap.get(alarm.notiHostId);
if (hostRow) relevantHostIdsMap.set(hostRow.hostId, hostRow);

// CNTR 페이지: cntrId-hostId 조합으로 현재 테이블 행인지 확인
const cntrRow = cntrRowMap.get(`${alarm.notiTargetId}-${alarm.notiHostId}`);
if (cntrRow) relevantCntrRowsMap.set(alarmKey, cntrRow);
```

1,000개 호스트 중 현재 페이지에 20개만 보이고 있다면, 나머지 980개 알람은 `NONE`으로 처리해 조용히 무시한다.

---

## 타이밍 제어 — 스로틀과 디바운스를 직접 구현

```
알람 수신
  │
  ├─ FULL_REFRESH
  │     └─ 마지막 FULL_REFRESH로부터 8초 경과? → 즉시 실행
  │         아니면 → setTimeout(남은시간) 예약
  │
  └─ ROW_UPDATE
        └─ timer 없으면 → setTimeout(5000ms) 예약
           (timer 이미 있으면 큐에만 추가하고 대기)
```

두 전략이 **별도 타임스탬프**(`lastFullRefresh`, `lastUpdate`)를 사용한다. FULL_REFRESH가 방금 실행됐어도 ROW_UPDATE는 5초 후에 실행될 수 있다.

업데이트 중에 새 알람이 들어오면 큐에만 쌓는다. 업데이트가 끝나고 나서 큐를 확인해 다시 전략을 결정한다.

```ts
// executeUpdate 완료 후
if (pendingQueue.current.size > 0) {
  const strategyResult = getUpdateStrategy(pendingQueue.current, ...);
  // 전략에 따라 즉시 실행하거나 타이머 예약
}
```

---

## ROW_UPDATE 실행 — React Query 캐시 직접 교체

```ts
// alarmUpdateUtils.ts
async function executeCntrPartialUpdate(relevantCntrRowsMap, ...) {
  // 1. 업데이트할 ccid 목록 추출
  const ccidList = Array.from(relevantCntrRowsMap.values())
    .map((row) => row.cntrCcid)
    .filter(Boolean);

  // 2. API로 최신 데이터 가져오기
  const response = await getCntrList({ ccidList });

  // 3. 매칭되는 쿼리 찾기
  const queries = allQueries.filter(
    (q) => Array.isArray(q.queryKey) && q.queryKey[0] === queryKeyPrefix
  );

  // 4. 캐시 직접 수정
  queries.forEach(([queryKey]) => {
    queryClient.setQueryData(queryKey, (oldData) => {
      return dataArray.map((row) => updatedRowsMap.get(key) ?? row);
    });
  });
}
```

변경된 행만 새 객체 참조로 교체한다. React는 참조가 바뀐 행만 리렌더한다. 바뀌지 않은 99개 행은 메모이제이션 덕분에 그대로다.

---

## 컴포넌트별 등록 방식 차이

세 컴포넌트가 `useAlarmHandler`를 다르게 사용한다.

### HostTable — HOST 페이지 메인 테이블

```ts
useAlarmHandler(ALARM_PAGE_TYPE.HOST, rerender, currentPageIds);
// currentPageIds = { hostRowIdMap }
// queryKey 없음 → prefix 'HOST_LIST' 매칭
```

`queryKey`를 전달하지 않으면 `HOST_LIST`로 시작하는 **모든** 쿼리를 업데이트한다.

### CntrTable — 컨테이너 메인 테이블

```ts
useAlarmHandler(ALARM_PAGE_TYPE.CNTR, rerender, currentPageIds);
// currentPageIds = { cntrRowInfMap }
// queryKey 없음 → prefix 'CNTR_LIST' 매칭
```

추가로 React Query 캐시를 직접 읽는다.

```ts
const cachedData = queryClient.getQueryData<any>([QUERY_KEY.CNTR_LIST]);
const data = cachedData || propData;
```

`setQueryData`가 캐시를 바꾸면 `useQuery`를 구독 중인 부모가 리렌더되고, 그 결과가 `propData`로 내려온다. `cachedData`도 동시에 최신값이 되므로 항상 최신 데이터를 보여준다.

### HostExpandRow — 호스트 확장 행의 컨테이너 목록

```ts
useAlarmHandler(
  ALARM_PAGE_TYPE.HOST,
  refetch,
  currentPageIds,
  [QUERY_KEY.CNTR_LIST, hostInf.hostId]  // ← 정확한 쿼리키 전달
);
```

`queryKey`를 직접 전달하면 **exact 매칭**으로 동작한다.

```ts
// actualQueryKey가 있으면 prefix 검색 대신 정확한 키로만
const queryData = queryClient.getQueryData(actualQueryKey);
if (queryData) queries = [[actualQueryKey, queryData]];
```

hostId가 다른 다른 확장 행의 캐시를 건드리지 않는다. 같은 `CNTR_LIST` prefix지만, `[CNTR_LIST, 1]`을 업데이트해도 `[CNTR_LIST, 2]`는 그대로다.

---

## queryKey 구조 정리

```
[QUERY_KEY.HOST_LIST]              ← HostPage (페이지 컴포넌트)
[QUERY_KEY.HOST_LIST, ...params]   ← 필터 파라미터 포함 쿼리

[QUERY_KEY.CNTR_LIST]              ← CntrPage (페이지 컴포넌트)
[QUERY_KEY.CNTR_LIST, hostId]      ← HostExpandRow (hostId별 독립 캐시)
```

prefix 매칭은 파라미터가 달라도 같은 데이터 종류면 한 번에 업데이트한다는 장점이 있다. 단, 의도치 않은 쿼리까지 업데이트될 수 있으니 명확히 구분이 필요한 곳은 exact 매칭을 쓰는 게 안전하다.

---

## ALL pageType은 테이블을 갱신하지 않는다

```ts
// executeUpdate() 내부
if (pageType === ALARM_PAGE_TYPE.ALL) {
  lastUpdate.current = Date.now();
  return; // ← executePartialUpdate 호출 없이 조기 종료
}
```

Header나 NotiTable처럼 `ALL` pageType으로 등록한 컴포넌트는 ROW_UPDATE 전략이 결정되어도 실제 테이블 갱신은 하지 않는다. `history` state와 `hasUnread` (헤더 빨간 점) 만 업데이트한다.

---

## 설계 포인트 정리

**배칭 + 스로틀로 요청 수를 줄인다.** 1초 안에 알람 7개가 오면 API 요청 1개로 처리한다. 8개 이상이면 FULL_REFRESH 한 번으로 끝낸다.

**현재 화면 기준 필터링.** 10페이지 분량의 데이터가 있어도 지금 보이는 행만 갱신한다.

**쿼리키 격리.** HostExpandRow가 per-hostId 쿼리키를 써서 다른 호스트의 expand row 캐시를 오염시키지 않는다.

**API 재조회 후 캐시 교체.** `setQueryData`에 직접 데이터를 만들어 넣는 게 아니라 서버에서 최신 데이터를 가져와서 교체한다. 클라이언트에서 상태를 추측하는 대신 서버 진실을 그대로 반영한다.

**isUpdating 플래그로 중복 실행 방지.** 비동기 업데이트 중에 새 알람이 와도 큐에만 쌓인다. 업데이트 완료 후 다시 큐를 처리한다.
