---
title: "운영 중인 프로젝트의 Redux 구조를 점검해봤다"
date: "2026-05-16"
summary: "store 설정 파일이 두 개로 갈라져 있고, selector 위치가 사람마다 다르고, slice 확장자가 섞여 있었다. 실제 프로젝트의 Redux 구조를 진단하고 리팩터링 방향을 정리한 기록."
category: "Project"
tags:
  - Redux
  - Redux Toolkit
  - Refactoring
  - Code Review
  - Architecture
featured: true
---

# 운영 중인 프로젝트의 Redux 구조를 점검해봤다

지난 글([Redux Toolkit — 내가 정리한 표준 폴더 구조](/posts/react-nextjs/redux-toolkit-structure))에서 정리한 베이스라인이 있다. 이번에는 실제로 운영 중인 Next.js 프로젝트의 Redux 구조를 그 기준으로 점검한 기록이다.

결론부터 말하면, 표준에서 어긋난 항목이 네 개 있었다. 그 중 하나는 잠깐 보고도 식은땀이 났던 항목이다 — **store 설정 파일이 두 개로 나뉘어 있어서, 사실상 store 인스턴스가 두 개 만들어지는 구조였다.** 더 정확히는, ReduxProvider가 쓰는 store와 컴포넌트들이 타입을 끌어다 쓰는 store가 서로 다른 파일에서 정의되고 있었다.

각 문제를 하나씩 본다.

---

## 현재 구조 스냅샷

```
app/store/
├─ index.tsx               ← configureStore #1 (ReduxProvider가 사용)
├─ RootReducer.tsx         ← configureStore #2 (RootState/AppDispatch 타입 export)
├─ modalSlice.tsx          ← .tsx
├─ sidebarSlice.tsx        ← .tsx
├─ configSlice.tsx         ← .tsx
├─ clusterInfoSlice.tsx    ← .tsx
├─ errorSlice.ts           ← .ts
├─ tableSlice.ts           ← .ts
├─ modalSelectors.ts       ← store 루트
└─ selector/
    └─ configSelector.ts   ← selector/ 서브폴더 (단수)
```

같은 폴더 안에서 슬라이스가 `.ts`와 `.tsx`로 갈리고, selector가 루트와 서브폴더에 흩어져 있다. 더 심각한 건 `index.tsx`와 `RootReducer.tsx`가 둘 다 `configureStore`를 호출하고 있다는 점이다.

---

## 문제 1 — store 설정 파일이 두 개

가장 큰 문제다. `index.tsx`와 `RootReducer.tsx` 두 파일이 **둘 다 store를 만들고 있다**.

### 어떻게 분리되어 있나

`ReduxProvider.tsx`는 `@store/index`에서 store를 가져온다.

```tsx
// app/providers/ReduxProvider.tsx
import { persistor, store } from '@store/index';
```

반면 컴포넌트들과 typed hooks는 `@store/RootReducer`에서 타입을 가져온다.

```tsx
// app/hooks/reduxHooks.tsx
import type { RootState, AppDispatch } from '@store/RootReducer';

// app/components/admin-panel/admin-panel-layout.tsx
import { RootState } from '@store/RootReducer';

// app/docker/host/constants/columns.tsx
import { AppDispatch } from '@store/RootReducer';
```

두 파일이 거의 같은 코드를 가지고 있지만 **세부 설정이 다르다**.

| 항목 | `index.tsx` | `RootReducer.tsx` |
|---|---|---|
| persist `blacklist` | 없음 (모든 reducer가 persist) | `['modal', 'error', 'table']` |
| `serializableCheck` | redux-persist 액션만 제외 | `false` (전체 비활성화) |
| logger | dev 환경에서만 | **항상** 적용 |
| devTools | production 제외 | 기본값 (production에서도 켜짐) |
| HYDRATE 처리 | 없음 | next-redux-wrapper HYDRATE 처리 있음 |
| persistor export | 있음 | 있음 |

