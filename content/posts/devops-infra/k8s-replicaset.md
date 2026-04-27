---
title: "Kubernetes ReplicaSet — 직접 만들지 않지만 알아야 하는 이유"
date: "2026-05-01"
summary: "Deployment가 알아서 ReplicaSet을 관리해주는데 왜 ReplicaSet을 알아야 할까. 디버깅 시 ReplicaSet을 보는 순간이 반드시 온다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - ReplicaSet
  - Workload
featured: false
---

# Kubernetes ReplicaSet — 직접 만들지 않지만 알아야 하는 이유

## ReplicaSet의 역할

ReplicaSet은 **지정된 수의 Pod 복제본을 항상 유지**하는 컨트롤러다.

```
원하는 상태: 3개 → 현재 2개 → 1개 새로 만든다
원하는 상태: 3개 → 현재 5개 → 2개 죽인다
```

이게 끝이다. Deployment보다 훨씬 단순하다.

---

## 그런데 왜 직접 만들지 않는가

Deployment를 쓰면 ReplicaSet을 직접 만들 일이 없다. 그러나:

- **장애 디버깅** 시 어떤 ReplicaSet이 문제인지 봐야 한다
- 롤백 가능 여부는 옛 ReplicaSet 보존 개수에 달려있다
- HPA(Horizontal Pod Autoscaler)가 직접 조작하는 객체가 ReplicaSet의 `replicas` 필드다

직접 만들지 않더라도 **존재를 알고 읽을 줄 알아야** 디버깅이 된다.

---

## 기본 YAML

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: web-rs
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
      tier: frontend
  template:
    metadata:
      labels:
        app: web
        tier: frontend
    spec:
      containers:
        - name: app
          image: nginx:1.27
```

Deployment YAML과 거의 같다. 차이는 `kind`와 RollingUpdate 같은 배포 전략 필드가 없다는 점.

---

## ReplicaSet과 Pod의 연결 — Selector와 Label

ReplicaSet은 자기 selector에 매칭되는 Pod를 자기 것으로 인식한다.

```yaml
selector:
  matchLabels:
    app: web

# 이 Pod도 자기 것으로 흡수된다
apiVersion: v1
kind: Pod
metadata:
  labels:
    app: web   # 같은 label
```

이 동작은 의도하지 않은 흡수를 일으킬 수 있다. 그래서 Deployment는 자동으로 `pod-template-hash`라는 추가 라벨을 붙여서 ReplicaSet 간 Pod가 섞이지 않게 한다.

```bash
kubectl get pods --show-labels
# web-7d4f5-abcde  app=web,pod-template-hash=7d4f5
# web-6c2e8-xyz12  app=web,pod-template-hash=6c2e8
```

각 ReplicaSet의 selector에는 해당 hash가 자동 추가된다.

---

## ReplicaSet의 Reconciliation

```
1. ReplicaSet Controller가 etcd에서 ReplicaSet 객체를 watch
2. 실제 Pod 수 < spec.replicas → 새 Pod 생성
3. 실제 Pod 수 > spec.replicas → 가장 적합한 Pod 삭제
   (중단 영향 적은 순서: Pending → Unhealthy → Younger → ...)
4. 무한 반복
```

이 루프가 Kubernetes의 **Reconciliation Loop** 패턴의 가장 단순한 예시다.

---

## ReplicationController와의 관계

Kubernetes 초창기에는 `ReplicationController`(rc)가 있었다. ReplicaSet은 그 후속 버전으로:

- `matchLabels`만 지원하던 rc와 달리
- `matchExpressions`(In, NotIn, Exists 등)도 지원

```yaml
selector:
  matchExpressions:
    - key: tier
      operator: In
      values: [frontend, mobile]
```

지금은 ReplicationController를 쓸 일이 없다. ReplicaSet도 직접 쓸 일이 거의 없다. **Deployment를 통해 간접적으로 만나는 게 정상**이다.

---

## 정리

ReplicaSet은 "Pod 개수 유지" 한 가지 일을 한다. 직접 만들지는 않더라도 **Deployment의 내부 구현**으로 항상 같이 다닌다. `kubectl get rs`가 디버깅의 시작점이 되는 순간이 분명히 온다.
