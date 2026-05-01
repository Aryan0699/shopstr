import { create } from "zustand";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";

export interface SignerStoreState {
  signer?: NostrSigner;
  isLoggedIn: boolean;
  isAuthStateResolved: boolean;
  pubkey?: string;
  npub?: string;
  newSigner?: (type: string, args: any) => NostrSigner;
  setSigner: (signer?: NostrSigner) => void;
  setKeys: (pubkey?: string, npub?: string) => void;
  setAuthStateResolved: (isAuthStateResolved: boolean) => void;
  setNewSigner: (newSigner?: (type: string, args: any) => NostrSigner) => void;
  reset: () => void;
}

const buildIsLoggedIn = (signer?: NostrSigner, pubkey?: string) =>
  Boolean(signer && pubkey);

const initialState = {
  signer: undefined,
  isLoggedIn: false,
  isAuthStateResolved: false,
  pubkey: "",
  npub: "",
  newSigner: undefined,
};

export const useSignerStore = create<SignerStoreState>((set) => ({
  ...initialState,
  setSigner: (signer) =>
    set((state) => ({
      signer,
      isLoggedIn: buildIsLoggedIn(signer, state.pubkey),
    })),
  setKeys: (pubkey, npub) =>
    set((state) => ({
      pubkey,
      npub,
      isLoggedIn: buildIsLoggedIn(state.signer, pubkey),
    })),
  setAuthStateResolved: (isAuthStateResolved) => set({ isAuthStateResolved }),
  setNewSigner: (newSigner) => set({ newSigner }),
  reset: () => set(initialState, true),
}));
