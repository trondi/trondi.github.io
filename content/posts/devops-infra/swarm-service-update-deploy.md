---
title: "Swarm에서 새 이미지로 서비스 재배포하기"
date: "2026-07-02"
summary: "push 한 번으로 배포가 끝나지 않는 이유를 파헤친다. GitLab CI가 이미지를 Harbor에 올리는 자동 단계와, docker service update --force로 Swarm replica를 롤링 교체하는 수동 단계가 왜 분리돼 있는지, :latest 태그의 함정과 함께 실제 클러스터 출력으로 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Docker Swarm
  - CI/CD
  - Deployment
  - DevOps
featured: false
---

# Swarm에서 새 이미지로 서비스 재배포하기

> 앞선 두 글의 실전 후속편이다.
> [Turborepo CI/CD 최적화](./turborepo-docker-multistage-cicd)가 **이미지를 만들어 Harbor에 올리는 데까지**,
> [Docker Swarm 개념 정리](./docker-swarm)가 **Service·Task·Stack이 무엇인지**를 다뤘다.
> 이 글은 그 사이의 빈칸 — **"올라간 이미지가 실제 서비스로 반영되는 순간"** 을 채운다.

## 들어가며

어느 날 이런 배포 절차를 물려받았다.

1. `pandora/master`에 push하면 GitLab Runner가 알아서 배포 서버에 뜬다.
2. 그런데 그것만으로는 운영 서버에 반영이 **안 된다.** 이 명령을 **손으로 한 번 더** 쳐야 한다:

```bash
docker service update --image=<harbor>/pandora/pandora-front:latest --force padion-system_pandora-front
```

처음엔 이게 이해가 안 됐다. **push하면 CI가 다 해주는 거 아니었나? 왜 명령을 또 쳐야 하지?** 그리고 "쿠버네티스 replica로 띄운다"고 전해 들었는데, 정작 명령어는 `docker service`다. 이 둘의 정체부터 하나씩 풀어보자.

---

## 먼저: 이건 쿠버네티스가 아니라 Docker Swarm이다

가장 흔한 오해부터 짚는다. `docker service update ...`는 **Docker Swarm** 명령이다. 쿠버네티스라면 `kubectl`을 썼을 것이다.

서비스 이름 `padion-system_pandora-front`의 구조도 단서다. Swarm은 Stack으로 배포하면 서비스 이름을 **`<stack 이름>_<service 이름>`** 으로 짓는다. 즉 이건 `padion-system`이라는 Stack 안의 `pandora-front` 서비스다.

개념(여러 노드에 replica로 복제)은 K8s와 비슷하지만 명령어·설정 방식이 다르다. Swarm의 Service ↔ K8s의 Deployment 관계는 [Swarm 개념 글](./docker-swarm)에서 정리했다.

---

## 배포는 두 트랙으로 나뉘어 있다

핵심은 **"push 한 번으로 끝나지 않는다"** 는 것이다. 자동 트랙과 수동 트랙이 분리돼 있다.

```diagram
swarm-deploy-flow
```

### 트랙 1 — 자동 (push 시 GitLab CI)

`.gitlab-ci.yml`은 `pandora/master` push에만 반응해 세 스테이지를 돈다.

```yaml
stages:
  - docker    # 이미지 빌드 & Harbor push
  - deploy    # 컨테이너 실행
  - cleanup   # runner 로컬 이미지 정리
```

- **docker**: 멀티스테이지 Dockerfile로 빌드해 Harbor에 `:latest`(+ 날짜 태그)로 push
- **deploy**: 배포 서버 자체에 `docker run`으로 단독 컨테이너 하나 실행 (프리뷰/확인용)
- **cleanup**: 쌓인 구버전 이미지 정리

빌드 과정 자체는 [Turborepo CI/CD 글](./turborepo-docker-multistage-cicd)에서 상세히 다뤘다. 여기서 중요한 건 **이 시점까지 운영 서비스는 아직 하나도 안 바뀌었다**는 점이다. CI가 한 일은 결국 **"Harbor의 `:latest`를 새 이미지로 갱신"** 한 것뿐이다.

