---
title: "Docker 시리즈 ② Image — 이미지는 어떻게 생긴 걸까?"
date: "2026-05-03"
summary: "Docker 이미지의 레이어 구조, ID·태그·다이제스트 차이, 그리고 이미지가 어떻게 만들어지고 공유되는지를 초보자 눈높이로 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Image
  - Layer
  - DevOps
featured: false
series: "Docker 입문"
seriesOrder: 2
---

# Docker 시리즈 ② Image — 이미지는 어떻게 생긴 걸까?

> 시리즈 순서: Host → **Image** → Container → Network → Volume → Dockerfile → Compose → Security → Swarm

## 들어가며

`docker pull nginx` 한 줄을 치면 어디선가 nginx 이미지가 받아진다. 그런데 이미지가 정확히 뭔지, 왜 같은 이미지를 두 번 받으면 두 번째는 빠른지, `latest`가 진짜 최신인지 모호한 채로 쓰는 경우가 많다.

이 글에서는 **이미지의 정체**를 해부해본다.

---

## 이미지란?

한 줄 정의:

> **컨테이너를 만들기 위한 읽기 전용 템플릿**

비유하면 이렇다:

| 비유 | Docker 세계 |
|------|-------------|
| 붕어빵 틀 | 이미지 |
| 붕어빵 | 컨테이너 |
| 반죽 + 팥 (재료) | 이미지 안의 파일들 |

붕어빵 틀(이미지)은 그 자체로는 먹을 수 없다. 틀로 찍어낸 붕어빵(컨테이너)이 실제로 우리가 먹는 것이다. 같은 틀로 100개의 붕어빵을 찍어낼 수 있듯이, 하나의 이미지로 여러 컨테이너를 만들 수 있다.

---

## 이미지의 진짜 정체: 레이어의 묶음

이미지는 단일 파일이 아니다. **여러 레이어(layer)가 쌓인 형태**다.

```
┌──────────────────────────────────┐
│  Layer 4: COPY app.js (10KB)     │  ← 내가 추가한 코드
├──────────────────────────────────┤
│  Layer 3: RUN npm install (50MB) │  ← 의존성 설치
├──────────────────────────────────┤
│  Layer 2: WORKDIR /app           │  ← 디렉토리 설정
├──────────────────────────────────┤
│  Layer 1: FROM node:20 (180MB)   │  ← 베이스 이미지
└──────────────────────────────────┘
       ↓ 합쳐서 하나의 이미지로 보임
       my-app:latest (230MB)
```

각 레이어는 **이전 레이어 위에 추가된 변경사항**이다. Dockerfile의 한 줄(`FROM`, `RUN`, `COPY` 등)이 보통 한 레이어가 된다.

### 왜 레이어로 나누는가?

**1. 중복 제거 (디스크 공간 절약)**

여러 이미지가 같은 레이어를 쓰면 **디스크에 한 번만 저장**된다.

```
my-app:1.0      ─┐
my-app:2.0      ─┼─→ 셋 다 node:20 레이어 공유
your-service    ─┘     → node:20는 디스크에 1번만 저장
```

**2. 다운로드 속도 (네트워크 절약)**

`docker pull`할 때 **이미 가지고 있는 레이어는 다시 받지 않는다.** 새로운 레이어만 받는다.

```bash
$ docker pull my-app:2.0
Layer 1: Already exists       ← 0초
Layer 2: Already exists       ← 0초
Layer 3: Pulling [=====>]     ← 새로 받음
Layer 4: Pulling [=====>]     ← 새로 받음
```

**3. 빌드 캐시**

Dockerfile을 빌드할 때, **변경되지 않은 레이어는 캐시를 재사용**한다. 이게 빌드 속도의 핵심이다. (다음 글들에서 더 자세히)

---

## 직접 레이어 보기

```bash
$ docker history nginx:latest
IMAGE          CREATED        SIZE      COMMENT
a6bd71f48f68   2 days ago     0B        CMD ["nginx" "-g" "daemon off;"]
<missing>      2 days ago     0B        EXPOSE 80
<missing>      2 days ago     1.6kB     COPY ... docker-entrypoint.d/
<missing>      2 days ago     5.06MB    RUN apt-get install -y nginx
<missing>      2 days ago     74.3MB    /bin/sh -c (debian base)
```

각 줄이 한 레이어다. `SIZE`가 큰 레이어가 디스크/네트워크 비용의 주범이다.

---

## 이미지 ID, 태그, 다이제스트 — 이게 다 뭔데?

가장 헷갈리는 부분이다. 셋은 **같은 이미지를 가리키는 다른 이름표**다.

### 1. 이미지 ID (Image ID)

이미지 자체의 고유 식별자. **이미지 내용으로부터 계산된 SHA-256 해시**다.

```
sha256:a6bd71f48f68c5b8fa4f4e0c8d7e1c4b5d6a8...
       ↑
       앞 12자리만 짧게 표시: a6bd71f48f68
```

내용이 같으면 ID도 같다. 내용이 1바이트라도 바뀌면 ID도 완전히 달라진다.

### 2. 태그 (Tag)

이미지에 붙이는 **사람이 읽을 수 있는 이름표**.

```
nginx:1.25       ← 버전 태그
nginx:latest     ← 최신을 의미하는 관행적 태그
my-app:dev       ← 환경 태그
my-app:abc1234   ← 커밋 SHA 태그
```

