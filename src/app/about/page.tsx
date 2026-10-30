import Link from "next/link";

import { TagChip } from "@/components/blog/tag-chip";
import { siteConfig } from "@/lib/blog/config";
import { getAllPosts, getCategories, getTags } from "@/lib/blog/posts";
import { formatDate } from "@/lib/blog/utils";

const stacks = ["React", "Next.js", "TypeScript", "Tailwind CSS", "Design Systems", "Performance"];

export const metadata = {
  title: "About",
  description: "서울에서 프론트엔드를 만드는 Trond의 소개와, 이 블로그를 쓰는 이유",
};

export default function AboutPage() {
  const posts = getAllPosts();
  const topCategory = [...getCategories()].sort((a, b) => b.count - a.count)[0];
  const topTags = [...getTags()].sort((a, b) => b.count - a.count).slice(0, 8);
  const latest = posts.slice(0, 3);

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <section className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">About</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          안녕하세요, {siteConfig.author.name}예요 <span aria-hidden>👋</span>
        </h1>
        <div className="mt-6 space-y-4 text-lg leading-8 text-muted-foreground">
          <p>
            서울에서 프론트엔드 개발을 하고 있어요. 주로 React, Next.js, TypeScript로 화면을 만들고, 그러다 막혔던 것과
            새로 알게 된 것을 여기에 적어 둬요.
          </p>
          <p>
            이 블로그는 잘 정리된 정답집이라기보다 <b className="font-semibold text-foreground">나중의 내가 다시 꺼내 볼 노트</b>에
            가까워요. 그래서 깔끔한 결과보다 헤맨 과정과 시행착오가 더 많이 들어 있어요. 같은 데서 막힌 누군가에게도 도움이
            되면 좋겠어요.
          </p>
        </div>

        {/* 숫자로 보는 블로그 — 실제 글 데이터에서 계산 */}
        <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card/70 p-4">
            <dt className="text-xs text-muted-foreground">지금까지 쓴 글</dt>
            <dd className="mt-1 text-2xl font-semibold text-foreground">{posts.length}편</dd>
          </div>
          {topCategory && (
            <div className="rounded-2xl border border-border bg-card/70 p-4">
              <dt className="text-xs text-muted-foreground">제일 많이 쓴 분야</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">{topCategory.name}</dd>
            </div>
          )}
          {latest[0] && (
            <div className="col-span-2 rounded-2xl border border-border bg-card/70 p-4 sm:col-span-1">
              <dt className="text-xs text-muted-foreground">마지막으로 쓴 날</dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">{formatDate(latest[0].date)}</dd>
            </div>
          )}
        </dl>

        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">자주 쓰는 이야기</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {topTags.map((tag) => (
              <TagChip key={tag.slug} href={`/tags/${tag.slug}`} label={`${tag.name} (${tag.count})`} />
            ))}
          </div>
        </div>

        <div className="mt-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">손에 익은 도구</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {stacks.map((stack) => (
              <TagChip key={stack} label={stack} />
            ))}
          </div>
        </div>

        {latest.length > 0 && (
          <div className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">최근에 쓴 글</p>
            <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card/70">
              {latest.map((post) => (
                <li key={post.slug}>
                  <Link
                    href={`/posts/${post.slug}`}
                    className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm transition-colors hover:text-foreground"
                  >
                    <span className="text-foreground">{post.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDate(post.date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className="h-fit space-y-4">
        <div className="rounded-[28px] border border-border bg-card/80 p-6 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">편하게 말 걸어 주세요</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            글에 대한 질문, 틀린 부분 지적, 그냥 인사도 다 반가워요.
          </p>
          <div className="mt-5 space-y-4 text-sm text-muted-foreground">
            <Link href="/guestbook" className="flex items-center justify-between transition-colors hover:text-foreground">
              <span>방명록에 한 줄 남기기</span>
              <span>→</span>
            </Link>
            <a href={`mailto:${siteConfig.author.email}`} className="flex items-center justify-between transition-colors hover:text-foreground">
              <span>메일 보내기</span>
              <span>→</span>
            </a>
            <Link href={siteConfig.author.github} className="flex items-center justify-between transition-colors hover:text-foreground">
              <span>GitHub 구경하기</span>
              <span>→</span>
            </Link>
          </div>
        </div>
        <Link
          href="/island"
          className="block rounded-[28px] border border-border bg-card/80 p-6 backdrop-blur transition-colors hover:border-[hsl(var(--ring)/0.4)]"
        >
          <p className="text-sm font-semibold text-foreground">
            <span aria-hidden>🏝</span> 글 읽다 지치면
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            블로그 한쪽에 작은 섬을 만들어 뒀어요. 나무도 흔들고 꽃도 심으면서 쉬었다 가세요 →
          </p>
        </Link>
      </aside>
    </div>
  );
}
