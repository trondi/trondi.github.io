---
title: "throttle의 창은 언제 시작되는가 - 로딩 시간이 휴식 시간을 깎아먹는 문제"
date: "2026-07-11"
summary: "throttle 5초를 걸었는데 로딩이 너무 자주 돈다. 원인은 창의 기준점을 재조회 '시작' 시각에 찍고 있었기 때문 - 완료 시각 anchor로 옮긴 과정과 효과 계산."
category: "Project"
tags:
  - Throttle
  - React Query
  - Real-time
  - Performance
series: "알람 SSE 리워크"
seriesOrder: 2
---

# throttle의 창은 언제 시작되는가 - 로딩 시간이 휴식 시간을 깎아먹는 문제

> throttle 5초를 걸었는데 왜 로딩이 이렇게 자주 돌지?

## 배경 - 알림 오면 모달 목록 재조회

SSE 알람이 오면 열려 있는 알림 모달의 목록을 다시 조회한다.
알람이 몰릴 수 있으니 재조회는 throttle로 묶었다. 직접 구현한 이유는
react-query의 `refetch`·모달 open 상태와 결합해야 해서다.

같은 시스템에 타이밍 제어가 하나 더 있다. Host/Container 테이블도 알람을 배칭하는데,
그쪽은 FULL_REFRESH 8초·ROW_UPDATE 5초로 [전략별 타이머를 따로 굴린다](/posts/sse-alarm-table-update).
이 글이 다루는 건 테이블이 아니라 **모달 재조회용 훅**(`useThrottledRefetch`)이고,
문제도 주기 길이가 아니라 주기를 재는 기준점에 있었다.

동작 규칙은 leading과 trailing 두 가지다.

- 직전 재조회에서 THROTTLE_MS 이상 지난 뒤 온 신호 → **즉시 실행** (leading)
- THROTTLE_MS 안에 온 후속 신호들 → 모아뒀다가 **주기 끝에 1회** (trailing)

```js
const elapsed = Date.now() - lastRefetchAt.current;
if (elapsed >= throttleMs) {
  lastRefetchAt.current = Date.now();
  refetch();                                  // 즉시
} else if (!timer.current) {
  timer.current = setTimeout(() => {
    timer.current = null;
    lastRefetchAt.current = Date.now();
    refetch();                                // 주기 끝 1회
  }, throttleMs - elapsed);
}
```

## 증상 - "계속 바로바로 업데이트되는데?"

테스트하다 보니 로딩이 체감상 너무 자주 돌았다. 원인은 두 가지였다.
하나는 착시였고, 하나는 실제 문제였다.

**착시 쪽**: 액션을 5초보다 띄엄띄엄 하면 매번 "한가함 → 즉시 실행(leading)"에
걸린다. throttle이 안 먹는 게 아니라, 5초 안에 몰릴 때만 묶는 게 원래 설계다.

**실제 쪽**: 창의 기준점(`lastRefetchAt`)을 재조회 **시작** 시각에 찍고 있었다.

## 문제 - 시작 anchor는 로딩 시간을 창에 포함시킨다

API 응답이 1초 걸린다고 하자. throttle 5초 기준의 타임라인은 다음과 같다.

```
[시작 anchor - 기존]
0초 재조회 시작 ─[로딩 1초]─ 1초 완료
                             └ 로딩 끝난 뒤 조용한 시간 = 5 − 1 = 4초뿐
5초 다음 재조회 가능 (0 + 5)
```

`lastRefetchAt = Date.now(); refetch();` - refetch를 await하지 않으니
창은 요청을 **던진 순간**부터 흐른다. 로딩이 길수록 "로딩 끝나자마자 또 로딩"이
가까워진다. 알람이 계속 오면 사용자는 로딩 UI를 (5 − 로딩시간) 간격으로 본다.

## 수정 - 완료 anchor로 이동

기준점 갱신을 refetch **완료 후**(`.finally`)로 옮겼다. leading/trailing 두 경로
모두 같은 패턴이라 변경은 이 두 곳뿐이다.

```js
const elapsed = Date.now() - lastRefetchAt.current;

if (elapsed >= throttleMs) {
  // leading - 즉시 실행하되, 창의 기준점은 로딩이 끝난 시각
  Promise.resolve(refetch()).finally(() => {
    lastRefetchAt.current = Date.now();
  });
} else if (!timer.current) {
  // trailing - 직전 "완료" + throttleMs 시점까지 남은 시간 뒤 1회 예약
  timer.current = setTimeout(() => {
    timer.current = null;
    Promise.resolve(refetch()).finally(() => {
      lastRefetchAt.current = Date.now();
    });
  }, throttleMs - elapsed);
}
// timer가 이미 예약돼 있으면 그 재조회에 합류 (아무것도 안 함)
```

```
[완료 anchor - 변경 후]
0초 시작 ─[로딩 1초]─ 1초 완료 ─── full 5초 휴식 ─── 6초 다음
```

두 anchor의 차이를 타임라인으로 비교하면 다음과 같다.

```diagram
throttle-anchor-timeline
```

- `Promise.resolve()`로 감싸 refetch가 void든 Promise든 처리한다. 훅의 props 타입(`refetch: () => void`)을 바꿀 필요가 없고, react-query의 refetch는 런타임에 Promise를 반환하므로 `.finally`가 실제 완료 시점에 걸린다.
- "로딩 중에 또 재조회가 겹치면?"은 react-query가 같은 queryKey의 동시 요청을 dedup하므로 in-flight 가드 없이 안전했다. 게다가 완료 전에는 anchor가 갱신되지 않아 후속 신호는 trailing 예약으로 흘러간다.
- 트레이드오프도 있다. 전체 갱신 주기가 (throttle + 로딩시간)으로 늘어 최신 반영이 그만큼 늦어진다. 모니터링 모달이라 수용했다.

## 효과 계산 - 언제 값어치가 있나

줄어드는 양은 정확히 **로딩 시간 1회분**이다. 즉 효과는 `로딩시간 / throttle` 비율에 비례한다.

| 로딩 | throttle | 시작 anchor 주기 | 완료 anchor 주기 | 체감 |
|---|---|---|---|---|
| 0.3초 | 5초 | 5.0초 | 5.3초 | 거의 없음 |
| 1초 | 5초 | 5.0초 | 6.0초 | 있음 |
| 1초 | 2초 | 2.0초 | 3.0초 | 큼 |

로딩이 빠르면 anchor를 옮겨도 별로 안 달라진다. 우리 케이스는 로딩 1초+라 유의미했다.

## 덤 - "자주 도는 느낌"의 또 다른 범인

로딩 **횟수**가 아니라 **스피너 깜빡임**이 거슬리는 경우도 있다.
그건 anchor 문제가 아니라 로딩 표시 정책 문제다 (react-query `isFetching`으로
백그라운드 재조회마다 스피너를 켜고 있었는지). 이건
[별도 글](/posts/isfetching-vs-isloading)에서 다룬다.

## 배운 것

1. throttle을 쓸 때 **"창의 기준점이 어디에 찍히는가"** 를 의식해야 한다. lodash throttle도 콜백 시작 기준이다 - 비동기 작업의 소요 시간이 창을 깎아먹어도 되는지는 설계 결정이다.
2. "자주 돈다"는 불만은 (a) leading 동작의 오해, (b) anchor 위치, (c) 스피너 정책 - 최소 세 갈래로 분해해야 정확한 수정이 나온다.

