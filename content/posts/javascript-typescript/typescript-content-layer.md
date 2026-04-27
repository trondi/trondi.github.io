---
title: "TypeScript로 콘텐츠 레이어를 단순하게 유지하는 방법"
date: "2026-03-02"
summary: "markdown 파싱, 메타데이터 타입, 카테고리/태그 집계를 분리해 두면 이후 검색과 RSS 확장이 쉬워진다."
category: "JavaScript / TypeScript"
tags:
- TypeScript
- Markdown
- Architecture
featured: false
---
# TypeScript로 콘텐츠 레이어를 단순하게 유지하는 방법

블로그 코드에서 중요한 것은 UI보다도 콘텐츠를 다루는 규칙입니다. 특히 제목, 날짜, 카테고리, 태그, 요약을 일관된 타입으로 묶어두면 이후 확장이 쉬워집니다.

## 메타데이터 타입을 먼저 고정하기

- `title`
- `date`
- `summary`
- `category`
- `tags`
- `featured`

## 파싱 레이어를 분리하는 이유

UI 컴포넌트가 파일 시스템이나 frontmatter 형식을 직접 알게 되면 수정 범위가 넓어집니다. 그래서 `lib/blog/posts.ts`처럼 읽기 전용 레이어를 두는 편이 좋습니다.

## 나중에 추가하기 좋은 것

검색 인덱스나 RSS는 콘텐츠 레이어가 정리돼 있을수록 쉽게 붙일 수 있습니다.
