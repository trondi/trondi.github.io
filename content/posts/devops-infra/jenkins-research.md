---
title: "Jenkins 시리즈 ① 개념 — Jenkins는 언제, 왜 쓰는가"
date: "2026-10-16"
summary: "CI/CD 개념부터 Jenkins 내부 구조, GitLab CI와 헷갈리는 Job·Pipeline 용어, 저장소 연동과 설치 위치 전략까지 Jenkins를 도입하기 전에 잡아야 할 그림을 정리했다."
category: "DevOps · Infra"
tags:
  - Jenkins
  - CI/CD
  - DevOps
  - GitLab
featured: false
series: "Jenkins 실전"
seriesOrder: 1
---

# Jenkins 시리즈 ① 개념 — Jenkins는 언제, 왜 쓰는가

> 사내 GitLab + Docker 환경에 Jenkins를 직접 구축하면서 연구한 내용을 다섯 편으로 정리한 시리즈의 첫 번째 글이다.
> 시리즈 순서: **개념** → 설치와 Docker 빌드 → GitLab 연동 → Controller와 Agent → 배포 전략

## 들어가며

Jenkins를 처음 붙일 때 가장 먼저 막히는 건 설치가 아니라 **용어**였다. GitLab CI에도 Job이 있고 Jenkins에도 Job이 있는데 둘이 가리키는 크기가 다르다. 토큰도 "잡 토큰"이라는 이름으로 두세 가지가 섞여 나온다.

이 글에서는 손을 대기 전에 잡아야 할 그림을 먼저 그린다. Jenkins가 무엇을 해 주는지, 언제 쓰는 게 맞는지, 내부가 어떻게 생겼는지, 그리고 GitLab CI와 단어가 어떻게 대응되는지다.

---

## CI/CD — Jenkins가 맡는 일

```
코드 push → 빌드 → 테스트 → 이미지 생성 → 스테이징 배포 → (승인) → 운영 배포
└──────── CI ────────┘  └──── Continuous Delivery ────┘
└──────────────────── Continuous Deployment (승인 없이 끝까지) ────────┘
```

| 용어 | 뜻 |
|---|---|
| CI (Continuous Integration) | push할 때마다 자동으로 빌드·테스트해서 문제를 일찍 찾는다 |
| Continuous Delivery | 검증된 결과물을 스테이징까지 자동 배포한다. 운영 반영은 사람이 승인한다 |
| Continuous Deployment | 승인 단계 없이 운영까지 자동 배포한다 |

**Jenkins**는 이 흐름을 자동으로 돌려 주는 오픈소스 자동화 서버다. 사람이 하던 `git pull → build → docker build → push → 서버 접속 → 재시작`을 `Jenkinsfile` 하나로 코드화한다.

- **Java 기반**: JVM 위에서 돌기 때문에 OS에 크게 구애받지 않는다.
- **Jenkinsfile**: 파이프라인을 코드로 정의하고 Git으로 버전 관리한다.
- **플러그인**: 1,800개가 넘는 플러그인으로 거의 모든 도구와 연결된다.
- **Agent**: 빌드를 실행할 머신을 붙여 수평으로 확장한다.

---

## Jenkins는 언제 쓰나

같은 일을 GitLab CI나 GitHub Actions도 한다. 그래서 "왜 굳이 Jenkins인가"를 먼저 정해 두는 게 좋다.

**Jenkins가 맞는 경우**

- 코드 저장소와 CI를 **분리**하고 싶을 때. GitLab, GitHub, SVN, Perforce 어디든 붙는다.
- 사내망·온프레미스에서 빌드 환경을 직접 통제해야 할 때
- 파이프라인이 복잡해서 Groovy 스크립트나 플러그인이 필요할 때
- 여러 서버에 Agent를 두고 배포를 분산할 때

**GitLab CI가 더 맞는 경우**

- 이미 GitLab만 쓰고 파이프라인이 단순할 때
- MR 화면에서 파이프라인·로그·아티팩트를 한 번에 보고 싶을 때
- CI 서버를 따로 운영할 인력이 없을 때

