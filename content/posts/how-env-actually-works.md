---
title: ".env는 어떻게 동작하는가 — process.env부터 Next.js 빌드 인라이닝까지"
date: "2026-04-19"
summary: ".env 파일을 Node.js가 직접 읽는 게 아니라는 사실부터, Next.js가 빌드 시 환경변수를 코드에 박아넣는 원리까지 — 동작 원리를 한 층씩 뜯어본다."
category: "JavaScript / TypeScript"
tags:
  - Environment Variables
  - Node.js
  - Next.js
  - dotenv
  - Build
featured: false
---

# .env는 어떻게 동작하는가

> 이전 글 [env의 종류와 빌드·런타임 실행 시점 완전 정리](/posts/env-build-runtime)에서 Next.js 기준으로 어떤 파일을 쓰고, 어느 타이밍에 값이 결정되는지 정리했다. 이번 글은 한 층 더 아래로 내려가서, 그게 **왜** 그렇게 동작하는지를 들여다본다.

---

## process.env는 .env 파일을 읽는 게 아니다

`process.env`는 Node.js가 제공하는 객체지만, `.env` 파일과 직접적인 연결은 없다.

`process.env`의 실체는 **운영체제의 환경변수**다. Node.js 프로세스가 시작될 때 OS로부터 상속받은 환경변수 맵이 그대로 담긴다.

```bash
# 터미널에서 환경변수를 설정하고 Node를 실행하면
export MY_VAR=hello
node -e "console.log(process.env.MY_VAR)" # hello
```

`.env` 파일 없이도 잘 동작한다. 반대로 `.env` 파일이 있어도 아무도 읽어주지 않으면 `process.env`에는 아무 변화가 없다.

---

## 그럼 .env 파일은 누가 읽나

`.env` 파일을 읽어서 `process.env`에 주입하는 건 **dotenv** 같은 라이브러리의 역할이다. Node.js 자체 기능이 아니다.

```js
// dotenv가 하는 일의 본질
import fs from 'fs';

const content = fs.readFileSync('.env', 'utf-8');

for (const line of content.split('\n')) {
  const [key, value] = line.split('=');
  process.env[key.trim()] = value.trim(); // OS 환경변수에 주입
}
```

실제 dotenv 코드는 더 복잡하지만(주석 처리, 따옴표 파싱, 멀티라인 등), 핵심은 **파일을 파싱해서 `process.env`에 써넣는 것**이다.

```js
// 일반적인 Node.js 앱에서 직접 호출하는 방식
import 'dotenv/config';

console.log(process.env.DATABASE_URL); // .env에서 읽어온 값
```

앱 진입점 최상단에서 호출해야 이후 코드에서 `process.env`로 접근할 수 있다.

---

## .env는 Node.js에만 있는 개념인가

아니다. `.env` 파일과 dotenv 방식은 사실상 언어를 가리지 않는 관행이 됐다.

- Python → `python-dotenv`
- Ruby → `dotenv` gem
- Go → `godotenv`
- Docker Compose → `env_file` 옵션

공통점은 하나다. **OS 환경변수를 파일로 관리하기 위한 도구**일 뿐, 어떤 런타임의 내장 기능도 아니다. 배포 환경(AWS, Vercel, Railway 등)에서는 `.env` 파일 없이 직접 OS 환경변수를 설정하는 게 일반적이다. dotenv는 로컬 개발의 편의를 위해 그 OS 환경변수를 파일로 흉내 내는 것이다.

---

## Next.js는 dotenv를 직접 호출하지 않는다

Next.js는 내부적으로 dotenv를 래핑해서 자동으로 `.env*` 파일들을 읽는다. 개발자가 `dotenv/config`를 호출할 필요가 없는 이유다.

```
next dev 또는 next build 실행
  → Next.js 내부에서 .env, .env.local, .env.development 등을 순서대로 로드
  → process.env에 주입
  → 이후 코드에서 process.env로 접근 가능
```

여기까지는 일반 dotenv와 동일하다. Next.js가 달라지는 건 `NEXT_PUBLIC_` 접두사가 붙은 변수를 처리하는 방식이다.

---

## NEXT_PUBLIC_의 실체 — 빌드 타임 문자열 치환

`NEXT_PUBLIC_API_URL`을 코드에서 사용한다고 하자.

```tsx
const url = process.env.NEXT_PUBLIC_API_URL;
```

이 코드는 브라우저에서도 실행돼야 한다. 그런데 브라우저에는 `process.env`가 없다. Node.js 전용 객체이기 때문이다.

Next.js(내부적으로 webpack 또는 Turbopack)는 빌드 중에 이 문제를 해결한다.

```tsx
// 빌드 전 코드
const url = process.env.NEXT_PUBLIC_API_URL;

// 빌드 후 번들 (JS 파일 안을 들여다보면)
const url = "https://api.example.com";
```

`process.env.NEXT_PUBLIC_API_URL`이라는 리터럴을 빌드 시점의 실제 값으로 **문자열 치환(string replace)**해버린다. 브라우저가 `process.env`를 몰라도 되는 이유가 여기에 있다.

이 치환은 webpack의 `DefinePlugin`이 담당한다.

```js
// webpack 내부에서 일어나는 일 (개념적으로)
new webpack.DefinePlugin({
  'process.env.NEXT_PUBLIC_API_URL': JSON.stringify('https://api.example.com'),
})
```

결과적으로 **`NEXT_PUBLIC_` 변수는 빌드가 끝나는 순간 상수가 된다.**

---

## 서버 컴포넌트에서 env를 바꿔도 안 먹히는 이유

여기서 처음 의문으로 돌아온다. Next.js 서버 컴포넌트에서 환경변수를 바꿨는데 왜 적용이 안 될까?

서버 컴포넌트라도 `NEXT_PUBLIC_` 변수는 **동일하게 빌드 타임에 치환된다.** 서버/클라이언트 구분과 무관하다.

```tsx
// app/page.tsx (서버 컴포넌트)
export default function Page() {
  // 이것도 빌드 시 "https://api.example.com"으로 치환됨
  const url = process.env.NEXT_PUBLIC_API_URL;
  return <div>{url}</div>;
}
```

접두사 없는 서버 전용 변수는 다르다.

```tsx
// app/page.tsx (서버 컴포넌트)
export default async function Page() {
  // 런타임에 process.env에서 읽음 — 재빌드 없이 변경 가능
  const secret = process.env.SECRET_API_KEY;
}
```

| 변수 종류 | 결정 시점 | 변경하려면 |
|---|---|---|
| `NEXT_PUBLIC_FOO` | 빌드 타임 (하드코딩) | 재빌드 필요 |
| `FOO` (서버 전용) | 런타임 | 서버 재시작으로 충분 |

---

## 정리

`.env` 파일이 동작하는 구조를 한 줄로 요약하면:

> `.env` 파일 → dotenv가 읽어서 → OS 환경변수(`process.env`)에 주입 → 코드에서 접근

Next.js에서 `NEXT_PUBLIC_` 변수가 고정되는 구조는:

> 빌드 시 webpack이 `process.env.NEXT_PUBLIC_FOO` 리터럴을 실제 값으로 치환 → 번들에 상수로 박힘 → 이후 변경 불가

이 두 레이어를 구분하면, "서버 컴포넌트인데 왜 env 변경이 안 먹히지?"라는 혼란의 원인이 명확해진다. 서버/클라이언트가 문제가 아니라, `NEXT_PUBLIC_` 접두사 자체가 "빌드 타임에 인라인"을 의미하기 때문이다.
