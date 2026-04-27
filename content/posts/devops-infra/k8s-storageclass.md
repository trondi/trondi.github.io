---
title: "Kubernetes StorageClass — PV를 자동으로 만들어주는 청사진"
date: "2026-05-07"
summary: "PVC를 만들 때마다 관리자가 PV를 수동으로 만들어줄 수는 없다. StorageClass는 'PVC 들어오면 이런 PV를 자동으로 프로비저닝해라'는 템플릿이다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - StorageClass
  - Storage
  - CSI
featured: false
---

# Kubernetes StorageClass — PV를 자동으로 만들어주는 청사진

## StorageClass의 역할

PVC를 만들면 매칭되는 PV가 필요하다. 옛날에는 관리자가 PV를 미리 잔뜩 만들어두는 **정적 프로비저닝** 방식이었다. 비효율적이고 운영 부담이 크다.

**StorageClass**는 "이런 종류의 스토리지 요청이 오면 이런 PV를 자동으로 만들어라"는 템플릿이다. 이걸 **동적 프로비저닝(Dynamic Provisioning)**이라고 한다.

```
PVC 생성 → StorageClass 참조 → Provisioner가 PV 자동 생성 → PVC ↔ PV 바인딩
```

---

## 기본 YAML (AWS EBS 예시)

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

---

## 핵심 필드

### provisioner

어떤 CSI(Container Storage Interface) 드라이버가 PV를 만들지 지정.

| Provisioner | 환경 |
|---|---|
| `ebs.csi.aws.com` | AWS EBS |
| `pd.csi.storage.gke.io` | GCP Persistent Disk |
| `disk.csi.azure.com` | Azure Disk |
| `kubernetes.io/no-provisioner` | 정적 PV만 사용 (local volume 등) |

### parameters

provisioner마다 다르다. AWS EBS면 type/iops/throughput/encrypted, GCP면 type/replication-type 등.

### reclaimPolicy

PVC가 삭제될 때 PV를 어떻게 할지.

| 값 | 동작 |
|---|---|
| `Delete` | PV와 실제 스토리지(EBS 볼륨 등)까지 삭제 |
| `Retain` | PV는 남고, 데이터 유지. 수동 정리 필요 |

운영 데이터는 `Retain`이 안전하다.

### volumeBindingMode

PV를 언제 생성/바인딩할지.

| 값 | 동작 |
|---|---|
| `Immediate` | PVC 생성 즉시 PV 만들고 바인딩 |
| `WaitForFirstConsumer` | Pod가 스케줄될 때까지 대기 후 바인딩 |

`WaitForFirstConsumer`가 거의 항상 더 좋다. **Pod의 노드 위치를 보고 같은 가용영역(AZ)에 PV를 만들 수 있기 때문**. EBS는 AZ 간 attach가 불가능해서 이게 중요하다.

### allowVolumeExpansion

`true`면 나중에 PVC의 `spec.resources.requests.storage`를 늘려서 볼륨을 확장할 수 있다.

```bash
kubectl patch pvc my-pvc -p '{"spec":{"resources":{"requests":{"storage":"50Gi"}}}}'
```

---

## 기본 StorageClass (Default)

PVC에 `storageClassName`을 명시하지 않으면 default StorageClass가 사용된다.

```yaml
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
```

default는 클러스터당 하나만 권장된다.

---

## 환경별 예시

### local 정적 프로비저닝

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-storage
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
```

PV를 수동으로 만들고 PVC가 그 PV에 바인딩되기를 기다린다.

### NFS (CSI)

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs
provisioner: nfs.csi.k8s.io
parameters:
  server: nfs.example.com
  share: /exports
reclaimPolicy: Retain
```

---

## 자주 하는 실수

### Immediate 바인딩으로 AZ mismatch

EBS PV가 us-east-1a에 만들어졌는데 Pod가 us-east-1b에 스케줄되면 attach 실패. **반드시 `WaitForFirstConsumer`**.

### reclaimPolicy: Delete + 운영 데이터

PVC를 실수로 지웠는데 데이터까지 사라짐. 운영은 `Retain`이 안전하다.

---

## 정리

StorageClass는 **동적 프로비저닝의 핵심**이다. PVC가 어떤 종류의 PV를 받을지(provisioner, parameters), 어떻게 정리될지(reclaimPolicy), 언제 바인딩될지(volumeBindingMode)를 모두 결정한다. 다음 글에서는 StorageClass가 만들어주는 **PV** 객체 자체를 본다.
