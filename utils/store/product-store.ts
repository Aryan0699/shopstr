import { create } from "zustand";
import { NostrEvent } from "@/utils/types/types";

interface ProductStoreState {
  productEvents: NostrEvent[];
  isLoading: boolean;
  addNewlyCreatedProductEvent: (productEvent: NostrEvent) => void;
  removeDeletedProductEvent: (productId: string) => void;
  setProductState: (productEvents: NostrEvent[], isLoading: boolean) => void;
}

export const useProductStore = create<ProductStoreState>((set) => ({
  productEvents: [],
  isLoading: true,
  addNewlyCreatedProductEvent: (productEvent: NostrEvent) =>
    set((state) => ({
      productEvents: [...state.productEvents, productEvent],
      isLoading: false,
    })),
  removeDeletedProductEvent: (productId: string) =>
    set((state) => ({
      productEvents: state.productEvents.filter((event) => event.id !== productId),
      isLoading: false,
    })),
  setProductState: (productEvents: NostrEvent[], isLoading: boolean) =>
    set({
      productEvents,
      isLoading,
    }),
}));