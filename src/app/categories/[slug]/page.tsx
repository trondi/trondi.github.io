import { notFound } from "next/navigation";

import { PostListItem } from "@/components/blog/post-list-item";
import { RecentlyViewedPosts } from "@/components/blog/recently-viewed-posts";
import { CategorySceneShell } from "@/components/blog/three/category-scene-shell";
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
        <section className="glass-surface rounded-[36px]">
          <div className="relative z-10 grid gap-6 px-5 py-5 md:px-7 md:py-7 lg:grid-cols-[minmax(0,1.08fr)_360px] lg:items-center">
            <div className="glass-card rounded-[30px] p-6 md:p-7">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-400">Category</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {category.name}
              </h1>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-700 dark:text-slate-300">
                {category.count}개의 글이 정리되어 있습니다. 카테고리 성격에 맞춘 씬을 유리 패널 안에 담아,
                정보 밀도는 유지하면서 화면의 분위기만 부드럽게 올렸습니다.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-600 dark:text-slate-300">
                <span className="glass-pill rounded-full px-3 py-1.5">
                  Focused Archive
                </span>
                <span className="glass-pill rounded-full px-3 py-1.5">
                  Category-specific Scene
                </span>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[34px]">
              <div className="glass-scene-glow absolute -inset-3 rounded-[34px] opacity-90 blur-2xl" />
              <div className="glass-card-strong rounded-[30px] p-4">
                <div className="glass-scene-tint absolute inset-0" />
                <div className="relative z-10">
                  <CategorySceneShell slug={params.slug} />
                </div>
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