### 왜 위험한가

`ReduxProvider`가 실제로 마운트하는 store는 `index.tsx`의 것이다. 그래서 다음과 같은 어긋남이 발생한다.

**1) persist blacklist가 적용되지 않는다.**
실제 동작하는 store(`index.tsx`)에는 blacklist가 없다. 따라서 modal/error/table 상태가 전부 localStorage에 저장된다. 새로고침하면 이전 모달 상태나 에러 메시지가 그대로 떠 있을 수 있다는 뜻이다. 의도와 정확히 반대.

**2) HYDRATE 액션이 처리되지 않는다.**
SSR에서 서버 상태를 클라이언트로 넘기는 HYDRATE 로직은 `RootReducer.tsx`에만 있다. 하지만 실제 store는 그 reducer를 안 쓰니까, next-redux-wrapper가 동작하지 않는다.

**3) logger가 production에서도 켜져 있다 — 그런데 안 켜져 있다.**
`RootReducer.tsx`는 logger를 항상 적용하지만, 실제 store는 dev에서만 logger를 켠다. 두 파일을 읽은 사람은 production에서도 로그가 찍힐 거라 오해할 수 있다.

**4) 타입과 실제가 어긋난다.**
`RootState`는 `RootReducer.tsx`의 combineReducers에서 추론되고, 실제 store는 `index.tsx`의 reducer에서 동작한다. 두 파일의 reducer 키 구성이 우연히 같으니까 지금은 문제가 없을 뿐, 한쪽만 reducer를 추가하면 그 순간 컴파일은 통과되는데 런타임에선 `undefined`가 된다.

### 어떻게 합치는가

`RootReducer.tsx`를 삭제하고 `index.ts`로 통합한다. 통합 시 결정해야 할 사항은:

1. **HYDRATE 처리를 살릴 것인가?** App Router로 마이그레이션 중이라면 next-redux-wrapper는 필요 없을 가능성이 크다. Pages Router에 `getServerSideProps`로 store 초기화를 넘기는 흐름이 있으면 살린다.
2. **persist blacklist는 `RootReducer.tsx` 쪽이 맞다.** modal/error/table은 persist 대상이 아니다.
3. **serializableCheck는 `index.tsx` 쪽이 맞다.** redux-persist 액션만 제외하고 나머지는 검사한다. 전체 `false`는 너무 느슨하다.
4. **logger/devTools는 dev only.** production에 logger가 들어가면 모든 액션마다 console.log가 호출돼 성능에 영향이 있다.

통합 후 typed hooks와 컴포넌트들의 import 경로를 `@store/RootReducer` → `@store/index`로 일괄 변경한다. tsconfig path alias가 잡혀 있으니 codemod 없이 grep + sed로 충분히 끝난다.

---

## 문제 2 — selector 위치가 일관되지 않음

selector가 두 가지 다른 위치에 있다.

```
app/store/
├─ modalSelectors.ts          ← 루트에, 파일명은 복수
└─ selector/
    └─ configSelector.ts      ← 서브폴더(단수)에, 파일명은 단수
```

같은 종류인데 폴더가 다르고, 파일명도 한쪽은 `Selectors`(복수), 한쪽은 `Selector`(단수)다. 사람이 늘면 다음 selector가 어디로 갈지 매번 의사결정이 필요해진다.

내부 코드는 둘 다 같은 패턴을 따른다 — selector를 객체로 묶고, `(state: RootState) => state.xxx.yyy` 형태로 정의한다. 구현이 같으니까 합치는 데 큰 작업은 없다.

### 정리 방향

폴더 하나로 통합한다. 이름은 `selectors/`(복수). 파일명도 `xxxSelectors.ts`(복수)로 통일.

```
app/store/selectors/
├─ modalSelectors.ts
└─ configSelectors.ts
```

