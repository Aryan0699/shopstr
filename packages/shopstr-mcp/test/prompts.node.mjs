import assert from "node:assert/strict";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { loadConfig } from "../dist/config.js";
import { createMcpServer } from "../dist/server.js";

async function closeTransport(transport) {
  if (typeof transport.close === "function") {
    await transport.close();
  } else if (typeof transport.dispose === "function") {
    await transport.dispose();
  }
}

async function withClient(fn) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "shopstr-mcp-test", version: "0.0.0" });
  const server = createMcpServer(
    loadConfig({ SHOPSTR_MCP_RELAYS: "wss://relay.example.com" }),
    {
      nostr: {
        async fetch() {
          return [];
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
    await fn(client);
  } finally {
    await client.close();
    await server.close();
    await closeTransport(clientTransport);
    await closeTransport(serverTransport);
  }
}

function promptText(result) {
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].content.type, "text");
  return result.messages[0].content.text;
}

test("lists PR5 guided shopping prompts", async () => {
  await withClient(async (client) => {
    const result = await client.listPrompts();
    const prompts = result.prompts
      .map((prompt) => ({
        name: prompt.name,
        args: prompt.arguments?.map((arg) => arg.name).sort() ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    assert.deepEqual(prompts, [
      {
        name: "check-seller-reputation",
        args: ["seller"],
      },
      {
        name: "compare-sellers",
        args: ["sellerPubkeys"],
      },
      {
        name: "find-best-deal",
        args: ["currency", "maxBudget", "productType"],
      },
      {
        name: "find-similar-products",
        args: ["productReference"],
      },
    ]);
  });
});

test("find-best-deal prompt guides product search and reputation checks", async () => {
  await withClient(async (client) => {
    const result = await client.getPrompt({
      name: "find-best-deal",
      arguments: {
        productType: "hardware wallet",
        maxBudget: "100",
        currency: "USD",
      },
    });
    const text = promptText(result);

    assert.match(text, /search_products/);
    assert.match(text, /maxPrice 100/);
    assert.match(text, /currency "USD"/);
    assert.match(text, /get_seller_reputation|get_reviews/);
  });
});

test("seller prompts guide profile and reputation tool usage", async () => {
  await withClient(async (client) => {
    const compare = await client.getPrompt({
      name: "compare-sellers",
      arguments: {
        sellerPubkeys: "a".repeat(64) + "," + "b".repeat(64),
      },
    });
    const reputation = await client.getPrompt({
      name: "check-seller-reputation",
      arguments: {
        seller: "a".repeat(64),
      },
    });

    assert.match(promptText(compare), /get_company_details/);
    assert.match(promptText(compare), /comparison table/);
    assert.match(promptText(reputation), /get_seller_reputation/);
    assert.match(promptText(reputation), /HIGH \/ MEDIUM \/ LOW \/ UNKNOWN/);
  });
});

test("find-similar-products prompt chains details, search, and reputation", async () => {
  await withClient(async (client) => {
    const result = await client.getPrompt({
      name: "find-similar-products",
      arguments: {
        productReference: "30402:" + "a".repeat(64) + ":wallet",
      },
    });
    const text = promptText(result);

    assert.match(text, /get_product_details/);
    assert.match(text, /search_products/);
    assert.match(text, /Exclude the original product/);
    assert.match(text, /get_seller_reputation/);
  });
});
