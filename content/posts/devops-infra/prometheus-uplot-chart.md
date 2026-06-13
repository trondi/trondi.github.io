---
title: "Prometheus 시리즈 ④ 프론트 — 데이터를 uPlot 차트로 그리기"
date: "2026-06-14"
summary: "Prometheus 응답을 uPlot의 AlignedData로 바꾸는 변환과, 명령형 uPlot을 React에 얹는 법. 행 지향 vs 열 지향 데이터 형식 차이, 문자열·타임스탬프 함정, 인스턴스 재생성 원칙을 정리하며 시리즈를 마친다."
category: "DevOps · Infra"
tags:
  - Prometheus
  - uPlot
  - Chart
  - React
  - Frontend
featured: false
---

# Prometheus 시리즈 ④ 프론트 — 데이터를 uPlot 차트로 그리기

> 시리즈 순서: [개념](/posts/prometheus-metrics-basics) → [쿼리](/posts/prometheus-promql-resource-usage) → [셋업](/posts/prometheus-setup) → **프론트**

## 들어가며

[3편](/posts/prometheus-setup)까지 해서 `query_range`가 JSON을 돌려주는 것까지 확인했다. 마지막 한 걸음, 이 JSON을 받아 선 그래프로 바꾸는 일이 남았다.

그냥 차트 라이브러리에 데이터를 넘기면 끝일 것 같지만, 실제로 해보면 중간에 변환 한 겹이 꼭 낀다. **Prometheus가 주는 데이터 모양과 차트 라이브러리가 원하는 모양이 다르기 때문이다.** 이번 편은 그 차이가 무엇이고, 왜 생기며, 어떻게 메우는지가 전부다. 차트 라이브러리는 uPlot을 기준으로 한다.

---

## 1. 왜 uPlot인가

서버 모니터링 차트에는 데이터 점이 많다. 4시간을 15초 간격으로 받으면 한 서버당 약 960개, 서버 열 대면 만 개 가까운 점이다. 여기에 1초마다 갱신까지 얹으면, 차트 라이브러리의 렌더링 비용이 그대로 체감된다.

uPlot은 이런 시계열 대량 데이터를 캔버스에 빠르게 그리는 데 특화돼 있다. 가볍고 빠른 대신, 대중적인 React 차트 라이브러리와는 두 가지가 다르다.

- **명령형 API다.** `<Chart data={...} />` 같은 선언형 컴포넌트가 아니라, `new uPlot(options, data, el)`로 인스턴스를 직접 만들고 직접 파괴한다.
- **데이터 형식이 독특하다.** 바로 다음 절의 주제다.

이 둘은 React와 함께 쓸 때 약간의 손이 더 간다는 뜻이기도 한데, 그건 뒤에서 다룬다.

---

## 2. 세 가지 데이터 형식

문제의 핵심은 같은 "시계열"을 두고 세 진영이 서로 다른 모양을 쓴다는 데 있다.

### ① Prometheus 응답 — series별 `[시각, 값]` 쌍

3편에서 본 그 JSON이다. `result` 배열 안에 **시계열마다 객체 하나**가 들어 있고, 각 객체의 `values`는 `[타임스탬프, 값]` 쌍의 배열이다.

```json
{
  "data": {
    "result": [
      { "metric": { "name": "srv1" }, "values": [[1718000000, "13.9"], [1718000015, "14.2"]] },
      { "metric": { "name": "srv2" }, "values": [[1718000000, "22.1"], [1718000015, "21.8"]] }
    ]
  }
}
```

행(row) 지향이다. "서버 하나 = 객체 하나, 그 안에 시각·값이 같이 묶임"이라고 보면 된다. 값이 문자열(`"13.9"`)이라는 점도 눈여겨두자.

### ② 흔한 차트 라이브러리 — 객체 배열

Recharts, Chart.js, Nivo 같은 라이브러리는 대개 **시점마다 객체 하나**를 원한다.

```js
[
  { time: 1718000000, srv1: 13.9, srv2: 22.1 },
  { time: 1718000015, srv1: 14.2, srv2: 21.8 },
]
```

역시 행 지향이지만, 묶는 기준이 다르다. Prometheus는 "서버로 묶고", 이쪽은 "시각으로 묶는다".

### ③ uPlot — 열(column) 지향, x축을 모두가 공유

uPlot은 완전히 다르다. 객체가 아니라 **배열의 배열**이고, 첫 배열을 x축으로 모든 시리즈가 공유한다.

