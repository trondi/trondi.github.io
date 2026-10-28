"use client";

import { QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  Bookmark,
  BookmarkButton,
  CacheLog,
  createDemoClient,
  createFakeServer,
  DemoFrame,
  INITIAL,
  useCacheLog,
  Verdict,
} from "./optimistic-demo-kit";

const queryKey = ["demo-refetch-race", "post"] as const;
const READ_LATENCY = 400;
const WRITE_LATENCY = 1200;

function Demo() {
  const queryClient = useQueryClient();
  const [server] = useState(() => createFakeServer());
  const [withCancel, setWithCancel] = useState(false);
  const withCancelRef = useRef(withCancel);
  withCancelRef.current = withCancel;
  const intended = useRef(INITIAL.bookmarked);
  const [ran, setRan] = useState(false);

  // 요청이 진행 중인데 서버 응답이 클릭과 반대 값을 쓰면 깜빡임이다
  const log = useCacheLog(
    queryClient,
    queryKey,
    (value, manual) => !manual && queryClient.isMutating() > 0 && value.bookmarked !== intended.current,
  );

  const { data: post } = useQuery({
    queryKey,
    queryFn: () => server.get(READ_LATENCY),
    initialData: INITIAL,
  });

  const mutation = useMutation({
    mutationFn: (next: boolean) => server.set(next, WRITE_LATENCY),
    onMutate: async (next) => {
      if (withCancelRef.current) {
        const wasFetching = queryClient.isFetching({ queryKey }) > 0;
        await queryClient.cancelQueries({ queryKey });
        if (wasFetching) log.note("refetch 취소됨");
      }
      const previous = queryClient.getQueryData<Bookmark>(queryKey);
      log.labelNext("먼저 그림");
      queryClient.setQueryData<Bookmark>(queryKey, (old) =>
        old && { bookmarked: next, count: old.count + (next ? 1 : -1) },
      );
      return { previous };
    },
    onError: (_error, _next, onMutateResult) => {
      if (onMutateResult?.previous) {
        log.labelNext("되돌림");
        queryClient.setQueryData(queryKey, onMutateResult.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  function handleClick() {
    log.clear();
    setRan(true);

    // 클릭 직전에 창 포커스 복귀 같은 계기로 refetch가 이미 출발해 있던 상황
    log.note("refetch 출발");
    void queryClient.refetchQueries({ queryKey });

    intended.current = !post.bookmarked;
    mutation.mutate(intended.current);
  }

  function handleReset() {
    server.reset();
    log.clear();
    setRan(false);
    log.labelNext("처음 상태");
    queryClient.setQueryData(queryKey, INITIAL);
  }

  const flickered = log.entries.some((entry) => entry.tone === "bad");
  const done = ran && !mutation.isPending;

  return (
    <DemoFrame title="이미 출발한 refetch가 먼저 그린 값을 덮을 때">
      <div className="flex flex-wrap items-center gap-3">
        <BookmarkButton value={post} onClick={handleClick} disabled={mutation.isPending} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={withCancel} onChange={(event) => setWithCancel(event.target.checked)} />
          onMutate에서 cancelQueries 호출
        </label>
        <button
          type="button"
          onClick={handleReset}
          disabled={mutation.isPending}
          className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          처음으로
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        버튼을 누르면 클릭 직전에 refetch가 출발해 있던 상황이 함께 재현된다. 읽기는 {READ_LATENCY}ms, 저장은{" "}
        {WRITE_LATENCY}ms가 걸린다.
      </p>

      <CacheLog entries={log.entries} empty="버튼을 누르면 캐시 값이 바뀐 순서가 여기에 쌓인다." />

      {done &&
        (flickered ? (
          <Verdict tone="bad">
            클릭보다 먼저 출발한 refetch의 응답(빨간 칩)이 먼저 그린 값을 덮었다. 버튼이 먼저 그린 값, 옛 값, 서버 값 순서로
            깜빡였다.
          </Verdict>
        ) : (
          <Verdict tone="good">
            취소된 refetch의 응답은 캐시에 쓰이지 않았다. 먼저 그린 값이 그대로 서버 값으로 이어졌다.
          </Verdict>
        ))}
    </DemoFrame>
  );
}

export function OptimisticRefetchRaceDiagram() {
  const [client] = useState(createDemoClient);
  return (
    <QueryClientProvider client={client}>
      <Demo />
    </QueryClientProvider>
  );
}
