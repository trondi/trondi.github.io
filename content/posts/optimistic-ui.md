---
title: "낙관적 업데이트 — Optimistic UI를 쓰는 이유와 롤백 패턴"
date: "2026-04-19"
summary: "서버 응답을 기다리지 않고 UI를 먼저 업데이트하는 Optimistic UI 패턴이 왜 좋고, 실패 시 어떻게 롤백하는지 React와 Next.js Server Actions 기준으로 정리했다."
category: "Frontend"
tags:
  - UX
  - Optimistic UI
  - React
  - Next.js
featured: false
---

# 낙관적 업데이트 — Optimistic UI

좋아요 버튼을 눌렀을 때 즉시 숫자가 올라가는 인스타그램, 체크박스를 클릭하면 바로 완료 표시가 되는 투두 앱. 서버 응답을 기다리지 않고 UI가 먼저 반응한다. 이것이 Optimistic UI다.

---

## 왜 쓰는가

서버 요청은 보통 100ms ~ 수백ms가 걸린다. 이 시간 동안 버튼을 비활성화하고 스피너를 보여주는 것이 "정직"하지만, 사용자 입장에서는 느리게 느껴진다.

대부분의 요청은 성공한다. 실패는 예외적인 경우다. 그러니 성공을 가정하고 UI를 먼저 반영하고, 실패하면 되돌리는 것이 더 자연스러운 경험을 만든다.

---

## 기본 패턴

```tsx
function LikeButton({ postId, initialLikes }: { postId: string; initialLikes: number }) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);

  async function handleLike() {
    // 1. UI를 먼저 업데이트
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
- `startTransition` 안에서 사용해야 한다.
- 서버 요청이 완료되면 실제 서버 응답 값(`todos`)으로 자동 대체된다.
- 에러가 나면 자동으로 원래 상태로 돌아간다.

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

---

## 목록에서 항목 삭제

삭제는 낙관적 업데이트를 적용하기 좋은 대표 케이스다.

```tsx
function TodoList({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState(initialTodos);

  async function handleDelete(id: string) {
    // 즉시 목록에서 제거
    const removed = todos.find((t) => t.id === id)!;
    setTodos(todos.filter((t) => t.id !== id));

    try {
      await deleteTodo(id);
    } catch {
      // 실패 시 원래 위치에 복원
      setTodos((prev) => {
        const index = prev.findIndex((t) => t.id > id); // 정렬 기준에 맞게 위치 복원
        if (index === -1) return [...prev, removed];
        return [...prev.slice(0, index), removed, ...prev.slice(index)];
      });
      toast.error('삭제에 실패했습니다.');
    }
  }
}
```

---

## 주의할 점

### 낙관적 업데이트가 맞지 않는 경우

- **결제, 예약** — 실패 시 사용자에게 혼란을 주는 중요한 트랜잭션
- **서버에서 생성된 값이 UI에 필요한 경우** — ID, 타임스탬프 등 서버 응답 전에 알 수 없는 값
- **실패율이 높은 작업** — 낙관적으로 표시했다가 자주 롤백되면 오히려 신뢰를 잃음

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

Optimistic UI의 원칙은 단순하다: **성공을 가정하고 먼저 보여주되, 실패하면 조용히 원래대로 돌려놓는다.**

React 19의 `useOptimistic`은 이 패턴을 선언적으로 표현하게 해준다. Server Actions와 함께 쓰면 서버 상태와 UI 상태의 동기화를 거의 자동으로 처리할 수 있다.