```js
[
  [1718000000, 1718000015],   // [0] x축 — 모든 시리즈 공통
  [13.9, 14.2],               // [1] srv1의 y값
  [22.1, 21.8],               // [2] srv2의 y값
]
```

이름이 `AlignedData`인 이유가 여기 있다. 같은 인덱스끼리 같은 시각에 맞춰 **정렬(align)돼 있다**고 전제한다. `[1]`의 0번째 값과 `[2]`의 0번째 값은 둘 다 x축 `[0]`의 0번째 시각에 대응한다. uPlot이 빠른 이유의 상당 부분이 이 구조에서 나온다. 객체를 순회할 필요 없이 배열을 인덱스로 바로 읽으면 되니까.

세 형식을 나란히 두면 차이가 분명하다.

| | 묶는 기준 | 구조 | x축 |
|---|---|---|---|
| ① Prometheus | 시리즈별 | 객체 배열 + `[시각,값]` 쌍 | 시리즈마다 따로 |
| ② Recharts 류 | 시각별 | 객체 배열 | 객체 키로 매칭 |
| ③ uPlot | — | 배열의 배열 | **첫 배열을 전부 공유** |

결국 우리가 할 일은 **① → ③ 변환**이다.

---

## 3. ① → ③ 변환 — 한 함수가 하는 일

변환 함수가 하는 일을 말로 풀면 세 가지다.

1. 시리즈 하나에서 타임스탬프만 뽑아 **공유 x축**을 만든다.
2. 각 시리즈에서 값만 뽑아 **세로 배열들**로 쌓는다.
3. `metric` 라벨을 **범례 이름**으로 만든다.

코드로 보면 군더더기 없이 떨어진다.

```ts
function prometheusToUPlotSeries(response) {
  const results = response.data.result;

  // ① x축 — 첫 시리즈의 타임스탬프를 공유 축으로
  //    Prometheus는 초 단위라, ms를 쓰는 환경이면 * 1000
  const xValues = results[0]?.values.map(([ts]) => ts * 1000) ?? [];

  const seriesNames: string[] = [];
  const ySeries: number[][] = [];

  results.forEach((item) => {
    // ③ 라벨을 범례 이름으로
    seriesNames.push(item.metric.name ?? 'unknown');

    // ② 값만 뽑아 세로 배열로 — 문자열이라 Number()로 변환
    ySeries.push(item.values.map(([, v]) => Number(v)));
  });

  // [x, ...ys] 모양으로 합치면 그게 AlignedData다
  return { data: [xValues, ...ySeries], seriesNames };
}
```

핵심 한 줄은 마지막의 `[xValues, ...ySeries]`다. x축 배열 하나 뒤에 시리즈별 y배열들을 펼쳐 붙이면, 그 자체로 uPlot이 원하는 `AlignedData`가 된다.

여기서 세 가지 디테일이 실수 포인트다.

- **값이 문자열이다.** Prometheus의 `values`는 `"13.9"`처럼 문자열로 온다. `Number()`로 안 바꾸면 차트가 조용히 이상해진다.
- **타임스탬프 단위.** Prometheus는 **초**, JS의 `Date`와 많은 차트 설정은 **밀리초**다. `* 1000`을 빼먹으면 모든 점이 1970년 근처에 찍힌다.
- **정렬 전제.** uPlot은 모든 시리즈가 같은 x축을 공유한다고 믿는다. 위 코드는 첫 시리즈의 타임스탬프를 공유 축으로 쓰는데, 이건 **모든 서버가 같은 시각에 같은 개수의 점을 가진다**는 가정에 기댄다. `query_range`는 step 간격으로 정렬된 결과를 주므로 보통 이 가정이 성립한다. 다만 일부 서버가 중간에 죽어 점이 비는 경우가 있다면, 그 자리를 `null`로 채워 길이를 맞춰줘야 선이 어긋나지 않는다.

말로 풀면 이렇다.

```
[{name:"srv1", values:[[t,v]...]},   ──변환──▶   [[t...],        // 공유 x축
 {name:"srv2", values:[[t,v]...]}]                [v...srv1],     // y
   (행 지향, Prometheus)                           [v...srv2]]    // y
                                                  (열 지향, uPlot)
```

---

## 4. React와 명령형 uPlot 붙이기

데이터는 준비됐고, 이제 화면에 그릴 차례다. 여기서 1절에서 미뤄둔 "손이 더 간다"는 부분이 나온다. React는 선언형이고 uPlot은 명령형이라, 둘의 생애주기를 손으로 맞춰줘야 한다.

