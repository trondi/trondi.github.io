---
title: "Turborepo 모노레포 CI/CD 최적화 — GitLab CI 빌드를 Dockerfile 멀티스테이지로 옮기기"
date: "2026-05-02"
summary: "CI runner에서 빌드하던 구조를 Dockerfile 멀티스테이지(pruner → installer → runner)로 옮기면서 빌드 시간을 단축한 과정을 정리했다."
category: "DevOps · Infra"
tags:
  - Docker
  - Turborepo
  - GitLab CI
  - Monorepo
  - Next.js
featured: false
---

# Turborepo 모노레포 CI/CD 최적화 — GitLab CI 빌드를 Dockerfile 멀티스테이지로 옮기기

> 본 글의 코드 예시에서 프로젝트명, 환경변수명, 브랜치명 등은 일반화된 이름(`web-app`, `admin-app`, `<APP_NAME>` 등)으로 마스킹 처리되어 있다.

## 들어가며

Turborepo 기반 모노레포(예: `web-app`, `admin-app`)를 운영하면서 CI/CD 파이프라인 시간이 점점 길어지는 문제가 있었다. 기존에는 GitLab CI runner에서 직접 빌드를 수행하고 그 결과물을 Docker 이미지로 패키징하는 방식이었는데, 이를 **Dockerfile 멀티스테이지 빌드**로 전환하면서 빌드 시간을 크게 단축했다.

이 글에서는 두 방식을 diff로 비교하면서, 왜 Docker가 빌드를 담당하는 게 더 효율적이었는지 정리한다.

---

## 변경 전후 한눈에 보기

### 1. `.gitlab-ci.yml`

```diff
- stages: [build, docker, deploy, cleanup]
+ stages: [docker, deploy, cleanup]

- web-app:build:
-   before_script:
-     - curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
-     - export NVM_DIR="$HOME/.nvm"
-     - . "$NVM_DIR/nvm.sh"
-     - nvm install <NODE_VERSION>
-     - nvm use <NODE_VERSION>
-     - yarn install
-   stage: build
-   script:
-     - yarn workspace @packages/ui build
-     - yarn workspace @apps/web-app build
-   artifacts:
-     paths:
-       - apps/web-app/.next
-       - apps/web-app/public

  web-app:docker:
    stage: docker
-   needs:
-     - job: web-app:build
-       artifacts: true
    script:
      - DATE_TAG=$(date +%Y%m%d)
      - echo "$REGISTRY_PASSWORD" | docker login ...
-     - docker build -t $IMAGE_NAME:$DATE_TAG -f apps/web-app/dockerfile .
+     - >
+       docker build
+       --build-arg REGISTRY=$REGISTRY
+       --build-arg PROJECT=$PROJECT
+       --build-arg NEXT_PUBLIC_API_XXX=$NEXT_PUBLIC_API_XXX
+       ...
+       -t $IMAGE_NAME:$DATE_TAG
+       -t $IMAGE_NAME:latest
+       -f apps/web-app/dockerfile .
      - docker push $IMAGE_NAME:$DATE_TAG
      - docker push $IMAGE_NAME:latest
```

핵심 변화:

- `build` stage 통째로 제거
- nvm 설치 / node 설치 / `yarn install` / `yarn build` 모두 사라짐
- artifact 업로드/다운로드 사라짐
- `docker build`에 `--build-arg`로 환경변수 주입

### 2. `Dockerfile`

