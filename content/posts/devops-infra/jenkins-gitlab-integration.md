---
title: "Jenkins 시리즈 ③ GitLab 연동 — 토큰 3종, Webhook, Jenkinsfile"
date: "2026-10-16"
summary: "Jenkins와 GitLab을 잇는 Credentials와 세 가지 토큰의 방향, Job·Webhook·Secret Token 설정, 비밀값이 새지 않는 Jenkinsfile 작성법, 그리고 GitLab CI의 CI_JOB_TOKEN이 Jenkins와 어떻게 다른지까지 정리했다."
category: "DevOps · Infra"
tags:
  - Jenkins
  - GitLab
  - CI/CD
  - Webhook
  - Credentials
featured: false
series: "Jenkins 실전"
seriesOrder: 3
---

# Jenkins 시리즈 ③ GitLab 연동 — 토큰 3종, Webhook, Jenkinsfile

> 시리즈 순서: 개념 → 설치와 Docker 빌드 → **GitLab 연동** → Controller와 Agent → 배포 전략

## 들어가며

Jenkins와 GitLab을 연결하는 과정은 화면 설정이 많아서 따라 하기는 쉽다. 그런데 끝나고 나면 "토큰을 몇 개 만들었더라, 어느 게 어디에 쓰이더라"가 남는다.

이 글은 설정 순서를 따라가되, **토큰마다 누가 누구에게 쓰는지 방향**을 기준으로 정리한다. 마지막에는 GitLab CI의 `CI_JOB_TOKEN`이 이 구조와 어떻게 다른지도 비교한다.

---

## 먼저 전체 그림 — 토큰은 방향으로 구분한다

```
                    ① Webhook Secret Token
GitLab ─────────────────────────────────────▶ Jenkins
       "나 진짜 GitLab이야, project-a에 push 있었어"

                    ② Deploy Token (read_repository)
GitLab ◀───────────────────────────────────── Jenkins
       "코드 좀 읽을게" (git checkout)

                    ③ Access Token (api)
GitLab ◀───────────────────────────────────── Jenkins
       "빌드 성공했어, MR에 표시해 줘"
```

| 토큰 | 방향 | 목적 | 만드는 곳 | Jenkins에 저장하는 형태 |
|---|---|---|---|---|
| ① Webhook Secret Token | GitLab → Jenkins | Webhook 요청이 진짜 GitLab에서 왔는지 검증 | Jenkins Job 설정 | Job 설정에 직접 |
| ② Deploy Token | Jenkins → GitLab 저장소 | 코드 checkout | GitLab 레포 Settings → Repository | Credentials: Username with password |
| ③ Access Token | Jenkins → GitLab API | 연결 확인, 빌드 상태 전송 | GitLab User Settings (또는 Project/Group Access Token) | Credentials: GitLab API token |

이 표 하나만 기억하면 나머지 설정은 순서 문제다.

---

## Credentials — 비밀값을 코드 밖에 두는 곳

Credentials는 Jenkins가 외부 시스템에 접근할 때 쓰는 인증 정보를 **Jenkinsfile에 노출하지 않고** 저장하는 공간이다. GitLab CI의 CI/CD Variables와 같은 역할이다.

| | GitLab CI/CD Variables | Jenkins Credentials |
|---|---|---|
| 관리 위치 | 프로젝트·그룹 설정 | Jenkins 전역(또는 폴더) |
| 사용법 | `$변수명` | `credentials('id')`, `withCredentials` |
| 재사용 | 그룹 변수로 공유 | 여러 Job에서 같은 ID로 공유 |

저장 위치는 **Jenkins 관리 → Credentials → System → Global credentials**다.

| 종류 | 저장하는 것 | 예 |
|---|---|---|
| Secret text | 문자열 하나 | API 토큰, `.env` 값 하나 |
| Username with password | 아이디 + 비밀번호 | Registry 로그인, Deploy Token |
| SSH Username with private key | SSH 개인키 | 배포 서버 접속, SSH checkout |
| GitLab API token | GitLab API 토큰 | GitLab 연결 설정용 Access Token |
| Secret file | 파일 하나 | kubeconfig, `.env` 파일 통째 |

