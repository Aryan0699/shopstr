import { create } from "zustand";
import { NostrManager } from "@/utils/nostr/nostr-manager";

export interface NostrStoreState {
  nostr: NostrManager;
  setNostr: (nostr: NostrManager) => void;
  reset: () => void;
}

const createNostrManager = () => new NostrManager();

export const useNostrStore = create<NostrStoreState>((set) => ({
  nostr: createNostrManager(),
  setNostr: (nostr) => set({ nostr }),
  reset: () => set({ nostr: createNostrManager() }, true),
}));
