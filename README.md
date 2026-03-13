# Frontend Blog

개인 프론트엔드 개발 블로그 1차 버전입니다. Next.js App Router, TypeScript, Tailwind CSS, markdown 기반 포스트 구조로 구성되어 있습니다.

## 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`을 열면 됩니다.

## 주요 구조

- `src/app`: App Router 기반 페이지와 메타데이터
- `src/components/blog`: 블로그 전용 UI 컴포넌트
- `src/lib/blog`: 콘텐츠 파싱, 메타데이터, 탐색 로직
- `content/posts`: markdown 포스트 저장소
- `docs/blog-architecture.md`: IA, 폴더 구조, 라우팅 구조 문서

## 포스트 추가 방법

`content/posts`에 `.md` 파일을 추가하고 아래 형식의 frontmatter를 작성합니다.

```md
---
title: "새 글 제목"
date: "2026-03-13"
summary: "짧은 소개"
category: "Frontend"
tags:
- React
- TypeScript
featured: false
draft: false
---
```

## 다음 확장 후보

- 검색 인덱스
- 다크모드 토글
- MDX 컴포넌트 지원
- RSS / OG 이미지 자동화