`configSelector.ts` → `configSelectors.ts`로 파일명을 바꾸고, 내부 export 이름은 이미 `configSelectors`(복수)니까 그대로 두면 된다.

이 작업의 본질은 “하나의 컨벤션”을 정하는 것이다. 어디다 두든 같은 곳에 두면 된다. selector를 새로 추가할 때 사람마다 다른 위치에 놓는 게 가장 안 좋다.

---

## 문제 3 — 파일 확장자(.ts / .tsx) 혼재

```
modalSlice.tsx          ← JSX 없음
sidebarSlice.tsx        ← JSX 없음
configSlice.tsx         ← JSX 없음
clusterInfoSlice.tsx    ← JSX 없음
errorSlice.ts           ← OK
tableSlice.ts           ← OK
```

`.tsx` 4개, `.ts` 2개. slice 안에는 JSX가 없다. 그런데도 `.tsx`로 만들어졌다.

### 왜 문제인가

1. **빌드 영향은 거의 없다.** TypeScript 컴파일러나 SWC는 `.tsx` 안에 JSX가 없어도 잘 처리한다.
2. **하지만 컨벤션 시그널이 깨진다.** 누군가는 “이 폴더는 `.tsx`로 쓰는 거구나” 하고 새 파일도 `.tsx`로 만든다. 누군가는 `.ts`로 만든다. 결국 사람마다 다른 확장자를 쓰게 된다.
3. **IDE 자동 import가 헷갈린다.** 같은 이름의 `.ts`/`.tsx` 파일이 공존하면 어느 한쪽이 우선되어 import되는데, 그 우선순위가 도구마다 다르다.

### 정리

slice는 전부 `.ts`로. JSX를 쓸 일이 생기면 그건 slice가 아니라 컴포넌트로 분리되어야 한다.

```
modalSlice.tsx → modalSlice.ts
sidebarSlice.tsx → sidebarSlice.ts
configSlice.tsx → configSlice.ts
clusterInfoSlice.tsx → clusterInfoSlice.ts
```

`git mv`로 파일명을 바꾸고, import 구문은 확장자 없이 쓰고 있으니 컴포넌트 코드는 손댈 게 없다.

---

## 문제 4 — createStateHook 패턴 재평가

이건 “고쳐야 할 문제”라기보다 “쓰는 방식을 명확히 정해야 할 패턴”이다.

```typescript
// app/util/createStateHook.ts
export const createStateHook = <T extends Record<string, (state: RootState) => unknown>>(
  selectors: T,
) => {
  return (): { [K in keyof T]: ReturnType<T[K]> } => {
    const entries = Object.entries(selectors).map(
      ([key, selector]) => [key, useAppSelector(selector)],
    );
    return Object.fromEntries(entries) as { [K in keyof T]: ReturnType<T[K]> };
  };
};
```

selector 객체를 받아 “모든 selector를 동시에 구독하는 hook”을 반환한다. 사용처는 깔끔하다.

```tsx
const { isOpen, modalType, btnText } = useModalState();
```

### 좋은 점

- **selector 추가가 자동으로 hook에 반영된다.** selectors 객체에 필드 하나만 추가하면 끝.
- **destructuring 한 줄로 필요한 상태를 꺼낼 수 있다.**
- **타입 추론이 정확하다.** selector 함수의 return 타입이 그대로 hook의 return 타입으로 이어진다.

### 신경 써야 할 점

**1) 모든 selector를 구독하게 된다.**
`useModalState()`를 호출하면 modal 상태의 isOpen, btnText, modalType, modalKeyword, subModal, payload 등 selectors 객체에 정의된 모든 필드를 구독한다. 컴포넌트가 isOpen만 쓰더라도 modalType이 바뀔 때 함께 리렌더된다.

리렌더 비용이 큰 컴포넌트(테이블, 차트 등)는 `useModalState()` 대신 `useAppSelector(modalSelectors.isOpen)` 같이 selector를 직접 호출해야 한다.

