import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkdownRenderer } from "@/components/blog/markdown-renderer";
import { PostListItem } from "@/components/blog/post-list-item";
import { PostViewTracker } from "@/components/blog/post-view-tracker";
import { RecentlyViewedPosts } from "@/components/blog/recently-viewed-posts";
import { TableOfContents } from "@/components/blog/table-of-contents";
import { TagChip } from "@/components/blog/tag-chip";
import {
  getAdjacentPosts,
  getAllPosts,
  getPostBySlug,
  getPostSlugs,
  getRelatedPosts,
} from "@/lib/blog/posts";
import { formatDate, slugify } from "@/lib/blog/utils";

type PostPageProps = {
  params: {
    slug: string;
  };
};

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: PostPageProps): Metadata {
  const post = getPostBySlug(params.slug);

  if (!post) {
    return {};
  }

  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default function PostPage({ params }: PostPageProps) {
  const post = getPostBySlug(params.slug);

  if (!post) {
    notFound();
  }

  const adjacent = getAdjacentPosts(post.slug);
  const relatedPosts = getRelatedPosts(post.slug);
  const allPosts = getAllPosts();

  return (
    <div className="grid gap-12 xl:grid-cols-[minmax(0,1fr)_240px]">
      <PostViewTracker slug={post.slug} />
      <article className="min-w-0">
        <div className="border-b border-slate-200 pb-8 dark:border-stone-800">
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-stone-400">
            <Link href={`/categories/${slugify(post.category)}`} className="transition-colors hover:text-slate-950 dark:hover:text-stone-100">
              {post.category}
            </Link>
            <span>·</span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span>·</span>
            <span>{post.readingTime}</span>
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 dark:text-stone-100 md:text-5xl">
            {post.title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-600 dark:text-stone-300">{post.summary}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <TagChip key={tag} label={tag} href={`/tags/${slugify(tag)}`} />
            ))}
          </div>
        </div>

        <div className="mt-12 max-w-3xl">
          <MarkdownRenderer blocks={post.blocks} />
        </div>

        <div className="mt-16 grid gap-6 border-t border-slate-200 pt-8 dark:border-stone-800 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 dark:border-stone-800 dark:bg-[#2a2a2e]/76">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-stone-400">Previous</p>
            {adjacent.previous ? (
              <Link href={`/posts/${adjacent.previous.slug}`} className="mt-3 block text-lg font-semibold tracking-tight text-slate-950 dark:text-stone-100">
                {adjacent.previous.title}
              </Link>
            ) : (
              <p className="mt-3 text-sm text-slate-500 dark:text-stone-400">이전 글이 없습니다.</p>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 dark:border-stone-800 dark:bg-[#2a2a2e]/76">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-stone-400">Next</p>
            {adjacent.next ? (
              <Link href={`/posts/${adjacent.next.slug}`} className="mt-3 block text-lg font-semibold tracking-tight text-slate-950 dark:text-stone-100">
                {adjacent.next.title}
              </Link>
            ) : (
              <p className="mt-3 text-sm text-slate-500 dark:text-stone-400">다음 글이 없습니다.</p>
            )}
          </div>
        </div>

        {relatedPosts.length ? (
          <section className="mt-16 border-t border-slate-200 pt-10 dark:border-stone-800">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-stone-400">Related Posts</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 dark:text-stone-100">같이 읽으면 좋은 글</h2>
            </div>
            <div>
              {relatedPosts.map((related) => (
                <PostListItem key={related.slug} post={related} />
              ))}
            </div>
          </section>
        ) : null}
      </article>

      <div className="space-y-6">
        <TableOfContents items={post.toc} />
      </div>
      <RecentlyViewedPosts
        posts={allPosts}
        currentSlug={post.slug}
        previousPost={adjacent.previous}
        nextPost={adjacent.next}
        variant="post"
      />
    </div>
  );
}
