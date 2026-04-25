import { NostrManager } from "./nostr-manager.js";
import { parseTags, ProductData } from "./parse-tags.js";

// Keep relay errors non-fatal.
process.on("unhandledRejection", (reason) => {
  process.stderr.write(`Relay connection issue (non-fatal): ${reason}\n`);
});

const RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
];

const FETCH_TIMEOUT_MS = 15_000; // 15s for initial fetch
const MAX_PRODUCTS = 50;

// Main
async function main() {
  console.log("Shopstr MCP Competency Test - Live Relay Fetch");
  console.log(`Relays: ${RELAYS.join(", ")}`);
  console.log(`Timeout: ${FETCH_TIMEOUT_MS}ms`);
  console.log();

  // Create NostrManager and connect to relays.
  const nostr = new NostrManager(RELAYS);

  try {
    // Fetch kind:30402 events from relays.
    console.log("Fetching kind:30402 events from relays...");
    const startTime = Date.now();

    const rawEvents = await nostr.fetch(
      [{ kinds: [30402] }],
      { onevent: () => {}, oneose: () => {} },
    );

    const fetchDuration = Date.now() - startTime;
    console.log(`Fetched ${rawEvents.length} raw events in ${fetchDuration}ms`);
    console.log();

    // Deduplicate by NIP-01 coordinate (30402:<pubkey>:<d-tag>).
    const coordMap = new Map<string, typeof rawEvents[0]>();
    for (const event of rawEvents) {
      const dTag = event.tags?.find((t) => t[0] === "d")?.[1];
      const coord = dTag ? `${event.pubkey}:${dTag}` : event.id;
      const existing = coordMap.get(coord);
      if (!existing || event.created_at > existing.created_at) {
        coordMap.set(coord, event);
      }
    }
    const uniqueEvents = Array.from(coordMap.values());
    console.log(`After dedup: ${uniqueEvents.length} unique listings (from ${rawEvents.length} raw events)`);
    console.log();

    // Parse into ProductData using parseTags().
    const products: ProductData[] = [];
    let parseFailures = 0;
    for (const event of uniqueEvents) {
      const parsed = parseTags(event);
      if (parsed && parsed.title) {
        products.push(parsed);
      } else {
        parseFailures++;
      }
    }
    console.log(`Parsed ${products.length} valid products (${parseFailures} failed/empty)`);
    console.log();

    const sample = products.slice(0, MAX_PRODUCTS);
    console.log(`Sample products (showing ${sample.length} of ${products.length})`);

    for (const product of sample) {
      console.log(`Title: ${product.title}`);
      console.log(`Price: ${product.price} ${product.currency}`);
      console.log(`Seller: ${product.pubkey.slice(0, 16)}...`);
      console.log(`Category: ${product.categories.length > 0 ? product.categories.join(", ") : "(none)"}`);
      console.log(`Location: ${product.location || "(none)"}`);
      console.log(`Shipping: ${product.shippingType || "N/A"} (cost: ${product.shippingCost ?? "N/A"})`);
      console.log(`Images: ${product.images.length}`);
      console.log(`d-tag: ${product.d || "(none)"}`);
      console.log(`Created: ${new Date(product.createdAt * 1000).toISOString()}`);
      if (product.condition) console.log(`Condition: ${product.condition}`);
      if (product.quantity !== undefined) console.log(`Quantity: ${product.quantity}`);
      if (product.sizes?.length) console.log(`Sizes: ${product.sizes.join(", ")}`);
      console.log("---");
    }

    // Field coverage analysis.
    console.log();
    console.log("Field coverage analysis (Task 2)");
    console.log(`Total products analyzed: ${products.length}`);
    console.log();

    const fieldCoverage = analyzeFieldCoverage(products);
    for (const [field, count] of fieldCoverage) {
      const pct = ((count / products.length) * 100).toFixed(1);
      console.log(`${field}: ${count}/${products.length} (${pct}%)`);
    }

    // Summary statistics
    console.log();
    console.log("Summary statistics");
    const sellers = new Set(products.map((p) => p.pubkey));
    const categories = new Map<string, number>();
    for (const p of products) {
      for (const cat of p.categories) {
        categories.set(cat, (categories.get(cat) || 0) + 1);
      }
    }
    const prices = products.map((p) => p.price).filter((p) => p > 0);
    const currencies = new Set(products.map((p) => p.currency).filter(Boolean));

    console.log(`Total listings: ${products.length}`);
    console.log(`Unique sellers: ${sellers.size}`);
    console.log(`Categories: ${categories.size}`);
    console.log(`Currencies seen: ${[...currencies].join(", ") || "(none)"}`);
    if (prices.length > 0) {
      console.log(`Price range: ${Math.min(...prices)} - ${Math.max(...prices)}`);
      console.log(`Median price: ${prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]}`);
    }
    console.log();
    console.log("Top 10 categories:");
    const sortedCats = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [cat, count] of sortedCats) {
      console.log(`  ${cat}: ${count} listings`);
    }

  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    nostr.close();
    console.log();
    console.log("Relay connections closed.");
    setTimeout(() => process.exit(0), 1000);
  }
}

// Count how often each field appears.
function analyzeFieldCoverage(products: ProductData[]): Map<string, number> {
  const fields = new Map<string, number>();

  const check = (name: string, test: (p: ProductData) => boolean) => {
    fields.set(name, products.filter(test).length);
  };

  // Always-present fields (set by parseTags from event metadata)
  check("id", (p) => !!p.id);
  check("pubkey", (p) => !!p.pubkey);
  check("createdAt", (p) => p.createdAt > 0);

  // Core product fields (from NIP-99 tags)
  check("title", (p) => !!p.title);
  check("summary", (p) => !!p.summary);
  check("price", (p) => p.price > 0);
  check("currency", (p) => !!p.currency);
  check("d (identifier)", (p) => !!p.d);
  check("images", (p) => p.images.length > 0);
  check("categories", (p) => p.categories.length > 0);
  check("location", (p) => !!p.location);

  // Shipping
  check("shippingType", (p) => !!p.shippingType);
  check("shippingCost", (p) => p.shippingCost !== undefined);

  // Optional/advanced fields
  check("publishedAt", (p) => !!p.publishedAt);
  check("condition", (p) => !!p.condition);
  check("status", (p) => !!p.status);
  check("quantity", (p) => p.quantity !== undefined);
  check("sizes", (p) => (p.sizes?.length ?? 0) > 0);
  check("volumes", (p) => (p.volumes?.length ?? 0) > 0);
  check("weights", (p) => (p.weights?.length ?? 0) > 0);
  check("bulkPrices", (p) => (p.bulkPrices?.size ?? 0) > 0);
  check("contentWarning", (p) => p.contentWarning === true);
  check("required", (p) => !!p.required);
  check("restrictions", (p) => !!p.restrictions);
  check("pickupLocations", (p) => (p.pickupLocations?.length ?? 0) > 0);
  check("expiration", (p) => p.expiration !== undefined);

  return fields;
}

main();
