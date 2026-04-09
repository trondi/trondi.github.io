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
      <div className="space-y-24">

        {/* Hero */}
        <section className="relative min-h-[480px] border-b border-border pb-16 pt-12">
          {/* Three.js as full-width background */}
          <div className="absolute inset-0 overflow-hidden">
            <HeroGridSceneShell />
          </div>

          {/* Content */}
          <div className="relative z-10 grid gap-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
            <div className="flex flex-col justify-end">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
                Frontend Archive
              </p>
              <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
                구현 기록을<br className="hidden sm:block" /> 문서처럼 정리합니다
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
                React, Next.js, TypeScript, UI 설계와 트러블슈팅을 읽기 좋은 글로 정리합니다.
              </p>
              <div className="mt-8 flex flex-wrap gap-2 text-sm">
                <span className="glass-pill rounded-full px-3 py-1 text-xs">Three.js</span>
                <span className="glass-pill rounded-full px-3 py-1 text-xs">Reading-first</span>
                <span className="glass-pill rounded-full px-3 py-1 text-xs">Archive-friendly</span>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              {/* Categories */}
              <div className="glass-card rounded-2xl p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Categories
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {categories.slice(0, 6).map((category) => (
                    <TagChip
                      key={category.slug}
                      label={`${category.name} (${category.count})`}
                      href={`/categories/${slugify(category.name)}`}
                    />
                  ))}
                </div>
              </div>

              {/* Quick links */}
              <div className="space-y-2 text-sm">
                <Link
                  href="/posts"
                  className="glass-link flex items-center justify-between rounded-xl px-4 py-3 text-foreground"
                >
                  <span>전체 글 아카이브 보기</span>
                  <span className="text-muted-foreground">→</span>
                </Link>
                <Link
                  href="/about"
                  className="glass-link flex items-center justify-between rounded-xl px-4 py-3 text-foreground"
                >
                  <span>작성자와 스택 보기</span>
                  <span className="text-muted-foreground">→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Latest posts + Sidebar */}
        <section className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_300px]">

          {/* Posts */}
          <div>
            <div className="mb-10 flex items-end justify-between gap-4 border-b border-border pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                  Latest Posts
                </p>
                <h2 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground">
                  최근에 정리한 글
                </h2>
              </div>
              <Link
                href="/posts"
                className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                전체 보기
              </Link>
            </div>
            <div>
              {latestPosts.map((post) => (
                <PostListItem key={post.slug} post={post} />
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-8">
            {/* Recommended */}
            <div>
              <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Recommended
              </p>
              <div className="space-y-6">
                {featuredPosts.map((post, i) => (
                  <Link
                    key={post.slug}
                    href={`/posts/${post.slug}`}
                    className="block group"
                  >
                    <p className="text-xs text-muted-foreground">{post.category}</p>
                    <h3 className="mt-1 text-sm font-semibold leading-snug text-foreground group-hover:text-muted-foreground transition-colors">
                      {post.title}
                    </h3>
                    {i < featuredPosts.length - 1 && (
                      <div className="mt-6 border-b border-border" />
                    )}
                  </Link>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* About reading style */}
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Reading Style
              </p>
              <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                <li>본문 폭을 넓히지 않고 코드와 텍스트의 리듬을 분리했습니다.</li>
                <li>카테고리, 태그, 관련 글 중심으로 다시 찾기 쉬운 구조를 유지합니다.</li>
              </ul>
            </div>
          </aside>
        </section>

      </div>
    </>
  );
}
