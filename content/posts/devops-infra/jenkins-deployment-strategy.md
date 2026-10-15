---
title: "Jenkins 시리즈 ⑤ 배포 전략 — Recreate부터 Canary까지"
date: "2026-10-16"
summary: "버전 태그와 롤백을 전제로 Recreate·Rolling·Blue-Green·Canary를 Jenkins + docker compose 환경에서 구현하는 방법, SSH 배포와 Agent 배포의 차이, 그리고 모든 전략에 걸리는 DB 마이그레이션 문제를 정리했다."
category: "DevOps · Infra"
tags:
  - Jenkins
  - Deploy
  - Blue-Green
  - Rolling Update
  - CI/CD
featured: false
series: "Jenkins 실전"
seriesOrder: 5
---

# Jenkins 시리즈 ⑤ 배포 전략 — Recreate부터 Canary까지

> 시리즈 순서: 개념 → 설치와 Docker 빌드 → GitLab 연동 → Controller와 Agent → **배포 전략**

## 들어가며

이미지를 빌드해서 Registry에 올리는 데까지는 왔다. 남은 건 마지막 한 걸음, **서버에서 돌고 있는 구버전을 새 버전으로 바꾸는 일**이다.

`docker compose up -d` 한 줄로도 바뀐다. 문제는 바뀌는 그 몇 초 동안 무슨 일이 일어나는지, 새 버전에 버그가 있으면 어떻게 되돌리는지다. 이걸 정하는 게 배포 전략이다.

---

## 배포 전략이 정하는 것

```
빌드                       저장                         배포  ← 배포 전략은 여기
docker build ──push──▶ Registry (myapp:812-abc1234) ──pull──▶ 서버들에서 v1을 v2로 교체
```

배포 전략은 **"구버전을 언제, 얼마나, 어떤 순서로 새 버전으로 바꾸느냐"**의 문제다. 판단 기준은 셋이다.

| 기준 | 질문 |
|---|---|
| 다운타임 | 교체하는 동안 서비스가 멈추나? |
| 위험 범위 | 새 버전에 버그가 있으면 사용자 몇 %가 영향을 받나? |
| 롤백 속도 | 문제가 생기면 얼마나 빨리 되돌리나? |

---

## 전제: 버전 태그와 롤백

어떤 전략을 쓰든 **`latest` 태그로는 롤백이 어렵다.** 직전 버전이 무엇이었는지 이미지 이름으로 알 수 없기 때문이다.

```groovy
environment {
  TAG = "${env.BUILD_NUMBER}-${env.GIT_COMMIT.take(7)}"   // 예: 812-abc1234
}
```

서버의 compose 파일은 태그를 변수로 받는다.

```yaml
# /srv/myapp/docker-compose.yml
services:
  app:
    image: harbor.example.com/team/myapp:${TAG}
    restart: unless-stopped
    ports:
      - "${PORT:-3000}:3000"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 5s
      retries: 6
```

배포와 롤백은 같은 명령이다. 태그만 다르다.

```bash
TAG=812-abc1234 docker compose up -d   # 배포
TAG=811-9f8e7d6 docker compose up -d   # 롤백 = 이전 태그로 다시 up
```

마지막으로 성공한 태그를 서버 파일(`/srv/myapp/.last-good`)에 적어 두면, 배포 후 헬스체크가 실패했을 때 파이프라인이 자동으로 되돌릴 수 있다.

---

## 1. Recreate — 내리고 올리기

```
v1 v1 v1  →  (전부 중지)  →  v2 v2 v2
               ↑ 다운타임
```

- **방식**: 기존 컨테이너를 내리고 새 버전을 올린다.
- **장점**: 가장 단순하다. 구버전과 신버전이 동시에 떠 있는 순간이 없어서 DB 호환 걱정이 없다.
- **단점**: 몇 초~수십 초 서비스가 멈춘다.
- **언제**: 사내 도구, 야간 배포, 서버 1대짜리 서비스

