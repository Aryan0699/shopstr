import { create } from "zustand";

export interface RelaysStoreState {
  relayList: string[];
  readRelayList: string[];
  writeRelayList: string[];
  isLoading: boolean;
  setRelays: (
    relayList: string[],
    readRelayList: string[],
    writeRelayList: string[],
    isLoading: boolean
  ) => void;
  reset: () => void;
}

const initialState = {
  relayList: [],
  readRelayList: [],
  writeRelayList: [],
  isLoading: true,
};

export const useRelaysStore = create<RelaysStoreState>((set) => ({
  ...initialState,
  setRelays: (relayList, readRelayList, writeRelayList, isLoading) =>
    set({ relayList, readRelayList, writeRelayList, isLoading }),
  reset: () => set(initialState, true),
}));
