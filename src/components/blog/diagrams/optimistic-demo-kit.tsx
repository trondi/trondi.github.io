"use client";

import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { Bookmark as BookmarkIcon } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";

// 낙관적 업데이트 데모(optimistic-*.tsx)가 공유하는 가짜 서버·캐시 로그·버튼

export type Bookmark = { bookmarked: boolean; count: number };

export const INITIAL: Bookmark = { bookmarked: false, count: 41 };

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 데모마다 따로 쓰는 QueryClient. 데모 밖의 계기(포커스, 재시도)로 값이 바뀌지 않게 막는다. */
export function createDemoClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

/**
 * 북마크 하나를 들고 있는 가짜 서버.
 * - get: 요청이 출발한 시점의 값을 latency 뒤에 돌려준다
 * - set: 도착한 순서대로 하나씩 처리하고, 처리가 끝나면 그 시점의 값을 돌려준다
 */
export function createFakeServer(initial: Bookmark = INITIAL) {
  let state = { ...initial };
  let queue: Promise<unknown> = Promise.resolve();
  let generation = 0;

  return {
    peek: () => ({ ...state }),

    reset() {
      generation += 1;
      state = { ...initial };
      queue = Promise.resolve();
    },

    async get(latency: number): Promise<Bookmark> {
      const snapshot = { ...state };
      await wait(latency);
      return snapshot;
    },

    set(next: boolean, latency: number, fail = false): Promise<Bookmark> {
      const startedIn = generation;
      const run = queue.then(async () => {
        await wait(latency);
        if (fail) throw new Error("저장 실패");
        // reset 이후에 끝난 옛 요청은 서버 값을 건드리지 않는다
        if (startedIn === generation) {
          state = { bookmarked: next, count: initial.count + (next ? 1 : 0) };
        }
        return { ...state };
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}

export type FakeServer = ReturnType<typeof createFakeServer>;

export type LogEntry = { id: number; text: string; tone: "plain" | "on" | "bad" | "note" };

const describe = (value: Bookmark) => `${value.bookmarked ? "저장됨" : "저장"} ${value.count}`;

/**
 * queryKey의 캐시 값이 바뀔 때마다 기록한다.
 * setQueryData로 직접 고친 값(manual)과 서버 응답으로 바뀐 값을 구분한다.
 */
export function useCacheLog(
  client: QueryClient,
  queryKey: QueryKey,
  isBad?: (value: Bookmark, manual: boolean) => boolean,
) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const nextLabel = useRef<string | null>(null);
  const seq = useRef(0);
  const isBadRef = useRef(isBad);
  isBadRef.current = isBad;
  const keyHash = JSON.stringify(queryKey);

  const append = (entry: Omit<LogEntry, "id">) =>
    setEntries((prev) => [...prev, { ...entry, id: seq.current++ }].slice(-16));

  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "success") return;
        if (JSON.stringify(event.query.queryKey) !== keyHash) return;

        const value = event.action.data as Bookmark;
        const manual = Boolean(event.action.manual);
        const label = manual ? nextLabel.current ?? "캐시 수정" : "서버 응답";
        if (manual) nextLabel.current = null;

        const bad = isBadRef.current?.(value, manual) ?? false;
        append({ text: `${label} · ${describe(value)}`, tone: bad ? "bad" : value.bookmarked ? "on" : "plain" });
      }),
    [client, keyHash],
  );

  return {
    entries,
    /** 바로 다음 setQueryData에 붙일 이름 */
    labelNext: (label: string) => {
      nextLabel.current = label;
    },
    note: (text: string) => append({ text, tone: "note" }),
    clear: () => setEntries([]),
  };
}

export function BookmarkButton({
  value,
  onClick,
  busyText,
  disabled,
}: {
  value: Bookmark;
  onClick: () => void;
  busyText?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={value.bookmarked}
      className={`inline-flex min-w-[8.5rem] items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium tabular-nums transition-colors disabled:cursor-wait ${
        busyText
          ? "border-border bg-background text-muted-foreground"
          : value.bookmarked
            ? "border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300"
            : "border-border bg-background text-foreground hover:bg-secondary/60"
      }`}
    >
      <BookmarkIcon className="h-4 w-4" fill={value.bookmarked && !busyText ? "currentColor" : "none"} aria-hidden />
      {busyText ?? describe(value)}
    </button>
  );
}

const toneClass: Record<LogEntry["tone"], string> = {
  plain: "border-border bg-background text-muted-foreground",
  on: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  bad: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
  note: "border-dashed border-border bg-transparent text-muted-foreground",
};

export function CacheLog({ entries, empty }: { entries: LogEntry[]; empty: string }) {
  return (
    <ol aria-label="캐시 값이 바뀐 순서" className="mt-3 flex min-h-[2rem] flex-wrap items-center gap-1.5">
      {entries.length === 0 ? (
        <li className="text-xs text-muted-foreground">{empty}</li>
      ) : (
        entries.map((entry) => (
          <li key={entry.id} className={`rounded-md border px-2 py-1 text-[11px] tabular-nums ${toneClass[entry.tone]}`}>
            {entry.text}
          </li>
        ))
      )}
    </ol>
  );
}

export function DemoFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border bg-secondary/20">
      <div className="border-b border-border px-5 py-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Verdict({ tone, children }: { tone: "bad" | "good"; children: ReactNode }) {
  return (
    <div
      role="status"
      className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
        tone === "bad"
          ? "border-red-500/30 bg-red-500/5 text-red-500 dark:text-red-400"
          : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
      }`}
    >
      {children}
    </div>
  );
}
