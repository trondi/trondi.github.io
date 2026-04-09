"use client";

import Link from "next/link";

import { useGsapReveal } from "@/hooks/use-gsap-reveal";
import { TagChip } from "@/components/blog/tag-chip";
import { PostSummary } from "@/lib/blog/types";
import { formatDate, slugify } from "@/lib/blog/utils";

type PostListItemProps = {
  post: PostSummary;
};

export function PostListItem({ post }: PostListItemProps) {
  const ref = useGsapReveal<HTMLElement>({ children: false, y: 18, duration: 0.5 });

  return (
    <article
      ref={ref}
      className="border-b border-border py-6 first:pt-0"
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
        <span>{formatDate(post.date)}</span>
        <span>·</span>
        <Link
          href={`/categories/${slugify(post.category)}`}
          className="transition-colors hover:text-foreground"
        >
          {post.category}
        </Link>
        <span>·</span>
        <span>{post.readingTime}</span>
      </div>
      <h3
        className="text-xl font-bold tracking-tight text-foreground"
        style={{ viewTransitionName: `post-title-${post.slug}` }}
      >
        <Link
          href={`/posts/${post.slug}`}
          className="transition-colors hover:text-muted-foreground"
        >
          {post.title}
        </Link>
      </h3>
      <p className="mt-2.5 max-w-3xl text-sm leading-7 text-muted-foreground">
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
