---
title: "낙관적 업데이트(Optimistic UI)를 구현하면 차례로 만나는 문제들"
date: "2026-04-19"
summary: "응답을 기다리지 않고 화면부터 바꾸는 낙관적 업데이트를 가장 단순한 구현에서 출발해, 다른 화면과의 동기화·refetch 경합·롤백·서버 값 재동기화·연타·여러 캐시·실시간 푸시·임시 ID 문제를 하나씩 풀어 가며 정리했다. React Query, React 19 useOptimistic, Next.js Server Actions 기준."
category: "Frontend"
tags:
  - UX
  - Optimistic UI
  - React
  - React Query
  - Next.js
featured: false
---

# 낙관적 업데이트(Optimistic UI)

아래 두 버튼은 똑같은 서버에 똑같은 저장 요청을 보낸다. 다른 점은 화면을 언제 바꾸느냐 하나다. 응답 지연을 1초 넘게 올리고 두 버튼을 번갈아 눌러 보자.

```diagram
optimistic-vs-waiting
```

왼쪽은 서버가 저장했다고 답해야 버튼을 바꾼다. 오른쪽은 누르는 즉시 버튼을 바꾸고 요청은 그 뒤에 보낸다. 오른쪽처럼 요청이 성공할 거라고 가정하고 화면부터 바꾸는 방식이 낙관적 업데이트다. "요청 실패시키기"를 켜고 오른쪽을 누르면 버튼이 바뀌었다가 원래대로 돌아온다. 틀렸을 때 되돌리는 것까지가 낙관적 업데이트의 일이다.

이 글의 데모는 모두 실제 React Query(TanStack Query v5)로 돌아간다. 서버만 지연과 실패를 흉내 내는 가짜다.

왼쪽 방식이 정직해 보이지만, 북마크나 좋아요처럼 거의 항상 성공하는 요청에서 매번 사용자를 기다리게 할 이유는 없다.

기다림이 얼마나 짧아야 하는지에는 오래된 기준이 있다. Jakob Nielsen은 응답 시간의 한계를 세 구간으로 나눴고, 그 첫 구간을 0.1초로 잡았다.

> **0.1 second** is about the limit for having the user feel that the system is reacting instantaneously.
>
> **0.1초**는 사용자가 시스템이 즉시 반응한다고 느끼는 대략적인 한계다.
>
> (Jakob Nielsen, *Response Times: The 3 Important Limits*)

API 한 번 왕복이 이 선을 넘기는 건 흔한 일이다. 화면 갱신을 응답에 묶어 두면 그 지연이 클릭할 때마다 고스란히 드러난다. 위 데모의 "클릭 후 화면 반영" 숫자가 그 차이다.

아이디어는 단순한데 구현은 그렇지 않다. 먼저 그린 값은 서버가 확인해 준 값이 아니다. 그래서 다른 요청이 그 값을 덮어쓰거나, 서버가 요청을 거절하거나, 서버 값이 이미 달라져 있을 수 있다. 이 글은 가장 단순한 구현에서 출발해서 이런 문제가 하나씩 터질 때마다 해결책을 더해 간다.

| 단계 | 터지는 문제 | 해결 |
|---|---|---|
| 0 | (출발점) 화면부터 바꾸고 싶다 | 로컬 state에 이전 값 저장 → 실패 시 복원 |
| 1 | 다른 화면은 여전히 옛 값을 보여준다 | React Query 캐시 + `setQueryData` |
| 2 | 이미 출발한 refetch가 먼저 그린 값을 덮어쓴다 | `cancelQueries` |
| 3 | 실패하면 되돌려야 한다 | `onMutate`가 스냅샷 반환 → `onError`에서 복원, 또는 `variables`·`useOptimistic` |
| 4 | 먼저 그린 값은 추정치다 | `onSettled`에서 무효화, `revalidatePath` |
| 5 | 연타하면 요청이 겹치고 순서가 뒤바뀐다 | `isMutating`, 멱등 API |
| 6 | 같은 글이 목록과 상세에 따로 캐시돼 있다 | `setQueriesData`, 무한 스크롤 `pages` |
| 7 | 실시간 푸시가 먼저 그린 값을 덮어쓴다 | 진행 중이면 보류, 최종 값만 푸시 |
| 8 | ID를 서버가 만든다 | 임시 ID와 안정적인 `key` |

예시는 게시글의 **북마크** 버튼 하나로 끝까지 간다. 누르면 저장 상태가 바뀌고, 옆에 저장한 사람 수가 붙는다.

```ts
type Post = { id: string; title: string; bookmarked: boolean; bookmarkCount: number };
```

