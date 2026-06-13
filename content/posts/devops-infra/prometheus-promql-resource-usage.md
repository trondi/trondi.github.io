---
title: "Prometheus 시리즈 ② 쿼리 — PromQL로 CPU·메모리·네트워크 사용량 뽑아내기"
date: "2026-06-12"
summary: "100 - avg by (instance)(rate(...)) 한 줄을 다섯 단계로 분해한다. rate()가 필요한 이유, idle을 뒤집는 발상, 메모리·네트워크 쿼리, query_range의 step과 lookback 차이까지 인터랙티브 시각화와 함께 정리했다."
category: "DevOps · Infra"
tags:
  - Prometheus
  - PromQL
  - rate
  - node_exporter
  - Monitoring
featured: false
---

# Prometheus 시리즈 ② 쿼리 — PromQL로 CPU·메모리·네트워크 사용량 뽑아내기

> 시리즈 순서: [개념](/posts/prometheus-metrics-basics) → **쿼리** → [셋업](/posts/prometheus-setup) → [프론트](/posts/prometheus-uplot-chart)

## 들어가며

[1편](/posts/prometheus-metrics-basics)에서 메트릭이 어디서 태어나 어떻게 쌓이는지를 봤다. 이제 꺼내 쓸 차례다.

이번 편의 목표는 이 쿼리 한 줄을 완전히 이해하는 것이다.

```promql
100 - avg by (instance)( rate(node_cpu_seconds_total{mode="idle"}[1m]) ) * 100
```

처음 보면 괄호 지옥처럼 보이지만, 안쪽부터 한 겹씩 벗기면 다섯 단계짜리 단순한 계산이다. CPU를 끝까지 분해해 보고 나면 메모리와 네트워크는 같은 원리의 변주라는 게 보인다.

> 💡 이 글에서 다루는 변환 과정을 단계별로 만져볼 수 있는 [**인터랙티브 시각화**](/prometheus-query-flow.html)를 따로 만들어 뒀다. 새 탭에서 열어 함께 보면 이해가 빠르다.

---

## 1. 출발 전에 — 왜 CPU 사용률을 "직접" 못 가져오나

가장 먼저 부딪히는 사실이 있다. node_exporter에는 `cpu_usage_percent` 같은 메트릭이 **없다.**

리눅스 커널이 제공하는 건 "각 코어가 각 mode(idle, user, system, ...)로 보낸 누적 시간"뿐이다. 사용률이라는 건 어느 시점의 상태가 아니라 **구간에 대한 해석**이라서, 커널은 원재료만 주고 계산은 쓰는 쪽의 몫이다.

그래서 우회로를 탄다.

> 바쁜 시간을 더하는 건 복잡하다(user + system + iowait + ...).
> 대신 **노는 시간(idle)을 재서 100에서 빼면** 그게 사용률이다.

이 발상 하나가 위 쿼리의 뼈대다.

---

## 2. CPU 사용률 — 다섯 단계로 분해

쿼리를 안쪽부터 다시 보자.

```promql
100 - avg by (instance)( rate(node_cpu_seconds_total{mode="idle"}[1m]) ) * 100
        └ ④ 코어 평균       └ ③ 초당 증가율   └ ① 메트릭  └ ② 라벨 필터        ⑤ 뒤집기
```

### ① 메트릭 선택 — `node_cpu_seconds_total`

1편에서 본 그 Counter다. 코어별 × mode별로 "누적 초"가 쌓여 있다.

```
node_cpu_seconds_total{cpu="0",mode="idle"}    89412.51
node_cpu_seconds_total{cpu="0",mode="user"}     1203.44
node_cpu_seconds_total{cpu="1",mode="idle"}    90105.88
...
```

### ② 라벨 필터 — `{mode="idle"}`

중괄호 안의 조건은 SQL의 WHERE와 같다. 수십 개 시계열 중 **idle 줄만** 남긴다.

```
node_cpu_seconds_total{cpu="0",mode="idle"}    89412.51
node_cpu_seconds_total{cpu="1",mode="idle"}    90105.88
```

여전히 코어 수만큼 시계열이 남아 있다는 점에 주의하자.

### ③ `rate(...[1m])` — Counter를 비율로

1편의 주행거리계 비유를 그대로 쓰면 된다. 누적값 자체는 의미가 없고, **얼마나 빨리 늘고 있는지**가 의미다.

`rate(x[1m])`은 "최근 1분 동안 x가 **1초당 평균 얼마씩** 늘었나"를 계산한다. 그런데 이 메트릭의 단위가 절묘하다. 값 자체가 "초"라서, 초당 증가량은 **"1초 중 몇 초를 idle로 보냈나"**가 된다.

