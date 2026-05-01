import type { AppProps } from "next/app";
import "../styles/globals.css";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import {
  getLocalStorageData,
  getDefaultRelays,
  LogOut,
} from "@/utils/nostr/nostr-helper-functions";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
import { HeroUIProvider } from "@heroui/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  fetchAllPosts,
  fetchReviews,
  fetchShopProfile,
  fetchProfile,
  fetchAllFollows,
  fetchAllRelays,
  fetchAllBlossomServers,
  fetchCashuWallet,
  fetchAllCommunities,
  fetchGiftWrappedChatsAndMessages,
} from "@/utils/nostr/fetch-service";
import { NostrMessageEvent } from "../utils/types/types";
import TopNav from "@/components/nav-top";
import PageLoadingBar from "@/components/page-loading-bar";
import DynamicHead from "../components/dynamic-meta-head";
import StructuredData from "../components/structured-data";
import {
  NostrContextProvider,
  SignerContextProvider,
} from "@/components/utility-components/nostr-context-provider";
import { retryFailedRelayPublishes } from "@/utils/nostr/retry-service";
import { MintRecoveryBoot } from "@/components/utility-components/mint-recovery-boot";
import { NostrManager } from "@/utils/nostr/nostr-manager";

// Zustand stores
import { useAuthStore } from "@/utils/stores/auth-store";
import { useMarketStore } from "@/utils/stores/market-store";
import { useSocialStore } from "@/utils/stores/social-store";
import { useWalletStore } from "@/utils/stores/wallet-store";
import { useConfigStore } from "@/utils/stores/config-store";
import type { ChatsMap } from "@/utils/stores/social-store";

