---
title: "Docker 시리즈 ③ Container — 컨테이너의 생애 주기"
date: "2026-05-04"
summary: "컨테이너가 이미지와 어떻게 다른지, docker run 옵션의 의미, 컨테이너 생명주기와 실무에서 자주 쓰는 명령어를 초보자 눈높이로 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Container
  - DevOps
featured: false
series: "Docker 입문"
seriesOrder: 3
---

# Docker 시리즈 ③ Container — 컨테이너의 생애 주기

> 시리즈 순서: Host → Image → **Container** → Network → Volume → Dockerfile → Compose → Security → Swarm

## 들어가며

이전 글에서 이미지가 "붕어빵 틀"이라고 했다면, **컨테이너는 그 틀로 찍어낸 붕어빵**이다. 한 틀로 100개 찍을 수 있고, 각 붕어빵은 서로 영향을 주지 않는다.

이 글에선 컨테이너가 **어떤 상태를 거치고, 그 안에선 뭐가 일어나는지** 살펴본다.

---

## 컨테이너 = 이미지 + 쓰기 가능한 레이어

이미지는 읽기 전용이다. 그러면 컨테이너 안에서 파일을 만들면 어디에 저장될까?

답은 **컨테이너 위에 얹힌 새로운 레이어**다.

```
┌──────────────────────────────────┐
│  Container Layer (R/W)            │  ← 컨테이너에서 변경된 모든 것
├──────────────────────────────────┤
│  Image Layer 4 (Read-Only)       │
├──────────────────────────────────┤
│  Image Layer 3 (Read-Only)       │  ← 이미지 (모든 컨테이너가 공유)
├──────────────────────────────────┤
│  Image Layer 2 (Read-Only)       │
├──────────────────────────────────┤
│  Image Layer 1 (Read-Only)       │
└──────────────────────────────────┘
```

이걸 **Copy-on-Write**라고 한다. 이미지 안의 파일을 수정하려고 하면, 먼저 컨테이너 레이어로 복사된 후 거기서 수정된다. 원본 이미지는 절대 안 바뀐다.

> **중요한 결과:**
> 컨테이너가 삭제되면 **컨테이너 레이어도 같이 사라진다.** 즉, 컨테이너 안에서 만든 파일/로그는 다 날아간다. 영속성이 필요하면 **볼륨**을 써야 한다 (다음 글에서 다룸).

---

## 컨테이너의 생애 주기

컨테이너는 여러 상태를 거치며 산다.

```
                docker create
   ┌───────┐                    ┌────────┐
   │ Image │ ─────────────────▶ │Created │
   └───────┘                    └────┬───┘
                                     │ docker start
                                     ▼
   ┌────────┐  docker pause     ┌────────┐
   │ Paused │ ◀──────────────── │Running │
   └────┬───┘  docker unpause   └────┬───┘
        │                            │ exit / docker stop
        │                            ▼
        │                       ┌────────┐
        └──────────────────────▶│Exited  │
                                └────┬───┘
                                     │ docker rm
                                     ▼
                                  (제거됨)
```

| 상태 | 설명 |
|------|------|
| **Created** | 컨테이너 생성됐지만 아직 실행 안 함 |
| **Running** | 프로세스 실행 중 |
| **Paused** | 프로세스가 일시 정지(메모리는 유지) |
| **Exited** | 프로세스가 끝나서 종료된 상태 (컨테이너는 남아있음) |
| **Dead** | 비정상 종료 |

### `docker run`은 사실 두 명령의 합성

```bash
docker run nginx
# 위 명령은 사실 아래와 동일

docker create nginx     # Created 상태로 만들고
docker start <id>       # Running 상태로 시작
```

대부분 `docker run`만 쓰지만, 내부에선 두 단계를 거친다는 걸 알아두면 좋다.

---

## `docker run` 옵션 분해

가장 자주 쓰는 옵션들이다.

```bash
docker run -d -p 3000:3000 --name my-app -e NODE_ENV=production --restart unless-stopped my-image:latest
```

### `-d` (detached) — 백그라운드 실행

이 옵션이 없으면 터미널이 컨테이너에 묶여서 종료할 때까지 못 빠져나온다.

```bash
docker run nginx          # 터미널이 묶임 (Ctrl+C로 종료)
docker run -d nginx       # 백그라운드로 떠서 터미널 자유
```

### `-it` (interactive + tty) — 대화형 셸

쉘에 들어가야 할 때 쓴다. `-i`는 입력 받기, `-t`는 터미널처럼 동작.

```bash
docker run -it ubuntu bash    # ubuntu 컨테이너 안의 bash로 접속
```

### `-p` (publish) — 포트 매핑

컨테이너 내부 포트를 호스트 포트와 연결한다.

```bash
-p 3000:3000      # 호스트:컨테이너 (외부 3000 → 컨테이너 3000)
-p 8080:3000      # 호스트 8080 → 컨테이너 3000
-p 127.0.0.1:3000:3000   # 로컬에서만 접근 가능
```

(자세한 네트워크 동작은 Network 글에서)

### `--name` — 컨테이너 이름

지정 안 하면 `friendly_einstein` 같은 랜덤 이름이 붙는다. 명령어로 다룰 때 헷갈리니 운영용은 명시하는 게 좋다.

### `-e` (environment) — 환경변수 주입

```bash
-e NODE_ENV=production
-e DATABASE_URL=postgres://...
--env-file .env          # 파일로 한꺼번에
```

### `-v` (volume) — 볼륨 마운트

