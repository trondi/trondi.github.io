---
title: "Docker 시리즈 ⑦ Compose — 여러 컨테이너 한꺼번에 다루기"
date: "2026-05-08"
summary: "여러 컨테이너를 단일 명령으로 관리하는 docker compose의 구조, 핵심 옵션, 그리고 실무 활용 패턴을 초보자 눈높이로 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Docker Compose
  - DevOps
featured: false
---

# Docker 시리즈 ⑦ Compose — 여러 컨테이너 한꺼번에 다루기

> 시리즈 순서: Host → Image → Container → Network → Volume → Dockerfile → **Compose** → Security → Swarm

## 들어가며

웹 서버 + DB + 캐시 — 보통 앱은 한 컨테이너로 끝나지 않는다. 여러 컨테이너를 **개별 `docker run`으로 띄우면 명령이 길어지고, 종속 관계 챙기기도 힘들다.**

```bash
# 매번 이러기 싫다
docker network create my-net
docker volume create db-data
docker run -d --name db --network my-net -v db-data:/var/lib/... postgres
docker run -d --name redis --network my-net redis
docker run -d --name app --network my-net -p 3000:3000 -e DB_HOST=db ... my-app
```

이 모든 걸 **YAML 파일 하나로** 정리해서 한 명령으로 띄우게 해주는 게 **Docker Compose**다.

---

## 가장 단순한 예시

`docker-compose.yml`:

```yaml
services:
  app:
    image: my-app:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/mydb
    depends_on:
      - db

  db:
    image: postgres:16
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
```

실행:

```bash
docker compose up -d
```

이 한 줄로:
1. 네트워크 자동 생성
2. 볼륨 자동 생성
3. DB 컨테이너 실행
4. App 컨테이너 실행 (DB 시작 후)
5. 포트 매핑 / 환경변수 설정 자동 처리

---

## Compose가 자동으로 해주는 것들

### 1. 네트워크 자동 구성

Compose는 프로젝트마다 **사용자 정의 네트워크**를 자동으로 만든다. 모든 서비스가 그 네트워크에 들어가서, **서비스 이름으로 서로 부를 수 있다.**

```yaml
services:
  app:
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/mydb
      #                                ↑
      #                                "db" 서비스 이름이 곧 호스트명
  db:
    image: postgres
```

이게 가능한 이유는 [Network 글](./docker-network)에서 다룬 사용자 정의 네트워크의 DNS 기능 덕이다.

### 2. 종속 관계 관리

```yaml
services:
  app:
    depends_on:
      - db
      - redis
```

`app`은 `db`, `redis`가 시작된 **후에** 시작된다.

> **주의:** `depends_on`은 "컨테이너가 떠 있는지"만 보장하지, "준비가 됐는지"는 보장 안 한다. DB가 부팅 중인데 앱이 연결을 시도해서 실패할 수 있다. 이건 `healthcheck`로 해결한다 (아래 참고).

### 3. 볼륨 / 환경변수 일괄 관리

`.env` 파일 하나로 여러 서비스의 환경변수 관리 가능.

---

## 주요 설정 항목

### `image` vs `build`

```yaml
services:
  # 1. 기존 이미지 사용
  redis:
    image: redis:7-alpine

  # 2. 직접 빌드
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NODE_VERSION: 20
```

### `ports` — 포트 매핑

```yaml
ports:
  - "3000:3000"             # 호스트:컨테이너
  - "127.0.0.1:8080:80"     # 로컬 한정
```

### `environment` — 환경변수

```yaml
environment:
  NODE_ENV: production
  DATABASE_URL: ${DATABASE_URL}    # .env 파일에서 읽기

# 또는 파일로 한꺼번에
env_file:
  - .env
```

### `volumes`

```yaml
services:
  db:
    volumes:
      - db-data:/var/lib/postgresql/data    # named volume
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro   # bind mount

volumes:
  db-data:                                  # 명시적 선언
```

### `restart` — 재시작 정책

```yaml
restart: unless-stopped       # 가장 많이 씀
# no | always | on-failure | unless-stopped
```

### `networks` — 네트워크 분리

여러 네트워크를 만들어 서비스를 분리할 수 있다.

```yaml
services:
  app:
    networks:
      - frontend
      - backend
  db:
    networks:
      - backend         # frontend엔 안 보임

networks:
  frontend:
  backend:
```

### `healthcheck`

```yaml
services:
  db:
    image: postgres
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 5s
      timeout: 3s
      retries: 5

  app:
    depends_on:
      db:
        condition: service_healthy    # db가 healthy일 때만 시작
```

이게 `depends_on`만 쓸 때의 한계를 해결해준다.

---

## 자주 쓰는 명령어

