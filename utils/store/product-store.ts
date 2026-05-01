import { create } from "zustand";
import { NostrEvent } from "@/utils/types/types";

export interface ProductStoreState {
  productEvents: NostrEvent[];
  isLoading: boolean;
  addNewlyCreatedProductEvent: (productEvent: NostrEvent) => void;
  removeDeletedProductEvent: (productId: string) => void;
  setProductEvents: (
    productEvents: NostrEvent[] | null,
    isLoading: boolean
  ) => void;
  reset: () => void;
}

const initialState = {
  productEvents: [],
  isLoading: true,
};

export const useProductStore = create<ProductStoreState>((set) => ({
  ...initialState,
  addNewlyCreatedProductEvent: (productEvent) =>
    set((state) => ({
      productEvents: [...state.productEvents, productEvent],
      isLoading: false,
    })),
  removeDeletedProductEvent: (productId) =>
    set((state) => ({
      productEvents: state.productEvents.filter(
        (event) => event.id !== productId
      ),
      isLoading: false,
    })),
  setProductEvents: (productEvents, isLoading) =>
    set((state) => ({
      productEvents: productEvents ?? state.productEvents,
      isLoading,
    })),
  reset: () => set(initialState, true),
}));
