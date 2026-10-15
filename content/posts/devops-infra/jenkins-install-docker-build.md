---
title: "Jenkins 시리즈 ② 설치와 Docker 빌드 — Docker Socket Mount 제대로 이해하기"
date: "2026-10-16"
summary: "Native·Docker·Kubernetes 설치 방식을 비교하고, Jenkins 컨테이너 안에서 docker build를 돌리는 Docker Socket Mount의 동작 원리와 권한·경로·보안 함정, DinD·Podman·Kaniko와의 차이를 정리했다."
category: "DevOps · Infra"
tags:
  - Jenkins
  - Docker
  - CI/CD
  - DevOps
  - Security
featured: false
series: "Jenkins 실전"
seriesOrder: 2
---

# Jenkins 시리즈 ② 설치와 Docker 빌드 — Docker Socket Mount 제대로 이해하기

> 시리즈 순서: 개념 → **설치와 Docker 빌드** → GitLab 연동 → Controller와 Agent → 배포 전략

## 들어가며

Jenkins를 Docker로 띄우는 건 `docker compose up -d` 한 줄이면 끝난다. 막히는 건 그다음이다. 파이프라인에서 `docker build`를 실행하는 순간 `docker: not found`, 그다음엔 `permission denied ... docker.sock`이 나온다.

이 글에서는 설치 방식을 고르고, Jenkins 컨테이너 안에서 Docker 명령을 쓰는 방법, 특히 가장 많이 쓰는 **Docker Socket Mount**가 실제로 무엇을 하는지 끝까지 따라가 본다.

---

## 설치 방식 비교

| 항목 | Native | Docker | Kubernetes (Helm) |
|---|---|---|---|
| 설치 | 패키지 매니저 + systemd | `docker compose up -d` | `helm install` |
| 사전 준비 | Java 17 이상 | Docker | 클러스터, Helm |
| 다른 서비스와 충돌 | Java 버전 충돌 가능 | 없음 (컨테이너 격리) | 없음 |
| 업그레이드·롤백 | 어렵다 | 이미지 태그만 바꾸면 된다 | 차트 버전으로 관리 |
| 서버 이전 | 처음부터 재설치 | `JENKINS_HOME` + compose 파일 복사 | PVC 이전 |
| 확장 | 수동 | 수동 | Agent Pod 자동 생성 |
| 맞는 환경 | Docker를 못 쓰는 레거시 서버 | **대부분의 소규모~중규모 팀** | 이미 클러스터를 운영 중인 팀 |

Kubernetes 설치는 Controller Pod가 상시 떠 있고 빌드할 때마다 Agent Pod를 만들었다 지우는 구조라 자원 효율이 좋다. 하지만 서버 1~2대 규모에서는 클러스터 운영 비용이 이점보다 크다. **클러스터가 이미 있는 게 아니라면 Docker 설치가 기본값**이다.

---

## Docker로 설치하기

### docker run vs docker compose

`docker run` 한 줄로도 뜨지만, 옵션이 늘면 명령을 기억해야 하고 팀원과 공유하기 어렵다. 설정을 파일로 남기는 **compose를 쓴다.**

```yaml
# /var/lib/jenkins/docker-compose.yml
services:
  jenkins:
    image: harbor.example.com/infra/jenkins:lts-docker   # 아래에서 만드는 커스텀 이미지
    container_name: jenkins
    restart: unless-stopped
    ports:
      - "15080:8080"            # 웹 UI
    environment:
      - TZ=Asia/Seoul
    group_add:
      - "${DOCKER_GID}"         # docker.sock 접근 권한 (뒤에서 설명)
    volumes:
      - /var/jenkins_home:/var/jenkins_home
      - /var/run/docker.sock:/var/run/docker.sock
```

| 항목 | 역할 |
|---|---|
| `image` | 사내 Registry에 올려 둔 이미지를 쓴다. 외부망 의존을 줄이고 버전을 고정할 수 있다 |
| `restart: unless-stopped` | 서버가 재부팅되면 자동으로 다시 뜬다 |
| `15080:8080` | 호스트 15080 → 컨테이너 8080 |
| `/var/jenkins_home` | 모든 설정과 빌드 이력. 이 볼륨이 곧 Jenkins다 |
| `docker.sock` | 호스트 Docker 데몬 연결. 이 글의 주제다 |

Agent를 붙일 계획이 아직 없다면 `50000` 포트는 열지 않는다. 필요해지는 시점은 ④편에서 다룬다.

### 실행 전에 권한부터

컨테이너 안의 `jenkins` 사용자는 **UID 1000**이다. 호스트 디렉터리 소유자가 다르면 `Permission denied: /var/jenkins_home`으로 바로 죽는다.

