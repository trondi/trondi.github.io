export type PostFrontmatter = {
  title: string;
  date: string;
  summary: string;
  category: string;
  tags: string[];
  featured: boolean;
  draft: boolean;
  series?: string;       // 시리즈 이름 (같은 값을 가진 글들이 한 시리즈)
  seriesOrder?: number;  // 시리즈 내 순서 (1부터)
};

export type SeriesEntry = {
  slug: string;
  title: string;
  order: number;
  current: boolean;
};

export type PostSummary = PostFrontmatter & {
  slug: string;
  readingTime: string;
};

export type SearchEntry = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  content: string;
};

export type TocItem = {
  id: string;
  text: string;
  level: number;
};

/**
 * 리스트 항목. children 은 이 항목 아래 들여쓴 중첩 리스트다.
 * 여러 줄에 걸쳐 쓴 항목은 파서가 text 하나로 이어붙인다.
 */
export type ListItem = {
  text: string;
  children?: MarkdownBlock[];
};

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: ListItem[] }
  | { type: "ordered-list"; items: ListItem[] }
  | { type: "blockquote"; text: string }
  | { type: "code"; language: string; code: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "diagram"; name: string }
  | { type: "hr" };

export type ParsedMarkdown = {
  blocks: MarkdownBlock[];
  toc: TocItem[];
};

export type Post = PostSummary & {
  content: string;
  toc: TocItem[];
  blocks: MarkdownBlock[];
};

export type TaxonomyItem = {
  name: string;
  slug: string;
  count: number;
};
