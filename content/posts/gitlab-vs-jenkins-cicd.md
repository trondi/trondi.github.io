---
title: "GitLab CI/CD vs Jenkins — 실무 비교"
date: "2026-04-19"
summary: "GitLab CI/CD와 Jenkins의 구조, 파이프라인 작성 방식, 운영 부담을 실제 예시로 비교하고 팀 상황에 맞는 선택 기준을 정리했다."
category: "DevOps · Infra"
tags:
  - GitLab
  - Jenkins
  - CI/CD
  - DevOps
featured: false
---

# GitLab CI/CD vs Jenkins — 실무 비교

## 한 줄 요약

| | GitLab CI/CD | Jenkins |
|---|---|---|
| 형태 | SaaS / Self-hosted 통합 플랫폼 | 전용 CI 서버 (Self-hosted) |
| 설정 | `.gitlab-ci.yml` (YAML) | `Jenkinsfile` (Groovy DSL) |
| 운영 부담 | 낮음 (GitLab.com 사용 시 거의 없음) | 높음 (직접 설치·유지보수) |
| 플러그인 | 내장 기능 위주 | 2,000개+ 플러그인 |

---

## GitLab CI/CD 구조

GitLab은 Git 저장소 + CI/CD + Container Registry + 이슈 트래커가 **하나의 플랫폼**에 통합되어 있다.

```
.gitlab-ci.yml → GitLab Runner(에이전트) 실행 → 결과를 GitLab UI에 표시
```

### `.gitlab-ci.yml` 기본 구조

```yaml
# .gitlab-ci.yml
stages:
  - install
  - test
  - build
  - deploy

variables:
  NODE_VERSION: "20"
  IMAGE_NAME: $CI_REGISTRY_IMAGE  # GitLab Container Registry 자동 변수

# 공통 설정 (앵커 재사용)
.node_template: &node_template
  image: node:20-alpine
  cache:
    key: $CI_COMMIT_REF_SLUG
    paths:
      - node_modules/

install:
  <<: *node_template
  stage: install
  script:
    - npm ci

test:
  <<: *node_template
  stage: test
  script:
    - npm test -- --coverage
  coverage: '/Statements\s*:\s*([\d.]+)%/'  # 커버리지 수치 파싱
  artifacts:
    reports:
      junit: coverage/junit.xml
    paths:
      - coverage/

build:
  <<: *node_template
  stage: build
  script:
    - npm run build
  artifacts:
    paths:
      - .next/
    expire_in: 1 hour

docker-build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $IMAGE_NAME:$CI_COMMIT_SHORT_SHA .
    - docker push $IMAGE_NAME:$CI_COMMIT_SHORT_SHA
    - docker tag $IMAGE_NAME:$CI_COMMIT_SHORT_SHA $IMAGE_NAME:latest
    - docker push $IMAGE_NAME:latest

deploy-staging:
  stage: deploy
  environment:
    name: staging
    url: https://staging.example.com
  script:
    - ssh deploy@staging "docker pull $IMAGE_NAME:latest && docker compose up -d"
  only:
    - develop

deploy-production:
  stage: deploy
  environment:
    name: production
    url: https://example.com
  script:
    - ssh deploy@production "docker pull $IMAGE_NAME:latest && docker compose up -d"
  only:
    - main
  when: manual  # 수동 승인 후 배포
```

### GitLab 자동 환경변수

GitLab은 파이프라인 실행 시 유용한 변수를 자동으로 주입한다.

```
CI_COMMIT_SHA          → 전체 커밋 해시
CI_COMMIT_SHORT_SHA    → 앞 8자리
CI_COMMIT_BRANCH       → 브랜치명
CI_REGISTRY            → GitLab Container Registry 주소
CI_REGISTRY_IMAGE      → 현재 프로젝트 이미지 경로
CI_ENVIRONMENT_NAME    → 배포 환경 이름
```

---

## Jenkins 파이프라인 (동일 작업)

같은 파이프라인을 Jenkins로 작성하면:

```groovy
// Jenkinsfile
pipeline {
  agent any

  environment {
    IMAGE_NAME = 'registry.example.com/my-app'
    REGISTRY   = 'registry.example.com'
  }

  stages {
    stage('Install') {
      agent { docker { image 'node:20-alpine' } }
      steps { sh 'npm ci' }
    }

    stage('Test') {
      agent { docker { image 'node:20-alpine' } }
      steps {
        sh 'npm test -- --coverage'
      }
      post {
        always { junit 'coverage/junit.xml' }
      }
    }

    stage('Docker Build & Push') {
      steps {
        script {
          docker.withRegistry("https://${REGISTRY}", 'registry-creds') {
            def img = docker.build("${IMAGE_NAME}:${env.GIT_COMMIT[0..7]}")
            img.push()
            img.push('latest')
          }
        }
      }
    }

    stage('Deploy Staging') {
      when { branch 'develop' }
      steps {
        sshagent(['staging-ssh-key']) {
          sh 'ssh deploy@staging "docker pull ${IMAGE_NAME}:latest && docker compose up -d"'
        }
      }
    }

    stage('Deploy Production') {
      when { branch 'main' }
      input { message '프로덕션에 배포하시겠습니까?' }  // 수동 승인
      steps {
        sshagent(['prod-ssh-key']) {
          sh 'ssh deploy@production "docker pull ${IMAGE_NAME}:latest && docker compose up -d"'
        }
      }
    }
  }

  post {
    success { slackSend message: "✅ 빌드 성공: ${env.JOB_NAME}" }
    failure { slackSend message: "❌ 빌드 실패: ${env.JOB_NAME}" }
  }
}
```

