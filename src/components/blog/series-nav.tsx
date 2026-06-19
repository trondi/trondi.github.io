import Link from "next/link";

import { SeriesEntry } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type SeriesNavProps = {
  name: string;
  entries: SeriesEntry[];
};

export function SeriesNav({ name, entries }: SeriesNavProps) {
  const currentIndex = entries.findIndex((e) => e.current);
  const total = entries.length;

  return (
    <nav
      aria-label={`${name} 시리즈 목록`}
      className="my-10 overflow-hidden rounded-2xl border border-border bg-secondary/30"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Series
          </span>
          <span className="text-sm font-semibold text-foreground">{name}</span>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {currentIndex + 1} / {total}
        </span>
      </div>

      <ol className="divide-y divide-border">
        {entries.map((entry, i) => (
          <li key={entry.slug}>
            {entry.current ? (
              <div
                aria-current="true"
                className="flex items-center gap-3 bg-[hsl(var(--ring)/0.08)] px-5 py-2.5"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--ring))] text-[10px] font-bold tabular-nums text-background">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {entry.title}
                </span>
              </div>
            ) : (
              <Link
                href={`/posts/${entry.slug}`}
                className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-secondary"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-medium tabular-nums text-muted-foreground transition-colors group-hover:border-[hsl(var(--ring)/0.4)] group-hover:text-foreground">
                  {i + 1}
                </span>
                <span
                  className={cn(
                    "text-sm text-muted-foreground transition-colors group-hover:text-foreground",
                  )}
                >
                  {entry.title}
                </span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
