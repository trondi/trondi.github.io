---
title: "Next.js App Router vs Pages Router — 최신 기준 비교"
date: "2026-05-03"
summary: "Next.js 16 기준으로 App Router와 Pages Router의 라우팅 구조, 데이터 패칭, 레이아웃, 서버 컴포넌트, API 작성 방식, 마이그레이션 기준을 비교했다."
category: "React / Next.js"
tags:
  - Next.js
  - App Router
  - Pages Router
  - React
  - Routing
featured: false
---

# Next.js App Router vs Pages Router — 최신 기준 비교

Next.js에는 현재 두 가지 라우터가 있다. 하나는 `app` 디렉토리를 사용하는 App Router이고, 다른 하나는 `pages` 디렉토리를 사용하는 Pages Router다.

2026년 5월 기준 Next.js 최신 문서는 Next.js 16을 기준으로 설명하고 있으며, App Router를 최신 기능의 중심으로 둔다. Pages Router도 여전히 지원되지만, Next.js 공식 문서는 React의 최신 기능을 활용하려면 App Router로 마이그레이션하는 것을 권장한다. 참고: [Next.js App Router docs](https://nextjs.org/docs/app), [Next.js Pages Router docs](https://nextjs.org/docs/pages)

---

## 먼저 결론

새 프로젝트라면 App Router를 선택하는 것이 기본값이다. Server Components, Server Functions, Suspense, nested layouts, loading UI, error boundary, Route Handlers 같은 최신 기능이 App Router 중심으로 설계되어 있기 때문이다.

기존 Pages Router 프로젝트라면 무조건 한 번에 갈아엎을 필요는 없다. Pages Router는 여전히 지원되고 있고, `app`과 `pages`는 같은 프로젝트에서 함께 사용할 수 있다. 다만 같은 URL 경로를 두 라우터에 동시에 만들면 충돌이 발생한다. 공식 문서도 App Router가 Pages Router보다 우선하며, 동일 경로 충돌은 빌드 타임 에러가 난다고 설명한다. 참고: [Next.js Routing docs](https://nextjs.org/docs/14/app/building-your-application/routing)

| 상황 | 선택 |
|---|---|
| 새 Next.js 프로젝트 | App Router |
| React Server Components를 쓰고 싶음 | App Router |
| 중첩 레이아웃과 streaming이 중요 | App Router |
| 기존 Pages Router 코드가 안정적으로 운영 중 | Pages Router 유지 후 점진 이전 |
| `getStaticProps`, `getServerSideProps` 기반 코드가 많음 | 당장 유지 가능 |
| 팀이 App Router 캐싱과 Server Component 모델에 익숙하지 않음 | 작은 라우트부터 점진 도입 |

---

## 핵심 차이 한 장 요약

| 비교 | App Router | Pages Router |
|---|---|---|
| 디렉토리 | `app` | `pages` |
| 라우트 단위 | segment 중심 | page file 중심 |
| 기본 컴포넌트 | Server Component | Client Component 방식에 가까운 전통적 React page |
| 레이아웃 | `layout.tsx` 중첩 레이아웃 | `_app.tsx` 또는 per-page layout 패턴 |
| 로딩 UI | `loading.tsx` | 직접 상태 처리 |
| 에러 UI | `error.tsx`, `global-error.tsx` | `_error.tsx`, 404/500 pages |
| 데이터 패칭 | Server Component 안에서 `fetch`, async component | `getStaticProps`, `getServerSideProps`, `getInitialProps` |
| API 작성 | Route Handlers: `app/api/.../route.ts` | API Routes: `pages/api/...` |
| 최신 React 기능 | Server Components, Suspense, Server Functions 중심 | 제한적 |
| 공식 권장 | 새 기능 중심 | 여전히 지원, 기존 앱 유지 가능 |

---

## 라우팅 구조 비교

Pages Router는 파일 하나가 곧 페이지다.

```text
pages
├─ index.tsx        → /
├─ about.tsx        → /about
└─ blog
   └─ [slug].tsx    → /blog/:slug
```

`pages/about.tsx` 파일을 만들면 `/about` 경로가 생긴다.

```tsx
export default function AboutPage() {
  return <main>About</main>;
}
```

App Router는 디렉토리 segment와 특별한 파일 규칙을 사용한다.

```text
app
├─ page.tsx              → /
├─ about
│  └─ page.tsx           → /about
└─ blog
   └─ [slug]
      └─ page.tsx        → /blog/:slug
```

App Router에서는 `page.tsx`가 실제 라우트 엔트리다. 폴더는 URL segment를 표현하고, 그 안에 `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx` 같은 파일을 배치한다.

```tsx
export default function AboutPage() {
  return <main>About</main>;
}
```

겉으로는 둘 다 파일 기반 라우팅이지만, App Router는 “페이지 파일”보다 “라우트 segment” 중심으로 설계되어 있다.

---

## 레이아웃 비교

Pages Router에서 전역 레이아웃은 보통 `_app.tsx`에서 감싼다.

```tsx
// pages/_app.tsx
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Layout>
      <Component {...pageProps} />
    </Layout>
  );
}
```

페이지별 레이아웃이 필요하면 `getLayout` 같은 관습을 직접 만든다.

```tsx
Page.getLayout = function getLayout(page) {
  return <DashboardLayout>{page}</DashboardLayout>;
};
```

App Router에서는 레이아웃이 파일 시스템의 1급 개념이다.

```text
app
├─ layout.tsx
├─ page.tsx
└─ dashboard
   ├─ layout.tsx
   └─ page.tsx
```

```tsx
// app/dashboard/layout.tsx
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <section className="dashboard">{children}</section>;
}
```

`/dashboard` 아래의 모든 페이지는 `dashboard/layout.tsx`를 공유한다. 상위 layout은 유지되고 하위 segment만 바뀌므로, 사이드바나 탭 UI처럼 유지되어야 하는 화면 구조를 만들기 쉽다.

이 차이 때문에 복잡한 서비스 화면에서는 App Router의 중첩 레이아웃이 훨씬 자연스럽다.

---

## Server Component 차이

App Router의 가장 큰 변화는 React Server Components다. App Router에서 `layout`과 `page`는 기본적으로 Server Component다. 공식 문서도 layouts와 pages가 기본적으로 Server Components이며, 상호작용이나 브라우저 API가 필요할 때 Client Component를 사용한다고 설명한다. 참고: [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

```tsx
// app/posts/page.tsx
export default async function PostsPage() {
  const posts = await getPostsFromDatabase();

  return (
    <main>
      {posts.map((post) => (
        <article key={post.id}>{post.title}</article>
      ))}
    </main>
  );
}
```

이 컴포넌트는 서버에서 실행된다. DB 접근, 파일 읽기, 서버 전용 환경변수 접근이 가능하고, 그 코드가 클라이언트 번들에 들어가지 않는다.

브라우저 이벤트, 상태, `useEffect`, `window`, `localStorage`가 필요하면 Client Component로 분리한다.

```tsx
"use client";

import { useState } from "react";

export function LikeButton() {
  const [liked, setLiked] = useState(false);

  return (
    <button onClick={() => setLiked((value) => !value)}>
      {liked ? "Liked" : "Like"}
    </button>
  );
}
```

Pages Router는 전통적인 React 페이지 모델에 가깝다. 페이지 컴포넌트는 브라우저에서도 hydrate되고, 서버 전용 코드는 `getStaticProps`나 `getServerSideProps` 같은 별도 함수로 분리한다.

```tsx
export async function getServerSideProps() {
  const posts = await getPostsFromDatabase();

  return {
    props: { posts },
  };
}

export default function PostsPage({ posts }) {
  return <main>{posts.length}</main>;
}
```

App Router는 “컴포넌트 자체가 서버에서 실행될 수 있다”는 모델이고, Pages Router는 “페이지 컴포넌트에 넘길 props를 별도 함수에서 만든다”는 모델이다.

---

## 데이터 패칭 비교

Pages Router는 데이터 패칭 함수를 명시적으로 사용한다.

| 목적 | Pages Router API |
|---|---|
| 빌드 타임 정적 생성 | `getStaticProps` |
| 동적 경로 정적 생성 | `getStaticPaths` |
| 요청마다 SSR | `getServerSideProps` |
| 오래된 방식 | `getInitialProps` |

```tsx
// pages/posts/[slug].tsx
export async function getStaticProps({ params }) {
  const post = await getPost(params.slug);

  return {
    props: { post },
    revalidate: 60,
  };
}

export async function getStaticPaths() {
  const posts = await getPosts();

  return {
    paths: posts.map((post) => ({ params: { slug: post.slug } })),
    fallback: "blocking",
  };
}
```

App Router는 Server Component 안에서 직접 데이터를 가져온다.

```tsx
// app/posts/[slug]/page.tsx
export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);

  return <article>{post.title}</article>;
}
```

Next.js 16 기준으로 중요한 변화가 있다. `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` 같은 request-time API는 비동기 접근이 기본이다. Next.js 16 업그레이드 문서에 따르면 v15에서 임시 동기 호환을 제공하던 request API가 v16부터는 비동기로만 접근된다. 참고: [Next.js Version 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)

App Router에서 캐싱과 재검증은 `fetch` 옵션이나 route segment config로 제어한다.

```tsx
// 정적 캐시
await fetch("https://api.example.com/posts", {
  cache: "force-cache",
});

// ISR처럼 시간 기반 재검증
await fetch("https://api.example.com/posts", {
  next: { revalidate: 60 },
});

// 요청마다 새 데이터
await fetch("https://api.example.com/posts", {
  cache: "no-store",
});
```

Pages Router는 `getStaticProps`, `getServerSideProps`처럼 “렌더링 전략별 API”가 분리되어 있고, App Router는 `fetch` 캐싱과 동적 API 사용 여부로 렌더링 동작이 결정된다.

---

## Loading과 Error 처리 비교

Pages Router에서는 로딩 상태를 컴포넌트 내부에서 직접 처리하는 경우가 많다.

```tsx
export default function Page() {
  const { data, isLoading } = useSWR("/api/posts", fetcher);

  if (isLoading) return <Spinner />;
  return <PostList posts={data} />;
}
```

SSR/SSG 페이지 전환 중의 로딩 UI도 직접 router event나 상태 관리로 다루는 경우가 많았다.

App Router는 loading과 error가 파일 규칙으로 들어왔다.

```text
app
└─ posts
   ├─ page.tsx
   ├─ loading.tsx
   └─ error.tsx
```

```tsx
// app/posts/loading.tsx
export default function Loading() {
  return <p>Loading posts...</p>;
}
```

```tsx
// app/posts/error.tsx
"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <button onClick={() => reset()}>Retry</button>;
}
```

`loading.tsx`는 Suspense 기반의 즉시 로딩 UI를 만들고, `error.tsx`는 해당 segment 아래의 에러 경계 역할을 한다. 이 구조는 nested route와 잘 맞는다. 전체 페이지를 갈아엎지 않고 특정 segment만 로딩/에러 상태로 바꿀 수 있다.

---

## API Routes와 Route Handlers

Pages Router에서는 `pages/api` 아래 파일이 API 엔드포인트가 된다.

```text
pages
└─ api
   └─ hello.ts       → /api/hello
```

```ts
// pages/api/hello.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ message: "hello" });
}
```

App Router에서는 Route Handler를 사용한다.

```text
app
└─ api
   └─ hello
      └─ route.ts    → /api/hello
```

```ts
// app/api/hello/route.ts
export async function GET() {
  return Response.json({ message: "hello" });
}
```

Route Handler는 Web Request/Response 표준에 더 가깝다. `GET`, `POST`, `PUT`, `DELETE` 같은 HTTP 메서드별 함수를 export한다.

Pages Router의 API Routes가 사라진 것은 아니다. 기존 API Routes는 계속 사용할 수 있다. 하지만 App Router 기반 새 코드라면 Route Handler를 쓰는 것이 자연스럽다.

---

## 메타데이터와 SEO 비교

Pages Router에서는 보통 `next/head`를 사용한다.

```tsx
import Head from "next/head";

export default function Page() {
  return (
    <>
      <Head>
        <title>Post title</title>
      </Head>
      <main>Post</main>
    </>
  );
}
```

App Router에서는 Metadata API를 사용한다.

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Post title",
  description: "Post description",
};

export default function Page() {
  return <main>Post</main>;
}
```

동적 페이지에서는 `generateMetadata`를 쓴다.

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);

  return {
    title: post.title,
    description: post.summary,
  };
}
```

App Router에서는 metadata도 라우트 segment 구조와 함께 동작한다. 중첩 layout 단위로 기본 metadata를 정의하고, page 단위에서 덮어쓸 수 있다.

---

## Navigation과 hook 차이

둘 다 `next/link`를 사용하지만 router hook은 다르다.

Pages Router:

```tsx
import { useRouter } from "next/router";

export default function Page() {
  const router = useRouter();
  return <button onClick={() => router.push("/about")}>Move</button>;
}
```

App Router:

```tsx
"use client";

import { useRouter } from "next/navigation";

export function MoveButton() {
  const router = useRouter();
  return <button onClick={() => router.push("/about")}>Move</button>;
}
```

App Router에서는 `usePathname`, `useSearchParams`, `useParams` 같은 hook도 `next/navigation`에서 가져온다. 이 hook들은 Client Component에서 사용한다.

```tsx
"use client";

import { usePathname, useSearchParams } from "next/navigation";

export function CurrentUrl() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return <p>{pathname}?{searchParams.toString()}</p>;
}
```

---

## React 버전 처리 차이

최신 Next.js 문서에는 App Router와 Pages Router의 React 버전 처리 차이도 명시되어 있다. App Router는 React의 최신 기능을 포함한 canary release를 내장해서 사용하고, Pages Router는 프로젝트 `package.json`에 설치된 React 버전을 사용한다. 참고: [Next.js docs - App Router and Pages Router](https://nextjs.org/docs)

이 차이는 앞으로 더 중요해질 수 있다. Server Components, Server Functions, Suspense 기반 라우팅 같은 기능은 App Router 중심으로 빠르게 들어오기 때문이다.

즉 Pages Router가 당장 없어지는 것은 아니지만, 최신 React 기능을 Next.js 방식으로 가장 먼저 활용하는 경로는 App Router다.

---

## Next.js 16 기준으로 달라진 것

Next.js 16 기준으로 App Router 쪽에서 특히 봐야 할 변화는 다음이다.

- Next.js 16은 Node.js 20.9 이상을 요구한다.
- Turbopack이 `next dev`와 `next build`의 기본 번들러가 되었다.
- `cookies`, `headers`, `draftMode`, `params`, `searchParams` 같은 request-time API는 비동기 접근만 지원한다.
- App Router는 React 19.2 기능을 포함하는 React canary release를 사용한다.
- routing/navigation prefetch와 cache 동작이 개선되었다.
- 기존 `middleware` convention은 `proxy.ts` 방향으로 바뀌었다.

이 내용은 App Router와 Pages Router의 직접 기능 비교라기보다, 최신 Next.js의 방향성을 보여준다. Next.js의 새로운 구조와 성능 개선은 App Router 중심으로 설명되는 경우가 많다. 참고: [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16), [Next.js 16 release blog](https://nextjs.org/blog/next-16)

---

## 같이 사용할 수 있는가

가능하다. App Router는 기존 Pages Router 프로젝트에 점진적으로 도입할 수 있게 설계되었다.

```text
project
├─ app
│  └─ dashboard
│     └─ page.tsx       → /dashboard
└─ pages
   └─ blog
      └─ [slug].tsx     → /blog/:slug
```

단, 같은 경로를 양쪽에 동시에 만들면 안 된다.

```text
app/about/page.tsx      → /about
pages/about.tsx         → /about
```

이런 중복은 빌드 타임 충돌로 막힌다.

점진 이전 전략은 보통 다음 순서가 안전하다.

1. 새 기능이나 독립된 화면을 `app` 아래에 만든다.
2. 기존 `pages` 라우트는 안정적으로 유지한다.
3. 공통 UI, 인증, 데이터 패칭 방식을 App Router 모델에 맞게 정리한다.
4. 복잡한 페이지를 한 번에 옮기지 말고 segment 단위로 이전한다.
5. 이전이 끝난 경로는 `pages`에서 제거해 충돌을 막는다.

---

## 마이그레이션할 때 헷갈리는 지점

### getStaticProps는 App Router에서 쓰지 않는다

App Router에서는 `getStaticProps`, `getServerSideProps`, `getStaticPaths`를 쓰지 않는다.

대신 Server Component에서 직접 데이터를 가져오고, `generateStaticParams`, `fetch` cache 옵션, `revalidate` 설정을 사용한다.

```tsx
export async function generateStaticParams() {
  const posts = await getPosts();

  return posts.map((post) => ({
    slug: post.slug,
  }));
}
```

### 모든 컴포넌트에 use client를 붙이면 장점이 사라진다

App Router에서 상호작용이 필요하다고 최상위 page 전체에 `"use client"`를 붙이면 Server Component 장점을 잃는다.

```tsx
// 피하는 편이 좋음
"use client";

export default function Page() {
  return <LargePage />;
}
```

보통은 서버에서 가져올 수 있는 데이터와 정적 UI는 Server Component로 두고, 버튼, 폼, 모달처럼 상호작용이 필요한 부분만 Client Component로 분리한다.

### params와 searchParams는 최신 기준에서 await해야 한다

Next.js 16 기준으로 App Router의 request-time API는 비동기 접근을 전제로 작성하는 것이 맞다.

```tsx
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return <p>query: {q}</p>;
}
```

기존 v14/v15 예제에서 동기 객체처럼 쓰는 코드를 봤다면 최신 기준으로 다시 확인해야 한다.

---

## 선택 기준

### App Router를 선택할 때

- 새 프로젝트다.
- React Server Components를 활용하고 싶다.
- 서버에서 직접 데이터 패칭하는 구조가 자연스럽다.
- nested layout, loading UI, error boundary가 중요하다.
- streaming과 Suspense 기반 UX를 만들고 싶다.
- Route Handlers와 Metadata API를 쓰고 싶다.
- Next.js의 최신 기능을 빠르게 따라가고 싶다.

### Pages Router를 유지할 때

- 이미 안정적으로 운영 중인 서비스다.
- `getStaticProps`, `getServerSideProps` 기반 코드가 많다.
- App Router 캐싱 모델을 팀이 아직 충분히 이해하지 못했다.
- 마이그레이션 비용이 당장 사용자 가치보다 크다.
- 사용 중인 라이브러리나 내부 패턴이 Pages Router에 강하게 묶여 있다.

Pages Router 유지가 틀린 선택은 아니다. 다만 새 기능을 계속 얹어야 하는 프로젝트라면 App Router로의 점진 이전 계획을 세우는 편이 낫다.

---

## 정리

App Router와 Pages Router의 차이는 폴더 이름 차이가 아니다. App Router는 React Server Components, Suspense, nested layouts, server-first data fetching을 전제로 한 새로운 애플리케이션 구조다. Pages Router는 `pages` 파일과 data fetching 함수 중심의 안정적인 기존 구조다.

최신 Next.js 기준의 기본 선택은 App Router다. 새 프로젝트라면 App Router로 시작하는 것이 맞고, 기존 Pages Router 프로젝트는 안정성을 유지하면서 독립된 route부터 점진적으로 옮기는 방식이 현실적이다.

핵심은 이것이다.

- 새 기능 중심 개발은 App Router가 유리하다.
- 기존 안정성과 낮은 마이그레이션 비용은 Pages Router가 유리하다.
- 두 라우터는 함께 쓸 수 있지만 같은 URL 경로를 중복으로 만들면 안 된다.
- Next.js 16 기준으로 App Router의 request-time API는 비동기로 다뤄야 한다.
- 모든 것을 Client Component로 만들면 App Router의 장점이 크게 줄어든다.

---

## 참고 문서

- [Next.js App Router docs](https://nextjs.org/docs/app)
- [Next.js Pages Router docs](https://nextjs.org/docs/pages)
- [Next.js docs - App Router and Pages Router](https://nextjs.org/docs)
- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js Pages and Layouts](https://nextjs.org/docs/pages/building-your-application/routing/pages-and-layouts)
- [Next.js Version 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Next.js 16 release blog](https://nextjs.org/blog/next-16)