`Username with password`를 `environment`에서 `credentials()`로 꺼내면 `_USR`, `_PSW` 두 변수로 자동 분리된다.

---

## ③ Access Token — GitLab 연결

Jenkins가 GitLab API를 호출하려면 `api` 권한 토큰이 필요하다. MR에 빌드 상태를 표시하고, 연결을 확인하는 데 쓰인다.

**GitLab에서 발급**

1. User Settings → Access Tokens → Add new token
2. 이름: `jenkins-api`, Scope: `api`
3. 발급된 값을 복사한다. 화면을 벗어나면 다시 볼 수 없다.

개인 계정 토큰은 그 사람이 퇴사하면 같이 사라진다. GitLab 버전과 권한이 허락한다면 **Project Access Token이나 Group Access Token**으로 발급하는 게 낫다. 사람이 아니라 봇 계정에 묶인다.

**Jenkins에 등록**

1. Credentials → Add Credentials → Kind: **GitLab API token**, ID: `gitlab-api`
2. Jenkins 관리 → System → GitLab 섹션
   - Connection name: `gitlab-connection`
   - GitLab host URL: `https://gitlab.example.com`
   - Credentials: `gitlab-api`
3. **Test Connection** → `Success`가 나오면 저장한다. `Error`라면 URL과 `api` scope를 확인한다.

---

## ② Deploy Token — 코드 checkout

코드를 가져오는 데에도 개인 계정 토큰을 쓸 수 있다. 하지만 **그 직원이 퇴사하거나 계정이 정지되면 모든 빌드가 한꺼번에 실패한다.** 권한이 사람에 묶여 있기 때문이다.

Deploy Token은 **저장소(또는 그룹)에 묶인 읽기 전용 토큰**이라 사람과 무관하게 동작한다.

**GitLab에서 발급**

1. 레포 Settings → Repository → Deploy tokens → Add token
2. 이름: `jenkins-deploy`, Scope: `read_repository`
3. 발급된 **username과 token**을 둘 다 복사한다.

여러 레포를 빌드한다면 **그룹 Deploy Token** 하나로 그룹 안의 모든 레포를 읽을 수 있다.

**Jenkins에 등록**

- Kind: **Username with password**
- Username: 발급된 username
- Password: 발급된 token
- ID: `gitlab-deploy`

주의할 점이 하나 있다. Job의 SCM 설정에서 checkout용 Credentials로 ③의 **GitLab API token** 종류를 고르면 안 된다. Git 플러그인은 그 종류를 인증에 쓰지 못한다. checkout에는 **Username with password**(Deploy Token)나 SSH 키를 쓴다.

---

## Job 만들기

### Item 종류

New Item에서 고를 수 있는 종류는 이렇다.

| 종류 | 설명 | 언제 |
|---|---|---|
| Freestyle project | 화면에서 클릭으로 설정 | 간단한 작업. 설정이 Git에 남지 않는다 |
| **Pipeline** | Jenkinsfile로 정의 | 대부분의 경우 |
| Multibranch Pipeline | 브랜치마다 Job 자동 생성 | 브랜치·MR별 빌드가 필요할 때 |
| Folder | Job을 묶는 폴더 | 팀·프로젝트별 정리, 권한 분리 |

단일 브랜치 배포라면 **Pipeline**으로 충분하다.

### Pipeline Job 설정

**General**

- GitLab Connection: `gitlab-connection` 선택. 이게 있어야 Webhook을 받고 상태를 보낼 수 있다.

**빌드 트리거**

| 옵션 | 동작 |
|---|---|
| **Build when a change is pushed to GitLab** | Webhook으로 즉시 빌드. 이걸 쓴다 |
| Poll SCM | Jenkins가 주기적으로 변경을 확인. Webhook을 못 쓸 때만 |
| Build periodically | cron으로 무조건 실행. 야간 빌드, 정리 작업 |

"Build when a change is pushed to GitLab"을 체크하면 아래에 **Webhook URL**(`http://<jenkins>:15080/project/project-a`)이 표시된다. 복사해 둔다. 세부 옵션은 Push Events만 켜고, MR 빌드가 필요하면 Opened Merge Request Events를 추가한다.

