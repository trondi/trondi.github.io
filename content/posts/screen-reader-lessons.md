---
title: "스크린 리더를 직접 써보고 알게 된 것들"
date: "2026-04-19"
summary: "VoiceOver와 NVDA를 직접 사용해보면서 개발자가 놓치기 쉬운 접근성 문제들을 정리했다. 코드로 보던 것과 실제로 들리는 것은 다르다."
category: "Frontend"
tags:
  - Accessibility
  - Screen Reader
  - VoiceOver
  - NVDA
featured: false
---

# 스크린 리더를 직접 써보고 알게 된 것들

접근성 문서를 읽는 것과 스크린 리더를 직접 써보는 것은 완전히 다른 경험이다. 코드를 짜면서 "이 정도면 됐겠지"라고 생각했던 것들이 실제로 얼마나 이상하게 들리는지를 알게 됐다.

---

## 스크린 리더 시작하기

**macOS — VoiceOver**
- 켜기/끄기: `Cmd + F5`
- 기본 탐색: `Ctrl + Option` + 방향키
- 다음 링크/버튼으로 이동: `Tab`
- 제목(heading)으로 이동: `Ctrl + Option + Cmd + H`

**Windows — NVDA** (무료)
- NVDA 수식키: `Insert` (또는 `Caps Lock`)
- 제목으로 이동: `H`
- 링크로 이동: `K`
- 폼 요소로 이동: `F`

처음에는 읽어주는 속도가 너무 빠르게 느껴진다. 익숙한 스크린 리더 사용자는 이 속도에서 정보를 다 처리한다.

---

## 실제로 겪은 문제들

### 1. 아이콘 버튼이 "버튼"이라고만 읽힌다

```tsx
// 이렇게 만든 삭제 버튼
<button onClick={handleDelete}>
  <TrashIcon />
</button>
```

스크린 리더가 읽는 것: **"버튼"**

무슨 버튼인지 전혀 알 수 없다. 페이지에 이런 버튼이 여러 개 있으면 Tab으로 이동하면서 "버튼, 버튼, 버튼"만 들린다.

```tsx
<button aria-label="게시글 삭제" onClick={handleDelete}>
  <TrashIcon aria-hidden="true" />
</button>
```

`aria-hidden="true"`를 아이콘에 추가하는 것도 중요하다. 없으면 SVG 내부 path 정보까지 읽으려 시도한다.

---

### 2. 링크 텍스트가 "여기를 클릭하세요"

```tsx
// 흔하게 보이는 패턴
<a href="/posts/1">자세히 보기</a>
<a href="/posts/2">자세히 보기</a>
<a href="/posts/3">자세히 보기</a>
```

스크린 리더 사용자가 링크 목록만 따로 탐색할 수 있다. 이 경우 "자세히 보기, 자세히 보기, 자세히 보기"가 반복된다.

```tsx
// 방법 1: aria-label로 구체적인 목적지를 명시
<a href="/posts/1" aria-label="React 훅 패턴 자세히 보기">자세히 보기</a>

// 방법 2: aria-labelledby로 제목 참조
<article>
  <h2 id="post-title-1">React 훅 패턴</h2>
  <a href="/posts/1" aria-labelledby="post-title-1">자세히 보기</a>
</article>

// 방법 3: 시각적으로 숨기고 텍스트 추가
<a href="/posts/1">
  자세히 보기
  <span className="sr-only">— React 훅 패턴</span>
</a>
```

```css
/* sr-only: 시각적으로는 숨기되 스크린 리더에는 노출 */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

---

### 3. 모달이 열려도 포커스가 이동하지 않는다

모달을 클릭해서 열었을 때, 스크린 리더는 여전히 배경 페이지를 읽고 있다. 모달이 존재한다는 것 자체를 인식하지 못한다.

```tsx
// 모달이 열리면 포커스를 이동시켜야 한다
const modalRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (isOpen) {
    modalRef.current?.focus();
  }
}, [isOpen]);

<div
  ref={modalRef}
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-heading"
  tabIndex={-1}
>
  <h2 id="modal-heading">제목</h2>
  {/* ... */}
</div>
```

`aria-modal="true"`는 배경 콘텐츠를 스크린 리더가 탐색하지 않도록 한다.

---

### 4. 로딩 상태가 아무 말도 안 한다

버튼 클릭 후 로딩 스피너가 보이지만, 스크린 리더 사용자는 아무 일도 일어나지 않은 것처럼 느낀다.

```tsx
// 상태 변화를 스크린 리더에게 알린다
<button
  aria-disabled={isLoading}
  onClick={handleSubmit}
>
  {isLoading ? '저장 중...' : '저장'}
</button>

{/* aria-live 영역으로 완료 메시지 전달 */}
<div aria-live="polite" className="sr-only">
  {isSuccess ? '저장되었습니다.' : ''}
</div>
```

---

### 5. 테이블 헤더가 없어서 각 셀이 무엇인지 모른다

```html
<!-- 스크린 리더가 읽는 것: "홍길동, 개발팀, 5년" — 각각 무슨 의미인지 모름 -->
<table>
  <tr><td>홍길동</td><td>개발팀</td><td>5년</td></tr>
</table>

<!-- 올바른 구조 -->
<table>
  <thead>
    <tr>
      <th scope="col">이름</th>
      <th scope="col">부서</th>
      <th scope="col">경력</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>홍길동</td>
      <td>개발팀</td>
      <td>5년</td>
    </tr>
  </tbody>
</table>
```

`scope="col"` 또는 `scope="row"`를 쓰면 "이름 열: 홍길동, 부서 열: 개발팀"처럼 컨텍스트와 함께 읽힌다.

---

## 핵심 요약

직접 써보고 나서 가장 크게 바뀐 관점:

1. **Tab 순서가 시각적 레이아웃과 일치해야 한다** — 스크린 리더는 DOM 순서를 따른다. CSS로 시각적 순서를 바꿨다면 DOM 순서도 맞춰야 한다.
2. **"이것이 무엇인가"를 모든 요소에서 대답할 수 있어야 한다** — 시각 정보 없이 요소를 처음 들었을 때 무엇인지 알 수 있는가.
3. **상태 변화는 반드시 알려야 한다** — 시각적 피드백만으로는 충분하지 않다.

직접 스크린 리더를 켜고 Tab만으로 만든 페이지를 탐색해보는 것이 가장 빠른 학습 방법이다.
