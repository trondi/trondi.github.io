---
title: "Docker 시리즈 ⑥ Dockerfile — 이미지를 만드는 레시피"
date: "2026-05-07"
summary: "Dockerfile 명령어 전체 정리 — CMD vs ENTRYPOINT, COPY vs ADD, ARG vs ENV의 차이와 레이어 캐시 최적화 패턴까지 초보자 눈높이로 다룬다."
category: "DevOps · Infra"
tags:
  - Docker
  - Dockerfile
  - DevOps
featured: false
---

# Docker 시리즈 ⑥ Dockerfile — 이미지를 만드는 레시피

> 시리즈 순서: Host → Image → Container → Network → Volume → **Dockerfile** → Compose → Security → Swarm

## 들어가며

이미지를 받아쓰기만 하다가 직접 만들 때가 온다. **Dockerfile**은 "이 이미지를 어떻게 만들어라"를 적어둔 레시피다.

이 글에선 모든 Dockerfile 명령어를 한번에 정리하고, 가장 헷갈리는 포인트들 — `CMD` vs `ENTRYPOINT`, `COPY` vs `ADD`, `ARG` vs `ENV` — 를 명확히 구분한다.

---

## 가장 단순한 Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

각 줄이 하나의 명령이고, 대부분 한 줄이 한 레이어가 된다. 빌드 명령:

```bash
docker build -t my-app:1.0 .
```

`-t`는 태그 지정, 마지막 `.`은 빌드 컨텍스트(현재 디렉토리)다.

---

## 명령어 한눈에 보기

| 명령어 | 역할 |
|--------|------|
| `FROM` | 베이스 이미지 지정 |
| `WORKDIR` | 작업 디렉토리 설정 |
| `COPY` | 파일 복사 (호스트 → 이미지) |
| `ADD` | 파일 복사 + 추가 기능 (URL, 압축 해제) |
| `RUN` | 빌드 시점에 명령 실행 |
| `CMD` | 컨테이너 실행 시 기본 명령 |
| `ENTRYPOINT` | 컨테이너 실행 시 항상 실행되는 명령 |
| `ENV` | 환경변수 설정 (런타임까지 유지) |
| `ARG` | 빌드 시점 변수 (런타임엔 없음) |
| `EXPOSE` | 사용할 포트 명시 (문서화 목적) |
| `VOLUME` | 볼륨 마운트 지점 선언 |
| `USER` | 실행 사용자 변경 |
| `LABEL` | 메타데이터 추가 |
| `HEALTHCHECK` | 컨테이너 헬스체크 정의 |

---

## 주요 명령어 자세히

### `FROM` — 베이스 이미지

```dockerfile
FROM node:20-alpine
FROM ubuntu:22.04
FROM scratch                      # 진짜 빈 이미지 (정적 바이너리용)
```

**팁:** 가능하면 alpine 같은 슬림 이미지를 쓰자. 단, 호환성 주의 (Image 글 참고).

### `WORKDIR` — 작업 디렉토리

```dockerfile
WORKDIR /app
COPY . .                  # /app으로 복사됨
RUN ls                    # /app에서 실행
```

`cd`처럼 동작한다. 없는 디렉토리면 자동으로 만든다.

### `RUN` — 빌드 시점 명령 실행

```dockerfile
RUN yarn install
RUN apt-get update && apt-get install -y curl
```

**팁:** 여러 명령을 `&&`로 묶어 한 RUN으로 처리하면 레이어 수가 줄어든다.

```dockerfile
# ❌ 레이어 3개
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# ✅ 레이어 1개
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*
```

### `EXPOSE` — 포트 문서화

```dockerfile
EXPOSE 3000
```

**중요:** `EXPOSE`는 실제로 포트를 여는 게 **아니다.** 그냥 "이 이미지는 3000번 포트를 쓸 거예요"라는 안내일 뿐. 실제로 외부 접근하려면 `docker run -p`가 필요하다.

### `USER` — 실행 사용자

```dockerfile
RUN addgroup --system app && adduser --system --ingroup app appuser
USER appuser
```

기본값은 root. 보안상 일반 사용자로 바꾸는 게 권장된다 (Security 글에서 자세히).

### `LABEL` — 메타데이터

```dockerfile
LABEL maintainer="me@example.com"
LABEL version="1.0"
```

이미지에 정보를 박아두는 용도. `docker inspect`로 볼 수 있다.

