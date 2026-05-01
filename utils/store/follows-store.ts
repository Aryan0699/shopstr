import { create } from "zustand";

export interface FollowsStoreState {
  followList: string[];
  directFollowList: string[];
  firstDegreeFollowsLength: number;
  isLoading: boolean;
  setFollows: (
    followList: string[],
    firstDegreeFollowsLength: number,
    isLoading: boolean
  ) => void;
  addFollow: (pubkey: string) => Promise<boolean>;
  removeFollow: (pubkey: string) => Promise<boolean>;
  reset: () => void;
}

const initialState = {
  followList: [],
  directFollowList: [],
  firstDegreeFollowsLength: 0,
  isLoading: true,
};

export const useFollowsStore = create<FollowsStoreState>((set) => ({
  ...initialState,
  setFollows: (followList, firstDegreeFollowsLength, isLoading) =>
    set({
      followList,
      directFollowList: followList.slice(0, firstDegreeFollowsLength),
      firstDegreeFollowsLength,
      isLoading,
    }),
  addFollow: async (pubkey) => {
    set((state) => {
      const nextFollowList = Array.from(new Set([...state.followList, pubkey]));
      const nextDirectFollowList = Array.from(
        new Set([...state.directFollowList, pubkey])
      );
      return {
        followList: nextFollowList,
        directFollowList: nextDirectFollowList,
      };
    });
    return true;
  },
  removeFollow: async (pubkey) => {
    set((state) => ({
      followList: state.followList.filter((item) => item !== pubkey),
      directFollowList: state.directFollowList.filter((item) => item !== pubkey),
    }));
    return true;
  },
  reset: () => set(initialState, true),
}));
