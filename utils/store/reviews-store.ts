import { create } from "zustand";

export interface ReviewsStoreState {
  merchantReviewsData: Map<string, number[]>;
  productReviewsData: Map<string, Map<string, Map<string, string[][]>>>;
  isLoading: boolean;
  updateMerchantReviewsData: (
    merchantPubkey: string,
    merchantReviewsData: number[]
  ) => void;
  updateProductReviewsData: (
    merchantPubkey: string,
    productDTag: string,
    productReviewsData: Map<string, string[][]>
  ) => void;
  setReviewsData: (
    merchantReviewsData: Map<string, number[]>,
    productReviewsData: Map<string, Map<string, Map<string, string[][]>>>,
    isLoading: boolean
  ) => void;
  reset: () => void;
}

const initialState = {
  merchantReviewsData: new Map(),
  productReviewsData: new Map(),
  isLoading: true,
};

export const useReviewsStore = create<ReviewsStoreState>((set) => ({
  ...initialState,
  updateMerchantReviewsData: (merchantPubkey, merchantReviewsData) =>
    set((state) => {
      const merchantReviewsDataMap = new Map(state.merchantReviewsData);
      merchantReviewsDataMap.set(merchantPubkey, merchantReviewsData);
      return {
        merchantReviewsData: merchantReviewsDataMap,
        isLoading: false,
      };
    }),
  updateProductReviewsData: (merchantPubkey, productDTag, productReviewsData) =>
    set((state) => {
      const productReviewsDataMap = new Map(state.productReviewsData);
      const existingScoreMap =
        productReviewsDataMap.get(merchantPubkey) ?? new Map();
      const productScoreMap = new Map(existingScoreMap);
      productReviewsDataMap.set(
        merchantPubkey,
        productScoreMap.set(productDTag, productReviewsData)
      );
      return {
        productReviewsData: productReviewsDataMap,
        isLoading: false,
      };
    }),
  setReviewsData: (merchantReviewsData, productReviewsData, isLoading) =>
    set({ merchantReviewsData, productReviewsData, isLoading }),
  reset: () => set(initialState, true),
}));