**Pipeline**

- Definition: **Pipeline script from SCM** (레포 안의 Jenkinsfile을 읽는다)
- SCM: Git
- Repository URL: `https://gitlab.example.com/group/project-a.git`
- Credentials: `gitlab-deploy`
- Branch: `*/main`
- Script Path: `Jenkinsfile`

---

## ① Webhook과 Secret Token

### Polling 대신 Webhook인 이유

```
Polling   Jenkins: 변경 있어요?  GitLab: 없어요   (5분마다 반복)
Webhook   GitLab: push 발생!  →  Jenkins: 빌드 시작
```

Polling은 택배가 왔는지 5분마다 문을 열어 보는 것이고, Webhook은 택배 기사가 초인종을 누르는 것이다. 지연도 없고 불필요한 요청도 없다.

### GitLab에 Webhook 등록

레포 Settings → Webhooks → Add new webhook

- URL: 앞에서 복사한 Webhook URL
- Secret token: 아래에서 만드는 값
- Trigger: Push events (필요하면 Merge request events)
- SSL verification: Jenkins가 HTTPS가 아니라면 해제해야 전달된다

저장 후 **Test → Push events**를 눌러 `HTTP 200`이 나오고 Jenkins Build History에 빌드가 생기면 성공이다. `4xx`/`5xx`라면 URL, 토큰, Jenkins 상태를 확인한다.

### Secret Token — 왜 필요한가

Webhook URL은 비밀이 아니다. Secret Token이 없으면 **URL을 아는 누구든 POST 요청 하나로 빌드를 실행**할 수 있다. 빌드가 배포까지 이어지는 Job이라면 원치 않는 배포가 일어난다.

1. Jenkins: Job 설정 → 빌드 트리거 → 고급 → Secret token → **Generate** → 복사
2. GitLab: Webhook 설정의 Secret token 칸에 붙여넣기
3. 이후 GitLab은 요청 헤더(`X-Gitlab-Token`)에 이 값을 담아 보내고, Jenkins는 일치할 때만 빌드한다.

이 토큰은 **Job마다 따로** 만들어지고, 사람이 만든 뒤 계속 쓰는 고정값이다. 내부망이라도 설정해 두는 게 좋다.

---

## Jenkinsfile 작성

### 기본 구조

```diagram
jenkins-pipeline
```

```groovy
pipeline {
  agent any                  // 어디서 실행할지 (④편)
  environment { ... }        // 환경변수, Credentials 주입
  stages {                   // 딱 하나
    stage('Build') {         // 여러 개, 순서대로 실행
      steps { sh '...' }     // 실제 명령
    }
  }
  post { ... }               // 끝난 뒤 처리: success / failure / always
}
```

| 블록 | 역할 |
|---|---|
| `agent` | 실행할 Node. 지금은 `any` |
| `environment` | 파이프라인 전체 환경변수. `credentials('id')`로 비밀값 주입 |
| `stages` / `stage` | 단계 묶음 / 단계 하나 |
| `steps` | `sh`, `checkout` 같은 실제 명령 |
| `when` | 조건부 실행 (브랜치, 환경변수 등) |
| `post` | `success`, `failure`, `always`로 후처리 |

### 실전 예시 — 빌드, Registry push, 배포

모노레포(Turborepo)의 Next.js 앱 하나를 빌드해서 Registry에 올리고 같은 서버에 재배포하는 예시다.

```groovy
pipeline {
  agent any

  environment {
    REGISTRY   = 'harbor.example.com'
    IMAGE      = "${REGISTRY}/team/project-a"
    TAG        = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"
    REGISTRY_CREDS = credentials('harbor-ci')   // → REGISTRY_CREDS_USR / _PSW
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build') {
      steps {
        sh 'docker build -t $IMAGE:$TAG -f apps/project-a/Dockerfile .'
      }
    }

    stage('Push') {
      steps {
        sh '''
          echo "$REGISTRY_CREDS_PSW" | docker login "$REGISTRY" -u "$REGISTRY_CREDS_USR" --password-stdin
          docker push $IMAGE:$TAG
        '''
      }
    }

    stage('Deploy') {
      when { expression { env.GIT_BRANCH == 'origin/main' } }
      steps {
        sh '''
          cd /srv/project-a
          TAG=$TAG docker compose pull
          TAG=$TAG docker compose up -d
        '''
      }
    }
  }

  post {
    success { echo "배포 완료: $IMAGE:$TAG" }
    failure { echo '빌드 실패. 콘솔 로그 확인' }
    always  { sh 'docker logout $REGISTRY || true' }
  }
}
```

