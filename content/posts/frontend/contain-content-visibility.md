---
title: "contain과 content-visibility — 브라우저가 렌더링을 건너뛰는 방법"
date: "2026-04-19"
summary: "CSS contain과 content-visibility 속성이 브라우저에게 렌더링 범위를 제한하는 힌트를 주어 성능을 높이는 원리와 실무 적용 방법을 정리했다."
category: "Frontend"
tags:
  - CSS
  - Performance
  - contain
  - content-visibility
  - Rendering
featured: false
---

# contain과 content-visibility

브라우저는 DOM 변경이 생기면 어디까지 영향을 줄지 확신하지 못해서 넓은 범위를 다시 계산한다. `contain`과 `content-visibility`는 "이 요소의 변경은 바깥에 영향을 주지 않는다"고 명시적으로 알려주는 CSS 속성이다.

---

## contain — 렌더링 범위를 명시적으로 제한

`contain` 속성은 요소에 적용 가능한 격리 유형을 지정한다. 브라우저가 해당 요소 밖을 다시 계산하지 않아도 된다는 힌트다.

### contain 값

```css
/* 크기 격리: 요소의 크기가 자식에 의존하지 않음 */
contain: size;

/* 레이아웃 격리: 내부 레이아웃 변경이 외부에 영향 없음 */
contain: layout;

/* 스타일 격리: counter, quotes 같은 CSS 속성이 외부에 영향 없음 */
contain: style;

/* 페인트 격리: 내부가 경계 밖으로 그려지지 않음, Stacking Context 생성 */
contain: paint;

/* layout + style + paint 조합 */
contain: content;

/* size + layout + style + paint 조합 */
contain: strict;
```

### 실용적인 사용 — 카드 컴포넌트

```css
.card {
  contain: content; /* layout + style + paint */
}
```

`contain: content`를 적용하면:
- 카드 내부의 레이아웃 변경이 카드 밖 요소들의 reflow를 유발하지 않는다.
- 카드 내부 요소들이 카드 경계 밖으로 그려질 수 없다 (`overflow: hidden`과 유사하지만 렌더링 성능 측면).
- 스크롤 목록에서 한 카드의 내용이 바뀌어도 다른 카드들을 다시 계산하지 않는다.

```css
/* 반복되는 리스트 아이템에 유용 */
.post-item {
  contain: content;
}

/* 위젯, 광고 등 독립적인 컴포넌트 */
.widget {
  contain: strict; /* 크기까지 완전히 격리 */
  width: 300px;
  height: 250px;
}
```

---

## content-visibility — 뷰포트 밖 렌더링 건너뛰기

`content-visibility: auto`는 요소가 뷰포트 밖에 있을 때 렌더링 작업(Layout, Paint)을 완전히 건너뛴다. 화면에 보일 때만 렌더링한다.

```css
.section {
  content-visibility: auto;
  contain-intrinsic-size: 0 500px; /* 렌더링 전 예약할 크기 */
}
```

### contain-intrinsic-size — 자리 예약

`content-visibility: auto`를 쓰면 렌더링을 건너뛴 요소의 크기가 0이 된다. 스크롤바 크기가 변하거나 다른 요소들이 갑자기 이동하는 CLS(레이아웃 이동)가 발생한다.

`contain-intrinsic-size`로 렌더링 전에 차지할 공간을 미리 지정한다.

```css
.article-section {
  content-visibility: auto;

  /* 고정 크기로 예약 */
  contain-intrinsic-size: 0 800px;

  /* 또는 auto로 이전에 렌더링한 크기를 기억해서 사용 */
  contain-intrinsic-size: auto 800px;
}
```

`auto 800px`는 한 번 렌더링된 후 실제 크기를 기억하고, 다시 화면 밖으로 나가면 그 크기를 유지한다. 초기 추정값(800px)보다 정확하다.

---

## 실제 성능 효과

긴 문서 페이지나 무한 스크롤 목록에서 효과가 크다.

```css
/* 블로그 포스트처럼 긴 페이지의 섹션들 */
.post-section {
  content-visibility: auto;
  contain-intrinsic-size: auto 600px;
}
```

구글의 측정에 따르면 뉴스 사이트 같은 긴 페이지에서 초기 렌더링 시간이 최대 7배 단축된 사례가 있다. 페이지 전체를 렌더링하지 않고 뷰포트 근처만 렌더링하기 때문이다.

---

## contain과 content-visibility의 관계

`content-visibility: auto`는 내부적으로 `contain: strict`와 유사하게 동작한다. 요소가 뷰포트에 들어오면 렌더링하고, 나가면 Layout과 Paint를 건너뛰면서 size containment는 유지한다.

---

## 주의할 점

### 검색(Ctrl+F)에서 보이지 않는 콘텐츠

렌더링을 건너뛴 요소는 브라우저 내장 검색에서 찾지 못할 수 있다. 최신 브라우저들은 이를 개선하고 있지만 완벽하지 않다.

### contain: paint와 overflow

`contain: paint`는 내부 요소가 경계 밖으로 그려지지 않는다. 드롭다운 메뉴, 툴팁처럼 부모 경계를 넘어야 하는 UI에는 사용하면 안 된다.

```css
/* 드롭다운이 있는 컴포넌트에는 주의 */
.dropdown-container {
  /* contain: paint 쓰면 드롭다운이 잘림 */
  contain: layout style; /* paint 제외 */
}
```

### 크기를 모를 때 contain: size

`contain: size`나 `contain: strict`를 사용하면 자식 요소가 부모 크기에 영향을 주지 않는다. 크기를 CSS로 명시하지 않으면 요소가 0x0이 된다.

```css
/* 반드시 크기를 명시해야 함 */
.widget {
  contain: strict;
  width: 300px;
  height: 200px;
}
```

---

## 정리

| 속성 | 역할 | 주로 쓰는 곳 |
|---|---|---|
| `contain: content` | 레이아웃/페인트 격리 | 반복 카드, 독립 컴포넌트 |
| `contain: strict` | 크기까지 완전 격리 | 크기 고정 위젯 |
| `content-visibility: auto` | 뷰포트 밖 렌더링 생략 | 긴 페이지, 스크롤 목록 |
| `contain-intrinsic-size` | 렌더링 전 크기 예약 | content-visibility와 함께 |

두 속성 모두 **브라우저에게 힌트를 주는 것**이다. 잘못 쓰면 레이아웃 버그나 의도치 않은 클리핑이 생긴다. 적용 전에 실제로 성능 차이가 있는지 측정하는 것이 좋다.
