---
title: "Kubernetes Secret — 'Encoded'와 'Encrypted'의 차이를 분명히"
date: "2026-05-11"
summary: "Secret이 base64인 건 암호화가 아니다. etcd 암호화, 외부 KMS 연동, External Secrets Operator까지 — 진짜 안전한 비밀 관리에 필요한 것들을 정리한다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - Secret
  - Security
featured: false
---

# Kubernetes Secret — 'Encoded'와 'Encrypted'의 차이를 분명히

## Secret이 ConfigMap과 다른 점

겉모습은 ConfigMap과 거의 같다. 차이는:

1. `data` 필드의 값이 **base64 인코딩** 형태
2. **메모리 tmpfs**에 저장되어 노드 디스크에 안 떨어짐(볼륨 마운트 시)
3. RBAC에서 별도 자원으로 분리 가능
4. `type` 필드로 형식 정해진 Secret(TLS, dockerconfigjson 등) 사용 가능

---

## 가장 중요한 사실

> **base64는 암호화가 아니다. 인코딩이다.**

```bash
echo "supersecret" | base64
# c3VwZXJzZWNyZXQK

echo "c3VwZXJzZWNyZXQK" | base64 -d
# supersecret
```

누구나 디코딩 가능. Secret YAML을 git에 커밋하면 평문을 커밋한 것과 같다.

진짜 보호는 **etcd 암호화**, **RBAC**, 또는 **외부 KMS**(Vault, AWS Secrets Manager 등) 연동으로 해결한다.

---

## 기본 YAML

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
data:
  username: YWRtaW4=          # admin
  password: c3VwZXJzZWNyZXQ=  # supersecret
```

또는 평문 그대로 적고 싶다면:

```yaml
stringData:
  username: admin
  password: supersecret
```

`stringData`로 적은 값은 저장 시 자동으로 base64 인코딩된다. 사람이 읽고 쓰기 편하다.

---

## Secret Type

| type | 용도 |
|---|---|
| `Opaque` | 임의의 사용자 정의 (기본) |
| `kubernetes.io/tls` | TLS 인증서/키 (`tls.crt`, `tls.key`) |
| `kubernetes.io/dockerconfigjson` | Private 레지스트리 인증 |
| `kubernetes.io/basic-auth` | username/password |
| `kubernetes.io/ssh-auth` | SSH 키 |
| `kubernetes.io/service-account-token` | ServiceAccount 토큰 |

### TLS Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-tls
type: kubernetes.io/tls
data:
  tls.crt: BASE64_CERT
  tls.key: BASE64_KEY
```

또는 CLI로:

```bash
kubectl create secret tls app-tls --cert=cert.pem --key=key.pem
```

### Docker Registry Secret

```bash
kubectl create secret docker-registry regcred \
  --docker-server=registry.example.com \
  --docker-username=user \
  --docker-password=pass
```

Pod에서 사용:

```yaml
spec:
  imagePullSecrets:
    - name: regcred
  containers:
    - name: app
      image: registry.example.com/private/app:1.0
```

---

## Pod에 주입

ConfigMap과 같은 4가지 방식.

```yaml
# 환경변수
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-credentials
        key: password

# 전체 import
envFrom:
  - secretRef:
      name: db-credentials

# 볼륨
volumes:
  - name: secret
    secret:
      secretName: db-credentials
      defaultMode: 0400   # 권한
```

볼륨 마운트 시 노드 디스크에 떨어지지 않고 **tmpfs**(메모리)에 올라간다.

---

## etcd 암호화 (EncryptionConfiguration)

API 서버 설정으로 etcd에 저장될 때 암호화한다.

```yaml
# /etc/kubernetes/encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources: [secrets]
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: BASE64_32BYTE_KEY
      - identity: {}   # fallback (평문)
```

이걸 켜야 비로소 etcd dump를 떠도 Secret이 평문으로 안 보인다.

KMS provider를 쓰면 키 자체가 외부(AWS KMS, GCP KMS, Vault Transit)에 있어 더 안전하다.

---

## 외부 비밀 저장소 연동

운영에서는 Secret을 클러스터에 직접 넣기보다 외부 저장소를 참조하는 패턴이 늘었다.

### External Secrets Operator

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: db-credentials
  data:
    - secretKey: password
      remoteRef:
        key: prod/db
        property: password
```

AWS Secrets Manager의 값을 주기적으로 가져와 K8s Secret으로 동기화. 비밀 회전이 자동화된다.

### Sealed Secrets

```yaml
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: db-credentials
spec:
  encryptedData:
    password: AgB7Js...   # 클러스터 공개키로 암호화됨
```

git에 커밋해도 안전. 클러스터의 controller만 복호화 가능.

---

## 자주 하는 실수

### git에 평문 Secret 커밋

`stringData`나 `data: { password: cGFzcw== }`을 그대로 git에 푸시. **base64는 인코딩이지 암호화가 아니다**. Sealed Secrets, SOPS 같은 도구로 암호화 후 커밋하자.

### imagePullSecret 누락

Private 레지스트리 이미지 풀이 실패하는 가장 흔한 원인. Pod의 `imagePullSecrets` 필드 또는 ServiceAccount에 등록.

### envFrom으로 의도치 않은 환경변수

Secret 전체를 envFrom으로 주입했는데, 새 키가 추가되어 충돌 발생. 명시적인 `secretKeyRef`가 디버깅 측면에서 안전하다.

---

## 정리

Secret의 첫 번째 진실: **base64 ≠ 암호화**. 진짜 보호는 etcd 암호화, RBAC, 외부 KMS 연동의 조합으로 만든다. 다음 글부터는 자원 사용을 통제하는 **ResourceQuota**와 **LimitRange**를 다룬다.
