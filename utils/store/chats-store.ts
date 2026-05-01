import { create } from "zustand";
import { NostrMessageEvent } from "@/utils/types/types";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
import { useSignerStore } from "@/utils/store/signer-store";

export type ChatsMap = Map<string, NostrMessageEvent[]>;

export interface ChatsStoreState {
  chatsMap: ChatsMap;
  isLoading: boolean;
  newOrderIds: Set<string>;
  addNewlyCreatedMessageEvent: (
    messageEvent: NostrMessageEvent,
    sent?: boolean
  ) => Promise<void>;
  markAllMessagesAsRead: () => Promise<string[]>;
  setChatsMap: (chatsMap: ChatsMap, isLoading: boolean) => void;
  setNewOrderIds: (newOrderIds: Set<string>) => void;
  reset: () => void;
}

const initialState = {
  chatsMap: new Map(),
  isLoading: true,
  newOrderIds: new Set<string>(),
};

export const useChatsStore = create<ChatsStoreState>((set, get) => ({
  ...initialState,
  setChatsMap: (chatsMap, isLoading) => set({ chatsMap, isLoading }),
  setNewOrderIds: (newOrderIds) => set({ newOrderIds }),
  addNewlyCreatedMessageEvent: async (messageEvent, sent) => {
    const pubkey = await useSignerStore.getState().signer?.getPubKey();
    set((state) => {
      const newChatsMap = new Map(state.chatsMap);
      const eventWithReadStatus = {
        ...messageEvent,
        read: sent ? true : false,
      };
      let chatArray;
      if (messageEvent.pubkey === pubkey) {
        const recipientPubkey = messageEvent.tags.find(
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
        chatArray = newChatsMap.get(messageEvent.pubkey) || [];
        if (sent) {
          chatArray.push(eventWithReadStatus);
        } else {
          chatArray = [eventWithReadStatus, ...chatArray];
        }
        newChatsMap.set(messageEvent.pubkey, chatArray);
      }
      return {
        chatsMap: newChatsMap,
        isLoading: false,
      };
    });
  },
  markAllMessagesAsRead: async () => {
    const { chatsMap } = get();
    const unreadMessageIds: string[] = [];
    const wrappedEventIds: string[] = [];

    for (const [_, messages] of chatsMap) {
      for (const message of messages as NostrMessageEvent[]) {
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
        const signer = useSignerStore.getState().signer;
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

        const newChatsMap = new Map(chatsMap);
        for (const [pubkey, messages] of newChatsMap) {
          const updatedMessages = (messages as NostrMessageEvent[]).map(
            (msg) => ({
              ...msg,
              read: true,
            })
          );
          newChatsMap.set(pubkey, updatedMessages);
        }
        set({ chatsMap: newChatsMap });
      } catch (error) {
        console.error("Failed to mark messages as read:", error);
      }
    }

    return unreadMessageIds;
  },
  reset: () => set(initialState, true),
}));
