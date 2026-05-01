import { create } from "zustand";
import { ShopProfile } from "@/utils/types/types";

export interface ShopStoreState {
  shopData: Map<string, ShopProfile>;
  isLoading: boolean;
  updateShopData: (shopData: ShopProfile) => void;
  setShopData: (shopData: Map<string, ShopProfile>, isLoading: boolean) => void;
  reset: () => void;
}

const initialState = {
  shopData: new Map(),
  isLoading: true,
};

export const useShopStore = create<ShopStoreState>((set) => ({
  ...initialState,
  updateShopData: (shopData) =>
    set((state) => {
      const shopDataMap = new Map(state.shopData);
      shopDataMap.set(shopData.pubkey, shopData);
      return {
        shopData: shopDataMap,
        isLoading: false,
      };
    }),
  setShopData: (shopData, isLoading) => set({ shopData, isLoading }),
  reset: () => set(initialState, true),
}));
