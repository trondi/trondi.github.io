---
title: "React와 Next.js에서의 동기와 비동기 — useEffect부터 Server Components까지"
date: "2026-05-16"
summary: "React 렌더링이 왜 동기인지부터 useEffect, Suspense, Server Components, Next.js fetch 캐시까지 React 생태계의 비동기 모델을 정리하고 실무에서 자주 만나는 함정을 함께 다룬다."
category: "React / Next.js"
tags:
  - React
  - Next.js
  - Async
  - Suspense
  - Server Components
featured: false
---

# React와 Next.js에서의 동기와 비동기 — useEffect부터 Server Components까지

JavaScript의 동기/비동기를 어느 정도 이해해도, React를 쓰면 곧장 새로운 의문이 생긴다. 렌더 함수 안에서 `await`을 못 쓰는 이유, `useEffect`로 fetch를 하면 두 번 실행되는 이유, Server Components에서는 `async` 컴포넌트가 자연스럽게 동작하는 이유 같은 것들이다.

이 글은 [JavaScript 동기와 비동기 — 이벤트 루프부터 async/await까지](/posts/js-sync-async-basics)의 후속편이다. JS 런타임에서 만들어진 비동기 모델이 React의 렌더링 사이클, Suspense, Server Components, Next.js의 데이터 fetching 위에 어떻게 얹히는지 정리한다.

---

## React 렌더는 동기다

가장 먼저 짚고 갈 점이다. **React의 렌더 함수(컴포넌트 본문)는 동기적으로 실행된다.** 입력으로 props와 state를 받아 가상 DOM(React Element 트리)을 반환하는 순수 함수에 가깝다.

```tsx
function User({ id }: { id: string }) {
  const name = getName(id); // 동기
  return <div>{name}</div>;
}
```

여기서 `await fetchUser(id)` 같은 코드를 쓰고 싶을 수 있다. 하지만 클라이언트 컴포넌트는 `async function`이 될 수 없다. 렌더 함수가 Promise를 반환하면 React는 그것을 자식 트리로 렌더하지 못한다.

이유는 단순하다. React는 **렌더링이 가능한 한 빠르고, 일관되고, 중단/재시도 가능한 동기 계산이어야 한다**고 본다. 같은 입력이면 같은 출력이 나와야 하고, 중간에 비동기 대기가 끼면 그 보장이 깨진다.

그래서 React는 비동기를 렌더 함수 밖으로 밀어낸다. 두 가지 큰 방향이 있다.

- 클라이언트에서: effect(`useEffect`), 이벤트 핸들러, Suspense
- 서버에서: Server Components(`async` 컴포넌트), `use()`, 스트리밍

이 두 방향을 차례로 본다.

---

## useEffect와 비동기

클라이언트 컴포넌트에서 비동기 작업을 다루는 가장 기본적인 도구는 `useEffect`다.

```tsx
function UserView({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch(`/api/users/${id}`)
      .then((r) => r.json())
      .then(setUser);
  }, [id]);

  if (!user) return <div>Loading…</div>;
  return <div>{user.name}</div>;
}
```

`useEffect`는 렌더 결과가 커밋된 뒤 실행된다. 즉 화면이 한 번 그려진 다음에 fetch가 시작된다. 이 “렌더 → 커밋 → effect” 흐름이 React 클라이언트 비동기의 기본 구조다.

### effect 자체는 async 함수가 될 수 없다

`useEffect`의 콜백은 cleanup 함수만 반환할 수 있다. `async` 함수는 항상 Promise를 반환하므로 React가 그 반환값을 cleanup으로 오해한다.

```tsx
// 안 좋음
useEffect(async () => {
  const data = await fetchData();
}, []);

// 좋음
useEffect(() => {
  let cancelled = false;
  (async () => {
    const data = await fetchData();
    if (!cancelled) setData(data);
  })();
  return () => {
    cancelled = true;
  };
}, []);
```

