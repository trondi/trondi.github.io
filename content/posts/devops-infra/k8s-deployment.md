---
title: "Kubernetes Deployment — 무중단 배포의 표준 워크로드"
date: "2026-04-30"
summary: "Deployment가 ReplicaSet을 만들고, ReplicaSet이 Pod를 만든다. 이 한 단계를 더 둠으로써 RollingUpdate, Rollback, History가 가능해지는 구조를 분석한다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - Deployment
  - Rolling Update
  - Workload
featured: false
---

# Kubernetes Deployment — 무중단 배포의 표준 워크로드

## Deployment가 하는 일

Deployment는 **Stateless 애플리케이션을 선언적으로 배포/업데이트/롤백**하기 위한 워크로드다.

핵심은 직접 Pod를 만들지 않는다는 점이다.

```
Deployment ──생성──▶ ReplicaSet ──생성──▶ Pod
```

이 한 단계를 거침으로써:

- 이미지를 바꾸면 새 ReplicaSet을 만들고, 옛 ReplicaSet을 점진적으로 줄인다 → **RollingUpdate**
- 옛 ReplicaSet이 한동안 남아있어서 → **Rollback** 가능
- 변경 이력이 보존되어 → **revision history**

---

## 기본 YAML

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web   # selector와 일치해야 함
    spec:
      containers:
        - name: app
          image: nginx:1.27
          ports:
            - containerPort: 80
          resources:
            requests: { cpu: "100m", memory: "128Mi" }
            limits:   { cpu: "500m", memory: "256Mi" }
```

`spec.template`은 결국 Pod 정의다. Deployment는 이 템플릿대로 Pod를 N개 유지한다.

---

## Rolling Update 전략

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%        # 추가로 띄울 수 있는 Pod 비율
      maxUnavailable: 25%  # 동시에 죽일 수 있는 Pod 비율
```

이 두 값이 **무중단 배포의 핵심**이다.

- `maxSurge` 0, `maxUnavailable` 1 → 기존 Pod를 먼저 죽이고 새 Pod를 띄움 (자원 절약, 일시적 capacity 감소)
- `maxSurge` 1, `maxUnavailable` 0 → 새 Pod를 먼저 띄우고 기존 Pod를 죽임 (안전, 자원 일시 증가)

`type: Recreate`로 바꾸면 옛 Pod 전부 죽인 뒤 새 Pod를 띄운다. 다운타임이 발생하지만, 두 버전이 동시에 떠 있으면 안 되는 경우(예: DB 마이그레이션)에 쓴다.

---

## 배포와 롤백

```bash
# 이미지 변경 (RollingUpdate 트리거)
kubectl set image deployment/web app=nginx:1.28

# 진행 상황 확인
kubectl rollout status deployment/web

# 변경 이력
kubectl rollout history deployment/web

# 직전 버전으로 롤백
kubectl rollout undo deployment/web

# 특정 revision으로 롤백
kubectl rollout undo deployment/web --to-revision=2
```

이력이 유지되는 이유는 옛 ReplicaSet들이 `replicas: 0` 상태로 남아있기 때문이다.

```bash
kubectl get rs
# web-7d4f5  3 3 3  (current)
# web-6c2e8  0 0 0  (이전 버전)
# web-5a1d3  0 0 0  (그 이전)
```

`spec.revisionHistoryLimit` (기본 10)으로 보존 개수를 조절한다.

---

## 진행 / 정체 / 실패의 판정

Deployment는 다음 조건들로 상태를 판단한다.

- `progressDeadlineSeconds` (기본 600초) 안에 진행이 없으면 Failed
- `minReadySeconds` — 새 Pod가 Ready 된 후 이 시간만큼 안정적이어야 다음 Pod로 진행

```yaml
spec:
  progressDeadlineSeconds: 300
  minReadySeconds: 10
```

---

## 자주 하는 실수

### selector를 나중에 바꿀 수 없다

```yaml
selector:
  matchLabels:
    app: web
```

이 selector는 immutable이다. 바꾸려면 Deployment를 삭제 후 재생성해야 한다.

### 이미지 태그로 latest 사용

`nginx:latest`를 쓰면 같은 태그가 다른 이미지를 가리킬 수 있어 RollingUpdate가 트리거되지 않거나, 노드별로 다른 이미지가 떠 있을 수 있다. **항상 명시적 버전 태그**를 쓰자.

---

## 정리

Deployment의 진짜 역할은 "Pod를 만드는 것"이 아니라 **두 ReplicaSet 사이에서 점진적으로 트래픽을 옮기는 일**이다. 다음 글에서는 그 ReplicaSet 자체를 더 자세히 본다.
