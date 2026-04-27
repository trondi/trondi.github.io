---
title: "Kubernetes LimitRange — Pod/Container 단위 기본값과 상하한 강제"
date: "2026-05-13"
summary: "ResourceQuota는 총합을 제한한다. LimitRange는 개별 객체에 기본값을 채우고 상하한을 강제한다. 둘이 짝을 이뤄야 멀티테넌시가 굴러간다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - LimitRange
  - Resource Management
  - Multi-tenancy
featured: false
---

# Kubernetes LimitRange — Pod/Container 단위 기본값과 상하한 강제

## LimitRange가 필요한 이유

ResourceQuota를 활성화하면 모든 Pod가 requests/limits를 명시해야 한다. 그런데 모든 개발자가 매번 그걸 적게 하는 건 비현실적이다.

**LimitRange**는:

1. requests/limits를 적지 않은 컨테이너에 **기본값을 자동으로 채운다**
2. 너무 작거나 큰 값을 **상한/하한으로 강제**한다
3. PVC의 storage 요청량에도 동일하게 적용 가능

ResourceQuota(총합 상한)와 LimitRange(개별 기본값/상하한)가 짝을 이뤄야 멀티테넌시가 굴러간다.

---

## 기본 YAML

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: team-defaults
  namespace: team-frontend
spec:
  limits:
    - type: Container
      default:                   # limits에 자동 채워질 값
        cpu: "500m"
        memory: 512Mi
      defaultRequest:            # requests에 자동 채워질 값
        cpu: "100m"
        memory: 128Mi
      min:                       # 최소 허용
        cpu: "50m"
        memory: 64Mi
      max:                       # 최대 허용
        cpu: "2"
        memory: 2Gi
      maxLimitRequestRatio:      # limit / request 비율 제한
        cpu: "10"

    - type: Pod
      max:
        cpu: "4"
        memory: 4Gi

    - type: PersistentVolumeClaim
      min:
        storage: 1Gi
      max:
        storage: 100Gi
```

---

## type 별 동작

### Container

가장 흔한 케이스. 컨테이너 단위로 자원 제한.

- `default` → limits에 채워짐
- `defaultRequest` → requests에 채워짐
- `min`/`max` → 위반 시 Pod 생성 거부
- `maxLimitRequestRatio` → `limit/request` 비율 상한

### Pod

Pod 전체(모든 컨테이너 합계)에 대한 제한.

```yaml
- type: Pod
  max:
    cpu: "4"
    memory: 4Gi
```

한 Pod에 컨테이너가 10개여도 합쳐서 4 CPU, 4Gi 메모리를 못 넘는다.

### PersistentVolumeClaim

```yaml
- type: PersistentVolumeClaim
  min:
    storage: 1Gi
  max:
    storage: 100Gi
```

PVC 하나의 storage 요청 범위. 100Gi 넘는 요청 시 거부.

---

## 동작 순서

```
사용자 Pod YAML 제출
    │
    ├─ resources.requests/limits 없음
    │   └─ LimitRange의 defaultRequest/default로 자동 채움
    │
    ├─ 채워진 값이 min/max 범위 안인가?
    │   └─ 아니면 Admission 거부
    │
    └─ ResourceQuota 검사 (Namespace 총합 초과 안 하는가?)
```

---

## 실전 패턴 — Quota + LimitRange 짝

```yaml
# 1) Namespace
apiVersion: v1
kind: Namespace
metadata:
  name: team-frontend
---
# 2) LimitRange — 개별 기본값
apiVersion: v1
kind: LimitRange
metadata:
  name: defaults
  namespace: team-frontend
spec:
  limits:
    - type: Container
      defaultRequest:
        cpu: "100m"
        memory: 128Mi
      default:
        cpu: "500m"
        memory: 512Mi
      max:
        cpu: "2"
        memory: 2Gi
---
# 3) ResourceQuota — 총합 상한
apiVersion: v1
kind: ResourceQuota
metadata:
  name: quota
  namespace: team-frontend
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    pods: "50"
```

이 셋을 함께 적용하면:

- 개발자는 requests/limits를 안 적어도 LimitRange가 채워줌
- 채워진 값은 max를 못 넘음
- 네임스페이스 전체 사용량은 Quota를 못 넘음

운영에서 가장 흔한 멀티테넌시 패턴이다.

---

## 자주 하는 실수

### LimitRange 없이 Quota만

requests/limits를 안 적은 Pod가 거부된다. 개발자 컴플레인 폭주. **LimitRange를 먼저 깔자**.

### default와 max 불일치

```yaml
default:
  memory: 1Gi
max:
  memory: 512Mi   # default가 max보다 큼
```

이러면 모든 Pod가 거부된다. (default가 채워진 후 max 검사에 걸림)

### maxLimitRequestRatio 너무 빡빡

```yaml
maxLimitRequestRatio:
  cpu: "2"
```

burst 트래픽 대응을 위해 limit를 request의 4-5배로 설정하는 패턴이 흔한데, ratio가 2면 막힌다. 운영 패턴을 보고 정하자.

---

## 정리

| 리소스 | 적용 단위 | 역할 |
|---|---|---|
| ResourceQuota | Namespace 총합 | 상한선 |
| LimitRange | Pod/Container/PVC 개별 | 기본값 + 상하한 |

둘이 함께 있어야 멀티테넌시 클러스터가 안정적으로 굴러간다.

---

## 시리즈 마무리

Namespace부터 LimitRange까지 16개 리소스를 하나씩 봤다. 다음 글에서는 이 모든 리소스가 **하나의 실서비스 YAML**에서 어떻게 엮이는지, 그리고 **아키텍처 다이어그램**으로 어떻게 정리되는지 본다.
