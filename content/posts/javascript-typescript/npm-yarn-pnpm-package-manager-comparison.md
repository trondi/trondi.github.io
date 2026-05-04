---
title: "npm vs Yarn vs pnpm — 설치 구조와 선택 기준"
date: "2026-05-02"
summary: "npm, Yarn, pnpm을 node_modules, Plug'n'Play, content-addressable store, lockfile, workspace, CI 기준으로 비교하고 어떤 상황에서 무엇을 선택할지 정리했다."
category: "JavaScript / TypeScript"
tags:
  - npm
  - Yarn
  - pnpm
  - Package Manager
  - Node.js
featured: false
---

# npm vs Yarn vs pnpm — 설치 구조와 선택 기준

JavaScript 패키지 매니저를 비교할 때 `npm`, `Yarn`, `pnpm`을 단순히 “설치 명령어가 다른 도구” 정도로 보면 핵심을 놓치기 쉽다. 세 도구는 모두 `package.json`을 읽고 npm registry에서 패키지를 받아오지만, 설치 결과를 디스크에 배치하는 방식이 다르다.

설치 구조가 다르면 속도, 디스크 사용량, 모노레포 운영, ghost dependency 검출, CI 캐시 전략이 모두 달라진다.

이 글은 세 패키지 매니저를 설치 구조 중심으로 비교한다. npm과 Yarn만 비교한 내용은 [npm vs Yarn — 패키지 매니저 선택 기준 정리](/posts/npm-vs-yarn)에 따로 정리했다.

---

## 먼저 결론

특별한 요구가 없다면 npm은 여전히 가장 무난한 기본값이다. Node.js와 함께 설치되고, 대부분의 도구가 전제하는 `node_modules` 구조를 그대로 사용한다.

모노레포와 디스크 효율, 빠른 설치, 엄격한 의존성 구조가 중요하다면 pnpm이 강한 선택지다. npm과 비슷하게 `node_modules`를 제공하지만 내부는 content-addressable store와 link 구조로 동작한다.

Yarn은 선택지가 가장 넓다. Yarn Classic은 전통적인 `node_modules` 기반이고, Modern Yarn은 PnP, plugins, constraints, zero-install 같은 기능을 제공한다. 강력하지만 팀이 설정과 호환성 비용을 이해해야 한다.

| 상황 | 추천 |
|---|---|
| 단일 앱, 단순한 팀 운영 | npm |
| Node.js 기본 도구만 쓰고 싶음 | npm |
| 모노레포와 빠른 설치가 중요 | pnpm |
| 디스크 사용량을 줄이고 싶음 | pnpm |
| `node_modules` 없는 엄격한 설치를 원함 | Yarn PnP |
| 기존 Yarn 기반 레포 | Yarn 유지 |
| zero-install 전략을 진지하게 검토 | Yarn PnP |

---

## 세 도구의 핵심 차이

한 줄로 정리하면 다음과 같다.

| 도구 | 기본 설치 구조 | 핵심 특징 |
|---|---|---|
| npm | 평평하게 hoisting된 `node_modules` | Node 기본, 호환성 좋음 |
| Yarn Classic | `node_modules` | npm 대안으로 시작, 기존 레거시 프로젝트에 많음 |
| Yarn Modern | PnP 기본, `node_modules` 선택 가능 | 엄격한 의존성, zero-install, 플러그인 |
| pnpm | content-addressable store + symlinked `node_modules` | 빠른 설치, 디스크 효율, 모노레포 친화적 |

여기서 중요한 비교 축은 “패키지 매니저 이름”보다 “의존성을 어디에 저장하고 Node.js가 어떻게 찾게 만드는가”다.

---

## npm: 가장 익숙한 node_modules 모델

npm은 Node.js의 기본 패키지 매니저다.

```bash
npm install
npm install react
npm run build
```

설치하면 프로젝트 내부에 `node_modules`가 만들어진다.

