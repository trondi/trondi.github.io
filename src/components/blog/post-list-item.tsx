import Link from "next/link";

import { TagChip } from "@/components/blog/tag-chip";
import { PostSummary } from "@/lib/blog/types";
import { formatDate, slugify } from "@/lib/blog/utils";

type PostListItemProps = {
  post: PostSummary;
};

export function PostListItem({ post }: PostListItemProps) {
  return (
    <article className="border-b border-slate-200 py-6 first:pt-0 dark:border-slate-800">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        <span>{formatDate(post.date)}</span>
        <span>·</span>
        <Link
          href={`/categories/${slugify(post.category)}`}
          className="transition-colors hover:text-slate-900 dark:hover:text-white"
        >
          {post.category}
        </Link>
        <span>·</span>
        <span>{post.readingTime}</span>
      </div>
      <h3 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
        <Link href={`/posts/${post.slug}`} className="transition-colors hover:text-slate-700 dark:hover:text-slate-200">
          {post.title}
        </Link>
      </h3>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">{post.summary}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {post.tags.map((tag) => (
          <TagChip key={tag} label={tag} href={`/tags/${slugify(tag)}`} />
        ))}
      </div>
    </article>
  );
}
