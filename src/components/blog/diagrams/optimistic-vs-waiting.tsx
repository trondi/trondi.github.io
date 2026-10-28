"use client";

import { QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  Bookmark,
  BookmarkButton,
  createDemoClient,
  createFakeServer,
  DemoFrame,
  INITIAL,
} from "./optimistic-demo-kit";

const waitingKey = ["demo-waiting", "post"] as const;
const optimisticKey = ["demo-optimistic", "post"] as const;
const READ_LATENCY = 150;

function Panel({
  title,
  description,
  elapsed,
  message,
  children,
}: {
  title: string;
  description: string;
  elapsed: number | null;
  message: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 p-4">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mb-3 text-xs text-muted-foreground">{description}</div>
      {children}
      <div className="mt-3 text-xs tabular-nums text-muted-foreground">
        클릭 후 화면 반영: {elapsed === null ? "-" : `${elapsed}ms`}
      </div>
      <div className="mt-1 min-h-[1rem] text-xs text-red-500 dark:text-red-400" role="status">
        {message}
      </div>
    </div>
  );
}

function Demo() {
  const queryClient = useQueryClient();
  const [servers] = useState(() => ({ waiting: createFakeServer(), optimistic: createFakeServer() }));
  const [latency, setLatency] = useState(900);
  const [fail, setFail] = useState(false);
  const settings = useRef({ latency, fail });
  settings.current = { latency, fail };

  const [waitingElapsed, setWaitingElapsed] = useState<number | null>(null);
  const [optimisticElapsed, setOptimisticElapsed] = useState<number | null>(null);
  const [waitingMessage, setWaitingMessage] = useState("");
  const [optimisticMessage, setOptimisticMessage] = useState("");
  const clickedAt = useRef({ waiting: 0, optimistic: 0 });

  const { data: waitingPost } = useQuery({
    queryKey: waitingKey,
    queryFn: () => servers.waiting.get(READ_LATENCY),
    initialData: INITIAL,
  });
  const { data: optimisticPost } = useQuery({
    queryKey: optimisticKey,
    queryFn: () => servers.optimistic.get(READ_LATENCY),
    initialData: INITIAL,
  });

  // 응답이 와야 캐시를 바꾼다
  const waiting = useMutation({
    mutationFn: (next: boolean) =>
      servers.waiting.set(next, settings.current.latency, settings.current.fail),
    onSuccess: (saved) => {
      queryClient.setQueryData(waitingKey, saved);
      setWaitingElapsed(Math.round(performance.now() - clickedAt.current.waiting));
    },
    onError: () => setWaitingMessage("실패했다. 버튼은 처음부터 바뀌지 않았다."),
  });

  // 캐시부터 바꾸고, 실패하면 되돌린다
  const optimistic = useMutation({
    mutationKey: ["demo-optimistic", "setBookmark"],
    mutationFn: (next: boolean) =>
      servers.optimistic.set(next, settings.current.latency, settings.current.fail),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: optimisticKey });
      const previous = queryClient.getQueryData<Bookmark>(optimisticKey);
      queryClient.setQueryData<Bookmark>(optimisticKey, (old) =>
        old && { bookmarked: next, count: old.count + (next ? 1 : -1) },
      );
      setOptimisticElapsed(Math.round(performance.now() - clickedAt.current.optimistic));
      return { previous };
    },
    onError: (_error, _next, onMutateResult) => {
      if (onMutateResult?.previous) {
        queryClient.setQueryData(optimisticKey, onMutateResult.previous);
      }
      setOptimisticMessage("실패해서 원래대로 되돌렸다.");
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ["demo-optimistic", "setBookmark"] }) === 1) {
        return queryClient.invalidateQueries({ queryKey: optimisticKey });
      }
    },
  });

  return (
    <DemoFrame title="응답을 기다릴 때 vs 먼저 그릴 때">
      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">
          응답 지연
          <input
            type="range"
            min={100}
            max={2000}
            step={100}
            value={latency}
            onChange={(event) => setLatency(Number(event.target.value))}
            className="w-36 accent-sky-500"
          />
          <span className="w-14 tabular-nums text-foreground">{latency}ms</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} />
          요청 실패시키기
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Panel
          title="응답 기다리기"
          description="서버가 저장했다고 답하면 바꾼다"
          elapsed={waitingElapsed}
          message={waitingMessage}
        >
          <BookmarkButton
            value={waitingPost}
            busyText={waiting.isPending ? "저장 중…" : undefined}
            disabled={waiting.isPending}
            onClick={() => {
              clickedAt.current.waiting = performance.now();
              setWaitingElapsed(null);
              setWaitingMessage("");
              waiting.mutate(!waitingPost.bookmarked);
            }}
          />
        </Panel>
        <Panel
          title="먼저 그리기"
          description="바꾼 뒤에 요청을 보낸다"
          elapsed={optimisticElapsed}
          message={optimisticMessage}
        >
          <BookmarkButton
            value={optimisticPost}
            onClick={() => {
              clickedAt.current.optimistic = performance.now();
              setOptimisticMessage("");
              optimistic.mutate(!optimisticPost.bookmarked);
            }}
          />
        </Panel>
      </div>
    </DemoFrame>
  );
}

export function OptimisticVsWaitingDiagram() {
  const [client] = useState(createDemoClient);
  return (
    <QueryClientProvider client={client}>
      <Demo />
    </QueryClientProvider>
  );
}
