---
title: "Docker 시리즈 ① Host — Docker는 어디서 어떻게 도는 걸까?"
date: "2026-05-02"
summary: "Docker Engine, Daemon, CLI의 관계와 macOS/Windows에서 가상머신이 도는 이유를 초보자 눈높이로 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Docker Engine
  - WSL2
  - DevOps
featured: false
series: "Docker 입문"
seriesOrder: 1
---

# Docker 시리즈 ① Host — Docker는 어디서 어떻게 도는 걸까?

> 이 글은 **Docker Standalone → Swarm → Kubernetes**로 이어지는 시리즈의 첫 번째 글이다.
> 시리즈 순서: **Host** → Image → Container → Network → Volume → Dockerfile → Compose → Security → Swarm

## 들어가며

`docker run nginx` 한 줄을 입력하면 컨테이너가 뜬다. 너무 당연해 보이지만, 이 한 줄 뒤에서 **무엇이 어디서 돌고 있는지** 모르면 트러블슈팅할 때 길을 잃는다.

이 글에서는 "내가 친 명령이 어디로 가는지"를 따라가본다.

---

## Docker는 사실 한 덩어리가 아니다

많은 초보자가 "Docker = 컨테이너 만드는 프로그램" 정도로 이해한다. 실제로는 **세 가지 부품**으로 나뉘어 있다.

```
┌─────────────────────────────────────────┐
│  내 터미널                                │
│  ┌─────────────┐                         │
│  │ Docker CLI  │  ← 내가 명령을 입력하는 곳   │
│  └──────┬──────┘                         │
│         │ REST API                       │
│         ▼                                │
│  ┌─────────────┐                         │
│  │  Docker     │  ← 실제로 일을 하는 백그라운드  │
│  │  Daemon     │     프로그램 (dockerd)      │
│  └──────┬──────┘                         │
│         │                                │
│         ▼                                │
│  ┌─────────────┐                         │
│  │ containerd  │  ← 컨테이너를 실제로 띄우고      │
│  │   + runc    │     관리하는 저수준 엔진       │
│  └─────────────┘                         │
└─────────────────────────────────────────┘
```

### 1. Docker CLI (`docker` 명령)
내가 터미널에서 치는 `docker run`, `docker ps` 같은 명령. **그냥 사용자 인터페이스**다. CLI는 실제로 컨테이너를 만들지 않는다.

### 2. Docker Daemon (`dockerd`)
백그라운드에서 항상 떠 있는 서버 프로그램. CLI가 보낸 명령을 받아서 실제로 일한다. 이미지 다운로드, 컨테이너 실행, 네트워크 관리 모두 여기서 이루어진다.

### 3. containerd + runc
Daemon이 직접 컨테이너를 만들지는 않는다. **containerd**(컨테이너 관리 도구)와 **runc**(컨테이너 실행 도구)에 위임한다. 이 둘은 Linux 커널의 `namespace`와 `cgroup` 기능을 이용해 진짜 컨테이너를 만들어낸다.

> **비유:**
> CLI는 식당 손님(주문서 작성), Daemon은 홀 직원(주문 전달), containerd/runc는 주방장(실제 요리). 손님은 주방에서 무슨 일이 일어나는지 몰라도 음식이 나오면 그만이다.

---

## 클라이언트-서버 구조의 의미

위 그림에서 중요한 건 **CLI와 Daemon이 분리되어 있다**는 점이다. 둘은 같은 컴퓨터에 있지 않아도 된다.

```bash
# 내 노트북에서 원격 서버의 Docker 제어하기
DOCKER_HOST=ssh://user@remote-server docker ps
```

이게 가능한 이유는 CLI가 **REST API**로 Daemon에게 명령을 보내기 때문이다. 같은 컴퓨터에선 Unix 소켓(`/var/run/docker.sock`)으로 통신하고, 원격에선 SSH나 TCP로 통신한다.

---

## macOS / Windows에서 Docker가 도는 진실

여기서 많은 초보자가 헷갈린다.

> "내 맥북에 Docker Desktop 설치했는데, 그럼 컨테이너가 macOS 위에서 돌고 있는 거네?"

**아니다.** 컨테이너는 **반드시 Linux 커널 위에서만** 돈다. Docker는 Linux의 `namespace`/`cgroup`을 사용하기 때문이다.

### 그럼 macOS에선 어떻게?

