import { combineReducers, configureStore, PayloadAction, ThunkAction, Action } from '@reduxjs/toolkit';
import { createWrapper, HYDRATE } from 'next-redux-wrapper';
import logger from 'redux-logger';
import { sidebarSlice } from './sidebarSlice';

// const reducer = (state: any, action: PayloadAction<any>) => {
//   return combineReducers({
//     [authSlice.name]: authSlice.reducer,
//   })(state, action);
// };

// RootState 타입 정의
export type RootState = ReturnType<typeof combinedReducer>;

const combinedReducer = combineReducers({
  [sidebarSlice.name]: sidebarSlice.reducer,
});

// HYDRATE 액션 처리
const reducer = (state: RootState | undefined, action: PayloadAction<any>): RootState => {
  if (action.type === HYDRATE) {
    return {
      ...state, // 기존 상태를 유지
      ...action.payload, // 새로 받아온 상태로 업데이트
    };
  } else {
    return combinedReducer(state, action);
  }
};

const makeStore = () =>
  configureStore({
    reducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(logger),
  });

const store = makeStore();

export const wrapper = createWrapper<AppStore>(makeStore, {
  debug: process.env.NODE_ENV === 'development',
});

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = typeof store.dispatch;
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, Action>;