```text
project
├─ package.json
├─ package-lock.json
└─ node_modules
   ├─ react
   ├─ next
   └─ ...
```

장점은 호환성이다. 대부분의 도구, 라이브러리, 문서, CI 예제가 npm과 `node_modules`를 전제로 잘 동작한다.

단점은 `node_modules`가 크고 파일 수가 많다는 점이다. 또한 hoisting 구조 때문에 직접 선언하지 않은 패키지가 우연히 import되는 ghost dependency 문제가 생길 수 있다.

```js
// package.json에 lodash가 없는데도 우연히 동작할 수 있다.
import debounce from "lodash/debounce";
```

이 코드는 현재는 동작할 수 있지만 안전하지 않다. 다른 패키지의 하위 의존성으로 lodash가 설치되어 있을 뿐이라면, 의존성 트리가 바뀌는 순간 깨질 수 있다.

---

## Yarn: 패키지 매니저와 설치 모드를 구분해야 한다

Yarn을 볼 때는 두 가지를 분리해야 한다.

| 구분 | 설명 |
|---|---|
| Yarn Classic | Yarn 1.x. 전통적인 `node_modules` 기반 |
| Yarn Modern | Yarn 2+ 계열. PnP, plugins, constraints, zero-install 제공 |

Yarn Modern의 기본 설치 방식은 PnP다. 하지만 Yarn 자체가 곧 PnP라는 뜻은 아니다. Yarn은 패키지 매니저이고, PnP는 Yarn이 의존성을 설치하고 해석하는 방식 중 하나다.

```text
Yarn
├─ PnP 방식
└─ node_modules 방식
```

설정으로 `node_modules` 방식도 쓸 수 있다.

```yaml
# .yarnrc.yml
nodeLinker: node-modules
```

따라서 “Yarn을 쓴다”와 “PnP를 쓴다”는 별개의 결정이다.

---

## Yarn PnP: node_modules를 없애는 방식

PnP는 `node_modules` 폴더를 만들지 않는다. 대신 `.pnp.cjs`라는 로더 파일에 의존성 트리 정보를 기록한다.

```text
project
├─ package.json
├─ yarn.lock
├─ .pnp.cjs
└─ .yarn/cache
```

동작 방식은 대략 이렇다.

```text
import React from "react";

Yarn PnP loader
  → 현재 파일이 어느 패키지에 속하는지 확인
  → 그 패키지의 package.json에 react가 선언되어 있는지 확인
  → 선언되어 있으면 cache 안의 실제 패키지 위치로 연결
  → 선언되어 있지 않으면 에러
```

장점은 명확하다.

- `node_modules` 파일 복사가 줄어 설치 결과가 작아진다.
- 직접 선언하지 않은 의존성 접근을 막는다.
- 잘못된 의존성 선언을 빨리 발견한다.
- zero-install 전략과 잘 맞는다.

비용도 있다.

- 일부 도구는 PnP 환경에서 추가 설정이 필요하다.
- IDE가 import 경로를 제대로 인식하도록 SDK 설정이 필요할 수 있다.
- 기존 프로젝트는 ghost dependency가 드러나면서 마이그레이션 작업이 생길 수 있다.