서버 1대에서 `docker compose up -d`로 배포하고 있다면 **이미 Recreate를 쓰고 있는 것**이다. 컨테이너가 교체되는 순간 짧게 끊긴다.

Recreate라도 헬스체크와 자동 롤백은 붙일 수 있다.

```groovy
stage('Deploy') {
  steps {
    sh '''
      cd /srv/myapp
      PREV=$(cat .last-good 2>/dev/null || true)
      TAG=$TAG docker compose up -d
      if ./wait-healthy.sh; then
        echo "$TAG" > .last-good
      else
        echo "헬스체크 실패 → $PREV 로 롤백"
        [ -n "$PREV" ] && TAG=$PREV docker compose up -d
        exit 1
      fi
    '''
  }
}
```

```bash
#!/bin/sh
# /srv/myapp/wait-healthy.sh [포트] — 60초 안에 /health가 200이면 성공
PORT=${1:-3000}
for i in $(seq 1 30); do
  curl -fs http://localhost:$PORT/health > /dev/null && exit 0
  sleep 2
done
exit 1
```

---

## 2. Rolling — 한 대씩 교체

```
[v1 v1 v1] → [v2 v1 v1] → [v2 v2 v1] → [v2 v2 v2]
```

- **방식**: 서버를 한 대씩(또는 N대씩) 교체한다. 교체 중인 서버는 로드밸런서에서 빼고, 나머지가 트래픽을 받는다.
- **장점**: 다운타임이 없고 서버를 추가로 둘 필요가 없다.
- **단점**: 배포 중에는 **v1과 v2가 동시에 응답한다.** API와 DB 스키마가 양쪽과 호환되어야 한다. 롤백도 다시 한 대씩이라 느리다.
- **언제**: 서버 2대 이상 + 앞단에 로드밸런서(nginx 등)가 있을 때. 가장 일반적이다.

핵심은 **헬스체크를 통과해야 다음 서버로 넘어가게** 짜는 것이다. 실패하면 거기서 멈추고, 아직 안 바뀐 서버들은 v1으로 서비스를 계속한다.

```groovy
stage('Rolling Deploy') {
  steps {
    script {
      for (s in ['server1', 'server2', 'server3']) {
        node(s) {                                    // 각 서버의 Agent에서 실행 (④편)
          sh "TAG=${TAG} /srv/myapp/deploy.sh"       // 내부에서 LB 제외 → up → 헬스체크 → LB 복귀
        }
      }
    }
  }
}
```

로드밸런서에서 서버를 뺐다 넣는 방법은 LB마다 다르다. nginx라면 upstream 설정에서 해당 서버를 `down`으로 표시하고 reload하거나, 헬스체크가 실패하는 동안 nginx가 알아서 빼도록 `max_fails`를 설정한다.

---

## 3. Blue-Green — 두 벌 두고 스위치 한 번

```
              nginx
            ┌───┴───┐
  Blue (v1) ●       ○ Green (v2)    1. Green에 v2 배포, 내부에서 확인
  Blue (v1) ○       ● Green (v2)    2. nginx 전환 → 모든 트래픽이 v2로
                                    3. 문제가 생기면 다시 Blue로 = 즉시 롤백
```

- **방식**: 똑같은 환경을 두 벌 두고, 대기 중인 쪽에 새 버전을 올린 뒤 트래픽을 한 번에 넘긴다.
- **장점**: 전환과 롤백이 순간적이다. 실제 운영 환경에서 미리 확인할 수 있다.
- **단점**: 자원이 두 배 필요하다. DB는 보통 하나를 같이 쓰므로 스키마 호환 문제는 여전하다.
- **언제**: 안정성이 중요하고 롤백이 빨라야 할 때

