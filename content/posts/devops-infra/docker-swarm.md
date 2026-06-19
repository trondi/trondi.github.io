---
title: "Docker 시리즈 ⑨ Swarm — 여러 호스트로 확장하기, 그리고 Kubernetes로"
date: "2026-05-10"
summary: "Docker Swarm의 핵심 개념(Service, Task, Stack)을 정리하고, 왜 결국 Kubernetes로 넘어가게 되는지 실제 프로젝트 경험을 바탕으로 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Docker Swarm
  - Orchestration
  - DevOps
featured: false
series: "Docker 입문"
seriesOrder: 9
---

# Docker 시리즈 ⑨ Swarm — 여러 호스트로 확장하기, 그리고 Kubernetes로

> 시리즈 순서: Host → Image → Container → Network → Volume → Dockerfile → Compose → Security → **Swarm**

## 들어가며

Compose까지 배웠다면 **단일 호스트** 안에서 여러 컨테이너를 잘 굴릴 수 있다. 그런데 운영을 하다 보면 한계가 온다:

- 호스트 한 대에 트래픽이 몰리면 어떡하지?
- 서버 한 대가 죽으면 서비스 전체가 멈춘다
- 무중단 배포는 어떻게?

이런 문제를 해결하려면 **여러 호스트를 묶어서 컨테이너를 분산 배치**해야 한다. 이걸 **컨테이너 오케스트레이션(orchestration)**이라고 한다.

Docker가 자체적으로 제공하는 오케스트레이션 도구가 **Docker Swarm**이다. 이 글에선 Swarm의 핵심 개념을 빠르게 정리하고, **왜 결국 Kubernetes로 넘어가게 되는지**까지 다룬다.

---

## Compose의 한계 — 왜 Swarm이 필요한가

Compose는 **단일 호스트** 전용이다.

```
[서버 1대]
├── app 컨테이너
├── db 컨테이너
└── redis 컨테이너
```

이 한 대가 죽으면 끝이다. Swarm을 쓰면:

```
[서버 3대 클러스터]
서버 A ── app x2, db
서버 B ── app x2, redis
서버 C ── app x1
   └── 로드 밸런서가 알아서 분산
```

**핵심 변화:**
- 여러 호스트를 하나의 클러스터로 묶음
- 컨테이너를 **자동 분산 배치**
- 장애 시 다른 호스트로 자동 이전
- 롤링 업데이트 / 무중단 배포 지원

---

## Swarm의 핵심 개념

### 1. Node (노드)

클러스터에 참여하는 **머신 한 대**.

- **Manager Node**: 클러스터를 통제하는 두뇌. 어디에 컨테이너를 띄울지 결정.
- **Worker Node**: Manager의 명령을 받아 실제 컨테이너를 실행.

```
[Manager Node] ─── 결정 ───┐
       │                  │
       ▼                  ▼
[Worker Node 1]    [Worker Node 2]
  - container A       - container C
  - container B       - container D
```

운영에선 보통 **Manager 3대**(과반수 합의를 위해 홀수)를 둔다.

### 2. Service (서비스)

컴포즈의 `service`와 비슷하지만, **여러 호스트에 걸쳐 실행되는 컨테이너 묶음**이다.

```bash
docker service create --name web --replicas 3 -p 80:80 nginx
```

이 명령은:
- nginx 컨테이너를 **3개 띄움** (replica 3)
- 클러스터 전체에 분산 배치
- 80번 포트로 외부 노출

### 3. Task (태스크)

Service를 구성하는 **개별 컨테이너 인스턴스**다.

```
Service: web (replicas=3)
   ├── Task 1 → Worker A의 nginx 컨테이너
   ├── Task 2 → Worker B의 nginx 컨테이너
   └── Task 3 → Worker C의 nginx 컨테이너
```

> **개념 정리:**
> - **Service** = "이런 컨테이너를 N개 굴려라"라는 명세
> - **Task** = 실제로 굴러가는 컨테이너 한 개

Service가 청사진이고 Task가 실체다. K8s의 Deployment-Pod 관계와 거의 같다.

### 4. Stack (스택)

여러 Service를 묶은 **배포 단위**. Compose 파일을 그대로 활용한다.

```yaml
# docker-compose.yml (Stack용)
services:
  web:
    image: my-app
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
    ports:
      - "80:80"

  db:
    image: postgres:16
    deploy:
      replicas: 1
      placement:
        constraints: [node.role == manager]
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
```

```bash
docker stack deploy -c docker-compose.yml my-app
```

Compose와 거의 같은 문법이지만, **`deploy` 섹션이 추가**되어 replica 수, 배치 제약 등을 지정한다.

> **개념 정리:**
> - **Compose**: 단일 호스트, `docker compose up`
> - **Stack**: 여러 호스트(Swarm), `docker stack deploy`
> - 둘이 같은 YAML을 쓰지만 **`deploy` 섹션 처리가 다르다.**

---

## 빠른 실습 흐름

```bash
# 1. Swarm 모드 활성화 (Manager 노드)
docker swarm init

# 2. 다른 머신을 Worker로 추가
# (init 결과에 나온 토큰으로)
docker swarm join --token SWMTKN-... <manager-ip>:2377

# 3. 노드 확인
docker node ls

# 4. Service 생성
docker service create --name web --replicas 3 -p 80:80 nginx

# 5. Service 상태 확인
docker service ls
docker service ps web         # Task 상태

# 6. 스케일 조정
docker service scale web=5

# 7. 무중단 업데이트
docker service update --image nginx:1.26 web

# 8. Stack 배포
docker stack deploy -c docker-compose.yml my-app
docker stack services my-app
docker stack rm my-app
```

