---
title: "Docker 시리즈 ⑤ Volume — 데이터를 어떻게 보존하는가"
date: "2026-05-06"
summary: "컨테이너가 삭제돼도 데이터를 살리는 방법 — bind mount, named volume, tmpfs의 차이와 실무 활용을 초보자 눈높이로 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Volume
  - Bind Mount
  - DevOps
featured: false
series: "Docker 입문"
seriesOrder: 5
---

# Docker 시리즈 ⑤ Volume — 데이터를 어떻게 보존하는가

> 시리즈 순서: Host → Image → Container → Network → **Volume** → Dockerfile → Compose → Security → Swarm

## 들어가며

Container 글에서 이야기했듯, **컨테이너를 삭제하면 그 안의 데이터도 사라진다.** 이건 stateless 앱(예: 웹 서버)에선 문제 없지만, 데이터베이스나 사용자 업로드 파일이 있다면 치명적이다.

이 글에선 데이터를 안전하게 살리는 **3가지 방법**을 비교한다.

---

## 컨테이너 안에 데이터를 두면 안 되는 이유

먼저 왜 별도의 저장 방법이 필요한지부터.

```bash
# 1. PostgreSQL 컨테이너 띄움
docker run -d --name db postgres

# 2. 데이터 입력
docker exec db psql -c "INSERT INTO users ..."

# 3. 컨테이너 삭제
docker rm -f db

# 4. 다시 띄움
docker run -d --name db postgres

# 5. 데이터 확인
docker exec db psql -c "SELECT * FROM users"
# → 데이터가 사라졌다 ❌
```

이전 글에서 본 그림을 다시 떠올려보자.

```
┌──────────────────────────┐
│  Container Layer (R/W)   │  ← 데이터가 여기 저장됨
├──────────────────────────┤
│  Image Layers (R/O)      │
└──────────────────────────┘
```

컨테이너 레이어는 **컨테이너와 운명을 같이한다.** 그래서 데이터를 **컨테이너 바깥**에 저장해야 한다.

---

## 데이터를 보존하는 3가지 방법

### 1. Bind Mount — 호스트의 폴더를 직접 연결

호스트 머신의 특정 폴더를 컨테이너 안에 그대로 연결한다.

```bash
docker run -d \
  -v /Users/me/data:/var/lib/postgresql/data \
  postgres
```

```
[호스트]                          [컨테이너]
/Users/me/data    ←──연결──→     /var/lib/postgresql/data
   ↑                                ↑
   실제 파일                          컨테이너에서 보이는 경로
   (호스트에 그대로 저장)
```

**장점:**
- 호스트에서 직접 파일을 보고 편집 가능
- 개발 중 코드를 실시간 반영(핫 리로드)할 때 유용

**단점:**
- 호스트 OS의 경로에 의존 → 다른 환경에서 안 돌 수 있음
- 권한 문제(호스트 사용자 ID와 컨테이너 사용자 ID 충돌) 자주 발생

**언제 쓰면 좋은가:**
- 로컬 개발 (소스코드 마운트)
- 호스트의 설정 파일 주입 (`/etc/nginx/nginx.conf` 등)

### 2. Named Volume — Docker가 관리하는 볼륨

Docker가 알아서 관리하는 저장소를 만들어 쓴다.

```bash
# 볼륨 생성
docker volume create my-db-data

# 컨테이너에 마운트
docker run -d \
  -v my-db-data:/var/lib/postgresql/data \
  postgres
```

```
[Docker가 관리하는 영역]
/var/lib/docker/volumes/my-db-data/_data
   ↑
   실제 위치 (사용자가 직접 건드릴 일 거의 없음)
```

**장점:**
- Docker가 알아서 위치 관리 (이식성 좋음)
- 권한/소유권 자동 처리
- 백업/복원 도구 잘 갖춰져 있음
- **운영 환경 표준**

**단점:**
- 호스트에서 직접 파일 편집은 번거로움

**언제 쓰면 좋은가:**
- 데이터베이스 데이터
- 운영 환경의 영속 저장
- 컨테이너끼리 공유해야 하는 데이터

### 3. tmpfs — 메모리에만 저장 (디스크 X)

데이터를 호스트의 **메모리(RAM)**에만 둔다. 컨테이너 종료 시 즉시 사라진다.

```bash
docker run -d --tmpfs /app/cache my-app
```

**장점:**
- 매우 빠름 (메모리 속도)
- 디스크에 안 남으므로 보안에 유리

**단점:**
- 영속성 없음 (재시작 시 사라짐)
- 메모리를 차지함

**언제 쓰면 좋은가:**
- 임시 캐시
- 민감한 토큰 등 디스크에 남기면 안 되는 데이터

---

## 한눈에 비교

| | Bind Mount | Named Volume | tmpfs |
|---|---|---|---|
| **저장 위치** | 호스트의 임의 경로 | Docker 관리 영역 | 메모리 |
| **이식성** | 낮음 | 높음 | 해당 없음 |
| **영속성** | 호스트와 동일 | Docker 관리 | 없음 |
| **속도** | 보통 | 보통 | 매우 빠름 |
| **권한 관리** | 수동 | 자동 | 자동 |
| **추천 용도** | 개발 환경 | 운영 환경 DB | 임시 캐시 |

---

## `-v` vs `--mount` — 어떻게 쓰는 게 맞아?

같은 일을 하는 두 가지 문법이 있다.

### `-v` (짧고 간단, 옛날 스타일)

