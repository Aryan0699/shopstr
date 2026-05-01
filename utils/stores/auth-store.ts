import { create } from "zustand";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";

export interface AuthState {
  // Signer state (replaces SignerContext)
  signer?: NostrSigner;
  isLoggedIn: boolean;
  isAuthStateResolved: boolean;
  pubkey?: string;
  npub?: string;
  newSigner?: (type: string, args: any) => NostrSigner;

  // Nostr manager state (replaces NostrContext)
  nostr?: NostrManager;

  // Challenge modal state (needed by AuthModals component)
  isPassphraseRequested: boolean;
  isAuthChallengeRequested: boolean;
  authUrl: string;
  challengeResolver?: (res: any) => void;
  challengeError?: Error;
  challengeAbort: () => void;
  showMigrationModal: boolean;
}

export interface AuthActions {
  // Signer actions
  setSigner: (signer: NostrSigner | undefined) => void;
  setPubkey: (pubkey: string | undefined) => void;
  setNpub: (npub: string | undefined) => void;
  setIsLoggedIn: (isLoggedIn: boolean) => void;
  setIsAuthStateResolved: (isResolved: boolean) => void;
  setNewSigner: (fn: (type: string, args: any) => NostrSigner) => void;

  // Nostr manager actions
  setNostr: (nostr: NostrManager) => void;

  // Challenge modal actions
  setIsPassphraseRequested: (requested: boolean) => void;
  setIsAuthChallengeRequested: (requested: boolean) => void;
  setAuthUrl: (url: string) => void;
  setChallengeResolver: (resolver: ((res: any) => void) | undefined) => void;
  setChallengeError: (error: Error | undefined) => void;
  setChallengeAbort: (abort: () => void) => void;
  setShowMigrationModal: (show: boolean) => void;
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  // Initial state
  signer: undefined,
  isLoggedIn: false,
  isAuthStateResolved: false,
  pubkey: undefined,
  npub: undefined,
  newSigner: undefined,
  nostr: undefined,
  isPassphraseRequested: false,
  isAuthChallengeRequested: false,
  authUrl: "",
  challengeResolver: undefined,
  challengeError: undefined,
  challengeAbort: () => {},
  showMigrationModal: false,

  // Signer actions
  setSigner: (signer) => set({ signer, isLoggedIn: !!(signer) }),
  setPubkey: (pubkey) =>
    set((state) => ({ pubkey, isLoggedIn: !!(state.signer && pubkey) })),
  setNpub: (npub) => set({ npub }),
  setIsLoggedIn: (isLoggedIn) => set({ isLoggedIn }),
  setIsAuthStateResolved: (isAuthStateResolved) =>
    set({ isAuthStateResolved }),
  setNewSigner: (fn) => set({ newSigner: fn }),

  // Nostr manager actions
  setNostr: (nostr) => set({ nostr }),

  // Challenge modal actions
  setIsPassphraseRequested: (isPassphraseRequested) =>
    set({ isPassphraseRequested }),
  setIsAuthChallengeRequested: (isAuthChallengeRequested) =>
    set({ isAuthChallengeRequested }),
  setAuthUrl: (authUrl) => set({ authUrl }),
  setChallengeResolver: (challengeResolver) => set({ challengeResolver }),
  setChallengeError: (challengeError) => set({ challengeError }),
  setChallengeAbort: (challengeAbort) => set({ challengeAbort }),
  setShowMigrationModal: (showMigrationModal) => set({ showMigrationModal }),
}));
