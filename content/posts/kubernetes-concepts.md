---
title: "Kubernetes 개념 정리 — Pod부터 Service까지"
date: "2026-04-19"
summary: "컨테이너 오케스트레이션이 왜 필요한지, Kubernetes의 핵심 오브젝트(Pod, Deployment, Service, Ingress)를 실제 예시와 함께 정리했다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - k8s
  - DevOps
  - Container
featured: false
---

# Kubernetes 개념 정리 — Pod부터 Service까지

## 오케스트레이션이 왜 필요한가

Docker 하나로 컨테이너를 실행하는 건 쉽다. 하지만 실제 서비스에서는 이런 질문이 생긴다.

- 트래픽이 몰리면 컨테이너를 몇 개로 늘릴까?
- 컨테이너가 죽으면 자동으로 재시작되는가?
- 여러 서버(노드)에 어떻게 분산 배치할까?
- 배포 중 다운타임 없이 업데이트할 수 있는가?

**Kubernetes(k8s)**는 이 모든 것을 자동화하는 컨테이너 오케스트레이션 플랫폼이다.

---

## 클러스터 구조

```
┌─────────────────── Cluster ───────────────────────┐
│                                                   │
│  ┌─── Control Plane ───┐   ┌── Worker Node 1 ──┐  │
│  │ API Server          │   │  Pod  Pod  Pod    │  │
│  │ Scheduler           │   └───────────────────┘  │
│  │ Controller Manager  │   ┌── Worker Node 2 ──┐  │
│  │ etcd                │   │  Pod  Pod         │  │
│  └─────────────────────┘   └───────────────────┘  │
└───────────────────────────────────────────────────┘
```

- **Control Plane**: 클러스터 전체를 관리. API Server가 모든 통신의 중심.
- **Worker Node**: 실제 애플리케이션(Pod)이 실행되는 서버.
- **etcd**: 클러스터 상태를 저장하는 분산 키-값 저장소.

---

## 핵심 오브젝트

### Pod

k8s에서 배포 가능한 **최소 단위**다. 하나 이상의 컨테이너를 담는 묶음이며, 같은 Pod 안의 컨테이너는 네트워크(localhost)와 스토리지를 공유한다.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  containers:
    - name: app
      image: my-app:1.0
      ports:
        - containerPort: 3000
```

Pod는 직접 사용하는 경우가 드물고 보통 Deployment로 관리한다.

### Deployment

Pod를 **선언적으로** 관리한다. 원하는 상태(replicas, 이미지 버전)를 선언하면 Controller가 현재 상태를 그에 맞게 유지한다.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3                      # Pod 3개 유지
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: app
          image: my-app:1.0
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
  strategy:
    type: RollingUpdate            # 무중단 배포
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

### Service

Pod는 IP가 계속 바뀐다(죽고 새로 뜨기 때문에). **Service**는 고정된 엔드포인트를 제공해 Pod에 안정적으로 접근할 수 있게 한다.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-svc
spec:
  selector:
    app: my-app              # 이 레이블을 가진 Pod로 트래픽 전달
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP            # 클러스터 내부 통신
```

Service 타입:
| 타입 | 용도 |
|---|---|
| `ClusterIP` | 클러스터 내부 통신 (기본값) |
| `NodePort` | 노드의 특정 포트를 외부에 노출 |
| `LoadBalancer` | 클라우드 로드밸런서 연결 |

### Ingress

외부 HTTP/HTTPS 요청을 내부 Service로 라우팅하는 규칙이다. 도메인/경로 기반 라우팅이 가능하다.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
spec:
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-svc
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-svc
                port:
                  number: 80
```

---

## ConfigMap과 Secret

환경변수와 설정을 Pod에서 분리해 관리한다.

```yaml
# ConfigMap — 일반 설정값
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  NODE_ENV: production
  API_URL: https://api.example.com

---
# Secret — 민감한 값 (base64 인코딩)
apiVersion: v1
kind: Secret
metadata:
  name: app-secret
type: Opaque
stringData:
  DATABASE_URL: postgres://user:pass@db:5432/mydb
```

Pod에서 참조:

```yaml
envFrom:
  - configMapRef:
      name: app-config
  - secretRef:
      name: app-secret
```

---

## 자주 쓰는 kubectl 명령어

```bash
# 리소스 조회
kubectl get pods
kubectl get pods -o wide              # 노드 정보 포함
kubectl get deployment,svc,ingress
kubectl describe pod my-pod           # 상세 정보

# 배포
kubectl apply -f deployment.yaml      # 선언적 적용
kubectl rollout status deployment/my-app
kubectl rollout undo deployment/my-app  # 롤백

# 디버깅
kubectl logs my-pod -f                # 로그 스트리밍
kubectl logs my-pod -c my-container   # 특정 컨테이너 로그
kubectl exec -it my-pod -- sh         # 컨테이너 접속
kubectl port-forward pod/my-pod 8080:3000  # 로컬 포트 포워딩

# 스케일
kubectl scale deployment my-app --replicas=5
```

---

## HPA — 자동 스케일링

CPU/메모리 사용률에 따라 Pod 수를 자동으로 조절한다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70   # CPU 70% 넘으면 Scale Out
```

---

## 정리

| 오브젝트 | 역할 |
|---|---|
| Pod | 컨테이너 실행 단위 |
| Deployment | Pod 선언적 관리, 롤링 업데이트 |
| Service | Pod 네트워크 엔드포인트 고정 |
| Ingress | 외부 트래픽 라우팅 |
| ConfigMap/Secret | 환경 설정 분리 |
| HPA | 자동 스케일링 |

Docker가 "컨테이너 하나"를 다루는 도구라면, Kubernetes는 "컨테이너 군집"을 운영하는 플랫폼이다. 선언적 상태 관리와 자동 복구가 핵심 철학이다.
