import { notFound } from "next/navigation";

import { PostListItem } from "@/components/blog/post-list-item";
import { RecentlyViewedPosts } from "@/components/blog/recently-viewed-posts";
import { getAllPosts, getCategories, getPostsByCategorySlug } from "@/lib/blog/posts";

// ─── Per-category accent palette ─────────────────────────────────────────────
// Each category gets one hue; light/dark opacity controlled in CSS.
const CATEGORY_ACCENT: Record<string, { light: string; dark: string; label: string }> = {
  frontend:              { light: "bg-indigo-500/[0.08]",  dark: "dark:bg-indigo-400/[0.11]",  label: "Frontend 개발 전반의 구현 기록을 정리합니다." },
  "react-next-js":       { light: "bg-cyan-500/[0.08]",    dark: "dark:bg-cyan-400/[0.11]",    label: "React · Next.js 앱 구조, 렌더링, 패턴을 다룹니다." },
  "javascript-typescript":{ light: "bg-amber-500/[0.08]",  dark: "dark:bg-amber-400/[0.10]",   label: "JS · TS 언어 특성과 실전 타입 활용을 정리합니다." },
  "css-ui":              { light: "bg-rose-500/[0.07]",    dark: "dark:bg-rose-400/[0.10]",    label: "UI 설계, 스타일링, 컴포넌트 디자인 기록입니다." },
  "trouble-shooting":    { light: "bg-orange-500/[0.07]",  dark: "dark:bg-orange-400/[0.10]",  label: "디버깅·에러 해결 과정을 단계별로 기록합니다." },
  til:                   { light: "bg-emerald-500/[0.07]", dark: "dark:bg-emerald-400/[0.09]", label: "오늘 배운 것을 짧고 빠르게 기록합니다." },
  project:               { light: "bg-violet-500/[0.07]",  dark: "dark:bg-violet-400/[0.10]",  label: "사이드 프로젝트 설계와 회고를 담습니다." },
};

const DEFAULT_ACCENT = { light: "bg-slate-500/[0.07]", dark: "dark:bg-slate-400/[0.09]", label: "카테고리의 글 목록입니다." };

// ─── Params ───────────────────────────────────────────────────────────────────
type CategoryPageProps = { params: { slug: string } };

export function generateStaticParams() {
  return getCategories().map((c) => ({ slug: c.slug }));
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CategoryPage({ params }: CategoryPageProps) {
  const posts    = getPostsByCategorySlug(params.slug);
  const category = getCategories().find((c) => c.slug === params.slug);
  const allPosts = getAllPosts();

  if (!category) notFound();

  const accent = CATEGORY_ACCENT[params.slug] ?? DEFAULT_ACCENT;

  return (
    <>
      <RecentlyViewedPosts posts={allPosts} variant="category" />

      <div className="space-y-12">

        {/* ── Category header ──────────────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-background px-8 py-10 md:px-12 md:py-14">

          {/* CSS glow blob — replaces Three.js scene */}
          <div
            aria-hidden
            className={`pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full blur-[88px] transition-colors ${accent.light} ${accent.dark}`}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute -bottom-10 -right-4 h-48 w-48 rounded-full blur-[60px] opacity-60 ${accent.light} ${accent.dark}`}
          />

          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            {/* Left — text */}
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.36em] text-muted-foreground">
                Category
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-foreground md:text-5xl">
                {category!.name}
              </h1>
              <p className="mt-4 max-w-xl text-[15px] leading-[1.75] text-muted-foreground">
                {accent.label}
              </p>
            </div>

            {/* Right — post count stat */}
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold tabular-nums tracking-tight text-foreground">
                {category!.count}
              </span>
              <span className="text-sm text-muted-foreground">개의 글</span>
            </div>
          </div>
        </section>

        {/* ── Post list ────────────────────────────────────────────────── */}
        <div>
          <div className="mb-8 flex items-center justify-between border-b border-border pb-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              All Posts
            </p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {posts.length}개
            </span>
          </div>

          {posts.length > 0 ? (
            posts.map((post) => (
              <PostListItem key={post.slug} post={post} />
            ))
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              아직 글이 없습니다.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