### `HEALTHCHECK` — 헬스체크

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/health || exit 1
```

컨테이너의 살아있음을 주기적으로 검사한다. 실패하면 `unhealthy` 상태가 된다.

---

## 헷갈림 포인트 1: `CMD` vs `ENTRYPOINT`

가장 많이 헷갈린다. 둘 다 "컨테이너 실행 시 무엇을 할지" 정한다.

### `CMD` — 기본 명령 (덮어쓰기 가능)

```dockerfile
FROM nginx
CMD ["nginx", "-g", "daemon off;"]
```

```bash
docker run my-image                 # nginx 실행
docker run my-image echo hello      # CMD 무시되고 echo 실행됨 ❗
```

### `ENTRYPOINT` — 항상 실행 (덮어쓰기 어려움)

```dockerfile
FROM nginx
ENTRYPOINT ["nginx"]
```

```bash
docker run my-image -g "daemon off;"    # nginx -g "daemon off;" 실행
docker run my-image echo hello          # nginx echo hello (의도와 다름) ❗
```

### 둘 다 같이 쓰는 패턴 (실무 권장)

```dockerfile
ENTRYPOINT ["node"]
CMD ["server.js"]
```

```bash
docker run my-image                 # node server.js (기본)
docker run my-image other.js        # node other.js (인자만 변경)
```

**핵심 정리:**

| | CMD | ENTRYPOINT |
|---|---|---|
| 의미 | 기본 명령 | 진짜 명령 |
| 덮어쓰기 | `docker run`의 인자로 쉽게 | `--entrypoint` 옵션 필요 |
| 패턴 | 둘 다 쓰기: ENTRYPOINT=명령, CMD=인자 |

### 한 가지 더: 두 가지 형식

```dockerfile
# Exec 형식 (권장)
CMD ["node", "server.js"]

# Shell 형식
CMD node server.js
```

Shell 형식은 `/bin/sh -c`로 감싸져서 실행되는데, 신호 처리(SIGTERM 등)가 제대로 안 될 수 있다. **Exec 형식을 써라.**

---

## 헷갈림 포인트 2: `COPY` vs `ADD`

기능이 비슷한데 미묘하게 다르다.

### `COPY` — 단순 복사 (권장)

```dockerfile
COPY package.json /app/
COPY src/ /app/src/
```

호스트에서 이미지로 파일을 복사하는 것만 한다. 끝.

### `ADD` — 복사 + 추가 기능

```dockerfile
ADD package.json /app/                              # 복사
ADD https://example.com/file.tar.gz /app/           # URL에서 다운로드
ADD app.tar.gz /app/                                # 자동 압축 해제 ❗
```

**자동 기능이 양날의 검:**
- 의도하지 않게 압축 풀려서 결과가 달라질 수 있음
- URL 다운로드 시 캐시 동작이 헷갈림

**Docker 공식 권장:** **`COPY`를 기본으로 쓰고, 압축 해제가 진짜 필요할 때만 `ADD`.**

---

## 헷갈림 포인트 3: `ARG` vs `ENV`

둘 다 변수를 정의하지만, **언제까지 살아있는지**가 다르다.

### `ARG` — 빌드 시점 전용

```dockerfile
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine

ARG BUILD_DATE
RUN echo "Built on ${BUILD_DATE}"
```

```bash
docker build --build-arg NODE_VERSION=22 --build-arg BUILD_DATE=$(date) -t my-app .
```

- 빌드할 때만 존재
- **컨테이너 안에선 보이지 않음**
- 보안: 비밀번호 같은 민감 정보 사용 금지 (이미지 메타데이터에 남음)

### `ENV` — 빌드 + 런타임 둘 다

```dockerfile
ENV NODE_ENV=production
ENV PORT=3000
```

- 이미지에 박힘
- 컨테이너 실행 후에도 환경변수로 살아있음
- `docker run -e`로 덮어쓰기 가능

### 둘을 함께 쓰는 패턴

```dockerfile
ARG VERSION=1.0
ENV APP_VERSION=${VERSION}
```

빌드 인자로 받은 값을 환경변수로 넘겨서 런타임까지 보존.

**한눈에:**

| | ARG | ENV |
|---|---|---|
| 살아있는 시점 | 빌드 중에만 | 빌드 + 런타임 |
| 컨테이너에서 접근 | ❌ | ✅ |
| `docker run`에서 덮어쓰기 | ❌ | ✅ (`-e`) |
| 용도 | 빌드 옵션 | 런타임 설정 |

---

## 레이어 캐시 최적화

Dockerfile에서 가장 중요한 실전 기술이다.

### 원리

Docker는 각 명령을 레이어로 만들고 **입력이 같으면 캐시를 재사용**한다.

```dockerfile
COPY package.json yarn.lock ./
RUN yarn install
COPY . .
RUN yarn build
```

소스 파일(`src/page.tsx`)을 수정하면:
- 첫 두 줄: 캐시 hit (package.json 변경 없음)
- `COPY . .`: 무효화
- `RUN yarn build`: 재실행

만약 순서를 거꾸로 쓰면:

```dockerfile
COPY . .                # ❌ 소스 한 줄만 바뀌어도 무효화
RUN yarn install        # ❌ 매번 재실행
RUN yarn build
```

이러면 매 빌드마다 의존성 설치를 다시 한다. 매우 느려진다.

### 캐시 최적화 황금 규칙

> **변경 빈도가 낮은 것을 위에, 높은 것을 아래에**

```dockerfile
FROM node:20-alpine
WORKDIR /app