형식: `<이미지이름>:<태그>`. 태그를 생략하면 자동으로 `latest`가 붙는다.

> **함정:** `latest`는 "최신"을 자동으로 의미하지 않는다. **그저 태그 이름 중 하나**일 뿐이고, 이미지 게시자가 명시적으로 갱신해줘야 진짜 최신이 된다. 운영 환경에선 `latest` 사용을 피하고 명확한 버전 태그를 쓰는 게 좋다.

### 3. 다이제스트 (Digest)

이미지의 **변경 불가능한 진짜 식별자**. 레지스트리에서 부여한다.

```
nginx@sha256:a6bd71f48f68c5b8fa4f4e0c8d7e1c4b5d6a8...
```

**태그와 다이제스트의 결정적 차이:**
- `nginx:1.25` 태그는 게시자가 다른 이미지로 **재할당할 수 있다** (변경 가능)
- `nginx@sha256:abc...` 다이제스트는 **절대 바뀌지 않는다**

운영 환경에선 다이제스트로 고정하면 "어제 잘 되던 이미지가 오늘 안 됨" 같은 사고를 막을 수 있다.

```bash
# 태그로 받기 (편하지만 가변)
docker pull nginx:1.25

# 다이제스트로 받기 (불변, 안전)
docker pull nginx@sha256:a6bd71f48f68c5b8fa4f4e0c8d7e1c4b5d6a8...
```

---

## 이미지를 얻는 3가지 방법

### 1. `docker pull` — 레지스트리에서 받기

```bash
docker pull nginx:1.25
```

기본은 Docker Hub에서 받아온다. 사내 레지스트리를 쓰려면 주소를 명시한다.

```bash
docker pull my-registry.com/team/my-app:1.0
```

### 2. `docker build` — Dockerfile로 만들기

```bash
docker build -t my-app:1.0 .
```

`Dockerfile`을 읽어서 레이어 단위로 이미지를 만든다. (자세한 내용은 Dockerfile 글에서)

### 3. `docker commit` — 컨테이너에서 만들기 (비추천)

실행 중인 컨테이너의 현재 상태를 이미지로 저장한다.

```bash
docker commit my-container my-image:snapshot
```

**잘 안 쓰는 이유:** 어떻게 만들어졌는지 기록이 안 남아서 재현이 안 된다. Dockerfile로 만드는 게 정석이다.

---

## 자주 쓰는 이미지 명령어

```bash
# 목록 보기
docker images
docker images | grep nginx

# 상세 정보
docker inspect nginx:1.25

# 레이어 히스토리
docker history nginx:1.25

# 태그 추가 (실제로는 같은 이미지에 이름표만 추가)
docker tag my-app:1.0 my-app:latest

# 삭제
docker rmi my-app:1.0
docker rmi $(docker images -q)         # 전체 삭제 (주의!)

# 사용하지 않는 이미지 정리
docker image prune        # dangling 이미지(태그 없는 것)만
docker image prune -a     # 컨테이너에서 안 쓰는 이미지 전부
```

---

## 헷갈리기 쉬운 포인트 정리

### ❓ "이미지를 삭제했는데 디스크가 안 줄어요"
컨테이너가 그 이미지를 쓰고 있으면 삭제가 안 된다.

```bash
$ docker rmi nginx
Error: image is being used by container abc123

# 컨테이너부터 정리
$ docker rm -f abc123
$ docker rmi nginx
```

### ❓ "같은 이름으로 빌드했는데 이전 이미지가 남아있어요"
`docker build -t my-app:1.0 .`을 두 번 실행하면, 새 빌드는 `my-app:1.0` 태그를 가져가지만 **이전 이미지는 태그를 잃은 채로 남는다** (이를 **dangling image**라고 한다).

```bash
$ docker images
REPOSITORY   TAG       IMAGE ID
my-app       1.0       new123          ← 새 이미지
<none>       <none>    old456          ← 태그 뺏긴 이전 이미지

# 정리
$ docker image prune
```

### ❓ "베이스 이미지를 alpine으로 바꿨더니 동작이 달라졌어요"
이미지마다 **OS 배포판이 다르다.** `node:20`은 Debian 기반, `node:20-alpine`은 Alpine Linux 기반이다. Alpine은 `glibc` 대신 `musl libc`를 써서 일부 네이티브 모듈이 동작하지 않을 수 있다.

```
node:20             # 약 1GB, Debian 기반, 호환성 좋음
node:20-slim        # 약 250MB, Debian 슬림
node:20-alpine      # 약 180MB, Alpine, 가벼우나 호환성 주의
```

용량이 작다고 무조건 좋은 건 아니다.

---

## 정리

- 이미지 = **레이어의 묶음**, 읽기 전용 템플릿
- 같은 레이어는 디스크/네트워크 모두에서 재사용
- **ID(내용 해시) / 태그(이름표) / 다이제스트(불변 식별자)** 셋의 차이를 구분
- `latest`는 "최신"이 아니라 그냥 태그 이름이다
- 운영 환경에선 태그보다 다이제스트로 고정하는 게 안전

다음 글에선 이 이미지를 실제로 띄운 결과물인 **컨테이너(Container)**를 다룬다. 컨테이너는 이미지와 어떻게 다르고, 그 안에선 무슨 일이 벌어지는지 살펴본다.

> **이전 글**: Docker 시리즈 ① Host
> **다음 글**: Docker 시리즈 ③ Container — 컨테이너의 생애 주기