네 가지를 의도적으로 이렇게 썼다.

**1. `when { branch 'main' }`을 쓰지 않은 이유**

자주 보이는 `when { branch 'main' }`은 **Multibranch Pipeline에서만** 동작한다. `BRANCH_NAME` 변수가 Multibranch에서만 채워지기 때문이다. 일반 Pipeline Job에서는 조건이 항상 거짓이 되어 배포 stage가 조용히 건너뛰어진다. 일반 Pipeline에서는 Git 플러그인이 채워 주는 `GIT_BRANCH`(`origin/main` 형태)로 비교한다.

**2. `latest` 대신 버전 태그**

`BUILD_NUMBER-커밋해시`(예: `812-abc1234`)로 태그를 붙인다. `latest`로 덮어쓰면 직전 버전이 무엇이었는지 알 수 없어서 롤백이 어려워진다. ⑤편에서 다시 다룬다.

**3. 비밀값이 들어간 sh는 작은따옴표**

```groovy
sh "echo ${REGISTRY_CREDS_PSW} | docker login ..."   // ✗ 큰따옴표: Groovy가 먼저 치환
sh 'echo "$REGISTRY_CREDS_PSW" | docker login ...'   // ✓ 작은따옴표: 셸이 치환
```

큰따옴표 문자열은 Groovy가 비밀값을 명령 문자열에 **미리 박아 넣는다.** 그러면 프로세스 목록 등에 값이 노출될 수 있고, Jenkins도 콘솔에 "Groovy String interpolation으로 민감한 값을 넘겼다"는 경고를 띄운다. 작은따옴표로 쓰면 셸이 환경변수에서 읽기 때문에 명령 문자열에 값이 남지 않는다.

**4. `docker compose`로 배포**

`docker stop && docker rm && docker run`을 이어 붙이는 대신, 서버에 둔 `docker-compose.yml`의 `image: harbor.example.com/team/project-a:${TAG}`에 태그만 넘긴다. 포트, 볼륨, 재시작 정책은 compose 파일에 남고, 파이프라인은 "어떤 버전을 띄울지"만 정한다.

모노레포라면 Dockerfile 위치만 `-f`로 지정하고 빌드 컨텍스트는 루트(`.`)로 둔다. 공통 패키지를 함께 복사해야 하기 때문이다.

---

## 비교: GitLab CI의 CI_JOB_TOKEN

Jenkins를 쓰다 GitLab CI 설정을 보면 `CI_JOB_TOKEN`이라는 토큰이 나온다. Credentials에 등록한 적도 없는데 쓰이고 있다. 이름에 "Job"이 들어가서 ①의 Jenkins Job Secret Token과 같은 것처럼 보이지만 **전혀 다르다.**

### CI_JOB_TOKEN은 무엇인가

GitLab이 **Job이 시작될 때마다 자동으로 발급하고, Job이 끝나면 만료시키는** 토큰이다. ①편에서 봤듯 GitLab의 Job은 yml 안의 작업 하나다.

```
Pipeline #812
 ├ Job #5001 unit-test     토큰 A 발급 → 실행 → 끝 → A 만료
 ├ Job #5002 build-image   토큰 B 발급 → 실행 → 끝 → B 만료
 └ Job #5003 deploy        토큰 C 발급 → 실행 → 끝 → C 만료
```

