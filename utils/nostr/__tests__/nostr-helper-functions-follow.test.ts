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
  finalizeAndSendNostrEvent,
} from "../nostr-helper-functions";

describe("shared signed-event persistence flow", () => {
  const signedEvent = {
    id: "evt-1",
    pubkey: "1".repeat(64),
    created_at: 123,
    kind: 3,
    tags: [["p", "2".repeat(64)]],
    content: "",
    sig: "sig",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem(
      "writeRelays",
      JSON.stringify(["wss://write.example"])
    );
    localStorage.setItem("readRelays", JSON.stringify([]));

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

  it("background publish reuses the shared cache/publish/retry flow", async () => {
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("1".repeat(64)),
      sign: jest.fn(),
    };
    const nostr = {
      publish: jest.fn().mockRejectedValue(new Error("relay down")),
    };

    expect(
      cacheAndPublishSignedEventInBackground(
        nostr as any,
        signedEvent as any,
        signer as any
      )
    ).toBeUndefined();

    await waitFor(() => {
      expect(cacheEventToDatabaseMock).toHaveBeenCalledWith(signedEvent);
      expect(nostr.publish).toHaveBeenCalledWith(
        signedEvent,
        expect.arrayContaining([
          "wss://write.example",
          "wss://relay.example",
          "wss://sendit.nosflare.com",
        ])
      );
      expect(trackFailedRelayPublishMock).toHaveBeenCalledWith(
        signedEvent.id,
        signedEvent,
        expect.arrayContaining([
          "wss://write.example",
          "wss://relay.example",
          "wss://sendit.nosflare.com",
        ]),
        signer
      );
    });
  });

  it("continues to relay publish when caching fails in background mode", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const signer = {
      getPubKey: jest.fn().mockResolvedValue("1".repeat(64)),
      sign: jest.fn(),
    };
    const nostr = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    cacheEventToDatabaseMock.mockRejectedValueOnce(new Error("db down"));

    cacheAndPublishSignedEventInBackground(
      nostr as any,
      signedEvent as any,
      signer as any
    );

    await waitFor(() => {
      expect(nostr.publish).toHaveBeenCalledWith(
        signedEvent,
        expect.arrayContaining([
          "wss://write.example",
          "wss://relay.example",
          "wss://sendit.nosflare.com",
        ])
      );
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to cache signed event to database before relay publish:",
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });

  it("finalizeAndSendNostrEvent awaits the same shared persistence flow", async () => {
    const signer = {
      sign: jest.fn().mockResolvedValue(signedEvent),
      getPubKey: jest.fn(),
    };
    const nostr = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const result = await finalizeAndSendNostrEvent(
      signer as any,
      nostr as any,
      { kind: 3, content: "", tags: [], created_at: 1 }
    );

    expect(result).toBe(signedEvent);
    expect(cacheEventToDatabaseMock).toHaveBeenCalledWith(signedEvent);
    expect(nostr.publish).toHaveBeenCalledWith(
      signedEvent,
      expect.arrayContaining([
        "wss://write.example",
        "wss://relay.example",
        "wss://sendit.nosflare.com",
      ])
    );
  });
});
