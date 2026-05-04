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
    "pointer-events-auto fixed right-6 top-56 w-64 overflow-hidden p-4",
    "rounded-[26px] border border-[hsl(var(--ring)/0.28)] bg-[hsl(var(--ring)/0.08)] shadow-[0_18px_55px_hsl(var(--foreground)/0.12)] backdrop-blur-xl",
    "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,hsl(var(--ring)/0.55),transparent)]",
    variant === "post" ? "rounded-[22px]" : "rounded-[24px]",
  );

  return (
    <aside
      className={cn(panelClassName, "pointer-events-none fixed inset-0 z-30")}
    >
      <div className={cardClassName}>
        {recentPosts.length ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--ring))]">
                Reading Trail
              </p>
              <span className="rounded-full border border-[hsl(var(--ring)/0.25)] bg-background/55 px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
                recent
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {recentPosts.map((post, index) => (
                <Link
                  key={post.slug}
                  href={`/posts/${post.slug}`}
                  className={cn(
                    "block rounded-2xl border border-transparent bg-background/35 transition-colors hover:border-[hsl(var(--ring)/0.25)] hover:bg-background/70",
                    variant === "post" ? "px-3 py-2.5" : "px-4 py-3",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="pt-0.5 font-mono text-[10px] font-medium text-[hsl(var(--ring)/0.72)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p
                        className={cn(
                          "font-semibold tracking-tight text-foreground",
                          variant === "post"
                            ? "text-[13px] leading-5"
                            : "text-sm leading-6",
                        )}
                      >
                        {post.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
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
              recentPosts.length ? "mt-4 border-t border-[hsl(var(--ring)/0.18)] pt-4" : "",
            )}
          >
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Adjacent
            </p>
            <div className="mt-3 space-y-2">
              {previousPost ? (
                <Link
                  href={`/posts/${previousPost.slug}`}
                  className="block rounded-2xl border border-transparent bg-background/30 px-3 py-2.5 transition-colors hover:border-[hsl(var(--ring)/0.25)] hover:bg-background/70"
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
                    Previous
                  </p>
                  <p className="mt-1 text-[13px] font-semibold leading-5 tracking-tight text-foreground">
                    {previousPost.title}
                  </p>
                </Link>
              ) : null}
              {nextPost ? (
                <Link
                  href={`/posts/${nextPost.slug}`}
                  className="block rounded-2xl border border-transparent bg-background/30 px-3 py-2.5 transition-colors hover:border-[hsl(var(--ring)/0.25)] hover:bg-background/70"
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/60">
                    Next
                  </p>
                  <p className="mt-1 text-[13px] font-semibold leading-5 tracking-tight text-foreground">
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
