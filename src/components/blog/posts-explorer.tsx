"use client";

import { useEffect, useState } from "react";

import { Pagination } from "@/components/blog/pagination";
import { PostListItem } from "@/components/blog/post-list-item";
import { TagChip } from "@/components/blog/tag-chip";
import { PostSummary, TaxonomyItem } from "@/lib/blog/types";

type PostsExplorerProps = {
  posts: PostSummary[];
  categories: TaxonomyItem[];
  tags: TaxonomyItem[];
};

const PAGE_SIZE = 6;

export function PostsExplorer({ posts, categories, tags }: PostsExplorerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"latest" | "oldest">("latest");
  const [page, setPage] = useState(1);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = posts
    .filter((post) => selectedCategory === "all" || post.category === selectedCategory)
    .filter((post) => selectedTag === "all" || post.tags.includes(selectedTag))
    .filter((post) => {
      if (!normalizedQuery) {
        return true;
      }

      const haystack = [post.title, post.summary, post.category, ...post.tags].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .sort((a, b) =>
      sortOrder === "latest"
        ? +new Date(b.date) - +new Date(a.date)
        : +new Date(a.date) - +new Date(b.date),
    );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, selectedCategory, selectedTag, sortOrder]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Category</p>
          <div className="mt-4 flex flex-wrap gap-2 lg:flex-col lg:items-start">
            <button type="button" onClick={() => setSelectedCategory("all")}>
              <TagChip label="All Categories" active={selectedCategory === "all"} />
            </button>
            {categories.map((category) => (
              <button key={category.slug} type="button" onClick={() => setSelectedCategory(category.name)}>
                <TagChip
                  label={`${category.name} (${category.count})`}
                  active={selectedCategory === category.name}
                />
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Tags</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedTag("all")}>
              <TagChip label="All Tags" active={selectedTag === "all"} />
            </button>
            {tags.slice(0, 12).map((tag) => (
              <button key={tag.slug} type="button" onClick={() => setSelectedTag(tag.name)}>
                <TagChip label={`${tag.name} (${tag.count})`} active={selectedTag === tag.name} />
              </button>
            ))}
          </div>
        </section>
      </aside>

      <div>
        <div className="border-b border-border pb-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Archive
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                {filtered.length} posts
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSortOrder("latest")}
                className={
                  sortOrder === "latest"
                    ? "rounded-full border border-foreground bg-foreground px-4 py-2 text-sm text-background"
                    : "rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:border-[hsl(var(--ring)/0.4)] hover:text-foreground"
                }
              >
                Latest
              </button>
              <button
                type="button"
                onClick={() => setSortOrder("oldest")}
                className={
                  sortOrder === "oldest"
                    ? "rounded-full border border-foreground bg-foreground px-4 py-2 text-sm text-background"
                    : "rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:border-[hsl(var(--ring)/0.4)] hover:text-foreground"
                }
              >
                Oldest
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label htmlFor="posts-search" className="sr-only">
              Search posts
            </label>
            <div className="relative min-w-[260px] flex-1">
              <input
                id="posts-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목, 요약, 카테고리, 태그 검색"
                className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-[hsl(var(--ring)/0.6)]"
              />
            </div>
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition hover:border-[hsl(var(--ring)/0.4)] hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
          </div>

          <p className="mt-3 text-sm text-muted-foreground">
            검색어와 카테고리, 태그 필터를 함께 조합해 원하는 글만 빠르게 좁힐 수 있습니다.
          </p>
        </div>

        <div className="pt-8">
          {paginated.length ? (
            paginated.map((post) => <PostListItem key={post.slug} post={post} />)
          ) : (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-sm text-muted-foreground">
              조건에 맞는 글이 없습니다. 검색어를 지우거나 카테고리, 태그 필터를 다시 조정해보세요.
            </div>
          )}
        </div>

        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
