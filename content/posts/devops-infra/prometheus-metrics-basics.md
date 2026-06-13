---
title: "Prometheus 시리즈 ① 개념 — 서버의 CPU·메모리 사용량은 어디서 오는가"
date: "2026-06-11"
summary: "차트에 찍히는 'CPU 14%'는 어디서 오는가. node_exporter의 /metrics, Counter와 Gauge의 차이, Prometheus의 Pull 모델과 TSDB 저장 구조를 코드 이전의 개념부터 정리했다."
category: "DevOps · Infra"
tags:
  - Prometheus
  - node_exporter
  - Monitoring
  - TSDB
  - 시계열
featured: false
---

# Prometheus 시리즈 ① 개념 — 서버의 CPU·메모리 사용량은 어디서 오는가

> 시리즈 순서: **개념** → [쿼리](/posts/prometheus-promql-resource-usage) → [셋업](/posts/prometheus-setup) → [프론트](/posts/prometheus-uplot-chart)

## 들어가며

서버 모니터링 대시보드를 만들다 보면 누구나 한 번쯤 멈칫한다.

> "이 **CPU 14%**라는 숫자, 대체 어디서 오는 거지?"

차트 라이브러리는 숫자만 받아 선을 그릴 뿐이다. 그 숫자의 진짜 출발점은 한참 뒤에 있다. 이 글에서는 차트에 닿기까지의 **전체 여정**을, 코드를 짜기 전에 머릿속에 그려본다. 이 한 편만 읽어도 "메트릭이 어디서 태어나 어떻게 저장되는지"가 잡힌다.

---

## 1. 큰 그림 — 4단계 파이프라인

서버의 숫자 하나가 차트의 점 하나가 되기까지는 네 단계를 거친다.

```
[각 서버]                  [모니터링 서버]              [브라우저]
node_exporter   ──scrape──▶  Prometheus     ◀──query──  차트
 :9100 /metrics   (주기적)     :9090          (HTTP API)
 측정값을 노출               수집·저장·질의            선 그래프
   ①                          ② ③                      ④
```

| 단계 | 누가 | 무엇을 |
|---|---|---|
| ① 노출 | **node_exporter** | 서버 상태를 텍스트 메트릭으로 내놓는다 |
| ② 수집 | **Prometheus** | 그 텍스트를 주기적으로 긁어온다(scrape) |
| ③ 저장·질의 | **Prometheus** | 시계열 DB에 저장하고 PromQL로 가공한다 |
| ④ 렌더 | **차트** | 가공된 값을 선으로 그린다 |

이 글은 **①과 ②③의 저장 부분**, 즉 "메트릭의 탄생과 보관"을 다룬다. PromQL 가공(③의 질의)은 [2편 쿼리](/posts/prometheus-promql-resource-usage), 직접 구축은 [3편 셋업](/posts/prometheus-setup), 차트 렌더는 [4편 프론트](/posts/prometheus-uplot-chart)다.

---

## 2. node_exporter — 서버에 상주하는 "측정기"

Prometheus는 사실 **서버의 CPU나 메모리를 직접 모른다.** 그 일은 각 서버에 깔린 **exporter**가 한다. 가장 대표적인 게 **node_exporter**다. 리눅스의 `/proc`, `/sys`를 읽어 하드웨어/커널 상태를 숫자로 바꿔주는 작은 데몬이다.

node_exporter는 기본 포트 **9100**에서 `/metrics`라는 HTTP 엔드포인트 하나를 연다. 브라우저로 `http://서버:9100/metrics`를 열면, 놀랍게도 그냥 **평문 텍스트**가 쏟아진다.

```text
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"}    89412.51
node_cpu_seconds_total{cpu="0",mode="user"}     1203.44
node_cpu_seconds_total{cpu="0",mode="system"}    512.10
node_cpu_seconds_total{cpu="1",mode="idle"}    90105.88
...
# TYPE node_memory_MemAvailable_bytes gauge
node_memory_MemAvailable_bytes   6871947264
node_memory_MemTotal_bytes      16777216000
```

화려한 API가 아니라 이렇게 단순한 텍스트라는 점이 Prometheus 생태계의 핵심 철학이다. **어떤 언어로든 `메트릭이름 값` 한 줄만 출력할 수 있으면 메트릭을 노출할 수 있다.**

### 한 줄 = 하나의 시계열

이 텍스트의 문법은 딱 하나다.

