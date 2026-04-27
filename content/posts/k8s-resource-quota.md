---
title: "Kubernetes ResourceQuota — Namespace 단위로 자원 사용 한도 걸기"
date: "2026-05-12"
summary: "한 팀이 클러스터 자원을 다 먹어버리는 사고를 막는다. CPU/Memory만이 아니라 Pod 개수, PVC 개수, LoadBalancer 개수까지 제한할 수 있다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - ResourceQuota
  - Multi-tenancy
  - Resource Management
featured: false
---

# Kubernetes ResourceQuota — Namespace 단위로 자원 사용 한도 걸기

## ResourceQuota가 푸는 문제

여러 팀이 한 클러스터를 공유할 때, 한 팀이 실수(또는 악의)로 자원을 다 먹어버리면 다른 팀까지 마비된다. 메모리 limit 없는 Pod 한 개가 OOM 도미노를 일으킨다.

ResourceQuota는 **Namespace 단위로 총합 사용량 상한**을 둔다.

---

## 기본 YAML

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-quota
  namespace: team-frontend
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    pods: "50"
    persistentvolumeclaims: "10"
    services.loadbalancers: "2"
```

이 Namespace의 모든 Pod의 `requests.cpu` 합계가 10을 넘으면 새 Pod 생성이 거부된다.

---

## 제한 가능한 자원 카테고리

### Compute

```yaml
hard:
  requests.cpu: "10"
  requests.memory: 20Gi
  limits.cpu: "20"
  limits.memory: 40Gi
  requests.ephemeral-storage: 50Gi
  limits.ephemeral-storage: 100Gi
```

### 객체 개수

```yaml
hard:
  pods: "100"
  configmaps: "50"
  secrets: "50"
  services: "20"
  services.loadbalancers: "2"
  services.nodeports: "5"
  persistentvolumeclaims: "10"
```

LoadBalancer 개수 제한은 클라우드 비용 통제에 효과적.

### Storage (StorageClass별)

```yaml
hard:
  requests.storage: 500Gi
  gp3.storageclass.storage.k8s.io/requests.storage: 300Gi
  gp3.storageclass.storage.k8s.io/persistentvolumeclaims: "5"
```

StorageClass별로 따로 한도를 둘 수 있다. 비싼 SSD는 적게, HDD는 많이.

---

## 작동 방식

ResourceQuota는 **Admission Controller**가 시행한다. Pod/PVC/Service 등을 만들 때 API 서버가 Quota를 검사하고, 초과하면 거부한다.

```bash
kubectl apply -f new-pod.yml
# Error from server (Forbidden): exceeded quota: team-quota,
# requested: requests.cpu=2, used: requests.cpu=9, limited: requests.cpu=10
```

> **중요**: 일단 ResourceQuota가 활성화되면, **모든 Pod가 자원 요청(requests/limits)을 명시해야 한다**. 명시하지 않은 Pod는 거부된다. 자동으로 채워주려면 다음 글의 **LimitRange**가 필요하다.

---

## 사용량 확인

```bash
kubectl get resourcequota -n team-frontend
# NAME         AGE   REQUEST                              LIMIT
# team-quota   5d    requests.cpu: 7/10, requests.memory: 14Gi/20Gi  ...

kubectl describe quota team-quota -n team-frontend
```

---

## scopes / scopeSelector — 부분 적용

ResourceQuota를 **특정 Pod 그룹에만** 적용하고 싶을 때.

### scopes

```yaml
spec:
  hard:
    pods: "10"
  scopes:
    - BestEffort   # requests/limits 둘 다 없는 Pod
```

| scope | 의미 |
|---|---|
| `Terminating` | activeDeadlineSeconds가 있는 Pod |
| `NotTerminating` | activeDeadlineSeconds가 없는 Pod |
| `BestEffort` | requests/limits 모두 없음 |
| `NotBestEffort` | requests/limits 중 하나라도 있음 |

### scopeSelector — PriorityClass 기준

```yaml
spec:
  hard:
    cpu: "10"
  scopeSelector:
    matchExpressions:
      - operator: In
        scopeName: PriorityClass
        values: [high]
```

high priority Pod에 대해서만 별도 한도.

---

## 자주 하는 실수

### Quota 활성화 후 기존 Pod 마이그레이션

Quota를 새로 적용했는데, requests 없이 떠 있던 기존 Pod들 때문에 사용량이 0으로 잡힘. 새 Pod는 못 만들고 기존 Pod는 안 죽음 → 혼란. **Quota 활성화 전에 LimitRange로 기본값을 먼저 설정**하자.

### Quota 초과 시 사일런트 실패

`kubectl apply` 자체는 성공해 보이는데(예: Deployment 생성), 실제 Pod가 안 뜬다. ReplicaSet의 이벤트를 봐야 원인이 보인다.

```bash
kubectl describe rs <name>
# FailedCreate ... exceeded quota
```

### Service 개수 제한 누락

CI/CD에서 Service를 자꾸 만들어 누적 → 결국 Quota 초과. 정리 정책을 같이 두자(ttl, GC).

---

## 정리

ResourceQuota는 Namespace 단위 **총합 상한**이다. 멀티테넌시 클러스터의 기본 안전장치이며, **개별 Pod의 기본값**을 보장하는 LimitRange와 짝으로 운영된다. 다음 글에서 그 LimitRange를 본다.