```bash
# 시작
docker compose up                # 포어그라운드
docker compose up -d             # 백그라운드 (가장 많이 씀)
docker compose up --build        # 이미지 새로 빌드 후 시작

# 정지
docker compose stop              # 멈춤만 (제거 X)
docker compose down              # 멈춤 + 컨테이너/네트워크 제거
docker compose down -v           # 볼륨까지 삭제 (주의!)

# 상태 보기
docker compose ps                # 서비스 상태
docker compose logs              # 로그 (모든 서비스)
docker compose logs -f app       # 특정 서비스만 실시간

# 명령 실행
docker compose exec app sh       # 컨테이너 안 셸
docker compose run --rm app yarn test    # 일회성 실행

# 빌드
docker compose build             # 이미지만 빌드
docker compose pull              # 외부 이미지만 받기
```

---

## 환경별 설정 분리

개발/스테이징/운영에서 설정이 다른 경우.

### 방법 1: override 파일

`docker-compose.yml` (공통):
```yaml
services:
  app:
    image: my-app
    environment:
      NODE_ENV: production
```

`docker-compose.override.yml` (개발 자동 적용):
```yaml
services:
  app:
    build: .
    environment:
      NODE_ENV: development
    volumes:
      - .:/app                  # 소스 마운트로 핫리로드
```

`docker compose up`을 그냥 실행하면 **두 파일이 자동으로 합쳐진다.**

### 방법 2: 명시적 파일 지정

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 방법 3: profile

```yaml
services:
  app:
    image: my-app
  debug:
    image: debug-tools
    profiles: ["debug"]         # 평소엔 안 뜸
```

```bash
docker compose up                    # app만
docker compose --profile debug up    # debug까지 같이
```

---

## 실전 예시

### 예시 1: Next.js + PostgreSQL + Redis

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/mydb
      REDIS_URL: redis://cache:6379
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 5s
      retries: 5
    restart: unless-stopped

  cache:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  db-data:
```

### 예시 2: 개발 환경 핫 리로드

```yaml
services:
  app:
    build:
      context: .
      target: dev               # Dockerfile의 dev stage
    ports:
      - "3000:3000"
    volumes:
      - .:/app                  # 소스 변경 즉시 반영
      - /app/node_modules       # node_modules는 컨테이너 것 사용
    command: yarn dev
```

---

## 헷갈리는 포인트

### ❓ "`docker-compose`와 `docker compose` 차이는?"
- `docker-compose` (하이픈): 옛날 v1, Python으로 작성, 별도 설치 필요
- `docker compose` (공백): 새로운 v2, Go로 재작성, Docker에 내장

**v2를 쓰자.** Docker Desktop이나 최신 Docker Engine엔 기본 포함이다.

### ❓ "왜 `depends_on`이 있는데도 앱이 DB 연결에 실패해요?"
`depends_on`은 컨테이너가 시작됐는지만 본다. **DB가 연결을 받을 준비가 됐는지는 다름.** `healthcheck` + `condition: service_healthy`를 같이 써야 한다.

### ❓ "환경변수가 적용이 안 돼요"
`.env` 파일은 Compose 파일과 같은 위치에 있어야 한다. 이름도 정확히 `.env`.

```yaml
# docker-compose.yml에서 변수 사용
environment:
  DATABASE_URL: ${DATABASE_URL}
```

```
# .env 파일
DATABASE_URL=postgres://...
```

### ❓ "down 했더니 데이터가 사라졌어요"
`docker compose down`은 컨테이너만 지운다. 볼륨은 살아있다. 하지만 `-v` 옵션을 붙이면 볼륨도 같이 삭제된다.

```bash
docker compose down       # 볼륨 유지 (안전)
docker compose down -v    # 볼륨까지 삭제 (조심!)
```

### ❓ "이미지를 새로 빌드했는데 적용이 안 돼요"
```bash
docker compose up -d              # 기존 이미지 그대로 씀
docker compose up -d --build      # 이미지 재빌드 ✅
```

---

## 정리

- Compose = 여러 컨테이너를 YAML 하나로 관리
- 서비스 이름이 그대로 호스트명 (네트워크 자동 구성)
- `depends_on` + `healthcheck`로 시작 순서 제어
- `up -d`, `down`, `logs -f`만 알아도 80% 활용
- override 파일로 환경별 설정 분리
- Compose는 **단일 호스트**용이다 → 멀티 호스트가 필요하면 다음 단계: **Swarm**

다음 글에선 컨테이너 보안의 기본 — 비밀번호/시크릿 관리, non-root 실행, 이미지 스캔 등을 다룬다.

> **이전 글**: Docker 시리즈 ⑥ Dockerfile
> **다음 글**: Docker 시리즈 ⑧ Security — 컨테이너 보안의 기본