---

## Swarm의 강점

### 1. 진입 장벽이 낮다
Compose 사용자라면 거의 그대로 쓸 수 있다. **Compose YAML + `deploy` 섹션 + `docker stack deploy`** 한 줄이면 끝.

### 2. Docker 자체에 내장
별도 설치가 필요 없다. `docker swarm init` 한 줄로 시작.

### 3. 보안
Manager-Worker 통신이 자동으로 TLS 암호화된다.

### 4. 빌트인 로드 밸런싱
Service에 들어오는 요청을 Task들에 자동 분산.

---

## 그런데 왜 Kubernetes로 넘어가게 되는가?

Swarm은 작은 클러스터에선 충분하다. 하지만 일정 규모 이상으로 가면 한계가 온다.

### 1. 생태계 차이가 압도적

| | Swarm | Kubernetes |
|---|---|---|
| 모니터링 | 직접 설치 | Prometheus / Grafana 표준 |
| 로깅 | 직접 설계 | EFK / Loki 등 풍부 |
| 인그레스 / TLS | 수동 설정 | Ingress Controller 다양 |
| Helm 같은 패키지 매니저 | 없음 | Helm 표준 |
| CI/CD 통합 | 제한적 | ArgoCD, Flux 등 풍부 |
| 클라우드 매니지드 | 거의 없음 | EKS, GKE, AKS 모두 지원 |

### 2. 표현력 차이

Swarm은 단순해서 좋지만, 동시에 **세밀한 제어가 어렵다.**

- ConfigMap, Secret 같은 정교한 설정 관리
- Pod의 init container, sidecar 패턴
- HPA(자동 수평 확장), VPA, PDB 등 운영 기능
- 복잡한 네트워크 정책 (NetworkPolicy)

이런 것들이 K8s엔 **표준으로 있고**, Swarm엔 없거나 조잡하다.

### 3. 사실상의 표준이 됨

신규 인력이 K8s를 알지 Swarm을 모른다. 도구, 문서, 트러블슈팅 자료 모두 K8s 쪽이 압도적이다.

### 4. Docker사의 방향성 변화

Docker사가 2017년에 K8s 통합을 발표한 이후, **Swarm은 사실상 유지보수 모드**가 됐다. 신규 기능이 거의 없다.

---

## 그럼 Swarm은 언제 쓰는가?

쓸 자리가 아예 없는 건 아니다.

✅ **쓰면 좋은 경우:**
- 작은 팀 / 작은 클러스터 (노드 5~10대 이하)
- K8s 학습/운영 비용이 부담스러운 경우
- 이미 Compose에 익숙한 팀의 점진적 확장
- 사내 도구 / 단순한 백오피스 등 부담 없는 워크로드

❌ **K8s로 가야 하는 경우:**
- 클라우드 매니지드 서비스(EKS/GKE/AKS) 활용
- 복잡한 마이크로서비스
- 본격적인 운영 (모니터링, 로깅, 보안 정책 등)
- 팀 규모가 커지고 있는 경우

---

## 실제 프로젝트 경험

본 시리즈가 다루는 프로젝트도 **단일 호스트(Compose) → Swarm → Kubernetes** 순서로 진화했다.

```
Phase 1. Compose      → 빠르게 시작, 단일 서버
Phase 2. Swarm        → 무중단 배포 + 다중 호스트
Phase 3. Kubernetes   → 모니터링/로깅/Ingress 표준화
```

각 단계의 결정 이유:

- **Compose → Swarm**: 서버 한 대에 모든 트래픽이 몰리는 게 부담, 무중단 배포 필요
- **Swarm → K8s**: Prometheus/Grafana 표준 통합, Ingress + TLS 관리, 사내 표준 정렬

이 흐름은 **많은 회사가 비슷하게 거친다.** 처음부터 K8s로 가는 건 부담이지만, 일정 규모 이상이 되면 거의 K8s로 수렴한다.

---

## 정리

**Swarm 핵심 개념:**
- **Node**: 클러스터의 머신 (Manager / Worker)
- **Service**: 여러 호스트에 걸친 컨테이너 묶음 명세
- **Task**: Service를 구성하는 실제 컨테이너 한 개
- **Stack**: 여러 Service를 묶은 배포 단위 (Compose 호환)

**핵심 명령:**
```bash
docker swarm init
docker service create / update / scale
docker stack deploy -c docker-compose.yml <name>
```

**현실적 결론:**
- Swarm은 **Compose에서 K8s로 가는 다리** 역할로 좋다
- 작은 규모에선 여전히 유효한 선택지
- 하지만 본격 운영은 거의 K8s가 표준

---

## 다음 단계 — Kubernetes 시리즈로

Docker 9편을 통해 컨테이너 자체와 단일 호스트 → 멀티 호스트까지 다뤘다. 이제부터는 **Kubernetes**가 어떻게 같은 문제를 더 정교하게 푸는지 살펴볼 차례다.

K8s 시리즈에선 다음 개념들이 Swarm과 어떻게 매핑되는지 함께 비교해보면 이해가 빠르다:

| Swarm | Kubernetes |
|-------|-----------|
| Service | Deployment + Service |
| Task | Pod |
| Stack | (Helm Chart에 가까움) |
| Manager / Worker | Control Plane / Node |
| `docker stack deploy` | `kubectl apply -f` |

> **이전 글**: Docker 시리즈 ⑧ Security
> **다음 시리즈**: [Kubernetes 개념 정리](./kubernetes-concepts)
