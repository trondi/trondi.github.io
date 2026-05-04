---
title: "브라우저 렌더링 파이프라인과 Chrome 동작 원리"
date: "2026-05-02"
summary: "HTML이 화면의 픽셀이 되기까지 브라우저가 거치는 DOM, CSSOM, Render Tree, Layout, Paint, Raster, Composite 단계를 Chrome의 프로세스와 스레드 구조에 연결해서 정리했다."
category: "Frontend"
tags:
  - Browser
  - Chrome
  - Rendering
  - Performance
  - Critical Rendering Path
featured: false
---

# 브라우저 렌더링 파이프라인과 Chrome 동작 원리

웹 페이지는 HTML 파일 하나를 그대로 화면에 붙여서 보여주는 것이 아니다. 브라우저는 HTML, CSS, JavaScript, 이미지, 폰트 같은 리소스를 받아서 내부 자료구조로 바꾸고, 위치를 계산하고, 그릴 순서를 만들고, 픽셀로 변환한 뒤, 여러 레이어를 합쳐 화면에 표시한다.

이 글은 브라우저 렌더링 과정을 처음 보는 사람도 흐름을 잡을 수 있도록 `DOM`, `CSSOM`, `Render Tree`, `Layout`, `Paint`, `Raster`, `Composite` 순서로 정리한다. 마지막에는 Chrome이 이 일을 어떤 프로세스와 스레드에 나눠 처리하는지도 연결해서 본다.

---

## 한 장으로 보는 전체 흐름

브라우저가 페이지를 보여주는 큰 흐름은 다음과 같다.

```text
URL 입력
  → Navigation
  → HTML/CSS/JS/Image/Font 다운로드
  → HTML 파싱 → DOM
  → CSS 파싱 → CSSOM
  → Style 계산
  → Layout Tree / Render Tree
  → Layout
  → Paint
  → Layer Tree
  → Raster
  → Composite
  → 화면 표시
```

초보자 입장에서는 먼저 세 문장만 기억하면 된다.

- `Layout`은 요소의 위치와 크기를 계산하는 단계다.
- `Paint`는 배경, 글자, 테두리, 그림자처럼 실제로 무엇을 그릴지 기록하는 단계다.
- `Composite`는 이미 그려진 여러 레이어를 GPU 쪽에서 합쳐 최종 화면을 만드는 단계다.

---

## Chrome은 하나의 프로세스가 아니다

Chrome은 하나의 앱처럼 보이지만 내부적으로 여러 프로세스로 나뉜다. 이 구조는 안정성과 보안을 위해 중요하다. 한 탭이 멈춰도 브라우저 전체가 같이 죽지 않게 하고, 사이트 간 격리도 가능하게 한다.

대표적인 프로세스는 다음과 같다.

| 프로세스 | 역할 |
|---|---|
| Browser Process | 주소창, 탭, 네트워크 요청, 파일 접근, 사용자 입력의 1차 처리 |
| Renderer Process | 탭 안의 웹 콘텐츠 처리. HTML/CSS/JS를 해석하고 렌더링 파이프라인 수행 |
| GPU Process | GPU 명령 처리, 최종 합성 결과를 화면에 표시 |
| Utility Process | 오디오, 비디오, 압축 해제, 보조 작업 처리 |