| 항목 | Jenkins | GitLab CI |
|---|---|---|
| 구성 | Controller + Agent | GitLab + Runner |
| 설정 파일 | Jenkinsfile (Groovy DSL) | .gitlab-ci.yml (YAML) |
| 트리거 | Webhook / Polling / Cron / 다른 Job | GitLab 이벤트 중심 |
| 확장 | Agent 추가 | Runner 오토스케일 |
| 장점 | 유연함, 저장소·외부 시스템 연계 | 구조 단순, GitLab UI와 통합 |
| 단점 | 구성 요소가 많고 운영 부담 | GitLab에 종속, 복잡한 오케스트레이션에 제약 |

더 자세한 비교는 [GitLab CI/CD vs Jenkins — 실무 비교](/posts/gitlab-vs-jenkins-cicd)에 정리해 두었다.

---

## 용어부터 맞추기 — 같은 "Job", 다른 크기

GitLab CI를 써 본 사람이 Jenkins를 보면 가장 헷갈리는 부분이다. **"Job"이 가리키는 범위가 다르다.**

```
Jenkins                         GitLab
─────────────────────────────   ─────────────────────────────
Job "project-a" (설정 전체)  ≈  프로젝트의 .gitlab-ci.yml
  └ Build #812 (1회 실행)    ≈    └ Pipeline #812
      ├ stage('Test')        ≈        ├ Job unit-test
      ├ stage('Build')       ≈        ├ Job build-image
      └ stage('Deploy')      ≈        └ Job deploy-server
```

| | GitLab | Jenkins |
|---|---|---|
| "Job" | yml 안의 **작업 하나** (`build-image`) | New Item으로 만든 **프로젝트 설정 전체** (`project-a`) |
| 한 번의 실행 | Pipeline | Build |
| 그 안의 단계 | Job들 | Stage들 |

GitLab에서 Job은 Runner가 받아서 **깨끗한 환경 하나**에서 실행하는 단위다. 그래서 GitLab의 `CI_JOB_TOKEN`은 실행 한 번마다 새로 발급되고 끝나면 만료된다. 반면 Jenkins Job 설정 화면에서 만드는 Webhook Secret Token은 **프로젝트 설정에 고정으로 붙은 값**이다. 이름에 둘 다 "Job"이 들어가지만 전혀 다른 물건이다. 토큰 이야기는 ③편에서 자세히 다룬다.

---

## Jenkins 내부 구조 — 4개의 레이어

