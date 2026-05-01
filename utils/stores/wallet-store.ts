import { create } from "zustand";
import { Proof } from "@cashu/cashu-ts";

export interface WalletState {
  // CashuWallet (replaces CashuWalletContext)
  proofEvents: any[];
  cashuMints: string[];
  cashuProofs: Proof[];
  isWalletLoading: boolean;

  // Cart (replaces CartContext — currently unused but included per user request)
  cartAddresses: string[][];
  isCartLoading: boolean;
}

export interface WalletActions {
  // Wallet actions
  setWallet: (
    proofEvents: any[],
    cashuMints: string[],
    cashuProofs: Proof[],
    isLoading: boolean
  ) => void;

  // Cart actions
  setCart: (cartAddresses: string[][], isLoading: boolean) => void;
  addToCart: (productData: any) => void;
  removeFromCart: (productData: any) => void;
}

export const useWalletStore = create<WalletState & WalletActions>((set) => ({
  // Initial state
  proofEvents: [],
  cashuMints: [],
  cashuProofs: [],
  isWalletLoading: true,
  cartAddresses: [],
  isCartLoading: true,

  // Wallet actions
  setWallet: (proofEvents, cashuMints, cashuProofs, isLoading) =>
    set({ proofEvents, cashuMints, cashuProofs, isWalletLoading: isLoading }),

  // Cart actions
  setCart: (cartAddresses, isLoading) =>
    set({ cartAddresses, isCartLoading: isLoading }),
  addToCart: (_productData) => {
    // Currently unused — placeholder for future implementation
  },
  removeFromCart: (_productData) => {
    // Currently unused — placeholder for future implementation
  },
}));