- 이름은 GitLab이 정해 둔 **미리 정의된 변수**다. `CI_COMMIT_SHA`, `CI_PROJECT_NAME`과 같은 부류다.
- yml에 적든 안 적든 **매번 발급된다.** `${CI_JOB_TOKEN}`이라고 쓰는 건 발급을 요청하는 게 아니라 이미 있는 값을 읽는 것이다. 셸에서 `$HOME`을 쓰는 것과 같다.
- Variables에 등록하지 않는다. 등록할 이유도, 등록할 곳도 없다.
- 권한은 **파이프라인을 실행한 사용자의 권한** 안에서, 저장소·패키지·레지스트리·릴리스 같은 일부 기능으로 제한된다.

### 자동인 것과 사람이 하는 것

| 일 | 누가 |
|---|---|
| 토큰 생성, 환경변수 주입, 만료 | GitLab (매 Job 자동) |
| 토큰을 어디에 쓸지 연결 | 사람이 `.gitlab-ci.yml`에 **한 번** 작성 |
| 받는 쪽 프로젝트의 접근 허용 | 경우에 따라 사람이 한 번 (아래 참고) |

GitLab 키워드가 내부적으로 쓰는 경우에는 **연결조차 필요 없다.**

| 상황 | 예 |
|---|---|
| 자기 저장소 checkout | 모든 Job 시작 시 Runner가 clone |
| 같은 GitLab의 submodule | `GIT_SUBMODULE_STRATEGY: recursive` |
| 릴리스 생성 | `release:` 키워드 |
| 다른 프로젝트 파이프라인 실행 | `trigger: project:` |
| 다른 프로젝트 아티팩트 | `needs: - project:` |

반면 git, docker, npm, curl을 **직접 실행할 때는** `${CI_JOB_TOKEN}`을 적어야 한다. 도구들은 이 환경변수를 알아서 꺼내 쓰지 않는다.

| 상황 | 적는 곳 |
|---|---|
| 다른 private 저장소 clone, Go 모듈 | `git config ... insteadOf` |
| GitLab Container Registry | `docker login -u gitlab-ci-token -p $CI_JOB_TOKEN $CI_REGISTRY` |
| GitLab Package Registry | `.npmrc`의 `_authToken=${CI_JOB_TOKEN}`, Maven `settings.xml` |
| GitLab API | `curl --header "JOB-TOKEN: $CI_JOB_TOKEN" ...` |

### 예시: Go 앱이 사내 공통 모듈을 받는 경우

Go는 의존성을 `go get`으로 받고, `go get`은 내부적으로 `git clone`을 한다. 사내 GitLab에 있는 공통 모듈을 받으려면 git에게 "이 주소로 갈 때 토큰을 붙여라"라고 알려야 한다.

```yaml
# Go 앱의 .gitlab-ci.yml
variables:
  GOPRIVATE: gitlab.example.com          # 공개 프록시(proxy.golang.org) 대신 git으로 직접

build:
  image: golang:1.26
  before_script:
    - git config --global url."https://gitlab-ci-token:${CI_JOB_TOKEN}@gitlab.example.com/".insteadOf "https://gitlab.example.com/"
  script:
    - go mod vendor                      # 이 토큰으로 공통 모듈을 받는다
    - docker build --network=none -t $IMG .
```

`gitlab-ci-token`도 정해진 사용자명이다. 이 `insteadOf` 줄을 지우면 토큰은 여전히 환경변수에 있지만 git이 인증 없이 접속해서 실패한다.

같은 조직에서 npm이나 Maven 패키지를 GitLab이 아닌 **Nexus**에서 받는다면, 그쪽은 `CI_JOB_TOKEN`을 쓸 수 없다. GitLab이 발급한 토큰은 GitLab 자원에만 통하기 때문이다. Nexus용 계정은 사람이 Variables에 등록해야 한다. "Go 앱에서만 `CI_JOB_TOKEN`이 보이는" 이유는 언어 때문이 아니라 **받는 곳이 GitLab이기 때문**이다.

### 접근 허용 (Job token allowlist)

다른 프로젝트의 토큰으로 내 프로젝트에 접근하려면 기본적으로 내 프로젝트의 **Settings → CI/CD → Job token permissions**에 그 프로젝트가 등록되어 있어야 한다.

