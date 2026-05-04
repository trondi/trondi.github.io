---
title: "npm vs Yarn — 패키지 매니저 선택 기준 정리"
date: "2026-05-02"
summary: "npm과 Yarn의 차이를 설치 방식, lockfile, CI, workspaces, Plug'n'Play, Corepack 관점에서 비교하고 프로젝트 상황별 선택 기준을 정리했다."
category: "JavaScript / TypeScript"
tags:
  - npm
  - Yarn
  - Package Manager
  - Node.js
  - Dependencies
featured: false
---

# npm vs Yarn — 패키지 매니저 선택 기준 정리

Node.js 프로젝트를 만들면 거의 항상 패키지 매니저를 선택해야 한다. 가장 익숙한 선택지는 `npm`이고, 오랫동안 많이 쓰인 대안은 `Yarn`이다. 둘 다 `package.json`을 읽고, npm registry에서 패키지를 받아오고, lockfile을 만들어 같은 의존성 트리를 재현한다.

하지만 실제 팀 프로젝트에서는 단순히 “둘 다 설치 도구”라고 넘기기 어렵다. lockfile 정책, CI 설치 방식, 모노레포 지원, `node_modules` 사용 여부, Corepack을 통한 버전 고정 방식이 다르기 때문이다.

이 글은 `npm`과 `Yarn`을 실무 선택 기준 중심으로 비교한다. `pnpm`까지 포함한 전체 비교는 별도 글 [npm vs Yarn vs pnpm — 설치 구조와 선택 기준](/posts/npm-yarn-pnpm-package-manager-comparison)에서 다룬다.

---

## 먼저 결론

일반적인 Next.js, React, Node.js 단일 앱이라면 `npm`만으로 충분하다. Node.js와 함께 기본 제공되고, 별도 도구 설치가 필요 없으며, `npm ci`를 쓰면 CI에서도 재현 가능한 설치가 가능하다.

반면 모노레포를 적극적으로 운영하거나, 더 엄격한 의존성 검증, Plug'n'Play, zero-install 같은 워크플로우가 필요하다면 Yarn이 선택지가 된다. 특히 Yarn Berry 이후의 Yarn은 단순한 설치 도구라기보다 프로젝트 관리 도구에 가깝다.

| 상황 | 추천 |
|---|---|
| 작은 개인 프로젝트 | npm |
| 일반적인 단일 프론트엔드 앱 | npm |
| 팀원이 모두 Node.js 기본 환경으로 빠르게 시작해야 함 | npm |
| Yarn 기반 레거시 프로젝트 유지보수 | Yarn 유지 |
| 모노레포 기능을 강하게 활용 | Yarn 또는 pnpm 검토 |
| `node_modules` 없는 설치 전략을 쓰고 싶음 | Yarn PnP |
| 의존성 선언 누락을 엄격하게 잡고 싶음 | Yarn PnP |

중요한 기준은 “어느 쪽이 절대적으로 더 좋은가”가 아니라, **프로젝트가 원하는 설치 모델과 팀의 운영 비용이 무엇인가**다.

---

## npm은 무엇인가

`npm`은 Node.js 생태계의 기본 패키지 매니저다. Node.js를 설치하면 일반적으로 함께 설치된다.

```bash
npm install
npm install react
npm run build
```

npm의 기본 설치 모델은 `node_modules`다. 패키지를 다운로드하고, 의존성 트리를 계산한 뒤, 프로젝트 안의 `node_modules` 폴더에 파일을 배치한다.

```text
project
├─ package.json
├─ package-lock.json
└─ node_modules
   ├─ react
   ├─ next
   └─ ...
```

이 방식은 매우 익숙하고 대부분의 도구가 잘 지원한다. Webpack, Vite, Next.js, Jest, ESLint, TypeScript 같은 도구들은 기본적으로 `node_modules` 기반 프로젝트에서 잘 동작한다.

---

## Yarn은 무엇인가

Yarn은 npm의 느린 설치 속도와 재현성 문제를 해결하기 위해 등장한 패키지 매니저다. 현재는 크게 두 계열을 구분해서 봐야 한다.

| 구분 | 의미 |
|---|---|
| Yarn Classic | Yarn 1.x. 전통적인 `node_modules` 기반 |
| Yarn Berry / Modern Yarn | Yarn 2+ 계열. PnP, plugins, constraints, zero-install 등 제공 |

