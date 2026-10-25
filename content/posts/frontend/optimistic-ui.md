---
title: "낙관적 업데이트 — Optimistic UI를 쓰는 이유와 롤백 패턴"
date: "2026-04-19"
summary: "서버 응답을 기다리지 않고 UI를 먼저 업데이트하는 Optimistic UI 패턴이 왜 좋은지(0.1초 기준과 인스타그램의 사례), 실패 시 어떻게 롤백하는지 React Query의 onMutate·onError·onSettled, React 19 useOptimistic, Next.js Server Actions 기준으로 정리했다."
category: "Frontend"
tags:
  - UX
  - Optimistic UI
  - React
  - React Query
  - Next.js
featured: false
---

# 낙관적 업데이트 — Optimistic UI

인스타그램에서 좋아요를 누르면 하트가 누르자마자 빨개진다. 그런데 그 순간에도 좋아요 요청은 아직 서버로 가는 중이다. 서버가 저장했다는 응답도 없는데 하트는 왜 먼저 바뀌었을까?

순서가 **하트 → 요청**이기 때문이다. 요청이 성공할 거라고 보고 화면을 먼저 바꾸고, 요청은 그 뒤에서 서버로 보낸다. 이렇게 성공을 가정하고 UI를 먼저 반영하는 방식을 Optimistic Update(낙관적 업데이트), 또는 Optimistic UI라고 한다.

---

## 왜 쓰는가

### 0.1초의 벽

UX 연구 기관인 Nielsen Norman Group이 정리한 응답 시간 기준이 있다.

> **0.1 second** is about the limit for having the user feel that the system is reacting instantaneously.
> — Jakob Nielsen, *Response Times: The 3 Important Limits*

사람은 누른 뒤 0.1초 안에 화면이 바뀌어야 앱이 "바로 반응했다"고 느낀다.

```
응답을 기다렸다가 바꾸면
누름 ──────── 0.1초 ──────── 요청 왕복 ──────── ❤️   → 굼뜸
                 │
먼저 바꾸면       │
누름 ❤️ ─────────┼────────── 요청 왕복 (뒤에서 진행)   → 즉각 반응
```

서버 요청은 보통 100ms ~ 수백ms가 걸린다. 응답을 기다렸다가 하트를 바꾸면 서버까지 다녀오는 시간만큼 하트가 늦게 바뀌고, 이 시간이 0.1초를 넘기면 사용자는 누를 때마다 버튼이 굼뜨다고 느낀다. 반면 앱이 하트를 먼저 바꾸면 서버가 얼마나 걸리든 하트는 누르는 순간 바뀐다.

버튼을 비활성화하고 스피너를 보여주는 게 "정직"하긴 하지만, 대부분의 요청은 성공한다. 실패는 예외적인 경우다. 그러니 성공을 가정하고 먼저 보여주고, 실패하면 되돌리는 쪽이 더 자연스러운 경험을 만든다.

### 인스타그램은 2011년에 이미

인스타그램 공동 창업자 Mike Krieger는 2011년 Warm Gun 컨퍼런스 발표 *"3 secrets to apps that feel lightning-fast, even on 3G"*에서 세 가지 비결을 꼽았다.

1. **perform actions optimistically** — 동작을 낙관적으로 처리하라
2. adaptively pre-load content — 콘텐츠를 상황에 맞게 미리 불러와라
3. move bits when no-one's watching — 아무도 안 볼 때 데이터를 옮겨라

발표의 메시지는 "latency is what'll get ya", 즉 앱을 느리게 만드는 건 결국 지연(latency)이고, 사용자가 **생산적이라고 느끼게(make the user feel productive)** 해야 한다는 것이다. 슬라이드 속 피드 화면에는 이렇게 적혀 있다.

> request is going, but we register the like
> (요청은 가는 중이지만, 좋아요는 등록한다)

그리고 바로 다음 질문이 따라온다. **"if it fails?"** 실패하면 어떻게 할 것인가. 이 글의 나머지는 그 질문에 대한 답이다.

---

## 기본 패턴

낙관적 업데이트는 세 단계로 이뤄진다.

| 단계 | 하는 일 | 좋아요 예시 |
|---|---|---|
| 1. 요청 직전 | 현재 값을 저장해 두고, 화면을 먼저 바꾼다 | 빈 하트·1,203 저장 → 빨간 하트·1,204 표시 |
| 2. 실패 시 | 저장해 둔 값으로 되돌린다 | 빈 하트·1,203으로 복원 |
| 3. 끝나면 | 성공이든 실패든 서버의 최신 값으로 맞춘다 | 그 사이 다른 사람이 누른 것까지 반영해 1,207 |

