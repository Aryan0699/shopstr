import { create } from "zustand";
import { ProfileData } from "@/utils/types/types";

export interface ProfileStoreState {
  profileData: Map<string, ProfileData>;
  isLoading: boolean;
  updateProfileData: (profileData: ProfileData) => void;
  setProfileData: (
    profileData: Map<string, ProfileData>,
    isLoading: boolean
  ) => void;
  mergeProfileData: (
    profileData: Map<string, ProfileData>,
    isLoading: boolean
  ) => void;
  reset: () => void;
}

const initialState = {
  profileData: new Map(),
  isLoading: true,
};

export const useProfileStore = create<ProfileStoreState>((set) => ({
  ...initialState,
  updateProfileData: (profileData) =>
    set((state) => {
      const newProfileData = new Map(state.profileData);
      newProfileData.set(profileData.pubkey, profileData);
      return {
        profileData: newProfileData,
        isLoading: false,
      };
    }),
  setProfileData: (profileData, isLoading) =>
    set({ profileData, isLoading }),
  mergeProfileData: (profileData, isLoading) =>
    set((state) => {
      const mergedProfileData = new Map(state.profileData);

      profileData.forEach((incomingProfile, pubkey) => {
        const existingProfile = mergedProfileData.get(pubkey);
        if (
          !existingProfile ||
          (incomingProfile?.created_at ?? 0) >
            (existingProfile?.created_at ?? 0)
        ) {
          mergedProfileData.set(pubkey, incomingProfile);
          return;
        }

        if (
          (incomingProfile?.created_at ?? 0) ===
          (existingProfile?.created_at ?? 0)
        ) {
          mergedProfileData.set(pubkey, {
            ...existingProfile,
            ...incomingProfile,
          });
        }
      });

      return {
        profileData: mergedProfileData,
        isLoading,
      };
    }),
  reset: () => set(initialState, true),
}));