```
메트릭이름{라벨="값", 라벨="값"}   숫자값
```

그리고 **이 한 줄이 곧 하나의 "시계열(time series)"**이다. `node_cpu_seconds_total{cpu="0",mode="idle"}`와 `node_cpu_seconds_total{cpu="0",mode="user"}`는 이름은 같아도 라벨이 다르므로 **서로 완전히 다른 시계열**이다.

### 라벨 곱셈 — 한 메트릭이 수십 줄이 되는 이유

위에서 `node_cpu_seconds_total`이 왜 여러 줄일까. **CPU 코어 수 × mode 수**만큼 줄이 생기기 때문이다.

```
8개 코어 × 8개 mode(idle, user, system, iowait, ...) = 64개 시계열
```

이게 라벨의 힘이자 함정이다. 나중에 PromQL에서 우리는,
- `{mode="idle"}`로 **idle 줄만** 골라내고,
- 여러 코어를 **다시 하나로 합쳐** 서버 단위 값을 만든다.

> 이 "고르고 합치는" 과정이 바로 [2편](/posts/prometheus-promql-resource-usage)의 주제다.

라벨에는 두 종류가 있다.

| 라벨 | 예 | 누가 붙이나 |
|---|---|---|
| 메트릭 자체 차원 | `cpu="0"`, `mode="idle"`, `device="eth0"` | node_exporter |
| 수집 시 부착 | `instance="10.0.0.1:9100"`, `job="node"` | Prometheus |

`instance`와 `job`은 node_exporter가 만든 게 아니라, **Prometheus가 긁어올 때 "이건 어느 서버에서 왔다"고 자동으로 도장 찍어주는** 라벨이다.

---

## 3. Counter vs Gauge — 이 구분이 모든 걸 가른다

메트릭을 처음 볼 때 반드시 익혀야 할 단 하나의 개념이 있다. 위 텍스트에 적혀 있던 `# TYPE ... counter`와 `# TYPE ... gauge`다.

### Gauge — 그 순간의 값

```
node_memory_MemAvailable_bytes   6871947264
```

**지금 이 순간** 사용 가능한 메모리 바이트다. 시간이 지나면 오르락내리락한다. 온도계나 속도계 같은 거라, **그 값 자체가 의미**가 있다. 그대로 쓰면 된다.

### Counter — 계속 쌓이는 누적값

```
node_cpu_seconds_total{mode="idle"}   89412.51   →   89427.83   →   89442.10 ...
```

**재부팅 전까지 단조 증가**하는 누적 합계다. "지금까지 idle로 보낸 **총 누적 초**"다. 자동차의 누적 주행거리계(오도미터)와 같다.

여기서 핵심 통찰 하나.

> **누적 주행거리 "120,000km"는 당신이 지금 빠른지 느린지 말해주지 않는다.**
> 속도를 알려면 "1초 전엔 119,999.97km였으니 → 시속 약 100km"처럼 **변화율**을 계산해야 한다.

Counter도 똑같다. `89412 → 89427`(15초 동안 +15)이라는 변화율을 봐야 "이 CPU는 1초 중 1초를 idle로 놀았다 = 거의 안 바빴다"를 알 수 있다. 이 변화율을 구하는 PromQL 함수가 바로 **`rate()`**이고, [2편](/posts/prometheus-promql-resource-usage)의 주인공이다.

| | Gauge | Counter |
|---|---|---|
| 성격 | 현재 스냅샷 | 누적 합계(단조 증가) |
| 비유 | 속도계 | 주행거리계 |
| 예시 | `MemAvailable_bytes` | `cpu_seconds_total`, `network_*_bytes_total` |
| 쓰는 법 | 그대로 사용 | `rate()`로 변화율 계산 |

**이 표 하나가 다음 편 전체를 이해하는 열쇠다.** CPU와 네트워크 쿼리가 복잡해 보이는 이유는 전부 Counter라 `rate()`를 거쳐야 하기 때문이고, 메모리 쿼리가 단순한 이유는 Gauge라 그냥 나누면 되기 때문이다.

---

## 4. Pull 모델 — Prometheus가 직접 "가지러 간다"

많은 모니터링 시스템은 각 서버가 중앙으로 데이터를 **보낸다(push).** Prometheus는 반대다. **Prometheus가 각 서버의 `/metrics`를 주기적으로 직접 긁어온다(pull).**