```
rate = 0.82   →   1초 중 0.82초를 놀았다   →   코어가 82% idle
```

Counter가 0~1 사이의 비율로 바뀌는 순간이다.

### ④ `avg by (instance)` — 코어를 서버로 합치기

아직 코어별로 값이 따로 논다. 차트에 그리고 싶은 건 코어가 아니라 **서버 한 대당 선 하나**다.

`avg by (instance)`는 "instance 라벨이 같은 것끼리 묶어 평균"이라는 뜻이다. instance는 Prometheus가 scrape할 때 붙여준 서버 주소 라벨이니, 결국 **서버별 평균 idle 비율**이 나온다.

```
{cpu="0", instance="srv1"}  0.82  ┐
{cpu="1", instance="srv1"}  0.90  ┘→  {instance="srv1"}  0.86
```

`by (instance)`가 빠지면 모든 서버가 하나의 값으로 뭉개진다. 서버별 선을 원한다면 이 부분이 필수다.

### ⑤ `* 100`, 그리고 `100 -` — 뒤집기

남은 건 산수다. 0.86이라는 비율을 `* 100`으로 86%로 만들고, 이건 **노는 비율**이니 `100 - 86 = 14%`로 뒤집으면 사용률이 된다.

```
89412.51 (누적 초)
   → rate →  0.82~0.90 (코어별 idle 비율)
   → avg  →  0.86      (서버 idle 비율)
   → ×100 →  86%       (idle)
   → 100- →  14%       (사용률)   ✔
```

이 다섯 단계가 끝이다. 괄호 지옥의 정체는 "필터 → 변화율 → 집계 → 단위 → 뒤집기"라는 평범한 데이터 가공 파이프라인이었다.

---

## 3. 메모리 사용률 — rate()가 없어서 짧다

```promql
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

CPU보다 훨씬 짧은 이유는 하나다. 두 메트릭이 모두 **Gauge**라서다.

`MemAvailable_bytes`는 "지금 사용 가능한 바이트", `MemTotal_bytes`는 "전체 바이트". 둘 다 현재값이라 변화율을 구할 필요가 없고, 그냥 나누면 된다.

```
6.4GB / 16GB = 0.40        (여유 비율)
1 - 0.40     = 0.60        (사용 비율)
× 100        = 60%         ✔
```

CPU와 구조를 비교해 보면 1편에서 말한 분기가 그대로 드러난다.

| | CPU | 메모리 |
|---|---|---|
| 메트릭 타입 | Counter | Gauge |
| rate() | 필요 | 불필요 |
| 쿼리 길이 | 길다 | 짧다 |

쿼리가 길고 짧은 건 난이도 문제가 아니라 **메트릭 타입의 문제**다. 이걸 알고 나면 처음 보는 쿼리도 "rate가 있네? 원본이 Counter구나"부터 읽을 수 있다.

한 가지 덧붙이면, 분모로 `MemFree`가 아니라 `MemAvailable`을 쓰는 데에도 이유가 있다. `MemFree`는 말 그대로 빈 메모리만 세지만, 리눅스는 남는 메모리를 캐시로 적극 활용하기 때문에 `MemFree`만 보면 항상 메모리가 부족해 보인다. `MemAvailable`은 "필요하면 즉시 회수해서 쓸 수 있는 양"이라 실제 체감과 맞는 값이다.

---

## 4. 네트워크 — rate() 다음은 단위 환산

```promql
rate(node_network_transmit_bytes_total[1m]) * 8 / 1024 / 1024    # 송신(TX)
rate(node_network_receive_bytes_total[1m])  * 8 / 1024 / 1024    # 수신(RX)
```

`_bytes_total`이라는 이름에서 보이듯 이것도 **Counter**다(누적 전송 바이트). 그래서 CPU와 똑같이 `rate()`부터 시작한다. 다른 점은 그다음이 "뒤집기"가 아니라 **단위 환산**이라는 것뿐이다.

```
9,812,400,128 B (누적)
   → rate     →  1,310,720 B/s     (초당 바이트)
   → × 8      →  10,485,760 b/s    (바이트 → 비트)
   → /1024/1024 → 10 Mbps          ✔
