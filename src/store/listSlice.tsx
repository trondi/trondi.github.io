import { createSlice } from '@reduxjs/toolkit';
import { HYDRATE } from 'next-redux-wrapper';
import { PURGE } from 'redux-persist';

export interface listState {
  tab: [];
}

const initialState: listState = {
  tab: [],
};

export const listSlice = createSlice({
  name: 'list',
  initialState,
  reducers: {
    setTab: (state, action) => {
      state.tab = action.payload;
    },
    REORDER_TABS: (state, action) => {
      const { startIndex, endIndex } = action.payload;
      const tabs = [...state.tab];
      const [movedTab] = tabs.splice(startIndex, 1);
      tabs.splice(endIndex, 0, movedTab);
      return { ...state, tabs };
    },
  },

  /** 페이지 이동 시 상태 초기화가 필요한 경우 추가해야 함 */
  // extraReducers: {
  //   [HYDRATE]: (state, action) => {
  //     return {
  //       ...state,
  //       // ...action.payload.auth
  //     };
  //   },
  // },
  extraReducers: (builder) => {
    builder.addCase(PURGE, (state) => {
      return initialState;
    });
  },
});

export const { setTab, REORDER_TABS } = listSlice.actions;
export default listSlice.reducer;