서버가 1대여도 가능하다. 같은 compose 파일을 프로젝트 이름(`-p`)만 달리해 두 벌(포트 3001, 3002) 띄우고 nginx upstream만 바꾸면 된다. compose 파일의 포트를 `${PORT:-3000}`으로 받아 둔 이유가 이것이다.

```nginx
# /etc/nginx/upstreams/blue.conf
upstream myapp { server 127.0.0.1:3001; }

# /etc/nginx/upstreams/green.conf
upstream myapp { server 127.0.0.1:3002; }

# nginx.conf 에서는 active.conf 만 include
include /etc/nginx/upstreams/active.conf;
```

```groovy
stage('Blue-Green') {
  steps {
    sh '''
      cd /srv/myapp
      ACTIVE=$(cat active 2>/dev/null || echo blue)
      NEXT=$( [ "$ACTIVE" = blue ] && echo green || echo blue )
      PORT=$( [ "$NEXT" = blue ] && echo 3001 || echo 3002 )

      TAG=$TAG PORT=$PORT docker compose -p myapp-$NEXT up -d
      ./wait-healthy.sh $PORT

      ln -sf /etc/nginx/upstreams/$NEXT.conf /etc/nginx/upstreams/active.conf
      nginx -t && nginx -s reload
      echo $NEXT > active
    '''
  }
}
```

롤백은 `active.conf`를 이전 색으로 바꾸고 reload하면 끝이다. 이전 색 컨테이너는 다음 배포 전까지 그대로 둔다.

---

## 4. Canary — 일부에게만 먼저

```
nginx ─┬─ 95% → v1 v1 v1
       └─  5% → v2            지표 확인 → 25% → 50% → 100%
```

- **방식**: 새 버전에 트래픽을 조금만 보내고, 지표가 괜찮으면 비율을 올린다.
- **장점**: 버그가 있어도 영향 범위가 작다. 실제 트래픽으로 검증된다.
- **단점**: **트래픽 비율 조절과 모니터링 지표가 필수다.** 에러율·지연 시간을 v1과 v2로 나눠 볼 수 없으면 의미가 없다.
- **언제**: 사용자가 많고 모니터링 체계가 갖춰졌을 때

nginx만으로 흉내를 내려면 `weight`로 비율을 나눈다.

```nginx
upstream myapp {
  server 10.0.0.11:3000 weight=19;   # v1
  server 10.0.0.12:3000 weight=1;    # v2 (약 5%)
}
```

Jenkins에서는 단계마다 `input`으로 사람이 지표를 보고 승인하게 만들 수 있다.

```groovy
stage('Canary 5%')  { steps { sh './set-weight.sh 5' } }
stage('Promote?')   { steps { input message: '에러율·지연 시간 확인 후 25%로 올릴까요?' } }
stage('Canary 25%') { steps { sh './set-weight.sh 25' } }
```

다만 이 방식은 금방 번거로워진다. Canary를 제대로 하려는 시점이면 보통 Kubernetes와 Argo Rollouts, Flagger 같은 도구가 지표를 보고 자동으로 비율을 조절하게 한다.

---

## 슬라이드에 자주 같이 나오는 두 가지: Immutable과 Parallel

배포 전략 목록에 Immutable과 Parallel이 함께 나오는 경우가 많은데, 앞의 네 가지와 **같은 축이 아니다.**

**Immutable**은 교체 방식이 아니라 **원칙**이다. "운영 중인 서버나 컨테이너를 고치지 말고, 새로 만들어 바꾼다." SSH로 들어가 `git pull`로 코드를 고치는 방식의 반대다. 버전 태그가 붙은 이미지로 컨테이너를 매번 새로 띄우고 있다면 이미 Immutable이다. Kubernetes 전용 개념도 아니고, Rolling이나 Blue-Green과 **함께** 쓰는 개념이다.