Docker Desktop이 **작은 Linux 가상머신(VM)을 몰래 띄워서** 그 안에서 돌린다.

```
[macOS / Windows]
┌────────────────────────────────────┐
│  Docker CLI (host OS에서 실행)       │
│         │                          │
│         ▼ (소켓 연결)                  │
│  ┌──────────────────────────────┐  │
│  │  Linux VM (Docker Desktop)   │  │
│  │  ┌────────────────────────┐  │  │
│  │  │  Docker Daemon         │  │  │
│  │  │  Container 1, 2, 3 ... │  │  │
│  │  └────────────────────────┘  │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

- **macOS**: HyperKit, Apple Virtualization Framework 사용
- **Windows**: WSL2(Windows Subsystem for Linux 2) 또는 Hyper-V 사용

그래서 macOS/Windows에서 Docker가 **약간 무겁고 느린 이유**가 이거다. VM이 한 겹 더 있어서.

### Linux는?
Linux는 본인이 이미 Linux이므로 VM이 필요 없다. Docker Daemon이 호스트 OS에 바로 설치된다. **가장 가볍고 빠르다.**

---

## 직접 확인해보기

### `docker version` — CLI / Daemon 버전 확인

```bash
$ docker version
Client:                          ← CLI 정보
 Version:    24.0.7
 OS/Arch:    darwin/arm64        ← 내 노트북 (macOS)

Server:                          ← Daemon 정보
 Version:    24.0.7
 OS/Arch:    linux/arm64         ← VM 안의 Linux
```

위 결과를 보면 Client는 `darwin`(macOS)인데 Server는 `linux`다. 이게 바로 "Docker Desktop이 Linux VM을 띄우고 있다"는 증거다.

### `docker info` — 시스템 전체 정보

```bash
$ docker info
Containers: 5
 Running: 2
 Paused: 0
 Stopped: 3
Images: 12
Server Version: 24.0.7
Storage Driver: overlay2
Operating System: Docker Desktop
Kernel Version: 6.4.16-linuxkit  ← VM 안의 리눅스 커널
CPUs: 4
Total Memory: 7.665GiB           ← VM에 할당된 메모리
```

여기서 **Kernel Version**과 **Total Memory**가 호스트 OS의 것과 다르면, VM이 돌고 있다는 뜻이다.

---

## 흔한 실수와 헷갈리는 점

### ❓ "Docker가 안 켜져 있다"는 에러
```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
Is the docker daemon running?
```

이건 **Daemon이 안 떠 있다**는 뜻이다. CLI는 멀쩡한데 서버가 없는 상태.

**해결:**
- macOS/Windows: Docker Desktop 앱 실행
- Linux: `sudo systemctl start docker`

### ❓ "왜 Docker Desktop이 메모리를 이렇게 많이 먹어?"
컨테이너 한두 개만 띄웠는데도 메모리를 GB 단위로 쓴다. **VM에 미리 메모리를 할당해놨기 때문**이다. Docker Desktop 설정에서 VM 크기를 줄일 수 있다.

### ❓ "내가 만든 컨테이너 파일이 어디에 있지?"
macOS에서 `/var/lib/docker`를 찾아도 없다. 그건 **VM 안의 경로**라서 호스트 OS에선 직접 보이지 않는다. Linux 호스트에서만 그 경로가 실제로 존재한다.

---

## 정리

```
docker run nginx
   │
   ▼ (1) CLI가 명령 받음
   │
   ▼ (2) Daemon에 REST API로 전달
   │   (macOS/Win은 VM 안의 Daemon에게 전달)
   │
   ▼ (3) Daemon이 containerd에 위임
   │
   ▼ (4) runc가 Linux 커널 기능으로 컨테이너 생성
   │
   ▼ (5) nginx 컨테이너 실행 ✅
```

핵심 정리:

- Docker는 **CLI + Daemon + containerd/runc**의 협업 결과물
- 컨테이너는 **반드시 Linux 커널 위에서만** 돌아감
- macOS/Windows는 **숨겨진 Linux VM** 위에서 Docker가 돈다
- `docker version`, `docker info`로 내 환경 확인 가능

다음 글에선 Docker가 다루는 가장 기본 단위인 **이미지(Image)**의 정체를 파헤쳐본다.

> **다음 글**: Docker 시리즈 ② Image — 이미지는 어떻게 생긴 걸까?
