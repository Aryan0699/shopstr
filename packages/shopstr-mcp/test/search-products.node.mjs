import assert from "node:assert/strict";
import test from "node:test";

import { handleSearchProducts } from "../dist/tools/search-products.js";

const hex = (char) => char.repeat(64);

function productEvent(overrides = {}) {
  return {
    id: hex("a"),
    pubkey: hex("b"),
    created_at: 100,
    kind: 30402,
    tags: [
      ["d", "product"],
      ["title", "Hardware Wallet"],
      ["summary", "Cold storage wallet"],
      ["price", "40", "USD"],
      ["t", "Electronics"],
      ["location", "NYC"],
    ],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

function context(eventsByRelay) {
  return {
    relays: Object.keys(eventsByRelay),
    timeoutMs: 100,
    nostr: {
      async fetch(_filters, _params, relayUrls) {
        const relay = relayUrls[0];
        const result = eventsByRelay[relay];
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

test("search_products filters, deduplicates, budgets, and reports relay degradation", async () => {
  const goodRelay = "wss://good.example.com";
  const badRelay = "wss://bad.example.com";
  const response = await handleSearchProducts(
    {
      keyword: "wallet",
      maxPrice: 50,
      currency: "USD",
    },
    context({
      [goodRelay]: [
        productEvent({
          id: hex("1"),
          created_at: 10,
          tags: [
            ["d", "wallet"],
            ["title", "Old Hardware Wallet"],
            ["summary", "Older model"],
            ["price", "45", "USD"],
            ["t", "Electronics"],
          ],
        }),
        productEvent({
          id: hex("2"),
          created_at: 20,
          tags: [
            ["d", "wallet"],
            ["title", "New Hardware Wallet"],
            ["summary", "Newer model"],
            ["price", "40", "USD"],
            ["t", "Electronics"],
          ],
        }),
        productEvent({
          id: hex("3"),
          created_at: 30,
          tags: [
            ["d", "expensive-wallet"],
            ["title", "Premium Wallet"],
            ["summary", "Too expensive"],
            ["price", "500", "USD"],
            ["t", "Electronics"],
          ],
        }),
      ],
      [badRelay]: new Error("relay down"),
    })
  );

  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, undefined);
  assert.equal(response.resultCount, 1);
  assert.equal(body.count, 1);
  assert.equal(body.products[0].id, hex("2"));
  assert.equal(body.products[0].price, 40);
  assert.equal(body._meta.degraded, true);
  assert.deepEqual(body._meta.relaysSucceeded, [goodRelay]);
  assert.equal(body._meta.relaysFailed[0].url, badRelay);
});

test("search_products requires currency with price filters", async () => {
  const response = await handleSearchProducts(
    { maxPrice: 50 },
    context({ "wss://relay.example.com": [] })
  );
  const body = JSON.parse(response.content[0].text);

  assert.equal(response.isError, true);
  assert.equal(body.errorCode, "VALIDATION_ERROR");
});
