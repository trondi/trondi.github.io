---
title: "CSR · SSR · SSG · ISR — 렌더링 전략 완전 비교"
date: "2026-04-19"
summary: "네 가지 렌더링 방식이 언제 HTML을 만들고, 데이터를 어디서 가져오며, 어떤 트레이드오프가 있는지 Next.js 기준으로 정리했다."
category: "React / Next.js"
tags:
  - Next.js
  - CSR
  - SSR
  - SSG
  - ISR
  - React
featured: false
---

# CSR · SSR · SSG · ISR — 렌더링 전략 완전 비교

## 핵심 질문 하나

> "이 페이지의 HTML은 **언제**, **어디서** 만들어지는가?"

이 질문에 대한 답이 렌더링 전략을 구분하는 기준이다.

---

## CSR — Client Side Rendering

브라우저가 빈 HTML을 받은 뒤, JavaScript를 실행해 화면을 그린다.

```
서버 → 빈 HTML + JS 번들 전송
브라우저 → JS 실행 → React 렌더 → API 호출 → 화면 완성
```

```html
<!-- 서버에서 오는 HTML (실제로는 거의 비어 있음) -->
<html>
  <body>
    <div id="root"></div>
    <script src="/bundle.js"></script>
  </body>
</html>
```

**장점:**
- 서버 부담 최소화
- 최초 번들 이후 페이지 전환이 빠름 (SPA)
- 동적 UI에 자유로움

**단점:**
- 초기 로딩 느림 (JS 파싱 + 실행 + API 응답 대기)
- SEO 불리 (크롤러가 빈 HTML을 보게 됨)
- 느린 기기에서 FCP 지연

**적합한 경우:** 로그인 후 대시보드, 관리자 패널, 실시간 업데이트가 많은 앱

---

## SSR — Server Side Rendering

요청이 들어올 때마다 서버에서 HTML을 생성해 전송한다.

```
사용자 요청 → 서버에서 데이터 fetch + HTML 생성 → 완성된 HTML 전송
브라우저 → HTML 즉시 렌더 → JS Hydration
```

```tsx
// Next.js App Router (기본이 SSR)
export default async function Page({ params }: { params: { id: string } }) {
  // 요청마다 실행됨
  const data = await fetch(`https://api.example.com/posts/${params.id}`, {
    cache: 'no-store', // SSR: 캐시 없이 매번 새로 요청
  });
  const post = await data.json();

  return <Article post={post} />;
}
```

**장점:**
- SEO 우수 (완성된 HTML을 크롤러가 받음)
- 항상 최신 데이터
- 초기 페이지 로딩 빠름 (FCP 개선)

**단점:**
- 요청마다 서버 연산 발생 (비용, 응답 속도)
- TTFB(Time To First Byte) 증가 가능
- 서버 필요 (정적 호스팅 불가)

**적합한 경우:** 사용자별 맞춤 콘텐츠, 실시간 재고/가격, 인증이 필요한 페이지

---

## SSG — Static Site Generation

빌드 타임에 HTML을 미리 생성해둔다. 요청이 오면 이미 만들어진 HTML을 그대로 반환한다.

```
빌드 시 → 데이터 fetch + HTML 생성 → 정적 파일로 저장
사용자 요청 → CDN에서 HTML 즉시 반환 (서버 연산 없음)
```

```tsx
// Next.js App Router SSG
export default async function BlogPost({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug); // 빌드 시 한 번만 실행
  return <Article post={post} />;
}

// 정적으로 생성할 경로 목록
export async function generateStaticParams() {
  const posts = await getAllPosts();
  return posts.map((post) => ({ slug: post.slug }));
}
```

**장점:**
- 가장 빠른 응답 (CDN 캐싱)
- 서버 불필요 (Vercel, GitHub Pages, S3 등)
- 보안: DB/API가 빌드 시에만 노출

**단점:**
- 데이터 변경 시 재빌드 필요
- 콘텐츠가 많으면 빌드 시간이 길어짐
- 사용자별 맞춤 콘텐츠 불가

**적합한 경우:** 블로그, 문서 사이트, 마케팅 페이지, 자주 바뀌지 않는 콘텐츠

---

## ISR — Incremental Static Regeneration

SSG의 성능 + SSR의 최신성을 조합. 일정 시간이 지나면 백그라운드에서 페이지를 재생성한다.

```
첫 요청 → 캐시된 HTML 반환 (stale)
캐시 만료 후 첫 요청 → stale HTML 반환 + 백그라운드 재생성 트리거
다음 요청 → 새로 생성된 HTML 반환
```

```tsx
// Next.js fetch에 revalidate 옵션 추가
export default async function Page() {
  const data = await fetch('https://api.example.com/products', {
    next: { revalidate: 3600 }, // 1시간마다 재검증
  });
  const products = await data.json();

  return <ProductList products={products} />;
}
```

```tsx
// 또는 route segment config
export const revalidate = 3600; // 파일 상단에 선언
```

**On-demand Revalidation:** 특정 이벤트(CMS 업데이트 등)에 즉시 재생성 트리거

```ts
// API Route
import { revalidatePath } from 'next/cache';

export async function POST(request: Request) {
  const { slug } = await request.json();
  revalidatePath(`/blog/${slug}`);
  return Response.json({ revalidated: true });
}
```

**장점:**
- SSG 수준의 성능 (캐시 활용)
- 데이터 갱신 주기 설정 가능
- 재빌드 없이 콘텐츠 업데이트

**단점:**
- stale-while-revalidate 패턴이므로 재생성 직후까지 이전 데이터가 보임
- 서버 환경 필요 (완전한 정적 호스팅 불가)

**적합한 경우:** 뉴스 피드, 이커머스 상품 페이지, 주기적으로 업데이트되는 콘텐츠

---

## 비교 요약

```diagram
rendering-strategies
```

| | CSR | SSR | SSG | ISR |
|---|---|---|---|---|
| HTML 생성 시점 | 브라우저에서 | 요청마다 서버 | 빌드 타임 | 빌드 + 주기적 갱신 |
| 초기 로딩 속도 | 느림 | 보통 | 빠름 | 빠름 |
| 데이터 최신성 | 실시간 | 실시간 | 빌드 시 | 설정 주기마다 |
| SEO | 불리 | 우수 | 우수 | 우수 |
| 서버 필요 | ✗ | ✓ | ✗ | ✓ |
| 확장성 | 서버 없음 | 요청 부하 | CDN | CDN |

---

## Next.js App Router에서 전략 선택

App Router에서는 `fetch()` 옵션과 동적 함수 사용 여부로 자동 결정된다.

```tsx
// SSG (기본 — fetch 없거나 force-cache)
fetch(url, { cache: 'force-cache' });

// ISR (시간 기반 재검증)
fetch(url, { next: { revalidate: 60 } });

// SSR (매 요청마다)
fetch(url, { cache: 'no-store' });
// 또는 cookies(), headers() 같은 동적 함수 사용 시 자동으로 SSR
```

---

## 정리

렌더링 전략은 "어느 하나가 정답"이 아니다. 같은 앱 안에서도 페이지마다 다른 전략을 쓸 수 있다.

- **자주 바뀌지 않는 페이지** → SSG
- **콘텐츠 업데이트 주기가 있는 페이지** → ISR
- **항상 최신/개인화된 데이터** → SSR
- **서버 없이 완전 정적 배포** → SSG + CSR (데이터 부분만 클라이언트에서 fetch)
