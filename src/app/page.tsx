import Link from "next/link";

import { HeroTorusSceneShell } from "@/components/blog/three/hero-torus-scene-shell";
import { PostListItem } from "@/components/blog/post-list-item";
import { RecentlyViewedPosts } from "@/components/blog/recently-viewed-posts";
import { getAllPosts, getFeaturedPosts, getLatestPosts } from "@/lib/blog/posts";

const HERO_CATS = ["Frontend", "React / Next.js", "CSS / UI", "TypeScript", "TIL"] as const;

export default function HomePage() {
  const latestPosts   = getLatestPosts(5);
  const featuredPosts = getFeaturedPosts(3);
  const allPosts      = getAllPosts();

  return (
    <>
      <RecentlyViewedPosts posts={allPosts} variant="home" />
      <div className="space-y-24">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border" style={{ height: "88vh", minHeight: 540 }}>

          {/* Three.js torus rings */}
          <HeroTorusSceneShell />

          {/* Vignette */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse 70% 90% at 20% 55%, transparent 30%, hsl(var(--background) / 0.92) 78%)" }}
            aria-hidden
          />

          {/* Scanline */}
          <div className="hero-scanline" aria-hidden />

          {/* Content */}
          <div className="relative z-10 flex h-full flex-col justify-center px-8" style={{ maxWidth: 1120, margin: "0 auto" }}>

            {/* Terminal prompt */}
            <p className="fade-up fade-d1 font-mono text-[11px] tracking-[0.12em] text-[hsl(var(--ring))] opacity-75 mb-[22px]">
              &gt; frontend_archive.init()
            </p>

            {/* Headline */}
            <h1
              className="fade-up fade-d2 mb-[22px]"
              style={{ fontSize: "clamp(2.3rem, 5.2vw, 4rem)", fontWeight: 600, lineHeight: 1.13, letterSpacing: "-0.025em", maxWidth: 560 }}
            >
              구현 기록을<br />
              <span className="text-[hsl(var(--ring))]">문서처럼</span>{" "}
              정리합니다.
              <span className="hero-blink-cursor" aria-hidden />
            </h1>

            {/* Subtext */}
            <p
              className="fade-up fade-d3 font-mono text-muted-foreground mb-8"
              style={{ fontSize: 12, lineHeight: 1.85, maxWidth: 420 }}
            >
              <span className="opacity-50">// </span>
              React, Next.js, TypeScript, UI 설계와<br />
              트러블슈팅을 읽기 좋은 글로 정리합니다.
            </p>

            {/* Category chips */}
            <div className="fade-up fade-d4 flex flex-wrap gap-2 mb-10">
              {HERO_CATS.map((c) => (
                <span
                  key={c}
                  className="font-mono text-[10px] text-muted-foreground border border-border rounded px-[10px] py-1 tracking-[0.04em]"
                  style={{ background: "hsl(var(--ring) / 0.07)" }}
                >
                  {c}
                </span>
              ))}
            </div>

            {/* CTA */}
            <Link
              href="/posts"
              className="fade-up fade-d5 font-mono text-[12px] tracking-[0.06em] border border-[hsl(var(--ring))] rounded px-5 py-[9px] inline-flex w-fit transition-colors hover:bg-[hsl(var(--ring))] hover:text-white"
              style={{ color: "hsl(var(--ring))", background: "hsl(var(--ring) / 0.08)" }}
            >
              [ 전체 글 보기 ↓ ]
            </Link>

            {/* Bottom-left coordinates */}
            <div
              className="absolute bottom-7 font-mono text-muted-foreground"
              style={{ fontSize: 9, letterSpacing: "0.08em", lineHeight: 1.8 }}
            >
              <div className="text-[hsl(var(--ring))] opacity-50">◎ TROND ARCHIVE</div>
              <div>Seoul, KR — Frontend Engineer</div>
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
