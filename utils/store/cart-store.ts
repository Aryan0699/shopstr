import { create } from "zustand";

export interface CartStoreState {
  cartAddresses: string[][];
  isLoading: boolean;
  addProductToCart: (productData: any) => void;
  removeProductFromCart: (productData: any) => void;
  setCartAddresses: (cartAddresses: string[][], isLoading: boolean) => void;
  reset: () => void;
}

const initialState = {
  cartAddresses: [],
  isLoading: true,
};

export const useCartStore = create<CartStoreState>((set) => ({
  ...initialState,
  addProductToCart: (productData) =>
    set((state) => ({
      cartAddresses: [...state.cartAddresses, productData],
      isLoading: false,
    })),
  removeProductFromCart: (productData) =>
    set((state) => ({
      cartAddresses: state.cartAddresses.filter((item) => item !== productData),
      isLoading: false,
    })),
  setCartAddresses: (cartAddresses, isLoading) =>
    set({ cartAddresses, isLoading }),
  reset: () => set(initialState, true),
}));
