import { create } from "zustand";

export interface BlossomStoreState {
  blossomServers: string[];
  isLoading: boolean;
  setBlossomServers: (blossomServers: string[], isLoading: boolean) => void;
  reset: () => void;
}

const initialState = {
  blossomServers: [],
  isLoading: true,
};

export const useBlossomStore = create<BlossomStoreState>((set) => ({
  ...initialState,
  setBlossomServers: (blossomServers, isLoading) =>
    set({ blossomServers, isLoading }),
  reset: () => set(initialState, true),
}));
