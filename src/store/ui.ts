import { create } from "zustand";

interface UiState {
  isLoading: boolean;
  setLoading: (v: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  isLoading: false,
  setLoading: (v) => set({ isLoading: v }),
}));
