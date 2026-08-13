import Link from "next/link";

import { PostListItem } from "@/components/blog/post-list-item";
import { RecentlyViewedPosts } from "@/components/blog/recently-viewed-posts";
import { TagConstellationWindow } from "@/components/blog/tag-constellation";
import { getAllPosts, getFeaturedPosts, getLatestPosts } from "@/lib/blog/posts";
import { getTagConstellation } from "@/lib/blog/tag-graph";

const HERO_CATS = ["Frontend", "React / Next.js", "CSS / UI", "TypeScript", "TIL"] as const;

export default function HomePage() {
  const latestPosts   = getLatestPosts(5);
  const featuredPosts = getFeaturedPosts(3);
  const allPosts      = getAllPosts();
  const constellation = getTagConstellation();

  return (
    <>
      <RecentlyViewedPosts posts={allPosts} variant="home" />
      <div className="space-y-24">

        {/* ── Hero — 텍스트 + 태그 성좌 브라우저 창 ───────────────────────── */}
        <section className="grid items-center gap-11 py-14 lg:grid-cols-[minmax(0,1fr)_580px]">

          {/* Text */}
          <div>
            <p className="fade-up fade-d1 mb-[18px] font-mono text-[11px] tracking-[0.12em] text-[hsl(var(--ring))] opacity-85">
              &gt; frontend_archive.init()
            </p>

            <h1
              className="fade-up fade-d2 mb-4"
              style={{ fontSize: "clamp(1.9rem, 3.6vw, 2.8rem)", fontWeight: 650, lineHeight: 1.16, letterSpacing: "-0.025em" }}
            >
              구현 기록을<br />
              <span className="text-[hsl(var(--ring))]">문서처럼</span>{" "}
              정리합니다.
              <span className="hero-blink-cursor" aria-hidden />
            </h1>

            <p
              className="fade-up fade-d3 mb-6 font-mono text-muted-foreground"
              style={{ fontSize: 12, lineHeight: 1.85, maxWidth: 400 }}
            >
              <span className="opacity-55">{"// "}</span>
              React, Next.js, TypeScript, UI 설계와<br />
              트러블슈팅을 읽기 좋은 글로 정리합니다.
            </p>

            <div className="fade-up fade-d4 mb-7 flex flex-wrap gap-2">
              {HERO_CATS.map((c) => (
                <span
                  key={c}
                  className="glass-pill-surface rounded-full px-[13px] py-[5px] font-mono text-[10.5px] tracking-[0.03em] text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </div>

            <Link
              href="/posts"
              className="glass-pill-surface fade-up fade-d5 inline-flex w-fit rounded-full px-[22px] py-2.5 font-mono text-[12px] tracking-[0.04em] text-[hsl(var(--ring))] transition-colors hover:bg-white/85 hover:text-foreground"
            >
              [ 전체 글 보기 ↓ ]
            </Link>

            <div className="mt-8 font-mono text-muted-foreground" style={{ fontSize: 9, letterSpacing: "0.08em", lineHeight: 1.8 }}>
              <div className="text-[hsl(var(--ring))] opacity-60">◎ TROND ARCHIVE</div>
              <div>Seoul, KR — Frontend Engineer</div>
            </div>
          </div>

          {/* Tag constellation */}
          <div className="fade-up fade-d3">
            <TagConstellationWindow data={constellation} />
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
