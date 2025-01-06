import { Action, configureStore, EnhancedStore, ThunkAction } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { combineReducers, Store } from 'redux';
// @ts-ignore
import logger from 'redux-logger';
import list from './listSlice';
import sidebar from './sidebarSlice';

import { createWrapper, MakeStore } from 'next-redux-wrapper';

const persistConfig = {
  key: 'root',
  version: 1,
  storage,
};

const rootReducer = combineReducers({
  list,
  sidebar,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

let middlewares: any = [];

// redux logger on/off
if (process.env.NEXT_PUBLIC_NODE_ENV === 'development') {
  middlewares.push(logger);
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

const setupStore = (context: any): EnhancedStore => store;

const makeStore: MakeStore<any> = (context: any) => setupStore(context);

export const persistor = persistStore(store);

export const wrapper = createWrapper<Store>(makeStore);
export const getDispatch = () => store.dispatch;

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown, // 여기가 ExtraThunkArg, 사용하지 않으므로 unknown으로 설정
  Action<string>
>;
