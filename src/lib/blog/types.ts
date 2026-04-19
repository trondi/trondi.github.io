export type PostFrontmatter = {
  title: string;
  date: string;
  summary: string;
  category: string;
  tags: string[];
  featured?: boolean;
  draft?: boolean;
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

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { type: "paragraph"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
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