```bash
-v /host/path:/container/path     # 호스트 경로 → 컨테이너에 연결
-v my-volume:/data                # 이름 있는 볼륨
```

### `--restart` — 재시작 정책

컨테이너가 죽었을 때 어떻게 할지.

| 값 | 동작 |
|----|------|
| `no` (기본) | 죽으면 그대로 두기 |
| `on-failure` | 비정상 종료(exit code != 0)일 때만 재시작 |
| `always` | 항상 재시작 (Docker 재시작 시에도) |
| `unless-stopped` | 사용자가 직접 멈춘 게 아니면 재시작 (가장 많이 씀) |

### `--rm` — 종료 시 자동 삭제

일회성 컨테이너에 유용하다. 안 그러면 Exited 상태로 계속 남는다.

```bash
docker run --rm -it ubuntu bash    # 셸 빠져나오면 컨테이너도 사라짐
```

---

## 컨테이너 다루기: 자주 쓰는 명령어

### 보기

```bash
docker ps                # 실행 중인 컨테이너만
docker ps -a             # 모든 컨테이너 (Exited 포함)
docker ps -q             # ID만 (스크립트용)
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### 들여다보기

```bash
docker logs my-app                    # 로그 보기
docker logs -f my-app                 # 실시간 스트리밍 (tail -f처럼)
docker logs --tail 100 my-app         # 마지막 100줄

docker inspect my-app                 # 모든 메타데이터 (JSON)
docker inspect --format '{{.NetworkSettings.IPAddress}}' my-app   # 특정 필드만

docker stats                          # 실시간 리소스 사용량
docker top my-app                     # 컨테이너 안의 프로세스
```

### 컨테이너 안으로 들어가기

```bash
docker exec -it my-app sh             # alpine 기반
docker exec -it my-app bash           # debian/ubuntu 기반
docker exec my-app ls /app            # 명령 한 번만 실행
```

> **`exec` vs `attach`:**
> - `exec`는 컨테이너 안에서 **새 프로세스**를 실행
> - `attach`는 컨테이너의 **메인 프로세스에 붙음** (Ctrl+C 누르면 컨테이너 자체가 죽을 수 있어 위험)

### 제어

```bash
docker stop my-app          # 정상 종료 (SIGTERM, 10초 후 SIGKILL)
docker kill my-app          # 즉시 강제 종료 (SIGKILL)
docker restart my-app       # 재시작
docker pause my-app         # 일시 정지
docker unpause my-app       # 재개
docker rm my-app            # 삭제 (Exited 상태일 때)
docker rm -f my-app         # 실행 중이어도 강제 삭제
```

### 정리

```bash
# 멈춘 컨테이너 모두 삭제
docker container prune

# 모든 컨테이너 삭제
docker rm -f $(docker ps -aq)
```

---

## 실수하기 쉬운 포인트

### ❓ "컨테이너가 자꾸 바로 종료돼요"
Docker는 **메인 프로세스가 끝나면 컨테이너도 끝난다.** 백그라운드 프로세스를 데몬화하는 식으로 띄우면 메인 프로세스가 바로 끝나서 컨테이너도 같이 죽는다.

```bash
# ❌ 잘못된 예
CMD ["service", "nginx", "start"]   # service 명령 끝나면 컨테이너 종료

# ✅ 올바른 예: 포어그라운드로 실행
CMD ["nginx", "-g", "daemon off;"]
```

### ❓ "왜 같은 이미지로 띄운 컨테이너끼리 데이터가 공유 안 돼요?"
컨테이너 레이어는 **각 컨테이너마다 따로**다. 이미지만 공유할 뿐, 컨테이너 간엔 서로 격리되어 있다. 데이터 공유가 필요하면 **공유 볼륨**을 써야 한다.

### ❓ "컨테이너가 메모리 무한정 먹어요"
기본값으론 호스트 메모리를 다 쓸 수 있다. 운영 환경에선 반드시 제한해야 한다.

```bash
docker run -d --memory="512m" --cpus="0.5" my-app
```

### ❓ "Exited 컨테이너가 쌓여서 디스크가 가득 찼어요"
Exited 컨테이너도 **파일 시스템 레이어를 차지**한다. 주기적으로 정리하거나 `--rm`을 활용하자.

```bash
docker container prune -f      # 일괄 정리
```

### ❓ "PID 1 문제"
컨테이너의 메인 프로세스는 PID 1로 실행되는데, **PID 1은 좀비 프로세스를 거두지 못한다.** Node.js 같은 일부 런타임에선 시그널 처리도 다르다.

해결책: `--init` 옵션을 쓰거나, `tini` 같은 init 시스템을 이미지에 포함.

```bash
docker run --init my-app
```

---

## 정리

- 컨테이너 = **이미지 + 쓰기 가능한 레이어** (Copy-on-Write)
- 생애 주기: Created → Running → (Paused) → Exited → Removed
- `docker run` 옵션 중 `-d`, `-p`, `--name`, `-e`, `--restart`는 거의 항상 쓴다
- 컨테이너 삭제 시 데이터도 사라지니, 영속성은 **볼륨**으로 해결
- 메인 프로세스가 끝나면 컨테이너도 끝난다 (포어그라운드로 실행 필수)

다음 글에선 컨테이너끼리 어떻게 통신하고, 외부와는 어떻게 연결되는지 — **네트워크**를 다룬다.

> **이전 글**: Docker 시리즈 ② Image
> **다음 글**: Docker 시리즈 ④ Network — 컨테이너는 어떻게 통신하는가