```bash
# Bind Mount
-v /host/path:/container/path

# Named Volume
-v my-volume:/container/path

# 읽기 전용 옵션
-v /host/path:/container/path:ro
```

### `--mount` (길지만 명시적, 새로운 스타일)

```bash
# Bind Mount
--mount type=bind,source=/host/path,target=/container/path

# Named Volume
--mount type=volume,source=my-volume,target=/container/path

# tmpfs
--mount type=tmpfs,target=/app/cache
```

**어느 걸 써야 하나?**
- 학습/스크립트엔 `-v`로 충분
- 운영 환경 / Compose / Swarm에선 `--mount` 권장 (의도가 명확)
- Docker 공식도 `--mount`를 권장하는 추세

---

## 자주 쓰는 볼륨 명령어

```bash
# 볼륨 목록
docker volume ls

# 상세 정보 (위치 확인)
docker volume inspect my-db-data

# 생성
docker volume create my-vol

# 삭제 (사용 중이면 실패)
docker volume rm my-vol

# 사용하지 않는 볼륨 일괄 정리
docker volume prune
```

### 볼륨 백업하기

Named Volume의 데이터를 백업하려면 임시 컨테이너로 tar 압축하는 패턴이 흔하다.

```bash
docker run --rm \
  -v my-db-data:/data \
  -v $(pwd):/backup \
  alpine \
  tar czf /backup/backup.tar.gz /data
```

---

## 실전 예시

### 예시 1: PostgreSQL 데이터 영속화

```bash
docker volume create pg-data

docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=secret \
  -v pg-data:/var/lib/postgresql/data \
  postgres:16
```

이제 `docker rm -f postgres`해도 `pg-data` 볼륨은 살아남는다. 새 컨테이너에 같은 볼륨을 붙이면 **데이터가 그대로 보인다.**

### 예시 2: Next.js 개발 환경 (소스 핫 리로드)

```bash
docker run -d \
  -p 3000:3000 \
  -v $(pwd):/app \
  -v /app/node_modules \
  node:20-alpine \
  sh -c "cd /app && yarn dev"
```

핵심 포인트:
- `-v $(pwd):/app` — 호스트 소스를 컨테이너 안 `/app`에 연결 (변경사항 즉시 반영)
- `-v /app/node_modules` — `node_modules`만 호스트와 분리해서 컨테이너 내부 것 사용

이걸 안 하면 호스트의 `node_modules`(없거나 OS 다름)가 컨테이너 것을 덮어버려서 에러난다.

### 예시 3: 설정 파일 주입

```bash
docker run -d \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro \
  -p 80:80 \
  nginx
```

`:ro`는 read-only로 읽기 전용 마운트. 컨테이너가 설정 파일을 변경하지 못하게 한다.

---

## 헷갈리는 포인트

### ❓ "볼륨이랑 디렉토리가 둘 다 있으면 어떻게 돼요?"
컨테이너 안의 `/app` 디렉토리에 이미지가 만든 파일이 있는데, 그 위에 볼륨을 마운트하면?

- **Named Volume**: 볼륨이 비어있으면 이미지의 파일들이 볼륨으로 자동 복사됨 (초기화)
- **Bind Mount**: 호스트 폴더가 그대로 덮어씀 (이미지 파일 안 보임)

이게 위 Next.js 예시에서 `node_modules`를 별도 볼륨으로 묶은 이유다.

### ❓ "macOS에서 bind mount가 너무 느려요"
macOS는 컨테이너가 VM 안에 있고, 호스트 파일 시스템과의 동기화에 비용이 든다. 큰 프로젝트에선 체감 가능할 정도로 느려질 수 있다.

해결책:
- `:cached` 또는 `:delegated` 마운트 옵션 사용 (정합성 일부 양보, 성능 개선)
- 정말 빠르게 해야 하면 named volume + 별도 동기화 도구 사용

### ❓ "권한 에러(Permission denied)가 나요"
호스트 사용자(UID 1000)와 컨테이너 사용자(UID가 다름)의 충돌 때문이다.

해결책:
- 컨테이너의 사용자를 호스트와 맞추기: `docker run -u $(id -u):$(id -g)`
- Dockerfile에서 명시적으로 UID 지정
- Named Volume을 쓰면 이 문제 회피 가능

### ❓ "anonymous volume이 자꾸 쌓여요"
`-v /container/path` 형식(소스 없음)으로 마운트하면 **이름 없는 볼륨**이 자동 생성된다. 컨테이너 삭제 시 자동 삭제 안 됨.

```bash
# 컨테이너 + 익명 볼륨 같이 삭제
docker rm -v my-container

# 일괄 정리
docker volume prune
```

---

## 정리

- 컨테이너 삭제 시 데이터도 사라지므로 **볼륨**이 필요
- 3가지 방법:
  - **Bind Mount**: 호스트 폴더 직접 연결 (개발용)
  - **Named Volume**: Docker가 관리 (운영 표준)
  - **tmpfs**: 메모리 (임시/민감 데이터)
- `-v`보다 **`--mount`가 명시적**이라 운영에 권장
- `:ro`로 읽기 전용 마운트 가능
- macOS bind mount 성능 이슈 주의

다음 글에선 이미지를 만드는 레시피 — **Dockerfile**을 정복한다. 가장 헷갈리는 `CMD` vs `ENTRYPOINT`, `COPY` vs `ADD`, `ARG` vs `ENV` 차이까지 다룬다.

> **이전 글**: Docker 시리즈 ④ Network
> **다음 글**: Docker 시리즈 ⑥ Dockerfile — 이미지를 만드는 레시피