---

## 0. 출발점: 로컬 state로 먼저 그리기

라이브러리 없이 가장 먼저 떠오르는 구현은 이렇다.

```tsx
function BookmarkButton({ post }: { post: Post }) {
  const [bookmarked, setBookmarked] = useState(post.bookmarked);
  const [count, setCount] = useState(post.bookmarkCount);

  async function handleClick() {
    // 실패하면 돌아갈 값
    const prev = { bookmarked, count };
    const next = !bookmarked;

    // 응답을 기다리지 않고 화면부터
    setBookmarked(next);
    setCount((c) => c + (next ? 1 : -1));

    try {
      await api.setBookmark(post.id, next);
    } catch {
      setBookmarked(prev.bookmarked);
      setCount(prev.count);
      toast.error('저장하지 못했습니다. 다시 시도해 주세요.');
    }
  }

  return (
    <button onClick={handleClick} aria-pressed={bookmarked}>
      {bookmarked ? '저장됨' : '저장'} {count}
    </button>
  );
}
```

요점은 화면을 바꾸기 **전에** 돌아갈 값을 챙겨 두는 것이다. 이 구조는 끝까지 바뀌지 않는다. 이후 단계는 전부 "어디에 저장하고, 언제 되돌리고, 언제 서버 값으로 맞추느냐"를 다듬는 과정이다.

API가 `toggleBookmark(id)`가 아니라 `setBookmark(id, next)`인 데는 이유가 있는데, 5단계에서 다시 나온다.

---

## 1. 다른 화면은 여전히 옛 값을 보여준다

같은 글이 피드 카드와 상세 패널에 동시에 떠 있다고 하자. 상세 패널에서 저장을 누르면 그 버튼의 state만 바뀐다. 피드 카드는 자기 state를 따로 들고 있으니 여전히 "저장"이다.

화면마다 state를 따로 들고 있는 게 문제다. 같은 서버 데이터를 한 곳에 두고 모두가 그걸 읽어야 한다. 이 역할을 하는 게 React Query(TanStack Query) 같은 서버 상태 라이브러리다.

React Query는 낙관적 업데이트를 위해 만든 도구가 아니다. 서버 상태를 하나의 캐시로 관리하고, 낡으면 다시 받아오는 게 본업이다. 그런데 이 두 기능(중앙 캐시, 무효화)이 낙관적 업데이트에 필요한 것과 정확히 겹친다. 캐시 한 곳을 고치면 그 값을 읽는 모든 화면이 함께 바뀌고, 서버 값과 다시 맞출 때는 원래 있던 `invalidateQueries`를 쓰면 된다.

쿼리 키는 처음부터 한곳에 모아 둔다. 6단계에서 목록이 끼어들 때 이 구조가 필요해진다.

```ts
const postKeys = {
  all: ['posts'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  detail: (id: string) => [...postKeys.all, 'detail', id] as const,
};
```

로컬 state 대신 캐시를 고치도록 바꾸면 이렇게 된다.

```tsx
function useSetBookmark(postId: string) {
  const queryClient = useQueryClient();
  const queryKey = postKeys.detail(postId);

  return useMutation({
    mutationFn: (next: boolean) => api.setBookmark(postId, next),
    onMutate: (next) => {
      queryClient.setQueryData<Post>(queryKey, (old) =>
        old && { ...old, bookmarked: next, bookmarkCount: old.bookmarkCount + (next ? 1 : -1) },
      );
    },
  });
}
```

`onMutate`는 `mutationFn`보다 먼저 실행된다. 여기서 캐시를 고치면 요청이 출발하기 전에 화면이 이미 바뀌어 있다. 이 버전은 아직 실패 처리도 없고, 다음 단계의 문제도 그대로 안고 있다.

---

## 2. 이미 출발한 refetch가 먼저 그린 값을 덮어쓴다

React Query는 여러 계기로 데이터를 다시 받아온다. 창에 포커스가 돌아올 때(`refetchOnWindowFocus`), 폴링 주기(`refetchInterval`)가 돌아올 때, 다른 mutation이 무효화를 걸었을 때다. 이런 refetch가 클릭 직전에 출발해 있었다면 이런 일이 생긴다.

```
t0  GET /posts/7 출발              (서버 기준: 저장 안 됨, 41명)
t1  사용자가 저장 클릭 → 캐시: 저장됨, 42
t2  t0의 응답 도착 → 캐시: 저장 안 됨, 41   ← 먼저 그린 값이 덮임
t3  저장 요청 성공 → 다시 받아오면 저장됨, 42
```

