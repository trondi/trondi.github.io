---
title: "Docker 시리즈 ④ Network — 컨테이너는 어떻게 통신하는가"
date: "2026-05-05"
summary: "Docker의 네트워크 모드(bridge, host, none), 컨테이너 간 통신, 포트 매핑 동작 원리를 초보자 눈높이로 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Network
  - Bridge
  - DevOps
featured: false
---

# Docker 시리즈 ④ Network — 컨테이너는 어떻게 통신하는가

> 시리즈 순서: Host → Image → Container → **Network** → Volume → Dockerfile → Compose → Security → Swarm

## 들어가며

`docker run -p 3000:3000 my-app`을 입력하면 브라우저에서 `localhost:3000`으로 접속이 된다. 그런데 **컨테이너는 격리되어 있다고 했는데, 어떻게 외부에서 접속이 가능한 걸까?**

또 컨테이너끼리 서로 부르려면 IP를 알아야 할까? 아니면 이름으로 부를 수 있을까?

이 글에서 그 마법의 정체를 풀어본다.

---

## Docker가 자동으로 만드는 가상 네트워크

Docker를 설치하면 호스트에 **`docker0`라는 가상 네트워크 브리지**가 자동으로 생긴다.

```
[호스트 머신]
    │
    ├─ eth0 (192.168.0.10)        ← 실제 네트워크 카드
    │
    └─ docker0 (172.17.0.1)        ← 가상 브리지
           │
           ├─ container A (172.17.0.2)
           ├─ container B (172.17.0.3)
           └─ container C (172.17.0.4)
```

- 컨테이너는 모두 `172.17.x.x` 같은 **가상 IP**를 받는다
- `docker0`가 가상 라우터/스위치 역할을 한다
- 컨테이너 → 외부 인터넷은 NAT(주소 변환)로 통신

이 구조 덕에 **컨테이너끼리는 같은 네트워크처럼 통신**하고, **외부에서 컨테이너에 직접 접근은 안 된다.**

---

## 네트워크 모드 3가지

`docker run --network <모드>`로 설정한다.

### 1. `bridge` (기본값) — 가장 많이 씀

위에서 설명한 그대로다. 컨테이너가 가상 네트워크 안에 격리되어 있다.

```bash
docker run -d --name web nginx          # bridge 모드 (기본)
```

### 2. `host` — 호스트와 네트워크 공유

컨테이너가 **호스트 머신의 네트워크를 그대로 사용**한다. 격리 없음.

```bash
docker run -d --network host nginx
```

장점:
- 빠름 (NAT 거치지 않음)
- 포트 매핑(`-p`) 불필요

단점:
- **포트 충돌 위험** (호스트의 80번 포트를 컨테이너가 쓰면 호스트는 못 씀)
- macOS/Windows에선 사실상 동작 안 함 (VM 위에서 도니까)

### 3. `none` — 네트워크 없음

완전히 격리. 외부와 단절된 컨테이너가 필요할 때.

```bash
docker run --network none my-task
```

배치 작업, 보안 민감한 작업에 가끔 쓴다.

---

## 포트 매핑(`-p`)의 진짜 동작

```bash
docker run -d -p 8080:80 nginx
```

이 명령이 의미하는 것:

```
[외부 사용자]
    │ localhost:8080 접속
    ▼
[호스트 머신: 8080 포트]
    │ Docker가 트래픽을 받아서 NAT
    ▼
[nginx 컨테이너: 80 포트]
```

호스트의 8080 포트로 들어온 모든 트래픽이 컨테이너의 80번 포트로 전달된다. 이걸 **포트 포워딩** 또는 **포트 퍼블리싱**이라고 한다.

### `-p` 옵션 형식

```bash
-p 8080:80              # 호스트 8080 → 컨테이너 80 (모든 인터페이스)
-p 127.0.0.1:8080:80    # 로컬에서만 접근 가능
-p 8080:80/udp          # UDP 프로토콜
-p 8080:80 -p 8443:443  # 여러 포트 동시 매핑
-P                      # 컨테이너의 EXPOSE된 포트 전부 자동 매핑
```

### 흔한 실수

```bash
# ❌ 순서 헷갈림
docker run -p 80:8080 my-app   # 호스트 80 → 컨테이너 8080
                               # 컨테이너가 8080에서 듣고 있어야 함

# 순서: 호스트:컨테이너
```

> **외우는 법:** "**바깥(호스트):안(컨테이너)**" — 외부에서 들어오는 입구가 먼저.

---

## 컨테이너끼리 통신하기

### 방법 1: IP로 통신 (비추천)

```bash
$ docker inspect web | grep IPAddress
"IPAddress": "172.17.0.2"

# 다른 컨테이너에서
$ curl 172.17.0.2
```

문제: 컨테이너를 재시작하면 IP가 바뀐다. 운영에선 못 쓴다.

### 방법 2: 사용자 정의 네트워크 + 컨테이너 이름 (권장)

기본 `bridge` 네트워크는 컨테이너 이름으로 못 부른다. **사용자 정의 네트워크**를 만들면 가능하다.

