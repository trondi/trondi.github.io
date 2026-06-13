---
title: "Prometheus 시리즈 ③ 셋업 — node_exporter부터 CORS까지 직접 구축하기"
date: "2026-06-13"
summary: "빈 서버에서 Prometheus가 도는 상태까지. node_exporter 설치, prometheus.yml 작성, 가장 헤매기 쉬운 name 라벨 함정, targets→graph→API 검증, 브라우저 직접 호출 시의 CORS·인증까지 직접 구축하며 정리했다."
category: "DevOps · Infra"
tags:
  - Prometheus
  - node_exporter
  - Docker
  - CORS
  - Monitoring
featured: false
---

# Prometheus 시리즈 ③ 셋업 — node_exporter부터 CORS까지 직접 구축하기

> 시리즈 순서: [개념](/posts/prometheus-metrics-basics) → [쿼리](/posts/prometheus-promql-resource-usage) → **셋업** → [프론트](/posts/prometheus-uplot-chart)

## 들어가며

[2편](/posts/prometheus-promql-resource-usage)까지 해서 쿼리는 손에 들었다. 문제는 던질 곳이 없다는 것이다. 이번 편에서는 빈 서버에서 시작해, 2편의 쿼리가 실제로 도는 상태까지 직접 만든다.

작업 순서는 데이터가 흐르는 방향 그대로다.

```
[각 서버]                  [모니터링 서버]              [브라우저]
node_exporter   ──scrape──▶  Prometheus     ◀──fetch──  대시보드
 :9100 설치 ①                :9090 설치+설정 ②③          연결 준비 ⑤
                              검증 ④
```

① 각 서버에 node_exporter 설치 → ② Prometheus 설치 → ③ 수집 설정(여기에 함정이 하나 있다) → ④ 검증 → ⑤ 브라우저에서 부를 준비(CORS)

---

## 1. node_exporter 설치 — 모니터링할 모든 서버에

[1편](/posts/prometheus-metrics-basics)에서 봤듯 메트릭의 출발점은 node_exporter다. **모니터링 대상 서버 전부에** 하나씩 깔아야 한다.

### 방법 A — 바이너리 + systemd (VM, 베어메탈)

```bash
# 다운로드 후 배치
wget https://github.com/prometheus/node_exporter/releases/download/v1.8.2/node_exporter-1.8.2.linux-amd64.tar.gz
tar xzf node_exporter-1.8.2.linux-amd64.tar.gz
sudo mv node_exporter-1.8.2.linux-amd64/node_exporter /usr/local/bin/

# 전용 유저 (로그인 불가 계정으로)
sudo useradd -rs /bin/false node_exporter
```

`/etc/systemd/system/node_exporter.service`:

```ini
[Unit]
Description=Node Exporter
After=network.target

[Service]
User=node_exporter
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now node_exporter
```

### 방법 B — Docker

```bash
docker run -d --name node_exporter --restart unless-stopped \
  --net="host" --pid="host" \
  -v "/:/host:ro,rslave" \
  quay.io/prometheus/node-exporter:latest \
  --path.rootfs=/host
```

옵션이 많아 보이지만 전부 이유가 있다. node_exporter는 **호스트의** CPU·메모리·디스크를 재야 하는데, 컨테이너 안에 가두면 컨테이너 자신을 재게 된다. 그래서 호스트의 네트워크(`--net=host`)와 프로세스 공간(`--pid=host`)을 그대로 쓰고, 호스트의 루트 파일시스템을 읽기 전용으로 들여다보는(`-v /:/host:ro`) 것이다.

### 확인

어느 방법이든, 설치가 끝났으면 1편에서 봤던 그 평문이 진짜로 나오는지 본다.

```bash
curl -s http://localhost:9100/metrics | head
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 89412.51
...
```

이 텍스트가 보이면 절반은 끝났다.

> 한 가지, 9100 포트는 **Prometheus 서버에서만 접근 가능하게** 방화벽을 잡아두자. 메트릭에는 서버 내부 정보가 꽤 들어 있어서 전체 공개할 물건이 아니다.

---

## 2. Prometheus 설치 — 설정 파일은 하나뿐이다

Prometheus 본체는 모니터링 서버 한 대에 띄운다. 핵심은 설정 파일 `prometheus.yml` 하나가 전부라는 점이다.

```yaml
# prometheus.yml
global:
  scrape_interval: 15s        # 기본 수집 주기

scrape_configs:
  - job_name: 'node'          # job="node" 라벨로 붙는다
    static_configs:
      - targets:
          - '10.0.0.1:9100'   # 1번에서 깐 서버들
          - '10.0.0.2:9100'
```