라이브러리 없이 쓰면 이렇다.

```tsx
function LikeButton({ postId, initialLikes }: { postId: string; initialLikes: number }) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);

  async function handleLike() {
    // 1. 이전 상태를 저장하고 UI를 먼저 업데이트
    const prevLikes = likes;
    const prevLiked = liked;
    setLikes(liked ? likes - 1 : likes + 1);
    setLiked(!liked);

    try {
      // 2. 서버 요청
      await toggleLike(postId);
    } catch {
      // 3. 실패 시 롤백
      setLikes(prevLikes);
      setLiked(prevLiked);
      toast.error('요청에 실패했습니다. 다시 시도해주세요.');
    }
  }

  return (
    <button onClick={handleLike}>
      {liked ? '❤️' : '🤍'} {likes}
    </button>
  );
}
```

핵심은 **이전 상태를 저장해두고**, 실패 시 복원하는 것이다.

다만 이 버전에는 3단계(서버 값과 다시 맞추기)가 없다. 그리고 같은 데이터를 피드와 상세 화면에서 함께 보여주면, 컴포넌트 로컬 state만 바뀌어서 다른 화면은 여전히 옛 값을 보여준다. 서버 데이터를 캐시해 두고 쓰는 라이브러리가 필요한 지점이 여기다.

---

## React Query로 — onMutate · onError · onSettled

React Query(TanStack Query)는 서버에서 받은 데이터를 캐시해 두고 쓰는 라이브러리다. `useMutation`의 생명주기 콜백이 위의 세 단계에 그대로 대응한다.

| 콜백 | 실행 시점 | 낙관적 업데이트에서의 역할 |
|---|---|---|
| `onMutate` | `mutationFn` 실행 **직전** | 현재 캐시 값 저장(스냅샷) + 캐시를 먼저 수정 |
| `onError` | 요청 실패 (네트워크 끊김, 서버 거절) | 스냅샷으로 캐시 되돌림 |
| `onSettled` | 성공이든 실패든 **끝나면** | 쿼리를 무효화해 서버 최신 값으로 다시 동기화 |

```tsx
type Post = { id: string; liked: boolean; likeCount: number };

function useToggleLike(postId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['post', postId] as const;

  return useMutation({
    mutationKey: ['toggleLike', postId],
    mutationFn: (nextLiked: boolean) => api.setLike(postId, nextLiked),

    // 1. 요청 직전: 저장하고, 먼저 그린다
    onMutate: async (nextLiked) => {
      // 진행 중인 refetch가 낙관적 값을 덮어쓰지 않도록 취소
      await queryClient.cancelQueries({ queryKey });

      // 롤백용 스냅샷 (빈 하트, 1,203)
      const previous = queryClient.getQueryData<Post>(queryKey);

      // 화면에는 빨간 하트와 1,204를 먼저
      queryClient.setQueryData<Post>(queryKey, (old) =>
        old && {
          ...old,
          liked: nextLiked,
          likeCount: old.likeCount + (nextLiked ? 1 : -1),
        },
      );

      // 반환값은 onError / onSettled의 세 번째 인자로 전달된다
      return { previous };
    },

    // 2. 실패: 저장해 둔 값으로 되돌림
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      toast.error('요청에 실패했습니다. 다시 시도해주세요.');
    },

    // 3. 끝나면: 서버의 최신 값으로 다시 동기화
    onSettled: () => {
      // 같은 mutation이 아직 남아 있으면 마지막 하나가 끝날 때만 무효화
      if (queryClient.isMutating({ mutationKey: ['toggleLike', postId] }) === 1) {
        return queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}
```

```tsx
function LikeButton({ postId }: { postId: string }) {
  const { data: post } = useQuery({ queryKey: ['post', postId], queryFn: () => api.getPost(postId) });
  const { mutate } = useToggleLike(postId);

  if (!post) return null;

  return (
    <button onClick={() => mutate(!post.liked)}>
      {post.liked ? '❤️' : '🤍'} {post.likeCount}
    </button>
  );
}
```

캐시를 직접 수정하기 때문에 `['post', postId]`를 구독하는 모든 컴포넌트(피드, 상세, 프로필 그리드 등)가 동시에 빨간 하트로 바뀐다.

### 코드에 숨은 메커니즘

**`cancelQueries`를 먼저 하는 이유.** 낙관적 업데이트 직전에 이미 출발한 refetch(포커스 복귀, 폴링, 다른 mutation의 invalidate 등)가 있을 수 있다. 그 응답이 낙관적 업데이트 *뒤에* 도착하면 캐시가 1,203으로 덮여 하트가 빨개졌다가 다시 비는 깜빡임이 생긴다. 그래서 진행 중인 쿼리를 먼저 취소하고, `cancelQueries`가 Promise이므로 `await`한다.