현대 Yarn 문서는 Yarn 4+를 기준으로 설명한다. 이 계열의 Yarn은 기본 설치 전략으로 `Plug'n'Play(PnP)`를 사용한다. PnP는 전통적인 `node_modules` 폴더를 만들지 않고, `.pnp.cjs` 같은 로더 파일을 만들어 패키지 위치를 해석한다.

```text
project
├─ package.json
├─ yarn.lock
├─ .pnp.cjs
└─ .yarn/cache
```

Yarn 공식 문서에 따르면 PnP는 `node_modules` 대신 단일 Node.js loader 파일에 의존성 트리 정보를 담고, 이 정보를 통해 `require`와 `import`를 해석한다. 참고: [Yarn Plug'n'Play](https://yarnpkg.com/features/pnp)

중요한 점은 `Yarn`과 `Yarn PnP`가 같은 층위의 개념이 아니라는 것이다.

| 개념 | 의미 |
|---|---|
| Yarn | 패키지 매니저 |
| Yarn PnP | Yarn의 설치 방식 중 하나 |
| Yarn node-modules linker | Yarn이 npm처럼 `node_modules`를 만드는 설치 방식 |

즉 “Yarn과 PnP가 다르게 동작한다”기보다는, Yarn 안에 여러 설치 모드가 있고 그중 하나가 PnP다. Modern Yarn은 PnP를 기본값으로 쓰지만, 설정을 바꾸면 전통적인 `node_modules` 방식도 사용할 수 있다.

```yaml
# .yarnrc.yml
nodeLinker: node-modules
```

이 설정을 쓰면 패키지 매니저는 Yarn이지만 설치 결과는 npm처럼 `node_modules` 중심으로 만들어진다.

---

## 둘 다 package.json을 읽는다

npm과 Yarn 모두 시작점은 `package.json`이다.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  },
  "dependencies": {
    "next": "14.0.1",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

`dependencies`는 런타임에 필요한 패키지, `devDependencies`는 개발과 빌드에 필요한 패키지다. 여기까지는 npm과 Yarn이 거의 같다.

차이는 그 다음이다. 의존성 버전을 어떻게 잠그는지, 설치 결과를 어떤 방식으로 디스크에 배치하는지, CI에서 어떤 명령어를 쓰는지가 달라진다.

---

## lockfile 비교

패키지 매니저를 섞어 쓰면 가장 먼저 충돌하는 파일이 lockfile이다.

| 패키지 매니저 | lockfile |
|---|---|
| npm | `package-lock.json` |
| Yarn | `yarn.lock` |

lockfile은 실제로 설치된 의존성 트리를 기록한다. `package.json`에는 `^18.2.0`처럼 범위가 적혀 있을 수 있지만, lockfile에는 실제로 어떤 버전이 설치되었는지 기록된다.

```json
{
  "dependencies": {
    "react": "^18.2.0"
  }
}
```

`^18.2.0`은 18.x 범위 안에서 더 높은 버전이 설치될 여지가 있다. lockfile이 없으면 팀원마다 설치 시점에 따라 다른 버전을 받을 수 있다. lockfile은 이 문제를 줄인다.

npm 공식 문서는 `package-lock.json`이 동일한 의존성 트리를 재현하고, 팀원과 CI가 같은 의존성을 설치하도록 보장하기 위한 파일이라고 설명한다. 참고: [npm package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json)

실무 규칙은 단순하다.

- npm을 쓰면 `package-lock.json`을 커밋한다.
- Yarn을 쓰면 `yarn.lock`을 커밋한다.
- 한 프로젝트에서 `package-lock.json`과 `yarn.lock`을 동시에 유지하지 않는다.

둘 다 있으면 “누가 어떤 패키지 매니저로 설치했는지”가 흐려진다. 의존성 변경 PR에서 lockfile이 둘 다 바뀌기 시작하면 재현성이 깨지기 쉽다.

---

## 설치 명령어 비교

기본 명령어는 비슷하지만 CI에서 쓰는 명령어가 다르다.

| 작업 | npm | Yarn |
|---|---|---|
| 의존성 설치 | `npm install` | `yarn install` |
| 패키지 추가 | `npm install react` | `yarn add react` |
| dev dependency 추가 | `npm install -D typescript` | `yarn add -D typescript` |
| 패키지 제거 | `npm uninstall react` | `yarn remove react` |
| 스크립트 실행 | `npm run build` | `yarn build` 또는 `yarn run build` |
| CI 설치 | `npm ci` | `yarn install --immutable` |

npm에서 CI는 보통 `npm ci`를 쓴다.

```bash
npm ci
```

`npm ci`는 lockfile이 없으면 실패하고, `package.json`과 lockfile이 맞지 않으면 lockfile을 수정하지 않고 실패한다. 또한 기존 `node_modules`를 제거한 뒤 깨끗하게 설치한다. 참고: [npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci/)

Yarn에서는 보통 다음처럼 lockfile 변경을 금지한다.

```bash
yarn install --immutable
```

Yarn 공식 문서의 `yarn install` 설명에 따르면 `--immutable` 계열 옵션은 설치 과정에서 lockfile이나 캐시가 바뀌어야 하는 상황을 실패로 처리할 때 사용한다. 참고: [Yarn install](https://yarnpkg.com/cli/install)

---

## node_modules 방식 vs Plug'n'Play 방식

npm은 기본적으로 `node_modules`를 만든다. Yarn Classic도 마찬가지다. 반면 Modern Yarn은 기본적으로 PnP를 사용한다.

### node_modules 방식

```text
import React from "react";

Node.js / 번들러
  → 현재 파일 위치에서 node_modules 탐색
  → 상위 디렉토리 node_modules 탐색
  → react 패키지 찾기
```

장점은 호환성이다. 거의 모든 도구가 이 구조를 전제로 잘 동작한다.

단점도 있다. `node_modules`는 파일 수가 많고 크기가 크다. 또한 hoisting 때문에 직접 선언하지 않은 패키지가 우연히 import되는 경우가 생길 수 있다.

```js
// package.json에 lodash를 직접 선언하지 않았는데도
// 다른 패키지의 하위 의존성으로 설치되어 import가 되는 경우
import debounce from "lodash/debounce";
```

이런 의존성을 흔히 ghost dependency라고 부른다. 지금은 동작해도, 다른 패키지를 업데이트하면서 하위 의존성 구조가 바뀌면 갑자기 깨질 수 있다.

### Yarn PnP 방식

PnP는 `node_modules` 폴더를 만들지 않고, 의존성 트리 정보를 담은 로더 파일을 사용한다.

```text
import React from "react";

Yarn PnP loader
  → 이 파일이 속한 패키지를 확인
  → package.json에 react가 선언되어 있는지 확인
  → 허용된 의존성이면 실제 캐시 위치로 연결
```

장점은 의존성 선언이 엄격해진다는 점이다. 직접 선언하지 않은 패키지를 import하면 에러가 난다. 문제를 빨리 드러내는 대신, 기존 프로젝트를 마이그레이션할 때는 마찰이 생길 수 있다.

Yarn 공식 문서도 PnP가 ghost dependency를 막는 장점이 있지만, 일부 도구나 IDE는 추가 설정이 필요할 수 있다고 설명한다. 참고: [Yarn install modes](https://yarnpkg.com/features/linkers)

PnP를 선택할 때의 핵심 판단은 호환성과 엄격함의 교환이다.

| 선택 | 장점 | 비용 |
|---|---|---|
| Yarn + PnP | 빠른 설치, 작은 설치 결과, ghost dependency 차단 | 일부 도구/IDE 설정 필요 |
| Yarn + node_modules | npm과 비슷한 호환성 | PnP의 엄격한 검증과 zero-install 장점 일부 감소 |

기존 프로젝트를 Yarn Berry로 올린다고 해서 반드시 PnP까지 같이 도입해야 하는 것은 아니다. 먼저 Yarn Berry를 쓰되 `nodeLinker: node-modules`로 안정적으로 전환하고, 이후 PnP 도입 여부를 별도로 판단하는 방식도 가능하다.

---

## 속도 비교는 단순하지 않다

예전에는 Yarn이 npm보다 빠르다는 인식이 강했다. 하지만 지금은 단순히 “Yarn이 빠르다” 또는 “npm이 느리다”라고 말하기 어렵다.

속도는 다음 요소에 크게 좌우된다.

- lockfile 유무
- 캐시가 이미 있는지
- CI 캐시 전략
- 의존성 개수
- native dependency 빌드 여부
- `node_modules`를 쓰는지 PnP를 쓰는지
- 모노레포인지 단일 앱인지

일반적인 단일 앱에서는 npm과 Yarn의 체감 차이가 크지 않을 수 있다. 반대로 큰 모노레포에서는 Yarn의 workspace, focus install, PnP, zero-install 같은 기능이 운영 방식 자체를 바꿀 수 있다.

성능 비교를 하려면 팀 프로젝트에서 실제로 측정해야 한다.

```bash
rm -rf node_modules
time npm ci

rm -rf node_modules .pnp.cjs
time yarn install --immutable
```

다만 이렇게 단순 비교할 때도 캐시 상태와 설치 전략이 같지 않으면 결과 해석이 어렵다.

---

## Workspaces 비교

Workspaces는 하나의 레포 안에서 여러 패키지를 관리하는 기능이다.

```text
repo
├─ package.json
├─ apps
│  └─ web
└─ packages
   └─ ui
```

루트 `package.json`에서 workspace를 선언한다.

```json
{
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ]
}
```

npm도 workspaces를 지원한다. npm 공식 문서는 workspaces가 하나의 top-level root package 안에서 여러 로컬 패키지를 관리하고, `npm install` 시 로컬 패키지를 자동 symlink한다고 설명한다. 참고: [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces)

Yarn도 workspaces를 강하게 지원한다. 특히 `workspace:` protocol, constraints, `yarn workspaces foreach`, `yarn workspaces focus` 같은 기능이 있다.

```json
{
  "dependencies": {
    "@my-org/ui": "workspace:^"
  }
}
```

Yarn 공식 문서는 workspaces를 모노레포에서 여러 패키지를 함께 관리하기 위한 핵심 기능으로 설명한다. 참고: [Yarn workspaces](https://yarnpkg.com/features/workspaces)

단순한 모노레포라면 npm workspaces도 충분하다. 하지만 워크스페이스 간 규칙 강제, 선택적 설치, 복잡한 스크립트 실행 전략이 필요하면 Yarn이 더 많은 기능을 제공한다.

---

## Corepack과 packageManager 필드

팀 프로젝트에서 중요한 문제는 “누가 어떤 패키지 매니저의 어떤 버전을 쓰는가”다.

예를 들어 한 사람은 Yarn 1을 쓰고, 다른 사람은 Yarn 4를 쓰면 같은 `yarn install`도 완전히 다른 결과를 만들 수 있다.

이를 줄이기 위해 `package.json`에 `packageManager` 필드를 둘 수 있다.

```json
{
  "packageManager": "yarn@4.5.0"
}
```

또는 npm을 명시할 수도 있다.

```json
{
  "packageManager": "npm@10.9.0"
}
```

Node.js에는 Corepack이라는 도구가 있다. Corepack은 프로젝트에 설정된 패키지 매니저 버전을 보고 필요한 패키지 매니저를 준비해 실행하는 역할을 한다. Node.js 문서에 따르면 Corepack은 Yarn과 pnpm 바이너리를 지원하며, npm은 기본 shim이 활성화되어 있지 않다는 차이가 있다. 참고: [Node.js Corepack](https://nodejs.org/download/release/v22.10.0/docs/api/corepack.html)

Yarn을 팀에서 쓴다면 보통 다음 흐름이 안전하다.

```bash
corepack enable
yarn install --immutable
```

그리고 레포에는 패키지 매니저를 명시한다.

```json
{
  "packageManager": "yarn@4.5.0"
}
```

이렇게 하면 “내 컴퓨터의 전역 Yarn 버전”에 덜 의존하게 된다.

---

## 보안과 audit

npm에는 `npm audit`이 기본적으로 잘 알려져 있다.

```bash
npm audit
npm audit fix
```

Yarn도 npm audit API를 활용하는 명령을 제공한다.

```bash
yarn npm audit
```

다만 audit 결과는 항상 그대로 자동 수정하면 안 된다. 특히 `audit fix --force`류의 명령은 major version 업데이트를 일으켜 런타임 호환성을 깨뜨릴 수 있다.

보안 업데이트는 다음 순서가 안전하다.

1. 취약점이 실제 프로젝트 실행 경로에 영향을 주는지 확인한다.
2. lockfile만 바뀌는 patch 업데이트인지 확인한다.
3. major 업데이트가 필요하면 changelog와 breaking change를 확인한다.
4. 테스트와 빌드를 통과시킨다.

패키지 매니저 선택보다 중요한 것은 lockfile을 커밋하고, CI에서 frozen install을 강제하고, 의존성 업데이트를 코드 변경처럼 리뷰하는 것이다.

---

## 실무에서 피해야 할 패턴

가장 흔한 문제는 패키지 매니저를 섞어 쓰는 것이다.

```text
package-lock.json도 있고
yarn.lock도 있고
누군가는 npm install을 하고
누군가는 yarn install을 한다
```

이 상태에서는 의존성 변경이 재현되기 어렵다. PR마다 lockfile이 불필요하게 바뀌고, 로컬과 CI 결과가 달라질 수 있다.

레포에는 다음 중 하나만 남기는 것이 좋다.

```text
npm 프로젝트
  package-lock.json
  npm ci

Yarn 프로젝트
  yarn.lock
  yarn install --immutable
```

현재 레포에 둘 다 있다면 먼저 팀 기준을 정해야 한다. 단순히 하나를 삭제하는 것이 아니라, CI 명령어, README, 배포 스크립트, Dockerfile까지 같은 패키지 매니저로 맞춰야 한다.

---

## 선택 기준

### npm을 선택해도 좋은 경우

- 프로젝트가 단일 앱이다.
- 별도의 패키지 매니저 학습 비용을 줄이고 싶다.
- `node_modules` 기반 호환성이 중요하다.
- CI/CD에서 `npm ci`만으로 충분하다.
- 팀에 프론트엔드 전담 인프라 관리자가 없다.

```bash
npm ci
npm run build
```

npm은 기본 선택지로 충분히 안정적이다. 특별한 요구가 없다면 npm을 고르는 것이 가장 단순하다.

### Yarn을 선택할 만한 경우

- 이미 Yarn 기반 레포다.
- 모노레포 기능을 적극적으로 쓴다.
- `workspace:` protocol이나 focus install이 필요하다.
- PnP로 ghost dependency를 잡고 싶다.
- zero-install 전략을 검토하고 있다.
- 팀이 Yarn Berry 설정과 IDE 통합 비용을 감당할 수 있다.

```bash
corepack enable
yarn install --immutable
yarn workspaces foreach --all run build
```

Yarn은 기능이 강하지만 그만큼 선택지가 많다. 특히 PnP를 쓰면 도구 호환성, IDE SDK, `.yarnrc.yml` 설정을 이해해야 한다.

---

## 마이그레이션할 때 확인할 것

npm에서 Yarn으로, 또는 Yarn에서 npm으로 바꿀 때는 설치 명령어만 바꾸면 끝나지 않는다.

- 기존 lockfile을 제거하고 새 lockfile을 생성한다.
- CI 설치 명령어를 바꾼다.
- Dockerfile의 설치 명령어를 바꾼다.
- README의 온보딩 명령어를 바꾼다.
- GitHub Actions 캐시 키를 바꾼다.
- `packageManager` 필드를 추가하거나 수정한다.
- PnP를 쓴다면 IDE와 테스트 도구 호환성을 확인한다.
- 배포 환경에서 Corepack 사용 가능 여부를 확인한다.

예를 들어 npm 기준 Dockerfile은 보통 다음처럼 쓴다.

```dockerfile
COPY package.json package-lock.json ./
RUN npm ci
```

Yarn 기준으로는 lockfile과 Corepack 흐름을 맞춘다.

```dockerfile
COPY package.json yarn.lock .yarnrc.yml ./
RUN corepack enable
RUN yarn install --immutable
```

Yarn zero-install을 쓰는 경우에는 `.yarn/cache`, `.pnp.cjs` 커밋 여부까지 팀 규칙으로 정해야 한다.

---

## 정리

npm과 Yarn은 둘 다 JavaScript 패키지를 설치하는 도구지만, 지향점이 다르다. npm은 Node.js 기본 도구라는 점에서 접근성이 좋고, 대부분의 단일 앱에서는 충분하다. Yarn은 workspaces, PnP, zero-install, constraints 같은 기능으로 더 강한 프로젝트 운영 모델을 제공한다.

선택 기준은 단순하다.

- 특별한 요구가 없다면 npm을 쓴다.
- 모노레포와 엄격한 의존성 관리가 중요하면 Yarn을 검토한다.
- 어떤 쪽을 선택하든 lockfile은 하나만 유지한다.
- CI에서는 `npm ci` 또는 `yarn install --immutable`처럼 재현 가능한 설치 명령을 쓴다.
- 팀에서는 `packageManager` 필드와 Corepack으로 패키지 매니저 버전을 고정한다.

패키지 매니저는 취향 문제가 아니라 재현성과 운영 비용의 문제다. 팀이 이해하고 유지할 수 있는 쪽을 선택하는 것이 가장 중요하다.

---

## 참고 문서

- [npm package-lock.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json)
- [npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci/)
- [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces)
- [Yarn Plug'n'Play](https://yarnpkg.com/features/pnp)
- [Yarn install modes](https://yarnpkg.com/features/linkers)
- [Yarn workspaces](https://yarnpkg.com/features/workspaces)
- [Yarn install](https://yarnpkg.com/cli/install)
- [Node.js Corepack](https://nodejs.org/download/release/v22.10.0/docs/api/corepack.html)
