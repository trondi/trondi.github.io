---
title: "getServerSideProps와 getStaticProps — Pages Router 데이터 패칭 이해하기"
date: "2026-05-05"
summary: "Next.js Pages Router의 getServerSideProps와 getStaticProps가 언제 실행되고 왜 필요했는지, App Router에서는 어떤 방식으로 대체되는지 정리했다."
category: "React / Next.js"
tags:
  - Next.js
  - Pages Router
  - App Router
  - SSR
  - SSG
featured: false
draft: false
---

# getServerSideProps와 getStaticProps — Pages Router 데이터 패칭 이해하기

## 먼저 전제 — Pages Router의 데이터 패칭 API다

`getServerSideProps`와 `getStaticProps`는 Next.js의 **Pages Router**에서 사용하는 데이터 패칭 함수다.

즉, 이런 구조에서 쓰인다.

```txt
pages/
  index.tsx
  posts/
    [slug].tsx
```

반대로 App Router의 `app/` 디렉터리에서는 이 함수들을 사용하지 않는다.

```txt
app/
  page.tsx
  posts/
    [slug]/
      page.tsx
```

App Router에서는 페이지 컴포넌트 자체가 기본적으로 서버에서 실행되는 **Server Component**이고, `fetch` 옵션, `generateStaticParams`, `revalidate`, `dynamic`, `cookies()`, `headers()` 같은 API로 같은 역할을 나눠서 처리한다.

---

## 왜 이런 함수가 필요했을까

React만 사용하면 기본적으로 브라우저에서 JavaScript가 실행된 뒤 데이터를 가져와 화면을 그린다. 이 방식은 대시보드나 관리자 화면에는 괜찮지만, 공개 페이지에서는 문제가 생긴다.

- 첫 HTML이 비어 있거나 내용이 적어서 SEO에 불리하다.
- 사용자는 JavaScript 다운로드, 실행, API 응답을 기다려야 한다.
- 페이지마다 "서버에서 미리 만들지", "요청마다 만들지"를 명확히 구분하기 어렵다.

Next.js는 이 문제를 해결하려고 페이지 단위 데이터 패칭 함수를 제공했다.

`getStaticProps`는 **빌드 시점에 데이터를 가져와 정적 HTML을 미리 만드는 함수**다.

`getServerSideProps`는 **요청이 들어올 때마다 데이터를 가져와 HTML을 서버에서 만드는 함수**다.

둘 다 목적은 같다. 브라우저가 빈 화면에서 시작하지 않도록, 서버가 데이터를 준비한 HTML을 먼저 내려주는 것이다.

---

## getStaticProps — 빌드 시점에 HTML 만들기

`getStaticProps`는 `next build` 시점에 실행된다. 함수에서 가져온 데이터는 page component의 props로 전달되고, Next.js는 그 결과를 HTML과 JSON 파일로 미리 저장한다.

```tsx
import type { GetStaticProps, InferGetStaticPropsType } from 'next';

type Post = {
  title: string;
  content: string;
};

export const getStaticProps = (async () => {
  const res = await fetch('https://example.com/api/posts/hello');
  const post = (await res.json()) as Post;

  return {
    props: {
      post,
    },
  };
}) satisfies GetStaticProps<{ post: Post }>;

export default function PostPage({
  post,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  );
}
```

요청 흐름은 이렇게 된다.

```txt
빌드 시점
getStaticProps 실행 → 데이터 fetch → HTML/JSON 생성

사용자 요청
이미 만들어진 HTML 반환 → React hydration
```

### getStaticProps가 적합한 경우

- 블로그 글
- 문서 페이지
- 마케팅 페이지
- 제품 소개 페이지
- 데이터가 자주 바뀌지 않는 공개 페이지

이 블로그처럼 `content/posts/*.md` 파일을 읽어서 정적 페이지를 만드는 경우가 전형적인 예다.