```bash
sudo mkdir -p /var/jenkins_home
sudo chown -R 1000:1000 /var/jenkins_home

cd /var/lib/jenkins
echo "DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)" > .env
docker compose up -d
docker compose logs -f jenkins
```

### 초기 설정

`http://<서버>:15080`에 접속하면 Unlock Jenkins 화면이 나온다. 초기 비밀번호는 컨테이너 안 파일에 있다.

```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

1. 초기 비밀번호를 입력한다.
2. **Install suggested plugins**를 선택한다. 이 화면은 처음 한 번만 나온다. Git, Pipeline 등 필수 플러그인이 들어간다.
3. 관리자 계정을 만든다. 이 계정은 모든 권한을 가진다. 비밀번호는 팀 비밀번호 관리 도구에 보관한다.
4. **Jenkins URL**을 설정한다 (Jenkins 관리 → System → Jenkins Location). 빌드 결과를 GitLab에 보낼 때 붙는 링크의 앞부분이다. 설정하지 않으면 MR 화면의 "Details" 링크가 `http://localhost:8080/job/...`로 찍혀서 열리지 않는다.
5. 추가 플러그인을 설치한다 (Jenkins 관리 → Plugins).

| 플러그인 | 용도 |
|---|---|
| GitLab | Webhook 수신, MR·커밋에 빌드 상태 표시 |
| Git / Pipeline | suggested에 포함되어 있는지 확인 |
| Docker Pipeline | `agent { docker { ... } }` 문법 |
| Slack Notification | 빌드 결과 알림 (선택) |

---

## Jenkins 안에서 docker build를 하려면

Jenkins를 컨테이너로 띄우면 문제가 하나 생긴다. 파이프라인에서 `docker build`를 하고 싶은데, **Jenkins 컨테이너 안에는 Docker가 없다.** 방법은 네 가지다.

| 방식 | 한 줄 요약 |
|---|---|
| Docker Socket Mount | 호스트의 Docker 데몬을 빌려 쓴다 |
| Docker in Docker (DinD) | 컨테이너 안에 Docker 데몬을 하나 더 띄운다 |
| Podman / Buildah | 데몬 없이 rootless로 빌드한다 |
| Kaniko | 데몬 없이 userspace에서 Dockerfile을 실행한다 (Kubernetes용) |

---

## Docker Socket Mount — 동작 원리

### Docker는 클라이언트와 서버로 나뉜다

`docker` 명령은 두 프로그램이 나눠서 처리한다.

- **docker CLI**: 명령을 받아 API 요청으로 바꾸는 클라이언트
- **dockerd (데몬)**: 실제로 이미지를 빌드하고 컨테이너를 띄우는 서버

둘은 `/var/run/docker.sock`이라는 **Unix 소켓**으로 HTTP API를 주고받는다. `docker ps`는 사실 이 소켓에 `GET /containers/json`을 보내는 것이다.

```bash
# CLI 없이도 소켓에 직접 요청할 수 있다
curl --unix-socket /var/run/docker.sock http://localhost/containers/json
```

### 소켓을 마운트하면 일어나는 일

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

이 한 줄로 Jenkins 컨테이너 안의 CLI가 **호스트의 데몬**에 요청을 보낼 수 있게 된다. Jenkins 안에 Docker가 생기는 게 아니라, 호스트 Docker를 원격 조종하는 구조다.

```
Jenkins 컨테이너                     호스트
┌───────────────────┐   소켓    ┌──────────────────────────┐
│ sh 'docker build' │──────────▶│ dockerd                  │
│ (docker CLI만 있음) │  API 요청 │ ├ 실제 빌드 수행           │
└───────────────────┘           │ ├ 이미지·레이어 캐시 저장   │
                                │ └ 만든 컨테이너는 Jenkins의 │
                                │   "형제" 컨테이너           │
                                └──────────────────────────┘
```

비유하자면 **소켓은 전화선, CLI는 전화기**다. 전화선만 연결해 두고 전화기가 없으면 통화를 못 한다. 그래서 소켓을 마운트해도 이미지에 CLI가 없으면 `docker: not found`가 나온다.

---

## Docker Socket Mount — 실제로 부딪히는 4가지

### 1. CLI는 이미지에 넣어야 한다

```bash
# 이렇게 넣으면 컨테이너를 재생성할 때 사라진다
docker exec -it -u root jenkins apt-get install -y docker.io
```

공식 이미지를 기반으로 CLI만 추가한 이미지를 만들어 사내 Registry에 올려 두는 게 정석이다. 데몬은 필요 없으니 공식 `docker:cli` 이미지에서 바이너리만 복사하면 된다.

