import { z } from "zod";

import { mergeAndDeduplicateProducts } from "../dedup.js";
import {
  MCP_ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
  type ToolTextResponse,
} from "../errors.js";
import { parseProductEvent } from "../parse-tags.js";
import { fetchFromRelays } from "../relay-fetch.js";
import type { NostrFilter } from "../types.js";
import { productIdInputSchema } from "../validation.js";
import {
  PRODUCT_KIND,
  allRelaysFailed,
  buildToolMeta,
  createRelayUnavailableResponse,
  createValidationErrorResponse,
  getDataFreshness,
} from "./common.js";
import type { CoreToolContext } from "./context.js";

export const getProductDetailsInputSchema = {
  productId: z.string().describe("The product event ID as 64-character hex"),
};

export async function handleGetProductDetails(
  args: Record<string, unknown>,
  context: CoreToolContext
): Promise<ToolTextResponse> {
  const parsed = productIdInputSchema.safeParse(args);
  if (!parsed.success) return createValidationErrorResponse(parsed.error);

  const { productId } = parsed.data;
  const relayFilter: NostrFilter = {
    kinds: [PRODUCT_KIND],
    ids: [productId],
  };
  const relayResult = await fetchFromRelays(
    context.nostr,
    context.relays,
    [relayFilter],
    { timeoutMs: context.timeoutMs }
  );
  const meta = buildToolMeta(relayResult.meta, {
    hints: [
      "Use search_products with keyword, category, or location filters to discover product IDs.",
    ],
  });

  if (allRelaysFailed(relayResult.meta)) {
    return createRelayUnavailableResponse(relayResult.meta);
  }

  const event = mergeAndDeduplicateProducts(relayResult.events).find(
    (productEvent) => productEvent.id === productId
  );
  if (!event) {
    return createErrorResponse(
      "Product not found.",
      MCP_ERROR_CODES.NOT_FOUND,
      false,
      undefined,
      meta
    );
  }

  const product = parseProductEvent(event);
  const successMeta = buildToolMeta(relayResult.meta, {
    resultCount: 1,
    totalMatches: 1,
    truncated: false,
    dataFreshness: getDataFreshness([product]),
    hints: [],
  });

  return createSuccessResponse({ product }, successMeta, 1);
}