### 트랙 2 — 수동 (`docker service update --force`)

그래서 운영 반영은 **사람이 명령 한 줄로 트리거**한다.

```bash
docker service update --image=<harbor>/pandora/pandora-front:latest --force padion-system_pandora-front
```

이 한 줄이 Swarm의 운영 서비스를 새 이미지로 롤링 교체한다. 그런데 여기서 `--force`가 왜 필요할까?

---

## `:latest`의 함정 — `--force`가 필요한 이유

Swarm은 서비스의 이미지 참조가 **바뀌었을 때만** 재배포한다. 그런데 우리는 태그를 항상 `:latest`로 고정해서 쓴다.

```
CI가 새 이미지를 push해도
  → Harbor의 다이제스트(내용)는 바뀌지만
  → 태그 문자열은 여전히 "pandora-front:latest"
  → Swarm 입장에선 "이미지 참조가 그대로네" → 아무것도 안 함
```

즉 `docker service update --image=...:latest`만 치면, Swarm은 "이미 latest인데?" 하고 무시할 수 있다. 그래서 **`--force`로 "내용이 같아 보여도 무조건 재배포하라"** 고 강제하는 것이다. `--force`가 붙으면 각 노드가 Harbor에서 latest를 **다시 pull**하고 컨테이너를 새로 띄운다.

> **개념 정리:**
> - `:latest`는 **움직이는 포인터**다. 같은 태그가 계속 다른 이미지를 가리킨다.
> - Swarm은 **태그 문자열**로 변화를 판단하지 다이제스트를 매번 확인하지 않는다.
> - 그래서 `:latest` 운영에는 `--force`가 사실상 필수다.
>
> **더 깔끔한 대안**: 태그를 `:latest` 대신 커밋 SHA나 날짜(`:260702.1`)로 주면, 태그가 매번 바뀌므로 `--force` 없이도 Swarm이 변화를 감지한다. `--force`는 `:latest` 관행을 유지할 때의 우회책이다.

---

## Service 하나에 컨테이너는 몇 개? — replica의 실체

"replica로 띄운다"는 말 때문에 **서비스가 2개 떠 있다**고 오해하기 쉽다. 실제로는 **서비스 1개 + replica(컨테이너) 2개**다.

```
Service: padion-system_pandora-front   (replicas = 2)   ← 설계도 1개
   ├── Task 1 → work02 노드의 컨테이너
   └── Task 2 → work03 노드의 컨테이너
```

- **Service** = "이 이미지를 2벌 띄워라"라는 명세 (실제 프로세스가 아님)
- **Task** = replica 1개 단위. Task 하나당 컨테이너 하나
- **Container** = Task가 노드에 실제로 띄운 프로세스

`docker service ls`로 보면 서비스는 **한 줄**, `REPLICAS` 칸이 `2/2`로 나온다.

```
NAME                          MODE         REPLICAS               IMAGE
padion-system_pandora-front   replicated   2/2 (max 1 per node)   .../pandora-front:latest
```

`2/2 (max 1 per node)`는 "replica 2개를 서로 다른 노드에 하나씩"이라는 뜻이다. Service·Task 개념은 [Swarm 글](./docker-swarm)에서 더 다뤘다.

---

## 롤링 업데이트가 두 노드를 갱신하는 방식

명령은 **manager 노드 한 곳에서만** 친다. 그 뒤는 Swarm이 알아서 한다.

1. **선언 갱신**: manager가 서비스의 "원하는 상태(desired state)"를 "이제 latest로 다시 띄워라"로 바꾼다.
2. **롤링 교체**: 스케줄러가 Task를 **하나씩** 교체한다. 기본값(`--update-parallelism 1`) 기준으로 보면, work02의 옛 컨테이너를 멈추고 제거한 뒤 work02가 Harbor에서 latest를 **pull**해 새 컨테이너를 시작하고, 그게 뜨면 work03도 동일하게 교체된다.
3. 각 노드의 **dockerd(에이전트)** 가 자기 몫을 실행한다. 그래서 명령은 한 번인데 두 노드가 다 갱신된다.

