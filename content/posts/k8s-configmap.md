---
title: "Kubernetes ConfigMap — 설정과 코드를 분리하는 방법"
date: "2026-05-10"
summary: "환경별 설정을 컨테이너 이미지에 박아두면 환경마다 이미지를 새로 빌드해야 한다. ConfigMap의 4가지 주입 방식과 hot-reload 가능 여부를 정리한다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - ConfigMap
  - Configuration
featured: false
---

# Kubernetes ConfigMap — 설정과 코드를 분리하는 방법

## ConfigMap의 역할

12-factor app의 원칙 중 하나: **설정은 코드와 분리한다**. 이미지는 환경 무관해야 하고, 환경별 차이는 외부에서 주입한다.

ConfigMap은 그 외부 주입 통로다. 키-값 쌍이나 파일 내용을 클러스터에 저장해두고, Pod에 환경변수/볼륨 형태로 전달한다.

---

## 만드는 4가지 방식

### 1. YAML 직접 작성

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  LOG_LEVEL: "info"
  DB_HOST: "postgres.default.svc.cluster.local"
  app.properties: |
    server.port=8080
    cache.ttl=300
```

`data`는 문자열 키-값. 파일 내용도 멀티라인 문자열로 넣을 수 있다.

### 2. literal로 즉석 생성

```bash
kubectl create configmap app-config \
  --from-literal=LOG_LEVEL=info \
  --from-literal=DB_HOST=postgres
```

### 3. 파일에서

```bash
kubectl create configmap app-config \
  --from-file=app.properties \
  --from-file=nginx.conf
```

파일명이 키, 파일 내용이 값.

### 4. env 파일에서

```bash
# .env
LOG_LEVEL=info
DB_HOST=postgres
```

```bash
kubectl create configmap app-config --from-env-file=.env
```

---

## Pod에 주입하는 4가지 방식

### A. 환경변수 — 단일 키

```yaml
spec:
  containers:
    - name: app
      env:
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: LOG_LEVEL
```

### B. 환경변수 — 전체 import

```yaml
spec:
  containers:
    - name: app
      envFrom:
        - configMapRef:
            name: app-config
```

ConfigMap의 모든 키-값이 환경변수로. 키 이름이 곧 환경변수 이름.

### C. 볼륨 마운트 — 디렉토리

```yaml
spec:
  containers:
    - name: app
      volumeMounts:
        - name: config
          mountPath: /etc/app
  volumes:
    - name: config
      configMap:
        name: app-config
```

`/etc/app/LOG_LEVEL`, `/etc/app/app.properties` 같은 파일들이 생긴다.

### D. 볼륨 마운트 — 특정 파일만

```yaml
volumes:
  - name: config
    configMap:
      name: app-config
      items:
        - key: app.properties
          path: application.properties
```

`/etc/app/application.properties`만 생긴다(원래 키명을 다른 파일명으로).

---

## Hot Reload

| 주입 방식 | 변경 자동 반영 |
|---|---|
| 환경변수 | ❌ Pod 재시작 필요 |
| 볼륨 마운트 | ⭕ kubelet이 주기적으로 동기화 (보통 60초 이내) |

**환경변수 방식은 ConfigMap을 바꿔도 컨테이너에 반영되지 않는다**. 이미 시작된 프로세스의 envron은 외부에서 못 바꾼다. Pod 재시작이 필수.

볼륨 방식은 파일이 자동 갱신되지만, **앱이 그 파일을 다시 읽어야** 한다. 보통 SIGHUP 핸들러나 inotify가 필요.

운영에서 자주 바뀌는 설정 = 볼륨 + 핫리로드 가능 앱. 거의 안 바뀌는 설정 = 환경변수가 단순.

---

## immutable ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config-v1
data:
  ...
immutable: true
```

수정 불가능. 변경하려면 새 이름으로 만들어야 한다. 대규모 클러스터에서 kube-apiserver 부하를 줄이고, 실수로 수정해서 모든 Pod에 반영되는 사고를 막는다.

ConfigMap에 버전을 붙여 운영하는 패턴이 잘 어울린다(`app-config-v1`, `app-config-v2`). Deployment에서 새 ConfigMap을 참조하면 자연스럽게 RollingUpdate가 일어난다.

---

## 자주 하는 실수

### Secret 대신 ConfigMap

비밀번호, API 키를 ConfigMap에 넣는 경우. ConfigMap은 평문이고 RBAC 외엔 보호 장치가 없다. 민감 정보는 다음 글의 **Secret**으로.

### 너무 큰 ConfigMap

ConfigMap 한 개의 크기 제한은 1MB(etcd 객체 크기 제한). 대용량 설정은 PV에 두거나 외부 설정 시스템(Consul, Vault) 사용.

### 환경변수 방식 + 핫리로드 기대

위 표에서 봤듯, 환경변수는 자동 반영 안 됨. 잘못 설계하면 ConfigMap 바꿨는데 왜 안 바뀌냐고 한참 헤맨다.

---

## 정리

ConfigMap의 4×4 매트릭스(만드는 방식 × 주입 방식)를 익혀두면 모든 케이스가 풀린다. 가장 중요한 함정은 **환경변수 방식의 비-핫리로드** 특성. 다음 글에서는 ConfigMap의 민감정보 버전인 **Secret**을 다룬다.