1편의 Pull 모델이 설정으로 그대로 드러난다. "이 주소들을 15초마다 긁어라"가 전부다.

실행은 Docker Compose가 제일 간편하다.

```yaml
# docker-compose.yml
services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prom_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=15d'    # 보관 기간 (기본 15일)
      - '--web.enable-lifecycle'               # 설정 핫리로드 허용

volumes:
  prom_data:
```

```bash
docker compose up -d
```

`--web.enable-lifecycle`을 켜두면 설정을 바꿀 때마다 재시작할 필요 없이 리로드만 하면 된다.

```bash
curl -X POST http://localhost:9090/-/reload
```

---

## 3. 함정 — `name` 라벨은 알아서 생기지 않는다

[2편](/posts/prometheus-promql-resource-usage) 끝에서 예고했던 그 문제다.

2편에서 서버 선택을 이렇게 했다.

```promql
node_cpu_seconds_total{mode="idle", name=~"srv1|srv2"}
```

그런데 위 설정대로만 띄우면 이 쿼리는 **항상 빈 결과**를 돌려준다. 에러도 안 난다. 쿼리는 성공하고, 결과만 없다. 차트에는 "데이터 없음"만 뜨고, 쿼리를 아무리 들여다봐도 문법은 멀쩡하다. 꽤 오래 헤매기 좋은 상황이다.

원인은 단순하다. **`name`이라는 라벨을 아무도 만든 적이 없기 때문이다.** node_exporter가 주는 라벨은 `cpu`, `mode` 같은 것들이고, Prometheus가 붙여주는 건 `instance`(주소)와 `job`뿐이다. `name=~"srv1|..."`라는 조건은 존재하지 않는 라벨에 대한 필터라서 매칭되는 시계열이 0개인 것이다.

해결은 수집 설정에서 타겟마다 라벨을 직접 달아주는 것이다.

```yaml
scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['10.0.0.1:9100']
        labels:
          name: 'srv1'          # 이 타겟의 모든 메트릭에 name="srv1"이 붙는다
      - targets: ['10.0.0.2:9100']
        labels:
          name: 'srv2'
```

이렇게 하면 srv1에서 긁어온 모든 시계열에 `name="srv1"`이 도장처럼 찍히고, 2편의 쿼리가 비로소 동작한다.

여기서 중요한 건 **이 라벨 값이 대시보드 쪽 서버 이름과 정확히 일치해야 한다**는 점이다. 대시보드에서 사용자가 "srv1"을 고르면 그 문자열이 그대로 쿼리에 들어가므로, 한쪽은 `srv1`이고 한쪽은 `SRV-01`이면 또 조용히 빈 결과만 받게 된다. 라벨 이름을 `name`으로 할지 `hostname`으로 할지는 자유지만, **양쪽이 같은 약속을 쓰는지**는 반드시 확인하자.

---

## 4. 검증 — 세 단계로 확인한다

다 띄웠으면 차트 붙이기 전에 Prometheus 단에서 먼저 확인한다. 프론트엔드까지 연결한 다음에 "안 나오는데?"가 되면 원인 후보가 너무 많아진다. 단계마다 끊어서 보자.

**1) 타겟 상태 — `http://모니터링서버:9090/targets`**

등록한 타겟이 전부 **UP**(초록)인지 본다. DOWN이면 십중팔구 방화벽이거나 주소 오타다. 1편에서 말한 Pull 모델의 장점이 여기서 나온다. 긁으러 갔다 실패한 기록이 그대로 남아 있어서, 어느 서버가 왜 안 되는지 이 화면에서 바로 보인다.

**2) 쿼리 테스트 — `http://모니터링서버:9090/graph`**

내장 UI에 2편의 쿼리를 그대로 넣어본다.

```promql
100 - avg by (instance)(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100
```

그래프가 그려지면 수집·저장·질의가 다 정상이라는 뜻이다. `name` 라벨도 여기서 확인한다. `node_cpu_seconds_total{name="srv1"}`을 넣어 결과가 나오는지 보면 된다.

**3) API 직접 호출 — 프론트엔드가 쓸 바로 그 엔드포인트**

```bash
curl 'http://모니터링서버:9090/api/v1/query_range?query=up&start=1718000000&end=1718003600&step=15s'
```

`"status":"success"`와 함께 JSON이 돌아오면, [4편](/posts/prometheus-uplot-chart)에서 프론트엔드가 부를 통로까지 뚫린 것이다.

---

## 5. 브라우저에서 부를 준비 — CORS와 노출 범위

