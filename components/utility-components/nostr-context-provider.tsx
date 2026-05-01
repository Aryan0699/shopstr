import {
  useCallback,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { nip19 } from "nostr-tools";
import {
  ChallengeHandler,
  NostrSigner,
} from "@/utils/nostr/signers/nostr-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getLocalStorageData } from "@/utils/nostr/nostr-helper-functions";
import PassphraseChallengeModal from "@/components/utility-components/request-passphrase-modal";
import AuthUrlChallengeModal from "@/components/utility-components/auth-challenge-modal";
import { NostrNIP07Signer } from "@/utils/nostr/signers/nostr-nip07-signer";
import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { needsMigration } from "@/utils/nostr/encryption-migration";
import MigrationPromptModal from "./migration-prompt-modal";
import { useAuthStore } from "@/utils/stores/auth-store";

/**
 * SignerContextProvider — now uses useAuthStore instead of React Context.
 * Still renders as a wrapper component because it manages auth modals
 * (passphrase, auth URL, migration) that need to be in the React tree.
 */
export function SignerContextProvider({ children }: { children: ReactNode }) {
  const [isPassphraseRequested, setIsPassphraseRequested] = useState(false);
  const [isAuthChallengeRequested, setIsAuthChallengeRequested] =
    useState(false);
  const [authUrl, setAuthUrl] = useState("");

  const [challengeResolver, setChallengeResolver] = useState<
    ((res: any) => void) | undefined
  >(undefined);

  const [error, setError] = useState<Error | undefined>(undefined);
  const [abort, setAbort] = useState<() => void>(() => {});
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const lastSuccessfulSignerKeyRef = useRef<string>("");

  // Read store state for isLoggedIn check
  const signer = useAuthStore((s) => s.signer);
  const pubkey = useAuthStore((s) => s.pubkey);
  const isLoggedIn = !!(signer && pubkey);

  const challengeHandler: ChallengeHandler = (
    type,
    challenge,
    abort,
    abortSignal,
    error
  ) => {
    return new Promise((resolve, _reject) => {
      setError(error);
      setAbort(() => abort);
      setChallengeResolver(() => {
        return async (res: any) => {
          resolve(res);
        };
      });
      switch (type) {
        case "passphrase": {
          setIsPassphraseRequested(true);
          abortSignal.addEventListener("abort", () => {
            setIsPassphraseRequested(false);
          });
          break;
        }
        case "auth_url": {
          setAuthUrl(challenge);
          setIsAuthChallengeRequested(true);
          abortSignal.addEventListener("abort", () => {
            setIsAuthChallengeRequested(false);
          });
          break;
        }
        default: {
          throw new Error("Unknown challenge type " + type);
        }
      }
    });
  };

  const loadKeys = async (signerObject: NostrSigner) => {
    try {
      const pk = await signerObject.getPubKey();
      const np = nip19.npubEncode(pk);
      useAuthStore.getState().setPubkey(pk);
      useAuthStore.getState().setNpub(np);
      setIsPassphraseRequested(false);
    } catch (error) {
      if (error instanceof Error && error.message.includes("passphrase")) {
        setIsPassphraseRequested(true);
      }
      useAuthStore.getState().setPubkey(undefined);
      useAuthStore.getState().setNpub(undefined);
    } finally {
      useAuthStore.getState().setIsAuthStateResolved(true);
    }
  };

  const loadSigner = useCallback((retryCount = 0) => {
    let existingSigner;
    const { signer, signInMethod } = getLocalStorageData();

    if (signer) {
      existingSigner = signer;
    } else if (signInMethod) {
      switch (signInMethod) {
        case "bunker": {
          let bunker =
            "bunker://" +
            getLocalStorageData().bunkerRemotePubkey +
            "?secret=" +
            getLocalStorageData().bunkerSecret;
          const bunkerRelays = getLocalStorageData().bunkerRelays;
          for (const relay of bunkerRelays!) {
            bunker += "&relay=" + relay;
          }
          const appPrivKey = getLocalStorageData().clientPrivkey;
          existingSigner = {
            type: "nip46",
            bunker,
            appPrivKey: appPrivKey!,
          };
          break;
        }
        case "extension": {
          existingSigner = {
            type: "nip07",
          };
          break;
        }
        case "nsec": {
          const encryptedPrivateKey = getLocalStorageData().encryptedPrivateKey;
          existingSigner = {
            type: "nsec",
            encryptedPrivKey: encryptedPrivateKey!,
          };
          break;
        }
        default: {
          throw new Error("Unknown signInMethod " + signInMethod);
        }
      }
    } else {
      lastSuccessfulSignerKeyRef.current = "";
      useAuthStore.getState().setSigner(undefined);
      useAuthStore.getState().setPubkey(undefined);
      useAuthStore.getState().setNpub(undefined);
      useAuthStore.getState().setIsAuthStateResolved(true);
      return;
    }

    const signerKey = JSON.stringify(existingSigner);
    if (signerKey === lastSuccessfulSignerKeyRef.current) {
      return;
    }

    useAuthStore.getState().setIsAuthStateResolved(false);

    let signerObject: NostrSigner;
    try {
      signerObject = NostrManager.signerFrom(existingSigner!, challengeHandler);
    } catch {
      const isExtension =
        existingSigner?.type === "nip07" || signInMethod === "extension";
      if (isExtension && retryCount < 10) {
        setTimeout(() => loadSigner(retryCount + 1), 500);
      } else {
        useAuthStore.getState().setSigner(undefined);
        useAuthStore.getState().setPubkey(undefined);
        useAuthStore.getState().setNpub(undefined);
        useAuthStore.getState().setIsAuthStateResolved(true);
      }
      return;
    }

    if (!signerObject) return;

    lastSuccessfulSignerKeyRef.current = signerKey;
    useAuthStore.getState().setSigner(signerObject);
    loadKeys(signerObject);

    const isAlreadyLoaded = localStorage.getItem("signer");
    if (
      !isAlreadyLoaded ||
      JSON.stringify(existingSigner) !== isAlreadyLoaded
    ) {
      localStorage.setItem("signer", JSON.stringify(existingSigner));

      const shouldReloadSigner = false;
      window.dispatchEvent(
        new CustomEvent("storage", { detail: { shouldReloadSigner } })
      );
    }
  }, []);

  useEffect(() => {
    const handleStorage = (
      event: Event & { detail?: { shouldReloadSigner?: boolean } }
    ) => {
      if (event.detail?.shouldReloadSigner === false) return;
      loadSigner();
    };

    window.addEventListener("storage", handleStorage);
    loadSigner();

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadSigner]);

  useEffect(() => {
    if (isLoggedIn) {
      const needsKeyMigration = needsMigration();
      if (needsKeyMigration) {
        const timer = setTimeout(() => {
          setShowMigrationModal(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [isLoggedIn]);

  // Set the newSigner factory on the store
  const newSigner = useCallback((type: string, args: any) => {
    switch (type.toLowerCase()) {
      case "nip46": {
        return new NostrNIP46Signer(args, challengeHandler);
      }
      case "nsec": {
        return new NostrNSecSigner(args, challengeHandler);
      }
      default:
      case "nip07": {
        return new NostrNIP07Signer(args);
      }
    }
  }, []);

  useEffect(() => {
    useAuthStore.getState().setNewSigner(newSigner);
  }, [newSigner]);

  return (
    <>
      <PassphraseChallengeModal
        actionOnSubmit={(passphrase: string, remind: boolean) => {
          if (challengeResolver) {
            challengeResolver({ res: passphrase, remind });
            const currentSigner = useAuthStore.getState().signer;
            if (currentSigner) loadKeys(currentSigner);
          }
        }}
        actionOnCancel={() => {
          if (abort) {
            abort();
          }
        }}
        error={error}
        isOpen={isPassphraseRequested}
        setIsOpen={setIsPassphraseRequested}
      />
      <AuthUrlChallengeModal
        actionOnCancel={() => {
          if (abort) {
            abort();
          }
        }}
        isOpen={isAuthChallengeRequested}
        setIsOpen={(value: boolean) => {
          setIsAuthChallengeRequested(value);
        }}
        error={error}
        challenge={authUrl}
      />
      <MigrationPromptModal
        isOpen={showMigrationModal}
        onClose={() => setShowMigrationModal(false)}
        onSuccess={() => {
          loadSigner();
        }}
      />
      {children}
    </>
  );
}

/**
 * NostrContextProvider — initializes the NostrManager in useAuthStore.
 * No longer uses React Context.
 */
export function NostrContextProvider({ children }: { children: ReactNode }) {
  const [nostr] = useState<NostrManager>(new NostrManager());

  // Set on the store immediately
  useEffect(() => {
    useAuthStore.getState().setNostr(nostr);
  }, [nostr]);

  const reload = useCallback(() => {
    const { readRelays, writeRelays, relays } = getLocalStorageData();
    nostr.addRelays([...writeRelays, ...relays, ...readRelays]);
  }, [nostr]);

  reload();
  useEffect(() => {
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("storage", reload);
    };
  }, [reload]);

  return <>{children}</>;
}

// ---- Backward-compatibility re-exports ----
// These are kept temporarily so that test files that import SignerContext
// and NostrContext still compile. They are no longer used by production code.
import { createContext } from "react";

/** @deprecated Use useAuthStore instead */
export const SignerContext = createContext({
  signer: {} as NostrSigner,
  isLoggedIn: false,
  isAuthStateResolved: false,
  pubkey: "",
  npub: "",
  newSigner: {},
} as any);

/** @deprecated Use useAuthStore instead */
export const NostrContext = createContext({
  nostr: {} as NostrManager,
} as any);
