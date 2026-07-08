import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { loadConfig } from "../dist/config.js";
import { createMcpServer } from "../dist/server.js";

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
      ["t", "Bitcoin"],
      ["published_at", "2026-01-01T00:00:00.000Z"],
    ],
    content: "",
    sig: "c".repeat(128),
    ...overrides,
  };
}

async function closeTransport(transport) {
  if (typeof transport.close === "function") {
    await transport.close();
  } else if (typeof transport.dispose === "function") {
    await transport.dispose();
  }
}

async function withClient(eventsByRelay, fn) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "shopstr-mcp-test", version: "0.0.0" });
  let fetchCount = 0;
  const server = createMcpServer(
    loadConfig({
      SHOPSTR_MCP_RELAYS: Object.keys(eventsByRelay).join(","),
      SHOPSTR_MCP_RESOURCE_CACHE_TTL_MS: "60000",
    }),
    {
      nostr: {
        async fetch(_filters, _params, relayUrls) {
          fetchCount += 1;
          const relay = relayUrls[0];
          const result = eventsByRelay[relay];
          if (result instanceof Error) throw result;
          return result ?? [];
        },
        async close() {},
      },
      logger: {
        warn() {},
      },
    }
  );

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await fn(client, () => fetchCount);
  } finally {
    await client.close();
    await server.close();
    await closeTransport(clientTransport);
    await closeTransport(serverTransport);
  }
}

test("lists market summary and category resources", async () => {
  await withClient({ "wss://relay.example.com": [] }, async (client) => {
    const result = await client.listResources();
    const resources = result.resources
      .map((resource) => ({
        name: resource.name,
        uri: resource.uri,
        mimeType: resource.mimeType,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    assert.deepEqual(resources, [
      {
        name: "market-categories",
        uri: "shopstr://market/categories",
        mimeType: "application/json",
      },
      {
        name: "market-summary",
        uri: "shopstr://market/summary",
        mimeType: "application/json",
      },
    ]);
  });
});

test("market summary excludes hidden listings and reports compact aggregates", async () => {
  const goodRelay = "wss://good.example.com";
  const badRelay = "wss://bad.example.com";

  await withClient(
    {
      [goodRelay]: [
        productEvent({
          id: hex("1"),
          pubkey: hex("b"),
          created_at: 100,
          tags: [
            ["d", "wallet"],
            ["title", "Hardware Wallet"],
            ["price", "40", "USD"],
            ["t", "Electronics"],
            ["t", "Bitcoin"],
          ],
        }),
        productEvent({
          id: hex("2"),
          pubkey: hex("c"),
          created_at: 200,
          tags: [
            ["d", "coffee"],
            ["title", "Coffee Beans"],
            ["price", "15", "USD"],
            ["t", "Food"],
          ],
        }),
        productEvent({
          id: hex("3"),
          pubkey: hex("d"),
          created_at: 300,
          tags: [
            ["d", "hidden"],
            ["title", "Hidden Listing"],
            ["price", "5", "USD"],
            ["t", "Electronics"],
            ["visibility", "hidden"],
          ],
        }),
        productEvent({
          id: hex("4"),
          pubkey: hex("e"),
          created_at: 250,
          tags: [
            ["d", "book"],
            ["title", "Bitcoin Book"],
            ["price", "1000", "sats"],
            ["t", "Bitcoin"],
          ],
        }),
      ],
      [badRelay]: new Error("relay down"),
    },
    async (client, getFetchCount) => {
      const result = await client.readResource({
        uri: "shopstr://market/summary",
      });
      const body = JSON.parse(result.contents[0].text);

      assert.equal(body.totalListings, 3);
      assert.equal(body.activeSellers, 3);
      assert.deepEqual(body.topCategories, [
        { category: "Bitcoin", listings: 2 },
        { category: "Electronics", listings: 1 },
        { category: "Food", listings: 1 },
      ]);
      assert.deepEqual(body.priceRanges, {
        USD: { min: 15, max: 40, median: 27.5 },
        sats: { min: 1000, max: 1000, median: 1000 },
      });
      assert.equal(body.newestListing, "1970-01-01T00:04:10.000Z");
      assert.equal(body._meta.degraded, true);
      assert.deepEqual(body._meta.relaysSucceeded, [goodRelay]);
      assert.equal(body._meta.relaysFailed[0].url, badRelay);

      await client.readResource({ uri: "shopstr://market/summary" });
      assert.equal(getFetchCount(), 2, "second read should use resource cache");
    }
  );
});

test("market categories returns category index with cache isolation per resource", async () => {
  const relay = "wss://relay.example.com";

  await withClient(
    {
      [relay]: [
        productEvent({
          id: hex("1"),
          tags: [
            ["d", "wallet"],
            ["title", "Hardware Wallet"],
            ["price", "40", "USD"],
            ["t", "Electronics"],
            ["t", "Bitcoin"],
          ],
        }),
        productEvent({
          id: hex("2"),
          tags: [
            ["d", "book"],
            ["title", "Bitcoin Book"],
            ["price", "10", "USD"],
            ["t", "Books"],
            ["t", "Bitcoin"],
          ],
        }),
      ],
    },
    async (client, getFetchCount) => {
      const result = await client.readResource({
        uri: "shopstr://market/categories",
      });
      const body = JSON.parse(result.contents[0].text);

      assert.equal(body.count, 3);
      assert.deepEqual(body.categories, [
        { category: "Bitcoin", listings: 2 },
        { category: "Books", listings: 1 },
        { category: "Electronics", listings: 1 },
      ]);
      assert.equal(body._meta._truncated, false);

      await client.readResource({ uri: "shopstr://market/categories" });
      assert.equal(getFetchCount(), 1, "second read should use resource cache");
    }
  );
});