원칙은 두 가지다.

**uPlot 인스턴스는 ref에 보관하고, 리렌더마다 다시 만들지 않는다.** 인스턴스 생성은 비싸다. 데이터만 바뀌었다면 새로 만드는 대신 기존 인스턴스에 갱신 메서드를 부른다.

```tsx
const chartRef = useRef<HTMLDivElement>(null);   // 차트를 그릴 DOM
const uplotRef = useRef<uPlot | null>(null);     // 인스턴스 자체

useEffect(() => {
  if (!chartRef.current || size.width === 0) return;

  // 기존 인스턴스가 있으면 먼저 파괴 — 안 하면 캔버스가 쌓인다
  uplotRef.current?.destroy();

  uplotRef.current = new uPlot(options, alignedData, chartRef.current);

  return () => {
    uplotRef.current?.destroy();   // 언마운트 시 정리
    uplotRef.current = null;
  };
}, [alignedData]);
```

**크기 변경은 재생성이 아니라 메서드로 처리한다.** 컨테이너 크기가 바뀌었다고 차트를 다시 만들면 깜빡이고 비싸다. uPlot은 `setSize`를 따로 제공한다.

```tsx
const onResize = (width: number, height: number) => {
  uplotRef.current?.setSize({ width, height });
};
```

마찬가지로 범례를 눌러 특정 시리즈만 보이거나 숨기는 것도, 차트를 다시 그리는 게 아니라 `setSeries(idx, { show })`로 인스턴스의 상태만 바꾼다. **"데이터 자체가 바뀌면 재생성, 그 외 모든 건 메서드 호출"**이 명령형 차트를 React에 얹는 기본 감각이다.

이 원칙만 지키면 1초마다 갱신되는 실시간 차트도 깜빡임 없이 부드럽게 돌아간다.

---

## 5. 전체 흐름 다시 보기

네 편을 거쳐 온 데이터의 여정을 한눈에 이으면 이렇다.

```
[서버] node_exporter            메트릭{라벨} 누적값 노출        (1편)
   │
   ▼ scrape (pull, 15s)
[Prometheus] TSDB               (series, sample)로 저장        (1·3편)
   │
   ▼ query_range (start/end/step + PromQL)
PromQL 결과 (matrix JSON)        rate→avg→뒤집기로 사용률 계산  (2편)
   │
   ▼ prometheusToUPlotSeries
uPlot AlignedData               [x, ...ys] 열 지향으로 변환     (4편)
   │
   ▼ new uPlot / setData
[차트]                          서버마다 선 하나
```

처음에 던졌던 질문, "이 CPU 14%는 어디서 오는가"에 이제 전부 답할 수 있다. 커널의 누적 시간을 node_exporter가 노출하고, Prometheus가 긁어 저장하고, PromQL이 비율로 가공하고, 변환 함수가 차트 형식으로 바꾸고, uPlot이 선으로 그린다. 차트의 점 하나에 이 다섯 단계가 전부 들어 있다.

---

## 정리

- Prometheus 응답(시리즈별 `[시각,값]`), 일반 차트 라이브러리(시각별 객체), uPlot(`AlignedData`, 열 지향)은 **같은 시계열을 서로 다른 모양으로** 다룬다.
- 그래서 **① → ③ 변환**이 필요하다. 공유 x축을 만들고, 값을 세로 배열로 쌓고, `[x, ...ys]`로 합치면 끝이다. 문자열 변환·타임스탬프 단위·정렬 전제 세 가지만 조심하면 된다.
- 명령형 uPlot을 React에 얹을 땐 **인스턴스를 ref에 보관하고, 데이터가 바뀔 때만 재생성, 크기·표시 토글은 메서드로** 처리한다.

이걸로 시리즈를 마친다. 빈 서버에서 시작해, 커널의 숫자가 브라우저의 선이 되기까지 전 구간을 직접 거쳐 왔다. 같은 골격 위에 GPU(DCGM exporter)나 컨테이너 메트릭을 얹는 건, 결국 [2편](/posts/prometheus-promql-resource-usage)의 쿼리를 하나 더 쓰고 이 변환에 태우는 일의 반복이다.

---

[**← ③ 셋업 — Prometheus 직접 구축하기**](/posts/prometheus-setup) &nbsp;|&nbsp; **시리즈 完**
