---
title: "isFetching vs isLoading - 로딩 시간을 짧게 보이게 하려면"
date: "2026-07-13"
summary: "데이터는 멀쩡히 있는데 5초마다 표가 번쩍인다. react-query의 두 로딩 플래그 차이와, '로딩이 거슬린다'를 세 문제로 분해해 각각 주인을 찾은 과정."
category: "Project"
tags:
  - React Query
  - UX
  - Real-time
series: "알람 SSE 리워크"
seriesOrder: 4
---

# isFetching vs isLoading - 로딩 시간을 짧게 보이게 하려면

> 데이터는 멀쩡히 있는데 5초마다 표가 번쩍인다.

## 상황

알림 모달은 SSE 알람이 올 때마다 목록을 백그라운드로 재조회한다(throttle 적용).
react-query와 서버 페이징을 쓰는 구조다.

```js
const { data, isFetching, refetch } = usePaginatedQuery({ ... });
// ...
<NotiTable data={data} isLoading={isFetching} />
```

문제는 `isFetching`이 **모든 조회**(최초 로드 + 백그라운드 재조회 + 필터 변경)에서
true가 된다는 것이다. 알람이 올 때마다 로딩 UI가 켜져서, 보고 있던 표가 주기적으로 번쩍인다.

## 두 플래그의 차이

| | `isLoading` | `isFetching` |
|---|---|---|
| 최초 로드 (캐시 없음) | true | true |
| 백그라운드 재조회 | false | true |
| 필터/페이지 변경 재조회 | false* | true |

\* `placeholderData`로 이전 데이터를 유지하는 경우. 이전 데이터가 placeholder로
있으면 "데이터 없음" 상태가 아니므로 isLoading이 켜지지 않는다.

우리 쿼리 훅에는 이미 이게 있었다.

```js
useQuery({
  ...,
  placeholderData: (prevData) => prevData, // 재조회 중 이전 데이터 유지
});
```

즉 **데이터는 안 사라진다.** 사라지는 것처럼 보인 건 로딩 인디케이터를
`isFetching`으로 걸었기 때문이다.

## 선택지와 트레이드오프

**A. `isLoading`으로 교체** - 최초 로드만 스피너, 이후엔 조용히 데이터 교체.

```diff
  const {
    data: notiData,
-   isFetching,
+   isLoading,
    pagination,
    refetch,
  } = usePaginatedQuery({ ..., enabled: isOpen });

- <NotiTable data={notiData} isLoading={isFetching} ... />
+ <NotiTable data={notiData} isLoading={isLoading} ... />
```

- 장점: 백그라운드 재조회가 완전히 조용해져 깜빡임이 사라진다. 변경도 모달당 2줄이다.
- 단점: 필터·페이지 변경 같은 **사용자 액션에도** 스피너가 안 뜬다. "필터 눌렀는데 잠깐 옛 데이터가 보이는" 구간이 생긴다 (블랭크는 아니다).

**B. `isFetching` 유지 + 재조회 빈도 자체를 낮춤** - 스피너는 그대로 두고,
[throttle 창을 재조회 완료 시각 기준으로](/posts/throttle-window-anchor)
옮겨 로딩 간격을 벌린다.
- 장점: "지금 갱신 중"이라는 피드백이 유지된다 (모니터링 화면에서 중요할 수 있다).
- 단점: 깜빡임 자체는 남고, 빈도만 줄어든다.

**C. 소스 구분** - 사용자 액션(필터/페이지)은 스피너, 백그라운드(알람)는 조용히.
가장 정교하지만 재조회 출처를 구분하는 상태를 추가로 관리해야 한다.

## 우리 결론 - B

직접 A를 적용해서 보여주고 논의한 결과, **로딩 표시는 있어야 한다**는 판단이 나왔다.
이 모달은 실시간 모니터링 성격이라 "지금 갱신되고 있음"이라는 신호 자체가
정보였다. 대신 throttle anchor를 완료 시각으로 옮겨 체감 빈도를 낮췄다.

남은 로딩 시간(1초+)은 API 응답 대기(TTFB)라 프론트 몫이 아니었다.
5행짜리 페이지 조회가 1초 걸리면 그건 백엔드 쿼리(코드명 조인 + count 계산)
최적화의 영역이다. react-query가 언제 스스로 재조회하는지, staleTime과 gcTime이
각각 무엇을 재는 시계인지는 [Polling, SSE, WebSocket 비교 글](/posts/polling-vs-realtime)에
따로 정리해뒀다. Network 탭의 TTFB 수치가 백엔드에 전달할 근거가 된다.

## 배운 것

1. **"로딩이 거슬린다"는 최소 세 문제의 합집합이다** - 응답이 느림(백엔드), 너무 자주 옴(throttle), 올 때마다 번쩍임(스피너 정책). 각각 주인이 다르다.
2. `placeholderData`가 있으면 데이터는 이미 안전하다. 그 위에 스피너를 언제 보여줄지는 **기술이 아니라 화면 성격이 정하는 UX 결정**이다. 같은 코드라도 대시보드냐 폼이냐에 따라 답이 다르다.
3. A/B를 말로 설명하는 것보다 A를 실제로 적용해 보여주고 되돌리는 게 결정이 빨랐다. 4줄짜리 실험은 싸다.