이 패턴이 React 공식 문서에서도 권장된다. 참고: [React — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

### Strict Mode와 두 번 실행되는 effect

개발 모드에서 effect가 두 번 실행되는 것을 본 경험이 있을 것이다. React 18부터 `<React.StrictMode>`는 마운트 시 effect를 일부러 “mount → unmount → mount”로 한 번 더 돌린다. **cleanup을 제대로 하지 않은 effect를 빨리 드러내기 위한 의도**다.

즉 두 번 실행은 버그가 아니라 검사다. 두 번 호출돼도 안전하려면 cleanup이 필요하다.

```tsx
useEffect(() => {
  const ctrl = new AbortController();
  fetch(`/api/users/${id}`, { signal: ctrl.signal })
    .then((r) => r.json())
    .then(setUser)
    .catch((e) => {
      if (e.name !== "AbortError") throw e;
    });
  return () => ctrl.abort();
}, [id]);
```

이 구조면 `id`가 빠르게 바뀌어도 이전 요청이 취소되고, race condition도 함께 해결된다.

### effect에서 race condition 막기

`AbortController`를 못 쓰는 환경(예: 일부 RPC 클라이언트)에서는 “이 요청이 가장 최근인가”를 검사한다.

```tsx
useEffect(() => {
  let active = true;
  fetchUser(id).then((u) => {
    if (active) setUser(u);
  });
  return () => {
    active = false;
  };
}, [id]);
```

`useEffect`에서 fetch를 직접 다룰 때는 이 두 가지 — cleanup과 race 가드 — 가 거의 항상 필요하다. 그래서 실무에서는 보통 [SWR](https://swr.vercel.app/)이나 [TanStack Query](https://tanstack.com/query) 같은 라이브러리에 위임한다.

---

## 이벤트 핸들러의 비동기는 자유롭다

`useEffect`와 달리, 이벤트 핸들러는 그냥 `async`를 써도 된다.

```tsx
async function onSubmit() {
  setLoading(true);
  try {
    await saveForm(values);
    showToast("저장됨");
  } catch (e) {
    showToast("실패");
  } finally {
    setLoading(false);
  }
}
```

이벤트 핸들러는 React의 렌더 흐름이 아니라 사용자 상호작용에서 시작된다. Promise를 반환해도 React 트리에는 영향을 주지 않는다. 따라서 “렌더는 동기, 이벤트는 비동기 자유”라는 구분이 자연스럽다.

다만 핸들러가 비동기인 동안 화면 상태를 명시적으로 관리해야 한다. 로딩 표시, 버튼 disable, 중복 제출 방지 같은 것은 결국 상태로 표현된다.

---

## Suspense와 use()

React는 비동기 데이터를 렌더 트리에 더 자연스럽게 끼워 넣기 위해 Suspense를 도입했다. Suspense는 자식이 “아직 준비 안 됨”을 던지면 그 자리를 fallback으로 채운다.

```tsx
<Suspense fallback={<Skeleton />}>
  <UserView id={id} />
</Suspense>
```

이 모델 위에서 React 19의 `use()` 훅은 Promise를 그대로 unwrap할 수 있게 해 준다.

```tsx
function UserView({ id }: { id: string }) {
  const user = use(fetchUser(id));
  return <div>{user.name}</div>;
}
```

`use(promise)`는 Promise가 settled되기 전이면 컴포넌트를 “일시 중단”시키고, 가장 가까운 Suspense의 fallback이 보이게 한다. resolve되면 그 값을 들고 다시 렌더된다.

이 구조는 콜백/effect를 거치지 않고도 “렌더 → 데이터 대기 → 다시 렌더”를 React가 직접 다룰 수 있게 해 준다. 다만 클라이언트에서 `use(fetch(...))`를 그냥 쓰면 매 렌더마다 새 Promise가 만들어지므로, **캐싱이 있는 Promise**를 넘겨야 한다. 보통은 데이터 라이브러리나 Server Components가 그 역할을 한다.

참고: [React — `use`](https://react.dev/reference/react/use), [React — Suspense](https://react.dev/reference/react/Suspense)

---

## Server Components — async 컴포넌트가 가능한 이유

App Router의 Server Components(RSC)에서는 컴포넌트 자체가 `async`일 수 있다.

```tsx
// app/users/[id]/page.tsx
export default async function Page({ params }: { params: { id: string } }) {
  const user = await fetchUser(params.id);
  return <div>{user.name}</div>;
}
```

클라이언트 컴포넌트에서는 못 하던 일이다. 차이가 어디서 오는지 보면 React의 동기/비동기 모델이 더 선명해진다.

Server Components는 서버에서 한 번 실행되고, 그 결과(직렬화 가능한 React 트리)가 클라이언트로 스트리밍된다. **서버는 컴포넌트가 Promise를 반환해도 자연스럽게 기다릴 수 있다.** 클라이언트는 그 결과 트리를 받아 hydrate만 하면 되므로, 비동기 렌더가 문제가 되지 않는다.

다시 말하면 RSC는 렌더 자체를 비동기로 만들지 않는다. **렌더의 “데이터 준비 단계”를 서버 쪽으로 옮긴다**는 표현이 더 정확하다. 클라이언트의 렌더는 여전히 동기다.

Next.js 공식 문서도 Server Components를 “서버에서 fetch와 렌더를 함께 처리하고, 결과를 클라이언트로 보내는 모델”로 설명한다. 참고: [Next.js — Server Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)

---

## 'use client'와 비동기 경계

App Router에서 `'use client'`는 “여기서부터 클라이언트 컴포넌트”라는 경계다. 이 경계 위쪽(서버)에서는 `async` 컴포넌트와 `await fetch`가 자유롭지만, 경계 아래(클라이언트)에서는 다시 `useEffect`/`useState`/`use()` 같은 클라이언트 비동기 도구로 돌아간다.

```tsx
// app/page.tsx (Server Component)
import UserPanel from "./user-panel";

export default async function Page() {
  const users = await fetchUsers();
  return <UserPanel users={users} />;
}

// app/user-panel.tsx
"use client";

export default function UserPanel({ users }) {
  const [selected, setSelected] = useState<string | null>(null);
  // 이벤트 핸들러, useEffect, useState 자유
}
```

이 구조에서 “서버에서 미리 fetch한 데이터”와 “클라이언트에서 상호작용으로 변하는 상태”가 자연스럽게 분리된다. 가능한 한 fetch는 서버로 올리고, 클라이언트에는 상호작용에 필요한 최소한만 두는 것이 RSC의 기본 사용법이다.

---

## Next.js fetch 캐시와 데이터 fetching

Next.js App Router는 `fetch`를 확장한다. 서버 컴포넌트 안에서 `fetch`를 호출하면 기본적으로 캐시 가능한 요청이 된다.

```tsx
const res = await fetch("https://api.example.com/users", {
  next: { revalidate: 60 }, // 60초마다 재검증
});
```

옵션에 따라 동작이 달라진다.

| 옵션 | 동작 |
|---|---|
| 기본값(앱 라우터 fetch) | 정적 빌드 시 캐시, 요청 단위 메모이제이션 |
| `cache: "no-store"` | 매 요청마다 fetch (동적) |
| `next: { revalidate: N }` | ISR 스타일 재검증 |
| `next: { tags: [...] }` | `revalidateTag`로 무효화 가능 |

여기서 중요한 점은 “이 fetch는 같은 렌더 트리 안에서 중복 호출돼도 한 번만 나간다”는 것이다. App Router는 동일 URL과 옵션을 가진 fetch 호출을 자동으로 메모이제이션한다. 그래서 여러 컴포넌트에서 같은 데이터를 따로 부르도록 코드를 짜도 네트워크 비용이 늘지 않는다.

참고: [Next.js — fetch](https://nextjs.org/docs/app/api-reference/functions/fetch), [Next.js — Data fetching, caching, and revalidating](https://nextjs.org/docs/app/getting-started/fetching-data)

이 모델은 클라이언트의 SWR/React Query가 하던 “요청 키 기반 캐시”를 서버 쪽으로 옮긴 것에 가깝다. 즉 **클라이언트 비동기의 흔한 문제(중복 호출, race condition, 무효화)를 서버 캐시 계층이 대신 다룬다**.

---

## 스트리밍과 Suspense의 만남

App Router에서는 Suspense를 서버 컴포넌트 트리에 직접 둘 수 있다. 그러면 트리의 일부를 먼저 보내고, 나머지는 준비되는 대로 스트리밍한다.

```tsx
// app/dashboard/page.tsx
export default function Page() {
  return (
    <>
      <Header />
      <Suspense fallback={<Skeleton />}>
        <RevenueChart />
      </Suspense>
      <Suspense fallback={<Skeleton />}>
        <RecentOrders />
      </Suspense>
    </>
  );
}
```

`RevenueChart`와 `RecentOrders`가 각각 비동기 fetch를 하더라도, 헤더는 즉시 응답에 실리고 두 패널은 각자 준비되는 대로 채워진다.

브라우저 시점에서는 “HTML이 한꺼번에 오는” 게 아니라 “스트림으로 조각조각 도착”한다. 사용자는 첫 페인트가 빨라지고, 느린 데이터가 전체를 막지 않는다.

이 흐름은 결국 1편에서 본 이벤트 루프 모델 위에 다음 한 줄이 더해진 것이다. **“완성된 트리를 한 번에 응답하지 않고, 비동기로 준비되는 조각을 그때그때 흘려보낸다.”** 마이크로태스크 큐 위에서 끝나는 단일 컴포넌트의 비동기가, 페이지 단위에서 “스트리밍”이라는 형태로 다시 나타난다.

참고: [Next.js — Streaming](https://nextjs.org/docs/app/getting-started/linking-and-navigating#streaming)

---

## Server Actions — 클라이언트에서 호출하는 비동기 서버 함수

App Router의 Server Actions는 클라이언트 컴포넌트에서 `await`으로 호출할 수 있는 서버 함수다.

```tsx
// app/actions.ts
"use server";

export async function saveUser(formData: FormData) {
  const name = formData.get("name");
  await db.user.update({ name });
}

// app/form.tsx
"use client";
import { saveUser } from "./actions";

export default function Form() {
  return <form action={saveUser}>...</form>;
}
```

내부적으로는 HTTP 호출이지만, 코드에서는 단순한 비동기 함수처럼 보인다. 사용자가 직접 `fetch`를 호출하지 않아도 되고, 응답 처리도 `await` 한 줄로 끝난다.

여기서 중요한 비동기 관점은 두 가지다.

- 호출자는 어디까지나 클라이언트이고, 함수 본문은 서버에서 실행된다. 즉 “보이지 않는 네트워크 왕복”이 한 번 끼어 있다.
- 작업이 끝난 뒤 캐시 무효화(`revalidatePath`, `revalidateTag`)나 redirect를 함께 처리하면, 서버 데이터와 클라이언트 화면의 동기화가 자연스러워진다.

참고: [Next.js — Server Actions and Mutations](https://nextjs.org/docs/app/getting-started/updating-data)

---

## 데이터 fetching 라이브러리는 어디에 쓰는가

SWR, TanStack Query 같은 라이브러리는 클라이언트의 비동기 데이터를 관리하기 위한 도구다. 핵심 기능은 거의 비슷하다.

- 키 기반 캐시
- 백그라운드 재검증
- 요청 취소와 중복 제거
- 낙관적 업데이트

```tsx
import useSWR from "swr";

function UserView({ id }) {
  const { data: user, error, isLoading } = useSWR(`/api/users/${id}`, fetcher);
  if (isLoading) return <Skeleton />;
  if (error) return <ErrorBox />;
  return <div>{user.name}</div>;
}
```

App Router에서는 fetch가 이미 서버에서 캐시되므로 “서버에서 한 번 fetch한 데이터”는 RSC가 다루고, “클라이언트 상호작용으로 자주 갱신되는 데이터”는 SWR/React Query 같은 도구에 위임하는 식의 분업이 자연스럽다.

말하자면 비동기 데이터의 책임이 두 군데로 나뉜다.

- 서버: 최초 로딩, 캐시, 재검증, 스트리밍
- 클라이언트: 사용자 상호작용 이후의 변경, mutation, 낙관적 업데이트

---

## 실무에서 자주 만나는 함정

### 1. RSC와 클라이언트 컴포넌트의 경계 혼동

Server Components 안에서 `useState`, `useEffect`, 이벤트 핸들러는 못 쓴다. 반대로 클라이언트 컴포넌트에서는 `async function Component()`로 만들 수 없다. 경계가 흐려지면 빌드 에러나 런타임 에러가 난다.

규칙으로 단순화하면 다음과 같다.

- 서버에서 데이터를 받고 화면을 그리기만 하는 컴포넌트 → 서버 컴포넌트 (`async` 가능)
- 클릭, 입력, 로컬 상태가 필요한 컴포넌트 → 클라이언트 컴포넌트 (`useEffect`/`useState`)

### 2. effect에서 무한 루프

`useEffect`의 의존성 배열에 매 렌더마다 새로 만들어지는 객체나 배열을 그대로 넣으면 무한 루프가 난다.

```tsx
useEffect(() => {
  fetchData(filters).then(setData);
}, [{ ...filters }]); // 매번 새 객체 → 매번 effect 실행
```

JS 비동기와는 다른 결의 문제지만, 결국 “언제 effect가 다시 돈다고 React가 판단하는가”라는 동기 흐름의 문제다. 의존성에는 직접 비교 가능한 값(원시 타입, 안정된 참조)만 넣어야 한다.

### 3. fetch의 캐시 옵션을 모르고 쓰기

App Router의 `fetch`는 기본 캐시 동작이 있다. 빌드 시점에 정적으로 잡힌 데이터를 매 요청마다 새로 받고 싶다면 `cache: "no-store"`나 `revalidate` 옵션을 명시해야 한다. 반대로 자주 바뀌지 않는 데이터에 매번 동적 옵션을 주면 캐시의 이점을 잃는다.

“이 데이터가 얼마나 자주 바뀌는가”를 의식해서 옵션을 정해야 한다.

### 4. Suspense fallback이 너무 자주 보이는 문제

Suspense 안에서 데이터를 다시 fetch할 때 매번 fallback으로 돌아가면 화면이 깜빡인다. React 18+의 `useTransition`이나 데이터 라이브러리의 `keepPreviousData` 옵션으로 이전 결과를 유지한 채 새 데이터를 가져올 수 있다.

```tsx
const [isPending, startTransition] = useTransition();

function onChange(next) {
  startTransition(() => setFilter(next));
}
```

이 패턴이 “보이는 화면은 그대로, 비동기 작업은 백그라운드” 같은 UX를 가능하게 한다.

### 5. Server Actions에서 캐시 무효화 누락

Server Action으로 데이터를 바꿨는데 화면은 그대로인 경우, 대부분 `revalidatePath`나 `revalidateTag` 호출이 빠진 것이다. 서버 데이터의 진실은 서버 캐시에 있고, 그것이 무효화되지 않으면 RSC는 이전 결과를 그대로 보여준다.

```ts
"use server";
export async function deletePost(id: string) {
  await db.post.delete({ id });
  revalidatePath("/posts");
}
```

---

## 한 줄로 요약하는 비동기 관점의 React/Next.js

- 클라이언트 컴포넌트의 렌더는 동기다. 비동기는 effect, 이벤트 핸들러, Suspense로 빠진다.
- Server Components는 `async`가 가능하지만, 이는 “서버에서 데이터 준비를 마치고 결과만 보낸다”는 의미지 클라이언트 렌더가 비동기가 됐다는 뜻이 아니다.
- Suspense + `use()`는 비동기 데이터를 트리 안에서 다루기 위한 React 자체 모델이다.
- Next.js의 fetch 캐시와 스트리밍은 서버 측 비동기 처리를 추상화한 계층이고, 클라이언트의 SWR/React Query와 책임이 다르다.
- 결국 모든 비동기는 1편에서 본 이벤트 루프 위에서 돌아간다. React/Next.js는 그 위에 “언제 다시 렌더할지”, “어디서 fetch할지”, “결과를 어떻게 스트리밍할지”를 더한 추상이다.

비동기를 “언제 어디서 일어나는가”와 “어떤 경계에서 결과를 화면에 반영하는가”로 나눠 보는 습관이 들면, React와 Next.js의 새로운 API들도 같은 모델의 변주로 읽힌다.

이전 글: [JavaScript 동기와 비동기 — 이벤트 루프부터 async/await까지](/posts/js-sync-async-basics)

---

## 참고 문서

- [React — You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [React — Suspense](https://react.dev/reference/react/Suspense)
- [React — `use`](https://react.dev/reference/react/use)
- [Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js — fetch](https://nextjs.org/docs/app/api-reference/functions/fetch)
- [Next.js — Data fetching, caching, and revalidating](https://nextjs.org/docs/app/getting-started/fetching-data)
- [Next.js — Server Actions and Mutations](https://nextjs.org/docs/app/getting-started/updating-data)
- [Next.js — Streaming](https://nextjs.org/docs/app/getting-started/linking-and-navigating#streaming)
