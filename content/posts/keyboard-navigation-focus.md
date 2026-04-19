---
title: "키보드 내비게이션과 포커스 관리 — tabIndex, focus-visible, aria 실무 패턴"
date: "2026-04-19"
summary: "마우스 없이도 동작하는 UI를 만들기 위해 알아야 할 tabIndex 규칙, 포커스 트랩, focus-visible, aria 속성 실무 패턴을 정리했다."
category: "Frontend"
tags:
  - Accessibility
  - Keyboard Navigation
  - Focus Management
  - ARIA
featured: false
---

# 키보드 내비게이션과 포커스 관리

키보드로 웹을 탐색하는 사람은 생각보다 많다. 운동 장애가 있는 사용자, 파워 유저, 스크린 리더 사용자 모두 키보드에 의존한다. 접근성을 "나중에 생각할 것"으로 미루면 나중에 고치기 훨씬 어려워진다.

---

## tabIndex 규칙

`tabIndex`는 Tab 키로 요소에 포커스를 이동시키는 속성이다.

| 값 | 동작 |
|---|---|
| 없음 (기본) | 인터랙티브 요소(`a`, `button`, `input` 등)만 포커스 가능 |
| `0` | Tab 순서에 포함, DOM 순서를 따름 |
| `-1` | Tab으로는 접근 불가, JS로만 포커스 가능 |
| `1` 이상 | Tab 순서를 강제 지정 (사용 자제) |

```tsx
// 커스텀 클릭 가능 요소는 button으로 만드는 것이 우선
<button onClick={handleClick}>클릭</button>

// div로 만들어야 한다면 반드시 tabIndex와 키보드 이벤트 추가
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
>
  클릭
</div>
```

`tabIndex={1}` 이상은 DOM 순서와 다른 Tab 순서를 만들어 혼란을 준다. 쓰지 않는 게 원칙이다.

---

## 포커스 트랩 — 모달에서 Tab이 밖으로 나가지 않게

모달이 열렸을 때 Tab을 눌러도 배경 요소에 포커스가 가면 안 된다. 이를 포커스 트랩이라 한다.

```tsx
function trapFocus(container: HTMLElement) {
  const focusable = container.querySelectorAll<HTMLElement>(
    'a, button, input, textarea, select, [tabIndex]:not([tabIndex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  container.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}
```

React에서는 직접 구현하기보다 `@radix-ui/react-focus-trap`이나 headless UI 라이브러리를 쓰는 것이 낫다. 엣지 케이스가 많다.

모달이 열릴 때는 모달 내 첫 번째 포커스 가능 요소(또는 모달 컨테이너 자체)로 포커스를 이동시키고, 닫힐 때는 모달을 열었던 트리거 요소로 포커스를 돌려줘야 한다.

```tsx
function Modal({ isOpen, onClose, triggerRef }) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus();
    } else {
      triggerRef.current?.focus(); // 닫힐 때 트리거로 복귀
    }
  }, [isOpen]);

  return isOpen ? (
    <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true">
      {/* ... */}
    </div>
  ) : null;
}
```

---

## focus-visible — 포커스 링을 마우스 클릭 때는 숨기기

마우스로 버튼을 클릭할 때 파란 포커스 링이 보이는 것은 보통 의도하지 않은 동작이다. 그렇다고 `outline: none`으로 아예 없애면 키보드 사용자가 현재 포커스 위치를 알 수 없다.

```css
/* 나쁜 예 — 키보드 사용자에게도 포커스 링이 사라짐 */
button:focus {
  outline: none;
}

/* 좋은 예 — 키보드 탐색 시에만 표시 */
button:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

button:focus:not(:focus-visible) {
  outline: none;
}
```

`:focus-visible`은 브라우저가 키보드 탐색 중이라고 판단할 때만 적용된다. 마우스 클릭 시에는 적용되지 않는다.

---

## ARIA 속성 실무 패턴

ARIA(Accessible Rich Internet Applications)는 시맨틱 HTML로 표현하기 어려운 UI 상태를 보조 기술에 전달한다.

### aria-label / aria-labelledby

시각적 레이블이 없는 요소에 의미를 부여한다.

```tsx
// 아이콘만 있는 버튼
<button aria-label="검색">
  <SearchIcon />
</button>

// 다른 요소의 텍스트를 레이블로 사용
<h2 id="modal-title">삭제 확인</h2>
<div role="dialog" aria-labelledby="modal-title">
  {/* ... */}
</div>
```

### aria-expanded / aria-controls

토글 가능한 UI 상태를 전달한다.

```tsx
<button
  aria-expanded={isOpen}
  aria-controls="menu-list"
  onClick={() => setIsOpen(!isOpen)}
>
  메뉴
</button>
<ul id="menu-list" hidden={!isOpen}>
  {/* ... */}
</ul>
```

### aria-live — 동적 콘텐츠 알림

Ajax로 변경된 콘텐츠를 스크린 리더가 자동으로 읽게 한다.

```tsx
// polite: 현재 읽는 것이 끝난 후 알림
// assertive: 즉시 중단하고 알림 (오류 메시지 등)
<div aria-live="polite" aria-atomic="true">
  {statusMessage}
</div>
```

### role

HTML 요소의 의미를 덮어쓰거나 보강한다.

```tsx
// 탭 UI
<div role="tablist">
  <button role="tab" aria-selected={activeTab === 0} aria-controls="panel-0">탭 1</button>
  <button role="tab" aria-selected={activeTab === 1} aria-controls="panel-1">탭 2</button>
</div>
<div role="tabpanel" id="panel-0" hidden={activeTab !== 0}>...</div>
<div role="tabpanel" id="panel-1" hidden={activeTab !== 1}>...</div>
```

---

## 체크리스트

- [ ] 모든 인터랙티브 요소가 Tab으로 접근 가능한가
- [ ] `div`/`span`에 클릭 핸들러가 있다면 `role`과 키보드 이벤트가 있는가
- [ ] `outline: none`을 쓰고 있다면 `:focus-visible`로 대체했는가
- [ ] 모달이 열릴 때 포커스가 이동하고, 닫힐 때 원래 위치로 돌아오는가
- [ ] 아이콘 버튼에 `aria-label`이 있는가
- [ ] 동적으로 변경되는 상태 메시지에 `aria-live`가 있는가
