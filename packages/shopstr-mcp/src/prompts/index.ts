import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "find-best-deal",
    {
      title: "Find Best Deal",
      description:
        "Find the best value product within a budget by combining product search and seller reputation.",
      argsSchema: {
        productType: z
          .string()
          .describe("Product type to search for, e.g. hardware wallet"),
        maxBudget: z
          .string()
          .min(1)
          .describe("Maximum budget in the selected currency"),
        currency: z
          .string()
          .describe("Currency code for budget filtering, e.g. USD or sats"),
      },
    },
    ({ productType, maxBudget, currency }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Find the best deal on "${productType}" within ${maxBudget} ${currency}.`,
              "",
              "Workflow:",
              `1. Use search_products with keyword "${productType}", maxPrice ${maxBudget}, and currency "${currency}".`,
              "2. Compare price, shipping cost, seller pubkey, and listing freshness.",
              "3. For the strongest candidates, call get_seller_reputation or get_reviews with sellerPubkey.",
              "4. Rank the top 3 by total value and seller trust.",
              "5. Clearly flag listings from sellers with no public reviews.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "compare-sellers",
    {
      title: "Compare Sellers",
      description:
        "Compare two or more Shopstr sellers by catalog, reviews, payment information, and reputation.",
      argsSchema: {
        sellerPubkeys: z
          .string()
          .describe("Comma-separated seller pubkeys as hex or npub1... values"),
      },
    },
    ({ sellerPubkeys }) => {
      const sellers = sellerPubkeys
        .split(",")
        .map((seller) => seller.trim())
        .filter(Boolean);

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: [
                `Compare these Shopstr sellers: ${sellers.join(", ")}`,
                "",
                "Workflow:",
                "1. Call get_company_details for each seller.",
                "2. Compare active listing count, price ranges, categories, free shipping, and review count.",
                "3. Use get_seller_reputation when a deeper trust summary is needed.",
                "4. Present a compact comparison table and explain which seller looks strongest for a buyer.",
              ].join("\n"),
            },
          },
        ],
      };
    }
  );

  server.registerPrompt(
    "check-seller-reputation",
    {
      title: "Check Seller Reputation",
      description:
        "Inspect a seller's public profile, catalog, listing age, and review reputation before purchase.",
      argsSchema: {
        seller: z.string().describe("Seller pubkey as hex or npub1..."),
      },
    },
    ({ seller }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Check whether seller "${seller}" looks trustworthy before buying.`,
              "",
              "Workflow:",
              "1. Call get_company_details with the seller pubkey.",
              "2. Call get_seller_reputation for the trust summary and recent reviews.",
              "3. Evaluate product count, oldest listing date, review count, rating breakdown, and missing-profile signals.",
              "4. Return a HIGH / MEDIUM / LOW / UNKNOWN trust assessment with concrete reasons.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "find-similar-products",
    {
      title: "Find Similar Products",
      description:
        "Find alternatives to a known product using category and price context.",
      argsSchema: {
        productReference: z
          .string()
          .describe("Product event id or product address to use as the seed"),
      },
    },
    ({ productReference }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Find products similar to "${productReference}".`,
              "",
              "Workflow:",
              "1. Call get_product_details using productId or productAddress as appropriate.",
              "2. Note category, currency, price, location, and seller pubkey.",
              "3. Search the same category with search_products, using a price window around the original when price is known.",
              "4. Exclude the original product from alternatives.",
              "5. Use get_seller_reputation for top alternatives when seller trust is important.",
              "6. Present alternatives sorted by best value.",
            ].join("\n"),
          },
        },
      ],
    })
  );
}
