---
title: "Stacking Context — z-index가 왜 가끔 말을 안 듣는가"
date: "2026-04-19"
summary: "z-index를 높게 설정했는데도 요소가 가려지는 이유는 Stacking Context 때문이다. 어떤 CSS 속성이 새로운 Stacking Context를 만드는지, 어떻게 디버깅하는지 정리했다."
category: "Frontend"
tags:
  - CSS
  - z-index
  - Stacking Context
  - Layout
featured: false
---

# Stacking Context — z-index가 왜 가끔 말을 안 듣는가

모달을 만들었는데 다른 요소에 가린다. `z-index: 9999`를 줬는데도 소용없다. 이 문제의 원인은 거의 항상 Stacking Context다.

---

## z-index는 같은 Stacking Context 안에서만 비교된다

```html
<div class="parent-a" style="position: relative; z-index: 1">
  <div class="child-a" style="position: relative; z-index: 100">
    z-index 100
  </div>
</div>

<div class="parent-b" style="position: relative; z-index: 2">
  <div class="child-b" style="position: relative; z-index: 1">
    z-index 1
  </div>
</div>
```

`child-a`의 `z-index`는 100이고 `child-b`는 1이지만, **`child-b`가 `child-a` 위에 표시된다.**

이유: `child-a`가 속한 `parent-a`의 `z-index`가 1이고, `child-b`가 속한 `parent-b`의 `z-index`가 2이기 때문이다. 부모 Stacking Context끼리 먼저 비교되고, 자식의 `z-index`는 그 안에서만 유효하다.

---

## Stacking Context를 만드는 조건

`z-index`가 동작하지 않을 때 이 목록 중 하나가 원인인 경우가 많다.

**가장 흔한 경우:**
```css
/* position이 있고 z-index가 auto가 아닌 경우 */
position: relative; z-index: 1;
position: absolute; z-index: 0;
position: fixed; /* z-index 없어도 생성 */
position: sticky; /* z-index 없어도 생성 */
```

**덜 알려진 경우:**
```css
opacity: 0.99;           /* opacity가 1 미만인 경우 */
transform: translateX(0); /* transform이 none이 아닌 경우 */
filter: blur(0px);        /* filter가 none이 아닌 경우 */
will-change: transform;   /* will-change가 특정 속성인 경우 */
isolation: isolate;       /* 명시적으로 Stacking Context 생성 */
```

`transform: translateX(0)`처럼 값이 "아무것도 안 하는" 경우에도 Stacking Context가 생성된다.

---

## 실제 문제 사례

### 사례 1 — 모달이 헤더에 가린다

```css
/* 헤더 */
header {
  position: sticky;
  top: 0;
  /* sticky는 z-index 없어도 Stacking Context 생성 */
}

/* 모달 */
.modal {
  position: fixed;
  z-index: 1000;
}
```

`position: sticky`가 Stacking Context를 만들어서 `z-index: 1000`인 모달도 헤더 위로 올라오지 못하는 경우가 있다. 헤더에 `z-index`를 명시적으로 추가해서 비교 기준을 만들면 해결된다.

```css
header {
  position: sticky;
  top: 0;
  z-index: 100; /* 명시적으로 설정 */
}

.modal {
  position: fixed;
  z-index: 1000; /* header의 z-index보다 높게 */
}
```

### 사례 2 — 애니메이션 중에만 가려진다

```css
.card {
  transition: transform 0.3s;
}

.card:hover {
  transform: scale(1.05); /* 호버 시 Stacking Context 생성 */
}
```

평소에는 정상이다가 마우스를 올리면 `transform`이 적용되면서 Stacking Context가 생기고, 다른 요소에 가려지기 시작한다.

### 사례 3 — opacity 애니메이션 중 z-index 이상

```css
.tooltip {
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 500;
}

.tooltip.visible {
  opacity: 1;
}
```

`opacity`가 0에서 1로 변하는 중간 값(0 < opacity < 1)에서 Stacking Context가 생성된다. 완전히 불투명해지는 순간 Stacking Context가 사라지는 경우도 있다.

---

## isolation: isolate — 의도적으로 Stacking Context 만들기

외부 `z-index` 경쟁에서 컴포넌트를 격리하고 싶을 때 사용한다.

```css
/* 이 컴포넌트 내부의 z-index 전쟁이 외부에 영향을 주지 않음 */
.card-component {
  isolation: isolate;
}

.card-component .overlay {
  z-index: 10; /* card-component 안에서만 유효 */
}
```

라이브러리 컴포넌트나 재사용 가능한 컴포넌트에서 `z-index` 충돌을 방지하는 패턴으로 유용하다.

---

## 디버깅 방법

### Chrome DevTools — Layers 패널

1. DevTools 열기 → 우측 상단 `...` → More tools → Layers
2. 각 레이어를 3D 뷰로 확인하면 Stacking Context 구조가 보인다.

### 요소 검사로 확인

의심되는 요소를 선택하고 Computed 탭에서 현재 적용된 스타일을 확인한다. `transform`, `opacity`, `filter` 같은 속성이 예상치 못하게 적용되어 있는지 본다.

### 임시로 격리

문제 요소에 `isolation: isolate`를 추가하거나 부모에 `z-index`를 명시해서 범위를 좁혀가며 원인을 찾는다.

---

## 정리

`z-index`가 말을 안 들을 때 확인할 것:

1. **같은 Stacking Context 안에 있는가?** 부모가 다른 Stacking Context를 만들고 있지 않은가
2. **부모에 `transform`, `opacity`, `filter`, `will-change`가 있는가?** 값이 "아무것도 안 한다"고 생각해도 Stacking Context를 만든다
3. **`position: sticky` / `fixed`가 있는가?** `z-index` 없이도 Stacking Context가 생긴다

`z-index`를 무작정 올리는 것은 해결책이 아니다. Stacking Context 구조를 이해하고 원인을 찾는 것이 올바른 접근이다.
