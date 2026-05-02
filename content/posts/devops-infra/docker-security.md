---
title: "Docker 시리즈 ⑧ Security — 컨테이너 보안의 기본"
date: "2026-05-09"
summary: "컨테이너 보안의 기초 — non-root 실행, 시크릿 관리, .dockerignore, 이미지 스캔, 리소스 제한까지 초보자도 챙겨야 할 핵심을 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Security
  - DevOps
featured: false
---

# Docker 시리즈 ⑧ Security — 컨테이너 보안의 기본

> 시리즈 순서: Host → Image → Container → Network → Volume → Dockerfile → Compose → **Security** → Swarm

## 들어가며

"내 컨테이너에 누가 접근하겠어?"라는 생각이 가장 위험하다. **컨테이너는 격리되어 있지만 완전 안전한 박스는 아니다.** 잘못 설정하면 호스트까지 영향이 갈 수 있다.

이 글에선 초보자도 반드시 챙겨야 할 **6가지 핵심 보안 수칙**을 정리한다.

---

## 1. non-root 사용자로 실행하기

**가장 중요한 한 가지.** Docker 컨테이너는 기본적으로 **root 권한**으로 실행된다. 컨테이너가 탈출되면 호스트 root 권한을 가져갈 수 있다는 뜻이다.

### ❌ 위험한 Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN yarn install
CMD ["node", "server.js"]
# ↑ root로 실행됨 ❌
```

### ✅ 안전한 Dockerfile

```dockerfile
FROM node:20-alpine

# 일반 사용자 생성
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

WORKDIR /app
COPY --chown=appuser:nodejs . .
RUN yarn install

USER appuser                    # 사용자 변경
CMD ["node", "server.js"]
```

`USER` 지시문 이후의 모든 명령은 그 사용자 권한으로 실행된다.

### Compose에서

```yaml
services:
  app:
    image: my-app
    user: "1001:1001"           # UID:GID 직접 지정도 가능
```

---

## 2. 시크릿(비밀번호, API 키)을 이미지에 박지 말기

### ❌ 절대 하지 말기

```dockerfile
ENV API_KEY="sk-abc123..."        # ❌ 이미지에 영구 박힘
```

```yaml
# docker-compose.yml
services:
  app:
    environment:
      DB_PASSWORD: "mypassword"   # ❌ 깃에 그대로 올라감
```

```dockerfile
COPY .env .                        # ❌ .env가 이미지에 포함됨
```

이미지를 받은 사람이 `docker history`나 `docker inspect`로 다 볼 수 있다.

### ✅ 올바른 방법

**방법 A: 런타임 환경변수**

```bash
docker run -e API_KEY=$API_KEY my-app
docker run --env-file ./secrets.env my-app
```

**방법 B: Docker secrets (Swarm 모드)**

```yaml
services:
  app:
    secrets:
      - db_password

secrets:
  db_password:
    file: ./db_password.txt
```

`/run/secrets/db_password` 파일로 컨테이너 안에서 접근.

**방법 C: BuildKit secrets (빌드 시점)**

```dockerfile
# syntax=docker/dockerfile:1.4
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN=$(cat /run/secrets/npm_token) yarn install
```

```bash
docker build --secret id=npm_token,src=$HOME/.npmrc .
```

이미지에 토큰이 절대 안 남는다.

**방법 D: 외부 시크릿 매니저**

운영 환경에선 AWS Secrets Manager, HashiCorp Vault 등을 쓰는 게 정석.

---

## 3. `.dockerignore`로 민감 파일 제외

`.dockerignore`가 없으면 `COPY . .` 시 `.env`, `.git`, `node_modules`까지 다 이미지에 들어간다.

```
# .dockerignore
.git
.env
.env.*
*.log
*.key
*.pem
node_modules
.DS_Store
.vscode
.idea
secrets/
```

특히 `.env`와 `.git/`은 **반드시 제외**. `.git`엔 커밋 히스토리 전체가 들어있어서 과거에 잠깐 커밋된 시크릿까지 노출될 수 있다.

---

## 4. 이미지 신뢰성 — 어떤 이미지를 쓸 것인가

### 공식 / 검증된 이미지 사용

- Docker Hub의 **Official Image** 마크 (예: `nginx`, `postgres`)
- **Verified Publisher** (Microsoft, AWS 등)
- 사내 레지스트리에서 자체 빌드한 이미지

### 태그보다 다이제스트로 고정

운영 환경에선 태그 대신 다이제스트로 고정.

```dockerfile
FROM nginx@sha256:a6bd71f48f68c5b8...
```

태그는 게시자가 다른 이미지로 바꿀 수 있지만, 다이제스트는 영원히 고정이다 (Image 글 참고).

### 이미지 스캔하기

이미지 안에 알려진 취약점(CVE)이 있는지 검사하는 도구를 쓰자.

```bash
# Trivy (가장 많이 씀, 무료)
trivy image my-app:latest

# Docker Scout (Docker Desktop 내장)
docker scout cves my-app:latest