**`onMutate`의 반환값 = context.** 스냅샷을 컴포넌트 state나 클로저 변수에 두지 않고 `onMutate`가 반환하면, React Query가 그 값을 해당 mutation 실행 단위로 들고 있다가 `onError`·`onSettled`에 넘겨준다. 요청이 여러 개 겹쳐도 각 요청이 자기 스냅샷을 갖는다.

**`onSettled`는 서버를 진실의 원천으로 되돌리는 단계.** 낙관적 값은 어디까지나 *추정치*다. 내가 좋아요를 누르는 사이 다른 사람 셋이 눌렀다면 서버 값은 1,207이다. 성공했더라도 invalidate로 서버 값을 다시 받아와야 화면이 1,204에서 1,207로 맞춰진다. 실패한 경우에도 롤백한 값이 실제 서버 상태와 다를 수 있으니 마찬가지로 다시 받아온다.

**`isMutating() === 1` 체크.** 좋아요를 빠르게 연타하면 mutation이 여러 개 겹친다. 첫 번째 요청의 `onSettled`가 invalidate를 하면, 그 refetch 응답이 아직 진행 중인 두 번째 요청의 낙관적 값을 덮어쓸 수 있다. `onSettled` 시점에 자기 자신은 아직 카운트에 포함되므로, 값이 1이면 "내가 마지막"이라는 뜻이다. 그때만 무효화한다.

### 더 간단한 방법 — `variables`로 UI에서만 반영 (v5)

캐시를 건드리지 않고, 요청이 진행 중인 동안 `useMutation`이 들고 있는 `variables`를 화면에 그리는 방법도 있다.

```tsx
function LikeButton({ postId }: { postId: string }) {
  const queryClient = useQueryClient();
  const { data: post } = useQuery({ queryKey: ['post', postId], queryFn: () => api.getPost(postId) });

  const { mutate, variables, isPending } = useMutation({
    mutationFn: (nextLiked: boolean) => api.setLike(postId, nextLiked),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['post', postId] }),
  });

  if (!post) return null;

  // 요청 중이면 보낸 값을, 아니면 캐시 값을 보여준다
  const liked = isPending ? variables : post.liked;
  const count = isPending && variables !== post.liked
    ? post.likeCount + (variables ? 1 : -1)
    : post.likeCount;

  return <button onClick={() => mutate(!liked)}>{liked ? '❤️' : '🤍'} {count}</button>;
}
```

`onMutate`도 스냅샷도 롤백 코드도 없다. 실패하면 `isPending`이 false가 되고, 캐시는 처음부터 바뀐 적이 없으니 원래 값이 그대로 보인다. 롤백이 **구조적으로** 공짜다.

대신 이 컴포넌트 안에서만 반영된다. 다른 컴포넌트에서도 진행 중인 값을 보여주려면 `useMutationState`로 `mutationKey`를 기준으로 variables를 꺼내 써야 하고, 그게 여러 곳이면 캐시 방식이 더 단순하다.

| | 캐시 수정 (`onMutate`) | UI 반영 (`variables`) |
|---|---|---|
| 반영 범위 | 같은 쿼리를 쓰는 모든 컴포넌트 | 해당 컴포넌트 (+ `useMutationState`) |
| 롤백 | 직접 구현 (스냅샷 → 복원) | 필요 없음 |
| 코드량 | 많음 | 적음 |
| 맞는 상황 | 같은 데이터가 여러 화면에 걸쳐 보일 때 | 버튼·체크박스처럼 한 곳에서 끝날 때 |

---

## React 19 — useOptimistic

React 19에서 낙관적 업데이트를 위한 `useOptimistic` 훅이 추가됐다.

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

`useOptimistic`의 특징:
- `startTransition`(또는 form action) 안에서 사용해야 한다.
- transition이 끝나면 낙관적 값은 버려지고 원본 값(`todos`)이 다시 보인다. 성공했다면 부모가 서버의 새 값으로 `todos`를 갱신해 주기 때문에 자연스럽게 이어진다.
- 실패해도 같은 원리로 원래 상태로 돌아간다. 롤백 코드를 따로 쓰지 않는다는 점에서 React Query의 `variables` 방식과 같은 사고방식이다.

---

## Next.js Server Actions와 함께

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

`isPending`으로 요청 중인 상태를 시각적으로 표현할 수 있다. 완전히 숨기기보다 살짝 흐리게 처리하면 "뭔가 진행 중"이라는 피드백을 준다.

여기서 `revalidatePath`가 React Query의 `onSettled` + `invalidateQueries`와 같은 역할을 한다. 서버 값으로 다시 맞추는 3단계다.

