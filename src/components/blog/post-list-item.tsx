import Link from "next/link";

import { PostSummary } from "@/lib/blog/types";
import { formatDate, slugify } from "@/lib/blog/utils";

type PostListItemProps = {
  post: PostSummary;
  idx?: number;
};

export function PostListItem({ post, idx }: PostListItemProps) {
  const num = idx !== undefined ? String(idx + 1).padStart(2, "0") : null;

  return (
    <article className="post-item group relative rounded-r-md border-b border-l-2 border-border border-l-transparent py-6 pl-4 transition-[border-left-color,padding-left,background] duration-200 first:pt-0 hover:border-l-[hsl(var(--ring))] hover:bg-[hsl(var(--ring)/0.06)] hover:pl-6">
      <div className="flex gap-5">
        {num && (
          <span
            className="shrink-0 select-none pt-0.5 font-mono text-[11px] leading-6 text-muted-foreground/40"
            aria-hidden
          >
            {num}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[11px] tracking-wide text-[hsl(var(--ring))] opacity-85">
              {"// "}
              {post.category}
            </span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
              {formatDate(post.date)} · {post.readingTime}
            </span>
          </div>

          <h3
            className="text-[1.05rem] font-semibold leading-snug tracking-[-0.02em] text-foreground"
            style={{ viewTransitionName: `post-title-${post.slug}` }}
          >
            {/* stretched link — after:absolute after:inset-0으로 카드 전체를 클릭 가능하게 */}
            <Link
              href={`/posts/${post.slug}`}
              className="transition-colors hover:text-muted-foreground after:absolute after:inset-0 after:rounded-r-md"
            >
              {post.title}
            </Link>
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-[1.75] text-muted-foreground">
            {post.summary}
          </p>

          {/* 태그 링크는 relative z-10으로 stretched link 위에 올라와 독립적으로 클릭 가능 */}
          <div className="relative z-10 mt-3 flex flex-wrap gap-3">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/tags/${slugify(tag)}`}
                className="font-mono text-[10px] text-muted-foreground/55 transition-colors hover:text-[hsl(var(--ring))]"
              >
                #{tag}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
