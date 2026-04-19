---
title: "Reflow vs Repaint — 어떤 CSS 속성이 비싼가"
date: "2026-04-19"
summary: "브라우저가 화면을 다시 그리는 두 가지 방식, Reflow와 Repaint의 차이와 각각을 유발하는 CSS 속성, 성능을 높이는 실무 패턴을 정리했다."
category: "Frontend"
tags:
  - Browser
  - Performance
  - Reflow
  - Repaint
  - CSS
featured: false
---

# Reflow vs Repaint

애니메이션이 버벅이거나, 스크롤이 뚝뚝 끊기거나, JS로 DOM을 조작할 때 화면이 순간 흰색이 되는 경험이 있다. 대부분 Reflow나 Repaint가 과도하게 발생하는 것이 원인이다.

---

## Reflow — 레이아웃을 다시 계산한다

요소의 **크기나 위치**가 바뀌면 브라우저는 영향을 받는 요소들의 레이아웃을 다시 계산한다. 이것이 Reflow(또는 Layout이라고도 한다)다.

Reflow가 비싼 이유는 **전파(propagation)** 때문이다. 하나의 요소가 바뀌면 부모, 형제, 자식 요소들이 연쇄적으로 영향을 받는다. 최악의 경우 페이지 전체를 다시 계산한다.

### Reflow를 유발하는 속성

```
width, height, padding, margin, border
top, left, right, bottom
font-size, line-height
display, position, float
```

```js
// Reflow 유발 예시
el.style.width = '200px';       // 크기 변경
el.style.marginTop = '20px';    // 여백 변경
el.style.display = 'block';     // 표시 방식 변경
el.classList.add('expanded');   // 위 속성들이 담긴 클래스 추가
```

---

## Repaint — 시각적 스타일만 다시 그린다

레이아웃은 바뀌지 않고 **색상이나 배경 같은 시각 속성**만 바뀌면 Repaint가 발생한다. 위치/크기 재계산 없이 픽셀만 다시 그린다.

Reflow보다는 가볍지만, 넓은 영역이나 복잡한 그림자/필터가 있으면 여전히 비용이 크다.

### Repaint를 유발하는 속성

```
color, background-color, background-image
box-shadow, text-shadow
border-color, outline
visibility
```

```js
// Repaint만 유발 (Reflow 없음)
el.style.color = 'red';
el.style.backgroundColor = '#fff';
el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
```

---

## Composite만 — Layout과 Paint를 건너뛴다

`transform`과 `opacity`는 Reflow도 Repaint도 발생시키지 않는다. GPU가 별도 레이어를 합성하는 단계(Composite)만 거친다.

```css
/* Reflow 발생 — 느림 */
.slide-in {
  animation: slide 0.3s;
}
@keyframes slide {
  from { left: -100px; }
  to { left: 0; }
}

/* Composite만 — 빠름 */
.slide-in {
  animation: slide 0.3s;
}
@keyframes slide {
  from { transform: translateX(-100px); }
  to { transform: translateX(0); }
}
```

`opacity: 0`과 `visibility: hidden`의 차이도 여기에 있다. `visibility`는 Repaint를 유발하고, `opacity`는 Composite만 거친다.

---

## Forced Synchronous Layout — 가장 흔한 성능 함정

JS에서 레이아웃 속성을 **읽은 직후 바로 쓰면** 브라우저가 최신 값을 돌려주기 위해 즉시 Reflow를 수행한다. 이것을 Forced Synchronous Layout이라 한다.

```js
// 나쁜 예 — 루프마다 Reflow 발생
const boxes = document.querySelectorAll('.box');
for (const box of boxes) {
  const width = box.offsetWidth; // 읽기: Reflow 강제 발생
  box.style.width = width * 2 + 'px'; // 쓰기
}

// 좋은 예 — 읽기를 먼저 일괄 처리, 쓰기를 나중에 일괄 처리
const widths = Array.from(boxes).map(box => box.offsetWidth); // 읽기만
boxes.forEach((box, i) => {
  box.style.width = widths[i] * 2 + 'px'; // 쓰기만
});
```

### Reflow를 강제하는 DOM 프로퍼티들

읽기만 해도 Reflow를 유발한다.

```
offsetWidth, offsetHeight, offsetTop, offsetLeft
clientWidth, clientHeight, clientTop, clientLeft
scrollWidth, scrollHeight, scrollTop, scrollLeft
getBoundingClientRect()
getComputedStyle()
```

---

## requestAnimationFrame으로 DOM 조작 일괄 처리

여러 DOM 변경을 다음 렌더링 프레임에 일괄 처리할 때 `requestAnimationFrame`을 사용한다.

```js
// 여러 스타일 변경을 한 프레임에 묶기
function updateUI() {
  requestAnimationFrame(() => {
    el1.style.transform = 'translateX(100px)';
    el2.style.opacity = '0.5';
    el3.classList.add('active');
  });
}
```

React나 Vue 같은 프레임워크는 내부적으로 이미 변경을 배치 처리하므로, 프레임워크 밖의 직접 DOM 조작에서 주로 필요하다.

---

## will-change — 브라우저에게 힌트 주기

애니메이션이 시작되기 전에 브라우저가 미리 별도 레이어를 준비하게 한다.

```css
/* 호버 시 애니메이션이 있는 요소 */
.card {
  will-change: transform;
}

/* 또는 JS로 애니메이션 직전에 설정 */
el.style.willChange = 'transform';
el.addEventListener('transitionend', () => {
  el.style.willChange = 'auto'; // 끝나면 해제
});
```

**주의**: `will-change`를 남용하면 레이어가 과다하게 생성되어 메모리를 낭비한다. 실제로 애니메이션이 있는 요소에만 적용한다.

---

## 정리

| 종류 | 유발 조건 | 비용 |
|---|---|---|
| Reflow | 크기/위치 변경 | 높음 (전파 발생) |
| Repaint | 색상/배경 변경 | 중간 |
| Composite | transform, opacity | 낮음 (GPU) |

애니메이션 성능 최적화의 첫 번째 원칙: **`transform`과 `opacity`만 애니메이트한다.** 나머지는 Reflow 또는 Repaint를 유발한다.

Chrome DevTools의 Performance 탭에서 "Rendering" 옵션의 "Paint flashing"을 켜면 Repaint가 발생하는 영역이 초록색으로 표시된다. 어디서 비용이 발생하는지 눈으로 확인하는 가장 빠른 방법이다.