사용자 눈에는 버튼이 "저장됨 → 저장 → 저장됨"으로 깜빡인다. t0의 요청은 클릭보다 먼저 출발했으니 그 응답에는 클릭이 반영돼 있을 수 없다.

그래서 캐시를 고치기 전에 그 키로 진행 중인 쿼리를 먼저 취소한다.

```tsx
onMutate: async (next) => {
  await queryClient.cancelQueries({ queryKey });
  queryClient.setQueryData<Post>(queryKey, /* ... */);
},
```

취소된 쿼리의 결과는 캐시에 쓰이지 않는다. `queryFn`이 받은 `signal`을 `fetch`에 넘기고 있다면 네트워크 요청 자체도 끊긴다. `cancelQueries`는 Promise를 돌려주므로 `onMutate`를 `async`로 만들고 `await`한다.

직접 확인해 보자. 처음에는 체크박스를 끈 채로 누르고, 다음에는 켜고 다시 눌러 보자.

```diagram
optimistic-refetch-race
```

끈 상태에서는 빨간 칩이 하나 끼어든다. 클릭보다 먼저 출발한 refetch의 응답이 먼저 그린 값을 덮은 순간이다. 켜면 그 refetch가 "취소됨"으로 끝나고, 캐시에는 먼저 그린 값과 서버 값만 남는다.

---

## 3. 실패하면 되돌려야 한다

서버가 거절하거나 네트워크가 끊기면 먼저 그린 값은 틀린 값이 된다. 되돌릴 값이 필요하다.

### 스냅샷을 onMutate의 반환값으로 넘기기

캐시를 고치기 직전에 현재 값을 꺼내 두고, `onMutate`의 반환값으로 넘긴다.

```tsx
onMutate: async (next) => {
  await queryClient.cancelQueries({ queryKey });
  const previous = queryClient.getQueryData<Post>(queryKey);
  queryClient.setQueryData<Post>(queryKey, /* ... */);
  return { previous };
},
onError: (_error, _next, onMutateResult) => {
  if (onMutateResult?.previous) {
    queryClient.setQueryData(queryKey, onMutateResult.previous);
  }
  toast.error('저장하지 못했습니다. 다시 시도해 주세요.');
},
```

`onMutate`가 반환한 값은 `onError`·`onSuccess`의 세 번째 인자, `onSettled`의 네 번째 인자로 들어온다. 예전 문서와 예제에서는 이 인자를 `context`라고 불렀다. 최근 v5에서는 이름이 `onMutateResult`로 바뀌었고, `context`는 `client` 등을 담은 별도의 마지막 인자가 됐다. 이 글은 새 이름을 쓴다.

스냅샷을 컴포넌트 state나 바깥 변수에 두지 않는 게 핵심이다. React Query가 mutation 실행 하나하나에 반환값을 따로 붙여 두기 때문에, 요청이 여러 개 겹쳐도 각자 자기가 찍은 스냅샷으로 돌아간다.

### 아예 되돌릴 필요가 없게 만들기: `variables` (v5)

캐시를 건드리지 않는 방법도 있다. 요청이 진행 중인 동안 `useMutation`이 들고 있는 `variables`를 화면에 그리는 것이다.

```tsx
function BookmarkButton({ postId }: { postId: string }) {
  const queryClient = useQueryClient();
  const { data: post } = useQuery({ queryKey: postKeys.detail(postId), queryFn: () => api.getPost(postId) });

  const { mutate, variables, isPending } = useMutation({
    mutationFn: (next: boolean) => api.setBookmark(postId, next),
    // Promise를 반환해야 다시 받아오는 동안에도 isPending이 유지된다
    onSettled: () => queryClient.invalidateQueries({ queryKey: postKeys.detail(postId) }),
  });

  if (!post) return null;

  const bookmarked = isPending ? variables : post.bookmarked;
  const count = isPending && variables !== post.bookmarked
    ? post.bookmarkCount + (variables ? 1 : -1)
    : post.bookmarkCount;

  return (
    <button onClick={() => mutate(!bookmarked)} aria-pressed={bookmarked}>
      {bookmarked ? '저장됨' : '저장'} {count}
    </button>
  );
}
```

캐시는 처음부터 바뀐 적이 없다. 실패하면 `isPending`이 false로 돌아가고 원래 캐시 값이 그대로 보인다. 롤백 코드가 없어도 구조상 롤백이 된다.

`onSettled`에서 `invalidateQueries`의 Promise를 반환하는 것도 중요하다. 그러면 새 값을 받아올 때까지 mutation이 pending 상태로 남는다. 반환하지 않으면 요청이 끝나는 순간 `isPending`이 false가 되고, 새 값이 도착하기 전까지 잠깐 옛 캐시 값이 보인다.

