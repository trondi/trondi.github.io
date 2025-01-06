import { createSlice } from '@reduxjs/toolkit';
import { HYDRATE } from 'next-redux-wrapper';
import { PURGE } from 'redux-persist';

export interface keywordState {
  docKeyword: [];
  libDocKeyword: [];
}

const initialState: keywordState = {
  docKeyword: [],
  libDocKeyword: [],
};

export const keywordSlice = createSlice({
  name: 'keyword',
  initialState,
  reducers: {
    setKeyword: (state, action) => {
      state.docKeyword = action.payload;
    },
    setLibKeyword: (state, action) => {
      state.libDocKeyword = action.payload;
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

export const { setKeyword, setLibKeyword } = keywordSlice.actions;
export default keywordSlice.reducer;
