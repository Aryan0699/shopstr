import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { mergeAndDeduplicateProducts } from "../dedup.js";
import { parseProductEvent } from "../parse-tags.js";
import { fetchFromRelays, type RelayFetchClient } from "../relay-fetch.js";
import type { ProductResponse, RelayFetchMeta } from "../types.js";
import {
  PRODUCT_KIND,
  allRelaysFailed,
  buildToolMeta,
  getDataFreshness,
} from "../tools/utils/common.js";

export type ResourceContext = {
  nostr: RelayFetchClient;
  relays: string[];
  timeoutMs: number;
  cacheTtlMs: number;
};

type ResourceCacheEntry = {
  expiresAt: number;
  text: string;
};

type MarketData = {
  products: ProductResponse[];
  meta: RelayFetchMeta;
};

const MARKET_SUMMARY_URI = "shopstr://market/summary";
const MARKET_CATEGORIES_URI = "shopstr://market/categories";
const MARKET_RESOURCE_FETCH_LIMIT = 500;
const CATEGORY_RESPONSE_LIMIT = 100;
const SUMMARY_CATEGORY_LIMIT = 10;

export function registerResources(
  server: McpServer,
  context: ResourceContext
): void {
  const cache = new Map<string, ResourceCacheEntry>();

  server.registerResource(
    "market-summary",
    MARKET_SUMMARY_URI,
    {
      title: "Shopstr Market Summary",
      description:
        "Compact marketplace overview with listing count, seller count, top categories, and price ranges.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: await cachedText(cache, uri.toString(), context, async () =>
            JSON.stringify(await buildMarketSummary(context), null, 2)
          ),
        },
      ],
    })
  );

  server.registerResource(
    "market-categories",
    MARKET_CATEGORIES_URI,
    {
      title: "Shopstr Market Categories",
      description:
        "Token-light category index with listing counts for targeted search_products calls.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: await cachedText(cache, uri.toString(), context, async () =>
            JSON.stringify(await buildMarketCategories(context), null, 2)
          ),
        },
      ],
    })
  );
}

async function cachedText(
  cache: Map<string, ResourceCacheEntry>,
  key: string,
  context: ResourceContext,
  compute: () => Promise<string>
): Promise<string> {
  if (context.cacheTtlMs > 0) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.text;
  }

  const text = await compute();
  if (context.cacheTtlMs > 0) {
    cache.set(key, {
      text,
      expiresAt: Date.now() + context.cacheTtlMs,
    });
  }
  return text;
}

async function fetchMarketData(context: ResourceContext): Promise<MarketData> {
  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [{ kinds: [PRODUCT_KIND], limit: MARKET_RESOURCE_FETCH_LIMIT }],
    { timeoutMs: context.timeoutMs }
  );
  const products = mergeAndDeduplicateProducts(relayResult.events)
    .map(parseProductEvent)
    .filter((product) => product.visibility !== "hidden");

  return {
    products,
    meta: relayResult.meta,
  };
}

async function buildMarketSummary(context: ResourceContext): Promise<{
  totalListings: number;
  activeSellers: number;
  topCategories: Array<{ category: string; listings: number }>;
  priceRanges: Record<string, { min: number; max: number; median: number }>;
  newestListing: string | null;
  _meta: Record<string, unknown>;
  _hint: string;
}> {
  const { products, meta } = await fetchMarketData(context);

  return {
    totalListings: products.length,
    activeSellers: new Set(products.map((product) => product.pubkey)).size,
    topCategories: getCategoryCounts(products).slice(0, SUMMARY_CATEGORY_LIMIT),
    priceRanges: getPriceRanges(products),
    newestListing: getDataFreshness(products),
    _meta: buildToolMeta(meta, {
      resultCount: products.length,
      totalMatches: products.length,
      truncated: false,
      dataFreshness: getDataFreshness(products),
      hints: allRelaysFailed(meta)
        ? ["All configured relays failed; market summary may be empty."]
        : [
            "Use search_products for targeted product discovery, or get_company_details for seller context.",
          ],
    }),
    _hint:
      "Use search_products with category/currency filters to inspect listings, or get_company_details for seller info.",
  };
}

async function buildMarketCategories(context: ResourceContext): Promise<{
  count: number;
  categories: Array<{ category: string; listings: number }>;
  _meta: Record<string, unknown>;
  _hint: string;
}> {
  const { products, meta } = await fetchMarketData(context);
  const allCategories = getCategoryCounts(products);
  const categories = allCategories.slice(0, CATEGORY_RESPONSE_LIMIT);

  return {
    count: categories.length,
    categories,
    _meta: buildToolMeta(meta, {
      resultCount: categories.length,
      totalMatches: allCategories.length,
      truncated: categories.length < allCategories.length,
      dataFreshness: getDataFreshness(products),
      hints: allRelaysFailed(meta)
        ? ["All configured relays failed; category list may be empty."]
        : ["Pass a category value to search_products({ category }) to narrow product search."],
    }),
    _hint:
      "Pass any category value to search_products({ category: '...' }) to fetch matching listings.",
  };
}

function getCategoryCounts(
  products: readonly ProductResponse[]
): Array<{ category: string; listings: number }> {
  const counts = new Map<string, { category: string; listings: number }>();

  for (const product of products) {
    for (const category of product.categories) {
      const normalized = category.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.listings += 1;
      } else {
        counts.set(key, { category: normalized, listings: 1 });
      }
    }
  }

  return Array.from(counts.values()).sort(
    (a, b) => b.listings - a.listings || a.category.localeCompare(b.category)
  );
}

function getPriceRanges(
  products: readonly ProductResponse[]
): Record<string, { min: number; max: number; median: number }> {
  const byCurrency = new Map<string, number[]>();

  for (const product of products) {
    if (
      product.priceStatus !== "known" ||
      product.price === undefined ||
      !product.currency
    ) {
      continue;
    }
    const prices = byCurrency.get(product.currency) ?? [];
    prices.push(product.price);
    byCurrency.set(product.currency, prices);
  }

  return Object.fromEntries(
    Array.from(byCurrency.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, prices]) => [
        currency,
        {
          min: Math.min(...prices),
          max: Math.max(...prices),
          median: median(prices),
        },
      ])
  );
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}
