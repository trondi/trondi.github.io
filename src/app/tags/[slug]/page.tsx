import { notFound } from "next/navigation";

import { PostListItem } from "@/components/blog/post-list-item";
import { getPostsByTagSlug, getTags } from "@/lib/blog/posts";

type TagPageProps = {
  params: {
    slug: string;
  };
};

export function generateStaticParams() {
  return getTags().map((tag) => ({ slug: tag.slug }));
}

export default function TagPage({ params }: TagPageProps) {
  const posts = getPostsByTagSlug(params.slug);
  const tag = getTags().find((item) => item.slug === params.slug);

  if (!tag) {
    notFound();
  }

  return (
    <div className="space-y-10">
      <section className="max-w-3xl border-b border-border pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Tag</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">#{tag.name}</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">{tag.count}개의 글이 연결되어 있습니다.</p>
      </section>

      <div>
        {posts.map((post) => (
          <PostListItem key={post.slug} post={post} />
        ))}
      </div>
    </div>
  );
}
