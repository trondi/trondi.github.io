import { notFound } from "next/navigation";

import { PostListItem } from "@/components/blog/post-list-item";
import { RecentlyViewedPosts } from "@/components/blog/recently-viewed-posts";
import { CategoryScene } from "@/components/blog/three/category-scene";
import { getAllPosts, getCategories, getPostsByCategorySlug } from "@/lib/blog/posts";

type CategoryPageProps = {
  params: {
    slug: string;
  };
};

export function generateStaticParams() {
  return getCategories().map((category) => ({ slug: category.slug }));
}

export default function CategoryPage({ params }: CategoryPageProps) {
  const posts = getPostsByCategorySlug(params.slug);
  const category = getCategories().find((item) => item.slug === params.slug);
  const allPosts = getAllPosts();

  if (!category) {
    notFound();
  }

  return (
    <>
      <RecentlyViewedPosts posts={allPosts} variant="category" />
      <div className="space-y-10">
        <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-white/82 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/72">
          <div className="grid gap-8 px-6 py-7 md:px-8 md:py-8 lg:grid-cols-[minmax(0,1.1fr)_360px] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">Category</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {category.name}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">
                {category.count}개의 글이 정리되어 있습니다. 카테고리의 성격에 맞춘 시각적 톤을 오른쪽 패널에
                배치해, 텍스트 흐름을 해치지 않으면서 분위기만 보강했습니다.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-zinc-700 dark:bg-zinc-900">
                  Focused Archive
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-zinc-700 dark:bg-zinc-900">
                  Category-specific Scene
                </span>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-4 rounded-[28px] bg-[radial-gradient(circle_at_top,rgba(148,163,184,0.18),transparent_62%)]" />
              <div className="relative overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.82))] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05)] dark:border-zinc-700 dark:bg-zinc-900">
                <CategoryScene slug={params.slug} />
              </div>
            </div>
          </div>
        </section>

        <div>
          {posts.map((post) => (
            <PostListItem key={post.slug} post={post} />
          ))}
        </div>
      </div>
    </>
  );
}
