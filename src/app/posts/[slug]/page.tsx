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
        <div className="border-b border-border pb-8">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Link href={`/categories/${slugify(post.category)}`} className="transition-colors hover:text-foreground">
              {post.category}
            </Link>
            <span>·</span>
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span>·</span>
            <span>{post.readingTime}</span>
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            {post.title}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{post.summary}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <TagChip key={tag} label={tag} href={`/tags/${slugify(tag)}`} />
            ))}
          </div>
        </div>

        <div className="mt-12 max-w-3xl">
          <MarkdownRenderer blocks={post.blocks} />
        </div>

        <div className="mt-16 grid gap-6 border-t border-border pt-8 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Previous</p>
            {adjacent.previous ? (
              <Link href={`/posts/${adjacent.previous.slug}`} className="mt-3 block text-lg font-semibold tracking-tight text-foreground transition-colors hover:text-muted-foreground">
                {adjacent.previous.title}
              </Link>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">이전 글이 없습니다.</p>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Next</p>
            {adjacent.next ? (
              <Link href={`/posts/${adjacent.next.slug}`} className="mt-3 block text-lg font-semibold tracking-tight text-foreground transition-colors hover:text-muted-foreground">
                {adjacent.next.title}
              </Link>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">다음 글이 없습니다.</p>
            )}
          </div>
        </div>

        {relatedPosts.length ? (
          <section className="mt-16 border-t border-border pt-10">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Related Posts</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">같이 읽으면 좋은 글</h2>
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
