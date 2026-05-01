import { create } from "zustand";
import { NostrMessageEvent, Community, CommunityPost } from "../types/types";

export type ChatsMap = Map<string, NostrMessageEvent[]>;

export interface SocialState {
  // Chats (replaces ChatsContext)
  chatsMap: ChatsMap;
  isChatsLoading: boolean;
  newOrderIds: Set<string>;

  // Follows (replaces FollowsContext)
  followList: string[];
  firstDegreeFollowsLength: number;
  isFollowsLoading: boolean;

  // Communities (replaces CommunityContext)
  communities: Map<string, Community>;
  posts: Map<string, CommunityPost[]>;
  isCommunitiesLoading: boolean;
}

export interface SocialActions {
  // Chat actions
  setChats: (chatsMap: ChatsMap, isLoading: boolean) => void;
  addMessage: (message: NostrMessageEvent, sent?: boolean) => void;
  markAllRead: () => void;
  setNewOrderIds: (ids: Set<string>) => void;

  // Follow actions
  setFollows: (
    followList: string[],
    firstDegreeFollowsLength: number,
    isLoading: boolean
  ) => void;

  // Community actions
  setCommunities: (
    communities: Map<string, Community>,
    isLoading: boolean
  ) => void;
  setCommunityPosts: (posts: Map<string, CommunityPost[]>) => void;
  addCommunity: (community: Community) => void;
}

export const useSocialStore = create<SocialState & SocialActions>(
  (set, get) => ({
    // Initial state
    chatsMap: new Map(),
    isChatsLoading: true,
    newOrderIds: new Set(),
    followList: [],
    firstDegreeFollowsLength: 0,
    isFollowsLoading: true,
    communities: new Map(),
    posts: new Map(),
    isCommunitiesLoading: true,

    // Chat actions
    setChats: (chatsMap, isLoading) =>
      set({ chatsMap, isChatsLoading: isLoading }),
    addMessage: (message, sent) => {
      // Note: This needs access to the current user's pubkey to determine
      // if the message was sent or received. The calling code should handle
      // the pubkey-based routing before calling this action.
      const state = get();
      const newChatsMap = new Map(state.chatsMap);
      const eventWithReadStatus = {
        ...message,
        read: sent ? true : false,
      };

      // The caller determines the chat key (counterparty pubkey)
      // and passes it through the message tags
      const recipientPubkey = message.tags.find(
        (tag) => tag[0] === "p"
      )?.[1];

      if (recipientPubkey) {
        const chatArray = newChatsMap.get(recipientPubkey) || [];
        if (sent) {
          chatArray.push(eventWithReadStatus);
        } else {
          newChatsMap.set(recipientPubkey, [
            eventWithReadStatus,
            ...chatArray,
          ]);
          return;
        }
        newChatsMap.set(recipientPubkey, chatArray);
      }

      set({ chatsMap: newChatsMap, isChatsLoading: false });
    },
    markAllRead: () =>
      set((state) => {
        const newChatsMap = new Map(state.chatsMap);
        for (const [pubkey, messages] of newChatsMap) {
          const updatedMessages = (messages as NostrMessageEvent[]).map(
            (msg) => ({
              ...msg,
              read: true,
            })
          );
          newChatsMap.set(pubkey, updatedMessages);
        }
        return { chatsMap: newChatsMap };
      }),
    setNewOrderIds: (newOrderIds) => set({ newOrderIds }),

    // Follow actions
    setFollows: (followList, firstDegreeFollowsLength, isLoading) =>
      set({
        followList,
        firstDegreeFollowsLength,
        isFollowsLoading: isLoading,
      }),

    // Community actions
    setCommunities: (communities, isLoading) =>
      set({ communities, isCommunitiesLoading: isLoading }),
    setCommunityPosts: (posts) => set({ posts }),
    addCommunity: (community) =>
      set((state) => {
        const newCommunities = new Map(state.communities);
        newCommunities.set(community.id, community);
        return { communities: newCommunities };
      }),
  })
);