단, 받는 쪽 프로젝트가 **Internal이나 Public**이면 저장소, 패키지, 레지스트리 같은 일부 기능은 allowlist 없이도 접근할 수 있다. 사내 공통 모듈 레포를 Internal로 두었다면 따로 설정할 게 없다. Private이라면 allowlist에 추가한다. 메뉴 이름은 GitLab 버전마다 조금씩 다르니 [공식 문서](https://docs.gitlab.com/ci/jobs/ci_job_token/)에서 버전에 맞는 페이지를 확인한다.

### Jenkins라면 어떻게 되나

Jenkins에는 "빌드마다 자동 발급되는 GitLab 토큰"이 없다. 같은 Go 앱을 Jenkins에서 빌드하면 이렇게 해야 한다.

1. 공통 모듈 레포(또는 그룹)에 `read_repository` Deploy Token을 **사람이 발급**한다.
2. Credentials에 Username with password로 **사람이 등록**한다.
3. Jenkinsfile에서 **사람이 연결**한다.

```groovy
withCredentials([usernamePassword(credentialsId: 'gitlab-deploy',
                                  usernameVariable: 'GL_USER', passwordVariable: 'GL_TOKEN')]) {
  sh '''
    git config --global url."https://${GL_USER}:${GL_TOKEN}@gitlab.example.com/".insteadOf "https://gitlab.example.com/"
    GOPRIVATE=gitlab.example.com go mod vendor
  '''
}
```

| | GitLab CI | Jenkins |
|---|---|---|
| 1. 토큰 발급 | GitLab 자동 (매 Job) | 사람 (Deploy Token) |
| 2. 토큰 저장 | 필요 없음 | 사람 (Credentials) |
| 3. 도구에 연결 | 사람 (yml 한 줄) | 사람 (Jenkinsfile) |
| 수명 | Job 동안 몇 분 | 만료일까지 수개월 |

### 공통 교훈: 토큰을 이미지에 넣지 않는다

위 예시에서 `go mod vendor`를 **`docker build` 바깥**에서 실행하고, 빌드는 `--network=none`으로 돌린 데는 이유가 있다.

```dockerfile
# ✗ 이렇게 하면
ARG GITLAB_TOKEN
RUN git config --global url."https://oauth2:${GITLAB_TOKEN}@gitlab.example.com/".insteadOf ... && go mod download
```

```bash
$ docker history myapp:1.0
... ARG GITLAB_TOKEN=glpat-8f3k...    ← 토큰이 이미지 메타데이터에 남는다
```

빌드 인자는 `docker history`에 그대로 남는다. 이미지를 받은 누구나 토큰을 꺼낼 수 있다. 그래서 **CI 작업 공간에서 의존성을 미리 받고**, 이미지는 받아 둔 파일만 `COPY`한다. `--network=none`은 빌드 중에 몰래 네트워크로 받는 단계가 끼어들지 않았다는 보증이 된다. GitLab CI든 Jenkins든 똑같이 적용되는 원칙이다.

---

## 정리

- 토큰은 **방향**으로 구분한다.
  - ① Webhook Secret Token: GitLab → Jenkins, 요청 검증
  - ② Deploy Token: Jenkins → 저장소, checkout
  - ③ Access Token: Jenkins → API, 상태 전송
- 사람에게 묶인 토큰 대신 **Deploy Token, Project/Group Access Token**을 쓴다.
- Jenkinsfile에서 비밀값이 들어간 `sh`는 **작은따옴표**로 쓴다.
- 이미지 태그는 `latest` 대신 **빌드 번호 + 커밋**으로 붙인다.
- GitLab의 `CI_JOB_TOKEN`은 **Job마다 자동 발급되는 일회용 출입증**이다. Jenkins에는 이 개념이 없어서 Deploy Token을 직접 관리한다.

다음 글에서는 지금까지 `agent any`로 넘어갔던 부분, 즉 **빌드가 실제로 어디서 실행되는지**를 다룬다. Controller와 Agent 구조다.

> **이전 글**: Jenkins 시리즈 ② 설치와 Docker 빌드
> **다음 글**: Jenkins 시리즈 ④ Controller와 Agent — 빌드는 어디서 도는가