---

## 핵심 차이점 비교

### 1. 설정 언어

```yaml
# GitLab: 선언형 YAML → 읽기 쉬움, IDE 자동완성 지원
script:
  - npm ci
  - npm test
```

```groovy
// Jenkins: Groovy DSL → 복잡한 로직 구현 가능
steps {
  script {
    def version = sh(script: 'cat package.json | jq -r .version', returnStdout: true).trim()
    currentBuild.displayName = "#${BUILD_NUMBER} - v${version}"
  }
}
```

### 2. 트리거 설정

```yaml
# GitLab — 코드 안에서 선언
rules:
  - if: $CI_COMMIT_BRANCH == "main"
  - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  - if: $CI_COMMIT_TAG                   # 태그 푸시 시
    when: never                           # 제외
```

```groovy
// Jenkins — UI에서 설정하거나 코드로 선언
triggers {
  pollSCM('H/5 * * * *')  // 5분마다 변경 확인
  cron('0 2 * * *')        // 매일 새벽 2시
}
// 또는 Webhook 설정 (플러그인 필요)
```

### 3. 캐시 / 아티팩트

```yaml
# GitLab: 내장 캐시 + 아티팩트
cache:
  key: $CI_COMMIT_REF_SLUG
  paths:
    - node_modules/
    - .npm/

artifacts:
  paths:
    - dist/
  expire_in: 7 days
```

```groovy
// Jenkins: 플러그인 또는 수동 구현
steps {
  // S3나 공유 볼륨에 수동으로 저장
  sh 'tar czf node_modules.tar.gz node_modules'
  s3Upload(bucket: 'my-cache', path: "cache/${env.BRANCH_NAME}/node_modules.tar.gz")
}
```

### 4. 환경 및 배포 추적

GitLab은 **Environments** 기능이 내장되어 있어 어느 버전이 어느 환경에 배포됐는지 UI에서 바로 확인할 수 있다. Jenkins는 별도 플러그인이나 외부 도구 없이는 이 기능이 없다.

---

## 선택 가이드

### GitLab CI/CD가 적합한 경우

- 이미 GitLab을 저장소로 사용 중
- 팀이 작거나 DevOps 전담 인력이 없음
- 빠른 CI/CD 구축이 우선
- Container Registry, CD 환경 추적 등 통합 기능이 필요
- GitLab.com 사용 시 서버 운영 부담 없음

### Jenkins가 적합한 경우

- 온프레미스 환경 (인터넷 연결 제한)
- GitHub, Bitbucket 등 다양한 저장소 연동 필요
- 복잡한 빌드 로직, 레거시 시스템 연동
- 기존 Jenkins 파이프라인 자산이 있는 팀
- 세밀한 인프라 제어가 필요

---

## 마이그레이션 고려 시

Jenkins → GitLab CI/CD 마이그레이션 시 주요 매핑:

| Jenkins | GitLab CI/CD |
|---|---|
| `Jenkinsfile` | `.gitlab-ci.yml` |
| `stage()` | `stages:` + `stage:` |
| `agent { docker {} }` | `image:` |
| `credentials()` | GitLab CI/CD Variables (Settings → CI/CD) |
| `when { branch 'main' }` | `rules: - if: $CI_COMMIT_BRANCH == "main"` |
| `input {}` | `when: manual` |
| `parallel {}` | 같은 `stage`에 여러 job |

---

## 정리

두 도구 모두 성숙한 CI/CD 솔루션이다. 핵심 차이는 **플랫폼 통합 수준**과 **운영 부담**이다.

GitLab CI/CD는 "이미 있는 환경에서 바로 쓰는" 도구, Jenkins는 "무엇이든 커스터마이징 가능한 파워툴"에 가깝다. 신규 프로젝트라면 GitLab CI/CD 또는 GitHub Actions 같은 플랫폼 통합 CI/CD로 시작하는 것이 빠르고, 레거시 환경이나 복잡한 온프레미스 요구사항이 있다면 Jenkins를 선택하는 것이 현실적이다.
