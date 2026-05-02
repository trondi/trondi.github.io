"use client";

import { useMemo, useState } from "react";

import { PostListItem } from "@/components/blog/post-list-item";
import { PostSummary } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

type CategoryTagFilterProps = {
  posts: PostSummary[];
};

const ALL_TAG = "__all__";

export function CategoryTagFilter({ posts }: CategoryTagFilterProps) {
  const [selectedTag, setSelectedTag] = useState<string>(ALL_TAG);

  // ── Compute unique tags + counts (memoized) ─────────────────────────────
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      for (const tag of post.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [posts]);

  // ── Filter posts by selected tag ────────────────────────────────────────
  const filteredPosts = useMemo(() => {
    if (selectedTag === ALL_TAG) return posts;
    return posts.filter((post) => post.tags.includes(selectedTag));
  }, [posts, selectedTag]);

  return (
    <>
      {/* ── Tag filter chips ────────────────────────────────────────────── */}
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <TagButton
            label="전체"
            count={posts.length}
            active={selectedTag === ALL_TAG}
            onClick={() => setSelectedTag(ALL_TAG)}
          />
          {tags.map((tag) => (
            <TagButton
              key={tag.label}
              label={tag.label}
              count={tag.count}
              active={selectedTag === tag.label}
              onClick={() => setSelectedTag(tag.label)}
            />
          ))}
        </div>
      )}

      {/* ── Post list ──────────────────────────────────────────────────── */}
      <div>
        <div className="mb-8 flex items-center justify-between border-b border-border pb-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            {selectedTag === ALL_TAG ? "All Posts" : `# ${selectedTag}`}
          </p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {filteredPosts.length}개
          </span>
        </div>

        {filteredPosts.length > 0 ? (
          filteredPosts.map((post) => (
            <PostListItem key={post.slug} post={post} />
          ))
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            해당 태그의 글이 없습니다.
          </p>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tag button
// ─────────────────────────────────────────────────────────────────────────────
type TagButtonProps = {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
};

function TagButton({ label, count, active, onClick }: TagButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground hover:border-[hsl(var(--ring)/0.4)] hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          active ? "text-background/70" : "text-muted-foreground/60",
        )}
      >
        {count}
      </span>
    </button>
  );
}
