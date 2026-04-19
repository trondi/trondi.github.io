---
title: "PM2로 Node.js 서버 배포 설정하기"
date: "2026-04-19"
summary: "PM2의 핵심 개념과 ecosystem.config.js 작성법, 무중단 배포·자동 재시작·로그 관리까지 실제 운영 환경에서 바로 쓸 수 있게 정리했다."
category: "DevOps · Infra"
tags:
  - PM2
  - Node.js
  - DevOps
  - Deploy
  - Process Manager
featured: false
---

# PM2로 Node.js 서버 배포 설정하기

## PM2란

**PM2(Process Manager 2)**는 Node.js 애플리케이션을 위한 프로세스 관리자다. 서버에서 Node.js 앱을 직접 `node server.js`로 실행하면 터미널이 닫히거나 에러가 나면 프로세스가 죽는다. PM2는 이 문제를 해결한다.

```
node server.js    → 터미널 닫히면 종료, 에러 시 그냥 죽음
pm2 start app.js  → 백그라운드 실행, 자동 재시작, 로그 수집
```

**주요 기능:**
- 프로세스 크래시 시 자동 재시작
- 서버 재부팅 후 자동 시작 (startup hook)
- 클러스터 모드 (CPU 코어 수만큼 프로세스 생성)
- 무중단 재배포 (`reload`)
- 실시간 로그 수집 및 로테이션

---

## 설치

```bash
npm install -g pm2
```

---

## 기본 사용법

```bash
# 앱 시작
pm2 start server.js

# 이름 지정
pm2 start server.js --name my-app

# 프로세스 목록
pm2 list

# 상태 모니터링 (실시간)
pm2 monit

# 로그 보기
pm2 logs my-app

# 재시작
pm2 restart my-app

# 중지
pm2 stop my-app

# 삭제
pm2 delete my-app
```

---

## ecosystem.config.js — 설정 파일로 관리

여러 설정을 코드로 관리하는 것이 핵심이다. 프로젝트 루트에 `ecosystem.config.js`를 만든다.

### 기본 구조

```js
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'my-app',
      script: 'server.js',
      instances: 'max',        // CPU 코어 수만큼 프로세스 생성
      exec_mode: 'cluster',    // 클러스터 모드 활성화
      watch: false,            // 파일 변경 감지 (프로덕션에서는 false)
      max_memory_restart: '500M', // 메모리 초과 시 재시작

      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
```

```bash
# 개발 환경으로 시작
pm2 start ecosystem.config.js

# 프로덕션 환경 변수 적용
pm2 start ecosystem.config.js --env production
```

### Next.js 프로젝트 설정

Next.js는 `next start`로 실행하므로 script 경로가 다르다.

```js
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'nextjs-app',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/var/www/my-app',   // 앱 루트 경로
      instances: 2,             // 코어가 4개라면 2~4 사이 권장
      exec_mode: 'cluster',
      max_memory_restart: '1G',

      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // 로그 파일 경로
      out_file: '/var/log/pm2/nextjs-out.log',
      error_file: '/var/log/pm2/nextjs-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // 재시작 정책
      restart_delay: 3000,     // 재시작 전 3초 대기
      max_restarts: 10,        // 10회 이상 크래시 시 중지
      min_uptime: '5s',        // 5초 이상 실행돼야 정상 시작으로 간주
    },
  ],
};
```

### 여러 앱 동시 관리

```js
module.exports = {
  apps: [
    {
      name: 'web',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/var/www/web',
      instances: 2,
      exec_mode: 'cluster',
      env_production: { NODE_ENV: 'production', PORT: 3000 },
    },
    {
      name: 'api',
      script: 'dist/index.js',
      cwd: '/var/www/api',
      instances: 4,
      exec_mode: 'cluster',
      env_production: { NODE_ENV: 'production', PORT: 4000 },
    },
    {
      name: 'worker',
      script: 'dist/worker.js',
      cwd: '/var/www/api',
      instances: 1,           // 워커는 단일 프로세스
      exec_mode: 'fork',
      env_production: { NODE_ENV: 'production' },
    },
  ],
};
```

---

## 클러스터 모드 vs 포크 모드

```diagram
pm2-concepts
```

| | 포크 모드 (fork) | 클러스터 모드 (cluster) |
|---|---|---|
| 프로세스 수 | 1개 | N개 (코어 수에 따라) |
| 포트 공유 | 불가 | 가능 (Node.js cluster 모듈) |
| 용도 | 단순 스크립트, 워커 | 웹 서버, API |
| 부하 분산 | ✗ | ✅ Round-robin |

```js
// 포크 모드 — 단순 스크립트
{ exec_mode: 'fork', instances: 1 }

// 클러스터 모드 — 웹 서버
{ exec_mode: 'cluster', instances: 'max' }
// instances: 'max' → os.cpus().length와 동일
// instances: 0     → 위와 동일
// instances: -1    → 코어 수 - 1
```

---

## 무중단 배포 (reload)

