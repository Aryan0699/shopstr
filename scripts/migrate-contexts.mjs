/**
 * Zustand migration script - replaces useContext patterns with Zustand store hooks.
 * Run with: node scripts/migrate-contexts.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = '/home/aryan/Desktop/shopstr/shopstr';
const SKIP = ['node_modules', '.next', '__tests__', 'scripts'];
const ALREADY_MIGRATED = ['_app.tsx', 'nostr-context-provider.tsx', 'use-auth-guard.ts', 'nav-top.tsx', 'marketplace.tsx', 'display-products.tsx', 'product-form.tsx', 'cart-invoice-card.tsx', 'product-invoice-card.tsx', 'display-product-modal.tsx'];

function walk(dir) {
  const results = [];
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (SKIP.some(s => full.includes(s))) continue;
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      results.push(full);
    }
  }
  return results;
}

function migrateFile(path) {
  let content = readFileSync(path, 'utf8');
  const original = content;
  const rel = relative(ROOT, path);
  
  if (ALREADY_MIGRATED.some(m => rel.endsWith(m))) return false;
  if (rel === 'pages/index.tsx') return false;
  if (!content.includes('useContext')) return false;
  
  const needsAuth = content.includes('SignerContext') || content.includes('NostrContext');
  const needsMarket = content.includes('ProductContext') || content.includes('ReviewsContext') || 
                       content.includes('ShopMapContext') || content.includes('ProfileMapContext');
  const needsSocial = content.includes('ChatsContext') || content.includes('FollowsContext') || 
                      content.includes('CommunityContext');
  const needsWallet = content.includes('CashuWalletContext') || content.includes('CartContext');
  const needsConfig = content.includes('RelaysContext') || content.includes('BlossomContext');
  
  if (!needsAuth && !needsMarket && !needsSocial && !needsWallet && !needsConfig) return false;
  
  // Remove old imports from context.ts (handle multi-line)
  content = content.replace(/import\s*\{[^}]*\}\s*from\s*["'](?:@\/utils\/context\/context|\.\.\/utils\/context\/context|\.\.\/\.\.\/utils\/context\/context|\.\.\/\.\.\/\.\.\/utils\/context\/context)["'];\s*\n?/gs, '');
  
  // Remove old imports from nostr-context-provider
  content = content.replace(/import\s*\{[^}]*\}\s*from\s*["'](?:@\/components\/utility-components\/nostr-context-provider|\.\.\/utility-components\/nostr-context-provider|\.\.\/\.\.\/utility-components\/nostr-context-provider|\.\.\/components\/utility-components\/nostr-context-provider)["'];\s*\n?/gs, '');
  
  // Build new import block
  const imports = [];
  if (needsAuth) imports.push('import { useAuthStore } from "@/utils/stores/auth-store";');
  if (needsMarket) imports.push('import { useMarketStore } from "@/utils/stores/market-store";');
  if (needsSocial) imports.push('import { useSocialStore } from "@/utils/stores/social-store";');
  if (needsWallet) imports.push('import { useWalletStore } from "@/utils/stores/wallet-store";');
  if (needsConfig) imports.push('import { useConfigStore } from "@/utils/stores/config-store";');
  
  // Insert after the last existing import
  const lastImportMatch = content.match(/^import .+$/gm);
  if (lastImportMatch) {
    const lastImport = lastImportMatch[lastImportMatch.length - 1];
    const lastIdx = content.lastIndexOf(lastImport);
    content = content.slice(0, lastIdx + lastImport.length) + '\n' + imports.join('\n') + content.slice(lastIdx + lastImport.length);
  }
  
  // ===== SignerContext replacements =====
  // Multi-line destructured patterns with newlines
  content = content.replace(/const\s*\{\s*signer,\s*isLoggedIn,\s*pubkey:\s*userPubkey,?\s*\}\s*=\s*\n?\s*useContext\(SignerContext\);/gs,
    `const signer = useAuthStore((s) => s.signer);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);\n  const userPubkey = useAuthStore((s) => s.pubkey);`);
  
  content = content.replace(/const\s*\{\s*isLoggedIn,\s*pubkey:\s*userPubkey,\s*signer,?\s*\}\s*=\s*\n?\s*useContext\(SignerContext\);/gs,
    `const isLoggedIn = useAuthStore((s) => s.isLoggedIn);\n  const userPubkey = useAuthStore((s) => s.pubkey);\n  const signer = useAuthStore((s) => s.signer);`);

  content = content.replace(/const\s*\{\s*signer,\s*pubkey:\s*userPubkey,\s*isLoggedIn,?\s*\}\s*=\s*\n?\s*useContext\(SignerContext\);/gs,
    `const signer = useAuthStore((s) => s.signer);\n  const userPubkey = useAuthStore((s) => s.pubkey);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);`);

  content = content.replace(/const\s*\{\s*pubkey:\s*userPubkey,\s*isLoggedIn,\s*signer,?\s*\}\s*=\s*\n?\s*useContext\(SignerContext\);/gs,
    `const userPubkey = useAuthStore((s) => s.pubkey);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);\n  const signer = useAuthStore((s) => s.signer);`);

  // signer, isLoggedIn, pubkey
  content = content.replace(/const\s*\{\s*signer,\s*isLoggedIn,\s*pubkey,?\s*\}\s*=\s*\n?\s*useContext\(SignerContext\);/gs,
    `const signer = useAuthStore((s) => s.signer);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);\n  const pubkey = useAuthStore((s) => s.pubkey);`);

  // signer, isAuthStateResolved, isLoggedIn
  content = content.replace(/const\s*\{\s*signer,\s*isAuthStateResolved,\s*isLoggedIn,?\s*\}\s*=\s*\n?\s*useContext\(SignerContext\);/gs,
    `const signer = useAuthStore((s) => s.signer);\n  const isAuthStateResolved = useAuthStore((s) => s.isAuthStateResolved);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);`);

  // Single-line patterns
  content = content.replace(/const\s*\{\s*pubkey:\s*userPubkey,\s*isLoggedIn\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const userPubkey = useAuthStore((s) => s.pubkey);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);`);
  content = content.replace(/const\s*\{\s*isLoggedIn,\s*pubkey:\s*userPubkey\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const isLoggedIn = useAuthStore((s) => s.isLoggedIn);\n  const userPubkey = useAuthStore((s) => s.pubkey);`);
  content = content.replace(/const\s*\{\s*signer,\s*isLoggedIn,\s*pubkey:\s*userPubkey\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const signer = useAuthStore((s) => s.signer);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);\n  const userPubkey = useAuthStore((s) => s.pubkey);`);
  content = content.replace(/const\s*\{\s*signer,\s*pubkey:\s*userPubkey\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const signer = useAuthStore((s) => s.signer);\n  const userPubkey = useAuthStore((s) => s.pubkey);`);
  content = content.replace(/const\s*\{\s*signer,\s*pubkey\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const signer = useAuthStore((s) => s.signer);\n  const pubkey = useAuthStore((s) => s.pubkey);`);
  content = content.replace(/const\s*\{\s*pubkey,\s*signer\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const pubkey = useAuthStore((s) => s.pubkey);\n  const signer = useAuthStore((s) => s.signer);`);
  content = content.replace(/const\s*\{\s*signer\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const signer = useAuthStore((s) => s.signer);`);
  content = content.replace(/const\s*\{\s*isLoggedIn\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const isLoggedIn = useAuthStore((s) => s.isLoggedIn);`);
  content = content.replace(/const\s*\{\s*pubkey\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const pubkey = useAuthStore((s) => s.pubkey);`);
  content = content.replace(/const\s*\{\s*pubkey:\s*userPubkey\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const userPubkey = useAuthStore((s) => s.pubkey);`);
  content = content.replace(/const\s*\{\s*pubkey:\s*usersPubkey\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const usersPubkey = useAuthStore((s) => s.pubkey);`);
  content = content.replace(/const\s*\{\s*newSigner\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const newSigner = useAuthStore((s) => s.newSigner);`);
  content = content.replace(/const\s*\{\s*signer,\s*isLoggedIn\s*\}\s*=\s*useContext\(SignerContext\);/g,
    `const signer = useAuthStore((s) => s.signer);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);`);

  // Multi-line signer destructuring with newlines between properties
  content = content.replace(/const\s*\{\n\s*signer,\n\s*isLoggedIn,\n\s*pubkey:\s*userPubkey,?\n?\s*\}\s*=\s*\n?\s*useContext\(SignerContext\);/gs,
    `const signer = useAuthStore((s) => s.signer);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);\n  const userPubkey = useAuthStore((s) => s.pubkey);`);

  // For user-profile form: { signer, pubkey: userPubkey, npub, isLoggedIn }
  content = content.replace(/const\s*\{\n?\s*signer,\n?\s*pubkey:\s*userPubkey,\n?\s*npub,\n?\s*isLoggedIn,?\n?\s*\}\s*=\s*\n?\s*useContext\(SignerContext\);/gs,
    `const signer = useAuthStore((s) => s.signer);\n  const userPubkey = useAuthStore((s) => s.pubkey);\n  const npub = useAuthStore((s) => s.npub);\n  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);`);

  // ===== NostrContext =====
  content = content.replace(/const\s*\{\s*nostr\s*\}\s*=\s*useContext\(NostrContext\);/g,
    `const nostr = useAuthStore((s) => s.nostr);`);
  content = content.replace(/const\s*\{\s*nostr:\s*nostrManager\s*\}\s*=\s*useContext\(NostrContext\);/g,
    `const nostrManager = useAuthStore((s) => s.nostr);`);

  // ===== ProductContext =====
  content = content.replace(/const\s*productEventContext\s*=\s*useContext\(ProductContext\);/g,
    `const productEventContext = {\n    productEvents: useMarketStore((s) => s.productEvents),\n    isLoading: useMarketStore((s) => s.isProductsLoading),\n    addNewlyCreatedProductEvent: useMarketStore.getState().addProduct,\n    removeDeletedProductEvent: useMarketStore.getState().removeProduct,\n  };`);
  content = content.replace(/const\s*productContext\s*=\s*useContext\(ProductContext\);/g,
    `const productContext = {\n    productEvents: useMarketStore((s) => s.productEvents),\n    isLoading: useMarketStore((s) => s.isProductsLoading),\n    addNewlyCreatedProductEvent: useMarketStore.getState().addProduct,\n    removeDeletedProductEvent: useMarketStore.getState().removeProduct,\n  };`);

  // ===== ReviewsContext =====
  content = content.replace(/const\s*reviewsContext\s*=\s*useContext\(ReviewsContext\);/g,
    `const reviewsContext = {\n    merchantReviewsData: useMarketStore((s) => s.merchantReviewsData),\n    productReviewsData: useMarketStore((s) => s.productReviewsData),\n    isLoading: useMarketStore((s) => s.isReviewsLoading),\n    updateMerchantReviewsData: useMarketStore.getState().updateMerchantReview,\n    updateProductReviewsData: useMarketStore.getState().updateProductReview,\n  };`);

  // ===== ShopMapContext =====
  content = content.replace(/const\s*shopMapContext\s*=\s*useContext\(ShopMapContext\);/g,
    `const shopMapContext = {\n    shopData: useMarketStore((s) => s.shopData),\n    isLoading: useMarketStore((s) => s.isShopsLoading),\n    updateShopData: useMarketStore.getState().updateShop,\n  };`);
  content = content.replace(/const\s*shopContext\s*=\s*useContext\(ShopMapContext\);/g,
    `const shopContext = {\n    shopData: useMarketStore((s) => s.shopData),\n    isLoading: useMarketStore((s) => s.isShopsLoading),\n    updateShopData: useMarketStore.getState().updateShop,\n  };`);

  // ===== ProfileMapContext =====
  content = content.replace(/const\s*profileMapContext\s*=\s*useContext\(ProfileMapContext\);/g,
    `const profileMapContext = {\n    profileData: useMarketStore((s) => s.profileData),\n    isLoading: useMarketStore((s) => s.isProfilesLoading),\n    updateProfileData: useMarketStore.getState().updateProfile,\n  };`);
  content = content.replace(/const\s*profileContext\s*=\s*useContext\(ProfileMapContext\);/g,
    `const profileContext = {\n    profileData: useMarketStore((s) => s.profileData),\n    isLoading: useMarketStore((s) => s.isProfilesLoading),\n    updateProfileData: useMarketStore.getState().updateProfile,\n  };`);

  // ===== ChatsContext =====
  content = content.replace(/const\s*chatsContext\s*=\s*useContext\(ChatsContext\);/g,
    `const chatsContext = {\n    chatsMap: useSocialStore((s) => s.chatsMap),\n    isLoading: useSocialStore((s) => s.isChatsLoading),\n    addNewlyCreatedMessageEvent: (msg: any, sent?: boolean) => useSocialStore.getState().addMessage(msg, sent),\n    markAllMessagesAsRead: async () => { useSocialStore.getState().markAllRead(); return [] as string[]; },\n    newOrderIds: useSocialStore((s) => s.newOrderIds),\n  };`);

  // ===== FollowsContext =====
  content = content.replace(/const\s*followsContext\s*=\s*useContext\(FollowsContext\);/g,
    `const followsContext = {\n    followList: useSocialStore((s) => s.followList),\n    firstDegreeFollowsLength: useSocialStore((s) => s.firstDegreeFollowsLength),\n    isLoading: useSocialStore((s) => s.isFollowsLoading),\n  };`);

  // ===== RelaysContext =====
  content = content.replace(/const\s*relaysContext\s*=\s*useContext\(RelaysContext\);/g,
    `const relaysContext = {\n    relayList: useConfigStore((s) => s.relayList),\n    readRelayList: useConfigStore((s) => s.readRelayList),\n    writeRelayList: useConfigStore((s) => s.writeRelayList),\n    isLoading: useConfigStore((s) => s.isRelaysLoading),\n  };`);

  // ===== BlossomContext =====
  content = content.replace(/const\s*blossomContext\s*=\s*useContext\(BlossomContext\);/g,
    `const blossomContext = {\n    blossomServers: useConfigStore((s) => s.blossomServers),\n    isLoading: useConfigStore((s) => s.isBlossomLoading),\n  };`);

  // ===== CashuWalletContext =====
  content = content.replace(/const\s*walletContext\s*=\s*useContext\(CashuWalletContext\);/g,
    `const walletContext = {\n    proofEvents: useWalletStore((s) => s.proofEvents),\n    cashuMints: useWalletStore((s) => s.cashuMints),\n    cashuProofs: useWalletStore((s) => s.cashuProofs),\n    isLoading: useWalletStore((s) => s.isWalletLoading),\n  };`);

  // ===== CommunityContext =====
  content = content.replace(/const\s*\{\s*communities,\s*isLoading\s*\}\s*=\s*useContext\(CommunityContext\);/g,
    `const communities = useSocialStore((s) => s.communities);\n  const isLoading = useSocialStore((s) => s.isCommunitiesLoading);`);
  content = content.replace(/const\s*\{\s*communities,\s*isLoading:\s*isCommunitiesLoading\s*\}\s*=\s*useContext\(CommunityContext\);/g,
    `const communities = useSocialStore((s) => s.communities);\n  const isCommunitiesLoading = useSocialStore((s) => s.isCommunitiesLoading);`);
  content = content.replace(/const\s*\{\s*communities\s*\}\s*=\s*useContext\(CommunityContext\);/g,
    `const communities = useSocialStore((s) => s.communities);`);
  content = content.replace(/const\s*communityContext\s*=\s*useContext\(CommunityContext\);/g,
    `const communityContext = {\n    communities: useSocialStore((s) => s.communities),\n    posts: useSocialStore((s) => s.posts),\n    isLoading: useSocialStore((s) => s.isCommunitiesLoading),\n    addCommunity: useSocialStore.getState().addCommunity,\n  };`);
  
  // Community: { communities, addCommunity }
  content = content.replace(/const\s*\{\s*communities,\s*addCommunity\s*\}\s*=\s*useContext\(CommunityContext\);/g,
    `const communities = useSocialStore((s) => s.communities);\n  const addCommunity = useSocialStore((s) => s.addCommunity);`);
  
  // Community: { communities, posts, isLoading }
  content = content.replace(/const\s*\{\s*communities,\s*posts,\s*isLoading\s*\}\s*=\s*useContext\(CommunityContext\);/g,
    `const communities = useSocialStore((s) => s.communities);\n  const posts = useSocialStore((s) => s.posts);\n  const isLoading = useSocialStore((s) => s.isCommunitiesLoading);`);
  
  // ===== CartContext =====
  content = content.replace(/const\s*cartContext\s*=\s*useContext\(CartContext\);/g,
    `const cartContext = {\n    cartAddresses: useWalletStore((s) => s.cartAddresses),\n    isLoading: useWalletStore((s) => s.isCartLoading),\n  };`);

  // Remove useContext from React imports if no longer needed
  if (!content.includes('useContext(')) {
    content = content.replace(/,\s*useContext\s*,/g, ',');
    content = content.replace(/,\s*useContext\s*}/g, ' }');
    content = content.replace(/\{\s*useContext\s*,/g, '{');
    content = content.replace(/\{\s*useContext\s*\}/g, '{ }');
    content = content.replace(/import\s*\{\s*\}\s*from\s*"react";\s*\n/g, '');
  }
  
  if (content !== original) {
    writeFileSync(path, content);
    console.log(`  ✅ ${rel}`);
    return true;
  }
  return false;
}

const files = walk(ROOT);
let migrated = 0;
console.log('Starting Zustand migration...\n');
for (const f of files) {
  if (migrateFile(f)) migrated++;
}
console.log(`\nMigrated ${migrated} files total.`);

// Report remaining useContext usage
console.log('\nRemaining useContext calls:');
for (const f of files) {
  const content = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f);
  if (content.includes('useContext(') && !rel.includes('__tests__') && !rel.includes('nostr-context-provider')) {
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (line.includes('useContext(')) {
        console.log(`  ${rel}:${i+1}: ${line.trim()}`);
      }
    });
  }
}