한 번에 하나씩 교체하므로 한쪽이 잠깐 내려가도 다른 쪽이 트래픽을 받아 **무중단에 가깝게** 배포된다.

---

## 실전: `docker service ps` 출력 읽는 법

배포가 어떻게 진행됐는지는 `docker service ps`에 다 남는다.

```bash
docker service ps padion-system_pandora-front
```

```
ID       NAME                             NODE     DESIRED   CURRENT STATE
wdphu…   padion-system_pandora-front.1    work02   Running   Running 11 days ago
qxu7t…    \_ pandora-front.1              work02   Shutdown  Shutdown 11 days ago
zx4s6…    \_ pandora-front.1              work02   Shutdown  Shutdown 11 days ago
x6pdm…   padion-system_pandora-front.2    work03   Running   Running 11 days ago
r6pqv…    \_ pandora-front.2              work03   Shutdown  Failed 11 days ago  "No such container…"
```

읽는 법:

- `.1`, `.2`는 **replica 번호**. 지금은 각각 work02, work03에서 Running.
- `\_`로 들여쓴 줄들은 **과거 Task 이력**이다. `--force`나 이미지 갱신 때마다 새 Task를 만들고 옛 Task를 Shutdown시키는데, 그 흔적이 쌓인 것이다. `\_`가 여러 개면 그만큼 여러 번 재배포했다는 뜻.
- `.2`의 `Failed "No such container"`는 교체 중 옛 컨테이너가 이미 사라진 상태에서 난 정리 흔적이다. 지금 최상단이 정상 Running이면 문제없다.

즉 이 출력 하나로 **"어느 노드에, 몇 번째 replica가, 몇 번 교체되며 떠 있는지"** 가 다 보인다. 롤링 업데이트가 Task 단위로 하나씩 갈아끼운다는 그 동작의 증거다.

특정 노드에 실제로 뭐가 도는지 보려면 `docker service ls`(클러스터 전체)가 아니라 노드 기준으로 봐야 한다.

```bash
docker node ps <노드명>    # 그 노드에서 실제 실행 중인 Task만
```

> **함정**: `docker service ls`는 manager에서 치면 **클러스터 전체**의 서비스를 보여준다. "이 노드에 뭐가 떠 있나"를 보여주는 게 아니다.

---

## 정리

**배포가 두 단계인 이유:**
- CI(자동)는 **이미지를 Harbor에 올리는 데까지만** 한다.
- 운영 반영(`docker service update --force`)은 **사람이 트리거**한다.

**`--force`가 필요한 이유:**
- 태그를 `:latest`로 고정해서, 내용이 바뀌어도 태그 문자열이 그대로라 Swarm이 변화를 감지 못 한다.
- `--force`로 강제 재배포 → 각 노드가 latest 재pull + 롤링 재시작.

**replica의 실체:**
- 서비스 2개가 아니라 **서비스 1개 + Task(컨테이너) 2개**.
- manager 한 곳에서 명령 → 스케줄러가 각 노드에 하나씩 롤링 교체.

**출력 읽기:**
- `docker service ps`의 `\_` 줄 = 과거 배포 이력.
- `docker service ls`는 전체, 노드별은 `docker node ps`.

배포가 "push 한 번"으로 안 끝나는 건 불편이 아니라 **의도된 분리**다. 빌드/레지스트리 갱신(자동)과 운영 반영(수동)을 떼어 두면, 언제 운영에 나갈지를 사람이 통제할 수 있다. 다만 `:latest` + `--force` 조합은 편하지만 "지금 뜬 게 정확히 어떤 커밋인가"를 흐리게 만든다. 다음 개선은 **불변 태그(커밋 SHA)로 전환**이다.

---

## 관련 글

- [Turborepo CI/CD 최적화](./turborepo-docker-multistage-cicd) — 이 글의 트랙 1(빌드 → Harbor push)을 상세히
- [Docker Swarm 개념 정리](./docker-swarm) — Service · Task · Stack · Node의 기초