```tsx
import fs from 'node:fs/promises';
import path from 'node:path';

export async function getStaticProps() {
  const filePath = path.join(process.cwd(), 'content/posts/hello.md');
  const source = await fs.readFile(filePath, 'utf8');

  return {
    props: {
      source,
    },
  };
}
```

`getStaticProps` 안의 코드는 클라이언트 번들에 포함되지 않는다. 그래서 파일 시스템 접근이나 서버 전용 로직을 넣을 수 있다.

### getStaticProps의 한계

정적 생성은 빠르지만, 빌드 시점의 데이터로 고정된다. 데이터가 바뀌면 다시 빌드해야 한다.

```txt
글 수정 → next build 다시 실행 → 새 HTML 배포
```

이 문제를 줄이기 위해 Pages Router에서는 `revalidate`를 반환할 수 있다. 이것이 ISR(Incremental Static Regeneration)이다.

```tsx
export async function getStaticProps() {
  const res = await fetch('https://example.com/api/products');
  const products = await res.json();

  return {
    props: {
      products,
    },
    revalidate: 60,
  };
}
```

이 설정은 "최대 60초마다 페이지를 다시 생성할 수 있다"는 의미다. 매 요청마다 새로 만드는 SSR과 달리, 캐시된 정적 페이지를 우선 사용하고 필요할 때 재생성한다.

---

## 동적 라우트에서는 getStaticPaths가 필요하다

`pages/posts/[slug].tsx` 같은 동적 라우트에서 `getStaticProps`를 쓰려면, 어떤 `slug`를 미리 만들지 Next.js에 알려줘야 한다.

이때 사용하는 함수가 `getStaticPaths`다.

```tsx
import type { GetStaticPaths, GetStaticProps } from 'next';

export const getStaticPaths = (async () => {
  const posts = await fetch('https://example.com/api/posts').then((res) =>
    res.json(),
  );

  return {
    paths: posts.map((post: { slug: string }) => ({
      params: {
        slug: post.slug,
      },
    })),
    fallback: false,
  };
}) satisfies GetStaticPaths;

export const getStaticProps = (async ({ params }) => {
  const slug = params?.slug;
  const post = await fetch(`https://example.com/api/posts/${slug}`).then((res) =>
    res.json(),
  );

  return {
    props: {
      post,
    },
  };
}) satisfies GetStaticProps;
```

`fallback: false`는 `paths`에 없는 경로는 404로 처리하겠다는 뜻이다.

정리하면 역할이 이렇게 나뉜다.

| 함수 | 역할 |
|---|---|
| `getStaticPaths` | 어떤 동적 경로를 만들지 결정 |
| `getStaticProps` | 각 경로에 필요한 데이터를 가져와 HTML 생성 |

---

## getServerSideProps — 요청마다 HTML 만들기

`getServerSideProps`는 사용자의 요청이 들어올 때마다 서버에서 실행된다.

```tsx
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';

type User = {
  name: string;
};

export const getServerSideProps = (async (context) => {
  const cookie = context.req.headers.cookie ?? '';

  const res = await fetch('https://example.com/api/me', {
    headers: {
      cookie,
    },
  });

  const user = (await res.json()) as User;

  return {
    props: {
      user,
    },
  };
}) satisfies GetServerSideProps<{ user: User }>;