```diff
- FROM node:<NODE_VERSION>-alpine AS runner
- ENV NODE_ENV=production
- WORKDIR /app
-
- COPY package.json yarn.lock ./
- COPY apps/web-app apps/web-app
- COPY packages packages
-
- RUN yarn install --production --frozen-lockfile
-
- COPY apps/web-app/.next apps/web-app/.next
- COPY apps/web-app/public apps/web-app/public
-
- WORKDIR /app/apps/web-app
- CMD ["yarn", "start"]

+ ARG REGISTRY
+ ARG PROJECT
+ ARG NODE_VERSION=<NODE_VERSION>-alpine
+
+ # ───── Stage 1: pruner ─────
+ FROM ${REGISTRY}/${PROJECT}/node:${NODE_VERSION} AS pruner
+ WORKDIR /app
+ RUN npm install -g turbo
+ COPY . .
+ RUN turbo prune @apps/web-app --docker
+
+ # ───── Stage 2: installer ─────
+ FROM ${REGISTRY}/${PROJECT}/node:${NODE_VERSION} AS installer
+ WORKDIR /app
+ ARG NEXT_PUBLIC_API_XXX
+ ARG NEXT_PUBLIC_API_YYY
+ # ... (필요한 환경변수)
+ ENV NEXT_PUBLIC_API_XXX=$NEXT_PUBLIC_API_XXX ...
+
+ COPY --from=pruner /app/out/json/ .
+ COPY --from=pruner /app/out/yarn.lock ./yarn.lock
+ RUN yarn install --frozen-lockfile
+
+ COPY --from=pruner /app/out/full/ .
+ COPY --from=pruner /app/tsconfig.json ./tsconfig.json
+ RUN yarn turbo run build --filter=@apps/web-app
+
+ # ───── Stage 3: runner ─────
+ FROM ${REGISTRY}/${PROJECT}/node:${NODE_VERSION} AS runner
+ RUN addgroup --system --gid 1001 nodejs \
+     && adduser --system --uid 1001 nextjs
+ ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
+ WORKDIR /app
+
+ COPY --from=installer --chown=nextjs:nodejs /app/apps/web-app/.next/standalone ./
+ COPY --from=installer --chown=nextjs:nodejs /app/apps/web-app/.next/static ./apps/web-app/.next/static
+ COPY --from=installer --chown=nextjs:nodejs /app/apps/web-app/public ./apps/web-app/public
+
+ USER nextjs
+ WORKDIR /app/apps/web-app
+ EXPOSE 3000
+ CMD ["node", "server.js"]
```

> 사내 컨테이너 레지스트리 정보(URL, 포트, 프로젝트 이름)와 빌드 시점 환경변수(`--build-arg`로 전달되는 값)는 GitLab CI/CD Variables에 저장되며, 코드/문서에는 변수명만 노출시킨다.

---

## 이전 방식의 문제점

### 문제 1: CI runner가 매번 환경 셋업

```yaml
before_script:
  - curl ... nvm 설치
  - nvm install <NODE_VERSION>   # 매 pipeline마다 반복
  - yarn install                  # 매번 전체 설치
```

GitLab CI runner는 매 실행마다 새로운 환경에서 시작한다. nvm 설치 → node 설치 → yarn install이 반복되면서 **순수 대기시간만 수 분**이 쌓였다.

### 문제 2: artifact 업로드/다운로드 오버헤드

```yaml
build:
  artifacts:
    paths:
      - apps/web-app/.next   # 수백 MB
      - apps/web-app/public

docker:
  needs:
    - job: web-app:build
      artifacts: true        # 다시 다운로드
```

빌드 산출물(`.next`)을 GitLab 서버로 **업로드 → 다운로드** 왕복했다. 동일한 runner에서 실행되더라도 GitLab 서버를 경유하기 때문에 네트워크 비용이 발생한다.

### 문제 3: 단일 stage Dockerfile의 비효율

```dockerfile
COPY apps/web-app apps/web-app   # 전체 복사
COPY packages packages            # 전체 복사
RUN yarn install --production --frozen-lockfile   # 소스만 바뀌어도 무효화
```

`COPY`로 소스를 먼저 복사한 뒤 `yarn install`을 하기 때문에, **소스 한 줄만 바뀌어도 의존성 설치가 재실행**됐다. Docker 레이어 캐시가 사실상 무용지물이었다.

