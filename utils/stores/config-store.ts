import { create } from "zustand";

export interface ConfigState {
  // Relays (replaces RelaysContext)
  relayList: string[];
  readRelayList: string[];
  writeRelayList: string[];
  isRelaysLoading: boolean;

  // Blossom (replaces BlossomContext)
  blossomServers: string[];
  isBlossomLoading: boolean;
}

export interface ConfigActions {
  setRelays: (
    relayList: string[],
    readRelayList: string[],
    writeRelayList: string[],
    isLoading: boolean
  ) => void;

  setBlossom: (blossomServers: string[], isLoading: boolean) => void;
}

export const useConfigStore = create<ConfigState & ConfigActions>((set) => ({
  // Initial state
  relayList: [],
  readRelayList: [],
  writeRelayList: [],
  isRelaysLoading: true,
  blossomServers: [],
  isBlossomLoading: true,

  // Actions
  setRelays: (relayList, readRelayList, writeRelayList, isLoading) =>
    set({
      relayList,
      readRelayList,
      writeRelayList,
      isRelaysLoading: isLoading,
    }),

  setBlossom: (blossomServers, isLoading) =>
    set({ blossomServers, isBlossomLoading: isLoading }),
}));
