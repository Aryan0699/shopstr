import React, { useContext } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppProps } from "next/app";
import { FollowsContext } from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";

const followUserMock = jest.fn();
const unfollowUserMock = jest.fn();
const getLocalStorageDataMock = jest.fn();
const getDefaultRelaysMock = jest.fn();
const fetchAllRelaysMock = jest.fn();
const fetchAllPostsMock = jest.fn();
const fetchProfileMock = jest.fn();
const fetchShopProfileMock = jest.fn();
const fetchReviewsMock = jest.fn();
const fetchAllFollowsMock = jest.fn();
const fetchAllBlossomServersMock = jest.fn();
const fetchCashuWalletMock = jest.fn();
const fetchAllCommunitiesMock = jest.fn();
const fetchGiftWrappedChatsAndMessagesMock = jest.fn();
const retryFailedRelayPublishesMock = jest.fn();

jest.mock("next/router", () => ({
  __esModule: true,
  useRouter: jest.fn(() => ({
    pathname: "/marketplace",
    query: {},
    push: jest.fn(),
    replace: jest.fn(),
  })),
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getLocalStorageData: (...args: unknown[]) => getLocalStorageDataMock(...args),
  getDefaultRelays: (...args: unknown[]) => getDefaultRelaysMock(...args),
  LogOut: jest.fn(),
  followUser: (...args: unknown[]) => followUserMock(...args),
  unfollowUser: (...args: unknown[]) => unfollowUserMock(...args),
}));

jest.mock("@/utils/nostr/fetch-service", () => ({
  fetchAllPosts: (...args: unknown[]) => fetchAllPostsMock(...args),
  fetchReviews: (...args: unknown[]) => fetchReviewsMock(...args),
  fetchShopProfile: (...args: unknown[]) => fetchShopProfileMock(...args),
  fetchProfile: (...args: unknown[]) => fetchProfileMock(...args),
  fetchAllFollows: (...args: unknown[]) => fetchAllFollowsMock(...args),
  fetchAllRelays: (...args: unknown[]) => fetchAllRelaysMock(...args),
  fetchAllBlossomServers: (...args: unknown[]) =>
    fetchAllBlossomServersMock(...args),
  fetchCashuWallet: (...args: unknown[]) => fetchCashuWalletMock(...args),
  fetchAllCommunities: (...args: unknown[]) =>
    fetchAllCommunitiesMock(...args),
  fetchGiftWrappedChatsAndMessages: (...args: unknown[]) =>
    fetchGiftWrappedChatsAndMessagesMock(...args),
}));

jest.mock("@/utils/nostr/retry-service", () => ({
  retryFailedRelayPublishes: (...args: unknown[]) =>
    retryFailedRelayPublishesMock(...args),
}));

jest.mock("@/utils/nostr/nostr-manager", () => ({
  NostrManager: class MockNostrManager {
    constructor(_relays: string[]) {}
  },
}));

jest.mock("@/components/nav-top", () => () => null);
jest.mock("@/components/page-loading-bar", () => () => null);
jest.mock("@/components/dynamic-meta-head", () => () => null);
jest.mock("@/components/structured-data", () => () => null);

import { Shopstr } from "../_app";

function FollowsHarness({ targetPubkey }: { targetPubkey: string }) {
  const followsContext = useContext(FollowsContext);

  return (
    <div>
      <div data-testid="direct">
        {followsContext.directFollowList.join(",") || "empty"}
      </div>
      <div data-testid="follow">
        {followsContext.followList.join(",") || "empty"}
      </div>
      <div data-testid="count">{followsContext.firstDegreeFollowsLength}</div>
      <button onClick={() => void followsContext.addFollow(targetPubkey)}>
        Add follow
      </button>
      <button onClick={() => void followsContext.removeFollow(targetPubkey)}>
        Remove follow
      </button>
    </div>
  );
}