# Snyk
snyk container test my-app:latest
```

CI에 통합하면 PR에 자동으로 결과가 뜨게 할 수 있다.

---

## 5. 리소스 제한 걸기

기본값으로 컨테이너는 **호스트의 모든 자원**을 쓸 수 있다. 잘못된 코드 한 줄로 메모리 누수가 일어나면 호스트 전체가 멈춘다.

### `docker run`에서

```bash
docker run -d \
  --memory="512m" \
  --memory-swap="512m" \
  --cpus="1.0" \
  --pids-limit=100 \
  my-app
```

| 옵션 | 의미 |
|------|------|
| `--memory` | 최대 메모리 |
| `--memory-swap` | 메모리 + 스왑 합계 (스왑 막으려면 메모리와 같게) |
| `--cpus` | CPU 코어 수 (소수점 가능) |
| `--pids-limit` | 프로세스 수 제한 (fork bomb 방어) |

### Compose에서

```yaml
services:
  app:
    image: my-app
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          memory: 256M
```

---

## 6. 쓸데없는 권한 / 기능 제거

### `--privileged` 사용 금지

```bash
docker run --privileged my-app    # ❌ 호스트 거의 다 쓸 수 있음
```

이건 컨테이너에 거의 root 권한을 주는 것과 같다. 정말 특수한 경우(Docker-in-Docker 등) 외엔 쓰지 말자.

### Linux Capability 최소화

컨테이너가 가진 권한 일부를 빼는 방법.

```bash
docker run \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  my-app
```

대부분의 앱은 모든 capability가 필요하지 않다. `ALL`을 빼고 진짜 필요한 것만 추가하는 게 안전하다.

### 읽기 전용 루트 파일시스템

```bash
docker run --read-only my-app
```

컨테이너의 루트 파일시스템을 읽기 전용으로 만든다. 쓰기 필요한 곳은 별도 볼륨/tmpfs로.

```bash
docker run --read-only \
  --tmpfs /tmp \
  -v app-data:/data \
  my-app
```

---

## 빠르게 점검하는 보안 체크리스트

새 이미지/컨테이너를 띄우기 전에 한번씩 확인:

- [ ] Dockerfile에 `USER` 지시문이 있는가? (root 실행 X)
- [ ] `.dockerignore`에 `.env`, `.git` 등 민감 파일이 들어있는가?
- [ ] 이미지에 비밀번호/토큰이 박혀있지 않은가? (`docker history`로 확인)
- [ ] 베이스 이미지가 신뢰할 만한가? (공식 / Verified Publisher)
- [ ] 이미지 스캔을 돌려봤는가? (Trivy 등)
- [ ] 리소스 제한이 걸려있는가? (`--memory`, `--cpus`)
- [ ] `--privileged`를 쓰지 않는가?
- [ ] 운영용은 다이제스트(`@sha256:...`)로 고정되어 있는가?

---

## 헷갈리는 포인트

### ❓ "Alpine 이미지가 보안에 좋다고 하던데요?"
이미지가 작아서 **공격 표면이 좁은 건 맞다.** 패키지가 적으니 취약점도 적다. 다만 절대적으로 안전한 건 아니고, 호환성 문제(musl libc)는 별개로 신경 써야 한다.

### ❓ "USER를 바꿨더니 권한 에러가 나요"
파일/디렉토리의 소유자가 root인데 일반 사용자로 실행하면 쓰기 권한이 없어 에러난다.

```dockerfile
# 미리 소유권 변경
COPY --chown=appuser:nodejs . .

# 또는 RUN으로
RUN chown -R appuser:nodejs /app
```

### ❓ "비밀번호를 환경변수로 넘기는 게 안전한가요?"
완벽하진 않다. `docker inspect`로 환경변수가 보일 수 있다. 진짜 민감한 건 **secrets** 메커니즘이나 외부 매니저를 써야 한다.

### ❓ "취약점 스캔 결과가 너무 많아요"
모든 CVE를 다 막을 순 없다. 우선순위:
1. **HIGH/CRITICAL** 등급 먼저
2. 실제로 사용하는 패키지 위주
3. 베이스 이미지 업그레이드로 한꺼번에 해결되는 경우 많음

---

## 정리

보안의 핵심은 단순하다:

1. **non-root 실행** — `USER` 지시문 필수
2. **시크릿 분리** — 이미지에 박지 말기
3. **`.dockerignore`** — `.env`, `.git` 제외
4. **신뢰할 수 있는 이미지** — 공식 + 다이제스트 고정
5. **리소스 제한** — memory, cpus
6. **쓸데없는 권한 제거** — `--privileged` 금지

이 6가지만 지켜도 사고의 90%는 막을 수 있다.

다음 글은 시리즈의 마지막 — 단일 호스트(Compose)를 넘어 여러 호스트로 컨테이너를 배포하는 **Docker Swarm**이다. 그리고 Swarm을 다 배운 뒤에 왜 Kubernetes로 넘어가는지 자연스럽게 이어진다.

> **이전 글**: Docker 시리즈 ⑦ Compose
> **다음 글**: Docker 시리즈 ⑨ Swarm — 여러 호스트로 확장하기
