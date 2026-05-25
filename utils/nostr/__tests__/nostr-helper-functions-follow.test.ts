jest.mock("@/utils/db/db-client", () => ({
  cacheEventToDatabase: jest.fn().mockResolvedValue(undefined),
  deleteEventsFromDatabase: jest.fn(),
  trackFailedRelayPublish: jest.fn().mockResolvedValue(undefined),
}));

import { unfollowUser } from "../nostr-helper-functions";
import type { NostrManager } from "../nostr-manager";
import type { NostrSigner } from "../signers/nostr-signer";
import type { NostrEvent } from "@/utils/types/types";

const makeEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
  id: "9".repeat(64),
  pubkey: "a".repeat(64),
  created_at: 900,
  kind: 3,
  tags: [],
  content: "",
  sig: "sig",
  ...overrides,
});

describe("follow contact list mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify(["wss://relay.example"]));
    localStorage.setItem(
      "writeRelays",
      JSON.stringify(["wss://write.example"])
    );
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ contactList: null }),
    }) as typeof global.fetch;
    jest.spyOn(Date, "now").mockReturnValue(1_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("serializes concurrent unfollows for different pubkeys into one final contact list", async () => {
    const userPubkey =
      "1111111111111111111111111111111111111111111111111111111111111111";
    const firstTarget =
      "2222222222222222222222222222222222222222222222222222222222222222";
    const secondTarget =
      "3333333333333333333333333333333333333333333333333333333333333333";
    const remainingTarget =
      "4444444444444444444444444444444444444444444444444444444444444444";
    const baseContactList = makeEvent({
      pubkey: userPubkey,
      tags: [
        ["p", firstTarget],
        ["p", secondTarget],
        ["p", remainingTarget],
      ],
    });
    let signCount = 0;
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      sign: jest.fn(async (eventTemplate) => {
        signCount += 1;
        return {
          ...eventTemplate,
          id: String(signCount).repeat(64),
          pubkey: userPubkey,
          sig: `sig-${signCount}`,
        };
      }),
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([baseContactList]),
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const [firstResult, secondResult] = await Promise.all([
      unfollowUser(
        nostr as unknown as NostrManager,
        signer as unknown as NostrSigner,
        firstTarget
      ),
      unfollowUser(
        nostr as unknown as NostrManager,
        signer as unknown as NostrSigner,
        secondTarget
      ),
    ]);

    expect(signer.sign).toHaveBeenCalledTimes(2);
    expect(firstResult?.tags).toEqual([
      ["p", secondTarget],
      ["p", remainingTarget],
    ]);
    expect(secondResult?.tags).toEqual([["p", remainingTarget]]);
    expect(secondResult?.created_at).toBe((firstResult?.created_at ?? 0) + 1);
  });

  it("does not ask for a second signature for duplicate concurrent unfollows", async () => {
    const userPubkey =
      "5555555555555555555555555555555555555555555555555555555555555555";
    const targetPubkey =
      "6666666666666666666666666666666666666666666666666666666666666666";
    const remainingTarget =
      "7777777777777777777777777777777777777777777777777777777777777777";
    const baseContactList = makeEvent({
      pubkey: userPubkey,
      tags: [
        ["p", targetPubkey],
        ["p", remainingTarget],
      ],
    });
    const signer = {
      getPubKey: jest.fn().mockResolvedValue(userPubkey),
      sign: jest.fn(async (eventTemplate) => ({
        ...eventTemplate,
        id: "8".repeat(64),
        pubkey: userPubkey,
        sig: "sig",
      })),
    };
    const nostr = {
      fetch: jest.fn().mockResolvedValue([baseContactList]),
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const [firstResult, secondResult] = await Promise.all([
      unfollowUser(
        nostr as unknown as NostrManager,
        signer as unknown as NostrSigner,
        targetPubkey
      ),
      unfollowUser(
        nostr as unknown as NostrManager,
        signer as unknown as NostrSigner,
        targetPubkey
      ),
    ]);

    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(firstResult?.tags).toEqual([["p", remainingTarget]]);
    expect(secondResult?.tags).toEqual([["p", remainingTarget]]);
  });
});
