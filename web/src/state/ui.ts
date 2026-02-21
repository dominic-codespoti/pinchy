import { create } from "zustand";

type UiState = {
  wsConnected: boolean;
  setWsConnected: (value: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  wsConnected: false,
  setWsConnected: (value) => set({ wsConnected: value }),
}));
