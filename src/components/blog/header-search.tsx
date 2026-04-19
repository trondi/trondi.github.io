"use client";

import Link from "next/link";
import { Search, X, ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { SearchEntry } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type HeaderSearchProps = { entries: SearchEntry[] };

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function getSnippet(entry: SearchEntry, query: string) {
  const source = `${entry.summary} ${entry.content}`.replace(/\s+/g, " ").trim();
  if (!source) return "";
  const low = source.toLowerCase();
  const q   = query.trim().toLowerCase();
  const idx = q ? low.indexOf(q) : -1;
  if (idx === -1) return source.slice(0, 100);
  const start = Math.max(0, idx - 36);
  const end   = Math.min(source.length, idx + q.length + 64);
  return `${start > 0 ? "…" : ""}${source.slice(start, end)}${end < source.length ? "…" : ""}`;
}

export function HeaderSearch({ entries }: HeaderSearchProps) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Close on outside click or Escape
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setQuery(""); }
      // ⌘K / Ctrl+K global shortcut
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!q) return [];
    return entries
      .map((entry) => {
        const hay = [entry.title, entry.summary, entry.category, entry.tags.join(" "), entry.content]
          .join(" ").toLowerCase();
        const score =
          (entry.title.toLowerCase().includes(q)            ? 4 : 0) +
          (entry.summary.toLowerCase().includes(q)          ? 3 : 0) +
          (entry.category.toLowerCase().includes(q)         ? 2 : 0) +
          (entry.tags.join(" ").toLowerCase().includes(q)   ? 2 : 0) +
          (entry.content.toLowerCase().includes(q)          ? 1 : 0);
        return hay.includes(q) ? { entry, score } : null;
      })
      .filter((x): x is { entry: SearchEntry; score: number } => Boolean(x))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [entries, q]);

  const close = () => { setOpen(false); setQuery(""); };

  return (
    <div ref={wrapperRef} className="relative z-50">

      {/* ── Trigger button ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="검색"
        aria-expanded={open}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors duration-150",
          open
            ? "border-foreground/20 bg-secondary text-foreground"
            : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden items-center gap-0.5 rounded border border-border px-1 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
          <span>⌘</span>K
        </kbd>
      </button>

      {/* ── Search panel — fixed command-palette style ─────────────────── */}
      {/* Backdrop — z-[38] keeps it below the sticky header (z-40),
           so header buttons stay visible and clickable */}
      <div
        aria-hidden
        onClick={close}
        className={cn(
          "fixed inset-0 z-[38] bg-background/50 transition-opacity duration-200",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <div
        className={cn(
          "fixed left-1/2 top-[5.5rem] z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-background shadow-[0_16px_48px_rgba(0,0,0,0.14)] dark:shadow-[0_16px_48px_rgba(0,0,0,0.42)] transition-all duration-200 ease-out",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
        )}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목, 태그, 본문 키워드로 검색…"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              esc
            </kbd>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[min(28rem,60vh)] overflow-y-auto">
          {q ? (
            results.length ? (
              <ul className="divide-y divide-border">
                {results.map(({ entry }) => (
                  <li key={entry.slug}>
                    <Link
                      href={`/posts/${entry.slug}`}
                      onClick={close}
                      className="group flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-secondary"
                    >
                      {/* Icon */}
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" />

                      {/* Text */}
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                            {entry.category}
                          </span>
                        </div>
                        <p className="text-sm font-semibold leading-snug text-foreground">
                          {highlight(entry.title, query.trim())}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {getSnippet(entry, query.trim())}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">결과 없음</p>
                <p className="mt-1 text-xs">다른 키워드로 다시 시도해보세요.</p>
              </div>
            )
          ) : (
            <div className="px-4 py-5">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                최근 글
              </p>
              <ul className="divide-y divide-border">
                {entries.slice(0, 4).map((entry) => (
                  <li key={entry.slug}>
                    <Link
                      href={`/posts/${entry.slug}`}
                      onClick={close}
                      className="group flex items-center justify-between gap-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span className="truncate">{entry.title}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