또한 최종 이미지에 **소스코드 + node_modules + 빌드 산출물**이 다 포함되어 이미지가 비대했다.

### 문제 4: 빌드 환경과 실행 환경이 분리되지 않음

CI에서 빌드한 후, Docker 이미지에서 또 `yarn install --production`을 수행했다. **두 번 일하는 구조**였고, CI runner와 Docker 이미지 간 node 버전이 미묘하게 달라질 수 있는 위험도 있었다.

---

## 새 방식의 동작 원리

### Stage 1: `pruner` — 필요한 것만 추출

```dockerfile
FROM node AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @apps/web-app --docker
```

Turborepo의 `prune` 명령은 **의존성 그래프 분석**을 통해 대상 앱 빌드에 진짜 필요한 파일만 골라낸다.

```
out/
├── json/        # package.json들 + yarn.lock (메타데이터)
└── full/        # 실제 소스코드
```

여기서 중요한 건 **메타데이터와 소스가 분리 출력**된다는 점이다. 다음 stage에서 이걸 활용해 캐시 전략을 짠다.

### Stage 2: `installer` — 의존성 설치 + 빌드

```dockerfile
COPY --from=pruner /app/out/json/ .         # ← 메타데이터만 먼저
COPY --from=pruner /app/out/yarn.lock .
RUN yarn install --frozen-lockfile          # ← 캐시 hit 가능 레이어

COPY --from=pruner /app/out/full/ .         # ← 소스는 나중에
RUN yarn turbo run build --filter=@apps/web-app
```

Docker는 각 명령을 레이어로 쌓고, **입력이 같으면 캐시를 재사용**한다. 이 구조 덕분에:

- `package.json` / `yarn.lock`이 변경되지 않으면 → `yarn install` 캐시 hit (수십 초~수 분 절약)
- 소스만 바뀌면 → `COPY out/full/` 레이어부터 재실행, 의존성은 그대로

### Stage 3: `runner` — 실행 환경만

```dockerfile
FROM node AS runner
RUN addgroup ... nodejs && adduser ... nextjs
COPY --from=installer .next/standalone ./
COPY --from=installer .next/static ...
COPY --from=installer public ...
USER nextjs
CMD ["node", "server.js"]
```

Next.js의 **standalone 모드**가 핵심이다. `server.js` + 최소 node_modules만 포함되어 있어, 빌드 도구나 devDependencies 없이도 실행 가능하다.

- 최종 이미지에서 yarn, turbo, 소스코드 전부 제외
- non-root user(`nextjs`)로 실행해 보안 강화

---

## 캐시 동작 시나리오

### 시나리오 A: 소스코드만 수정 (`src/page.tsx`)

```
[pruner]     COPY . .                  → 무효화
             turbo prune                → 재실행 (수 초)

[installer]  COPY out/json/             → 캐시 hit ✅
             COPY out/yarn.lock         → 캐시 hit ✅
             yarn install               → 캐시 hit ✅ (수 분 절약)
             COPY out/full/             → 무효화
             yarn turbo run build       → 재실행

[runner]     COPY .next/standalone      → 무효화
```

### 시나리오 B: `packages/ui/package.json` 변경

```
[installer]  COPY out/json/             → 무효화
             yarn install               → 재실행 (의존성 변경됐으니 정상)
```

**의존성이 진짜로 바뀐 경우에만** `yarn install`이 재실행된다. 이게 흔히 말하는 "Docker 레이어 캐시 잘 쓰기"의 실체다.

---

## 시간 단축 메커니즘 정리

