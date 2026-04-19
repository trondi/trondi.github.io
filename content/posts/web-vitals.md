---
title: "Web Vitals — LCP·CLS·INP 측정하고 개선하기"
date: "2026-04-19"
summary: "Google이 정의한 Core Web Vitals 세 가지, LCP·CLS·INP가 각각 무엇을 측정하는지, 어떻게 확인하고 어디서 개선할 수 있는지 정리했다."
category: "Frontend"
tags:
  - Performance
  - Web Vitals
  - LCP
  - CLS
  - INP
featured: false
---

# Web Vitals — LCP · CLS · INP

Core Web Vitals는 Google이 정의한 사용자 경험 지표 세 가지다. 검색 순위에도 영향을 주지만, 그보다 사용자가 실제로 느끼는 성능을 수치로 표현한다는 점에서 의미가 있다.

---

## LCP — Largest Contentful Paint

**뷰포트에서 가장 큰 콘텐츠가 렌더링되는 시점.**

"페이지의 주요 내용이 언제 보이기 시작하는가"를 측정한다. 히어로 이미지, 큰 텍스트 블록, 비디오 썸네일 등이 대상이 된다.

| 점수 | 기준 |
|---|---|
| Good | 2.5초 이하 |
| Needs Improvement | 2.5 ~ 4.0초 |
| Poor | 4.0초 초과 |

### LCP가 느린 주요 원인과 해결책

**느린 서버 응답 (TTFB)**
```
→ CDN 사용, 서버 사이드 캐싱, 응답 스트리밍
```

**렌더링 블로킹 리소스**
```html
<!-- 스크립트에 defer 추가 -->
<script src="app.js" defer></script>

<!-- 중요하지 않은 CSS 비동기 로드 -->
<link rel="preload" href="non-critical.css" as="style" onload="this.rel='stylesheet'">
```

**LCP 이미지 늦게 발견**
```html
<!-- preload로 미리 다운로드 시작 -->
<link rel="preload" as="image" href="hero.jpg" fetchpriority="high">

<!-- 또는 fetchpriority 속성 직접 사용 -->
<img src="hero.jpg" fetchpriority="high" alt="히어로">
```

**이미지 파일 크기**
```
→ WebP/AVIF 포맷 사용, srcset으로 적절한 해상도 제공
→ 이미지 CDN으로 자동 최적화 (Cloudinary, imgix, Next.js Image 컴포넌트 등)
```

---

## CLS — Cumulative Layout Shift

**페이지 로드 중 예상치 못한 레이아웃 이동의 합산.**

광고가 갑자기 나타나 버튼이 밀리거나, 폰트가 로드되면서 텍스트 위치가 변하는 현상을 수치화한다.

| 점수 | 기준 |
|---|---|
| Good | 0.1 이하 |
| Needs Improvement | 0.1 ~ 0.25 |
| Poor | 0.25 초과 |

### CLS 유발 패턴과 해결책

**이미지/미디어에 크기 미지정**
```html
<!-- 나쁜 예: 이미지 다운로드 전까지 크기를 모름 -->
<img src="photo.jpg" alt="사진">

<!-- 좋은 예: aspect-ratio 공간 예약 -->
<img src="photo.jpg" width="800" height="600" alt="사진">
```

**동적으로 삽입되는 콘텐츠**
```css
/* 광고, 배너 등의 자리를 미리 예약 */
.ad-container {
  min-height: 250px;
}
```

**커스텀 폰트 로딩**
```css
/* FOUT 허용 — 레이아웃 이동 없이 폰트 교체 */
@font-face {
  font-family: 'MyFont';
  src: url('font.woff2');
  font-display: swap;
}

/* size-adjust로 폴백 폰트와 크기 맞추기 */
@font-face {
  font-family: 'MyFont-fallback';
  src: local('Arial');
  size-adjust: 105%;
  ascent-override: 90%;
}
```

**애니메이션으로 요소 이동**
```css
/* 나쁜 예: top/margin 변경 → 레이아웃 이동으로 CLS 발생 */
.slide-in {
  animation: slide 0.5s;
}
@keyframes slide {
  from { margin-top: -100px; }
  to { margin-top: 0; }
}

/* 좋은 예: transform → 레이아웃에 영향 없음 */
@keyframes slide {
  from { transform: translateY(-100px); }
  to { transform: translateY(0); }
}
```

---

## INP — Interaction to Next Paint

**사용자 입력(클릭, 탭, 키보드)에서 다음 화면 업데이트까지의 지연.**

2024년 FID(First Input Delay)를 대체했다. FID는 첫 번째 입력만 측정했지만, INP는 페이지 수명 동안의 모든 인터랙션 중 가장 느린 것을 기준으로 한다.

| 점수 | 기준 |
|---|---|
| Good | 200ms 이하 |
| Needs Improvement | 200 ~ 500ms |
| Poor | 500ms 초과 |

### INP가 느린 주요 원인

**무거운 이벤트 핸들러**
```js
// 나쁜 예: 클릭 시 무거운 연산
button.addEventListener('click', () => {
  const result = heavyComputation(); // 메인 스레드 차단
  updateUI(result);
});

// 좋은 예: 연산을 Web Worker로 오프로드
button.addEventListener('click', () => {
  worker.postMessage({ type: 'compute' });
});
worker.onmessage = (e) => updateUI(e.data);
```

**Long Task**

50ms 이상 메인 스레드를 차지하는 작업이 인터랙션 응답을 막는다.

```js
// 긴 작업을 작게 나누기
async function processLargeArray(items) {
  for (let i = 0; i < items.length; i++) {
    process(items[i]);

    // 100개마다 메인 스레드에 양보
    if (i % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}
```

**React에서 INP 개선**

```tsx
// 긴급하지 않은 상태 업데이트는 transition으로 처리
import { useTransition } from 'react';

function SearchInput() {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState('');

  const handleChange = (e) => {
    setQuery(e.target.value); // 즉시 반영 (인풋값)

    startTransition(() => {
      setSearchResults(filterResults(e.target.value)); // 늦게 처리 가능
    });
  };
}
```

---

## 측정 방법

### Chrome DevTools — Lighthouse

Performance 탭에서 직접 측정. 실험실(Lab) 데이터이므로 실제 사용자 환경과 다를 수 있다.

### PageSpeed Insights

실제 사용자 데이터(Field Data)를 포함해 보여준다.

### web-vitals 라이브러리

```js
import { onLCP, onCLS, onINP } from 'web-vitals';

onLCP(({ value }) => console.log('LCP:', value));
onCLS(({ value }) => console.log('CLS:', value));
onINP(({ value }) => console.log('INP:', value));
```

실제 사용자의 수치를 수집해 모니터링 서비스(GA4, DataDog 등)로 전송할 때 사용한다.

---

## 정리

| 지표 | 측정 대상 | 주요 원인 | 해결 방향 |
|---|---|---|---|
| LCP | 주요 콘텐츠 로딩 속도 | 이미지, 블로킹 리소스 | preload, 이미지 최적화 |
| CLS | 레이아웃 이동 | 크기 미지정, 동적 삽입 | 공간 예약, transform 사용 |
| INP | 인터랙션 응답 속도 | Long Task, 무거운 핸들러 | 작업 분산, Web Worker |
