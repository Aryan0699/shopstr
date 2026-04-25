# Competency Test: Shopstr NIP-99 Read Path

## What I Did

I extracted Shopstr's two core read-path components - `parseTags()` and `NostrManager` - into a standalone Node.js script that connects to public Nostr relays, fetches live marketplace listings, and prints structured `ProductData` objects.

---

## How to Run

```bash
npx tsx competency-test/fetch-products.ts
```

---

## What Was Extracted

### `NostrManager` → `competency-test/nostr-manager.ts`

**Original:** `utils/nostr/nostr-manager.ts`

I copied the full `NostrManager` class and made two changes to make it run in Node.js:

1. **Removed browser-only signer imports.** The original imports `NostrNIP07Signer` which calls `window.nostr` -  crashes in Node.js. Since we only need to *read* from relays (no signing), I removed all three signer imports and the `signerFrom()` factory method.
2. **Inlined `newPromiseWithTimeout()`.** This timeout wrapper lived in `utils/timeout.ts` behind an `@/` path alias that only works inside Next.js. I copied it directly into the file.

Everything else - `SimplePool`, `.fetch()`, `.subscribe()`, event verification via `verifyEvent()`, relay keep-alive, garbage collection - is unchanged.

### `parseTags()` → `competency-test/parse-tags.ts`

**Original:** `utils/parsers/product-parser-functions.ts`

I copied the full `parseTags()` function and `ProductData` type, and inlined three small dependencies:

1. **`calculateTotalCost()`** - Originally imported from `components/utility-components/display-monetary-info.tsx` (a React component file). The actual function is just `price + (shippingCost || 0)`. I inlined it to avoid pulling in React.
2. **`parseShippingTag()`** - Originally in `utils/parsers/product-tag-helpers.ts`. Pure function, copied as-is.
3. **`SHIPPING_OPTIONS`** - A 5-string constant from `utils/STATIC-VARIABLES.ts`.

The parsing logic itself is identical to the original.

---

## Helper Functions

| Component | File | What It Does |
|:---|:---|:---|
| `NostrManager` | `utils/nostr/nostr-manager.ts` | Relay connection manager. Wraps `nostr-tools` `SimplePool` with subscription lifecycle, timeout, keep-alive, and automatic `verifyEvent()` on all incoming events. |
| `parseTags()` | `utils/parsers/product-parser-functions.ts` | The canonical NIP-99 tag parser. Converts a raw `kind: 30402` event into a `ProductData` object with 40+ typed fields. |
| `ProductData` type | `utils/parsers/product-parser-functions.ts` | The structured type used throughout Shopstr for products. |
| `parseShippingTag()` | `utils/parsers/product-tag-helpers.ts` | Parses the shipping tag format. |
| `SHIPPING_OPTIONS` | `utils/STATIC-VARIABLES.ts` | Allowlist of valid shipping types. |
| `productSatisfiesAllFilters()` | `utils/parsers/product-filter-helpers.ts` | Client-side filter predicates for search, category, location, and price. |
| `fetch-service.ts` | `utils/nostr/fetch-service.ts` | High-level fetch orchestrators used by the Next.js app. Combines DB caching with relay fetching - not directly usable in standalone. |

---

## Results

Running the script against 3 public relays (`wss://nos.lol`, `wss://relay.damus.io`, `wss://relay.nostr.band`):

- **759 raw events** fetched in ~6 seconds
- **740 valid products** after parsing (19 had missing/empty tags)
- **360 unique sellers**, **261 categories**, **13 different currencies**

---

## Field Coverage: Which ProductData Fields Are Populated on Live Listings

### Always Present (>95%)

| Field | Coverage | Notes |
|:---|:---|:---|
| `id`, `pubkey`, `createdAt` | 100% | From event metadata, not tags - always available |
| `title` | 100% | Every valid listing has a title |
| `d` (identifier) | 99.7% | Required for replaceable events |
| `categories` | 97.7% | Most sellers tag their products |

### Usually Present (50–95%)

| Field | Coverage | Notes |
|:---|:---|:---|
| `currency` | 87.0% | A few listings have malformed price tags |
| `price` | 85.5% | Some listings set price to 0 or leave it empty |
| `summary` | 77.3% | Most sellers write descriptions |
| `images` | 50.9% | About half of listings include images |

### Often Absent (<50%)

| Field | Coverage | Notes |
|:---|:---|:---|
| `publishedAt` | 29.3% | Rarely set by Nostr clients |
| `location` | 19.6% | Many sellers skip location |
| `status` | 17.7% | Only some clients set this |
| `shippingType` / `shippingCost` | 2.3% | Very few listings use the modern shipping tag format |
| `condition`, `quantity`, `sizes`, `volumes`, `weights`, `bulkPrices` | <2% | Used only by specific product types |
| `contentWarning`, `required`, `restrictions`, `pickupLocations`, `expiration` | <1% | Almost never used |

### What This Means for MCP Tools

When building tool responses, I should always include `title`, `price`, `currency`, and `pubkey` (guaranteed present). Fields like `location`, `shipping`, and `condition` should be shown when available but gracefully omitted when absent - never return `undefined` or `null` to an AI agent.

---

## Summary Statistics

Based on the 740 listings, here is a breakdown of the marketplace data:

| Metric | Value |
|:---|:---|
| **Total Listings** | 740 |
| **Unique Sellers** | 360 |
| **Total Categories** | 261 |
| **Currencies Seen** | sats, SAT, EUR, USD, SATS, negotiable, sat, NMC, BRL, GBP, MegaDollas, BTC, BCH |
| **Price Range** | 0.18406 – 5,000,000,000 |
| **Median Price** | 1,000 |

### Top 10 Categories

1. **Bitcoin** (261 listings)
2. **dev** (255 listings)
3. **mercasats** (80 listings)
4. **p2p** (77 listings)
5. **nostr** (27 listings)
6. **Art** (25 listings)
7. **GameMod** (21 listings)
8. **shopstr** (21 listings)
9. **Home & Technology** (20 listings)
10. **GameMod** (19 listings)
