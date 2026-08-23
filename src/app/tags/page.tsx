import { TagChip } from "@/components/blog/tag-chip";
import { TagConstellationWindow } from "@/components/blog/tag-constellation";
import { getAllPosts, getTags } from "@/lib/blog/posts";
import { getTagConstellation } from "@/lib/blog/tag-graph";

export const metadata = {
  title: "Tags",
  description: "태그 성좌로 주제를 탐색하고, 전체 태그 목록에서 원하는 글을 찾을 수 있는 페이지",
};

export default function TagsPage() {
  const tags = getTags();
  const constellation = getTagConstellation();
  const totalPosts = getAllPosts().length;

  return (
    <div className="space-y-12">
      <section className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Tags</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">태그로 탐색하기</h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">
          자주 다루는 주제는 성좌로 이어져 있습니다. 별을 누르면 상세 주제와 글로 좁혀 들어갈 수 있고,
          아래 목록에서는 {tags.length}개 태그 전체를 글 수 순으로 볼 수 있습니다.
        </p>
      </section>

      {/* 성좌 — 홈과 같은 컴포넌트, 크게 */}
      <section>
        <TagConstellationWindow data={constellation} size="full" controls={false} />
      </section>

      {/* 전체 태그 목록 */}
      <section>
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-border pb-4">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">전체 태그</h2>
          <p className="font-mono text-xs text-muted-foreground">
            {tags.length} tags · {totalPosts} posts
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <TagChip
              key={tag.slug}
              href={`/tags/${tag.slug}`}
              label={`${tag.name} (${tag.count})`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