`restart`는 프로세스를 내렸다가 올린다 (짧은 다운타임 발생). `reload`는 클러스터 모드에서 순차적으로 재시작해 다운타임 없이 배포한다.

```bash
# ❌ 다운타임 발생
pm2 restart my-app

# ✅ 무중단 배포 (클러스터 모드에서만 유효)
pm2 reload my-app
```

**배포 스크립트 예시:**

```bash
#!/bin/bash
set -e

APP_DIR="/var/www/my-app"

echo "1. 코드 pull"
cd $APP_DIR
git pull origin main

echo "2. 의존성 설치"
npm ci --only=production

echo "3. Next.js 빌드"
npm run build

echo "4. PM2 무중단 재시작"
pm2 reload ecosystem.config.js --env production

echo "배포 완료"
```

---

## 서버 재부팅 후 자동 시작 설정

```bash
# startup 스크립트 생성 (OS에 맞게 자동 감지)
pm2 startup

# 위 명령어 실행 후 출력되는 sudo 명령어를 복사해서 실행
# 예: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu

# 현재 실행 중인 프로세스 목록 저장
pm2 save
```

이 이후로는 서버가 재부팅돼도 `pm2 save`로 저장된 프로세스가 자동으로 시작된다.

---

## 로그 관리

### 기본 로그 명령어

```bash
# 전체 로그
pm2 logs

# 특정 앱 로그
pm2 logs my-app

# 최근 200줄
pm2 logs my-app --lines 200

# 로그 파일 초기화
pm2 flush my-app
```

### 로그 로테이션 (pm2-logrotate)

기본적으로 PM2 로그 파일은 무한히 쌓인다. `pm2-logrotate` 모듈로 자동 관리한다.

```bash
# 설치
pm2 install pm2-logrotate

# 설정
pm2 set pm2-logrotate:max_size 50M     # 50MB 초과 시 로테이션
pm2 set pm2-logrotate:retain 7         # 최근 7개 파일만 보관
pm2 set pm2-logrotate:compress true    # gzip 압축
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
```

---

## 환경변수 관리

### .env 파일 연동

```bash
npm install dotenv
```

```js
// ecosystem.config.js
require('dotenv').config();  // .env 파일 로드

module.exports = {
  apps: [
    {
      name: 'my-app',
      script: 'server.js',
      env_production: {
        NODE_ENV: 'production',
        DATABASE_URL: process.env.DATABASE_URL,  // .env에서 가져옴
        SECRET_KEY: process.env.SECRET_KEY,
      },
    },
  ],
};
```

> **주의**: `ecosystem.config.js`를 깃에 커밋할 때 민감한 값이 하드코딩되지 않도록 주의한다. `.env`는 `.gitignore`에 추가.

---

## 모니터링

### pm2 monit

```bash
pm2 monit
```

터미널에서 CPU/메모리 사용률을 실시간으로 확인할 수 있다.

### pm2 plus (웹 대시보드)

```bash
pm2 plus
```

웹 브라우저에서 여러 서버의 PM2 상태를 통합 모니터링하는 유료 서비스. 팀 단위 운영 시 유용하다.

---

## CI/CD 파이프라인과 연동

### GitHub Actions + PM2

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/my-app
            git pull origin main
            npm ci --only=production
            npm run build
            pm2 reload ecosystem.config.js --env production
```

### Jenkins와 연동

```groovy
stage('Deploy') {
  steps {
    sshagent(['prod-ssh-key']) {
      sh '''
        ssh deploy@production "
          cd /var/www/my-app &&
          git pull origin main &&
          npm ci --only=production &&
          npm run build &&
          pm2 reload ecosystem.config.js --env production
        "
      '''
    }
  }
}
```

---

## 자주 쓰는 명령어 정리

```bash
# 상태 확인
pm2 list                          # 프로세스 목록
pm2 show my-app                   # 상세 정보
pm2 monit                         # 실시간 모니터링

# 제어
pm2 start ecosystem.config.js --env production
pm2 stop my-app
pm2 restart my-app                # 다운타임 있음
pm2 reload my-app                 # 무중단 (클러스터 모드)
pm2 delete my-app

# 로그
pm2 logs my-app --lines 100
pm2 flush my-app

# 유지
pm2 startup                       # 부팅 시 자동 시작 설정
pm2 save                          # 현재 프로세스 목록 저장
pm2 resurrect                     # 저장된 목록 복원
```

---

## 정리

PM2는 Node.js 서버를 프로덕션에서 운영할 때 사실상 표준 도구다. 핵심 세 가지만 기억하면 된다.

- **`ecosystem.config.js`**: 설정을 코드로 관리, 환경별 분리
- **클러스터 모드 + `reload`**: CPU 활용 극대화 + 무중단 배포
- **`pm2 startup && pm2 save`**: 서버 재부팅 후 자동 복구

Docker나 Kubernetes 환경에서는 PM2 대신 컨테이너 자체의 재시작 정책을 쓰는 게 일반적이지만, VM이나 베어메탈에서 Node.js를 직접 운영한다면 PM2가 가장 빠르고 가벼운 선택이다.