export default function MyPage({
  user,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return <h1>{user.name}님, 안녕하세요.</h1>;
}
```

요청 흐름은 이렇게 된다.

```txt
사용자 요청
getServerSideProps 실행 → 요청 정보 기반 데이터 fetch → HTML 생성 → 응답
```

### getServerSideProps가 적합한 경우

- 로그인 사용자별 페이지
- 쿠키나 세션이 필요한 페이지
- 요청 헤더, IP, 지역 정보가 필요한 페이지
- 항상 최신 데이터가 필요한 페이지
- 캐시하면 안 되는 민감한 데이터가 있는 페이지

예를 들어 "내 주문 내역" 페이지는 빌드 시점에 만들 수 없다. 사용자마다 데이터가 다르고, 쿠키나 세션을 확인해야 하기 때문이다.

이런 페이지는 `getStaticProps`가 아니라 `getServerSideProps`가 맞다.

### getServerSideProps의 비용

요청마다 서버에서 함수를 실행하므로 정적 페이지보다 느릴 수 있다.

```txt
요청 1 → 서버 계산
요청 2 → 서버 계산
요청 3 → 서버 계산
```

장점은 최신성과 개인화이고, 단점은 서버 비용과 TTFB 증가다.

또 하나 주의할 점이 있다. `getServerSideProps`가 반환한 `props`는 클라이언트가 hydration할 수 있도록 HTML에 직렬화되어 포함된다. 따라서 비밀 토큰, 내부 API 키, 노출되면 안 되는 원본 데이터를 props에 넣으면 안 된다.

```tsx
// 위험한 예시
return {
  props: {
    accessToken,
  },
};
```

서버에서만 필요한 값은 서버에서 처리하고, 클라이언트에는 화면에 필요한 최소 데이터만 넘겨야 한다.

---

## getStaticProps와 getServerSideProps 비교

| 기준 | getStaticProps | getServerSideProps |
|---|---|---|
| 실행 시점 | 빌드 시점 | 요청마다 |
| 렌더링 전략 | SSG, ISR | SSR |
| 속도 | 매우 빠름 | 상대적으로 느림 |
| 데이터 최신성 | 빌드 시점 또는 revalidate 주기 | 항상 최신 |
| 사용자별 데이터 | 부적합 | 적합 |
| 서버 필요 | 기본 SSG는 정적 호스팅 가능 | 필요 |
| 대표 사례 | 블로그, 문서, 소개 페이지 | 마이페이지, 주문 내역, 인증 페이지 |

선택 기준은 단순하다.

```txt
모든 사용자에게 같은 데이터인가?
  yes → getStaticProps
  no  → getServerSideProps

데이터가 요청 시점에 꼭 최신이어야 하는가?
  yes → getServerSideProps
  no  → getStaticProps + revalidate 고려
```

---

## App Router에서는 무엇으로 대체될까

App Router에서는 `getStaticProps`, `getServerSideProps`, `getStaticPaths`를 export하지 않는다.

대신 다음 조합으로 같은 역할을 표현한다.

| Pages Router | App Router |
|---|---|
| `getStaticProps` | Server Component에서 `fetch(..., { cache: 'force-cache' })` |
| `getStaticProps` + `revalidate` | `fetch(..., { next: { revalidate: 60 } })` 또는 `export const revalidate = 60` |
| `getServerSideProps` | `fetch(..., { cache: 'no-store' })`, `export const dynamic = 'force-dynamic'`, `cookies()`, `headers()` |
| `getStaticPaths` | `generateStaticParams()` |
| `notFound: true` | `notFound()` |
| `redirect` | `redirect()` |

핵심 변화는 "페이지 밖의 특수 함수에서 데이터를 가져온 뒤 props로 넘기는 방식"에서 "서버 컴포넌트 안에서 직접 데이터를 가져오는 방식"으로 바뀐 것이다.

---

## App Router에서 getStaticProps에 해당하는 방식

App Router의 Server Component는 `async` 함수가 될 수 있다. 따라서 컴포넌트 안에서 바로 데이터를 가져온다.

```tsx
// app/posts/page.tsx
export default async function PostsPage() {
  const res = await fetch('https://example.com/api/posts', {
    cache: 'force-cache',
  });
  const posts = await res.json();

  return (
    <main>
      {posts.map((post: { id: string; title: string }) => (
        <article key={post.id}>{post.title}</article>
      ))}
    </main>
  );
}
```

`force-cache`는 정적으로 캐시 가능한 데이터를 의미한다. App Router에서는 기본적으로 정적 렌더링을 최대한 활용하려고 한다.

파일 시스템에서 마크다운을 읽는 블로그라면 이런 형태가 된다.

```tsx
// app/posts/[slug]/page.tsx
import { getPostBySlug } from '@/lib/posts';

export default async function PostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = await getPostBySlug(params.slug);

  return <article>{post.title}</article>;
}
```

이 블로그의 현재 구조도 이 방식에 가깝다. `content/posts`를 읽고, `generateStaticParams()`로 정적 생성할 slug 목록을 만든다.

---

## App Router에서 getStaticPaths에 해당하는 방식

Pages Router의 `getStaticPaths`는 App Router에서 `generateStaticParams`로 대체된다.

```tsx
// app/posts/[slug]/page.tsx
export async function generateStaticParams() {
  const posts = await getAllPosts();

  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export default async function PostPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = await getPostBySlug(params.slug);

  return <article>{post.title}</article>;
}
```

역할은 같다.

```txt
getStaticPaths        → Pages Router에서 정적 생성 경로 결정
generateStaticParams  → App Router에서 정적 생성 경로 결정
```

---

## App Router에서 ISR에 해당하는 방식

Pages Router에서는 `getStaticProps`가 `revalidate`를 반환했다.

```tsx
export async function getStaticProps() {
  return {
    props: {
      products,
    },
    revalidate: 60,
  };
}
```

App Router에서는 `fetch` 옵션 또는 route segment config를 사용한다.

```tsx
export default async function ProductsPage() {
  const res = await fetch('https://example.com/api/products', {
    next: {
      revalidate: 60,
    },
  });

  const products = await res.json();

  return <ProductList products={products} />;
}
```

또는 페이지 파일 상단에 선언할 수 있다.

```tsx
export const revalidate = 60;

