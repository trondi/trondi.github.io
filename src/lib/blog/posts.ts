import fs from "fs";
import path from "path";
import { cache } from "react";

import { parseMarkdown } from "@/lib/blog/markdown";
import { siteConfig } from "@/lib/blog/config";
import { Post, PostFrontmatter, PostSummary, SearchEntry, TaxonomyItem } from "@/lib/blog/types";
import { estimateReadingTime, slugify, stripMarkdown } from "@/lib/blog/utils";

const postsDirectory = path.join(process.cwd(), "content/posts");

function parseFrontmatter(fileContent: string) {
  const lines = fileContent.replace(/\r\n/g, "\n").split("\n");

  if (lines[0]?.trim() !== "---") {
    return { metadata: {} as Partial<PostFrontmatter>, content: fileContent.trim() };
  }

  const metadata: Record<string, string | string[] | boolean> = {};
  let index = 1;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "---") {
      index += 1;
      break;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim();
    const value = rest.join(":").trim();

    if (!key) {
      index += 1;
      continue;
    }

    if (!value) {
      const items: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().replace(/^- /, "").trim());
        index += 1;
      }
      metadata[key] = items;
      continue;
    }

    if (value === "true" || value === "false") {
      metadata[key] = value === "true";
    } else {
      metadata[key] = value.replace(/^"(.*)"$/, "$1");
    }

    index += 1;
  }

  return {
    metadata: metadata as Partial<PostFrontmatter>,
    content: lines.slice(index).join("\n").trim(),
  };
}

function validateFrontmatter(metadata: Partial<PostFrontmatter>, slug: string): PostFrontmatter {
  return {
    title: metadata.title ?? slug,
    date: metadata.date ?? "2026-01-01",
    summary: metadata.summary ?? "",
    category: metadata.category ?? "TIL",
    tags: metadata.tags ?? [],
    featured: metadata.featured ?? false,
    draft: metadata.draft ?? false,
  };
}

function sortPosts(posts: PostSummary[]) {
  return posts.sort((a, b) => +new Date(b.date) - +new Date(a.date));
}

function getPostSlugsInternal() {
  return fs
    .readdirSync(postsDirectory)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.replace(/\.md$/, ""));
}

export const getPostSlugs = cache(() => getPostSlugsInternal());

export const getAllPosts = cache((): PostSummary[] => {
  const posts = getPostSlugs().map((slug) => {
    const filePath = path.join(postsDirectory, `${slug}.md`);
    const source = fs.readFileSync(filePath, "utf8");
    const { metadata, content } = parseFrontmatter(source);
    const frontmatter = validateFrontmatter(metadata, slug);

    return {
      slug,
      ...frontmatter,
      readingTime: estimateReadingTime(content),
    };
  });

  return sortPosts(posts.filter((post) => !post.draft));
});

export const getPostBySlug = cache((slug: string): Post | null => {
  const filePath = path.join(postsDirectory, `${slug}.md`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const source = fs.readFileSync(filePath, "utf8");
  const { metadata, content } = parseFrontmatter(source);
  const frontmatter = validateFrontmatter(metadata, slug);
  const parsed = parseMarkdown(content);

  return {
    slug,
    ...frontmatter,
    content,
    readingTime: estimateReadingTime(content),
    blocks: parsed.blocks,
    toc: parsed.toc,
  };
});

export const getSearchIndex = cache((): SearchEntry[] => {
  return getPostSlugs()
    .map((slug) => {
      const filePath = path.join(postsDirectory, `${slug}.md`);
      const source = fs.readFileSync(filePath, "utf8");
      const { metadata, content } = parseFrontmatter(source);
      const frontmatter = validateFrontmatter(metadata, slug);

      if (frontmatter.draft) {
        return null;
      }

      return {
        slug,
        title: frontmatter.title,
        summary: frontmatter.summary,
        category: frontmatter.category,
        tags: frontmatter.tags,
        content: stripMarkdown(content.replace(/#+\s/g, " ").replace(/[-*]\s/g, " ")),
      };
    })
    .filter((entry): entry is SearchEntry => Boolean(entry));
});

function countBy(items: string[]) {
  const map = new Map<string, number>();

  items.forEach((item) => {
    map.set(item, (map.get(item) ?? 0) + 1);
  });

  return map;
}

export function getFeaturedPosts(limit = 3) {
  return getAllPosts()
    .filter((post) => post.featured)
    .slice(0, limit);
}

export function getLatestPosts(limit = 5) {
  return getAllPosts().slice(0, limit);
}

export function getCategories(): TaxonomyItem[] {
  const posts = getAllPosts();
  const counts = countBy(posts.map((post) => post.category));
  const configured = new Set(siteConfig.categories);

  const ordered = siteConfig.categories
    .filter((name) => counts.has(name))
    .map((name) => ({
      name,
      slug: slugify(name),
      count: counts.get(name) ?? 0,
    }));

  const remaining = [...counts.entries()]
    .filter(([name]) => !configured.has(name))
    .map(([name, count]) => ({ name, slug: slugify(name), count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...ordered, ...remaining];
}

export function getTags(): TaxonomyItem[] {
  const counts = countBy(getAllPosts().flatMap((post) => post.tags));

  return [...counts.entries()]
    .map(([name, count]) => ({ name, slug: slugify(name), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function getPostsByCategorySlug(categorySlug: string) {
  return getAllPosts().filter((post) => slugify(post.category) === categorySlug);
}

export function getPostsByTagSlug(tagSlug: string) {
  return getAllPosts().filter((post) =>
    post.tags.some((tag) => slugify(tag) === tagSlug),
  );
}

export function getAdjacentPosts(slug: string) {
  const posts = getAllPosts();
  const index = posts.findIndex((post) => post.slug === slug);

  return {
    previous: index < posts.length - 1 ? posts[index + 1] : null,
    next: index > 0 ? posts[index - 1] : null,
  };
}

export function getRelatedPosts(slug: string, limit = 3) {
  const current = getPostBySlug(slug);

  if (!current) {
    return [];
  }

  return getAllPosts()
    .filter((post) => post.slug !== slug)
    .map((post) => {
      const sharedTags = post.tags.filter((tag) => current.tags.includes(tag)).length;
      const sameCategory = post.category === current.category ? 2 : 0;
      return { post, score: sharedTags + sameCategory };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || +new Date(b.post.date) - +new Date(a.post.date))
    .slice(0, limit)
    .map((entry) => entry.post);
}

export function getArchiveGroups() {
  const groups = new Map<string, PostSummary[]>();

  getAllPosts().forEach((post) => {
    const year = new Date(post.date).getFullYear().toString();
    groups.set(year, [...(groups.get(year) ?? []), post]);
  });

  return [...groups.entries()].map(([year, posts]) => ({ year, posts }));
}
