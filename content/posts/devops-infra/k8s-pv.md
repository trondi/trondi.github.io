---
title: "Kubernetes PersistentVolume — 클러스터 전역의 실제 스토리지 자원"
date: "2026-05-08"
summary: "PV는 단순한 스토리지가 아니라 'Pod의 라이프사이클과 분리된 클러스터 자원'이다. AccessMode, ReclaimPolicy, Phase 같은 개념이 운영에서 어떤 의미를 가지는지 정리한다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - PersistentVolume
  - PV
  - Storage
featured: false
---

# Kubernetes PersistentVolume — 클러스터 전역의 실제 스토리지 자원

## PV가 분리된 객체로 존재하는 이유

Pod는 죽으면 사라지지만, 그 안의 데이터는 살아있어야 할 때가 있다. 그래서 스토리지를 Pod 라이프사이클에서 **분리된 객체**로 둔다.

- **PV (PersistentVolume)** — 실제 스토리지 자원. 클러스터 전역 객체.
- **PVC (PersistentVolumeClaim)** — Pod가 "이런 스토리지를 원해요"라고 요청하는 객체.

비유하자면 PV는 호텔 방이고, PVC는 예약 신청서다.

---

## 정적 PV YAML

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: pv-data-01
spec:
  capacity:
    storage: 10Gi
  volumeMode: Filesystem
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: manual
  hostPath:
    path: /mnt/data
```

`hostPath`는 단일 노드 테스트용. 실제로는 NFS, EBS, Ceph 같은 백엔드를 쓴다.

---

## AccessMode 4가지

| 모드 | 의미 |
|---|---|
| `ReadWriteOnce` (RWO) | 단일 노드에서 R/W |
| `ReadOnlyMany` (ROX) | 여러 노드에서 RO |
| `ReadWriteMany` (RWX) | 여러 노드에서 R/W |
| `ReadWriteOncePod` (RWOP, 1.27+) | 단일 Pod에서만 R/W |

> **중요**: AccessMode는 PV의 *속성*이 아니라 *마운트 방식*에 대한 약속이다. EBS는 RWO만 지원, NFS는 RWX 가능. 백엔드 능력을 넘는 모드를 선언해도 실제로는 동작하지 않는다.

`ReadWriteMany`가 필요한 경우(여러 Pod가 같은 디렉토리 공유): NFS, CephFS, EFS 같은 분산 파일시스템 필요.

---

## volumeMode

```yaml
spec:
  volumeMode: Filesystem   # 기본
```

또는:

```yaml
spec:
  volumeMode: Block        # 블록 디바이스로 그대로 노출, 앱이 직접 포맷
```

DB가 raw 디바이스를 요구할 때 사용. 일반적으론 `Filesystem`.

---

## Phase (PV의 상태)

| Phase | 의미 |
|---|---|
| Available | PVC와 바인딩되지 않은 자유 상태 |
| Bound | 특정 PVC와 바인딩됨 |
| Released | 바인딩됐던 PVC가 삭제됨, 아직 정리 전 |
| Failed | 자동 정리 실패 |

`Released` 상태의 PV는 **다른 PVC에 자동 바인딩되지 않는다**. 데이터가 남아있을 수 있어서다. 재사용하려면 수동 작업 필요.

---

## ReclaimPolicy

PVC가 삭제될 때 PV의 운명을 결정.

```yaml
spec:
  persistentVolumeReclaimPolicy: Retain
```

| 값 | 동작 |
|---|---|
| Delete | PV와 백엔드 스토리지 모두 삭제 (StorageClass의 기본 동작과 같음) |
| Retain | PV는 `Released`로 남고, 데이터 유지. 수동 정리 |
| Recycle | 기본 청소 후 재사용 (deprecated) |

---

## 동적 vs 정적 프로비저닝

### 동적 (대부분의 경우)

```
PVC ──storageClassName 지정──▶ StorageClass ──provisioner──▶ PV 자동 생성
```

관리자는 StorageClass만 만들어두고, 사용자는 PVC만 만든다.

### 정적

```
관리자: PV 미리 생성
사용자: PVC 생성 → 매칭되는 PV가 있으면 바인딩
```

레거시 NFS 같은 환경에서. 또는 특정 PV에만 바인딩하고 싶을 때.

---

## PVC가 특정 PV에 바인딩되도록 강제

```yaml
# PV 쪽
metadata:
  name: pv-data-01
spec:
  claimRef:
    namespace: default
    name: my-pvc

# PVC 쪽
metadata:
  name: my-pvc
spec:
  volumeName: pv-data-01
```

---

## 자주 하는 실수

### AccessMode 오해

`ReadWriteOnce`는 "Pod 1개"가 아니라 "노드 1개"다. 같은 노드의 여러 Pod가 같은 RWO PV를 마운트할 수 있다(주의: 동시 쓰기 시 corruption 가능). 진짜 단일 Pod 보장은 `ReadWriteOncePod`.

### Released 상태 방치

Retain 정책으로 PVC를 지웠더니 PV가 Released로 영원히 남음. 정리 스크립트나 수동 검토 필요.

---

## 정리

PV는 **Pod와 분리된 클러스터 자원**이다. AccessMode는 백엔드의 능력에 종속되고, ReclaimPolicy는 데이터 안전과 자원 관리의 트레이드오프다. 다음 글에서는 PV를 요청하는 입장인 **PVC**를 다룬다.
