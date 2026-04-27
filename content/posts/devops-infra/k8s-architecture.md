---
title: "Kubernetes 아키텍처 — Control Plane과 Worker Node 구조 뜯어보기"
date: "2026-04-27"
summary: "kubectl apply 한 번이 어떻게 컨테이너 실행으로 이어지는가. Control Plane의 4개 컴포넌트와 Worker Node의 3개 컴포넌트가 각각 어떤 역할을 맡고, 어떻게 협력하는지 정리한다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - k8s
  - Architecture
  - Control Plane
  - Worker Node
featured: true
---

# Kubernetes 아키텍처 — Control Plane과 Worker Node 구조 뜯어보기

> Kubernetes 리소스 시리즈의 첫 글. Pod, Deployment, Service 같은 리소스를 다루기 전에, 그것들이 **어디서, 누구에 의해, 어떤 순서로** 처리되는지부터 정리한다.

공식 아키텍처 다이어그램: <https://kubernetes.io/docs/concepts/overview/components/>

---

## 클러스터는 두 종류의 노드로 나뉜다

Kubernetes 클러스터는 결국 **여러 대의 머신(노드)** 모임이다. 각 노드는 두 역할 중 하나를 맡는다.

- **Control Plane Node** — 클러스터의 두뇌. 무엇을 어디에 띄울지 결정한다.
- **Worker Node** — 실제 컨테이너(Pod)가 실행되는 곳.

소규모 환경에서는 한 머신이 두 역할을 겸할 수 있지만, 운영 클러스터에서는 분리하는 게 일반적이다.

---

## Control Plane의 구성요소

### 1. kube-apiserver

클러스터의 **단일 진입점**. `kubectl`, 다른 컴포넌트, 외부 시스템 모두 여기로 REST API 요청을 보낸다.

- 인증(Authentication), 인가(Authorization), Admission Control을 거친 뒤
- 리소스 정의를 검증해서 **etcd에 저장**한다.

API 서버 외의 컴포넌트는 etcd에 직접 접근하지 않는다. 모든 상태 변경은 API 서버를 거친다.

### 2. etcd

분산 Key-Value 저장소. 클러스터의 **모든 상태(desired state + current state)**가 여기에 저장된다.

- Pod 정의, ConfigMap, Secret, Node 정보, 이벤트 등 전부.
- Raft 합의 알고리즘으로 일관성을 보장한다.
- 운영 환경에서는 보통 3개 또는 5개 노드로 구성한다(홀수, 쿼럼).

### 3. kube-scheduler

새로 생성된 **Pod에 어떤 Node를 할당할지 결정**한다.

스케줄링 단계는 두 가지다.

1. **Filtering** — 리소스 요구량, NodeSelector, Taints/Tolerations 등으로 후보 노드를 거른다.
2. **Scoring** — 남은 후보들 중 가장 적합한 노드에 점수를 매긴다(부하 분산, 데이터 지역성 등).

선택된 노드명은 Pod 객체의 `spec.nodeName`에 기록된다. **실제로 Pod를 띄우는 건 Scheduler가 아니다** — 그건 해당 노드의 kubelet이 한다.

### 4. kube-controller-manager

여러 컨트롤러를 한 프로세스로 묶어 실행한다. 각 컨트롤러는 "현재 상태가 원하는 상태(desired state)와 같은가?"를 끊임없이 비교하고, 다르면 맞춘다.

대표적인 컨트롤러:

- **Deployment Controller** — Deployment에 따라 ReplicaSet을 만든다.
- **ReplicaSet Controller** — Pod 수가 부족하면 새로 만들고, 넘치면 줄인다.
- **Node Controller** — 노드가 죽었는지 감시.
- **Endpoint Controller** — Service와 Pod를 연결하는 Endpoint 객체를 갱신.

이 패턴을 **Reconciliation Loop**라고 부른다. Kubernetes의 동작 원리 그 자체다.

### 5. cloud-controller-manager (선택)

AWS, GCP, Azure 등 클라우드 환경일 때만 동작. LoadBalancer 생성, EBS 볼륨 attach 같은 클라우드별 동작을 처리한다.

---

## Worker Node의 구성요소

### 1. kubelet

각 노드에서 돌아가는 **에이전트**. API 서버로부터 "이 노드에서 이 Pod들을 띄워라"라는 명령을 받고, 실제 컨테이너 런타임에 실행을 요청한다.

- Pod의 라이프사이클 관리 (생성, 종료, 재시작)
- Liveness/Readiness Probe 실행
- 컨테이너 상태를 주기적으로 API 서버에 보고

### 2. kube-proxy

Service의 **가상 IP를 실제 Pod IP로 라우팅**해주는 네트워크 프록시. iptables 또는 IPVS 규칙을 노드 단위로 갱신한다.

```
Pod A → ClusterIP(Service) → kube-proxy 규칙 → Pod B 중 하나
```

### 3. Container Runtime

실제로 컨테이너를 실행하는 엔진. CRI(Container Runtime Interface) 스펙을 만족해야 한다.

- containerd (가장 많이 쓰임)
- CRI-O
- Docker는 1.24부터 dockershim이 제거되어 직접 지원되지 않는다.

---

## 요청 한 번이 흐르는 과정

`kubectl apply -f deployment.yml`을 실행했을 때 일어나는 일.

1. **kubectl** → kube-apiserver로 Deployment 객체 생성 요청
2. **API 서버**: 인증/인가 → 검증 → etcd에 저장
3. **Deployment Controller**가 새 Deployment를 감지 → ReplicaSet 생성 요청
4. **ReplicaSet Controller**가 Pod 객체 N개 생성 (아직 nodeName 없음)
5. **Scheduler**가 nodeName 없는 Pod를 보고 → 적합한 노드 선택 → `spec.nodeName` 갱신
6. 해당 노드의 **kubelet**이 자신에게 할당된 Pod 감지 → containerd에 컨테이너 실행 요청
7. **kube-proxy**가 Service의 Endpoint에 새 Pod IP 추가 (Service가 있다면)

각 컴포넌트는 직접 통신하지 않는다. 전부 **API 서버를 통해 etcd의 상태를 읽고/쓰면서** 협력한다. 이걸 **Hub-and-Spoke**라고 부른다.

---

## 정리

| 컴포넌트 | 위치 | 역할 |
|---|---|---|
| kube-apiserver | Control Plane | 단일 진입점, 검증 |
| etcd | Control Plane | 클러스터 상태 저장 |
| scheduler | Control Plane | Pod ↔ Node 할당 |
| controller-manager | Control Plane | Reconciliation Loop |
| kubelet | Worker | Pod 생명주기 관리 |
| kube-proxy | Worker | Service 라우팅 |
| container runtime | Worker | 실제 컨테이너 실행 |

다음 글부터는 Namespace를 시작으로, 각 리소스가 위 흐름 어디에 끼어들고 어떤 YAML로 정의되는지 하나씩 들여다본다.