이 시리즈의 최종 형태는 **브라우저가 Prometheus API를 직접 fetch하는** 구조다(중간에 백엔드 프록시를 두는 방법도 있지만, 그 얘기는 잠시 뒤에). 브라우저가 직접 부른다면 두 가지를 미리 챙겨야 한다.

### CORS

대시보드는 `https://dashboard.example.com`에 떠 있고 Prometheus는 `:9090`에 있으니, 브라우저 입장에서는 교차 출처 요청이다. Prometheus는 `--web.cors.origin` 플래그로 허용 출처를 제어하는데, 기본값이 `.*`(전체 허용)라서 보통은 그냥 된다. 다만 운영에서는 좁혀두는 게 맞다.

```yaml
command:
  - '--web.cors.origin=https://dashboard\.example\.com'   # 정규식
```

여기가 막히면 증상이 특이하다. `curl`로는 잘 되는데 **브라우저에서만** 콘솔에 CORS 에러가 뜬다. "서버에선 되는데 브라우저에서 안 된다"면 십중팔구 이것이다.

### 노출 범위 — Prometheus에는 인증이 없다

더 중요한 쪽은 이것이다. Prometheus는 **기본적으로 인증이 없다.** 주소만 알면 누구나 모든 메트릭을 쿼리할 수 있다. 그런데 브라우저가 직접 부르는 구조에서는 Prometheus 주소가 프론트엔드 코드에 노출될 수밖에 없다.

그래서 실무에서는 보통 둘 중 하나를 택한다.

- **사설망 + 리버스 프록시** — Prometheus 자체는 내부망에만 두고, 앞에 nginx 같은 프록시를 세워 인증과 HTTPS를 처리한다. 브라우저는 프록시 주소만 안다.
- **백엔드 프록시** — 프론트엔드는 자기 백엔드의 API만 부르고, 백엔드가 내부에서 Prometheus에 질의해 결과를 중계한다. CORS 문제도 같이 사라진다.

사내망 전용 대시보드라면 직접 호출로 시작해도 무방하지만, 외부에서 접근 가능한 서비스라면 둘 중 하나는 반드시 거치자.

---

## 부록 — 로컬에서 한 번에 띄워보기

본인 머신에서 일단 굴려보고 싶다면, node_exporter와 Prometheus를 compose 하나로 묶으면 된다.

```yaml
# docker-compose.yml
services:
  node_exporter:
    image: quay.io/prometheus/node-exporter:latest
    pid: host
    volumes: [ "/:/host:ro,rslave" ]
    command: [ "--path.rootfs=/host" ]

  prometheus:
    image: prom/prometheus:latest
    ports: [ "9090:9090" ]
    volumes: [ "./prometheus.yml:/etc/prometheus/prometheus.yml:ro" ]
```

```yaml
# prometheus.yml — 같은 compose 네트워크라 서비스 이름으로 접근
scrape_configs:
  - job_name: 'node'
    static_configs:
      - targets: ['node_exporter:9100']
        labels:
          name: 'local'
```

`docker compose up -d` 후 `localhost:9090/graph`에서 2편 쿼리를 넣어보면, 자기 머신의 CPU 사용률이 바로 그려진다.

---

## 정리

- 모니터링 대상 서버마다 **node_exporter**(:9100)를 깔고, 모니터링 서버에 **Prometheus**(:9090)를 띄운다. 설정은 `prometheus.yml` 하나다.
- **`name` 같은 식별 라벨은 수집 설정에서 직접 달아야 한다.** 안 달면 에러 없이 빈 결과만 나오는, 가장 헤매기 좋은 함정이다. 대시보드 쪽 이름과 일치하는지도 함께 확인하자.
- 검증은 **targets → graph → API** 순서로, 프론트엔드를 붙이기 전에 끝낸다.
- 브라우저 직접 호출이라면 **CORS**를, 외부 노출이라면 **프록시를 통한 인증**을 챙긴다.

이제 인프라는 다 깔렸다. `query_range`가 JSON을 돌려주는 것까지 확인했으니, 남은 건 이 JSON을 받아 차트로 바꾸는 일이다. [다음 편](/posts/prometheus-uplot-chart)에서는 Prometheus 응답이 차트 라이브러리가 원하는 모양과 어떻게 다른지, 그리고 그 사이를 잇는 변환을 uPlot 기준으로 만들어 본다.

---

[**← ② 쿼리 — PromQL로 사용량 뽑아내기**](/posts/prometheus-promql-resource-usage) &nbsp;|&nbsp; [**다음: ④ 프론트 — uPlot 차트로 그리기 →**](/posts/prometheus-uplot-chart)
