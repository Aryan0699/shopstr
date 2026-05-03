import { create } from "zustand";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
import { useAuthStore } from "@/utils/stores/auth-store";
import { NostrMessageEvent, Community, CommunityPost } from "../types/types";

export type ChatsMap = Map<string, NostrMessageEvent[]>;

export interface SocialState {
  // Chats (replaces ChatsContext)
  chatsMap: ChatsMap;
  isChatsLoading: boolean;
  newOrderIds: Set<string>;

  // Follows (replaces FollowsContext)
  followList: string[];
  directFollowList: string[];
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
  addMessage: (message: NostrMessageEvent, sent?: boolean) => Promise<void>;
  markAllRead: () => Promise<string[]>;
  setNewOrderIds: (ids: Set<string>) => void;

  // Follow actions
  setFollows: (
    followList: string[],
    firstDegreeFollowsLength: number,
    isLoading: boolean
  ) => void;
  addFollow: (pubkey: string) => Promise<boolean>;
  removeFollow: (pubkey: string) => Promise<boolean>;

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
    directFollowList: [],
    firstDegreeFollowsLength: 0,
    isFollowsLoading: true,
    communities: new Map(),
    posts: new Map(),
    isCommunitiesLoading: true,

    // Chat actions
    setChats: (chatsMap, isLoading) =>
      set({ chatsMap, isChatsLoading: isLoading }),
    addMessage: async (message, sent) => {
      const userPubkey = useAuthStore.getState().pubkey;

      const state = get();
      const newChatsMap = new Map(state.chatsMap);
      const eventWithReadStatus = {
        ...message,
        read: sent ? true : false,
      };
      let chatArray: NostrMessageEvent[];

      if (message.pubkey === userPubkey) {
        const recipientPubkey = message.tags.find(
          (tag) => tag[0] === "p"
        )?.[1];
        if (recipientPubkey) {
          chatArray = newChatsMap.get(recipientPubkey) || [];
          if (sent) {
            chatArray.push(eventWithReadStatus);
          } else {
            chatArray = [eventWithReadStatus, ...chatArray];
          }
          newChatsMap.set(recipientPubkey, chatArray);
        }
      } else {
        chatArray = newChatsMap.get(message.pubkey) || [];
        if (sent) {
          chatArray.push(eventWithReadStatus);
        } else {
          chatArray = [eventWithReadStatus, ...chatArray];
        }
        newChatsMap.set(message.pubkey, chatArray);
      }

      set({ chatsMap: newChatsMap, isChatsLoading: false });
    },
    markAllRead: async () => {
      const { chatsMap } = get();
      const unreadMessageIds: string[] = [];
      const wrappedEventIds: string[] = [];

      for (const [, messages] of chatsMap) {
        for (const message of messages) {
          if (!message.read) {
            unreadMessageIds.push(message.id);
            if (message.wrappedEventId) {
              wrappedEventIds.push(message.wrappedEventId);
            }
          }
        }
      }

      if (unreadMessageIds.length > 0) {
        try {
          const signer = useAuthStore.getState().signer;
          const idsForDb =
            wrappedEventIds.length > 0 ? wrappedEventIds : unreadMessageIds;
          const body = JSON.stringify({ messageIds: idsForDb });
          const authHeader = await createNip98AuthorizationHeader(
            signer!,
            `${window.location.origin}/api/db/mark-messages-read`,
            "POST",
            body
          );
          await fetch("/api/db/mark-messages-read", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
            },
            body,
          });

          set({ newOrderIds: new Set(unreadMessageIds) });
        } catch (error) {
          console.error("Failed to mark messages as read:", error);
        }
      }

      set((state) => {
        const newChatsMap = new Map(state.chatsMap);
        for (const [pubkey, messages] of newChatsMap) {
          const updatedMessages = messages.map((msg) => ({
            ...msg,
            read: true,
          }));
          newChatsMap.set(pubkey, updatedMessages);
        }
        return { chatsMap: newChatsMap };
      });

      return unreadMessageIds;
    },
    setNewOrderIds: (newOrderIds) => set({ newOrderIds }),

    // Follow actions
    setFollows: (followList, firstDegreeFollowsLength, isLoading) =>
      set({
        followList,
        directFollowList: followList.slice(0, firstDegreeFollowsLength),
        firstDegreeFollowsLength,
        isFollowsLoading: isLoading,
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
          firstDegreeFollowsLength: nextDirectFollowList.length,
        };
      });

      return true;
    },
    removeFollow: async (pubkey) => {
      set((state) => {
        const directFollowList = state.directFollowList.filter(
          (item) => item !== pubkey
        );
        return {
          followList: state.followList.filter((item) => item !== pubkey),
          directFollowList,
          firstDegreeFollowsLength: directFollowList.length,
        };
      });

      return true;
    },

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
