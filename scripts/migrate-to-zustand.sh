#!/usr/bin/env bash
# Bulk migration script for Shopstr: Context API -> Zustand stores
# This script handles the mechanical import/usage replacements across all consumer files.

set -euo pipefail
cd /home/aryan/Desktop/shopstr/shopstr

# Find all .tsx and .ts files that still use useContext (excluding tests, node_modules, .next, and already-migrated files)
FILES=$(grep -rl "useContext" --include="*.tsx" --include="*.ts" \
  | grep -v "node_modules" \
  | grep -v "__tests__" \
  | grep -v ".next" \
  | grep -v "nostr-context-provider.tsx" \
  | grep -v "_app.tsx" \
  | grep -v "use-auth-guard.ts" \
  | grep -v "nav-top.tsx" \
  | grep -v "pages/index.tsx" \
  | sort)

echo "=== Files to migrate ==="
echo "$FILES"
echo ""
echo "=== Total: $(echo "$FILES" | wc -l) files ==="
echo ""

for f in $FILES; do
  echo "--- Processing: $f ---"
  
  # Step 1: Replace context imports from @/utils/context/context
  # Remove the entire import block from context.ts and replace with store imports
  
  # Collect which contexts are used in this file
  USES_PRODUCT=$(grep -c "ProductContext" "$f" || true)
  USES_REVIEWS=$(grep -c "ReviewsContext" "$f" || true)
  USES_SHOPMAP=$(grep -c "ShopMapContext" "$f" || true)
  USES_PROFILEMAP=$(grep -c "ProfileMapContext" "$f" || true)
  USES_CHATS=$(grep -c "ChatsContext" "$f" || true)
  USES_FOLLOWS=$(grep -c "FollowsContext" "$f" || true)
  USES_RELAYS=$(grep -c "RelaysContext" "$f" || true)
  USES_BLOSSOM=$(grep -c "BlossomContext" "$f" || true)
  USES_CASHU=$(grep -c "CashuWalletContext" "$f" || true)
  USES_COMMUNITY=$(grep -c "CommunityContext" "$f" || true)
  USES_SIGNER=$(grep -c "SignerContext" "$f" || true)
  USES_NOSTR=$(grep -c "NostrContext" "$f" || true)
  USES_CART=$(grep -c "CartContext" "$f" || true)
  
  # Build the new store imports we need
  STORE_IMPORTS=""
  
  if [ "$USES_SIGNER" -gt 0 ] || [ "$USES_NOSTR" -gt 0 ]; then
    STORE_IMPORTS="${STORE_IMPORTS}import { useAuthStore } from \"@/utils/stores/auth-store\";\n"
  fi
  
  if [ "$USES_PRODUCT" -gt 0 ] || [ "$USES_REVIEWS" -gt 0 ] || [ "$USES_SHOPMAP" -gt 0 ] || [ "$USES_PROFILEMAP" -gt 0 ]; then
    STORE_IMPORTS="${STORE_IMPORTS}import { useMarketStore } from \"@/utils/stores/market-store\";\n"
  fi
  
  if [ "$USES_CHATS" -gt 0 ] || [ "$USES_FOLLOWS" -gt 0 ] || [ "$USES_COMMUNITY" -gt 0 ]; then
    STORE_IMPORTS="${STORE_IMPORTS}import { useSocialStore } from \"@/utils/stores/social-store\";\n"
  fi
  
  if [ "$USES_CASHU" -gt 0 ] || [ "$USES_CART" -gt 0 ]; then
    STORE_IMPORTS="${STORE_IMPORTS}import { useWalletStore } from \"@/utils/stores/wallet-store\";\n"
  fi
  
  if [ "$USES_RELAYS" -gt 0 ] || [ "$USES_BLOSSOM" -gt 0 ]; then
    STORE_IMPORTS="${STORE_IMPORTS}import { useConfigStore } from \"@/utils/stores/config-store\";\n"
  fi
  
  if [ -z "$STORE_IMPORTS" ]; then
    echo "  No contexts used, skipping"
    continue
  fi
  
  # Remove old context import lines
  # Remove imports from @/utils/context/context (handles multi-line imports)
  perl -i -0777 -pe 's/import\s*\{[^}]*\}\s*from\s*"@\/utils\/context\/context";\n?//gs' "$f"
  perl -i -0777 -pe 's/import\s*\{[^}]*\}\s*from\s*"\.\.\/utils\/context\/context";\n?//gs' "$f"
  perl -i -0777 -pe 's/import\s*\{[^}]*\}\s*from\s*"\.\.\/\.\.\/utils\/context\/context";\n?//gs' "$f"
  
  # Remove imports from nostr-context-provider  
  perl -i -0777 -pe 's/import\s*\{[^}]*\}\s*from\s*"@\/components\/utility-components\/nostr-context-provider";\n?//gs' "$f"
  perl -i -0777 -pe 's/import\s*\{\n[^}]*\}\s*from\s*"@\/components\/utility-components\/nostr-context-provider";\n?//gs' "$f"
  
  # Add store imports after the first import line
  # Find the line number of the first import and add after
  FIRST_IMPORT_LINE=$(grep -n "^import " "$f" | head -1 | cut -d: -f1)
  if [ -n "$FIRST_IMPORT_LINE" ]; then
    sed -i "${FIRST_IMPORT_LINE}a\\${STORE_IMPORTS}" "$f"
  fi
  
  # Step 2: Replace useContext calls with store selectors
  
  # SignerContext replacements
  if [ "$USES_SIGNER" -gt 0 ]; then
    # Pattern: const { pubkey: userPubkey, isLoggedIn } = useContext(SignerContext);
    sed -i 's/const { pubkey: userPubkey, isLoggedIn } = useContext(SignerContext);/const userPubkey = useAuthStore((s) => s.pubkey);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);/g' "$f"
    
    # Pattern: const { pubkey: userPubkey, isLoggedIn: loggedIn } = useContext(SignerContext);
    sed -i 's/const { pubkey: userPubkey, isLoggedIn: loggedIn } =$/  const userPubkey = useAuthStore((s) => s.pubkey);/g' "$f"
    sed -i 's/    useContext(SignerContext);/  const loggedIn = useAuthStore((s) => s.isLoggedIn);/g' "$f"
    
    # Pattern: const { isLoggedIn, pubkey: userPubkey } = useContext(SignerContext);
    sed -i 's/const { isLoggedIn, pubkey: userPubkey } = useContext(SignerContext);/const isLoggedIn = useAuthStore((s) => s.isLoggedIn);\n  const userPubkey = useAuthStore((s) => s.pubkey);/g' "$f"
    
    # Pattern: const { signer, isLoggedIn, pubkey: userPubkey } = useContext(SignerContext);
    sed -i 's/const { signer, isLoggedIn, pubkey: userPubkey } = useContext(SignerContext);/const signer = useAuthStore((s) => s.signer);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);\n  const userPubkey = useAuthStore((s) => s.pubkey);/g' "$f"
    
    # Pattern: const { signer } = useContext(SignerContext);
    sed -i 's/const { signer } = useContext(SignerContext);/const signer = useAuthStore((s) => s.signer);/g' "$f"
    
    # Pattern: const { signer, pubkey } = useContext(SignerContext);
    sed -i 's/const { signer, pubkey } = useContext(SignerContext);/const signer = useAuthStore((s) => s.signer);\n  const pubkey = useAuthStore((s) => s.pubkey);/g' "$f"
    
    # Pattern: const { pubkey, signer } = useContext(SignerContext);
    sed -i 's/const { pubkey, signer } = useContext(SignerContext);/const pubkey = useAuthStore((s) => s.pubkey);\n  const signer = useAuthStore((s) => s.signer);/g' "$f"
    
    # Pattern: const { newSigner } = useContext(SignerContext);
    sed -i 's/const { newSigner } = useContext(SignerContext);/const newSigner = useAuthStore((s) => s.newSigner);/g' "$f"
    
    # Pattern: const { isLoggedIn } = useContext(SignerContext);
    sed -i 's/const { isLoggedIn } = useContext(SignerContext);/const isLoggedIn = useAuthStore((s) => s.isLoggedIn);/g' "$f"
    
    # Pattern: const { pubkey } = useContext(SignerContext);
    sed -i 's/const { pubkey } = useContext(SignerContext);/const pubkey = useAuthStore((s) => s.pubkey);/g' "$f"
    
    # Pattern: const { pubkey: userPubkey } = useContext(SignerContext);
    sed -i 's/const { pubkey: userPubkey } = useContext(SignerContext);/const userPubkey = useAuthStore((s) => s.pubkey);/g' "$f"

    # Pattern: const { isLoggedIn, pubkey: userPubkey, signer } = useContext(SignerContext);
    sed -i 's/const { isLoggedIn, pubkey: userPubkey, signer } = useContext(SignerContext);/const isLoggedIn = useAuthStore((s) => s.isLoggedIn);\n  const userPubkey = useAuthStore((s) => s.pubkey);\n  const signer = useAuthStore((s) => s.signer);/g' "$f"
  fi
  
  # NostrContext replacements
  if [ "$USES_NOSTR" -gt 0 ]; then
    sed -i 's/const { nostr } = useContext(NostrContext);/const nostr = useAuthStore((s) => s.nostr);/g' "$f"
    sed -i 's/const { nostr: nostrManager } = useContext(NostrContext);/const nostrManager = useAuthStore((s) => s.nostr);/g' "$f"
  fi
  
  # ProductContext replacements
  if [ "$USES_PRODUCT" -gt 0 ]; then
    sed -i 's/const productEventContext = useContext(ProductContext);/const productEventContext = useMarketStore.getState();\n  \/\/ Note: productEventContext.productEvents -> from store/g' "$f"
    sed -i 's/const productContext = useContext(ProductContext);/const productContext = {\n    productEvents: useMarketStore((s) => s.productEvents),\n    isLoading: useMarketStore((s) => s.isProductsLoading),\n    addNewlyCreatedProductEvent: useMarketStore((s) => s.addProduct),\n    removeDeletedProductEvent: useMarketStore((s) => s.removeProduct),\n  };/g' "$f"
  fi
  
  # ReviewsContext replacements
  if [ "$USES_REVIEWS" -gt 0 ]; then
    sed -i 's/const reviewsContext = useContext(ReviewsContext);/const reviewsContext = {\n    merchantReviewsData: useMarketStore((s) => s.merchantReviewsData),\n    productReviewsData: useMarketStore((s) => s.productReviewsData),\n    isLoading: useMarketStore((s) => s.isReviewsLoading),\n    updateMerchantReviewsData: useMarketStore((s) => s.updateMerchantReview),\n    updateProductReviewsData: useMarketStore((s) => s.updateProductReview),\n  };/g' "$f"
  fi
  
  # ShopMapContext replacements
  if [ "$USES_SHOPMAP" -gt 0 ]; then
    sed -i 's/const shopMapContext = useContext(ShopMapContext);/const shopMapContext = {\n    shopData: useMarketStore((s) => s.shopData),\n    isLoading: useMarketStore((s) => s.isShopsLoading),\n    updateShopData: useMarketStore((s) => s.updateShop),\n  };/g' "$f"
    sed -i 's/const shopContext = useContext(ShopMapContext);/const shopContext = {\n    shopData: useMarketStore((s) => s.shopData),\n    isLoading: useMarketStore((s) => s.isShopsLoading),\n    updateShopData: useMarketStore((s) => s.updateShop),\n  };/g' "$f"
  fi
  
  # ProfileMapContext replacements  
  if [ "$USES_PROFILEMAP" -gt 0 ]; then
    sed -i 's/const profileMapContext = useContext(ProfileMapContext);/const profileMapContext = {\n    profileData: useMarketStore((s) => s.profileData),\n    isLoading: useMarketStore((s) => s.isProfilesLoading),\n    updateProfileData: useMarketStore((s) => s.updateProfile),\n  };/g' "$f"
    sed -i 's/const profileContext = useContext(ProfileMapContext);/const profileContext = {\n    profileData: useMarketStore((s) => s.profileData),\n    isLoading: useMarketStore((s) => s.isProfilesLoading),\n    updateProfileData: useMarketStore((s) => s.updateProfile),\n  };/g' "$f"
  fi
  
  # ChatsContext replacements
  if [ "$USES_CHATS" -gt 0 ]; then
    sed -i 's/const chatsContext = useContext(ChatsContext);/const chatsContext = {\n    chatsMap: useSocialStore((s) => s.chatsMap),\n    isLoading: useSocialStore((s) => s.isChatsLoading),\n    addNewlyCreatedMessageEvent: (msg: any, sent?: boolean) => { const store = useSocialStore.getState(); store.addMessage(msg, sent); },\n    markAllMessagesAsRead: async () => { useSocialStore.getState().markAllRead(); return [] as string[]; },\n    newOrderIds: useSocialStore((s) => s.newOrderIds),\n  };/g' "$f"
  fi
  
  # FollowsContext replacements
  if [ "$USES_FOLLOWS" -gt 0 ]; then
    sed -i 's/const followsContext = useContext(FollowsContext);/const followsContext = {\n    followList: useSocialStore((s) => s.followList),\n    firstDegreeFollowsLength: useSocialStore((s) => s.firstDegreeFollowsLength),\n    isLoading: useSocialStore((s) => s.isFollowsLoading),\n  };/g' "$f"
  fi
  
  # RelaysContext replacements
  if [ "$USES_RELAYS" -gt 0 ]; then
    sed -i 's/const relaysContext = useContext(RelaysContext);/const relaysContext = {\n    relayList: useConfigStore((s) => s.relayList),\n    readRelayList: useConfigStore((s) => s.readRelayList),\n    writeRelayList: useConfigStore((s) => s.writeRelayList),\n    isLoading: useConfigStore((s) => s.isRelaysLoading),\n  };/g' "$f"
  fi
  
  # CashuWalletContext replacements
  if [ "$USES_CASHU" -gt 0 ]; then
    sed -i 's/const walletContext = useContext(CashuWalletContext);/const walletContext = {\n    proofEvents: useWalletStore((s) => s.proofEvents),\n    cashuMints: useWalletStore((s) => s.cashuMints),\n    cashuProofs: useWalletStore((s) => s.cashuProofs),\n    isLoading: useWalletStore((s) => s.isWalletLoading),\n  };/g' "$f"
  fi
  
  # CommunityContext replacements
  if [ "$USES_COMMUNITY" -gt 0 ]; then
    sed -i 's/const { communities, isLoading } = useContext(CommunityContext);/const communities = useSocialStore((s) => s.communities);\n  const isLoading = useSocialStore((s) => s.isCommunitiesLoading);/g' "$f"
    sed -i 's/const { communities } = useContext(CommunityContext);/const communities = useSocialStore((s) => s.communities);/g' "$f"
    sed -i 's/const { communities, isLoading } = useContext(CommunityContext);/const communities = useSocialStore((s) => s.communities);\n  const isLoading = useSocialStore((s) => s.isCommunitiesLoading);/g' "$f"
    sed -i 's/const communityContext = useContext(CommunityContext);/const communityContext = {\n    communities: useSocialStore((s) => s.communities),\n    posts: useSocialStore((s) => s.posts),\n    isLoading: useSocialStore((s) => s.isCommunitiesLoading),\n    addCommunity: useSocialStore((s) => s.addCommunity),\n  };/g' "$f"
  fi

  # Remove useContext from react import if no more useContext calls remain
  REMAINING=$(grep -c "useContext" "$f" || true)
  if [ "$REMAINING" -eq 0 ]; then
    sed -i 's/, useContext,/,/g' "$f"
    sed -i 's/useContext, //g' "$f"
    sed -i 's/, useContext//g' "$f"
    sed -i 's/{ useContext }/{ }/g' "$f"
  fi
  
  echo "  Done (contexts used: P=$USES_PRODUCT R=$USES_REVIEWS S=$USES_SHOPMAP Pr=$USES_PROFILEMAP Ch=$USES_CHATS F=$USES_FOLLOWS Re=$USES_RELAYS B=$USES_BLOSSOM Ca=$USES_CASHU Co=$USES_COMMUNITY Si=$USES_SIGNER N=$USES_NOSTR)"
done

echo ""
echo "=== Migration complete ==="
echo ""
echo "Remaining useContext usage:"
grep -rn "useContext" --include="*.tsx" --include="*.ts" \
  | grep -v "node_modules" \
  | grep -v "__tests__" \
  | grep -v ".next" \
  | grep -v "nostr-context-provider" || echo "  None! All migrated."
