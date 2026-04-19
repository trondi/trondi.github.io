---
title: "Docker 개념 정리 — 컨테이너부터 Dockerfile까지"
date: "2026-04-19"
summary: "VM과 컨테이너의 차이, 이미지·컨테이너·레지스트리 구조, Dockerfile 작성 방법까지 Docker 핵심 개념을 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Container
  - DevOps
featured: false
---

# Docker 개념 정리 — 컨테이너부터 Dockerfile까지

## 왜 Docker인가

애플리케이션을 배포하다 보면 "내 로컬에선 잘 되는데 서버에서 안 된다"는 상황을 자주 겪는다. 원인은 대부분 **환경 차이**다 — Node.js 버전, OS, 설치된 패키지 등. Docker는 이 문제를 **컨테이너**라는 단위로 해결한다. 애플리케이션과 실행 환경을 함께 묶어 어디서든 동일하게 동작하도록 보장한다.

---

## VM vs 컨테이너

```diagram
docker-concepts
```

| | VM | 컨테이너 |
|---|---|---|
| 가상화 단위 | 하드웨어 (OS 포함) | 프로세스 (OS 공유) |
| 기동 시간 | 수십 초 | 수백 ms |
| 이미지 크기 | 수 GB | 수십~수백 MB |
| 격리 수준 | 강함 | 충분함 (namespace/cgroup) |

VM은 하이퍼바이저 위에 Guest OS 전체를 올리기 때문에 무겁다. 컨테이너는 Host OS의 커널을 공유하고 **프로세스 격리**만 수행하므로 훨씬 가볍다. Docker는 Linux의 `namespace`(격리)와 `cgroup`(자원 제한)을 활용해 이를 구현한다.

---

## 핵심 개념 3가지

### 1. 이미지 (Image)

컨테이너를 만들기 위한 **읽기 전용 템플릿**이다. Layer 구조로 이루어져 있어, 변경된 레이어만 재빌드한다.

```
ubuntu:22.04          ← base layer
node:20-alpine        ← runtime layer
COPY . /app           ← app layer
```

### 2. 컨테이너 (Container)

이미지를 **실행한 인스턴스**다. 이미지 위에 쓰기 가능한 레이어가 추가된다. 컨테이너를 삭제하면 해당 레이어도 사라진다.

```bash
docker run -d -p 3000:3000 --name my-app my-image:latest
```

### 3. 레지스트리 (Registry)

이미지를 저장하고 공유하는 저장소다. 공개 레지스트리로는 **Docker Hub**가 있고, 사내에서는 ECR(AWS), GCR(GCP), Harbor 등을 사용한다.

```bash
docker pull node:20-alpine          # 이미지 받기
docker push my-registry/my-app:1.0  # 이미지 올리기
```

---

## Dockerfile 작성

Dockerfile은 이미지를 만드는 **레시피**다.

```dockerfile
# 1. 베이스 이미지 선택
FROM node:20-alpine AS base

# 2. 작업 디렉토리 설정
WORKDIR /app

# 3. 의존성 설치 (캐시 활용을 위해 package.json 먼저 복사)
COPY package.json package-lock.json ./
RUN npm ci --only=production

# 4. 소스 복사
COPY . .

# 5. 빌드
RUN npm run build

# 6. 포트 노출
EXPOSE 3000

# 7. 실행 명령
CMD ["node", "server.js"]
```

### 멀티 스테이지 빌드

빌드 결과물만 최종 이미지에 포함시켜 크기를 줄이는 패턴이다.

```dockerfile
# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
RUN npm ci && npm run build

# --- Production stage ---
FROM node:20-alpine AS runner
WORKDIR /app
# 빌드 결과물만 복사
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
```

빌드 도구(`npm`, TypeScript 컴파일러 등)가 최종 이미지에 포함되지 않아 이미지 크기가 크게 줄어든다.

---

## 자주 쓰는 명령어

```bash
# 이미지 관련
docker build -t my-app:latest .     # Dockerfile로 이미지 빌드
docker images                        # 이미지 목록
docker rmi my-app:latest             # 이미지 삭제

# 컨테이너 관련
docker run -d -p 3000:3000 my-app    # 백그라운드 실행
docker ps                            # 실행 중인 컨테이너 목록
docker ps -a                         # 전체 컨테이너 목록
docker stop my-app                   # 컨테이너 중지
docker rm my-app                     # 컨테이너 삭제
docker logs -f my-app                # 로그 스트리밍
docker exec -it my-app sh            # 컨테이너 내부 접속

# 볼륨 / 네트워크
docker volume create my-vol
docker run -v my-vol:/data my-app
```

---

## docker-compose

여러 컨테이너를 함께 관리할 때 사용한다. 예시: Next.js 앱 + PostgreSQL.

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/mydb
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb

volumes:
  postgres_data:
```

```bash
docker compose up -d    # 모든 서비스 시작
docker compose down     # 모든 서비스 중지 및 삭제
docker compose logs -f  # 로그 확인
```

---

## 정리

Docker를 쓰면 "환경 차이" 문제를 근본적으로 해결할 수 있다. 이미지 → 컨테이너 → 레지스트리의 흐름을 이해하고, Dockerfile 레이어 캐시 전략(의존성 먼저 복사)과 멀티 스테이지 빌드를 잘 활용하면 빌드 속도와 이미지 크기 두 가지를 모두 잡을 수 있다.