# 1. 거의 안 바뀜 (시스템 패키지)
RUN apk add --no-cache curl

# 2. 가끔 바뀜 (의존성)
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# 3. 자주 바뀜 (소스)
COPY . .
RUN yarn build

CMD ["node", "server.js"]
```

---

## `.dockerignore` 활용

`.gitignore`처럼 빌드 컨텍스트에서 제외할 파일을 지정한다.

```
# .dockerignore
node_modules
.git
.env
*.log
Dockerfile
.dockerignore
README.md
```

**왜 중요한가:**
- `COPY . .` 시 `node_modules`까지 복사되면 **느리고 의도와 다름**
- `.env`가 이미지에 박혀서 **시크릿 유출** 위험
- 빌드 컨텍스트 자체가 작아져서 빌드 속도 향상

---

## 멀티 스테이지 빌드

빌드용과 실행용을 분리해서 최종 이미지를 작게 만든다.

```dockerfile
# Stage 1: build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install
COPY . .
RUN yarn build

# Stage 2: runner
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
CMD ["node", "server.js"]
```

핵심: 최종 이미지에 **빌드 도구(`yarn`, devDependencies)가 안 들어감.** 이미지 크기가 크게 준다.

> 이 패턴의 실전 활용은 [이전 글: Turborepo Docker 멀티스테이지](./turborepo-docker-multistage-cicd) 참고.

---

## 헷갈리는 포인트

### ❓ "RUN과 CMD는 뭐가 달라요?"
- `RUN`: **빌드할 때** 실행 (이미지에 결과 반영)
- `CMD`: **컨테이너가 시작할 때** 실행

```dockerfile
RUN apt-get install -y curl    # 빌드 중에 curl 설치 (이미지에 포함됨)
CMD ["node", "server.js"]      # 컨테이너 시작 시 node 실행
```

### ❓ "WORKDIR vs cd"
```dockerfile
# ❌ cd는 한 번만 작동, 다음 RUN에선 무효
RUN cd /app
RUN pwd                # /가 나옴 ❗

# ✅ WORKDIR
WORKDIR /app
RUN pwd                # /app
```

각 `RUN`은 새로운 셸에서 실행되므로 `cd`가 유지되지 않는다. **반드시 `WORKDIR`을 써라.**

### ❓ "이미지 크기를 줄이고 싶어요"
- alpine 같은 슬림 베이스 이미지 사용
- 멀티 스테이지 빌드
- `RUN` 줄 합치고 `--no-cache`, `rm -rf` 등으로 정리
- `.dockerignore`로 불필요 파일 제외

```dockerfile
RUN apk add --no-cache curl    # 캐시 안 남김
```

---

## 정리

- Dockerfile = 이미지 레시피, 한 줄이 한 레이어
- **`CMD` vs `ENTRYPOINT`**: 보통 둘 다 쓰기 (ENTRYPOINT=명령, CMD=인자)
- **`COPY` vs `ADD`**: COPY를 기본, 압축 해제 시에만 ADD
- **`ARG` vs `ENV`**: ARG는 빌드 시점만, ENV는 런타임까지
- 레이어 캐시 최적화: **변경 빈도 낮은 걸 위에**
- `.dockerignore`로 빌드 컨텍스트 줄이기
- 운영용은 멀티 스테이지 빌드로 슬림하게

다음 글에선 여러 컨테이너를 한꺼번에 관리하는 도구 — **Docker Compose**를 다룬다.

> **이전 글**: Docker 시리즈 ⑤ Volume
> **다음 글**: Docker 시리즈 ⑦ Compose — 여러 컨테이너 한꺼번에 다루기
