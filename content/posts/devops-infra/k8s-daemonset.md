---
title: "Kubernetes DaemonSet — 모든 노드에 정확히 하나씩 떠야 하는 워크로드"
date: "2026-05-02"
summary: "로그 수집, 모니터링 에이전트, CNI 플러그인은 왜 Deployment가 아니라 DaemonSet으로 떠야 하는가. 노드 추가/제거 시 자동 대응 메커니즘과 스케줄링 차이를 정리한다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - DaemonSet
  - Node
  - Workload
featured: false
---

# Kubernetes DaemonSet — 모든 노드에 정확히 하나씩 떠야 하는 워크로드

## DaemonSet이 풀어주는 문제

다음과 같은 워크로드는 "복제본 N개"가 아니라 **"모든 노드에 한 개씩"**이 필요하다.

- **로그 수집기** (Fluent Bit, Filebeat) — 각 노드의 로컬 로그를 읽어야 함
- **모니터링 에이전트** (node-exporter, datadog-agent) — 노드 자체 메트릭 수집
- **네트워크 플러그인** (Calico, Cilium) — 각 노드의 네트워크 설정 담당
- **스토리지 플러그인** (CSI Node Plugin)

Deployment로는 이걸 보장할 수 없다. 노드가 추가되면 자동으로 새 노드에도 떠야 하고, 노드가 제거되면 같이 사라져야 한다.

---

## 기본 YAML

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluent-bit
  namespace: logging
spec:
  selector:
    matchLabels:
      app: fluent-bit
  template:
    metadata:
      labels:
        app: fluent-bit
    spec:
      containers:
        - name: fluent-bit
          image: fluent/fluent-bit:3.0
          volumeMounts:
            - name: varlog
              mountPath: /var/log
              readOnly: true
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
```

`replicas` 필드가 없다. **노드 수 = Pod 수**가 자동 보장된다.

---

## 특정 노드에만 띄우기

모든 노드가 아니라 일부 노드에만 띄우려면 `nodeSelector`나 `affinity`를 쓴다.

```yaml
spec:
  template:
    spec:
      nodeSelector:
        node-role: monitoring
```

또는 `affinity`로 더 유연하게:

```yaml
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/os
                    operator: In
                    values: [linux]
```

---

## Tolerations — Control Plane에도 띄워야 할 때

기본적으로 Control Plane 노드에는 Pod가 스케줄되지 않는다. Taint(`node-role.kubernetes.io/control-plane:NoSchedule`)가 걸려있기 때문이다.

로그 수집 같은 건 Control Plane에서도 돌아야 하므로 Toleration이 필요하다.

```yaml
spec:
  template:
    spec:
      tolerations:
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
        - key: node-role.kubernetes.io/master
          operator: Exists
          effect: NoSchedule
```

---

## hostPath와 hostNetwork

DaemonSet 워크로드는 노드 자체의 자원에 접근해야 할 일이 많다.

```yaml
spec:
  template:
    spec:
      hostNetwork: true       # 노드 네트워크 네임스페이스 공유
      hostPID: true           # 노드 PID 네임스페이스 공유
      dnsPolicy: ClusterFirstWithHostNet
      containers:
        - name: agent
          volumeMounts:
            - name: docker-sock
              mountPath: /var/run/docker.sock
      volumes:
        - name: docker-sock
          hostPath:
            path: /var/run/docker.sock
```

보안상 신중해야 한다. hostPath는 노드 파일시스템을 그대로 노출한다.

---

## RollingUpdate

DaemonSet도 RollingUpdate를 지원한다.

```yaml
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
```

`maxSurge`는 의미가 없다 — 노드당 1개여야 하므로. 대신 `maxUnavailable`로 동시에 업데이트할 노드 수를 조절한다.

`type: OnDelete`로 바꾸면 사람이 수동으로 Pod를 지울 때만 업데이트된다.

---

## 정리

| 비교 | Deployment | DaemonSet |
|---|---|---|
| 분포 | 클러스터 어디든 | 노드당 1개 |
| 스케일 | replicas 필드 | 노드 수 = Pod 수 |
| 용도 | 일반 앱 | 인프라 에이전트 |

"이 워크로드는 모든 노드에 떠야 하는가?"라는 질문에 yes라면 DaemonSet이다.
