---
title: "Jenkins 시리즈 ④ Controller와 Agent — 빌드는 어디서 도는가"
date: "2026-10-16"
summary: "Controller·Node·Agent·Executor의 관계, Jenkinsfile에서 무엇이 어디서 실행되는지, SSH와 Inbound(TCP·WebSocket) 연결 방식, agent 지시어와 Docker·Kubernetes 임시 Agent, 그리고 Controller 하나에서 Agent로 넘어가는 순서를 정리했다."
category: "DevOps · Infra"
tags:
  - Jenkins
  - Agent
  - CI/CD
  - DevOps
featured: false
series: "Jenkins 실전"
seriesOrder: 4
---

# Jenkins 시리즈 ④ Controller와 Agent — 빌드는 어디서 도는가

> 시리즈 순서: 개념 → 설치와 Docker 빌드 → GitLab 연동 → **Controller와 Agent** → 배포 전략

## 들어가며

지금까지 Jenkinsfile 첫 줄은 늘 `agent any`였다. Jenkins 컨테이너 하나만 있으니 "아무 데서나"가 곧 "Jenkins 컨테이너 안에서"였다.

그런데 ②편에서 봤듯 이 구조에서는 빌드 코드가 Credentials가 저장된 Controller와 같은 곳에서 실행되고, `docker.sock`까지 쥐고 있다. 빌드가 몰리면 웹 UI도 같이 느려진다. 이 글은 그 다음 단계, **빌드를 실행할 머신을 따로 두는 구조**를 다룬다.

---

## 용어 네 개

```
┌─────────── Controller (Jenkins 본체) ───────────┐
│ 웹 UI · Job 설정 · Credentials · 빌드 기록       │
│ Webhook 수신 · 스케줄링(큐)                      │
│ Built-in Node ── Executor 2개  ← 지금 빌드가 도는 곳 │
└──────────┬──────────────────────┬────────────────┘
           │ Remoting 채널         │
   ┌───────▼────────┐     ┌───────▼────────┐
   │ Agent: build-1 │     │ Agent: deploy-1│
   │ label: docker  │     │ label: server1 │
   │ Executor ×2    │     │ Executor ×1    │
   │ /workspace/... │     │ /workspace/... │
   └────────────────┘     └────────────────┘
```

| 용어 | 뜻 |
|---|---|
| **Controller** | 두뇌. 무엇을 언제 어디서 돌릴지 정하고 결과를 저장한다. 예전 이름은 Master |
| **Node** | 빌드를 실행할 수 있는 머신. Controller 자신도 **Built-in Node**라는 Node다 |
| **Agent** | Controller가 아닌 Node. 그 머신에서 `agent.jar`(Java 프로세스)가 Controller와 연결을 유지한다 |
| **Executor** | Node 하나의 빌드 실행 슬롯. 2개면 동시에 2개 빌드. 빈 슬롯이 없으면 큐에서 기다린다 |

Agent 하나에 Executor를 여러 개 둘 수 있으므로, "서버 1대 = Agent 1개, 동시 빌드 수 = Executor 수"로 생각하면 된다.

---

## 무엇이 어디서 실행되나

슬라이드나 입문 글에서 잘 다루지 않지만 Agent 구조를 이해하는 데 가장 중요한 부분이다.

| 실행 대상 | 위치 |
|---|---|
| Jenkinsfile의 Groovy 로직 (`script { }`, `for`, `if`, 변수) | **항상 Controller** |
| `sh`, `checkout`, `docker build` 같은 step | `agent`로 지정한 Node |
| workspace (체크아웃한 코드) | 각 Node의 디스크에 따로 |
| Credentials 원본 | Controller. `withCredentials` 블록이 도는 동안만 Agent로 전달 |

여기서 세 가지가 따라 나온다.

**1. stage마다 Agent가 다르면 파일이 안 넘어간다**

빌드 stage는 build 서버에서, 배포 stage는 운영 서버에서 돌리면 workspace가 다르다. 빌드 결과물을 넘기려면 명시적으로 옮겨야 한다.

```groovy
stage('Build') {
  agent { label 'build' }
  steps {
    sh 'npm ci && npm run build'
    stash name: 'dist', includes: 'dist/**'
  }
}
stage('Deploy') {
  agent { label 'deploy' }
  steps {
    unstash 'dist'
    sh './deploy.sh'
  }
}
```

컨테이너 이미지로 배포한다면 이미지 자체가 Registry를 통해 넘어가니 `stash`가 필요 없다. 이 시리즈의 구조가 그렇다.

**2. Agent를 붙여도 Controller 부하가 0이 되진 않는다**

Groovy 로직은 Controller에서 돈다. Jenkinsfile 안에서 큰 JSON을 파싱하거나 수천 번 도는 루프를 짜면 Controller가 느려진다. 무거운 처리는 `sh`로 Agent에 넘긴다.

**3. 비밀값은 필요한 순간에만 Agent로 간다**

Agent가 털려도 그 순간 실행 중인 빌드의 Credentials만 노출된다. Controller가 털리면 전부다. 그래서 **Controller를 보호하는 것이 Agent 분리의 핵심 목적**이다.