---

## 목록에서 항목 삭제

삭제는 낙관적 업데이트를 적용하기 좋은 대표 케이스다. 복원할 때 원래 위치를 정확히 찾으려면 **제거 전 인덱스**를 같이 저장해 둔다.

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

React Query라면 `onMutate`에서 목록 쿼리 전체를 스냅샷으로 반환하고, `onError`에서 통째로 되돌리면 위치 계산 자체가 필요 없다.

```tsx
onMutate: async (id: string) => {
  await queryClient.cancelQueries({ queryKey: ['todos'] });
  const previous = queryClient.getQueryData<Todo[]>(['todos']);
  queryClient.setQueryData<Todo[]>(['todos'], (old) => old?.filter((t) => t.id !== id));
  return { previous };
},
onError: (_e, _id, context) => queryClient.setQueryData(['todos'], context?.previous),
onSettled: () => queryClient.invalidateQueries({ queryKey: ['todos'] }),
```

---

## 주의할 점

### 낙관적 업데이트가 맞지 않는 경우

- **결제, 예약** — 실패 시 사용자에게 혼란을 주는 중요한 트랜잭션
- **서버에서 생성된 값이 UI에 필요한 경우** — ID, 타임스탬프 등 서버 응답 전에 알 수 없는 값
- **실패율이 높은 작업** — 낙관적으로 표시했다가 자주 롤백되면 오히려 신뢰를 잃음

좋아요·북마크·토글처럼 **실패 확률이 낮고, 되돌려도 괜찮은** 작업이 가장 잘 맞는다.

### 연타와 경쟁 상태

좋아요를 빠르게 여러 번 누르면 요청이 겹친다. 이때 생길 수 있는 문제는 두 가지다.

- **refetch가 낙관적 값을 덮어씀** — 앞선 요청의 `onSettled` invalidate 응답이 뒤 요청의 낙관적 값을 덮는다. → `isMutating() === 1`일 때만 무효화
- **요청 도착 순서 뒤바뀜** — "좋아요 → 취소"가 서버에 "취소 → 좋아요" 순서로 도착할 수 있다. → `toggle` 대신 `setLike(true/false)`처럼 **최종 상태를 보내는(멱등한) API**로 설계하거나, 요청이 끝날 때까지 다음 입력을 막거나 debounce한다

위 React Query 예제가 `toggleLike`가 아니라 `setLike(postId, nextLiked)`를 호출하는 이유가 이것이다.

### 롤백 시 UX

롤백은 부드럽게 처리한다. 갑자기 사라지거나 변경되는 것보다 토스트 메시지와 함께 자연스럽게 이전 상태로 돌아오는 것이 낫다.

```tsx
catch (error) {
  // 롤백
  setLiked(prevLiked);
  setLikes(prevLikes);

  // 사용자에게 알림
  toast.error('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
}
```

---

## 정리

Optimistic UI의 원칙은 단순하다: **성공을 가정하고 먼저 보여주되, 실패하면 조용히 원래대로 돌려놓는다.** 사람은 0.1초 안에 화면이 바뀌어야 즉각 반응했다고 느끼고, 서버 왕복은 그 기준을 쉽게 넘기 때문이다.

어떤 도구를 쓰든 구조는 같다.

| 단계 | 직접 구현 | React Query | React 19 / Server Actions |
|---|---|---|---|
| 저장 + 먼저 그리기 | `prev` 변수 + `setState` | `onMutate` (스냅샷 반환 + `setQueryData`) | `useOptimistic` |
| 실패 시 되돌리기 | `catch`에서 복원 | `onError` (context로 복원) | transition 종료 시 자동 |
| 서버 값과 다시 맞추기 | (직접 refetch) | `onSettled` → `invalidateQueries` | `revalidatePath` |

서버 데이터를 React Query로 캐시하고 있다면 `onMutate`·`onError`·`onSettled` 패턴이 가장 자연스럽고, 한 컴포넌트 안에서 끝나는 토글이라면 `variables` 방식이나 `useOptimistic`으로 롤백 코드 없이 처리할 수 있다.

---

## 참고

- Jakob Nielsen, [Response Times: The 3 Important Limits](https://www.nngroup.com/articles/response-times-3-important-limits/) — Nielsen Norman Group
- Mike Krieger, Warm Gun 2011 발표 (Speaker Deck) — 요약: [3 Secrets to Lightning Fast Mobile Design at Instagram](https://highscalability.com/3-secrets-to-lightning-fast-mobile-design-at-instagram/) — High Scalability
- TanStack Query, [Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
- React, [useOptimistic](https://react.dev/reference/react/useOptimistic)
