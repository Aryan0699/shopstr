import { create } from "zustand";
import { NostrEvent, ProfileData, ShopProfile } from "../types/types";

export interface MarketState {
  // Products (replaces ProductContext)
  productEvents: NostrEvent[];
  isProductsLoading: boolean;

  // Profiles (replaces ProfileMapContext)
  profileData: Map<string, any>;
  isProfilesLoading: boolean;

  // Shops (replaces ShopMapContext)
  shopData: Map<string, ShopProfile>;
  isShopsLoading: boolean;

  // Reviews (replaces ReviewsContext)
  merchantReviewsData: Map<string, number[]>;
  productReviewsData: Map<string, Map<string, Map<string, string[][]>>>;
  isReviewsLoading: boolean;
}

export interface MarketActions {
  // Product actions
  setProducts: (events: NostrEvent[], isLoading: boolean) => void;
  addProduct: (event: NostrEvent) => void;
  removeProduct: (productId: string) => void;

  // Profile actions
  setProfiles: (data: Map<string, any>, isLoading: boolean) => void;
  mergeProfiles: (data: Map<string, any>, isLoading: boolean) => void;
  updateProfile: (profile: ProfileData) => void;

  // Shop actions
  setShops: (data: Map<string, ShopProfile>, isLoading: boolean) => void;
  updateShop: (shop: ShopProfile) => void;

  // Review actions
  setReviews: (
    merchantReviews: Map<string, number[]>,
    productReviews: Map<string, Map<string, Map<string, string[][]>>>,
    isLoading: boolean
  ) => void;
  updateMerchantReview: (pubkey: string, scores: number[]) => void;
  updateProductReview: (
    merchantPubkey: string,
    productDTag: string,
    reviewData: Map<string, string[][]>
  ) => void;
}

export const useMarketStore = create<MarketState & MarketActions>((set) => ({
  // Initial state
  productEvents: [],
  isProductsLoading: true,
  profileData: new Map(),
  isProfilesLoading: true,
  shopData: new Map(),
  isShopsLoading: true,
  merchantReviewsData: new Map(),
  productReviewsData: new Map(),
  isReviewsLoading: true,

  // Product actions
  setProducts: (productEvents, isLoading) =>
    set({
      productEvents: productEvents ?? [],
      isProductsLoading: isLoading,
    }),
  addProduct: (event) =>
    set((state) => ({
      productEvents: [...state.productEvents, event],
      isProductsLoading: false,
    })),
  removeProduct: (productId) =>
    set((state) => ({
      productEvents: state.productEvents.filter((e) => e.id !== productId),
      isProductsLoading: false,
    })),

  // Profile actions
  setProfiles: (profileData, isLoading) =>
    set({ profileData, isProfilesLoading: isLoading }),
  mergeProfiles: (incoming, isLoading) =>
    set((state) => {
      const merged = new Map(state.profileData);
      incoming.forEach((incomingProfile, pubkey) => {
        const existing = merged.get(pubkey);
        if (
          !existing ||
          (incomingProfile?.created_at ?? 0) > (existing?.created_at ?? 0)
        ) {
          merged.set(pubkey, incomingProfile);
          return;
        }
        if (
          (incomingProfile?.created_at ?? 0) === (existing?.created_at ?? 0)
        ) {
          merged.set(pubkey, { ...existing, ...incomingProfile });
        }
      });
      return { profileData: merged, isProfilesLoading: isLoading };
    }),
  updateProfile: (profile) =>
    set((state) => {
      const newData = new Map(state.profileData);
      newData.set(profile.pubkey, profile);
      return { profileData: newData, isProfilesLoading: false };
    }),

  // Shop actions
  setShops: (shopData, isLoading) =>
    set({ shopData, isShopsLoading: isLoading }),
  updateShop: (shop) =>
    set((state) => {
      const newData = new Map(state.shopData);
      newData.set(shop.pubkey, shop);
      return { shopData: newData, isShopsLoading: false };
    }),

  // Review actions
  setReviews: (merchantReviewsData, productReviewsData, isLoading) =>
    set({
      merchantReviewsData,
      productReviewsData,
      isReviewsLoading: isLoading,
    }),
  updateMerchantReview: (pubkey, scores) =>
    set((state) => {
      const newData = new Map(state.merchantReviewsData);
      newData.set(pubkey, scores);
      return { merchantReviewsData: newData, isReviewsLoading: false };
    }),
  updateProductReview: (merchantPubkey, productDTag, reviewData) =>
    set((state) => {
      const newData = new Map(state.productReviewsData);
      const productScoreMap = new Map(newData.get(merchantPubkey));
      newData.set(
        merchantPubkey,
        productScoreMap.set(productDTag, reviewData)
      );
      return { productReviewsData: newData, isReviewsLoading: false };
    }),
}));