대신 반영 범위가 이 컴포넌트로 좁다. 다른 화면에서도 진행 중인 값을 보여주려면 `useMutationState`로 같은 `mutationKey`의 `variables`를 꺼내 써야 한다. 그런 곳이 여러 군데면 캐시를 고치는 쪽이 더 단순하다.

| | 캐시 수정 (`onMutate`) | 화면에서만 반영 (`variables`) |
|---|---|---|
| 반영 범위 | 같은 쿼리를 읽는 모든 컴포넌트 | 해당 컴포넌트 (+ `useMutationState`) |
| 롤백 | 직접 구현 (스냅샷 → 복원) | 필요 없음 |
| 코드량 | 많음 | 적음 |
| 맞는 상황 | 같은 데이터가 여러 화면에 보일 때 | 버튼·체크박스처럼 한 곳에서 끝날 때 |

### React 19의 useOptimistic

React 19의 `useOptimistic`도 `variables`와 같은 사고방식이다. 원본 값은 그대로 두고, transition이 진행되는 동안에만 낙관적 값을 덧씌운다.

```tsx
import { useOptimistic, useTransition } from 'react';

function TodoList({ todos }: { todos: Todo[] }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo: Todo) => [...state, newTodo], // 낙관적 업데이트 로직
  );

  async function handleAdd(text: string) {
    const newTodo = { id: crypto.randomUUID(), text, done: false };

    startTransition(async () => {
      addOptimisticTodo(newTodo); // UI 즉시 반영
      await createTodo(text);    // 서버 요청 (실패하면 자동 롤백)
    });
  }

  return (
    <ul>
      {optimisticTodos.map((todo) => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

- `startTransition`(또는 form action) 안에서 사용해야 한다.
- transition이 끝나면 낙관적 값은 버려지고 원본 값(`todos`)이 다시 보인다. 성공했다면 부모가 서버의 새 값으로 `todos`를 갱신해 주기 때문에 자연스럽게 이어진다.
- 실패해도 같은 원리로 원래 상태로 돌아간다. 롤백 코드를 따로 쓰지 않는다.

Next.js Server Actions와 함께 쓰면 토글은 이렇게 된다.

```tsx
// app/actions.ts
'use server';

export async function toggleTodo(id: string, done: boolean) {
  await db.todo.update({ where: { id }, data: { done } });
  revalidatePath('/todos');
}
```

```tsx
// app/todos/TodoItem.tsx
'use client';

import { useOptimistic, useTransition } from 'react';
import { toggleTodo } from '@/app/actions';