---

## 연결 방식 — 누가 먼저 전화를 거나

Agent를 붙이는 방법은 연결을 **누가 먼저 여느냐**로 나뉜다.

### SSH 방식 (Controller → Agent)

```
Controller ──SSH(22)──▶ Agent 서버
           agent.jar 복사 후 실행
```

1. Credentials에 Agent 서버 접속용 SSH 키를 등록한다.
2. Jenkins 관리 → Nodes → New Node에서 Launch method를 **Launch agents via SSH**로 고른다.
3. Controller가 SSH로 접속해 `agent.jar`를 올리고 실행한다.

Agent 서버에는 **Java**와 빌드에 필요한 도구(Docker 등)만 있으면 된다. 연결이 끊기면 Controller가 다시 접속하기 때문에 관리가 편하다. **Controller에서 Agent 서버로 나갈 수 있는 사내망이라면 기본 선택**이다.

### Inbound 방식 (Agent → Controller)

```
Agent 서버 ──접속──▶ Controller
          java -jar agent.jar -url ... -secret ... -name ...
```

예전에는 JNLP 방식이라고 불렀다. Agent 서버에서 직접 `agent.jar`를 실행해 Controller로 접속한다. 방화벽 때문에 Controller가 Agent 쪽으로 들어갈 수 없을 때 쓴다. Kubernetes Agent Pod도 이 방식으로 붙는다.

여기서 **전송 방식이 두 가지**로 갈린다.

| | TCP | WebSocket |
|---|---|---|
| 포트 | 별도 포트 **50000** | 웹 UI 포트 그대로 (예: 15080) |
| Controller 설정 | compose에 `50000:50000` 추가, Security에서 TCP 포트 지정 | 추가 포트 없음 |
| agent.jar 옵션 | 기본값 | `-webSocket` |
| 리버스 프록시 뒤 | 별도 포트 개방 필요 | HTTP(S)와 같은 경로로 통과 |

```bash
# WebSocket 방식 — 50000 포트가 필요 없다
java -jar agent.jar \
  -url http://jenkins.example.com:15080/ \
  -secret <Node 화면에 표시된 값> \
  -name build-1 \
  -webSocket \
  -workDir /var/jenkins-agent
```

"Agent를 붙이려면 50000 포트를 열어야 한다"는 설명이 많은데, **TCP 방식일 때만** 맞다. `-webSocket`을 쓰면 포트를 하나 덜 열어도 된다. 둘 중 하나로 정하고 섞지 않는다.

### 비교

| | SSH | Inbound |
|---|---|---|
| 연결 방향 | Controller → Agent | Agent → Controller |
| 필요한 네트워크 | Controller가 Agent의 22번에 접근 | Agent가 Controller의 웹 포트(또는 50000)에 접근 |
| Agent 서버 준비 | Java, SSH 계정 | Java, agent.jar 상시 실행(systemd 등) |
| 재연결 | Controller가 알아서 | Agent 쪽 프로세스 관리 필요 |
| 맞는 환경 | 사내망 고정 서버 | 방화벽 뒤, Kubernetes Pod |

---

## Jenkinsfile에서 Agent 고르기

| 지시어 | 의미 | 쓰는 경우 |
|---|---|---|
| `agent any` | 빈 Executor가 있는 아무 Node | Node가 하나뿐일 때 |
| `agent { label 'docker && linux' }` | 이 label을 가진 Node만 | 빌드 서버와 배포 서버를 나눌 때 |
| `agent none` + stage별 agent | stage마다 다른 Node | 빌드는 build, 배포는 각 서버 |
| `agent { docker { image 'node:20' } }` | 고른 Node에서 컨테이너를 띄워 그 안에서 실행 | 빌드 도구 버전을 코드로 고정할 때 |

### label

Label은 Node 설정에서 공백으로 구분해 여러 개 붙인다. Jenkinsfile에서는 논리식으로 고른다.

```groovy
agent { label 'linux' }            // linux가 붙은 Node
agent { label 'linux && docker' }  // 둘 다 붙은 Node
agent { label 'linux || mac' }     // 둘 중 하나
```

**조건에 맞는 Node가 오프라인이면 빌드는 실패하지 않고 큐에서 계속 기다린다.** 장애를 늦게 알아차리기 쉬우니 Node 오프라인 알림을 걸어 두거나 `options { timeout(...) }`을 둔다.

### docker agent는 Node가 아니라 환경을 바꾼다

```groovy
pipeline {
  agent { label 'docker' }                 // 어느 서버에서
  stages {
    stage('Build') {
      agent {
        docker {
          image 'node:20-alpine'           // 그 서버의 어떤 컨테이너에서
          reuseNode true                   // 같은 Node, 같은 workspace 사용
          args '-v $HOME/.npm:/root/.npm'  // npm 캐시 유지
        }
      }
      steps { sh 'npm ci && npm run build' }
    }
    stage('Image') {
      steps { sh 'docker build -t $IMAGE:$TAG .' }   // 다시 Node(호스트)에서
    }
  }
}
```

