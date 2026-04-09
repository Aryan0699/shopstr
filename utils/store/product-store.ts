import { create } from "zustand";
import { NostrEvent } from "../types/types";

interface ProductState {
  productEvents: NostrEvent[];
  isLoading: boolean;
  setProducts: (events: NostrEvent[], isLoading: boolean) => void;
  addNewlyCreatedProductEvent: (event: NostrEvent) => void;
  removeDeletedProductEvent: (productId: string) => void;
}

export const useProductStore = create<ProductState>((set) => ({
  productEvents: [],
  isLoading: true,
  setProducts: (events, isLoading) =>
    set({ productEvents: events, isLoading }),
  addNewlyCreatedProductEvent: (event) =>
    set((state) => ({
      productEvents: [...state.productEvents, event],
      isLoading: false,
    })),
  removeDeletedProductEvent: (productId) =>
    set((state) => ({
      productEvents: state.productEvents.filter((e) => e.id !== productId),
      isLoading: false,
    })),
}));