**2) React Hooks 규칙 의존.**
`Object.entries(selectors).map(...)` 안에서 `useAppSelector`를 반복 호출한다. 매 렌더에서 같은 순서로 같은 개수의 hook이 호출되어야 한다. selectors 객체가 모듈 스코프에 선언된 정적 객체라면 안전하지만, 동적으로 selector를 추가/제거하면 hook 호출 순서가 깨진다.

**3) `Object.entries` 순서.**
객체 키 순서는 V8 기준 “정수 키 오름차순 → 문자열 키 삽입순”이다. 일반 객체 selector는 문자열 키만 쓰니까 삽입순이 보장된다. 그래도 키 순서에 의존하는 코드가 hook 안에 있다는 점은 인지하고 있어야 한다.

### 어떻게 쓰기로 정했나

`createStateHook`은 **편의 hook**으로 두고, 다음과 같이 사용 기준을 분리하기로 했다.

- **일반 사용**: `useModalState`, `useConfigState` 같은 편의 hook. selectors 전체를 구독해도 리렌더 비용이 크지 않은 컨테이너성 컴포넌트(모달 컨트롤러, 사이드바 등).
- **성능 민감 컴포넌트**: 테이블, 차트, 리스트 row 같은 곳은 `useAppSelector(xxxSelectors.특정필드)`를 직접 호출.

이 기준을 `standards/frontend/redux.md` 같은 문서에 명시하고, 코드 리뷰에서 점검 항목으로 둔다.

---

## 정리 — 리팩터링 순서

리팩터링 PR을 쪼개는 순서다. 한 번에 다 바꾸면 리뷰가 안 된다.

1. **확장자 통일** (`.tsx` → `.ts`)
   `git mv`만 하면 끝. import 경로에 확장자 없으니 코드 변경 없음. 가장 안전한 첫 PR.

2. **selector 폴더 통합**
   `modalSelectors.ts`를 `selectors/` 안으로 이동, `configSelector.ts`를 `configSelectors.ts`로 rename. import 경로 일괄 변경.

3. **store 설정 파일 통합 (가장 큰 변경)**
   `RootReducer.tsx`의 persistConfig·HYDRATE 처리를 `index.ts`에 병합. `@store/RootReducer` import 경로를 `@store/index`로 일괄 변경. PR 하나로 가되, 변경 직후 회귀 테스트 필수.
   - persist blacklist가 적용되는지: 새로고침 후 modal/error/table이 초기 상태인가
   - logger가 dev에서만 켜지는지
   - HYDRATE를 살리기로 했다면 SSR 페이지에서 store 초기화가 동작하는지

4. **createStateHook 사용 기준 문서화**
   `standards/frontend/redux.md`에 “편의 hook vs 단일 selector” 기준 명시. 코드 리뷰에서 사용.

---

## 메모

이 점검에서 가장 크게 느낀 건 두 가지다.

**첫 번째**, store 설정 파일이 두 개로 갈라진 상황은 “언젠가 한 명이 둘 중 하나를 정리하다가 그만둔” 흔적에 가깝다. 둘 다 동작하는 코드처럼 보이니까 누구도 위험을 못 느낀다. 하지만 실제로는 한쪽만 마운트되고 있고, 다른 쪽은 “문서처럼 읽히는 죽은 코드”다. 죽은 코드보다 더 나쁜 건, 그 코드를 읽고 어긋난 가정을 만드는 사람이 생긴다는 점이다.

**두 번째**, 컨벤션은 하나만 정해도 충분하다. selector 폴더가 두 군데로 갈린 건 “어디다 둘지” 합의가 없어서다. 어디든 좋다. 한 곳에만 두면 된다.

다음에 새 프로젝트를 시작할 때, 위 [표준 구조 글](/posts/react-nextjs/redux-toolkit-structure)의 체크리스트를 그대로 들고 가서 첫 PR에 적용할 생각이다.
