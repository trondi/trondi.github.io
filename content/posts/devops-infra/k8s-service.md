---
title: "Kubernetes Service — 사라지는 Pod IP를 안정적으로 가리키는 방법"
date: "2026-05-05"
summary: "Pod는 죽으면 새 IP로 다시 태어난다. 그래서 Pod를 직접 부르면 안 된다. Service의 ClusterIP, NodePort, LoadBalancer, ExternalName 네 타입의 차이와 동작 원리를 정리한다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - Service
  - Networking
featured: false
---

# Kubernetes Service — 사라지는 Pod IP를 안정적으로 가리키는 방법

## Service가 푸는 문제

Pod는 mortal하다. 죽으면 같은 IP로 돌아오지 않는다. 그렇다면 다른 Pod에서 어떻게 부를 것인가?

**Service**는 Pod 집합 앞에 **고정 가상 IP(ClusterIP)와 DNS 이름**을 제공한다.

```
Client → svc.ClusterIP → kube-proxy 라우팅 → Pod 중 하나
```

Pod가 죽고 새로 떠도 Service의 IP/DNS는 변하지 않는다.

---

## 가장 단순한 ClusterIP Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: default
spec:
  type: ClusterIP
  selector:
    app: web              # 이 라벨을 가진 Pod에 트래픽
  ports:
    - port: 80            # Service 자체 포트
      targetPort: 8080    # Pod의 컨테이너 포트
      protocol: TCP
```

`type` 생략 시 기본이 ClusterIP.

호출 방법 (같은 Namespace 내):

```
http://web:80
http://web.default.svc.cluster.local:80
```

---

## Service Type 4가지

### 1. ClusterIP — 클러스터 내부 전용

기본값. 외부에서는 접근 불가. 마이크로서비스 간 통신용.

### 2. NodePort — 모든 노드의 특정 포트로 노출

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080   # 30000-32767 범위 (또는 자동 할당)
```

`<NodeIP>:30080`으로 어떤 노드든 접근 가능. 개발/테스트용. 운영에선 LoadBalancer/Ingress 권장.

### 3. LoadBalancer — 클라우드 LB 자동 생성

```yaml
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080
```

AWS면 ELB, GCP면 GLB가 자동 생성되고 외부 IP가 할당된다. **온프레미스 환경에서는 MetalLB 같은 별도 컴포넌트가 필요**하다.

### 4. ExternalName — DNS CNAME만 만든다

```yaml
spec:
  type: ExternalName
  externalName: db.production.example.com
```

`db.default.svc.cluster.local` → CNAME → 외부 도메인. 외부 DB를 내부 이름으로 부를 때.

---

## Selector → Endpoints 자동 생성

Service에 `selector`를 적으면, 매칭되는 Pod의 IP들을 모은 **Endpoints** 객체가 자동으로 만들어진다.

```bash
kubectl get endpoints web
# NAME  ENDPOINTS                       AGE
# web   10.0.1.5:8080,10.0.1.6:8080    1h
```

Endpoints 객체가 비어있으면 트래픽이 어디로도 가지 않는다. Service가 동작하지 않을 때 가장 먼저 확인할 곳.

```bash
kubectl describe svc web
kubectl get endpoints web
kubectl get pods -l app=web   # 매칭되는 Pod가 있는가?
```

---

## Headless Service — DNS만 제공

```yaml
spec:
  clusterIP: None        # 핵심
  selector:
    app: web
```

ClusterIP를 만들지 않고, DNS 조회 시 **Pod IP들을 직접 반환**한다. StatefulSet의 각 Pod에 직접 접근하거나, 클라이언트 사이드 로드밸런싱(gRPC 등)에 쓴다.

```bash
nslookup web.default.svc.cluster.local
# 10.0.1.5
# 10.0.1.6
```

---

## sessionAffinity — 끈끈한 세션

기본은 라운드로빈. 같은 클라이언트는 같은 Pod로 보내려면:

```yaml
spec:
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 3600
```

운영에서는 가능하면 stateless하게 설계하고, 세션 정보는 Redis 같은 외부 저장소로 빼는 게 좋다.

---

## kube-proxy의 동작

Service가 동작하는 실체는 각 노드의 **kube-proxy**가 만드는 iptables(또는 IPVS) 규칙이다.

```
Client → ClusterIP(가상)
         iptables가 DNAT → Pod IP 중 하나
```

ClusterIP는 가짜 IP다. 실제로 그 IP에 응답하는 인터페이스는 어디에도 없다. iptables 규칙이 패킷을 가로채서 Pod로 NAT한다.

---

## 정리

Service의 핵심은 **불안정한 Pod IP들 위에 안정적인 가상 엔드포인트**를 제공하는 것이다. 4가지 타입의 차이를 외워두자:

| 타입 | 노출 범위 | 용도 |
|---|---|---|
| ClusterIP | 클러스터 내부 | 마이크로서비스 간 |
| NodePort | 노드 IP:포트 | 개발/테스트 |
| LoadBalancer | 외부 IP | 운영 외부 노출(클라우드) |
| ExternalName | DNS만 | 외부 서비스 alias |

다음 글에서는 HTTP 라우팅을 담당하는 **Ingress**를 다룬다.