```
Prometheus  ──"지금 상태 줘"──▶  node_exporter (:9100/metrics)
            ◀──평문 메트릭 응답──
   (15초마다 반복)
```

설정에는 "누구를, 얼마나 자주" 긁을지를 적는다([3편](/posts/prometheus-setup)에서 직접 작성한다).

```yaml
scrape_configs:
  - job_name: 'node'
    scrape_interval: 15s          # 15초마다
    static_configs:
      - targets: ['10.0.0.1:9100', '10.0.0.2:9100']   # 이 서버들을
```

Pull 모델의 장점은 직관적이다. **"긁으러 갔는데 응답이 없다 = 그 서버가 죽었다"**를 Prometheus가 바로 안다. 타겟의 생사(up/down)가 공짜로 따라오는 셈이다.

---

## 5. TSDB — 긁어온 값은 어떻게 저장되나

Prometheus는 긁어온 값을 자체 **시계열 데이터베이스(TSDB)**에 저장한다. 저장 구조는 딱 두 단어로 이해된다.

- **Series(시계열)**: `메트릭이름 + 라벨조합`으로 **유일하게 식별**되는 하나의 선.
  예) `node_cpu_seconds_total{cpu="0",mode="idle",instance="10.0.0.1:9100"}`
- **Sample(샘플)**: 그 series 위에 찍히는 한 점 = `(타임스탬프, 숫자값)`.

즉 거대한 표를 상상하면 된다.

```
Series A  ─●──●──●──●──●──▶   각 ●이 (시각, 값) 샘플
Series B  ─●──●──●──●──●──▶
Series C  ─●──●──●──●──●──▶
           15s 간격으로 한 점씩 쌓인다
```

15초마다 scrape할 때마다, **모든 series에 점이 하나씩** 추가된다. 이렇게 쌓인 점들을 시간 축으로 이으면 — 그게 바로 우리가 차트에서 보는 **선**이다.

한 가지만 미리 봐두자. Prometheus에 질의하면 결과가 series마다 `[시각, 값]` 쌍의 배열로 돌아온다.

```json
{
  "metric": { "instance": "10.0.0.1:9100" },
  "values": [ [1718000000, "13.9"], [1718000015, "14.2"] ]
}
```

그런데 차트 라이브러리, 특히 uPlot이 원하는 데이터 모양은 이것과 꽤 다르다. 이 차이를 메우는 변환이 프론트엔드 쪽 일의 절반쯤 되는데, 그 얘기는 [4편](/posts/prometheus-uplot-chart)에서 한다.

---

## 정리

길게 돌아왔지만, 결국 기억할 건 세 가지다.

- 서버의 CPU·메모리 값은 **node_exporter**가 `/metrics`에 평문으로 내놓는다. 이 텍스트의 한 줄이 곧 하나의 시계열이고, 라벨 조합 때문에 메트릭 하나가 수십 줄로 갈라진다.
- 메트릭에는 **Counter와 Gauge** 두 종류가 있다. Counter는 누적값이라 `rate()`로 변화율을 봐야 하고, Gauge는 현재값이라 그대로 쓴다. 이 차이가 다음 편 쿼리의 난이도를 가른다.
- Prometheus는 이 값을 **직접 긁어와(pull)** 시계열 DB에 `(시각, 값)` 샘플로 차곡차곡 쌓는다.

차트에 찍히는 점 하나하나가 사실은 이렇게 먼 길을 거쳐 온 셈이다.

---

## 다음 편에서

메트릭이 어디에 쌓이는지는 알았으니, 다음은 꺼내 쓸 차례다. [2편](/posts/prometheus-promql-resource-usage)에서 다룰 건 결국 이 쿼리 한 줄이다.

```promql
100 - avg by (instance)( rate(node_cpu_seconds_total{mode="idle"}[1m]) ) * 100
```

처음 보면 암호처럼 생겼지만, 뜯어보면 별거 없다. 이 글에서 배운 Counter를 `rate()`로 풀고 → 코어별 값을 하나로 합치고 → idle을 뒤집으면 끝이다. 이 과정을 직접 만져볼 수 있는 시각화와 함께 한 단계씩 풀어보겠다.

---

**← 이전 글 없음** &nbsp;|&nbsp; [**다음: ② 쿼리 — PromQL로 사용량 뽑아내기 →**](/posts/prometheus-promql-resource-usage)
