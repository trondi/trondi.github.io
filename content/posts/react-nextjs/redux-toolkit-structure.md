---
title: "Redux Toolkit — 내가 정리한 표준 폴더 구조"
date: "2026-05-16"
summary: "Redux Toolkit + Next.js + redux-persist 환경에서 store/slice/selector/hook을 어떻게 나눠야 안전한지, 실제 프로젝트를 운영하며 정리한 표준 구조."
category: "React / Next.js"
tags:
  - Redux
  - Redux Toolkit
  - Next.js
  - redux-persist
  - State Management
featured: false
---

# Redux Toolkit — 내가 정리한 표준 폴더 구조

Redux는 한 번 잘못 깔면 나중에 손대기 무서워진다. 슬라이스가 늘어나기 시작하면 store 설정, selector 위치, hook 패턴, persist 정책 같은 것들이 전부 흩어지기 시작한다.

이 글은 내가 Next.js + Redux Toolkit + redux-persist 환경에서 운영하며 정리한 표준 폴더 구조를 1인칭으로 정리한 것이다. 다음 글에서 다룰 실제 프로젝트 리팩터링 사례의 **베이스라인**이기도 하다.

참고: [Redux Toolkit docs](https://redux-toolkit.js.org/), [redux-persist](https://github.com/rt2zz/redux-persist), [Next.js Redux setup](https://redux-toolkit.js.org/usage/nextjs)

---

## 먼저 결론

폴더는 이렇게 정리한다.

```
app/store/
├─ index.ts                ← configureStore 하나만. RootState/AppDispatch도 여기서 export
├─ slices/
│   ├─ modalSlice.ts
│   ├─ sidebarSlice.ts
│   ├─ errorSlice.ts
│   ├─ tableSlice.ts
│   ├─ configSlice.ts
│   └─ clusterInfoSlice.ts
└─ selectors/
    ├─ modalSelectors.ts
    └─ configSelectors.ts

app/hooks/
├─ reduxHooks.ts           ← useAppDispatch / useAppSelector
├─ useModalState.ts        ← createStateHook(modalSelectors)
└─ useConfigState.ts
```

원칙은 간단하다.

- **store 설정 파일은 하나만 둔다.** `RootState`와 `AppDispatch`도 그 파일에서 export.
- **slice는 한 폴더에 모은다.** 파일명은 `xxxSlice.ts`. JSX가 없으니 `.tsx`가 아니다.
- **selector도 한 폴더에 모은다.** 폴더명은 `selectors/`(복수), 파일명도 `xxxSelectors.ts`(복수).
- **typed hooks는 `app/hooks/reduxHooks.ts` 한 곳에서만 정의한다.**
- **selector → hook 변환은 `createStateHook` 같은 헬퍼로 자동화한다.**

이 다섯 가지가 흔들리기 시작하면 store가 두 개 만들어진다거나, selector 위치가 사람마다 달라진다거나, persist에서 무엇이 저장되는지 아무도 모르는 상태가 된다. 다음 글에서 실제로 본다.

---

## store 설정 — `index.ts`

내가 정착한 형태는 이렇다.

```typescript
// app/store/index.ts
import { Action, configureStore, Middleware, ThunkAction } from '@reduxjs/toolkit';
import { combineReducers } from 'redux';
import logger from 'redux-logger';
import {
  FLUSH, PAUSE, PERSIST, persistReducer, persistStore, PURGE, REGISTER, REHYDRATE,
} from 'redux-persist';
import storage from 'redux-persist/lib/storage';

import modal from './slices/modalSlice';
import sidebar from './slices/sidebarSlice';
import error from './slices/errorSlice';
import config from './slices/configSlice';
import table from './slices/tableSlice';
import clusterInfo from './slices/clusterInfoSlice';

const rootReducer = combineReducers({
  modal, sidebar, error, config, table, clusterInfo,
});

const persistConfig = {
  key: 'root',
  version: 1,
  storage,
  blacklist: ['modal', 'error', 'table'], // UI 일시상태는 persist 제외
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const middlewares: Middleware[] = [];
if (process.env.NEXT_PUBLIC_NODE_ENV === 'development') {
  middlewares.push(logger as Middleware);
}

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).concat(middlewares),
  devTools: process.env.NEXT_PUBLIC_NODE_ENV !== 'production',
});

export const persistor = persistStore(store);

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<R = void> = ThunkAction<R, RootState, unknown, Action<string>>;
```

여기서 신경 쓴 포인트가 몇 가지 있다.

**blacklist를 명시한다.** modal/error/table은 모두 일시적 UI 상태다. 새로고침 후에 모달이 떠 있거나 에러가 남아 있으면 안 된다. 반대로 sidebar(열림/닫힘), config(서버에서 받은 값), clusterInfo는 persist하는 편이 UX에 좋다.

**`serializableCheck.ignoredActions`로 redux-persist 액션을 제외한다.** `serializableCheck: false`로 전체를 꺼버리면 진짜로 직렬화 못 하는 값(함수, ReactNode 등)이 store에 들어가도 못 잡는다. redux-persist 액션만 골라서 제외하는 게 안전하다.

**logger는 개발 환경에서만 켠다.** production에서 매 액션마다 console.log를 호출하면 성능에 영향이 있다. 같은 이유로 `devTools`도 production에서 끈다.

**`RootState`/`AppDispatch`도 같은 파일에서 export한다.** 이 타입을 다른 파일(예: `RootReducer.ts`)에서 export하면 컴포넌트가 store 인스턴스는 A에서, 타입은 B에서 가져오는 분리 상태가 만들어진다. 다음 글에서 이게 어떻게 무너지는지 보겠다.

---

## slice — `slices/`

slice 파일은 전부 `slices/` 폴더에 모은다. 파일명은 `xxxSlice.ts`. 확장자는 **무조건 `.ts`** 다. slice 안에서 JSX를 쓸 일이 없기 때문이다.

```typescript
// app/store/slices/modalSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PURGE } from 'redux-persist';
import { ModalState, SubModalInfo } from '@ctypes/modal';

const initialState: ModalState = {
  isOpen: false,
  btnText: '',
  modalType: '',
  modalKeyword: '',
  payload: undefined,
  subModal: { isOpen: false },
};

export const modalSlice = createSlice({
  name: 'modal',
  initialState,
  reducers: {
    setModalInfo: (state, { payload }: PayloadAction<Partial<ModalState>>) => ({
      ...state,
      ...payload,
    }),
    setSubModal: (state, { payload }: PayloadAction<Partial<SubModalInfo>>) => {
      state.subModal = { ...state.subModal, ...payload };
    },
    toggleSubModal: (state) => {
      state.subModal.isOpen = !state.subModal.isOpen;
    },
    resetModal: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(PURGE, () => initialState);
  },
});

export const { setModalInfo, setSubModal, toggleSubModal, resetModal } = modalSlice.actions;
export default modalSlice.reducer;
```

내가 slice를 쓸 때 지키는 규칙은 세 가지다.

**1. PURGE를 `extraReducers`로 잡는다.** 로그아웃이나 강제 초기화 시 `persistor.purge()`를 호출하는데, 이때 PURGE 액션이 모든 slice에 전달된다. 일시적 UI 상태를 가진 slice는 PURGE를 받아 initialState로 되돌려놔야 한다. 안 그러면 다음 사용자가 로그인했을 때 이전 사용자의 modal 상태가 남아 있을 수 있다.

**2. `setXxx`는 `Partial<State>`를 받는다.** modal처럼 한 액션으로 여러 필드를 같이 갱신하는 경우, `Partial`로 받으면 호출부에서 필요한 필드만 넘기면 된다. 매번 setIsOpen, setBtnText, setModalType 같은 액션을 따로 만들지 않는다.

**3. immer를 활용하되, return으로 새 객체를 반환할 때는 spread를 명시한다.** RTK는 내부적으로 immer를 쓰기 때문에 `state.foo = bar` 같은 직접 변경이 안전하다. 하지만 객체 전체를 갈아끼울 때(`setModalInfo`)는 `return { ...state, ...payload }`로 새 객체를 반환하는 게 의도가 더 명확하다.

---

## selector — `selectors/`

selector도 한 폴더에 모은다. 파일명은 `xxxSelectors.ts`(복수). slice 하나에 selector 파일 하나가 짝을 이룬다.

```typescript
// app/store/selectors/modalSelectors.ts
import { RootState } from '@store/index';

export const modalSelectors = {
  isOpen: (state: RootState) => state.modal.isOpen,
  btnText: (state: RootState) => state.modal.btnText,
  modalType: (state: RootState) => state.modal.modalType,
  modalKeyword: (state: RootState) => state.modal.modalKeyword,
  subModal: (state: RootState) => state.modal.subModal,
  payload: (state: RootState) => state.modal.payload,
};
```

selector를 객체로 묶는 이유는 다음 절의 `createStateHook` 때문이다. 객체 단위로 selector들을 묶어두면 hook 변환이 한 줄로 끝난다.

selector에 파라미터가 필요한 경우는 **selector factory** 형태로 쓴다.

```typescript
// app/store/selectors/configSelectors.ts
import { RootState } from '@store/index';
import { CONFIG_KEY } from '@constants/common';

export const configSelectors = {
  configs: (state: RootState) => state.config?.configs,
  isLoading: (state: RootState) => state.config?.isLoading,

  // selector factory — key별로 다른 selector를 만든다
  getConfigValue: (key: string) => (state: RootState) => {
    return state.config.configs?.find((c) => c.key === key)?.value;
  },

  getConfig: (key: keyof typeof CONFIG_KEY) => (state: RootState) => {
    return state.config.configs?.find((c) => c.key === key)?.value;
  },
};
```

`useSelector(configSelectors.getConfigValue(CONFIG_KEY.IMG_LOAD_PATH))` 형태로 호출한다. 파라미터가 바뀌어도 selector 자체는 재사용된다.

selector를 selectors 폴더가 아니라 store 루트에 두거나, 어떤 건 `selector/` (단수) 어떤 건 `selectors/` (복수) 식으로 폴더명이 섞이면 import 경로가 사람마다 달라진다. **한 곳에, 같은 네이밍으로 모은다.**

---

## typed hooks — `reduxHooks.ts`

`useDispatch`/`useSelector`는 호출할 때마다 타입을 지정해야 한다. 한 파일에서 typed 버전을 만들어두고 그것만 쓴다.

```typescript
// app/hooks/reduxHooks.ts
import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from '@store/index';

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

여기서 두 가지 차이가 있다.

- `useAppDispatch`는 ThunkAction을 dispatch할 수 있다. 기본 `useDispatch`는 thunk를 받았을 때 타입 에러가 난다.
- `useAppSelector`는 selector 함수의 인자가 자동으로 `RootState`로 추론된다. 매번 `(state: RootState) => ...`를 쓰지 않아도 된다.

컴포넌트는 react-redux의 `useDispatch`/`useSelector`를 직접 import하지 않고 항상 이 두 개를 쓴다.

---

## createStateHook — selectors 객체를 hook으로

selector 객체를 한 번에 hook으로 변환하는 유틸을 둔다.

```typescript
// app/utils/createStateHook.ts
import { useAppSelector } from '@hooks/reduxHooks';
import { RootState } from '@store/index';

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

이걸로 selector 객체 하나를 hook 하나로 변환한다.

```typescript
// app/hooks/useModalState.ts
import { modalSelectors } from '@store/selectors/modalSelectors';
import { createStateHook } from '@utils/createStateHook';

export const useModalState = createStateHook(modalSelectors);
```

컴포넌트에서는 이렇게 쓴다.

```tsx
const { isOpen, modalType, btnText } = useModalState();
```

**장점:**

- selector 추가 시 selectors 객체에만 추가하면 hook이 자동으로 따라온다.
- 컴포넌트는 destructuring 한 줄로 필요한 상태를 다 꺼낼 수 있다.
- 타입은 selector의 return 타입에서 자동 추론된다.

**주의해야 할 점도 있다.**

1. `Object.entries` 순서는 객체 키 순서를 따른다. selector 객체가 매 렌더링마다 같은 키 순서를 유지해야 한다(보통은 모듈 스코프에 선언하므로 안전).
2. selectors 객체에 selector를 동적으로 추가/제거하면 안 된다. **React Hooks 규칙**에 어긋난다 — 매 렌더에서 같은 순서로 같은 개수의 hook이 호출되어야 한다.
3. **사용하지 않는 selector까지 구독하게 된다.** `useModalState`를 호출하면 modal 상태의 모든 필드가 구독된다. 한 필드만 필요한 경우엔 `useAppSelector(modalSelectors.isOpen)` 같이 직접 selector를 쓰는 게 리렌더 측면에서 더 낫다.

3번이 실무에서 가장 신경 쓰이는 부분이다. 다음 글에서 이 패턴을 어떻게 평가했는지 다시 본다.

---

## Provider — `ReduxProvider.tsx`

App Router 환경에서는 Provider를 클라이언트 컴포넌트로 분리한다.

```tsx
// app/providers/ReduxProvider.tsx
'use client';

import { persistor, store } from '@store/index';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';

export default function ReduxProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <PersistGate persistor={persistor} loading={null}>
        {children}
      </PersistGate>
    </Provider>
  );
}
```

`PersistGate`는 redux-persist가 localStorage에서 상태를 복원하는 동안 children 렌더링을 막는다. `loading={null}`로 두면 빈 화면을 보여주고, 스피너 등을 넣고 싶으면 여기에 컴포넌트를 둔다.

루트 `layout.tsx`에서는 이렇게 감싼다.

```tsx
// app/layout.tsx
import ReduxProvider from '@providers/ReduxProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <ReduxProvider>{children}</ReduxProvider>
      </body>
    </html>
  );
}
```

---

## 체크리스트

이 구조가 안정적으로 굴러가는지 점검할 때 보는 항목들이다.

- [ ] `configureStore`를 호출하는 파일이 프로젝트 전체에 **하나뿐**인가
- [ ] `RootState`, `AppDispatch`가 store 설정과 **같은 파일**에서 export되는가
- [ ] persistConfig의 `blacklist`가 명시되어 있고, UI 일시상태(modal/error/table)가 포함되는가
- [ ] slice 파일이 모두 `.ts`인가 (JSX 없는데 `.tsx`인 파일은 정리 대상)
- [ ] selector 파일이 모두 같은 폴더에, 같은 네이밍 규칙(`xxxSelectors.ts`)으로 존재하는가
- [ ] typed hooks(`useAppDispatch`, `useAppSelector`)가 한 파일에서만 정의되는가
- [ ] PURGE를 받아야 하는 slice(모든 일시상태 slice)가 `extraReducers`에 PURGE 핸들러를 가지는가
- [ ] `serializableCheck`가 전부 `false`가 아니라, redux-persist 액션만 제외하는가
- [ ] logger와 devTools가 production에서 꺼져 있는가

---

## 다음 글

이 표준을 기준으로 실제 운영 중인 프로젝트의 Redux 구조를 점검해봤다. 결론부터 말하면, 위 체크리스트 중 절반 가까이가 어긋나 있었다. 가장 큰 문제는 **store 설정 파일이 두 개로 분리되어 있어서 store 인스턴스와 타입이 서로 다른 파일에서 만들어지고 있었다**는 점이다.

다음 글에서 그 구조를 진단하고 리팩터링 방향을 정리한다.
