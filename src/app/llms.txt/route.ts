import { siteConfig } from "@/lib/blog/config";
import { getAllPosts, getCategories, getTags } from "@/lib/blog/posts";

/**
 * llms.txt — LLM이 이 블로그를 읽을 때 쓰는 목차.
 * https://llmstxt.org 규약: H1 이름, 인용구 요약, 그 다음 링크 목록.
 *
 * sitemap.xml은 URL만 주지만 이쪽은 각 글이 무엇에 대한 글인지까지 준다.
 * 정적 export라 빌드 시점에 한 번 생성된다.
 */

export const dynamic = "force-static";

export function GET() {
  const posts = getAllPosts();
  const categories = getCategories();
  const tagCount = getTags().length;
  const byCategory = new Map(categories.map((c) => [c.name, [] as typeof posts]));

  for (const post of posts) {
    byCategory.get(post.category)?.push(post);
  }

  const lines: string[] = [
    `# ${siteConfig.title}`,
    "",
    `> ${siteConfig.description}`,
    "",
    siteConfig.intro,
    "",
    `글 ${posts.length}편, 카테고리 ${categories.length}개. 모든 글은 한국어로 쓰여 있다.`,
    "",
    "## 목록 페이지",
    "",
    `- [전체 글](${siteConfig.siteUrl}/posts): 검색·카테고리·태그·정렬로 탐색하는 아카이브`,
    `- [태그](${siteConfig.siteUrl}/tags): 태그 ${tagCount}개 전체와 태그 사이 연관 관계`,
    `- [소개](${siteConfig.siteUrl}/about): 글쓴이와 블로그 소개`,
    "",
  ];

  for (const category of categories) {
    const inCategory = byCategory.get(category.name) ?? [];
    if (inCategory.length === 0) continue;

    lines.push(`## ${category.name}`, "");
    for (const post of inCategory) {
      lines.push(
        `- [${post.title}](${siteConfig.siteUrl}/posts/${post.slug}): ${oneLine(post.summary)}`,
      );
    }
    lines.push("");
  }

  // 마지막 줄이 비어 있으면 파일 끝에 개행 하나만 남긴다
  const body = lines.join("\n").replace(/\n+$/, "\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** 요약에 줄바꿈이 들어가면 목록 항목이 깨지므로 한 줄로 편다 */
function oneLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
