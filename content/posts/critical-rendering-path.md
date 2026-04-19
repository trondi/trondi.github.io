---
title: "Critical Rendering Path — HTML 파싱부터 화면에 픽셀이 찍히기까지"
date: "2026-04-19"
summary: "브라우저가 HTML을 받아서 화면에 그리기까지 일어나는 일들 — DOM, CSSOM, Render Tree, Layout, Paint, Composite 단계를 순서대로 정리했다."
category: "Frontend"
tags:
  - Browser
  - Performance
  - Critical Rendering Path
  - DOM
featured: false
---

# Critical Rendering Path

브라우저가 서버에서 HTML을 받으면 어떤 일이 일어나는가. 이 흐름을 이해하면 왜 어떤 최적화가 효과가 있고 없는지 설명할 수 있다.

---

## 전체 흐름

```
HTML 수신
  → HTML 파싱 → DOM 생성
  → CSS 파싱 → CSSOM 생성
  → DOM + CSSOM → Render Tree
  → Layout (Reflow)
  → Paint
  → Composite
  → 화면 출력
```

---

## 1단계 — DOM 생성

브라우저는 HTML을 받으면서 바이트 단위로 파싱한다. HTML 스트림을 토큰으로 쪼개고, 토큰을 노드로 변환해 트리 구조(DOM)를 만든다.

파싱 중 `<script>` 태그를 만나면 **파싱이 멈춘다.** 스크립트가 DOM을 수정할 수 있기 때문에 실행이 끝날 때까지 기다린다. 이것이 `<script>` 태그를 `<body>` 끝에 두거나 `defer` / `async`를 쓰는 이유다.

```html
<!-- 파싱 블로킹 — 피해야 함 -->
<head>
  <script src="app.js"></script>
</head>

<!-- defer: 파싱 완료 후 실행, 순서 보장 -->
<script src="app.js" defer></script>

<!-- async: 다운로드 완료 즉시 실행, 순서 미보장 -->
<script src="analytics.js" async></script>
```

---

## 2단계 — CSSOM 생성

HTML 파싱 중 `<link rel="stylesheet">` 또는 `<style>`을 만나면 CSS를 파싱해 CSSOM(CSS Object Model)을 만든다.

CSS는 **렌더링 블로킹 리소스**다. CSSOM이 완성되기 전까지 Render Tree를 만들 수 없다. 스타일시트를 다운로드하는 동안 화면 렌더링이 차단된다.

미디어 쿼리로 현재 조건에 맞지 않는 CSS는 블로킹에서 제외된다.

```html
<!-- 항상 블로킹 -->
<link rel="stylesheet" href="styles.css">

<!-- 프린트 환경에서만 블로킹 (일반 뷰에서는 비블로킹) -->
<link rel="stylesheet" href="print.css" media="print">

<!-- 화면 너비 조건에 맞을 때만 블로킹 -->
<link rel="stylesheet" href="mobile.css" media="(max-width: 768px)">
```

---

## 3단계 — Render Tree

DOM과 CSSOM을 결합해 실제로 화면에 그려질 노드만 추린 트리를 만든다.

- `display: none` 요소는 Render Tree에 포함되지 않는다.
- `visibility: hidden` 요소는 포함된다 (공간을 차지하지만 보이지 않음).
- `<head>`, `<script>`, `<meta>` 같은 비시각적 요소는 포함되지 않는다.

---

## 4단계 — Layout (Reflow)

각 노드가 화면에서 어디에, 얼마나 큰 크기로 위치하는지를 계산한다. 브라우저 창 크기, 폰트 크기, 요소 크기 등이 여기서 결정된다.

Layout은 비용이 크다. 하나의 요소 크기가 바뀌면 부모와 형제 요소에 영향을 줄 수 있어서 트리를 다시 계산해야 한다.

```js
// Layout을 강제 발생시키는 코드 패턴 — 피해야 함
for (const el of elements) {
  el.style.width = box.offsetWidth + 'px'; // 읽기 → 쓰기 교차 반복
}

// 한 번에 읽고 한 번에 쓰기
const width = box.offsetWidth;
for (const el of elements) {
  el.style.width = width + 'px';
}
```

---

## 5단계 — Paint

Layout 결과를 바탕으로 각 요소의 시각적 속성(색상, 테두리, 그림자 등)을 레이어에 그린다. 텍스트, 이미지, 배경 등이 이 단계에서 실제 픽셀로 그려진다.

`box-shadow`, `border-radius`, `filter` 같은 복잡한 속성은 Paint 비용이 높다.

---

## 6단계 — Composite

여러 레이어를 GPU에서 합성해 최종 화면을 만든다. `transform`과 `opacity`는 Layout과 Paint를 건너뛰고 Composite 단계만 거친다. 이것이 애니메이션에서 `transform`을 쓰는 이유다.

```css
/* Paint까지 발생 — 비용 높음 */
.box {
  transition: left 0.3s;
}

/* Composite만 발생 — GPU 가속, 비용 낮음 */
.box {
  transition: transform 0.3s;
}
```

`will-change: transform`을 미리 선언하면 브라우저가 해당 요소를 별도 레이어로 올려둔다. 남용하면 메모리를 낭비한다.

---

## First Contentful Paint (FCP)를 빠르게 하려면

FCP는 첫 번째 콘텐츠가 화면에 그려지는 시점이다. Critical Rendering Path를 단축하는 것이 목표다.

1. **렌더링 블로킹 CSS 최소화** — 중요한 CSS는 `<style>` 인라인, 나머지는 비동기 로드
2. **스크립트 defer** — 초기 렌더링에 필요 없는 JS는 파싱 후 실행
3. **HTML 응답 크기 줄이기** — 첫 화면에 필요한 HTML만 먼저 보내기 (스트리밍)
4. **폰트 최적화** — `font-display: swap`으로 FOIT 방지

```html
<!-- 크리티컬 CSS는 인라인 -->
<head>
  <style>
    /* 첫 화면에만 필요한 최소한의 CSS */
    body { margin: 0; font-family: sans-serif; }
    .header { ... }
  </style>
  <!-- 나머지 CSS는 비동기 -->
  <link rel="preload" href="styles.css" as="style" onload="this.rel='stylesheet'">
</head>
```

---

## 정리

| 단계 | 하는 일 | 비용을 올리는 것 |
|---|---|---|
| DOM | HTML 파싱 | 블로킹 스크립트 |
| CSSOM | CSS 파싱 | 블로킹 스타일시트 |
| Layout | 위치/크기 계산 | 크기 관련 속성 변경 |
| Paint | 픽셀 그리기 | 시각 속성 변경 |
| Composite | 레이어 합성 | 레이어 수 과다 |

`transform`과 `opacity`만 건드리는 애니메이션이 빠른 이유가 이 흐름에 있다.
