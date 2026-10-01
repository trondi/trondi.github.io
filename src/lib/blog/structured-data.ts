import { siteConfig } from "@/lib/blog/config";
import type { Post, PostSummary } from "@/lib/blog/types";
import { slugify } from "@/lib/blog/utils";

/**
 * schema.org 구조화 데이터 — 검색엔진과 LLM이 글을 인용할 때 쓰는 레이어.
 * HTML만으로는 "이게 글이고, 언제 쓴 누구 글인지"를 기계가 확신할 수 없다.
 */

const PERSON = {
  "@type": "Person",
  name: siteConfig.author.name,
  url: siteConfig.siteUrl,
  sameAs: [siteConfig.author.github],
  jobTitle: siteConfig.author.role,
} as const;

/** 홈에 넣는 사이트 전역 정보 */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${siteConfig.siteUrl}/#blog`,
    name: siteConfig.title,
    description: siteConfig.description,
    url: siteConfig.siteUrl,
    inLanguage: "ko-KR",
    author: PERSON,
    publisher: PERSON,
  };
}

/** 글 상세에 넣는 글 정보 */
export function blogPostingSchema(post: Post) {
  const url = `${siteConfig.siteUrl}/posts/${post.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#post`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: post.title,
    description: post.summary,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: "ko-KR",
    author: PERSON,
    publisher: PERSON,
    isPartOf: { "@id": `${siteConfig.siteUrl}/#blog` },
    articleSection: post.category,
    keywords: post.tags.join(", "),
    wordCount: countWords(post.content),
  };
}

/** 글 상세의 계층 — 홈 › 카테고리 › 글 */
export function breadcrumbSchema(post: Post) {
  const crumbs = [
    { name: "Home", url: siteConfig.siteUrl },
    { name: post.category, url: `${siteConfig.siteUrl}/categories/${slugify(post.category)}` },
    { name: post.title, url: `${siteConfig.siteUrl}/posts/${post.slug}` },
  ];

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

/** 목록 페이지에 넣는 글 묶음 — 어떤 글이 실려 있는지 기계가 알 수 있게 */
export function itemListSchema(posts: PostSummary[], listUrl: string, name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: listUrl,
    numberOfItems: posts.length,
    itemListElement: posts.map((post, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${siteConfig.siteUrl}/posts/${post.slug}`,
      name: post.title,
    })),
  };
}

/** 한글은 공백 기준으로 세면 과소 집계되므로 CJK 글자는 하나씩 센다 */
function countWords(markdown: string) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\[\]()-]/g, " ");
  const cjk = text.match(/[ㄱ-힝一-鿿]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return cjk + latin;
}
