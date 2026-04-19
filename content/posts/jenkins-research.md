---
title: "Jenkins 기술 연구 — CI/CD 파이프라인 구축 가이드"
date: "2026-04-19"
summary: "Jenkins의 핵심 개념과 Declarative Pipeline 작성법, Docker 빌드·배포 자동화까지 실무에서 바로 쓸 수 있는 내용을 정리했다."
category: "DevOps · Infra"
tags:
  - Jenkins
  - CI/CD
  - DevOps
  - Pipeline
featured: false
---

# Jenkins 기술 연구 — CI/CD 파이프라인 구축 가이드

## Jenkins란

**Jenkins**는 오픈소스 CI/CD 자동화 서버다. 코드 푸시 → 빌드 → 테스트 → 배포까지의 흐름을 자동화한다. 2011년부터 시작해 현재 가장 많이 사용되는 CI/CD 도구 중 하나다.

```
개발자 push → Jenkins 감지 → 빌드 → 테스트 → Docker 이미지 → 서버 배포
```

---

## 핵심 개념

### Pipeline

Jenkins의 핵심 단위. 빌드/테스트/배포 단계를 **코드로 정의**한다(`Jenkinsfile`).

### Agent

파이프라인을 실행하는 환경. Jenkins 서버 자체(`any`), 특정 레이블의 노드, Docker 컨테이너 등을 지정할 수 있다.

### Stage / Step

```
Pipeline
  └─ Stage: Build
       └─ Step: sh 'npm install'
       └─ Step: sh 'npm run build'
  └─ Stage: Test
       └─ Step: sh 'npm test'
  └─ Stage: Deploy
       └─ Step: sh 'docker push ...'
```

### Declarative vs Scripted Pipeline

| | Declarative | Scripted |
|---|---|---|
| 문법 | 구조화된 DSL | Groovy 스크립트 |
| 가독성 | 높음 | 낮음 (복잡도 높을수록) |
| 유연성 | 제한적 | 높음 |
| 권장 | ✓ 신규 프로젝트 | 레거시 / 복잡한 로직 |

---

## Declarative Pipeline 작성

### 기본 구조

```groovy
// Jenkinsfile
pipeline {
  agent any

  environment {
    NODE_VERSION = '20'
    REGISTRY     = 'registry.example.com'
    IMAGE_NAME   = 'my-app'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Test') {
      steps {
        sh 'npm test -- --coverage'
      }
      post {
        always {
          junit 'coverage/junit.xml'  // 테스트 결과 수집
        }
      }
    }

    stage('Build') {
      steps {
        sh 'npm run build'
      }
    }

    stage('Docker Build & Push') {
      steps {
        script {
          def tag = "${env.GIT_COMMIT[0..7]}"
          docker.withRegistry("https://${REGISTRY}", 'registry-credentials') {
            def image = docker.build("${REGISTRY}/${IMAGE_NAME}:${tag}")
            image.push()
            image.push('latest')
          }
        }
      }
    }

    stage('Deploy') {
      when {
        branch 'main'  // main 브랜치에서만 배포
      }
      steps {
        sshPublisher(
          publishers: [sshPublisherDesc(
            configName: 'production-server',
            transfers: [sshTransfer(
              execCommand: '''
                docker pull ${REGISTRY}/${IMAGE_NAME}:latest
                docker stop my-app || true
                docker rm my-app || true
                docker run -d --name my-app -p 3000:3000 ${REGISTRY}/${IMAGE_NAME}:latest
              '''
            )]
          )]
        )
      }
    }
  }

  post {
    success {
      slackSend channel: '#deploys', message: "✅ 배포 성공: ${env.JOB_NAME} #${env.BUILD_NUMBER}"
    }
    failure {
      slackSend channel: '#deploys', message: "❌ 빌드 실패: ${env.JOB_NAME} #${env.BUILD_NUMBER}"
    }
  }
}
```

---

## Docker 에이전트 사용

Docker 컨테이너 안에서 빌드하면 Jenkins 서버에 Node.js, Java 등을 직접 설치할 필요가 없다.

```groovy
pipeline {
  agent {
    docker {
      image 'node:20-alpine'
      args  '-v /tmp:/tmp'  // 캐시 마운트
    }
  }

  stages {
    stage('Build') {
      steps {
        sh 'node --version'  // 컨테이너 안에서 실행
        sh 'npm ci && npm run build'
      }
    }
  }
}
```

### 멀티 스테이지 빌드와 연동

```groovy
stage('Docker Build') {
  steps {
    script {
      // 멀티 스테이지 Dockerfile 빌드
      sh '''
        docker build \
          --target runner \
          --build-arg NODE_ENV=production \
          -t ${IMAGE_NAME}:${GIT_COMMIT} \
          .
      '''
    }
  }
}
```

---

## 실제 활용 패턴

### 브랜치별 파이프라인 분기

```groovy
stage('Deploy') {
  steps {
    script {
      if (env.BRANCH_NAME == 'main') {
        deployTo('production')
      } else if (env.BRANCH_NAME == 'develop') {
        deployTo('staging')
      } else {
        echo "PR 브랜치 — 배포 건너뜀"
      }
    }
  }
}
```

### 병렬 실행

```groovy
stage('Test') {
  parallel {
    stage('Unit Test') {
      steps { sh 'npm run test:unit' }
    }
    stage('E2E Test') {
      steps { sh 'npm run test:e2e' }
    }
    stage('Lint') {
      steps { sh 'npm run lint' }
    }
  }
}
```

### 환경변수 & Credentials 관리

```groovy
environment {
  // Jenkins Credentials Store에서 가져옴
  AWS_CREDENTIALS = credentials('aws-credentials-id')
  // USERNAME, PASSWORD, AWS_CREDENTIALS_USR, AWS_CREDENTIALS_PSW 변수 자동 생성
}

steps {
  withCredentials([string(credentialsId: 'slack-token', variable: 'SLACK_TOKEN')]) {
    sh 'curl -H "Authorization: Bearer $SLACK_TOKEN" ...'
  }
}
```

---

## Jenkins 설치 (Docker로 빠르게 실행)

```bash
# Jenkins 실행 (Docker-in-Docker 지원 포함)
docker run -d \
  --name jenkins \
  -p 8080:8080 \
  -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  jenkins/jenkins:lts

# 초기 관리자 비밀번호 확인
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

---

## 주요 플러그인

| 플러그인 | 용도 |
|---|---|
| Git | Git 연동 |
| Docker Pipeline | Docker 빌드/실행 |
| Kubernetes | K8s 에이전트 |
| Blue Ocean | 파이프라인 시각화 UI |
| Slack Notification | Slack 알림 |
| Credentials | 비밀 정보 관리 |
| SSH Agent | SSH 키 자동 주입 |

---

## 정리

Jenkins는 유연성이 가장 큰 장점이다. 플러그인 생태계가 방대하고, Groovy 기반 스크립트로 복잡한 로직도 표현할 수 있다. 대신 초기 설정 비용이 높고 직접 운영해야 한다.

```
장점: 무료, 오픈소스, 플러그인 풍부, 온프레미스 완전 제어
단점: 운영 부담, 초기 설정 복잡, UI가 다소 레거시
```

GitLab CI/CD나 GitHub Actions 같은 SaaS 솔루션이 늘어났지만, 온프레미스 환경이나 세밀한 제어가 필요한 기업에서는 여전히 Jenkins가 핵심 선택지다.