describe("Shopstr follows context wiring", () => {
  const viewerPubkey = "1".repeat(64);
  const targetPubkey = "2".repeat(64);
  const mockSigner = {
    getPubKey: jest.fn().mockResolvedValue(viewerPubkey),
  };
  const mockNostr = {};

  const renderShopstr = () => {
    const Component = () => <FollowsHarness targetPubkey={targetPubkey} />;
    const props = {
      Component,
      pageProps: {},
      router: {} as AppProps["router"],
    } as AppProps;

    return render(
      <NostrContext.Provider value={{ nostr: mockNostr as any }}>
        <SignerContext.Provider
          value={{
            signer: mockSigner as any,
            isLoggedIn: true,
            pubkey: viewerPubkey,
          }}
        >
          <Shopstr props={props} />
        </SignerContext.Provider>
      </NostrContext.Provider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();

    getLocalStorageDataMock.mockReturnValue({
      relays: ["wss://relay.example"],
      readRelays: [],
      writeRelays: [],
      blossomServers: [],
      cashuMints: [],
      cashuProofs: [],
      wot: 1,
    });
    getDefaultRelaysMock.mockReturnValue(["wss://default.example"]);
    fetchAllRelaysMock.mockResolvedValue({
      relayList: [],
      readRelayList: [],
      writeRelayList: [],
    });
    fetchAllPostsMock.mockResolvedValue({
      productEvents: [],
      profileSetFromProducts: new Set<string>(),
    });
    fetchProfileMock.mockResolvedValue(undefined);
    fetchShopProfileMock.mockResolvedValue(undefined);
    fetchReviewsMock.mockResolvedValue(undefined);
    fetchAllBlossomServersMock.mockResolvedValue(undefined);
    fetchCashuWalletMock.mockResolvedValue(undefined);
    fetchAllCommunitiesMock.mockResolvedValue(undefined);
    fetchGiftWrappedChatsAndMessagesMock.mockResolvedValue({
      profileSetFromChats: new Set<string>(),
    });
    retryFailedRelayPublishesMock.mockResolvedValue(undefined);
    followUserMock.mockResolvedValue({
      id: "follow-signed-event",
      pubkey: viewerPubkey,
      created_at: 100,
      kind: 3,
      tags: [["p", targetPubkey]],
      content: "",
      sig: "sig",
    });
    unfollowUserMock.mockResolvedValue({
      id: "unfollow-signed-event",
      pubkey: viewerPubkey,
      created_at: 101,
      kind: 3,
      tags: [],
      content: "",
      sig: "sig",
    });
  });

  it("adds a direct follow to both follow lists after followUser succeeds", async () => {
    fetchAllFollowsMock.mockImplementation(
      async (
        _nostr: unknown,
        _relays: string[],
        editFollowsContext: (
          direct: string[],
          follow: string[],
          count: number,
          isLoading: boolean
        ) => void
      ) => {
        editFollowsContext([], [], 0, false);
        return {
          directFollowList: [],
          followList: [],
          firstDegreeFollowsLength: 0,
        };
      }
    );

    renderShopstr();

    await waitFor(() => {
      expect(screen.getByTestId("count")).toHaveTextContent("0");
    });

    await userEvent.click(screen.getByRole("button", { name: "Add follow" }));

    await waitFor(() => {
      expect(followUserMock).toHaveBeenCalledWith(
        mockNostr,
        mockSigner,
        targetPubkey
      );
      expect(screen.getByTestId("direct")).toHaveTextContent(targetPubkey);
      expect(screen.getByTestId("follow")).toHaveTextContent(targetPubkey);
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });
  });

  it("removes a direct follow from both follow lists after unfollowUser succeeds", async () => {
    fetchAllFollowsMock.mockImplementation(
      async (
        _nostr: unknown,
        _relays: string[],
        editFollowsContext: (
          direct: string[],
          follow: string[],
          count: number,
          isLoading: boolean
        ) => void
      ) => {
        editFollowsContext([targetPubkey], [targetPubkey], 1, false);
        return {
          directFollowList: [targetPubkey],
          followList: [targetPubkey],
          firstDegreeFollowsLength: 1,
        };
      }
    );

    renderShopstr();

    await waitFor(() => {
      expect(screen.getByTestId("direct")).toHaveTextContent(targetPubkey);
      expect(screen.getByTestId("count")).toHaveTextContent("1");
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Remove follow" })
    );

    await waitFor(() => {
      expect(unfollowUserMock).toHaveBeenCalledWith(
        mockNostr,
        mockSigner,
        targetPubkey
      );
      expect(screen.getByTestId("direct")).toHaveTextContent("empty");
      expect(screen.getByTestId("follow")).toHaveTextContent("empty");
      expect(screen.getByTestId("count")).toHaveTextContent("0");
    });
  });
});
