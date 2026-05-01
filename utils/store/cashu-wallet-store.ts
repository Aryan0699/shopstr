import { create } from "zustand";
import { Proof } from "@cashu/cashu-ts";

export interface CashuWalletStoreState {
  proofEvents: any[];
  cashuMints: string[];
  cashuProofs: Proof[];
  isLoading: boolean;
  setCashuWallet: (
    proofEvents: any[],
    cashuMints: string[],
    cashuProofs: Proof[],
    isLoading: boolean
  ) => void;
  reset: () => void;
}

const initialState = {
  proofEvents: [],
  cashuMints: [],
  cashuProofs: [],
  isLoading: true,
};

export const useCashuWalletStore = create<CashuWalletStoreState>((set) => ({
  ...initialState,
  setCashuWallet: (proofEvents, cashuMints, cashuProofs, isLoading) =>
    set({ proofEvents, cashuMints, cashuProofs, isLoading }),
  reset: () => set(initialState, true),
}));
