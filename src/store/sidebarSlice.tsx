import { createSlice } from '@reduxjs/toolkit';
import { PURGE } from 'redux-persist';

export interface SidebarState {
  isOpen: boolean;
  slideSecionIsOpen: boolean;
}

const initialState: SidebarState = {
  isOpen: true,
  slideSecionIsOpen: true,
};

export const sidebarSlice = createSlice({
  name: 'sidebar',
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.isOpen = !state.isOpen;
    },
    toggleSlideSection: (state) => {
      state.slideSecionIsOpen = !state.slideSecionIsOpen;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(PURGE, () => initialState); // 상태를 초기화할 때
  },
});

export const { toggleSidebar, toggleSlideSection } = sidebarSlice.actions;
export default sidebarSlice.reducer;
