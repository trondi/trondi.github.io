"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { PostSummary } from "@/lib/blog/types";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/blog/utils";

const STORAGE_KEY = "recently-viewed-posts";

type RecentlyViewedPostsProps = {
  posts: PostSummary[];
  currentSlug?: string;
  variant?: "home" | "category" | "post";
  previousPost?: PostSummary | null;
  nextPost?: PostSummary | null;
};

export function RecentlyViewedPosts({
  posts,
  currentSlug,
  previousPost,
  nextPost,
  variant = "post",
}: RecentlyViewedPostsProps) {
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      setRecentSlugs(parsed.filter((slug) => slug !== currentSlug));
    };

    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [currentSlug]);

  const recentPosts = useMemo(() => {
    return recentSlugs
      .map((slug) => posts.find((post) => post.slug === slug))
      .filter((post): post is PostSummary => Boolean(post))
      .slice(0, 3);
  }, [posts, recentSlugs]);

  const hasNavigation = Boolean(previousPost || nextPost);

  if (!recentPosts.length && !hasNavigation) {
    return null;
  }

  const panelClassName = variant === "post" ? "hidden min-[1520px]:block" : "hidden min-[1480px]:block";
  const cardClassName = cn(
    "glass-card pointer-events-auto fixed right-6 top-56 w-60 p-4",
    variant === "post" ? "rounded-[22px]" : "rounded-[24px]",
  );

  return (
    <aside
      className={cn(panelClassName, "pointer-events-none fixed inset-0 z-30")}
    >
      <div className={cardClassName}>
        {recentPosts.length ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-zinc-400">
              Recently Viewed
            </p>
            <div className="mt-4 space-y-3">
              {recentPosts.map((post, index) => (
                <Link
                  key={post.slug}
                  href={`/posts/${post.slug}`}
                  className={cn(
                    "glass-link block rounded-2xl",
                    variant === "post" ? "px-3 py-2.5" : "px-4 py-3",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5 text-[11px] font-medium text-slate-400 dark:text-zinc-500">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p
                        className={cn(
                          "font-semibold tracking-tight text-slate-950 dark:text-zinc-100",
                          variant === "post"
                            ? "text-[13px] leading-5"
                            : "text-sm leading-6",
                        )}
                      >
                        {post.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                        {formatDate(post.date)}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : null}

        {hasNavigation ? (
          <div
            className={cn(
              "glass-divider",
              recentPosts.length ? "mt-4 border-t pt-4" : "",
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-zinc-400">
              Move Between Posts
            </p>
            <div className="mt-3 space-y-2">
              {previousPost ? (
                <Link
                  href={`/posts/${previousPost.slug}`}
                  className="glass-link block rounded-2xl px-3 py-2.5"
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 dark:text-stone-400">
                    Previous
                  </p>
                  <p className="mt-1 text-[13px] font-semibold leading-5 tracking-tight text-slate-950 dark:text-stone-100">
                    {previousPost.title}
                  </p>
                </Link>
              ) : null}
              {nextPost ? (
                <Link
                  href={`/posts/${nextPost.slug}`}
                  className="glass-link block rounded-2xl px-3 py-2.5"
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 dark:text-stone-400">
                    Next
                  </p>
                  <p className="mt-1 text-[13px] font-semibold leading-5 tracking-tight text-slate-950 dark:text-stone-100">
                    {nextPost.title}
                  </p>
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
