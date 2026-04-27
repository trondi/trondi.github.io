---
title: "Kubernetes Job — 한 번 실행되고 끝나는 워크로드"
date: "2026-05-03"
summary: "DB 마이그레이션, 배치 처리처럼 '성공할 때까지 한 번만' 실행해야 하는 일에 Job을 쓴다. completions, parallelism, backoffLimit 세 필드의 조합이 핵심이다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - Job
  - Batch
  - Workload
featured: false
---

# Kubernetes Job — 한 번 실행되고 끝나는 워크로드

## Job이 필요한 순간

Deployment는 Pod가 죽으면 자동으로 다시 띄운다. 그런데 다음 같은 작업은 **성공하면 끝나야 한다**.

- DB 스키마 마이그레이션
- 일회성 데이터 백업/복구
- 배치 ETL 처리
- 보고서 생성

Pod를 직접 띄우면 실패 시 재시도가 안 되고, Deployment를 쓰면 Pod가 끝나도 계속 다시 살아난다. **Job이 정답이다**.

---

## 기본 YAML

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
spec:
  template:
    spec:
      restartPolicy: OnFailure   # Job에선 Always가 안 됨
      containers:
        - name: migrate
          image: my-app:1.0
          command: ["./migrate.sh"]
  backoffLimit: 4
```

Pod 템플릿은 같지만 `restartPolicy`가 `Always`(Deployment 기본값)가 아니라 `OnFailure` 또는 `Never`여야 한다.

---

## 핵심 필드 3개

### completions — 몇 번 성공해야 끝났다고 보는가

```yaml
spec:
  completions: 5   # 총 5번 성공해야 Job 완료
```

생략하면 1.

### parallelism — 동시에 몇 개 실행할 수 있는가

```yaml
spec:
  completions: 10
  parallelism: 3   # 3개씩 병렬로 처리해서 총 10개 성공시킴
```

### backoffLimit — 몇 번 실패하면 포기하는가

```yaml
spec:
  backoffLimit: 4
```

기본값 6. 실패 시 exponential backoff로 재시도한다(10초, 20초, 40초, ...).

---

## 세 가지 실행 패턴

### 1. 단일 작업 — 한 번만 성공

```yaml
spec:
  completions: 1   # 또는 생략
  parallelism: 1   # 또는 생략
```

DB 마이그레이션 같은 케이스.

### 2. 고정 작업 큐 — N개 처리

```yaml
spec:
  completions: 100
  parallelism: 5
```

100개 항목을 5개씩 동시 처리. Pod가 자기 인덱스를 알아야 한다 → `JOB_COMPLETION_INDEX` 환경변수 사용 (Indexed Job).

```yaml
spec:
  completionMode: Indexed
  completions: 100
  parallelism: 5
```

각 Pod는 `JOB_COMPLETION_INDEX=0..99` 환경변수를 받는다.

### 3. 워커 큐 — 외부 큐에서 가져오기

```yaml
spec:
  parallelism: 5
  # completions 생략
```

Pod들이 외부 큐(Redis, RabbitMQ 등)에서 작업을 가져와 처리. 큐가 비면 Pod가 종료, 모든 Pod가 종료되면 Job 완료.

---

## ttlSecondsAfterFinished — 자동 정리

Job이 끝나도 Pod와 Job 객체가 etcd에 남아 자원을 차지한다. TTL을 걸면 자동 삭제된다.

```yaml
spec:
  ttlSecondsAfterFinished: 3600   # 완료 1시간 뒤 삭제
```

---

## activeDeadlineSeconds — 시간 제한

```yaml
spec:
  activeDeadlineSeconds: 600   # 10분 안에 끝나야 함, 안 그러면 강제 종료
```

`backoffLimit`보다 우선한다.

---

## 자주 하는 실수

### restartPolicy: Always

```yaml
spec:
  template:
    spec:
      restartPolicy: Always   # ❌ 에러
```

Job에서는 OnFailure 또는 Never만 가능하다.

### Job 이름 재사용

같은 이름의 Job을 다시 만들 수 없다. CI/CD에서 매 배포마다 마이그레이션을 돌리려면 이름에 commit hash 등을 붙이거나, 매번 삭제 후 재생성해야 한다.

```bash
kubectl delete job db-migrate --ignore-not-found
kubectl apply -f migrate.yml
```

---

## 정리

"끝나는 일"은 Deployment가 아니라 Job이다. `completions × parallelism`으로 처리량을 조절하고, `backoffLimit`으로 재시도 한도를 설정한다. 다음 글에서는 Job을 **주기적으로** 실행하는 CronJob을 다룬다.
