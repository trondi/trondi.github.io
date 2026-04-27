---
title: "Kubernetes Pod — 컨테이너가 아니라 Pod가 최소 단위인 이유"
date: "2026-04-29"
summary: "Pod는 단순한 컨테이너 래퍼가 아니다. 같은 네트워크/스토리지 네임스페이스를 공유하는 컨테이너 그룹이라는 정의가 왜 중요한지, init container와 sidecar 패턴이 어떻게 가능해지는지 정리한다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - Pod
  - Container
featured: false
---

# Kubernetes Pod — 컨테이너가 아니라 Pod가 최소 단위인 이유

## Pod는 왜 존재하는가

Docker로 컨테이너를 띄우는 데 익숙하다면 의문이 든다. 왜 Kubernetes는 컨테이너를 직접 다루지 않고 **Pod**라는 한 겹을 더 만들었을까?

답은 **함께 묶어야 의미 있는 컨테이너들**이 있기 때문이다. 예를 들어:

- 메인 앱 + 로그 수집 사이드카
- 메인 앱 + Service Mesh 프록시(Envoy)
- 초기화 스크립트 → 메인 앱

이들은 같은 IP, 같은 볼륨을 공유해야 협력할 수 있다. Pod는 그 **공유 단위**다.

---

## Pod 안에서 공유되는 것

Pod 내 컨테이너들은 다음을 공유한다.

- **Network Namespace** — 같은 Pod IP, 같은 포트 공간 (그래서 포트 충돌 주의)
- **IPC Namespace** — POSIX shared memory 등
- **Volume** — 명시적으로 마운트한 볼륨

공유하지 않는 것:
- Filesystem (각 컨테이너는 자기 이미지의 rootfs를 갖는다)
- PID Namespace (기본값, `shareProcessNamespace: true`로 켤 수 있음)

---

## 가장 단순한 Pod YAML

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hello-pod
  namespace: default
spec:
  containers:
    - name: app
      image: nginx:1.27
      ports:
        - containerPort: 80
      resources:
        requests:
          cpu: "100m"
          memory: "128Mi"
        limits:
          cpu: "500m"
          memory: "256Mi"
```

> 운영에서 Pod를 직접 만들지는 않는다. Pod가 죽으면 끝이기 때문이다. Deployment, StatefulSet, Job 같은 상위 워크로드가 Pod를 생성/관리한다.

---

## 멀티 컨테이너 Pod

### Sidecar 예시 (로그 수집)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: app-with-sidecar
spec:
  volumes:
    - name: logs
      emptyDir: {}
  containers:
    - name: app
      image: my-app:1.0
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
    - name: log-shipper
      image: fluent-bit:latest
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
          readOnly: true
```

두 컨테이너가 `emptyDir` 볼륨을 공유해서, 앱이 쓴 로그를 사이드카가 읽어 외부로 전송한다.

### Init Container 예시 (초기화)

```yaml
spec:
  initContainers:
    - name: wait-for-db
      image: busybox
      command: ['sh', '-c', 'until nc -z db 5432; do sleep 1; done']
  containers:
    - name: app
      image: my-app:1.0
```

`initContainers`는 **순차적으로 실행**되며, 모두 성공해야 메인 컨테이너가 시작된다.

---

## Pod의 생명주기

| Phase | 의미 |
|---|---|
| Pending | API 서버에 등록됨, 아직 Node에 스케줄되지 않았거나 이미지 pulling 중 |
| Running | 모든 컨테이너가 생성됨, 최소 하나가 실행 중 |
| Succeeded | 모든 컨테이너가 정상 종료(exit 0) |
| Failed | 적어도 하나가 비정상 종료 |
| Unknown | kubelet과 통신 두절 |

Pod는 **Mortal**하다. 한번 죽은 Pod는 같은 이름이라도 다시 살아나지 않는다. ReplicaSet/Deployment가 새 Pod를 만들 뿐이다. IP도 바뀐다 — 그래서 Service가 필요하다.

---

## Probe — Pod의 건강 검진

```yaml
containers:
  - name: app
    image: my-app:1.0
    livenessProbe:        # 죽었나? 죽었으면 재시작
      httpGet:
        path: /healthz
        port: 8080
      initialDelaySeconds: 10
      periodSeconds: 5
    readinessProbe:       # 트래픽 받을 준비됐나? 안 됐으면 Endpoint에서 빠짐
      httpGet:
        path: /ready
        port: 8080
    startupProbe:         # 기동이 오래 걸리는 앱 보호
      httpGet:
        path: /healthz
        port: 8080
      failureThreshold: 30
      periodSeconds: 10
```

세 Probe의 역할이 미묘하게 다르다. 자세한 비교는 별도 글에서.

---

## 정리

Pod는 "컨테이너 한 개를 감싼 객체"가 아니라 **함께 떠야 하는 컨테이너들의 묶음**이다. Network/Volume 공유, Init/Sidecar 패턴이 가능한 이유가 여기에 있다. 그러나 Pod를 직접 만들 일은 거의 없다 — 다음 글부터는 Pod를 관리하는 워크로드(Deployment, ReplicaSet 등)를 다룬다.
