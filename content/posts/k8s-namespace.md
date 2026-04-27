---
title: "Kubernetes Namespace — 클러스터를 논리적으로 쪼개는 단위"
date: "2026-04-28"
summary: "Namespace는 단순한 폴더가 아니라 RBAC, ResourceQuota, NetworkPolicy의 적용 경계가 된다. 어떤 리소스가 Namespace에 속하고, 어떤 게 클러스터 전역인지부터 정리한다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - Namespace
  - Multi-tenancy
featured: false
---

# Kubernetes Namespace — 클러스터를 논리적으로 쪼개는 단위

## Namespace가 필요한 이유

하나의 클러스터를 여러 팀, 여러 환경(dev/staging/prod)이 공유할 때 다음 문제가 생긴다.

- 같은 이름의 리소스가 충돌한다 (`api-deployment`가 두 개?)
- 누가 어디까지 건드릴 수 있는지 권한을 분리해야 한다
- 팀별로 자원 사용량을 제한하고 싶다

**Namespace**는 이 모든 것의 적용 경계가 된다. 단순한 폴더 분류가 아니다.

---

## Namespaced vs Cluster-scoped

모든 리소스가 Namespace에 속하지는 않는다.

**Namespaced (Namespace에 속함)**
- Pod, Deployment, Service, ConfigMap, Secret, PVC, Job 등 대부분의 워크로드 리소스

**Cluster-scoped (전역)**
- Node, PersistentVolume, StorageClass, ClusterRole, Namespace 자체

확인 방법:

```bash
kubectl api-resources --namespaced=true   # namespaced 리소스 목록
kubectl api-resources --namespaced=false  # cluster-scoped 목록
```

---

## 기본 YAML

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: team-frontend
  labels:
    environment: production
    team: frontend
```

```bash
kubectl apply -f namespace.yml
kubectl get ns
```

---

## 기본 제공 Namespace

| Namespace | 용도 |
|---|---|
| `default` | 명시하지 않으면 여기로 들어감 |
| `kube-system` | Kubernetes 자체 컴포넌트(coredns, kube-proxy 등) |
| `kube-public` | 인증 없이 누구나 읽을 수 있는 정보 |
| `kube-node-lease` | 노드 heartbeat lease 객체 |

`default`에 운영 리소스를 배포하는 건 안티패턴이다. 환경/팀 별 Namespace를 명시하자.

---

## Namespace의 진짜 역할

### 1. RBAC의 적용 경계

`Role`은 Namespace 단위, `ClusterRole`은 전역 단위다.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: team-frontend  # 이 Namespace 내에서만 유효
  name: pod-reader
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
```

### 2. ResourceQuota / LimitRange의 적용 경계

CPU, Memory, Pod 개수 등의 상한선을 Namespace 단위로 설정할 수 있다.

### 3. NetworkPolicy의 적용 경계

기본적으로 모든 Pod 간 통신이 허용되지만, NetworkPolicy로 Namespace 간 트래픽을 막을 수 있다.

### 4. DNS 분리

Service의 FQDN에 Namespace가 포함된다.

```
<service-name>.<namespace>.svc.cluster.local
```

같은 Namespace 내에서는 `<service-name>`만으로 호출 가능하다.

---

## 자주 하는 실수

### Namespace 삭제 = 안의 모든 것 삭제

```bash
kubectl delete ns team-frontend  # Pod, PVC, ConfigMap 전부 사라진다
```

PVC가 삭제되면 ReclaimPolicy에 따라 PV의 데이터까지 사라질 수 있다. 주의.

### Namespace 간 Service 호출 시 FQDN 확인

```yaml
# team-backend의 Pod에서 team-frontend의 Service 호출 시
# api  ❌  (같은 ns로 해석됨)
# api.team-frontend  ✅
# api.team-frontend.svc.cluster.local  ✅
```

---

## 정리

Namespace는 **단순한 리소스 분류**가 아니다. RBAC, Quota, NetworkPolicy, DNS의 적용 경계이며, 클러스터 멀티테넌시의 기초다. 다음 글에서는 Namespace 안에 들어가는 가장 작은 실행 단위, **Pod**를 다룬다.
