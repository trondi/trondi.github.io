---
title: "Kubernetes Ingress — 하나의 진입점에서 여러 Service로 라우팅"
date: "2026-05-06"
summary: "Service만으로 외부 노출하면 LoadBalancer가 서비스마다 하나씩 필요하다. Ingress + Ingress Controller 조합으로 호스트/경로 기반 라우팅을 한 진입점에서 끝낸다."
category: "DevOps · Infra"
tags:
  - Kubernetes
  - Ingress
  - Networking
  - HTTP
featured: false
---

# Kubernetes Ingress — 하나의 진입점에서 여러 Service로 라우팅

## Ingress가 푸는 문제

Service를 LoadBalancer 타입으로 노출하면 서비스마다 외부 LB(=비용)가 생긴다. 마이크로서비스가 10개면 LB가 10개. 그리고 도메인/경로 기반 라우팅, TLS 종료, 인증 처리는 어디서?

**Ingress**는 한 진입점에서 HTTP(S) 라우팅을 처리한다.

```
Client → Ingress(LB 1개) → Ingress Controller → Service A / Service B / Service C
```

---

## Ingress는 정의일 뿐, 동작은 Controller가 한다

Ingress 리소스는 "이런 라우팅 원해"라는 **선언**이다. 실제로 트래픽을 받는 건 클러스터에 설치된 **Ingress Controller**(nginx, Traefik, HAProxy 등)다.

> Ingress 리소스를 만들었는데 동작하지 않는다면, **Ingress Controller가 설치되어 있지 않은 것**이 가장 흔한 원인이다.

설치 예시 (nginx):

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
```

---

## 기본 YAML

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 8080
```

---

## pathType 3가지

| pathType | 매칭 |
|---|---|
| `Exact` | 경로가 정확히 일치 |
| `Prefix` | 경로 prefix가 일치 (`/foo`는 `/foo`, `/foo/bar` 매칭) |
| `ImplementationSpecific` | Controller에 따라 다름 |

운영에서는 `Prefix`가 가장 흔하다.

---

## 호스트/경로 기반 라우팅 패턴

### 호스트 기반

```yaml
rules:
  - host: app.example.com
    http: ...
  - host: admin.example.com
    http: ...
```

서로 다른 도메인을 하나의 Ingress에서 처리.

### 경로 기반

```yaml
rules:
  - host: example.com
    http:
      paths:
        - path: /
          backend: { service: { name: web, port: { number: 80 } } }
        - path: /api
          backend: { service: { name: api, port: { number: 8080 } } }
```

같은 도메인 내에서 경로별 라우팅.

---

## TLS 종료

```yaml
spec:
  tls:
    - hosts:
        - app.example.com
      secretName: app-tls   # 미리 만들어둔 TLS Secret
  rules:
    - host: app.example.com
      ...
```

Secret 형식:

```yaml
apiVersion: v1
kind: Secret
type: kubernetes.io/tls
metadata:
  name: app-tls
data:
  tls.crt: BASE64_ENCODED_CERT
  tls.key: BASE64_ENCODED_KEY
```

cert-manager를 함께 쓰면 Let's Encrypt 인증서를 자동 발급/갱신할 수 있다.

---

## IngressClass

여러 Ingress Controller(nginx + traefik 등)가 공존할 때, Ingress가 어느 Controller를 쓸지 명시한다.

```yaml
apiVersion: networking.k8s.io/v1
kind: IngressClass
metadata:
  name: nginx
spec:
  controller: k8s.io/ingress-nginx
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
spec:
  ingressClassName: nginx   # 이 Ingress는 nginx controller가 처리
```

---

## Annotation — Controller별 확장 기능

Ingress 표준 스펙은 단순하다. 인증, rate limit, CORS, 캐싱 같은 고급 기능은 Controller별 annotation으로 설정한다.

```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
```

annotation은 Controller별로 다르다. nginx의 annotation은 traefik에서 동작하지 않는다.

---

## Gateway API — Ingress의 후속

Ingress는 단순함에 따른 한계가 있다. **Gateway API**(`gateway.networking.k8s.io`)가 그 후속으로 등장했다. 라우팅을 Gateway, HTTPRoute, TLSRoute 등으로 더 세분화한다. 새 프로젝트라면 Gateway API를 검토할 가치가 있다.

---

## 정리

- Ingress 리소스 ≠ Ingress Controller — Controller가 없으면 동작 안 함
- 호스트/경로 기반 라우팅, TLS 종료를 한 진입점에서 처리
- Controller별 annotation으로 고급 기능 확장
- 새 프로젝트는 Gateway API도 검토

다음 글부터는 스토리지 영역으로 넘어가서 **StorageClass**, **PV**, **PVC**를 다룬다.