```

네트워크 속도는 관례상 바이트가 아니라 **비트** 단위(Mbps)로 말하기 때문에 `* 8`이 들어간다. 처음 보면 뜬금없는 8이지만 이유를 알면 당연한 숫자다.

송신과 수신은 별개 메트릭이라 쿼리도 두 개고, 대시보드에서도 보통 차트 두 장으로 나눠 그린다.

---

## 5. 서버 선택 — 쿼리에 라벨을 끼워 넣기

지금까지의 쿼리는 Prometheus가 아는 **모든 서버**를 대상으로 한다. 실제 대시보드에서는 사용자가 서버를 골라서 본다. 이건 새 쿼리를 만드는 게 아니라, 기존 쿼리의 라벨 필터에 조건을 하나 더하는 것으로 해결된다.

```promql
# 서버 한 대
node_cpu_seconds_total{mode="idle", name="srv1"}

# 여러 대 — =~ 는 정규식 매칭, | 는 OR
node_cpu_seconds_total{mode="idle", name=~"srv1|srv2|srv3"}
```

`=`는 정확히 일치, `=~`는 정규식이다. 서버 목록이 동적으로 바뀌는 화면이라면, 프론트엔드에서 선택된 서버 이름들을 `|`로 이어 붙여 쿼리 문자열에 주입하는 식으로 구현하게 된다. 실제로 내가 만든 대시보드도 사용자가 고른 호스트 목록을 받아 이 `name` matcher를 쿼리에 끼워 넣는 함수 하나로 처리하고 있다.

여기서 하나 미리 말해두면, `name`은 node_exporter가 기본으로 주는 라벨이 아니다. **수집 설정에서 직접 붙여야 하는 라벨**이고, 이걸 빼먹으면 쿼리는 멀쩡히 성공하는데 결과만 텅 빈, 꽤 헤매기 좋은 상황이 된다. [3편](/posts/prometheus-setup)에서 설정과 함께 다시 짚는다.

---

## 6. 차트용 질의 — query_range와 step

쿼리를 완성했으니 마지막으로, 이걸 **차트용으로** 호출하는 방법이다. Prometheus의 HTTP API에는 질의가 두 종류 있다.

- `/api/v1/query` — **지금 이 순간**의 값 하나 (instant query)
- `/api/v1/query_range` — **구간 전체**를 일정 간격으로 평가한 값들 (range query)

차트는 선을 그려야 하니 당연히 후자다.

```
GET /api/v1/query_range
    ?query=<위에서 만든 PromQL>
    &start=<시작 unix초>
    &end=<끝 unix초>
    &step=15s
```

`step`은 결과 점의 간격이다. start부터 end까지를 step 단위로 자르고, **각 지점마다 쿼리를 한 번씩 평가**해서 점을 찍는다. 4시간을 15s step으로 요청하면 점이 960개 나오는 식이다.

헷갈리기 쉬운 게 하나 있다. `rate(...[1m])`의 `[1m]`과 `step`은 **서로 다른 축**이다.

- `step` — 점을 **얼마나 촘촘히 찍을지** (결과 해상도)
- `[1m]` — 각 점을 계산할 때 **과거를 얼마나 돌아볼지** (lookback 구간)

step을 좁히면 점이 많아져 선이 부드러워지는 대신 계산량이 늘고, `[1m]`을 넓히면 순간 스파이크가 뭉개지는 대신 선이 안정된다. 보통 짧은 구간을 볼 땐 step을 좁게, 며칠 단위를 볼 땐 step을 넓게 잡는 식으로 트레이드오프를 조절한다.

---

## 정리

- CPU 사용률 쿼리는 "필터 → `rate()` → `avg by` → ×100 → 뒤집기"의 다섯 단계다. 복잡해 보이는 이유는 커널이 사용률이 아니라 **누적 시간**만 주기 때문이다.
- 메모리는 Gauge라 나눗셈으로 끝나고, 네트워크는 Counter라 `rate()` 후 단위 환산을 거친다. **쿼리의 생김새는 메트릭 타입이 결정한다.**
- 서버 선택은 라벨 matcher(`name=~"srv1|srv2"`)를 끼워 넣는 것으로, 차트용 데이터는 `query_range`에 start/end/step을 줘서 받는다.

이제 쿼리는 손에 들었는데, 정작 던질 Prometheus가 없다. [다음 편](/posts/prometheus-setup)에서는 node_exporter 설치부터 `prometheus.yml` 작성, 그리고 위에서 예고한 `name` 라벨 문제까지, 빈 서버에서 시작해 쿼리가 실제로 도는 상태까지 직접 만들어 본다.

---

[**← ① 개념 — 메트릭의 출발점**](/posts/prometheus-metrics-basics) &nbsp;|&nbsp; [**다음: ③ 셋업 — Prometheus 직접 구축하기 →**](/posts/prometheus-setup)
