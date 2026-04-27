---
title: "Kubernetes CronJob — 정해진 시간마다 Job을 만드는 스케줄러"
date: "2026-05-04"
summary: "CronJob은 Job을 직접 실행하지 않는다. 스케줄에 따라 Job 객체를 만들 뿐이다. concurrencyPolicy와 startingDeadlineSeconds를 잘못 쓰면 같은 작업이 중복 실행되는 사고가 난다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - CronJob
  - Schedule
  - Workload
featured: false
---

# Kubernetes CronJob — 정해진 시간마다 Job을 만드는 스케줄러

## CronJob의 정확한 정의

CronJob은 직접 컨테이너를 실행하지 않는다. **스케줄 시간이 되면 Job 객체를 생성**할 뿐이다.

```
CronJob ──매 시간 정각──▶ Job 생성 ──▶ Pod 실행
```

이 한 단계를 분리해 둠으로써:

- Job의 모든 기능(parallelism, retry 등)을 그대로 사용
- 과거 실행 이력을 Job 객체로 보관
- 동시 실행 정책을 별도로 정의

---

## 기본 YAML

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-backup
spec:
  schedule: "0 3 * * *"      # 매일 새벽 3시
  timeZone: "Asia/Seoul"      # 1.27+ 정식 지원
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: my-backup:1.0
              command: ["./backup.sh"]
      backoffLimit: 2
```

`spec.jobTemplate`이 통째로 Job의 spec이다.

---

## Cron 표현식

```
 ┌───── minute (0-59)
 │ ┌───── hour (0-23)
 │ │ ┌───── day of month (1-31)
 │ │ │ ┌───── month (1-12)
 │ │ │ │ ┌───── day of week (0-6, 0=Sun)
 │ │ │ │ │
 * * * * *
```

자주 쓰는 패턴:

| 표현 | 의미 |
|---|---|
| `0 * * * *` | 매시 정각 |
| `*/15 * * * *` | 15분마다 |
| `0 9 * * 1-5` | 평일 오전 9시 |
| `@daily` | `0 0 * * *`의 별칭 |

---

## TimeZone

1.27 이전에는 클러스터 시간(보통 UTC) 기준이라, 한국 시간 새벽 3시는 `0 18 * * *`처럼 변환해야 했다. 1.27부터 `spec.timeZone` 필드로 명시 가능.

```yaml
spec:
  timeZone: "Asia/Seoul"
  schedule: "0 3 * * *"
```

---

## concurrencyPolicy — 가장 중요한 필드

이전 실행이 끝나기 전에 다음 실행 시간이 도래하면?

```yaml
spec:
  concurrencyPolicy: Allow   # 기본값: 동시에 여러 개 실행
```

| 정책 | 동작 |
|---|---|
| Allow | 그냥 새로 만든다 (중복 실행 가능) |
| Forbid | 이전 Job이 끝날 때까지 새 Job을 만들지 않는다 |
| Replace | 이전 Job을 죽이고 새로 만든다 |

DB 백업처럼 멱등성이 중요하지 않은 작업은 `Forbid`가 안전하다.

---

## startingDeadlineSeconds — 늦은 실행 처리

CronJob 컨트롤러가 일시적으로 멈춰서 예정된 실행을 놓쳤을 때, 얼마나 늦게라도 따라잡을지 결정한다.

```yaml
spec:
  startingDeadlineSeconds: 100   # 100초 안에 따라잡지 못하면 그 실행은 건너뛴다
```

생략하면 무제한이라 누락된 실행을 한꺼번에 다 만들어버려 폭주할 수 있다. **반드시 명시하자**.

---

## 이력 관리

```yaml
spec:
  successfulJobsHistoryLimit: 3   # 성공한 Job 보존 개수 (기본 3)
  failedJobsHistoryLimit: 1       # 실패한 Job 보존 개수 (기본 1)
```

`0`으로 설정하면 즉시 삭제된다.

---

## 일시 정지

```yaml
spec:
  suspend: true
```

또는:

```bash
kubectl patch cronjob nightly-backup -p '{"spec":{"suspend":true}}'
```

CronJob을 지우지 않고 잠시 멈추고 싶을 때.

---

## 자주 하는 실수

### Cron 표현식의 timezone

`timeZone` 미설정 + UTC 클러스터 + 한국 시간 새벽 3시를 원한다면 → `0 3` 아니라 `0 18`. 한 번쯤 다 겪는 실수.

### 멱등성 없는 작업에 Allow

배치가 5분 안에 끝난다고 가정하고 매 5분 스케줄을 잡았는데, 1번 실행이 6분 걸려서 2번이 동시에 실행되어 중복 처리. → `Forbid`로 해결.

### startingDeadlineSeconds 생략

클러스터가 1시간 다운됐다 살아나니, 누락된 60번의 실행을 한꺼번에 만들어 폭주. → 합리적인 값 명시.

---

## 정리

CronJob은 **Job 생성기**다. 스케줄, 동시성 정책, 늦은 실행 처리 — 이 세 축을 잘못 잡으면 운영 사고로 이어진다. Job/CronJob까지가 워크로드 영역이고, 다음 글부터는 워크로드를 외부에 노출하는 **Service**, **Ingress**를 다룬다.