Yarn 공식 문서도 PnP가 ghost dependency 보호와 semantic error를 제공하지만, IDE 통합이나 `packageExtensions` 설정이 필요할 수 있다고 설명한다. 참고: [Yarn Plug'n'Play](https://yarnpkg.com/features/pnp), [Yarn install modes](https://yarnpkg.com/features/linkers)

---

## pnpm: node_modules는 있지만 내부 구조가 다르다

pnpm은 npm처럼 프로젝트에 `node_modules`를 만든다. 그래서 겉으로 보면 npm과 비슷하다.

```text
project
├─ package.json
├─ pnpm-lock.yaml
└─ node_modules
```

하지만 내부 구조는 다르다. pnpm은 패키지를 프로젝트마다 복사하지 않고, 전역 content-addressable store에 저장한 뒤 프로젝트의 `node_modules`에는 hard link와 symbolic link로 연결한다.

```text
global pnpm store
└─ react files

project/node_modules
└─ .pnpm
   └─ react@18.2.0
      └─ node_modules
         └─ react -> store의 react 파일들
```

pnpm 공식 문서는 `node_modules` 안의 각 패키지 파일이 content-addressable store에 대한 hard link이며, 그 위에 symbolic link로 중첩 의존성 구조를 만든다고 설명한다. 참고: [pnpm symlinked node_modules structure](https://pnpm.io/symlinked-node-modules-structure)

이 구조의 장점은 두 가지다.

- 같은 패키지를 여러 프로젝트에서 써도 디스크에 중복 저장하지 않는다.
- `node_modules` 호환성을 어느 정도 유지하면서도 더 엄격한 의존성 구조를 만든다.

예를 들어 100개 프로젝트가 같은 버전의 `lodash`를 사용한다고 해도 npm은 프로젝트별로 복사본을 만들 수 있다. pnpm은 store에 한 번 저장하고 각 프로젝트에서 링크로 참조한다.

---

## 설치 구조 비교

세 도구의 설치 결과를 단순화하면 다음과 같다.

```text
npm
project/node_modules/react
project/node_modules/next
project/node_modules/...

Yarn PnP
project/.pnp.cjs
project/.yarn/cache/react-...zip
project/.yarn/cache/next-...zip

pnpm
global store/react
project/node_modules/.pnpm/react@version/node_modules/react -> store
project/node_modules/react -> .pnpm 내부 패키지
```

비교표로 보면 더 명확하다.

| 항목 | npm | Yarn PnP | pnpm |
|---|---|---|---|
| `node_modules` 생성 | 생성 | 기본적으로 생성 안 함 | 생성 |
| 패키지 저장 | 프로젝트별 설치 | cache + PnP loader | 전역 store + link |
| 호환성 | 가장 좋음 | 일부 도구 설정 필요 | 대체로 좋음 |
| ghost dependency 방지 | 약함 | 강함 | npm보다 강함 |
| 디스크 효율 | 낮음 | 높음 | 높음 |
| 모노레포 | 지원 | 강하게 지원 | 강하게 지원 |
| 학습 비용 | 낮음 | 높음 | 중간 |

---

## lockfile 비교

각 패키지 매니저는 서로 다른 lockfile을 사용한다.

| 도구 | lockfile |
|---|---|
| npm | `package-lock.json` |
| Yarn | `yarn.lock` |
| pnpm | `pnpm-lock.yaml` |

lockfile은 실제 설치된 의존성 트리를 고정한다. 이 파일은 반드시 커밋해야 한다.

반대로 한 프로젝트에 여러 lockfile이 동시에 있으면 위험하다.

```text
package-lock.json
yarn.lock
pnpm-lock.yaml
```

이 상태는 “이 프로젝트의 기준 패키지 매니저가 무엇인가”를 흐리게 만든다. 팀원이 각자 다른 패키지 매니저로 설치하면 lockfile이 계속 흔들리고, 로컬과 CI의 의존성 트리가 달라질 수 있다.

규칙은 하나다.

- npm을 쓰면 `package-lock.json`만 유지한다.
- Yarn을 쓰면 `yarn.lock`만 유지한다.
- pnpm을 쓰면 `pnpm-lock.yaml`만 유지한다.

---

## CI 설치 명령어 비교

CI에서는 lockfile을 수정하지 않는 설치가 중요하다.

| 도구 | CI 명령어 |
|---|---|
| npm | `npm ci` |
| Yarn | `yarn install --immutable` |
| pnpm | `pnpm install --frozen-lockfile` |

npm의 `npm ci`는 `package-lock.json`이 있어야 동작하고, `package.json`과 lockfile이 맞지 않으면 실패한다. 참고: [npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci/)

Yarn의 `--immutable`은 설치 중 lockfile 변경이 필요하면 실패한다. 참고: [Yarn install](https://yarnpkg.com/cli/install)

pnpm의 `--frozen-lockfile`은 `pnpm-lock.yaml`을 업데이트하지 않고, lockfile이 manifest와 맞지 않으면 실패한다. pnpm 문서에 따르면 CI 환경에서는 lockfile이 있을 때 이 동작이 기본값이다. 참고: [pnpm install](https://pnpm.io/cli/install)

---

## Workspaces 비교

세 도구 모두 workspaces를 지원한다.

```text
repo
├─ apps
│  └─ web
└─ packages
   └─ ui
```

npm과 Yarn은 보통 루트 `package.json`에서 선언한다.

```json
{
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

pnpm은 별도의 `pnpm-workspace.yaml`을 사용한다.

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

pnpm 공식 문서는 `pnpm-workspace.yaml`이 workspace root를 정의하고 포함/제외할 디렉토리를 지정한다고 설명한다. 참고: [pnpm-workspace.yaml](https://pnpm.io/pnpm-workspace_yaml)

모노레포 관점에서는 npm도 기본 기능은 충분하다. 하지만 큰 모노레포에서는 pnpm과 Yarn이 더 자주 선택된다. 이유는 workspace 스크립트 실행, 필터링, 의존성 격리, 설치 성능, 캐시 전략에서 더 많은 기능을 제공하기 때문이다.

---

## ghost dependency 관점

ghost dependency는 직접 선언하지 않은 패키지를 우연히 사용할 수 있는 문제다.

```json
{
  "dependencies": {
    "some-library": "^1.0.0"
  }
}
```

`some-library`가 내부적으로 `lodash`를 사용한다고 하자. npm의 hoisting 결과로 `lodash`가 루트 `node_modules`에 올라오면, 내 코드에서 직접 `lodash`를 import해도 동작할 수 있다.

```js
import debounce from "lodash/debounce";
```

하지만 내 `package.json`에는 `lodash`가 없다. 이 코드는 우연히 동작하는 코드다.

| 도구 | ghost dependency 방지 |
|---|---|
| npm | 약함. hoisting 결과에 따라 우연히 동작 가능 |
| Yarn PnP | 강함. 선언되지 않은 의존성 접근 차단 |
| pnpm | npm보다 강함. symlink 구조로 접근 가능 범위를 제한 |

이 관점에서는 Yarn PnP가 가장 엄격하다. pnpm도 npm의 flat hoisting보다 안전한 구조를 제공한다. npm은 호환성과 단순성은 좋지만 의존성 선언 오류를 늦게 발견할 수 있다.

---

## Docker와 배포 환경

Dockerfile에서도 패키지 매니저별로 복사해야 하는 파일과 설치 명령이 다르다.

### npm

```dockerfile
COPY package.json package-lock.json ./
RUN npm ci
```

### Yarn

```dockerfile
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable
RUN yarn install --immutable
```

Yarn PnP나 zero-install을 쓰면 `.yarn/cache`, `.pnp.cjs`를 어떻게 다룰지도 정해야 한다.

### pnpm

```dockerfile
COPY package.json pnpm-lock.yaml ./
RUN corepack enable
RUN pnpm install --frozen-lockfile
```

모노레포에서는 빌드 컨텍스트와 workspace 파일 복사가 더 중요해진다. 예를 들어 pnpm workspace라면 `pnpm-workspace.yaml`도 함께 복사해야 한다.

```dockerfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
```

---

## 어떤 것을 선택할까

### npm을 선택하기 좋은 경우

- 단일 앱이다.
- 온보딩을 가장 단순하게 유지하고 싶다.
- 도구 호환성이 가장 중요하다.
- 별도 패키지 매니저 설정을 최소화하고 싶다.
- CI에서 `npm ci`로 충분하다.

npm은 “기본값”으로 강하다. 특별한 요구가 없다면 npm을 선택해도 충분하다.

### Yarn을 선택하기 좋은 경우

- 이미 Yarn 기반 레포다.
- Yarn Berry의 PnP나 zero-install을 쓰고 싶다.
- constraints, plugin, workspace 기능을 활용하고 싶다.
- 의존성 선언 누락을 강하게 잡고 싶다.
- 팀이 PnP 호환성 비용을 감당할 수 있다.

Yarn은 강력하지만 운영 모델을 이해해야 한다. 특히 “Yarn을 쓴다”와 “PnP를 쓴다”는 별도 결정으로 다루는 것이 좋다.

### pnpm을 선택하기 좋은 경우

- 모노레포를 운영한다.
- 설치 속도와 디스크 효율이 중요하다.
- `node_modules` 호환성은 유지하고 싶다.
- npm보다 엄격한 의존성 구조를 원한다.
- CI 캐시와 workspace 필터링을 적극적으로 활용하고 싶다.

pnpm은 최근 프론트엔드 모노레포에서 많이 쓰이는 현실적인 선택지다. PnP만큼 급진적으로 `node_modules`를 없애지는 않지만, npm보다 효율적이고 엄격한 구조를 제공한다.

---

## 마이그레이션 체크리스트

패키지 매니저를 바꿀 때는 명령어만 바꾸면 안 된다.

- 기존 lockfile을 제거한다.
- 새 패키지 매니저로 lockfile을 다시 만든다.
- CI 설치 명령어를 바꾼다.
- Dockerfile 설치 명령어를 바꾼다.
- README 온보딩 명령어를 바꾼다.
- GitHub Actions cache key를 바꾼다.
- `packageManager` 필드를 추가한다.
- monorepo라면 workspace 설정 파일을 확인한다.
- Yarn PnP라면 IDE와 테스트 도구 호환성을 확인한다.
- pnpm이라면 `pnpm-workspace.yaml`과 store 캐시 전략을 확인한다.

예시:

```json
{
  "packageManager": "pnpm@10.0.0"
}
```

Corepack을 쓰면 팀원이 같은 패키지 매니저 버전을 사용하도록 맞추기 쉽다. 참고: [Node.js Corepack](https://nodejs.org/download/release/v22.10.0/docs/api/corepack.html)

---

## 정리

npm, Yarn, pnpm은 같은 문제를 풀지만 설치 구조가 다르다.

- npm은 가장 단순하고 호환성이 좋다.
- Yarn PnP는 `node_modules`를 없애고 의존성을 엄격하게 검증한다.
- pnpm은 `node_modules` 호환성을 유지하면서 content-addressable store와 link 구조로 빠르고 효율적인 설치를 제공한다.

선택은 취향보다 운영 비용의 문제다. 단일 앱은 npm으로 충분한 경우가 많고, 모노레포는 pnpm이 좋은 기본값이 될 수 있다. Yarn PnP는 강력하지만 팀이 호환성 비용과 설정 방식을 이해할 때 선택하는 것이 안전하다.

가장 중요한 원칙은 하나다. 한 레포에서는 하나의 패키지 매니저와 하나의 lockfile만 유지해야 한다.

---

## 참고 문서

- [npm package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json)
- [npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci/)
- [Yarn Plug'n'Play](https://yarnpkg.com/features/pnp)
- [Yarn install modes](https://yarnpkg.com/features/linkers)
- [Yarn install](https://yarnpkg.com/cli/install)
- [pnpm symlinked node_modules structure](https://pnpm.io/symlinked-node-modules-structure)
- [pnpm install](https://pnpm.io/cli/install)
- [pnpm-workspace.yaml](https://pnpm.io/pnpm-workspace_yaml)
- [Node.js Corepack](https://nodejs.org/download/release/v22.10.0/docs/api/corepack.html)
