import Link from "next/link";

import { AnimatedHeadline } from "@/components/blog/animated-headline";
import { HeroTorusSceneShell } from "@/components/blog/three/hero-torus-scene-shell";
import { PostListItem } from "@/components/blog/post-list-item";
import { RecentlyViewedPosts } from "@/components/blog/recently-viewed-posts";
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

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative min-h-[72vh] overflow-hidden border-b border-border pb-16 pt-14">

          {/* Three.js torus rings — warm sienna oval shapes, mouse-reactive */}
          <HeroTorusSceneShell />

          {/* Vignette — torus 씬 가장자리를 배경색으로 페이드 */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 120% 100% at 60% 50%, transparent 35%, hsl(var(--background) / 0.85) 65%, hsl(var(--background) / 0.97) 100%)",
            }}
            aria-hidden
          />

          {/* Content grid */}
          <div className="relative grid gap-14 lg:grid-cols-[minmax(0,1.55fr)_minmax(200px,0.45fr)]">

            {/* Left — headline */}
            <div className="flex flex-col justify-end">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.38em] text-muted-foreground">
                Frontend Archive
              </p>
              <AnimatedHeadline
                lines={["구현 기록을", "문서처럼 정리합니다"]}
                className="hero-headline mt-3 max-w-2xl text-foreground"
                delay={120}
              />
              <p className="mt-5 max-w-xl text-[15px] leading-[1.8] text-muted-foreground">
                React, Next.js, TypeScript, UI 설계와 트러블슈팅을
                읽기 좋은 글로 정리합니다.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {(["Reading-first", "Archive-friendly", "Frontend"] as const).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border px-3 py-1 text-[11px] font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — categories + nav */}
            <div className="flex flex-col gap-0 pt-1">
              <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Categories
              </p>
              {categories.slice(0, 6).map((category) => (
                <Link
                  key={category.slug}
                  href={`/categories/${slugify(category.name)}`}
                  className="flex items-center justify-between rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span>{category.name}</span>
                  <span className="tabular-nums text-xs opacity-50">{category.count}</span>
                </Link>
              ))}
              <div className="mt-4 border-t border-border pt-4 flex flex-col gap-0">
                <Link
                  href="/posts"
                  className="flex items-center justify-between rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span>전체 글 보기</span>
                  <span className="opacity-50">→</span>
                </Link>
                <Link
                  href="/about"
                  className="flex items-center justify-between rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <span>소개</span>
                  <span className="opacity-50">→</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ── Latest posts + Sidebar ────────────────────────────────────────── */}
        <section className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_260px]">

          {/* Posts */}
          <div>
            <div className="mb-10 flex items-end justify-between gap-4 border-b border-border pb-5">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Latest Posts
                </p>
                <h2 className="mt-1.5 text-2xl font-bold tracking-[-0.02em] text-foreground">
                  최근에 정리한 글
                </h2>
              </div>
              <Link
                href="/posts"
                className="shrink-0 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                전체 보기 →
              </Link>
            </div>
            <div>
              {latestPosts.map((post, idx) => (
                <PostListItem key={post.slug} post={post} idx={idx} />
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-8">
            <div>
              <p className="mb-5 text-[10.5px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Recommended
              </p>
              <div className="space-y-6">
                {featuredPosts.map((post, i) => (
                  <Link key={post.slug} href={`/posts/${post.slug}`} className="block group">
                    <p className="text-xs text-muted-foreground">{post.category}</p>
                    <h3 className="mt-1 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-muted-foreground">
                      {post.title}
                    </h3>
                    {i < featuredPosts.length - 1 && (
                      <div className="mt-6 border-b border-border" />
                    )}
                  </Link>
                ))}
              </div>
            </div>

            <div className="border-t border-border" />

            <div>
              <p className="mb-4 text-[10.5px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Reading Style
              </p>
              <ul className="space-y-3 text-sm leading-[1.75] text-muted-foreground">
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