Chrome 공식 문서에서는 브라우저 바깥쪽 UI와 네트워크는 Browser Process가 담당하고, 탭 안의 웹 콘텐츠는 Renderer Process가 담당한다고 설명한다. 참고 이미지: [Chrome for Developers - Inside look at modern web browser part 1](https://developer.chrome.com/blog/inside-browser-part1), [part 2](https://developer.chrome.com/blog/inside-browser-part2)

---

## 1단계: Navigation과 리소스 다운로드

사용자가 주소창에 `https://example.com`을 입력하면 Chrome은 먼저 이것이 검색어인지 URL인지 판단한다. URL이라면 대략 다음 순서로 페이지를 가져온다.

1. DNS 조회로 도메인의 IP 주소를 찾는다.
2. 서버와 TCP 연결을 만든다.
3. HTTPS라면 TLS 연결을 만든다.
4. HTTP 요청을 보낸다.
5. 서버가 HTML을 응답한다.
6. HTML 안에서 발견한 CSS, JS, 이미지, 폰트 등을 추가로 요청한다.

Renderer Process는 HTML을 받기 시작하면 파싱을 시작한다. 이때 모든 HTML을 다 받은 뒤 시작하는 것이 아니라, 가능한 경우 스트리밍으로 들어오는 HTML을 읽으면서 DOM을 만들어간다.

Chrome에는 `preload scanner`도 있다. HTML 파서가 DOM을 만드는 동안, 별도 스캐너가 `<link>`, `<img>`, `<script>` 같은 리소스를 미리 발견해서 네트워크 요청을 앞당긴다. 참고: [Chrome for Developers - Subresource loading](https://developer.chrome.com/blog/inside-browser-part3#subresource_loading)

---

## 2단계: HTML 파싱과 DOM 생성

브라우저는 HTML 문자열을 토큰으로 나누고, 토큰을 노드로 바꿔 트리 구조를 만든다. 이 트리가 `DOM(Document Object Model)`이다.

```html
<body>
  <h1>Hello</h1>
  <p>Browser rendering</p>
</body>
```

위 HTML은 브라우저 내부에서 대략 이런 구조가 된다.

```text
Document
└─ html
   └─ body
      ├─ h1
      │  └─ "Hello"
      └─ p
         └─ "Browser rendering"
```

DOM은 화면에 그릴 정보만 담는 구조가 아니다. 문서 전체의 구조이면서 JavaScript가 접근하고 수정할 수 있는 API이기도 하다.

```js
document.querySelector("h1").textContent = "Hi";
```

이 코드는 DOM 안의 `h1` 노드를 찾아 텍스트를 바꾼다. 브라우저는 DOM이 바뀌면 필요한 렌더링 단계를 다시 수행할 수 있다.

---

## 3단계: CSS 파싱과 CSSOM 생성

HTML만으로는 요소가 어떻게 보여야 하는지 알 수 없다. 브라우저는 CSS를 파싱해서 `CSSOM(CSS Object Model)`을 만든다.

```css
h1 {
  color: tomato;
  font-size: 32px;
}
```

CSSOM은 어떤 선택자가 어떤 요소에 어떤 스타일을 적용하는지 계산하기 위한 구조다. 여기에 브라우저 기본 스타일도 함께 영향을 준다. 예를 들어 별도 CSS가 없어도 `h1`은 기본적으로 굵고 크게 보인다. 브라우저의 기본 스타일시트가 있기 때문이다.

CSS는 보통 렌더링을 막는 리소스다. CSSOM이 없으면 브라우저가 어떤 스타일로 Render Tree를 만들어야 하는지 확정할 수 없기 때문이다.

```html
<link rel="stylesheet" href="/styles.css">
```

위 스타일시트가 늦게 도착하면 첫 화면 렌더링도 늦어질 수 있다. 그래서 첫 화면에 필요한 CSS를 줄이고, 필요 없는 CSS를 늦게 로드하는 최적화가 의미를 가진다.

---

## 4단계: JavaScript는 파싱을 멈출 수 있다

HTML 파서가 일반 `<script>` 태그를 만나면 기본적으로 HTML 파싱을 멈추고 JavaScript를 다운로드, 파싱, 실행한다.

```html
<script src="/app.js"></script>
```

이유는 JavaScript가 DOM 구조를 바꿀 수 있기 때문이다.

```js
document.body.innerHTML = "<main>Changed</main>";
```

브라우저 입장에서는 JS 실행 전후의 문서 구조가 달라질 수 있으므로, 스크립트 실행이 끝나기 전까지 다음 HTML을 안전하게 파싱하기 어렵다.

이를 줄이기 위해 `defer`와 `async`를 사용한다.

```html
<script src="/app.js" defer></script>
<script src="/analytics.js" async></script>
```

| 속성 | 동작 |
|---|---|
| 기본 script | HTML 파싱을 멈추고 JS 실행 |
| defer | HTML 파싱은 계속하고, 파싱 완료 후 순서대로 실행 |
| async | 다운로드가 끝나는 즉시 실행. 실행 순서 보장 안 됨 |

초기 렌더링에 반드시 필요하지 않은 스크립트는 보통 `defer`가 안전한 선택이다.

---

## 5단계: Style 계산

DOM과 CSSOM이 준비되면 브라우저는 각 DOM 노드에 실제로 적용될 최종 스타일을 계산한다. 이를 `computed style`이라고 부른다.

예를 들어 CSS가 이렇게 있을 수 있다.

```css
body {
  font-size: 16px;
}

.title {
  font-size: 2rem;
  color: tomato;
}
```

그리고 HTML이 이렇게 있다.

```html
<h1 class="title">Rendering</h1>
```

브라우저는 `h1.title`에 최종적으로 다음과 같은 스타일이 적용된다고 계산한다.

```text
font-size: 32px
color: tomato
display: block
font-weight: bold
```

여기에는 직접 작성한 스타일, 상속된 스타일, 브라우저 기본 스타일, CSS 우선순위가 모두 반영된다.

---

## 6단계: Render Tree와 Layout Tree

스타일 계산이 끝나면 브라우저는 실제 화면에 필요한 트리를 만든다. 문서마다 용어를 조금 다르게 설명할 수 있지만, 입문 단계에서는 `DOM + CSSOM → 실제로 그릴 노드 트리`라고 이해하면 된다.

중요한 점은 DOM에 있는 모든 노드가 화면용 트리에 들어가지는 않는다는 것이다.

```html
<body>
  <h1>Hello</h1>
  <p style="display: none">Hidden</p>
  <p style="visibility: hidden">Invisible but takes space</p>
</body>
```

| 요소 | 화면용 트리에 포함되는가 | 이유 |
|---|---|---|
| `h1` | 포함 | 화면에 보임 |
| `display: none` | 제외 | 레이아웃 공간도 차지하지 않음 |
| `visibility: hidden` | 포함 | 보이지 않지만 공간은 차지함 |
| `head`, `meta`, `script` | 보통 제외 | 시각적으로 그릴 대상이 아님 |

Chrome 공식 문서에서는 Layout Tree가 DOM과 비슷하지만 화면에 보이는 것과 관련된 정보만 포함한다고 설명한다. 참고 이미지: [Chrome for Developers - Layout](https://developer.chrome.com/blog/inside-browser-part3#layout)

---

## 7단계: Layout은 위치와 크기를 계산한다

`Layout`은 각 요소의 좌표와 크기를 계산하는 단계다. 예를 들어 다음 CSS가 있다고 하자.

```css
.card {
  width: 320px;
  padding: 24px;
  margin: 20px;
}
```

브라우저는 이 요소에 대해 대략 다음 정보를 계산해야 한다.

```text
x 좌표
y 좌표
콘텐츠 너비
콘텐츠 높이
padding 포함 크기
margin 포함 배치
다음 형제 요소가 시작할 위치
텍스트 줄바꿈 위치
```

Layout이 어려운 이유는 하나의 요소 크기가 주변 요소에 영향을 줄 수 있기 때문이다. 텍스트가 한 줄에서 두 줄로 바뀌면 요소의 높이가 바뀌고, 그 아래 요소의 위치도 바뀐다.

```js
title.textContent = "아주 긴 제목 아주 긴 제목 아주 긴 제목";
```

이 코드는 단순히 텍스트만 바꾸는 것처럼 보이지만, 줄바꿈과 높이가 바뀌면 Layout이 다시 필요할 수 있다. 예전에는 이런 재계산을 흔히 `Reflow`라고 불렀고, DevTools에서는 주로 `Layout`이라는 이름으로 보인다.

---

## 8단계: Paint는 그릴 명령을 만든다

Layout이 끝나면 브라우저는 각 요소를 어떤 순서로 어떻게 그릴지 기록한다. 이 단계가 `Paint`다.

```css
.card {
  background: white;
  border: 1px solid #ddd;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
  color: #111;
}
```

브라우저는 위 스타일을 보고 대략 이런 페인트 기록을 만든다.

```text
1. 그림자를 그린다
2. 흰색 배경을 칠한다
3. 테두리를 그린다
4. 텍스트를 그린다
```

Paint는 단순히 “색칠”만 의미하지 않는다. `z-index`, 쌓임 맥락, 배경, 테두리, 텍스트, 이미지, 그림자, 필터 등 시각적 표현 순서를 결정하는 작업이다.

Chrome 공식 문서에서는 Paint 단계에서 Main Thread가 Layout Tree를 순회하며 “background first, then text, then rectangle” 같은 paint record를 만든다고 설명한다. 참고 이미지: [Chrome for Developers - Paint](https://developer.chrome.com/blog/inside-browser-part3#paint)

---

## 9단계: Layer는 왜 생기는가

브라우저는 페이지 전체를 하나의 큰 이미지로만 다루지 않는다. 일부 요소는 별도의 레이어로 분리될 수 있다.

레이어는 포토샵의 레이어와 비슷하게 생각하면 쉽다.

```text
Layer 1: 배경
Layer 2: 본문 콘텐츠
Layer 3: 고정 헤더
Layer 4: 애니메이션 중인 모달
```

레이어가 분리될 수 있는 대표적인 경우는 다음과 같다.

- `transform`이 적용된 요소
- `opacity` 애니메이션이 있는 요소
- `position: fixed` 요소
- `will-change`로 브라우저에 힌트를 준 요소
- 비디오, canvas처럼 별도 처리가 필요한 요소

하지만 레이어가 많다고 무조건 빠른 것은 아니다. 레이어마다 메모리가 필요하고, 합성 비용도 늘어난다. `will-change`를 모든 요소에 붙이는 방식은 오히려 성능을 망칠 수 있다.

```css
/* 필요한 요소에만 제한적으로 사용 */
.drawer {
  will-change: transform;
}
```

Chrome 공식 문서도 과도한 레이어는 성능을 떨어뜨릴 수 있으므로 측정이 필요하다고 설명한다. 참고: [Chrome for Developers - Dividing into layers](https://developer.chrome.com/blog/inside-browser-part3#dividing_into_layers)

---

## 10단계: Raster는 그리기 명령을 픽셀로 바꾼다

Paint 단계는 “무엇을 어떤 순서로 그릴지”를 기록한다. 하지만 화면에는 결국 픽셀이 필요하다. 이 그리기 명령을 실제 비트맵 픽셀로 바꾸는 과정이 `Rasterization`이다.

예를 들어 Paint 기록이 이렇게 생겼다고 하자.

```text
x=20, y=20 위치에 320x120 사각형을 흰색으로 칠하라
텍스트 "Hello"를 #111 색상으로 그려라
```

Raster 단계에서는 이 명령이 실제 픽셀 데이터로 변환된다.

```text
(20, 20) 픽셀 = white
(21, 20) 픽셀 = white
...
텍스트 획에 해당하는 픽셀 = #111
```

Chrome은 큰 레이어를 한 번에 래스터화하지 않고 여러 타일로 나눈다. 그리고 현재 viewport 안에 있거나 곧 보일 가능성이 높은 타일을 우선 처리한다.

```text
+--------+--------+--------+
| Tile 1 | Tile 2 | Tile 3 |
+--------+--------+--------+
| Tile 4 | Tile 5 | Tile 6 |
+--------+--------+--------+
```

참고 이미지: [Chrome for Developers - Raster threads creating bitmap tiles](https://developer.chrome.com/blog/inside-browser-part3#raster_and_composite_off_of_the_main_thread)

---

## 11단계: Composite는 레이어를 합친다

`Composite`는 여러 레이어를 최종 화면으로 합치는 단계다.

```text
최종 화면 =
  배경 레이어
  + 본문 레이어
  + 고정 헤더 레이어
  + 모달 레이어
```

이 단계에서는 각 레이어의 위치, 크기, 투명도, 변형, 겹침 순서를 고려해서 하나의 프레임을 만든다. Chrome에서는 이 일을 Renderer Process 안의 Compositor Thread와 GPU Process가 함께 처리한다.

Composite가 중요한 이유는 일부 변경이 Main Thread의 Layout/Paint를 거치지 않고 처리될 수 있기 때문이다.

```css
.box {
  transform: translateX(100px);
  opacity: 0.5;
}
```

`transform`과 `opacity`는 이상적인 경우 이미 래스터화된 레이어를 이동하거나 투명도만 바꾸면 된다. 그래서 Layout과 Paint를 다시 하지 않고 Composite만으로 새 프레임을 만들 수 있다.

반대로 다음 코드는 크기가 바뀌므로 Layout부터 다시 필요할 가능성이 높다.

```js
box.style.width = "500px";
```

---

## CSS 변경 비용을 비교하면 이해가 쉽다

렌더링 비용은 보통 다음 순서로 비싸다.

```text
Layout > Paint > Composite
```

예를 들어 어떤 CSS 속성을 바꾸느냐에 따라 필요한 단계가 달라진다.

| 변경 | 필요한 단계 | 이유 |
|---|---|---|
| `width`, `height`, `margin`, `font-size` | Style → Layout → Paint → Composite | 위치나 크기가 바뀔 수 있음 |
| `color`, `background`, `box-shadow` | Style → Paint → Composite | 위치는 그대로지만 픽셀을 다시 칠해야 함 |
| `transform`, `opacity` | Style → Composite | 이미 그린 레이어를 이동하거나 투명도만 바꿀 수 있음 |

그래서 애니메이션을 만들 때는 보통 `left`, `top`, `width`, `height`보다 `transform`, `opacity`가 낫다.

```css
/* Layout을 유발하기 쉬움 */
@keyframes badSlide {
  from { left: 0; }
  to { left: 200px; }
}

/* Composite만으로 처리될 가능성이 높음 */
@keyframes goodSlide {
  from { transform: translateX(0); }
  to { transform: translateX(200px); }
}
```

---

## Chrome Renderer Process 안의 스레드

Renderer Process 안에도 여러 스레드가 있다. 단순화하면 다음과 같다.

| 스레드 | 역할 |
|---|---|
| Main Thread | HTML 파싱, DOM, CSSOM, JS 실행, Style, Layout, Paint 기록 |
| Compositor Thread | 레이어 합성, 스크롤 처리, compositor frame 생성 |
| Raster Thread | paint record를 타일 단위 비트맵으로 변환 |
| Worker Thread | Web Worker, Service Worker 등 백그라운드 JS 처리 |

전체 흐름을 Chrome 내부 스레드와 연결하면 다음과 같다.

```text
Main Thread
  HTML 파싱
  DOM 생성
  CSS 파싱
  Style 계산
  Layout
  Paint record 생성
  Layer tree 생성

Raster Thread
  Layer를 tile로 나누고 bitmap으로 변환

Compositor Thread
  tile과 layer 정보를 모아 compositor frame 생성
  스크롤/transform/opacity 중심 변경 처리

GPU Process
  최종 프레임을 화면에 표시
```

Chrome 공식 문서의 Renderer Process 그림은 이 구조를 이해하는 데 좋다. 참고 이미지: [Chrome for Developers - Renderer process](https://developer.chrome.com/blog/inside-browser-part3#renderer_processes_handle_web_contents)

---

## 스크롤이 JavaScript보다 부드러울 수 있는 이유

Chrome에서 스크롤은 경우에 따라 Compositor Thread에서 Main Thread와 독립적으로 처리될 수 있다. 이미 레이어가 래스터화되어 있다면, 스크롤은 새 Layout을 계산하는 것이 아니라 어떤 타일과 레이어를 어느 위치에 합성할지 바꾸는 작업에 가깝다.

그래서 Main Thread가 JavaScript 실행으로 바빠도, 단순한 스크롤은 어느 정도 부드럽게 유지될 수 있다.

하지만 모든 스크롤이 항상 독립적으로 처리되는 것은 아니다. 스크롤 영역에 이벤트 리스너가 있고, 브라우저가 JS 실행 결과를 기다려야 한다면 Main Thread가 다시 중요해진다.

```js
window.addEventListener("touchstart", (event) => {
  // preventDefault 가능성이 있으면 브라우저가 스크롤을 바로 처리하기 어려울 수 있다.
  event.preventDefault();
});
```

이런 경우에는 `passive: true`를 사용해 브라우저에 “이 리스너는 스크롤을 막지 않는다”고 알려줄 수 있다.

```js
window.addEventListener(
  "touchstart",
  () => {
    // 스크롤을 막지 않는 작업
  },
  { passive: true }
);
```

참고: [Chrome for Developers - Input is coming to the Compositor](https://developer.chrome.com/blog/inside-browser-part4)

---

## Forced Synchronous Layout을 피해야 한다

성능 문제에서 자주 나오는 함정이 `Forced Synchronous Layout`이다. JavaScript가 스타일을 바꾼 뒤 곧바로 레이아웃 값을 읽으면, 브라우저는 최신 값을 알려주기 위해 Layout을 즉시 수행해야 할 수 있다.

나쁜 예시는 다음과 같다.

```js
for (const item of items) {
  item.style.width = "300px";
  console.log(item.offsetHeight);
}
```

`style.width`로 쓰고, 바로 `offsetHeight`로 읽는다. 이 패턴이 반복되면 브라우저가 최적화할 여지가 줄어든다.

읽기와 쓰기를 분리하는 편이 낫다.

```js
const heights = Array.from(items).map((item) => item.offsetHeight);

items.forEach((item, index) => {
  item.style.width = heights[index] + 100 + "px";
});
```

레이아웃을 강제할 수 있는 대표적인 읽기 API는 다음과 같다.

- `offsetWidth`, `offsetHeight`
- `clientWidth`, `clientHeight`
- `scrollWidth`, `scrollHeight`
- `getBoundingClientRect()`
- `getComputedStyle()`

---

## DevTools에서 직접 확인하기

Chrome DevTools에서 렌더링 파이프라인의 흔적을 확인할 수 있다.

1. DevTools를 연다.
2. `Performance` 탭에서 Record를 시작한다.
3. 페이지를 새로고침하거나 애니메이션을 실행한다.
4. Record를 멈춘다.
5. 타임라인에서 `Scripting`, `Rendering`, `Painting`, `Composite Layers` 등을 확인한다.

`Rendering` 패널에서는 다음 기능도 사용할 수 있다.

| 옵션 | 확인할 수 있는 것 |
|---|---|
| Paint flashing | 다시 칠해지는 영역을 초록색으로 표시 |
| Layout Shift Regions | 레이아웃 이동이 발생한 영역 표시 |
| Layer Borders | 레이어와 타일 경계 표시 |
| Frame rendering stats | FPS, dropped frame, GPU memory 등 표시 |
| Scrolling Performance Issues | 스크롤 성능에 영향을 줄 수 있는 영역 표시 |

공식 문서와 참고 이미지: [Chrome DevTools - Discover rendering performance issues](https://developer.chrome.com/docs/devtools/rendering/performance)

---

## 실무에서 기억할 기준

브라우저 렌더링을 이해하는 목적은 모든 내부 구현을 외우는 것이 아니라, 어떤 코드가 어느 단계에 부담을 주는지 판단하는 것이다.

- 크기와 위치를 바꾸면 Layout까지 다시 갈 가능성이 높다.
- 색상, 배경, 그림자만 바꾸면 Layout은 피할 수 있지만 Paint는 필요할 수 있다.
- `transform`, `opacity`는 Composite만으로 처리될 가능성이 높아 애니메이션에 유리하다.
- JavaScript가 Main Thread를 오래 점유하면 렌더링, 입력 처리, 이벤트 실행이 밀릴 수 있다.
- `will-change`는 필요한 요소에만 짧게 써야 한다.
- DOM 읽기와 쓰기를 섞어 반복하면 강제 Layout이 발생할 수 있다.
- DevTools Performance와 Rendering 패널로 추측이 아니라 실제 비용을 확인해야 한다.

---

## 정리

브라우저는 HTML을 바로 화면에 그리지 않는다. HTML은 DOM이 되고, CSS는 CSSOM이 되며, 두 정보가 결합되어 화면에 필요한 트리가 만들어진다. 그다음 Layout이 위치와 크기를 계산하고, Paint가 그릴 명령을 만들고, Raster가 픽셀로 바꾸며, Composite가 여러 레이어를 합쳐 최종 화면을 만든다.

Chrome은 이 과정을 Browser Process, Renderer Process, GPU Process로 나누고, Renderer Process 안에서도 Main Thread, Compositor Thread, Raster Thread로 역할을 나눈다. 이 구조 때문에 `transform`과 `opacity` 애니메이션이 상대적으로 부드럽고, 반대로 Layout을 자주 건드리는 코드는 쉽게 버벅일 수 있다.

더 깊게 보고 싶다면 Chrome 공식 시리즈를 읽는 것이 가장 좋다.

- [Inside look at modern web browser part 1 - CPU, GPU, Memory, and multi-process architecture](https://developer.chrome.com/blog/inside-browser-part1)
- [Inside look at modern web browser part 2 - What happens in navigation](https://developer.chrome.com/blog/inside-browser-part2)
- [Inside look at modern web browser part 3 - Inner workings of a Renderer Process](https://developer.chrome.com/blog/inside-browser-part3)
- [Inside look at modern web browser part 4 - Input is coming to the Compositor](https://developer.chrome.com/blog/inside-browser-part4)
- [Chrome DevTools - Discover rendering performance issues](https://developer.chrome.com/docs/devtools/rendering/performance)