**Parallel**은 모든 서버에 동시에 배포하는 것이다. 다운타임과 위험 측면에서는 사실상 "여러 서버에서 동시에 하는 Recreate"다. Jenkins `parallel` 블록으로 쉽게 구현되지만 버그가 있으면 전체가 동시에 영향을 받는다.

---

## Recreate와 Rolling은 Kubernetes 개념인가?

아니다. 둘 다 Kubernetes보다 먼저 있던 일반적인 배포 개념이다. 다만 Kubernetes Deployment가 이 두 이름을 **설정값으로 그대로 가져다 썼기** 때문에 Kubernetes 용어처럼 느껴진다.

```yaml
kind: Deployment
spec:
  strategy:
    type: RollingUpdate      # 또는 Recreate — 이 둘만 있다
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
```

Blue-Green과 Canary는 이 `type`에 없다. Kubernetes에서도 Service 셀렉터를 직접 바꾸거나 Argo Rollouts 같은 도구를 써야 한다.

차이는 **누가 구현하느냐**다.

| 전략 | Kubernetes 없이 (Jenkins + compose) | Kubernetes |
|---|---|---|
| Recreate | `docker compose up -d` | `type: Recreate` |
| Rolling | Jenkinsfile 루프 + 헬스체크 + LB 조작 | `type: RollingUpdate` (기본값) |
| Blue-Green | 컨테이너 두 벌 + nginx 전환 | Service 셀렉터 전환, Argo Rollouts |
| Canary | nginx `weight` + `input` 승인 | Argo Rollouts, Flagger |

Kubernetes 없이는 순서·헬스체크·LB 조작을 Jenkinsfile에 **사람이 직접 짠다.** Kubernetes에서는 선언만 하면 컨트롤러가 Pod를 하나씩 바꾸고 readinessProbe를 통과해야 다음으로 넘어간다. Jenkins는 `kubectl set image` 한 줄만 실행하면 된다. Deployment가 이를 어떻게 처리하는지는 [Kubernetes Deployment](/posts/k8s-deployment) 글에 정리해 두었다.

---

## 배포 명령은 어디서 실행하나 — SSH vs Agent

여러 서버에 배포할 때 Jenkins가 명령을 실행하는 방법은 두 가지다.

### SSH 방식

```groovy
stage('Deploy') {
  steps {
    sshagent(['deploy-ssh']) {
      script {
        for (s in ['deploy@10.0.0.11', 'deploy@10.0.0.12']) {
          sh "ssh -o StrictHostKeyChecking=accept-new ${s} 'cd /srv/myapp && TAG=${TAG} docker compose up -d'"
        }
      }
    }
  }
}
```

Controller(또는 build Agent)가 각 서버에 SSH로 들어가 명령을 실행한다. Agent 설치 없이 바로 쓸 수 있다.

### Agent 방식

```groovy
stage('Deploy') {
  parallel {
    stage('server1') {
      agent { label 'server1' }
      steps { sh 'cd /srv/myapp && TAG=$TAG docker compose up -d' }
    }
    stage('server2') {
      agent { label 'server2' }
      steps { sh 'cd /srv/myapp && TAG=$TAG docker compose up -d' }
    }
  }
}
```

각 서버에 Agent를 두고, 그 서버에서 직접 명령을 실행한다. 위 예시는 Parallel이다. Rolling으로 바꾸려면 `parallel`을 빼고 순서대로 둔다.

| 항목 | SSH | Agent |
|---|---|---|
| 명령 실행 위치 | Controller/build Agent에서 원격 | 각 서버에서 직접 |
| 서버 준비 | SSH 계정과 키 | Java + Agent 연결 |
| 서버 추가 | 목록에 주소 추가 | Node 등록 + label |
| 병렬 실행 | 직접 구현 | `parallel`로 기본 지원 |
| 로그·실패 처리 | SSH 출력에 의존 | stage별로 Jenkins UI에 표시 |
| 설정 난이도 | 쉬움 | 조금 복잡 |

