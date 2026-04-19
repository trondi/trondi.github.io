---
title: "URL을 상태로 쓰는 패턴 — searchParams로 필터·페이지네이션 관리하기"
date: "2026-04-19"
summary: "필터, 정렬, 페이지네이션 같은 UI 상태를 useState 대신 URL searchParams에 저장하면 뭐가 좋은지, Next.js App Router 기준으로 구체적인 패턴을 정리했다."
category: "Frontend"
tags:
  - Next.js
  - URL State
  - searchParams
  - UX
featured: false
---

# URL을 상태로 쓰는 패턴

검색 필터를 적용하고 뒤로 가기를 눌렀을 때 필터가 초기화되는 경험이 있다. 또는 특정 필터 조합을 다른 사람에게 공유하고 싶은데 URL이 달라지지 않아 불가능한 경우도 있다. 이 문제의 해결책은 UI 상태를 URL에 저장하는 것이다.

---

## useState vs URL State

```tsx
// useState — 브라우저 메모리에만 존재
const [category, setCategory] = useState('all');
const [page, setPage] = useState(1);

// URL State — URL에 저장
// /posts?category=react&page=2
```

URL에 저장하면 얻는 것들:

- **공유 가능** — URL만 보내면 같은 상태 재현
- **뒤로 가기 동작** — 브라우저 히스토리에 상태 변화가 기록됨
- **새로고침 유지** — 페이지 리로드 후에도 상태 보존
- **서버 렌더링** — 서버에서 searchParams를 읽어 초기 데이터 fetch 가능

---

## Next.js App Router에서 searchParams 읽기

### 서버 컴포넌트

```tsx
// app/posts/page.tsx
interface SearchParams {
  category?: string;
  tag?: string;
  page?: string;
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { category = 'all', tag, page = '1' } = await searchParams;

  const posts = await getPosts({
    category,
    tag,
    page: Number(page),
  });

  return <PostList posts={posts} />;
}
```

서버 컴포넌트에서 `searchParams`를 직접 받을 수 있다. URL이 바뀌면 서버에서 다시 데이터를 fetch한다. `useState`가 필요 없다.

### 클라이언트 컴포넌트

```tsx
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export function CategoryFilter({ categories }: { categories: string[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentCategory = searchParams.get('category') ?? 'all';

  function setCategory(category: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (category === 'all') {
      params.delete('category');
    } else {
      params.set('category', category);
    }

    // 필터 변경 시 페이지는 1로 초기화
    params.delete('page');

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div>
      {categories.map((category) => (
        <button
          key={category}
          onClick={() => setCategory(category)}
          aria-pressed={currentCategory === category}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
```

---

## URL 업데이트 — push vs replace

```tsx
// push: 히스토리에 추가 (뒤로 가기로 이전 상태로 돌아갈 수 있음)
router.push(`${pathname}?${params.toString()}`);

// replace: 현재 히스토리 항목 교체 (뒤로 가기에 기록 안 남김)
router.replace(`${pathname}?${params.toString()}`);
```

**필터/정렬 변경** — 매번 히스토리를 쌓으면 뒤로 가기를 여러 번 눌러야 해서 불편하다. `replace`가 적합하다.

**페이지 이동** — 이전 페이지로 돌아가는 것이 의미 있다. `push`가 적합하다.

---

## 공통 유틸 — searchParams 조작 헬퍼

```tsx
// hooks/useUrlState.ts
'use client';

import { useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export function useUrlState() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const setParam = useCallback(
    (key: string, value: string | null, replace = true) => {
      const params = new URLSearchParams(searchParams.toString());

      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }

      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      if (replace) {
        router.replace(url);
      } else {
        router.push(url);
      }
    },
    [searchParams, router, pathname],
  );

  const setParams = useCallback(
    (updates: Record<string, string | null>, replace = true) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }

      const query = params.toString();
      const url = query ? `${pathname}?${query}` : pathname;

      if (replace) {
        router.replace(url);
      } else {
        router.push(url);
      }
    },
    [searchParams, router, pathname],
  );

  return { searchParams, setParam, setParams };
}
```

```tsx
// 사용
function Filters() {
  const { searchParams, setParam, setParams } = useUrlState();

  return (
    <>
      <select onChange={(e) => setParam('category', e.target.value)}>
        {/* ... */}
      </select>

      <button
        onClick={() => setParams({ category: null, tag: null, page: null })}
      >
        필터 초기화
      </button>
    </>
  );
}
```

---

## 페이지네이션

```tsx
// app/posts/page.tsx
export default async function PostsPage({ searchParams }) {
  const { page = '1' } = await searchParams;
  const currentPage = Math.max(1, Number(page));

  const { posts, totalPages } = await getPosts({ page: currentPage });

  return (
    <>
      <PostList posts={posts} />
      <Pagination currentPage={currentPage} totalPages={totalPages} />
    </>
  );
}
```

```tsx
// components/Pagination.tsx
'use client';

import { useUrlState } from '@/hooks/useUrlState';

export function Pagination({ currentPage, totalPages }) {
  const { setParam } = useUrlState();

  return (
    <nav>
      <button
        disabled={currentPage <= 1}
        onClick={() => setParam('page', String(currentPage - 1), false)} // push
      >
        이전
      </button>

      <span>{currentPage} / {totalPages}</span>

      <button
        disabled={currentPage >= totalPages}
        onClick={() => setParam('page', String(currentPage + 1), false)} // push
      >
        다음
      </button>
    </nav>
  );
}
```

---

## 언제 URL State가 아닌 useState를 쓰는가

URL에 모든 것을 넣을 필요는 없다.

| useState가 맞는 경우 | URL State가 맞는 경우 |
|---|---|
| 토글, 팝업, 호버 같은 일시적 UI | 필터, 정렬, 검색어 |
| 입력 중인 폼 값 | 페이지 번호 |
| 공유할 필요 없는 상태 | 공유/북마크가 필요한 상태 |
| 새로고침에 보존할 필요 없음 | 새로고침에 보존되어야 함 |