[Jenkins 공식 아키텍처 문서](https://www.jenkins.io/doc/developer/architecture/model/)는 Jenkins를 요청이 위에서 아래로 흐르는 4개 레이어로 설명한다.

```
외부 호출       자동화 스크립트(curl) · 브라우저 사용자 · Agent(agent.jar)
   │
1 Command      CLI(SSH/WebSocket) · HTTP Endpoints(Webhook이 여기로) · Web UI · Remoting
   │
2 Stapler      URL → Java 객체 메서드 매핑 · 보안 필터 · 라우팅
   │
3 Business     Models(Job, Build, Node, Credential) · Processing · Scheduling
   │
4 Storage      JENKINS_HOME 아래 XML 파일 (DB 없음)
```

실무에서 의미 있는 포인트는 세 가지다.

1. **Webhook은 HTTP Endpoint로 들어온다.** GitLab이 `POST /project/project-a`를 보내면 Stapler가 그 URL을 해당 Job 객체로 라우팅한다.
2. **Agent는 Remoting 채널로 붙는다.** `agent.jar`가 Controller와 연결을 유지하고, 그 채널로 명령과 로그가 오간다. ④편의 주제다.
3. **DB가 없다.** Job 설정, 빌드 이력, 플러그인, Credentials가 전부 `JENKINS_HOME`(Docker 기준 `/var/jenkins_home`)에 파일로 저장된다. **백업 = 이 디렉터리 백업**이고, 컨테이너로 띄울 때 이 경로를 볼륨으로 빼는 이유이기도 하다.

---

## 저장소 연동 — 무엇과 붙일 수 있나

Jenkins는 저장소에 종속되지 않는다. 대신 저장소마다 붙이는 플러그인과 트리거 방식이 다르다.

| 저장소 | 플러그인 | 트리거 |
|---|---|---|
| GitHub | github + git | Webhook (`/github-webhook/`) |
| GitLab | gitlab-plugin (+ gitlab-branch-source) | Webhook (`/project/<Job>`) |
| Bitbucket | bitbucket | Webhook (`/bitbucket-hook/`) |
| Gitea | gitea | Webhook |
| Azure Repos | git + Azure DevOps Service Hook | Service Hook |
| Subversion | subversion | post-commit hook / Poll SCM |
| Perforce | p4 | Perforce Trigger / Poll SCM |

정리하면 **Git 저장소는 Git 플러그인으로 checkout하고, 플랫폼 플러그인으로 Webhook·상태 표시를 붙인다.** 비 Git 저장소는 전용 SCM 플러그인에 hook이나 polling을 조합한다. GitLab에서 브랜치·MR마다 자동으로 Job을 만들고 싶다면 gitlab-branch-source가 유리하다.

---

## 어디에 설치할까 — 위치와 확장 로드맵

| 설치 위치 | 장점 | 단점 |
|---|---|---|
| 운영 서버 안 Jenkins 컨테이너 | 구축이 단순하고 비용이 없다 | 빌드 부하가 운영 서비스와 자원을 나눠 쓴다 |
| 같은 서버, Controller와 Agent 분리 | 추가 서버 없이 Controller를 보호한다 | Agent 컨테이너와 통신 구성이 필요하다 |
| 전용 CI 서버 | 보안 격리, 자원 독립. 공식 권장에 가장 가깝다 | 서버 비용, 네트워크 설정 |
| Cloud / Kubernetes Agent | 수요만큼 확장, 매번 깨끗한 환경 | 운영 복잡도가 가장 높다 |

공식 문서는 **Controller(Built-in Node)에서 직접 빌드하는 것을 장기적으로 권장하지 않는다.** Built-in Node의 Executor를 0으로 두고, 빌드는 Agent에서만 돌리라는 것이다. 다만 처음부터 그럴 필요는 없다. 단계적으로 가면 된다.

```
1단계  Controller 하나로 운영       소규모 팀, 빌드가 적을 때
2단계  고정 Agent 서버 추가          빌드가 몰리거나 보안 분리가 필요할 때
3단계  Docker Agent                 빌드 환경을 이미지로 관리
4단계  Kubernetes Agent             빌드마다 Pod 생성, 탄력 확장
```

이 시리즈는 1단계(Docker로 띄운 Controller 하나)에서 시작해 2단계로 넘어가는 시점까지를 다룬다.

---

## Declarative vs Scripted

Jenkinsfile 문법은 두 가지다.

| | Declarative | Scripted |
|---|---|---|
| 시작 블록 | `pipeline { }` | `node { }` |
| 문법 | 정해진 구조의 DSL | Groovy 코드 그대로 |
| 가독성 | 높음 | 복잡할수록 낮음 |
| 유연성 | 제한적 (`script { }`로 보완) | 높음 |
| 권장 | 신규 프로젝트 | 레거시, 아주 복잡한 로직 |

새로 시작한다면 Declarative를 쓰고, 꼭 필요한 곳만 `script { }` 블록으로 Groovy를 섞는 게 일반적이다.

---

## 전체 그림

이 시리즈가 최종적으로 만드는 구조는 이렇다.

```
개발자 push
   │
GitLab ──(Webhook + Secret Token)──▶ Jenkins Job
                                        │ Deploy Token으로 checkout
                                        │ Jenkinsfile 실행
                                        ├─ docker build   (Docker Socket Mount)   ← ②편
                                        ├─ Registry push  (Credentials)           ← ③편
                                        └─ 배포 서버에서 pull & up                 ← ④⑤편
                                        │
GitLab ◀──(Access Token으로 빌드 결과 전송)┘                                       ← ③편
```

## 정리

- Jenkins는 **저장소와 독립된 CI/CD 오케스트레이터**다. 유연한 대신 직접 운영해야 한다.
- GitLab의 Job은 작업 하나, Jenkins의 Job은 프로젝트 설정 전체다. 용어 대응부터 맞추면 뒤가 편하다.
- 모든 상태는 `JENKINS_HOME`의 파일이다. DB가 없다.
- 처음엔 Controller 하나로 시작하고, 빌드가 늘면 Agent로 분리한다.

다음 글에서는 Jenkins를 Docker로 설치하고, Jenkins 안에서 `docker build`를 실행하는 방식들(Docker Socket Mount, DinD, Podman, Kaniko)을 비교한다.

> **다음 글**: Jenkins 시리즈 ② 설치와 Docker 빌드 — Docker Socket Mount 제대로 이해하기
