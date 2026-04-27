---
title: "Kubernetes PersistentVolumeClaim — Pod가 스토리지를 요구하는 방식"
date: "2026-05-09"
summary: "PVC는 Pod와 PV 사이의 추상화 레이어다. 사용자는 'NFS인지 EBS인지' 몰라도 '50Gi 필요해'라고 선언만 하면 된다. 바인딩 조건, 확장, StatefulSet 사용 패턴까지 정리한다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - PersistentVolumeClaim
  - PVC
  - Storage
featured: false
---

# Kubernetes PersistentVolumeClaim — Pod가 스토리지를 요구하는 방식

## PVC가 추상화하는 것

Pod 입장에서는 EBS인지 NFS인지 알 필요가 없다. "RWO 모드로 50Gi 필요해"라고 선언만 하면 된다. 그 추상화가 **PVC**다.

```
Pod → PVC (요청) → PV (실제 스토리지)
```

PVC는 사용자(개발자) 영역, PV/StorageClass는 관리자 영역의 책임 분리다.

---

## 기본 YAML

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: gp3
```

`storageClassName`이 동적 프로비저닝의 트리거다. 이걸 명시하면 해당 StorageClass의 provisioner가 PV를 자동 생성한다.

---

## PVC ↔ PV 바인딩 조건

PVC가 PV에 바인딩되려면 다음을 모두 만족해야 한다.

1. **storageClassName 일치** (또는 둘 다 미지정)
2. **AccessMode가 PVC ⊆ PV** — PVC가 RWO 요청하면 PV는 RWO를 지원해야
3. **PV의 capacity ≥ PVC의 request**
4. **selector 매칭** (PVC가 selector를 명시한 경우)

조건이 안 맞으면 PVC는 `Pending` 상태로 무한 대기한다.

```bash
kubectl get pvc
# NAME       STATUS    VOLUME  CAPACITY  ACCESS MODES  STORAGECLASS  AGE
# data-pvc   Pending                                   gp3           5m

kubectl describe pvc data-pvc
# Events에 원인이 표시됨
```

---

## Pod에서 사용

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: db
spec:
  containers:
    - name: postgres
      image: postgres:16
      volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data-pvc
```

`volumes`에서 PVC를 참조하고, 컨테이너에서 `volumeMounts`로 마운트.

---

## 확장 (Resizing)

StorageClass에 `allowVolumeExpansion: true`가 있으면 PVC를 키울 수 있다.

```bash
kubectl patch pvc data-pvc -p \
  '{"spec":{"resources":{"requests":{"storage":"50Gi"}}}}'
```

축소는 불가. 노이가 끝나려면 Pod 재시작이 필요할 수도 있다(파일시스템 확장 시점에 따라).

---

## StatefulSet의 volumeClaimTemplates

StatefulSet은 각 Pod마다 고유한 PVC를 자동 생성하는 템플릿을 제공한다.

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db
  replicas: 3
  selector:
    matchLabels:
      app: db
  template:
    metadata:
      labels:
        app: db
    spec:
      containers:
        - name: postgres
          image: postgres:16
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: gp3
        resources:
          requests:
            storage: 20Gi
```

자동 생성되는 PVC 이름:

```
data-db-0
data-db-1
data-db-2
```

각 Pod가 자기 전용 볼륨을 갖는다. Pod 재시작 시 같은 볼륨이 재마운트된다.

> **주의**: StatefulSet을 삭제해도 `volumeClaimTemplates`로 만들어진 PVC는 자동 삭제되지 않는다. 데이터 보호 목적. 정리하려면 별도 명령 필요.

---

## Snapshot — 백업

```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: pvc-snapshot
spec:
  volumeSnapshotClassName: csi-snapshot
  source:
    persistentVolumeClaimName: data-pvc
```

CSI 드라이버와 VolumeSnapshotClass가 설치되어 있어야 한다.

---

## 자주 하는 실수

### Pending인데 원인 모름

PVC가 Pending이라면:

```bash
kubectl describe pvc <name>
```

가장 먼저 본다. `storageClassName`이 잘못됐거나, AccessMode를 백엔드가 지원 안 하거나, Quota 초과가 흔한 원인.

### Namespace 분리

PVC는 Namespaced 리소스. **다른 Namespace의 PVC를 참조할 수 없다**. 같은 PV를 Namespace 간 공유하려면 RWX 백엔드 + 별도 PV/PVC 두 쌍이 필요하다.

### PVC 삭제 시점

Pod가 PVC를 사용 중일 때 PVC를 삭제하려고 하면 finalizer가 막아 즉시 삭제되지 않는다(Pod가 사라지면 그때 삭제). 의도하지 않은 데이터 손실 방지.

---

## 정리

PVC는 **요청자**, PV는 **자원**, StorageClass는 **자동 생성기**다. 이 셋의 관계가 Kubernetes 스토리지의 전부다. 다음 글부터는 설정 데이터를 다루는 **ConfigMap**과 **Secret**을 본다.
