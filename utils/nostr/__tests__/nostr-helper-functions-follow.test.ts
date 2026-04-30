import { waitFor } from "@testing-library/react";

const cacheEventToDatabaseMock = jest.fn();
const trackFailedRelayPublishMock = jest.fn();
const newPromiseWithTimeoutMock = jest.fn();

jest.mock("@/utils/db/db-client", () => ({
  cacheEventToDatabase: (...args: unknown[]) =>
    cacheEventToDatabaseMock(...args),
  deleteEventsFromDatabase: jest.fn(),
  trackFailedRelayPublish: (...args: unknown[]) =>
    trackFailedRelayPublishMock(...args),
}));

jest.mock("@/utils/timeout", () => ({
  newPromiseWithTimeout: (...args: unknown[]) =>
    newPromiseWithTimeoutMock(...args),
}));

import {
  cacheAndPublishSignedEventInBackground,
  followUser,
  unfollowUser,
} from "../nostr-helper-functions";

describe("follow/unfollow helper flow", () => {
  const userPubkey = "1".repeat(64);
  const targetPubkey = "2".repeat(64);
  const existingFollowPubkey = "3".repeat(64);

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://fallback.example"]));
    localStorage.setItem(
      "readRelays",
      JSON.stringify(["wss://read.example"])
    );
    localStorage.setItem(
      "writeRelays",
      JSON.stringify(["wss://write.example"])
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contactList: null }),
    }) as unknown as typeof fetch;

    cacheEventToDatabaseMock.mockResolvedValue(undefined);
    trackFailedRelayPublishMock.mockResolvedValue(undefined);
    newPromiseWithTimeoutMock.mockImplementation(
      async (
        executor: (
          resolve: (value?: unknown) => void,
          reject: (error?: Error) => void
        ) => void
      ) => new Promise((resolve, reject) => executor(resolve, reject))
    );
  });

  it("follows using the latest DB-backed contact list and returns before relay publish resolves", async () => {
    const signedEvent = {
      id: "signed-follow-event",
      pubkey: userPubkey,
      created_at: 300,
      kind: 3,
      tags: [
        ["p", existingFollowPubkey],
        ["p", targetPubkey],
      ],
      content: "db-content",
      sig: "signed-follow-sig",
    };
    const publishGate = new Promise<void>(() => {});

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      sign: jest.fn().mockResolvedValue(signedEvent),
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([
        {
          id: "older-relay-contact-list",
          pubkey: userPubkey,
          created_at: 100,
          kind: 3,
          tags: [["p", existingFollowPubkey]],
          content: "relay-content",
          sig: "relay-sig",
        },
      ]),
      publish: jest.fn().mockReturnValue(publishGate),
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        contactList: {
          id: "db-contact-list",
          pubkey: userPubkey,
          created_at: 200,
          kind: 3,
          tags: [["p", existingFollowPubkey]],
          content: "db-content",
          sig: "db-sig",
        },
      }),
    });

    const result = await followUser(nostr as any, signer as any, targetPubkey);

    expect(result).toBe(signedEvent);
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 3,
        content: "db-content",
        tags: [
          ["p", existingFollowPubkey],
          ["p", targetPubkey],
        ],
      })
    );

    await waitFor(() => {
      expect(cacheEventToDatabaseMock).toHaveBeenCalledWith(signedEvent);
      expect(nostr.publish).toHaveBeenCalledWith(
        signedEvent,
        expect.arrayContaining([
          "wss://write.example",
          "wss://fallback.example",
          "wss://sendit.nosflare.com",
        ])
      );
    });
  });

  it("unfollows by removing only the target pubkey from the latest contact list before signing", async () => {
    const signedEvent = {
      id: "signed-unfollow-event",
      pubkey: userPubkey,
      created_at: 400,
      kind: 3,
      tags: [
        ["p", existingFollowPubkey],
        ["relay", "wss://relay.example"],
      ],
      content: "keep-content",
      sig: "signed-unfollow-sig",
    };

    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      sign: jest.fn().mockResolvedValue(signedEvent),
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([
        {
          id: "relay-contact-list",
          pubkey: userPubkey,
          created_at: 150,
          kind: 3,
          tags: [
            ["p", existingFollowPubkey],
            ["p", targetPubkey],
            ["relay", "wss://relay.example"],
          ],
          content: "keep-content",
          sig: "relay-sig",
        },
      ]),
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const result = await unfollowUser(
      nostr as any,
      signer as any,
      targetPubkey
    );

    expect(result).toBe(signedEvent);
    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 3,
        content: "keep-content",
        tags: [
          ["p", existingFollowPubkey],
          ["relay", "wss://relay.example"],
        ],
      })
    );
  });

  it("tracks failed relay publishes when background publishing fails", async () => {
    const consoleWarnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const signedEvent = {
      id: "event-that-fails-to-publish",
      pubkey: userPubkey,
      created_at: 500,
      kind: 3,
      tags: [["p", targetPubkey]],
      content: "",
      sig: "sig",
    };
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      sign: jest.fn(),
    };
    const nostr = {
      publish: jest.fn().mockRejectedValue(new Error("relay down")),
    };

    cacheAndPublishSignedEventInBackground(
      nostr as any,
      signedEvent as any,
      signer as any
    );

    await waitFor(() => {
      expect(cacheEventToDatabaseMock).toHaveBeenCalledWith(signedEvent);
      expect(trackFailedRelayPublishMock).toHaveBeenCalledWith(
        signedEvent.id,
        signedEvent,
        expect.arrayContaining([
          "wss://write.example",
          "wss://fallback.example",
          "wss://sendit.nosflare.com",
        ]),
        signer
      );
    });

    consoleWarnSpy.mockRestore();
  });
});
