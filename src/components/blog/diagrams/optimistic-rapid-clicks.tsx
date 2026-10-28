"use client";

import {
  QueryClientProvider,
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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

const queryKey = ["demo-rapid-clicks", "post"] as const;
const mutationKey = ["demo-rapid-clicks", "setBookmark"] as const;
const READ_LATENCY = 150;

// 서버는 요청을 도착 순서대로 처리하고, 하나에 250~700ms가 걸린다
const writeLatency = () => 250 + Math.round(Math.random() * 450);

function Demo() {
  const queryClient = useQueryClient();
  const [server] = useState(() => createFakeServer());
  const [guard, setGuard] = useState(false);
  const guardRef = useRef(guard);
  guardRef.current = guard;
  const intended = useRef(INITIAL.bookmarked);
  const inFlight = useIsMutating({ mutationKey });

  // 아직 처리 중인 클릭이 있는데 서버 응답이 마지막 클릭과 반대 값을 쓰면 화면이 거꾸로 돌아간 것이다
  const log = useCacheLog(
    queryClient,
    queryKey,
    (value, manual) =>
      !manual && queryClient.isMutating({ mutationKey }) > 0 && value.bookmarked !== intended.current,
  );

  const { data: post } = useQuery({
    queryKey,
    queryFn: () => server.get(READ_LATENCY),
    initialData: INITIAL,
  });

  const mutation = useMutation({
    mutationKey,
    mutationFn: (next: boolean) => server.set(next, writeLatency()),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Bookmark>(queryKey);
      log.labelNext("클릭");
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
    onSettled: () => {
      // 끝나는 중인 자기 자신도 개수에 들어 있다. 1이면 마지막 요청이다.
      if (guardRef.current && queryClient.isMutating({ mutationKey }) !== 1) return;
      return queryClient.invalidateQueries({ queryKey });
    },
  });

  function handleClick() {
    if (inFlight === 0) log.clear();
    intended.current = !post.bookmarked;
    mutation.mutate(intended.current);
  }

  function handleReset() {
    server.reset();
    log.clear();
    log.labelNext("처음 상태");
    queryClient.setQueryData(queryKey, INITIAL);
  }

  const reversals = log.entries.filter((entry) => entry.tone === "bad").length;
  const clicks = log.entries.filter((entry) => entry.text.startsWith("클릭")).length;
  const settled = inFlight === 0 && clicks > 0;

  return (
    <DemoFrame title="빠르게 여러 번 누를 때">
      <div className="flex flex-wrap items-center gap-3">
        <BookmarkButton value={post} onClick={handleClick} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={guard} onChange={(event) => setGuard(event.target.checked)} />
          마지막 요청이 끝날 때만 무효화 (isMutating === 1)
        </label>
        <span className="text-xs tabular-nums text-muted-foreground">
          처리 중 <span className="font-semibold text-foreground">{inFlight}</span>
        </span>
        <button
          type="button"
          onClick={handleReset}
          disabled={inFlight > 0}
          className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          처음으로
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        버튼을 빠르게 4~5번 눌러 보자. 서버는 요청을 도착 순서대로 하나씩 처리하고, 하나에 250~700ms가 걸린다.
      </p>

      <CacheLog entries={log.entries} empty="버튼을 누르면 캐시 값이 바뀐 순서가 여기에 쌓인다." />

      {settled &&
        (reversals > 0 ? (
          <Verdict tone="bad">
            앞선 요청의 무효화가 아직 처리 중인 클릭을 덮었다. 화면이 거꾸로 돌아간 순간이 {reversals}번(빨간 칩) 있었다.
          </Verdict>
        ) : guard ? (
          <Verdict tone="good">
            마지막 요청이 끝났을 때만 서버 값을 받아왔다. 클릭 도중에 화면이 거꾸로 돌아가지 않았다.
          </Verdict>
        ) : clicks > 1 ? (
          <Verdict tone="good">이번에는 겹치지 않았다. 더 빠르게 눌러 보자.</Verdict>
        ) : null)}
    </DemoFrame>
  );
}

export function OptimisticRapidClicksDiagram() {
  const [client] = useState(createDemoClient);
  return (
    <QueryClientProvider client={client}>
      <Demo />
    </QueryClientProvider>
  );
}
