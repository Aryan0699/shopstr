import { create } from "zustand";
import { Community, CommunityPost } from "@/utils/types/types";

export interface CommunityStoreState {
  communities: Map<string, Community>;
  posts: Map<string, CommunityPost[]>;
  isLoading: boolean;
  addCommunity: (community: Community) => void;
  setCommunities: (communities: Map<string, Community>, isLoading: boolean) => void;
  setPosts: (posts: Map<string, CommunityPost[]>) => void;
  reset: () => void;
}

const initialState = {
  communities: new Map(),
  posts: new Map(),
  isLoading: true,
};

export const useCommunityStore = create<CommunityStoreState>((set) => ({
  ...initialState,
  addCommunity: (community) =>
    set((state) => {
      const newCommunities = new Map(state.communities);
      newCommunities.set(community.id, community);
      return { communities: newCommunities };
    }),
  setCommunities: (communities, isLoading) => set({ communities, isLoading }),
  setPosts: (posts) => set({ posts }),
  reset: () => set(initialState, true),
}));