| 시점 | 이전 방식 | 새 방식 |
|------|-----------|---------|
| **CI 환경 셋업** | nvm + node 설치 (수 분) | 바로 `docker build` |
| **의존성 설치** | CI에서 `yarn install` 매번 전체 | 변경 없으면 캐시 hit (0초) |
| **빌드** | CI runner에서 `yarn build` | Dockerfile installer 내부 |
| **artifact 전송** | 업로드 → 다운로드 | Docker stage 간 직접 전달 |
| **이미지 패키징** | `yarn install --production` 또 실행 | standalone 복사만 |
| **이미지 크기** | 소스 + node_modules 전체 포함 | standalone만 (대폭 감소) |

---

## Dockerfile에서 빌드하는 게 좋은 이유

### 1. 관심사 분리 (Separation of Concerns)

- `pruner` = "무엇을 빌드할지"
- `installer` = "어떻게 빌드할지"
- `runner` = "어떻게 실행할지"

각 단계가 독립적이라 디버깅과 수정이 쉽다.

### 2. 재현성 (Reproducibility)

로컬, CI, 운영이 모두 동일한 Dockerfile을 사용한다. "내 컴퓨터에선 되는데" 문제가 사라진다. node 버전도 `ARG NODE_VERSION`으로 고정된다.

### 3. 이미지 보안과 경량화

최종 이미지에 빌드 도구(yarn, turbo, devDependencies)가 없다. **공격 표면이 좁아지고** 레지스트리에서 pull/배포하는 속도도 빨라진다.

### 4. CI 도구 의존도 감소

GitLab artifact, GitLab cache, runner의 nvm 설정 등에 묶이지 않는다. GitHub Actions로 옮기더라도 Dockerfile만 그대로 쓰면 된다.

### 5. 모노레포에 최적화

`turbo prune`이 모노레포의 고질적인 문제(필요 없는 워크스페이스까지 빌드/복사)를 해결한다. 이전 방식은 `packages/` 전체를 복사했지만, 새 방식은 **의존성 그래프 기준으로 필요한 것만** 복사한다.

---

## 보안 관점 체크리스트

CI/CD 파이프라인을 작성/공유할 때 외부에 노출되어선 안 되는 항목들을 정리해두면 좋다.

- **레지스트리 정보**: `REGISTRY_USER`, `REGISTRY_PASSWORD`는 반드시 GitLab CI/CD Variables의 **Masked + Protected**로 설정
- **사내 인프라 주소**: 컨테이너 레지스트리 URL/포트, 백엔드/모니터링 서버 도메인은 변수로 관리하고 코드에는 변수명만 노출
- **`NEXT_PUBLIC_*` 환경변수**: 클라이언트 번들에 그대로 박히므로, 정말 공개되어도 되는 값만 사용. 내부 도메인이 들어가면 빌드 산출물에서 그대로 노출됨
- **`.env` 파일**: 이미지에 포함시키지 말고 빌드 시 `--build-arg`로 주입
- **non-root 사용자**: 컨테이너는 반드시 `USER` 지시문으로 일반 사용자 권한 실행
- **이미지 태그**: `latest`만 쓰지 말고 날짜/SHA 태그도 함께 push해 롤백 경로 확보

---

## 마치며

핵심은 단순하다.

> **"CI가 빌드하고 Docker는 패키징만"** → **"Docker가 빌드부터 실행까지 책임지고, CI는 트리거만"**

이전 방식은 Docker 레이어 캐시의 강점을 못 살렸고, CI runner 환경 셋업과 artifact 왕복에 시간을 낭비했다. 새 방식은 이 모든 비효율을 제거하면서 동시에 이미지도 가벼워졌다.

특히 **`pruner` stage가 변경 빈도가 다른 파일(메타데이터 vs 소스)을 분리해줘서** Docker가 의도한 대로 캐시를 쌓을 수 있게 만든 게 결정적이었다. 단일 stage였다면 `COPY . .` 한 번에 모든 캐시가 깨졌을 것이다.

모노레포 + Next.js + Docker 조합을 쓰고 있다면, **Turborepo prune + 멀티스테이지 빌드 + standalone 출력** 이 세 가지 조합을 강력히 추천한다.