`docker` agent는 Node를 고르는 게 아니라 **고른 Node 위에서 실행 환경을 컨테이너로 바꾸는** 것이다. Node.js 버전을 올리고 싶으면 `node:20` → `node:22`로 태그만 바꾸면 된다. 서버에 Node.js를 설치할 필요가 없다.

`reuseNode true`가 없으면 Jenkins가 Node를 새로 잡을 수 있어 workspace가 달라질 수 있다. 같은 소스로 이어서 작업한다면 붙여 둔다.

---

## 고정 Agent와 임시 Agent

| | 고정 (Permanent) | 임시 (Ephemeral) |
|---|---|---|
| 수명 | 서버에 늘 연결 | 빌드마다 생성, 끝나면 삭제 |
| 캐시 | 남는다 → 빠르다 | 기본은 없다 → 느리다 (캐시 볼륨으로 보완) |
| 이전 빌드 흔적 | 남는다 | 없다 |
| 예 | SSH Agent 서버 | Docker Cloud, Kubernetes Pod |

**Docker Cloud**는 Docker 호스트에 Agent 컨테이너를 띄웠다 지운다. 설정이 단순하지만 확장은 그 호스트 한 대의 CPU·메모리까지다.

**Kubernetes Agent**는 Kubernetes 플러그인이 빌드마다 Pod를 만들고, Pod 안의 Agent가 Inbound로 Controller에 붙는다. 클러스터 autoscale로 늘어나므로 대규모 CI에 맞다. 대신 클러스터 운영이 전제되고, 온프레미스에서는 결국 물리 서버 수가 상한이다.

```
Controller ──Kubernetes API──▶ Pod 생성 ──Inbound 연결──▶ 빌드 ──▶ Pod 삭제
```

---

## Agent를 언제 붙이나

Controller 하나로도 소규모 팀은 충분히 돌아간다. 다음 신호가 보이면 분리를 검토한다.

- 빌드 큐 대기가 자주 생긴다
- 빌드 중에 웹 UI가 느려진다
- 운영 서비스와 같은 서버에서 빌드가 돈다
- push 권한자가 늘어 "push 권한 = 서버 root"(②편)를 받아들이기 어려워졌다

### 추가 순서 (SSH 방식)

1. **Agent 서버 준비**: Java 17, Docker 설치. `jenkins` 사용자를 만들고 `docker` 그룹에 넣는다.
2. **Credentials**: Controller → Agent 접속용 SSH 개인키를 등록한다. 공개키는 Agent 서버의 `authorized_keys`에 넣는다.
3. **Node 생성**: Jenkins 관리 → Nodes → New Node
   - Remote root directory: `/var/jenkins-agent`
   - Labels: `docker linux`
   - Number of executors: CPU 코어 수 정도
   - Launch method: Launch agents via SSH
4. **연결 확인**: Node 상태가 Online인지 본다.
5. **Built-in Node의 Executor를 0으로**: Jenkins 관리 → Nodes → Built-in Node → Number of executors = 0
6. **Jenkinsfile 수정**: `agent any` → `agent { label 'docker' }`

5번이 핵심이다. 이걸 해야 **빌드 코드가 Controller에서 실행될 가능성 자체가 사라진다.** ②편의 `docker.sock` 위험이 Credentials가 없는 build 서버로 옮겨 간다. Controller 컨테이너에서 `docker.sock` 마운트를 빼는 것도 이 시점에 같이 한다.

### 단계별 그림

```
지금      Controller 1대, agent any, Built-in Node에서 docker.sock으로 빌드
   ↓ 빌드가 몰리거나 보안 분리가 필요할 때
1단계     build 서버 1대를 SSH Agent로 추가, Built-in Executor = 0
   ↓ 배포 대상 서버가 늘 때
2단계     각 운영 서버에도 Agent, stage별 label로 배포 (⑤편)
   ↓ Kubernetes 도입 시
3단계     Kubernetes Pod Agent, 빌드는 rootless(BuildKit/Buildah)
```

---

## 정리

- **Controller는 관리, Agent는 실행.** Executor가 동시 빌드 수다.
- Groovy 로직은 **항상 Controller**, `sh` 같은 step만 Agent에서 돈다.
- 연결은 SSH(Controller → Agent)와 Inbound(Agent → Controller). Inbound는 **`-webSocket`이면 50000 포트가 필요 없다.**
- `docker` agent는 Node를 고르는 게 아니라 **Node 위의 실행 환경**을 고른다.
- Agent를 붙이면 **Built-in Node Executor를 0으로**. 그게 분리의 목적이다.

마지막 글에서는 Agent를 배포에 쓰는 방법과 함께, 구버전을 새 버전으로 **어떤 순서로 바꿀지**, 즉 배포 전략을 다룬다.

> **이전 글**: Jenkins 시리즈 ③ GitLab 연동
> **다음 글**: Jenkins 시리즈 ⑤ 배포 전략 — Recreate부터 Canary까지