```bash
# 1. 네트워크 생성
docker network create my-net

# 2. 같은 네트워크에 컨테이너 띄우기
docker run -d --name db --network my-net postgres
docker run -d --name app --network my-net my-app

# 3. app 컨테이너에서 db 컨테이너로 이름으로 통신 가능
# app 안에서: postgresql://db:5432  ← "db"가 호스트명
```

이게 가능한 이유는 Docker가 **사용자 정의 네트워크에 자동으로 DNS 서버를 붙여주기 때문**이다. 컨테이너 이름이 곧 호스트명이 된다.

> **실무 팁:** `docker-compose`를 쓰면 자동으로 사용자 정의 네트워크가 만들어지고, 서비스 이름으로 통신 가능. 별도 설정 거의 필요 없음 (Compose 글에서 자세히)

---

## 자주 쓰는 네트워크 명령어

```bash
# 네트워크 목록
docker network ls

# 상세 정보
docker network inspect bridge
docker network inspect my-net

# 생성
docker network create my-net
docker network create --driver bridge --subnet 10.0.0.0/24 my-net

# 컨테이너를 네트워크에 추가/제거
docker network connect my-net my-container
docker network disconnect my-net my-container

# 사용하지 않는 네트워크 정리
docker network prune
```

---

## 외부 → 컨테이너 vs 컨테이너 → 외부

### 외부 → 컨테이너 (Inbound)

기본은 **막혀 있다.** `-p` 옵션으로 명시적으로 열어줘야 한다.

```bash
docker run -d nginx           # 외부에서 접근 불가
docker run -d -p 80:80 nginx  # 외부에서 :80 접근 가능
```

### 컨테이너 → 외부 (Outbound)

기본은 **열려 있다.** 컨테이너 안에서 인터넷에 자유롭게 접근 가능하다.

```bash
$ docker exec my-app curl https://google.com    # 정상 동작
```

이게 가능한 이유는 Docker가 자동으로 NAT(`iptables` 규칙)를 설정해주기 때문이다.

---

## 헷갈리는 포인트 정리

### ❓ "localhost로 컨테이너끼리 통신이 안 돼요"
**컨테이너 안의 `localhost`는 그 컨테이너 자기 자신**이다. 다른 컨테이너에 접근하려면 컨테이너 이름이나 IP를 써야 한다.

```javascript
// ❌ 컨테이너 A 안에서
fetch('http://localhost:5432')   // A 자기 자신을 부름

// ✅ 컨테이너 이름 사용 (사용자 정의 네트워크에서)
fetch('http://db:5432')
```

### ❓ "macOS에서 `host.docker.internal`이 뭐예요?"
컨테이너 안에서 **호스트 머신**(macOS 자체)에 접근할 때 쓰는 특수 호스트명이다.

```bash
# 컨테이너 안에서 호스트의 3000번 포트 접근
curl http://host.docker.internal:3000
```

호스트에서 돌고 있는 DB나 서비스에 컨테이너에서 접근할 때 유용하다. (Linux에선 기본 지원 안 함, 별도 설정 필요)

### ❓ "포트 매핑했는데 접속이 안 돼요"
체크 순서:
1. 컨테이너 안의 앱이 `0.0.0.0`이 아니라 `127.0.0.1`로 바인딩하면 외부에서 접속 불가
2. `docker ps`에서 PORTS 컬럼에 매핑이 표시되는지 확인
3. 호스트의 방화벽이 막고 있는지 확인

```javascript
// ❌ Express 예시
app.listen(3000, '127.0.0.1')   // 컨테이너 안에서만 접근 가능

// ✅
app.listen(3000, '0.0.0.0')     // 모든 인터페이스에서 접근 가능
```

### ❓ "기본 bridge랑 사용자 정의 bridge 차이가 뭐예요?"
| | 기본 bridge (`docker0`) | 사용자 정의 bridge |
|---|---|---|
| DNS (이름으로 통신) | ❌ 불가 | ✅ 가능 |
| 격리성 | 모든 컨테이너 공유 | 네트워크별로 격리 |
| 권장 여부 | 비추천 | **권장** |

운영 환경에선 항상 사용자 정의 네트워크를 만들어 쓰는 게 좋다.

---

## 정리

- Docker는 가상 네트워크 브리지(`docker0`)로 컨테이너를 연결
- 모드: **bridge**(기본, 격리), **host**(공유), **none**(없음)
- 포트 매핑은 `-p 호스트:컨테이너` 순서
- 컨테이너끼리 이름으로 부르려면 **사용자 정의 네트워크** 필수
- 컨테이너 안의 `localhost`는 그 컨테이너 자신이다 (헷갈리지 말 것)

다음 글에선 컨테이너가 죽어도 데이터를 남기는 방법 — **볼륨(Volume)**을 다룬다.

> **이전 글**: Docker 시리즈 ③ Container
> **다음 글**: Docker 시리즈 ⑤ Volume — 데이터를 어떻게 보존하는가