export default async function ProductsPage() {
  const products = await getProducts();

  return <ProductList products={products} />;
}
```

`fetch`를 쓰지 않고 ORM이나 파일 시스템, CMS SDK를 직접 사용하는 경우에는 route segment의 정적/동적 렌더링 설정과 캐시 API를 같이 고려해야 한다.

---

## App Router에서 getServerSideProps에 해당하는 방식

요청마다 새 데이터를 가져오고 싶다면 `cache: 'no-store'`를 쓴다.

```tsx
export default async function DashboardPage() {
  const res = await fetch('https://example.com/api/dashboard', {
    cache: 'no-store',
  });

  const dashboard = await res.json();

  return <Dashboard data={dashboard} />;
}
```

페이지 전체를 강제로 동적 렌더링하고 싶다면 route segment config를 사용할 수 있다.

```tsx
export const dynamic = 'force-dynamic';

export default async function Page() {
  const data = await getData();

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```

쿠키나 헤더를 읽는 경우도 요청 시점 정보가 필요하므로 동적 렌더링이 된다.

```tsx
import { cookies, headers } from 'next/headers';

export default async function MyPage() {
  const cookieStore = cookies();
  const token = cookieStore.get('token')?.value;
  const userAgent = headers().get('user-agent');

  const user = await getUser(token);

  return (
    <main>
      <h1>{user.name}</h1>
      <p>{userAgent}</p>
    </main>
  );
}
```

이것이 App Router에서 `getServerSideProps`가 하던 역할을 대체하는 방식이다.

---

## Pages Router와 App Router의 사고방식 차이

Pages Router는 페이지 컴포넌트와 데이터 패칭 함수가 분리되어 있다.

```tsx
export async function getServerSideProps() {
  return {
    props: {
      data,
    },
  };
}

export default function Page({ data }) {
  return <View data={data} />;
}
```

App Router는 서버 컴포넌트가 직접 데이터를 가져온다.

```tsx
export default async function Page() {
  const data = await getData();

  return <View data={data} />;
}
```

이 차이 때문에 App Router에서는 "이 페이지가 어떤 렌더링 전략인가?"를 함수 이름으로 판단하기보다, 데이터 접근 방식과 캐시 설정으로 판단해야 한다.

```txt
정적 데이터        → force-cache, generateStaticParams
주기적 갱신 데이터 → revalidate
요청별 데이터      → no-store, force-dynamic, cookies(), headers()
```

---

## 실무 선택 기준

### 블로그 글 상세

```txt
Pages Router: getStaticProps + getStaticPaths
App Router: generateStaticParams + 파일/DB 조회
```

모든 사용자에게 같은 글을 보여주므로 정적 생성이 적합하다.

### 상품 상세

```txt
Pages Router: getStaticProps + revalidate
App Router: fetch(..., { next: { revalidate: 60 } })
```

모든 사용자에게 비슷한 정보를 보여주지만 가격이나 재고가 바뀔 수 있으므로 ISR이 적합하다.

### 마이페이지

```txt
Pages Router: getServerSideProps
App Router: cookies() + dynamic rendering
```

사용자별 데이터가 필요하므로 요청마다 처리해야 한다.

### 관리자 대시보드

```txt
Pages Router: getServerSideProps 또는 CSR
App Router: Server Component + no-store, 또는 Client Component + SWR/React Query
```

항상 최신성이 중요하고 상호작용이 많다면 서버 렌더링과 클라이언트 데이터 패칭을 섞어 쓴다.

---

## 자주 헷갈리는 부분

### getServerSideProps는 클라이언트에서 실행되지 않는다

`getServerSideProps`는 서버에서만 실행된다. 다만 반환한 `props`는 hydration을 위해 클라이언트가 볼 수 있는 형태로 포함된다.

서버에서 실행된다는 말과 props가 노출되지 않는다는 말은 다르다.

### getStaticProps도 서버에서 실행된다

`getStaticProps`는 브라우저에서 실행되지 않는다. 빌드 시점 또는 ISR 재생성 시점에 서버 환경에서 실행된다.

### App Router에서 모든 fetch가 SSR은 아니다

Server Component에서 `fetch`를 쓴다고 해서 무조건 SSR이 아니다. 캐시 가능한 요청이면 정적으로 렌더링될 수 있다.

```tsx
// 정적 캐시 가능
fetch(url, { cache: 'force-cache' });

// 요청마다 실행
fetch(url, { cache: 'no-store' });
```

### output: export에서는 서버 기능에 제약이 있다

완전 정적 export를 쓰면 요청마다 서버에서 실행되는 기능을 사용할 수 없다. Pages Router의 `getServerSideProps`나 App Router의 동적 서버 렌더링은 정적 호스팅과 맞지 않는다.

이 블로그처럼 `output: 'export'`로 GitHub Pages에 올리는 구조라면 정적 생성 가능한 글과 페이지 중심으로 설계해야 한다.

---

## 정리

`getStaticProps`와 `getServerSideProps`는 Pages Router 시대에 페이지의 렌더링 전략을 명확히 표현하기 위한 API였다.

`getStaticProps`는 빌드 시점에 데이터를 가져와 정적 HTML을 만든다. 블로그, 문서, 마케팅 페이지처럼 모두에게 같은 콘텐츠를 보여주는 페이지에 적합하다.

`getServerSideProps`는 요청마다 데이터를 가져와 HTML을 만든다. 로그인 사용자, 쿠키, 세션, 항상 최신 데이터가 필요한 페이지에 적합하다.

App Router에서는 이 역할이 특수 함수에서 서버 컴포넌트와 캐시 설정으로 이동했다. 이제 핵심은 함수 이름이 아니라 데이터가 언제 필요하고 얼마나 캐시될 수 있는지 판단하는 것이다.

## 참고

- [Next.js 공식 문서 — getServerSideProps](https://nextjs.org/docs/14/pages/building-your-application/data-fetching/get-server-side-props)
- [Next.js 공식 문서 — getStaticProps](https://nextjs.org/docs/15/pages/api-reference/functions/get-static-props)
- [Next.js 공식 문서 — getStaticPaths](https://nextjs.org/docs/14/pages/api-reference/functions/get-static-paths)
- [Next.js 공식 문서 — App Router Data Fetching, Caching, and Revalidating](https://nextjs.org/docs/14/app/building-your-application/data-fetching/fetching-caching-and-revalidating)