```dockerfile
# Dockerfile.jenkins
FROM jenkins/jenkins:lts-jdk17
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:27-cli /usr/local/libexec/docker/cli-plugins /usr/local/libexec/docker/cli-plugins
```

```bash
docker build -f Dockerfile.jenkins -t harbor.example.com/infra/jenkins:lts-docker .
docker push harbor.example.com/infra/jenkins:lts-docker
```

`cli-plugins`까지 복사하면 `docker buildx`와 `docker compose`도 함께 쓸 수 있다.

### 2. 소켓 권한 — permission denied

CLI를 넣고 나면 다음 에러가 나온다.

```
permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock
```

호스트의 `docker.sock`은 보통 `root:docker` 소유에 권한이 `660`이다. Jenkins는 UID 1000이고 `docker` 그룹에 속해 있지 않으니 접근할 수 없다.

```bash
ls -l /var/run/docker.sock
# srw-rw---- 1 root docker 0 ... /var/run/docker.sock
stat -c '%g' /var/run/docker.sock
# 988   ← 호스트의 docker 그룹 GID (서버마다 다르다)
```

해결은 compose의 `group_add`로 **호스트 docker 그룹의 GID**를 Jenkins 프로세스에 붙여 주는 것이다. 앞의 compose 파일에서 `.env`로 `DOCKER_GID`를 넘긴 이유가 이것이다.

검색하면 `chmod 666 /var/run/docker.sock`이 자주 나오는데, **호스트의 모든 사용자에게 root 권한을 주는 것과 같다.** 쓰지 않는다.

### 3. 볼륨 경로는 호스트 기준으로 해석된다

가장 찾기 어려운 함정이다. 파이프라인에서 이런 명령을 실행했다고 하자.

```groovy
sh 'docker run --rm -v $WORKSPACE:/src node:20 npm test'
```

`$WORKSPACE`는 Jenkins 컨테이너 안의 경로(`/var/jenkins_home/workspace/project-a`)다. 그런데 `-v`를 해석하는 건 **호스트의 데몬**이다. 호스트에 그 경로가 없으면 Docker는 빈 디렉터리를 만들어 마운트하고, 테스트는 "파일이 없다"며 실패한다.

```
Jenkins 컨테이너가 보는 경로     /var/jenkins_home/workspace/project-a
호스트 데몬이 찾는 경로          /var/jenkins_home/workspace/project-a  ← 호스트에 이게 있어야 한다
```

해결은 간단하다. **호스트 경로와 컨테이너 경로를 똑같이 맞춘다.** 앞의 compose에서 `/var/jenkins_home:/var/jenkins_home`으로 양쪽을 같은 경로로 둔 이유다. `/var/lib/jenkins_home:/var/jenkins_home`처럼 다르게 두면 이 문제가 생긴다.

참고로 `docker build .`는 이 문제가 없다. 빌드 컨텍스트를 소켓으로 **전송**하기 때문이다. `agent { docker { ... } }` 문법도 Docker Pipeline 플러그인이 Jenkins가 컨테이너 안에서 돈다는 걸 감지하고 `--volumes-from`으로 처리해 준다. 문제가 되는 건 `sh`로 `-v`를 직접 쓸 때다.

### 4. 이미지와 캐시가 호스트에 쌓인다

빌드는 호스트 데몬이 하니까 이미지와 레이어 캐시도 호스트에 남는다.

- **장점**: 레이어 캐시가 빌드 사이에 재사용되어 빠르다.
- **단점**: 디스크가 계속 찬다. 같은 호스트의 다른 서비스 이미지와 이름이 겹칠 수도 있다.

주기적인 정리 Job을 하나 두는 게 좋다.

```groovy
// 매일 새벽 사용하지 않는 이미지 정리
pipeline {
  agent any
  triggers { cron('H 4 * * *') }
  stages {
    stage('Prune') {
      steps { sh 'docker image prune -af --filter "until=168h"' }
    }
  }
}
```

---

## Docker Socket Mount의 보안 — "내부망이니까 괜찮다"의 정확한 의미

`docker.sock`에 접근할 수 있으면 **사실상 호스트 root**다.

```bash
# 이 한 줄이면 호스트 파일시스템 전체를 root로 다룰 수 있다
docker run --rm -it -v /:/host alpine chroot /host
```

할 수 있는 일은 이렇다.

- 호스트의 모든 파일 읽기·쓰기
- 같은 호스트의 다른 컨테이너(프론트, 백엔드, DB) 중지·삭제
- 다른 컨테이너의 환경변수(비밀번호 포함) 조회

