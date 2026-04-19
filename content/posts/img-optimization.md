---
title: "<img> 최적화 — loading, decoding, srcset, sizes 실제로 어떻게 쓰나"
date: "2026-04-19"
summary: "이미지 최적화에서 자주 보이는 loading, decoding, srcset, sizes 속성이 실제로 무슨 역할을 하는지, 언제 쓰고 언제 안 써도 되는지 정리했다."
category: "Frontend"
tags:
  - Performance
  - Image Optimization
  - Web Vitals
  - HTML
featured: false
---

# `<img>` 최적화

이미지는 대부분의 웹 페이지에서 가장 큰 리소스다. `<img>` 태그에 붙일 수 있는 속성들이 실제로 무슨 역할을 하는지 이해하면 LCP를 크게 개선할 수 있다.

---

## loading — 언제 다운로드할 것인가

```html
<img src="photo.jpg" loading="lazy" alt="사진">
```

| 값 | 동작 |
|---|---|
| `eager` (기본값) | 페이지 로드 즉시 다운로드 |
| `lazy` | 뷰포트 근처에 도달할 때 다운로드 |

`loading="lazy"`는 스크롤 없이 보이지 않는 이미지(fold 아래)에 적용한다. 첫 화면(Above the fold)에 있는 이미지에 `lazy`를 쓰면 오히려 LCP가 나빠진다.

```html
<!-- 첫 화면 이미지 — eager(기본값) 또는 명시하지 않음 -->
<img src="hero.jpg" alt="히어로 이미지">

<!-- 스크롤해야 보이는 이미지 -->
<img src="thumbnail.jpg" loading="lazy" alt="썸네일">
```

---

## decoding — 어떻게 디코딩할 것인가

```html
<img src="photo.jpg" decoding="async" alt="사진">
```

| 값 | 동작 |
|---|---|
| `sync` | 메인 스레드에서 동기 디코딩 (렌더링 블로킹) |
| `async` | 별도 스레드에서 비동기 디코딩 |
| `auto` (기본값) | 브라우저가 판단 |

`decoding="async"`는 이미지 디코딩이 메인 스레드를 차단하지 않게 한다. 다만 히어로 이미지처럼 LCP에 직접 영향을 주는 이미지에 `async`를 쓰면 이미지가 더 늦게 표시될 수 있다.

**실용적 가이드:**
- 히어로 이미지 → `decoding="sync"` 또는 생략
- 그 외 대부분 → `decoding="async"`

---

## fetchpriority — 다운로드 우선순위

`loading`과 `decoding`보다 더 직접적으로 LCP를 개선한다.

```html
<!-- LCP 이미지에 높은 우선순위 부여 -->
<img src="hero.jpg" fetchpriority="high" alt="히어로">

<!-- 중요하지 않은 이미지 -->
<img src="decoration.jpg" fetchpriority="low" alt="">
```

브라우저는 기본적으로 뷰포트 내 이미지를 `high`로 처리하지만, `fetchpriority="high"`를 명시하면 CSS 파싱 전에도 미리 다운로드를 시작한다.

---

## srcset — 해상도별 이미지 제공

같은 이미지를 여러 해상도로 제공해서 디바이스에 맞는 것을 선택하게 한다.

### 픽셀 밀도 기반 (간단한 경우)

```html
<img
  src="photo.jpg"
  srcset="photo.jpg 1x, photo@2x.jpg 2x, photo@3x.jpg 3x"
  alt="사진"
>
```

Retina(2x) 디바이스에서는 `photo@2x.jpg`를 다운로드한다.

### 너비 기반 (반응형)

```html
<img
  src="photo-800.jpg"
  srcset="
    photo-400.jpg 400w,
    photo-800.jpg 800w,
    photo-1200.jpg 1200w
  "
  sizes="(max-width: 768px) 100vw, 50vw"
  alt="사진"
>
```

`400w`는 "이 이미지 파일의 실제 너비는 400px"라는 힌트다. 브라우저가 현재 뷰포트 너비, 픽셀 밀도, `sizes` 값을 조합해 가장 적합한 이미지를 선택한다.

---

## sizes — 이미지가 실제로 차지하는 너비

`srcset`에 너비 디스크립터(`w`)를 쓸 때 반드시 함께 사용한다. CSS가 로드되기 전에 브라우저가 어떤 이미지를 다운로드할지 결정해야 하기 때문에 명시적으로 알려줘야 한다.

```html
<img
  srcset="photo-400.jpg 400w, photo-800.jpg 800w, photo-1200.jpg 1200w"
  sizes="
    (max-width: 480px) 100vw,
    (max-width: 1024px) 50vw,
    33vw
  "
  alt="사진"
>
```

`sizes`는 CSS 미디어 쿼리와 동일한 문법이다. 첫 번째로 매칭되는 조건의 크기를 사용하고, 마지막 값은 기본값이다.

브라우저가 계산하는 방식:

```
현재 뷰포트 = 600px
→ sizes에서 (max-width: 1024px) 50vw 매칭
→ 필요한 이미지 너비 = 600 * 0.5 = 300px
→ 픽셀 밀도 2x이면 600px 필요
→ srcset에서 800w 선택
```

---

## picture — 포맷 분기와 아트 디렉션

```html
<!-- 포맷 분기: WebP를 지원하면 WebP, 아니면 JPEG -->
<picture>
  <source srcset="photo.avif" type="image/avif">
  <source srcset="photo.webp" type="image/webp">
  <img src="photo.jpg" alt="사진">
</picture>

<!-- 아트 디렉션: 모바일에서는 다른 구도의 이미지 -->
<picture>
  <source media="(max-width: 768px)" srcset="photo-portrait.jpg">
  <img src="photo-landscape.jpg" alt="사진">
</picture>
```

`<picture>`는 `<img>`의 대체재가 아니다. `<img>`를 포함해야 하고, `<img>`에 `alt`와 기본 `src`를 붙인다.

---

## 실용적 가이드 요약

```html
<!-- 히어로 / LCP 이미지 -->
<img
  src="hero.jpg"
  srcset="hero-800.jpg 800w, hero-1600.jpg 1600w"
  sizes="100vw"
  fetchpriority="high"
  decoding="sync"
  alt="히어로 이미지"
>

<!-- 일반 콘텐츠 이미지 -->
<img
  src="content.jpg"
  srcset="content-400.jpg 400w, content-800.jpg 800w"
  sizes="(max-width: 768px) 100vw, 50vw"
  loading="lazy"
  decoding="async"
  alt="콘텐츠 설명"
>

<!-- 장식 이미지 -->
<img src="decoration.jpg" loading="lazy" fetchpriority="low" alt="">
```

`alt=""`는 틀린 게 아니다. 장식 이미지처럼 스크린 리더가 읽을 필요 없는 이미지는 빈 문자열을 쓴다. `alt` 자체를 생략하면 파일명을 읽는다.

---

## width / height는 항상 명시

```html
<img src="photo.jpg" width="800" height="600" loading="lazy" alt="사진">
```

`width`와 `height`를 명시하면 브라우저가 이미지 다운로드 전에 공간을 예약해서 CLS(Cumulative Layout Shift)를 방지한다. CSS로 크기를 조정하더라도 비율 힌트로 활용된다.