function Shopstr({ props }: { props: AppProps }) {
  const { Component, pageProps } = props;

  // Read from Zustand stores instead of useContext
  const nostr = useAuthStore((s) => s.nostr);
  const signer = useAuthStore((s) => s.signer);
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  const [focusedPubkey, setFocusedPubkey] = useState("");
  const [selectedSection, setSelectedSection] = useState("");

  const router = useRouter();
  const initializationRunRef = useRef(0);

  /** FETCH initial FOLLOWS, RELAYS, PRODUCTS, and PROFILES **/
  useEffect(() => {
    async function fetchData() {
      const runId = ++initializationRunRef.current;
      const isCurrentRun = () => runId === initializationRunRef.current;
      type EditorFn = (...args: any[]) => void;

      const guard = <TFn extends EditorFn>(fn: TFn) => {
        return ((...args: Parameters<TFn>) => {
          if (!isCurrentRun()) return;
          fn(...args);
        }) as TFn;
      };
      const createGuardedEditors = <T extends Record<string, EditorFn>>(
        editors: T
      ): T => {
        const guardedEditors = {} as T;

        (Object.keys(editors) as Array<keyof T>).forEach((key) => {
          guardedEditors[key] = guard(editors[key]);
        });

        return guardedEditors;
      };

      // Store-based editor functions (replaces the old context setters)
      const editProductContext = (
        productEvents: any[] | null,
        isLoading: boolean
      ) => {
        const store = useMarketStore.getState();
        useMarketStore.setState({
          productEvents: productEvents ?? store.productEvents,
          isProductsLoading: isLoading,
        });
      };

      const editReviewsContext = (
        merchantReviewsData: Map<string, number[]>,
        productReviewsData: Map<string, Map<string, Map<string, string[][]>>>,
        isLoading: boolean
      ) => {
        useMarketStore.setState({
          merchantReviewsData,
          productReviewsData,
          isReviewsLoading: isLoading,
        });
      };

      const editShopContext = (
        shopData: Map<string, any>,
        isLoading: boolean
      ) => {
        useMarketStore.setState({
          shopData,
          isShopsLoading: isLoading,
        });
      };

      const editProfileContext = (
        profileData: Map<string, any>,
        isLoading: boolean
      ) => {
        useMarketStore.getState().mergeProfiles(profileData, isLoading);
      };

      const editChatContext = (chatsMap: ChatsMap, isLoading: boolean) => {
        useSocialStore.setState({
          chatsMap,
          isChatsLoading: isLoading,
        });
      };

      const editFollowsContext = (
        followList: string[],
        firstDegreeFollowsLength: number,
        isLoading: boolean
      ) => {
        useSocialStore.getState().setFollows(followList, firstDegreeFollowsLength, isLoading);
      };

      const editCommunityContext = (
        communities: Map<string, any>,
        isLoading: boolean
      ) => {
        useSocialStore.setState({
          communities,
          isCommunitiesLoading: isLoading,
        });
      };

      const editRelaysContext = (
        relayList: string[],
        readRelayList: string[],
        writeRelayList: string[],
        isLoading: boolean
      ) => {
        useConfigStore.getState().setRelays(relayList, readRelayList, writeRelayList, isLoading);
      };

      const editBlossomContext = (
        blossomServers: string[],
        isLoading: boolean
      ) => {
        useConfigStore.getState().setBlossom(blossomServers, isLoading);
      };

      const editCashuWalletContext = (
        proofEvents: any[],
        cashuMints: string[],
        cashuProofs: any[],
        isLoading: boolean
      ) => {
        useWalletStore.getState().setWallet(proofEvents, cashuMints, cashuProofs, isLoading);
      };

      const {
        guardedEditProductContext,
        guardedEditReviewsContext,
        guardedEditShopContext,
        guardedEditProfileContext,
        guardedEditChatContext,
        guardedEditFollowsContext,
        guardedEditRelaysContext,
        guardedEditBlossomContext,
        guardedEditCashuWalletContext,
        guardedEditCommunityContext,
      } = createGuardedEditors({
        guardedEditProductContext: editProductContext,
        guardedEditReviewsContext: editReviewsContext,
        guardedEditShopContext: editShopContext,
        guardedEditProfileContext: editProfileContext,
        guardedEditChatContext: editChatContext,
        guardedEditFollowsContext: editFollowsContext,
        guardedEditRelaysContext: editRelaysContext,
        guardedEditBlossomContext: editBlossomContext,
        guardedEditCashuWalletContext: editCashuWalletContext,
        guardedEditCommunityContext: editCommunityContext,
      });

      const runTask = async <T,>(
        taskName: string,
        task: () => Promise<T>,
        onError?: () => void
      ): Promise<T | undefined> => {
        try {
          return await task();
        } catch (error) {
          console.error(`Error ${taskName}:`, error);
          if (isCurrentRun()) {
            onError?.();
          }
          return undefined;
        }
      };

      try {
        // Check login status
        if (getLocalStorageData().signInMethod === "amber") {
          LogOut();
          return;
        }

        if (
          getLocalStorageData().signInMethod === "extension" ||
          getLocalStorageData().signer?.type === "nip07"
        ) {
          if (!window.nostr?.nip44) {
            LogOut();
            return;
          }
        }

        // Initialize relays
        const relays = getLocalStorageData().relays || [];
        const readRelays = getLocalStorageData().readRelays || [];
        let allRelays = [...relays, ...readRelays];

        if (allRelays.length === 0) {
          allRelays = getDefaultRelays();
          localStorage.setItem("relays", JSON.stringify(allRelays));
        }

        // Fire them first and in parellel since independent of each other and other depend on it
        const [relayResult, userPubkey] = await Promise.all([
          runTask(
            "fetching relays",
            () =>
              fetchAllRelays(
                nostr!,
                signer!,
                allRelays,
                guardedEditRelaysContext
              ),
            () => guardedEditRelaysContext([], [], [], false)
          ),
          runTask(
            "resolving signer pubkey",
            async () => (await signer?.getPubKey()) || undefined
          ),
        ]);

        if (!isCurrentRun()) return;

        if (relayResult && relayResult.relayList.length !== 0) {
          localStorage.setItem("relays", JSON.stringify(relayResult.relayList));
          localStorage.setItem(
            "readRelays",
            JSON.stringify(relayResult.readRelayList)
          );
          localStorage.setItem(
            "writeRelays",
            JSON.stringify(relayResult.writeRelayList)
          );
          allRelays = [...relayResult.relayList, ...relayResult.readRelayList];
        }

        // We just fire them and not await them so that they just update their context and not block others
        const blossomPromise = runTask(
          "fetching blossom servers",
          () =>
            fetchAllBlossomServers(
              nostr!,
              signer!,
              allRelays,
              guardedEditBlossomContext
            ),
          () => guardedEditBlossomContext([], false)
        );

        const walletPromise = isLoggedIn
          ? runTask(
              "fetching wallet",
              () =>
                fetchCashuWallet(
                  nostr!,
                  signer!,
                  allRelays,
                  guardedEditCashuWalletContext
                ),
              () => guardedEditCashuWalletContext([], [], [], false)
            )
          : Promise.resolve(undefined);

        const followsPromise = runTask(
          "fetching follows",
          () =>
            fetchAllFollows(
              nostr!,
              allRelays,
              guardedEditFollowsContext,
              userPubkey
            ),
          () => guardedEditFollowsContext([], 0, false)
        );

        const communitiesPromise = runTask(
          "fetching communities",
          () =>
            fetchAllCommunities(nostr!, allRelays, guardedEditCommunityContext),
          () => guardedEditCommunityContext(new Map(), false)
        );

        const productsPromise = runTask(
          "fetching products",
          () => fetchAllPosts(nostr!, allRelays, guardedEditProductContext),
          () => guardedEditProductContext(null, false)
        );

        const chatsPromise = isLoggedIn
          ? runTask(
              "fetching chats",
              () =>
                fetchGiftWrappedChatsAndMessages(
                  nostr!,
                  signer!,
                  allRelays,
                  guardedEditChatContext,
                  userPubkey
                ),
              () => guardedEditChatContext(new Map(), false)
            )
          : Promise.resolve(undefined);

        // Run them in parellel first since required for profile/shops/reviews
        const [productsResult, chatsResult] = await Promise.all([
          productsPromise,
          chatsPromise,
        ]);

        if (!isCurrentRun()) return;

        // Derive the pubkey list
        const productEvents = productsResult?.productEvents ?? [];
        const profileSetFromProducts =
          productsResult?.profileSetFromProducts ?? new Set<string>();
        const profileSetFromChats =
          chatsResult?.profileSetFromChats ?? new Set<string>();

        const pubkeySet = new Set<string>([
          ...profileSetFromProducts,
          ...profileSetFromChats,
        ]);

        if (userPubkey) {
          pubkeySet.add(userPubkey);
        }

        const pubkeysToFetchProfilesFor = Array.from(pubkeySet);

        // Get the current profile data from the store
        const currentProfileData = useMarketStore.getState().profileData;

        // These start immediately — no waiting for wallet, blossom, follows, or communities.
        await Promise.all([
          runTask(
            "fetching profiles",
            () =>
              fetchProfile(
                nostr!,
                allRelays,
                pubkeysToFetchProfilesFor,
                guardedEditProfileContext,
                currentProfileData
              ),
            () =>
              guardedEditProfileContext(
                new Map(currentProfileData),
                false
              )
          ),
          runTask(
            "fetching shop profiles",
            () =>
              fetchShopProfile(
                nostr!,
                allRelays,
                pubkeysToFetchProfilesFor,
                guardedEditShopContext
              ),
            () => guardedEditShopContext(new Map(), false)
          ),
          runTask(
            "fetching reviews",
            () =>
              fetchReviews(
                nostr!,
                allRelays,
                productEvents,
                guardedEditReviewsContext
              ),
            () => guardedEditReviewsContext(new Map(), new Map(), false)
          ),
        ]);

        if (!isCurrentRun()) return;

        // By now these are likely already done; we await to catch errors and read results.
        const [blossomResult, walletResult] = await Promise.all([
          blossomPromise,
          walletPromise,
          followsPromise,
          communitiesPromise,
        ]);

        if (!isCurrentRun()) return;

        if (blossomResult?.blossomServers?.length) {
          localStorage.setItem(
            "blossomServers",
            JSON.stringify(blossomResult.blossomServers)
          );
        }

        if (walletResult?.cashuMints?.length && walletResult.cashuProofs) {
          localStorage.setItem(
            "mints",
            JSON.stringify(walletResult.cashuMints)
          );
          localStorage.setItem(
            "tokens",
            JSON.stringify(walletResult.cashuProofs)
          );
        }

        await runTask("retrying relay publishes", async () => {
          if (!signer) {
            return;
          }

          const { relays, writeRelays } = getLocalStorageData();
          const retryNostr = new NostrManager([...relays, ...writeRelays]);
          await retryFailedRelayPublishes(retryNostr, signer);
        });
      } catch (error) {
        console.error("Critical error during app initialization:", error);
        if (!isCurrentRun()) return;
        guardedEditProductContext([], false);
        guardedEditReviewsContext(new Map(), new Map(), false);
        guardedEditShopContext(new Map(), false);
        guardedEditProfileContext(new Map(), false);
        guardedEditChatContext(new Map(), false);
        guardedEditFollowsContext([], 0, false);
        guardedEditRelaysContext([], [], [], false);
        guardedEditBlossomContext([], false);
        guardedEditCashuWalletContext([], [], [], false);
        guardedEditCommunityContext(new Map(), false);
      }
    }

    fetchData();
  }, [nostr, signer, isLoggedIn]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/service-worker.js")
          .catch((registrationError) => {
            console.error(
              "Service Worker registration failed: ",
              registrationError
            );
          });
      });
    }
  }, []);

  // Read from stores for the head component
  const productEvents = useMarketStore((s) => s.productEvents);
  const shopData = useMarketStore((s) => s.shopData);
  const profileData = useMarketStore((s) => s.profileData);

  return (
    <>
      <DynamicHead
        productEvents={productEvents}
        shopEvents={shopData}
        profileData={profileData}
        ssrOgMeta={pageProps.ogMeta ?? null}
      />
      <StructuredData />
      <PageLoadingBar />
      {![
        "/",
        "/about",
        "/contact",
        "/faq",
        "/terms",
        "/privacy",
      ].includes(router.pathname) && (
        <TopNav
          setFocusedPubkey={setFocusedPubkey}
          setSelectedSection={setSelectedSection}
        />
      )}
      <div className="flex">
        <main className="flex-1">
          <Component
            {...pageProps}
            focusedPubkey={focusedPubkey}
            setFocusedPubkey={setFocusedPubkey}
            selectedSection={selectedSection}
            setSelectedSection={setSelectedSection}
          />
        </main>
      </div>
    </>
  );
}

function App(props: AppProps) {
  return (
    <>
      <HeroUIProvider>
        <NextThemesProvider attribute="class">
          <NostrContextProvider>
            <SignerContextProvider>
              <MintRecoveryBoot />
              <Shopstr props={props} />
            </SignerContextProvider>
          </NostrContextProvider>
        </NextThemesProvider>
      </HeroUIProvider>
    </>
  );
}

export default App;
