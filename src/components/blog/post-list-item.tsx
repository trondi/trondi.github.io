// Server component — CSS Scroll-Timeline handles reveal (no GSAP needed)
import Link from "next/link";

import { TagChip } from "@/components/blog/tag-chip";
import { PostSummary } from "@/lib/blog/types";
import { formatDate, slugify } from "@/lib/blog/utils";

type PostListItemProps = {
  post: PostSummary;
};

export function PostListItem({ post }: PostListItemProps) {
  return (
    <article className="post-item border-b border-border py-6 first:pt-0">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{formatDate(post.date)}</span>
        <span className="opacity-40">·</span>
        <Link
          href={`/categories/${slugify(post.category)}`}
          className="transition-colors hover:text-foreground"
        >
          {post.category}
        </Link>
        <span className="opacity-40">·</span>
        <span>{post.readingTime}</span>
      </div>
      <h3
        className="text-[1.1rem] font-bold leading-snug tracking-[-0.02em] text-foreground"
        style={{ viewTransitionName: `post-title-${post.slug}` }}
      >
        <Link
          href={`/posts/${post.slug}`}
          className="transition-colors hover:text-muted-foreground"
        >
          {post.title}
        </Link>
      </h3>
      <p className="mt-2 max-w-3xl text-sm leading-[1.75] text-muted-foreground">
        {post.summary}
      </p>
      <div className="mt-3.5 flex flex-wrap gap-2">
        {post.tags.map((tag) => (
          <TagChip key={tag} label={tag} href={`/tags/${slugify(tag)}`} />
        ))}
      </div>
    </article>
  );
}