export function TodoItem({ todo }: { todo: Todo }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDone, setOptimisticDone] = useOptimistic(todo.done);

  function handleToggle() {
    startTransition(async () => {
      setOptimisticDone(!optimisticDone);
      await toggleTodo(todo.id, !todo.done);
    });
  }

  return (
    <label style={{ opacity: isPending ? 0.7 : 1 }}>
      <input type="checkbox" checked={optimisticDone} onChange={handleToggle} />
      {todo.text}
    </label>
  );
}
```

`isPending`으로 요청 중인 상태를 살짝 흐리게 보여주면, 값은 이미 바뀌었어도 아직 처리 중이라는 걸 사용자가 알 수 있다. `revalidatePath`는 다음 단계에서 다시 나온다.

---

## 4. 먼저 그린 값은 추정치다

요청이 성공해도 끝난 게 아니다. 먼저 그린 42는 "내가 누른 것만 반영한" 값이다. 그 사이 다른 사람 세 명이 같은 글을 저장했다면 서버의 실제 값은 45다. 실패했을 때도 마찬가지다. 되돌린 41은 클릭 직전의 캐시 값일 뿐이고, 지금 서버 값과 같다는 보장이 없다.

그래서 성공이든 실패든 요청이 끝나면 서버 값을 다시 받아온다. `onSettled`가 그 자리다.

```tsx
onSettled: () => queryClient.invalidateQueries({ queryKey }),
```

이 단계가 있어서 낙관적 업데이트가 안전해진다. 먼저 그린 값이 조금 틀려도 곧 서버 값으로 덮이니까, 화면은 잠깐 앞서 나갈 뿐 서버와 어긋난 채로 남지 않는다.

Server Actions에서는 액션 안의 `revalidatePath`가 이 역할을 한다. 서버가 해당 경로의 데이터를 다시 만들어 내려 주면 원본 값(`todo.done`)이 서버 값으로 바뀐다.

---

## 5. 연타하면 요청이 겹치고 순서가 뒤바뀐다

사용자가 북마크를 빠르게 세 번 누르면 mutation 세 개가 겹쳐서 돈다. 여기서 문제가 두 가지 생긴다.

**앞선 요청의 무효화가 뒤 요청의 값을 덮는다.** 첫 번째 요청이 끝나서 `onSettled`가 무효화를 걸면 서버 값을 다시 받아온다. 그런데 그 시점에 두 번째, 세 번째 요청은 아직 처리 중이다. 받아온 값에는 그 요청들이 반영돼 있지 않으니 화면이 잠깐 과거로 돌아간다. 마지막 요청이 끝날 때만 무효화하면 된다.

```tsx
onSettled: () => {
  // 끝나는 중인 자기 자신도 아직 개수에 들어 있다. 1이면 마지막이라는 뜻이다.
  if (queryClient.isMutating({ mutationKey: ['setBookmark', postId] }) === 1) {
    return queryClient.invalidateQueries({ queryKey });
  }
},
```

체크박스를 끈 채로 버튼을 빠르게 여러 번 눌러 보자.

```diagram
optimistic-rapid-clicks
```

끈 상태에서는 앞선 요청이 끝날 때마다 무효화가 걸리고, 그 응답이 아직 처리 중인 클릭을 덮는다. 빨간 칩이 화면이 거꾸로 돌아간 순간이다. 켜면 마지막 요청이 끝날 때 한 번만 서버 값을 받아온다.

**요청이 몇 번, 어떤 순서로 처리될지 장담할 수 없다.** API가 `toggleBookmark(id)`라면 서버는 "지금 상태를 뒤집어라"만 안다. 재시도나 중복 전송으로 같은 요청이 두 번 처리되면 한 번 더 뒤집히고, 연타 중 하나만 실패해도 화면이 가정한 상태와 서버 상태가 엇갈린다. `setBookmark(id, true)`처럼 **최종 상태를 보내는 멱등한 API**라면 같은 요청이 몇 번 처리돼도 결과가 같다.

멱등해도 남는 문제가 하나 있다. "저장 → 취소"가 서버에 "취소 → 저장" 순서로 도착하면 마지막 상태가 클릭 의도와 달라진다. 이때도 4단계의 무효화가 서버 값을 다시 보여주니 화면이 거짓말을 하지는 않는다. 순서까지 지켜야 한다면 요청이 끝날 때까지 다음 입력을 막거나, 입력을 debounce해서 마지막 상태 하나만 보낸다. 요청에 순번이나 시각을 실어 서버가 오래된 요청을 버리게 하는 방법도 있다.

0단계부터 `setBookmark(id, next)`를 쓴 이유가 이것이다.

여기까지 합치면 북마크 훅이 완성된다.

```tsx
function useSetBookmark(postId: string) {
  const queryClient = useQueryClient();
  const queryKey = postKeys.detail(postId);

  return useMutation({
    mutationKey: ['setBookmark', postId],
    mutationFn: (next: boolean) => api.setBookmark(postId, next),

    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey });                 // 2단계
      const previous = queryClient.getQueryData<Post>(queryKey);     // 3단계
      queryClient.setQueryData<Post>(queryKey, (old) =>              // 1단계
        old && { ...old, bookmarked: next, bookmarkCount: old.bookmarkCount + (next ? 1 : -1) },
      );
      return { previous };
    },

    onError: (_error, _next, onMutateResult) => {                           // 3단계
      if (onMutateResult?.previous) {
        queryClient.setQueryData(queryKey, onMutateResult.previous);
      }
      toast.error('저장하지 못했습니다. 다시 시도해 주세요.');
    },

    onSettled: () => {                                               // 4·5단계
      if (queryClient.isMutating({ mutationKey: ['setBookmark', postId] }) === 1) {
        return queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
```

---

## 6. 같은 글이 목록과 상세에 따로 캐시돼 있다

1단계에서 "캐시 한 곳을 고치면 모든 화면이 바뀐다"고 했다. 그 말은 모든 화면이 **같은 쿼리**를 읽을 때만 맞다. 실제로는 피드 목록은 `['posts', 'list', { sort: 'latest' }]`, 상세는 `['posts', 'detail', '7']`처럼 서로 다른 쿼리인 경우가 많다. 목록은 정렬이나 필터마다 쿼리가 따로 생기기도 한다. 상세 캐시만 고치면 목록에 있는 같은 글은 여전히 옛 값이다.

`setQueriesData`는 키의 앞부분이 일치하는 쿼리를 전부 고친다. 스냅샷은 `getQueriesData`로 `[queryKey, data]` 쌍의 배열을 받아 둔다.

```tsx
onMutate: async (next) => {
  await queryClient.cancelQueries({ queryKey: postKeys.all });

  // 고칠 캐시들의 스냅샷: [queryKey, data] 쌍
  const previous: Array<[QueryKey, unknown]> = [
    ...queryClient.getQueriesData({ queryKey: postKeys.lists() }),
    [postKeys.detail(postId), queryClient.getQueryData(postKeys.detail(postId))],
  ];

  const apply = (p: Post): Post =>
    p.id === postId
      ? { ...p, bookmarked: next, bookmarkCount: p.bookmarkCount + (next ? 1 : -1) }
      : p;

  queryClient.setQueryData<Post>(postKeys.detail(postId), (old) => old && apply(old));
  queryClient.setQueriesData<Post[]>({ queryKey: postKeys.lists() }, (old) => old?.map(apply));

  return { previous };
},
onError: (_error, _next, onMutateResult) => {
  onMutateResult?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
},
```

신경 쓸 점이 두 가지 더 있다.

**무한 스크롤은 데이터 모양이 다르다.** `useInfiniteQuery`의 캐시는 배열이 아니라 `{ pages, pageParams }`다. 글은 `pages` 안의 각 페이지에 들어 있으니 두 겹을 풀어서 고쳐야 한다.

```tsx
type Page = { items: Post[]; nextCursor: string | null };

queryClient.setQueriesData<InfiniteData<Page>>({ queryKey: postKeys.lists() }, (old) =>
  old && {
    ...old,
    pages: old.pages.map((page) => ({ ...page, items: page.items.map(apply) })),
  },
);
```

일반 목록과 무한 스크롤 목록이 같은 `['posts', 'list']` 아래 섞여 있으면 updater 하나로 두 모양을 처리할 수 없다. 키 단계에서 `['posts', 'list', ...]`와 `['posts', 'infinite', ...]`처럼 나눠 두는 게 편하다.

**목록 무효화는 다른 글의 진행 중인 값도 덮는다.** 목록을 다시 받아오면 그 목록에 있는 다른 글까지 서버 값으로 바뀐다. 사용자가 글 A와 글 B를 연달아 저장했다면, A의 `onSettled`가 목록을 무효화하는 순간 B의 낙관적 값이 사라질 수 있다. 그래서 목록까지 무효화한다면 5단계의 `isMutating` 검사를 글 단위가 아니라 북마크 mutation 전체로 넓힌다. `mutationKey`는 앞부분만 일치해도 매칭되므로, `['setBookmark', postId]`로 두고 `['setBookmark']`로 세면 된다.

```tsx
onSettled: () => {
  if (queryClient.isMutating({ mutationKey: ['setBookmark'] }) === 1) {
    return queryClient.invalidateQueries({ queryKey: postKeys.all });
  }
},
```

같은 이유로 스냅샷 복원에도 한계가 있다. 목록 스냅샷을 통째로 되돌리면, 스냅샷을 찍은 뒤 다른 글에 반영한 낙관적 값까지 함께 되돌아간다. 여러 글을 빠르게 연달아 바꾸는 화면이라면 스냅샷 대신 "이 글의 이 필드만" 반대로 되돌리는 방식이 안전하다. 어느 쪽이든 마지막 무효화가 서버 값으로 정리해 준다.

### 목록에서 지우기

삭제도 같은 구조다. 로컬 state로 구현하면 실패했을 때 원래 위치에 다시 끼워 넣어야 하므로 **제거 전 인덱스**를 같이 저장해 둔다.

```tsx
function TodoList({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState(initialTodos);

  async function handleDelete(id: string) {
    // 제거 전 위치와 항목을 저장하고 즉시 목록에서 제거
    const index = todos.findIndex((t) => t.id === id);
    const removed = todos[index];
    setTodos((prev) => prev.filter((t) => t.id !== id));

    try {
      await deleteTodo(id);
    } catch {
      // 실패 시 원래 위치에 복원
      setTodos((prev) => [...prev.slice(0, index), removed, ...prev.slice(index)]);
      toast.error('삭제에 실패했습니다.');
    }
  }
}
```

React Query라면 목록 쿼리 전체를 스냅샷으로 들고 있다가 통째로 되돌리면 되니 위치를 계산할 필요가 없다.

```tsx
onMutate: async (id: string) => {
  await queryClient.cancelQueries({ queryKey: ['todos'] });
  const previous = queryClient.getQueryData<Todo[]>(['todos']);
  queryClient.setQueryData<Todo[]>(['todos'], (old) => old?.filter((t) => t.id !== id));
  return { previous };
},
onError: (_e, _id, onMutateResult) => queryClient.setQueryData(['todos'], onMutateResult?.previous),
onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
```

---

## 7. 실시간 푸시가 먼저 그린 값을 덮어쓴다

2단계의 `cancelQueries`는 React Query가 관리하는 쿼리 fetch만 취소한다. 서버가 SSE나 WebSocket으로 밀어 준 값을 코드가 직접 `setQueryData`로 넣는 경로는 취소할 대상이 아니다.

[SSE 알람으로 테이블을 실시간 업데이트하는 법](/posts/sse-alarm-table-update)에서 쓴 구조가 바로 이 경로다. 알림이 오면 해당 행을 API로 다시 조회하고, 그 결과를 `setQueryData`로 캐시에 직접 넣는다. 북마크처럼 낙관적 값을 그려 둔 데이터에 이런 갱신이 들어오면 2단계와 같은 깜빡임이 생긴다.

```
t0  사용자가 저장 클릭 → 캐시: 저장됨, 42
t1  다른 사용자의 저장 알림 도착 → 재조회 → 캐시: 저장 안 됨, 42   ← 내 요청은 아직 처리 전
t2  내 저장 요청 성공 → 무효화 → 캐시: 저장됨, 43
```

푸시는 막을 수 없으니 받는 쪽에서 판단한다. 그 데이터에 진행 중인 mutation이 있으면 캐시에 쓰지 않고 넘긴다. 어차피 mutation이 끝나면 `onSettled`가 서버 값을 다시 받아온다.

```ts
function applyPushedPost(queryClient: QueryClient, pushed: Post) {
  // 이 글에 진행 중인 북마크 요청이 있으면 건드리지 않는다
  if (queryClient.isMutating({ mutationKey: ['setBookmark', pushed.id] }) > 0) return;

  queryClient.setQueryData(postKeys.detail(pushed.id), pushed);
}
```

푸시에 무엇을 싣는지도 중요하다. "저장 수 +1" 같은 **증감**을 싣고 클라이언트가 더하는 방식이라면, 내 클릭으로 이미 1을 더해 둔 값에 내 요청의 알림이 다시 1을 더해 두 번 세게 된다. 푸시에는 "저장 수 43"처럼 **최종 값**을 싣거나, [알림은 트리거로만 쓰고 데이터는 API로 받아오는](/posts/sse-payload-as-trigger) 편이 안전하다. 최종 값은 몇 번을 다시 써도 결과가 같다. 5단계에서 API를 멱등하게 만든 것과 같은 이유다.

---

## 8. ID를 서버가 만든다

토글과 삭제는 대상이 이미 존재한다. 댓글 작성처럼 새 항목을 만들 때는 ID와 작성 시각을 서버가 정한다. 응답 전에는 그 값을 알 수 없으니, 임시 ID로 먼저 그리고 응답이 오면 진짜 항목으로 바꾼다.

```tsx
type Comment = { id: string; body: string; createdAt: string; pending?: boolean };

function useAddComment(postId: string) {
  const queryClient = useQueryClient();
  const queryKey = [...postKeys.detail(postId), 'comments'] as const;

  return useMutation({
    mutationFn: (body: string) => api.addComment(postId, body),

    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Comment[]>(queryKey);
      const tempId = `temp-${crypto.randomUUID()}`;

      queryClient.setQueryData<Comment[]>(queryKey, (old = []) => [
        ...old,
        { id: tempId, body, createdAt: new Date().toISOString(), pending: true },
      ]);
      return { previous, tempId };
    },

    // 임시 항목을 서버가 만든 항목으로 교체
    onSuccess: (created, _body, onMutateResult) => {
      queryClient.setQueryData<Comment[]>(queryKey, (old) =>
        old?.map((c) => (c.id === onMutateResult?.tempId ? created : c)),
      );
    },

    onError: (_error, _body, onMutateResult) => {
      queryClient.setQueryData(queryKey, onMutateResult?.previous);
    },

    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
```

여기에는 함정이 세 개 있다.

**`key`가 바뀌면 컴포넌트가 새로 마운트된다.** 목록을 `<li key={comment.id}>`로 그리고 있으면, 임시 ID가 진짜 ID로 바뀌는 순간 React는 다른 항목으로 보고 기존 컴포넌트를 버린 뒤 새로 만든다. 그 항목이 들고 있던 state(펼침 상태, 입력 중인 답글, 포커스)가 사라지고 등장 애니메이션이 다시 재생된다. 해결은 두 가지다.

- **ID를 클라이언트가 만든다.** UUID를 만들어 요청에 실어 보내고, 서버가 그 값을 그대로 ID로 쓴다. 교체할 일이 없어지고, 같은 ID로 재전송된 요청을 서버가 걸러낼 수 있어서 재시도도 멱등해진다.
- **렌더링용 key를 따로 둔다.** 서버 ID와 별개로 `clientKey`를 두고 key로는 그걸 쓴다. 교체할 때 `{ ...created, clientKey: c.clientKey }`처럼 기존 값을 이어받는다.

**임시 항목에 대한 동작은 서버로 보낼 수 없다.** 사용자가 아직 저장되지 않은 댓글을 바로 삭제하거나 수정하면, 서버에는 존재하지 않는 `temp-...` ID로 요청이 간다. `pending`인 항목은 수정·삭제 버튼을 비활성화하고 흐리게 보여준다.

**위치와 시각은 서버가 정한다.** 클라이언트에서 찍은 `createdAt`은 서버 시각과 다르다. 정렬 기준이 서버 시각이면 응답 후 순서가 바뀔 수 있다. `onSettled`의 무효화가 이것도 서버 기준으로 다시 정리한다.

---

## 낙관적 업데이트가 맞지 않는 경우

- **결제, 예약**: 실패하면 사용자가 혼란스러워지는 중요한 트랜잭션
- **서버가 만드는 값이 화면의 핵심인 경우**: 주문 번호나 결제 승인 결과처럼 임시 값으로 대신할 수 없는 값. ID처럼 임시 값으로 버틸 수 있는 건 8단계 방식으로 처리한다
- **실패율이 높은 작업**: 낙관적으로 표시했다가 자주 롤백되면 오히려 신뢰를 잃음

북마크·좋아요·체크박스처럼 **실패 확률이 낮고 되돌려도 괜찮은** 작업이 가장 잘 맞는다.

## 롤백 시 UX

롤백은 부드럽게 처리한다. 값이 말없이 바뀌어 버리면 사용자는 클릭이 씹혔다고 생각한다. 되돌리면서 무슨 일이 있었는지 알려 준다.

```tsx
onError: (_error, _next, onMutateResult) => {
  // 롤백
  if (onMutateResult?.previous) {
    queryClient.setQueryData(queryKey, onMutateResult.previous);
  }

  // 사용자에게 알림
  toast.error('네트워크 오류로 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
},
```

---

## 정리

어떤 도구를 쓰든 뼈대는 같다. 바꾸기 전에 돌아갈 값을 챙기고, 화면을 먼저 바꾸고, 실패하면 되돌리고, 끝나면 서버 값으로 맞춘다.

| 단계 | 직접 구현 | React Query | React 19 / Server Actions |
|---|---|---|---|
| 저장 + 먼저 그리기 | `prev` 변수 + `setState` | `onMutate` (스냅샷 반환 + `setQueryData`) | `useOptimistic` |
| 실패 시 되돌리기 | `catch`에서 복원 | `onError` (`onMutate` 반환값으로 복원) | transition 종료 시 자동 |
| 서버 값과 다시 맞추기 | (직접 refetch) | `onSettled` → `invalidateQueries` | `revalidatePath` |

문제는 이 뼈대 바깥에서 생긴다. 끼어드는 refetch, 겹치는 요청, 여러 개로 나뉜 캐시, 밀려 들어오는 푸시, 아직 없는 ID. 각각의 답은 결국 두 가지로 모인다. 진행 중인 낙관적 값을 다른 갱신이 덮지 못하게 막고, 마지막에는 서버 값을 기준으로 정리한다.

서버 데이터를 React Query로 캐시하고 있다면 `onMutate`·`onError`·`onSettled` 패턴이 가장 자연스럽다. 한 컴포넌트 안에서 끝나는 토글이라면 `variables` 방식이나 `useOptimistic`으로 롤백 코드 없이 처리할 수 있다.

---

## 참고

- Jakob Nielsen, [Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/), Nielsen Norman Group
- Mike Krieger, Warm Gun 2011 발표 (Speaker Deck). 요약: [3 Secrets to Lightning Fast Mobile Design at Instagram](https://highscalability.com/3-secrets-to-lightning-fast-mobile-design-at-instagram/), High Scalability
- TanStack Query, [Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- TanStack Query, [Query Cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)
- React, [useOptimistic](https://react.dev/reference/react/useOptimistic)
- 이 글은 @boltlee_dev의 낙관적 업데이트 릴스를 보고 출발했다.
