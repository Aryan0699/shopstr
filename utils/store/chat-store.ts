import { create } from "zustand";
import { NostrMessageEvent } from "../types/types";
import { NostrSigner } from "../nostr/signers/nostr-signer";

export type ChatsMap = Map<string, NostrMessageEvent[]>;

interface ChatState {
  chatsMap: ChatsMap;
  isLoading: boolean;
  newOrderIds: Set<string>;
  setChats: (chatsMap: ChatsMap, isLoading: boolean) => void;
  addNewlyCreatedMessageEvent: (
    messageEvent: NostrMessageEvent,
    signer: NostrSigner | undefined,
    sent?: boolean,
  ) => Promise<void>;
  markAllMessagesAsRead: () => Promise<string[]>;
  setNewOrderIds: (ids: Set<string>) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chatsMap: new Map(),
  isLoading: true,
  newOrderIds: new Set(),

  setChats: (chatsMap, isLoading) => set({ chatsMap, isLoading }),

  addNewlyCreatedMessageEvent: async (
    messageEvent: NostrMessageEvent,
    signer: NostrSigner | undefined,
    sent?: boolean,
  ) => {
    const pubkey = await signer?.getPubKey();
    const state = get();
    const newChatsMap = new Map(state.chatsMap);
    const eventWithReadStatus = {
      ...messageEvent,
      read: sent ? true : false,
    };
    let chatArray;
    if (messageEvent.pubkey === pubkey) {
      const recipientPubkey = messageEvent.tags.find(
        (tag) => tag[0] === "p",
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
    set({ chatsMap: newChatsMap, isLoading: false });
  },

  markAllMessagesAsRead: async (): Promise<string[]> => {
    const state = get();
    const unreadMessageIds: string[] = [];
    const wrappedEventIds: string[] = [];

    for (const [_, messages] of state.chatsMap) {
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
        const idsForDb =
          wrappedEventIds.length > 0 ? wrappedEventIds : unreadMessageIds;
        await fetch("/api/db/mark-messages-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageIds: idsForDb }),
        });

        set({ newOrderIds: new Set(unreadMessageIds) });

        const newChatsMap = new Map(state.chatsMap);
        for (const [pubkey, messages] of newChatsMap) {
          const updatedMessages = (messages as NostrMessageEvent[]).map(
            (msg) => ({
              ...msg,
              read: true,
            }),
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

  setNewOrderIds: (ids) => set({ newOrderIds: ids }),
}));
