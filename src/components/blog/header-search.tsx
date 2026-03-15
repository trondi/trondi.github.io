"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SearchEntry } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type HeaderSearchProps = {
  entries: SearchEntry[];
};

function getSnippet(entry: SearchEntry, query: string) {
  const source = `${entry.summary} ${entry.content}`.replace(/\s+/g, " ").trim();

  if (!source) {
    return "";
  }

  const lowered = source.toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  const matchIndex = lowered.indexOf(normalizedQuery);

  if (!normalizedQuery || matchIndex === -1) {
    return source.slice(0, 110);
  }

  const start = Math.max(0, matchIndex - 40);
  const end = Math.min(source.length, matchIndex + normalizedQuery.length + 70);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < source.length ? "..." : "";
  return `${prefix}${source.slice(start, end)}${suffix}`;
}

export function HeaderSearch({ entries }: HeaderSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return entries
      .map((entry) => {
        const haystack = [
          entry.title,
          entry.summary,
          entry.category,
          entry.tags.join(" "),
          entry.content,
        ]
          .join(" ")
          .toLowerCase();

        const score =
          (entry.title.toLowerCase().includes(normalizedQuery) ? 4 : 0) +
          (entry.summary.toLowerCase().includes(normalizedQuery) ? 3 : 0) +
          (entry.category.toLowerCase().includes(normalizedQuery) ? 2 : 0) +
          (entry.tags.join(" ").toLowerCase().includes(normalizedQuery) ? 2 : 0) +
          (entry.content.toLowerCase().includes(normalizedQuery) ? 1 : 0);

        return haystack.includes(normalizedQuery) ? { entry, score } : null;
      })
      .filter((item): item is { entry: SearchEntry; score: number } => Boolean(item))
      .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
      .slice(0, 6);
  }, [entries, normalizedQuery]);

  return (
    <div ref={wrapperRef} className="relative z-50 flex items-center justify-end">
      <div
        className={cn(
          "flex items-center gap-2 rounded-full transition-all duration-300 ease-out",
          open && "bg-white/98 px-2 py-1 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur dark:bg-[#2a2a2e]/98",
        )}
      >
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-out",
            open ? "w-[min(28rem,calc(100vw-10rem))] opacity-100" : "w-0 opacity-0",
          )}
        >
          <div className="flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 dark:border-stone-700 dark:bg-[#313136]">
            <Search className="h-3.5 w-3.5 text-slate-400 dark:text-stone-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="전체 글 검색"
              className="ml-2 w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-stone-100 dark:placeholder:text-stone-500"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="ml-2 rounded-full p-1 text-slate-400 transition-colors hover:text-slate-700 dark:text-stone-500 dark:hover:text-stone-200"
                aria-label="검색어 지우기"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "검색 닫기" : "검색 열기"}
          className={cn(
            "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/90 text-xs font-medium text-slate-700 transition-all duration-300 ease-out hover:border-slate-300 hover:text-slate-950 dark:border-stone-700 dark:bg-[#313136] dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100",
            open ? "h-9 w-9" : "gap-2 px-3 py-2",
          )}
        >
          {open ? <X className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
          <span
            className={cn(
              "overflow-hidden whitespace-nowrap transition-all duration-300 ease-out",
              open ? "max-w-0 opacity-0" : "max-w-20 opacity-100",
            )}
          >
            Search
          </span>
        </button>
      </div>

      <div
        className={cn(
          "absolute left-0 top-[calc(100%+0.75rem)] z-50 w-[min(35rem,calc(100vw-2.5rem))] origin-top overflow-hidden rounded-[28px] border border-white/70 bg-white/78 shadow-[0_24px_60px_rgba(15,23,42,0.16)] backdrop-blur-2xl transition-all duration-300 ease-out dark:border-white/10 dark:bg-[#232326]/82",
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-2 scale-[0.98] opacity-0",
        )}
      >
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.78))] dark:bg-[linear-gradient(180deg,rgba(42,42,46,0.96),rgba(35,35,38,0.92))]" />
          <div className="relative p-3">
            {normalizedQuery ? (
              results.length ? (
                <div className="space-y-2">
                  {results.map(({ entry }) => (
                    <Link
                      key={entry.slug}
                      href={`/posts/${entry.slug}`}
                      onClick={() => {
                        setOpen(false);
                        setQuery("");
                      }}
                      className="block rounded-2xl border border-white/55 bg-white/50 px-3 py-3 transition-colors hover:border-slate-200 hover:bg-white/72 dark:border-white/5 dark:bg-[#2a2a2e]/70 dark:hover:border-stone-700 dark:hover:bg-[#313136]"
                    >
                      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-400 dark:text-stone-500">
                        <span>{entry.category}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold tracking-tight text-slate-950 dark:text-stone-100">
                        {entry.title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-stone-300">
                        {getSnippet(entry, normalizedQuery)}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/42 px-4 py-8 text-sm text-slate-500 dark:border-stone-700 dark:bg-[#2a2a2e]/60 dark:text-stone-400">
                  검색 결과가 없습니다. 제목, 태그, 본문 키워드로 다시 시도해보세요.
                </div>
              )
            ) : (
              <div className="rounded-2xl bg-white/36 px-4 py-6 text-sm text-slate-500 dark:bg-[#2a2a2e]/50 dark:text-stone-400">
                제목, 태그, 본문 키워드로 전체 글을 검색할 수 있습니다.
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
