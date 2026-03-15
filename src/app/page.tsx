import Link from "next/link";

import { PostListItem } from "@/components/blog/post-list-item";
import { RecentlyViewedPosts } from "@/components/blog/recently-viewed-posts";
import { TagChip } from "@/components/blog/tag-chip";
import { HeroGridSceneShell } from "@/components/blog/three/hero-grid-scene-shell";
import { getAllPosts, getCategories, getFeaturedPosts, getLatestPosts } from "@/lib/blog/posts";
import { slugify } from "@/lib/blog/utils";

export default function HomePage() {
  const latestPosts = getLatestPosts(5);
  const featuredPosts = getFeaturedPosts(3);
  const categories = getCategories();
  const allPosts = getAllPosts();

  return (
    <>
      <RecentlyViewedPosts posts={allPosts} variant="home" />
      <div className="space-y-20">
        <section className="grid gap-8 border-b border-slate-200 pb-14 dark:border-stone-800 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
          <div className="relative overflow-hidden rounded-[32px] border border-slate-200/70 bg-white/72 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur dark:border-stone-700/70 dark:bg-[#2a2a2e]/72 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] md:p-10">
            <HeroGridSceneShell />
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-stone-400">Frontend Archive</p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 dark:text-stone-100 md:text-5xl">
              구현 기록을 문서처럼 정리하는 개인 프론트엔드 블로그
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600 dark:text-stone-300">
              React, Next.js, TypeScript, UI 설계와 트러블슈팅을 읽기 좋은 글로 정리합니다. 홈은 쇼케이스보다
              탐색을 우선하고, 각 글은 오래 남는 문서처럼 유지되도록 설계했습니다.
            </p>
            <div className="mt-10 flex flex-wrap gap-3 text-sm text-slate-500 dark:text-stone-400">
              <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 dark:border-stone-700 dark:bg-[#313136]">Subtle Three.js Hero</span>
              <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 dark:border-stone-700 dark:bg-[#313136]">Reading-first Layout</span>
              <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 dark:border-stone-700 dark:bg-[#313136]">Archive-friendly Structure</span>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white/80 p-6 backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-stone-400">Representative Categories</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.slice(0, 6).map((category) => (
                <TagChip
                  key={category.slug}
                  label={`${category.name} (${category.count})`}
                  href={`/categories/${slugify(category.name)}`}
                />
              ))}
            </div>
            <div className="mt-8 border-t border-slate-200 pt-5 dark:border-stone-800">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-stone-400">Quick Access</p>
              <div className="mt-4 space-y-3 text-sm text-slate-600 dark:text-stone-200">
                <Link href="/posts" className="flex items-center justify-between transition-colors hover:text-slate-950 dark:text-stone-200 dark:hover:text-white">
                  <span>전체 글 아카이브 보기</span>
                  <span>→</span>
                </Link>
                <Link href="/about" className="flex items-center justify-between transition-colors hover:text-slate-950 dark:text-stone-200 dark:hover:text-white">
                  <span>작성자와 스택 보기</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="mb-8 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-stone-400">Latest Posts</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-stone-100">최근에 정리한 글</h2>
              </div>
              <Link href="/posts" className="text-sm text-slate-600 transition-colors hover:text-slate-950 dark:text-stone-300 dark:hover:text-stone-100">
                전체 글 보기
              </Link>
            </div>
            <div>
              {latestPosts.map((post) => (
                <PostListItem key={post.slug} post={post} />
              ))}
            </div>
          </div>

          <aside className="space-y-8">
            <section className="rounded-[28px] border border-slate-200 bg-white/80 p-6 backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-stone-400">Recommended</p>
              <div className="mt-5 space-y-5">
                {featuredPosts.map((post) => (
                  <Link key={post.slug} href={`/posts/${post.slug}`} className="block border-b border-slate-200 pb-5 last:border-none last:pb-0 dark:border-stone-800">
                    <p className="text-sm text-slate-500 dark:text-stone-400">{post.category}</p>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950 dark:text-stone-100">{post.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-stone-200">{post.summary}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white/80 p-6 backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-stone-400">Reading Style</p>
              <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-600 dark:text-stone-200">
                <li>본문 폭을 넓히지 않고 코드와 텍스트의 리듬을 분리했습니다.</li>
                <li>카테고리, 태그, 관련 글 중심으로 다시 찾기 쉬운 구조를 유지합니다.</li>
                <li>1차 버전은 단순한 정적 구조에 집중하고, 이후 검색과 다크모드를 확장할 수 있습니다.</li>
              </ul>
            </section>
          </aside>
        </section>
      </div>
    </>
  );
}
