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
  const [isDark, setIsDark] = useState(false);

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

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDark(root.classList.contains("dark"));

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

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

  const panelClassName =
    variant === "home"
      ? "hidden min-[1480px]:block"
      : variant === "category"
        ? "hidden min-[1480px]:block"
        : "hidden min-[1520px]:block";

  const cardClassName =
    variant === "home"
      ? "pointer-events-auto fixed right-6 top-52 w-60 rounded-[24px] border border-slate-200 bg-white/84 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur dark:border-stone-700 dark:bg-[#232326]/95"
      : variant === "category"
        ? "pointer-events-auto fixed right-6 top-52 w-60 rounded-[24px] border border-slate-200 bg-white/84 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.07)] backdrop-blur dark:border-stone-700 dark:bg-[#232326]/95"
        : "pointer-events-auto fixed right-6 top-52 w-60 rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur dark:border-stone-700 dark:bg-[#232326]/95";

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
                    "block rounded-2xl border border-slate-200/80 transition-colors hover:border-slate-300 hover:bg-white dark:border-stone-600 dark:hover:border-stone-500 dark:hover:bg-stone-700/90",
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
              "border-slate-200 dark:border-zinc-700",
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
                  className={cn(
                    "block rounded-2xl px-3 py-2.5 transition-colors",
                    isDark
                      ? "border border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800"
                      : "border border-slate-200/80 hover:border-slate-300 hover:bg-white",
                  )}
                >
                  <p
                    className={cn(
                      "text-[11px] uppercase tracking-[0.2em]",
                      isDark ? "text-zinc-500" : "text-slate-400",
                    )}
                  >
                    Previous
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[13px] font-semibold leading-5 tracking-tight",
                      isDark ? "text-zinc-100" : "text-slate-950",
                    )}
                  >
                    {previousPost.title}
                  </p>
                </Link>
              ) : null}
              {nextPost ? (
                <Link
                  href={`/posts/${nextPost.slug}`}
                  className={cn(
                    "block rounded-2xl px-3 py-2.5 transition-colors",
                    isDark
                      ? "border border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800"
                      : "border border-slate-200/80 hover:border-slate-300 hover:bg-white",
                  )}
                >
                  <p
                    className={cn(
                      "text-[11px] uppercase tracking-[0.2em]",
                      isDark ? "text-zinc-500" : "text-slate-400",
                    )}
                  >
                    Next
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-[13px] font-semibold leading-5 tracking-tight",
                      isDark ? "text-zinc-100" : "text-slate-950",
                    )}
                  >
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
