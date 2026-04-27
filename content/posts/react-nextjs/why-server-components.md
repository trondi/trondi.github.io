---
title: "서버 컴포넌트를 쓰는 이유 — RSC가 해결하는 문제"
date: "2026-04-19"
summary: "React Server Components가 등장한 배경과 클라이언트 컴포넌트와의 차이, 실제로 어떤 기준으로 구분해서 써야 하는지 정리했다."
category: "React / Next.js"
tags:
  - React
  - Server Components
  - RSC
  - Next.js
featured: false
---

# 서버 컴포넌트를 쓰는 이유 — RSC가 해결하는 문제

## 기존 방식의 문제

Next.js App Router 이전의 흐름을 보면:

1. 서버에서 HTML 전송
2. 클라이언트에서 JS 번들 다운로드
3. Hydration — JS가 HTML을 React 컴포넌트로 "되살림"

문제는 **Hydration 비용**이다. 화면에 보이는 모든 컴포넌트의 JS 코드가 클라이언트로 전송되어야 하고, 그 코드가 DOM에 이벤트 리스너를 붙이는 과정이 필요하다. 실제로 상호작용이 없는 컴포넌트(정적 텍스트, 레이아웃, 날짜 표시 등)도 모두 Hydration 대상이 된다.

---

## React Server Components(RSC)란

RSC는 **서버에서만 실행되는 컴포넌트**다. 렌더링 결과가 직렬화된 형태로 클라이언트에 전송되고, 해당 컴포넌트의 JS 코드는 클라이언트 번들에 포함되지 않는다.

```
[Server]                          [Client]
RSC 실행 → 직렬화 데이터 전송 →   화면에 출력 (Hydration 없음)
```

Next.js App Router에서는 `app/` 디렉토리 안의 모든 컴포넌트가 기본적으로 **서버 컴포넌트**다.

---

## RSC가 해결하는 문제 3가지

### 1. 번들 크기 감소

무거운 라이브러리를 서버 컴포넌트에서만 사용하면 클라이언트 번들에서 제외된다.

```tsx
// 서버 컴포넌트 — date-fns가 클라이언트 번들에 포함되지 않음
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export function ArticleDate({ date }: { date: string }) {
  return (
    <time>{format(new Date(date), 'yyyy년 MM월 dd일', { locale: ko })}</time>
  );
}
```

```tsx
// 클라이언트 컴포넌트였다면 date-fns 전체가 번들에 포함됨
'use client';
import { format } from 'date-fns'; // ~70KB
```

### 2. 데이터 패칭 단순화

서버 컴포넌트에서 `async/await`로 직접 DB나 API를 호출할 수 있다. `useEffect` + 로딩 상태 관리가 필요 없다.

```tsx
// 서버 컴포넌트
export async function PostList() {
  // DB 직접 접근 — 클라이언트에서 API 호출할 필요 없음
  const posts = await db.post.findMany({ orderBy: { date: 'desc' } });

  return (
    <ul>
      {posts.map(post => <PostItem key={post.id} post={post} />)}
    </ul>
  );
}
```

```tsx
// 클라이언트 컴포넌트에서 같은 일을 하려면
'use client';
export function PostList() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/posts')
      .then(r => r.json())
      .then(setPosts)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  return <ul>...</ul>;
}
```

서버 컴포넌트 쪽이 코드가 훨씬 단순하고, 클라이언트-서버 왕복(waterfall)도 없다.

### 3. 보안

DB 연결 정보, API 키 등이 서버 컴포넌트 안에서만 사용되면 클라이언트로 노출될 위험이 없다.

```tsx
// 서버 컴포넌트 — 환경변수가 서버에서만 사용됨
const data = await fetch('https://api.example.com/data', {
  headers: { Authorization: `Bearer ${process.env.SECRET_API_KEY}` }
});
```

---

## 클라이언트 컴포넌트는 언제 써야 하나

`'use client'`가 필요한 경우:

| 필요한 기능 | 예시 |
|---|---|
| 이벤트 리스너 | `onClick`, `onChange` |
| React 훅 | `useState`, `useEffect`, `useRef` |
| 브라우저 API | `window`, `localStorage`, `navigator` |
| 실시간 상태 | 폼, 모달, 토글 |

```tsx
'use client';

// 버튼 클릭 — 이벤트 리스너 필요 → 클라이언트 컴포넌트
export function LikeButton({ postId }: { postId: string }) {
  const [liked, setLiked] = useState(false);

  return (
    <button onClick={() => setLiked(!liked)}>
      {liked ? '❤️' : '🤍'} 좋아요
    </button>
  );
}
```

---

## 컴포넌트 경계 설계

서버/클라이언트 컴포넌트를 혼용할 때의 핵심 원칙: **클라이언트 컴포넌트를 트리의 최대한 아래로 내려라.**

```
Page (서버)
  └─ ArticleLayout (서버)
       ├─ ArticleContent (서버)   ← DB에서 데이터 조회
       └─ ArticleActions (클라이언트) ← 좋아요, 공유 버튼만
```

페이지 전체가 클라이언트 컴포넌트가 되면 그 아래 모든 컴포넌트도 클라이언트로 실행된다. 상호작용이 필요한 부분만 클라이언트로 분리하면 나머지는 서버에서 실행할 수 있다.

```tsx
// ❌ 페이지 전체를 클라이언트로 만들면 DB 접근도 클라이언트에서 해야 함
'use client';
export default function ArticlePage() { ... }

// ✅ 상호작용 부분만 클라이언트 컴포넌트로 분리
export default async function ArticlePage({ params }) {
  const article = await getArticle(params.slug); // 서버에서 DB 접근
  return (
    <>
      <ArticleContent article={article} />  {/* 서버 컴포넌트 */}
      <LikeButton postId={article.id} />    {/* 클라이언트 컴포넌트 */}
    </>
  );
}
```

---

## 주의할 점

- 서버 컴포넌트는 **직렬화 가능한 props만** 클라이언트 컴포넌트로 넘길 수 있다. 함수를 props로 전달하려면 클라이언트 컴포넌트끼리 전달해야 한다.
- `'use client'` 경계 위에 있는 컴포넌트는 서버 컴포넌트여도 그 안에서 클라이언트 컴포넌트를 children으로 받을 수 있다.
- `use server`와 Server Actions는 별개 개념이다(폼 제출, 데이터 뮤테이션에 사용).

---

## 정리

RSC는 "클라이언트 번들 최소화 + 서버 리소스 직접 접근 + 코드 단순화"를 동시에 달성한다. 기준은 간단하다 — **상호작용이 없으면 서버 컴포넌트, 있으면 클라이언트 컴포넌트.** 클라이언트 경계는 가능한 한 말단 노드에 두는 것이 좋다.
