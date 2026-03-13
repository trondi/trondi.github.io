# 전체 설계 방향 요약

이 블로그는 개인 프론트엔드 개발 기록을 문서처럼 축적하는 것을 목표로 한다. 홈은 최신 글과 카테고리 진입을 중심으로 두고, 핵심 탐색 허브는 `/posts` 아카이브 페이지가 맡는다. 시각적으로는 Vercel, Notion, 기술문서형 블로그의 차분한 인상을 가져오되 카드 쇼케이스보다 텍스트 가독성, 코드 가독성, 정보 밀도를 우선한다.

1차 버전은 App Router, TypeScript, Tailwind CSS, markdown 콘텐츠 구조를 기반으로 구현했다. 외부 의존성을 늘리지 않고도 운영할 수 있도록 `content/posts`와 `src/lib/blog`를 분리했고, 이후 MDX, 검색 인덱스, RSS, 다크모드 토글을 얹을 수 있게 설계했다.

# IA / 메뉴 구조

상단 1차 메뉴:

- Home
- Posts
- About

상단 2차 탐색:

- Frontend
- React / Next.js
- JavaScript / TypeScript
- CSS / UI
- Trouble Shooting
- TIL
- Project

콘텐츠 탐색 흐름:

1. `Home`에서 최신 글과 대표 카테고리 진입
2. `Posts`에서 전체 아카이브, 정렬, 카테고리/태그 필터
3. `Post Detail`에서 목차, 관련 글, 이전/다음 글 이동
4. `Category / Tag` 페이지에서 분류별 재탐색
5. `About`에서 작성자 정보와 외부 링크 확인

# 폴더 구조

```text
content/
  posts/
    *.md
docs/
  blog-architecture.md
src/
  app/
    about/
    categories/[slug]/
    posts/
      [slug]/
    tags/[slug]/
    layout.tsx
    page.tsx
    robots.ts
    sitemap.ts
  components/
    blog/
      markdown-renderer.tsx
      pagination.tsx
      post-list-item.tsx
      posts-explorer.tsx
      site-footer.tsx
      site-header.tsx
      table-of-contents.tsx
      tag-chip.tsx
  lib/
    blog/
      config.ts
      markdown.ts
      posts.ts
      types.ts
      utils.ts
  styles/
    globals.css
```

# 라우팅 구조

- `/`: 홈
- `/posts`: 전체 글 목록과 필터 탐색
- `/posts/[slug]`: 글 상세
- `/categories/[slug]`: 카테고리별 목록
- `/tags/[slug]`: 태그별 목록
- `/about`: 작성자 소개
- `/sitemap.xml`: SEO용 사이트맵
- `/robots.txt`: 크롤러 정책

# 필요한 컴포넌트 목록

- `SiteHeader`: 사이트 제목, 1차 메뉴, 카테고리 내비게이션
- `SiteFooter`: 작성자 링크와 하단 정보
- `PostListItem`: 글 목록용 공통 행 UI
- `PostsExplorer`: 전체 글 필터링, 정렬, pagination
- `TagChip`: 카테고리/태그 라벨 UI
- `MarkdownRenderer`: markdown 블록 렌더링
- `TableOfContents`: 상세 페이지 목차
- `Pagination`: 페이지 이동 UI

# 포스트 관리 구조

콘텐츠는 `content/posts/*.md` 파일로 저장한다. frontmatter와 본문을 분리하고, `src/lib/blog/posts.ts`가 파일 시스템 읽기, 메타데이터 정규화, 카테고리/태그 집계, 관련 글 계산을 담당한다.

예시 메타데이터:

```md
---
title: "글 제목"
date: "2026-03-13"
summary: "짧은 요약"
category: "React / Next.js"
tags:
- Next.js
- App Router
featured: true
draft: false
---
```

# 코드블록 / 태그 / 목차 / Pagination UI

- 코드블록은 어두운 배경, 상단 언어 라벨, `overflow-x-auto`를 사용해 긴 줄을 안전하게 처리한다.
- 태그와 카테고리는 둥근 칩 UI로 통일해 문서형 분위기를 유지한다.
- 목차는 `h2`, `h3` 기준으로 자동 생성하고 상세 페이지 우측에 고정한다.
- pagination은 단순한 숫자형 버튼으로 구현해 확장과 유지보수를 쉽게 했다.

# SEO 기본 메타데이터 처리 구조

- 전역 SEO: `src/app/layout.tsx`
- 글 단위 SEO: `src/app/posts/[slug]/page.tsx`의 `generateMetadata`
- 크롤링 보조: `src/app/sitemap.ts`, `src/app/robots.ts`

현재 1차 버전에서는 title, description, Open Graph 기본 값까지 대응했다. 이후 OG 이미지 자동 생성, canonical URL, JSON-LD를 추가할 수 있다.

# 다크모드 확장 포인트

- 현재 CSS 변수 구조가 이미 `:root`와 `.dark` 기준으로 나뉘어 있어 테마 확장이 가능하다.
- 추후 `ThemeProvider` 또는 간단한 `class` 토글을 붙이면 된다.
- 코드블록, 경계선, 배경 톤은 변수 기반으로 옮기면 다크모드 전환 비용이 줄어든다.
- 1차 버전은 라이트 테마를 먼저 정교하게 맞추고, 다크모드는 구조적으로만 열어두었다.