그래서 "내부망이라 외부에서 들어올 수 없으니 괜찮다"는 판단은 **절반만 맞다.** 실제 공격 경로는 외부 해커보다 **Jenkinsfile을 고칠 수 있는 사람**이다. 레포에 push할 수 있는 사람은 누구나 Jenkinsfile에 위 한 줄을 넣어 Jenkins 서버의 root를 얻을 수 있다.

정확하게 말하면 이렇다.

> Docker Socket Mount는 **push 권한자 전원을 서버 root만큼 신뢰할 수 있는 범위**에서 쓰는 방식이다.

소규모 사내 팀이라면 현실적인 선택이다. 대신 이 범위를 넘어서는 순간(외부 협력사가 push하거나, 운영 서비스와 같은 호스트에서 돌거나) Agent 분리나 rootless 빌드를 검토해야 한다. 공식 문서가 Controller에서 직접 빌드하지 말라고 하는 이유도 여기에 있다. Credentials가 저장된 Controller와 아무 코드나 실행되는 빌드 환경이 같은 호스트에 있기 때문이다.

---

## 다른 방식들

### Docker in Docker (DinD)

Jenkins 컨테이너 안에서 Docker 데몬을 직접 실행한다.

- `privileged: true`가 필요하다. 호스트의 거의 모든 권한을 컨테이너에 주는 설정이라 **Socket Mount보다 더 위험하다.**
- 데몬이 이중으로 돌아 자원을 더 쓴다.
- 내부 데몬의 캐시가 컨테이너와 함께 사라진다. 볼륨으로 뺄 수는 있지만 관리할 게 늘어난다.

CI에서 DinD를 쓸 이유는 거의 없다.

### Podman / Buildah

데몬 없이(daemonless), root 없이(rootless) 컨테이너를 빌드한다. Podman은 `docker`와 명령어가 같아서 `alias docker=podman`으로 대부분 그대로 쓸 수 있다.

- 장점: 데몬이 없으니 소켓 문제 자체가 없다. 보안이 가장 낫다.
- 단점: Jenkins 이미지나 Agent에 별도로 설치해야 한다. rootless 환경 설정(subuid 등)이 필요하다.

### Kaniko

Google이 만든 도구로, Kubernetes Pod 안에서 데몬 없이 Dockerfile을 실행해 이미지를 만든다.

다만 **원 저장소(GoogleContainerTools/kaniko)가 2025년 6월에 아카이브됐다.** 원래 이미지(`gcr.io/kaniko-project/executor`)도 더 이상 업데이트되지 않는다. 원작자들이 참여한 Chainguard 포크와 커뮤니티 포크가 유지보수만 이어가는 상태다. 새로 도입한다면 BuildKit rootless나 Buildah를 먼저 검토하는 게 낫다.

### 종합 비교

| 항목 | Socket Mount | DinD | Podman/Buildah | Kaniko |
|---|---|---|---|---|
| 데몬 | 호스트 것 사용 | 내부에 추가 | 불필요 | 불필요 |
| privileged | 불필요 | **필요** | 불필요 | 불필요 |
| 보안 위험 | 중간 (호스트 root 상당) | 높음 | 낮음 | 낮음 |
| 레이어 캐시 | 호스트에 유지 | 기본은 휘발 | 유지 가능 | 원격 캐시 설정 필요 |
| 설정 난이도 | 쉬움 | 복잡 | 보통 | 복잡 |
| 맞는 환경 | 신뢰할 수 있는 내부 팀 | 비권장 | 보안이 중요한 환경 | Kubernetes (유지보수 상태 확인) |

---

## 정리

- 설치는 **Docker compose**가 기본값이다. `/var/jenkins_home`은 UID 1000으로 맞춘다.
- Docker Socket Mount는 **호스트 데몬을 원격 조종하는 것**이다. 그래서 생기는 일이 네 가지다.
  1. CLI는 이미지에 넣는다.
  2. 소켓 권한은 `group_add`로 해결한다. `chmod 666`은 쓰지 않는다.
  3. `-v` 경로는 호스트 기준이다. 호스트와 컨테이너 경로를 같게 맞춘다.
  4. 이미지와 캐시가 호스트에 쌓인다. 정리 Job을 둔다.
- 보안상 **push 권한자 = 서버 root**다. 그 범위를 신뢰할 수 있을 때 쓴다.
- 범위를 넘어서면 Agent 분리(④편)나 rootless 빌드로 간다.

다음 글에서는 Jenkins와 GitLab을 연결한다. Credentials, 세 가지 토큰, Webhook, 그리고 Jenkinsfile까지다.

> **이전 글**: Jenkins 시리즈 ① 개념 — Jenkins는 언제, 왜 쓰는가
> **다음 글**: Jenkins 시리즈 ③ GitLab 연동 — 토큰 3종, Webhook, Jenkinsfile