서버가 두세 대라면 SSH로 충분하다. 서버가 늘고 배포 단계가 복잡해지면 Agent가 관리하기 쉽다.

어느 쪽이든 **Jenkinsfile을 고칠 수 있는 사람은 운영 서버에서 명령을 실행할 수 있게 된다**는 점은 같다. 배포 Job에는 브랜치 제한과 함께 운영 배포 직전에 `input` 승인 단계를 두는 게 일반적이다.

---

## 모든 전략에 걸리는 문제: DB 마이그레이션

Rolling, Blue-Green, Canary는 모두 **v1과 v2가 같은 DB를 동시에 쓰는 순간**이 있다. v2에서 컬럼 이름을 `name` → `full_name`으로 바꾸면, 아직 떠 있는 v1은 `name`을 찾다가 깨진다.

그래서 스키마 변경은 두 번에 나눠 배포한다. **expand/contract** 패턴이다.

```
배포 1 (expand)    full_name 컬럼 추가, v2는 두 컬럼에 모두 쓰고 full_name을 읽는다
                   → v1, v2 모두 정상 동작
배포 2 (contract)  v1이 모두 사라진 뒤 name 컬럼 삭제
```

Recreate는 v1과 v2가 겹치지 않으니 이 문제가 없다. 하지만 **롤백**까지 생각하면 같은 문제가 돌아온다. v2가 컬럼을 지운 뒤 v1으로 되돌리면 v1이 깨진다. 결국 어떤 전략이든 "한 배포에서 스키마를 깨지 않는다"가 원칙이다.

---

## 한눈에 비교

| 전략 | 다운타임 | 추가 자원 | 롤백 | 버그 영향 범위 | 필요한 것 |
|---|---|---|---|---|---|
| Recreate | 있음 | 없음 | 이전 태그로 재배포 | 전체 | 없음 |
| Rolling | 없음 | 없음 | 다시 한 대씩 | 점점 확대 | LB + 헬스체크 |
| Blue-Green | 없음 | 2배 | 스위치 (즉시) | 전체 (전환 후) | LB 전환 |
| Canary | 없음 | 약간 | 비율 0% (즉시) | 일부 | 가중치 라우팅 + 모니터링 |

---

## 어디서 시작할까

1. **지금 바로**: `latest`를 버리고 버전 태그를 쓴다. 배포 후 헬스체크, 실패하면 이전 태그로 자동 롤백. 전략은 Recreate 그대로여도 된다.
2. **다운타임이 문제가 되면**: 서버 1대라면 nginx Blue-Green, 2대 이상이라면 Rolling
3. **Kubernetes로 가면**: Rolling은 Deployment 기본 동작이다. Canary는 Argo Rollouts 같은 도구로

---

## 시리즈를 마치며

다섯 편에 걸쳐 Jenkins를 하나 띄우고, GitLab과 연결하고, 빌드를 분리하고, 배포까지 이었다.

1. **개념**: Jenkins는 저장소와 독립된 오케스트레이터다. GitLab의 Job과 Jenkins의 Job은 크기가 다르다.
2. **설치와 Docker 빌드**: Docker Socket Mount는 호스트 데몬을 원격 조종하는 것이고, push 권한 = 서버 root다.
3. **GitLab 연동**: 토큰은 방향으로 구분한다. `CI_JOB_TOKEN`은 GitLab만의 일회용 출입증이다.
4. **Controller와 Agent**: Groovy는 Controller, `sh`는 Agent. 분리했다면 Built-in Executor는 0.
5. **배포 전략**: 버전 태그가 모든 전략의 전제다. 그다음은 다운타임·위험·롤백 사이의 선택이다.

Jenkins의 장점은 이 모든 걸 직접 고를 수 있다는 것이고, 단점도 이 모든 걸 직접 골라야 한다는 것이다.

> **이전 글**: Jenkins 시리즈 ④ Controller와 Agent
